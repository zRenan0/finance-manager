// test-auto-sync-session.js; recuperação automática sem transformar rede em logout.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8");
let ok = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function eventTarget(extra) {
  const listeners = new Map();
  return {
    ...(extra || {}),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    emit(type, event) {
      (listeners.get(type) || []).forEach((fn) => fn(event || { type }));
    },
  };
}

function context(options) {
  const opts = options || {};
  const storage = opts.storage || {
    getItem: () => "device-session-test-01",
    setItem: () => {},
    removeItem: () => {},
  };
  const document = eventTarget({ visibilityState: "visible" });
  const window = eventTarget();
  let scope = "u_known-user";
  const cloud = {
    _enabled: false,
    syncCalls: 0,
    disableCalls: 0,
    isEnabled() { return this._enabled; },
    async syncNow() { this.syncCalls += 1; return true; },
    disable() { this.disableCalls += 1; this._enabled = false; },
  };
  const ctx = {
    console, crypto, URL, URLSearchParams, Promise, Date, Math, AbortController,
    fetch: opts.fetch || fetch,
    setTimeout: opts.setTimeout || setTimeout,
    clearTimeout: opts.clearTimeout || clearTimeout,
    localStorage: storage,
    navigator: opts.navigator || {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
    },
    location: { protocol: "https:", search: "", hash: "", pathname: "/index.html" },
    history: { state: null, replaceState() {} },
    window, document,
    CloudSync: cloud,
    GUEST_SCOPE: "guest",
    FinanceStore: {
      async flush() { return true; },
      scope() { return scope; },
      snapshot() { return { onboarding: { done: false } }; },
    },
    defaultData: () => ({ onboarding: { done: false } }),
    storageScopeFor(userId) { return userId ? `u_${userId}` : "guest"; },
    switchStorageScope: async (next) => { scope = next; return { onboarding: { done: true } }; },
    isStorageAvailable: () => true,
    refreshOnboardingGate: () => false,
    render() {},
    notify() {},
    reportSafeError() {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "js/auth.js" });
  ctx.run = (code) => vm.runInContext(code, ctx);
  ctx.run(`
    state = { account: freshAccountState(), data: {}, storageOk: true };
    __scopeTargets = [];
    __bootstrapCalls = 0;
    applyAccountScope = async (userId) => {
      __scopeTargets.push(String(userId || ""));
      const next = storageScopeFor(userId);
      const changed = next !== FinanceStore.scope();
      if (changed) await switchStorageScope(next);
      return changed;
    };
    __bootstrapReal = bootstrapAccountLink;
    bootstrapAccountLink = async () => { __bootstrapCalls += 1; CloudSync._enabled = true; };
  `);
  return ctx;
}

async function waitRecovery(ctx) {
  await Promise.resolve();
  const pending = ctx.run("__accountRecoveryPromise");
  if (pending) await pending;
  await Promise.resolve();
}

