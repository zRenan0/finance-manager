// wealth.js. EVOLUÇÃO PATRIMONIAL (motor puro, sem DOM, sem rede)  [Módulo 3]
// ------------------------------------------------------------------------------
// Responsabilidade única: transformar o snapshot em um modelo de leitura da tela
// Patrimônio; composição de hoje, série mensal, comparação anual, distribuição
// por classe e as listas de bens e dívidas.
//
// O que este arquivo NÃO faz: não guarda dado (isso é storage.js), não decide
// cor nem layout (isso é app.js/CSS) e não recalcula o que metrics.js já sabe :
// `netWorth`, `netWorthSeries` e o acumulador de lançamentos são reaproveitados.
//
// Convenção de patrimônio (a mesma do resto do app):
//   Patrimônio líquido = Caixa + Investimentos + Metas + Outros bens − Dívidas
// onde Caixa vem dos lançamentos e os demais blocos vêm do cadastro do Módulo 3
// (com a estimativa por lançamentos servindo de reserva quando não há cadastro).
"use strict";

const WEALTH_MONTHS = 12;

/* ==============================================================================
 * COMPOSIÇÃO DE HOJE
 * ============================================================================== */

// Blocos positivos + o bloco negativo, já prontos para a barra segmentada e a
// legenda. Caixa negativo vira um bloco de dívida, não um pedaço de patrimônio.
function wealthComposition(data, worth) {
  const w = worth || netWorth(data);
  const positive = [
    { id: "cash",     label: "Caixa",         value: Math.max(0, w.cash), color: "var(--brand)",    icon: "wallet",
      note: "Saldo dos seus lançamentos até hoje." },
    { id: "invested", label: "Investimentos", value: w.invested,          color: "#1F8A5F",         icon: "trendUp",
      note: hasRegisteredInvestments(data) ? "Carteira cadastrada em Patrimônio." : "Estimativa pelos aportes lançados." },
    { id: "goals",    label: "Metas",         value: w.goals,             color: "var(--goal)",     icon: "target",
      note: "Dinheiro já separado para objetivos." },
    { id: "other",    label: "Bens",          value: Math.max(0, w.other), color: "#8A5FBF",        icon: "home",
      note: "Imóveis, veículos e outros bens cadastrados." },
  ].filter((b) => b.value > 0);

  const negative = [
    { id: "liabilities", label: "Dívidas", value: w.registeredLiabilities,     color: "var(--negative)", icon: "alertTriangle" },
    { id: "cards", label: "Faturas abertas", value: w.cardLiabilities,          color: "var(--negative)", icon: "creditCard" },
    { id: "overdraft", label: "Saldo negativo", value: Math.max(0, -w.cash),    color: "var(--negative)", icon: "alertTriangle" },
  ].filter((b) => b.value > 0);

  const gross = sumMoney(positive, (b) => b.value);
  const debts = sumMoney(negative, (b) => b.value);
  return {
    positive: positive.map((b) => ({ ...b, pct: gross > 0 ? safePct(b.value, gross) : 0 })),
    negative,
    gross,
    debts,
    net: subMoney(gross, debts),
  };
}

/* ==============================================================================
 * VARIAÇÕES E COMPARAÇÃO ANUAL
 * ============================================================================== */

function wealthDelta(from, to) {
  const value = subMoney(to, from);
  const pct = from !== 0 ? (value / Math.abs(from)) * 100 : (to > 0 ? 100 : 0);
  return { from, to, value, pct, up: value >= 0, comparable: from !== 0 };
}

// Comparação anual em duas leituras: (a) hoje contra o mesmo mês do ano passado,
// (b) o fechamento de cada ano civil. O ano corrente entra como parcial.
function wealthAnnual(data, acc) {
  const a = acc || ledgerAccumulator(data);
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = netWorth(data).total;

  const sameMonthLastYear = keyOfDate(addMonths(now, -12));
  const yoy = wealthDelta(netWorthAtMonthEnd(data, sameMonthLastYear, a), today);

  const years = [];
  for (let y = currentYear - 3; y <= currentYear; y++) {
    const isCurrent = y === currentYear;
    const key = isCurrent ? keyOfDate(now) : `${y}-12`;
    const value = isCurrent ? today : netWorthAtMonthEnd(data, key, a);
    const prev = netWorthAtMonthEnd(data, `${y - 1}-12`, a);
    years.push({ year: y, isCurrent, value, delta: wealthDelta(prev, value) });
  }

  // Anos anteriores ao primeiro lançamento não dizem nada; saem da comparação.

  const firstMeaningful = years.findIndex((r) => r.value !== 0 || r.delta.value !== 0);
  const trimmed = firstMeaningful === -1 ? years.slice(-1) : years.slice(firstMeaningful);

  const ytdBase = netWorthAtMonthEnd(data, `${currentYear - 1}-12`, a);
  return { yoy, years: trimmed, ytd: wealthDelta(ytdBase, today) };
}

/* ==============================================================================
 * LISTAS POR CLASSE
 * ============================================================================== */

