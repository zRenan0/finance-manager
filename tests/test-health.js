// test-health.js — harness de verificação do motor de Saúde Financeira (Módulo 2).
// Carrega os módulos puros num contexto de VM (mesma técnica já usada no projeto),
// monta cenários financeiros reais e confere se cada indicador reage como deveria.
// Não faz parte do app: é ferramenta de desenvolvimento, roda com `node tests/test-health.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
vm.createContext(ctx);

// Relógio congelado: as fixtures deste arquivo lançam no dia 10 do mês corrente,
// e o app (corretamente) ignora o que ainda não aconteceu. Ver o cabeçalho de
// `tests/helpers/fixed-clock.js`.
const relogio = require("./helpers/fixed-clock").congelar(ctx);
const Date = relogio.DataFixa;

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/forecast.js", "js/health.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const { buildHealthModel, debtProfile, cashFlowHistory, savingsCapacity } = ctx;

/* ------------------------------------------------------------------ helpers */
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` → ${extra}` : ""}`); }
}
function iso(d) { return ctx.isoOfDate(d); }
function monthsAgo(n, day = 10) { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); }
function daysAhead(n) { return iso(new Date(Date.now() + n * 86400000)); }

// RELÓGIO CONGELADO PARA CENÁRIO DE FATURA.
//
// `debtProfile` chama `todayIso()` por dentro e não aceita data de referência.
// Um cenário de cartão montado com "hoje" muda de resposta conforme o dia do
// mês: uma compra feita depois do fechamento cai na fatura do mês seguinte, e o
// vencimento dela pode passar da janela de 30 dias que o comprometimento usa.
// O teste então falhava sozinho a partir de certo dia, sem nada ter mudado no
// código. Congelar o dia deixa o cenário descrever a REGRA contábil, que é o
// que ele existe para verificar, e não o calendário.
//
// `todayIso` é declaração de função no topo do contexto da VM, então vira
// propriedade do objeto global e pode ser trocada; quem a chama resolve o nome
// na hora da chamada. Devolve a função que restaura o original.
function congelarHoje(isoDate) {
  const original = ctx.todayIso;
  ctx.todayIso = () => isoDate;
  return () => { ctx.todayIso = original; };
}

// Igual à anterior, mas move TAMBÉM o `new Date()` do contexto. `monthProgress`
// (budgets.js) lê o dia do mês por ali e não por `todayIso()`; sem isto, um
// cenário que precisa acontecer no dia 8 fica com metade do app no dia 8 e a
// outra metade no dia 15, e o teste deixa de provar o que se propõe.
function congelarRelogio(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const Anterior = ctx.Date;
  const instante = new Anterior(y, m - 1, d, 12, 0, 0, 0).getTime();
  class DataFixa extends Anterior {
    constructor(...args) {
      if (args.length === 0) super(instante);
      else super(...args);
    }
    static now() { return instante; }
  }
  const restaurarHoje = congelarHoje(isoDate);
  ctx.Date = DataFixa;
  return () => { ctx.Date = Anterior; restaurarHoje(); };
}

let seq = 0;
function tx(p) {
  seq++;
  return ctx.makeTransaction({ id: `t${seq}`, ...p });
}
function base(over) {
  const d = ctx.defaultData();
  return { ...d, ...over };
}

/* ------------------------------------------------------- 1. usuário saudável */
console.log("\n1. Perfil saudável (renda 8k, gastos 5k, reserva cheia, aportes)");
{
  const transactions = [];
  for (let m = 5; m >= 0; m--) {
    transactions.push(tx({ type: "income", amount: 8000, categoryId: "salario", date: monthsAgo(m, 5), description: "Salário" }));
    transactions.push(tx({ type: "expense", amount: 3000, categoryId: "moradia", date: monthsAgo(m, 8), recurring: true }));
    transactions.push(tx({ type: "expense", amount: 2000, categoryId: "alimentacao", date: monthsAgo(m, 12) }));
    transactions.push(tx({ type: "expense", amount: 1200, categoryId: "investimento", date: monthsAgo(m, 6) }));
  }
  const data = base({
    monthlyIncome: 8000,
    transactions,
    goals: [{ id: "g1", name: "Reserva de emergência", target: 36000, current: 36000, savedUpfront: 0, icon: "piggy", deadline: null }],
  });

  const m = buildHealthModel(data);
  const by = Object.fromEntries(m.indicators.map((i) => [i.id, i]));

  check("7 indicadores devolvidos", m.indicators.length === 7, m.indicators.length);
  check("reserva completa → ótimo", by.reserva.status.id === "otimo", by.reserva.status.id);
  check("sem dívidas → 0% comprometido", by.dividas.display === "0%", by.dividas.display);
  check("fluxo de caixa positivo em todos os meses", by.fluxo.display.startsWith("6/"), by.fluxo.display);
  check("investimentos avaliados", by.investimentos.applicable === true);
  check("headline positiva ou de atenção leve", m.headline.tone !== "danger", m.headline.tone);
  check("plano de ação curto", m.actionPlan.length <= 2, m.actionPlan.length);
  console.log(`     headline: ${m.headline.title}`);
}

/* ---------------------------------------------------- 2. endividado, no vermelho */
console.log("\n2. Perfil endividado (renda 4k, parcelas pesadas, sem reserva)");
{
  const transactions = [];
  for (let mo = 5; mo >= 0; mo--) {
    transactions.push(tx({ type: "income", amount: 4000, categoryId: "salario", date: monthsAgo(mo, 5) }));
    transactions.push(tx({ type: "expense", amount: 2600, categoryId: "moradia", date: monthsAgo(mo, 8), recurring: true }));
    transactions.push(tx({ type: "expense", amount: 1900, categoryId: "lazer", date: monthsAgo(mo, 15), payment: "Crédito" }));
  }
  // 10 parcelas futuras de R$ 400 no crédito
  for (let i = 1; i <= 10; i++) {
    transactions.push(tx({
      type: "expense", amount: 400, categoryId: "outros", payment: "Crédito",
      date: iso(new Date(new Date().getFullYear(), new Date().getMonth() + i, 12)),
      description: `Notebook (${i}/10)`, installmentGroupId: "grp1", installmentIndex: i, installmentTotal: 10,
    }));
  }
  const data = base({ monthlyIncome: 4000, transactions });
  const m = buildHealthModel(data);
  const by = Object.fromEntries(m.indicators.map((i) => [i.id, i]));

  check("dívidas em atenção ou crítico", ["atencao", "critico"].includes(by.dividas.status.id), by.dividas.status.id);
  check("dívidas traz recomendação", !!by.dividas.recommendation);
  check("reserva zerada → crítico", by.reserva.status.id === "critico", by.reserva.status.id);
  check("fluxo de caixa negativo detectado", by.fluxo.status.id !== "otimo", by.fluxo.status.id);
  check("headline de risco", m.headline.tone === "danger", m.headline.tone);
  check("plano começa por liquidez ou dívida", ["liquidez", "dividas"].includes(m.actionPlan[0].id), m.actionPlan[0].id);
  check("plano no máximo 4 itens", m.actionPlan.length <= 4, m.actionPlan.length);

  const d = debtProfile(data, ctx.keyOfDate(new Date()));
  check("parcelas futuras somam 4000", Math.abs(d.installmentsAhead - 4000) < 0.01, d.installmentsAhead);
  check("prazo de quitação ~10 meses", d.monthsToClear >= 9 && d.monthsToClear <= 11, d.monthsToClear);
  console.log(`     comprometimento: ${d.burdenPct.toFixed(1)}% da renda | headline: ${m.headline.title}`);
}

/* -------------------------------------------------------- 3. base vazia */
console.log("\n3. App recém-instalado (nenhum dado)");
{
  const m = buildHealthModel(base({}));
  check("nenhum indicador quebra", m.indicators.length === 7);
  check("todos marcados sem dados", m.indicators.every((i) => !i.applicable), JSON.stringify(m.indicators.filter((i) => i.applicable).map((i) => i.id)));
  check("headline neutra", m.headline.tone === "neutral", m.headline.tone);
  check("plano vazio", m.actionPlan.length === 0);
  check("score marcado como insuficiente", m.score && m.score.insufficient === true);
}

/* ---------------------------------------------- 4. anti-dupla-contagem no crédito */
console.log("\n4. Parcela do crédito no mês corrente não é contada duas vezes");
{
  // O cenário exige uma parcela AINDA NO FUTURO dentro do mês corrente. Com
  // "hoje mais 3 dias, no máximo 28", do dia 28 em diante a data deixava de ser
  // futura e o cenário passava a testar outra coisa. Dia fixo resolve.
  const hoje = "2026-08-10";
  const mesCorrente = "2026-08";
  const descongelar = congelarHoje(hoje);
  const transactions = [
    tx({ type: "income", amount: 5000, categoryId: "salario", date: "2026-08-01" }),
    tx({
      type: "expense", amount: 300, categoryId: "outros", payment: "Crédito",
      date: "2026-08-13",
      installmentGroupId: "g", installmentIndex: 2, installmentTotal: 5,
    }),
  ];
  const data = base({ monthlyIncome: 5000, transactions });
  const d = debtProfile(data, mesCorrente);
  descongelar();
  check("fatura do mês contém a parcela", Math.abs(d.creditBill - 300) < 0.01, d.creditBill);
  check("comprometimento não dobra o valor", Math.abs(d.monthlyBurden - 300) < 0.01, d.monthlyBurden);
}

/* ----------------------------------------------- 5. capacidade x poupança real */
console.log("\n5. Capacidade de poupança separa essencial de desejo");
{
  const transactions = [
    tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(0, 1) }),
    tx({ type: "expense", amount: 2000, categoryId: "moradia", date: monthsAgo(0, 3) }),      // necessidade
    tx({ type: "expense", amount: 1500, categoryId: "lazer", date: monthsAgo(0, 4) }),        // desejo
  ];
  const data = base({ monthlyIncome: 6000, transactions });
  const s = savingsCapacity(data, ctx.keyOfDate(new Date()));
  check("essenciais = 2000", Math.abs(s.essentials - 2000) < 0.01, s.essentials);
  check("capacidade teórica = 4000", Math.abs(s.capacity - 4000) < 0.01, s.capacity);
  check("economia real = 2500", Math.abs(s.actual - 2500) < 0.01, s.actual);
  check("lacuna = 1500 (o que virou desejo)", Math.abs(s.gap - 1500) < 0.01, s.gap);
}

console.log("\n5b. Cartão cadastrado entra uma vez no diagnóstico de dívidas");
{
  // Dia 10, antes do fechamento (20): a compra entra na fatura DESTE mês, que
  // vence no dia 28 e portanto cai dentro dos 30 dias do comprometimento.
  const today = "2026-08-10";
  const mesCorrente = "2026-08";
  const descongelar = congelarHoje(today);
  const account = { id: "ha", name: "Conta", type: "corrente", openingBalance: 0, openingDate: today };
  const card = { id: "hc", name: "Cartão", accountId: "ha", limit: 5000, closingDay: 20, dueDay: 28 };
  const purchases = ctx.makeInstallmentTransactions({
    type: "expense", amount: 1200, categoryId: "outros", date: today,
    payment: "Crédito", creditCardId: "hc", installmentGroupId: "health-card",
  }, 3);
  const data = ctx.migrate(base({
    monthlyIncome: 5000,
    accounts: [account], creditCards: [card],
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: today }), ...purchases],
  }));
  const d = debtProfile(data, mesCorrente);
  descongelar();
  check("saldo total do cartão entra na dívida", Math.abs(d.cardOutstanding - 1200) < 0.01, d.cardOutstanding);
  check("parcelas cadastradas não são somadas de novo", Math.abs(d.installmentsAhead) < 0.01, d.installmentsAhead);
  check("dívida total contém o cartão uma única vez", Math.abs(d.outstanding - 1200) < 0.01, d.outstanding);
  check("a fatura próxima entra no comprometimento mensal", d.creditBill > 0 && d.creditBill <= 1200, d.creditBill);
  // Só a fatura de agosto entra: as duas parcelas seguintes vencem depois da
  // janela de 30 dias e continuam contadas apenas na dívida total.
  check("e só ela, porque as parcelas seguintes ficam fora da janela", Math.abs(d.creditBill - 400) < 0.01, d.creditBill);
  check("o relógio voltou ao normal depois do cenário", ctx.todayIso() === ctx.isoOfDate(new Date()));
}

/* -------------------------------------------- 6. robustez: dados corrompidos */
console.log("\n6. Robustez com dados inválidos");
{
  const data = base({
    monthlyIncome: NaN,
    transactions: [
      { id: "x1", type: "expense", amount: null, categoryId: "outros", date: "2025-13-45", monthKey: "2025-13" },
      { id: "x2", type: "income", amount: "abc", categoryId: "salario", date: daysAhead(5), monthKey: ctx.monthKeyOf(daysAhead(5)) },
    ],
    goals: [{ id: "g", name: "Reserva", target: -100, current: null }],
  });
  let ok = true, err = null;
  let m;
  try { m = buildHealthModel(data); } catch (e) { ok = false; err = e.message; }
  check("modelo é construído sem lançar exceção", ok, err);
  check("nenhum valor NaN vaza para a tela", ok && m.indicators.every((i) => !/NaN|undefined/.test(i.display + i.description)),
    ok ? m.indicators.map((i) => i.display).join("|") : "");
}

/* -------------------------------------------- 7. histórico de fluxo de caixa */
console.log("\n7. Fluxo de caixa ignora meses sem movimento");
{
  const transactions = [
    tx({ type: "income", amount: 3000, categoryId: "salario", date: monthsAgo(0, 2) }),
    tx({ type: "expense", amount: 1000, categoryId: "moradia", date: monthsAgo(0, 3) }),
  ];
  const data = base({ monthlyIncome: 0, transactions });
  const f = cashFlowHistory(data, 6);
  check("apenas 1 mês considerado", f.considered === 1, f.considered);
  check("mês positivo", f.positives === 1, f.positives);
  check("resultado médio = 2000", Math.abs(f.avgResult - 2000) < 0.01, f.avgResult);
}

/* ------------------------------------ 8. [M41] A projeção linear e o veredito */
// ------------------------------------------------------------------------------
// O CENÁRIO CONGELADO DO DEFEITO MAIS CARO QUE ESTE APP JÁ TEVE
// ------------------------------------------------------------------------------
// Renda de R$ 7.200, aluguel de R$ 1.850 pago no dia 3, R$ 60 por dia de gasto
// variável, e hoje é dia 8. A pessoa recebeu tudo, gastou R$ 2.330 e guardou
// dois terços da renda.
//
// A extrapolação linear (`gasto ÷ fração do mês decorrida`) dividia R$ 2.330
// por 8/30 e projetava R$ 8.737 de gastos: o aluguel multiplicado por 3,75,
// como se ele fosse cobrado quase quatro vezes no mesmo mês. Esse número
// alimentava `scoreMonthBasis`, e o efeito não era um dígito errado num canto:
//
//   poupança (peso 25)  taxa projetada negativa  → 0 de 25
//   gastos   (peso 15)  121% da renda            → 0 de 15
//
// 40 pontos de peso zerados por um artefato de divisão. Quem guardou dois
// terços da renda recebia "Crítico" e a frase "prioridade agora é estancar o
// desequilíbrio". O app não errava um número; errava o veredito.
//
// Este cenário fica congelado para que a regressão não volte por outra porta.
console.log("\n8. [M41] Projeção do mês: o aluguel não é cobrado todo dia");
{
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diaHoje = 8;
  const dim = ctx.daysInMonthOf(ano, mes);
  const mKey = ctx.keyOfDate(hoje);
  const noDia = (offsetMes, dia) => {
    const d = new Date(ano, mes - offsetMes, 1);
    const max = ctx.daysInMonthOf(d.getFullYear(), d.getMonth());
    return iso(new Date(d.getFullYear(), d.getMonth(), Math.min(dia, max)));
  };

  const transactions = [];
  // Três meses fechados idênticos, para a média de gasto variável ter base.
  for (let m = 3; m >= 0; m--) {
    const d = new Date(ano, mes - m, 1);
    const dias = m === 0 ? diaHoje : ctx.daysInMonthOf(d.getFullYear(), d.getMonth());
    transactions.push(tx({ type: "income", amount: 7200, categoryId: "salario", date: noDia(m, 1), description: "Salário" }));
    transactions.push(tx({ type: "expense", amount: 1850, categoryId: "moradia", date: noDia(m, 3), description: "Aluguel", recurring: true }));
    for (let dia = 1; dia <= dias; dia++) {
      transactions.push(tx({ type: "expense", amount: 60, categoryId: "alimentacao", date: noDia(m, dia), description: `Mercado ${dia}` }));
    }
  }
  // Tetos de categoria já na base, para provar o mesmo defeito na tela de
  // orçamentos: `budgetForCategory` lê o teto do cadastro da categoria.
  const categories = ctx.defaultData().categories.map((c) => (
    c.id === "moradia" ? { ...c, budget: 2200 }
      : c.id === "alimentacao" ? { ...c, budget: 2400 }
      : c));
  const data = ctx.migrate(base({ monthlyIncome: 7200, transactions, goals: [], categories }));

  const restaurar = congelarRelogio(noDia(0, diaHoje));
  const snap = ctx.monthSnapshot(data, mKey);
  const score = ctx.computeFinanceScore(data, mKey);
  const outlook = ctx.monthExpenseOutlook(data, noDia(0, diaHoje));
  const tetos = ctx.computeBudgetStatus(data, mKey);
  const progresso = ctx.monthProgress(mKey);
  // O veredito que a extrapolação linear produzia, reconstruído com a fórmula
  // antiga sobre os MESMOS dados. Ele fica no teste para que a diferença entre
  // "Crítico" e "Regular" continue visível a quem ler isto daqui a um ano.
  const snapAntigo = { ...snap, projectedExpense: ctx.divMoney(snap.expense, snap.progress.ratio) };
  snapAntigo.projectedSavings = ctx.subMoney(snap.incomeProjected, snapAntigo.projectedExpense);
  snapAntigo.projectedSavingsRate = ctx.safePct(snapAntigo.projectedSavings, snap.incomeProjected);
  const scoreAntigo = ctx.computeFinanceScore(data, mKey, { month: snapAntigo });
  restaurar();

  const realizado = 1850 + 60 * diaHoje;                 // R$ 2.330
  const linearAntigo = realizado / (diaHoje / dim);      // o que a conta velha dava

  check("o realizado até o dia 8 é o esperado", Math.abs(snap.expense - realizado) < 0.02, snap.expense);
  check("a projeção fica na casa do mês inteiro de verdade (~R$ 3.650)",
    snap.projectedExpense > 3300 && snap.projectedExpense < 3900, snap.projectedExpense);
  check("a projeção não passa de ~R$ 3.650", snap.projectedExpense <= 3700, snap.projectedExpense);
  check("e é MUITO menor que a extrapolação linear que existia antes",
    snap.projectedExpense < linearAntigo * 0.6,
    `projetado ${snap.projectedExpense.toFixed(2)} contra linear ${linearAntigo.toFixed(2)}`);

  // As três parcelas da conta, para a explicação da tela poder ser reconstruída.
  check("a projeção é realizado + compromissos + variável restante",
    Math.abs(outlook.realizado + outlook.compromissos + outlook.variaveis - outlook.projetado) < 0.02,
    JSON.stringify(outlook));
  check("o aluguel já lançado não é projetado de novo neste mês",
    outlook.compromissos === 0, outlook.compromissos);

  // O VEREDITO. É por isto que a correção é P0 e não um ajuste de exibição.
  check("a economia projetada é positiva", snap.projectedSavings > 0, snap.projectedSavings);
  check("o score não desaba para Crítico", score.score >= 50, `${score.score} (${score.level.id})`);
  check("o nível é ao menos Regular",
    ["regular", "bom", "excelente"].indexOf(score.level.id) >= 0, score.level.id);

  const poupanca = score.pillars.find((p) => p.id === "poupanca");
  const gastos = score.pillars.find((p) => p.id === "gastos");
  check("o pilar de poupança recebe a pontuação cheia", poupanca.points === poupanca.weight,
    `${poupanca.points}/${poupanca.weight}`);
  check("o pilar de gastos recebe a pontuação cheia", gastos.points === gastos.weight,
    `${gastos.points}/${gastos.weight}`);
  check("o pilar de poupança não fala em \"vermelho\"", !/vermelho/.test(poupanca.detail), poupanca.detail);

  // A prova de que o defeito era de VEREDITO e não de exibição: com a fórmula
  // antiga, os mesmos dados davam Crítico e zeravam 40 pontos de peso.
  check("a fórmula antiga, nestes dados, projetava ~R$ 8.737",
    Math.abs(snapAntigo.projectedExpense - linearAntigo) < 1, snapAntigo.projectedExpense);
  check("a fórmula antiga rebaixava o veredito para Crítico",
    scoreAntigo.level.id === "critico", `${scoreAntigo.score} (${scoreAntigo.level.id})`);
  check("a fórmula antiga zerava poupança e gastos",
    scoreAntigo.pillars.find((p) => p.id === "poupanca").points === 0
    && scoreAntigo.pillars.find((p) => p.id === "gastos").points === 0);
  check("a correção devolve os 40 pontos de peso",
    score.score - scoreAntigo.score >= 30, `${scoreAntigo.score} → ${score.score}`);
  console.log(`     projeção: ${snap.projectedExpense.toFixed(2)} (antes ${snapAntigo.projectedExpense.toFixed(2)}) | score: ${score.score} ${score.level.label} (antes ${scoreAntigo.score} ${scoreAntigo.level.label})`);

  // A MESMA MENTIRA VIVIA NO TETO POR CATEGORIA. Moradia com o aluguel pago no
  // dia 3 projetava R$ 6.937 contra um teto de R$ 2.200 e disparava "você vai
  // estourar" para quem já tinha pago a conta do mês inteiro. Alarme falso é
  // pior que alarme nenhum: ele ensina a ignorar o cartão.
  const moradia = tetos.items.find((i) => i.id === "moradia");
  const comida = tetos.items.find((i) => i.id === "alimentacao");
  check("o teto de Moradia projeta o aluguel uma vez só",
    Math.abs(moradia.projected - 1850) < 0.02, moradia.projected);
  check("e não avisa estouro para uma conta já paga", moradia.willExceed === false);
  check("a extrapolação antiga passaria de R$ 6.900",
    moradia.spent / progresso.ratio > 6900, (moradia.spent / progresso.ratio).toFixed(2));
  check("o gasto variável continua sendo extrapolado pelo ritmo",
    Math.abs(comida.projected - (60 * diaHoje) / progresso.ratio) < 1, comida.projected);
}

/* ------------------------------- 9. [M41] A reserva mede e mira na mesma régua */
// O cartão dizia "cobre 2,1 de 6 meses de despesa (R$ 3.963,38/mês)" e, logo
// abaixo, "Alvo: R$ 21.600,00". Mas 6 × 3.963,38 = 23.780,28: o alvo vinha da
// meta cadastrada e a contagem de meses vinha do ajuste. Alcançar o alvo
// exibido dá 5,45 meses, não 6, e nenhuma das duas frases explicava a outra.
console.log("\n9. [M41] Reserva: o alvo exibido e a régua de meses são o mesmo número");
{
  const transactions = [];
  for (let m = 3; m >= 1; m--) {
    transactions.push(tx({ type: "income", amount: 7000, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 4000, categoryId: "moradia", date: monthsAgo(m, 8), recurring: true }));
  }
  const comMeta = base({
    monthlyIncome: 7000, transactions, emergencyMonths: 6,
    goals: [{ id: "g-res", name: "Reserva de emergência", target: 20000, current: 8400, savedUpfront: 0, icon: "piggy", deadline: null }],
  });
  const r = ctx.emergencyFund(comMeta);

  check("a despesa média é a base declarada", Math.abs(r.monthlyNeed - 4000) < 0.02, r.monthlyNeed);
  check("o alvo vem da meta que a pessoa cadastrou", r.targetSource === "meta" && r.target === 20000, r.target);
  // A IDENTIDADE QUE FALTAVA: o alvo exibido, na régua exibida, dá os meses exibidos.
  check("alvo ÷ despesa média = meses do alvo",
    Math.abs(r.targetMonthsEffective * r.monthlyNeed - r.target) < 0.02,
    { efetivo: r.targetMonthsEffective, produto: r.targetMonthsEffective * r.monthlyNeed, alvo: r.target });
  check("e não são os 6 meses do ajuste", Math.abs(r.targetMonthsEffective - 5) < 0.01 && r.targetMonths === 6,
    r.targetMonthsEffective);

  const pilar = ctx.computeFinanceScore(comMeta, ctx.keyOfDate(new Date())).pillars.find((p) => p.id === "reserva");
  check("o score mede contra o alvo exibido, não contra os 6 meses",
    Math.abs(pilar.ratio - r.monthsCovered / r.targetMonthsEffective) < 0.001, pilar.ratio);
  check("e a frase declara que o alvo é da pessoa", /definido por você/.test(pilar.detail), pilar.detail);

  // Sem meta cadastrada, o alvo volta a ser N meses de despesa e as duas
  // réguas coincidem por construção.
  const semMeta = base({ monthlyIncome: 7000, transactions, emergencyMonths: 6, goals: [] });
  const s = ctx.emergencyFund(semMeta);
  check("sem meta o alvo é a regra de N meses", s.targetSource === "regra" && Math.abs(s.target - 24000) < 0.02, s.target);
  check("e as duas réguas coincidem", Math.abs(s.targetMonthsEffective - s.targetMonths) < 0.001, s.targetMonthsEffective);
}

/* ----------------------- 10. [M41] Uma janela só para o crescimento do patrimônio */
// A mesma tela mostrava "+443,2%" no cartão de patrimônio (série de 6 meses) e
// "seu patrimônio cresceu 251,1% nos últimos meses" no cartão de score (série de
// 4). Dois números certos para a mesma grandeza, sem período escrito em nenhum.
console.log("\n10. [M41] Crescimento do patrimônio: uma janela, com o período escrito");
{
  const transactions = [];
  for (let m = 6; m >= 0; m--) {
    transactions.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 3000, categoryId: "moradia", date: monthsAgo(m, 8), recurring: true }));
  }
  const data = base({ monthlyIncome: 6000, transactions });

  const g = ctx.netWorthGrowth(data);
  const pilar = ctx.computeFinanceScore(data, ctx.keyOfDate(new Date())).pillars.find((p) => p.id === "patrimonio");

  check("o crescimento é medido", g.measurable && Number.isFinite(g.pct), g.pct);
  check("o pilar do score usa exatamente o mesmo percentual",
    Math.abs(ctx.computeFinanceScore(data, ctx.keyOfDate(new Date())).pillars.find((p) => p.id === "patrimonio").ratio
      - ctx.clamp((g.pct + 10) / 20, 0, 1)) < 0.001);
  check("a frase diz desde quando", new RegExp(`desde ${g.sinceLabel}`).test(pilar.detail), pilar.detail);
  check("o período é o primeiro ponto da série", g.fromKey === g.series[0].key);

  // As duas janelas somem do código: quem quiser este número chama a função.
  const scoreSrc = readSrc("js/score.js");
  const painel = readSrc("js/screens/dashboard.js");
  check("o score não monta mais a própria série de 4 meses", !/netWorthSeries\(data, 4\)/.test(scoreSrc));
  check("o cartão de patrimônio não monta mais a própria série de 6",
    !/netWorthSeries\(state\.data, 6\)/.test(painel) && /netWorthGrowth\(state\.data\)/.test(painel));
  check("e o cartão escreve o período na tela", /desde \$\{g\.sinceLabel\}/.test(painel));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
