// metrics.js. MOTOR DE MÉTRICAS DO DASHBOARD (puro, sem DOM, sem rede)
// ------------------------------------------------------------------------------
// Responsabilidade única: transformar o snapshot `data` em um MODELO DE LEITURA
// pronto para a tela inicial. Nenhuma função aqui toca no DOM, no estado da UI
// ou no armazenamento; o que permite testar tudo em Node e reaproveitar os
// mesmos números em outras telas (Saúde Financeira, IA, Relatórios).
//
// Regra do módulo: NADA é recalculado duas vezes. `buildDashboardModel()` é o
// único ponto de entrada da UI e monta o objeto inteiro em uma passada,
// reutilizando os seletores memoizados que já existem em storage.js
// (`monthTotals`, `dataIndex`, `txForMonth`).
//
// Convenções financeiras adotadas (compatíveis com o resto do app):
//   • Aporte em meta   = despesa em "investimento" COM goalId  → vira patrimônio em goals
//   • Investimento livre = despesa em "investimento" SEM goalId → vira patrimônio investido
//   • Resgate           = receita em "investimento" (reduz o respectivo bloco)
//   • Caixa             = realizedBalance() (só o que já aconteceu até hoje)
"use strict";

const INVESTMENT_CATEGORY_ID = "investimento";
const EMERGENCY_NAME_RE = /(reserva|emerg)/i;

/* ==============================================================================
 * SAUDAÇÃO
 * ============================================================================== */

// Faixas em horário local do aparelho. Devolve também o ícone para a UI não
// precisar reimplementar a mesma decisão.
function greetingFor(date) {
  const h = (date instanceof Date ? date : new Date()).getHours();
  if (h < 12) return { text: "Bom dia", icon: "sun", period: "manha" };
  if (h < 18) return { text: "Boa tarde", icon: "sun", period: "tarde" };
  return { text: "Boa noite", icon: "moon", period: "noite" };
}

// Primeiro nome, higienizado. Vazio → null (a UI decide o fallback).

function displayFirstName(data) {
  const raw = String((data && data.userName) || "").trim();
  if (!raw) return null;
  return raw.split(/\s+/)[0].slice(0, 24);
}

/* ==============================================================================
 * PATRIMÔNIO
 * ============================================================================== */

// Total investido "livre" (fora de metas).
//
// Módulo 3: se o usuário cadastrou a carteira em Patrimônio, esse número passa a
// ser a FONTE DA VERDADE e a estimativa por lançamentos é descartada; somar as
// duas contaria a mesma aplicação duas vezes. Sem cadastro, mantém-se a
// aproximação por aportes menos resgates, que é o comportamento anterior.
function investedTotal(data) {
  if (typeof hasRegisteredInvestments === "function" && hasRegisteredInvestments(data)) {
    return registeredInvestments(data);
  }
  return investedFromLedger(data);
}

function investedFromLedger(data) {
  const ids = new Set(categoryWithDescendants(data, INVESTMENT_CATEGORY_ID));
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.goalId) return;                       // pertence a uma meta, contado em goals
    if (!ids.has(t.categoryId)) return;
    if (t.date > todayIso()) return;
    if (t.accountId) {
      const account = typeof accountById === "function" ? accountById(data, t.accountId) : null;
      if (!account || t.date < account.openingDate) return;
    }
    cents += t.type === "expense" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(Math.max(0, cents));
}

// Patrimônio líquido = caixa + investimentos + guardado em metas + bens
// cadastrados − dívidas cadastradas − faturas abertas.
// `cash` pode ser negativo (saldo devedor); é somado como está, de propósito.
// `other` e `liabilities` só existem a partir do Módulo 3; sem nenhum item
// cadastrado ambos valem 0 e a fórmula é idêntica à das versões anteriores.
function netWorth(data) {
  const cash = realizedBalance(data);
  const invested = investedTotal(data);
  const goalsSaved = goalsTotalSaved(data);
  const goals = typeof goalsNetWorthSaved === "function" ? goalsNetWorthSaved(data) : goalsSaved;
  const goalsOverlap = subMoney(goalsSaved, goals);
  const hasRegistry = typeof assetsTotal === "function";
  // Bens fora de investimentos (veículo, imóvel, outros, contas não refletidas
  // nos lançamentos). Investimentos já entram por `invested`.
  const other = hasRegistry ? subMoney(assetsTotal(data), registeredInvestments(data)) : 0;
  const registeredLiabilities = hasRegistry ? liabilitiesTotal(data) : 0;
  const cardLiabilities = typeof cardLiabilitySummary === "function"
    ? cardLiabilitySummary(data, todayIso()).total
    : 0;
  const liabilities = addMoney(registeredLiabilities, cardLiabilities);
  const total = subMoney(addMoney(addMoney(addMoney(cash, invested), goals), other), liabilities);
  return { cash, invested, goals, goalsSaved, goalsOverlap, other, liabilities, registeredLiabilities, cardLiabilities, total };
}

