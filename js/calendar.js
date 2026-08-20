// calendar.js. CALENDÁRIO FINANCEIRO E PLANEJAMENTO ANUAL (motor puro)  [Módulo 4]
// ------------------------------------------------------------------------------
// Responsabilidade única: montar a grade de um mês com o que já aconteceu e o que
// está previsto, e a lista de eventos financeiros do ano. Nenhuma função toca no
// DOM, no estado da UI ou no armazenamento.
//
// A tela de extrato responde "o que eu gastei". O calendário responde uma
// pergunta diferente e mais útil: **"em que dia o dinheiro sai?"**. É a diferença
// entre saber que a fatura é de R$ 3.200 e saber que ela cai três dias antes do
// salário.
//
// Fatos e previsões nunca se misturam: cada evento carrega `certain`, e o total
// do mês separa realizado de previsto. Um app que soma os dois no mesmo número
// transforma estimativa em promessa.
"use strict";

const WEEKDAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/* ==============================================================================
 * EVENTOS DO MÊS
 * ============================================================================== */

// Lançamentos que já aconteceram no mês (até hoje, inclusive).

function realizedEventsOf(data, monthKey, today) {
  return txForMonth(data, monthKey)
    .filter((t) => t.date <= today)
    .map((t) => {
      const cat = categoryById(data, t.categoryId);
      return {
        id: `done-${t.id}`,
        txId: t.id,
        iso: t.date,
        type: t.type,
        amount: roundMoney(t.amount),
        label: t.description || cat.name,
        categoryName: cat.name,
        color: cat.color,
        icon: cat.icon,
        kind: t.goalId ? "goal" : (t.installmentTotal ? "installment" : "done"),
        installment: t.installmentTotal ? `${t.installmentIndex}/${t.installmentTotal}` : null,
        certain: true,
        done: true,
      };
    });
}

// Fixos do mês corrente que já passaram da data e ainda não foram lançados.
// `buildFutureEvents` só olha para frente; sem este bloco a conta atrasada
// desapareceria justamente no dia em que ela passa a importar.
function overdueEventsOf(data, monthKey, today) {
  if (monthKey !== monthKeyOf(today)) return [];
  return getPendingRecurring(data, monthKey).map((t) => {
    const day = Number(String(t.date).slice(8, 10)) || 1;
    const [y, m] = monthKey.split("-").map(Number);
    const iso = `${monthKey}-${String(Math.min(day, daysInMonthOf(y, m - 1))).padStart(2, "0")}`;
    if (iso > today) return null;   // ainda vai vencer → é previsão, não atraso
    const cat = categoryById(data, t.categoryId);
    return {
      id: `late-${t.id}`,
      iso,
      type: "expense",
      amount: roundMoney(t.amount),
      label: t.description || cat.name,
      categoryName: cat.name,
      color: cat.color,
      icon: cat.icon,
      kind: "late",
      installment: null,
      certain: false,
      done: false,
    };
  }).filter(Boolean);
}

// Todos os eventos de um mês: realizados + atrasados + previstos.

function calendarEventsOf(data, monthKey, todayIsoStr) {
  const today = todayIsoStr || todayIso();
  const [y, m] = monthKey.split("-").map(Number);
  const lastIso = `${monthKey}-${String(daysInMonthOf(y, m - 1)).padStart(2, "0")}`;
  const firstIso = `${monthKey}-01`;

  const events = [
    ...realizedEventsOf(data, monthKey, today),
    ...overdueEventsOf(data, monthKey, today),
  ];

  // Previsões: do maior entre "hoje" e "o dia anterior ao mês" até o fim do mês.

  const from = today >= firstIso ? today : isoOfDate(new Date(dateFromIso(firstIso).getTime() - 86400000));
  if (lastIso > from) {
    buildFutureEvents(data, from, lastIso).forEach((e) => {
      if (monthKeyOf(e.iso) !== monthKey) return;
      events.push({ ...e, done: false });
    });
  }

  events.sort((a, b) => {
    if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
    if (a.type !== b.type) return a.type === "income" ? -1 : 1;
    return moneyCompare(b.amount, a.amount);
  });
  return events;
}

/* ==============================================================================
 * GRADE DO MÊS
 * ============================================================================== */

