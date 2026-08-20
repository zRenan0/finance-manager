"use strict";

// Sincronização, protocolo 2 (log de operações).
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
const { validateOps, foldOps, emptySnapshot, MAX_OPS_PER_BATCH } = require("./_shared/finance-schema");

const PROTOCOL = 2;
const LEGACY_PROTOCOL = 1;
const PAGE_DEFAULT = 500;
const PAGE_MAX = 1000;
const CHECKPOINT_KEEP = 5;

function routeOf(event) {
  const fromQuery = event && event.queryStringParameters && event.queryStringParameters.action;
  if (fromQuery) return String(fromQuery).split("/")[0];
  const path = String(event.path || event.rawPath || "").replace(/\/+$/, "");
  return path.split("/").pop() || "health";
}

// O aparelho declara a versão do protocolo que fala. Aceitar as duas é o que
// permite atualizar o app sem derrubar quem ainda não recarregou a página.
function protocolOf(event) {
  const raw = String(headersOf(event)["x-sync-protocol"] || "");
  const value = Number(raw);
  if (value !== PROTOCOL && value !== LEGACY_PROTOCOL) {
    throw Object.assign(new Error("Protocolo de sincronização incompatível"), { statusCode: 400, code: "protocol_mismatch" });
  }
  return value;
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

async function revisionOf(session) {
  const rows = await api.db("cofre_sync_state?select=revision&limit=1", { token: session.token });
  return rows && rows[0] ? String(rows[0].revision) : "0";
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

async function applyOps(session, event, mutationId, ops) {
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(ops)).digest("hex");
  const rows = await api.db("rpc/cofre_apply_ops", {
    method: "POST", service: true,
    body: {
      p_user_id: session.user.id, p_mutation_id: mutationId, p_request_hash: requestHash,
      p_ops: ops, p_device_id: deviceIdOf(event),
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
  return { status: result.status, revision: String(result.revision), applied: Number(result.applied) || 0 };
}

async function handler(event) {
  try {
    if (!api.config().configured) return json(503, { protocol: PROTOCOL, status: "unavailable", code: "not_configured" });
    const spoken = protocolOf(event);
    const method = String(event.httpMethod || "GET").toUpperCase();
    if (method !== "GET") assertSameOrigin(event);
    const session = await requireSession(event);
    const route = routeOf(event);

    // ---- Estado ----
    if (route === "health" && method === "GET") {
      return json(200, { protocol: spoken, status: "ok", revision: await revisionOf(session) }, { cookies: session.cookies });
    }

    // ---- Leitura incremental (protocolo 2) ----
    if (route === "changes" && method === "GET") {
      const { since, limit } = cursorOf(event);
      const revision = await revisionOf(session);
      const page = await opsSince(session, since, limit);
      return json(200, {
        protocol: PROTOCOL, status: "ok", revision,
        ops: page.ops, hasMore: page.hasMore, cursor: page.cursor,
      }, { cookies: session.cookies });
    }

    // ---- Escrita incremental (protocolo 2) ----
    if (route === "changes" && method === "POST") {
      const body = readJson(event, 2 * 1024 * 1024);
      if (Number(body.protocol) !== PROTOCOL) {
        throw Object.assign(new Error("Protocolo incompatível"), { statusCode: 400, code: "protocol_mismatch" });
      }
      const mutationId = mutationIdOf(event, body);
      const ops = validateOps(body.ops);
      const result = ops.length
        ? await applyOps(session, event, mutationId, ops)
        : { status: "applied", revision: await revisionOf(session), applied: 0 };
      // Devolve na mesma volta o que o aparelho ainda não viu: uma ida e volta
      // por ciclo em vez de duas.
      const since = /^\d{1,18}$/.test(String(body.since || "")) ? String(body.since) : "0";
      const page = await opsSince(session, since, PAGE_DEFAULT);
      return json(200, {
        protocol: PROTOCOL, status: result.status, revision: result.revision, applied: result.applied,
        ops: page.ops, hasMore: page.hasMore, cursor: page.cursor,
      }, { cookies: session.cookies });
    }

    // ---- "Apagar tudo" que propaga para os outros aparelhos ----
    if (route === "reset" && method === "POST") {
      const body = readJson(event, 16 * 1024);
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
          p_device_id: deviceIdOf(event), p_rev_prefix: rev,
        },
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (result && result.status === "device_revoked") {
        throw Object.assign(new Error("Este dispositivo teve o acesso revogado"), { statusCode: 403, code: "device_revoked" });
      }
      return json(200, {
        protocol: PROTOCOL, status: (result && result.status) || "applied",
        revision: String((result && result.revision) || "0"), applied: Number(result && result.applied) || 0,
      }, { cookies: session.cookies });
    }

    // ---- Versões restauráveis ----
    if (route === "checkpoints" && method === "GET") {
      const rows = await api.db("cofre_sync_checkpoints?select=checkpoint_id,revision,label,entity_count,byte_size,created_at&order=created_at.desc&limit=20", { token: session.token });
      return json(200, {
        protocol: PROTOCOL, status: "ok",
        checkpoints: (rows || []).map((row) => ({
          id: row.checkpoint_id, revision: String(row.revision), label: row.label,
          entityCount: row.entity_count, byteSize: row.byte_size, createdAt: row.created_at,
        })),
      }, { cookies: session.cookies });
    }

    if (route === "checkpoints" && method === "POST") {
      const body = readJson(event, 16 * 1024);
      const label = String(body.label || "Automático").slice(0, 60);
      const rows = await api.db("rpc/cofre_create_checkpoint", {
        method: "POST", service: true,
        body: { p_user_id: session.user.id, p_label: label, p_keep: CHECKPOINT_KEEP },
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      return json(200, {
        protocol: PROTOCOL, status: "ok",
        checkpoint: result ? { id: result.checkpoint_id, revision: String(result.revision), entityCount: Number(result.entity_count) || 0 } : null,
      }, { cookies: session.cookies });
    }

    if (route === "checkpoint" && method === "GET") {
      const params = (event && event.queryStringParameters) || {};
      const id = String(params.id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw Object.assign(new Error("Versão inválida"), { statusCode: 400, code: "invalid_checkpoint" });
      }
      const { limit } = cursorOf(event);
      const after = String(params.after || "");
      const filter = after ? `&entity_id=gt.${encodeURIComponent(after)}` : "";
      const rows = await api.db(
        `cofre_sync_checkpoint_rows?select=entity,entity_id,op,rev,payload&checkpoint_id=eq.${encodeURIComponent(id)}${filter}`
        + `&order=entity_id.asc&limit=${limit + 1}`,
        { token: session.token },
      );
      const list = Array.isArray(rows) ? rows : [];
      const hasMore = list.length > limit;
      const page = hasMore ? list.slice(0, limit) : list;
      return json(200, {
        protocol: PROTOCOL, status: "ok", hasMore,
        after: page.length ? page[page.length - 1].entity_id : after,
        ops: page.map((row) => ({ entity: row.entity, entityId: row.entity_id, op: row.op, rev: row.rev, payload: row.payload })),
      }, { cookies: session.cookies });
    }

    // ---- Protocolo 1: leitura de compatibilidade ----
    // Um aparelho que ainda não recarregou continua conseguindo BAIXAR seus
    // dados. Gravar, não: aceitar um snapshot inteiro desfaria as exclusões
    // que o log já registrou.
    if (route === "snapshot" && method === "GET") {
      const page = await opsSince(session, "0", PAGE_MAX);
      const snapshot = page.hasMore ? emptySnapshot() : foldOps(page.ops);
      return json(200, {
        protocol: LEGACY_PROTOCOL,
        revision: await revisionOf(session),
        truncated: page.hasMore,
        data: snapshot,
      }, { cookies: session.cookies });
    }
    if (route === "snapshot" && (method === "PUT" || method === "DELETE")) {
      return json(409, {
        protocol: LEGACY_PROTOCOL, status: "error", code: "protocol_upgrade_required",
        message: "Atualize o aplicativo para continuar sincronizando.",
      });
    }

    return json(404, { protocol: PROTOCOL, status: "error", code: "not_found" });
  } catch (error) {
    const failure = safeFailure(error);
    const parsed = JSON.parse(failure.body);
    failure.body = JSON.stringify({ protocol: PROTOCOL, status: "error", code: parsed.code, message: parsed.message });
    return failure;
  }
}

module.exports = { handler, PROTOCOL, MAX_OPS_PER_BATCH };
