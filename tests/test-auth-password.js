// test-auth-password.js — [M6] senha e reautenticação.
//
// O QUE ESTE ARQUIVO DEFENDE.
//
// 1. TROCAR A SENHA EXIGE UMA PROVA ALÉM DO COOKIE DE SESSÃO. Antes do M6,
//    `/api/account/password` trocava a senha com o cookie e mais nada: quem
//    chegasse a uma sessão viva tomava a conta e trancava o dono do lado de
//    fora sem nunca ter sabido a senha. As duas provas aceitas são a senha
//    atual e a marca de recuperação emitida quando o link do email é consumido.
//
// 2. A REGRA DE SENHA NOVA NÃO PODE VAZAR PARA O LOGIN. Este é o risco de
//    regressão real da mudança: `passwordOf` é usada no login e na
//    reautenticação da exclusão. Se as regras novas entrassem lá, todo usuário
//    com uma senha que não as atende ficaria trancado para fora no dia da
//    publicação, e nem a senha CERTA passaria — a checagem roda antes de falar
//    com o provedor. O bloco 3 existe só para isso.
"use strict";

const path = require("path");
const ROOT = path.join(__dirname, "..");
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EMAIL = "pessoa@example.com";

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function event(method, action, body, extraHeaders) {
  return {
    httpMethod: method, path: `/api/account/${action}`, queryStringParameters: { action },
    headers: {
      origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https",
      "x-device-id": "device-test-1234", "x-account-id": USER_ID, ...(extraHeaders || {}),
    },
    body: body == null ? null : JSON.stringify(body),
  };
}
const bodyOf = (res) => JSON.parse(res.body || "{}");
const cookiesOf = (res) => (res.multiValueHeaders && res.multiValueHeaders["Set-Cookie"]) || [];

