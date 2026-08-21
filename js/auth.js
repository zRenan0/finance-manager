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
    // Estado do vínculo entre os dados deste aparelho e a conta. Ver o bloco
    // "VÍNCULO DOS DADOS DESTE APARELHO COM A CONTA" mais abaixo.
    guestLink: freshGuestLink(),
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
// Troca o banco carregado. Só é chamada quando a sessão foi CONFIRMADA pelo
// servidor: uma falha de rede não pode derrubar o usuário para o escopo de
// visitante e fazer parecer que os dados sumiram.
//
// Ela NÃO decide mais nada sobre vínculo. A decisão depende de saber o que a
// conta remota já tem, e isso só existe depois da primeira descida; misturar as
// duas coisas aqui era o que fazia o aplicativo perguntar (ou deixar de
// perguntar) antes de ter a informação.
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
  state.account.guestLink = freshGuestLink();
  state.onboarding.open = !(state.data.onboarding && state.data.onboarding.done);
  // A memoização do app é por IDENTIDADE do snapshot; `switchStorageScope`
  // devolve um objeto novo, então os caches derivados erram por construção.
}

// ------------------------------------------------------------------------------
// VÍNCULO DOS DADOS DESTE APARELHO COM A CONTA
// ------------------------------------------------------------------------------
// O DEFEITO QUE ISTO CORRIGE
//
// Quem usava o app sem conta e depois entrava numa conta ficava com DOIS bancos
// no mesmo navegador: o de visitante, cheio, e o da conta, vazio. O segundo
// aparelho entrava na mesma conta e via o vazio. A pergunta de importação
// existia, mas gravava "já perguntei" no instante em que a caixa abria: quem
// fechasse sem responder perdia o caminho de volta para sempre.
//
// A sequência agora é uma só, e nesta ordem:
//
//   1. abrir o escopo da conta (feito por applyAccountScope);
//   2. DESCER o que a conta já tem, sem enviar e sem semear;
//   3. ler o resumo do visitante e a decisão já registrada para aquele conteúdo;
//   4. vincular sozinho apenas quando a conta nunca recebeu nada;
//   5. pedir confirmação quando a conta já tem história;
//   6. liberar a fila e a semeadura;
//   7. só declarar concluído com o recibo do servidor na mão.
//
// Nada é apagado em nenhum dos lados, e a base de visitante continua intacta.
function freshGuestLink() {
  return {
    // idle | checking | waiting | confirm | linking | linked | dismissed | pending
    phase: "idle",
    summary: null, stats: null, digest: "", remoteRevision: null,
    error: "", errorCode: "", busy: false,
  };
}

// Cada sequência de vínculo carrega um número. Sair da conta, entrar em outra
// ou trocar de escopo invalida o número, e a promessa que estava em voo termina
// sem escrever nada na conta errada.
let __guestLinkToken = 0;

function setGuestLink(patch) {
  state.account.guestLink = { ...(state.account.guestLink || freshGuestLink()), ...patch };
  render();
}

function guestLinkFailureText(reason) {
  if (reason === "unreadable") return "Não foi possível ler os dados de visitante deste aparelho.";
  if (reason === "write_failed") return "Não foi possível salvar o vínculo neste aparelho. Nada foi alterado.";
  if (reason === "empty") return "Não há dados de visitante para vincular.";
  if (reason === "not_authenticated") return "Entre na conta para vincular os dados deste aparelho.";
  return "O vínculo não foi concluído. Seus dados continuam completos nos dois lados.";
}

// Executa o vínculo e devolve o controle para o motor. `opts.expectedRemoteRevision`
// só existe no vínculo automático: é ela que faz o servidor recusar a adoção se
// a conta tiver recebido qualquer operação nesse intervalo.
async function runGuestLink(token, escopo, visitante, opts) {
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo;
  let resultado;
  try { resultado = await FinanceStore.adoptScope("guest", opts); }
  catch (error) { resultado = { ok: false, reason: "write_failed", error }; }
  if (!valido()) return;

  if (!resultado.ok) {
    setGuestLink({ phase: "pending", busy: false, error: guestLinkFailureText(resultado.reason), errorCode: resultado.reason });
    if (typeof CloudSync !== "undefined") await CloudSync.finishAccountBootstrap();
    return;
  }
  state.data = FinanceStore.snapshot();
  setGuestLink({ phase: "linking", stats: resultado.stats || null, digest: resultado.digest || visitante.digest || "" });
  await concludeGuestLink(token, escopo, visitante);
}

