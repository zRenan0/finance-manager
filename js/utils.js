// utils.js; funções auxiliares puras, sem dependência de DOM
// ------------------------------------------------------------------------------
// Inclui o núcleo de MATEMÁTICA FINANCEIRA do app (Money*). Regra de ouro do
// projeto: dinheiro nunca é somado como float. Todo valor monetário é convertido
// para CENTAVOS INTEIROS antes de qualquer operação e só volta para reais na
// fronteira de exibição/armazenamento. Isso elimina os erros clássicos de ponto
// flutuante (0.1 + 0.2 === 0.30000000000000004) que, acumulados em centenas de
// lançamentos, faziam o saldo divergir do extrato real.
"use strict";

const PALETTE = ["#0E6E5D", "#3C6E8F", "#B5652B", "#8A5FBF", "#B5476A", "#C08A2E", "#4E7C99", "#7C8592"];
const PAYMENT_METHODS = ["Pix", "Dinheiro", "Débito", "Crédito", "Outro"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Identificador de registro. Precisa ser único ENTRE APARELHOS, não só dentro
// deste: quando dois celulares editam offline e os snapshots são fundidos, a
// fusão indexa por `id`, então uma colisão não dá erro; ela SOBRESCREVE um
// lançamento e o dinheiro some sem deixar rastro. A versão antiga
// (`Math.random().toString(36).slice(2,10)` + timestamp) tinha cerca de 40 bits
// e só era segura enquanto o app era de um aparelho só.
//
// O formato UUID passa no `SAFE_ID` do servidor e no `SAFE_RECORD_ID` local
// (alfanumérico seguido de hífens), então ids antigos e novos convivem.
function uid() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;          // versão 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80;          // variante RFC 4122
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch (e) { /* ambiente sem Web Crypto: cai no reserva abaixo */ }
  // Reserva para navegador antigo ou contexto inseguro. Mais fraco que UUID v4,
  // porém bem mais largo que a versão original.
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
function todayIso() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}
function monthKeyOf(iso) { return String(iso || "").slice(0, 7); }
function keyOfDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function addMonths(base, n) { return new Date(base.getFullYear(), base.getMonth() + n, 1); }
function daysInMonthOf(y, m) { return new Date(y, m + 1, 0).getDate(); }
function isoOfDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// Soma n meses a uma data ISO (yyyy-mm-dd) mantendo o dia do mês sempre que possível
// (ex: 31/01 + 1 mês vira 28/02, não 03/03).
function addMonthsToIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const day = Math.min(d, daysInMonthOf(target.getFullYear(), target.getMonth()));
  target.setDate(day);
  return isoOfDate(target);
}
// Data ISO → objeto Date "local puro" (evita o off-by-one de fuso do `new Date("2024-01-01")`,
// que é interpretado como UTC e podia jogar o lançamento para o dia anterior no Brasil).
function dateFromIso(iso) {
  const [y, m, d] = String(iso || todayIso()).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function daysBetweenIso(a, b) {
  return Math.round((dateFromIso(b) - dateFromIso(a)) / 86400000);
}

// ==============================================================================
// MATEMÁTICA FINANCEIRA; tudo em centavos inteiros
// ==============================================================================

// Converte qualquer valor (número ou string) para centavos inteiros, sem drift.
// O truque do expoente decimal (`Number("1.005e2")`) reinterpreta o valor a partir
// da representação DECIMAL, não da binária, então 1.005 vira 100.5 (e não
// 100.49999999999999) e o arredondamento "meio para cima" fica correto.
//
// [M38] CAMINHO RÁPIDO, com o exato mesmo resultado.
//
// Esta é a função mais quente do aplicativo: a medição do módulo contou de 35
// mil a 99 mil chamadas em UM build de modelo com 5.000 lançamentos, e o perfil
// de CPU a apontou como o maior custo próprio de todos os quadros. O gargalo é a
// releitura decimal: `String(abs)` aloca e `Number(...)` reanalisa texto.
//
// O truque só é NECESSÁRIO perto de meio centavo, que é onde o erro binário
// decide o arredondamento para o lado errado. Longe dessa borda, `Math.round`
// devolve o mesmo inteiro por 23 vezes menos trabalho. Então: multiplica,
// mede a distância até a borda e só relê em decimal quem está encostado nela.
//
// `MONEY_FAST_MAX` existe porque, em valores muito grandes, o próprio `scaled`
// perde resolução (a partir de 1e7 o passo do double já se aproxima da margem
// usada aqui). Acima do teto, a releitura decimal continua sendo o caminho, que
// além de exata é mais precisa que a multiplicação.
//
// A equivalência não é argumento, é medida: `tests/test-money.js` compara as
// duas implementações em ~9,7 milhões de casos (todo valor de 2 casas até
// R$ 50.000, toda a família de 3 casas do 1,005, negativos, notação científica,
// entradas inválidas e milhões de aleatórios) e exige ZERO divergência.
const MONEY_FAST_MAX = 1e7;

function moneyToCentsExato(abs) {
  const asText = String(abs);
  if (asText.includes("e") || asText.includes("E")) return abs * 100; // notação científica
  const scaled = Number(`${asText}e2`);
  return Number.isFinite(scaled) ? scaled : abs * 100;
}

function moneyToCents(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  if (abs < MONEY_FAST_MAX) {
    const scaled = abs * 100;
    const arredondado = Math.round(scaled);
    // Longe da borda de meio centavo o binário e o decimal concordam.
    if (Math.abs(scaled - arredondado) < 0.5 - 1e-6) return sign * arredondado;
  }
  return sign * Math.round(moneyToCentsExato(abs));
}
function moneyFromCents(cents) {
  const c = Math.round(Number(cents) || 0);
  return c / 100;
}
// Normaliza um valor monetário para no máximo 2 casas (idempotente).
function roundMoney(value) { return moneyFromCents(moneyToCents(value)); }

function addMoney(a, b) { return moneyFromCents(moneyToCents(a) + moneyToCents(b)); }
function subMoney(a, b) { return moneyFromCents(moneyToCents(a) - moneyToCents(b)); }
// Multiplicação por um fator adimensional (juros, percentual, quantidade).
function mulMoney(amount, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f)) return 0;
  return moneyFromCents(Math.round(moneyToCents(amount) * f));
}
function divMoney(amount, divisor) {
  const d = Number(divisor);
  if (!Number.isFinite(d) || d === 0) return 0;
  return moneyFromCents(Math.round(moneyToCents(amount) / d));
}
// Soma uma coleção acumulando em CENTAVOS; é isto que impede o saldo de derivar
// depois de algumas centenas de lançamentos.
function sumMoney(list, pick) {
  const items = Array.isArray(list) ? list : [];
  let cents = 0;
  for (let i = 0; i < items.length; i++) {
    const raw = pick ? pick(items[i], i) : items[i];
    cents += moneyToCents(raw);
  }
  return moneyFromCents(cents);
}
// Divide um total em N partes cujo somatório é EXATAMENTE o total (método do
// maior resto): as primeiras parcelas recebem o centavo excedente. Usado no
// parcelamento do crédito e no rateio de orçamentos.
function splitMoney(total, parts) {
  const n = Math.max(1, Math.round(Number(parts) || 1));
  const totalCents = moneyToCents(total);
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / n);
  const rest = abs - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(moneyFromCents(sign * (base + (i < rest ? 1 : 0))));
  }
  return out;
}
// Rateio PONDERADO, com a mesma garantia do splitMoney: a soma das partes é
// EXATAMENTE o total. O peso decide o tamanho da fatia; o maior resto decide
// quem fica com os centavos que a divisão deixou para trás.
//
// POR QUE NÃO BASTA MULTIPLICAR CADA PESO PELO TOTAL: ratear R$ 3.000,00 entre
// cinco categorias por percentuais quebrados e arredondar cada linha separada
// perde centavos no caminho. O usuário soma as linhas que o app mostrou, não
// bate com o total que o app também mostrou, e conclui que a conta está errada.
function splitMoneyByWeights(total, weights) {
  const list = (Array.isArray(weights) ? weights : []).map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  if (list.length === 0) return [];
  const totalWeight = list.reduce((acc, w) => acc + w, 0);
  // Nenhum peso positivo: rateio igualitário. É a intenção mais provável de
  // quem passou pesos zerados e nunca divide por zero.
  if (totalWeight <= 0) return splitMoney(total, list.length);

  const totalCents = moneyToCents(total);
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const exact = list.map((w) => (abs * w) / totalWeight);
  const cents = exact.map((v) => Math.floor(v));
  let left = abs - cents.reduce((acc, v) => acc + v, 0);

  // Desempate pelo índice quando dois restos são iguais: mesma entrada precisa
  // produzir sempre a mesma saída, senão dois aparelhos sincronizados divergem
  // em um centavo sem que nada tenha mudado.
  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; k < byRemainder.length && left > 0; k++) { cents[byRemainder[k].i]++; left--; }

  return cents.map((c) => moneyFromCents(sign * c));
}
function moneyEquals(a, b) { return moneyToCents(a) === moneyToCents(b); }
function moneyCompare(a, b) { return moneyToCents(a) - moneyToCents(b); }
// Percentual seguro (nunca divide por zero, sempre finito).
function safePct(part, whole) {
  const w = moneyToCents(whole);
  if (w === 0) return 0;
  return (moneyToCents(part) / w) * 100;
}
function safeRatio(part, whole) {
  const w = moneyToCents(whole);
  if (w === 0) return 0;
  return moneyToCents(part) / w;
}

