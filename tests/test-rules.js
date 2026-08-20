// test-rules.js — motor de categorização (js/rules.js) e o que depende dele.
//
// Dois blocos:
//   A) motor puro, carregado sozinho num contexto de VM. É onde se testa a
//      aritmética de pesos, a compilação dos padrões e a mesclagem de backup.
//   B) app.js inteiro, disparando `onClick` de verdade nas ações da tela de
//      regras — é assim que se descobre um handler que grava no formato errado
//      antes de o usuário descobrir com uma regra que não funciona.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const SCREEN_FILES = [
  "js/screens/_shared.js", "js/screens/onboarding.js", "js/screens/dashboard.js",
  "js/screens/accounts.js", "js/screens/debts.js", "js/screens/add.js",
  "js/screens/analytics.js", "js/screens/goals.js", "js/screens/calendar.js",
  "js/screens/health.js", "js/screens/wealth.js", "js/screens/portfolio.js",
  "js/screens/invest.js", "js/screens/simulators.js", "js/screens/simulate.js",
  "js/screens/insights.js", "js/screens/subscriptions.js", "js/screens/notifications.js",
  "js/screens/achievements.js", "js/screens/import.js", "js/screens/all.js",
  "js/screens/rules.js", "js/screens/categories.js", "js/screens/settings.js", "js/screens/modals.js",
];

let ok = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { ok++; console.log("  \u2713 " + label); }
  else { fail++; console.log("  \u2717 " + label + (extra !== undefined ? "  \u2192 " + JSON.stringify(extra) : "")); }
}
function section(t) { console.log("\n" + t); }

/* ================================================================= BLOCO A */
const pure = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} } };
pure.globalThis = pure;
vm.createContext(pure);
["js/utils.js", "js/rules.js"].forEach((f) => vm.runInContext(readSrc(f), pure, { filename: f }));
const R = (expr) => vm.runInContext(expr, pure);

// Base mínima só com o que o motor consulta: a lista de categorias.
pure.__cats = [
  { id: "outros", name: "Outros" }, { id: "transporte", name: "Transporte" },
  { id: "mercado", name: "Mercado" }, { id: "lazer", name: "Lazer" },
  { id: "assinaturas", name: "Assinaturas" }, { id: "alimentacao", name: "Alimentação" },
  { id: "moradia", name: "Moradia" }, { id: "saude", name: "Saúde" },
  { id: "educacao", name: "Educação" }, { id: "investimento", name: "Investimentos" },
  { id: "delivery", name: "Delivery" },
];
const dataWith = (rules, extra) => {
  pure.__r = rules; pure.__x = extra || {};
  return R(`Object.assign({ categories: __cats, transactions: [], categoryRules: __r }, __x)`);
};

section("1. Compilação do padrão");
{
  check("texto vazio é rejeitado", R(`compileRulePattern("  ", "contains").ok`) === false);
  check("acento e maiúscula são normalizados",
    R(`compileRulePattern("Padaria Açaí", "contains").re.test("compra padaria acai centro")`) === true);
  check('"palavra inteira" não casa dentro de outra palavra',
    R(`compileRulePattern("bar", "word").re.test("barbearia do ze")`) === false);
  check('"palavra inteira" casa a palavra isolada',
    R(`compileRulePattern("bar", "word").re.test("bar do ze")`) === true);
  check('"começa com" ancora no início',
    R(`compileRulePattern("pix enviado", "starts").re.test("pix enviado joao")`) === true);
  check('"começa com" não casa no meio',
    R(`compileRulePattern("pix enviado", "starts").re.test("tarifa pix enviado")`) === false);
  check("regex válido compila", R(`compileRulePattern("^pix (env|rec)", "regex").ok`) === true);
  // Regex quebrado é a única entrada que o usuário consegue escrever inválida.
  // Precisa virar mensagem, não exceção — o app não pode cair por causa dela.
  check("regex inválido devolve erro em vez de lançar", R(`compileRulePattern("[a-", "regex").ok`) === false);
  check("regex inválido explica o motivo", /inv/i.test(R(`compileRulePattern("[a-", "regex").error`)));
}

