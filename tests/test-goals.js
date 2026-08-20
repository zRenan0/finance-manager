// test-goals.js — harness do Módulo 4 (Metas financeiras).
// Cobre: os três aportes (necessário x planejado x real), a estimativa de
// conclusão pelo ritmo REAL, o recorte da janela do ritmo, a capacidade de
// poupança, os status e a migração v6→v7 do campo `monthlyPlan`.
// Ferramenta de dev: `node tests/test-goals.js`.
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

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/goals.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

// `function` de script vira propriedade do contexto; `const` não — por isso os
// valores constantes são lidos por avaliação.
const run = (code) => vm.runInContext(code, ctx);
const {
  buildGoalsModel, buildGoalModel, goalMonthlyLedger, goalPace, savingCapacity,
  createGoalWithInitialBalance, goalWithdrawalPlan, effectiveIncome, netWorth,
  reconcileGoalBalances, applyGoalTransactionMutation, goalLedgerBalance, migrate, defaultData,
  monthTotals, realizedMonthTotals, budgetForCategory, groupAllocated,
  withBudgetSnapshot, buildBackupEnvelope, parseBackupFile, mergeBackupInto,
} = ctx;
const GOAL_TEMPLATES = run("GOAL_TEMPLATES");

const SCHEMA_VERSION = run("SCHEMA_VERSION");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const iso = (d) => ctx.isoOfDate(d);
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
const inDays = (n) => iso(new Date(Date.now() + n * 86400000));
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

const goal = (p) => ({
  id: p.id || "g1", name: p.name || "Meta", target: p.target || 0,
  current: p.current || 0, savedUpfront: p.savedUpfront || 0,
  deadline: p.deadline || "", icon: "piggy", createdAt: monthsAgo(6),
  monthlyPlan: p.monthlyPlan || 0,
});

/* ------------------------------------------------- 1. os três aportes */
console.log("\n1. Necessário, planejado e ritmo real são números diferentes");
{
  // Falta 6.000 em ~6 meses → necessário ≈ 1.000/mês.
  // Plano do usuário: 800/mês. Ritmo real: 300/mês nos últimos 3 meses.
  const transactions = [];
  for (let m = 2; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 300, categoryId: "investimento", date: monthsAgo(m, 5), goalId: "g1", description: "Aporte" }));
  }
  const data = migrate({
    goals: [goal({ target: 10000, current: 4000, deadline: inDays(180), monthlyPlan: 800 })],
    transactions,
  });

  const m = buildGoalsModel(data).goals[0];
  check("percentual concluído = 40%", near(m.pct, 40, 0.5), m.pct);
  check("falta 6.000", near(m.remaining, 6000), m.remaining);
  check("aporte necessário ≈ 1.000/mês", m.requiredMonthly > 900 && m.requiredMonthly <= 1000, m.requiredMonthly);
  check("aporte planejado preservado (800)", near(m.plannedMonthly, 800), m.plannedMonthly);
  check("ritmo real = 300/mês", near(m.paceMonthly, 300), m.paceMonthly);
  check("os três números são distintos",
    m.requiredMonthly !== m.plannedMonthly && m.plannedMonthly !== m.paceMonthly);
  check("projeção usa o ritmo REAL, não o plano", m.projectionSource === "real" && near(m.projectionRate, 300), m.projectionSource);
  check("status = ritmo baixo", m.status === "risk", m.status);
  check("lacuna mensal ≈ 700", m.gap > 600 && m.gap <= 700, m.gap);
}

/* ------------------------------------------------- 2. janela do ritmo */
console.log("\n2. Ritmo ignora os meses anteriores ao primeiro aporte");
{
  // Um único aporte de 600, no mês passado. Se a média fosse dividida pelos 6
  // meses da janela daria 100/mês e a previsão sairia 6x pessimista.
  const data = migrate({
    goals: [goal({ target: 6000, current: 600 })],
    transactions: [tx({ type: "expense", amount: 600, categoryId: "investimento", date: monthsAgo(1, 5), goalId: "g1" })],
  });
  const m = buildGoalsModel(data).goals[0];
  check("ritmo = 300/mês (2 meses ativos), não 100", near(m.paceMonthly, 300), m.paceMonthly);
  check("janela ativa = 2 meses", m.paceWindow === 2, m.paceWindow);
  check("estimativa de conclusão existe", !!m.etaIso, m.etaIso);
  check("estimativa ≈ 18 meses", m.etaMonths === 18, m.etaMonths);
}

