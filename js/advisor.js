// advisor.js. [M7] Central inteligente (a "IA Financeira" do briefing).
//
// Arquivo PURO: recebe o snapshot e os modelos já calculados, devolve uma lista
// de recomendações. Sem DOM, sem `state`, sem rede; e, principalmente, **sem
// nenhum cálculo financeiro novo**.
//
// Por que sem cálculo novo
// ------------------------
// Toda regra daqui consulta motores que já existem: `buildAnalyticsModel`
// (M7), `buildRecurringModel` (M7), `detectSilentLeaks`, `creditRiskAlert`,
// `emergencyFund`, `netWorthSeries`, `monthTotals` e os alertas de
// `getAssistantAlerts`. Duas fontes para o mesmo número seriam duas verdades
// sobre o mesmo dinheiro; o defeito que o Módulo 3 já teve de corrigir no
// patrimônio. Este arquivo é tradução: número → frase acionável.
//
// A "IA" do nome
// --------------
// Não há modelo de linguagem aqui, e é de propósito: recomendação financeira
// precisa ser determinística, auditável e funcionar offline. A chamada opcional
// à LLM continua existindo (`js/insights.js` → função Netlify), com payload
// anonimizado, e é um COMPLEMENTO; não a fonte das recomendações.
//
// Ordem de consultor
// ------------------
// As regras são ordenadas por (1) gravidade e (2) dinheiro em jogo. Um painel
// com quinze avisos não é um painel de prioridades; o teto é 8.
//
// Dependências: utils.js, storage.js, metrics.js, insights.js, assistant.js,
// analytics.js, recurring.js.
"use strict";

const ADV_TONE_ORDER = { danger: 0, warn: 1, info: 2, positive: 3 };
const ADV_MAX_ITEMS = 8;

// Limiares. Ficam juntos e nomeados porque são as opiniões do app; quem
// discordar sabe exatamente onde discordar.
const ADV = {
  categoryGrowthPct: 15,        // crescimento de categoria que merece aviso
  categoryGrowthMin: 60,        // …desde que valha ao menos isso em reais
  creditWarnShare: 35,          // % da renda no cartão que acende o amarelo
  creditDangerShare: 50,        // …e o vermelho
  weekendExcessPct: 30,         // fim de semana acima da média dos dias úteis
  subscriptionShare: 12,        // % da renda comprometida com assinaturas
  savingRateGood: 20,           // taxa de poupança considerada saudável
  paceOverPct: 8,               // ritmo do mês acima do mês anterior
  minSavingSuggestion: 50,      // não sugerimos "economize R$ 7"
};

function advCard(o) {
  return {
    id: o.id,
    tone: o.tone || "info",
    icon: o.icon || "sparkles",
    title: o.title,
    message: o.message,
    value: o.value == null ? null : o.value,
    impact: Math.abs(Number(o.impact) || 0),
    action: o.action || null,      // { label, tab }; a tela decide como desenhar
    detail: o.detail || null,
  };
}

