// import.js. Módulo de importação offline de extratos e faturas (OFX / CSV / PDF)
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

// Heurística principal: qual categoria a descrição pede, com que confiança e
// POR QUÊ. O "por quê" não é enfeite: a tela de revisão mostra a origem do
// palpite, e um palpite que se explica é um palpite que a pessoa consegue
// corrigir de uma vez (criando a regra) em vez de corrigir todo mês.
//
// A ordem das fontes é a ordem da autoridade sobre o assunto:
//   1. Regra que a pessoa escreveu. Ela mandou; não há o que discutir.
//   2. O que ela já classificou à mão neste mesmo estabelecimento. Ninguém
//      sabe melhor que "MERC BOM JESUS" é mercado do que quem mora na rua.
//   3. Dicionário de fábrica, no texto cru do extrato.
//   4. Dicionário de fábrica, no nome limpo do estabelecimento; é o que faz
//      uma regra "começa com padaria" alcançar "PAG*PADARIA DO ZE".
//   5. Histórico sem escolha manual (o próprio palpite de antes), que serve
//      para manter a coerência, mas entra com confiança média.
function suggestCategoryForDescription(dataOrCategories, description) {
  const ctx = rulesContextOf(dataOrCategories);
  const categories = ctx.categories || [];
  const has = (id) => !!id && (categories.length === 0 || categories.some((c) => c.id === id));
  const fallback = { categoryId: fallbackCategoryId(categories), confidence: "baixa", reason: null };

  const text = normalizeForMatch(description);
  if (!text) return fallback;

  const compiled = compileCategoryRules(ctx);
  const direct = matchCategoryRules(compiled, text);
  const core = statementMerchantCore(description);
  const fromCore = core && core !== text ? matchCategoryRules(compiled, core) : null;

  const custom = [direct, fromCore].find((m) => m && m.source === "custom" && has(m.categoryId));
  if (custom) return { categoryId: custom.categoryId, confidence: "alta", reason: `sua regra “${custom.label}”` };

  const learned = recallCategoryFromMemory(ctx, description);
  if (learned && learned.manual && has(learned.categoryId)) {
    return { categoryId: learned.categoryId, confidence: "alta", reason: "você já classificou este lugar assim" };
  }

  const builtin = [direct, fromCore].find((m) => m && has(m.categoryId));
  if (builtin) {
    return { categoryId: builtin.categoryId, confidence: builtin.weight >= 5 ? "alta" : "media", reason: builtin.label };
  }

  if (learned && has(learned.categoryId)) {
    return { categoryId: learned.categoryId, confidence: "media", reason: "mesma categoria de lançamentos parecidos" };
  }

  // A regra casou, mas a categoria dela foi apagada. Antes de desistir, tenta a
  // categoria-mãe: quem apagou "Mercado" continua tendo "Alimentação".
  const best = direct || fromCore;
  if (best) {
    const parent = { mercado: "alimentacao", delivery: "alimentacao" }[best.categoryId];
    if (parent && has(parent)) return { categoryId: parent, confidence: "media", reason: best.label };
  }
  return fallback;
}

// Contratos antigos, mantidos porque o parser de linguagem natural, o leitor de
// QR e os testes chamam estes dois nomes. Ambos são a mesma pergunta com
// recortes diferentes da resposta.
function guessCategoryId(dataOrCategories, description) {
  return suggestCategoryForDescription(dataOrCategories, description).categoryId;
}

function fallbackCategoryId(categories) {
  return categories.some((c) => c.id === "outros") ? "outros" : (categories[0] ? categories[0].id : "outros");
}

// Expõe a confiança da sugestão para a tela de revisão (badge "sugerido").
function categorySuggestionConfidence(description, dataOrCategories) {
  return suggestCategoryForDescription(dataOrCategories === undefined ? [] : dataOrCategories, description).confidence;
}

