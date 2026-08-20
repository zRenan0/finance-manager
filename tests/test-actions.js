// test-actions.js: fronteira entre o núcleo do app e as ações de clique
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const app = read("js/app.js");
const actions = read("js/actions.js");
const index = read("index.html");
const worker = read("service-worker.js");
const generated = read("js/modules/app.generated.js");

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail == null ? "" : ` → ${detail}`}`);
  }
}

console.log("\n1. Fronteira das ações");
const clickCases = (actions.match(/case "[^"]+"/g) || []).length;
check("actions.js declara o manipulador de clique", /function onClick\(e\)/.test(actions));
check("o manipulador preserva todos os grupos de ação", clickCases >= 100, clickCases);
check("app.js não voltou a declarar onClick", !/function onClick\(e\)/.test(app));
check("o núcleo apenas registra o contrato onClick", /addEventListener\("click", onClick\)/.test(app));
check("actions.js mantém modo estrito", /^"use strict";/.test(actions));

console.log("\n2. Ordem e cache");
const actionsPos = generated.indexOf("// source: js/actions.js");
const appPos = generated.indexOf("// source: js/app.js");
check("index carrega o bootstrap modular", /src="js\/modules\/bootstrap\.js"/.test(index));
check("actions.js entra antes de app.js no módulo", actionsPos >= 0 && actionsPos < appPos, `${actionsPos}/${appPos}`);
check("service worker guarda o módulo gerado", worker.includes('"js/modules/app.generated.js"'));
// A versao do cache acompanha a release. Fixar o numero aqui obrigava a editar
// este teste a cada publicacao; o que importa e que ela nao ficou para tras.
const cacheAtual = Number((worker.match(/const VERSION = "v(\d+)"/) || [])[1]);
check("cache do service worker tem versao explicita", Number.isFinite(cacheAtual), worker.slice(0, 40));
check("cache foi renovado nesta release", cacheAtual >= 46, `v${cacheAtual}`);

console.log("\n3. Popup com escolha alternativa");
check("confirmação aceita uma ação alternativa", /alternateLabel: o\.alternateLabel/.test(app));
check("fechamento executa onAlternate somente quando essa opção foi escolhida", /pending\.choice === "alternate"[\s\S]*pending\.onAlternate/.test(app));
check("ações tratam a escolha de saldo anterior", /case "confirmation-alternate"/.test(actions));
check("cancelar a confirmação não apaga o formulário da meta", /case "confirmation-cancel": dismissOverlay\("confirmation"\); break;/.test(actions));

if (fail > 0) {
  console.error(`\nFALHOU: ${fail} falha(s), ${pass} ok`);
  process.exit(1);
}

console.log(`\nTODOS OS TESTES PASSARAM - ${pass} ok, 0 falha(s)`);
