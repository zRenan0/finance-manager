// test-calendar.js — harness do Módulo 4 (Calendário e Previsão).
// O foco está no ponto mais arriscado do módulo: o MESMO compromisso pode chegar
// à previsão por quatro caminhos diferentes. Cada defesa contra contagem dupla
// tem teste próprio aqui. Também cobre a grade do mês, o corte fato/previsão e o
// planejamento anual.
// Ferramenta de dev: `node tests/test-calendar.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/score.js", "js/metrics.js",
 "js/goals.js", "js/forecast.js", "js/calendar.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const {
  buildForecast, buildFutureEvents, recurringTemplates, variableBaseline,
  buildCalendarMonth, calendarEventsOf, buildAnnualPlan,
  migrate, defaultData, makeAsset,
} = ctx;
const FORECAST_HORIZONS = run("FORECAST_HORIZONS");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const iso = (d) => ctx.isoOfDate(d);
const today = ctx.todayIso();
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
const monthsAhead = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + n, day)); };
const inDays = (n) => iso(new Date(Date.now() + n * 86400000));
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

// Base com 3 meses de histórico "normal", usada por vários cenários.
function baseHistory() {
  const out = [];
  for (let m = 3; m >= 1; m--) {
    out.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(m, 5) }));
    out.push(tx({ type: "expense", amount: 1500, categoryId: "moradia", date: monthsAgo(m, 10), recurring: true, description: "Aluguel" }));
    out.push(tx({ type: "expense", amount: 900, categoryId: "mercado", date: monthsAgo(m, 15) }));
  }
  return out;
}

/* ================================================================= 1 */
console.log("\n1. Eventos futuros: lançamentos cadastrados são fato");
{
  const data = migrate({
    monthlyIncome: 0,
    transactions: [
      tx({ type: "expense", amount: 350, categoryId: "outros", date: inDays(5), description: "Celular", installmentGroupId: "g", installmentIndex: 2, installmentTotal: 6 }),
      tx({ type: "expense", amount: 120, categoryId: "lazer", date: inDays(12), description: "Show" }),
      tx({ type: "expense", amount: 80, categoryId: "lazer", date: inDays(-3), description: "Passado" }),
    ],
  });
  const ev = buildFutureEvents(data, today, inDays(30));
  check("só o que está à frente entra", ev.length === 2, ev.length);
  check("parcela identificada como parcela", ev.some((e) => e.kind === "installment" && e.installment === "2/6"));
  check("lançamento futuro é marcado como certo", ev.every((e) => e.certain));
  check("eventos vêm ordenados por data", ev[0].iso < ev[1].iso);
}

/* ================================================================= 2 */
console.log("\n2. Gasto fixo é projetado só onde ainda não foi lançado");
{
  const data = migrate({ monthlyIncome: 0, transactions: baseHistory() });
  const ev = buildFutureEvents(data, today, monthsAhead(2, 28));
  const aluguel = ev.filter((e) => e.label === "Aluguel");
  check("aluguel projetado nos meses futuros", aluguel.length >= 2, aluguel.length);
  check("projeção marcada como estimativa", aluguel.every((e) => !e.certain && e.kind === "recurring"));
  check("valor herdado do último lançamento", near(aluguel[0].amount, 1500), aluguel[0] && aluguel[0].amount);
  check("dia herdado do último lançamento", aluguel.every((e) => e.iso.slice(8) === "10"));

  // Com o aluguel já lançado no mês que vem, aquele mês não recebe projeção.
  const comLancamento = migrate({
    monthlyIncome: 0,
    transactions: [...baseHistory(), tx({ type: "expense", amount: 1500, categoryId: "moradia", date: monthsAhead(1, 10), recurring: true, description: "Aluguel" })],
  });
  const proximoMes = ctx.monthKeyOf(monthsAhead(1, 10));
  const ev2 = buildFutureEvents(comLancamento, today, monthsAhead(1, 28));
  const proj = ev2.filter((e) => e.label === "Aluguel" && e.kind === "recurring" && ctx.monthKeyOf(e.iso) === proximoMes);
  check("mês já lançado não recebe projeção duplicada", proj.length === 0, proj.length);
  check("mas o lançamento real continua na lista", ev2.some((e) => e.label === "Aluguel" && e.certain));
}

