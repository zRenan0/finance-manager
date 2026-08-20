"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const relative = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(relative) : [relative];
});

let pass = 0;
let fail = 0;
function check(label, condition, extra) {
  if (condition) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${extra ? `: ${extra}` : ""}`); }
}

console.log("\n1. Entrada modular gerada");
const buildCheck = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-app-module.js"), "--check"], { cwd: ROOT, encoding: "utf8" });
check("artefato corresponde às fontes", buildCheck.status === 0, buildCheck.stderr.trim());

// `node --check arquivo.js` analisa em modo SCRIPT, onde duas declarações
// `function` com o mesmo nome são legais. O navegador carrega este arquivo com
// `import()`, isto é, em modo MÓDULO, onde a mesma coisa é SyntaxError.
//
// Essa diferença já custou uma versão quebrada: uma função homônima adicionada
// em `portfolio.js` colidiu com a de `utils.js`, o parse do pacote inteiro
// falhou no navegador e o app abria na tela de erro do bootstrap. A suíte
// passava inteira, porque cada arquivo é carregado isolado num `vm`.
//
// Copiar para `.mjs` força o modo módulo, que é exatamente o do navegador.
const moduleCopy = path.join(ROOT, "js/modules/.app.generated.check.mjs");
fs.copyFileSync(path.join(ROOT, "js/modules/app.generated.js"), moduleCopy);
const syntaxCheck = spawnSync(process.execPath, ["--check", moduleCopy], { cwd: ROOT, encoding: "utf8" });
fs.rmSync(moduleCopy, { force: true });
check("artefato possui sintaxe válida de MÓDULO (não só de script)", syntaxCheck.status === 0, syntaxCheck.stderr.trim().split("\n")[0]);

// O mesmo para o ponto de entrada e os módulos auxiliares.
["js/modules/bootstrap.js", "js/modules/dialog-controller.js", "js/modules/form-errors.js",
  "js/modules/dynamic-styles.js", "js/modules/test-bridge.js"].forEach((arquivo) => {
  const copia = path.join(ROOT, `${arquivo}.check.mjs`);
  fs.copyFileSync(path.join(ROOT, arquivo), copia);
  const resultado = spawnSync(process.execPath, ["--check", copia], { cwd: ROOT, encoding: "utf8" });
  fs.rmSync(copia, { force: true });
  check(`${arquivo} faz parse como módulo`, resultado.status === 0, resultado.stderr.trim().split("\n")[0]);
});

const index = read("index.html");
check("HTML possui apenas boot e bootstrap", (index.match(/<script\b/g) || []).length === 2);
check("nenhum arquivo clássico do aplicativo é carregado", !/<script[^>]+src="js\/(?!boot\.js|modules\/bootstrap\.js)/.test(index));

console.log("\n2. Estilos fora do HTML");
const renderedSources = ["index.html", ...walk("js").filter((file) => file.endsWith(".js") && !file.endsWith("app.generated.js"))];
const inlineStyleFiles = renderedSources.filter((file) => /(?:\sstyle\s*=|\sstyle\\?=\\?["'])/i.test(read(file)));
check("modelos não possuem atributos style", inlineStyleFiles.length === 0, inlineStyleFiles.join(", "));

const dynamicStyles = read("js/modules/dynamic-styles.js");
check("declarações calculadas são validadas", /INVALID_CSS/.test(dynamicStyles) && /sanitizeDeclarations/.test(dynamicStyles));
check("atributo temporário é removido", /removeAttribute\("data-ui-css"\)/.test(dynamicStyles));
check("regras entram na folha externa", /insertRule/.test(dynamicStyles) && /data-dynamic-styles/.test(index));
const testBridge = read("js/modules/test-bridge.js");
check("ponte de teste só funciona localmente e por opção explícita", /localhost/.test(testBridge) && /__test/.test(testBridge));

console.log("\n3. Cache e política de conteúdo");
const worker = read("service-worker.js");
check("cache inclui o artefato modular", worker.includes('"js/modules/app.generated.js"'));
check("cache inclui os serviços do bootstrap", worker.includes('"js/modules/dynamic-styles.js"') && worker.includes('"js/modules/test-bridge.js"'));
check("cache não inclui fontes clássicas", !worker.includes('"js/utils.js"') && !worker.includes('"js/app.js"'));
// A política vive em `vercel.json`; ver tests/test-security.js.
const csp = ((JSON.parse(read("vercel.json")).headers || [])
  .reduce((todos, regra) => todos.concat(regra.headers || []), [])
  .find((h) => h.key === "Content-Security-Policy") || {}).value || "";
check("CSP bloqueia atributos style", /style-src-attr 'none'/.test(csp) && !/style-src[^;]*'unsafe-inline'/.test(csp));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
