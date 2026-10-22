// test-quick-entry.js: lançar mais rápido.
//
// Três atalhos do formulário de lançamento, todos em cima de dado que já
// existe: "Repetir um recente" (modelos tirados do histórico), "Hoje/Ontem" no
// campo de data e "Duplicar" na edição. O risco aqui não é a conta, é o atalho
// fazer algo que a pessoa não pediu: repetir uma parcela, relançar um aporte de
// meta por um toque distraído, ou gravar com a data do lançamento antigo.
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
const dia = (n) => run(`addDaysToIso("${hoje}", ${n})`);

// Base: duas contas, um cartão e um histórico com os casos que o modelo tem de
// incluir e os que tem de deixar de fora.
function montarBase() {
  run(`
    state.data = migrate({ ...defaultData(),
      monthlyIncome: 7200,
      accounts: [
        makeAccount({ id: "acc-a", name: "Conta A", openingBalance: 5000, openingDate: "${dia(-400)}" }),
        makeAccount({ id: "acc-b", name: "Conta B", openingBalance: 500, openingDate: "${dia(-400)}" }),
      ],
      creditCards: [makeCreditCard({ id: "card-a", name: "Cartão", accountId: "acc-a", limit: 5000, closingDay: 20, dueDay: 28 })],
      transactions: [
        makeTransaction({ id: "m1", type: "expense", amount: 220, categoryId: "mercado", date: "${dia(-16)}", description: "Mercado", payment: "Débito", accountId: "acc-a" }),
        makeTransaction({ id: "m2", type: "expense", amount: 230, categoryId: "mercado", date: "${dia(-9)}", description: "mercado", payment: "Débito", accountId: "acc-a" }),
        makeTransaction({ id: "m3", type: "expense", amount: 250.14, categoryId: "mercado", date: "${dia(-2)}", description: "Mercado", payment: "Pix", accountId: "acc-b" }),
        makeTransaction({ id: "u1", type: "expense", amount: 22, categoryId: "transporte", date: "${dia(-5)}", description: "Uber", payment: "Crédito", creditCardId: "card-a", accountId: "acc-a" }),
        makeTransaction({ id: "u2", type: "expense", amount: 18.5, categoryId: "transporte", date: "${dia(-1)}", description: "Uber", payment: "Crédito", creditCardId: "card-a", accountId: "acc-a" }),
        makeTransaction({ id: "sem-desc", type: "expense", amount: 60, categoryId: "lazer", date: "${dia(-4)}", description: "", payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "fixo", type: "expense", amount: 119, categoryId: "saude", date: "${dia(-3)}", description: "Academia", recurring: true, payment: "Débito", accountId: "acc-a" }),
        makeTransaction({ id: "parc", type: "expense", amount: 300, categoryId: "outros", date: "${dia(-6)}", description: "Notebook", installmentGroupId: "g1", installmentIndex: 1, installmentCount: 10, payment: "Crédito", creditCardId: "card-a", accountId: "acc-a" }),
        makeTransaction({ id: "aporte", type: "expense", amount: 600, categoryId: "investimentos", date: "${dia(-7)}", description: "Aporte na reserva", nature: "aporte", payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "velho", type: "expense", amount: 200, categoryId: "lazer", date: "${dia(-200)}", description: "Presente", payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "futuro", type: "expense", amount: 900, categoryId: "lazer", date: "${dia(5)}", description: "Viagem", payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "zero", type: "expense", amount: 0, categoryId: "lazer", date: "${dia(-1)}", description: "Nada", payment: "Pix", accountId: "acc-a" }),
        makeTransaction({ id: "s1", type: "income", amount: 7200, categoryId: "outros", date: "${dia(-20)}", description: "Salário", payment: "Pix", accountId: "acc-a", recurring: true }),
        makeTransaction({ id: "f1", type: "income", amount: 750, categoryId: "outros", date: "${dia(-10)}", description: "Freela", payment: "Pix", accountId: "acc-b" }),
        makeTransaction({ id: "f2", type: "income", amount: 800, categoryId: "outros", date: "${dia(-3)}", description: "Freela", payment: "Pix", accountId: "acc-b" }),
      ],
    });
    state.tab = "add"; state.form = freshTxForm(); state.editingTxId = null; state.editingTxReturnTab = "dashboard";
    state.confirmation = null; state.overlayStack = [];
  `);
}

