// import.js. Módulo de importação offline de extratos bancários (OFX / CSV)
// ------------------------------------------------------------------------------
// 100% client-side: o arquivo é lido pelo FileReader, parseado em memória e
// gravado direto no IndexedDB via storage.js. NENHUM byte é enviado a servidor.
//
// Pipeline:
//   File → readStatementFile() → detectFormat() → parseOfx()/parseCsv()
//        → normalizeRows() → autoCategorize() (heurística Regex)
//        → markDuplicates() → revisão do usuário → commitImportRows() → IndexedDB
"use strict";

// ------------------------------------------------------------------------------
// Erros tipados; permitem que a UI mostre uma mensagem útil em vez de "erro".
// ------------------------------------------------------------------------------
class ImportError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "ImportError";
    this.code = code;       // "READ_FAIL" | "EMPTY" | "UNKNOWN_FORMAT" | "NO_ROWS" | "TOO_LARGE"
    this.detail = detail || null;
  }
}

const MAX_IMPORT_BYTES = 12 * 1024 * 1024; // 12 MB; extratos reais têm poucos KB
const DUPLICATE_WINDOW_DAYS = 3;

// ------------------------------------------------------------------------------
// CATEGORIZAÇÃO AUTOMÁTICA
// ------------------------------------------------------------------------------
// O dicionário e a aritmética de pesos saíram daqui e viraram `js/rules.js`, um
// motor puro que combina as regras de fábrica com as que o usuário escreveu na
// tela "Regras de categorização". Este arquivo só sabe fazer a pergunta.
//
// As funções aceitam tanto o `data` inteiro quanto só o array de categorias. A
// segunda forma é o contrato antigo e sobrevive porque um chamador que só tem a
// lista de categorias ainda deve conseguir um palpite razoável; só que sem as
// regras do usuário, que moram no `data`.
function rulesContextOf(dataOrCategories) {
  if (Array.isArray(dataOrCategories)) return { categories: dataOrCategories, categoryRules: null };
  return dataOrCategories || { categories: [], categoryRules: null };
}

// Remove acentos e normaliza para o padrão casar sem depender de acentuação.
// Delega para normalizeText (utils.js); a mesma normalização usada pela busca
// do histórico, pelo parser de linguagem natural e pelo motor de regras, para as
// quatro não divergirem.
function normalizeForMatch(str) {
  return normalizeText(str);
}

// Heurística principal: retorna o id da categoria mais provável para a descrição.
// Se nenhuma regra casar (ou a categoria não existir mais), cai em "outros".
function guessCategoryId(dataOrCategories, description) {
  const ctx = rulesContextOf(dataOrCategories);
  const categories = ctx.categories || [];
  const text = normalizeForMatch(description);
  if (!text) return fallbackCategoryId(categories);

  const best = matchCategoryRules(compileCategoryRules(ctx), text);
  if (best && categories.some((c) => c.id === best.categoryId)) return best.categoryId;
  // Se a subcategoria sugerida foi apagada, tenta a categoria pai equivalente.
  if (best) {
    const parentGuess = { mercado: "alimentacao", delivery: "alimentacao" }[best.categoryId];
    if (parentGuess && categories.some((c) => c.id === parentGuess)) return parentGuess;
  }
  return fallbackCategoryId(categories);
}

function fallbackCategoryId(categories) {
  return categories.some((c) => c.id === "outros") ? "outros" : (categories[0] ? categories[0].id : "outros");
}

// Expõe a confiança da sugestão para a tela de revisão (badge "sugerido").
// Regra escrita pelo usuário nasce com peso alto de propósito: se ele mandou
// mandar, a sugestão é confiável por definição.
function categorySuggestionConfidence(description, dataOrCategories) {
  const ctx = rulesContextOf(dataOrCategories === undefined ? [] : dataOrCategories);
  const best = matchCategoryRules(compileCategoryRules(ctx), normalizeForMatch(description));
  const weight = best ? best.weight : 0;
  return weight >= 5 ? "alta" : weight >= 3 ? "media" : "baixa";
}

// ------------------------------------------------------------------------------
// LEITURA DO ARQUIVO; com detecção de codificação
// ------------------------------------------------------------------------------
// Extratos OFX de bancos brasileiros costumam vir em ISO-8859-1 (Latin-1); ler
// como UTF-8 estraga acentos. Decodificamos como UTF-8 e, se aparecer o caractere
// de substituição, refazemos em windows-1252.
// A decodificação (UTF-8 → windows-1252) vive em utils.js/readFileAsText e é
// compartilhada com o restore de backup; antes havia duas implementações.
async function readStatementFile(file) {
  if (!file) throw new ImportError("READ_FAIL", "Nenhum arquivo selecionado.");
  if (file.size === 0) throw new ImportError("EMPTY", "O arquivo está vazio.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError("TOO_LARGE", "Arquivo muito grande (limite de 12 MB). Exporte um período menor no seu banco.");
  }
  try {
    return await readFileAsText(file);
  } catch (err) {
    throw new ImportError("READ_FAIL", "Não foi possível ler o arquivo. Tente selecioná-lo novamente.", String(err));
  }
}

