// score.js. SCORE FINANCEIRO (motor puro, sem DOM, sem rede)
// ------------------------------------------------------------------------------
// Uma nota de 0 a 100 que responde a uma pergunta só: "a minha vida financeira
// está indo bem?". O valor sozinho não serve para nada; por isso todo pilar
// devolve, junto com os pontos, o MOTIVO em linguagem humana.
//
// Desenho do cálculo:
//   • Cada pilar tem um peso máximo e uma função que devolve 0..1 (`ratio`).
//   • Pilares que não podem ser avaliados (ex: sem renda cadastrada) são
//     marcados como `applicable: false` e SAEM da conta; a nota é normalizada
//     sobre o peso do que foi realmente avaliado. Isso evita o pior defeito de
//     scores caseiros: punir o usuário por um dado que ele ainda não informou.
//   • Nada aqui grava dado nenhum. É função pura de (data, monthKey) → objeto.
"use strict";

const SCORE_LEVELS = [
  { min: 85, id: "excelente", label: "Excelente", color: "var(--positive)", note: "Sua vida financeira está sob controle." },
  { min: 70, id: "bom",       label: "Bom",       color: "var(--brand)",    note: "Boa base; dá para avançar com pequenos ajustes." },
  { min: 50, id: "regular",   label: "Regular",   color: "var(--goal)",     note: "Existe equilíbrio, mas com pontos frágeis." },
  { min: 30, id: "atencao",   label: "Atenção",   color: "var(--goal)",     note: "Alguns hábitos estão comprometendo seus resultados." },
  { min: 0,  id: "critico",   label: "Crítico",   color: "var(--negative)", note: "Prioridade agora é estancar o desequilíbrio." },
];

function scoreLevelOf(score) {
  return SCORE_LEVELS.find((l) => score >= l.min) || SCORE_LEVELS[SCORE_LEVELS.length - 1];
}

// Interpolação linear com trava em 0..1; usada por quase todos os pilares.

function scoreRamp(value, worst, best) {
  if (!Number.isFinite(value)) return 0;
  if (best === worst) return value >= best ? 1 : 0;
  return clamp((value - worst) / (best - worst), 0, 1);
}

// Par COMPATÍVEL de renda e gasto para os pilares que medem o mês.
//
// O defeito que isto corrige: os pilares comparavam a renda planejada do mês
// INTEIRO com o gasto realizado até HOJE. No dia 3, com R$ 5.000 planejados e
// R$ 200 gastos, o app dava nota máxima em poupança e em "gastos x renda".
// Nota alta por ainda não ter chegado o dia 10 não é informação, é elogio
// falso. Agora:
//
//   mês fechado  -> realizado contra realizado;
//   mês corrente -> projetado contra projetado, marcado como parcial;
//   sem base     -> pilar não avaliado (sai da conta, não zera a nota).
function scoreMonthBasis(ctx) {
  const m = (ctx && ctx.month) || {};
  if (m.partial) {
    return {
      income: m.incomeProjected || 0,
      expense: m.projectedExpense || 0,
      savings: m.projectedSavings || 0,
      rate: m.projectedSavingsRate,
      partial: true,
      basis: "projetada",
    };
  }
  return {
    income: m.incomeRealized || 0,
    expense: m.expense || 0,
    savings: m.savings || 0,
    rate: m.savingsRate,
    partial: false,
    basis: "realizada",
  };
}

// Sufixo honesto para o texto do pilar. Mês corrente é estimativa, e dizer isso
// custa cinco palavras.
function scoreBasisNote(basis) {
  return basis.partial ? " Estimativa do fechamento; o mês ainda não terminou." : "";
}

/* ==============================================================================
 * PILARES
 * ============================================================================== */

