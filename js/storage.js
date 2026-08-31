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
const DB_VERSION = 4;   // v4. Commit atômico, metadados locais e entidades do protocolo 3
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
// Largura fixa do formato. Estourar qualquer um dos dois produziria uma marca
// fora do padrão, que o app trata como "sem marca" e perde para qualquer
// lápide. São os mesmos limites do `cofre_hlc_successor` no servidor.
const HLC_MAX_COUNTER = 999999;
const HLC_MAX_MILLIS = 999999999999999;
const SYNC_WRITER_TOKEN = (() => {
  let token = "";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      token = crypto.randomUUID().replace(/[^A-Za-z0-9]/g, "");
    }
  } catch (_error) { /* usa a alternativa local abaixo */ }
  if (!token) {
    token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      .replace(/[^A-Za-z0-9]/g, "");
  }
  return (token || "localwriter").padEnd(12, "0").slice(0, 12);
})();

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
  //
  // O contador tem SEIS dígitos. Depois de absorver uma barreira de reset com o
  // contador cheio, somar um produziria sete dígitos: marca inválida, tratada
  // como ausência de marca, que perde para as lápides que a barreira deveria
  // vencer. Ao encher, o contador vira e o milissegundo avança um, igual ao
  // `cofre_hlc_successor` do servidor.
  function tick() {
    const now = Date.now();
    if (now > lastMillis) { lastMillis = now; counter = 0; }
    else if (counter >= HLC_MAX_COUNTER) {
      // Relógio no fim da largura: mantém a última marca válida em vez de
      // devolver texto que nenhuma comparação entende. Inalcançável na prática.
      if (lastMillis < HLC_MAX_MILLIS) { lastMillis += 1; counter = 0; }
    }
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

  // Absorção CONFIÁVEL, sem o teto de 24h. Existe só para a barreira de reset
  // confirmada pelo servidor: o RPC carimba a exclusão acima de TODA marca que a
  // conta já conhecia, inclusive a de um aparelho com o relógio muito
  // adiantado, e nesse caso ela nasce além do teto. Recusar essa marca faria o
  // primeiro lançamento criado depois de apagar nascer menor que as lápides e
  // sumir no ciclo seguinte. As operações remotas comuns continuam em
  // `observe`, onde o teto vale.
  function absorb(rev) {
    const parsed = parse(rev);
    if (!parsed) return false;
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

  return { setDevice, tick, observe, absorb, parse, state, restore, reset, device: () => deviceId };
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

// Duas abas compartilham o id persistente do aparelho, mas cada uma mantém o
// contador HLC em memória. Sem um desempate por aba, duas escritas no mesmo
// milissegundo podem receber exatamente a mesma revisão e representar conteúdos
// diferentes. O sufixo continua dentro do componente opaco aceito pelo servidor.
// O prefixo persistente continua identificando o dono para reenvio de lápides.
function syncWriterId() {
  const suffix = `:tab_${SYNC_WRITER_TOKEN}`;
  return `${syncDeviceId().slice(0, 80 - suffix.length)}${suffix}`;
}

function isLocalSyncWriter(value) {
  const writer = String(value || "");
  const stable = syncDeviceId();
  if (writer === stable) return true; // revisões criadas antes do sufixo por aba
  const marker = ":tab_";
  const baseLength = 80 - marker.length - SYNC_WRITER_TOKEN.length;
  return writer.startsWith(`${stable.slice(0, baseLength)}${marker}`);
}
const SCHEMA_VERSION = 23;  // v23; identificador do banco na origem do lançamento (FITID do OFX)
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
const STORE_LOCAL_META = "localMeta";      // v4; cursor, recibos e diários que nunca sobem

// Chaves do `localMeta`. Ficam aqui, e não no motor de sincronização, porque
// quem grava e quem lê é o armazenamento: o motor apenas as usa pelo nome.
const META_CURSOR = "syncCursor";              // até onde este aparelho leu o log
const META_SEED_RECEIPT = "syncSeedReceipt";   // semeadura confirmada pelo servidor
const META_SEED_JOURNAL = "syncSeedJournal";   // semeadura em andamento
const META_LINK_JOURNAL = "guestLinkJournal";  // vínculo em andamento, com as marcas já cunhadas
const META_LINK_RECEIPT = "guestLinkReceipt";  // decisão registrada pela impressão do conteúdo
const META_SYNC_BATCH = "syncBatchJournal";    // lote em voo; preserva mutationId após resposta perdida
// Reconciliação completa já executada neste aparelho, para esta conta. Ver o
// bloco "RECONCILIAÇÃO COMPLETA" em js/cloud-sync.js: sem ela, um aparelho que
// deixou passar uma operação fica com números diferentes dos outros para sempre,
// porque o servidor nunca reenvia o que ficou atrás do cursor.
const META_RECONCILE_RECEIPT = "syncReconcileReceipt";
// [M14] Última importação de extrato, para poder desfazê-la. Guarda SÓ os
// identificadores criados, a data e o nome do arquivo; nenhum valor, descrição
// ou categoria. Fica no `localMeta` de propósito: pertence a este aparelho, não
// sai no backup nem sobe na sincronização.
const META_IMPORT_UNDO = "importUndo";
const COLLECTIONS = [STORE_TX, STORE_CAT, STORE_GOALS, STORE_ASSETS];
const ALL_STORES = [STORE_TX, STORE_CAT, STORE_GOALS, STORE_ASSETS, STORE_SETTINGS];

// Uma descrição única impede que uma coleção seja esquecida num dos caminhos
// de diff, semeadura, conflito, lápide ou restauração. As cinco últimas ainda
// moram fisicamente em `settings`, mas sincronizam como registros por ID.
const SYNC_ENTITY_DEFS = Object.freeze({
  transactions: Object.freeze({ store: STORE_TX, prefix: "transaction" }),
  categories: Object.freeze({ store: STORE_CAT, prefix: "category" }),
  goals: Object.freeze({ store: STORE_GOALS, prefix: "goal" }),
  assets: Object.freeze({ store: STORE_ASSETS, prefix: "asset" }),
  accounts: Object.freeze({ setting: "accounts", prefix: "account" }),
  creditCards: Object.freeze({ setting: "creditCards", prefix: "card" }),
  accountTransfers: Object.freeze({ setting: "accountTransfers", prefix: "transfer" }),
  cardPayments: Object.freeze({ setting: "cardPayments", prefix: "payment" }),
  accountAdjustments: Object.freeze({ setting: "accountAdjustments", prefix: "adjustment" }),
});
const SYNC_ENTITY_FIELDS = Object.freeze(Object.keys(SYNC_ENTITY_DEFS));
const SYNC_LIST_SETTINGS = new Set(SYNC_ENTITY_FIELDS.filter((field) => !!SYNC_ENTITY_DEFS[field].setting));

function syncEntryKey(entry) {
  const current = String(entry && entry.entryKey || "");
  if (/^[A-Za-z0-9][A-Za-z0-9:_-]{7,119}$/.test(current)) return current;
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `op_${crypto.randomUUID()}`;
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function prepareOutboxEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    entryKey: syncEntryKey(entry),
    queuedAt: Number(entry && entry.queuedAt) || Date.now(),
  }));
}

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
  "import-pdf": "PDF bancário",
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
    // v23. Identificador dado pelo BANCO ao movimento (`FITID` do OFX), quando
    // existe. É o que permite reconhecer a mesma linha numa reimportação sem
    // depender de valor, data e texto continuarem idênticos. Nasce `null` em
    // toda base anterior e em todo lançamento que não veio de extrato.
    externalId: origin.externalId ? String(origin.externalId).trim().slice(0, 120) : null,
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
      syncRev: normalizeSyncRev(a.syncRev),
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
      syncRev: normalizeSyncRev(c.syncRev),
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
      syncRev: normalizeSyncRev(t.syncRev),
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
      syncRev: normalizeSyncRev(p.syncRev),
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
      updatedAt: a.updatedAt || a.createdAt || new Date().toISOString(),
      syncRev: normalizeSyncRev(a.syncRev),
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
const GRAVEYARD_COLLECTIONS = SYNC_ENTITY_FIELDS;
const GRAVEYARD_MAX_PER_COLLECTION = 4000;
const GRAVEYARD_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000;   // ~24 meses

function defaultGraveyard() {
  const out = {};
  GRAVEYARD_COLLECTIONS.forEach((c) => { out[c] = {}; });
  return out;
}

