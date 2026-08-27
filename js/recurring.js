// recurring.js. [M7] Motor de assinaturas e gastos recorrentes.
//
// Arquivo PURO: recebe o snapshot, devolve um modelo de leitura. Nada de DOM,
// nada de `state`, nada de gravação. Mesmo contrato de score.js, health.js,
// goals.js e achievements.js.
//
// Por que este motor existe se `detectSubscriptions` (import.js) já existia
// -------------------------------------------------------------------------
// O detector antigo respondia uma pergunta binária. "esse gasto apareceu em
// dois meses diferentes?"; e isso produzia três erros que mudam a decisão do
// usuário:
//
//   1. Cadência ignorada. Um seguro anual de R$ 1.200 e uma mensalidade de
//      R$ 1.200 entravam iguais no "total previsto por mês". O primeiro é
//      R$ 100/mês; o segundo é R$ 1.200/mês. Somar os dois é inventar dívida.
//   2. Assinatura cancelada nunca saía da conta. Quem cancelou a Netflix em
//      março continuava vendo R$ 55,90 no total de dezembro.
//   3. Nada distinguia "valor fixo" (Spotify) de "valor que varia" (mercado
//      semanal). São duas coisas diferentes: uma se cancela, a outra se
//      negocia.
//
// A regra deste motor: a recorrência é definida pelo INTERVALO ENTRE AS
// COBRANÇAS, não por "apareceu em dois meses". A mediana dos intervalos
// classifica a cadência; a regularidade dos intervalos diz se dá para confiar;
// a variação do valor separa assinatura de gasto recorrente variável.
//
// Dependências (ordem dos <script> importa): utils.js, storage.js, import.js
// (reaproveita `normalizeDesc`, para que as duas telas agrupem igual).
"use strict";

// Janelas de cadência em dias. A largura de cada faixa não é arbitrária: é o
// erro real de calendário (mês de 28 a 31 dias, cobrança que cai em fim de
// semana e é lançada na segunda, fatura que antecipa um dia).
const REC_CADENCES = [
  { id: "semanal",    label: "Semanal",     min: 5,   max: 9,   days: 7,   perYear: 52 },
  { id: "quinzenal",  label: "Quinzenal",   min: 12,  max: 18,  days: 15,  perYear: 24 },
  { id: "mensal",     label: "Mensal",      min: 25,  max: 38,  days: 30,  perYear: 12 },
  { id: "bimestral",  label: "Bimestral",   min: 50,  max: 72,  days: 61,  perYear: 6 },
  { id: "trimestral", label: "Trimestral",  min: 78,  max: 104, days: 91,  perYear: 4 },
  { id: "semestral",  label: "Semestral",   min: 160, max: 205, days: 182, perYear: 2 },
  { id: "anual",      label: "Anual",       min: 330, max: 400, days: 365, perYear: 1 },
];

function recCadenceOf(days) {
  return REC_CADENCES.find((c) => days >= c.min && days <= c.max) || null;
}
function recCadenceById(id) {
  return REC_CADENCES.find((c) => c.id === id) || null;
}

// Variação de valor aceita para o gasto ainda ser chamado de "assinatura".
// Acima disso ele é recorrente, mas de valor variável (conta de luz, mercado).
const REC_FIXED_TOLERANCE = 0.12;
// Fração mínima de intervalos dentro da janela da cadência para confiarmos.
const REC_MIN_REGULARITY = 0.6;
// Aumento de preço que vale um aviso (abaixo disso é arredondamento/centavos).
const REC_INCREASE_PCT = 3;
// Quantas cadências de atraso até considerarmos que a cobrança parou.
const REC_LATE_FACTOR = 1.45;
const REC_ENDED_FACTOR = 2.6;

function recMedian(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Valor mais frequente da lista (empate resolvido pelo maior; o dia mais
// recente do mês tende a ser o vencimento real quando houve antecipação).
function recMode(list) {
  const counts = new Map();
  list.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let best = list[0], bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && value > best)) { best = value; bestCount = count; }
  });
  return { value: best, count: bestCount };
}