// Cada pilar: (data, monthKey, ctx) → { applicable, ratio, detail }
// `ctx` traz os cálculos já feitos pelo metrics.js para não repetir trabalho.
const SCORE_PILLARS = [
  {
    id: "poupanca",
    label: "Percentual economizado",
    weight: 25,
    icon: "piggy",
    evaluate(data, mKey, ctx) {
      const base = scoreMonthBasis(ctx);
      // Sem renda com que comparar, o pilar sai da conta em vez de dar zero.
      if (base.income <= 0 || base.rate == null) return { applicable: false };
      const ratio = scoreRamp(base.rate, 0, 20);   // 20% da renda = pontuação cheia
      const fechado = base.partial ? "deve fechar o mês" : "fechou o mês";
      return {
        applicable: true,
        ratio,
        partial: base.partial,
        good: base.rate >= 15,
        detail: base.savings > 0
          ? `Você economizou ${fmtBRL(base.savings)} (${base.rate.toFixed(0)}% da renda ${base.basis}).${scoreBasisNote(base)}`
          : `Você ${fechado} no vermelho em ${fmtBRL(Math.abs(base.savings))}.${scoreBasisNote(base)}`,
        advice: base.rate >= 15 ? null : "Se 15% couber no seu mês sem criar dívida, use essa faixa como primeiro objetivo e ajuste depois.",
      };
    },
  },
  {
    id: "gastos",
    label: "Gastos x renda",
    weight: 15,
    icon: "wallet",
    evaluate(data, mKey, ctx) {
      const base = scoreMonthBasis(ctx);
      if (base.income <= 0) return { applicable: false };
      const burn = safePct(base.expense, base.income);
      const ratio = scoreRamp(burn, 110, 70);        // ≤70% da renda = cheio; ≥110% = zero
      return {
        applicable: true,
        ratio,
        partial: base.partial,
        good: burn <= 85,
        detail: `Seus gastos consomem ${burn.toFixed(0)}% da renda ${base.basis} do mês.${scoreBasisNote(base)}`,
        advice: burn <= 85 ? null : "Reduzir para até 85% da renda já libera folga para poupar sem apertar o essencial.",
      };
    },
  },
  {
    id: "reserva",
    label: "Reserva de emergência",
    weight: 20,
    icon: "shieldCheck",
    evaluate(data, mKey, ctx) {
      const r = ctx.reserve;
      if (r.monthlyNeed <= 0 && r.current <= 0) return { applicable: false };
      const ratio = scoreRamp(r.monthsCovered, 0, r.targetMonths);
      const months = r.monthsCovered;
      return {
        applicable: true,
        ratio,
        good: months >= r.targetMonths,
        detail: r.current > 0
          ? `Sua reserva cobre ${fmtDec(months, 1)} ${months < 2 ? "mês" : "meses"} de despesas (alvo: ${r.targetMonths}).`
          : "Você ainda não tem reserva de emergência formada.",
        advice: months >= r.targetMonths ? null : `Faltam ${fmtBRL(Math.max(0, subMoney(r.target, r.current)))} para chegar aos ${r.targetMonths} meses de segurança.`,
      };
    },
  },
  {
    id: "investimento",
    label: "Percentual investido",
    weight: 15,
    icon: "trendUp",
    evaluate(data, mKey, ctx) {
      const { income } = ctx.month;
      if (income <= 0) return { applicable: false };
      const invested = spentForCategory(data, "investimento", mKey);
      const pct = safePct(invested, income);
      const ratio = scoreRamp(pct, 0, 10);           // 10% da renda investida = cheio
      return {
        applicable: true,
        ratio,
        good: pct >= 8,
        detail: invested > 0
          ? `Você direcionou ${fmtBRL(invested)} (${pct.toFixed(0)}% da renda) para investimentos e metas.`
          : "Nenhum aporte em investimentos ou metas neste mês.",
        advice: pct >= 8 ? null : "Um aporte automático de 10% da renda no dia do salário resolve isso sem esforço mensal.",
      };
    },
  },
  {
    id: "patrimonio",
    label: "Crescimento patrimonial",
    weight: 10,
    icon: "layout",
    evaluate(data, mKey, ctx) {
      const series = netWorthSeries(data, 4);
      const first = series[0].value;
      const last = series[series.length - 1].value;
      if (Math.abs(first) < 1 && Math.abs(last) < 1) return { applicable: false };
      const growth = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : (last > 0 ? 100 : 0);
      const ratio = scoreRamp(growth, -10, 10);      // −10% = zero, +10% no trimestre = cheio
      return {
        applicable: true,
        ratio,
        good: growth >= 0,
        growth,
        detail: growth >= 0
          ? `Seu patrimônio cresceu ${fmtDec(growth, 1)}% nos últimos meses, até ${fmtBRL(last)}.`
          : `Seu patrimônio recuou ${fmtDec(Math.abs(growth), 1)}% nos últimos meses.`,
        advice: growth >= 0 ? null : "Patrimônio caindo com renda estável costuma significar consumo do que já foi guardado.",
      };
    },
  },
  {
    id: "pontualidade",
    label: "Contas em dia",
    weight: 10,
    icon: "bell",
    evaluate(data, mKey, ctx) {
      const late = ctx.bills.lateCount;
      const scheduled = ctx.bills.items.length;
      if (scheduled === 0 && late === 0) return { applicable: false };
      const ratio = late === 0 ? 1 : clamp(1 - late * 0.34, 0, 1);
      return {
        applicable: true,
        ratio,
        good: late === 0,
        detail: late === 0
          ? "Nenhuma conta fixa em atraso neste mês."
          : `${late} conta${late > 1 ? "s" : ""} fixa${late > 1 ? "s" : ""} do mês passado ainda não foi lançada e já passou da data.`,
        advice: late === 0 ? null : "Lance ou quite as contas atrasadas para não acumular juros e multas.",
      };
    },
  },
  {
    id: "credito",
    label: "Uso do crédito",
    weight: 5,
    icon: "creditCard",
    evaluate(data, mKey, ctx) {
      const { income } = ctx.month;
      if (income <= 0) return { applicable: false };
      const credit = creditSpentInMonth(data, mKey);
      if (credit <= 0) return { applicable: true, ratio: 1, good: true, detail: "Você não comprometeu nada no cartão de crédito este mês." };
      const pct = safePct(credit, income);
      const ratio = scoreRamp(pct, 60, 25);          // ≤25% da renda = cheio; ≥60% = zero
      return {
        applicable: true,
        ratio,
        good: pct <= 30,
        detail: `A fatura do cartão já consome ${pct.toFixed(0)}% da sua renda (${fmtBRL(credit)}).`,
        advice: pct <= 30 ? null : "Acima da faixa de 30% usada pelo app, o cartão já ocupa uma parte relevante do próximo mês.",
      };
    },
  },
];

