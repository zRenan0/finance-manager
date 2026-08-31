// test-accounting-integrity.js — INVARIANTES CONTÁBEIS DO M11.
// ------------------------------------------------------------------------------
// Este arquivo existe para uma pergunta só: o mesmo dinheiro é contado duas
// vezes em algum lugar do aplicativo? As regras que ele trava são as que, se
// quebrarem, fazem o app mentir sem dar erro nenhum:
//
//   1. Transferência entre contas próprias não é receita nem despesa, e não
//      muda o caixa somado das contas.
//   2. Pagamento de fatura não é despesa nova: a compra já foi contada na data
//      dela. O que o pagamento faz é tirar dinheiro do caixa e fechar a fatura.
//   3. Ajuste de saldo (conciliação) move o saldo sem virar gasto nem renda.
//   4. Aporte em meta e investimento livre saem do caixa e viram patrimônio;
//      o patrimônio líquido não se mexe.
//   5. Amortização de dívida não é consumo; juros e tarifas são.
//   6. Estorno não é renda: ele desfaz o gasto.
//   7. NUMERADOR E DENOMINADOR PRECISAM USAR A MESMA RÉGUA. Toda soma por
//      categoria, por dia da semana ou por dia do mês tem que fechar com
//      `realizedMonthTotals(...).expense`, que é o número exibido como
//      "Despesas do mês". Foi exatamente aqui que o M11 achou o defeito.
//   8. A projeção de fechamento não pode tratar transferência como gasto.
//
// Ferramenta de dev: `node tests/test-accounting-integrity.js`.
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
ctx.fetch = () => Promise.reject(new Error("offline"));
vm.createContext(ctx);

