"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const ORIGIN = "https://cofre.test";

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function absoluteKey(value) {
  const raw = value && value.url ? value.url : String(value);
  return new URL(raw, `${ORIGIN}/service-worker.js`).href;
}

class WorkerRequest extends Request {
  constructor(input, init) {
    super(input && input.url ? input : absoluteKey(input), init);
  }
}

class MemoryCache {
  constructor(delayPut) {
    this.entries = new Map();
    this.delayPut = delayPut;
  }

  async put(request, response) {
    if (this.delayPut) await this.delayPut();
    this.entries.set(absoluteKey(request), response.clone());
  }

  async match(request) {
    const found = this.entries.get(absoluteKey(request));
    return found ? found.clone() : undefined;
  }
}

function workerHarness(options = {}) {
  const handlers = {};
  const stores = new Map();
  const failedPaths = new Set(options.failedPaths || []);
  let online = options.online !== false;
  let skipWaitingCount = 0;
  let claimCount = 0;

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache(options.delayPut));
      return stores.get(name);
    },
    async keys() { return Array.from(stores.keys()); },
    async delete(name) { return stores.delete(name); },
  };

  const self = {
    location: { origin: ORIGIN },
    registration: { navigationPreload: { async enable() {} } },
    clients: { async claim() { claimCount += 1; } },
    async skipWaiting() { skipWaitingCount += 1; },
    addEventListener(type, handler) { handlers[type] = handler; },
  };

  async function fetchImpl(request) {
    if (!online) throw new Error("offline");
    const url = new URL(request && request.url ? request.url : absoluteKey(request));
    if (failedPaths.has(url.pathname)) return new Response("ausente", { status: 404 });
    const type = url.pathname.endsWith(".html") || url.pathname === "/" ? "text/html" : "application/octet-stream";
    return new Response(`conteudo:${url.pathname}`, { status: 200, headers: { "Content-Type": type } });
  }

  const context = {
    self,
    caches,
    fetch: fetchImpl,
    Request: WorkerRequest,
    Response,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(`${SOURCE}\nself.__pwa = { VERSION, CACHE_NAME, PAGE_CACHE, FONT_CACHE, APP_SHELL, OPTIONAL_ASSETS, LANDING_ASSETS, LANDING_PAGES };`, context,
    { filename: "service-worker.js" });

  async function dispatchWait(type, event = {}) {
    let promise;
    handlers[type]({ ...event, waitUntil(value) { promise = Promise.resolve(value); } });
    if (!promise) throw new Error(`${type} não chamou waitUntil`);
    return promise;
  }

  async function navigate(pathname) {
    let responsePromise;
    const request = { method: "GET", mode: "navigate", url: `${ORIGIN}${pathname}` };
    handlers.fetch({
      request,
      preloadResponse: Promise.resolve(null),
      respondWith(value) { responsePromise = Promise.resolve(value); },
      waitUntil() {},
    });
    if (!responsePromise) throw new Error(`navegação ${pathname} não foi tratada`);
    return responsePromise;
  }

  return {
    handlers,
    stores,
    caches,
    constants: self.__pwa,
    dispatchWait,
    navigate,
    setOnline(value) { online = value; },
    skipWaitingCount: () => skipWaitingCount,
    claimCount: () => claimCount,
  };
}

