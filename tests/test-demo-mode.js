// test-demo-mode.js — [M25] modo demonstração.
//
// A promessa do módulo é uma frase só: **a demonstração não encosta nos dados
// reais e não sobe para conta nenhuma**. Tudo aqui existe para provar isso e
// para impedir que uma alteração futura reabra a porta sem ninguém notar.
//
// A prova central é a das guardas: com o modo ligado, `setData` não pode chamar
// `saveData` nem `CloudSync.schedule`. As duas são substituídas por espiões, e
// o teste faz uma gravação de verdade pelo mesmo caminho que qualquer tela usa.
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
run(`state.data = migrate(defaultData()); state.booting = false; state.form = freshTxForm();`);
run(`NavHistory.replace(state.tab, [], 0);`);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

/* ============================================================ conjunto fictício */
section("1. O conjunto fictício é válido e cobre o que o módulo promete");
{
  const d = run(`buildDemoData()`);
  check("passa pelo schema atual", d.version === run(`SCHEMA_VERSION`), d.version);
  check("tem seis meses de lançamentos", d.transactions.length > 60, d.transactions.length);
  check("tem conta e cartão", d.accounts.length === 1 && d.creditCards.length === 1);
  check("tem metas", d.goals.length === 2);
  check("tem patrimônio e dívida",
    d.assets.filter((a) => a.kind === "asset").length >= 3 && d.assets.some((a) => a.kind === "liability"));
  check("tem orçamento por categoria", d.categories.filter((c) => c.budget > 0).length >= 8,
    d.categories.filter((c) => c.budget > 0).length);
  check("tem recorrências reconhecíveis", d.transactions.filter((t) => t.recurring).length >= 30,
    d.transactions.filter((t) => t.recurring).length);
  check("declara renda", d.monthlyIncome > 0, d.monthlyIncome);
  check("não abre o assistente por cima da demonstração", d.onboarding.done === true);

  // As duas armadilhas de data conhecidas do projeto.
  const hoje = run(`todayIso()`);
  check("nenhum lançamento no futuro", d.transactions.every((t) => t.date <= hoje),
    d.transactions.filter((t) => t.date > hoje).slice(0, 2).map((t) => t.date));
  check("toda data é real", d.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));
  check("o mês corrente tem movimento", d.transactions.some((t) => t.date.slice(0, 7) === hoje.slice(0, 7)));

  // Determinismo: dois prints da mesma tela não podem discordar.
  const outra = run(`buildDemoData()`);
  const semId = (x) => JSON.stringify(x.transactions.map((t) => [t.date, t.amount, t.description]));
  check("é determinístico", semId(d) === semId(outra));
}

/* ================================================================ as guardas */
section("2. Ligado o modo, nada é gravado e nada sobe");
{
  // Espiões no lugar das duas saídas. Substituir a função global é o único
  // jeito de provar a ausência da chamada; observar o efeito não serviria,
  // porque neste sandbox não existe IndexedDB para inspecionar.
  run(`
    globalThis.__gravou = 0; globalThis.__agendou = 0;
    globalThis.saveData = function () { globalThis.__gravou++; return true; };
    globalThis.CloudSync = { schedule() { globalThis.__agendou++; }, disable() { globalThis.__desligou = (globalThis.__desligou || 0) + 1; }, enable() {}, isEnabled: () => false };
  `);

  run(`state.demo = { active: false }; setData((d) => ({ ...d, userName: "Real" }));`);
  check("fora da demonstração continua gravando", run(`__gravou`) === 1, run(`__gravou`));
  check("fora da demonstração continua agendando a nuvem", run(`__agendou`) === 1, run(`__agendou`));

  run(`enterDemoMode();`);
  check("entrar liga o modo", run(`isDemoMode()`) === true);
  check("entrar desliga a sincronização antes de trocar os dados", run(`__desligou >= 1`) === true);
  check("entrar troca os dados pelo conjunto fictício", run(`state.data.transactions.length > 60`) === true);
  check("entrar fecha o assistente", run(`state.onboarding.open`) === false);

  const gravouAntes = run(`__gravou`);
  const agendouAntes = run(`__agendou`);
  run(`setData((d) => ({ ...d, userName: "Alterado na demonstração" }));`);
  check("gravação dentro da demonstração NÃO chama saveData", run(`__gravou`) === gravouAntes, run(`__gravou`));
  check("gravação dentro da demonstração NÃO agenda a nuvem", run(`__agendou`) === agendouAntes, run(`__agendou`));
  check("mas a alteração aparece na tela", run(`state.data.userName`) === "Alterado na demonstração");

  // Dez gravações seguidas: uma guarda que só valesse na primeira seria pior
  // que nenhuma, porque passaria despercebida.
  run(`for (let i = 0; i < 10; i++) setData((d) => ({ ...d, monthlyIncome: 1000 + i }));`);
  check("dez gravações seguidas continuam sem tocar o disco", run(`__gravou`) === gravouAntes, run(`__gravou`));
  check("e sem tocar a nuvem", run(`__agendou`) === agendouAntes, run(`__agendou`));
}

