"use strict";

// Sincronização, protocolo 3 (log de operações por registro).
//
// O protocolo 1 trocava a base inteira a cada ciclo: um PUT de tudo, guardado
// numa coluna jsonb, com 409 sempre que dois aparelhos gravavam junto. As
// consequências estão descritas na migração 202608180001_sync_oplog.sql.
//
// Aqui o servidor é um log append-only compactado: recebe operações, guarda a
// VENCEDORA de cada (entidade, id) segundo a marca do relógio lógico, e
// devolve por cursor o que o aparelho ainda não viu. Não existe mais 409 de
// documento inteiro, porque não existe mais documento inteiro.
//
// Compatibilidade: o protocolo 1 continua atendido em modo somente leitura
// (GET /snapshot) para que um aparelho ainda não atualizado consiga baixar os
// dados e migrar. Ele não grava mais.

const crypto = require("crypto");
const api = require("./_shared/supabase-rest");
const { requireSession } = require("./account");
const { headersOf, assertSameOrigin, readJson, json, safeFailure, deviceIdOf } = require("./_shared/http");
const { observeHandler } = require("./_shared/observability");
const { validateOps, foldOps, emptySnapshot, MAX_OPS_PER_BATCH, OP_ENTITIES } = require("./_shared/finance-schema");

const PROTOCOL = 3;
const MINIMUM_WRITE_PROTOCOL = 2;
const LEGACY_PROTOCOL = 1;
const SUPPORTED_PROTOCOLS = new Set([LEGACY_PROTOCOL, 2, PROTOCOL]);
const PAGE_DEFAULT = 500;
const PAGE_MAX = 1000;
const CHECKPOINT_KEEP = 5;
const HLC_PATTERN = /^\d{15}\.\d{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const OBSERVED_SYNC_ROUTES = new Set(["health", "changes", "reset", "checkpoints", "checkpoint", "snapshot"]);

function routeOf(event) {
  const fromQuery = event && event.queryStringParameters && event.queryStringParameters.action;
  if (fromQuery) return String(fromQuery).split("/")[0];
  const path = String(event.path || event.rawPath || "").replace(/\/+$/, "");
  return path.split("/").pop() || "health";
}
function observedRouteOf(event) {
  const route = routeOf(event);
  return OBSERVED_SYNC_ROUTES.has(route) ? route : "unknown";
}

// O aparelho declara a versão do protocolo que fala. Aceitar as duas é o que
// permite atualizar o app sem derrubar quem ainda não recarregou a página.
function protocolOf(event) {
  const raw = String(headersOf(event)["x-sync-protocol"] || "");
  const value = Number(raw);
  if (!SUPPORTED_PROTOCOLS.has(value)) {
    throw Object.assign(new Error("Protocolo de sincronização incompatível"), { statusCode: 400, code: "protocol_mismatch" });
  }
  return value;
}

async function syncConfig() {
  // `select=*` de propósito, e não a lista de colunas: a versão do schema do
  // banco (migração 20260831120000) é uma coluna nova, e pedi-la pelo nome faria
  // o PostgREST devolver 400 em qualquer banco que ainda não recebeu a migração.
  // Ler a linha inteira funciona antes e depois dela.
  const rows = await api.db("cofre_sync_config?select=*&id=eq.1&limit=1", { service: true });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw Object.assign(new Error("A configuração do protocolo não foi encontrada"), { statusCode: 503, code: "schema_missing", exposeMessage: true });
  }
  const serverProtocol = Number(row.server_protocol);
  const minimumWriteProtocol = Number(row.minimum_write_protocol);
  if (serverProtocol !== PROTOCOL || !Number.isInteger(minimumWriteProtocol)
    || minimumWriteProtocol < LEGACY_PROTOCOL || minimumWriteProtocol > serverProtocol) {
    throw Object.assign(new Error("A configuração do protocolo é inválida"), { statusCode: 503, code: "schema_missing", exposeMessage: true });
  }
  // Banco anterior à migração não tem a coluna: `null` diz "não declarada", que
  // é diferente de "atrasada". Nem um nem outro recusa atendimento; a
  // divergência aparece em /api/sync/health, para ser vista antes de virar
  // incidente. Ver docs/VERSIONAMENTO.md.
  const declared = Number(row.database_schema_version);
  const databaseSchema = Number.isInteger(declared) && declared >= 1 ? declared : null;
  return { serverProtocol, minimumWriteProtocol, databaseSchema };
}