// Semanas de domingo a sábado, com os dias de fora do mês preenchidos para a
// grade não "quebrar" nas pontas.
function buildCalendarMonth(data, monthKey, todayIsoStr) {
  const today = todayIsoStr || todayIso();
  const [y, m] = monthKey.split("-").map(Number);
  const dim = daysInMonthOf(y, m - 1);
  const first = new Date(y, m - 1, 1);
  const leading = first.getDay();

  const events = calendarEventsOf(data, monthKey, today);
  const byDay = new Map();
  events.forEach((e) => {
    let row = byDay.get(e.iso);
    if (!row) { row = { iso: e.iso, events: [], incomeC: 0, expenseC: 0, hasLate: false, hasPlanned: false }; byDay.set(e.iso, row); }
    row.events.push(e);
    if (e.type === "income") row.incomeC += moneyToCents(e.amount);
    else if (e.type === "expense") row.expenseC += moneyToCents(e.amount);
    if (e.kind === "late") row.hasLate = true;
    if (!e.certain) row.hasPlanned = true;
  });

  const cells = [];
  const cursor = new Date(y, m - 1, 1 - leading);
  const totalCells = Math.ceil((leading + dim) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const iso = isoOfDate(cursor);
    const inMonth = monthKeyOf(iso) === monthKey;
    const row = byDay.get(iso);
    cells.push({
      iso,
      day: cursor.getDate(),
      weekday: cursor.getDay(),
      inMonth,
      isToday: iso === today,
      isPast: iso < today,
      income: row ? moneyFromCents(row.incomeC) : 0,
      expense: row ? moneyFromCents(row.expenseC) : 0,
      count: row ? row.events.length : 0,
      hasLate: !!(row && row.hasLate),
      hasPlanned: !!(row && row.hasPlanned),
      events: row ? row.events : [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const inMonthEvents = events.filter((e) => monthKeyOf(e.iso) === monthKey);
  const realized = inMonthEvents.filter((e) => e.done);
  const planned = inMonthEvents.filter((e) => !e.done && e.type !== "marker");

  const totals = {
    realizedIncome: sumMoney(realized.filter((e) => e.type === "income"), (e) => e.amount),
    realizedExpense: sumMoney(realized.filter((e) => e.type === "expense"), (e) => e.amount),
    plannedIncome: sumMoney(planned.filter((e) => e.type === "income"), (e) => e.amount),
    plannedExpense: sumMoney(planned.filter((e) => e.type === "expense"), (e) => e.amount),
    lateCount: inMonthEvents.filter((e) => e.kind === "late").length,
    lateTotal: sumMoney(inMonthEvents.filter((e) => e.kind === "late"), (e) => e.amount),
    count: inMonthEvents.length,
  };
  totals.income = addMoney(totals.realizedIncome, totals.plannedIncome);
  totals.expense = addMoney(totals.realizedExpense, totals.plannedExpense);
  totals.net = subMoney(totals.income, totals.expense);

  // Os três dias mais pesados do mês; onde a régua realmente aperta.

  const heaviest = [...byDay.values()]
    .filter((r) => monthKeyOf(r.iso) === monthKey && r.expenseC > 0)
    .sort((a, b) => b.expenseC - a.expenseC)
    .slice(0, 3)
    .map((r) => ({ iso: r.iso, expense: moneyFromCents(r.expenseC), count: r.events.length }));

  return {
    monthKey, year: y, month: m - 1,
    label: `${MONTH_NAMES[m - 1]} de ${y}`,
    isCurrentMonth: monthKey === monthKeyOf(today),
    weekdays: WEEKDAY_ABBR,
    weeks, events: inMonthEvents, totals, heaviest,
    dayOf: (iso) => byDay.get(iso) || null,
  };
}

/* ==============================================================================
 * PLANEJAMENTO ANUAL
 * ==============================================================================
 * Datas que todo brasileiro sabe que existem e mesmo assim esquece. A lista é
 * fixa (é o calendário do país, não um dado do usuário), mas o VALOR estimado sai
 * do histórico real: se você pagou IPVA em janeiro do ano passado, o app mostra
 * quanto foi. Sem histórico, o item aparece como lembrete, sem número inventado.
 */
const ANNUAL_EVENTS = [
  { id: "ipva",       month: 0,  name: "IPVA",                 icon: "transport", note: "Vence entre janeiro e março, por final de placa. À vista costuma dar desconto.", match: /ipva|licenciamento/i },
  { id: "iptu",       month: 0,  name: "IPTU",                 icon: "home",      note: "Cota única em janeiro/fevereiro geralmente tem desconto.", match: /iptu/i },
  { id: "material",   month: 0,  name: "Material escolar",     icon: "education", note: "Matrícula, uniforme e material concentram-se em janeiro.", match: /material escolar|matr[ií]cula|uniforme/i },
  { id: "licenciam",  month: 2,  name: "Licenciamento e seguro do carro", icon: "transport", note: "Seguro, licenciamento e revisão costumam cair no mesmo trimestre.", match: /seguro (do )?(carro|auto)|licenciamento/i },
  { id: "irpf",       month: 3,  name: "Imposto de Renda",     icon: "file",      note: "A Receita publica o calendário de cada exercício. Confirme o prazo anual e planeje eventual primeira cota.", match: /imposto de renda|irpf|darf/i },
  { id: "ferias",     month: 6,  name: "Férias",               icon: "plane",     note: "Julho e janeiro são os meses caros. Reserve antes, não durante.", match: /f[ée]rias|viagem/i },
  { id: "volta",      month: 7,  name: "Volta às aulas",       icon: "book",      note: "Segundo semestre traz material e mensalidades reajustadas.", match: /mensalidade|escola|faculdade/i },
  { id: "blackfri",   month: 10, name: "Black Friday",         icon: "cart",      note: "Defina o teto ANTES de novembro. Promoção sem orçamento é gasto, não economia.", match: /black friday/i },
  { id: "decimo",     month: 11, name: "13º salário",          icon: "briefcase", note: "Entrada extra. Compare quitar dívida cara, reforçar a reserva e outras prioridades do período.", match: /13|d[ée]cimo terceiro/i, income: true },
  { id: "natal",      month: 11, name: "Natal e fim de ano",   icon: "gift",      note: "Presentes, ceia e confraternizações. É o mês que mais estoura orçamento.", match: /natal|presente|ceia/i },
];

// Quanto o usuário gastou em anos anteriores em um evento, casando descrição ou
// categoria dentro do mês do evento. Devolve o registro mais recente encontrado.
function annualEventHistory(data, event, year) {
  const found = [];
  (data.transactions || []).forEach((t) => {
    const [ty, tm] = String(t.date).split("-").map(Number);
    if (!ty || ty >= year) return;
    if (tm - 1 !== event.month) return;
    const cat = categoryById(data, t.categoryId);
    const haystack = `${t.description || ""} ${cat.name}`;
    if (!event.match.test(haystack)) return;
    if (event.income ? t.type !== "income" : t.type !== "expense") return;
    found.push({ year: ty, amount: roundMoney(t.amount), description: t.description || cat.name });
  });
  if (found.length === 0) return null;
  found.sort((a, b) => b.year - a.year);
  return found[0];
}

function buildAnnualPlan(data, year, todayIsoStr) {
  const today = todayIsoStr || todayIso();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;
  const y = year || currentYear;

  const items = ANNUAL_EVENTS.map((e) => {
    const history = annualEventHistory(data, e, y);
    const passed = y < currentYear || (y === currentYear && e.month < currentMonth);
    return {
      id: e.id,
      name: e.name,
      icon: e.icon,
      note: e.note,
      month: e.month,
      monthLabel: MONTH_NAMES[e.month],
      monthAbbr: MONTH_ABBR[e.month],
      isIncome: !!e.income,
      estimated: history ? history.amount : null,
      estimatedFrom: history ? history.year : null,
      passed,
      isCurrent: y === currentYear && e.month === currentMonth,
    };
  });

  const upcoming = items.filter((i) => !i.passed);
  const knownTotal = sumMoney(upcoming.filter((i) => !i.isIncome && i.estimated), (i) => i.estimated);

  return {
    year: y,
    items,
    upcoming,
    knownTotal,
    knownCount: upcoming.filter((i) => i.estimated).length,
    monthlyReserve: knownTotal > 0 ? divMoney(knownTotal, Math.max(1, 12 - (y === currentYear ? currentMonth : 0))) : 0,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildCalendarMonth, calendarEventsOf, buildAnnualPlan, ANNUAL_EVENTS };
}
