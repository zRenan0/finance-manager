// simulators.js. [M5] Motores dos simuladores financeiros (puros, sem DOM)
// ------------------------------------------------------------------------------
// Todos os simuladores da tela "Simuladores" saem daqui. Nenhuma função toca no
// DOM, no `state` ou no armazenamento: entra um objeto de premissas, sai um
// modelo de resultado. É o que permite testar cada conta isoladamente.
//
// PRINCÍPIO QUE ORGANIZA O ARQUIVO: um simulador honesto mostra o número LÍQUIDO.
// Renda fixa sem IR, financiamento sem CET e consórcio sem taxa de administração
// são propagandas, não simulações. Por isso:
//
//   • Renda fixa desconta IR pela tabela regressiva, IOF nos primeiros 30 dias,
//     taxa de custódia e taxa de administração; e o IR é calculado LOTE A LOTE,
//     porque cada aporte tem o próprio prazo e a própria alíquota.
//   • Empréstimo e financiamento calculam o CET real (TIR do fluxo de caixa),
//     que é maior que a taxa anunciada sempre que existe tarifa ou seguro.
//   • Rotativo do cartão respeita o teto legal: juros e encargos não podem
//     ultrapassar 100% do valor original da dívida.
//   • Aposentadoria trabalha com taxa REAL (descontada a inflação), então todos
//     os valores aparecem no poder de compra de hoje. Projetar R$ 3 milhões
//     nominais em 30 anos é verdade e é inútil ao mesmo tempo.
"use strict";

/* ==============================================================================
 * TABELAS OFICIAIS
 * ============================================================================== */

// ------------------------------------------------------------------------------
// REGRAS TRIBUTÁRIAS VERSIONADAS
// ------------------------------------------------------------------------------
// A tabela vive num objeto com VIGÊNCIA declarada. Sem isso, uma mudança futura
// de alíquota reescreveria silenciosamente todo cálculo já feito e mostrado ao
// usuário, inclusive os do passado. Com a vigência, dá para escolher a regra
// aplicável à data do investimento e dizer na tela qual foi usada.
const TAX_RULES = Object.freeze([
  {
    id: "ir-renda-fixa-1998",
    since: "1998-01-01",
    source: "Lei 11.033/2004, art. 1º (tabela regressiva de IR em renda fixa)",
    // Faixas em DIAS CORRIDOS, contados da aplicação até o resgate.
    brackets: [
      { upToDays: 180, pct: 22.5 },
      { upToDays: 360, pct: 20 },
      { upToDays: 720, pct: 17.5 },
      { upToDays: Infinity, pct: 15 },
    ],
  },
]);

function taxRuleFor(dateIso) {
  const ref = String(dateIso || "") || todayIso();
  const aplicaveis = TAX_RULES.filter((r) => r.since <= ref);
  return aplicaveis.length ? aplicaveis[aplicaveis.length - 1] : TAX_RULES[TAX_RULES.length - 1];
}

// IR sobre rendimento de renda fixa; tabela regressiva por prazo em DIAS REAIS.
//
// O simulador contava 30 dias por mês. Num plano de 24 meses isso dava 720 dias
// e caía na faixa de 17,5%; o prazo real é de 730 ou 731 dias e a faixa correta
// é 15%. O erro aparecia exatamente nas fronteiras, que é onde a decisão do
// usuário costuma estar ("deixo mais um mês?").
function irAliquotFor(days, dateIso) {
  const regra = taxRuleFor(dateIso);
  const faixa = regra.brackets.find((b) => days <= b.upToDays);
  return faixa ? faixa.pct : 15;
}

