// debts.js; cálculos puros e modelo da Central de Dívidas
"use strict";

const DEBT_TYPE_LABELS = {
  "cartao-rotativo": "Cartão rotativo",
  emprestimo: "Empréstimo",
  financiamento: "Financiamento",
  consignado: "Consignado",
  "cheque-especial": "Cheque especial",
  parcelamento: "Parcelamento",
  tributo: "Tributo",
  outro: "Outra dívida",
};

const DEBT_AMORTIZATION_LABELS = {
  price: "Tabela Price",
  sac: "SAC",
  fixed: "Parcela fixa",
  unknown: "Não informado",
};

function activeDebts(data) {
  return (data.assets || []).filter((a) => a.kind === "liability" && a.debtStatus !== "paid" && Number(a.value) > 0);
}

// TAXA CONTRATUAL x CET: são coisas diferentes e serviam a um propósito só.
//
// O código anterior PREFERIA o CET para fazer o saldo devedor crescer. O CET
// inclui IOF, tarifa de cadastro, seguro prestamista e registro; nada disso
// incide sobre o saldo mês a mês, porque a maior parte já foi cobrada na
// contratação. Usá-lo como juro do saldo inflava a dívida projetada e, junto,
// o valor de quitação e o tempo estimado para sair dela.
//
//   * taxa CONTRATUAL -> evolução do saldo, parcelas, cronograma, quitação;
//   * CET             -> comparação entre propostas e ordenação por custo.
function debtMonthlyRateInfo(debt) {
  const rate = debt.ratePct;
  if (rate != null && Number.isFinite(Number(rate)) && debt.ratePeriod !== "unknown") {
    const monthly = debt.ratePeriod === "year" ? Math.pow(1 + Number(rate) / 100, 1 / 12) - 1 : Number(rate) / 100;
    return { monthly, annualPct: (Math.pow(1 + monthly, 12) - 1) * 100, known: true, source: "rate" };
  }
  // Sem taxa contratual, o CET é a única referência disponível. Ele é aceito,
  // mas DECLARADO como aproximação: o saldo projetado sai maior que o real.
  const cet = debt.cetAnnualPct;
  if (cet != null && Number.isFinite(Number(cet))) {
    return {
      monthly: Math.pow(1 + Number(cet) / 100, 1 / 12) - 1,
      annualPct: Number(cet),
      known: true,
      source: "cet-fallback",
      approximate: true,
    };
  }
  return { monthly: 0, annualPct: null, known: false, source: "unknown" };
}

// CET para COMPARAÇÃO. Quando não foi informado, cai na taxa contratual, que é
// o piso do custo (o CET real nunca é menor).
function debtCetInfo(debt) {
  const cet = debt.cetAnnualPct;
  if (cet != null && Number.isFinite(Number(cet))) {
    return { annualPct: Number(cet), monthly: Math.pow(1 + Number(cet) / 100, 1 / 12) - 1, known: true, source: "cet" };
  }
  const contractual = debtMonthlyRateInfo(debt);
  if (contractual.known) {
    return { annualPct: contractual.annualPct, monthly: contractual.monthly, known: false, source: "rate-floor", isFloor: true };
  }
  return { annualPct: null, monthly: 0, known: false, source: "unknown" };
}

