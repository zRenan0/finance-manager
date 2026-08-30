// test-senha-vazada.js — [M6] checagem de senha vazada (HaveIBeenPwned).
//
// O QUE ESTE ARQUIVO DEFENDE.
//
// 1. A SENHA NÃO SAI DAQUI. É a asserção central: o que vai para a rede é o
//    prefixo de CINCO caracteres do SHA-1, e mais nada. Nem a senha, nem o hash
//    completo, nem o email. Se alguém "simplificar" isto um dia mandando o hash
//    inteiro, o bloco 2 reprova.
// 2. A CHECAGEM FALHA ABERTO. HIBP fora do ar, lento ou bloqueado não pode
//    impedir ninguém de criar conta. Trocar um risco de senha fraca por uma
//    indisponibilidade certa é um mau negócio.
// 3. AS REGRAS LOCAIS CONTINUAM VALENDO SOZINHAS, que é a situação real quando
//    a consulta não acontece.
"use strict";

const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const { verificarSenhaVazada, prefixoDe } = require(path.join(ROOT, "netlify/functions/_shared/senha-vazada"));
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EMAIL = "pessoa@example.com";

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

// Resposta de mentira no formato do HIBP: `SUFIXO:CONTAGEM` por linha.
function respostaHibp(linhas) {
  return { ok: true, status: 200, text: async () => linhas.join("\r\n") };
}