section("2. Normalização e saneamento");
{
  check("base vazia devolve as duas listas",
    R(`JSON.stringify(normalizeCategoryRules(null)) === '{"custom":[],"builtin":{}}'`));
  check("regra sem padrão é descartada",
    R(`normalizeCategoryRules({ custom: [{ pattern: "", categoryId: "lazer" }] }).custom.length`) === 0);
  check("regra sem categoria é descartada",
    R(`normalizeCategoryRules({ custom: [{ pattern: "uber", categoryId: "" }] }).custom.length`) === 0);
  check("tipo desconhecido cai em 'contains'",
    R(`normalizeCategoryRules({ custom: [{ pattern: "uber", categoryId: "lazer", matchType: "magia" }] }).custom[0].matchType`) === "contains");
  check("peso fora da faixa é grampeado",
    R(`normalizeCategoryRules({ custom: [{ pattern: "uber", categoryId: "lazer", weight: 999 }] }).custom[0].weight`) === 10);
  check("id repetido não vira duas regras",
    R(`normalizeCategoryRules({ custom: [
      { id: "a", pattern: "uber", categoryId: "lazer" },
      { id: "a", pattern: "posto", categoryId: "lazer" }] }).custom.length`) === 1);
  // Override que devolve o padrão é ruído: engorda o backup sem dizer nada.
  check("override idêntico ao padrão não é gravado",
    R(`Object.keys(normalizeCategoryRules({ builtin: { "std-lazer": { enabled: true, categoryId: "lazer" } } }).builtin).length`) === 0);
  check("override real é preservado",
    R(`normalizeCategoryRules({ builtin: { "std-lazer": { enabled: false } } }).builtin["std-lazer"].enabled`) === false);
  check("override de regra inexistente é jogado fora",
    R(`Object.keys(normalizeCategoryRules({ builtin: { "std-fantasma": { enabled: false } } }).builtin).length`) === 0);
}

section("3. Quem ganha quando mais de uma regra casa");
{
  const hit = (rules, text) => { pure.__d = dataWith(rules); pure.__t = text; return R(`(matchCategoryRules(compileCategoryRules(__d), normalizeText(__t)) || {}).categoryId || null`); };

  check("sem regra do usuário, o dicionário de fábrica decide",
    hit({ custom: [] }, "IFOOD *LANCHE") === "delivery");
  // O caso que motivou a tela: "posto" cai em transporte por padrão, e o
  // usuário quer separar o posto de gasolina do estacionamento.
  check("regra do usuário sobrepõe a de fábrica",
    hit({ custom: [{ id: "u1", pattern: "ifood", categoryId: "lazer", weight: 8 }] }, "IFOOD *LANCHE") === "lazer");
  check("peso maior vence entre regras do usuário",
    hit({ custom: [
      { id: "u1", pattern: "posto", categoryId: "lazer", weight: 3 },
      { id: "u2", pattern: "posto ipiranga", categoryId: "moradia", weight: 9 },
    ] }, "POSTO IPIRANGA 04") === "moradia");
  check("empate de peso favorece a regra do usuário",
    hit({ custom: [{ id: "u1", pattern: "netflix", categoryId: "lazer", weight: 6 }] }, "NETFLIX.COM") === "lazer");
  check("regra desativada não conta",
    hit({ custom: [{ id: "u1", pattern: "ifood", categoryId: "lazer", weight: 9, enabled: false }] }, "IFOOD *LANCHE") === "delivery");
  // Texto escolhido de propósito para casar em DUAS regras de fábrica (delivery,
  // peso 5, e restaurantes, peso 3): desligar a de cima tem de revelar a de
  // baixo, não deixar o lançamento sem categoria.
  check("regra de fábrica desligada revela a de peso menor",
    hit({ custom: [], builtin: { "std-delivery": { enabled: false } } }, "IFOOD LANCHONETE DO ZE") === "alimentacao");
  check("com as duas ativas, vence a de maior peso",
    hit({ custom: [] }, "IFOOD LANCHONETE DO ZE") === "delivery");
  check("regra de fábrica redirecionada aponta para o novo destino",
    hit({ custom: [], builtin: { "std-delivery": { enabled: true, categoryId: "lazer" } } }, "IFOOD *LANCHE") === "lazer");
  check("regex quebrado é ignorado sem derrubar as outras",
    hit({ custom: [
      { id: "u1", pattern: "[a-", matchType: "regex", categoryId: "lazer", weight: 10 },
      { id: "u2", pattern: "ifood", categoryId: "moradia", weight: 9 },
    ] }, "IFOOD *LANCHE") === "moradia");
  // Categoria apagada não pode virar destino: o lançamento ficaria apontando
  // para um id que nenhuma tela sabe desenhar.
  check("regra apontando para categoria inexistente fica fora",
    hit({ custom: [{ id: "u1", pattern: "ifood", categoryId: "categoria-que-nao-existe", weight: 10 }] }, "IFOOD *LANCHE") === "delivery");
  check("descrição vazia não casa nada",
    R(`matchCategoryRules(compileCategoryRules(${JSON.stringify({ categories: [] })}), "")`) === null);
}

