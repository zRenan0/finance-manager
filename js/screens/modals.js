// js/screens/modals.js. Camadas sobrepostas: seletor de subcategoria, leitor de QR e resumo do mês.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function renderAssistantLauncher() {
  if (state.contextualAssistant.open || state.calculationDetail || state.confirmation) return "";
  return `<button class="assistant-launcher" data-action="assistant-open" aria-label="Abrir o Assistente financeiro">${svgIcon("sparkles", 20)}<span>Assistente financeiro</span></button>`;
}

function renderContextualAssistantModal() {
  const model = buildContextualAssistant(state.data, state.tab, { simId:state.sim.id });
  const selected = model.items.find((item) => item.id === state.contextualAssistant.responseId);
  return `<div class="modal-overlay" data-action="assistant-close">
    <div class="modal-sheet assistant-dialog" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      <div class="modal-header"><span class="icon-bubble">${svgIcon("sparkles",18)}</span><div><p class="card-title" id="assistant-title">Assistente financeiro em ${escapeHtml(model.screenLabel)}</p><p class="card-subtitle">Respostas calculadas neste aparelho</p></div><button class="icon-btn" data-action="assistant-close" aria-label="Fechar">${svgIcon("x",16)}</button></div>
      <div class="assistant-questions">${model.items.map((item) => `<button class="assistant-question ${selected && selected.id === item.id ? "is-selected" : ""}" data-action="assistant-question" data-id="${item.id}">${escapeHtml(item.question)}${svgIcon("chevronRight",14)}</button>`).join("")}</div>
      ${selected ? `<div class="assistant-answer" role="status"><p class="field__label">Resposta local</p><p>${escapeHtml(selected.answer)}</p>${selected.action ? `<button class="btn btn--primary btn--sm" data-action="assistant-action" data-id="${selected.id}">${svgIcon(selected.action.kind === "calculation" ? "info" : "arrowRight",14)} ${escapeHtml(selected.action.label)}</button>` : ""}</div>` : `<p class="assistant-hint">Escolha uma pergunta. O Assistente financeiro usa somente os dados que já estão no aplicativo.</p>`}
      <p class="footnote">Este painel não envia dados para uma IA externa. A análise externa, quando usada, continua pedindo sua confirmação.</p>
    </div>
  </div>`;
}

function renderCalculationModal() {
  const detail = state.calculationDetail || { id:"net-worth" };
  let context = {};
  if (detail.id === "forecast") context.forecast = forecastModel();
  if (detail.id === "goals") context.goals = goalsModel();
  if (detail.id === "debts") context.debts = debtsModel();
  if (detail.id === "simulator") {
    const spec = simSpecOf(state.sim.id);
    context = {
      title: `${spec.label}: como foi calculado`,
      premises: (spec.options || []).concat(spec.fields || []).map((field) => `${field.label}: ${simRaw(state.sim.id, field.key)}${field.suffix ? ` ${field.suffix}` : ""}`),
    };
  }
  const explanation = calculationExplanation(state.data, detail.id, context);
  return `<div class="modal-overlay" data-action="calculation-close">
    <div class="modal-sheet calculation-dialog" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="calculation-title">
      <div class="modal-header"><span class="icon-bubble">${svgIcon("info",18)}</span><div><p class="card-title" id="calculation-title">${escapeHtml(explanation.title)}</p><p class="card-subtitle">Método, atualização e premissas</p></div><button class="icon-btn" data-action="calculation-close" aria-label="Fechar">${svgIcon("x",16)}</button></div>
      ${renderCalculationKinds(explanation.kinds)}
      <p class="calculation-summary">${escapeHtml(explanation.summary)}</p>
      <dl class="calculation-facts"><div><dt>Atualizado</dt><dd>${escapeHtml(formatMovementTimestamp(explanation.updatedAt))}</dd></div><div><dt>Fórmula</dt><dd>${escapeHtml(explanation.formula)}</dd></div></dl>
      <div class="calculation-premises"><p class="field__label">Premissas utilizadas</p><ul>${explanation.premises.map((premise) => `<li>${escapeHtml(premise)}</li>`).join("")}</ul></div>
      <div class="calculation-legend">${explanation.kinds.map((id) => { const meta = CALCULATION_KIND[id]; return `<p>${svgIcon(meta.icon,13)} <b>${meta.label}:</b> ${escapeHtml(meta.note)}</p>`; }).join("")}</div>
    </div>
  </div>`;
}

