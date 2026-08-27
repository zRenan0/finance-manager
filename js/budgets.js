// budgets.js. Sistema de Orçamentos por Categoria (Feature 3)
// ------------------------------------------------------------------------------
// O usuário define um TETO MENSAL por categoria (campo `category.budget`). Este
// módulo é a única fonte de verdade sobre "quanto já foi gasto contra esse teto"
// e sobre em que faixa de alerta a categoria está.
//
// Decisões de arquitetura:
//
//  1. HERANÇA: o gasto de uma subcategoria conta para o teto da categoria-mãe.
//     Quem define teto em "Alimentação" quer limitar Mercado + Delivery juntos.
//     Uma subcategoria pode ter teto próprio, que vale só para ela.
//
//  2. FAIXAS CONFIGURÁVEIS: 80% (atenção) e 100% (estourado) são os padrões, mas
//     ficam em `data.budgetAlerts` e podem ser ajustados sem tocar no código.
//
//  3. RITMO, NÃO SÓ ACÚMULO: além do percentual já gasto, calculamos a projeção
//     linear até o fim do mês. Gastar 60% do teto no dia 5 é um problema mesmo
//     sem ter cruzado os 80%; o alerta "no ritmo atual você estoura" cobre isso.
//
//  4. PURO: nenhuma função aqui toca no DOM nem grava nada. A UI (app.js) só lê.
"use strict";

const BUDGET_LEVELS = { OK: "ok", WARN: "warn", OVER: "over" };

function budgetThresholds(data, monthKey) {
  const snapshot = typeof budgetSnapshotAt === "function" ? budgetSnapshotAt(data, monthKey) : null;
  const a = (snapshot && snapshot.alerts) || (data && data.budgetAlerts) || {};
  const warn = clamp(Number(a.warn) || 80, 1, 200);
  const over = clamp(Number(a.over) || 100, warn, 500);
  return { warn, over };
}

function budgetLevelOf(pct, thresholds) {
  if (pct >= thresholds.over) return BUDGET_LEVELS.OVER;
  if (pct >= thresholds.warn) return BUDGET_LEVELS.WARN;
  return BUDGET_LEVELS.OK;
}

const BUDGET_LEVEL_META = {
  ok:   { label: "Dentro do limite", color: "var(--positive)", soft: "var(--positive-soft)", icon: "shieldCheck" },
  warn: { label: "Perto do limite",  color: "var(--goal)",     soft: "var(--goal-soft)",     icon: "alertTriangle" },
  over: { label: "Limite estourado", color: "var(--negative)", soft: "var(--negative-soft)", icon: "alertTriangle" },
};

// Quanto foi gasto no mês numa categoria, somando as subcategorias quando a
// categoria em questão for uma categoria-mãe. Soma em centavos (sem drift).
function spentForCategory(data, categoryId, monthKey) {
  const ids = new Set(typeof categoryIdsForBudgetMonth === "function"
    ? categoryIdsForBudgetMonth(data, categoryId, monthKey)
    : categoryWithDescendants(data, categoryId));
  let cents = 0;
  realizedTxForMonth(data, monthKey).forEach((t) => {
    if (!ids.has(t.categoryId)) return;
    // Consumo, com estorno abatido. Um aporte na categoria Investimentos não
    // "estoura o orçamento": ele é o orçamento sendo cumprido. E uma compra
    // estornada precisa devolver o espaço no orçamento, senão o usuário fica
    // com o limite consumido por uma compra que não existiu.
    cents += consumptionCentsOf(t);
  });
  return moneyFromCents(Math.max(0, cents));
}

function budgetForCategory(data, categoryId, monthKey) {
  const snapshot = typeof budgetSnapshotAt === "function" ? budgetSnapshotAt(data, monthKey) : null;
  if (snapshot) return Object.prototype.hasOwnProperty.call(snapshot.budgets, categoryId)
    ? roundMoney(snapshot.budgets[categoryId])
    : null;
  if (monthKey && monthKey < keyOfDate(new Date())) return null;
  const category = categoryById(data, categoryId);
  return typeof category.budget === "number" && category.budget > 0 ? roundMoney(category.budget) : null;
}

// Progresso do mês (0..1); usado para projetar o gasto até o fechamento.