// ------------------------------------------------------------------------------
// CRONOGRAMAS PRICE E SAC
// ------------------------------------------------------------------------------
// Os dois sistemas amortizam de formas diferentes, e a diferença importa para
// quem quer antecipar: em SAC a amortização é constante e o saldo cai mais
// rápido no começo; em Price a parcela é constante e os primeiros pagamentos
// são quase só juros.
function debtSchedule(principal, monthlyRate, months, system) {
  const n = Math.max(0, Math.round(months) || 0);
  let balanceCents = moneyToCents(Math.max(0, roundMoney(principal)));
  if (n === 0 || balanceCents <= 0) return { rows: [], totalInterest: 0, totalPaid: 0, system };

  const rows = [];
  let interestCents = 0;
  let paidCents = 0;

  if (system === "sac") {
    const amortCents = Math.round(balanceCents / n);
    for (let m = 1; m <= n; m++) {
      const juros = Math.round(balanceCents * monthlyRate);
      // A última parcela amortiza o que sobrou, para o saldo fechar em zero.
      const amort = m === n ? balanceCents : Math.min(amortCents, balanceCents);
      const parcela = amort + juros;
      balanceCents -= amort;
      interestCents += juros;
      paidCents += parcela;
      rows.push({
        month: m, payment: moneyFromCents(parcela), interest: moneyFromCents(juros),
        amortization: moneyFromCents(amort), balance: moneyFromCents(Math.max(0, balanceCents)),
      });
    }
  } else {
    const base = monthlyRate > 0
      ? balanceCents * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
      : balanceCents / n;
    const parcelaCents = Math.round(base);
    for (let m = 1; m <= n; m++) {
      const juros = Math.round(balanceCents * monthlyRate);
      let amort = parcelaCents - juros;
      let parcela = parcelaCents;
      if (m === n || amort >= balanceCents) {
        // Fecha exatamente: o resíduo do arredondamento vai para a última.
        amort = balanceCents;
        parcela = amort + juros;
      }
      balanceCents -= amort;
      interestCents += juros;
      paidCents += parcela;
      rows.push({
        month: m, payment: moneyFromCents(parcela), interest: moneyFromCents(juros),
        amortization: moneyFromCents(amort), balance: moneyFromCents(Math.max(0, balanceCents)),
      });
      if (balanceCents <= 0) break;
    }
  }

  return {
    system: system === "sac" ? "sac" : "price",
    rows,
    totalInterest: moneyFromCents(interestCents),
    totalPaid: moneyFromCents(paidCents),
  };
}

// ------------------------------------------------------------------------------
// SALDO DE QUITAÇÃO (antecipação)
// ------------------------------------------------------------------------------
// O CDC (art. 52, §2º) garante redução PROPORCIONAL dos juros na quitação
// antecipada. Na prática isso significa pagar o VALOR PRESENTE das parcelas que
// faltam, descontado pela taxa contratual, e não a soma nominal delas.
//
// O app antes exibia o saldo contábil (que já embute juros futuros) como valor
// para quitar. Quem seguisse aquele número pagaria a mais.
function debtPayoffQuote(debt, options) {
  const opts = options || {};
  const rate = debtMonthlyRateInfo(debt);
  const parcela = Math.max(0, Number(debt.monthlyPayment) || 0);
  const restantes = Math.max(0, Math.round(Number(debt.remainingInstallments) || 0));
  const saldoContabil = Math.max(0, roundMoney(debt.value));

  if (!parcela || !restantes) {
    return {
      available: false,
      reason: !parcela ? "sem-parcela" : "sem-prazo",
      accountingBalance: saldoContabil,
      payoff: saldoContabil,
      savings: 0,
      rateSource: rate.source,
    };
  }

  const nominal = roundMoney(parcela * restantes);
  if (!rate.known || rate.monthly <= 0) {
    // Sem taxa, o valor presente é a própria soma: não dá para descontar o que
    // não se sabe. Fica declarado para a tela não apresentar isso como quitação
    // com desconto.
    return {
      available: false, reason: "sem-taxa",
      accountingBalance: saldoContabil, nominalRemaining: nominal,
      payoff: saldoContabil, savings: 0, rateSource: rate.source,
    };
  }

  let pvCents = 0;
  for (let m = 1; m <= restantes; m++) {
    pvCents += moneyToCents(parcela) / Math.pow(1 + rate.monthly, m);
  }
  const payoff = moneyFromCents(Math.round(pvCents));
  return {
    available: true,
    accountingBalance: saldoContabil,
    nominalRemaining: nominal,
    payoff,
    // Quanto se economiza em relação a seguir pagando até o fim.
    savings: subMoney(nominal, payoff),
    remainingInstallments: restantes,
    monthlyRate: rate.monthly,
    rateSource: rate.source,
    approximate: !!rate.approximate,
    basis: "Valor presente das parcelas restantes, descontado pela taxa contratual (CDC art. 52, §2º).",
  };
}

