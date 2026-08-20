"use strict";

const ACCOUNT_ENDPOINT = "/api/account";
const ACCOUNT_DEVICE_KEY = "cofre_device_id";

function accountDeviceId() {
  try {
    let value = localStorage.getItem(ACCOUNT_DEVICE_KEY);
    if (/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(value || "")) return value;
    value = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(ACCOUNT_DEVICE_KEY, value);
    return value;
  } catch (_) { return `device_${Date.now()}_memory`; }
}

function accountDeviceLabel() {
  const platform = typeof navigator !== "undefined" ? String(navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || "") : "";
  return platform ? `Navegador em ${platform}`.slice(0, 50) : "Este navegador";
}

function freshAccountState() {
  return {
    loading: true, configured: null, authenticated: false, email: "", userId: "", mode: "login", busy: false, error: "", message: "",
    // Email cadastrado que ainda espera confirmação. Enquanto ele existe, a
    // tela mostra o cartão de "confirmação pendente" com o botão de reenvio;
    // antes disto, quem não recebia o email não tinha para onde ir.
    pendingEmail: "",
    form: { email: "", password: "", newPassword: "", deletePassword: "", deleteText: "" }, devices: [],
  };
}

// ------------------------------------------------------------------------------
// ESCOPO DE DADOS POR CONTA
// ------------------------------------------------------------------------------
// Cada conta tem seu próprio banco local (ver storageScopeFor em storage.js).
// Este bloco é quem mantém o banco carregado igual à sessão atual: entrar troca
// o escopo, sair volta para o de visitante, e NADA é copiado entre eles sem o
// usuário mandar.
const GUEST_IMPORT_PREFIX = "cofre_guest_import_";

function guestImportDecision(scope) {
  try { return localStorage.getItem(GUEST_IMPORT_PREFIX + scope) || ""; }
  catch (_) { return ""; }
}

function rememberGuestImportDecision(scope, decision) {
  try { localStorage.setItem(GUEST_IMPORT_PREFIX + scope, decision); } catch (_) {}
}

// Troca o banco carregado. Só é chamada quando a sessão foi CONFIRMADA pelo
// servidor: uma falha de rede não pode derrubar o usuário para o escopo de
// visitante e fazer parecer que os dados sumiram.
async function applyAccountScope(userId) {
  const desired = storageScopeFor(userId);
  if (desired === FinanceStore.scope()) return false;

  // O que estava na fila pertence ao escopo que está saindo; grave antes.
  try { await FinanceStore.flush(); } catch (_) {}
  if (typeof CloudSync !== "undefined") CloudSync.disable();

  state.data = await switchStorageScope(desired);
  state.storageOk = isStorageAvailable();
  // Tudo que a tela guardava era daquele escopo: seleção, formulário aberto,
  // rascunho de importação, pré-visualização de backup. Nada disso vale para a
  // conta que entrou agora.
  resetScopedUiState();
  render();

  if (desired !== "guest") await offerGuestImport(desired);
  return true;
}

// Estado de tela derivado dos dados. Sem esta limpeza, um id selecionado na
// conta anterior continuaria apontado depois da troca.
function resetScopedUiState() {
  state.form = freshTxForm();
  state.editingTxId = null;
  state.movementDetailId = null;
  state.movementSelectedIds = [];
  state.expandedGoalId = null;
  state.categoryPickerFor = null;
  state.confirmation = null;
  state.overlayStack = [];
  state.importRows = null;
  state.importFilename = null;
  state.importError = null;
  state.aiInsight = { loading: false, text: null, error: null, analise: null };
  state.backup = { preview: null, error: null, mode: "merge", busy: false, undoAvailable: !!FinanceStore.readUndoSnapshot() };
  state.onboarding.open = !(state.data.onboarding && state.data.onboarding.done);
  // A memoização do app é por IDENTIDADE do snapshot; `switchStorageScope`
  // devolve um objeto novo, então os caches derivados erram por construção.
}

