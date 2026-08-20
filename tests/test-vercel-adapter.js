"use strict";

// test-vercel-adapter.js; a casca que liga a Vercel aos handlers do backend.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// A migração para a Vercel não reescreveu `account`, `sync` e `analyze`: elas
// continuam recebendo o mesmo evento de antes, e quem traduz é `api/_adaptar.js`.
// Isso preservou a cobertura que já existia, mas criou uma peça nova no meio do
// caminho de toda requisição autenticada. Um defeito aqui não aparece em
// nenhuma das outras suítes: elas chamam o handler direto.
//
// O que é medido: que o `action` da reescrita chega, que o corpo chega como
// TEXTO (o `readJson` faz `JSON.parse` de string), que vários `Set-Cookie`
// saem como várias linhas, e que um handler que estoura não vaza rastro de
// pilha para a rede.
//
// O servidor aqui é HTTP de verdade, e não um objeto de mentira, porque é
// justamente a ponte com `IncomingMessage`/`ServerResponse` que está sendo
// verificada.

const http = require("http");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { adaptar } = require(path.join(ROOT, "api/_adaptar"));

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function pedir(porta, opcoes, corpo) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: porta, ...opcoes }, (res) => {
      let texto = "";
      res.setEncoding("utf8");
      res.on("data", (parte) => { texto += parte; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw: res.rawHeaders, body: texto }));
    });
    req.on("error", reject);
    if (corpo != null) req.write(corpo);
    req.end();
  });
}

async function comServidor(handler, fn) {
  const server = http.createServer(adaptar(handler));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { return await fn(server.address().port); }
  finally { server.close(); }
}

