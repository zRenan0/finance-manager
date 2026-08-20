// achievements.js. Módulo 6: motor de gamificação (conquistas, XP, níveis e sequências).
//
// Arquivo PURO: não conhece DOM, não lê `state`, não grava nada. Recebe o
// snapshot de dados e devolve um modelo de leitura. Toda a renderização mora em
// `app.js`, como nos demais módulos (`score.js`, `health.js`, `goals.js`).
//
// Três decisões estruturais valem explicação:
//
// 1. **Conquista desbloqueada não volta a trancar.** A regra é avaliada sobre o
//    dado de hoje, mas o desbloqueio fica gravado com data em
//    `data.achievements.unlocked`. Se a sequência de 6 meses quebrar, a medalha
//    "6 meses economizando" continua sua; ela registra algo que ACONTECEU.
//    Retirar um troféu por uma recaída é o oposto de reforço positivo.
//
// 2. **Nada de conquista por "usar o app".** Toda medalha aqui premia um fato
//    financeiro real (guardar, quitar, investir, cumprir orçamento) ou o hábito
//    de registrar; que é o que faz o resto funcionar. Gamificação que premia
//    cliques treina o usuário a clicar, não a poupar.
//
// 3. **Progresso visível também no que está trancado.** Cada conquista devolve
//    `current`/`target`, então a tela mostra "faltam R$ 320" em vez de um
//    cadeado mudo. É a diferença entre um placar e um guia.
"use strict";

const ACH_TIERS = {
  bronze:  { id: "bronze",  label: "Bronze",  color: "#B5652B", weight: 0 },
  prata:   { id: "prata",   label: "Prata",   color: "#7C8592", weight: 1 },
  ouro:    { id: "ouro",    label: "Ouro",    color: "#C08A2E", weight: 2 },
  platina: { id: "platina", label: "Platina", color: "#3C6E8F", weight: 3 },
};

const ACH_GROUPS = [
  { id: "inicio",     label: "Primeiros passos", icon: "flag",       desc: "O básico que faz todo o resto funcionar." },
  { id: "habito",     label: "Hábito",           icon: "refresh",    desc: "Constância vale mais que intensidade." },
  { id: "economia",   label: "Economia",         icon: "piggy",      desc: "Sobrar dinheiro no fim do mês." },
  { id: "metas",      label: "Metas",            icon: "target",     desc: "Objetivos definidos e concluídos." },
  { id: "protecao",   label: "Proteção",         icon: "shieldCheck",desc: "Reserva de emergência e dívidas sob controle." },
  { id: "patrimonio", label: "Patrimônio",       icon: "trendUp",    desc: "Investir e fazer o patrimônio crescer." },
  { id: "disciplina", label: "Disciplina",       icon: "checkCircle",desc: "Orçamentos respeitados e contas em dia." },
];

// Níveis: o XP acumulado vem só de conquistas desbloqueadas.

const ACH_LEVELS = [
  { level: 1, name: "Iniciante",           xp: 0,    icon: "leaf",       color: "#7C8592" },
  { level: 2, name: "Organizado",          xp: 90,   icon: "layout",     color: "#4E7C99" },
  { level: 3, name: "Consciente",          xp: 220,  icon: "pie",        color: "#3C6E8F" },
  { level: 4, name: "Poupador",            xp: 400,  icon: "piggy",      color: "#0E6E5D" },
  { level: 5, name: "Planejador",          xp: 640,  icon: "calendar",   color: "#1F8A5F" },
  { level: 6, name: "Investidor",          xp: 900,  icon: "trendUp",    color: "#8A5FBF" },
  { level: 7, name: "Estrategista",        xp: 1200, icon: "bolt",       color: "#B5652B" },
  { level: 8, name: "Mestre das Finanças", xp: 1520, icon: "star",       color: "#C08A2E" },
];

const ACH_INVEST_CATEGORY = "investimento";
const ACH_HISTORY_MONTHS = 24;

/* ==========================================================================
 * CONTEXTO; os fatos brutos, calculados UMA vez por avaliação
 * ========================================================================== */

