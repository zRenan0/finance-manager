// analytics.js. [M7] Motor de insights avançados.
//
// Arquivo PURO: recebe o snapshot, devolve um modelo de leitura. Sem DOM, sem
// `state`, sem gravação; mesmo contrato de score.js, health.js e wealth.js.
//
// O que este motor responde
// -------------------------
// As telas anteriores respondem "quanto?" e "vou chegar lá?". Esta responde
// **"onde, quando e por quê o dinheiro sai"**; comparação com o mês passado e
// com o ano passado, categorias que cresceram e que encolheram, maior e menor
// gasto, categoria dominante, dia da semana mais caro, horário, média diária e
// semanal.
//
// Três decisões de método que valem explicação
// --------------------------------------------
// 1. **Comparação por categoria RAIZ.** Um gasto em "Delivery" cresceu ou foi
//    "Alimentação" que cresceu? As duas leituras são verdadeiras, mas só uma é
//    acionável. Agregamos na categoria-mãe; a mesma herança que os orçamentos
//    já usam; para as duas telas nunca discordarem.
// 2. **Média diária do mês corrente usa os dias JÁ DECORRIDOS.** Dividir o
//    gasto do dia 5 por 31 devolve uma média que não existe e faz o mês parecer
//    barato justamente quando ainda dá para corrigir.
// 3. **Horário é declarado como horário de REGISTRO, não de compra.** O app não
//    guarda a hora da compra: guarda a hora em que o lançamento foi criado.
//    Contamos apenas os lançamentos criados no MESMO DIA da despesa (aí o
//    registro é um bom retrato da compra) e mostramos o tamanho da amostra. Sem
//    esse recorte, um extrato importado de madrugada diria que a pessoa gasta
//    de madrugada.
//
// Dependências: utils.js, storage.js, metrics.js.
"use strict";

const AN_WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const AN_WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const AN_PERIODS = [
  { id: "madrugada", label: "Madrugada", from: 0,  to: 5,  hint: "00h-05h" },
  { id: "manha",     label: "Manhã",     from: 6,  to: 11, hint: "06h-11h" },
  { id: "tarde",     label: "Tarde",     from: 12, to: 17, hint: "12h-17h" },
  { id: "noite",     label: "Noite",     from: 18, to: 23, hint: "18h-23h" },
];
// Abaixo desta cobertura de horários, a leitura por horário é ruído; a tela
// prefere dizer "dados insuficientes" a desenhar um gráfico bonito e falso.
const AN_HOUR_MIN_SAMPLE = 5;
const AN_HOUR_MIN_COVERAGE = 0.35;

function anMonthKeyMinus(monthKey, n) {
  const [y, m] = String(monthKey).split("-").map(Number);
  return keyOfDate(new Date(y, (m - 1) - n, 1));
}
function anMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  return `${MONTH_NAMES[(m - 1 + 12) % 12]} de ${y}`;
}
function anMonthAbbr(monthKey) {
  const [, m] = String(monthKey).split("-").map(Number);
  return MONTH_ABBR[(m - 1 + 12) % 12];
}
function anDaysInMonthKey(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  return daysInMonthOf(y, m - 1);
}
// Dias já vividos no mês: o mês inteiro se ele acabou, o dia de hoje se é o mês
// corrente, zero se ainda nem começou.
function anElapsedDays(monthKey) {
  const now = new Date();
  const current = keyOfDate(now);
  if (monthKey < current) return anDaysInMonthKey(monthKey);
  if (monthKey > current) return 0;
  return now.getDate();
}

// Categoria raiz (sobe uma subcategoria para a mãe). Um nível só, que é o
// máximo que o modelo de categorias permite.
function anRootCategory(data, id) {
  const c = categoryById(data, id);
  return c.parentId ? categoryById(data, c.parentId) : c;
}

// Soma dos gastos do mês por categoria raiz → Map(id → centavos).

function anExpenseByRoot(data, monthKey) {
  const out = new Map();
  realizedTxForMonth(data, monthKey).forEach((t) => {
    // MESMA RÉGUA de "Despesas do mês" (`realizedMonthTotals`): só consumo e
    // encargos de dívida entram, estorno entra negativo, e aporte, amortização
    // e transferência ficam de fora. Enquanto esta soma classificava por
    // `type`, o denominador era por natureza e o numerador não: um aporte de
    // meta maior que o consumo fazia a categoria dominante passar de 100% do
    // mês e liderar o ranking de gastos sem ser gasto.
    const cents = consumptionCentsOf(t);
    if (!cents) return;
    const root = anRootCategory(data, t.categoryId);
    out.set(root.id, (out.get(root.id) || 0) + cents);
  });
  return out;
}