function monthProgress(monthKey) {
  const now = new Date();
  const currentKey = keyOfDate(now);
  if (monthKey > currentKey) return { elapsed: 0, ratio: 0, daysInMonth: 30, daysLeft: 30, isCurrent: false, isFuture: true };
  const [y, m] = monthKey.split("-").map(Number);
  const dim = daysInMonthOf(y, m - 1);
  if (monthKey < currentKey) return { elapsed: dim, ratio: 1, daysInMonth: dim, daysLeft: 0, isCurrent: false, isFuture: false };
  const day = now.getDate();
  // HOJE CONTA. `daysLeft` alimenta a frase "restam R$ X; cerca de R$ Y por
  // dia", que é conselho para um período que INCLUI o dia de hoje: são 8h da
  // manhã do dia 27 e o almoço ainda não aconteceu. Com `dim - day` o dia 27
  // sumia da divisão, o valor diário saía inflado e, no último dia do mês,
  // `daysLeft` virava 0 e a frase desaparecia justo quando ainda havia um dia
  // inteiro para gastar. `insights.js` já contava assim; era esta linha que
  // fazia a mesma tela dizer "4 dias" num cartão e "5 dias" no outro.
  return { elapsed: day, ratio: day / dim, daysInMonth: dim, daysLeft: Math.max(1, dim - day + 1), isCurrent: true, isFuture: false };
}

// ------------------------------------------------------------------------------
// Estado completo dos orçamentos do mês.
// Retorna { items, thresholds, counts, totals }. `items` já vem ordenado com os
// casos mais críticos primeiro, que é a ordem em que a UI deve exibir.
// ------------------------------------------------------------------------------
function computeBudgetStatus(data, monthKey) {
  const mKey = monthKey || keyOfDate(new Date());
  const thresholds = budgetThresholds(data, mKey);
  const progress = monthProgress(mKey);

  const items = (data.categories || [])
    .filter((c) => budgetForCategory(data, c.id, mKey) > 0)
    .map((c) => {
      const spent = spentForCategory(data, c.id, mKey);
      const budget = budgetForCategory(data, c.id, mKey);
      const pct = safePct(spent, budget);
      const level = budgetLevelOf(pct, thresholds);
      const remaining = subMoney(budget, spent);
      // Projeção linear: se manter este ritmo, quanto fecha o mês?
      const projected = progress.ratio > 0 ? divMoney(spent, progress.ratio) : spent;
      const projectedPct = safePct(projected, budget);
      const willExceed = level === BUDGET_LEVELS.OK && progress.isCurrent && projectedPct >= thresholds.over;
      const children = childCategories(data, c.id);
      return {
        id: c.id,
        name: c.name,
        fullName: categoryFullName(data, c.id),
        color: c.color,
        icon: c.icon,
        group: typeof categoryGroupForMonth === "function" ? categoryGroupForMonth(data, c.id, mKey) : c.group,
        isParent: children.length > 0,
        childCount: children.length,
        budget, spent, remaining, pct,
        level,
        levelMeta: BUDGET_LEVEL_META[level],
        projected, projectedPct, willExceed,
        // Quanto ainda cabe por dia sem estourar (só faz sentido no mês corrente).
        dailyAllowance: progress.isCurrent && remaining > 0 && progress.daysLeft > 0
          ? divMoney(remaining, progress.daysLeft)
          : null,
        daysLeft: progress.daysLeft,
      };
    })
    .sort((a, b) => {
      const rank = { over: 0, warn: 1, ok: 2 };
      if (rank[a.level] !== rank[b.level]) return rank[a.level] - rank[b.level];
      return b.pct - a.pct;
    });

  // Totais consideram apenas tetos "raiz" para não contar duas vezes o gasto de
  // uma subcategoria que também tem teto próprio dentro de uma mãe com teto.
  const rootItems = items.filter((it) => {
    const snapshot = typeof budgetSnapshotAt === "function" ? budgetSnapshotAt(data, mKey) : null;
    const parentId = snapshot ? snapshot.parents[it.id] : categoryById(data, it.id).parentId;
    if (!parentId) return true;
    return !items.some((other) => other.id === parentId);
  });

  return {
    monthKey: mKey,
    thresholds,
    progress,
    items,
    counts: {
      total: items.length,
      ok: items.filter((i) => i.level === BUDGET_LEVELS.OK).length,
      warn: items.filter((i) => i.level === BUDGET_LEVELS.WARN).length,
      over: items.filter((i) => i.level === BUDGET_LEVELS.OVER).length,
      atRisk: items.filter((i) => i.willExceed).length,
    },
    totals: {
      budget: sumMoney(rootItems, (i) => i.budget),
      spent: sumMoney(rootItems, (i) => i.spent),
      remaining: sumMoney(rootItems, (i) => i.remaining),
    },
  };
}