// Dados de visitante só entram numa conta com confirmação EXPLÍCITA, e a
// resposta fica registrada para a pergunta não voltar a cada login.
async function offerGuestImport(scope) {
  if (guestImportDecision(scope)) return;
  let guest;
  try { guest = await FinanceStore.peekScope("guest"); }
  catch (_) { return; }
  if (!guest || !guest.exists) { rememberGuestImportDecision(scope, "empty"); return; }

  const partes = [];
  if (guest.transactions) partes.push(`${guest.transactions} lançamento${guest.transactions > 1 ? "s" : ""}`);
  if (guest.goals) partes.push(`${guest.goals} meta${guest.goals > 1 ? "s" : ""}`);
  if (guest.assets) partes.push(`${guest.assets} item${guest.assets > 1 ? "ns" : ""} de patrimônio`);

  requestConfirmation({
    title: "Trazer os dados deste aparelho?",
    message: `Este navegador tem ${partes.join(", ")} salvos sem conta. Você quer copiá-los para ${state.account.email || "esta conta"}? Se recusar, eles continuam disponíveis ao sair da conta.`,
    confirmLabel: "Copiar para a conta",
    cancelLabel: "Manter separados",
    icon: "upload",
    onConfirm: async () => {
      const result = await FinanceStore.adoptScope("guest");
      rememberGuestImportDecision(scope, "imported");
      if (result && result.ok) {
        state.data = FinanceStore.snapshot();
        render();
        notify("Dados do aparelho copiados para a conta");
        if (typeof CloudSync !== "undefined") CloudSync.schedule();
      } else notify("Não foi possível copiar os dados deste aparelho", "danger");
    },
  });
  // Recusar também é resposta: sem registrar, a pergunta voltaria no próximo
  // login e viraria insistência.
  rememberGuestImportDecision(scope, "asked");
}

const AccountAPI = (() => {
  async function request(path, options) {
    const o = options || {};
    if (typeof location !== "undefined" && location.protocol === "file:") {
      if (path === "session") return { ok: true, configured: false, authenticated: false };
      throw new Error("O serviço de conta exige o site publicado.");
    }
    let response;
    try {
      response = await fetch(`${ACCOUNT_ENDPOINT}/${path}`, {
        method: o.method || "GET", credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Device-Id": accountDeviceId(), "X-Device-Label": accountDeviceLabel() },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
    } catch (_) { throw new Error("Não foi possível acessar o serviço de conta."); }
    if (response.status === 404 && path === "session") return { ok: true, configured: false, authenticated: false };
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) {
      const error = new Error(payload && payload.message || "Não foi possível concluir a operação.");
      error.code = payload && payload.code || "request_failed";
      throw error;
    }
    return payload;
  }
  return {
    session: () => request("session"), register: (body) => request("register", { method: "POST", body }),
    login: (body) => request("login", { method: "POST", body }), recover: (body) => request("recover", { method: "POST", body }),
    resend: (email) => request("resend", { method: "POST", body: { email } }),
    exchange: (code) => request("exchange", { method: "POST", body: { code } }),
    verify: (tokenHash, type) => request("verify", { method: "POST", body: { tokenHash, type } }),
    logout: () => request("logout", { method: "POST", body: {} }),
    password: (password) => request("password", { method: "POST", body: { password } }), devices: () => request("devices"),
    revokeDevice: (deviceId) => request("revoke-device", { method: "POST", body: { deviceId } }),
    deleteAccount: (password, confirmation) => request("delete", { method: "POST", body: { password, confirmation } }),
  };
})();

function accountSetBusy(busy, error) {
  state.account.busy = busy;
  state.account.error = error || "";
  render();
}

async function refreshAccountSession() {
  // "O servidor respondeu" é diferente de "o servidor disse que não há sessão".
  // Só a segunda pode trocar o escopo de dados; a primeira, num aparelho sem
  // rede, faria a conta parecer vazia.
  let sessionKnown = false;
  try {
    const result = await AccountAPI.session();
    sessionKnown = true;
    state.account.configured = result.configured !== false;
    state.account.authenticated = !!result.authenticated;
    state.account.email = result.email || "";
    state.account.userId = result.userId || "";
    state.account.loading = false;
    // O servidor devolve a sessão pendente em vez de simplesmente negar: é
    // assim que a tela sabe oferecer o reenvio para o endereço certo.
    if (result.pendingConfirmation) state.account.pendingEmail = result.email || state.account.pendingEmail;
    else if (state.account.authenticated) state.account.pendingEmail = "";
    if (state.account.authenticated) {
      try {
        const devices = await AccountAPI.devices();
        state.account.devices = devices.devices || [];
      } catch (error) {
        state.account.devices = [];
        if (error.code === "device_revoked" || error.code === "session_expired") {
          state.account.authenticated = false;
          state.account.email = "";
          state.account.error = error.message;
        }
      }
    } else state.account.devices = [];
  } catch (error) {
    state.account.loading = false;
    state.account.configured = true;
    state.account.authenticated = false;
    state.account.error = error.message;
  }

  // O banco carregado precisa ser o da sessão ANTES de qualquer sincronização;
  // ligar o sync antes da troca enviaria os dados de uma conta para a outra.
  if (sessionKnown) {
    try { await applyAccountScope(state.account.authenticated ? state.account.userId : ""); }
    catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("storage", error, "scope_switch");
      notify("Não foi possível abrir os dados desta conta neste aparelho", "danger");
      render();
      return;
    }
  }

  // A sincronização segue a sessão: liga quando há conta confirmada e para
  // assim que ela deixa de existir. `enable()` já faz a primeira volta completa
  // (puxa o remoto, funde e devolve), então é aqui que um aparelho novo recebe
  // o histórico. Não é aguardado para não segurar a pintura da tela de conta.
  if (typeof CloudSync !== "undefined") {
    if (state.account.authenticated) CloudSync.enable().catch(() => {});
    else CloudSync.disable();
  }
  render();
}

