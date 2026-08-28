// test-dashboard.js. Layout configurável do Início (js/layout.js) e a tela "Recursos".
//
// O motor de layout é puro e roda sozinho no primeiro bloco. O segundo carrega
// o app inteiro e dispara os cliques do painel de personalização: é o único
// jeito de garantir que ocultar um cartão na tela realmente o tira do HTML.
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
["js/utils.js", "js/layout.js"].forEach((f) => vm.runInContext(readSrc(f), pure, { filename: f }));
const R = (expr) => vm.runInContext(expr, pure);

section("1. Registro e padrão");
{
  check("todo cartão tem id, rótulo e explicação",
    R(`DASHBOARD_CARDS.every((c) => c.id && c.label && c.hint)`));
  check("ids são únicos", R(`new Set(DASHBOARD_CARD_IDS).size === DASHBOARD_CARD_IDS.length`));
  check("o padrão mostra tudo", R(`defaultDashboardLayout().hidden.length`) === 0);
  check("o padrão não força cartões sem dados", R(`defaultDashboardLayout().pinned.length`) === 0);
  check("o padrão inclui todos os cartões",
    R(`defaultDashboardLayout().order.length === DASHBOARD_CARDS.length`));
  // O saldo é o motivo de a pessoa abrir o app. Deixar que ele seja escondido
  // permitiria chegar a um Início que não responde à pergunta que o originou.
  check("existe exatamente um cartão fixo", R(`DASHBOARD_CARDS.filter((c) => c.locked).length`) === 1);
  check("o cartão fixo é o do saldo", R(`DASHBOARD_CARDS.find((c) => c.locked).id`) === "hero");
  check("existem cinco objetivos de personalização", R(`DASHBOARD_FOCUS_OPTIONS.length`) === 5);
  check("objetivo inválido volta para organizar o mês", R(`normalizeDashboardFocus("inexistente")`) === "month");
  check("cada objetivo preserva todos os cartões", R(`DASHBOARD_FOCUS_OPTIONS.every((o) => dashboardOrderForFocus(o.id).length === DASHBOARD_CARDS.length)`));
}

section("2. Reconciliação do que veio do disco");
{
  check("nulo devolve o padrão", R(`normalizeDashboardLayout(null).order.length === DASHBOARD_CARDS.length`));
  check("id desconhecido é descartado",
    R(`normalizeDashboardLayout({ order: ["cartao-de-uma-versao-futura", "hero"] }).order.indexOf("cartao-de-uma-versao-futura")`) === -1);
  check("id repetido não duplica",
    R(`(() => { const o = normalizeDashboardLayout({ order: ["score", "score"] }).order; return o.length === new Set(o).size; })()`));
  check("oculto desconhecido é descartado",
    R(`normalizeDashboardLayout({ hidden: ["fantasma"] }).hidden.length`) === 0);
  check("fixado desconhecido é descartado",
    R(`normalizeDashboardLayout({ pinned: ["fantasma"] }).pinned.length`) === 0);
  // Backup adulterado (ou de uma versão em que o cartão não era fixo) não pode
  // conseguir esconder o saldo.
  check("cartão fixo não pode ser escondido nem vindo do disco",
    R(`normalizeDashboardLayout({ hidden: ["hero"] }).hidden.length`) === 0);

  // Cartão novo entra ENTRE os vizinhos que o autor escolheu, não no rodapé —
  // novidade empurrada para o fim da lista é novidade que ninguém vê.
  const parcial = R(`normalizeDashboardLayout({ order: ["recent", "breakdown"] })`);
  check("ordem parcial é completada", parcial.order.length === R(`DASHBOARD_CARDS.length`));
  check("o que estava gravado mantém a posição relativa",
    parcial.order.indexOf("recent") < parcial.order.indexOf("breakdown"));
  check("cartão ausente não vai todo para o fim",
    parcial.order.indexOf("hero") < parcial.order.length - 1);
}