section("4. Aplicar às transações já gravadas");
{
  pure.__d = R(`Object.assign(${JSON.stringify({ categories: null })}, {
    categories: __cats,
    categoryRules: { custom: [{ id: "u1", pattern: "farmacia sao joao", categoryId: "saude", weight: 8 }], builtin: {} },
    transactions: [
      { id: "t1", type: "expense", categoryId: "outros", description: "FARMACIA SAO JOAO 12" },
      { id: "t2", type: "expense", categoryId: "lazer",  description: "FARMACIA SAO JOAO 12" },
      { id: "t3", type: "expense", categoryId: "outros", description: "TRANSFERENCIA PARA MARIA" },
      { id: "t4", type: "income",  categoryId: "outros", description: "FARMACIA SAO JOAO 12" },
    ],
  })`);

  const prev = R(`previewRuleApplication(__d, { onlyFallback: true })`);
  check("só entra o que está em 'Outros'", prev.count === 1, prev.changes.map((c) => c.id));
  check("o alvo certo foi escolhido", prev.changes[0].id === "t1" && prev.changes[0].to === "saude");
  // Este é o ponto: quem já corrigiu à mão confia no app. Sobrescrever a
  // correção dele é a forma mais rápida de perder essa confiança.
  check("lançamento já categorizado à mão não é tocado", !prev.changes.some((c) => c.id === "t2"));
  check("receita fica de fora", !prev.changes.some((c) => c.id === "t4"));
  check("descrição sem regra não muda", !prev.changes.some((c) => c.id === "t3"));

  pure.__prev = prev;
  const after = R(`applyRulesToTransactions(__d, __prev.changes)`);
  check("a gravação aplica a mudança", after.transactions.find((t) => t.id === "t1").categoryId === "saude");
  check("as demais ficam intactas", after.transactions.find((t) => t.id === "t2").categoryId === "lazer");
  check("carimba updatedAt no que mudou", !!after.transactions.find((t) => t.id === "t1").updatedAt);
  check("lista vazia devolve o mesmo objeto", R(`applyRulesToTransactions(__d, []) === __d`));
}

section("5. Mesclagem de backup");
{
  pure.__a = { custom: [{ id: "a", pattern: "posto", categoryId: "transporte", weight: 8 }], builtin: { "std-lazer": { enabled: false } } };
  pure.__b = { custom: [{ id: "b", pattern: "padaria", categoryId: "alimentacao", weight: 8 }], builtin: {} };
  const m = R(`mergeCategoryRules(__a, __b)`);
  check("as duas listas se somam", m.custom.length === 2);
  check("o desligamento local sobrevive", m.builtin["std-lazer"].enabled === false);

  pure.__c = { custom: [{ id: "a", pattern: "posto", categoryId: "lazer", weight: 2 }] };
  const conflito = R(`mergeCategoryRules(__a, __c)`);
  check("id em conflito resolve a favor do aparelho", conflito.custom[0].categoryId === "transporte");

  // Mesmo padrão com id diferente vira linha duplicada na tela, e o usuário não
  // tem como saber qual das duas apagar.
  pure.__dup = { custom: [{ id: "z", pattern: "POSTO", categoryId: "transporte", weight: 8 }] };
  check("padrão idêntico com id diferente não duplica", R(`mergeCategoryRules(__a, __dup)`).custom.length === 1);
}

/* ================================================================= BLOCO B */
section("6. Integração: schema, importador e as ações da tela");

