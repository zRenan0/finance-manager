"use strict";

const ACCOUNT_ENDPOINT = "/api/account";
const ACCOUNT_DEVICE_KEY = "cofre_device_id";
const ACCOUNT_REQUEST_TIMEOUT_MS = 12000;
const ACCOUNT_RECOVERY_DEDUP_MS = 750;
const ACCOUNT_RECOVERY_RETRY_MS = 30000;
const ACCOUNT_SCOPED_ACTIONS = new Set(["password", "devices", "revoke-device", "delete", "logout"]);
const ACCOUNT_COOKIE_ACTIONS = new Set(["session", "login", "register", "recover", "resend", "verify", "exchange", "logout", "revoke-device", "delete"]);

// Alguns modos privados permitem ler o localStorage, mas recusam a gravação.
// Sem uma cópia em memória, cada chamada criava outro id e o mesmo navegador
// aparecia como vários aparelhos durante a mesma visita.
let __accountDeviceIdMemory = "";

function newAccountDeviceId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function accountDeviceId() {
  if (/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(__accountDeviceIdMemory)) return __accountDeviceIdMemory;
  try {
    let value = localStorage.getItem(ACCOUNT_DEVICE_KEY);
    if (/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(value || "")) {
      __accountDeviceIdMemory = value;
      return value;
    }
    value = newAccountDeviceId();
    __accountDeviceIdMemory = value;
    try { localStorage.setItem(ACCOUNT_DEVICE_KEY, value); } catch (_) { /* vale nesta visita */ }
    return value;
  } catch (_) {
    __accountDeviceIdMemory = newAccountDeviceId();
    return __accountDeviceIdMemory;
  }
}

function accountDeviceLabel() {
  if (typeof navigator === "undefined") return "Este navegador";
  const ua = String(navigator.userAgent || "");
  const rawPlatform = String(navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || "");
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
      : /Firefox\//.test(ua) ? "Firefox"
        : /CriOS\//.test(ua) ? "Chrome"
          : /Chrome\//.test(ua) ? "Chrome"
            : /FxiOS\//.test(ua) ? "Firefox"
              : /Safari\//.test(ua) ? "Safari"
                : "Navegador";
  const platform = /Win/i.test(rawPlatform) ? "Windows"
    : /Android/i.test(ua) ? "Android"
      : /iPhone|iPod/i.test(ua) ? "iPhone"
        : /iPad/i.test(ua) || (rawPlatform === "MacIntel" && Number(navigator.maxTouchPoints) > 1) ? "iPad"
          : /Mac/i.test(rawPlatform) ? "macOS"
            : /CrOS/i.test(`${ua} ${rawPlatform}`) ? "ChromeOS"
              : /Linux/i.test(rawPlatform) ? "Linux"
                : rawPlatform.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 24);
  return (platform ? `${browser} no ${platform}` : browser).slice(0, 50);
}

function accountCurrentDeviceType() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1)) return "tablet";
  if ((navigator.userAgentData && navigator.userAgentData.mobile === true) || /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) return "phone";
  if (/Android/i.test(ua)) return "tablet";
  if (/Windows|Macintosh|Linux|X11/i.test(`${ua} ${platform}`)) return "desktop";
  return "unknown";
}

function accountExpectedUserId() {
  try { return String(state && state.account && state.account.userId || "").trim().toLowerCase(); }
  catch (_) { return ""; }
}

