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
function moneyToCents(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const asText = String(abs);
  let scaled;
  if (asText.includes("e") || asText.includes("E")) {
    scaled = abs * 100;                       // notação científica: fallback direto
  } else {
    scaled = Number(`${asText}e2`);
    if (!Number.isFinite(scaled)) scaled = abs * 100;
  }
  return sign * Math.round(scaled);
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

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Leitura de arquivo texto com detecção de codificação (UTF-8 → windows-1252),
// usada tanto pelo importador de extratos quanto pelo restore de backup.
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("Nenhum arquivo selecionado.")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        if (/\uFFFD/.test(text)) {
          try { text = new TextDecoder("windows-1252").decode(bytes); } catch (e) { /* mantém utf-8 */ }
        }
        resolve(text);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
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
