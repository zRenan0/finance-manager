// Arquivo gerado por scripts/build-app-module.js.
// Segundo pedaço do pacote: telas que não fazem parte da primeira pintura.
// Edite os arquivos de origem em js/ e execute npm run build.

let ACCOUNT_TYPE_LABELS, AI_HIDEABLE_FIELDS, ASSET_CLASSES, BACKUP_ENC_MIN_PASSWORD, BUDGET_GROUPS, BUILTIN_CATEGORY_RULES, CloudSync, DEBT_AMORTIZATION_LABELS, DEBT_TYPE_LABELS, FinanceStore, GOAL_ICON_OPTIONS, GOAL_INFLATION_MIN_DAYS, GOAL_TEMPLATES, GROUP_ICONS, GROUP_LABELS, HEALTH_INDICATORS, INVESTMENT_TYPES, LEGAL_CONTROLLER, LEGAL_DATA_INVENTORY, LEGAL_DATA_INVENTORY_GROUPS, LEGAL_PENDING, LEGAL_RETENTION, LEGAL_REVIEW_DATE, LEGAL_SUBJECT_RIGHTS, LEGAL_TEXT_VERSION, LEGAL_THIRD_PARTIES, LEGAL_THIRD_PARTY_GROUPS, MONTH_ABBR, MONTH_NAMES, RULE_MATCH_TYPES, RULE_WEIGHT_DEFAULT, RULE_WEIGHT_MAX, RULE_WEIGHT_MIN, accountsSummary, assetClassOf, backupCryptoAvailable, buildDataSourcesModel, categoryById, childCategories, clamp, compileCategoryRules, compileRulePattern, computeBudgetStatus, daysBetweenIso, debtMonthlyRateInfo, debtsModel, defaultBudgetAlerts, defaultPrivacy, divMoney, emergencyFund, emergencyLadder, escapeHtml, fmtBRL, fmtBRLShort, fmtDateFull, fmtDateShort, fmtDec, fmtNum, formatMovementTimestamp, freshGuestLink, goalExistingBalance, goalInflationPct, goalsModel, healthModel, inflateMoney, inkOf, investmentTypeOf, isDashboardStarting, keyOfCurrentMonth, legalAccepted, legalControllerGaps, legalControllerReady, legalDataInventoryGaps, legalThirdPartyGaps, legalThirdPartyLaunchGaps, marketRatesOf, matchCategoryRules, mergeBackupInto, moneyCompare, moneyDraft, moneyFromCents, moneyOrZero, moneyToCents, monthKeyOf, mulMoney, nextDueDateForDebt, normalizeCategoryRules, normalizePrivacy, normalizeText, notificationsModel, parseMoneyInput, passwordStrength, plural, pluralWord, portfolioModel, reconciliationHeadline, render, renderBackHeader, renderCalculationButton, renderDonut, renderEmptyState, renderGoalRing, renderLastBackupLine, renderScoreGauge, renderSparkline, safeErrorSummary, safePct, scoreGains, simulateExpenseImpact, simulateFinancingImpact, state, subMoney, svgIcon, todayIso, topLevelCategories, wealthModel;
export function instalarNucleo(n) {
  ({ ACCOUNT_TYPE_LABELS, AI_HIDEABLE_FIELDS, ASSET_CLASSES, BACKUP_ENC_MIN_PASSWORD, BUDGET_GROUPS, BUILTIN_CATEGORY_RULES, CloudSync, DEBT_AMORTIZATION_LABELS, DEBT_TYPE_LABELS, FinanceStore, GOAL_ICON_OPTIONS, GOAL_INFLATION_MIN_DAYS, GOAL_TEMPLATES, GROUP_ICONS, GROUP_LABELS, HEALTH_INDICATORS, INVESTMENT_TYPES, LEGAL_CONTROLLER, LEGAL_DATA_INVENTORY, LEGAL_DATA_INVENTORY_GROUPS, LEGAL_PENDING, LEGAL_RETENTION, LEGAL_REVIEW_DATE, LEGAL_SUBJECT_RIGHTS, LEGAL_TEXT_VERSION, LEGAL_THIRD_PARTIES, LEGAL_THIRD_PARTY_GROUPS, MONTH_ABBR, MONTH_NAMES, RULE_MATCH_TYPES, RULE_WEIGHT_DEFAULT, RULE_WEIGHT_MAX, RULE_WEIGHT_MIN, accountsSummary, assetClassOf, backupCryptoAvailable, buildDataSourcesModel, categoryById, childCategories, clamp, compileCategoryRules, compileRulePattern, computeBudgetStatus, daysBetweenIso, debtMonthlyRateInfo, debtsModel, defaultBudgetAlerts, defaultPrivacy, divMoney, emergencyFund, emergencyLadder, escapeHtml, fmtBRL, fmtBRLShort, fmtDateFull, fmtDateShort, fmtDec, fmtNum, formatMovementTimestamp, freshGuestLink, goalExistingBalance, goalInflationPct, goalsModel, healthModel, inflateMoney, inkOf, investmentTypeOf, isDashboardStarting, keyOfCurrentMonth, legalAccepted, legalControllerGaps, legalControllerReady, legalDataInventoryGaps, legalThirdPartyGaps, legalThirdPartyLaunchGaps, marketRatesOf, matchCategoryRules, mergeBackupInto, moneyCompare, moneyDraft, moneyFromCents, moneyOrZero, moneyToCents, monthKeyOf, mulMoney, nextDueDateForDebt, normalizeCategoryRules, normalizePrivacy, normalizeText, notificationsModel, parseMoneyInput, passwordStrength, plural, pluralWord, portfolioModel, reconciliationHeadline, render, renderBackHeader, renderCalculationButton, renderDonut, renderEmptyState, renderGoalRing, renderLastBackupLine, renderScoreGauge, renderSparkline, safeErrorSummary, safePct, scoreGains, simulateExpenseImpact, simulateFinancingImpact, state, subMoney, svgIcon, todayIso, topLevelCategories, wealthModel } = n);
}
// source: js/screens/accounts.js
// js/screens/accounts.js. Contas, cartões e conciliação.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function renderAccountForm() {
  const f = state.accountsUi.accountForm;
  if (!f) return "";
  return `<div class="card account-editor" id="account-form" data-ui-css="scroll-margin-top:18px">
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
  return `<div class="card account-editor" id="card-form" data-ui-css="scroll-margin-top:18px">
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
  return `<div class="card account-editor" id="transfer-form" data-ui-css="scroll-margin-top:18px">
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
  // A CONTAGEM SOZINHA NÃO DECIDE NADA. "2 lançamentos ficaram de fora" não
  // diz se são R$ 5 ou R$ 1.180: quem lê não consegue julgar se o saldo está
  // certo. O valor vem do mesmo cálculo do saldo, ao contrário (ver
  // `accountPreOpeningEffect`), e é ele que permite reconhecer o próprio erro
  // de data de abertura em vez de desconfiar do aplicativo.
  const fora = a.preOpening || { count: stats.beforeOpeningCount || 0, amount: 0 };
  const foraDoSaldo = fora.count || 0;
  return `<div class="account-row ${a.archived ? "is-archived" : ""}">
    <span class="account-mark" data-ui-css="--account-color:${a.color}">${svgIcon(a.type === "dinheiro" ? "wallet" : "bank",18)}</span>
    <div class="account-row__info"><b>${escapeHtml(a.name)}</b><span>${ACCOUNT_TYPE_LABELS[a.type] || "Conta"}${a.archived ? ", arquivada" : ""}</span><small>${stats.movementCount} ${stats.movementCount === 1 ? "movimentação" : "movimentações"} · última ${stats.lastMovementAt ? formatMovementTimestamp(stats.lastMovementAt) : "não registrada"}</small><small>Conferida: ${stats.reconciledAt ? formatMovementTimestamp(stats.reconciledAt) : "nunca"}${stats.pendingCount ? ` · ${stats.pendingCount} ${stats.pendingCount === 1 ? "pendência" : "pendências"}` : ""}</small>${foraDoSaldo ? `<small class="account-row__note">${svgIcon("info",12)} ${foraDoSaldo} ${foraDoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura em ${fmtDateFull(a.openingDate)} e ${foraDoSaldo === 1 ? "não entra" : "não entram"} neste saldo${moneyToCents(fora.amount) ? ` (${fmtBRL(fora.amount)}). O saldo inicial informado já deveria contê-${foraDoSaldo === 1 ? "lo" : "los"}; se não contém, corrija a data de abertura ou o valor inicial` : ""}</small>` : ""}</div>
    <strong class="account-row__value">${fmtBRL(a.balance)}</strong>
    <div class="account-row__actions"><button class="icon-btn" data-action="account-reconcile-open" data-id="${a.id}" aria-label="Conciliar ${escapeHtml(a.name)}">${svgIcon("refresh",15)}</button><button class="icon-btn" data-action="account-edit" data-id="${a.id}" aria-label="Editar ${escapeHtml(a.name)}">${svgIcon("pencil",15)}</button><button class="icon-btn" data-action="account-archive" data-id="${a.id}" aria-label="${a.archived ? "Reativar" : "Arquivar"} ${escapeHtml(a.name)}">${svgIcon(a.archived ? "checkCircle" : "archive",15)}</button><button class="icon-btn icon-btn--danger" data-action="account-delete" data-id="${a.id}" aria-label="Excluir ${escapeHtml(a.name)}">${svgIcon("trash",15)}</button></div>
    ${reconciling ? renderReconcilePanel(a) : ""}
  </div>`;
}

// [M35] A conciliação passou a ter dois passos. O primeiro continua sendo o
// mesmo campo de antes; o segundo é o que faltava: mostrar a diferença e o que
// pode tê-la causado ANTES de qualquer gravação. Enquanto o painel de revisão
// está aberto, nada foi alterado: nem o ajuste, nem a data de conferência.
function renderReconcilePanel(account) {
  const review = state.accountsUi.reconcileReview;
  const emRevisao = review && review.accountId === account.id;
  if (!emRevisao) {
    const quando = state.accountsUi.reconcileDate || todayIso();
    return `<div class="account-reconcile"><label class="field__label" for="reconcile-balance-input">Saldo visto no banco</label><div class="account-reconcile__line"><input id="reconcile-balance-input" class="input" data-field="reconcile-value" value="${escapeHtml(state.accountsUi.reconcileValue)}" inputmode="decimal" placeholder="0,00" aria-label="Saldo visto no banco" /><input id="reconcile-date-input" type="date" class="input" data-field="reconcile-date" value="${escapeHtml(quando)}" max="${todayIso()}" aria-label="Data do saldo informado" /><button class="btn btn--primary btn--sm" data-action="account-reconcile-check" data-id="${account.id}">Comparar</button><button class="btn btn--ghost btn--sm" data-action="account-reconcile-cancel">Cancelar</button></div><p class="field-hint">A data é a do saldo que você está informando; o aplicativo compara com o que calculou até ela e mostra a diferença antes de gravar qualquer coisa.</p></div>`;
  }
  const diferenca = fmtBRL(moneyFromCents(Math.abs(review.differenceCents)));
  return `<div class="account-reconcile"${review.matched ? "" : ' data-reconcile-diff="1"'}>
    <div class="reconcile-figures">
      <div><span>No aplicativo em ${fmtDateShort(review.date)}</span><b>${fmtBRL(review.calculated)}</b></div>
      <div><span>No banco em ${fmtDateShort(review.date)}</span><b>${fmtBRL(review.informed)}</b></div>
      <div class="${review.matched ? "" : "reconcile-figures__diff"}"><span>Diferença</span><b>${review.matched ? fmtBRL(0) : diferenca}</b></div>
    </div>
    <p class="reconcile-headline">${escapeHtml(reconciliationHeadline(review))}</p>
    ${review.matched ? "" : `
    <p class="field-hint">Procuramos a causa entre ${fmtDateFull(review.searchFrom)} e ${fmtDateFull(review.date)}: ${review.scannedCount} ${review.scannedCount === 1 ? "movimento" : "movimentos"} nesta conta.${review.lastReconciledAt ? ` Última conferência em ${fmtDateFull(review.lastReconciledAt)}.` : ""}</p>
    <ul class="reconcile-causes">${review.candidates.map((c) => `<li class="reconcile-cause reconcile-cause--${c.cause}"><div><b>${escapeHtml(c.title)}</b><small>${escapeHtml(c.detail)}</small></div>${renderReconcileCauseAction(c, review)}</li>`).join("")}</ul>`}
    <div class="reconcile-actions">
      ${review.matched
        ? `<button class="btn btn--primary btn--sm" data-action="account-reconcile-save" data-id="${account.id}">Marcar como conferida</button>`
        : `<button class="btn btn--primary btn--sm" data-action="account-reconcile-save" data-id="${account.id}">Registrar ajuste de ${diferenca}</button>`}
      <button class="btn btn--secondary btn--sm" data-action="account-reconcile-edit" data-id="${account.id}">Alterar valor</button>
      <button class="btn btn--ghost btn--sm" data-action="account-reconcile-cancel">${review.matched ? "Fechar" : "Vou corrigir o lançamento"}</button>
    </div>
    ${review.matched ? "" : `<p class="field-hint">O ajuste registra a diferença como um lançamento de conciliação em ${fmtDateFull(review.date)}; ele faz o saldo bater, mas não corrige a causa. Se uma das hipóteses acima for o caso, corrigir o lançamento é melhor. Até aqui nada foi alterado.</p>`}
  </div>`;
}

function renderReconcileCauseAction(candidate, review) {
  if (candidate.cause === "fatura-aberta") {
    return `<button class="btn btn--secondary btn--sm" data-action="card-pay-open" data-id="${candidate.cardId}" data-value="${candidate.statementKey}">Registrar pagamento</button>`;
  }
  if (!candidate.entryId) return "";
  return `<button class="btn btn--ghost btn--sm" data-action="account-reconcile-inspect" data-id="${review.accountId}">Ver na lista</button>`;
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

// Duas causas diferentes caem no mesmo total e precisavam de duas frases.
// Chamar uma compra no crédito de "lançamento antigo sem conta" não descrevia
// o que aconteceu nem dizia o que fazer; agora a linha nomeia a causa e leva
// para o cadastro do cartão, que é o que tira o gasto do caixa e o põe na
// fatura, onde ele deveria estar.
function renderLegacyBalance(summary) {
  const parts = summary.legacyParts || { orphan: summary.legacy, cardless: 0, cardlessCount: 0 };
  const linhas = [];
  if (parts.orphan !== 0) {
    linhas.push(`<span><b>Histórico anterior: ${fmtBRL(parts.orphan)}</b><small>Lançamentos antigos sem conta continuam preservados e entram no total.</small></span>`);
  }
  if (parts.cardless !== 0) {
    linhas.push(`<span><b>Crédito sem cartão: ${fmtBRL(parts.cardless)}</b><small>${plural(parts.cardlessCount, "compra no crédito não está ligada", "compras no crédito não estão ligadas")} a nenhum cartão, então ${parts.cardlessCount === 1 ? "reduz" : "reduzem"} o caixa em vez de entrar numa fatura. Cadastre o cartão e reaponte ${parts.cardlessCount === 1 ? "o lançamento" : "os lançamentos"}.</small></span>`);
  }
  if (!linhas.length) return "";
  return `<div class="legacy-balance">${svgIcon("alertTriangle", 15)}<div class="legacy-balance__lines">${linhas.join("")}</div></div>`;
}

function renderAccountsAndCards(summary, sources, activeAccounts) {
  const accountStats = new Map(sources.accountStats.map((item) => [item.accountId, item]));
  const cardStats = new Map(sources.cardStats.map((item) => [item.cardId, item]));
  return `
    <div class="account-toolbar"><button class="btn btn--primary btn--sm" data-action="account-new">${svgIcon("plus",15)} Conta</button><button class="btn btn--secondary btn--sm" data-action="card-new" ${activeAccounts.length ? "" : "disabled"}>${svgIcon("creditCard",15)} Cartão</button><button class="btn btn--secondary btn--sm" data-action="transfer-new" ${activeAccounts.length > 1 ? "" : "disabled"}>${svgIcon("arrowRight",15)} Transferir</button></div>
    <div class="card card--hero account-hero"><div class="hero-label-row"><p class="hero-label">Saldo em contas</p>${renderCalculationButton("accounts-balance")}</div><p class="hero-value">${fmtBRL(summary.cash)}</p><div class="hero-chips"><div class="hero-chip"><div><span class="hero-chip__label">Faturas abertas</span><span class="hero-chip__value">${fmtBRL(summary.cardDue)}</span></div></div><div class="hero-chip ${summary.availableAfterCards >= 0 ? "hero-chip--save" : "hero-chip--warn"}"><div><span class="hero-chip__label">Após faturas</span><span class="hero-chip__value">${fmtBRL(summary.availableAfterCards)}</span></div></div><div class="hero-chip"><div><span class="hero-chip__label">Parcelas futuras</span><span class="hero-chip__value">${fmtBRL(summary.futureCard)}</span></div></div></div></div>
    ${renderAccountForm()}${renderCardForm()}${renderTransferForm()}${renderCardPaymentForm(summary)}
    <div class="grid-2 accounts-grid"><div class="card"><div class="screen-header"><p class="card-title" data-ui-css="margin:0">Contas</p><span class="badge">${summary.accounts.length}</span></div>${summary.accounts.length ? `<div class="account-list">${summary.accounts.map((account) => renderAccountRow(account, accountStats.get(account.id))).join("")}</div>` : renderEmptyState("wallet","Nenhuma conta cadastrada.","Cadastre uma conta e informe o saldo visto no banco para o aplicativo começar com uma base confiável.")}${renderLegacyBalance(summary)}</div>
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

// source: js/screens/debts.js
// js/screens/debts.js. Central de dívidas.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// CENTRAL DE DÍVIDAS
// ==================================================================
function renderDebtForm() {
  const f = state.debtsUi.form;
  if (!f) return "";
  return `<div class="card debt-editor span-3" id="debt-form" data-ui-css="scroll-margin-top:18px">
    <div class="screen-header"><div><p class="eyebrow">${f.id ? "Editar dívida" : "Nova dívida"}</p><p class="card-title" data-ui-css="margin:3px 0 0">Saldo e condições do contrato</p></div><button class="icon-btn" data-action="debt-form-cancel" aria-label="Fechar">${svgIcon("x",16)}</button></div>
    <div class="field-row"><div class="field"><label class="field__label" for="debt-name">Nome</label><input id="debt-name" class="input" data-field="debt-name" value="${escapeHtml(f.name)}" placeholder="Ex: Financiamento do carro" maxlength="60" /></div><div class="field"><label class="field__label" for="debt-value">Saldo devedor hoje</label><input id="debt-value" class="input" data-field="debt-value" value="${escapeHtml(f.value)}" inputmode="decimal" placeholder="0,00" /></div></div>
    <div class="field-row"><div class="field"><label class="field__label" for="debt-type">Tipo</label><select id="debt-type" class="input" data-action-select="debt-type">${Object.entries(DEBT_TYPE_LABELS).map(([id,label]) => `<option value="${id}" ${f.debtType === id ? "selected" : ""}>${label}</option>`).join("")}</select></div><div class="field"><label class="field__label" for="debt-creditor">Credor</label><input id="debt-creditor" class="input" data-field="debt-creditor" value="${escapeHtml(f.creditor)}" placeholder="Banco ou empresa" maxlength="80" /></div></div>
    <div class="field-row"><div class="field"><label class="field__label" for="debt-payment">Parcela mínima mensal</label><input id="debt-payment" class="input" data-field="debt-payment" value="${escapeHtml(f.monthlyPayment)}" inputmode="decimal" placeholder="0,00" /></div><div class="field"><label class="field__label" for="debt-next-due">Próximo vencimento</label><input id="debt-next-due" type="date" class="input" data-field="debt-next-due" value="${f.nextDueDate || ""}" /></div></div>
    <details class="debt-details" ${f.id ? "open" : ""}><summary>Detalhes para uma projeção mais precisa</summary>
      <div class="field-row"><div class="field"><label class="field__label" for="debt-cet">CET anual (%)</label><input id="debt-cet" class="input" data-field="debt-cet" value="${escapeHtml(f.cetAnnualPct)}" inputmode="decimal" placeholder="Ex: 28,5" /><p class="field-hint">Se informado, o CET tem preferência no cálculo.</p></div><div class="field"><label class="field__label" for="debt-rate">Taxa de juros (%)</label><div class="debt-rate-row"><input id="debt-rate" class="input" data-field="debt-rate" value="${escapeHtml(f.ratePct)}" inputmode="decimal" placeholder="Ex: 2,1" /><select class="input" data-action-select="debt-rate-period"><option value="unknown" ${f.ratePeriod === "unknown" ? "selected" : ""}>Período</option><option value="month" ${f.ratePeriod === "month" ? "selected" : ""}>ao mês</option><option value="year" ${f.ratePeriod === "year" ? "selected" : ""}>ao ano</option></select></div></div></div>
      <div class="field-row"><div class="field"><label class="field__label" for="debt-original">Valor contratado</label><input id="debt-original" class="input" data-field="debt-original" value="${escapeHtml(f.originalPrincipal)}" inputmode="decimal" placeholder="0,00" /></div><div class="field"><label class="field__label" for="debt-installments">Parcelas restantes</label><input id="debt-installments" class="input" data-field="debt-installments" value="${escapeHtml(f.remainingInstallments)}" inputmode="numeric" placeholder="Ex: 24" /></div></div>
      <div class="field-row"><div class="field"><label class="field__label" for="debt-system">Amortização</label><select id="debt-system" class="input" data-action-select="debt-system">${Object.entries(DEBT_AMORTIZATION_LABELS).map(([id,label]) => `<option value="${id}" ${f.amortizationSystem === id ? "selected" : ""}>${label}</option>`).join("")}</select></div><div class="field"><label class="field__label" for="debt-status">Situação</label><select id="debt-status" class="input" data-action-select="debt-status"><option value="active" ${f.debtStatus === "active" ? "selected" : ""}>Ativa</option><option value="negotiating" ${f.debtStatus === "negotiating" ? "selected" : ""}>Em negociação</option><option value="paid" ${f.debtStatus === "paid" ? "selected" : ""}>Quitada</option></select></div></div>
      <div class="field-row"><div class="field"><label class="field__label" for="debt-late-fee">Multa por atraso (%)</label><input id="debt-late-fee" class="input" data-field="debt-late-fee" value="${escapeHtml(f.lateFeePct)}" inputmode="decimal" placeholder="Ex: 2" /><p class="field-hint">Do seu contrato. Em relação de consumo o CDC limita a multa a 2%, mas o app não presume esse número: sem preenchimento, ele não estima o custo do atraso.</p></div><div class="field"><label class="field__label" for="debt-late-mora">Juros de mora (% ao mês)</label><input id="debt-late-mora" class="input" data-field="debt-late-mora" value="${escapeHtml(f.lateInterestMonthlyPct)}" inputmode="decimal" placeholder="Ex: 1" /><p class="field-hint">Cobrado por dia de atraso, proporcional ao mês.</p></div></div>
      <div class="field"><label class="field__label" for="debt-note">Observação</label><input id="debt-note" class="input" data-field="debt-note" value="${escapeHtml(f.note)}" maxlength="140" placeholder="Contrato, garantia ou contato" /></div>
    </details>
    <div class="form-actions"><button class="btn btn--ghost" data-action="debt-form-cancel">Cancelar</button><button class="btn btn--primary" data-action="debt-save">${f.id ? "Salvar alterações" : "Cadastrar dívida"}</button></div>
  </div>`;
}

