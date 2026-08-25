"use strict";

// test-account-confirmation.js; a confirmação de email precisa VALER.
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//
// A tela dizia "Confira seu email para confirmar o cadastro" e, logo depois,
// entrar funcionava do mesmo jeito, sem nenhuma confirmação. A frase existia,
// a regra não: o backend nunca olhava para `email_confirmed_at`. Quem decidia
// era uma chave do painel do Supabase que o aplicativo não vê, então a mesma
// versão do código se comportava de dois jeitos opostos conforme o projeto.
//
// Junto com isso, três coisas deixavam o cadastro sem saída quando o email não
// chegava:
//
//   1. o cookie do fluxo PKCE durava 10 minutos, e o link do email dura 24
//      horas: um link válido morria sozinho para quem abrisse o email tarde;
//   2. abrir o link em outro navegador dava "Link expirado ou inválido", que é
//      falso: o Supabase JÁ confirmou o email antes de redirecionar;
//   3. não existia reenvio, e cadastrar de novo devolve a mesma resposta opaca
//      que o Supabase dá para endereço já cadastrado, sem disparar email nenhum.
//
// COMO ESTE ARQUIVO MEDE
//
// Executando o handler de verdade, com o Supabase substituído por espiões. O
// que se afirma é o status, o código e os cookies que ele realmente devolveu.

const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const HOST = "cofre.test";
const ORIGEM = `https://${HOST}`;
const USER = "00000000-0000-4000-8000-000000000042";
const SENHA = "senha-segura-123";
const EMAIL = "pessoa@example.com";

function event(method, action, body, extra) {
  return {
    httpMethod: method,
    path: `/api/account/${action}`,
    queryStringParameters: { action },
    headers: {
      origin: ORIGEM, host: HOST, "x-forwarded-proto": "https",
      "x-device-id": "device-confirm-1234", ...(extra || {}),
    },
    body: body == null ? null : JSON.stringify(body),
  };
}

const cookiesDe = (resposta) => (resposta.multiValueHeaders && resposta.multiValueHeaders["Set-Cookie"]) || [];
function maxAgeDe(cookies, nome) {
  const linha = cookies.find((valor) => String(valor).startsWith(`${nome}=`)) || "";
  const achado = linha.match(/Max-Age=(\d+)/);
  return achado ? Number(achado[1]) : null;
}
const corpoDe = (resposta) => JSON.parse(resposta.body);