// ------------------------------------------------------------------------------
// LEITURA DO ARQUIVO; com detecção de codificação
// ------------------------------------------------------------------------------
// Extratos OFX de bancos brasileiros costumam vir em ISO-8859-1 (Latin-1); ler
// como UTF-8 estraga acentos. Decodificamos como UTF-8 e, se aparecer o caractere
// de substituição, refazemos em windows-1252.
// A decodificação (UTF-8 → windows-1252) vive em utils.js/readFileAsText e é
// compartilhada com o restore de backup; antes havia duas implementações.
async function readStatementFile(file, options) {
  if (!file) throw new ImportError("READ_FAIL", "Nenhum arquivo selecionado.");
  if (file.size === 0) throw new ImportError("EMPTY", "O arquivo está vazio.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError("TOO_LARGE", "Arquivo muito grande (limite de 12 MB). Exporte um período menor no seu banco.");
  }
  try {
    if (typeof isPdfStatementFile === "function" && isPdfStatementFile(file)) {
      return await readPdfStatementFile(file, options && options.password);
    }
    return await readFileAsText(file);
  } catch (err) {
    if (err instanceof ImportError) throw err;
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
    throw new ImportError("UNKNOWN_FORMAT", "Formato não reconhecido. Envie um arquivo .OFX, .CSV ou .PDF exportado do seu banco.");
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

function prepareImportRows(rawFile, filename, data) {
  const parsed = rawFile && typeof rawFile === "object" && rawFile.format === "pdf"
    ? rawFile
    : parseStatementFile(rawFile, filename);
  const { rows, format, skipped } = parsed;
  const withDup = markDuplicates(rows, data.transactions);
  const prepared = withDup.map((r) => {
    // O papel da linha vem antes da categoria: não adianta perguntar em que
    // categoria entra um "Pagamento recebido" da fatura se ele não deveria
    // entrar como lançamento nenhum.
    const role = classifyStatementRow(r.description, r.type);
    const suggestion = r.type === "expense" ? suggestCategoryForDescription(data, r.description) : null;
    return {
      ...r,
      role: role ? role.id : null,
      roleLabel: role ? role.label : null,
      roleDetail: role ? role.detail : null,
      include: !r.duplicate && !(role && role.skip),
      defaultInclude: !r.duplicate && !(role && role.skip),
      includeTouched: false,
      importAs: "transaction",
      otherAccountId: "",
      categoryId: suggestion ? suggestion.categoryId : null,
      confidence: suggestion ? suggestion.confidence : "alta",
      categoryReason: suggestion ? suggestion.reason : null,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
  const roleCounts = prepared.reduce((count, r) => (r.role ? { ...count, [r.role]: (count[r.role] || 0) + 1 } : count), {});
  const filenameLooksLikeCard = /\b(fatura|cartao|card)\b/.test(normalizeForMatch(filename || ""));
  const documentKind = parsed.documentKind || (filenameLooksLikeCard || roleCounts.carryover ? "card" : "account");
  prepared.meta = {
    format, skipped, total: rows.length, documentKind,
    bank: parsed.bank || null,
    profile: parsed.profile || null,
    confidence: parsed.confidence || "alta",
    pageCount: parsed.pageCount || null,
    roles: roleCounts,
  };
  return prepared;
}

// ------------------------------------------------------------------------------
// GRAVAÇÃO; transforma as linhas revisadas em transações e persiste no IndexedDB
// ------------------------------------------------------------------------------
function buildTransactionsFromRows(rows, format, destination, filename) {
  const settings = destination && typeof destination === "object"
    ? destination
    : { documentKind: "account", destinationId: destination || null };
  const documentKind = settings.documentKind === "card" ? "card" : "account";
  const destinationId = settings.destinationId || null;
  const source = format === "ofx" ? "import-ofx" : (format === "pdf" ? "import-pdf" : "import-csv");
  const label = source === "import-ofx" ? "Extrato OFX" : (source === "import-pdf" ? "PDF bancário" : "Extrato CSV");
  return rows.map((r) => {
    const tx = makeTransaction({
      type: r.type,
      amount: r.amount,
      categoryId: r.type === "expense" ? (r.categoryId || "outros") : "outros",
      date: r.date,
      payment: documentKind === "card" ? "Crédito" : (r.type === "expense" ? "Débito" : "Outro"),
      description: r.description,
      source,
      origin: { channel: source, label, reference: filename || null, importedAt: new Date().toISOString() },
      accountId: documentKind === "account" ? destinationId : null,
      creditCardId: documentKind === "card" ? destinationId : null,
      nature: r.nature || (documentKind === "card" && r.type === "income" ? "estorno" : null),
    });
    // A linha veio desmarcada e a pessoa marcou de volta. Foi decisão dela, e
    // a caixa de revisão não pode recebê-la de novo perguntando a mesma coisa
    // que ela acabou de responder na tela ao lado.
    if (r.role === "card-payment" && tx.type === "income" && typeof markTransactionIssueReviewed === "function") {
      return markTransactionIssueReviewed(tx, `invoice-income:${tx.id}`);
    }
    return tx;
  });
}

// Marca a ponta que já está representada por uma transferência criada na
// importação da outra conta. `defaultInclude` guarda a decisão original de
// duplicidade/papel da linha; assim trocar a conta de destino não transforma
// silenciosamente uma duplicata antiga em lançamento selecionado.
function applyRecordedTransferMatches(rows, data, destinationId) {
  const source = Array.isArray(rows) ? rows : [];
  const prepared = source.map((row) => {
    const defaultInclude = Object.prototype.hasOwnProperty.call(row, "defaultInclude")
      ? !!row.defaultInclude
      : !!row.include;
    const result = destinationId
      ? resolveRecordedAccountTransfer(row, destinationId, (data && data.accountTransfers) || [])
      : { status: "none", matches: [], transfer: null };
    const next = {
      ...row,
      defaultInclude,
      recordedTransferStatus: result.status,
      recordedTransferId: result.transfer ? result.transfer.id : null,
      recordedTransferMatches: result.matches.map((item) => item.id),
    };
    if (!row.includeTouched) next.include = result.status === "unique" ? false : defaultInclude;
    return next;
  });
  if (rows && rows.meta) prepared.meta = rows.meta;
  return prepared;
}

function importOriginMeta(format, filename, transfer) {
  const source = format === "ofx" ? "import-ofx" : (format === "pdf" ? "import-pdf" : "import-csv");
  const fileLabel = source === "import-ofx" ? "Extrato OFX" : (source === "import-pdf" ? "PDF bancário" : "Extrato CSV");
  return transfer
    ? { channel: "transfer", label: `Transferência importada de ${fileLabel}`, reference: filename || null, importedAt: new Date().toISOString() }
    : { channel: source, label: fileLabel, reference: filename || null, importedAt: new Date().toISOString() };
}

function importTransferAccounts(row, statementAccountId) {
  if (!row || !statementAccountId || !row.otherAccountId) return null;
  if (row.type === "expense") return { fromAccountId: statementAccountId, toAccountId: row.otherAccountId };
  if (row.type === "income") return { fromAccountId: row.otherAccountId, toAccountId: statementAccountId };
  return null;
}

// Constrói os dois tipos de registro sem misturá-los. O chamador grava o
// resultado numa única mutação, evitando um intervalo em que uma transação já
// sumiu mas a transferência ainda não existe.
function buildImportRecordsFromRows(rows, format, destination, filename, accounts) {
  const settings = destination && typeof destination === "object"
    ? destination
    : { documentKind: "account", destinationId: destination || null };
  const included = (rows || []).filter((row) => row && row.include !== false);
  const transferRows = included.filter((row) => row.importAs === "transfer");
  const transactionRows = included.filter((row) => row.importAs !== "transfer");
  const transactions = buildTransactionsFromRows(transactionRows, format, settings, filename);
  if (!transferRows.length) return { transactions, accountTransfers: [] };
  if (settings.documentKind !== "account") {
    throw new ImportError("IMPORT_TRANSFER_DOCUMENT", "Transferências entre contas só podem vir de um extrato bancário.");
  }

  const activeAccounts = (accounts || []).filter((account) => account && !account.archived);
  const activeIds = new Set(activeAccounts.map((account) => account.id));
  if (!activeIds.has(settings.destinationId) || activeIds.size < 2) {
    throw new ImportError("IMPORT_TRANSFER_ACCOUNT", "Cadastre e escolha duas contas ativas para registrar a transferência.");
  }

  const accountTransfers = transferRows.map((row) => {
    const pair = importTransferAccounts(row, settings.destinationId);
    if (!pair || pair.fromAccountId === pair.toAccountId || !activeIds.has(pair.fromAccountId) || !activeIds.has(pair.toAccountId)) {
      throw new ImportError("IMPORT_TRANSFER_ACCOUNT", "Escolha outra conta ativa para a transferência.");
    }
    const transfer = makeAccountTransfer({
      ...pair,
      amount: row.amount,
      date: row.date,
      description: row.description || "Transferência",
      origin: importOriginMeta(format, filename, true),
      sourceTransactionIds: Array.isArray(row.sourceTransactionIds) ? row.sourceTransactionIds : [],
    }, activeAccounts);
    if (!transfer) throw new ImportError("IMPORT_TRANSFER_ACCOUNT", "Não foi possível montar a transferência com as contas escolhidas.");
    return transfer;
  });
  return { transactions, accountTransfers };
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