(async () => {
  console.log("\n1. Falha de transporte preserva a conta conhecida");
  {
    const cold = context();
    cold.run(`AccountAPI.session = async () => { const e = new Error("sem rede"); e.code = "network_error"; throw e; };`);
    const coldResult = await cold.run("refreshAccountSession()");
    check("cold reload reconhece o escopo lembrado", coldResult.status === "unknown" && cold.run("state.account.knownAccount") === true);
    check("cold reload não inventa autenticação, email ou identidade", cold.run("state.account.authenticated") === false
      && cold.run("state.account.email") === "" && cold.run("state.account.userId") === "");
    check("cold reload não mostra o formulário de visitante", cold.run("state.account.loading") === true);
    check("cold reload mantém o banco da conta", cold.run("__scopeTargets.length") === 0, cold.run("JSON.stringify(__scopeTargets)"));

    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      state.account.email = "ana@example.com";
      CloudSync._enabled = true;
      AccountAPI.session = async () => { const e = new Error("sem rede"); e.code = "network_error"; throw e; };
    `);
    const result = await ctx.run("refreshAccountSession()");
    check("a sessão fica desconhecida", result.status === "unknown" && ctx.run("state.account.sessionStatus") === "unknown");
    check("a conta não vira logout", ctx.run("state.account.authenticated") === true);
    check("o escopo autenticado não é trocado", ctx.run("__scopeTargets.length") === 0, ctx.run("JSON.stringify(__scopeTargets)"));
    check("o motor não é desligado por falta de rede", ctx.CloudSync.disableCalls === 0);

    ctx.run(`
      state.account.sessionStatus = "active";
      AccountAPI.session = async () => ({ ok: true, configured: false, authenticated: false });
    `);
    const unavailable = await ctx.run("refreshAccountSession()");
    check("publicação sem backend também não confirma logout", unavailable.status === "unknown"
      && ctx.run("state.account.authenticated") === true && ctx.run("__scopeTargets.length") === 0);
  }

  console.log("\n2. Logout confirmado troca para visitante");
  {
    const ctx = context();
    ctx.run(`
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      CloudSync._enabled = true;
      AccountAPI.session = async () => ({ ok: true, configured: true, authenticated: false });
    `);
    const result = await ctx.run("refreshAccountSession()");
    check("a resposta guest é distinguida da falha", result.status === "guest" && ctx.run("state.account.sessionStatus") === "guest");
    check("o banco visitante é aberto só depois da confirmação", ctx.run("__scopeTargets.join(',')") === "", ctx.run("JSON.stringify(__scopeTargets)"));
    check("a sincronização para no logout confirmado", ctx.CloudSync.disableCalls > 0);
  }

  console.log("\n3. Revogação confirmada encerra a sessão sem apagar a base");
  {
    const ctx = context();
    ctx.run(`
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      CloudSync._enabled = true;
      AccountAPI.session = async () => { const e = new Error("revogado"); e.code = "device_revoked"; throw e; };
    `);
    const result = await ctx.run("refreshAccountSession()");
    check("revogação volta para visitante", result.status === "guest" && ctx.run("state.account.sessionStatus") === "guest");
    check("a troca não chama exclusão do armazenamento", typeof ctx.FinanceStore.purge === "undefined");
    check("o escopo da conta continua guardado e só deixa a memória", ctx.run("__scopeTargets.join(',')") === "", ctx.run("JSON.stringify(__scopeTargets)"));
  }

  console.log("\n4. Consultas concorrentes compartilham a primeira descida");
  {
    const ctx = context();
    ctx.run(`
      __sessionCalls = 0;
      __resolveSession = null;
      AccountAPI.session = () => { __sessionCalls += 1; return new Promise((resolve) => { __resolveSession = resolve; }); };
      AccountAPI.devices = async () => ({ devices: [] });
    `);
    const first = ctx.run("refreshAccountSession()");
    const second = ctx.run("refreshAccountSession()");
    check("duas chamadas fazem uma consulta", ctx.run("__sessionCalls") === 1, ctx.run("__sessionCalls"));
    ctx.run(`__resolveSession({ ok: true, configured: true, authenticated: true, userId: "known-user", email: "ana@example.com" })`);
    await Promise.all([first, second]);
    check("o preparo remoto também roda uma vez", ctx.run("__bootstrapCalls") === 1, ctx.run("__bootstrapCalls"));
  }

  console.log("\n5. Reload e eventos recuperam ou puxam automaticamente");
  {
    const ctx = context();
    ctx.run(`
      __sessionCalls = 0;
      AccountAPI.session = async () => { __sessionCalls += 1; return { ok: true, configured: true, authenticated: true, userId: "known-user", email: "ana@example.com" }; };
      AccountAPI.devices = async () => ({ devices: [] });
    `);
    const first = ctx.run("bootstrapAccount()");
    const second = ctx.run("bootstrapAccount()");
    await Promise.all([first, second]);
    check("o bootstrap da recarga é único", ctx.run("__sessionCalls") === 1, ctx.run("__sessionCalls"));

    ctx.run("startAccountRecoveryListeners(); state.account.sessionStatus = 'unknown'; CloudSync._enabled = false; __accountRecoveryLastAt = 0;");
    ctx.window.emit("online");
    await waitRecovery(ctx);
    check("online reavalia uma sessão desconhecida", ctx.run("__sessionCalls") === 2, ctx.run("__sessionCalls"));

    const eventCases = [
      ["pageshow", () => ctx.window.emit("pageshow")],
      ["focus", () => ctx.window.emit("focus")],
      ["visibility", () => { ctx.document.visibilityState = "visible"; ctx.document.emit("visibilitychange"); }],
    ];
    for (const [name, emit] of eventCases) {
      const before = ctx.CloudSync.syncCalls;
      ctx.run("__accountRecoveryLastAt = 0");
      emit();
      await waitRecovery(ctx);
      check(`${name} puxa dados sem botão`, ctx.CloudSync.syncCalls === before + 1, `${before} -> ${ctx.CloudSync.syncCalls}`);
    }
  }

  console.log("\n6. Identidade temporária do aparelho é estável");
  {
    const throwingStorage = {
      getItem() { throw new Error("bloqueado"); },
      setItem() { throw new Error("bloqueado"); },
      removeItem() {},
    };
    const ctx = context({ storage: throwingStorage });
    const ids = ctx.run("[accountDeviceId(), accountDeviceId()]");
    check("o fallback não cria um aparelho por chamada", ids[0] === ids[1], ids.join(" / "));
    check("o rótulo identifica navegador e plataforma", ctx.run("accountDeviceLabel()") === "Chrome no Windows", ctx.run("accountDeviceLabel()"));
    check("o tipo do computador é enviado como desktop", ctx.run("accountCurrentDeviceType()") === "desktop", ctx.run("accountCurrentDeviceType()"));

    const androidTablet = context({ navigator: {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      platform: "Linux armv8l", maxTouchPoints: 10,
    } });
    check("Android sem Mobile é tablet", androidTablet.run("accountCurrentDeviceType()") === "tablet", androidTablet.run("accountCurrentDeviceType()"));
    const chromeOs = context({ navigator: {
      userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      platform: "Linux x86_64", maxTouchPoints: 0,
    } });
    check("ChromeOS não vira Linux no rótulo", chromeOs.run("accountDeviceLabel()") === "Chrome no ChromeOS", chromeOs.run("accountDeviceLabel()"));
  }

  console.log("\n7. Revogação libera a tela e remove a linha");
  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.devices = [{ id: "device-a" }, { id: "device-b" }];
      AccountAPI.revokeDevice = async () => ({ ok: true, currentRevoked: false });
      refreshAccountSession = async () => ({ status: "active" });
    `);
    await ctx.run("accountRevoke('device-a')");
    check("o acesso confirmado sai da lista imediatamente", ctx.run("state.account.devices.map((d) => d.id).join(',')") === "device-b",
      ctx.run("JSON.stringify(state.account.devices)"));
    check("busy termina depois do sucesso", ctx.run("state.account.busy") === false);
  }

  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      state.account.devices = [{ id: "device-a" }, { id: "device-b" }];
      AccountAPI.revokeDevice = async () => ({ ok: true, currentRevoked: false });
      __finishRevocationRefresh = null;
      refreshAccountSession = () => new Promise((resolve) => {
        __finishRevocationRefresh = () => {
          state.account.devices = [{ id: "device-a" }, { id: "device-b" }];
          resolve({ status: "active" });
        };
      });
    `);
    const revoking = ctx.run("accountRevoke('device-a')");
    await Promise.resolve();
    ctx.run("__finishRevocationRefresh()");
    await revoking;
    check("refresh antigo não reapresenta o acesso revogado", ctx.run("state.account.devices.map((d) => d.id).join(',')") === "device-b",
      ctx.run("JSON.stringify(state.account.devices)"));
  }

  console.log("\n8. Refresh compartilhado religa o motor que parou durante a consulta");
  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      state.account.email = "ana@example.com";
      CloudSync._enabled = true;
      __accountReadyScope = FinanceStore.scope();
      __resolveSharedSession = null;
      AccountAPI.session = () => new Promise((resolve) => { __resolveSharedSession = resolve; });
      AccountAPI.devices = async () => ({ devices: [] });
      CloudSync.syncNow = async () => {
        CloudSync.syncCalls += 1;
        CloudSync._enabled = false;
        return false;
      };
    `);
    const existing = ctx.run("refreshAccountSession()");
    const hook = ctx.run(`handleSessionRefreshRequired({ expectedAccountId: "known-user" })`);
    ctx.run(`__resolveSharedSession({
      ok: true, configured: true, authenticated: true,
      userId: "known-user", email: "ana@example.com"
    })`);
    const [existingResult, hookResult] = await Promise.all([existing, hook]);
    check("a consulta compartilhada continua autenticada", existingResult.status === "active" && hookResult.status === "active");
    check("o ciclo em voo chegou a desligar o motor", ctx.CloudSync.syncCalls === 1, ctx.CloudSync.syncCalls);
    check("o hook reavalia e prepara o motor novamente", ctx.run("__bootstrapCalls") === 1 && ctx.CloudSync.isEnabled(),
      JSON.stringify({ bootstrapCalls: ctx.run("__bootstrapCalls"), enabled: ctx.CloudSync.isEnabled() }));
  }

  console.log("\n9. Requisição pendurada expira e libera a recuperação seguinte");
  {
    let timeoutCallback = null;
    let hanging = true;
    let hangingBody = false;
    let sessionCalls = 0;
    const pendingTimers = new Set();
    const fakeSetTimeout = (fn, delay) => {
      const id = { fn, delay };
      pendingTimers.add(id);
      if (delay === 12000) timeoutCallback = fn;
      return id;
    };
    const fakeClearTimeout = (id) => { pendingTimers.delete(id); };
    const abortError = () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return error;
    };
    const responseOf = (payload) => ({
      ok: true,
      status: 200,
      headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/json" : null },
      json: async () => payload,
    });
    const fetchImpl = (url, options) => {
      if (String(url).endsWith("/devices")) return Promise.resolve(responseOf({ ok: true, devices: [] }));
      sessionCalls += 1;
      if (hangingBody) {
        const signal = options && options.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/json" : null },
          json: () => new Promise((resolve, reject) => {
            if (signal && signal.aborted) { reject(abortError()); return; }
            signal.addEventListener("abort", () => reject(abortError()), { once: true });
          }),
        });
      }
      if (!hanging) {
        return Promise.resolve(responseOf({
          ok: true, configured: true, authenticated: true,
          userId: "known-user", email: "ana@example.com",
        }));
      }
      return new Promise((resolve, reject) => {
        const signal = options && options.signal;
        if (signal && signal.aborted) { reject(abortError()); return; }
        signal.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    };
    const ctx = context({
      fetch: fetchImpl,
      setTimeout: fakeSetTimeout,
      clearTimeout: fakeClearTimeout,
    });

    const first = ctx.run("refreshAccountSession()");
    await Promise.resolve();
    await Promise.resolve();
    check("o pedido pendurado arma o limite de 12 segundos", typeof timeoutCallback === "function");
    timeoutCallback();
    const timedOut = await first;
    check("timeout é falha temporária, não logout", timedOut.status === "unknown"
      && timedOut.error && timedOut.error.code === "timeout"
      && ctx.run("state.account.knownAccount") === true,
    JSON.stringify({ status: timedOut.status, code: timedOut.error && timedOut.error.code }));
    check("a promessa compartilhada é liberada depois do timeout", ctx.run("__accountSessionRefreshPromise") === null);

    hanging = false;
    timeoutCallback = null;
    const recovered = await ctx.run("refreshAccountSession()");
    check("a tentativa seguinte consulta novamente e recupera a conta", recovered.status === "active"
      && sessionCalls === 2 && ctx.run("__bootstrapCalls") === 1,
    JSON.stringify({ status: recovered.status, sessionCalls, bootstrapCalls: ctx.run("__bootstrapCalls") }));

    hangingBody = true;
    timeoutCallback = null;
    const bodyPending = ctx.run("refreshAccountSession()");
    await Promise.resolve();
    await Promise.resolve();
    timeoutCallback();
    const bodyTimedOut = await bodyPending;
    check("o limite continua ativo enquanto o corpo JSON é lido", bodyTimedOut.status === "unknown"
      && bodyTimedOut.error && bodyTimedOut.error.code === "timeout"
      && ctx.run("__accountSessionRefreshPromise") === null,
    JSON.stringify({ status: bodyTimedOut.status, code: bodyTimedOut.error && bodyTimedOut.error.code }));

    hangingBody = false;
    hanging = true;
    const external = new AbortController();
    ctx.__externalAbort = external;
    const cancelled = ctx.run("AccountAPI.session({ signal: __externalAbort.signal }).catch((error) => error)");
    external.abort();
    const cancelledError = await cancelled;
    check("abort externo continua sendo cancelamento, não timeout", cancelledError.code === "request_aborted", cancelledError.code);
  }

  console.log("\n10. Apagar só neste aparelho encerra a sessão antes da exclusão local");
  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.knownAccount = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      CloudSync._enabled = true;
      __forgetOrder = [];
      __forgetApplyScope = applyAccountScope;
      CloudSync.disable = () => {
        __forgetOrder.push("disable");
        CloudSync.disableCalls += 1;
        CloudSync._enabled = false;
      };
      AccountAPI.logout = async () => { __forgetOrder.push("logout"); return { ok: true }; };
      FinanceStore.purge = async () => { __forgetOrder.push("purge"); return true; };
      applyAccountScope = async (userId) => {
        __forgetOrder.push("scope:" + String(userId || "guest"));
        return __forgetApplyScope(userId);
      };
    `);
    const removed = await ctx.run("accountForgetThisDevice()");
    const order = ctx.run("__forgetOrder.slice()");
    check("o servidor confirma o logout antes do purge", removed === true
      && order.indexOf("logout") < order.indexOf("purge"), order.join(" -> "));
    check("o motor para antes do logout e permanece parado", order[0] === "disable" && ctx.CloudSync.isEnabled() === false,
      order.join(" -> "));
    check("a tela termina no escopo visitante", ctx.run("state.account.sessionStatus") === "guest"
      && ctx.run("FinanceStore.scope()") === "guest", ctx.run("FinanceStore.scope()"));
    check("os gatilhos automáticos são liberados ao terminar", ctx.run("__accountDisconnecting") === false);
  }

  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.knownAccount = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      CloudSync._enabled = true;
      __purgeCalls = 0;
      AccountAPI.logout = async () => { const error = new Error("sem rede"); error.code = "network_error"; throw error; };
      FinanceStore.purge = async () => { __purgeCalls += 1; return true; };
    `);
    const removed = await ctx.run("accountForgetThisDevice()");
    check("falha de logout não apaga a única cópia local", removed === false && ctx.run("__purgeCalls") === 0,
      ctx.run("__purgeCalls"));
    check("a falha preserva conta e escopo para nova tentativa", ctx.run("state.account.sessionStatus") === "active"
      && ctx.run("FinanceStore.scope()") === "u_known-user", ctx.run("FinanceStore.scope()"));
    check("a falha também libera a recuperação automática", ctx.run("__accountDisconnecting") === false);
  }

  {
    const ctx = context();
    ctx.run(`
      state.data = { secret: "snapshot-da-conta" };
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.knownAccount = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      AccountAPI.logout = async () => ({ ok: true });
      FinanceStore.purge = async () => true;
      FinanceStore.snapshot = () => ({ marker: "purged", onboarding: { done: false } });
      applyAccountScope = async () => { throw new Error("IndexedDB indisponível"); };
    `);
    const removed = await ctx.run("accountForgetThisDevice()");
    check("falha ao abrir visitante não deixa o snapshot da conta na tela", removed === false
      && ctx.run("state.data.marker") === "purged" && ctx.run("state.data.secret") === undefined,
      ctx.run("JSON.stringify(state.data)"));
    check("a sessão permanece encerrada mesmo se o escopo visitante falhar", ctx.run("state.account.sessionStatus") === "guest");
  }

  console.log("\n11. Sair ou excluir a conta nunca deixa o snapshot antigo visível");
  {
    const ctx = context();
    ctx.run(`
      state.data = { secret: "snapshot-da-conta" };
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      AccountAPI.logout = async () => ({ ok: true });
      applyAccountScope = async () => { throw new Error("IndexedDB indisponível"); };
    `);
    const loggedOut = await ctx.run("accountLogout()");
    check("falha ao abrir visitante depois do logout esconde a conta", loggedOut === false
      && ctx.run("state.account.sessionStatus") === "guest" && ctx.run("state.data.secret") === undefined,
      ctx.run("JSON.stringify({ account: state.account, data: state.data })"));
  }

  {
    const ctx = context();
    ctx.run(`
      state.data = { secret: "snapshot-da-conta" };
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      AccountAPI.deleteAccount = async () => ({ ok: true });
      FinanceStore.purge = async () => false;
      applyAccountScope = async () => { throw new Error("IndexedDB indisponível"); };
    `);
    const deleted = await ctx.run("accountDelete()");
    check("falha local depois da exclusão online esconde a conta", deleted === false
      && ctx.run("state.account.sessionStatus") === "guest" && ctx.run("state.data.secret") === undefined,
      ctx.run("JSON.stringify({ account: state.account, data: state.data })"));
  }

  // ------------------------------------------------------------------------
  // O PORTAO DA SUBIDA
  // ------------------------------------------------------------------------
  // `CloudSync.prepareAccount()` fecha o portao: enquanto ele estiver fechado o
  // aparelho BAIXA e nao ENVIA, para o vinculo poder perguntar "esta conta ja
  // tem alguma coisa?" antes de este aparelho escrever nela.
  //
  // A sequencia desiste quando outra entrada assume no meio. O defeito era
  // desistir com o portao ainda fechado: dali em diante o aparelho aplicava o
  // que os outros escreviam, mostrava "Tudo sincronizado" e nunca mais enviava
  // nada, ate a pagina ser recarregada. No servidor isso aparece como um
  // aparelho que consulta todo dia e nunca gravou uma operacao sequer.
  console.log("\n8. O portao da subida sobrevive a um vinculo abandonado");
  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      __liberacoes = 0;
      CloudSync.prepareAccount = async () => {
        // Outra entrada assume enquanto a descida acontece: o token avanca e a
        // sequencia em voo deixa de valer.
        __guestLinkToken += 1;
        return { ok: true, revision: "7", phase: "idle", error: null, errorCode: null };
      };
      CloudSync.finishAccountBootstrap = async () => { __liberacoes += 1; return true; };
      FinanceStore.peekScope = async () => ({ exists: false, readable: true, digest: "" });
    `);
    await ctx.run("__bootstrapReal()");
    check("vinculo abandonado no meio ainda libera a fila para subir",
      ctx.run("__liberacoes") === 1, `liberacoes=${ctx.run("__liberacoes")}`);
  }

  {
    const ctx = context();
    ctx.run(`
      state.account.loading = false;
      state.account.authenticated = true;
      state.account.sessionStatus = "active";
      state.account.userId = "known-user";
      __liberacoes = 0;
      CloudSync.prepareAccount = async () => ({ ok: true, revision: "7", phase: "idle", error: null, errorCode: null });
      CloudSync.finishAccountBootstrap = async () => { __liberacoes += 1; return true; };
      FinanceStore.peekScope = async () => ({ exists: false, readable: true, digest: "" });
    `);
    await ctx.run("__bootstrapReal()");
    // A rede de seguranca nao pode virar ciclo extra em toda entrada: liberar
    // duas vezes gastaria uma volta inteira de rede sem nada para enviar.
    check("o caminho normal libera uma vez so",
      ctx.run("__liberacoes") === 1, `liberacoes=${ctx.run("__liberacoes")}`);
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