function freshAccountState() {
  return {
    loading: true, configured: null, authenticated: false, knownAccount: false, sessionStatus: "unknown", email: "", userId: "", mode: "login", busy: false, error: "", message: "",
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
let __accountScopeQueue = Promise.resolve();

async function applyAccountScope(userId) {
  const desired = storageScopeFor(userId);
  const task = async () => {
    if (desired === FinanceStore.scope()) {
      FinanceStore.setOutboxEnabled(desired !== GUEST_SCOPE);
      return false;
    }

    // Invalidar primeiro impede que uma resposta remota já em voo toque no
    // banco que será aberto a seguir. A fila antiga é gravada logo depois.
    if (typeof CloudSync !== "undefined") CloudSync.disable();
    try { await FinanceStore.flush(); } catch (_) {}

    state.data = await switchStorageScope(desired);
    // O /health pode falhar, mas toda edição deste escopo já precisa nascer com
    // marca e fila para subir na recuperação automática.
    FinanceStore.setOutboxEnabled(desired !== GUEST_SCOPE);
    state.storageOk = isStorageAvailable();
    // Tudo que a tela guardava era daquele escopo: seleção, formulário aberto,
    // rascunho de importação, pré-visualização de backup. Nada disso vale para a
    // conta que entrou agora.
    resetScopedUiState(desired);
    render();
    return true;
  };
  const run = __accountScopeQueue.then(task, task);
  __accountScopeQueue = run.catch(() => {});
  return run;
}

// Estado de tela derivado dos dados. Sem esta limpeza, um id selecionado na
// conta anterior continuaria apontado depois da troca.
function resetScopedUiState(escopo) {
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
  // ENTRAR NUMA CONTA NÃO É PRIMEIRO USO.
  //
  // O banco local da conta nasce vazio neste aparelho e só é preenchido pela
  // primeira descida. Decidir aqui, olhando esse vazio, fazia o assistente
  // abrir logo depois do login e pedir renda e conta do banco de novo; quem
  // respondia ficava com a conta do banco duplicada. Ver holdOnboardingGate.
  if (escopo && escopo !== GUEST_SCOPE) holdOnboardingGate();
  else {
    // Sair da conta volta ao critério normal, e o portão de uma entrada
    // anterior não pode ficar pendurado aqui.
    state.onboarding.held = false;
    state.onboarding.open = !(state.data.onboarding && state.data.onboarding.done);
  }
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

// Fim da entrada na conta: o motor volta a enviar e o assistente de boas-vindas
// volta a poder abrir, agora com o conteúdo da conta já em mãos. Enquanto esta
// função não roda, o portão fica fechado; é ela que distingue "a conta está
// mesmo vazia" de "a conta ainda não desceu".
async function finishAccountBootstrapAndGate() {
  if (typeof CloudSync !== "undefined") await CloudSync.finishAccountBootstrap();
  if (typeof refreshOnboardingGate === "function" && refreshOnboardingGate({ release: true })) render();
}

// Executa o vínculo e devolve o controle para o motor. `opts.expectedRemoteRevision`
// só existe no vínculo automático: é ela que faz o servidor recusar a adoção se
// a conta tiver recebido qualquer operação nesse intervalo.
async function runGuestLink(token, escopo, visitante, opts) {
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo;
  if (!valido()) return;
  let resultado;
  try { resultado = await FinanceStore.adoptScope("guest", opts); }
  catch (error) { resultado = { ok: false, reason: "write_failed", error }; }
  if (!valido()) return;

  if (!resultado.ok) {
    setGuestLink({ phase: "pending", busy: false, error: guestLinkFailureText(resultado.reason), errorCode: resultado.reason });
    await finishAccountBootstrapAndGate();
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
  await finishAccountBootstrapAndGate();
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
  // Sem motor de sincronização não há descida para esperar, e o portão do
  // assistente não pode ficar fechado à espera de uma decisão que não vem.
  if (typeof CloudSync === "undefined") {
    if (typeof refreshOnboardingGate === "function" && refreshOnboardingGate({ release: true })) render();
    return;
  }
  const escopo = FinanceStore.scope();
  if (escopo === GUEST_SCOPE) return;
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
    await finishAccountBootstrapAndGate();
    return;
  }
  if (!visitante.exists) {
    setGuestLink({ phase: "idle", summary: null, digest: "" });
    await finishAccountBootstrapAndGate();
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
    await finishAccountBootstrapAndGate();
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
    await finishAccountBootstrapAndGate();
    return;
  }
  if (decidido && recibo.status === "dismissed") {
    setGuestLink({ phase: "dismissed" });
    await finishAccountBootstrapAndGate();
    return;
  }

  // Sem saber o que a conta tem, o aplicativo NÃO presume que ela está vazia.
  if (!preparo.ok || preparo.revision == null) {
    setGuestLink({
      phase: "waiting",
      error: preparo.error || "Sem conexão para conferir a conta. O vínculo espera a rede voltar.",
      errorCode: preparo.errorCode || "offline",
    });
    await finishAccountBootstrapAndGate();
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
  await finishAccountBootstrapAndGate();
}

// ---- Ações da tela de conta ----

// "Juntar dados": confirmação explícita, inclusive depois de um bloqueio por
// mudança remota. Aqui o lote sobe sem declarar revisão esperada, porque a
// pessoa já sabe que a conta mudou.
async function accountLinkGuest() {
  if (!state.account.authenticated) return;
  const escopo = FinanceStore.scope();
  const token = ++__guestLinkToken;
  const userId = state.account.userId;
  const remoteRevision = state.account.guestLink.remoteRevision;
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo;
  setGuestLink({ phase: "linking", busy: true, error: "", errorCode: "" });

  let visitante = null;
  try { visitante = await FinanceStore.peekScope("guest"); }
  catch (_) { visitante = null; }
  if (!valido()) return;
  if (!visitante || !visitante.exists) {
    setGuestLink({ phase: "idle", busy: false, summary: null });
    return;
  }
  setGuestLink({ summary: visitante, digest: visitante.digest || "", busy: false });

  try { await FinanceStore.releaseGuestLink(); } catch (_) { /* sem diário */ }
  if (!valido()) return;
  await runGuestLink(token, escopo, visitante, {
    userId,
    remoteRevision,
  });
}

// "Manter separados": decisão explícita, gravada pela impressão do conteúdo.
// Fechar a tela NÃO passa por aqui, e é isso que impede o marcador silencioso
// que existia antes.
async function accountDismissGuestLink() {
  const escopo = FinanceStore.scope();
  const token = ++__guestLinkToken;
  const valido = () => token === __guestLinkToken && FinanceStore.scope() === escopo;
  const digest = state.account.guestLink && state.account.guestLink.digest;
  if (!digest) {
    // Sem impressão (navegador sem WebCrypto) nada é gravado: preferimos
    // perguntar de novo a esconder uma alteração.
    setGuestLink({ phase: "dismissed" });
    return;
  }
  try { await FinanceStore.dismissGuestLink(digest, "guest"); }
  catch (_) { /* a pergunta volta na próxima entrada */ }
  if (!valido()) return;
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
  let cookieQueue = Promise.resolve();

  function withCookieLock(task) {
    const locks = typeof navigator !== "undefined" && navigator.locks;
    if (locks && typeof locks.request === "function") {
      return locks.request("cofre-account-cookie", () => task());
    }
    const run = cookieQueue.then(task, task);
    cookieQueue = run.catch(() => {});
    return run;
  }

  async function singleRequest(path, options) {
    const o = options || {};
    if (typeof location !== "undefined" && location.protocol === "file:") {
      if (path === "session") return { ok: true, configured: false, authenticated: false };
      throw new Error("O serviço de conta exige o site publicado.");
    }
    const externalSignal = o.signal;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let abortKind = "";
    let timeoutId = null;
    let onExternalAbort = null;
    const abortRequest = (kind) => {
      if (!controller || controller.signal.aborted) return;
      abortKind = kind;
      controller.abort();
    };
    const requestFailure = (cause) => {
      if (cause && cause.name === "AbortError") {
        const timedOut = abortKind === "timeout";
        const aborted = new Error(timedOut
          ? "O serviço de conta não respondeu a tempo."
          : "A verificação anterior da conta foi cancelada.");
        aborted.code = timedOut ? "timeout" : "request_aborted";
        return aborted;
      }
      const error = new Error("Não foi possível acessar o serviço de conta.");
      error.code = "network_error";
      return error;
    };
    if (controller) {
      onExternalAbort = () => abortRequest("external");
      if (externalSignal && externalSignal.aborted) onExternalAbort();
      else if (externalSignal && typeof externalSignal.addEventListener === "function") {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
      timeoutId = setTimeout(() => abortRequest("timeout"), ACCOUNT_REQUEST_TIMEOUT_MS);
    }

    try {
      let response;
      try {
        response = await fetch(`${ACCOUNT_ENDPOINT}/${path}`, {
          method: o.method || "GET", credentials: "include", cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Device-Id": accountDeviceId(),
            "X-Device-Label": accountDeviceLabel(),
            "X-Device-Type": accountCurrentDeviceType(),
            ...(ACCOUNT_SCOPED_ACTIONS.has(path) ? { "X-Account-Id": o.expectedAccountId } : {}),
          },
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
          signal: controller ? controller.signal : externalSignal,
        });
      } catch (cause) {
        throw requestFailure(cause);
      }

      // AUSÊNCIA DE BACKEND NÃO É ERRO DO USUÁRIO.
      //
      // Publicação estática, o servidor de desenvolvimento (`npm start`) e portais
      // de Wi-Fi respondem `/api/*` com o HTML do próprio aplicativo e status 200.
      // O `404` já era tratado; o `200 text/html` não era, caía no erro genérico e
      // a tela de conta abria com alerta vermelho antes de o usuário digitar
      // qualquer coisa. Resposta sem JSON significa que não há serviço de conta
      // aqui, que é o "modo local", estado que a tela já sabe apresentar.
      const tipoConteudo = String(response.headers.get("content-type") || "");
      const respostaEhJson = tipoConteudo.indexOf("json") !== -1;
      if (path === "session" && (response.status === 404 || !respostaEhJson)) {
        return { ok: true, configured: false, authenticated: false };
      }
      if (!respostaEhJson) {
        const semServico = new Error("O serviço de conta não está disponível nesta publicação.");
        semServico.code = "account_unavailable";
        throw semServico;
      }
      let payload = null;
      try { payload = await response.json(); }
      catch (cause) {
        // Abortar o fetch depois dos cabeçalhos também interrompe a leitura do
        // corpo. Esse cancelamento precisa conservar a causa; JSON inválido
        // continua seguindo o tratamento de resposta malformada já existente.
        if (cause && cause.name === "AbortError") throw requestFailure(cause);
      }
      if (!response.ok || !payload || payload.ok === false) {
        const error = new Error(payload && payload.message || "Não foi possível concluir a operação.");
        error.code = payload && payload.code || "request_failed";
        throw error;
      }
      return payload;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (externalSignal && onExternalAbort && typeof externalSignal.removeEventListener === "function") {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  async function request(path, options) {
    const scoped = ACCOUNT_SCOPED_ACTIONS.has(path);
    const original = options || {};
    const o = {
      ...original,
      expectedAccountId: scoped
        ? String(original.expectedAccountId || accountExpectedUserId()).trim().toLowerCase()
        : "",
    };
    let result;
    try {
      // O lock termina junto desta única ida HTTP. Recuperar a sessão aqui
      // dentro tentaria adquirir o mesmo lock e prenderia a fila para sempre.
      result = ACCOUNT_COOKIE_ACTIONS.has(path)
        ? await withCookieLock(() => singleRequest(path, o))
        : await singleRequest(path, o);
    } catch (error) {
      if (scoped && error && error.code === "session_refresh_required"
        && o.retrySession !== false && !o.sessionRetried) {
        // A ação nasceu para esta identidade. Se login/logout mudou a conta
        // enquanto a resposta viajava, ela não pode ser repetida na conta nova.
        if (!o.expectedAccountId || accountExpectedUserId() !== o.expectedAccountId) {
          const changed = new Error("A conta desta sessão mudou durante a operação.");
          changed.code = "account_scope_changed";
          throw changed;
        }
        const refreshed = await refreshAccountSession();
        if (refreshed && refreshed.status === "active" && accountExpectedUserId() === o.expectedAccountId) {
          return request(path, { ...o, sessionRetried: true });
        }
      }
      throw error;
    }
    return result;
  }
  return {
    session: (options) => request("session", options), register: (body) => request("register", { method: "POST", body }),
    login: (body) => request("login", { method: "POST", body }), recover: (body) => request("recover", { method: "POST", body }),
    resend: (email) => request("resend", { method: "POST", body: { email } }),
    exchange: (code) => request("exchange", { method: "POST", body: { code } }),
    verify: (tokenHash, type) => request("verify", { method: "POST", body: { tokenHash, type } }),
    logout: () => request("logout", { method: "POST", body: {} }),
    password: (password) => request("password", { method: "POST", body: { password } }),
    devices: (options) => request("devices", options),
    revokeDevice: (deviceId) => request("revoke-device", { method: "POST", body: { deviceId } }),
    deleteAccount: (password, confirmation) => request("delete", { method: "POST", body: { password, confirmation } }),
  };
})();

function accountSetBusy(busy, error) {
  state.account.busy = busy;
  state.account.error = error || "";
  render();
}

let __accountSessionRefreshPromise = null;
let __accountSessionRefreshEpoch = -1;
let __accountSessionAbortController = null;
let __accountAuthEpoch = 0;
let __accountInvalidationPromise = null;
let __accountScopeChangePromise = null;
let __accountReadyScope = "";
let __accountRecoveryPromise = null;
let __accountRecoveryLastAt = 0;
let __accountRecoveryListenersStarted = false;
let __accountRecoveryTimer = null;
let __accountDisconnecting = false;

function accountRefreshIsCurrent(epoch) {
  return epoch === __accountAuthEpoch;
}

function invalidateAccountRefresh() {
  __accountAuthEpoch += 1;
  if (__accountSessionAbortController) {
    try { __accountSessionAbortController.abort(); } catch (_) {}
  }
  __accountSessionRefreshPromise = null;
  __accountSessionRefreshEpoch = -1;
  __accountSessionAbortController = null;
  return __accountAuthEpoch;
}

function clearAccountRecoveryRetry() {
  if (__accountRecoveryTimer !== null) {
    clearTimeout(__accountRecoveryTimer);
    __accountRecoveryTimer = null;
  }
}

function scheduleAccountRecoveryRetry() {
  clearAccountRecoveryRetry();
  const epoch = __accountAuthEpoch;
  const rememberedScope = FinanceStore.scope();
  if (rememberedScope === GUEST_SCOPE && !state.account.knownAccount) return;
  __accountRecoveryTimer = setTimeout(() => {
    __accountRecoveryTimer = null;
    if (!accountRefreshIsCurrent(epoch) || FinanceStore.scope() !== rememberedScope) return;
    recoverAccountSession("retry").catch((error) => {
      if (typeof reportSafeError === "function") reportSafeError("sync", error, "account_recover_retry");
    });
  }, ACCOUNT_RECOVERY_RETRY_MS);
}

function invalidAccountSessionCode(error) {
  const code = String(error && error.code || "");
  return code === "device_revoked" || code === "device_unknown" || code === "session_expired";
}

function changedAccountScopeCode(error) {
  return String(error && error.code || "") === "account_scope_changed";
}

// Revogação e expiração trocam apenas o ESCOPO carregado. O banco da conta e
// sua fila ficam no aparelho para um login posterior continuar de onde parou.
async function invalidateAccountSession(details) {
  if (__accountInvalidationPromise) return __accountInvalidationPromise;
  const info = details || {};
  invalidateAccountRefresh();
  clearAccountRecoveryRetry();
  __accountInvalidationPromise = (async () => {
    ++__guestLinkToken;
    __accountReadyScope = "";
    // Uma gravação local que já estava confirmada pela interface precisa chegar
    // à fila da conta antes que o motor pare de enfileirar.
    try { await FinanceStore.flush(); }
    catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("storage", error, "session_invalid_flush");
    }
    if (typeof CloudSync !== "undefined") CloudSync.disable();
    state.account.authenticated = false;
    state.account.knownAccount = false;
    state.account.sessionStatus = "guest";
    state.account.loading = false;
    state.account.email = "";
    state.account.userId = "";
    state.account.devices = [];
    state.account.busy = false;
    state.account.error = info.message || "A sessão terminou. Entre novamente para voltar a sincronizar.";
    try {
      await applyAccountScope("");
    } catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("storage", error, "invalid_session_scope");
      notify("A sessão terminou, mas não foi possível abrir os dados locais deste aparelho", "danger");
    }
    if (typeof refreshOnboardingGate === "function") refreshOnboardingGate({ release: true });
    render();
    return { status: "guest", invalidated: true };
  })();
  try { return await __accountInvalidationPromise; }
  finally { __accountInvalidationPromise = null; }
}

// Consultas concorrentes de pageshow, foco e online compartilham a mesma
// promessa. Isso impede duas trocas de escopo e duas primeiras descidas.
async function refreshAccountSession() {
  const epoch = __accountAuthEpoch;
  if (__accountSessionRefreshPromise && __accountSessionRefreshEpoch === epoch) return __accountSessionRefreshPromise;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const promise = performAccountSessionRefresh(epoch, controller && controller.signal);
  __accountSessionRefreshPromise = promise;
  __accountSessionRefreshEpoch = epoch;
  __accountSessionAbortController = controller;
  return promise.finally(() => {
    if (__accountSessionRefreshPromise === promise) {
      __accountSessionRefreshPromise = null;
      __accountSessionRefreshEpoch = -1;
      __accountSessionAbortController = null;
    }
  });
}

async function performAccountSessionRefresh(epoch, signal) {
  // "O servidor respondeu" é diferente de "o servidor disse que não há sessão".
  // Falha de transporte mantém autenticação, escopo e fila como estavam.
  let result;
  try {
    result = await AccountAPI.session({ signal });
  } catch (error) {
    if (!accountRefreshIsCurrent(epoch) || error.code === "request_aborted") return { status: "stale" };
    if (invalidAccountSessionCode(error)) return invalidateAccountSession(error);
    const rememberedAccount = FinanceStore.scope() !== GUEST_SCOPE;
    state.account.knownAccount = state.account.knownAccount || rememberedAccount;
    // No cold reload não temos email nem id em memória. Manter o estado de
    // verificação evita renderizar o formulário guest como se houvesse logout;
    // dashboard e banco local continuam disponíveis enquanto a rede se recupera.
    state.account.loading = rememberedAccount && !state.account.authenticated;
    if (state.account.configured === null) state.account.configured = true;
    state.account.sessionStatus = "unknown";
    // Esta consulta é automática. O estado de sincronização já apresenta a
    // falta de rede sem transformar a abertura do app num erro de formulário.
    state.account.error = "";
    render();
    scheduleAccountRecoveryRetry();
    return { status: "unknown", error };
  }

  if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };

  state.account.loading = false;
  state.account.configured = result.configured !== false;

  // Uma publicação sem serviço de conta não confirmou logout nenhum. Se este
  // navegador já estava num escopo autenticado, ele continua disponível localmente.
  if (result.configured === false) {
    const rememberedAccount = FinanceStore.scope() !== GUEST_SCOPE;
    state.account.knownAccount = state.account.knownAccount || rememberedAccount;
    state.account.sessionStatus = rememberedAccount ? "unknown" : "guest";
    if (!rememberedAccount) state.account.authenticated = false;
    if (!rememberedAccount && typeof refreshOnboardingGate === "function") refreshOnboardingGate({ release: true });
    render();
    return { status: state.account.sessionStatus, configured: false };
  }

  if (!result.authenticated) {
    clearAccountRecoveryRetry();
    ++__guestLinkToken;
    __accountReadyScope = "";
    state.account.authenticated = false;
    state.account.knownAccount = false;
    state.account.sessionStatus = "guest";
    state.account.email = result.email || "";
    state.account.userId = "";
    state.account.devices = [];
    if (result.pendingConfirmation) state.account.pendingEmail = result.email || state.account.pendingEmail;
    try {
      await applyAccountScope("");
    } catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("storage", error, "scope_switch");
      notify("Não foi possível abrir os dados deste aparelho", "danger");
      render();
      return { status: "guest", error };
    }
    if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };
    if (typeof CloudSync !== "undefined") CloudSync.disable();
    if (typeof refreshOnboardingGate === "function") refreshOnboardingGate({ release: true });
    render();
    return { status: "guest" };
  }

  // Uma resposta autenticada sem identidade não é autorização para escolher um
  // banco. Preservamos o escopo atual e tentamos de novo no próximo gatilho.
  if (!result.userId) {
    state.account.sessionStatus = "unknown";
    render();
    scheduleAccountRecoveryRetry();
    return { status: "unknown", error: new Error("A sessão não informou a identidade da conta.") };
  }

  const previousUserId = String(state.account.userId || "");
  state.account.authenticated = true;
  state.account.knownAccount = true;
  state.account.sessionStatus = "active";
  state.account.email = result.email || state.account.email || "";
  state.account.userId = result.userId;
  state.account.pendingEmail = "";
  if (previousUserId && previousUserId !== String(result.userId)) state.account.devices = [];
  clearAccountRecoveryRetry();

  let mudouEscopo = false;
  try {
    mudouEscopo = await applyAccountScope(result.userId);
  } catch (error) {
    if (typeof reportSafeError === "function") reportSafeError("storage", error, "scope_switch");
    notify("Não foi possível abrir os dados desta conta neste aparelho", "danger");
    render();
    return { status: "active", error };
  }
  if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };

  // Uma falha ao atualizar a lista não inventa uma lista vazia. Revogação ou
  // expiração, por outro lado, são confirmações de que o acesso acabou.
  try {
    const devices = await AccountAPI.devices({ retrySession: false });
    if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };
    state.account.devices = Array.isArray(devices.devices) ? devices.devices : [];
  } catch (error) {
    if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };
    if (changedAccountScopeCode(error)) return handleAccountScopeChanged(error);
    if (invalidAccountSessionCode(error)) return invalidateAccountSession(error);
  }

  if (typeof CloudSync !== "undefined" && state.account.authenticated) {
    const currentScope = FinanceStore.scope();
    const precisaPreparar = mudouEscopo || __accountReadyScope !== currentScope || !CloudSync.isEnabled();
    if (precisaPreparar) await bootstrapAccountLink();
    else await CloudSync.syncNow();
    if (!accountRefreshIsCurrent(epoch)) return { status: "stale" };
    if (state.account.authenticated && CloudSync.isEnabled()) __accountReadyScope = currentScope;
  } else if (typeof refreshOnboardingGate === "function") {
    refreshOnboardingGate({ release: true });
  }
  render();
  return { status: state.account.sessionStatus };
}