// ------------------------------------------------------------------------------
// O RETORNO DO LINK DO EMAIL
// ------------------------------------------------------------------------------
// O endereço pode voltar de duas formas, e antes só a primeira era entendida:
//
//   ?code=...                     fluxo PKCE, o caminho normal deste app;
//   ?error=...&error_code=...     o Supabase recusou o link (expirado, já usado),
//                                 na query ou depois do `#`.
//
// A segunda caía em "O link não trouxe um código válido", que não diz nem o
// que houve nem o que fazer. Um link expirado precisa dizer que expirou.
//
// Este aplicativo NÃO lê credencial nenhuma do endereço: a sessão vive em
// cookie HttpOnly, emitido pelo servidor. O que se procura aqui é só o aviso
// de erro. Ver a checagem "frontend usa cookies" em tests/test-account-backend.js.
//
// O `#` também é onde mora a ROTA do aplicativo (`#/conta-e-acesso`). Um hash
// que começa com barra é rota, nunca retorno de email.
function authCallbackError() {
  const bruto = String(location.hash || "");
  if (!bruto || bruto.startsWith("#/")) return "";
  let params;
  try { params = new URLSearchParams(bruto.slice(1)); } catch (_) { return ""; }
  return params.get("error_code") || params.get("error") || "";
}

// O que o Supabase manda no endereço quando recusa o link. Traduzir aqui evita
// jogar o código cru do provedor na cara de quem só queria entrar.
function authLinkErrorMessage(codigo) {
  if (/expired/i.test(codigo)) return "Este link expirou. Peça um novo pela tela de conta.";
  if (/access_denied|used|invalid/i.test(codigo)) return "Este link não vale mais. Ele pode já ter sido usado.";
  return "O link não trouxe um código válido.";
}

