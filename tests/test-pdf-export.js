// test-pdf-export.js; escritor de PDF (js/pdf.js) e o extrato que sai dele.
// ------------------------------------------------------------------------------
// O que este teste protege:
//
//   1. O ARQUIVO PRECISA ABRIR. PDF é formato com índice de bytes: o `xref`
//      aponta o deslocamento exato de cada objeto. Se qualquer caractere do
//      documento ocupar dois bytes, todos os deslocamentos seguintes saem
//      errados e o leitor recusa o arquivo inteiro. Como as descrições vêm do
//      extrato do banco (acentos, cedilha, aspas curvas), essa é a falha mais
//      provável e a mais difícil de perceber sem abrir o PDF.
//   2. NADA PODE VIRAR "?" EM CIMA DO VALOR. O aplicativo escreve "−R$ 370,20"
//      com sinal tipográfico; ele não existe em WinAnsi e virava interrogação
//      exatamente no número.
//   3. O EXTRATO SAI COMO ESTÁ NA TELA. O PDF é gerado a partir dos mesmos
//      filtros da tela de Movimentações; exportar outro recorte tornaria o
//      arquivo impossível de conferir.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const { SOURCES } = require(path.join(ROOT, "scripts/build-app-module.js"));

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`); }
}

/* ============================================================= 1. O ESCRITOR */
console.log("\n1. Escritor de PDF");
const P = require(path.join(ROOT, "js/pdf.js"));

{
  const doc = P.createPdfDocument({ title: "Extrato" });
  doc.text("Ação, coração e cedilha", 40, 60, { size: 12, bold: true });
  doc.text("R$ 1.771,44", 555, 90, { size: 10, align: "right" });
  doc.rect(40, 100, 515, 20, { color: "#eef3f2" });
  doc.line(40, 130, 555, 130);
  doc.addPage();
  doc.text("Segunda página", 40, 60, { size: 11 });
  const bytes = doc.build();
  const file = Buffer.from(bytes).toString("latin1");

  check("gera bytes", bytes instanceof Uint8Array && bytes.length > 600);
  check("cabeçalho do formato", file.startsWith("%PDF-1.4"));
  check("termina com o marcador de fim", /%%EOF\s*$/.test(file));
  check("as duas páginas entram no catálogo", /\/Count 2\b/.test(file));
  check("as fontes são base-14, sem arquivo embutido",
    /\/BaseFont \/Helvetica\b/.test(file) && /\/BaseFont \/Helvetica-Bold\b/.test(file) && !/\/FontFile/.test(file));
  check("o texto usa WinAnsi", /\/Encoding \/WinAnsiEncoding/.test(file));

  // O ponto crítico: cada deslocamento do xref tem de cair exatamente no
  // começo do objeto que ele promete.
  const startxref = Number((file.match(/startxref\s+(\d+)/) || [])[1]);
  check("startxref aponta para a tabela", file.slice(startxref, startxref + 4) === "xref");
  const linhas = [...file.slice(startxref).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  const desalinhados = linhas.filter((offset, i) => !file.slice(offset).startsWith(`${i + 1} 0 obj`));
  check(`todos os ${linhas.length} objetos alinhados com o índice`, desalinhados.length === 0, desalinhados);

  // Um byte por caractere é a premissa do cálculo acima.
  check("nenhum byte acima de 255 no arquivo", bytes.every((b) => b <= 255));
  check("o arquivo é ASCII puro (acento vira escape octal)",
    !/[^\x00-\x7f]/.test(file) && /\\347/.test(file));
}

{
  check("acento vira byte WinAnsi", P.pdfEncodeText("ação") === "ação");
  check("aspas curvas viram os bytes 0x93 e 0x94 do WinAnsi",
    P.pdfEncodeText("“x”").charCodeAt(0) === 0x93 && P.pdfEncodeText("“x”").charCodeAt(2) === 0x94);
  // Este era o defeito visível: "?R$ 370,20" no lugar do valor negativo.
  check("sinal de menos tipográfico vira hífen, não interrogação",
    P.pdfEncodeText("−R$ 10,00") === "-R$ 10,00");
  check("caractere fora da codificação perde o acento em vez de sumir",
    P.pdfEncodeText("ĥ") === "h");
  check("emoji não derruba a escrita", P.pdfEncodeText("a\u{1F600}b") === "a?b");
  check("parêntese e barra são escapados", P.pdfEscapeString("a(b)c\\d") === "a\\(b\\)c\\\\d");

  check("largura acompanha o tamanho da fonte",
    Math.abs(P.pdfMeasureText("ABC", 20, false) - P.pdfMeasureText("ABC", 10, false) * 2) < 0.01);
  check("negrito é mais largo que o normal",
    P.pdfMeasureText("Padaria", 10, true) > P.pdfMeasureText("Padaria", 10, false));
  check("acento mede como a letra-base",
    Math.abs(P.pdfMeasureText("acao", 10, false) - P.pdfMeasureText("ação", 10, false)) < 0.01);
  // `toLocaleString` devolve "R$" seguido de espaço NÃO separável; medi-lo
  // como zero desalinharia todos os valores da coluna à direita.
  check("espaço não separável do R$ mede como espaço comum",
    Math.abs(P.pdfMeasureText("R$ 10", 10, false) - P.pdfMeasureText("R$ 10", 10, false)) < 0.01);

  const cortado = P.pdfEllipsize("Supermercado Bom Preço Unidade Centro", 80, 9, false);
  check("corte cabe na largura pedida", P.pdfMeasureText(cortado, 9, false) <= 80, cortado);
  check("corte avisa que cortou", cortado.endsWith("…"));
  check("texto que já cabe não é tocado", P.pdfEllipsize("Padaria", 200, 9, false) === "Padaria");

  const linhas = P.pdfWrapText("Documento de conferência gerado a partir dos lançamentos deste aparelho.", 120, 8, false);
  check("quebra em mais de uma linha", linhas.length > 1);
  check("nenhuma linha estoura a largura", linhas.every((l) => P.pdfMeasureText(l, 8, false) <= 120));
  check("texto vazio devolve uma linha vazia", JSON.stringify(P.pdfWrapText("", 100, 8, false)) === '[""]');
}

{
  // Sem linha nenhuma o documento ainda precisa existir: exportar um período
  // vazio não pode gerar arquivo corrompido.
  const vazio = P.buildStatementPdf({ title: "Extrato", rows: [] });
  check("extrato sem linhas gera PDF válido",
    Buffer.from(vazio).toString("latin1").startsWith("%PDF-1.4") && vazio.length > 400);

  const muitas = P.buildStatementPdf({
    title: "Extrato",
    summary: [{ label: "Entradas", value: "R$ 10,00", tone: "income" }],
    rows: Array.from({ length: 120 }, (_, i) => ({
      date: `${String((i % 28) + 1).padStart(2, "0")}/08/2026`,
      description: `Compra número ${i} com descrição longa o suficiente para precisar de corte`,
      category: "Alimentação", account: "Conta corrente", amount: "-R$ 10,00", tone: "expense",
    })),
    breakdown: [{ label: "Alimentação", value: "R$ 1.200,00", pct: 100, color: "#0B6B5C" }],
    notes: ["Documento de conferência."],
  });
  const arquivo = Buffer.from(muitas).toString("latin1");
  const paginas = Number((arquivo.match(/\/Count (\d+)/) || [])[1]);
  check("120 linhas quebram em várias páginas", paginas >= 3, paginas);
  check("cada página recebe o rodapé numerado",
    (arquivo.match(/P\\341gina \d+ de \d+/g) || []).length === paginas);
  const desalinhados = [...arquivo.slice(Number((arquivo.match(/startxref\s+(\d+)/) || [])[1])).matchAll(/^(\d{10}) 00000 n /gm)]
    .map((m) => Number(m[1]))
    .filter((offset, i) => !arquivo.slice(offset).startsWith(`${i + 1} 0 obj`));
  check("índice continua correto no documento grande", desalinhados.length === 0, desalinhados);
}

/* ====================================================== 2. EXPORTAÇÃO NO APP */
console.log("\n2. Extrato exportado pelo aplicativo");

function fakeEl(tag) {
  return {
    tagName: (tag || "div").toUpperCase(), innerHTML: "", value: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
}

const ctx = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: {
    documentElement: fakeEl(), body: fakeEl(),
    getElementById() { return fakeEl(); }, querySelector() { return fakeEl(); },
    querySelectorAll() { return []; }, createElement(t) { return fakeEl(t); },
    addEventListener() {}, removeEventListener() {}, activeElement: null, visibilityState: "visible",
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0), requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined, module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  history: { state: null, pushState() {}, replaceState() {}, go() {}, length: 1 },
  alert() {}, prompt() { return null; },
  __baixados: [],
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
SOURCES.forEach((file) => vm.runInContext(readSrc(file), ctx, { filename: file }));
const run = (code) => vm.runInContext(code, ctx);

run(`
  state.data = migrate(defaultData());
  state.booting = false;
  downloadFile = function (name, content, mime) { __baixados.push({ name, content, mime }); };