function withProtocol(spoken, config, body) {
  return {
    protocol: spoken,
    serverProtocol: config.serverProtocol,
    minimumWriteProtocol: config.minimumWriteProtocol,
    ...body,
  };
}

function assertBodyProtocol(body, spoken) {
  if (!body || Number(body.protocol) !== spoken) {
    throw Object.assign(new Error("Cabeçalho e corpo falam protocolos diferentes"), { statusCode: 400, code: "protocol_mismatch" });
  }
}

function assertWriteProtocol(spoken, config) {
  if (spoken < config.minimumWriteProtocol) {
    throw Object.assign(new Error("Atualize o aplicativo para continuar sincronizando"), { statusCode: 426, code: "protocol_upgrade_required" });
  }
}

function mutationIdOf(event, body) {
  const headers = headersOf(event);
  const mutationId = String(body.mutationId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mutationId)
    || headers["idempotency-key"] !== mutationId) {
    throw Object.assign(new Error("Identificador da operação inválido"), { statusCode: 400, code: "invalid_mutation" });
  }
  return mutationId;
}

function cursorOf(event) {
  const params = (event && event.queryStringParameters) || {};
  const since = String(params.since == null ? "0" : params.since);
  if (!/^\d{1,18}$/.test(since)) {
    throw Object.assign(new Error("Cursor inválido"), { statusCode: 400, code: "invalid_cursor" });
  }
  const limitRaw = Number(params.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), PAGE_MAX) : PAGE_DEFAULT;
  return { since, limit };
}

const CHECKPOINT_CURSOR_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;

function invalidCheckpointCursor() {
  return Object.assign(new Error("Cursor da versão inválido"), { statusCode: 400, code: "invalid_cursor" });
}

// A chave primária da versão inclui entidade e id. O cursor precisa carregar
// os dois campos e a consulta precisa usar a mesma ordem, senão duas entidades
// com o mesmo id podem cair em páginas diferentes e a segunda ser ignorada.
function checkpointCursorOf(raw) {
  if (!raw) return null;
  try {
    if (String(raw).length > 256) throw invalidCheckpointCursor();
    const decoded = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    const entity = Array.isArray(decoded) ? String(decoded[0] || "") : "";
    const entityId = Array.isArray(decoded) ? String(decoded[1] || "") : "";
    if (decoded.length !== 2 || OP_ENTITIES.indexOf(entity) === -1 || !CHECKPOINT_CURSOR_ID.test(entityId)) {
      throw invalidCheckpointCursor();
    }
    return { entity, entityId };
  } catch (error) {
    if (error && error.code === "invalid_cursor") throw error;
    throw invalidCheckpointCursor();
  }
}

function encodeCheckpointCursor(row) {
  return Buffer.from(JSON.stringify([String(row.entity), String(row.entity_id)]), "utf8").toString("base64url");
}

async function revisionOf(session) {
  const rows = await api.db("cofre_sync_state?select=revision&limit=1", { token: session.token });
  return rows && rows[0] ? String(rows[0].revision) : "0";
}

function expectedRevisionOf(body) {
  if (body.expectedRemoteRevision == null || body.expectedRemoteRevision === "") return null;
  const value = String(body.expectedRemoteRevision);
  if (!/^\d{1,18}$/.test(value)) {
    throw Object.assign(new Error("Revisão remota esperada inválida"), { statusCode: 400, code: "invalid_revision" });
  }
  return value;
}

