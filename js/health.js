// health.js. SAÚDE FINANCEIRA (motor puro, sem DOM, sem rede)  [Módulo 2]
// ------------------------------------------------------------------------------
// O Score (score.js) responde "como estou?" com UM número. Esta tela responde
// "POR QUÊ?"; sete indicadores independentes, cada um com valor, cor, leitura
// em linguagem humana e uma recomendação acionável.
//
// Decisões de projeto:
//   • NÃO existe uma segunda nota de 0 a 100 aqui. Duas notas concorrentes na
//     mesma base de dados confundem mais do que informam; a tela reaproveita o
//     Score já calculado por `computeFinanceScore` e usa os indicadores como
//     raio-X dele. Cada indicador devolve `ratio` (0..1) só para desenhar barra
//     e cor, nunca uma pontuação exibida como nota.
//   • Indicador sem base de cálculo é marcado `applicable: false` e some do
//     diagnóstico. Nunca inventamos um valor ruim por falta de dado.
//   • Nenhum cálculo é refeito: `ctx` recebe o que metrics.js já apurou
//     (mês, patrimônio, reserva, contas) e apenas complementa o que falta.
//   • Zero DOM, zero storage → roda em Node para teste e serve outras telas.
//
// Dependências (ordem de <script> importa): utils.js, storage.js, accounts.js,
// budgets.js, score.js (`scoreRamp`) e metrics.js (`avgMonthlyExpense`,
// `netWorthSeries`).
"use strict";

/* ==============================================================================
 * ESCALA DE STATUS
 * ============================================================================== */

// Uma escala só para os sete indicadores; a cor da tela nunca é decidida no HTML.

const HEALTH_STATUS = {
  otimo:   { id: "otimo",   label: "Ótimo",     color: "var(--positive)",  weight: 0 },
  bom:     { id: "bom",     label: "Saudável",  color: "var(--brand)",     weight: 1 },
  atencao: { id: "atencao", label: "Atenção",   color: "var(--goal)",      weight: 2 },
  critico: { id: "critico", label: "Crítico",   color: "var(--negative)",  weight: 3 },
  sem:     { id: "sem",     label: "Sem dados", color: "var(--ink-faint)", weight: -1 },
};

function healthStatusFor(ratio) {
  if (!Number.isFinite(ratio)) return HEALTH_STATUS.sem;
  if (ratio >= 0.8)  return HEALTH_STATUS.otimo;
  if (ratio >= 0.6)  return HEALTH_STATUS.bom;
  if (ratio >= 0.35) return HEALTH_STATUS.atencao;
  return HEALTH_STATUS.critico;
}

// `scoreRamp` (score.js) é a mesma interpolação com trava usada no Score. Se este
// arquivo for carregado isolado (teste unitário), cai numa cópia local idêntica.
const healthRamp = typeof scoreRamp === "function"
  ? scoreRamp
  : function (value, worst, best) {
      if (!Number.isFinite(value)) return 0;
      if (best === worst) return value >= best ? 1 : 0;
      return clamp((value - worst) / (best - worst), 0, 1);
    };

/* ==============================================================================
 * COMPROMISSOS E DÍVIDAS
 * ------------------------------------------------------------------------------
 * Combina parcelas futuras, fatura em formação e as dívidas cadastradas. A
 * Central de Dívidas detalha contratos sem duplicar os saldos do Patrimônio.
 * ============================================================================== */

