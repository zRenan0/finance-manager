// test-critical-actions.js: ações que ligam a interface às regras financeiras.
//
// Os motores puros já têm testes próprios. Este arquivo protege a fronteira que
// recebe `data-action` da tela, valida o rascunho, chama a regra e grava o estado.
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
  "js/screens/modals.js",
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
  "js/safe-errors.js", "js/storage.js", "js/accounts.js", "js/debts.js", "js/budgets.js",
  "js/charts.js", "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js",
  "js/wealth.js", "js/goals.js", "js/forecast.js", "js/calendar.js", "js/recurring.js",
  "js/analytics.js", "js/insights.js", "js/assistant.js", "js/contextual-assistant.js",
  "js/advisor.js", "js/investments.js", "js/portfolio.js", "js/simulators.js", "js/qrcode.js",
  "js/achievements.js", "js/wrapped.js", "js/services.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"])
  .forEach((file) => vm.runInContext(readSrc(file), ctx, { filename: file }));

const run = (expression) => vm.runInContext(expression, ctx);
const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`}`);
  }
}

function section(label) {
  console.log(`\n${label}`);
}

function click(action, dataset) {
  const button = fakeElement("button");
  button.dataset = Object.assign({ action }, dataset || {});
  ctx.__event = {
    target: { closest: (selector) => selector === "[data-action]" ? button : null },
    preventDefault() {}, stopPropagation() {},
  };
  run("onClick(__event)");
}

function resetState() {
  run(`
    state.data = migrate(defaultData());
    state.tab = "dashboard";
    state.form = freshTxForm();
    state.editingTxId = null;
    state.editingTxReturnTab = "dashboard";
    state.goalForm = freshGoalForm();
    state.editingGoalId = null;
    state.confirmation = null;
    state.overlayStack = [];
    state.importRows = null;
    state.importFilename = null;
    state.importPendingFile = null;
    state.importDestinationId = "";
    state.importUndo = null;
    state.accountsUi.accountForm = null;
    state.accountsUi.cardForm = null;
    state.accountsUi.transferForm = null;
    state.accountsUi.payment = null;
  `);
}

async function acceptConfirmation() {
  click("confirmation-accept");
  await pause();
}