section("3. Mostrar, ocultar e reordenar");
{
  check("ocultar registra o cartão", R(`toggleDashboardCard(defaultDashboardLayout(), "score").hidden`).indexOf("score") !== -1);
  check("ocultar de novo desfaz",
    R(`toggleDashboardCard(toggleDashboardCard(defaultDashboardLayout(), "score"), "score").hidden.length`) === 0);
  check("ocultar não muda a ordem",
    R(`toggleDashboardCard(defaultDashboardLayout(), "score").order.length === DASHBOARD_CARDS.length`));
  check("cartão fixo ignora o pedido de ocultar",
    R(`toggleDashboardCard(defaultDashboardLayout(), "hero").hidden.length`) === 0);
  check("id inexistente não faz nada",
    R(`toggleDashboardCard(defaultDashboardLayout(), "nada").hidden.length`) === 0);
  check("mostrar cartão sem dados grava a escolha manual",
    R(`setDashboardCardVisibility(defaultDashboardLayout(), "score", true, { transactions: [] }).pinned`).indexOf("score") !== -1);
  check("cartão marcado aparece mesmo sem dados",
    R(`visibleDashboardCards(setDashboardCardVisibility(defaultDashboardLayout(), "score", true, { transactions: [] }), { isCurrentMonth: true, data: { transactions: [] } }).some((c) => c.id === "score")`));
  check("ocultar cartão marcado remove a escolha manual",
    R(`setDashboardCardVisibility(setDashboardCardVisibility(defaultDashboardLayout(), "score", true, { transactions: [] }), "score", false, { transactions: [] }).pinned.length`) === 0);

  check("descer troca com o vizinho de baixo",
    R(`moveDashboardCard(defaultDashboardLayout(), "hero", 1).order[0]`) === R(`DASHBOARD_CARD_IDS[1]`));
  check("subir o primeiro não sai da borda",
    R(`moveDashboardCard(defaultDashboardLayout(), "hero", -1).order[0]`) === "hero");
  check("descer o último não sai da borda",
    R(`(() => { const last = DASHBOARD_CARD_IDS[DASHBOARD_CARD_IDS.length - 1];
       return moveDashboardCard(defaultDashboardLayout(), last, 1).order.slice(-1)[0] === last; })()`));
  // Mover olhando só os visíveis faria a posição de um cartão oculto mudar
  // sozinha quando ele voltasse a aparecer.
  check("mover preserva quem está oculto",
    R(`moveDashboardCard(toggleDashboardCard(defaultDashboardLayout(), "score"), "hero", 1).hidden`).indexOf("score") !== -1);
}

section("4. Lista efetiva por mês");
{
  check("no mês atual aparece tudo",
    R(`visibleDashboardCards(defaultDashboardLayout(), { isCurrentMonth: true }).length === DASHBOARD_CARDS.length`));
  const passado = R(`visibleDashboardCards(defaultDashboardLayout(), { isCurrentMonth: false })`);
  check("em mês passado os cartões do mês corrente somem", passado.length < R(`DASHBOARD_CARDS.length`));
  check("nenhum cartão 'só do mês atual' sobra no passado", passado.every((c) => !c.monthly));
  check("cartão oculto some da lista",
    R(`visibleDashboardCards(toggleDashboardCard(defaultDashboardLayout(), "score"), { isCurrentMonth: true }).some((c) => c.id === "score")`) === false);
  check("a contagem bate com o registro",
    R(`dashboardLayoutCounts(toggleDashboardCard(defaultDashboardLayout(), "score")).hidden`) === 1);
  check("base sem uso é reconhecida como início",
    R(`isDashboardStarting({ transactions: [], goals: [], assets: [] })`) === true);
  check("gamificação depende de ativação explícita",
    R(`isDashboardCardRelevant({ transactions: [{ type: "expense" }], achievements: { enabled: false } }, "gamification")`) === false);
}

/* ================================================================= BLOCO B */
section("5. Integração: Início, painel de personalização e tela “Recursos”");

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
  "js/insights.js", "js/assistant.js", "js/contextual-assistant.js", "js/advisor.js", "js/investments.js", "js/portfolio.js",
  "js/simulators.js", "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (expr) => vm.runInContext(expr, ctx);
run(`state.data = migrate(defaultData()); state.booting = false; state.form = freshTxForm();`);

function click(action, dataset) {
  const btn = fakeEl("button");
  btn.dataset = Object.assign({ action }, dataset || {});
  ctx.__evt = { target: { closest: (s) => (s === "[data-action]" ? btn : null), dataset: btn.dataset }, preventDefault() {}, stopPropagation() {} };
  run(`onClick(__evt)`);
}

check("base nova nasce com o layout", run(`!!state.data.dashboardLayout`));
check("migração de base antiga não quebra",
  run(`!!migrate({ version: 9, transactions: [], categories: [] }).dashboardLayout`));
check("backup carrega o layout", run(`!!backupPayloadOf(state.data).dashboardLayout`));
check("backup carrega o objetivo do Início", run(`backupPayloadOf(state.data).dashboardFocus`) === "month");

