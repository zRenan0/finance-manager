// js/pdf.js. Escritor de PDF em JavaScript puro; sem biblioteca, sem rede.
// ------------------------------------------------------------------------------
// O aplicativo inteiro é local-first: o extrato que sai daqui não pode ser
// gerado num servidor nem depender de CDN, senão o arquivo com TODOS os gastos
// da pessoa passaria por um terceiro só para virar PDF. Por isso este módulo
// escreve o formato à mão.
//
// Três decisões sustentam o resto:
//
//   1. Só fontes base-14 (Helvetica e Helvetica-Bold). Elas já existem em todo
//      leitor de PDF, então não há fonte para embutir; o arquivo fica em poucos
//      KB e abre igual no celular, no navegador e no Acrobat.
//   2. Texto em WinAnsiEncoding, que cobre o português inteiro (á, ç, õ, “ ”).
//      Cada caractere vira UM byte, e é isso que permite calcular o `xref` do
//      arquivo contando o comprimento da string; sem essa garantia o índice de
//      bytes sairia errado em qualquer descrição com acento e o leitor
//      recusaria o documento.
//   3. Coordenada de tela, não de PDF. A API recebe y crescendo para BAIXO
//      (como todo mundo pensa uma página) e a conversão para o eixo do PDF
//      (origem no canto inferior esquerdo) acontece num lugar só.
//
// Sem compressão de propósito: `FlateDecode` exigiria zlib, e o ganho num
// documento de texto de poucas páginas não paga a dependência.
"use strict";

const PDF_PAGE_A4 = Object.freeze({ width: 595.28, height: 841.89 });

// Larguras dos glifos em milésimos de em, direto das métricas AFM das fontes
// base-14, para os códigos 32 a 126. Sem elas não há como alinhar valores à
// direita nem cortar uma descrição no ponto certo: o app teria de chutar a
// largura do texto, e todo chute erra em "R$ 1.771,44".
const PDF_WIDTHS_REGULAR = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584";
const PDF_WIDTHS_BOLD = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584";

// Caracteres tipográficos que o app usa nos textos ("aspas curvas", travessão)
// e que no WinAnsi moram na faixa 0x80-0x9F, fora do Latin-1. Sem este mapa
// eles virariam "?" justamente nos títulos.
const PDF_WINANSI_EXTRA = Object.freeze({
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A,
  "‹": 0x8B, "Œ": 0x8C, "Ž": 0x8E, "‘": 0x91, "’": 0x92,
  "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B, "œ": 0x9C,
  "ž": 0x9E, "Ÿ": 0x9F,
});

// Sinais que não existem em WinAnsi mas aparecem no app (o menos tipográfico
// dos valores negativos, a seta dos textos de transferência). Sem este mapa
// eles viravam "?" bem em cima do valor; e "?R$ 370,20" é pior que nada.
const PDF_ASCII_FALLBACK = Object.freeze({
  "−": "-", "‑": "-", "‒": "-", "→": "->", "←": "<-", "≈": "~", "≤": "<=", "≥": ">=",
});

// Tabela de largura por código de byte (0-255). Os acentuados do Latin-1 são
// resolvidos pela decomposição Unicode: em Helvetica o "á" tem exatamente a
// largura do "a", então basta perguntar pela letra-base.
function buildPdfWidthTable(spec) {
  const values = spec.split(" ").map(Number);
  const table = new Array(256).fill(500);
  for (let i = 0; i < values.length; i++) table[32 + i] = values[i];
  for (let code = 0xA0; code <= 0xFF; code++) {
    const base = String.fromCharCode(code).normalize("NFD")[0];
    const baseCode = base ? base.charCodeAt(0) : 0;
    table[code] = baseCode >= 32 && baseCode <= 126 ? table[baseCode] : 556;
  }
  table[0xA0] = table[32];   // espaço não separável mede como espaço
  return table;
}

const PDF_WIDTH_TABLES = Object.freeze({
  F1: buildPdfWidthTable(PDF_WIDTHS_REGULAR),
  F2: buildPdfWidthTable(PDF_WIDTHS_BOLD),
});

