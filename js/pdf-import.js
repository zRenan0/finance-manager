// pdf-import.js. Leitura local de faturas e extratos em PDF com texto.
//
// O PDF.js é servido pelo próprio aplicativo e só entra na memória quando um
// PDF é escolhido. O arquivo, o texto e a senha nunca saem do navegador.
"use strict";

const PDF_IMPORT_MODULE_PATH = "vendor/pdfjs/pdf.min.mjs";
const PDF_IMPORT_WORKER_PATH = "vendor/pdfjs/pdf.worker.min.mjs";
const PDF_IMPORT_MAX_PAGES = 80;
const PDF_IMPORT_LINE_TOLERANCE = 2.5;
const PDF_IMPORT_MONEY_SOURCE = "(?:R\\$\\s*)?(?:\\(\\s*)?[+-]?\\s*(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}\\s*(?:[DC]|[-+])?\\s*\\)?";
const PDF_IMPORT_DATE_AT_START_RE = /^\s*(\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?)\b\s*(.*)$/;
const PDF_IMPORT_REFUND_RE = /\b(estorno|reembolso|devolucao|cancelamento|credito de compra|credito estabelecimento|ajuste a credito)\b/;
const PDF_IMPORT_PAYMENT_RE = /\bpagamento (?:recebido|efetuado|realizado|de fatura|da fatura|em \d{2}\/\d{2})\b|\bpag(?:to|amento)? ?(?:de )?fatura\b|\bfatura paga\b/;
const PDF_IMPORT_DEBIT_RE = /\b(pix enviado|pagamento|compra|saque|tarifa|debito|boleto|transferencia enviada|ted enviada|doc enviado)\b/;
const PDF_IMPORT_CREDIT_RE = /\b(pix recebido|recebimento|salario|deposito|credito em conta|transferencia recebida|ted recebida)\b/;
const PDF_IMPORT_NON_TRANSACTION_RE = /^(?:total(?: da)? fatura|total(?: do)? periodo|subtotal|limite(?: disponivel| total)?|pagamento minimo|melhor dia|vencimento|fechamento|data descricao|data historico|lancamentos?)\b/;

let pdfImportLibraryPromise = null;

function pdfImportAssetUrl(pathname) {
  if (typeof document !== "undefined" && document.baseURI) return new URL(pathname, document.baseURI).href;
  return pathname;
}

async function loadPdfImportLibrary() {
  if (!pdfImportLibraryPromise) {
    const moduleUrl = pdfImportAssetUrl(PDF_IMPORT_MODULE_PATH);
    pdfImportLibraryPromise = import(moduleUrl).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfImportAssetUrl(PDF_IMPORT_WORKER_PATH);
      return pdfjs;
    }).catch((error) => {
      pdfImportLibraryPromise = null;
      throw error;
    });
  }
  return pdfImportLibraryPromise;
}

function isPdfStatementFile(file) {
  const name = String(file && file.name || "");
  const type = String(file && file.type || "").toLowerCase();
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

async function readPdfImportBytes(file) {
  // Instantâneo já lido pelo importador (o caminho normal desde que o iPhone
  // ensinou que o `File` não sobrevive à própria escolha; ver import.js).
  if (file && file.bytes instanceof Uint8Array) return file.bytes;
  if (file && typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o PDF"));
    reader.readAsArrayBuffer(file);
  });
}

function pdfItemsToLines(items, pageNumber) {
  const positioned = (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      text: item.str.replace(/\s+/g, " ").trim(),
      x: Number(item.transform && item.transform[4]) || 0,
      y: Number(item.transform && item.transform[5]) || 0,
      width: Math.max(0, Number(item.width) || 0),
      height: Math.max(1, Number(item.height) || Math.abs(Number(item.transform && item.transform[3])) || 10),
    }))
    .sort((a, b) => Math.abs(b.y - a.y) > PDF_IMPORT_LINE_TOLERANCE ? b.y - a.y : a.x - b.x);

  const grouped = [];
  positioned.forEach((item) => {
    let line = grouped.find((candidate) => Math.abs(candidate.y - item.y) <= PDF_IMPORT_LINE_TOLERANCE);
    if (!line) {
      line = { page: pageNumber, y: item.y, items: [] };
      grouped.push(line);
    }
    line.items.push(item);
    line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
  });

  return grouped.sort((a, b) => b.y - a.y).map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let previous = null;
    line.items.forEach((item) => {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const threshold = previous ? Math.max(1.5, Math.min(previous.height, item.height) * 0.16) : 0;
      if (text && gap > threshold && !/\s$/.test(text)) text += " ";
      text += item.text;
      previous = item;
    });
    return { ...line, text: text.replace(/\s+/g, " ").trim() };
  }).filter((line) => line.text);
}

