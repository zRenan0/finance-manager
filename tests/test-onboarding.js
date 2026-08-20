// test-onboarding.js — configuração inicial em 4 passos.
//
// Cobre três coisas que quebram de formas diferentes:
//   1. A INFERÊNCIA da migração. Quem já usava o app não pode ser recebido por
//      uma tela de boas-vindas, e esse estado não existe no disco dele.
//   2. As GUARDAS de avanço. Passo 2 sem renda e passo 3 sem nome de conta não
//      podem deixar o botão "Continuar" ativo.
//   3. A GRAVAÇÃO única do final. Os quatro passos viram dado real de uma vez;
//      abandonar no meio não pode deixar meia conta cadastrada.
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
  "js/screens/import.js", "js/screens/settings.js", "js/screens/modals.js",
];

/* ------------------------------------------------------------------- DOM mínimo */
function fakeEl() {
  return {
    innerHTML: "", value: "", disabled: false, style: {}, dataset: {},
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
  "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js",
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

/* ================================================================= migração */
section("1. Inferência da migração (quem já usava não vê boas-vindas)");
{
  check("base zerada começa com onboarding pendente",
    run(`migrate(defaultData()).onboarding.done`) === false);

  const comLancamento = run(`(() => {
    const d = defaultData();
    d.transactions = [{ id: "t1", date: todayIso(), type: "expense", amount: 10, categoryId: "outros",
      description: "x", payment: "Débito", createdAt: todayIso(), updatedAt: todayIso() }];
    delete d.onboarding;
    return migrate(d).onboarding.done;
  })()`);
  check("base com lançamento entra como concluída", comLancamento === true);

  check("base só com renda entra como concluída",
    run(`(() => { const d = defaultData(); d.monthlyIncome = 5000; delete d.onboarding; return migrate(d).onboarding.done; })()`) === true);

  check("base só com nome entra como concluída",
    run(`(() => { const d = defaultData(); d.userName = "Renan"; delete d.onboarding; return migrate(d).onboarding.done; })()`) === true);

  check("registro explícito vence a inferência",
    run(`(() => { const d = defaultData(); d.monthlyIncome = 5000; d.onboarding = { done: false }; return migrate(d).onboarding.done; })()`) === false);

  check("campo adulterado não derruba a migração",
    run(`migrate(Object.assign(defaultData(), { onboarding: "sim" })).onboarding.done`) === false);

  check("completedAt inválido vira null",
    run(`migrate(Object.assign(defaultData(), { onboarding: { done: true, completedAt: "ontem" } })).onboarding.completedAt`) === null);
}

/* ============================================================ guardas de avanço */
section("2. Guardas de avanço");
{
  run(`state.onboarding = freshOnboarding(); state.onboarding.open = true;`);
  check("passo 1 exige aceite dos textos", run(`onbCanAdvance(1)`) === false);
  run(`state.onboarding.legalAccepted = true;`);
  check("passo 1 avança depois do aceite", run(`onbCanAdvance(1)`) === true);

  run(`state.onboarding.income = "";`);
  check("passo 2 trava sem renda", run(`onbCanAdvance(2)`) === false);
  run(`state.onboarding.income = "0";`);
  check("passo 2 trava com renda zero", run(`onbCanAdvance(2)`) === false);
  run(`state.onboarding.income = "abc";`);
  check("passo 2 trava com texto no lugar do número", run(`onbCanAdvance(2)`) === false);
  run(`state.onboarding.income = "4.500,50";`);
  check("passo 2 aceita valor com separador brasileiro", run(`onbCanAdvance(2)`) === true);
  check("renda é lida em reais, não em centavos", run(`onbIncome()`) === 4500.5, run(`onbIncome()`));

  check("passo 3 trava sem nome da conta", run(`onbCanAdvance(3)`) === false);
  run(`state.onboarding.account.name = "   ";`);
  check("passo 3 não aceita nome só de espaços", run(`onbCanAdvance(3)`) === false);
  run(`state.onboarding.skipAccount = true;`);
  check("passo 3 libera quando o cadastro é dispensado", run(`onbCanAdvance(3)`) === true);
  run(`state.onboarding.skipAccount = false; state.onboarding.account.name = "Nubank"; state.onboarding.account.balance = "1.200,00";`);
  check("passo 3 libera com nome e saldo", run(`onbCanAdvance(3)`) === true);
  check("passo 4 nunca trava", run(`onbCanAdvance(4)`) === true);
}

/* ================================================================ presets */
section("3. Presets da regra de orçamento");
{
  check("todo preset soma 100%",
    run(`ONB_SPLIT_PRESETS.every((p) => p.necessidade + p.desejo + p.futuro === 100)`) === true);
  check("preset padrão é reconhecido pelo estado inicial",
    run(`(() => { state.onboarding = freshOnboarding(); return onbSplitPresetId(); })()`) === "50/30/20");
  check("divisão fora do catálogo não marca nenhum preset",
    run(`(() => { state.onboarding.split = { necessidade: 33, desejo: 33, futuro: 34 }; return onbSplitPresetId(); })()`) === "");
}

/* ============================================================== renderização */
section("4. Renderização dos 4 passos");
{
  run(`state.data = migrate(defaultData()); state.onboarding = freshOnboarding(); state.onboarding.open = true; state.onboarding.legalAccepted = true;`);
  for (let step = 1; step <= 4; step++) {
    run(`state.onboarding.step = ${step};`);
    const html = run(`renderOnboardingLayer()`);
    check(`passo ${step}: HTML não vazio`, html.length > 300, html.length);
    check(`passo ${step}: sem "undefined"`, !/undefined/.test(html));
    check(`passo ${step}: sem "NaN"`, !/NaN/.test(html));
    check(`passo ${step}: sem "[object Object]"`, !html.includes("[object Object]"));
    check(`passo ${step}: barra de progresso presente`, /onb__progress/.test(html));
    check(`passo ${step}: botão de avanço tem âncora de id`, /id="onb-advance"/.test(html));
  }

  // O passo 4 só mostra a prévia em reais quando existe renda para dividir.
  run(`state.onboarding.step = 4; state.onboarding.income = "";`);
  check("passo 4 sem renda omite a prévia", !/onb__preview/.test(run(`renderOnboardingLayer()`)));
  run(`state.onboarding.income = "5000";`);
  const comPrevia = run(`renderOnboardingLayer()`);
  check("passo 4 com renda mostra a prévia", /onb__preview/.test(comPrevia));
  check("prévia calcula 50% da renda", comPrevia.includes("2.500,00"), comPrevia.includes("2.500,00"));

  // Todo input delegado precisa de id, senão o foco se perde a cada tecla.
  const semAncora = (readSrc("js/screens/onboarding.js").match(/<input[^>]*>/g) || [])
    .filter((tag) => /data-field=/.test(tag)).filter((tag) => !/ id="/.test(tag));
  check("todo input do onboarding tem id", semAncora.length === 0, semAncora);
}

/* ============================================================ ações no onClick */
section("5. Ações têm case no onClick");
{
  const src = run(`onClick.toString()`);
  ["onb-next", "onb-back", "onb-skip", "onb-finish", "onb-split", "onb-skip-account", "onb-restart"]
    .forEach((a) => check(`ação "${a}" tem case`, src.includes(`case "${a}"`)));

  const inputSrc = run(`onInput.toString()`);
  ["onb-name", "onb-income", "onb-acc-name", "onb-acc-balance"]
    .forEach((f) => check(`campo "${f}" tem case no onInput`, inputSrc.includes(`case "${f}"`)));
  check("tipo da conta é tratado no onChange", run(`onChange.toString()`).includes("onb-acc-type"));
}

/* ============================================================ gravação final */
section("6. Conclusão grava tudo de uma vez");
{
  run(`state.data = migrate(defaultData());`);
  run(`state.onboarding = Object.assign(freshOnboarding(), {
    open: true, step: 4, name: "  Renan  ", income: "7.500,00",
    account: { name: " Nubank ", type: "digital", balance: "1.200,00" },
    skipAccount: false, split: { necessidade: 60, desejo: 20, futuro: 20 },
  });`);
  run(`finishOnboarding()`);

  check("nome gravado sem espaços nas pontas", run(`state.data.userName`) === "Renan");
  check("renda gravada em reais", run(`state.data.monthlyIncome`) === 7500, run(`state.data.monthlyIncome`));
  check("regra de orçamento gravada", run(`JSON.stringify(state.data.budgetSplit)`) === JSON.stringify({ necessidade: 60, desejo: 20, futuro: 20 }));
  check("uma conta criada", run(`state.data.accounts.length`) === 1);
  check("conta com o nome informado", run(`state.data.accounts[0].name`) === "Nubank");
  check("saldo inicial em reais", run(`state.data.accounts[0].openingBalance`) === 1200, run(`state.data.accounts[0].openingBalance`));
  check("tipo da conta preservado", run(`state.data.accounts[0].type`) === "digital");
  check("objetivo do Início é gravado", run(`state.data.dashboardFocus`) === "month");
  check("onboarding marcado como concluído", run(`state.data.onboarding.done`) === true);
  check("conclusão não é 'pulado'", run(`state.data.onboarding.skipped`) === false);
  check("camada fechou", run(`state.onboarding.open`) === false);
  check("caiu no dashboard", run(`state.tab`) === "dashboard");

  // Dispensar o cadastro de conta não pode criar conta fantasma.
  run(`state.data = migrate(defaultData());`);
  run(`state.onboarding = Object.assign(freshOnboarding(), {
    open: true, step: 4, income: "3000", skipAccount: true,
    account: { name: "Não deve entrar", type: "corrente", balance: "500" },
  });`);
  run(`finishOnboarding()`);
  check("conta dispensada não é criada", run(`state.data.accounts.length`) === 0);
  check("renda continua gravada mesmo sem conta", run(`state.data.monthlyIncome`) === 3000);
}

/* ================================================================== pular */
section("7. Pular também é um desfecho");
{
  run(`state.data = migrate(defaultData()); state.onboarding = freshOnboarding(); state.onboarding.open = true; state.onboarding.legalAccepted = true;`);
  run(`skipOnboarding()`);
  check("marcado como concluído", run(`state.data.onboarding.done`) === true);
  check("marcado como pulado", run(`state.data.onboarding.skipped`) === true);
  check("camada fechou", run(`state.onboarding.open`) === false);
  check("nada foi gravado por engano", run(`state.data.monthlyIncome === 0 && state.data.accounts.length === 0`) === true);
}

/* ============================================================== reabertura */
section("8. Reabrir por Ajustes preenche o que já existe");
{
  run(`state.data = migrate(defaultData());`);
  run(`setData((d) => Object.assign({}, d, {
    userName: "Renan", monthlyIncome: 4200,
    dashboardFocus: "reserve",
    budgetSplit: { necessidade: 40, desejo: 20, futuro: 40 },
    accounts: [makeAccount({ name: "Itaú", type: "corrente", openingBalance: 800, openingDate: todayIso(), color: "#0B6B5C" })],
  }));`);
  run(`startOnboarding()`);

  check("abre no passo 1", run(`state.onboarding.step`) === 1);
  check("nome pré-preenchido", run(`state.onboarding.name`) === "Renan");
  check("renda pré-preenchida em formato brasileiro", run(`state.onboarding.income`) === "4200,00", run(`state.onboarding.income`));
  check("regra de orçamento pré-selecionada", run(`onbSplitPresetId()`) === "40/20/40");
  check("conta existente pré-preenchida", run(`state.onboarding.account.name`) === "Itaú");
  check("cadastro de conta já vem dispensado (evita duplicata)", run(`state.onboarding.skipAccount`) === true);
  check("objetivo anterior volta selecionado", run(`state.onboarding.focus`) === "reserve");

  // Refazer não pode duplicar a conta que já existia.
  run(`state.onboarding.step = 4; finishOnboarding();`);
  check("refazer não duplica a conta", run(`state.data.accounts.length`) === 1);
  check("refazer preserva o nome", run(`state.data.userName`) === "Renan");
}

/* ============================================================== backup */
section("9. Backup carrega o estado do onboarding");
{
  run(`state.data = migrate(defaultData()); setData((d) => Object.assign({}, d, { onboarding: { done: true, skipped: false, completedAt: todayIso() } }));`);
  check("envelope inclui o campo", run(`!!buildBackupEnvelope(state.data).data.onboarding`) === true);
  check("checksum confere com o payload",
    run(`(() => { const e = buildBackupEnvelope(state.data); return checksumOf(canonicalJson(e.data)) === e.checksum; })()`) === true);

  // Restaurar um backup antigo não pode reabrir o assistente neste aparelho.
  const mesclado = run(`(() => {
    const atual = Object.assign({}, migrate(defaultData()), { onboarding: { done: true, skipped: false, completedAt: todayIso() } });
    const antigo = Object.assign({}, migrate(defaultData()), { onboarding: { done: false, skipped: false, completedAt: null } });
    return mergeBackupInto(atual, antigo).data.onboarding.done;
  })()`);
  check("mesclagem preserva o concluído do aparelho", mesclado === true);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