// ------------------------------------------------------------------------------
// Comparações
// ------------------------------------------------------------------------------
function anDelta(current, previous) {
  const diff = subMoney(current, previous);
  return {
    current: roundMoney(current),
    previous: roundMoney(previous),
    diff,
    // Sem base anterior não existe percentual. Devolvemos `null` em vez de 100%,
    // porque "cresceu 100%" e "não havia com o que comparar" são coisas
    // diferentes e a tela precisa saber qual das duas está mostrando.
    pct: previous > 0 ? safePct(diff, previous) : null,
    direction: moneyCompare(diff, 0) > 0 ? "up" : moneyCompare(diff, 0) < 0 ? "down" : "flat",
    comparable: previous > 0,
  };
}

function anMonthOverMonth(data, monthKey) {
  const prevKey = anMonthKeyMinus(monthKey, 1);
  const cur = realizedMonthTotals(data, monthKey);
  const prev = realizedMonthTotals(data, prevKey);
  return {
    monthKey, prevKey,
    label: anMonthLabel(monthKey),
    prevLabel: anMonthLabel(prevKey),
    expense: anDelta(cur.expense, prev.expense),
    income: anDelta(cur.income, prev.income),
    saving: anDelta(subMoney(cur.income, cur.expense), subMoney(prev.income, prev.expense)),
    hasPrevious: prev.tx.length > 0,
  };
}

// Comparação anual em duas leituras, porque elas discordam com frequência e as
// duas importam: o MESMO MÊS do ano passado (sazonalidade) e o ACUMULADO do ano
// contra o mesmo trecho do ano anterior (tendência).
function anYearOverYear(data, monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  const sameMonthLast = `${y - 1}-${String(m).padStart(2, "0")}`;
  const cur = realizedMonthTotals(data, monthKey);
  const prev = realizedMonthTotals(data, sameMonthLast);

  let ytdExpense = 0, ytdIncome = 0, lastYtdExpense = 0, lastYtdIncome = 0;
  let lastYearHasData = false;
  for (let i = 1; i <= m; i++) {
    const key = `${y}-${String(i).padStart(2, "0")}`;
    const old = `${y - 1}-${String(i).padStart(2, "0")}`;
    const a = realizedMonthTotals(data, key);
    const b = realizedMonthTotals(data, old);
    ytdExpense += moneyToCents(a.expense); ytdIncome += moneyToCents(a.income);
    lastYtdExpense += moneyToCents(b.expense); lastYtdIncome += moneyToCents(b.income);
    if (b.tx.length) lastYearHasData = true;
  }

  return {
    year: y,
    lastYear: y - 1,
    sameMonthKey: sameMonthLast,
    sameMonthLabel: anMonthLabel(sameMonthLast),
    sameMonth: anDelta(cur.expense, prev.expense),
    ytdExpense: anDelta(moneyFromCents(ytdExpense), moneyFromCents(lastYtdExpense)),
    ytdIncome: anDelta(moneyFromCents(ytdIncome), moneyFromCents(lastYtdIncome)),
    available: prev.tx.length > 0 || lastYearHasData,
    sameMonthAvailable: prev.tx.length > 0,
  };
}

