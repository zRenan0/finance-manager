"use strict";

function showFormErrors(errors, summary) {
  if (typeof window !== "undefined" && window.CofreUI) window.CofreUI.forms.show(errors);
  notify(summary || Object.values(errors)[0] || "Revise os campos indicados", "warn");
}

function removeTransactionsWithIntegrity(data, ids) {
  const idSet = new Set(ids || []);
  let next = data;
  (data.transactions || []).filter((tx) => idSet.has(tx.id)).forEach((tx) => {
    next = applyGoalTransactionMutation(next, tx, null);
  });
  return {
    ...next,
    transactions: (next.transactions || []).filter((tx) => !idSet.has(tx.id)),
    graveyard: withTombstones(next.graveyard, "transactions", Array.from(idSet)),
  };
}

function transferConversionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Substitui uma ou duas transações comuns por um único movimento interno. Esta
// é a fronteira que garante que marcar "transferência" nunca produza só uma
// etiqueta em cima de gasto ou renda.
function convertTransactionToAccountTransfer(data, transactionId, draft) {
  const source = data || {};
  const input = draft || {};
  const transaction = (source.transactions || []).find((item) => item.id === transactionId);
  if (!transaction) throw transferConversionError("TRANSFER_TRANSACTION_MISSING", "O lançamento não existe mais.");

  const activeAccounts = (source.accounts || []).filter((account) => account && !account.archived);
  const activeIds = new Set(activeAccounts.map((account) => account.id));
  const fromAccountId = input.fromAccountId || "";
  const toAccountId = input.toAccountId || "";
  if (!activeIds.has(fromAccountId) || !activeIds.has(toAccountId) || fromAccountId === toAccountId) {
    throw transferConversionError("TRANSFER_ACCOUNT_INVALID", "Escolha duas contas ativas e diferentes.");
  }

  const amount = input.amount == null ? transaction.amount : roundMoney(input.amount);
  if (!(amount > 0) || !moneyWithinMax(amount)) {
    throw transferConversionError("TRANSFER_AMOUNT_INVALID", "Informe um valor válido para a transferência.");
  }
  const date = isRealIsoDate(String(input.date || "")) ? input.date : transaction.date;
  const description = input.description == null ? transaction.description : input.description;
  const resolution = resolveTransferConversionCounterpart(transaction, source.transactions, {
    fromAccountId, toAccountId, amount, date, description,
  });

  let counterpart = null;
  if (input.counterpartId && input.counterpartId !== "none") {
    counterpart = resolution.matches.find((item) => item.id === input.counterpartId) || null;
    if (!counterpart) throw transferConversionError("TRANSFER_COUNTERPART_INVALID", "A outra ponta escolhida não corresponde mais ao lançamento.");
  } else if (input.counterpartId !== "none" && resolution.status === "unique") {
    counterpart = resolution.transaction;
  } else if (input.counterpartId !== "none" && resolution.status === "ambiguous") {
    throw transferConversionError("TRANSFER_COUNTERPART_AMBIGUOUS", "Escolha qual lançamento representa a outra ponta da transferência.");
  }

  const removedIds = [transaction.id, counterpart && counterpart.id].filter(Boolean);
  const primaryOrigin = transaction.origin || (counterpart && counterpart.origin) || null;
  const transfer = makeAccountTransfer({
    fromAccountId,
    toAccountId,
    amount,
    date,
    description: description || "Transferência",
    sourceTransactionIds: removedIds,
    origin: {
      channel: "transfer",
      label: primaryOrigin && primaryOrigin.label ? `Conversão de ${primaryOrigin.label}` : "Conversão de lançamento",
      reference: primaryOrigin && primaryOrigin.reference ? primaryOrigin.reference : null,
      importedAt: primaryOrigin && primaryOrigin.importedAt ? primaryOrigin.importedAt : new Date().toISOString(),
    },
  }, activeAccounts);
  if (!transfer) throw transferConversionError("TRANSFER_ACCOUNT_INVALID", "Não foi possível montar a transferência com essas contas.");

  const cleaned = removeTransactionsWithIntegrity(source, removedIds);
  return {
    data: { ...cleaned, accountTransfers: [...(cleaned.accountTransfers || []), transfer] },
    transfer,
    removedIds,
    counterpartStatus: resolution.status,
  };
}

// Preenche as duas pontas da conversão com o que dá para deduzir do próprio
// lançamento: a conta vinculada fica do lado que o tipo indica (saída na
// origem, entrada no destino) e, havendo uma única outra conta ativa, ela é a
// única outra ponta possível. O que não dá para deduzir fica em branco, para a
// pessoa escolher; nada é gravado por dedução.
function transferConversionDefaults(form, transaction, accounts) {
  const active = (accounts || []).filter((account) => account && !account.archived);
  const known = (id) => active.some((account) => account.id === id);
  const linked = transaction && known(transaction.accountId) ? transaction.accountId : "";
  const isIncome = (form && form.type) === "income";
  let fromAccountId = known(form && form.transferFromAccountId) ? form.transferFromAccountId : "";
  let toAccountId = known(form && form.transferToAccountId) ? form.transferToAccountId : "";
  if (linked && !fromAccountId && !toAccountId) {
    if (isIncome) toAccountId = linked; else fromAccountId = linked;
  }
  const others = active.filter((account) => account.id !== linked);
  if (linked && others.length === 1) {
    if (!fromAccountId && others[0].id !== toAccountId) fromAccountId = others[0].id;
    else if (!toAccountId && others[0].id !== fromAccountId) toAccountId = others[0].id;
  }
  if (fromAccountId && fromAccountId === toAccountId) toAccountId = "";
  return { transferFromAccountId: fromAccountId, transferToAccountId: toAccountId, transferCounterpartId: "" };
}

// Gravação da conversão. Fica fora de `submit-tx` porque não compartilha nada
// com o caminho comum: não avalia orçamento, não atualiza uma transação e não
// pode gravar pela metade. Ou sai uma transferência com as duas pontas certas,
// ou a tela volta com o erro no campo que precisa de correção.
function commitTransferConversion() {
  const f = state.form;
  const txId = state.editingTxId;
  const model = typeof transferConversionModel === "function" ? transferConversionModel() : null;
  const amount = parseMoneyInput(f.amount);
  if (!model || !model.transaction) {
    notify("O lançamento não existe mais", "warn");
    state.editingTxId = null; state.editingTxReturnTab = "dashboard"; state.form = freshTxForm();
    setState({ tab: "dashboard" });
    return;
  }
  if (!model.enoughAccounts) {
    notify("Cadastre duas contas ativas para registrar uma transferência", "warn");
    return;
  }
  if (!model.accountsOk) {
    showFormErrors({
      "tx-transfer-from-select": model.fromAccountId ? "" : "Escolha a conta de origem.",
      "tx-transfer-to-select": model.toAccountId && model.toAccountId !== model.fromAccountId
        ? "" : "Escolha uma conta de destino diferente da origem.",
    }, "Escolha duas contas ativas e diferentes");
    return;
  }
  if (model.needsChoice) {
    showFormErrors({ "tx-transfer-counterpart-select": "Escolha qual lançamento é a outra ponta, ou converta somente este." },
      "Mais de um lançamento combina com esta transferência");
    return;
  }

  let result = null;
  try {
    result = convertTransactionToAccountTransfer(state.data, txId, {
      fromAccountId: model.fromAccountId,
      toAccountId: model.toAccountId,
      amount,
      date: f.date,
      description: f.description,
      counterpartId: model.counterpartId || undefined,
    });
  } catch (error) {
    const code = error && error.code;
    if (code === "TRANSFER_AMOUNT_INVALID") showFormErrors({ "tx-amount-input": error.message }, error.message);
    else if (code === "TRANSFER_ACCOUNT_INVALID") showFormErrors({ "tx-transfer-from-select": error.message, "tx-transfer-to-select": error.message }, error.message);
    else if (code === "TRANSFER_COUNTERPART_AMBIGUOUS" || code === "TRANSFER_COUNTERPART_INVALID") showFormErrors({ "tx-transfer-counterpart-select": error.message }, error.message);
    else if (code === "TRANSFER_TRANSACTION_MISSING") notify(error.message, "warn");
    else throw error;
    if (code === "TRANSFER_TRANSACTION_MISSING") {
      state.editingTxId = null; state.editingTxReturnTab = "dashboard"; state.form = freshTxForm();
      setState({ tab: "dashboard" });
    }
    return;
  }

  setData(result.data);
  const returnTab = state.editingTxReturnTab || "dashboard";
  state.editingTxId = null;
  state.editingTxReturnTab = "dashboard";
  state.form = freshTxForm();
  setState({ tab: returnTab });
  notify(result.removedIds.length > 1
    ? "Transferência criada; os dois lançamentos saíram de gastos e receitas"
    : "Transferência criada; ela não conta como gasto nem como renda");
}

// actions.js: traduz cliques da interface em mudanças de estado e comandos.
// Carregado antes de app.js; as dependências são consultadas somente no clique.
function commitDebtPayment(p) {
  const amount = parseMoneyInput(p.amount);
  const balance = parseMoneyInput(p.newBalance);
  const debt = (state.data.assets || []).find((d) => d.id === p.debtId && d.kind === "liability");
  if (!debt) { notify("A dívida não existe mais"); return; }
  const tx = makeTransaction({ type:"expense", amount, date:p.date, categoryId:p.categoryId || "outros", accountId:p.accountId || null, debtId:p.debtId, payment:p.accountId ? "Débito" : "Outro", description:`Pagamento: ${debt.name}`, source:"manual" });
  setData((data) => ({
    ...data,
    transactions:[...(data.transactions || []),tx],
    assets:Number.isFinite(balance) && p.newBalance !== "" ? data.assets.map((a) => a.id === p.debtId ? updateDebtBalance(a,balance,p.date) : a) : data.assets,
  }));
  state.debtsUi.payment = null;
  notify("Pagamento vinculado à dívida");
}

function onClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  // A tela passou para as mãos da pessoa. Daqui em diante o assistente de
  // boas-vindas não pode mais abrir sozinho por cima do que ela está fazendo.
  if (typeof marcarAppEmUso === "function") marcarAppEmUso();
  if (btn.classList.contains("modal-overlay") && e.target !== btn) return; // ignora clique dentro do modal
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const value = btn.dataset.value;

  switch (action) {
    case "calculation-open":
      state.calculationDetail = { id: id || "net-worth" };
      openOverlay("calculation"); render(); break;
    case "calculation-close": dismissOverlay("calculation"); break;
    case "assistant-open":
      state.contextualAssistant = { open:true, responseId:null };
      openOverlay("assistant"); render(); break;
    case "assistant-close": dismissOverlay("assistant"); break;
    case "assistant-question": state.contextualAssistant.responseId = id; render(); break;
    case "assistant-action": {
      const model = buildContextualAssistant(state.data, state.tab, { simId:state.sim.id });
      const item = model.items.find((candidate) => candidate.id === id);
      const target = item && item.action;
      if (!target) break;
      if (target.kind === "calculation") {
        state.contextualAssistant = { open:false, responseId:null };
        state.overlayStack = [];
        if (NavHistory.supported()) {
          const currentRoute = NavHistory.current();
          NavHistory.replace(state.tab, [], currentRoute.depth);
        }
        state.calculationDetail = { id:target.calculationId || "net-worth" };
        openOverlay("calculation"); render(); break;
      }
      state.contextualAssistant = { open:false, responseId:null };
      state.overlayStack = [];
      if (NavHistory.supported()) {
        const currentRoute = NavHistory.current();
        NavHistory.replace(state.tab, [], currentRoute.depth);
      }
      if (target.kind === "simulator") {
        const values = { ...state.sim.values };
        Object.entries(target.values || {}).forEach(([key, raw]) => { if (raw !== "" && raw != null) values[`${target.simId}.${key}`] = String(raw); });
        state.sim = { id:target.simId || "juros", values };
        setState({ tab:"simulators" });
      } else {
        if (target.kind === "accounts-sources") state.accountsUi.view = "sources";
        setState({ tab:target.tab || "dashboard" });
      }
      break;
    }
    case "confirmation-cancel": dismissOverlay("confirmation"); break;
    case "confirmation-accept":
      if (!state.confirmation || state.confirmation.choice) break;
      if (state.confirmation.requiredText && state.confirmation.typedText !== state.confirmation.requiredText) break;
      state.confirmation.accepted = true;
      state.confirmation.choice = "confirm";
      btn.disabled = true;
      dismissOverlay("confirmation");
      break;
    case "confirmation-alternate":
      if (!state.confirmation || state.confirmation.choice || !state.confirmation.alternateLabel) break;
      state.confirmation.choice = "alternate";
      btn.disabled = true;
      dismissOverlay("confirmation");
      break;
    case "dismiss-storage-warning": setState({ storageWarningDismissed: true }); break;
    // ---- Configuração inicial (4 passos) ----
    case "onb-next": if (onbCanAdvance(state.onboarding.step)) { state.onboarding.step = Math.min(4, state.onboarding.step + 1); render(); } break;
    case "onb-back": state.onboarding.step = Math.max(1, state.onboarding.step - 1); render(); break;
    case "onb-skip-account": state.onboarding.skipAccount = !state.onboarding.skipAccount; render(); break;
    case "onb-split": {
      const preset = ONB_SPLIT_PRESETS.find((x) => x.id === value);
      if (preset) { state.onboarding.split = { necessidade: preset.necessidade, desejo: preset.desejo, futuro: preset.futuro }; render(); }
      break;
    }
    case "onb-focus":
      state.onboarding.focus = normalizeDashboardFocus(value);
      render();
      break;
    case "legal-accept":
      setData((d) => ({ ...d, privacy: acceptLegalTexts(d.privacy) }));
      notify("Política e termos aceitos");
      break;
    case "privacy-ai-mode":
      setData((d) => ({ ...d, privacy: { ...normalizePrivacy(d.privacy), aiSharing: value === "blocked" ? "blocked" : "ask" } }));
      notify(value === "blocked" ? "Envios para IA bloqueados" : "Confirmação por envio ativada");
      break;
    case "privacy-delete-all": {
      // Com conta conectada, apagar SÓ o aparelho não apaga nada: o próximo
      // ciclo baixa tudo de volta do servidor e o usuário conclui, com razão,
      // que o botão não funciona. Então a pergunta muda: apagar na conta
      // inteira (lápides que viajam para os outros aparelhos) ou apagar aqui e
      // desconectar.
      // O motor pode estar temporariamente parado por falta de rede. Ainda
      // assim este banco pertence a uma conta e não pode ser tratado como uma
      // base apenas local, pois a sessão pode baixar tudo quando se recuperar.
      const naNuvem = FinanceStore.scope() !== GUEST_SCOPE;
      const expectedScope = FinanceStore.scope();
      const expectedGeneration = FinanceStore.generation();

      const apagarLocal = async (mensagem, mensagemFalha, resetRev) => {
        let ok = false;
        let purgeError = null;
        try { ok = await FinanceStore.purge(); }
        catch (error) { purgeError = error; }
        if (!ok) {
          if (typeof reportSafeError === "function") reportSafeError("storage", purgeError, "storage_delete");
          notify(mensagemFalha || "Não foi possível apagar todos os dados", "danger");
          return false;
        }
        // `purge()` remove também o relógio persistido deste escopo. Depois de
        // um reset remoto, gravamos de novo somente a HLC dominante devolvida
        // pelo servidor, para uma criação após recarregar não perder para as
        // lápides que acabaram de ser geradas. A gravação vai para a chave da
        // barreira, que o purge preserva, e não para o relógio que ele apaga.
        const clockPrepared = !resetRev || (typeof FinanceStore.observeResetRev === "function"
          && FinanceStore.observeResetRev(resetRev) === true);
        if (clockPrepared) clearSafeErrors();
        else if (typeof reportSafeError === "function") {
          reportSafeError("storage", null, "reset_rev_observe_failed");
        }
        state.data = FinanceStore.snapshot();
        state.onboarding = freshOnboarding();
        state.onboarding.open = true;
        state.form = freshTxForm();
        state.backup = { preview: null, error: null, mode: "merge", busy: false, undoAvailable: false };
        applyTheme("light");
        render();
        notify(mensagem);
        return true;
      };

      requestConfirmation({
        title: naNuvem ? "Apagar todos os dados da conta?" : "Apagar todos os dados deste aparelho?",
        message: naNuvem
          ? "Esta ação apaga os dados financeiros na conta e em todos os aparelhos conectados a ela. Um backup exportado anteriormente não será apagado."
          : "Esta ação remove dados financeiros, preferências, cópias de recuperação e diagnósticos. Um backup exportado anteriormente não será apagado.",
        confirmLabel: naNuvem ? "Apagar em todos os aparelhos" : "Apagar definitivamente",
        tone: "danger",
        requiredText: "APAGAR",
        alternateLabel: naNuvem ? "Apagar só aqui e desconectar" : null,
        alternateIcon: "eyeOff",
        onConfirm: async () => {
          let resetResult = null;
          if (naNuvem) {
            if (FinanceStore.scope() !== expectedScope || FinanceStore.generation() !== expectedGeneration) {
              notify("A conta mudou antes da exclusão. Nenhuma cópia foi apagada.", "danger");
              return;
            }
            // A ordem importa: primeiro as lápides sobem, depois o aparelho
            // esvazia. Ao contrário, o esvaziamento local não teria mais o que
            // marcar como apagado.
            try {
              resetResult = await CloudSync.resetRemote();
              if (!resetResult || typeof resetResult !== "object"
                || typeof resetResult.ok !== "boolean"
                || typeof resetResult.remoteDeleted !== "boolean"
                || typeof resetResult.localPrepared !== "boolean"
                || !Object.prototype.hasOwnProperty.call(resetResult, "reason")) {
                const invalid = new Error("A sincronização devolveu um resultado inválido para a exclusão.");
                invalid.code = "invalid_reset_result";
                throw invalid;
              }
              if (!resetResult.remoteDeleted) {
                const unconfirmed = new Error("A exclusão remota não foi confirmada.");
                unconfirmed.code = resetResult.reason || "sync_reset";
                throw unconfirmed;
              }
            }
            catch (error) {
              if (typeof reportSafeError === "function") reportSafeError("sync", error, "sync_reset");
              notify("Não foi possível confirmar a exclusão na conta. A cópia deste aparelho não foi apagada.", "danger");
              return;
            }
            if (FinanceStore.scope() !== expectedScope || FinanceStore.generation() !== expectedGeneration) {
              notify("Os dados foram apagados da conta anterior no servidor. A conta aberta agora não foi alterada.");
              return;
            }
          }
          let mensagem = naNuvem ? "Dados apagados na conta e neste aparelho" : "Dados apagados deste aparelho";
          if (resetResult && !resetResult.localPrepared) {
            if (resetResult.reason === "cursor_write_failed") {
              mensagem = "Dados apagados na conta e neste aparelho. O ponto local de sincronização não pôde ser atualizado, mas a limpeza final foi concluída.";
            } else if (resetResult.reason === "outbox_clear_failed") {
              mensagem = "Dados apagados na conta e neste aparelho. A fila local não pôde ser limpa primeiro, mas a limpeza final foi concluída.";
            } else {
              mensagem = "Dados apagados na conta e neste aparelho. A preparação local falhou, mas a limpeza final foi concluída.";
            }
          }
          await apagarLocal(
            mensagem,
            naNuvem
              ? "Os dados foram apagados da conta, mas o navegador não permitiu apagar a cópia deste aparelho. Limpe os dados deste site no navegador."
              : null,
            resetResult && resetResult.resetRev,
          );
        },
        onAlternate: async () => {
          await accountForgetThisDevice();
        },
      });
      break;
    }
    case "diagnostics-export": {
      const summary = safeErrorSummary();
      if (!summary.total) break;
      downloadFile(`diagnostico-financas-${todayIso()}.json`, JSON.stringify(summary, null, 2), "application/json");
      notify("Resumo de diagnóstico exportado");
      break;
    }
    case "diagnostics-clear":
      clearSafeErrors(); render(); notify("Diagnóstico apagado"); break;
    case "onb-skip": skipOnboarding(); break;
    case "onb-have-account": openAccountFromOnboarding(); break;
    case "onb-finish": finishOnboarding(); break;
    case "onb-restart": startOnboarding(); break;
    case "skip-to-content": {
      e.preventDefault();
      const main = document.getElementById("conteudo");
      if (main) main.focus();
      break;
    }
    case "nav":
      if (btn.dataset.tab === "add" && !state.editingTxId && !state.form.origin) state.form = freshTxForm();
      if (btn.dataset.tab !== "settings") state.backup.error = null;
      setState({ tab: btn.dataset.tab });
      EventBus.emit(APP_EVENTS.TAB_CHANGED, { tab: btn.dataset.tab });
      break;
    case "account-mode": state.account.mode = value === "register" || value === "recover" ? value : "login"; state.account.error = ""; state.account.message = ""; render(); break;
    case "account-submit": accountSubmit(value); break;
    case "account-resend": accountResend(); break;
    case "account-refresh": refreshAccountSession(); break;
    // `retry` e não `syncNow`: quando o motor parou por erro, sincronizar
    // agora não faz nada, e é justamente nesse estado que o botão aparece.
    case "account-sync-now": if (typeof CloudSync !== "undefined") CloudSync.retry(); break;
    // Saída para o defeito que o ciclo comum não alcança: a mesma conta com
    // números diferentes em dois aparelhos. Relê a conta inteira e reoferece a
    // base inteira; nada é apagado de nenhum dos lados.
    case "account-reconcile":
      if (typeof CloudSync === "undefined") break;
      notify("Conferindo a conta inteira neste aparelho");
      CloudSync.reconcile();
      break;
    // Vínculo dos dados deste aparelho com a conta. Cada ação é uma escolha
    // diferente; nenhuma delas substitui ou apaga um dos lados.
    case "account-link-confirm": accountLinkGuest(); break;
    case "account-link-dismiss": accountDismissGuestLink(); break;
    case "account-link-later": accountPostponeGuestLink(); break;
    case "account-link-review": accountReviewGuestLink(); break;
    case "account-logout": accountLogout(); break;
    case "account-revoke":
      requestConfirmation({ title: "Revogar acesso deste dispositivo?", message: "Este dispositivo não poderá mais acessar nem sincronizar sua conta. Uma cópia já salva nele não será apagada à distância.", confirmLabel: "Revogar acesso", tone: "danger", onConfirm: () => accountRevoke(id) });
      break;
    case "account-danger-toggle":
      state.accountDangerOpen = !state.accountDangerOpen;
      // Fechar o painel esquece o que estava digitado. Senha não fica em
      // memória depois que a pessoa desiste, e o texto de confirmação volta a
      // ser exigido por inteiro na próxima vez.
      if (!state.accountDangerOpen) { state.account.form.deletePassword = ""; state.account.form.deleteText = ""; state.account.deleteHint = ""; }
      render();
      break;
    case "account-delete-request":
      // O AVISO PRECISA FICAR DO LADO DO BOTÃO.
      //
      // Ele era escrito em `state.account.error`, que a tela desenha lá
      // embaixo, depois de todos os cartões. Quem clicava no botão sem ter
      // preenchido tudo não via nada acontecer: a mensagem nascia fora do campo
      // de visão. Agora ela nasce dentro do próprio painel.
      if (state.account.form.deleteText !== "APAGAR CONTA" || state.account.form.deletePassword.length < 10) {
        state.account.deleteHint = state.account.form.deletePassword.length < 10
          ? "Informe a senha atual da conta. Ela tem 10 caracteres ou mais."
          : "Digite APAGAR CONTA, exatamente assim, no campo acima.";
        render();
        break;
      }
      state.account.deleteHint = "";
      requestConfirmation({ title: "Apagar conta e dados?", message: "A conta e os dados guardados no servidor e neste aparelho serão apagados. Isso não pode ser desfeito. Cópias já salvas em outros aparelhos não serão apagadas à distância.", confirmLabel: "Apagar conta e dados", tone: "danger", requiredText: "APAGAR CONTA", onConfirm: accountDelete });
      break;
    case "analytics-view": state.analyticsView = value === "reports" ? "reports" : "movements"; state.analyticsLimit = 30; render(); break;
    case "accounts-view": state.accountsUi.view = value === "sources" ? "sources" : "accounts"; render(); break;
    case "movement-filters-toggle": state.movementFiltersOpen = !state.movementFiltersOpen; render(); break;
    case "movement-filters-clear": state.movementFilters = { type:"all", categoryId:"", accountId:"", source:"" }; state.analyticsSearch = ""; state.analyticsLimit = 30; render(); break;
    case "movement-search-clear": state.analyticsSearch = ""; state.analyticsLimit = 30; render(); break;
    case "movement-review-toggle": state.movementReviewOpen = !state.movementReviewOpen; render(); break;
    case "movement-detail": state.movementDetailId = id; openOverlay("movement-detail"); render(); break;
    case "movement-detail-close": dismissOverlay("movement-detail"); break;
    case "movement-selection-clear": state.movementSelectedIds = []; state.movementBulkCategoryId = ""; render(); break;
    case "movement-bulk-apply": {
      const ids = new Set(state.movementSelectedIds);
      const categoryId = state.movementBulkCategoryId;
      if (!categoryId || !ids.size) break;
      const expenseIds = new Set(state.data.transactions.filter((tx) => ids.has(tx.id) && tx.type === "expense").map((tx) => tx.id));
      if (!expenseIds.size) { notify("Selecione ao menos uma saída para alterar a categoria", "warn"); break; }
      setData((d) => ({ ...d, transactions: d.transactions.map((tx) => expenseIds.has(tx.id) ? updateTransaction(tx, { categoryId }) : tx) }));
      state.movementSelectedIds = []; state.movementBulkCategoryId = "";
      notify(plural(expenseIds.size, "lançamento atualizado", "lançamentos atualizados"));
      break;
    }
    case "movement-bulk-delete": {
      const ids = [...state.movementSelectedIds];
      if (!ids.length) break;
      requestConfirmation({
        title: "Excluir lançamentos selecionados?",
        message: `${plural(ids.length, "lançamento será removido", "lançamentos serão removidos")} do histórico.`,
        confirmLabel: "Excluir lançamentos", tone: "danger",
        onConfirm: () => { setData((d) => removeTransactionsWithIntegrity(d, ids)); state.movementSelectedIds = []; state.movementBulkCategoryId = ""; notify("Lançamentos excluídos"); },
      });
      break;
    }
    case "review-ignore":
      setData((d) => ({ ...d, transactions: d.transactions.map((tx) => tx.id === id ? markTransactionIssueReviewed(tx, btn.dataset.key) : tx) }));
      notify("Sugestão marcada como revisada");
      break;
    case "review-delete-duplicate": {
      const tx = state.data.transactions.find((item) => item.id === id);
      if (!tx) break;
      requestConfirmation({
        title: "Excluir possível cópia?", message: `${tx.description || "O lançamento"}, no valor de ${fmtBRL(tx.amount)}, será removido.`, confirmLabel: "Excluir cópia", tone: "danger",
        onConfirm: () => { setData((d) => removeTransactionsWithIntegrity(d, [id])); notify("Cópia excluída"); },
      });
      break;
    }
    case "review-delete-invoice-income": {
      const tx = state.data.transactions.find((item) => item.id === id);
      if (!tx) break;
      requestConfirmation({
        title: "Excluir a receita?",
        message: `“${tx.description || "O lançamento"}”, de ${fmtBRL(tx.amount)}, veio da fatura do cartão: é o pagamento do mês anterior, não dinheiro recebido. Excluir devolve o mês ao valor real.`,
        confirmLabel: "Excluir receita", tone: "danger",
        onConfirm: () => { setData((d) => removeTransactionsWithIntegrity(d, [id])); notify("Receita excluída"); },
      });
      break;
    }
    case "review-convert-transfer": {
      const issue = buildTransactionReviewModel(state.data).issues.find((item) => item.key === btn.dataset.key && item.type === "transfer");
      if (!issue) { notify("A sugestão não está mais disponível", "warn"); break; }
      const expense = state.data.transactions.find((tx) => tx.id === issue.expenseId);
      const income = state.data.transactions.find((tx) => tx.id === issue.incomeId);
      if (!expense || !income) break;
      requestConfirmation({
        title: "Converter em transferência?", message: "A saída e a entrada serão substituídas por uma transferência entre as duas contas.", confirmLabel: "Converter",
        onConfirm: () => {
          setData((d) => {
            const transfer = makeAccountTransfer({
              fromAccountId: expense.accountId, toAccountId: income.accountId, amount: expense.amount,
              date: expense.date, description: expense.description || "Transferência", sourceTransactionIds:issue.txIds,
              origin:{ channel:"transfer", label:"Conversão da caixa de revisão", importedAt:new Date().toISOString() },
            }, d.accounts);
            if (!transfer) return d;
            const cleaned = removeTransactionsWithIntegrity(d, issue.txIds);
            return { ...cleaned, accountTransfers: [...(cleaned.accountTransfers || []), transfer] };
          });
          notify("Transferência criada");
        },
      });
      break;
    }
    case "review-card-payment-open": {
      const account = (state.data.accounts || []).find((item) => !item.archived);
      const card = (state.data.creditCards || []).find((item) => !item.archived);
      state.movementReviewCard = { txId:id, key:btn.dataset.key, accountId:account ? account.id : "", creditCardId:card ? card.id : "" };
      openOverlay("review-card-payment"); render(); break;
    }
    case "review-card-payment-close": dismissOverlay("review-card-payment"); break;
    case "review-card-payment-confirm": {
      const draft = state.movementReviewCard;
      const tx = draft && state.data.transactions.find((item) => item.id === draft.txId);
      if (!tx || !draft.accountId || !draft.creditCardId) break;
      const payment = makeCardPayment({ accountId:draft.accountId, creditCardId:draft.creditCardId, amount:tx.amount, date:tx.date, statementKey:monthKeyOf(tx.date), sourceTransactionIds:[tx.id], origin:{ channel:"card-payment", label:"Conversão da caixa de revisão", importedAt:new Date().toISOString() } }, state.data.accounts, state.data.creditCards);
      if (!payment) { notify("Não foi possível criar o pagamento", "warn"); break; }
      setData((d) => { const cleaned = removeTransactionsWithIntegrity(d, [tx.id]); return { ...cleaned, cardPayments:[...(cleaned.cardPayments || []),payment] }; });
      dismissOverlay("review-card-payment");
      notify("Pagamento de fatura criado");
      break;
    }
    case "review-reconcile-account": state.accountsUi.reconcileId = id; state.accountsUi.reconcileValue = moneyDraft(accountBalance(state.data,id,todayIso())); setState({ tab:"accounts" }); break;
    // Seta do cabeçalho: desempilha o histórico de verdade, para que voltar pela
    // tela e voltar pelo aparelho cheguem no mesmo lugar. Sem entrada anterior
    // (link colado, aba nova) cai no destino declarado no `data-tab`.
    case "back": {
      const fallback = btn.dataset.tab || "dashboard";
      if (NavHistory.current().depth > 0 && NavHistory.go(-1)) break;
      setState({ tab: fallback });
      EventBus.emit(APP_EVENTS.TAB_CHANGED, { tab: fallback });
      break;
    }
    // ---- Personalização do Início ----
    // Toda gravação passa por `setData`, que já persiste, re-renderiza e avisa o
    // Event Bus. Guardar o layout em estado volátil e salvar "no fim" perderia a
    // configuração de quem fecha o app no meio.
    case "dash-customize-toggle": state.dashboardEditing = !state.dashboardEditing; render(); break;
    case "dash-customize-close": state.dashboardEditing = false; render(); break;
    case "dash-card-toggle": {
      setData((d) => ({ ...d, dashboardLayout: setDashboardCardVisibility(d.dashboardLayout, id, value === "show", d) }));
      break;
    }
    case "dash-card-move": {
      setData((d) => ({ ...d, dashboardLayout: moveDashboardCard(d.dashboardLayout, id, value === "up" ? -1 : 1) }));
      break;
    }
    case "dash-focus": {
      const focus = normalizeDashboardFocus(value);
      setData((d) => ({ ...d, dashboardFocus: focus, dashboardLayout: applyDashboardFocus(d.dashboardLayout, focus) }));
      break;
    }
    case "dash-layout-reset":
      setData((d) => ({ ...d, dashboardLayout: applyDashboardFocus(defaultDashboardLayout(), d.dashboardFocus) }));
      notify("Início restaurado ao padrão");
      break;

    // ---- Tela "Recursos" ----
    case "all-search-clear": state.allSearch = ""; render(); break;

    // ---- Regras de categorização ----
    case "rule-new":
      state.rules.form = { id: null, pattern: "", matchType: "contains", categoryId: "", weight: RULE_WEIGHT_DEFAULT };
      state.rules.confirmDeleteId = null;
      render(); break;
    case "rule-cancel": state.rules.form = null; render(); break;
    case "rule-edit": {
      const r = normalizeCategoryRules(state.data.categoryRules).custom.find((x) => x.id === id);
      if (!r) break;
      state.rules.form = { id: r.id, pattern: r.pattern, matchType: r.matchType, categoryId: r.categoryId, weight: r.weight };
      state.rules.confirmDeleteId = null;
      render(); break;
    }
    case "rule-save": {
      const f = state.rules.form;
      if (!f) break;
      const compiled = compileRulePattern(f.pattern, f.matchType);
      if (!compiled.ok) { notify(compiled.error, "warn"); break; }
      if (!f.categoryId) { notify("Escolha a categoria de destino", "warn"); break; }
      setData((d) => {
        const cfg = normalizeCategoryRules(d.categoryRules);
        const old = f.id ? cfg.custom.find((x) => x.id === f.id) : null;
        const next = makeCategoryRule({ ...f, id: f.id || undefined, enabled: old ? old.enabled : true, createdAt: old && old.createdAt });
        const custom = old ? cfg.custom.map((x) => (x.id === old.id ? next : x)) : cfg.custom.concat([next]);
        return { ...d, categoryRules: { ...cfg, custom } };
      });
      state.rules.form = null;
      state.rules.applyPreview = null;
      notify(f.id ? "Regra atualizada" : "Regra criada");
      break;
    }
    case "rule-toggle": {
      setData((d) => {
        const cfg = normalizeCategoryRules(d.categoryRules);
        return { ...d, categoryRules: { ...cfg, custom: cfg.custom.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) } };
      });
      state.rules.applyPreview = null;
      break;
    }
    case "rule-delete": {
      const rule = normalizeCategoryRules(state.data.categoryRules).custom.find((r) => r.id === id);
      if (!rule) break;
      requestConfirmation({
        title: "Excluir regra?",
        message: `A regra “${rule.pattern}” deixará de categorizar novos lançamentos.`,
        confirmLabel: "Excluir regra",
        tone: "danger",
        onConfirm: () => {
          setData((d) => {
            const cfg = normalizeCategoryRules(d.categoryRules);
            return { ...d, categoryRules: { ...cfg, custom: cfg.custom.filter((r) => r.id !== id) } };
          });
          state.rules.applyPreview = null;
          if (state.rules.form && state.rules.form.id === id) state.rules.form = null;
          notify("Regra excluída");
        },
      });
      break;
    }
    case "rules-toggle-builtins": state.rules.showBuiltins = !state.rules.showBuiltins; render(); break;
    case "rule-builtin-toggle": {
      const rule = BUILTIN_CATEGORY_RULES.find((r) => r.id === id);
      if (!rule) break;
      setData((d) => {
        const cfg = normalizeCategoryRules(d.categoryRules);
        const cur = cfg.builtin[id] || {};
        const builtin = { ...cfg.builtin, [id]: { enabled: cur.enabled === false, categoryId: cur.categoryId || null } };
        return { ...d, categoryRules: normalizeCategoryRules({ ...cfg, builtin }) };
      });
      state.rules.applyPreview = null;
      break;
    }
    case "rules-builtin-reset":
      setData((d) => ({ ...d, categoryRules: { ...normalizeCategoryRules(d.categoryRules), builtin: {} } }));
      state.rules.applyPreview = null;
      notify("Regras de fábrica restauradas");
      break;
    case "rule-apply-preview": {
      const preview = previewRuleApplication(state.data, { onlyFallback: true });
      state.rules.applyPreview = preview;
      render();
      if (preview.count === 0) notify("Nada em “Outros” casou com as regras atuais");
      break;
    }
    case "rule-apply-cancel": state.rules.applyPreview = null; render(); break;
    case "rule-apply-confirm": {
      const preview = state.rules.applyPreview;
      if (!preview || preview.count === 0) break;
      setData((d) => applyRulesToTransactions(d, preview.changes));
      state.rules.applyPreview = null;
      notify(plural(preview.count, "lançamento recategorizado", "lançamentos recategorizados"));
      break;
    }

    // ---- Contas, cartões e conciliação ----
    case "account-new":
      state.revealTarget = "account-form";
      state.accountsUi.accountForm = freshAccountForm(); state.accountsUi.cardForm = null; render(); break;
    case "account-cancel": state.accountsUi.accountForm = null; render(); break;
    case "account-edit": {
      const a = accountById(state.data, id); if (!a) break;
      state.accountsUi.accountForm = { id:a.id, name:a.name, type:a.type, openingBalance:moneyDraft(a.openingBalance), openingDate:a.openingDate, color:a.color };
      state.accountsUi.cardForm = null; state.revealTarget = "account-form"; render(); break;
    }
    case "account-save": {
      const f = state.accountsUi.accountForm; if (!f) break;
      const openingBalance = parseMoneyInput(f.openingBalance || "0");
      if (!String(f.name).trim() || !moneyWithinMax(openingBalance)) {
        showFormErrors({
          ...(String(f.name).trim() ? {} : { "account-name-input": "Informe o nome da conta." }),
          ...(moneyWithinMax(openingBalance) ? {} : { "account-balance-input": Number.isFinite(openingBalance) ? moneyMaxMessage("Saldo") : "Informe um saldo válido com até duas casas decimais." }),
        }, "Revise os dados da conta"); break;
      }
      setData((d) => {
        const old = f.id ? accountById(d, f.id) : null;
        const next = makeAccount({ ...f, openingBalance, createdAt: old && old.createdAt, archived: old && old.archived });
        return { ...d, accounts: old ? d.accounts.map((a) => a.id === old.id ? next : a) : [...d.accounts, next] };
      });
      state.accountsUi.accountForm = null; notify(f.id ? "Conta atualizada" : "Conta cadastrada"); break;
    }
    case "account-archive": {
      const target = accountById(state.data, id);
      const activeCount = (state.data.accounts || []).filter((a) => !a.archived).length;
      const hasActiveCards = (state.data.creditCards || []).some((c) => !c.archived);
      if (target && !target.archived && activeCount <= 1 && hasActiveCards) {
        notify("Mantenha uma conta ativa para pagar os cartões ou arquive os cartões primeiro");
        break;
      }
      setData((d) => ({ ...d, accounts: d.accounts.map((a) => a.id === id ? { ...a, archived: !a.archived, updatedAt:new Date().toISOString() } : a) }));
      notify("Estado da conta atualizado"); break;
    }
    case "account-delete": {
      const target = accountById(state.data, id);
      if (!target) break;
      const impacto = accountDeletionImpact(state.data, id);
      const perdeVinculo = [
        impacto.transactions ? `${plural(impacto.transactions, "lançamento volta", "lançamentos voltam")} a contar como histórico sem conta` : "",
        impacto.cards ? `${plural(impacto.cards, "cartão fica", "cartões ficam")} sem conta de pagamento` : "",
      ].filter(Boolean);
      const saiJunto = [
        impacto.transfers ? plural(impacto.transfers, "transferência", "transferências") : "",
        impacto.payments ? plural(impacto.payments, "pagamento de fatura", "pagamentos de fatura") : "",
        impacto.adjustments ? plural(impacto.adjustments, "conciliação", "conciliações") : "",
      ].filter(Boolean);
      const partes = [`A conta “${target.name}” sai da lista em todos os aparelhos.`];
      if (perdeVinculo.length) partes.push(`${perdeVinculo.join(" e ")}.`);
      // A frase da fatura só entra quando existe pagamento para reabrir. Sem a
      // condição, ela aparecia numa conta que nunca pagou cartão nenhum e
      // anunciava um efeito que não ia acontecer.
      const totalSaiJunto = impacto.transfers + impacto.payments + impacto.adjustments;
      if (saiJunto.length) partes.push(`${saiJunto.join(", ")} ${pluralWord(totalSaiJunto, "deixa", "deixam")} de existir junto com ela.`);
      if (impacto.payments) partes.push(`As faturas pagas por essa conta voltam a aparecer em aberto.`);
      if (!perdeVinculo.length && !saiJunto.length) partes.push("Nada está registrado nela, então nenhum outro número muda.");
      requestConfirmation({
        title: "Excluir esta conta?",
        message: partes.join(" "),
        confirmLabel: "Excluir conta",
        tone: "danger",
        // Arquivar continua sendo a saída certa para uma conta encerrada de
        // verdade, cujo histórico ainda importa. A escolha fica na mesma caixa
        // para ninguém apagar movimento por falta de alternativa à vista.
        alternateLabel: target.archived ? null : "Só arquivar",
        onAlternate: () => {
          setData((d) => ({ ...d, accounts: d.accounts.map((a) => a.id === id ? { ...a, archived: true, updatedAt: new Date().toISOString() } : a) }));
          notify("Conta arquivada");
        },
        onConfirm: () => {
          setData((d) => removeAccountWithIntegrity(d, id));
          if (state.accountsUi.reconcileId === id) { state.accountsUi.reconcileId = null; state.accountsUi.reconcileValue = ""; }
          if (state.accountsUi.accountForm && state.accountsUi.accountForm.id === id) state.accountsUi.accountForm = null;
          state.accountsUi.transferForm = null;
          state.accountsUi.payment = null;
          notify("Conta excluída");
        },
      });
      break;
    }
    case "account-reconcile-open": {
      const a = accountById(state.data,id); if (!a) break;
      state.accountsUi.reconcileId = id; state.accountsUi.reconcileValue = moneyDraft(accountBalance(state.data,id,todayIso())); render(); break;
    }
    case "account-reconcile-cancel": state.accountsUi.reconcileId = null; state.accountsUi.reconcileValue = ""; render(); break;
    case "account-reconcile-save": {
      const actual = parseMoneyInput(state.accountsUi.reconcileValue);
      if (!moneyWithinMax(actual)) { showFormErrors({ "reconcile-balance-input": Number.isFinite(actual) ? moneyMaxMessage("Saldo") : "Informe o saldo visto no banco." }); break; }
      const result = reconcileAccount(state.data,id,actual,todayIso());
      setData(() => result.data);
      state.accountsUi.reconcileId = null; state.accountsUi.reconcileValue = "";
      notify(result.adjustment ? `Conciliação registrada (${fmtBRL(result.adjustment.amount)})` : "O saldo já estava conciliado"); break;
    }
    case "card-new": state.revealTarget = "card-form"; state.accountsUi.cardForm = freshCardForm(); state.accountsUi.accountForm = null; render(); break;
    case "card-cancel": state.accountsUi.cardForm = null; render(); break;
    case "card-edit": {
      const c = creditCardById(state.data,id); if (!c) break;
      state.accountsUi.cardForm = { id:c.id, name:c.name, accountId:c.accountId || "", limit:moneyDraft(c.limit), closingDay:String(c.closingDay), dueDay:String(c.dueDay), color:c.color };
      state.accountsUi.accountForm = null; state.revealTarget = "card-form"; render(); break;
    }
    case "card-save": {
      const f = state.accountsUi.cardForm; if (!f) break;
      const limit = parseMoneyInput(f.limit || "0");
      if (!String(f.name).trim() || !f.accountId || !Number.isFinite(limit) || limit < 0) {
        showFormErrors({
          ...(String(f.name).trim() ? {} : { "card-name-input": "Informe o nome do cartão." }),
          ...(f.accountId ? {} : { "card-account-select": "Escolha a conta usada para pagar." }),
          ...(Number.isFinite(limit) && limit >= 0 ? {} : { "card-limit-input": "Informe um limite válido." }),
        }, "Revise os dados do cartão"); break;
      }
      setData((d) => {
        const old = f.id ? creditCardById(d,f.id) : null;
        const next = makeCreditCard({ ...f, limit, createdAt:old && old.createdAt, archived:old && old.archived }, d.accounts);
        return { ...d, creditCards: old ? d.creditCards.map((c) => c.id === old.id ? next : c) : [...d.creditCards,next] };
      });
      state.accountsUi.cardForm = null; notify(f.id ? "Cartão atualizado" : "Cartão cadastrado"); break;
    }
    case "card-archive":
      setData((d) => ({ ...d, creditCards:d.creditCards.map((c) => c.id === id ? { ...c, archived:!c.archived, updatedAt:new Date().toISOString() } : c) }));
      notify("Estado do cartão atualizado"); break;
    case "card-delete": {
      const card = creditCardById(state.data, id);
      if (!card) break;
      const impacto = cardDeletionImpact(state.data, id);
      const partes = [`O cartão “${card.name}” sai da lista em todos os aparelhos.`];
      if (impacto.transactions) partes.push(`${plural(impacto.transactions, "compra continua", "compras continuam")} no histórico, mas ${pluralWord(impacto.transactions, "passa", "passam")} a sair do saldo em contas na data em que ${pluralWord(impacto.transactions, "foi feita", "foram feitas")}.`);
      if (impacto.payments) partes.push(`${plural(impacto.payments, "pagamento de fatura deixa", "pagamentos de fatura deixam")} de existir.`);
      if (!impacto.total) partes.push("Nada está registrado nele, então nenhum outro número muda.");
      requestConfirmation({
        title: "Excluir este cartão?",
        message: partes.join(" "),
        confirmLabel: "Excluir cartão",
        tone: "danger",
        alternateLabel: card.archived ? null : "Só arquivar",
        onAlternate: () => {
          setData((d) => ({ ...d, creditCards: d.creditCards.map((c) => c.id === id ? { ...c, archived: true, updatedAt: new Date().toISOString() } : c) }));
          notify("Cartão arquivado");
        },
        onConfirm: () => {
          setData((d) => removeCreditCardWithIntegrity(d, id));
          if (state.accountsUi.cardForm && state.accountsUi.cardForm.id === id) state.accountsUi.cardForm = null;
          if (state.accountsUi.payment && state.accountsUi.payment.creditCardId === id) state.accountsUi.payment = null;
          notify("Cartão excluído");
        },
      });
      break;
    }
    case "transfer-new": {
      const list = (state.data.accounts || []).filter((a) => !a.archived);
      state.accountsUi.transferForm = { fromAccountId:(list[0]||{}).id||"", toAccountId:(list[1]||{}).id||"", amount:"", date:todayIso(), description:"Transferência" };
      state.revealTarget = "transfer-form";
      render(); break;
    }
    case "transfer-cancel": state.accountsUi.transferForm = null; render(); break;
    case "transfer-save": {
      const f = state.accountsUi.transferForm; if (!f) break;
      const amount = parseMoneyInput(f.amount);
      const transfer = makeAccountTransfer({ ...f, amount }, state.data.accounts);
      if (!transfer || !moneyWithinMax(amount)) {
        showFormErrors({
          ...(f.fromAccountId ? {} : { "transfer-from-select": "Escolha a conta de origem." }),
          ...(f.toAccountId && f.toAccountId !== f.fromAccountId ? {} : { "transfer-to-select": "Escolha uma conta de destino diferente." }),
          ...(amount > 0 && moneyWithinMax(amount) ? {} : { "transfer-amount-input": amount > 0 ? moneyMaxMessage("Valor") : "Informe um valor maior que zero." }),
        }, "Revise os dados da transferência"); break;
      }
      setData((d) => ({ ...d, accountTransfers:[...d.accountTransfers,transfer] }));
      state.accountsUi.transferForm = null; notify("Transferência registrada sem alterar receitas ou despesas"); break;
    }
    case "card-pay-open": {
      const card = creditCardById(state.data,id); if (!card) break;
      const summary = accountsSummary(state.data,todayIso());
      const statement = cardStatements(state.data,id).find((s) => s.key === value);
      const activeAccounts = summary.accounts.filter((a) => !a.archived);
      const linked = activeAccounts.find((a) => a.id === card.accountId);
      state.accountsUi.payment = { creditCardId:id, statementKey:value, accountId:(linked || activeAccounts[0] || {}).id || "", amount:moneyDraft(statement && statement.outstanding), date:todayIso() };
      render(); break;
    }
    case "card-pay-cancel": state.accountsUi.payment = null; render(); break;
    case "card-pay-save": {
      const p = state.accountsUi.payment; if (!p) break;
      const amount = parseMoneyInput(p.amount);
      const statement = cardStatements(state.data,p.creditCardId).find((s) => s.key === p.statementKey);
      if (p.date > todayIso()) { showFormErrors({ "payment-date-input": "A data do pagamento não pode estar no futuro." }); break; }
      const activeAccount = (state.data.accounts || []).some((a) => a.id === p.accountId && !a.archived);
      if (!(amount > 0) || !activeAccount || !statement || moneyCompare(amount,statement.outstanding) > 0) {
        showFormErrors({
          ...(activeAccount ? {} : { "payment-account-select": "Escolha uma conta ativa." }),
          ...(amount > 0 && statement && moneyCompare(amount, statement.outstanding) <= 0 ? {} : { "payment-amount-input": "Use um valor positivo que não supere a fatura em aberto." }),
        }, "Revise o pagamento da fatura"); break;
      }
      const payment = makeCardPayment({ ...p, amount }, state.data.accounts, state.data.creditCards);
      if (!payment) { notify("Não foi possível registrar o pagamento"); break; }
      setData((d) => ({ ...d, cardPayments:[...d.cardPayments,payment] }));
      state.accountsUi.payment = null; notify("Pagamento registrado sem duplicar a despesa"); break;
    }
    // ---- Central de Dívidas ----
    case "debt-new":
      state.revealTarget = "debt-form";
      state.debtsUi.form = freshDebtForm(); state.debtsUi.payment = null; render(); break;
    case "debt-form-cancel": state.debtsUi.form = null; render(); break;
    case "debt-edit": {
      const d = (state.data.assets || []).find((a) => a.id === id && a.kind === "liability");
      if (!d) break;
      const draftMoney = (n) => n == null || n === 0 ? "" : moneyDraft(n);
      state.debtsUi.form = {
        id:d.id, name:d.name, value:moneyDraft(d.value), debtType:d.debtType || "outro", creditor:d.creditor || "",
        originalPrincipal:draftMoney(d.originalPrincipal), monthlyPayment:draftMoney(d.monthlyPayment), ratePct:draftMoney(d.ratePct),
        ratePeriod:d.ratePeriod || "unknown", cetAnnualPct:draftMoney(d.cetAnnualPct), remainingInstallments:d.remainingInstallments == null ? "" : String(d.remainingInstallments),
        amortizationSystem:d.amortizationSystem || "unknown", nextDueDate:d.nextDueDate || "", debtStatus:d.debtStatus || "active",
        balanceCheckedAt:d.balanceCheckedAt || "", note:d.note || "",
      };
      state.debtsUi.payment = null; state.revealTarget = "debt-form"; render(); break;
    }
    case "debt-save": {
      const f = state.debtsUi.form; if (!f) break;
      const valueNum = parseMoneyInput(f.value);
      const paymentNum = parseMoneyInput(f.monthlyPayment);
      if (!String(f.name).trim() || !Number.isFinite(valueNum) || valueNum < 0) {
        showFormErrors({
          ...(String(f.name).trim() ? {} : { "debt-name": "Informe o nome da dívida." }),
          ...(Number.isFinite(valueNum) && valueNum >= 0 ? {} : { "debt-value": "Informe um saldo devedor válido." }),
        }, "Revise os dados da dívida"); break;
      }
      const optional = (raw) => { const n = parseMoneyInput(raw); return raw === "" || raw == null || !Number.isFinite(n) ? null : n; };
      setData((data) => {
        const old = f.id ? (data.assets || []).find((a) => a.id === f.id) : null;
        const next = makeAsset({
          ...(old || {}), id:f.id || undefined, class:"divida", name:f.name, value:valueNum,
          debtType:f.debtType, creditor:f.creditor, originalPrincipal:optional(f.originalPrincipal),
          monthlyPayment:Number.isFinite(paymentNum) ? paymentNum : 0, ratePct:optional(f.ratePct), ratePeriod:f.ratePeriod,
          cetAnnualPct:optional(f.cetAnnualPct), remainingInstallments:optional(f.remainingInstallments), amortizationSystem:f.amortizationSystem,
          nextDueDate:f.nextDueDate, debtStatus:f.debtStatus, balanceCheckedAt:f.balanceCheckedAt || todayIso(), note:f.note,
          history:old && old.history, createdAt:old && old.createdAt,
        });
        return { ...data, assets: old ? data.assets.map((a) => a.id === old.id ? next : a) : [...(data.assets || []),next] };
      });
      state.debtsUi.form = null; notify(f.id ? "Dívida atualizada" : "Dívida cadastrada"); break;
    }
    case "debt-toggle": state.debtsUi.expandedId = state.debtsUi.expandedId === id ? null : id; state.debtsUi.confirmDeleteId = null; render(); break;
    case "debt-payment-open": state.revealTarget = "debt-payment-form"; state.debtsUi.payment = freshDebtPayment(id); state.debtsUi.form = null; render(); break;
    case "debt-payment-cancel": state.debtsUi.payment = null; render(); break;
    case "debt-payment-save": {
      const p = state.debtsUi.payment; if (!p) break;
      const amount = parseMoneyInput(p.amount);
      if (!(amount > 0) || !p.date || p.date > todayIso()) {
        showFormErrors({
          ...(amount > 0 ? {} : { "debt-pay-amount": "Informe um pagamento maior que zero." }),
          ...(p.date && p.date <= todayIso() ? {} : { "debt-pay-date": "Informe uma data válida que não esteja no futuro." }),
        }, "Revise o pagamento da dívida"); break;
      }
      if (p.accountId && !(state.data.accounts || []).some((a) => a.id === p.accountId && !a.archived)) { showFormErrors({ "debt-pay-account": "Escolha uma conta ativa." }); break; }
      if (isDuplicateDebtPayment(state.data,p.debtId,p.date,amount) && !p.duplicateConfirmed) {
        requestConfirmation({
          title: "Registrar pagamento repetido?",
          message: "Já existe um pagamento com a mesma dívida, data e valor. Confirme somente se forem pagamentos distintos.",
          confirmLabel: "Registrar mesmo assim",
          onConfirm: () => { p.duplicateConfirmed = true; commitDebtPayment(p); },
        });
        break;
      }
      commitDebtPayment(p);
      break;
    }
    case "debt-strategy":
      setData((d) => ({ ...d, debtPlan:normalizeDebtPlan({ ...d.debtPlan, strategy:value, updatedAt:todayIso() }) })); break;
    case "debt-extra-save": {
      const extra = moneyOrZero(state.debtsUi.extraDraft == null ? state.data.debtPlan.extraMonthly : state.debtsUi.extraDraft);
      setData((d) => ({ ...d, debtPlan:normalizeDebtPlan({ ...d.debtPlan, extraMonthly:extra, updatedAt:todayIso() }) }));
      state.debtsUi.extraDraft = null; notify("Valor extra aplicado ao plano"); break;
    }
    case "debt-delete": {
      const debt = (state.data.assets || []).find((a) => a.id === id);
      if (!debt) break;
      requestConfirmation({
        title: "Excluir dívida?",
        message: `A dívida “${debt.name}” será removida. Os pagamentos continuam no histórico, mas perdem o vínculo.`,
        confirmLabel: "Excluir dívida",
        tone: "danger",
        onConfirm: () => {
          setData((d) => ({ ...d, assets:(d.assets || []).filter((a) => a.id !== id), graveyard: withTombstones(d.graveyard, "assets", id), transactions:(d.transactions || []).map((t) => t.debtId === id ? { ...t, debtId:null } : t) }));
          state.debtsUi.expandedId = null;
          notify("Dívida excluída");
        },
      });
      break;
    }
    // ---- Módulo 6: gamificação ----
    case "ach-filter":
      state.gamification.filter = value;
      state.gamification.detailId = null;
      render();
      break;
    case "ach-detail":
      state.gamification.detailId = state.gamification.detailId === id ? null : id;
      render();
      break;
    case "dismiss-celebration":
      dismissOverlay("celebration");
      break;
    case "celebration-see-all":
      // A celebração some e a tela troca. Uma entrada só no histórico: voltar
      // daqui leva de volta ao dashboard, não à celebração já vista.
      closeOverlayState("celebration");
      state.overlayStack = state.overlayStack.filter((n) => n !== "celebration");
      setState({ tab: "achievements" });
      break;
    // ---- Módulo 8: central de notificações ----
    case "notif-filter":
      state.notif.filter = value || "all";
      render();
      break;
    case "notif-settings":
      state.notif.settingsOpen = !state.notif.settingsOpen;
      render();
      break;
    case "notif-read":
      setData((d) => ({ ...d, notifications: NotificationService.markRead(d.notifications, id) }));
      EventBus.emit(APP_EVENTS.NOTIFICATION_READ, { id });
      break;
    case "notif-read-all":
      setData((d) => ({ ...d, notifications: NotificationService.markAllRead(d.notifications) }));
      notify("Todas as notificações foram marcadas como lidas");
      break;
    case "notif-remove":
      setData((d) => ({ ...d, notifications: NotificationService.remove(d.notifications, id) }));
      break;
    case "notif-clear":
      setData((d) => ({ ...d, notifications: NotificationService.clearRead(d.notifications) }));
      notify("Avisos lidos removidos do histórico");
      break;
    case "notif-mute": {
      // O que está silenciado hoje é o que decide o rótulo do próximo clique :
      // sem ler o estado atual, o botão viraria um interruptor de mão única.
      const muted = !!(normalizeNotifications(state.data.notifications).muted || {})[id];
      setData((d) => ({ ...d, notifications: NotificationService.setMuted(d.notifications, id, !muted) }));
      const meta = NOTIF_GROUPS.find((g) => g.id === id);
      notify(muted ? `Avisos de ${meta ? meta.label.toLowerCase() : id} reativados` : `Avisos de ${meta ? meta.label.toLowerCase() : id} silenciados`);
      break;
    }
    case "notif-open": {
      // Abrir o aviso já o marca como lido: se o usuário foi até a tela, o
      // badge não tem mais o que informar.
      setData((d) => ({ ...d, notifications: NotificationService.markRead(d.notifications, id) }));
      const target = btn.dataset.tab || "dashboard";
      setState({ tab: target });
      break;
    }
    // ---- Módulo 7: central inteligente ----
    case "ins-view":
      state.insights.view = value || "ia";
      state.insights.detailId = null;
      state.insights.heatDay = null;
      render();
      break;
    case "ins-prev":
      state.insights.monthOffset -= 1;
      state.insights.heatDay = null;
      state.insights.detailId = null;
      render();
      break;
    case "ins-next":
      // Não faz sentido analisar um mês que ainda não começou: sem dado, toda
      // comparação vira zero e o painel mente por omissão.
      if (state.insights.monthOffset < 0) {
        state.insights.monthOffset += 1;
        state.insights.heatDay = null;
        state.insights.detailId = null;
        render();
      }
      break;
    case "ins-detail":
      state.insights.detailId = state.insights.detailId === id ? null : id;
      render();
      break;
    case "heat-day":
      state.insights.heatDay = state.insights.heatDay === value ? null : value;
      render();
      break;
    case "heat-clear":
      state.insights.heatDay = null;
      render();
      break;

    // ---- Módulo 7: assinaturas e recorrências ----
    case "subs-view":
      state.subs.view = value || "assinaturas";
      state.subs.expandedKey = null;
      render();
      break;
    case "sub-expand":
      state.subs.expandedKey = state.subs.expandedKey === id ? null : id;
      render();
      break;
    case "sub-ignore":
      // "Parar de acompanhar" NÃO apaga lançamento nenhum: só registra a
      // preferência. O histórico continua alimentando gráficos e comparações.
      setData((d) => ({ ...d, recurringPrefs: recPrefsWith(d, "ignored", id, todayIso()) }));
      state.subs.expandedKey = null;
      notify("Item removido do acompanhamento", "info");
      break;
    case "sub-track":
      setData((d) => ({ ...d, recurringPrefs: recPrefsWith(d, "ignored", id, null) }));
      state.subs.expandedKey = null;
      notify("Voltamos a acompanhar este item", "success");
      break;
    case "rec-confirm": {
      // Marca os lançamentos do grupo como recorrentes. É o que faz a previsão
      // de saldo e o calendário passarem a contar com o compromisso.
      const applied = applyRecurringFlag(state.data, id, true);
      setData((d) => ({
        ...d,
        transactions: applied.transactions,
        recurringPrefs: recPrefsWith(d, "confirmed", id, todayIso()),
      }));
      notify(applied.touched > 0
        ? `Cadastrado como recorrente (${applied.touched} ${applied.touched === 1 ? "lançamento atualizado" : "lançamentos atualizados"})`
        : "Este gasto já estava marcado como recorrente", "success");
      break;
    }
    case "sub-unflag": {
      const applied = applyRecurringFlag(state.data, id, false);
      setData((d) => ({
        ...d,
        transactions: applied.transactions,
        recurringPrefs: recPrefsWith(d, "confirmed", id, null),
      }));
      notify("Não é mais tratado como gasto recorrente", "info");
      break;
    }
    case "rec-dismiss":
      setData((d) => ({ ...d, recurringPrefs: recPrefsWith(d, "dismissed", id, todayIso()) }));
      notify("Não perguntaremos de novo sobre este padrão", "info");
      break;

    // ---- Módulo 4: calendário e previsão ----
    case "cal-prev":
      state.calendar.monthOffset -= 1;
      state.calendar.selectedDay = null;
      render();
      break;
    case "cal-next":
      state.calendar.monthOffset += 1;
      state.calendar.selectedDay = null;
      render();
      break;
    case "cal-day":
      state.calendar.selectedDay = state.calendar.selectedDay === value ? null : value;
      render();
      break;
    case "cal-close-day":
      state.calendar.selectedDay = null;
      render();
      break;
    case "toggle-annual":
      state.calendar.annualOpen = !state.calendar.annualOpen;
      render();
      break;
    case "set-forecast-horizon":
      state.forecastHorizon = value || "30d";
      render();
      break;

    // ---- Módulo 3: patrimônio ----
    case "wealth-months":
      state.wealth.months = Number(value) || 12;
      render();
      break;
    case "wealth-new":
      // O formulário nasce no topo da tela e o botão que o abre costuma estar no
      // fim dela; sem revelar o bloco, cadastrar parecia não fazer nada.
      state.revealTarget = "wealth-form";
      setState({ wealth: { ...state.wealth, form: freshWealthForm(), updatingId: null, confirmDeleteId: null } });
      break;
    case "wealth-set-class": {
      const cls = assetClassOf(value);
      const f = state.wealth.form || freshWealthForm();
      // Trocar para uma classe de ativo zera campos que só existem em dívida.
      state.wealth.form = { ...f, class: cls.id, monthlyPayment: cls.kind === "liability" ? f.monthlyPayment : "", dueDay: cls.kind === "liability" ? f.dueDay : "", inLedger: (cls.id === "conta" || cls.id === "carteira") ? f.inLedger : false };
      render();
      break;
    }
    case "wealth-toggle-ledger":
      if (state.wealth.form) state.wealth.form.inLedger = !state.wealth.form.inLedger;
      render();
      break;
    case "wealth-cancel":
      setState({ wealth: { ...state.wealth, form: null } });
      break;
    case "wealth-edit": {
      const a = (state.data.assets || []).find((x) => x.id === id);
      if (!a) break;
      state.wealth.form = {
        id: a.id, class: a.class, name: a.name,
        value: a.value ? a.value.toFixed(2).replace(".", ",") : "",
        monthlyPayment: a.monthlyPayment ? a.monthlyPayment.toFixed(2).replace(".", ",") : "",
        dueDay: a.dueDay ? String(a.dueDay) : "",
        note: a.note || "", inLedger: !!a.inLedger,
      };
      state.wealth.updatingId = null;
      state.wealth.confirmDeleteId = null;
      state.revealTarget = "wealth-form";
      render();
      break;
    }
    case "wealth-save": {
      const f = state.wealth.form;
      if (!f) break;
      const value = parseMoneyInput(f.value);
      if (!Number.isFinite(value) || value < 0 || !String(f.name).trim()) {
        showFormErrors({
          ...(String(f.name).trim() ? {} : { "wealth-name-input": "Informe o nome do item." }),
          ...(Number.isFinite(value) && value >= 0 ? {} : { "wealth-value-input": "Informe um valor válido." }),
        }, "Revise os dados do patrimônio"); break;
      }
      const payment = parseMoneyInput(f.monthlyPayment);
      const draft = {
        id: f.id || undefined,
        class: f.class, name: f.name, value,
        monthlyPayment: Number.isFinite(payment) ? payment : 0,
        dueDay: f.dueDay,
        note: f.note, inLedger: f.inLedger,
      };
      setData((d) => {
        const list = d.assets || [];
        if (f.id) {
          const old = list.find((x) => x.id === f.id);
          // Editar preserva o histórico e o createdAt; só o ponto do mês corrente muda.
          const next = makeAsset({ ...(old || {}), ...draft, id: f.id, createdAt: old && old.createdAt, history: old && old.history });
          return { ...d, assets: list.map((x) => (x.id === f.id ? next : x)) };
        }
        return { ...d, assets: [...list, makeAsset(draft)] };
      });
      state.wealth.form = null;
      notify(f.id ? "Item atualizado" : "Item cadastrado");
      break;
    }
    case "wealth-update-open": {
      const a = (state.data.assets || []).find((x) => x.id === id);
      setState({ wealth: { ...state.wealth, updatingId: id, confirmDeleteId: null, updateValue: a && a.value ? a.value.toFixed(2).replace(".", ",") : "" } });
      break;
    }
    case "wealth-update-cancel":
      setState({ wealth: { ...state.wealth, updatingId: null, updateValue: "" } });
      break;
    case "wealth-update-save": {
      const value = parseMoneyInput(state.wealth.updateValue);
      if (!Number.isFinite(value) || value < 0) { showFormErrors({ "wealth-update-input": "Informe um valor válido." }); break; }
      setData((d) => ({
        ...d,
        assets: (d.assets || []).map((x) => (x.id === id ? (x.kind === "liability" ? updateDebtBalance(x, value, todayIso()) : updateAssetValue(x, value)) : x)),
      }));
      state.wealth.updatingId = null;
      state.wealth.updateValue = "";
      notify("Valor atualizado");
      break;
    }
    case "wealth-delete": {
      const asset = (state.data.assets || []).find((x) => x.id === id);
      if (!asset) break;
      requestConfirmation({
        title: "Excluir item do patrimônio?",
        message: `“${asset.name}” e todo o histórico de valores serão removidos.`,
        confirmLabel: "Excluir item",
        tone: "danger",
        onConfirm: () => {
          setData((d) => ({ ...d, assets: (d.assets || []).filter((x) => x.id !== id), graveyard: withTombstones(d.graveyard, "assets", id) }));
          notify("Item excluído");
        },
      });
      break;
    }

    // ---- Módulo 5: central de investimentos ----
    case "pf-months":
      state.portfolio.months = Number(value) || 12;
      render();
      break;
    case "pf-new":
      state.revealTarget = "portfolio-form";
      setState({ portfolio: { ...state.portfolio, form: freshPortfolioForm(), updatingId: null, dividendId: null, confirmDeleteId: null } });
      break;
    case "pf-set-type": {
      const f = state.portfolio.form || freshPortfolioForm();
      state.portfolio.form = { ...f, invType: normalizeInvType(value) };
      render();
      break;
    }
    case "pf-cancel":
      setState({ portfolio: { ...state.portfolio, form: null } });
      break;
    case "pf-toggle":
      setState({ portfolio: { ...state.portfolio, expandedId: state.portfolio.expandedId === id ? null : id, updatingId: null, dividendId: null, confirmDeleteId: null } });
      break;
    case "pf-edit": {
      const a = (state.data.assets || []).find((x) => x.id === id);
      if (!a) break;
      const asMoney = (n) => (n ? n.toFixed(2).replace(".", ",") : "");
      state.portfolio.form = {
        id: a.id, invType: a.invType || "outro", name: a.name,
        value: asMoney(a.value), invested: asMoney(a.invested), dividends: asMoney(a.dividends),
        startedAt: a.startedAt || "", note: a.note || "",
      };
      state.portfolio.updatingId = null;
      state.portfolio.dividendId = null;
      state.portfolio.confirmDeleteId = null;
      state.revealTarget = "portfolio-form";
      render();
      break;
    }
    case "pf-save": {
      const f = state.portfolio.form;
      if (!f) break;
      const value = parseMoneyInput(f.value);
      if (!Number.isFinite(value) || value < 0 || !String(f.name).trim()) {
        showFormErrors({
          ...(String(f.name).trim() ? {} : { "pf-name-input": "Informe o nome da aplicação." }),
          ...(Number.isFinite(value) && value >= 0 ? {} : { "pf-value-input": "Informe o valor de mercado da aplicação." }),
        }, "Revise os dados da aplicação"); break;
      }
      const invested = parseMoneyInput(f.invested);
      const dividends = parseMoneyInput(f.dividends);
      const draft = {
        // A aplicação é um asset de classe "investimento": mesma coleção do
        // Módulo 3, para o patrimônio não contar a carteira duas vezes.
        class: "investimento", name: f.name, value,
        invType: f.invType,
        invested: Number.isFinite(invested) ? invested : 0,
        dividends: Number.isFinite(dividends) ? dividends : 0,
        startedAt: f.startedAt, note: f.note,
      };
      setData((d) => {
        const list = d.assets || [];
        if (f.id) {
          const old = list.find((x) => x.id === f.id);
          const next = makeAsset({ ...draft, id: f.id, createdAt: old && old.createdAt, history: old && old.history });
          return { ...d, assets: list.map((x) => (x.id === f.id ? next : x)) };
        }
        return { ...d, assets: [...list, makeAsset(draft)] };
      });
      state.portfolio.form = null;
      notify(f.id ? "Aplicação atualizada" : "Aplicação cadastrada");
      break;
    }
    case "pf-update-open": {
      const a = (state.data.assets || []).find((x) => x.id === id);
      setState({ portfolio: { ...state.portfolio, updatingId: id, dividendId: null, confirmDeleteId: null, updateValue: a && a.value ? a.value.toFixed(2).replace(".", ",") : "" } });
      break;
    }
    case "pf-update-cancel":
      setState({ portfolio: { ...state.portfolio, updatingId: null, updateValue: "" } });
      break;
    case "pf-update-save": {
      const value = parseMoneyInput(state.portfolio.updateValue);
      if (!Number.isFinite(value) || value < 0) { showFormErrors({ "pf-update-input": "Informe um valor válido." }); break; }
      setData((d) => ({ ...d, assets: (d.assets || []).map((x) => (x.id === id ? updateAssetValue(x, value) : x)) }));
      state.portfolio.updatingId = null;
      state.portfolio.updateValue = "";
      notify("Valor atualizado");
      break;
    }
    case "pf-dividend-open":
      setState({ portfolio: { ...state.portfolio, dividendId: id, updatingId: null, confirmDeleteId: null, dividendValue: "" } });
      break;
    case "pf-dividend-cancel":
      setState({ portfolio: { ...state.portfolio, dividendId: null, dividendValue: "" } });
      break;
    case "pf-dividend-save": {
      const value = parseMoneyInput(state.portfolio.dividendValue);
      if (!Number.isFinite(value) || value <= 0) { showFormErrors({ "pf-dividend-input": "Informe um valor de provento maior que zero." }); break; }
      setData((d) => ({
        ...d,
        assets: (d.assets || []).map((x) => (x.id === id
          ? { ...x, dividends: addMoney(x.dividends || 0, value), updatedAt: new Date().toISOString() }
          : x)),
      }));
      state.portfolio.dividendId = null;
      state.portfolio.dividendValue = "";
      notify("Provento registrado; o patrimônio não muda, só a rentabilidade");
      break;
    }
    case "pf-delete": {
      const investment = (state.data.assets || []).find((x) => x.id === id);
      if (!investment) break;
      requestConfirmation({
        title: "Excluir aplicação?",
        message: `“${investment.name}” e o histórico de valores desta aplicação serão removidos.`,
        confirmLabel: "Excluir aplicação",
        tone: "danger",
        onConfirm: () => {
          setData((d) => ({ ...d, assets: (d.assets || []).filter((x) => x.id !== id), graveyard: withTombstones(d.graveyard, "assets", id) }));
          notify("Aplicação excluída");
        },
      });
      break;
    }

    // ---- Módulo 5: simuladores ----
    case "sim-select":
      setState({ sim: { ...state.sim, id: value || "juros" } });
      break;
    case "sim-set":
      state.sim.values = { ...state.sim.values, [id]: value };
      render();
      break;
    case "rates-reset":
      setData((d) => ({ ...d, marketRates: defaultMarketRates() }));
      state.ratesDraft = {};
      notify("Premissas restauradas");
      break;

    case "toggle-health-detail":
      setState({ healthDetailId: state.healthDetailId === id ? null : id });
      break;
    case "month-prev": state.monthOffset -= 1; render(); break;
    case "month-next": state.monthOffset = Math.min(0, state.monthOffset + 1); render(); break;

    case "carry-dismiss":
      setData((d) => ({ ...d, dismissedCarryForwardMonth: keyOfCurrentMonth() }));
      break;
    case "carry-post-all": {
      const mKey = keyOfCurrentMonth();
      const pending = getPendingRecurring(state.data, mKey);
      const newTx = pending.map((t) => makeTransaction({
        type: "expense", amount: t.amount, categoryId: t.categoryId, date: todayIso(),
        payment: t.payment, description: t.description, recurring: true, source: "manual",
        accountId: t.accountId || ((state.data.accounts || []).find((a) => !a.archived) || {}).id || null,
        creditCardId: t.creditCardId || null,
      }));
      setData((d) => ({ ...d, transactions: [...d.transactions, ...newTx], dismissedCarryForwardMonth: mKey }));
      notify(plural(newTx.length, "gasto fixo lançado", "gastos fixos lançados"));
      break;
    }

    case "set-type":
      state.form.type = value;
      if (value === "income") { state.form.categoryId = null; state.form.recurring = false; state.form.payment = state.form.payment || PAYMENT_METHODS[0]; }
      else if (!state.form.categoryId) { state.form.categoryId = state.data.categories[0].id; }
      render();
      break;
    case "select-category":
      state.form.categoryId = id;
      if (typeof window !== "undefined" && window.CofreUI) window.CofreUI.forms.clearField("tx-category-group");
      dismissOverlay("category");
      break;
    case "open-category-picker": state.categoryPickerFor = id; openOverlay("category"); render(); break;
    case "close-category-picker": dismissOverlay("category"); break;
    case "select-income-source": state.form.description = value; render(); break;
    case "select-installments": state.form.installments = value; render(); break;
    case "select-payment":
      state.form.payment = value;
      if (value !== "Crédito") { state.form.installments = "1"; state.form.creditCardId = ""; }
      else if (!state.form.creditCardId) state.form.creditCardId = (((state.data.creditCards || []).find((c) => !c.archived)) || {}).id || "";
      render();
      break;
    case "toggle-recurring": state.form.recurring = !state.form.recurring; render(); break;
    case "toggle-nature-field": state.natureFieldOpen = !state.natureFieldOpen; render(); break;
    case "set-nature": {
      // A escolha do usuário vale sobre a dedução. É o que permite marcar um
      // estorno, uma transferência entre contas próprias ou os juros de uma
      // dívida, três coisas que o app não tem como adivinhar sozinho.
      const escolhida = normalizeTransactionNature(value, { ...state.form, categoryId: state.form.categoryId });
      state.form.nature = escolhida;
      // Transferência troca o editor pelo fluxo de conversão. Ele abre com as
      // contas já deduzidas do lançamento, senão a primeira coisa que a tela
      // faria seria perguntar algo que ela mesma já sabe.
      if (escolhida === "transferencia" && state.editingTxId) {
        const emEdicao = (state.data.transactions || []).find((t) => t.id === state.editingTxId) || null;
        Object.assign(state.form, transferConversionDefaults(state.form, emEdicao, state.data.accounts));
      }
      render();
      break;
    }
    case "cancel-edit": {
      const returnTab = state.editingTxReturnTab || "dashboard";
      state.editingTxId = null; state.editingTxReturnTab = "dashboard"; state.form = freshTxForm(); setState({ tab:returnTab }); break;
    }
    case "edit-tx": {
      const t = state.data.transactions.find((x) => x.id === id);
      if (!t) break;
      state.editingTxId = t.id;
      state.editingTxReturnTab = state.tab;
      state.form = {
        type: t.type, amount: t.amount.toFixed(2).replace(".", ","), categoryId: t.categoryId,
        date: t.date, payment: t.payment, description: t.description, recurring: t.recurring,
        installments: "1", source: t.source || "manual", origin: t.origin || null,
        accountId: t.accountId || "", creditCardId: t.creditCardId || "",
        // Sem esta linha, editar a descrição de um estorno o transformaria de
        // volta em renda comum na gravação.
        nature: t.nature || "",
        goalId: t.goalId || null, debtId: t.debtId || null,
        transferFromAccountId: "", transferToAccountId: "", transferCounterpartId: "",
      };
      // Um lançamento gravado com `nature: "transferencia"` por uma versão
      // anterior abre direto no fluxo de conversão; as pontas precisam existir
      // antes do primeiro desenho da tela. Nos outros casos elas ficam em branco
      // de propósito: quem escolher transferência depois deduz a direção a
      // partir do tipo que estiver valendo naquele momento, não deste.
      if (state.form.nature === "transferencia") {
        Object.assign(state.form, transferConversionDefaults(state.form, t, state.data.accounts));
      }
      setState({ tab: "add" });
      break;
    }
    case "delete-tx": {
      const tx = state.data.transactions.find((t) => t.id === id);
      if (!tx) break;
      requestConfirmation({
        title: "Excluir lançamento?",
        message: `${tx.description || "Este lançamento"} no valor de ${fmtBRL(tx.amount)} será removido do histórico.`,
        confirmLabel: "Excluir lançamento",
        tone: "danger",
        onConfirm: () => {
          setData((d) => applyGoalTransactionMutation({
            ...d,
            transactions: d.transactions.filter((t) => t.id !== id),
            graveyard: withTombstones(d.graveyard, "transactions", id),
          }, tx, null));
          if (state.editingTxId === id) { const returnTab = state.editingTxReturnTab || "dashboard"; state.editingTxId = null; state.editingTxReturnTab = "dashboard"; state.form = freshTxForm(); setState({ tab:returnTab }); }
          notify("Lançamento excluído");
        },
      });
      break;
    }
    case "submit-tx": {
      const f = state.form;
      // Converter não é salvar: o resultado não é uma transação, então nada do
      // caminho comum (categoria obrigatória, impacto no orçamento, parcelas)
      // se aplica aqui.
      if (state.editingTxId && f.nature === "transferencia") { commitTransferConversion(); break; }
      const amt = parseMoneyInput(f.amount);
      if (!(amt > 0) || !moneyWithinMax(amt) || (f.type === "expense" && !f.categoryId)) {
        showFormErrors({
          ...(amt > 0 && moneyWithinMax(amt) ? {} : { "tx-amount-input": amt > 0 ? moneyMaxMessage("Valor") : "Informe um valor maior que zero, com até duas casas decimais." }),
          ...(f.type !== "expense" || f.categoryId ? {} : { "tx-category-group": "Escolha uma categoria." }),
        }, "Revise os dados do lançamento"); break;
      }

      // Avaliado ANTES de gravar, para o alerta de teto refletir o estado em que
      // o usuário tomou a decisão (e não o estado já com o gasto embutido).
      const impact = f.type === "expense" ? evaluateBudgetImpact(state.data, f.categoryId, amt, monthKeyOf(f.date)) : null;

      if (state.editingTxId) {
        const txId = state.editingTxId;
        setData((d) => {
          const before = d.transactions.find((t) => t.id === txId);
          const after = before ? updateTransaction(before, {
            type: f.type, amount: amt, categoryId: f.categoryId, date: f.date,
            payment: f.payment, description: f.description, recurring: f.recurring, nature: f.nature,
            accountId: f.payment === "Crédito" ? null : (f.accountId || null),
            creditCardId: f.payment === "Crédito" ? (f.creditCardId || null) : null,
          }) : null;
          return applyGoalTransactionMutation({
            ...d,
            transactions: d.transactions.map((t) => t.id === txId && after ? after : t),
          }, before, after);
        });
        notify("Lançamento atualizado");
      } else {
        const installments = f.type === "expense" && f.payment === "Crédito"
          ? clamp(parseInt(f.installments, 10) || 1, 1, 48) : 1;
        const newTxs = makeInstallmentTransactions({
          type: f.type, amount: amt, categoryId: f.categoryId, date: f.date,
          payment: f.payment, description: f.description, recurring: f.recurring, nature: f.nature,
          origin: f.origin || undefined,
          source: f.source || "manual",
          accountId: f.payment === "Crédito" ? null : (f.accountId || null),
          creditCardId: f.payment === "Crédito" ? (f.creditCardId || null) : null,
        }, installments);
        setData((d) => ({ ...d, transactions: [...d.transactions, ...newTxs] }));
        notify(installments > 1
          ? `Gasto parcelado em ${installments}x salvo`
          : (f.type === "income" ? "Receita salva" : "Gasto salvo"));
      }

      const returnTab = state.editingTxReturnTab || "dashboard";
      state.editingTxId = null;
      state.editingTxReturnTab = "dashboard";
      state.form = freshTxForm();
      setState({ tab:returnTab });
      announceBudgetCrossings(impact);
      break;
    }

    case "toggle-goal-form":
      state.goalForm.show = !state.goalForm.show;
      state.editingGoalId = null;
      if (!state.goalForm.show) state.goalForm = freshGoalForm();
      render();
      break;
    case "cancel-goal-form":
      state.goalForm = freshGoalForm();
      state.editingGoalId = null;
      render();
      break;
    case "set-goal-icon": state.goalForm.icon = value; render(); break;
    // [M4] Modelo de meta: só pré-preenche o formulário (nome, ícone, prazo
    // sugerido). Nada é criado sem o usuário confirmar.
    case "goal-template": {
      const tpl = goalTemplateById(value);
      if (!tpl) break;
      // Mesmo formato de string do caminho de edição ("1234,56"), senão o campo
      // abre com ponto decimal e o saneamento de entrada o trata como milhar.
      const alvoSugerido = goalTemplateTarget(tpl, state.data);
      state.goalForm = {
        ...freshGoalForm(), show: true,
        name: tpl.name, icon: GOAL_ICON_OPTIONS.includes(tpl.icon) ? tpl.icon : "piggy",
        deadline: goalTemplateDeadline(tpl),
        target: alvoSugerido > 0 ? alvoSugerido.toFixed(2).replace(".", ",") : "",
      };
      state.editingGoalId = null;
      render();
      break;
    }
    // [M4] Edição: o mesmo formulário serve para criar e editar. O valor
    // guardado NÃO é editável aqui; ele só muda por aporte/resgate, senão o
    // saldo da meta passaria a discordar dos lançamentos que o alimentaram.
    case "edit-goal": {
      const g = state.data.goals.find((x) => x.id === id);
      if (!g) break;
      state.editingGoalId = g.id;
      state.goalForm = {
        show: true, name: g.name,
        target: g.target ? g.target.toFixed(2).replace(".", ",") : "",
        savedUpfront: g.current ? g.current.toFixed(2).replace(".", ",") : "",
        deadline: g.deadline || "",
        icon: GOAL_ICON_OPTIONS.includes(g.icon) ? g.icon : "piggy",
        monthlyPlan: g.monthlyPlan ? g.monthlyPlan.toFixed(2).replace(".", ",") : "",
      };
      state.expandedGoalId = null;
      render();
      break;
    }
    case "submit-goal": {
      const gf = { ...state.goalForm };
      const target = parseMoneyInput(gf.target);
      const savedUpfront = moneyOrZero(gf.savedUpfront);
      const monthlyPlan = moneyOrZero(gf.monthlyPlan);
      if (!gf.name.trim() || !(target > 0) || !moneyWithinMax(target) || savedUpfront < 0 || monthlyPlan < 0) {
        showFormErrors({
          ...(gf.name.trim() ? {} : { "goal-name-input": "Informe o nome da meta." }),
          ...(target > 0 && moneyWithinMax(target) ? {} : { "goal-target-input": target > 0 ? moneyMaxMessage("Valor alvo") : "Informe um valor alvo maior que zero." }),
          ...(savedUpfront >= 0 ? {} : { "goal-saved-input": "O valor inicial não pode ser negativo." }),
          ...(monthlyPlan >= 0 ? {} : { "goal-plan-input": "O aporte mensal não pode ser negativo." }),
        }, "Revise os dados da meta"); break;
      }
      const editingId = state.editingGoalId;
      const commitGoal = (initialSource) => {
        if (editingId) {
          setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === editingId
            ? { ...g, name: gf.name.trim(), target, deadline: gf.deadline, icon: gf.icon, monthlyPlan }
            : g)) }));
          notify("Meta atualizada");
        } else {
          setData((d) => createGoalWithInitialBalance(d, {
            name: gf.name.trim(), target, savedUpfront, deadline: gf.deadline,
            icon: gf.icon, monthlyPlan,
          }, initialSource || "cash", defaultCashAccountId()));
          notify("Meta criada");
        }
        state.goalForm = freshGoalForm();
        state.editingGoalId = null;
      };
      if (!editingId && savedUpfront > 0) {
        requestConfirmation({
          title: "De onde vem o valor inicial?",
          message: `${fmtBRL(savedUpfront)} pode sair do seu saldo agora ou ser um valor que já estava guardado antes.`,
          confirmLabel: "Tirar do saldo",
          icon: "wallet",
          onConfirm: () => commitGoal("cash"),
          alternateLabel: "Já estava guardado",
          alternateIcon: "archive",
          onAlternate: () => commitGoal("existing"),
        });
        break;
      }
      commitGoal("cash");
      break;
    }
    case "delete-goal": {
      const goal = state.data.goals.find((g) => g.id === id);
      if (!goal) break;
      requestConfirmation({
        title: "Excluir meta?",
        message: `A meta “${goal.name}” será removida. Os lançamentos de aporte e resgate continuam no histórico.`,
        confirmLabel: "Excluir meta",
        tone: "danger",
        onConfirm: () => {
          if (state.editingGoalId === id) { state.editingGoalId = null; state.goalForm = freshGoalForm(); }
          setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id), graveyard: withTombstones(d.graveyard, "goals", id) }));
          notify("Meta excluída");
        },
      });
      break;
    }
    case "expand-goal":
      state.expandedGoalId = id;
      state.goalActionMode = value === "resgatar" ? "resgatar" : "aportar";
      state.goalContribution = "";
      render();
      break;
    case "collapse-goal":
      state.expandedGoalId = null; state.goalContribution = "";
      render();
      break;
    case "submit-goal-action": {
      const goal = state.data.goals.find((g) => g.id === id);
      const val = parseMoneyInput(state.goalContribution);
      if (!goal || !(val > 0)) { showFormErrors({ "goal-contribution-input": "Informe um valor maior que zero." }); break; }
      if (state.goalActionMode === "resgatar") {
        if (moneyCompare(val, goal.current) > 0) { showFormErrors({ "goal-contribution-input": "O valor não pode superar o total guardado na meta." }); break; }
        const withdrawal = goalWithdrawalPlan(goal, val);
        const cashReturn = withdrawal.cashReturn;
        const existingRelease = withdrawal.existingRelease;
        // Somente a parcela que saiu do caixa em aportes pode voltar como receita.
        // A parte informada como anterior já continua incluída no saldo e é
        // liberada primeiro.
        setData((d) => ({
          ...d,
          goals: d.goals.map((g) => g.id === id ? {
            ...g,
            current: withdrawal.current,
            existingBalance: withdrawal.existingBalance,
          } : g),
          transactions: cashReturn > 0 ? [...d.transactions, makeTransaction({
            type: "income", amount: cashReturn, categoryId: "investimento",
            date: todayIso(), payment: "Outro", description: `Resgate: ${goal.name}`, goalId: id,
            accountId: defaultCashAccountId(),
          })] : d.transactions,
        }));
        notify(existingRelease > 0 ? "Valor liberado da meta sem alterar o saldo" : "Valor resgatado da meta");
      } else {
        // Aporte: sai do saldo livre do mês atual (lançamento de despesa) e entra no progresso da meta.
        setData((d) => ({
          ...d,
          goals: d.goals.map((g) => g.id === id ? { ...g, current: addMoney(g.current, val) } : g),
          transactions: [...d.transactions, makeTransaction({
            type: "expense", amount: val, categoryId: "investimento",
            date: todayIso(), payment: "Outro", description: `Aporte: ${goal.name}`, goalId: id,
            accountId: defaultCashAccountId(),
          })],
        }));
        notify("Aporte registrado");
      }
      state.expandedGoalId = null; state.goalContribution = "";
      break;
    }

    case "set-sim-mode": state.simulate.mode = value; render(); break;
    case "set-invest-rate": state.invest.taxa = value; render(); break;
    case "toggle-score-detail": state.scoreExpanded = !state.scoreExpanded; render(); break;
    case "toggle-whatif": state.whatIf.open = !state.whatIf.open; render(); break;
    case "set-whatif-mode": state.whatIf.mode = value; render(); break;
    case "set-whatif-rate": state.whatIf.taxa = value; render(); break;
    // Acordeão de Ajustes: um tópico por vez. Tocar no que já está aberto
    // fecha, para dar como voltar ao índice sem ter de abrir outro assunto.
    case "settings-section":
      state.settingsSection = state.settingsSection === value ? null : value;
      render();
      break;
    case "toggle-theme": setData((d) => ({ ...d, theme: d.theme === "dark" ? "light" : "dark" })); break;
    case "toggle-gamification": {
      const enabled = !(state.data.achievements && state.data.achievements.enabled);
      state.gamification.celebrating = [];
      setData((d) => ({
        ...d,
        achievements: { ...normalizeAchievements(d.achievements), enabled },
      }));
      notify(enabled ? "Conquistas ativadas" : "Conquistas desativadas");
      break;
    }
    // ---- Central de categorias ----
    case "cat-view": state.categoriesUi.view = value; render(); break;
    case "cat-search-clear": state.categoriesUi.search = ""; render(); break;
    case "cat-toggle": {
      const collapsed = state.categoriesUi.collapsed || [];
      state.categoriesUi.collapsed = collapsed.indexOf(id) === -1
        ? collapsed.concat([id])
        : collapsed.filter((catId) => catId !== id);
      render();
      break;
    }
    // Um único editor cria e edita. Sem id, é criação (podendo já nascer dentro
    // de uma categoria-mãe, quando o clique veio do "+" dela).
    case "cat-editor-open": {
      const existing = id ? state.data.categories.find((c) => c.id === id) : null;
      state.categoriesUi.editor = existing
        ? freshCategoryEditor({
            id: existing.id,
            name: existing.name,
            parentId: existing.parentId || "",
            group: categoryGroup(state.data, existing.id),
            icon: existing.icon,
            color: existing.color,
            budget: existing.budget ? existing.budget.toFixed(2).replace(".", ",") : "",
          })
        : freshCategoryEditor({ parentId: btn.dataset.parent || "" });
      openOverlay("category-editor");
      render();
      break;
    }
    case "cat-editor-close": dismissOverlay("category-editor"); break;
    case "cat-editor-set-parent": if (state.categoriesUi.editor) { state.categoriesUi.editor.parentId = value || ""; render(); } break;
    case "cat-editor-set-group": if (state.categoriesUi.editor) { state.categoriesUi.editor.group = value; render(); } break;
    case "cat-editor-set-icon": if (state.categoriesUi.editor) { state.categoriesUi.editor.icon = value; render(); } break;
    case "cat-editor-set-color": if (state.categoriesUi.editor) { state.categoriesUi.editor.color = value; render(); } break;
    case "cat-editor-suggest": if (state.categoriesUi.editor) { state.categoriesUi.editor.budget = String(value).replace(".", ","); render(); } break;
    case "cat-editor-save": {
      const draft = state.categoriesUi.editor;
      if (!draft) break;
      const name = String(draft.name || "").trim().slice(0, 60);
      if (!name) { showFormErrors({ "cat-editor-name": "Dê um nome para a categoria." }, "A categoria precisa de um nome"); break; }
      const budget = normalizeBudgetValue(draft.budget);
      // Categoria com filhas não pode virar filha: o modelo tem um nível só, e
      // aninhar mais esconderia gasto de todos os tetos.
      const parentId = draft.id && childCategories(state.data, draft.id).length > 0 ? null : (draft.parentId || null);
      const group = BUDGET_GROUPS.includes(draft.group) ? draft.group : "necessidade";
      const patch = { name, parentId, group, icon: draft.icon, color: draft.color, budget };
      setData((d) => withBudgetSnapshot(draft.id
        ? { ...d, categories: d.categories.map((c) => c.id === draft.id ? { ...c, ...patch } : c) }
        : { ...d, categories: [...d.categories, { id: uid(), ...patch }] }));
      dismissOverlay("category-editor");
      notify(draft.id ? "Categoria atualizada" : "Categoria criada");
      break;
    }
    case "cat-editor-delete": if (state.categoriesUi.editor) { state.categoriesUi.editor.confirmDelete = true; render(); } break;
    case "cat-editor-delete-cancel": if (state.categoriesUi.editor) { state.categoriesUi.editor.confirmDelete = false; render(); } break;
    case "cat-editor-delete-confirm": {
      const draft = state.categoriesUi.editor;
      if (!draft || !draft.id) break;
      // Excluir categoria nunca apaga lançamento: o histórico é o que o usuário
      // digitou, a categoria é só a etiqueta. Eles voltam para "Outros".
      const idsToRemove = new Set([draft.id, ...childCategories(state.data, draft.id).map((c) => c.id)]);
      setData((d) => withBudgetSnapshot({
        ...d,
        categories: d.categories.filter((c) => !idsToRemove.has(c.id)),
        graveyard: withTombstones(d.graveyard, "categories", Array.from(idsToRemove)),
        transactions: d.transactions.map((t) => idsToRemove.has(t.categoryId) ? { ...t, categoryId: "outros" } : t),
      }));
      dismissOverlay("category-editor");
      notify("Categoria excluída");
      break;
    }

    case "export-csv": exportTransactionsCsv(); break;
    case "export-statement-pdf": exportStatementPdf(); break;
    case "export-budgets-csv": exportBudgetsCsv(); break;
    case "export-json": exportBackupJson(); break;
    case "import-json-trigger": document.getElementById("import-file-input").click(); break;
    case "backup-set-mode": state.backup.mode = value; render(); break;
    case "backup-cancel": state.backup = { preview: null, error: null, mode: "merge", busy: false, undoAvailable: state.backup.undoAvailable }; render(); break;
    case "backup-confirm": confirmBackupRestore(); break;
    case "backup-undo": undoBackupRestore(); break;

    // ---- Feature 3: orçamentos ----
    case "toggle-budgets": state.budgetsExpanded = !state.budgetsExpanded; render(); break;
    case "apply-budget-suggestion": {
      const n = moneyOrZero(value);
      if (!(n > 0)) break;
      setData((d) => withBudgetSnapshot({ ...d, categories: d.categories.map((c) => c.id === id ? { ...c, budget: n } : c) }));
      notify(`Teto de ${fmtBRL(n)} definido`);
      break;
    }
    case "seed-budgets-from-split": {
      const seeds = seedBudgetsFromSplit(state.data, effectiveIncome(state.data, keyOfCurrentMonth()), state.data.budgetSplit);
      if (seeds.items.length === 0) {
        notify("Nada a sugerir: informe sua renda em Ajustes ou preencha os tetos que faltam", "warn");
        break;
      }
      // Um rascunho digitado e não confirmado venceria o valor recém-gravado na
      // hora de redesenhar o campo. Limpar o rascunho das categorias semeadas faz
      // o campo mostrar o que de fato ficou gravado, não o que sobrou da digitação.
      seeds.items.forEach((item) => { delete state.categoryBudgetDrafts[item.categoryId]; });
      setData((d) => withBudgetSnapshot({ ...d, categories: categoriesWithSeededBudgets(d.categories, seeds) }));
      notify(`Tetos sugeridos em ${plural(seeds.items.length, "categoria", "categorias")}`);
      break;
    }

    // ---- Feature 4: lançamento inteligente ----
    case "nlp-parse": runNaturalEntryParse(); break;
    case "nlp-clear": state.nlp = { text: "", drafts: [], error: null, loading: false, touched: false }; render(); break;
    case "nlp-example": state.nlp.text = value || ""; runNaturalEntryParse(); break;
    case "nlp-set-category": {
      const draft = state.nlp.drafts[Number(btn.dataset.index)];
      if (draft) { draft.categoryId = id; draft.categorySource = "manual"; draft.missing = draft.missing.filter((m) => m !== "categoria"); }
      render();
      break;
    }
    case "nlp-remove-draft": state.nlp.drafts.splice(Number(id), 1); render(); break;
    case "nlp-edit-draft": {
      const draft = state.nlp.drafts[Number(id)];
      if (!draft) break;
      applyNaturalDraftToForm(draft);
      state.nlp = { text: "", drafts: [], error: null, loading: false, touched: false };
      setState({ tab: "add" });
      break;
    }
    case "nlp-confirm": commitNaturalDrafts(); break;
    case "nlp-ai-refine": refineNaturalEntryWithAi(); break;

    case "set-period": state.analyticsPeriod = value; state.analyticsLimit = 30; render(); break;
    case "load-more": state.analyticsLimit += 30; patchTxHistory(); break;
    case "request-ai-insight": requestAiInsight(); break;
    case "ai-preview-cancel": dismissOverlay("ai-preview"); break;
    case "ai-preview-send": confirmAiPreview(); break;
    // Sem `render()` de propósito: o <details> já abre e fecha sozinho, e
    // rerrenderizar aqui brigaria com ele. O estado é anotado para o PRÓXIMO
    // render, disparado ao marcar um campo, não fechar o pacote no meio da
    // conferência.
    case "ai-preview-toggle-json": state.aiPreview = { ...state.aiPreview, showJson: !state.aiPreview.showJson }; break;

    // ---- Importador de extratos ----
    case "statement-dropzone-click": document.getElementById("statement-file-input").click(); break;
    case "import-toggle": {
      const idx = Number(id);
      if (state.importRows && state.importRows[idx]) {
        state.importRows[idx].include = !state.importRows[idx].include;
        state.importRows[idx].includeTouched = true;
      }
      render();
      break;
    }
    case "import-cancel":
      state.importRows = null; state.importFilename = null; state.importError = null;
      state.importPendingFile = null; state.importPassword = ""; state.importDestinationId = "";
      render();
      break;
    case "dismiss-import-error":
      state.importError = null; state.importPendingFile = null; state.importPassword = ""; render(); break;
    case "import-password-retry":
      if (state.importPendingFile) handleStatementFile(state.importPendingFile, state.importPassword);
      break;
    case "import-confirm": {
      const included = (state.importRows || []).filter((r) => r.include);
      const meta = (state.importRows && state.importRows.meta) || {};
      const documentKind = state.importDocumentKind === "card" ? "card" : "account";
      const destinations = documentKind === "card"
        ? (state.data.creditCards || []).filter((card) => !card.archived)
        : (state.data.accounts || []).filter((account) => !account.archived);
      const destinationId = destinations.some((item) => item.id === state.importDestinationId)
        ? state.importDestinationId
        : (destinations[0] ? destinations[0].id : "");
      if (!destinationId) {
        notify(documentKind === "card" ? "Cadastre ou escolha um cartão" : "Cadastre ou escolha uma conta", "warn");
        break;
      }
      let records = null;
      try {
        records = buildImportRecordsFromRows(included, meta.format, { documentKind, destinationId }, state.importFilename, state.data.accounts);
      } catch (error) {
        if (error && error.code === "IMPORT_TRANSFER_ACCOUNT") {
          notify(error.message || "Escolha a outra conta da transferência", "warn");
          render();
          break;
        }
        throw error;
      }
      const newTx = records.transactions;
      const newTransfers = records.accountTransfers;
      setData((d) => ({
        ...d,
        transactions: [...d.transactions, ...newTx],
        accountTransfers: [...(d.accountTransfers || []), ...newTransfers],
      }));
      state.importRows = null; state.importFilename = null; state.importDestinationId = "";
      const importedParts = [];
      if (newTx.length) importedParts.push(plural(newTx.length, "lançamento importado", "lançamentos importados"));
      if (newTransfers.length) importedParts.push(plural(newTransfers.length, "transferência registrada", "transferências registradas"));
      notify(importedParts.join(" e "));
      setState({ tab: "dashboard" });
      break;
    }

    // ---- Leitor de QR da nota ----
    case "open-qr": state.qr = { open: true, scanning: false, error: null, checking: false, draft: null }; openOverlay("qr"); render(); break;
    case "close-qr": dismissOverlay("qr"); break;
    case "qr-select-category":
      if (state.qr.draft) { state.qr.draft.categoryId = id; state.qr.draft.categorySource = "manual"; }
      render();
      break;
    case "qr-to-form": {
      const d0 = state.qr.draft;
      if (!d0) break;
      QrScanner.stop();
      applyQrDraftToForm(d0);
      state.qr = { open: false, scanning: false, error: null, checking: false, draft: null };
      setState({ tab: "add" });
      break;
    }
    case "qr-save": {
      const d0 = state.qr.draft;
      if (!d0) break;
      const amt = parseMoneyInput(d0.amount);
      if (!(amt > 0)) { notify("Informe o valor"); break; }
      const impact = evaluateBudgetImpact(state.data, d0.categoryId, amt, keyOfCurrentMonth());
      const tx = makeTransaction({
        type: "expense", amount: amt, categoryId: d0.categoryId || "outros",
        date: todayIso(), payment: d0.payment || "Outro",
        description: d0.description || (d0.kind === "pix" ? "Pagamento via Pix" : "Compra via QR"),
        source: d0.source,
        accountId: defaultCashAccountId(),
      });
      setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
      QrScanner.stop();
      state.qr = { open: false, scanning: false, error: null, checking: false, draft: null };
      notify(d0.kind === "pix" ? "Pix lançado como gasto" : "Gasto lançado a partir da nota");
      render();
      announceBudgetCrossings(impact);
      break;
    }

    // ---- Resumo mensal "Wrapped" ----
    case "open-wrapped": state.wrapped.open = true; openOverlay("wrapped"); render(); break;
    case "close-wrapped": dismissOverlay("wrapped"); break;
    case "wrapped-share": {
      const canvas = document.getElementById("wrapped-canvas");
      if (canvas) shareOrDownloadCanvas(canvas, `resumo-financeiro-${keyOfCurrentMonth()}.png`);
      break;
    }
  }
}
