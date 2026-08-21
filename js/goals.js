// goals.js. METAS FINANCEIRAS (motor puro, sem DOM, sem rede)  [Módulo 4]
// ------------------------------------------------------------------------------
// Responsabilidade única: transformar o snapshot em um modelo de leitura da tela
// Metas. Nenhuma função aqui toca no DOM, no estado da UI ou no armazenamento.
//
// A pergunta que este arquivo responde não é "quanto já guardei?" (isso o app já
// mostrava), e sim **"eu vou chegar lá?"**. Para responder, três números que os
// apps costumam confundir são mantidos SEPARADOS:
//
//   • aporte NECESSÁRIO; quanto falta ÷ meses até o prazo. Sai da matemática.
//   • aporte PLANEJADO ; quanto o usuário disse que vai guardar (goal.monthlyPlan).
//   • ritmo REAL       ; média dos aportes líquidos efetivamente lançados.
//
// A estimativa de conclusão usa o ritmo REAL quando ele existe (é o único dos
// três que é fato); só cai para o planejado quando ainda não há histórico. Um app
// que projeta pelo plano diz ao usuário o que ele quer ouvir; um que projeta pelo
// histórico diz o que vai acontecer.
//
// Convenção herdada do resto do app (metrics.js):
//   aporte  = despesa em "investimento" COM goalId
//   resgate = receita em "investimento" COM goalId
"use strict";

const GOAL_PACE_MONTHS = 6;      // janela do ritmo real
const GOAL_ETA_MAX_MONTHS = 600; // 50 anos; acima disso a estimativa é ruído

// Modelos prontos de meta. Só sugestão de nome/ícone/prazo; nada é criado
// sozinho, e o usuário edita tudo antes de salvar.
const GOAL_TEMPLATES = [
  { id: "reserva",  name: "Reserva de emergência", icon: "shieldCheck", months: 12, hint: "O primeiro objetivo de todo mundo: meses de despesa guardados." },
  { id: "viagem",   name: "Viagem",                icon: "plane",      months: 12, hint: "Passagem, hospedagem e o dinheiro de lá." },
  { id: "carro",    name: "Comprar um carro",      icon: "transport",  months: 24, hint: "Entrada ou o valor à vista, sem depender de financiamento." },
  { id: "casa",     name: "Comprar um imóvel",     icon: "home",       months: 60, hint: "Entrada, ITBI e escritura; some tudo no valor alvo." },
  { id: "notebook", name: "Notebook",              icon: "phone",      months: 6,  hint: "Trocar equipamento sem parcelar no cartão." },
  { id: "estudos",  name: "Estudos",               icon: "education",  months: 12, hint: "Curso, faculdade, certificação." },
];

function goalTemplateById(id) {
  return GOAL_TEMPLATES.find((t) => t.id === id) || null;
}

// Data ISO daqui a N meses, usada para pré-preencher o prazo de um modelo.

function goalTemplateDeadline(template, fromIso) {
  if (!template || !template.months) return "";
  return addMonthsToIso(fromIso || todayIso(), template.months);
}

// Alvo sugerido do modelo. Hoje só a reserva de emergência tem uma conta a
// fazer, e essa conta é a razão de o modelo existir: o app já sabe a despesa
// média e já exibe "N meses de despesa" na tela inicial, mas o modelo abria o
// formulário com o VALOR ALVO em branco e devolvia ao usuário justamente a
// única pergunta que ele não tem como responder sozinho.
//
// Cuidado com o número: sai de emergencyFund, mas do par monthlyNeed x
// targetMonths, nunca do campo `target` do modelo, que já vem contaminado pelo
// alvo de uma reserva existente e faria o formulário copiar a meta antiga em
// vez de sugerir uma. Sem histórico de despesa a conta dá zero e o campo fica
// vazio de propósito: alvo inventado é pior que alvo em branco.
function goalTemplateTarget(template, data) {
  if (!template || template.id !== "reserva") return 0;
  const fund = emergencyFund(data);
  return mulMoney(fund.monthlyNeed, fund.targetMonths);
}

// Cria a meta e aplica a origem escolhida para o valor inicial. A função é pura
// para que as duas opções possam ser verificadas sem depender da interface.
function createGoalWithInitialBalance(data, draft, initialSource, accountId) {
  const source = initialSource === "existing" ? "existing" : "cash";
  const amount = Math.max(0, roundMoney(draft.savedUpfront));
  const goalId = draft.id || uid();
  const createdAt = draft.createdAt || todayIso();
  const goal = {
    id: goalId,
    name: String(draft.name || "Meta").trim() || "Meta",
    target: Math.max(0, roundMoney(draft.target)),
    current: amount,
    savedUpfront: source === "cash" ? amount : 0,
    existingBalance: source === "existing" ? amount : 0,
    deadline: draft.deadline || "",
    icon: draft.icon || "piggy",
    createdAt,
    monthlyPlan: Math.max(0, roundMoney(draft.monthlyPlan)),
  };
  const seed = amount > 0 && source === "cash" ? makeTransaction({
    id: `goal-upfront:${goalId}`,
    type: "expense",
    amount,
    categoryId: "investimento",
    date: createdAt,
    payment: "Outro",
    description: `Valor inicial da meta: ${goal.name}`,
    goalId,
    source: "goal-upfront",
    accountId: accountId || null,
  }) : null;
  return {
    ...data,
    goals: [...(data.goals || []), goal],
    transactions: seed ? [...(data.transactions || []), seed] : (data.transactions || []),
  };
}

