"use strict";

const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const DEVICE_ID = "device-test-1234";
const DEVICE_SECRET = "segredo-do-aparelho";
const DEVICE_HASH = crypto.createHash("sha256").update(DEVICE_SECRET).digest("hex");
const COOKIE = `cofre_access=access-secret; cofre_refresh=refresh-secret; cofre_device=${DEVICE_SECRET}`;

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`);
  }
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? "" : JSON.stringify(body); },
  };
}

function cookiesOf(result) {
  return (result.multiValueHeaders && result.multiValueHeaders["Set-Cookie"]) || [];
}

function bodyOf(result) {
  return JSON.parse(result.body || "{}");
}

function jwtFor(subject) {
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded({ alg: "none", typ: "JWT" })}.${encoded({ sub: subject })}.unsigned`;
}

function baseHeaders(accountId, cookie = COOKIE) {
  return {
    origin: "https://cofre.test",
    host: "cofre.test",
    "x-forwarded-proto": "https",
    cookie,
    "x-device-id": DEVICE_ID,
    ...(accountId === undefined ? {} : { "x-account-id": accountId }),
  };
}

function accountEvent(method, action, body, accountId, cookie) {
  return {
    httpMethod: method,
    path: `/api/account/${action}`,
    queryStringParameters: { action },
    headers: baseHeaders(accountId, cookie),
    body: body == null ? null : JSON.stringify(body),
  };
}

function syncEvent(accountId, cookie) {
  return {
    httpMethod: "GET",
    path: "/api/sync/health",
    queryStringParameters: { action: "health" },
    headers: { ...baseHeaders(accountId, cookie), "x-sync-protocol": "3" },
  };
}

function analyzeEvent(accountId, cookie) {
  return {
    httpMethod: "POST",
    path: "/api/analyze",
    headers: baseHeaders(accountId, cookie),
    body: "{}",
  };
}

async function thrown(work) {
  try {
    await work();
    return null;
  } catch (error) {
    return error;
  }
}