// ------------------------------------------------------------------------------
// Regras
// ------------------------------------------------------------------------------
// Cada regra recebe um contexto único e devolve `null` ou um cartão. Assinatura
// uniforme para que a lista possa crescer sem tocar no orquestrador.
const ADVISOR_RULES = [
  // §10. "Você gastou 22% a mais com restaurantes."
  {
    id: "categoria-em-alta",
    run({ an }) {
      const top = (an.categories.grew || [])[0];
      if (!top || !top.comparable) return null;
      if (top.pct == null || top.pct < ADV.categoryGrowthPct) return null;
      if (top.diff < ADV.categoryGrowthMin) return null;
      return advCard({
        id: "categoria-em-alta",
        tone: top.pct >= 40 ? "warn" : "info",
        icon: top.icon || "arrowUpRight",
        title: `Você gastou ${top.pct.toFixed(0)}% a mais com ${top.name}`,
        message: `Foram ${fmtBRL(top.current)} contra ${fmtBRL(top.previous)} no mês anterior. ${fmtBRL(top.diff)} a mais.`,
        value: top.diff,
        impact: top.diff,
        action: { label: "Ver análise por categoria", tab: "analytics" },
      });
    },
  },

  // §10. "Seu mercado aumentou R$ 340." (o mesmo fato pelo lado absoluto,
  // exibido só quando a maior alta em REAIS não é a mesma da maior alta em %.)
  {
    id: "categoria-aumento-absoluto",
    run({ an }) {
      const rows = (an.categories.grew || []).filter((r) => r.comparable);
      if (rows.length < 2) return null;
      const byPct = rows.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0))[0];
      const byValue = rows[0];
      if (!byValue || byValue.id === byPct.id) return null;
      if (byValue.diff < ADV.categoryGrowthMin) return null;
      return advCard({
        id: "categoria-aumento-absoluto",
        tone: "info",
        icon: byValue.icon || "cart",
        title: `Seu ${byValue.name} aumentou ${fmtBRL(byValue.diff)}`,
        message: `Em reais, essa é a maior variação do mês: de ${fmtBRL(byValue.previous)} para ${fmtBRL(byValue.current)}.`,
        value: byValue.diff,
        impact: byValue.diff,
      });
    },
  },

  // §10. "Você pode economizar aproximadamente R$ 500 este mês."
  // A conta é o EXCESSO sobre o próprio hábito (média de 3 meses) nas categorias
  // de Desejo, mais os vazamentos silenciosos. Não é "corte 30% de tudo": é o
  // dinheiro que já foi identificado como fora do padrão da própria pessoa.
  {
    id: "potencial-economia",
    run({ plan }) {
      if (!plan || plan.total < ADV.minSavingSuggestion) return null;
      const top = plan.items.slice(0, 2).map((i) => i.name).join(" e ");
      return advCard({
        id: "potencial-economia",
        tone: "info",
        icon: "piggy",
        title: `Você pode economizar aproximadamente ${fmtBRL(plan.total)} este mês`,
        message: top
          ? `A maior parte está em ${top}, onde o gasto passou do seu próprio padrão dos últimos meses.`
          : "Esse é o quanto o mês está acima do seu padrão dos últimos meses.",
        value: plan.total,
        impact: plan.total,
        detail: plan.items.slice(0, 4),
      });
    },
  },

  // §10. "Seu cartão está consumindo 42% da renda."
  {
    id: "cartao",
    run({ data, monthKey, income }) {
      if (income <= 0) return null;
      const credit = creditSpentInMonth(data, monthKey);
      if (credit <= 0) return null;
      const share = safePct(credit, income);
      if (share < ADV.creditWarnShare) return null;
      return advCard({
        id: "cartao",
        tone: share >= ADV.creditDangerShare ? "danger" : "warn",
        icon: "creditCard",
        title: `Seu cartão está consumindo ${share.toFixed(0)}% da renda`,
        message: `${fmtBRL(credit)} dos seus gastos deste mês foram no crédito. Acima de ${ADV.creditDangerShare}% a fatura passa a comandar o mês seguinte.`,
        value: credit,
        impact: credit,
        action: { label: "Ver previsão de saldo", tab: "calendar" },
      });
    },
  },

  // §10. "Seu patrimônio cresceu 4%."
  {
    id: "patrimonio",
    run({ data }) {
      let series;
      try { series = netWorthSeries(data, 6); } catch (e) { return null; }
      if (!series || series.length < 2) return null;
      const now = series[series.length - 1].value;
      // Base: o mês mais antigo da janela com valor diferente de zero. Comparar
      // com um zero inicial devolveria "+∞%" no primeiro mês de uso.
      const base = series.slice(0, -1).find((p) => Math.abs(p.value) > 0.01);
      if (!base) return null;
      const pct = safePct(subMoney(now, base.value), Math.abs(base.value));
      if (Math.abs(pct) < 1) return null;
      const up = pct > 0;
      return advCard({
        id: "patrimonio",
        tone: up ? "positive" : "warn",
        icon: up ? "trendUp" : "arrowDownRight",
        title: `Seu patrimônio ${up ? "cresceu" : "recuou"} ${Math.abs(pct).toFixed(0)}%`,
        message: `De ${fmtBRL(base.value)} em ${base.label} para ${fmtBRL(now)} agora.`,
        value: subMoney(now, base.value),
        impact: Math.abs(subMoney(now, base.value)),
        action: { label: "Ver evolução patrimonial", tab: "wealth" },
      });
    },
  },

  // §10. "Você está gastando acima da média aos finais de semana."
  {
    id: "fim-de-semana",
    run({ an }) {
      const w = an.weekday;
      if (!w || !w.available) return null;
      if (w.weekendExcessPct == null || w.weekendExcessPct < ADV.weekendExcessPct) return null;
      if (w.weekendAvg < ADV.minSavingSuggestion) return null;
      return advCard({
        id: "fim-de-semana",
        tone: "info",
        icon: "calendar",
        title: "Você está gastando acima da média aos finais de semana",
        message: `Média de ${fmtBRL(w.weekendAvg)} por dia no fim de semana contra ${fmtBRL(w.weekdayAvg)} nos dias úteis. ${w.weekendExcessPct.toFixed(0)}% a mais.`,
        value: w.weekendAvg,
        impact: subMoney(w.weekendAvg, w.weekdayAvg),
      });
    },
  },

  // §8; o custo anual das assinaturas. É este número que muda decisão:
  // "R$ 55,90" não assusta ninguém; "R$ 670 por ano" faz revisar o plano.
  {
    id: "assinaturas",
    run({ rec, income }) {
      if (!rec || rec.counts.subscriptions === 0) return null;
      if (rec.monthlyTotal <= 0) return null;
      const share = income > 0 ? safePct(rec.monthlyTotal, income) : 0;
      const heavy = share >= ADV.subscriptionShare;
      return advCard({
        id: "assinaturas",
        tone: heavy ? "warn" : "info",
        icon: "refresh",
        title: `Suas assinaturas somam ${fmtBRL(rec.monthlyTotal)} por mês`,
        message: `São ${rec.counts.subscriptions} cobranças recorrentes. ${fmtBRL(rec.annualTotal)} ao longo de um ano${share > 0 ? `, ${share.toFixed(0)}% da sua renda` : ""}.`,
        value: rec.annualTotal,
        impact: rec.monthlyTotal,
        action: { label: "Revisar assinaturas", tab: "subscriptions" },
      });
    },
  },

  // §8; reajuste de preço, medido pelo impacto ANUAL do aumento.
  {
    id: "reajuste",
    run({ rec }) {
      const top = (rec && rec.increases) || [];
      if (!top.length) return null;
      const s = top[0];
      if (s.increaseAnnualImpact < 24) return null;   // R$ 2/mês não é notícia
      return advCard({
        id: "reajuste",
        tone: "warn",
        icon: "alertTriangle",
        title: `${s.name} ficou ${s.increasePct.toFixed(0)}% mais caro`,
        message: `De ${fmtBRL(s.prevAmount)} para ${fmtBRL(s.lastAmount)}. Mantido o ano inteiro, o reajuste custa ${fmtBRL(s.increaseAnnualImpact)}.`,
        value: s.increaseAnnualImpact,
        impact: s.increaseAnnualImpact,
        action: { label: "Revisar assinaturas", tab: "subscriptions" },
      });
    },
  },

  // Ritmo do mês corrente: a projeção pelo gasto médio diário já ultrapassa a
  // renda? Avisar no dia 12 vale; avisar no dia 30 é boletim de necrologia.
  {
    id: "ritmo",
    run({ an, income }) {
      const avg = an.averages;
      if (!avg || !avg.isCurrentMonth) return null;
      if (avg.elapsedDays < 5 || avg.elapsedDays > avg.totalDays - 3) return null;
      if (income <= 0) return null;
      if (moneyCompare(avg.projected, income) <= 0) return null;
      const over = subMoney(avg.projected, income);
      return advCard({
        id: "ritmo",
        tone: "danger",
        icon: "bolt",
        title: `No ritmo atual, o mês fecha ${fmtBRL(over)} no vermelho`,
        message: `Você gasta ${fmtBRL(avg.daily)} por dia; em ${avg.totalDays} dias isso projeta ${fmtBRL(avg.projected)} contra uma renda de ${fmtBRL(income)}.`,
        value: over,
        impact: over,
        action: { label: "Ver previsão de saldo", tab: "calendar" },
      });
    },
  },

  // Vazamentos silenciosos; reaproveita `detectSilentLeaks` (insights.js).
  {
    id: "vazamentos",
    run({ data, monthKey }) {
      let leaks;
      try { leaks = detectSilentLeaks(data, monthKey); } catch (e) { return null; }
      if (!leaks || leaks.totalLeak < ADV.minSavingSuggestion || leaks.leaks.length < 2) return null;
      const names = leaks.leaks.slice(0, 2).map((l) => l.label).join(", ");
      return advCard({
        id: "vazamentos",
        tone: "info",
        icon: "drop",
        title: `${fmtBRL(leaks.totalLeak)} saíram em ${leaks.count} gastos pequenos`,
        message: `Cada um passa despercebido; juntos viram ${fmtBRL(mulMoney(leaks.totalLeak, 12))} por ano. Os maiores: ${names}.`,
        value: leaks.totalLeak,
        impact: leaks.totalLeak,
      });
    },
  },

  // Concentração de categoria. Não é erro por si só (moradia costuma passar de
  // 40%), então o tom é informativo e a frase evita julgamento.
  {
    id: "dominante",
    run({ an }) {
      const d = an.dominant;
      if (!d || !d.available || !d.concentrated) return null;
      return advCard({
        id: "dominante",
        tone: "info",
        icon: d.icon || "pie",
        title: `${d.name} concentra ${d.share.toFixed(0)}% dos seus gastos`,
        message: `${fmtBRL(d.value)} de tudo que saiu no mês. Quando uma categoria domina, é nela que qualquer corte tem efeito real.`,
        value: d.value,
        impact: d.value,
      });
    },
  },

  // Reserva de emergência; reaproveita `emergencyFund` (metrics.js).
  {
    id: "reserva",
    run({ data }) {
      let e;
      try { e = emergencyFund(data); } catch (err) { return null; }
      if (!e || e.monthlyNeed <= 0) return null;
      if (e.status === "ok") {
        return advCard({
          id: "reserva",
          tone: "positive",
          icon: "shieldCheck",
          title: `Sua reserva cobre ${e.monthsCovered.toFixed(1)} meses`,
          message: `Com ${fmtBRL(e.current)} guardados, você aguenta ${e.monthsCovered.toFixed(1)} meses sem renda no seu padrão de gastos atual.`,
          value: e.current,
          impact: e.current,
        });
      }
      if (e.status === "empty") {
        return advCard({
          id: "reserva",
          tone: "warn",
          icon: "shieldCheck",
          title: "Você ainda não tem reserva de emergência",
          message: `Seu custo médio é ${fmtBRL(e.monthlyNeed)} por mês. Uma reserva de ${e.targetMonths} meses significa ${fmtBRL(e.target)}; o primeiro objetivo antes de qualquer investimento.`,
          value: e.target,
          impact: e.target,
          action: { label: "Criar meta de reserva", tab: "goals" },
        });
      }
      const missing = Math.max(0, subMoney(e.target, e.current));
      if (missing < ADV.minSavingSuggestion) return null;
      return advCard({
        id: "reserva",
        tone: "info",
        icon: "shieldCheck",
        title: `Faltam ${fmtBRL(missing)} para sua reserva ficar completa`,
        message: `Hoje ela cobre ${e.monthsCovered.toFixed(1)} dos ${e.targetMonths} meses que você definiu.`,
        value: missing,
        impact: missing,
        action: { label: "Ver metas", tab: "goals" },
      });
    },
  },

  // Reforço positivo: a maior queda de categoria. Um painel que só aponta erro
  // ensina a evitar o painel.
  {
    id: "categoria-em-queda",
    run({ an }) {
      const top = (an.categories.shrank || [])[0];
      if (!top || !top.comparable) return null;
      const saved = Math.abs(top.diff);
      if (saved < ADV.categoryGrowthMin) return null;
      if (top.pct == null || Math.abs(top.pct) < 10) return null;
      return advCard({
        id: "categoria-em-queda",
        tone: "positive",
        icon: "arrowDownRight",
        title: `Você economizou ${fmtBRL(saved)} em ${top.name}`,
        message: `Caiu ${Math.abs(top.pct).toFixed(0)}% em relação ao mês anterior. Mantido o ritmo, são ${fmtBRL(mulMoney(saved, 12))} em um ano.`,
        value: saved,
        impact: saved,
      });
    },
  },

  // Taxa de poupança do mês.
  {
    id: "taxa-poupanca",
    run({ an }) {
      const t = an.totals;
      if (!t || t.income <= 0) return null;
      if (t.savingRate >= ADV.savingRateGood) {
        return advCard({
          id: "taxa-poupanca",
          tone: "positive",
          icon: "piggy",
          title: `Você guardou ${t.savingRate.toFixed(0)}% da renda este mês`,
          message: `Sobraram ${fmtBRL(t.saving)} de ${fmtBRL(t.income)}. Acima de ${ADV.savingRateGood}% é o patamar em que o patrimônio começa a crescer sozinho.`,
          value: t.saving,
          impact: t.saving,
        });
      }
      if (t.savingRate < 0) {
        return advCard({
          id: "taxa-poupanca",
          tone: "danger",
          icon: "alertTriangle",
          title: "Você gastou mais do que recebeu este mês",
          message: `A diferença é de ${fmtBRL(Math.abs(t.saving))}. Ela precisa ser coberta por caixa, redução de outros gastos ou crédito.`,
          value: Math.abs(t.saving),
          impact: Math.abs(t.saving),
        });
      }
      return null;
    },
  },
];