function handleAccountScopeChanged(details) {
  if (__accountScopeChangePromise) return __accountScopeChangePromise;
  invalidateAccountRefresh();
  clearAccountRecoveryRetry();
  ++__guestLinkToken;
  __accountReadyScope = "";
  if (typeof CloudSync !== "undefined") CloudSync.disable();
  state.account.authenticated = false;
  state.account.knownAccount = FinanceStore.scope() !== GUEST_SCOPE;
  state.account.sessionStatus = "unknown";
  state.account.loading = state.account.knownAccount;
  state.account.devices = [];
  state.account.busy = false;
  state.account.error = "";
  render();

  const promise = refreshAccountSession();
  __accountScopeChangePromise = promise;
  return promise.finally(() => {
    if (__accountScopeChangePromise === promise) __accountScopeChangePromise = null;
  });
}

async function handleSessionRefreshRequired(details) {
  const expected = String(details && details.expectedAccountId || "").trim().toLowerCase();
  // Uma resposta que chegou depois de outro login não ganha o direito de
  // consultar ou religar nada para a identidade nova.
  if (!expected || accountExpectedUserId() !== expected) return { status: "stale" };
  const result = await refreshAccountSession();
  if (!result || result.status !== "active" || accountExpectedUserId() !== expected) {
    return { status: result && result.status || "stale" };
  }
  // A consulta pode ter sido compartilhada com uma recuperação que decidiu
  // sincronizar enquanto o motor ainda estava ligado. Se esse ciclo recebeu o
  // pedido de refresh e desligou o motor antes de a consulta terminar, a
  // resposta `active` sozinha não o religa. Reavaliamos depois da promessa e
  // preparamos novamente somente para a mesma identidade confirmada.
  if (typeof CloudSync !== "undefined" && !CloudSync.isEnabled()) {
    const expectedScope = FinanceStore.scope();
    await bootstrapAccountLink();
    if (accountExpectedUserId() !== expected || FinanceStore.scope() !== expectedScope) return { status: "stale" };
    if (state.account.authenticated && CloudSync.isEnabled()) __accountReadyScope = expectedScope;
  }
  return result;
}