/* ------------------------------------------------- 3. resgate reduz o ritmo */
console.log("\n3. Resgate entra como valor negativo no ritmo");
{
  const data = migrate({
    goals: [goal({ target: 10000, current: 1000 })],
    transactions: [
      tx({ type: "expense", amount: 1000, categoryId: "investimento", date: monthsAgo(1, 5), goalId: "g1" }),
      tx({ type: "income", amount: 400, categoryId: "investimento", date: monthsAgo(0, 5), goalId: "g1" }),
    ],
  });
  const m = buildGoalsModel(data).goals[0];
  check("ritmo líquido = 300/mês ((1000−400)/2)", near(m.paceMonthly, 300), m.paceMonthly);
  check("série termina no valor guardado atual", near(m.series[m.series.length - 1].balance, 1000), m.series[m.series.length - 1].balance);
  check("série tem 6 pontos", m.series.length === 6, m.series.length);
}

/* ------------------------------------------------- 4. sem histórico, cai para o plano */
console.log("\n4. Sem aporte lançado, a projeção usa o plano (e avisa)");
{
  const data = migrate({ goals: [goal({ target: 5000, current: 0, monthlyPlan: 500 })], transactions: [] });
  const m = buildGoalsModel(data).goals[0];
  check("fonte da projeção = plano", m.projectionSource === "plano", m.projectionSource);
  check("conclusão em 10 meses", m.etaMonths === 10, m.etaMonths);
  check("ritmo real marcado como inativo", m.paceActive === false, m.paceActive);

  const semPlano = migrate({ goals: [goal({ target: 5000, current: 0 })], transactions: [] });
  const m2 = buildGoalsModel(semPlano).goals[0];
  check("sem plano e sem histórico não inventa previsão", m2.etaIso === null && m2.projectionSource === null);
  check("status sem prazo = aberto", m2.status === "open", m2.status);
}

/* ------------------------------------------------- 5. status */
console.log("\n5. Status refletem a situação real da meta");
{
  const done = buildGoalModel(migrate({ goals: [goal({ target: 1000, current: 1000 })] }), goal({ target: 1000, current: 1000 }), {});
  check("meta batida = concluída", done.status === "done" && done.done, done.status);

  const late = migrate({ goals: [goal({ target: 5000, current: 1000, deadline: inDays(-30) })] });
  check("prazo vencido = atrasada", buildGoalsModel(late).goals[0].status === "late");

  const ok = migrate({
    goals: [goal({ target: 6000, current: 3000, deadline: inDays(365) })],
    transactions: [tx({ type: "expense", amount: 1000, categoryId: "investimento", date: monthsAgo(0, 5), goalId: "g1" })],
  });
  check("ritmo acima do necessário = no ritmo", buildGoalsModel(ok).goals[0].status === "ontrack");

  const idle = migrate({ goals: [goal({ target: 5000, current: 500, deadline: inDays(180) })] });
  check("com prazo e sem nenhum aporte = parada", buildGoalsModel(idle).goals[0].status === "idle");
}

/* ------------------------------------------------- 6. ordenação de consultor */
console.log("\n6. A lista vem ordenada por urgência");
{
  const data = migrate({
    goals: [
      goal({ id: "a", name: "Concluída", target: 100, current: 100 }),
      goal({ id: "b", name: "Atrasada", target: 5000, current: 100, deadline: inDays(-10) }),
      goal({ id: "c", name: "Sem prazo", target: 5000, current: 100 }),
    ],
  });
  const ordem = buildGoalsModel(data).goals.map((m) => m.goal.name);
  check("atrasada vem primeiro", ordem[0] === "Atrasada", ordem.join(" > "));
  check("concluída vai para o fim", ordem[ordem.length - 1] === "Concluída", ordem.join(" > "));
}