// Parser único de entrada monetária do usuário. Aceita "1.234,56", "1,234.56",
// "1234.56", "R$ 30", "30", "(12,00)" e "-12". Retorna NaN quando não há número.
// Toda a UI passa por aqui; antes existiam ~30 cópias de
// `parseFloat(String(x).replace(",", "."))`, que quebravam com separador de milhar.
function parseMoneyInput(input) {
  if (input == null) return NaN;
  if (typeof input === "number") return Number.isFinite(input) ? roundMoney(input) : NaN;
  let str = String(input).trim();
  if (!str) return NaN;
  str = str.replace(/^r\$\s*/i, "").replace(/\s|\u00a0/g, "");
  if (!/\d/.test(str)) return NaN;
  const negative = /^\(.*\)$/.test(str) || /^-/.test(str) || /-$/.test(str);
  str = str.replace(/[()]/g, "").replace(/^-/, "").replace(/-$/, "");
  // REGRA ÚNICA: o separador que aparece POR ÚLTIMO é o decimal; qualquer outro
  // é separador de milhar. A contagem de casas só entra como desempate quando
  // existe um único TIPO de separador, aparecendo uma única vez.
  //
  // Antes, vírgula e ponto seguiam ramos diferentes e o resultado era assimétrico:
  // "1,5000" virava 15000 enquanto "1.5000" virava 1,5. Como a vírgula é o
  // separador decimal em português, era justamente o caso mais provável que
  // errava; e por um fator de dez mil. Isso não aparecia na digitação (o
  // `sanitizeDecimalInput` corta a fração em duas casas), mas o importador de
  // OFX/CSV chama esta função direto no arquivo, onde quatro casas são comuns.
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma > -1 || lastDot > -1) {
    let decimalMark = lastComma > lastDot ? "," : ".";
    if (lastComma === -1 || lastDot === -1) {
      const occurrences = str.split(decimalMark).length - 1;
      const decimals = str.length - str.lastIndexOf(decimalMark) - 1;
      // Repetido ("1.234.567") é sempre milhar. Três casas ("1.500", "1,500")
      // é a grafia clássica de milhar no Brasil e continua sendo lida assim.
      if (occurrences > 1 || decimals === 3) decimalMark = null;
    }
    if (decimalMark === null) {
      str = str.replace(/[.,]/g, "");
    } else {
      const at = str.lastIndexOf(decimalMark);
      str = `${str.slice(0, at).replace(/[.,]/g, "")}.${str.slice(at + 1).replace(/[.,]/g, "")}`;
    }
  }
  str = str.replace(/[^0-9.]/g, "");
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return NaN;
  return roundMoney(negative ? -n : n);
}
// Versão "tolerante": devolve 0 em vez de NaN (para cálculos de exibição).
function moneyOrZero(input) {
  const n = parseMoneyInput(input);
  return Number.isFinite(n) ? n : 0;
}

