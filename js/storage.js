// storage.js. Camada de persistência Local-First (padrão Adapter + IndexedDB)
// ------------------------------------------------------------------------------
// ARQUITETURA (pensada para virar cloud no futuro sem tocar na UI):
//
//   app.js / import.js / insights.js      (consumidores; só falam com o Façade)
//              │
//              ▼
//   FinanceStore  ....................... Façade + cache em memória + fila de escrita
//              │
//              ├── espelho síncrono (localStorage) .....; rede de segurança anti-perda
//              ▼
//   StorageAdapter (contrato)  ......... IndexedDBAdapter | LocalStorageAdapter | CloudAdapter
//
// O app inteiro continua lendo um objeto síncrono em memória (snapshot), enquanto
// a escrita acontece em IndexedDB de forma assíncrona, incremental (só o que mudou)
// e serializada. Para migrar para nuvem, basta implementar um novo adapter com os
// mesmos 5 métodos e registrá-lo em FinanceStore.use(adapter).
"use strict";

const DB_NAME = "financas_db";
const DB_VERSION = 3;   // v3. Fila de sincronização ("outbox") e metadados por escopo
const LEGACY_KEY = "financas_pro_v2";     // storage antigo (localStorage)
const LS_FALLBACK_KEY = "financas_db_fallback";
const LS_MIRROR_KEY = "financas_db_mirror";   // espelho síncrono anti-perda
const LS_UNDO_KEY = "financas_db_undo";       // snapshot antes de um restore destrutivo

// ------------------------------------------------------------------------------
// ESCOPO DE ARMAZENAMENTO (isolamento por conta)
// ------------------------------------------------------------------------------
// Antes existia UM banco por navegador. Duas contas no mesmo aparelho liam e
// gravavam nos mesmos registros: quem entrasse depois via o extrato de quem
// entrou antes, e o logout não removia nada porque não havia nada a remover:
// os dados nunca tinham sido separados.
//
// Agora cada conta tem seu próprio banco físico, com nome derivado do `userId`
// devolvido pelo servidor. O escopo "guest" mantém o nome ANTIGO (`financas_db`)
// de propósito: é onde os dados de quem já usava o app sem conta continuam, sem
// migração nem risco de perda. Entrar numa conta NÃO importa esses dados; isso
// exige confirmação explícita (ver `FinanceStore.adoptScope`).
const GUEST_SCOPE = "guest";
const SCOPE_PATTERN = /^(guest|u_[A-Za-z0-9_-]{1,64})$/;

// O `userId` vem do servidor (uuid do Supabase). Sanitizamos porque ele vira
// nome de banco e chave de localStorage: qualquer caractere fora da lista
// abaixo seria uma porta para colidir escopos de contas diferentes.
function storageScopeFor(userId) {
  const raw = String(userId == null ? "" : userId).trim();
  if (!raw) return GUEST_SCOPE;
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return safe ? `u_${safe}` : GUEST_SCOPE;
}

function normalizeStorageScope(scope) {
  const value = String(scope == null ? "" : scope).trim();
  return SCOPE_PATTERN.test(value) ? value : GUEST_SCOPE;
}

// Nomes físicos. O escopo visitante mantém os nomes históricos; qualquer outro
// ganha sufixo. É isso que garante compatibilidade com bases já existentes.
function scopedName(base, scope) {
  const normalized = normalizeStorageScope(scope);
  return normalized === GUEST_SCOPE ? base : `${base}__${normalized}`;
}

// O escopo da última sessão fica lembrado para o app abrir JÁ no banco certo,
// sem esperar a resposta do servidor. Sem isso, um aparelho offline abriria
// como visitante e qualquer lançamento feito antes da rede voltar cairia no
// banco errado.
const ACTIVE_SCOPE_KEY = "cofre_active_scope";

function rememberedStorageScope() {
  try { return normalizeStorageScope(localStorage.getItem(ACTIVE_SCOPE_KEY)); }
  catch (e) { return GUEST_SCOPE; }
}

function rememberStorageScope(scope) {
  const normalized = normalizeStorageScope(scope);
  try {
    if (normalized === GUEST_SCOPE) localStorage.removeItem(ACTIVE_SCOPE_KEY);
    else localStorage.setItem(ACTIVE_SCOPE_KEY, normalized);
  } catch (e) { /* armazenamento bloqueado; o escopo vale só para esta sessão */ }
  return normalized;
}

// ------------------------------------------------------------------------------
// RELÓGIO LÓGICO HÍBRIDO (HLC); ordem de escrita entre aparelhos
// ------------------------------------------------------------------------------
// O conflito era decidido por `updatedAt`, que é a hora do celular de quem
// gravou. Um aparelho com o relógio adiantado uma hora ganhava TODAS as
// disputas, inclusive contra edições feitas depois dele; um atrasado perdia
// edições que acabara de fazer. Não é um caso raro: relógio errado em celular
// é comum, e fuso/horário de verão mudam de um lado só.
//
// O HLC resolve porque ele nunca anda para trás e sempre supera o que já viu:
// se este aparelho LEU uma alteração remota, a próxima escrita dele é
// necessariamente maior que ela, mesmo com o relógio atrasado. O empate final
// sai pelo id do aparelho, então os dois lados chegam ao MESMO vencedor sem
// precisar conversar.
//
// Formato: "<ms com 15 dígitos>.<contador com 6>.<aparelho>". Largura fixa para
// que a comparação de texto simples (a < b) já seja a comparação correta.
const HLC_PATTERN = /^\d{15}\.\d{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const HLC_MAX_DRIFT_MS = 24 * 60 * 60 * 1000;   // 24h: além disso o relógio remoto é ignorado

const SyncClock = (() => {
  let lastMillis = 0;
  let counter = 0;
  let deviceId = "device";

  function setDevice(id) {
    const safe = String(id || "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 80);
    if (safe) deviceId = safe;
    return deviceId;
  }

  function format(millis, count, device) {
    return `${String(millis).padStart(15, "0")}.${String(count).padStart(6, "0")}.${device}`;
  }

  function parse(rev) {
    if (typeof rev !== "string" || !HLC_PATTERN.test(rev)) return null;
    const dot1 = rev.indexOf(".");
    const dot2 = rev.indexOf(".", dot1 + 1);
    return {
      millis: Number(rev.slice(0, dot1)),
      counter: Number(rev.slice(dot1 + 1, dot2)),
      device: rev.slice(dot2 + 1),
    };
  }

  // Escrita local: avança o relógio e devolve a marca desta alteração.
  function tick() {
    const now = Date.now();
    if (now > lastMillis) { lastMillis = now; counter = 0; }
    else counter += 1;
    return format(lastMillis, counter, deviceId);
  }

  // Leitura remota: absorve a marca do outro aparelho para que a PRÓXIMA
  // escrita local seja maior que ela. É este passo que torna o relógio errado
  // irrelevante. Marcas absurdamente à frente são ignoradas para que um
  // aparelho quebrado não empurre o relógio de todo mundo para 2090.
  function observe(rev) {
    const parsed = parse(rev);
    if (!parsed) return false;
    const now = Date.now();
    if (parsed.millis > now + HLC_MAX_DRIFT_MS) return false;
    if (parsed.millis > lastMillis) { lastMillis = parsed.millis; counter = parsed.counter; }
    else if (parsed.millis === lastMillis && parsed.counter > counter) counter = parsed.counter;
    return true;
  }

  // Estado do relógio precisa sobreviver ao fechamento da aba: sem isso, um
  // recarregamento zera o contador e a escrita seguinte perde para a anterior.
  function state() { return { millis: lastMillis, counter }; }
  function restore(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const millis = Number(src.millis);
    const count = Number(src.counter);
    if (Number.isFinite(millis) && millis > lastMillis && millis <= Date.now() + HLC_MAX_DRIFT_MS) {
      lastMillis = millis;
      counter = Number.isFinite(count) ? Math.max(0, Math.min(999999, count)) : 0;
    }
  }

  function reset() { lastMillis = 0; counter = 0; }

  return { setDevice, tick, observe, parse, state, restore, reset, device: () => deviceId };
})();

function isSyncRev(value) { return typeof value === "string" && HLC_PATTERN.test(value); }

// Comparação total e determinística. Devolve true quando `a` é a alteração mais
// recente. Registro sem marca perde para registro com marca: quem tem marca
// passou pela versão nova do app, logo é a informação mais confiável.
function syncRevGreater(a, b) {
  const va = isSyncRev(a) ? a : "";
  const vb = isSyncRev(b) ? b : "";
  if (va && vb) return va > vb;
  return !!va && !vb;
}

// Marca de fallback para registros que vêm de bases antigas, importação ou
// backup: deriva de `updatedAt` para preservar a ordem histórica conhecida.
function syncRevFromDate(value, device) {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return "";
  const safe = String(device || "legacy").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 80) || "legacy";
  return `${String(ts).padStart(15, "0")}.${String(0).padStart(6, "0")}.${safe}`;
}

function normalizeSyncRev(value) { return isSyncRev(value) ? value : ""; }

// Mesma chave usada pelo cadastro de aparelhos (auth.js). O relógio lógico
// precisa de um identificador estável para o desempate final; se cada aba
// sorteasse o seu, duas abas do mesmo navegador nunca empatariam igual.
function syncDeviceId() {
  try {
    const value = localStorage.getItem("cofre_device_id");
    if (/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(value || "")) return value;
  } catch (e) { /* armazenamento bloqueado */ }
  return "device-local";
}
const SCHEMA_VERSION = 22;  // v22; privacidade, consentimentos e controles do usuário
const LEGAL_REVIEW_DATE = "2026-08-18";
// A versão sobe quando o CONTEÚDO do texto muda, não quando muda a redação.
// Esta subiu porque a política passou a declarar controlador, retenção,
// direitos do titular e canal de incidentes, e porque a versão anterior ainda
// afirmava que a sincronização não estava ativa. Quem aceitou a anterior
// aceitou outra coisa, então o aceite precisa ser pedido de novo.
const LEGAL_TEXT_VERSION = "2026-08-18.1";
const MIRROR_MAX_BYTES = 3 * 1024 * 1024;
const MIRROR_THROTTLE_MS = 1200;

// Marcador dos campos que só o dono do aplicativo pode preencher. Fica visível
// de propósito: uma política que inventa controlador ou canal de atendimento é
// pior que uma que diz em voz alta o que ainda falta. `check-release.js` trata
// a presença do marcador como impedimento de oferta ao público.
const LEGAL_PENDING = "[definir antes da oferta ao público]";

// Identificação do controlador (LGPD art. 9, I e art. 41) e canais de contato.
// `responseDays` é o prazo de resposta ao titular do art. 19, II.
const LEGAL_CONTROLLER = {
  name: LEGAL_PENDING,
  document: LEGAL_PENDING,
  address: LEGAL_PENDING,
  supportEmail: LEGAL_PENDING,
  dpoName: LEGAL_PENDING,
  dpoEmail: LEGAL_PENDING,
  incidentEmail: LEGAL_PENDING,
  responseDays: 15,
};

const LEGAL_CONTROLLER_FIELDS = {
  name: "nome empresarial ou responsável",
  document: "CPF ou CNPJ",
  address: "endereço",
  supportEmail: "canal de atendimento",
  dpoName: "encarregado pelos dados",
  dpoEmail: "contato do encarregado",
  incidentEmail: "canal de comunicação de incidentes",
};

// Campos do controlador ainda em aberto. Lista vazia significa identificação
// completa, e só então o app pode parar de se declarar versão local.
function legalControllerGaps(controller) {
  const source = controller && typeof controller === "object" ? controller : LEGAL_CONTROLLER;
  return Object.keys(LEGAL_CONTROLLER_FIELDS)
    .filter((campo) => {
      const valor = String(source[campo] == null ? "" : source[campo]).trim();
      return valor === "" || valor === LEGAL_PENDING;
    })
    .map((campo) => LEGAL_CONTROLLER_FIELDS[campo]);
}

function legalControllerReady(controller) {
  return legalControllerGaps(controller).length === 0;
}

// Prazos de retenção lidos do código que os aplica, não de estimativa. O
// `scope` separa o que fica no aparelho do que só passa a existir com conta
// ligada, porque a resposta honesta para "por quanto tempo" depende disso.
const LEGAL_RETENTION = [
  { scope: "local", label: "Dados financeiros e preferências", term: "Enquanto o app estiver instalado. Nada expira sozinho: some ao apagar em Privacidade ou ao limpar o navegador." },
  { scope: "local", label: "Cópia local de recuperação", term: "Reescrita a cada gravação, com teto de 3 MB. Apagada junto com os dados financeiros." },
  { scope: "local", label: "Diagnóstico de erros", term: "30 dias e no máximo 50 ocorrências. Guarda data, área, código, versão e estado de conexão; nunca conteúdo." },
  { scope: "conta", label: "Cadastro e sessão", term: "Enquanto a conta existir. O cookie de acesso vale 1 hora, o de renovação 30 dias e o que identifica o aparelho 365 dias." },
  { scope: "conta", label: "Registro de sincronização", term: "Uma linha por registro, sempre a mais recente. Marcas de exclusão são podadas depois de 24 meses." },
  { scope: "conta", label: "Versões restauráveis", term: "As 5 mais recentes. Criar a sexta apaga a mais antiga." },
  { scope: "conta", label: "Controle de envio repetido", term: "30 dias. Existe para a mesma alteração não ser aplicada duas vezes." },
  { scope: "conta", label: "Limite de tentativas", term: "1 dia. Guarda um código derivado por HMAC, não o email nem o endereço de origem." },
  { scope: "conta", label: "Exclusão da conta", term: "A purga apaga sincronização, versões, aparelhos e cadastro no mesmo ato, antes de remover o usuário. Se ela falhar, a exclusão é abortada em vez de deixar resto no servidor." },
];

// Direitos do art. 18. `selfService` marca o que o app já resolve sem pedido:
// prometer atendimento humano para o que o botão já faz seria burocracia
// inventada, e o contrário seria promessa vazia.
const LEGAL_SUBJECT_RIGHTS = [
  { law: "art. 18, I e II", title: "Confirmação e acesso", detail: "Tudo o que existe sobre você aparece nas telas e sai completo no backup JSON.", selfService: true },
  { law: "art. 18, III", title: "Correção", detail: "Lançamentos, contas, metas e dívidas podem ser editados ou removidos nas próprias telas.", selfService: true },
  { law: "art. 18, IV", title: "Bloqueio ou eliminação de dado desnecessário", detail: "Você apaga item a item ou tudo de uma vez, e pode bloquear o envio para IA sem perder o resto.", selfService: true },
  { law: "art. 18, V", title: "Portabilidade", detail: "O backup JSON é legível por máquina e reimportável. Não há formato fechado nem retenção na saída.", selfService: true },
  { law: "art. 18, VI", title: "Eliminação dos dados tratados com consentimento", detail: "Apagar tudo no aparelho e apagar a conta online são ações separadas, e as duas existem.", selfService: true },
  { law: "art. 18, VII", title: "Informação sobre compartilhamento", detail: "A lista de terceiros está nesta tela, e nenhum envio acontece sem ação sua.", selfService: true },
  { law: "art. 18, VIII", title: "Consequência de negar consentimento", detail: "Recusar o envio para IA desliga a análise por IA e o refinamento de texto. Todo o resto continua funcionando.", selfService: true },
  { law: "art. 18, IX", title: "Revogação do consentimento", detail: "O bloqueio vale a partir do momento em que você o liga. Envios já confirmados não podem ser desfeitos no destino.", selfService: true },
  { law: "art. 20", title: "Revisão de decisão automatizada", detail: "A IA sugere texto e comentário. Ela não decide nada sozinha, não altera dados e a nota que devolve é descartada.", selfService: true },
];

function defaultPrivacy() {
  return { termsVersion: null, privacyVersion: null, acceptedAt: null, aiSharing: "ask", acceptedVersions: [], aiHide: [] };
}

// Campos que o usuário decidiu não enviar para a IA. A validação aqui é só de
// FORMATO: a lista de nomes válidos vive em `AI_HIDEABLE_FIELDS`, em
// insights.js, e um nome desconhecido é inerte lá (nada é ocultado por ele).
// Duplicar a lista aqui criaria duas fontes de verdade que sairiam de sincronia
// na primeira vez que um campo novo fosse criado.
function normalizeAiHide(raw) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((item) => typeof item === "string" && /^[a-z]{2,24}$/.test(item)))).slice(0, 12).sort();
}

// Histórico de aceites. Fica NESTE aparelho e por isso não é prova contra o
// usuário; serve para o app saber o que ele já leu e mostrar o que mudou desde
// então, em vez de apagar o aceite anterior a cada revisão do texto.
const LEGAL_HISTORY_MAX = 10;

function normalizeLegalHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set();
  const lista = [];
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const version = typeof item.version === "string" ? item.version.slice(0, 20) : "";
    const at = typeof item.at === "string" && !Number.isNaN(Date.parse(item.at)) ? new Date(item.at).toISOString() : null;
    if (!version || !at || vistos.has(version)) return;
    vistos.add(version);
    lista.push({ version, at });
  });
  return lista.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-LEGAL_HISTORY_MAX);
}

function normalizePrivacy(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const acceptedAt = typeof source.acceptedAt === "string" && !Number.isNaN(Date.parse(source.acceptedAt))
    ? new Date(source.acceptedAt).toISOString()
    : null;
  const termsVersion = typeof source.termsVersion === "string" ? source.termsVersion.slice(0, 20) : null;
  const privacyVersion = typeof source.privacyVersion === "string" ? source.privacyVersion.slice(0, 20) : null;
  let acceptedVersions = normalizeLegalHistory(source.acceptedVersions);
  // Base anterior ao histórico: o aceite guardado vira a primeira entrada,
  // senão a troca de versão apagaria a única evidência que existia.
  if (!acceptedVersions.length && termsVersion && acceptedAt) acceptedVersions = [{ version: termsVersion, at: acceptedAt }];
  return {
    termsVersion,
    privacyVersion,
    acceptedAt,
    aiSharing: source.aiSharing === "blocked" ? "blocked" : "ask",
    acceptedVersions,
    aiHide: normalizeAiHide(source.aiHide),
  };
}

function legalAccepted(privacy) {
  const p = normalizePrivacy(privacy);
  return p.termsVersion === LEGAL_TEXT_VERSION && p.privacyVersion === LEGAL_TEXT_VERSION && !!p.acceptedAt;
}

function acceptLegalTexts(privacy) {
  const atual = normalizePrivacy(privacy);
  const at = new Date().toISOString();
  return {
    ...atual,
    termsVersion: LEGAL_TEXT_VERSION,
    privacyVersion: LEGAL_TEXT_VERSION,
    acceptedAt: at,
    acceptedVersions: normalizeLegalHistory([...atual.acceptedVersions, { version: LEGAL_TEXT_VERSION, at }]),
  };
}

const STORE_TX = "transactions";
const STORE_CAT = "categories";
const STORE_GOALS = "goals";
const STORE_SETTINGS = "settings";
const STORE_ASSETS = "assets";            // Módulo 3; patrimônio e dívidas cadastrados
const STORE_OUTBOX = "outbox";            // v3; fila persistente de mutações a enviar
const COLLECTIONS = [STORE_TX, STORE_CAT, STORE_GOALS, STORE_ASSETS];
const ALL_STORES = [STORE_TX, STORE_CAT, STORE_GOALS, STORE_ASSETS, STORE_SETTINGS];

const SAFE_RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
function recordIdHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function normalizeRecordId(value, prefix = "item") {
  const raw = String(value == null ? "" : value).trim();
  if (SAFE_RECORD_ID.test(raw)) return raw;
  if (!raw) return uid();
  const slug = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "id";
  return `${prefix}-${slug}-${recordIdHash(raw)}`.slice(0, 80);
}
function normalizeRecordRef(value, prefix) {
  return value == null || value === "" ? null : normalizeRecordId(value, prefix);
}
function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}
function normalizeIconName(value, fallback = "tag") {
  const icon = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(icon) ? icon : fallback;
}

// ==============================================================================
// MODELO DE DADOS
// ==============================================================================

const DEFAULT_CATEGORIES = [
  { id: "moradia", name: "Moradia", color: PALETTE[0], icon: "home", budget: null, parentId: null, group: "necessidade" },
  { id: "alimentacao", name: "Alimentação", color: PALETTE[1], icon: "food", budget: null, parentId: null, group: "necessidade" },
  { id: "mercado", name: "Mercado", color: PALETTE[1], icon: "cart", budget: null, parentId: "alimentacao", group: "necessidade" },
  { id: "delivery", name: "Delivery", color: PALETTE[1], icon: "coffee", budget: null, parentId: "alimentacao", group: "desejo" },
  { id: "transporte", name: "Transporte", color: PALETTE[2], icon: "transport", budget: null, parentId: null, group: "necessidade" },
  { id: "lazer", name: "Lazer", color: PALETTE[3], icon: "leisure", budget: null, parentId: null, group: "desejo" },
  { id: "saude", name: "Saúde", color: PALETTE[4], icon: "health", budget: null, parentId: null, group: "necessidade" },
  { id: "educacao", name: "Educação", color: PALETTE[5], icon: "education", budget: null, parentId: null, group: "necessidade" },
  { id: "assinaturas", name: "Assinaturas", color: PALETTE[6], icon: "subscriptions", budget: null, parentId: null, group: "desejo" },
  { id: "outros", name: "Outros", color: PALETTE[7], icon: "other", budget: null, parentId: null, group: "desejo" },
  { id: "investimento", name: "Investimentos", color: "#1F8A5F", icon: "trendUp", budget: null, parentId: null, group: "futuro" },
];

// ------------------------------------------------------------------------------
// NATUREZA ECONÔMICA DO LANÇAMENTO
// ------------------------------------------------------------------------------
// O app tinha DOIS tipos: entrada e saída. Com isso, tudo o que saía da conta
// virava "gasto" e tudo o que entrava virava "renda". Cinco consequências, todas
// visíveis na tela do usuário:
//
//   * guardar R$ 500 numa meta aparecia como gasto de R$ 500, e o mês parecia
//     ruim justamente porque a pessoa poupou;
//   * pagar R$ 1.000 de um financiamento aparecia como gasto de R$ 1.000, mas
//     R$ 800 daquilo era amortização, que TROCA dívida por patrimônio, e só
//     R$ 200 era custo de verdade (juros e tarifas);
//   * transferir entre contas próprias contava duas vezes, como gasto numa e
//     renda na outra;
//   * um estorno de compra entrava como RENDA, inflando a renda do mês e a
//     taxa de poupança;
//   * resgatar de uma meta virava renda, e o score subia por gastar a reserva.
//
// A natureza separa essas coisas. `consumo` é o que de fato foi consumido; é
// ele, e só ele (mais encargos), que entra em "gastos".
const TRANSACTION_NATURES = Object.freeze({
  // Saídas
  consumo: "consumo",                    // gasto de verdade
  aporte: "aporte",                      // vira patrimônio (meta ou investimento)
  dividaPrincipal: "divida-principal",   // amortização: troca dívida por patrimônio
  dividaEncargos: "divida-encargos",     // juros, multa e tarifas: custo real
  transferencia: "transferencia",        // entre contas próprias: não é gasto nem renda
  // Entradas
  renda: "renda",                        // renda de verdade
  resgate: "resgate",                    // saída de meta/investimento para o caixa
  estorno: "estorno",                    // devolução de um gasto anterior
});

const EXPENSE_NATURES = ["consumo", "aporte", "divida-principal", "divida-encargos", "transferencia"];
const INCOME_NATURES = ["renda", "resgate", "estorno", "transferencia"];
const ALL_NATURES = Array.from(new Set([...EXPENSE_NATURES, ...INCOME_NATURES]));