function renderConfirmationModal() {
  const c = state.confirmation;
  if (!c) return "";
  return `<div class="modal-overlay confirmation-overlay" data-action="confirmation-cancel">
    <div class="modal-sheet confirmation-dialog" data-stop-close="1" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
      <span class="confirmation-dialog__icon ${c.tone === "danger" ? "confirmation-dialog__icon--danger" : ""}" aria-hidden="true">${svgIcon(c.icon, 22)}</span>
      <div class="confirmation-dialog__copy">
        <p class="card-title" id="confirmation-title">${escapeHtml(c.title)}</p>
        <p class="card-subtitle" id="confirmation-message">${escapeHtml(c.message)}</p>
        ${c.requiredText ? `<div class="field" data-ui-css="margin-top:14px">
          <label class="field__label" for="confirmation-required-input">Digite ${escapeHtml(c.requiredText)} para confirmar</label>
          <input id="confirmation-required-input" class="input" data-field="confirmation-required" value="${escapeHtml(c.typedText || "")}" autocomplete="off" data-validate="text" aria-describedby="confirmation-required-help" />
          <p class="field-hint" id="confirmation-required-help">${c.typedText === c.requiredText
            ? "Confirmação conferida."
            : `O botão libera quando o campo tiver exatamente ${escapeHtml(c.requiredText)}.`}</p>
        </div>` : ""}
      </div>
      <div class="confirmation-dialog__actions">
        <button type="button" class="btn btn--ghost" data-action="confirmation-cancel" autofocus>${escapeHtml(c.cancelLabel)}</button>
        ${c.alternateLabel ? `<button type="button" class="btn btn--secondary" data-action="confirmation-alternate">${svgIcon(c.alternateIcon, 15)} ${escapeHtml(c.alternateLabel)}</button>` : ""}
        <button type="button" class="btn ${c.tone === "danger" ? "btn--danger" : "btn--primary"}" data-action="confirmation-accept" ${c.requiredText && c.typedText !== c.requiredText ? "disabled" : ""}>${svgIcon(c.tone === "danger" ? "trash" : "check", 15)} ${escapeHtml(c.confirmLabel)}</button>
      </div>
    </div>
  </div>`;
}

function renderMovementDetailModal() {
  const entry = movementEntries(state.data).find((item) => item.id === state.movementDetailId);
  if (!entry) return "";
  const source = movementSourceMeta(entry.source, entry.origin);
  const actionLabels = { created: "Criado", edited: "Editado", reviewed: "Revisado", converted: "Convertido" };
  const fieldLabels = { type: "tipo", amount: "valor", categoryId: "categoria", date: "data", payment: "pagamento", description: "descrição", recurring: "recorrência", accountId: "conta", creditCardId: "cartão", goalId: "meta", debtId: "dívida" };
  const history = entry.changeLog || [];
  return `<div class="modal-overlay" data-action="movement-detail-close">
    <div class="modal-sheet movement-detail" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="movement-detail-title">
      <div class="modal-header"><span class="icon-bubble">${svgIcon(source.icon, 18)}</span><div><p class="card-title" id="movement-detail-title">Origem e histórico</p><p class="card-subtitle">${escapeHtml(entry.description)}</p></div><button class="icon-btn" data-action="movement-detail-close" aria-label="Fechar">${svgIcon("x", 16)}</button></div>
      <dl class="movement-detail__facts"><div><dt>Origem</dt><dd>${escapeHtml(source.label)}</dd></div>${entry.origin && entry.origin.reference ? `<div><dt>Referência</dt><dd>${escapeHtml(entry.origin.reference)}</dd></div>` : ""}<div><dt>Criado em</dt><dd>${escapeHtml(formatMovementTimestamp(entry.createdAt))}</dd></div><div><dt>Atualizado em</dt><dd>${escapeHtml(formatMovementTimestamp(entry.updatedAt))}</dd></div></dl>
      <p class="card-title">Alterações</p>
      ${history.length ? `<ol class="movement-history">${[...history].reverse().map((item) => `<li><span class="movement-history__dot"></span><div><b>${actionLabels[item.action] || "Alterado"}</b><small>${escapeHtml(formatMovementTimestamp(item.at))}${item.fields && item.fields.length ? `, ${escapeHtml(item.fields.map((field) => fieldLabels[field] || "decisão de revisão").join(", "))}` : ""}</small></div></li>`).join("")}</ol>` : renderEmptyState("clock", "Sem alterações registradas")}
    </div>
  </div>`;
}