function recoverAccountSession(reason) {
  // Foco, pageshow e online podem disparar enquanto o usuário está saindo ou
  // apagando a cópia local. Uma consulta concorrente nesse intervalo poderia
  // revalidar o cookie e baixar novamente o que acabou de ser removido.
  if (__accountDisconnecting) return Promise.resolve(false);
  if (__accountRecoveryPromise) return __accountRecoveryPromise;
  const now = Date.now();
  if (reason !== "online" && now - __accountRecoveryLastAt < ACCOUNT_RECOVERY_DEDUP_MS) return Promise.resolve(false);
  __accountRecoveryLastAt = now;
  const promise = (async () => {
    if (state.account.sessionStatus === "active"
      && typeof CloudSync !== "undefined" && CloudSync.isEnabled()) {
      return CloudSync.syncNow();
    }
    return refreshAccountSession();
  })();
  __accountRecoveryPromise = promise;
  return promise.finally(() => {
    if (__accountRecoveryPromise === promise) __accountRecoveryPromise = null;
  });
}

function startAccountRecoveryListeners() {
  if (__accountRecoveryListenersStarted || typeof window === "undefined") return;
  __accountRecoveryListenersStarted = true;
  const recover = (reason) => {
    recoverAccountSession(reason).catch((error) => {
      if (typeof reportSafeError === "function") reportSafeError("sync", error, `account_recover_${reason}`);
    });
  };
  window.addEventListener("online", () => recover("online"));
  window.addEventListener("pageshow", () => recover("pageshow"));
  window.addEventListener("focus", () => recover("focus"));
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") recover("visible");
    });
  }
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