function debtProfile(data, monthKey) {
  const today = todayIso();
  const mKey = monthKey || keyOfDate(new Date());
  const limitIso = isoOfDate(new Date(dateFromIso(today).getTime() + 30 * 86400000));

  let installmentsAheadC = 0;   // parcelas a vencer (dívida propriamente dita)
  let scheduledAheadC = 0;      // demais despesas já agendadas para o futuro
  let next30C = 0;              // o que vence nos próximos 30 dias
  let lastDueIso = "";
  const openGroups = new Set();

  (data.transactions || []).forEach((t) => {
    if (t.type !== "expense" || t.date <= today) return;
    // Cartões cadastrados são apurados pelas faturas abaixo. Somar suas parcelas
    // aqui repetiria a mesma obrigação como parcela e como fatura.
    if (t.creditCardId) return;
    const cents = moneyToCents(t.amount);
    const isInstallment = Number(t.installmentTotal) > 1;

    if (isInstallment) {
      installmentsAheadC += cents;
      if (t.installmentGroupId) openGroups.add(t.installmentGroupId);
      if (t.date > lastDueIso) lastDueIso = t.date;
    } else {
      scheduledAheadC += cents;
    }

    // Anti-dupla-contagem: uma parcela no crédito que vence ainda dentro deste
    // mês já está dentro de `creditBill` (fatura em formação) logo abaixo.
    const alreadyInCurrentBill = t.payment === "Crédito" && monthKeyOf(t.date) === mKey;
    if (t.date <= limitIso && !alreadyInCurrentBill) next30C += cents;
  });

  const cards = typeof cardLiabilitySummary === "function"
    ? cardLiabilitySummary(data, today, 30)
    : { total: 0, overdue: 0, dueWithin30: 0, lastDueIso: "", openPurchases: 0 };
  const legacyCreditBill = sumMoney(
    txForMonth(data, mKey).filter((t) => t.type === "expense" && t.payment === "Crédito" && !t.creditCardId),
    (t) => t.amount
  );
  const creditBill = addMoney(legacyCreditBill, cards.dueWithin30);
  if (cards.lastDueIso > lastDueIso) lastDueIso = cards.lastDueIso;
  const cash = realizedBalance(data);
  const overdraft = cash < 0 ? Math.abs(cash) : 0;

  // Módulo 3; financiamentos e empréstimos cadastrados em Patrimônio. O saldo
  // devedor entra na dívida total; a parcela mensal informada entra no
  // comprometimento da renda. Sem cadastro, ambos valem 0 (comportamento anterior).
  const hasRegistry = typeof liabilitiesTotal === "function";
  const registeredDebt = hasRegistry ? liabilitiesTotal(data) : 0;
  const registeredPayment = hasRegistry ? liabilitiesMonthlyPayment(data) : 0;

  const installmentsAhead = moneyFromCents(installmentsAheadC);
  const outstanding = addMoney(addMoney(addMoney(installmentsAhead, cards.total), overdraft), registeredDebt);
  const monthlyBurden = addMoney(addMoney(creditBill, moneyFromCents(next30C)), registeredPayment);
  const income = effectiveIncome(data, mKey);

  return {
    installmentsAhead,
    scheduledAhead: moneyFromCents(scheduledAheadC),
    openPurchases: openGroups.size + cards.openPurchases,
    creditBill,
    cardOutstanding: cards.total,
    cardOverdue: cards.overdue,
    overdraft,
    registeredDebt,
    registeredPayment,
    outstanding,
    monthlyBurden,
    burdenPct: income > 0 ? safePct(monthlyBurden, income) : null,
    monthsToClear: lastDueIso ? Math.max(1, Math.ceil(daysBetweenIso(today, lastDueIso) / 30.44)) : 0,
    income,
  };
}

/* ==============================================================================
 * FLUXO DE CAIXA HISTÓRICO
 * ============================================================================== */

// Regularidade importa mais que um mês bom isolado: olhamos os 6 últimos meses,
// descartando os que não têm movimento nenhum (quem instalou o app ontem não
// merece 5 meses de "prejuízo" fantasma).
function cashFlowHistory(data, months = 6) {
  const now = new Date();
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = addMonths(now, -i);
    const key = keyOfDate(d);
    const totals = realizedMonthTotals(data, key);
    const income = effectiveIncome(data, key);
    if (income <= 0 && totals.expense <= 0) continue;
    rows.push({
      key,
      label: MONTH_ABBR[d.getMonth()],
      income,
      expense: totals.expense,
      result: subMoney(income, totals.expense),
    });
  }
  const positives = rows.filter((r) => r.result >= 0).length;
  const avgResult = rows.length ? divMoney(sumMoney(rows, (r) => r.result), rows.length) : 0;
  const avgIncome = rows.length ? divMoney(sumMoney(rows, (r) => r.income), rows.length) : 0;

  // Tendência: média da metade recente contra a média da metade anterior.

  let trend = 0;
  if (rows.length >= 4) {
    const half = Math.floor(rows.length / 2);
    const older = divMoney(sumMoney(rows.slice(0, half), (r) => r.result), half);
    const recent = divMoney(sumMoney(rows.slice(rows.length - half), (r) => r.result), half);
    trend = subMoney(recent, older);
  }

  return { rows, positives, considered: rows.length, avgResult, avgIncome, trend };
}

