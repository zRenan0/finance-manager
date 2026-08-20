"use strict";

const crypto = require("crypto");
const api = require("./_shared/supabase-rest");
const { headersOf, cookiesOf, siteOrigin, assertSameOrigin, readJson, cookie, clearCookie, json, safeFailure, deviceIdOf } = require("./_shared/http");
const rateLimit = require("./_shared/rate-limit");

const ACCESS = "cofre_access";
const REFRESH = "cofre_refresh";
const VERIFIER = "cofre_pkce";
const DEVICE_SECRET = "cofre_device";
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_ATTEMPTS = 30;

// O COOKIE DO FLUXO PRECISA DURAR O QUE O LINK DURA.
//
// Eram 10 minutos. O link que o Supabase manda por email vale 24 horas, e é
// esse cookie que guarda o verificador PKCE sem o qual o código do link não
// vira sessão. Resultado: quem abrisse o email 11 minutos depois (ou seja,
// quase todo mundo) recebia "Link expirado ou inválido" para um link que
// ainda estava perfeitamente válido do outro lado. O prazo agora acompanha o
// do provedor.
const VERIFIER_MAX_AGE = 60 * 60 * 24;

function actionOf(event) {
  const fromQuery = event && event.queryStringParameters && event.queryStringParameters.action;
  if (fromQuery) return String(fromQuery).split("/")[0];
  const path = String(event.path || event.rawPath || "").replace(/\/+$/, "");
  return path.split("/").pop() || "session";
}
function emailOf(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Informe um email válido"), { statusCode: 400, code: "invalid_email" });
  return email;
}
function passwordOf(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) throw Object.assign(new Error("A senha precisa ter entre 10 e 128 caracteres"), { statusCode: 400, code: "invalid_password" });
  return password;
}
// O limitador em memória saiu daqui. Ele zerava a cada cold start e não era
// compartilhado entre instâncias, então o teto real era o configurado
// multiplicado pelo número de instâncias ativas. Ver `_shared/rate-limit.js`.

// O ENDEREÇO DE RETORNO DO EMAIL PRECISA SER O DO APLICATIVO, NÃO O DA RAIZ.
//
// A raiz do domínio passou a servir a página comercial (ver as reescritas de
// vercel.json). Quem lê o parâmetro `code` e conclui o fluxo é
// `bootstrapAccount()` em js/auth.js, que só existe dentro do pacote que
// `index.html` carrega; a landing não carrega esse código. Apontar o retorno
// para "/" entregava quem clicou no link do email na página de marketing,
// onde nada acontece: o código expirava sem ser trocado, o cadastro nunca
// confirmava e a recuperação de senha nunca abria o formulário de nova senha.
//
// `siteOrigin()` devolve a origem já sem barra final (ele termina com
// `.replace(/\/+$/, "")`), então a barra escrita aqui é a única que entra:
// não há como sair "https://dominio//index.html".
//
// `/index.html` continua sendo o endereço público do aplicativo. O `app.html`
// do `dist/` é nome de arquivo interno, destino de uma reescrita, e não pode
// aparecer em link nenhum.
function appCallbackUrl(event, purpose) {
  return `${siteOrigin(event)}/index.html?auth_callback=${purpose}`;
}
function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
// EMAIL CONFIRMADO É PRÉ-REQUISITO DE SESSÃO, NÃO DECORAÇÃO.
//
// O backend nunca olhava para isto. A tela dizia "Confira seu email para
// confirmar o cadastro" e, logo em seguida, `login` entregava a sessão do
// mesmo jeito: a confirmação existia só na frase. Quem decidia era o Supabase,
// e a decisão dele mudava com uma chave do painel que o aplicativo não vê.
//
// `confirmed_at` é o campo antigo e `email_confirmed_at` o atual; um projeto
// com auto-confirmação preenche os dois no cadastro, então esta checagem não
// atrapalha quem escolheu não exigir confirmação.
function emailConfirmed(user) {
  return !!(user && (user.email_confirmed_at || user.confirmed_at));
}

function requireConfirmedEmail(user) {
  if (emailConfirmed(user)) return;
  throw Object.assign(new Error("Este email ainda não foi confirmado. Abra o link que enviamos ou peça um novo."), {
    statusCode: 403, code: "email_not_confirmed",
  });
}