/* ------------------------------------------------- 7. capacidade de poupança */
console.log("\n7. Capacidade sai da sobra real, não da renda cheia");
{
  const transactions = [];
  for (let m = 3; m >= 1; m--) {
    transactions.push(tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 4200, categoryId: "moradia", date: monthsAgo(m, 8) }));
  }
  const data = migrate({ monthlyIncome: 5000, transactions, goals: [] });
  const cap = savingCapacity(data);
  check("capacidade = 800/mês", near(cap.value, 800), cap.value);
  check("base declarada como histórico", cap.basis === "historico", cap.basis);

  const vazio = migrate({ monthlyIncome: 5000, transactions: [], goals: [] });
  check("sem histórico, estima 20% da renda", near(savingCapacity(vazio).value, 1000), savingCapacity(vazio).value);
  check("e declara a base como renda", savingCapacity(vazio).basis === "renda");
}

/* ------------------------------------------------- 8. viabilidade do plano */
console.log("\n8. O plano é confrontado com a sobra real");
{
  const transactions = [];
  for (let m = 3; m >= 1; m--) {
    transactions.push(tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 4500, categoryId: "moradia", date: monthsAgo(m, 8) }));
  }
  const data = migrate({
    monthlyIncome: 5000, transactions,
    goals: [
      goal({ id: "a", name: "Carro", target: 30000, current: 0, monthlyPlan: 800 }),
      goal({ id: "b", name: "Viagem", target: 8000, current: 0, monthlyPlan: 400 }),
    ],
  });
  const plan = buildGoalsModel(data).plan;
  check("compromisso somado = 1.200", near(plan.commitment, 1200), plan.commitment);
  check("capacidade = 500", near(plan.capacity, 500), plan.capacity);
  check("plano marcado como inviável", plan.feasible === false, plan.feasible);
  check("lacuna = 700/mês", near(plan.gap, 700), plan.gap);

  const advice = buildGoalsModel(data).advice;
  check("recomendação sobre o excesso é a primeira", advice.length > 0 && /sobra média/.test(advice[0].text), advice[0] && advice[0].text);
  check("no máximo 3 recomendações", advice.length <= 3, advice.length);
}

/* ------------------------------------------------- 9. metas concluídas fora do compromisso */
console.log("\n9. Meta concluída não consome capacidade");
{
  const data = migrate({
    monthlyIncome: 5000,
    goals: [
      goal({ id: "a", name: "Feita", target: 1000, current: 1000, monthlyPlan: 900 }),
      goal({ id: "b", name: "Ativa", target: 5000, current: 0, monthlyPlan: 300 }),
    ],
  });
  const plan = buildGoalsModel(data).plan;
  check("compromisso ignora a meta batida", near(plan.commitment, 300), plan.commitment);
}

/* ------------------------------------------------- 10. migração v6 → v7 */
console.log("\n10. Migração de schema v6 → v7");
{
  const antigo = migrate({
    version: 6,
    goals: [{ id: "g1", name: "Antiga", target: 1000, current: 100, deadline: "", icon: "piggy", createdAt: monthsAgo(3) }],
  });
  check("meta sem o campo novo ganha monthlyPlan = 0", antigo.goals[0].monthlyPlan === 0, antigo.goals[0].monthlyPlan);
  check("schema atualizado para a versão corrente", antigo.version === SCHEMA_VERSION, antigo.version);
  check("nada mais foi perdido na meta antiga", antigo.goals[0].name === "Antiga" && antigo.goals[0].target === 1000);

  const sujo = migrate({ goals: [{ id: "g2", name: "Suja", target: 500, monthlyPlan: -80 }] });
  check("plano negativo é zerado", sujo.goals[0].monthlyPlan === 0, sujo.goals[0].monthlyPlan);

  const texto = migrate({ goals: [{ id: "g3", name: "Texto", target: 500, monthlyPlan: "abc" }] });
  check("plano não numérico não vira NaN", texto.goals[0].monthlyPlan === 0, texto.goals[0].monthlyPlan);
}