// ------------------------------------------------------------------------------
// EVOLUÇÃO PATRIMONIAL; acumulador único
// ------------------------------------------------------------------------------
// Antes, cada ponto da série varria TODOS os lançamentos (O(meses × lançamentos)).
// Agora uma única passada agrupa os deltas por mês e o acumulado sai de uma soma
// corrida. O(lançamentos + meses).
//
// Correção de coerência (Módulo 3): o acumulado passou a incluir o dinheiro
// guardado em METAS. Antes, um aporte em meta só saía do caixa e não voltava em
// lugar nenhum, então a última barra do gráfico não fechava com o Patrimônio
// exibido no topo. Agora fecha.
function ledgerAccumulator(data) {
  const investIds = new Set(categoryWithDescendants(data, INVESTMENT_CATEGORY_ID));
  const deltas = new Map();   // monthKey → { cash, invested, goals } em centavos
  const bump = (key, field, cents) => {
    let row = deltas.get(key);
    if (!row) { row = { cash: 0, invested: 0, goals: 0 }; deltas.set(key, row); }
    row[field] += cents;
  };

  // O saldo inicial nasce no mês em que a conta entrou no acompanhamento.
  // Sem isso, a série histórica ignorava todas as contas e saltava apenas no
  // ponto de hoje.
  (data.accounts || []).forEach((account) => {
    bump(monthKeyOf(account.openingDate), "cash", moneyToCents(account.openingBalance));
  });

  (data.transactions || []).forEach((t) => {
    const key = t.monthKey || monthKeyOf(t.date);
    const cents = moneyToCents(t.amount);
    // A compra no cartão cria um passivo, mas não movimenta caixa. O caixa só
    // muda quando a fatura é paga, tratado logo depois desta varredura.
    const affectsCash = typeof transactionAffectsCash === "function"
      ? transactionAffectsCash(data, t, "9999-12-31")
      : !t.creditCardId;
    if (affectsCash) bump(key, "cash", t.type === "income" ? cents : -cents);
    if (t.goalId) {
      // Aporte em meta sai do caixa e vira patrimônio guardado; resgate faz o inverso.
      bump(key, "goals", t.type === "expense" ? cents : -cents);
    } else if (investIds.has(t.categoryId)) {
      bump(key, "invested", t.type === "expense" ? cents : -cents);
    }
  });

  (data.accountAdjustments || []).forEach((adjustment) => {
    const account = typeof accountById === "function" ? accountById(data, adjustment.accountId) : null;
    if (!account || adjustment.date < account.openingDate) return;
    bump(monthKeyOf(adjustment.date), "cash", moneyToCents(adjustment.amount));
  });

  (data.cardPayments || []).forEach((payment) => {
    const account = typeof accountById === "function" ? accountById(data, payment.accountId) : null;
    if (account && payment.date < account.openingDate) return;
    bump(monthKeyOf(payment.date), "cash", -moneyToCents(payment.amount));
  });

  const keys = [...deltas.keys()].sort();
  const running = new Map();
  let cash = 0, invested = 0, goals = 0;
  keys.forEach((k) => {
    const d = deltas.get(k);
    cash += d.cash; invested += d.invested; goals += d.goals;
    running.set(k, { cash, invested, goals });
  });

  // `savedUpfront` de metas não é lançamento: entra como base constante para que
  // a série termine exatamente no mesmo número do cartão de Patrimônio.
  const goalsNow = moneyToCents(typeof goalsNetWorthSaved === "function" ? goalsNetWorthSaved(data) : goalsTotalSaved(data));
  const goalsFromLedger = goals;
  const goalsOffset = goalsNow - goalsFromLedger;

  return {
    keys,
    // Estado acumulado até o FIM do mês pedido (carrega o último mês conhecido).
    at(monthKey) {
      let found = null;
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] <= monthKey) found = running.get(keys[i]);
        else break;
      }
      return found || { cash: 0, invested: 0, goals: 0 };
    },
    goalsOffset,
  };
}

