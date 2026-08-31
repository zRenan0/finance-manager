"use strict";

const crypto = require("crypto");

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$/;
const SAFE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const SAFE_AREAS = new Set(["account", "sync", "analyze"]);
const OBSERVATION_CODES = new Set([
  "ok", "response_error", "unhandled", "server_error", "not_found", "not_configured",
  "origin_denied", "body_too_large", "invalid_json", "invalid_device", "invalid_email",
  "invalid_password", "weak_password", "leaked_password", "invalid_callback", "email_not_confirmed",
  "email_exists", "email_rate_limited", "rate_limited", "same_password", "invalid_credentials",
  "bad_jwt", "refresh_token_not_found", "refresh_token_already_used", "session_not_found",
  "session_expired", "request_timeout", "conflict", "link_expired", "link_invalid",
  "link_other_browser", "user_not_found", "email_disabled", "signup_disabled", "email_send_failed",
  "already_confirmed", "schema_missing", "invalid_session", "upstream_unavailable", "request_rejected",
  "session_refresh_required", "device_unknown", "device_revoked", "device_authorization_failed",
  "invalid_account_scope", "account_scope_changed", "verifier_missing", "reauth_required",
  "reauth_failed", "device_not_active", "confirmation_required", "purge_failed", "protocol_mismatch",
  "protocol_upgrade_required", "invalid_mutation", "invalid_cursor", "invalid_revision", "invalid_commit",
  "idempotency_mismatch", "remote_changed", "invalid_rev", "invalid_checkpoint", "not_enough_data",
  "rate_limit", "bad_key", "upstream_error", "bad_response", "timeout", "network",
  "account_unavailable", "device_invalid", "auth_required", "too_large", "no_api_key", "bad_json",
  "forbidden_origin",
]);

function requestIdOf() {
  const requestId = crypto.randomUUID();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : "request_unavailable";
}

function safeToken(value, fallback, maximum) {
  const token = String(value || "").toLowerCase();
  const limit = Number(maximum) || 48;
  return token.length <= limit && /^[a-z][a-z0-9_-]*$/.test(token) ? token : fallback;
}

function responseCode(response, status) {
  if (Number(status) < 400 || typeof (response && response.body) !== "string" || response.body.length > 8192) return "ok";
  try {
    const parsed = JSON.parse(response.body);
    const code = safeToken(parsed && parsed.code, "response_error", 48);
    return OBSERVATION_CODES.has(code) ? code : "response_error";
  } catch (_) {
    return "response_error";
  }
}

function levelFor(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

function defaultEmit(entry) {
  if (process.env.NODE_ENV !== "production" && process.env.OBSERVABILITY_LOGS !== "1") return;
  const serialized = JSON.stringify(entry);
  const writer = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.info;
  if (typeof writer === "function") writer(serialized);
}

function withRequestId(response, requestId) {
  const safeResponse = response && typeof response === "object"
    ? response
    : { statusCode: 500, body: "" };
  return {
    ...safeResponse,
    headers: { ...(safeResponse.headers || {}), "X-Request-Id": requestId },
  };
}

function observeHandler(config, handler, dependencies) {
  if (typeof handler !== "function") throw new TypeError("Handler inválido");
  const options = config || {};
  const emit = dependencies && typeof dependencies.emit === "function" ? dependencies.emit : defaultEmit;
  const now = dependencies && typeof dependencies.now === "function" ? dependencies.now : Date.now;
  const newRequestId = dependencies && typeof dependencies.requestId === "function" ? dependencies.requestId : requestIdOf;
  const area = SAFE_AREAS.has(options.area) ? options.area : "unknown";

  return async function observedHandler(event, context) {
    const startedAt = now();
    const requestId = newRequestId(event);
    const methodRaw = String(event && event.httpMethod || "GET").toUpperCase();
    const method = SAFE_METHODS.has(methodRaw) ? methodRaw : "OTHER";
    const resolved = typeof options.operation === "function" ? options.operation(event) : options.operation;
    const operation = safeToken(resolved, "unknown", 40);

    const record = (status, code) => {
      const normalizedStatus = Number.isInteger(Number(status)) ? Number(status) : 500;
      const finishedAt = now();
      emit({
        kind: "cofre_observation",
        version: 1,
        at: new Date(finishedAt).toISOString(),
        level: levelFor(normalizedStatus),
        area,
        operation,
        method,
        status: normalizedStatus,
        code: safeToken(code, "response_error", 48),
        durationMs: Math.max(0, Math.round(finishedAt - startedAt)),
        requestId,
      });
    };

    try {
      const response = withRequestId(await handler(event, context), requestId);
      const status = Number(response.statusCode) || 500;
      record(status, responseCode(response, status));
      return response;
    } catch (error) {
      record(500, "unhandled");
      throw error;
    }
  };
}

module.exports = {
  observeHandler,
  requestIdOf,
  safeToken,
  responseCode,
  levelFor,
};
