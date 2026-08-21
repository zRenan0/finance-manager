"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function executarWorker(codigo) {
  const handlers = {};
  const self = {
    location: { origin: "https://cofre.test" },
    registration: {},
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(tipo, handler) { handlers[tipo] = handler; },
  };
  const contexto = {
    self,
    caches: {},
    fetch: async () => {},
    Request,
    Response,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto, { filename: "service-worker.js" });
  return handlers;
}

console.log("\n1. Identidade do service worker");
const workerFonte = read("service-worker.js");
const versao = Number((workerFonte.match(/const VERSION = "v(\d+)";/) || [])[1]);
check("a versão de cache foi promovida", versao >= 53, versao);
check("o fonte usa a versão como identidade de desenvolvimento", /const BUILD_ID = VERSION;/.test(workerFonte));

const handlersFonte = executarWorker(workerFonte);
let respostaFonte = null;
handlersFonte.message({
  data: { type: "GET_BUILD" },
  ports: [{ postMessage(valor) { respostaFonte = valor; } }],
});
check("o worker informa o pacote pelo canal solicitado", respostaFonte
  && respostaFonte.type === "COFRE_BUILD" && respostaFonte.build === `v${versao}`, JSON.stringify(respostaFonte));

console.log("\n2. Identidade do pacote publicado");
const build = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-dist.js")], { cwd: ROOT, encoding: "utf8" });
check("o pacote de teste é gerado", build.status === 0, (build.stderr || build.stdout).trim().split("\n")[0]);
if (build.status === 0) {
  const app = read("dist/app.html");
  const worker = read("dist/service-worker.js");
  const buildId = (app.match(/<meta\s+name="cofre-build"\s+content="(sha256-[a-f0-9]{64})"/) || [])[1] || "";
  const cacheId = (worker.match(/const VERSION = "(v\d+-[a-f0-9]{64})";/) || [])[1] || "";
  check("HTML publicado possui identidade SHA-256", !!buildId, buildId || "ausente");
  check("cache publicado inclui a identidade do pacote", !!buildId && cacheId.endsWith(buildId.slice(7)), cacheId || "ausente");

  const handlers = executarWorker(worker);
  let resposta = null;
  handlers.message({
    data: { type: "GET_BUILD" },
    ports: [{ postMessage(valor) { resposta = valor; } }],
  });
  check("worker publicado informa a mesma identidade do HTML", resposta
    && resposta.type === "COFRE_BUILD" && resposta.build === buildId, JSON.stringify(resposta));
}

console.log("\n3. Recarga protegida no aplicativo");
const appSource = read("js/app.js");
check("aplicativo observa a troca de controller", /serviceWorker\.addEventListener\("controllerchange"/.test(appSource));
check("aplicativo consulta a identidade ativa", /GET_BUILD/.test(appSource) && /MessageChannel/.test(appSource));
check("gravações terminam antes da recarga", /FinanceStore\.flush\(\)/.test(appSource) && /location\.reload\(\)/.test(appSource));
check("a guarda de recarga é separada por pacote", /sessionStorage\.getItem/.test(appSource) && /sessionStorage\.setItem/.test(appSource));
check("falha mantém a página com aviso pendente", /Atualização pendente/.test(appSource));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