// Patrimônio reconstruído para o FIM de um mês qualquer.

function netWorthAtMonthEnd(data, monthKey, acc) {
  const a = acc || ledgerAccumulator(data);
  const at = a.at(monthKey);
  const hasRegistry = typeof assetsNetAt === "function";
  const investedRegistered = hasRegistry && hasRegisteredInvestments(data);
  // Com carteira cadastrada em Patrimônio, a estimativa por lançamentos sai da
  // conta; somar as duas contaria a mesma aplicação duas vezes.
  const ledgerInvested = investedRegistered ? 0 : Math.max(0, at.invested);
  const registry = hasRegistry ? moneyToCents(assetsNetAt(data, monthKey)) : 0;
  const goals = Math.max(0, at.goals + a.goalsOffset);
  const [year, month] = String(monthKey).split("-").map(Number);
  const endIso = `${monthKey}-${String(daysInMonthOf(year, month - 1)).padStart(2, "0")}`;
  const cardLiabilities = typeof cardLiabilitySummary === "function"
    ? moneyToCents(cardLiabilitySummary(data, endIso).total)
    : 0;
  return moneyFromCents(at.cash + ledgerInvested + goals + registry - cardLiabilities);
}

// Série de patrimônio dos últimos N meses (mais antigo → mais recente).
// O ponto do mês corrente usa o patrimônio de HOJE (`netWorth`), não uma
// projeção de fim de mês: é o número que o usuário vê no topo da tela.
function netWorthSeries(data, months = 6) {
  const now = new Date();
  const acc = ledgerAccumulator(data);
  const currentKey = keyOfDate(now);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = addMonths(now, -i);
    const key = keyOfDate(d);
    const isCurrent = key === currentKey;
    out.push({
      key,
      label: MONTH_ABBR[d.getMonth()],
      year: d.getFullYear(),
      isCurrent,
      value: isCurrent ? netWorth(data).total : netWorthAtMonthEnd(data, key, acc),
    });
  }
  return out;
}

/* ==============================================================================
 * RESERVA DE EMERGÊNCIA
 * ============================================================================== */

// A meta usada como reserva é escolhida pelo usuário (settings.emergencyGoalId).
// Sem escolha explícita, detectamos pelo nome ("Reserva", "Emergência").
function emergencyGoalOf(data) {
  const goals = data.goals || [];
  if (data.emergencyGoalId) {
    const picked = goals.find((g) => g.id === data.emergencyGoalId);
    if (picked) return picked;
  }
  return goals.find((g) => EMERGENCY_NAME_RE.test(g.name)) || null;
}

// Gasto mensal médio dos últimos meses fechados; a base honesta para dizer
// "quantos meses a sua reserva cobre". Ignora meses sem nenhum gasto para não
// diluir a média de quem começou a usar o app agora.
function avgMonthlyExpense(data, months = 3) {
  const now = new Date();
  let cents = 0;
  let counted = 0;
  for (let i = 1; i <= months; i++) {
    const key = keyOfDate(addMonths(now, -i));
    const total = realizedMonthTotals(data, key).expense;
    if (total <= 0) continue;
    cents += moneyToCents(total);
    counted++;
  }
  if (counted === 0) {
    const current = realizedMonthTotals(data, keyOfDate(now)).expense;
    return current > 0 ? current : 0;
  }
  return moneyFromCents(Math.round(cents / counted));
}

function emergencyFund(data) {
  const goal = emergencyGoalOf(data);
  const targetMonths = Math.max(1, Number(data.emergencyMonths) || 6);
  const monthlyNeed = avgMonthlyExpense(data);
  const current = goal ? roundMoney(goal.current) : 0;
  // Alvo: o que o usuário definiu na meta; sem meta, N meses de despesa média.
  const target = goal && goal.target > 0 ? roundMoney(goal.target) : mulMoney(monthlyNeed, targetMonths);
  const pct = target > 0 ? clamp(safePct(current, target), 0, 100) : 0;
  const monthsCovered = monthlyNeed > 0 ? current / monthlyNeed : 0;

  let status = "empty";
  if (current > 0 && monthsCovered >= targetMonths) status = "ok";
  else if (monthsCovered >= targetMonths / 2) status = "partial";
  else if (current > 0) status = "low";

  return { goal, goalId: goal ? goal.id : null, current, target, pct, monthlyNeed, targetMonths, monthsCovered, status, configured: !!goal };
}