function goalWithdrawalPlan(goal, amount) {
  const value = Math.min(Math.max(0, roundMoney(amount)), Math.max(0, roundMoney(goal && goal.current)));
  const existing = goalExistingBalance(goal);
  // A parcela que nunca saiu do saldo é liberada primeiro. Isso mantém a parte
  // realmente financiada por lançamentos alinhada ao histórico da meta.
  const existingRelease = Math.min(value, existing);
  const cashReturn = subMoney(value, existingRelease);
  return {
    value,
    cashReturn,
    existingRelease,
    current: subMoney(goal.current, value),
    existingBalance: Math.max(0, subMoney(existing, existingRelease)),
  };
}

/* ==============================================================================
 * HISTÓRICO DE APORTES
 * ==============================================================================
 * Uma única varredura dos lançamentos monta o histórico de TODAS as metas.
 * Fazer isso por meta seria O(metas × lançamentos); o mesmo erro que o Módulo 3
 * corrigiu na série patrimonial.
 */

// goalId → Map(monthKey → líquido em centavos). Aporte soma, resgate subtrai.

function goalMonthlyLedger(data) {
  const byGoal = new Map();
  (data.transactions || []).forEach((t) => {
    if (!t.goalId) return;
    const key = t.monthKey || monthKeyOf(t.date);
    let months = byGoal.get(t.goalId);
    if (!months) { months = new Map(); byGoal.set(t.goalId, months); }
    const delta = t.type === "expense" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
    months.set(key, (months.get(key) || 0) + delta);
  });
  return byGoal;
}

// Série dos últimos N meses: quanto foi aportado no mês e o acumulado ao fim dele.
// O acumulado termina exatamente em `goal.current`; a barra do gráfico e o
// número do topo do cartão são o mesmo número.
function goalSeries(goal, months, refDate, monthsBack) {
  const span = monthsBack || GOAL_PACE_MONTHS;
  const ref = refDate instanceof Date ? refDate : new Date();
  const keys = [];
  for (let i = span - 1; i >= 0; i--) keys.push(keyOfDate(addMonths(ref, -i)));

  // Acumulado no fim de cada mês, andando de trás para frente a partir de hoje.

  const contributions = keys.map((k) => moneyFromCents((months && months.get(k)) || 0));
  const out = [];
  let running = roundMoney(goal.current);
  for (let i = keys.length - 1; i >= 0; i--) {
    out.unshift({
      monthKey: keys[i],
      label: MONTH_ABBR[Number(keys[i].slice(5, 7)) - 1],
      contributed: contributions[i],
      balance: Math.max(0, running),
    });
    running = subMoney(running, contributions[i]);
  }
  return out;
}

// Ritmo real: média mensal dos aportes líquidos, ignorando os meses ANTERIORES ao
// primeiro aporte. Sem esse recorte, quem começou a guardar mês passado teria o
// ritmo dividido por 6 e uma previsão de conclusão absurdamente pessimista.
function goalPace(series) {
  let firstActive = -1;
  for (let i = 0; i < series.length; i++) {
    if (moneyToCents(series[i].contributed) !== 0) { firstActive = i; break; }
  }
  if (firstActive < 0) return { value: 0, months: 0, active: false };
  const window = series.slice(firstActive);
  const total = sumMoney(window, (s) => s.contributed);
  return { value: divMoney(total, window.length), months: window.length, active: true };
}

/* ==============================================================================
 * MODELO DE UMA META
 * ============================================================================== */

const GOAL_STATUS = {
  done:    { label: "Concluída",     tone: "positive", icon: "checkCircle" },
  ontrack: { label: "No ritmo",      tone: "positive", icon: "trendUp" },
  risk:    { label: "Ritmo baixo",   tone: "warn",     icon: "alertTriangle" },
  late:    { label: "Prazo estourado", tone: "danger", icon: "alertTriangle" },
  idle:    { label: "Parada",        tone: "warn",     icon: "clock" },
  open:    { label: "Sem prazo",     tone: "neutral",  icon: "target" },
};

