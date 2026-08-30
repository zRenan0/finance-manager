"use strict";

const crypto = require("crypto");
const api = require("./_shared/supabase-rest");
const { headersOf, cookiesOf, canonicalOrigin, assertSameOrigin, readJson, cookie, clearCookie, json, safeFailure, deviceIdOf } = require("./_shared/http");
const rateLimit = require("./_shared/rate-limit");

const ACCESS = "cofre_access";
const REFRESH = "cofre_refresh";
const VERIFIER = "cofre_pkce";
const DEVICE_SECRET = "cofre_device";
// [M6] MARCA DE QUE ESTA SESSÃO VEIO DE UM LINK DE RECUPERAÇÃO.
//
// Trocar a senha exige provar quem você é DE NOVO, e existem duas provas
// possíveis: a senha atual, ou o link que só chega na caixa de entrada do dono
// do endereço. O segundo caso é justamente aquele em que a senha atual não
// pode ser exigida, porque quem pediu recuperação a esqueceu.
//
// Este cookie é a prova do segundo caso, emitida pelo servidor no momento em
// que o link é consumido (`verify` e `exchange`), com validade curta. Ele não
// carrega nada além da finalidade: é `HttpOnly`, o cliente não o lê nem o
// escreve, e sem ele `/account/password` volta a exigir a senha atual.
// A janela é menor que a da sessão de propósito, mas não apertada: quem clica
// no link, se distrai e volta ainda precisa conseguir terminar. Trinta minutos
// não afrouxam nada de verdade: quem tem esta marca já tem os cookies da
// sessão de recuperação, que valem mais e duram mais.
const RECOVERY = "cofre_recovery";
const RECOVERY_MAX_AGE = 30 * 60;
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_ATTEMPTS = 30;
const DEVICE_TYPES = new Set(["desktop", "phone", "tablet", "unknown"]);
const TERMINAL_SESSION_CODES = new Set([
  "invalid_session", "invalid_credentials", "bad_jwt", "user_not_found",
  "refresh_token_not_found", "refresh_token_already_used",
  "session_not_found", "session_expired",
]);
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TETO POR CONTA, ALÉM DO TETO POR ENDEREÇO.
//
// Contar por endereço não protege conta nenhuma. Um ataque distribuído chega
// com um endereço novo a cada tentativa e nunca encosta naquele teto; e, do
// outro lado, todo mundo atrás do mesmo CGNAT divide as 30 tentativas sem ter
// feito nada. O que fecha a porta da força bruta é contar pelo EMAIL, que é o
// alvo, não pela origem, que é circunstância.
//
// O preço é conhecido e aceito: quem souber o email de alguém consegue gastar
// as tentativas daquela conta e atrasar o dono por alguns minutos. Uma janela
// curta, que se refaz sozinha, custa isso. Um bloqueio que exige alguém
// destravar custaria muito mais, e transformaria o incômodo em ataque.
//
// O email NÃO é gravado: `rateLimit` faz HMAC com segredo do servidor antes de
// qualquer coisa chegar ao banco. O balde entra no hash junto, então nem
// cruzar a mesma conta entre finalidades diferentes a tabela permite.
const RATE_EMAIL_MAX_ATTEMPTS = 10;

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

