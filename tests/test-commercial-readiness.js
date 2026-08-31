"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ctx = {
  console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined,
  URL, AbortController, setTimeout, clearTimeout,
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/qrcode.js"]
  .forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));

const run = (code) => vm.runInContext(code, ctx);
let pass = 0, fail = 0;
function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : `: ${extra}`}`); }
}

function response(status, payload, extraHeaders) {
  const body = payload == null ? "" : JSON.stringify(payload);
  const headers = { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...(extraHeaders || {}) };
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    async text() { return body; },
  };
}

async function main() {
  console.log("\n1. Backup adulterado é saneado");
  const maliciousId = '\"><img src=x onerror=alert(1)>';
  ctx.__dirty = {
    categories: [{ id: maliciousId, name: "Mercado", color: "url(javascript:alert(1))", icon: '\"><svg', group: "necessidade" }],
    transactions: [{ id: maliciousId, type: "expense", amount: 10, categoryId: maliciousId, date: "2026-08-01", payment: '\"><img', description: " x ".repeat(200) }],
    accounts: [{ id: maliciousId, name: "Conta", type: "corrente", openingBalance: 10, openingDate: "2026-08-01", color: "red;position:fixed" }],
    creditCards: [{ id: maliciousId, name: "Cartão", accountId: maliciousId, limit: 1000, color: "var(--negative)" }],
  };
  const clean = run("migrate(__dirty)");
  const safeId = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
  check("categoria recebe identificador restrito", safeId.test(clean.categories[0].id), clean.categories[0].id);
  check("lançamento recebe identificador restrito", safeId.test(clean.transactions[0].id), clean.transactions[0].id);
  check("vínculo da categoria é preservado", clean.transactions[0].categoryId === clean.categories[0].id);
  check("conta e cartão mantêm o vínculo saneado", clean.creditCards[0].accountId === clean.accounts[0].id);
  check("cores inválidas voltam ao padrão", clean.categories[0].color === "#0E6E5D" && clean.accounts[0].color === "#0B6B5C");
  check("ícone não aceita conteúdo de atributo", clean.categories[0].icon === "tag");
  check("forma de pagamento desconhecida é recusada", clean.transactions[0].payment === "Outro");
  check("descrição externa tem limite", clean.transactions[0].description.length <= 200, clean.transactions[0].description.length);

  console.log("\n2. QR fiscal consulta somente portal reconhecido");
  const key = "1".repeat(44);
  const official = `https://nfce.sefaz.sp.gov.br/consulta?p=${key}|2|1|1&vNF=123.45`;
  const fake = `https://example.com/consulta?p=${key}&vNF=999.99`;
  ctx.__official = official;
  ctx.__fake = fake;
  const parsedOfficial = run("parseNfceUrl(__official)");
  const parsedFake = run("parseNfceUrl(__fake)");
  check("HTTPS fiscal com chave é aceito", parsedOfficial.trusted && parsedOfficial.chave === key && parsedOfficial.amount === 123.45);
  check("domínio comum com chave é recusado", !parsedFake.trusted && parsedFake.chave === null);
  ctx.__httpOfficial = official.replace("https://", "http://");
  check("portal fiscal sem HTTPS é recusado", run("parseNfceUrl(__httpOfficial).trusted") === false);

  let fetchedUrl = null;
  ctx.__fiscalFetch = async (url, options) => {
    fetchedUrl = url;
    check("consulta impede redirecionamento", options.redirect === "error", options.redirect);
    return {
      ok: true,
      headers: { get(name) { return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null; } },
      async text() { return '<html><title>Mercado Fiscal</title><div>Valor a pagar R$ 123,45</div></html>'; },
    };
  };
  const fiscalDetails = await run("tryFetchNfceDetails(__official, __fiscalFetch)");
  check("portal reconhecido pode ser consultado", fetchedUrl === official && fiscalDetails && fiscalDetails.valor === 123.45, fetchedUrl);
  fetchedUrl = null;
  const blockedDetails = await run("tryFetchNfceDetails(__fake, __fiscalFetch)");
  check("endereço não fiscal não chega ao fetch", blockedDetails === null && fetchedUrl === null);

  console.log("\n3. CloudAdapter permanece seguro por padrão");
  let disabledCode = null;
  try { run("new CloudAdapter()") } catch (error) { disabledCode = error.code; }
  check("adaptador desligado não inicializa", disabledCode === "disabled", disabledCode);

  const calls = [];
  const queue = [
    response(200, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "ok", revision: "1" }),
    response(200, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "ok", revision: "1", ops: [], hasMore: false, cursor: "1" }),
    response(200, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "applied", revision: "2", applied: 1, ops: [], hasMore: false, cursor: "2" }),
  ];
  ctx.__cloudOptions = {
    enabled: true,
    baseUrl: "https://sync.example/api",
    token: "token-seguro",
    deviceId: "device-1",
    accountId: "00000000-0000-4000-8000-000000000001",
    allowCrossOrigin: true,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return queue.shift(); },
  };
  const cloud = run("new CloudAdapter(__cloudOptions)");
  await cloud.init();
  const pagina = await cloud.pull("0", 500);
  await cloud.push([{ entity: "transactions", entityId: "tx-1", op: "put", rev: "001787000000000.000000.device-1", payload: { id: "tx-1" } }], "1");
  check("leitura incremental devolve página com cursor", Array.isArray(pagina.ops) && pagina.cursor === "1", JSON.stringify(pagina).slice(0, 80));
  check("toda chamada envia autenticação e dispositivo", calls.every((call) => call.options.headers.Authorization === "Bearer token-seguro" && call.options.headers["X-Device-Id"] === "device-1"));
  check("leitura pede a partir do cursor, não a base inteira", /\/changes\?since=0&limit=500/.test(String(calls[1].url)), String(calls[1].url));
  check("gravação envia chave de idempotência", !!calls[2].options.headers["Idempotency-Key"]);
  check("gravação manda operações, não snapshot", (() => {
    const corpo = JSON.parse(calls[2].options.body);
    return Array.isArray(corpo.ops) && corpo.data === undefined;
  })());
  check("revisão avança após confirmação", cloud.revision === "2", cloud.revision);

  const cookieCalls = [];
  ctx.__cookieOptions = {
    enabled: true,
    baseUrl: "https://sync.example/api",
    authMode: "cookie",
    deviceId: "device-cookie-1",
    accountId: "00000000-0000-4000-8000-000000000001",
    allowCrossOrigin: true,
    fetchImpl: async (url, options) => { cookieCalls.push({ url, options }); return response(200, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "ok", revision: "1" }); },
  };
  const cookieCloud = run("new CloudAdapter(__cookieOptions)");
  await cookieCloud.init();
  check("sessão em cookie não exige token no JavaScript", cookieCalls[0].options.credentials === "include" && !cookieCalls[0].options.headers.Authorization);

  // Apagar tudo continua sendo uma permissão separada: o adaptador comum não
  // pode destruir a base da conta por acidente.
  let destructiveCode = null;
  try { await cloud.resetRemote("001787000000000.000000.device-1"); } catch (error) { destructiveCode = error.code; }
  check("exclusão remota fica bloqueada separadamente", destructiveCode === "destructive_blocked", destructiveCode);

  // Os caminhos de snapshot inteiro do protocolo 1 não existem mais. Se
  // voltarem por engano, o teto de 6 MiB e a ressurreição de registros voltam
  // com eles.
  let legadoCode = null;
  try { await cloud.replaceAll({}); } catch (error) { legadoCode = error.code; }
  check("gravação por snapshot inteiro não existe mais no cliente", legadoCode === "protocol_upgrade_required", legadoCode);

  // Recusa do servidor não pode ser engolida: sem erro, o app diria
  // "sincronizado" com a fila cheia.
  const conflictQueue = [
    response(200, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "ok", revision: "1" }),
    response(409, { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2, status: "error", code: "idempotency_mismatch" }),
  ];
  ctx.__conflictOptions = {
    ...ctx.__cloudOptions,
    fetchImpl: async () => conflictQueue.shift(),
  };
  const conflictCloud = run("new CloudAdapter(__conflictOptions)");
  await conflictCloud.init();
  let conflictCode = null;
  try { await conflictCloud.push([], "0"); } catch (error) { conflictCode = error.code; }
  check("colisão de idempotência não é engolida", conflictCode === "idempotency_mismatch", conflictCode);

  ctx.__timeoutOptions = {
    ...ctx.__cloudOptions,
    fetchImpl: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; },
  };
  const timeoutCloud = run("new CloudAdapter(__timeoutOptions)");
  let timeoutCode = null;
  try { await timeoutCloud.init(); } catch (error) { timeoutCode = error.code; }
  check("timeout vira erro controlado sem expor detalhes de rede", timeoutCode === "timeout", timeoutCode);

  console.log("\n4. Processo de desenvolvimento e publicação");
  const pkg = JSON.parse(read("package.json"));
  check("existe comando único de testes", pkg.scripts && pkg.scripts.test === "node tests/run-all.js");
  check("existe verificação de publicação", pkg.scripts && !!pkg.scripts["verify:release"]);
  const ci = read(".github/workflows/ci.yml");
  // `npm ci` respeita o package-lock e falha quando ele está fora de sincronia.
  // Com `npm install`, a CI podia rodar contra uma árvore de dependências
  // diferente da testada, e o verde não dizia nada sobre o que seria publicado.
  check("integração contínua usa npm ci", /run: npm ci/.test(ci) && !/run: npm install/.test(ci));
  check("integração contínua roda análise estática", /npm run lint/.test(ci));
  check("integração contínua mede cobertura", /npm run test:coverage/.test(ci));
  check("integração contínua verifica a publicação",
    /npm run check:build/.test(ci) && /npm run check:release/.test(ci) && /npm run build:dist/.test(ci));
  check("integração contínua roda os três motores de navegador",
    /chromium firefox webkit/.test(ci), "playwright install");
  const browserMatrix = read("tests/browser/run-browser-matrix.js");
  check("o comando de navegador executa os três motores instalados",
    pkg.scripts["test:browser"] === "node tests/browser/run-browser-matrix.js"
    && /\["chromium", "firefox", "webkit"\]/.test(browserMatrix));

  const pkgScripts = pkg.scripts || {};
  check("existe comando para subir o app", pkgScripts.start === "node scripts/serve.js", pkgScripts.start);
  check("existe geração de dist", !!pkgScripts["build:dist"]);
  check("existe análise estática", !!pkgScripts.lint);
  check("existe medição de cobertura", !!pkgScripts["test:coverage"]);

  // Só `dist/` vai para o ar: publicar a raiz expunha tests/, docs/ e as
  // migrações do Supabase, que descrevem schema, RLS e funções privilegiadas.
  const vercel = JSON.parse(read("vercel.json"));
  const cspVercel = ((vercel.headers || [])
    .reduce((todos, regra) => todos.concat(regra.headers || []), [])
    .find((h) => h.key === "Content-Security-Policy") || {}).value || "";
  check("a publicação usa apenas dist/", vercel.outputDirectory === "dist");
  check("o build da publicação gera o dist", vercel.buildCommand === "npm run build:dist");

  // Fontes locais: o app carregava Inter e Space Grotesk do Google, enviando o
  // IP do usuário a um terceiro em toda abertura.
  const indexHtml = read("index.html");
  check("o HTML não busca fonte de terceiro", !/fonts\.(googleapis|gstatic)\.com/.test(indexHtml));
  check("a CSP não libera domínio de fonte externa", !/fonts\.(googleapis|gstatic)\.com/.test(cspVercel));
  // A guarda aqui é "a fonte não pode voltar a ser buscada fora", e ela
  // exigia `../fonts/` em css/base.css. Isso presumia arquivo WOFF2 no
  // repositório, e nunca houve nenhum: a referência rendia 404 por abertura
  // para quem não tivesse a família instalada, e a pilha do sistema assumia
  // do mesmo jeito. As duas famílias passaram a ser resolvidas só por
  // `local()`, como na página comercial, e a verificação passou a medir o
  // que de fato importa: que a folha declare fonte local e não vá buscar
  // arquivo de fonte em endereço nenhum.
  // A verificação de AUSÊNCIA olha só as regras: o comentário desta folha
  // descreve, de propósito, o `url()` que saiu e como devolvê-lo. Sem a
  // limpeza, a documentação da correção reprovaria a própria correção.
  const baseCss = read("css/base.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("as fontes são declaradas localmente", /@font-face/.test(baseCss) && /src:\s*local\(/.test(baseCss));
  check("a folha do app não busca arquivo de fonte", !/url\([^)]*\.(?:woff2?|ttf|otf)/.test(baseCss));

  // A promessa de abrir por file:// nunca funcionou: módulos ES, service worker
  // e IndexedDB não operam nessa origem.
  const readme = read("README.md");
  check("o README não promete mais duplo clique no index.html", !/duplo clique\)/.test(readme));
  check("o README documenta npm start", /npm start/.test(readme));
  check("procedimento inclui homologação e retorno", /Homologação/.test(read("docs/RELEASE.md")) && /Retorno à versão anterior/.test(read("docs/RELEASE.md")));
  check("contrato de sincronização está documentado", /Idempotency-Key/.test(read("docs/SYNC_PROTOCOL.md")) && /409/.test(read("docs/SYNC_PROTOCOL.md")));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
