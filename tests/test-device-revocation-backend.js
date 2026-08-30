"use strict";

const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DEVICE_ID = "device-test-1234";
const OTHER_DEVICE_ID = "device-phone-5678";
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

function accountEvent(method, action, body, headers = {}) {
  return {
    httpMethod: method,
    path: `/api/account/${action}`,
    queryStringParameters: { action },
    headers: {
      origin: "https://cofre.test",
      host: "cofre.test",
      "x-forwarded-proto": "https",
      "x-device-id": DEVICE_ID,
      "x-account-id": USER_ID,
      ...headers,
    },
    body: body == null ? null : JSON.stringify(body),
  };
}

function cookiesOf(response) {
  return (response.multiValueHeaders && response.multiValueHeaders["Set-Cookie"]) || [];
}

function deviceRow(overrides = {}) {
  return {
    device_id: DEVICE_ID,
    secret_hash: DEVICE_HASH,
    label: "Chrome no Windows",
    device_type: "desktop",
    revoked_at: null,
    ...overrides,
  };
}

async function main() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";

  const originalDb = api.db;
  const originalAuth = { ...api.auth };
  api.auth.user = async () => ({
    id: USER_ID,
    email: "pessoa@example.com",
    email_confirmed_at: "2026-08-01T12:00:00Z",
  });
  api.auth.refresh = async () => { throw new Error("refresh não deveria ser usado"); };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));

  console.log("\n1. Atividade não reautoriza um aparelho");
  let activityPatch = null;
  let activityRoute = "";
  let concurrentRevoke = false;
  api.db = async (route, options = {}) => {
    if (route.startsWith("cofre_devices?user_id=") && !options.method) return [deviceRow()];
    if (route.startsWith("cofre_devices?user_id=") && options.method === "PATCH") {
      activityRoute = route;
      activityPatch = options;
      return concurrentRevoke ? [] : [{ device_id: DEVICE_ID }];
    }
    return null;
  };

  const active = await account.handler(accountEvent("GET", "session", null, { cookie: COOKIE }));
  check("sessão ativa continua válida", active.statusCode === 200 && JSON.parse(active.body).authenticated === true, active.body);
  check("PATCH exige o segredo e uma linha não revogada",
    activityRoute.includes(`secret_hash=eq.${DEVICE_HASH}`) && activityRoute.includes("revoked_at=is.null"), activityRoute);
  check("PATCH exige representação da linha alterada",
    activityPatch && activityPatch.headers && activityPatch.headers.Prefer === "return=representation");
  check("atividade nunca escreve segredo ou revogação",
    activityPatch && !("secret_hash" in activityPatch.body) && !("revoked_at" in activityPatch.body), JSON.stringify(activityPatch && activityPatch.body));
  check("cabeçalho ausente preserva rótulo e tipo",
    activityPatch && !("label" in activityPatch.body) && !("device_type" in activityPatch.body), JSON.stringify(activityPatch && activityPatch.body));

  const withMetadata = await account.handler(accountEvent("GET", "session", null, {
    cookie: COOKIE,
    "x-device-label": "Firefox no Windows",
    "x-device-type": "desktop",
  }));
  check("metadados válidos atualizam o acesso",
    withMetadata.statusCode === 200 && activityPatch.body.label === "Firefox no Windows" && activityPatch.body.device_type === "desktop",
    JSON.stringify(activityPatch && activityPatch.body));

  concurrentRevoke = true;
  const raced = await account.handler(accountEvent("GET", "session", null, { cookie: COOKIE }));
  check("revogação concorrente vence o toque de atividade",
    raced.statusCode === 403 && JSON.parse(raced.body).code === "device_revoked", raced.body);
  check("corrida não apaga cookies de um login mais novo", cookiesOf(raced).length === 0, String(cookiesOf(raced).length));

  console.log("\n2. Autenticação explícita rotaciona o segredo");
  let stored = deviceRow({ revoked_at: "2026-08-24T20:00:00Z" });
  const authorizationBodies = [];
  api.auth.signIn = async (email) => ({
    access_token: "access-new",
    refresh_token: "refresh-new",
    expires_in: 3600,
    user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" },
  });
  api.db = async (route, options = {}) => {
    if (route === "rpc/cofre_rate_hit") return [{ allowed: true, retry_after: 0, hits: 1 }];
    if (route.startsWith("cofre_devices?user_id=") && !options.method) return [stored];
    if (route.startsWith("cofre_devices?user_id=") && options.method === "PATCH") {
      authorizationBodies.push({ ...options.body });
      stored = { ...stored, ...options.body };
      return [{ device_id: DEVICE_ID }];
    }
    return null;
  };

  const loginEvent = () => accountEvent("POST", "login", {
    email: "pessoa@example.com",
    password: "senha-segura-123",
  }, {
    cookie: COOKIE,
    "x-device-label": "Chrome no Windows",
    "x-device-type": "desktop",
  });
  const firstLogin = await account.handler(loginEvent());
  const firstHash = authorizationBodies[0] && authorizationBodies[0].secret_hash;
  check("login reativa a linha revogada", firstLogin.statusCode === 200 && authorizationBodies[0].revoked_at === null, firstLogin.body);
  check("reativação troca o segredo antigo", /^[0-9a-f]{64}$/.test(firstHash || "") && firstHash !== DEVICE_HASH, firstHash);
  check("login devolve um novo cookie do dispositivo",
    cookiesOf(firstLogin).some((value) => value.startsWith("cofre_device=") && !value.includes(encodeURIComponent(DEVICE_SECRET))), JSON.stringify(cookiesOf(firstLogin)));

  const secondLogin = await account.handler(loginEvent());
  const secondHash = authorizationBodies[1] && authorizationBodies[1].secret_hash;
  check("novo login rotaciona o segredo mesmo quando o acesso está ativo",
    secondLogin.statusCode === 200 && secondHash && secondHash !== firstHash, `${firstHash} / ${secondHash}`);

  console.log("\n3. Lista e revogação confirmam o estado do banco");
  stored = deviceRow();
  const activeTargets = new Set([DEVICE_ID, OTHER_DEVICE_ID]);
  let listRoute = "";
  let revokeRoute = "";
  api.db = async (route, options = {}) => {
    if (route.startsWith("cofre_devices?user_id=") && !options.method) return [stored];
    if (route.includes(`device_id=eq.${DEVICE_ID}`) && route.includes("secret_hash=eq.") && options.method === "PATCH") {
      return [{ device_id: DEVICE_ID }];
    }
    if (route.startsWith("cofre_devices?select=device_id,label,device_type")) {
      listRoute = route;
      return [
        { device_id: DEVICE_ID, label: "Chrome no Windows", device_type: "desktop", first_seen_at: "2026-08-01", last_seen_at: "2026-08-24" },
        { device_id: OTHER_DEVICE_ID, label: "Safari no iPhone", device_type: "phone", first_seen_at: "2026-08-02", last_seen_at: "2026-08-23" },
      ];
    }
    if (route.includes(`device_id=eq.${OTHER_DEVICE_ID}`) && options.method === "PATCH") {
      revokeRoute = route;
      if (!activeTargets.has(OTHER_DEVICE_ID)) return [];
      activeTargets.delete(OTHER_DEVICE_ID);
      return [{ device_id: OTHER_DEVICE_ID }];
    }
    return null;
  };

  const listed = await account.handler(accountEvent("GET", "devices", null, { cookie: COOKIE }));
  const listedBody = JSON.parse(listed.body);
  check("consulta da lista pede somente acessos ativos", listRoute.includes("revoked_at=is.null"), listRoute);
  check("lista devolve tipo e marca o aparelho atual",
    listed.statusCode === 200 && listedBody.devices[0].type === "desktop" && listedBody.devices[0].current === true, listed.body);

  const revoked = await account.handler(accountEvent("POST", "revoke-device", { deviceId: OTHER_DEVICE_ID }, { cookie: COOKIE }));
  check("revogação exige alvo ativo e representação",
    revoked.statusCode === 200 && revokeRoute.includes("revoked_at=is.null"), `${revoked.statusCode} ${revokeRoute}`);
  const repeated = await account.handler(accountEvent("POST", "revoke-device", { deviceId: OTHER_DEVICE_ID }, { cookie: COOKIE }));
  check("alvo ausente ou já revogado não devolve sucesso",
    repeated.statusCode === 404 && JSON.parse(repeated.body).code === "device_not_active", repeated.body);

  console.log("\n4. Sync e análise recusam sessão morta sem apagar outro login");
  api.auth.user = async () => ({
    id: USER_ID,
    email: "pessoa@example.com",
    email_confirmed_at: "2026-08-01T12:00:00Z",
  });
  api.db = async (route, options = {}) => {
    if (route.startsWith("cofre_devices?user_id=") && !options.method) {
      return [deviceRow({ revoked_at: "2026-08-24T22:00:00Z" })];
    }
    return null;
  };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/sync"))];
  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/analyze"))];
  const sync = require(path.join(ROOT, "netlify/functions/sync"));
  const analyze = require(path.join(ROOT, "netlify/functions/analyze"));

  const syncRevoked = await sync.handler({
    httpMethod: "GET",
    path: "/api/sync/health",
    queryStringParameters: { action: "health" },
    headers: {
      host: "cofre.test", "x-forwarded-proto": "https", cookie: COOKIE,
      "x-device-id": DEVICE_ID, "x-account-id": USER_ID, "x-sync-protocol": "3",
    },
  });
  check("sync não apaga cookies ao perceber revogação",
    syncRevoked.statusCode === 403 && cookiesOf(syncRevoked).length === 0, `${syncRevoked.statusCode} ${cookiesOf(syncRevoked).length}`);

  const analyzeRevoked = await analyze.handler({
    httpMethod: "POST",
    path: "/api/analyze",
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https",
      cookie: COOKIE, "x-device-id": DEVICE_ID, "x-account-id": USER_ID,
    },
    body: "{}",
  });
  check("análise não apaga cookies ao perceber revogação",
    analyzeRevoked.statusCode === 403 && cookiesOf(analyzeRevoked).length === 0, `${analyzeRevoked.statusCode} ${cookiesOf(analyzeRevoked).length}`);

  api.auth.user = async () => {
    throw Object.assign(new Error("token expirado"), { statusCode: 401, code: "invalid_session" });
  };
  api.auth.refresh = async () => {
    throw Object.assign(new Error("refresh expirado"), { statusCode: 401, code: "refresh_token_not_found" });
  };
  const syncExpired = await sync.handler({
    httpMethod: "GET",
    path: "/api/sync/health",
    queryStringParameters: { action: "health" },
    headers: {
      host: "cofre.test", "x-forwarded-proto": "https", cookie: COOKIE,
      "x-device-id": DEVICE_ID, "x-account-id": USER_ID, "x-sync-protocol": "3",
    },
  });
  check("sync não apaga cookies de sessão expirada",
    syncExpired.statusCode === 401 && cookiesOf(syncExpired).length === 0, `${syncExpired.statusCode} ${cookiesOf(syncExpired).length}`);

  const analyzeExpired = await analyze.handler({
    httpMethod: "POST",
    path: "/api/analyze",
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https",
      cookie: COOKIE, "x-device-id": DEVICE_ID, "x-account-id": USER_ID,
    },
    body: "{}",
  });
  check("análise não apaga cookies de sessão expirada",
    analyzeExpired.statusCode === 401 && cookiesOf(analyzeExpired).length === 0, `${analyzeExpired.statusCode} ${cookiesOf(analyzeExpired).length}`);

  // ==========================================================================
  console.log("\n5. [M7] Sair de todos os outros aparelhos");
  // ==========================================================================
  // Duas camadas, e a ordem importa: revogar as linhas corta a sincronização no
  // ato; o `logout?scope=others` do provedor invalida os refresh tokens. Só a
  // segunda deixaria o access token do outro aparelho valendo por até uma hora;
  // só a primeira deixaria a sessão viva para renovar indefinidamente.
  const SENHA = "cavalo-bateria-grampo";
  let entradasNoProvedor = 0;
  let saidaDosOutros = 0;
  let rotaDaRevogacaoEmMassa = "";
  api.auth.user = async () => ({ id: USER_ID, email: "pessoa@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" });
  api.auth.refresh = async () => { throw new Error("refresh não deveria ser usado"); };
  api.auth.signIn = async (email, password) => {
    entradasNoProvedor += 1;
    if (password !== SENHA) throw Object.assign(new Error("Invalid login credentials"), { statusCode: 400, code: "invalid_credentials" });
    return { access_token: "novo", refresh_token: "novo", expires_in: 3600, user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" } };
  };
  api.auth.logoutOthers = async () => { saidaDosOutros += 1; return {}; };
  stored = deviceRow();
  api.db = async (route, options = {}) => {
    if (route.startsWith("cofre_devices?user_id=") && !options.method && route.includes("select=device_id,secret_hash")) return [stored];
    if (route.includes(`device_id=eq.${DEVICE_ID}`) && route.includes("secret_hash=eq.") && options.method === "PATCH") return [{ device_id: DEVICE_ID }];
    if (route.includes("device_id=neq.") && options.method === "PATCH") {
      rotaDaRevogacaoEmMassa = route;
      return [{ device_id: OTHER_DEVICE_ID }, { device_id: "device-tablet-9999" }];
    }
    return null;
  };

  const semSenha = await account.handler(accountEvent("POST", "revoke-others", {}, { cookie: COOKIE }));
  check("sair dos outros exige reautenticação",
    semSenha.statusCode === 401 && JSON.parse(semSenha.body).code === "reauth_required", semSenha.body);
  check("nenhuma revogação em massa aconteceu sem senha", rotaDaRevogacaoEmMassa === "", rotaDaRevogacaoEmMassa);
  check("nenhuma sessão foi encerrada sem senha", saidaDosOutros === 0, `${saidaDosOutros}`);

  const senhaErrada = await account.handler(accountEvent("POST", "revoke-others", { currentPassword: "chute-do-atacante" }, { cookie: COOKIE }));
  check("senha errada não encerra nada",
    senhaErrada.statusCode === 401 && JSON.parse(senhaErrada.body).code === "reauth_failed", senhaErrada.body);
  check("nenhuma revogação em massa com senha errada", rotaDaRevogacaoEmMassa === "", rotaDaRevogacaoEmMassa);

  const encerrou = await account.handler(accountEvent("POST", "revoke-others", { currentPassword: SENHA }, { cookie: COOKIE }));
  const corpoEncerrou = JSON.parse(encerrou.body);
  check("senha correta encerra os outros acessos", encerrou.statusCode === 200, `${encerrou.statusCode} ${encerrou.body}`);
  check("a conta responde quantos acessos caíram", corpoEncerrou.revoked === 2, encerrou.body);
  check("as sessões do provedor também foram encerradas",
    corpoEncerrou.sessionsEnded === true && saidaDosOutros === 1, `${corpoEncerrou.sessionsEnded} ${saidaDosOutros}`);
  // O ESTE APARELHO PRECISA SOBREVIVER. Uma revogação que se inclui na conta
  // derruba justamente quem estava tentando se proteger.
  check("o aparelho atual fica de fora da revogação",
    rotaDaRevogacaoEmMassa.includes(`device_id=neq.${DEVICE_ID}`), rotaDaRevogacaoEmMassa);
  check("só acessos ainda ativos são tocados",
    rotaDaRevogacaoEmMassa.includes("revoked_at=is.null"), rotaDaRevogacaoEmMassa);
  check("a revogação é restrita a esta conta",
    rotaDaRevogacaoEmMassa.includes(`user_id=eq.${USER_ID}`), rotaDaRevogacaoEmMassa);
  check("a sessão deste aparelho continua de pé", cookiesOf(encerrou).every((c) => !/Max-Age=0/.test(c)),
    cookiesOf(encerrou).join(" | "));

  // A segunda camada pode falhar sozinha. Quando falha, os dados JÁ estão fora
  // de alcance e a resposta precisa dizer isso, não fingir limpeza completa.
  api.auth.logoutOthers = async () => { throw new Error("provedor fora do ar"); };
  const parcial = await account.handler(accountEvent("POST", "revoke-others", { currentPassword: SENHA }, { cookie: COOKIE }));
  const corpoParcial = JSON.parse(parcial.body);
  check("falha do provedor não derruba a revogação dos dados", parcial.statusCode === 200, `${parcial.statusCode}`);
  check("a resposta admite que as sessões não foram encerradas",
    corpoParcial.sessionsEnded === false && corpoParcial.revoked === 2, parcial.body);
  check("a reautenticação foi cobrada em toda tentativa com senha", entradasNoProvedor === 3, `${entradasNoProvedor}`);

  api.db = originalDb;
  Object.assign(api.auth, originalAuth);

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