async function main() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";

  // A senha "de verdade" desta conta de mentira. `signIn` só aceita ela; é o
  // que transforma a reautenticação numa checagem observável.
  const SENHA_ATUAL = "cavalo-bateria-grampo";
  let senhaGravada = null;
  let entradasNoProvedor = 0;

  api.auth.signIn = async (email, password) => {
    entradasNoProvedor += 1;
    if (password !== SENHA_ATUAL) {
      throw Object.assign(new Error("Invalid login credentials"), { statusCode: 400, code: "invalid_credentials" });
    }
    return {
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" },
    };
  };
  api.auth.user = async () => ({ id: USER_ID, email: EMAIL, email_confirmed_at: "2026-08-01T12:00:00Z" });
  api.auth.updateUser = async (_token, changes) => { senhaGravada = changes.password; return { id: USER_ID }; };
  api.auth.signUp = async (email, password) => { senhaGravada = password; return { user: { id: USER_ID, email } }; };
  // O aparelho é guardado de verdade, e não fingido: `touchDevice` compara o
  // `secret_hash` gravado com o HMAC do cookie que `authorizeDevice` emitiu. Um
  // mock que devolvesse uma linha fixa nunca casaria com esse hash, e todo
  // pedido cairia em `device_unknown` antes de chegar à regra que interessa.
  // Guardar o que o próprio código gravou é o que faz a sessão do teste ser uma
  // sessão de verdade.
  let aparelho = null;
  api.db = async (route, options) => {
    if (route === "rpc/cofre_rate_hit") return [{ allowed: true, retry_after: 0, hits: 1 }];
    if (!route.startsWith("cofre_devices?")) return null;
    const metodo = (options && options.method) || "GET";
    if (metodo === "GET") return aparelho ? [aparelho] : [];
    if (metodo === "POST") {
      aparelho = { device_id: "device-test-1234", revoked_at: null, ...(options.body || {}) };
      return [aparelho];
    }
    if (metodo === "PATCH") {
      if (!aparelho) return [];
      // `touchDevice` filtra por `secret_hash` na própria rota. Respeitar esse
      // filtro é o que mantém o teste honesto: cookie de aparelho errado
      // continua devolvendo zero linhas, como no banco.
      const exigido = (route.match(/secret_hash=eq\.([^&]*)/) || [])[1];
      if (exigido && exigido !== aparelho.secret_hash) return [];
      aparelho = { ...aparelho, ...(options.body || {}) };
      return [aparelho];
    }
    return null;
  };

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));

  // Sessão real: entra de verdade e reaproveita os cookies que o servidor
  // devolveu, inclusive o segredo do aparelho.
  const entrada = await account.handler(event("POST", "login", { email: EMAIL, password: SENHA_ATUAL }));
  if (entrada.statusCode !== 200) { console.error("login de preparação falhou", entrada.body); process.exit(1); }
  const cookiesDaSessao = cookiesOf(entrada).map((linha) => String(linha).split(";")[0]).join("; ");
  const comSessao = (extra) => ({ cookie: `${cookiesDaSessao}${extra || ""}` });

  // ==========================================================================
  console.log("\n1. Trocar a senha exige prova além do cookie");
  // ==========================================================================
  senhaGravada = null;
  const semProva = await account.handler(event("POST", "password", { password: "frase-nova-bem-longa" }, comSessao()));
  check("sessão sozinha não troca a senha", semProva.statusCode === 401, `${semProva.statusCode}`);
  check("o motivo da recusa é reautenticação", bodyOf(semProva).code === "reauth_required", bodyOf(semProva).code);
  check("nada foi gravado na recusa", senhaGravada === null, senhaGravada);

  senhaGravada = null;
  const senhaErrada = await account.handler(event("POST", "password",
    { password: "frase-nova-bem-longa", currentPassword: "chute-do-atacante" }, comSessao()));
  check("senha atual errada não troca a senha", senhaErrada.statusCode === 401, `${senhaErrada.statusCode}`);
  check("a recusa distingue reautenticação de sessão inválida",
    bodyOf(senhaErrada).code === "reauth_failed", bodyOf(senhaErrada).code);
  check("nada foi gravado com a senha atual errada", senhaGravada === null, senhaGravada);

  senhaGravada = null;
  const comSenhaAtual = await account.handler(event("POST", "password",
    { password: "frase-nova-bem-longa", currentPassword: SENHA_ATUAL }, comSessao()));
  check("senha atual correta troca a senha", comSenhaAtual.statusCode === 200, `${comSenhaAtual.statusCode}`);
  check("a senha nova chegou ao provedor", senhaGravada === "frase-nova-bem-longa", senhaGravada);

  // ==========================================================================
  console.log("\n2. A marca de recuperação é a outra prova aceita");
  // ==========================================================================
  // Quem esqueceu a senha não pode ser obrigado a digitá-la. A prova, aí, é o
  // link que só chega na caixa de entrada do dono do endereço.
  senhaGravada = null;
  const entradasAntes = entradasNoProvedor;
  const porRecuperacao = await account.handler(event("POST", "password",
    { password: "outra-frase-bem-longa" }, comSessao("; cofre_recovery=1")));
  check("marca de recuperação dispensa a senha atual", porRecuperacao.statusCode === 200, `${porRecuperacao.statusCode}`);
  check("a senha nova chegou ao provedor", senhaGravada === "outra-frase-bem-longa", senhaGravada);
  check("nenhuma reautenticação foi tentada nesse caminho",
    entradasNoProvedor === entradasAntes, `${entradasNoProvedor - entradasAntes} entrada(s)`);
  // A marca vale por UMA troca: mantê-la viva deixaria a janela aberta para
  // trocas seguintes sem prova nenhuma.
  const limpaAMarca = cookiesOf(porRecuperacao).some((c) => /^cofre_recovery=/.test(c) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c));
  check("a marca é consumida na troca", limpaAMarca, cookiesOf(porRecuperacao).join(" | "));

  // ==========================================================================
  console.log("\n3. A regra de senha NOVA não alcança o login");
  // ==========================================================================
  // O maior risco desta mudança seria trancar quem já tem conta. Uma senha que
  // as regras novas recusariam precisa continuar ENTRANDO.
  const senhaLegada = "1234567890";        // só dígitos: recusada como senha nova
  api.auth.signIn = async (email, password) => {
    entradasNoProvedor += 1;
    if (password !== senhaLegada) throw Object.assign(new Error("Invalid login credentials"), { statusCode: 400, code: "invalid_credentials" });
    return {
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" },
    };
  };
  const loginLegado = await account.handler(event("POST", "login", { email: EMAIL, password: senhaLegada }));
  check("senha antiga fraca continua ENTRANDO", loginLegado.statusCode === 200,
    `${loginLegado.statusCode} ${bodyOf(loginLegado).code || ""}`);
  check("e continua autenticando de verdade", bodyOf(loginLegado).authenticated === true);

  // ==========================================================================
  console.log("\n4. Regras da senha nova (cadastro)");
  // ==========================================================================
  const cadastrar = async (senha, email) => account.handler(event("POST", "register", { email: email || EMAIL, password: senha }));
  const recusa = async (rotulo, senha, email) => {
    senhaGravada = null;
    const res = await cadastrar(senha, email);
    check(`${rotulo} é recusada`, res.statusCode === 400 && bodyOf(res).code === "weak_password",
      `${res.statusCode} ${bodyOf(res).code}`);
    check(`${rotulo} não chega ao provedor`, senhaGravada === null, senhaGravada);
  };
  await recusa("senha de lista conhecida", "senha123456");
  await recusa("um caractere repetido", "aaaaaaaaaaaa");
  await recusa("só números", "98765432109");
  await recusa("sequência do teclado", "qwertyuiop");
  await recusa("senha contendo o email", "pessoa-do-cofre", "pessoa@example.com");

  senhaGravada = null;
  const curta = await cadastrar("curta123");
  check("senha curta continua recusada pelo comprimento",
    curta.statusCode === 400 && bodyOf(curta).code === "invalid_password", bodyOf(curta).code);

  senhaGravada = null;
  const boa = await cadastrar("melancia-fria-no-verao");
  check("frase longa é aceita", boa.statusCode === 200, `${boa.statusCode} ${bodyOf(boa).code || ""}`);
  check("a senha aceita chega ao provedor sem alteração",
    senhaGravada === "melancia-fria-no-verao", senhaGravada);
  // Sem regra de composição, de propósito: o NIST SP 800-63B recomenda contra
  // exigir maiúscula/número/símbolo desde 2017. Uma frase em minúsculas passa.
  senhaGravada = null;
  const soMinusculas = await cadastrar("tres palavras juntas aqui");
  check("frase só em minúsculas é aceita (sem regra de composição)",
    soMinusculas.statusCode === 200, `${soMinusculas.statusCode} ${bodyOf(soMinusculas).code || ""}`);

  // ==========================================================================
  console.log("\n5. Medidor de força (conselho, não regra)");
  // ==========================================================================
  const vm = require("vm");
  const fs = require("fs");
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/utils.js"), "utf8"), ctx, { filename: "js/utils.js" });
  const forca = (senha, email) => { ctx.__s = senha; ctx.__e = email || ""; return vm.runInContext("passwordStrength(__s, __e)", ctx); };

  check("campo vazio não recebe nota", forca("").empty === true);
  check("sequência do teclado pontua no chão", forca("qwertyuiop").score === 0, JSON.stringify(forca("qwertyuiop")));
  check("só números pontua no chão", forca("1234509876").score <= 1, JSON.stringify(forca("1234509876")));
  check("frase longa pontua no topo", forca("melancia fria no verao").score >= 3, JSON.stringify(forca("melancia fria no verao")));
  check("senha com o email dentro cai para o chão",
    forca("pessoa-do-cofre", "pessoa@example.com").score === 0, JSON.stringify(forca("pessoa-do-cofre", "pessoa@example.com")));
  check("a dica avisa sobre o email", /email/.test(forca("pessoa-do-cofre", "pessoa@example.com").hint));
  check("todo resultado tem rótulo legível", ["muito fraca", "fraca", "razoável", "boa", "forte"].includes(forca("melancia fria").label));
  // O medidor é conselho: ele NÃO pode ser a única barreira, e por isso não
  // reprova nada sozinho. Quem reprova é o servidor, testado no bloco 4.
  check("o medidor não devolve veredicto de bloqueio",
    typeof forca("qwertyuiop").blocked === "undefined");

  // ==========================================================================
  console.log("\n6. O medidor na tela");
  // ==========================================================================
  // Sem `vercel dev` o app local acha que o serviço de contas não existe e nem
  // desenha o formulário, então o navegador não alcança esta tela. O render é
  // conferido aqui, chamando a função que a tela chama.
  const telaCtx = { console };
  telaCtx.globalThis = telaCtx;
  vm.createContext(telaCtx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/utils.js"), "utf8"), telaCtx, { filename: "js/utils.js" });
  // Só o pedaço que interessa de js/screens/account.js; carregar a tela inteira
  // arrastaria o app todo para dentro de um teste de backend.
  const fonteTela = fs.readFileSync(path.join(ROOT, "js/screens/account.js"), "utf8");
  const inicio = fonteTela.indexOf("function renderPasswordStrength");
  const fim = fonteTela.indexOf("\nfunction accountDevicesCard");
  check("renderPasswordStrength existe na tela de conta", inicio > 0 && fim > inicio);
  vm.runInContext(fonteTela.slice(inicio, fim), telaCtx, { filename: "js/screens/account.js" });
  const desenhar = (senha, email) => {
    telaCtx.__s = senha; telaCtx.__e = email || "";
    return String(vm.runInContext("renderPasswordStrength(__s, __e)", telaCtx));
  };

  const vazio = desenhar("");
  check("campo vazio mostra a orientação, não uma nota", !vazio.includes("pwd-meter") && vazio.includes("Mínimo de 10"));
  const fraca = desenhar("qwertyuiop");
  check("senha fraca desenha o medidor no menor nível", /data-score="0"/.test(fraca), fraca.slice(0, 120));
  check("nenhum passo aceso no menor nível", !fraca.includes("is-on"));
  const forte = desenhar("melancia fria no verao");
  check("frase longa acende passos", (forte.match(/is-on/g) || []).length >= 3, forte.slice(0, 200));
  check("a força é dita por extenso, não só por cor", /Força: <b>(forte|boa)<\/b>/.test(forte), forte);
  check("a barra fica fora da leitura de tela", /aria-hidden="true"/.test(forte));
  check("o texto é anunciado quando muda", /role="status"/.test(forte));
  // O rótulo e a dica passam por escapeHtml como todo o resto da interface
  // (ver tests/test-xss-surface.js): a entrada aqui é o email do usuário.
  const comEmailHostil = desenhar("pessoa-do-cofre", '"><xssprobe onx=1>@example.com');
  check("o medidor não deixa marcação escapar", !/<xssprobe/i.test(comEmailHostil), comEmailHostil.slice(0, 200));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