function renderDebtPaymentForm(model) {
  const p = state.debtsUi.payment;
  if (!p) return "";
  const debt = model.debts.find((d) => d.id === p.debtId) || (state.data.assets || []).find((d) => d.id === p.debtId);
  const accounts = (state.data.accounts || []).filter((a) => !a.archived);
  return `<div class="card debt-editor span-3" id="debt-payment-form" data-ui-css="scroll-margin-top:18px">
    <div class="screen-header"><div><p class="eyebrow">Registrar pagamento</p><p class="card-title" data-ui-css="margin:3px 0 0">${debt ? escapeHtml(debt.name) : "Dívida"}</p></div><button class="icon-btn" data-action="debt-payment-cancel" aria-label="Fechar">${svgIcon("x",16)}</button></div>
    <div class="field-row"><div class="field"><label class="field__label" for="debt-pay-amount">Valor pago</label><input id="debt-pay-amount" class="input" data-field="debt-pay-amount" value="${escapeHtml(p.amount)}" inputmode="decimal" placeholder="0,00" /></div><div class="field"><label class="field__label" for="debt-pay-date">Data</label><input id="debt-pay-date" type="date" class="input" data-field="debt-pay-date" value="${p.date}" /></div></div>
    <div class="field-row"><div class="field"><label class="field__label" for="debt-pay-account">Conta de origem</label><select id="debt-pay-account" class="input" data-action-select="debt-pay-account"><option value="">Sem conta vinculada</option>${accounts.map((a) => `<option value="${a.id}" ${p.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select></div><div class="field"><label class="field__label" for="debt-pay-category">Categoria</label><select id="debt-pay-category" class="input" data-action-select="debt-pay-category">${topLevelCategories(state.data).map((c) => `<option value="${c.id}" ${p.categoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select></div></div>
    <div class="field"><label class="field__label" for="debt-new-balance">Novo saldo visto no credor (opcional)</label><input id="debt-new-balance" class="input" data-field="debt-new-balance" value="${escapeHtml(p.newBalance)}" inputmode="decimal" placeholder="Não é calculado pelo valor pago" /><p class="field-hint">Juros, seguros e tarifas fazem o saldo cair de modo diferente do pagamento. Por isso ele só muda quando você informar o valor visto no credor.</p></div>
    <div class="form-actions"><button class="btn btn--ghost" data-action="debt-payment-cancel">Cancelar</button><button class="btn btn--primary" data-action="debt-payment-save">Registrar pagamento</button></div>
  </div>`;
}

function renderDebtProjection(model) {
  const s = model.simulation;
  const max = Math.max(model.totalBalance, 1);
  const points = s.timeline.filter((_, i) => i === 0 || i === s.timeline.length - 1 || i % Math.max(1, Math.ceil(s.timeline.length / 10)) === 0);
  const monthLabel = s.months == null ? "Sem prazo calculável" : `${s.months} ${s.months === 1 ? "mês" : "meses"}`;
  return `<div class="card span-2">
    <div class="settings-row-header"><div><p class="card-title" data-ui-css="margin:0">Plano de quitação</p><p class="card-subtitle">${model.plan.strategy === "avalanche" ? "Avalanche: maior custo primeiro" : "Bola de neve: menor saldo primeiro"}</p></div><div class="seg-control"><button class="seg-control__btn ${model.plan.strategy === "avalanche" ? "active" : ""}" data-action="debt-strategy" data-value="avalanche">Avalanche</button><button class="seg-control__btn ${model.plan.strategy === "snowball" ? "active" : ""}" data-action="debt-strategy" data-value="snowball">Bola de neve</button></div></div>
    <div class="debt-plan-summary"><div><span>Prazo estimado</span><b>${monthLabel}</b></div><div><span>Orçamento mensal</span><b>${fmtBRL(s.monthlyBudget)}</b></div><div><span>Juros projetados</span><b>${s.totalInterest == null ? "Incompleto" : fmtBRL(s.totalInterest)}</b></div></div>
    <div class="field"><label class="field__label" for="debt-extra">Valor extra por mês</label><div class="debt-extra-row"><input id="debt-extra" class="input" data-field="debt-extra" value="${escapeHtml(state.debtsUi.extraDraft == null ? moneyDraft(model.plan.extraMonthly) : state.debtsUi.extraDraft)}" inputmode="decimal" placeholder="0,00" /><button class="btn btn--secondary" data-action="debt-extra-save">Aplicar</button></div></div>
    ${points.length ? `<div class="debt-timeline" aria-label="Queda estimada do saldo">${points.map((p) => `<div class="debt-timeline__row"><span>Mês ${p.month}</span><div><i data-ui-css="width:${Math.max(1,p.balance/max*100)}%"></i></div><b>${fmtBRLShort(p.balance)}</b></div>`).join("")}</div>` : ""}
    <p class="footnote">Estimativa educativa. Taxas desconhecidas usam queda linear sem juros; o resultado não substitui o saldo ou a proposta oficial do credor.</p>
  </div>`;
}

function renderDebtList(model) {
  if (!model.debts.length) return `<div class="card span-3">${renderEmptyState("alertTriangle","Nenhuma dívida ativa cadastrada.","Cadastre nome e saldo devedor. Os detalhes do contrato podem ser preenchidos depois.")}<button class="btn btn--primary btn--block btn--sm" data-action="debt-new">Cadastrar primeira dívida</button></div>`;
  return `<div class="card span-3"><div class="settings-row-header"><div><p class="card-title" data-ui-css="margin:0">Ordem de pagamento</p><p class="card-subtitle">Todas recebem a parcela mínima; o valor livre vai para a primeira da lista.</p></div><span class="badge">${model.debts.length}</span></div><div class="debt-list">${model.ordered.map((d,index) => {
    const rate = debtMonthlyRateInfo(d);
    const due = nextDueDateForDebt(d);
    const late = model.late[d.id];
    const expanded = state.debtsUi.expandedId === d.id;
    const paid = model.payments.filter((p) => p.debtId === d.id).sort((a,b) => b.date.localeCompare(a.date));
    return `<div class="debt-row ${expanded ? "is-open" : ""}"><button class="debt-row__main" data-action="debt-toggle" data-id="${d.id}" aria-expanded="${expanded}"><span class="debt-rank">${index + 1}</span><span class="debt-row__text"><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.creditor || DEBT_TYPE_LABELS[d.debtType] || "Dívida")} · ${rate.known ? `${fmtDec(rate.annualPct, 2)}% a.a. ${rate.source === "cet" ? "CET" : "efetivos"}` : "custo não informado"}${late && late.late ? ` · <b class="debt-late-flag">vencida há ${late.daysLate} ${late.daysLate === 1 ? "dia" : "dias"}</b>` : ""}</small></span><span class="debt-row__values"><b>${fmtBRL(d.value)}</b><small>${d.monthlyPayment > 0 ? `${fmtBRL(d.monthlyPayment)}/mês` : "sem parcela mínima"}</small></span>${svgIcon(expanded ? "chevronUp" : "chevronDown",15)}</button>
      ${expanded ? `<div class="debt-row__detail"><div class="debt-facts"><div><span>Próximo vencimento</span><b>${due ? fmtDateFull(due) : "Não informado"}</b></div><div><span>Saldo conferido</span><b>${d.balanceCheckedAt ? fmtDateFull(d.balanceCheckedAt) : "Nunca"}</b></div><div><span>Situação</span><b>${d.debtStatus === "negotiating" ? "Em negociação" : "Ativa"}</b></div></div>
        ${renderDebtLate(model.late[d.id])}
        ${model.staleIds.includes(d.id) ? `<div class="inline-alert inline-alert--warn">Saldo sem conferência há mais de 60 dias. Atualize ao registrar o próximo pagamento.</div>` : ""}
        ${model.simulation.negativeAmortizationIds.includes(d.id) ? `<div class="inline-alert inline-alert--danger">A parcela pode ser menor ou igual aos juros do mês. O saldo pode não cair.</div>` : ""}
        ${paid.length ? `<div class="debt-payment-history"><p class="field__label">Pagamentos vinculados</p>${paid.slice(0,5).map((p) => `<div><span>${fmtDateShort(p.date)}</span><b>${fmtBRL(p.amount)}</b></div>`).join("")}</div>` : ""}
        <div class="form-actions"><button class="btn btn--primary btn--sm" data-action="debt-payment-open" data-id="${d.id}">${svgIcon("checkCircle",14)} Registrar pagamento</button><button class="btn btn--ghost btn--sm" data-action="debt-edit" data-id="${d.id}">${svgIcon("pencil",14)} Editar</button><button class="btn btn--ghost btn--sm" data-action="debt-delete" data-id="${d.id}">${svgIcon("trash",14)} Excluir</button></div>
      </div>` : ""}</div>`;
  }).join("")}</div></div>`;
}

// ==================================================================
// [M34] QUAL ESTRATÉGIA USAR
// ------------------------------------------------------------------
// O cartão antigo mostrava o prazo de cada estratégia e nada mais, o que faz
// parecer que existe uma resposta certa e que ela é sempre a mesma. Não existe.
// A avalanche é a mais barata em juros; a bola de neve tira dívidas da lista mais
// cedo, e é isso que faz muita gente não desistir no terceiro mês.
//
// Então este cartão mostra vantagem E desvantagem das duas, com os números desta
// pessoa, e quando a diferença é pequena ele diz que é pequena em vez de fingir
// que a escolha é decisiva.
function debtStrategyMonths(n) {
  return n == null ? "sem prazo calculável" : `${n} ${n === 1 ? "mês" : "meses"}`;
}

function renderDebtStrategyCard(model) {
  const c = model.comparison;
  const atual = model.plan.strategy;
  const jurosA = c.avalanche.interest;
  const jurosS = c.snowball.interest;
  const diff = c.interestDiff;
  // SEM DINHEIRO EXTRA NÃO EXISTE ESTRATÉGIA.
  //
  // Quando cada dívida recebe só a parcela mínima, a ordem não muda nada: não há
  // sobra para direcionar. Os dois lados do cartão saem idênticos, e deixar o
  // usuário escolher entre dois números iguais é fingir uma decisão. A conta que
  // importa nesse caso é outra, e o campo dela está logo acima.
  const semExtra = model.plan.extraMonthly <= 0 && c.interestDiff === 0 && c.monthsDiff === 0;
  const veredito = c.stalls
    ? `Com o orçamento de hoje, a ordem "${c.stalls === "snowball" ? "bola de neve" : "avalanche"}" não chega ao fim: a dívida que fica por último recebe menos do que os juros dela e o saldo cresce. Antes de escolher entre as duas, o caminho é liberar mais parcela por mês ou renegociar a taxa dessa dívida.`
    : semExtra
      ? "Enquanto cada dívida receber só a parcela mínima, as duas ordens dão exatamente o mesmo resultado: não sobra nada para direcionar. A escolha entre avalanche e bola de neve só passa a valer alguma coisa quando existe um valor extra por mês, no campo acima."
    : !c.comparable
    ? "Falta a taxa de alguma dívida, então ainda não dá para comparar o custo das duas. Preencha a taxa ou o CET no cadastro para o app parar de chutar."
    : !c.meaningful
      ? `Com as suas dívidas, a diferença entre as duas é ${diff == null ? "pequena" : `de ${fmtBRL(Math.abs(diff))} em juros`}${c.monthsDiff ? ` e ${Math.abs(c.monthsDiff)} ${Math.abs(c.monthsDiff) === 1 ? "mês" : "meses"}` : ""}. Não existe estratégia universal, e nesse tamanho de diferença a melhor é simplesmente a que você consegue manter até o fim.`
      : `Com as suas dívidas, a avalanche economiza ${fmtBRL(Math.abs(diff || 0))} em juros${c.monthsDiff ? ` e termina ${Math.abs(c.monthsDiff)} ${Math.abs(c.monthsDiff) === 1 ? "mês" : "meses"} antes` : ""}${c.firstDiff > 0 ? `, mas a bola de neve risca a primeira dívida da lista ${c.firstDiff} ${c.firstDiff === 1 ? "mês" : "meses"} antes` : ""}. As duas são planos válidos; o que muda é o que pesa mais para você.`;

  const bloco = (id, titulo, chamada, vantagem, desvantagem, stats) => `
    <div class="debt-strategy ${atual === id ? "is-active" : ""}">
      <div class="debt-strategy__head">
        <div>
          <p class="debt-strategy__name">${titulo}</p>
          <p class="debt-strategy__call">${chamada}</p>
        </div>
        ${atual === id
          ? `<span class="status-badge" data-ui-css="background:var(--brand-soft); color:var(--brand-ink)">em uso</span>`
          : `<button class="btn btn--secondary btn--sm" data-action="debt-strategy" data-value="${id}">Usar esta</button>`}
      </div>
      <div class="debt-strategy__stats">${stats}</div>
      <p class="debt-strategy__pro">${svgIcon("checkCircle", 13)} ${vantagem}</p>
      <p class="debt-strategy__con">${svgIcon("alertTriangle", 13)} ${desvantagem}</p>
    </div>`;

  const stat = (rotulo, valor) => `<div><span>${rotulo}</span><b>${valor}</b></div>`;
  const jurosTexto = (v) => (v == null ? "incompleto" : fmtBRL(v));
  const primeiro = (n) => (n == null ? "não calculável" : `mês ${n}`);

  return `<div class="card span-2">
    <p class="card-title">Qual estratégia usar</p>
    <p class="card-subtitle">As duas pagam a parcela mínima de todas as dívidas; o que muda é para onde vai o dinheiro que sobra. Ambas funcionam, e nenhuma é a certa para todo mundo.</p>
    <div class="debt-strategies">
      ${bloco("avalanche", "Avalanche", "Financeiramente mais eficiente",
        "Ataca primeiro o dinheiro mais caro, então o total de juros é o menor possível.",
        "As dívidas grandes saem por último: a lista pode ficar meses sem encolher, e é aí que muita gente abandona o plano.",
        stat("Prazo", debtStrategyMonths(c.avalanche.months)) + stat("Juros no total", jurosTexto(jurosA)) + stat("Primeira quitada", primeiro(c.avalanche.firstCleared)) + stat("Quitadas em 12 meses", `${c.avalanche.clearedIn12} de ${c.avalanche.total}`))}
      ${bloco("snowball", "Bola de neve", "Mais simples para reduzir o número de dívidas",
        "Risca nomes da lista mais cedo, e cada dívida que some libera a parcela dela para a próxima.",
        `Ignora a taxa, então costuma custar mais em juros${diff != null && diff > 0 ? ` (aqui, ${fmtBRL(diff)} a mais)` : ""}.`,
        stat("Prazo", debtStrategyMonths(c.snowball.months)) + stat("Juros no total", jurosTexto(jurosS)) + stat("Primeira quitada", primeiro(c.snowball.firstCleared)) + stat("Quitadas em 12 meses", `${c.snowball.clearedIn12} de ${c.snowball.total}`))}
    </div>
    <p class="debt-strategy__verdict">${svgIcon("info", 14)} ${veredito}</p>
    <p class="footnote">Comparação educativa feita com os saldos e taxas que você cadastrou. Nenhuma das duas ordens vale mais que renegociar uma taxa alta: trocar 14% ao mês por 4% muda mais o resultado do que qualquer ordem de pagamento.</p>
  </div>`;
}

// [M34] Atraso: o que o app viu, e o que ele não pode afirmar.
function renderDebtLate(info) {
  if (!info || (!info.late && !info.likelyPaid)) return "";
  if (info.likelyPaid) {
    return `<div class="inline-alert">O vencimento informado (${fmtDateFull(info.dueIso)}) já passou, mas há pagamento registrado depois dele. Atualize a data do próximo vencimento para o plano voltar a acertar o calendário.</div>`;
  }
  const custo = info.costKnown
    ? `Pelos encargos que você cadastrou, o atraso já soma cerca de ${fmtBRL(info.estimatedCost)} (multa de ${fmtBRL(info.fine)} mais ${fmtBRL(info.moraInterest)} de mora).`
    : `Cadastre a multa e os juros de mora do contrato para o app estimar quanto o atraso está custando. Sem eles, ele não inventa o número.`;
  return `<div class="inline-alert inline-alert--danger">
    Vencida há ${info.daysLate} ${info.daysLate === 1 ? "dia" : "dias"} (venceu em ${fmtDateFull(info.dueIso)}) e sem pagamento registrado depois disso. ${custo}
    ${info.late ? " Dívida vencida costuma andar mais rápido que qualquer outra: renegociar antes de acumular tende a custar menos que pagar depois." : ""}
  </div>`;
}

function renderDebtsScreen() {
  const model = debtsModel();
  const s = model.simulation;
  const warningCount = s.unknownRateIds.length + s.missingPaymentIds.length + s.negativeAmortizationIds.length + model.staleIds.length + model.overdueIds.length;
  return `<div class="screen"><div class="screen-header"><div class="back-header"><button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft",19)}</button><div><h1 class="page-title">Central de Dívidas</h1><p class="card-subtitle">Um plano baseado nos mesmos saldos do Patrimônio</p></div></div><button class="btn btn--primary btn--sm" data-action="debt-new">${svgIcon("plus",15)} Dívida</button></div>
    <div class="grid-dashboard"><div class="card card--hero span-3 debt-hero"><div class="hero-glow"></div><div class="hero-label-row"><p class="hero-label">Saldo devedor total</p>${renderCalculationButton("debts")}</div><p class="hero-value">${fmtBRL(model.totalBalance)}</p>${model.estimatedDebtFreeAt ? `<p class="hero-reserved">${svgIcon("calendar",14)} Quitação estimada em ${fmtDateFull(model.estimatedDebtFreeAt)}</p>` : ""}<div class="hero-chips"><div class="hero-chip"><div><span class="hero-chip__label">Parcelas mínimas</span><span class="hero-chip__value">${fmtBRL(model.monthlyPayment)}</span></div></div><div class="hero-chip"><div><span class="hero-chip__label">Comprometimento da renda</span><span class="hero-chip__value">${model.burdenPct == null ? "Sem renda" : `${fmtDec(model.burdenPct, 1)}%`}</span></div></div>${model.overdueIds.length ? `<div class="hero-chip hero-chip--warn"><div><span class="hero-chip__label">${model.overdueIds.length === 1 ? "Dívida vencida" : "Dívidas vencidas"}</span><span class="hero-chip__value">${fmtBRL(model.overdueTotal)}</span></div></div>` : ""}<div class="hero-chip ${warningCount ? "hero-chip--warn" : "hero-chip--save"}"><div><span class="hero-chip__label">Pontos a revisar</span><span class="hero-chip__value">${warningCount}</span></div></div></div></div>
      ${renderDebtForm()}${renderDebtPaymentForm(model)}
      ${!model.debts.length && (model.shortTermCards.due > 0 || model.shortTermCards.future > 0)
        ? `<div class="card span-3"><div class="inline-alert">Você ainda não cadastrou nenhuma dívida, mas tem ${fmtBRL(model.shortTermCards.due)} em faturas abertas e ${fmtBRL(model.shortTermCards.future)} em parcelas futuras. Elas já contam no Patrimônio; aqui só entram se a fatura virou rotativo ou parcelamento com juros.</div></div>`
        : ""}
      ${model.debts.length ? renderDebtProjection(model) : ""}
      ${model.debts.length ? renderDebtStrategyCard(model) : ""}
      ${model.debts.length ? `<div class="card span-1"><p class="card-title">Comprometimento da renda</p><p class="debt-burden__value">${model.burdenPct == null ? "Sem renda informada" : `${fmtDec(model.burdenPct, 1)}%`}</p><p class="debt-burden__label debt-burden--${model.burden.level}">${escapeHtml(model.burden.label)}</p><p class="card-subtitle">${escapeHtml(model.burden.note)}</p>${model.shortTermCards.due > 0 || model.shortTermCards.future > 0 ? `<div class="inline-alert">Cartões à parte: ${fmtBRL(model.shortTermCards.due)} em faturas abertas e ${fmtBRL(model.shortTermCards.future)} futuras. Só cadastre aqui se a fatura virou rotativo ou parcelamento.</div>` : ""}</div>` : ""}
      ${renderDebtList(model)}
    </div></div>`;
}

// source: js/screens/goals.js
// js/screens/goals.js. Metas financeiras. Motor em goals.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// GOALS
// ==================================================================
// `GOAL_ICON_OPTIONS` mora em js/goals.js: quem valida a escolha e o motor.
function renderGoalsScreen() {
  const model = goalsModel();
  const gf = state.goalForm;
  const editing = !!state.editingGoalId;

  return `<div class="screen">
    <div class="screen-header">
      <h1 class="page-title">Metas financeiras</h1>
      ${gf.show ? "" : `<button class="btn btn--goal btn--sm" data-action="toggle-goal-form">${svgIcon("plus", 15)} Nova meta</button>`}
    </div>

    <div class="grid-dashboard">
      ${model.goals.length > 0 ? renderGoalsHero(model) : ""}
      ${gf.show ? renderGoalForm(gf, editing) : ""}
      ${model.goals.length > 0 ? renderGoalsPlanCard(model) : ""}
      ${model.advice.length > 0 ? renderGoalsAdviceCard(model) : ""}

      ${model.goals.length === 0 && !gf.show ? `<div class="card span-3">
        ${renderEmptyState("target", "Você ainda não criou metas.", "Escolha um objetivo abaixo ou toque em \u201cNova meta\u201d; o app passa a projetar quando você chega lá.")}
        <div class="goal-templates">
          ${GOAL_TEMPLATES.map((t) => `<button class="goal-template" data-action="goal-template" data-value="${t.id}">
            <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, var(--goal) 14%, transparent); color:var(--goal)">${svgIcon(t.icon, 15)}</span>
            <span class="goal-template__text"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.hint)}</span></span>
          </button>`).join("")}
        </div>
      </div>` : ""}

      ${model.goals.map((m) => renderGoalCard(m)).join("")}
    </div>
  </div>`;
}

// ---- Painel do topo: total guardado, progresso e o que entrou neste mês ----
function renderGoalsHero(model) {
  const t = model.totals;
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <div class="hero-label-row"><p class="hero-label">Total guardado em metas</p>${renderCalculationButton("goals")}</div>
    <p class="hero-value">${fmtBRL(t.saved)}</p>
    <p class="hero-reserved">${t.pct.toFixed(0)}% de ${fmtBRL(t.target)} · faltam ${fmtBRL(t.remaining)}</p>

    <div class="wealth-bar" role="img" aria-label="Progresso combinado das metas">
      <div class="wealth-bar__seg" data-ui-css="flex:${Math.max(t.pct, 1)}; background:var(--goal)"></div>
      <div class="wealth-bar__seg" data-ui-css="flex:${Math.max(100 - t.pct, 1)}; background:rgba(255,255,255,0.16)"></div>
    </div>

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("piggy", 17)}<div><span class="hero-chip__label">Aportado neste mês</span><span class="hero-chip__value">${fmtBRL(t.contributedThisMonth)}</span></div></div>
      <div class="hero-chip">${svgIcon("target", 17)}<div><span class="hero-chip__label">Metas ativas</span><span class="hero-chip__value">${model.counts.total - model.counts.done}</span></div></div>
      ${model.counts.done > 0 ? `<div class="hero-chip">${svgIcon("checkCircle", 17)}<div><span class="hero-chip__label">Concluídas</span><span class="hero-chip__value">${model.counts.done}</span></div></div>` : ""}
    </div>
  </div>`;
}

// ---- Viabilidade do plano: o compromisso cabe na sobra real? ----
function renderGoalsPlanCard(model) {
  const p = model.plan;
  if (p.commitment <= 0 && p.capacity <= 0) return "";
  const tone = p.feasible === false ? "var(--negative)" : (p.feasible === true ? "var(--positive)" : "var(--ink-faint)");
  const ratio = p.capacity > 0 ? clamp(safePct(p.commitment, p.capacity), 0, 100) : 0;

  return `<div class="card span-3" data-ui-css="--tone:${tone}">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Seu plano cabe no orçamento?</p>
        <p class="mini-card__sub">${p.capacityBasis === "historico"
          ? (p.capacityMonths === 1
            ? "Sobra média do último mês com movimento"
            : `Sobra média dos últimos ${p.capacityMonths} meses com movimento`)
          : p.capacityBasis === "renda" ? "Estimativa de 20% da renda informada (ainda sem histórico)" : "Sem histórico para estimar a sobra"}</p>
      </div>
      <span class="plan-verdict" data-ui-css="color:${inkOf(tone)}">${p.feasible === false ? "Aperta" : p.feasible === true ? "Cabe" : "Sem base"}</span>
    </div>

    <div class="plan-meter"><div class="plan-meter__fill" data-ui-css="width:${ratio}%; background:${tone}"></div></div>

    <div class="plan-grid">
      <div class="plan-cell"><span>Compromisso mensal</span><b>${fmtBRL(p.commitment)}</b></div>
      <div class="plan-cell"><span>Sobra média</span><b>${fmtBRL(p.capacity)}</b></div>
      <div class="plan-cell"><span>Ritmo real somado</span><b>${fmtBRL(p.paceTotal)}</b></div>
    </div>

    <p class="field-hint">${p.feasible === false
      ? `Faltam ${fmtBRL(p.gap)} por mês. Compare reduzir o valor, ampliar o prazo ou aumentar o aporte sem comprometer o orçamento.`
      : p.plannedTotal > 0
        ? "Compromisso = soma dos aportes mensais que você definiu. Sem aporte definido, entra o valor necessário para bater o prazo."
        : "Nenhuma meta tem aporte mensal definido ainda. Defina um para o app acompanhar o ritmo em vez de só o total."}</p>
  </div>`;
}

function renderGoalsAdviceCard(model) {
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--brand)" };
  return `<div class="card card--summary span-3">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">O que fazer agora</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Ordenado por urgência, calculado no seu aparelho</p>
      </div>
    </div>
    <div class="summary-grid">
      ${model.advice.map((a) => `<div class="summary-item" data-ui-css="--tone:${tone[a.tone]}">
        <span class="summary-item__icon">${svgIcon(a.icon, 16)}</span>
        <p class="summary-item__text">${escapeHtml(a.text)}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Formulário (mesmo componente para criar e editar) ----
function renderGoalForm(gf, editing) {
  return `<div class="card card--elevated span-3">
    <p class="card-title">${editing ? "Editar meta" : "Nova meta"}</p>

    ${!editing ? `<div class="field"><p class="field__label">Começar de um modelo</p>
      <div class="class-picker">
        ${GOAL_TEMPLATES.map((t) => `<button class="class-chip" data-ui-css="--tone:var(--goal)" data-action="goal-template" data-value="${t.id}">
          ${svgIcon(t.icon, 15)}<span>${escapeHtml(t.name)}</span>
        </button>`).join("")}
      </div>
    </div>` : ""}

    <div class="field"><label class="field__label" for="goal-name-input">Nome da meta</label>
      <input id="goal-name-input" class="input" data-field="goal-name" value="${escapeHtml(gf.name)}" placeholder="Ex: Reserva de emergência" autocomplete="off" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="goal-target-input">Valor alvo</label>
        <input id="goal-target-input" class="input" data-field="goal-target" value="${escapeHtml(gf.target)}" inputmode="decimal" placeholder="0,00" /></div>
      <div class="field"><label class="field__label" for="goal-saved-input">${editing ? "Valor já guardado" : "Valor inicial"}</label>
        <input id="goal-saved-input" class="input" data-field="goal-saved-upfront" value="${escapeHtml(gf.savedUpfront)}" inputmode="decimal" placeholder="0,00" ${editing ? "disabled" : ""} /></div>
    </div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="goal-deadline-input">Prazo (opcional)</label>
        <input id="goal-deadline-input" type="date" class="input" data-field="goal-deadline" min="${todayIso()}" value="${gf.deadline}" /></div>
      <div class="field"><label class="field__label" for="goal-plan-input">Aporte mensal planejado</label>
        <input id="goal-plan-input" class="input" data-field="goal-monthly-plan" value="${escapeHtml(gf.monthlyPlan)}" inputmode="decimal" placeholder="0,00" /></div>
    </div>

    <p class="field-hint">${editing
      ? "O valor guardado só muda por aporte ou resgate; assim o histórico de lançamentos nunca discorda do saldo da meta."
      : "Se informar um valor inicial, você escolherá se ele sai do saldo agora ou se já estava guardado antes."}</p>
    <p class="field-hint">O aporte planejado é o seu compromisso. O app compara ele com o que você realmente guardou e com o que o prazo exige.</p>

    ${renderGoalInflationField(gf)}

    <div class="field"><p class="field__label">Ícone</p>
      <div class="icon-picker">${GOAL_ICON_OPTIONS.map((k) => `<button class="icon-picker__btn ${gf.icon === k ? "active" : ""}" data-action="set-goal-icon" data-value="${k}" aria-label="Escolher ícone ${k}" aria-pressed="${gf.icon === k ? "true" : "false"}">${svgIcon(k, 19)}</button>`).join("")}</div>
    </div>

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="cancel-goal-form">Cancelar</button>
      <button class="btn btn--goal" data-action="submit-goal">${editing ? "Salvar alterações" : "Criar meta"}</button>
    </div>
  </div>`;
}



// [M36] A leitura corrigida, dentro do cartão da meta. Só aparece para quem
// marcou a opção, e sempre com a taxa escrita na frase: um número de dois anos
// à frente sem a premissa que o gerou é palpite disfarçado de projeção.
function renderGoalInflationLine(m) {
  const inf = m.inflation;
  if (!inf || !inf.on) return "";
  if (inf.reason === "sem-prazo") {
    return `<p class="goal-eta">${svgIcon("info", 13)}<span>Correção pela inflação ligada, mas esta meta não tem prazo. Defina uma data para o app estimar o preço lá na frente.</span></p>`;
  }
  if (inf.reason === "sem-taxa") {
    return `<p class="goal-eta">${svgIcon("info", 13)}<span>Correção pela inflação ligada, mas a premissa de IPCA está em zero. Ajuste-a em Ajustes &gt; Premissas de mercado.</span></p>`;
  }
  if (inf.reason !== "ok") return "";

  const alerta = inf.covers === false && m.requiredMonthly != null && moneyCompare(m.projectionRate, m.requiredMonthly) >= 0;
  return `<p class="goal-eta ${alerta ? "is-late" : ""}">${svgIcon(alerta ? "alertTriangle" : "trendUp", 13)}<span>Com IPCA de ${fmtNum(inf.pct)}% ao ano, ${fmtBRL(m.target)} de hoje viram <b>${fmtBRL(inf.targetAtDeadline)}</b> em ${fmtDateFull(m.deadline)}${inf.requiredMonthly != null ? `; manter o poder de compra pede <b>${fmtBRL(inf.requiredMonthly)}</b>/mês` : ""}. Estimativa pela premissa do app, não preço garantido.</span></p>`;
}
// [M36] Correção do alvo pela inflação. É uma marcação, não um campo de taxa: a
// taxa mora em Ajustes > Premissas de mercado, junto com Selic, CDI e TR, e os
// simuladores leem a mesma. Duas inflações em telas diferentes acabariam
// discordando, e aí nenhuma das duas valeria nada.
//
// A prévia usa o que já está digitado no formulário, então a pessoa vê o efeito
// antes de salvar. Sem prazo não há horizonte para corrigir, e o texto diz isso
// em vez de esconder a opção.
function renderGoalInflationField(gf) {
  const pct = goalInflationPct(state.data);
  const alvo = parseMoneyInput(gf.target);
  const dias = gf.deadline ? daysBetweenIso(todayIso(), gf.deadline) : null;
  const anos = dias != null && dias >= GOAL_INFLATION_MIN_DAYS ? dias / 365.25 : 0;
  const estimado = alvo > 0 && anos > 0 ? inflateMoney(alvo, pct, anos) : 0;

  let previa;
  if (pct <= 0) {
    previa = "A premissa de inflação está em zero. Ajuste o IPCA nas premissas de mercado para a correção ter efeito.";
  } else if (!gf.deadline) {
    previa = `Sem prazo não há horizonte para corrigir. Defina uma data e o app estima o preço com o IPCA de ${fmtNum(pct)}% ao ano.`;
  } else if (anos <= 0) {
    previa = "O prazo é curto demais para a correção mudar alguma coisa.";
  } else if (!(alvo > 0)) {
    previa = `Informe o valor alvo e o app estima quanto ele custaria em ${fmtDateFull(gf.deadline)} com o IPCA de ${fmtNum(pct)}% ao ano.`;
  } else {
    previa = `${fmtBRL(alvo)} hoje ≈ <b>${fmtBRL(estimado)}</b> em ${fmtDateFull(gf.deadline)}, com o IPCA de ${fmtNum(pct)}% ao ano. É estimativa, não preço garantido.`;
  }

  return `<div class="field">
    <label class="legal-consent">
      <input type="checkbox" data-action-select="goal-inflation" ${gf.inflationAdjusted ? "checked" : ""} />
      <span>Corrigir o alvo pela inflação estimada<small>O valor gravado continua sendo o preço de hoje; o app passa a mostrar também quanto seria preciso guardar para manter o poder de compra até o prazo.</small></span>
    </label>
    <p class="field-hint">${previa}</p>
    <button type="button" class="field__link" data-action="goal-inflation-rate">${svgIcon("trendUp", 13)} Ajustar a premissa de inflação</button>
  </div>`;
}
// Sugere quanto aportar por mês para bater a meta até o prazo, com base no
// valor que ainda falta e nos meses restantes até o deadline.
function goalMonthlySuggestion(g) {
  if (!g.deadline || !(g.target > 0)) return null;
  const remaining = subMoney(g.target, g.current);
  if (remaining <= 0) return null;
  const daysLeft = daysBetweenIso(todayIso(), g.deadline);
  if (daysLeft <= 0) return null;
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.44));
  return divMoney(remaining, monthsLeft);
}

function renderGoalCard(m) {
  const g = m.goal;
  const expanded = state.expandedGoalId === g.id;
  const mode = state.goalActionMode;
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--brand)" }[m.tone];
  const ringColor = m.done ? "var(--positive)" : "var(--goal)";

  return `<div class="card goal-card card--elevated span-1" data-ui-css="--tone:${tone}">
    <div class="goal-header">
      ${renderGoalRing(m.pct, ringColor, g.icon, 62)}
      <div class="goal-header__text">
        <p class="goal-name">${escapeHtml(g.name)}</p>
        <p class="goal-progress-inline"><b>${fmtBRL(m.saved)}</b> de ${fmtBRL(m.target)}</p>
        <span class="goal-status" data-ui-css="color:${inkOf(tone)}">${svgIcon(m.statusIcon, 12)} ${m.statusLabel}</span>
      </div>
      <div class="goal-header__actions">
        <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Editar meta">${svgIcon("pencil", 15)}</button>
        <button class="icon-btn" data-action="delete-goal" data-id="${g.id}" aria-label="Excluir meta">${svgIcon("trash", 15)}</button>
      </div>
    </div>

    <div class="progress progress--sm" data-ui-css="margin:12px 0 4px"><div class="progress__fill" data-ui-css="width:${clamp(m.pct, 0, 100)}%; background:${ringColor}"></div></div>
    <p class="goal-remaining">${m.done ? `${svgIcon("checkCircle", 14)} Meta concluída` : `Faltam <b>${fmtBRL(m.remaining)}</b>`}${m.daysLeft != null ? ` · ${m.daysLeft >= 0 ? `${m.daysLeft} dias restantes` : "prazo encerrado"}` : ""}</p>

    ${!m.done ? `<div class="goal-numbers">
      <div class="goal-number">
        <span class="goal-number__label">Necessário</span>
        <b>${m.requiredMonthly != null ? `${fmtBRL(m.requiredMonthly)}` : "Sem dados"}</b>
        <span class="goal-number__hint">${m.requiredMonthly != null ? "para bater o prazo" : "sem prazo definido"}</span>
      </div>
      <div class="goal-number">
        <span class="goal-number__label">Planejado</span>
        <b>${m.plannedMonthly > 0 ? fmtBRL(m.plannedMonthly) : "Não definido"}</b>
        <span class="goal-number__hint">${m.plannedMonthly > 0 ? "definido por você" : "toque no lápis para definir"}</span>
      </div>
      <div class="goal-number">
        <span class="goal-number__label">Ritmo real</span>
        <b data-ui-css="color:${m.paceActive ? inkOf(tone) : "var(--ink-faint)"}">${m.paceActive ? fmtBRL(m.paceMonthly) : "Sem histórico"}</b>
        <span class="goal-number__hint">${m.paceActive ? `média de ${m.paceWindow} ${m.paceWindow === 1 ? "mês" : "meses"}` : "nenhum aporte ainda"}</span>
      </div>
    </div>` : ""}

    ${!m.done && m.etaIso ? `<p class="goal-eta ${m.etaLate ? "is-late" : ""}">
      ${svgIcon("clock", 13)}<span>No ritmo ${m.projectionSource === "real" ? "atual" : "planejado"}, conclusão em <b>${fmtDateFull(m.etaIso)}</b>${m.etaMonths ? ` (${m.etaMonths} ${m.etaMonths === 1 ? "mês" : "meses"})` : ""}${m.etaLate ? "; depois do prazo." : "."}</span>
    </p>` : ""}
    ${!m.done && !m.etaIso ? `<p class="goal-eta">${svgIcon("info", 13)}<span>Sem aportes nem plano definido, não dá para estimar a conclusão.</span></p>` : ""}
    ${!m.done && m.gap > 0 ? `<p class="goal-eta is-late">${svgIcon("alertTriangle", 13)}<span>Faltam <b>${fmtBRL(m.gap)}</b> por mês para o prazo fechar.</span></p>` : ""}
    ${renderGoalInflationLine(m)}

    ${m.series.some((s) => s.contributed !== 0) ? `<div class="goal-spark">
      ${renderSparkline(m.series.map((s) => ({ value: s.balance })), ringColor, 300, 46)}
      <div class="chart-axis">${m.series.map((s) => `<span>${s.label}</span>`).join("")}</div>
    </div>` : ""}

    ${expanded ? `
      <div class="goal-contribute-row">
        <input id="goal-contribution-input" class="input" data-field="contribution-amount" value="${escapeHtml(state.goalContribution)}" inputmode="decimal" placeholder="Valor" autocomplete="off" />
        <button class="btn btn--goal" data-action="submit-goal-action" data-id="${g.id}">${mode === "resgatar" ? "Resgatar" : "Aportar"}</button>
        <button class="icon-btn" data-action="collapse-goal" aria-label="Fechar aporte ou resgate">${svgIcon("x", 15)}</button>
      </div>
      <p class="field-hint">${mode === "resgatar"
        ? (goalExistingBalance(g) > 0
          ? "O valor que já existia é liberado primeiro, sem alterar o saldo. Depois, a parte aportada volta como receita."
          : "O valor sai da meta e entra como receita no saldo livre deste mês.")
        : "O valor entra na meta e sai do seu saldo livre deste mês."}</p>
    ` : `<div class="goal-action-row">
        <button class="btn btn--goal-soft" data-action="expand-goal" data-value="aportar" data-id="${g.id}">${svgIcon("plus", 14)} Aportar${m.plannedMonthly > 0 && m.contributedThisMonth <= 0 ? ` ${fmtBRL(m.plannedMonthly)}` : ""}</button>
        <button class="btn btn--ghost" data-action="expand-goal" data-value="resgatar" data-id="${g.id}" ${m.saved <= 0 ? "disabled" : ""}>${svgIcon("arrowDownRight", 14)} Resgatar</button>
      </div>`}
  </div>`;
}

// source: js/screens/health.js
// js/screens/health.js. Saúde financeira. O diagnóstico vem de health.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// SAÚDE FINANCEIRA (Módulo 2)
// ------------------------------------------------------------------
// Tela dedicada de diagnóstico. Todo o raciocínio financeiro mora em
// health.js; aqui só existe transformação de modelo em HTML. O Score
// não é recalculado nem duplicado: o modelo devolve o mesmo objeto
// produzido por score.js e a tela reaproveita `renderScoreGauge`.
// ==================================================================
function renderHealthScreen() {
  const model = healthModel(keyOfCurrentMonth());
  const h = model.headline;
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };

  // NOTA SEM DADOS É CHUTE COM CARA DE DIAGNÓSTICO.
  //
  // Sem nenhum lançamento, meta ou bem, os indicadores caem todos em valores
  // neutros e a média sai perto de 79 - "Bom". Quem abria a tela no primeiro
  // minuto de uso recebia um atestado de saúde financeira calculado sobre o
  // vazio, e é justamente esse número que a tela pede para levar a sério. O
  // Início já espera o primeiro lançamento para mostrar análise (ver
  // `isDashboardStarting`); aqui a espera faltava.
  if (typeof isDashboardStarting === "function" && isDashboardStarting(state.data)) {
    return `<div class="screen">
      ${renderBackHeader("Saúde financeira")}
      <div class="grid-dashboard">
        <div class="card card--dashed span-3 banner-inline">
          ${svgIcon("shieldCheck", 34, "banner-inline__icon")}
          <div class="banner-inline__text">
            <strong>O diagnóstico começa no primeiro lançamento</strong>
            <span>Reserva, liquidez, dívida e patrimônio são calculados a partir do que você registra. Sem nenhum lançamento não há nota a dar: qualquer número aqui seria chute.</span>
          </div>
          <button class="btn btn--primary btn--sm" data-action="nav" data-tab="add">Registrar</button>
        </div>
        <div class="card span-3">
          <p class="card-title">O que a nota vai olhar</p>
          <ul class="plain-list">
            ${HEALTH_INDICATORS.map((i) => `<li><b>${escapeHtml(i.label)}</b><span>${escapeHtml(i.what)}</span></li>`).join("")}
          </ul>
        </div>
      </div>
    </div>`;
  }

  return `<div class="screen">
    ${renderBackHeader("Saúde financeira")}
    <div class="grid-dashboard">
      ${renderHealthHero(model, h, toneColor)}
      ${renderScoreBreakdown(model.score)}
      ${renderEmergencyLadder()}
      ${model.indicators.map((i) => renderHealthIndicator(i)).join("")}
      ${renderHealthPlan(model)}
      <p class="footnote span-3">Os indicadores usam apenas os seus lançamentos, metas e renda cadastrada. Nada é enviado para fora do aparelho. As faixas são referências educativas, e indicadores sem base de cálculo ficam marcados como “sem dados”.</p>
    </div>
  </div>`;
}

// ---- Cabeçalho: diagnóstico em uma frase + nota geral + distribuição ----
function renderHealthHero(model, h, toneColor) {
  const s = model.score;
  const counts = model.counts;
  const chips = [
    { id: "otimo",   label: "ótimo",    color: "var(--positive)" },
    { id: "bom",     label: "saudável", color: "var(--brand)" },
    { id: "atencao", label: "atenção",  color: "var(--goal)" },
    { id: "critico", label: "crítico",  color: "var(--negative)" },
    { id: "sem",     label: "sem dados", color: "var(--ink-faint)" },
  ].filter((c) => counts[c.id] > 0);

  return `<div class="card card--health-hero span-3" data-ui-css="--tone:${toneColor[h.tone]}">
    <div class="health-calculation-link">${renderCalculationButton("health")}</div>
    <div class="health-hero__grid">
      ${s && !s.insufficient ? `<div class="health-hero__gauge">
        ${renderScoreGauge(s.score, s.level.color, 104)}
        <p class="health-hero__gauge-label" data-ui-css="color:${s.level.color}">${s.level.label}</p>
        <p class="health-hero__gauge-note">Score financeiro</p>
      </div>` : ""}
      <div class="health-hero__text">
        <p class="health-hero__eyebrow">${svgIcon(h.tone === "positive" ? "checkCircle" : h.tone === "neutral" ? "info" : "alertTriangle", 14)}<span>Diagnóstico de ${MONTH_NAMES[new Date().getMonth()].toLowerCase()}</span></p>
        <h2 class="health-hero__title">${escapeHtml(h.title)}</h2>
        <p class="health-hero__desc">${escapeHtml(h.text)}</p>
        ${chips.length > 0 ? `<div class="health-chips">
          ${chips.map((c) => `<span class="health-chip" data-ui-css="--tone:${c.color}"><b>${counts[c.id]}</b> ${c.label}</span>`).join("")}
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

// ==================================================================
// [M27] "SUA PONTUAÇÃO": DE ONDE VÊM OS PONTOS
// ==================================================================
// A nota existia desde antes e era explicada só por fora: um número, um rótulo
// e um texto de método. Quem via "69 - Regular" não tinha como saber o que
// compõe 69, quanto cada parte pesa, nem o que mudaria o número.
//
// O motor (score.js) já calculava tudo isso e nada aparecia. Este painel mostra
// o que já existia: pontos ganhos sobre o peso de cada pilar, o motivo em
// linguagem humana e o que fazer a respeito.
//
// SOBRE A FRASE DO GANHO
//
// Ela é a única do painel que faz uma promessa, então é a que precisa de mais
// cuidado. O ganho vem de `scoreGains`, que divide a lacuna do pilar pelo peso
// AVALIADO, e não por 100: prometer pontos calculados sobre pilares que estão
// fora da conta seria inventar. O texto diz "até", porque fechar a lacuna
// inteira é o teto, não o esperado.
//
// E não há precisão falsa: a nota é declarada como indicador educacional, com a
// cobertura à vista quando algum pilar ficou sem base.
function renderScoreBreakdown(s) {
  if (!s || s.insufficient || typeof scoreGains !== "function") return "";
  const ganhos = scoreGains(s);
  if (ganhos.length === 0) return "";

  const maior = ganhos[0];
  // Meio ponto não é conselho; abaixo disso a nota já está no que dá.
  const vale = maior && maior.gain >= 0.5 ? maior : null;
  const alvo = vale ? Math.min(100, Math.round(s.score + vale.gain)) : null;

  return `<div class="card span-3 score-breakdown">
    <div class="score-breakdown__head">
      <p class="card-title">Sua pontuação</p>
      <p class="card-subtitle">${vale
        ? `Você está com <b>${s.score}</b>. O maior ganho disponível está em <b>${escapeHtml(vale.label)}</b>: fechar essa lacuna somaria até <b>${Math.round(vale.gain)} ${Math.round(vale.gain) === 1 ? "ponto" : "pontos"}</b>, chegando perto de <b>${alvo}</b>.`
        : `Você está com <b>${s.score}</b>. Nenhum pilar tem lacuna relevante agora; a nota se mantém acompanhando o que já está funcionando.`}</p>
    </div>

    <ul class="score-parts">
      ${ganhos.map((p) => {
        const pct = clamp(p.ratio * 100, 0, 100);
        const pontos = Math.round(p.points);
        const cor = p.good ? "var(--brand)" : "var(--goal)";
        return `<li class="score-part">
          <div class="score-part__head">
            <span class="score-part__label">${svgIcon(p.icon, 14)} ${escapeHtml(p.label)}</span>
            <span class="score-part__points"><b>${pontos}</b> de ${p.weight}</span>
          </div>
          <div class="score-part__meter" role="img" aria-label="${escapeHtml(p.label)}: ${pontos} de ${p.weight} pontos">
            <span class="score-part__fill" data-ui-css="width:${pct}%; background:${cor}"></span>
          </div>
          ${p.detail ? `<p class="score-part__detail">${escapeHtml(p.detail)}</p>` : ""}
          ${p.advice ? `<p class="score-part__advice">${svgIcon("sparkles", 13)} <span>${escapeHtml(p.advice)}</span></p>` : ""}
        </li>`;
      }).join("")}
    </ul>

    <p class="footnote score-breakdown__note">
      Indicador educacional, criado por este app para organizar a leitura do seu mês.
      Não é score de crédito, não é usado por banco nenhum e não vale como análise de risco.
      ${s.coverage < 100 ? `Hoje ${s.coverage}% dos pilares têm base de cálculo; os demais ficam fora da conta em vez de virar nota baixa.` : "Todos os pilares têm base de cálculo neste mês."}
    </p>
  </div>`;
}

// ==================================================================
// [M28] QUANTO GUARDAR PARA EMERGÊNCIAS
// ==================================================================
// O app já tinha um alvo de reserva, mas ele era um número só, calculado sobre
// o gasto TOTAL e apresentado como se fosse o certo. Duas coisas erradas nisso:
//
//   1. numa emergência a pessoa corta delivery e streaming antes de cortar
//      aluguel e remédio, então o gasto total pede uma reserva maior que a
//      necessária, e meta grande demais é a que ninguém começa;
//   2. três, seis e nove meses não são níveis de acerto: são apostas sobre
//      quanto tempo levaria para repor a renda. O app não sabe se quem está
//      lendo é concursado ou autônomo, e fingir que sabe é o erro.
//
// Por isso a escada mostra os três degraus lado a lado, com o que cada um
// compra, e apenas MARCA o que a pessoa escolheu em Ajustes.
function renderEmergencyLadder() {
  if (typeof emergencyLadder !== "function") return "";
  const e = emergencyLadder(state.data);
  if (!e.measurable) return "";

  const meses = e.monthsCovered;
  const cobertura = meses >= 0.1 ? `${meses.toFixed(1).replace(".", ",")} ${meses < 2 ? "mês" : "meses"}` : "menos de um mês";

  return `<div class="card span-3 reserve-ladder">
    <p class="card-title">Quanto guardar para emergências</p>
    <p class="card-subtitle">
      Seus gastos essenciais somam <b>${fmtBRL(e.essentials)} por mês</b>, na média dos últimos meses fechados.
      ${e.current > 0
        ? `Os <b>${fmtBRL(e.current)}</b> que você já reservou cobrem <b>${cobertura}</b> desse essencial.`
        : "Você ainda não tem reserva registrada."}
    </p>

    <ul class="reserve-rungs">
      ${e.rungs.map((r) => `<li class="reserve-rung ${r.chosen ? "is-chosen" : ""} ${r.reached ? "is-reached" : ""}">
        <div class="reserve-rung__head">
          <span class="reserve-rung__months">${escapeHtml(r.label)}${r.chosen ? ` <span class="reserve-rung__tag">seu alvo</span>` : ""}</span>
          <span class="reserve-rung__target">${fmtBRL(r.target)}</span>
        </div>
        <div class="reserve-rung__meter" role="img" aria-label="${escapeHtml(r.label)}: ${Math.round(r.pct)}% de ${fmtBRL(r.target)}">
          <span class="reserve-rung__fill" data-ui-css="width:${clamp(r.pct, 0, 100)}%"></span>
        </div>
        <p class="reserve-rung__note">${escapeHtml(r.note)}</p>
        <p class="reserve-rung__gap">${r.reached
          ? "Já alcançado."
          : `Faltam ${fmtBRL(r.missing)}.`}</p>
      </li>`).join("")}
    </ul>

    <p class="footnote reserve-ladder__note">
      Nenhum desses degraus é obrigatório, e o app não recomenda um. Quanto mais
      instável a renda, mais meses fazem sentido; quanto mais estável, menos.
      A conta usa só o essencial (o grupo de necessidades do seu orçamento),
      porque é o que continua saindo quando tudo o mais é cortado.
      Você escolhe o alvo em Ajustes.
    </p>
  </div>`;
}

// ---- Cartão de um indicador ----
function renderHealthIndicator(i) {
  const open = state.healthDetailId === i.id;
  const color = i.status.color;
  const pct = Math.round(i.ratio * 100);

  return `<div class="card card--indicator span-1" data-ui-css="--tone:${color}">
    <div class="indicator__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${color} 14%, transparent); color:${color}">${svgIcon(i.icon, 16)}</span>
      <div class="indicator__head-text">
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(i.label)}</p>
        <p class="indicator__status" data-ui-css="color:${color}">${i.status.label}</p>
      </div>
    </div>

    ${i.applicable ? `
      <p class="indicator__value">${escapeHtml(i.display)}</p>
      <p class="indicator__caption">${escapeHtml(i.caption)}</p>
      <div class="indicator__meter" role="img" aria-label="${escapeHtml(i.label)}: ${pct} de 100">
        <div class="indicator__meter-fill" data-ui-css="width:${pct}%; background:${color}"></div>
        ${i.marks.map((m) => `<span class="indicator__mark" data-ui-css="left:${clamp(m.at * 100, 0, 100)}%" title="${escapeHtml(m.label)}"></span>`).join("")}
      </div>
    ` : `<p class="indicator__value indicator__value--empty">Sem dados</p>`}

    <p class="indicator__desc">${escapeHtml(i.description)}</p>

    ${i.recommendation ? `<div class="indicator__advice">
      ${svgIcon("sparkles", 14, "indicator__advice-icon")}
      <div>
        <p class="indicator__advice-text">${escapeHtml(i.recommendation)}</p>
        ${i.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${i.cta.tab}">${escapeHtml(i.cta.label)}</button>` : ""}
      </div>
    </div>` : ""}

    <button class="indicator__more" data-action="toggle-health-detail" data-id="${i.id}" aria-expanded="${open}">
      <span>${open ? "Ocultar" : "Como é calculado"}</span>${svgIcon(open ? "chevronUp" : "chevronDown", 14)}
    </button>
    ${open ? `<div class="indicator__method">
      <p>${escapeHtml(i.what)}</p>
      ${i.benchmark ? `<p class="indicator__benchmark">${escapeHtml(i.benchmark)}</p>` : ""}
    </div>` : ""}
  </div>`;
}

// ---- Plano de ação: fila priorizada, não uma lista de desejos ----
function renderHealthPlan(model) {
  const plan = model.actionPlan;
  if (plan.length === 0) {
    return `<div class="card span-3">
      <p class="card-title">Plano de ação</p>
      ${model.rated === 0
        ? renderEmptyState("target", "Sem diagnóstico ainda.", "Cadastre sua renda e alguns lançamentos para receber recomendações.")
        : renderEmptyState("checkCircle", "Nenhuma ação urgente.", "Todos os indicadores avaliados estão em nível saudável ou ótimo.")}
    </div>`;
  }
  return `<div class="card card--plan span-3">
    <p class="card-title">Plano de ação</p>
    <p class="health-sub">Na ordem em que faz sentido resolver: liquidez e dívida antes de reserva, reserva antes de investimento.</p>
    <ol class="plan-list">
      ${plan.map((p) => `<li class="plan-item" data-ui-css="--tone:${p.status.color}">
        <span class="plan-item__num">${p.order}</span>
        <div class="plan-item__body">
          <p class="plan-item__label">${svgIcon(p.icon, 13)}<span>${escapeHtml(p.label)}</span><span class="plan-item__tag">${p.status.label}</span></p>
          <p class="plan-item__text">${escapeHtml(p.text)}</p>
          ${p.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${p.cta.tab}">${escapeHtml(p.cta.label)}</button>` : ""}
        </div>
      </li>`).join("")}
    </ol>
  </div>`;
}

// source: js/screens/wealth.js
// js/screens/wealth.js. Patrimônio: bens, dívidas e evolução. Cálculo em wealth.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// PATRIMÔNIO (Módulo 3)
// ------------------------------------------------------------------
// Cadastro de bens e dívidas + evolução mensal + comparação anual.
// Todo o cálculo mora em wealth.js/metrics.js; aqui só há montagem de
// HTML e manipulação do formulário. O gráfico é SVG puro, sem lib.
// ==================================================================
function renderWealthScreen() {
  const model = wealthModel(state.wealth.months);
  const wf = state.wealth.form;

  return `<div class="screen">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <h1 class="page-title">Patrimônio</h1>
      </div>
      <button class="btn btn--primary btn--sm" data-action="wealth-new">${svgIcon("plus", 15)} Cadastrar</button>
    </div>

    <div class="grid-dashboard">
      ${renderWealthHero(model)}
      ${wf ? renderWealthForm(wf) : ""}
      ${renderWealthChartCard(model)}
      ${renderWealthAnnualCard(model)}
      ${model.allocation.length > 0 ? renderWealthAllocationCard(model) : ""}
      ${renderWealthInsightsCard(model)}
      ${renderWealthGroups(model)}
      <p class="footnote span-3">O caixa vem dos seus lançamentos. Bens e dívidas cadastrados aqui completam o quadro; e cada item guarda o próprio histórico mensal, então a curva acima é reconstruída com o valor que cada bem tinha na época, não com o de hoje.</p>
    </div>
  </div>`;
}

// ---- Painel principal: patrimônio líquido e composição ----
function renderWealthHero(m) {
  const c = m.composition;
  const d = m.delta.year;
  const trendColor = d.up ? "var(--positive)" : "var(--negative)";

  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <div class="hero-label-row"><p class="hero-label">Patrimônio líquido</p>${renderCalculationButton("net-worth")}</div>
    <p class="hero-value">${fmtBRL(m.worth.total)}</p>
    ${d.comparable ? `<p class="hero-reserved">${svgIcon(d.up ? "arrowUpRight" : "arrowDownRight", 14)} ${d.up ? "+" : "−"}${fmtBRL(Math.abs(d.value))} (${d.up ? "+" : "−"}${fmtDec(Math.abs(d.pct), 1)}%) em ${m.months} meses</p>` : ""}

    ${c.gross > 0 ? `<div class="wealth-bar">
      ${c.positive.map((b) => `<div class="wealth-bar__seg" data-ui-css="flex:${Math.max(b.value, 1)}; background:${b.color}" title="${escapeHtml(b.label)}"></div>`).join("")}
    </div>` : ""}

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("layout", 17)}<div><span class="hero-chip__label">Total em bens</span><span class="hero-chip__value">${fmtBRL(c.gross)}</span></div></div>
      <div class="hero-chip">${svgIcon("alertTriangle", 17)}<div><span class="hero-chip__label">Dívidas</span><span class="hero-chip__value">${fmtBRL(c.debts)}</span></div></div>
      ${m.monthlyPayment > 0 ? `<div class="hero-chip">${svgIcon("bell", 17)}<div><span class="hero-chip__label">Parcelas por mês</span><span class="hero-chip__value">${fmtBRL(m.monthlyPayment)}</span></div></div>` : ""}
    </div>
    ${c.debts > 0 ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="debts">Planejar quitação das dívidas</button>` : ""}

    <div class="wealth-legend">
      ${c.positive.map((b) => `<div class="wealth-legend__item">
        <span class="cat-dot" data-ui-css="background:${b.color}"></span>
        <div class="wealth-legend__text">
          <span class="wealth-legend__label">${escapeHtml(b.label)} · ${b.pct.toFixed(0)}%</span>
          <span class="wealth-legend__note">${escapeHtml(b.note)}</span>
        </div>
        <b>${fmtBRL(b.value)}</b>
      </div>`).join("")}
      ${c.negative.map((b) => `<div class="wealth-legend__item wealth-legend__item--neg">
        <span class="cat-dot" data-ui-css="background:${b.color}"></span>
        <div class="wealth-legend__text"><span class="wealth-legend__label">${escapeHtml(b.label)}</span></div>
        <b>−${fmtBRL(b.value)}</b>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Formulário de cadastro/edição ----
function renderWealthForm(f) {
  const cls = assetClassOf(f.class);
  const editing = !!f.id;
  const isLiability = cls.kind === "liability";
  const isAccount = f.class === "conta" || f.class === "carteira";

  return `<div class="card card--elevated span-3" id="wealth-form" data-ui-css="scroll-margin-top:18px">
    <p class="card-title">${editing ? "Editar item" : "Cadastrar bem ou dívida"}</p>

    <div class="field"><p class="field__label">Tipo</p>
      <div class="class-picker">
        ${ASSET_CLASSES.map((c) => `<button class="class-chip ${f.class === c.id ? "active" : ""}" data-ui-css="--tone:${c.color}" data-action="wealth-set-class" data-value="${c.id}">
          ${svgIcon(c.icon, 15)}<span>${escapeHtml(c.label)}</span>
        </button>`).join("")}
      </div>
      <p class="field-hint">${escapeHtml(cls.hint)}</p>
    </div>

    <div class="field"><label class="field__label" for="wealth-name-input">Nome</label>
      <input id="wealth-name-input" class="input" data-field="wealth-name" value="${escapeHtml(f.name)}" placeholder="${escapeHtml(isLiability ? "Ex: Financiamento do carro" : "Ex: Apartamento")}" autocomplete="off" maxlength="60" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="wealth-value-input">${isLiability ? "Saldo devedor hoje" : "Valor atual"}</label>
        <input id="wealth-value-input" class="input" data-field="wealth-value" value="${escapeHtml(f.value)}" inputmode="decimal" placeholder="0,00" /></div>
      ${isLiability ? `<div class="field"><label class="field__label" for="wealth-payment-input">Parcela mensal</label>
        <input id="wealth-payment-input" class="input" data-field="wealth-payment" value="${escapeHtml(f.monthlyPayment)}" inputmode="decimal" placeholder="0,00" /></div>` : ""}
    </div>

    ${isLiability ? `<div class="field"><label class="field__label" for="wealth-dueday-input">Dia do vencimento (opcional)</label>
      <input id="wealth-dueday-input" class="input" data-field="wealth-dueday" value="${escapeHtml(f.dueDay)}" inputmode="numeric" placeholder="Ex: 10" maxlength="2" />
      <p class="field-hint">Informando o dia, a parcela aparece no Calendário e entra na previsão de saldo. Sem ele, nenhum dia é marcado; melhor não marcar do que marcar errado.</p></div>` : ""}

    <div class="field"><label class="field__label" for="wealth-note-input">Observação (opcional)</label>
      <input id="wealth-note-input" class="input" data-field="wealth-note" value="${escapeHtml(f.note)}" placeholder="Ex: Tesouro Selic 2029 na corretora" autocomplete="off" maxlength="140" /></div>

    ${isAccount ? `<button class="toggle-row" data-action="wealth-toggle-ledger">
      <span class="toggle-row__box ${f.inLedger ? "active" : ""}">${f.inLedger ? svgIcon("check", 13) : ""}</span>
      <span class="toggle-row__text">
        <b>O saldo desta conta já vem dos meus lançamentos</b>
        <span>Marque para o item aparecer na lista sem somar de novo no patrimônio; é o que evita contar o mesmo dinheiro duas vezes.</span>
      </span>
    </button>` : ""}

    ${isLiability ? `<p class="field-hint">A parcela mensal informada entra no indicador de Dívidas da tela Saúde Financeira.</p>` : ""}

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="wealth-cancel">Cancelar</button>
      <button class="btn btn--primary" data-action="wealth-save">${editing ? "Salvar alterações" : "Cadastrar"}</button>
    </div>
  </div>`;
}

// ---- Gráfico de evolução (SVG puro, com eixo e ponto destacado) ----
function renderWealthChart(series, width, height) {
  const w = width || 640;
  const h = height || 170;
  const padTop = 12;
  const padBottom = 22;
  const values = series.map((p) => p.value);
  if (values.length < 2) return `<p class="footnote">Ainda não há meses suficientes para desenhar a evolução.</p>`;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const plotH = h - padTop - padBottom;
  const x = (i) => (i / (series.length - 1)) * w;
  const y = (v) => padTop + plotH - ((v - min) / span) * plotH;

  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const area = `0,${padTop + plotH} ${pts.join(" ")} ${w},${padTop + plotH}`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--brand)" : "var(--negative)";
  const gid = `wealth-grad-${Math.random().toString(36).slice(2, 8)}`;
  const zeroY = min < 0 ? y(0) : null;
  const lastI = series.length - 1;

  return `<svg class="wealth-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Evolução do patrimônio ${series.length === 1 ? "no último mês" : `nos últimos ${series.length} meses`}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${zeroY != null ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>` : ""}
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(lastI).toFixed(1)}" cy="${y(values[lastI]).toFixed(1)}" r="4" fill="var(--card)" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function renderWealthChartCard(m) {
  const opts = [6, 12, 24];
  const first = m.series[0];
  const last = m.series[m.series.length - 1];
  return `<div class="card span-3">
    <div class="wealth-chart__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Evolução mensal</p>
        <p class="health-sub">De ${escapeHtml(first.label)}/${String(first.year).slice(2)} até hoje.</p>
      </div>
      <div class="seg-control">
        ${opts.map((o) => `<button class="seg-control__btn ${m.months === o ? "active" : ""}" data-action="wealth-months" data-value="${o}">${o}m</button>`).join("")}
      </div>
    </div>
    ${renderWealthChart(m.series)}
    <div class="wealth-axis">${m.series.map((p, i) => `<span class="${p.isCurrent ? "is-current" : ""}">${i % Math.ceil(m.series.length / 6) === 0 || p.isCurrent ? escapeHtml(p.label) : ""}</span>`).join("")}</div>
    <div class="wealth-deltas">
      ${[["No mês", m.delta.month], ["6 meses", m.delta.sixMonths], [`${m.months} meses`, m.delta.year]].map(([label, d]) => `
        <div class="wealth-delta">
          <span class="wealth-delta__label">${escapeHtml(label)}</span>
          <b class="wealth-delta__value" data-ui-css="color:${inkOf(d.comparable ? (d.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)")}">
            ${d.comparable ? `${d.up ? "+" : "−"}${fmtBRLShort(Math.abs(d.value))}` : "Sem dados"}
          </b>
        </div>`).join("")}
    </div>
    <p class="footnote" data-ui-css="text-align:left">O último ponto é o patrimônio de hoje, não uma projeção de fim de mês; por isso ele bate exatamente com o número do topo. Início em ${fmtBRL(first.value)}, hoje ${fmtBRL(last.value)}.</p>
  </div>`;
}