async function main() {
  const SENHA = "melancia-fria-no-verao";
  const { prefixo, sufixo } = prefixoDe(SENHA);

  // ==========================================================================
  console.log("\n1. O prefixo é o que a API espera");
  // ==========================================================================
  const hashInteiro = crypto.createHash("sha1").update(SENHA, "utf8").digest("hex").toUpperCase();
  check("o prefixo tem exatamente 5 caracteres", prefixo.length === 5, prefixo);
  check("o prefixo é o começo do SHA-1", hashInteiro.startsWith(prefixo));
  check("o sufixo completa o hash", prefixo + sufixo === hashInteiro);
  check("hash em maiúsculas, como a API devolve", /^[0-9A-F]{40}$/.test(hashInteiro));

  // ==========================================================================
  console.log("\n2. A senha NÃO sai daqui");
  // ==========================================================================
  let urlChamada = "";
  let opcoesChamadas = null;
  const espiao = async (url, opcoes) => { urlChamada = String(url); opcoesChamadas = opcoes; return respostaHibp([`${sufixo}:0`]); };
  await verificarSenhaVazada(SENHA, { fetchImpl: espiao });

  const tudoQueSaiu = urlChamada + JSON.stringify(opcoesChamadas || {});
  check("a senha em texto não aparece na requisição", !tudoQueSaiu.includes(SENHA), urlChamada);
  check("o hash completo não aparece na requisição", !tudoQueSaiu.includes(hashInteiro), urlChamada);
  check("o sufixo do hash não aparece na requisição", !tudoQueSaiu.includes(sufixo), urlChamada);
  check("só o prefixo de 5 caracteres vai na URL",
    urlChamada === `https://api.pwnedpasswords.com/range/${prefixo}`, urlChamada);
  check("a consulta é um GET", (opcoesChamadas || {}).method === "GET");
  // Sem preenchimento, o TAMANHO da resposta já diz qual prefixo foi pedido a
  // quem observa a rede.
  check("pede preenchimento para o tamanho da resposta não denunciar o prefixo",
    ((opcoesChamadas || {}).headers || {})["Add-Padding"] === "true", JSON.stringify((opcoesChamadas || {}).headers));

  // ==========================================================================
  console.log("\n3. Leitura da resposta");
  // ==========================================================================
  const achou = await verificarSenhaVazada(SENHA, { fetchImpl: async () => respostaHibp([
    "0000000000000000000000000000000000A:12",
    `${sufixo}:4231`,
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9",
  ]) });
  check("sufixo presente é reconhecido como vazado", achou.vazada === true, JSON.stringify(achou));
  check("a contagem de ocorrências é lida", achou.ocorrencias === 4231, JSON.stringify(achou));
  check("a consulta é marcada como feita", achou.consultado === true);

  const naoAchou = await verificarSenhaVazada(SENHA, { fetchImpl: async () => respostaHibp([
    "0000000000000000000000000000000000A:12",
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9",
  ]) });
  check("sufixo ausente não é vazamento", naoAchou.vazada === false && naoAchou.consultado === true, JSON.stringify(naoAchou));

  // O preenchimento do `Add-Padding` chega com contagem zero. Ele iguala o
  // tamanho da resposta; não relata vazamento nenhum.
  const soPreenchimento = await verificarSenhaVazada(SENHA, { fetchImpl: async () => respostaHibp([`${sufixo}:0`]) });
  check("linha de preenchimento (contagem 0) não vira vazamento",
    soPreenchimento.vazada === false && soPreenchimento.consultado === true, JSON.stringify(soPreenchimento));

  // ==========================================================================
  console.log("\n4. Falha ABERTO, sempre");
  // ==========================================================================
  const cenarios = [
    ["serviço fora do ar", async () => { throw new Error("ECONNREFUSED"); }],
    ["resposta de erro", async () => ({ ok: false, status: 503, text: async () => "" })],
    ["corpo ilegível", async () => ({ ok: true, status: 200, text: async () => { throw new Error("stream quebrado"); } })],
    ["resposta vazia", async () => respostaHibp([])],
    ["lixo no corpo", async () => ({ ok: true, status: 200, text: async () => "isto não é o formato esperado" })],
  ];
  for (const [rotulo, impl] of cenarios) {
    const r = await verificarSenhaVazada(SENHA, { fetchImpl: impl });
    check(`${rotulo}: não bloqueia`, r.vazada === false, JSON.stringify(r));
  }
  // O `fetch` de mentira precisa OBEDECER ao sinal de aborto, como o de
  // verdade: uma promessa que nunca se resolve trava o `await` para sempre e o
  // processo termina em silêncio, dando um verde que não testou nada.
  const nuncaResponde = (_url, opcoes) => new Promise((_, reject) => {
    const sinal = opcoes && opcoes.signal;
    if (!sinal) return;
    sinal.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })));
  });
  const semRede = await verificarSenhaVazada(SENHA, { fetchImpl: nuncaResponde, timeoutMs: 60 });
  check("tempo esgotado: não bloqueia e diz que não consultou",
    semRede.vazada === false && semRede.consultado === false, JSON.stringify(semRede));

  const anterior = process.env.LEAKED_PASSWORD_CHECK;
  process.env.LEAKED_PASSWORD_CHECK = "off";
  let chamou = false;
  const desligada = await verificarSenhaVazada(SENHA, { fetchImpl: async () => { chamou = true; return respostaHibp([`${sufixo}:99`]); } });
  check("desligada por variável de ambiente não consulta nada", chamou === false && desligada.consultado === false);
  if (anterior === undefined) delete process.env.LEAKED_PASSWORD_CHECK; else process.env.LEAKED_PASSWORD_CHECK = anterior;

  check("senha vazia não gera consulta", (await verificarSenhaVazada("", { fetchImpl: async () => { throw new Error("não deveria consultar"); } })).consultado === false);

  // ==========================================================================
  console.log("\n5. Ligada ao cadastro e à troca de senha");
  // ==========================================================================
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.ALLOWED_ORIGIN = "https://cofre.test";

  let senhaGravada = null;
  let consultasAoHibp = 0;
  const fetchOriginal = global.fetch;
  global.fetch = async (url, opcoes) => {
    if (String(url).includes("pwnedpasswords.com")) {
      consultasAoHibp += 1;
      // "melancia..." consta; a frase de teste do bloco 6 não consta.
      const alvo = prefixoDe(SENHA).prefixo;
      return String(url).endsWith(alvo) ? respostaHibp([`${prefixoDe(SENHA).sufixo}:7311`]) : respostaHibp(["AAAA:1"]);
    }
    return fetchOriginal ? fetchOriginal(url, opcoes) : { ok: false, status: 500, text: async () => "" };
  };
  api.auth.signUp = async (email, password) => { senhaGravada = password; return { user: { id: USER_ID, email } }; };
  api.auth.user = async () => ({ id: USER_ID, email: EMAIL, email_confirmed_at: "2026-08-01T12:00:00Z" });
  api.db = async (route) => (route === "rpc/cofre_rate_hit" ? [{ allowed: true, retry_after: 0, hits: 1 }] : null);

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));
  const cadastrar = (senha) => account.handler({
    httpMethod: "POST", path: "/api/account/register", queryStringParameters: { action: "register" },
    headers: { origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", "x-device-id": "device-test-1234", "x-account-id": USER_ID },
    body: JSON.stringify({ email: EMAIL, password: senha }),
  });

  senhaGravada = null;
  const vazada = await cadastrar(SENHA);
  const corpoVazada = JSON.parse(vazada.body);
  check("cadastro com senha vazada é recusado", vazada.statusCode === 400, `${vazada.statusCode}`);
  check("o código diz que foi vazamento, não fraqueza genérica",
    corpoVazada.code === "leaked_password", corpoVazada.code);
  check("a senha vazada não chega ao provedor", senhaGravada === null, senhaGravada);
  check("a mensagem não acusa a pessoa de ter vazado nada",
    /aparece em vazamentos públicos de outros sites/.test(corpoVazada.message)
      && !/sua senha vazou/i.test(corpoVazada.message), corpoVazada.message);

  senhaGravada = null;
  const limpa = await cadastrar("jabuticaba no telhado azul");
  check("senha não vazada é aceita", limpa.statusCode === 200, `${limpa.statusCode} ${limpa.body}`);
  check("ela chega ao provedor inalterada", senhaGravada === "jabuticaba no telhado azul", senhaGravada);

  // AS REGRAS LOCAIS VÊM PRIMEIRO. Uma senha que já cai numa delas não gasta
  // ida à rede, e o prefixo dela nem chega a sair.
  const antesDoObvio = consultasAoHibp;
  senhaGravada = null;
  const obvia = await cadastrar("senha123456");
  check("senha da lista local é recusada antes de consultar o HIBP",
    obvia.statusCode === 400 && JSON.parse(obvia.body).code === "weak_password"
      && consultasAoHibp === antesDoObvio,
    `${JSON.parse(obvia.body).code} / consultas: ${consultasAoHibp - antesDoObvio}`);

  // E o login NÃO passa por nada disso: senha antiga continua entrando.
  const antesDoLogin = consultasAoHibp;
  api.auth.signIn = async (email, password) => {
    if (password !== SENHA) throw Object.assign(new Error("Invalid login credentials"), { statusCode: 400, code: "invalid_credentials" });
    return { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: USER_ID, email, email_confirmed_at: "2026-08-01T12:00:00Z" } };
  };
  api.db = async (route, options) => {
    if (route === "rpc/cofre_rate_hit") return [{ allowed: true, retry_after: 0, hits: 1 }];
    if (route.startsWith("cofre_devices?") && options && options.method === "POST") return [{ device_id: "device-test-1234" }];
    if (route.startsWith("cofre_devices?")) return [];
    return null;
  };
  const entrada = await account.handler({
    httpMethod: "POST", path: "/api/account/login", queryStringParameters: { action: "login" },
    headers: { origin: "https://cofre.test", host: "cofre.test", "x-forwarded-proto": "https", "x-device-id": "device-test-1234", "x-account-id": USER_ID },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  check("uma senha vazada JÁ EM USO continua entrando", entrada.statusCode === 200,
    `${entrada.statusCode} ${entrada.body}`);
  check("o login não consulta o HIBP", consultasAoHibp === antesDoLogin,
    `${consultasAoHibp - antesDoLogin} consulta(s)`);

  global.fetch = fetchOriginal;

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