// Atalho: status de UMA categoria (null se ela não tem teto e nenhuma ancestral tem).

function budgetStatusFor(data, categoryId, monthKey) {
  const status = computeBudgetStatus(data, monthKey);
  const direct = status.items.find((i) => i.id === categoryId);
  if (direct) return direct;
  const snapshot = typeof budgetSnapshotAt === "function" ? budgetSnapshotAt(data, monthKey) : null;
  const parentId = snapshot ? snapshot.parents[categoryId] : categoryById(data, categoryId).parentId;
  if (parentId) return status.items.find((i) => i.id === parentId) || null;
  return null;
}

// ------------------------------------------------------------------------------
// Impacto de um lançamento ANTES de salvar.
// Alimenta (a) o aviso ao vivo no formulário e (b) o toast pós-salvamento.
// Só retorna os tetos que MUDAM DE FAIXA por causa deste gasto; avisar sobre um
// teto que já estava estourado antes só gera ruído.
// ------------------------------------------------------------------------------
function evaluateBudgetImpact(data, categoryId, amount, monthKey) {
  const value = roundMoney(amount);
  if (!categoryId || !(value > 0)) return { crossings: [], affected: [] };

  const mKey = monthKey || keyOfDate(new Date());
  const thresholds = budgetThresholds(data, mKey);
  const cat = categoryById(data, categoryId);

  // Um gasto afeta o teto da própria categoria e o da categoria-mãe.

  const targets = [categoryId];
  if (cat.parentId) targets.push(cat.parentId);

  const crossings = [];
  const affected = [];

  targets.forEach((targetId) => {
    const target = categoryById(data, targetId);
    const configuredBudget = budgetForCategory(data, targetId, mKey);
    if (!(configuredBudget > 0)) return;

    const budget = configuredBudget;
    const before = spentForCategory(data, targetId, mKey);
    const after = addMoney(before, value);
    const pctBefore = safePct(before, budget);
    const pctAfter = safePct(after, budget);
    const levelBefore = budgetLevelOf(pctBefore, thresholds);
    const levelAfter = budgetLevelOf(pctAfter, thresholds);

    const entry = {
      categoryId: targetId,
      name: target.name,
      fullName: categoryFullName(data, targetId),
      color: target.color,
      icon: target.icon,
      budget, before, after,
      pctBefore, pctAfter,
      levelBefore, levelAfter,
      levelMeta: BUDGET_LEVEL_META[levelAfter],
      remaining: subMoney(budget, after),
      over: after > budget ? subMoney(after, budget) : 0,
      inherited: targetId !== categoryId,
    };
    affected.push(entry);
    if (levelAfter !== levelBefore && levelAfter !== BUDGET_LEVELS.OK) crossings.push(entry);
  });

  // O caso mais grave primeiro.

  crossings.sort((a, b) => (a.levelAfter === BUDGET_LEVELS.OVER ? -1 : 1) - (b.levelAfter === BUDGET_LEVELS.OVER ? -1 : 1));
  return { crossings, affected, thresholds };
}

// Mensagem curta e humana para um cruzamento de faixa (usada no toast e no aviso).

function budgetCrossingMessage(entry, thresholds) {
  const th = thresholds || { warn: 80, over: 100 };
  if (entry.levelAfter === BUDGET_LEVELS.OVER) {
    return `${entry.fullName}: este gasto estoura o teto de ${fmtBRL(entry.budget)} em ${fmtBRL(entry.over)}.`;
  }
  return `${entry.fullName}: você chega a ${Math.round(entry.pctAfter)}% do teto de ${fmtBRL(entry.budget)} (alerta em ${th.warn}%).`;
}

