"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const ctx = { console, module: { exports: {} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("js/utils.js"), ctx, { filename: "js/utils.js" });
const run = (code) => vm.runInContext(code, ctx);

console.log("\n1. Saneamento por tipo");
check("dinheiro remove letras e símbolo da moeda",
  run(`sanitizeDecimalInput("R$ 1.234,56abc")`) === "1.234,56");
check("formato brasileiro é preservado",
  run(`sanitizeDecimalInput("1.234,56")`) === "1.234,56");
check("formato com ponto decimal também é preservado",
  run(`sanitizeDecimalInput("1,234.56")`) === "1,234.56");
check("valor monetário limita a fração a duas casas",
  run(`sanitizeDecimalInput("12,3456")`) === "12,34");
check("separador de milhar não é confundido com fração",
  run(`sanitizeDecimalInput("1.234")`) === "1.234");
check("valor comum não aceita sinal negativo",
  run(`sanitizeDecimalInput("-12,30")`) === "12,30");
check("saldo pode aceitar negativo quando declarado",
  run(`sanitizeDecimalInput("-12,30", { allowNegative: true })`) === "-12,30");
check("inteiro remove letras e separadores",
  run(`sanitizeIntegerInput("24x,5")`) === "245");
check("texto remove controles invisíveis",
  run(`sanitizeTextInput("Nome\\u0000 válido")`) === "Nome válido");
check("texto respeita o limite",
  run(`sanitizeTextInput("abcdef", { maxLength: 4 })`) === "abcd");

console.log("\n2. Integração e conteúdo da interface");
const runtimeFiles = ["index.html", "manifest.webmanifest", "service-worker.js"]
  .concat(fs.readdirSync(path.join(ROOT, "js"), { recursive: true })
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join("js", name)))
  .concat(["css/style.css", "css/base.css", "css/layout.css", "css/components.css", "css/utilities.css",
    "css/screens/dashboard.css", "css/screens/health.css", "css/screens/wealth.css",
    "css/screens/planning.css", "css/screens/investments.css", "css/screens/intelligence.css",
    "css/screens/notifications-onboarding.css", "css/screens/personalization.css", "netlify/functions/analyze.js"]);
const runtime = runtimeFiles.map(read).join("\n");
check("entrada passa pelo saneamento central", /const val = sanitizeInputElement\(e\.target\)/.test(read("js/app.js")));
check("não existe confirmação nativa", !/\bconfirm\s*\(/.test(runtime));
check("popup usa alertdialog", /role="alertdialog"/.test(read("js/screens/modals.js")));
check("erros de campo usam aria-invalid e aria-describedby", /aria-invalid/.test(read("js/modules/form-errors.js")) && /aria-describedby/.test(read("js/modules/form-errors.js")));
check("diálogo prende e devolve o foco", /FOCUSABLE_SELECTOR/.test(read("js/modules/dialog-controller.js")) && /findTrigger\(opener\)/.test(read("js/modules/dialog-controller.js")));
check("não existem travessões no código entregue", !/[—–]/.test(runtime));
check("não existem emojis no código entregue", !/[\u{1F300}-\u{1FAFF}]/u.test(runtime));

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