`);

run(`
  const conta = makeAccount({ name: "Conta corrente", type: "corrente", openingBalance: 1000, openingDate: "2026-07-01" });
  state.data = { ...state.data, accounts: [conta], transactions: [
    makeTransaction({ type: "expense", amount: 52.9, categoryId: "delivery", date: "2026-08-10", description: "IFD*IFOOD", source: "import-csv", accountId: conta.id }),
    makeTransaction({ type: "expense", amount: 240.15, categoryId: "mercado", date: "2026-08-11", description: "Supermercado Bom Preço", source: "manual", accountId: conta.id }),
    makeTransaction({ type: "income", amount: 3200, categoryId: "outros", date: "2026-08-05", description: "Salário", source: "manual", accountId: conta.id }),
    makeTransaction({ type: "expense", amount: 99.9, categoryId: "lazer", date: "2026-06-15", description: "Cinema (mês anterior)", source: "manual", accountId: conta.id }),
  ] };
  state.analyticsPeriod = "custom";
  state.analyticsCustomStart = "2026-08-01";
  state.analyticsCustomEnd = "2026-08-31";
  state.analyticsSearch = "";
  state.movementFilters = { type: "all", categoryId: "", accountId: "", source: "" };
`);

run(`exportStatementPdf()`);
{
  const baixado = ctx.__baixados[ctx.__baixados.length - 1];
  check("um arquivo foi entregue", !!baixado);
  check("com extensão e tipo de PDF",
    /^extrato-.*\.pdf$/.test(baixado.name) && baixado.mime === "application/pdf", baixado && baixado.name);
  const arquivo = Buffer.from(baixado.content).toString("latin1");
  check("o conteúdo é mesmo um PDF", arquivo.startsWith("%PDF-1.4"));
  check("o período pedido vira subtítulo", /De 01\/08\/2026 at\\351 31\/08\/2026/.test(arquivo));
  check("as linhas do período entram", /IFD\*IFOOD/.test(arquivo) && /Sal\\341rio/.test(arquivo));
  // O recorte é o da tela: o que está fora do período não pode aparecer.
  check("o que está fora do período fica fora", !/Cinema/.test(arquivo));
  check("o resumo traz entradas e saídas", /Entradas/.test(arquivo) && /Sa\\355das/.test(arquivo));
  check("o rodapé diz que o arquivo não tem valor fiscal", /valor fiscal/.test(arquivo));
}

// Filtro da tela vale para o arquivo: exportar mais do que a pessoa está vendo
// seria uma surpresa desagradável num documento que ela vai enviar a alguém.
run(`state.movementFilters = { type: "expense", categoryId: "", accountId: "", source: "" }; exportStatementPdf();`);
{
  const arquivo = Buffer.from(ctx.__baixados[ctx.__baixados.length - 1].content).toString("latin1");
  check("filtro de tipo é respeitado", /IFD\*IFOOD/.test(arquivo) && !/Sal\\341rio/.test(arquivo));
  check("o filtro aplicado aparece escrito no documento", /Filtros aplicados/.test(arquivo));
}

// Período vazio avisa em vez de baixar um arquivo em branco.
run(`
  state.movementFilters = { type: "all", categoryId: "", accountId: "", source: "" };
  state.analyticsCustomStart = "2020-01-01"; state.analyticsCustomEnd = "2020-01-31";
  state.toast = null;
`);
{
  const antes = ctx.__baixados.length;
  run(`exportStatementPdf()`);
  check("período sem movimento não gera arquivo", ctx.__baixados.length === antes);
  check("e explica por quê", /Nenhum movimento/.test(run(`String(state.toast || "")`)));
}

// A tela precisa oferecer o botão; sem isso o recurso existe e ninguém acha.
{
  run(`state.tab = "analytics"; state.analyticsView = "movements"; state.analyticsPeriod = "mes";`);
  const tela = run(`renderAnalyticsScreen()`);
  check("Movimentações mostra o botão de PDF", /data-action="export-statement-pdf"/.test(tela));
  const ajustes = run(`renderBackupCard()`);
  check("Ajustes também oferece o extrato em PDF", /data-action="export-statement-pdf"/.test(ajustes));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