let __accountBootstrapPromise = null;

async function bootstrapAccount() {
  if (!__accountBootstrapPromise) __accountBootstrapPromise = performAccountBootstrap();
  return __accountBootstrapPromise;
}

async function performAccountBootstrap() {
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
    invalidateAccountRefresh();
    try {
      const result = await AccountAPI.verify(tokenHash, params.get("type") || (recuperacao ? "recovery" : "signup"));
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.email = result.email || "";
      state.account.userId = result.userId || "";
      state.account.pendingEmail = "";
      state.account.mode = result.purpose === "recovery" ? "password" : "login";
      state.account.message = result.purpose === "recovery"
        ? "Defina uma nova senha para concluir a recuperação."
        : "Email confirmado. Sua conta está pronta.";
    } catch (error) { state.account.error = error.message; }
  } else if (code) {
    consumiu = true;
    invalidateAccountRefresh();
    try {
      const result = await AccountAPI.exchange(code);
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.email = result.email || "";
      state.account.userId = result.userId || "";
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
  const refreshed = await refreshAccountSession();
  // O login por link já confirmou a sessão e definiu o cookie. Se a consulta
  // seguinte encontrou uma queda de rede, essa queda não desfaz a confirmação:
  // abrimos o escopo e iniciamos a descida usando o resultado explícito.
  if (refreshed && refreshed.status === "unknown" && state.account.authenticated && state.account.userId) {
    state.account.sessionStatus = "active";
    const mudouEscopo = await applyAccountScope(state.account.userId);
    if (typeof CloudSync !== "undefined") {
      const currentScope = FinanceStore.scope();
      if (mudouEscopo || __accountReadyScope !== currentScope || !CloudSync.isEnabled()) await bootstrapAccountLink();
      else await CloudSync.syncNow();
      if (state.account.authenticated && CloudSync.isEnabled()) __accountReadyScope = currentScope;
    }
  }
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
  if (kind === "login" || kind === "register") invalidateAccountRefresh();
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
    } else {
      const previousUserId = String(state.account.userId || "");
      state.account.authenticated = !!result.authenticated;
      if (state.account.authenticated) state.account.sessionStatus = "active";
      state.account.email = result.email || form.email;
      state.account.userId = result.userId || state.account.userId || "";
      if (previousUserId && previousUserId !== String(state.account.userId || "")) state.account.devices = [];
      state.account.pendingEmail = "";
      state.account.message = kind === "register" ? "Conta criada." : "Acesso confirmado.";
    }
    state.account.busy = false;
    const refreshed = await refreshAccountSession();
    if (refreshed && refreshed.status === "unknown" && state.account.authenticated && state.account.userId) {
      state.account.sessionStatus = "active";
      const mudouEscopo = await applyAccountScope(state.account.userId);
      if (typeof CloudSync !== "undefined") {
        const currentScope = FinanceStore.scope();
        if (mudouEscopo || __accountReadyScope !== currentScope || !CloudSync.isEnabled()) await bootstrapAccountLink();
        else await CloudSync.syncNow();
        if (state.account.authenticated && CloudSync.isEnabled()) __accountReadyScope = currentScope;
      }
    }
  } catch (error) {
    // Também no erro: senha errada continua sendo senha, e a tentativa seguinte
    // é digitada do zero.
    form.password = "";
    if (changedAccountScopeCode(error)) { await handleAccountScopeChanged(error); return; }
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
  if (__accountDisconnecting) return false;
  __accountDisconnecting = true;
  try {
    invalidateAccountRefresh();
    clearAccountRecoveryRetry();
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
      // Se o banco visitante não abrir, sair ainda precisa esconder o snapshot
      // da conta. A base permanece guardada no escopo próprio para um login
      // futuro, mas não continua exposta na tela sem sessão.
      state.data = defaultData();
      state.account = freshAccountState();
      state.account.loading = false;
      state.account.configured = true;
      state.account.sessionStatus = "guest";
      // Sair descarrega o banco da conta e volta para o de visitante. Sem isto,
      // o snapshot da conta continuaria em memória e na tela, e a próxima conta
      // a entrar neste aparelho o veria.
      await applyAccountScope("");
      render();
      return true;
    } catch (error) {
      if (changedAccountScopeCode(error)) { await handleAccountScopeChanged(error); return false; }
      accountSetBusy(false, error.message);
      return false;
    }
  } finally {
    __accountDisconnecting = false;
  }
}