const navDesktop = run(`renderSideNav()`);
const navMovel = run(`renderBottomNav()`);
check("a navegação chama a central de Recursos",
  navDesktop.includes("<span>Recursos</span>") && navMovel.includes("<span>Recursos</span>"));
check("a navegação móvel usa os rótulos curtos",
  navMovel.includes("<span>Movimentos</span>") && navMovel.includes("<span>Planejar</span>"));
check("os rótulos curtos preservam os nomes acessíveis completos",
  navMovel.includes('data-tab="analytics" aria-label="Movimentos, abrir Movimentações"')
    && navMovel.includes('data-tab="calendar" aria-label="Planejar, abrir Calendário"'));

const inicial = run(`renderDashboardScreen()`);
check("Início renderiza", inicial.length > 1000);
check("Início sem lixo de template", !/undefined|NaN|\[object Object\]|\$\{/.test(inicial));
check("base inicial mostra orientação curta", /card--starter/.test(inicial));
check("base inicial não mostra patrimônio vazio", !/card--networth/.test(inicial));
check("painel principal tem uma ação e no máximo duas secundárias",
  (inicial.match(/class="hero-action(?:\s|")/g) || []).length <= 3);

click("dash-card-toggle", { id: "networth", value: "show" });
check("personalização pode mostrar cartão ainda sem dados", /card--networth/.test(run(`renderDashboardScreen()`)));
check("a escolha manual fica persistida", run(`state.data.dashboardLayout.pinned`).indexOf("networth") !== -1);
click("dash-card-toggle", { id: "networth", value: "hide" });
check("desligar devolve o cartão ao estado progressivo", !/card--networth/.test(run(`renderDashboardScreen()`)));
run(`state.data = { ...state.data, dashboardLayout: defaultDashboardLayout() };`);

run(`state.data = migrate({ ...state.data, transactions: [
  makeTransaction({ id: "dash-t1", type: "income", amount: 3000, date: todayIso(), categoryId: "outros", description: "Salário" }),
  makeTransaction({ id: "dash-t2", type: "expense", amount: 100, date: todayIso(), categoryId: "mercado", description: "Mercado" }),
  makeTransaction({ id: "dash-t3", type: "expense", amount: 50, date: todayIso(), categoryId: "transporte", description: "Transporte" })
] });`);
const cheio = run(`renderDashboardScreen()`);
check("com histórico mostra o painel de patrimônio", /card--networth/.test(cheio));

click("dash-card-toggle", { id: "networth" });
check("ocultar persiste no dado", run(`state.data.dashboardLayout.hidden`).indexOf("networth") !== -1);
const semPatrimonio = run(`renderDashboardScreen()`);
check("o cartão oculto some do HTML", !/card--networth/.test(semPatrimonio));
check("o resto do Início continua de pé", /hero-value/.test(semPatrimonio));

// Reordenar tem de mudar a ordem no HTML, não só no dado. Um teste que só olha
// o estado passaria mesmo se a tela ignorasse a configuração.
run(`state.data = { ...state.data, dashboardLayout: defaultDashboardLayout() };`);
const antes = run(`renderDashboardScreen()`);
check("ordem padrão: score antes de patrimônio",
  antes.indexOf("card--score") < antes.indexOf("card--networth"));
click("dash-card-move", { id: "score", value: "down" });
const depois = run(`renderDashboardScreen()`);
check("descer inverte a ordem no HTML",
  depois.indexOf("card--score") > depois.indexOf("card--networth"));

click("dash-layout-reset");
check("restaurar volta ao padrão",
  run(`JSON.stringify(state.data.dashboardLayout) === JSON.stringify(applyDashboardFocus(defaultDashboardLayout(), state.data.dashboardFocus))`));

click("dash-focus", { value: "debt" });
check("trocar objetivo persiste a escolha", run(`state.data.dashboardFocus`) === "debt");
check("trocar objetivo reordena o painel", run(`state.data.dashboardLayout.order[1]`) === "advisor");

run(`state.dashboardEditing = true;`);
const painel = run(`renderDashboardScreen()`);
check("painel de personalização aparece", /dash-config-list/.test(painel));
check("painel lista todos os cartões",
  (painel.match(/data-action="dash-card-move"/g) || []).length === run(`DASHBOARD_CARDS.length`) * 2);
check("cartão fixo não oferece interruptor",
  !/data-action="dash-card-toggle" data-id="hero"/.test(painel));