// A ordenação por custo (avalanche) usa o CET, que é a medida de comparação
// entre dívidas. A evolução do saldo continua usando a taxa contratual.
function orderDebts(debts, strategy) {
  return [...debts].sort((a, b) => {
    const ar = debtCetInfo(a);
    const br = debtCetInfo(b);
    if (strategy === "snowball") {
      if (Number(a.value) !== Number(b.value)) return Number(a.value) - Number(b.value);
      if (ar.known !== br.known) return ar.known ? -1 : 1;
      return br.monthly - ar.monthly;
    }
    const aTem = ar.annualPct != null;
    const bTem = br.annualPct != null;
    if (aTem !== bTem) return aTem ? -1 : 1;
    if (aTem && ar.monthly !== br.monthly) return br.monthly - ar.monthly;
    return Number(a.value) - Number(b.value);
  });
}

function simulateDebtPayoff(debtsOrData, options) {
  const opts = options || {};
  const strategy = opts.strategy === "snowball" ? "snowball" : "avalanche";
  const debts = activeDebts(Array.isArray(debtsOrData) ? { assets: debtsOrData } : debtsOrData || {});
  const priority = orderDebts(debts, strategy);
  const extraMonthly = Math.max(0, roundMoney(opts.extraMonthly));
  const minimumBudget = sumMoney(debts, (d) => Math.max(0, Number(d.monthlyPayment) || 0));
  const monthlyBudget = addMoney(minimumBudget, extraMonthly);
  const rows = new Map(debts.map((d) => [d.id, {
    debt: d,
    balance: Math.max(0, roundMoney(d.value)),
    rate: debtMonthlyRateInfo(d),
    interest: 0,
    clearedMonth: null,
  }]));
  const unknownRateIds = debts.filter((d) => !debtMonthlyRateInfo(d).known).map((d) => d.id);
  const missingPaymentIds = debts.filter((d) => !(Number(d.monthlyPayment) > 0)).map((d) => d.id);
  const negativeAmortizationIds = new Set();
  const timeline = [];
  let stalled = debts.length > 0 && monthlyBudget <= 0;
  let month = 0;

  while (!stalled && month < 600 && Array.from(rows.values()).some((r) => r.balance > 0.004)) {
    month++;
    let monthInterest = 0;
    rows.forEach((r) => {
      if (r.balance <= 0) return;
      const interest = roundMoney(r.balance * r.rate.monthly);
      if (r.rate.known) r.interest = addMoney(r.interest, interest);
      r.balance = addMoney(r.balance, interest);
      monthInterest = addMoney(monthInterest, interest);
      if (r.rate.known && interest > 0 && Number(r.debt.monthlyPayment) <= interest) negativeAmortizationIds.add(r.debt.id);
    });

    let available = monthlyBudget;
    debts.forEach((d) => {
      const r = rows.get(d.id);
      if (!r || r.balance <= 0 || available <= 0) return;
      const payment = Math.min(r.balance, Math.max(0, Number(d.monthlyPayment) || 0), available);
      r.balance = subMoney(r.balance, payment);
      available = subMoney(available, payment);
    });

    priority.forEach((d) => {
      const r = rows.get(d.id);
      if (!r || r.balance <= 0 || available <= 0) return;
      const payment = Math.min(r.balance, available);
      r.balance = subMoney(r.balance, payment);
      available = subMoney(available, payment);
    });

    rows.forEach((r) => {
      if (r.balance <= 0.004 && r.clearedMonth == null) {
        r.balance = 0;
        r.clearedMonth = month;
      }
    });
    const totalBalance = sumMoney(Array.from(rows.values()), (r) => r.balance);
    timeline.push({ month, balance: totalBalance, interest: monthInterest, paid: subMoney(monthlyBudget, available) });
    if (timeline.length > 1 && moneyToCents(timeline[timeline.length - 1].balance) >= moneyToCents(timeline[timeline.length - 2].balance) && monthlyBudget <= monthInterest) stalled = true;
  }

  const complete = debts.length === 0 || Array.from(rows.values()).every((r) => r.balance <= 0.004);
  const perDebt = priority.map((d) => {
    const r = rows.get(d.id);
    return { id: d.id, name: d.name, clearedMonth: r.clearedMonth, interest: r.rate.known ? roundMoney(r.interest) : null, rate: r.rate };
  });
  return {
    strategy,
    extraMonthly,
    minimumBudget,
    monthlyBudget,
    months: complete ? month : null,
    complete,
    capped: !complete && month >= 600,
    stalled,
    totalInterest: unknownRateIds.length ? null : sumMoney(perDebt, (r) => r.interest || 0),
    knownInterest: sumMoney(perDebt, (r) => r.interest || 0),
    unknownRateIds,
    missingPaymentIds,
    negativeAmortizationIds: Array.from(negativeAmortizationIds),
    perDebt,
    priority: priority.map((d) => d.id),
    timeline,
  };
}