function pdfMoneyTokens(text) {
  const matcher = new RegExp(PDF_IMPORT_MONEY_SOURCE, "gi");
  const tokens = [];
  let match;
  while ((match = matcher.exec(String(text || ""))) !== null) {
    const parsed = parsePdfMoneyToken(match[0]);
    if (parsed) tokens.push({ ...parsed, raw: match[0], index: match.index, end: matcher.lastIndex });
  }
  return tokens;
}

function parsePdfMoneyToken(raw) {
  const text = String(raw || "").replace(/\u00a0/g, " ").trim();
  const normalized = text.toUpperCase().replace(/\s+/g, "");
  const marker = /D\)?$/.test(normalized) ? "debit" : (/C\)?$/.test(normalized) ? "credit" : null);
  const negative = marker === "debit" || /^-/.test(normalized.replace(/^R\$/, "")) || /-$/.test(normalized) || /^\(/.test(normalized);
  const positive = marker === "credit" || /^\+/.test(normalized.replace(/^R\$/, "")) || /\+$/.test(normalized);
  const numeric = text.replace(/R\$/gi, "").replace(/[DC]/gi, "").replace(/[()\s+\-]/g, "");
  const amount = parseBrNumber(numeric);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return { amount: negative ? -Math.abs(amount) : Math.abs(amount), explicitDirection: negative || positive, marker };
}

function pdfTokenX(line, token) {
  const digits = String(token && token.raw || "").replace(/\D/g, "");
  if (!digits) return null;
  const item = (line.items || []).find((candidate) => {
    const candidateDigits = String(candidate.text || "").replace(/\D/g, "");
    return candidateDigits && (candidateDigits.includes(digits) || digits.includes(candidateDigits));
  });
  return item ? item.x : null;
}

function detectPdfAccountColumns(lines) {
  const columns = {};
  (lines || []).forEach((line) => {
    const normalizedLine = normalizeText(line.text);
    if (!/\b(data|historico|descricao|lancamento)\b/.test(normalizedLine)) return;
    (line.items || []).forEach((item) => {
      const text = normalizeText(item.text);
      if (/\b(debito|saida)\b/.test(text)) columns.debit = item.x;
      if (/\b(credito|entrada)\b/.test(text)) columns.credit = item.x;
      if (/\bsaldo\b/.test(text)) columns.balance = item.x;
      if (/\bvalor\b/.test(text) && columns.value == null) columns.value = item.x;
    });
  });
  return columns;
}

function nearestPdfColumn(x, columns) {
  if (x == null) return null;
  const candidates = ["debit", "credit", "balance", "value"]
    .filter((key) => Number.isFinite(columns[key]))
    .map((key) => ({ key, distance: Math.abs(x - columns[key]) }))
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}

function selectPdfAccountMoney(tokens, line, columns) {
  const positioned = tokens.map((token) => ({ ...token, x: pdfTokenX(line, token) }));
  const withColumns = positioned.map((token) => ({ ...token, column: nearestPdfColumn(token.x, columns) }));
  const transactionColumns = withColumns.filter((token) => token.column && token.column.key !== "balance");
  if (transactionColumns.length) {
    const selected = transactionColumns.sort((a, b) => a.column.distance - b.column.distance)[0];
    return { ...selected, column: selected.column.key };
  }
  const selected = withColumns.length > 1 ? withColumns[withColumns.length - 2] : withColumns[withColumns.length - 1];
  return selected ? { ...selected, column: selected.column ? selected.column.key : null } : null;
}

