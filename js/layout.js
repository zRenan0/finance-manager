// layout.js; quais cartões aparecem no Início, e em que ordem (motor puro)
// ------------------------------------------------------------------------------
// O dashboard cresceu para vinte cartões. Vinte cartões servem bem a alguém que
// usa tudo; dívidas, carteira, conquistas, assinaturas; e sepultam a
// informação de quem só quer saber quanto sobrou este mês. A resposta não é
// cortar cartão: é deixar cada pessoa escolher.
//
// O registro abaixo é a única lista dos cartões do Início. `screens/dashboard.js`
// monta a tela a partir dela; nada é chamado direto. O preço é ter de registrar
// cartão novo aqui; e é justamente esse o ponto: um cartão que não passa pelo
// registro não pode ser desligado pelo usuário, e um cartão que não pode ser
// desligado é o problema que este arquivo existe para resolver.
//
// `monthly: true` marca o que só faz sentido no mês corrente (previsão, ritmo,
// pendências). Esses cartões somem sozinhos ao navegar para um mês passado, e a
// tela de personalização diz isso em vez de deixar o usuário achar que quebrou.
"use strict";

const DASHBOARD_CARDS = [
  { id: "hero",           label: "Saldo e resumo do mês",     hint: "Saldo em conta, receitas, despesas e economia.", locked: true },
  { id: "score",          label: "Score financeiro",          hint: "Nota de 0 a 100 com os pilares que a explicam." },
  { id: "networth",       label: "Patrimônio",                hint: "Total, composição e evolução dos últimos 6 meses." },
  { id: "reserve",        label: "Reserva de emergência",     hint: "Quantos meses de despesa a reserva já cobre." },
  { id: "goal",           label: "Meta em destaque",          hint: "A meta ativa mais próxima do prazo." },
  { id: "bills",          label: "Próximas contas",           hint: "O que vence nos próximos 30 dias.", monthly: true },
  { id: "forecast",       label: "Previsão de caixa",         hint: "Para onde o saldo caminha nas próximas semanas.", monthly: true },
  { id: "summary",        label: "Resumo inteligente",        hint: "Leitura automática dos números do mês." },
  { id: "quickEntry",     label: "Lançamento rápido",         hint: "Campo de texto livre para registrar um gasto.", monthly: true },
  { id: "advisor",        label: "Conselheiro",               hint: "Recomendações priorizadas a partir do seu mês.", monthly: true },
  { id: "assistant",      label: "Assistente financeiro",     hint: "Alertas automáticos sobre padrões de gasto.", monthly: true },
  { id: "gamification",   label: "Conquistas e nível",        hint: "Progresso das medalhas do app.", monthly: true },
  { id: "budgetHealth",   label: "Saúde financeira do mês",   hint: "Renda, fixos, esporádicos e quanto ainda cabe por dia." },
  { id: "categoryBudgets", label: "Orçamentos por categoria", hint: "Barras de consumo dos tetos que você definiu." },
  { id: "budgetSplit",    label: "Regra de orçamento",        hint: "Necessidades, Desejos e Futuro contra a sua renda." },
  { id: "creditLimit",    label: "Fatura do cartão",          hint: "Quanto já comprometeu do teto que você definiu.", monthly: true },
  { id: "leaks",          label: "Vazamentos silenciosos",    hint: "Gastos pequenos que se somam sem aparecer.", monthly: true },
  { id: "subscriptions",  label: "Assinaturas",               hint: "Cobranças recorrentes detectadas no histórico.", monthly: true },
  { id: "breakdown",      label: "Para onde foi o dinheiro",  hint: "Distribuição das despesas por categoria." },
  { id: "recent",         label: "Últimos lançamentos",       hint: "Os 6 registros mais recentes." },
];

const DASHBOARD_CARD_IDS = DASHBOARD_CARDS.map((c) => c.id);

const DASHBOARD_FOCUS_OPTIONS = [
  { id: "month", label: "Organizar o mês", hint: "Saldo, contas, orçamento e lançamentos.", icon: "calendar" },
  { id: "debt", label: "Sair das dívidas", hint: "Dívidas, caixa disponível e próximos compromissos.", icon: "arrowDownRight" },
  { id: "reserve", label: "Montar reserva", hint: "Reserva, economia mensal e meta em destaque.", icon: "shieldCheck" },
  { id: "purchase", label: "Planejar uma compra", hint: "Meta, previsão de caixa e capacidade mensal.", icon: "target" },
  { id: "wealth", label: "Acompanhar patrimônio", hint: "Patrimônio, carteira, score e evolução.", icon: "trendUp" },
];