// Bases antigas não têm o campo. A natureza é DEDUZIDA dos vínculos que já
// existiam, então nenhum número muda por falta de informação: quem tinha
// `goalId` sempre foi aporte, quem tinha `debtId` sempre foi pagamento de
// dívida, e o resto sempre foi consumo.
function deriveTransactionNature(t) {
  const isIncome = t && t.type === "income";
  if (isIncome) {
    if (t.goalId) return TRANSACTION_NATURES.resgate;
    return TRANSACTION_NATURES.renda;
  }
  if (t && t.goalId) return TRANSACTION_NATURES.aporte;
  // Pagamento de dívida sem detalhamento entra como principal: é o que o app
  // sempre assumiu ao abater do saldo devedor. A separação de juros passa a ser
  // possível, mas não é inventada para trás.
  if (t && t.debtId) return TRANSACTION_NATURES.dividaPrincipal;
  // Literal, e não a constante de metrics.js: storage.js carrega antes, e os
  // testes de armazenamento não carregam metrics.js.
  if (t && t.categoryId === "investimento") return TRANSACTION_NATURES.aporte;
  return TRANSACTION_NATURES.consumo;
}

function normalizeTransactionNature(raw, t) {
  const value = String(raw || "");
  const allowed = t && t.type === "income" ? INCOME_NATURES : EXPENSE_NATURES;
  if (allowed.indexOf(value) !== -1) return value;
  return deriveTransactionNature(t);
}

// Quanto este lançamento representa de GASTO no mês. Estorno entra negativo:
// ele desfaz um consumo, não cria renda.
function consumptionCentsOf(t) {
  if (!t) return 0;
  const cents = moneyToCents(t.amount);
  const nature = t.nature || deriveTransactionNature(t);
  if (nature === TRANSACTION_NATURES.consumo || nature === TRANSACTION_NATURES.dividaEncargos) return cents;
  if (nature === TRANSACTION_NATURES.estorno) return -cents;
  return 0;
}

// Renda de verdade. Resgate e estorno ficam de fora de propósito: resgatar da
// reserva não é ganhar dinheiro, e estorno é gasto que voltou.
function incomeCentsOf(t) {
  if (!t || t.type !== "income") return 0;
  const nature = t.nature || deriveTransactionNature(t);
  return nature === TRANSACTION_NATURES.renda ? moneyToCents(t.amount) : 0;
}

function isConsumptionTx(t) {
  const nature = (t && t.nature) || deriveTransactionNature(t);
  return nature === TRANSACTION_NATURES.consumo || nature === TRANSACTION_NATURES.dividaEncargos;
}

const TRANSACTION_LOG_MAX = 30;
const TRANSACTION_ORIGIN_LABELS = Object.freeze({
  manual: "Lançamento manual",
  "import-ofx": "Extrato OFX",
  "import-csv": "Extrato CSV",
  nlp: "Lançamento inteligente",
  "goal-upfront": "Aporte inicial de meta",
  "qrcode-pix": "Pix lido por QR Code",
  "qrcode-nfce": "Nota fiscal lida por QR Code",
  transfer: "Transferência entre contas",
  "card-payment": "Pagamento de fatura",
});

function transactionSourceOf(value) {
  return /^[a-z][a-z0-9-]{0,31}$/.test(String(value || "")) ? String(value) : "manual";
}

function normalizeTransactionTimestamp(value, fallback) {
  const date = new Date(value || fallback || "");
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeTransactionOrigin(raw, source, fallbackDate) {
  const sourceId = transactionSourceOf(source);
  if (typeof raw === "string") {
    return { channel: sourceId, label: raw.trim().slice(0, 100) || TRANSACTION_ORIGIN_LABELS[sourceId] || "Outra origem", reference: null, importedAt: fallbackDate || null };
  }
  const origin = raw && typeof raw === "object" ? raw : {};
  return {
    channel: transactionSourceOf(origin.channel || sourceId),
    label: String(origin.label || TRANSACTION_ORIGIN_LABELS[sourceId] || "Outra origem").trim().slice(0, 100),
    reference: origin.reference ? String(origin.reference).trim().slice(0, 160) : null,
    importedAt: (origin.importedAt || sourceId !== "manual") ? normalizeTransactionTimestamp(origin.importedAt, fallbackDate) : null,
  };
}

function normalizeTransactionLog(raw, createdAt, source) {
  const list = (Array.isArray(raw) ? raw : []).filter((entry) => entry && typeof entry === "object").map((entry) => ({
    id: normalizeRecordId(entry.id, "txlog"),
    at: normalizeTransactionTimestamp(entry.at, createdAt),
    action: ["created", "edited", "reviewed", "converted"].includes(entry.action) ? entry.action : "edited",
    fields: Array.from(new Set((Array.isArray(entry.fields) ? entry.fields : []).map((field) => String(field).trim()).filter(Boolean))).slice(0, 20),
    actor: String(entry.actor || "user").trim().slice(0, 30) || "user",
  })).slice(-TRANSACTION_LOG_MAX);
  if (list.length) return list;
  return [{ id: normalizeRecordId(`txlog-${recordIdHash(`${createdAt}|${source}|created`)}`, "txlog"), at: normalizeTransactionTimestamp(createdAt), action: "created", fields: [], actor: source === "manual" ? "user" : "system" }];
}

function normalizeReviewedIssues(raw) {
  return Array.from(new Set((Array.isArray(raw) ? raw : []).map((key) => String(key).trim()).filter((key) => /^[a-z0-9:_-]{1,180}$/i.test(key)))).slice(-100);
}

function appendTransactionLog(raw, entry, createdAt, source) {
  return normalizeTransactionLog([...(Array.isArray(raw) ? raw : []), { id: uid(), at: new Date().toISOString(), actor: "user", ...entry }], createdAt, source);
}

// ==============================================================================
// MÓDULO 3. PATRIMÔNIO: classes de bens e dívidas
// ------------------------------------------------------------------------------
// O app calcula o CAIXA a partir dos lançamentos. O que os lançamentos não sabem
//; o carro, o apartamento, a carteira de investimentos, o financiamento; passa
// a ser cadastrado aqui. Cada item guarda um HISTÓRICO mensal do próprio valor,
// e é isso que permite reconstruir a evolução patrimonial de verdade, em vez de
// projetar o valor de hoje para trás.
// ==============================================================================

const ASSET_CLASSES = [
  { id: "conta",        kind: "asset",     label: "Contas",             plural: "contas",              icon: "wallet",        color: "#0B6B5C", hint: "Conta corrente, poupança, conta digital." },
  { id: "carteira",     kind: "asset",     label: "Dinheiro e carteiras", plural: "carteiras",         icon: "creditCard",    color: "#3C6E8F", hint: "Dinheiro em espécie, carteira digital, vale-alimentação." },
  { id: "investimento", kind: "asset",     label: "Investimentos",      plural: "investimentos",       icon: "trendUp",       color: "#1F8A5F", hint: "Tesouro, CDB, LCI/LCA, ações, FIIs, ETF, fundos, cripto." },
  { id: "veiculo",      kind: "asset",     label: "Veículos",           plural: "veículos",            icon: "transport",     color: "#B5652B", hint: "Carro, moto. Use o valor de tabela, não o que você pagou." },
  { id: "imovel",       kind: "asset",     label: "Imóveis",            plural: "imóveis",             icon: "home",          color: "#8A5FBF", hint: "Casa, apartamento, terreno, sala comercial." },
  { id: "outro",        kind: "asset",     label: "Outros bens",        plural: "outros bens",         icon: "star",          color: "#C08A2E", hint: "Equipamentos, participação em empresa, bens de valor." },
  { id: "divida",       kind: "liability", label: "Dívidas",            plural: "dívidas",             icon: "alertTriangle", color: "#BE443B", hint: "Financiamento, empréstimo, consórcio, saldo devedor." },
];

const ASSET_HISTORY_MAX = 60;   // 5 anos de pontos mensais por item
const ASSET_EVENTS_MAX = 500;   // aportes, resgates e proventos datados

// ------------------------------------------------------------------------------
// EVENTOS DE INVESTIMENTO
// ------------------------------------------------------------------------------
// Sem a DATA de cada aporte não existe rentabilidade correta. O app guardava só
// o total investido, e com isso calculava "(valor - custo) / custo": quem
// aportou R$ 10.000 há cinco anos e quem aportou ontem apareciam com a mesma
// rentabilidade. Com os eventos datados dá para calcular XIRR (retorno do
// dinheiro do investidor) e TWR (retorno da escolha, sem o efeito do momento
// dos aportes).
const INVESTMENT_EVENT_TYPES = ["aporte", "resgate", "provento"];

function normalizeInvestmentEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const date = normalizeIsoDate(e && e.date);
      const amount = Math.abs(roundMoney(e && e.amount));
      const type = INVESTMENT_EVENT_TYPES.indexOf(String(e && e.type)) !== -1 ? String(e.type) : "aporte";
      if (!date || !(amount > 0)) return null;
      return { date, type, amount, id: normalizeRecordId(e && e.id, "event") };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-ASSET_EVENTS_MAX);
}

function assetClassOf(id) {
  return ASSET_CLASSES.find((c) => c.id === id) || ASSET_CLASSES[0];
}

// ==============================================================================
// MÓDULO 5. CENTRAL DE INVESTIMENTOS: tipos de aplicação
// ------------------------------------------------------------------------------
// Um investimento continua sendo um ASSET de classe "investimento"; a mesma
// coleção do Módulo 3. Isso é deliberado: se a Central tivesse coleção própria,
// o app teria duas verdades sobre o mesmo dinheiro e o patrimônio passaria a
// contar a carteira duas vezes. Aqui só acrescentamos DETALHE ao mesmo registro.
//
// `taxation` descreve como o rendimento é tributado no Brasil e é usada tanto
// pelos simuladores quanto pelos alertas da carteira:
//   regressiva → tabela regressiva de IR (22,5% a 15%) sobre o rendimento
//   isento     → LCI, LCA, poupança e dividendos
//   variavel   → 15% sobre o ganho na venda (com isenção mensal em ações)
//   cripto     → 15%+ sobre o ganho, isento até R$ 35 mil de venda no mês
// ==============================================================================

const INVESTMENT_TYPES = [
  { id: "poupanca",      label: "Poupança",       group: "renda-fixa",     taxation: "isento",     liquidity: "diaria",   color: "#4E7C99", hint: "0,5% ao mês + TR enquanto a Selic estiver acima de 8,5% ao ano." },
  { id: "tesouro-selic", label: "Tesouro Selic",  group: "renda-fixa",     taxation: "regressiva", liquidity: "diaria",   color: "#0B6B5C", hint: "Pós-fixado na Selic, com liquidez e baixo risco soberano. Pode oscilar se vendido antes do vencimento." },
  { id: "tesouro-ipca",  label: "Tesouro IPCA+",  group: "renda-fixa",     taxation: "regressiva", liquidity: "vencimento", color: "#12836F", hint: "Protege da inflação. Marcação a mercado se vender antes." },
  { id: "tesouro-pre",   label: "Tesouro Prefixado", group: "renda-fixa",  taxation: "regressiva", liquidity: "vencimento", color: "#1F8A5F", hint: "Taxa travada na compra. Você sabe hoje quanto recebe no fim." },
  { id: "cdb",           label: "CDB",            group: "renda-fixa",     taxation: "regressiva", liquidity: "variavel", color: "#3C6E8F", hint: "Normalmente um % do CDI. FGC até R$ 250 mil por CPF/CNPJ e conglomerado, limitado a R$ 1 milhão em quatro anos." },
  { id: "lci-lca",       label: "LCI / LCA",      group: "renda-fixa",     taxation: "isento",     liquidity: "carencia", color: "#2E7D6B", hint: "Pode ter isenção de IR para pessoa física. Confira prazo, liquidez, risco e valor líquido." },
  { id: "fundo-rf",      label: "Fundo de renda fixa", group: "renda-fixa", taxation: "regressiva", liquidity: "cotizacao", color: "#5A7F93", hint: "Atenção à taxa de administração e ao come-cotas semestral." },
  { id: "acao",          label: "Ações",          group: "renda-variavel", taxation: "variavel",   liquidity: "d2",       color: "#B5652B", hint: "Ganho de capital + dividendos. Isento até R$ 20 mil vendidos no mês." },
  { id: "fii",           label: "Fundos imobiliários", group: "renda-variavel", taxation: "variavel", liquidity: "d2",   color: "#C08A2E", hint: "Rendimentos podem ser isentos para pessoa física quando os requisitos legais são atendidos; ganho na venda é tributado em 20%." },
  { id: "etf",           label: "ETF",            group: "renda-variavel", taxation: "variavel",   liquidity: "d2",       color: "#8A5FBF", hint: "Cesta de ativos num só papel. Sem isenção nas vendas." },
  { id: "fundo-acoes",   label: "Fundo multimercado / ações", group: "renda-variavel", taxation: "variavel", liquidity: "cotizacao", color: "#7C5FA8", hint: "Resgate pode levar dias. Confira taxa de performance." },
  { id: "cripto",        label: "Criptomoedas",   group: "cripto",         taxation: "cripto",     liquidity: "diaria",   color: "#B5476A", hint: "Altíssima volatilidade. Trate como a fatia mais arriscada da carteira." },
  { id: "outro",         label: "Outro",          group: "outros",         taxation: "regressiva", liquidity: "variavel", color: "#7C8592", hint: "Previdência, COE, participação; qualquer aplicação fora da lista." },
];

const INVESTMENT_GROUPS = [
  { id: "renda-fixa",     label: "Renda fixa",     color: "#0B6B5C", risk: 1, hint: "Previsibilidade. É o colchão da carteira." },
  { id: "renda-variavel", label: "Renda variável", color: "#B5652B", risk: 3, hint: "Oscila no curto prazo; é onde mora o retorno de longo prazo." },
  { id: "cripto",         label: "Cripto",         color: "#B5476A", risk: 5, hint: "Alto risco. A literatura sugere manter uma fatia pequena." },
  { id: "outros",         label: "Outros",         color: "#7C8592", risk: 2, hint: "Aplicações que não se encaixam nas classes acima." },
];

function investmentTypeOf(id) {
  return INVESTMENT_TYPES.find((t) => t.id === id) || INVESTMENT_TYPES[INVESTMENT_TYPES.length - 1];
}
function investmentGroupOf(id) {
  return INVESTMENT_GROUPS.find((g) => g.id === id) || INVESTMENT_GROUPS[INVESTMENT_GROUPS.length - 1];
}

// ------------------------------------------------------------------------------
// Premissas de mercado (Módulo 5)
// ------------------------------------------------------------------------------
// O app é offline: não existe cotação em tempo real, e fingir que existe seria
// pior do que não ter. Então as taxas são PREMISSAS EDITÁVEIS, com a data em que
// o usuário as revisou; todo simulador mostra de onde veio o número que usou.
// A poupança não é armazenada: ela é DERIVADA da Selic pela regra vigente
// (0,5% a.m. + TR acima de 8,5%; 70% da Selic + TR abaixo disso).
// ------------------------------------------------------------------------------
function defaultMarketRates() {
  return { selic: 15, cdi: 14.9, ipca: 4.5, tr: 0.2, updatedAt: null };
}

function poupancaRateFrom(selicPct, trPct) {
  const selic = Number(selicPct) || 0;
  const tr = Number(trPct) || 0;
  if (selic > 8.5) return roundTo(Math.pow(1.005, 12) - 1 + tr / 100, 6) * 100;
  return roundTo(Math.pow(1 + (selic * 0.7) / 100, 1) - 1 + tr / 100, 6) * 100;
}

function roundTo(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(n) || 0) * f) / f;
}

function normalizeRatePct(v, fallback, max) {
  const n = Number(v);
  const top = max == null ? 100 : max;
  return Number.isFinite(n) && n >= 0 && n <= top ? roundTo(n, 4) : fallback;
}

function normalizeMarketRates(raw) {
  const base = defaultMarketRates();
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    selic: normalizeRatePct(r.selic, base.selic, 60),
    cdi: normalizeRatePct(r.cdi, base.cdi, 60),
    ipca: normalizeRatePct(r.ipca, base.ipca, 60),
    tr: normalizeRatePct(r.tr, base.tr, 20),
    updatedAt: typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt.slice(0, 10) : null,
  };
}

// Histórico: no máximo um ponto por mês (o último valor informado no mês vence).

function assetHistoryWith(history, monthKey, value) {
  const out = (Array.isArray(history) ? history : [])
    .filter((h) => h && h.monthKey && h.monthKey !== monthKey)
    .map((h) => ({ monthKey: String(h.monthKey), value: roundMoney(h.value) }));
  out.push({ monthKey, value: Math.abs(roundMoney(value)) });
  out.sort((a, b) => (a.monthKey < b.monthKey ? -1 : a.monthKey > b.monthKey ? 1 : 0));
  return out.slice(-ASSET_HISTORY_MAX);
}

// Valor do item no fim de um mês qualquer. Antes do primeiro registro devolve 0:
// um carro comprado em março não deve aparecer no patrimônio de janeiro.
function assetValueAt(asset, monthKey) {
  const h = (asset && asset.history) || [];
  let value = 0;
  let found = false;
  for (let i = 0; i < h.length; i++) {
    if (h[i].monthKey <= monthKey) { value = h[i].value; found = true; }
    else break;
  }
  return found ? value : 0;
}

// Tipo de aplicação: só aceita id conhecido; qualquer outra coisa vira "outro".

function normalizeInvType(v) {
  const id = String(v || "").trim();
  return INVESTMENT_TYPES.some((t) => t.id === id) ? id : "outro";
}

// Data ISO (AAAA-MM-DD) ou ""; usada como início da aplicação para anualizar
// a rentabilidade. Data inválida vira vazio em vez de NaN no cálculo de prazo.
// Só data que EXISTE. Ver `isRealIsoDate` em utils.js: o formato sozinho aceita
// 31 de fevereiro, e o JavaScript rola a data para o mês seguinte em vez de
// recusar, jogando o lançamento no mês errado.
function normalizeIsoDate(v) {
  const s = String(v || "").slice(0, 10);
  return isRealIsoDate(s) ? s : "";
}

// Dia de vencimento: inteiro de 1 a 31, ou 0 quando não informado.

function normalizeDueDay(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 0;
}

const DEBT_TYPES = ["cartao-rotativo", "emprestimo", "financiamento", "consignado", "cheque-especial", "parcelamento", "tributo", "outro"];
const DEBT_RATE_PERIODS = ["month", "year", "unknown"];
const DEBT_AMORTIZATION_SYSTEMS = ["price", "sac", "fixed", "unknown"];
const DEBT_STATUSES = ["active", "negotiating", "paid"];

function normalizeOptionalPositive(v, max) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (max != null && n > max)) return null;
  return roundTo(n, 4);
}

function normalizeDebtPlan(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    strategy: r.strategy === "snowball" ? "snowball" : "avalanche",
    extraMonthly: Math.abs(roundMoney(r.extraMonthly)),
    updatedAt: normalizeIsoDate(r.updatedAt) || null,
  };
}

function makeAsset(partial) {
  const cls = assetClassOf(partial.class);
  const nowIso = new Date().toISOString();
  const monthKey = partial.monthKey || keyOfDate(new Date());
  const value = Math.abs(roundMoney(partial.value));
  const isInvestment = cls.id === "investimento";
  const isDebt = cls.kind === "liability";
  const nextDueDate = isDebt ? normalizeIsoDate(partial.nextDueDate) : "";
  const requestedStatus = DEBT_STATUSES.includes(partial.debtStatus) ? partial.debtStatus : "active";
  const debtStatus = !isDebt ? "" : requestedStatus === "negotiating" ? "negotiating" : value <= 0 ? "paid" : "active";
  return {
    id: normalizeRecordId(partial.id, "asset"),
    class: cls.id,
    kind: cls.kind,
    name: String(partial.name || cls.label).trim().slice(0, 60),
    value,
    // "já refletido nos meus lançamentos": o item aparece na lista para
    // referência, mas NÃO soma no patrimônio; é o que impede contar duas vezes
    // o saldo de uma conta que já é resultado dos lançamentos.
    inLedger: !!partial.inLedger,
    monthlyPayment: isDebt ? Math.abs(roundMoney(partial.monthlyPayment)) : 0,
    // [M4] Dia do mês em que a parcela vence (1-31). 0 = não informado; sem ele
    // a dívida não vira evento no calendário; melhor não marcar dia nenhum do
    // que marcar o dia errado.
    dueDay: isDebt ? normalizeDueDay(nextDueDate ? Number(nextDueDate.slice(8, 10)) : partial.dueDay) : 0,
    debtType: isDebt && DEBT_TYPES.includes(partial.debtType) ? partial.debtType : (isDebt ? "outro" : ""),
    creditor: isDebt ? String(partial.creditor || "").trim().slice(0, 80) : "",
    originalPrincipal: isDebt ? normalizeOptionalPositive(partial.originalPrincipal, 1000000000) : null,
    ratePct: isDebt ? normalizeOptionalPositive(partial.ratePct, 1000) : null,
    ratePeriod: isDebt && DEBT_RATE_PERIODS.includes(partial.ratePeriod) ? partial.ratePeriod : (isDebt ? "unknown" : ""),
    cetAnnualPct: isDebt ? normalizeOptionalPositive(partial.cetAnnualPct, 10000) : null,
    remainingInstallments: isDebt ? (() => {
      const n = normalizeOptionalPositive(partial.remainingInstallments, 1200);
      return n == null ? null : Math.round(n);
    })() : null,
    amortizationSystem: isDebt && DEBT_AMORTIZATION_SYSTEMS.includes(partial.amortizationSystem) ? partial.amortizationSystem : (isDebt ? "unknown" : ""),
    nextDueDate,
    debtStatus,
    balanceCheckedAt: isDebt ? normalizeIsoDate(partial.balanceCheckedAt) : "",
    // ---- v8 (Módulo 5): detalhe da aplicação ----------------------------------
    // Só existe em investimento. `invested` é o CUSTO (quanto saiu do bolso) e
    // `value` é o valor de mercado hoje: é a diferença entre os dois que produz
    // lucro e rentabilidade. `dividends` é acumulado e NUNCA entra no patrimônio
    //; ele só compõe o retorno; o dinheiro do provento, quando cai na conta,
    // já é um lançamento de receita, e somá-lo aqui contaria duas vezes.
    invType: isInvestment ? normalizeInvType(partial.invType) : "",
    invested: isInvestment ? Math.abs(roundMoney(partial.invested)) : 0,
    dividends: isInvestment ? Math.abs(roundMoney(partial.dividends)) : 0,
    startedAt: isInvestment ? normalizeIsoDate(partial.startedAt) : "",
    // Aportes, resgates e proventos com data. É o que permite XIRR e TWR.
    events: isInvestment ? normalizeInvestmentEvents(partial.events) : [],
    note: String(partial.note || "").trim().slice(0, 140),
    history: assetHistoryWith(partial.history, monthKey, value),
    createdAt: partial.createdAt || nowIso,
    // Preservado quando existe: `migrate()` roda a cada boot e não pode carimbar
    // uma data nova, senão o diff grava tudo de novo e a mesclagem de backup
    // passa a resolver conflitos pelo boot mais recente em vez da edição real.
    updatedAt: partial.updatedAt || nowIso,
    syncRev: normalizeSyncRev(partial.syncRev),
  };
}

// Atualização de valor: reescreve o ponto do mês corrente e mantém o passado.

function updateAssetValue(asset, value, monthKey) {
  const mKey = monthKey || keyOfDate(new Date());
  const v = Math.abs(roundMoney(value));
  return { ...asset, value: v, history: assetHistoryWith(asset.history, mKey, v), updatedAt: new Date().toISOString() };
}

/* ---- Agregações (usadas por metrics.js, health.js e pela tela Patrimônio) ---- */

// Itens que efetivamente entram na conta do patrimônio.