// ---- Comparação anual ----
function renderWealthAnnualCard(m) {
  const a = m.annual;
  const years = a.years;
  const maxAbs = Math.max(...years.map((r) => Math.abs(r.value)), 1);

  return `<div class="card span-2">
    <p class="card-title">Comparação anual</p>
    <p class="health-sub">Fechamento de cada ano civil. O ano corrente é parcial, com o valor de hoje.</p>

    <div class="year-bars">
      ${years.map((r) => {
        const pct = clamp((Math.abs(r.value) / maxAbs) * 100, 2, 100);
        const neg = r.value < 0;
        return `<div class="year-bar ${r.isCurrent ? "is-current" : ""}">
          <span class="year-bar__label">${r.year}${r.isCurrent ? " · hoje" : ""}</span>
          <div class="year-bar__track"><div class="year-bar__fill" data-ui-css="width:${pct}%; background:${neg ? "var(--negative)" : (r.isCurrent ? "var(--brand)" : "color-mix(in srgb, var(--brand) 55%, transparent)")}"></div></div>
          <b class="year-bar__value">${fmtBRLShort(r.value)}</b>
        </div>`;
      }).join("")}
    </div>

    <div class="wealth-deltas" data-ui-css="margin-top:16px">
      <div class="wealth-delta">
        <span class="wealth-delta__label">No ano (desde 31/12)</span>
        <b class="wealth-delta__value" data-ui-css="color:${inkOf(a.ytd.comparable ? (a.ytd.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)")}">
          ${a.ytd.comparable ? `${a.ytd.up ? "+" : "−"}${fmtBRLShort(Math.abs(a.ytd.value))}` : "Sem dados"}
        </b>
      </div>
      <div class="wealth-delta">
        <span class="wealth-delta__label">Contra 12 meses atrás</span>
        <b class="wealth-delta__value" data-ui-css="color:${inkOf(a.yoy.comparable ? (a.yoy.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)")}">
          ${a.yoy.comparable ? `${a.yoy.up ? "+" : "−"}${fmtDec(Math.abs(a.yoy.pct), 1)}%` : "Sem dados"}
        </b>
      </div>
    </div>
  </div>`;
}