/* ==============================================================================
 * MÊS: TOTAIS, ECONOMIA E COMPARAÇÃO
 * ============================================================================== */

// Snapshot do mês + comparação com o mês anterior. No mês atual, a renda
// planejada cobre lançamentos ainda incompletos. Em meses encerrados, somente
// receitas registradas contam como renda realizada.
function monthSnapshot(data, monthKey) {
  const totals = realizedMonthTotals(data, monthKey);
  const renda = incomeBasis(data, monthKey);
  const income = effectiveIncome(data, monthKey);

  // A taxa de poupança compara REALIZADO com REALIZADO. Antes ela dividia o
  // gasto do dia 3 pela renda planejada do mês inteiro e anunciava "você
  // poupou 96%" para quem só ainda não tinha gastado.
  const savings = subMoney(renda.realized, totals.expense);
  const savingsRate = renda.realized > 0 ? safePct(savings, renda.realized) : null;

  // Projeção do fechamento, para quem quiser olhar o mês inteiro: os dois lados
  // projetados, nunca um projetado contra o outro realizado.
  const progress = monthProgress(monthKey);
  const projectedExpense = progress.isCurrent && progress.ratio > 0.15
    ? divMoney(totals.expense, progress.ratio)
    : totals.expense;
  const projectedSavings = subMoney(renda.projected, projectedExpense);
  const projectedSavingsRate = renda.projected > 0 ? safePct(projectedSavings, renda.projected) : null;

  const [y, m] = String(monthKey).split("-").map(Number);
  const prevKey = keyOfDate(addMonths(new Date(y, m - 1, 1), -1));
  const prev = realizedMonthTotals(data, prevKey);
  const prevRenda = incomeBasis(data, prevKey);
  const prevIncome = effectiveIncome(data, prevKey);

  const expenseDeltaPct = prev.expense > 0 ? ((totals.expense - prev.expense) / prev.expense) * 100 : null;
  // Comparação entre meses usa realizado dos dois lados; comparar o realizado
  // parcial deste mês com o realizado fechado do anterior daria uma queda
  // inventada todo dia 1.
  const incomeDeltaPct = (!renda.partial && prevRenda.realized > 0)
    ? ((renda.realized - prevRenda.realized) / prevRenda.realized) * 100
    : null;

  return {
    monthKey, prevKey,
    income, expense: totals.expense, fixed: totals.fixed, variable: totals.variable,
    loggedIncome: totals.income,
    // ---- Renda, com a base declarada (ver incomeBasis em storage.js) ----
    renda,
    incomePlanned: renda.planned,
    incomeRealized: renda.realized,
    incomeProjected: renda.projected,
    incomeBasisKind: renda.basis,
    // ---- Naturezas separadas (ver TRANSACTION_NATURES) ----
    aportes: totals.aportes,
    resgates: totals.resgates,
    aportesLiquidos: totals.aportesLiquidos,
    dividaPrincipal: totals.dividaPrincipal,
    dividaEncargos: totals.dividaEncargos,
    estornos: totals.estornos,
    saidaDeCaixa: totals.saidaDeCaixa,
    // `savingsRate` é null quando não há renda realizada: sem base, o certo é
    // não exibir número, e não exibir zero.
    savings, savingsRate,
    projectedSavings, projectedSavingsRate,
    // Mês parcial fica marcado para a tela poder dizer "parcial" em vez de
    // apresentar o número como fechamento.
    partial: renda.partial,
    complete: renda.complete,
    elapsedRatio: renda.elapsed,
    prevExpense: prev.expense, prevIncome, prevIncomeRealized: prevRenda.realized,
    expenseDeltaPct, incomeDeltaPct,
    projectedExpense, progress,
    txCount: totals.tx.length,
  };
}

// Ranking de categorias do mês (já com nome/cor/ícone resolvidos).