// Agregados mês a mês (24 meses para trás). `txCount` é o portão de todas as
// sequências: um mês sem lançamento nenhum não conta como "mês economizando",
// mesmo que a renda fixa cadastrada faça a conta fechar positiva no papel.
function achMonthlyHistory(data, refDate) {
  const base = refDate instanceof Date ? refDate : new Date();
  const out = [];
  for (let i = ACH_HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = addMonths(base, -i);
    const key = keyOfDate(d);
    const totals = realizedMonthTotals(data, key);
    // Conquista é reconhecimento de FATO consumado. Usar renda planejada aqui
    // daria medalha por um mês em que a pessoa só ainda não tinha gastado, e a
    // medalha sumiria depois, quando o gasto chegasse.
    const renda = incomeBasis(data, key);
    const income = renda.realized;
    const investSpend = totals.aportes;
    out.push({
      key,
      income,
      expense: totals.expense,
      savings: subMoney(income, totals.expense),
      savingsRate: income > 0 ? safePct(subMoney(income, totals.expense), income) : 0,
      // Mês em andamento não conta para sequência nem para recorde: ele ainda
      // pode piorar até o dia 31.
      complete: renda.complete,
      txCount: totals.tx.length,
      investSpend,
    });
  }
  return out;
}

// Sequência de meses consecutivos, contada de trás para frente. O mês corrente
// só entra se já tiver movimento; se ainda não teve, a sequência anterior é
// preservada em vez de zerada; o mês ainda está acontecendo.
function achStreak(history, predicate) {
  if (history.length === 0) return 0;
  let i = history.length - 1;
  if (!predicate(history[i])) i--;   // mês corrente ainda em aberto
  let streak = 0;
  for (; i >= 0; i--) {
    if (!predicate(history[i])) break;
    streak++;
  }
  return streak;
}

// Quantos meses JÁ FECHADOS (dos últimos 12) terminaram com todos os tetos de
// categoria respeitados. Mês corrente fica de fora: ainda dá tempo de estourar.
function achBudgetCleanMonths(data, refDate) {
  const base = refDate instanceof Date ? refDate : new Date();
  const currentKey = keyOfDate(base);
  let clean = 0;
  let evaluated = 0;
  for (let i = 12; i >= 1; i--) {
    const key = keyOfDate(addMonths(base, -i));
    if (key === currentKey) continue;
    const status = computeBudgetStatus(data, key);
    if (status.counts.total === 0) continue;
    evaluated++;
    if (status.counts.over === 0) clean++;
  }
  return { clean, evaluated };
}

function buildAchievementContext(data, refDate) {
  const base = refDate instanceof Date ? refDate : new Date();
  const history = achMonthlyHistory(data, base);
  const txs = data.transactions || [];
  const goals = data.goals || [];

  const activeMonths = history.filter((h) => h.txCount > 0);
  // Recorde e total poupado olham apenas para meses FECHADOS. O mês corrente
  // entra parcial: no dia 5 ele mostraria uma taxa altíssima, viraria recorde,
  // e o recorde cairia sozinho no dia 20. Medalha que some não é medalha.
  const closedMonths = activeMonths.filter((h) => h.complete !== false);
  const savingMonths = closedMonths.filter((h) => h.savings > 0);
  const totalSaved = sumMoney(savingMonths, (h) => h.savings);
  const bestSavingsRate = closedMonths.reduce((max, h) => Math.max(max, h.savingsRate), 0);

  const bestInvestRate = history.reduce((max, h) => {
    if (h.income <= 0 || h.investSpend <= 0) return max;
    return Math.max(max, safePct(h.investSpend, h.income));
  }, 0);

  const worthSeries = netWorthSeries(data, 7);
  const worthNow = worthSeries[worthSeries.length - 1].value;
  const worthThen = worthSeries[0].value;

  const reserve = emergencyFund(data);
  const bills = upcomingBills(data, 30);
  const budgetClean = achBudgetCleanMonths(data, base);

  const goalsDone = goals.filter((g) => g.target > 0 && moneyCompare(g.current, g.target) >= 0).length;
  const budgetedCategories = (data.categories || []).filter((c) => typeof c.budget === "number" && c.budget > 0).length;

  const sources = new Set(txs.map((t) => t.source || "manual"));
  const advancedTools = ["import-ofx", "import-csv", "nlp", "qrcode-pix", "qrcode-nfce"]
    .filter((s) => sources.has(s)).length;

  const liabilities = typeof liabilitiesTotal === "function" ? liabilitiesTotal(data) : 0;
  const invested = typeof investedTotal === "function" ? investedTotal(data) : 0;

  return {
    history,
    txCount: txs.length,
    incomeTxCount: txs.filter((t) => t.type === "income").length,
    monthlyIncome: roundMoney(data.monthlyIncome || 0),
    activeMonths: activeMonths.length,
    activeStreak: achStreak(history, (h) => h.txCount > 0),
    savingStreak: achStreak(history, (h) => h.txCount > 0 && h.savings > 0),
    savingMonths: savingMonths.length,
    totalSaved,
    bestSavingsRate,
    bestInvestRate,
    invested,
    hasInvestments: invested > 0,
    liabilities,
    worthNow,
    worthDelta: subMoney(worthNow, worthThen),
    reserve,
    reserveMonths: reserve.monthsCovered,
    goalsTotal: goals.length,
    goalsDone,
    budgetedCategories,
    budgetClean: budgetClean.clean,
    budgetEvaluated: budgetClean.evaluated,
    lateBills: bills.lateCount,
    hasBills: bills.items.length > 0,
    advancedTools,
    sources,
  };
}