// Texto do app (UTF-16 do JavaScript) para bytes WinAnsi. O que não existe na
// codificação perde o acento antes de virar "?", porque "Sao Paulo" ainda se
// lê e "S?o Paulo" não.
function pdfEncodeText(value) {
  const input = String(value == null ? "" : value);
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0);
    if (code >= 32 && code <= 126) { out += char; continue; }
    if (code >= 0xA0 && code <= 0xFF) { out += char; continue; }
    if (Object.prototype.hasOwnProperty.call(PDF_WINANSI_EXTRA, char)) {
      out += String.fromCharCode(PDF_WINANSI_EXTRA[char]);
      continue;
    }
    if (code === 9) { out += " "; continue; }
    if (Object.prototype.hasOwnProperty.call(PDF_ASCII_FALLBACK, char)) { out += PDF_ASCII_FALLBACK[char]; continue; }
    const stripped = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fallback = stripped && stripped.charCodeAt(0) <= 0xFF ? stripped : "?";
    out += fallback.length === 1 ? fallback : "?";
  }
  return out;
}

// String literal do PDF. Fora da faixa imprimível tudo vira escape octal: o
// arquivo inteiro fica em ASCII, e aí o deslocamento em bytes de cada objeto é
// simplesmente o comprimento da string acumulada.
function pdfEscapeString(value) {
  let out = "";
  const encoded = pdfEncodeText(value);
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i);
    const char = encoded[i];
    if (char === "(" || char === ")" || char === "\\") { out += "\\" + char; continue; }
    if (code < 32 || code > 126) { out += "\\" + code.toString(8).padStart(3, "0"); continue; }
    out += char;
  }
  return out;
}

function pdfMeasureText(value, sizePt, bold) {
  const table = PDF_WIDTH_TABLES[bold ? "F2" : "F1"];
  const encoded = pdfEncodeText(value);
  let total = 0;
  for (let i = 0; i < encoded.length; i++) total += table[encoded.charCodeAt(i)] || 500;
  return (total / 1000) * (sizePt || 10);
}

// Corta no limite de largura e devolve com reticências. Trabalha em cima do
// texto já codificado para não cortar no meio de um par substituto.
function pdfEllipsize(value, maxWidth, sizePt, bold) {
  const text = String(value == null ? "" : value);
  if (!text || pdfMeasureText(text, sizePt, bold) <= maxWidth) return text;
  const ellipsis = "…";
  let cut = text;
  while (cut.length > 1 && pdfMeasureText(cut + ellipsis, sizePt, bold) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd() + ellipsis;
}

// Quebra em linhas respeitando a largura. Palavra maior que a linha inteira é
// cortada com reticências em vez de estourar a margem.
function pdfWrapText(value, maxWidth, sizePt, bold) {
  const words = String(value == null ? "" : value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (pdfMeasureText(candidate, sizePt, bold) <= maxWidth) { line = candidate; return; }
    if (line) lines.push(line);
    line = pdfMeasureText(word, sizePt, bold) <= maxWidth ? word : pdfEllipsize(word, maxWidth, sizePt, bold);
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// Cor em #rrggbb (ou "r,g,b" já normalizado) para os três números que o PDF
// espera. Aceita o formato do CSS porque é de lá que os valores vêm.
function pdfColor(value) {
  const raw = String(value == null ? "#000000" : value).trim();
  const hex = raw.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16) / 255, parseInt(hex[1] + hex[1], 16) / 255, parseInt(hex[2] + hex[2], 16) / 255];
  }
  return [0, 0, 0];
}

function pdfNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return (Math.round(n * 100) / 100).toString();
}

