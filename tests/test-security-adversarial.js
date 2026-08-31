// test-security-adversarial.js: matriz defensiva do M16 nos handlers reais.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));
const rateLimit = require(path.join(ROOT, "netlify/functions/_shared/rate-limit"));

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const DEVICE_ID = "device-security-1234";
const DEVICE_SECRET = "segredo-security-1234";
const DEVICE_HASH = crypto.createHash("sha256").update(DEVICE_SECRET).digest("hex");
const ACCESS = "access-token-security";
const REFRESH = "refresh-token-security";
const COOKIE = `cofre_access=${ACCESS}; cofre_refresh=${REFRESH}; cofre_device=${DEVICE_SECRET}`;

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`);
  }
}

function bodyOf(response) {
  try { return JSON.parse(response.body || "{}"); }
  catch (_) { return {}; }
}

function headers(accountId = USER_A, cookie = COOKIE) {
  return {
    origin: "https://cofre.test",
    host: "cofre.test",
    "x-forwarded-proto": "https",
    "x-account-id": accountId,
    "x-device-id": DEVICE_ID,
    "x-sync-protocol": "2",
    cookie,
  };
}

function healthEvent(accountId = USER_A, cookie = COOKIE, extra = {}) {
  return {
    httpMethod: "GET",
    path: "/api/sync/health",
    queryStringParameters: { action: "health" },
    headers: { ...headers(accountId, cookie), ...extra },
  };
}

const MUTATION_ID = "123e4567-e89b-42d3-a456-426614174016";
const REV = "001787000000000.000001.device-security-1234";
const PUT = {
  entity: "transactions",
  entityId: "tx-security-1",
  op: "put",
  rev: REV,
  payload: { id: "tx-security-1", type: "expense", amount: 10, date: "2026-08-31" },
};

function changeEvent(ops = [PUT], extraBody = {}, extraHeaders = {}) {
  return {
    httpMethod: "POST",
    path: "/api/sync/changes",
    queryStringParameters: { action: "changes" },
    headers: {
      ...headers(),
      "idempotency-key": MUTATION_ID,
      ...extraHeaders,
    },
    body: JSON.stringify({
      protocol: 2,
      mutationId: MUTATION_ID,
      since: "0",
      ops,
      ...extraBody,
    }),
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
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-security-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-security-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";
  process.env.ANTHROPIC_API_KEY = "nao-pode-ser-usada";

  const originalAuth = { ...api.auth };
  const originalDb = api.db;
  let authUserCalls = 0;
  let refreshCalls = 0;
  let dbCalls = 0;
  let financialCalls = 0;
  let applyCalls = 0;
  let revoked = false;
  let rpcResult = { status: "applied", revision: 4, applied: 1 };
  let lastApply = null;

  function resetCounters() {
    authUserCalls = 0;
    refreshCalls = 0;
    dbCalls = 0;
    financialCalls = 0;
    applyCalls = 0;
    lastApply = null;
  }

  api.auth.user = async () => {
    authUserCalls += 1;
    return { id: USER_A, email: "a@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" };
  };
  api.auth.refresh = async () => {
    refreshCalls += 1;
    throw new Error("o refresh não deve ser consumido por rota escopada");
  };
  api.db = async (route, options = {}) => {
    dbCalls += 1;
    if (route.startsWith("cofre_devices?user_id=") && !options.method) {
      return [{ device_id: DEVICE_ID, secret_hash: DEVICE_HASH, revoked_at: revoked ? "2026-08-31T12:00:00Z" : null }];
    }
    if (route.startsWith("cofre_devices?user_id=") && options.method === "PATCH") {
      return revoked ? [] : [{ device_id: DEVICE_ID }];
    }
    if (route.startsWith("cofre_sync_config?")) {
      financialCalls += 1;
      return [{ server_protocol: 3, minimum_write_protocol: 2, database_schema_version: 1 }];
    }
    if (route.startsWith("cofre_sync_state?")) {
      financialCalls += 1;
      return [{ revision: 3 }];
    }
    if (route.startsWith("cofre_sync_ops?")) {
      financialCalls += 1;
      return [];
    }
    if (route === "rpc/cofre_apply_ops") {
      financialCalls += 1;
      applyCalls += 1;
      lastApply = options;
      return [rpcResult];
    }
    throw new Error(`rota inesperada: ${route}`);
  };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/sync"))];
  const sync = require(path.join(ROOT, "netlify/functions/sync"));

  console.log("\n1. Usuário A contra usuário B");
  resetCounters();
  const crossed = await sync.handler(healthEvent(USER_B));
  check("a conta B recebe 403", crossed.statusCode === 403 && bodyOf(crossed).code === "account_scope_changed", crossed.body);
  check("a recusa acontece antes do banco", dbCalls === 0 && financialCalls === 0, `${dbCalls} / ${financialCalls}`);

  console.log("\n2. JWT inválido");
  resetCounters();
  api.auth.user = async () => {
    authUserCalls += 1;
    throw Object.assign(new Error("token inválido"), { statusCode: 401, code: "invalid_session" });
  };
  const invalid = await sync.handler(healthEvent(USER_A, `cofre_access=${ACCESS}; cofre_device=${DEVICE_SECRET}`));
  check("JWT inválido recebe 401", invalid.statusCode === 401 && bodyOf(invalid).code === "session_expired", invalid.body);
  check("JWT inválido não chega ao banco", authUserCalls === 1 && dbCalls === 0, `${authUserCalls} / ${dbCalls}`);

  console.log("\n3. JWT expirado");
  resetCounters();
  api.auth.user = async () => {
    authUserCalls += 1;
    throw Object.assign(new Error("token expirado"), { statusCode: 401, code: "bad_jwt" });
  };
  const expired = await sync.handler(healthEvent());
  check("JWT expirado pede renovação explícita", expired.statusCode === 401 && bodyOf(expired).code === "session_refresh_required", expired.body);
  check("a rota não consome refresh nem toca no banco", refreshCalls === 0 && dbCalls === 0, `${refreshCalls} / ${dbCalls}`);

  api.auth.user = async () => {
    authUserCalls += 1;
    return { id: USER_A, email: "a@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" };
  };

  console.log("\n4. Manipulação de user_id");
  resetCounters();
  rpcResult = { status: "applied", revision: 4, applied: 1 };
  const forgedBody = await sync.handler(changeEvent([PUT], { user_id: USER_B, userId: USER_B, account_id: USER_B }));
  check("campos de dono não mudam a conta da operação", forgedBody.statusCode === 200 && lastApply && lastApply.body.p_user_id === USER_A, forgedBody.body);
  check("o RPC recebe somente o dono da sessão", lastApply && !JSON.stringify(lastApply.body).includes(USER_B), lastApply && JSON.stringify(lastApply.body));

  console.log("\n5. RPC sem autenticação");
  const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => fs.readFileSync(path.join(ROOT, "supabase/migrations", name), "utf8"))
    .join("\n")
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, " CORPO ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const publicGrants = (migrations.match(/grant\s+execute\s+on\s+function\s+[^;]*?\s+to\s+[^;]*/g) || [])
    .filter((statement) => /\b(public|anon|authenticated)\b/.test(statement.split(" to ").pop()));
  check("nenhum RPC privilegiado concede execução pública", publicGrants.length === 0, publicGrants.join(" | "));
  check("existe verificação SQL para o banco real",
    fs.existsSync(path.join(ROOT, "supabase/tests/verify_security_boundary.sql")));

  console.log("\n6. Aparelho revogado");
  resetCounters();
  revoked = true;
  const deniedDevice = await sync.handler(healthEvent());
  check("aparelho revogado recebe 403", deniedDevice.statusCode === 403 && bodyOf(deniedDevice).code === "device_revoked", deniedDevice.body);
  check("a revogação barra os dados financeiros", financialCalls === 0, financialCalls);
  revoked = false;

  console.log("\n7. Replay");
  resetCounters();
  rpcResult = { status: "applied", revision: 4, applied: 1 };
  const first = await sync.handler(changeEvent());
  rpcResult = { status: "replayed", revision: 4, applied: 0 };
  const repeated = await sync.handler(changeEvent());
  check("replay idêntico preserva revisão e não reaplica", first.statusCode === 200
    && repeated.statusCode === 200 && bodyOf(repeated).revision === "4" && bodyOf(repeated).applied === 0,
  `${first.body} / ${repeated.body}`);
  rpcResult = { status: "idempotency_mismatch", revision: 4, applied: 0 };
  const divergent = await sync.handler(changeEvent([{ ...PUT, payload: { ...PUT.payload, amount: 999 } }]));
  check("replay divergente recebe 409", divergent.statusCode === 409 && bodyOf(divergent).code === "idempotency_mismatch", divergent.body);

  console.log("\n8. Entrada maliciosa");
  resetCounters();
  const injectedDevice = await sync.handler(healthEvent(USER_A, COOKIE, {
    "x-device-id": "device-ok,or(user_id.neq.owner)",
  }));
  check("filtro hostil de aparelho é recusado", injectedDevice.statusCode === 400 && bodyOf(injectedDevice).code === "invalid_device", injectedDevice.body);
  check("o identificador hostil não chega ao banco", dbCalls === 0, dbCalls);
  resetCounters();
  const injectedEntity = await sync.handler(changeEvent([{ ...PUT, entity: "<script>" }]));
  check("entidade fora da lista é recusada", injectedEntity.statusCode === 400 && bodyOf(injectedEntity).code === "invalid_financial_data", injectedEntity.body);
  check("operação hostil não chega ao RPC", applyCalls === 0, applyCalls);

  console.log("\n9. Limite de requisições");
  const rateEvent = { headers: { "x-vercel-forwarded-for": "203.0.113.20" } };
  api.db = async () => [{ allowed: false, retry_after: 17, hits: 5 }];
  const limited = await thrown(() => rateLimit.enforce(rateEvent, {
    bucket: "m16-remoto", identity: "alvo@example.com", limit: 5, windowSeconds: 60,
  }));
  check("teto persistido devolve 429 e espera", limited && limited.statusCode === 429
    && limited.code === "rate_limited" && limited.retryAfter === 17,
  limited && `${limited.statusCode} / ${limited.retryAfter}`);

  api.db = async () => { throw new Error("banco indisponível"); };
  const localIdentity = `m16-${process.pid}-${Date.now()}`;
  const fallbackOptions = { bucket: "m16-fallback", identity: localIdentity, limit: 1, windowSeconds: 60 };
  const allowedLocally = await thrown(() => rateLimit.enforce(rateEvent, fallbackOptions));
  const limitedLocally = await thrown(() => rateLimit.enforce(rateEvent, fallbackOptions));
  check("falha do banco mantém a primeira tentativa limitada localmente", allowedLocally === null);
  check("falha do banco não abre a segunda tentativa", limitedLocally && limitedLocally.statusCode === 429, limitedLocally && limitedLocally.statusCode);
  const digest = rateLimit.identityHash("m16", "pessoa@example.com");
  check("a identidade persistida é HMAC e não texto legível",
    /^[0-9a-f]{64}$/.test(digest) && !digest.includes("pessoa@example.com"), digest);

  api.db = originalDb;
  Object.assign(api.auth, originalAuth);

  console.log(`\n${failed === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