// ---- Distribuição por classe ----
function renderWealthAllocationCard(m) {
  return `<div class="card span-1">
    <p class="card-title">Distribuição dos bens</p>
    <div class="segment-bar" data-ui-css="margin:12px 0 14px">
      ${m.allocation.map((r) => `<div data-ui-css="flex:${Math.max(r.value, 1)}; background:${r.color}" title="${escapeHtml(r.label)}"></div>`).join("")}
    </div>
    <div class="alloc-list">
      ${m.allocation.map((r) => `<div class="alloc-row">
        <span class="cat-dot" data-ui-css="background:${r.color}"></span>
        <span class="alloc-row__label">${escapeHtml(r.label)}</span>
        <span class="alloc-row__pct">${r.pct.toFixed(0)}%</span>
        <b>${fmtBRLShort(r.value)}</b>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderWealthInsightsCard(m) {
  if (m.insights.length === 0) return "";
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };
  return `<div class="card span-3">
    <p class="card-title">Leitura do período</p>
    <div class="summary-grid" data-ui-css="margin-top:12px">
      ${m.insights.map((i) => `<div class="summary-item" data-ui-css="--tone:${toneColor[i.tone]}">
        <span class="summary-item__icon">${svgIcon(i.icon, 16)}</span>
        <p class="summary-item__text">${escapeHtml(i.text)}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Listas de bens e dívidas ----
function renderWealthGroups(m) {
  if (m.groups.length === 0) {
    return `<div class="card span-3">
      ${renderEmptyState("layout", "Nenhum bem ou dívida cadastrado.", "Cadastre suas contas, investimentos, veículos, imóveis e financiamentos para ver o patrimônio real; e não só o caixa dos lançamentos.")}
      <button class="btn btn--primary btn--block btn--sm" data-action="wealth-new">Cadastrar o primeiro item</button>
    </div>`;
  }
  return m.groups.map((g) => `<div class="card span-3" data-ui-css="--tone:${g.color}">
    <div class="wealth-group__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${g.color} 14%, transparent); color:${g.color}">${svgIcon(g.icon, 16)}</span>
      <div class="wealth-group__title">
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(g.label)}</p>
        <p class="mini-card__sub">${g.items.length} ${g.items.length === 1 ? "item" : "itens"}</p>
      </div>
      <b class="wealth-group__total" data-ui-css="color:${g.kind === "liability" ? "var(--negative)" : "var(--ink)"}">${g.kind === "liability" ? "−" : ""}${fmtBRL(g.total)}</b>
    </div>
    <div class="asset-list">
      ${g.items.map((a) => renderAssetRow(a, g)).join("")}
    </div>
  </div>`).join("");
}

function renderAssetRow(a, g) {
  const updating = state.wealth.updatingId === a.id;
  const ch = a.change;

  return `<div class="asset-row">
    <div class="asset-row__main">
      <div class="asset-row__info">
        <p class="asset-row__name">${escapeHtml(a.name)}${a.inLedger ? `<span class="asset-row__tag">já nos lançamentos</span>` : ""}</p>
        ${a.note ? `<p class="asset-row__note">${escapeHtml(a.note)}</p>` : ""}
        ${a.monthlyPayment > 0 ? `<p class="asset-row__note">${fmtBRL(a.monthlyPayment)} por mês</p>` : ""}
      </div>
      <div class="asset-row__values">
        <b class="asset-row__value ${a.inLedger ? "is-muted" : ""}">${fmtBRL(a.value)}</b>
        ${ch && Math.abs(ch.value) > 0 ? `<span class="asset-row__delta" data-ui-css="color:${ch.up ? "var(--positive)" : "var(--negative)"}">${ch.up ? "+" : "−"}${fmtBRLShort(Math.abs(ch.value))} no mês</span>` : ""}
      </div>
      <div class="asset-row__actions">
        <button class="icon-btn icon-btn--muted" data-action="wealth-update-open" data-id="${a.id}" aria-label="Atualizar valor de ${escapeHtml(a.name)}">${svgIcon("refresh", 15)}</button>
        <button class="icon-btn icon-btn--muted" data-action="wealth-edit" data-id="${a.id}" aria-label="Editar ${escapeHtml(a.name)}">${svgIcon("pencil", 15)}</button>
        <button class="icon-btn icon-btn--muted" data-action="wealth-delete" data-id="${a.id}" aria-label="Excluir ${escapeHtml(a.name)}">${svgIcon("trash", 15)}</button>
      </div>
    </div>

    ${updating ? `<div class="asset-row__update">
      <div class="field" data-ui-css="margin:0">
        <label class="field__label" for="wealth-update-input">Valor atual em ${escapeHtml(MONTH_NAMES[new Date().getMonth()])}</label>
        <input id="wealth-update-input" class="input" data-field="wealth-update" value="${escapeHtml(state.wealth.updateValue)}" inputmode="decimal" placeholder="0,00" />
      </div>
      <p class="field-hint">O valor anterior fica guardado no histórico; é ele que desenha a curva de evolução.</p>
      <div class="form-actions">
        <button class="btn btn--ghost btn--sm" data-action="wealth-update-cancel">Cancelar</button>
        <button class="btn btn--primary btn--sm" data-action="wealth-update-save" data-id="${a.id}">Atualizar</button>
      </div>
    </div>` : ""}

  </div>`;
}

// source: js/screens/portfolio.js
// js/screens/portfolio.js. Carteira de investimentos. Cálculo em portfolio.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// MÓDULO 5. CENTRAL DE INVESTIMENTOS
// ------------------------------------------------------------------
// A carteira é a mesma coleção `assets` do Módulo 3 (classe "investimento").
// Esta tela não cria um cadastro paralelo: ela acrescenta o DETALHE que
// transforma "quanto eu tenho aplicado" em "quanto isso está rendendo".
// Todo cálculo mora em portfolio.js; aqui só há HTML.
// ==================================================================

function renderPortfolioScreen() {
  const m = portfolioModel(state.portfolio.months);
  const f = state.portfolio.form;

  return `<div class="screen">
    <div class="screen-header">
      <div>
        <p class="eyebrow">Central de investimentos</p>
        <h1 class="page-title">Minha carteira</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn--ghost btn--sm" data-action="nav" data-tab="simulators">${svgIcon("sparkles", 15)} Simuladores</button>
        <button class="btn btn--primary btn--sm" data-action="pf-new">${svgIcon("plus", 15)} Aplicação</button>
      </div>
    </div>

    <div class="grid-dashboard">
      ${renderPortfolioHero(m)}
      ${f ? renderPortfolioForm(f) : ""}
      ${m.hasItems ? renderPortfolioChartCard(m) : ""}
      ${m.benchmark.comparable ? renderPortfolioBenchmarkCard(m) : ""}
      ${m.allocation.length > 0 ? renderPortfolioAllocationCard(m) : ""}
      ${m.insights.length > 0 ? renderPortfolioInsightsCard(m) : ""}
      ${renderPortfolioGroups(m)}
      <p class="footnote span-3">O valor de mercado de cada aplicação é o que entra no seu patrimônio. Os proventos recebidos entram apenas no cálculo de rentabilidade; o dinheiro deles, quando cai na conta, já é um lançamento de receita, e somá-lo aqui contaria duas vezes.</p>
    </div>
  </div>`;
}

// ---- Painel principal ----
function renderPortfolioHero(m) {
  const t = m.totals;
  const tone = t.up ? "var(--positive)" : "var(--negative)";
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <p class="hero-label">Total aplicado (valor de mercado)</p>
    <p class="hero-value">${fmtBRL(t.value)}</p>
    ${t.returnPct != null ? `<p class="hero-reserved">${svgIcon(t.up ? "arrowUpRight" : "arrowDownRight", 14)} ${t.up ? "+" : "−"}${fmtBRL(Math.abs(t.totalReturn))} (${t.up ? "+" : "−"}${fmtNum(Math.abs(t.returnPct))}%) sobre o que você aportou</p>` : ""}

    ${m.groups.length > 0 ? `<div class="wealth-bar" role="img" aria-label="Composição da carteira por classe">
      ${m.groups.map((g) => `<div class="wealth-bar__seg" data-ui-css="flex:${Math.max(g.value, 1)}; background:${g.color}" title="${escapeHtml(g.label)}"></div>`).join("")}
    </div>` : ""}

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("piggy", 17)}<div><span class="hero-chip__label">Total aportado</span><span class="hero-chip__value">${fmtBRL(t.invested)}</span></div></div>
      <div class="hero-chip">${svgIcon(t.up ? "trendUp" : "arrowDownRight", 17)}<div><span class="hero-chip__label">${t.up ? "Lucro" : "Prejuízo"}</span><span class="hero-chip__value" data-ui-css="color:${tone}">${fmtBRL(Math.abs(t.profit))}</span></div></div>
      ${t.dividends > 0 ? `<div class="hero-chip">${svgIcon("gift", 17)}<div><span class="hero-chip__label">Proventos</span><span class="hero-chip__value">${fmtBRL(t.dividends)}</span></div></div>` : ""}
      ${t.annualizedPct != null ? `<div class="hero-chip">${svgIcon("bolt", 17)}<div><span class="hero-chip__label">Rentabilidade a.a.</span><span class="hero-chip__value">${fmtNum(t.annualizedPct)}%</span></div></div>` : ""}
      ${t.realPct != null ? `<div class="hero-chip">${svgIcon("shieldCheck", 17)}<div><span class="hero-chip__label">Acima da inflação</span><span class="hero-chip__value">${fmtNum(t.realPct)}%</span></div></div>` : ""}
    </div>

    ${m.contributionThisMonth > 0 ? `<p class="hero-reserved" data-ui-css="margin-top:12px">${svgIcon("checkCircle", 14)} Você aportou ${fmtBRL(m.contributionThisMonth)} este mês</p>` : ""}
  </div>`;
}

// ---- Formulário de cadastro/edição ----
function renderPortfolioForm(f) {
  const type = investmentTypeOf(f.invType);
  const editing = !!f.id;

  return `<div class="card card--elevated span-3" id="portfolio-form" data-ui-css="scroll-margin-top:18px">
    <p class="card-title">${editing ? "Editar aplicação" : "Nova aplicação"}</p>

    <div class="field"><p class="field__label">Tipo de aplicação</p>
      <div class="class-picker">
        ${INVESTMENT_TYPES.map((t) => `<button class="class-chip ${f.invType === t.id ? "active" : ""}" data-ui-css="--tone:${t.color}" data-action="pf-set-type" data-value="${t.id}">
          <span>${escapeHtml(t.label)}</span>
        </button>`).join("")}
      </div>
      <p class="field-hint">${escapeHtml(type.hint)}</p>
    </div>

    <div class="field"><label class="field__label" for="pf-name-input">Nome</label>
      <input id="pf-name-input" class="input" data-field="pf-name" value="${escapeHtml(f.name)}" placeholder="Ex: CDB Banco X 110% CDI" autocomplete="off" maxlength="60" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="pf-value-input">Valor de mercado hoje</label>
        <input id="pf-value-input" class="input" data-field="pf-value" value="${escapeHtml(f.value)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">É este número que entra no seu patrimônio.</p></div>
      <div class="field"><label class="field__label" for="pf-invested-input">Total aportado (custo)</label>
        <input id="pf-invested-input" class="input" data-field="pf-invested" value="${escapeHtml(f.invested)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">Quanto saiu do seu bolso. Sem ele não há como calcular rentabilidade.</p></div>
    </div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="pf-started-input">Aplicado desde</label>
        <input id="pf-started-input" class="input" type="date" data-field="pf-started" value="${escapeHtml(f.startedAt)}" /></div>
      <div class="field"><label class="field__label" for="pf-dividends-input">Proventos já recebidos</label>
        <input id="pf-dividends-input" class="input" data-field="pf-dividends" value="${escapeHtml(f.dividends)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">Dividendos, JCP e aluguéis de FII acumulados.</p></div>
    </div>

    <div class="field"><label class="field__label" for="pf-note-input">Observação (opcional)</label>
      <input id="pf-note-input" class="input" data-field="pf-note" value="${escapeHtml(f.note)}" placeholder="Ex: vence em 2029, corretora Y" autocomplete="off" maxlength="140" /></div>

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="pf-cancel">Cancelar</button>
      <button class="btn btn--primary" data-action="pf-save">${editing ? "Salvar alterações" : "Cadastrar"}</button>
    </div>
  </div>`;
}

// ---- Evolução da carteira ----
function renderPortfolioChartCard(m) {
  const opts = [6, 12, 24];
  const d = m.delta;
  return `<div class="card span-2">
    <div class="wealth-chart__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Evolução da carteira</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Reconstruída com o valor que cada aplicação tinha em cada mês.</p>
      </div>
      <div class="seg-control">
        ${opts.map((o) => `<button class="seg-control__btn ${m.months === o ? "active" : ""}" data-action="pf-months" data-value="${o}">${o}m</button>`).join("")}
      </div>
    </div>
    ${renderWealthChart(m.series, 640, 170)}
    <div class="wealth-axis">${m.series.map((p, i) => `<span class="${p.isCurrent ? "is-current" : ""}">${i % Math.ceil(m.series.length / 6) === 0 || p.isCurrent ? escapeHtml(p.label) : ""}</span>`).join("")}</div>
    ${d.comparable ? `<p class="health-note">${m.months === 1 ? "No último mês" : `Nos últimos ${m.months} meses`} a carteira ${d.up ? "cresceu" : "recuou"} <b data-ui-css="color:${d.up ? "var(--positive)" : "var(--negative)"}">${fmtBRL(Math.abs(d.value))}</b> (${d.up ? "+" : "−"}${fmtNum(Math.abs(d.pct))}%). O gráfico mistura aporte novo e rendimento; para separar os dois, veja a comparação com o CDI abaixo.</p>` : ""}
  </div>`;
}

// ---- Comparação com os índices ----
function renderPortfolioBenchmarkCard(m) {
  const b = m.benchmark;
  const rows = [
    { label: "Sua carteira", value: b.portfolioPct, color: "var(--brand)", strong: true },
    { label: "CDI", value: b.cdiPct, color: "var(--goal)" },
    { label: "Poupança", value: b.poupancaPct, color: "var(--ink-faint)" },
    { label: "Inflação (IPCA)", value: b.ipcaPct, color: "var(--negative)" },
  ];
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);

  return `<div class="card">
    <p class="card-title">Contra os índices</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Mesmo prazo médio da sua carteira: ${fmtNum(b.months)} meses.</p>
    <div class="bench-list">
      ${rows.map((r) => `<div class="bench-row ${r.strong ? "bench-row--strong" : ""}">
        <span class="bench-row__label">${escapeHtml(r.label)}</span>
        <div class="bench-row__track"><div class="bench-row__fill" data-ui-css="width:${Math.max(2, (Math.abs(r.value) / max) * 100).toFixed(1)}%; background:${r.color}"></div></div>
        <b class="bench-row__value" data-ui-css="color:${r.value < 0 ? "var(--negative)" : "var(--ink)"}">${fmtNum(r.value)}%</b>
      </div>`).join("")}
    </div>
    <p class="health-note">${b.beatsCdi
      ? `Sua carteira está <b data-ui-css="color:var(--positive)">${fmtNum(Math.abs(b.diffCdi))} pontos acima do CDI</b> no período.`
      : `Sua carteira está <b data-ui-css="color:var(--negative)">${fmtNum(Math.abs(b.diffCdi))} pontos abaixo do CDI</b> no período. Em renda variável isso é normal no curto prazo; se persistir por anos, o problema costuma ser taxa de administração.`}</p>
  </div>`;
}

// ---- Alocação por tipo ----
function renderPortfolioAllocationCard(m) {
  const segments = m.allocation.map((row) => ({ value: row.value, color: row.type.color }));
  return `<div class="card">
    <p class="card-title">Alocação</p>
    <div class="donut-wrap">${renderDonut(segments, 168, 20)}</div>
    <div class="pf-legend">
      ${m.allocation.map((row) => `<div class="pf-legend__item">
        <span class="cat-dot" data-ui-css="background:${row.type.color}"></span>
        <div class="pf-legend__text">
          <span class="pf-legend__label">${escapeHtml(row.type.label)} · ${row.pct.toFixed(0)}%</span>
          <span class="pf-legend__note">${row.count} ${row.count === 1 ? "aplicação" : "aplicações"}</span>
        </div>
        <b>${fmtBRL(row.value)}</b>
      </div>`).join("")}
    </div>
    <div class="pf-groups-summary">
      ${m.groups.map((g) => `<div class="pf-group-pill" data-ui-css="--tone:${g.color}">
        <span>${escapeHtml(g.label)}</span><b>${g.pct.toFixed(0)}%</b>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Diagnóstico ----
function renderPortfolioInsightsCard(m) {
  const toneColor = { warn: "var(--negative)", ok: "var(--positive)", info: "var(--goal)" };
  return `<div class="card span-3">
    <p class="card-title">O que olhar na sua carteira</p>
    <div class="pf-insights">
      ${m.insights.map((i) => `<div class="pf-insight" data-ui-css="--tone:${toneColor[i.tone] || "var(--goal)"}">
        <span class="pf-insight__icon">${svgIcon(i.icon, 16)}</span>
        <div>
          <b>${escapeHtml(i.title)}</b>
          <span>${escapeHtml(i.text)}</span>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Listas por classe ----
function renderPortfolioGroups(m) {
  if (!m.hasItems) {
    return `<div class="card span-3">
      ${renderEmptyState("trendUp", "Nenhuma aplicação cadastrada ainda.", "Cadastre o que você já tem aplicado. Tesouro, CDB, ações, FIIs, cripto; para acompanhar rentabilidade, alocação e comparação com o CDI.")}
      <button class="btn btn--primary btn--block btn--sm" data-action="pf-new">Cadastrar a primeira aplicação</button>
    </div>`;
  }
  return m.groups.map((g) => `<div class="card span-3">
    <div class="wealth-group__head">
      <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${g.color} 14%, transparent); color:${g.color}">${svgIcon("trendUp", 17)}</span>
      <div class="wealth-group__title">
        <b>${escapeHtml(g.label)}</b>
        <span>${g.count} ${g.count === 1 ? "aplicação" : "aplicações"} · ${g.pct.toFixed(0)}% da carteira</span>
      </div>
      <b class="wealth-group__total">${fmtBRL(g.value)}</b>
    </div>
    <div class="pf-list">
      ${g.items.map((it) => renderPortfolioRow(it)).join("")}
    </div>
  </div>`).join("");
}

function renderPortfolioRow(it) {
  const open = state.portfolio.expandedId === it.id;
  const updating = state.portfolio.updatingId === it.id;
  const dividing = state.portfolio.dividendId === it.id;
  const tone = it.up ? "var(--positive)" : "var(--negative)";

  return `<div class="pf-item ${open ? "is-open" : ""}">
    <button class="pf-item__head" data-action="pf-toggle" data-id="${it.id}" aria-expanded="${open ? "true" : "false"}">
      <span class="cat-dot" data-ui-css="background:${it.type.color}"></span>
      <span class="pf-item__name">
        <b>${escapeHtml(it.name)}</b>
        <span>${escapeHtml(it.type.label)} · ${it.share.toFixed(0)}% da carteira</span>
      </span>
      <span class="pf-item__figures">
        <b>${fmtBRL(it.value)}</b>
        ${it.returnPct != null ? `<span data-ui-css="color:${tone}">${it.up ? "+" : "−"}${fmtNum(Math.abs(it.returnPct))}%</span>` : `<span class="pf-item__nodata">sem custo</span>`}
      </span>
      ${svgIcon(open ? "chevronDown" : "chevronRight", 15, "pf-item__chevron")}
    </button>

    ${!open ? "" : `<div class="pf-item__body">
      <div class="health-grid">
        <div class="health-stat"><span>Total aportado</span><b>${it.hasCost ? fmtBRL(it.invested) : "Sem dados"}</b></div>
        <div class="health-stat"><span>${it.up ? "Lucro" : "Prejuízo"}</span><b data-ui-css="color:${tone}">${it.hasCost ? fmtBRL(Math.abs(it.profit)) : "Sem dados"}</b></div>
        <div class="health-stat"><span>Proventos</span><b>${fmtBRL(it.dividends)}</b></div>
        <div class="health-stat"><span>Rentabilidade a.a.</span><b>${it.annualizedPct != null ? `${fmtNum(it.annualizedPct)}%` : "Sem dados"}</b></div>
        <div class="health-stat"><span>Acima da inflação</span><b>${it.realPct != null ? `${fmtNum(it.realPct)}%` : "Sem dados"}</b></div>
        <div class="health-stat"><span>No mês</span><b data-ui-css="color:${it.monthDelta.comparable ? (it.monthDelta.pct >= 0 ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)"}">${it.monthDelta.comparable ? `${it.monthDelta.pct >= 0 ? "+" : "−"}${fmtNum(Math.abs(it.monthDelta.pct))}%` : "Sem dados"}</b></div>
      </div>
      ${it.annualizedPct == null && it.hasCost ? `<p class="field-hint">Menos de 3 meses de aplicação: o app mostra o retorno acumulado (${fmtNum(it.returnPct)}%) e não anualiza; anualizar prazo curto produz número enganoso.</p>` : ""}
      ${it.note ? `<p class="field-hint">${escapeHtml(it.note)}</p>` : ""}

      <div class="pf-item__actions">
        <button class="btn btn--ghost btn--sm" data-action="pf-update-open" data-id="${it.id}">${svgIcon("refresh", 14)} Atualizar valor</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-dividend-open" data-id="${it.id}">${svgIcon("gift", 14)} Provento</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-edit" data-id="${it.id}">${svgIcon("pencil", 14)} Editar</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-delete" data-id="${it.id}">${svgIcon("trash", 14)} Excluir</button>
      </div>

      ${updating ? `<div class="asset-row__update">
        <div class="field" data-ui-css="margin:0">
          <label class="field__label" for="pf-update-input">Valor de mercado em ${escapeHtml(MONTH_NAMES[new Date().getMonth()])}</label>
          <input id="pf-update-input" class="input" data-field="pf-update" value="${escapeHtml(state.portfolio.updateValue)}" inputmode="decimal" placeholder="0,00" />
        </div>
        <p class="field-hint">O valor anterior não é apagado: ele vira um ponto no histórico e é o que desenha a curva de evolução.</p>
        <div class="form-actions">
          <button class="btn btn--ghost btn--sm" data-action="pf-update-cancel">Cancelar</button>
          <button class="btn btn--primary btn--sm" data-action="pf-update-save" data-id="${it.id}">Atualizar</button>
        </div>
      </div>` : ""}

      ${dividing ? `<div class="asset-row__update">
        <div class="field" data-ui-css="margin:0">
          <label class="field__label" for="pf-dividend-input">Provento recebido agora</label>
          <input id="pf-dividend-input" class="input" data-field="pf-dividend" value="${escapeHtml(state.portfolio.dividendValue)}" inputmode="decimal" placeholder="0,00" />
        </div>
        <p class="field-hint">Soma ao total de proventos desta aplicação e entra na rentabilidade. Não altera o patrimônio; se o dinheiro caiu na sua conta, lance-o como receita normalmente.</p>
        <div class="form-actions">
          <button class="btn btn--ghost btn--sm" data-action="pf-dividend-cancel">Cancelar</button>
          <button class="btn btn--primary btn--sm" data-action="pf-dividend-save" data-id="${it.id}">Registrar</button>
        </div>
      </div>` : ""}

    </div>`}
  </div>`;
}

// source: js/screens/simulate.js
// js/screens/simulate.js. Simulador de decisão pontual (impacto de uma compra no mês).
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// SIMULADOR "E SE...?"
// ==================================================================
function renderSimulateScreen() {
  const sim = state.simulate;
  const isFinance = sim.mode === "financiado";
  const amt = parseMoneyInput(sim.amount);
  const result = !isFinance && amt > 0 ? simulateExpenseImpact(state.data, amt, sim.goalId || null) : null;

  const fin = sim.finance;
  const financeReady = ["valorBem", "numParcelas", "valorParcela"].every((k) => moneyOrZero(fin[k]) > 0);
  const financeResult = isFinance && financeReady ? simulateFinancingImpact(state.data, {
    valorBem: moneyOrZero(fin.valorBem),
    entrada: moneyOrZero(fin.entrada),
    numParcelas: moneyOrZero(fin.numParcelas),
    valorParcela: moneyOrZero(fin.valorParcela),
  }, sim.goalId || null) : null;

  return `<div class="screen screen--narrow">
    ${renderBackHeader("Simular gasto")}
    <div class="segmented">
      <button class="segmented__option ${!isFinance ? "active" : ""}" data-action="set-sim-mode" data-value="vista">À Vista</button>
      <button class="segmented__option ${isFinance ? "active" : ""}" data-action="set-sim-mode" data-value="financiado">Financiado</button>
    </div>

    ${!isFinance ? `
    <div class="card" data-ui-css="margin-top:12px">
      <p class="card-subtitle" data-ui-css="margin-top:0">Veja o impacto de uma compra antes de fazer, sem lançar nada de verdade.</p>
      ${renderSimLabelField()}
      <div class="amount-input-wrap">
        <p class="field__label center">Quanto você pensa em gastar?</p>
        <div class="amount-row">
          <span class="amount-currency">R$</span>
          <input id="sim-amount-input" data-field="sim-amount" class="amount-field" value="${escapeHtml(sim.amount)}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
        </div>
      </div>
      ${renderSimGoalSelect()}
    </div>
    ${result ? renderSimulateResult(result, amt) : ""}
    ` : `
    <div class="card" data-ui-css="margin-top:12px">
      <p class="card-subtitle" data-ui-css="margin-top:0">Compare o custo real de financiar contra o valor à vista do bem.</p>
      ${renderSimLabelField()}
      <div class="field-row">
        <div class="field"><label class="field__label" for="fin-bem-input">Valor do bem</label>
          <input id="fin-bem-input" class="input" data-field="sim-finance-valorbem" value="${escapeHtml(fin.valorBem)}" inputmode="decimal" placeholder="0,00" /></div>
        <div class="field"><label class="field__label" for="fin-entrada-input">Valor da entrada</label>
          <input id="fin-entrada-input" class="input" data-field="sim-finance-entrada" value="${escapeHtml(fin.entrada)}" inputmode="decimal" placeholder="0,00" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field__label" for="fin-parcelas-input">Número de parcelas</label>
          <input id="fin-parcelas-input" type="number" min="1" max="120" class="input" data-field="sim-finance-numparcelas" value="${escapeHtml(fin.numParcelas)}" placeholder="12" /></div>
        <div class="field"><label class="field__label" for="fin-valorparcela-input">Valor de cada parcela</label>
          <input id="fin-valorparcela-input" class="input" data-field="sim-finance-valorparcela" value="${escapeHtml(fin.valorParcela)}" inputmode="decimal" placeholder="0,00" /></div>
      </div>
      ${renderSimGoalSelect()}
    </div>
    ${financeResult ? renderFinanceResult(financeResult) : ""}
    `}
  </div>`;
}

// [M31] O nome do produto não entra em conta nenhuma. Ele existe para a
// resposta falar da COISA que a pessoa está pensando em comprar, e não de "um
// gasto de R$ 4.000,00". Some do texto quando fica em branco.
function renderSimLabelField() {
  return `<div class="field">
    <label class="field__label" for="sim-label-input">O que você quer comprar? (opcional)</label>
    <input id="sim-label-input" class="input" data-field="sim-label" value="${escapeHtml(state.simulate.label)}" maxlength="60" placeholder="Notebook, geladeira, viagem..." autocomplete="off" />
  </div>`;
}

function simLabel() {
  const t = String(state.simulate.label || "").trim();
  return t ? escapeHtml(t) : "";
}

// As três leituras que o M31 acrescentou, compartilhadas pelos dois modos:
// sobra mensal antes e depois, comprometimento da renda antes e depois, e o que
// acontece com a reserva. A conclusão é EDUCATIVA: o app diz o que muda e o que
// isso costuma significar, e não se a pessoa deve ou não comprar.
function renderPurchaseReadings(r, opts) {
  const o = opts || {};
  const sobraCor = r.monthlyAfter < 0 ? "var(--negative)" : (r.monthlyAfter < r.monthlyBefore * 0.4 ? "var(--goal)" : "var(--positive)");
  const temComprometimento = r.commitmentBefore != null && r.commitmentAfter != null;
  const compCor = temComprometimento && r.commitmentAfter > 30 ? "var(--negative)" : (temComprometimento && r.commitmentAfter > 20 ? "var(--goal)" : "var(--positive)");
  const res = r.reserveImpact || {};

  return `<div class="purchase-readings">
    <div class="health-grid">
      <div class="health-stat"><span>Sobra mensal hoje</span><b>${fmtBRL(r.monthlyBefore)}</b></div>
      <div class="health-stat"><span>Sobra mensal depois</span><b data-ui-css="color:${sobraCor}">${fmtBRL(r.monthlyAfter)}</b></div>
    </div>

    ${temComprometimento ? `<p class="health-note">
      A parte da renda presa em parcelas passa de <b>${r.commitmentBefore.toFixed(0)}%</b> para
      <b data-ui-css="color:${compCor}">${r.commitmentAfter.toFixed(0)}%</b>.
      ${r.commitmentNow > 0 ? `Hoje são ${fmtBRL(r.commitmentNow)} por mês em dívidas cadastradas.` : "Hoje não há dívida cadastrada com parcela mensal."}
    </p>` : ""}

    <p class="health-note">${res.affected
      ? (res.reason === "caixa"
        ? `Pagar isso agora encostaria na sua reserva de ${fmtBRL(res.reserve)}: o caixa livre não cobre a compra sem tocar nela.`
        : `Com a sobra mensal negativa, a diferença sairia da sua reserva de ${fmtBRL(res.reserve)} todo mês.`)
      : res.reason === "sem-reserva"
        ? "Você ainda não tem reserva de emergência registrada, então não há o que preservar nesta conta."
        : `Sua reserva de ${fmtBRL(res.reserve)} <b>não seria afetada</b> por esta compra.`}</p>

    ${o.nota ? `<p class="field-hint">${o.nota}</p>` : ""}
  </div>`;
}

function renderSimGoalSelect() {
  const sim = state.simulate;
  if (state.data.goals.length === 0) return "";
  return `<div class="field">
    <p class="field__label">Ver efeito em uma meta (opcional)</p>
    <select class="input" id="sim-goal-select" data-action-select="sim-goal">
      <option value="">Nenhuma meta específica</option>
      ${state.data.goals.map((g) => `<option value="${g.id}" ${sim.goalId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}
    </select>
  </div>`;
}

function renderSimulateResult(r, amt) {
  const dropColor = r.willExceedIncome ? "var(--negative)" : (r.dailyDrop > r.dailyBefore * 0.3 ? "var(--goal)" : "var(--positive)");
  return `<div class="card card--elevated" data-ui-css="margin-top:14px">
    <p class="card-title">${simLabel() ? `${simLabel()} por ${fmtBRL(amt)}` : `Se você gastar ${fmtBRL(amt)} agora`}</p>
    ${renderPurchaseReadings(r, { nota: "Leitura educativa, calculada com os seus números. A decisão continua sua: o app não diz se vale a pena." })}
    <div class="health-grid">
      <div class="health-stat"><span>Orçamento diário hoje</span><b>${fmtBRL(r.dailyBefore)}</b></div>
      <div class="health-stat"><span>Orçamento diário depois</span><b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b></div>
    </div>
    <p class="health-note">${r.willExceedIncome
      ? `Esse gasto <b data-ui-css="color:var(--negative)">ultrapassa sua renda</b> disponível este mês.`
      : `Seu limite diário para os próximos ${r.daysLeft} dias cai de <b>${fmtBRL(r.dailyBefore)}</b> para <b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b>.`}</p>
    ${r.goalDelay && r.goalDelay.stalls ? `<p class="health-note">Esse gasto consome praticamente toda a sua capacidade de poupança do mês; a meta <b>${escapeHtml(r.goalDelay.goalName)}</b> ficaria <b data-ui-css="color:var(--negative)">parada</b> enquanto isso.</p>`
      : r.goalDelay && r.goalDelay.extraDays != null ? `<p class="health-note">Isso pode atrasar sua meta <b>${escapeHtml(r.goalDelay.goalName)}</b> em aproximadamente <b data-ui-css="color:var(--goal)">${r.goalDelay.extraDays} dias</b>.</p>` : ""}
  </div>`;
}

function renderFinanceResult(r) {
  const dropColor = r.willExceedIncome ? "var(--negative)" : (r.dailyDrop > r.dailyBefore * 0.3 ? "var(--goal)" : "var(--positive)");
  const interestColor = r.interestCost > 0 ? "var(--negative)" : "var(--positive)";
  const commitColor = r.commitmentWarning ? "var(--negative)" : "var(--positive)";
  return `<div class="card card--elevated" data-ui-css="margin-top:14px">
    <p class="card-title">${simLabel() ? `${simLabel()}: custo real do financiamento` : "Custo real do financiamento"}</p>
    <div class="health-grid">
      <div class="health-stat"><span>Valor do bem</span><b>${fmtBRL(r.valorBem)}</b></div>
      <div class="health-stat"><span>Total pago ao final</span><b>${fmtBRL(r.totalPaid)}</b></div>
      <div class="health-stat"><span>Juros/taxas</span><b data-ui-css="color:${interestColor}">${r.interestCost >= 0 ? "+" : ""}${fmtBRL(r.interestCost)}${r.valorBem > 0 ? ` (${r.interestPct.toFixed(1)}%)` : ""}</b></div>
      <div class="health-stat"><span>${r.numParcelas}x de</span><b>${fmtBRL(r.valorParcela)}</b></div>
    </div>

    ${r.commitmentPct != null ? `
    <p class="card-title" data-ui-css="margin-top:16px">Comprometimento da renda</p>
    <div class="progress"><div class="progress__fill" data-ui-css="width:${clamp(r.commitmentPct, 0, 100)}%; background:${commitColor}"></div></div>
    <p class="health-note">A parcela consome <b data-ui-css="color:${commitColor}">${r.commitmentPct.toFixed(1)}%</b> da sua renda fixa cadastrada.
      ${r.commitmentWarning ? `<b data-ui-css="color:var(--negative)"> Isso passa da faixa de atenção de 20% usada nesta análise. Compare também com sua sobra real e outras parcelas.</b>` : ""}</p>
    ` : `<p class="health-note" data-ui-css="margin-top:16px">Defina sua renda mensal fixa em Ajustes para eu calcular quanto essa parcela compromete do seu orçamento.</p>`}

    <p class="card-title" data-ui-css="margin-top:16px">O que muda no seu mês</p>
    ${renderPurchaseReadings(r, { nota: "Leitura educativa, calculada com os seus números. Parcelar não é errado nem certo por si: o que muda é quanto da sua renda deixa de estar disponível enquanto durar." })}

    <p class="card-title" data-ui-css="margin-top:16px">Impacto no saldo livre diário</p>
    <div class="health-grid">
      <div class="health-stat"><span>Orçamento diário hoje</span><b>${fmtBRL(r.dailyBefore)}</b></div>
      <div class="health-stat"><span>Com a parcela ativa</span><b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b></div>
    </div>
    <p class="health-note">${r.willExceedIncome
      ? `Com essa parcela, você <b data-ui-css="color:var(--negative)">ultrapassa sua renda</b> disponível nos meses em que ela estiver ativa.`
      : `Enquanto a parcela estiver ativa, seu orçamento diário cai de <b>${fmtBRL(r.dailyBefore)}</b> para <b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b>.`}</p>
    ${r.goalDelay && r.goalDelay.stalls ? `<p class="health-note">Essa parcela consome praticamente toda a sua capacidade de poupança do mês; a meta <b>${escapeHtml(r.goalDelay.goalName)}</b> ficaria <b data-ui-css="color:var(--negative)">parada</b> enquanto isso.</p>`
      : r.goalDelay && r.goalDelay.extraDays != null ? `<p class="health-note">Isso pode atrasar sua meta <b>${escapeHtml(r.goalDelay.goalName)}</b> em aproximadamente <b data-ui-css="color:var(--goal)">${r.goalDelay.extraDays} dias</b>.</p>` : ""}
  </div>`;
}

// source: js/screens/notifications.js
// js/screens/notifications.js. Central de notificações. Modelo em services.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// [M8] CENTRAL DE NOTIFICAÇÕES
// ==================================================================
// A tela não decide nada: `NotificationService` monta o modelo (agrupado por
// período, com contagens e estado de leitura) e aqui só se desenha. A escrita
// volta pelas mesmas funções puras; a UI nunca mexe no array de avisos à mão.
const NOTIF_TONE_CLASS = { danger: "notif-item--danger", warn: "notif-item--warn", positive: "notif-item--positive", info: "" };

function renderNotificationsScreen() {
  const m = notificationsModel();
  const c = m.counts;

  return `<div class="screen screen--narrow">
    ${renderBackHeader("Notificações")}

    <div class="card card--hero">
      <div class="hero-glow"></div>
      <p class="hero-label">${c.unread > 0 ? `${c.unread} ${c.unread === 1 ? "aviso não lido" : "avisos não lidos"}` : "Tudo em dia"}</p>
      <p class="hero-value">${c.total}</p>
      <p class="hero-reserved">${svgIcon("bell", 14)} ${c.total === 1 ? "aviso no histórico" : "avisos no histórico"}${c.urgent > 0 ? ` · ${c.urgent} ${c.urgent === 1 ? "urgente" : "urgentes"}` : ""}</p>
      <div class="hero-tools">
        ${c.unread > 0 ? `<button class="hero-tool-btn" data-action="notif-read-all">${svgIcon("checkCircle", 15)}Marcar todas como lidas</button>` : ""}
        <button class="hero-tool-btn" data-action="notif-settings">${svgIcon("gear", 15)}Silenciar grupos</button>
        ${c.total > c.unread ? `<button class="hero-tool-btn" data-action="notif-clear">${svgIcon("trash", 15)}Limpar as lidas</button>` : ""}
      </div>
    </div>

    ${state.notif.settingsOpen ? renderNotifSettingsCard(m) : ""}

    <div class="segmented segmented--scroll">
      <button class="segmented__option ${state.notif.filter === "all" ? "active" : ""}" data-action="notif-filter" data-value="all">Todas${c.total > 0 ? ` (${c.total})` : ""}</button>
      <button class="segmented__option ${state.notif.filter === "unread" ? "active" : ""}" data-action="notif-filter" data-value="unread">Não lidas${c.unread > 0 ? ` (${c.unread})` : ""}</button>
      ${m.groups.filter((g) => g.count > 0).map((g) => `
        <button class="segmented__option ${state.notif.filter === g.id ? "active" : ""}" data-action="notif-filter" data-value="${g.id}">${escapeHtml(g.label)} (${g.count})</button>`).join("")}
    </div>

    ${m.buckets.length === 0
      ? renderEmptyState("bell", notifEmptyTitle(m), notifEmptyHint(m))
      : m.buckets.map((b) => `<div class="card">
          <p class="card-title">${b.label}</p>
          <div class="notif-list">${b.items.map(renderNotifItem).join("")}</div>
        </div>`).join("")}

    <p class="footnote">Os avisos são gerados no seu aparelho a partir do histórico já salvo; nenhum dado é enviado a servidor algum e nenhuma permissão de notificação do sistema é solicitada. Silenciar um grupo interrompe novos avisos daquele tipo, sem apagar nada do histórico.</p>
  </div>`;
}

function notifEmptyTitle(m) {
  if (!m.hasAny) return "Nenhum aviso ainda.";
  if (state.notif.filter === "unread") return "Você está em dia.";
  return "Nada neste filtro.";
}

function notifEmptyHint(m) {
  if (!m.hasAny) return "Contas a vencer, orçamento estourado, reajuste de assinatura, meta atrasada e saldo projetado negativo aparecem aqui assim que acontecerem.";
  if (state.notif.filter === "unread") return "Todos os avisos foram lidos. Os novos aparecem aqui automaticamente.";
  return "Troque o filtro para ver os outros avisos do histórico.";
}

function renderNotifItem(n) {
  return `<div class="notif-item ${NOTIF_TONE_CLASS[n.tone] || ""} ${n.readAt ? "is-read" : ""}">
    <span class="notif-item__icon">${svgIcon(n.icon, 16)}</span>
    <div class="notif-item__body">
      <p class="notif-item__title">${n.readAt ? "" : `<i class="notif-dot" aria-label="Não lida"></i>`}${escapeHtml(n.title)}</p>
      <p class="notif-item__msg">${escapeHtml(n.message)}</p>
      <p class="notif-item__meta">${escapeHtml(n.groupLabel)} · ${n.dateLabel}</p>
    </div>
    <div class="notif-item__actions">
      <button class="btn btn--secondary btn--sm" data-action="notif-open" data-id="${n.id}" data-tab="${n.tab}">Ver</button>
      ${n.readAt ? "" : `<button class="icon-btn icon-btn--muted" data-action="notif-read" data-id="${n.id}" aria-label="Marcar como lida">${svgIcon("check", 15)}</button>`}
      <button class="icon-btn icon-btn--muted" data-action="notif-remove" data-id="${n.id}" aria-label="Remover aviso">${svgIcon("x", 15)}</button>
    </div>
  </div>`;
}

function renderNotifSettingsCard(m) {
  return `<div class="card">
    <p class="card-title">O que pode me avisar</p>
    <p class="card-subtitle">Silenciar um grupo interrompe apenas a criação de novos avisos daquele tipo. Os lançamentos, os totais e as outras telas continuam exatamente iguais.</p>
    <div class="tool-links">
      ${m.groups.map((g) => `
        <button class="tool-link" data-action="notif-mute" data-id="${g.id}">
          ${svgIcon(g.icon, 17)}<span>${escapeHtml(g.label)}</span>
          <span class="switch ${g.muted ? "" : "active"}"><span class="switch__knob"></span></span>
        </button>`).join("")}
    </div>
  </div>`;
}

// source: js/screens/all.js
// js/screens/all.js. "Recursos": o índice do app.
// ------------------------------------------------------------------------------
// A lista de ferramentas morava dentro de um cartão de Ajustes, e isso tinha
// duas consequências: quem procurava a Central de Dívidas precisava adivinhar
// que ela estava em "Ajustes", e a tela de Ajustes ficou com quinze destinos
// espremidos entre campos de configuração.
//
// Aqui os mesmos destinos ganham tela própria, agrupada por intenção e com
// busca. A busca não é enfeite: com vinte e dois recursos, rolar procurando um
// nome é mais lento do que digitar três letras.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// `keywords` existe porque o usuário procura pelo problema, não pelo nome do
// recurso: quem digita "fatura" quer Contas e cartões, quem digita "juros" quer
// os simuladores. Sem isso a busca só encontraria o que a pessoa já sabia achar.
const ALL_SECTIONS = [
  {
    title: "Dia a dia",
    subtitle: "O que você abre com mais frequência.",
    items: [
      { tab: "add", icon: "plus", label: "Novo lançamento", desc: "Registrar um gasto ou uma receita.", keywords: "adicionar gasto receita despesa lancar" },
      { tab: "import", icon: "upload", label: "Importar extrato", desc: "Ler um arquivo OFX ou CSV do seu banco.", keywords: "ofx csv extrato banco importar arquivo" },
      { action: "open-qr", icon: "scan", label: "Ler QR Code", desc: "Pix ou nota fiscal, direto pela câmera.", keywords: "qr pix nota fiscal camera codigo" },
      { tab: "calendar", icon: "calendar", label: "Calendário e previsão", desc: "O que vence, quando, e para onde o saldo caminha.", keywords: "calendario previsao vencimento agenda planejamento anual" },
      { tab: "subscriptions", icon: "refresh", label: "Assinaturas e recorrências", desc: "Cobranças que se repetem todo mês.", keywords: "assinatura recorrente mensalidade streaming" },
      { tab: "notifications", icon: "bell", label: "Central de notificações", desc: "Histórico de avisos do app.", keywords: "avisos alertas notificacao sino" },
    ],
  },
  {
    title: "Contas e dívidas",
    subtitle: "Onde o dinheiro está e o que ele deve.",
    items: [
      { tab: "accounts", icon: "wallet", label: "Contas, cartões e faturas", desc: "Saldos, limites, transferências e conciliação.", keywords: "conta cartao fatura banco saldo transferencia conciliacao limite" },
      { tab: "debts", icon: "alertTriangle", label: "Central de dívidas", desc: "Plano de quitação por bola de neve ou avalanche.", keywords: "divida emprestimo financiamento quitar bola de neve avalanche juros" },
      { tab: "wealth", icon: "layout", label: "Patrimônio", desc: "Bens, dívidas e a evolução do seu líquido.", keywords: "patrimonio bens ativos passivos liquido imovel carro" },
    ],
  },
  {
    title: "Planejar e simular",
    subtitle: "Decidir antes de gastar.",
    items: [
      { tab: "goals", icon: "target", label: "Metas", desc: "Objetivos, aportes e prazo.", keywords: "meta objetivo reserva emergencia guardar sonho" },
      { tab: "invest", icon: "trendUp", label: "Carteira de investimentos", desc: "Aplicações, rentabilidade e proventos.", keywords: "investir carteira acoes cdb tesouro rendimento dividendo" },
      { tab: "simulators", icon: "bolt", label: "Simuladores", desc: "Renda fixa, financiamento, cartão, FGTS e mais.", keywords: "simulador juros financiamento fgts parcelamento cdb selic" },
      { tab: "simulate", icon: "sparkles", label: "Simulador “E se…?”", desc: "O impacto de um gasto antes de fazê-lo.", keywords: "e se simular gasto impacto comparar cenario" },
    ],
  },
  {
    title: "Entender os números",
    subtitle: "O que os lançamentos estão dizendo.",
    items: [
      { tab: "analytics", icon: "pie", label: "Análises e histórico", desc: "Períodos, categorias e busca no histórico.", keywords: "analise historico grafico relatorio periodo buscar filtro" },
      { tab: "insights", icon: "sparkles", label: "Central inteligente", desc: "Recomendações, padrões e comparação entre meses.", keywords: "insight recomendacao ia padrao comparar inteligente" },
      { tab: "health", icon: "shieldCheck", label: "Saúde financeira", desc: "Diagnóstico completo com os indicadores explicados.", keywords: "saude diagnostico score indicador nota" },
      { tab: "achievements", icon: "star", label: "Conquistas e nível", desc: "As medalhas que o seu histórico já desbloqueou.", keywords: "conquista medalha nivel gamificacao progresso" },
    ],
  },
  {
    title: "Ajustar o app",
    subtitle: "Como ele calcula e como ele se comporta.",
    items: [
      { tab: "account", icon: "shieldCheck", label: "Conta e acesso", desc: "Cadastro, recuperação de senha e dispositivos conectados.", keywords: "conta login senha recuperar acesso dispositivo sessao" },
      { tab: "categories", icon: "layout", label: "Categorias e tetos", desc: "Hierarquia, grupos da Regra x/x/x e limites por categoria.", keywords: "categoria subcategoria teto limite orcamento grupo necessidade desejo futuro organizar" },
      { tab: "rules", icon: "tag", label: "Regras de categorização", desc: "Ensine o app a classificar sozinho o que vem do banco.", keywords: "regra categorizar importar automatico palavra chave" },
      { tab: "settings", icon: "gear", label: "Ajustes", desc: "Perfil, renda, reserva, alertas, tema e backup.", keywords: "ajustes configuracao perfil renda backup tema reserva alerta premissa" },
      { tab: "privacy", icon: "shieldCheck", label: "Privacidade, termos e fontes", desc: "Controle de dados, IA, exclusão e diagnóstico local.", keywords: "privacidade lgpd termos dados excluir apagar ia diagnostico fontes" },
    ],
  },
];

function allScreenMatches(item, query) {
  if (!query) return true;
  const haystack = normalizeText(`${item.label} ${item.desc} ${item.keywords || ""}`);
  // Todos os termos precisam casar. Buscar "conta cartao" deve estreitar o
  // resultado, não ampliá-lo; o contrário transformaria a busca em ruído.
  return normalizeText(query).split(" ").filter(Boolean).every((term) => haystack.indexOf(term) !== -1);
}

function renderAllScreen() {
  const query = state.allSearch || "";
  const sections = ALL_SECTIONS
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => allScreenMatches(it, query)) }))
    .filter((sec) => sec.items.length > 0);
  const total = sections.reduce((n, sec) => n + sec.items.length, 0);

  return `<div class="screen screen--narrow">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <h1 class="page-title">Recursos</h1>
      </div>
    </div>

    <div class="card">
      <div class="all-search">
        ${svgIcon("search", 17, "all-search__icon")}
        <input id="all-search-input" class="input" data-field="all-search" value="${escapeHtml(query)}"
          placeholder="Buscar recurso (ex: fatura, juros, meta)" autocomplete="off" />
        ${query ? `<button class="icon-btn icon-btn--muted" data-action="all-search-clear" aria-label="Limpar busca">${svgIcon("x", 15)}</button>` : ""}
      </div>
      ${query ? `<p class="field-hint" data-ui-css="margin-top:8px">${plural(total, "resultado", "resultados")} para “${escapeHtml(query)}”.</p>` : ""}
    </div>

    ${total === 0 ? `<div class="card">
      ${renderEmptyState("search", "Nada encontrado.", "Tente uma palavra mais curta, como “cartão”, “meta” ou “juros”.")}
    </div>` : sections.map((sec) => `<div class="card">
      <p class="card-title">${escapeHtml(sec.title)}</p>
      <p class="card-subtitle" data-ui-css="margin-top:0">${escapeHtml(sec.subtitle)}</p>
      <div class="tool-links">
        ${sec.items.map((it) => `<button class="tool-link tool-link--rich" ${it.tab ? `data-action="nav" data-tab="${it.tab}"` : `data-action="${it.action}"`}>
          <span class="tool-link__icon">${svgIcon(it.icon, 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">${escapeHtml(it.label)}</span>
            <span class="tool-link__desc">${escapeHtml(it.desc)}</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>`).join("")}
      </div>
    </div>`).join("")}

    <p class="footnote">Recursos marcados como IA precisam de conexão e enviam somente os dados descritos antes da confirmação. Todo o resto funciona sem internet.</p>
  </div>`;
}

// source: js/screens/rules.js
// js/screens/rules.js. Regras de categorização: as do usuário e as de fábrica.
// ------------------------------------------------------------------------------
// O motor está em `js/rules.js` e não sabe que esta tela existe. Aqui só há HTML.
//
// A ordem dos cartões segue o caminho de quem chega com um problema concreto
// ("o app insiste em jogar meu posto de gasolina em Outros"): primeiro o
// laboratório onde ele cola a descrição e vê o que acontece, depois as regras
// dele, depois o botão que conserta o histórico, e só no fim as regras de
// fábrica; que a maioria nunca vai precisar abrir.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function rulesCategoryOptions(selectedId) {
  return topLevelCategories(state.data).map((c) => {
    const subs = childCategories(state.data, c.id);
    const own = `<option value="${c.id}" ${selectedId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
    const kids = subs.map((sub) => `<option value="${sub.id}" ${selectedId === sub.id ? "selected" : ""}>${escapeHtml(c.name)} › ${escapeHtml(sub.name)}</option>`).join("");
    return own + kids;
  }).join("");
}

function renderRulesScreen() {
  const cfg = normalizeCategoryRules(state.data.categoryRules);
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Regras de categorização")}

    <div class="card">
      <p class="card-subtitle" data-ui-css="margin-top:0">Quando um lançamento chega de um extrato, de um QR Code ou do campo de texto livre, o app tenta adivinhar a categoria pela descrição. Aqui você ensina o que ele ainda não sabe. Tudo é calculado no seu aparelho.</p>
      <p class="field-hint">Em caso de empate, vence a regra de maior peso; entre pesos iguais, a sua regra ganha da regra de fábrica.</p>
    </div>

    ${renderRuleTesterCard()}
    ${renderCustomRulesCard(cfg)}
    ${renderRuleApplyCard()}
    ${renderBuiltinRulesCard(cfg)}
  </div>`;
}

// ---- Laboratório: cole uma descrição, veja quem ganha ----
// Existe porque regra de texto é a classe de configuração em que o usuário mais
// erra em silêncio: ele escreve "posto ipiranga", o extrato diz "POSTO IPIRANGA
// LTDA 04", e sem um lugar para testar ele só descobre no mês seguinte.
function renderRuleTesterCard() {
  const text = state.rules.testText || "";
  const compiled = compileCategoryRules(state.data);
  const best = text ? matchCategoryRules(compiled, normalizeText(text)) : null;
  const hits = text ? compiled.filter((r) => { try { return r.re.test(normalizeText(text)); } catch (e) { return false; } }) : [];
  const cat = best ? categoryById(state.data, best.categoryId) : null;

  return `<div class="card">
    <p class="card-title">Testar uma descrição</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Cole aqui um texto igual ao que aparece no seu extrato.</p>
    <input id="rule-test-input" class="input" data-field="rule-test" value="${escapeHtml(text)}"
      placeholder="Ex: PAG*PostoIpiranga 04" autocomplete="off" />

    ${!text ? "" : best ? `<div class="rule-test-result">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
      <div class="rule-test-result__text">
        <p class="rule-test-result__cat">${escapeHtml(cat.name)}</p>
        <p class="rule-test-result__rule">por ${best.source === "custom" ? "sua regra" : "regra de fábrica"} “${escapeHtml(best.label)}” · peso ${best.weight}</p>
      </div>
    </div>
    ${hits.length > 1 ? `<p class="field-hint">${hits.length} regras casaram com esse texto. As demais perderam no peso: ${hits.filter((r) => r !== best).map((r) => escapeHtml(r.label)).slice(0, 3).join(", ")}.</p>` : ""}` : `<div class="rule-test-result rule-test-result--miss">
      ${svgIcon("info", 16)}
      <div class="rule-test-result__text">
        <p class="rule-test-result__cat">Nenhuma regra casou</p>
        <p class="rule-test-result__rule">Esse lançamento cairia em “Outros”. Crie uma regra abaixo.</p>
      </div>
    </div>`}
  </div>`;
}

// ---- Regras do usuário ----
function renderCustomRulesCard(cfg) {
  const form = state.rules.form;
  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Suas regras</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${cfg.custom.length === 0 ? "Nenhuma regra criada ainda." : `${plural(cfg.custom.length, "regra", "regras")} · ${cfg.custom.filter((r) => r.enabled).length} ${pluralWord(cfg.custom.filter((r) => r.enabled).length, "ativa", "ativas")}`}</p>
      </div>
      ${form ? "" : `<button class="btn btn--primary btn--sm" data-action="rule-new">${svgIcon("plus", 15)} Nova</button>`}
    </div>

    ${form ? renderRuleForm(form) : ""}

    ${cfg.custom.length === 0 && !form
      ? renderEmptyState("tag", "Sem regras suas.", "Crie uma para que o app pare de errar na mesma descrição todo mês.")
      : `<div class="rule-list">${cfg.custom.map((r) => renderRuleRow(r)).join("")}</div>`}
  </div>`;
}

function renderRuleRow(r) {
  const cat = categoryById(state.data, r.categoryId);
  const type = RULE_MATCH_TYPES.find((m) => m.id === r.matchType) || RULE_MATCH_TYPES[0];
  const compiled = compileRulePattern(r.pattern, r.matchType);

  return `<div class="rule-row ${r.enabled ? "" : "rule-row--off"}">
    <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
    <div class="rule-row__text">
      <p class="rule-row__pattern">${escapeHtml(r.pattern)}</p>
      <p class="rule-row__meta">${escapeHtml(type.label)} · ${escapeHtml(cat.name)} · peso ${r.weight}</p>
      ${compiled.ok ? "" : `<p class="rule-row__error">${svgIcon("alertTriangle", 12)} ${escapeHtml(compiled.error)}; a regra está sendo ignorada.</p>`}
    </div>
    <button class="switch ${r.enabled ? "active" : ""}" data-action="rule-toggle" data-id="${r.id}" role="switch" aria-checked="${r.enabled ? "true" : "false"}" aria-label="${r.enabled ? "Desativar" : "Ativar"} regra"><span class="switch__knob"></span></button>
    <button class="icon-btn" data-action="rule-edit" data-id="${r.id}" aria-label="Editar regra">${svgIcon("pencil", 14)}</button>
    <button class="icon-btn" data-action="rule-delete" data-id="${r.id}" aria-label="Excluir regra">${svgIcon("trash", 14)}</button>
  </div>`;
}

function renderRuleForm(form) {
  const compiled = compileRulePattern(form.pattern, form.matchType);
  const typeMeta = RULE_MATCH_TYPES.find((m) => m.id === form.matchType) || RULE_MATCH_TYPES[0];
  const canSave = compiled.ok && !!form.categoryId;

  return `<div class="rule-form">
    <div class="field">
      <label class="field__label" for="rule-pattern-input">Texto que a regra procura</label>
      <input id="rule-pattern-input" class="input" data-field="rule-pattern" value="${escapeHtml(form.pattern)}"
        placeholder="Ex: ipiranga" autocomplete="off" maxlength="120" />
      ${form.pattern && !compiled.ok ? `<p class="rule-row__error">${svgIcon("alertTriangle", 12)} ${escapeHtml(compiled.error)}</p>` : `<p class="field-hint">Acentos e maiúsculas não importam.</p>`}
    </div>

    <div class="field">
      <label class="field__label" for="rule-type-select">Como comparar</label>
      <select class="input" id="rule-type-select" data-action-select="rule-type">
        ${RULE_MATCH_TYPES.map((m) => `<option value="${m.id}" ${form.matchType === m.id ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}
      </select>
      <p class="field-hint">${escapeHtml(typeMeta.hint)}</p>
    </div>

    <div class="field">
      <label class="field__label" for="rule-category-select">Categoria de destino</label>
      <select class="input" id="rule-category-select" data-action-select="rule-category">
        <option value="">Escolha uma categoria</option>
        ${rulesCategoryOptions(form.categoryId)}
      </select>
    </div>

    <div class="field">
      <label class="field__label" for="rule-weight-input">Peso (${RULE_WEIGHT_MIN} a ${RULE_WEIGHT_MAX})</label>
      <input id="rule-weight-input" class="input input--budget" type="number" min="${RULE_WEIGHT_MIN}" max="${RULE_WEIGHT_MAX}" step="1"
        data-field="rule-weight" value="${escapeHtml(String(form.weight))}" inputmode="numeric" />
      <p class="field-hint">Só importa quando duas regras casam com a mesma descrição. O padrão (${RULE_WEIGHT_DEFAULT}) já ganha de todas as de fábrica.</p>
    </div>

    <div class="settings-actions">
      <button class="btn btn--ghost btn--sm" data-action="rule-cancel">Cancelar</button>
      <button class="btn btn--primary btn--sm" data-action="rule-save" ${canSave ? "" : "disabled"}>${svgIcon("check", 15)} ${form.id ? "Salvar regra" : "Criar regra"}</button>
    </div>
  </div>`;
}

// ---- Aplicar ao que já está gravado ----
// Só mexe em despesas que estão em "Outros". Recategorizar o histórico inteiro
// apagaria correções feitas à mão; e a pessoa que corrigiu à mão é exatamente
// a que mais confia no app.
function renderRuleApplyCard() {
  const preview = state.rules.applyPreview;
  return `<div class="card">
    <p class="card-title">Aplicar aos lançamentos antigos</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Passa as regras atuais pelas despesas que estão em “Outros”. Nada que você já categorizou à mão é tocado.</p>

    ${preview ? (preview.count === 0
      ? `<div class="inline-note">${svgIcon("checkCircle", 16)}<span>Nenhum lançamento em “Outros” casou com as regras atuais.</span></div>`
      : `<div class="inline-note">${svgIcon("info", 16)}<span><b>${preview.count}</b> ${pluralWord(preview.count, "lançamento mudaria", "lançamentos mudariam")} de categoria.</span></div>
         <div class="rule-preview-list">
           ${preview.changes.slice(0, 8).map((c) => `<div class="rule-preview-row">
             <span class="rule-preview-row__desc">${escapeHtml(c.description || "(sem descrição)")}</span>
             <span class="rule-preview-row__to">${svgIcon("arrowRight", 13)} ${escapeHtml(categoryById(state.data, c.to).name)}</span>
           </div>`).join("")}
           ${preview.count > 8 ? `<p class="footnote" data-ui-css="text-align:left">e mais ${preview.count - 8}.</p>` : ""}
         </div>`) : ""}

    <div class="settings-actions" data-ui-css="margin-top:12px">
      ${preview
        ? `<button class="btn btn--ghost btn--sm" data-action="rule-apply-cancel">Cancelar</button>
           ${preview.count > 0 ? `<button class="btn btn--primary btn--sm" data-action="rule-apply-confirm">${svgIcon("check", 15)} Recategorizar ${preview.count}</button>` : ""}`
        : `<button class="btn btn--secondary btn--sm" data-action="rule-apply-preview">${svgIcon("refresh", 15)} Ver o que mudaria</button>`}
    </div>
  </div>`;
}

// ---- Regras de fábrica ----
// Não são editáveis, e isso é deliberado: elas evoluem com o app, e uma cópia
// congelada no aparelho de cada usuário deixaria de receber correções. O que o
// usuário controla é se cada uma vale e para onde ela aponta.
function renderBuiltinRulesCard(cfg) {
  const open = state.rules.showBuiltins;
  const changed = Object.keys(cfg.builtin).length;

  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Regras de fábrica</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${BUILTIN_CATEGORY_RULES.length} dicionários prontos${changed > 0 ? ` · ${plural(changed, "alterado", "alterados")} por você` : ""}</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="rules-toggle-builtins">
        ${open ? "Ocultar" : "Ver todas"} ${svgIcon(open ? "chevronUp" : "chevronDown", 14)}
      </button>
    </div>

    ${!open ? "" : `<div class="rule-list">
      ${BUILTIN_CATEGORY_RULES.map((rule) => {
        const o = cfg.builtin[rule.id] || {};
        const enabled = o.enabled !== false;
        const targetId = o.categoryId || rule.categoryId;
        const cat = categoryById(state.data, targetId);
        return `<div class="rule-row rule-row--builtin ${enabled ? "" : "rule-row--off"}">
          <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
          <div class="rule-row__text">
            <p class="rule-row__pattern">${escapeHtml(rule.label)}</p>
            <p class="rule-row__meta">${escapeHtml(rule.sample)}</p>
          </div>
          <button class="switch ${enabled ? "active" : ""}" data-action="rule-builtin-toggle" data-id="${rule.id}" role="switch" aria-checked="${enabled ? "true" : "false"}" aria-label="${enabled ? "Desativar" : "Ativar"} ${escapeHtml(rule.label)}"><span class="switch__knob"></span></button>
          <select class="input rule-row__select" data-action-select="rule-builtin-category" data-id="${rule.id}" ${enabled ? "" : "disabled"}>
            ${rulesCategoryOptions(targetId)}
          </select>
        </div>`;
      }).join("")}
      ${changed > 0 ? `<button class="btn btn--ghost btn--sm btn--block" data-action="rules-builtin-reset" data-ui-css="margin-top:8px">${svgIcon("refresh", 15)} Restaurar ${plural(changed, "regra de fábrica alterada", "regras de fábrica alteradas")}</button>` : ""}
    </div>`}
  </div>`;
}

// source: js/screens/settings.js
// js/screens/settings.js. Ajustes: perfil, regra de orçamento, categorias, tetos e backup.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// Feature 1; edição dos percentuais da Regra x/x/x (Necessidades/Desejos/Futuro) em Ajustes.
function renderBudgetSplitSettingsCard() {
  const bs = state.data.budgetSplit;
  const sum = BUDGET_GROUPS.reduce((s, g) => {
    const draft = state.splitDrafts[g];
    const v = draft !== undefined ? (parseInt(draft, 10) || 0) : bs[g];
    return s + v;
  }, 0);
  return `<div class="card">
    <p class="card-title">Regra de orçamento (x/x/x)</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Defina quanto da sua renda deve ir para cada grupo. Isso alimenta as barras e os alertas automáticos do Dashboard.</p>
    <div class="split-settings-grid">
      ${BUDGET_GROUPS.map((g) => {
        const draft = state.splitDrafts[g];
        const val = draft !== undefined ? draft : String(bs[g]);
        return `<div class="split-settings-field">
          <label class="field__label" for="split-${g}-input">${svgIcon(GROUP_ICONS[g], 13)} ${GROUP_LABELS[g]}</label>
          <div class="income-input-row">
            <input id="split-${g}-input" class="input input--budget" data-field="split-${g}" value="${escapeHtml(val)}" inputmode="numeric" />
            <span class="income-currency">%</span>
          </div>
        </div>`;
      }).join("")}
    </div>
    <p class="footnote" data-ui-css="margin-top:10px; text-align:left">${sum === 100 ? `Soma: ${sum}%; perfeito.` : `Soma atual: ${sum}%. O ideal é somar 100%, mas o app funciona com qualquer combinação.`}</p>
  </div>`;
}

// Configuração da reserva de emergência: qual meta representa a reserva e
// quantos meses de despesa ela deve cobrir. Alimenta o Dashboard e o Score.
function renderEmergencySettingsCard() {
  const goals = state.data.goals || [];
  const r = emergencyFund(state.data);
  return `<div class="card">
    <p class="card-title">Reserva de Emergência</p>
    <p class="card-subtitle">Escolha qual meta representa sua reserva e por quantos meses ela precisa cobrir suas despesas.</p>
    ${goals.length === 0
      ? `<p class="field-hint">Você ainda não tem metas. Crie uma meta chamada “Reserva de emergência” na aba Metas e ela aparecerá aqui.</p>`
      : `<div class="field">
          <label class="field__label" for="emergency-goal-select">Meta usada como reserva</label>
          <select class="input" id="emergency-goal-select" data-action-select="emergency-goal">
            <option value="">Detectar automaticamente pelo nome</option>
            ${goals.map((g) => `<option value="${g.id}" ${state.data.emergencyGoalId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}
          </select>
        </div>`}
    <div class="field" data-ui-css="margin-top:12px">
      <label class="field__label" for="emergency-months-input">Meses de despesa que a reserva deve cobrir</label>
      <input id="emergency-months-input" class="input" data-field="emergency-months" type="number" min="1" max="24" step="1" value="${Number(state.data.emergencyMonths) || 6}" />
    </div>
    <p class="field-hint">Hoje sua despesa média é de ${fmtBRL(r.monthlyNeed)}/mês; o alvo sugerido é ${fmtBRL(mulMoney(r.monthlyNeed, r.targetMonths))}.</p>
  </div>`;
}

// [M5] Premissas de mercado usadas por todos os simuladores.
// O app é offline: não existe cotação em tempo real, e fingir que existe seria
// pior do que não ter. Aqui o usuário revisa os números e o app carimba a data
//; todo simulador mostra de onde veio a taxa que usou.
function renderMarketRatesCard() {
  const r = marketRatesOf(state.data);
  const draft = (key) => (state.ratesDraft[key] != null ? state.ratesDraft[key] : String(r[key]).replace(".", ","));
  const rows = [
    { key: "selic", label: "Selic", hint: "Taxa básica de juros ao ano." },
    { key: "cdi", label: "CDI", hint: "Referência da renda fixa. Costuma ficar levemente abaixo da Selic." },
    { key: "ipca", label: "IPCA", hint: "Inflação anual esperada. É o que separa ganho nominal de ganho real." },
    { key: "tr", label: "TR", hint: "Entra na poupança e no rendimento do FGTS." },
  ];

  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Premissas de mercado</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Valores editáveis usados pelos simuladores e pela comparação da carteira.</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="rates-reset">Restaurar</button>
    </div>
    <div class="rates-grid">
      ${rows.map((row) => `<div class="field" data-ui-css="margin:0">
        <label class="field__label" for="rate-${row.key}-input">${escapeHtml(row.label)}</label>
        <div class="sim-input">
          <input id="rate-${row.key}-input" class="input" data-field="market-rate" data-id="${row.key}"
            value="${escapeHtml(draft(row.key))}" inputmode="decimal" autocomplete="off" />
          <span class="sim-input__affix">% a.a.</span>
        </div>
        <p class="field-hint">${escapeHtml(row.hint)}</p>
      </div>`).join("")}
    </div>
    <div class="rates-derived">
      <span>Poupança (derivada da Selic pela regra oficial)</span>
      <b>${fmtNum(r.poupanca)}% a.a.</b>
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">${r.updatedAt
      ? `Revisadas por você em ${fmtDateFull(r.updatedAt)}.`
      : "Exemplos iniciais, não cotações atuais. Revise os quatro valores antes de usar uma simulação para decidir."}</p>
    <div class="source-links" aria-label="Fontes oficiais das premissas">
      <a href="https://www.bcb.gov.br/controleinflacao/taxaselic" target="_blank" rel="noopener noreferrer">Selic e CDI no Banco Central</a>
      <a href="https://www.ibge.gov.br/explica/inflacao.php" target="_blank" rel="noopener noreferrer">IPCA no IBGE</a>
    </div>
  </div>`;
}

// ==================================================================
// AJUSTES EM TÓPICOS
// ==================================================================
// A tela tinha onze cartões abertos ao mesmo tempo, e achar "alertas de
// orçamento" no meio disso exigia rolar passando por categorias, backup e
// premissas de mercado. Agora cada assunto é um tópico fechado, e só um fica
// aberto por vez.
//
// A linha fechada NÃO é só um título: ela mostra o valor atual do ajuste
// (a regra em vigor, quantas categorias têm teto, quando foi o último backup).
// Sem isso o usuário teria de abrir cada tópico só para lembrar como está, e a
// tela ficaria mais lenta de ler do que a lista antiga.
//
// O estado do acordeão mora em `state.settingsSection` porque `render()`
// reconstrói o DOM inteiro; um `<details>` nativo perderia o aberto/fechado a
// cada tecla digitada em qualquer campo da tela.

function renderProfileSettingsCard() {
  const nameVal = state.userNameInput !== null ? state.userNameInput : (state.data.userName || "");
  return `<div class="card">
    <p class="card-title">Seu Perfil</p>
    <div class="field">
      <label class="field__label" for="user-name-input">Como devo te chamar?</label>
      <input id="user-name-input" class="input" data-field="user-name" value="${escapeHtml(String(nameVal))}" placeholder="Seu nome" autocomplete="off" maxlength="40" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Usado apenas na saudação do início. Fica salvo só neste aparelho.</p>
    <button class="btn btn--secondary btn--block btn--sm" data-action="onb-restart" data-ui-css="margin-top:12px">
      ${svgIcon("refresh", 15)} Refazer a configuração inicial
    </button>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Revisa nome, renda, conta principal e regra de orçamento nos mesmos 4 passos do primeiro uso. Nada é apagado.</p>
  </div>`;
}

function renderIncomeSettingsCard() {
  const incomeVal = state.incomeInput !== null ? state.incomeInput : (state.data.monthlyIncome ? state.data.monthlyIncome.toFixed(2).replace(".", ",") : "");
  return `<div class="card">
    <p class="card-title">Renda mensal fixa</p>
    <div class="income-input-row">
      <span class="income-currency">R$</span>
      <input id="income-input" class="input income-input" data-field="income" value="${escapeHtml(String(incomeVal))}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Usada para calcular sua saúde financeira mensal. Salva automaticamente ao sair do campo.</p>
  </div>`;
}

function renderCreditLimitSettingsCard() {
  const creditLimitVal = state.creditLimitInput !== null ? state.creditLimitInput : (state.data.creditCardLimit ? state.data.creditCardLimit.toFixed(2).replace(".", ",") : "");
  return `<div class="card">
    <p class="card-title">Limite desejado para a fatura do cartão</p>
    <div class="income-input-row">
      <span class="income-currency">R$</span>
      <input id="credit-limit-input" class="input income-input" data-field="credit-limit" value="${escapeHtml(String(creditLimitVal))}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Um teto próprio (não o limite do banco) pra acompanhar no Dashboard o quanto já comprometeu no crédito este mês.</p>
  </div>`;
}

// [M42] TRÊS OPÇÕES, PORQUE "SEGUIR O SISTEMA" NÃO CABE NUM INTERRUPTOR.
//
// Era um interruptor de duas posições, e a preferência do aparelho era lida uma
// única vez, no primeiro uso, e gravada como se fosse escolha. Quem instalava o
// app com o celular no escuro ficava no escuro para sempre, e não havia como
// voltar para o automático nem apagando nada pela interface. Ver o cabeçalho de
// `applyTheme` em js/app.js.
const THEME_OPTIONS = [
  { id: "system", icon: "refresh", label: "Automático", hint: "Acompanha o aparelho" },
  { id: "light", icon: "sun", label: "Claro", hint: "Sempre claro" },
  { id: "dark", icon: "moon", label: "Escuro", hint: "Sempre escuro" },
];

function themeChoiceLabel(theme) {
  const opcao = THEME_OPTIONS.find((o) => o.id === theme) || THEME_OPTIONS[0];
  return opcao.label;
}

function renderAppearanceSettingsCard() {
  const atual = THEME_OPTIONS.some((o) => o.id === state.data.theme) ? state.data.theme : "system";
  const conquistas = !!(state.data.achievements && state.data.achievements.enabled);
  return `<div class="card">
    <fieldset class="theme-choice">
      <legend class="field__label">Tema</legend>
      <div class="theme-choice__options" role="radiogroup" aria-label="Tema do aplicativo">
        ${THEME_OPTIONS.map((o) => `<button type="button" class="theme-choice__option${o.id === atual ? " is-active" : ""}" role="radio" aria-checked="${o.id === atual ? "true" : "false"}" data-action="set-theme" data-value="${o.id}">
          ${svgIcon(o.icon, 17)}
          <b>${escapeHtml(o.label)}</b>
          <small>${escapeHtml(o.hint)}</small>
        </button>`).join("")}
      </div>
    </fieldset>
    <button class="theme-toggle" data-action="toggle-gamification" role="switch" aria-checked="${conquistas ? "true" : "false"}">
      ${svgIcon("star", 17)}
      <span><b>Conquistas e níveis</b><small>Opcional. Fica fora do Início até você ativar.</small></span>
      <span class="switch ${conquistas ? "active" : ""}" aria-hidden="true"><span class="switch__knob"></span></span>
    </button>
  </div>`;
}

// Cada tópico traz `resumo()`, que é lido com a seção FECHADA. Deve caber numa
// linha e responder "como está isso hoje" sem abrir nada.
const SETTINGS_SECTIONS = [
  {
    id: "perfil",
    icon: "briefcase",
    label: "Perfil e renda",
    resumo() {
      const nome = String(state.data.userName || "").trim();
      const renda = Number(state.data.monthlyIncome) || 0;
      return `${nome || "Sem nome"} · ${renda > 0 ? `${fmtBRLShort(renda)} por mês` : "renda não informada"}`;
    },
    render: () => `${renderProfileSettingsCard()}${renderIncomeSettingsCard()}`,
  },
  {
    id: "orcamento",
    icon: "pie",
    label: "Orçamento e alertas",
    resumo() {
      const bs = state.data.budgetSplit;
      const alerts = state.data.budgetAlerts || defaultBudgetAlerts();
      return `Regra ${bs.necessidade}/${bs.desejo}/${bs.futuro} · aviso em ${alerts.warn}%`;
    },
    render: () => `${renderBudgetSplitSettingsCard()}${renderBudgetSettingsCard()}${renderCreditLimitSettingsCard()}`,
  },
  // Categoria NÃO é um tópico daqui. Ela ganhou tela própria (`#/categorias`),
  // e o cartão de resumo abaixo dos tópicos é o caminho para ela: enfiar um
  // destino dentro de um acordeão seria pedir dois toques para chegar onde
  // antes bastava um.
  {
    id: "reserva",
    icon: "piggy",
    label: "Reserva de emergência",
    resumo() {
      const r = emergencyFund(state.data);
      const meses = `${r.targetMonths} ${r.targetMonths === 1 ? "mês" : "meses"}`;
      if (!r.configured && r.current === 0) return `Alvo de ${meses} · nenhuma meta escolhida`;
      // Percentual em vez dos dois valores: `fmtBRLShort` abrevia acima de dez
      // mil, e "R$ 5.200,00 de R$ 20 mil" na mesma linha lê mal.
      return `${meses} · ${Math.round(r.pct)}% do alvo de ${fmtBRLShort(r.target)}`;
    },
    render: renderEmergencySettingsCard,
  },
  {
    id: "mercado",
    icon: "trendUp",
    label: "Premissas de mercado",
    resumo() {
      const r = marketRatesOf(state.data);
      return `Selic ${fmtNum(r.selic)}% · ${r.updatedAt ? `revisadas em ${fmtDateFull(r.updatedAt)}` : "ainda não revisadas"}`;
    },
    render: renderMarketRatesCard,
  },
  {
    id: "aparencia",
    icon: "sun",
    label: "Aparência",
    resumo() {
      const conquistas = !!(state.data.achievements && state.data.achievements.enabled);
      return `Tema ${themeChoiceLabel(state.data.theme).toLowerCase()} · conquistas ${conquistas ? "ligadas" : "desligadas"}`;
    },
    render: renderAppearanceSettingsCard,
  },
  {
    id: "dados",
    icon: "archive",
    label: "Backup e dados",
    resumo() {
      const last = state.data.lastBackupAt;
      return last ? `Último backup em ${fmtDateFull(last)}` : "Nenhum backup exportado ainda";
    },
    render: renderBackupCard,
  },
];

// A prévia de importação e o erro de backup aparecem depois de o usuário
// escolher um arquivo. Se o tópico estivesse fechado, o resultado da ação dele
// ficaria escondido; então esses dois estados forçam a abertura.
function settingsOpenSection() {
  if (state.backup.preview || state.backup.error) return "dados";
  return state.settingsSection;
}

function renderSettingsTopic(section, aberto) {
  const painelId = `settings-panel-${section.id}`;
  return `<section class="settings-topic${aberto ? " settings-topic--open" : ""}">
    <h2 class="settings-topic__heading">
      <button class="settings-topic__toggle" data-action="settings-section" data-value="${section.id}"
        aria-expanded="${aberto ? "true" : "false"}" aria-controls="${painelId}">
        <span class="settings-topic__icon">${svgIcon(section.icon, 18)}</span>
        <span class="settings-topic__text">
          <span class="settings-topic__label">${escapeHtml(section.label)}</span>
          <span class="settings-topic__summary">${escapeHtml(section.resumo())}</span>
        </span>
        ${svgIcon("chevronDown", 16, "settings-topic__chevron")}
      </button>
    </h2>
    ${aberto ? `<div class="settings-topic__panel" id="${painelId}">${section.render()}</div>` : ""}
  </section>`;
}

function renderSettingsScreen() {
  const aberto = settingsOpenSection();
  return `<div class="screen screen--narrow">
    <h1 class="page-title" data-ui-css="margin-bottom:16px">Ajustes</h1>

    <div class="settings-topics">
      ${SETTINGS_SECTIONS.map((section) => renderSettingsTopic(section, section.id === aberto)).join("")}
    </div>

    ${renderCategoriesSettingsCard()}

    <div class="card">
      <p class="card-title">Ir para outras telas</p>
      <p class="card-subtitle">Navegação, não configuração. Fica sempre visível.</p>
      <div class="tool-links">
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="account">
          <span class="tool-link__icon">${svgIcon("shieldCheck", 17)}</span>
          <span class="tool-link__text"><span class="tool-link__label">Conta e acesso</span><span class="tool-link__desc">Entrar, sincronizar e revisar dispositivos conectados.</span></span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="all">
          <span class="tool-link__icon">${svgIcon("search", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Abrir “Recursos”</span>
            <span class="tool-link__desc">Contas, dívidas, metas, simuladores, importação, patrimônio e o resto.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="rules">
          <span class="tool-link__icon">${svgIcon("tag", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Regras de categorização</span>
            <span class="tool-link__desc">Ensine o app a classificar sozinho o que vem do extrato.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="privacy">
          <span class="tool-link__icon">${svgIcon("shieldCheck", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Privacidade, termos e fontes</span>
            <span class="tool-link__desc">Envios para IA, exportação, exclusão, limites financeiros e diagnóstico local.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
      </div>
    </div>

    <p class="footnote">Seus dados ficam salvos neste navegador/dispositivo (${escapeHtml(FinanceStore.adapterName())}). Use o backup em JSON para levá-los para outro aparelho.</p>
  </div>`;
}

// Ajustes não edita mais categoria; ele resume o estado atual e entrega a tela
// que edita. Manter as duas coisas era o que fazia esta tela crescer sem parar.
//
// O cartão é um botão inteiro, não um cartão com um link dentro. Ele não tem
// nada para configurar aqui: só anuncia um destino. Pedir um segundo toque num
// alvo pequeno depois de já ter lido o resumo era desenho de página de índice,
// não de app. A moldura e o medalhão são os mesmos do tópico logo acima, para
// que a coisa pertença à pilha em vez de flutuar solta no meio dela.
function renderCategoriesSettingsCard() {
  const cats = state.data.categories || [];
  const parents = topLevelCategories(state.data).length;
  const subs = Math.max(0, cats.length - parents);
  // Mesma leitura do cartão de alertas logo acima: uma varredura do mês, sobre
  // o índice já montado por `dataIndex`. Barata o bastante para uma tela de
  // configuração, e evita repetir aqui a regra de quem estourou.
  const status = computeBudgetStatus(state.data, keyOfCurrentMonth());
  const comTeto = status.counts.total;
  const estouradas = status.counts.over;
  const bs = state.data.budgetSplit;

  const stat = (label, valor, alerta) => `<span class="settings-destination__stat${alerta ? " settings-destination__stat--alert" : ""}">
        <span class="settings-destination__stat-label">${label}</span>
        <b class="settings-destination__stat-value">${valor}</b>
      </span>`;

  // O rodapé responde "e daí?": a linha muda conforme o estado, porque
  // "0 estouradas" quer dizer coisas opostas com e sem teto definido.
  const rodape = estouradas > 0
    ? `${plural(estouradas, "categoria passou", "categorias passaram")} do teto neste mês.`
    : comTeto > 0
      ? "Nenhum teto estourado neste mês."
      : "Nenhum teto definido ainda; a central é onde se cria o primeiro.";

  return `<button class="settings-destination" data-action="nav" data-tab="categories">
    <span class="settings-destination__head">
      <span class="settings-destination__icon">${svgIcon("tag", 18)}</span>
      <span class="settings-destination__text">
        <span class="settings-destination__title">Categorias e Tetos</span>
        <span class="settings-destination__sub">Hierarquia, grupos da Regra ${bs.necessidade}/${bs.desejo}/${bs.futuro} e tetos numa tela só.</span>
      </span>
      ${svgIcon("chevronRight", 16, "settings-destination__chevron")}
    </span>
    <span class="settings-destination__stats">
      ${stat("Principais", parents, false)}
      ${stat("Subcategorias", subs, false)}
      ${stat("Com teto", `${comTeto}<small> de ${cats.length}</small>`, false)}
      ${stat("Estouradas", estouradas, estouradas > 0)}
    </span>
    <span class="settings-destination__foot">${rodape}</span>
  </button>`;
}

// Ajustes: faixas de alerta + visão geral do mês.

function renderBudgetSettingsCard() {
  const status = computeBudgetStatus(state.data, keyOfCurrentMonth());
  const alerts = state.data.budgetAlerts || defaultBudgetAlerts();
  return `<div class="card">
    <p class="card-title">Alertas de orçamento</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Em que ponto do teto de cada categoria eu devo te avisar. O primeiro aviso é preventivo; o segundo marca o estouro.</p>
    <div class="split-settings-grid">
      <div class="split-settings-field">
        <label class="field__label" for="budget-warn-input">${svgIcon("alertTriangle", 13)} Atenção</label>
        <div class="income-input-row">
          <input id="budget-warn-input" type="number" min="1" max="200" class="input input--budget" data-field="budget-warn" value="${alerts.warn}" inputmode="numeric" />
          <span class="income-currency">%</span>
        </div>
      </div>
      <div class="split-settings-field">
        <label class="field__label" for="budget-over-input">${svgIcon("x", 13)} Estouro</label>
        <div class="income-input-row">
          <input id="budget-over-input" type="number" min="1" max="300" class="input input--budget" data-field="budget-over" value="${alerts.over}" inputmode="numeric" />
          <span class="income-currency">%</span>
        </div>
      </div>
    </div>
    ${status.items.length > 0 ? `<p class="footnote" data-ui-css="text-align:left; margin-top:10px">
      ${plural(status.counts.total, "Categoria com Teto", "Categorias com Teto")} · ${status.counts.warn} em atenção · ${status.counts.over} ${pluralWord(status.counts.over, "estourada", "estouradas")} neste mês.
    </p>` : `<p class="footnote" data-ui-css="text-align:left; margin-top:10px">Nenhum teto definido ainda; abra a central de categorias, logo abaixo, para criar o primeiro.</p>`}
  </div>`;
}

// ==================================================================
// FEATURE 2. BACKUP: cartão de Ajustes
// ==================================================================
function renderBackupCard() {
  const b = state.backup;
  const counts = {
    tx: state.data.transactions.length,
    cat: state.data.categories.length,
    goals: state.data.goals.length,
  };

  if (b.preview) return renderBackupPreview(b);

  return `<div class="card">
    <p class="card-title">Backup e restauração</p>
    <p class="card-subtitle">Seus dados vivem só neste aparelho. Exporte de tempos em tempos; é a única cópia que existe.</p>

    <div class="backup-summary">
      <div><span>Lançamentos</span><b>${counts.tx}</b></div>
      <div><span>Categorias</span><b>${counts.cat}</b></div>
      <div><span>Metas</span><b>${counts.goals}</b></div>
    </div>

    <p class="field__label" data-ui-css="margin-top:14px">Exportar</p>
    <div class="settings-actions">
      <button class="btn btn--primary btn--sm" data-action="export-json">${svgIcon("download", 15)} Baixar backup completo</button>
      ${backupProtectionAvailable() ? `<button class="btn btn--secondary btn--sm" data-action="backup-protect-open">${svgIcon("shieldCheck", 15)} Proteger com senha</button>` : ""}
      <button class="btn btn--secondary btn--sm" data-action="export-csv">${svgIcon("download", 15)} Lançamentos (CSV)</button>
      <button class="btn btn--secondary btn--sm" data-action="export-statement-pdf">${svgIcon("download", 15)} Extrato (PDF)</button>
      <button class="btn btn--secondary btn--sm" data-action="export-budgets-csv">${svgIcon("download", 15)} Orçamentos (CSV)</button>
    </div>
    ${b.encryptOpen ? renderBackupProtectForm(b) : ""}
    <p class="field-hint"><b>Este arquivo contém informações financeiras privadas. Guarde-o em local seguro.</b> Ele sai aberto, para que você consiga lê-lo em qualquer aparelho${backupProtectionAvailable() ? "; se for guardar em nuvem de terceiro ou enviar por e-mail, use “Proteger com senha”" : ""}.</p>
    <p class="field-hint">O backup completo guarda tudo (lançamentos, categorias, tetos, metas e ajustes) e é o que restaura o app por inteiro. O CSV serve para abrir no Excel ou no Google Sheets. O PDF é o extrato pronto para imprimir ou enviar, com o período e os filtros escolhidos em Movimentações (por padrão, o mês atual). <span class="footnote">Formato do backup completo: JSON.</span></p>
    ${renderLastBackupLine()}

    <p class="field__label" data-ui-css="margin-top:14px">Importar</p>
    ${b.error ? `<div class="inline-error">
      ${svgIcon("alertTriangle", 16)}
      <div><p class="inline-error__title">${escapeHtml(b.error)}</p><p class="inline-error__detail">Seus dados atuais continuam intactos.</p></div>
      <button class="icon-btn icon-btn--muted" data-action="backup-cancel" aria-label="Fechar erro de backup">${svgIcon("x", 14)}</button>
    </div>` : ""}
    ${b.locked ? renderBackupUnlockForm(b) : ""}
    <div class="settings-actions">
      <button class="btn btn--secondary btn--sm" data-action="import-json-trigger" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("upload", 15)} Escolher arquivo de backup
      </button>
      ${b.undoAvailable ? `<button class="btn btn--ghost btn--sm" data-action="backup-undo">${svgIcon("refresh", 15)} Desfazer última restauração</button>` : ""}
    </div>
  </div>`;
}

// [M12] A criptografia do backup é opcional e depende do WebCrypto. Onde ele
// não existir (contexto sem origem segura, navegador antigo), a opção some e o
// backup comum continua inteiro; o cartão não pode quebrar por causa disso.
function backupProtectionAvailable() {
  return typeof backupCryptoAvailable === "function" && backupCryptoAvailable();
}

// [M12] Escolha da senha do backup protegido. Fica DENTRO do cartão, aberto sob
// demanda: quem só quer o arquivo de sempre não passa por aqui.
function renderBackupProtectForm(b) {
  return `<div class="backup-protect" data-ui-css="margin-top:12px">
    <p class="field__label">Proteger o backup com senha</p>
    <p class="field-hint"><b>Não existe recuperação.</b> O arquivo é aberto só com esta senha; nem o app nem o servidor conseguem abri-lo sem ela. Guarde-a onde você já guarda suas outras senhas.</p>
    <div class="field" data-ui-css="margin-top:10px">
      <label class="field__label" for="backup-password">Senha do arquivo</label>
      <input id="backup-password" class="input" type="password" data-field="backup-password" minlength="${BACKUP_ENC_MIN_PASSWORD}" maxlength="128" value="${escapeHtml(b.password || "")}" autocomplete="new-password" />
      ${renderPasswordStrength(b.password || "", "")}
    </div>
    <div class="field">
      <label class="field__label" for="backup-password-confirm">Repita a senha</label>
      <input id="backup-password-confirm" class="input" type="password" data-field="backup-password-confirm" maxlength="128" value="${escapeHtml(b.passwordConfirm || "")}" autocomplete="new-password" />
    </div>
    <div class="settings-actions">
      <button class="btn btn--ghost btn--sm" data-action="backup-protect-cancel">Cancelar</button>
      <button class="btn btn--primary btn--sm" data-action="backup-protect-confirm" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("shieldCheck", 15)} Baixar protegido
      </button>
    </div>
  </div>`;
}

// [M12] O arquivo escolhido está cifrado: a senha vem antes de o conteúdo ser
// interpretado. Até aqui, nada do arquivo foi lido além do rótulo do envelope.
function renderBackupUnlockForm(b) {
  return `<div class="backup-protect" data-ui-css="margin-top:12px">
    <p class="field__label">${svgIcon("shieldCheck", 14)} Backup protegido por senha</p>
    <p class="card-subtitle" data-ui-css="margin-top:2px">${escapeHtml(b.locked.filename)}</p>
    <div class="field" data-ui-css="margin-top:10px">
      <label class="field__label" for="backup-unlock-password">Senha do arquivo</label>
      <input id="backup-unlock-password" class="input" type="password" data-field="backup-unlock-password" maxlength="128" value="${escapeHtml(b.unlockPassword || "")}" autocomplete="off" />
    </div>
    <div class="settings-actions">
      <button class="btn btn--ghost btn--sm" data-action="backup-cancel">Cancelar</button>
      <button class="btn btn--primary btn--sm" data-action="backup-unlock" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("upload", 15)} Abrir backup
      </button>
    </div>
  </div>`;
}

function renderBackupPreview(b) {
  const p = b.preview;
  const current = state.data.transactions.length;
  const merge = b.mode === "merge";
  // Prévia do resultado da mesclagem; o usuário vê o número final ANTES de decidir.
  const mergedPreview = merge ? mergeBackupInto(state.data, p.data) : null;

  return `<div class="card card--elevated">
    <div class="settings-row-header modal-header">
      <p class="card-title" data-ui-css="margin:0">Confirmar importação</p>
      <button class="icon-btn" data-action="backup-cancel" aria-label="Cancelar importação do backup">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${escapeHtml(p.filename)}${p.meta.exportedAt ? ` · exportado em ${fmtDateFull(p.meta.exportedAt.slice(0, 10))}` : ""}${p.meta.legacy ? " · formato antigo (será convertido)" : ""}${p.meta.encrypted ? " · protegido por senha" : ""}</p>
    ${p.meta.future ? `<div class="inline-error inline-error--warn">
      ${svgIcon("alertTriangle", 16)}
      <div><p class="inline-error__title">Este backup foi criado por uma versão mais nova do aplicativo.</p><p class="inline-error__detail">Tudo o que esta versão reconhece será restaurado. Campos introduzidos depois dela não são entendidos aqui e não entram. Se puder, atualize o aplicativo antes de restaurar.</p></div>
    </div>` : ""}

    <div class="backup-summary">
      <div><span>No arquivo</span><b>${p.meta.counts.transactions}</b></div>
      <div><span>Neste aparelho</span><b>${current}</b></div>
      <div><span>Depois</span><b>${merge ? mergedPreview.data.transactions.length : p.meta.counts.transactions}</b></div>
    </div>

    <div class="segmented" data-ui-css="margin-top:14px">
      <button class="segmented__option ${merge ? "active" : ""}" data-action="backup-set-mode" data-value="merge">Mesclar</button>
      <button class="segmented__option ${!merge ? "active" : ""}" data-action="backup-set-mode" data-value="replace">Substituir</button>
    </div>

    <p class="field-hint" data-ui-css="margin-top:10px">${merge
      ? `Mantém tudo o que já existe aqui e acrescenta o que faltar. Lançamentos repetidos são detectados por conteúdo e ignorados. ${plural(mergedPreview.stats.added, "novo", "novos")}, ${mergedPreview.stats.skipped} já ${pluralWord(mergedPreview.stats.skipped, "existente", "existentes")}.`
      : `<b data-ui-css="color:var(--negative)">Apaga tudo o que está neste aparelho</b> e deixa apenas o conteúdo do arquivo. Use quando estiver migrando para um celular novo.`}</p>

    <div class="settings-actions" data-ui-css="margin-top:12px">
      <button class="btn btn--ghost btn--sm" data-action="backup-cancel">Cancelar</button>
      <button class="btn ${merge ? "btn--primary" : "btn--danger"} btn--sm" data-action="backup-confirm" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("check", 15)} ${merge ? "Mesclar agora" : "Substituir tudo"}
      </button>
    </div>
  </div>`;
}

// source: js/screens/privacy.js
// js/screens/privacy.js. Privacidade, termos, limites financeiros e diagnóstico.
"use strict";

// Um campo do controlador que ainda não foi definido é mostrado como pendência
// explícita, e não escondido. Esconder daria à política a aparência de pronta.
function renderLegalControllerField(label, value) {
  const pendente = String(value == null ? "" : value).trim() === "" || String(value) === LEGAL_PENDING;
  return `<div><dt>${escapeHtml(label)}</dt><dd class="${pendente ? "legal-pending" : ""}">${pendente ? "Ainda não definido" : escapeHtml(String(value))}</dd></div>`;
}

function renderLegalRetentionGroup(scope, title, note) {
  const itens = LEGAL_RETENTION.filter((item) => item.scope === scope);
  if (!itens.length) return "";
  return `<p class="legal-subhead">${escapeHtml(title)}</p>
    <p class="card-subtitle">${escapeHtml(note)}</p>
    <dl class="legal-list">${itens.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.term)}</dd></div>`).join("")}</dl>`;
}

function renderLegalDataInventoryItem(item) {
  const fields = [
    ["Finalidade", item.purpose],
    ["Onde fica", item.storage],
    ["Retenção", item.retention],
    ["Quem acessa", item.access],
    ["Terceiros", item.thirdParties],
    ["Como excluir", item.deletion],
  ];
  return `<details class="legal-inventory__item">
    <summary>${escapeHtml(item.data)}</summary>
    <dl class="legal-list">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
  </details>`;
}

function renderLegalDataInventoryGroup(group) {
  const items = LEGAL_DATA_INVENTORY.filter((item) => item.group === group.id);
  if (!items.length) return "";
  return `<section class="legal-inventory__group" aria-labelledby="legal-inventory-${escapeHtml(group.id)}">
    <p class="legal-subhead" id="legal-inventory-${escapeHtml(group.id)}">${escapeHtml(group.title)}</p>
    <p class="card-subtitle">${escapeHtml(group.detail)}</p>
    <div class="legal-inventory__items">${items.map(renderLegalDataInventoryItem).join("")}</div>
  </section>`;
}

function renderLegalThirdParty(item) {
  const pending = item.status === "pending";
  const fields = [
    ["Quando participa", item.when],
    ["Finalidade", item.purpose],
    ["Dados que recebe", item.data],
    ["Retenção", item.retention],
    ["Como excluir", item.deletion],
    ["Transferência internacional", item.transfer],
  ];
  // [M39] O TEXTO VISÍVEL É O MESMO EM TODOS OS FORNECEDORES, E ISSO BASTA PARA
  // QUEM ENXERGA A FICHA EM VOLTA. Quem usa leitor de tela costuma navegar pela
  // LISTA de links, onde o contexto some: apareciam cinco "Privacidade do
  // serviço" e seis "Fonte técnica oficial", indistinguíveis. O `aria-label`
  // carrega o nome do fornecedor sem mudar uma letra do que está na tela.
  const privacyLink = item.privacyUrl === LEGAL_PENDING
    ? ""
    : `<a href="${escapeHtml(item.privacyUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Privacidade do serviço: ${escapeHtml(item.name)}">Privacidade do serviço</a>`;
  return `<details class="legal-third-party ${pending ? "legal-third-party--pending" : ""}">
    <summary>
      <span class="legal-third-party__identity"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.role)}</small></span>
      <span class="legal-third-party__status">${pending ? "Por definir" : "Em uso"}</span>
    </summary>
    <dl class="legal-list">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    <div class="source-links">${privacyLink}<a href="${escapeHtml(item.evidence)}" target="_blank" rel="noopener noreferrer" aria-label="Fonte técnica oficial: ${escapeHtml(item.name)}">Fonte técnica oficial</a></div>
  </details>`;
}

function renderLegalThirdPartyGroup(group) {
  const items = LEGAL_THIRD_PARTIES.filter((item) => item.group === group.id);
  if (!items.length) return "";
  return `<section class="legal-third-parties__group" aria-labelledby="legal-third-party-${escapeHtml(group.id)}">
    <p class="legal-subhead" id="legal-third-party-${escapeHtml(group.id)}">${escapeHtml(group.title)}</p>
    <p class="card-subtitle">${escapeHtml(group.detail)}</p>
    <div class="legal-third-parties__items">${items.map(renderLegalThirdParty).join("")}</div>
  </section>`;
}

function renderPrivacyScreen() {
  const privacy = normalizePrivacy(state.data.privacy || defaultPrivacy());
  const accepted = legalAccepted(privacy);
  const diagnostics = safeErrorSummary();
  const gaps = legalControllerGaps(LEGAL_CONTROLLER);
  const inventoryGaps = legalDataInventoryGaps(LEGAL_DATA_INVENTORY);
  const thirdPartyGaps = legalThirdPartyGaps(LEGAL_THIRD_PARTIES);
  const thirdPartyLaunchGaps = legalThirdPartyLaunchGaps(LEGAL_THIRD_PARTIES);
  const anteriores = privacy.acceptedVersions.filter((item) => item.version !== LEGAL_TEXT_VERSION);
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Privacidade, termos e fontes")}

    <div class="card legal-status ${accepted ? "legal-status--ok" : "legal-status--pending"}">
      <div class="settings-row-header">
        <div><p class="card-title">Estado dos textos</p><p class="card-subtitle">Versão ${LEGAL_TEXT_VERSION}. Revisão em ${fmtDateFull(LEGAL_REVIEW_DATE)}.</p></div>
        <span class="status-badge">${accepted ? "Aceitos" : "Pendente"}</span>
      </div>
      <p class="card-subtitle">${accepted ? `Aceitos em ${fmtDateFull(String(privacy.acceptedAt).slice(0, 10))}.` : "Nenhum aceite foi presumido para dados que já existiam antes desta versão."}</p>
      ${anteriores.length ? `<p class="card-subtitle">Você já havia aceitado ${anteriores.map((item) => `a versão ${escapeHtml(item.version)} em ${fmtDateFull(String(item.at).slice(0, 10))}`).join("; ")}. O registro fica neste aparelho e, com conta ligada, acompanha a sincronização das preferências.</p>` : ""}
      ${accepted ? "" : `<button class="btn btn--primary btn--block" data-action="legal-accept">${svgIcon("checkCircle", 16)} Aceitar política e termos</button>`}
    </div>

    <div class="card">
      <p class="card-title">Quem responde por estes dados</p>
      <p class="card-subtitle">O controlador é quem decide como os dados são tratados e a quem você dirige qualquer pedido (LGPD, art. 5, VI).</p>
      <dl class="legal-list">
        ${renderLegalControllerField("Controlador", LEGAL_CONTROLLER.name)}
        ${renderLegalControllerField("CPF ou CNPJ", LEGAL_CONTROLLER.document)}
        ${renderLegalControllerField("Endereço", LEGAL_CONTROLLER.address)}
        ${renderLegalControllerField("Canal de atendimento", LEGAL_CONTROLLER.supportEmail)}
        ${renderLegalControllerField("Encarregado pelos dados", LEGAL_CONTROLLER.dpoName)}
        ${renderLegalControllerField("Contato do encarregado", LEGAL_CONTROLLER.dpoEmail)}
      </dl>
      <p class="card-subtitle">Prazo de resposta a pedidos do titular: ${LEGAL_CONTROLLER.responseDays} dias (art. 19, II).</p>
      ${gaps.length ? `<div class="financial-notice" role="note">${svgIcon("alertTriangle", 16)}<div><p><b>Identificação incompleta.</b> Falta definir: ${escapeHtml(gaps.join(", "))}. Enquanto isso, esta instalação é versão local em desenvolvimento e não deve ser oferecida ao público.</p><small>Nada aqui foi preenchido por suposição.</small></div></div>` : ""}
    </div>

    <div class="card">
      <p class="card-title">Onde seus dados ficam</p>
      <p class="card-subtitle">Sem conta, lançamentos, contas financeiras, cartões, metas, dívidas, categorias e preferências ficam apenas no armazenamento deste navegador. Com conta ligada, esses mesmos registros passam a ser sincronizados com o servidor para aparecerem em outros aparelhos, junto com email, sessão e identificação dos aparelhos.</p>
      <div class="legal-facts">
        <p>${svgIcon("shieldCheck", 15)} O backup JSON é criado apenas quando você toca em exportar.</p>
        <p>${svgIcon("archive", 15)} Espelho, fallback, desfazer e backup legado podem conter seus dados em JSON legível e sem criptografia neste aparelho.</p>
        <p>${svgIcon("wifi", 15)} Precisam de rede: a conta, a IA, a checagem de senha vazada e a consulta opcional de nota fiscal ao portal da Sefaz.</p>
        <p>${svgIcon("file", 15)} A tipografia é servida pelo próprio app. Nenhuma fonte, métrica ou script de terceiro carrega junto com a página.</p>
        <p>${svgIcon("phone", 15)} Apagar a conta online (tela Conta e acesso) e apagar os dados deste aparelho são ações separadas. Uma não faz a outra.</p>
      </div>
      <div class="source-links"><a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" target="_blank" rel="noopener noreferrer">Direitos do titular na ANPD</a><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noopener noreferrer">Lei Geral de Proteção de Dados</a></div>
    </div>

    <div class="card">
      <p class="card-title">Inventário dos dados</p>
      <p class="card-subtitle">Cada item informa a finalidade, onde fica, por quanto tempo permanece, quem acessa, quais terceiros participam e como excluir. Abra uma categoria para ver o caminho completo.</p>
      ${inventoryGaps.length ? `<div class="financial-notice" role="alert">${svgIcon("alertTriangle", 16)}<div><p><b>Inventário incompleto.</b> Esta versão não deve ser oferecida ao público.</p><small>${escapeHtml(inventoryGaps.join("; "))}</small></div></div>` : ""}
      <div class="legal-inventory">${LEGAL_DATA_INVENTORY_GROUPS.map(renderLegalDataInventoryGroup).join("")}</div>
    </div>

    <div class="card">
      <p class="card-title">Quem participa do tratamento</p>
      <p class="card-subtitle">Esta lista vem das integrações encontradas no código e na publicação. Abra um serviço para ver exatamente quando ele entra e quais dados recebe.</p>
      ${thirdPartyGaps.length ? `<div class="financial-notice" role="alert">${svgIcon("alertTriangle", 16)}<div><p><b>Registro de terceiros incompleto.</b> Esta versão não deve ser oferecida ao público.</p><small>${escapeHtml(thirdPartyGaps.join("; "))}</small></div></div>` : ""}
      ${thirdPartyLaunchGaps.length ? `<div class="financial-notice" role="note">${svgIcon("alertTriangle", 16)}<div><p><b>Falta registrar o email de produção.</b> O fornecedor SMTP ainda não está identificado.</p><small>${escapeHtml(thirdPartyLaunchGaps.join("; "))}</small></div></div>` : ""}
      <div class="legal-third-parties">${LEGAL_THIRD_PARTY_GROUPS.map(renderLegalThirdPartyGroup).join("")}</div>
      <div class="legal-facts legal-facts--compact">
        <p>${svgIcon("shieldCheck", 15)} Não há analytics, publicidade, pixels, fontes remotas ou scripts de terceiros carregados na página.</p>
        <p>${svgIcon("phone", 15)} Sem conta e sem uma ação de rede opcional, os dados financeiros permanecem no aparelho.</p>
      </div>
    </div>

    <div class="card">
      <p class="card-title">Por quanto tempo cada coisa fica</p>
      ${renderLegalRetentionGroup("local", "Neste aparelho", "Você controla diretamente e pode apagar a qualquer momento.")}
      ${renderLegalRetentionGroup("conta", "No servidor, apenas com conta ligada", "Sem conta criada, nada nesta lista existe.")}
    </div>

    <div class="card">
      <p class="card-title">Seus direitos</p>
      <p class="card-subtitle">A LGPD garante os direitos do art. 18, listados abaixo. Onde há botão no app, o botão é o caminho mais rápido; o pedido pelo canal de atendimento continua valendo e é respondido em ${LEGAL_CONTROLLER.responseDays} dias.</p>
      <dl class="legal-list">
        ${LEGAL_SUBJECT_RIGHTS.map((right) => `<div><dt>${escapeHtml(right.title)} <span class="legal-law">${escapeHtml(right.law)}</span></dt><dd>${escapeHtml(right.detail)}${right.selfService ? ` <span class="legal-self">Já disponível no app.</span>` : ""}</dd></div>`).join("")}
      </dl>
    </div>

    <div class="card">
      <p class="card-title">Se houver incidente de segurança</p>
      <p class="card-subtitle">Incidente com risco ou dano relevante a você deve ser comunicado a você e à ANPD em prazo razoável (art. 48). O aviso descreve os dados atingidos, o risco, as medidas tomadas e o que você pode fazer.</p>
      <dl class="legal-list">
        ${renderLegalControllerField("Canal para comunicar ou receber aviso de incidente", LEGAL_CONTROLLER.incidentEmail)}
      </dl>
      <p class="card-subtitle">Encontrou uma falha? Use o mesmo canal. Enquanto a conta não é usada, um incidente no servidor não alcança dados financeiros que nunca saíram do seu aparelho.</p>
      <div class="source-links"><a href="https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis" target="_blank" rel="noopener noreferrer">Comunicação de incidente na ANPD</a></div>
    </div>

    <div class="card">
      <p class="card-title">Envio para IA</p>
      <p class="card-subtitle">O padrão é confirmar cada envio. A análise financeira envia totais mensais, nomes de categorias, nomes e valores de metas e regras de orçamento. O refinamento de lançamento envia a frase digitada e os nomes das categorias. Esses pacotes são agregados ou limitados, mas não são chamados de anônimos porque os nomes podem revelar contexto pessoal.</p>
      <button class="theme-toggle" data-action="privacy-ai-mode" data-value="ask" role="radio" aria-checked="${privacy.aiSharing !== "blocked" ? "true" : "false"}">
        ${svgIcon("shieldCheck", 17)}<span><b>Perguntar antes de enviar</b><small>Mostra o conteúdo e pede confirmação em cada uso.</small></span><span class="switch ${privacy.aiSharing !== "blocked" ? "active" : ""}"><span class="switch__knob"></span></span>
      </button>
      <button class="theme-toggle" data-action="privacy-ai-mode" data-value="blocked" role="radio" aria-checked="${privacy.aiSharing === "blocked" ? "true" : "false"}">
        ${svgIcon("x", 17)}<span><b>Bloquear envios para IA</b><small>Os recursos locais continuam funcionando.</small></span><span class="switch ${privacy.aiSharing === "blocked" ? "active" : ""}"><span class="switch__knob"></span></span>
      </button>
      ${privacy.aiSharing === "blocked" ? "" : `
      <p class="legal-subhead">O que sai por padrão</p>
      <p class="card-subtitle">Desmarque o que não deve acompanhar o envio. A prévia mostrada na hora do envio já vem com esta escolha, e pode ser mudada lá também.</p>
      <div class="ai-preview__fields">${Object.entries(AI_HIDEABLE_FIELDS).map(([id, label]) => {
        const incluido = privacy.aiHide.indexOf(id) === -1;
        return `<label class="ai-preview__field">
          <input type="checkbox" data-action-select="privacy-ai-field" data-value="${escapeHtml(id)}" ${incluido ? "checked" : ""} />
          <span><b>${escapeHtml(label)}</b><small>${incluido ? "Vai junto no envio" : (id === "categorias" ? "Sai como Categoria 1, Categoria 2..." : "Removido do pacote")}</small></span>
        </label>`;
      }).join("")}</div>`}
    </div>

    <div class="card">
      <p class="card-title">Seus controles</p>
      <div class="tool-links">
        <button class="tool-link tool-link--rich" data-action="export-json"><span class="tool-link__icon">${svgIcon("download", 17)}</span><span class="tool-link__text"><span class="tool-link__label">Exportar todos os dados</span><span class="tool-link__desc">Cria um backup JSON que você controla.</span></span>${svgIcon("chevronRight", 15, "tool-link__chevron")}</button>
        <button class="tool-link tool-link--rich" data-action="privacy-delete-all"><span class="tool-link__icon">${svgIcon("trash", 17)}</span><span class="tool-link__text"><span class="tool-link__label">Apagar todos os dados deste aparelho</span><span class="tool-link__desc">Remove dados financeiros, preferências, cópias locais de recuperação e diagnósticos.</span></span>${svgIcon("chevronRight", 15, "tool-link__chevron")}</button>
      </div>
    </div>

    <div class="card">
      <p class="card-title">Limites financeiros e jurídicos</p>
      <p class="card-subtitle">O aplicativo organiza informações e produz estimativas educativas. Ele não presta consultoria de valores mobiliários, não conhece seu perfil completo, não oferece crédito, não garante rentabilidade e não confirma direito ou valor de aposentadoria. Propostas, contratos, tributos, regras e taxas oficiais prevalecem sobre os cálculos.</p>
      <div class="source-links">
        <a href="https://www.bcb.gov.br/meubc/faqs/p/cuidados-na-hora-de-contratar-uma-operacao-de-credito" target="_blank" rel="noopener noreferrer">CET e crédito no Banco Central</a>
        <a href="https://www.gov.br/cvm/pt-br/assuntos/educacao/" target="_blank" rel="noopener noreferrer">Educação do investidor na CVM</a>
        <a href="https://www.gov.br/pt-br/servicos/simular-aposentadoria" target="_blank" rel="noopener noreferrer">Simulação oficial no Meu INSS</a>
      </div>
    </div>

    <div class="card">
      <div class="settings-row-header"><div><p class="card-title">Diagnóstico local</p><p class="card-subtitle">${plural(diagnostics.total, "ocorrência", "ocorrências")} nos últimos 30 dias. Limite de 50.</p></div><span class="status-badge">Não enviado</span></div>
      <p class="card-subtitle">O registro contém somente data, área, código controlado, versão, schema e estado de conexão. Mensagens, pilhas, valores, descrições, contas, categorias, metas, arquivos e identificadores não entram.</p>
      <div class="button-row">
        <button class="btn btn--secondary" data-action="diagnostics-export" ${diagnostics.total ? "" : "disabled"}>${svgIcon("download", 15)} Exportar resumo</button>
        <button class="btn btn--ghost" data-action="diagnostics-clear" ${diagnostics.total ? "" : "disabled"}>${svgIcon("trash", 15)} Apagar diagnóstico</button>
      </div>
    </div>

    <div class="card">
      <p class="card-title">Termos de uso</p>
      <div class="legal-copy">
        <p><b>1. O que este aplicativo é.</b> Uma ferramenta de organização financeira pessoal que registra o que você informa e calcula estimativas educativas a partir disso. Ele não é instituição financeira, corretora, consultoria de valores mobiliários, correspondente bancário nem órgão previdenciário.</p>
        <p><b>2. Quem pode usar.</b> Uso pessoal e não comercial, por pessoa capaz de contratar. O aplicativo não é destinado a menores de 18 anos e não coleta dados de crianças ou adolescentes de forma consciente.</p>
        <p><b>3. Sua responsabilidade.</b> Conferir os dados inseridos e as condições reais antes de contratar crédito, investir, resgatar recursos ou tomar decisão previdenciária. Números do app não substituem proposta, contrato, extrato oficial nem simulação do Meu INSS.</p>
        <p><b>4. Backups são seus.</b> O funcionamento local reduz o envio de dados, mas exige que você mantenha backups. Limpar o navegador, trocar de aparelho ou perder o aparelho pode apagar informações sem recuperação. Com conta ligada há cópia no servidor, e ela também depende de a conta continuar existindo.</p>
        <p><b>5. Disponibilidade.</b> Não há garantia de funcionamento ininterrupto, de preservação de dados no servidor nem de prazo de atendimento além do prazo legal de resposta ao titular. Recursos que dependem de rede podem ficar indisponíveis sem aviso.</p>
        <p><b>6. Limite de responsabilidade.</b> O aplicativo é fornecido no estado em que se encontra. Ele não responde por decisão financeira tomada com base nas estimativas, por perda de dados no seu aparelho nem por indisponibilidade de terceiros. Esta cláusula não afasta direitos do consumidor previstos em lei.</p>
        <p><b>7. Uso indevido.</b> É vedado tentar acessar conta alheia, contornar limites de uso, automatizar chamadas às funções do servidor ou usar o aplicativo para atividade ilícita. A conta usada dessa forma pode ser encerrada.</p>
        <p><b>8. Propriedade.</b> O código e o conteúdo do aplicativo pertencem ao seu titular. Os dados financeiros que você registra pertencem a você, e o app não os usa por conta própria para publicidade, perfilamento comercial, venda a terceiros ou treinamento de modelo. O tratamento pelo provedor de IA depende do contrato e da política dele.</p>
        <p><b>9. Mudanças nos textos.</b> Alteração de conteúdo sobe a versão do texto e o aceite é pedido de novo. O aceite anterior permanece no histórico e, com conta ligada, acompanha a configuração sincronizada. Continuar usando sem aceitar mantém o app funcionando localmente, com os envios opcionais desligados.</p>
        <p><b>10. Encerramento.</b> Você pode encerrar quando quiser apagando os dados deste aparelho e, se houver, a conta online. Nenhuma das duas ações exige pedido, aprovação ou espera.</p>
        <p><b>11. Lei e foro.</b> Aplica-se a lei brasileira. O foro é o do domicílio do consumidor, na forma do Código de Defesa do Consumidor.</p>
        <p><b>12. Estado desta instalação.</b> ${gaps.length ? "Enquanto a identificação do controlador e o canal de atendimento não forem definidos, esta instalação deve ser tratada como versão local em desenvolvimento e não deve ser oferecida ao público." : "Identificação do controlador e canal de atendimento definidos."}</p>
      </div>
    </div>
  </div>`;
}