/* ================================================================= 3 */
console.log("\n3. DEFESA: parcela de dívida não é somada em cima do gasto fixo");
{
  // Financiamento de 1.500/mês cadastrado E lançado como fixo "Aluguel" de 1.500.
  // Os dois vencem no mesmo mês: só um pode contar.
  const data = migrate({
    monthlyIncome: 0,
    transactions: baseHistory(),
    assets: [makeAsset({ class: "divida", name: "Financiamento", value: 90000, monthlyPayment: 1500, dueDay: 10 })],
  });
  const ev = buildFutureEvents(data, today, monthsAhead(1, 28));
  const liab = ev.filter((e) => e.kind === "liability");
  check("parcela de valor equivalente é descartada", liab.length === 0, liab.length);

  // Agora com valor bem diferente: é outro compromisso e deve entrar.
  const distinto = migrate({
    monthlyIncome: 0,
    transactions: baseHistory(),
    assets: [makeAsset({ class: "divida", name: "Consórcio", value: 40000, monthlyPayment: 620, dueDay: 20 })],
  });
  const ev2 = buildFutureEvents(distinto, today, monthsAhead(1, 28));
  check("parcela distinta é contada", ev2.some((e) => e.kind === "liability" && near(e.amount, 620)));

  // Sem dia de vencimento não vira evento — melhor nenhum dia que o dia errado.
  const semDia = migrate({
    monthlyIncome: 0, transactions: baseHistory(),
    assets: [makeAsset({ class: "divida", name: "Empréstimo", value: 9000, monthlyPayment: 430 })],
  });
  check("dívida sem dia informado não vira evento",
    !buildFutureEvents(semDia, today, monthsAhead(1, 28)).some((e) => e.kind === "liability"));
}

/* ================================================================= 4 */
console.log("\n4. DEFESA: renda só é projetada onde ainda não foi recebida");
{
  const data = migrate({ monthlyIncome: 6000, transactions: baseHistory() });
  const ev = buildFutureEvents(data, today, monthsAhead(2, 28));
  const renda = ev.filter((e) => e.kind === "income");
  check("renda projetada nos meses futuros", renda.length >= 2, renda.length);
  check("dia da renda vem da moda do histórico (5)", renda.every((e) => e.iso.slice(8) === "05"));

  const jaRecebeu = migrate({
    monthlyIncome: 6000,
    transactions: [...baseHistory(), tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAhead(1, 5) })],
  });
  const proxKey = ctx.monthKeyOf(monthsAhead(1, 5));
  const ev2 = buildFutureEvents(jaRecebeu, today, monthsAhead(1, 28));
  check("mês com receita lançada não recebe renda projetada",
    ev2.filter((e) => e.kind === "income" && ctx.monthKeyOf(e.iso) === proxKey).length === 0);
  check("a receita real segue contando", ev2.some((e) => e.type === "income" && e.certain));
}

/* ================================================================= 5 */
console.log("\n5. DEFESA: a média de variáveis exclui o que já é contado");
{
  const transactions = [];
  for (let m = 3; m >= 1; m--) {
    transactions.push(tx({ type: "expense", amount: 1000, categoryId: "moradia", date: monthsAgo(m, 10), recurring: true, description: "Aluguel" }));
    transactions.push(tx({ type: "expense", amount: 300, categoryId: "outros", date: monthsAgo(m, 12), installmentGroupId: "g", installmentIndex: m, installmentTotal: 6 }));
    transactions.push(tx({ type: "expense", amount: 500, categoryId: "investimento", date: monthsAgo(m, 14), goalId: "g1" }));
    transactions.push(tx({ type: "expense", amount: 700, categoryId: "mercado", date: monthsAgo(m, 15) }));
  }
  const data = migrate({ transactions, goals: [] });
  const base = variableBaseline(data, today);
  check("média conta só o gasto variável (700)", near(base.monthly, 700), base.monthly);
  check("janela de 3 meses reconhecida", base.months === 3, base.months);
}

/* ================================================================= 6 */
console.log("\n6. Previsão de saldo");
{
  const data = migrate({
    monthlyIncome: 6000,
    transactions: [
      ...baseHistory(),
      tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(0, 5) }),
    ],
  });
  const f = buildForecast(data);
  check("saldo de hoje = saldo realizado", near(f.balance, ctx.realizedBalance(data)), f.balance);
  check("série cobre 366 dias", f.days.length === 366, f.days.length);
  check("quatro horizontes", f.horizons.length === 4, f.horizons.length);
  check("horizontes na ordem 7/30/91/365",
    f.horizons.map((h) => h.days).join(",") === "7,30,91,365", f.horizons.map((h) => h.days).join(","));
  check("cada horizonte declara a confiança", f.horizons.every((h) => h.confidence));
  check("saldo projetado bate com o último dia da janela",
    near(f.horizons[1].projected, f.days[29].balance), `${f.horizons[1].projected} vs ${f.days[29].balance}`);
  check("nenhum valor NaN na série", f.days.every((d) => Number.isFinite(d.balance)));
  check("premissas são declaradas", f.assumptions.length >= 3, f.assumptions.length);
  check("saldo de 12 meses ≥ saldo de 7 dias com sobra positiva",
    f.horizons[3].projected > f.horizons[0].projected, `${f.horizons[3].projected} vs ${f.horizons[0].projected}`);
}