// ------------------------------------------------------------------------------
// Alertas prontos para o Assistente financeiro (assistant.js) e para o dashboard.
// ------------------------------------------------------------------------------
function budgetAlerts(data, monthKey) {
  const status = computeBudgetStatus(data, monthKey);
  const alerts = [];

  status.items.forEach((item) => {
    if (item.level === BUDGET_LEVELS.OVER) {
      alerts.push({
        id: `budget-over-${item.id}`,
        severity: "danger",
        icon: "alertTriangle",
        title: `Orçamento de "${item.fullName}" estourado`,
        message: `${fmtBRL(item.spent)} gastos contra um teto de ${fmtBRL(item.budget)}. ${fmtBRL(Math.abs(item.remaining))} acima (${Math.round(item.pct)}%).`,
        categoryId: item.id,
      });
    } else if (item.level === BUDGET_LEVELS.WARN) {
      alerts.push({
        id: `budget-warn-${item.id}`,
        severity: "warn",
        icon: "alertTriangle",
        title: `"${item.fullName}" já usou ${Math.round(item.pct)}% do orçamento`,
        message: item.dailyAllowance != null
          ? `Restam ${fmtBRL(item.remaining)} para ${plural(item.daysLeft, "dia", "dias")}; cerca de ${fmtBRL(item.dailyAllowance)} por dia.`
          : `Restam ${fmtBRL(item.remaining)} até o fim do mês.`,
        categoryId: item.id,
      });
    } else if (item.willExceed) {
      alerts.push({
        id: `budget-pace-${item.id}`,
        severity: "info",
        icon: "trendUp",
        title: `No ritmo atual, "${item.fullName}" estoura o teto`,
        message: `Você gastou ${fmtBRL(item.spent)} em ${plural(status.progress.elapsed, "dia", "dias")}. Mantendo o ritmo, fecha o mês em ${fmtBRL(item.projected)} contra o teto de ${fmtBRL(item.budget)}.`,
        categoryId: item.id,
      });
    }
  });

  return alerts;
}

// Sugestão de teto para uma categoria que ainda não tem: média dos 3 meses
// anteriores, arredondada para cima em múltiplos de R$ 10 (número "redondo" é
// mais fácil de aceitar do que R$ 487,33).
function suggestBudgetFor(data, categoryId) {
  const now = new Date();
  let cents = 0, months = 0;
  for (let i = 1; i <= 3; i++) {
    const key = keyOfDate(addMonths(now, -i));
    const spent = spentForCategory(data, categoryId, key);
    if (spent > 0) { cents += moneyToCents(spent); months++; }
  }
  if (months === 0) return null;
  const avg = moneyFromCents(Math.round(cents / months));
  return Math.max(10, Math.ceil(avg / 10) * 10);
}

// ------------------------------------------------------------------------------
// SEMEADURA DE TETOS A PARTIR DA REGRA x/x/x
// ------------------------------------------------------------------------------
// `suggestBudgetFor` acima resolve o caso de quem JÁ TEM histórico: ele olha os
// três meses anteriores e devolve uma média. No primeiro dia de uso não existe
// mês anterior nenhum, então ele devolve null para tudo e o usuário termina a
// configuração inicial com a regra 50/30/20 escolhida e ZERO teto definido.
//
// O efeito é que o motor deste arquivo inteiro (as faixas de 80% e 100%, a
// projeção de ritmo, o cartão de orçamentos) fica dormindo até a pessoa digitar
// teto por teto na mão. Escolher um modelo de divisão vira decoração.
//
// Esta parte fecha esse buraco pelo outro lado: sem histórico, mas COM renda e
// COM a regra escolhida, dá para propor um teto por categoria. O número não vem
// do passado da pessoa, vem da divisão que ela mesma acabou de escolher.
//
// Três decisões que valem a explicação:
//
//  1. SÓ CATEGORIAS PRINCIPAIS. O gasto de uma subcategoria já conta para o teto
//     da mãe (ver spentForCategory). Semear as duas criaria dois tetos medindo o
//     mesmo gasto, e o total do cartão contaria duas vezes.
//
//  2. O QUE JÁ TEM TETO É INTOCÁVEL, e o valor dele SAI da cota do grupo. Se
//     Moradia já tem R$ 2.000 dos R$ 3.000 de Necessidades, as outras dividem os
//     R$ 1.000 que sobraram, não os R$ 3.000 inteiros. Ignorar isso proporia um
//     orçamento que estoura a renda no papel, antes de qualquer gasto.
//
//  3. PESOS, NÃO PARTES IGUAIS. Moradia e Assinaturas não cabem no mesmo tamanho.
//     Os pesos abaixo são um ponto de partida do app para um domicílio urbano
//     brasileiro típico, não uma regra de mercado nem critério de aprovação de
//     crédito: são relativos DENTRO do grupo e a pessoa ajusta cada linha depois.
const BUDGET_SEED_WEIGHTS = {
  // Necessidades
  moradia: 40, alimentacao: 30, transporte: 15, saude: 10, educacao: 5,
  // Desejos
  lazer: 50, assinaturas: 25, outros: 25,
  // Futuro
  investimento: 100,
};