const GRAVE_PREFIXES = Object.freeze(Object.fromEntries(
  SYNC_ENTITY_FIELDS.map((field) => [field, SYNC_ENTITY_DEFS[field].prefix])
));

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
      // Conta que o lançamento diz ter, mas que este aparelho ainda não
      // conhece. Ver o bloco v12 mais abaixo: é o que impede a normalização de
      // DESTRUIR o vínculo quando o lançamento desce antes da conta.
      pendingAccountId: normalizeRecordRef(t.pendingAccountId, "account"),
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
    // REFERÊNCIA PARA UMA CONTA AUSENTE NÃO É LIXO.
    //
    // Zerar `accountId` quando a conta não está na base é saneamento correto
    // para um backup adulterado. Durante a SINCRONIZAÇÃO é destruição, e não
    // por acaso: no vínculo do visitante a ordem é garantida: o ciclo desce
    // primeiro (chegam os lançamentos, apontando para a conta do banco) e só
    // depois o "juntar dados" traz a conta. Nesse intervalo TODOS eles perdiam
    // o vínculo.
    //
    // O estrago não era perder o vínculo; era o registro mutilado ser gravado
    // COM A MARCA DO SERVIDOR. A partir daí dois aparelhos carregavam a mesma
    // marca com conteúdos diferentes, e a comparação de marcas, que é toda a
    // defesa do protocolo, não enxerga: `>` é falso entre iguais. Cada um
    // mostrava um saldo, os dois diziam "Tudo sincronizado", nenhum tinha o que
    // enviar, e nada no funcionamento normal desfazia isso.
    //
    // Agora o alvo ausente fica GUARDADO em `pendingAccountId` e volta sozinho
    // assim que a conta aparece. Para as ~60 leituras espalhadas pelo app nada
    // muda: `accountId` continua nulo enquanto a conta não existe, que é
    // exatamente o que elas já tratavam. O saldo também não some no intervalo,
    // porque `legacyCashBalance` conta o que nenhuma conta reivindica.
    data.transactions = data.transactions.map((t) => {
      const creditCardId = cardIds.has(t.creditCardId) ? t.creditCardId : null;
      const pedido = creditCardId ? null : (t.accountId || t.pendingAccountId || null);
      const accountId = pedido && accountIds.has(pedido) ? pedido : null;
      return {
        ...t,
        accountId,
        pendingAccountId: pedido && !accountId ? pedido : null,
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
  async writeChanges(_changeSet, _commit) { throw new Error("writeChanges() não implementado"); }
  async replaceAll(_data, _commit) { throw new Error("replaceAll() não implementado"); }
  async clearAll() { throw new Error("clearAll() não implementado"); }
  // Fila de sincronização; o adapter em memória simplesmente não guarda nada.
  async outboxAppend(_entries) { return false; }
  async outboxRead(_limit) { return []; }
  async outboxDrop(_seqs) { return false; }
  async outboxClear() { return false; }
  async localMetaGet(_key) { return null; }
  async localMetaPut(_key, _value) { return false; }
  async localMetaDelete(_key) { return false; }
  async localMetaClear() { return false; }
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
    this.closed = false;
    this.reopening = null;
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
        let outboxStore;
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          outboxStore = db.createObjectStore(STORE_OUTBOX, { keyPath: "seq", autoIncrement: true });
        } else {
          outboxStore = req.transaction.objectStore(STORE_OUTBOX);
        }
        if (!outboxStore.indexNames.contains("by_linkId")) outboxStore.createIndex("by_linkId", "linkId", { unique: false });
        if (!outboxStore.indexNames.contains("by_seedId")) outboxStore.createIndex("by_seedId", "seedId", { unique: false });
        if (!outboxStore.indexNames.contains("by_entryKey")) outboxStore.createIndex("by_entryKey", "entryKey", { unique: false });

        // v4. Metadados que pertencem ao aparelho e ao escopo atual. Este store
        // não participa de `readAll()`, backup, exportação nem operações remotas.
        if (!db.objectStoreNames.contains(STORE_LOCAL_META)) {
          db.createObjectStore(STORE_LOCAL_META, { keyPath: "key" });
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
  // A conexão pode cair POR FORA do app: outra aba subindo a versão do banco
  // (`onversionchange`) ou o próprio navegador fechando o handle sob pressão de
  // armazenamento (`onclose`). Os dois casos zeravam `this.db` e nada reabria:
  // dali em diante toda gravação estourava "Banco de dados não inicializado", o
  // app acusava armazenamento indisponível e o que fosse digitado só existia no
  // espelho, e some no recarregamento. Reabrir sob demanda é o conserto.
  async _ensure() {
    if (this.db) return true;
    if (this.closed) throw new Error("Banco de dados fechado");
    if (!this.reopening) {
      this.reopening = this.init().finally(() => { this.reopening = null; });
    }
    await this.reopening;
    return true;
  }

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
    await this._ensure();
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

  _commitStores(commit) {
    const options = commit || {};
    const stores = ALL_STORES.slice();
    if ((options.outboxAdds || []).length || (options.outboxDrops || []).length) stores.push(STORE_OUTBOX);
    if (Object.keys(options.metaPuts || {}).length || (options.metaDeletes || []).length) stores.push(STORE_LOCAL_META);
    return stores;
  }

  _applyCommitSidecars(tx, commit) {
    const options = commit || {};
    const outboxAdds = prepareOutboxEntries(options.outboxAdds || []);
    const outboxDrops = Array.isArray(options.outboxDrops) ? options.outboxDrops : [];
    if (outboxAdds.length || outboxDrops.length) {
      if (!this._has(STORE_OUTBOX)) throw new Error("Fila de sincronização ausente no banco local");
      const store = tx.objectStore(STORE_OUTBOX);
      outboxDrops.forEach((seq) => store.delete(Number(seq)));
      outboxAdds.forEach((entry) => {
        const clean = { ...entry };
        delete clean.seq;
        store.add(clean);
      });
    }

    const metaPuts = options.metaPuts || {};
    const metaDeletes = Array.isArray(options.metaDeletes) ? options.metaDeletes : [];
    if (Object.keys(metaPuts).length || metaDeletes.length) {
      if (!this._has(STORE_LOCAL_META)) throw new Error("Metadados locais ausentes no banco local");
      const store = tx.objectStore(STORE_LOCAL_META);
      metaDeletes.forEach((key) => store.delete(String(key)));
      Object.entries(metaPuts).forEach(([key, value]) => store.put({ key, value }));
    }
  }

  // O diff financeiro, a fila e os metadados confirmam no mesmo `oncomplete`.
  async writeChanges(changeSet, commit) {
    await this._ensure();
    const changes = changeSet || { puts: {}, deletes: {}, settings: {} };
    const tx = this._tx(this._commitStores(commit), "readwrite");
    COLLECTIONS.forEach((name) => {
      if (!this._has(name)) return;
      const store = tx.objectStore(name);
      ((changes.puts || {})[name] || []).forEach((rec) => store.put(rec));
      ((changes.deletes || {})[name] || []).forEach((id) => store.delete(id));
    });
    const settingsStore = tx.objectStore(STORE_SETTINGS);
    Object.entries(changes.settings || {}).forEach(([key, value]) => {
      settingsStore.put({ key, value });
    });
    this._applyCommitSidecars(tx, commit);
    return this._done(tx);
  }

  async replaceAll(data, commit) {
    await this._ensure();
    const tx = this._tx(this._commitStores(commit), "readwrite");
    this._existing(ALL_STORES).forEach((s) => tx.objectStore(s).clear());
    data.transactions.forEach((t) => tx.objectStore(STORE_TX).put(t));
    data.categories.forEach((c) => tx.objectStore(STORE_CAT).put(c));
    data.goals.forEach((g) => tx.objectStore(STORE_GOALS).put(g));
    if (this._has(STORE_ASSETS)) (data.assets || []).forEach((a) => tx.objectStore(STORE_ASSETS).put(a));
    SETTING_KEYS.forEach((key) => tx.objectStore(STORE_SETTINGS).put({ key, value: data[key] }));
    this._applyCommitSidecars(tx, commit);
    return this._done(tx);
  }

  async clearAll() {
    await this._ensure();
    const tx = this._tx(ALL_STORES, "readwrite");
    this._existing(ALL_STORES).forEach((s) => tx.objectStore(s).clear());
    return this._done(tx);
  }

  // ---- Consultas indexadas (usadas por relatórios) ----
  async queryByIndex(storeName, indexName, value) {
    await this._ensure();
    const tx = this._tx([storeName], "readonly");
    const idx = tx.objectStore(storeName).index(indexName);
    return new Promise((resolve, reject) => {
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- Fila persistente de sincronização ----
  // Quando a alteração nasce junto de uma operação que precisa subir, dado e
  // fila entram na mesma transação por `writeChanges`. O método separado existe
  // apenas para operações que não alteram a base financeira.
  async outboxAppend(entries) {
    if (!entries.length) return true;
    return this.writeChanges(null, { outboxAdds: entries });
  }

  async outboxRead(limit) {
    await this._ensure();
    if (!this._has(STORE_OUTBOX)) throw new Error("Fila de sincronização ausente no banco local");
    const tx = this._tx([STORE_OUTBOX], "readonly");
    const all = await this._getAll(tx.objectStore(STORE_OUTBOX));
    all.sort((a, b) => Number(a.seq) - Number(b.seq));
    return limit > 0 ? all.slice(0, limit) : all;
  }

  async outboxDrop(seqs) {
    if (!seqs.length) return true;
    return this.writeChanges(null, { outboxDrops: seqs });
  }

  async outboxClear() {
    await this._ensure();
    if (!this._has(STORE_OUTBOX)) throw new Error("Fila de sincronização ausente no banco local");
    const tx = this._tx([STORE_OUTBOX], "readwrite");
    tx.objectStore(STORE_OUTBOX).clear();
    return this._done(tx);
  }

  async localMetaGet(key) {
    await this._ensure();
    if (!this._has(STORE_LOCAL_META)) throw new Error("Metadados locais ausentes no banco local");
    const tx = this._tx([STORE_LOCAL_META], "readonly");
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_LOCAL_META).get(String(key));
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error || new Error("Falha ao ler metadado local"));
    });
  }

  async localMetaPut(key, value) {
    return this.writeChanges(null, { metaPuts: { [String(key)]: value } });
  }

  async localMetaDelete(key) {
    return this.writeChanges(null, { metaDeletes: [String(key)] });
  }

  async localMetaClear() {
    await this._ensure();
    if (!this._has(STORE_LOCAL_META)) throw new Error("Metadados locais ausentes no banco local");
    const tx = this._tx([STORE_LOCAL_META], "readwrite");
    tx.objectStore(STORE_LOCAL_META).clear();
    return this._done(tx);
  }

  // Trocar de conta precisa FECHAR a conexão. Sem isso o banco antigo fica
  // aberto, segura upgrades e mantém uma referência viva aos dados da conta
  // que acabou de sair.
  close() {
    this.closed = true;
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
    this.metaKey = scopedName("financas_db_meta", this.scope);
    this.recoveryKey = scopedName("financas_db_recovery", this.scope);
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
    this._recover();
    return true;
  }

  _read() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { throw new Error("Base local corrompida"); }
  }

  _readMeta() {
    const raw = localStorage.getItem(this.metaKey);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("formato");
      return parsed;
    } catch (e) { throw new Error("Metadados locais corrompidos"); }
  }

  _recover() {
    const raw = localStorage.getItem(this.recoveryKey);
    if (!raw) return false;
    let pending;
    try { pending = JSON.parse(raw); }
    catch (e) { throw new Error("Registro de recuperação local corrompido"); }
    if (!pending || pending.version !== 1 || !pending.data || !Array.isArray(pending.outbox) || !pending.meta) {
      throw new Error("Registro de recuperação local inválido");
    }
    localStorage.setItem(this.key, JSON.stringify(pending.data));
    localStorage.setItem(this.outboxKey, JSON.stringify(pending.outbox));
    localStorage.setItem(this.metaKey, JSON.stringify(pending.meta));
    localStorage.removeItem(this.recoveryKey);
    return true;
  }

  _commitFull(data, outbox, meta) {
    const payload = { version: 1, data, outbox, meta };
    const recovery = JSON.stringify(payload);
    const dataText = JSON.stringify(data);
    const outboxText = JSON.stringify(outbox);
    const metaText = JSON.stringify(meta);
    localStorage.setItem(this.recoveryKey, recovery);
    localStorage.setItem(this.key, dataText);
    localStorage.setItem(this.outboxKey, outboxText);
    localStorage.setItem(this.metaKey, metaText);
    if (localStorage.getItem(this.key) !== dataText
      || localStorage.getItem(this.outboxKey) !== outboxText
      || localStorage.getItem(this.metaKey) !== metaText) {
      throw new Error("O navegador não confirmou a gravação local");
    }
    localStorage.removeItem(this.recoveryKey);
    return true;
  }

  _applyCommit(outbox, meta, commit) {
    const options = commit || {};
    const drop = new Set((options.outboxDrops || []).map((seq) => Number(seq)));
    const kept = outbox.filter((entry) => !drop.has(Number(entry.seq)));
    const entryKeys = new Set(kept.map((entry) => String(entry.entryKey || "")).filter(Boolean));
    let nextSeq = kept.reduce((max, entry) => Math.max(max, Number(entry.seq) || 0), 0);
    prepareOutboxEntries(options.outboxAdds || []).forEach((entry) => {
      if (entryKeys.has(entry.entryKey)) return;
      entryKeys.add(entry.entryKey);
      kept.push({ ...entry, seq: ++nextSeq });
    });
    const nextMeta = { ...meta };
    (options.metaDeletes || []).forEach((key) => { delete nextMeta[String(key)]; });
    Object.entries(options.metaPuts || {}).forEach(([key, value]) => { nextMeta[key] = value; });
    return { outbox: kept.sort((a, b) => Number(a.seq) - Number(b.seq)), meta: nextMeta };
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

  async writeChanges(changeSet, commit) {
    const changes = changeSet || { puts: {}, deletes: {}, settings: {} };
    const current = (await this.readAll());
    const apply = (list, name) => {
      const map = new Map(list.map((r) => [r.id, r]));
      ((changes.puts || {})[name] || []).forEach((r) => map.set(r.id, r));
      ((changes.deletes || {})[name] || []).forEach((id) => map.delete(id));
      return Array.from(map.values());
    };
    const next = {
      transactions: apply(current.transactions, STORE_TX),
      categories: apply(current.categories, STORE_CAT),
      goals: apply(current.goals, STORE_GOALS),
      assets: apply(current.assets || [], STORE_ASSETS),
      ...current.settings,
      ...(changes.settings || {}),
    };
    const sidecars = this._applyCommit(this._readOutbox(), this._readMeta(), commit);
    return this._commitFull(next, sidecars.outbox, sidecars.meta);
  }

  async replaceAll(data, commit) {
    const sidecars = this._applyCommit(this._readOutbox(), this._readMeta(), commit);
    return this._commitFull(data, sidecars.outbox, sidecars.meta);
  }

  async clearAll() {
    localStorage.removeItem(this.key);
    return true;
  }

  // ---- Fila persistente (mesma semântica do IndexedDB, em uma chave só) ----
  _readOutbox() {
    const raw = localStorage.getItem(this.outboxKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("formato");
      return parsed;
    } catch (e) { throw new Error("Fila local corrompida"); }
  }

  _writeOutbox(list) {
    localStorage.setItem(this.outboxKey, JSON.stringify(list));
    return true;
  }

  async outboxAppend(entries) {
    if (!entries.length) return true;
    return this.writeChanges(null, { outboxAdds: entries });
  }

  async outboxRead(limit) {
    const list = this._readOutbox().sort((a, b) => Number(a.seq) - Number(b.seq));
    return limit > 0 ? list.slice(0, limit) : list;
  }

  async outboxDrop(seqs) {
    if (!seqs.length) return true;
    return this.writeChanges(null, { outboxDrops: seqs });
  }

  async outboxClear() {
    const current = await this.readAll();
    return this._commitFull({
      transactions: current.transactions, categories: current.categories, goals: current.goals,
      assets: current.assets, ...current.settings,
    }, [], this._readMeta());
  }

  async localMetaGet(key) {
    const meta = this._readMeta();
    return Object.prototype.hasOwnProperty.call(meta, String(key)) ? meta[String(key)] : null;
  }

  async localMetaPut(key, value) {
    return this.writeChanges(null, { metaPuts: { [String(key)]: value } });
  }

  async localMetaDelete(key) {
    return this.writeChanges(null, { metaDeletes: [String(key)] });
  }

  async localMetaClear() {
    const current = await this.readAll();
    return this._commitFull({
      transactions: current.transactions, categories: current.categories, goals: current.goals,
      assets: current.assets, ...current.settings,
    }, this._readOutbox(), {});
  }
}

// ------------------------------------------------------------------------------
// CloudAdapter; contrato defensivo para uma futura sincronização comercial.
// ------------------------------------------------------------------------------
const CLOUD_SYNC_PROTOCOL = 3;
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