async function main() {
  console.log("\n1. O evento chega no formato que os handlers esperam");

  let visto = null;
  await comServidor(async (evento) => {
    visto = evento;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }, async (porta) => {
    const resposta = await pedir(porta, {
      method: "POST",
      path: "/api/account?action=login",
      headers: { "content-type": "application/json", "x-device-id": "device-test-1234", origin: "https://cofre.test" },
    }, JSON.stringify({ email: "pessoa@example.com" }));
    check("responde com o status do handler", resposta.status === 200, resposta.status);
  });

  check("o método chega em maiúsculas", visto && visto.httpMethod === "POST", visto && visto.httpMethod);
  check("a ação da reescrita chega em queryStringParameters",
    visto && visto.queryStringParameters.action === "login", visto && JSON.stringify(visto.queryStringParameters));
  check("os cabeçalhos chegam em minúsculas", visto && visto.headers["x-device-id"] === "device-test-1234");
  // ESTE É O PONTO DELICADO. `_shared/http.js` faz `JSON.parse(event.body)`;
  // se o corpo chegasse já desserializado, todo POST quebraria em produção e
  // em nenhum outro teste.
  check("o corpo chega como texto, não como objeto", visto && typeof visto.body === "string", visto && typeof visto.body);
  check("o corpo chega íntegro", visto && JSON.parse(visto.body).email === "pessoa@example.com");
  check("o corpo não é declarado como base64", visto && visto.isBase64Encoded === false);

  console.log("\n2. Corpo já desserializado pelo runtime");

  // Dependendo da versão do runtime, a Vercel entrega `req.body` pronto. O
  // adaptador precisa aceitar os dois casos sem que o handler perceba.
  let vistoPronto = null;
  const comCorpoPronto = adaptar(async (evento) => {
    vistoPronto = evento;
    return { statusCode: 204, headers: {}, body: "" };
  });
  const respostaFalsa = { statusCode: 0, cabecalhos: {}, setHeader(k, v) { this.cabecalhos[k] = v; }, end() {} };
  await comCorpoPronto(
    { method: "post", url: "/api/sync?action=push", headers: {}, body: { ops: [1, 2] } },
    respostaFalsa
  );
  check("objeto já desserializado volta a ser texto",
    vistoPronto && typeof vistoPronto.body === "string" && JSON.parse(vistoPronto.body).ops.length === 2,
    vistoPronto && typeof vistoPronto.body);
  // Objeto de requisição sem fluxo e sem corpo: o adaptador devolve texto
  // vazio em vez de estourar. Acontece com GET, que é como a sessão é lida.
  let vistoSemFluxo = null;
  await adaptar(async (evento) => {
    vistoSemFluxo = evento;
    return { statusCode: 200, headers: {}, body: "" };
  })({ method: "GET", url: "/api/account?action=session", headers: {} }, respostaFalsa);
  check("requisição sem corpo vira texto vazio, não erro",
    vistoSemFluxo && vistoSemFluxo.body === "", vistoSemFluxo && JSON.stringify(vistoSemFluxo.body));

  let vistoGet = null;
  await comServidor(async (evento) => {
    vistoGet = evento;
    return { statusCode: 200, headers: {}, body: "{}" };
  }, async (porta) => {
    await pedir(porta, { method: "GET", path: "/api/account?action=session" });
  });
  check("GET real pela rede também chega com corpo vazio",
    vistoGet && vistoGet.body === "" && vistoGet.queryStringParameters.action === "session",
    vistoGet && JSON.stringify(vistoGet.body));

  console.log("\n3. Resposta: cabeçalhos e cookies");

  const tresCookies = ["cofre_access=a; Path=/; HttpOnly", "cofre_refresh=b; Path=/; HttpOnly", "cofre_device=c; Path=/; HttpOnly"];
  await comServidor(async () => ({
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    multiValueHeaders: { "Set-Cookie": tresCookies },
    body: JSON.stringify({ ok: true }),
  }), async (porta) => {
    const resposta = await pedir(porta, { method: "GET", path: "/api/account?action=session" });
    check("cabeçalho simples é repassado", resposta.headers["cache-control"] === "no-store", resposta.headers["cache-control"]);
    // O fluxo de sessão devolve três cookies de uma vez. Se o adaptador
    // colapsasse isso numa linha só, a pessoa entraria e perderia o
    // dispositivo, ou a renovação, sem erro nenhum aparecer.
    const cookies = resposta.headers["set-cookie"] || [];
    check("os três Set-Cookie saem em linhas separadas", cookies.length === 3, cookies.length);
    check("nenhum cookie foi concatenado", cookies.every((c) => c.indexOf(",") === -1));
  });

  console.log("\n4. Handler que estoura não vaza rastro de pilha");

  await comServidor(async () => { throw new Error("segredo interno: conexão com o banco em 10.0.0.7"); }, async (porta) => {
    const resposta = await pedir(porta, { method: "GET", path: "/api/sync?action=pull" });
    check("responde 500", resposta.status === 500, resposta.status);
    check("não devolve a mensagem interna", !/segredo interno|10\.0\.0\.7/.test(resposta.body), resposta.body.slice(0, 80));
    check("não devolve rastro de pilha", !/at .*\.js:\d+/.test(resposta.body));
    check("devolve JSON com código", JSON.parse(resposta.body).code === "server_error");
  });

  await comServidor(async () => {
    const erro = new Error("Informe um email válido");
    erro.statusCode = 400; erro.code = "invalid_email";
    throw erro;
  }, async (porta) => {
    const resposta = await pedir(porta, { method: "POST", path: "/api/account?action=login" }, "{}");
    check("erro de cliente preserva status e código", resposta.status === 400 && JSON.parse(resposta.body).code === "invalid_email", resposta.status);
    check("erro de cliente preserva a mensagem", /email válido/.test(JSON.parse(resposta.body).message));
  });

  console.log("\n5. Corpo acima do limite é cortado antes de virar memória");

  await comServidor(async () => ({ statusCode: 200, body: "nunca chega aqui" }), async (porta) => {
    const gigante = "x".repeat(7 * 1024 * 1024);
    const resposta = await pedir(porta, {
      method: "POST", path: "/api/sync?action=push", headers: { "content-type": "application/json" },
    }, gigante).catch((erro) => ({ status: 0, body: String(erro.message) }));
    check("corpo acima de 6 MB responde 413", resposta.status === 413, `${resposta.status} ${String(resposta.body).slice(0, 60)}`);
  });

  console.log("\n6. As três rotas apontam para os handlers de verdade");

  ["account", "sync", "analyze"].forEach((nome) => {
    delete require.cache[require.resolve(path.join(ROOT, `api/${nome}.js`))];
    const rota = require(path.join(ROOT, `api/${nome}.js`));
    check(`/api/${nome} exporta uma função de dois argumentos`, typeof rota === "function" && rota.length === 2, typeof rota);
  });

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((erro) => { console.error(erro); process.exit(1); });