// UMA DATA PURA NÃO TEM HORA, E NÃO É UTC.
//
// Esta função recebe dois formatos: carimbos completos (`createdAt`,
// `updatedAt`, `changeLog[].at`) e datas puras (`lastMovementAt`, que guarda o
// `date` do lançamento). `new Date("2026-08-20")` é lido como meia-noite UTC e,
// em qualquer fuso brasileiro, volta um dia: o lançamento de 20/08 aparecia
// como "19/08/2026, 21:00". A hora, além de deslocada, era inventada: o campo
// nunca teve hora. Agora data pura é formatada como data, e só carimbo completo
// mostra horário. O meio-dia local preserva o dia em qualquer fuso, inclusive
// nas viradas de horário de verão.
function formatMovementTimestamp(value) {
  const bruto = String(value == null ? "" : value).trim();
  if (!bruto) return "Data não disponível";
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(bruto);
  const date = new Date(somenteData ? `${bruto}T12:00:00` : bruto);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  return somenteData
    ? date.toLocaleDateString("pt-BR", { dateStyle: "short" })
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function renderReviewCardPaymentModal() {
  const draft = state.movementReviewCard;
  if (!draft || !draft.txId) return "";
  const tx = state.data.transactions.find((item) => item.id === draft.txId);
  if (!tx) return "";
  const accounts = (state.data.accounts || []).filter((account) => !account.archived);
  const cards = (state.data.creditCards || []).filter((card) => !card.archived);
  return `<div class="modal-overlay" data-action="review-card-payment-close">
    <div class="modal-sheet" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="review-card-title">
      <div class="modal-header"><span class="icon-bubble">${svgIcon("creditCard", 18)}</span><div><p class="card-title" id="review-card-title">Converter em pagamento de fatura</p><p class="card-subtitle">${escapeHtml(tx.description)}, ${fmtBRL(tx.amount)}</p></div><button class="icon-btn" data-action="review-card-payment-close" aria-label="Fechar">${svgIcon("x", 16)}</button></div>
      ${accounts.length && cards.length ? `<div class="field"><label class="field__label" for="review-payment-account">Conta usada no pagamento</label><select id="review-payment-account" class="input" data-action-select="review-payment-account">${accounts.map((account) => `<option value="${account.id}" ${draft.accountId === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}</select></div><div class="field"><label class="field__label" for="review-payment-card">Cartão pago</label><select id="review-payment-card" class="input" data-action-select="review-payment-card">${cards.map((card) => `<option value="${card.id}" ${draft.creditCardId === card.id ? "selected" : ""}>${escapeHtml(card.name)}</option>`).join("")}</select></div><p class="health-note">O lançamento importado será substituído pelo pagamento de fatura. As compras no cartão continuam sendo as despesas reais.</p><div class="modal-actions"><button class="btn btn--ghost" data-action="review-card-payment-close">Cancelar</button><button class="btn btn--primary" data-action="review-card-payment-confirm">Converter</button></div>` : `<div class="inline-alert">Cadastre ao menos uma conta e um cartão ativos antes de converter.</div><button class="btn btn--secondary btn--block" data-action="review-card-payment-close">Fechar</button>`}
    </div>
  </div>`;
}

// Modal/dropdown flutuante para escolher a subcategoria de uma categoria principal,
// evitando poluir a tela de lançamento com todas as subcategorias de uma vez.
function renderCategoryPickerModal() {
  const parent = categoryById(state.data, state.categoryPickerFor);
  if (!parent) return "";
  const children = childCategories(state.data, parent.id);
  const f = state.form;
  return `<div class="modal-overlay" data-action="close-category-picker">
    <div class="modal-sheet cat-picker-sheet" role="dialog" aria-modal="true" aria-label="Escolher subcategoria de ${escapeHtml(parent.name)}">
      <div class="cat-picker-header">
        <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${parent.color} 14%, transparent); color:${parent.color}">${svgIcon(parent.icon, 18)}</span>
        <div class="cat-picker-header__text">
          <p class="card-title" data-ui-css="margin:0">${escapeHtml(parent.name)}</p>
          <p class="card-subtitle" data-ui-css="margin:2px 0 0">Escolha uma subcategoria</p>
        </div>
        <button class="icon-btn icon-btn--muted" data-action="close-category-picker" aria-label="Fechar">${svgIcon("x", 16)}</button>
      </div>
      <div class="cat-picker-list">
        <button class="cat-picker-option ${f.categoryId === parent.id ? "active" : ""}" data-action="select-category" data-id="${parent.id}">
          <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${parent.color} 14%, transparent); color:${parent.color}">${svgIcon(parent.icon, 16)}</span>
          <span>Geral <span class="cat-picker-option__hint">(sem subcategoria)</span></span>
          ${f.categoryId === parent.id ? svgIcon("checkCircle", 16) : ""}
        </button>
        ${children.map((c) => `
          <button class="cat-picker-option ${f.categoryId === c.id ? "active" : ""}" data-action="select-category" data-id="${c.id}">
            <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${c.color} 14%, transparent); color:${c.color}">${svgIcon(c.icon, 16)}</span>
            <span>${escapeHtml(c.name)}</span>
            ${f.categoryId === c.id ? svgIcon("checkCircle", 16) : ""}
          </button>`).join("")}
      </div>
    </div>
  </div>`;
}

// ==================================================================
// QR DE NOTA FISCAL (NFC-e / NF-e)
// ==================================================================
function renderQrModal() {
  const q = state.qr;
  return `<div class="modal-overlay" data-action="close-qr">
    <div class="modal-sheet" data-stop-close="1" role="dialog" aria-modal="true" aria-label="Ler QR Code">
      <div class="settings-row-header modal-header">
        <p class="card-title" data-ui-css="margin:0">Ler QR Code (Pix ou nota fiscal)</p>
        <button class="icon-btn" data-action="close-qr" aria-label="Fechar">${svgIcon("x", 16)}</button>
      </div>
      ${q.draft ? renderQrResult(q.draft) : `
        ${!QrScanner.isSupported() ? `
          <div class="empty-state"><span class="empty-state__icon">${svgIcon("camera", 26)}</span>
            <p class="empty-state__title">Leitura de QR não suportada neste navegador.</p>
            <p class="empty-state__subtitle">Tente pelo Chrome/Edge no Android, ou lance o gasto manualmente.</p>
          </div>` : `
          <div class="qr-video-wrap">
            <video id="qr-video" playsinline muted></video>
            <div class="qr-frame"></div>
          </div>
          <p class="card-subtitle" data-ui-css="text-align:center">${q.checking ? "Lendo os dados do código…" : "Aponte a câmera para o QR do Pix (copia e cola) ou do cupom fiscal"}</p>
          ${q.error ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} ${escapeHtml(q.error)}</p>` : ""}
        `}
      `}
    </div>
  </div>`;
}