function categoryRanking(data, monthKey) {
  const cents = new Map();
  realizedTxForMonth(data, monthKey).forEach((t) => {
    // Ranking de GASTO. Aporte em meta e amortização de dívida saem daqui: eles
    // apareciam no topo da lista como se fossem os maiores gastos do mês.
    const c = consumptionCentsOf(t);
    if (!c) return;
    cents.set(t.categoryId, (cents.get(t.categoryId) || 0) + c);
  });
  return [...cents.entries()]
    .map(([id, c]) => {
      const cat = categoryById(data, id);
      return { id, value: moneyFromCents(c), name: cat.name, color: cat.color, icon: cat.icon, budget: cat.budget };
    })
    .sort((a, b) => b.value - a.value);
}

/* ==============================================================================
 * PRÓXIMAS CONTAS
 * ============================================================================== */

// Junta duas fontes reais, sem inventar dado:
//   1. Lançamentos já cadastrados com data futura (parcelas, contas agendadas).
//   2. Gastos fixos do mês anterior que ainda não foram lançados neste mês :
//      projetados para o mesmo dia do mês (é exatamente o que o banner de
//      "gastos fixos" já detecta, aqui reaproveitado com data estimada).
function upcomingBills(data, days = 30) {
  const today = todayIso();
  const limitIso = isoOfDate(new Date(dateFromIso(today).getTime() + days * 86400000));
  const out = [];

  (data.transactions || []).forEach((t) => {
    if (t.type !== "expense") return;
    if (t.date <= today || t.date > limitIso) return;
    const cat = categoryById(data, t.categoryId);
    out.push({
      id: t.id,
      kind: "scheduled",
      date: t.date,
      daysLeft: daysBetweenIso(today, t.date),
      amount: roundMoney(t.amount),
      label: t.description || cat.name,
      categoryName: cat.name,
      color: cat.color,
      icon: cat.icon,
      installment: t.installmentTotal ? `${t.installmentIndex}/${t.installmentTotal}` : null,
    });
  });

  const currentKey = keyOfDate(new Date());
  getPendingRecurring(data, currentKey).forEach((t) => {
    const day = Number(String(t.date).slice(8, 10)) || 1;
    const [y, m] = currentKey.split("-").map(Number);
    const dim = daysInMonthOf(y, m - 1);
    const estimated = isoOfDate(new Date(y, m - 1, Math.min(day, dim)));
    if (estimated > limitIso) return;
    const cat = categoryById(data, t.categoryId);
    out.push({
      id: `recur-${t.id}`,
      kind: estimated < today ? "late" : "recurring",
      date: estimated,
      daysLeft: daysBetweenIso(today, estimated),
      amount: roundMoney(t.amount),
      label: t.description || cat.name,
      categoryName: cat.name,
      color: cat.color,
      icon: cat.icon,
      installment: null,
    });
  });

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { items: out, total: sumMoney(out, (b) => b.amount), lateCount: out.filter((b) => b.kind === "late").length };
}

/* ==============================================================================
 * META EM DESTAQUE
 * ============================================================================== */

// Escolhe a meta mais "acionável": a que tem prazo mais próximo; sem prazos,
// a mais avançada em percentual. Metas concluídas ficam por último.
function featuredGoal(data) {
  const goals = (data.goals || []).filter((g) => g.target > 0);
  if (goals.length === 0) return null;
  const today = todayIso();
  const scored = goals.map((g) => {
    const pct = clamp(safePct(g.current, g.target), 0, 100);
    const daysLeft = g.deadline ? daysBetweenIso(today, g.deadline) : null;
    return { goal: g, pct, daysLeft, done: pct >= 100 };
  });
  const pending = scored.filter((s) => !s.done);
  const pool = pending.length > 0 ? pending : scored;
  pool.sort((a, b) => {
    if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft;
    if (a.daysLeft != null) return -1;
    if (b.daysLeft != null) return 1;
    return b.pct - a.pct;
  });
  const best = pool[0];
  const remaining = Math.max(0, subMoney(best.goal.target, best.goal.current));
  const monthsLeft = best.daysLeft != null && best.daysLeft > 0 ? Math.max(1, Math.ceil(best.daysLeft / 30.44)) : null;
  return {
    goal: best.goal,
    pct: best.pct,
    daysLeft: best.daysLeft,
    remaining,
    monthlyNeeded: monthsLeft ? divMoney(remaining, monthsLeft) : null,
    done: best.done,
  };
}

/* ==============================================================================
 * RESUMO INTELIGENTE DO MÊS
 * ============================================================================== */

