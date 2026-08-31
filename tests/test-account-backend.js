"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const schema = require(path.join(ROOT, "netlify/functions/_shared/finance-schema"));
const http = require(path.join(ROOT, "netlify/functions/_shared/http"));
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));
const USER_ID = "00000000-0000-4000-8000-000000000001";

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}
function event(method, action, body, extraHeaders) {
  return {
    httpMethod: method, path: `/api/account/${action}`, queryStringParameters: { action },
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https",
      "x-device-id": "device-test-1234", "x-account-id": USER_ID, ...(extraHeaders || {}),
    },
    body: body == null ? null : JSON.stringify(body),
  };
}

async function main() {
  console.log("\n1. Validação financeira no servidor");
  const base = schema.emptySnapshot();
  check("snapshot mínimo usa o schema atual", schema.validateSnapshot(base).version === 23);
  const changed = schema.applyChanges(base, { puts: { transactions: [{ id: "tx-1", type: "expense", amount: 10, date: "2026-08-12" }] }, deletes: {}, settings: { theme: "dark" } });
  check("alteração aceita coleção e configuração conhecidas", changed.transactions.length === 1 && changed.theme === "dark");
  let unknown = null;
  try { schema.validateSnapshot({ ...base, access_token: "segredo" }); } catch (error) { unknown = error.code; }
  check("token e campo desconhecido são recusados", unknown === "invalid_financial_data", unknown);
  let duplicate = null;
  try { schema.validateSnapshot({ ...base, transactions: [{ id: "x", type: "expense", amount: 1, date: "2026-08-12" }, { id: "x", type: "expense", amount: 2, date: "2026-08-12" }] }); } catch (error) { duplicate = error.code; }
  check("identificador repetido é recusado", duplicate === "invalid_financial_data", duplicate);
  let badAmount = null;
  try { schema.validateSnapshot({ ...base, transactions: [{ id: "tx-2", type: "expense", amount: "10", date: "2026-08-12" }] }); } catch (error) { badAmount = error.code; }
  check("valor financeiro com tipo errado é recusado", badAmount === "invalid_financial_data", badAmount);
  let polluted = null;
  try { schema.validateSnapshot(JSON.parse('{"version":23,"transactions":[],"categories":[],"goals":[],"assets":[],"theme":{"constructor":{"x":1}}}')); } catch (error) { polluted = error.code; }
  check("chaves perigosas são recusadas", polluted === "invalid_financial_data", polluted);

  console.log("\n2. Sessão em cookie protegido");
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";
  const originalAuth = { ...api.auth };
  const originalDb = api.db;
  api.auth.signIn = async (email) => ({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" } });
  // `email_confirmed_at` presente porque a sessão passou a exigi-lo: conta sem
  // email confirmado não entra e não sincroniza. Ver test-account-confirmation.js.
  api.auth.user = async () => ({ id: USER_ID, email: "pessoa@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" });
  api.db = async (route, options) => {
    if (route === "rpc/cofre_rate_hit") return [{ allowed: true, retry_after: 0, hits: 1 }];
    if (route.includes("cofre_devices?") && (!options || options.method === undefined)) return [];
    if (route.startsWith("cofre_devices?") && options && options.method === "POST") {
      return [{ device_id: "device-test-1234" }];
    }
    return null;
  };
  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));
  const login = await account.handler(event("POST", "login", { email: "pessoa@example.com", password: "senha-segura-123" }));
  const cookies = login.multiValueHeaders && login.multiValueHeaders["Set-Cookie"] || [];
  const loginBody = JSON.parse(login.body);
  check("login não devolve tokens no JSON", login.statusCode === 200 && !/access-secret|refresh-secret/.test(login.body));
  check("cookies são HttpOnly, Secure e SameSite", cookies.length === 3 && cookies.every((value) => /HttpOnly/.test(value) && /Secure/.test(value) && /SameSite=Lax/.test(value)));
  check("resposta expõe somente estado e email", loginBody.authenticated === true && loginBody.email === "pessoa@example.com");
  const denied = await account.handler(event("POST", "login", { email: "pessoa@example.com", password: "senha-segura-123" }, { origin: "https://attacker.test" }));
  check("origem externa é bloqueada", denied.statusCode === 403, denied.statusCode);
  const missingDevice = await account.handler(event("GET", "session", null, { cookie: "cofre_access=access-secret" }));
  check("sessão sem segredo do dispositivo é bloqueada sem apagar outro login",
    missingDevice.statusCode === 403 && !missingDevice.multiValueHeaders, missingDevice.statusCode);

  console.log("\n3. Operações incrementais no backend financeiro");
  const deviceSecret = "device-secret-for-test";
  const secretHash = crypto.createHash("sha256").update(deviceSecret).digest("hex");
  const cookieHeader = `cofre_access=access-secret; cofre_refresh=refresh-secret; cofre_device=${deviceSecret}`;
  let rpcResult = { status: "applied", revision: 7, applied: 1 };
  let rpcOptions = null;
  let resetRpcResult = { status: "applied", revision: 8, applied: 1, reset_rev: "001787043200000.000002.server_reset:teste" };
  let resetRpcOptions = null;
  let opsRows = [];
  let checkpointRows = [];
  const checkpointQueries = [];
  // A versão mínima de escrita é CONFIGURAÇÃO do backend, versionada no banco.
  // Ela é o que permite a janela de transição: durante ela um cliente 2 continua
  // gravando; no corte, o mesmo backend passa a recusá-lo com HTTP 426.
  let syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2 };
  api.db = async (route, options) => {
    if (route.startsWith("cofre_devices?")) return [{ device_id: "device-test-1234", secret_hash: secretHash, revoked_at: null }];
    if (route.startsWith("cofre_sync_config?")) return syncConfigRow ? [syncConfigRow] : [];
    if (route.startsWith("cofre_sync_state?")) return [{ revision: 7 }];
    if (route.startsWith("cofre_sync_checkpoint_rows?")) {
      checkpointQueries.push(route);
      const query = new URLSearchParams(route.split("?")[1] || "");
      const logical = String(query.get("or") || "");
      let rows = checkpointRows.slice().sort((left, right) => (
        left.entity === right.entity
          ? String(left.entity_id).localeCompare(String(right.entity_id))
          : String(left.entity).localeCompare(String(right.entity))
      ));
      if (logical) {
        const match = logical.match(/^\(entity\.gt\.([^,]+),and\(entity\.eq\.([^,]+),entity_id\.gt\.([^)]+)\)\)$/);
        if (!match || match[1] !== match[2]) throw new Error(`Filtro composto inválido: ${logical}`);
        const [, cursorEntity, , cursorEntityId] = match;
        rows = rows.filter((row) => row.entity > cursorEntity
          || (row.entity === cursorEntity && row.entity_id > cursorEntityId));
      }
      const requested = Math.max(0, Number(query.get("limit")) || 0);
      return rows.slice(0, requested);
    }
    if (route.startsWith("cofre_sync_ops?")) {
      const query = new URLSearchParams(route.split("?")[1] || "");
      const sinceMatch = String(query.get("seq") || "").match(/^gt\.(\d+)$/);
      const since = sinceMatch ? Number(sinceMatch[1]) : 0;
      const requested = Math.max(0, Number(query.get("limit")) || opsRows.length);
      return opsRows.filter((row) => Number(row.seq) > since)
        .sort((left, right) => Number(left.seq) - Number(right.seq))
        .slice(0, requested);
    }
    if (route === "rpc/cofre_apply_ops") { rpcOptions = options; return [rpcResult]; }
    if (route === "rpc/cofre_reset_data") { resetRpcOptions = options; return [resetRpcResult]; }
    return null;
  };
  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/sync"))];
  const sync = require(path.join(ROOT, "netlify/functions/sync"));
  const mutationId = "123e4567-e89b-42d3-a456-426614174000";
  const rev = "001787000000000.000001.device-test-1234";
  const syncEvent = (ops, headers, body) => ({
    httpMethod: "POST", path: "/api/sync/changes", queryStringParameters: { action: "changes" },
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
      "x-device-id": "device-test-1234", "x-account-id": USER_ID,
      "x-sync-protocol": "2", "idempotency-key": mutationId, ...(headers || {}),
    },
    body: JSON.stringify({ protocol: 2, mutationId, since: "0", ops, ...(body || {}) }),
  });

  const put = { entity: "transactions", entityId: "tx-1", op: "put", rev, payload: { id: "tx-1", type: "expense", amount: 10, date: "2026-08-12" } };
  const applied = await sync.handler(syncEvent([put]));
  check("gravação válida devolve nova revisão", applied.statusCode === 200 && JSON.parse(applied.body).revision === "7", applied.body);
  check("gravação atômica usa somente a credencial do servidor", rpcOptions && rpcOptions.service === true && rpcOptions.body.p_user_id === "00000000-0000-4000-8000-000000000001");
  check("o servidor recebe operações, não a base inteira", rpcOptions && Array.isArray(rpcOptions.body.p_ops) && rpcOptions.body.p_ops.length === 1);

  // Repetir a MESMA mutação não pode gravar de novo nem inventar revisão.
  rpcResult = { status: "replayed", revision: 7, applied: 0 };
  const replay = await sync.handler(syncEvent([put]));
  check("repetição devolve a revisão original sem regravar", replay.statusCode === 200 && JSON.parse(replay.body).applied === 0, replay.body);

  // Mesmo identificador com conteúdo diferente é ataque ou bug: 409.
  rpcResult = { status: "idempotency_mismatch", revision: 7, applied: 0 };
  const mismatch = await sync.handler(syncEvent([put]));
  check("mutação repetida com outro conteúdo é recusada", mismatch.statusCode === 409, mismatch.statusCode);

  // Aparelho revogado não grava, mesmo com cookie válido.
  rpcResult = { status: "device_revoked", revision: 0, applied: 0 };
  const revoked = await sync.handler(syncEvent([put]));
  check("aparelho revogado é bloqueado", revoked.statusCode === 403, revoked.statusCode);
  check("revogação percebida durante a escrita não apaga outro login", !revoked.multiValueHeaders);
  rpcResult = { status: "applied", revision: 8, applied: 1 };

  const wrongKey = await sync.handler(syncEvent([put], { "idempotency-key": "different" }));
  check("cabeçalho e mutationId precisam coincidir", wrongKey.statusCode === 400, wrongKey.statusCode);

  // Operação malformada é recusada ANTES de chegar ao banco.
  const semRev = await sync.handler(syncEvent([{ ...put, rev: "ontem" }]));
  check("operação sem marca válida é recusada", semRev.statusCode === 400, semRev.statusCode);
  const entidadeInvalida = await sync.handler(syncEvent([{ ...put, entity: "auth" }]));
  check("coleção fora do schema é recusada", entidadeInvalida.statusCode === 400, entidadeInvalida.statusCode);
  const idDivergente = await sync.handler(syncEvent([{ ...put, entityId: "tx-2" }]));
  check("id da operação precisa bater com o do registro", idDivergente.statusCode === 400, idDivergente.statusCode);

  const resetMutationId = "123e4567-e89b-42d3-a456-426614174002";
  const resetHint = "001787000000000.000001.device-test-1234";
  const resetEvent = () => ({
    httpMethod: "POST", path: "/api/sync/reset", queryStringParameters: { action: "reset" },
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
      "x-device-id": "device-test-1234", "x-account-id": USER_ID,
      "x-sync-protocol": "3", "idempotency-key": resetMutationId,
    },
    body: JSON.stringify({ protocol: 3, mutationId: resetMutationId, rev: resetHint }),
  });
  const resetConfirmed = await sync.handler(resetEvent());
  const resetBody = JSON.parse(resetConfirmed.body);
  check("reset devolve a HLC dominante confirmada pelo banco",
    resetConfirmed.statusCode === 200 && resetBody.status === "applied"
      && resetBody.resetRev === resetRpcResult.reset_rev,
    resetConfirmed.body);
  check("hint do aparelho e versão do protocolo chegam ao RPC de reset",
    resetRpcOptions && resetRpcOptions.body.p_rev_prefix === resetHint
      && resetRpcOptions.body.p_protocol === 3,
    JSON.stringify(resetRpcOptions && resetRpcOptions.body));

  resetRpcResult = { status: "idempotency_mismatch", revision: 8, applied: 0, reset_rev: null };
  const resetMismatch = await sync.handler(resetEvent());
  check("mismatch do reset nunca vira confirmação HTTP 200",
    resetMismatch.statusCode === 409 && JSON.parse(resetMismatch.body).code === "idempotency_mismatch",
    resetMismatch.body);
  resetRpcResult = { status: "resultado_desconhecido", revision: 8, applied: 0, reset_rev: null };
  const resetUnknown = await sync.handler(resetEvent());
  check("status desconhecido do RPC não autoriza apagar a cópia local",
    resetUnknown.statusCode === 502 && JSON.parse(resetUnknown.body).code === "invalid_commit",
    resetUnknown.body);
  resetRpcResult = { status: "applied", revision: 8, applied: 1, reset_rev: "001787043200000.000002.server_reset:teste" };

  // Leitura por cursor: é isto que substitui o snapshot inteiro por ciclo.
  opsRows = [
    { seq: 8, entity: "transactions", entity_id: "tx-9", op: "put", rev, payload: { id: "tx-9", type: "expense", amount: 5, date: "2026-08-13" } },
    { seq: 9, entity: "transactions", entity_id: "tx-8", op: "delete", rev, payload: null },
  ];
  const pull = await sync.handler({
    httpMethod: "GET", path: "/api/sync/changes", queryStringParameters: { action: "changes", since: "7", limit: "50" },
    headers: { host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader, "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "2" },
  });
  const pullBody = JSON.parse(pull.body);
  check("leitura incremental devolve as operações do cursor", pull.statusCode === 200 && pullBody.ops.length === 2, pull.body);
  check("exclusão viaja como operação própria", pullBody.ops[1].op === "delete" && pullBody.ops[1].payload === undefined);
  check("cursor avança para a última seq lida", pullBody.cursor === "9", pullBody.cursor);

  opsRows = Array.from({ length: 2001 }, (_, index) => ({
    seq: index + 1,
    entity: "transactions",
    entity_id: `tx-volume-${String(index).padStart(4, "0")}`,
    op: "put",
    rev,
    payload: { id: `tx-volume-${String(index).padStart(4, "0")}`, type: "expense", amount: 1, date: "2026-08-31" },
  }));
  let volumeCursor = "0";
  let volumeRows = 0;
  let volumePages = 0;
  for (; volumePages < 10; volumePages++) {
    const response = await sync.handler({
      httpMethod: "GET", path: "/api/sync/changes",
      queryStringParameters: { action: "changes", since: volumeCursor, limit: "500" },
      headers: {
        host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
        "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "3",
      },
    });
    const body = JSON.parse(response.body);
    volumeRows += body.ops.length;
    volumeCursor = body.cursor;
    if (!body.hasMore) { volumePages += 1; break; }
  }
  check("mais de dois mil registros descem sem corte ou repetição",
    volumeRows === 2001 && volumeCursor === "2001" && volumePages === 5,
    JSON.stringify({ volumeRows, volumeCursor, volumePages }));

  const cursorInvalido = await sync.handler({
    httpMethod: "GET", path: "/api/sync/changes", queryStringParameters: { action: "changes", since: "-1" },
    headers: { host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader, "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "2" },
  });
  check("cursor inválido é recusado", cursorInvalido.statusCode === 400, cursorInvalido.statusCode);

  // A chave do checkpoint é (entity, entity_id). Se o cursor carregar somente
  // o id, duas entidades com o mesmo identificador podem cair em páginas
  // diferentes e a segunda nunca chega ao cliente.
  const checkpointId = "123e4567-e89b-42d3-a456-426614174001";
  checkpointRows = [
    { entity: "accounts", entity_id: "same-id", op: "put", rev, payload: { id: "same-id", name: "Conta" } },
    { entity: "categories", entity_id: "same-id", op: "put", rev, payload: { id: "same-id", name: "Categoria" } },
    { entity: "transactions", entity_id: "tx-z", op: "put", rev, payload: { id: "tx-z", type: "expense", amount: 1, date: "2026-08-14" } },
  ];
  const checkpointEvent = (after) => ({
    httpMethod: "GET", path: "/api/sync/checkpoint",
    queryStringParameters: { action: "checkpoint", id: checkpointId, limit: "1", ...(after ? { after } : {}) },
    headers: {
      host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
      "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "3",
    },
  });
  const checkpointPages = [];
  let checkpointAfter = "";
  for (let page = 0; page < 3; page++) {
    const response = await sync.handler(checkpointEvent(checkpointAfter));
    const body = JSON.parse(response.body);
    checkpointPages.push(...body.ops);
    checkpointAfter = body.after;
    if (!body.hasMore) break;
  }
  check("checkpoint pagina pela chave completa sem pular ids iguais",
    checkpointPages.map((row) => `${row.entity}:${row.entityId}`).join(",")
      === "accounts:same-id,categories:same-id,transactions:tx-z",
    JSON.stringify(checkpointPages));
  check("cursor do checkpoint é opaco e a consulta usa a mesma ordem composta",
    checkpointAfter !== "tx-z"
      && checkpointQueries.every((route) => route.includes("order=entity.asc,entity_id.asc"))
      && checkpointQueries.slice(1).every((route) => route.includes("&or=")),
    JSON.stringify(checkpointQueries));

  // Protocolo 1 não grava mais: aceitar a base inteira desfaria exclusões que
  // o log já registrou.
  const legado = await sync.handler({
    httpMethod: "PUT", path: "/api/sync/snapshot", queryStringParameters: { action: "snapshot" },
    headers: { origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader, "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "1", "idempotency-key": mutationId, "if-match": "0" },
    body: JSON.stringify({ protocol: 1, baseRevision: "0", mutationId, data: schema.emptySnapshot() }),
  });
  check("gravação por snapshot inteiro é recusada", legado.statusCode === 426 && JSON.parse(legado.body).code === "protocol_upgrade_required", legado.body);

  console.log("\n3b. Convivência dos protocolos 2 e 3");
  {
    // O backend fala 3 e ECOA a versão do cliente. Sem o eco, o cliente 2
    // recusaria toda resposta por "protocolo incompatível" no dia da publicação
    // do backend novo, antes mesmo de o aplicativo novo existir nos aparelhos.
    const corpo2 = JSON.parse(applied.body);
    check("cliente 2 recebe o próprio protocolo de volta", corpo2.protocol === 2, corpo2.protocol);
    check("a resposta anuncia o protocolo do servidor", corpo2.serverProtocol === 3 && corpo2.minimumWriteProtocol === 2, applied.body);

    const evento3 = (ops, body) => ({
      httpMethod: "POST", path: "/api/sync/changes", queryStringParameters: { action: "changes" },
      headers: {
        origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
        "x-device-id": "device-test-1234", "x-account-id": USER_ID,
        "x-sync-protocol": "3", "idempotency-key": mutationId,
      },
      body: JSON.stringify({ protocol: 3, mutationId, since: "0", ops, ...(body || {}) }),
    });

    const conta = { id: "acc-1", name: "Conta", type: "corrente", openingBalance: 0, openingDate: "2026-08-01", color: "#112233" };
    const porRegistro = await sync.handler(evento3([{ entity: "accounts", entityId: "acc-1", op: "put", rev, payload: conta }]));
    check("cliente 3 grava conta como entidade própria", porRegistro.statusCode === 200 && JSON.parse(porRegistro.body).protocol === 3, porRegistro.body);

    const listaNo3 = await sync.handler(evento3([{ entity: "settings", entityId: "accounts", op: "put", rev, payload: [conta] }]));
    check("cliente 3 não pode mandar a lista inteira", listaNo3.statusCode === 400, listaNo3.statusCode);

    const listaNo2 = await sync.handler(syncEvent([{ entity: "settings", entityId: "accounts", op: "put", rev, payload: [conta] }]));
    check("cliente 2 ainda envia o array durante a transição", listaNo2.statusCode === 200, listaNo2.body);

    // Cabeçalho e corpo precisam falar a MESMA versão: divergir aqui deixaria o
    // servidor validar com uma regra e gravar com outra.
    const divergente = await sync.handler({
      httpMethod: "POST", path: "/api/sync/changes", queryStringParameters: { action: "changes" },
      headers: {
        origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader,
        "x-device-id": "device-test-1234", "x-account-id": USER_ID,
        "x-sync-protocol": "3", "idempotency-key": mutationId,
      },
      body: JSON.stringify({ protocol: 2, mutationId, since: "0", ops: [] }),
    });
    check("cabeçalho e corpo precisam falar a mesma versão", divergente.statusCode === 400, divergente.statusCode);

    // O corte: escrita abaixo do mínimo vira 426, e não 409. O cliente trata
    // 409 como conflito de documento e descartaria a fila.
    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 3 };
    const cortado = await sync.handler(syncEvent([put]));
    check("escrita abaixo do mínimo recebe 426", cortado.statusCode === 426 && JSON.parse(cortado.body).code === "protocol_upgrade_required", cortado.body);
    const leituraAposCorte = await sync.handler({
      httpMethod: "GET", path: "/api/sync/changes", queryStringParameters: { action: "changes", since: "0", limit: "50" },
      headers: { host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader, "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "2" },
    });
    check("leitura do cliente 2 continua permitida depois do corte", leituraAposCorte.statusCode === 200, leituraAposCorte.statusCode);
    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2 };

    // Sem a migração aplicada não há configuração, e o servidor precisa dizer
    // isso com o mesmo código que a tela já sabe explicar.
    syncConfigRow = null;
    const semConfig = await sync.handler(syncEvent([put]));
    check("configuração ausente vira schema_missing", semConfig.statusCode === 503 && JSON.parse(semConfig.body).code === "schema_missing", semConfig.body);
    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2 };

    // [M13] Versão do schema do BANCO. Ela é declarativa: aparece em health e
    // nunca recusa atendimento. O caso importante é o banco que ainda não
    // recebeu a migração da coluna: a linha vem sem o campo, e isso não pode
    // virar erro nem número inventado.
    const health = () => sync.handler({
      httpMethod: "GET", path: "/api/sync/health", queryStringParameters: { action: "health" },
      headers: { host: "cofre.test", "x-forwarded-proto": "https", cookie: cookieHeader, "x-device-id": "device-test-1234", "x-account-id": USER_ID, "x-sync-protocol": "3" },
    });
    const semColuna = await health();
    check("banco sem a coluna de versão continua atendendo", semColuna.statusCode === 200, semColuna.statusCode);
    check("banco sem a coluna declara versão nula", JSON.parse(semColuna.body).databaseSchema === null, semColuna.body);

    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2, database_schema_version: 1 };
    const comColuna = await health();
    check("a versão declarada pelo banco é publicada", JSON.parse(comColuna.body).databaseSchema === 1, comColuna.body);

    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2, database_schema_version: "não é número" };
    const versaoInvalida = await health();
    check("versão inválida no banco não derruba o serviço", versaoInvalida.statusCode === 200, versaoInvalida.statusCode);
    check("versão inválida no banco vira nula, não NaN", JSON.parse(versaoInvalida.body).databaseSchema === null, versaoInvalida.body);
    syncConfigRow = { server_protocol: 3, minimum_write_protocol: 2, database_schema_version: 1 };

    // `remote_changed` é 409 com corpo próprio: o vínculo precisa distinguir
    // "a conta mudou" de "conflito de documento".
    rpcResult = { status: "remote_changed", revision: 9, applied: 0 };
    const mudou = await sync.handler(evento3([{ entity: "accounts", entityId: "acc-1", op: "put", rev, payload: conta }], { expectedRemoteRevision: "0" }));
    const corpoMudou = JSON.parse(mudou.body);
    check("conta alterada durante o vínculo devolve remote_changed", mudou.statusCode === 409 && corpoMudou.code === "remote_changed", mudou.body);
    check("a revisão observada volta no corpo", corpoMudou.revision === "9", mudou.body);
    check("a revisão esperada chega ao banco", rpcOptions && rpcOptions.body.p_expected_revision === "0", JSON.stringify(rpcOptions && rpcOptions.body.p_expected_revision));
    rpcResult = { status: "applied", revision: 8, applied: 1 };
  }

  console.log("\n4. Integração estática");
  const authSource = read("js/auth.js");
  const accountScreen = read("js/screens/account.js");
  const migration = [
    read("supabase/migrations/202608120001_accounts_finance.sql"),
    read("supabase/migrations/202608180001_sync_oplog.sql"),
    read("supabase/migrations/202608200001_sync_protocol_3_prepare.sql"),
    read("supabase/migrations/20260825001552_add_device_type.sql"),
    read("supabase/migrations/20260825003000_reset_dominant_tombstones.sql"),
  ].join("\n");
  check("frontend usa cookies e não localStorage para token", /credentials: "include"/.test(authSource) && !/access_token|refresh_token/.test(authSource));
  check("exclusão de conta exige senha e confirmação", /auth-delete-password/.test(accountScreen) && /APAGAR CONTA/.test(accountScreen));
  check("RLS e função atômica estão na migração", /enable row level security/.test(migration) && /for update/.test(migration) && /cofre_mutations/.test(migration));
  check("segredo do dispositivo não pode ser lido pelo usuário", /secret_hash text not null/.test(migration) && !/grant select \([^\n]*secret_hash/.test(migration));
  check("tipo do dispositivo tem lista fechada", /device_type in \('desktop', 'phone', 'tablet', 'unknown'\)/.test(migration));
  check("restrição do tipo pode coexistir com preparo manual", /from pg_constraint/.test(migration) && /conname = 'cofre_devices_device_type_check'/.test(migration));
  check("tipo do dispositivo tem somente leitura para a conta", /grant select \(device_type\)[^\n]+to authenticated/.test(migration));
  check("função de gravação não é executável pelo usuário", /grant execute[^\n]+to service_role/.test(migration) && /revoke all[^\n]+authenticated/.test(migration));
  check("chave de serviço não aparece no frontend", !read("js/modules/app.generated.js").includes("SUPABASE_SERVICE_ROLE_KEY"));
  check("service worker nunca guarda respostas de conta ou sincronização", /url\.pathname\.indexOf\("\/api\/"\) === 0/.test(read("service-worker.js")));
  // O log de operações precisa das mesmas garantias que o snapshot antigo tinha.
  check("log de operações tem RLS ligada", /alter table public\.cofre_sync_ops enable row level security/.test(migration));
  check("usuário autenticado não escreve direto no log", /revoke all on public\.cofre_sync_state[\s\S]*?from authenticated/.test(migration));
  check("uma linha viva por registro mantém o log compactado", /create unique index[\s\S]*?cofre_sync_ops \(user_id, entity, entity_id\)/.test(migration));
  check("exclusão da conta revoga os aparelhos", /cofre_purge_account/.test(migration) && /update public\.cofre_devices set revoked_at = now\(\)/.test(migration));
  check("apagar tudo grava lápide em vez de sumir com as linhas", /cofre_reset_data/.test(migration) && /'delete'/.test(migration));
  check("reset cria lápide acima da maior HLC e devolve a barreira",
    /cofre_hlc_successor/.test(migration) && /reset_rev text/.test(migration)
      && /result_hlc/.test(migration) && /server_reset:/.test(migration));
  check("comparação SQL usa a mesma ordem byte a byte do navegador",
    /collate "C"/i.test(migration));
  check("reset revalida idempotência depois do bloqueio",
    /for update;[\s\S]*Duas entregas simultâneas[\s\S]*select \* into v_prior/i.test(migration)
      && /for update;[\s\S]*Revalida sob o mesmo lock[\s\S]*select \* into v_prior/i.test(migration));
  check("função nova de gravação não é executável pelo usuário", /revoke all on function public\.cofre_apply_ops[\s\S]*?from public, anon, authenticated/.test(migration));
  check("checkpoint mantém apenas as versões recentes", /cofre_create_checkpoint/.test(migration) && /order by c2\.created_at desc limit/.test(migration));

  console.log("\n5. Exclusão da conta apaga servidor e aparelhos");
  {
    // Apagar só o usuário do Auth e confiar no cascade deixa uma janela aberta:
    // um aparelho com ciclo de sincronização em andamento grava depois da
    // exclusão e os dados voltam a existir. A purga revoga os aparelhos ANTES,
    // e só então o usuário do Auth é removido.
    const chamadas = [];
    let purgaFalha = false;
    api.db = async (route) => {
      chamadas.push(route);
      if (route.startsWith("cofre_devices?")) return [{ device_id: "device-test-1234", secret_hash: secretHash, revoked_at: null }];
      if (route === "rpc/cofre_purge_account") {
        if (purgaFalha) throw new Error("banco fora do ar");
        return [{ status: "purged", removed_ops: 12, removed_devices: 3 }];
      }
      return null;
    };
    let apagouUsuario = false;
    api.auth.deleteUser = async () => { apagouUsuario = true; return {}; };
    api.auth.signIn = async () => ({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, user: { id: USER_ID, email: "pessoa@example.com", email_confirmed_at: "2026-08-01T12:00:00Z" } });

    const apagar = await account.handler(event("POST", "delete", { password: "senha-segura-123", confirmation: "APAGAR CONTA" }, { cookie: cookieHeader }));
    const corpo = JSON.parse(apagar.body);
    check("exclusão devolve sucesso", apagar.statusCode === 200 && corpo.deleted === true, apagar.body);
    check("a purga do servidor é chamada", chamadas.includes("rpc/cofre_purge_account"));
    check("o usuário do Auth também é apagado", apagouUsuario === true);
    check("o que foi removido é informado", corpo.removed && corpo.removed.operations === 12 && corpo.removed.devices === 3, JSON.stringify(corpo.removed));
    check("a sessão é encerrada nos cookies", (apagar.multiValueHeaders["Set-Cookie"] || []).length > 0);

    // Se a purga falhar, o usuário NÃO pode ser apagado: sobraria uma conta sem
    // dono com os dados dentro dela.
    apagouUsuario = false;
    purgaFalha = true;
    const falha = await account.handler(event("POST", "delete", { password: "senha-segura-123", confirmation: "APAGAR CONTA" }, { cookie: cookieHeader }));
    check("falha na purga não apaga o usuário", falha.statusCode >= 400 && apagouUsuario === false, falha.statusCode);
    check("a falha explica que nada foi removido", /purge_failed/.test(falha.body), falha.body);
    purgaFalha = false;

    // A confirmação por texto continua obrigatória.
    const semConfirmacao = await account.handler(event("POST", "delete", { password: "senha-segura-123", confirmation: "apagar" }, { cookie: cookieHeader }));
    check("sem a frase exata, nada é apagado", semConfirmacao.statusCode === 400, semConfirmacao.statusCode);
  }

  Object.assign(api.auth, originalAuth); api.db = originalDb;
  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