// Chave de agrupamento: descrição normalizada + categoria. Sem a categoria,
// "Uber" (transporte) e "Uber Eats" reduzidos ao mesmo radical virariam um
// grupo só; com ela, o mesmo estabelecimento em categorias diferentes é
// tratado como dois compromissos diferentes; que é o que o usuário enxerga.
function recGroupKey(t) {
  const desc = typeof normalizeDesc === "function"
    ? normalizeDesc(t.description)
    : String(t.description || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return `${desc || "_"}|${t.categoryId}`;
}

// ------------------------------------------------------------------------------
// Preferências do usuário (v10)
// ------------------------------------------------------------------------------
// `ignored`  . "cancelar acompanhamento" (§8). Some das listas e dos totais,
//               mas os lançamentos continuam intactos: acompanhar é uma decisão
//               de tela, não um apagamento de histórico.
// `dismissed`; proposta de cadastro recusada. Não volta a perguntar.
// `confirmed`; proposta aceita; guardada só para a tela poder dizer "cadastrado
//               em", já que o efeito real (recurring = true) vive nos lançamentos.
function recPrefsOf(data) {
  const p = (data && data.recurringPrefs) || {};
  return {
    ignored: p.ignored && typeof p.ignored === "object" ? p.ignored : {},
    dismissed: p.dismissed && typeof p.dismissed === "object" ? p.dismissed : {},
    confirmed: p.confirmed && typeof p.confirmed === "object" ? p.confirmed : {},
  };
}

// ------------------------------------------------------------------------------
// Núcleo: um grupo de lançamentos → um compromisso recorrente (ou nada)
// ------------------------------------------------------------------------------
// UM LANÇAMENTO MARCADO COMO FIXO JÁ É UMA DECLARAÇÃO.
//
// O motor inteiro abaixo INFERE recorrência a partir de repetição: precisa de
// dois lançamentos para medir intervalo, cadência e regularidade. Isso deixava
// de fora o caso em que não há nada para inferir porque o usuário já disse:
// marcar "Gasto fixo mensal (recorrente)" no formulário não produzia nada em
// Assinaturas até o gasto se repetir sozinho no mês seguinte. O Início já
// contava esse valor em "Gastos fixos", então as duas telas discordavam sobre
// o mesmo lançamento.
//
// Aqui a cadência não é medida, é lida do que foi declarado: mensal, no dia do
// próprio lançamento. Assim que a segunda ocorrência aparecer, o caminho normal
// assume e passa a valer a evidência em vez da declaração.
function recDeclaredCommitment(data, tx, todayKey) {
  const cadence = recCadenceById("mensal");
  const cat = categoryById(data, tx.categoryId);
  const amount = roundMoney(tx.amount);
  const day = Number(String(tx.date).slice(8, 10)) || 1;
  const today = todayIso();
  let next = tx.date;
  let guard = 0;
  while (next <= today && guard++ < 400) next = recSameDayNextMonths(next, 1, day);

  return {
    key: recGroupKey(tx),
    name: tx.description || cat.name,
    categoryId: tx.categoryId,
    categoryName: cat.name,
    categoryColor: cat.color,
    categoryIcon: cat.icon,
    kind: "assinatura",
    cadenceId: cadence.id,
    cadenceLabel: cadence.label,
    cadenceDays: cadence.days,
    perYear: cadence.perYear,
    occurrences: 1,
    firstDate: tx.date,
    lastDate: tx.date,
    lastAmount: amount,
    prevAmount: amount,
    firstAmount: amount,
    medianAmount: amount,
    monthlyEquivalent: amount,
    annualCost: mulMoney(amount, cadence.perYear),
    increasePct: 0,
    sinceFirstPct: 0,
    increaseAnnualImpact: 0,
    amountSpread: 0,
    dayOfMonth: day,
    dayConsistency: 1,
    regularity: 1,
    nextDate: next,
    daysToNext: daysBetweenIso(today, next),
    daysSinceLast: daysBetweenIso(tx.date, today),
    status: "ativa",
    // O que sustenta este compromisso é a marcação, não o histórico. Quem lê
    // precisa poder dizer isso na tela em vez de prometer uma média que não
    // existe.
    flaggedRecurring: true,
    declaredOnly: true,
    payment: tx.payment || "Outro",
    monthKeys: [monthKeyOf(tx.date)],
    isCurrentMonth: monthKeyOf(tx.date) === todayKey,
  };
}

function recAnalyzeGroup(data, list, todayKey) {
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (sorted.length === 1 && sorted[0].recurring) return recDeclaredCommitment(data, sorted[0], todayKey);
  if (sorted.length < 2) return null;

  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = daysBetweenIso(sorted[i - 1].date, sorted[i].date);
    if (d > 0) intervals.push(d);
  }
  if (!intervals.length) return null;

  const medianInterval = recMedian(intervals);
  const cadence = recCadenceOf(medianInterval);
  if (!cadence) return null;

  // Regularidade: com apenas dois lançamentos não existe "regularidade" para
  // medir; o único intervalo já caiu na janela, então ele vale 1. A partir do
  // terceiro, exigimos que a maioria dos intervalos concorde entre si.
  const inWindow = intervals.filter((d) => d >= cadence.min && d <= cadence.max).length;
  const regularity = inWindow / intervals.length;
  if (intervals.length >= 2 && regularity < REC_MIN_REGULARITY) return null;

  const amounts = sorted.map((t) => moneyToCents(t.amount));
  const medianAmount = recMedian(amounts) || 1;
  const spread = (Math.max(...amounts) - Math.min(...amounts)) / medianAmount;

  // Assinatura x gasto recorrente variável. A distinção NÃO pode ser só a
  // amplitude: um reajuste de 25% na Netflix estouraria a tolerância e jogaria
  // uma assinatura óbvia na lista de "valor variável"; exatamente no mês em
  // que o usuário mais precisa vê-la como assinatura.
  //
  // O que separa os dois é a FORMA da variação: assinatura anda em DEGRAUS
  // (poucos preços distintos, cada um repetido por meses), conta de luz anda
  // em rampa (quase todo mês um valor diferente).
  const distinct = new Set(amounts).size;
  const distinctRatio = distinct / amounts.length;
  const isFixed = spread <= REC_FIXED_TOLERANCE
    || (amounts.length >= 3 && distinct <= 2)
    || distinctRatio <= 0.5;

  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const first = sorted[0];

  const days = sorted.map((t) => Number(String(t.date).slice(8, 10)) || 1);
  const dayMode = recMode(days);
  const dayConsistency = days.filter((d) => Math.abs(d - dayMode.value) <= 2).length / days.length;

  // Próxima cobrança. Para cadências que o calendário conhece (mensal e
  // múltiplos), avançamos por MÊS mantendo o dia; somar 30 dias faria a data
  // andar para trás ao longo do ano. Para as demais, soma de dias mesmo.
  const monthStep = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }[cadence.id] || 0;
  let next = last.date;
  const today = todayIso();
  let guard = 0;
  while (next <= today && guard++ < 400) {
    next = monthStep
      ? recSameDayNextMonths(next, monthStep, dayMode.value)
      : isoOfDate(new Date(dateFromIso(next).getTime() + cadence.days * 86400000));
  }

  const daysLate = daysBetweenIso(last.date, today);
  const status = daysLate > cadence.days * REC_ENDED_FACTOR ? "encerrada"
    : daysLate > cadence.days * REC_LATE_FACTOR ? "atrasada"
    : "ativa";

  const cat = categoryById(data, last.categoryId);
  const lastAmount = roundMoney(last.amount);
  const increasePct = safePct(subMoney(last.amount, prev.amount), prev.amount);
  const sinceFirstPct = safePct(subMoney(last.amount, first.amount), first.amount);

  // Equivalente mensal; o número que torna os compromissos comparáveis entre
  // si. Sem ele, o seguro anual domina a lista e a mensalidade some.
  const monthlyEquivalent = mulMoney(lastAmount, cadence.perYear / 12);
  const annualCost = mulMoney(lastAmount, cadence.perYear);

  return {
    key: recGroupKey(last),
    name: last.description || cat.name,
    categoryId: last.categoryId,
    categoryName: cat.name,
    categoryColor: cat.color,
    categoryIcon: cat.icon,
    kind: isFixed ? "assinatura" : "recorrente",
    cadenceId: cadence.id,
    cadenceLabel: cadence.label,
    cadenceDays: cadence.days,
    perYear: cadence.perYear,
    occurrences: sorted.length,
    firstDate: first.date,
    lastDate: last.date,
    lastAmount,
    prevAmount: roundMoney(prev.amount),
    firstAmount: roundMoney(first.amount),
    medianAmount: moneyFromCents(Math.round(medianAmount)),
    monthlyEquivalent,
    annualCost,
    increasePct,
    sinceFirstPct,
    // Quanto o último reajuste custa ao longo de um ano inteiro. É esse número
    //; e não os "+R$ 4,00" da cobrança; que faz alguém reavaliar o plano.
    increaseAnnualImpact: increasePct > 0 ? mulMoney(subMoney(last.amount, prev.amount), cadence.perYear) : 0,
    amountSpread: Math.round(spread * 100) / 100,
    dayOfMonth: dayMode.value,
    dayConsistency: Math.round(dayConsistency * 100) / 100,
    regularity: Math.round(regularity * 100) / 100,
    nextDate: next,
    daysToNext: daysBetweenIso(today, next),
    daysSinceLast: daysLate,
    status,
    flaggedRecurring: sorted.some((t) => t.recurring),
    payment: last.payment || "Outro",
    monthKeys: Array.from(new Set(sorted.map((t) => monthKeyOf(t.date)))),
    isCurrentMonth: monthKeyOf(last.date) === todayKey,
  };
}