// source: js/screens/account.js
"use strict";

function accountStatusCard() {
  if (state.account.loading) return `<div class="card account-status">${svgIcon("loader", 20)}<div><p class="card-title">Verificando sua conta</p><p class="card-subtitle">Seus dados locais continuam disponíveis.</p></div></div>`;
  if (state.account.configured === false) return `<div class="card account-status">${svgIcon("wifi", 20)}<div><p class="card-title">Modo local ativo</p><p class="card-subtitle">O serviço de contas ainda não foi configurado nesta publicação. O app continua funcionando neste aparelho, sem enviar seus dados.</p></div></div>`;
  return "";
}

// [M42] CADASTRO FECHADO ENQUANTO NÃO HOUVER CONTROLADOR PUBLICADO.
//
// A tela Privacidade já dizia que esta instalação "não deve ser oferecida ao
// público" enquanto a identificação do controlador estiver em branco. Dizer não
// bastava: o formulário de cadastro continuava aberto e a coleta acontecia
// assim mesmo. Sem controlador identificado (LGPD art. 9, I), sem encarregado
// nomeado (art. 41) e sem canal de incidente (art. 48), não há a quem o titular
// dirigir um pedido do art. 18; então a coleta não começa.
//
// O que NÃO é bloqueado: entrar numa conta que já existe, recuperar senha e
// confirmar um email pendente. O portão fecha a coleta nova, não o acesso de
// quem já está dentro. E o app inteiro continua disponível sem conta, com os
// dados no aparelho, que é o modo padrão dele.
//
// O servidor recusa o mesmo em `/api/account/register`. Recusar só aqui seria
// recusar nada: a rota continuaria aberta para qualquer chamada direta.
function accountSignupOpen() {
  if (state.account.signupOpen === false) return false;
  return typeof legalControllerReady === "function" ? legalControllerReady() : true;
}