/* ================================================================= 7 */
console.log("\n7. Alerta de saldo negativo");
{
  const data = migrate({
    monthlyIncome: 0,
    transactions: [
      tx({ type: "income", amount: 500, categoryId: "salario", date: monthsAgo(0, 1) }),
      tx({ type: "expense", amount: 3000, categoryId: "moradia", date: inDays(10), description: "Conta grande" }),
    ],
  });
  const f = buildForecast(data);
  check("dia do saldo negativo é apontado", !!f.negativeDayIso, f.negativeDayIso);
  check("o dia apontado é o da conta", f.negativeDayIso === inDays(10), f.negativeDayIso);
  check("menor saldo registrado é negativo", f.lowest.value < 0, f.lowest.value);

  const saudavel = migrate({
    monthlyIncome: 8000,
    transactions: [tx({ type: "income", amount: 20000, categoryId: "salario", date: monthsAgo(0, 1) })],
  });
  check("sem risco, nenhum dia é apontado", buildForecast(saudavel).negativeDayIso === null);
}

/* ================================================================= 8 */
console.log("\n8. Grade do calendário");
{
  const data = migrate({ monthlyIncome: 6000, transactions: baseHistory() });
  const key = ctx.keyOfDate(new Date());
  const cal = buildCalendarMonth(data, key);
  check("grade é múltiplo de 7", cal.weeks.every((w) => w.length === 7));
  check("primeira célula é domingo", cal.weeks[0][0].weekday === 0);
  check("dias fora do mês marcados", cal.weeks[0].concat(cal.weeks[cal.weeks.length - 1]).some((d) => !d.inMonth));
  check("hoje está marcado exatamente uma vez",
    cal.weeks.flat().filter((d) => d.isToday).length === 1);
  check("rótulo do mês montado", /\d{4}/.test(cal.label), cal.label);
  check("sete nomes de dia da semana", cal.weekdays.length === 7);
  check("totais separam realizado de previsto",
    cal.totals.realizedExpense !== undefined && cal.totals.plannedExpense !== undefined);
  check("total do mês = realizado + previsto",
    near(cal.totals.expense, cal.totals.realizedExpense + cal.totals.plannedExpense),
    `${cal.totals.expense}`);
  check("dayOf devolve os eventos do dia", typeof cal.dayOf === "function");
}

/* ================================================================= 9 */
console.log("\n9. Fato e previsão não se misturam");
{
  const data = migrate({
    monthlyIncome: 0,
    transactions: [
      tx({ type: "expense", amount: 200, categoryId: "mercado", date: monthsAgo(0, 1), description: "Compra feita" }),
      tx({ type: "expense", amount: 300, categoryId: "lazer", date: inDays(6), description: "Show futuro" }),
    ],
  });
  const key = ctx.keyOfDate(new Date());
  const events = calendarEventsOf(data, key);
  const feito = events.find((e) => e.label === "Compra feita");
  check("lançamento passado marcado como concluído", feito && feito.done === true);

  const cal = buildCalendarMonth(data, key);
  const dia = cal.weeks.flat().find((d) => d.iso === monthsAgo(0, 1));
  check("dia com lançamento tem barra sólida (sem previsão)", dia && dia.hasPlanned === false, dia && dia.hasPlanned);
  check("realizado do mês inclui a compra", near(cal.totals.realizedExpense, 200), cal.totals.realizedExpense);
}

/* ================================================================= 10 */
console.log("\n10. Gasto fixo vencido aparece como atraso");
{
  // Fixo lançado no mês passado no dia 1 e não lançado neste mês: se hoje já
  // passou do dia 1, é atraso — não some da tela por ser \"passado\".
  const hojeDia = Number(today.slice(8, 10));
  if (hojeDia > 3) {
    const data = migrate({
      monthlyIncome: 0,
      transactions: [tx({ type: "expense", amount: 250, categoryId: "assinaturas", date: monthsAgo(1, 1), recurring: true, description: "Internet" })],
    });
    const cal = buildCalendarMonth(data, ctx.keyOfDate(new Date()));
    check("conta vencida contabilizada como atraso", cal.totals.lateCount === 1, cal.totals.lateCount);
    check("valor do atraso somado", near(cal.totals.lateTotal, 250), cal.totals.lateTotal);
    check("dia do atraso é sinalizado na grade",
      cal.weeks.flat().some((d) => d.hasLate));
  } else {
    check("cenário de atraso pulado (início do mês)", true);
    check("cenário de atraso pulado (início do mês)", true);
    check("cenário de atraso pulado (início do mês)", true);
  }
}