// Mesmo dia do mês, N meses à frente, com o dia preso ao último do mês quando
// ele não existe (dia 31 em fevereiro vira 28/29 em vez de vazar para março).
function recSameDayNextMonths(iso, months, preferredDay) {
  const base = dateFromIso(iso);
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const wanted = preferredDay || base.getDate();
  const last = daysInMonthOf(target.getFullYear(), target.getMonth());
  return isoOfDate(new Date(target.getFullYear(), target.getMonth(), Math.min(wanted, last)));
}

// ------------------------------------------------------------------------------
// Modelo de leitura
// ------------------------------------------------------------------------------
function buildRecurringModel(data, opts) {
  const options = opts || {};
  const todayKey = options.monthKey || monthKeyOf(todayIso());
  const prefs = recPrefsOf(data);

  const groups = new Map();
  (data.transactions || []).forEach((t) => {
    if (t.type !== "expense") return;
    if (t.goalId) return;                 // aporte em meta não é assinatura
    if (t.installmentGroupId) return;     // parcela tem fim; recorrência não tem
    const key = recGroupKey(t);
    let bucket = groups.get(key);
    if (!bucket) { bucket = []; groups.set(key, bucket); }
    bucket.push(t);
  });

  const all = [];
  groups.forEach((list) => {
    let item;
    try { item = recAnalyzeGroup(data, list, todayKey); }
    catch (e) { item = null; }            // um grupo com data corrompida não derruba a tela
    if (item) all.push(item);
  });

  const ignoredKeys = prefs.ignored;
  const tracked = all.filter((s) => !ignoredKeys[s.key]);
  const ignored = all.filter((s) => ignoredKeys[s.key])
    .map((s) => ({ ...s, ignoredAt: ignoredKeys[s.key] }));

  // Compromisso encerrado sai do total: manter uma assinatura cancelada na
  // conta do mês é mentir sobre o custo fixo.
  const active = tracked.filter((s) => s.status !== "encerrada");
  const ended = tracked.filter((s) => s.status === "encerrada");

  const subscriptions = active.filter((s) => s.kind === "assinatura")
    .sort((a, b) => moneyCompare(b.monthlyEquivalent, a.monthlyEquivalent));
  const variable = active.filter((s) => s.kind === "recorrente")
    .sort((a, b) => moneyCompare(b.monthlyEquivalent, a.monthlyEquivalent));

  const monthlyTotal = sumMoney(subscriptions, (s) => s.monthlyEquivalent);
  const annualTotal = sumMoney(subscriptions, (s) => s.annualCost);
  const variableMonthly = sumMoney(variable, (s) => s.monthlyEquivalent);
  const committedMonthly = addMoney(monthlyTotal, variableMonthly);

  const increases = active
    .filter((s) => s.increasePct > REC_INCREASE_PCT)
    .sort((a, b) => moneyCompare(b.increaseAnnualImpact, a.increaseAnnualImpact));

  // Cobranças previstas para os próximos 30 dias, em ordem de data; é a
  // pergunta prática ("o que vai sair da conta?"), não o inventário.
  const upcoming = active
    .filter((s) => s.daysToNext >= 0 && s.daysToNext <= 30)
    .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const upcomingTotal = sumMoney(upcoming, (s) => s.lastAmount);

  const income = effectiveIncome(data, todayKey);
  const incomeShare = income > 0 ? safePct(committedMonthly, income) : 0;

  return {
    monthKey: todayKey,
    subscriptions,
    variable,
    ended,
    ignored,
    increases,
    upcoming,
    upcomingTotal,
    monthlyTotal,
    annualTotal,
    variableMonthly,
    committedMonthly,
    income,
    incomeShare,
    proposals: buildRecurringProposals(data, all, prefs),
    counts: {
      subscriptions: subscriptions.length,
      variable: variable.length,
      ended: ended.length,
      ignored: ignored.length,
    },
  };
}