function countedAssets(data) {
  return (data.assets || []).filter((a) => a.kind === "asset" && !a.inLedger);
}
function countedLiabilities(data) {
  return (data.assets || []).filter((a) => a.kind === "liability");
}
function assetsTotal(data) { return sumMoney(countedAssets(data), (a) => a.value); }
function liabilitiesTotal(data) { return sumMoney(countedLiabilities(data), (a) => a.value); }

// Investimentos cadastrados. Quando existe pelo menos um, metrics.js para de
// estimar investimento pelos lançamentos e passa a usar este número; é o que
// evita somar a mesma aplicação duas vezes.
function registeredInvestments(data) {
  return sumMoney(countedAssets(data).filter((a) => a.class === "investimento"), (a) => a.value);
}
function hasRegisteredInvestments(data) {
  return countedAssets(data).some((a) => a.class === "investimento");
}

// Parcela mensal somada dos financiamentos/empréstimos cadastrados.

function liabilitiesMonthlyPayment(data) {
  return sumMoney(countedLiabilities(data), (a) => a.monthlyPayment);
}

// Ativos (fora investimentos) menos dívidas, reconstruídos para o fim de um mês.

function assetsNetAt(data, monthKey, opts) {
  const skipInvestments = !!(opts && opts.skipInvestments);
  let cents = 0;
  countedAssets(data).forEach((a) => {
    if (skipInvestments && a.class === "investimento") return;
    cents += moneyToCents(assetValueAt(a, monthKey));
  });
  countedLiabilities(data).forEach((a) => { cents -= moneyToCents(assetValueAt(a, monthKey)); });
  return moneyFromCents(cents);
}

// Distribuição por classe, já ordenada e com percentual; pronta para o gráfico.

function assetAllocation(data) {
  const total = assetsTotal(data);
  return ASSET_CLASSES.filter((c) => c.kind === "asset").map((c) => {
    const items = countedAssets(data).filter((a) => a.class === c.id);
    const value = sumMoney(items, (a) => a.value);
    return { ...c, value, count: items.length, pct: total > 0 ? safePct(value, total) : 0 };
  }).filter((row) => row.count > 0).sort((a, b) => b.value - a.value);
}

const BUDGET_GROUPS = ["necessidade", "desejo", "futuro"];
const GROUP_LABELS = { necessidade: "Necessidades", desejo: "Desejos", futuro: "Futuro" };
const GROUP_ICONS = { necessidade: "shieldCheck", desejo: "gift", futuro: "piggy" };
function defaultBudgetSplit() { return { necessidade: 50, desejo: 30, futuro: 20 }; }
// Limiares dos alertas de orçamento por categoria (Feature 3). Ficam em settings
// para que o usuário possa afrouxar/apertar sem mexer no código.
function defaultBudgetAlerts() { return { warn: 80, over: 100 }; }