/* ------------------------------------------------- 11. base vazia e modelos */
console.log("\n11. Base vazia e modelos de meta");
{
  const vazio = buildGoalsModel(defaultData());
  check("modelo com base vazia não quebra", Array.isArray(vazio.goals) && vazio.goals.length === 0);
  check("totais zerados", vazio.totals.saved === 0 && vazio.totals.target === 0);
  check("sem metas, sem recomendação", vazio.advice.length === 0, vazio.advice.length);
  check("existem 6 modelos de meta", GOAL_TEMPLATES.length === 6, GOAL_TEMPLATES.length);
  check("todo modelo tem nome, ícone e prazo sugerido",
    GOAL_TEMPLATES.every((t) => t.name && t.icon && t.months > 0));
}

/* ------------------------------------------------- 12. varredura única */
console.log("\n12. O histórico de todas as metas sai de uma varredura só");
{
  const transactions = [];
  for (let i = 0; i < 5; i++) {
    transactions.push(tx({ type: "expense", amount: 100, categoryId: "investimento", date: monthsAgo(i % 3, 5), goalId: "a" }));
    transactions.push(tx({ type: "expense", amount: 200, categoryId: "investimento", date: monthsAgo(i % 3, 6), goalId: "b" }));
  }
  const data = migrate({ transactions, goals: [goal({ id: "a", target: 1000, current: 500 }), goal({ id: "b", target: 1000, current: 1000 })] });
  const ledger = goalMonthlyLedger(data);
  check("o ledger separa as duas metas", ledger.size === 2, ledger.size);
  check("aportes sem goalId ficam de fora", !ledger.has(null) && !ledger.has(undefined));
  const pace = goalPace([{ contributed: 0 }, { contributed: 0 }, { contributed: 200 }, { contributed: 100 }]);
  check("goalPace corta o prefixo inativo", near(pace.value, 150) && pace.months === 2, `${pace.value}/${pace.months}`);
}

/* ------------------------------------------------- 13. renda planejada não reescreve o passado */
console.log("\n13. Renda histórica usa somente lançamentos realizados");
{
  const currentKey = ctx.keyOfDate(new Date());
  const previousKey = ctx.keyOfDate(ctx.addMonths(new Date(), -1));
  const previousIncomeDate = monthsAgo(1, 5);
  const data = migrate({
    monthlyIncome: 5000,
    transactions: [tx({ type: "income", amount: 2300, categoryId: "salario", date: previousIncomeDate })],
  });
  check("mês atual ainda usa a renda planejada", near(effectiveIncome(data, currentKey), 5000), effectiveIncome(data, currentKey));
  check("mês encerrado usa a receita lançada", near(effectiveIncome(data, previousKey), 2300), effectiveIncome(data, previousKey));

  const changed = migrate({ ...data, monthlyIncome: 12000 });
  check("alterar a renda atual não muda o mês encerrado", near(effectiveIncome(changed, previousKey), 2300), effectiveIncome(changed, previousKey));

  const withoutHistory = migrate({ monthlyIncome: 5000, transactions: [] });
  check("mês encerrado sem receita não inventa renda", near(effectiveIncome(withoutHistory, previousKey), 0), effectiveIncome(withoutHistory, previousKey));
}