// ------------------------------------------------------------------------------
// §9. Propostas de cadastro ("Deseja cadastrar como gasto recorrente?")
// ------------------------------------------------------------------------------
// Só propomos o que o app tem confiança de acertar, porque uma sugestão errada
// aceita por engano vira gasto fixo fantasma na previsão de saldo; o app passa
// a projetar uma saída que não existe. Quatro portões:
//
//   • ainda não está marcado como recorrente no histórico;
//   • pelo menos três cobranças (duas podem ser coincidência);
//   • o dia do mês se repete (consistência ≥ 60%);
//   • a cobrança não parou.
//
// Nada é gravado aqui. A função devolve a pergunta; quem responde é o usuário.
function buildRecurringProposals(data, all, prefs) {
  const dismissed = prefs.dismissed;
  return all
    .filter((s) => !s.flaggedRecurring)
    .filter((s) => !dismissed[s.key])
    .filter((s) => !prefs.ignored[s.key])
    .filter((s) => s.occurrences >= 3)
    .filter((s) => s.dayConsistency >= 0.6)
    .filter((s) => s.status !== "encerrada")
    .map((s) => ({
      key: s.key,
      name: s.name,
      categoryId: s.categoryId,
      categoryName: s.categoryName,
      categoryColor: s.categoryColor,
      categoryIcon: s.categoryIcon,
      cadenceId: s.cadenceId,
      cadenceLabel: s.cadenceLabel,
      dayOfMonth: s.dayOfMonth,
      occurrences: s.occurrences,
      amount: s.lastAmount,
      monthlyEquivalent: s.monthlyEquivalent,
      annualCost: s.annualCost,
      kind: s.kind,
      // Frase pronta no formato do briefing: "Todo dia 10 · Internet".
      pattern: s.cadenceId === "mensal"
        ? `Todo dia ${s.dayOfMonth}`
        : `${s.cadenceLabel}, por volta do dia ${s.dayOfMonth}`,
    }))
    .sort((a, b) => moneyCompare(b.monthlyEquivalent, a.monthlyEquivalent))
    .slice(0, 5);
}

// ------------------------------------------------------------------------------
// Escritas (chamadas pela UI; devolvem um `data` novo, nunca mutam o recebido)
// ------------------------------------------------------------------------------
function recPrefsWith(data, bucket, key, value) {
  const prefs = recPrefsOf(data);
  const next = { ...prefs[bucket] };
  if (value === null) delete next[key];
  else next[key] = value;
  return { ...prefs, [bucket]: next };
}

/** Marca (ou desmarca) todos os lançamentos de um grupo como recorrentes. */
function applyRecurringFlag(data, key, flag) {
  const stamp = new Date().toISOString();
  let touched = 0;
  const transactions = (data.transactions || []).map((t) => {
    if (t.type !== "expense" || recGroupKey(t) !== key) return t;
    if (!!t.recurring === !!flag) return t;
    touched++;
    return { ...t, recurring: !!flag, updatedAt: stamp };
  });
  return { transactions, touched };
}