check("painel sem lixo de template", !/undefined|NaN|\[object Object\]|\$\{/.test(painel));
run(`state.dashboardEditing = false;`);

// Mês passado: o painel some junto com os cartões que só valem no mês corrente.
run(`state.monthOffset = -1;`);
const passado = run(`renderDashboardScreen()`);
check("mês passado renderiza", passado.length > 800);
check("mês passado esconde o lançamento rápido", !/nlp-text/.test(passado));
run(`state.monthOffset = 0;`);

section("6. Tela “Recursos”");
{
  run(`state.tab = "all"; state.allSearch = "";`);
  const tudo = run(`renderAllScreen()`);
  check("tela renderiza", tudo.length > 1000);
  check("título visível usa o nome Recursos", /<h1 class="page-title">Recursos<\/h1>/.test(tudo));
  check("sem lixo de template", !/undefined|NaN|\[object Object\]|\$\{/.test(tudo));
  const abre = (tudo.match(/<div\b/g) || []).length, fecha = (tudo.match(/<\/div>/g) || []).length;
  check(`<div> balanceadas (${abre}/${fecha})`, abre === fecha);

  // Todo destino da tela precisa existir no roteador, senão o clique leva a uma
  // tela em branco.
  const tabs = Array.from(new Set((tudo.match(/data-tab="([a-z]+)"/g) || []).map((m) => m.match(/"([a-z]+)"/)[1])));
  check("todos os destinos são rotas válidas",
    tabs.every((t) => run(`Router.isTab(${JSON.stringify(t)})`)), tabs.filter((t) => !run(`Router.isTab(${JSON.stringify(t)})`)));
  check("os destinos antes escondidos em Ajustes estão aqui",
    ["accounts", "debts", "health", "wealth", "calendar", "invest", "simulators", "achievements", "import", "insights", "subscriptions", "notifications", "simulate", "rules"]
      .every((t) => tabs.indexOf(t) !== -1));

  // A busca é o que torna vinte e dois recursos localizáveis sem rolagem longa.
  run(`state.allSearch = "fatura";`);
  const busca = run(`renderAllScreen()`);
  check("busca por palavra-chave encontra o destino certo", /data-tab="accounts"/.test(busca));
  check("busca descarta o que não interessa", !/data-tab="achievements"/.test(busca));
  run(`state.allSearch = "juros";`);
  check("busca acha os simuladores pelo problema, não pelo nome",
    /data-tab="simulators"/.test(run(`renderAllScreen()`)));
  run(`state.allSearch = "MÉTAS";`);
  check("busca ignora acento e maiúscula", /data-tab="goals"/.test(run(`renderAllScreen()`)));
  run(`state.allSearch = "xyzabc";`);
  const vazio = run(`renderAllScreen()`);
  check("busca sem resultado explica o que fazer", /Nada encontrado/.test(vazio));
  check("busca sem resultado não some com o campo", /data-field="all-search"/.test(vazio));
  run(`state.allSearch = "";`);
}

section("7. Ajustes deixou de ser o índice");
{
  run(`state.tab = "settings";`);
  const ajustes = run(`renderSettingsScreen()`);
  check("Ajustes aponta para “Recursos”", /data-tab="all"/.test(ajustes) && /Abrir “Recursos”/.test(ajustes));
  check("Ajustes aponta para as regras", /data-tab="rules"/.test(ajustes));
  check("a lista de ferramentas saiu de Ajustes", !/data-tab="simulators"/.test(ajustes));
  check("Ajustes continua sem lixo de template", !/undefined|NaN|\[object Object\]|\$\{/.test(ajustes));
}

section("8. Nome do Assistente financeiro");
{
  run(`state.tab = "dashboard"; state.contextualAssistant = { open: false, responseId: null };`);
  const launcher = run(`renderAssistantLauncher()`);
  const dialogo = run(`renderContextualAssistantModal()`);
  check("lançador usa o nome Assistente financeiro",
    launcher.includes("<span>Assistente financeiro</span>")
      && launcher.includes('aria-label="Abrir o Assistente financeiro"'));
  check("diálogo usa o nome Assistente financeiro",
    /id="assistant-title">Assistente financeiro em /.test(dialogo)
      && dialogo.includes("O Assistente financeiro usa somente os dados"));

  run(`state.data = { ...state.data, transactions: state.data.transactions.concat([
    makeTransaction({ id: "assistant-name", type: "expense", amount: 1500, date: todayIso(), categoryId: "lazer", description: "Teste do nome" })
  ]) };`);
  const cartao = run(`renderAssistantCard(keyOfDate(new Date()))`);
  check("cartão usa o nome Assistente financeiro",
    cartao.includes('class="card-title" data-ui-css="margin:0">Assistente financeiro</p>'));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