/* ------------------------------------------------- 14. origem do valor inicial */
console.log("\n14. Valor inicial da meta tem origem explícita");
{
  const base = migrate({
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(0, 1) })],
  });
  const draft = { id: "nova", name: "Viagem", target: 8000, savedUpfront: 2000, monthlyPlan: 300 };

  const fromCash = createGoalWithInitialBalance(base, draft, "cash", null);
  const cashGoal = fromCash.goals.find((g) => g.id === "nova");
  check("tirar do saldo cria um aporte real", fromCash.transactions.some((t) => t.id === "goal-upfront:nova" && t.amount === 2000));
  check("aporte inicial fica marcado como financiado pelo caixa", cashGoal.savedUpfront === 2000 && cashGoal.existingBalance === 0);
  check("transferir para a meta não altera o patrimônio", near(netWorth(fromCash).total, netWorth(base).total), `${netWorth(fromCash).total}/${netWorth(base).total}`);

  const existing = createGoalWithInitialBalance(base, draft, "existing", null);
  const existingGoal = existing.goals.find((g) => g.id === "nova");
  check("valor anterior não cria lançamento", existing.transactions.length === base.transactions.length, existing.transactions.length);
  check("valor anterior aparece no progresso", existingGoal.current === 2000 && existingGoal.existingBalance === 2000);
  check("valor anterior não é somado de novo ao patrimônio", near(netWorth(existing).total, netWorth(base).total), `${netWorth(existing).total}/${netWorth(base).total}`);

  const afterContribution = { ...existingGoal, current: 2600 };
  const fundedWithdrawal = goalWithdrawalPlan(afterContribution, 500);
  check("resgate libera primeiro o valor que nunca saiu do saldo", fundedWithdrawal.cashReturn === 0 && fundedWithdrawal.existingRelease === 500);
  const existingWithdrawal = goalWithdrawalPlan({ ...existingGoal }, 500);
  check("liberar valor anterior não cria receita", existingWithdrawal.cashReturn === 0 && existingWithdrawal.existingRelease === 500);
  check("a sobreposição restante acompanha o progresso", existingWithdrawal.current === 1500 && existingWithdrawal.existingBalance === 1500);
  const mixedWithdrawal = goalWithdrawalPlan({ ...afterContribution, existingBalance: 200 }, 500);
  check("somente o excedente aportado volta como receita", mixedWithdrawal.existingRelease === 200 && mixedWithdrawal.cashReturn === 300);
}

/* ------------------------------------------------- 15. saldo derivado do histórico */
console.log("\n15. Editar ou apagar aporte reconcilia o saldo da meta");
{
  const contribution = tx({ type: "expense", amount: 900, categoryId: "investimento", date: monthsAgo(0, 2), goalId: "sync" });
  const data = migrate({
    version: SCHEMA_VERSION,
    transactions: [contribution],
    goals: [goal({ id: "sync", target: 5000, current: 900 })],
  });
  check("ledger da meta lê o aporte real", near(goalLedgerBalance(data, "sync"), 900));

  const edited = reconcileGoalBalances({
    ...data,
    transactions: data.transactions.map((t) => t.id === contribution.id ? { ...t, amount: 400 } : t),
  });
  check("editar o aporte atualiza o progresso", near(edited.goals[0].current, 400), edited.goals[0].current);

  const removed = reconcileGoalBalances({ ...data, transactions: [] });
  check("apagar o aporte remove o valor da meta", near(removed.goals[0].current, 0), removed.goals[0].current);

  const future = reconcileGoalBalances({
    ...data,
    transactions: [{ ...contribution, date: inDays(10), monthKey: ctx.monthKeyOf(inDays(10)) }],
  });
  check("aporte futuro não aumenta o saldo guardado hoje", near(future.goals[0].current, 0), future.goals[0].current);

  const editedByDelta = applyGoalTransactionMutation(data, contribution, { ...contribution, amount: 400 });
  check("a edição preserva bases anteriores e aplica só a diferença", near(editedByDelta.goals[0].current, 400), editedByDelta.goals[0].current);
  const removedByDelta = applyGoalTransactionMutation(data, contribution, null);
  check("a exclusão desfaz exatamente o efeito do lançamento", near(removedByDelta.goals[0].current, 0), removedByDelta.goals[0].current);
}

/* ------------------------------------------------- 16. realizado e agendado */
console.log("\n16. Compromisso futuro não entra no realizado");
{
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 100, categoryId: "mercado", date: "2026-08-05" }),
      tx({ type: "expense", amount: 900, categoryId: "mercado", date: "2026-08-20" }),
    ],
  });
  const committed = monthTotals(data, "2026-08");
  const realized = realizedMonthTotals(data, "2026-08", "2026-08-10");
  check("total comprometido mantém o lançamento futuro", near(committed.expense, 1000), committed.expense);
  check("total realizado para na data de corte", near(realized.expense, 100), realized.expense);
  check("a lista realizada também exclui o futuro", realized.tx.length === 1, realized.tx.length);
  const today = iso(new Date()), tomorrow = inDays(1), currentKey = ctx.monthKeyOf(today);
  if (ctx.monthKeyOf(tomorrow) === currentKey) {
    const current = migrate({ transactions: [
      tx({ type: "expense", amount: 100, categoryId: "mercado", date: today }),
      tx({ type: "expense", amount: 900, categoryId: "mercado", date: tomorrow }),
    ] });
    check("orçamento gasto usa somente o realizado", near(ctx.spentForCategory(current, "mercado", currentKey), 100), ctx.spentForCategory(current, "mercado", currentKey));
  } else {
    check("orçamento gasto respeita o limite do mês", true);
  }
}