/* ==============================================================================
 * CAPACIDADE DE POUPANÇA
 * ------------------------------------------------------------------------------
 * Diferente da economia realizada: é o teto TEÓRICO de poupança; o que sobraria
 * se você pagasse só o essencial (grupo "necessidade" da regra 50/30/20 que o app
 * já usa). A distância entre o teto e o que você guardou de fato é exatamente o
 * dinheiro que está indo para desejos.
 * ============================================================================== */

function savingsCapacity(data, monthKey, monthSnap) {
  const mKey = monthKey || keyOfDate(new Date());
  const snap = monthSnap || monthSnapshot(data, mKey);
  const groups = monthGroupSpend(data, mKey);
  const essentials = groups.necessidade;
  const wants = groups.desejo;
  const capacity = Math.max(0, subMoney(snap.income, essentials));
  return {
    income: snap.income,
    essentials,
    wants,
    capacity,
    capacityPct: snap.income > 0 ? safePct(capacity, snap.income) : 0,
    actual: snap.savings,
    // `savingsRate` é null quando ainda não houve renda realizada no mês. Zero
    // seria pior do que nada: diria "você não poupou" quando o certo é "ainda
    // não dá para saber".
    actualPct: snap.savingsRate == null ? 0 : snap.savingsRate,
    actualKnown: snap.savingsRate != null,
    partial: snap.partial,
    gap: Math.max(0, subMoney(capacity, Math.max(0, snap.savings))),
  };
}

/* ==============================================================================
 * OS SETE INDICADORES
 * ------------------------------------------------------------------------------
 * Contrato de cada `evaluate(data, mKey, ctx)`:
 *   { applicable, ratio, display, caption, description, recommendation,
 *     benchmark, cta?, marks? }
 * `display` é o número-herói do cartão; `benchmark` é a referência de mercado
 * usada; `marks` posiciona a régua da barra (0..1).
 * ============================================================================== */