// ------------------------------------------------------------------------------
// DOCUMENTO
// ------------------------------------------------------------------------------
// Cada página é uma lista de operadores de conteúdo já formatados. Guardar por
// página (em vez de escrever direto num buffer) é o que permite voltar depois
// para carimbar "Página 3 de 7": o total só existe quando o documento acaba.
function createPdfDocument(options) {
  const opts = options || {};
  const size = opts.size || PDF_PAGE_A4;
  const pages = [[]];
  let current = 0;

  function ops() { return pages[current]; }
  function toPdfY(y) { return size.height - y; }

  const doc = {
    width: size.width,
    height: size.height,
    margin: opts.margin == null ? 38 : opts.margin,
    get contentWidth() { return doc.width - doc.margin * 2; },
    get pageCount() { return pages.length; },
    get pageIndex() { return current; },

    addPage() {
      pages.push([]);
      current = pages.length - 1;
      return doc;
    },
    goToPage(index) {
      if (index >= 0 && index < pages.length) current = index;
      return doc;
    },

    measure(text, sizePt, bold) { return pdfMeasureText(text, sizePt, bold); },
    wrap(text, maxWidth, sizePt, bold) { return pdfWrapText(text, maxWidth, sizePt, bold); },

    text(value, x, y, config) {
      const cfg = config || {};
      const sizePt = cfg.size || 10;
      const bold = !!cfg.bold;
      const raw = String(value == null ? "" : value);
      const content = cfg.maxWidth ? pdfEllipsize(raw, cfg.maxWidth, sizePt, bold) : raw;
      if (!content) return doc;
      const width = pdfMeasureText(content, sizePt, bold);
      const left = cfg.align === "right" ? x - width : cfg.align === "center" ? x - width / 2 : x;
      const [r, g, b] = pdfColor(cfg.color || "#111111");
      ops().push(`BT /${bold ? "F2" : "F1"} ${pdfNum(sizePt)} Tf ${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} rg ${pdfNum(left)} ${pdfNum(toPdfY(y))} Td (${pdfEscapeString(content)}) Tj ET`);
      return doc;
    },

    rect(x, y, width, height, config) {
      const cfg = config || {};
      const [r, g, b] = pdfColor(cfg.color || "#eeeeee");
      if (cfg.stroke) {
        ops().push(`${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} RG ${pdfNum(cfg.lineWidth || 0.6)} w ${pdfNum(x)} ${pdfNum(toPdfY(y + height))} ${pdfNum(width)} ${pdfNum(height)} re S`);
      } else {
        ops().push(`${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} rg ${pdfNum(x)} ${pdfNum(toPdfY(y + height))} ${pdfNum(width)} ${pdfNum(height)} re f`);
      }
      return doc;
    },

    line(x1, y1, x2, y2, config) {
      const cfg = config || {};
      const [r, g, b] = pdfColor(cfg.color || "#dddddd");
      ops().push(`${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} RG ${pdfNum(cfg.width || 0.6)} w ${pdfNum(x1)} ${pdfNum(toPdfY(y1))} m ${pdfNum(x2)} ${pdfNum(toPdfY(y2))} l S`);
      return doc;
    },

    build() { return assemblePdf(pages, size, opts); },
  };

  return doc;
}