section("1. Os modelos saem do hábito, não do arquivo");
{
  montarBase();
  const antes = run("JSON.stringify(state.data.transactions)");
  const gastos = run(`recentTransactionTemplates(state.data, { type: "expense", limit: 4 })`);
  check("a função é pura", run("JSON.stringify(state.data.transactions)") === antes);
  check("o mais repetido vem primeiro", gastos[0] && gastos[0].description === "Mercado" && gastos[0].count === 3, gastos.map((g) => `${g.label}:${g.count}`));
  check("descrição é agrupada sem diferenciar maiúsculas", gastos[0] && gastos[0].count === 3);
  check("o valor é o da última vez, não a média", gastos[0] && gastos[0].amount === 250.14, gastos[0] && gastos[0].amount);
  check("pagamento e conta também são os da última vez", gastos[0] && gastos[0].payment === "Pix" && gastos[0].accountId === "acc-b", gastos[0]);
  check("o segundo é o Uber, com o cartão", gastos[1] && gastos[1].description === "Uber" && gastos[1].count === 2 && gastos[1].creditCardId === "card-a" && gastos[1].amount === 18.5);
  const rotulos = gastos.map((g) => g.label);
  check("sem descrição, o rótulo é o nome da categoria", rotulos.includes("Lazer"), rotulos);
  check("gasto fixo fica de fora", !rotulos.includes("Academia"), rotulos);
  check("parcela fica de fora", !rotulos.includes("Notebook"), rotulos);
  check("aporte de meta fica de fora", !rotulos.includes("Aporte na reserva"), rotulos);
  check("lançamento velho, futuro e de valor zero ficam de fora", !rotulos.includes("Presente") && !rotulos.includes("Viagem") && !rotulos.includes("Nada"), rotulos);
  check("o limite é respeitado", run(`recentTransactionTemplates(state.data, { type: "expense", limit: 1 }).length`) === 1);
  check("cada modelo leva categoria, ícone e cor", gastos.every((g) => g.categoryName && g.icon));
  const receitas = run(`recentTransactionTemplates(state.data, { type: "income" })`);
  check("receitas são agrupadas só por descrição", receitas.length === 2 && receitas[0].description === "Freela" && receitas[0].count === 2 && receitas[0].amount === 800, receitas.map((r) => `${r.label}:${r.count}`));
  check("receita não carrega categoria", receitas.every((r) => r.categoryId === null));
  check("receita fixa entra, porque não tem outro atalho para ser relançada", receitas.some((r) => r.description === "Salário"), receitas.map((r) => r.label));
  check("base vazia devolve lista vazia", run(`recentTransactionTemplates(migrate(defaultData()), {}).length`) === 0 && run(`recentTransactionTemplates(null, {}).length`) === 0);
}

section("2. Um toque preenche o formulário; a data continua sendo a do formulário");
{
  montarBase();
  const chave = run(`recentTransactionTemplates(state.data, { type: "expense" })[0].key`);
  run(`state.form.date = "${dia(-1)}"; state.form.amount = "9,99";`);
  click("tx-template-apply", { value: chave });
  const form = run("JSON.parse(JSON.stringify(state.form))");
  check("valor, descrição e categoria vêm do modelo", form.amount === "250,14" && form.description === "Mercado" && form.categoryId === "mercado", form);
  check("pagamento e conta vêm do modelo", form.payment === "Pix" && form.accountId === "acc-b", form);
  check("a data escolhida no formulário é mantida", form.date === dia(-1), form.date);
  check("não vira edição", run("state.editingTxId") === null);
  const antes = run("state.data.transactions.length");
  click("submit-tx");
  check("salvar cria um lançamento novo", run("state.data.transactions.length") === antes + 1);
  const novo = run(`JSON.parse(JSON.stringify(state.data.transactions.find((t) => t.amount === 250.14 && t.date === "${dia(-1)}")))`);
  check("o lançamento novo é manual e sem parcelas", !!novo && novo.source === "manual" && !novo.installmentGroupId, novo);

  // Modelo com cartão: o cartão da última vez volta junto com o crédito.
  const uber = run(`recentTransactionTemplates(state.data, { type: "expense" }).find((m) => m.description === "Uber").key`);
  click("tx-template-apply", { value: uber });
  check("crédito traz o cartão da última vez", run("state.form.payment") === "Crédito" && run("state.form.creditCardId") === "card-a");

  // Cartão arquivado: cai no padrão do formulário em vez de apontar para um
  // cartão que não existe mais.
  run(`state.data = { ...state.data, creditCards: state.data.creditCards.map((c) => ({ ...c, archived: true })) };`);
  click("tx-template-apply", { value: uber });
  check("cartão arquivado não é reaproveitado", run("state.form.creditCardId") === "", run("state.form.creditCardId"));

  // Chave desconhecida: nada muda.
  run(`state.form = { ...freshTxForm(), amount: "1,00", description: "x" };`);
  click("tx-template-apply", { value: "expense|nada|nada" });
  check("chave desconhecida não mexe no formulário", run("state.form.amount") === "1,00" && run("state.form.description") === "x");

  // Receita.
  run(`state.form = { ...freshTxForm(), type: "income", categoryId: null };`);
  const freela = run(`recentTransactionTemplates(state.data, { type: "income" })[0].key`);
  click("tx-template-apply", { value: freela });
  check("receita repetida fica sem categoria e com o valor da última vez", run("state.form.type") === "income" && run("state.form.categoryId") === null && run("state.form.amount") === "800,00");
}

