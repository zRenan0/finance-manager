// js/screens/accounts.js. Contas, cartões e conciliação.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function renderAccountForm() {
  const f = state.accountsUi.accountForm;
  if (!f) return "";
  return `<div class="card account-editor">
    <div class="screen-header"><div><p class="eyebrow">Conta</p><p class="card-title" data-ui-css="margin:3px 0 0">${f.id ? "Editar conta" : "Nova conta"}</p></div>
      <button class="icon-btn" data-action="account-cancel" aria-label="Fechar">${svgIcon("x", 16)}</button></div>
    <div class="field"><label class="field__label" for="account-name-input">Nome</label><input id="account-name-input" class="input" data-field="account-name" value="${escapeHtml(f.name)}" placeholder="Ex: Nubank" maxlength="60" /></div>
    <div class="field-row">
      <div class="field"><label class="field__label" for="account-type-select">Tipo</label><select id="account-type-select" class="input" data-action-select="account-type">${Object.entries(ACCOUNT_TYPE_LABELS).map(([id,label]) => `<option value="${id}" ${f.type === id ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field"><label class="field__label" for="account-date-input">Saldo válido desde</label><input id="account-date-input" type="date" class="input" data-field="account-opening-date" value="${f.openingDate}" /></div>
    </div>
    <div class="field"><label class="field__label" for="account-balance-input">Saldo nessa data</label><div class="income-input-row"><span class="income-currency">R$</span><input id="account-balance-input" class="input income-input" data-field="account-opening-balance" value="${escapeHtml(f.openingBalance)}" inputmode="decimal" placeholder="0,00" /></div><p class="field-hint">Movimentos anteriores a essa data não alteram esta conta.</p></div>
    <div class="modal-actions"><button class="btn btn--ghost" data-action="account-cancel">Cancelar</button><button class="btn btn--primary" data-action="account-save">Salvar conta</button></div>
  </div>`;
}

function renderCardForm() {
  const f = state.accountsUi.cardForm;
  if (!f) return "";
  const accounts = (state.data.accounts || []).filter((a) => !a.archived);
  return `<div class="card account-editor">
    <div class="screen-header"><div><p class="eyebrow">Cartão</p><p class="card-title" data-ui-css="margin:3px 0 0">${f.id ? "Editar cartão" : "Novo cartão"}</p></div>
      <button class="icon-btn" data-action="card-cancel" aria-label="Fechar">${svgIcon("x", 16)}</button></div>
    <div class="field"><label class="field__label" for="card-name-input">Nome</label><input id="card-name-input" class="input" data-field="card-name" value="${escapeHtml(f.name)}" placeholder="Ex: Mastercard Nubank" maxlength="60" /></div>
    <div class="field"><label class="field__label" for="card-account-select">Conta usada para pagar</label><select id="card-account-select" class="input" data-action-select="card-account">${accounts.map((a) => `<option value="${a.id}" ${f.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select></div>
    <div class="field-row">
      <div class="field"><label class="field__label" for="card-limit-input">Limite</label><input id="card-limit-input" class="input" data-field="card-limit" value="${escapeHtml(f.limit)}" inputmode="decimal" placeholder="0,00" /></div>
      <div class="field"><label class="field__label" for="card-closing-input">Fecha dia</label><input id="card-closing-input" class="input" type="number" min="1" max="31" data-field="card-closing" value="${f.closingDay}" /></div>
      <div class="field"><label class="field__label" for="card-due-input">Vence dia</label><input id="card-due-input" class="input" type="number" min="1" max="31" data-field="card-due" value="${f.dueDay}" /></div>
    </div>
    <div class="modal-actions"><button class="btn btn--ghost" data-action="card-cancel">Cancelar</button><button class="btn btn--primary" data-action="card-save" ${accounts.length ? "" : "disabled"}>Salvar cartão</button></div>
  </div>`;
}

function renderTransferForm() {
  const f = state.accountsUi.transferForm;
  if (!f) return "";
  const accounts = (state.data.accounts || []).filter((a) => !a.archived);
  const options = (selected) => accounts.map((a) => `<option value="${a.id}" ${selected === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
  return `<div class="card account-editor">
    <div class="screen-header"><p class="card-title" data-ui-css="margin:0">Transferir entre contas</p><button class="icon-btn" data-action="transfer-cancel" aria-label="Fechar">${svgIcon("x",16)}</button></div>
    <div class="field-row"><div class="field"><label class="field__label" for="transfer-from-select">Origem</label><select id="transfer-from-select" class="input" data-action-select="transfer-from">${options(f.fromAccountId)}</select></div><div class="field"><label class="field__label" for="transfer-to-select">Destino</label><select id="transfer-to-select" class="input" data-action-select="transfer-to">${options(f.toAccountId)}</select></div></div>
    <div class="field-row"><div class="field"><label class="field__label" for="transfer-amount-input">Valor</label><input id="transfer-amount-input" class="input" data-field="transfer-amount" value="${escapeHtml(f.amount)}" inputmode="decimal" placeholder="0,00" /></div><div class="field"><label class="field__label" for="transfer-date-input">Data</label><input id="transfer-date-input" type="date" class="input" data-field="transfer-date" value="${f.date}" /></div></div>
    <div class="field"><label class="field__label" for="transfer-desc-input">Descrição</label><input id="transfer-desc-input" class="input" data-field="transfer-description" value="${escapeHtml(f.description)}" placeholder="Transferência" /></div>
    <div class="modal-actions"><button class="btn btn--ghost" data-action="transfer-cancel">Cancelar</button><button class="btn btn--primary" data-action="transfer-save">Transferir</button></div>
  </div>`;
}

function renderAccountRow(a, sourceStats) {
  const reconciling = state.accountsUi.reconcileId === a.id;
  const stats = sourceStats || { movementCount:0, lastMovementAt:null, reconciledAt:a.reconciledAt, pendingCount:0, beforeOpeningCount:0 };
  const foraDoSaldo = stats.beforeOpeningCount || 0;
  return `<div class="account-row ${a.archived ? "is-archived" : ""}">
    <span class="account-mark" data-ui-css="--account-color:${a.color}">${svgIcon(a.type === "dinheiro" ? "wallet" : "bank",18)}</span>
    <div class="account-row__info"><b>${escapeHtml(a.name)}</b><span>${ACCOUNT_TYPE_LABELS[a.type] || "Conta"}${a.archived ? ", arquivada" : ""}</span><small>${stats.movementCount} ${stats.movementCount === 1 ? "movimentação" : "movimentações"} · última ${stats.lastMovementAt ? formatMovementTimestamp(stats.lastMovementAt) : "não registrada"}</small><small>Conferida: ${stats.reconciledAt ? formatMovementTimestamp(stats.reconciledAt) : "nunca"}${stats.pendingCount ? ` · ${stats.pendingCount} ${stats.pendingCount === 1 ? "pendência" : "pendências"}` : ""}</small>${foraDoSaldo ? `<small class="account-row__note">${svgIcon("info",12)} ${foraDoSaldo} ${foraDoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura em ${fmtDateFull(a.openingDate)} e ${foraDoSaldo === 1 ? "não entra" : "não entram"} neste saldo</small>` : ""}</div>
    <strong class="account-row__value">${fmtBRL(a.balance)}</strong>
    <div class="account-row__actions"><button class="icon-btn" data-action="account-reconcile-open" data-id="${a.id}" aria-label="Conciliar ${escapeHtml(a.name)}">${svgIcon("refresh",15)}</button><button class="icon-btn" data-action="account-edit" data-id="${a.id}" aria-label="Editar ${escapeHtml(a.name)}">${svgIcon("pencil",15)}</button><button class="icon-btn" data-action="account-archive" data-id="${a.id}" aria-label="${a.archived ? "Reativar" : "Arquivar"} ${escapeHtml(a.name)}">${svgIcon(a.archived ? "checkCircle" : "archive",15)}</button><button class="icon-btn icon-btn--danger" data-action="account-delete" data-id="${a.id}" aria-label="Excluir ${escapeHtml(a.name)}">${svgIcon("trash",15)}</button></div>
    ${reconciling ? `<div class="account-reconcile"><label class="field__label" for="reconcile-balance-input">Saldo visto no banco hoje</label><div class="account-reconcile__line"><input id="reconcile-balance-input" class="input" data-field="reconcile-value" value="${escapeHtml(state.accountsUi.reconcileValue)}" inputmode="decimal" placeholder="0,00" /><button class="btn btn--primary btn--sm" data-action="account-reconcile-save" data-id="${a.id}">Conciliar</button><button class="btn btn--ghost btn--sm" data-action="account-reconcile-cancel">Cancelar</button></div></div>` : ""}
  </div>`;
}

function renderCardRow(c, sourceStats) {
  const open = c.statements.filter((s) => s.outstanding > 0);
  const stats = sourceStats || { movementCount:0, lastMovementAt:null };
  return `<div class="card account-card-item ${c.archived ? "is-archived" : ""}">
    <div class="account-card-head"><span class="account-mark" data-ui-css="--account-color:${c.color}">${svgIcon("creditCard",18)}</span><div><p class="card-title" data-ui-css="margin:0">${escapeHtml(c.name)}</p><p class="card-subtitle" data-ui-css="margin:2px 0 0">Fecha dia ${c.closingDay} · vence dia ${c.dueDay}${c.archived ? ", arquivado" : ""}</p><p class="account-source-line">${stats.movementCount} ${stats.movementCount === 1 ? "compra registrada" : "compras registradas"} · última ${stats.lastMovementAt ? formatMovementTimestamp(stats.lastMovementAt) : "não registrada"}</p></div><div class="account-row__actions"><button class="icon-btn" data-action="card-edit" data-id="${c.id}" aria-label="Editar ${escapeHtml(c.name)}">${svgIcon("pencil",15)}</button><button class="icon-btn" data-action="card-archive" data-id="${c.id}" aria-label="${c.archived ? "Reativar" : "Arquivar"} ${escapeHtml(c.name)}">${svgIcon(c.archived ? "checkCircle" : "archive",15)}</button><button class="icon-btn icon-btn--danger" data-action="card-delete" data-id="${c.id}" aria-label="Excluir ${escapeHtml(c.name)}">${svgIcon("trash",15)}</button></div></div>
    <div class="account-stats"><div><span>Faturas até este mês</span><b>${fmtBRL(c.due)}</b></div><div><span>Parcelas futuras</span><b>${fmtBRL(c.future)}</b></div><div><span>Limite disponível</span><b>${fmtBRL(c.availableLimit)}</b></div></div>
    ${open.length ? `<div class="statement-list">${open.slice(0,6).map((s) => `<div class="statement-row"><span><b>${MONTH_ABBR[Number(s.key.slice(5,7))-1]} ${s.key.slice(0,4)}</b><small>Vence ${fmtDateShort(s.dueDate)} · ${s.count} ${s.count === 1 ? "compra" : "compras"}</small></span><strong>${fmtBRL(s.outstanding)}</strong>${s.key <= monthKeyOf(todayIso()) ? `<button class="btn btn--secondary btn--sm" data-action="card-pay-open" data-id="${c.id}" data-value="${s.key}">Pagar</button>` : ""}</div>`).join("")}</div>` : `<p class="field-hint">Nenhuma fatura em aberto.</p>`}
  </div>`;
}

function renderCardPaymentForm(summary) {
  const p = state.accountsUi.payment;
  if (!p) return "";
  const card = summary.cards.find((c) => c.id === p.creditCardId);
  const statement = card && card.statements.find((s) => s.key === p.statementKey);
  const accounts = summary.accounts.filter((a) => !a.archived);
  return `<div class="card account-editor"><div class="screen-header"><div><p class="eyebrow">Pagamento de fatura</p><p class="card-title" data-ui-css="margin:3px 0 0">${card ? escapeHtml(card.name) : "Cartão"} · ${p.statementKey}</p></div><button class="icon-btn" data-action="card-pay-cancel" aria-label="Fechar">${svgIcon("x",16)}</button></div>
    <div class="field"><label class="field__label" for="payment-account-select">Pagar com</label><select id="payment-account-select" class="input" data-action-select="payment-account">${accounts.map((a) => `<option value="${a.id}" ${p.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)} · ${fmtBRL(a.balance)}</option>`).join("")}</select></div>
    <div class="field-row"><div class="field"><label class="field__label" for="payment-amount-input">Valor</label><input id="payment-amount-input" class="input" data-field="payment-amount" value="${escapeHtml(p.amount)}" inputmode="decimal" /></div><div class="field"><label class="field__label" for="payment-date-input">Data</label><input id="payment-date-input" type="date" class="input" data-field="payment-date" value="${p.date}" /></div></div>
    <p class="field-hint">Em aberto nesta fatura: ${fmtBRL(statement ? statement.outstanding : 0)}. O pagamento reduz a conta, mas não cria uma segunda despesa.</p>
    <div class="modal-actions"><button class="btn btn--ghost" data-action="card-pay-cancel">Cancelar</button><button class="btn btn--primary" data-action="card-pay-save">Registrar pagamento</button></div></div>`;
}

function renderAccountsScreen() {
  const summary = accountsSummary(state.data, todayIso());
  const sources = buildDataSourcesModel(state.data);
  const activeAccounts = summary.accounts.filter((a) => !a.archived);
  return `<div class="screen">
    ${renderBackHeader("Contas e cartões")}
    <div class="segmented accounts-segmented" role="tablist" aria-label="Visão de contas"><button class="segmented__btn ${state.accountsUi.view === "accounts" ? "active" : ""}" data-action="accounts-view" data-value="accounts" role="tab" aria-selected="${state.accountsUi.view === "accounts"}">Contas e cartões</button><button class="segmented__btn ${state.accountsUi.view === "sources" ? "active" : ""}" data-action="accounts-view" data-value="sources" role="tab" aria-selected="${state.accountsUi.view === "sources"}">Fontes dos dados${sources.pendingCount ? ` <span class="badge">${sources.pendingCount}</span>` : ""}</button></div>
    ${state.accountsUi.view === "sources" ? renderDataSourcesCenter(sources) : renderAccountsAndCards(summary, sources, activeAccounts)}
  </div>`;
}

function renderAccountsAndCards(summary, sources, activeAccounts) {
  const accountStats = new Map(sources.accountStats.map((item) => [item.accountId, item]));
  const cardStats = new Map(sources.cardStats.map((item) => [item.cardId, item]));
  return `
    <div class="account-toolbar"><button class="btn btn--primary btn--sm" data-action="account-new">${svgIcon("plus",15)} Conta</button><button class="btn btn--secondary btn--sm" data-action="card-new" ${activeAccounts.length ? "" : "disabled"}>${svgIcon("creditCard",15)} Cartão</button><button class="btn btn--secondary btn--sm" data-action="transfer-new" ${activeAccounts.length > 1 ? "" : "disabled"}>${svgIcon("arrowRight",15)} Transferir</button></div>
    <div class="card card--hero account-hero"><div class="hero-label-row"><p class="hero-label">Saldo em contas</p>${renderCalculationButton("accounts-balance")}</div><p class="hero-value">${fmtBRL(summary.cash)}</p><div class="hero-chips"><div class="hero-chip"><div><span class="hero-chip__label">Faturas abertas</span><span class="hero-chip__value">${fmtBRL(summary.cardDue)}</span></div></div><div class="hero-chip ${summary.availableAfterCards >= 0 ? "hero-chip--save" : "hero-chip--warn"}"><div><span class="hero-chip__label">Após faturas</span><span class="hero-chip__value">${fmtBRL(summary.availableAfterCards)}</span></div></div><div class="hero-chip"><div><span class="hero-chip__label">Parcelas futuras</span><span class="hero-chip__value">${fmtBRL(summary.futureCard)}</span></div></div></div></div>
    ${renderAccountForm()}${renderCardForm()}${renderTransferForm()}${renderCardPaymentForm(summary)}
    <div class="grid-2 accounts-grid"><div class="card"><div class="screen-header"><p class="card-title" data-ui-css="margin:0">Contas</p><span class="badge">${summary.accounts.length}</span></div>${summary.accounts.length ? `<div class="account-list">${summary.accounts.map((account) => renderAccountRow(account, accountStats.get(account.id))).join("")}</div>` : renderEmptyState("wallet","Nenhuma conta cadastrada.","Cadastre uma conta e informe o saldo visto no banco para o aplicativo começar com uma base confiável.")}${summary.legacy !== 0 ? `<div class="legacy-balance">${svgIcon("alertTriangle",15)}<span><b>Histórico anterior: ${fmtBRL(summary.legacy)}</b><small>Lançamentos antigos sem conta continuam preservados e entram no total.</small></span></div>` : ""}</div>
      <div><p class="section-title">Cartões</p>${summary.cards.length ? summary.cards.map((card) => renderCardRow(card, cardStats.get(card.id))).join("") : `<div class="card">${renderEmptyState("creditCard","Nenhum cartão cadastrado.","Compras no crédito só deixam de reduzir o caixa quando estão ligadas a um cartão.")}</div>`}</div></div>`;
}

function renderDataSourcesCenter(model) {
  return `<div class="sources-center">
    <div class="card sources-status"><div class="sources-status__icon">${svgIcon("shieldCheck",20)}</div><div><p class="card-title">${escapeHtml(model.connection.label)}</p><p class="card-subtitle">${escapeHtml(model.connection.detail)}. Seus dados financeiros continuam neste navegador.</p></div><span class="status-badge">Sem conexão bancária</span></div>
    <div class="sources-summary"><div class="card"><span>Registros rastreados</span><b>${model.totalRecords}</b></div><div class="card"><span>Última atualização</span><b>${model.lastUpdatedAt ? formatMovementTimestamp(model.lastUpdatedAt) : "Sem registros"}</b></div><div class="card"><span>Pendências</span><b>${model.pendingCount}</b></div></div>
    ${model.withoutDestination ? `<div class="inline-alert inline-alert--warn">${svgIcon("alertTriangle",14)} ${model.withoutDestination} ${model.withoutDestination === 1 ? "lançamento ainda não está ligado" : "lançamentos ainda não estão ligados"} a uma conta ou cartão. Eles continuam preservados no saldo histórico.</div>` : ""}
    <div class="card"><div class="screen-header"><div><p class="card-title" data-ui-css="margin:0">Origens encontradas</p><p class="card-subtitle">Quantidade e atualização de cada canal</p></div><button class="btn btn--primary btn--sm" data-action="nav" data-tab="import">${svgIcon("upload",14)} Importar extrato</button></div>
      ${model.sources.length ? `<div class="source-list">${model.sources.map((source) => `<div class="source-row"><span class="icon-bubble icon-bubble--sm">${svgIcon(source.icon,15)}</span><div class="source-row__main"><b>${escapeHtml(source.label)}</b><span>${escapeHtml(source.detail)}</span>${source.reference ? `<small>Último arquivo: ${escapeHtml(source.reference)}</small>` : ""}</div><div class="source-row__status"><span class="status-badge">${escapeHtml(source.status)}</span><b>${source.count}</b><small>${source.lastUpdatedAt ? formatMovementTimestamp(source.lastUpdatedAt) : "Sem atualização"}</small></div></div>`).join("")}</div>` : renderEmptyState("file","Nenhuma fonte registrada.","Adicione uma movimentação ou importe um extrato para começar.")}
    </div>
    <div class="card sources-next"><div><p class="card-title">Como atualizar</p><p class="card-subtitle">Importe um novo OFX ou CSV e revise os itens sinalizados. O aplicativo não consulta seu banco em segundo plano.</p></div><div><button class="btn btn--secondary" data-action="nav" data-tab="import">Importar arquivo</button><button class="btn btn--ghost" data-action="nav" data-tab="analytics">Abrir caixa de revisão</button></div></div>
  </div>`;
}
