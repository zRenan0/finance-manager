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
  return { elapsed: day, ratio: day / dim, daysInMonth: dim, daysLeft: Math.max(0, dim - day), isCurrent: true, isFuture: false };
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
          ? `Restam ${fmtBRL(item.remaining)} para ${item.daysLeft} dia(s); cerca de ${fmtBRL(item.dailyAllowance)} por dia.`
          : `Restam ${fmtBRL(item.remaining)} até o fim do mês.`,
        categoryId: item.id,
      });
    } else if (item.willExceed) {
      alerts.push({
        id: `budget-pace-${item.id}`,
        severity: "info",
        icon: "trendUp",
        title: `No ritmo atual, "${item.fullName}" estoura o teto`,
        message: `Você gastou ${fmtBRL(item.spent)} em ${status.progress.elapsed} dia(s). Mantendo o ritmo, fecha o mês em ${fmtBRL(item.projected)} contra o teto de ${fmtBRL(item.budget)}.`,
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
