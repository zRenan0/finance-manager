// js/screens/add.js. Lançamento de transação, avisos de orçamento e entrada em linguagem natural.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// NATUREZA DO LANÇAMENTO
// ==================================================================
// Só aparece quando NÃO é o caso trivial. Perguntar "isto é um gasto?" para
// cada compra de padaria seria atrito puro; o valor está em poder marcar o que
// o app erraria sozinho: um estorno, uma transferência entre contas próprias,
// os juros de uma dívida. Por isso o campo nasce recolhido, com a dedução já
// aplicada, e só se abre quando o usuário quer corrigir.
function renderNatureField(f, isIncome) {
  const atual = normalizeTransactionNature(f.nature, {
    type: isIncome ? "income" : "expense",
    goalId: f.goalId || null,
    debtId: f.debtId || null,
    categoryId: f.categoryId,
  });
  // "Transferência entre contas" não salva um lançamento: ela troca o editor
  // pelo fluxo de conversão, que precisa de um lançamento gravado para
  // substituir. Num cadastro novo a opção seria uma armadilha, e o caminho
  // certo continua sendo a transferência própria da tela de Contas.
  const opcoes = transactionNatureOptions(isIncome ? "income" : "expense")
    .filter((o) => o.id !== "transferencia" || !!state.editingTxId);
  const aberto = !!state.natureFieldOpen;
  const rotulo = TRANSACTION_NATURE_LABELS[atual] || "Gasto";

  if (!aberto) {
    return `
    <button type="button" class="switch-row" data-action="toggle-nature-field" aria-expanded="false">
      <span>Tipo de movimento: <b>${escapeHtml(rotulo)}</b></span>
      <span class="micro">alterar</span>
    </button>`;
  }

  return `
    <fieldset class="field">
      <legend class="field__label">Tipo de movimento</legend>
      <div class="payment-chips" role="radiogroup" aria-label="Tipo de movimento">
        ${opcoes.map((o) => `
          <button type="button" class="payment-chip ${o.id === atual ? "active" : ""}"
            role="radio" aria-checked="${o.id === atual ? "true" : "false"}"
            data-action="set-nature" data-value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</button>`).join("")}
      </div>
      <p class="micro" data-ui-css="margin-top:8px">${escapeHtml(TRANSACTION_NATURE_HINTS[atual] || "")}</p>
    </fieldset>`;
}

// ==================================================================
// CONVERSÃO DE UM LANÇAMENTO EM TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS
// ==================================================================
// Uma transferência de verdade mexe em DUAS contas, e uma transação comum só
// conhece uma. Por isso escolher "Transferência entre contas" na edição não
// grava mais um lançamento de uma ponta só: troca o editor por este fluxo, que
// pede origem e destino e substitui as transações envolvidas por um
// `accountTransfer`, fora de gasto, renda e orçamento.
function transferConversionModel() {
  const f = state.form || {};
  const data = state.data || {};
  const accounts = (data.accounts || []).filter((a) => a && !a.archived);
  const transaction = (data.transactions || []).find((t) => t.id === state.editingTxId) || null;
  const amount = parseMoneyInput(f.amount);
  const known = (id) => accounts.some((a) => a.id === id);
  const fromAccountId = known(f.transferFromAccountId) ? f.transferFromAccountId : "";
  const toAccountId = known(f.transferToAccountId) ? f.transferToAccountId : "";
  const accountsOk = !!fromAccountId && !!toAccountId && fromAccountId !== toAccountId;
  const resolution = transaction && accountsOk
    ? resolveTransferConversionCounterpart(transaction, data.transactions, {
        fromAccountId, toAccountId,
        amount: Number.isFinite(amount) && amount > 0 ? amount : transaction.amount,
        date: f.date || transaction.date,
        description: f.description,
      })
    : { status: "none", matches: [], transaction: null };
  // "none" é a decisão explícita de converter só este lançamento; ela precisa
  // sobreviver a um novo desenho da tela, senão a sugestão automática voltaria
  // a prometer substituir dois.
  const counterpartId = f.transferCounterpartId === "none"
    ? "none"
    : (resolution.matches.some((item) => item.id === f.transferCounterpartId) ? f.transferCounterpartId : "");
  const counterpart = counterpartId && counterpartId !== "none"
    ? resolution.matches.find((item) => item.id === counterpartId)
    : (counterpartId === "none" ? null : resolution.transaction);
  const needsChoice = resolution.status === "ambiguous" && !counterpartId;
  return {
    accounts, transaction, fromAccountId, toAccountId, amount, accountsOk,
    resolution, counterpartId, counterpart, needsChoice,
    enoughAccounts: accounts.length > 1,
    ready: !!transaction && accountsOk && Number.isFinite(amount) && amount > 0 && !needsChoice,
  };
}