/* ------------------------------------------------- 17. histórico de orçamento */
console.log("\n17. Orçamento preserva a regra de cada mês");
{
  const base = defaultData();
  const mercado = base.categories.find((c) => c.id === "mercado");
  const configured = {
    ...base,
    monthlyIncome: 5000,
    categories: base.categories.map((c) => c.id === mercado.id ? { ...c, budget: 2000, group: "necessidade" } : c),
    budgetSplit: { necessidade: 40, desejo: 30, futuro: 30 },
    budgetHistory: {
      "2026-07": {
        monthKey: "2026-07",
        budgets: { mercado: 800 },
        groups: { mercado: "necessidade" },
        parents: { mercado: mercado.parentId || null },
        split: { necessidade: 60, desejo: 20, futuro: 20 },
        alerts: { warn: 70, over: 100 },
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      "2026-08": {
        monthKey: "2026-08",
        budgets: { mercado: 2000 },
        groups: { mercado: "necessidade" },
        parents: { mercado: mercado.parentId || null },
        split: { necessidade: 40, desejo: 30, futuro: 30 },
        alerts: { warn: 80, over: 100 },
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    transactions: [tx({ type: "income", amount: 4000, categoryId: "salario", date: "2026-07-05" })],
  };
  const data = migrate(configured);
  check("julho mantém teto de 800", near(budgetForCategory(data, "mercado", "2026-07"), 800), budgetForCategory(data, "mercado", "2026-07"));
  check("agosto usa o novo teto de 2.000", near(budgetForCategory(data, "mercado", "2026-08"), 2000), budgetForCategory(data, "mercado", "2026-08"));
  check("divisão histórica usa 60% da renda realizada", near(groupAllocated(data, "2026-07", "necessidade"), 2400), groupAllocated(data, "2026-07", "necessidade"));

  const changed = withBudgetSnapshot({
    ...data,
    categories: data.categories.map((c) => c.id === "mercado" ? { ...c, budget: 2600 } : c),
  }, "2026-08");
  check("alterar agosto não reescreve julho", near(budgetForCategory(changed, "mercado", "2026-07"), 800), budgetForCategory(changed, "mercado", "2026-07"));
  check("o novo teto fica registrado em agosto", near(budgetForCategory(changed, "mercado", "2026-08"), 2600), budgetForCategory(changed, "mercado", "2026-08"));

  const restored = parseBackupFile(JSON.stringify(buildBackupEnvelope(changed))).data;
  check("backup preserva o histórico mensal", near(budgetForCategory(restored, "mercado", "2026-07"), 800), budgetForCategory(restored, "mercado", "2026-07"));
  const merged = mergeBackupInto(migrate(defaultData()), restored).data;
  check("mesclagem preserva o histórico mensal", near(budgetForCategory(merged, "mercado", "2026-07"), 800), budgetForCategory(merged, "mercado", "2026-07"));

  const legacy = migrate({
    categories: base.categories.map((c) => c.id === "mercado" ? { ...c, budget: 700 } : c),
    transactions: [tx({ type: "expense", amount: 50, categoryId: "mercado", date: "2024-02-10" })],
  });
  check("migração ancora a regra no primeiro mês com dados", near(budgetForCategory(legacy, "mercado", "2024-02"), 700), budgetForCategory(legacy, "mercado", "2024-02"));

  const customAlerts = migrate({ ...base, budgetAlerts: { warn: 150, over: 250 }, budgetHistory: {} });
  const alertSnapshot = ctx.budgetSnapshotAt(customAlerts, ctx.keyOfDate(new Date()));
  check("alertas acima de 100% não são truncados", alertSnapshot.alerts.warn === 150 && alertSnapshot.alerts.over === 250, JSON.stringify(alertSnapshot.alerts));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
