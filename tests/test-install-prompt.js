// test-install-prompt.js: instalar o app pela tela de Ajustes.
//
// O manifesto e o service worker já tornavam o Cofre instalável, mas nenhuma
// tela oferecia isso. O que este arquivo protege: o evento do navegador é
// guardado (e a faixa própria dele, suprimida); o botão só aparece quando há
// como instalar; no iPhone, que não tem evento, a tela explica o caminho; e
// quando o app já roda instalado o cartão some.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const readSrc = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const SCREEN_FILES = [
  "js/screens/_shared.js", "js/screens/onboarding.js", "js/screens/dashboard.js",
  "js/screens/accounts.js", "js/screens/debts.js", "js/screens/add.js",
  "js/screens/analytics.js", "js/screens/goals.js", "js/screens/calendar.js",
  "js/screens/health.js", "js/screens/wealth.js", "js/screens/portfolio.js",
  "js/screens/invest.js", "js/screens/simulators.js", "js/screens/simulate.js",
  "js/screens/insights.js", "js/screens/subscriptions.js", "js/screens/notifications.js",
  "js/screens/achievements.js", "js/screens/import.js", "js/screens/all.js",
  "js/screens/rules.js", "js/screens/categories.js", "js/screens/settings.js",
  "js/screens/privacy.js", "js/screens/account.js", "js/screens/modals.js",
];

function fakeElement(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), innerHTML: "", value: "", disabled: false,
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
}

// Os ouvintes de `window` são guardados para o teste disparar os eventos que
// só o navegador dispararia.
const listeners = {};
let matches = false;
const ctx = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: {
    readyState: "loading", documentElement: fakeElement(), body: fakeElement(), activeElement: null,
    visibilityState: "visible", getElementById() { return fakeElement(); },
    querySelector() { return fakeElement(); }, querySelectorAll() { return []; },
    createElement(tag) { return fakeElement(tag); }, addEventListener() {}, removeEventListener() {},
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true, platform: "Linux", maxTouchPoints: 0 },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame() { return 0; }, requestIdleCallback() { return 0; },
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ get matches() { return matches; }, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined, module: { exports: {} },
  addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  alert() {}, confirm() { return true; }, prompt() { return null; },
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js",
  "js/safe-errors.js", "js/storage.js", "js/backup-crypto.js", "js/auth.js", "js/cloud-sync.js",
  "js/accounts.js", "js/movements.js", "js/data-sources.js", "js/reconcile.js", "js/debts.js",
  "js/budgets.js", "js/charts.js", "js/pdf.js", "js/import.js", "js/pdf-import.js", "js/nlp.js",
  "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js", "js/goals.js", "js/forecast.js",
  "js/transparency.js", "js/calendar.js", "js/recurring.js", "js/analytics.js", "js/insights.js",
  "js/assistant.js", "js/contextual-assistant.js", "js/advisor.js", "js/investments.js",
  "js/portfolio.js", "js/simulators.js", "js/qrcode.js", "js/achievements.js", "js/wrapped.js",
  "js/services.js", "js/demo.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"])
  .forEach((file) => vm.runInContext(readSrc(file), ctx, { filename: file }));

const run = (expression) => vm.runInContext(expression, ctx);
const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label}${extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`}`); }
}
function section(label) { console.log(`\n${label}`); }
function click(action, dataset) {
  const button = fakeElement("button");
  button.dataset = Object.assign({ action }, dataset || {});
  ctx.__event = {
    target: { closest: (selector) => selector === "[data-action]" ? button : null },
    preventDefault() {}, stopPropagation() {},
  };
  run("onClick(__event)");
}
function fire(name, event) { (listeners[name] || []).forEach((fn) => fn(event)); }
function makePrompt(outcome) {
  const registro = { prompted: 0, prevented: 0 };
  const event = {
    preventDefault() { registro.prevented += 1; },
    prompt() { registro.prompted += 1; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome }),
  };
  return { event, registro };
}

run(`state.data = migrate(defaultData()); state.tab = "settings"; state.booting = false; state.toast = null;`);

(async () => {
  section("1. Sem oferta do navegador, a tela não promete instalação");
  check("os dois ouvintes foram registrados na carga", Array.isArray(listeners.beforeinstallprompt) && Array.isArray(listeners.appinstalled));
  check("disponibilidade padrão é nenhuma", run("installAvailability()") === "none");
  check("Ajustes não mostra o cartão", !/install-card/.test(run("renderSettingsScreen()")));

  section("2. O evento do navegador vira botão em Ajustes");
  const aceito = makePrompt("accepted");
  ctx.__evento = aceito.event;
  fire("beforeinstallprompt", aceito.event);
  check("a faixa própria do navegador é suprimida", aceito.registro.prevented === 1);
  check("o evento fica guardado", run("state.installPrompt === __evento"));
  check("disponibilidade passa a ser o botão", run("installAvailability()") === "prompt");
  const html = run("renderSettingsScreen()");
  check("o cartão aparece com o botão", /install-card/.test(html) && /data-action="pwa-install"/.test(html));
  check("o cartão fica fora do acordeão", !/settings-topic__panel/.test(html));
  check("o texto não promete mexer nos dados", /não copia nem move nada/.test(html));

  click("pwa-install");
  await pause();
  check("o toque dispara o pedido do navegador uma vez", aceito.registro.prompted === 1);
  check("o evento não é reaproveitado", run("state.installPrompt") === null);
  check("sem o evento o cartão some", !/install-card/.test(run("renderSettingsScreen()")));
  check("aceitar não gera aviso redundante (o appinstalled avisa)", run("state.toast") === null, run("state.toast"));
  click("pwa-install");
  check("tocar de novo sem evento não quebra", true);

  fire("appinstalled", {});
  check("instalado: aviso de confirmação", /instalado/i.test(String(run("state.toast") || "")), run("state.toast"));

  section("3. Recusa: o botão some e o menu do navegador continua valendo");
  run("state.toast = null;");
  const recusado = makePrompt("dismissed");
  fire("beforeinstallprompt", recusado.event);
  click("pwa-install");
  await pause();
  check("o pedido foi feito", recusado.registro.prompted === 1);
  check("a recusa vira aviso com o caminho alternativo", /menu do navegador/.test(String(run("state.toast") || "")), run("state.toast"));
  check("o botão não volta", run("installAvailability()") === "none");

  section("4. iPhone: sem evento, com instruções");
  ctx.navigator.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  check("disponibilidade é o caminho do Safari", run("installAvailability()") === "ios");
  const ios = run("renderSettingsScreen()");
  check("as instruções aparecem sem botão", /Adicionar à Tela de Início/.test(ios) && !/data-action="pwa-install"/.test(ios));

  section("5. Já instalado: nada a oferecer");
  matches = true;
  check("modo standalone é reconhecido", run("installAvailability()") === "installed");
  fire("beforeinstallprompt", makePrompt("accepted").event);
  check("mesmo com evento, instalado vence", run("installAvailability()") === "installed");
  check("o cartão não aparece", !/install-card/.test(run("renderSettingsScreen()")));
  matches = false;
  ctx.navigator.userAgent = "node";

  section("6. Pureza do que foi adicionado");
  const app = readSrc("js/app.js");
  check("o evento vive só em memória (não há campo novo no schema)", !/installPrompt/.test(readSrc("js/storage.js")));
  check("a tela não lê o evento direto, só a disponibilidade", !/state\.installPrompt/.test(readSrc("js/screens/settings.js")));
  check("preventDefault é chamado antes de guardar", /preventDefault\(\);\s*\n\s*state\.installPrompt = event/.test(app));

  console.log(`\n${failed ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})();