function fakeEl(tag) {
  return {
    tagName: (tag || "div").toUpperCase(), innerHTML: "", value: "", style: {}, dataset: {},
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
    documentElement: fakeEl(), body: fakeEl(),
    getElementById() { return fakeEl(); }, querySelector() { return fakeEl(); },
    querySelectorAll() { return []; }, createElement(t) { return fakeEl(t); },
    addEventListener() {}, removeEventListener() {}, activeElement: null, visibilityState: "visible",
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0), requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined, module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  history: { state: null, pushState() {}, replaceState() {}, go() {}, length: 1 },
  alert() {}, confirm() { return true; }, prompt() { return null; },
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js",
  "js/storage.js", "js/accounts.js", "js/debts.js", "js/budgets.js", "js/charts.js",
  "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/calendar.js", "js/recurring.js", "js/analytics.js",
  "js/insights.js", "js/assistant.js", "js/advisor.js", "js/investments.js", "js/portfolio.js",
  "js/simulators.js", "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (expr) => vm.runInContext(expr, ctx);
run(`state.data = migrate(defaultData()); state.booting = false; state.form = freshTxForm(); state.tab = "rules";`);

function click(action, dataset) {
  const btn = fakeEl("button");
  btn.dataset = Object.assign({ action }, dataset || {});
  ctx.__evt = { target: { closest: (s) => (s === "[data-action]" ? btn : null), dataset: btn.dataset }, preventDefault() {}, stopPropagation() {} };
  run(`onClick(__evt)`);
}

check("base nova já nasce com o campo de regras", run(`!!state.data.categoryRules`));
check("migração de base antiga (sem o campo) não quebra",
  run(`!!migrate({ version: 9, transactions: [], categories: [] }).categoryRules`));
check("backup carrega as regras", run(`!!backupPayloadOf(state.data).categoryRules`));

// O importador tem de enxergar a regra do usuário. Era esse o contrato quebrado
// antes: `guessCategoryId` recebia só as categorias e não tinha como conhecê-la.
run(`state.data = { ...state.data, categoryRules: normalizeCategoryRules({ custom: [
  { id: "u1", pattern: "supermercado", categoryId: "lazer", weight: 9 }] }) };`);
check("importador respeita a regra do usuário",
  run(`guessCategoryId(state.data, "SUPERMERCADO BOM PRECO")`) === "lazer");
check("contrato antigo (só categorias) continua funcionando",
  run(`guessCategoryId(state.data.categories, "SUPERMERCADO BOM PRECO")`) === "mercado");
check("confiança alta para regra do usuário",
  run(`categorySuggestionConfidence("SUPERMERCADO BOM PRECO", state.data)`) === "alta");

// Bug encontrado durante a refatoração: `amount` era `const` e a correção de
// sinal por TRNTYPE lançava TypeError em modo estrito, derrubando a importação
// inteira nos extratos que informam o tipo em vez do sinal.
{
  ctx.__ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260115</DTPOSTED><TRNAMT>150.00</TRNAMT><MEMO>MERCADO</MEMO></STMTTRN></OFX>`;
  let erro = null, res = null;
  try { res = run(`parseStatementFile(__ofx, "extrato.ofx")`); } catch (e) { erro = e.message; }
  check("OFX com TRNTYPE=DEBIT e valor positivo não lança", erro === null, erro);
  check("e é lido como despesa", res && res.rows[0].type === "expense", res && res.rows[0]);
}

run(`state.data = migrate(defaultData()); state.rules = { form: null, testText: "", showBuiltins: false, confirmDeleteId: null, applyPreview: null };`);

click("rule-new");
check("nova regra abre o formulário", run(`!!state.rules.form`));
run(`state.rules.form.pattern = "posto shell"; state.rules.form.categoryId = "transporte";`);
click("rule-save");
check("regra é gravada", run(`state.data.categoryRules.custom.length`) === 1);
check("formulário fecha após salvar", run(`state.rules.form`) === null);
check("a regra já vale no motor", run(`guessCategoryId(state.data, "POSTO SHELL BR 116")`) === "transporte");

const rid = run(`state.data.categoryRules.custom[0].id`);
click("rule-toggle", { id: rid });
check("desativar apaga o efeito sem apagar a regra",
  run(`state.data.categoryRules.custom[0].enabled`) === false && run(`state.data.categoryRules.custom.length`) === 1);
click("rule-toggle", { id: rid });

click("rule-delete", { id: rid });
check("exclusão abre o popup sem apagar",
  run(`!!state.confirmation`) && run(`state.data.categoryRules.custom.length`) === 1);
run(`state.confirmation.accepted = true; closeOverlayState("confirmation"); state.overlayStack = [];`);
check("confirmar no popup exclui", run(`state.data.categoryRules.custom.length`) === 0);

click("rule-builtin-toggle", { id: "std-lazer" });
check("desligar regra de fábrica grava só a diferença",
  run(`state.data.categoryRules.builtin["std-lazer"].enabled`) === false);
click("rules-builtin-reset");
check("restaurar limpa os overrides", run(`Object.keys(state.data.categoryRules.builtin).length`) === 0);

// A tela precisa sair inteira mesmo com regra quebrada e com formulário aberto:
// é justamente o estado em que o usuário está olhando para ela.
run(`state.data = { ...state.data, categoryRules: normalizeCategoryRules({ custom: [
  { id: "x", pattern: "[a-", matchType: "regex", categoryId: "lazer" }] }) };
  state.rules.showBuiltins = true; state.rules.testText = "POSTO IPIRANGA";
  state.rules.form = { id: null, pattern: "[a-", matchType: "regex", categoryId: "lazer", weight: 8 };`);
const tela = run(`renderRulesScreen()`);
check("tela de regras renderiza", tela.length > 800);
check("tela sem lixo de template", !/undefined|NaN|\[object Object\]|\$\{/.test(tela));
check("tela avisa que a regra está sendo ignorada", /sendo ignorada/.test(tela));
check("botão de salvar fica travado com padrão inválido", /data-action="rule-save" disabled/.test(tela));
{
  const abre = (tela.match(/<div\b/g) || []).length, fecha = (tela.match(/<\/div>/g) || []).length;
  check(`<div> balanceadas (${abre}/${fecha})`, abre === fecha);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
