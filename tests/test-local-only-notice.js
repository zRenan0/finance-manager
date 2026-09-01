// test-local-only-notice.js — [M26] aviso de dados somente locais.
//
// O risco deste módulo não é o aviso não aparecer; é ele aparecer DEMAIS. Um
// alerta permanente na tela inicial de um app de dinheiro vira ruído em uma
// semana e deixa de ser lido justamente por quem precisa. Por isso a maior
// parte do teste é sobre quando ele NÃO deve aparecer.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const SCREEN_FILES = [
  "js/screens/_shared.js", "js/screens/onboarding.js", "js/screens/dashboard.js", "js/screens/accounts.js",
  "js/screens/debts.js", "js/screens/add.js", "js/screens/analytics.js", "js/screens/goals.js",
  "js/screens/calendar.js", "js/screens/health.js", "js/screens/wealth.js", "js/screens/portfolio.js",
  "js/screens/invest.js", "js/screens/simulators.js", "js/screens/simulate.js", "js/screens/insights.js",
  "js/screens/subscriptions.js", "js/screens/notifications.js", "js/screens/achievements.js",
  "js/screens/import.js", "js/screens/categories.js", "js/screens/settings.js", "js/screens/modals.js",
];

function fakeEl() {
  return {
    innerHTML: "", value: "", disabled: false, hidden: false, style: {}, dataset: {}, textContent: "",
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
}
const ctx = {
  console,
  document: {
    documentElement: fakeEl(), body: fakeEl(),
    getElementById() { return fakeEl(); },
    querySelector() { return fakeEl(); }, querySelectorAll() { return []; },
    createElement() { return fakeEl(); },
    addEventListener() {}, removeEventListener() {},
    activeElement: null, visibilityState: "visible",
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  history: { state: null, pushState() {}, replaceState() {}, go() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0), requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined,
  module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  alert() {}, confirm() { return true; }, prompt() { return null; },
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/debts.js",
  "js/budgets.js", "js/charts.js", "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js",
  "js/wealth.js", "js/goals.js", "js/forecast.js", "js/calendar.js", "js/recurring.js", "js/analytics.js",
  "js/insights.js", "js/assistant.js", "js/advisor.js", "js/investments.js", "js/portfolio.js", "js/simulators.js",
  "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js", "js/demo.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

// Base com um lançamento, sem conta e sem backup: o único cenário em que o
// aviso tem razão de existir.
function cenarioBase() {
  run(`
    state.data = migrate(defaultData());
    state.data.transactions = [makeTransaction({ type: "expense", amount: 50, categoryId: "outros", date: todayIso(), description: "Café" })];
    state.data.lastBackupAt = null;
    state.booting = false;
    state.localOnlyDismissed = false;
    state.demo = { active: false };
    state.account = { ...state.account, authenticated: false };
  `);
}

section("1. Aparece exatamente quando há o que perder");
{
  cenarioBase();
  check("com lançamento, sem conta e sem backup, aparece", run(`shouldWarnLocalOnly()`) === true);

  run(`state.data.transactions = [];`);
  check("sem nenhum lançamento, não aparece", run(`shouldWarnLocalOnly()`) === false);

  cenarioBase();
  run(`state.account = { ...state.account, authenticated: true };`);
  check("com conta ligada, não aparece", run(`shouldWarnLocalOnly()`) === false);

  cenarioBase();
  run(`state.data.lastBackupAt = todayIso();`);
  check("com backup de hoje, não aparece", run(`shouldWarnLocalOnly()`) === false);

  run(`state.data.lastBackupAt = isoOfDate(new Date(Date.now() - 20 * 86400000));`);
  check("com backup de 20 dias, ainda não aparece", run(`shouldWarnLocalOnly()`) === false);

  run(`state.data.lastBackupAt = isoOfDate(new Date(Date.now() - 40 * 86400000));`);
  check("com backup de 40 dias, volta a aparecer", run(`shouldWarnLocalOnly()`) === true);

  cenarioBase();
  run(`state.localOnlyDismissed = true;`);
  check("dispensado na sessão, não aparece", run(`shouldWarnLocalOnly()`) === false);

  cenarioBase();
  run(`state.demo = { active: true };`);
  check("na demonstração, não aparece", run(`shouldWarnLocalOnly()`) === false,
    "avisar sobre perder dado fictício seria mentira");

  cenarioBase();
  run(`state.booting = true;`);
  check("durante o carregamento, não aparece", run(`shouldWarnLocalOnly()`) === false);
}

section("2. O texto informa sem alarmar");
{
  cenarioBase();
  const html = run(`renderLocalOnlyNotice()`);
  check("diz a frase do roteiro", html.includes("Seus dados estão salvos somente neste dispositivo"));
  check("diz que ainda não há backup", /Ainda não há backup/.test(html));
  check("oferece a ação", /data-action="protect-data"/.test(html) && /Proteger meus dados/.test(html));
  check("dá como dispensar", /data-action="local-only-dismiss"/.test(html));
  check("o botão de dispensar tem rótulo acessível", /aria-label="Dispensar aviso/.test(html));
  check("é uma linha, não um cartão", /^<p class="local-only"/.test(html.trim()));
  check("é anunciado como status, não como alerta", /role="status"/.test(html) && !/role="alert"/.test(html));

  // Nada de linguagem de susto. A lista é do roteiro do módulo: sem alarme.
  ["perigo", "atenção!", "cuidado!", "urgente", "irreversível", "você vai perder", "risco de perder"]
    .forEach((palavra) => check(`sem alarme: não usa "${palavra}"`, !new RegExp(palavra, "i").test(html)));

  run(`state.data.lastBackupAt = isoOfDate(new Date(Date.now() - 40 * 86400000));`);
  check("com backup velho, o texto muda", /último backup foi há mais de 30 dias/i.test(run(`renderLocalOnlyNotice()`)));
}

section("3. A ação leva às duas saídas reais");
{
  run(`state.confirmation = null; openProtectDataDialog();`);
  const c = run(`JSON.parse(JSON.stringify({ ...state.confirmation, onConfirm: undefined, onAlternate: undefined }))`);
  check("abre a confirmação", !!c);
  check("oferece o backup", c.confirmLabel === "Baixar backup completo");
  check("oferece a conta", c.alternateLabel === "Criar conta e sincronizar");
  check("permite recusar", c.cancelLabel === "Agora não");
  check("não usa tom de perigo", c.tone === "default", c.tone);
  check("explica backup, conta e o risco concreto",
    /Baixar um backup/.test(c.message) && /ligar uma conta/.test(c.message)
    && /limpar os dados do site/.test(c.message) && /desinstalar/.test(c.message));
  check("o rótulo do backup é o mesmo do M12",
    readSrc("js/screens/settings.js").includes("Baixar backup completo"));
  run(`state.confirmation = null;`);

  const acoes = readSrc("js/actions.js");
  check("as duas ações têm case", /case "protect-data"/.test(acoes) && /case "local-only-dismiss"/.test(acoes));
}

section("4. Não invadiu o resto do app");
{
  const painel = readSrc("js/screens/dashboard.js");
  check("o aviso mora só na tela inicial",
    (painel.match(/renderLocalOnlyNotice\(\)/g) || []).length === 1);
  check("fica depois do cabeçalho e antes do resto",
    /renderDashboardHeader\(model\)\}\s*\$\{shouldWarnLocalOnly\(\)/.test(painel.replace(/\r?\n\s*/g, " ")));
  check("a dispensa é de sessão, não vai para o schema",
    !/localOnlyDismissed/.test(readSrc("js/storage.js")));
  check("nenhuma outra tela ganhou o aviso",
    SCREEN_FILES.filter((f) => f !== "js/screens/dashboard.js")
      .every((f) => !/renderLocalOnlyNotice/.test(readSrc(f))));
}

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