/* ==============================================================================
 * CÁLCULO
 * ============================================================================== */

// `ctx` é opcional: quando o dashboard já calculou mês/patrimônio/reserva/contas,
// passamos adiante para não refazer as mesmas varreduras.
function buildScoreContext(data, monthKey, ctx) {
  const c = ctx || {};
  return {
    month: c.month || monthSnapshot(data, monthKey),
    worth: c.worth || netWorth(data),
    reserve: c.reserve || emergencyFund(data),
    bills: c.bills || upcomingBills(data),
  };
}

function computeFinanceScore(data, monthKey, ctx) {
  const mKey = monthKey || keyOfDate(new Date());
  const context = buildScoreContext(data, mKey, ctx);

  const results = SCORE_PILLARS.map((p) => {
    let out;
    try { out = p.evaluate(data, mKey, context) || { applicable: false }; }
    catch (e) { out = { applicable: false }; }      // um pilar quebrado nunca derruba o score
    return {
      id: p.id, label: p.label, weight: p.weight, icon: p.icon,
      applicable: !!out.applicable,
      ratio: out.applicable ? clamp(Number(out.ratio) || 0, 0, 1) : 0,
      points: out.applicable ? roundMoney(p.weight * clamp(Number(out.ratio) || 0, 0, 1)) : 0,
      good: !!out.good,
      detail: out.detail || "",
      advice: out.advice || null,
    };
  });

  const applicable = results.filter((r) => r.applicable);
  const maxWeight = applicable.reduce((s, r) => s + r.weight, 0);
  const earned = applicable.reduce((s, r) => s + r.points, 0);

  // Sem base nenhuma: não inventamos nota; a UI mostra um convite, não um zero.

  const insufficient = maxWeight === 0 || (context.month.txCount === 0 && context.worth.total === 0);
  const score = insufficient ? null : Math.round(clamp((earned / maxWeight) * 100, 0, 100));
  const level = insufficient ? null : scoreLevelOf(score);

  const strengths = applicable.filter((r) => r.good).sort((a, b) => b.points - a.points);
  const weaknesses = applicable.filter((r) => !r.good).sort((a, b) => (b.weight * (1 - b.ratio)) - (a.weight * (1 - a.ratio)));

  return {
    score, level, insufficient,
    coverage: Math.round((maxWeight / SCORE_PILLARS.reduce((s, p) => s + p.weight, 0)) * 100),
    pillars: results,
    strengths,
    weaknesses,
    // Lista pronta para exibição: pontos fortes primeiro, depois o que puxa a nota.
    reasons: strengths.slice(0, 2).map((r) => ({ tone: "positive", icon: r.icon, text: r.detail }))
      .concat(weaknesses.slice(0, 3).map((r) => ({ tone: "warn", icon: r.icon, text: r.detail, advice: r.advice }))),
  };
}
