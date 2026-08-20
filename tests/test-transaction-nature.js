// test-transaction-nature.js; natureza econômica e bases de renda.
// ------------------------------------------------------------------------------
// O que este teste protege:
//
//   1. Guardar dinheiro não é gastar. Um aporte de R$ 500 numa meta não pode
//      aparecer como gasto, nem derrubar a taxa de poupança, nem liderar o
//      ranking de categorias.
//   2. Amortizar dívida não é gastar. Ela troca dívida por patrimônio; só os
//      juros e tarifas são custo.
//   3. Estorno não é renda. Ele desfaz um gasto; contá-lo como entrada inflava
//      a renda do mês e a taxa de poupança junto.
//   4. Transferência entre contas próprias não é gasto nem renda.
//   5. Renda planejada, realizada e projetada são três números distintos, e
//      nenhum indicador pode comparar um com o outro.
//   6. Mês parcial é declarado como parcial.
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
  "js/layout.js", "js/safe-errors.js", "js/storage.js", "js/budgets.js", "js/metrics.js",
  "js/score.js", "js/achievements.js"];

function carregar() {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, crypto, URL,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
  ctx.run = (code) => vm.runInContext(code, ctx);
  return ctx;
}

const ctx = carregar();
const run = ctx.run;

// Mês fechado, para que "realizado" seja o mês inteiro e não dependa do dia de
// hoje. O mês corrente é testado à parte, na seção 5.
const HOJE = run("todayIso()");
const MES_FECHADO = run(`keyOfDate(addMonths(new Date(), -1))`);
const DIA_FECHADO = `${MES_FECHADO}-10`;

function base(transacoes, extra) {
  ctx.__entrada = {
    version: 22, categories: [], goals: [], assets: [],
    monthlyIncome: 5000,
    transactions: transacoes,
    ...(extra || {}),
  };
  return run("migrate(__entrada)");
}

console.log("\n1. Natureza deduzida de bases antigas");
{
  const dados = base([
    { id: "t1", type: "expense", amount: 100, date: DIA_FECHADO, categoryId: "mercado" },
    { id: "t2", type: "expense", amount: 500, date: DIA_FECHADO, categoryId: "outros", goalId: "meta-1" },
    { id: "t3", type: "income", amount: 200, date: DIA_FECHADO, goalId: "meta-1" },
    { id: "t4", type: "income", amount: 5000, date: DIA_FECHADO },
    { id: "t5", type: "expense", amount: 300, date: DIA_FECHADO, categoryId: "investimento" },
  ]);
  const porId = Object.fromEntries(dados.transactions.map((t) => [t.id, t]));
  check("gasto comum vira consumo", porId.t1.nature === "consumo", porId.t1.nature);
  check("saída para meta vira aporte", porId.t2.nature === "aporte", porId.t2.nature);
  check("entrada de meta vira resgate", porId.t3.nature === "resgate", porId.t3.nature);
  check("entrada comum vira renda", porId.t4.nature === "renda", porId.t4.nature);
  check("saída para investimento vira aporte", porId.t5.nature === "aporte", porId.t5.nature);

  // Natureza inválida ou de outro tipo não é aceita: ela decide dinheiro.
  ctx.__t = { id: "tx", type: "expense", amount: 10, date: DIA_FECHADO, categoryId: "mercado", nature: "renda" };
  check("natureza incompatível com o tipo é recusada", run(`normalizeTransactionNature("renda", __t)`) === "consumo");
  check("natureza inventada é recusada", run(`normalizeTransactionNature("qualquer", __t)`) === "consumo");
}

console.log("\n2. Aporte não é gasto");
{
  const dados = base([
    { id: "r", type: "income", amount: 5000, date: DIA_FECHADO },
    { id: "g", type: "expense", amount: 1000, date: DIA_FECHADO, categoryId: "mercado" },
    { id: "a", type: "expense", amount: 500, date: DIA_FECHADO, categoryId: "outros", goalId: "meta-1" },
  ]);
  ctx.__d = dados;
  const totais = run(`realizedMonthTotals(__d, ${JSON.stringify(MES_FECHADO)})`);
  check("gasto do mês é só o consumo", totais.expense === 1000, totais.expense);
  check("o aporte aparece em campo próprio", totais.aportes === 500, totais.aportes);
  check("a saída de caixa soma os dois", totais.saidaDeCaixa === 1500, totais.saidaDeCaixa);

  const snap = run(`monthSnapshot(__d, ${JSON.stringify(MES_FECHADO)})`);
  check("poupança do mês considera o aporte como economia", snap.savings === 4000, snap.savings);
  check("taxa de poupança usa renda realizada", Math.round(snap.savingsRate) === 80, snap.savingsRate);

  const ranking = run(`categoryRanking(__d, ${JSON.stringify(MES_FECHADO)})`);
  check("o aporte não lidera o ranking de gastos", !ranking.some((c) => c.id === "outros" && c.value === 500), JSON.stringify(ranking));
}

