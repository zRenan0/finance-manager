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
    const expanded = state.debtsUi.expandedId === d.id;
    const paid = model.payments.filter((p) => p.debtId === d.id).sort((a,b) => b.date.localeCompare(a.date));
    return `<div class="debt-row ${expanded ? "is-open" : ""}"><button class="debt-row__main" data-action="debt-toggle" data-id="${d.id}" aria-expanded="${expanded}"><span class="debt-rank">${index + 1}</span><span class="debt-row__text"><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.creditor || DEBT_TYPE_LABELS[d.debtType] || "Dívida")} · ${rate.known ? `${rate.annualPct.toFixed(2)}% a.a. ${rate.source === "cet" ? "CET" : "efetivos"}` : "custo não informado"}</small></span><span class="debt-row__values"><b>${fmtBRL(d.value)}</b><small>${d.monthlyPayment > 0 ? `${fmtBRL(d.monthlyPayment)}/mês` : "sem parcela mínima"}</small></span>${svgIcon(expanded ? "chevronUp" : "chevronDown",15)}</button>
      ${expanded ? `<div class="debt-row__detail"><div class="debt-facts"><div><span>Próximo vencimento</span><b>${due ? fmtDateFull(due) : "Não informado"}</b></div><div><span>Saldo conferido</span><b>${d.balanceCheckedAt ? fmtDateFull(d.balanceCheckedAt) : "Nunca"}</b></div><div><span>Situação</span><b>${d.debtStatus === "negotiating" ? "Em negociação" : "Ativa"}</b></div></div>
        ${model.staleIds.includes(d.id) ? `<div class="inline-alert inline-alert--warn">Saldo sem conferência há mais de 60 dias. Atualize ao registrar o próximo pagamento.</div>` : ""}
        ${model.simulation.negativeAmortizationIds.includes(d.id) ? `<div class="inline-alert inline-alert--danger">A parcela pode ser menor ou igual aos juros do mês. O saldo pode não cair.</div>` : ""}
        ${paid.length ? `<div class="debt-payment-history"><p class="field__label">Pagamentos vinculados</p>${paid.slice(0,5).map((p) => `<div><span>${fmtDateShort(p.date)}</span><b>${fmtBRL(p.amount)}</b></div>`).join("")}</div>` : ""}
        <div class="form-actions"><button class="btn btn--primary btn--sm" data-action="debt-payment-open" data-id="${d.id}">${svgIcon("checkCircle",14)} Registrar pagamento</button><button class="btn btn--ghost btn--sm" data-action="debt-edit" data-id="${d.id}">${svgIcon("pencil",14)} Editar</button><button class="btn btn--ghost btn--sm" data-action="debt-delete" data-id="${d.id}">${svgIcon("trash",14)} Excluir</button></div>
      </div>` : ""}</div>`;
  }).join("")}</div></div>`;
}

function renderDebtsScreen() {
  const model = debtsModel();
  const s = model.simulation;
  const warningCount = s.unknownRateIds.length + s.missingPaymentIds.length + s.negativeAmortizationIds.length + model.staleIds.length;
  return `<div class="screen"><div class="screen-header"><div class="back-header"><button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft",19)}</button><div><h1 class="page-title">Central de Dívidas</h1><p class="card-subtitle">Um plano baseado nos mesmos saldos do Patrimônio</p></div></div><button class="btn btn--primary btn--sm" data-action="debt-new">${svgIcon("plus",15)} Dívida</button></div>
    <div class="grid-dashboard"><div class="card card--hero span-3 debt-hero"><div class="hero-glow"></div><div class="hero-label-row"><p class="hero-label">Saldo devedor total</p>${renderCalculationButton("debts")}</div><p class="hero-value">${fmtBRL(model.totalBalance)}</p>${model.estimatedDebtFreeAt ? `<p class="hero-reserved">${svgIcon("calendar",14)} Quitação estimada em ${fmtDateFull(model.estimatedDebtFreeAt)}</p>` : ""}<div class="hero-chips"><div class="hero-chip"><div><span class="hero-chip__label">Parcelas mínimas</span><span class="hero-chip__value">${fmtBRL(model.monthlyPayment)}</span></div></div><div class="hero-chip"><div><span class="hero-chip__label">Comprometimento da renda</span><span class="hero-chip__value">${model.burdenPct == null ? "Sem renda" : `${model.burdenPct.toFixed(1)}%`}</span></div></div><div class="hero-chip ${warningCount ? "hero-chip--warn" : "hero-chip--save"}"><div><span class="hero-chip__label">Pontos a revisar</span><span class="hero-chip__value">${warningCount}</span></div></div></div></div>
      ${renderDebtForm()}${renderDebtPaymentForm(model)}
      ${model.debts.length ? renderDebtProjection(model) : ""}
      ${model.debts.length ? `<div class="card span-1"><p class="card-title">Comparação</p><div class="debt-compare"><div><span>Avalanche</span><b>${model.avalanche.months == null ? "Sem prazo" : `${model.avalanche.months} meses`}</b><small>Prioriza o maior custo</small></div><div><span>Bola de neve</span><b>${model.snowball.months == null ? "Sem prazo" : `${model.snowball.months} meses`}</b><small>Prioriza o menor saldo</small></div></div>${model.shortTermCards.due > 0 || model.shortTermCards.future > 0 ? `<div class="inline-alert">Cartões à parte: ${fmtBRL(model.shortTermCards.due)} em faturas abertas e ${fmtBRL(model.shortTermCards.future)} futuras. Só cadastre aqui se a fatura virou rotativo ou parcelamento.</div>` : ""}</div>` : ""}
      ${renderDebtList(model)}
    </div></div>`;
}
