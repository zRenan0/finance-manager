// test-pdf-import.js. Leitor local de faturas e extratos em PDF.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const PdfWriter = require(path.join(__dirname, "..", "js", "pdf.js"));

const ROOT = path.join(__dirname, "..");
const readSrc = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`); }
}

function section(label) { console.log(`\n${label}`); }

const ctx = {
  console,
  module: { exports: {} },
  URL,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  Blob,
  crypto: globalThis.crypto,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  indexedDB: undefined,
  localStorage: undefined,
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  document: {
    baseURI: pathToFileURL(path.join(ROOT, "index.html")).href,
    addEventListener() {},
    visibilityState: "visible",
  },
  addEventListener() {},
  removeEventListener() {},
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

const imports = (specifier) => import(specifier);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/import.js", "js/pdf-import.js"]
  .forEach((file) => {
    const script = new vm.Script(readSrc(file), { filename: file, importModuleDynamically: imports });
    script.runInContext(ctx);
  });
const run = (code) => vm.runInContext(code, ctx);

function line(text, page, items) {
  return { text, page: page || 1, y: 700, items: items || [{ text, x: 40, y: 700, width: text.length * 5, height: 10 }] };
}

(async () => {
  section("1. Reconstrução das linhas");
  ctx.__items = [
    { str: "123,45", transform: [1, 0, 0, 10, 350, 700], width: 38, height: 10 },
    { str: "18/08", transform: [1, 0, 0, 10, 40, 700.6], width: 30, height: 10 },
    { str: "MERCADO SAO JOSE", transform: [1, 0, 0, 10, 90, 699.4], width: 110, height: 10 },
    { str: "segunda linha", transform: [1, 0, 0, 10, 40, 680], width: 70, height: 10 },
  ];
  const grouped = run("pdfItemsToLines(__items, 1)");
  check("itens próximos viram a mesma linha", grouped.length === 2, grouped);
  check("a linha fica da esquerda para a direita", grouped[0].text === "18/08 MERCADO SAO JOSE 123,45", grouped[0].text);
  check("a página é preservada", grouped.every((item) => item.page === 1));

  section("2. Fatura Santander");
  ctx.__santander = [
    line("Santander", 1),
    line("Fatura do cartão final 4455", 1),
    line("Vencimento 10/09/2026", 1),
    line("18/08 MERCADO SAO JOSE 123,45", 1),
    line("19/08 IFD*IFOOD 52,90", 1),
    line("20/08 Estorno LOJA TESTE -20,00", 1),
    line("21/08 Pagamento recebido 500,00", 1),
    line("22/08 Saldo da fatura anterior 300,00", 1),
    line("Total da fatura 956,35", 1),
  ];
  const santander = run("parsePdfStatementLines(__santander, 'fatura-santander.pdf', 1)");
  check("Santander é reconhecido", santander.bank === "Santander" && santander.profile === "santander", santander);
  check("o documento é reconhecido como fatura", santander.documentKind === "card", santander.documentKind);
  check("datas sem ano usam o vencimento", santander.rows[0].date === "2026-08-18", santander.rows[0]);
  check("compras positivas entram como gasto", santander.rows.find((row) => row.description.includes("MERCADO")).type === "expense");
  const refund = santander.rows.find((row) => row.description.includes("Estorno"));
  check("crédito da fatura entra como estorno", refund.type === "income" && refund.nature === "estorno", refund);
  check("total da fatura não vira compra", !santander.rows.some((row) => /Total/.test(row.description)));

  ctx.__data = run("defaultData()");
  ctx.__prepared = run("prepareImportRows(__santanderParsed = parsePdfStatementLines(__santander, 'fatura-santander.pdf', 1), 'fatura-santander.pdf', __data)");
  check("pagamento da própria fatura vem desmarcado",
    ctx.__prepared.find((row) => row.role === "card-payment").include === false);
  check("saldo anterior vem desmarcado",
    ctx.__prepared.find((row) => row.role === "carryover").include === false);

  section("3. Extrato bancário por colunas");
  ctx.__accountLines = [
    line("Extrato conta corrente período 01/08/2026 a 31/08/2026", 1),
    line("Data Histórico Débito Crédito Saldo", 1, [
      { text: "Data", x: 40 }, { text: "Histórico", x: 90 }, { text: "Débito", x: 300 },
      { text: "Crédito", x: 380 }, { text: "Saldo", x: 460 },
    ]),
    line("05/08 PIX ENVIADO JOAO 120,00 880,00", 1, [
      { text: "05/08", x: 40 }, { text: "PIX ENVIADO JOAO", x: 90 },
      { text: "120,00", x: 300 }, { text: "880,00", x: 460 },
    ]),
    line("06/08 PIX RECEBIDO MARIA 300,00 1.180,00", 1, [
      { text: "06/08", x: 40 }, { text: "PIX RECEBIDO MARIA", x: 90 },
      { text: "300,00", x: 380 }, { text: "1.180,00", x: 460 },
    ]),
  ];
  const account = run("parsePdfStatementLines(__accountLines, 'extrato-outro-banco.pdf', 1)");
  check("estrutura de outro banco é aceita", account.profile === "structural" && account.documentKind === "account", account);
  check("coluna de débito vira saída", account.rows.find((row) => row.description.includes("ENVIADO")).type === "expense");
  check("coluna de crédito vira entrada", account.rows.find((row) => row.description.includes("RECEBIDO")).type === "income");
  check("saldo não é confundido com valor", account.rows[1].amount === 300, account.rows[1]);

  section("4. Datas e validação");
  ctx.__rollover = [line("Fatura vencimento 10/01/2027"), line("28/12 COMPRA TESTE 40,00")];
  check("fatura de janeiro leva compra de dezembro ao ano anterior",
    run("parsePdfStatementLines(__rollover, 'fatura.pdf', 1).rows[0].date") === "2026-12-28");
  ctx.__withoutYear = [line("Fatura do cartão"), line("10/08 COMPRA TESTE 40,00")];
  let missingYear = null;
  try { run("parsePdfStatementLines(__withoutYear, 'fatura.pdf', 1)"); } catch (error) { missingYear = error; }
  check("ano ausente recebe erro próprio", missingYear && missingYear.code === "PDF_DATE_YEAR", missingYear && missingYear.code);

  section("5. Destino e efeito financeiro");
  ctx.__selectedRows = santander.rows.filter((row) => !/Pagamento recebido|Saldo da fatura anterior/.test(row.description));
  const transactions = run("buildTransactionsFromRows(__selectedRows, 'pdf', { documentKind: 'card', destinationId: 'card-1' }, 'fatura-santander.pdf')");
  check("PDF grava origem própria", transactions.every((tx) => tx.source === "import-pdf" && tx.origin.channel === "import-pdf"));
  check("fatura grava no cartão sem afetar conta", transactions.every((tx) => tx.creditCardId === "card-1" && tx.accountId === null && tx.payment === "Crédito"));
  const importedRefund = transactions.find((tx) => tx.type === "income");
  check("estorno conserva a natureza", importedRefund && importedRefund.nature === "estorno", importedRefund);

  ctx.__cardData = {
    creditCards: [{ id: "card-1", closingDay: 25, dueDay: 10 }],
    transactions,
    cardPayments: [],
  };
  const statement = run("cardStatements(__cardData, 'card-1')[0]");
  check("estorno reduz o valor da fatura", statement.purchases === 156.35, statement);

  const bankTransactions = run("buildTransactionsFromRows(__accountRows = parsePdfStatementLines(__accountLines, 'extrato.pdf', 1).rows, 'pdf', { documentKind: 'account', destinationId: 'acc-1' }, 'extrato.pdf')");
  check("extrato grava na conta sem cartão", bankTransactions.every((tx) => tx.accountId === "acc-1" && tx.creditCardId === null));

  section("6. PDF completo com texto selecionável");
  const document = PdfWriter.createPdfDocument({ title: "Fatura Santander" });
  document.text("Santander", 40, 60, { size: 12, bold: true });
  document.text("Fatura do cartao", 40, 80, { size: 10 });
  document.text("Vencimento 10/09/2026", 40, 100, { size: 10 });
  document.text("18/08 MERCADO SAO JOSE 123,45", 40, 130, { size: 10 });
  document.text("19/08 Estorno LOJA TESTE -20,00", 40, 150, { size: 10 });
  const bytes = document.build();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  ctx.__pdfjsLibrary = await import(pathToFileURL(path.join(ROOT, "vendor/pdfjs/pdf.min.mjs")).href);
  ctx.__pdfWorkerUrl = pathToFileURL(path.join(ROOT, "vendor/pdfjs/pdf.worker.min.mjs")).href;
  run("loadPdfImportLibrary = async function () { __pdfjsLibrary.GlobalWorkerOptions.workerSrc = __pdfWorkerUrl; return __pdfjsLibrary; }");
  ctx.__pdfFile = { name: "fatura-santander.pdf", type: "application/pdf", size: bytes.byteLength, async arrayBuffer() { return buffer; } };
  const extracted = await run("readPdfStatementFile(__pdfFile, '')");
  check("PDF.js extrai o arquivo completo", extracted.rows.length === 2, extracted);
  check("o arquivo completo mantém banco e páginas", extracted.bank === "Santander" && extracted.pageCount === 1, extracted);

  // O INSTANTÂNEO TEM DE SOBREVIVER À PRÓPRIA LEITURA.
  //
  // O PDF.js TRANSFERE para o worker o array que recebe em `data`, e transferir
  // esvazia o original: depois da primeira leitura ele fica com zero byte. Como
  // o importador guarda o instantâneo justamente para reler o arquivo quando a
  // pessoa digita a senha do PDF, entregar o array original ali significaria que
  // a segunda tentativa nunca teria chance. Por isso vai uma cópia.
  //
  // O esvaziamento não acontece AQUI: sem navegador não há worker de verdade, o
  // PDF.js cai no worker de mentira do mesmo realm e não transfere nada. O que
  // estas três linhas guardam é o comportamento (reler o instantâneo funciona);
  // a transferência em si foi medida no WebKit, onde o array de 1018 bytes volta
  // com zero quando a cópia sai.
  ctx.__snapshot = await run("snapshotStatementFile(__pdfFile)");
  const primeiraLeitura = await run("readPdfStatementFile(__snapshot, '')");
  check("o instantâneo abre na primeira leitura", primeiraLeitura.rows.length === 2, primeiraLeitura.rows.length);
  check("a leitura não esvazia o instantâneo", ctx.__snapshot.bytes.length > 0, ctx.__snapshot.bytes.length);
  const segundaLeitura = await run("readPdfStatementFile(__snapshot, '')");
  check("reler o mesmo instantâneo devolve o mesmo extrato",
    segundaLeitura.rows.length === 2, segundaLeitura.rows.length);

  section("7. Pacote local e cache offline");
  check("módulo do PDF.js foi sincronizado", fs.existsSync(path.join(ROOT, "vendor/pdfjs/pdf.min.mjs")));
  check("worker do PDF.js foi sincronizado", fs.existsSync(path.join(ROOT, "vendor/pdfjs/pdf.worker.min.mjs")));
  const worker = readSrc("service-worker.js");
  check("leitor e worker entram no cache", /vendor\/pdfjs\/pdf\.min\.mjs/.test(worker) && /vendor\/pdfjs\/pdf\.worker\.min\.mjs/.test(worker));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