console.log("\n3. Dívida: principal e encargos separados");
{
  const dados = base([
    { id: "r", type: "income", amount: 5000, date: DIA_FECHADO },
    { id: "p", type: "expense", amount: 800, date: DIA_FECHADO, categoryId: "outros", nature: "divida-principal" },
    { id: "j", type: "expense", amount: 200, date: DIA_FECHADO, categoryId: "outros", nature: "divida-encargos" },
  ]);
  ctx.__d = dados;
  const totais = run(`realizedMonthTotals(__d, ${JSON.stringify(MES_FECHADO)})`);
  check("amortização não entra no gasto", totais.dividaPrincipal === 800 && totais.expense === 200, `${totais.dividaPrincipal}/${totais.expense}`);
  check("juros e tarifas entram no gasto", totais.dividaEncargos === 200, totais.dividaEncargos);
  check("a saída de caixa continua sendo os R$ 1.000 pagos", totais.saidaDeCaixa === 1000, totais.saidaDeCaixa);
}

console.log("\n4. Estorno e transferência");
{
  const dados = base([
    { id: "r", type: "income", amount: 5000, date: DIA_FECHADO },
    { id: "c", type: "expense", amount: 300, date: DIA_FECHADO, categoryId: "mercado" },
    { id: "e", type: "income", amount: 300, date: DIA_FECHADO, categoryId: "mercado", nature: "estorno" },
    { id: "t", type: "expense", amount: 900, date: DIA_FECHADO, categoryId: "outros", nature: "transferencia" },
  ]);
  ctx.__d = dados;
  const totais = run(`realizedMonthTotals(__d, ${JSON.stringify(MES_FECHADO)})`);
  check("estorno desfaz o gasto", totais.expense === 0, totais.expense);
  check("estorno NÃO vira renda", totais.income === 5000, totais.income);
  check("transferência não é gasto nem renda", totais.transferencias === 900 && totais.income === 5000);

  // Orçamento: o espaço consumido pela compra estornada tem de voltar.
  const gastoMercado = run(`spentForCategory(__d, "mercado", ${JSON.stringify(MES_FECHADO)})`);
  check("orçamento da categoria devolve o espaço do estorno", gastoMercado === 0, gastoMercado);
}

console.log("\n5. Renda planejada, realizada e projetada");
{
  const mesCorrente = run("keyOfDate(new Date())");
  const dados = base([
    { id: "r", type: "income", amount: 1200, date: HOJE },
    { id: "g", type: "expense", amount: 100, date: HOJE, categoryId: "mercado" },
  ]);
  ctx.__d = dados;
  const info = run(`incomeBasis(__d, ${JSON.stringify(mesCorrente)})`);
  check("planejada vem da configuração", info.planned === 5000, info.planned);
  check("realizada vem dos lançamentos", info.realized === 1200, info.realized);
  check("projetada não é menor que a planejada quando falta receber", info.projected === 5000, info.projected);
  check("mês corrente é declarado parcial", info.partial === true && info.complete === false);
  check("a base declarada é a realizada quando já entrou dinheiro", info.basis === "realizada", info.basis);

  const snap = run(`monthSnapshot(__d, ${JSON.stringify(mesCorrente)})`);
  check("a taxa de poupança do mês parcial usa renda REALIZADA", Math.round(snap.savingsRate) === Math.round((1100 / 1200) * 100), snap.savingsRate);
  check("o snapshot expõe as três rendas", snap.incomePlanned === 5000 && snap.incomeRealized === 1200 && snap.incomeProjected === 5000);
  check("o snapshot marca que o mês é parcial", snap.partial === true);

  // Sem nenhuma renda lançada, a taxa não pode ser inventada.
  const semRenda = base([{ id: "g", type: "expense", amount: 100, date: HOJE, categoryId: "mercado" }]);
  ctx.__d2 = semRenda;
  const snap2 = run(`monthSnapshot(__d2, ${JSON.stringify(mesCorrente)})`);
  check("sem renda realizada, a taxa de poupança é nula (não zero)", snap2.savingsRate === null, snap2.savingsRate);
  check("mas a renda planejada continua disponível para orçar", snap2.incomePlanned === 5000, snap2.incomePlanned);
}

console.log("\n6. Score não usa base incompatível");
{
  const mesCorrente = run("keyOfDate(new Date())");
  // Começo do mês: quase nada gasto e nada recebido ainda.
  const dados = base([{ id: "g", type: "expense", amount: 50, date: HOJE, categoryId: "mercado" }]);
  ctx.__d = dados;
  const snap = run(`monthSnapshot(__d, ${JSON.stringify(mesCorrente)})`);
  ctx.__ctx = { month: snap };
  const pilar = run(`SCORE_PILLARS.find((p) => p.id === "poupanca").evaluate(__d, ${JSON.stringify(mesCorrente)}, __ctx)`);
  check("o pilar de poupança se declara parcial ou não avaliável", pilar.applicable === false || pilar.partial === true, JSON.stringify(pilar).slice(0, 120));
  if (pilar.applicable) {
    check("o texto avisa que é estimativa", /não terminou|Estimativa/.test(pilar.detail || ""), pilar.detail);
  } else {
    check("pilar sem base sai da conta em vez de zerar a nota", pilar.applicable === false);
  }
}

console.log("\n7. Conquistas só contam meses fechados");
{
  const mesCorrente = run("keyOfDate(new Date())");
  const dados = base([
    // Mês corrente: só uma renda pequena e nenhum gasto ainda. Sem a correção,
    // isso viraria "melhor taxa de poupança da história": 100%.
    { id: "r", type: "income", amount: 100, date: HOJE },
  ]);
  ctx.__d = dados;
  const contexto = run(`buildAchievementContext(__d, new Date())`);
  check("mês em andamento não vira recorde de poupança", contexto.bestSavingsRate === 0, contexto.bestSavingsRate);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