// [M6] A REGRA DE SENHA NOVA É OUTRA FUNÇÃO, E ISSO NÃO É DETALHE.
//
// `passwordOf` é usada TAMBÉM no login e na reautenticação da exclusão. Se as
// regras abaixo entrassem lá, todo mundo que já tem uma senha que não as
// atende ficaria trancado para fora da própria conta no dia da publicação: a
// checagem roda antes de falar com o provedor, então nem a senha certa passaria.
// Regra nova vale para senha NOVA. Quem já entrou continua entrando.
//
// O QUE ESTAS REGRAS DELIBERADAMENTE NÃO FAZEM: exigir maiúscula, número e
// símbolo. O NIST SP 800-63B recomenda contra isso desde 2017, e por um motivo
// medido: composição obrigatória empurra as pessoas para `Senha@2024`, que é
// pior do que uma frase longa. O que ele recomenda é o que está aqui:
// comprimento, lista de proibidas e palavras do contexto do usuário.
//
// Esta lista é o piso que continua valendo mesmo com a checagem contra
// vazamentos (HaveIBeenPwned) do provedor DESLIGADA. Com ela ligada, o
// provedor recusa muito mais; ver o M6 em FINANCEMANAGER_AUDIT_PROGRESS.md.
const SENHAS_PROIBIDAS = new Set([
  "senha123456", "1234567890", "0123456789", "senhasenha", "password12",
  "password123", "qwertyuiop", "administrador", "admin123456", "123456789012",
  "minhasenha", "minhasenha1", "brasil123456", "corinthians", "flamengo123",
  "financeiro1", "abcd123456", "aaaaaaaaaa", "1q2w3e4r5t", "!@#$%^&*()",
  "iloveyou123", "senha123abc", "trocar123456", "mudar123456", "teste123456",
]);
const SEQUENCIAS = [
  "abcdefghijklmnopqrstuvwxyz",
  "01234567890",
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
];
function ehSequencia(texto) {
  return SEQUENCIAS.some((linha) => {
    const invertida = linha.split("").reverse().join("");
    return linha.includes(texto) || invertida.includes(texto);
  });
}
function senhaNovaOf(value, email) {
  const senha = passwordOf(value);
  const plana = senha.toLowerCase();
  const recusar = (mensagem) => {
    throw Object.assign(new Error(mensagem), { statusCode: 400, code: "weak_password" });
  };
  if (SENHAS_PROIBIDAS.has(plana)) recusar("Esta senha é conhecida demais. Escolha outra.");
  if (/^(.)\1+$/.test(senha)) recusar("Uma senha de um caractere só repetido não protege nada. Escolha outra.");
  if (/^\d+$/.test(senha)) recusar("Uma senha só de números é fácil de adivinhar. Misture letras ou use uma frase.");
  if (ehSequencia(plana)) recusar("Esta senha é uma sequência do teclado. Escolha outra.");
  // O nome do endereço de email é a primeira coisa que qualquer ataque tenta.
  const local = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (local.length >= 4 && plana.replace(/[^a-z0-9]/g, "").includes(local)) {
    recusar("A senha não pode conter o seu email. Escolha outra.");
  }
  return senha;
}
// Cobra do balde da CONTA. Vem sempre depois de `emailOf`, para o endereço já
// estar normalizado: senão "Fulano@X.com" e "fulano@x.com" contariam separado e
// o teto seria contornável só trocando a caixa das letras.
function limitarPorEmail(event, email) {
  return rateLimit.enforce(event, {
    bucket: "conta-email", identity: email,
    limit: RATE_EMAIL_MAX_ATTEMPTS, windowSeconds: RATE_WINDOW_SECONDS,
  });
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
// A ORIGEM AQUI NÃO PODE VIR DO CABEÇALHO DA REQUISIÇÃO.
//
// Este endereço sai daqui dentro de um email assinado por nós. Montá-lo a
// partir de `Host`/`X-Forwarded-Host` deixava qualquer um pedir, por `curl`,
// que o provedor mandasse para a vítima um email verdadeiro apontando para o
// domínio do atacante. Quem decide agora é `canonicalOrigin()`, que só aceita
// origem já reconhecida pela configuração; ver _shared/http.js.
//
// `canonicalOrigin()` devolve a origem já sem barra final (as duas funções que
// ele consulta terminam com `.replace(/\/+$/, "")`), então a barra escrita
// aqui é a única que entra: não há como sair "https://dominio//index.html".
//
// `/index.html` continua sendo o endereço público do aplicativo. O `app.html`
// do `dist/` é nome de arquivo interno, destino de uma reescrita, e não pode
// aparecer em link nenhum.
function appCallbackUrl(event, purpose) {
  return `${canonicalOrigin(event)}/index.html?auth_callback=${purpose}`;
}
function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// CONFIRMACAO POR `token_hash`: O LINK NO NOSSO DOMINIO.
//
// Os tipos aceitos sao os que o GoTrue reconhece em `/auth/v1/verify`. A lista
// e fechada porque o valor vem do endereco que o usuario clicou, e repassar
// texto livre para o provedor e como nao validar nada.
const VERIFY_TYPES = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

function verifyTypeOf(value) {
  const type = String(value || "").trim().toLowerCase();
  if (VERIFY_TYPES.indexOf(type) < 0) {
    throw Object.assign(new Error("O link não trouxe um código válido."), { statusCode: 400, code: "invalid_callback" });
  }
  return type;
}

// O formato do hash muda entre versoes do GoTrue (hexadecimal puro nas antigas,
// prefixo `pkce_` nas novas), entao a checagem e de FORMA, nao de tamanho fixo:
// so caracteres que podem aparecer num endereco sem escape, e um teto que
// impede mandar um corpo qualquer para o provedor.
function tokenHashOf(value) {
  const hash = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(hash)) {
    throw Object.assign(new Error("O link não trouxe um código válido."), { statusCode: 400, code: "invalid_callback" });
  }
  return hash;
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
function clearSession(event) { return [clearCookie(ACCESS, event), clearCookie(REFRESH, event), clearCookie(VERIFIER, event), clearCookie(DEVICE_SECRET, event), clearCookie(RECOVERY, event)]; }

// A marca de recuperação vale para UM fluxo. Ou ela é emitida agora, porque o
// link de recuperação acabou de ser consumido, ou é apagada, inclusive num
// login comum, para que uma marca de meia hora atrás não sirva de passe livre.
function recoveryCookies(event, purpose) {
  return purpose === "recovery"
    ? [cookie(RECOVERY, "1", event, { maxAge: RECOVERY_MAX_AGE })]
    : [clearCookie(RECOVERY, event)];
}

function terminalSessionFailure(error) {
  return !!(error && TERMINAL_SESSION_CODES.has(error.code));
}

function sessionRefreshRequired() {
  return Object.assign(new Error("A sessão precisa ser renovada antes de continuar."), {
    statusCode: 401, code: "session_refresh_required",
  });
}

async function sessionOf(event, options = {}) {
  const values = cookiesOf(event);
  const allowRefresh = options.allowRefresh !== false;
  const requireExplicitRefresh = options.refreshRequired === true;
  const withoutRefresh = () => {
    if (values[REFRESH] && requireExplicitRefresh) throw sessionRefreshRequired();
    return null;
  };
  if (!values[ACCESS] && !values[REFRESH]) return null;
  if (values[ACCESS]) {
    try {
      return { token: values[ACCESS], user: await api.auth.user(values[ACCESS]), cookies: [] };
    } catch (error) {
      // Só uma rejeição definitiva do token justifica tentar o refresh. Uma
      // queda do provedor precisa chegar ao cliente como indisponibilidade.
      if (!terminalSessionFailure(error)) throw error;
    }
  }
  if (!allowRefresh) return withoutRefresh();
  if (!values[REFRESH]) return null;
  try {
    const renewed = await api.auth.refresh(values[REFRESH]);
    return { token: renewed.access_token, user: renewed.user || await api.auth.user(renewed.access_token), cookies: sessionCookies(event, renewed) };
  } catch (error) {
    if (terminalSessionFailure(error)) return null;
    throw error;
  }
}

function deviceSecretHash(secret) { return crypto.createHash("sha256").update(String(secret)).digest("hex"); }

// `===` em string sai no primeiro byte diferente, e o tempo até sair conta uma
// parte da resposta. Pela rede isso é ruído quase puro, mas a troca custa uma
// função e tira o assunto da mesa. O `length` é checado antes porque
// `timingSafeEqual` LANÇA quando os tamanhos diferem, e aí o vazamento
// voltaria pela porta da exceção.
function hashesConferem(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length || !x.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function deviceMetadataOf(event) {
  const headers = headersOf(event);
  const rawLabel = Object.prototype.hasOwnProperty.call(headers, "x-device-label")
    ? String(headers["x-device-label"] || "")
    : "";
  const cleanedLabel = rawLabel.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 50);
  const rawType = String(headers["x-device-type"] || "").trim().toLowerCase();
  return {
    // Ausência e valor que virou vazio depois da limpeza significam
    // "preserve o que já existe", não "troque pelo texto padrão".
    label: cleanedLabel || null,
    type: DEVICE_TYPES.has(rawType) ? rawType : null,
  };
}

function deviceLookupPath(userId, deviceId) {
  return `cofre_devices?user_id=eq.${encodeURIComponent(userId)}`
    + `&device_id=eq.${encodeURIComponent(deviceId)}`
    + "&select=device_id,secret_hash,label,device_type,revoked_at";
}

function deviceAccessError(code) {
  const unknown = code === "device_unknown";
  return Object.assign(new Error(unknown
    ? "Este dispositivo precisa entrar novamente"
    : "Este dispositivo teve o acesso revogado"), {
    statusCode: 403,
    code: unknown ? "device_unknown" : "device_revoked",
  });
}

// Atividade comum nunca cria, reautoriza, troca segredo nem escreve
// `revoked_at`. A condição do PATCH repete tudo que autorizou esta chamada:
// aparelho, segredo e estado ativo. Assim, uma revogação ou um novo login
// que aconteça entre o SELECT e o PATCH faz a atualização retornar zero linhas.
async function touchDevice(userId, event) {
  const deviceId = deviceIdOf(event);
  const secret = String(cookiesOf(event)[DEVICE_SECRET] || "");
  const secretHash = secret ? deviceSecretHash(secret) : "";
  const existing = await api.db(deviceLookupPath(userId, deviceId), { service: true });
  const row = existing && existing[0];
  if (!row) throw deviceAccessError("device_unknown");
  if (row.revoked_at || !secret || !hashesConferem(row.secret_hash, secretHash)) {
    throw deviceAccessError("device_revoked");
  }

  const metadata = deviceMetadataOf(event);
  const body = { last_seen_at: new Date().toISOString() };
  if (metadata.label) body.label = metadata.label;
  if (metadata.type) body.device_type = metadata.type;
  const updated = await api.db(
    `cofre_devices?user_id=eq.${encodeURIComponent(userId)}`
      + `&device_id=eq.${encodeURIComponent(deviceId)}`
      + `&secret_hash=eq.${secretHash}&revoked_at=is.null&select=device_id`,
    {
      method: "PATCH", service: true, body,
      headers: { Prefer: "return=representation" },
    },
  );
  if (!Array.isArray(updated) || !updated[0]) throw deviceAccessError("device_revoked");
  return { deviceId, cookies: [] };
}

// Somente um fluxo que acabou de comprovar a identidade no provedor pode
// chegar aqui. Ele sempre cria um segredo novo, inclusive quando o aparelho já
// estava ativo, tornando inúteis cookies copiados ou revogados anteriormente.
async function authorizeDevice(userId, event) {
  const deviceId = deviceIdOf(event);
  const metadata = deviceMetadataOf(event);
  const existing = await api.db(deviceLookupPath(userId, deviceId), { service: true });
  const row = existing && existing[0];
  const secret = crypto.randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const body = {
    secret_hash: deviceSecretHash(secret),
    label: metadata.label || (row && row.label) || "Este dispositivo",
    device_type: metadata.type || (row && row.device_type) || "unknown",
    last_seen_at: now,
    revoked_at: null,
  };

  if (row) {
    const updated = await api.db(
      `cofre_devices?user_id=eq.${encodeURIComponent(userId)}`
        + `&device_id=eq.${encodeURIComponent(deviceId)}&select=device_id`,
      { method: "PATCH", service: true, body, headers: { Prefer: "return=representation" } },
    );
    if (!Array.isArray(updated) || !updated[0]) {
      throw Object.assign(new Error("O servidor não confirmou este dispositivo"), {
        statusCode: 502, code: "device_authorization_failed",
      });
    }
  } else {
    const inserted = await api.db("cofre_devices?select=device_id", {
      method: "POST", service: true,
      body: { user_id: userId, device_id: deviceId, ...body },
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(inserted) || !inserted[0]) {
      throw Object.assign(new Error("O servidor não confirmou este dispositivo"), {
        statusCode: 502, code: "device_authorization_failed",
      });
    }
  }
  return {
    deviceId,
    cookies: [cookie(DEVICE_SECRET, secret, event, { maxAge: 60 * 60 * 24 * 365 })],
  };
}

function accountIdOf(event) {
  const accountId = String(headersOf(event)["x-account-id"] || "").trim();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw Object.assign(new Error("Identificação da conta inválida"), {
      statusCode: 400, code: "invalid_account_scope",
    });
  }
  return accountId;
}

function accountScopeChanged() {
  return Object.assign(new Error("A conta ativa mudou. Atualize e tente novamente."), {
    statusCode: 403, code: "account_scope_changed",
  });
}

function jwtSubjectOf(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) return "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const subject = String(payload && payload.sub || "").trim();
    return ACCOUNT_ID_PATTERN.test(subject) ? subject : "";
  } catch (_) {
    return "";
  }
}

