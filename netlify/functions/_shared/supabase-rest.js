"use strict";

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  return { url, publicKey, serviceKey, configured: /^https:\/\//.test(url) && !!publicKey && !!serviceKey };
}

// ------------------------------------------------------------------------------
// TRADUÇÃO DO ERRO DO SUPABASE
// ------------------------------------------------------------------------------
// Antes, TODA resposta 4xx virava a mesma frase: "A operação foi recusada.".
// Isso apagava justamente a informação que resolve o problema de quem está na
// tela. "Email ainda não confirmado", "email já cadastrado", "teto de envio
// estourado" e "o SMTP recusou a mensagem" chegavam idênticos, e a única saída
// era adivinhar. Foi o que aconteceu com o cadastro: o email não chegava e a
// tela não tinha como dizer por quê.
//
// A lista é FECHADA de propósito. Só o que está aqui vira mensagem própria;
// qualquer outra coisa continua genérica, para não vazar detalhe interno do
// provedor para a rede.
const UPSTREAM_ERRORS = {
  email_not_confirmed:        { statusCode: 403, code: "email_not_confirmed",   message: "Este email ainda não foi confirmado. Abra o link que enviamos ou peça um novo." },
  email_exists:               { statusCode: 409, code: "email_exists",          message: "Este email já tem conta." },
  user_already_exists:        { statusCode: 409, code: "email_exists",          message: "Este email já tem conta." },
  over_email_send_rate_limit: { statusCode: 429, code: "email_rate_limited",    message: "Muitos emails enviados para este endereço. Aguarde alguns minutos e peça de novo." },
  over_request_rate_limit:    { statusCode: 429, code: "rate_limited",          message: "Muitas tentativas. Aguarde e tente novamente." },
  email_address_invalid:      { statusCode: 400, code: "invalid_email",         message: "O servidor não aceitou este endereço de email." },
  weak_password:              { statusCode: 400, code: "weak_password",         message: "Escolha uma senha mais forte." },
  same_password:              { statusCode: 400, code: "same_password",         message: "A nova senha precisa ser diferente da atual." },
  invalid_credentials:        { statusCode: 401, code: "invalid_credentials",   message: "Email ou senha incorretos." },
  otp_expired:                { statusCode: 400, code: "link_expired",          message: "O link do email expirou. Peça um novo." },
  flow_state_expired:         { statusCode: 400, code: "link_expired",          message: "O link do email expirou. Peça um novo." },
  flow_state_not_found:       { statusCode: 400, code: "link_invalid",          message: "Este link não vale mais. Peça um novo." },
  bad_code_verifier:          { statusCode: 400, code: "link_other_browser",    message: "Abra o link no mesmo navegador onde a conta foi criada, ou peça um novo link." },
  user_not_found:             { statusCode: 404, code: "user_not_found",        message: "Não encontramos uma conta com este email." },
  email_provider_disabled:    { statusCode: 503, code: "email_disabled",        message: "O cadastro por email está desligado na configuração do servidor.", exposeMessage: true },
  signup_disabled:            { statusCode: 503, code: "signup_disabled",       message: "O cadastro de novas contas está desligado na configuração do servidor.", exposeMessage: true },
};

// A falha de ENVIO de email não tem código próprio: o GoTrue devolve
// `unexpected_failure` com o texto do servidor de email junto. É a causa mais
// comum de "o email não chega" (SMTP ausente, ou o serviço embutido do
// Supabase, que só entrega para quem é do time do projeto), e precisa ser
// dizível para o dono do site saber onde mexer.
const UPSTREAM_TEXT = [
  [/error sending/i, { statusCode: 502, code: "email_send_failed", message: "O servidor não conseguiu enviar o email. Confira a configuração de SMTP do Supabase.", exposeMessage: true }],
  [/email not confirmed/i, UPSTREAM_ERRORS.email_not_confirmed],
  [/invalid login credentials/i, UPSTREAM_ERRORS.invalid_credentials],
  [/already registered|already exists/i, UPSTREAM_ERRORS.email_exists],
  [/email rate limit exceeded/i, UPSTREAM_ERRORS.over_email_send_rate_limit],
  [/password should be at least|password is too weak/i, UPSTREAM_ERRORS.weak_password],
  [/user already confirmed|already been confirmed/i, { statusCode: 409, code: "already_confirmed", message: "Este email já está confirmado. É só entrar com sua senha." }],
  // O PostgREST responde assim quando a tabela não existe no projeto. Sem esta
  // linha, migração não aplicada e senha errada davam a mesma frase, e a
  // sincronização "com falha" não tinha como apontar para a causa.
  [/could not find the table|schema cache|does not exist/i, { statusCode: 503, code: "schema_missing", message: "O banco do projeto está sem as tabelas desta função. Rode as migrações de supabase/migrations.", exposeMessage: true }],
];

function upstreamFailure(status, body) {
  const codigo = String((body && body.error_code) || "");
  const texto = String((body && (body.msg || body.error_description || body.message || body.error || body.hint)) || "");
  // `hasOwnProperty` e não acesso direto: um corpo com `error_code` valendo
  // "constructor" devolveria uma função do protótipo, e daí sairia um erro sem
  // status nem código.
  const conhecido = (Object.prototype.hasOwnProperty.call(UPSTREAM_ERRORS, codigo) ? UPSTREAM_ERRORS[codigo] : null)
    || (UPSTREAM_TEXT.find(([padrao]) => padrao.test(texto)) || [])[1];
  if (conhecido) return conhecido;
  if (status === 429) return { statusCode: 429, code: "rate_limited", message: "Muitas tentativas. Aguarde e tente novamente." };
  if (status === 401) return { statusCode: 401, code: "invalid_session", message: "A operação foi recusada." };
  return { statusCode: 400, code: "request_rejected", message: "A operação foi recusada." };
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
    const traduzido = upstreamFailure(response.status, body);
    const error = new Error(traduzido.message);
    error.statusCode = traduzido.statusCode;
    error.code = traduzido.code;
    if (traduzido.exposeMessage) error.exposeMessage = true;
    error.upstream = body;
    error.upstreamStatus = response.status;
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
  // Reenvio do email de confirmação. Sem isto, quem não recebeu o primeiro
  // email não tinha saída nenhuma: cadastrar de novo devolve a mesma resposta
  // opaca do Supabase para email já existente, e o link nunca vinha.
  resend(email, redirectTo, challenge) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    return request(`/auth/v1/resend${query}`, { method: "POST", body: { type: "signup", email, code_challenge: challenge, code_challenge_method: "s256" } });
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