// Monta o arquivo. A ordem dos objetos é fixa e o `xref` é calculado contando o
// que já foi escrito; por isso nada aqui pode virar multibyte.
function assemblePdf(pages, size, opts) {
  const objects = [];
  const pageObjectStart = 5;                        // 1 catálogo, 2 páginas, 3-4 fontes
  const pageIds = pages.map((_, i) => pageObjectStart + i * 2);
  const contentIds = pages.map((_, i) => pageObjectStart + i * 2 + 1);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((page, i) => {
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNum(size.width)} ${pdfNum(size.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
    const stream = page.join("\n");
    objects[contentIds[i]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  const infoId = pageObjectStart + pages.length * 2;
  const stamp = pdfTimestamp(opts.date);
  objects[infoId] = `<< /Title (${pdfEscapeString(opts.title || "Extrato")}) /Author (${pdfEscapeString(opts.author || "Cofre")}) /Creator (${pdfEscapeString(opts.creator || "Cofre; organizador financeiro")}) /Producer (${pdfEscapeString(opts.creator || "Cofre; organizador financeiro")}) /CreationDate (${stamp}) /ModDate (${stamp}) >>`;

  let file = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id <= infoId; id++) {
    offsets[id] = file.length;
    file += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = file.length;
  let xref = `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= infoId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  file += xref;
  file += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xFF;
  return bytes;
}

function pdfTimestamp(date) {
  const d = date instanceof Date ? date : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ==============================================================================
// EXTRATO EM PDF
// ------------------------------------------------------------------------------
// A composição recebe LINHAS PRONTAS, não o banco do app. Quem sabe o que é uma
// transação é o app.js; quem sabe desenhar uma página é este arquivo. Essa
// fronteira é o que permite testar o layout no Node sem montar um estado
// inteiro, e evita que uma mudança no formato do lançamento quebre o gerador.
//
// A paleta é sempre a clara. O PDF vai para papel branco (ou para a tela de
// outra pessoa): imprimir o tema escuro gastaria toner e sairia ilegível.
// ==============================================================================
const PDF_STATEMENT_INK = "#0B1512";
const PDF_STATEMENT_SOFT = "#55655F";
const PDF_STATEMENT_BRAND = "#0B6B5C";
const PDF_STATEMENT_POSITIVE = "#0E8A6E";
const PDF_STATEMENT_NEGATIVE = "#BE443B";
const PDF_STATEMENT_BORDER = "#E2E8E5";
const PDF_STATEMENT_ZEBRA = "#F6F8F7";
const PDF_STATEMENT_BAND = "#E2EFEB";

const PDF_STATEMENT_ROW_H = 16;
const PDF_STATEMENT_FOOTER_H = 46;

function pdfStatementColumns(doc) {
  const left = doc.margin;
  const right = doc.width - doc.margin;
  return {
    date: { x: left, width: 48 },
    description: { x: left + 56, width: 188 },
    category: { x: left + 248, width: 92 },
    account: { x: left + 344, width: 84 },
    amount: { x: right, width: right - (left + 432) },
    left, right,
  };
}

function drawPdfStatementFooter(doc, index, total, note) {
  const cols = pdfStatementColumns(doc);
  const y = doc.height - PDF_STATEMENT_FOOTER_H + 12;
  doc.line(cols.left, y - 10, cols.right, y - 10, { color: PDF_STATEMENT_BORDER, width: 0.6 });
  doc.text(note, cols.left, y + 2, { size: 7.4, color: PDF_STATEMENT_SOFT, maxWidth: cols.right - cols.left - 90 });
  doc.text(`Página ${index + 1} de ${total}`, cols.right, y + 2, { size: 7.4, color: PDF_STATEMENT_SOFT, align: "right" });
}

// Cabeçalho completo (primeira página) e o reduzido das seguintes. Repetir o
// período em toda página não é enfeite: extrato impresso costuma ser lido
// folha a folha, longe da primeira.
function drawPdfStatementHeader(doc, input, first) {
  const cols = pdfStatementColumns(doc);
  let y = doc.margin + 14;

  doc.text(input.title || "Extrato de movimentações", cols.left, y, { size: first ? 17 : 12, bold: true, color: PDF_STATEMENT_INK });
  doc.text(input.brand || "Cofre", cols.right, y, { size: first ? 12 : 10, bold: true, color: PDF_STATEMENT_BRAND, align: "right" });
  y += first ? 16 : 12;

  if (input.subtitle) {
    doc.text(input.subtitle, cols.left, y, { size: 9, color: PDF_STATEMENT_SOFT, maxWidth: cols.right - cols.left - 150 });
  }
  if (input.generatedLabel) {
    doc.text(input.generatedLabel, cols.right, y, { size: 8, color: PDF_STATEMENT_SOFT, align: "right" });
  }
  y += first ? 14 : 10;

  if (first && input.filtersLabel) {
    doc.text(input.filtersLabel, cols.left, y, { size: 8, color: PDF_STATEMENT_SOFT, maxWidth: cols.right - cols.left });
    y += 12;
  }

  if (first && Array.isArray(input.summary) && input.summary.length) {
    const boxH = 42;
    const gap = 8;
    const boxW = (cols.right - cols.left - gap * (input.summary.length - 1)) / input.summary.length;
    input.summary.forEach((item, i) => {
      const x = cols.left + i * (boxW + gap);
      doc.rect(x, y, boxW, boxH, { color: i === 0 ? PDF_STATEMENT_BAND : PDF_STATEMENT_ZEBRA });
      doc.text(item.label, x + 9, y + 15, { size: 7.6, color: PDF_STATEMENT_SOFT, maxWidth: boxW - 18 });
      doc.text(item.value, x + 9, y + 31, { size: 11.5, bold: true, color: pdfStatementTone(item.tone), maxWidth: boxW - 18 });
    });
    y += boxH + 14;
  }

  return y;
}

function pdfStatementTone(tone) {
  if (tone === "income") return PDF_STATEMENT_POSITIVE;
  if (tone === "expense") return PDF_STATEMENT_NEGATIVE;
  if (tone === "brand") return PDF_STATEMENT_BRAND;
  return PDF_STATEMENT_INK;
}

function drawPdfStatementTableHead(doc, y) {
  const cols = pdfStatementColumns(doc);
  doc.rect(cols.left, y, cols.right - cols.left, 18, { color: PDF_STATEMENT_BAND });
  const baseline = y + 12.5;
  doc.text("DATA", cols.date.x + 6, baseline, { size: 7.2, bold: true, color: PDF_STATEMENT_BRAND });
  doc.text("DESCRIÇÃO", cols.description.x, baseline, { size: 7.2, bold: true, color: PDF_STATEMENT_BRAND });
  doc.text("CATEGORIA", cols.category.x, baseline, { size: 7.2, bold: true, color: PDF_STATEMENT_BRAND });
  doc.text("CONTA / CARTÃO", cols.account.x, baseline, { size: 7.2, bold: true, color: PDF_STATEMENT_BRAND });
  doc.text("VALOR", cols.right - 6, baseline, { size: 7.2, bold: true, color: PDF_STATEMENT_BRAND, align: "right" });
  return y + 18;
}

function buildStatementPdf(input) {
  const data = input || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const note = data.note || "Gerado no seu próprio aparelho. Documento de conferência: não tem valor fiscal.";
  const doc = createPdfDocument({ title: data.title || "Extrato", author: data.brand || "Cofre", date: data.date });
  const cols = pdfStatementColumns(doc);
  const bottom = doc.height - PDF_STATEMENT_FOOTER_H - 6;

  let y = drawPdfStatementHeader(doc, data, true);
  y = drawPdfStatementTableHead(doc, y);

  if (!rows.length) {
    doc.text(data.emptyLabel || "Nenhum movimento no período selecionado.", cols.left, y + 20, { size: 9.5, color: PDF_STATEMENT_SOFT });
    y += 34;
  }

  let previousDate = null;
  let zebra = false;
  rows.forEach((row) => {
    if (y + PDF_STATEMENT_ROW_H > bottom) {
      doc.addPage();
      y = drawPdfStatementHeader(doc, data, false);
      y = drawPdfStatementTableHead(doc, y);
      previousDate = null;
      zebra = false;
    }
    if (zebra) doc.rect(cols.left, y, cols.right - cols.left, PDF_STATEMENT_ROW_H, { color: PDF_STATEMENT_ZEBRA });
    // Régua fina quando o dia vira: é o que faz o olho encontrar "quinta-feira"
    // numa página com quarenta linhas.
    if (previousDate && row.date !== previousDate) {
      doc.line(cols.left, y, cols.right, y, { color: PDF_STATEMENT_BORDER, width: 0.5 });
    }
    const baseline = y + 11;
    doc.text(row.date || "", cols.date.x + 6, baseline, { size: 8.2, color: PDF_STATEMENT_SOFT, maxWidth: cols.date.width });
    doc.text(row.description || "", cols.description.x, baseline, { size: 8.6, color: PDF_STATEMENT_INK, maxWidth: cols.description.width });
    doc.text(row.category || "", cols.category.x, baseline, { size: 8, color: PDF_STATEMENT_SOFT, maxWidth: cols.category.width });
    doc.text(row.account || "", cols.account.x, baseline, { size: 8, color: PDF_STATEMENT_SOFT, maxWidth: cols.account.width });
    doc.text(row.amount || "", cols.right - 6, baseline, { size: 8.8, bold: true, color: pdfStatementTone(row.tone), align: "right" });
    previousDate = row.date;
    zebra = !zebra;
    y += PDF_STATEMENT_ROW_H;
  });

  doc.line(cols.left, y, cols.right, y, { color: PDF_STATEMENT_BORDER, width: 0.8 });
  y += 6;

  if (data.totalLabel) {
    doc.text(data.totalLabel, cols.left, y + 12, { size: 9, bold: true, color: PDF_STATEMENT_INK });
    doc.text(data.totalValue || "", cols.right - 6, y + 12, { size: 9, bold: true, color: pdfStatementTone(data.totalTone), align: "right" });
    y += 22;
  }

  const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
  if (breakdown.length) {
    const needed = 34 + breakdown.length * 14;
    if (y + needed > bottom) { doc.addPage(); y = drawPdfStatementHeader(doc, data, false); }
    y += 16;
    doc.text(data.breakdownTitle || "Saídas por categoria", cols.left, y, { size: 10.5, bold: true, color: PDF_STATEMENT_INK });
    y += 12;
    const barLeft = cols.left + 170;
    const barMax = cols.right - barLeft - 96;
    breakdown.forEach((item) => {
      if (y + 14 > bottom) { doc.addPage(); y = drawPdfStatementHeader(doc, data, false) + 6; }
      doc.text(item.label, cols.left, y + 9, { size: 8.6, color: PDF_STATEMENT_INK, maxWidth: 164 });
      const pct = Math.max(0, Math.min(100, Number(item.pct) || 0));
      doc.rect(barLeft, y + 3.5, barMax, 6, { color: PDF_STATEMENT_ZEBRA });
      if (pct > 0) doc.rect(barLeft, y + 3.5, Math.max((barMax * pct) / 100, 1.5), 6, { color: item.color || PDF_STATEMENT_BRAND });
      doc.text(`${pct.toFixed(0)}%`, barLeft + barMax + 26, y + 9, { size: 7.8, color: PDF_STATEMENT_SOFT, align: "right" });
      doc.text(item.value, cols.right - 6, y + 9, { size: 8.6, color: PDF_STATEMENT_INK, align: "right" });
      y += 14;
    });
  }

  // As observações são um bloco só. Quebradas parágrafo a parágrafo, elas
  // abriam uma página nova para duas linhas de rodapé legal e o extrato
  // terminava com meia folha em branco; num arquivo que vai para a impressora
  // isso é papel. Quando ainda assim não couberem, a página que sobra recebe
  // o título "Observações": aí ela é uma página com propósito, e não uma
  // folha que parece ter sobrado por defeito.
  const notes = (Array.isArray(data.notes) ? data.notes : []).map((paragraph) => doc.wrap(paragraph, cols.right - cols.left, 7.8, false));
  if (notes.length) {
    const height = 26 + notes.reduce((total, lines) => total + lines.length * 10 + 4, 0);
    if (y + height > bottom) { doc.addPage(); y = drawPdfStatementHeader(doc, data, false); }
    y += 16;
    doc.text(data.notesTitle || "Observações", cols.left, y, { size: 9.5, bold: true, color: PDF_STATEMENT_INK });
    y += 12;
    notes.forEach((lines) => {
      lines.forEach((line) => {
        doc.text(line, cols.left, y, { size: 7.8, color: PDF_STATEMENT_SOFT });
        y += 10;
      });
      y += 4;
    });
  }

  const total = doc.pageCount;
  for (let i = 0; i < total; i++) {
    doc.goToPage(i);
    drawPdfStatementFooter(doc, i, total, note);
  }
  return doc.build();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PDF_PAGE_A4, createPdfDocument, pdfEncodeText, pdfEscapeString,
    pdfMeasureText, pdfEllipsize, pdfWrapText, pdfColor, buildStatementPdf,
  };
}