// Frases curtas, sempre ancoradas em um número real. Cada item traz `tone`
// (positive | warn | danger | neutral) para a UI colorir sem reinterpretar.
function smartSummary(data, monthKey, ctx) {
  const snap = (ctx && ctx.month) || monthSnapshot(data, monthKey);
  const ranking = (ctx && ctx.ranking) || categoryRanking(data, monthKey);
  const items = [];

  if (snap.txCount === 0) {
    items.push({ icon: "sparkles", tone: "neutral", text: "Nenhum lançamento neste mês ainda. Registre o primeiro gasto para começar a acompanhar." });
    return items;
  }

  if (snap.expenseDeltaPct != null && Math.abs(snap.expenseDeltaPct) >= 5) {
    const up = snap.expenseDeltaPct > 0;
    const diff = Math.abs(subMoney(snap.expense, snap.prevExpense));
    items.push({
      icon: up ? "arrowUpRight" : "arrowDownRight",
      tone: up ? "warn" : "positive",
      text: `Seus gastos estão ${Math.abs(snap.expenseDeltaPct).toFixed(0)}% ${up ? "acima" : "abaixo"} do mês passado (${up ? "+" : "−"}${fmtBRL(diff)}).`,
    });
  }

  if (ranking.length > 0 && snap.expense > 0) {
    const top = ranking[0];
    const share = safePct(top.value, snap.expense);
    items.push({
      icon: top.icon,
      tone: share >= 40 ? "warn" : "neutral",
      text: `${top.name} concentra ${share.toFixed(0)}% dos seus gastos: ${fmtBRL(top.value)}.`,
    });
  }

  // Só afirma economia quando há renda REALIZADA para dividir. Com renda apenas
  // planejada, qualquer percentual seria inventado.
  if (snap.incomeRealized > 0 && snap.savingsRate != null) {
    if (snap.savings > 0) {
      items.push({
        icon: "piggy",
        tone: snap.savingsRate >= 20 ? "positive" : "neutral",
        text: `Você economizou ${fmtBRL(snap.savings)}. ${snap.savingsRate.toFixed(0)}% da renda recebida${snap.partial ? " até agora" : ""}.`,
      });
    } else {
      items.push({
        icon: "alertTriangle",
        tone: "danger",
        text: `Você gastou ${fmtBRL(Math.abs(snap.savings))} a mais do que recebeu neste mês.`,
      });
    }
  }

  if (snap.progress.isCurrent && snap.progress.ratio > 0.2 && snap.projectedExpense > snap.expense) {
    // Projeção contra projeção: comparar o gasto projetado do mês inteiro com a
    // renda já recebida acusaria estouro em todo dia 10.
    const overIncome = snap.incomeProjected > 0 && moneyCompare(snap.projectedExpense, snap.incomeProjected) > 0;
    items.push({
      icon: "trendUp",
      tone: overIncome ? "danger" : "neutral",
      text: `No ritmo atual, o mês deve fechar em ${fmtBRL(snap.projectedExpense)}${overIncome ? "; acima da sua renda." : "."}`,
    });
  }

  return items.slice(0, 4);
}

/* ==============================================================================
 * MODELO ÚNICO DO DASHBOARD
 * ============================================================================== */

// Ponto de entrada da UI. Monta tudo uma vez só e devolve um objeto de leitura.
// `refDate` é o mês visualizado (pode ser passado, via navegação de meses).
function buildDashboardModel(data, refDate) {
  const ref = refDate instanceof Date ? refDate : new Date();
  const monthKey = keyOfDate(ref);
  const isCurrentMonth = monthKey === keyOfDate(new Date());

  const month = monthSnapshot(data, monthKey);
  const ranking = categoryRanking(data, monthKey);
  const worth = netWorth(data);
  const reserve = emergencyFund(data);
  const goal = featuredGoal(data);
  const bills = isCurrentMonth ? upcomingBills(data) : { items: [], total: 0, lateCount: 0 };
  const score = typeof computeFinanceScore === "function"
    ? computeFinanceScore(data, monthKey, { month, worth, reserve, bills })
    : null;

  return {
    monthKey, refDate: ref, isCurrentMonth,
    greeting: greetingFor(new Date()),
    firstName: displayFirstName(data),
    month, ranking, worth, reserve, goal, bills, score,
    summary: smartSummary(data, monthKey, { month, ranking }),
  };
}