function sessionCookies(event, session) {
  return [cookie(ACCESS, session.access_token, event, { maxAge: Math.min(Number(session.expires_in) || 3600, 3600) }), cookie(REFRESH, session.refresh_token, event, { maxAge: 60 * 60 * 24 * 30 })];
}
function clearSession(event) { return [clearCookie(ACCESS, event), clearCookie(REFRESH, event), clearCookie(VERIFIER, event), clearCookie(DEVICE_SECRET, event)]; }

async function sessionOf(event) {
  const values = cookiesOf(event);
  if (!values[ACCESS] && !values[REFRESH]) return null;
  if (values[ACCESS]) {
    try { return { token: values[ACCESS], user: await api.auth.user(values[ACCESS]), cookies: [] }; } catch (_) {}
  }
  if (!values[REFRESH]) return null;
  try {
    const renewed = await api.auth.refresh(values[REFRESH]);
    return { token: renewed.access_token, user: renewed.user || await api.auth.user(renewed.access_token), cookies: sessionCookies(event, renewed) };
  } catch (_) { return null; }
}

function deviceSecretHash(secret) { return crypto.createHash("sha256").update(String(secret)).digest("hex"); }

async function touchDevice(userId, event, allowCreate = false) {
  const deviceId = deviceIdOf(event);
  const label = String(headersOf(event)["x-device-label"] || "Este dispositivo").replace(/[<>\u0000-\u001f]/g, "").slice(0, 50) || "Este dispositivo";
  let secret = String(cookiesOf(event)[DEVICE_SECRET] || "");
  let setSecret = false;
  const path = `cofre_devices?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}&select=device_id,secret_hash,revoked_at`;
  const existing = await api.db(path, { service: true });
  const row = existing && existing[0];
  const matches = !!(row && secret && row.secret_hash === deviceSecretHash(secret));
  if (!row && !allowCreate) throw Object.assign(new Error("Este dispositivo precisa entrar novamente"), { statusCode: 403, code: "device_unknown" });
  if (row && (!matches || row.revoked_at) && !allowCreate) {
    throw Object.assign(new Error("Este dispositivo teve o acesso revogado"), { statusCode: 403, code: "device_revoked" });
  }
  if (!secret || !matches || (row && row.revoked_at)) { secret = crypto.randomBytes(32).toString("base64url"); setSecret = true; }
  const now = new Date().toISOString();
  if (row) {
    await api.db(`cofre_devices?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}`, { method: "PATCH", service: true, body: { label, secret_hash: deviceSecretHash(secret), last_seen_at: now, revoked_at: null }, headers: { Prefer: "return=minimal" } });
  } else {
    await api.db("cofre_devices", { method: "POST", service: true, body: { user_id: userId, device_id: deviceId, secret_hash: deviceSecretHash(secret), label, last_seen_at: now }, headers: { Prefer: "return=minimal" } });
  }
  return { deviceId, cookies: setSecret ? [cookie(DEVICE_SECRET, secret, event, { maxAge: 60 * 60 * 24 * 365 })] : [] };
}

async function requireSession(event) {
  const session = await sessionOf(event);
  if (!session) throw Object.assign(new Error("Sua sessão expirou"), { statusCode: 401, code: "session_expired" });
  // Vale para tudo que exige sessão, inclusive a sincronização: dados de uma
  // conta não confirmada não sobem para o servidor.
  requireConfirmedEmail(session.user);
  const device = await touchDevice(session.user.id, event, false);
  session.cookies.push(...device.cookies);
  return session;
}