// A alternativa da tela de Privacidade tem uma ordem mais rígida que o logout
// comum: primeiro o servidor precisa confirmar que o cookie acabou; somente
// depois é seguro destruir a base local. Se a rede falhar, nada local é
// apagado, pois uma sessão ainda válida baixaria a conta inteira outra vez.
async function accountForgetThisDevice() {
  if (__accountDisconnecting) return false;
  __accountDisconnecting = true;
  try {
    invalidateAccountRefresh();
    clearAccountRecoveryRetry();
    ++__guestLinkToken;
    __accountReadyScope = "";
    accountSetBusy(true, "");
    if (typeof CloudSync !== "undefined") CloudSync.disable();

    try {
      await AccountAPI.logout();
    } catch (error) {
      if (changedAccountScopeCode(error)) {
        await handleAccountScopeChanged(error);
        return false;
      }
      accountSetBusy(false, error.message);
      return false;
    }

    // Uma recuperação de sessão feita pelo próprio pedido de logout pode ter
    // religado o motor antes da repetição HTTP. Invalidamos de novo antes da
    // exclusão local.
    if (typeof CloudSync !== "undefined") CloudSync.disable();
    let localPurged = false;
    try { localPurged = (await FinanceStore.purge()) === true; }
    catch (_) { localPurged = false; }

    // Mesmo se abrir o escopo visitante falhar logo abaixo, a interface não
    // pode continuar apontando para o snapshot financeiro da conta que acabou
    // de perder a sessão. Se o navegador recusou o purge, ocultamos a cópia que
    // ainda pode existir no IndexedDB e explicamos a limpeza manual.
    state.data = localPurged ? FinanceStore.snapshot() : defaultData();

    state.account = freshAccountState();
    state.account.loading = false;
    state.account.configured = true;
    state.account.sessionStatus = "guest";
    let guestOpened = false;
    try {
      await applyAccountScope("");
      guestOpened = true;
    } catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("storage", error, "privacy_disconnect_scope");
    }
    if (typeof refreshOnboardingGate === "function") refreshOnboardingGate({ release: true });
    if (localPurged && typeof clearSafeErrors === "function") clearSafeErrors();
    render();

    if (!guestOpened && localPurged) {
      notify("A conta foi desconectada e a cópia local foi apagada, mas não foi possível abrir os dados de visitante deste aparelho.", "danger");
      return false;
    }
    if (!guestOpened) {
      notify("A conta foi desconectada, mas não foi possível apagar a cópia local nem abrir os dados de visitante. Limpe os dados deste site no navegador.", "danger");
      return false;
    }
    if (!localPurged) {
      notify("A conta foi desconectada, mas o navegador não permitiu apagar a cópia local. Limpe os dados deste site no navegador.", "danger");
      return false;
    }
    notify("Dados apagados deste aparelho. A conta foi desconectada aqui.");
    return true;
  } finally {
    __accountDisconnecting = false;
  }
}

