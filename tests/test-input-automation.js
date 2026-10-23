// test-input-automation.js: menos trabalho repetido para pôr dados no app.
//
// Duas automações, ambas com desfazer: (1) gasto fixo do mês passado entra
// sozinho no vencimento deste mês, quando a pessoa liga; (2) extrato em que
// nada pede decisão entra sem a tela de revisão. O risco é lançar o que a
// pessoa não pediu, então metade dos casos aqui é sobre o que NÃO acontece.
// Relógio fixo no dia 15 (tests/helpers/fixed-clock.js).
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

const ctx = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: {
    readyState: "loading", documentElement: fakeElement(), body: fakeElement(), activeElement: null,
    visibilityState: "visible", getElementById() { return fakeElement(); },
    querySelector() { return fakeElement(); }, querySelectorAll() { return []; },
    createElement(tag) { return fakeElement(tag); }, addEventListener() {}, removeEventListener() {},
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame() { return 0; }, requestIdleCallback() { return 0; },
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined, module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  alert() {}, confirm() { return true; }, prompt() { return null; },
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
require("./helpers/fixed-clock").congelar(ctx);

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


const hoje = run("todayIso()");
const mesAtual = run("keyOfCurrentMonth()");
const mesPassado = run("keyOfDate(addMonths(new Date(), -1))");
const noMesPassado = (dia) => `${mesPassado}-${String(dia).padStart(2, "0")}`;

function montarBase(automation) {
  ctx.__auto = automation || {};
  run(`
    state.demo = { active: false };
    state.onboarding.open = false;
    state.booting = false;
    state.autoPostedFixed = null;
    state.data = migrate({ ...defaultData(),
      monthlyIncome: 6000,
      automation: __auto,
      accounts: [makeAccount({ id: "acc-a", name: "Conta A", openingBalance: 5000, openingDate: "2020-01-01" })],
      transactions: [
        makeTransaction({ id: "aluguel-ant", type: "expense", amount: 1800, categoryId: "moradia", date: "${noMesPassado(5)}", description: "Aluguel", recurring: true, payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "net-ant", type: "expense", amount: 119.9, categoryId: "moradia", date: "${noMesPassado(28)}", description: "Internet", recurring: true, payment: "Débito", accountId: "acc-a" }),
        makeTransaction({ id: "avulso", type: "expense", amount: 60, categoryId: "lazer", date: "${noMesPassado(9)}", description: "Cinema", payment: "Pix", accountId: "acc-a" }),
      ],
    });
  `);
}

section("1. Preferência de automação");
{
  const padrao = run("normalizeAutomation(undefined)");
  check("gastos fixos automáticos nascem desligados", padrao.autoPostFixed === false);
  check("importação direta nasce ligada", padrao.importAutoConfirm === true);
  check("valor estranho volta ao padrão", run("normalizeAutomation({ autoPostFixed: 'sim', importAutoConfirm: 0 })").autoPostFixed === false);
  check("a chave é persistida em settings", run("SETTING_KEYS").includes("automation"));
  const schema = fs.readFileSync(path.join(ROOT, "netlify/functions/_shared/finance-schema.js"), "utf8");
  check("o servidor aceita a chave na sincronização", /"automation"/.test(schema));
}

section("2. O que está vencido e o que espera o dia");
{
  montarBase();
  const devidos = run(`fixedDueToPost(state.data, "${mesAtual}", "${hoje}")`).map((t) => t.description);
  check("o aluguel do dia 5 já venceu (hoje é dia 15)", devidos.includes("Aluguel"), devidos);
  check("a internet do dia 28 ainda não", !devidos.includes("Internet"), devidos);
  check("gasto não marcado como fixo nunca entra", !devidos.includes("Cinema"), devidos);
  const id1 = run(`fixedAutoPostId(state.data.transactions[0], "${mesAtual}")`);
  const id2 = run(`fixedAutoPostId({ ...state.data.transactions[0], amount: 999 }, "${mesAtual}")`);
  check("o id automático é o mesmo para o mesmo modelo no mesmo mês", id1 === id2 && /^fixo-/.test(id1), [id1, id2]);
  check("o id é aceito como identificador seguro", run(`normalizeRecordId("${id1}")`) === id1);
}

section("3. Desligado, nada entra sozinho");
{
  montarBase({ autoPostFixed: false });
  const n = run("runAutoPostFixed({ silent: true })");
  check("sem a automação, nenhum lançamento é criado", n === 0 && run("state.data.transactions.length") === 3);
}

section("4. Ligado, entra o que venceu, na data do vencimento");
{
  montarBase({ autoPostFixed: true });
  const n = run("runAutoPostFixed({ silent: true })");
  check("um gasto fixo entrou", n === 1, n);
  const novo = run(`state.data.transactions.find((t) => /^fixo-/.test(t.id))`);
  check("é o aluguel, com o valor do mês passado", novo && novo.description === "Aluguel" && novo.amount === 1800, novo && novo.description);
  check("datado no dia 5 deste mês, não hoje", novo && novo.date === `${mesAtual}-05`, novo && novo.date);
  check("continua marcado como fixo", novo && novo.recurring === true);
  check("a origem diz que foi automático", novo && /automaticamente/.test(novo.origin.label), novo && novo.origin);
  check("o aviso guarda o que entrou para desfazer", run("state.autoPostedFixed.ids.length") === 1);
  check("rodar de novo não duplica", run("runAutoPostFixed({ silent: true })") === 0 && run("state.data.transactions.length") === 4);
  check("o aviso de pergunta some com a automação ligada", !run("renderDashboardScreen()").includes('data-action="carry-post-all"'));
  check("o Início mostra o que entrou com desfazer", run("renderDashboardScreen()").includes('data-action="auto-fixed-undo"'));
}

section("5. Desfazer segura o resto do mês");
{
  montarBase({ autoPostFixed: true });
  run("runAutoPostFixed({ silent: true })");
  click("auto-fixed-undo");
  check("o lançamento automático saiu", run("state.data.transactions.some((t) => /^fixo-/.test(t.id))") === false);
  check("o mês fica marcado como recusado", run("state.data.dismissedCarryForwardMonth") === mesAtual);
  check("nada volta a entrar neste mês", run("runAutoPostFixed({ silent: true })") === 0);
}

section("6. Demonstração e configuração inicial ficam de fora");
{
  montarBase({ autoPostFixed: true });
  run("state.demo = { active: true }");
  check("na demonstração nada é lançado", run("runAutoPostFixed({ silent: true })") === 0);
  run("state.demo = { active: false }; state.onboarding.open = true;");
  check("com a configuração inicial aberta nada é lançado", run("runAutoPostFixed({ silent: true })") === 0);
}

section("7. Um toque no aviso liga e lança");
{
  montarBase({ autoPostFixed: false });
  check("o aviso oferece lançar sempre sozinho", run("renderDashboardScreen()").includes('data-action="carry-auto-on"'));
  click("carry-auto-on");
  check("a automação ficou ligada", run("normalizeAutomation(state.data.automation).autoPostFixed") === true);
  check("o que venceu já entrou", run("state.data.transactions.filter((t) => /^fixo-/.test(t.id)).length") === 1);
}

section("8. Importar sem revisão: quando pode e quando não pode");
{
  const linha = (o) => ({ include: true, type: "expense", confidence: "alta", duplicate: false, duplicateKind: null, recordedTransferStatus: "none", importAs: "transaction", ...o });
  const lote = (rows, meta) => { const r = rows.slice(); r.meta = { confidence: "alta", skipped: 0, ...(meta || {}) }; return r; };
  ctx.__check = (rows, ctxImp) => { ctx.__r = rows; ctx.__c = ctxImp; return run("importAutoConfirmCheck(__r, __c)"); };
  const ok = ctx.__check(lote([linha(), linha({ type: "income", confidence: "baixa" })]), { destinationCount: 1 });
  check("tudo certo: entra direto", ok.eligible === true, ok.reasons);
  check("receita não pede categoria", ok.included === 2);
  const exata = ctx.__check(lote([linha(), linha({ include: false, duplicate: true, duplicateKind: "exata" })]), { destinationCount: 1 });
  check("repetição exata é descartada sem pedir revisão", exata.eligible === true && exata.skippedDuplicates === 1, exata.reasons);
  const parecida = ctx.__check(lote([linha(), linha({ include: false, duplicate: true, duplicateKind: "parecida" })]), { destinationCount: 1 });
  check("linha parecida com lançamento existente pede revisão", parecida.eligible === false && /parece/.test(parecida.reasons.join()), parecida.reasons);
  const semCategoria = ctx.__check(lote([linha(), linha({ confidence: "media" })]), { destinationCount: 1 });
  check("gasto com categoria incerta pede revisão", semCategoria.eligible === false && /categoria/.test(semCategoria.reasons.join()));
  const doisDestinos = ctx.__check(lote([linha()]), { destinationCount: 2 });
  check("mais de um destino pede revisão", doisDestinos.eligible === false && /destino/.test(doisDestinos.reasons.join()));
  const leituraFraca = ctx.__check(lote([linha()], { confidence: "media", skipped: 3 }), { destinationCount: 1 });
  check("leitura sem confiança alta ou linha não lida pede revisão", leituraFraca.eligible === false && leituraFraca.reasons.length === 2, leituraFraca.reasons);
  const ambigua = ctx.__check(lote([linha({ recordedTransferStatus: "ambiguous" })]), { destinationCount: 1 });
  check("transferência ambígua pede revisão", ambigua.eligible === false);
  const vazio = ctx.__check(lote([linha({ include: false, duplicate: true, duplicateKind: "exata" })]), { destinationCount: 1 });
  check("arquivo sem nada novo não grava nada sozinho", vazio.eligible === false);
}

section("9. A gravação direta usa o mesmo caminho da revisão e tem desfazer");
{
  montarBase();
  run(`
    state.importRows = [{ include: true, type: "expense", amount: 42.5, date: "${hoje}", description: "Padaria", categoryId: "alimentacao", confidence: "alta", importAs: "transaction" }];
    state.importRows.meta = { format: "csv", confidence: "alta", skipped: 0 };
    state.importDocumentKind = "account"; state.importDestinationId = "acc-a"; state.importFilename = "extrato.csv";
  `);
  const r = run("commitImportRows({ auto: true, filename: 'extrato.csv', skippedDuplicates: 2 })");
  check("um lançamento gravado", r && r.transactions === 1, r);
  check("o desfazer da importação está pronto", run("state.importUndo && state.importUndo.transactionIds.length") === 1);
  check("o Início avisa que entrou sem revisão, com desfazer", run("renderDashboardScreen()").includes("sem revisão") && run("renderDashboardScreen()").includes('data-action="import-undo"'));
  check("as linhas descartadas por repetição são ditas", run("renderDashboardScreen()").includes("2 linhas já lançadas ficaram"));
  check("a tela de importação oferece desligar", run("renderImportScreen()").includes('data-action="import-auto-toggle"'));
  click("import-auto-toggle");
  check("o interruptor desliga a importação direta", run("normalizeAutomation(state.data.automation).importAutoConfirm") === false);
}

section("10. Ajustes");
{
  montarBase();
  run("state.settingsSection = 'automacao'");
  const html = run("renderSettingsScreen()");
  check("há uma seção de Automação com os dois interruptores", html.includes("Automação") && html.includes('data-action="auto-fixed-toggle"') && html.includes('data-action="import-auto-toggle"'));
}

console.log(`\n${failed === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${passed} ok, ${failed} falha(s)\n`);
process.exit(failed === 0 ? 0 : 1);