function buildGoalModel(data, goal, ctx) {
  const ledger = (ctx && ctx.ledger) || goalMonthlyLedger(data);
  const ref = (ctx && ctx.refDate) || new Date();
  const today = (ctx && ctx.today) || todayIso();
  const months = ledger.get(goal.id) || new Map();

  const target = roundMoney(goal.target);
  const saved = roundMoney(goal.current);
  const remaining = Math.max(0, subMoney(target, saved));
  const pct = clamp(safePct(saved, target), 0, 100);
  const done = target > 0 && moneyCompare(saved, target) >= 0;

  const series = goalSeries(goal, months, ref);
  const pace = goalPace(series);
  const planned = Math.max(0, roundMoney(goal.monthlyPlan));
  const currentMonthKey = keyOfDate(ref);
  const contributedThisMonth = moneyFromCents(months.get(currentMonthKey) || 0);

  const daysLeft = goal.deadline ? daysBetweenIso(today, goal.deadline) : null;
  const monthsLeft = daysLeft != null && daysLeft > 0 ? Math.max(1, Math.ceil(daysLeft / 30.44)) : null;
  const required = monthsLeft && remaining > 0 ? divMoney(remaining, monthsLeft) : null;

  // Ritmo de referência para a projeção: o REAL manda; o planejado só entra
  // quando ainda não existe histórico nenhum.
  const projectionRate = pace.active && pace.value > 0 ? pace.value : planned;
  const projectionSource = pace.active && pace.value > 0 ? "real" : (planned > 0 ? "plano" : null);

  let etaMonths = null;
  let etaIso = null;
  if (!done && remaining > 0 && projectionRate > 0) {
    const n = Math.ceil(moneyToCents(remaining) / moneyToCents(projectionRate));
    if (n > 0 && n <= GOAL_ETA_MAX_MONTHS) {
      etaMonths = n;
      etaIso = addMonthsToIso(today, n);
    }
  }

  let status = "open";
  if (done) status = "done";
  else if (daysLeft != null && daysLeft < 0) status = "late";
  else if (required != null) {
    if (projectionRate <= 0) status = "idle";
    else status = moneyCompare(projectionRate, required) >= 0 ? "ontrack" : "risk";
  } else if (projectionRate > 0) status = "ontrack";
  else if (pace.active) status = "idle";

  // Diferença entre o que a meta pede e o que está acontecendo. Positivo = falta.

  const gap = required != null && projectionRate >= 0 ? Math.max(0, subMoney(required, projectionRate)) : 0;

  return {
    id: goal.id,
    goal,
    target, saved, remaining, pct, done,
    deadline: goal.deadline || null,
    daysLeft, monthsLeft,
    requiredMonthly: required,
    plannedMonthly: planned,
    paceMonthly: pace.active ? pace.value : 0,
    paceActive: pace.active,
    paceWindow: pace.months,
    projectionRate, projectionSource,
    etaMonths, etaIso,
    etaLate: !!(etaIso && goal.deadline && etaIso > goal.deadline),
    gap,
    contributedThisMonth,
    series,
    status,
    statusLabel: GOAL_STATUS[status].label,
    tone: GOAL_STATUS[status].tone,
    statusIcon: GOAL_STATUS[status].icon,
  };
}

/* ==============================================================================
 * CAPACIDADE DE APORTE
 * ==============================================================================
 * De nada adianta somar planos de R$ 2.000/mês para quem sobra R$ 600. A
 * capacidade sai da MÉDIA DE SOBRA REALIZADA (receita − despesa) dos meses que
 * tiveram movimento; meses vazios são descartados para não diluir a média de
 * quem instalou o app há três semanas.
 */
function savingCapacity(data) {
  const summary = last6MonthsSummary(data);
  const active = summary.filter((m) => moneyToCents(m.income) !== 0 || moneyToCents(m.expense) !== 0);
  if (active.length === 0) {
    const income = roundMoney(data.monthlyIncome || 0);
    return { value: income > 0 ? mulMoney(income, 0.2) : 0, months: 0, basis: income > 0 ? "renda" : "vazio" };
  }
  const total = active.reduce((acc, m) => acc + (moneyToCents(m.income) - moneyToCents(m.expense)), 0);
  return { value: moneyFromCents(Math.round(total / active.length)), months: active.length, basis: "historico" };
}

/* ==============================================================================
 * MODELO DA TELA
 * ============================================================================== */