const DASHBOARD_FOCUS_ORDER = {
  month: ["hero", "bills", "budgetHealth", "categoryBudgets", "budgetSplit", "forecast", "recent", "breakdown", "summary", "quickEntry"],
  debt: ["hero", "advisor", "bills", "forecast", "budgetHealth", "creditLimit", "recent", "summary", "leaks"],
  reserve: ["hero", "reserve", "goal", "budgetHealth", "budgetSplit", "forecast", "advisor", "recent", "breakdown"],
  purchase: ["hero", "goal", "forecast", "budgetHealth", "budgetSplit", "advisor", "recent", "breakdown", "summary"],
  wealth: ["hero", "networth", "score", "reserve", "goal", "breakdown", "summary", "advisor", "recent"],
};

function normalizeDashboardFocus(value) {
  return DASHBOARD_FOCUS_OPTIONS.some((option) => option.id === value) ? value : "month";
}

function dashboardOrderForFocus(focus) {
  const preferred = DASHBOARD_FOCUS_ORDER[normalizeDashboardFocus(focus)] || [];
  return preferred.concat(DASHBOARD_CARD_IDS.filter((id) => preferred.indexOf(id) === -1));
}

function applyDashboardFocus(layout, focus) {
  const current = normalizeDashboardLayout(layout);
  return { order: dashboardOrderForFocus(focus), hidden: current.hidden, pinned: current.pinned };
}

function dashboardCardById(id) {
  return DASHBOARD_CARDS.find((c) => c.id === id) || null;
}

function defaultDashboardLayout() {
  return { order: DASHBOARD_CARD_IDS.slice(), hidden: [], pinned: [] };
}

function isDashboardStarting(data) {
  const d = data && typeof data === "object" ? data : {};
  return (Array.isArray(d.transactions) ? d.transactions.length : 0) === 0
    && (Array.isArray(d.goals) ? d.goals.length : 0) === 0
    && (Array.isArray(d.assets) ? d.assets.length : 0) === 0;
}

// Um cartão sem dados não informa nada e ainda empurra o próximo passo para
// baixo. Esta camada não altera a personalização salva: apenas espera o assunto
// existir para mostrar o cartão na posição escolhida pela pessoa.
function isDashboardCardRelevant(data, id) {
  if (!data || typeof data !== "object" || id === "hero") return true;
  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const cards = Array.isArray(data.creditCards) ? data.creditCards : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const expenses = txs.filter((t) => t && t.type === "expense");
  const hasRecurring = txs.some((t) => t && (t.recurring || t.recurringId || t.installmentGroupId));
  const hasDebt = assets.some((a) => a && (a.kind === "liability" || a.class === "divida"));
  const hasHistory = txs.length > 0;

  switch (id) {
    case "score": return txs.length >= 3;
    case "networth": return hasHistory || goals.length > 0 || assets.length > 0;
    case "reserve": return hasHistory || goals.some((g) => g && (g.id === data.emergencyGoalId || g.type === "emergency"));
    case "goal": return goals.some((g) => g && !g.done && Number(g.current) < Number(g.target));
    case "bills": return hasRecurring;
    case "forecast": return txs.length >= 2;
    case "summary": return txs.length >= 3;
    case "quickEntry": return hasHistory;
    case "advisor": return txs.length >= 3 || hasDebt;
    case "assistant": return txs.length >= 5;
    case "gamification": return !!(data.achievements && data.achievements.enabled);
    case "budgetHealth": return hasHistory && Number(data.monthlyIncome) > 0;
    case "categoryBudgets": return categories.some((c) => c && Number(c.budget) > 0);
    case "budgetSplit": return hasHistory && Number(data.monthlyIncome) > 0;
    case "creditLimit": return Number(data.creditCardLimit) > 0 || cards.length > 0;
    case "leaks": return expenses.length >= 10;
    case "subscriptions": return hasRecurring;
    case "breakdown": return expenses.length > 0;
    case "recent": return hasHistory;
    default: return accounts.length > 0 || hasHistory;
  }
}