// O payload ainda NÃO foi autenticado. Portanto ele só pode provar que esta
// chamada deve ser recusada cedo; igualdade nunca autoriza nada e a conta será
// comparada novamente com o usuário devolvido pelo Supabase.
function rejectClaimedAccountMismatch(event, accountId) {
  const claimed = jwtSubjectOf(cookiesOf(event)[ACCESS]);
  if (claimed && claimed.toLowerCase() !== accountId.toLowerCase()) {
    throw accountScopeChanged();
  }
}

async function requireSession(event, options = {}) {
  let accountId = "";
  if (options.accountScope) {
    accountId = accountIdOf(event);
    rejectClaimedAccountMismatch(event, accountId);
  }
  // Rota com escopo nunca rotaciona refresh. Ela pede ao cliente que passe
  // primeiro pelo único ponto de renovação: GET /api/account/session.
  const session = await sessionOf(event, options.accountScope
    ? { allowRefresh: false, refreshRequired: true }
    : undefined);
  if (!session) throw Object.assign(new Error("Sua sessão expirou"), { statusCode: 401, code: "session_expired" });
  // Vale para tudo que exige sessão, inclusive a sincronização: dados de uma
  // conta não confirmada não sobem para o servidor.
  requireConfirmedEmail(session.user);
  // Rotas que recebem o identificador esperado precisam conferir a conta
  // antes até de ler ou atualizar o aparelho. Sem essa ordem, uma resposta da
  // conta B poderia alterar o `last_seen_at` enquanto o cliente já está em A.
  if (options.accountScope) requireAccountScope(event, session, accountId);
  const device = await touchDevice(session.user.id, event);
  session.cookies.push(...device.cookies);
  return session;
}