// Paginação de verdade: o aparelho pede a partir de um cursor e recebe no
// máximo `limit` linhas. Uma base grande desce em várias voltas, em vez de
// depender de um único corpo caber na resposta.
async function opsSince(session, since, limit) {
  const path = `cofre_sync_ops?select=seq,entity,entity_id,op,rev,payload&seq=gt.${encodeURIComponent(since)}`
    + `&order=seq.asc&limit=${limit + 1}`;
  const rows = await api.db(path, { token: session.token });
  const list = Array.isArray(rows) ? rows : [];
  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;
  return {
    hasMore,
    ops: page.map((row) => ({
      seq: String(row.seq),
      entity: row.entity,
      entityId: row.entity_id,
      op: row.op,
      rev: row.rev,
      payload: row.op === "put" ? row.payload : undefined,
    })),
    cursor: page.length ? String(page[page.length - 1].seq) : String(since),
  };
}

async function applyOps(session, event, mutationId, ops, spoken, expectedRevision) {
  const hashInput = spoken === 2
    ? JSON.stringify(ops)
    : JSON.stringify({ protocol: spoken, expectedRemoteRevision: expectedRevision, ops });
  const requestHash = crypto.createHash("sha256").update(hashInput).digest("hex");
  const rows = await api.db("rpc/cofre_apply_ops", {
    method: "POST", service: true,
    body: {
      p_user_id: session.user.id, p_mutation_id: mutationId, p_request_hash: requestHash,
      p_ops: ops, p_device_id: deviceIdOf(event), p_protocol: spoken,
      p_expected_revision: expectedRevision,
    },
  });
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result) throw Object.assign(new Error("O servidor não confirmou a operação"), { statusCode: 502, code: "invalid_commit" });
  if (result.status === "device_revoked") {
    throw Object.assign(new Error("Este dispositivo teve o acesso revogado"), { statusCode: 403, code: "device_revoked" });
  }
  if (result.status === "idempotency_mismatch") {
    throw Object.assign(new Error("A operação repetida não corresponde ao envio original"), { statusCode: 409, code: "idempotency_mismatch" });
  }
  if (result.status === "protocol_upgrade_required") {
    throw Object.assign(new Error("Atualize o aplicativo para continuar sincronizando"), { statusCode: 426, code: "protocol_upgrade_required" });
  }
  if (result.status === "remote_changed") {
    const error = Object.assign(new Error("A conta mudou antes da confirmação do vínculo"), { statusCode: 409, code: "remote_changed" });
    error.revision = String(result.revision);
    throw error;
  }
  return { status: result.status, revision: String(result.revision), applied: Number(result.applied) || 0 };
}