function monthsFromTodayIso(months, fromIso) {
  if (months == null) return null;
  const base = new Date(`${fromIso || todayIso()}T12:00:00`);
  base.setMonth(base.getMonth() + months);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function nextDueDateForDebt(debt, fromIso) {
  const today = fromIso || todayIso();
  if (debt.nextDueDate && debt.nextDueDate >= today) return debt.nextDueDate;
  const dueDay = Number(debt.dueDay) || 0;
  if (!dueDay) return "";
  const now = new Date(`${today}T12:00:00`);
  let y = now.getFullYear();
  let m = now.getMonth();
  const make = () => {
    const last = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
  };
  let iso = make();
  if (iso < today) {
    m++;
    if (m > 11) { m = 0; y++; }
    iso = make();
  }
  return iso;
}

function isStaleDebtBalance(debt, today) {
  if (!debt.balanceCheckedAt) return true;
  const checked = new Date(`${debt.balanceCheckedAt}T12:00:00`);
  const now = new Date(`${today || todayIso()}T12:00:00`);
  return Number.isFinite(checked.getTime()) && (now - checked) / 86400000 > 60;
}

function buildDebtModel(data, options) {
  const plan = normalizeDebtPlan({ ...(data.debtPlan || {}), ...(options || {}) });
  const debts = activeDebts(data);
  const avalanche = simulateDebtPayoff(debts, { strategy: "avalanche", extraMonthly: plan.extraMonthly });
  const snowball = simulateDebtPayoff(debts, { strategy: "snowball", extraMonthly: plan.extraMonthly });
  const simulation = plan.strategy === "snowball" ? snowball : avalanche;
  const monthKey = keyOfDate(new Date());
  const income = typeof effectiveIncome === "function" ? effectiveIncome(data, monthKey) : Number(data.monthlyIncome) || 0;
  const monthlyPayment = sumMoney(debts, (d) => d.monthlyPayment);
  const payments = (data.transactions || []).filter((t) => t.type === "expense" && t.debtId);
  const accountSummary = typeof accountsSummary === "function" ? accountsSummary(data) : null;
  return {
    debts,
    ordered: orderDebts(debts, plan.strategy),
    plan,
    simulation,
    avalanche,
    snowball,
    totalBalance: sumMoney(debts, (d) => d.value),
    monthlyPayment,
    income,
    burdenPct: income > 0 ? monthlyPayment / income * 100 : null,
    estimatedDebtFreeAt: debts.length ? monthsFromTodayIso(simulation.months) : null,
    payments,
    staleIds: debts.filter((d) => isStaleDebtBalance(d)).map((d) => d.id),
    shortTermCards: accountSummary ? { due: accountSummary.cardDue, future: accountSummary.futureCard } : { due: 0, future: 0 },
  };
}

function isDuplicateDebtPayment(data, debtId, date, amount) {
  return (data.transactions || []).some((t) => t.type === "expense" && t.debtId === debtId && t.date === date && moneyEquals(t.amount, amount));
}

function updateDebtBalance(debt, value, date) {
  const updated = updateAssetValue(debt, value, monthKeyOf(date || todayIso()));
  const nextValue = Math.max(0, roundMoney(value));
  return {
    ...updated,
    value: nextValue,
    balanceCheckedAt: date || todayIso(),
    debtStatus: debt.debtStatus === "negotiating" ? "negotiating" : nextValue <= 0 ? "paid" : "active",
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEBT_TYPE_LABELS, DEBT_AMORTIZATION_LABELS, activeDebts, debtMonthlyRateInfo,
    orderDebts, simulateDebtPayoff, monthsFromTodayIso, nextDueDateForDebt,
    isStaleDebtBalance, buildDebtModel, isDuplicateDebtPayment, updateDebtBalance,
  };
}