async function bootstrapAccount() {
  const params = new URLSearchParams(location.search || "");
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const callback = params.get("auth_callback");
  const recuperacao = callback === "recovery";
  const erroNaQuery = params.get("error_code") || params.get("error") || "";
  const erroNoHash = authCallbackError();
  let consumiu = false;

  // O `token_hash` vem primeiro porque e o caminho novo, o que funciona em
  // qualquer aparelho. Um link so traz um dos dois; a ordem decide caso o
  // modelo de email seja trocado enquanto ainda ha link antigo circulando.
  if (tokenHash) {
    consumiu = true;
    try {
      const result = await AccountAPI.verify(tokenHash, params.get("type") || (recuperacao ? "recovery" : "signup"));
      state.account.authenticated = true;
      state.account.email = result.email || "";
      state.account.pendingEmail = "";
      state.account.mode = result.purpose === "recovery" ? "password" : "login";
      state.account.message = result.purpose === "recovery"
        ? "Defina uma nova senha para concluir a recuperação."
        : "Email confirmado. Sua conta está pronta.";
    } catch (error) { state.account.error = error.message; }
  } else if (code) {
    consumiu = true;
    try {
      const result = await AccountAPI.exchange(code);
      state.account.authenticated = true;
      state.account.email = result.email || "";
      state.account.pendingEmail = "";
      state.account.mode = result.purpose === "recovery" ? "password" : "login";
      state.account.message = result.purpose === "recovery" ? "Defina uma nova senha para concluir a recuperação." : "Email confirmado. Sua conta está pronta.";
    } catch (error) {
      // `verifier_missing` NÃO é link quebrado: é link aberto em outro
      // navegador. No cadastro, o email já foi confirmado do lado do servidor
      // antes de chegar aqui, então a notícia é boa e o passo seguinte é
      // entrar. Na recuperação não dá para seguir: a nova senha precisa do
      // navegador que pediu.
      if (error.code === "verifier_missing" && !recuperacao) {
        state.account.message = "Email confirmado. Entre com seu email e senha para continuar.";
        state.account.pendingEmail = "";
      } else if (error.code === "verifier_missing") {
        state.account.error = "Abra o link de recuperação no mesmo navegador em que você o pediu, ou peça um novo.";
      } else state.account.error = error.message;
    }
  } else if (erroNaQuery || erroNoHash) {
    consumiu = true;
    state.account.error = authLinkErrorMessage(erroNaQuery || erroNoHash);
  } else if (callback) {
    consumiu = true;
    state.account.error = "O link não trouxe um código válido.";
  }

  if (consumiu) {
    state.tab = "account";
    if (typeof NavHistory !== "undefined") NavHistory.replace("account", [], 0);
    // `token_hash` sai daqui junto com o resto: ele confirma uma conta, e
    // deixar isso na barra de endereços o entrega ao histórico, ao próximo
    // `Referer` e a quem olhar a tela por cima do ombro.
    ["code", "token_hash", "type", "auth_callback", "error", "error_code", "error_description"].forEach((chave) => params.delete(chave));
    const query = params.toString();
    // O hash só é limpo quando ERA aviso de erro do link. Limpar sempre
    // apagaria a rota do aplicativo, que também mora depois do `#`.
    const hash = erroNoHash ? "" : (location.hash || "");
    history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${hash}`);
  }
  await refreshAccountSession();
}

async function accountSubmit(kind) {
  const form = state.account.form;
  const errors = {};
  if (kind === "password") {
    if (form.newPassword.length < 10) errors["account-new-password"] = "Use pelo menos 10 caracteres.";
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || form.email.length > 254) errors["account-email"] = "Informe um email válido.";
    if (kind !== "recover" && form.password.length < 10) errors["account-password"] = "Use pelo menos 10 caracteres.";
  }
  if (Object.keys(errors).length) { showFormErrors(errors, "Revise os dados da conta."); return; }
  accountSetBusy(true, "");
  try {
    let result;
    if (kind === "register") result = await AccountAPI.register({ email: form.email, password: form.password });
    else if (kind === "recover") result = await AccountAPI.recover({ email: form.email });
    else if (kind === "password") result = await AccountAPI.password(form.newPassword);
    else result = await AccountAPI.login({ email: form.email, password: form.password });
    // A senha sai da memória assim que o servidor responde, em QUALQUER
    // desfecho. Ela ficava no estado do app depois do login: qualquer render
    // seguinte a recolocava no DOM, e ela sobrevivia a um dump de memória, a um
    // relatório de erro e à extensão de navegador que lê o formulário.
    form.password = "";
    if (kind === "recover") state.account.message = "Se o email estiver cadastrado, você receberá um link de recuperação.";
    else if (kind === "password") { state.account.message = "Senha atualizada."; state.account.mode = "login"; form.newPassword = ""; }
    else if (result.confirmationRequired) {
      // A FRASE PRECISA COBRIR OS DOIS DESFECHOS.
      //
      // Dizia só "Confira seu email para confirmar o cadastro". Para um
      // endereço que JÁ TEM CONTA o Supabase devolve exatamente esta mesma
      // resposta, de propósito, e nenhum email sai. Quem caía nesse caso ficava
      // esperando para sempre uma mensagem que nunca ia chegar. Agora a tela
      // diz as duas saídas, sem revelar qual delas é a sua.
      state.account.pendingEmail = result.email || form.email;
      state.account.message = "Se este email ainda não tinha conta, o link de confirmação foi enviado. Se já tinha, entre com sua senha.";
    } else { state.account.authenticated = !!result.authenticated; state.account.email = result.email || form.email; state.account.pendingEmail = ""; state.account.message = kind === "register" ? "Conta criada." : "Acesso confirmado."; }
    state.account.busy = false;
    await refreshAccountSession();
  } catch (error) {
    // Também no erro: senha errada continua sendo senha, e a tentativa seguinte
    // é digitada do zero.
    form.password = "";
    // Entrar com email não confirmado deixa de ser recusa muda: a tela passa a
    // mostrar o cartão de confirmação pendente, com o reenvio à mão.
    if (error.code === "email_not_confirmed") state.account.pendingEmail = form.email;
    accountSetBusy(false, error.message);
  }
}

async function accountResend() {
  const alvo = state.account.pendingEmail || state.account.form.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) { showFormErrors({ "account-email": "Informe um email válido." }, "Revise os dados da conta."); return; }
  accountSetBusy(true, "");
  try {
    await AccountAPI.resend(alvo);
    state.account.pendingEmail = alvo;
    state.account.message = "Se este email tiver um cadastro esperando confirmação, o link foi reenviado. Veja também a caixa de spam.";
    accountSetBusy(false, "");
  } catch (error) { accountSetBusy(false, error.message); }
}

async function accountLogout() {
  accountSetBusy(true, "");
  // Última chance de enviar o que ainda estava na fila: depois do logout o
  // cookie some e o envio passa a ser recusado. Falhar aqui não impede a saída,
  // porque os dados continuam inteiros neste aparelho.
  if (typeof CloudSync !== "undefined") {
    try { await CloudSync.syncNow(); } catch (error) { /* sai mesmo assim */ }
    CloudSync.disable();
  }
  try {
    await AccountAPI.logout();
    state.account = freshAccountState();
    state.account.loading = false;
    state.account.configured = true;
    // Sair descarrega o banco da conta e volta para o de visitante. Sem isto,
    // o snapshot da conta continuaria em memória e na tela, e a próxima conta
    // a entrar neste aparelho o veria.
    await applyAccountScope("");
    render();
  } catch (error) { accountSetBusy(false, error.message); }
}

async function accountRevoke(deviceId) {
  accountSetBusy(true, "");
  try { const result = await AccountAPI.revokeDevice(deviceId); if (result.currentRevoked) { await accountLogout(); return; } await refreshAccountSession(); notify("Acesso do dispositivo revogado"); }
  catch (error) { accountSetBusy(false, error.message); }
}

async function accountDelete() {
  accountSetBusy(true, "");
  // Parar antes de apagar: um ciclo em andamento recriaria o snapshot no
  // servidor logo depois da exclusão.
  if (typeof CloudSync !== "undefined") CloudSync.disable();
  try {
    await AccountAPI.deleteAccount(state.account.form.deletePassword, state.account.form.deleteText);
    // Apagar a conta apaga também a cópia local dela. Deixar o banco da conta
    // excluída neste navegador manteria vivo exatamente o dado que o usuário
    // pediu para destruir, e num aparelho compartilhado isso é um vazamento.
    try { await FinanceStore.purge(); } catch (_) {}
    try { localStorage.removeItem(GUEST_IMPORT_PREFIX + FinanceStore.scope()); } catch (_) {}
    state.account = freshAccountState(); state.account.loading = false; state.account.configured = true;
    await applyAccountScope("");
    render(); notify("Conta apagada no servidor e neste aparelho.");
  } catch (error) { accountSetBusy(false, error.message); }
}