function buildGoalsModel(data, refDate) {
  const ref = refDate instanceof Date ? refDate : new Date();
  const today = todayIso();
  const ledger = goalMonthlyLedger(data);
  const ctx = { ledger, refDate: ref, today };

  const models = (data.goals || []).map((g) => buildGoalModel(data, g, ctx));

  // Ordem de consultor: o que exige ação primeiro, o que já foi conquistado por
  // último. Dentro do mesmo grupo, prazo mais próximo na frente.
  const rank = { late: 0, risk: 1, idle: 2, ontrack: 3, open: 4, done: 5 };
  const sorted = models.slice().sort((a, b) => {
    const d = rank[a.status] - rank[b.status];
    if (d !== 0) return d;
    if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
    if (a.daysLeft != null) return -1;
    if (b.daysLeft != null) return 1;
    return b.pct - a.pct;
  });

  const saved = sumMoney(models, (m) => m.saved);
  const target = sumMoney(models, (m) => m.target);
  const pending = models.filter((m) => !m.done);

  const plannedTotal = sumMoney(pending, (m) => m.plannedMonthly);
  const requiredTotal = sumMoney(pending, (m) => m.requiredMonthly || 0);
  const paceTotal = sumMoney(pending, (m) => m.paceMonthly);
  const capacity = savingCapacity(data);
  const commitment = plannedTotal > 0 ? plannedTotal : requiredTotal;
  const feasible = capacity.value <= 0 ? null : moneyCompare(capacity.value, commitment) >= 0;

  return {
    refDate: ref,
    monthKey: keyOfDate(ref),
    goals: sorted,
    counts: {
      total: models.length,
      done: models.filter((m) => m.done).length,
      late: models.filter((m) => m.status === "late").length,
      risk: models.filter((m) => m.status === "risk" || m.status === "idle").length,
    },
    totals: {
      saved, target,
      remaining: Math.max(0, subMoney(target, saved)),
      pct: clamp(safePct(saved, target), 0, 100),
      contributedThisMonth: sumMoney(models, (m) => m.contributedThisMonth),
    },
    plan: {
      plannedTotal, requiredTotal, paceTotal, commitment,
      capacity: capacity.value,
      capacityBasis: capacity.basis,
      capacityMonths: capacity.months,
      feasible,
      gap: feasible === false ? subMoney(commitment, capacity.value) : 0,
    },
    advice: goalsAdvice(sorted, { plannedTotal, requiredTotal, commitment, capacity, feasible }),
  };
}

// Recomendações. Cada frase é ancorada em um número real; no máximo 3, porque
// uma lista de sete prioridades não é uma lista de prioridades.
function goalsAdvice(models, plan) {
  const out = [];

  if (plan.feasible === false && plan.commitment > 0) {
    out.push({
      tone: "warn", icon: "alertTriangle",
      text: `Seus objetivos pedem ${fmtBRL(plan.commitment)} por mês, mas sua sobra média é ${fmtBRL(plan.capacity.value)}. Faltam ${fmtBRL(subMoney(plan.commitment, plan.capacity.value))}; vale esticar um prazo ou pausar a meta menos urgente.`,
    });
  }

  const late = models.find((m) => m.status === "late");
  if (late) {
    out.push({
      tone: "danger", icon: "clock",
      text: `“${late.goal.name}” passou do prazo com ${fmtBRL(late.remaining)} em aberto. Redefina a data ou o valor alvo para o número voltar a significar alguma coisa.`,
    });
  }

  const risk = models.find((m) => m.status === "risk" && m.requiredMonthly != null);
  if (risk) {
    out.push({
      tone: "warn", icon: "trendUp",
      text: `“${risk.goal.name}” precisa de ${fmtBRL(risk.requiredMonthly)}/mês e você está guardando ${fmtBRL(risk.projectionRate)}. No ritmo atual a conclusão sai ${risk.etaIso ? `só em ${fmtDateFull(risk.etaIso)}` : "muito além do prazo"}.`,
    });
  }

  const idle = models.find((m) => m.status === "idle");
  if (idle && out.length < 3) {
    out.push({
      tone: "neutral", icon: "piggy",
      text: `“${idle.goal.name}” está parada. Um aporte pequeno e constante vale mais do que um grande e único; defina um aporte mensal para acompanhar o ritmo.`,
    });
  }

  const ontrack = models.find((m) => m.status === "ontrack" && m.etaIso);
  if (ontrack && out.length < 3) {
    out.push({
      tone: "positive", icon: "checkCircle",
      text: `Mantendo ${fmtBRL(ontrack.projectionRate)}/mês, “${ontrack.goal.name}” fecha em ${fmtDateFull(ontrack.etaIso)}.`,
    });
  }

  const done = models.filter((m) => m.done).length;
  if (done > 0 && out.length < 3) {
    out.push({
      tone: "positive", icon: "star",
      text: `${done} ${done === 1 ? "meta concluída" : "metas concluídas"}. Que tal transformar o aporte que sobrou no próximo objetivo?`,
    });
  }

  return out.slice(0, 3);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildGoalsModel, buildGoalModel, goalMonthlyLedger, goalSeries, goalPace, savingCapacity, GOAL_TEMPLATES };
}
