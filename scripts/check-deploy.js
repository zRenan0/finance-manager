"use strict";

// check-deploy.js; confere uma publicação JÁ NO AR.
//
// POR QUE ELE EXISTE
//
// Tudo que se pode provar lendo o repositório já é provado por `npm test`,
// `npm run check:release` e `npm run build:dist`. Sobra exatamente uma coisa
// que NENHUM deles alcança: o roteamento da Vercel.
//
// A Vercel consulta o sistema de arquivos ANTES das reescritas. Por isso o
// build publica o aplicativo como `app.html` e falha de propósito se um
// `dist/index.html` reaparecer: enquanto esse arquivo não existir, as duas
// reescritas de `vercel.json` valem e `/` entrega a página comercial. Só que
// nada disso é observável fora de uma publicação de verdade, porque depende
// também da configuração do PROJETO no painel (pasta de saída, framework,
// variáveis de ambiente).
//
// Este script faz as requisições e diz o que está errado. Ele não substitui
// as outras verificações; ele cobre o que elas não podem cobrir.
//
// Como usar:
//
//     node scripts/check-deploy.js                     confere a produção
//     node scripts/check-deploy.js https://uma-previa  confere o endereço dado
//
// A ordem é: argumento, depois DEPLOY_URL, depois o padrão (a produção).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

