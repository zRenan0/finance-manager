// test-insights-engine.js — harness do Módulo 7 (analytics.js + advisor.js).
// Cobre as três decisões de método do motor de insights (categoria raiz, média
// pelos dias decorridos, horário só quando a amostra sustenta), os onze
// indicadores do §11 e a tradução deles em recomendação pelo §10.
// Ferramenta de dev: `node tests/test-insights-engine.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.addEventListener = () => {};
ctx.fetch = () => Promise.reject(new Error("offline"));
vm.createContext(ctx);

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/import.js", "js/score.js",
 "js/metrics.js", "js/recurring.js", "js/analytics.js", "js/insights.js",
 "js/assistant.js", "js/advisor.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const {
  buildAnalyticsModel, buildAdvisorModel, buildSavingPlan, buildRecurringModel,
  migrate, defaultData,
} = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const iso = (d) => ctx.isoOfDate(d);
const now = new Date();
const thisKey = ctx.keyOfDate(now);
const lastKey = ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const dayIn = (key, day) => {
  const [y, m] = key.split("-").map(Number);
  const realizedDay = key === thisKey ? Math.min(day, now.getDate()) : day;
  return `${key}-${String(Math.min(realizedDay, ctx.daysInMonthOf(y, m - 1))).padStart(2, "0")}`;
};
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });
const card = (adv, id) => adv.all.find((c) => c.id === id);