// Dias corridos entre duas datas ISO. É o que a Receita conta.
function daysBetweenDates(startIso, endIso) {
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Data ISO deslocada em meses, preservando o fim de mês.
function isoPlusMonths(startIso, months) {
  const base = new Date(`${startIso}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return startIso;
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  const alvo = new Date(Date.UTC(y, m + months, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

// IOF regressivo: incide apenas sobre o RENDIMENTO em resgates com menos de 30
// dias e zera no 30º dia. A tabela não é linear, então ela é literal aqui.
const IOF_TABLE = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50,
  46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];

function iofPctFor(days) {
  if (days >= 30) return 0;
  const idx = Math.max(1, Math.round(days)) - 1;
  return IOF_TABLE[Math.min(idx, IOF_TABLE.length - 1)];
}

// Faixas do saque-aniversário do FGTS: alíquota sobre o saldo + parcela fixa.

const FGTS_ANNIVERSARY_BANDS = [
  { upTo: 500, pct: 50, extra: 0 },
  { upTo: 1000, pct: 40, extra: 50 },
  { upTo: 5000, pct: 30, extra: 150 },
  { upTo: 10000, pct: 20, extra: 650 },
  { upTo: 15000, pct: 15, extra: 1150 },
  { upTo: 20000, pct: 10, extra: 1900 },
  { upTo: Infinity, pct: 5, extra: 2900 },
];

function fgtsAnniversaryWithdrawal(balance) {
  const b = Math.max(0, roundMoney(balance));
  const band = FGTS_ANNIVERSARY_BANDS.find((f) => b <= f.upTo);
  return Math.min(b, roundMoney(b * (band.pct / 100) + band.extra));
}

/* ==============================================================================
 * CONVERSÕES DE TAXA
 * ============================================================================== */

// Taxa mensal equivalente (juros compostos), não a divisão por 12; que é o erro
// que faz um financiamento parecer 20% mais barato do que é.
function annualToMonthly(annualPct) {
  return Math.pow(1 + (Number(annualPct) || 0) / 100, 1 / 12) - 1;
}
function monthlyToAnnual(monthlyRate) {
  return (Math.pow(1 + monthlyRate, 12) - 1) * 100;
}

// Composição de duas taxas (ex.: IPCA + 6% não é IPCA mais 6 pontos).

function compoundRates(aPct, bPct) {
  return ((1 + (Number(aPct) || 0) / 100) * (1 + (Number(bPct) || 0) / 100) - 1) * 100;
}

// Taxa efetiva anual de um indexador, dadas as premissas de mercado do usuário.
//   cdi      → `param` é o percentual do CDI (110 = 110% do CDI)
//   selic    → `param` é o spread em pontos (Selic + 0,10)
//   ipca     → `param` é o juro real contratado (IPCA + 6)
//   pre      → `param` é a própria taxa anual
//   poupanca → regra oficial derivada da Selic
function effectiveAnnualRate(indexer, param, rates) {
  const r = rates || {};
  const p = Number(param) || 0;
  switch (indexer) {
    case "cdi": return (Number(r.cdi) || 0) * (p / 100);
    case "selic": return compoundRates(Number(r.selic) || 0, p);
    case "ipca": return compoundRates(Number(r.ipca) || 0, p);
    case "poupanca": return Number(r.poupanca) || 0;
    case "pre":
    default: return p;
  }
}

/* ==============================================================================
 * 1. RENDA FIXA (CDI, Selic, Tesouro, IPCA+, prefixado, poupança)
 * ============================================================================== */
//
// O IR é calculado por LOTE. Cada aporte mensal tem prazo próprio: no resgate de
// um plano de 24 meses, o primeiro aporte pagou 20% e o último 22,5%. Aplicar a
// alíquota final sobre o rendimento inteiro erra sempre para menos.
function simFixedIncome(params) {
  const p = params || {};
  const principal = Math.max(0, roundMoney(p.principal));
  const monthly = Math.max(0, roundMoney(p.monthlyContribution));
  const months = clamp(Math.round(Number(p.months) || 12), 1, 600);
  const rates = p.rates || {};
  const indexer = p.indexer || "pre";

  const grossAnnual = Math.max(-99, effectiveAnnualRate(indexer, p.ratePct, rates));
  // Taxas de custódia (Tesouro Direto) e administração (fundos) corroem a taxa
  // de forma composta, não subtrativa.
  const feeAnnual = Math.max(0, Number(p.feeAnnualPct) || 0);
  const netOfFeeAnnual = ((1 + grossAnnual / 100) / (1 + feeAnnual / 100) - 1) * 100;
  const i = annualToMonthly(netOfFeeAnnual);

  const exempt = !!p.taxExempt;

  // Resgate em menos de 30 dias: é o único caso em que o IOF existe, e é
  // justamente a pergunta que o usuário faz ("vale a pena deixar 20 dias?").
  // Sem este ramo o simulador seria mensal e o IOF viraria código morto.
  const termDays = Number(p.termDays);
  if (Number.isFinite(termDays) && termDays > 0 && termDays < 30) {
    return fixedIncomeShortTerm({
      principal, days: Math.round(termDays), monthlyRate: i, exempt, rates,
      indexer, grossAnnual, feeAnnual, netOfFeeAnnual,
    });
  }

  const series = [];
  const lots = [];
  if (principal > 0) lots.push({ month: 0, amount: principal });
  for (let m = 1; m <= months; m++) if (monthly > 0) lots.push({ month: m, amount: monthly });

  let balance = roundMoney(principal);
  let contributed = roundMoney(principal);
  series.push({ month: 0, gross: balance, contributed, net: balance });
  for (let m = 1; m <= months; m++) {
    balance = addMoney(mulMoney(balance, 1 + i), monthly);
    contributed = addMoney(contributed, monthly);
    series.push({ month: m, gross: balance, contributed, net: balance });
  }

  // Resgate no fim do prazo: valor de cada lote e imposto do próprio lote.

  // Datas REAIS: cada lote tem a própria data de aplicação e todos são
  // resgatados na mesma data final. É a contagem que a Receita usa, e é a que
  // decide a faixa nas fronteiras de 180, 360 e 720 dias.
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(p.startDate || "")) ? String(p.startDate) : todayIso();
  const redeemDate = isoPlusMonths(startDate, months);
  const regraTributaria = taxRuleFor(startDate);

  let taxCents = 0;
  let iofCents = 0;
  const lotDetail = lots.map((lot) => {
    const held = months - lot.month;
    const lotDate = isoPlusMonths(startDate, lot.month);
    const days = daysBetweenDates(lotDate, redeemDate);
    const finalValue = roundMoney(lot.amount * Math.pow(1 + i, held));
    const earnings = Math.max(0, subMoney(finalValue, lot.amount));
    const iofPct = exempt ? 0 : iofPctFor(days);
    const iof = roundMoney(earnings * (iofPct / 100));
    const taxable = Math.max(0, subMoney(earnings, iof));
    const aliquot = exempt ? 0 : irAliquotFor(days, lotDate);
    const tax = roundMoney(taxable * (aliquot / 100));
    taxCents += moneyToCents(tax);
    iofCents += moneyToCents(iof);
    return { month: lot.month, date: lotDate, amount: lot.amount, days, finalValue, earnings, aliquot, tax, iof };
  });

  const grossFinal = roundMoney(balance);
  const tax = moneyFromCents(taxCents);
  const iof = moneyFromCents(iofCents);
  const netFinal = subMoney(subMoney(grossFinal, tax), iof);
  const grossEarnings = subMoney(grossFinal, contributed);
  const netEarnings = subMoney(netFinal, contributed);

  // Rentabilidade líquida efetiva: a taxa que, aplicada ao mesmo fluxo de
  // aportes, chegaria ao valor líquido. Sem isso não dá para comparar um CDB
  // tributado com uma LCI isenta.
  const netMonthlyRate = solveRateForContributions(principal, monthly, months, netFinal);
  const netAnnual = netMonthlyRate == null ? null : monthlyToAnnual(netMonthlyRate);
  const realAnnual = netAnnual == null ? null
    : ((1 + netAnnual / 100) / (1 + (Number(rates.ipca) || 0) / 100) - 1) * 100;

  return {
    months, indexer, exempt,
    grossAnnual, feeAnnual, netOfFeeAnnual,
    monthlyRate: i,
    series, lots: lotDetail,
    contributed: roundMoney(contributed),
    grossFinal, grossEarnings,
    tax, iof, netFinal, netEarnings,
    effectiveAliquot: grossEarnings > 0 ? ((tax + iof) / grossEarnings) * 100 : 0,
    netAnnualPct: netAnnual,
    realAnnualPct: realAnnual,
    losesToInflation: realAnnual != null && realAnnual < 0,
    // Datas e regra usadas ficam junto do resultado: é o que permite a tela
    // dizer "faixa de 15% porque o prazo foi de 731 dias" em vez de exibir um
    // número sem origem.
    startDate, redeemDate,
    taxRule: { id: regraTributaria.id, since: regraTributaria.since, source: regraTributaria.source },
    // Compra ÚNICA e compra RECORRENTE têm tributação diferente: na recorrente
    // cada aporte tem prazo próprio, e é por isso que o IR sai lote a lote.
    contributionMode: monthly > 0 ? (principal > 0 ? "misto" : "recorrente") : "unica",
  };
}

// Aplicação de curtíssimo prazo (menos de 30 dias): aporte único, IOF sobre o
// rendimento e IR de 22,5%. O resultado tem o MESMO formato do caso mensal para
// que a tela não precise saber de qual ramo o número veio.
function fixedIncomeShortTerm(o) {
  const held = o.days / 30;
  const grossFinal = roundMoney(o.principal * Math.pow(1 + o.monthlyRate, held));
  const grossEarnings = Math.max(0, subMoney(grossFinal, o.principal));
  const iofPct = o.exempt ? 0 : iofPctFor(o.days);
  const iof = roundMoney(grossEarnings * (iofPct / 100));
  const aliquot = o.exempt ? 0 : irAliquotFor(o.days);
  const tax = roundMoney(Math.max(0, subMoney(grossEarnings, iof)) * (aliquot / 100));
  const netFinal = subMoney(subMoney(grossFinal, tax), iof);
  const netEarnings = subMoney(netFinal, o.principal);
  const netAnnual = o.principal > 0 && held > 0
    ? (Math.pow(netFinal / o.principal, 12 / held) - 1) * 100
    : null;
  const ipca = Number((o.rates || {}).ipca) || 0;

  return {
    months: held, days: o.days, indexer: o.indexer, exempt: o.exempt, shortTerm: true,
    grossAnnual: o.grossAnnual, feeAnnual: o.feeAnnual, netOfFeeAnnual: o.netOfFeeAnnual,
    monthlyRate: o.monthlyRate,
    series: [{ month: 0, gross: o.principal, contributed: o.principal, net: o.principal },
             { month: held, gross: grossFinal, contributed: o.principal, net: netFinal }],
    lots: [{ month: 0, amount: o.principal, days: o.days, finalValue: grossFinal, earnings: grossEarnings, aliquot, tax, iof }],
    contributed: roundMoney(o.principal),
    grossFinal, grossEarnings, tax, iof, netFinal, netEarnings,
    effectiveAliquot: grossEarnings > 0 ? ((tax + iof) / grossEarnings) * 100 : 0,
    netAnnualPct: netAnnual,
    realAnnualPct: netAnnual == null ? null : ((1 + netAnnual / 100) / (1 + ipca / 100) - 1) * 100,
    losesToInflation: netAnnual != null && ((1 + netAnnual / 100) / (1 + ipca / 100) - 1) < 0,
  };
}

// Bisseção: acha a taxa mensal que leva o fluxo (inicial + aportes) ao valor
// final informado. Convergência garantida no intervalo, sem derivadas.
function solveRateForContributions(principal, monthly, months, target) {
  if (months <= 0) return null;
  if (principal <= 0 && monthly <= 0) return null;
  const fv = (rate) => {
    if (Math.abs(rate) < 1e-12) return principal + monthly * months;
    return principal * Math.pow(1 + rate, months) + monthly * ((Math.pow(1 + rate, months) - 1) / rate);
  };
  let lo = -0.9, hi = 1.0;
  if (fv(lo) > target || fv(hi) < target) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ==============================================================================
 * 2. EMPRÉSTIMO E FINANCIAMENTO (Price e SAC, com CET)
 * ============================================================================== */

function simLoan(params) {
  const p = params || {};
  const assetValue = Math.max(0, roundMoney(p.assetValue));
  const down = clamp(roundMoney(p.downPayment), 0, assetValue);
  const principal = Math.max(0, p.principal != null ? roundMoney(p.principal) : subMoney(assetValue, down));
  const months = clamp(Math.round(Number(p.months) || 12), 1, 480);
  const system = p.system === "sac" ? "sac" : "price";
  const annualPct = Math.max(0, Number(p.annualRatePct) || 0);
  const i = annualToMonthly(annualPct);
  const fee = Math.max(0, roundMoney(p.monthlyFee));          // tarifa administrativa
  const insurance = Math.max(0, roundMoney(p.monthlyInsurance)); // seguro prestamista/MIP
  const upfrontFee = Math.max(0, roundMoney(p.upfrontFee));   // IOF, avaliação, registro

  const schedule = [];
  let balance = principal;
  let interestCents = 0;
  const amortSac = principal / months;

  const pricePayment = i > 0
    ? principal * (i * Math.pow(1 + i, months)) / (Math.pow(1 + i, months) - 1)
    : principal / months;

  for (let m = 1; m <= months; m++) {
    const interest = roundMoney(balance * i);
    let amortization;
    if (system === "sac") amortization = roundMoney(amortSac);
    else amortization = roundMoney(pricePayment - interest);
    if (m === months) amortization = roundMoney(balance);       // fecha o saldo exato
    const payment = addMoney(addMoney(amortization, interest), addMoney(fee, insurance));
    balance = Math.max(0, subMoney(balance, amortization));
    interestCents += moneyToCents(interest);
    schedule.push({ month: m, payment, interest, amortization, balance, extras: addMoney(fee, insurance) });
  }

  const totalInterest = moneyFromCents(interestCents);
  const totalExtras = mulMoney(addMoney(fee, insurance), months);
  const totalPaid = schedule.reduce((s, r) => addMoney(s, r.payment), 0);
  const totalCost = addMoney(addMoney(totalPaid, down), upfrontFee);

  // CET: taxa que iguala o valor efetivamente recebido ao fluxo real de saídas
  // (parcela cheia, com tarifa e seguro). É sempre ≥ à taxa anunciada.
  const received = subMoney(principal, upfrontFee);
  const cetMonthly = solveIrr(received, schedule.map((r) => r.payment));
  const cetAnnual = cetMonthly == null ? null : monthlyToAnnual(cetMonthly);

  return {
    system, months, principal, down, assetValue,
    annualRatePct: annualPct, monthlyRate: i,
    schedule,
    firstPayment: schedule[0] ? schedule[0].payment : 0,
    lastPayment: schedule[schedule.length - 1] ? schedule[schedule.length - 1].payment : 0,
    payment: schedule[0] ? schedule[0].payment : 0,
    totalInterest, totalExtras, totalPaid, totalCost, upfrontFee,
    interestOverPrincipalPct: principal > 0 ? (totalInterest / principal) * 100 : 0,
    // Quanto o bem custa a mais do que o preço à vista, considerando tudo.
    surchargePct: assetValue > 0 ? ((totalCost - assetValue) / assetValue) * 100 : null,
    cetMonthlyPct: cetMonthly == null ? null : cetMonthly * 100,
    cetAnnualPct: cetAnnual,
  };
}

/* ==============================================================================
 * 2B. DAR ENTRADA OU FINANCIAR TUDO E AMORTIZAR DEPOIS
 * ============================================================================== */

// Contrato com uma amortização extraordinária. A parcela regular é calculada
// mês a mês porque, depois do aporte, o usuário pode escolher reduzir o prazo
// ou recalcular as parcelas restantes. A amortização entra direto no principal:
// juros futuros nunca incidem sobre o valor que já saiu do saldo devedor.
function simLoanWithPrepayment(params) {
  const p = params || {};
  const principal = Math.max(0, roundMoney(p.principal));
  const months = clamp(Math.round(Number(p.months) || 1), 1, 480);
  const system = p.system === "sac" ? "sac" : "price";
  const annualRatePct = Math.max(0, Number(p.annualRatePct) || 0);
  const monthlyRate = annualToMonthly(annualRatePct);
  const monthlyFee = Math.max(0, roundMoney(p.monthlyFee));
  const monthlyInsurance = Math.max(0, roundMoney(p.monthlyInsurance));
  const monthlyExtras = addMoney(monthlyFee, monthlyInsurance);
  const prepaymentMonth = clamp(Math.round(Number(p.prepaymentMonth) || 1), 1, months);
  const plannedPrepayment = Math.max(0, roundMoney(p.prepaymentAmount));
  const prepaymentMode = p.prepaymentMode === "payment" ? "payment" : "term";

  if (principal <= 0) {
    return {
      principal: 0, months, system, annualRatePct, monthlyRate, prepaymentMonth,
      prepaymentMode, plannedPrepayment, prepaymentApplied: 0,
      balanceBeforePrepayment: 0, balanceAfterPrepayment: 0,
      schedule: [], firstPayment: 0, paymentAfterPrepayment: 0, lastPayment: 0,
      payoffMonth: 0, totalInterest: 0, totalExtras: 0,
      totalRegularPaid: 0, totalToLender: 0, cetAnnualPct: null,
    };
  }

  const pricePaymentFor = (balance, count) => {
    if (!(balance > 0) || !(count > 0)) return 0;
    if (monthlyRate <= 0) return roundMoney(balance / count);
    const factor = Math.pow(1 + monthlyRate, count);
    return roundMoney(balance * (monthlyRate * factor) / (factor - 1));
  };

  let balance = principal;
  let priceBase = pricePaymentFor(principal, months);
  let sacAmortization = roundMoney(principal / months);
  let prepaymentApplied = 0;
  let balanceBeforePrepayment = null;
  let balanceAfterPrepayment = null;
  let interestCents = 0;
  let extrasCents = 0;
  let regularPaidCents = 0;
  const schedule = [];

  for (let month = 1; month <= months && balance > 0.005; month++) {
    const interest = roundMoney(balance * monthlyRate);
    let amortization = system === "sac"
      ? sacAmortization
      : Math.max(0, subMoney(priceBase, interest));
    if (month === months) amortization = balance;
    amortization = Math.min(balance, roundMoney(amortization));
    const payment = addMoney(addMoney(amortization, interest), monthlyExtras);

    balance = Math.max(0, subMoney(balance, amortization));
    interestCents += moneyToCents(interest);
    extrasCents += moneyToCents(monthlyExtras);
    regularPaidCents += moneyToCents(payment);

    const row = {
      month, payment, interest, amortization, extras: monthlyExtras,
      prepayment: 0, balance,
    };

    if (month === prepaymentMonth && plannedPrepayment > 0 && balance > 0) {
      balanceBeforePrepayment = balance;
      prepaymentApplied = Math.min(balance, plannedPrepayment);
      balance = Math.max(0, subMoney(balance, prepaymentApplied));
      balanceAfterPrepayment = balance;
      row.prepayment = prepaymentApplied;
      row.balance = balance;

      if (prepaymentMode === "payment" && balance > 0) {
        const remaining = months - month;
        priceBase = pricePaymentFor(balance, remaining);
        sacAmortization = remaining > 0 ? roundMoney(balance / remaining) : balance;
      }
    }

    schedule.push(row);
  }

  if (balanceBeforePrepayment == null) balanceBeforePrepayment = 0;
  if (balanceAfterPrepayment == null) balanceAfterPrepayment = balanceBeforePrepayment;

  const totalRegularPaid = moneyFromCents(regularPaidCents);
  const totalToLender = addMoney(totalRegularPaid, prepaymentApplied);
  const irrPayments = schedule.map((row) => addMoney(row.payment, row.prepayment));
  const cetMonthly = p.calculateCet === false ? null : solveIrr(principal, irrPayments);

  return {
    principal, months, system, annualRatePct, monthlyRate,
    prepaymentMonth, prepaymentMode, plannedPrepayment, prepaymentApplied,
    balanceBeforePrepayment, balanceAfterPrepayment,
    schedule,
    firstPayment: schedule[0] ? schedule[0].payment : 0,
    paymentAfterPrepayment: (schedule.find((row) => row.month > prepaymentMonth) || {}).payment || 0,
    lastPayment: schedule.length ? schedule[schedule.length - 1].payment : 0,
    payoffMonth: schedule.length,
    totalInterest: moneyFromCents(interestCents),
    totalExtras: moneyFromCents(extrasCents),
    totalRegularPaid,
    totalToLender,
    cetAnnualPct: cetMonthly == null ? null : monthlyToAnnual(cetMonthly),
  };
}

function simDownPaymentVsPrepayment(params) {
  const p = params || {};
  const assetValue = Math.max(0, roundMoney(p.assetValue));
  const cashAvailable = Math.max(0, roundMoney(p.cashAvailable));
  const reserve = clamp(roundMoney(p.reserveToKeep), 0, cashAvailable);
  const usableCash = Math.min(assetValue, Math.max(0, subMoney(cashAvailable, reserve)));
  const months = clamp(Math.round(Number(p.months) || 1), 1, 480);
  const prepaymentMonth = clamp(Math.round(Number(p.prepaymentMonth) || 1), 1, months);
  const system = p.system === "sac" ? "sac" : "price";
  const prepaymentMode = p.prepaymentMode === "payment" ? "payment" : "term";
  const entryAnnualRatePct = Math.max(0, Number(p.entryAnnualRatePct) || 0);
  const fullAnnualRatePct = Math.max(0, Number(p.fullAnnualRatePct) || 0);
  const investmentAnnualPct = Math.max(0, Number(p.investmentAnnualPct) || 0);
  const monthlyFee = Math.max(0, roundMoney(p.monthlyFee));
  const monthlyInsurance = Math.max(0, roundMoney(p.monthlyInsurance));

  const entryPrincipal = Math.max(0, subMoney(assetValue, usableCash));
  const entryOfferLoan = simLoanWithPrepayment({
    principal: entryPrincipal,
    months, annualRatePct: entryAnnualRatePct, system,
    monthlyFee, monthlyInsurance, prepaymentAmount: 0, calculateCet: false,
  });
  const fullReferenceLoan = simLoanWithPrepayment({
    principal: assetValue,
    months, annualRatePct: fullAnnualRatePct, system,
    monthlyFee, monthlyInsurance, prepaymentAmount: 0, calculateCet: false,
  });

  // Para decidir pelo menor custo, os dois caminhos precisam usar o mesmo
  // esforço mensal. Caso contrário, financiar tudo pode parecer melhor apenas
  // porque cobra uma parcela maior. Com a entrada, encurtamos o prazo até a
  // primeira parcela ficar o mais perto possível da prestação integral.
  function termForTargetPayment(principal, annualPct, targetPayment) {
    if (!(principal > 0)) return 0;
    const extras = addMoney(monthlyFee, monthlyInsurance);
    const targetBase = Math.max(0, subMoney(targetPayment, extras));
    const rate = annualToMonthly(annualPct);
    let term = months;
    if (system === "sac") {
      const room = targetBase - principal * rate;
      if (room > 0) term = Math.ceil(principal / room);
    } else if (rate <= 0) {
      if (targetBase > 0) term = Math.ceil(principal / targetBase);
    } else if (targetBase > principal * rate) {
      term = Math.ceil(-Math.log(1 - principal * rate / targetBase) / Math.log(1 + rate));
    }
    return clamp(term, 1, months);
  }

  let comparableEntryMonths = usableCash > 0
    ? termForTargetPayment(entryPrincipal, entryAnnualRatePct, fullReferenceLoan.firstPayment)
    : months;
  let entryLoan = simLoanWithPrepayment({
    principal: entryPrincipal,
    months: comparableEntryMonths || 1,
    annualRatePct: entryAnnualRatePct, system,
    monthlyFee, monthlyInsurance, prepaymentAmount: 0, calculateCet: false,
  });
  while (comparableEntryMonths < months && moneyCompare(entryLoan.firstPayment, fullReferenceLoan.firstPayment) > 0) {
    comparableEntryMonths += 1;
    entryLoan = simLoanWithPrepayment({
      principal: entryPrincipal, months: comparableEntryMonths,
      annualRatePct: entryAnnualRatePct, system,
      monthlyFee, monthlyInsurance, prepaymentAmount: 0, calculateCet: false,
    });
  }

  function presentValueOfSchedule(schedule, ratePct) {
    const discount = annualToMonthly(Math.max(0, Number(ratePct) || 0));
    return roundMoney((schedule || []).reduce((sum, row) => {
      const cashFlow = addMoney(row.payment, row.prepayment || 0);
      return sum + cashFlow / Math.pow(1 + discount, row.month);
    }, 0));
  }

  function entryEconomicCostAt(ratePct) {
    return addMoney(usableCash, presentValueOfSchedule(entryLoan.schedule, ratePct));
  }

  function laterScenarioAt(ratePct) {
    const investmentMonthly = annualToMonthly(Math.max(0, Number(ratePct) || 0));
    const fundAtPrepayment = roundMoney(usableCash * Math.pow(1 + investmentMonthly, prepaymentMonth));
    const loan = simLoanWithPrepayment({
      principal: assetValue,
      months, annualRatePct: fullAnnualRatePct, system,
      monthlyFee, monthlyInsurance,
      prepaymentMonth, prepaymentAmount: fundAtPrepayment, prepaymentMode,
      calculateCet: false,
    });
    const fundLeft = Math.max(0, subMoney(fundAtPrepayment, loan.prepaymentApplied));
    // Comparamos os fluxos em valor presente. Isso impede que um contrato pareça
    // melhor só porque força parcelas maiores e termina antes. A taxa de desconto
    // é o rendimento líquido que o dinheiro poderia obter fora da dívida.
    const economicCost = presentValueOfSchedule(loan.schedule, ratePct);
    return { loan, fundAtPrepayment, fundLeft, economicCost };
  }

  const entryEconomicCost = entryEconomicCostAt(investmentAnnualPct);
  const laterBase = laterScenarioAt(investmentAnnualPct);
  const investmentGain = Math.max(0, subMoney(laterBase.fundAtPrepayment, usableCash));
  const costDifference = subMoney(laterBase.economicCost, entryEconomicCost);
  const differenceCents = moneyToCents(costDifference);
  const winner = Math.abs(differenceCents) <= 1 ? "tie" : (differenceCents > 0 ? "entry" : "later");

  let breakEvenAnnualPct = null;
  if (assetValue > 0 && usableCash > 0) {
    const differenceAt = (ratePct) => subMoney(
      laterScenarioAt(ratePct).economicCost,
      entryEconomicCostAt(ratePct)
    );
    if (moneyCompare(differenceAt(0), 0) <= 0) {
      breakEvenAnnualPct = 0;
    } else {
      let lo = 0;
      let hi = 200;
      if (moneyCompare(differenceAt(hi), 0) <= 0) {
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (moneyCompare(differenceAt(mid), 0) > 0) lo = mid;
          else hi = mid;
        }
        breakEvenAnnualPct = (lo + hi) / 2;
      }
    }
  }

  return {
    assetValue, cashAvailable, reserve, usableCash, months, prepaymentMonth,
    system, prepaymentMode, entryAnnualRatePct, fullAnnualRatePct,
    investmentAnnualPct, monthlyFee, monthlyInsurance,
    entry: {
      loan: entryLoan,
      offerLoan: entryOfferLoan,
      downPayment: usableCash,
      economicCost: entryEconomicCost,
      comparableMonths: comparableEntryMonths,
    },
    later: {
      loan: laterBase.loan,
      fundAtPrepayment: laterBase.fundAtPrepayment,
      investmentGain,
      fundLeft: laterBase.fundLeft,
      economicCost: laterBase.economicCost,
    },
    winner,
    savings: Math.abs(costDifference),
    costDifference,
    interestDifference: subMoney(laterBase.loan.totalInterest, entryLoan.totalInterest),
    firstPaymentDifference: subMoney(laterBase.loan.firstPayment, entryOfferLoan.firstPayment),
    breakEvenAnnualPct,
    noEntryAvailable: usableCash <= 0,
    reserveMissing: cashAvailable > 0 && reserve <= 0,
  };
}

// TIR mensal de um fluxo simples: recebe `received` em t0 e paga `payments`.

// TIR de um fluxo assinado arbitrário: `flow[k]` é o caixa do mês k+1, positivo
// quando entra dinheiro. Diferente de `solveIrr`, que assume "recebe tudo no
// mês 0 e paga depois"; num consórcio a carta entra no meio do caminho, e é
// justamente essa posição que define o custo.
function solveIrrFromFlow(flow) {
  if (!Array.isArray(flow) || flow.length === 0) return null;
  const temEntrada = flow.some((v) => v > 0);
  const temSaida = flow.some((v) => v < 0);
  if (!temEntrada || !temSaida) return null;   // sem troca de sinal não há TIR

  const npv = (rate) => flow.reduce((s, v, idx) => s + v / Math.pow(1 + rate, idx + 1), 0);
  let lo = -0.9;
  let hi = 3;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (fLo * fMid <= 0) { hi = mid; fHi = fMid; }
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

function solveIrr(received, payments) {
  if (!(received > 0) || !payments || payments.length === 0) return null;
  const npv = (rate) => payments.reduce((s, pmtValue, idx) => s + pmtValue / Math.pow(1 + rate, idx + 1), 0) - received;
  let lo = 0, hi = 3;
  if (npv(lo) < 0) return 0;              // fluxo sem juros (ou com desconto)
  if (npv(hi) > 0) return null;           // fora do intervalo pesquisável
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ==============================================================================
 * 3. CARTÃO DE CRÉDITO; rotativo, parcelamento e a alternativa mais barata
 * ============================================================================== */
//
// REGRAS APLICADAS (ver docs/FONTES-FINANCEIRAS.md)
//
//   * Resolução CMN 4.549/2017: o saldo não pago da fatura só pode ficar no
//     rotativo até o vencimento da fatura SEGUINTE. Passado esse ciclo, a
//     instituição é obrigada a oferecer parcelamento. Simular 12 ou 24 meses de
//     rotativo, como o simulador fazia, mostra um cenário que não existe: ele
//     inflava o "quanto você perderia" e, junto, a economia anunciada pela
//     alternativa.
//   * Lei 14.690/2023: os encargos totais do rotativo MAIS os do parcelamento
//     da fatura não podem ultrapassar 100% do valor original da dívida. O teto
//     vale para a soma das duas fases, não para cada uma isolada.
//
// Invariante do módulo: a soma das parcelas é EXATAMENTE o total pago. O código
// anterior truncava o total no teto legal e deixava as parcelas com o valor
// antigo, então parcela × n não batia com o total exibido logo abaixo.

// Premissa para a taxa do parcelamento de fatura quando o usuário não informa a
// dele. O valor anterior era "a taxa do rotativo menos 7 pontos", uma conta sem
// origem: em cartões com rotativo baixo ela chegava a zero, e o simulador
// passava a prometer parcelamento sem juros.
//
// Fonte: BCB, Estatísticas de crédito, taxas médias de "cartão de crédito
// parcelado" para pessoas físicas. Ver docs/FONTES-FINANCEIRAS.md; o usuário
// pode sobrescrever informando a taxa do próprio contrato.
const CARD_INSTALLMENT_DEFAULT_PCT = 8.5;

// Tabela Price em centavos, com o resíduo de arredondamento na ÚLTIMA parcela.
// É assim que a soma fecha com o total ao centavo.
function priceSchedule(principalCents, monthlyRate, n) {
  if (principalCents <= 0 || n <= 0) return { installments: [], totalCents: 0, interestCents: 0 };
  const base = monthlyRate > 0
    ? principalCents * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
    : principalCents / n;
  const parcelaCents = Math.round(base);
  const installments = new Array(n).fill(parcelaCents);
  // A última parcela absorve a diferença: em Price com arredondamento por
  // centavo, n × parcela quase nunca é o total exato.
  const totalCents = parcelaCents * n;
  return {
    installments,
    parcelaCents,
    totalCents,
    interestCents: totalCents - principalCents,
  };
}

// Reescala um cronograma para um total exato (usado quando o teto legal corta
// os encargos). Mantém as parcelas iguais e joga o resíduo na última.
function rescaleSchedule(totalCents, n) {
  if (n <= 0) return { installments: [], parcelaCents: 0, totalCents: 0 };
  const parcelaCents = Math.floor(totalCents / n);
  const installments = new Array(n).fill(parcelaCents);
  installments[n - 1] = totalCents - parcelaCents * (n - 1);
  return { installments, parcelaCents, totalCents };
}

function simCreditCard(params) {
  const p = params || {};
  const debt = Math.max(0, roundMoney(p.debt));
  const debtCents = moneyToCents(debt);
  const monthlyPct = Math.max(0, Number(p.monthlyRatePct) || 0);
  const i = monthlyPct / 100;
  const payPct = clamp(Number(p.minPaymentPct) || 15, 0, 100);
  // Teto legal: os encargos somados das duas fases não passam de 100% da dívida.
  const capChargesCents = debtCents;

  // ---- FASE 1: rotativo, UM ciclo de fatura (Resolução CMN 4.549/2017) ----
  const rotativoInterestCents = Math.min(Math.round(debtCents * i), capChargesCents);
  const minPaymentCents = Math.min(debtCents + rotativoInterestCents, Math.round(debtCents * (payPct / 100)));
  const saldoAposCicloCents = debtCents + rotativoInterestCents - minPaymentCents;

  const rotativo = {
    // Um ciclo. O campo continua existindo para a tela, mas agora com o valor
    // que a regra permite.
    months: 1,
    cycleInterest: moneyFromCents(rotativoInterestCents),
    minPayment: moneyFromCents(minPaymentCents),
    finalBalance: moneyFromCents(saldoAposCicloCents),
    totalPaid: moneyFromCents(minPaymentCents),
    totalCharges: moneyFromCents(rotativoInterestCents),
    clearedAt: saldoAposCicloCents <= 0 ? 1 : null,
    cappedByLaw: rotativoInterestCents >= capChargesCents,
    limitedToOneCycle: true,
    series: [{
      month: 1,
      balance: moneyFromCents(saldoAposCicloCents),
      payment: moneyFromCents(minPaymentCents),
      interest: moneyFromCents(rotativoInterestCents),
    }],
  };

  // ---- FASE 2: parcelamento OBRIGATÓRIO do saldo remanescente ----
  // Taxa do parcelamento de fatura. Sem valor informado, usa a premissa
  // documentada em docs/FONTES-FINANCEIRAS.md; ela é sempre devolvida no
  // resultado para que a tela possa dizer de onde veio.
  const parcelRateInformed = Number(p.installmentRatePct);
  const parcelPct = Number.isFinite(parcelRateInformed) && parcelRateInformed >= 0
    ? parcelRateInformed
    : CARD_INSTALLMENT_DEFAULT_PCT;
  const pi = parcelPct / 100;
  const nParcels = clamp(Math.round(Number(p.installments) || 12), 1, 48);

  const cronograma = priceSchedule(saldoAposCicloCents, pi, nParcels);
  // O teto olha para a SOMA das fases: o que o rotativo já cobrou entra na conta.
  const encargosDisponiveisCents = Math.max(0, capChargesCents - rotativoInterestCents);
  const encargosParceladoCents = Math.min(cronograma.interestCents, encargosDisponiveisCents);
  const totalParceladoCents = saldoAposCicloCents + encargosParceladoCents;
  const limitado = cronograma.interestCents > encargosDisponiveisCents;
  const final = limitado ? rescaleSchedule(totalParceladoCents, nParcels) : cronograma;

  const parcelamento = {
    installments: nParcels,
    monthlyRatePct: parcelPct,
    rateSource: Number.isFinite(parcelRateInformed) && parcelRateInformed >= 0 ? "informada" : "premissa",
    financedAmount: moneyFromCents(saldoAposCicloCents),
    payment: moneyFromCents(final.parcelaCents),
    // Última parcela pode diferir em centavos: é ela que fecha a soma.
    lastPayment: moneyFromCents(final.installments.length ? final.installments[final.installments.length - 1] : 0),
    schedule: final.installments.map((cents, idx) => ({ n: idx + 1, payment: moneyFromCents(cents) })),
    totalPaid: moneyFromCents(final.totalCents),
    totalCharges: moneyFromCents(final.totalCents - saldoAposCicloCents),
    cappedByLaw: limitado,
  };

  // ---- Alternativa: trocar a dívida por um crédito mais barato ----
  const altAnnual = Math.max(0, Number(p.alternativeAnnualPct) || 0);
  const altMonthly = annualToMonthly(altAnnual);
  const altCronograma = priceSchedule(debtCents, altMonthly, nParcels);
  const alternativa = {
    annualRatePct: altAnnual, installments: nParcels,
    payment: moneyFromCents(altCronograma.parcelaCents),
    schedule: altCronograma.installments.map((cents, idx) => ({ n: idx + 1, payment: moneyFromCents(cents) })),
    totalPaid: moneyFromCents(altCronograma.totalCents),
    totalCharges: moneyFromCents(altCronograma.interestCents),
  };

  // O caminho "rotativo" é rotativo por um ciclo MAIS o parcelamento que a
  // regra obriga em seguida. Comparar o parcelamento com um rotativo eterno
  // seria comparar com algo que a instituição não pode oferecer.
  const caminhoCartaoCents = minPaymentCents + final.totalCents;
  const ranking = [
    { id: "cartao", label: "Ficar no cartão (1 ciclo + parcelamento)", total: moneyFromCents(caminhoCartaoCents) },
    { id: "alternativa", label: "Trocar por crédito mais barato", total: alternativa.totalPaid },
  ].sort((a, b) => a.total - b.total);

  return {
    debt, monthlyRatePct: monthlyPct,
    annualEquivalentPct: monthlyToAnnual(i),
    rotativo, parcelamento, alternativa,
    // Custo total do caminho do cartão, já com as duas fases somadas.
    cartaoTotalPaid: moneyFromCents(caminhoCartaoCents),
    cartaoTotalCharges: moneyFromCents(rotativoInterestCents + (final.totalCents - saldoAposCicloCents)),
    ranking,
    best: ranking[0],
    savingVsCartao: subMoney(moneyFromCents(caminhoCartaoCents), ranking[0].total),
    // Compatibilidade com telas que ainda leem o nome antigo.
    savingVsRotativo: subMoney(moneyFromCents(caminhoCartaoCents), ranking[0].total),
    legal: {
      rotativoCycles: 1,
      rotativoRule: "Resolução CMN 4.549/2017",
      chargeCapPct: 100,
      chargeCapRule: "Lei 14.690/2023",
      chargeCapReached: rotativo.cappedByLaw || parcelamento.cappedByLaw,
    },
  };
}

/* ==============================================================================
 * 4. CONSÓRCIO; e a comparação honesta com o financiamento
 * ============================================================================== */
//
// Consórcio não tem juros, tem taxa de administração; que é cobrada sobre o
// crédito inteiro e diluída nas parcelas. O custo aparece quando se compara o
// total pago com o valor da carta, e quando se lembra que a carta só chega na
// contemplação (por isso o campo "mês estimado da contemplação").
// O QUE ESTAVA ERRADO AQUI
//
//   1. O "custo efetivo" descontava a carta por `1.008^(mês-1)`, isto é, 0,8% ao
//      mês, um número sem origem nenhuma. Ele não vem de índice, de contrato nem
//      de norma; alguém escolheu. E como ele entrava no denominador da TIR, o
//      CET exibido dependia de um palpite.
//   2. O fluxo da TIR estava errado por construção: a carta era tratada como se
//      chegasse no mês 0, quando ela chega na CONTEMPLAÇÃO. Com contemplação no
//      mês 30, isso muda tudo.
//   3. Não havia reajuste. A carta de consórcio é corrigida periodicamente e as
//      parcelas são recalculadas sobre o valor novo. Sem isso, o total pago
//      exibido era menor do que o real em qualquer prazo longo.
//
// Agora o fluxo é montado mês a mês, com a carta entrando como ENTRADA no mês da
// contemplação, e o custo efetivo é a TIR desse fluxo. Sem contemplação
// informada, não existe um custo efetivo único: por isso o resultado devolve
// CENÁRIOS (primeira, meio e última), em vez de fingir um número só.
function consortiumSchedule(input) {
  const {
    credit, months, adminPct, reservePct, insuranceMonthlyPct,
    annualAdjustmentPct, lancePct, contemplationMonth, lanceMode,
  } = input;

  // O contrato é definido em PERCENTUAL do crédito: a cada mês o consorciado
  // quita uma fatia do total (crédito + taxa de administração + fundo de
  // reserva), recalculada sobre o valor ATUALIZADO da carta.
  const totalFraction = 1 + adminPct / 100 + reservePct / 100;
  const monthlyFraction = totalFraction / months;

  let creditNow = credit;
  let fractionPaid = 0;
  let remainingMonths = months;
  const rows = [];
  let totalPaidCents = 0;
  let insuranceCents = 0;
  let adminCents = 0;
  let reserveCents = 0;
  let lanceCents = 0;
  let creditReceived = 0;

  for (let m = 1; m <= months && fractionPaid < totalFraction - 1e-9; m++) {
    // Reajuste no aniversário do contrato: a carta sobe e as parcelas seguintes
    // sobem junto, porque elas são um percentual dela.
    if (m > 1 && (m - 1) % 12 === 0) creditNow = roundMoney(creditNow * (1 + annualAdjustmentPct / 100));

    const fractionThisMonth = Math.min(monthlyFraction, totalFraction - fractionPaid);
    // Quando o lance encurta o PRAZO, a parcela continua a mesma e o contrato
    // acaba antes; quando encurta a PARCELA, o percentual restante é diluído
    // nos meses que sobraram.
    const parcelaFraction = lanceMode === "parcela" && remainingMonths > 0
      ? Math.min((totalFraction - fractionPaid) / remainingMonths, totalFraction - fractionPaid)
      : fractionThisMonth;

    const parcelaBase = roundMoney(creditNow * parcelaFraction);
    const seguro = roundMoney(creditNow * (insuranceMonthlyPct / 100));
    const parcela = addMoney(parcelaBase, seguro);

    // Rateio informativo entre carta, administração e fundo.
    adminCents += Math.round(moneyToCents(parcelaBase) * (adminPct / 100) / totalFraction);
    reserveCents += Math.round(moneyToCents(parcelaBase) * (reservePct / 100) / totalFraction);
    insuranceCents += moneyToCents(seguro);
    totalPaidCents += moneyToCents(parcela);
    fractionPaid += parcelaFraction;
    remainingMonths = Math.max(0, remainingMonths - 1);

    let lanceMes = 0;
    let recebido = 0;
    if (m === contemplationMonth) {
      creditReceived = creditNow;
      recebido = creditNow;
      // O lance é pago com recursos próprios e abate percentual do contrato.
      const lanceFraction = Math.min(lancePct / 100, totalFraction - fractionPaid);
      lanceMes = roundMoney(creditNow * lanceFraction);
      lanceCents += moneyToCents(lanceMes);
      totalPaidCents += moneyToCents(lanceMes);
      fractionPaid += lanceFraction;
      if (lanceMode !== "parcela") {
        // Lance no prazo: some o número de meses equivalentes ao percentual pago.
        remainingMonths = Math.max(0, Math.round((totalFraction - fractionPaid) / monthlyFraction));
      }
    }

    rows.push({
      month: m, credit: creditNow, payment: parcela, base: parcelaBase,
      insurance: seguro, lance: lanceMes, received: recebido,
      fractionPaid: Math.min(1, fractionPaid / totalFraction),
    });
    if (m === contemplationMonth && lanceMode !== "parcela" && remainingMonths === 0) break;
  }

  return {
    rows,
    months: rows.length,
    totalPaid: moneyFromCents(totalPaidCents),
    insuranceTotal: moneyFromCents(insuranceCents),
    adminTotal: moneyFromCents(adminCents),
    reserveTotal: moneyFromCents(reserveCents),
    lanceTotal: moneyFromCents(lanceCents),
    creditReceived: roundMoney(creditReceived),
    finalCredit: roundMoney(creditNow),
  };
}

function simConsortium(params) {
  const p = params || {};
  const credit = Math.max(0, roundMoney(p.credit));
  const months = clamp(Math.round(Number(p.months) || 60), 1, 240);
  const adminPct = Math.max(0, Number(p.adminPct) || 0);
  const reservePct = Math.max(0, Number(p.reserveFundPct) || 0);
  const insuranceMonthlyPct = Math.max(0, Number(p.insuranceMonthlyPct) || 0);
  // Reajuste anual da carta. Sem valor informado é ZERO, e o resultado diz
  // isso: inventar um índice seria repetir o erro do 0,8%.
  const annualAdjustmentInformed = Number(p.annualAdjustmentPct);
  const annualAdjustmentPct = Number.isFinite(annualAdjustmentInformed) && annualAdjustmentInformed >= 0
    ? annualAdjustmentInformed : 0;
  const lancePct = clamp(Number(p.lancePct) || 0, 0, 90);
  const lanceMode = p.lanceMode === "parcela" ? "parcela" : "prazo";

  const base = { credit, months, adminPct, reservePct, insuranceMonthlyPct, annualAdjustmentPct, lancePct, lanceMode };

  // Custo efetivo do fluxo REAL: parcelas saem todo mês, a carta entra no mês da
  // contemplação, o lance sai junto com ela.
  function cenario(contemplationMonth, label) {
    const mes = clamp(Math.round(contemplationMonth), 1, months);
    const s = consortiumSchedule({ ...base, contemplationMonth: mes });
    // Fluxo do ponto de vista de quem compara com um financiamento: positivo é
    // dinheiro que entra na mão.
    const flow = s.rows.map((r) => roundMoney(r.received - r.payment - r.lance));
    const irr = solveIrrFromFlow(flow);
    return {
      label, contemplationMonth: mes,
      months: s.months,
      totalPaid: s.totalPaid,
      creditReceived: s.creditReceived,
      totalCost: subMoney(s.totalPaid, s.creditReceived),
      costPct: s.creditReceived > 0 ? (subMoney(s.totalPaid, s.creditReceived) / s.creditReceived) * 100 : 0,
      firstPayment: s.rows.length ? s.rows[0].payment : 0,
      lastPayment: s.rows.length ? s.rows[s.rows.length - 1].payment : 0,
      insuranceTotal: s.insuranceTotal,
      adminTotal: s.adminTotal,
      reserveTotal: s.reserveTotal,
      lanceTotal: s.lanceTotal,
      effectiveMonthlyPct: irr == null ? null : irr * 100,
      effectiveAnnualPct: irr == null ? null : monthlyToAnnual(irr),
      rows: s.rows,
    };
  }

  const informado = Number(p.contemplationMonth);
  const cenarios = {
    primeira: cenario(1, "Contemplado logo no início"),
    meio: cenario(Math.round(months / 2), "Contemplado na metade do prazo"),
    ultima: cenario(months, "Contemplado só no fim"),
  };
  const escolhido = Number.isFinite(informado) && informado >= 1
    ? cenario(informado, "Cenário informado")
    : cenarios.meio;

  const totalContract = roundMoney(credit * (1 + adminPct / 100 + reservePct / 100));

  return {
    credit, months, adminPct, reservePct, lancePct, lanceMode, annualAdjustmentPct,
    insuranceMonthlyPct,
    totalContract,
    contemplationMonth: escolhido.contemplationMonth,
    // Compatibilidade com as telas: os campos do cenário escolhido continuam
    // acessíveis na raiz.
    payment: escolhido.firstPayment,
    basePayment: escolhido.rows.length ? escolhido.rows[0].base : 0,
    insuranceMonthly: escolhido.rows.length ? escolhido.rows[0].insurance : 0,
    lance: escolhido.lanceTotal,
    totalPaid: escolhido.totalPaid,
    totalCost: escolhido.totalCost,
    costPct: escolhido.costPct,
    monthsAfterLance: escolhido.months,
    effectiveMonthlyPct: escolhido.effectiveMonthlyPct,
    effectiveAnnualPct: escolhido.effectiveAnnualPct,
    scenario: escolhido,
    scenarios: cenarios,
    // O custo efetivo depende de QUANDO a contemplação acontece, e ninguém
    // sabe isso de antemão. A tela precisa dizer a faixa, não um número.
    effectiveRange: {
      bestMonthlyPct: cenarios.primeira.effectiveMonthlyPct,
      worstMonthlyPct: cenarios.ultima.effectiveMonthlyPct,
    },
    assumptions: {
      annualAdjustmentPct,
      adjustmentInformed: Number.isFinite(annualAdjustmentInformed) && annualAdjustmentInformed >= 0,
      contemplationInformed: Number.isFinite(informado) && informado >= 1,
      note: "Consórcio não tem juros; tem taxa de administração, fundo de reserva, seguro e reajuste da carta. A data da contemplação não é garantida.",
    },
  };
}

/* ==============================================================================
 * 5. FGTS; manter no fundo ou sacar todo ano e investir
 * ============================================================================== */
//
// A remuneração preserva TR + 3% a.a. e a distribuição de resultados. Desde a
// decisão de 2024, o total do exercício deve alcançar ao menos o IPCA; como a
// distribuição futura é desconhecida, o motor usa o maior valor entre a
// estimativa informada e esse piso anual.
function simFgts(params) {
  const p = params || {};
  const balance = Math.max(0, roundMoney(p.balance));
  const salary = Math.max(0, roundMoney(p.monthlySalary));
  const years = clamp(Math.round(Number(p.years) || 5), 1, 40);
  const months = years * 12;
  const rates = p.rates || {};
  const ipca = Math.max(0, Number(rates.ipca) || 0);
  const statutoryBaseAnnual = 3 + Math.max(0, Number(rates.tr) || 0);
  const requestedFgtsAnnual = Math.max(0, Number.isFinite(Number(p.fgtsAnnualPct))
    ? Number(p.fgtsAnnualPct) : Math.max(statutoryBaseAnnual, ipca));
  const fgtsAnnual = Math.max(requestedFgtsAnnual, ipca);
  const altAnnual = Math.max(0, Number(p.alternativeAnnualPct) != null && Number.isFinite(Number(p.alternativeAnnualPct))
    ? Number(p.alternativeAnnualPct) : (Number(rates.cdi) || 0) * 0.9);

  const deposit = roundMoney(salary * 0.08);   // 8% do salário, depositado pelo empregador
  const fgtsMonthly = annualToMonthly(fgtsAnnual);
  const altMonthly = annualToMonthly(altAnnual);

  // Cenário A: não mexer. Tudo fica no fundo.

  let keep = balance;
  const keepSeries = [{ month: 0, value: keep }];
  for (let m = 1; m <= months; m++) {
    keep = addMoney(mulMoney(keep, 1 + fgtsMonthly), deposit);
    keepSeries.push({ month: m, value: keep });
  }

  // Cenário B: saque-aniversário todo ano, e o valor sacado vai para um
  // investimento. O saldo restante continua recebendo a remuneração estimada.
  let fund = balance;
  let invested = 0;
  let withdrawnTotal = 0;
  const annivSeries = [{ month: 0, value: addMoney(fund, invested) }];
  for (let m = 1; m <= months; m++) {
    fund = addMoney(mulMoney(fund, 1 + fgtsMonthly), deposit);
    invested = mulMoney(invested, 1 + altMonthly);
    if (m % 12 === 0) {
      const w = fgtsAnniversaryWithdrawal(fund);
      fund = subMoney(fund, w);
      invested = addMoney(invested, w);
      withdrawnTotal = addMoney(withdrawnTotal, w);
    }
    annivSeries.push({ month: m, value: addMoney(fund, invested) });
  }

  const keepFinal = roundMoney(keep);
  const annivFinal = roundMoney(addMoney(fund, invested));
  const inflationFactor = Math.pow(1 + ipca / 100, years);

  return {
    years, months, deposit,
    fgtsAnnualPct: fgtsAnnual,
    requestedFgtsAnnualPct: requestedFgtsAnnual,
    statutoryBaseAnnualPct: statutoryBaseAnnual,
    inflationFloorAnnualPct: ipca,
    floorApplied: fgtsAnnual > requestedFgtsAnnual,
    alternativeAnnualPct: altAnnual,
    keep: { final: keepFinal, series: keepSeries, realFinal: roundMoney(keepFinal / inflationFactor) },
    anniversary: {
      final: annivFinal, series: annivSeries, withdrawn: withdrawnTotal,
      fundLeft: roundMoney(fund), invested: roundMoney(invested),
      realFinal: roundMoney(annivFinal / inflationFactor),
    },
    difference: subMoney(annivFinal, keepFinal),
    anniversaryWins: annivFinal > keepFinal,
    // O custo que nenhuma calculadora de banco mostra: aderindo ao
    // saque-aniversário, numa demissão sem justa causa você recebe a multa de
    // 40% mas não o saldo integral. O restante segue as hipóteses legais de saque.
    lockedOnDismissal: roundMoney(fund),
    fineOnDismissal: roundMoney(keepFinal * 0.4),
    losesToInflation: fgtsAnnual < ipca,
  };
}

/* ==============================================================================
 * 6. APOSENTADORIA; acumulação e, principalmente, a fase de saque
 * ============================================================================== */
//
// Tudo em valores de HOJE: a taxa usada é a taxa REAL (nominal descontada a
// inflação). Assim "R$ 8.000 por mês" na projeção significa o poder de compra de
// R$ 8.000 de hoje, e não um número inflacionado sem sentido prático.
function simRetirement(params) {
  const p = params || {};
  const currentAge = clamp(Math.round(Number(p.currentAge) || 30), 16, 90);
  const retireAge = clamp(Math.round(Number(p.retireAge) || 60), currentAge + 1, 100);
  const lifeExpectancy = clamp(Math.round(Number(p.lifeExpectancy) || 90), retireAge + 1, 110);
  const currentSaved = Math.max(0, roundMoney(p.currentSaved));
  const monthly = Math.max(0, roundMoney(p.monthlyContribution));
  const desiredIncome = Math.max(0, roundMoney(p.desiredIncome));
  const rates = p.rates || {};
  const nominalAnnual = Number(p.annualRatePct);
  const nominal = Number.isFinite(nominalAnnual) ? nominalAnnual : (Number(rates.cdi) || 10);
  const ipca = Number(rates.ipca) || 0;
  const realAnnual = ((1 + nominal / 100) / (1 + ipca / 100) - 1) * 100;
  const r = annualToMonthly(realAnnual);

  const accumMonths = (retireAge - currentAge) * 12;
  const drawMonths = (lifeExpectancy - retireAge) * 12;

  // Acumulação
  let balance = currentSaved;
  const series = [];
  for (let m = 1; m <= accumMonths; m++) {
    balance = addMoney(mulMoney(balance, 1 + r), monthly);
    if (m % 12 === 0) series.push({ age: currentAge + m / 12, value: balance });
  }
  const atRetirement = roundMoney(balance);
  const contributed = addMoney(currentSaved, mulMoney(monthly, accumMonths));

  // Renda sustentável: consumindo o principal até a expectativa de vida.

  // TAXA REAL NEGATIVA
  //
  // Quando a inflação supera o rendimento, `r < 0`. As fórmulas de anuidade
  // continuam válidas nesse caso (basta r > -1); o que NÃO vale é o atalho
  // "divide pelo número de meses", que só é correto quando r é exatamente zero.
  // O código anterior caía nesse atalho para qualquer r <= 0 e, com isso:
  //
  //   * dizia que a renda sustentável era saldo ÷ meses, quando com poder de
  //     compra caindo ela é MENOR do que isso;
  //   * calculava um aporte necessário MENOR do que o real, exatamente no
  //     cenário em que é preciso poupar mais.
  const anuidade = (taxa, n) => taxa / (1 - Math.pow(1 + taxa, -n));
  const incomeDepleting = r !== 0
    ? roundMoney(atRetirement * anuidade(r, drawMonths))
    : roundMoney(atRetirement / drawMonths);

  // Renda perpétua: só os juros reais, o principal fica de pé. Com taxa real
  // zero ou negativa ela NÃO EXISTE, e devolver um número negativo (ou zero)
  // seria pior do que dizer que não existe.
  const incomePerpetual = r > 0 ? roundMoney(atRetirement * r) : null;

  // Capital necessário para a renda desejada, nas duas lógicas.
  const capitalDepleting = desiredIncome > 0
    ? (r !== 0
      ? roundMoney(desiredIncome / anuidade(r, drawMonths))
      : roundMoney(desiredIncome * drawMonths))
    : 0;
  // Idem: sem juro real positivo não há capital que sustente renda para sempre.
  const capitalPerpetual = desiredIncome > 0 && r > 0 ? roundMoney(desiredIncome / r) : null;

  // Aporte mensal necessário para chegar ao capital que sustenta a renda pedida.
  const fvFactor = Math.pow(1 + r, accumMonths);
  const neededFromContributions = Math.max(0, subMoney(capitalDepleting, roundMoney(currentSaved * fvFactor)));
  const requiredMonthly = accumMonths > 0
    ? (r !== 0
      ? roundMoney(neededFromContributions * r / (fvFactor - 1))
      : roundMoney(neededFromContributions / accumMonths))
    : 0;

  const gapIncome = subMoney(desiredIncome, incomeDepleting);

  return {
    currentAge, retireAge, lifeExpectancy,
    accumMonths, drawMonths,
    nominalAnnualPct: nominal, realAnnualPct: realAnnual, monthlyRealRate: r,
    series,
    atRetirement, contributed,
    interestEarned: subMoney(atRetirement, contributed),
    incomeDepleting, incomePerpetual,
    desiredIncome, capitalDepleting, capitalPerpetual,
    requiredMonthly, monthlyContribution: monthly,
    contributionGap: Math.max(0, subMoney(requiredMonthly, monthly)),
    onTrack: desiredIncome <= 0 ? null : incomeDepleting >= desiredIncome,
    gapIncome,
    realRateNegative: realAnnual < 0,
    realRateZeroOrNegative: realAnnual <= 0,
    // A tela precisa poder explicar POR QUE não há renda perpétua, em vez de
    // mostrar um campo vazio.
    perpetualAvailable: r > 0,
    perpetualUnavailableReason: r > 0 ? null
      : "Sem juro real positivo (rendimento acima da inflação), nenhum capital sustenta renda indefinidamente: o principal encolhe em poder de compra a cada ano.",
  };
}

/* Exportação para o harness de teste em Node (ignorada no navegador). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    irAliquotFor, iofPctFor, fgtsAnniversaryWithdrawal,
    annualToMonthly, monthlyToAnnual, compoundRates, effectiveAnnualRate,
    simFixedIncome, simLoan, simLoanWithPrepayment, simDownPaymentVsPrepayment,
    simCreditCard, simConsortium, simFgts, simRetirement,
    solveIrr, solveRateForContributions,
  };
}