// TETO DE SANIDADE DA QUANTIA DIGITADA.
//
// Não havia limite nenhum: dava para salvar R$ 999.999.999.999 num lançamento,
// e a partir daí o seletor de conta exibia "-R$ 1.000.000.001.063,26" e
// estourava a largura do controle. O teto é generoso de propósito, porque o
// que ele precisa barrar é o dedo preso no zero, não o usuário; e mora aqui
// para que toda tela que aceita dinheiro cobre o mesmo limite com a mesma
// frase, em vez de cada uma inventar o seu.
const MONEY_MAX = 999999999.99;

function moneyWithinMax(value) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= MONEY_MAX;
}

function moneyMaxMessage(label) {
  return `${label || "Valor"} acima do limite de ${fmtBRL(MONEY_MAX)}.`;
}

function sanitizeDecimalInput(input, options) {
  const opts = options && typeof options === "object" ? options : {};
  let value = String(input == null ? "" : input)
    .replace(/\u2212/g, "-")
    .replace(/[^0-9,.-]/g, "");
  const negative = opts.allowNegative && value.indexOf("-") !== -1;
  value = value.replace(/-/g, "");
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    const decimalAt = value.lastIndexOf(decimal);
    value = value.slice(0, decimalAt).replace(new RegExp(`\\${decimal}`, "g"), "") + decimal + value.slice(decimalAt + 1).replace(/[,.]/g, "");
    const pieces = value.split(decimal);
    pieces[0] = pieces[0].replace(new RegExp(`\\${grouping}(?=\\D|$)`, "g"), "");
    value = pieces.join(decimal);
  } else {
    const separator = comma !== -1 ? "," : dot !== -1 ? "." : "";
    if (separator) {
      const positions = [];
      for (let i = 0; i < value.length; i++) if (value[i] === separator) positions.push(i);
      if (positions.length > 1) {
        const last = positions[positions.length - 1];
        const fractionLength = value.length - last - 1;
        if (fractionLength <= 2) value = value.slice(0, last).replace(new RegExp(`\\${separator}`, "g"), "") + separator + value.slice(last + 1);
        else value = value.replace(new RegExp(`\\${separator}`, "g"), "");
      }
    }
  }
  const decimalMark = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
  const decimalAt = value.lastIndexOf(decimalMark);
  if (decimalAt !== -1) {
    const looksGrouped = decimalMark === "." && /^\d{1,3}(\.\d{3})+$/.test(value);
    const fraction = value.slice(decimalAt + 1);
    if (!looksGrouped && fraction.length > 2) value = value.slice(0, decimalAt + 1) + fraction.slice(0, 2);
  }
  return `${negative ? "-" : ""}${value}`;
}