/* ================================================================= 1 */
console.log("\n1. Comparação com o mês anterior");
{
  const data = migrate({
    monthlyIncome: 6000,
    transactions: [
      tx({ type: "income", amount: 6000, categoryId: "salario", date: dayIn(lastKey, 5) }),
      tx({ type: "expense", amount: 1000, categoryId: "mercado", date: dayIn(lastKey, 10) }),
      tx({ type: "income", amount: 6000, categoryId: "salario", date: dayIn(thisKey, 5) }),
      tx({ type: "expense", amount: 1500, categoryId: "mercado", date: dayIn(thisKey, 10) }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("gasto do mês lido corretamente", near(an.totals.expense, 1500), an.totals.expense);
  check("variação de +50% contra o mês anterior", near(an.mom.expense.pct, 50, 0.5), an.mom.expense.pct);
  check("diferença em reais", near(an.mom.expense.diff, 500), an.mom.expense.diff);
  check("direção \"up\"", an.mom.expense.direction === "up");
  check("mês anterior reconhecido como base válida", an.mom.hasPrevious === true);
}

/* ================================================================= 2 */
console.log("\n2. Sem base anterior, o percentual é null (e não 100%)");
{
  const data = migrate({
    transactions: [tx({ type: "expense", amount: 300, categoryId: "lazer", date: dayIn(thisKey, 8) })],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("pct é null", an.mom.expense.pct === null, an.mom.expense.pct);
  check("comparable é false", an.mom.expense.comparable === false);
  check("hasPrevious é false", an.mom.hasPrevious === false);
}

/* ================================================================= 3 */
console.log("\n3. Decisão 1 — comparação agrega na categoria RAIZ");
{
  // Delivery e Mercado são filhas de Alimentação.
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 200, categoryId: "delivery", date: dayIn(lastKey, 4) }),
      tx({ type: "expense", amount: 300, categoryId: "mercado", date: dayIn(lastKey, 6) }),
      tx({ type: "expense", amount: 500, categoryId: "delivery", date: dayIn(thisKey, 4) }),
      tx({ type: "expense", amount: 400, categoryId: "mercado", date: dayIn(thisKey, 6) }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  const ids = an.categories.rows.map((r) => r.id);
  check("não há linha separada para Delivery", !ids.includes("delivery"), ids.join("|"));
  check("há linha para Alimentação", ids.includes("alimentacao"));
  const ali = an.categories.rows.find((r) => r.id === "alimentacao");
  check("soma as duas subcategorias (500+400)", near(ali.current, 900), ali.current);
  check("compara com a soma do mês anterior (200+300)", near(ali.previous, 500), ali.previous);
  check("aparece entre as que cresceram", an.categories.grew.some((r) => r.id === "alimentacao"));
}

/* ================================================================= 4 */
console.log("\n4. Categorias que cresceram e que diminuíram");
{
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 800, categoryId: "lazer", date: dayIn(lastKey, 9) }),
      tx({ type: "expense", amount: 200, categoryId: "transporte", date: dayIn(lastKey, 9) }),
      tx({ type: "expense", amount: 300, categoryId: "lazer", date: dayIn(thisKey, 9) }),
      tx({ type: "expense", amount: 700, categoryId: "transporte", date: dayIn(thisKey, 9) }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("transporte no topo dos que cresceram", an.categories.grew[0].id === "transporte", an.categories.grew.map((r) => r.id).join("|"));
  check("lazer no topo dos que caíram", an.categories.shrank[0].id === "lazer");
  check("queda tem diff negativo", an.categories.shrank[0].diff < 0, an.categories.shrank[0].diff);
  check("alta de +250%", near(an.categories.grew[0].pct, 250, 1), an.categories.grew[0].pct);
}

/* ================================================================= 5 */
console.log("\n5. Maior gasto, menor gasto e categoria dominante");
{
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 2500, categoryId: "moradia", date: dayIn(thisKey, 5), description: "Aluguel" }),
      tx({ type: "expense", amount: 12, categoryId: "alimentacao", date: dayIn(thisKey, 7), description: "Café" }),
      tx({ type: "expense", amount: 300, categoryId: "lazer", date: dayIn(thisKey, 9), description: "Show" }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("maior gasto é o aluguel", an.extremes.biggest.description === "Aluguel", an.extremes.biggest.description);
  check("menor gasto é o café", an.extremes.smallest.description === "Café");
  check("contagem de lançamentos", an.extremes.count === 3);
  check("ticket médio", near(an.extremes.ticket, (2500 + 12 + 300) / 3, 0.02), an.extremes.ticket);
  check("categoria dominante é moradia", an.dominant.id === "moradia");
  check("participação acima de 40% marca concentração", an.dominant.concentrated === true, an.dominant.share);
}

/* ================================================================= 6 */
console.log("\n6. Dia da semana — média por ocorrência, não por total");
{
  // Um sábado com R$ 600 e três segundas com R$ 100 cada.
  const transactions = [];
  const [y, m] = lastKey.split("-").map(Number);
  const total = ctx.daysInMonthOf(y, m - 1);
  let sat = 0, mon = 0;
  for (let d = 1; d <= total; d++) {
    const w = new Date(y, m - 1, d).getDay();
    if (w === 6 && sat === 0) { transactions.push(tx({ type: "expense", amount: 600, categoryId: "lazer", date: dayIn(lastKey, d) })); sat++; }
    if (w === 1 && mon < 3) { transactions.push(tx({ type: "expense", amount: 100, categoryId: "mercado", date: dayIn(lastKey, d) })); mon++; }
  }
  const data = migrate({ transactions });
  const an = buildAnalyticsModel(data, lastKey);
  const sab = an.weekday.rows[6];
  const seg = an.weekday.rows[1];
  check("sábado somou 600", near(sab.total, 600), sab.total);
  check("segunda somou 300", near(seg.total, 300), seg.total);
  check("média da segunda é o total dividido pelas segundas do mês", near(seg.average, seg.total / seg.occurrences), seg.average);
  check("média nunca é o total bruto do dia da semana", seg.average < seg.total, seg.average);
  check("dias da semana têm 7 linhas", an.weekday.rows.length === 7);
  check("fim de semana e dia útil são medidos por dia", an.weekday.weekendAvg > 0 && an.weekday.weekdayAvg > 0);
}

/* ================================================================= 7 */
console.log("\n7. Decisão 2 — média diária usa os dias já decorridos");
{
  const data = migrate({
    transactions: [tx({ type: "expense", amount: 900, categoryId: "mercado", date: dayIn(thisKey, 1) })],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("mês corrente reconhecido", an.averages.isCurrentMonth === true);
  check("divide pelos dias vividos", near(an.averages.daily, 900 / now.getDate(), 0.02), an.averages.daily);
  check("média semanal é 7x a diária", near(an.averages.weekly, an.averages.daily * 7, 0.05));
  check("projeção do mês usa o total de dias", an.averages.projected >= an.totals.expense);

  const past = buildAnalyticsModel(data, lastKey);
  check("mês passado divide pelo mês inteiro", past.averages.isCurrentMonth === false);
  check("mês passado não projeta", near(past.averages.projected, past.totals.expense));
}

/* ================================================================= 8 */
console.log("\n8. Decisão 3 — horário só quando a amostra sustenta");
{
  const mk = (day, hour, amount) => {
    const date = dayIn(thisKey, day);
    return tx({ type: "expense", amount, categoryId: "lazer", date, createdAt: `${date}T${String(hour).padStart(2, "0")}:30:00.000Z` });
  };
  const few = migrate({ transactions: [mk(2, 21, 50), mk(3, 22, 40)] });
  check("2 lançamentos não bastam", buildAnalyticsModel(few, thisKey).hours.available === false);

  const many = migrate({ transactions: [1, 2, 3, 4, 5, 6].map((d) => mk(d, 21, 50)) });
  const an = buildAnalyticsModel(many, thisKey);
  check("6 lançamentos com hora liberam a leitura", an.hours.available === true);
  check("período de pico é a noite", an.hours.peakPeriod.id === "noite", an.hours.peakPeriod.id);
  check("hora de pico é 21h", an.hours.peakHour === 21, an.hours.peakHour);
  check("cobertura reportada", an.hours.coverage === 1, an.hours.coverage);

  // Extrato importado de madrugada num dia diferente da compra: não conta.
  const imported = migrate({
    transactions: [1, 2, 3, 4, 5, 6].map((d) => tx({
      type: "expense", amount: 50, categoryId: "lazer", date: dayIn(thisKey, d),
      createdAt: `${dayIn(thisKey, 20)}T03:00:00.000Z`,
    })),
  });
  check("registro de outro dia é descartado", buildAnalyticsModel(imported, thisKey).hours.available === false);
}

/* ================================================================= 9 */
console.log("\n9. Mapa de calor");
{
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 400, categoryId: "lazer", date: dayIn(thisKey, 3) }),
      tx({ type: "expense", amount: 100, categoryId: "lazer", date: dayIn(thisKey, 4) }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  const d3 = an.heatmap.days[2];
  const d4 = an.heatmap.days[3];
  check("um ponto por dia do mês", an.heatmap.days.length === ctx.daysInMonthOf(now.getFullYear(), now.getMonth()));
  check("dia mais caro tem intensidade 1", d3.intensity === 1, d3.intensity);
  check("intensidade proporcional", near(d4.intensity, 0.25, 0.001), d4.intensity);
  check("topo do mês ordenado por valor", an.heatmap.top[0].day === 3);
  check("dias futuros marcados", an.heatmap.days.filter((d) => d.future).length === Math.max(0, ctx.daysInMonthOf(now.getFullYear(), now.getMonth()) - now.getDate()));
  check("dia futuro não conta como dia sem gasto", an.heatmap.quietDays <= now.getDate());
}

/* ================================================================ 10 */
console.log("\n10. Comparação anual: mesmo mês e acumulado");
{
  const lastYear = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const data = migrate({
    transactions: [
      tx({ type: "expense", amount: 1000, categoryId: "mercado", date: dayIn(lastYear, 10) }),
      tx({ type: "expense", amount: 1400, categoryId: "mercado", date: dayIn(thisKey, 10) }),
    ],
  });
  const an = buildAnalyticsModel(data, thisKey);
  check("comparação anual disponível", an.yoy.available === true);
  check("mesmo mês do ano passado", near(an.yoy.sameMonth.previous, 1000), an.yoy.sameMonth.previous);
  check("alta de 40% no mesmo mês", near(an.yoy.sameMonth.pct, 40, 0.5), an.yoy.sameMonth.pct);
  check("acumulado do ano soma até o mês atual", near(an.yoy.ytdExpense.current, 1400), an.yoy.ytdExpense.current);

  const noHistory = buildAnalyticsModel(migrate({ transactions: [tx({ type: "expense", amount: 10, categoryId: "outros", date: dayIn(thisKey, 2) })] }), thisKey);
  check("sem histórico, comparação anual é marcada indisponível", noHistory.yoy.available === false);
}

/* ================================================================ 11 */
console.log("\n11. Advisor: as frases do briefing (§10)");
{
  const transactions = [];
  // 4 meses de histórico estável, com um estouro em Lazer neste mês.
  for (let i = 4; i >= 0; i--) {
    const key = ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() - i, 1));
    transactions.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: dayIn(key, 5) }));
    transactions.push(tx({ type: "expense", amount: 1500, categoryId: "moradia", date: dayIn(key, 8), recurring: true }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 1600 : 800, categoryId: "mercado", date: dayIn(key, 12), payment: "Crédito" }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 900 : 300, categoryId: "lazer", date: dayIn(key, 18), payment: "Crédito" }));
  }
  const data = migrate({ monthlyIncome: 6000, transactions });
  const adv = buildAdvisorModel(data, thisKey);

  check("gera recomendações", adv.cards.length > 0, adv.cards.length);
  check("teto de 8 itens respeitado", adv.cards.length <= 8, adv.cards.length);
  const alta = card(adv, "categoria-em-alta");
  check("existe a frase \"gastou X% a mais com Y\"", !!alta && /gastou \d+% a mais com/.test(alta.title), alta && alta.title);
  const economia = card(adv, "potencial-economia");
  check("existe a frase \"pode economizar aproximadamente\"", !!economia && /pode economizar aproximadamente/.test(economia.title), economia && economia.title);
  check("o plano de economia tem itens", economia && economia.detail.length > 0);
  const cartao = card(adv, "cartao");
  check("existe a frase do cartão como % da renda", !!cartao && /cartão está consumindo \d+% da renda/.test(cartao.title), cartao && cartao.title);
  check("nenhum título tem NaN/undefined", adv.all.every((c) => !/NaN|undefined/.test(c.title + c.message)));
  check("manchete é o item mais grave", adv.headline.id === adv.cards[0].id);

  const tones = adv.cards.map((c) => ({ danger: 0, warn: 1, info: 2, positive: 3 })[c.tone]);
  check("ordenado por gravidade", tones.every((t, i) => i === 0 || tones[i - 1] <= t), tones.join(","));
}