// "Concluído" exige o recibo, e o recibo exige que o servidor tenha reconhecido
// o lote e que nada daquele vínculo tenha sobrado na fila.
async function concludeGuestLink(token, escopo, visitante) {
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo;
  if (typeof CloudSync !== "undefined") await CloudSync.finishAccountBootstrap();
  if (!valido()) return;
  state.data = FinanceStore.snapshot();

  let recibo = null;
  try { recibo = await FinanceStore.guestLinkReceipt(); } catch (_) { recibo = null; }
  if (!valido()) return;

  const impressao = visitante && visitante.digest;
  if (recibo && recibo.status === "linked" && (!impressao || recibo.sourceDigest === impressao)) {
    setGuestLink({ phase: "linked", busy: false, error: "", errorCode: "", stats: recibo.stats || state.account.guestLink.stats });
    notify("Dados deste aparelho vinculados à conta");
    return;
  }

  const sync = typeof CloudSync === "undefined" ? {} : CloudSync.status();
  if (sync.errorCode === "remote_changed") {
    // A conta avançou durante o vínculo automático. Nada foi descartado: o lote
    // continua na fila, parado, esperando a confirmação de mesclagem.
    setGuestLink({ phase: "confirm", busy: false, errorCode: "remote_changed", error: sync.error || "" });
    return;
  }
  setGuestLink({
    phase: "pending", busy: false,
    error: sync.error || "O servidor ainda não confirmou o vínculo. Ele termina sozinho na próxima conexão.",
    errorCode: sync.errorCode || "pending",
  });
}

// A sequência completa, chamada depois de a sessão e o escopo estarem prontos.
async function bootstrapAccountLink() {
  if (typeof CloudSync === "undefined") return;
  const escopo = FinanceStore.scope();
  if (escopo === "guest") return;
  const token = ++__guestLinkToken;
  const userId = state.account.userId;
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo && state.account.authenticated;

  setGuestLink({ phase: "checking", error: "", errorCode: "", busy: true });

  // Descer PRIMEIRO. Sem isto, o próprio aparelho preenchia a conta e depois
  // concluía que ela já estava em uso.
  const preparo = await CloudSync.prepareAccount();
  if (!valido()) return;
  setGuestLink({ busy: false, remoteRevision: preparo.revision });

  let visitante = null;
  try { visitante = await FinanceStore.peekScope("guest"); }
  catch (_) { visitante = null; }
  if (!valido()) return;

  if (!visitante || visitante.readable === false) {
    setGuestLink({ phase: "pending", error: guestLinkFailureText("unreadable"), errorCode: "guest_unreadable" });
    await CloudSync.finishAccountBootstrap();
    return;
  }
  if (!visitante.exists) {
    setGuestLink({ phase: "idle", summary: null, digest: "" });
    await CloudSync.finishAccountBootstrap();
    return;
  }
  setGuestLink({ summary: visitante, digest: visitante.digest || "" });

  // Um lote já gravado termina o que começou: as marcas dele estão no diário, e
  // recomeçar criaria uma segunda versão dos mesmos registros.
  let diario = null;
  try { diario = await FinanceStore.guestLinkJournal(); } catch (_) { diario = null; }
  if (!valido()) return;
  if (diario && diario.status === "blocked") {
    setGuestLink({ phase: "confirm", errorCode: "remote_changed", error: "A conta mudou em outro aparelho. Confirme como juntar os dados." });
    await CloudSync.finishAccountBootstrap();
    return;
  }
  if (diario) {
    setGuestLink({ phase: "linking", stats: diario.stats || null });
    await concludeGuestLink(token, escopo, visitante);
    return;
  }

  // Decisão registrada vale pela IMPRESSÃO do conteúdo: se o visitante mudou, a
  // impressão muda e o aplicativo volta a reconhecer trabalho pendente.
  let recibo = null;
  try { recibo = await FinanceStore.guestLinkReceipt(); } catch (_) { recibo = null; }
  if (!valido()) return;
  const decidido = recibo && visitante.digest && recibo.sourceDigest === visitante.digest;
  if (decidido && recibo.status === "linked") {
    setGuestLink({ phase: "linked", stats: recibo.stats || null });
    await CloudSync.finishAccountBootstrap();
    return;
  }
  if (decidido && recibo.status === "dismissed") {
    setGuestLink({ phase: "dismissed" });
    await CloudSync.finishAccountBootstrap();
    return;
  }

  // Sem saber o que a conta tem, o aplicativo NÃO presume que ela está vazia.
  if (!preparo.ok || preparo.revision == null) {
    setGuestLink({
      phase: "waiting",
      error: preparo.error || "Sem conexão para conferir a conta. O vínculo espera a rede voltar.",
      errorCode: preparo.errorCode || "offline",
    });
    await CloudSync.finishAccountBootstrap();
    return;
  }

  // Revisão zero: a conta nunca recebeu uma operação. Incorporar é seguro.
  if (String(preparo.revision) === "0") {
    setGuestLink({ phase: "linking" });
    await runGuestLink(token, escopo, visitante, {
      userId, remoteRevision: "0", expectedRemoteRevision: "0",
    });
    return;
  }

  // Conta com história: só com confirmação, e sem nenhuma opção que substitua
  // ou apague um dos lados.
  setGuestLink({ phase: "confirm" });
  await CloudSync.finishAccountBootstrap();
}

