// safe-errors.js. Diagnóstico local sem conteúdo financeiro ou pessoal.
"use strict";

const SAFE_ERROR_STORAGE_KEY = "financas_safe_errors_v1";
const SAFE_ERROR_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_ERROR_LIMIT = 50;
const SAFE_ERROR_APP_VERSION = "0.29.3";
const SAFE_ERROR_AREAS = new Set(["app", "storage", "backup", "import", "sync", "ai", "qr", "events"]);
const SAFE_ERROR_CODES = new Set([
  "unexpected", "app_init", "storage_init", "storage_read", "storage_write", "storage_delete",
  "backup_read", "backup_restore", "import_read", "sync_read", "sync_write", "ai_request",
  "qr_camera", "qr_lookup", "global_error", "unhandled_rejection",
]);

function safeErrorArea(value) {
  const area = String(value || "app").toLowerCase();
  return SAFE_ERROR_AREAS.has(area) ? area : "app";
}

function safeErrorCode(value) {
  const code = String(value || "unexpected").toLowerCase();
  return SAFE_ERROR_CODES.has(code) ? code : "unexpected";
}

function safeErrorNow() { return Date.now(); }

function normalizeSafeErrorEntries(raw, now) {
  const clock = Number.isFinite(now) ? now : safeErrorNow();
  const min = clock - SAFE_ERROR_RETENTION_MS;
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && Number(item.at) >= min && Number(item.at) <= clock + 60000)
    .map((item) => ({
      at: Math.floor(Number(item.at)),
      area: safeErrorArea(item.area),
      code: safeErrorCode(item.code),
      appVersion: SAFE_ERROR_APP_VERSION,
      schema: Number.isInteger(Number(item.schema)) ? Number(item.schema) : null,
      online: item.online === true ? true : item.online === false ? false : null,
    }))
    .sort((a, b) => a.at - b.at)
    .slice(-SAFE_ERROR_LIMIT);
}

function readSafeErrors() {
  try {
    const raw = localStorage.getItem(SAFE_ERROR_STORAGE_KEY);
    return normalizeSafeErrorEntries(raw ? JSON.parse(raw) : []);
  } catch (_error) { return []; }
}

function writeSafeErrors(entries) {
  try {
    localStorage.setItem(SAFE_ERROR_STORAGE_KEY, JSON.stringify(normalizeSafeErrorEntries(entries)));
    return true;
  } catch (_error) { return false; }
}

function reportSafeError(area, _error, code) {
  const entries = readSafeErrors();
  entries.push({
    at: safeErrorNow(),
    area: safeErrorArea(area),
    code: safeErrorCode(code),
    appVersion: SAFE_ERROR_APP_VERSION,
    schema: typeof SCHEMA_VERSION === "number" ? SCHEMA_VERSION : null,
    online: typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : null,
  });
  writeSafeErrors(entries);
}

function clearSafeErrors() {
  try { localStorage.removeItem(SAFE_ERROR_STORAGE_KEY); return true; }
  catch (_error) { return false; }
}

function safeErrorSummary() {
  const entries = readSafeErrors();
  const byCode = {};
  entries.forEach((item) => { byCode[item.code] = (byCode[item.code] || 0) + 1; });
  return {
    generatedAt: new Date().toISOString(),
    appVersion: SAFE_ERROR_APP_VERSION,
    schema: typeof SCHEMA_VERSION === "number" ? SCHEMA_VERSION : null,
    retentionDays: 30,
    automaticUpload: false,
    total: entries.length,
    firstAt: entries.length ? new Date(entries[0].at).toISOString() : null,
    lastAt: entries.length ? new Date(entries[entries.length - 1].at).toISOString() : null,
    counts: Object.keys(byCode).sort().map((code) => ({ code, count: byCode[code] })),
  };
}

function installSafeErrorCapture() {
  if (typeof window === "undefined" || window.__safeErrorCaptureInstalled) return;
  window.__safeErrorCaptureInstalled = true;
  window.addEventListener("error", (event) => reportSafeError("events", event && event.error, "global_error"));
  window.addEventListener("unhandledrejection", (event) => reportSafeError("events", event && event.reason, "unhandled_rejection"));
}

installSafeErrorCapture();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SAFE_ERROR_STORAGE_KEY, SAFE_ERROR_RETENTION_MS, SAFE_ERROR_LIMIT,
    normalizeSafeErrorEntries, reportSafeError, readSafeErrors, clearSafeErrors, safeErrorSummary,
  };
}