function detectPdfStatementProfile(lines, filename) {
  const fullText = (lines || []).map((line) => line.text).join("\n");
  const text = normalizeText(`${filename || ""}\n${fullText}`);
  const bank = /\bsantander\b|banco santander/.test(text) ? "Santander" : null;
  const cardMarkers = ["fatura", "vencimento", "pagamento minimo", "limite disponivel", "melhor dia de compra", "final do cartao", "cartao final"];
  const accountMarkers = ["extrato", "conta corrente", "saldo disponivel", "saldo da conta", "agencia", "periodo do extrato"];
  const cardScore = cardMarkers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
  const accountScore = accountMarkers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
  const documentKind = cardScore > accountScore ? "card" : "account";
  const knownStructure = cardScore > 0 || accountScore > 0;
  return {
    bank,
    profile: bank ? "santander" : "structural",
    documentKind,
    confidence: bank && knownStructure ? "alta" : (knownStructure ? "media" : "baixa"),
    fullText,
  };
}

function pdfDateContext(lines, filename) {
  const prioritized = [];
  const remaining = [];
  const fullDateRe = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:19|20)\d{2})\b/g;
  (lines || []).forEach((line) => {
    const target = /\b(vencimento|fechamento|periodo|emissao|ate)\b/.test(normalizeText(line.text)) ? prioritized : remaining;
    let match;
    while ((match = fullDateRe.exec(line.text)) !== null) {
      const iso = parseBrDate(match[1]);
      if (iso) target.push(iso);
    }
  });
  const namedYear = String(filename || "").match(/\b(20\d{2})\b/);
  const anchor = prioritized[prioritized.length - 1] || remaining[remaining.length - 1] || null;
  return {
    anchor,
    year: anchor ? Number(anchor.slice(0, 4)) : (namedYear ? Number(namedYear[1]) : null),
    month: anchor ? Number(anchor.slice(5, 7)) : null,
  };
}

function resolvePdfRowDate(raw, context) {
  const direct = parseBrDate(raw);
  if (direct) return direct;
  const match = String(raw || "").match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
  if (!match || !context || !context.year) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = context.year;
  if (context.month && month - context.month > 6) year--;
  else if (context.month && context.month - month > 6) year++;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isRealIsoDate(iso) ? iso : null;
}

function joinPdfStatementLines(lines) {
  const joined = [];
  let pending = null;
  (lines || []).forEach((line) => {
    const beginsWithDate = PDF_IMPORT_DATE_AT_START_RE.test(line.text);
    const hasMoney = pdfMoneyTokens(line.text).length > 0;
    if (beginsWithDate) {
      if (pending) joined.push(pending);
      pending = { ...line, items: [...(line.items || [])] };
      if (hasMoney) { joined.push(pending); pending = null; }
      return;
    }
    if (pending && line.page === pending.page) {
      pending.text = `${pending.text} ${line.text}`.replace(/\s+/g, " ").trim();
      pending.items.push(...(line.items || []));
      if (hasMoney) { joined.push(pending); pending = null; }
    }
  });
  if (pending) joined.push(pending);
  return joined;
}

function parsePdfStatementLines(lines, filename, pageCount) {
  const profile = detectPdfStatementProfile(lines, filename);
  const context = pdfDateContext(lines, filename);
  const columns = detectPdfAccountColumns(lines);
  const candidates = joinPdfStatementLines(lines);
  const rows = [];
  let skipped = Math.max(0, lines.length - candidates.length);

  candidates.forEach((line) => {
    const match = line.text.match(PDF_IMPORT_DATE_AT_START_RE);
    if (!match) { skipped++; return; }
    const date = resolvePdfRowDate(match[1], context);
    const remainder = match[2] || "";
    const tokens = pdfMoneyTokens(remainder);
    if (!date || !tokens.length) { skipped++; return; }

    const selected = profile.documentKind === "card"
      ? { ...tokens[tokens.length - 1], column: null }
      : selectPdfAccountMoney(tokens, line, columns);
    if (!selected) { skipped++; return; }

    const firstAmountIndex = Math.min(...tokens.map((token) => token.index));
    const description = remainder.slice(0, firstAmountIndex)
      .replace(/[|•]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s:;,-]+$/g, "")
      .trim();
    const normalizedDescription = normalizeText(description);
    const accountNoise = profile.documentKind === "account" && NOISE_RE.test(normalizedDescription);
    if (!description || PDF_IMPORT_NON_TRANSACTION_RE.test(normalizedDescription) || accountNoise) {
      skipped++;
      return;
    }

    let type;
    let nature = null;
    if (profile.documentKind === "card") {
      const isPayment = PDF_IMPORT_PAYMENT_RE.test(normalizedDescription);
      const isRefund = PDF_IMPORT_REFUND_RE.test(normalizedDescription) || (selected.amount < 0 && !isPayment);
      type = isPayment || isRefund ? "income" : "expense";
      if (isRefund) nature = "estorno";
    } else if (selected.column === "debit") {
      type = "expense";
    } else if (selected.column === "credit") {
      type = "income";
    } else if (selected.explicitDirection) {
      type = selected.amount < 0 ? "expense" : "income";
    } else if (PDF_IMPORT_CREDIT_RE.test(normalizedDescription)) {
      type = "income";
    } else if (PDF_IMPORT_DEBIT_RE.test(normalizedDescription)) {
      type = "expense";
    } else {
      type = "expense";
    }

    rows.push({
      date,
      amount: Math.abs(roundMoney(selected.amount)),
      description,
      type,
      nature,
      page: line.page,
    });
  });

  if (!context.year && candidates.some((line) => /^\s*\d{1,2}[\/.\-]\d{1,2}\b/.test(line.text))) {
    throw new ImportError("PDF_DATE_YEAR", "O PDF não informa o ano dos lançamentos.", "Use uma fatura ou um extrato que mostre o período completo.");
  }
  if (!rows.length) {
    throw new ImportError("NO_ROWS", "O PDF foi lido, mas a tabela de lançamentos não foi reconhecida.", "Tente o PDF digital baixado diretamente do banco.");
  }

  return {
    rows,
    format: "pdf",
    skipped,
    bank: profile.bank,
    profile: profile.profile,
    documentKind: profile.documentKind,
    confidence: profile.confidence,
    pageCount: Number(pageCount) || Math.max(...rows.map((row) => row.page || 1)),
  };
}