function validCloudMutationId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ""));
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
    // A revisão vem no corpo do 409 de `remote_changed`: é ela que diz até onde
    // a conta avançou enquanto este aparelho preparava o vínculo.
    const revision = /^\d{1,18}$/.test(String(dados.revision == null ? "" : dados.revision)) ? String(dados.revision) : null;
    return { code, message, revision };
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    return {};
  }
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
    deviceLabel = "Este navegador",
    deviceType = "unknown",
    accountId = "",
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
    const cleanLabel = String(deviceLabel || "")
      .replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
    this.deviceLabel = cleanLabel || "Este navegador";
    this.deviceType = ["desktop", "phone", "tablet", "unknown"].includes(deviceType) ? deviceType : "unknown";
    this.accountId = String(accountId || "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(this.accountId)) {
      throw new CloudSyncError("A sincronização não recebeu a identidade válida da conta.", "invalid_account_scope");
    }
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.timeoutMs = clamp(Number(timeoutMs) || 12000, 1000, 30000);
    this.allowDestructive = allowDestructive === true;
    this.revision = null;
    this.serverProtocol = null;
    this.minimumWriteProtocol = null;
    this.initialized = false;
  }
  get name() { return "cloud"; }

  _headers(extra) {
    const h = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Device-Id": this.deviceId,
      "X-Device-Label": this.deviceLabel,
      "X-Device-Type": this.deviceType,
      "X-Account-Id": this.accountId,
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
      clearTimeout(timer);
      if (error && error.name === "AbortError") throw new CloudSyncError("O servidor de sincronização não respondeu a tempo.", "timeout");
      throw new CloudSyncError("Não foi possível acessar o servidor de sincronização.", "network_error");
    }

    try {
      if (!res.ok) {
      // A RAZÃO DA FALHA VEM NO CORPO, E ERA JOGADA FORA.
      //
      // O servidor deste app responde erro com `{ code, message }` escrito para
      // o usuário. Aqui só se olhava para o número do status, então "faltam as
      // tabelas no banco", "origem recusada" e "email não confirmado" viravam a
      // mesma frase sem conteúdo, e a tela mostrava "Sincronização com falha"
      // sem nunca dizer a falha.
        const detalhe = await cloudErrorBody(res);
      // A identidade é conferida antes de o backend devolver qualquer operação.
      // Preserve o código para a camada de sessão trocar de escopo sem tratar a
      // conta nova como logout nem aplicar um payload da conta errada.
        if (detalhe.code === "account_scope_changed" || detalhe.code === "invalid_account_scope"
          || detalhe.code === "session_refresh_required") {
          throw new CloudSyncError(detalhe.message || "A conta desta sessão mudou.", detalhe.code, res.status);
        }
      // `remote_changed` é o único 409 que NÃO é conflito de documento: ele diz
      // que a conta remota avançou entre a leitura e a confirmação do vínculo.
      // Tratá-lo como conflito faria o motor descartar a fila do vínculo.
        if (res.status === 409) {
          if (detalhe.code === "remote_changed") {
            const erro = new CloudSyncError(detalhe.message || "A conta mudou durante a operação.", "remote_changed", res.status);
            erro.revision = detalhe.revision != null ? String(detalhe.revision) : null;
            throw erro;
          }
          if (detalhe.code === "idempotency_mismatch") {
            throw new CloudSyncError(
              detalhe.message || "A repetição não corresponde ao envio original.",
              "idempotency_mismatch",
              res.status,
            );
          }
          throw new CloudSyncConflictError(res.headers && res.headers.get ? res.headers.get("x-sync-revision") : null);
        }
        if (res.status === 401 || res.status === 403) {
        // O código continua sendo um dos DOIS que o motor sabe tratar (parar em
        // vez de insistir); só a frase passa a ser a de verdade.
          const codigo = detalhe.code === "device_revoked" || detalhe.code === "device_unknown"
            ? detalhe.code
            : "session_expired";
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
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new CloudSyncError("O servidor de sincronização não respondeu a tempo.", "timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async init() {
    const result = await this._call("/health");
    if (result.status !== "ok") throw new CloudSyncError("O servidor de sincronização não está pronto.", "unavailable");
    this.revision = typeof result.revision === "string" ? result.revision : null;
    this.serverProtocol = Number(result.serverProtocol || result.protocol) || null;
    this.minimumWriteProtocol = Number(result.minimumWriteProtocol || result.protocol) || null;
    if (this.minimumWriteProtocol > CLOUD_SYNC_PROTOCOL) {
      throw new CloudSyncError("Atualize o aplicativo para voltar a sincronizar.", "protocol_upgrade_required", 426);
    }
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
  async push(ops, since, options) {
    this._requireReady(false);
    // O motor persiste este id junto da composição do lote antes de tocar na
    // rede. Se o servidor confirmar e a resposta se perder, a próxima tentativa
    // precisa repetir o mesmo par mutationId/conteúdo para receber `replayed`.
    const requestedMutationId = options && options.mutationId;
    const mutationId = validCloudMutationId(requestedMutationId) ? String(requestedMutationId) : cloudMutationId();
    const result = await this._call("/changes", {
      method: "POST",
      headers: { "Idempotency-Key": mutationId },
      body: {
        protocol: CLOUD_SYNC_PROTOCOL, mutationId, ops, since: String(since || "0"),
        // O nome do campo é o mesmo lido pelo backend. Divergir aqui fazia o
        // servidor ignorar a condição e aplicar o vínculo sem verificar nada.
        ...(options && options.expectedRemoteRevision != null
          ? { expectedRemoteRevision: String(options.expectedRemoteRevision) }
          : {}),
      },
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
    if (!result || (result.status !== "applied" && result.status !== "replayed")) {
      const code = result && result.status === "idempotency_mismatch" ? "idempotency_mismatch" : "invalid_commit";
      throw new CloudSyncError("O servidor não confirmou a exclusão remota.", code);
    }
    if (!/^\d{1,18}$/.test(String(result.revision || "")) || !isSyncRev(result.resetRev)) {
      throw new CloudSyncError("O servidor devolveu uma confirmação inválida para a exclusão.", "invalid_commit");
    }
    this.revision = String(result.revision);
    return {
      revision: this.revision,
      resetRev: result.resetRev,
      applied: Number(result.applied) || 0,
    };
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

  // Conteúdo de uma versão, paginado por cursor opaco da chave completa.
  // Paginado porque uma versão tem o tamanho da base, e é justamente o corpo
  // único gigante que o protocolo 2 existe para evitar.
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
  let storageGeneration = 0;
  let snapshot = defaultData();
  let snapshotVersion = 0;        // invalida leituras iniciadas antes de uma mutação
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
  const recoveryListeners = [];

  function storeContextIsCurrent(expectedScope, expectedAdapter, expectedGeneration) {
    return scope === expectedScope
      && adapter === expectedAdapter
      && (expectedGeneration == null || storageGeneration === expectedGeneration);
  }

  function storageCancelledError() {
    const error = new Error("O armazenamento mudou de escopo durante a sincronização.");
    error.code = "sync_cancelled";
    return error;
  }

  function installSnapshot(next) {
    snapshot = next;
    snapshotVersion += 1;
    return snapshot;
  }

  function assertStoreScope(expectedScope, expectedAdapter, expectedGeneration) {
    if (!expectedScope) return;
    if (!storeContextIsCurrent(expectedScope, expectedAdapter || adapter, expectedGeneration)) {
      throw storageCancelledError();
    }
  }

  function storageOperationCancelled(error) {
    return !!(error && error.code === "sync_cancelled");
  }

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

  // O aviso "seus dados não estão sendo salvos" ficava preso: nada avisava a
  // tela quando a gravação voltava a funcionar. Um soluço passageiro (uma
  // transação abortada, a conexão reaberta) condenava a sessão inteira ao alarme.
  function markHealthy() {
    if (healthy) return;
    healthy = true;
    recoveryListeners.forEach((fn) => { try { fn(); } catch (e) {} });
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

  // A barreira do reset NÃO é o relógio, e por isso mora em chave separada.
  // `purge()` apaga o relógio deste escopo de propósito: ele descrevia a base
  // que acabou de ser removida. Já a marca dominante devolvida pelo servidor
  // descreve as LÁPIDES que continuam na conta, e precisa sobreviver ao purge e
  // ao recarregamento. Sem ela, a primeira criação depois de apagar nasce menor
  // que as lápides e some no ciclo seguinte.
  function resetBarrierKey() { return scopedName("financas_db_reset_barrier", scope); }

  function storedResetBarrier() {
    try { return normalizeSyncRev(localStorage.getItem(resetBarrierKey()) || ""); }
    catch (e) { return ""; }
  }

  function loadResetBarrier() {
    const rev = storedResetBarrier();
    // `absorb` e não `observe`: a barreira é justamente o caso em que a marca
    // pode estar acima do teto de 24h.
    if (rev) SyncClock.absorb(rev);
    return rev;
  }

  // Guarda sempre a MAIOR barreira conhecida: uma resposta atrasada de um reset
  // antigo não pode rebaixar a marca de um reset mais novo.
  function saveResetBarrier(rev) {
    const next = normalizeSyncRev(rev);
    if (!next) return false;
    const current = storedResetBarrier();
    if (current && current >= next) return true;
    try { localStorage.setItem(resetBarrierKey(), next); return true; }
    catch (e) { return false; }
  }

  function loadClockState() {
    // A barreira vem PRIMEIRO e fora do try do relógio. Depois do purge a chave
    // do relógio não existe mais, e o `return` antecipado abaixo deixaria a
    // marca dominante sem efeito exatamente no caso que ela protege.
    loadResetBarrier();
    try {
      const parsed = JSON.parse(localStorage.getItem(clockKey()) || "null");
      if (!parsed || typeof parsed !== "object") return;
      SyncClock.restore(parsed.clock);
      settingRevs = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
    } catch (e) { settingRevs = {}; }
  }

  function observeSnapshotClock(data) {
    loadClockState();
    SYNC_ENTITY_FIELDS.forEach((field) => {
      ((data && data[field]) || []).forEach((record) => SyncClock.observe(record && record.syncRev));
    });
    const graveyard = normalizeGraveyard(data && data.graveyard);
    SYNC_ENTITY_FIELDS.forEach((field) => {
      Object.values(graveyard[field] || {}).forEach((entry) => SyncClock.observe(entry && entry.rev));
    });
    saveClockState();
  }

  function saveClockState() {
    try { localStorage.setItem(clockKey(), JSON.stringify({ clock: SyncClock.state(), settings: settingRevs })); }
    catch (e) { /* cota cheia: o relógio ainda funciona nesta sessão */ }
  }

  // `graveyard` não vai como configuração: as exclusões viajam como operações
  // próprias (op "delete"), que já carregam a mesma informação e não crescem o
  // envio a cada ciclo.
  const SYNC_ALLOWED_SETTINGS = new Set([
    "monthlyIncome", "creditCardLimit", "budgetSplit", "budgetAlerts", "budgetHistory", "userName",
    "emergencyGoalId", "emergencyMonths", "marketRates", "achievements", "recurringPrefs", "debtPlan",
    "onboarding", "categoryRules",
  ]);
  const SYNC_SKIP_SETTINGS = new Set(SETTING_KEYS.filter((key) => !SYNC_ALLOWED_SETTINGS.has(key)));

  // Marca os registros ALTERADOS LOCALMENTE e transforma o diff em operações.
  //
  // A regra de "alterado localmente" é a que impede o laço infinito: um
  // registro que chegou do servidor já vem com marca, e sua marca é diferente
  // da versão anterior daqui. Remarcá-lo faria este aparelho reivindicar a
  // alteração alheia e devolvê-la ao servidor, para sempre.
  function stampChangeSet(prev, next, changeSet) {
    if (!changeSet) return [];
    const ops = [];
    for (const field of SYNC_ENTITY_FIELDS) {
      const definition = SYNC_ENTITY_DEFS[field];
      let puts;
      let deletes;
      if (definition.store) {
        puts = (changeSet.puts[definition.store] || []);
        deletes = (changeSet.deletes[definition.store] || []);
      } else {
        const before = indexById((prev && prev[field]) || []);
        const after = indexById((next && next[field]) || []);
        puts = [];
        deletes = [];
        after.forEach((rec, id) => {
          const old = before.get(id);
          if (!old || fingerprintOf(old) !== fingerprintOf(rec)) puts.push(rec);
        });
        before.forEach((_rec, id) => { if (!after.has(id)) deletes.push(id); });
      }

      puts.forEach((rec) => {
        // "Veio de fora" é decidido por CONTEÚDO, não por dedução a partir da
        // marca. A dedução errava num caso real: o usuário edita um registro
        // que acabou de chegar do outro aparelho, antes de a gravação daquele
        // registro terminar. A marca ainda é a do remoto, mas o conteúdo já é
        // dele, e a edição não podia ser descartada.
        const key = `${field} ${rec.id}`;
        const echo = remoteApplied.get(key);
        if (echo !== undefined) remoteApplied.delete(key);
        if (echo !== undefined && echo === fingerprintOf(rec)) {
          SyncClock.observe(rec.syncRev);
          return;
        }
        // Escrita in loco, de propósito: recriar o objeto invalidaria a
        // memoização por identidade que segura a digitação em bases grandes,
        // e `syncRev` não é lido por nenhuma tela.
        rec.syncRev = SyncClock.tick();
        ops.push({ entity: field, entityId: rec.id, op: "put", rev: rec.syncRev, payload: rec });
      });
      deletes.forEach((id) => {
        // A lápide correspondente já foi criada por `withTombstones`; usamos a
        // marca dela para que exclusão e edição concorrentes sejam comparáveis.
        let grave = normalizeGraveEntry(((next.graveyard || {})[field] || {})[id]);
        if (!grave) {
          next.graveyard = withTombstones(next.graveyard, field, id);
          changeSet.settings.graveyard = next.graveyard;
          grave = normalizeGraveEntry(((next.graveyard || {})[field] || {})[id]);
        }
        const rev = (grave && grave.rev) || SyncClock.tick();
        // Exclusão que VEIO de fora não volta para o servidor: a marca dela
        // aponta para outro aparelho. Sem esta checagem, cada exclusão remota
        // gerava um eco que o outro lado reenviava de volta.
        const parsed = SyncClock.parse(rev);
        if (parsed && !isLocalSyncWriter(parsed.device)) return;
        ops.push({ entity: field, entityId: id, op: "delete", rev });
      });
    }
    Object.keys(changeSet.settings || {}).forEach((key) => {
      if (SYNC_SKIP_SETTINGS.has(key)) return;
      // Mesmo eco, do lado das configurações: se o valor gravado é exatamente o
      // que acabou de chegar do servidor, ele não é uma alteração deste
      // aparelho e não deve ser reivindicado como tal.
      if (Object.prototype.hasOwnProperty.call(remoteSettingEcho, key)) {
        const isEcho = remoteSettingEcho[key] === JSON.stringify(changeSet.settings[key]);
        delete remoteSettingEcho[key];
        if (isEcho) return;
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
  function expandLegacyListOps(ops) {
    const expanded = [];
    (Array.isArray(ops) ? ops : []).forEach((op) => {
      const field = op && op.entity === "settings" ? String(op.entityId || "") : "";
      if (!SYNC_LIST_SETTINGS.has(field) || !Array.isArray(op.payload)) {
        expanded.push(op);
        return;
      }
      const seen = new Set();
      op.payload.forEach((record) => {
        if (!record || !record.id) return;
        const id = normalizeRecordId(record.id, SYNC_ENTITY_DEFS[field].prefix);
        seen.add(id);
        expanded.push({
          entity: field, entityId: id, op: "put",
          rev: normalizeSyncRev(record.syncRev) || op.rev,
          payload: { ...record, id },
        });
      });
      (snapshot[field] || []).forEach((record) => {
        if (record && record.id && !seen.has(record.id)) {
          expanded.push({ entity: field, entityId: record.id, op: "delete", rev: op.rev });
        }
      });
    });
    return expanded;
  }

  async function applyRemoteOps(ops, expectedScope, options) {
    if (!ready) throw storageCancelledError();
    const rawList = Array.isArray(ops) ? ops : [];
    const outboxAdds = Array.isArray(options && options.outboxAdds) ? options.outboxAdds : [];
    // Só a reconciliação explícita liga isto. Ver a comparação de marcas abaixo.
    const trustRemoteOnTie = !!(options && options.trustRemoteOnTie);
    const storageAttempt = Math.max(0, Number(options && options._storageAttempt) || 0);
    if (!rawList.length && !outboxAdds.length) return { changed: false, data: snapshot, applied: 0 };
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const flushed = await flush();
    if (!flushed || !adapter) throw new Error("Não foi possível preparar o armazenamento para a descida");
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const baseSnapshot = snapshot;
    const baseVersion = snapshotVersion;
    const list = expandLegacyListOps(rawList);
    const retryAfterStorageChange = async (error) => {
      if (!storageChangedDuringOperation(error) || storageAttempt >= 3) throw error;
      await reload({ scope: targetScope, adapter: targetAdapter, generation: targetGeneration });
      return applyRemoteOps(rawList, targetScope, { ...(options || {}), _storageAttempt: storageAttempt + 1 });
    };

    const maps = {};
    SYNC_ENTITY_FIELDS.forEach((f) => { maps[f] = indexById(baseSnapshot[f] || []); });
    let graveyard = normalizeGraveyard(baseSnapshot.graveyard);
    const settings = {};
    const nextSettingRevs = { ...settingRevs };
    const nextSettingEcho = { ...remoteSettingEcho };
    const observedRevs = [];
    let changed = false;
    let applied = 0;
    const touched = new Set();   // registros efetivamente alterados por esta rodada

    list.forEach((op) => {
      if (!op || typeof op !== "object") return;
      const rev = normalizeSyncRev(op.rev);
      if (!rev) return;                       // operação sem marca não é comparável
      observedRevs.push(rev);

      if (op.entity === "settings") {
        const key = String(op.entityId || "");
        if (SETTING_KEYS.indexOf(key) === -1 || SYNC_SKIP_SETTINGS.has(key)) return;
        if (!syncRevGreater(rev, nextSettingRevs[key] || "")) return;
        nextSettingRevs[key] = rev;
        settings[key] = op.payload;
        nextSettingEcho[key] = JSON.stringify(op.payload);
        changed = true; applied++;
        return;
      }

      if (SYNC_ENTITY_FIELDS.indexOf(op.entity) === -1) return;
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
      // EMPATE DE MARCA NÃO É "IGUAL". Ver `trustRemoteOnTie` acima: no ciclo
      // comum um empate é eco do que este aparelho mesmo mandou, e reaplicá-lo
      // seria trabalho perdido. Numa releitura explícita do zero é o contrário:
      // é a única chance de consertar um registro que ficou com a marca do
      // servidor e o conteúdo mutilado.
      if (existing && !(trustRemoteOnTie ? !syncRevGreater(existing.syncRev, rev) : syncRevGreater(rev, existing.syncRev))) return;
      if (!op.payload || typeof op.payload !== "object") return;
      map.set(id, { ...op.payload, id, syncRev: rev });
      touched.add(`${op.entity} ${id}`);
      changed = true; applied++;
    });

    if (!changed) {
      try {
        await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
          await assertPhysicalSnapshot(targetScope, targetAdapter, targetGeneration, baseSnapshot);
          if (outboxAdds.length) await targetAdapter.writeChanges(null, { outboxAdds });
        });
      } catch (error) {
        return retryAfterStorageChange(error);
      }
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      // Estas marcas vieram do servidor autenticado. Se uma delas estiver mais
      // de 24 h à frente, ela já domina o estado remoto; apenas ignorá-la no
      // relógio faria a próxima edição local nascer menor e nunca chegar aos
      // outros aparelhos. O teto continua valendo para estado local, backup e
      // restauração do relógio, que não têm esta confirmação remota.
      observedRevs.forEach((rev) => SyncClock.absorb(rev));
      saveClockState();
      if (outboxAdds.length) markHealthy();
      return { changed: false, data: snapshot, applied: 0 };
    }

    const assembled = {
      ...baseSnapshot,
      ...settings,
      graveyard,
    };
    SYNC_ENTITY_FIELDS.forEach((field) => { assembled[field] = Array.from(maps[field].values()); });
    const next = migrate(assembled);
    const changeSet = computeChangeSet(baseSnapshot, next);
    // Operação remota que a normalização anula (um carimbo que `migrate`
    // reescreve para o mesmo valor) não gera gravação. Isso não é falha: o
    // conteúdo já está aqui. O que ela não pode fazer é avançar o cursor sem
    // registrar a revisão observada, e por isso a marca continua sendo salva.
    if (changeSet) {
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      const stamp = Date.now();
      changeSet.settings.lastPersistAt = stamp;
      next.lastPersistAt = stamp;
    }
    try {
      await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
        await assertPhysicalSnapshot(targetScope, targetAdapter, targetGeneration, baseSnapshot);
        if (changeSet || outboxAdds.length) {
          await targetAdapter.writeChanges(changeSet, outboxAdds.length ? { outboxAdds } : undefined);
        }
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
    } catch (error) {
      return retryAfterStorageChange(error);
    }
    if (snapshotVersion !== baseVersion) {
      // Uma edição local pode acontecer enquanto a transação remota aguarda o
      // IndexedDB. O banco já contém `next`; reaplicamos somente a diferença
      // feita depois de `baseSnapshot`, sobre esse estado remoto, e a gravamos
      // com uma revisão posterior. Nenhum dos dois lados desaparece.
      const concurrentSnapshot = snapshot;
      const localChanges = computeChangeSet(baseSnapshot, concurrentSnapshot);
      settingRevs = nextSettingRevs;
      remoteSettingEcho = nextSettingEcho;
      Object.keys((localChanges && localChanges.settings) || {}).forEach((key) => {
        delete remoteSettingEcho[key];
      });
      observedRevs.forEach((rev) => SyncClock.absorb(rev));
      let rebasedSnapshot = overlayChangeSet(next, localChanges);
      // A lápide pode ter nascido antes de observarmos a revisão remota que
      // estava em voo. Recarimbá-la agora garante que uma exclusão feita depois
      // da edição remota vença também no servidor e nos outros aparelhos.
      rebasedSnapshot = restampConcurrentDeletes(baseSnapshot, concurrentSnapshot, rebasedSnapshot);
      saveClockState();
      lastPersisted = shallowSnapshot(next);
      installSnapshot(rebasedSnapshot);
      const rebased = await flush();
      if (!rebased) throw storageCancelledError();
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      announceWrite();
      return { changed: true, data: snapshot, applied };
    }
    installSnapshot(next);
    lastPersisted = shallowSnapshot(next);
    settingRevs = nextSettingRevs;
    remoteSettingEcho = nextSettingEcho;
    observedRevs.forEach((rev) => SyncClock.absorb(rev));
    // Guarda a impressão do registro JÁ NORMALIZADO. É com ela que a gravação
    // seguinte reconhece o eco e não devolve ao servidor a alteração alheia.
    SYNC_ENTITY_FIELDS.forEach((field) => {
      (next[field] || []).forEach((rec) => {
        const key = `${field} ${rec.id}`;
        if (touched.has(key)) remoteApplied.set(key, fingerprintOf(rec));
      });
    });
    saveClockState();
    markHealthy();
    announceWrite();
    return { changed: true, data: next, applied };
  }

  // ---------------------------------------------------------------------------
  // SEMEADURA: o que já existia aqui antes de a sincronização entrar em cena
  // ---------------------------------------------------------------------------
  // A fila só recebe DIFERENÇA. `stampChangeSet` compara a gravação com a
  // anterior e enfileira o que mudou; base parada não gera operação nenhuma.
  //
  // Isso deixava um buraco grande e silencioso. Quem já tinha meses de uso
  // quando ligou a conta, quem restaurou um backup, quem trouxe os dados de
  // visitante, ou quem usou o app enquanto o servidor estava fora do ar, não
  // produziu diferença nenhuma DEPOIS disso: a base inteira ficou invisível
  // para o servidor. E nada em tela denunciava, porque a fila estava mesmo
  // vazia e o cartão dizia "Tudo sincronizado". O outro aparelho entrava na
  // mesma conta e via uma conta vazia, para sempre.
  //
  // A semeadura fecha o buraco reapresentando a base ao servidor. Ela NÃO
  // inventa marca: usa a que o registro já carrega, e só cunha uma nova para o
  // que nunca passou por uma gravação local (backup restaurado, dados
  // adotados). Como a marca viaja junto e o servidor guarda a VENCEDORA,
  // ignorando marca menor ou igual, reapresentar é inofensivo mesmo quando o
  // outro aparelho já escreveu algo mais novo no mesmo registro.
  // `restamp` distingue os dois usos: semear reapresenta com a marca que já
  // existe; substituir a base inteira (restaurar backup, adotar visitante) é
  // uma declaração nova, e por isso cunha marca nova para tudo.
  // O VAZIO DE UM APARELHO NOVO NÃO É NOTÍCIA.
  //
  // Toda instalação nasce com as mesmas categorias iniciais e com as
  // configurações no padrão. Se um celular recém-conectado anunciasse isso com
  // marca nova, ele venceria por ser o mais recente e apagaria, no computador,
  // a categoria renomeada e a renda preenchida. Por isso o que ainda está
  // exatamente como veio de fábrica fica de fora da semeadura: não há nada a
  // contar, e o silêncio preserva o que o outro aparelho tem.
  function igualAoPadrao(valor, padrao) {
    if (padrao === undefined) return false;
    try { return JSON.stringify(valor) === JSON.stringify(padrao); }
    catch (e) { return false; }
  }

  function semNovidade(rec, modelo) {
    if (!modelo) return false;
    const limpo = { ...rec };
    delete limpo.syncRev;
    return igualAoPadrao(limpo, modelo);
  }

  function collectSyncOps(restamp, sourceData) {
    const source = sourceData || snapshot;
    const ops = [];
    const stamped = { puts: {}, deletes: {}, settings: {} };
    const stampedSettings = new Set();
    // Na substituição da base inteira a comparação com o padrão não vale: ali o
    // usuário DECLAROU o estado, inclusive quando ele coincide com o de fábrica.
    const padrao = restamp ? null : defaultData();
    const modelos = {};
    GRAVEYARD_COLLECTIONS.forEach((field) => {
      modelos[field] = padrao ? indexById(padrao[field] || []) : new Map();
    });
    GRAVEYARD_COLLECTIONS.forEach((field) => {
      (source[field] || []).forEach((rec) => {
        if (!rec || !rec.id) return;
        let rev = restamp ? "" : normalizeSyncRev(rec.syncRev);
        if (!rev) {
          if (semNovidade(rec, modelos[field].get(rec.id))) return;
          rev = SyncClock.tick();
          rec.syncRev = rev;
          const definition = SYNC_ENTITY_DEFS[field];
          if (definition.store) (stamped.puts[definition.store] = stamped.puts[definition.store] || []).push(rec);
          else stampedSettings.add(field);
        }
        ops.push({ entity: field, entityId: rec.id, op: "put", rev, payload: rec });
      });
    });
    stampedSettings.forEach((field) => { stamped.settings[field] = source[field]; });
    SETTING_KEYS.forEach((key) => {
      if (SYNC_SKIP_SETTINGS.has(key)) return;
      if (source[key] === undefined) return;
      let rev = restamp ? "" : normalizeSyncRev(settingRevs[key]);
      if (!rev) {
        if (padrao && igualAoPadrao(source[key], padrao[key])) return;
        rev = SyncClock.tick();
        settingRevs[key] = rev;
      }
      ops.push({ entity: "settings", entityId: key, op: "put", rev, payload: source[key] });
    });
    // Exclusões feitas AQUI enquanto não havia para onde mandar. As de outro
    // aparelho ficam de fora pelo mesmo motivo de `stampChangeSet`: reenviar a
    // exclusão alheia seria reivindicá-la como nossa.
    const grave = normalizeGraveyard(source.graveyard);
    GRAVEYARD_COLLECTIONS.forEach((field) => {
      Object.keys(grave[field] || {}).forEach((id) => {
        const rev = normalizeSyncRev((grave[field][id] || {}).rev);
        const parsed = rev ? SyncClock.parse(rev) : null;
        if (!parsed || !isLocalSyncWriter(parsed.device)) return;
        ops.push({ entity: field, entityId: id, op: "delete", rev });
      });
    });
    saveClockState();
    return { ops, stamped };
  }

  // Marcas, fila e diário de semeadura confirmam juntos. O recibo definitivo
  // nasce somente quando o servidor reconhecer o lote e a fila ficar vazia.
  async function seedOutbox(expectedScope, storageAttempt) {
    if (!outboxEnabled || !adapter) return { seedId: null, queued: 0, empty: true };
    const attempt = Math.max(0, Number(storageAttempt) || 0);
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const flushed = await flush();
    if (!flushed) throw new Error("Não foi possível concluir os dados antes da semeadura");
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const seedBase = shallowSnapshot(snapshot);
    const seedVersion = snapshotVersion;
    let outcome;
    try {
      outcome = await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
        await assertPhysicalSnapshot(targetScope, targetAdapter, targetGeneration, seedBase);
        const { ops, stamped } = collectSyncOps(false, seedBase);
        if (!ops.length) return { seedId: null, queued: 0, empty: true, persisted: null };
        const seededSnapshot = shallowSnapshot(seedBase);
        const seedId = syncEntryKey({}).replace(/^op_/, "seed_");
        const entries = ops.map((op, index) => ({
          ...op, seedId, entryKey: `${seedId}_${String(index).padStart(6, "0")}`,
        }));
        await targetAdapter.writeChanges(stamped, {
          outboxAdds: entries,
          metaPuts: { [META_SEED_JOURNAL]: { version: 1, seedId, status: "queued", queued: entries.length, createdAt: new Date().toISOString() } },
        });
        return { seedId, queued: entries.length, empty: false, persisted: seededSnapshot };
      });
    } catch (error) {
      if (!storageChangedDuringOperation(error) || attempt >= 3) throw error;
      await reload({ scope: targetScope, adapter: targetAdapter, generation: targetGeneration });
      return seedOutbox(targetScope, attempt + 1);
    }
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    if (outcome.persisted) lastPersisted = outcome.persisted;
    if (snapshotVersion !== seedVersion) {
      const rebased = await flush();
      if (!rebased) throw storageCancelledError();
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
    }
    markHealthy();
    return { seedId: outcome.seedId, queued: outcome.queued, empty: outcome.empty };
  }

  // Troca da base inteira: o que sumiu precisa de lápide, senão volta do outro
  // aparelho na primeira descida. A marca é nova porque restaurar é um ato de
  // agora, não a repetição do passado.
  function stampReplacement(previousSources, replacement) {
    const prepared = shallowSnapshot(replacement || snapshot);
    const sources = Array.isArray(previousSources) ? previousSources : [previousSources];
    GRAVEYARD_COLLECTIONS.forEach((field) => {
      const vivos = indexById(prepared[field] || []);
      const ids = new Set();
      sources.forEach((previous) => {
        ((previous && previous[field]) || []).forEach((rec) => {
          if (rec && rec.id && !vivos.has(rec.id)) ids.add(rec.id);
        });
      });
      if (ids.size) prepared.graveyard = withTombstones(prepared.graveyard, field, Array.from(ids));
    });
    return { ...collectSyncOps(true, prepared), data: prepared };
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

  function overlayChangeSet(base, changeSet) {
    if (!changeSet) return base;
    const next = shallowSnapshot(base);
    const pairs = [[STORE_TX, "transactions"], [STORE_CAT, "categories"], [STORE_GOALS, "goals"], [STORE_ASSETS, "assets"]];
    pairs.forEach(([storeName, field]) => {
      const records = indexById(next[field] || []);
      ((changeSet.deletes || {})[storeName] || []).forEach((id) => records.delete(id));
      ((changeSet.puts || {})[storeName] || []).forEach((record) => records.set(record.id, record));
      next[field] = Array.from(records.values());
    });
    Object.entries(changeSet.settings || {}).forEach(([key, value]) => { next[key] = value; });
    return next;
  }

  function restampConcurrentDeletes(base, local, rebased) {
    let graveyard = rebased.graveyard;
    SYNC_ENTITY_FIELDS.forEach((field) => {
      const before = indexById((base && base[field]) || []);
      const after = indexById((local && local[field]) || []);
      const deleted = [];
      before.forEach((_record, id) => { if (!after.has(id)) deleted.push(id); });
      if (deleted.length) graveyard = withTombstones(graveyard, field, deleted);
    });
    return graveyard === rebased.graveyard ? rebased : { ...rebased, graveyard };
  }

  // Cópia rasa por coleção: preserva as referências dos registros (essenciais
  // para o diff acima) sem o custo do JSON.parse(JSON.stringify(...)) completo.
  function shallowSnapshot(data) {
    const out = Object.assign({}, data);
    SYNC_ENTITY_FIELDS.forEach((field) => { out[field] = (data[field] || []).slice(); });
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
    storageGeneration += 1;
    const initGeneration = storageGeneration;
    const initRequestIsCurrent = () => storageGeneration === initGeneration && scope === nextScope;
    if (adapter && typeof adapter.close === "function") { try { adapter.close(); } catch (e) {} }
    scope = nextScope;
    adapter = null;
    installSnapshot(defaultData());
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
    SyncClock.setDevice(syncWriterId());
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
        await withStorageScopeLock(nextScope, () => cand.init());
        if (!initRequestIsCurrent()) {
          if (adapter !== cand && typeof cand.close === "function") { try { cand.close(); } catch (e) {} }
          throw storageCancelledError();
        }
        adapter = cand;
        lastErr = null;
        break;
      } catch (err) {
        if (!initRequestIsCurrent()) {
          if (adapter !== cand && typeof cand.close === "function") { try { cand.close(); } catch (e) {} }
          throw storageCancelledError();
        }
        lastErr = err;
      }
    }

    if (!initRequestIsCurrent()) throw storageCancelledError();
    if (!adapter) {
      // Modo memória: tenta pelo menos ressuscitar o espelho da sessão anterior.
      emitError(lastErr || new Error("Nenhum mecanismo de armazenamento disponível"));
      const mirror = readMirror();
      installSnapshot(mirror ? migrate(mirror.data) : defaultData());
      lastPersisted = null;
      ready = true;
      return snapshot;
    }

    const targetAdapter = adapter;
    try {
      return await runScopedMutation(nextScope, targetAdapter, initGeneration, async () => {
        let raw = await targetAdapter.readAll();
        assertStoreScope(nextScope, targetAdapter, initGeneration);

        if (isEmpty(raw)) {
          const legacy = readLegacyBlob() || (readMirror() || {}).data;
          if (legacy) {
            // ---- Migração automática localStorage → IndexedDB (uma única vez) ----
            const migrated = migrate(legacy);
            migrated.lastPersistAt = Date.now();
            await targetAdapter.replaceAll(migrated);
            assertStoreScope(nextScope, targetAdapter, initGeneration);
            try { localStorage.setItem(LEGACY_KEY + "_backup", JSON.stringify(legacy)); } catch (e) {}
            try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
            installSnapshot(migrated);
            lastPersisted = shallowSnapshot(migrated);
            writeMirror(snapshot, true);
            ready = true; healthy = true;
            return snapshot;
          }
          const fresh = migrate(defaultData());
          fresh.lastPersistAt = Date.now();
          await targetAdapter.replaceAll(fresh);
          assertStoreScope(nextScope, targetAdapter, initGeneration);
          installSnapshot(fresh);
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
            await targetAdapter.replaceAll(assembled);
            assertStoreScope(nextScope, targetAdapter, initGeneration);
          }
        }

        installSnapshot(assembled);
        lastPersisted = shallowSnapshot(snapshot);

        // Se a normalização alterou algo (migração de versão), grava de volta.

        const cs = computeChangeSet(assembleSnapshotRawCopy(raw), snapshot);
        if (cs) {
          cs.settings.lastPersistAt = Date.now();
          snapshot.lastPersistAt = cs.settings.lastPersistAt;
          await targetAdapter.writeChanges(cs);
          assertStoreScope(nextScope, targetAdapter, initGeneration);
          lastPersisted = shallowSnapshot(snapshot);
        }
        writeMirror(snapshot, true);

        ready = true; healthy = true;
        return snapshot;
      });
    } catch (err) {
      if (!storeContextIsCurrent(nextScope, targetAdapter, initGeneration)) throw storageCancelledError();
      emitError(err);
      const mirror = readMirror();
      installSnapshot(mirror ? migrate(mirror.data) : defaultData());
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
  function enqueueWrite(job) {
    const run = writeQueue.then(job, job);
    writeQueue = run.catch(() => {});
    return run;
  }

  // A fila acima coordena esta aba. O Web Lock estende a mesma exclusão às
  // outras abas do mesmo escopo, inclusive ao fallback que grava um documento
  // inteiro no localStorage. Navegadores sem a API continuam com a fila local.
  function withStorageScopeLock(targetScope, job) {
    const locks = typeof navigator !== "undefined" && navigator.locks;
    if (!locks || typeof locks.request !== "function") return job();
    return locks.request(`cofre-storage-${targetScope}`, { mode: "exclusive" }, job);
  }

  function storageChangedError() {
    const error = new Error("O armazenamento mudou em outra aba durante a operação.");
    error.code = "storage_changed";
    return error;
  }

  function storageChangedDuringOperation(error) {
    return !!(error && error.code === "storage_changed");
  }

  async function runScopedMutation(targetScope, targetAdapter, targetGeneration, job) {
    return withStorageScopeLock(targetScope, async () => {
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      const result = await job();
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      return result;
    });
  }

  function enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, job) {
    return enqueueWrite(() => runScopedMutation(targetScope, targetAdapter, targetGeneration, job));
  }

  async function assertPhysicalSnapshot(targetScope, targetAdapter, targetGeneration, expected) {
    const raw = await targetAdapter.readAll();
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const physical = assembleSnapshot(raw);
    const forward = computeChangeSet(expected, physical);
    const backward = computeChangeSet(physical, expected);
    if (forward || backward) {
      throw storageChangedError();
    }
    return physical;
  }

  async function commitCurrentSnapshot(context) {
    const targetScope = context ? context.scope : scope;
    const targetAdapter = context ? context.adapter : adapter;
    const targetGeneration = context ? context.generation : storageGeneration;
    if (!targetAdapter) return false;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    return runScopedMutation(targetScope, targetAdapter, targetGeneration, async () => {
      const target = shallowSnapshot(snapshot);
      const cs = computeChangeSet(lastPersisted, target);
      if (!cs) return true;
      const ops = outboxEnabled ? stampChangeSet(lastPersisted, target, cs) : [];
      const stamp = Date.now();
      cs.settings.lastPersistAt = stamp;
      target.lastPersistAt = stamp;
      snapshot.lastPersistAt = stamp;
      snapshot.graveyard = target.graveyard;
      await targetAdapter.writeChanges(cs, { outboxAdds: ops });
      lastPersisted = target;
      markHealthy();
      announceWrite();
      return true;
    });
  }

  function persist(data) {
    // Durante `init/switchScope` o nome do escopo novo já mudou, mas o banco
    // ainda não foi carregado. Aceitar uma ação da tela antiga aqui escreveria
    // o mirror de uma conta dentro da outra. A ação é recusada e a tela será
    // atualizada quando a troca terminar.
    if (!ready) return Promise.resolve(false);
    installSnapshot(data);
    writeMirror(snapshot, false);          // proteção imediata, síncrona
    if (!adapter) return Promise.resolve(false);
    const context = { scope, adapter, generation: storageGeneration };

    clearTimeout(pendingTimer);
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
      pendingTimer = setTimeout(() => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        enqueueWrite(async () => {
          const settle = (v) => resolvers.forEach((r) => r(v));
          try {
            await commitCurrentSnapshot(context);
            settle(true);
          } catch (err) {
            if (storageOperationCancelled(err)) { settle(false); return; }
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
    const context = { scope, adapter, generation: storageGeneration };
    clearTimeout(pendingTimer);
    clearTimeout(mirrorTimer);
    writeMirror(snapshot, true);           // síncrono: sempre acontece
    const resolvers = pendingResolvers;
    pendingResolvers = [];
    if (!context.adapter) { resolvers.forEach((r) => r(false)); return false; }
    try {
      const ok = await enqueueWrite(() => commitCurrentSnapshot(context));
      resolvers.forEach((r) => r(true));
      return ok;
    } catch (err) {
      if (storageOperationCancelled(err)) {
        resolvers.forEach((r) => r(false));
        return false;
      }
      emitError(err);
      resolvers.forEach((r) => r(false));
      return false;
    }
  }

  async function replaceAll(data) {
    if (!ready) return false;
    const targetScope = scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    const replacementMustSync = targetScope !== GUEST_SCOPE;
    if (!targetAdapter) return false;
    const flushed = await flush();
    if (!flushed || !storeContextIsCurrent(targetScope, targetAdapter, targetGeneration)) return false;
    const normalized = migrate(data);
    const anterior = snapshot;
    normalized.lastPersistAt = Date.now();
    installSnapshot(normalized);
    const replacementVersion = snapshotVersion;
    // A TROCA DA BASE INTEIRA TAMBÉM PRECISA VIAJAR.
    //
    // Este caminho não passa pelo diff de `persist`, então restaurar um backup,
    // desfazer uma restauração ou adotar os dados de visitante mudava só este
    // aparelho. Nos outros, nada acontecia; e como o servidor continuava com a
    // base velha, a descida seguinte podia até desfazer o que foi restaurado.
    // Outra aba pode ter confirmado registros e operações antes de receber o
    // aviso pelo BroadcastChannel. A base física e a fila são relidas dentro do
    // mesmo bloqueio usado pelos commits locais; só então as lápides nascem.
    // A restauração recarimba a base inteira, portanto substitui com segurança
    // todas as operações antigas que ainda estavam na fila.
    let replacementSnapshot = normalized;
    let replacementPersisted = shallowSnapshot(normalized);
    writeMirror(normalized, true);
    try {
      await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
        const physicalRaw = await targetAdapter.readAll();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        const queued = await targetAdapter.outboxRead(0);
        assertStoreScope(targetScope, targetAdapter, targetGeneration);

        const physical = assembleSnapshot(physicalRaw);
        observeSnapshotClock(physical);
        queued.forEach((entry) => SyncClock.observe(entry && entry.rev));

        const queuedRecords = {};
        SYNC_ENTITY_FIELDS.forEach((field) => { queuedRecords[field] = []; });
        queued.forEach((entry) => {
          if (!entry || entry.op !== "put" || SYNC_ENTITY_FIELDS.indexOf(entry.entity) === -1) return;
          queuedRecords[entry.entity].push({ id: entry.entityId });
        });

        const replacement = replacementMustSync
          ? stampReplacement([anterior, physical, queuedRecords], normalized)
          : { ops: [], data: normalized };
        replacementSnapshot = replacement.data;
        replacementPersisted = shallowSnapshot(replacementSnapshot);

        // Guarda o estado realmente confirmado antes do restore, não o
        // instantâneo possivelmente atrasado desta aba.
        try {
          localStorage.setItem(scopedName(LS_UNDO_KEY, targetScope), JSON.stringify({ savedAt: Date.now(), data: physical }));
        } catch (_error) { /* desfazer fica indisponível se a cota estiver cheia */ }

        await targetAdapter.replaceAll(replacementSnapshot, replacementMustSync ? {
          outboxDrops: queued.map((entry) => entry.seq),
          outboxAdds: replacement.ops,
          metaDeletes: [META_LINK_JOURNAL, META_SEED_JOURNAL],
        } : undefined);
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);

      const concurrentSnapshot = snapshot;
      const localChanges = snapshotVersion !== replacementVersion
        ? computeChangeSet(normalized, concurrentSnapshot)
        : null;
      lastPersisted = replacementPersisted;
      let finalSnapshot = overlayChangeSet(replacementSnapshot, localChanges);
      finalSnapshot = restampConcurrentDeletes(normalized, concurrentSnapshot, finalSnapshot);
      installSnapshot(finalSnapshot);
      if (localChanges) {
        const rebased = await flush();
        if (!rebased) return false;
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
      }
      writeMirror(snapshot, true);
      markHealthy();
      announceWrite();
      return true;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      return false;
    }
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
    if (!ready) return false;
    const targetScope = scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    const fresh = migrate(defaultData());
    try { localStorage.setItem(scopedName(LS_UNDO_KEY, targetScope), JSON.stringify({ savedAt: Date.now(), data: snapshot })); } catch (e) {}
    fresh.lastPersistAt = Date.now();
    installSnapshot(fresh);
    writeMirror(snapshot, true);
    if (!targetAdapter) return false;
    try {
      await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
        await targetAdapter.clearAll();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        await targetAdapter.replaceAll(fresh);
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      lastPersisted = shallowSnapshot(fresh);
      markHealthy();
      announceWrite();
      return true;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      return false;
    }
  }

  // Exclusão definitiva pedida pelo usuário. Ao contrário de clear(), não cria
  // um snapshot de desfazer e remove os espelhos que poderiam ressuscitar dados.
  async function purge() {
    if (!ready) return false;
    const targetScope = scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    clearTimeout(pendingTimer);
    clearTimeout(mirrorTimer);
    pendingResolvers.splice(0).forEach((resolve) => resolve(false));
    const fresh = migrate(defaultData());
    fresh.lastPersistAt = Date.now();
    // Só as chaves DESTE escopo. Apagar os dados da conta não pode levar junto
    // o que pertence a quem usa o aparelho sem conta.
    const keys = [
      scopedName(LS_FALLBACK_KEY, targetScope),
      scopedName("financas_db_outbox", targetScope),
      scopedName("financas_db_meta", targetScope),
      scopedName("financas_db_recovery", targetScope),
      // `financas_db_reset_barrier` fica FORA desta lista de propósito: ela
      // descreve as lápides que continuam na conta depois do reset, não os
      // dados apagados aqui. Apagá-la faria a próxima criação nascer menor
      // que elas.
      scopedName("financas_db_clock", targetScope),
      scopedName(LS_MIRROR_KEY, targetScope),
      scopedName(LS_UNDO_KEY, targetScope),
      targetScope === GUEST_SCOPE ? "cofre_sync_cursor" : `cofre_sync_cursor__${targetScope}`,
      `cofre_sync_seeded__${targetScope}`,
      ...(targetScope === GUEST_SCOPE ? [LEGACY_KEY, LEGACY_KEY + "_backup", "financas_theme"] : []),
    ];
    if (!targetAdapter) {
      if (storeContextIsCurrent(targetScope, targetAdapter, targetGeneration)) {
        installSnapshot(fresh);
        lastPersisted = null;
      }
      keys.forEach((key) => { try { localStorage.removeItem(key); } catch (_error) {} });
      announceWrite();
      return true;
    }
    try {
      await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
        await targetAdapter.clearAll();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        await targetAdapter.outboxClear();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        await targetAdapter.localMetaClear();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        await targetAdapter.replaceAll(fresh);
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      installSnapshot(fresh);
      lastPersisted = shallowSnapshot(fresh);
      healthy = true;
      keys.forEach((key) => { try { localStorage.removeItem(key); } catch (_error) {} });
      announceWrite();
      return true;
    } catch (err) {
      if (storageOperationCancelled(err)) return false;
      if (typeof reportSafeError === "function") reportSafeError("storage", err, "storage_delete");
      emitError(err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // ESCOPO: leitura de outra conta, adoção explícita e troca
  // ---------------------------------------------------------------------------

  // A DECISÃO DE VÍNCULO É REGISTRADA PELO CONTEÚDO, NÃO PELA PERGUNTA.
  //
  // O marcador antigo gravava "já perguntei" no momento em que o diálogo abria.
  // Quem fechasse a caixa sem responder ficava com dois bancos separados para
  // sempre, sem nenhum caminho de volta na interface. A impressão canônica
  // abaixo substitui esse marcador: ela muda quando o conteúdo do visitante
  // muda, e é isso que faz o aplicativo voltar a reconhecer trabalho pendente.
  //
  // Ela ignora de propósito marca de relógio, carimbos e trilha de auditoria:
  // sincronizar o mesmo conteúdo em outro aparelho não pode reabrir a pergunta.
  const LINK_DIGEST_VERSION = 1;
  const LINK_VOLATILE_FIELDS = new Set([
    "syncRev", "createdAt", "updatedAt", "reconciledAt", "changeLog", "lastPersistAt",
  ]);

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).sort().forEach((key) => {
        if (LINK_VOLATILE_FIELDS.has(key)) return;
        const inner = canonicalValue(value[key]);
        if (inner === undefined) return;
        out[key] = inner;
      });
      return out;
    }
    return value === undefined ? undefined : value;
  }

  function sameCanonical(a, b) {
    return JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));
  }

  // Categoria de fábrica intocada não é conteúdo do usuário. Renomear, mudar
  // orçamento, cor ou criar uma nova, é.
  function customCategories(data, padrao) {
    const fabrica = indexById((padrao || defaultData()).categories || []);
    return (data.categories || []).filter((cat) => {
      const original = fabrica.get(cat.id);
      return !original || !sameCanonical(original, cat);
    });
  }

  // INSTANTÂNEO DE ORÇAMENTO DO MÊS NÃO É CONTEÚDO DO USUÁRIO.
  //
  // `migrate` cria um automaticamente para qualquer base que ainda não tenha
  // nenhum. Ele sozinho fazia um aparelho recém-aberto parecer cheio: bastava
  // abrir o aplicativo uma vez, e a entrada na conta passava a mostrar o pedido
  // de "juntar dados" sem haver absolutamente nada para juntar. Quem entrava num
  // aparelho novo tinha de apertar um botão para ver o próprio dinheiro.
  //
  // Só conta o mês em que ALGUÉM DECIDIU alguma coisa: definiu um teto, mudou a
  // regra de divisão ou mexeu nos avisos. Grupo e pai de categoria são deduzidos
  // da árvore de categorias, não são decisão.
  function decidedBudgetHistory(value, base) {
    const padraoSplit = (base && base.budgetSplit) || {};
    const padraoAlerts = (base && base.budgetAlerts) || {};
    const out = {};
    Object.keys(value || {}).forEach((mes) => {
      const linha = (value || {})[mes] || {};
      const temTeto = Object.keys(linha.budgets || {}).length > 0;
      if (temTeto || !sameCanonical(padraoSplit, linha.split) || !sameCanonical(padraoAlerts, linha.alerts)) {
        out[mes] = linha;
      }
    });
    return out;
  }

  // Só a lista fechada de configurações do vínculo entra, e só quando difere do
  // padrão. Tema, disposição da tela, consentimentos e notificações ficam de
  // fora: são preferências do aparelho, não conteúdo financeiro.
  function linkSettings(data, padrao) {
    const base = padrao || defaultData();
    const out = {};
    Array.from(SYNC_ALLOWED_SETTINGS).sort().forEach((key) => {
      const value = key === "budgetHistory" ? decidedBudgetHistory(data[key], base) : data[key];
      if (value === undefined || value === null || value === "") return;
      if (sameCanonical(base[key], value)) return;
      out[key] = canonicalValue(value);
    });
    return out;
  }

  function canonicalContent(data) {
    const padrao = defaultData();
    const body = { v: LINK_DIGEST_VERSION };
    SYNC_ENTITY_FIELDS.forEach((field) => {
      const list = field === "categories" ? customCategories(data, padrao) : (data[field] || []);
      body[field] = list
        .slice()
        .sort((a, b) => (String(a && a.id) < String(b && b.id) ? -1 : 1))
        .map(canonicalValue);
    });
    body.settings = linkSettings(data, padrao);
    return body;
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return new Uint8Array(out);
  }

  // Sem WebCrypto não há impressão, e sem impressão o aplicativo PERGUNTA de
  // novo. Preferimos repetir a pergunta a esconder uma alteração do usuário
  // atrás de uma decisão que não temos como validar.
  async function contentDigest(data) {
    const subtle = typeof crypto !== "undefined" && crypto.subtle;
    if (!subtle || typeof subtle.digest !== "function") return null;
    try {
      const texto = JSON.stringify(canonicalContent(data));
      const buffer = await subtle.digest("SHA-256", utf8Bytes(texto));
      const bytes = Array.from(new Uint8Array(buffer));
      return `v${LINK_DIGEST_VERSION}:${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    } catch (e) { return null; }
  }

  // Abre OUTRO escopo só para olhar, sem tocar no que está carregado. É o que
  // permite perguntar "este aparelho tem dados de visitante?" sem já os trazer
  // para dentro da conta. Fechar o adapter em `finally` importa: uma conexão
  // aberta com o banco de outro escopo segura upgrades e mantém uma referência
  // viva aos dados de quem acabou de sair.
  async function readScope(target) {
    const wanted = normalizeStorageScope(target);
    let erro = null;
    const candidates = [new IndexedDBAdapter(wanted), new LocalStorageAdapter(wanted)];
    for (const candidate of candidates) {
      try {
        const raw = await withStorageScopeLock(wanted, async () => {
          await candidate.init();
          return candidate.readAll();
        });
        const data = isEmpty(raw) ? null : migrate(assembleSnapshot(raw));
        if (data) return { ok: true, data };
      } catch (e) {
        erro = e;
      } finally {
        try { if (typeof candidate.close === "function") candidate.close(); } catch (e) { /* já fechado */ }
      }
    }
    // Visitante sem banco ainda pode ter o blob antigo do localStorage.
    if (wanted === GUEST_SCOPE) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
        if (legacy && typeof legacy === "object") return { ok: true, data: migrate(legacy) };
      } catch (e) { /* sem legado */ }
    }
    // Nenhum adapter abriu: isso é DIFERENTE de "o escopo está vazio", e a
    // interface precisa saber a diferença para não afirmar que não há nada.
    if (erro && !LocalStorageAdapter.isSupported()) return { ok: false, data: null, error: erro };
    return { ok: true, data: null };
  }

  async function peekScope(target) {
    const wanted = normalizeStorageScope(target);
    if (wanted === scope) return summarize(snapshot, await contentDigest(snapshot));
    const read = await readScope(wanted);
    if (!read.ok) return { ...summarize(null, null), readable: false };
    if (!read.data) return summarize(null, null);
    return summarize(read.data, await contentDigest(read.data));
  }

  // O resumo conta TODAS as entidades, e não só lançamentos, metas e
  // patrimônio. Quem cadastrou apenas a conta do banco, apenas o cartão ou
  // apenas a renda tinha um resumo que dizia "não há nada aqui" e perdia o
  // vínculo por completo. Nenhum campo devolvido identifica um registro: são
  // contagens e sinalizadores, para a tela nunca precisar mostrar conteúdo
  // financeiro nem a impressão.
  function summarize(data, digest) {
    const vazio = {
      exists: false, readable: true, digest: null, digestVersion: LINK_DIGEST_VERSION,
      transactions: 0, categories: 0, goals: 0, assets: 0, accounts: 0, creditCards: 0,
      accountTransfers: 0, cardPayments: 0, accountAdjustments: 0,
      monthlyIncome: false, settings: 0, lastPersistAt: 0,
    };
    if (!data) return vazio;
    const padrao = defaultData();
    const contagem = {};
    SYNC_ENTITY_FIELDS.forEach((field) => {
      contagem[field] = field === "categories"
        ? customCategories(data, padrao).length
        : (data[field] || []).length;
    });
    const settings = Object.keys(linkSettings(data, padrao)).length;
    const total = SYNC_ENTITY_FIELDS.reduce((soma, field) => soma + contagem[field], 0);
    return {
      ...vazio,
      ...contagem,
      exists: total > 0 || settings > 0,
      digest: digest || null,
      monthlyIncome: Number(data.monthlyIncome) > 0,
      settings,
      lastPersistAt: Number(data.lastPersistAt) || 0,
    };
  }

  // Adoção EXPLÍCITA: só roda quando a decisão de vínculo já foi tomada, seja
  // automaticamente (conta remota nunca usada) ou por confirmação da pessoa.
  // Funde, nunca substitui: nada da conta é apagado, e o escopo de origem
  // continua intacto para quem quiser voltar a ele.
  //
  // O ponto delicado é a repetição. Uma queda de rede no meio do vínculo não
  // pode gerar um segundo lote com marcas novas, porque as duas versões
  // disputariam entre si. Por isso a gravação nasce junto de um DIÁRIO: se ele
  // existe, o lote já está na fila com as marcas que ele registrou, e a
  // tentativa seguinte apenas termina aquele mesmo lote.
  async function adoptScope(source, options) {
    const opts = options || {};
    const storageAttempt = Math.max(0, Number(opts._storageAttempt) || 0);
    const from = normalizeStorageScope(source);
    const expectedScope = scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    if (from === expectedScope) return { ok: false, reason: "same_scope" };
    if (expectedScope === GUEST_SCOPE) return { ok: false, reason: "not_authenticated" };
    if (!adapter) return { ok: false, reason: "no_storage" };
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);

    const read = await readScope(from);
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    if (!read.ok) return { ok: false, reason: "unreadable" };
    if (!read.data) return { ok: false, reason: "empty" };
    const incoming = read.data;
    const digest = await contentDigest(incoming);
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);

    // Conteúdo já vinculado não é vinculado de novo. Sem esta parada, uma
    // segunda passagem refazia a mesclagem e a trilha de auditoria dos mesmos
    // lançamentos era reconstruída, gerando um lote de operações que não
    // representava alteração nenhuma.
    const reciboAtual = await localMetaGet(META_LINK_RECEIPT, expectedScope);
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    if (reciboAtual && reciboAtual.status === "linked" && digest
      && reciboAtual.accountScope === expectedScope && reciboAtual.sourceDigest === digest) {
      return {
        ok: true, changed: false, alreadyLinked: true, linkId: reciboAtual.linkId || null,
        digest, stats: reciboAtual.stats || null, queued: 0,
      };
    }

    const anterior = await localMetaGet(META_LINK_JOURNAL, expectedScope);
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    if (anterior && anterior.accountScope === expectedScope && anterior.sourceDigest === digest) {
      // Retomada: as operações já estão na fila, com as marcas do diário. Nada
      // é recarimbado, e nenhuma versão nova é criada para reivindicar o
      // conflito que interrompeu a tentativa anterior.
      return {
        ok: true, resumed: true, changed: false, linkId: anterior.linkId, digest,
        stats: anterior.stats || null, queued: Number(anterior.queued) || 0,
        blocked: anterior.status === "blocked",
      };
    }

    const flushed = await flush();
    if (!flushed) throw storageCancelledError();
    assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    const baseSnapshot = snapshot;
    const baseVersion = snapshotVersion;
    const fusao = mergeBackupInto(baseSnapshot, incoming);
    const target = migrate(fusao.data);
    const changeSet = computeChangeSet(baseSnapshot, target);
    const linkId = syncEntryKey({}).replace(/^op_/, "link_");
    let committed;
    try {
      committed = await enqueueScopedWrite(expectedScope, targetAdapter, targetGeneration, async () => {
        await assertPhysicalSnapshot(expectedScope, targetAdapter, targetGeneration, baseSnapshot);

        // Outra aba pode ter concluído exatamente este vínculo enquanto esta
        // aguardava o bloqueio. Revalidar o diário dentro da região exclusiva
        // impede dois lotes com revisões diferentes para a mesma decisão.
        const receipt = await targetAdapter.localMetaGet(META_LINK_RECEIPT);
        if (receipt && receipt.status === "linked" && digest
          && receipt.accountScope === expectedScope && receipt.sourceDigest === digest) {
          return { existing: {
            ok: true, changed: false, alreadyLinked: true, linkId: receipt.linkId || null,
            digest, stats: receipt.stats || null, queued: 0,
          } };
        }
        const journal = await targetAdapter.localMetaGet(META_LINK_JOURNAL);
        if (journal && journal.accountScope === expectedScope && journal.sourceDigest === digest) {
          return { existing: {
            ok: true, resumed: true, changed: false, linkId: journal.linkId, digest,
            stats: journal.stats || null, queued: Number(journal.queued) || 0,
            blocked: journal.status === "blocked",
          } };
        }

        if (!changeSet) {
          // O conteúdo do visitante já está inteiro na conta. Isso é conclusão,
          // e o recibo nasce sob o mesmo bloqueio usado pelas demais mutações.
          await targetAdapter.localMetaPut(META_LINK_RECEIPT, {
            version: 1, status: "linked", accountScope: expectedScope, accountUserId: String(opts.userId || ""),
            sourceScope: from, sourceDigest: digest, linkId,
            remoteBaseRevision: opts.remoteRevision == null ? null : String(opts.remoteRevision),
            serverRevision: null, decidedAt: new Date().toISOString(), stats: fusao.stats,
          });
          return { existing: { ok: true, changed: false, linkId, digest, stats: fusao.stats, queued: 0 } };
        }

        const ops = stampChangeSet(baseSnapshot, target, changeSet);
        const entries = ops.map((op, index) => ({
          ...op, linkId, entryKey: `${linkId}_${String(index).padStart(6, "0")}`,
        }));
        const diario = {
          version: 1, linkId, status: "queued",
          accountScope: expectedScope, accountUserId: String(opts.userId || ""),
          sourceScope: from, sourceDigest: digest,
          remoteBaseRevision: opts.remoteRevision == null ? null : String(opts.remoteRevision),
          stats: fusao.stats, queued: entries.length, createdAt: new Date().toISOString(),
        };
        // A revisão esperada só acompanha o vínculo AUTOMÁTICO. Ela faz o
        // servidor recusar a adoção se a conta avançar antes da confirmação.
        if (opts.expectedRemoteRevision != null) diario.expectedRemoteRevision = String(opts.expectedRemoteRevision);
        const stamp = Date.now();
        changeSet.settings.lastPersistAt = stamp;
        target.lastPersistAt = stamp;
        await targetAdapter.writeChanges(changeSet, {
          outboxAdds: entries,
          metaPuts: { [META_LINK_JOURNAL]: diario },
        });
        return { entries };
      });
      assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    } catch (err) {
      // Dados, fila e diário falham juntos: a conta continua exatamente como
      // estava, e o visitante também.
      if (err && err.code === "sync_cancelled") throw err;
      if (storageChangedDuringOperation(err) && storageAttempt < 3) {
        await reload({ scope: expectedScope, adapter: targetAdapter, generation: targetGeneration });
        return adoptScope(source, { ...opts, _storageAttempt: storageAttempt + 1 });
      }
      emitError(err);
      return { ok: false, reason: "write_failed", digest, error: err };
    }
    if (committed.existing) return committed.existing;
    const entries = committed.entries;
    if (snapshotVersion !== baseVersion) {
      const localChanges = computeChangeSet(baseSnapshot, snapshot);
      lastPersisted = shallowSnapshot(target);
      installSnapshot(overlayChangeSet(target, localChanges));
      const rebased = await flush();
      if (!rebased) throw storageCancelledError();
      assertStoreScope(expectedScope, targetAdapter, targetGeneration);
    } else {
      installSnapshot(target);
      lastPersisted = shallowSnapshot(target);
    }
    writeMirror(snapshot, true);
    markHealthy();
    announceWrite();
    return { ok: true, changed: true, linkId, digest, stats: fusao.stats, queued: entries.length, data: snapshot };
  }

  // ---- Recibos e diário do vínculo, para a tela de conta ----
  function guestLinkReceipt() { return localMetaGet(META_LINK_RECEIPT); }
  function guestLinkJournal() { return localMetaGet(META_LINK_JOURNAL); }

  // `dismissed` nasce SOMENTE de uma escolha explícita, e vale apenas para a
  // impressão escolhida. Sem impressão (WebCrypto ausente) nada é gravado: a
  // pergunta volta, que é o comportamento seguro.
  async function dismissGuestLink(digest, sourceScope) {
    if (!digest) return false;
    await localMetaPut(META_LINK_RECEIPT, {
      version: 1, status: "dismissed", accountScope: scope,
      sourceScope: normalizeStorageScope(sourceScope || GUEST_SCOPE),
      sourceDigest: String(digest), decidedAt: new Date().toISOString(),
    });
    return true;
  }

  // A conta avançou entre a leitura e a confirmação. O diário e a fila ficam
  // como estão; o motor apenas para de reenviar aquele lote até a pessoa
  // decidir de novo.
  async function blockGuestLink(remoteRevision, expectedScope) {
    const diario = await localMetaGet(META_LINK_JOURNAL, expectedScope);
    if (!diario || diario.status === "blocked") return false;
    await localMetaPut(META_LINK_JOURNAL, {
      ...diario, status: "blocked",
      blockedAt: new Date().toISOString(),
      observedRemoteRevision: remoteRevision == null ? null : String(remoteRevision),
    }, expectedScope);
    return true;
  }

  // Confirmação explícita depois do bloqueio: o lote volta a subir, agora sem
  // declarar revisão esperada, porque a pessoa já sabe que a conta mudou.
  async function releaseGuestLink() {
    const expectedScope = scope;
    const targetAdapter = adapter;
    assertStoreScope(expectedScope, targetAdapter);
    const diario = await localMetaGet(META_LINK_JOURNAL, expectedScope);
    assertStoreScope(expectedScope, targetAdapter);
    if (!diario) return false;
    const proximo = { ...diario, status: "queued", releasedAt: new Date().toISOString() };
    delete proximo.expectedRemoteRevision;
    await localMetaPut(META_LINK_JOURNAL, proximo, expectedScope);
    assertStoreScope(expectedScope, targetAdapter);
    return true;
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
    const attachedBus = bus;
    const attachedScope = scope;
    const attachedGeneration = storageGeneration;
    bus.onmessage = (event) => {
      const message = event && event.data;
      if (!message || message.type !== "written" || message.tab === tabId) return;
      if (bus !== attachedBus || scope !== attachedScope || storageGeneration !== attachedGeneration) return;
      const reloadContext = { scope: attachedScope, adapter, generation: attachedGeneration };
      // Reler é assíncrono; até terminar, esta aba não pode gravar por cima.
      reload(reloadContext).then((data) => {
        if (!storeContextIsCurrent(reloadContext.scope, reloadContext.adapter, reloadContext.generation)
          || bus !== attachedBus) return;
        tabListeners.forEach((fn) => { try { fn(data); } catch (e) { /* ouvinte quebrado */ } });
      }).catch(() => {});
    };
  }

  // Relê o banco e substitui o snapshot em memória. Usado quando outra aba
  // gravou e quando o motor de sincronização quer descartar estado suspeito.
  async function reload(context) {
    const targetScope = context ? context.scope : scope;
    const targetAdapter = context ? context.adapter : adapter;
    const targetGeneration = context ? context.generation : storageGeneration;
    if (!targetAdapter) return snapshot;
    try {
      // Primeiro confirma qualquer edição que já esteja no debounce ou na fila.
      // Depois, se outra edição chegar enquanto `readAll` estiver em voo, a
      // versão muda e a leitura antiga é descartada. Assim um aviso de outra aba
      // nunca apaga o que a pessoa acabou de digitar nesta aba.
      for (let attempt = 0; attempt < 3; attempt++) {
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        const flushed = await flush();
        if (!flushed) throw storageCancelledError();
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        const versionAtRead = snapshotVersion;
        const raw = await runScopedMutation(targetScope, targetAdapter, targetGeneration,
          () => targetAdapter.readAll());
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        if (snapshotVersion !== versionAtRead) continue;
        const assembled = assembleSnapshot(raw);
        assertStoreScope(targetScope, targetAdapter, targetGeneration);
        observeSnapshotClock(assembled);
        installSnapshot(assembled);
        lastPersisted = shallowSnapshot(assembled);
        return snapshot;
      }
      return snapshot;
    } catch (err) {
      if (storageOperationCancelled(err)) throw err;
      emitError(err);
      return snapshot;
    }
  }

  // ---- Fila persistente exposta ao motor de sincronização ----
  async function outboxAppend(entries, expectedScope) {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!adapter) throw new Error("Armazenamento local indisponível para a fila");
    if (!list.length) return true;
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    try {
      const result = await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, () => {
        return targetAdapter.outboxAppend(list);
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      return result;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      throw err;
    }
  }
  async function outboxRead(limit, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para a fila");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    try {
      await writeQueue;
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      const result = await runScopedMutation(targetScope, targetAdapter, targetGeneration,
        () => targetAdapter.outboxRead(limit));
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      return result;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      throw err;
    }
  }
  async function outboxDrop(seqs, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para a fila");
    if (!seqs.length) return true;
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    try {
      const result = await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, () => {
        return targetAdapter.outboxDrop(seqs);
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      return result;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      throw err;
    }
  }
  async function outboxClear(expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para a fila");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    try {
      const result = await enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, () => {
        return targetAdapter.outboxClear();
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      return result;
    } catch (err) {
      if (!storageOperationCancelled(err)) emitError(err);
      throw err;
    }
  }

  async function localMetaGet(key, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para metadados");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    await writeQueue;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const result = await runScopedMutation(targetScope, targetAdapter, targetGeneration,
      () => targetAdapter.localMetaGet(String(key)));
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    return result;
  }

  async function localMetaPut(key, value, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para metadados");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    return enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, () => {
      return targetAdapter.localMetaPut(String(key), value);
    }).then((result) => {
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      return result;
    });
  }

  async function localMetaDelete(key, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para metadados");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    return enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, () => {
      return targetAdapter.localMetaDelete(String(key));
    }).then((result) => {
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      return result;
    });
  }

  async function acknowledgeOutbox(seqs, serverAck, expectedScope) {
    if (!adapter) throw new Error("Armazenamento local indisponível para confirmar a fila");
    const targetScope = expectedScope || scope;
    const targetAdapter = adapter;
    const targetGeneration = storageGeneration;
    assertStoreScope(targetScope, targetAdapter, targetGeneration);
    const drop = new Set((seqs || []).map((seq) => Number(seq)));
    if (!drop.size) return { dropped: 0, linkIds: [], seedIds: [] };
    return enqueueScopedWrite(targetScope, targetAdapter, targetGeneration, async () => {
      const queued = await targetAdapter.outboxRead(0);
      const removed = queued.filter((entry) => drop.has(Number(entry.seq)));
      if (removed.length !== drop.size) throw new Error("A fila mudou antes da confirmação do servidor");
      const remaining = queued.filter((entry) => !drop.has(Number(entry.seq)));
      const linkIds = Array.from(new Set(removed.map((entry) => entry.linkId).filter(Boolean)))
        .filter((id) => !remaining.some((entry) => entry.linkId === id));
      const seedIds = Array.from(new Set(removed.map((entry) => entry.seedId).filter(Boolean)))
        .filter((id) => !remaining.some((entry) => entry.seedId === id));
      const metaPuts = {};
      const metaDeletes = [];
      const batchJournal = await targetAdapter.localMetaGet(META_SYNC_BATCH);
      if (batchJournal && serverAck && validCloudMutationId(serverAck.mutationId)
        && String(batchJournal.mutationId || "") === String(serverAck.mutationId)) {
        metaDeletes.push(META_SYNC_BATCH);
      }
      for (const linkId of linkIds) {
        const journal = await targetAdapter.localMetaGet(META_LINK_JOURNAL);
        if (!journal || journal.linkId !== linkId) continue;
        metaPuts[META_LINK_RECEIPT] = {
          version: 1, status: "linked", accountUserId: journal.accountUserId,
          accountScope: journal.accountScope, sourceScope: journal.sourceScope,
          sourceDigest: journal.sourceDigest, linkId, remoteBaseRevision: journal.remoteBaseRevision,
          serverRevision: String(serverAck && serverAck.revision || ""), decidedAt: new Date().toISOString(),
          stats: journal.stats || null,
        };
        metaDeletes.push(META_LINK_JOURNAL);
      }
      for (const seedId of seedIds) {
        metaPuts[META_SEED_RECEIPT] = {
          version: 1, status: "confirmed", seedId,
          serverRevision: String(serverAck && serverAck.revision || ""), confirmedAt: new Date().toISOString(),
        };
        metaDeletes.push(META_SEED_JOURNAL);
      }
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      await targetAdapter.writeChanges(null, {
        outboxDrops: Array.from(drop), metaPuts,
        metaDeletes: Array.from(new Set(metaDeletes)),
      });
      assertStoreScope(targetScope, targetAdapter, targetGeneration);
      markHealthy();
      return { dropped: removed.length, linkIds, seedIds };
    });
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
    generation: () => storageGeneration,
    switchScope: (target, preferredAdapter) => init(preferredAdapter || null, { scope: target }),
    peekScope,
    adoptScope,
    // Recibos do vínculo. A tela de conta precisa saber se há trabalho
    // pendente, dispensado ou concluído SEM nunca ver conteúdo financeiro.
    guestLinkReceipt,
    guestLinkJournal,
    dismissGuestLink,
    blockGuestLink,
    releaseGuestLink,
    contentDigest,
    applyRemoteOps,
    reload,
    onOtherTabWrite: (fn) => { if (typeof fn === "function") tabListeners.push(fn); },
    outboxAppend,
    outboxRead,
    outboxDrop,
    outboxClear,
    acknowledgeOutbox,
    localMetaGet,
    localMetaPut,
    localMetaDelete,
    // Reapresenta ao servidor a base que já estava neste aparelho. Ver o bloco
    // "SEMEADURA" acima: sem isto, quem começou a usar antes de ligar a conta
    // nunca subia nada, e o segundo aparelho via a conta vazia.
    seedOutbox,
    // Enfileirar só faz sentido com conta ligada; o motor de sincronização
    // liga e desliga junto com a sessão.
    setOutboxEnabled: (value) => { outboxEnabled = !!value; },
    isOutboxEnabled: () => outboxEnabled,
    syncRevOf: (record) => normalizeSyncRev(record && record.syncRev),
    // As nove entidades que sincronizam por registro. Uma lista só, para que
    // nenhum caminho (diff, lápide, restauração) esqueça uma delas.
    syncEntityFields: () => SYNC_ENTITY_FIELDS.slice(),
    // Marca nova do relógio lógico deste aparelho. Usada por operações que não
    // nascem de um registro, como o "apagar tudo" da conta.
    mintRev: () => { const rev = SyncClock.tick(); saveClockState(); return rev; },
    // O reset é carimbado pelo servidor acima de toda HLC já conhecida. O
    // aparelho solicitante precisa absorver essa marca antes de voltar a criar
    // registros, senão uma criação imediata poderia perder para a lápide.
    observeRemoteRev: (value) => {
      const rev = normalizeSyncRev(value);
      if (!rev) return false;
      loadClockState();
      const observed = SyncClock.observe(rev);
      if (observed) saveClockState();
      return observed;
    },
    // Barreira do reset CONFIRMADO pelo servidor. Só o resultado do RPC de
    // exclusão entra por aqui. Diferente de `observeRemoteRev`, não aplica o
    // teto de 24h, porque o servidor carimba a exclusão acima de toda marca da
    // conta, e persiste a marca numa chave que `purge()` preserva.
    //
    // Devolve false quando a marca não pôde ser gravada: sem persistência a
    // barreira não sobrevive ao recarregamento, e quem chamou precisa avisar
    // que a preparação local ficou incompleta.
    observeResetRev: (value) => {
      const rev = normalizeSyncRev(value);
      if (!rev) return false;
      loadClockState();
      if (!saveResetBarrier(rev)) return false;
      SyncClock.absorb(rev);
      saveClockState();
      return true;
    },
    isReady: () => ready,
    isHealthy: () => healthy,
    hasMirror: () => mirrorEnabled,
    adapterName: () => (adapter ? adapter.name : "memory"),
    onError: (fn) => { errorListeners.push(fn); },
    onRecover: (fn) => { recoveryListeners.push(fn); },
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
  let lifecycleFlush = null;
  const flushNow = () => {
    const flushScope = FinanceStore.scope();
    const flushGeneration = typeof FinanceStore.generation === "function" ? FinanceStore.generation() : 0;
    if (lifecycleFlush && lifecycleFlush.scope === flushScope && lifecycleFlush.generation === flushGeneration) {
      return lifecycleFlush.promise;
    }
    try {
      const attempt = typeof CloudSync !== "undefined" && typeof CloudSync.flushOnHide === "function"
        ? CloudSync.flushOnHide()
        : FinanceStore.flush();
      const entry = { scope: flushScope, generation: flushGeneration, promise: null };
      entry.promise = Promise.resolve(attempt)
        .catch((error) => {
          if (typeof reportSafeError === "function") reportSafeError("sync", error, "lifecycle_flush");
          return false;
        })
        .finally(() => { if (lifecycleFlush === entry) lifecycleFlush = null; });
      lifecycleFlush = entry;
      return entry.promise;
    } catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("sync", error, "lifecycle_flush_start");
      return Promise.resolve(false);
    }
  };
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
    // Nasce vazio e na mesma posição em que `migrate` o escreve: o registro
    // criado aqui e o mesmo registro relido do disco precisam ter a mesma
    // impressão, senão toda leitura pareceria uma alteração.
    pendingAccountId: null,
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
  const described = (base.description || "").trim();
  // "Compra parcelada" existe só para dar um nome às N parcelas quando a compra
  // não foi descrita. Numa transação única ele não nomeia nada: como TODO
  // lançamento manual passa por aqui com n = 1 e a descrição é opcional, o
  // rótulo virava o título (e o dado gravado) de qualquer gasto salvo sem
  // descrição. Sem parcelamento, descrição vazia segue vazia e as telas caem no
  // nome da categoria, que é o comportamento que elas já sabem tratar.
  const label = described || "Compra parcelada";
  return parts.map((value, i) => makeTransaction({
    ...base,
    id: undefined,
    amount: value,
    date: addMonthsToIso(base.date || todayIso(), i),
    description: n > 1 ? `${label} (${i + 1}/${n})` : described,
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
    app: "Cofre. Organizador financeiro pessoal",
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
  // [M12] Backup protegido por senha nunca chega aqui pelo caminho normal (a
  // tela pede a senha antes). Esta guarda existe para que, se chegar por
  // qualquer outro caminho, o erro diga o que fazer em vez de "não é um backup".
  if (typeof BACKUP_ENC_KIND !== "undefined" && parsed.kind === BACKUP_ENC_KIND) {
    throw new BackupError("ENCRYPTED", "Este backup está protegido por senha. Escolha o arquivo pela tela de Ajustes para informar a senha.");
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

  // [M13] Arquivo gerado por uma versão MAIS NOVA do app. `migrate()` só sabe
  // subir de versão: um campo que ainda não existe aqui é descartado pelos
  // normalizadores, em silêncio. O arquivo continua abrindo (o que ele tem de
  // conhecido entra inteiro), mas quem restaura precisa saber que pode haver
  // conteúdo que este aplicativo não entende. Recusar seria pior: deixaria a
  // pessoa sem nada em vez de com quase tudo.
  const declarada = Number(payload && payload.version) || Number(parsed.schema) || 0;
  meta.schema = declarada || null;
  meta.future = declarada > SCHEMA_VERSION ? declarada : null;

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

  // As cinco coleções de conta também passam pelo cemitério. Sem isto, uma
  // conta do banco excluída aqui voltava a existir na primeira mesclagem de
  // backup ou no vínculo dos dados de visitante, junto com as transferências e
  // os pagamentos que saíram com ela: a exclusão parecia não ter funcionado.
  const accounts = applyGraveyard(mergeList(current.accounts || [], incoming.accounts || [], pickUpdated), graveyard, "accounts");
  const creditCards = applyGraveyard(mergeList(current.creditCards || [], incoming.creditCards || [], pickUpdated), graveyard, "creditCards");
  const accountTransfers = applyGraveyard(mergeList(current.accountTransfers || [], incoming.accountTransfers || [], pickUpdated), graveyard, "accountTransfers");
  const cardPayments = applyGraveyard(mergeList(current.cardPayments || [], incoming.cardPayments || [], pickUpdated), graveyard, "cardPayments");
  const accountAdjustments = applyGraveyard(mergeList(current.accountAdjustments || [], incoming.accountAdjustments || [], pickNewer("createdAt")), graveyard, "accountAdjustments");
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
  const lines = [header.join(CSV_SEP)];
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
      csvNumber(signed),
      t.date,
      csvCell(t.payment),
      csvCell(t.description || ""),
      t.recurring ? "Sim" : "Não",
      t.installmentTotal ? `${t.installmentIndex}/${t.installmentTotal}` : "",
      csvCell(t.source || "manual"),
    ].join(CSV_SEP));
  });
  return "\uFEFF" + lines.join("\n");   // BOM: o Excel pt-BR abre com acentos corretos
}

function buildBudgetsCsv(data, monthKey) {
  const status = computeBudgetStatus(data, monthKey);
  const lines = [["Categoria", "Grupo", "Limite", "Gasto", "Restante", "% do limite", "Situação"].join(CSV_SEP)];
  status.items.forEach((b) => {
    lines.push([
      csvCell(b.fullName), csvCell(GROUP_LABELS[b.group] || ""),
      csvNumber(b.budget), csvNumber(b.spent), csvNumber(b.remaining),
      csvNumber(b.pct, 1), b.level === "over" ? "Estourado" : b.level === "warn" ? "Atenção" : "Dentro do limite",
    ].join(CSV_SEP));
  });
  return "\uFEFF" + lines.join("\n");
}
