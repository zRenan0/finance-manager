// js/screens/analytics.js. Análises: extrato, projeções e o cartão de análise por IA.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// ANALYTICS
// ==================================================================
function movementFiltersSnapshot() {
  return {
    ...state.movementFilters,
    period: state.analyticsPeriod,
    start: state.analyticsCustomStart,
    end: state.analyticsCustomEnd,
    search: state.analyticsSearch,
  };
}

function renderMovementSummary(model) {
  return `<div class="movement-summary" aria-label="Resumo do resultado">
    <div class="movement-summary__item"><span>Entradas</span><b class="tx-amount--income">${fmtBRL(model.income)}</b></div>
    <div class="movement-summary__item"><span>Saídas</span><b class="tx-amount--expense">${fmtBRL(model.expense)}</b></div>
    <div class="movement-summary__item"><span>Saldo</span><b>${fmtBRL(model.balance)}</b></div>
    <div class="movement-summary__item"><span>Movimentos</span><b>${model.count}</b></div>
  </div>`;
}

function renderMovementFilters() {
  const f = state.movementFilters;
  const sourceOptions = [
    ["", "Todas as origens"], ["manual", "Manual"], ["import-ofx", "Extrato OFX"],
    ["import-csv", "Extrato CSV"], ["import-pdf", "PDF bancário"], ["nlp", "Lançamento inteligente"], ["qrcode-pix", "QR Pix"],
    ["qrcode-nfce", "QR nota fiscal"], ["transfer", "Transferência"], ["card-payment", "Pagamento de fatura"],
  ];
  return `<div class="movement-filters ${state.movementFiltersOpen ? "movement-filters--open" : ""}">
    <div class="search-row movement-search">
      <span class="search-icon">${svgIcon("search", 16)}</span>
      <input id="analytics-search" class="input input--search" data-field="search" value="${escapeHtml(state.analyticsSearch)}" placeholder="Buscar" aria-label="Buscar por descrição, valor, conta ou origem" title="Buscar por descrição, valor, conta ou origem" autocomplete="off" />
      ${state.analyticsSearch ? `<button class="icon-btn" data-action="movement-search-clear" aria-label="Limpar busca">${svgIcon("x", 16)}</button>` : ""}
    </div>
    <button class="btn btn--secondary movement-filter-toggle" data-action="movement-filters-toggle" aria-expanded="${state.movementFiltersOpen}">${svgIcon("filter", 16)} Filtros</button>
    <button class="btn btn--secondary movement-filter-toggle" data-action="export-statement-pdf" title="Baixar o extrato do período em PDF">${svgIcon("download", 16)} PDF</button>
    <div class="movement-filters__advanced">
      <div class="field"><label class="field__label" for="movement-type">Tipo</label><select id="movement-type" class="input" data-action-select="movement-type">
        ${[["all", "Todos"], ["income", "Entradas"], ["expense", "Saídas"], ["transfer", "Transferências"], ["card-payment", "Pagamentos de fatura"]].map(([id, label]) => `<option value="${id}" ${f.type === id ? "selected" : ""}>${label}</option>`).join("")}
      </select></div>
      <div class="field"><label class="field__label" for="movement-category">Categoria</label><select id="movement-category" class="input" data-action-select="movement-category">
        <option value="">Todas as categorias</option>${state.data.categories.map((c) => `<option value="${c.id}" ${f.categoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select></div>
      <div class="field"><label class="field__label" for="movement-account">Conta ou cartão</label><select id="movement-account" class="input" data-action-select="movement-account">
        <option value="">Todas as contas e cartões</option>
        ${(state.data.accounts || []).map((a) => `<option value="${a.id}" ${f.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
        ${(state.data.creditCards || []).map((c) => `<option value="${c.id}" ${f.accountId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select></div>
      <div class="field"><label class="field__label" for="movement-source">Origem</label><select id="movement-source" class="input" data-action-select="movement-source">
        ${sourceOptions.map(([id, label]) => `<option value="${id}" ${f.source === id ? "selected" : ""}>${label}</option>`).join("")}
      </select></div>
      <button class="btn btn--ghost" data-action="movement-filters-clear">Limpar filtros</button>
    </div>
  </div>`;
}

function renderMovementEntry(entry) {
  const source = movementSourceMeta(entry.source, entry.origin);
  const selected = state.movementSelectedIds.includes(entry.id);
  const amountClass = entry.type === "income" ? "tx-amount--income" : entry.type === "expense" ? "tx-amount--expense" : "";
  const sign = entry.type === "income" ? "+" : entry.type === "expense" ? "-" : "";
  const icon = entry.type === "income" ? "trendUp" : entry.type === "expense" ? (entry.transaction ? categoryById(state.data, entry.categoryId).icon : "arrowRight") : entry.kind === "transfer" ? "arrowRight" : "creditCard";
  return `<div class="movement-row ${selected ? "movement-row--selected" : ""}">
    ${entry.kind === "transaction" ? `<label class="movement-check" aria-label="Selecionar ${escapeHtml(entry.description)}"><input type="checkbox" data-action-select="movement-select" data-id="${entry.id}" ${selected ? "checked" : ""} /></label>` : `<span class="movement-check movement-check--empty" aria-hidden="true"></span>`}
    <span class="icon-bubble">${svgIcon(icon, 18)}</span>
    <button class="movement-row__main" data-action="${entry.kind === "transaction" ? "edit-tx" : "movement-detail"}" data-id="${entry.id}">
      <span class="tx-title">${escapeHtml(entry.description)}</span>
      <span class="tx-meta">${escapeHtml(entry.categoryName)}${entry.accountName ? `, ${escapeHtml(entry.accountName)}` : ""}${entry.cardName ? `, ${escapeHtml(entry.cardName)}` : ""}</span>
      <span class="movement-origin">${svgIcon(source.icon, 12)} ${escapeHtml(source.label)}</span>
    </button>
    <span class="tx-amount ${amountClass}">${sign}${fmtBRL(entry.amount)}</span>
    <button class="icon-btn" data-action="movement-detail" data-id="${entry.id}" aria-label="Ver origem e histórico">${svgIcon("info", 16)}</button>
  </div>`;
}

function renderMovementList(model) {
  if (!model.entries.length) return renderEmptyState("search", state.data.transactions.length ? "Nenhum movimento encontrado" : "Nenhuma movimentação cadastrada", state.data.transactions.length ? "Revise a busca ou limpe os filtros." : "Os lançamentos aparecerão aqui depois de serem adicionados.");
  const shownIds = new Set(model.entries.slice(0, state.analyticsLimit).map((entry) => entry.id));
  const groups = model.groups.map((group) => ({ ...group, entries: group.entries.filter((entry) => shownIds.has(entry.id)) })).filter((group) => group.entries.length);
  return `<div class="movement-groups">${groups.map((group) => `<section class="movement-day"><h2>${fmtDateFull(group.date)}</h2>${group.entries.map(renderMovementEntry).join("")}</section>`).join("")}</div>
    ${model.entries.length > shownIds.size ? `<button class="btn btn--secondary btn--block" data-action="load-more">Carregar mais (${model.entries.length - shownIds.size} restantes)</button>` : ""}`;
}

function renderMovementBulkBar() {
  const count = state.movementSelectedIds.length;
  if (!count) return "";
  return `<div class="movement-bulk" role="region" aria-label="Ações em lote">
    <b>${count} selecionado${count === 1 ? "" : "s"}</b>
    <label class="sr-only" for="movement-bulk-category">Nova categoria</label>
    <select id="movement-bulk-category" class="input" data-action-select="movement-bulk-category"><option value="">Escolher categoria</option>${state.data.categories.map((c) => `<option value="${c.id}" ${state.movementBulkCategoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
    <button class="btn btn--secondary" data-action="movement-bulk-apply" ${state.movementBulkCategoryId ? "" : "disabled"}>Aplicar categoria</button>
    <button class="btn btn--danger" data-action="movement-bulk-delete">${svgIcon("trash", 15)} Excluir</button>
    <button class="icon-btn" data-action="movement-selection-clear" aria-label="Limpar seleção">${svgIcon("x", 16)}</button>
  </div>`;
}

function renderReviewIssue(issue) {
  const tx = issue.txId ? state.data.transactions.find((item) => item.id === issue.txId) : null;
  const icon = { category: "tag", duplicate: "file", transfer: "arrowRight", "card-payment": "creditCard", "invoice-income": "creditCard", account: "bank" }[issue.type] || "alertTriangle";
  let action = "";
  // `data-ids` carrega o grupo inteiro (as N parcelas de uma compra). O
  // `data-id` continua sendo a linha que representa o item na lista.
  const issueIds = (issue.txIds && issue.txIds.length ? issue.txIds : [issue.txId]).filter(Boolean).join(" ");
  if (issue.type === "category" && tx) action = `<select class="input review-category" data-action-select="review-category" data-id="${tx.id}" data-ids="${issueIds}" data-key="${issue.key}"><option value="">Escolher categoria</option>${state.data.categories.filter((c) => c.id !== "outros").map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>`;
  if (issue.type === "duplicate") action = `<button class="btn btn--secondary" data-action="review-delete-duplicate" data-id="${issue.txId}" data-key="${issue.key}">Revisar e excluir cópia</button>`;
  if (issue.type === "transfer") action = `<button class="btn btn--secondary" data-action="review-convert-transfer" data-id="${issue.txId}" data-key="${issue.key}">Converter em transferência</button>`;
  if (issue.type === "card-payment") action = `<button class="btn btn--secondary" data-action="review-card-payment-open" data-id="${issue.txId}" data-key="${issue.key}">Converter em pagamento</button>`;
  if (issue.type === "invoice-income") action = `<button class="btn btn--secondary" data-action="review-delete-invoice-income" data-id="${issue.txId}" data-key="${issue.key}">Excluir a receita</button>`;
  if (issue.type === "account") action = `<button class="btn btn--secondary" data-action="review-reconcile-account" data-id="${issue.accountId}">Conferir saldo</button>`;
  return `<article class="review-issue">
    <span class="review-issue__icon">${svgIcon(icon, 18)}</span>
    <div class="review-issue__copy"><b>${escapeHtml(issue.title)}</b><span>${escapeHtml(issue.detail)}</span><small>${fmtDateShort(issue.date)}, ${fmtBRL(issue.amount)}</small></div>
    <div class="review-issue__actions">${action}${issue.txId ? `<button class="btn btn--ghost" data-action="review-ignore" data-id="${issue.txId}" data-ids="${issueIds}" data-key="${issue.key}">Marcar como revisado</button>` : ""}</div>
  </article>`;
}

function renderMovementReview(review) {
  return `<section class="card movement-review ${state.movementReviewOpen ? "movement-review--open" : ""}">
    <button class="movement-review__header" data-action="movement-review-toggle" aria-expanded="${state.movementReviewOpen}">
      <span class="review-count">${review.issues.length}</span><span><b>Caixa de revisão</b><small>${review.issues.length ? "Sugestões que precisam da sua decisão" : "Nenhuma pendência encontrada"}</small></span>${svgIcon(state.movementReviewOpen ? "chevronUp" : "chevronDown", 18)}
    </button>
    ${state.movementReviewOpen ? `<div class="movement-review__body">${review.issues.length ? review.issues.map(renderReviewIssue).join("") : renderEmptyState("checkCircle", "Tudo revisado", "Novas sugestões aparecerão aqui quando necessário.")}</div>` : ""}
  </section>`;
}

function renderMovementsCenter() {
  const model = buildMovementCenterModel(state.data, movementFiltersSnapshot());
  const review = buildTransactionReviewModel(state.data);
  return `<div class="screen">
    <div class="page-heading"><div><h1 class="page-title">Movimentações</h1><p class="page-subtitle">Consulte, corrija e confira a origem dos seus dados.</p></div><button class="btn btn--primary" data-action="nav" data-tab="add">${svgIcon("plus", 16)} Adicionar</button></div>
    <div class="segmented movement-view-tabs"><button class="segmented__option active" data-action="analytics-view" data-value="movements">Movimentações</button><button class="segmented__option" data-action="analytics-view" data-value="reports">Relatórios</button></div>
    ${renderMovementReview(review)}
    <div class="card span-mt">${renderMovementFilters()}
      <div class="segmented movement-periods"><button class="segmented__option ${state.analyticsPeriod === "semana" ? "active" : ""}" data-action="set-period" data-value="semana">Semana</button><button class="segmented__option ${state.analyticsPeriod === "mes" ? "active" : ""}" data-action="set-period" data-value="mes">Mês</button><button class="segmented__option ${state.analyticsPeriod === "ano" ? "active" : ""}" data-action="set-period" data-value="ano">Ano</button><button class="segmented__option ${state.analyticsPeriod === "all" ? "active" : ""}" data-action="set-period" data-value="all">Tudo</button><button class="segmented__option ${state.analyticsPeriod === "custom" ? "active" : ""}" data-action="set-period" data-value="custom">Período</button></div>
      ${state.analyticsPeriod === "custom" ? `<div class="field-row movement-dates"><div class="field"><label class="field__label" for="an-start">De</label><input id="an-start" type="date" class="input" data-field="period-custom-start" value="${state.analyticsCustomStart}" /></div><div class="field"><label class="field__label" for="an-end">Até</label><input id="an-end" type="date" class="input" data-field="period-custom-end" value="${state.analyticsCustomEnd}" /></div></div>` : ""}
      ${renderMovementSummary(model)}${renderMovementBulkBar()}<div id="tx-history-section">${renderMovementList(model)}</div>
    </div>
  </div>`;
}

function renderAnalyticsScreen() {
  return state.analyticsView === "reports" ? renderAnalyticsReportsScreen() : renderMovementsCenter();
}

function filteredTransactionsForPeriod() {
  const now = new Date();
  return state.data.transactions.filter((t) => {
    const d = new Date(t.date + "T00:00:00");
    if (state.analyticsPeriod === "semana") { const diff = (now - d) / 86400000; return diff >= 0 && diff <= 7; }
    if (state.analyticsPeriod === "mes") return monthKeyOf(t.date) === keyOfDate(now);
    if (state.analyticsPeriod === "ano") return t.date.slice(0, 4) === String(now.getFullYear());
    if (state.analyticsPeriod === "custom") return t.date >= state.analyticsCustomStart && t.date <= state.analyticsCustomEnd;
    return true;
  });
}

function historyFiltered() {
  const searchLower = state.analyticsSearch.trim().toLowerCase();
  return [...state.data.transactions]
    .filter((t) => !searchLower || (t.description || "").toLowerCase().includes(searchLower) || categoryById(state.data, t.categoryId).name.toLowerCase().includes(searchLower))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
}

function renderTxHistorySection() {
  const historyAll = historyFiltered();
  const historyShown = historyAll.slice(0, state.analyticsLimit);
  if (historyShown.length === 0) return renderEmptyState("search", "Nenhum resultado encontrado.");
  return `
    <div class="tx-list" data-ui-css="margin-top:8px">${historyShown.map((t) => renderTxRow(t)).join("")}</div>
    ${historyAll.length > historyShown.length ? `<button class="btn btn--secondary btn--block" data-ui-css="margin-top:12px" data-action="load-more">Carregar mais (${historyAll.length - historyShown.length} restantes)</button>` : ""}
  `;
}

function renderAnalyticsReportsScreen() {
  const filtered = filteredTransactionsForPeriod();
  // Só consumo entra no relatório de gastos por categoria; o total logo abaixo
  // compara com `realizedMonthTotals`, que usa a mesma régua.
  const expenses = filtered.filter(isConsumptionTx);
  const total = sumMoney(expenses, (t) => t.amount);
  const byCategory = {};
  filtered.forEach((t) => {
    const cents = consumptionCentsOf(t);
    if (!cents) return;
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + cents;
  });
  const catRows = Object.entries(byCategory)
    .map(([id, cents]) => { const c = categoryById(state.data, id); return { id, value: moneyFromCents(cents), name: c.name, color: c.color }; })
    .sort((a, b) => b.value - a.value);

  const now = new Date();
  const thisKey = keyOfDate(now);
  const lastKey = keyOfDate(addMonths(now, -1));
  const thisMonthTotal = realizedMonthTotals(state.data, thisKey).expense;
  const lastMonthTotal = realizedMonthTotals(state.data, lastKey).expense;
  const delta = lastMonthTotal > 0 ? safePct(subMoney(thisMonthTotal, lastMonthTotal), lastMonthTotal) : (thisMonthTotal > 0 ? 100 : 0);
  const riskAlert = creditRiskAlert(state.data, thisKey);

  return `<div class="screen">
    <div class="page-heading"><div><h1 class="page-title">Relatórios</h1><p class="page-subtitle">Gráficos, projeções e análises dos seus dados.</p></div></div>
    <div class="segmented movement-view-tabs"><button class="segmented__option" data-action="analytics-view" data-value="movements">Movimentações</button><button class="segmented__option active" data-action="analytics-view" data-value="reports">Relatórios</button></div>

    ${riskAlert.trigger ? `
    <div class="card card--leak span-mt" data-ui-css="border-color:var(--negative)">
      <div class="leak-header">
        ${svgIcon("alertTriangle", 18, "leak-header__icon")}
        <div>
          <p class="card-title" data-ui-css="margin:0">Atenção: Você está financiando grande parte dos seus gastos diários no crédito. Cuidado com o acúmulo de faturas.</p>
          <p class="card-subtitle" data-ui-css="margin:2px 0 0">${(riskAlert.pct * 100).toFixed(0)}% dos seus gastos do dia a dia este mês (${fmtBRL(riskAlert.creditTotal)} de ${fmtBRL(riskAlert.variableTotal)}) foram no Crédito.</p>
        </div>
      </div>
    </div>` : ""}

    <div class="segmented">
      <button class="segmented__option ${state.analyticsPeriod === "semana" ? "active" : ""}" data-action="set-period" data-value="semana">Semana</button>
      <button class="segmented__option ${state.analyticsPeriod === "mes" ? "active" : ""}" data-action="set-period" data-value="mes">Mês</button>
      <button class="segmented__option ${state.analyticsPeriod === "ano" ? "active" : ""}" data-action="set-period" data-value="ano">Ano</button>
      <button class="segmented__option ${state.analyticsPeriod === "all" ? "active" : ""}" data-action="set-period" data-value="all">Tudo</button>
      <button class="segmented__option ${state.analyticsPeriod === "custom" ? "active" : ""}" data-action="set-period" data-value="custom">Período</button>
    </div>

    ${state.analyticsPeriod === "custom" ? `
      <div class="field-row" data-ui-css="margin-top:12px">
        <div class="field"><label class="field__label" for="an-start">De</label><input id="an-start" type="date" class="input" data-field="period-custom-start" value="${state.analyticsCustomStart}" /></div>
        <div class="field"><label class="field__label" for="an-end">Até</label><input id="an-end" type="date" class="input" data-field="period-custom-end" value="${state.analyticsCustomEnd}" /></div>
      </div>` : ""}

    <div class="grid-2 span-mt">
      <div class="card">
        <p class="card-title">Gastos por categoria</p>
        ${catRows.length === 0 ? renderEmptyState("pie", "Sem dados no período selecionado.") : `
          <div class="donut-wrap">${renderDonut(catRows)}</div>
          <div class="cat-list" data-ui-css="margin-top:8px">
            ${catRows.map((c) => {
              const pct = safePct(c.value, total);
              return `<div class="cat-row">
                <span class="cat-dot" data-ui-css="background:${c.color}"></span>
                <span class="cat-name">${escapeHtml(c.name)}</span>
                <span class="cat-value">${fmtBRL(c.value)} <span class="cat-value-muted">· ${pct.toFixed(0)}%</span></span>
              </div>
              <div class="progress progress--sm"><div class="progress__fill" data-ui-css="width:${pct}%; background:${c.color}"></div></div>`;
            }).join("")}
          </div>`}
      </div>

      <div class="card">
        <p class="card-title">Este mês vs. mês anterior</p>
        <div class="compare-row">
          <div><span class="compare-label">${MONTH_NAMES[addMonths(now, -1).getMonth()]}</span><b>${fmtBRL(lastMonthTotal)}</b></div>
          <div><span class="compare-label">${MONTH_NAMES[now.getMonth()]}</span><b>${fmtBRL(thisMonthTotal)}</b></div>
          <span class="status-badge" data-ui-css="background:${delta > 0 ? "color-mix(in srgb, var(--negative) 14%, transparent)" : "color-mix(in srgb, var(--positive) 14%, transparent)"}; color:${delta > 0 ? "var(--negative)" : "var(--positive)"}">
            ${svgIcon(delta > 0 ? "arrowUpRight" : "arrowDownRight", 13)}${Math.abs(delta).toFixed(0)}%
          </span>
        </div>
        <p class="card-title" data-ui-css="margin-top:18px">Últimos 6 meses</p>
        ${renderTrendChart(last6MonthsSummary(state.data))}
        <div class="trend-legend"><span><i data-ui-css="background:var(--brand)"></i>Entradas</span><span><i data-ui-css="background:var(--negative)"></i>Gastos</span></div>
      </div>
    </div>

    ${renderProjectionCard()}

    ${renderInstallmentProjectionCard()}

    <div class="card span-mt card--wrapped-cta">
      <div class="leak-header">
        ${svgIcon("sparkles", 18, "leak-header__icon")}
        <div><p class="card-title" data-ui-css="margin:0">Resumo do mês em imagem</p><p class="card-subtitle" data-ui-css="margin:2px 0 0">Gere um cartão estilo "wrapped" para salvar ou compartilhar</p></div>
      </div>
      <button class="btn btn--secondary btn--block" data-ui-css="margin-top:10px" data-action="open-wrapped">${svgIcon("camera", 16)} Gerar resumo visual</button>
    </div>

    ${renderAiCard()}

    <div class="card span-mt">
      <p class="card-title">Histórico completo</p>
      <div class="search-row">
        <span class="search-icon">${svgIcon("search", 16)}</span>
        <input id="analytics-search" class="input input--search" data-field="search" value="${escapeHtml(state.analyticsSearch)}" placeholder="Buscar por descrição ou categoria" autocomplete="off" />
      </div>
      <div id="tx-history-section">${renderTxHistorySection()}</div>
    </div>
  </div>`;
}

// Soma todos os lançamentos futuros já engatilhados por parcelamentos no crédito,
// agrupados por mês, para o usuário enxergar o tamanho das próximas faturas.
function creditInstallmentProjection(data) {
  const today = todayIso();
  const future = data.transactions.filter((t) => t.installmentGroupId && t.type === "expense" && t.date > today);
  const byMonth = {};
  future.forEach((t) => { byMonth[monthKeyOf(t.date)] = (byMonth[monthKeyOf(t.date)] || 0) + moneyToCents(t.amount); });
  const months = Object.keys(byMonth).sort().map((key) => {
    const [y, m] = key.split("-").map(Number);
    return { key, label: `${MONTH_ABBR[m - 1]}/${String(y).slice(2)}`, value: moneyFromCents(byMonth[key]) };
  });
  const total = sumMoney(months, (m) => m.value);
  return { total, months };
}

function renderInstallmentProjectionCard() {
  const p = creditInstallmentProjection(state.data);
  return `<div class="card span-mt">
    <p class="card-title">Projeção de faturas</p>
    <p class="card-subtitle">Parcelas do crédito já lançadas para os próximos meses</p>
    ${p.months.length === 0 ? renderEmptyState("creditCard", "Nenhuma parcela futura em aberto no momento.") : `
      <div class="cat-list" data-ui-css="margin-top:8px">
        ${p.months.map((m) => {
          const pct = safePct(m.value, p.total);
          return `<div class="cat-row">
            <span class="cat-dot" data-ui-css="background:var(--goal)"></span>
            <span class="cat-name">${m.label}</span>
            <span class="cat-value">${fmtBRL(m.value)}</span>
          </div>
          <div class="progress progress--sm"><div class="progress__fill" data-ui-css="width:${pct}%; background:var(--goal)"></div></div>`;
        }).join("")}
      </div>
      <p class="health-note">Total comprometido em faturas futuras: <b>${fmtBRL(p.total)}</b>.</p>
    `}
  </div>`;
}

function renderProjectionCard() {
  const p = projectCashFlow(state.data);
  const w = 600, h = 160, pad = 8;
  const maxVal = Math.max(1, p.income, ...p.actualSeries.map((pt) => pt.value), ...p.projectedSeries.map((pt) => pt.value));
  const xScale = (day) => pad + (p.dim > 1 ? (day - 1) / (p.dim - 1) : 0) * (w - 2 * pad);
  const yScale = (val) => h - pad - (val / maxVal) * (h - 2 * pad);
  const pathOf = (series) => series.map((pt, i) => `${i === 0 ? "M" : "L"} ${xScale(pt.day).toFixed(1)} ${yScale(pt.value).toFixed(1)}`).join(" ");
  const incomeY = yScale(p.income).toFixed(1);
  const hasData = p.actualSeries.length > 1;

  return `<div class="card span-mt">
    <p class="card-title">Projeção de fluxo de caixa</p>
    <p class="card-subtitle">Regressão linear com base no ritmo de gastos ${p.dayOfMonth === 1 ? "do último dia" : `dos últimos ${p.dayOfMonth} dias`}</p>
    ${hasData ? `
    <svg viewBox="0 0 ${w} ${h}" class="projection-chart" preserveAspectRatio="none">
      ${p.income > 0 ? `<line x1="0" y1="${incomeY}" x2="${w}" y2="${incomeY}" stroke="var(--border)" stroke-width="2" stroke-dasharray="5 5"/>` : ""}
      <path d="${pathOf(p.actualSeries)}" fill="none" stroke="var(--brand)" stroke-width="3"/>
      <path d="${pathOf(p.projectedSeries)}" fill="none" stroke="var(--goal)" stroke-width="3" stroke-dasharray="6 5"/>
    </svg>
    <div class="trend-legend">
      <span><i data-ui-css="background:var(--brand)"></i>Realizado</span>
      <span><i data-ui-css="background:var(--goal)"></i>Projeção</span>
      ${p.income > 0 ? `<span><i data-ui-css="background:var(--border)"></i>Renda</span>` : ""}
    </div>
    <p class="health-note">No ritmo atual, a projeção é fechar o mês com <b>${fmtBRL(p.projectedTotal)}</b> em gastos${p.income > 0 ? (p.projectedRemaining >= 0 ? `, sobrando <b data-ui-css="color:var(--positive)">${fmtBRL(p.projectedRemaining)}</b>` : `, ultrapassando a renda em <b data-ui-css="color:var(--negative)">${fmtBRL(Math.abs(p.projectedRemaining))}</b>`) : "."}.</p>
    ` : renderEmptyState("pie", "Lance alguns gastos neste mês para gerar a projeção.")}
  </div>`;
}

function renderAiCard() {
  const ai = state.aiInsight;
  return `<div class="card card--ai span-mt">
    <div class="ai-card__header">
      ${svgIcon("sparkles", 19)}
      <div><p class="card-title" data-ui-css="margin:0">Insights com IA</p><p class="ai-subtitle">Peça uma análise personalizada dos seus gastos deste mês</p></div>
    </div>
    ${ai.loading ? `<div class="ai-loading"><span class="spinner"></span> Analisando seus gastos…</div>` : ""}
    ${ai.error ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} ${escapeHtml(ai.error)}</p>` : ""}
    ${ai.analise ? renderAiStructured(ai.analise) : (ai.text ? `<div class="ai-text">${formatAiText(ai.text)}</div>` : "")}
    ${!ai.loading && !ai.analise ? `<p class="ai-privacy">${svgIcon("shieldCheck", 12)} Você vê o pacote inteiro antes de enviar, e pode tirar partes dele.</p>` : ""}
    ${!ai.loading ? `<button class="btn btn--secondary btn--block" data-ui-css="margin-top:10px" data-action="request-ai-insight">${ai.text ? "Analisar novamente" : "Analisar meus gastos"}</button>` : ""}
  </div>`;
}

// Renderiza a análise estruturada devolvida pela função Netlify:
// diagnóstico, fluxo de caixa, riscos e recomendações.
//
// [M4] O CORPO DA RESPOSTA É ENTRADA NÃO CONFIÁVEL, MESMO VINDO DO NOSSO BACKEND.
//
// `netlify/functions/analyze.js` normaliza a resposta do modelo (whitelist de
// `situacao` e `nivel`, `str()` com teto de tamanho, `score` descartado). Isso
// resolve hoje, mas era a ÚNICA barreira: o cliente pegava `body.analise` cru
// (js/insights.js) e interpolava direto no HTML. Uma resposta fora do contrato
// (backend antigo em cache, proxy no meio, função republicada com outra
// validação) chegava sem ninguém conferir. As duas verificações abaixo
// repetem a whitelist do servidor no cliente; custam uma comparação e tiram o
// render da dependência de um contrato remoto.
const AI_FLOW_LABEL = { positivo: "Fluxo positivo", equilibrado: "Fluxo equilibrado", negativo: "Fluxo negativo" };

const AI_FLOW_COLOR = { positivo: "var(--positive)", equilibrado: "var(--goal)", negativo: "var(--negative)" };

const AI_RISK_COLOR = { alto: "var(--negative)", medio: "var(--goal)", baixo: "var(--positive)" };

const AI_RISK_LABEL = { alto: "Risco alto", medio: "Atenção", baixo: "Risco baixo" };

const AI_FLOW_KEYS = ["positivo", "equilibrado", "negativo"];
const AI_RISK_KEYS = ["alto", "medio", "baixo"];
function aiFlowKey(value) { return AI_FLOW_KEYS.indexOf(value) === -1 ? "equilibrado" : value; }
function aiRiskKey(value) { return AI_RISK_KEYS.indexOf(value) === -1 ? "medio" : value; }

function renderAiStructured(a) {
  const flow = aiFlowKey(a.fluxoCaixa && a.fluxoCaixa.situacao);
  // A NOTA NÃO VEM MAIS DA IA, E A TELA AINDA PEDIA POR ELA.
  //
  // `normalizeAnalysis` (netlify/functions/analyze.js) descarta o `score` do
  // modelo de propósito: a nota de saúde é calculada por regras auditáveis em
  // js/score.js e mostrada com os pilares na tela de Saúde. Duas notas
  // diferentes na mesma sessão, uma sem como justificar, é pior do que uma.
  // O render aqui nunca acompanhou: `a.score` chegava `undefined` e o bloco
  // saía como "undefined/100" em 38px no topo da análise. O número só aparece
  // quando existe de verdade; sem ele, o diagnóstico ocupa a linha inteira.
  const score = Number(a.score);
  const temNota = Number.isFinite(score);
  const scoreColor = score >= 70 ? "var(--positive)" : score >= 40 ? "var(--goal)" : "var(--negative)";
  return `<div class="ai-analysis">
    <div class="ai-analysis__head">
      ${temNota ? `<div class="ai-score" data-ui-css="color:${scoreColor}">
        <b>${Math.round(clamp(score, 0, 100))}</b><span>/100</span>
      </div>` : ""}
      <p class="ai-analysis__diagnosis">${escapeHtml(a.diagnostico)}</p>
    </div>

    <div class="ai-block">
      <p class="ai-block__title" data-ui-css="color:${AI_FLOW_COLOR[flow]}">${svgIcon("trendUp", 14)} ${AI_FLOW_LABEL[flow]}${a.fluxoCaixa && a.fluxoCaixa.sobraEstimada ? ` · sobra estimada ${fmtBRL(a.fluxoCaixa.sobraEstimada)}` : ""}</p>
      ${a.fluxoCaixa && a.fluxoCaixa.comentario ? `<p class="ai-block__text">${escapeHtml(a.fluxoCaixa.comentario)}</p>` : ""}
    </div>

    ${a.riscos && a.riscos.length ? `<div class="ai-block">
      <p class="ai-block__title">${svgIcon("alertTriangle", 14)} Riscos identificados</p>
      ${a.riscos.map((r) => `<div class="ai-item">
        <span class="ai-item__tag" data-ui-css="color:${AI_RISK_COLOR[aiRiskKey(r.nivel)]}; border-color:${AI_RISK_COLOR[aiRiskKey(r.nivel)]}">${AI_RISK_LABEL[aiRiskKey(r.nivel)]}</span>
        <div><p class="ai-item__title">${escapeHtml(r.titulo)}</p><p class="ai-block__text">${escapeHtml(r.descricao)}</p></div>
      </div>`).join("")}
    </div>` : ""}

    ${a.recomendacoes && a.recomendacoes.length ? `<div class="ai-block">
      <p class="ai-block__title">${svgIcon("checkCircle", 14)} O que fazer agora</p>
      ${a.recomendacoes.map((r) => `<div class="ai-item">
        <span class="ai-item__bullet"></span>
        <div><p class="ai-item__title">${escapeHtml(r.acao)}</p>${r.impacto ? `<p class="ai-block__text">${escapeHtml(r.impacto)}</p>` : ""}</div>
      </div>`).join("")}
    </div>` : ""}

    ${a.metasComentario ? `<div class="ai-block">
      <p class="ai-block__title">${svgIcon("target", 14)} Suas metas</p>
      <p class="ai-block__text">${escapeHtml(a.metasComentario)}</p>
    </div>` : ""}

    <p class="ai-privacy">${svgIcon("shieldCheck", 12)} Só valores e nomes de categoria foram enviados. Descrições, datas e lançamentos individuais ficaram no seu aparelho.</p>
  </div>`;
}

function formatAiText(text) {
  const lines = text.split(/\n+/).filter(Boolean);
  return lines.map((l) => `<p>${escapeHtml(l.replace(/^[-•]\s*/, ""))}</p>`).join("");
}