// ---- Ações da tela de conta ----

// "Juntar dados": confirmação explícita, inclusive depois de um bloqueio por
// mudança remota. Aqui o lote sobe sem declarar revisão esperada, porque a
// pessoa já sabe que a conta mudou.
async function accountLinkGuest() {
  if (!state.account.authenticated) return;
  const escopo = FinanceStore.scope();
  const token = ++__guestLinkToken;
  setGuestLink({ phase: "linking", busy: true, error: "", errorCode: "" });

  let visitante = null;
  try { visitante = await FinanceStore.peekScope("guest"); }
  catch (_) { visitante = null; }
  if (token !== __guestLinkToken || FinanceStore.scope() !== escopo) return;
  if (!visitante || !visitante.exists) {
    setGuestLink({ phase: "idle", busy: false, summary: null });
    return;
  }
  setGuestLink({ summary: visitante, digest: visitante.digest || "", busy: false });

  try { await FinanceStore.releaseGuestLink(); } catch (_) { /* sem diário */ }
  await runGuestLink(token, escopo, visitante, {
    userId: state.account.userId,
    remoteRevision: state.account.guestLink.remoteRevision,
  });
}

// "Manter separados": decisão explícita, gravada pela impressão do conteúdo.
// Fechar a tela NÃO passa por aqui, e é isso que impede o marcador silencioso
// que existia antes.
async function accountDismissGuestLink() {
  const digest = state.account.guestLink && state.account.guestLink.digest;
  if (!digest) {
    // Sem impressão (navegador sem WebCrypto) nada é gravado: preferimos
    // perguntar de novo a esconder uma alteração.
    setGuestLink({ phase: "dismissed" });
    return;
  }
  try { await FinanceStore.dismissGuestLink(digest, "guest"); }
  catch (_) { /* a pergunta volta na próxima entrada */ }
  setGuestLink({ phase: "dismissed", error: "", errorCode: "" });
  notify("Os dados deste aparelho continuam separados da conta");
}

// "Agora não": esconde o cartão nesta sessão, sem gravar decisão nenhuma.
function accountPostponeGuestLink() {
  setGuestLink({ phase: "idle" });
}

// "Rever": traz o cartão de volta, com o resumo recalculado.
async function accountReviewGuestLink() {
  setGuestLink({ phase: "checking", busy: true, error: "", errorCode: "" });
  const escopo = FinanceStore.scope();
  const token = __guestLinkToken;
  let visitante = null;
  try { visitante = await FinanceStore.peekScope("guest"); }
  catch (_) { visitante = null; }
  if (token !== __guestLinkToken || FinanceStore.scope() !== escopo) return;
  if (!visitante || !visitante.exists) {
    setGuestLink({ phase: "idle", busy: false, summary: null, digest: "" });
    notify("Não há dados de visitante neste aparelho");
    return;
  }
  setGuestLink({ phase: "confirm", busy: false, summary: visitante, digest: visitante.digest || "" });
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
  // A sincronização segue a sessão. Ela não é mais ligada "solta": a entrada
  // numa conta passa pela sequência de vínculo, que desce primeiro, decide, e só
  // então libera a fila e a semeadura. Não é aguardada para não segurar a
  // pintura da tela de conta.
  if (typeof CloudSync !== "undefined") {
    if (state.account.authenticated) bootstrapAccountLink().catch(() => {});
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
    // `purge()` já apaga o `localMeta` do escopo, e com ele o recibo e o diário
    // de vínculo daquela conta. Nada sobra apontando para dados que não existem.
    try { await FinanceStore.purge(); } catch (_) {}
    state.account = freshAccountState(); state.account.loading = false; state.account.configured = true;
    await applyAccountScope("");
    render(); notify("Conta apagada no servidor e neste aparelho.");
  } catch (error) { accountSetBusy(false, error.message); }
}