async function readPdfStatementFile(file, password) {
  let bytes;
  try {
    bytes = await readPdfImportBytes(file);
  } catch (error) {
    throw new ImportError("READ_FAIL", "Não foi possível ler o PDF. Selecione o arquivo novamente.", String(error));
  }
  const signature = Array.from(bytes.slice(0, 5)).map((byte) => String.fromCharCode(byte)).join("");
  if (signature !== "%PDF-") throw new ImportError("PDF_INVALID", "O arquivo não é um PDF válido.");

  let pdfjs;
  try {
    pdfjs = await loadPdfImportLibrary();
  } catch (error) {
    throw new ImportError("PDF_READER_FAIL", "O leitor de PDF não pôde ser carregado.", String(error));
  }

  let loadingTask;
  let documentProxy;
  try {
    loadingTask = pdfjs.getDocument({
      data: bytes,
      password: password || undefined,
      isEvalSupported: false,
      stopAtErrors: false,
      verbosity: 0,
    });
    documentProxy = await loadingTask.promise;
  } catch (error) {
    const passwordError = error && (error.name === "PasswordException" || error.code === 1 || error.code === 2);
    if (passwordError) {
      const incorrect = !!password && error.code === 2;
      throw new ImportError(
        incorrect ? "PDF_PASSWORD_INCORRECT" : "PDF_PASSWORD_REQUIRED",
        incorrect ? "A senha do PDF está incorreta." : "Este PDF é protegido por senha.",
        "Digite a senha para continuar. Ela fica somente neste aparelho."
      );
    }
    throw new ImportError("PDF_INVALID", "Não foi possível abrir o PDF.", String(error));
  }

  try {
    if (documentProxy.numPages > PDF_IMPORT_MAX_PAGES) {
      throw new ImportError("PDF_TOO_MANY_PAGES", `O PDF tem mais de ${PDF_IMPORT_MAX_PAGES} páginas. Exporte um período menor.`);
    }
    const lines = [];
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber++) {
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
      lines.push(...pdfItemsToLines(content.items, pageNumber));
      page.cleanup();
    }
    if (!lines.length || !lines.some((line) => line.text.replace(/\s/g, "").length >= 3)) {
      throw new ImportError("PDF_NO_TEXT", "Este PDF não tem texto selecionável.", "Baixe a versão digital no app do banco. PDF escaneado ou fotografado não funciona nesta importação.");
    }
    return parsePdfStatementLines(lines, file && file.name, documentProxy.numPages);
  } finally {
    if (documentProxy && typeof documentProxy.destroy === "function") await documentProxy.destroy();
    else if (loadingTask && typeof loadingTask.destroy === "function") await loadingTask.destroy();
  }
}
