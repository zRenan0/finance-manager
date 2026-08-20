"use strict";

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  return { url, publicKey, serviceKey, configured: /^https:\/\//.test(url) && !!publicKey && !!serviceKey };
}

async function request(path, options = {}) {
  const cfg = config();
  if (!cfg.configured) {
    const error = new Error("Backend de contas não configurado");
    error.statusCode = 503;
    error.code = "not_configured";
    throw error;
  }
  const key = options.service ? cfg.serviceKey : cfg.publicKey;
  if (!key) {
    const error = new Error("Credencial do servidor ausente");
    error.statusCode = 503;
    error.code = "not_configured";
    throw error;
  }
  const headers = { apikey: key, Accept: "application/json", ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  else if (options.service) headers.Authorization = `Bearer ${key}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${cfg.url}${path}`, {
      method: options.method || "GET", headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal, cache: "no-store",
    });
  } catch (_) {
    const error = new Error("O serviço de conta não respondeu");
    error.statusCode = 502;
    error.code = "upstream_unavailable";
    throw error;
  } finally { clearTimeout(timer); }
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (_) { body = null; } }
  if (!response.ok) {
    const error = new Error(response.status === 429 ? "Muitas tentativas. Aguarde e tente novamente." : "A operação foi recusada.");
    error.statusCode = response.status === 429 ? 429 : (response.status === 401 ? 401 : 400);
    error.code = response.status === 429 ? "rate_limited" : (response.status === 401 ? "invalid_session" : "request_rejected");
    error.upstream = body;
    throw error;
  }
  return body;
}

const auth = {
  signUp(email, password, redirectTo, challenge) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    return request(`/auth/v1/signup${query}`, { method: "POST", body: { email, password, code_challenge: challenge, code_challenge_method: "s256" } });
  },
  signIn(email, password) { return request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }); },
  refresh(refreshToken) { return request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } }); },
  exchange(code, verifier) { return request("/auth/v1/token?grant_type=pkce", { method: "POST", body: { auth_code: code, code_verifier: verifier } }); },
  recover(email, redirectTo, challenge) {
    return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: { email, code_challenge: challenge, code_challenge_method: "s256" } });
  },
  user(token) { return request("/auth/v1/user", { token }); },
  updateUser(token, body) { return request("/auth/v1/user", { method: "PUT", token, body }); },
  logout(token) { return request("/auth/v1/logout?scope=local", { method: "POST", token, body: {} }); },
  deleteUser(userId) { return request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", service: true }); },
};

function db(path, { method = "GET", token, body, headers, service = false } = {}) {
  return request(`/rest/v1/${path}`, { method, token, body, headers, service });
}

module.exports = { config, request, auth, db };