const HEALTH_INDICATORS = [
  {
    id: "liquidez",
    label: "Liquidez",
    icon: "drop",
    what: "Quanto do que vence nos próximos 30 dias o seu dinheiro disponível cobre hoje.",
    evaluate(data, mKey, ctx) {
      const cash = ctx.worth.cash;
      const commitments = ctx.bills.total;
      const monthlyNeed = ctx.monthlyNeed;
      if (cash === 0 && commitments === 0 && monthlyNeed === 0) return { applicable: false };

      const base = commitments > 0 ? commitments : monthlyNeed;
      const index = base > 0 ? cash / base : null;
      // "N dias de despesa" divide o caixa por uma média mensal. Se essa média
      // veio do mês corrente ainda pela metade (nenhum mês fechado com gasto),
      // um único lançamento de R$ 214,90 vira "R$ 214,90/mês" e o app anuncia
      // 114 dias de folga para quem começou a usar ontem. Sem base, a frase sai.
      const daysCovered = monthlyNeed > 0 && ctx.closedMonths > 0 ? Math.max(0, (cash / monthlyNeed) * 30) : null;
      const ratio = cash <= 0 ? 0 : (index == null ? 0.6 : healthRamp(index, 0.4, 2));

      return {
        applicable: true,
        ratio,
        display: index == null ? fmtBRL(cash) : `${fmtDec(index, 1)}x`,
        caption: index == null ? "disponível em caixa" : "o que vence em 30 dias",
        description: cash <= 0
          ? `Seu caixa está negativo em ${fmtBRL(Math.abs(cash))}; qualquer despesa nova entra como dívida.`
          : commitments > 0
            ? `Você tem ${fmtBRL(cash)} disponíveis para ${fmtBRL(commitments)} em contas dos próximos 30 dias${daysCovered != null ? `, o equivalente a ${Math.round(daysCovered)} dias de despesa` : ""}.`
            : `Você tem ${fmtBRL(cash)} livres${daysCovered != null ? `, o equivalente a ${Math.round(daysCovered)} dias de despesa` : ""}. Nenhuma conta lançada para os próximos 30 dias.`,
        recommendation: ratio >= 0.8
          ? null
          : cash <= 0
            ? "Prioridade absoluta: zerar o saldo negativo antes de qualquer aporte ou compra parcelada; juros de conta negativa superam qualquer investimento."
            : "O caixa confortável cobre pelo menos 2x o que vence no mês. Antecipe receitas ou adie compras não essenciais até recompor essa folga.",
        benchmark: "Referência: caixa ≥ 2x os compromissos de 30 dias.",
        cta: cash <= 0 ? { label: "Ver próximas contas", tab: "dashboard" } : null,
      };
    },
  },

  {
    id: "reserva",
    label: "Reserva de emergência",
    icon: "shieldCheck",
    what: "Quantos meses de despesa a sua reserva cobre se a renda parar hoje.",
    evaluate(data, mKey, ctx) {
      const r = ctx.reserve;
      if (r.current <= 0 && r.monthlyNeed <= 0) return { applicable: false };
      const ratio = healthRamp(r.monthsCovered, 0, r.targetMonths);
      const missing = Math.max(0, subMoney(r.target, r.current));
      return {
        applicable: true,
        ratio,
        display: `${fmtDec(r.monthsCovered, 1)}`,
        caption: `de ${r.targetMonths} meses de despesa`,
        description: r.current > 0
          ? `Você tem ${fmtBRL(r.current)} reservados, o que sustenta ${fmtDec(r.monthsCovered, 1)} ${r.monthsCovered < 2 ? "mês" : "meses"} no seu padrão atual de ${fmtBRL(r.monthlyNeed)}/mês.`
          : "Você ainda não tem reserva de emergência formada; hoje um imprevisto vira dívida.",
        recommendation: ratio >= 1
          ? null
          : `Faltam ${fmtBRL(missing)}. Guardar essa quantia vem antes de investir em renda variável: reserva é seguro, não rendimento.`,
        benchmark: `Referência: ${r.targetMonths} meses de despesa (ajustável em Ajustes).`,
        cta: r.configured ? { label: "Ver metas", tab: "goals" } : { label: "Criar meta de reserva", tab: "goals" },
        marks: [{ at: 1, label: "alvo" }],
      };
    },
  },

  {
    id: "patrimonio",
    label: "Patrimônio",
    icon: "layout",
    what: "O total acumulado (caixa + investimentos + metas) e a direção que ele tomou.",
    evaluate(data, mKey, ctx) {
      const total = ctx.worth.total;
      const series = ctx.series;
      const first = series[0].value;
      const last = series[series.length - 1].value;
      if (Math.abs(total) < 1 && Math.abs(first) < 1) return { applicable: false };

      // SEM PONTO DE PARTIDA NÃO EXISTE CRESCIMENTO.
      //
      // `first === 0` quase nunca quer dizer "seis meses atrás eu não tinha
      // nada": quer dizer que o app não existia para essa pessoa naquele mês.
      // Forçar 100% transformava o primeiro dia de uso em "+100,0% em 6 meses"
      // e "seu patrimônio saiu de R$ 0,00 para R$ 6.940,20 nos últimos seis
      // meses", que é uma história inventada sobre a vida financeira de alguém.
      const semBase = Math.abs(first) < 1;
      const growth = semBase ? 0 : ((last - first) / Math.abs(first)) * 100;
      const monthsOfExpense = ctx.monthlyNeed > 0 ? total / ctx.monthlyNeed : 0;
      // Com média mensal tirada de um mês pela metade, "N meses de despesa
      // acumulados" também não se sustenta.
      const mediaConfiavel = ctx.closedMonths > 0;
      const ratio = semBase
        ? healthRamp(monthsOfExpense, 0, 6)
        : 0.6 * healthRamp(growth, -10, 12) + 0.4 * healthRamp(monthsOfExpense, 0, 6);

      const trechoMeses = ctx.monthlyNeed > 0 && mediaConfiavel
        ? `, o equivalente a ${fmtDec(monthsOfExpense, 1)} meses de despesa acumulados` : "";

      return {
        applicable: true,
        ratio,
        display: fmtBRLShort(total),
        caption: semBase
          ? "sem histórico para comparar"
          : (growth >= 0 ? `+${fmtDec(growth, 1)}% em 6 meses` : `${fmtDec(growth, 1)}% em 6 meses`),
        description: semBase
          ? `Você acumulou ${fmtBRLShort(total)} até aqui. Ainda não há seis meses de histórico para dizer se a curva sobe ou desce; a comparação aparece conforme os meses passam.`
          : (growth >= 0
            ? `Seu patrimônio saiu de ${fmtBRLShort(first)} para ${fmtBRLShort(last)} nos últimos seis meses${trechoMeses}.`
            : `Seu patrimônio recuou de ${fmtBRLShort(first)} para ${fmtBRLShort(last)} nos últimos seis meses; você está consumindo o que já tinha guardado.`),
        recommendation: ratio >= 0.8
          ? null
          : growth < 0
            ? "Patrimônio caindo com renda estável pode indicar resgate de reserva ou parcelamento acumulado. Confira o indicador de Dívidas antes de mudar os aportes."
            : "Crescimento patrimonial vem de aporte recorrente, não de rendimento. Um valor fixo transferido no dia do salário muda essa curva mais que qualquer taxa.",
        benchmark: "Referência: curva ascendente e ≥ 6 meses de despesa acumulados.",
        cta: { label: "Abrir patrimônio", tab: "wealth" },
      };
    },
  },

  {
    id: "investimentos",
    label: "Investimentos",
    icon: "trendUp",
    what: "Quanto do seu patrimônio está aplicado e quanto da renda virou aporte neste mês.",
    evaluate(data, mKey, ctx) {
      const invested = addMoney(ctx.worth.invested, ctx.worth.goals);
      const total = ctx.worth.total;
      const income = ctx.month.income;
      if (total <= 0 && income <= 0) return { applicable: false };

      const share = total > 0 ? clamp(safePct(invested, total), 0, 100) : 0;
      const contributed = spentForCategory(data, "investimento", mKey);
      const contributedPct = income > 0 ? safePct(contributed, income) : 0;
      const ratio = 0.55 * healthRamp(share, 0, 40) + 0.45 * healthRamp(contributedPct, 0, 10);

      return {
        applicable: true,
        ratio,
        display: fmtPct(share),
        caption: "do patrimônio aplicado",
        description: invested > 0
          ? `${fmtBRL(invested)} do seu patrimônio estão em investimentos e metas${contributed > 0 ? `, e você aportou ${fmtBRL(contributed)} (${contributedPct.toFixed(0)}% da renda) neste mês` : ". Nenhum aporte novo neste mês"}.`
          : "Todo o seu dinheiro está parado em conta. Sem aplicação, a inflação corrói o poder de compra mês a mês.",
        recommendation: ratio >= 0.8
          ? null
          : contributedPct < 8
            ? "Um aporte automático de 10% da renda no dia do pagamento resolve isso sem exigir disciplina mensal; o dinheiro sai antes de virar gasto."
            : "Dinheiro parado em conta corrente perde para a inflação. Mesmo a aplicação mais conservadora protege o valor real do que você acumulou.",
        benchmark: "Parâmetros deste indicador: 40% do patrimônio aplicado e 10% da renda aportada. Ajuste a decisão à sua reserva, prazo e dívidas.",
        cta: { label: "Cadastrar carteira", tab: "wealth" },
      };
    },
  },

  {
    id: "dividas",
    label: "Dívidas",
    icon: "creditCard",
    what: "Quanto da sua renda já está comprometido com parcelas e fatura antes do mês começar.",
    evaluate(data, mKey, ctx) {
      const d = ctx.debt;
      const semDivida = d.outstanding <= 0 && d.creditBill <= 0;
      if (semDivida && d.income <= 0) return { applicable: false };
      if (semDivida) {
        return {
          applicable: true,
          ratio: 1,
          display: "0%",
          caption: "da renda comprometida",
          description: "Você não tem parcelas em aberto, saldo negativo nem fatura em formação. É a posição mais confortável possível.",
          recommendation: null,
          benchmark: "Faixa de planejamento do app: até 30% da renda comprometida. Não é regra de aprovação bancária.",
        };
      }
      if (d.income <= 0) {
        return {
          applicable: true,
          ratio: 0.35,
          display: fmtBRLShort(d.outstanding),
          caption: "em parcelas a vencer",
          description: `Você tem ${fmtBRL(d.outstanding)} a vencer${d.openPurchases > 0 ? ` em ${d.openPurchases} compra${d.openPurchases > 1 ? "s" : ""} parcelada${d.openPurchases > 1 ? "s" : ""}` : ""}, mas nenhuma renda cadastrada para dimensionar o peso disso.`,
          recommendation: "Cadastre sua renda mensal em Ajustes; sem ela é impossível dizer se essas parcelas cabem no seu mês.",
          benchmark: "Faixa de planejamento do app: até 30% da renda comprometida.",
          cta: { label: "Informar minha renda", tab: "settings" },
        };
      }

      const pct = d.burdenPct;
      const ratio = healthRamp(pct, 60, 10);
      const partes = [];
      if (d.cardOverdue > 0) partes.push(`${fmtBRL(d.cardOverdue)} já vencidos no cartão`);
      const cardDueSoon = Math.max(0, subMoney(d.creditBill, d.cardOverdue));
      if (cardDueSoon > 0) partes.push(`${fmtBRL(cardDueSoon)} de faturas com vencimento em até 30 dias`);
      if (d.installmentsAhead > 0) partes.push(`${fmtBRL(d.installmentsAhead)} em parcelas futuras`);
      if (d.registeredPayment > 0) partes.push(`${fmtBRL(d.registeredPayment)} de financiamentos cadastrados`);
      if (d.overdraft > 0) partes.push(`${fmtBRL(d.overdraft)} de saldo negativo`);

      return {
        applicable: true,
        ratio,
        display: fmtPct(pct),
        caption: "da renda comprometida",
        description: `${fmtBRL(d.monthlyBurden)} dos seus ${fmtBRL(d.income)} de renda já têm destino: ${partes.join(", ")}${d.monthsToClear > 1 ? `. A última parcela cai daqui a ${d.monthsToClear} meses` : ""}.`,
        recommendation: ratio >= 0.8
          ? null
          : pct >= 50
            ? "Acima de 50% da renda comprometida o mês começa no vermelho. Compare o custo das dívidas e avalie negociação ou antecipação da mais cara."
            : "Acima da faixa de 30% usada pelo app, o parcelamento já ocupa uma parte relevante do mês seguinte. Evite novas compras parceladas até essa fila diminuir.",
        benchmark: "Faixa de planejamento do app: até 30% da renda comprometida. Bancos podem usar critérios diferentes.",
        marks: [{ at: healthRamp(30, 60, 10), label: "30%" }],
        cta: { label: "Abrir plano de quitação", tab: "debts" },
      };
    },
  },

  {
    id: "fluxo",
    label: "Fluxo de caixa",
    icon: "bolt",
    what: "Com que regularidade você fecha o mês no azul, não apenas se fechou desta vez.",
    evaluate(data, mKey, ctx) {
      const f = ctx.flow;
      if (f.considered === 0) return { applicable: false };

      const avgPct = f.avgIncome > 0 ? safePct(f.avgResult, f.avgIncome) : 0;
      const consistency = f.positives / f.considered;
      const ratio = 0.5 * consistency + 0.5 * healthRamp(avgPct, -15, 20);

      return {
        applicable: true,
        ratio,
        display: `${f.positives}/${f.considered}`,
        caption: "meses fechados no azul",
        description: `${f.considered === 1 ? "No último mês com movimento" : `Nos últimos ${f.considered} meses com movimento`}, ${f.positives} ${f.positives === 1 ? "fechou" : "fecharam"} positivo, com resultado médio de ${fmtBRL(f.avgResult)} por mês${f.trend !== 0 ? `; e a tendência recente é de ${f.trend > 0 ? "melhora" : "piora"} (${f.trend > 0 ? "+" : "−"}${fmtBRL(Math.abs(f.trend))} por mês)` : ""}.`,
        recommendation: ratio >= 0.8
          ? null
          : f.avgResult < 0
            ? "Um fluxo médio negativo significa que o padrão de vida está acima da renda; nenhuma otimização de investimento resolve isso. O ajuste precisa ser na despesa fixa."
            : "Meses alternando entre azul e vermelho costumam indicar gastos sazonais não provisionados (IPVA, seguro, presentes). Reserve um valor fixo por mês para eles.",
        benchmark: "Referência: fechar no azul em pelo menos 5 dos últimos 6 meses.",
        cta: { label: "Ver análises", tab: "analytics" },
      };
    },
  },

  {
    id: "poupanca",
    label: "Capacidade de poupança",
    icon: "piggy",
    what: "Quanto sobraria se você pagasse apenas o essencial; e quanto disso você realmente guarda.",
    evaluate(data, mKey, ctx) {
      const s = ctx.capacity;
      if (s.income <= 0) return { applicable: false };

      const ratio = 0.5 * healthRamp(s.capacityPct, 10, 45) + 0.5 * healthRamp(s.actualPct, 0, 20);

      return {
        applicable: true,
        ratio,
        display: fmtPct(s.capacityPct),
        caption: "da renda poderia ser poupada",
        description: `Descontando ${fmtBRL(s.essentials)} de gastos essenciais, sobrariam ${fmtBRL(s.capacity)} da sua renda${s.gap > 0 ? `. Você guardou ${fmtBRL(Math.max(0, s.actual))}; a diferença de ${fmtBRL(s.gap)} foi para gastos não essenciais` : ", e é exatamente isso que você está guardando"}.`,
        recommendation: ratio >= 0.8
          ? null
          : s.capacityPct < 20
            ? "Com o essencial consumindo tanto da renda, cortar cafezinho não resolve. O ganho real está nas três maiores despesas fixas: moradia, transporte e financiamentos."
            : `Sua capacidade existe (${fmtBRL(s.capacity)}), mas não está sendo usada. Transferir ${fmtBRL(divMoney(s.gap, 2))} logo após receber já fecha metade dessa lacuna sem mudar seu padrão de vida.`,
        benchmark: "Regra configurável do app: essenciais em até 50% da renda e poupança efetiva de 20%. Não é uma regra universal.",
        cta: { label: "Ver regra 50/30/20", tab: "settings" },
        marks: [{ at: healthRamp(20, 10, 45) * 0.5 + 0.5 * healthRamp(20, 0, 20), label: "ideal" }],
      };
    },
  },
];