// Categoria criada pelo usuário não está na tabela. Um peso médio dá a ela uma
// fatia real sem deixá-la dominar o grupo; a normalização cuida do resto.
const BUDGET_SEED_DEFAULT_WEIGHT = 10;

function budgetSeedWeightOf(category) {
  const w = BUDGET_SEED_WEIGHTS[category && category.id];
  return typeof w === "number" && w > 0 ? w : BUDGET_SEED_DEFAULT_WEIGHT;
}

function budgetSeedGroupOf(category) {
  return BUDGET_GROUPS.includes(category && category.group) ? category.group : "necessidade";
}

function hasBudgetCeiling(category) {
  return !!category && typeof category.budget === "number" && category.budget > 0;
}

// Devolve o que SERIA gravado, sem gravar nada. A tela usa isso para mostrar a
// prévia antes de o usuário confirmar, e a gravação usa o mesmo resultado, para
// prévia e efeito nunca discordarem.
//
// Formato: { income, groups: [...], items: [...], kept: [...] }
//   items  categorias que receberiam teto novo
//   kept   categorias preservadas porque já tinham teto
function seedBudgetsFromSplit(data, income, split) {
  const renda = roundMoney(Number(income) || 0);
  const regra = { ...defaultBudgetSplit(), ...(split || {}) };
  const groups = [], items = [], kept = [];
  if (!(renda > 0)) return { income: 0, groups, items, kept };

  const principais = (data && data.categories ? data.categories : []).filter((c) => !c.parentId);

  BUDGET_GROUPS.forEach((group) => {
    const pct = Number(regra[group]) || 0;
    const allocated = mulMoney(renda, pct / 100);
    const doGrupo = principais.filter((c) => budgetSeedGroupOf(c) === group);
    const comTeto = doGrupo.filter(hasBudgetCeiling);
    const semTeto = doGrupo.filter((c) => !hasBudgetCeiling(c));
    const committed = sumMoney(comTeto, (c) => c.budget);
    const available = subMoney(allocated, committed);

    comTeto.forEach((c) => kept.push({ categoryId: c.id, name: c.name, group, budget: roundMoney(c.budget) }));

    const novos = [];
    if (available > 0 && semTeto.length > 0) {
      const fatias = splitMoneyByWeights(available, semTeto.map(budgetSeedWeightOf));
      semTeto.forEach((c, i) => {
        // Uma fatia de zero não é teto: gravar R$ 0,00 faria a categoria nascer
        // permanentemente estourada, com alerta vermelho no primeiro gasto.
        if (!(fatias[i] > 0)) return;
        const item = { categoryId: c.id, name: c.name, icon: c.icon, color: c.color, group, budget: fatias[i] };
        novos.push(item);
        items.push(item);
      });
    }

    groups.push({ group, pct, allocated, committed, available, items: novos, keptCount: comTeto.length });
  });

  return { income: renda, groups, items, kept };
}

// Aplica a semeadura devolvendo uma lista NOVA de categorias. Puro: não grava,
// não toca no DOM, e a checagem de teto existente é refeita aqui de propósito;
// se a prévia foi calculada antes de o usuário digitar um teto na outra aba, é
// esta segunda checagem que impede o valor dele de ser sobrescrito.
function categoriesWithSeededBudgets(categories, seeds) {
  const porId = new Map();
  ((seeds && seeds.items) || []).forEach((s) => porId.set(s.categoryId, s.budget));
  if (porId.size === 0) return categories || [];
  return (categories || []).map((c) => {
    if (!porId.has(c.id) || hasBudgetCeiling(c)) return c;
    return { ...c, budget: porId.get(c.id) };
  });
}