async function handler(event) {
  try {
    const cfg = api.config();
    const action = actionOf(event);
    const method = String(event.httpMethod || "GET").toUpperCase();
    if (!cfg.configured) return json(200, { ok: true, configured: false, authenticated: false });
    if (method !== "GET") assertSameOrigin(event);
    // Limite compartilhado entre instâncias e persistido (ver _shared/rate-limit.js).
    if (["register", "login", "recover", "resend", "exchange", "password", "delete"].includes(action)) {
      await rateLimit.enforce(event, { bucket: "conta", limit: RATE_MAX_ATTEMPTS, windowSeconds: RATE_WINDOW_SECONDS });
    }

    if (action === "session" && method === "GET") {
      const session = await sessionOf(event);
      if (!session) return json(200, { ok: true, configured: true, authenticated: false }, { cookies: clearSession(event) });
      // Sessão de email não confirmado não é sessão. Só recusar no `login`
      // deixaria passar o que já tivesse sido emitido antes desta regra.
      if (!emailConfirmed(session.user)) {
        return json(200, { ok: true, configured: true, authenticated: false, pendingConfirmation: true, email: session.user.email || "" }, { cookies: clearSession(event) });
      }
      const device = await touchDevice(session.user.id, event, false);
      return json(200, { ok: true, configured: true, authenticated: true, email: session.user.email || "", userId: session.user.id, deviceId: device.deviceId }, { cookies: [...session.cookies, ...device.cookies] });
    }
    if (action === "register" && method === "POST") {
      const body = readJson(event, 16 * 1024); const flow = pkce();
      const email = emailOf(body.email);
      const result = await api.auth.signUp(email, passwordOf(body.password), appCallbackUrl(event, "signup"), flow.challenge);
      const cookies = [cookie(VERIFIER, `signup:${flow.verifier}`, event, { maxAge: VERIFIER_MAX_AGE })];
      if (result.access_token) { const device = await touchDevice(result.user.id, event, true); cookies.push(...sessionCookies(event, result), ...device.cookies); }
      // `email` volta do que foi PEDIDO, não do que o Supabase devolveu: para
      // um endereço que já tem conta ele responde com um usuário fabricado, e
      // é esse endereço que a tela precisa para oferecer o reenvio.
      return json(200, { ok: true, configured: true, authenticated: !!result.access_token, confirmationRequired: !result.access_token, email: result.access_token && result.user ? (result.user.email || email) : email, userId: result.access_token && result.user ? result.user.id || "" : "" }, { cookies });
    }
    if (action === "login" && method === "POST") {
      const body = readJson(event, 16 * 1024); const result = await api.auth.signIn(emailOf(body.email), passwordOf(body.password));
      requireConfirmedEmail(result.user);
      const device = await touchDevice(result.user.id, event, true);
      return json(200, { ok: true, configured: true, authenticated: true, email: result.user.email || "", userId: result.user.id, deviceId: device.deviceId }, { cookies: [...sessionCookies(event, result), ...device.cookies] });
    }
    if (action === "recover" && method === "POST") {
      const body = readJson(event, 16 * 1024); const flow = pkce();
      try { await api.auth.recover(emailOf(body.email), appCallbackUrl(event, "recovery"), flow.challenge); } catch (_) {}
      return json(200, { ok: true, sent: true }, { cookies: [cookie(VERIFIER, `recovery:${flow.verifier}`, event, { maxAge: VERIFIER_MAX_AGE })] });
    }
    // REENVIAR A CONFIRMAÇÃO.
    //
    // Sem esta rota não havia saída para o email que não chega: cadastrar de
    // novo devolve a mesma resposta opaca que o Supabase dá para endereço já
    // existente, e nenhum link novo sai. A falha de ENVIO sobe (é ela que diz
    // "o SMTP não está configurado"); o que não sobe é o que revelaria se o
    // endereço tem conta.
    if (action === "resend" && method === "POST") {
      const body = readJson(event, 16 * 1024); const flow = pkce();
      const email = emailOf(body.email);
      const cookies = [cookie(VERIFIER, `signup:${flow.verifier}`, event, { maxAge: VERIFIER_MAX_AGE })];
      try { await api.auth.resend(email, appCallbackUrl(event, "signup"), flow.challenge); }
      catch (error) {
        // "já confirmado" e "não existe" saem com a MESMA resposta de sucesso
        // que o envio de verdade: a diferença entre as duas é exatamente o que
        // transformaria esta rota em sonda de quem tem conta aqui.
        if (!error || (error.code !== "already_confirmed" && error.code !== "user_not_found")) throw error;
      }
      return json(200, { ok: true, sent: true }, { cookies });
    }
    if (action === "exchange" && method === "POST") {
      const body = readJson(event, 16 * 1024); const stored = String(cookiesOf(event)[VERIFIER] || "");
      const at = stored.indexOf(":");
      if (!body.code) throw Object.assign(new Error("O link não trouxe um código válido."), { statusCode: 400, code: "invalid_callback" });
      // SEM O COOKIE, O LINK NÃO FALHOU: ELE FOI ABERTO EM OUTRO LUGAR.
      //
      // O verificador PKCE vive neste navegador. Abrir o email no celular
      // depois de cadastrar no computador é o caso comum, e o servidor do
      // Supabase JÁ confirmou o email antes de redirecionar para cá. Dizer
      // "link expirado" ali é falso e manda a pessoa pedir outro link que
      // também não vai resolver. Quem trata a diferença entre cadastro e
      // recuperação é a tela, que conhece o `auth_callback` do endereço.
      if (at < 1) throw Object.assign(new Error("Este link foi aberto em outro navegador."), { statusCode: 400, code: "verifier_missing" });
      const purpose = stored.slice(0, at); const result = await api.auth.exchange(String(body.code).slice(0, 2048), stored.slice(at + 1));
      const device = await touchDevice(result.user.id, event, true);
      return json(200, { ok: true, authenticated: true, purpose, email: result.user.email || "", userId: result.user.id }, { cookies: [...sessionCookies(event, result), ...device.cookies, clearCookie(VERIFIER, event)] });
    }
    if (action === "logout" && method === "POST") {
      const session = await sessionOf(event); if (session) { try { await api.auth.logout(session.token); } catch (_) {} }
      return json(200, { ok: true, authenticated: false }, { cookies: clearSession(event) });
    }
    if (action === "password" && method === "POST") {
      const session = await requireSession(event); const body = readJson(event, 16 * 1024);
      await api.auth.updateUser(session.token, { password: passwordOf(body.password) });
      return json(200, { ok: true }, { cookies: session.cookies });
    }
    if (action === "devices" && method === "GET") {
      const session = await requireSession(event); const current = deviceIdOf(event);
      const rows = await api.db("cofre_devices?select=device_id,label,first_seen_at,last_seen_at,revoked_at&order=last_seen_at.desc", { token: session.token });
      return json(200, { ok: true, devices: (rows || []).map((row) => ({ id: row.device_id, label: row.label, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, current: row.device_id === current })) }, { cookies: session.cookies });
    }
    if (action === "revoke-device" && method === "POST") {
      const session = await requireSession(event); const body = readJson(event, 16 * 1024); const target = String(body.deviceId || "");
      if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(target)) throw Object.assign(new Error("Dispositivo inválido"), { statusCode: 400, code: "invalid_device" });
      await api.db(`cofre_devices?user_id=eq.${encodeURIComponent(session.user.id)}&device_id=eq.${encodeURIComponent(target)}`, { method: "PATCH", service: true, body: { revoked_at: new Date().toISOString() }, headers: { Prefer: "return=minimal" } });
      const isCurrent = target === deviceIdOf(event);
      return json(200, { ok: true, currentRevoked: isCurrent }, { cookies: isCurrent ? clearSession(event) : session.cookies });
    }
    if (action === "delete" && method === "POST") {
      const session = await requireSession(event); const body = readJson(event, 16 * 1024);
      if (body.confirmation !== "APAGAR CONTA") throw Object.assign(new Error("Digite APAGAR CONTA para confirmar"), { statusCode: 400, code: "confirmation_required" });
      await api.auth.signIn(session.user.email, passwordOf(body.password));

      // A ORDEM IMPORTA.
      //
      // Apagar só o usuário do Auth e confiar no cascade deixa uma janela
      // aberta: um outro aparelho com ciclo de sincronização em andamento pode
      // gravar entre a exclusão e a propagação, e os dados voltam a existir sob
      // um usuário que já não existe.
      //
      // `cofre_purge_account` revoga TODOS os aparelhos no mesmo ato em que
      // apaga operações, estado, checkpoints e mutações. Depois disso nenhum
      // aparelho consegue gravar, porque `cofre_apply_ops` recusa dispositivo
      // revogado. Só então o usuário do Auth é removido.
      let purge = null;
      try {
        const rows = await api.db("rpc/cofre_purge_account", {
          method: "POST", service: true, body: { p_user_id: session.user.id },
        });
        purge = Array.isArray(rows) ? rows[0] : rows;
      } catch (error) {
        throw Object.assign(new Error("Não foi possível apagar os dados da conta. Nada foi removido."), {
          statusCode: 502, code: "purge_failed",
        });
      }

      await api.auth.deleteUser(session.user.id);
      return json(200, {
        ok: true, deleted: true,
        removed: {
          operations: Number(purge && purge.removed_ops) || 0,
          devices: Number(purge && purge.removed_devices) || 0,
        },
      }, { cookies: clearSession(event) });
    }
    return json(404, { ok: false, code: "not_found", message: "Rota não encontrada" });
  } catch (error) {
    const failure = safeFailure(error);
    if (error && (error.code === "device_revoked" || error.code === "device_unknown")) failure.multiValueHeaders = { "Set-Cookie": clearSession(event) };
    return failure;
  }
}

module.exports = { handler, sessionOf, requireSession };