// Categorias que cresceram e que encolheram, contra o mês anterior.
// `baseline` traz também a média dos 3 meses anteriores: um mês isolado é
// volátil (o IPVA de janeiro não é "transporte crescendo"), e o consultor
// precisa dos dois números para saber se aquilo é tendência ou evento.
function anCategoryDeltas(data, monthKey, opts) {
  const options = opts || {};
  const limit = options.limit || 5;
  const prevKey = anMonthKeyMinus(monthKey, 1);
  const cur = anExpenseByRoot(data, monthKey);
  const prev = anExpenseByRoot(data, prevKey);

  const baselineKeys = [1, 2, 3].map((n) => anMonthKeyMinus(monthKey, n));
  const baselineMaps = baselineKeys.map((k) => anExpenseByRoot(data, k));
  const baselineActive = baselineKeys.filter((k) => realizedTxForMonth(data, k).length > 0).length;

  const ids = new Set([...cur.keys(), ...prev.keys()]);
  const rows = [];
  ids.forEach((id) => {
    const c = categoryById(data, id);
    const currentValue = moneyFromCents(cur.get(id) || 0);
    const previousValue = moneyFromCents(prev.get(id) || 0);
    const baseSum = baselineMaps.reduce((s, mp) => s + (mp.get(id) || 0), 0);
    const baseline = baselineActive > 0 ? moneyFromCents(Math.round(baseSum / baselineActive)) : 0;
    rows.push({
      id, name: c.name, color: c.color, icon: c.icon,
      ...anDelta(currentValue, previousValue),
      baseline,
      // Excesso sobre o hábito dos últimos meses. É deste número que sai a
      // resposta "quanto dá para economizar"; não do gasto total.
      overBaseline: baseline > 0 ? Math.max(0, subMoney(currentValue, baseline)) : 0,
      baselinePct: baseline > 0 ? safePct(subMoney(currentValue, baseline), baseline) : null,
    });
  });

  const grew = rows.filter((r) => r.direction === "up" && r.diff > 0)
    .sort((a, b) => moneyCompare(b.diff, a.diff)).slice(0, limit);
  const shrank = rows.filter((r) => r.direction === "down")
    .sort((a, b) => moneyCompare(a.diff, b.diff)).slice(0, limit);

  return { grew, shrank, rows, prevKey, baselineMonths: baselineActive };
}

// ------------------------------------------------------------------------------
// Extremos e dominância
// ------------------------------------------------------------------------------
function anExtremes(data, monthKey) {
  const expenses = realizedTxForMonth(data, monthKey).filter((t) => isConsumptionTx(t) && t.amount > 0);
  if (!expenses.length) return { available: false, biggest: null, smallest: null, count: 0 };

  const decorate = (t) => {
    const c = categoryById(data, t.categoryId);
    return {
      id: t.id, amount: roundMoney(t.amount), date: t.date,
      description: t.description || c.name,
      categoryName: c.name, categoryColor: c.color, categoryIcon: c.icon,
      payment: t.payment || "Outro",
    };
  };
  const sorted = [...expenses].sort((a, b) => moneyCompare(b.amount, a.amount));
  return {
    available: true,
    count: expenses.length,
    biggest: decorate(sorted[0]),
    smallest: decorate(sorted[sorted.length - 1]),
    ticket: divMoney(sumMoney(expenses, (t) => t.amount), expenses.length),
  };
}

function anDominant(data, monthKey) {
  const total = realizedMonthTotals(data, monthKey).expense;
  const byRoot = anExpenseByRoot(data, monthKey);
  let bestId = null, bestCents = 0;
  byRoot.forEach((cents, id) => { if (cents > bestCents) { bestCents = cents; bestId = id; } });
  if (!bestId || total <= 0) return { available: false };
  const c = categoryById(data, bestId);
  const value = moneyFromCents(bestCents);
  return {
    available: true,
    id: bestId, name: c.name, color: c.color, icon: c.icon,
    value, share: safePct(value, total),
    // "Concentrado" quando uma única categoria leva mais de 40% do mês. Não é
    // erro por si só (moradia costuma passar disso); é contexto para a leitura.
    concentrated: safePct(value, total) >= 40,
  };
}