function accountSignupClosedCard() {
  return `<div class="card account-auth-card">
    <p class="eyebrow">Conta opcional</p>
    <h2 class="card-title">O cadastro está fechado por enquanto</h2>
    <p class="card-subtitle">Esta instalação ainda não publicou quem responde pelos seus dados: sem controlador identificado e sem encarregado, não haveria a quem você dirigir um pedido sobre eles. Enquanto isso, preferimos não coletar.</p>
    <p class="card-subtitle">O aplicativo funciona inteiro sem conta. Tudo o que você registrar fica neste aparelho, e o backup em arquivo continua disponível em Privacidade.</p>
    <div class="account-auth-links">
      <button type="button" class="link-btn" data-action="nav" data-tab="privacy">Ver o que falta ser definido</button>
      <button type="button" class="link-btn" data-action="account-mode" data-value="login">Já tenho conta, quero entrar</button>
    </div>
  </div>`;
}

function accountGuestForm() {
  const a = state.account;
  const cadastroAberto = accountSignupOpen();
  const register = a.mode === "register" && cadastroAberto;
  const recover = a.mode === "recover";
  if (a.mode === "register" && !cadastroAberto) return accountSignupClosedCard();
  // ESTA TELA PRECISA SER UM `<form>` DE VERDADE.
  //
  // O resto do app monta formulário com `div` + botão delegado, e para os
  // cadastros internos isso só custava o Enter (resolvido no `onKeydown`). No
  // login custa mais: gerenciador de senha e o autofill do navegador se
  // orientam pela estrutura do formulário - um par email/senha solto dentro de
  // `div` não é reconhecido como credencial, e salvar ou preencher a senha
  // deixa de ser oferecido. `data-action` continua fazendo o envio; o `submit`
  // é interceptado só para o Enter não recarregar a página.
  return `<form class="card account-auth-card" data-action-submit="account-auth" novalidate>
    <p class="eyebrow">Conta opcional</p>
    <h2 class="card-title">${recover ? "Recuperar acesso" : register ? "Criar conta" : "Entrar"}</h2>
    <p class="card-subtitle">${recover ? "Enviaremos um link para o email informado." : "A conta prepara o acesso em outros dispositivos. O uso local continua disponível sem cadastro."}</p>
    <div class="field"><label class="field__label" for="account-email">Email</label><input id="account-email" class="input" type="email" name="email" data-field="auth-email" data-validate="email" maxlength="254" value="${escapeHtml(a.form.email)}" autocomplete="email" inputmode="email" /></div>
    ${recover ? "" : `<div class="field"><label class="field__label" for="account-password">Senha</label><input id="account-password" class="input" type="password" name="password" data-field="auth-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.password)}" autocomplete="${register ? "new-password" : "current-password"}" />${register ? renderPasswordStrength(a.form.password, a.form.email) : `<p class="field-hint">Mínimo de 10 caracteres.</p>`}</div>`}
    <button type="submit" class="btn btn--primary btn--block" data-action="account-submit" data-value="${recover ? "recover" : (register ? "register" : "login")}" ${a.busy ? "disabled" : ""}>${a.busy ? svgIcon("loader", 16) : svgIcon(register ? "plus" : (recover ? "refresh" : "shieldCheck"), 16)} ${recover ? "Enviar link" : (register ? "Criar conta" : "Entrar")}</button>
    <div class="account-auth-links">
      ${recover ? `<button type="button" class="link-btn" data-action="account-mode" data-value="login">Voltar para entrar</button>` : `${cadastroAberto ? `<button type="button" class="link-btn" data-action="account-mode" data-value="${register ? "login" : "register"}">${register ? "Já tenho uma conta" : "Criar uma conta"}</button>` : ""}<button type="button" class="link-btn" data-action="account-mode" data-value="recover">Esqueci minha senha</button>`}
    </div>
  </form>`;
}

