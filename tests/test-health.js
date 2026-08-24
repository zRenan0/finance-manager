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

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/health.js"]
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

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