// ------------------------------------------------------------------------------
// Plano de economia (§10, "você pode economizar aproximadamente R$ X")
// ------------------------------------------------------------------------------
// Regra: só entra o EXCESSO sobre a média das últimas 3 ocorrências da própria
// categoria, e só em categorias dos grupos Desejo/Futuro variável; cortar
// moradia ou saúde não é uma sugestão que um consultor faria de um painel.
function buildSavingPlan(data, an) {
  if (!an || !an.categories || an.categories.baselineMonths === 0) return { total: 0, items: [] };
  const items = an.categories.rows
    .filter((r) => r.overBaseline >= 20)
    .filter((r) => categoryGroup(data, r.id) !== "necessidade")
    .map((r) => ({
      id: r.id, name: r.name, color: r.color, icon: r.icon,
      current: r.current, baseline: r.baseline, excess: r.overBaseline,
      pct: r.baselinePct,
    }))
    .sort((a, b) => moneyCompare(b.excess, a.excess))
    .slice(0, 6);

  return { total: sumMoney(items, (i) => i.excess), items, baselineMonths: an.categories.baselineMonths };
}

// ------------------------------------------------------------------------------
// Orquestrador
// ------------------------------------------------------------------------------
function buildAdvisorModel(data, monthKey, ctx) {
  const key = monthKey || keyOfDate(new Date());
  const context = ctx || {};
  const an = context.analytics || buildAnalyticsModel(data, key);
  const rec = context.recurring || buildRecurringModel(data, { monthKey: key });
  const income = effectiveIncome(data, key);
  const plan = buildSavingPlan(data, an);

  const scope = { data, monthKey: key, an, rec, income, plan };
  const cards = [];
  ADVISOR_RULES.forEach((rule) => {
    let card = null;
    // Uma regra que estoure não pode derrubar a central inteira; mesmo
    // isolamento por item que a Saúde Financeira usa.
    try { card = rule.run(scope); } catch (e) { card = null; }
    if (card) cards.push(card);
  });

  // Os alertas de orçamento e de grupo já são gerados por assistant.js e
  // budgets.js. Trazemos prontos em vez de reescrever as regras aqui.
  let inherited = [];
  try {
    inherited = (typeof getAssistantAlerts === "function" ? getAssistantAlerts(data, key) : [])
      .map((a) => advCard({
        id: `assistente-${a.id}`,
        tone: a.severity === "danger" ? "danger" : a.severity === "warn" ? "warn" : "info",
        icon: a.icon || "alertTriangle",
        title: a.title,
        message: a.message,
        impact: 0,
      }));
  } catch (e) { inherited = []; }

  const seen = new Set();
  const merged = cards.concat(inherited).filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  merged.sort((a, b) => {
    const t = ADV_TONE_ORDER[a.tone] - ADV_TONE_ORDER[b.tone];
    if (t !== 0) return t;
    return moneyCompare(b.impact, a.impact);
  });

  const counts = { danger: 0, warn: 0, info: 0, positive: 0 };
  merged.forEach((c) => { counts[c.tone] = (counts[c.tone] || 0) + 1; });

  return {
    monthKey: key,
    monthLabel: an.monthLabel,
    hasData: an.hasData,
    cards: merged.slice(0, ADV_MAX_ITEMS),
    all: merged,
    counts,
    plan,
    // Manchete da central: a frase mais importante, escolhida pela gravidade.
    headline: merged.length
      ? merged[0]
      : advCard({
          id: "sem-alertas",
          tone: "positive",
          icon: "checkCircle",
          title: "Nada pedindo atenção agora",
          message: "Nenhum padrão fora do comum foi encontrado neste mês. Continue registrando para as comparações ficarem mais precisas.",
        }),
  };
}