async function main() {
  console.log("\n1. Instalação completa");
  const ok = workerHarness();
  await ok.dispatchWait("install");
  const c = ok.constants;
  const shell = ok.stores.get(c.CACHE_NAME);
  const pages = ok.stores.get(c.PAGE_CACHE);
  const shellKeys = new Set(shell ? shell.entries.keys() : []);
  const pageKeys = new Set(pages ? pages.entries.keys() : []);
  check("todos os arquivos do app entram no cache do shell",
    c.APP_SHELL.every((item) => shellKeys.has(absoluteKey(item))), `${shellKeys.size}/${c.APP_SHELL.length}`);
  check("os estáticos da landing ficam no cache de recursos",
    c.LANDING_ASSETS.every((item) => shellKeys.has(absoluteKey(item))));
  check("as navegações da landing ficam no cache de páginas",
    c.LANDING_PAGES.every((item) => pageKeys.has(absoluteKey(item))));
  check("a versão só pede ativação após o pacote completo", ok.skipWaitingCount() === 1, ok.skipWaitingCount());
  // [M38] O PDF.js saiu da lista OBRIGATÓRIA, não do pacote: com rede boa ele
  // continua entrando no mesmo cache, na mesma instalação.
  check("os pesados opcionais continuam sendo guardados quando dá",
    c.OPTIONAL_ASSETS.length > 0 && c.OPTIONAL_ASSETS.every((item) => shellKeys.has(absoluteKey(item))),
    `${c.OPTIONAL_ASSETS.length} opcionais`);
  check("o PDF.js está entre os opcionais, não no shell",
    c.OPTIONAL_ASSETS.some((item) => /pdfjs/.test(item)) && !c.APP_SHELL.some((item) => /pdfjs/.test(item)),
    c.APP_SHELL.filter((i) => /pdfjs/.test(i)).join(", "));

  console.log("\n2. Separação offline");
  ok.setOnline(false);
  const app = await ok.navigate("/index.html");
  const landing = await ok.navigate("/");
  check("o aplicativo abre do próprio shell offline", (await app.text()) === "conteudo:/index.html");
  check("a raiz abre a landing offline", (await landing.text()) === "conteudo:/");

  let apiHandled = false;
  ok.handlers.fetch({
    request: { method: "GET", mode: "cors", url: `${ORIGIN}/api/account/session` },
    respondWith() { apiHandled = true; },
    waitUntil() {},
  });
  const cachedApi = Array.from(ok.stores.values()).some((cache) =>
    Array.from(cache.entries.keys()).some((key) => new URL(key).pathname.startsWith("/api/")));
  check("requisição de API não é interceptada", apiHandled === false);
  check("nenhuma resposta de API aparece no CacheStorage", cachedApi === false);

  console.log("\n3. Ativação e limpeza");
  await ok.caches.open("financas-cache-v1");
  await ok.caches.open("cache-de-outro-site");
  await ok.dispatchWait("activate");
  const activeKeys = await ok.caches.keys();
  check("cache antigo do Cofre é removido", !activeKeys.includes("financas-cache-v1"), activeKeys.join(", "));
  check("cache sem o prefixo do Cofre é preservado", activeKeys.includes("cache-de-outro-site"), activeKeys.join(", "));
  check("clientes passam ao worker novo depois da limpeza", ok.claimCount() === 1, ok.claimCount());

  console.log("\n4. Falha não promove pacote parcial");
  const broken = workerHarness({ failedPaths: ["/css/screens/account.css"] });
  let installError = "";
  try { await broken.dispatchWait("install"); } catch (error) { installError = error.message; }
  check("falha de qualquer arquivo reprova a instalação", /Pacote offline não armazenado/.test(installError), installError);
  check("pacote incompleto não chama skipWaiting", broken.skipWaitingCount() === 0, broken.skipWaitingCount());
  check("caches parciais da nova versão são apagados",
    !broken.stores.has(broken.constants.CACHE_NAME) && !broken.stores.has(broken.constants.PAGE_CACHE),
    Array.from(broken.stores.keys()).join(", "));

  // [M38] O outro lado da moeda: o item opcional que falha NÃO pode derrubar a
  // instalação. Era o que acontecia com o PDF.js, 1,78 MB obrigatórios que
  // deixavam a pessoa sem aplicativo offline por causa de um leitor de PDF.
  console.log("\n4b. Falha de item opcional não reprova a instalação");
  const semPdf = workerHarness({ failedPaths: ["/vendor/pdfjs/pdf.worker.min.mjs"] });
  let erroOpcional = "";
  try { await semPdf.dispatchWait("install"); } catch (error) { erroOpcional = error.message; }
  check("instalação segue sem o opcional", erroOpcional === "", erroOpcional);
  check("o pacote é promovido mesmo assim", semPdf.skipWaitingCount() === 1, semPdf.skipWaitingCount());
  const shellSemPdf = semPdf.stores.get(semPdf.constants.CACHE_NAME);
  check("o shell continua completo", shellSemPdf
    && semPdf.constants.APP_SHELL.every((item) => shellSemPdf.entries.has(absoluteKey(item))));
  check("o opcional que deu certo ainda entrou",
    shellSemPdf.entries.has(absoluteKey("vendor/pdfjs/pdf.min.mjs")));
  check("o opcional que falhou simplesmente não está lá",
    !shellSemPdf.entries.has(absoluteKey("vendor/pdfjs/pdf.worker.min.mjs")));

  console.log("\n5. Navegação aguarda a gravação");
  let pendingPut = false;
  const delayed = workerHarness({ delayPut: async () => {
    pendingPut = true;
    await new Promise((resolve) => setTimeout(resolve, 5));
    pendingPut = false;
  } });
  await delayed.dispatchWait("install");
  const response = await delayed.navigate("/pagina-nova");
  const stored = await delayed.stores.get(delayed.constants.PAGE_CACHE).match(`${ORIGIN}/pagina-nova`);
  check("a resposta só termina depois de gravar a navegação", !pendingPut && !!stored && response.status === 200);

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