// ------------------------------------------------------------------------------
// Ritmo: dia da semana, horário, médias
// ------------------------------------------------------------------------------
function anWeekdayProfile(data, monthKey) {
  const cents = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  const daysWithWeekday = new Array(7).fill(0);

  const [y, m] = String(monthKey).split("-").map(Number);
  const total = anDaysInMonthKey(monthKey);
  const elapsed = anElapsedDays(monthKey);

  let lastDayWithTx = 0;
  realizedTxForMonth(data, monthKey).forEach((t) => {
    const c = consumptionCentsOf(t);          // mesma régua do total do mês
    if (!c) return;
    const w = dateFromIso(t.date).getDay();
    cents[w] += c;
    counts[w]++;
    const d = Number(String(t.date).slice(8, 10)) || 0;
    if (d > lastDayWithTx) lastDayWithTx = d;
  });

  // Janela de ocorrências: os dias já vividos. MAS nunca menos do que o último
  // dia com lançamento. Um gasto agendado para o dia 20 no dia 3 do mês somaria
  // no total sem que aquele dia da semana tivesse ocorrido, e a média daquele
  // dia sairia inflada por um divisor pequeno demais.
  const window = clamp(Math.max(elapsed, lastDayWithTx), 0, total);
  for (let d = 1; d <= window; d++) {
    daysWithWeekday[new Date(y, m - 1, d).getDay()]++;
  }

  const rows = AN_WEEKDAYS.map((label, i) => ({
    index: i, label, short: AN_WEEKDAYS_SHORT[i],
    total: moneyFromCents(cents[i]),
    count: counts[i],
    occurrences: daysWithWeekday[i],
    // Média POR OCORRÊNCIA do dia da semana. Sem isso, um mês com cinco sábados
    // faria o sábado parecer mais caro só por existir mais vezes.
    average: daysWithWeekday[i] > 0 ? moneyFromCents(Math.round(cents[i] / daysWithWeekday[i])) : 0,
    weekend: i === 0 || i === 6,
  }));

  const withData = rows.filter((r) => r.occurrences > 0);
  const heaviest = withData.slice().sort((a, b) => moneyCompare(b.average, a.average))[0] || null;
  const lightest = withData.slice().sort((a, b) => moneyCompare(a.average, b.average))[0] || null;

  const weekendCents = cents[0] + cents[6];
  const weekdayCents = cents.reduce((s, v, i) => (i === 0 || i === 6 ? s : s + v), 0);
  const weekendDays = daysWithWeekday[0] + daysWithWeekday[6];
  const weekdayDays = daysWithWeekday.reduce((s, v, i) => (i === 0 || i === 6 ? s : s + v), 0);
  const weekendAvg = weekendDays > 0 ? moneyFromCents(Math.round(weekendCents / weekendDays)) : 0;
  const weekdayAvg = weekdayDays > 0 ? moneyFromCents(Math.round(weekdayCents / weekdayDays)) : 0;

  return {
    rows, heaviest, lightest,
    totalDays: total,
    elapsedDays: elapsed,
    weekendAvg, weekdayAvg,
    weekendTotal: moneyFromCents(weekendCents),
    weekendShare: (weekendCents + weekdayCents) > 0 ? safePct(moneyFromCents(weekendCents), moneyFromCents(weekendCents + weekdayCents)) : 0,
    weekendExcessPct: weekdayAvg > 0 ? safePct(subMoney(weekendAvg, weekdayAvg), weekdayAvg) : null,
    available: withData.some((r) => r.count > 0),
  };
}

// Horário. Ver a nota 3 no topo do arquivo: isto é a hora do REGISTRO, contada
// só quando o lançamento foi criado no mesmo dia da despesa.
function anHourProfile(data, monthKey) {
  const expenses = realizedTxForMonth(data, monthKey).filter(isConsumptionTx);
  const hours = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  let sample = 0;

  expenses.forEach((t) => {
    const created = String(t.createdAt || "");
    if (created.length < 16 || created.indexOf("T") !== 10) return;
    if (created.slice(0, 10) !== t.date) return;   // registro de outro dia não conta
    const h = Number(created.slice(11, 13));
    if (!Number.isFinite(h) || h < 0 || h > 23) return;
    hours[h] += moneyToCents(t.amount);
    counts[h]++;
    sample++;
  });

  const coverage = expenses.length > 0 ? sample / expenses.length : 0;
  const available = sample >= AN_HOUR_MIN_SAMPLE && coverage >= AN_HOUR_MIN_COVERAGE;

  const periods = AN_PERIODS.map((p) => {
    let c = 0, n = 0;
    for (let h = p.from; h <= p.to; h++) { c += hours[h]; n += counts[h]; }
    return { ...p, total: moneyFromCents(c), count: n };
  });
  const totalCents = hours.reduce((s, v) => s + v, 0);
  periods.forEach((p) => { p.share = totalCents > 0 ? safePct(p.total, moneyFromCents(totalCents)) : 0; });

  const peakPeriod = periods.slice().sort((a, b) => moneyCompare(b.total, a.total))[0] || null;
  let peakHour = null;
  let best = 0;
  hours.forEach((v, h) => { if (v > best) { best = v; peakHour = h; } });

  return {
    available, sample, coverage: Math.round(coverage * 100) / 100,
    rows: hours.map((v, h) => ({ hour: h, total: moneyFromCents(v), count: counts[h] })),
    periods, peakPeriod,
    peakHour,
    peakHourLabel: peakHour == null ? "" : `${String(peakHour).padStart(2, "0")}h`,
  };
}

