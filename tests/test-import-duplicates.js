// test-import-duplicates.js — DUPLICIDADE NA IMPORTAÇÃO E DESFAZER (M14).
// ------------------------------------------------------------------------------
// A importação é a única porta por onde entram centenas de lançamentos de uma
// vez. Errar nela em qualquer direção custa caro, e as duas direções são ruins:
//
//   • marcar como duplicata o que não é → a linha nasce DESMARCADA e some sem
//     que ninguém perceba. Foi o defeito encontrado: a regra antiga não olhava
//     a descrição, então dois cafés de R$ 12 na mesma semana viravam um só.
//   • não marcar o que é → reimportar o mesmo extrato dobra o mês.
//
// O que este arquivo protege:
//
//   1. `FITID` (identificador do banco no OFX) é lido, guardado e usado.
//   2. Reimportar o mesmo arquivo é reconhecido pelo identificador.
//   3. Duplicata exata (data + valor + descrição) é reconhecida.
//   4. Linha repetida DENTRO do próprio arquivo é reconhecida.
//   5. Mesmo valor com descrição diferente é marcado como "parecida", não como
//      fato consumado, e continua desmarcado.
//   6. Dois gastos DIFERENTES no mesmo dia não viram um só.
//   7. Toda duplicata nasce desmarcada; nada é importado sem confirmação.
//
// Ferramenta de dev: `node tests/test-import-duplicates.js`.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
["js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/safe-errors.js",
  "js/storage.js", "js/import.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` -> ${extra}` : ""}`); }
}

