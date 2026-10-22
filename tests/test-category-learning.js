// test-category-learning.js: corrigir uma vez, valer para o estabelecimento.
//
// Arrumar o extrato era repetir o mesmo gesto linha por linha, e o app
// aprendia pouco com isso. Três coisas ficam protegidas aqui:
//   1. na revisão da importação, a categoria escolhida numa linha se espalha
//      para as linhas parecidas do arquivo, sem sobrescrever escolha anterior;
//   2. a escolha feita na revisão entra na memória de categorias com peso de
//      decisão (registro de edição), não de palpite;
//   3. mudar a categoria de um lançamento na edição oferece mover os outros do
//      mesmo estabelecimento, e só move depois de confirmado.
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
function changeSelect(actionSelect, id, value) {
  ctx.__change = { target: { dataset: { actionSelect, id: String(id) }, value, id: "", files: null } };
  run("onChange(__change)");
}

const hoje = run("todayIso()");
const dia = (n) => run(`addDaysToIso("${hoje}", ${n})`);
const catId = (nome) => run(`state.data.categories.find((c) => c.name === ${JSON.stringify(nome)}).id`);

(async () => {
  run(`state.data = migrate({ ...defaultData(), accounts: [makeAccount({ id: "acc-a", name: "Conta A", openingBalance: 5000, openingDate: "${dia(-400)}" })] });`);
  const transporte = catId("Transporte");
  const lazer = catId("Lazer");

  section("1. Na revisão, a escolha se espalha pelo estabelecimento, sem passar por cima de escolha anterior");
  const linha = (over) => ({ type: "expense", amount: 20, date: hoje, include: true, importAs: "transaction", categoryId: "outros", categoryChosen: false, confidence: "baixa", categoryReason: null, ...over });
  ctx.__rows = [
    linha({ description: "UBER *TRIP 123 SAO PAULO" }),
    linha({ description: "UBER *TRIP 456 SAO PAULO" }),
    linha({ description: "UBER *TRIP 789 SAO PAULO", categoryId: lazer, categoryChosen: true }),
    linha({ description: "IFOOD *RESTAURANTE" }),
    linha({ description: "UBER *TRIP 111 SAO PAULO", type: "income", categoryId: null }),
    linha({ description: "UBER *TRIP 222 SAO PAULO", importAs: "transfer" }),
    linha({ description: "UBER *TRIP 333 SAO PAULO", categoryId: transporte }),
  ];
  check("as linhas do mesmo estabelecimento têm o mesmo núcleo", run(`statementMerchantCore(__rows[0].description) === statementMerchantCore(__rows[1].description)`));
  run(`__rows[0].categoryId = ${JSON.stringify(transporte)}; __rows[0].categoryChosen = true;`);
  const alteradas = run("propagateImportCategory(__rows, 0)");
  check("só a linha parecida que ainda tinha palpite muda", JSON.stringify(alteradas) === "[1]", alteradas);
  check("a linha propagada recebe a categoria e explica por quê", run("__rows[1].categoryId") === transporte && /corrigiu/.test(run("__rows[1].categoryReason")));
  check("a linha propagada não vira escolha manual (uma nova correção ainda pode alcançá-la)", run("__rows[1].categoryChosen") === false);
  check("escolha anterior da pessoa não é sobrescrita", run("__rows[2].categoryId") === lazer);
  check("outro estabelecimento não muda", run("__rows[3].categoryId") === "outros");
  check("receita e transferência ficam de fora", run("__rows[4].categoryId") === null && run("__rows[5].categoryId") === "outros");
  check("linha que já estava certa não entra na contagem", !alteradas.includes(6));
  ctx.__curta = [linha({ description: "PIX", categoryId: transporte, categoryChosen: true }), linha({ description: "PIX" })];
  check("núcleo curto demais não espalha nada", run("propagateImportCategory(__curta, 0).length") === 0);
  check("índice inválido não quebra", run("propagateImportCategory(__rows, 99).length") === 0 && run("propagateImportCategory(null, 0).length") === 0);

  section("2. O seletor da tela faz o mesmo e avisa");
  run(`state.importRows = __rows.map((r) => ({ ...r, categoryId: "outros", categoryChosen: false })); state.importRows[2].categoryId = ${JSON.stringify(lazer)}; state.importRows[2].categoryChosen = true; state.toast = null;`);
  changeSelect("import-category", 1, transporte);
  check("a linha escolhida fica marcada como escolha", run("state.importRows[1].categoryChosen") === true && run("state.importRows[1].categoryId") === transporte);
  check("as parecidas acompanham", run("state.importRows[0].categoryId") === transporte && run("state.importRows[6].categoryId") === transporte);
  check("o aviso diz quantas foram", /2 linhas parecidas/.test(String(run("state.toast") || "")), run("state.toast"));
  run("state.toast = null;");
  changeSelect("import-category", 3, lazer);
  check("sem parecidas, sem aviso", run("state.toast") === null && run("state.importRows[3].categoryId") === lazer);

  section("3. A escolha da revisão vira memória com peso de decisão");
  const gravadas = run(`buildTransactionsFromRows(state.importRows.filter((r) => r.type === "expense" && r.importAs !== "transfer"), "csv", { documentKind: "account", destinationId: "acc-a" }, "extrato.csv")`);
  const escolhida = gravadas.find((t) => /456/.test(t.description));
  const propagada = gravadas.find((t) => /123/.test(t.description));
  check("a linha escolhida leva registro de edição de categoria", escolhida && run(`transactionCategoryChosenByUser(${JSON.stringify(escolhida)})`) === true, escolhida && escolhida.changeLog);
  check("o registro continua começando por 'criado'", escolhida && escolhida.changeLog[0].action === "created" && escolhida.changeLog[1].action === "edited");
  check("a linha propagada não finge decisão", propagada && run(`transactionCategoryChosenByUser(${JSON.stringify(propagada)})`) === false);
  ctx.__gravadas = gravadas;
  const lembrada = run(`recallCategoryFromMemory({ ...state.data, transactions: __gravadas }, "UBER *TRIP 999 SAO PAULO")`);
  check("na próxima importação o app lembra, como decisão sua", !!lembrada && lembrada.categoryId === transporte && lembrada.manual === true, lembrada);
  const sugestao = run(`suggestCategoryForDescription({ ...state.data, transactions: __gravadas }, "UBER *TRIP 999 SAO PAULO")`);
  check("e sugere com confiança alta", sugestao.categoryId === transporte && sugestao.confidence === "alta", sugestao);

  section("4. Na edição, mudar a categoria oferece mover os parecidos; nada se move sem confirmação");
  run(`
    state.data = migrate({ ...state.data, transactions: [
      makeTransaction({ id: "p1", type: "expense", amount: 200, categoryId: "outros", date: "${dia(-30)}", description: "POSTO SHELL AV PAULISTA", payment: "Débito", accountId: "acc-a" }),
      makeTransaction({ id: "p2", type: "expense", amount: 180, categoryId: "outros", date: "${dia(-20)}", description: "POSTO SHELL AV PAULISTA", payment: "Débito", accountId: "acc-a" }),
      makeTransaction({ id: "p3", type: "expense", amount: 210, categoryId: "outros", date: "${dia(-10)}", description: "POSTO SHELL AV PAULISTA", payment: "Débito", accountId: "acc-a" }),
      makeTransaction({ id: "p4", type: "expense", amount: 190, categoryId: ${JSON.stringify(transporte)}, date: "${dia(-5)}", description: "POSTO SHELL AV PAULISTA", payment: "Débito", accountId: "acc-a" }),
      makeTransaction({ id: "o1", type: "expense", amount: 50, categoryId: "outros", date: "${dia(-3)}", description: "PADARIA DO BAIRRO", payment: "Débito", accountId: "acc-a" }),
    ] });
    state.tab = "analytics"; state.confirmation = null; state.overlayStack = []; state.editingTxId = null;
  `);
  click("edit-tx", { id: "p1" });
  run(`state.form.categoryId = ${JSON.stringify(transporte)};`);
  click("submit-tx");
  check("o lançamento editado muda na hora", run(`state.data.transactions.find((t) => t.id === "p1").categoryId`) === transporte);
  check("a pergunta aparece", !!run("state.confirmation"), run("state.confirmation"));
  check("conta só os que estão em outra categoria", /2 outros lançamentos/.test(String(run("state.confirmation && state.confirmation.message"))), run("state.confirmation && state.confirmation.message"));
  check("ainda nada foi movido", run(`state.data.transactions.filter((t) => t.id !== "p1" && t.categoryId === "outros").length`) === 3);
  click("confirmation-accept");
  await pause();
  check("confirmado, os parecidos mudam", run(`["p2", "p3"].every((id) => state.data.transactions.find((t) => t.id === id).categoryId === ${JSON.stringify(transporte)})`));
  check("o que não é do mesmo lugar fica como estava", run(`state.data.transactions.find((t) => t.id === "o1").categoryId`) === "outros");
  check("os movidos recebem registro de edição", run(`transactionCategoryChosenByUser(state.data.transactions.find((t) => t.id === "p2"))`) === true);
  const memoria = run(`recallCategoryFromMemory(state.data, "POSTO SHELL AV PAULISTA")`);
  check("a memória passa a preferir a categoria escolhida", !!memoria && memoria.categoryId === transporte && memoria.manual === true, memoria);

  // Editar sem mudar a categoria não pergunta nada.
  run("state.confirmation = null;");
  click("edit-tx", { id: "p2" });
  run(`state.form.amount = "181,00";`);
  click("submit-tx");
  check("mudar só o valor não pergunta", run("state.confirmation") === null);

  // Sem parecidos, também não.
  click("edit-tx", { id: "o1" });
  run(`state.form.categoryId = ${JSON.stringify(lazer)};`);
  click("submit-tx");
  check("sem parecidos não pergunta", run("state.confirmation") === null && run(`state.data.transactions.find((t) => t.id === "o1").categoryId`) === lazer);

  // Recusar deixa tudo como estava.
  run(`state.data = migrate({ ...state.data, transactions: state.data.transactions.map((t) => (t.id === "p3" ? { ...t, categoryId: "outros" } : t)) }); state.confirmation = null;`);
  click("edit-tx", { id: "p1" });
  run(`state.form.categoryId = ${JSON.stringify(lazer)};`);
  click("submit-tx");
  check("a pergunta volta para a nova categoria", /3 outros lançamentos/.test(String(run("state.confirmation && state.confirmation.message"))), run("state.confirmation && state.confirmation.message"));
  click("confirmation-cancel");
  await pause();
  check("recusar não move ninguém", run(`state.data.transactions.find((t) => t.id === "p2").categoryId`) === transporte && run(`state.data.transactions.find((t) => t.id === "p3").categoryId`) === "outros");

  section("5. O auxiliar é puro e seletivo");
  check("similarExpensesByMerchant exclui o próprio, aporte, dívida e transferência", run(`
    similarExpensesByMerchant({ transactions: [
      { id: "a", type: "expense", description: "POSTO SHELL AV PAULISTA" },
      { id: "b", type: "expense", description: "POSTO SHELL AV PAULISTA", nature: "aporte" },
      { id: "c", type: "expense", description: "POSTO SHELL AV PAULISTA", goalId: "g1" },
      { id: "d", type: "expense", description: "POSTO SHELL AV PAULISTA", nature: "transferencia" },
      { id: "e", type: "income", description: "POSTO SHELL AV PAULISTA" },
      { id: "f", type: "expense", description: "POSTO SHELL AV PAULISTA", nature: "consumo" },
    ] }, "POSTO SHELL AV PAULISTA", "a").map((t) => t.id).join(",")
  `) === "f");
  check("descrição curta demais não casa com nada", run(`similarExpensesByMerchant({ transactions: [{ id: "a", type: "expense", description: "PIX" }] }, "PIX", "zz").length`) === 0);

  console.log(`\n${failed ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})();