// Descrições de tarifas/saldos que normalmente o usuário não quer importar como
// gasto comum. Não é categorização: é filtro de ruído do próprio extrato.
const NOISE_RE = /\b(saldo ?anterior|saldo ?do ?dia|saldo ?final|total ?do ?periodo|s a l d o)\b/;

// ------------------------------------------------------------------------------
// PARSER CSV; separador automático (; ou , ou tab) e colunas por cabeçalho
// ------------------------------------------------------------------------------
function splitCsvLine(line, sep) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes; continue;
    }
    if (ch === sep && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectSeparator(headerLine) {
  const counts = { ";": (headerLine.match(/;/g) || []).length, ",": (headerLine.match(/,/g) || []).length, "\t": (headerLine.match(/\t/g) || []).length };
  return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ";");
}

function parseBrDate(str) {
  str = String(str || "").trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// Aceita 1.234,56 (BR), 1,234.56 (US), 1234.56, (123,45) e -R$ 12,00.
// Ponto de entrada único: parseMoneyInput (utils.js), que já arredonda para
// centavos. Manter um segundo parser aqui era fonte garantida de divergência
// entre "o que o extrato diz" e "o que o app soma".
function parseBrNumber(str) {
  return parseMoneyInput(str);
}

function parseCsvStatement(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new ImportError("EMPTY", "O arquivo CSV não tem nenhuma linha de dados.");

  const sep = detectSeparator(lines[0]);
  const headerCells = splitCsvLine(lines[0], sep).map((h) => normalizeForMatch(h));
  const looksLikeHeader = headerCells.some((h) => /data|date|valor|montante|amount|hist|descri|lancamento/.test(h));
  const startIdx = looksLikeHeader ? 1 : 0;

  let idxDate = headerCells.findIndex((h) => /data|date/.test(h));
  let idxValue = headerCells.findIndex((h) => /valor|montante|amount|credito|debito/.test(h));
  let idxDesc = headerCells.findIndex((h) => /hist|descri|memo|payee|lancamento|estabelecimento/.test(h));
  if (!looksLikeHeader) { idxDate = 0; idxDesc = 1; idxValue = 2; }
  if (idxDate < 0) idxDate = 0;
  if (idxValue < 0) idxValue = headerCells.length - 1;
  if (idxDesc < 0) idxDesc = 1;

  const out = [];
  let skipped = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep);
    if (cells.length < 2) { skipped++; continue; }
    const date = parseBrDate(cells[idxDate] || "");
    const amount = parseBrNumber(cells[idxValue]);
    const description = (cells[idxDesc] || "").replace(/^"|"$/g, "").trim();
    if (!date || isNaN(amount) || amount === 0) { skipped++; continue; }
    if (NOISE_RE.test(normalizeForMatch(description))) { skipped++; continue; }
    out.push({ date, amount, description });
  }
  return { rows: out, skipped, format: "csv" };
}

// ------------------------------------------------------------------------------
// PARSER OFX. SGML simplificado usado pelos bancos brasileiros
// ------------------------------------------------------------------------------
function parseOfxStatement(text) {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) throw new ImportError("NO_ROWS", "Nenhuma transação encontrada no OFX. O arquivo pode estar incompleto.");

  const out = [];
  let skipped = 0;
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : null;
    };
    const dtRaw = get("DTPOSTED");
    const amtRaw = get("TRNAMT");
    const trnType = (get("TRNTYPE") || "").toUpperCase();
    const memo = get("MEMO") || get("NAME") || get("CHECKNUM") || "";
    if (!dtRaw || amtRaw == null) { skipped++; continue; }

    const date = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }

    let amount = parseBrNumber(amtRaw);
    if (!Number.isFinite(amount) || amount === 0) { skipped++; continue; }

    // Alguns bancos não usam sinal e informam o tipo em TRNTYPE. Era `const`
    // até aqui: em modo estrito a reatribuição lançava TypeError e derrubava a
    // importação inteira justamente nos extratos que mais precisam do ajuste.
    if (amount > 0 && /^(DEBIT|PAYMENT|FEE|SRVCHG|ATM|CASH|DIRECTDEBIT)$/.test(trnType)) amount = -amount;

    out.push({ date, amount, description: memo });
  }
  if (out.length === 0) throw new ImportError("NO_ROWS", "O OFX foi lido, mas nenhuma transação válida foi encontrada.");
  return { rows: out, skipped, format: "ofx" };
}

// Detecta o formato pelo conteúdo (não confia só na extensão) e delega.

function detectFormat(text, filename) {
  if (/<OFX>|<STMTTRN>|OFXHEADER/i.test(text)) return "ofx";
  if (/\.ofx$/i.test(filename || "")) return "ofx";
  if (/\.(csv|txt|tsv)$/i.test(filename || "")) return "csv";
  if (/[;,\t].*[;,\t]/.test(text.split(/\r?\n/)[0] || "")) return "csv";
  return null;
}