async function handler(event) {
  let spoken = PROTOCOL;
  let config = { serverProtocol: PROTOCOL, minimumWriteProtocol: MINIMUM_WRITE_PROTOCOL };
  try {
    spoken = protocolOf(event);
    if (!api.config().configured) return json(503, withProtocol(spoken, config, { status: "unavailable", code: "not_configured" }));
    const method = String(event.httpMethod || "GET").toUpperCase();
    if (method !== "GET") assertSameOrigin(event);
    const session = await requireSession(event, { accountScope: true });
    const route = routeOf(event);
    config = await syncConfig();

    if ((route === "changes" || route === "reset" || route === "checkpoints" || route === "checkpoint") && spoken === LEGACY_PROTOCOL) {
      throw Object.assign(new Error("Protocolo incompatível com esta rota"), { statusCode: 400, code: "protocol_mismatch" });
    }
    if (route === "snapshot" && spoken !== LEGACY_PROTOCOL) {
      throw Object.assign(new Error("Protocolo incompatível com esta rota"), { statusCode: 400, code: "protocol_mismatch" });
    }

    // ---- Estado ----
    if (route === "health" && method === "GET") {
      // [M13] `databaseSchema` é a versão declarada pelo próprio banco. `null`
      // significa banco anterior à migração que criou a coluna. Publicar aqui é
      // o que permite descobrir "produção está atrás do repositório" com uma
      // leitura, em vez de uma investigação tabela por tabela.
      return json(200, withProtocol(spoken, config, {
        status: "ok",
        databaseSchema: config.databaseSchema,
        revision: await revisionOf(session),
      }), { cookies: session.cookies });
    }

    // ---- Leitura incremental (protocolo 2) ----
    if (route === "changes" && method === "GET") {
      const { since, limit } = cursorOf(event);
      const revision = await revisionOf(session);
      const page = await opsSince(session, since, limit);
      return json(200, withProtocol(spoken, config, {
        status: "ok", revision,
        ops: page.ops, hasMore: page.hasMore, cursor: page.cursor,
      }), { cookies: session.cookies });
    }

    // ---- Escrita incremental (protocolo 2) ----
    if (route === "changes" && method === "POST") {
      const body = readJson(event, 2 * 1024 * 1024);
      assertBodyProtocol(body, spoken);
      assertWriteProtocol(spoken, config);
      const mutationId = mutationIdOf(event, body);
      const ops = validateOps(body.ops, spoken);
      const expectedRevision = expectedRevisionOf(body);
      const result = ops.length
        ? await applyOps(session, event, mutationId, ops, spoken, expectedRevision)
        : { status: "applied", revision: await revisionOf(session), applied: 0 };
      // Devolve na mesma volta o que o aparelho ainda não viu: uma ida e volta
      // por ciclo em vez de duas.
      const since = /^\d{1,18}$/.test(String(body.since || "")) ? String(body.since) : "0";
      const page = await opsSince(session, since, PAGE_DEFAULT);
      return json(200, withProtocol(spoken, config, {
        status: result.status, revision: result.revision, applied: result.applied,
        ops: page.ops, hasMore: page.hasMore, cursor: page.cursor,
      }), { cookies: session.cookies });
    }

    // ---- "Apagar tudo" que propaga para os outros aparelhos ----
    if (route === "reset" && method === "POST") {
      const body = readJson(event, 16 * 1024);
      assertBodyProtocol(body, spoken);
      assertWriteProtocol(spoken, config);
      const mutationId = mutationIdOf(event, body);
      const rev = String(body.rev || "");
      if (!/^\d{15}\.\d{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(rev)) {
        throw Object.assign(new Error("Marca de versão inválida"), { statusCode: 400, code: "invalid_rev" });
      }
      const requestHash = crypto.createHash("sha256").update(`reset:${rev}`).digest("hex");
      const rows = await api.db("rpc/cofre_reset_data", {
        method: "POST", service: true,
        body: {
          p_user_id: session.user.id, p_mutation_id: mutationId, p_request_hash: requestHash,
          p_device_id: deviceIdOf(event), p_rev_prefix: rev, p_protocol: spoken,
        },
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (result && result.status === "device_revoked") {
        throw Object.assign(new Error("Este dispositivo teve o acesso revogado"), { statusCode: 403, code: "device_revoked" });
      }
      if (result && result.status === "protocol_upgrade_required") {
        throw Object.assign(new Error("Atualize o aplicativo para continuar sincronizando"), { statusCode: 426, code: "protocol_upgrade_required" });
      }
      if (result && result.status === "idempotency_mismatch") {
        throw Object.assign(new Error("A exclusão repetida não corresponde ao pedido original"), {
          statusCode: 409, code: "idempotency_mismatch",
        });
      }
      if (!result || (result.status !== "applied" && result.status !== "replayed")) {
        throw Object.assign(new Error("O servidor não confirmou a exclusão remota"), {
          statusCode: 502, code: "invalid_commit",
        });
      }
      const revision = String(result.revision || "");
      const resetRev = String(result.reset_rev || "");
      if (!/^\d{1,18}$/.test(revision) || !HLC_PATTERN.test(resetRev)) {
        throw Object.assign(new Error("O servidor devolveu uma confirmação inválida para a exclusão"), {
          statusCode: 502, code: "invalid_commit",
        });
      }
      return json(200, withProtocol(spoken, config, {
        status: result.status, revision, resetRev,
        applied: Number(result.applied) || 0,
      }), { cookies: session.cookies });
    }

    // ---- Versões restauráveis ----
    if (route === "checkpoints" && method === "GET") {
      const rows = await api.db("cofre_sync_checkpoints?select=checkpoint_id,revision,label,entity_count,byte_size,created_at&order=created_at.desc&limit=20", { token: session.token });
      return json(200, withProtocol(spoken, config, {
        status: "ok",
        checkpoints: (rows || []).map((row) => ({
          id: row.checkpoint_id, revision: String(row.revision), label: row.label,
          entityCount: row.entity_count, byteSize: row.byte_size, createdAt: row.created_at,
        })),
      }), { cookies: session.cookies });
    }

    if (route === "checkpoints" && method === "POST") {
      const body = readJson(event, 16 * 1024);
      assertBodyProtocol(body, spoken);
      assertWriteProtocol(spoken, config);
      const label = String(body.label || "Automático").slice(0, 60);
      const rows = await api.db("rpc/cofre_create_checkpoint", {
        method: "POST", service: true,
        body: { p_user_id: session.user.id, p_label: label, p_keep: CHECKPOINT_KEEP },
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      return json(200, withProtocol(spoken, config, {
        status: "ok",
        checkpoint: result ? { id: result.checkpoint_id, revision: String(result.revision), entityCount: Number(result.entity_count) || 0 } : null,
      }), { cookies: session.cookies });
    }

    if (route === "checkpoint" && method === "GET") {
      const params = (event && event.queryStringParameters) || {};
      const id = String(params.id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw Object.assign(new Error("Versão inválida"), { statusCode: 400, code: "invalid_checkpoint" });
      }
      const { limit } = cursorOf(event);
      const after = String(params.after || "");
      const cursor = checkpointCursorOf(after);
      const filter = cursor
        ? `&or=(entity.gt.${encodeURIComponent(cursor.entity)},and(entity.eq.${encodeURIComponent(cursor.entity)},entity_id.gt.${encodeURIComponent(cursor.entityId)}))`
        : "";
      const rows = await api.db(
        `cofre_sync_checkpoint_rows?select=entity,entity_id,op,rev,payload&checkpoint_id=eq.${encodeURIComponent(id)}${filter}`
        + `&order=entity.asc,entity_id.asc&limit=${limit + 1}`,
        { token: session.token },
      );
      const list = Array.isArray(rows) ? rows : [];
      const hasMore = list.length > limit;
      const page = hasMore ? list.slice(0, limit) : list;
      return json(200, withProtocol(spoken, config, {
        status: "ok", hasMore,
        after: page.length ? encodeCheckpointCursor(page[page.length - 1]) : after,
        ops: page.map((row) => ({ entity: row.entity, entityId: row.entity_id, op: row.op, rev: row.rev, payload: row.payload })),
      }), { cookies: session.cookies });
    }

    // ---- Protocolo 1: leitura de compatibilidade ----
    // Um aparelho que ainda não recarregou continua conseguindo BAIXAR seus
    // dados. Gravar, não: aceitar um snapshot inteiro desfaria as exclusões
    // que o log já registrou.
    if (route === "snapshot" && method === "GET") {
      const page = await opsSince(session, "0", PAGE_MAX);
      const snapshot = page.hasMore ? emptySnapshot() : foldOps(page.ops);
      return json(200, withProtocol(spoken, config, {
        revision: await revisionOf(session),
        truncated: page.hasMore,
        data: snapshot,
      }), { cookies: session.cookies });
    }
    if (route === "snapshot" && (method === "PUT" || method === "DELETE")) {
      return json(426, withProtocol(spoken, config, {
        status: "error", code: "protocol_upgrade_required",
        message: "Atualize o aplicativo para continuar sincronizando.",
      }));
    }

    return json(404, withProtocol(spoken, config, { status: "error", code: "not_found" }));
  } catch (error) {
    const failure = safeFailure(error);
    const parsed = JSON.parse(failure.body);
    const body = withProtocol(spoken, config, { status: "error", code: parsed.code, message: parsed.message });
    if (error && error.revision != null) body.revision = String(error.revision);
    failure.body = JSON.stringify(body);
    return failure;
  }
}

const observedHandler = observeHandler({ area: "sync", operation: observedRouteOf }, handler);

module.exports = { handler: observedHandler, PROTOCOL, MINIMUM_WRITE_PROTOCOL, MAX_OPS_PER_BATCH };