async function main() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  // Vazia de propósito: sem ela, `allowedOrigins()` cai para a origem de quem
  // chamou, que é como uma pré-visualização da Vercel funciona.
  delete process.env.ALLOWED_ORIGIN;

  // Este aparelho já é conhecido da conta: sem isso, `touchDevice` recusa por
  // `device_unknown` antes de a confirmação de email entrar em cena, e o teste
  // mediria a coisa errada.
  const SEGREDO_APARELHO = "segredo-deste-aparelho";
  const HASH_APARELHO = crypto.createHash("sha256").update(SEGREDO_APARELHO).digest("hex");
  const COOKIE_SESSAO = `cofre_access=access-secret; cofre_device=${SEGREDO_APARELHO}`;

  api.db = async (rota, opcoes) => {
    if (rota === "rpc/cofre_rate_hit") return [{ allowed: true, retry_after: 0, hits: 1 }];
    if (String(rota).startsWith("cofre_devices?") && (!opcoes || opcoes.method === undefined)) {
      return [{
        device_id: "device-confirm-1234", secret_hash: HASH_APARELHO,
        label: "Este dispositivo", device_type: "unknown", revoked_at: null,
      }];
    }
    // Atividade e autorização exigem a representação da linha alterada;
    // zero linhas agora significa revogação concorrente, não sucesso.
    if (String(rota).startsWith("cofre_devices?") && opcoes
      && (opcoes.method === "PATCH" || opcoes.method === "POST")) {
      return [{ device_id: "device-confirm-1234" }];
    }
    return null;
  };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));

  /* ================================================================ *
   * 1. ENTRAR EXIGE EMAIL CONFIRMADO
   * ================================================================ */
  console.log("\n1. Entrar exige email confirmado");

  api.auth.signIn = async (email) => ({
    access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
    user: { id: USER, email },
  });
  const recusado = await account.handler(event("POST", "login", { email: EMAIL, password: SENHA }));
  check("login de email não confirmado é recusado", recusado.statusCode === 403, `${recusado.statusCode} ${recusado.body}`);
  check("a recusa tem código próprio", corpoDe(recusado).code === "email_not_confirmed", recusado.body);
  check("a recusa não deixa cookie de sessão", cookiesDe(recusado).length === 0, JSON.stringify(cookiesDe(recusado)));

  api.auth.signIn = async (email) => ({
    access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
    user: { id: USER, email, email_confirmed_at: "2026-08-01T12:00:00Z" },
  });
  const aceito = await account.handler(event("POST", "login", { email: EMAIL, password: SENHA }));
  check("login de email confirmado entra normalmente", aceito.statusCode === 200 && corpoDe(aceito).authenticated === true, aceito.body);
  check("login confirmado devolve os cookies da sessão", cookiesDe(aceito).length >= 2, String(cookiesDe(aceito).length));

  // `confirmed_at` é o campo antigo do GoTrue. Uma conta criada antes da
  // separação entre email e telefone só tem ele, e não pode ficar trancada.
  api.auth.signIn = async (email) => ({
    access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
    user: { id: USER, email, confirmed_at: "2026-01-01T00:00:00Z" },
  });
  const legado = await account.handler(event("POST", "login", { email: EMAIL, password: SENHA }));
  check("o campo antigo confirmed_at também vale", legado.statusCode === 200, `${legado.statusCode} ${legado.body}`);

  /* ================================================================ *
   * 2. SESSÃO DE EMAIL NÃO CONFIRMADO NÃO É SESSÃO
   * ================================================================ */
  console.log("\n2. Sessão pendente de confirmação");

  api.auth.user = async () => ({ id: USER, email: EMAIL });
  const pendente = await account.handler(event("GET", "session", null, { cookie: COOKIE_SESSAO }));
  const corpoPendente = corpoDe(pendente);
  check("sessão sem confirmação não autentica", pendente.statusCode === 200 && corpoPendente.authenticated === false, pendente.body);
  check("a resposta avisa que falta confirmar", corpoPendente.pendingConfirmation === true, pendente.body);
  check("a resposta informa o email para o reenvio", corpoPendente.email === EMAIL, pendente.body);
  check("a sonda pendente não apaga cookies de um login mais novo", cookiesDe(pendente).length === 0, String(cookiesDe(pendente).length));

  api.auth.user = async () => ({ id: USER, email: EMAIL, email_confirmed_at: "2026-08-01T12:00:00Z" });
  const viva = await account.handler(event("GET", "session", null, { cookie: COOKIE_SESSAO }));
  check("sessão confirmada continua autenticando", corpoDe(viva).authenticated === true, viva.body);

  /* ================================================================ *
   * 3. O COOKIE DO FLUXO DURA O QUE O LINK DURA
   * ================================================================ */
  console.log("\n3. A validade do link do email");

  api.auth.signUp = async (email) => ({ user: { id: USER, email } });
  const registro = await account.handler(event("POST", "register", { email: "novo@example.com", password: SENHA }));
  check("o cadastro pede confirmação", corpoDe(registro).confirmationRequired === true, registro.body);
  check("o cadastro devolve o email pedido, para o reenvio", corpoDe(registro).email === "novo@example.com", registro.body);
  // ERA 600. Dez minutos para um link de 24 horas.
  check("o cookie do fluxo dura 24 horas", maxAgeDe(cookiesDe(registro), "cofre_pkce") === 86400, String(maxAgeDe(cookiesDe(registro), "cofre_pkce")));

  api.auth.recover = async () => ({});
  const recuperacao = await account.handler(event("POST", "recover", { email: EMAIL }));
  check("a recuperação usa a mesma validade", maxAgeDe(cookiesDe(recuperacao), "cofre_pkce") === 86400, String(maxAgeDe(cookiesDe(recuperacao), "cofre_pkce")));

  /* ================================================================ *
   * 4. LINK ABERTO EM OUTRO NAVEGADOR NÃO É LINK QUEBRADO
   * ================================================================ */
  console.log("\n4. O link aberto em outro navegador");

  const semVerificador = await account.handler(event("POST", "exchange", { code: "codigo-do-email" }));
  check("sem o verificador, o código da falha é próprio", corpoDe(semVerificador).code === "verifier_missing", semVerificador.body);
  check("e não é mais 'link inválido'", corpoDe(semVerificador).code !== "invalid_callback", semVerificador.body);

  const semCodigo = await account.handler(event("POST", "exchange", {}, { cookie: "cofre_pkce=signup%3Averificador" }));
  check("callback sem código continua sendo callback inválido", corpoDe(semCodigo).code === "invalid_callback", semCodigo.body);

  /* ================================================================ *
   * 5. REENVIAR A CONFIRMAÇÃO
   * ================================================================ */
  console.log("\n5. O reenvio da confirmação");

  let reenviado = null;
  api.auth.resend = async (email, redirectTo) => { reenviado = { email, redirectTo }; return {}; };
  const reenvio = await account.handler(event("POST", "resend", { email: EMAIL }));
  check("o reenvio responde sucesso", reenvio.statusCode === 200 && corpoDe(reenvio).sent === true, reenvio.body);
  check("o reenvio chega ao Supabase com o email pedido", reenviado && reenviado.email === EMAIL, JSON.stringify(reenviado));
  check("o reenvio aponta o retorno para o aplicativo", reenviado && reenviado.redirectTo === `${ORIGEM}/index.html?auth_callback=signup`, JSON.stringify(reenviado));
  check("o reenvio renova o cookie do fluxo", maxAgeDe(cookiesDe(reenvio), "cofre_pkce") === 86400, String(maxAgeDe(cookiesDe(reenvio), "cofre_pkce")));

  // A diferença entre "já confirmado" e "reenviado" é exatamente o que
  // transformaria esta rota em sonda de quem tem conta aqui.
  api.auth.resend = async () => { throw Object.assign(new Error("já confirmado"), { statusCode: 409, code: "already_confirmed" }); };
  const jaConfirmado = await account.handler(event("POST", "resend", { email: EMAIL }));
  check("email já confirmado responde igual a um reenvio de verdade", jaConfirmado.statusCode === 200 && corpoDe(jaConfirmado).sent === true, jaConfirmado.body);

  api.auth.resend = async () => { throw Object.assign(new Error("Não encontramos uma conta com este email."), { statusCode: 404, code: "user_not_found" }); };
  const semConta = await account.handler(event("POST", "resend", { email: "ninguem@example.com" }));
  check("email sem conta responde igual a um reenvio de verdade", semConta.statusCode === 200 && corpoDe(semConta).sent === true, semConta.body);

  // Falha de ENVIO é outra história: é ela que diz onde mexer, e precisa subir.
  api.auth.resend = async () => {
    throw Object.assign(new Error("O servidor não conseguiu enviar o email. Confira a configuração de SMTP do Supabase."), {
      statusCode: 502, code: "email_send_failed", exposeMessage: true,
    });
  };
  const smtpFora = await account.handler(event("POST", "resend", { email: EMAIL }));
  check("falha de envio não é engolida", corpoDe(smtpFora).code === "email_send_failed", smtpFora.body);
  check("falha de envio diz onde mexer", /SMTP/.test(corpoDe(smtpFora).message), smtpFora.body);

  api.auth.resend = async () => ({});
  const outraOrigem = await account.handler(event("POST", "resend", { email: EMAIL }, { origin: "https://attacker.test" }));
  check("o reenvio exige a mesma origem", outraOrigem.statusCode === 403, `${outraOrigem.statusCode} ${outraOrigem.body}`);

  /* ================================================================ *
   * 6. CONFIRMAR PELO `token_hash`, EM QUALQUER APARELHO
   * ================================================================ *
   * O caminho `code` + PKCE só conclui no navegador que pediu o link, porque o
   * verificador mora num cookie de lá. Cadastrar no computador e abrir o email
   * no celular é o caso comum, e nele o `exchange` não tem como funcionar.
   *
   * O `token_hash` viaja dentro do próprio link: não há estado deste lado, e
   * por isso não há aparelho certo nem aparelho errado. O que este bloco
   * garante é que a rota exista, valide o que recebe e devolva sessão.
   */
  console.log("\n6. Confirmação por token_hash");

  let verificado = null;
  api.auth.verifyToken = async (tokenHash, type) => {
    verificado = { tokenHash, type };
    return {
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      user: { id: USER, email: EMAIL, email_confirmed_at: "2026-08-20T12:00:00Z" },
    };
  };

  const HASH = "pkce_5f3e9c1a7b2d4e6f8a0c2e4b6d8f0a1c3e5b7d9f";
  const confirmado = await account.handler(event("POST", "verify", { tokenHash: HASH, type: "signup" }));
  check("confirmar por token_hash devolve sessão", confirmado.statusCode === 200 && corpoDe(confirmado).authenticated === true, confirmado.body);
  check("o token vai para o provedor sem ser alterado", verificado && verificado.tokenHash === HASH, JSON.stringify(verificado));
  check("o tipo do link é repassado", verificado && verificado.type === "signup", JSON.stringify(verificado));
  check("a confirmação devolve os cookies da sessão", cookiesDe(confirmado).length >= 2, String(cookiesDe(confirmado).length));
  check("o cookie do PKCE é descartado no caminho novo", cookiesDe(confirmado).some((c) => /^cofre_pkce=;?/.test(c) || /^cofre_pkce=.*Max-Age=0/.test(c)), JSON.stringify(cookiesDe(confirmado)));

  // NENHUM COOKIE: é exatamente o celular que não participou do cadastro.
  const outroAparelho = await account.handler({
    ...event("POST", "verify", { tokenHash: HASH, type: "signup" }),
    headers: { origin: ORIGEM, host: HOST, "x-forwarded-proto": "https", "x-device-id": "device-celular-9876" },
  });
  check("o link vale num aparelho que nunca viu o cadastro", outroAparelho.statusCode === 200, `${outroAparelho.statusCode} ${outroAparelho.body}`);

  const recuperar = await account.handler(event("POST", "verify", { tokenHash: HASH, type: "recovery" }));
  check("o link de recuperação abre o formulário de nova senha", corpoDe(recuperar).purpose === "recovery", recuperar.body);

  const tipoInventado = await account.handler(event("POST", "verify", { tokenHash: HASH, type: "../admin" }));
  check("tipo fora da lista é recusado", tipoInventado.statusCode === 400 && corpoDe(tipoInventado).code === "invalid_callback", tipoInventado.body);

  const hashTorto = await account.handler(event("POST", "verify", { tokenHash: "curto", type: "signup" }));
  check("token malformado nem chega ao provedor", hashTorto.statusCode === 400 && corpoDe(hashTorto).code === "invalid_callback", hashTorto.body);

  // Provedor que confirma sem devolver sessão não pode virar "entrou".
  api.auth.verifyToken = async () => ({ user: { id: USER, email: EMAIL } });
  const semSessao = await account.handler(event("POST", "verify", { tokenHash: HASH, type: "signup" }));
  check("confirmação sem sessão não vira login", semSessao.statusCode === 400 && corpoDe(semSessao).code === "link_invalid", semSessao.body);
  check("confirmação sem sessão não deixa cookie", cookiesDe(semSessao).length === 0, JSON.stringify(cookiesDe(semSessao)));

  api.auth.verifyToken = async () => ({
    access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
    user: { id: USER, email: EMAIL, email_confirmed_at: "2026-08-20T12:00:00Z" },
  });
  const verifyOutraOrigem = await account.handler(event("POST", "verify", { tokenHash: HASH, type: "signup" }, { origin: "https://attacker.test" }));
  check("confirmar exige a mesma origem", verifyOutraOrigem.statusCode === 403, `${verifyOutraOrigem.statusCode} ${verifyOutraOrigem.body}`);

  /* ================================================================ *
   * 7. O ERRO DO SUPABASE CHEGA TRADUZIDO, NÃO APAGADO
   * ================================================================ *
   * Antes, todo 4xx virava a mesma frase. Era o que impedia de saber por que o
   * email não chegava, e o que fazia "falta rodar a migração" parecer senha
   * errada.
   */
  console.log("\n7. A tradução do erro do Supabase");

  async function traduzir(status, corpo) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status, text: async () => JSON.stringify(corpo) });
    try { await api.request("/auth/v1/token", { method: "POST", body: {} }); return null; }
    catch (error) { return error; }
    finally { globalThis.fetch = originalFetch; }
  }

  const naoConfirmado = await traduzir(400, { error_code: "email_not_confirmed", msg: "Email not confirmed" });
  check("email não confirmado é nomeado", naoConfirmado && naoConfirmado.code === "email_not_confirmed" && naoConfirmado.statusCode === 403, naoConfirmado && naoConfirmado.code);

  const envioFalhou = await traduzir(500, { error_code: "unexpected_failure", msg: "Error sending confirmation email" });
  check("falha de envio de email é nomeada", envioFalhou && envioFalhou.code === "email_send_failed", envioFalhou && envioFalhou.code);
  check("falha de envio pode mostrar a frase mesmo sendo 5xx", envioFalhou && envioFalhou.exposeMessage === true, String(envioFalhou && envioFalhou.exposeMessage));

  const tetoDeEmail = await traduzir(429, { error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" });
  check("teto de envio de email é separado do teto de tentativas", tetoDeEmail && tetoDeEmail.code === "email_rate_limited", tetoDeEmail && tetoDeEmail.code);

  // O PostgREST responde assim quando a migração não foi rodada. Era isto que
  // aparecia como "Sincronização com falha", sem mais nenhuma informação.
  const tabelaAusente = await traduzir(404, { code: "PGRST205", message: "Could not find the table 'public.cofre_sync_state' in the schema cache" });
  check("tabela ausente vira 'faltam migrações'", tabelaAusente && tabelaAusente.code === "schema_missing", tabelaAusente && tabelaAusente.code);
  check("a mensagem aponta a pasta das migrações", tabelaAusente && /migra/i.test(tabelaAusente.message), tabelaAusente && tabelaAusente.message);

  const senhaErrada = await traduzir(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
  check("senha errada é dita como senha errada", senhaErrada && senhaErrada.code === "invalid_credentials", senhaErrada && senhaErrada.code);

  // O que NÃO está na lista fechada continua genérico: detalhe interno do
  // provedor não vai para a rede.
  const desconhecido = await traduzir(400, { error_code: "coisa_nova_do_provedor", msg: "detalhe interno" });
  check("erro fora da lista continua genérico", desconhecido && desconhecido.code === "request_rejected", desconhecido && desconhecido.code);
  check("erro fora da lista não vaza o texto do provedor", desconhecido && !/detalhe interno/.test(desconhecido.message), desconhecido && desconhecido.message);

  const prototipo = await traduzir(400, { error_code: "constructor", msg: "tentativa de poluição" });
  check("chave de protótipo não vira erro sem código", prototipo && prototipo.code === "request_rejected", prototipo && prototipo.code);

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
