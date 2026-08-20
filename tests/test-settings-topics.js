// test-settings-topics.js; Ajustes em tópicos.
// ------------------------------------------------------------------------------
// A tela tinha onze cartões abertos ao mesmo tempo, e achar "alertas de
// orçamento" exigia rolar passando por categorias, backup e premissas de
// mercado. O que este teste protege:
//
//   1. O índice fechado continua sendo um índice: nenhum painel no HTML.
//   2. O resumo de cada tópico reflete o dado REAL. É ele que justifica o
//      acordeão; sem resumo o usuário teria de abrir tudo para se situar.
//   3. Um tópico por vez, e tocar no aberto fecha.
//   4. A prévia e o erro de importação forçam o tópico de dados a abrir, senão
//      o resultado de escolher um arquivo ficaria escondido.
//   5. Navegação NÃO entra no acordeão: esconder link atrás de clique extra é
//      o oposto do que a tela deveria fazer.
//
// O carregamento espelha o de test-render.js, que já é o padrão da suíte para
// exercitar telas com um DOM mínimo.
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

function fakeEl() {
  return {
    innerHTML: "", value: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
}

const ctx = {
  console,
  document: {
    documentElement: fakeEl(), body: fakeEl(),
    // "loading" faz app.js registrar `init` num DOMContentLoaded que nunca
    // dispara aqui. Sem isso o boot rodaria de verdade (armazenamento, sessão,
    // sincronização) e encheria o teste de ruído assíncrono.
    readyState: "loading",
    getElementById() { return fakeEl(); },
    querySelector() { return fakeEl(); },
    querySelectorAll() { return []; },
    createElement() { return fakeEl(); },
    addEventListener() {}, removeEventListener() {},
    activeElement: null, visibilityState: "visible",
  },
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", search: "", hash: "", origin: "http://localhost" },
  history: { state: null, pushState() {}, replaceState() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0), requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined, crypto,
  module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844,
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

// A mesma ordem do build. `cloud-sync.js` entra porque a tela de conta e o
// `setData` conversam com ele; os dois toleram a ausência, mas aqui queremos o
// caminho real.
[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js",
  "js/safe-errors.js", "js/storage.js", "js/auth.js", "js/cloud-sync.js", "js/accounts.js",
  "js/movements.js", "js/data-sources.js", "js/debts.js", "js/budgets.js", "js/charts.js",
  "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/transparency.js", "js/calendar.js", "js/recurring.js",
  "js/analytics.js", "js/insights.js", "js/assistant.js", "js/contextual-assistant.js",
  "js/advisor.js", "js/investments.js", "js/portfolio.js", "js/simulators.js", "js/qrcode.js",
  "js/achievements.js", "js/wrapped.js", "js/services.js",
  "js/screens/_shared.js", "js/screens/onboarding.js", "js/screens/dashboard.js",
  "js/screens/accounts.js", "js/screens/debts.js", "js/screens/add.js", "js/screens/analytics.js",
  "js/screens/goals.js", "js/screens/calendar.js", "js/screens/health.js", "js/screens/wealth.js",
  "js/screens/portfolio.js", "js/screens/invest.js", "js/screens/simulators.js",
  "js/screens/simulate.js", "js/screens/insights.js", "js/screens/subscriptions.js",
  "js/screens/notifications.js", "js/screens/achievements.js", "js/screens/import.js",
  "js/screens/all.js", "js/screens/rules.js", "js/screens/categories.js", "js/screens/settings.js",
  "js/screens/privacy.js", "js/screens/account.js", "js/screens/modals.js", "js/actions.js", "js/app.js",
].forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));

const run = (code) => vm.runInContext(code, ctx);
const setData = (expr) => run(`state.data = ${expr};`);
const abrir = (id) => { ctx.__sec = id; run("state.settingsSection = __sec;"); };