// Resultado da leitura: o app já entendeu o código e mostra o que extraiu, para
// o usuário conferir antes de qualquer coisa ser gravada.
function renderQrResult(d) {
  const cat = categoryById(state.data, d.categoryId);
  const isPix = d.kind === "pix";
  const amountKnown = !!(d.amount && parseMoneyInput(d.amount) > 0);
  return `
    <div class="qr-result-head">
      <span class="qr-result-badge ${isPix ? "qr-result-badge--pix" : ""}">${svgIcon(isPix ? "bolt" : "file", 14)} ${isPix ? "Pix / BR Code" : "Nota fiscal"}</span>
      ${isPix && d.dynamic ? `<span class="qr-result-badge">Cobrança dinâmica</span>` : ""}
      ${d.crcOk === false ? `<span class="qr-result-badge qr-result-badge--warn">${svgIcon("alertTriangle", 12)} Integridade não confirmada</span>` : ""}
    </div>

    ${state.qr.error ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} ${escapeHtml(state.qr.error)}</p>` : ""}

    ${!amountKnown ? `<p class="card-subtitle" data-ui-css="margin-top:0">${isPix
      ? "Este é um Pix sem valor fixo (quem paga escolhe o valor). Informe abaixo quanto foi pago."
      : "O portal da nota não liberou o valor para leitura automática. Informe abaixo o total do cupom."}</p>` : ""}

    <div class="qr-fields">
      <div class="field">
        <label class="field__label" for="qr-amount-input">Valor</label>
        <div class="amount-row amount-row--compact">
          <span class="amount-currency">R$</span>
          <input id="qr-amount-input" data-field="qr-amount" class="amount-field amount-field--sm" value="${escapeHtml(d.amount || "")}" inputmode="decimal" placeholder="0,00" />
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="qr-estab-input">${isPix ? "Recebedor" : "Estabelecimento"}</label>
        <input id="qr-estab-input" class="input" data-field="qr-estab" value="${escapeHtml(d.description || "")}" placeholder="${isPix ? "Nome de quem recebeu" : "Nome da loja"}" />
      </div>
    </div>

    ${d.pixKey ? `<p class="qr-meta">${svgIcon("shieldCheck", 12)} Chave Pix: <b>${escapeHtml(d.pixKey)}</b>${d.txid ? ` · id ${escapeHtml(d.txid)}` : ""}</p>` : ""}
    ${d.chave ? `<p class="qr-meta">${svgIcon("shieldCheck", 12)} Chave de acesso: <b>${escapeHtml(d.chave.slice(0, 12))}…${escapeHtml(d.chave.slice(-6))}</b></p>` : ""}

    <div class="field">
      <p class="field__label">Categoria ${d.categorySource === "historico" ? `<span class="field__label-tag">sugerida pelo seu histórico</span>` : d.categorySource === "dicionario" ? `<span class="field__label-tag">sugerida pelo recebedor</span>` : ""}</p>
      <div class="chip-grid chip-grid--compact">
        ${topLevelCategories(state.data).map((c) => `<button class="chip ${d.categoryId === c.id ? "active" : ""}" data-ui-css="${d.categoryId === c.id ? `border-color:${c.color}; background:color-mix(in srgb, ${c.color} 10%, transparent)` : ""}" data-action="qr-select-category" data-id="${c.id}">
          <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${c.color} 14%, transparent); color:${c.color}">${svgIcon(c.icon, 16)}</span>
          <span class="chip__label">${escapeHtml(c.name)}</span>
        </button>`).join("")}
      </div>
      ${cat.parentId ? `<p class="field-hint">Selecionado: ${escapeHtml(categoryFullName(state.data, d.categoryId))}</p>` : ""}
    </div>

    <div class="qr-actions">
      <button class="btn btn--secondary" data-action="qr-to-form">${svgIcon("pencil", 15)} Abrir no formulário</button>
      <button class="btn btn--primary" data-action="qr-save" ${parseMoneyInput(d.amount) > 0 ? "" : "disabled"}>${svgIcon("check", 15)} Salvar gasto</button>
    </div>
  `;
}

// ==================================================================
// RESUMO MENSAL "WRAPPED"
// ==================================================================
function renderWrappedModal() {
  return `<div class="modal-overlay" data-action="close-wrapped">
    <div class="modal-sheet modal-sheet--wrapped" data-stop-close="1" role="dialog" aria-modal="true" aria-label="Resumo do mês">
      <div class="settings-row-header">
        <p class="card-title" data-ui-css="margin:0">Resumo do mês</p>
        <button class="icon-btn" data-action="close-wrapped" aria-label="Fechar">${svgIcon("x", 16)}</button>
      </div>
      <div class="wrapped-canvas-wrap"><canvas id="wrapped-canvas"></canvas></div>
      <div class="settings-actions">
        <button class="btn btn--primary btn--block" data-action="wrapped-share">${svgIcon("upload", 16)} Compartilhar / Salvar imagem</button>
      </div>
    </div>
  </div>`;
}