/* ==========================================================================
 * CATÁLOGO
 * ========================================================================== */
// `check` devolve sempre { current, target } na MESMA unidade, e opcionalmente
// `unit` ("money" | "pct" | "count") para a tela formatar. `done` é derivado de
// current >= target; assim o progresso e o desbloqueio nunca discordam.
const ACHIEVEMENTS = [
  /* ---- Primeiros passos ---- */
  { id: "first-tx", group: "inicio", tier: "bronze", xp: 10, icon: "plus",
    name: "Primeiro lançamento", desc: "Registre seu primeiro gasto ou receita.",
    unit: "count", check: (c) => ({ current: c.txCount, target: 1 }) },

  { id: "income-set", group: "inicio", tier: "bronze", xp: 10, icon: "wallet",
    name: "Renda declarada", desc: "Informe sua renda mensal nos Ajustes; é a base de quase todo cálculo do app.",
    unit: "count", check: (c) => ({ current: c.monthlyIncome > 0 ? 1 : 0, target: 1 }) },

  { id: "first-income", group: "inicio", tier: "bronze", xp: 10, icon: "arrowUpRight",
    name: "Entrada registrada", desc: "Lance sua primeira receita.",
    unit: "count", check: (c) => ({ current: c.incomeTxCount, target: 1 }) },

  { id: "first-budget", group: "inicio", tier: "bronze", xp: 15, icon: "pie",
    name: "Primeiro teto", desc: "Defina um orçamento mensal para alguma categoria.",
    unit: "count", check: (c) => ({ current: c.budgetedCategories, target: 1 }) },

  { id: "budget-5", group: "inicio", tier: "prata", xp: 30, icon: "layout",
    name: "Orçamento montado", desc: "Cinco categorias com teto definido.",
    unit: "count", check: (c) => ({ current: c.budgetedCategories, target: 5 }) },

  /* ---- Hábito ---- */
  { id: "tx-25", group: "habito", tier: "bronze", xp: 20, icon: "file",
    name: "25 lançamentos", desc: "O retrato só fica nítido com volume de dados.",
    unit: "count", check: (c) => ({ current: c.txCount, target: 25 }) },

  { id: "tx-100", group: "habito", tier: "prata", xp: 45, icon: "file",
    name: "100 lançamentos", desc: "Cem registros; seu histórico já sustenta análises sérias.",
    unit: "count", check: (c) => ({ current: c.txCount, target: 100 }) },

  { id: "tx-500", group: "habito", tier: "ouro", xp: 90, icon: "file",
    name: "500 lançamentos", desc: "Poucas pessoas chegam aqui.",
    unit: "count", check: (c) => ({ current: c.txCount, target: 500 }) },

  { id: "streak-3", group: "habito", tier: "prata", xp: 40, icon: "refresh",
    name: "3 meses seguidos", desc: "Três meses consecutivos registrando movimentações.",
    unit: "count", check: (c) => ({ current: c.activeStreak, target: 3 }) },

  { id: "streak-6", group: "habito", tier: "ouro", xp: 80, icon: "refresh",
    name: "Meio ano de constância", desc: "Seis meses consecutivos com lançamentos.",
    unit: "count", check: (c) => ({ current: c.activeStreak, target: 6 }) },

  { id: "streak-12", group: "habito", tier: "platina", xp: 150, icon: "star",
    name: "Um ano inteiro", desc: "Doze meses consecutivos acompanhando suas finanças.",
    unit: "count", check: (c) => ({ current: c.activeStreak, target: 12 }) },

  /* ---- Economia ---- */
  { id: "save-first", group: "economia", tier: "bronze", xp: 20, icon: "piggy",
    name: "Primeiro mês no azul", desc: "Feche um mês gastando menos do que ganhou.",
    unit: "count", check: (c) => ({ current: c.savingMonths, target: 1 }) },

  { id: "save-1k", group: "economia", tier: "prata", xp: 50, icon: "piggy",
    name: "R$ 1.000 economizados", desc: "Soma de tudo que sobrou nos meses positivos.",
    unit: "money", check: (c) => ({ current: c.totalSaved, target: 1000 }) },

  { id: "save-10k", group: "economia", tier: "ouro", xp: 110, icon: "piggy",
    name: "R$ 10.000 economizados", desc: "Dez mil reais acumulados de sobra mensal.",
    unit: "money", check: (c) => ({ current: c.totalSaved, target: 10000 }) },

  { id: "save-rate-20", group: "economia", tier: "prata", xp: 45, icon: "trendUp",
    name: "20% da renda", desc: "Guarde um quinto do que entrou em um único mês.",
    unit: "pct", check: (c) => ({ current: c.bestSavingsRate, target: 20 }) },

  { id: "save-rate-30", group: "economia", tier: "ouro", xp: 85, icon: "trendUp",
    name: "30% da renda", desc: "Um mês guardando quase um terço do que ganhou.",
    unit: "pct", check: (c) => ({ current: c.bestSavingsRate, target: 30 }) },

  { id: "save-streak-6", group: "economia", tier: "ouro", xp: 100, icon: "bolt",
    name: "6 meses economizando", desc: "Seis meses consecutivos fechando no positivo.",
    unit: "count", check: (c) => ({ current: c.savingStreak, target: 6 }) },

  /* ---- Metas ---- */
  { id: "goal-first", group: "metas", tier: "bronze", xp: 15, icon: "target",
    name: "Primeira meta", desc: "Objetivo sem prazo e sem valor é desejo. Crie uma meta.",
    unit: "count", check: (c) => ({ current: c.goalsTotal, target: 1 }) },

  { id: "goal-done", group: "metas", tier: "ouro", xp: 90, icon: "flag",
    name: "Meta concluída", desc: "Bater 100% de uma meta financeira.",
    unit: "count", check: (c) => ({ current: c.goalsDone, target: 1 }) },

  { id: "goal-done-3", group: "metas", tier: "platina", xp: 150, icon: "star",
    name: "Três metas batidas", desc: "Não foi sorte: virou método.",
    unit: "count", check: (c) => ({ current: c.goalsDone, target: 3 }) },

  /* ---- Proteção ---- */
  { id: "reserve-start", group: "protecao", tier: "bronze", xp: 20, icon: "shieldCheck",
    name: "Reserva iniciada", desc: "Comece a guardar sua reserva de emergência.",
    unit: "count", check: (c) => ({ current: c.reserve.current > 0 ? 1 : 0, target: 1 }) },

  { id: "reserve-3m", group: "protecao", tier: "ouro", xp: 90, icon: "shieldCheck",
    name: "3 meses cobertos", desc: "Reserva suficiente para três meses de despesa média.",
    unit: "count", check: (c) => ({ current: Math.floor(c.reserveMonths * 10) / 10, target: 3 }) },

  { id: "reserve-full", group: "protecao", tier: "platina", xp: 160, icon: "shieldCheck",
    name: "Reserva completa", desc: "Sua reserva alcançou o alvo que você definiu.",
    unit: "pct", check: (c) => ({ current: c.reserve.pct, target: 100 }) },

  { id: "debt-free", group: "protecao", tier: "ouro", xp: 80, icon: "checkCircle",
    name: "Sem dívidas", desc: "Nenhuma dívida em aberto no patrimônio, com bens cadastrados.",
    unit: "count", check: (c) => ({ current: c.worthNow > 0 && c.liabilities === 0 ? 1 : 0, target: 1 }) },

  /* ---- Patrimônio ---- */
  { id: "invest-first", group: "patrimonio", tier: "prata", xp: 40, icon: "trendUp",
    name: "Primeiro investimento", desc: "Registre sua primeira aplicação.",
    unit: "count", check: (c) => ({ current: c.hasInvestments ? 1 : 0, target: 1 }) },

  { id: "invest-rate-10", group: "patrimonio", tier: "ouro", xp: 75, icon: "bolt",
    name: "10% investidos", desc: "Um mês destinando 10% da renda a investimentos.",
    unit: "pct", check: (c) => ({ current: c.bestInvestRate, target: 10 }) },

  { id: "worth-growth", group: "patrimonio", tier: "prata", xp: 50, icon: "arrowUpRight",
    name: "Patrimônio em alta", desc: "Patrimônio líquido maior do que há seis meses.",
    unit: "count", check: (c) => ({ current: c.worthDelta > 0 ? 1 : 0, target: 1 }) },

  { id: "worth-50k", group: "patrimonio", tier: "platina", xp: 140, icon: "star",
    name: "R$ 50.000 de patrimônio", desc: "Patrimônio líquido de cinquenta mil reais.",
    unit: "money", check: (c) => ({ current: Math.max(0, c.worthNow), target: 50000 }) },

  /* ---- Disciplina ---- */
  { id: "bills-on-time", group: "disciplina", tier: "prata", xp: 35, icon: "clock",
    name: "Contas em dia", desc: "Nenhuma conta prevista em atraso.",
    unit: "count", check: (c) => ({ current: c.hasBills && c.lateBills === 0 ? 1 : 0, target: 1 }) },

  { id: "budget-clean-1", group: "disciplina", tier: "prata", xp: 45, icon: "checkCircle",
    name: "Mês dentro do teto", desc: "Feche um mês sem estourar nenhum orçamento.",
    unit: "count", check: (c) => ({ current: c.budgetClean, target: 1 }) },

  { id: "budget-clean-3", group: "disciplina", tier: "ouro", xp: 95, icon: "shieldCheck",
    name: "Três meses no controle", desc: "Três meses fechados sem estourar orçamento.",
    unit: "count", check: (c) => ({ current: c.budgetClean, target: 3 }) },

  { id: "toolbox", group: "disciplina", tier: "prata", xp: 30, icon: "sparkles",
    name: "Caixa de ferramentas", desc: "Use três formas diferentes de lançar: extrato, texto e QR Code.",
    unit: "count", check: (c) => ({ current: c.advancedTools, target: 3 }) },
];