/* ==================================================================== a saída */
section("3. Sair devolve os dados reais");
{
  run(`globalThis.loadData = function () { return migrate({ ...defaultData(), userName: "Do disco" }); };`);
  run(`exitDemoMode();`);
  check("sair desliga o modo", run(`isDemoMode()`) === false);
  check("sair relê o disco em vez de desfazer alteração", run(`state.data.userName`) === "Do disco");
  check("sair não deixa lançamento fictício para trás", run(`state.data.transactions.length`) === 0);

  const gravouAntes = run(`__gravou`);
  run(`setData((d) => ({ ...d, userName: "Depois da demonstração" }));`);
  check("depois de sair volta a gravar", run(`__gravou`) === gravouAntes + 1);

  // O assistente é a porta do aceite da política. Olhar a demonstração não pode
  // ser um jeito de entrar no app sem passar por ela.
  run(`state.onboarding.open = true; state.demo = { active: false }; enterDemoMode();`);
  check("o assistente aberto é lembrado ao entrar", run(`state.demo.onboardingWasOpen`) === true);
  run(`exitDemoMode();`);
  check("e volta a aparecer ao sair", run(`state.onboarding.open`) === true);

  run(`state.onboarding.open = false; enterDemoMode(); exitDemoMode();`);
  check("quem não estava no assistente não é jogado nele", run(`state.onboarding.open`) === false);
}

/* =============================================================== a interface */
section("4. A demonstração se anuncia e oferece a saída");
{
  const faixa = run(`renderDemoBanner()`);
  check("a faixa diz que os dados são de demonstração", /Dados de demonstração/.test(faixa));
  check("a faixa diz que nada é salvo nem sobe", /nada é salvo/.test(faixa) && /conta nenhuma/.test(faixa));
  check("a faixa avisa que recarregar encerra", /Recarregar a página já encerra/.test(faixa));
  check("a faixa oferece a saída", /data-action="demo-exit"/.test(faixa) && /Começar com meus dados/.test(faixa));
  check("a faixa NÃO tem botão de fechar", !/dismiss|fechar/i.test(faixa));

  const shellSrc = readSrc("js/app.js");
  check("a faixa entra no shell de todas as telas", /isDemoMode\(\) \? renderDemoBanner\(\) : ""/.test(shellSrc));

  const onb = readSrc("js/screens/onboarding.js");
  check("existe porta de entrada no assistente", /data-action="demo-enter"/.test(onb) && /Explorar demonstração/.test(onb));
  check("a porta de entrada não exige o aceite",
    !/data-action="demo-enter"[^>]*disabled/.test(onb));

  const acoes = readSrc("js/actions.js");
  check("as duas ações têm case", /case "demo-enter"/.test(acoes) && /case "demo-exit"/.test(acoes));
}

/* ============================================================ não regressão */
section("5. Nada foi ampliado por acidente");
{
  const app = readSrc("js/app.js");
  check("saveData continua chamado em um lugar só", (app.match(/saveData\(/g) || []).length === 1,
    (app.match(/saveData\(/g) || []).length);
  check("a guarda de gravação está no caminho único",
    /const ok = isDemoMode\(\) \? true : saveData\(state\.data\);/.test(app));
  check("a guarda de nuvem está no mesmo lugar",
    /CloudSync !== "undefined" && !isDemoMode\(\)\) CloudSync\.schedule\(\)/.test(app));
  check("o modo não é persistido em lugar nenhum",
    !/demo/i.test(readSrc("js/storage.js").match(/function defaultData\(\)[\s\S]{0,1400}/)[0]));
  // Só o CÓDIGO: os comentários do arquivo explicam de propósito como o
  // snapshot passa a ser usado por `state.data`, e citá-lo não é tocá-lo.
  const demoCodigo = readSrc("js/demo.js").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  check("o conjunto fictício é um arquivo puro, sem DOM nem state",
    !/document\.|\bstate\./.test(demoCodigo));
  check("os lançamentos fictícios são marcados na origem",
    /source: "demo"/.test(readSrc("js/demo.js")));
}

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