// Agrupa o cadastro por classe, na ordem de ASSET_CLASSES, com subtotal e a
// variação de cada item em relação ao valor registrado no mês anterior.
function wealthGroups(data) {
  const prevKey = keyOfDate(addMonths(new Date(), -1));
  const all = data.assets || [];
  return ASSET_CLASSES.map((cls) => {
    const items = all
      .filter((a) => a.class === cls.id)
      .map((a) => {
        const before = assetValueAt(a, prevKey);
        return {
          ...a,
          previous: before,
          change: before > 0 ? wealthDelta(before, a.value) : null,
          points: (a.history || []).length,
        };
      })
      .sort((x, y) => y.value - x.value);
    return {
      ...cls,
      items,
      total: sumMoney(items.filter((i) => !i.inLedger), (i) => i.value),
      informative: sumMoney(items.filter((i) => i.inLedger), (i) => i.value),
    };
  }).filter((g) => g.items.length > 0);
}

/* ==============================================================================
 * LEITURA EM LINGUAGEM HUMANA
 * ============================================================================== */

function wealthInsights(data, model) {
  const out = [];
  const { series, delta, annual, composition, worth } = model;

  if (delta.year.comparable && Math.abs(delta.year.pct) >= 1) {
    out.push({
      icon: delta.year.up ? "arrowUpRight" : "arrowDownRight",
      tone: delta.year.up ? "positive" : "danger",
      text: `Em 12 meses seu patrimônio ${delta.year.up ? "cresceu" : "recuou"} ${fmtBRL(Math.abs(delta.year.value))} (${delta.year.up ? "+" : "−"}${Math.abs(delta.year.pct).toFixed(1)}%).`,
    });
  }

  if (delta.month.comparable && Math.abs(delta.month.value) > 0) {
    out.push({
      icon: "layout",
      tone: delta.month.up ? "positive" : "warn",
      text: `No último mês a variação foi de ${delta.month.up ? "+" : "−"}${fmtBRL(Math.abs(delta.month.value))}.`,
    });
  }

  if (worth.liabilities > 0) {
    const share = composition.gross > 0 ? safePct(worth.liabilities, composition.gross) : 100;
    out.push({
      icon: "alertTriangle",
      tone: share >= 50 ? "danger" : "warn",
      text: `Suas dívidas e faturas abertas somam ${fmtBRL(worth.liabilities)}. Isso representa ${share.toFixed(0)}% de tudo que você acumulou.`,
    });
  }

  const invShare = composition.gross > 0 ? safePct(worth.invested, composition.gross) : 0;
  if (composition.gross > 0) {
    out.push({
      icon: "trendUp",
      tone: invShare >= 30 ? "positive" : "neutral",
      text: invShare >= 30
        ? `${invShare.toFixed(0)}% do seu patrimônio está aplicado; proporção saudável para proteger o valor real.`
        : `Apenas ${invShare.toFixed(0)}% do seu patrimônio está aplicado. O restante perde para a inflação parado.`,
    });
  }

  // Meses sem nenhum ponto informado: o gráfico fica achatado e ninguém entende.

  const flat = series.length > 2 && series.every((p) => Math.abs(p.value - series[0].value) < 1);
  if (flat && (data.assets || []).length === 0) {
    out.push({
      icon: "info",
      tone: "neutral",
      text: "Cadastre seus bens e dívidas para que a curva deixe de refletir só o caixa dos lançamentos.",
    });
  }

  return out.slice(0, 4);
}

/* ==============================================================================
 * MODELO ÚNICO DA TELA
 * ============================================================================== */

function buildWealthModel(data, months) {
  const n = Math.max(3, Number(months) || WEALTH_MONTHS);
  const acc = ledgerAccumulator(data);
  const worth = netWorth(data);
  const series = netWorthSeries(data, n);

  const last = series[series.length - 1].value;
  const prevMonth = series.length > 1 ? series[series.length - 2].value : last;
  const sixBack = series.length > 6 ? series[series.length - 7].value : series[0].value;

  const model = {
    worth,
    composition: wealthComposition(data, worth),
    series,
    months: n,
    delta: {
      month: wealthDelta(prevMonth, last),
      sixMonths: wealthDelta(sixBack, last),
      year: wealthDelta(series[0].value, last),
    },
    annual: wealthAnnual(data, acc),
    allocation: assetAllocation(data),
    groups: wealthGroups(data),
    counts: {
      assets: countedAssets(data).length,
      liabilities: countedLiabilities(data).length,
      total: (data.assets || []).length,
    },
    monthlyPayment: liabilitiesMonthlyPayment(data),
    hasRegistry: (data.assets || []).length > 0,
    empty: (data.assets || []).length === 0 && Math.abs(worth.total) < 1,
  };
  model.insights = wealthInsights(data, model);
  return model;
}

/* Exportação para o harness de teste em Node (ignorada no navegador). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildWealthModel, wealthComposition, wealthAnnual, wealthGroups, wealthDelta };
}