function sanitizeIntegerInput(input, options) {
  const opts = options && typeof options === "object" ? options : {};
  const raw = String(input == null ? "" : input).replace(/\u2212/g, "-");
  const negative = opts.allowNegative && raw.indexOf("-") !== -1;
  const digits = raw.replace(/[^0-9]/g, "");
  return `${negative ? "-" : ""}${digits}`;
}

function sanitizeTextInput(input, options) {
  const opts = options && typeof options === "object" ? options : {};
  const controls = opts.multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  const clean = String(input == null ? "" : input).replace(controls, "");
  const maxLength = Number(opts.maxLength);
  return Number.isFinite(maxLength) && maxLength >= 0 ? clean.slice(0, maxLength) : clean;
}

function fmtBRL(n) {
  return roundMoney(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
// Compacta valores longos para caber em cartões estreitos no celular (R$ 12,3 mil).
function fmtBRLShort(n) {
  const v = roundMoney(n);
  const abs = Math.abs(v);
  if (abs >= 1000000) return `${v < 0 ? "-" : ""}R$ ${fmtNum(abs / 1000000)} mi`;
  if (abs >= 10000) return `${v < 0 ? "-" : ""}R$ ${fmtNum(Math.round(abs / 100) / 10)} mil`;
  return fmtBRL(v);
}
// `toFixed` devolve separador decimal do INGLÊS. Num app inteiro em português,
// que fala de dinheiro, "0.0 de 6 meses" e "+100.0%" ao lado de "R$ 1.250,50"
// não são detalhe de estilo: o ponto ali é separador de milhar, e o número
// passa a ler errado. Toda casa decimal que vai para a tela sai por aqui.
function fmtDec(n, decimals = 1) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtPct(n, decimals = 0) {
  return `${fmtDec(n, decimals)}%`;
}
// Plural de verdade no lugar do "(s)". Duas razões para virar função em vez de
// ternário repetido em cada tela: o português conta o ZERO como plural ("0
// lançamentos"), regra que escapa quando cada arquivo decide sozinho; e o
// marcador colado no fim da palavra, logo num aviso que pede uma ação do
// usuário, denuncia texto montado por máquina bem no momento em que o app
// precisa ser levado a sério.
//
// O bloco F-08 de tests/test-beta-fixes.js varre js/ atrás do marcador, e a
// varredura não distingue comentário de texto de tela: não escreva o marcador
// literal aqui dentro, nem para dar exemplo.
function plural(n, um, muitos) {
  const q = Number(n) || 0;
  return `${q} ${q === 1 ? um : muitos}`;
}
// Mesma regra, só a palavra: para frases em que o número já aparece em outro
// lugar ou em que o artigo e o verbo também precisam concordar.
function pluralWord(n, um, muitos) {
  return (Number(n) || 0) === 1 ? um : muitos;
}
// Data curta, mas nunca ambígua. Omitir o ano só é seguro DENTRO do ano
// corrente. Uma compra em 10x joga parcelas para 2027, e a lista mostrava
// "27/05" tanto para maio deste ano quanto para maio do ano que vem: o usuário
// não tinha como saber qual era qual em "Últimos lançamentos", na caixa de
// revisão ou no calendário. Fora do ano corrente entram os dois dígitos do ano,
// que cabem no mesmo espaço.
function fmtDateShort(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  const anoAtual = String(new Date().getFullYear());
  return y === anoAtual ? `${d}/${m}` : `${d}/${m}/${String(y).slice(2)}`;
}
function fmtDateFull(iso) { if(!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// [M6] MEDIDOR DE FORÇA DE SENHA: CONSELHO, NÃO REGRA.
//
// A REGRA vive só no servidor (`senhaNovaOf`, netlify/functions/account.js).
// Isto aqui não repete a regra e não bloqueia nada: repetir a política em dois
// lugares, em duas linguagens, é o começo garantido de uma divergir da outra, e
// aí o navegador aprova o que o servidor recusa (ou pior, o contrário). O que
// esta função faz é dar retorno enquanto a pessoa digita, que é onde uma senha
// ruim ainda pode ser trocada sem custo.
//
// A conta é grosseira de propósito e não finge precisão: comprimento pesa mais
// do que variedade (é o que a literatura mostra que importa), repetição e
// sequência descontam, e o email no meio da senha zera o resto. Nenhum número
// de bits é mostrado ao usuário; um "razoável" honesto vale mais do que uma
// entropia inventada com três casas decimais.
const SENHA_SEQUENCIAS = ["abcdefghijklmnopqrstuvwxyz", "01234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SENHA_ROTULOS = ["muito fraca", "fraca", "razoável", "boa", "forte"];

function passwordStrength(value, email) {
  const senha = String(value || "");
  if (!senha) return { score: 0, label: "", hint: "", empty: true };
  const plana = senha.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(senha)).length;
  const distintos = new Set(senha).size;

  let pontos = 0;
  if (senha.length >= 10) pontos += 1;
  if (senha.length >= 14) pontos += 1;
  if (senha.length >= 20) pontos += 1;
  if (classes >= 2) pontos += 1;
  if (classes >= 3 && senha.length >= 12) pontos += 1;
  // Pouca variedade de caracteres é o sinal mais barato de padrão repetido.
  if (distintos <= Math.max(3, senha.length / 4)) pontos -= 2;
  if (/^\d+$/.test(senha)) pontos -= 2;
  if (SENHA_SEQUENCIAS.some((linha) => linha.includes(plana) || linha.split("").reverse().join("").includes(plana))) pontos -= 3;

  const local = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const contemEmail = local.length >= 4 && plana.replace(/[^a-z0-9]/g, "").includes(local);
  if (contemEmail) pontos = -1;

  const score = clamp(pontos, 0, 4);
  let hint = "";
  if (contemEmail) hint = "Ela contém o seu email; o servidor vai recusar.";
  else if (senha.length < 10) hint = "Faltam caracteres para o mínimo de 10.";
  else if (score <= 1) hint = "Uma frase com três ou quatro palavras costuma ser mais forte e mais fácil de lembrar.";
  else if (score === 2) hint = "Mais alguns caracteres já fazem diferença.";
  return { score, label: SENHA_ROTULOS[score], hint, empty: false };
}

// Normalização de texto compartilhada (busca, categorização automática, NLP).
// Fica aqui para que import.js, nlp.js e app.js usem exatamente a mesma regra.
function normalizeText(str) {
  return String(str == null ? "" : str)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Reamostragem de séries para gráficos; antes existiam duas implementações
// idênticas (downsampleSeries em investments.js e sampleSeries em charts.js).
// Agora ambas são apelidos desta função única.
function resampleSeries(series, targetPoints = 60) {
  const list = Array.isArray(series) ? series : [];
  if (list.length <= targetPoints || targetPoints < 2) return list;
  const step = (list.length - 1) / (targetPoints - 1);
  const out = [];
  for (let i = 0; i < targetPoints; i++) out.push(list[Math.round(i * step)]);
  return out;
}

// O ATRIBUTO `download` NÃO EXISTE NO IOS, E NO APP INSTALADO ISSO É SILÊNCIO.
//
// Todo o "Exportar" do aplicativo passa por aqui: backup em JSON, lançamentos e
// orçamentos em CSV, extrato em PDF e o diagnóstico. A âncora com `download` é o
// caminho de sempre e funciona em computador e Android. No iPhone, não: o Safari
// ignora o atributo. Aberto no navegador o estrago é meio invisível (o arquivo
// abre na própria aba, como texto cru); INSTALADO na tela de início não há aba
// para onde abrir, e tocar em "Backup completo (JSON)" não faz nada. Nenhum
// erro, nenhum aviso: a pessoa conclui que o botão está quebrado, e está.
//
// O caminho que o iOS oferece é o painel de compartilhamento, com "Salvar em
// Arquivos" dentro dele. Ele exige gesto da pessoa, e todos os exportadores são
// síncronos do clique até aqui, então o gesto chega inteiro.
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  if (shareFileOnAppleTouch(blob, filename, mime)) return;
  saveBlobByAnchor(blob, filename);
}

function saveBlobByAnchor(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Devolve `true` quando assumiu a entrega do arquivo. A decisão é SÍNCRONA de
// propósito: `navigator.share` só é aceito enquanto o gesto do clique vale, e
// qualquer `await` antes dele perderia essa janela.
function shareFileOnAppleTouch(blob, filename, mime) {
  if (!isAppleTouchBrowser()) return false;
  if (typeof File !== "function" || !navigator.share || !navigator.canShare) return false;
  let file;
  try { file = new File([blob], filename, { type: mime }); } catch (e) { return false; }
  try { if (!navigator.canShare({ files: [file] })) return false; } catch (e) { return false; }
  navigator.share({ files: [file] }).catch((error) => {
    // Fechar o painel é decisão da pessoa, não falha: repetir a entrega aqui
    // reabriria o que ela acabou de dispensar.
    if (error && error.name === "AbortError") return;
    saveBlobByAnchor(blob, filename);
  });
  return true;
}

// iPhone e iPad (e o Safari de Mac com tela sensível ao toque, que se anuncia
// como MacIntel) traduzem cada item de `accept` para um UTI do sistema antes de
// abrir o app Arquivos. Extensão sem UTI registrado (`.ofx` é o caso) não é
// simplesmente ignorada: o seletor desabilita tudo que não casou, e o extrato
// aparece cinza, impossível de tocar. Quem importava pelo celular via a lista de
// arquivos abrir e nenhum deles poder ser escolhido.
function isAppleTouchBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  const platform = String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "");
  return platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1;
}

// Formatos que o importador sabe ler. No iOS a lista vira restrição cega (ver
// isAppleTouchBrowser), então lá o campo abre sem filtro nenhum e a validação
// fica por conta de detectFormat(), que já decide pelo conteúdo e não pela
// extensão. No resto dos navegadores o filtro só encurta a lista, e vale a pena.
const STATEMENT_ACCEPT = ".ofx,.csv,.txt,.pdf,text/csv,text/plain,application/pdf";

function statementAcceptAttr() {
  return isAppleTouchBrowser() ? "" : ` accept="${STATEMENT_ACCEPT}"`;
}

// COPIAR OS BYTES ANTES QUE O ARQUIVO SUMA.
//
// No iPhone um `File` não é o arquivo: é um ponteiro para a cópia temporária
// que o app Arquivos deixou na área do Safari. Essa cópia morre junto com a
// `FileList` que a trouxe, e limpar o campo (`input.value = ""`, o gesto padrão
// para permitir escolher o MESMO arquivo de novo) solta a lista. Se a leitura
// ainda estiver em curso nesse instante ela falha, com o arquivo inteiro ali do
// lado. Era o "Não foi possível ler o arquivo" que aparecia sempre, no iPhone
// e só nele, por mais vezes que a pessoa escolhesse o extrato.
//
// A defesa é copiar tudo para a memória do app numa tacada só, o mais cedo
// possível, e trabalhar sobre a cópia daí em diante. `arrayBuffer()` é o
// caminho curto; o `FileReader` fica como rota de fuga, tanto para navegador
// que não tenha o primeiro quanto para o caso de a leitura falhar por conta da
// corrida acima. Se as duas falharem quem volta é o erro original: é ele que
// diz o motivo de verdade (arquivo do iCloud ainda não baixado, por exemplo).
//
// Aceita também um instantâneo já lido (`{ bytes }`), que é como o importador
// repete a leitura de um PDF depois que a pessoa digita a senha.
function readFileBytes(file) {
  if (!file) return Promise.reject(new Error("Nenhum arquivo selecionado."));
  if (file.bytes instanceof Uint8Array) return Promise.resolve(file.bytes);
  const viaReader = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(new Uint8Array(reader.result)); } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
  if (typeof file.arrayBuffer !== "function") return viaReader();
  return file.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    (error) => viaReader().catch(() => { throw error; })
  );
}

// Extratos OFX de bancos brasileiros costumam vir em ISO-8859-1 (Latin-1); ler
// como UTF-8 estraga acentos. Decodifica como UTF-8 e, se aparecer o caractere
// de substituição, refaz em windows-1252.
function decodeFileText(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(data);
  if (/\uFFFD/.test(text)) {
    try { text = new TextDecoder("windows-1252").decode(data); } catch (e) { /* mantém utf-8 */ }
  }
  return text;
}

// Leitura de arquivo texto com detecção de codificação, usada pelo restore de
// backup e pelo importador de extratos (este por `snapshotStatementFile`).
async function readFileAsText(file) {
  return decodeFileText(await readFileBytes(file));
}

// Checksum estável (FNV-1a 32 bits) para validar a integridade de backups.

function checksumOf(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Escapa um campo para CSV (aspas duplas + separador + quebras de linha) E
// NEUTRALIZA FÓRMULA.
//
// Escapar aspas e vírgulas protege o formato do arquivo; não protege quem abre
// o arquivo. Excel, LibreOffice e Google Sheets EXECUTAM o conteúdo de uma
// célula que começa com `=`, `+`, `-` ou `@`. Como a descrição do lançamento é
// texto livre digitado pelo usuário (ou vindo de um extrato importado), uma
// descrição como `=cmd|'/c calc'!A1` viraria comando ao abrir a planilha, e o
// ataque atravessaria o app inteiro sem tocar nele: basta a vítima exportar e
// abrir.
//
// A defesa é o apóstrofo à frente: a planilha passa a tratar a célula como
// texto. O importador do próprio app remove esse apóstrofo na volta, então o
// ciclo exportar/reimportar continua fechando.
const CSV_FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let s = String(value == null ? "" : value);
  if (CSV_FORMULA_START.test(s)) s = `'${s}`;
  return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// O CSV é exportado para o Excel do usuário, não para um parser genérico, e a
// tela promete "abrir no Excel ou no Google Sheets". Num Windows em português o
// separador de lista é `;` e o decimal é `,`: um arquivo com vírgula separando
// campos e ponto decimal abre com tudo empilhado na coluna A, e os valores que
// escapam viram data ou texto. O separador vive aqui para exportação e
// importação lerem o mesmo dialeto (`detectSeparator` já aceita `;`, `,` e tab,
// então CSV de banco continua entrando igual).
const CSV_SEP = ";";

function csvNumber(value, decimals) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(decimals == null ? 2 : decimals).replace(".", ",");
}

// Desfaz a neutralização acima, na importação.
function csvUncell(value) {
  const s = String(value == null ? "" : value);
  return s.length > 1 && s[0] === "'" && CSV_FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
}

// ------------------------------------------------------------------------------
// DATA REAL
// ------------------------------------------------------------------------------
// `/^\d{4}-\d{2}-\d{2}$/` aceita 2026-02-31 e 2026-13-01. Pior: `Date.parse`
// não recusa, ele ROLA para o mês seguinte (2026-02-31 vira 3 de março). Uma
// data assim entrava no app, era gravada, sincronizada e caía no mês errado,
// mudando totais sem que ninguém tivesse errado a digitação de propósito.
//
// A verificação é de ida e volta: se os componentes reconstruídos não batem com
// os digitados, a data não existe.
function isRealIsoDate(value) {
  const s = String(value == null ? "" : value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > 2200) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