function transferAccountOptions(accounts, selectedId, excludeId) {
  return accounts.map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""} ${a.id === excludeId ? "disabled" : ""}>${escapeHtml(a.name)} · ${fmtBRL(accountBalance(state.data, a.id, todayIso()))}</option>`).join("");
}

function transferCounterpartLabel(tx) {
  return `${tx.type === "income" ? "entrada" : "saída"} de ${fmtBRL(tx.amount)} em ${fmtDateFull(tx.date)}${tx.description ? ` · ${tx.description}` : ""}`;
}

function renderTransferConversionScreen() {
  const f = state.form;
  const m = transferConversionModel();

  return `<div class="screen screen--narrow add-form">
    <div class="screen-header">
      <h1 class="page-title">Converter em transferência</h1>
      <button class="icon-btn icon-btn--muted" data-action="cancel-edit" aria-label="Fechar">${svgIcon("x", 18)}</button>
    </div>

    <div class="origin-chip">${svgIcon("info", 14)}<span>Uma transferência entre suas contas sai de uma e entra na outra. Ela não conta como gasto nem como renda.</span></div>

    <div class="amount-input-wrap">
      <p class="field__label center">Valor</p>
      <div class="amount-row">
        <span class="amount-currency" data-ui-css="color:var(--ink-soft)">R$</span>
        <input id="tx-amount-input" data-field="tx-amount" class="amount-field" data-ui-css="color:var(--ink)"
          value="${escapeHtml(f.amount)}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="tx-date-input">Data</label>
      <input id="tx-date-input" type="date" class="input" data-field="tx-date" value="${f.date}" />
    </div>

    ${m.enoughAccounts ? `
    <div class="field">
      <label class="field__label" for="tx-transfer-from-select">Conta de origem</label>
      <select id="tx-transfer-from-select" class="input" data-action-select="tx-transfer-from">
        <option value="">Escolha a conta que envia</option>
        ${transferAccountOptions(m.accounts, m.fromAccountId, m.toAccountId)}
      </select>
    </div>

    <div class="field">
      <label class="field__label" for="tx-transfer-to-select">Conta de destino</label>
      <select id="tx-transfer-to-select" class="input" data-action-select="tx-transfer-to">
        <option value="">Escolha a conta que recebe</option>
        ${transferAccountOptions(m.accounts, m.toAccountId, m.fromAccountId)}
      </select>
    </div>` : `<div class="origin-chip">${svgIcon("alertTriangle", 14)}<span>Uma transferência precisa de duas contas ativas. Cadastre a outra conta para converter este lançamento.</span><button class="btn btn--ghost btn--sm" data-action="nav" data-tab="accounts">Cadastrar</button></div>`}

    <div class="field">
      <label class="field__label" for="tx-desc-input">Descrição (opcional)</label>
      <input id="tx-desc-input" class="input" data-field="tx-description" value="${escapeHtml(f.description)}" placeholder="Ex: Pix para a reserva" autocomplete="off" />
    </div>

    ${renderTransferCounterpartBlock(m)}

    ${renderNatureField(f, f.type === "income")}

    ${state.editingTxId ? `<button class="btn btn--danger btn--block" data-action="delete-tx" data-id="${state.editingTxId}" data-ui-css="margin-top:14px">${svgIcon("trash", 16)} Excluir lançamento</button>` : ""}

    <div id="form-warnings-slot"></div>
    <p class="micro" id="tx-transfer-hint">${m.ready
      ? "As duas contas mudam de saldo; nenhum gasto e nenhuma renda são criados."
      : "Escolha o valor e duas contas ativas diferentes para converter."}</p>

    <div class="submit-bar">
      <button id="tx-submit-btn" class="btn btn--block btn--primary" data-action="submit-tx" aria-describedby="tx-transfer-hint">
        Converter em transferência
      </button>
    </div>
  </div>`;
}

// A promessa da tela e o que a gravação faz têm de ser a mesma coisa. Com uma
// única candidata dá para dizer qual lançamento some junto; com várias, o app
// não escolhe sozinho: ou a pessoa aponta a outra ponta, ou diz que só este
// lançamento vira transferência.
function renderTransferCounterpartBlock(m) {
  if (!m.accountsOk || !m.transaction) return "";
  if (m.resolution.status === "ambiguous") {
    return `<div class="field">
      <label class="field__label" for="tx-transfer-counterpart-select">Outra ponta desta transferência</label>
      <select id="tx-transfer-counterpart-select" class="input ${m.needsChoice ? "input--error" : ""}" data-action-select="tx-transfer-counterpart">
        <option value="">Escolha o lançamento correspondente</option>
        ${m.resolution.matches.map((tx) => `<option value="${tx.id}" ${tx.id === m.counterpartId ? "selected" : ""}>${escapeHtml(transferCounterpartLabel(tx))}</option>`).join("")}
        <option value="none" ${m.counterpartId === "none" ? "selected" : ""}>Converter somente este lançamento</option>
      </select>
      <p class="field-hint">${m.needsChoice
        ? `Existem ${m.resolution.matches.length} lançamentos que combinam com esta transferência. Escolha qual é a outra ponta antes de converter.`
        : (m.counterpartId === "none" ? "Só o lançamento em edição será substituído." : "O lançamento escolhido também será substituído pela transferência.")}</p>
    </div>`;
  }
  if (m.counterpart) {
    return `<div class="origin-chip">${svgIcon("info", 14)}<span>A ${escapeHtml(transferCounterpartLabel(m.counterpart))} também será substituída por esta transferência.</span></div>`;
  }
  return `<p class="field-hint">Só este lançamento será substituído. A outra conta recebe o efeito da transferência mesmo sem um lançamento correspondente.</p>`;
}

// ==================================================================
// ADD / EDIT TRANSACTION
// ==================================================================
function isTxFormValid() {
  const f = state.form;
  const amt = parseMoneyInput(f.amount);
  const hasAccounts = (state.data.accounts || []).some((a) => !a.archived);
  const hasCards = (state.data.creditCards || []).some((c) => !c.archived);
  const destinationOk = !hasAccounts || (f.type === "expense" && f.payment === "Crédito"
    ? (!hasCards || !!f.creditCardId)
    : !!f.accountId);
  return Number.isFinite(amt) && amt > 0 && (f.type === "income" || !!f.categoryId) && destinationOk;
}

// A origem chega em dois formatos: string (rascunho da frase em linguagem
// natural, que nunca passou por normalizeTransactionOrigin) e objeto
// `{channel,label,reference}` (lançamento já gravado, vindo de extrato ou QR).
// Interpolar o objeto direto imprimia "[object Object]" na tela de edição de
// TODO lançamento importado; a leitura tem de sair do `label`.
function txOriginChipText(origin) {
  if (!origin) return "";
  if (typeof origin === "string") return origin.trim();
  const label = String(origin.label || "").trim();
  const reference = String(origin.reference || "").trim();
  if (!label) return reference;
  return reference ? `${label} · ${reference}` : label;
}

function renderAddScreen() {
  const f = state.form;
  // A conversão tem outras regras, outros campos e outro botão. Tentar
  // acomodá-la dentro do editor comum devolveria uma tela com categoria,
  // parcelas e "Salvar alterações" para algo que não é gasto nem renda.
  if (state.editingTxId && f.nature === "transferencia") return renderTransferConversionScreen();
  const valid = isTxFormValid();
  const editing = !!state.editingTxId;
  const isIncome = f.type === "income";
  const amt = parseMoneyInput(f.amount);

  return `<div class="screen screen--narrow add-form ${isIncome ? "add-form--income" : "add-form--expense"}">
    <div class="screen-header">
      <h1 class="page-title">${editing ? "Editar lançamento" : (isIncome ? "Nova receita" : "Novo gasto")}</h1>
      <button class="icon-btn icon-btn--muted" data-action="cancel-edit" aria-label="Fechar">${svgIcon("x", 18)}</button>
    </div>

    ${txOriginChipText(f.origin) ? `<div class="origin-chip">${svgIcon("scan", 14)}<span>${escapeHtml(txOriginChipText(f.origin))}; confira os dados antes de salvar</span></div>` : ""}

    <div class="add-form__badge">
      <span class="add-form__badge-icon">${svgIcon(isIncome ? "trendUp" : "arrowDownRight", 22)}</span>
    </div>

    <div class="segmented segmented--type">
      <button class="segmented__option ${f.type === "expense" ? "active" : ""}" data-action="set-type" data-value="expense">Gasto</button>
      <button class="segmented__option segmented__option--income ${isIncome ? "active" : ""}" data-action="set-type" data-value="income">Receita</button>
    </div>

    <div class="amount-input-wrap">
      <p class="field__label center">Valor</p>
      <div class="amount-row">
        <span class="amount-currency" data-ui-css="color:${isIncome ? "var(--positive)" : "var(--ink-soft)"}">R$</span>
        <input id="tx-amount-input" data-field="tx-amount" class="amount-field" data-ui-css="color:${isIncome ? "var(--positive)" : "var(--ink)"}"
          value="${escapeHtml(f.amount)}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
      </div>
    </div>

    ${isIncome ? `
      <div class="field">
        <p class="field__label">Fonte da receita</p>
        <div class="payment-chips">
          ${INCOME_SOURCES.map((s) => `<button class="payment-chip payment-chip--income ${f.description === s ? "active" : ""}" data-action="select-income-source" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
        </div>
      </div>
    ` : `
      <div class="field" id="tx-category-group" tabindex="-1">
        <div class="field__label-row">
          <p class="field__label">Categoria</p>
          <button class="field__link" data-action="nav" data-tab="categories">${svgIcon("layout", 13)} Organizar categorias</button>
        </div>
        <div class="chip-grid">
          ${topLevelCategories(state.data).map((c) => {
            const children = childCategories(state.data, c.id);
            const selectedChild = children.find((ch) => ch.id === f.categoryId);
            const isSelected = f.categoryId === c.id || !!selectedChild;
            const hasChildren = children.length > 0;
            // Com subcategoria escolhida o rótulo mostra o caminho inteiro, não só o
            // nome do filho. Trocar "Alimentação" por "Mercado" fazia a fila de chips
            // virar "Moradia, Mercado, Transporte": dois níveis da taxonomia lado a
            // lado, sem nada que diga qual é qual, e o pai escolhido sumia da tela.
            // categoryFullName é o mesmo formato já usado no seletor de regras e no
            // rascunho do lançamento. O ícone continua sendo o do filho, que é o que
            // confirma a escolha de dentro do seletor.
            return `
            <button class="chip ${isSelected ? "active" : ""}" ${isSelected ? `data-ui-css="border-color:${c.color}; background:color-mix(in srgb, ${c.color} 10%, transparent)"` : ""} data-action="${hasChildren ? "open-category-picker" : "select-category"}" data-id="${c.id}">
              <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${c.color} 14%, transparent); color:${c.color}">${svgIcon(selectedChild ? selectedChild.icon : c.icon, 17)}</span>
              <span class="chip__label">${escapeHtml(selectedChild ? categoryFullName(state.data, selectedChild.id) : c.name)}</span>
              ${hasChildren ? `<span class="chip__caret">${svgIcon("chevronDown", 11)}</span>` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>
    `}

    <div class="field-row">
      <div class="field">
        <label class="field__label" for="tx-date-input">Data</label>
        <input id="tx-date-input" type="date" class="input" data-field="tx-date" value="${f.date}" />
      </div>
      ${!isIncome ? `
      <div class="field">
        <p class="field__label">Pagamento</p>
        <div class="payment-chips">
          ${PAYMENT_METHODS.map((p) => `<button class="payment-chip ${f.payment === p ? "active" : ""}" data-action="select-payment" data-value="${p}">${escapeHtml(p)}</button>`).join("")}
        </div>
      </div>` : `
      <div class="field">
        <label class="field__label" for="tx-payment-select">Recebido via</label>
        <div class="payment-chips">
          ${PAYMENT_METHODS.map((p) => `<button class="payment-chip payment-chip--income ${f.payment === p ? "active" : ""}" data-action="select-payment" data-value="${p}">${escapeHtml(p)}</button>`).join("")}
        </div>
      </div>`}
    </div>

    ${(() => {
      const accounts = (state.data.accounts || []).filter((a) => !a.archived);
      const cards = (state.data.creditCards || []).filter((c) => !c.archived);
      if (!accounts.length) return `<div class="origin-chip">${svgIcon("info",14)}<span>Cadastre uma conta para o saldo representar o banco de verdade. Este lançamento ficará no histórico anterior.</span><button class="btn btn--ghost btn--sm" data-action="nav" data-tab="accounts">Cadastrar</button></div>`;
      if (!isIncome && f.payment === "Crédito") return `<div class="field"><label class="field__label" for="tx-card-select">Cartão</label><select id="tx-card-select" class="input" data-action-select="tx-card"><option value="">Escolha o cartão</option>${cards.map((c) => `<option value="${c.id}" ${f.creditCardId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>${cards.length ? `<p class="field-hint">A compra entra na fatura e não reduz o saldo da conta agora.</p>` : `<p class="field-hint">Cadastre um cartão em Contas e cartões.</p>`}</div>`;
      return `<div class="field"><label class="field__label" for="tx-account-select">${isIncome ? "Conta que recebeu" : "Conta usada"}</label><select id="tx-account-select" class="input" data-action-select="tx-account"><option value="">Escolha a conta</option>${accounts.map((a) => `<option value="${a.id}" ${f.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)} · ${fmtBRL(accountBalance(state.data,a.id,todayIso()))}</option>`).join("")}</select></div>`;
    })()}

    ${!isIncome && f.payment === "Crédito" && !editing ? `
    <div class="field">
      <p class="field__label">Parcelas</p>
      <div class="installments-grid">
        ${Array.from({ length: 12 }, (_, i) => i + 1).map((n) => `
          <button type="button" class="installment-chip ${Number(f.installments) === n ? "active" : ""}" data-action="select-installments" data-value="${n}">${n}x</button>
        `).join("")}
      </div>
      <p class="field-hint installment-hint">${amt > 0
        ? (Number(f.installments) > 1
            ? `${Number(f.installments)}x de <strong>${fmtBRL(splitMoney(amt, Number(f.installments))[0])}</strong>; lançado em ${Number(f.installments)} meses a partir de ${fmtDateFull(f.date)} (soma exata de ${fmtBRL(amt)})`
            : `À vista. <strong>${fmtBRL(amt)}</strong> lançado em ${fmtDateFull(f.date)}`)
        : "Informe o valor para ver a simulação das parcelas"}</p>
    </div>` : ""}

    <div class="field">
      <label class="field__label" for="tx-desc-input">Descrição ${isIncome ? "" : "(opcional)"}</label>
      <input id="tx-desc-input" class="input" data-field="tx-description" value="${escapeHtml(f.description)}" placeholder="${isIncome ? "Ex: Salário de julho" : "Ex: Mercado do mês"}" autocomplete="off" />
    </div>

    ${!isIncome ? `
    <button class="switch-row ${f.recurring ? "active" : ""}" data-action="toggle-recurring">
      <span>Gasto fixo mensal (recorrente)</span>
      <span class="switch ${f.recurring ? "active" : ""}"><span class="switch__knob"></span></span>
    </button>` : ""}

    ${renderNatureField(f, isIncome)}

    ${editing ? `<button class="btn btn--danger btn--block" data-action="delete-tx" data-id="${state.editingTxId}" data-ui-css="margin-top:14px">${svgIcon("trash", 16)} Excluir lançamento</button>` : ""}

    <div id="form-warnings-slot">${renderFormWarnings()}</div>

    <div class="submit-bar">
      <button id="tx-submit-btn" class="btn btn--block ${isIncome ? "btn--positive" : "btn--primary"}" data-action="submit-tx">
        ${editing ? "Salvar alterações" : (isIncome ? "Salvar receita" : "Salvar gasto")}
      </button>
    </div>
  </div>`;
}

// ==================================================================
// TARGETED PATCH HELPERS (evita re-render total durante digitação)
// ==================================================================
// Bloco de avisos do formulário: junta o aviso da Regra x/x/x com os alertas de
// ORÇAMENTO POR CATEGORIA (Feature 3). Ambos são informativos; nunca bloqueiam
// o lançamento; a decisão é sempre do usuário.
function renderFormWarnings() {
  const f = state.form;
  if (f.type === "income" || state.editingTxId) return "";
  const amt = parseMoneyInput(f.amount);
  if (!(amt > 0)) return "";

  const budget = evaluateBudgetImpact(state.data, f.categoryId, amt, keyOfCurrentMonth());
  const split = computeSplitWarning(f.categoryId, amt);

  return renderBudgetImpactBlock(budget) + renderSplitWarningBlock(split);
}

// Mostra, ao vivo, para onde este gasto leva o teto da categoria escolhida.

function renderBudgetImpactBlock(impact) {
  if (!impact || !impact.affected || impact.affected.length === 0) return "";
  const th = impact.thresholds || { warn: 80, over: 100 };

  return impact.affected.map((e) => {
    const meta = e.levelMeta || {};
    const crossed = e.levelAfter !== e.levelBefore && e.levelAfter !== "ok";
    const tone = e.levelAfter === "over" ? "over" : e.levelAfter === "warn" ? "warn" : "ok";
    const pctShown = clamp(e.pctAfter, 0, 100);
    const pctBefore = clamp(e.pctBefore, 0, 100);
    return `<div class="budget-impact budget-impact--${tone}">
      <div class="budget-impact__head">
        <span class="budget-impact__icon" data-ui-css="color:${meta.color || "var(--ink-soft)"}">${svgIcon(e.levelAfter === "ok" ? "target" : "alertTriangle", 16)}</span>
        <div class="budget-impact__title">
          <strong>${escapeHtml(e.fullName)}${e.inherited ? " (categoria principal)" : ""}</strong>
          <span>${e.levelAfter === "over"
            ? `Estoura o teto de ${fmtBRL(e.budget)} em <b>${fmtBRL(e.over)}</b>.`
            : `Fica em <b>${Math.round(e.pctAfter)}%</b> do teto de ${fmtBRL(e.budget)}; restam ${fmtBRL(Math.max(0, e.remaining))}.`}</span>
        </div>
        ${crossed ? `<span class="budget-impact__flag" data-ui-css="background:${meta.soft}; color:${meta.color}">${e.levelAfter === "over" ? "Estoura agora" : `Passa de ${th.warn}%`}</span>` : ""}
      </div>
      <div class="progress progress--stacked">
        <div class="progress__fill progress__fill--ghost" data-ui-css="width:${pctBefore}%"></div>
        <div class="progress__fill" data-ui-css="width:${pctShown}%; background:${meta.color || "var(--brand)"}"></div>
      </div>
    </div>`;
  }).join("");
}

function renderSplitWarningBlock(splitWarning) {
  if (!splitWarning) return "";
  return `<div class="split-warning">
    ${svgIcon("alertTriangle", 17, "split-warning__icon")}
    <div class="split-warning__text">
      <strong>Essa compra passa do combinado para "${splitWarning.groupLabel}"</strong>
      <span>Com esse gasto, o grupo chega a ${fmtBRL(splitWarning.newSpent)} este mês. ${fmtBRL(splitWarning.over)} acima dos ${splitWarning.pct}% da renda (${fmtBRL(splitWarning.allocated)}) combinados. Você decide se quer seguir mesmo assim.</span>
    </div>
  </div>`;
}

// Recalcula os avisos não-obstrutivos sem re-renderizar a tela inteira (o campo
// de valor usa patch pontual para não perder o foco do teclado ao digitar).
function patchFormWarnings() {
  const slot = document.getElementById("form-warnings-slot");
  if (!slot) return;
  slot.innerHTML = renderFormWarnings();
}

function patchSubmitButton() {
  const btn = document.getElementById("tx-submit-btn");
  if (btn) btn.dataset.formReady = isTxFormValid() ? "true" : "false";
}

function patchTxHistory() {
  const el = document.getElementById("tx-history-section");
  if (el) el.innerHTML = renderTxHistorySection();
}

// ==================================================================
// FEATURE 4. LANÇAMENTO INTELIGENTE (linguagem natural)
// ==================================================================
// Fluxo: o usuário escreve → parser LOCAL (nlp.js) devolve rascunhos → a tela
// mostra o que entendeu em forma de "chips" editáveis → o usuário confirma.
// Nada é gravado sem confirmação, porque errar a categoria de um gasto é mais
// caro do que um toque a mais na tela.
function renderQuickEntryCard() {
  const n = state.nlp;
  const hasDrafts = n.drafts.length > 0;
  return `<div class="card card--quick-entry span-3 span-mt">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Lançamento rápido</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Escreva do seu jeito; eu transformo em lançamento</p>
      </div>
    </div>

    <div class="quick-entry-row">
      <label class="sr-only" for="nlp-input">Descreva o lançamento em uma frase</label>
      <input id="nlp-input" class="input quick-entry-input" data-field="nlp-text"
        value="${escapeHtml(n.text)}" placeholder="Ex: gastei 30 no ifood"
        autocomplete="off" enterkeyhint="done" />
      <button id="nlp-parse-btn" class="btn btn--primary quick-entry-btn" data-action="nlp-parse" ${n.text.trim() && !n.loading ? "" : "disabled"}>
        ${n.loading ? `<span class="spinner spinner--light"></span>` : svgIcon("arrowUpRight", 16)}
        <span class="quick-entry-btn__label">Entender</span>
      </button>
    </div>

    ${!hasDrafts && !n.error ? `<div class="quick-entry-examples">
      ${NLP_EXAMPLES.slice(0, 3).map((ex) => `<button class="quick-entry-example" data-action="nlp-example" data-value="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`).join("")}
    </div>` : ""}

    ${n.error ? `<div class="inline-error">
      ${svgIcon("alertTriangle", 16)}
      <div><p class="inline-error__title">${escapeHtml(n.error)}</p></div>
      <button class="icon-btn icon-btn--muted" data-action="nlp-clear" aria-label="Limpar lançamento rápido">${svgIcon("x", 14)}</button>
    </div>` : ""}

    ${hasDrafts ? renderNaturalDrafts(n.drafts) : ""}
  </div>`;
}

function renderNaturalDrafts(drafts) {
  const valid = drafts.filter((d) => d.amount > 0);
  const lowConfidence = drafts.some((d) => d.confidence < 0.6);
  return `<div class="nlp-drafts">
    ${drafts.map((d, i) => renderNaturalDraft(d, i)).join("")}

    ${lowConfidence ? `<button class="nlp-refine" data-action="nlp-ai-refine">
      ${svgIcon("sparkles", 13)} Não ficou certo? Pedir ajuda da IA para entender melhor
    </button>` : ""}

    <div class="nlp-actions">
      <button class="btn btn--ghost btn--sm" data-action="nlp-clear">Cancelar</button>
      <button class="btn btn--primary btn--sm" data-action="nlp-confirm" ${valid.length ? "" : "disabled"}>
        ${svgIcon("check", 15)} Lançar ${valid.length > 1 ? `${valid.length} itens` : ""}
      </button>
    </div>
  </div>`;
}

function renderNaturalDraft(d, index) {
  const cat = categoryById(state.data, d.categoryId);
  const isIncome = d.type === "income";
  const needsCategory = !isIncome && d.categorySource === "padrao";
  const confidenceLabel = d.confidence >= 0.8 ? "alta" : d.confidence >= 0.55 ? "média" : "baixa";
  const impact = !isIncome && d.amount > 0
    ? evaluateBudgetImpact(state.data, d.categoryId, d.amount, monthKeyOf(d.date))
    : null;
  const crossing = impact && impact.crossings.length ? impact.crossings[0] : null;

  return `<div class="nlp-draft ${d.amount > 0 ? "" : "nlp-draft--invalid"}">
    <div class="nlp-draft__head">
      <span class="icon-bubble ${isIncome ? "icon-bubble--income" : ""}" ${isIncome ? "" : `style="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}"`}>
        ${svgIcon(isIncome ? "trendUp" : cat.icon, 17)}
      </span>
      <div class="nlp-draft__info">
        <p class="nlp-draft__title">${escapeHtml(d.description || (isIncome ? "Receita" : cat.name))}</p>
        <p class="nlp-draft__meta">${isIncome ? "Receita" : escapeHtml(categoryFullName(state.data, d.categoryId))} · ${fmtDateShort(d.date)} · ${escapeHtml(d.payment)}${d.installments > 1 ? ` · ${d.installments}x` : ""}${d.recurring ? " · fixo" : ""}</p>
      </div>
      <p class="nlp-draft__amount ${isIncome ? "tx-amount--income" : "tx-amount--expense"}">${d.amount > 0 ? `${isIncome ? "+" : "-"}${fmtBRL(d.amount)}` : "sem valor"}</p>
      <button class="icon-btn" data-action="nlp-remove-draft" data-id="${index}" aria-label="Remover">${svgIcon("x", 14)}</button>
    </div>

    <div class="nlp-draft__tags">
      <span class="nlp-tag nlp-tag--${confidenceLabel === "alta" ? "ok" : confidenceLabel === "média" ? "mid" : "low"}">confiança ${confidenceLabel}</span>
      ${d.categorySource === "historico" ? `<span class="nlp-tag">categoria do seu histórico</span>` : ""}
      ${d.categorySource === "verbo" || d.categorySource === "dicionario" ? `<span class="nlp-tag">categoria deduzida</span>` : ""}
      ${d.matched && d.matched.date ? `<span class="nlp-tag">data reconhecida</span>` : ""}
      ${d.amount <= 0 ? `<span class="nlp-tag nlp-tag--low">faltou o valor</span>` : ""}
      <button class="nlp-tag nlp-tag--action" data-action="nlp-edit-draft" data-id="${index}">${svgIcon("pencil", 11)} ajustar tudo</button>
    </div>

    ${needsCategory ? `<div class="nlp-draft__picker">
      <p class="field__label" data-ui-css="margin-bottom:6px">Não identifiquei a categoria; escolha uma:</p>
      <div class="nlp-cat-chips">
        ${topLevelCategories(state.data).slice(0, 8).map((c) => `<button class="cat-group-chip" data-action="nlp-set-category" data-index="${index}" data-id="${c.id}">
          <span data-ui-css="color:${c.color}">${svgIcon(c.icon, 12)}</span>${escapeHtml(c.name)}
        </button>`).join("")}
      </div>
    </div>` : ""}

    ${crossing ? `<p class="nlp-draft__budget" data-ui-css="color:${crossing.levelMeta.color}">
      ${svgIcon("alertTriangle", 12)} ${escapeHtml(budgetCrossingMessage(crossing, impact.thresholds))}
    </p>` : ""}
  </div>`;
}

// Patch pontual do botão (evita re-render que roubaria o foco do teclado).

function patchNlpButton() {
  const btn = document.getElementById("nlp-parse-btn");
  if (btn) btn.disabled = !state.nlp.text.trim() || state.nlp.loading;
}

function patchQrSaveButton() {
  const btn = document.querySelector('[data-action="qr-save"]');
  if (btn && state.qr.draft) btn.disabled = !(parseMoneyInput(state.qr.draft.amount) > 0);
}

function runNaturalEntryParse() {
  const text = state.nlp.text.trim();
  if (!text) return;
  const drafts = parseNaturalEntries(text, state.data);
  if (drafts.length === 0 || drafts.every((d) => !d.amount)) {
    state.nlp.drafts = drafts;
    state.nlp.error = drafts.length === 0
      ? "Não consegui entender essa frase. Tente algo como “gastei 30 no ifood”."
      : "Entendi o gasto, mas não achei o valor. Inclua o número (ex: “ifood 30”).";
    render();
    return;
  }
  state.nlp.drafts = drafts;
  state.nlp.error = null;
  render();
}

// Segunda opinião opcional da IA; só a frase e os NOMES das categorias saem do
// aparelho (ver netlify/functions/analyze.js, modo "lancamento").
function refineNaturalEntryWithAi() {
  const text = state.nlp.text.trim();
  if (!text) return;
  if (normalizePrivacy(state.data.privacy).aiSharing === "blocked") {
    notify("Envios para IA estão bloqueados em Privacidade", "warn");
    return;
  }
  requestConfirmation({
    title: "Enviar a frase para análise?",
    message: "A frase digitada e os nomes das suas categorias serão enviados para um serviço externo de IA. Nenhum histórico financeiro será enviado.",
    confirmLabel: "Analisar frase",
    icon: "sparkles",
    onConfirm: async () => {
      state.nlp.loading = true;
      state.nlp.error = null;
      render();
      try {
        const remote = await requestNaturalEntryParse(text, state.data.categories);
        const merged = {
          ...(state.nlp.drafts[0] || {}),
          original: text,
          type: remote.tipo === "income" ? "income" : "expense",
          amount: roundMoney(remote.valor),
          categoryId: remote.categoriaId || "outros",
          date: remote.data || todayIso(),
          payment: remote.pagamento || "Outro",
          description: remote.descricao || "",
          recurring: !!remote.recorrente,
          installments: clamp(Number(remote.parcelas) || 1, 1, 48),
          confidence: Number(remote.confianca) || 0.7,
          categorySource: "ia",
          missing: [],
          matched: { date: true, payment: true, installments: (Number(remote.parcelas) || 1) > 1, recurring: !!remote.recorrente },
        };
        state.nlp.drafts = [merged];
        state.nlp.loading = false;
        render();
        notify("Interpretação refinada pela IA");
      } catch (err) {
        if (typeof reportSafeError === "function") reportSafeError("ai", err, "ai_request");
        state.nlp.loading = false;
        state.nlp.error = (err && err.message) || "Não foi possível usar a IA agora.";
        render();
      }
    },
  });
}

function applyNaturalDraftToForm(draft) {
  state.form = {
    type: draft.type,
    amount: draft.amount > 0 ? draft.amount.toFixed(2).replace(".", ",") : "",
    categoryId: draft.type === "expense" ? draft.categoryId : null,
    date: draft.date,
    payment: draft.payment,
    description: draft.description || "",
    recurring: !!draft.recurring,
    installments: String(draft.installments || 1),
    source: "nlp",
    origin: "Escrito em linguagem natural",
    accountId: defaultCashAccountId() || "",
    creditCardId: (((state.data.creditCards || []).find((c) => !c.archived)) || {}).id || "",
  };
  state.editingTxId = null;
}

function commitNaturalDrafts() {
  const drafts = state.nlp.drafts.filter((d) => d.amount > 0);
  if (drafts.length === 0) return;

  // Avalia o impacto nos tetos ANTES de gravar (mesma razão do formulário comum).

  const impacts = drafts
    .filter((d) => d.type === "expense")
    .map((d) => evaluateBudgetImpact(state.data, d.categoryId, d.amount, monthKeyOf(d.date)));

  const firstCard = ((state.data.creditCards || []).find((c) => !c.archived) || {}).id || null;
  const newTxs = drafts.flatMap((d) => transactionsFromNaturalEntry(d)).map((t) => ({
    ...t,
    accountId: t.payment === "Crédito" ? null : defaultCashAccountId(),
    creditCardId: t.payment === "Crédito" ? firstCard : null,
  }));
  setData((d) => ({ ...d, transactions: [...d.transactions, ...newTxs] }));
  state.nlp = { text: "", drafts: [], error: null, loading: false, touched: false };
  notify(newTxs.length === 1 ? "Lançamento salvo" : `${newTxs.length} lançamentos salvos`);
  impacts.forEach((imp) => announceBudgetCrossings(imp));
}
