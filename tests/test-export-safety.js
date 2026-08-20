// test-export-safety.js; exportação, datas reais e limites de restauração.
// ------------------------------------------------------------------------------
// O que este teste protege:
//
//   1. Fórmula em CSV. Escapar vírgula protege o ARQUIVO; não protege quem o
//      abre. Excel, LibreOffice e Sheets executam célula que começa com `=`,
//      `+`, `-` ou `@`. Como a descrição é texto livre (digitado ou vindo de
//      extrato importado), o ataque atravessa o app sem tocar nele.
//   2. Data que não existe. `/^\d{4}-\d{2}-\d{2}$/` aceita 2026-02-31, e o
//      JavaScript ROLA para 3 de março em vez de recusar: o lançamento cai em
//      outro mês e muda totais sem ninguém ter errado de propósito.
//   3. Restauração sem teto. `JSON.parse` é síncrono: um arquivo enorme congela
//      a aba antes de qualquer validação.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const FONTES = ["js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js",
  "js/layout.js", "js/safe-errors.js", "js/storage.js", "js/budgets.js"];

const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, crypto, URL,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
const run = (code) => vm.runInContext(code, ctx);

console.log("\n1. Fórmula em CSV é neutralizada");
{
  const perigosos = [
    ["=cmd|'/c calc'!A1", "igual"],
    ["+1+1", "mais"],
    ["-1+1", "menos"],
    ["@SUM(A1:A9)", "arroba"],
    ["\tHIPERLINK", "tabulação"],
  ];
  perigosos.forEach(([entrada, nome]) => {
    ctx.__v = entrada;
    const saida = run("csvCell(__v)");
    check(`célula iniciada por ${nome} é neutralizada`, /^'|^"'/.test(saida), saida);
  });

  check("texto comum não é alterado", run(`csvCell("Mercado do mês")`) === "Mercado do mês");
  check("vírgula continua sendo escapada", run(`csvCell("Padaria, centro")`) === '"Padaria, centro"');
  check("aspas continuam sendo escapadas", run(`csvCell('Ele disse "oi"')`) === '"Ele disse ""oi"""');

  // Ida e volta: o importador do próprio app tem de recuperar o texto original.
  ctx.__ida = run(`csvCell("=1+1")`);
  check("a volta remove a neutralização", run("csvUncell(__ida.replace(/^\"|\"$/g, ''))") === "=1+1", run("csvUncell(__ida)"));
  check("apóstrofo legítimo não é removido", run(`csvUncell("'Aspas' no texto")`) === "'Aspas' no texto");

  // E no arquivo de verdade.
  ctx.__dados = run(`migrate({ version: 22, categories: [], goals: [], assets: [],
    transactions: [{ id: "t1", type: "expense", amount: 10, date: "2026-08-01", categoryId: "mercado", description: "=1+1" }] })`);
  const csv = run("buildTransactionsCsv(__dados)");
  check("o CSV exportado não tem célula executável", !/,=1\+1/.test(csv), csv.split("\n")[1]);
  check("a descrição continua legível no arquivo", /'=1\+1/.test(csv));
}

console.log("\n2. Só data que existe");
{
  check("31 de fevereiro é recusado", run(`isRealIsoDate("2026-02-31")`) === false);
  check("mês 13 é recusado", run(`isRealIsoDate("2026-13-01")`) === false);
  check("dia 00 é recusado", run(`isRealIsoDate("2026-01-00")`) === false);
  check("29 de fevereiro em ano comum é recusado", run(`isRealIsoDate("2026-02-29")`) === false);
  check("29 de fevereiro em ano bissexto é aceito", run(`isRealIsoDate("2024-02-29")`) === true);
  check("data comum é aceita", run(`isRealIsoDate("2026-08-18")`) === true);
  check("texto vazio é recusado", run(`isRealIsoDate("")`) === false);

  // O ponto que importa: a data impossível não pode virar lançamento em março.
  const dados = run(`migrate({ version: 22, categories: [], goals: [], assets: [],
    transactions: [{ id: "t1", type: "expense", amount: 10, date: "2026-02-31", categoryId: "mercado" }] })`);
  check("lançamento com data impossível não cai no mês seguinte",
    dados.transactions[0].date !== "2026-03-03" && dados.transactions[0].monthKey !== "2026-03",
    `${dados.transactions[0].date} / ${dados.transactions[0].monthKey}`);
  check("a data impossível vira a data de hoje, não uma inventada",
    dados.transactions[0].date === run("todayIso()"), dados.transactions[0].date);

  check("normalizeIsoDate recusa data impossível", run(`normalizeIsoDate("2026-04-31")`) === "");
  check("normalizeIsoDate aceita data válida", run(`normalizeIsoDate("2026-04-30")`) === "2026-04-30");
}

console.log("\n3. Restauração tem teto");
{
  let codigo = null;
  try { run(`parseBackupFile("x".repeat(33 * 1024 * 1024))`); }
  catch (error) { codigo = error.code; }
  check("arquivo acima de 32 MB é recusado antes do parse", codigo === "TOO_LARGE", codigo);

  ctx.__muitos = JSON.stringify({
    version: 22, categories: [], goals: [], assets: [],
    transactions: Array.from({ length: 200001 }, (_, i) => ({ id: `t${i}`, type: "expense", amount: 1, date: "2026-08-01" })),
  });
  let codigoRegistros = null;
  try { run("parseBackupFile(__muitos)"); }
  catch (error) { codigoRegistros = error.code; }
  check("arquivo com registros demais é recusado", codigoRegistros === "TOO_MANY_RECORDS", codigoRegistros);

  const valido = run(`parseBackupFile(JSON.stringify(buildBackupEnvelope(migrate({ version: 22 }))))`);
  check("backup normal continua sendo aceito", !!valido && !!valido.data);
}

console.log("\n4. Senha não fica na memória do app");
{
  const auth = read("js/auth.js");
  // A senha ficava no estado depois do login: qualquer render seguinte a
  // recolocava no DOM, e ela sobrevivia a dump de memória e a relatório de erro.
  check("a senha é limpa no caminho de sucesso", /form\.password = "";/.test(auth));
  check("a senha é limpa também no erro",
    /catch \(error\) \{[\s\S]{0,200}form\.password = "";/.test(auth));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