/* ==============================================================================
 * MODELO ÚNICO DA TELA
 * ============================================================================== */

// Monta o `ctx` compartilhado. Tudo que metrics.js já calculou é reaproveitado;
// só o que é exclusivo desta tela (dívida, fluxo, capacidade) é apurado aqui.
function buildHealthContext(data, mKey, ctx) {
  const c = ctx || {};
  const month = c.month || monthSnapshot(data, mKey);
  return {
    month,
    worth: c.worth || netWorth(data),
    reserve: c.reserve || emergencyFund(data),
    bills: c.bills || upcomingBills(data),
    series: c.series || netWorthSeries(data, 6),
    monthlyNeed: avgMonthlyExpense(data),
    // Zero = a média mensal saiu do mês corrente, ainda incompleto.
    closedMonths: closedMonthsWithExpense(data),
    debt: debtProfile(data, mKey),
    flow: cashFlowHistory(data, 6),
    capacity: savingsCapacity(data, mKey, month),
  };
}

// Frase de abertura da tela: um diagnóstico, não um número.
// Enumeração legível com corte: "liquidez, dívidas e mais 3". Sem isso, um
// perfil ruim gerava uma frase de sete itens que ninguém termina de ler.
function healthList(items, max = 3) {
  const names = items.map((i) => i.label.toLowerCase());
  if (names.length <= max) {
    return names.length <= 1 ? (names[0] || "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} e mais ${names.length - max}`;
}

function healthHeadline(indicators) {
  const rated = indicators.filter((i) => i.applicable);
  if (rated.length === 0) {
    return { tone: "neutral", title: "Ainda não dá para diagnosticar", text: "Cadastre sua renda e alguns lançamentos para que os indicadores comecem a fazer sentido." };
  }
  const critical = rated.filter((i) => i.status.id === "critico");
  const warn = rated.filter((i) => i.status.id === "atencao");
  const strong = rated.filter((i) => i.status.id === "otimo");

  if (critical.length > 0) {
    return {
      tone: "danger",
      title: critical.length === 1 ? "Um ponto crítico exige ação" : `${critical.length} pontos críticos exigem ação`,
      text: `${healthList(critical)} ${critical.length === 1 ? "está" : "estão"} em nível de risco. Resolver isso vale mais do que otimizar qualquer outro indicador agora.`,
    };
  }
  if (warn.length > 0) {
    return {
      tone: "warn",
      title: "Estrutura de pé, com folgas a fechar",
      text: `Nenhum indicador em risco. ${warn.length === 1 ? "Um ponto pede" : `${warn.length} pontos pedem`} atenção: ${healthList(warn)}.`,
    };
  }
  return {
    tone: "positive",
    title: "Sua saúde financeira está sólida",
    text: `${strong.length} de ${rated.length} indicadores no nível ótimo. A partir daqui o jogo é de eficiência: rentabilidade, impostos e proteção patrimonial.`,
  };
}

// Plano de ação: os indicadores mais frágeis viram uma fila ordenada por urgência.
// A ordem não é a da tela; é a ordem em que um consultor atacaria os problemas.
const HEALTH_PRIORITY = ["liquidez", "dividas", "reserva", "fluxo", "poupanca", "investimentos", "patrimonio"];

function healthActionPlan(indicators) {
  return indicators
    .filter((i) => i.applicable && i.recommendation && i.status.id !== "otimo")
    .sort((a, b) => {
      if (b.status.weight !== a.status.weight) return b.status.weight - a.status.weight;
      return HEALTH_PRIORITY.indexOf(a.id) - HEALTH_PRIORITY.indexOf(b.id);
    })
    .slice(0, 4)
    .map((i, idx) => ({
      order: idx + 1,
      id: i.id,
      icon: i.icon,
      label: i.label,
      status: i.status,
      text: i.recommendation,
      cta: i.cta || null,
    }));
}

// Ponto de entrada da UI.

function buildHealthModel(data, monthKey, ctx) {
  const mKey = monthKey || keyOfDate(new Date());
  const context = buildHealthContext(data, mKey, ctx);

  const indicators = HEALTH_INDICATORS.map((def) => {
    let out;
    try { out = def.evaluate(data, mKey, context) || { applicable: false }; }
    catch (e) { out = { applicable: false }; }   // um indicador quebrado nunca derruba a tela

    const applicable = !!out.applicable;
    const ratio = applicable ? clamp(Number(out.ratio) || 0, 0, 1) : 0;
    return {
      id: def.id,
      label: def.label,
      icon: def.icon,
      what: def.what,
      applicable,
      ratio,
      status: applicable ? healthStatusFor(ratio) : HEALTH_STATUS.sem,
      display: out.display || ":",
      caption: out.caption || "",
      description: out.description || "Ainda não há dados suficientes para avaliar este indicador.",
      recommendation: out.recommendation || null,
      benchmark: out.benchmark || "",
      cta: out.cta || null,
      marks: out.marks || [],
    };
  });

  const counts = indicators.reduce((acc, i) => {
    acc[i.status.id] = (acc[i.status.id] || 0) + 1;
    return acc;
  }, {});

  return {
    monthKey: mKey,
    context,
    indicators,
    counts,
    rated: indicators.filter((i) => i.applicable).length,
    headline: healthHeadline(indicators),
    actionPlan: healthActionPlan(indicators),
    // O Score continua sendo a nota única do app; aqui ele é só reaproveitado.
    score: typeof computeFinanceScore === "function"
      ? computeFinanceScore(data, mKey, { month: context.month, worth: context.worth, reserve: context.reserve, bills: context.bills })
      : null,
  };
}

/* Exportação para o harness de teste em Node (ignorada no navegador). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildHealthModel, debtProfile, cashFlowHistory, savingsCapacity, HEALTH_INDICATORS, HEALTH_STATUS, healthStatusFor };
}