async function main() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";
  process.env.ANTHROPIC_API_KEY = "must-not-be-used";

  const originalFetch = global.fetch;
  const originalDb = api.db;
  const originalAuth = { ...api.auth };

  console.log("\n1. Falhas do provedor preservam natureza e status");
  for (const status of [502, 503]) {
    global.fetch = async () => response(status, { message: "upstream unavailable" });
    const error = await thrown(() => api.request("/auth/v1/user"));
    check(`HTTP ${status} continua sendo indisponibilidade`,
      error && error.statusCode === status && error.code === "upstream_unavailable",
      error && `${error.statusCode} ${error.code}`);
  }

  global.fetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  const aborted = await thrown(() => api.request("/auth/v1/user"));
  check("abort de fetch vira timeout, não sessão expirada",
    aborted && aborted.statusCode === 504 && aborted.code === "request_timeout",
    aborted && `${aborted.statusCode} ${aborted.code}`);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() { throw Object.assign(new Error("aborted body"), { name: "AbortError" }); },
  });
  const abortedBody = await thrown(() => api.request("/auth/v1/user"));
  check("abort durante o corpo também vira timeout",
    abortedBody && abortedBody.statusCode === 504 && abortedBody.code === "request_timeout",
    abortedBody && `${abortedBody.statusCode} ${abortedBody.code}`);

  global.fetch = async () => response(500, { error_code: "request_timeout", msg: "timed out" });
  const upstreamTimeout = await thrown(() => api.request("/auth/v1/user"));
  check("request_timeout do Supabase vira 504",
    upstreamTimeout && upstreamTimeout.statusCode === 504 && upstreamTimeout.code === "request_timeout",
    upstreamTimeout && `${upstreamTimeout.statusCode} ${upstreamTimeout.code}`);

  const terminalCodes = [
    "bad_jwt", "refresh_token_not_found", "refresh_token_already_used",
    "session_not_found", "session_expired",
  ];
  for (const code of terminalCodes) {
    global.fetch = async () => response(400, { error_code: code, msg: code });
    const error = await thrown(() => api.request("/auth/v1/token"));
    check(`código terminal ${code} é preservado`,
      error && error.statusCode === 401 && error.code === code,
      error && `${error.statusCode} ${error.code}`);
  }
  global.fetch = originalFetch;

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));

  console.log("\n2. Sondas automáticas nunca apagam um login mais novo");
  let refreshCalls = 0;
  api.auth.refresh = async () => {
    refreshCalls++;
    throw Object.assign(new Error("não deveria renovar"), { statusCode: 503, code: "upstream_unavailable" });
  };
  for (const outageCase of [
    { statusCode: 502, code: "upstream_unavailable" },
    { statusCode: 503, code: "upstream_unavailable" },
    { statusCode: 504, code: "request_timeout" },
  ]) {
    api.auth.user = async () => {
      throw Object.assign(new Error("Supabase indisponível"), outageCase);
    };
    const outage = await account.handler(accountEvent("GET", "session", null, USER_ID));
    check(`${outageCase.statusCode} da consulta de usuário é preservado sem deletes`,
      outage.statusCode === outageCase.statusCode
        && bodyOf(outage).code === outageCase.code
        && cookiesOf(outage).length === 0,
      `${outage.statusCode} ${bodyOf(outage).code} ${cookiesOf(outage).length}`);
  }
  check("outage não tenta usar o refresh", refreshCalls === 0, refreshCalls);

  api.auth.user = async () => {
    throw Object.assign(new Error("token morto"), { statusCode: 401, code: "bad_jwt" });
  };
  api.auth.refresh = async () => {
    throw Object.assign(new Error("refresh morto"), { statusCode: 401, code: "refresh_token_not_found" });
  };
  const dead = await account.handler(accountEvent("GET", "session", null, USER_ID));
  check("credenciais encerradas viram visitante sem Set-Cookie",
    dead.statusCode === 200 && bodyOf(dead).authenticated === false && cookiesOf(dead).length === 0,
    `${dead.statusCode} ${cookiesOf(dead).length}`);

  const guest = await account.handler({
    httpMethod: "GET", path: "/api/account/session", queryStringParameters: { action: "session" },
    headers: { host: "cofre.test", "x-forwarded-proto": "https", "x-device-id": DEVICE_ID },
  });
  check("sonda sem credenciais não emite cookies de exclusão",
    guest.statusCode === 200 && bodyOf(guest).authenticated === false && cookiesOf(guest).length === 0,
    `${guest.statusCode} ${cookiesOf(guest).length}`);

  console.log("\n3. Escopo esperado falha antes de dados, limite e modelo");
  let userCalls = 0;
  api.auth.user = async () => {
    userCalls++;
    return {
    id: USER_ID,
    email: "pessoa@example.com",
    email_confirmed_at: "2026-08-01T12:00:00Z",
    };
  };
  let scopedRefreshCalls = 0;
  api.auth.refresh = async () => {
    scopedRefreshCalls++;
    throw new Error("refresh não deveria ser usado");
  };
  let dbCalls = 0;
  let syncDataCalls = 0;
  let rateCalls = 0;
  api.db = async (route, options = {}) => {
    dbCalls++;
    if (route.startsWith("cofre_devices?user_id=") && !options.method) {
      return [{ device_id: DEVICE_ID, secret_hash: DEVICE_HASH, revoked_at: null }];
    }
    if (route.startsWith("cofre_devices?user_id=") && options.method === "PATCH") {
      return [{ device_id: DEVICE_ID }];
    }
    if (route === "rpc/cofre_rate_hit") {
      rateCalls++;
      return [{ allowed: true, retry_after: 0, hits: 1 }];
    }
    if (/^cofre_sync_|^rpc\/cofre_(apply|reset|create_checkpoint)/.test(route)) syncDataCalls++;
    return null;
  };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/sync"))];
  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/analyze"))];
  const sync = require(path.join(ROOT, "netlify/functions/sync"));
  const analyze = require(path.join(ROOT, "netlify/functions/analyze"));

  const missingSync = await sync.handler(syncEvent(undefined));
  const malformedSync = await sync.handler(syncEvent("not-a-uuid"));
  const mismatchedSync = await sync.handler(syncEvent(OTHER_USER_ID));
  check("sync sem escopo falha fechado",
    missingSync.statusCode === 400 && bodyOf(missingSync).code === "invalid_account_scope", missingSync.body);
  check("sync com escopo malformado falha fechado",
    malformedSync.statusCode === 400 && bodyOf(malformedSync).code === "invalid_account_scope", malformedSync.body);
  check("sync de outra conta usa o contrato 403",
    mismatchedSync.statusCode === 403 && bodyOf(mismatchedSync).code === "account_scope_changed", mismatchedSync.body);
  check("sync não consulta dispositivo, configuração nem dados com escopo inválido",
    dbCalls === 0 && syncDataCalls === 0
      && scopedRefreshCalls === 0
      && [missingSync, malformedSync, mismatchedSync].every((item) => cookiesOf(item).length === 0),
    `${dbCalls} / ${syncDataCalls} / ${scopedRefreshCalls}`);

  userCalls = 0;
  const jwtCookie = `cofre_access=${jwtFor(USER_ID)}; cofre_refresh=refresh-secret; cofre_device=${DEVICE_SECRET}`;
  const earlyMismatch = await sync.handler(syncEvent(OTHER_USER_ID, jwtCookie));
  check("sub não verificado só antecipa a recusa e evita Auth",
    earlyMismatch.statusCode === 403 && bodyOf(earlyMismatch).code === "account_scope_changed"
      && userCalls === 0 && scopedRefreshCalls === 0 && dbCalls === 0,
    `${earlyMismatch.statusCode} / ${userCalls} / ${scopedRefreshCalls} / ${dbCalls}`);

  rateCalls = 0;
  const missingAnalyze = await analyze.handler(analyzeEvent(undefined));
  const mismatchedAnalyze = await analyze.handler(analyzeEvent(OTHER_USER_ID));
  check("análise sem escopo usa invalid_account_scope",
    missingAnalyze.statusCode === 400 && bodyOf(missingAnalyze).code === "invalid_account_scope", missingAnalyze.body);
  check("análise de outra conta usa account_scope_changed",
    mismatchedAnalyze.statusCode === 403 && bodyOf(mismatchedAnalyze).code === "account_scope_changed", mismatchedAnalyze.body);
  check("análise não consome limite nem modelo com escopo inválido",
    dbCalls === 0 && rateCalls === 0
      && scopedRefreshCalls === 0
      && [missingAnalyze, mismatchedAnalyze].every((item) => cookiesOf(item).length === 0),
    `${dbCalls} / ${rateCalls} / ${scopedRefreshCalls}`);

  console.log("\n4. Rotas com escopo nunca consomem refresh");
  const refreshOnly = `cofre_refresh=refresh-secret; cofre_device=${DEVICE_SECRET}`;
  dbCalls = 0;
  scopedRefreshCalls = 0;
  const refreshSync = await sync.handler(syncEvent(USER_ID, refreshOnly));
  const refreshAnalyze = await analyze.handler(analyzeEvent(USER_ID, refreshOnly));
  const refreshDevices = await account.handler(accountEvent("GET", "devices", null, USER_ID, refreshOnly));
  check("sync refresh-only pede renovação explícita",
    refreshSync.statusCode === 401 && bodyOf(refreshSync).code === "session_refresh_required", refreshSync.body);
  check("análise refresh-only preserva o mesmo contrato",
    refreshAnalyze.statusCode === 401 && bodyOf(refreshAnalyze).code === "session_refresh_required", refreshAnalyze.body);
  check("conta refresh-only preserva o mesmo contrato",
    refreshDevices.statusCode === 401 && bodyOf(refreshDevices).code === "session_refresh_required", refreshDevices.body);
  check("refresh-only não chama Auth refresh, DB nem Set-Cookie",
    scopedRefreshCalls === 0 && dbCalls === 0
      && [refreshSync, refreshAnalyze, refreshDevices].every((item) => cookiesOf(item).length === 0),
    `${scopedRefreshCalls} / ${dbCalls}`);

  api.auth.user = async () => {
    throw Object.assign(new Error("access expirado"), { statusCode: 401, code: "bad_jwt" });
  };
  const expiredSync = await sync.handler(syncEvent(USER_ID));
  check("access expirado com refresh também pede renovação sem consumi-lo",
    expiredSync.statusCode === 401 && bodyOf(expiredSync).code === "session_refresh_required"
      && scopedRefreshCalls === 0 && dbCalls === 0 && cookiesOf(expiredSync).length === 0,
    `${expiredSync.statusCode} / ${scopedRefreshCalls} / ${dbCalls}`);

  api.auth.user = async () => ({
    id: USER_ID, email: "pessoa@example.com", email_confirmed_at: "2026-08-01T12:00:00Z",
  });
  api.auth.refresh = async () => {
    scopedRefreshCalls++;
    return {
      access_token: "access-renovado", refresh_token: "refresh-renovado", expires_in: 3600,
      user: { id: USER_ID, email: "pessoa@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" },
    };
  };
  const renewed = await account.handler(accountEvent("GET", "session", null, undefined, refreshOnly));
  check("somente /account/session renova o refresh-only",
    renewed.statusCode === 200 && bodyOf(renewed).authenticated === true
      && scopedRefreshCalls === 1 && cookiesOf(renewed).length >= 2,
    `${renewed.statusCode} / ${scopedRefreshCalls} / ${cookiesOf(renewed).length}`);

  api.auth.refresh = async () => {
    scopedRefreshCalls++;
    throw new Error("refresh não deveria ser usado");
  };

  console.log("\n5. Ações autenticadas da conta respeitam o mesmo escopo");
  let updateCalls = 0;
  let logoutCalls = 0;
  let signInCalls = 0;
  let deleteCalls = 0;
  let revokeCalls = 0;
  dbCalls = 0;
  api.auth.updateUser = async () => { updateCalls++; return {}; };
  api.auth.logout = async () => { logoutCalls++; return {}; };
  api.auth.signIn = async () => { signInCalls++; return {}; };
  api.auth.deleteUser = async () => { deleteCalls++; return {}; };
  const scopedDb = api.db;
  api.db = async (route, options = {}) => {
    if (route.includes("device_id=eq.device-phone-5678") && options.method === "PATCH") revokeCalls++;
    return scopedDb(route, options);
  };

  const devicesMissing = await account.handler(accountEvent("GET", "devices", null, undefined));
  const passwordMismatch = await account.handler(accountEvent("POST", "password", { password: "senha-nova-segura" }, OTHER_USER_ID));
  const revokeMismatch = await account.handler(accountEvent("POST", "revoke-device", { deviceId: "device-phone-5678" }, OTHER_USER_ID));
  const deleteMismatch = await account.handler(accountEvent("POST", "delete", {
    password: "senha-segura-123", confirmation: "APAGAR CONTA",
  }, OTHER_USER_ID));
  const logoutMismatch = await account.handler(accountEvent("POST", "logout", null, OTHER_USER_ID));

  check("devices sem escopo falha 400", devicesMissing.statusCode === 400 && bodyOf(devicesMissing).code === "invalid_account_scope", devicesMissing.body);
  check("password de outra conta falha 403 antes do Auth",
    passwordMismatch.statusCode === 403 && bodyOf(passwordMismatch).code === "account_scope_changed" && updateCalls === 0,
    `${passwordMismatch.statusCode} ${updateCalls}`);
  check("revoke-device de outra conta falha antes do PATCH",
    revokeMismatch.statusCode === 403 && revokeCalls === 0, `${revokeMismatch.statusCode} ${revokeCalls}`);
  check("delete de outra conta falha antes de senha, purga e exclusão",
    deleteMismatch.statusCode === 403 && signInCalls === 0 && deleteCalls === 0,
    `${deleteMismatch.statusCode} ${signInCalls} ${deleteCalls}`);
  check("logout de outra conta não encerra nem apaga cookies",
    logoutMismatch.statusCode === 403 && logoutCalls === 0 && cookiesOf(logoutMismatch).length === 0,
    `${logoutMismatch.statusCode} ${logoutCalls} ${cookiesOf(logoutMismatch).length}`);
  check("ações fora do escopo não consultam nem alteram o banco",
    dbCalls === 0, dbCalls);

  scopedRefreshCalls = 0;
  const refreshOnlyLogout = await account.handler(accountEvent("POST", "logout", null, OTHER_USER_ID, refreshOnly));
  check("logout refresh-only pede renovação sem apagar a conta atual",
    refreshOnlyLogout.statusCode === 401 && bodyOf(refreshOnlyLogout).code === "session_refresh_required"
      && scopedRefreshCalls === 0 && cookiesOf(refreshOnlyLogout).length === 0,
    `${refreshOnlyLogout.statusCode} / ${scopedRefreshCalls} / ${cookiesOf(refreshOnlyLogout).length}`);

  const guestLogout = await account.handler({
    httpMethod: "POST", path: "/api/account/logout", queryStringParameters: { action: "logout" },
    headers: { origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https" },
  });
  // [M6] A conferência passou a ser pelo NOME de cada cookie, não pela
  // quantidade. Um número era frágil nos dois sentidos: reprovava ao acrescentar
  // um cookie (foi o que aconteceu com `cofre_recovery`) e, pior, APROVARIA
  // trocar um cookie por outro sem limpar o que ficou para trás. Sair da conta
  // tem de apagar tudo que identifica a sessão, item a item.
  const limposNoLogout = cookiesOf(guestLogout).map((linha) => String(linha).split("=")[0]).sort();
  check("logout sem sessão continua idempotente e limpa TODOS os cookies de sessão",
    guestLogout.statusCode === 200
      && ["cofre_access", "cofre_device", "cofre_pkce", "cofre_recovery", "cofre_refresh"]
        .every((nome) => limposNoLogout.includes(nome)),
    `${guestLogout.statusCode} ${limposNoLogout.join(", ")}`);

  global.fetch = originalFetch;
  api.db = originalDb;
  Object.assign(api.auth, originalAuth);

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