function anAverages(data, monthKey) {
  const totals = realizedMonthTotals(data, monthKey);
  const elapsed = Math.max(1, anElapsedDays(monthKey));
  const totalDays = anDaysInMonthKey(monthKey);
  const daily = divMoney(totals.expense, elapsed);
  return {
    daily,
    weekly: mulMoney(daily, 7),
    elapsedDays: elapsed,
    totalDays,
    isCurrentMonth: monthKey === keyOfDate(new Date()),
    // Projeção do fechamento pelo ritmo atual. Só faz sentido no mês corrente.
    projected: monthKey === keyOfDate(new Date()) ? mulMoney(daily, totalDays) : totals.expense,
    expense: totals.expense,
    income: totals.income,
  };
}

// Mapa de calor: um ponto por dia do mês, com a intensidade normalizada pelo
// dia mais caro. `future` marca os dias que ainda não chegaram; pintar zero
// num dia futuro faria o fim do mês parecer barato.
function anHeatmap(data, monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  const total = anDaysInMonthKey(monthKey);
  const elapsed = anElapsedDays(monthKey);
  const cents = new Array(total + 1).fill(0);
  const counts = new Array(total + 1).fill(0);

  realizedTxForMonth(data, monthKey).forEach((t) => {
    const c = consumptionCentsOf(t);          // mesma régua do total do mês
    if (!c) return;
    const d = Number(String(t.date).slice(8, 10));
    if (d >= 1 && d <= total) { cents[d] += c; counts[d]++; }
  });

  // Um dia pode fechar negativo quando o estorno supera o consumo. O valor sai
  // como está, porque é a verdade do dia; a intensidade da cor é que nunca
  // pode ser negativa, sob pena de inverter a escala do mapa inteiro.
  const max = Math.max(0, ...cents.slice(1));
  const days = [];
  for (let d = 1; d <= total; d++) {
    const date = new Date(y, m - 1, d);
    days.push({
      day: d,
      iso: isoOfDate(date),
      weekday: date.getDay(),
      value: moneyFromCents(cents[d]),
      count: counts[d],
      intensity: max > 0 ? Math.round((Math.max(0, cents[d]) / max) * 100) / 100 : 0,
      future: elapsed > 0 && d > elapsed,
      weekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }
  const withSpend = days.filter((d) => d.value > 0);
  return {
    days,
    max: moneyFromCents(max),
    firstWeekday: new Date(y, m - 1, 1).getDay(),
    daysWithSpend: withSpend.length,
    quietDays: days.filter((d) => !d.future && d.value === 0).length,
    top: withSpend.slice().sort((a, b) => moneyCompare(b.value, a.value)).slice(0, 3),
  };
}

// Série de 12 meses para o gráfico comparativo (gasto, receita e sobra).

function anMonthlySeries(data, monthKey, months) {
  const n = months || 12;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = anMonthKeyMinus(monthKey, i);
    const t = realizedMonthTotals(data, key);
    out.push({
      monthKey: key,
      label: anMonthAbbr(key),
      income: t.income,
      expense: t.expense,
      saving: subMoney(t.income, t.expense),
      empty: t.tx.length === 0,
    });
  }
  return out;
}

// ------------------------------------------------------------------------------
// Modelo completo
// ------------------------------------------------------------------------------
function buildAnalyticsModel(data, monthKey) {
  const key = monthKey || keyOfDate(new Date());
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const totals = realizedMonthTotals(data, key);

  return {
    monthKey: key,
    monthLabel: anMonthLabel(key),
    hasData: totals.tx.length > 0,
    totals: {
      income: totals.income,
      expense: totals.expense,
      saving: subMoney(totals.income, totals.expense),
      fixed: totals.fixed,
      variable: totals.variable,
      savingRate: totals.income > 0 ? safePct(subMoney(totals.income, totals.expense), totals.income) : 0,
    },
    mom: safe(() => anMonthOverMonth(data, key), null),
    yoy: safe(() => anYearOverYear(data, key), null),
    categories: safe(() => anCategoryDeltas(data, key), { grew: [], shrank: [], rows: [], baselineMonths: 0 }),
    extremes: safe(() => anExtremes(data, key), { available: false }),
    dominant: safe(() => anDominant(data, key), { available: false }),
    weekday: safe(() => anWeekdayProfile(data, key), { rows: [], available: false }),
    hours: safe(() => anHourProfile(data, key), { available: false, periods: [], rows: [] }),
    averages: safe(() => anAverages(data, key), null),
    heatmap: safe(() => anHeatmap(data, key), { days: [], max: 0, top: [] }),
    series: safe(() => anMonthlySeries(data, key, 12), []),
  };
}