function requireAccountScope(event, session, preparedAccountId) {
  const accountId = preparedAccountId || accountIdOf(event);
  const expected = String(session && session.user && session.user.id || "");
  if (accountId.toLowerCase() !== expected.toLowerCase()) {
    throw accountScopeChanged();
  }
  return accountId;
}

async function handler(event) {
  try {
    const cfg = api.config();
    const action = actionOf(event);
    const method = String(event.httpMethod || "GET").toUpperCase();
    if (!cfg.configured) return json(200, { ok: true, configured: false, authenticated: false });
    if (method !== "GET") assertSameOrigin(event);
    // Limite compartilhado entre instâncias e persistido (ver _shared/rate-limit.js).
    if (["register", "login", "recover", "resend", "exchange", "verify"].includes(action)) {
      await rateLimit.enforce(event, { bucket: "conta", limit: RATE_MAX_ATTEMPTS, windowSeconds: RATE_WINDOW_SECONDS });
    }

    if (action === "session" && method === "GET") {
      const session = await sessionOf(event);
      if (!session) return json(200, { ok: true, configured: true, authenticated: false });
      // Sessão de email não confirmado não é sessão. Só recusar no `login`
      // deixaria passar o que já tivesse sido emitido antes desta regra.
      if (!emailConfirmed(session.user)) {
        return json(200, { ok: true, configured: true, authenticated: false, pendingConfirmation: true, email: session.user.email || "" });
      }
      const device = await touchDevice(session.user.id, event);
      return json(200, { ok: true, configured: true, authenticated: true, email: session.user.email || "", userId: session.user.id, deviceId: device.deviceId }, { cookies: [...session.cookies, ...device.cookies] });
    }
    if (action === "register" && method === "POST") {
      const body = readJson(event, 16 * 1024); const flow = pkce();
      const email = emailOf(body.email);
      await limitarPorEmail(event, email);
      const result = await api.auth.signUp(email, senhaNovaOf(body.password, email), appCallbackUrl(event, "signup"), flow.challenge);
      const cookies = [cookie(VERIFIER, `signup:${flow.verifier}`, event, { maxAge: VERIFIER_MAX_AGE })];
      if (result.access_token) { const device = await authorizeDevice(result.user.id, event); cookies.push(...sessionCookies(event, result), ...device.cookies); }
      // `email` volta do que foi PEDIDO, não do que o Supabase devolveu: para
      // um endereço que já tem conta ele responde com um usuário fabricado, e
      // é esse endereço que a tela precisa para oferecer o reenvio.
      return json(200, { ok: true, configured: true, authenticated: !!result.access_token, confirmationRequired: !result.access_token, email: result.access_token && result.user ? (result.user.email || email) : email, userId: result.access_token && result.user ? result.user.id || "" : "" }, { cookies });
    }
    if (action === "login" && method === "POST") {
      const body = readJson(event, 16 * 1024);
      const email = emailOf(body.email);
      // ANTES de falar com o provedor: é esta chamada que um ataque de senha
      // repete, e cada repetição que chega ao Supabase já custou uma ida à rede.
      await limitarPorEmail(event, email);
      const result = await api.auth.signIn(email, passwordOf(body.password));
      requireConfirmedEmail(result.user);
      const device = await authorizeDevice(result.user.id, event);
      return json(200, { ok: true, configured: true, authenticated: true, email: result.user.email || "", userId: result.user.id, deviceId: device.deviceId }, { cookies: [...sessionCookies(event, result), ...device.cookies] });
    }
    if (action === "recover" && method === "POST") {
      const body = readJson(event, 16 * 1024); const flow = pkce();
      const email = emailOf(body.email);
      // Teto por endereço de email também aqui: sem ele, esta rota é uma
      // máquina de encher a caixa de entrada de quem nunca pediu nada.
      await limitarPorEmail(event, email);
      try { await api.auth.recover(email, appCallbackUrl(event, "recovery"), flow.challenge); } catch (_) {}
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
      await limitarPorEmail(event, email);
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
    // CAMINHO NOVO: o link do email aponta para o nosso dominio e traz o
    // `token_hash`. Nao consulta cookie nenhum, entao vale no celular depois de
    // cadastrar no computador, que e o caso que o `exchange` abaixo nao cobre.
    // O `exchange` continua existindo porque os links JA ENVIADOS usam ele.
    if (action === "verify" && method === "POST") {
      const body = readJson(event, 16 * 1024);
      const type = verifyTypeOf(body.type);
      const result = await api.auth.verifyToken(tokenHashOf(body.tokenHash), type);
      // Provedor que confirma sem devolver sessao deixaria o aplicativo achando
      // que entrou. Melhor tratar como link gasto e mandar entrar com a senha.
      if (!result || !result.access_token || !result.user || !result.user.id) {
        throw Object.assign(new Error("Este link não vale mais. Entre com seu email e senha."), { statusCode: 400, code: "link_invalid" });
      }
      const device = await authorizeDevice(result.user.id, event);
      const purpose = type === "recovery" ? "recovery" : "signup";
      return json(200, {
        ok: true, authenticated: true, purpose,
        email: result.user.email || "", userId: result.user.id,
      }, { cookies: [...sessionCookies(event, result), ...device.cookies, clearCookie(VERIFIER, event), ...recoveryCookies(event, purpose)] });
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
      const device = await authorizeDevice(result.user.id, event);
      return json(200, { ok: true, authenticated: true, purpose, email: result.user.email || "", userId: result.user.id }, { cookies: [...sessionCookies(event, result), ...device.cookies, clearCookie(VERIFIER, event), ...recoveryCookies(event, purpose)] });
    }
    if (action === "logout" && method === "POST") {
      const sessionValues = cookiesOf(event);
      const hasSessionCookie = !!(sessionValues[ACCESS] || sessionValues[REFRESH]);
      let preparedAccountId = "";
      if (hasSessionCookie) {
        preparedAccountId = accountIdOf(event);
        rejectClaimedAccountMismatch(event, preparedAccountId);
      }
      // Logout explícito sem credenciais continua idempotente. Se ainda existe
      // refresh, porém, não sabemos a qual conta ele pertence sem consumi-lo;
      // nesse caso o cliente precisa renovar em /account/session primeiro.
      const session = await sessionOf(event, {
        allowRefresh: false,
        refreshRequired: hasSessionCookie,
      });
      if (session) {
        requireAccountScope(event, session, preparedAccountId);
        try { await api.auth.logout(session.token); } catch (_) {}
      }
      return json(200, { ok: true, authenticated: false }, { cookies: clearSession(event) });
    }
    // [M6] TROCAR A SENHA PRECISA DE UMA PROVA ALÉM DO COOKIE DE SESSÃO.
    //
    // Antes esta rota trocava a senha com o cookie e mais nada. Quem chegasse a
    // uma sessão viva (o celular destravado que ficou na mesa, um cookie
    // capturado) tomava a conta inteira e trancava o dono do lado de fora, sem
    // nunca ter sabido a senha. O cookie de sessão prova que ALGUÉM entrou; não
    // prova que é o dono, e trocar a senha é a ação que decide quem manda na
    // conta daqui para frente.
    //
    // Duas provas são aceitas, e elas cobrem os dois motivos reais de trocar:
    //
    //   * a SENHA ATUAL, para quem se lembra dela e quer trocar por vontade;
    //   * a MARCA DE RECUPERAÇÃO, para quem esqueceu e acabou de abrir o link
    //     que só chega na caixa de entrada do dono do endereço. Exigir a senha
    //     atual aqui seria exigir justamente o que a pessoa não tem.
    //
    // O limite de tentativas vem ANTES da verificação: senão esta rota vira um
    // oráculo de senha para quem já tem a sessão, sem teto nenhum.
    if (action === "password" && method === "POST") {
      const session = await requireSession(event, { accountScope: true });
      await rateLimit.enforce(event, { bucket: "conta", limit: RATE_MAX_ATTEMPTS, windowSeconds: RATE_WINDOW_SECONDS });
      const body = readJson(event, 16 * 1024);
      const porRecuperacao = String(cookiesOf(event)[RECOVERY] || "") === "1";
      if (!porRecuperacao) {
        const atual = String(body.currentPassword || "");
        if (!atual) {
          throw Object.assign(new Error("Digite sua senha atual para confirmar a troca."), {
            statusCode: 401, code: "reauth_required",
          });
        }
        // Normaliza sem VALIDAR: o endereço vem do provedor, já é válido, e um
        // `emailOf` aqui trocaria "a senha atual não confere" por "informe um
        // email válido" numa tela onde ninguém digitou email nenhum.
        await limitarPorEmail(event, String(session.user.email || "").trim().toLowerCase());
        try { await api.auth.signIn(session.user.email, passwordOf(atual)); }
        catch (error) {
          // A falha de reautenticação não pode virar "sessão inválida" na tela:
          // a sessão está ótima, quem errou foi a senha digitada agora.
          if (error && error.code === "invalid_password") throw error;
          throw Object.assign(new Error("A senha atual não confere."), {
            statusCode: 401, code: "reauth_failed",
          });
        }
      }
      await api.auth.updateUser(session.token, { password: senhaNovaOf(body.password, session.user.email) });
      // A marca de recuperação vale por UMA troca. Mantê-la viva deixaria a
      // janela de 15 minutos aberta para trocas seguintes sem nenhuma prova.
      return json(200, { ok: true }, { cookies: [...session.cookies, clearCookie(RECOVERY, event)] });
    }
    if (action === "devices" && method === "GET") {
      const session = await requireSession(event, { accountScope: true });
      const current = deviceIdOf(event);
      const rows = await api.db("cofre_devices?select=device_id,label,device_type,first_seen_at,last_seen_at&revoked_at=is.null&order=last_seen_at.desc", { token: session.token });
      return json(200, { ok: true, devices: (rows || []).map((row) => ({
        id: row.device_id,
        label: row.label,
        type: DEVICE_TYPES.has(row.device_type) ? row.device_type : "unknown",
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        current: row.device_id === current,
      })) }, { cookies: session.cookies });
    }
    if (action === "revoke-device" && method === "POST") {
      const session = await requireSession(event, { accountScope: true });
      const body = readJson(event, 16 * 1024); const target = String(body.deviceId || "");
      if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$/.test(target)) throw Object.assign(new Error("Dispositivo inválido"), { statusCode: 400, code: "invalid_device" });
      const revoked = await api.db(
        `cofre_devices?user_id=eq.${encodeURIComponent(session.user.id)}`
          + `&device_id=eq.${encodeURIComponent(target)}&revoked_at=is.null&select=device_id`,
        {
          method: "PATCH", service: true,
          body: { revoked_at: new Date().toISOString() },
          headers: { Prefer: "return=representation" },
        },
      );
      if (!Array.isArray(revoked) || !revoked[0]) {
        throw Object.assign(new Error("Este dispositivo não possui acesso ativo"), {
          statusCode: 404, code: "device_not_active",
        });
      }
      const isCurrent = target === deviceIdOf(event);
      return json(200, { ok: true, currentRevoked: isCurrent }, { cookies: isCurrent ? clearSession(event) : session.cookies });
    }
    if (action === "delete" && method === "POST") {
      const session = await requireSession(event, { accountScope: true });
      await rateLimit.enforce(event, { bucket: "conta", limit: RATE_MAX_ATTEMPTS, windowSeconds: RATE_WINDOW_SECONDS });
      const body = readJson(event, 16 * 1024);
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
    return safeFailure(error);
  }
}

module.exports = { handler, sessionOf, requireSession, requireAccountScope, clearSession };