console.log("\n1. O indice fechado e mesmo um indice");
{
  setData("migrate(defaultData())");
  abrir(null);
  const html = run("renderSettingsScreen()");
  const ids = run("SETTINGS_SECTIONS.map((s) => s.id)");
  check("existem varios topicos", ids.length >= 5, ids.length);
  check("todos aparecem no indice", ids.every((id) => html.includes(`data-value="${id}"`)), ids.join(","));
  check("nenhum painel vem aberto", !/settings-topic__panel/.test(html));
  check("nenhum topico marcado como aberto", !/settings-topic--open/.test(html));
  check("todo botao declara aria-expanded=false", (html.match(/aria-expanded="false"/g) || []).length === ids.length);
  check("cada topico aponta para o proprio painel",
    ids.every((id) => html.includes(`aria-controls="settings-panel-${id}"`)));
  check("o conteudo pesado fica fora do HTML fechado",
    !html.includes("cat-edit-row") && !html.includes("split-necessidade-input"));
}

console.log("\n2. O resumo reflete o dado real");
{
  setData(`migrate({ ...defaultData(), userName: "Renan", monthlyIncome: 6500, lastBackupAt: "2026-08-10",
    budgetSplit: { necessidade: 55, desejo: 25, futuro: 20 }, budgetAlerts: { warn: 70, over: 100 } })`);
  const resumo = (id) => run(`SETTINGS_SECTIONS.find((s) => s.id === "${id}").resumo()`);
  check("perfil mostra nome e renda", /Renan/.test(resumo("perfil")) && /6\.500/.test(resumo("perfil")), resumo("perfil"));
  check("orcamento mostra a regra em vigor", /55\/25\/20/.test(resumo("orcamento")), resumo("orcamento"));
  check("orcamento mostra o limiar de aviso", /70%/.test(resumo("orcamento")), resumo("orcamento"));
  check("backup mostra a data", /10\/08\/2026/.test(resumo("dados")), resumo("dados"));
  check("aparencia descreve tema e conquistas",
    /claro/.test(resumo("aparencia")) && /desligadas/.test(resumo("aparencia")), resumo("aparencia"));

  setData(`{ ...state.data, userName: "", monthlyIncome: 0, lastBackupAt: null }`);
  check("perfil sem dado nao imprime lacuna",
    /Sem nome/.test(resumo("perfil")) && /não informada/.test(resumo("perfil")), resumo("perfil"));
  check("backup nunca feito e dito com todas as letras", /Nenhum backup/.test(resumo("dados")), resumo("dados"));

  const todos = run(`SETTINGS_SECTIONS.map((s) => s.resumo()).join(" | ")`);
  check("nenhum resumo vaza undefined ou NaN", !/undefined|NaN|\[object Object\]/.test(todos), todos);
  check("todo resumo cabe numa linha", run(`SETTINGS_SECTIONS.every((s) => s.resumo().length <= 60)`),
    run(`SETTINGS_SECTIONS.map((s) => s.resumo()).sort((a, b) => b.length - a.length)[0]`));
}

console.log("\n3. Um topico por vez");
{
  setData("migrate(defaultData())");
  abrir("orcamento");
  const html = run("renderSettingsScreen()");
  check("o topico escolhido abre", html.includes('id="settings-panel-orcamento"'));
  check("so um painel existe", (html.match(/settings-topic__panel/g) || []).length === 1);
  check("so um topico marcado aberto", (html.match(/settings-topic--open/g) || []).length === 1);
  check("aria-expanded=true so no aberto", (html.match(/aria-expanded="true"/g) || []).length === 1);
  check("o conteudo do topico chegou", html.includes("split-necessidade-input"));

  abrir("reserva");
  const outro = run("renderSettingsScreen()");
  check("trocar de topico fecha o anterior", !outro.includes('id="settings-panel-orcamento"'));
  check("o conteudo do novo topico aparece", outro.includes("emergency-months-input"));

  const actions = read("js/actions.js");
  check("a acao de alternar existe", actions.includes('case "settings-section"'));
  check("tocar no aberto fecha", /state\.settingsSection === value \? null : value/.test(actions));
}