let ok = 0;
let fail = 0;
let warn = 0;
function check(label, condition, extra) {
  if (condition) { ok++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALHA ${label}${extra == null ? "" : `: ${extra}`}`); }
}
function aviso(label, extra) {
  warn++;
  console.log(`  aviso ${label}${extra == null ? "" : `: ${extra}`}`);
}

// O ENDEREÇO PADRÃO É O DE PRODUÇÃO.
//
// Antes, sem argumento, este script explicava e saía. Só que a conferência
// que mais precisa acontecer — a da produção — é sempre no mesmo endereço, e
// obrigar a digitá-lo toda vez é o tipo de atrito que faz a conferência
// simplesmente deixar de ser feita.
//
// O que não pode acontecer é alguém achar que conferiu uma pré-visualização
// quando conferiu a produção. Por isso o endereço em uso vai impresso no
// cabeçalho da execução junto com a procedência dele.
const PRODUCAO = "https://www.financemanager.dev.br";

const informado = (process.argv[2] || process.env.DEPLOY_URL || "").trim().replace(/\/+$/, "");
const alvo = informado || PRODUCAO;
const procedencia = process.argv[2] ? "argumento" : (process.env.DEPLOY_URL ? "DEPLOY_URL" : "padrão do script");

let base;
try {
  base = new URL(alvo);
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("esquema");
} catch (_) {
  console.error(`Endereço inválido: ${alvo}`);
  process.exit(2);
}

// `redirect: "manual"` é obrigatório aqui. Seguir desvio automaticamente
// esconderia justamente o defeito que se procura: uma reescrita que virou
// redirecionamento (o endereço na barra muda) parece funcionar quando o
// cliente segue sozinho.
// O tempo limite não é zelo: uma publicação que não responde precisa REPROVAR,
// e não travar quem está conferindo (ou o job de integração contínua) para
// sempre. `fetch` não tem prazo próprio.
const PRAZO_MS = Number(process.env.DEPLOY_TIMEOUT_MS) || 15000;

async function pegar(caminho, options = {}) {
  const url = new URL(caminho, base).toString();
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), PRAZO_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "cofre-check-deploy", ...(options.headers || {}) },
      method: options.method || "GET",
      body: options.body,
      signal: controle.signal,
    });
    const bytes = options.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
    const corpo = bytes.toString("utf8");
    return { url, status: res.status, headers: res.headers, corpo, bytes };
  } catch (erro) {
    const motivo = erro && erro.name === "AbortError" ? `sem resposta em ${PRAZO_MS}ms` : (erro && erro.message) || "falha de rede";
    return { url, status: 0, headers: new Headers(), corpo: "", bytes: Buffer.alloc(0), erro: motivo };
  } finally {
    clearTimeout(relogio);
  }
}

const CSP_ESPERADA = [
  "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
  "style-src 'self'", "style-src-attr 'none'", "frame-ancestors 'none'",
  "object-src 'none'", "base-uri 'self'",
];

function referenciasDeModulo(codigo) {
  const referencias = new Set();
  const regras = [
    /\bimport\s*\(\s*["']([^"']+\.js)["']\s*\)/g,
    /\b(?:import|export)\s+[^"';\r\n]*?\bfrom\s*["']([^"']+\.js)["']/g,
    /\bimport\s*["']([^"']+\.js)["']/g,
  ];
  regras.forEach((regra) => {
    for (const resultado of codigo.matchAll(regra)) referencias.add(resultado[1]);
  });
  return Array.from(referencias);
}

function caminhoLocalDeUrl(url) {
  let relativo;
  try { relativo = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, ""); }
  catch (_) { return null; }
  const absoluto = path.resolve(DIST, ...relativo.split("/"));
  const prefixo = `${path.resolve(DIST)}${path.sep}`;
  return absoluto.startsWith(prefixo) ? absoluto : null;
}

function digestNoNome(url) {
  const nome = path.posix.basename(new URL(url).pathname);
  const resultado = nome.match(/\.([a-f0-9]{64})\.js$/);
  return resultado ? resultado[1] : "";
}

async function main() {
  const appLocalPath = path.join(DIST, "app.html");
  if (!fs.existsSync(appLocalPath)) {
    throw new Error("dist/app.html não existe. Execute `npm run build:dist` antes da conferência.");
  }
  console.log(`\nConferindo ${base.origin}  (${procedencia})\n`);
  if (!informado) console.log("Sem argumento, a conferência vai para a produção. Para checar uma pré-visualização, passe o endereço dela.\n");

  /* ---------------------------------------------------------------- *
   * 1. A RAIZ ENTREGA A PÁGINA COMERCIAL
   * ---------------------------------------------------------------- */
  console.log("1. A raiz do domínio");
  const raiz = await pegar("/");
  check("a raiz responde 200", raiz.status === 200, raiz.status);
  const raizEhLanding = /<body class="lp"/.test(raiz.corpo);
  const raizEhApp = /id="app"/.test(raiz.corpo);
  check("a raiz entrega a página comercial", raizEhLanding && !raizEhApp,
    raizEhApp ? "entregou o APLICATIVO; ver a nota no fim" : "não reconheci a página");

  /* ---------------------------------------------------------------- *
   * 2. /index.html ENTREGA O APLICATIVO, POR REESCRITA
   * ---------------------------------------------------------------- */
  console.log("\n2. O aplicativo em /index.html");
  const app = await pegar("/index.html");
  check("/index.html responde 200 sem desvio", app.status === 200,
    `${app.status}${app.headers.get("location") ? ` -> ${app.headers.get("location")}` : ""}`);
  check("/index.html entrega o aplicativo", /id="app"/.test(app.corpo) && !/<body class="lp"/.test(app.corpo));

  // É REESCRITA, NÃO DESVIO. Se a plataforma respondesse 30x para /app.html,
  // o endereço mudaria na barra, o `start_url` do manifesto passaria a
  // divergir do endereço real e a chave "index.html" do cache do service
  // worker deixaria de casar com a navegação.
  check("/index.html não vira desvio para app.html",
    app.status !== 301 && app.status !== 302 && app.status !== 307 && app.status !== 308,
    app.headers.get("location"));

  // Os MESMOS BYTES do app.html gerado. A comparação usa o pacote que a
  // Vercel recebe, inclusive as referências com hash e a normalização LF.
  const local = fs.readFileSync(appLocalPath);
  const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
  const shaLocal = sha(local);
  const shaRemoto = sha(app.bytes);
  check("/index.html entrega os mesmos bytes de dist/app.html", shaLocal === shaRemoto,
    `local ${shaLocal.slice(0, 16)} != publicado ${shaRemoto.slice(0, 16)}`);

  const entrada = (app.corpo.match(/<script\s+type="module"\s+src="([^"]+)"/) || [])[1] || "";
  check("o HTML aponta para bootstrap com SHA-256", /^js\/modules\/bootstrap\.[a-f0-9]{64}\.js$/.test(entrada), entrada || "ausente");

  if (entrada) {
    const fila = [new URL(entrada, new URL("/index.html", base)).toString()];
    const visitados = new Set();
    while (fila.length && visitados.size < 50) {
      const url = fila.shift();
      if (visitados.has(url)) continue;
      visitados.add(url);

      const modulo = await pegar(url);
      const nome = new URL(url).pathname;
      check(`${nome} responde 200`, modulo.status === 200, modulo.status);
      const localModulo = caminhoLocalDeUrl(url);
      check(`${nome} pertence ao pacote dist`, !!localModulo && fs.existsSync(localModulo), localModulo || "fora de dist");
      if (modulo.status !== 200 || !localModulo || !fs.existsSync(localModulo)) continue;

      const localBytes = fs.readFileSync(localModulo);
      check(`${nome} tem os bytes gerados`, sha(localBytes) === sha(modulo.bytes),
        `local ${sha(localBytes).slice(0, 16)} != publicado ${sha(modulo.bytes).slice(0, 16)}`);
      const hashNome = digestNoNome(url);
      check(`${nome} traz o SHA-256 do conteúdo no nome`, !!hashNome && hashNome === sha(modulo.bytes), hashNome || "sem hash");

      referenciasDeModulo(modulo.corpo).forEach((referencia) => {
        const dependencia = new URL(referencia, url);
        if (dependencia.origin === base.origin) fila.push(dependencia.toString());
      });
    }
    check("o grafo de módulos termina no limite de segurança", fila.length === 0, `${fila.length} referência(s) restante(s)`);
  }

  /* ---------------------------------------------------------------- *
   * 3. O NOME INTERNO NÃO É ENDEREÇO PÚBLICO
   * ---------------------------------------------------------------- */
  console.log("\n3. O nome de arquivo interno");
  const appHtml = await pegar("/app.html");
  // Ele responde, e tudo bem: é o destino da reescrita. O que não pode
  // acontecer é ele aparecer em link, canonical ou email. Fica registrado
  // para quem estiver conferindo.
  aviso("/app.html responde (esperado: é o destino da reescrita)", appHtml.status);

  /* ---------------------------------------------------------------- *
   * 4. CABEÇALHOS DE SEGURANÇA EM TODA RESPOSTA
   * ---------------------------------------------------------------- */
  console.log("\n4. Cabeçalhos de segurança");
  for (const [nome, resposta] of [["a raiz", raiz], ["/index.html", app]]) {
    const csp = resposta.headers.get("content-security-policy");
    check(`${nome} traz Content-Security-Policy`, !!csp, "ausente");
    if (csp) {
      const faltando = CSP_ESPERADA.filter((parte) => !csp.includes(parte));
      check(`${nome}: a política tem todas as diretivas esperadas`, faltando.length === 0, faltando.join("; "));
    }
    check(`${nome} traz X-Content-Type-Options`, resposta.headers.get("x-content-type-options") === "nosniff",
      resposta.headers.get("x-content-type-options"));
    check(`${nome} traz X-Frame-Options`, resposta.headers.get("x-frame-options") === "DENY",
      resposta.headers.get("x-frame-options"));
  }

  /* ---------------------------------------------------------------- *
   * 5. AS FUNÇÕES RESPONDEM
   * ---------------------------------------------------------------- *
   * O que se procura aqui é 404 (a reescrita de `/api/account/:action*` não
   * chegou, ou a função não foi publicada) e 500 (a Vercel não rastreou o
   * `require("../netlify/functions/...")` e a função subiu sem o backend).
   * ---------------------------------------------------------------- */
  console.log("\n5. As funções do backend");
  const sessao = await pegar("/api/account/session");
  check("/api/account/session não responde 404", sessao.status !== 404,
    "404: a reescrita de /api/account/:action* não chegou, ou a função não foi publicada");
  check("/api/account/session não responde 500", sessao.status !== 500,
    "500: provável falha ao carregar netlify/functions/account.js (rastreio de require)");
  check("/api/account/session devolve JSON",
    /application\/json/.test(String(sessao.headers.get("content-type") || "")),
    sessao.headers.get("content-type"));
  check("a resposta não vaza rastro de pilha", !/ at .*\.js:\d+/.test(sessao.corpo));

  let corpoSessao = null;
  try { corpoSessao = JSON.parse(sessao.corpo); } catch (_) {}
  if (corpoSessao && corpoSessao.configured === false) {
    aviso("o backend de contas responde, mas está SEM CONFIGURAR",
      "faltam SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY no painel");
  } else if (corpoSessao && corpoSessao.configured === true) {
    check("o backend de contas está configurado", true);
  }

  /* ---------------------------------------------------------------- *
   * 6. ALLOWED_ORIGIN
   * ---------------------------------------------------------------- *
   * O erro mais caro da migração, e o mais silencioso: `ALLOWED_ORIGIN`
   * apontando para o domínio antigo faz TODA chamada de conta e de
   * sincronização voltar 403 `origin_denied`. A rota GET de sessão não passa
   * por `assertSameOrigin`, então ela responde normalmente e o problema só
   * aparece quando alguém tenta entrar. É por isso que a conferência precisa
   * de um POST.
   * ---------------------------------------------------------------- */
  console.log("\n6. ALLOWED_ORIGIN");
  const login = await pegar("/api/account/login", {
    method: "POST",
    headers: { Origin: base.origin, "Content-Type": "application/json" },
  });
  let corpoLogin = null;
  try { corpoLogin = JSON.parse(login.corpo); } catch (_) {}
  const negado = login.status === 403 && corpoLogin && corpoLogin.code === "origin_denied";
  check("a própria origem da publicação é aceita pelas funções", !negado,
    `403 origin_denied: ALLOWED_ORIGIN não inclui ${base.origin}. Deixe a variável VAZIA para o código cair na própria origem, ou acrescente este endereço.`);
  if (!negado && corpoLogin && corpoLogin.code) {
    aviso("o login recusou por outro motivo (esperado: o corpo estava vazio)", corpoLogin.code);
  }

  /* ---------------------------------------------------------------- *
   * 7. O QUE NÃO PODE ESTAR NO AR
   * ---------------------------------------------------------------- */
  console.log("\n7. O que o build não publica");
  for (const caminho of [
    "/tests/run-all.js",
    "/docs/BACKEND_SETUP.md",
    "/supabase/migrations",
    "/scripts/build-dist.js",
    "/package.json",
  ]) {
    const res = await pegar(caminho);
    check(`${caminho} não está publicado`, res.status === 404 || res.status === 403, res.status);
  }

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "PUBLICAÇÃO CONFERIDA"}: ${ok} ok, ${fail} falha(s), ${warn} aviso(s)`);
  if (!raizEhLanding && raizEhApp) {
    console.log([
      "",
      "A RAIZ ABRIU NO APLICATIVO.",
      "",
      "Isso não vem do build: ele falha de propósito se gerar dist/index.html.",
      "Confira a configuração do projeto no painel da Vercel:",
      "",
      "  * Output Directory precisa ser `dist`;",
      "  * Framework Preset precisa ser `Other` (um preset pode ignorar as",
      "    reescritas do vercel.json);",
      "  * Root Directory precisa ser a raiz do repositório.",
      "",
    ].join("\n"));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((erro) => {
  console.error(`\nNão foi possível conferir a publicação: ${erro.message}`);
  process.exit(1);
});
