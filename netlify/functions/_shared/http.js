"use strict";

const MAX_BODY_BYTES = 6 * 1024 * 1024;

function headersOf(event) {
  const out = {};
  Object.entries((event && event.headers) || {}).forEach(([key, value]) => { out[String(key).toLowerCase()] = String(value); });
  return out;
}

function cookiesOf(event) {
  const raw = headersOf(event).cookie || "";
  return raw.split(";").reduce((out, part) => {
    const at = part.indexOf("=");
    if (at < 1) return out;
    try { out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim()); } catch (_) {}
    return out;
  }, {});
}

function siteOrigin(event) {
  const h = headersOf(event);
  const host = (h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const proto = (h["x-forwarded-proto"] || (local ? "http" : "https")).split(",")[0].trim();
  return host ? `${proto}://${host}`.replace(/\/+$/, "") : "";
}

function allowedOrigins(event) {
  const configured = String(process.env.ALLOWED_ORIGIN || "").split(",").map((v) => v.trim().replace(/\/+$/, "")).filter(Boolean);
  const own = siteOrigin(event);
  return configured.length ? configured : (own ? [own] : []);
}

function assertSameOrigin(event) {
  const h = headersOf(event);
  const origin = String(h.origin || "").replace(/\/+$/, "");
  if (!origin || allowedOrigins(event).indexOf(origin) < 0) {
    const error = new Error("Origem não autorizada");
    error.statusCode = 403;
    error.code = "origin_denied";
    throw error;
  }
  return origin;
}

function readJson(event, maxBytes = MAX_BODY_BYTES) {
  const body = event && event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String((event && event.body) || "");
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    const error = new Error("Corpo acima do limite");
    error.statusCode = 413;
    error.code = "body_too_large";
    throw error;
  }
  if (!body) return {};
  try { return JSON.parse(body); }
  catch (_) {
    const error = new Error("JSON inválido");
    error.statusCode = 400;
    error.code = "invalid_json";
    throw error;
  }
}

function secureCookie(event) {
  return siteOrigin(event).startsWith("https://") || process.env.NODE_ENV === "production";
}

function cookie(name, value, event, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value || "")}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secureCookie(event)) parts.push("Secure");
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join("; ");
}

function clearCookie(name, event) { return cookie(name, "", event, { maxAge: 0 }); }

function json(statusCode, body, options = {}) {
  const response = {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  };
  if (options.cookies && options.cookies.length) response.multiValueHeaders = { "Set-Cookie": options.cookies };
  return response;
}

function safeFailure(error) {
  const known = error && error.code;
  const statusCode = Number(error && error.statusCode) || 500;
  const message = statusCode >= 500 ? "Não foi possível concluir a operação." : (error.message || "Requisição inválida.");
  return json(statusCode, { ok: false, code: known || "server_error", message });
}

function deviceIdOf(event) {
  const value = headersOf(event)["x-device-id"] || "";
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(value)) {
    const error = new Error("Identificação do dispositivo inválida");
    error.statusCode = 400;
    error.code = "invalid_device";
    throw error;
  }
  return value;
}

module.exports = { MAX_BODY_BYTES, headersOf, cookiesOf, siteOrigin, assertSameOrigin, readJson, cookie, clearCookie, json, safeFailure, deviceIdOf };