/* ================================================================ 12 */
console.log("\n12. Advisor: fim de semana, assinaturas e patrimônio");
{
  const transactions = [];
  const [y, m] = thisKey.split("-").map(Number);
  transactions.push(tx({ type: "income", amount: 8000, categoryId: "salario", date: dayIn(thisKey, 3) }));
  for (let d = 1; d <= Math.min(now.getDate(), ctx.daysInMonthOf(y, m - 1)); d++) {
    const w = new Date(y, m - 1, d).getDay();
    transactions.push(tx({ type: "expense", amount: (w === 0 || w === 6) ? 250 : 40, categoryId: "lazer", date: dayIn(thisKey, d) }));
  }
  for (let i = 5; i >= 0; i--) {
    const key = ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() - i, 1));
    transactions.push(tx({ type: "expense", amount: 55.9, categoryId: "assinaturas", date: dayIn(key, 15), description: "Netflix" }));
    transactions.push(tx({ type: "expense", amount: 21.9, categoryId: "assinaturas", date: dayIn(key, 16), description: "Spotify" }));
  }
  const data = migrate({ monthlyIncome: 8000, transactions });
  const adv = buildAdvisorModel(data, thisKey);

  const fds = card(adv, "fim-de-semana");
  check("detecta gasto acima da média no fim de semana", !!fds, adv.all.map((c) => c.id).join("|"));
  const ass = card(adv, "assinaturas");
  check("recomendação de assinaturas existe", !!ass);
  check("…e cita o custo anual", ass && /por ano|ao longo de um ano/.test(ass.message), ass && ass.message);

  const rec = buildRecurringModel(data, { monthKey: thisKey });
  check("custo anual bate com 12x o mensal", near(rec.annualTotal, rec.monthlyTotal * 12, 0.5), `${rec.annualTotal} / ${rec.monthlyTotal}`);
}