section("3. Hoje e ontem");
{
  montarBase();
  click("set-date", { value: "ontem" });
  check("ontem é o dia anterior pelo calendário", run("state.form.date") === dia(-1), run("state.form.date"));
  click("set-date", { value: "hoje" });
  check("hoje volta para hoje", run("state.form.date") === hoje);
  check("addDaysToIso atravessa o mês", run(`addDaysToIso("2026-03-01", -1)`) === "2026-02-28" && run(`addDaysToIso("2026-12-31", 1)`) === "2027-01-01");
}

section("4. Duplicar vira lançamento novo com a data de hoje");
{
  montarBase();
  click("edit-tx", { id: "m1" });
  check("a edição abre o registro antigo", run("state.editingTxId") === "m1" && run("state.form.date") === dia(-16));
  click("duplicate-tx", { id: "m1" });
  const form = run("JSON.parse(JSON.stringify(state.form))");
  check("deixa de ser edição", run("state.editingTxId") === null);
  check("mantém valor, categoria, pagamento, conta e descrição", form.amount === "220,00" && form.categoryId === "mercado" && form.payment === "Débito" && form.accountId === "acc-a" && form.description === "Mercado", form);
  check("a data passa a ser hoje", form.date === hoje, form.date);
  check("não copia parcelas nem recorrência", form.installments === "1" && form.recurring === false);
  check("avisa que é uma cópia", /[Cc]ópia/.test(String(run("state.toast") || "")), run("state.toast"));
  const antes = run("state.data.transactions.length");
  click("submit-tx");
  check("salvar cria o segundo registro sem tocar no primeiro",
    run("state.data.transactions.length") === antes + 1 && run(`state.data.transactions.find((t) => t.id === "m1").date`) === dia(-16));
  check("id inexistente não faz nada", (click("duplicate-tx", { id: "nao-existe" }), run("state.data.transactions.length") === antes + 1));
}

section("5. A tela mostra os atalhos no lugar certo");
{
  montarBase();
  const nova = run("renderAddScreen()");
  check("o formulário novo oferece os modelos", /class="recent-template/.test(nova) && /Repetir um recente/.test(nova));
  check("no máximo quatro modelos", (nova.match(/data-action="tx-template-apply"/g) || []).length <= 4);
  // `fmtBRL` separa "R$" do número com espaço inseparável; o padrão aceita os dois.
  check("cada modelo tem nome acessível com valor", /aria-label="Mercado, R\$[\s\u00a0]250,14, 3 vezes nos últimos meses"/.test(nova), (nova.match(/aria-label="Mercado[^"]*"/) || [])[0]);
  check("os atalhos de data existem e marcam o dia atual", /data-action="set-date" data-value="hoje" aria-pressed="true"/.test(nova) && /data-value="ontem" aria-pressed="false"/.test(nova));
  check("o botão de duplicar não aparece em formulário novo", !/data-action="duplicate-tx"/.test(nova));
  run(`state.editingTxId = "m1"; state.form = { ...freshTxForm(), amount: "220,00", categoryId: "mercado", description: "Mercado" };`);
  const edicao = run("renderAddScreen()");
  check("em edição os modelos somem e o duplicar aparece", !/class="recent-template/.test(edicao) && /data-action="duplicate-tx" data-id="m1"/.test(edicao));
  run(`state.editingTxId = null; state.data = migrate(defaultData()); state.form = freshTxForm();`);
  const vazia = run("renderAddScreen()");
  check("sem histórico o bloco não aparece", !/recent-templates/.test(vazia));
  // As tipografias e cores dinâmicas passam pelo mesmo canal (`data-ui-css`)
  // que o resto da tela usa, nunca por `style=`.
  check("nenhum estilo em linha", !/ style="/.test(nova));
}

console.log(`\n${failed ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