async function main() {
  section("1. Criar, editar e excluir lançamento no modo offline");
  resetState();
  ctx.navigator.onLine = false;
  run(`state.form = { ...freshTxForm(), amount: "125,50", description: "Mercado do bairro",
    categoryId: state.data.categories[0].id, date: todayIso(), payment: "Débito" };`);
  click("submit-tx");
  const transactionId = run("state.data.transactions[0] && state.data.transactions[0].id");
  check("o clique cria o lançamento mesmo sem rede", run("state.data.transactions.length") === 1);
  check("o valor passa pelo parser monetário", run("state.data.transactions[0].amount") === 125.5);

  click("edit-tx", { id: transactionId });
  check("editar abre o mesmo registro", run("state.editingTxId") === transactionId);
  run(`state.form.amount = "140,25"; state.form.description = "Mercado corrigido";`);
  click("submit-tx");
  check("salvar edição não duplica", run("state.data.transactions.length") === 1);
  check("a edição altera valor e descrição",
    run("state.data.transactions[0].amount === 140.25 && state.data.transactions[0].description === 'Mercado corrigido'"));

  click("delete-tx", { id: transactionId });
  check("exclusão espera confirmação", run("state.data.transactions.length") === 1 && !!run("state.confirmation"));
  await acceptConfirmation();
  check("confirmar remove o lançamento", run("state.data.transactions.length") === 0);
  check("a exclusão cria lápide para sincronização",
    run(`!!(state.data.graveyard.transactions && state.data.graveyard.transactions[${JSON.stringify(transactionId)}])`));
  ctx.navigator.onLine = true;

  section("2. Contas, transferência, cartão e pagamento de fatura");
  resetState();
  run(`state.accountsUi.accountForm = { ...freshAccountForm(), name: "Conta A", openingBalance: "1000,00" };`);
  click("account-save");
  run(`state.accountsUi.accountForm = { ...freshAccountForm(), name: "Conta B", openingBalance: "500,00" };`);
  click("account-save");
  const accountIds = run("state.data.accounts.map((account) => account.id)");
  check("as duas contas são criadas pela ação", accountIds.length === 2, accountIds);

  click("transfer-new");
  run(`state.accountsUi.transferForm.amount = "250,00"; state.accountsUi.transferForm.description = "Reserva";`);
  click("transfer-save");
  check("a transferência vira entidade própria", run("state.data.accountTransfers.length") === 1);
  check("a transferência não cria receita ou despesa", run("state.data.transactions.length") === 0);

  run(`state.accountsUi.cardForm = { ...freshCardForm(), name: "Cartão principal",
    accountId: state.data.accounts[0].id, limit: "3000,00", closingDay: "20", dueDay: "28" };`);
  click("card-save");
  const cardId = run("state.data.creditCards[0] && state.data.creditCards[0].id");
  check("o cartão é ligado à conta escolhida",
    run("state.data.creditCards.length === 1 && state.data.creditCards[0].accountId === state.data.accounts[0].id"));

  run(`state.form = { ...freshTxForm(), amount: "80,00", description: "Compra no cartão",
    categoryId: state.data.categories[0].id, date: todayIso(), payment: "Crédito",
    creditCardId: ${JSON.stringify(cardId)}, accountId: "" };`);
  click("submit-tx");
  const statementKey = run(`cardStatements(state.data, ${JSON.stringify(cardId)}).find((item) => item.outstanding > 0).key`);
  run(`state.accountsUi.payment = { creditCardId: ${JSON.stringify(cardId)},
    statementKey: ${JSON.stringify(statementKey)}, accountId: state.data.accounts[0].id,
    amount: "80,00", date: todayIso() };`);
  const countBeforePayment = run("state.data.transactions.length");
  click("card-pay-save");
  check("o pagamento cria movimento de fatura", run("state.data.cardPayments.length") === 1);
  check("pagar a fatura não duplica a despesa", run("state.data.transactions.length") === countBeforePayment);

  section("3. Criar, editar e excluir meta");
  resetState();
  run(`state.goalForm = { ...freshGoalForm(), show: true, name: "Reserva",
    target: "6000,00", deadline: "2099-12-31", monthlyPlan: "500,00" };`);
  click("submit-goal");
  const goalId = run("state.data.goals[0] && state.data.goals[0].id");
  check("a ação cria a meta", run("state.data.goals.length") === 1);
  click("edit-goal", { id: goalId });
  run(`state.goalForm.name = "Reserva familiar"; state.goalForm.target = "9000,00";`);
  click("submit-goal");
  check("a edição preserva o identificador",
    run(`state.data.goals.length === 1 && state.data.goals[0].id === ${JSON.stringify(goalId)}`));
  check("a edição atualiza os campos", run("state.data.goals[0].name === 'Reserva familiar' && state.data.goals[0].target === 9000"));
  click("delete-goal", { id: goalId });
  await acceptConfirmation();
  check("confirmar exclui a meta", run("state.data.goals.length") === 0);
  check("a meta excluída recebe lápide",
    run(`!!(state.data.graveyard.goals && state.data.graveyard.goals[${JSON.stringify(goalId)}])`));

  section("4. Orçamento de categoria");
  resetState();
  const categoryId = run("state.data.categories[0].id");
  click("apply-budget-suggestion", { id: categoryId, value: "650" });
  check("o teto é gravado na categoria certa",
    run(`state.data.categories.find((category) => category.id === ${JSON.stringify(categoryId)}).budget`) === 650);
  check("a alteração cria o retrato mensal do orçamento",
    run("Object.keys(state.data.budgetHistory || {}).length") > 0);

  section("5. Importação confirmada pela ação");
  resetState();
  run(`state.accountsUi.accountForm = { ...freshAccountForm(), name: "Conta importada", openingBalance: "0" };`);
  click("account-save");
  run(`
    state.importRows = prepareImportRows(
      "Data;Descrição;Valor\\n31/08/2026;Padaria;-12,50",
      "extrato.csv", state.data
    );
    state.importFilename = "extrato.csv";
    state.importDocumentKind = "account";
    state.importDestinationId = state.data.accounts[0].id;
  `);
  click("import-confirm");
  check("confirmar importa o lançamento selecionado", run("state.data.transactions.length") === 1);
  check("a origem mantém o nome do arquivo", run("state.data.transactions[0].origin.reference") === "extrato.csv");
  check("a ação registra o recibo de desfazer",
    run("state.importUndo && state.importUndo.transactionIds.length") === 1);

  section("6. Encaminhamento para autenticação, sincronização e restauração");
  ctx.__calls = { submit: [], logout: 0, sync: 0, backup: 0, importRetry: 0 };
  ctx.accountSubmit = (kind) => { ctx.__calls.submit.push(kind); };
  ctx.accountLogout = () => { ctx.__calls.logout += 1; };
  ctx.CloudSync = { schedule() {}, retry() { ctx.__calls.sync += 1; } };
  run(`
    confirmBackupRestore = () => { __calls.backup += 1; };
    handleStatementFile = () => { __calls.importRetry += 1; };
    state.importPendingFile = { name: "protegido.cofre" };
  `);
  click("account-submit", { value: "login" });
  click("account-logout");
  click("account-sync-now");
  click("backup-confirm");
  click("import-password-retry");
  check("login recebe o modo pedido", ctx.__calls.submit.length === 1 && ctx.__calls.submit[0] === "login", ctx.__calls);
  check("logout chega ao serviço de conta", ctx.__calls.logout === 1, ctx.__calls);
  check("sincronizar agora chega ao motor", ctx.__calls.sync === 1, ctx.__calls);
  check("restauração chega ao fluxo validado de backup", ctx.__calls.backup === 1, ctx.__calls);
  check("arquivo protegido volta ao importador com a senha", ctx.__calls.importRetry === 1, ctx.__calls);

  console.log(`\n${failed === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"}: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