const ACH_TOTAL_XP = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp, 0);

/* ==========================================================================
 * NÍVEIS
 * ========================================================================== */

function levelForXp(xp) {
  const points = Math.max(0, Number(xp) || 0);
  let current = ACH_LEVELS[0];
  for (let i = 0; i < ACH_LEVELS.length; i++) {
    if (points >= ACH_LEVELS[i].xp) current = ACH_LEVELS[i];
  }
  const next = ACH_LEVELS.find((l) => l.xp > points) || null;
  const span = next ? next.xp - current.xp : 0;
  const into = points - current.xp;
  return {
    ...current,
    xp: points,
    levelFloor: current.xp,
    next,
    toNext: next ? next.xp - points : 0,
    // Fração percorrida DENTRO do nível; não do total. Uma barra que anda de
    // 0 a 100 dentro de cada faixa dá sensação de avanço; uma barra sobre o
    // total geral trava perto de zero e desmotiva.
    progress: next && span > 0 ? clamp(into / span, 0, 1) : 1,
    isMax: !next,
  };
}

/* ==========================================================================
 * MODELO
 * ========================================================================== */

function achProgressOf(res) {
  const target = Number(res.target) || 0;
  if (target <= 0) return res.current > 0 ? 1 : 0;
  return clamp((Number(res.current) || 0) / target, 0, 1);
}