["js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/safe-errors.js", "js/storage.js",
  "js/accounts.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/goals.js", "js/wealth.js",
  "js/recurring.js", "js/forecast.js", "js/analytics.js", "js/insights.js", "js/wrapped.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const { migrate } = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` -> ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;

// Mês FECHADO: assim "realizado" é o mês inteiro e o resultado não depende do
// dia em que a suíte roda. O mês corrente tem teste próprio no bloco 8.
const hoje = new Date();
const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
const KEY = ctx.keyOfDate(anterior);
const dia = (d) => `${KEY}-${String(d).padStart(2, "0")}`;
const ABERTURA = `${ctx.keyOfDate(new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1))}-01`;

let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

const contas = () => ([
  { id: "account_aaa", name: "Corrente", type: "corrente", openingBalance: 5000, openingDate: ABERTURA },
  { id: "account_bbb", name: "Poupança", type: "poupanca", openingBalance: 1000, openingDate: ABERTURA },
]);

function base(extra) {
  return migrate({ monthlyIncome: 6000, accounts: contas(), ...(extra || {}) });
}

// Soma das categorias tem que fechar com o total exibido do mês. É o invariante
// que o defeito do M11 violava.
function somaCategorias(data, monthKey) {
  const model = ctx.buildAnalyticsModel(data, monthKey || KEY);
  return model.categories.rows.reduce((s, r) => s + r.current, 0);
}

/* ============================================================== 1 */
console.log("\n1. Transferência entre contas próprias");
{
  const data = base({
    transactions: [tx({ type: "income", amount: 6000, categoryId: "salario", date: dia(5), accountId: "account_aaa" })],
    accountTransfers: [{ id: "transfer_1", fromAccountId: "account_aaa", toAccountId: "account_bbb", amount: 800, date: dia(10) }],
  });
  const semTransferencia = base({
    transactions: [tx({ type: "income", amount: 6000, categoryId: "salario", date: dia(5), accountId: "account_aaa" })],
  });

  const totais = ctx.realizedMonthTotals(data, KEY);
  const totaisSem = ctx.realizedMonthTotals(semTransferencia, KEY);
  check("não vira despesa", near(totais.expense, totaisSem.expense), totais.expense);
  check("não vira receita", near(totais.income, totaisSem.income), totais.income);
  check("caixa somado não muda",
    near(ctx.accountsCashBalance(data, dia(28)), ctx.accountsCashBalance(semTransferencia, dia(28))),
    ctx.accountsCashBalance(data, dia(28)));
  check("sai da conta de origem", near(ctx.accountBalance(data, "account_aaa", dia(28)), 5000 + 6000 - 800),
    ctx.accountBalance(data, "account_aaa", dia(28)));
  check("entra na conta de destino", near(ctx.accountBalance(data, "account_bbb", dia(28)), 1800),
    ctx.accountBalance(data, "account_bbb", dia(28)));
  check("patrimônio líquido não muda",
    near(ctx.netWorth(data).total, ctx.netWorth(semTransferencia).total), ctx.netWorth(data).total);
}

/* ============================================================== 2 */
console.log("\n2. Compra no cartão e pagamento da fatura");
{
  const compra = tx({ type: "expense", amount: 400, categoryId: "mercado", date: dia(8),
    accountId: "account_aaa", creditCardId: "card_1", payment: "Crédito" });
  const cartao = { id: "card_1", name: "Cartão", accountId: "account_aaa", limit: 5000, closingDay: 20, dueDay: 28 };

  const semPagar = base({ creditCards: [cartao], transactions: [compra] });
  const pago = base({
    creditCards: [cartao],
    transactions: [compra],
    cardPayments: [{ id: "payment_1", accountId: "account_aaa", creditCardId: "card_1", amount: 400,
      date: dia(28), statementKey: KEY }],
  });

  check("a compra é despesa uma única vez, na data da compra",
    near(ctx.realizedMonthTotals(semPagar, KEY).expense, 400), ctx.realizedMonthTotals(semPagar, KEY).expense);
  check("pagar a fatura NÃO cria despesa nova",
    near(ctx.realizedMonthTotals(pago, KEY).expense, 400), ctx.realizedMonthTotals(pago, KEY).expense);
  check("pagar a fatura não cria receita", near(ctx.realizedMonthTotals(pago, KEY).income, 0),
    ctx.realizedMonthTotals(pago, KEY).income);
  check("a compra no crédito não sai do caixa antes de pagar",
    near(ctx.accountBalance(semPagar, "account_aaa", dia(27)), 5000), ctx.accountBalance(semPagar, "account_aaa", dia(27)));
  check("o pagamento sai do caixa",
    near(ctx.accountBalance(pago, "account_aaa", dia(28)), 4600), ctx.accountBalance(pago, "account_aaa", dia(28)));
  check("soma das categorias fecha com a despesa do mês",
    near(somaCategorias(pago), ctx.realizedMonthTotals(pago, KEY).expense), somaCategorias(pago));

  // Patrimônio: antes de pagar existe uma fatura em aberto que precisa ser
  // abatida; depois de pagar o caixa caiu e a fatura zerou. O número final é o
  // mesmo — se não fosse, a compra estaria sendo descontada duas vezes.
  check("patrimônio líquido é o mesmo antes e depois de pagar a fatura",
    near(ctx.netWorth(semPagar).total, ctx.netWorth(pago).total),
    `${ctx.netWorth(semPagar).total} vs ${ctx.netWorth(pago).total}`);
}

/* ============================================================== 3 */
console.log("\n3. Ajuste de saldo (conciliação)");
{
  const data = base({
    transactions: [tx({ type: "expense", amount: 100, categoryId: "mercado", date: dia(6), accountId: "account_aaa" })],
    accountAdjustments: [{ id: "adjustment_1", accountId: "account_aaa", amount: -250, date: dia(9), note: "Conciliação" }],
  });
  const totais = ctx.realizedMonthTotals(data, KEY);
  check("ajuste não vira despesa", near(totais.expense, 100), totais.expense);
  check("ajuste não vira receita", near(totais.income, 0), totais.income);
  check("ajuste move o saldo da conta",
    near(ctx.accountBalance(data, "account_aaa", dia(28)), 5000 - 100 - 250),
    ctx.accountBalance(data, "account_aaa", dia(28)));
}

/* ============================================================== 4 */
console.log("\n4. Aporte em meta e investimento livre");
{
  const semAporte = base({
    transactions: [tx({ type: "expense", amount: 300, categoryId: "mercado", date: dia(6), accountId: "account_aaa" })],
  });
  const comAporte = base({
    goals: [{ id: "goal_1", name: "Reserva", target: 10000, current: 0 }],
    transactions: [
      tx({ type: "expense", amount: 300, categoryId: "mercado", date: dia(6), accountId: "account_aaa" }),
      tx({ type: "expense", amount: 2000, categoryId: "investimento", date: dia(7), accountId: "account_aaa", goalId: "goal_1" }),
    ],
  });
  const comInvestimento = base({
    transactions: [
      tx({ type: "expense", amount: 300, categoryId: "mercado", date: dia(6), accountId: "account_aaa" }),
      tx({ type: "expense", amount: 2000, categoryId: "investimento", date: dia(7), accountId: "account_aaa" }),
    ],
  });

  check("aporte em meta não é despesa do mês",
    near(ctx.realizedMonthTotals(comAporte, KEY).expense, 300), ctx.realizedMonthTotals(comAporte, KEY).expense);
  check("investimento livre não é despesa do mês",
    near(ctx.realizedMonthTotals(comInvestimento, KEY).expense, 300), ctx.realizedMonthTotals(comInvestimento, KEY).expense);
  check("aporte não entra no orçamento 50/30/20",
    near(ctx.monthGroupSpend(comAporte, KEY).futuro, ctx.monthGroupSpend(semAporte, KEY).futuro),
    JSON.stringify(ctx.monthGroupSpend(comAporte, KEY)));
  check("aporte não lidera o ranking de categorias",
    ctx.buildAnalyticsModel(comAporte, KEY).dominant.id !== "investimento",
    JSON.stringify(ctx.buildAnalyticsModel(comAporte, KEY).dominant));
  check("a categoria dominante nunca passa de 100% do mês",
    ctx.buildAnalyticsModel(comAporte, KEY).dominant.share <= 100,
    ctx.buildAnalyticsModel(comAporte, KEY).dominant.share);
  check("soma das categorias fecha com a despesa do mês (com aporte)",
    near(somaCategorias(comAporte), ctx.realizedMonthTotals(comAporte, KEY).expense),
    `${somaCategorias(comAporte)} vs ${ctx.realizedMonthTotals(comAporte, KEY).expense}`);
  check("patrimônio líquido não muda ao guardar dinheiro",
    near(ctx.netWorth(comInvestimento).total, ctx.netWorth(semAporte).total),
    `${ctx.netWorth(comInvestimento).total} vs ${ctx.netWorth(semAporte).total}`);
}

/* ============================================================== 5 */
console.log("\n5. Dívida: amortização não é consumo, encargo é");
{
  const data = base({
    transactions: [
      tx({ type: "expense", amount: 900, categoryId: "outros", date: dia(6), accountId: "account_aaa",
        debtId: "debt_1", nature: "divida-principal" }),
      tx({ type: "expense", amount: 120, categoryId: "outros", date: dia(6), accountId: "account_aaa",
        debtId: "debt_1", nature: "divida-encargos" }),
    ],
  });
  const totais = ctx.realizedMonthTotals(data, KEY);
  check("só o encargo entra como gasto", near(totais.expense, 120), totais.expense);
  check("o principal aparece em campo próprio", near(totais.dividaPrincipal || 0, 900), JSON.stringify(totais));
  check("soma das categorias fecha com a despesa do mês (com dívida)",
    near(somaCategorias(data), totais.expense), `${somaCategorias(data)} vs ${totais.expense}`);
}

/* ============================================================== 6 */
console.log("\n6. Estorno desfaz o gasto e não vira renda");
{
  const data = base({
    transactions: [
      tx({ type: "expense", amount: 500, categoryId: "mercado", date: dia(6), accountId: "account_aaa" }),
      tx({ type: "income", amount: 200, categoryId: "mercado", date: dia(9), accountId: "account_aaa", nature: "estorno" }),
    ],
  });
  const totais = ctx.realizedMonthTotals(data, KEY);
  check("estorno abate a despesa", near(totais.expense, 300), totais.expense);
  check("estorno não vira receita", near(totais.income, 0), totais.income);
  check("soma das categorias fecha com a despesa do mês (com estorno)",
    near(somaCategorias(data), totais.expense), `${somaCategorias(data)} vs ${totais.expense}`);
}

/* ============================================================== 7 */
console.log("\n7. Lançamento legado gravado como transferência");
{
  // Bases antigas gravavam a transferência como par de lançamentos. A ponta de
  // saída não pode aparecer como gasto em NENHUMA leitura do mês.
  const data = base({
    transactions: [
      tx({ type: "expense", amount: 700, categoryId: "mercado", date: dia(6), accountId: "account_aaa" }),
      tx({ type: "expense", amount: 2500, categoryId: "outros", date: dia(11), accountId: "account_aaa", nature: "transferencia" }),
      tx({ type: "income", amount: 2500, categoryId: "outros", date: dia(11), accountId: "account_bbb", nature: "transferencia" }),
    ],
  });
  const totais = ctx.realizedMonthTotals(data, KEY);
  const model = ctx.buildAnalyticsModel(data, KEY);
  const somaSemana = model.weekday.rows.reduce((s, r) => s + r.total, 0);
  const somaMapa = model.heatmap.days.reduce((s, d) => s + d.value, 0);
  const media = ctx.variableBaseline(data, ctx.todayIso());
  check("não entra na despesa do mês", near(totais.expense, 700), totais.expense);
  check("não entra na receita do mês", near(totais.income, 0), totais.income);
  check("não entra no ranking de categorias", near(somaCategorias(data), 700), somaCategorias(data));
  check("não entra no perfil por dia da semana", near(somaSemana, 700), somaSemana);
  check("não entra no mapa de calor do mês", near(somaMapa, 700), somaMapa);
  check("não entra na média de gastos variáveis da projeção",
    near(media.monthly, 700 / Math.max(1, media.months), 1), JSON.stringify(media));
}

/* ============================================================== 8 */
console.log("\n8. Mês corrente: o que ainda não aconteceu não conta");
{
  const keyAtual = ctx.keyOfDate(hoje);
  const ontem = ctx.isoOfDate(new Date(hoje.getTime() - 86400000));
  const futuro = ctx.isoOfDate(new Date(hoje.getTime() + 5 * 86400000));
  const gastoRealizado = ctx.monthKeyOf(ontem) === keyAtual ? 150 : 0;
  const data = base({
    transactions: [
      tx({ type: "expense", amount: 150, categoryId: "mercado", date: ontem, accountId: "account_aaa" }),
      tx({ type: "expense", amount: 900, categoryId: "mercado", date: futuro, accountId: "account_aaa" }),
    ],
  });
  const totais = ctx.realizedMonthTotals(data, keyAtual);
  const model = ctx.buildAnalyticsModel(data, keyAtual);
  const soma = model.categories.rows.reduce((s, r) => s + r.current, 0);
  const somaMapa = model.heatmap.days.reduce((s, d) => s + d.value, 0);
  check("lançamento futuro fica fora da despesa realizada", near(totais.expense, gastoRealizado), totais.expense);
  check("ranking e total do mês corrente usam o mesmo recorte", near(soma, totais.expense), `${soma} vs ${totais.expense}`);
  check("o mapa de calor do mês corrente fecha com o mesmo total", near(somaMapa, totais.expense), somaMapa);
}

/* ============================================================== 9 */
console.log("\n9. Projeção de fechamento não conta a fatura duas vezes");
{
  const cartao = { id: "card_1", name: "Cartão", accountId: "account_aaa", limit: 5000, closingDay: 20, dueDay: 28 };
  const hojeIso = ctx.todayIso();
  const data = base({
    creditCards: [cartao],
    transactions: [tx({ type: "expense", amount: 400, categoryId: "mercado", date: hojeIso,
      accountId: "account_aaa", creditCardId: "card_1", payment: "Crédito" })],
  });
  const projecao = ctx.buildForecast(data, hojeIso);
  const compraNoFluxo = projecao.events.filter((e) => e.id.indexOf("tx-") === 0 && e.cashEffect !== false).length;
  check("a compra no crédito não sai do caixa na data da compra", compraNoFluxo === 0, compraNoFluxo);
  check("o saldo de partida é o caixa realizado",
    near(projecao.balance, ctx.realizedBalance(data)), projecao.balance);
  check("a fatura entra no fluxo uma única vez",
    projecao.events.filter((e) => e.kind === "card-statement").length <= 1,
    projecao.events.filter((e) => e.kind === "card-statement").length);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"} - ${pass} ok, ${fail} falha(s)`);
process.exit(fail === 0 ? 0 : 1);
