"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let ok = 0;
let fail = 0;
const check = (label, condition) => {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

console.log("\n1. CSS separado sem alterar o ponto de entrada");
const entry = read("css/style.css");
const imports = Array.from(entry.matchAll(/@import url\("([^"]+)"\);/g)).map((m) => m[1]);
check("o ponto de entrada importa todas as camadas", imports.length === 17);
check("todos os arquivos importados existem", imports.every((file) => fs.existsSync(path.join(root, "css", file))));
check("base, layout, componentes e utilitários estão separados", ["base.css", "layout.css", "components.css", "utilities.css"].every((file) => imports.includes(file)));
check("telas possuem folhas próprias", imports.filter((file) => file.startsWith("screens/")).length === 13);

console.log("\n2. Fronteira modular");
const index = read("index.html");
const bootstrap = read("js/modules/bootstrap.js");
check("bootstrap é carregado como módulo nativo", /<script type="module" src="js\/modules\/bootstrap\.js"><\/script>/.test(index));
check("módulo expõe uma única fachada congelada", /Object\.freeze/.test(bootstrap) && /CofreUI/.test(bootstrap));
check("service worker inclui os módulos", /js\/modules\/dialog-controller\.js/.test(read("service-worker.js")));
check("bootstrap importa o aplicativo gerado", /import\('\.\/app\.generated\.js'\)/.test(bootstrap));
check("HTML carrega somente boot e bootstrap", (index.match(/<script\b/g) || []).length === 2);
check("modelos não contêm atributos style", !/\sstyle\s*=/.test(read("index.html")) && !/\sstyle\s*=/.test(read("js/screens/dashboard.js")));

console.log("\n3. Diálogos e formulários acessíveis");
const dialogs = read("js/modules/dialog-controller.js");
const forms = read("js/modules/form-errors.js");
check("Tab permanece dentro do diálogo", /event\.key !== 'Tab'/.test(dialogs) && /last\.focus/.test(dialogs));
check("fundo recebe inert", /node\.inert = true/.test(dialogs));
check("foco volta ao acionador", /findTrigger\(opener\)/.test(dialogs));
check("erro é associado ao campo", /aria-describedby/.test(forms));
check("primeiro erro recebe foco", /first\.focus/.test(forms));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