// Cartão de confirmação pendente.
//
// Ele existe porque não havia saída para o email que não chega: a tela dizia
// "Confira seu email", o email não vinha, e não havia botão nenhum para pedir
// outro. Reenviar exigia cadastrar de novo, o que devolve a mesma resposta
// opaca do servidor e não dispara link nenhum para quem já tem conta.
function accountPendingCard() {
  const a = state.account;
  if (!a.pendingEmail || a.authenticated) return "";
  return `<div class="card account-sync account-pending">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--idle">${svgIcon("clock", 18)}</span>
      <div>
        <p class="card-title">Confirmação de email pendente</p>
        <p class="card-subtitle">O link de confirmação vai para ${escapeHtml(a.pendingEmail)}. Enquanto ele não for aberto, esta conta não entra e não sincroniza.</p>
        <p class="field-hint">O link vale 24 horas. Se ele não aparecer, procure na caixa de spam antes de pedir outro.</p>
      </div>
    </div>
    <button class="btn btn--secondary btn--sm" data-action="account-resend" ${a.busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Reenviar confirmação</button>
  </div>`;
}

function accountDeviceDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "data indisponível" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const ACCOUNT_DEVICE_ICONS = {
  desktop: "monitor",
  phone: "phone",
  tablet: "tablet",
  unknown: "globe",
};