console.log("\n4. A importacao de backup nao fica escondida");
{
  abrir(null);
  run(`state.backup = { ...state.backup, error: "Arquivo invalido" };`);
  check("erro de backup abre o topico de dados", run("settingsOpenSection()") === "dados", run("settingsOpenSection()"));
  check("o erro aparece na tela", run("renderSettingsScreen()").includes("Arquivo invalido"));

  run(`state.backup = { preview: null, error: null, mode: "merge", busy: false, undoAvailable: false };`);
  check("sem erro volta a respeitar a escolha", run("settingsOpenSection()") === null);
}

console.log("\n5. Navegacao continua sempre visivel");
{
  abrir(null);
  const html = run("renderSettingsScreen()");
  ["all", "rules", "privacy", "account", "categories"].forEach((tab) => {
    check(`o atalho para "${tab}" nao entrou no acordeao`, html.includes(`data-tab="${tab}"`));
  });
  check("a lista de ferramentas continua fora de Ajustes", !html.includes('data-tab="simulators"'));
  // Categoria virou tela propria; Ajustes resume e entrega, nao edita. Se o
  // editor voltar para ca, a tela recomeca a crescer sem parar.
  check("Ajustes nao edita categoria", !html.includes("cat-edit-row") && !html.includes("new-cat-input"));
  // Sem diferenciar maiuscula: o que importa e o cartao estar la, e a
  // capitalizacao do rotulo e decisao de texto, nao de estrutura.
  check("mas mostra o resumo de categorias", /categorias e tetos/i.test(html));
}

console.log("\n6. Estrutura e acessibilidade");
{
  const par = (html, abre, fecha) => (html.match(abre) || []).length === (html.match(fecha) || []).length;
  run("SETTINGS_SECTIONS.map((s) => s.id)").concat([null]).forEach((id) => {
    abrir(id);
    const html = run("renderSettingsScreen()");
    const rotulo = id || "indice";
    check(`${rotulo}: <section> balanceadas`, par(html, /<section\b/g, /<\/section>/g));
    check(`${rotulo}: <button> balanceados`, par(html, /<button\b/g, /<\/button>/g));
    check(`${rotulo}: <div> balanceadas`, par(html, /<div\b/g, /<\/div>/g));
    check(`${rotulo}: sem lixo de template`, !/undefined|NaN|\[object Object\]|\$\{/.test(html));
  });

  abrir("aparencia");
  check("o titulo do topico e um cabecalho", /<h2 class="settings-topic__heading">/.test(run("renderSettingsScreen()")));

  // Sem os comentarios: o proprio arquivo EXPLICA por que nao usa <details>,
  // e procurar no texto cru casaria com a explicacao em vez do markup.
  const fonte = read("js/screens/settings.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check("o acordeao nao usa <details>", !/<details/.test(fonte),
    "details perderia o aberto/fechado no re-render completo");
  check("o estado do acordeao mora no state", /settingsSection/.test(read("js/app.js")));
  check("os estilos do topico existem", /\.settings-topic__toggle/.test(read("css/screens/personalization.css")));
  check("a linha respeita alvo de toque de 44px",
    /\.settings-topic__toggle\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d|\d{3})px/.test(read("css/screens/personalization.css")));
}

console.log("\n7. A sincronizacao continua opcional para o resto do app");
{
  // `setData` roda em todo o app; se ele exigisse `CloudSync` carregado, uma
  // tela isolada num teste (ou uma build parcial) quebraria ao gravar.
  ["js/app.js", "js/auth.js", "js/actions.js", "js/screens/account.js"].forEach((file) => {
    const fonte = read(file);
    const usos = (fonte.match(/CloudSync\./g) || []).length;
    const guardas = (fonte.match(/typeof CloudSync/g) || []).length;
    check(`${file} protege todo uso de CloudSync`, usos === 0 || guardas > 0, `${usos} usos, ${guardas} guardas`);
  });
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