async function accountRevoke(deviceId) {
  const expectedAccount = accountExpectedUserId();
  const accountState = state.account;
  accountSetBusy(true, "");
  try {
    const result = await AccountAPI.revokeDevice(deviceId);
    if (result.currentRevoked) { await accountLogout(); return; }
    // A resposta já confirmou a alteração. A linha sai sem esperar outra ida à
    // rede; a consulta seguinte apenas reconcilia atividade dos demais aparelhos.
    state.account.devices = (state.account.devices || []).filter((device) => String(device.id) !== String(deviceId));
    await refreshAccountSession();
    // Um refresh de foco pode ter começado antes do PATCH e reapresentado a
    // lista antiga. A confirmação da revogação manda mais que essa resposta.
    // Se outra conta entrou no intervalo, não tocamos no estado dela.
    if (state.account !== accountState || accountExpectedUserId() !== expectedAccount) return;
    state.account.devices = (state.account.devices || []).filter((device) => String(device.id) !== String(deviceId));
    state.account.busy = false;
    render();
    notify("Acesso do dispositivo revogado");
  } catch (error) {
    if (changedAccountScopeCode(error)) { await handleAccountScopeChanged(error); return; }
    accountSetBusy(false, error.message);
  } finally {
    // Falha inesperada durante o refresh não pode deixar toda a seção travada.
    if (state.account === accountState && state.account.busy) {
      state.account.busy = false;
      render();
    }
  }
}

async function accountDelete() {
  if (__accountDisconnecting) return false;
  __accountDisconnecting = true;
  try {
    invalidateAccountRefresh();
    clearAccountRecoveryRetry();
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
      let localPurged = false;
      try { localPurged = (await FinanceStore.purge()) === true; } catch (_) { localPurged = false; }
      // A exclusão do servidor já foi confirmada. Mesmo que o navegador falhe
      // ao apagar o IndexedDB ou abrir o escopo visitante, a tela não pode
      // conservar o snapshot financeiro da conta removida.
      state.data = localPurged ? FinanceStore.snapshot() : defaultData();
      state.account = freshAccountState(); state.account.loading = false; state.account.configured = true; state.account.sessionStatus = "guest";
      await applyAccountScope("");
      render();
      if (localPurged) notify("Conta apagada no servidor e neste aparelho.");
      else notify("A conta foi apagada no servidor, mas o navegador não permitiu apagar a cópia local. Limpe os dados deste site no navegador.", "danger");
      return true;
    } catch (error) {
      if (changedAccountScopeCode(error)) { await handleAccountScopeChanged(error); return false; }
      accountSetBusy(false, error.message);
      return false;
    }
  } finally {
    __accountDisconnecting = false;
  }
}
