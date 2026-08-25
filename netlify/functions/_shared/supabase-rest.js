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
  bad_jwt:                    { statusCode: 401, code: "bad_jwt",               message: "A sessão não é mais válida." },
  refresh_token_not_found:    { statusCode: 401, code: "refresh_token_not_found", message: "A sessão não é mais válida." },
  refresh_token_already_used: { statusCode: 401, code: "refresh_token_already_used", message: "A sessão não é mais válida." },
  session_not_found:          { statusCode: 401, code: "session_not_found",     message: "A sessão não é mais válida." },
  session_expired:            { statusCode: 401, code: "session_expired",       message: "A sessão expirou." },
  request_timeout:            { statusCode: 504, code: "request_timeout",       message: "O serviço de conta demorou demais para responder." },
  conflict:                   { statusCode: 409, code: "conflict",              message: "O serviço de conta recebeu pedidos concorrentes. Tente novamente." },
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
  if (status === 408) return { statusCode: 504, code: "request_timeout", message: "O serviço de conta demorou demais para responder." };
  if (status >= 500) return { statusCode: status, code: "upstream_unavailable", message: "O serviço de conta não respondeu corretamente." };
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
  try {
    let response;
    let text;
    try {
      response = await fetch(`${cfg.url}${path}`, {
        method: options.method || "GET", headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal, cache: "no-store",
      });
      // O fetch resolve ao receber os cabeçalhos. O mesmo limite precisa
      // continuar valendo enquanto o corpo chega, ou uma resposta incompleta
      // prende toda a renovação de sessão até a função ser encerrada.
      text = await response.text();
    } catch (cause) {
      const timedOut = !!(cause && cause.name === "AbortError");
      const error = new Error(timedOut
        ? "O serviço de conta demorou demais para responder"
        : "O serviço de conta não respondeu");
      error.statusCode = timedOut ? 504 : 502;
      error.code = timedOut ? "request_timeout" : "upstream_unavailable";
      throw error;
    }
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
  } finally {
    clearTimeout(timer);
  }
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
  // CONFIRMACAO PELO TOKEN DO PROPRIO LINK, SEM PASSAR PELO DOMINIO DO SUPABASE.
  //
  // O caminho `code` + PKCE exige que o verificador esteja no navegador que
  // pediu o link, e o link mora em `<projeto>.supabase.co`. Isso custa duas
  // coisas: o email sai com remetente de um dominio e link de outro, que os
  // filtros de spam leem como phishing; e abrir o email no celular depois de
  // cadastrar no computador nao conclui, porque o cookie ficou no computador.
  //
  // O `token_hash` viaja DENTRO do link. Nao ha estado guardado deste lado, e
  // por isso o link vale em qualquer aparelho. E o mesmo caminho que o
  // `verifyOtp({ token_hash, type })` do supabase-js usa.
  verifyToken(tokenHash, type) {
    return request("/auth/v1/verify", { method: "POST", body: { type, token_hash: tokenHash } });
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