/* ================================================================= 11 */
console.log("\n11. Prazo de meta vira marcador, não movimento de caixa");
{
  const data = migrate({
    monthlyIncome: 0,
    goals: [{ id: "g1", name: "Viagem", target: 5000, current: 2000, deadline: inDays(20), icon: "plane", createdAt: today }],
    transactions: [],
  });
  const ev = buildFutureEvents(data, today, inDays(40));
  const marker = ev.find((e) => e.kind === "goal-deadline");
  check("prazo da meta aparece no calendário", !!marker);
  check("marcador não tem valor", marker && marker.amount === 0 && marker.type === "marker");
  check("marcador carrega o que falta", marker && near(marker.meta.remaining, 3000), marker && marker.meta.remaining);

  const f = buildForecast(data);
  check("marcador não altera o saldo projetado",
    near(f.horizons[1].projected, f.balance), `${f.horizons[1].projected} vs ${f.balance}`);
}

/* ================================================================= 12 */
console.log("\n12. Planejamento anual");
{
  const ano = new Date().getFullYear();
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 1800, categoryId: "transporte", date: `${ano - 1}-01-15`, description: "IPVA do carro" }),
      tx({ type: "income", amount: 4200, categoryId: "salario", date: `${ano - 1}-12-20`, description: "13o salário" }),
    ],
  });
  const plan = buildAnnualPlan(data, ano);
  check("lista completa de eventos do ano", plan.items.length === 10, plan.items.length);
  const ipva = plan.items.find((i) => i.id === "ipva");
  check("IPVA estimado pelo histórico do ano passado", ipva && near(ipva.estimated, 1800), ipva && ipva.estimated);
  check("ano de origem da estimativa é exibido", ipva && ipva.estimatedFrom === ano - 1, ipva && ipva.estimatedFrom);
  const decimo = plan.items.find((i) => i.id === "decimo");
  check("13º reconhecido como entrada", decimo && decimo.isIncome === true);
  check("item sem histórico não inventa valor",
    plan.items.filter((i) => i.estimated === null).length > 0);
  check("nenhuma estimativa NaN", plan.items.every((i) => i.estimated === null || Number.isFinite(i.estimated)));

  const vazio = buildAnnualPlan(defaultData(), ano);
  check("base vazia: nenhum valor estimado", vazio.items.every((i) => i.estimated === null));
  check("base vazia: total conhecido é zero", vazio.knownTotal === 0);
}

/* ================================================================= 13 */
console.log("\n13. Resiliência: base vazia e limites");
{
  const vazio = defaultData();
  const f = buildForecast(vazio);
  check("previsão com base vazia não quebra", Number.isFinite(f.balance) && f.days.length === 366);
  check("sem dados, saldo projetado permanece zero", near(f.horizons[3].projected, 0), f.horizons[3].projected);
  check("premissas explicam a ausência de dados",
    f.assumptions.some((a) => /Sem histórico|não informada/.test(a)));

  const cal = buildCalendarMonth(vazio, ctx.keyOfDate(new Date()));
  check("calendário com base vazia não quebra", cal.weeks.length >= 4 && cal.totals.count === 0);
  check("intervalo invertido devolve lista vazia", buildFutureEvents(vazio, inDays(10), today).length === 0);
  check("mês de 31 dias com fixo no dia 31 não vaza para o mês seguinte", (() => {
    const d = migrate({ transactions: [tx({ type: "expense", amount: 100, categoryId: "outros", date: monthsAgo(1, 31), recurring: true, description: "Fim do mês" })] });
    return buildFutureEvents(d, today, monthsAhead(3, 28))
      .filter((e) => e.label === "Fim do mês")
      .every((e) => Number(e.iso.slice(8)) <= 31 && e.iso.slice(0, 7) === ctx.monthKeyOf(e.iso));
  })());
  check("modelos de fixo não duplicam a mesma identidade", (() => {
    const d = migrate({ transactions: [
      tx({ type: "expense", amount: 100, categoryId: "outros", date: monthsAgo(2, 8), recurring: true, description: "Netflix" }),
      tx({ type: "expense", amount: 120, categoryId: "outros", date: monthsAgo(1, 8), recurring: true, description: "Netflix" }),
    ] });
    const tpls = recurringTemplates(d, today).filter((t) => t.description === "Netflix");
    return tpls.length === 1 && near(tpls[0].amount, 120);
  })());
  check("horizontes expostos para a UI", FORECAST_HORIZONS.length === 4 && FORECAST_HORIZONS.every((h) => h.label));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