// OFX mínimo, no formato SGML que os bancos brasileiros entregam.
function ofx(linhas) {
  return `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n${linhas.map((l) => `<STMTTRN><TRNTYPE>${l.tipo || "DEBIT"}<DTPOSTED>${l.data}<TRNAMT>${l.valor}${l.fitid ? `<FITID>${l.fitid}` : ""}<MEMO>${l.memo}</STMTTRN>`).join("\n")}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

const base = (transacoes) => ctx.migrate({ transactions: transacoes || [], categories: [], goals: [], assets: [] });
const tx = (p) => ctx.makeTransaction(p);

/* ============================================================== 1 */
console.log("\n1. O identificador do banco é lido e guardado");
{
  const arquivo = ofx([{ data: "20260710", valor: "-45.90", memo: "PADARIA CENTRAL", fitid: "BANK-0001" }]);
  const parsed = ctx.parseStatementFile(arquivo, "extrato.ofx");
  check("o formato é reconhecido", parsed.format === "ofx", parsed.format);
  check("o FITID chega na linha", parsed.rows[0].externalId === "BANK-0001", parsed.rows[0].externalId);

  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base());
  const registros = ctx.buildImportRecordsFromRows(linhas, "ofx", { documentKind: "account", destinationId: null }, "extrato.ofx", []);
  check("o FITID é gravado na origem do lançamento",
    registros.transactions[0].origin.externalId === "BANK-0001", JSON.stringify(registros.transactions[0].origin));
  check("o nome do arquivo continua na referência",
    registros.transactions[0].origin.reference === "extrato.ofx");
}

/* ============================================================== 2 */
console.log("\n2. Reimportar o mesmo extrato é reconhecido pelo identificador");
{
  const arquivo = ofx([{ data: "20260710", valor: "-45.90", memo: "PADARIA CENTRAL", fitid: "BANK-0001" }]);
  const primeira = ctx.prepareImportRows(arquivo, "extrato.ofx", base());
  const gravados = ctx.buildImportRecordsFromRows(primeira, "ofx", { documentKind: "account", destinationId: null }, "extrato.ofx", []).transactions;

  // Mesmo FITID, mas o banco mudou a descrição E a data entre as duas
  // exportações: nenhum outro sinal pegaria isto.
  const segundoArquivo = ofx([{ data: "20260712", valor: "-45.90", memo: "PADARIA CENTRAL LTDA", fitid: "BANK-0001" }]);
  const segunda = ctx.prepareImportRows(segundoArquivo, "extrato.ofx", base(gravados));
  check("a linha é reconhecida pelo identificador do banco", segunda[0].duplicateKind === "external", segunda[0].duplicateKind);
  check("e nasce desmarcada", segunda[0].include === false);
}

/* ============================================================== 3 */
console.log("\n3. Duplicata exata: mesma data, mesmo valor, mesma descrição");
{
  const existente = tx({ id: "t1", type: "expense", amount: 45.9, categoryId: "mercado", date: "2026-07-10", description: "PADARIA CENTRAL" });
  const arquivo = ofx([{ data: "20260710", valor: "-45.90", memo: "padaria central" }]);
  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base([existente]));
  check("é reconhecida mesmo com diferença de caixa e acento", linhas[0].duplicateKind === "exata", linhas[0].duplicateKind);
  check("e nasce desmarcada", linhas[0].include === false);
}

/* ============================================================== 4 */
console.log("\n4. Linha repetida dentro do próprio arquivo");
{
  const arquivo = ofx([
    { data: "20260710", valor: "-45.90", memo: "PADARIA CENTRAL" },
    { data: "20260710", valor: "-45.90", memo: "PADARIA CENTRAL" },
  ]);
  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base());
  const repetidas = linhas.filter((l) => l.duplicateKind === "arquivo");
  check("a segunda ocorrência é marcada", repetidas.length === 1, linhas.map((l) => l.duplicateKind).join(","));
  check("a primeira continua marcada para importar", linhas.filter((l) => l.include).length === 1);
}

/* ============================================================== 5 */
console.log("\n5. Mesmo valor, descrição diferente: é SUSPEITA, e é dito assim");
{
  const existente = tx({ id: "t1", type: "expense", amount: 12, categoryId: "mercado", date: "2026-07-10", description: "CAFE DA ESQUINA" });
  const arquivo = ofx([{ data: "20260712", valor: "-12.00", memo: "CAFE DO AEROPORTO" }]);
  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base([existente]));
  check("é classificada como parecida, não como certeza", linhas[0].duplicateKind === "parecida", linhas[0].duplicateKind);
  check("continua desmarcada, como antes desta mudança", linhas[0].include === false);
  check("a tela tem um rótulo próprio para este caso",
    readSrc("js/screens/import.js").includes("parecida com um lançamento seu"));
  check("o resumo conta as parecidas separadamente",
    readSrc("js/screens/import.js").includes("merecem conferência"));
}

/* ============================================================== 6 */
console.log("\n6. Dois gastos DIFERENTES no mesmo dia não viram um só");
{
  // Era exatamente isto que a regra antiga quebrava: mesmo valor, mesmo tipo,
  // datas próximas e nenhuma comparação de descrição.
  const arquivo = ofx([
    { data: "20260710", valor: "-12.00", memo: "CAFE DA MANHA" },
    { data: "20260711", valor: "-12.00", memo: "ESTACIONAMENTO" },
  ]);
  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base());
  check("as duas linhas sobrevivem", linhas.length === 2, linhas.length);
  check("nenhuma é tratada como duplicata", linhas.every((l) => !l.duplicate), linhas.map((l) => l.duplicateKind).join(","));
  check("as duas vêm marcadas para importar", linhas.filter((l) => l.include).length === 2);
}

/* ============================================================== 7 */
console.log("\n7. O contador do resumo separa os motivos");
{
  const existente = tx({ id: "t1", type: "expense", amount: 30, categoryId: "mercado", date: "2026-07-10", description: "MERCADO BOM" });
  const arquivo = ofx([
    { data: "20260710", valor: "-30.00", memo: "MERCADO BOM" },
    { data: "20260711", valor: "-30.00", memo: "OUTRA COISA" },
    { data: "20260715", valor: "-80.00", memo: "FARMACIA" },
    { data: "20260715", valor: "-80.00", memo: "FARMACIA" },
  ]);
  const linhas = ctx.prepareImportRows(arquivo, "extrato.ofx", base([existente]));
  const contagem = linhas.meta.duplicates || {};
  check("uma exata", contagem.exata === 1, JSON.stringify(contagem));
  check("uma parecida", contagem.parecida === 1, JSON.stringify(contagem));
  check("uma repetida no arquivo", contagem.arquivo === 1, JSON.stringify(contagem));
  check("sobra exatamente uma linha marcada", linhas.filter((l) => l.include).length === 1,
    linhas.map((l) => `${l.description}:${l.include}`).join(" | "));
}

/* ============================================================== 8 */
console.log("\n8. Lançamento manual antigo não ganha identificador inventado");
{
  const manual = tx({ id: "t1", type: "expense", amount: 10, categoryId: "outros", date: "2026-07-01", description: "Feira" });
  check("origem de lançamento manual nasce sem identificador externo",
    manual.origin.externalId === null, JSON.stringify(manual.origin));
  const relido = ctx.migrate({ transactions: [manual], categories: [], goals: [], assets: [] });
  check("e continua nula depois de reler a base",
    relido.transactions[0].origin.externalId === null, JSON.stringify(relido.transactions[0].origin));
}

/* ============================================================== 9 */
console.log("\n9. Desfazer a importação existe e remove pelo identificador");
{
  const acoes = readSrc("js/actions.js");
  check("a ação de desfazer existe", acoes.includes('case "import-undo"'));
  check("o recibo é gravado depois da importação", acoes.includes("saveImportUndo(state.importUndo)"));
  check("a remoção usa o caminho com lápide",
    acoes.includes("removeTransactionsWithIntegrity(d, Array.from(txIds))")
    && acoes.includes('withTombstones(semLancamentos.graveyard, "accountTransfers", removidas)'));
  check("a confirmação avisa que o resto não é tocado",
    acoes.includes("O que você lançou ou editou depois não é tocado."));
  const app = readSrc("js/app.js");
  check("o recibo mora no localMeta, fora do backup e da sincronização",
    app.includes("FinanceStore.localMetaPut(META_IMPORT_UNDO, entry)"));
  check("o recibo é recuperado no boot", app.includes("hydrateImportUndo()"));
  check("a tela oferece o botão", readSrc("js/screens/import.js").includes('data-action="import-undo"'));
  check("o recibo guarda só identificadores, data e nome do arquivo",
    /transactionIds: newTx\.map\(\(tx\) => tx\.id\)/.test(acoes) && !/amount/.test(acoes.split("state.importUndo = {")[1].split("};")[0]));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"} - ${pass} ok, ${fail} falha(s)`);
process.exit(fail === 0 ? 0 : 1);