function parseStatementFile(text, filename) {
  if (!text || !text.trim()) throw new ImportError("EMPTY", "O arquivo está vazio.");
  const format = detectFormat(text, filename);
  if (!format) {
    throw new ImportError("UNKNOWN_FORMAT", "Formato não reconhecido. Envie um extrato .OFX ou .CSV exportado do seu banco.");
  }
  const parsed = format === "ofx" ? parseOfxStatement(text) : parseCsvStatement(text);
  if (parsed.rows.length === 0) {
    throw new ImportError("NO_ROWS", "Nenhum lançamento válido foi encontrado no arquivo.");
  }
  // Normaliza para o modelo interno: valor sempre positivo + tipo explícito.
  const rows = parsed.rows.map((r) => ({
    date: r.date,
    amount: Math.abs(roundMoney(r.amount)),
    description: r.description,
    type: r.amount < 0 ? "expense" : "income",
  }));
  return { rows, format: parsed.format, skipped: parsed.skipped };
}

// ------------------------------------------------------------------------------
// DETECÇÃO DE DUPLICATAS; evita importar o mesmo extrato duas vezes
// ------------------------------------------------------------------------------
function markDuplicates(rows, existingTx) {
  return rows.map((r) => {
    const rd = new Date(r.date + "T00:00:00").getTime();
    const dupe = existingTx.some((t) => {
      if (moneyToCents(t.amount) !== moneyToCents(r.amount)) return false;
      if (t.type !== r.type) return false;
      const td = new Date(t.date + "T00:00:00").getTime();
      return Math.abs(rd - td) / 86400000 <= DUPLICATE_WINDOW_DAYS;
    });
    return { ...r, duplicate: dupe };
  });
}

// Monta as linhas prontas para a tela de revisão (com categoria já sugerida).

function prepareImportRows(rawText, filename, data) {
  const { rows, format, skipped } = parseStatementFile(rawText, filename);
  const withDup = markDuplicates(rows, data.transactions);
  const prepared = withDup.map((r) => ({
    ...r,
    include: !r.duplicate,
    categoryId: r.type === "expense" ? guessCategoryId(data, r.description) : null,
    confidence: r.type === "expense" ? categorySuggestionConfidence(r.description, data) : "alta",
  })).sort((a, b) => (a.date < b.date ? 1 : -1));
  prepared.meta = { format, skipped, total: rows.length };
  return prepared;
}

// ------------------------------------------------------------------------------
// GRAVAÇÃO; transforma as linhas revisadas em transações e persiste no IndexedDB
// ------------------------------------------------------------------------------
function buildTransactionsFromRows(rows, format, accountId, filename) {
  const source = format === "ofx" ? "import-ofx" : "import-csv";
  return rows.map((r) => makeTransaction({
    type: r.type,
    amount: r.amount,
    categoryId: r.type === "expense" ? (r.categoryId || "outros") : "outros",
    date: r.date,
    payment: r.type === "expense" ? "Débito" : "Outro",
    description: r.description,
    source,
    origin: { channel: source, label: source === "import-ofx" ? "Extrato OFX" : "Extrato CSV", reference: filename || null, importedAt: new Date().toISOString() },
    accountId: accountId || null,
  }));
}

// ------------------------------------------------------------------------------
// GESTOR LOCAL DE ASSINATURAS E RECORRÊNCIAS
// ------------------------------------------------------------------------------
function normalizeDesc(s) {
  return normalizeText(s).replace(/[^a-z0-9 ]/g, "").trim();
}

function detectSubscriptions(data) {
  const expenses = data.transactions.filter((t) => t.type === "expense");
  const groups = {};
  expenses.forEach((t) => {
    const key = (t.recurring ? "R|" : "") + normalizeDesc(t.description) + "|" + t.categoryId;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const subs = [];
  Object.values(groups).forEach((list) => {
    if (list.length < 2) return;
    const monthsSeen = new Set(list.map((t) => monthKeyOf(t.date)));
    if (monthsSeen.size < 2) return;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const cat = categoryById(data, last.categoryId);
    const increasePct = safePct(subMoney(last.amount, prev.amount), prev.amount);
    const lastDate = new Date(last.date + "T00:00:00");
    const nextDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, lastDate.getDate());
    subs.push({
      key: normalizeDesc(last.description) || cat.name,
      name: last.description || cat.name,
      categoryId: last.categoryId,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      occurrences: sorted.length,
      lastAmount: last.amount,
      prevAmount: prev.amount,
      increasePct,
      nextDate: keyOfDate(nextDate) === keyOfDate(new Date()) ? last.date : nextDate.toISOString().slice(0, 10),
      recurringFlag: !!last.recurring,
    });
  });

  subs.sort((a, b) => b.lastAmount - a.lastAmount);
  const monthlyTotal = subs.reduce((s, x) => s + x.lastAmount, 0);
  const increasing = subs.filter((s) => s.increasePct > 3);
  return { subs, monthlyTotal, increasing };
}
