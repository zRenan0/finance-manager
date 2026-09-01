// js/screens/dashboard.js. Tela inicial. Montada a partir de UM modelo de leitura (`buildDashboardModel`,
// em metrics.js). Nenhum cálculo financeiro mora aqui.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// DASHBOARD
// ------------------------------------------------------------------
// A tela é montada a partir de UM modelo de leitura (`buildDashboardModel`,
// em metrics.js). Nenhum cálculo financeiro mora aqui; este bloco só
// transforma o modelo em HTML. Cartões antigos (orçamentos, vazamentos,
// assinaturas, extrato) foram preservados integralmente.
// ==================================================================
// A tela é montada a partir da ordem escolhida pelo usuário (layout.js). O
// `switch` abaixo é a ponte entre o id registrado e a função que desenha o
// cartão; nenhum cartão é chamado direto no corpo da tela. Custa uma linha por
// cartão e paga com a garantia de que tudo que aparece aqui pode ser desligado.
function renderDashboardCard(cardId, ctx) {
  switch (cardId) {
    case "hero":            return renderHeroCard(ctx.model);
    case "score":           return renderScoreCard(ctx.model);
    case "networth":        return renderNetWorthCard(ctx.model);
    case "reserve":         return renderReserveCard(ctx.model);
    case "goal":            return renderFeaturedGoalCard(ctx.model);
    case "bills":           return renderUpcomingBillsCard(ctx.model);
    case "forecast":        return renderForecastCard(null, false);
    case "summary":         return renderSmartSummaryCard(ctx.model);
    case "quickEntry":      return renderQuickEntryCard();
    case "advisor":         return renderAdvisorCard(ctx.mKey);
    case "assistant":       return renderAssistantCard(ctx.mKey);
    case "gamification":    return renderGamificationCard(achievementsModel());
    case "budgetHealth":    return renderBudgetHealth(ctx.refDate, ctx.isCurrentMonth, ctx.model.month.expense, ctx.fixedSpent, ctx.variableSpent);
    case "categoryBudgets": return renderCategoryBudgetsCard(ctx.mKey);
    case "budgetSplit":     return renderBudgetSplitCard(ctx.mKey);
    case "creditLimit":     return renderCreditLimitCard(ctx.mKey);
    case "leaks":           return renderLeakCard(ctx.mKey);
    case "subscriptions":   return renderSubscriptionsCard();
    case "breakdown":       return `<div class="card span-1">
      <p class="card-title">Para onde foi o dinheiro</p>
      ${renderCategoryBreakdown(ctx.model.ranking, ctx.model.month.expense)}
    </div>`;
    case "recent":          return `<div class="card span-2">
      <p class="card-title">Últimos lançamentos</p>
      ${ctx.recent.length === 0 ? renderEmptyState("wallet", "Nenhum lançamento ainda.", "Toque no botão + para começar.") : `<div class="tx-list">${ctx.recent.map((t) => renderTxRow(t)).join("")}</div>`}
    </div>`;
    default: return "";
  }
}

function renderDashboardScreen() {
  const refDate = addMonths(new Date(), state.monthOffset);
  const model = dashboardModel(refDate);
  const mKey = model.monthKey;
  const isCurrentMonth = model.isCurrentMonth;
  const { fixed: fixedSpent, variable: variableSpent } = realizedMonthTotals(state.data, mKey);

  // "Últimos lançamentos" é histórico, não agenda. Sem o corte no dia de hoje a
  // ordenação por data decrescente colocava as parcelas futuras no topo: uma
  // compra em 10x enchia o cartão inteiro com datas de 2027 e empurrava para
  // fora da tela o que a pessoa acabou de gastar. O que ainda vai vencer tem
  // cartão próprio ("Próximas contas") e o calendário.
  const hoje = todayIso();
  const recent = state.data.transactions
    .filter((t) => t.date <= hoje)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
    .slice(0, 6);

  const pending = isCurrentMonth ? getPendingRecurring(state.data, mKey) : [];
  const showCarry = pending.length > 0 && state.data.dismissedCarryForwardMonth !== mKey;

  const ctx = { model, mKey, isCurrentMonth, refDate, fixedSpent, variableSpent, recent };
  const starting = isDashboardStarting(state.data);
  const cards = visibleDashboardCards(state.data.dashboardLayout, { isCurrentMonth, data: state.data });
  const body = starting
    ? `${renderHeroCard(model)}${renderDashboardStarter()}${cards.filter((c) => c.id !== "hero").map((c) => renderDashboardCard(c.id, ctx)).join("")}`
    : cards.map((c) => renderDashboardCard(c.id, ctx)).join("");

  return `<div class="screen ${starting ? "screen--starter" : ""}">
    ${renderDashboardHeader(model)}
    ${shouldWarnLocalOnly() ? renderLocalOnlyNotice() : ""}
    ${showCarry ? renderCarryBanner(pending) : ""}
    ${state.dashboardEditing ? renderDashboardCustomizer() : ""}

    <div class="grid-dashboard">
      ${body}
    </div>
  </div>`;
}

function renderDashboardStarter() {
  const hasAccount = Array.isArray(state.data.accounts) && state.data.accounts.length > 0;
  return `<div class="card card--starter span-3">
    <span class="starter-mark" aria-hidden="true">${svgIcon("arrowUpRight", 18)}</span>
    <div class="starter-copy">
      <p class="card-title">Comece pelo que aconteceu hoje</p>
      <p class="card-subtitle">${hasAccount
        ? "Registre uma receita ou despesa. Depois do primeiro lançamento, o Início passa a mostrar somente análises que já têm dados para calcular."
        : "Você pode lançar uma receita ou despesa agora. Cadastrar a conta depois deixa o saldo igual ao do banco."}</p>
    </div>
    <ol class="starter-steps" aria-label="Como começar">
      <li><b>Registre</b><span>uma movimentação</span></li>
      <li><b>Confira</b><span>o saldo do mês</span></li>
      <li><b>Planeje</b><span>com dados reais</span></li>
    </ol>
  </div>`;
}