// Reconcilia o que está gravado com o registro atual. Duas situações reais:
//
//   • cartão novo numa versão nova do app; ele NÃO vai para o fim da lista.
//     Entra na posição que ocupa no registro, entre os vizinhos que o autor
//     escolheu. Empurrar novidade para o rodapé é a forma mais silenciosa de
//     nunca ser vista.
//   • cartão removido do app; o id some da ordem e da lista de ocultos, em vez
//     de virar um item fantasma na tela de personalização.
function normalizeDashboardLayout(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const known = new Set(DASHBOARD_CARD_IDS);
  const seen = new Set();
  const order = (Array.isArray(src.order) ? src.order : [])
    .filter((id) => typeof id === "string" && known.has(id) && !seen.has(id) && (seen.add(id), true));

  DASHBOARD_CARD_IDS.forEach((id, defaultIndex) => {
    if (order.indexOf(id) !== -1) return;
    order.splice(Math.min(defaultIndex, order.length), 0, id);
  });

  const hidden = (Array.isArray(src.hidden) ? src.hidden : [])
    .filter((id) => typeof id === "string" && known.has(id))
    .filter((id) => {
      const card = dashboardCardById(id);
      return card && !card.locked;   // um cartão fixo não pode ser escondido nem por backup adulterado
    });

  const pinned = (Array.isArray(src.pinned) ? src.pinned : [])
    .filter((id) => typeof id === "string" && known.has(id))
    .filter((id) => {
      const card = dashboardCardById(id);
      return card && !card.locked && hidden.indexOf(id) === -1;
    });

  return { order, hidden: Array.from(new Set(hidden)), pinned: Array.from(new Set(pinned)) };
}

function isDashboardCardVisible(layout, id) {
  return normalizeDashboardLayout(layout).hidden.indexOf(id) === -1;
}

function toggleDashboardCard(layout, id) {
  const l = normalizeDashboardLayout(layout);
  const card = dashboardCardById(id);
  if (!card || card.locked) return l;
  const i = l.hidden.indexOf(id);
  const hidden = i === -1 ? l.hidden.concat([id]) : l.hidden.filter((x) => x !== id);
  const pinned = hidden.indexOf(id) !== -1 ? l.pinned.filter((x) => x !== id) : l.pinned;
  return { order: l.order, hidden, pinned };
}

function setDashboardCardVisibility(layout, id, visible, data) {
  const l = normalizeDashboardLayout(layout);
  const card = dashboardCardById(id);
  if (!card || card.locked) return l;
  if (!visible) {
    return {
      order: l.order,
      hidden: Array.from(new Set(l.hidden.concat([id]))),
      pinned: l.pinned.filter((x) => x !== id),
    };
  }
  const relevant = isDashboardCardRelevant(data, id);
  return {
    order: l.order,
    hidden: l.hidden.filter((x) => x !== id),
    pinned: relevant ? l.pinned.filter((x) => x !== id) : Array.from(new Set(l.pinned.concat([id]))),
  };
}

// Move de uma posição na ordem completa (não só entre os visíveis): reordenar
// olhando apenas os visíveis faria a posição de um cartão oculto mudar sozinha
// quando ele voltasse a aparecer.
function moveDashboardCard(layout, id, direction) {
  const l = normalizeDashboardLayout(layout);
  const i = l.order.indexOf(id);
  if (i === -1) return l;
  const j = direction < 0 ? i - 1 : i + 1;
  if (j < 0 || j >= l.order.length) return l;
  const order = l.order.slice();
  order[i] = l.order[j];
  order[j] = l.order[i];
  return { order, hidden: l.hidden, pinned: l.pinned };
}

// A lista pronta para a tela: na ordem escolhida, sem os ocultos e sem os que
// não valem para o mês visitado.
function visibleDashboardCards(layout, opts) {
  const isCurrentMonth = !(opts && opts.isCurrentMonth === false);
  const data = opts && opts.data;
  const l = normalizeDashboardLayout(layout);
  return l.order
    .map(dashboardCardById)
    .filter(Boolean)
    .filter((c) => l.hidden.indexOf(c.id) === -1)
    .filter((c) => (c.monthly ? isCurrentMonth : true))
    .filter((c) => isDashboardCardRelevant(data, c.id) || l.pinned.indexOf(c.id) !== -1);
}

function dashboardLayoutCounts(layout, opts) {
  const l = normalizeDashboardLayout(layout);
  const effective = opts ? visibleDashboardCards(l, opts).length : DASHBOARD_CARDS.length - l.hidden.length;
  return { total: DASHBOARD_CARDS.length, hidden: l.hidden.length, pinned: l.pinned.length, visible: effective };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DASHBOARD_CARDS, DASHBOARD_CARD_IDS, dashboardCardById,
    DASHBOARD_FOCUS_OPTIONS, DASHBOARD_FOCUS_ORDER, normalizeDashboardFocus, dashboardOrderForFocus, applyDashboardFocus,
    defaultDashboardLayout, normalizeDashboardLayout, isDashboardCardVisible,
    toggleDashboardCard, setDashboardCardVisibility, moveDashboardCard, visibleDashboardCards, dashboardLayoutCounts,
    isDashboardStarting, isDashboardCardRelevant,
  };
}