/**
 * @param {object} data     snapshot
 * @param {Date}   refDate  mês de referência (default: hoje)
 * @returns modelo completo de gamificação
 */
function buildAchievementsModel(data, refDate) {
  const ctx = buildAchievementContext(data, refDate);
  const record = (data.achievements && data.achievements.unlocked) || {};

  const items = ACHIEVEMENTS.map((a) => {
    let res;
    try { res = a.check(ctx) || { current: 0, target: 1 }; }
    catch (e) { res = { current: 0, target: 1 }; }
    const meetsNow = achProgressOf(res) >= 1;
    const unlockedAt = record[a.id] || null;
    // Sticky: conquista registrada permanece conquistada.
    const done = meetsNow || !!unlockedAt;
    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      icon: a.icon,
      group: a.group,
      tier: a.tier,
      tierMeta: ACH_TIERS[a.tier],
      xp: a.xp,
      unit: res.unit || a.unit || "count",
      current: Number(res.current) || 0,
      target: Number(res.target) || 0,
      progress: done ? 1 : achProgressOf(res),
      done,
      meetsNow,
      unlockedAt,
      isNew: meetsNow && !unlockedAt,
    };
  });

  const unlocked = items.filter((i) => i.done);
  const xp = unlocked.reduce((sum, i) => sum + i.xp, 0);
  const level = levelForXp(xp);

  const byGroup = ACH_GROUPS.map((g) => {
    const list = items.filter((i) => i.group === g.id);
    const doneList = list.filter((i) => i.done);
    return {
      ...g,
      items: list.sort(achSortForDisplay),
      total: list.length,
      unlocked: doneList.length,
      pct: list.length ? Math.round((doneList.length / list.length) * 100) : 0,
    };
  });

  // "Próximas": trancadas, com algum avanço, mais perto de fechar primeiro.
  // Conquistas em 0% ficam no fim; sugerir o que está longe demais não ajuda.
  const nextUp = items
    .filter((i) => !i.done)
    .sort((a, b) => (b.progress - a.progress) || (a.xp - b.xp))
    .slice(0, 3);

  const recent = unlocked
    .filter((i) => i.unlockedAt)
    .sort((a, b) => (a.unlockedAt < b.unlockedAt ? 1 : -1))
    .slice(0, 5);

  return {
    items,
    byGroup,
    nextUp,
    recent,
    pendingIds: items.filter((i) => i.isNew).map((i) => i.id),
    unlockedCount: unlocked.length,
    total: items.length,
    completionPct: items.length ? Math.round((unlocked.length / items.length) * 100) : 0,
    xp,
    maxXp: ACH_TOTAL_XP,
    level,
    streak: {
      active: ctx.activeStreak,
      saving: ctx.savingStreak,
      activeMonths: ctx.activeMonths,
      savingMonths: ctx.savingMonths,
    },
    ctx,
  };
}

// Trancadas com progresso primeiro (é o que dá o que fazer), depois as
// desbloqueadas mais valiosas, depois o resto.
function achSortForDisplay(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.done) return (b.progress - a.progress) || (a.xp - b.xp);
  return (ACH_TIERS[b.tier].weight - ACH_TIERS[a.tier].weight) || (b.xp - a.xp);
}

/* ==========================================================================
 * PERSISTÊNCIA (funções puras; quem grava é o app.js, via setData)
 * ========================================================================== */

/** Registra ids recém-conquistados; devolve NOVO objeto de conquistas. */
function withUnlockedAchievements(record, ids, iso) {
  const base = record && typeof record === "object" ? record : {};
  const unlocked = { ...(base.unlocked || {}) };
  const stamp = iso || todayIso();
  (ids || []).forEach((id) => { if (!unlocked[id]) unlocked[id] = stamp; });
  return { ...base, unlocked };
}

/** Texto curto de celebração; usado no toast e no cartão do dashboard. */
function achievementToastFor(items) {
  if (!items || items.length === 0) return null;
  if (items.length === 1) return `Conquista desbloqueada: ${items[0].name}`;
  return `${items.length} novas conquistas desbloqueadas!`;
}

function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