// ==================================================================
// PERSONALIZAÇÃO DO INÍCIO
// ==================================================================
// Painel de configuração dentro da própria tela, e não escondido em Ajustes: o
// usuário decide o que mostrar olhando para o que está vendo.
//
// Reordenação por botões de subir/descer, não por arrastar. Arrastar dentro de
// uma página que também rola verticalmente é ruim no celular mesmo quando bem
// feito, e cada linha aqui já tem dois alvos de toque de 44px que funcionam de
// primeira.
function renderDashboardCustomizer() {
  const layout = normalizeDashboardLayout(state.data.dashboardLayout);
  const focus = normalizeDashboardFocus(state.data.dashboardFocus);
  const isCurrentMonth = state.monthOffset === 0;
  const counts = dashboardLayoutCounts(layout, { isCurrentMonth, data: state.data });

  return `<div class="card card--elevated dash-config">
    <div class="settings-row-header modal-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Personalizar o Início</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${counts.visible} de ${counts.total} cartões visíveis. A ordem aqui é a ordem da tela.</p>
      </div>
      <button class="icon-btn" data-action="dash-customize-close" aria-label="Concluir personalização">${svgIcon("check", 17)}</button>
    </div>

    <fieldset class="dash-focus">
      <legend>Prioridade do Início</legend>
      <p class="field-hint">Muda a ordem sugerida. Cartões ocultos e fixados continuam como você escolheu.</p>
      <div class="dash-focus__options">
        ${DASHBOARD_FOCUS_OPTIONS.map((option) => `<button type="button" class="dash-focus__option ${focus === option.id ? "active" : ""}" data-action="dash-focus" data-value="${option.id}" aria-pressed="${focus === option.id ? "true" : "false"}">
          <span aria-hidden="true">${svgIcon(option.icon, 17)}</span>
          <span>${escapeHtml(option.label)}</span>
        </button>`).join("")}
      </div>
    </fieldset>

    <div class="dash-config-list">
      ${layout.order.map((id, i) => {
        const card = dashboardCardById(id);
        if (!card) return "";
        const hidden = layout.hidden.indexOf(id) !== -1;
        const relevant = isDashboardCardRelevant(state.data, id);
        const pinned = layout.pinned.indexOf(id) !== -1;
        const dormant = card.monthly && !isCurrentMonth;
        const visible = !hidden && !dormant && (relevant || pinned);
        return `<div class="dash-config-row ${visible ? "" : "dash-config-row--off"}">
          <div class="dash-config-row__moves">
            <button class="icon-btn" data-action="dash-card-move" data-id="${id}" data-value="up" ${i === 0 ? "disabled" : ""} aria-label="Subir ${escapeHtml(card.label)}">${svgIcon("chevronUp", 15)}</button>
            <button class="icon-btn" data-action="dash-card-move" data-id="${id}" data-value="down" ${i === layout.order.length - 1 ? "disabled" : ""} aria-label="Descer ${escapeHtml(card.label)}">${svgIcon("chevronDown", 15)}</button>
          </div>
          <div class="dash-config-row__text">
            <p class="dash-config-row__label">${escapeHtml(card.label)}${card.locked ? `<span class="dash-config-tag">fixo</span>` : ""}${!relevant && !card.locked ? `<span class="dash-config-tag">sem dados</span>` : ""}${pinned ? `<span class="dash-config-tag">mostrado por você</span>` : ""}${dormant ? `<span class="dash-config-tag">só no mês atual</span>` : ""}</p>
            <p class="dash-config-row__hint">${escapeHtml(card.hint)}</p>
          </div>
          ${card.locked
            ? `<span class="dash-config-row__lock" aria-hidden="true">${svgIcon("shieldCheck", 16)}</span>`
            : `<button class="switch ${visible ? "active" : ""}" data-action="dash-card-toggle" data-id="${id}" data-value="${visible ? "hide" : "show"}" role="switch" aria-checked="${visible ? "true" : "false"}" aria-label="${visible ? "Ocultar" : "Mostrar"} ${escapeHtml(card.label)}"><span class="switch__knob"></span></button>`}
        </div>`;
      }).join("")}
    </div>

    <div class="settings-actions" data-ui-css="margin-top:12px">
      <button class="btn btn--ghost btn--sm" data-action="dash-layout-reset">${svgIcon("refresh", 15)} Restaurar padrão</button>
      <button class="btn btn--primary btn--sm" data-action="dash-customize-close">${svgIcon("check", 15)} Concluir</button>
    </div>
  </div>`;
}

// ---- Cabeçalho: saudação dependente da hora + nome + navegação de meses ----
function renderDashboardHeader(m) {
  const g = m.greeting;
  const hello = `${g.text}${m.firstName ? `, ${escapeHtml(m.firstName)}` : ""}`;
  const title = m.isCurrentMonth
    ? "Seu resumo financeiro"
    : `Resumo de ${MONTH_NAMES[m.refDate.getMonth()]}`;
  return `<div class="screen-header">
    <div class="dash-greeting">
      <p class="dash-greeting__hello">${svgIcon(g.icon, 15, "dash-greeting__icon")}<span>${hello}</span></p>
      <h1 class="page-title">${title}</h1>
    </div>
    <div class="header-actions">
      <button class="icon-btn ${state.dashboardEditing ? "icon-btn--active" : ""}" data-action="dash-customize-toggle" aria-pressed="${state.dashboardEditing ? "true" : "false"}" aria-label="Personalizar os cartões do Início">${svgIcon("layout", 18)}</button>
      ${renderNotificationBell()}
      <div class="month-switcher">
        <button class="icon-btn" data-action="month-prev" aria-label="Mês anterior">${svgIcon("chevronLeft", 18)}</button>
        <span class="month-label">${MONTH_ABBR[m.refDate.getMonth()]} ${m.refDate.getFullYear()}</span>
        <button class="icon-btn" data-action="month-next" aria-label="Próximo mês" ${state.monthOffset >= 0 ? "disabled" : ""}>${svgIcon("chevronRight", 18)}</button>
      </div>
    </div>
  </div>`;
}

// [M8] Sino com contador. O badge mostra o NÃO LIDO, não o total: um número que
// nunca zera deixa de ser informação e vira decoração.
function renderNotificationBell() {
  const c = notificationCountsNow();
  const label = c.unread > 0
    ? `Notificações. ${c.unread} não ${c.unread === 1 ? "lida" : "lidas"}`
    : "Notificações";
  return `<button class="notif-bell ${c.urgent > 0 ? "notif-bell--urgent" : ""}" data-action="nav" data-tab="notifications" aria-label="${label}">
    ${svgIcon("bell", 19)}
    ${c.unread > 0 ? `<span class="notif-bell__badge">${c.unread > 9 ? "9+" : c.unread}</span>` : ""}
  </button>`;
}