/* ================================================================ 13 */
console.log("\n13. Plano de economia não corta essenciais");
{
  const transactions = [];
  for (let i = 3; i >= 0; i--) {
    const key = ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() - i, 1));
    transactions.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: dayIn(key, 3) }));
    // Moradia (necessidade) estourou; Lazer (desejo) também.
    transactions.push(tx({ type: "expense", amount: i === 0 ? 3000 : 1500, categoryId: "moradia", date: dayIn(key, 8) }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 900 : 300, categoryId: "lazer", date: dayIn(key, 14) }));
  }
  const data = migrate({ monthlyIncome: 6000, transactions });
  const an = buildAnalyticsModel(data, thisKey);
  const plan = buildSavingPlan(data, an);
  const ids = plan.items.map((i) => i.id);
  check("lazer entra no plano", ids.includes("lazer"), ids.join("|"));
  check("moradia (necessidade) fica fora", !ids.includes("moradia"));
  check("total é a soma dos excessos listados", near(plan.total, plan.items.reduce((s, i) => s + i.excess, 0), 0.02));
  check("excesso é medido contra a média, não contra o total", plan.items[0].excess < plan.items[0].current);
}

/* ================================================================ 14 */
console.log("\n14. Resistência: base vazia e mês futuro");
{
  const empty = defaultData();
  const an = buildAnalyticsModel(empty, thisKey);
  check("modelo vazio não quebra", an.hasData === false);
  check("médias não viram NaN", Number.isFinite(an.averages.daily) && an.averages.daily === 0, an.averages.daily);
  check("mapa de calor existe mesmo sem gasto", an.heatmap.days.length > 0 && an.heatmap.max === 0);
  check("extremos marcados como indisponíveis", an.extremes.available === false);

  const adv = buildAdvisorModel(empty, thisKey);
  check("advisor devolve manchete de fallback", adv.headline.id === "sem-alertas", adv.headline.id);
  check("advisor sem dados não inventa números", !/R\$\s*NaN/.test(adv.headline.message));

  const future = ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() + 2, 1));
  const fut = buildAnalyticsModel(empty, future);
  check("mês futuro não quebra a média", Number.isFinite(fut.averages.daily));
  check("mês futuro não tem dias decorridos", fut.averages.elapsedDays === 1, fut.averages.elapsedDays);
}

console.log(`\n${pass} passaram, ${fail} falharam.\n`);
process.exit(fail ? 1 : 0);