function budgetSnapshotOf(data, monthKey) {
  const budgets = {}, groups = {}, parents = {};
  (data.categories || []).forEach((c) => {
    if (typeof c.budget === "number" && c.budget > 0) budgets[c.id] = roundMoney(c.budget);
    groups[c.id] = BUDGET_GROUPS.includes(c.group) ? c.group : "necessidade";
    parents[c.id] = c.parentId || null;
  });
  return {
    monthKey: monthKey || keyOfDate(new Date()),
    budgets,
    groups,
    parents,
    split: { ...defaultBudgetSplit(), ...(data.budgetSplit || {}) },
    alerts: { ...defaultBudgetAlerts(), ...(data.budgetAlerts || {}) },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeBudgetHistory(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  Object.keys(source).sort().forEach((key) => {
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const row = source[key] && typeof source[key] === "object" ? source[key] : {};
    const budgets = {};
    Object.keys(row.budgets || {}).forEach((id) => {
      const value = normalizeBudgetValue(row.budgets[id]);
      if (id && value != null) budgets[normalizeRecordId(id, "category")] = value;
    });
    const groups = {}, parents = {};
    Object.keys(row.groups || {}).forEach((id) => {
      if (id && BUDGET_GROUPS.includes(row.groups[id])) groups[normalizeRecordId(id, "category")] = row.groups[id];
    });
    Object.keys(row.parents || {}).forEach((id) => {
      if (id) parents[normalizeRecordId(id, "category")] = normalizeRecordRef(row.parents[id], "category");
    });
    const split = row.split && typeof row.split === "object" ? row.split : {};
    const alerts = row.alerts && typeof row.alerts === "object" ? row.alerts : {};
    out[key] = {
      monthKey: key,
      budgets,
      groups,
      parents,
      split: {
        necessidade: clampPct(split.necessidade, 50),
        desejo: clampPct(split.desejo, 30),
        futuro: clampPct(split.futuro, 20),
      },
      alerts: {
        warn: normalizeBudgetAlert(alerts.warn, 80, 200),
        over: normalizeBudgetAlert(alerts.over, 100, 300),
      },
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    };
  });
  return out;
}

function budgetSnapshotAt(data, monthKey) {
  const history = normalizeBudgetHistory(data && data.budgetHistory);
  const key = monthKey || keyOfDate(new Date());
  const found = Object.keys(history).filter((k) => k <= key).sort().pop();
  if (found) return history[found];
  return key >= keyOfDate(new Date()) ? budgetSnapshotOf(data || {}, key) : null;
}

function withBudgetSnapshot(data, monthKey) {
  const key = monthKey || keyOfDate(new Date());
  return {
    ...data,
    budgetHistory: { ...normalizeBudgetHistory(data.budgetHistory), [key]: budgetSnapshotOf(data, key) },
  };
}

function mergeBudgetHistory(a, b) {
  const left = normalizeBudgetHistory(a), right = normalizeBudgetHistory(b);
  const out = { ...left };
  Object.keys(right).forEach((key) => {
    if (!out[key] || (right[key].updatedAt || "") > (out[key].updatedAt || "")) out[key] = right[key];
  });
  return out;
}

const GROUP_ID_FALLBACK = {
  moradia: "necessidade", alimentacao: "necessidade", mercado: "necessidade", transporte: "necessidade",
  saude: "necessidade", educacao: "necessidade", delivery: "desejo", lazer: "desejo",
  assinaturas: "desejo", outros: "desejo", investimento: "futuro",
};

const SETTING_KEYS = [
  "monthlyIncome", "creditCardLimit", "theme", "dismissedCarryForwardMonth",
  "budgetSplit", "budgetAlerts", "budgetHistory", "version", "lastPersistAt",
  // v5; perfil e reserva de emergência (usados pelo Dashboard e pelo Score)
  "userName", "emergencyGoalId", "emergencyMonths",
  // v8; premissas de mercado usadas pelos simuladores (Módulo 5)
  "marketRates",
  // v9; conquistas desbloqueadas (Módulo 6). Guardadas como configuração e não
  // como coleção própria: é um mapa pequeno { id: data } que acompanha o perfil,
  // não um conjunto de registros consultáveis.
  "achievements",
  // v10. Módulo 7. Acompanhamento de assinaturas e recorrências: o que o
  // usuário mandou parar de acompanhar e quais propostas de cadastro ele já
  // respondeu. É preferência de tela, não coleção; mora em settings.
  "recurringPrefs",
  // v11. Módulo 8. Central de notificações: histórico de avisos já emitidos,
  // com estado de leitura, e os grupos silenciados. Mora em settings porque é
  // preferência + registro de tela, não um conjunto de registros consultáveis.
  "notifications",
  // v12; mantidos em settings para evitar uma migração física do IndexedDB.
  // São listas pequenas; lançamentos continuam no store indexado próprio.
  "accounts", "creditCards", "accountTransfers", "cardPayments", "accountAdjustments",
  // v13; preferência da estratégia e do valor extra da Central de Dívidas.
  "debtPlan",
  // v15; se a configuração inicial de 4 passos já foi concluída (ou dispensada).
  "onboarding",
  // v16; quais cartões o usuário mantém no Início e em que ordem, e as regras
  // de categorização automática que ele criou (ou desligou). São preferências
  // de tela e de motor, não coleções consultáveis: moram em settings.
  "dashboardLayout", "dashboardFocus", "categoryRules",
  // v22; aceite explícito dos textos e preferência de envio para IA.
  "privacy", "graveyard", "lastBackupAt",
];

// v9. Módulo 6. `unlocked` é { idDaConquista: "AAAA-MM-DD" }. A data importa:
// é o que permite mostrar "conquistado em" e ordenar as mais recentes.
function defaultAchievements() { return { enabled: false, initialized: false, unlocked: {} }; }

// Saneia o mapa vindo do disco/backup: só aceita chaves string e datas ISO.
// Um id desconhecido (de uma versão futura ou de um backup adulterado) é
// preservado sem quebrar nada; o motor simplesmente o ignora ao montar a tela.
function normalizeAchievements(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const incoming = src.unlocked && typeof src.unlocked === "object" ? src.unlocked : {};
  const unlocked = {};
  Object.keys(incoming).forEach((id) => {
    if (typeof id !== "string" || !id) return;
    const v = incoming[id];
    const iso = typeof v === "string" && isRealIsoDate(v) ? v : todayIso();
    unlocked[id.slice(0, 60)] = iso;
  });
  return {
    enabled: src.enabled === true,
    initialized: src.initialized === true,
    unlocked,
  };
}

// v10. Módulo 7. Três mapas { chaveDoGrupo: "AAAA-MM-DD" }:
//   ignored  . "cancelar acompanhamento": sai das listas e dos totais, mas os
//               lançamentos continuam intactos. Deixar de acompanhar é uma
//               decisão de tela; apagar histórico seria outra coisa.
//   dismissed; proposta de cadastro recusada; o app não volta a perguntar.
//   confirmed; proposta aceita (o efeito real vive no `recurring` dos
//               lançamentos; aqui fica só a data, para a tela poder dizê-la).
function defaultRecurringPrefs() { return { ignored: {}, dismissed: {}, confirmed: {} }; }

function normalizeRecurringPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = defaultRecurringPrefs();
  ["ignored", "dismissed", "confirmed"].forEach((bucket) => {
    const incoming = src[bucket] && typeof src[bucket] === "object" ? src[bucket] : {};
    Object.keys(incoming).forEach((key) => {
      if (typeof key !== "string" || !key) return;
      const v = incoming[key];
      const iso = typeof v === "string" && isRealIsoDate(v) ? v : todayIso();
      out[bucket][key.slice(0, 140)] = iso;
    });
  });
  return out;
}

// v11. Módulo 8. `items` é o histórico de avisos (com `readAt`), `muted` é o
// mapa { grupo: "AAAA-MM-DD" } dos grupos silenciados e `initialized` marca que
// a primeira sincronização já aconteceu; é ela que evita o paredão de trinta
// avisos não lidos para quem já usa o app há meses.
function defaultNotifications() { return { items: [], muted: {}, lastSyncAt: "", initialized: false }; }

// v15; configuração inicial. Guarda apenas o desfecho, nunca os campos
// digitados: o que o usuário informou vira renda, conta e regra de orçamento de
// verdade. `skipped` existe para diferenciar quem completou de quem pulou, o que
// permite oferecer o assistente de novo em Ajustes sem reabri-lo sozinho.
function defaultOnboarding() { return { done: false, skipped: false, completedAt: null }; }

// Um usuário que já tinha dados antes desta versão não pode ser recebido por uma
// tela de boas-vindas; ele já configurou tudo à mão. Sem registro no disco, o
// estado é INFERIDO do que existe: qualquer sinal de uso conta como concluído.
function normalizeOnboarding(raw, data) {
  if (raw && typeof raw === "object") {
    return {
      done: !!raw.done,
      skipped: !!raw.skipped,
      completedAt: normalizeIsoDate(raw.completedAt) || null,
    };
  }
  const d = data || {};
  const used = (Array.isArray(d.transactions) && d.transactions.length > 0)
    || (Array.isArray(d.accounts) && d.accounts.length > 0)
    || (Array.isArray(d.goals) && d.goals.length > 0)
    || Number(d.monthlyIncome) > 0
    || !!String(d.userName || "").trim();
  return { done: used, skipped: false, completedAt: null };
}

const NOTIF_TONES = ["danger", "warn", "info", "positive"];

// Saneia o que vem do disco/backup. Um aviso corrompido é DESCARTADO (e não
// consertado com valores inventados): notificação é registro do que aconteceu,
// e um registro que não dá para confiar não deve virar badge vermelho.
function normalizeNotifications(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const isIso = (v) => typeof v === "string" && isRealIsoDate(v);

  const seen = new Set();
  const items = (Array.isArray(src.items) ? src.items : [])
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const key = typeof n.key === "string" ? n.key.slice(0, 140) : "";
      const title = typeof n.title === "string" ? n.title.slice(0, 120) : "";
      if (!key || !title || seen.has(key)) return null;
      seen.add(key);
      const amount = Number(n.amount);
      return {
        id: normalizeRecordId(n.id, "notification"),
        key,
        group: /^[a-z][a-z0-9-]{0,29}$/.test(String(n.group || "")) ? n.group : "contas",
        tone: NOTIF_TONES.includes(n.tone) ? n.tone : "info",
        icon: normalizeIconName(n.icon, "bell"),
        title,
        message: typeof n.message === "string" ? n.message.slice(0, 300) : "",
        tab: /^[a-z][a-z0-9-]{0,29}$/.test(String(n.tab || "")) ? n.tab : "dashboard",
        amount: Number.isFinite(amount) ? roundMoney(amount) : null,
        createdAt: isIso(n.createdAt) ? n.createdAt : todayIso(),
        readAt: isIso(n.readAt) ? n.readAt : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, 120);

  const muted = {};
  const incomingMuted = src.muted && typeof src.muted === "object" ? src.muted : {};
  Object.keys(incomingMuted).forEach((g) => {
    if (!/^[a-z][a-z0-9-]{0,29}$/.test(String(g || ""))) return;
    muted[g] = isIso(incomingMuted[g]) ? incomingMuted[g] : todayIso();
  });

  return {
    items,
    muted,
    lastSyncAt: isIso(src.lastSyncAt) ? src.lastSyncAt : "",
    initialized: !!src.initialized || items.length > 0,
  };
}

// Mesclagem de backup: UNIÃO por `key`. Um aviso lido em qualquer um dos lados
// permanece lido; restaurar um backup antigo não deve reacender um badge que o
// usuário já resolveu.
function mergeNotifications(left, right) {
  const a = normalizeNotifications(left);
  const b = normalizeNotifications(right);
  const byKey = new Map();
  a.items.concat(b.items).forEach((n) => {
    const cur = byKey.get(n.key);
    if (!cur) { byKey.set(n.key, n); return; }
    byKey.set(n.key, {
      ...cur,
      readAt: cur.readAt || n.readAt,
      createdAt: cur.createdAt < n.createdAt ? cur.createdAt : n.createdAt,
    });
  });
  const muted = { ...a.muted };
  Object.keys(b.muted).forEach((g) => { if (!muted[g] || b.muted[g] > muted[g]) muted[g] = b.muted[g]; });
  return normalizeNotifications({
    items: Array.from(byKey.values()),
    muted,
    lastSyncAt: a.lastSyncAt > b.lastSyncAt ? a.lastSyncAt : b.lastSyncAt,
    initialized: a.initialized || b.initialized,
  });
}

const ACCOUNT_TYPES = ["corrente", "poupanca", "dinheiro", "digital", "outro"];

function normalizeAccounts(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((a) => {
    const id = normalizeRecordId(a.id, "account");
    if (seen.has(id)) return null;
    seen.add(id);
    const openingDate = isRealIsoDate(String(a.openingDate || "")) ? String(a.openingDate) : todayIso();
    return {
      id,
      name: String(a.name || "Conta").trim().slice(0, 60) || "Conta",
      type: ACCOUNT_TYPES.includes(a.type) ? a.type : "outro",
      openingBalance: roundMoney(a.openingBalance),
      openingDate,
      color: normalizeHexColor(a.color, "#0B6B5C"),
      archived: !!a.archived,
      reconciledAt: normalizeIsoDate(a.reconciledAt) || null,
      createdAt: a.createdAt || new Date().toISOString(),
      updatedAt: a.updatedAt || a.createdAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeCreditCards(raw, accounts) {
  const accountIds = new Set((accounts || []).map((a) => a.id));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((c) => {
    const id = normalizeRecordId(c.id, "card");
    if (seen.has(id)) return null;
    seen.add(id);
    const closingDay = clamp(parseInt(c.closingDay, 10) || 20, 1, 31);
    const dueDay = clamp(parseInt(c.dueDay, 10) || 28, 1, 31);
    return {
      id,
      name: String(c.name || "Cartão").trim().slice(0, 60) || "Cartão",
      accountId: accountIds.has(normalizeRecordRef(c.accountId, "account")) ? normalizeRecordRef(c.accountId, "account") : null,
      limit: Math.max(0, roundMoney(c.limit)),
      closingDay,
      dueDay,
      color: normalizeHexColor(c.color, "#3C6E8F"),
      archived: !!c.archived,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || c.createdAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeAccountTransfers(raw, accounts) {
  const ids = new Set((accounts || []).map((a) => a.id));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((t) => {
    const id = normalizeRecordId(t.id, "transfer");
    const fromAccountId = normalizeRecordRef(t.fromAccountId, "account");
    const toAccountId = normalizeRecordRef(t.toAccountId, "account");
    if (seen.has(id) || !ids.has(fromAccountId) || !ids.has(toAccountId) || fromAccountId === toAccountId) return null;
    const amount = Math.abs(roundMoney(t.amount));
    if (!(amount > 0)) return null;
    seen.add(id);
    return {
      id, fromAccountId, toAccountId, amount,
      date: isRealIsoDate(String(t.date || "")) ? t.date : todayIso(),
      description: String(t.description || "Transferência").trim().slice(0, 100),
      source: "transfer",
      origin: normalizeTransactionOrigin(t.origin, "transfer", t.createdAt),
      sourceTransactionIds: (Array.isArray(t.sourceTransactionIds) ? t.sourceTransactionIds : []).filter((value) => typeof value === "string" && value.trim()).map((value) => normalizeRecordId(value, "transaction")).slice(0, 2),
      changeLog: normalizeTransactionLog(t.changeLog, t.createdAt, "transfer"),
      createdAt: t.createdAt || new Date().toISOString(), updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeCardPayments(raw, accounts, cards) {
  const accountIds = new Set((accounts || []).map((a) => a.id));
  const cardIds = new Set((cards || []).map((c) => c.id));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((p) => {
    const id = normalizeRecordId(p.id, "payment");
    const accountId = normalizeRecordRef(p.accountId, "account");
    const creditCardId = normalizeRecordRef(p.creditCardId, "card");
    const amount = Math.abs(roundMoney(p.amount));
    if (seen.has(id) || !accountIds.has(accountId) || !cardIds.has(creditCardId) || !(amount > 0)) return null;
    seen.add(id);
    return {
      id, accountId, creditCardId, amount,
      statementKey: /^\d{4}-\d{2}$/.test(String(p.statementKey || "")) ? p.statementKey : monthKeyOf(p.date || todayIso()),
      date: isRealIsoDate(String(p.date || "")) ? p.date : todayIso(),
      source: "card-payment",
      origin: normalizeTransactionOrigin(p.origin, "card-payment", p.createdAt),
      sourceTransactionIds: (Array.isArray(p.sourceTransactionIds) ? p.sourceTransactionIds : []).filter((value) => typeof value === "string" && value.trim()).map((value) => normalizeRecordId(value, "transaction")).slice(0, 1),
      changeLog: normalizeTransactionLog(p.changeLog, p.createdAt, "card-payment"),
      createdAt: p.createdAt || new Date().toISOString(), updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeAccountAdjustments(raw, accounts) {
  const accountIds = new Set((accounts || []).map((a) => a.id));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(Boolean).map((a) => {
    const id = normalizeRecordId(a.id, "adjustment");
    const accountId = normalizeRecordRef(a.accountId, "account");
    if (seen.has(id) || !accountIds.has(accountId)) return null;
    seen.add(id);
    return {
      id, accountId, amount: roundMoney(a.amount),
      date: isRealIsoDate(String(a.date || "")) ? a.date : todayIso(),
      note: String(a.note || "Conciliação de saldo").trim().slice(0, 100),
      createdAt: a.createdAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

// ==============================================================================
// v14. LÁPIDES DE EXCLUSÃO
// ==============================================================================
// A mesclagem de backup resolve conflito de mesmo id pelo `updatedAt` mais
// recente e NUNCA remove nada ("nada é apagado, apenas complementado"). Isso
// funciona enquanto existe um aparelho só. No dia em que dois aparelhos
// sincronizarem, um registro apagado aqui volta do backup do outro, porque a
// ausência de um id é indistinguível de "esse aparelho ainda não conhece".
//
// A lápide resolve isso registrando a exclusão como um FATO datado, que pode
// ser comparado com a edição do outro lado. A regra:
//
//   registro volta a existir  ⟺  ele foi EDITADO depois de ter sido apagado
//
// Ou seja: apagar no celular e restaurar um backup antigo do desktop não
// ressuscita o registro; mas editar no desktop depois de já ter apagado no
// celular ganha, porque a edição é mais recente que a exclusão.
//
// Escrever isto agora custa um campo. Depois de ligar a nuvem, custaria uma
// migração com dado divergente em produção.
const GRAVEYARD_COLLECTIONS = ["transactions", "categories", "goals", "assets"];
const GRAVEYARD_MAX_PER_COLLECTION = 4000;
const GRAVEYARD_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000;   // ~24 meses

function defaultGraveyard() {
  const out = {};
  GRAVEYARD_COLLECTIONS.forEach((c) => { out[c] = {}; });
  return out;
}

const GRAVE_PREFIXES = { transactions: "transaction", categories: "category", goals: "goal", assets: "asset" };

// Cada lápide guarda DUAS coisas: a data (legível, usada para poda) e a marca
// do relógio lógico (usada para decidir o conflito). Bases antigas trazem só a
// data, em texto; elas continuam válidas, e a marca é derivada dela.
function normalizeGraveEntry(value) {
  if (typeof value === "string") {
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return null;
    const at = new Date(ts).toISOString();
    return { at, rev: syncRevFromDate(at, "legacy") };
  }
  if (!value || typeof value !== "object") return null;
  const ts = Date.parse(value.at || "");
  if (!Number.isFinite(ts)) return null;
  const at = new Date(ts).toISOString();
  return { at, rev: normalizeSyncRev(value.rev) || syncRevFromDate(at, "legacy") };
}

// Lápide corrompida é DESCARTADA, não consertada com data inventada: uma data
// falsa decide errado o conflito com uma edição legítima do outro aparelho.
function normalizeGraveyard(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const now = Date.now();
  const out = defaultGraveyard();
  GRAVEYARD_COLLECTIONS.forEach((coll) => {
    const bucket = src[coll] && typeof src[coll] === "object" ? src[coll] : {};
    const entries = Object.keys(bucket)
      .map((id) => {
        const entry = normalizeGraveEntry(bucket[id]);
        if (!entry) return null;
        if (now - Date.parse(entry.at) > GRAVEYARD_MAX_AGE_MS) return null;   // poda: exclusão antiga não precisa de prova
        return [normalizeRecordId(id, GRAVE_PREFIXES[coll]), entry];
      })
      .filter(Boolean)
      .sort((a, b) => (a[1].at < b[1].at ? 1 : -1))         // mais recentes primeiro
      .slice(0, GRAVEYARD_MAX_PER_COLLECTION);
    entries.forEach(([id, entry]) => { out[coll][id] = entry; });
  });
  return out;
}

// União de dois cemitérios: a exclusão de marca MAIOR prevalece, porque é ela
// que tem de ser comparada com a edição mais recente do outro lado.
function mergeGraveyards(a, b) {
  const left = normalizeGraveyard(a);
  const right = normalizeGraveyard(b);
  const out = defaultGraveyard();
  GRAVEYARD_COLLECTIONS.forEach((coll) => {
    Object.keys(left[coll]).forEach((id) => { out[coll][id] = left[coll][id]; });
    Object.keys(right[coll]).forEach((id) => {
      const cur = out[coll][id];
      if (!cur || syncRevGreater(right[coll][id].rev, cur.rev) || (!cur.rev && right[coll][id].at > cur.at)) {
        out[coll][id] = right[coll][id];
      }
    });
  });
  return normalizeGraveyard(out);
}

// Marca ids como excluídos. Ponto único de entrada; a UI chama isto em vez de
// filtrar a lista na mão, senão a exclusão some sem deixar registro.
function withTombstones(graveyard, collection, ids) {
  if (GRAVEYARD_COLLECTIONS.indexOf(collection) === -1) return normalizeGraveyard(graveyard);
  const at = new Date().toISOString();
  const base = normalizeGraveyard(graveyard);
  const next = { ...base, [collection]: { ...base[collection] } };
  (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
    // Uma marca por id: duas exclusões na mesma milissegunda precisam de ordens
    // distintas, senão a segunda não supera a primeira em outro aparelho.
    if (id) next[collection][normalizeRecordId(id, GRAVE_PREFIXES[collection])] = { at, rev: SyncClock.tick() };
  });
  return normalizeGraveyard(next);
}

// Lápide recebida de outro aparelho: a marca vem PRONTA, e não pode ser
// substituída por uma nova daqui. Refazer a marca faria a exclusão parecer mais
// recente do que é e derrubaria edições legítimas feitas depois dela.
function withRemoteTombstone(graveyard, collection, id, rev) {
  if (GRAVEYARD_COLLECTIONS.indexOf(collection) === -1) return normalizeGraveyard(graveyard);
  const base = normalizeGraveyard(graveyard);
  const next = { ...base, [collection]: { ...base[collection] } };
  const parsed = SyncClock.parse(rev);
  const at = parsed ? new Date(parsed.millis).toISOString() : new Date().toISOString();
  next[collection][normalizeRecordId(id, GRAVE_PREFIXES[collection])] = { at, rev: normalizeSyncRev(rev) };
  return normalizeGraveyard(next);
}

// Um registro ressuscitado por mesclagem só sobrevive se foi TOCADO depois da
// exclusão. A comparação preferida é pela marca lógica; a data só entra quando
// um dos lados vem de uma base antiga, sem marca. Sem nenhum dos dois, a
// exclusão vence: o silêncio de um lado não deveria derrubar um ato explícito
// do outro.
function survivesTombstone(record, grave) {
  const entry = normalizeGraveEntry(grave);
  if (!entry) return true;
  const rev = record && normalizeSyncRev(record.syncRev);
  if (rev && entry.rev) return syncRevGreater(rev, entry.rev);
  const touched = (record && (record.updatedAt || record.createdAt)) || "";
  return touched > entry.at;
}

function applyGraveyard(list, graveyard, collection) {
  const bucket = (graveyard && graveyard[collection]) || {};
  if (Object.keys(bucket).length === 0) return list;
  return list.filter((rec) => survivesTombstone(rec, bucket[rec && rec.id]));
}

function defaultData() {
  return {
    version: SCHEMA_VERSION,
    transactions: [],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    goals: [],
    assets: [],
    monthlyIncome: 0,
    creditCardLimit: 0,
    theme: "light",
    dismissedCarryForwardMonth: null,
    budgetSplit: defaultBudgetSplit(),
    budgetAlerts: defaultBudgetAlerts(),
    budgetHistory: {},
    userName: "",
    emergencyGoalId: null,
    emergencyMonths: 6,
    marketRates: defaultMarketRates(),
    achievements: defaultAchievements(),
    recurringPrefs: defaultRecurringPrefs(),
    notifications: defaultNotifications(),
    accounts: [],
    creditCards: [],
    accountTransfers: [],
    cardPayments: [],
    accountAdjustments: [],
    debtPlan: normalizeDebtPlan(null),
    onboarding: defaultOnboarding(),
    dashboardLayout: defaultDashboardLayout(),
    dashboardFocus: "month",
    categoryRules: defaultCategoryRules(),
    privacy: defaultPrivacy(),
    graveyard: defaultGraveyard(),
    // Data do último backup exportado. Existe para uma coisa só: permitir que o
    // app avise quem nunca exportou. Local-first significa que trocar de
    // aparelho ou limpar os dados do site apaga tudo, e hoje o único socorro é
    // o usuário ter lembrado sozinho de exportar.
    lastBackupAt: null,
    lastPersistAt: 0,
  };
}

function clampPct(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback;
}
function normalizeBudgetAlert(n, fallback, max) {
  const value = Number(n);
  return Number.isFinite(value) && value >= 1 && value <= max ? value : fallback;
}
// Orçamento de categoria: número positivo em reais, ou null (sem limite).
function normalizeBudgetValue(v) {
  if (v == null || v === "") return null;
  const n = parseMoneyInput(v);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : null;
}

// Normaliza + migra qualquer formato antigo para o formato atual.
// Continua sendo a única fonte de verdade sobre o "shape" dos dados.
function migrate(parsed) {
  const base = defaultData();
  const incomingVersion = (parsed && Number(parsed.version)) || 0;
  let data = Object.assign({}, base, parsed || {});

  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    data.categories = base.categories;
  } else {
    data.categories = data.categories.map((c) => ({
      id: normalizeRecordId(c.id, "category"),
      name: String(c.name || "Categoria").trim().slice(0, 60) || "Categoria",
      color: normalizeHexColor(c.color, PALETTE[0]),
      icon: normalizeIconName(c.icon, "tag"),
      budget: normalizeBudgetValue(c.budget),
      parentId: normalizeRecordRef(c.parentId, "category"),
      group: BUDGET_GROUPS.includes(c.group) ? c.group : (GROUP_ID_FALLBACK[c.id] || "necessidade"),
      syncRev: normalizeSyncRev(c.syncRev),
    }));
    if (!data.categories.some((c) => c.id === "investimento")) {
      data.categories.push({ id: "investimento", name: "Investimentos", color: "#1F8A5F", icon: "trendUp", budget: null, parentId: null, group: "futuro" });
    }
    if (data.categories.some((c) => c.id === "alimentacao")) {
      if (!data.categories.some((c) => c.id === "mercado")) {
        data.categories.push({ id: "mercado", name: "Mercado", color: PALETTE[1], icon: "cart", budget: null, parentId: "alimentacao", group: "necessidade" });
      }
      if (!data.categories.some((c) => c.id === "delivery")) {
        data.categories.push({ id: "delivery", name: "Delivery", color: PALETTE[1], icon: "coffee", budget: null, parentId: "alimentacao", group: "desejo" });
      }
    }
  }
  // Quebra ciclos de parentesco (dado corrompido/importado) e limita a 1 nível.
  {
    const seen = new Set();
    data.categories = data.categories.filter((c) => seen.has(c.id) ? false : (seen.add(c.id), true));
  }
  const catIds = new Set(data.categories.map((c) => c.id));
  data.categories = data.categories.map((c) => {
    if (!c.parentId) return c;
    if (c.parentId === c.id || !catIds.has(c.parentId)) return { ...c, parentId: null };
    return c;
  });

  if (!Array.isArray(data.transactions)) data.transactions = [];
  data.transactions = data.transactions.map((t) => {
    const date = isRealIsoDate(String(t.date || "")) ? String(t.date) : todayIso();
    return {
      id: normalizeRecordId(t.id, "transaction"), type: t.type === "income" ? "income" : "expense",
      // Valor sempre normalizado para 2 casas: impede que um float sujo vindo de
      // versão antiga/import contamine todas as somas futuras.
      amount: Math.abs(roundMoney(t.amount)),
      categoryId: catIds.has(normalizeRecordId(t.categoryId || "outros", "category"))
        ? normalizeRecordId(t.categoryId || "outros", "category")
        : (catIds.has("outros") ? "outros" : data.categories[0].id),
      date, payment: PAYMENT_METHODS.includes(t.payment) ? t.payment : "Outro",
      description: String(t.description || "").trim().slice(0, 200), recurring: !!t.recurring,
      createdAt: t.createdAt || date,
      updatedAt: t.updatedAt || t.createdAt || date,
      goalId: normalizeRecordRef(t.goalId, "goal"),
      installmentGroupId: normalizeRecordRef(t.installmentGroupId, "installment"),
      installmentIndex: t.installmentIndex || null,
      installmentTotal: t.installmentTotal || null,
      source: transactionSourceOf(t.source),
      origin: normalizeTransactionOrigin(t.origin, transactionSourceOf(t.source), t.createdAt || date),
      changeLog: normalizeTransactionLog(t.changeLog, t.createdAt || date, transactionSourceOf(t.source)),
      reviewedIssues: normalizeReviewedIssues(t.reviewedIssues),
      accountId: normalizeRecordRef(t.accountId, "account"),
      creditCardId: normalizeRecordRef(t.creditCardId, "card"),
      debtId: normalizeRecordRef(t.debtId, "asset"),
      monthKey: monthKeyOf(date),              // índice denormalizado (consulta rápida no IndexedDB)
      // Marca do relógio lógico. Preservada aqui porque `migrate` reconstrói o
      // registro campo a campo: sem esta linha a marca some a cada leitura e o
      // conflito volta a ser decidido pelo relógio do aparelho.
      syncRev: normalizeSyncRev(t.syncRev),
      // Copiada CRUA aqui e validada logo abaixo. Sem esta linha, `migrate`
      // reconstrói o registro sem o campo e a natureza declarada pelo usuário
      // some a cada leitura, voltando para o valor deduzido.
      nature: String(t.nature || ""),
    };
  });
  // A validação depende do registro já normalizado (tipo, meta, dívida,
  // categoria), então é uma segunda passada.
  data.transactions = data.transactions.map((t) => {
    const nature = normalizeTransactionNature(t.nature, t);
    return t.nature === nature ? t : { ...t, nature };
  });

  // ---- v6: patrimônio cadastrado (Módulo 3) ----
  if (!Array.isArray(data.assets)) data.assets = [];
  data.assets = data.assets
    .filter((a) => a && (a.name || a.value != null))
    .map((a) => makeAsset({ ...a, id: a.id || uid() }));
  // Remove duplicidade de id vinda de import/merge malfeito.
  {
    const seen = new Set();
    data.assets = data.assets.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }

  if (!Array.isArray(data.goals)) data.goals = [];
  data.goals = data.goals.map((g) => {
    const current = Math.max(0, roundMoney(g.current));
    return {
      id: normalizeRecordId(g.id, "goal"), name: String(g.name || "Meta").trim().slice(0, 60) || "Meta", target: roundMoney(g.target),
      current, savedUpfront: Math.max(0, roundMoney(g.savedUpfront)),
      // v18: valor anterior ao app que continua incluído no saldo. Ele conta no
      // progresso da meta, mas não pode ser somado novamente ao patrimônio.
      existingBalance: Math.min(current, Math.max(0, roundMoney(g.existingBalance))),
      deadline: isRealIsoDate(String(g.deadline || "")) ? g.deadline : "",
      icon: normalizeIconName(g.icon, "piggy"), createdAt: g.createdAt || todayIso(),
      // ---- v7 (Módulo 4): aporte mensal PLANEJADO pelo usuário ----
      // É o compromisso ("vou guardar R$ 400 por mês"), diferente do aporte
      // NECESSÁRIO (derivado do prazo) e do ritmo REAL (derivado dos lançamentos).
      // Os três são exibidos lado a lado; nenhum é inventado a partir do outro.
      monthlyPlan: Math.max(0, roundMoney(g.monthlyPlan)),
      syncRev: normalizeSyncRev(g.syncRev),
    };
  });
  {
    const seen = new Set();
    data.goals = data.goals.filter((g) => seen.has(g.id) ? false : (seen.add(g.id), true));
  }

  // ---- Migração de continuidade (v<3 → v3) ----
  // Antes da v3, o valor guardado numa meta era só um número (goal.current) e o app
  // "escondia" esse valor do saldo livre. Agora aportes são transações reais. Para
  // o saldo não pular na atualização, gravamos um lançamento de ajuste, uma única vez.
  if (incomingVersion > 0 && incomingVersion < 3) {
    data.goals.forEach((g) => {
      if (g.current > 0) {
        data.transactions.push({
          id: uid(), type: "expense", amount: roundMoney(g.current), categoryId: "investimento",
          date: todayIso(), payment: "Outro",
          description: `Saldo acumulado (migração). ${g.name}`,
          recurring: false, createdAt: todayIso(), updatedAt: todayIso(), goalId: g.id, migrated: true,
          source: "manual", monthKey: monthKeyOf(todayIso()),
          installmentGroupId: null, installmentIndex: null, installmentTotal: null,
        });
      }
    });
  }

  // ---- v17: contrapartida do valor inicial das metas ----
  // `savedUpfront` sempre fez parte de `goal.current`, mas metas criadas nas
  // versões 3..16 não debitavam o mesmo valor do caixa. O patrimônio acabava
  // somando o dinheiro duas vezes. A transação determinística completa o mesmo
  // modelo contábil já usado pelos aportes normais: sai do caixa e entra no
  // bucket da meta, sem alterar o patrimônio líquido.
  if (incomingVersion < 17) {
    const txIds = new Set(data.transactions.map((t) => t.id));
    data.goals.forEach((g) => {
      const amount = Math.max(0, roundMoney(g.savedUpfront));
      if (!(amount > 0)) return;

      const seedId = normalizeRecordId(`goal-upfront:${g.id}`, "transaction");
      if (txIds.has(seedId)) return;

      // Bases anteriores à v3 acabaram de receber, no bloco acima, um ajuste
      // pelo saldo total da meta. Criar outro pelo savedUpfront duplicaria o
      // débito na mesma execução da migração.
      const legacyAdjustment = data.transactions.some((t) => (
        t.goalId === g.id
        && t.type === "expense"
        && (t.migrated === true || /^Saldo acumulado \(migra/i.test(t.description || ""))
      ));
      if (legacyAdjustment) return;

      const rawDate = String(g.createdAt || "").slice(0, 10);
      const parsedDate = new Date(`${rawDate}T12:00:00`);
      const date = isRealIsoDate(rawDate)
        && !Number.isNaN(parsedDate.getTime())
        && isoOfDate(parsedDate) === rawDate
        ? rawDate
        : todayIso();
      data.transactions.push({
        id: seedId,
        type: "expense",
        amount,
        categoryId: "investimento",
        date,
        payment: "Outro",
        description: `Valor inicial da meta. ${g.name}`,
        recurring: false,
        createdAt: g.createdAt || date,
        updatedAt: g.createdAt || date,
        goalId: g.id,
        migrated: true,
        source: "goal-upfront",
        monthKey: monthKeyOf(date),
        installmentGroupId: null,
        installmentIndex: null,
        installmentTotal: null,
        accountId: null,
        creditCardId: null,
        debtId: null,
      });
      txIds.add(seedId);
    });
  }

  data.monthlyIncome = roundMoney(data.monthlyIncome);
  data.creditCardLimit = roundMoney(data.creditCardLimit);
  data.theme = data.theme === "dark" ? "dark" : "light";
  const bs = data.budgetSplit && typeof data.budgetSplit === "object" ? data.budgetSplit : {};
  data.budgetSplit = {
    necessidade: clampPct(bs.necessidade, 50),
    desejo: clampPct(bs.desejo, 30),
    futuro: clampPct(bs.futuro, 20),
  };
  const ba = data.budgetAlerts && typeof data.budgetAlerts === "object" ? data.budgetAlerts : {};
  data.budgetAlerts = {
    warn: normalizeBudgetAlert(ba.warn, 80, 200),
    over: normalizeBudgetAlert(ba.over, 100, 300),
  };
  data.budgetHistory = normalizeBudgetHistory(data.budgetHistory);
  const currentBudgetMonth = keyOfDate(new Date());
  const transactionBudgetMonths = data.transactions.map((t) => t.monthKey || monthKeyOf(t.date)).filter(Boolean).sort();
  const firstDataMonth = transactionBudgetMonths[0] || currentBudgetMonth;
  const historyMonths = Object.keys(data.budgetHistory).sort();
  if (historyMonths.length === 0) {
    data = withBudgetSnapshot(data, firstDataMonth);
    if (firstDataMonth !== currentBudgetMonth) data = withBudgetSnapshot(data, currentBudgetMonth);
  } else if (firstDataMonth < historyMonths[0]) {
    const oldest = data.budgetHistory[historyMonths[0]];
    data.budgetHistory = {
      ...data.budgetHistory,
      [firstDataMonth]: { ...oldest, monthKey: firstDataMonth },
    };
  }
  // ---- v5: perfil e reserva de emergência ----
  data.userName = String(data.userName == null ? "" : data.userName).trim().slice(0, 40);
  const emergencyId = data.emergencyGoalId || null;
  // Só mantemos o vínculo se a meta ainda existir (evita ponteiro órfão após exclusão).
  data.emergencyGoalId = emergencyId && data.goals.some((g) => g.id === emergencyId) ? emergencyId : null;
  const em = Number(data.emergencyMonths);
  data.emergencyMonths = Number.isFinite(em) && em >= 1 && em <= 24 ? Math.round(em) : 6;

  // ---- v8: premissas de mercado (Módulo 5) ----
  data.marketRates = normalizeMarketRates(data.marketRates);

  // ---- v9: conquistas (Módulo 6) ----
  data.achievements = normalizeAchievements(data.achievements);

  // ---- v10: acompanhamento de recorrências (Módulo 7) ----
  data.recurringPrefs = normalizeRecurringPrefs(data.recurringPrefs);

  // ---- v11: central de notificações (Módulo 8) ----
  data.notifications = normalizeNotifications(data.notifications);

  // ---- v15: configuração inicial ----
  // Lê do OBJETO CRU, não do mesclado: `Object.assign` com defaultData() já teria
  // enfiado um `{ done: false }` aqui, e a inferência nunca dispararia para uma
  // base anterior à v15; todo usuário antigo seria recebido por boas-vindas.
  data.onboarding = normalizeOnboarding(parsed && parsed.onboarding, data);

  // ---- v12: contas, cartões e movimentos internos ----
  data.accounts = normalizeAccounts(data.accounts);
  data.creditCards = normalizeCreditCards(data.creditCards, data.accounts);
  {
    const accountIds = new Set(data.accounts.map((a) => a.id));
    const cardIds = new Set(data.creditCards.map((c) => c.id));
    data.transactions = data.transactions.map((t) => {
      const creditCardId = cardIds.has(t.creditCardId) ? t.creditCardId : null;
      return {
        ...t,
        accountId: creditCardId ? null : (accountIds.has(t.accountId) ? t.accountId : null),
        creditCardId,
      };
    });
  }
  data.accountTransfers = normalizeAccountTransfers(data.accountTransfers, data.accounts);
  data.cardPayments = normalizeCardPayments(data.cardPayments, data.accounts, data.creditCards);
  data.accountAdjustments = normalizeAccountAdjustments(data.accountAdjustments, data.accounts);

  // ---- v13: central de dívidas ----
  data.debtPlan = normalizeDebtPlan(data.debtPlan);
  {
    const debtIds = new Set(data.assets.filter((a) => a.kind === "liability").map((a) => a.id));
    data.transactions = data.transactions.map((t) => ({ ...t, debtId: debtIds.has(t.debtId) ? t.debtId : null }));
  }

  // ---- v16: personalização do Início e regras de categorização ----
  // Os dois normalizadores vivem em layout.js e rules.js. Reconciliar aqui (e
  // não na tela) garante que um backup de outra versão, com cartão que não
  // existe mais ou regra apontando para categoria apagada, entre saneado.
  data.dashboardLayout = normalizeDashboardLayout(data.dashboardLayout);
  data.dashboardFocus = normalizeDashboardFocus(data.dashboardFocus);
  data.categoryRules = normalizeCategoryRules(data.categoryRules);

  // ---- v22: privacidade e consentimentos ----
  // Bases antigas não recebem aceite presumido. A preferência de IA nasce em
  // "perguntar", mantendo a confirmação antes de cada envio.
  data.privacy = normalizePrivacy(data.privacy);

  // ---- v14: lápides de exclusão ----
  data.graveyard = normalizeGraveyard(data.graveyard);
  // Data inválida vira "nunca fez backup" em vez de silenciar o aviso: errar
  // para o lado de lembrar é barato; errar para o lado de calar custa os dados.
  data.lastBackupAt = normalizeIsoDate(data.lastBackupAt) || null;

  data.lastPersistAt = Number(data.lastPersistAt) || 0;
  data.version = SCHEMA_VERSION;
  return data;
}

// ==============================================================================
// CAMADA 1. CONTRATO DO ADAPTER
// ==============================================================================
//   init()                  → prepara a conexão. Lança erro se indisponível.
//   readAll()               → { transactions, categories, goals, settings }
//   writeChanges(changeSet) → aplica um diff { puts, deletes, settings }
//   replaceAll(data)        → sobrescreve tudo (restore de backup / reset)
//   clearAll()              → apaga tudo
// ==============================================================================

class StorageAdapter {
  get name() { return "abstract"; }
  get supportsIndexes() { return false; }
  async init() { throw new Error("init() não implementado"); }
  async readAll() { throw new Error("readAll() não implementado"); }
  async writeChanges(_changeSet) { throw new Error("writeChanges() não implementado"); }
  async replaceAll(_data) { throw new Error("replaceAll() não implementado"); }
  async clearAll() { throw new Error("clearAll() não implementado"); }
  // Fila de sincronização; o adapter em memória simplesmente não guarda nada.
  async outboxAppend(_entries) { return false; }
  async outboxRead(_limit) { return []; }
  async outboxDrop(_seqs) { return false; }
  async outboxClear() { return false; }
  close() {}
}

// ------------------------------------------------------------------------------
// IndexedDBAdapter; adapter principal (Local-First, alta performance)
// ------------------------------------------------------------------------------
class IndexedDBAdapter extends StorageAdapter {
  // `scope` decide o nome físico do banco. Sem ele, duas contas no mesmo
  // aparelho compartilhariam registros.
  constructor(scope) {
    super();
    this.db = null;
    this.scope = normalizeStorageScope(scope);
    this.dbName = scopedName(DB_NAME, this.scope);
  }
  get name() { return "indexeddb"; }
  get supportsIndexes() { return true; }

  static isSupported() {
    try { return typeof indexedDB !== "undefined" && indexedDB !== null; }
    catch (e) { return false; }
  }

  async init() {
    if (!IndexedDBAdapter.isSupported()) throw new Error("IndexedDB indisponível neste navegador");
    this.db = await new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(this.dbName, DB_VERSION); }
      catch (e) { reject(e); return; }

      // Safari/iOS às vezes nunca dispara evento algum no modo privado.

      const guard = setTimeout(() => reject(new Error("IndexedDB não respondeu (modo privado?)")), 8000);
      const settle = (fn) => (arg) => { clearTimeout(guard); fn(arg); };

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_TX)) {
          const s = db.createObjectStore(STORE_TX, { keyPath: "id" });
          s.createIndex("by_monthKey", "monthKey", { unique: false });
          s.createIndex("by_date", "date", { unique: false });
          s.createIndex("by_category", "categoryId", { unique: false });
          s.createIndex("by_type", "type", { unique: false });
          s.createIndex("by_goal", "goalId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CAT)) {
          const s = db.createObjectStore(STORE_CAT, { keyPath: "id" });
          s.createIndex("by_parent", "parentId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_GOALS)) {
          db.createObjectStore(STORE_GOALS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        }
        // v2 (Módulo 3). O `contains` acima e aqui é o que permite subir a versão
        // do banco sem tocar nos dados já gravados: bancos antigos ganham só a
        // coleção nova, bancos zerados nascem completos.
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const s = db.createObjectStore(STORE_ASSETS, { keyPath: "id" });
          s.createIndex("by_kind", "kind", { unique: false });
          s.createIndex("by_class", "class", { unique: false });
        }
        // v3. Fila de saída da sincronização. `autoIncrement` dá a ordem de
        // envio; ela precisa sobreviver ao fechamento da aba, senão uma
        // mutação feita offline some antes de chegar ao servidor.
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          db.createObjectStore(STORE_OUTBOX, { keyPath: "seq", autoIncrement: true });
        }
      };
      req.onsuccess = settle(() => resolve(req.result));
      req.onerror = settle(() => reject(req.error || new Error("Falha ao abrir o IndexedDB")));
      req.onblocked = settle(() => reject(new Error("IndexedDB bloqueado por outra aba aberta")));
    });

    // Se o navegador fechar a conexão (ex.: limpeza de site data), invalidamos o cache.

    this.db.onversionchange = () => { try { this.db.close(); } catch (e) {} this.db = null; };
    this.db.onclose = () => { this.db = null; };
    return true;
  }

  // Só entram na transação os stores que REALMENTE existem neste banco. Sem esse
  // filtro, um navegador que tenha falhado no upgrade para v2 quebraria toda a
  // leitura com NotFoundError em vez de apenas ficar sem a coleção nova.
  _existing(stores) {
    if (!this.db) return [];
    return stores.filter((n) => this.db.objectStoreNames.contains(n));
  }

  _has(name) {
    return !!this.db && this.db.objectStoreNames.contains(name);
  }

  _tx(stores, mode) {
    if (!this.db) throw new Error("Banco de dados não inicializado");
    const usable = this._existing(stores);
    if (usable.length === 0) throw new Error("Nenhuma coleção disponível no banco");
    return this.db.transaction(usable, mode);
  }

  _done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Erro na transação do IndexedDB"));
      tx.onabort = () => reject(tx.error || new Error("Transação abortada"));
    });
  }

  _getAll(store) {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async readAll() {
    const tx = this._tx(ALL_STORES, "readonly");
    const hasAssets = this._has(STORE_ASSETS);
    const [transactions, categories, goals, assets, settingsRows] = await Promise.all([
      this._getAll(tx.objectStore(STORE_TX)),
      this._getAll(tx.objectStore(STORE_CAT)),
      this._getAll(tx.objectStore(STORE_GOALS)),
      hasAssets ? this._getAll(tx.objectStore(STORE_ASSETS)) : Promise.resolve([]),
      this._getAll(tx.objectStore(STORE_SETTINGS)),
    ]);
    const settings = {};
    settingsRows.forEach((row) => { settings[row.key] = row.value; });
    return { transactions, categories, goals, assets, settings };
  }

  // changeSet: { puts: {store: [records]}, deletes: {store: [ids]}, settings: {k:v} }
  async writeChanges(changeSet) {
    const tx = this._tx(ALL_STORES, "readwrite");
    COLLECTIONS.forEach((name) => {
      if (!this._has(name)) return;
      const store = tx.objectStore(name);
      (changeSet.puts[name] || []).forEach((rec) => store.put(rec));
      (changeSet.deletes[name] || []).forEach((id) => store.delete(id));
    });
    const settingsStore = tx.objectStore(STORE_SETTINGS);
    Object.entries(changeSet.settings || {}).forEach(([key, value]) => {
      settingsStore.put({ key, value });
    });
    return this._done(tx);
  }

  async replaceAll(data) {
    const tx = this._tx(ALL_STORES, "readwrite");
    this._existing(ALL_STORES).forEach((s) => tx.objectStore(s).clear());
    data.transactions.forEach((t) => tx.objectStore(STORE_TX).put(t));
    data.categories.forEach((c) => tx.objectStore(STORE_CAT).put(c));
    data.goals.forEach((g) => tx.objectStore(STORE_GOALS).put(g));
    if (this._has(STORE_ASSETS)) (data.assets || []).forEach((a) => tx.objectStore(STORE_ASSETS).put(a));
    SETTING_KEYS.forEach((key) => tx.objectStore(STORE_SETTINGS).put({ key, value: data[key] }));
    return this._done(tx);
  }

  async clearAll() {
    const tx = this._tx(ALL_STORES, "readwrite");
    this._existing(ALL_STORES).forEach((s) => tx.objectStore(s).clear());
    return this._done(tx);
  }

  // ---- Consultas indexadas (usadas por relatórios) ----
  async queryByIndex(storeName, indexName, value) {
    const tx = this._tx([storeName], "readonly");
    const idx = tx.objectStore(storeName).index(indexName);
    return new Promise((resolve, reject) => {
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- Fila persistente de sincronização ----
  // Gravada na MESMA transação nunca: a fila é escrita depois do dado local,
  // porque perder uma entrada da fila custa uma reenvio; perder o dado custa o
  // lançamento do usuário.
  async outboxAppend(entries) {
    if (!this._has(STORE_OUTBOX) || !entries.length) return true;
    const tx = this._tx([STORE_OUTBOX], "readwrite");
    const store = tx.objectStore(STORE_OUTBOX);
    entries.forEach((entry) => store.put({ ...entry, seq: undefined }));
    return this._done(tx);
  }

  async outboxRead(limit) {
    if (!this._has(STORE_OUTBOX)) return [];
    const tx = this._tx([STORE_OUTBOX], "readonly");
    const all = await this._getAll(tx.objectStore(STORE_OUTBOX));
    all.sort((a, b) => Number(a.seq) - Number(b.seq));
    return limit > 0 ? all.slice(0, limit) : all;
  }

  async outboxDrop(seqs) {
    if (!this._has(STORE_OUTBOX) || !seqs.length) return true;
    const tx = this._tx([STORE_OUTBOX], "readwrite");
    const store = tx.objectStore(STORE_OUTBOX);
    seqs.forEach((seq) => store.delete(Number(seq)));
    return this._done(tx);
  }

  async outboxClear() {
    if (!this._has(STORE_OUTBOX)) return true;
    const tx = this._tx([STORE_OUTBOX], "readwrite");
    tx.objectStore(STORE_OUTBOX).clear();
    return this._done(tx);
  }

  // Trocar de conta precisa FECHAR a conexão. Sem isso o banco antigo fica
  // aberto, segura upgrades e mantém uma referência viva aos dados da conta
  // que acabou de sair.
  close() {
    try { if (this.db) this.db.close(); } catch (e) { /* já fechado */ }
    this.db = null;
  }
}

// ------------------------------------------------------------------------------
// LocalStorageAdapter; fallback para navegadores sem IndexedDB.
// ------------------------------------------------------------------------------
class LocalStorageAdapter extends StorageAdapter {
  constructor(scope) {
    super();
    this.scope = normalizeStorageScope(scope);
    this.key = scopedName(LS_FALLBACK_KEY, this.scope);
    this.outboxKey = scopedName("financas_db_outbox", this.scope);
  }
  get name() { return "localstorage"; }

  static isSupported() {
    try {
      const k = "__financas_test__";
      localStorage.setItem(k, "1");
      const ok = localStorage.getItem(k) === "1";
      localStorage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }

  async init() {
    if (!LocalStorageAdapter.isSupported()) throw new Error("localStorage indisponível");
    return true;
  }

  _read() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  async readAll() {
    const parsed = this._read();
    if (!parsed) return { transactions: [], categories: [], goals: [], settings: {} };
    const settings = {};
    SETTING_KEYS.forEach((k) => { if (parsed[k] !== undefined) settings[k] = parsed[k]; });
    return {
      transactions: parsed.transactions || [],
      categories: parsed.categories || [],
      goals: parsed.goals || [],
      assets: parsed.assets || [],
      settings,
    };
  }

  async writeChanges(changeSet) {
    const current = (await this.readAll());
    const apply = (list, name) => {
      const map = new Map(list.map((r) => [r.id, r]));
      (changeSet.puts[name] || []).forEach((r) => map.set(r.id, r));
      (changeSet.deletes[name] || []).forEach((id) => map.delete(id));
      return Array.from(map.values());
    };
    const next = {
      transactions: apply(current.transactions, STORE_TX),
      categories: apply(current.categories, STORE_CAT),
      goals: apply(current.goals, STORE_GOALS),
      assets: apply(current.assets || [], STORE_ASSETS),
      ...current.settings,
      ...(changeSet.settings || {}),
    };
    localStorage.setItem(this.key, JSON.stringify(next));
    return true;
  }

  async replaceAll(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
    return true;
  }

  async clearAll() {
    localStorage.removeItem(this.key);
    return true;
  }

  // ---- Fila persistente (mesma semântica do IndexedDB, em uma chave só) ----
  _readOutbox() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.outboxKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  _writeOutbox(list) {
    try { localStorage.setItem(this.outboxKey, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  async outboxAppend(entries) {
    if (!entries.length) return true;
    const list = this._readOutbox();
    let next = list.length ? Number(list[list.length - 1].seq) || list.length : 0;
    entries.forEach((entry) => { list.push({ ...entry, seq: ++next }); });
    return this._writeOutbox(list);
  }

  async outboxRead(limit) {
    const list = this._readOutbox().sort((a, b) => Number(a.seq) - Number(b.seq));
    return limit > 0 ? list.slice(0, limit) : list;
  }

  async outboxDrop(seqs) {
    const drop = new Set(seqs.map((seq) => Number(seq)));
    return this._writeOutbox(this._readOutbox().filter((entry) => !drop.has(Number(entry.seq))));
  }

  async outboxClear() {
    try { localStorage.removeItem(this.outboxKey); return true; } catch (e) { return false; }
  }
}

// ------------------------------------------------------------------------------
// CloudAdapter; contrato defensivo para uma futura sincronização comercial.
// ------------------------------------------------------------------------------
const CLOUD_SYNC_PROTOCOL = 2;
const CLOUD_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function cloudMutationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Corpo de erro do próprio servidor, lido sem confiar em nada: uma resposta de
// erro pode não ser JSON (página de erro da hospedagem, por exemplo), e uma
// falha ao ler não pode virar outra falha por cima da primeira.
async function cloudErrorBody(res) {
  try {
    const texto = await res.text();
    if (!texto || texto.length > 8192) return {};
    const dados = JSON.parse(texto);
    if (!dados || typeof dados !== "object") return {};
    const code = typeof dados.code === "string" && /^[a-z0-9_]{1,40}$/.test(dados.code) ? dados.code : null;
    const message = typeof dados.message === "string" && dados.message.length <= 300 ? dados.message : null;
    return { code, message };
  } catch (e) { return {}; }
}

class CloudSyncError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "CloudSyncError";
    this.code = code || "sync_error";
    this.status = status || 0;
  }
}

class CloudSyncConflictError extends CloudSyncError {
  constructor(serverRevision) {
    super("Os dados mudaram em outro dispositivo. Recarregue antes de enviar novamente.", "conflict", 409);
    this.name = "CloudSyncConflictError";
    this.serverRevision = serverRevision || null;
  }
}

class CloudAdapter extends StorageAdapter {
  constructor({
    enabled = false,
    baseUrl = "/api/sync",
    token = null,
    deviceId = null,
    fetchImpl = null,
    timeoutMs = 12000,
    allowCrossOrigin = false,
    allowDestructive = false,
    authMode = "bearer",
  } = {}) {
    super();
    if (!enabled) throw new CloudSyncError("A sincronização em nuvem está desativada.", "disabled");
    if (authMode !== "cookie" && (typeof token !== "string" || !token.trim() || token.length > 4096)) {
      throw new CloudSyncError("A sincronização exige uma sessão válida.", "auth_required");
    }
    if (!deviceId) throw new CloudSyncError("A sincronização exige a identificação deste dispositivo.", "device_required");

    const pageOrigin = typeof location !== "undefined" && location.origin ? location.origin : "https://local.invalid";
    let parsedUrl;
    try { parsedUrl = new URL(baseUrl, pageOrigin); }
    catch (e) { throw new CloudSyncError("Endereço de sincronização inválido.", "invalid_url"); }
    const isLocalhost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (parsedUrl.protocol !== "https:" && !(isLocalhost && parsedUrl.protocol === "http:")) {
      throw new CloudSyncError("A sincronização exige HTTPS.", "https_required");
    }
    if (!allowCrossOrigin && parsedUrl.origin !== pageOrigin) {
      throw new CloudSyncError("O servidor de sincronização deve usar a mesma origem do app.", "cross_origin_blocked");
    }

    this.baseUrl = parsedUrl.href.replace(/\/$/, "");
    this.authMode = authMode === "cookie" ? "cookie" : "bearer";
    this.token = this.authMode === "cookie" ? "" : token.trim();
    this.deviceId = normalizeRecordId(deviceId, "device");
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.timeoutMs = clamp(Number(timeoutMs) || 12000, 1000, 30000);
    this.allowDestructive = allowDestructive === true;
    this.revision = null;
    this.initialized = false;
  }
  get name() { return "cloud"; }

  _headers(extra) {
    const h = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Device-Id": this.deviceId,
      "X-Sync-Protocol": String(CLOUD_SYNC_PROTOCOL),
      ...(extra || {}),
    };
    if (this.authMode === "bearer") h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async _call(path, { method = "GET", body = null, headers = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this._headers(headers),
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: this.authMode === "cookie" ? "include" : "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new CloudSyncError("O servidor de sincronização não respondeu a tempo.", "timeout");
      throw new CloudSyncError("Não foi possível acessar o servidor de sincronização.", "network_error");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 409) throw new CloudSyncConflictError(res.headers && res.headers.get ? res.headers.get("x-sync-revision") : null);
    if (!res.ok) {
      // A RAZÃO DA FALHA VEM NO CORPO, E ERA JOGADA FORA.
      //
      // O servidor deste app responde erro com `{ code, message }` escrito para
      // o usuário. Aqui só se olhava para o número do status, então "faltam as
      // tabelas no banco", "origem recusada" e "email não confirmado" viravam a
      // mesma frase sem conteúdo, e a tela mostrava "Sincronização com falha"
      // sem nunca dizer a falha.
      const detalhe = await cloudErrorBody(res);
      if (res.status === 401 || res.status === 403) {
        // O código continua sendo um dos DOIS que o motor sabe tratar (parar em
        // vez de insistir); só a frase passa a ser a de verdade.
        const codigo = detalhe.code === "device_revoked" ? "device_revoked" : "session_expired";
        throw new CloudSyncError(detalhe.message || "A sessão de sincronização expirou.", codigo, res.status);
      }
      throw new CloudSyncError(detalhe.message || `O servidor de sincronização recusou a operação (${res.status}).`, detalhe.code || "server_error", res.status);
    }
    if (res.status === 204) return null;

    const contentType = String(res.headers && res.headers.get ? res.headers.get("content-type") : "").toLowerCase();
    const contentLength = Number(res.headers && res.headers.get ? res.headers.get("content-length") : 0);
    if (!contentType.includes("application/json")) throw new CloudSyncError("Resposta de sincronização em formato inválido.", "invalid_content_type");
    if (Number.isFinite(contentLength) && contentLength > CLOUD_MAX_RESPONSE_BYTES) {
      throw new CloudSyncError("A resposta de sincronização excede o limite permitido.", "response_too_large");
    }
    const text = await res.text();
    if (text.length > CLOUD_MAX_RESPONSE_BYTES) throw new CloudSyncError("A resposta de sincronização excede o limite permitido.", "response_too_large");
    let payload;
    try { payload = JSON.parse(text); }
    catch (e) { throw new CloudSyncError("Resposta de sincronização inválida.", "invalid_json"); }
    if (!payload || payload.protocol !== CLOUD_SYNC_PROTOCOL) {
      throw new CloudSyncError("Versão incompatível do protocolo de sincronização.", "protocol_mismatch");
    }
    return payload;
  }

  async init() {
    const result = await this._call("/health");
    if (result.status !== "ok") throw new CloudSyncError("O servidor de sincronização não está pronto.", "unavailable");
    this.revision = typeof result.revision === "string" ? result.revision : null;
    this.initialized = true;
    return true;
  }

  _requireReady(requireRevision) {
    if (!this.initialized) throw new CloudSyncError("Inicialize a sincronização antes de usá-la.", "not_initialized");
    if (requireRevision && !this.revision) throw new CloudSyncError("Leia os dados do servidor antes de gravar.", "revision_required");
  }

  // ---- Protocolo 2: leitura incremental por cursor ----
  // O aparelho guarda o cursor (última seq aplicada) e pede só o que veio
  // depois. Uma base de dez anos desce em páginas; um dia comum desce em uma
  // resposta de poucos kB.
  async pull(since, limit) {
    this._requireReady(false);
    const query = `?since=${encodeURIComponent(String(since || "0"))}&limit=${encodeURIComponent(String(limit || 500))}`;
    const result = await this._call(`/changes${query}`);
    if (!result || !Array.isArray(result.ops)) throw new CloudSyncError("O servidor não enviou as alterações.", "invalid_changes");
    this.revision = typeof result.revision === "string" ? result.revision : this.revision;
    return { ops: result.ops, hasMore: !!result.hasMore, cursor: String(result.cursor || since || "0"), revision: this.revision };
  }

  // ---- Protocolo 2: envio incremental ----
  // Vai e volta na mesma requisição: manda o que este aparelho fez, recebe o
  // que os outros fizeram. Sem If-Match de documento inteiro, porque cada
  // operação carrega a própria marca e o servidor guarda a vencedora. É o fim
  // do 409 em rajada: dois aparelhos gravando campos diferentes não disputam
  // mais nada.
  async push(ops, since) {
    this._requireReady(false);
    const mutationId = cloudMutationId();
    const result = await this._call("/changes", {
      method: "POST",
      headers: { "Idempotency-Key": mutationId },
      body: { protocol: CLOUD_SYNC_PROTOCOL, mutationId, ops, since: String(since || "0") },
    });
    if (!result || typeof result.revision !== "string") throw new CloudSyncError("O servidor não confirmou a nova revisão.", "revision_missing");
    this.revision = result.revision;
    return {
      revision: result.revision,
      applied: Number(result.applied) || 0,
      ops: Array.isArray(result.ops) ? result.ops : [],
      hasMore: !!result.hasMore,
      cursor: String(result.cursor || since || "0"),
    };
  }

  // ---- "Apagar tudo" ----
  // Vira lápide para cada registro vivo no servidor, e as lápides descem para
  // os outros aparelhos. Apagar só aqui faria o próximo aparelho a sincronizar
  // devolver a base inteira.
  async resetRemote(rev) {
    this._requireReady(false);
    if (!this.allowDestructive) throw new CloudSyncError("A exclusão remota está bloqueada.", "destructive_blocked");
    const mutationId = cloudMutationId();
    const result = await this._call("/reset", {
      method: "POST",
      headers: { "Idempotency-Key": mutationId },
      body: { protocol: CLOUD_SYNC_PROTOCOL, mutationId, rev },
    });
    this.revision = result && typeof result.revision === "string" ? result.revision : this.revision;
    return { revision: this.revision, applied: Number(result && result.applied) || 0 };
  }

  async createCheckpoint(label) {
    this._requireReady(false);
    const result = await this._call("/checkpoints", {
      method: "POST",
      body: { protocol: CLOUD_SYNC_PROTOCOL, label: String(label || "Automático").slice(0, 60) },
    });
    return (result && result.checkpoint) || null;
  }

  async listCheckpoints() {
    this._requireReady(false);
    const result = await this._call("/checkpoints");
    return (result && Array.isArray(result.checkpoints)) ? result.checkpoints : [];
  }

  // Conteúdo de uma versão, paginado por id de registro. Paginado porque uma
  // versão tem o tamanho da base, e é justamente o corpo único gigante que o
  // protocolo 2 existe para evitar.
  async readCheckpoint(checkpointId, after) {
    this._requireReady(false);
    const query = `?id=${encodeURIComponent(String(checkpointId || ""))}&limit=500${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const result = await this._call(`/checkpoint${query}`);
    if (!result || !Array.isArray(result.ops)) throw new CloudSyncError("A versão não pôde ser lida.", "invalid_checkpoint");
    return { ops: result.ops, hasMore: !!result.hasMore, after: String(result.after || after || "") };
  }

  // Os métodos de snapshot inteiro do protocolo 1 deixaram de existir: eram
  // eles que impunham o teto de 6 MiB, custavam a base toda por ciclo e
  // desfaziam exclusões feitas em outro aparelho.
  async readAll() { throw new CloudSyncError("Leitura por snapshot foi substituída por pull().", "protocol_upgrade_required"); }
  async writeChanges() { throw new CloudSyncError("Gravação por snapshot foi substituída por push().", "protocol_upgrade_required"); }
  async replaceAll() { throw new CloudSyncError("Gravação por snapshot foi substituída por push().", "protocol_upgrade_required"); }
  async clearAll() { throw new CloudSyncError("Exclusão por snapshot foi substituída por resetRemote().", "protocol_upgrade_required"); }
}

// ==============================================================================
// CAMADA 2. FinanceStore (façade)
// ==============================================================================

const FinanceStore = (() => {
  let adapter = null;
  let scope = GUEST_SCOPE;         // conta dona dos dados carregados agora
  let snapshot = defaultData();
  let lastPersisted = null;        // cópia usada como base do diff
  let ready = false;
  let healthy = true;
  let writeQueue = Promise.resolve();
  let pendingTimer = null;
  let pendingResolvers = [];       // todas as chamadas coalescidas resolvem juntas
  let mirrorEnabled = true;
  let mirrorTimer = null;
  let lastMirrorAt = 0;
  let settingRevs = {};            // marca lógica por chave de configuração
  let remoteSettingEcho = {};      // valor recém-chegado do servidor, para não reenviar
  const remoteApplied = new Map();  // registro -> impressão do que chegou de fora
  let bus = null;                  // canal entre abas do mesmo escopo
  const tabId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const tabListeners = [];         // avisados quando outra aba grava
  let outboxEnabled = false;       // só enfileira quando há conta ligada
  const errorListeners = [];

  // Impressão digital por REFERÊNCIA: se o objeto não foi substituído, ele não
  // mudou (o app usa atualização imutável). Só serializamos quando a referência
  // muda; antes o diff fazia JSON.stringify de TODOS os lançamentos a cada
  // gravação, o que travava a digitação em bases grandes.
  const fingerprints = new WeakMap();
  function fingerprintOf(rec) {
    if (!rec || typeof rec !== "object") return String(rec);
    const cached = fingerprints.get(rec);
    if (cached !== undefined) return cached;
    const fp = JSON.stringify(rec);
    fingerprints.set(rec, fp);
    return fp;
  }

  function emitError(err) {
    healthy = false;
    if (typeof reportSafeError === "function") reportSafeError("storage", err, "storage_write");
    console.error("[storage]", err);
    errorListeners.forEach((fn) => { try { fn(err); } catch (e) {} });
  }

  function indexById(list) {
    const m = new Map();
    (list || []).forEach((r) => { if (r && r.id) m.set(r.id, r); });
    return m;
  }

  // ---------------------------------------------------------------------------
  // MARCAÇÃO DE ALTERAÇÕES E FILA DE ENVIO
  // ---------------------------------------------------------------------------
  // Estado do relógio e das marcas de configuração é INFORMAÇÃO DO APARELHO, não
  // do usuário: fica no localStorage por escopo e nunca sobe para a nuvem. Se
  // subisse, um aparelho sobrescreveria o contador do outro e a ordem lógica
  // deixaria de valer.
  function clockKey() { return scopedName("financas_db_clock", scope); }

  function loadClockState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(clockKey()) || "null");
      if (!parsed || typeof parsed !== "object") return;
      SyncClock.restore(parsed.clock);
      settingRevs = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
    } catch (e) { settingRevs = {}; }
  }

  function saveClockState() {
    try { localStorage.setItem(clockKey(), JSON.stringify({ clock: SyncClock.state(), settings: settingRevs })); }
    catch (e) { /* cota cheia: o relógio ainda funciona nesta sessão */ }
  }

  // `graveyard` não vai como configuração: as exclusões viajam como operações
  // próprias (op "delete"), que já carregam a mesma informação e não crescem o
  // envio a cada ciclo.
  const SYNC_SKIP_SETTINGS = new Set(["lastPersistAt", "graveyard", "theme", "dashboardLayout"]);

  // Marca os registros ALTERADOS LOCALMENTE e transforma o diff em operações.
  //
  // A regra de "alterado localmente" é a que impede o laço infinito: um
  // registro que chegou do servidor já vem com marca, e sua marca é diferente
  // da versão anterior daqui. Remarcá-lo faria este aparelho reivindicar a
  // alteração alheia e devolvê-la ao servidor, para sempre.
  function stampChangeSet(prev, changeSet) {
    if (!changeSet) return [];
    const ops = [];
    const pairs = [[STORE_TX, "transactions"], [STORE_CAT, "categories"], [STORE_GOALS, "goals"], [STORE_ASSETS, "assets"]];
    for (const [storeName, field] of pairs) {
      (changeSet.puts[storeName] || []).forEach((rec) => {
        // "Veio de fora" é decidido por CONTEÚDO, não por dedução a partir da
        // marca. A dedução errava num caso real: o usuário edita um registro
        // que acabou de chegar do outro aparelho, antes de a gravação daquele
        // registro terminar. A marca ainda é a do remoto, mas o conteúdo já é
        // dele, e a edição não podia ser descartada.
        const key = `${field} ${rec.id}`;
        const echo = remoteApplied.get(key);
        if (echo !== undefined && echo === fingerprintOf(rec)) {
          remoteApplied.delete(key);
          SyncClock.observe(rec.syncRev);
          return;
        }
        // Escrita in loco, de propósito: recriar o objeto invalidaria a
        // memoização por identidade que segura a digitação em bases grandes,
        // e `syncRev` não é lido por nenhuma tela.
        rec.syncRev = SyncClock.tick();
        ops.push({ entity: field, entityId: rec.id, op: "put", rev: rec.syncRev, payload: rec });
      });
      (changeSet.deletes[storeName] || []).forEach((id) => {
        // A lápide correspondente já foi criada por `withTombstones`; usamos a
        // marca dela para que exclusão e edição concorrentes sejam comparáveis.
        const grave = normalizeGraveEntry(((snapshot.graveyard || {})[field] || {})[id]);
        const rev = (grave && grave.rev) || SyncClock.tick();
        // Exclusão que VEIO de fora não volta para o servidor: a marca dela
        // aponta para outro aparelho. Sem esta checagem, cada exclusão remota
        // gerava um eco que o outro lado reenviava de volta.
        const parsed = SyncClock.parse(rev);
        if (parsed && parsed.device !== SyncClock.device()) return;
        ops.push({ entity: field, entityId: id, op: "delete", rev });
      });
    }
    Object.keys(changeSet.settings || {}).forEach((key) => {
      if (SYNC_SKIP_SETTINGS.has(key)) return;
      // Mesmo eco, do lado das configurações: se o valor gravado é exatamente o
      // que acabou de chegar do servidor, ele não é uma alteração deste
      // aparelho e não deve ser reivindicado como tal.
      if (Object.prototype.hasOwnProperty.call(remoteSettingEcho, key)
        && remoteSettingEcho[key] === JSON.stringify(changeSet.settings[key])) {
        delete remoteSettingEcho[key];
        return;
      }
      const rev = SyncClock.tick();
      settingRevs[key] = rev;
      ops.push({ entity: "settings", entityId: key, op: "put", rev, payload: changeSet.settings[key] });
    });
    if (ops.length) saveClockState();
    return ops;
  }

  // ---------------------------------------------------------------------------
  // APLICAÇÃO DE OPERAÇÕES REMOTAS
  // ---------------------------------------------------------------------------
  // Cada operação é comparada com o que existe aqui pela marca lógica. O
  // resultado é o MESMO nos dois aparelhos, sem conversa e sem tela de
  // "escolha uma versão": a ordem é total e determinística.
  function applyRemoteOps(ops) {
    const list = Array.isArray(ops) ? ops : [];
    if (!list.length) return { changed: false, data: snapshot, applied: 0 };

    const fields = ["transactions", "categories", "goals", "assets"];
    const maps = {};
    fields.forEach((f) => { maps[f] = indexById(snapshot[f] || []); });
    let graveyard = normalizeGraveyard(snapshot.graveyard);
    const settings = {};
    let changed = false;
    let applied = 0;
    const touched = new Set();   // registros efetivamente alterados por esta rodada

    list.forEach((op) => {
      if (!op || typeof op !== "object") return;
      const rev = normalizeSyncRev(op.rev);
      if (!rev) return;                       // operação sem marca não é comparável
      SyncClock.observe(rev);

      if (op.entity === "settings") {
        const key = String(op.entityId || "");
        if (SETTING_KEYS.indexOf(key) === -1 || SYNC_SKIP_SETTINGS.has(key)) return;
        if (!syncRevGreater(rev, settingRevs[key] || "")) return;
        settingRevs[key] = rev;
        settings[key] = op.payload;
        remoteSettingEcho[key] = JSON.stringify(op.payload);
        changed = true; applied++;
        return;
      }

      if (fields.indexOf(op.entity) === -1) return;
      const map = maps[op.entity];
      const id = normalizeRecordId(op.entityId, GRAVE_PREFIXES[op.entity] || "item");
      const existing = map.get(id);
      const grave = graveyard[op.entity][id];

      if (op.op === "delete") {
        // Exclusão só vence uma edição posterior se a marca dela for maior.
        if (existing && !syncRevGreater(rev, existing.syncRev)) return;
        if (existing) map.delete(id);
        graveyard = withRemoteTombstone(graveyard, op.entity, id, rev);
        changed = true; applied++;
        return;
      }

      // Registro apagado depois desta versão não ressuscita.
      if (grave && !syncRevGreater(rev, grave.rev)) return;
      if (existing && !syncRevGreater(rev, existing.syncRev)) return;
      if (!op.payload || typeof op.payload !== "object") return;
      map.set(id, { ...op.payload, id, syncRev: rev });
      touched.add(`${op.entity} ${id}`);
      changed = true; applied++;
    });

    if (!changed) { saveClockState(); return { changed: false, data: snapshot, applied: 0 }; }

    const next = migrate({
      ...snapshot,
      ...settings,
      graveyard,
      transactions: Array.from(maps.transactions.values()),
      categories: Array.from(maps.categories.values()),
      goals: Array.from(maps.goals.values()),
      assets: Array.from(maps.assets.values()),
    });
    // Guarda a impressão do registro JÁ NORMALIZADO. É com ela que a gravação
    // seguinte reconhece o eco e não devolve ao servidor a alteração alheia.
    fields.forEach((field) => {
      (next[field] || []).forEach((rec) => {
        const key = `${field} ${rec.id}`;
        if (touched.has(key)) remoteApplied.set(key, fingerprintOf(rec));
      });
    });
    saveClockState();
    return { changed: true, data: next, applied };
  }

  // A fila só recebe quando existe conta ligada. Sem conta não há para onde
  // enviar, e uma fila que cresce para sempre num aparelho offline vira lixo.
  function queueOps(ops) {
    if (!ops.length || !outboxEnabled || !adapter) return;
    adapter.outboxAppend(ops.map((op) => ({ ...op, queuedAt: Date.now() }))).catch(() => {});
  }

  function computeChangeSet(prev, next) {
    const changeSet = { puts: {}, deletes: {}, settings: {} };
    let dirty = false;

    const pairs = [[STORE_TX, "transactions"], [STORE_CAT, "categories"], [STORE_GOALS, "goals"], [STORE_ASSETS, "assets"]];
    for (const [storeName, field] of pairs) {
      const prevMap = indexById(prev ? prev[field] : []);
      const nextMap = indexById(next[field]);
      const puts = [];
      const deletes = [];
      nextMap.forEach((rec, id) => {
        const old = prevMap.get(id);
        if (old === rec) return;                                  // mesma referência → intocado
        if (!old || fingerprintOf(old) !== fingerprintOf(rec)) puts.push(rec);
      });
      prevMap.forEach((_rec, id) => { if (!nextMap.has(id)) deletes.push(id); });
      changeSet.puts[storeName] = puts;
      changeSet.deletes[storeName] = deletes;
      if (puts.length || deletes.length) dirty = true;
    }

    SETTING_KEYS.forEach((k) => {
      if (k === "lastPersistAt") return;                          // carimbo, não é dado do usuário
      const a = prev ? prev[k] : undefined;
      const b = next[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) { changeSet.settings[k] = b; dirty = true; }
    });

    return dirty ? changeSet : null;
  }

  // Cópia rasa por coleção: preserva as referências dos registros (essenciais
  // para o diff acima) sem o custo do JSON.parse(JSON.stringify(...)) completo.
  function shallowSnapshot(data) {
    const out = Object.assign({}, data);
    out.transactions = (data.transactions || []).slice();
    out.categories = (data.categories || []).slice();
    out.goals = (data.goals || []).slice();
    out.assets = (data.assets || []).slice();
    return out;
  }

  function assembleSnapshot(raw) {
    const merged = {
      transactions: raw.transactions || [],
      categories: raw.categories || [],
      goals: raw.goals || [],
      assets: raw.assets || [],
    };
    SETTING_KEYS.forEach((k) => {
      if (raw.settings && raw.settings[k] !== undefined) merged[k] = raw.settings[k];
    });
    return migrate(merged);
  }

  function isEmpty(raw) {
    return (!raw.transactions || raw.transactions.length === 0) &&
           (!raw.categories || raw.categories.length === 0) &&
           (!raw.goals || raw.goals.length === 0) &&
           (!raw.assets || raw.assets.length === 0) &&
           (!raw.settings || Object.keys(raw.settings).length === 0);
  }

  // Chaves derivadas do escopo ativo. Chamadas como função (e não guardadas em
  // constante) porque o escopo muda quando o usuário entra ou sai da conta.
  function mirrorKey() { return scopedName(LS_MIRROR_KEY, scope); }
  function undoKey() { return scopedName(LS_UNDO_KEY, scope); }

  // O blob antigo do localStorage pertence a quem usava o app SEM conta. Uma
  // conta nunca o absorve sozinha. Isso seria exatamente o vazamento que o
  // isolamento existe para impedir.
  function readLegacyBlob() {
    if (scope !== GUEST_SCOPE) return null;
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // ESPELHO SÍNCRONO (rede de segurança contra perda de dados)
  // ---------------------------------------------------------------------------
  // O IndexedDB é assíncrono: se o usuário mata o app (ou o iOS descarrega a aba)
  // entre o `put` e o `oncomplete`, aquela escrita evapora. Gravamos então um
  // espelho SÍNCRONO no localStorage carimbado com `savedAt`. No boot, se o
  // espelho for mais novo que o último carimbo confirmado no IndexedDB, ele é
  // usado para recuperar o que ficou pelo caminho.
  function writeMirror(data, force) {
    if (!mirrorEnabled) return false;
    const now = Date.now();
    if (!force && now - lastMirrorAt < MIRROR_THROTTLE_MS) {
      clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => writeMirror(snapshot, true), MIRROR_THROTTLE_MS);
      return false;
    }
    try {
      const payload = JSON.stringify({ savedAt: now, version: SCHEMA_VERSION, data });
      if (payload.length > MIRROR_MAX_BYTES) { mirrorEnabled = false; return false; }
      localStorage.setItem(mirrorKey(), payload);
      lastMirrorAt = now;
      return true;
    } catch (e) {
      // Cota estourada ou storage bloqueado: desliga o espelho e segue a vida.
      mirrorEnabled = false;
      return false;
    }
  }
  function readMirror() {
    try {
      const raw = localStorage.getItem(mirrorKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !parsed.savedAt) return null;
      return parsed;
    } catch (e) { return null; }
  }

  async function init(preferredAdapter, options) {
    const opts = options || {};
    // Trocar de escopo é o passo que impede o vazamento entre contas: fecha o
    // banco anterior, zera a memória e recomeça do zero no banco novo.
    const nextScope = normalizeStorageScope(opts.scope == null ? scope : opts.scope);
    if (adapter && typeof adapter.close === "function") { try { adapter.close(); } catch (e) {} }
    scope = nextScope;
    adapter = null;
    snapshot = defaultData();
    lastPersisted = null;
    ready = false;
    healthy = true;
    mirrorEnabled = true;
    clearTimeout(pendingTimer);
    clearTimeout(mirrorTimer);
    lastMirrorAt = 0;
    // O relógio lógico é POR ESCOPO: continuar contando de onde a conta
    // anterior parou misturaria as ordens das duas.
    outboxEnabled = false;
    settingRevs = {};
    remoteSettingEcho = {};
    remoteApplied.clear();
    SyncClock.reset();
    SyncClock.setDevice(syncDeviceId());
    loadClockState();
    attachBus();
    // Promessas penduradas de um escopo que não existe mais precisam de
    // resposta; ficariam esperando para sempre uma gravação que não virá.
    pendingResolvers.splice(0).forEach((resolve) => resolve(false));
    const candidates = preferredAdapter
      ? [preferredAdapter]
      : [new IndexedDBAdapter(scope), new LocalStorageAdapter(scope)];
    let lastErr = null;

    for (const cand of candidates) {
      try {
        await cand.init();
        adapter = cand;
        lastErr = null;
        break;
      } catch (err) { lastErr = err; }
    }

    if (!adapter) {
      // Modo memória: tenta pelo menos ressuscitar o espelho da sessão anterior.
      emitError(lastErr || new Error("Nenhum mecanismo de armazenamento disponível"));
      const mirror = readMirror();
      snapshot = mirror ? migrate(mirror.data) : defaultData();
      lastPersisted = null;
      ready = true;
      return snapshot;
    }

    try {
      let raw = await adapter.readAll();

      if (isEmpty(raw)) {
        const legacy = readLegacyBlob() || (readMirror() || {}).data;
        if (legacy) {
          // ---- Migração automática localStorage → IndexedDB (uma única vez) ----
          const migrated = migrate(legacy);
          migrated.lastPersistAt = Date.now();
          await adapter.replaceAll(migrated);
          try { localStorage.setItem(LEGACY_KEY + "_backup", JSON.stringify(legacy)); } catch (e) {}
          try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
          snapshot = migrated;
          lastPersisted = shallowSnapshot(migrated);
          writeMirror(snapshot, true);
          ready = true; healthy = true;
          return snapshot;
        }
        const fresh = defaultData();
        fresh.lastPersistAt = Date.now();
        await adapter.replaceAll(fresh);
        snapshot = fresh;
        lastPersisted = shallowSnapshot(fresh);
        writeMirror(snapshot, true);
        ready = true; healthy = true;
        return snapshot;
      }

      let assembled = assembleSnapshot(raw);

      // ---- Recuperação de escrita perdida ----
      const mirror = readMirror();
      const persistedAt = Number(assembled.lastPersistAt) || 0;
      if (mirror && mirror.savedAt > persistedAt + 500) {
        const recovered = migrate(mirror.data);
        // Só aceita o espelho se ele não for um retrocesso (mais dados ou iguais).
        if (recovered.transactions.length >= assembled.transactions.length) {
          assembled = recovered;
          assembled.lastPersistAt = Date.now();
          await adapter.replaceAll(assembled);
        }
      }

      snapshot = assembled;
      lastPersisted = shallowSnapshot(snapshot);

      // Se a normalização alterou algo (migração de versão), grava de volta.

      const cs = computeChangeSet(assembleSnapshotRawCopy(raw), snapshot);
      if (cs) {
        cs.settings.lastPersistAt = Date.now();
        snapshot.lastPersistAt = cs.settings.lastPersistAt;
        await adapter.writeChanges(cs);
        lastPersisted = shallowSnapshot(snapshot);
      }
      writeMirror(snapshot, true);

      ready = true; healthy = true;
      return snapshot;
    } catch (err) {
      emitError(err);
      const mirror = readMirror();
      snapshot = mirror ? migrate(mirror.data) : defaultData();
      lastPersisted = null;
      ready = true;
      return snapshot;
    }
  }

  function assembleSnapshotRawCopy(raw) {
    const out = { transactions: raw.transactions || [], categories: raw.categories || [], goals: raw.goals || [] };
    SETTING_KEYS.forEach((k) => { out[k] = raw.settings ? raw.settings[k] : undefined; });
    return out;
  }

  // Enfileira a gravação. Coalescemos chamadas em rajada num único write e nunca
  // deixamos duas transações rodarem em paralelo. Todas as promessas coalescidas
  // são resolvidas (antes, as anteriores ficavam penduradas para sempre).
  function persist(data) {
    snapshot = data;
    writeMirror(snapshot, false);          // proteção imediata, síncrona
    if (!adapter) return Promise.resolve(false);

    clearTimeout(pendingTimer);
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
      pendingTimer = setTimeout(() => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        writeQueue = writeQueue.then(async () => {
          const settle = (v) => resolvers.forEach((r) => r(v));
          try {
            const target = shallowSnapshot(snapshot);
            const cs = computeChangeSet(lastPersisted, target);
            if (!cs) { settle(true); return; }
            // Marcar ANTES de gravar: o registro tem de chegar ao disco já com
            // a marca, senão um fechamento no meio deixaria a fila apontando
            // para uma versão que o banco não tem.
            queueOps(stampChangeSet(lastPersisted, cs));
            const stamp = Date.now();
            cs.settings.lastPersistAt = stamp;
            target.lastPersistAt = stamp;
            snapshot.lastPersistAt = stamp;
            await adapter.writeChanges(cs);
            lastPersisted = target;
            healthy = true;
            announceWrite();
            settle(true);
          } catch (err) {
            emitError(err);
            writeMirror(snapshot, true);   // falhou no banco? garante o espelho
            settle(false);
          }
        });
      }, 80);
    });
  }

  // Força a gravação imediata (usado antes de fechar/ocultar a aba).

  async function flush() {
    clearTimeout(pendingTimer);
    clearTimeout(mirrorTimer);
    writeMirror(snapshot, true);           // síncrono: sempre acontece
    const resolvers = pendingResolvers;
    pendingResolvers = [];
    if (!adapter) { resolvers.forEach((r) => r(false)); return false; }
    try {
      const target = shallowSnapshot(snapshot);
      const cs = computeChangeSet(lastPersisted, target);
      if (cs) {
        queueOps(stampChangeSet(lastPersisted, cs));
        const stamp = Date.now();
        cs.settings.lastPersistAt = stamp;
        target.lastPersistAt = stamp;
        snapshot.lastPersistAt = stamp;
        await adapter.writeChanges(cs);
        lastPersisted = target;
        announceWrite();
      }
      resolvers.forEach((r) => r(true));
      return true;
    } catch (err) {
      emitError(err);
      resolvers.forEach((r) => r(false));
      return false;
    }
  }

  async function replaceAll(data) {
    const normalized = migrate(data);
    // Guarda o estado anterior para permitir desfazer um restore acidental.
    try { localStorage.setItem(undoKey(), JSON.stringify({ savedAt: Date.now(), data: snapshot })); } catch (e) {}
    normalized.lastPersistAt = Date.now();
    snapshot = normalized;
    writeMirror(snapshot, true);
    if (!adapter) return false;
    try {
      await adapter.replaceAll(normalized);
      lastPersisted = shallowSnapshot(normalized);
      healthy = true;
      return true;
    } catch (err) { emitError(err); return false; }
  }

  function readUndoSnapshot() {
    try {
      const raw = localStorage.getItem(undoKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed : null;
    } catch (e) { return null; }
  }

  async function clear() {
    const fresh = defaultData();
    try { localStorage.setItem(undoKey(), JSON.stringify({ savedAt: Date.now(), data: snapshot })); } catch (e) {}
    fresh.lastPersistAt = Date.now();
    snapshot = fresh;
    writeMirror(snapshot, true);
    if (!adapter) return false;
    try { await adapter.clearAll(); await adapter.replaceAll(fresh); lastPersisted = shallowSnapshot(fresh); return true; }
    catch (err) { emitError(err); return false; }
  }

  // Exclusão definitiva pedida pelo usuário. Ao contrário de clear(), não cria
  // um snapshot de desfazer e remove os espelhos que poderiam ressuscitar dados.
  async function purge() {
    clearTimeout(pendingTimer);
    clearTimeout(mirrorTimer);
    pendingResolvers.splice(0).forEach((resolve) => resolve(false));
    const fresh = defaultData();
    fresh.lastPersistAt = Date.now();
    // Só as chaves DESTE escopo. Apagar os dados da conta não pode levar junto
    // o que pertence a quem usa o aparelho sem conta.
    const keys = [
      scopedName(LS_FALLBACK_KEY, scope),
      scopedName("financas_db_outbox", scope),
      mirrorKey(),
      undoKey(),
      ...(scope === GUEST_SCOPE ? [LEGACY_KEY, LEGACY_KEY + "_backup", "financas_theme"] : []),
    ];
    if (!adapter) {
      snapshot = fresh;
      lastPersisted = null;
      keys.forEach((key) => { try { localStorage.removeItem(key); } catch (_error) {} });
      return true;
    }
    try {
      await adapter.clearAll();
      await adapter.replaceAll(fresh);
      snapshot = fresh;
      lastPersisted = shallowSnapshot(fresh);
      healthy = true;
      keys.forEach((key) => { try { localStorage.removeItem(key); } catch (_error) {} });
      return true;
    } catch (err) {
      if (typeof reportSafeError === "function") reportSafeError("storage", err, "storage_delete");
      emitError(err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // ESCOPO: leitura de outra conta, adoção explícita e troca
  // ---------------------------------------------------------------------------

  // Abre OUTRO escopo só para olhar, sem tocar no que está carregado. É o que
  // permite perguntar "este aparelho tem dados de visitante?" sem já os trazer
  // para dentro da conta.
  async function peekScope(target) {
    const wanted = normalizeStorageScope(target);
    if (wanted === scope) return summarize(snapshot);
    const candidates = [new IndexedDBAdapter(wanted), new LocalStorageAdapter(wanted)];
    for (const candidate of candidates) {
      try {
        await candidate.init();
        const raw = await candidate.readAll();
        const data = isEmpty(raw) ? null : migrate(assembleSnapshot(raw));
        if (typeof candidate.close === "function") candidate.close();
        if (data) return summarize(data);
      } catch (e) { /* escopo inexistente ou inacessível; tenta o próximo */ }
    }
    // Visitante sem banco ainda pode ter o blob antigo do localStorage.
    if (wanted === GUEST_SCOPE) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
        if (legacy && typeof legacy === "object") return summarize(migrate(legacy));
      } catch (e) { /* sem legado */ }
    }
    return summarize(null);
  }

  function summarize(data) {
    if (!data) return { exists: false, transactions: 0, goals: 0, assets: 0, lastPersistAt: 0 };
    return {
      exists: (data.transactions || []).length > 0 || (data.goals || []).length > 0 || (data.assets || []).length > 0,
      transactions: (data.transactions || []).length,
      goals: (data.goals || []).length,
      assets: (data.assets || []).length,
      lastPersistAt: Number(data.lastPersistAt) || 0,
    };
  }

  // Adoção EXPLÍCITA: só roda quando o usuário confirmou que quer trazer os
  // dados de visitante para a conta. Funde (não substitui), para não apagar o
  // que a conta já tinha em outro aparelho.
  async function adoptScope(source) {
    const from = normalizeStorageScope(source);
    if (from === scope) return { ok: false, reason: "same_scope" };
    let incoming = null;
    const candidates = [new IndexedDBAdapter(from), new LocalStorageAdapter(from)];
    for (const candidate of candidates) {
      try {
        await candidate.init();
        const raw = await candidate.readAll();
        if (!isEmpty(raw)) incoming = migrate(assembleSnapshot(raw));
        if (typeof candidate.close === "function") candidate.close();
        if (incoming) break;
      } catch (e) { /* tenta o próximo */ }
    }
    if (!incoming && from === GUEST_SCOPE) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
        if (legacy && typeof legacy === "object") incoming = migrate(legacy);
      } catch (e) { /* sem legado */ }
    }
    if (!incoming) return { ok: false, reason: "empty" };
    const result = mergeBackupInto(snapshot, incoming);
    const saved = await replaceAll(result.data);
    return { ok: saved, stats: result.stats };
  }

  // ---------------------------------------------------------------------------
  // DUAS ABAS DO MESMO APLICATIVO
  // ---------------------------------------------------------------------------
  // Cada aba tem o próprio snapshot em memória. Sem aviso entre elas, a aba B
  // continua com a base de antes e, na gravação seguinte, reescreve por cima do
  // que a aba A fez: a exclusão feita em A ressuscita, o lançamento feito em A
  // some. É o mesmo problema de dois aparelhos, só que sem rede no meio.
  //
  // A correção é avisar e RELER. Quem grava anuncia; quem recebe descarta o
  // snapshot velho e lê o banco de novo antes de qualquer nova gravação.
  function openBus() {
    if (typeof BroadcastChannel === "undefined") return null;
    try { return new BroadcastChannel(scopedName("cofre_storage", scope)); }
    catch (e) { return null; }
  }

  function announceWrite() {
    if (!bus) return;
    try { bus.postMessage({ type: "written", tab: tabId, at: Date.now() }); }
    catch (e) { /* canal fechado */ }
  }

  function attachBus() {
    if (bus) { try { bus.close(); } catch (e) {} }
    bus = openBus();
    if (!bus) return;
    bus.onmessage = (event) => {
      const message = event && event.data;
      if (!message || message.type !== "written" || message.tab === tabId) return;
      // Reler é assíncrono; até terminar, esta aba não pode gravar por cima.
      reload().then((data) => {
        tabListeners.forEach((fn) => { try { fn(data); } catch (e) { /* ouvinte quebrado */ } });
      }).catch(() => {});
    };
  }

  // Relê o banco e substitui o snapshot em memória. Usado quando outra aba
  // gravou e quando o motor de sincronização quer descartar estado suspeito.
  async function reload() {
    if (!adapter) return snapshot;
    try {
      const raw = await adapter.readAll();
      const assembled = assembleSnapshot(raw);
      snapshot = assembled;
      lastPersisted = shallowSnapshot(assembled);
      return snapshot;
    } catch (err) { emitError(err); return snapshot; }
  }

  // ---- Fila persistente exposta ao motor de sincronização ----
  function outboxAppend(entries) {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!adapter || !list.length) return Promise.resolve(false);
    return adapter.outboxAppend(list).catch((err) => { emitError(err); return false; });
  }
  function outboxRead(limit) {
    if (!adapter) return Promise.resolve([]);
    return adapter.outboxRead(limit).catch(() => []);
  }
  function outboxDrop(seqs) {
    if (!adapter || !seqs.length) return Promise.resolve(false);
    return adapter.outboxDrop(seqs).catch(() => false);
  }
  function outboxClear() {
    if (!adapter) return Promise.resolve(false);
    return adapter.outboxClear().catch(() => false);
  }

  async function queryTransactionsByMonth(monthKey) {
    if (adapter && adapter.supportsIndexes && adapter.queryByIndex) {
      try { return await adapter.queryByIndex(STORE_TX, "by_monthKey", monthKey); }
      catch (e) { /* cai no fallback */ }
    }
    return snapshot.transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  }

  return {
    init,
    use: (a, options) => init(a, options),
    snapshot: () => snapshot,
    persist,
    flush,
    replaceAll,
    clear,
    purge,
    readUndoSnapshot,
    queryTransactionsByMonth,
    scope: () => scope,
    switchScope: (target, preferredAdapter) => init(preferredAdapter || null, { scope: target }),
    peekScope,
    adoptScope,
    applyRemoteOps,
    reload,
    onOtherTabWrite: (fn) => { if (typeof fn === "function") tabListeners.push(fn); },
    outboxAppend,
    outboxRead,
    outboxDrop,
    outboxClear,
    // Enfileirar só faz sentido com conta ligada; o motor de sincronização
    // liga e desliga junto com a sessão.
    setOutboxEnabled: (value) => { outboxEnabled = !!value; },
    isOutboxEnabled: () => outboxEnabled,
    syncRevOf: (record) => normalizeSyncRev(record && record.syncRev),
    // Marca nova do relógio lógico deste aparelho. Usada por operações que não
    // nascem de um registro, como o "apagar tudo" da conta.
    mintRev: () => { const rev = SyncClock.tick(); saveClockState(); return rev; },
    isReady: () => ready,
    isHealthy: () => healthy,
    hasMirror: () => mirrorEnabled,
    adapterName: () => (adapter ? adapter.name : "memory"),
    onError: (fn) => { errorListeners.push(fn); },
  };
})();

// ==============================================================================
// API COMPATÍVEL; o resto do app continua chamando exatamente estas funções
// ==============================================================================

// Abre no escopo lembrado da sessão anterior. Um aparelho já logado volta
// direto para os dados da conta, mesmo sem rede.
async function initStorage(options) {
  const opts = options || {};
  const scope = opts.scope == null ? rememberedStorageScope() : opts.scope;
  return FinanceStore.init(opts.adapter || null, { scope });
}

// Troca de conta. Devolve o snapshot do escopo novo; o chamador é quem decide
// o que fazer com a tela.
async function switchStorageScope(scope) {
  const target = rememberStorageScope(scope);
  return FinanceStore.switchScope(target);
}
function loadData() { return FinanceStore.snapshot(); }
function saveData(data) { FinanceStore.persist(data); return FinanceStore.isHealthy(); }
function isStorageAvailable() { return FinanceStore.adapterName() !== "memory"; }

// Garante que nada em rajada se perca ao fechar/minimizar o app (PWA no celular).
// `pagehide` e `freeze` cobrem o iOS, onde `beforeunload` não é confiável.
if (typeof document !== "undefined") {
  const flushNow = () => { try { FinanceStore.flush(); } catch (e) {} };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
  window.addEventListener("freeze", flushNow);
  window.addEventListener("beforeunload", flushNow);
}

// ==============================================================================
// ÍNDICES EM MEMÓRIA (memoização por identidade do snapshot)
// ==============================================================================
// txForMonth/categoryById eram varreduras lineares chamadas dezenas de vezes por
// render (monthTotals → effectiveIncome → monthTotals...). Agora cada snapshot
// constrói seus índices UMA vez, sob demanda, e o cache morre junto com ele
// (WeakMap). Como o app atualiza os dados de forma imutável (spread), a troca de
// referência do array invalida o índice automaticamente.
const __dataIndexCache = new WeakMap();

function dataIndex(data) {
  let entry = __dataIndexCache.get(data);
  if (entry && entry.txRef === data.transactions && entry.catRef === data.categories) return entry;

  const byMonth = new Map();
  (data.transactions || []).forEach((t) => {
    const key = monthKeyOf(t.date);
    let bucket = byMonth.get(key);
    if (!bucket) { bucket = []; byMonth.set(key, bucket); }
    bucket.push(t);
  });

  const catById = new Map();
  const childrenOf = new Map();
  (data.categories || []).forEach((c) => {
    catById.set(c.id, c);
    const parent = c.parentId || "__root__";
    let list = childrenOf.get(parent);
    if (!list) { list = []; childrenOf.set(parent, list); }
    list.push(c);
  });

  entry = { txRef: data.transactions, catRef: data.categories, byMonth, catById, childrenOf, totals: new Map() };
  __dataIndexCache.set(data, entry);
  return entry;
}

// ==============================================================================
// REGRAS DE NEGÓCIO COMPARTILHADAS (puras; operam sobre o snapshot)
// ==============================================================================

const FALLBACK_CATEGORY = { id: "outros", name: "Outros", color: "#7C8592", icon: "other", budget: null, parentId: null, group: "desejo" };

function categoryById(data, id) {
  return dataIndex(data).catById.get(id) || FALLBACK_CATEGORY;
}

function topLevelCategories(data) {
  return dataIndex(data).childrenOf.get("__root__") || [];
}
function childCategories(data, parentId) {
  return dataIndex(data).childrenOf.get(parentId) || [];
}
function categoryFullName(data, id) {
  const c = categoryById(data, id);
  if (!c.parentId) return c.name;
  const parent = categoryById(data, c.parentId);
  return `${parent.name} › ${c.name}`;
}
// Ids da categoria + todas as suas subcategorias (usado pelos orçamentos).
function categoryWithDescendants(data, id) {
  const out = [id];
  childCategories(data, id).forEach((c) => { out.push(c.id); });
  return out;
}

function categoryGroup(data, id) {
  const c = categoryById(data, id);
  return BUDGET_GROUPS.includes(c.group) ? c.group : "necessidade";
}

function categoryGroupForMonth(data, id, monthKey) {
  const snapshot = budgetSnapshotAt(data, monthKey);
  return snapshot && BUDGET_GROUPS.includes(snapshot.groups[id]) ? snapshot.groups[id] : categoryGroup(data, id);
}

function categoryIdsForBudgetMonth(data, id, monthKey) {
  const snapshot = budgetSnapshotAt(data, monthKey);
  if (!snapshot) return categoryWithDescendants(data, id);
  const out = [id];
  let added = true;
  while (added) {
    added = false;
    Object.keys(snapshot.parents).forEach((childId) => {
      if (snapshot.parents[childId] && out.includes(snapshot.parents[childId]) && !out.includes(childId)) {
        out.push(childId);
        added = true;
      }
    });
  }
  return out;
}

function txForMonth(data, monthKey) {
  return dataIndex(data).byMonth.get(monthKey) || [];
}

// Lançamentos com data futura são compromissos conhecidos, não movimentos já
// realizados. Calendário, faturas e previsão continuam usando `txForMonth`;
// análises do que aconteceu usam este recorte.
function realizedTxForMonth(data, monthKey, asOf) {
  const limit = asOf || todayIso();
  const limitKey = monthKeyOf(limit);
  if (monthKey < limitKey) return txForMonth(data, monthKey);
  if (monthKey > limitKey) return [];
  return txForMonth(data, monthKey).filter((t) => t.date <= limit);
}

function monthGroupSpend(data, monthKey) {
  const out = { necessidade: 0, desejo: 0, futuro: 0 };
  const cents = { necessidade: 0, desejo: 0, futuro: 0 };
  realizedTxForMonth(data, monthKey).forEach((t) => {
    // Só consumo entra no orçamento 50/30/20. Aporte tem lugar próprio no
    // grupo "futuro" (via metas), e contá-lo aqui também o somaria duas vezes;
    // amortização e transferência não são gasto de nenhum grupo.
    const cents2 = consumptionCentsOf(t);
    if (!cents2) return;
    cents[categoryGroupForMonth(data, t.categoryId, monthKey)] += cents2;
  });
  BUDGET_GROUPS.forEach((g) => { out[g] = moneyFromCents(cents[g]); });
  return out;
}

function groupAllocated(data, monthKey, group) {
  const income = effectiveIncome(data, monthKey);
  const snapshot = budgetSnapshotAt(data, monthKey);
  const split = snapshot ? snapshot.split : (data.budgetSplit || defaultBudgetSplit());
  const pct = split[group] || 0;
  return mulMoney(income, pct / 100);
}

// Totais do mês; memoizados por snapshot + mês (eram recalculados de 6 a 10
// vezes em cada render do dashboard).
function monthTotals(data, monthKey) {
  const idx = dataIndex(data);
  const cached = idx.totals.get(monthKey);
  if (cached) return cached;

  const tx = txForMonth(data, monthKey);
  let incomeC = 0, expenseC = 0, fixedC = 0;
  for (let i = 0; i < tx.length; i++) {
    const t = tx[i];
    const c = moneyToCents(t.amount);
    if (t.type === "income") { incomeC += c; continue; }
    expenseC += c;
    if (t.recurring) fixedC += c;
  }
  const result = {
    income: moneyFromCents(incomeC),
    expense: moneyFromCents(expenseC),
    fixed: moneyFromCents(fixedC),
    variable: moneyFromCents(expenseC - fixedC),
    tx,
  };
  idx.totals.set(monthKey, result);
  return result;
}

// Totais do mês, separados por NATUREZA. `expense` é gasto de verdade: consumo
// mais encargos de dívida, menos estornos. Guardar numa meta, amortizar uma
// dívida e transferir entre contas próprias saem daqui e aparecem em campos
// próprios, porque não são consumo e tratá-los como tal fazia o app dizer que
// o mês foi ruim justamente quando a pessoa poupou.
function realizedMonthTotals(data, monthKey, asOf) {
  const tx = realizedTxForMonth(data, monthKey, asOf);
  let incomeC = 0, expenseC = 0, fixedC = 0;
  let aporteC = 0, resgateC = 0, principalC = 0, encargosC = 0, estornoC = 0, transferC = 0;
  for (let i = 0; i < tx.length; i++) {
    const t = tx[i];
    const cents = moneyToCents(t.amount);
    const nature = t.nature || deriveTransactionNature(t);
    switch (nature) {
      case "renda": incomeC += cents; break;
      case "resgate": resgateC += cents; break;
      case "estorno":
        estornoC += cents;
        expenseC -= cents;                 // desfaz o consumo, não vira renda
        if (t.recurring) fixedC -= cents;
        break;
      case "aporte": aporteC += cents; break;
      case "divida-principal": principalC += cents; break;
      case "divida-encargos":
        encargosC += cents;
        expenseC += cents;                 // juros e tarifa são custo real
        if (t.recurring) fixedC += cents;
        break;
      case "transferencia": transferC += cents; break;
      default:                              // consumo
        expenseC += cents;
        if (t.recurring) fixedC += cents;
        break;
    }
  }
  return {
    income: moneyFromCents(incomeC),
    // Gasto nunca é exibido negativo: um mês com mais estorno do que consumo
    // significa saldo devolvido, e o lugar disso é o caixa, não "gastei -R$ 30".
    expense: moneyFromCents(Math.max(0, expenseC)),
    fixed: moneyFromCents(Math.max(0, fixedC)),
    variable: moneyFromCents(Math.max(0, expenseC) - Math.max(0, fixedC)),
    aportes: moneyFromCents(aporteC),
    resgates: moneyFromCents(resgateC),
    aportesLiquidos: moneyFromCents(aporteC - resgateC),
    dividaPrincipal: moneyFromCents(principalC),
    dividaEncargos: moneyFromCents(encargosC),
    estornos: moneyFromCents(estornoC),
    transferencias: moneyFromCents(transferC),
    // Saída total de caixa, para conciliar com o extrato bancário. Diferente de
    // `expense`, que é a leitura econômica.
    saidaDeCaixa: moneyFromCents(Math.max(0, expenseC) + aporteC + principalC),
    tx,
  };
}

function creditSpentInMonth(data, monthKey) {
  return sumMoney(realizedTxForMonth(data, monthKey).filter((t) => t.type === "expense" && t.payment === "Crédito"), (t) => t.amount);
}

// ------------------------------------------------------------------------------
// RENDA: PLANEJADA, REALIZADA E PROJETADA
// ------------------------------------------------------------------------------
// Havia um número só, `effectiveIncome`, que devolvia o MAIOR entre a renda
// configurada e a lançada. Isso misturava três coisas diferentes:
//
//   * PLANEJADA: "eu ganho R$ 5.000 por mês". É intenção, serve para orçar.
//   * REALIZADA: o que entrou de fato até agora. É fato, serve para medir.
//   * PROJETADA: realizada + o que ainda se espera até o fim do mês.
//
// Com o máximo entre elas, no dia 3 do mês o app dizia "renda R$ 5.000, gastos
// R$ 200, você poupou 96%". No dia 3 ninguém poupou 96%: o mês mal começou. E
// quem ganhava mais do que planejou via a própria renda extra desaparecer do
// indicador. Agora cada indicador declara a base que usa, e comparar realizado
// com planejado deixou de ser possível por acidente.
function monthIsPartial(monthKey, asOf) {
  const limit = asOf || todayIso();
  return String(monthKey || "") === monthKeyOf(limit);
}

// Fração do mês já decorrida. Usada para saber se um indicador tem base
// suficiente e para projetar o fechamento.
function monthElapsedRatio(monthKey, asOf) {
  const limit = asOf || todayIso();
  const key = String(monthKey || "");
  if (key < monthKeyOf(limit)) return 1;
  if (key > monthKeyOf(limit)) return 0;
  const [y, m] = key.split("-").map(Number);
  const dias = daysInMonthOf(y, m - 1);
  const hoje = Number(String(limit).slice(8, 10));
  return Math.min(1, Math.max(0, hoje / dias));
}

// Renda PLANEJADA do mês. Fica separada porque é a única das três que pode
// olhar para o futuro.
function plannedIncome(data, monthKey) {
  const key = String(monthKey || "");
  // Plano é declaração de hoje. Aplicá-lo a meses encerrados faria uma edição
  // de agora reescrever todos os indicadores antigos.
  if (key && key < keyOfDate(new Date())) return 0;
  return roundMoney((data && data.monthlyIncome) || 0);
}

// Renda REALIZADA: só lançamentos de natureza `renda`. Resgate de meta e
// estorno de compra ficam de fora; nenhum dos dois é dinheiro ganho.
function realizedIncome(data, monthKey, asOf) {
  return realizedMonthTotals(data, monthKey, asOf).income;
}

// Renda PROJETADA para o fechamento do mês. No mês corrente, é o realizado mais
// a parte do plano que ainda não entrou. Em mês fechado, é o próprio realizado.
function projectedIncome(data, monthKey, asOf) {
  const realized = realizedIncome(data, monthKey, asOf);
  if (!monthIsPartial(monthKey, asOf)) return realized;
  const planned = plannedIncome(data, monthKey);
  return moneyCompare(planned, realized) > 0 ? planned : realized;
}

// Base declarada de renda para um indicador. Quem consome escolhe pela chave
// `basis` se pode ou não comparar com um valor realizado.
//
//   basis "realizada"  -> mês fechado, ou mês corrente com renda já lançada
//   basis "planejada"  -> ainda não entrou nada; o número é intenção
//   basis "indefinida" -> não há plano nem lançamento
function incomeBasis(data, monthKey, asOf) {
  const realized = realizedIncome(data, monthKey, asOf);
  const planned = plannedIncome(data, monthKey);
  const partial = monthIsPartial(monthKey, asOf);
  const elapsed = monthElapsedRatio(monthKey, asOf);
  const projected = projectedIncome(data, monthKey, asOf);

  let basis = "indefinida";
  if (realized > 0) basis = "realizada";
  else if (planned > 0) basis = "planejada";

  return {
    monthKey: String(monthKey || ""),
    planned, realized, projected,
    basis,
    partial,
    elapsed,
    // Um indicador que compara renda com gasto só é confiável quando os dois
    // lados cobrem o mesmo período. No mês corrente isso só vale perto do fim.
    complete: !partial,
    hasPlan: planned > 0,
    hasRealized: realized > 0,
  };
}

// Compatibilidade: continua sendo o número usado por orçamento e limite diário,
// que são POR NATUREZA planejamento (respondem "quanto posso gastar", não
// "quanto entrou"). Indicadores de desempenho devem usar `incomeBasis`.
function effectiveIncome(data, monthKey) {
  const info = incomeBasis(data, monthKey);
  return info.partial || info.monthKey >= keyOfDate(new Date()) ? info.projected : info.realized;
}

function overallBalance(data) {
  if (typeof accountsCashBalance === "function") return accountsCashBalance(data, null);
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    cents += t.type === "income" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(cents);
}

function realizedBalance(data) {
  if (typeof accountsCashBalance === "function") return accountsCashBalance(data, todayIso());
  const today = todayIso();
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.date > today) return;
    cents += t.type === "income" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(cents);
}

function reservedBalance(data) {
  return sumMoney(data.goals || [], (g) => g.savedUpfront || 0);
}
function freeBalance(data) {
  return realizedBalance(data);
}
function goalsTotalSaved(data) {
  return sumMoney(data.goals || [], (g) => g.current || 0);
}

function goalExistingBalance(goal) {
  const current = Math.max(0, roundMoney(goal && goal.current));
  return Math.min(current, Math.max(0, roundMoney(goal && goal.existingBalance)));
}

// Parcela das metas que está realmente fora do caixa. O saldo anterior informado
// na criação é apenas uma classificação de dinheiro que já está no saldo.
function goalsNetWorthSaved(data) {
  return sumMoney(data.goals || [], (g) => subMoney(Math.max(0, roundMoney(g.current)), goalExistingBalance(g)));
}

function goalLedgerBalance(data, goalId, asOf) {
  const limit = asOf || todayIso();
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.goalId !== goalId || t.date > limit) return;
    cents += t.type === "expense" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(cents);
}

function reconcileGoalBalances(data, asOf) {
  const source = data && typeof data === "object" ? data : {};
  const goals = (source.goals || []).map((g) => {
    const existing = goalExistingBalance(g);
    const current = Math.max(0, addMoney(existing, goalLedgerBalance(source, g.id, asOf)));
    return moneyCompare(current, g.current) === 0 && moneyCompare(existing, g.existingBalance || 0) === 0
      ? g
      : { ...g, current, existingBalance: Math.min(existing, current) };
  });
  return goals.every((g, i) => g === (source.goals || [])[i]) ? source : { ...source, goals };
}

function goalTransactionEffect(transaction, asOf) {
  const t = transaction;
  if (!t || !t.goalId || t.date > (asOf || todayIso())) return 0;
  return t.type === "expense" ? roundMoney(t.amount) : -roundMoney(t.amount);
}

// Aplica somente a diferença provocada pela edição ou exclusão. Assim uma base
// histórica legítima da meta é preservada mesmo que tenha sido criada antes do
// histórico detalhado disponível neste aparelho.
function applyGoalTransactionMutation(data, before, after, asOf) {
  const ids = new Set([before && before.goalId, after && after.goalId].filter(Boolean));
  if (ids.size === 0) return data;
  const effects = {};
  ids.forEach((id) => { effects[id] = 0; });
  if (before && before.goalId) effects[before.goalId] -= goalTransactionEffect(before, asOf);
  if (after && after.goalId) effects[after.goalId] += goalTransactionEffect(after, asOf);
  return {
    ...data,
    goals: (data.goals || []).map((g) => {
      if (!Object.prototype.hasOwnProperty.call(effects, g.id) || moneyCompare(effects[g.id], 0) === 0) return g;
      const current = Math.max(0, addMoney(g.current, effects[g.id]));
      return { ...g, current, existingBalance: Math.min(goalExistingBalance(g), current) };
    }),
  };
}

function getPendingRecurring(data, currentMonthKey) {
  const [y, m] = currentMonthKey.split("-").map(Number);
  const prevDate = addMonths(new Date(y, m - 1, 1), -1);
  const prevKey = keyOfDate(prevDate);
  const prevRecurring = txForMonth(data, prevKey).filter((t) => t.type === "expense" && t.recurring);
  const seen = new Set(); const templates = [];
  prevRecurring.forEach((t) => {
    const k = t.categoryId + "|" + (t.description || "");
    if (!seen.has(k)) { seen.add(k); templates.push(t); }
  });
  const thisMonthRecurring = txForMonth(data, currentMonthKey).filter((t) => t.type === "expense" && t.recurring);
  const thisKeys = new Set(thisMonthRecurring.map((t) => t.categoryId + "|" + (t.description || "")));
  return templates.filter((t) => !thisKeys.has(t.categoryId + "|" + (t.description || "")));
}

function last6MonthsSummary(data) {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = addMonths(now, -i);
    const key = keyOfDate(d);
    const t = realizedMonthTotals(data, key);
    out.push({ key, label: MONTH_ABBR[d.getMonth()], income: t.income, expense: t.expense });
  }
  return out;
}

// Fábrica canônica de transações; garante que todo lançamento (manual, importado,
// via QR/PIX ou via linguagem natural) nasça com valor normalizado e com os
// índices denormalizados corretos para o IndexedDB. TODO ponto do app que cria
// lançamento passa por aqui; antes havia quatro construções inline que esqueciam
// `monthKey`/`source` e quebravam as consultas indexadas.
function makeTransaction(partial) {
  const date = isRealIsoDate(String(partial.date || "")) ? partial.date : todayIso();
  const nowIso = new Date().toISOString();
  const source = transactionSourceOf(partial.source);
  const createdAt = partial.createdAt || nowIso;
  return {
    id: normalizeRecordId(partial.id, "transaction"),
    type: partial.type === "income" ? "income" : "expense",
    amount: Math.abs(roundMoney(partial.amount)),
    categoryId: normalizeRecordId(partial.categoryId || "outros", "category"),
    date,
    monthKey: monthKeyOf(date),
    payment: PAYMENT_METHODS.includes(partial.payment) ? partial.payment : "Outro",
    description: String(partial.description || "").trim().slice(0, 200),
    recurring: !!partial.recurring,
    createdAt,
    updatedAt: nowIso,
    goalId: normalizeRecordRef(partial.goalId, "goal"),
    installmentGroupId: normalizeRecordRef(partial.installmentGroupId, "installment"),
    installmentIndex: partial.installmentIndex || null,
    installmentTotal: partial.installmentTotal || null,
    source,
    origin: normalizeTransactionOrigin(partial.origin, source, source === "manual" ? null : createdAt),
    changeLog: normalizeTransactionLog(partial.changeLog, createdAt, source),
    reviewedIssues: normalizeReviewedIssues(partial.reviewedIssues),
    accountId: normalizeRecordRef(partial.accountId, "account"),
    creditCardId: normalizeRecordRef(partial.creditCardId, "card"),
    debtId: normalizeRecordRef(partial.debtId, "asset"),
    // Resolvida por último: ela depende de tipo, meta e dívida já normalizados.
    nature: normalizeTransactionNature(partial.nature, {
      type: partial.type === "income" ? "income" : "expense",
      goalId: normalizeRecordRef(partial.goalId, "goal"),
      debtId: normalizeRecordRef(partial.debtId, "asset"),
      categoryId: normalizeRecordId(partial.categoryId || "outros", "category"),
    }),
  };
}

// Rótulos para a interface. Ficam aqui, junto da definição, para não haver duas
// listas de naturezas em lugares diferentes.
const TRANSACTION_NATURE_LABELS = Object.freeze({
  consumo: "Gasto",
  aporte: "Guardar ou investir",
  "divida-principal": "Amortizar dívida",
  "divida-encargos": "Juros e tarifas",
  transferencia: "Transferência entre contas",
  renda: "Renda",
  resgate: "Resgate de reserva",
  estorno: "Estorno de um gasto",
});

const TRANSACTION_NATURE_HINTS = Object.freeze({
  consumo: "Entra em gastos e no orçamento do mês.",
  aporte: "Não conta como gasto: vira patrimônio.",
  "divida-principal": "Não conta como gasto: reduz o saldo devedor.",
  "divida-encargos": "Conta como gasto: é o custo real da dívida.",
  transferencia: "Não conta como gasto nem como renda.",
  renda: "Conta como renda do mês.",
  resgate: "Não conta como renda: é dinheiro que já era seu.",
  estorno: "Desconta do gasto original em vez de virar renda.",
});

function transactionNatureOptions(type) {
  return (type === "income" ? INCOME_NATURES : EXPENSE_NATURES).map((id) => ({
    id, label: TRANSACTION_NATURE_LABELS[id], hint: TRANSACTION_NATURE_HINTS[id],
  }));
}

// Atualiza uma transação existente preservando id/createdAt e recalculando índices.

function updateTransaction(original, patch) {
  const tracked = ["type", "amount", "categoryId", "date", "payment", "description", "recurring", "accountId", "creditCardId", "goalId", "debtId", "nature"];
  const fields = tracked.filter((field) => {
    const next = Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : original[field];
    return JSON.stringify(next == null ? null : next) !== JSON.stringify(original[field] == null ? null : original[field]);
  });
  return makeTransaction({
    ...original,
    ...patch,
    id: original.id,
    createdAt: original.createdAt,
    changeLog: fields.length ? appendTransactionLog(original.changeLog, { action: "edited", fields }, original.createdAt, original.source) : original.changeLog,
  });
}

function markTransactionIssueReviewed(original, issueKey) {
  const key = String(issueKey || "").trim();
  if (!key || normalizeReviewedIssues(original.reviewedIssues).includes(key)) return original;
  return makeTransaction({
    ...original,
    id: original.id,
    createdAt: original.createdAt,
    reviewedIssues: [...normalizeReviewedIssues(original.reviewedIssues), key],
    changeLog: appendTransactionLog(original.changeLog, { action: "reviewed", fields: [key] }, original.createdAt, original.source),
  });
}

// Gera as N parcelas de uma compra no crédito. O rateio usa splitMoney, então a
// soma das parcelas é EXATAMENTE o valor da compra (sem centavo sobrando/faltando).
function makeInstallmentTransactions(base, installments) {
  const n = Math.max(1, Math.min(48, Math.round(Number(installments) || 1)));
  const parts = splitMoney(base.amount, n);
  const groupId = base.installmentGroupId || uid();
  const label = (base.description || "").trim() || "Compra parcelada";
  return parts.map((value, i) => makeTransaction({
    ...base,
    id: undefined,
    amount: value,
    date: addMonthsToIso(base.date || todayIso(), i),
    description: n > 1 ? `${label} (${i + 1}/${n})` : label,
    recurring: false,
    installmentGroupId: n > 1 ? groupId : null,
    installmentIndex: n > 1 ? i + 1 : null,
    installmentTotal: n > 1 ? n : null,
  }));
}

// ==============================================================================
// FEATURE 2. BACKUP: exportação e importação do banco local
// ==============================================================================
// O backup é um "envelope" versionado e verificável, não um despejo cru do
// snapshot. Isso permite (a) detectar arquivo corrompido antes de destruir os
// dados atuais, (b) migrar backups antigos e (c) mesclar sem duplicar.
const BACKUP_KIND = "organizador-financeiro/backup";

class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BackupError";
    this.code = code; // INVALID_JSON | NOT_A_BACKUP | CHECKSUM | EMPTY
  }
}

// Serialização canônica (chaves ordenadas) para que o checksum seja estável
// independentemente da ordem em que o JS enumerou as propriedades.
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

// União dos três mapas, resolvendo conflito pela data mais recente. Não há
// "desfazer" implícito aqui: se os dois lados marcaram, marcado fica.
function mergeRecurringPrefs(a, b) {
  const left = normalizeRecurringPrefs(a);
  const right = normalizeRecurringPrefs(b);
  const out = defaultRecurringPrefs();
  ["ignored", "dismissed", "confirmed"].forEach((bucket) => {
    Object.keys(left[bucket]).forEach((k) => { out[bucket][k] = left[bucket][k]; });
    Object.keys(right[bucket]).forEach((k) => {
      const cur = out[bucket][k];
      if (!cur || right[bucket][k] > cur) out[bucket][k] = right[bucket][k];
    });
  });
  return out;
}

function mergeTransactionAudit(a, b) {
  const winner = (b.updatedAt || "") > (a.updatedAt || "") ? b : a;
  const logs = new Map();
  [...normalizeTransactionLog(a.changeLog, a.createdAt, a.source), ...normalizeTransactionLog(b.changeLog, b.createdAt, b.source)].forEach((entry) => {
    const key = entry.id || `${entry.at}|${entry.action}|${entry.fields.join(",")}`;
    logs.set(key, entry);
  });
  return {
    ...winner,
    changeLog: Array.from(logs.values()).sort((left, right) => left.at.localeCompare(right.at)).slice(-TRANSACTION_LOG_MAX),
    reviewedIssues: normalizeReviewedIssues([...(a.reviewedIssues || []), ...(b.reviewedIssues || [])]),
  };
}

function backupPayloadOf(data) {
  return {
    version: SCHEMA_VERSION,
    transactions: data.transactions || [],
    categories: data.categories || [],
    goals: data.goals || [],
    assets: data.assets || [],
    monthlyIncome: data.monthlyIncome || 0,
    creditCardLimit: data.creditCardLimit || 0,
    theme: data.theme || "light",
    budgetSplit: data.budgetSplit || defaultBudgetSplit(),
    budgetAlerts: data.budgetAlerts || defaultBudgetAlerts(),
    budgetHistory: normalizeBudgetHistory(data.budgetHistory),
    dismissedCarryForwardMonth: data.dismissedCarryForwardMonth || null,
    userName: data.userName || "",
    emergencyGoalId: data.emergencyGoalId || null,
    emergencyMonths: Number(data.emergencyMonths) || 6,
    marketRates: normalizeMarketRates(data.marketRates),
    recurringPrefs: normalizeRecurringPrefs(data.recurringPrefs),
    notifications: normalizeNotifications(data.notifications),
    accounts: normalizeAccounts(data.accounts),
    creditCards: normalizeCreditCards(data.creditCards, data.accounts),
    accountTransfers: normalizeAccountTransfers(data.accountTransfers, data.accounts),
    cardPayments: normalizeCardPayments(data.cardPayments, data.accounts, data.creditCards),
    accountAdjustments: normalizeAccountAdjustments(data.accountAdjustments, data.accounts),
    debtPlan: normalizeDebtPlan(data.debtPlan),
    onboarding: normalizeOnboarding(data.onboarding, data),
    dashboardLayout: normalizeDashboardLayout(data.dashboardLayout),
    dashboardFocus: normalizeDashboardFocus(data.dashboardFocus),
    categoryRules: normalizeCategoryRules(data.categoryRules),
    privacy: normalizePrivacy(data.privacy),
    // Sem as lápides no arquivo, restaurar um backup ressuscita tudo que foi
    // apagado depois que ele foi gerado.
    graveyard: normalizeGraveyard(data.graveyard),
    lastBackupAt: normalizeIsoDate(data.lastBackupAt) || null,
  };
}

function buildBackupEnvelope(data) {
  const payload = backupPayloadOf(data);
  return {
    kind: BACKUP_KIND,
    schema: SCHEMA_VERSION,
    app: "Finanças. Controle Financeiro Pessoal",
    exportedAt: new Date().toISOString(),
    counts: {
      transactions: payload.transactions.length,
      categories: payload.categories.length,
      goals: payload.goals.length,
      assets: payload.assets.length,
      accounts: payload.accounts.length,
      creditCards: payload.creditCards.length,
    },
    checksum: checksumOf(canonicalJson(payload)),
    data: payload,
  };
}

// Aceita o envelope novo E backups antigos (snapshot cru), para não invalidar
// arquivos que o usuário já tenha guardado.
// Teto do arquivo de restauração. Sem ele, um arquivo de 500 MB (por engano ou
// de propósito) trava a aba no `JSON.parse`, que é síncrono: a página congela
// antes de qualquer validação e o usuário não consegue nem cancelar.
const BACKUP_MAX_BYTES = 32 * 1024 * 1024;
const BACKUP_MAX_RECORDS = 200000;

function parseBackupFile(text) {
  const raw = String(text == null ? "" : text);
  if (raw.length > BACKUP_MAX_BYTES) {
    throw new BackupError("TOO_LARGE", "O arquivo é maior que o limite de 32 MB aceito na restauração.");
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new BackupError("INVALID_JSON", "O arquivo não é um JSON válido."); }
  if (!parsed || typeof parsed !== "object") {
    throw new BackupError("NOT_A_BACKUP", "O arquivo não parece ser um backup do app.");
  }

  let payload = null;
  let meta = { exportedAt: null, legacy: false, checksumOk: true };

  if (parsed.kind === BACKUP_KIND && parsed.data) {
    payload = parsed.data;
    meta.exportedAt = parsed.exportedAt || null;
    if (parsed.checksum) {
      meta.checksumOk = checksumOf(canonicalJson(payload)) === parsed.checksum;
    }
  } else if (Array.isArray(parsed.transactions) || Array.isArray(parsed.categories)) {
    payload = parsed;                    // formato legado: o snapshot direto
    meta.legacy = true;
  } else {
    throw new BackupError("NOT_A_BACKUP", "O arquivo não parece ser um backup do app.");
  }

  // Teto de registros, antes de normalizar: `migrate` percorre e reconstrói
  // cada item, então um arquivo com milhões de linhas trava a aba mesmo cabendo
  // no limite de bytes.
  const totalRegistros = ["transactions", "categories", "goals", "assets"]
    .reduce((soma, chave) => soma + (Array.isArray(payload[chave]) ? payload[chave].length : 0), 0);
  if (totalRegistros > BACKUP_MAX_RECORDS) {
    throw new BackupError("TOO_MANY_RECORDS", `O arquivo tem ${totalRegistros} registros, acima do limite de ${BACKUP_MAX_RECORDS} aceito na restauração.`);
  }

  const normalized = migrate(payload);
  if (normalized.transactions.length === 0 && normalized.goals.length === 0 && !normalized.monthlyIncome) {
    meta.empty = true;
  }
  return {
    data: normalized,
    meta: {
      ...meta,
      counts: {
        transactions: normalized.transactions.length,
        categories: normalized.categories.length,
        goals: normalized.goals.length,
        assets: normalized.assets.length,
        accounts: normalized.accounts.length,
        creditCards: normalized.creditCards.length,
      },
    },
  };
}

// Assinatura de conteúdo de um lançamento. NÃO serve para decidir mesclagem
// (dois gastos iguais no mesmo dia são normais e ambos têm de sobreviver); é
// usada apenas onde o usuário PEDE uma revisão de possíveis repetidos, como na
// conferência de importação de extrato, onde ele confirma um a um.
function transactionSignature(t) {
  return [t.date, t.type, moneyToCents(t.amount), t.categoryId, t.accountId || "", t.creditCardId || "", t.debtId || "", normalizeText(t.description)].join("|");
}

// Mescla um backup com os dados atuais: nada é apagado, apenas complementado.
// Conflitos de mesmo id são resolvidos pela marca do relógio lógico.
function mergeBackupInto(current, incoming) {
  const stats = { added: 0, updated: 0, skipped: 0, categories: 0, goals: 0, assets: 0, accounts: 0, creditCards: 0, revived: 0 };

  // v14; as exclusões dos DOIS lados, unidas antes de qualquer coisa. Um id
  // que consta aqui só volta a existir se o registro tiver sido editado depois
  // da data da exclusão (ver survivesTombstone).
  const graveyard = mergeGraveyards(current.graveyard, incoming.graveyard);

  const mergeList = (currentList, incomingList, onConflict) => {
    const byId = new Map(currentList.map((r) => [r.id, r]));
    incomingList.forEach((rec) => {
      const existing = byId.get(rec.id);
      if (!existing) { byId.set(rec.id, rec); return; }
      byId.set(rec.id, onConflict ? onConflict(existing, rec) : existing);
    });
    return Array.from(byId.values());
  };

  // Vencedor de conflito: a marca do relógio lógico manda. `updatedAt` só entra
  // quando um dos lados não tem marca (base antiga, backup gerado por uma
  // versão anterior). Sem isso, o aparelho com o relógio adiantado ganhava
  // todas as disputas, inclusive contra edições feitas depois dele.
  const pickNewer = (dateField) => (a, b) => {
    const revA = normalizeSyncRev(a && a.syncRev);
    const revB = normalizeSyncRev(b && b.syncRev);
    if (revA || revB) return syncRevGreater(revB, revA) ? b : a;
    return ((b && b[dateField]) || "") > ((a && a[dateField]) || "") ? b : a;
  };
  const pickUpdated = pickNewer("updatedAt");

  const categories = applyGraveyard(mergeList(current.categories, incoming.categories, pickUpdated), graveyard, "categories");
  stats.categories = categories.length - current.categories.length;

  const goals = applyGraveyard(mergeList(current.goals, incoming.goals, pickNewer("createdAt")), graveyard, "goals");
  stats.goals = goals.length - current.goals.length;

  // Patrimônio: conflito de mesmo id fica com o registro alterado por último.

  const assets = applyGraveyard(mergeList(current.assets || [], incoming.assets || [], pickUpdated), graveyard, "assets");
  stats.assets = assets.length - (current.assets || []).length;

  const accounts = mergeList(current.accounts || [], incoming.accounts || [], pickUpdated);
  const creditCards = mergeList(current.creditCards || [], incoming.creditCards || [], pickUpdated);
  const accountTransfers = mergeList(current.accountTransfers || [], incoming.accountTransfers || [], pickUpdated);
  const cardPayments = mergeList(current.cardPayments || [], incoming.cardPayments || [], pickUpdated);
  const accountAdjustments = mergeList(current.accountAdjustments || [], incoming.accountAdjustments || [], pickNewer("createdAt"));
  stats.accounts = accounts.length - (current.accounts || []).length;
  stats.creditCards = creditCards.length - (current.creditCards || []).length;

  // IDENTIDADE É O `id`, NUNCA O CONTEÚDO.
  //
  // Antes, um lançamento novo era descartado quando "parecia" com outro já
  // existente (mesma data, valor, categoria e descrição). Isso apagava
  // silenciosamente despesas legítimas e repetidas, que são a regra e não a
  // exceção: dois cafés de R$ 8 no mesmo dia, duas passagens iguais, duas
  // compras no mesmo mercado. O usuário lançava as duas, sincronizava, e uma
  // sumia sem aviso. Nenhuma heurística de conteúdo pode decidir isso; só o id.
  const byId = new Map(current.transactions.map((t) => [t.id, t]));
  const txGraves = graveyard.transactions;
  incoming.transactions.forEach((t) => {
    const existing = byId.get(t.id);
    if (existing) {
      const mergedTx = mergeTransactionAudit(existing, t);
      byId.set(t.id, mergedTx);
      if (pickUpdated(existing, t) === t) stats.updated++;
      else stats.skipped++;
      return;
    }
    // Lançamento apagado aqui não volta por um arquivo ou aparelho atrasado.
    if (!survivesTombstone(t, txGraves[t.id])) { stats.skipped++; return; }
    byId.set(t.id, t);
    stats.added++;
  });

  const merged = migrate({
    ...current,
    graveyard,
    transactions: applyGraveyard(Array.from(byId.values()), graveyard, "transactions"),
    categories,
    goals,
    assets,
    accounts,
    creditCards,
    accountTransfers,
    cardPayments,
    accountAdjustments,
    // Configurações: mantém as atuais, só adota as do backup quando não existirem.
    monthlyIncome: current.monthlyIncome || incoming.monthlyIncome,
    creditCardLimit: current.creditCardLimit || incoming.creditCardLimit,
    budgetSplit: current.budgetSplit || incoming.budgetSplit,
    budgetAlerts: current.budgetAlerts || incoming.budgetAlerts,
    budgetHistory: mergeBudgetHistory(current.budgetHistory, incoming.budgetHistory),
    // As premissas de mercado são do aparelho de quem está restaurando: só
    // adotamos as do backup quando as atuais nunca foram revisadas.
    marketRates: (current.marketRates && current.marketRates.updatedAt) ? current.marketRates : (incoming.marketRates || current.marketRates),
    // Acompanhamento de recorrências: a UNIÃO dos dois lados. Se um aparelho já
    // mandou parar de acompanhar uma assinatura, restaurar um backup antigo não
    // deve ressuscitá-la na lista; e o que o backup ignorava também vale aqui.
    recurringPrefs: mergeRecurringPrefs(current.recurringPrefs, incoming.recurringPrefs),
    // Notificações: união por `key`, com a leitura preservada dos dois lados.
    notifications: mergeNotifications(current.notifications, incoming.notifications),
    // Quem está restaurando já passou (ou pulou) a configuração inicial neste
    // aparelho. Um backup antigo não pode reabrir o assistente de boas-vindas.
    onboarding: (current.onboarding && current.onboarding.done) ? current.onboarding : (incoming.onboarding || current.onboarding),
    // Layout do Início: o do aparelho manda. Quem está mesclando está olhando
    // para a própria tela agora; reorganizá-la a partir de um arquivo antigo
    // seria a última coisa que ele esperaria de um botão chamado "mesclar".
    dashboardLayout: normalizeDashboardLayout(current.dashboardLayout),
    dashboardFocus: normalizeDashboardFocus(current.dashboardFocus || incoming.dashboardFocus),
    // Regras de categorização: a UNIÃO das duas listas, por id, com a versão
    // local vencendo em caso de conflito. Regra criada em outro aparelho é
    // trabalho que ninguém quer refazer.
    categoryRules: mergeCategoryRules(current.categoryRules, incoming.categoryRules),
    // Consentimento e bloqueio de IA são escolhas do aparelho atual. Mesclar
    // um arquivo não pode aceitar textos nem reativar envio em nome do usuário.
    privacy: normalizePrivacy(current.privacy),
    // Backup: a data mais recente dos dois lados. Restaurar um arquivo antigo
    // não deve fazer o app achar que o backup de ontem nunca existiu.
    lastBackupAt: [current.lastBackupAt || "", incoming.lastBackupAt || ""].sort().pop() || null,
    debtPlan: (() => {
      const local = normalizeDebtPlan(current.debtPlan);
      const backup = normalizeDebtPlan(incoming.debtPlan);
      return (backup.updatedAt || "") > (local.updatedAt || "") ? backup : local;
    })(),
  });

  // Orçamentos por categoria: adota o do backup onde o usuário ainda não definiu.

  const incomingBudgets = new Map(incoming.categories.map((c) => [c.id, c.budget]));
  merged.categories = merged.categories.map((c) => (
    c.budget == null && incomingBudgets.get(c.id) != null ? { ...c, budget: incomingBudgets.get(c.id) } : c
  ));

  return { data: merged, stats };
}

// ---- Geradores de arquivo (o download em si fica em app.js/utils.js) ----

function backupFilename(ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `financas-backup-${stamp}.${ext}`;
}

function buildTransactionsCsv(data) {
  const header = ["Tipo", "Categoria", "Subcategoria", "Valor", "Data", "Pagamento", "Descrição", "Recorrente", "Parcela", "Origem"];
  const lines = [header.join(",")];
  const sorted = [...(data.transactions || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  sorted.forEach((t) => {
    const cat = categoryById(data, t.categoryId);
    const parent = cat.parentId ? categoryById(data, cat.parentId) : null;
    // Valor com sinal (negativo = gasto), mesma convenção do importador de
    // extratos; assim o próprio CSV pode ser reimportado sem virar tudo receita.
    const signed = t.type === "income" ? roundMoney(t.amount) : -roundMoney(t.amount);
    lines.push([
      t.type === "income" ? "Receita" : "Gasto",
      csvCell(parent ? parent.name : cat.name),
      csvCell(parent ? cat.name : ""),
      signed.toFixed(2),
      t.date,
      csvCell(t.payment),
      csvCell(t.description || ""),
      t.recurring ? "Sim" : "Não",
      t.installmentTotal ? `${t.installmentIndex}/${t.installmentTotal}` : "",
      csvCell(t.source || "manual"),
    ].join(","));
  });
  return "\uFEFF" + lines.join("\n");   // BOM: o Excel pt-BR abre com acentos corretos
}

function buildBudgetsCsv(data, monthKey) {
  const status = computeBudgetStatus(data, monthKey);
  const lines = ["Categoria,Grupo,Limite,Gasto,Restante,% do limite,Situação"];
  status.items.forEach((b) => {
    lines.push([
      csvCell(b.fullName), csvCell(GROUP_LABELS[b.group] || ""),
      b.budget.toFixed(2), b.spent.toFixed(2), b.remaining.toFixed(2),
      b.pct.toFixed(1), b.level === "over" ? "Estourado" : b.level === "warn" ? "Atenção" : "Dentro do limite",
    ].join(","));
  });
  return "\uFEFF" + lines.join("\n");
}