// ---- Painel principal: saldo, entradas, gastos e economia do mês ----
function renderHeroCard(m) {
  const saved = m.month.savings;
  const savedTone = saved >= 0 ? "hero-chip--save" : "hero-chip--warn";
  const accounts = accountsSummary(state.data, todayIso());

  // OS TRÊS CHIPS PRECISAM FECHAR A CONTA ENTRE SI.
  //
  // Antes, "Receitas do mês" vinha de `effectiveIncome` (renda DECLARADA, que
  // projeta o mês inteiro) enquanto "Economia do mês" vinha de `savings`
  // (renda REALIZADA menos gastos). Lado a lado, no mesmo cartão, davam
  // R$ 5.420 − R$ 214,90 = −R$ 214,90, e quem fizesse a conta de cabeça
  // concluía, com razão, que o aplicativo estava errado.
  //
  // Agora os três saem da MESMA base, a realizada: receitas lançadas menos
  // despesas lançadas é exatamente a economia exibida. A renda declarada não
  // some da tela; vira a linha de aviso abaixo, que é o lugar honesto dela
  // enquanto o dinheiro não entrou de verdade.
  const rendaLancada = m.month.incomeRealized;
  const rendaPrevista = m.month.renda.planned;
  const rendaAReceber = m.month.partial ? subMoney(rendaPrevista, rendaLancada) : 0;
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <div class="hero-label-row"><p class="hero-label">${accounts.hasAccounts ? "Saldo em contas" : "Saldo calculado pelo histórico"}</p>${renderCalculationButton("accounts-balance")}</div>
    <p class="hero-value">${fmtBRL(accounts.cash)}</p>
    ${accounts.hasAccounts && accounts.cardDue > 0 ? `<p class="hero-reserved">${svgIcon("creditCard",14)} Após faturas abertas: <b>${fmtBRL(accounts.availableAfterCards)}</b></p>` : ""}
    ${m.worth.goals > 0 || m.worth.invested > 0
      ? `<p class="hero-reserved">${svgIcon("piggy", 14)} ${fmtBRL(addMoney(m.worth.goals, m.worth.invested))} em metas e investimentos (patrimônio, à parte deste saldo)</p>`
      : ""}
    ${rendaAReceber > 0
      ? `<p class="hero-reserved">${svgIcon("calendar", 14)} ${fmtBRL(rendaAReceber)} de renda declarada ainda não lançada neste mês</p>`
      : ""}
    ${/* O NÚMERO PRECISA CONFESSAR O QUE NÃO CONTA.
          Lançamento anterior à abertura da conta fica fora do saldo de
          propósito: o saldo inicial já embute o que veio antes dele. Só que ele
          continua entrando em "Despesas do mês", logo acima, e o painel passava
          a se contradizer em silêncio: a despesa aparecia e o saldo não se
          mexia. Dizer aqui, ao lado do número, é o que transforma isso de
          suspeita de erro em informação. */
      accounts.preOpening && accounts.preOpening.count
      ? `<p class="hero-reserved">${svgIcon("info", 14)} ${plural(accounts.preOpening.count, "lançamento anterior", "lançamentos anteriores")} à abertura das contas ${accounts.preOpening.count === 1 ? "está" : "estão"} fora deste saldo (${fmtBRL(accounts.preOpening.amount)})</p>`
      : ""}
    <div class="hero-chips">
      <div class="hero-chip hero-chip--in">${svgIcon("arrowUpRight", 17)}<div><span class="hero-chip__label">Receitas do mês</span><span class="hero-chip__value">${fmtBRL(rendaLancada)}</span></div></div>
      <div class="hero-chip hero-chip--out">${svgIcon("arrowDownRight", 17)}<div><span class="hero-chip__label">Despesas do mês</span><span class="hero-chip__value">${fmtBRL(m.month.expense)}</span></div></div>
      <div class="hero-chip ${savedTone}">${svgIcon(saved >= 0 ? "piggy" : "alertTriangle", 17)}<div><span class="hero-chip__label">Economia do mês</span><span class="hero-chip__value">${fmtBRL(saved)}</span></div></div>
    </div>
    <div class="hero-actions">
      <button class="hero-action hero-action--primary" data-action="nav" data-tab="add">${svgIcon("plus", 17)}Adicionar movimentação</button>
      ${dashboardHeroSecondaryActions().map((a) => `<button class="hero-action" data-action="nav" data-tab="${a.tab}">${svgIcon(a.icon, 15)}${a.label}</button>`).join("")}
    </div>
  </div>`;
}

function dashboardHeroSecondaryActions() {
  const d = state.data || {};
  const txCount = Array.isArray(d.transactions) ? d.transactions.length : 0;
  const hasAccounts = Array.isArray(d.accounts) && d.accounts.length > 0;
  const hasDebt = Array.isArray(d.assets) && d.assets.some((a) => a && (a.kind === "liability" || a.class === "divida"));
  const actions = [];

  if (hasDebt) actions.push({ tab: "debts", icon: "alertTriangle", label: "Planejar dívidas" });
  if (txCount === 0) actions.push({ tab: "import", icon: "upload", label: "Importar extrato" });
  else actions.push({ tab: "simulate", icon: "sparkles", label: "Simular gasto" });
  if (!hasAccounts) actions.push({ tab: "accounts", icon: "wallet", label: "Cadastrar conta" });
  else if (txCount === 0) actions.push({ tab: "accounts", icon: "wallet", label: "Ver contas" });

  return actions.slice(0, 2);
}

function renderScoreCard(m) {
  const s = m.score;
  if (!s) return "";
  if (s.insufficient) {
    return `<div class="card card--score span-1">
      <p class="card-title">Score financeiro</p>
      ${renderEmptyState("target", "Ainda não dá para calcular.", "Cadastre sua renda e alguns lançamentos para receber sua nota.")}
      <button class="btn btn--secondary btn--block btn--sm" data-action="nav" data-tab="settings">Informar minha renda</button>
      <button class="btn btn--ghost btn--block btn--sm" data-action="nav" data-tab="health">Ver saúde financeira</button>
    </div>`;
  }
  const expanded = state.scoreExpanded;
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };
  return `<div class="card card--score span-1">
    <div class="score-head">
      ${renderScoreGauge(s.score, s.level.color)}
      <div class="score-head__text">
        <p class="card-title" data-ui-css="margin:0">Score financeiro</p>
        <p class="score-level" data-ui-css="color:${s.level.color}">${s.level.label}</p>
        <p class="score-note">${escapeHtml(s.level.note)}</p>
      </div>
    </div>

    <div class="score-reasons">
      ${s.reasons.slice(0, expanded ? s.reasons.length : 3).map((r) => `<div class="score-reason">
        <span class="score-reason__mark" data-ui-css="color:${toneColor[r.tone]}">${svgIcon(r.tone === "positive" ? "checkCircle" : "alertTriangle", 14)}</span>
        <span class="score-reason__text">${escapeHtml(r.text)}</span>
      </div>`).join("")}
    </div>

    ${expanded ? `<div class="score-pillars">
      ${s.pillars.map((p) => {
        const pct = p.applicable ? Math.round(p.ratio * 100) : 0;
        const color = !p.applicable ? "var(--ink-faint)" : (p.ratio >= 0.7 ? "var(--positive)" : p.ratio >= 0.4 ? "var(--goal)" : "var(--negative)");
        return `<div class="score-pillar">
          <div class="score-pillar__head">
            <span class="score-pillar__label">${svgIcon(p.icon, 13)} ${escapeHtml(p.label)}</span>
            <span class="score-pillar__points" data-ui-css="color:${color}">${p.applicable ? `${fmtNum(p.points)}/${p.weight}` : "sem dados"}</span>
          </div>
          <div class="progress progress--sm" data-ui-css="margin:0"><div class="progress__fill" data-ui-css="width:${pct}%; background:${color}"></div></div>
          ${p.advice ? `<p class="score-pillar__advice">${escapeHtml(p.advice)}</p>` : ""}
        </div>`;
      }).join("")}
      <p class="footnote">Pilares sem dados suficientes ficam fora da média; a nota nunca é penalizada por informação que você ainda não cadastrou.</p>
    </div>` : ""}

    <button class="btn btn--secondary btn--block btn--sm" data-action="nav" data-tab="health" data-ui-css="margin-top:14px">${svgIcon("shieldCheck", 15)} Ver saúde financeira</button>

    <button class="score-toggle" data-action="toggle-score-detail">
      <span>${expanded ? "Ocultar detalhes" : "Ver como é calculado"}</span>${svgIcon(expanded ? "chevronUp" : "chevronDown", 15)}
    </button>
  </div>`;
}

// ---- Patrimônio: total, composição e evolução ----
function renderNetWorthCard(m) {
  const w = m.worth;
  const series = netWorthSeries(state.data, 6);
  const first = series[0].value;
  const last = series[series.length - 1].value;
  const delta = subMoney(last, first);
  const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : null;
  const up = delta >= 0;
  const trendColor = up ? "var(--positive)" : "var(--negative)";

  const parts = [
    { label: "Em conta", value: Math.max(0, w.cash), color: "var(--brand)" },
    { label: "Investimentos", value: w.invested, color: "var(--goal)" },
    { label: "Em metas", value: w.goals, color: "var(--positive)" },
  ];
  const sum = parts.reduce((acc, p) => acc + p.value, 0);

  return `<div class="card card--networth span-2">
    <div class="networth-head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Patrimônio</p>
        <p class="networth-value">${fmtBRL(w.total)}</p>
      </div>
      ${series.length > 1 ? `<span class="status-badge" data-ui-css="background:color-mix(in srgb, ${trendColor} 13%, transparent); color:${trendColor}">
        ${svgIcon(up ? "arrowUpRight" : "arrowDownRight", 12)} ${deltaPct == null ? fmtBRLShort(delta) : `${up ? "+" : ""}${fmtDec(deltaPct, 1)}%`}
      </span>` : ""}
    </div>

    ${renderSparkline(series, up ? "var(--brand)" : "var(--negative)")}
    <div class="networth-axis">${series.map((p) => `<span>${p.label}</span>`).join("")}</div>

    ${sum > 0 ? `<div class="segment-bar" data-ui-css="margin-top:14px">
      ${parts.filter((p) => p.value > 0).map((p) => `<div data-ui-css="flex:${p.value};background:${p.color}"></div>`).join("")}
    </div>` : ""}
    <div class="networth-legend">
      ${parts.map((p) => `<div class="networth-legend__item">
        <span class="cat-dot" data-ui-css="background:${p.color}"></span>
        <span class="networth-legend__label">${p.label}</span>
        <b>${fmtBRL(p.value)}</b>
      </div>`).join("")}
    </div>
    ${w.cash < 0 ? `<p class="footnote" data-ui-css="color:var(--negative)">Seu saldo em conta está negativo em ${fmtBRL(Math.abs(w.cash))}.</p>` : ""}
    <div class="networth-actions">
      ${renderCalculationButton("net-worth")}
      <button class="btn btn--secondary btn--sm" data-action="nav" data-tab="wealth">${svgIcon("layout", 15)} Patrimônio</button>
      <button class="btn btn--secondary btn--sm" data-action="nav" data-tab="invest">${svgIcon("trendUp", 15)} Carteira</button>
    </div>
  </div>`;
}

// ---- Reserva de emergência ----
function renderReserveCard(m) {
  const r = m.reserve;
  const meta = {
    ok:      { color: "var(--positive)", label: "Reserva completa" },
    partial: { color: "var(--goal)",     label: "Em construção" },
    low:     { color: "var(--negative)", label: "Reserva baixa" },
    empty:   { color: "var(--ink-faint)", label: "Sem reserva" },
  }[r.status];

  return `<div class="card card--reserve span-1">
    <div class="mini-card__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${meta.color} 14%, transparent); color:${meta.color}">${svgIcon("shieldCheck", 16)}</span>
      <div>
        <p class="card-title" data-ui-css="margin:0">Reserva de emergência</p>
        <p class="mini-card__sub" data-ui-css="color:${meta.color}">${meta.label}</p>
      </div>
    </div>
    <p class="mini-card__value">${fmtBRL(r.current)}</p>
    <div class="progress progress--sm"><div class="progress__fill" data-ui-css="width:${clamp(r.pct, 0, 100)}%; background:${meta.color}"></div></div>
    <p class="mini-card__note">
      ${r.monthlyNeed > 0
        ? `Cobre <b>${fmtDec(r.monthsCovered, 1)}</b> de ${r.targetMonths} meses de despesa (${fmtBRL(r.monthlyNeed)}/mês).`
        : "Registre alguns gastos para calcular quantos meses sua reserva cobre."}
    </p>
    ${!r.configured
      ? `<button class="btn btn--secondary btn--block btn--sm" data-action="nav" data-tab="goals">Criar meta de reserva</button>`
      : `<p class="footnote" data-ui-css="margin-top:8px">Alvo: ${fmtBRL(r.target)}</p>`}
  </div>`;
}

// ---- Meta financeira em destaque ----
function renderFeaturedGoalCard(m) {
  const f = m.goal;
  if (!f) {
    return `<div class="card card--goal-featured span-1">
      <p class="card-title">Meta financeira</p>
      ${renderEmptyState("target", "Nenhuma meta ativa.", "Defina um objetivo para dar destino ao que você economiza.")}
      <button class="btn btn--goal btn--block btn--sm" data-action="nav" data-tab="goals">Criar minha primeira meta</button>
    </div>`;
  }
  const g = f.goal;
  const color = f.done ? "var(--positive)" : "var(--goal)";
  return `<div class="card card--goal-featured span-1">
    <div class="mini-card__head">
      ${renderGoalRing(f.pct, color, g.icon, 44)}
      <div>
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(g.name)}</p>
        <p class="mini-card__sub" data-ui-css="color:${color}">${f.done ? `${svgIcon("checkCircle", 13)} Meta concluída` : `${f.pct.toFixed(0)}% concluída`}</p>
      </div>
    </div>
    <p class="mini-card__value">${fmtBRL(g.current)} <span class="mini-card__value-of">de ${fmtBRL(g.target)}</span></p>
    <div class="progress progress--sm"><div class="progress__fill" data-ui-css="width:${clamp(f.pct, 0, 100)}%; background:${color}"></div></div>
    <p class="mini-card__note">
      ${f.done ? "Você chegou lá. Que tal definir o próximo objetivo?"
        : f.daysLeft != null && f.daysLeft > 0
          ? `Faltam <b>${fmtBRL(f.remaining)}</b> e ${f.daysLeft} dias${f.monthlyNeeded ? `; cerca de ${fmtBRL(f.monthlyNeeded)}/mês.` : "."}`
          : f.daysLeft != null
            ? `Prazo vencido com <b>${fmtBRL(f.remaining)}</b> restantes.`
            : `Faltam <b>${fmtBRL(f.remaining)}</b> para concluir.`}
    </p>
    <button class="btn btn--goal-soft btn--block btn--sm" data-action="nav" data-tab="goals">Ver metas</button>
  </div>`;
}

// ---- Próximas contas (30 dias) ----
function renderUpcomingBillsCard(m) {
  const b = m.bills;
  if (b.items.length === 0) {
    // A janela é de 30 dias e parcela repete no MESMO dia do mês, ou seja, cai
    // quase sempre no dia 31. Quem tinha uma compra em 10x lia "nada previsto"
    // logo abaixo da promessa de que parcelas aparecem aqui sozinhas, e concluía
    // que o cartão não estava funcionando. Quando existe algo logo depois da
    // janela, o vazio passa a dizer quando é.
    const hoje = todayIso();
    const proxima = state.data.transactions
      .filter((t) => t.date > hoje)
      .reduce((menor, t) => (!menor || t.date < menor ? t.date : menor), "");
    const dica = proxima
      ? `O próximo compromisso já registrado é em ${fmtDateFull(proxima)}.`
      : "Parcelas e gastos fixos aparecem aqui automaticamente.";
    return `<div class="card card--upcoming span-1">
      <p class="card-title">Próximas contas</p>
      ${renderEmptyState("bell", "Nada previsto para os próximos 30 dias.", dica)}
      <button class="btn btn--ghost btn--block btn--sm" data-action="nav" data-tab="calendar">${svgIcon("calendar", 14)} Ver no calendário</button>
    </div>`;
  }
  const KIND_LABEL = { late: "Atrasada", recurring: "Prevista", scheduled: "Agendada" };
  const KIND_COLOR = { late: "var(--negative)", recurring: "var(--goal)", scheduled: "var(--ink-faint)" };
  return `<div class="card card--upcoming span-1">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Próximas contas</p>
        <p class="mini-card__sub">${b.items.length} nos próximos 30 dias</p>
      </div>
      <span class="leak-total">${fmtBRL(b.total)}</span>
    </div>
    <div class="bill-list">
      ${b.items.slice(0, 5).map((it) => `<div class="bill-row">
        <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${it.color} 14%, transparent); color:${it.color}">${svgIcon(it.icon, 14)}</span>
        <div class="bill-row__info">
          <p class="bill-row__label">${escapeHtml(it.label)}${it.installment ? ` <span class="bill-row__inst">${it.installment}</span>` : ""}</p>
          <p class="bill-row__meta" data-ui-css="color:${KIND_COLOR[it.kind]}">${KIND_LABEL[it.kind]} · ${fmtDateShort(it.date)}${it.kind !== "late" && it.daysLeft >= 0 ? ` · em ${it.daysLeft}d` : ""}</p>
        </div>
        <span class="bill-row__amount">${fmtBRL(it.amount)}</span>
      </div>`).join("")}
    </div>
    ${b.lateCount > 0 ? `<button class="btn btn--secondary btn--block btn--sm" data-action="carry-post-all">Lançar gastos fixos pendentes</button>` : ""}
    <button class="btn btn--ghost btn--block btn--sm" data-action="nav" data-tab="calendar">${svgIcon("calendar", 14)} Ver no calendário</button>
  </div>`;
}

// ---- Resumo inteligente do mês ----
function renderSmartSummaryCard(m) {
  const items = m.summary;
  if (!items || items.length === 0) return "";
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--brand)" };
  return `<div class="card card--summary span-3">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Resumo inteligente do mês</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Leitura automática dos seus números, calculada no seu aparelho</p>
      </div>
    </div>
    <div class="summary-grid">
      ${items.map((it) => `<div class="summary-item" data-ui-css="--tone:${tone[it.tone]}">
        <span class="summary-item__icon">${svgIcon(it.icon, 16)}</span>
        <p class="summary-item__text">${escapeHtml(it.text)}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderLeakCard(mKey) {
  const { leaks, totalLeak, count } = detectSilentLeaks(state.data, mKey);
  if (leaks.length === 0) return "";
  return `<div class="card card--leak span-3">
    <div class="leak-header">
      ${svgIcon("drop", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Vazamentos silenciosos</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Pequenos gastos que se somam sem você perceber</p>
      </div>
      <span class="leak-total">${fmtBRL(totalLeak)}</span>
    </div>
    <div class="leak-list">
      ${leaks.map((l) => `<div class="leak-row">
        <span class="cat-dot" data-ui-css="background:${l.color}"></span>
        <span class="leak-name">${escapeHtml(l.label)}</span>
        <span class="leak-count">${l.count}x</span>
        <span class="leak-value">${fmtBRL(l.total)}</span>
      </div>`).join("")}
    </div>
    <p class="footnote" data-ui-css="margin-top:10px">Já foram ${count} lançamentos pequenos (até ${fmtBRL(40)}) neste mês.</p>
  </div>`;
}

function renderCarryBanner(pending) {
  const names = pending.slice(0, 3).map((t) => escapeHtml(t.description || categoryById(state.data, t.categoryId).name)).join(", ");
  const extra = pending.length > 3 ? ` +${pending.length - 3}` : "";
  return `<div class="banner">
    ${svgIcon("info", 20, "banner__icon")}
    <div class="banner__text">
      <strong>Gastos fixos do mês passado</strong>
      <span>${names}${extra}; deseja lançar novamente esse mês?</span>
    </div>
    <div class="banner__actions">
      <button class="btn btn--ghost btn--sm" data-action="carry-dismiss">Agora não</button>
      <button class="btn btn--primary btn--sm" data-action="carry-post-all">Lançar todos</button>
    </div>
  </div>`;
}

// Teto de fatura do cartão (Feature 3): compara os gastos do mês pagos em
// "Crédito" com o limite desejado que o usuário definiu em Ajustes.
function renderCreditLimitCard(mKey) {
  const limit = state.data.creditCardLimit || 0;
  const spent = creditSpentInMonth(state.data, mKey);
  if (limit <= 0) {
    if (spent <= 0) return "";
    return `<div class="card card--dashed span-3 banner-inline">
      ${svgIcon("creditCard", 30, "banner-inline__icon")}
      <div class="banner-inline__text">
        <strong>Já gastou ${fmtBRL(spent)} no crédito este mês</strong>
        <span>Defina um teto de fatura em Ajustes para acompanhar o quanto ainda cabe.</span>
      </div>
      <button class="btn btn--primary btn--sm" data-action="nav" data-tab="settings">Definir</button>
    </div>`;
  }
  const ratio = safeRatio(spent, limit);
  const color = ratio < 0.8 ? "var(--positive)" : ratio <= 1 ? "var(--goal)" : "var(--negative)";
  const remaining = subMoney(limit, spent);
  return `<div class="card span-3">
    <div class="health-header">
      <p class="card-title">Fatura do cartão de crédito</p>
      <span class="status-badge" data-ui-css="background:color-mix(in srgb, ${color} 16%, transparent); color:${color}">${svgIcon("creditCard", 13)}${fmtBRL(spent)} de ${fmtBRL(limit)}</span>
    </div>
    <div class="progress"><div class="progress__fill" data-ui-css="width:${clamp(ratio * 100, 0, 100)}%; background:${color}"></div></div>
    <p class="health-note">${remaining >= 0
      ? `Ainda cabem <b data-ui-css="color:${color}">${fmtBRL(remaining)}</b> na fatura deste mês antes de estourar o teto.`
      : `Você já passou <b data-ui-css="color:var(--negative)">${fmtBRL(Math.abs(remaining))}</b> do teto definido para a fatura.`}</p>
  </div>`;
}

function renderBudgetHealth(refDate, isCurrentMonth, monthExpense, fixedSpent, variableSpent) {
  const mKey = keyOfDate(refDate);
  const income = effectiveIncome(state.data, mKey);
  const remaining = subMoney(income, monthExpense);

  // Este cartão é de PLANEJAMENTO: ele responde "do que você espera receber,
  // quanto ainda dá para gastar", e por isso usa a renda declarada mesmo antes
  // de ela cair na conta. O cartão do saldo, logo acima, responde outra coisa
  // ("o que de fato entrou menos o que saiu"). Os dois números são corretos e
  // diferentes: o defeito era chamar os dois de sobra sem dizer a base. Com a
  // renda ainda não lançada, os rótulos passam a dizer `prevista`.
  const baseRenda = incomeBasis(state.data, mKey);
  const rendaPrevista = baseRenda.partial && baseRenda.planned > baseRenda.realized;
  const rotuloRenda = rendaPrevista ? "Renda prevista" : "Renda";
  const rotuloSobra = rendaPrevista ? "Sobra prevista" : "Sobra";

  if (income <= 0) {
    // Mês fechado sem receita lançada NÃO é o mesmo que app sem renda
    // configurada. Para um mês passado `effectiveIncome` devolve o REALIZADO,
    // então bastava navegar um mês para trás para o app mandar "definir sua
    // renda mensal em Ajustes" - uma renda que já estava definida - com um
    // botão que levava a uma tela onde não havia nada a fazer. Quando existe
    // renda declarada, o que falta é lançamento, e é isso que a frase diz.
    // A renda declarada NÃO vale para mês encerrado, e isso é proposital
    // (`plannedIncome`): editar a renda hoje não pode reescrever indicadores
    // antigos. Por isso a pergunta aqui não é "existe plano para este mês", e
    // sim "existe renda configurada no app" - se existe, mandar configurar é
    // mandar fazer o que já foi feito, e o botão levava a uma tela sem nada a
    // resolver. O que falta num mês fechado é lançamento, não configuração.
    if (roundMoney(state.data.monthlyIncome || 0) > 0) {
      return `<div class="card card--dashed span-3 banner-inline">
        ${svgIcon("info", 34, "banner-inline__icon")}
        <div class="banner-inline__text">
          <strong>Nenhuma receita lançada em ${MONTH_NAMES[refDate.getMonth()]}</strong>
          <span>Sua renda declarada (${fmtBRL(state.data.monthlyIncome)} por mês) não é aplicada a meses já encerrados, para não reescrever o passado. Sem nenhuma entrada registrada aqui, não há base para calcular a sobra deste mês.</span>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="nav" data-tab="import">Importar extrato</button>
      </div>`;
    }
    return `<div class="card card--dashed span-3 banner-inline">
      ${svgIcon("shieldCheck", 34, "banner-inline__icon")}
      <div class="banner-inline__text">
        <strong>Veja se suas contas estão no azul</strong>
        <span>Defina sua renda mensal em Ajustes para eu calcular quanto você ainda pode gastar.</span>
      </div>
      <button class="btn btn--primary btn--sm" data-action="nav" data-tab="settings">Definir</button>
    </div>`;
  }

  let dayOfMonth = refDate.getDate(), dim = 30, daysLeft = 0, dailyBudget = 0, projected = monthExpense;
  if (isCurrentMonth) {
    const now = new Date();
    dayOfMonth = now.getDate();
    dim = daysInMonthOf(now.getFullYear(), now.getMonth());
    daysLeft = Math.max(1, dim - dayOfMonth + 1);
    dailyBudget = remaining > 0 ? divMoney(remaining, daysLeft) : 0;
    projected = dayOfMonth > 0 ? mulMoney(monthExpense, dim / dayOfMonth) : monthExpense;
  }
  const ratio = safeRatio(projected, income);
  let status;
  if (!isCurrentMonth) {
    status = remaining >= 0 ? { label: "Fechou no azul", color: COLOR_VARS.positive, icon: "checkCircle" } : { label: "Fechou no vermelho", color: COLOR_VARS.negative, icon: "alertTriangle" };
  } else if (ratio <= 0.9) {
    status = { label: "No controle", color: COLOR_VARS.positive, icon: "shieldCheck" };
  } else if (ratio <= 1.05) {
    status = { label: "Atenção ao ritmo", color: COLOR_VARS.goal, icon: "alertTriangle" };
  } else {
    status = { label: "Acima da renda", color: COLOR_VARS.negative, icon: "alertTriangle" };
  }

  const note = isCurrentMonth
    ? (remaining > 0
      // As duas metades respondem perguntas diferentes: a primeira é PREVISÃO
      // (seu ritmo de gastos extrapolado até o fim do mês), a segunda é TETO
      // (quanto da renda ainda cabe por dia). Sem dizer isso, a frase se
      // contradizia sozinha - "você fecha em R$ 246" ao lado de "pode gastar
      // R$ 957 por dia durante 5 dias" - e a leitura natural era que um dos
      // dois números estava errado.
      ? `No ritmo atual, o mês fecha em <b>${fmtBRL(projected)}</b> de gastos. O teto que ainda cabe na renda é de <b data-ui-css="color:${status.color}">${fmtBRL(dailyBudget)} por dia</b> nos próximos ${plural(daysLeft, "dia", "dias")}; é limite, não meta.`
      : `Você já ultrapassou sua renda em <b data-ui-css="color:var(--negative)">${fmtBRL(Math.abs(remaining))}</b> este mês. Vale segurar os gastos esporádicos até o próximo salário.`)
    : (remaining >= 0
      ? `Sobraram <b data-ui-css="color:var(--positive)">${fmtBRL(remaining)}</b> depois de todos os gastos do mês.`
      : `Os gastos superaram a renda em <b data-ui-css="color:var(--negative)">${fmtBRL(Math.abs(remaining))}</b> neste mês.`);

  return `<div class="card span-3">
    <div class="health-header">
      <p class="card-title">Saúde financeira do mês</p>
      <span class="status-badge" data-ui-css="background:color-mix(in srgb, ${status.color} 16%, transparent); color:${status.color}">${svgIcon(status.icon, 13)}${status.label}</span>
    </div>
    <div class="health-grid">
      <div class="health-stat"><span>${rotuloRenda}</span><b>${fmtBRL(income)}</b></div>
      <div class="health-stat"><span>Gastos fixos</span><b>${fmtBRL(fixedSpent)}</b></div>
      <div class="health-stat"><span>Esporádicos</span><b>${fmtBRL(variableSpent)}</b></div>
      <div class="health-stat"><span>${rotuloSobra}</span><b data-ui-css="color:${remaining >= 0 ? "var(--positive)" : "var(--negative)"}">${fmtBRL(remaining)}</b></div>
    </div>
    <div class="progress"><div class="progress__fill" data-ui-css="width:${clamp(safePct(monthExpense, income), 0, 100)}%; background:${status.color}"></div></div>
    <p class="health-note">${note}</p>
  </div>`;
}

// ==================================================================
// FEATURE 1. Regra x/x/x (Necessidades / Desejos / Futuro)
// Três barras de progresso que mostram, para o mês corrente, o quanto já
// foi gasto em cada grupo em relação ao percentual da renda combinado
// para aquele grupo (ex: 50% Necessidades, 30% Desejos, 20% Futuro).
// ==================================================================
function renderBudgetSplitCard(mKey) {
  const income = effectiveIncome(state.data, mKey);
  if (income <= 0) return "";
  const spend = monthGroupSpend(state.data, mKey);
  return `<div class="card span-3">
    <div class="health-header">
      <p class="card-title" data-ui-css="margin:0">Regra de orçamento (Necessidades / Desejos / Futuro)</p>
      <button class="icon-btn icon-btn--muted" data-action="nav" data-tab="settings" aria-label="Ajustar percentuais">${svgIcon("gear", 15)}</button>
    </div>
    <div class="split-bars">
      ${BUDGET_GROUPS.map((g) => {
        const pctAllowed = state.data.budgetSplit[g];
        const allocated = mulMoney(income, pctAllowed / 100);
        const spent = spend[g];
        const ratio = safeRatio(spent, allocated);
        const color = ratio < 0.85 ? "var(--positive)" : ratio <= 1 ? "var(--goal)" : "var(--negative)";
        return `<div class="split-bar-row">
          <div class="split-bar-row__head">
            <span class="split-bar-row__label">${svgIcon(GROUP_ICONS[g], 14)}${GROUP_LABELS[g]} <span class="split-bar-row__pct">${pctAllowed}%</span></span>
            <span class="split-bar-row__value" data-ui-css="color:${color}">${fmtBRL(spent)} <span class="cat-value-muted">/ ${fmtBRL(allocated)}</span></span>
          </div>
          <div class="progress"><div class="progress__fill" data-ui-css="width:${clamp(ratio * 100, 0, 100)}%; background:${color}"></div></div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

// ==================================================================
// FEATURE 2. Assistente financeiro (motor de regras)
// ==================================================================
function renderAssistantCard(mKey) {
  const alerts = getAssistantAlerts(state.data, mKey);
  if (alerts.length === 0) return "";
  const severityColor = { danger: "var(--negative)", warn: "var(--goal)", info: "var(--brand)" };
  const severityBg = { danger: "var(--negative-soft)", warn: "var(--goal-soft)", info: "var(--brand-soft)" };
  return `<div class="card card--assistant span-3 span-mt">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Assistente financeiro</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Alertas automáticos com base no seu mês, calculados no seu aparelho</p>
      </div>
    </div>
    <div class="assistant-alert-list">
      ${alerts.map((a) => `<div class="assistant-alert" data-ui-css="background:${severityBg[a.severity]}">
        <span class="assistant-alert__icon" data-ui-css="color:${severityColor[a.severity]}">${svgIcon(a.icon, 17)}</span>
        <div class="assistant-alert__text">
          <strong>${escapeHtml(a.title)}</strong>
          <span>${escapeHtml(a.message)}</span>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderCategoryBreakdown(catRows, monthExpense) {
  if (catRows.length === 0) return renderEmptyState("pie", "Sem gastos registrados neste mês.");
  const segHtml = catRows.map((c) => `<div data-ui-css="flex:${Math.max(c.value, 0.01)};background:${c.color}"></div>`).join("");
  const rows = catRows.slice(0, 6).map((c) => {
    if (c.budget) {
      const ratio = safeRatio(c.value, c.budget);
      const color = ratio < 0.8 ? "var(--positive)" : ratio <= 1 ? "var(--goal)" : "var(--negative)";
      return `<div class="cat-row">
        <span class="cat-dot" data-ui-css="background:${c.color}"></span>
        <span class="cat-name">${escapeHtml(c.name)}</span>
        <span class="cat-value">${fmtBRL(c.value)} <span class="cat-value-muted">/ ${fmtBRL(c.budget)}</span></span>
      </div>
      <div class="progress progress--sm"><div class="progress__fill" data-ui-css="width:${clamp(ratio * 100, 0, 100)}%; background:${color}"></div></div>`;
    }
    // Sem teto definido a linha mostrava SÓ o percentual, e o cartão ficava com
    // duas gramáticas misturadas: "Moradia R$ 1.250,50 / R$ 1.000,00" ao lado de
    // "Mercado 12%". Num cartão chamado "Para onde foi o dinheiro", o dinheiro é
    // o dado que não pode faltar; a fatia do mês entra como complemento.
    const pct = safePct(c.value, monthExpense);
    return `<div class="cat-row">
      <span class="cat-dot" data-ui-css="background:${c.color}"></span>
      <span class="cat-name">${escapeHtml(c.name)}</span>
      <span class="cat-value">${fmtBRL(c.value)} <span class="cat-value-muted">· ${pct.toFixed(0)}% do mês</span></span>
    </div>`;
  }).join("");
  return `<div class="segment-bar">${segHtml}</div><div class="cat-list">${rows}</div>`;
}

function renderCategoryBudgetsCard(mKey) {
  const status = computeBudgetStatus(state.data, mKey);
  if (status.items.length === 0) {
    // Sem nenhum teto definido: convite curto, só no mês corrente.
    if (mKey !== keyOfCurrentMonth()) return "";
    return `<div class="card card--dashed span-3 banner-inline">
      ${svgIcon("target", 30, "banner-inline__icon")}
      <div class="banner-inline__text">
        <strong>Defina um teto mensal por categoria</strong>
        <span>Você recebe um aviso ao chegar em 80% e outro ao estourar o limite.</span>
      </div>
      <button class="btn btn--primary btn--sm" data-action="nav" data-tab="settings">Definir</button>
    </div>`;
  }

  const shown = state.budgetsExpanded ? status.items : status.items.slice(0, 3);
  const totalPct = safePct(status.totals.spent, status.totals.budget);
  const headline = status.counts.over > 0
    ? { text: plural(status.counts.over, "orçamento estourado", "orçamentos estourados"), color: "var(--negative)" }
    : status.counts.warn > 0
      ? { text: `${status.counts.warn} perto do limite`, color: "var(--goal)" }
      : { text: "Tudo dentro do limite", color: "var(--positive)" };

  return `<div class="card span-3">
    <div class="health-header">
      <div class="budgets-head">
        <p class="card-title" data-ui-css="margin:0">Orçamentos por categoria</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${fmtBRL(status.totals.spent)} de ${fmtBRL(status.totals.budget)} · ${Math.round(totalPct)}% do teto total</p>
      </div>
      <span class="status-badge" data-ui-css="background:color-mix(in srgb, ${headline.color} 16%, transparent); color:${headline.color}">
        ${svgIcon(status.counts.over > 0 ? "alertTriangle" : "shieldCheck", 13)}${headline.text}
      </span>
    </div>

    <div class="budget-list">
      ${shown.map((b) => renderBudgetRow(b, status.thresholds)).join("")}
    </div>

    ${status.items.length > 3 ? `<button class="btn btn--ghost btn--sm btn--block" data-ui-css="margin-top:8px" data-action="toggle-budgets">
      ${state.budgetsExpanded ? "Mostrar menos" : `Ver todos os ${status.items.length} orçamentos`}
      ${svgIcon(state.budgetsExpanded ? "chevronUp" : "chevronDown", 14)}
    </button>` : ""}
  </div>`;
}

function renderBudgetRow(b, thresholds) {
  const meta = b.levelMeta;
  const pctCapped = clamp(b.pct, 0, 100);
  // Marcador visual da faixa de atenção (80% por padrão) desenhado sobre a barra.
  const warnMark = clamp(thresholds.warn, 0, 100);
  return `<div class="budget-row budget-row--${b.level}">
    <div class="budget-row__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${b.color} 14%, transparent); color:${b.color}">${svgIcon(b.icon, 14)}</span>
      <span class="budget-row__name">${escapeHtml(b.name)}${b.isParent ? `<span class="budget-row__hint"> · inclui ${plural(b.childCount, "subcategoria", "subcategorias")}</span>` : ""}</span>
      <span class="budget-row__value" data-ui-css="color:${meta.color}">${fmtBRL(b.spent)}<span class="cat-value-muted"> / ${fmtBRL(b.budget)}</span></span>
    </div>
    <div class="progress budget-progress">
      <div class="progress__fill" data-ui-css="width:${pctCapped}%; background:${meta.color}"></div>
      <span class="budget-progress__mark" data-ui-css="left:${warnMark}%" title="Alerta em ${thresholds.warn}%"></span>
    </div>
    <p class="budget-row__note">
      ${b.level === "over"
        ? `<b data-ui-css="color:var(--negative)">Estourou em ${fmtBRL(Math.abs(b.remaining))}</b> (${Math.round(b.pct)}% do teto).`
        : b.level === "warn"
          ? `<b data-ui-css="color:var(--goal)">${Math.round(b.pct)}% usado.</b> Restam ${fmtBRL(b.remaining)}${b.dailyAllowance != null ? `; cerca de ${fmtBRL(b.dailyAllowance)} por dia nos próximos ${b.daysLeft} dias` : ""}.`
          : b.willExceed
            ? `${Math.round(b.pct)}% usado. <b data-ui-css="color:var(--goal)">No ritmo atual você fecha em ${fmtBRL(b.projected)}</b> e estoura o teto.`
            : `${Math.round(b.pct)}% usado. Restam ${fmtBRL(b.remaining)}${b.dailyAllowance != null ? ` (${fmtBRL(b.dailyAllowance)}/dia)` : ""}.`}
    </p>
  </div>`;
}