function accountDeviceType(device) {
  const informed = String((device && (device.type || device.deviceType)) || "").toLowerCase();
  if (ACCOUNT_DEVICE_ICONS[informed]) return informed;
  const label = String((device && device.label) || "").toLowerCase();
  if (/ipad|tablet/.test(label)) return "tablet";
  if (/iphone|android|celular|mobile/.test(label)) return "phone";
  if (/windows|macos|mac os|linux|chrome os|desktop|notebook/.test(label)) return "desktop";
  return "unknown";
}

function accountDeviceLastSeen(value, current) {
  if (current) return "Ativo agora";
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Último acesso indisponível";
  const now = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = todayDate.getTime();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (day === today) return `Hoje, ${time}`;
  if (day === yesterdayDate.getTime()) return `Ontem, ${time}`;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// [M7] "Entrou pela primeira vez em" só precisa do DIA, e por isso não reutiliza
// `accountDeviceDate` (que traz data E hora, e serve à última sincronização, que
// é recente por natureza). A hora exata de meses atrás não ajuda ninguém a
// reconhecer um acesso e polui a linha que precisa ser lida de relance.
function accountDeviceFirstSeen(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "data indisponível";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// [M6] O medidor só aparece onde a senha está sendo ESCOLHIDA (cadastro e nova
// senha). No campo de entrar ele seria ruído: a senha já existe, e comentar a
// força dela ali não muda nada além de assustar.
//
// A barra é decorativa (`aria-hidden`); quem lê por leitor de tela recebe o
// texto, que é onde a informação realmente está.
function renderPasswordStrength(senha, email) {
  const forca = passwordStrength(senha, email);
  if (forca.empty) return `<p class="field-hint">Mínimo de 10 caracteres. Uma frase com três ou quatro palavras funciona bem.</p>`;
  return `<div class="pwd-meter" data-score="${forca.score}">
    <span class="pwd-meter__track" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `<i class="pwd-meter__step${i < forca.score ? " is-on" : ""}"></i>`).join("")}
    </span>
    <p class="field-hint pwd-meter__text" role="status">Força: <b>${escapeHtml(forca.label)}</b>${forca.hint ? ` · ${escapeHtml(forca.hint)}` : ""}</p>
  </div>`;
}

function accountDevicesCard(account) {
  const devices = (Array.isArray(account.devices) ? account.devices : [])
    .filter((device) => !device.revokedAt)
    .sort((a, b) => Number(!!b.current) - Number(!!a.current) || new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
  const activeCount = devices.length;
  const rows = devices.map((device) => {
    const type = accountDeviceType(device);
    const current = !!device.current;
    return `<div class="account-device account-device--${type}${current ? " account-device--current" : ""}">
      <span class="account-device__rail" aria-hidden="true"></span>
      <span class="account-device__icon">${svgIcon(ACCOUNT_DEVICE_ICONS[type], 20)}</span>
      <span class="account-device__body">
        <span class="account-device__identity"><strong>${escapeHtml(device.label || "Navegador não identificado")}</strong>${current ? `<span class="account-device__badge">Este aparelho</span>` : ""}</span>
        <small>${escapeHtml(accountDeviceLastSeen(device.lastSeenAt, current))}${device.firstSeenAt ? ` · entrou pela primeira vez em ${escapeHtml(accountDeviceFirstSeen(device.firstSeenAt))}` : ""}</small>
      </span>
      ${current ? "" : `<button class="btn btn--ghost btn--sm account-device__revoke" data-action="account-revoke" data-id="${escapeHtml(device.id)}" ${account.busy ? "disabled" : ""}>Revogar acesso</button>`}
    </div>`;
  }).join("");

  return `<section class="card account-access" aria-labelledby="account-access-title">
    <div class="account-access__header">
      <div class="account-access__heading">
        <p class="eyebrow">Segurança da conta</p>
        <h2 class="card-title" id="account-access-title">Dispositivos com acesso</h2>
        <p class="card-subtitle">Confira onde sua conta está aberta e encerre qualquer acesso que você não reconheça.</p>
      </div>
      <div class="account-access__tools">
        <span class="account-access__count">${escapeHtml(activeCount === 1 ? "1 ativo" : `${activeCount} ativos`)}</span>
        <button class="btn btn--secondary btn--sm account-access__refresh" data-action="account-refresh" ${account.busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Atualizar</button>
      </div>
    </div>
    <div class="account-device-list">${rows || `<p class="account-access__empty">Nenhum dispositivo com acesso.</p>`}</div>
    ${accountRevokeOthersBlock(account, activeCount)}
  </section>`;
}

// [M7] SAIR DE TODOS OS OUTROS APARELHOS.
//
// Só aparece quando há OUTRO aparelho para encerrar: um botão que não tem o que
// fazer é ruído numa tela de segurança, e ruído é o que faz as pessoas pararem
// de ler exatamente a tela em que precisam prestar atenção.
//
// A senha é pedida aqui, e não em `revoke-device`, porque as duas ações têm
// naturezas opostas. Cortar UM acesso estranho é defesa, e defesa precisa ser
// rápida. Derrubar TODOS os outros é ação de dono: quem tomou uma sessão
// emprestada não pode usá-la para expulsar o dono do próprio aparelho.
function accountRevokeOthersBlock(a, ativos) {
  if (ativos < 2) return "";
  const aberto = !!state.accountRevokeOthersOpen;
  const senha = a.form.revokeOthersPassword || "";
  return `<div class="account-access__others">
    <button type="button" class="btn btn--secondary btn--sm" data-action="account-revoke-others-toggle" aria-expanded="${aberto ? "true" : "false"}" aria-controls="account-revoke-others-body" ${a.busy ? "disabled" : ""}>
      ${svgIcon("shieldCheck", 15)} Sair dos outros aparelhos
    </button>
    <div class="account-access__others-body" id="account-revoke-others-body" ${aberto ? "" : "hidden"}>
      <p class="card-subtitle">Encerra o acesso dos outros ${ativos - 1 === 1 ? "aparelho" : `${ativos - 1} aparelhos`} e para a sincronização deles imediatamente. Este aparelho continua conectado. O que já estiver salvo nos outros não é apagado à distância.</p>
      <div class="field">
        <label class="field__label" for="account-revoke-others-password">Sua senha</label>
        <input id="account-revoke-others-password" class="input" type="password" data-field="auth-revoke-others-password" maxlength="128" value="${escapeHtml(senha)}" autocomplete="current-password" />
      </div>
      ${a.revokeOthersHint ? `<p class="account-danger__hint" role="alert">${svgIcon("alertTriangle", 15)} ${escapeHtml(a.revokeOthersHint)}</p>` : ""}
      <button class="btn btn--danger btn--sm" data-action="account-revoke-others" ${a.busy ? "disabled" : ""}>Encerrar os outros acessos</button>
    </div>
  </div>`;
}

// Estado da sincronização em linguagem de usuário. A regra de escrita aqui é
// não assustar: em toda situação de falha o aparelho continua com tudo, e a
// frase precisa dizer isso, senão a pessoa acha que perdeu o extrato.
const ACCOUNT_SYNC_VIEW = {
  syncing:  { icon: "loader",        title: "Sincronizando",            note: "Enviando e recebendo as alterações deste aparelho." },
  synced:   { icon: "checkCircle",   title: "Tudo sincronizado",        note: "" },
  offline:  { icon: "wifi",          title: "Sem conexão",              note: "As alterações ficam guardadas aqui e sobem assim que a rede voltar." },
  error:    { icon: "alertTriangle", title: "Sincronização com falha",  note: "Seus dados continuam completos neste aparelho." },
  idle:     { icon: "clock",         title: "Alterações pendentes",     note: "O envio acontece sozinho em alguns segundos." },
  disabled: { icon: "info",          title: "Sincronização indisponível", note: "Esta publicação não tem o serviço de sincronização configurado." },
};

function accountSyncCard() {
  if (typeof CloudSync === "undefined") return "";
  const sync = CloudSync.status();
  const phase = sync.phase === "idle" && !sync.pending ? "synced" : sync.phase;
  const view = ACCOUNT_SYNC_VIEW[phase] || ACCOUNT_SYNC_VIEW.idle;
  const quando = sync.lastSyncAt ? accountDeviceDate(sync.lastSyncAt) : null;
  const detalhe = sync.error || view.note;
  // A frase que tranquiliza NÃO pode ocupar o lugar da que explica. Quando o
  // servidor manda o motivo, os dois aparecem: o motivo em cima, a garantia de
  // que nada se perdeu embaixo. Antes, um excluía o outro, e no caso de falha o
  // motivo era exatamente o que sumia.
  const garantia = phase === "error" && sync.error ? view.note : "";
  // O caminho saudável é automático. A ação manual só aparece quando houve
  // uma falha e a pessoa precisa de uma saída imediata além da recuperação do
  // próprio motor.
  const podeTentar = phase === "error";
  // A CONFERÊNCIA COMPLETA É UMA SAÍDA, NÃO UMA ROTINA.
  //
  // O ciclo comum é incremental: o cursor diz até onde este aparelho já leu, e
  // o servidor nunca reenvia o que ficou atrás dele. Quando uma operação escapa
  // (marca recusada, gravação desfeita, aba fechada na hora errada), o aparelho
  // fica atrasado sem ter como perceber, e a conta aparece com saldos
  // diferentes em cada navegador. Este botão é o caminho de volta: relê a conta
  // inteira e reoferece a base inteira. Fica sempre à mão porque a pessoa que
  // precisa dele está justamente vendo uma tela que diz "Tudo sincronizado".
  const podeConferir = phase !== "disabled" && phase !== "syncing";
  return `<div class="card account-sync">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--${escapeHtml(phase)}">${svgIcon(view.icon, 18)}</span>
      <div>
        <p class="card-title">${escapeHtml(view.title)}</p>
        ${detalhe ? `<p class="card-subtitle">${escapeHtml(detalhe)}</p>` : ""}
        ${garantia ? `<p class="field-hint">${escapeHtml(garantia)}</p>` : ""}
        ${quando ? `<p class="field-hint">Última sincronização: ${escapeHtml(quando)}</p>` : ""}
        ${phase === "error" && sync.errorCode ? `<p class="field-hint">Código da falha: ${escapeHtml(sync.errorCode)}</p>` : ""}
      </div>
    </div>
    ${podeTentar ? `<button class="btn btn--secondary btn--sm" data-action="account-sync-now">${svgIcon("refresh", 15)} Tentar novamente</button>` : ""}
    ${podeConferir ? `<div class="account-sync__repair">
      <button class="btn btn--secondary btn--sm" data-action="account-reconcile">${svgIcon("refresh", 15)} Conferir a conta inteira</button>
      <p class="field-hint">Use se este aparelho mostrar números diferentes de outro na mesma conta. Ele relê tudo o que está na conta e reapresenta tudo o que está aqui. Nada é apagado dos dois lados: quando o mesmo registro existe nos dois, vence a versão mais recente.</p>
    </div>` : ""}
  </div>`;
}

// Cartão do vínculo entre os dados deste aparelho e a conta.
//
// Ele só mostra CONTAGENS e estado. Nunca a impressão do conteúdo, nunca o UUID
// da conta, nunca o id de um registro: quem está olhando a tela precisa decidir,
// não auditar. E a decisão nunca é gravada por abrir ou fechar o cartão.
function accountLinkParts(resumo) {
  if (!resumo) return "";
  const partes = [];
  if (resumo.transactions) partes.push(plural(resumo.transactions, "lançamento", "lançamentos"));
  if (resumo.accounts) partes.push(plural(resumo.accounts, "conta", "contas"));
  if (resumo.creditCards) partes.push(plural(resumo.creditCards, "cartão", "cartões"));
  if (resumo.accountTransfers) partes.push(plural(resumo.accountTransfers, "transferência", "transferências"));
  if (resumo.cardPayments) partes.push(plural(resumo.cardPayments, "pagamento", "pagamentos"));
  if (resumo.accountAdjustments) partes.push(plural(resumo.accountAdjustments, "conciliação", "conciliações"));
  if (resumo.goals) partes.push(plural(resumo.goals, "meta", "metas"));
  if (resumo.assets) partes.push(plural(resumo.assets, "item de patrimônio", "itens de patrimônio"));
  if (resumo.categories) partes.push(plural(resumo.categories, "categoria personalizada", "categorias personalizadas"));
  if (resumo.monthlyIncome) partes.push("a renda cadastrada");
  const restante = Number(resumo.settings) - (resumo.monthlyIncome ? 1 : 0);
  if (restante > 0) partes.push(plural(restante, "configuração financeira", "configurações financeiras"));
  if (!partes.length) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

const ACCOUNT_LINK_VIEW = {
  checking: { icon: "loader", title: "Conferindo os dados deste aparelho" },
  linking: { icon: "loader", title: "Vinculando dados deste aparelho" },
  linked: { icon: "checkCircle", title: "Dados deste aparelho vinculados" },
  confirm: { icon: "upload", title: "Trazer os dados deste aparelho?" },
  waiting: { icon: "wifi", title: "Vínculo aguardando conexão" },
  pending: { icon: "alertTriangle", title: "Vínculo pendente" },
  dismissed: { icon: "info", title: "Dados deste aparelho separados da conta" },
};

function accountGuestLinkCard() {
  const link = state.account.guestLink || freshGuestLink();
  const view = ACCOUNT_LINK_VIEW[link.phase];
  // `idle` é ausência de trabalho: nenhum cartão, nenhuma pergunta.
  if (!view) return "";
  const conteudo = accountLinkParts(link.summary);
  const busy = !!link.busy || link.phase === "checking" || link.phase === "linking";

  let corpo = "";
  if (link.phase === "confirm") {
    corpo = `<p class="card-subtitle">Este navegador tem ${escapeHtml(conteudo || "dados salvos sem conta")} guardados fora da conta.${
      link.errorCode === "remote_changed"
        ? " A conta recebeu alterações de outro aparelho enquanto isto era preparado."
        : (String(link.remoteRevision || "0") === "0" ? "" : " A conta já tem conteúdo de outro aparelho.")
    }</p>
    <p class="field-hint">Juntar não substitui nem apaga nada: registros diferentes entram por união e, no mesmo registro, vence a versão mais recente. A cópia deste aparelho continua aqui de qualquer forma.</p>`;
  } else if (link.phase === "linked") {
    const stats = link.stats || null;
    corpo = `<p class="card-subtitle">O conteúdo deste aparelho já faz parte da conta e está no servidor.</p>${
      stats ? `<p class="field-hint">Incorporados: ${escapeHtml(plural(Number(stats.added) || 0, "lançamento", "lançamentos"))}, ${escapeHtml(plural(Number(stats.goals) || 0, "meta", "metas"))}, ${escapeHtml(plural(Number(stats.accounts) || 0, "conta", "contas"))}.</p>` : ""
    }`;
  } else if (link.phase === "dismissed") {
    corpo = `<p class="card-subtitle">Você escolheu manter ${escapeHtml(conteudo || "esses dados")} fora da conta. Nada foi apagado.</p>
      <p class="field-hint">Se mudar de ideia, o vínculo continua disponível aqui.</p>`;
  } else if (link.phase === "waiting") {
    corpo = `<p class="card-subtitle">${escapeHtml(link.error || "Sem conexão para conferir a conta.")}</p>
      <p class="field-hint">Nada é presumido sem saber o que a conta já tem. O vínculo termina quando a rede voltar.</p>`;
  } else if (link.phase === "pending") {
    corpo = `<p class="card-subtitle">${escapeHtml(link.error || "O vínculo não foi concluído.")}</p>
      <p class="field-hint">Seus dados continuam completos nos dois lados. A sincronização não aparece como concluída enquanto isto não terminar.</p>
      ${link.errorCode ? `<p class="field-hint">Código da falha: ${escapeHtml(link.errorCode)}</p>` : ""}`;
  } else {
    corpo = `<p class="card-subtitle">Conferindo o que existe aqui e o que a conta já tem, antes de qualquer envio.</p>`;
  }

  let acoes = "";
  if (link.phase === "confirm") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--primary btn--sm" data-action="account-link-confirm" ${busy ? "disabled" : ""}>${svgIcon("upload", 15)} Juntar dados</button>
      <button class="btn btn--secondary btn--sm" data-action="account-link-dismiss" ${busy ? "disabled" : ""}>Manter separados</button>
      <button class="link-btn" data-action="account-link-later">Agora não</button>
    </div>`;
  } else if (link.phase === "pending") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--secondary btn--sm" data-action="account-link-confirm" ${busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Tentar novamente</button>
      <button class="link-btn" data-action="account-link-later">Agora não</button>
    </div>`;
  } else if (link.phase === "dismissed" || link.phase === "waiting") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--secondary btn--sm" data-action="account-link-review" ${busy ? "disabled" : ""}>Vincular dados deste aparelho</button>
    </div>`;
  }

  return `<div class="card account-sync account-link">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--${escapeHtml(link.phase)}">${svgIcon(view.icon, 18)}</span>
      <div>
        <p class="card-title">${escapeHtml(view.title)}</p>
        ${corpo}
      </div>
    </div>
    ${acoes}
  </div>`;
}

function accountSignedIn() {
  const a = state.account;
  return `<div class="card account-profile">
    <div class="account-profile__head"><span class="account-profile__icon">${svgIcon("shieldCheck", 22)}</span><div><p class="eyebrow">Conta conectada</p><h2 class="card-title">${escapeHtml(a.email)}</h2><p class="card-subtitle">A sessão fica em cookie protegido e não entra nos backups financeiros.</p></div></div>
    <button class="btn btn--secondary" data-action="account-logout" ${a.busy ? "disabled" : ""}>Sair desta conta</button>
  </div>
  ${accountSyncCard()}
  ${accountGuestLinkCard()}
  ${a.mode === "password" ? `<div class="card"><p class="card-title">Definir nova senha</p><div class="field"><label class="field__label" for="account-new-password">Nova senha</label><input id="account-new-password" class="input" type="password" data-field="auth-new-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.newPassword)}" autocomplete="new-password" />${renderPasswordStrength(a.form.newPassword, a.email)}</div><button class="btn btn--primary" data-action="account-submit" data-value="password" ${a.busy ? "disabled" : ""}>Salvar nova senha</button></div>` : ""}
  ${accountDevicesCard(a)}
  ${accountDangerCard(a)}`;
}

// O ABERTO/FECHADO MORA NO ESTADO, NÃO NO `<details>`.
//
// Este bloco era um `<details>` nativo. Como `render()` refaz o DOM inteiro e a
// própria tela de conta redesenha sozinha (volta periódica da sincronização,
// atualização da lista de aparelhos, qualquer aviso), o painel se fechava no
// meio da digitação da senha. Quem tentava apagar a conta via o formulário
// sumir sem explicação e concluía, com razão, que o botão não funcionava.
function accountDangerCard(a) {
  const aberto = !!state.accountDangerOpen;
  const pronto = a.form.deleteText === "APAGAR CONTA" && a.form.deletePassword.length >= 10;
  return `<section class="card account-danger${aberto ? " account-danger--open" : ""}">
    <button type="button" class="account-danger__summary" data-action="account-danger-toggle" aria-expanded="${aberto ? "true" : "false"}" aria-controls="account-danger-body">
      <span class="account-danger__row">
        <span class="account-danger__icon">${svgIcon("trash", 18)}</span>
        <span class="account-danger__heading"><span class="card-title">Apagar conta e dados</span><span class="card-subtitle">Exclua a conta e os dados guardados no servidor e neste aparelho.</span></span>
        <span class="account-danger__chevron">${svgIcon("chevronDown", 18)}</span>
      </span>
    </button>
    <div class="account-danger__body" id="account-danger-body" ${aberto ? "" : "hidden"}>
      <p class="card-subtitle">A cópia deste aparelho também será apagada. Outros aparelhos perderão o acesso ao servidor, mas manterão o que já estiver salvo neles.</p>
      <div class="field"><label class="field__label" for="account-delete-password">Senha atual</label><input id="account-delete-password" class="input" type="password" data-field="auth-delete-password" maxlength="128" value="${escapeHtml(a.form.deletePassword)}" autocomplete="current-password" /></div>
      <div class="field"><label class="field__label" for="account-delete-text">Digite APAGAR CONTA</label><input id="account-delete-text" class="input" data-field="auth-delete-text" maxlength="20" value="${escapeHtml(a.form.deleteText)}" autocomplete="off" /></div>
      ${a.deleteHint ? `<p class="account-danger__hint" role="alert">${svgIcon("alertTriangle", 15)} ${escapeHtml(a.deleteHint)}</p>` : ""}
      <button class="btn btn--danger" data-action="account-delete-request" ${a.busy ? "disabled" : ""}>Apagar conta e dados</button>
      ${pronto ? "" : `<p class="card-subtitle account-danger__requisito">Preencha a senha da conta (10 caracteres ou mais) e digite APAGAR CONTA para liberar a exclusão. A frase seguinte, na confirmação, também precisa vir em maiúsculas.</p>`}
    </div>
  </section>`;
}

function renderAccountScreen() {
  const status = accountStatusCard();
  return `<div class="screen screen--narrow">${renderBackHeader("Conta e acesso")}${status}
    ${state.account.configured === false || state.account.loading ? "" : accountPendingCard()}
    ${state.account.configured === false || state.account.loading ? "" : (state.account.authenticated ? accountSignedIn() : accountGuestForm())}
    ${state.account.error ? `<div class="form-error-summary" role="alert">${svgIcon("alertTriangle", 16)} ${escapeHtml(state.account.error)}</div>` : ""}
    ${state.account.message ? `<div class="account-message" role="status">${svgIcon("checkCircle", 16)} ${escapeHtml(state.account.message)}</div>` : ""}
    <p class="footnote">Com a conta conectada, seus lançamentos passam a ser sincronizados entre os aparelhos onde você entrar. A fusão é por união: nada é apagado de um lado pelo outro, e o que você excluir continua excluído em todos.</p>
  </div>`;
}

export {
  ACCOUNT_DEVICE_ICONS,
  ACCOUNT_LINK_VIEW,
  ACCOUNT_SYNC_VIEW,
  ALL_SECTIONS,
  NOTIF_TONE_CLASS,
  SETTINGS_SECTIONS,
  THEME_OPTIONS,
  accountDangerCard,
  accountDeviceDate,
  accountDeviceFirstSeen,
  accountDeviceLastSeen,
  accountDeviceType,
  accountDevicesCard,
  accountGuestForm,
  accountGuestLinkCard,
  accountLinkParts,
  accountPendingCard,
  accountRevokeOthersBlock,
  accountSignedIn,
  accountSignupClosedCard,
  accountSignupOpen,
  accountStatusCard,
  accountSyncCard,
  allScreenMatches,
  backupProtectionAvailable,
  debtStrategyMonths,
  goalMonthlySuggestion,
  notifEmptyHint,
  notifEmptyTitle,
  renderAccountForm,
  renderAccountRow,
  renderAccountScreen,
  renderAccountsAndCards,
  renderAccountsScreen,
  renderAllScreen,
  renderAppearanceSettingsCard,
  renderAssetRow,
  renderBackupCard,
  renderBackupPreview,
  renderBackupProtectForm,
  renderBackupUnlockForm,
  renderBudgetSettingsCard,
  renderBudgetSplitSettingsCard,
  renderBuiltinRulesCard,
  renderCardForm,
  renderCardPaymentForm,
  renderCardRow,
  renderCategoriesSettingsCard,
  renderCreditLimitSettingsCard,
  renderCustomRulesCard,
  renderDataSourcesCenter,
  renderDebtForm,
  renderDebtLate,
  renderDebtList,
  renderDebtPaymentForm,
  renderDebtProjection,
  renderDebtStrategyCard,
  renderDebtsScreen,
  renderEmergencyLadder,
  renderEmergencySettingsCard,
  renderFinanceResult,
  renderGoalCard,
  renderGoalForm,
  renderGoalInflationField,
  renderGoalInflationLine,
  renderGoalsAdviceCard,
  renderGoalsHero,
  renderGoalsPlanCard,
  renderGoalsScreen,
  renderHealthHero,
  renderHealthIndicator,
  renderHealthPlan,
  renderHealthScreen,
  renderIncomeSettingsCard,
  renderLegacyBalance,
  renderLegalControllerField,
  renderLegalDataInventoryGroup,
  renderLegalDataInventoryItem,
  renderLegalRetentionGroup,
  renderLegalThirdParty,
  renderLegalThirdPartyGroup,
  renderMarketRatesCard,
  renderNotifItem,
  renderNotifSettingsCard,
  renderNotificationsScreen,
  renderPasswordStrength,
  renderPortfolioAllocationCard,
  renderPortfolioBenchmarkCard,
  renderPortfolioChartCard,
  renderPortfolioForm,
  renderPortfolioGroups,
  renderPortfolioHero,
  renderPortfolioInsightsCard,
  renderPortfolioRow,
  renderPortfolioScreen,
  renderPrivacyScreen,
  renderProfileSettingsCard,
  renderPurchaseReadings,
  renderReconcileCauseAction,
  renderReconcilePanel,
  renderRuleApplyCard,
  renderRuleForm,
  renderRuleRow,
  renderRuleTesterCard,
  renderRulesScreen,
  renderScoreBreakdown,
  renderSettingsScreen,
  renderSettingsTopic,
  renderSimGoalSelect,
  renderSimLabelField,
  renderSimulateResult,
  renderSimulateScreen,
  renderTransferForm,
  renderWealthAllocationCard,
  renderWealthAnnualCard,
  renderWealthChart,
  renderWealthChartCard,
  renderWealthForm,
  renderWealthGroups,
  renderWealthHero,
  renderWealthInsightsCard,
  renderWealthScreen,
  rulesCategoryOptions,
  settingsOpenSection,
  simLabel,
  themeChoiceLabel,
};
