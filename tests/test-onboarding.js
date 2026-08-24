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
  "js/screens/import.js", "js/screens/categories.js", "js/screens/settings.js", "js/screens/modals.js",
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

/* ================================================= semeadura de tetos */
// O buraco que esta parte fecha: escolher "50 / 30 / 20" gravava três
// percentuais e nada mais. Nenhuma categoria ganhava teto, então o motor de
// budgets.js (faixas de 80% e 100%, projeção de ritmo, cartão de orçamentos)
// ficava mudo e o modelo escolhido virava decoração.
section("3b. Semeadura de tetos pela regra x/x/x");
{
  run(`state.data = migrate(defaultData());`);

  check("sem renda não semeia nada",
    run(`seedBudgetsFromSplit(state.data, 0, { necessidade: 50, desejo: 30, futuro: 20 }).items.length`) === 0);
  check("renda negativa não semeia nada",
    run(`seedBudgetsFromSplit(state.data, -100, { necessidade: 50, desejo: 30, futuro: 20 }).items.length`) === 0);

  const base = JSON.parse(run(`(() => {
    const s = seedBudgetsFromSplit(state.data, 5000, { necessidade: 50, desejo: 30, futuro: 20 });
    return JSON.stringify({
      ids: s.items.map((i) => i.categoryId),
      total: sumMoney(s.items, (i) => i.budget),
      grupos: s.groups.map((g) => ({ group: g.group, allocated: g.allocated, soma: sumMoney(g.items, (i) => i.budget) })),
      zerados: s.items.filter((i) => !(i.budget > 0)).length,
      kept: s.kept.length,
    });
  })()`));

  check("semeia as categorias principais", base.ids.length > 0, base.ids);
  check("cada grupo distribui exatamente a sua cota",
    base.grupos.every((g) => g.soma === g.allocated), base.grupos);
  check("o total semeado é a renda inteira", base.total === 5000, base.total);
  check("nenhum teto nasce zerado", base.zerados === 0);
  check("base nova não tem teto a preservar", base.kept === 0);

  // Subcategoria de fora: o gasto dela já conta para o teto da mãe, então dois
  // tetos medindo o mesmo gasto contariam o dobro no total do cartão.
  check("subcategoria não recebe teto próprio",
    base.ids.indexOf("mercado") === -1 && base.ids.indexOf("delivery") === -1, base.ids);
  check("categoria principal de cada grupo entra",
    base.ids.indexOf("moradia") !== -1 && base.ids.indexOf("lazer") !== -1 && base.ids.indexOf("investimento") !== -1);

  // Peso, não parte igual: Moradia não pode receber o mesmo que Educação.
  const pesos = JSON.parse(run(`(() => {
    const s = seedBudgetsFromSplit(state.data, 5000, { necessidade: 50, desejo: 30, futuro: 20 });
    const por = {};
    s.items.forEach((i) => { por[i.categoryId] = i.budget; });
    return JSON.stringify(por);
  })()`));
  check("Moradia recebe mais que Educação", pesos.moradia > pesos.educacao, pesos);
  check("Moradia leva 40% das Necessidades", pesos.moradia === 1000, pesos.moradia);
  check("Investimentos leva o grupo Futuro inteiro", pesos.investimento === 1000, pesos.investimento);

  // Teto já definido é intocável E sai da cota do grupo. Ignorar a segunda parte
  // proporia um orçamento que estoura a renda no papel, antes de qualquer gasto.
  const comTeto = JSON.parse(run(`(() => {
    const d = migrate(defaultData());
    d.categories = d.categories.map((c) => (c.id === "moradia" ? Object.assign({}, c, { budget: 2000 }) : c));
    const s = seedBudgetsFromSplit(d, 5000, { necessidade: 50, desejo: 30, futuro: 20 });
    const nec = s.groups.find((g) => g.group === "necessidade");
    return JSON.stringify({
      semeouMoradia: s.items.some((i) => i.categoryId === "moradia"),
      preservouMoradia: s.kept.some((k) => k.categoryId === "moradia"),
      committed: nec.committed,
      available: nec.available,
      soma: sumMoney(nec.items, (i) => i.budget),
    });
  })()`));
  check("categoria com teto não é semeada de novo", comTeto.semeouMoradia === false);
  check("categoria com teto aparece como preservada", comTeto.preservouMoradia === true);
  check("o teto existente é descontado da cota do grupo", comTeto.committed === 2000, comTeto.committed);
  check("o restante do grupo é o que sobrou da cota", comTeto.available === 500, comTeto.available);
  check("as demais dividem só o que sobrou", comTeto.soma === 500, comTeto.soma);

  // Grupo já comprometido além da cota: nada a sugerir, e nada de teto negativo.
  const estourado = JSON.parse(run(`(() => {
    const d = migrate(defaultData());
    d.categories = d.categories.map((c) => (c.id === "moradia" ? Object.assign({}, c, { budget: 3000 }) : c));
    const s = seedBudgetsFromSplit(d, 5000, { necessidade: 50, desejo: 30, futuro: 20 });
    const nec = s.groups.find((g) => g.group === "necessidade");
    return JSON.stringify({ itens: nec.items.length, available: nec.available, negativos: s.items.filter((i) => i.budget < 0).length });
  })()`));
  check("grupo comprometido além da cota não sugere nada", estourado.itens === 0, estourado);
  check("cota estourada não vira teto negativo", estourado.negativos === 0);

  // Regra diferente move o dinheiro de grupo, não some com ele.
  const agressivo = JSON.parse(run(`(() => {
    const s = seedBudgetsFromSplit(state.data, 5000, { necessidade: 40, desejo: 20, futuro: 40 });
    const por = {};
    s.items.forEach((i) => { por[i.categoryId] = i.budget; });
    return JSON.stringify({ por, total: sumMoney(s.items, (i) => i.budget) });
  })()`));
  check("40/20/40 continua distribuindo a renda inteira", agressivo.total === 5000, agressivo.total);
  check("40/20/40 dobra o teto de Investimentos", agressivo.por.investimento === 2000, agressivo.por.investimento);

  // A aplicação é pura e não mexe em quem já tinha teto.
  const aplicado = JSON.parse(run(`(() => {
    const d = migrate(defaultData());
    d.categories = d.categories.map((c) => (c.id === "lazer" ? Object.assign({}, c, { budget: 111 }) : c));
    const s = seedBudgetsFromSplit(d, 5000, { necessidade: 50, desejo: 30, futuro: 20 });
    const novas = categoriesWithSeededBudgets(d.categories, s);
    return JSON.stringify({
      original: d.categories.filter((c) => c.budget > 0).length,
      lazer: novas.find((c) => c.id === "lazer").budget,
      moradia: novas.find((c) => c.id === "moradia").budget,
      mercado: novas.find((c) => c.id === "mercado").budget,
      contagem: novas.length === d.categories.length,
    });
  })()`));
  check("aplicar não muda a lista de origem", aplicado.original === 1, aplicado.original);
  check("teto digitado pelo usuário sobrevive", aplicado.lazer === 111, aplicado.lazer);
  check("categoria sem teto recebe o valor semeado", aplicado.moradia > 0, aplicado.moradia);
  check("subcategoria continua sem teto", aplicado.mercado === null, aplicado.mercado);
  check("nenhuma categoria some no caminho", aplicado.contagem === true);
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

  // A conclusão grava teto em categoria que o usuário não tocou. Ele precisa
  // poder ver o que vai acontecer antes de concluir, não descobrir depois.
  check("passo 4 mostra a prévia dos tetos", /onb-seed/.test(comPrevia));
  check("prévia dos tetos lista uma linha por categoria principal",
    (comPrevia.match(/onb-seed__row/g) || []).length === 9, (comPrevia.match(/onb-seed__row/g) || []).length);
  check("prévia dos tetos nomeia a categoria", comPrevia.includes("Moradia"));
  run(`state.onboarding.income = "";`);
  check("sem renda não há prévia de tetos", !/onb-seed/.test(run(`renderOnboardingLayer()`)));
  run(`state.onboarding.income = "5000";`);

  // Todo input delegado precisa de id, senão o foco se perde a cada tecla.
  const semAncora = (readSrc("js/screens/onboarding.js").match(/<input[^>]*>/g) || [])
    .filter((tag) => /data-field=/.test(tag)).filter((tag) => !/ id="/.test(tag));
  check("todo input do onboarding tem id", semAncora.length === 0, semAncora);
}

/* ============================================================ ações no onClick */
section("5. Ações têm case no onClick");
{
  const src = run(`onClick.toString()`);
  ["onb-next", "onb-back", "onb-skip", "onb-finish", "onb-split", "onb-skip-account", "onb-restart",
   "seed-budgets-from-split"]
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

/* ================================================= tetos na conclusão */
// Integração: não basta a função pura estar certa, o teto tem de chegar ao
// banco E ao snapshot do mês. budgetForCategory lê o snapshot ANTES de olhar a
// categoria; gravar um sem o outro deixaria o cartão de orçamentos vazio até a
// virada do mês, que é o defeito mais difícil de reproduzir dos dois.
section("6b. Conclusão semeia os tetos e acorda o motor de orçamentos");
{
  run(`state.data = migrate(defaultData());`);
  run(`state.onboarding = Object.assign(freshOnboarding(), {
    open: true, step: 4, income: "5.000,00", skipAccount: true,
    split: { necessidade: 50, desejo: 30, futuro: 20 },
  });`);
  run(`finishOnboarding()`);

  const comTetos = run(`state.data.categories.filter((c) => c.budget > 0).length`);
  check("categorias saem da conclusão com teto", comTetos > 0, comTetos);
  check("soma dos tetos principais é a renda",
    run(`sumMoney(state.data.categories.filter((c) => !c.parentId && c.budget > 0), (c) => c.budget)`) === 5000,
    run(`sumMoney(state.data.categories.filter((c) => !c.parentId && c.budget > 0), (c) => c.budget)`));
  check("subcategoria continua sem teto",
    run(`state.data.categories.find((c) => c.id === "mercado").budget`) === null);

  // O motor deste projeto inteiro depende disto: sem teto, computeBudgetStatus
  // devolve lista vazia e nenhum alerta de 80% ou 100% chega a existir.
  check("o motor de orçamentos passa a enxergar tetos",
    run(`computeBudgetStatus(state.data, keyOfCurrentMonth()).items.length`) > 0);
  check("o teto vale para o mês corrente (snapshot atualizado)",
    run(`budgetForCategory(state.data, "moradia", keyOfCurrentMonth())`) === 1000,
    run(`budgetForCategory(state.data, "moradia", keyOfCurrentMonth())`));
  check("o total do cartão não conta o mesmo gasto duas vezes",
    run(`computeBudgetStatus(state.data, keyOfCurrentMonth()).totals.budget`) === 5000,
    run(`computeBudgetStatus(state.data, keyOfCurrentMonth()).totals.budget`));

  // Refazer a configuração não pode atropelar um teto digitado à mão.
  run(`setData((d) => Object.assign({}, d, {
    categories: d.categories.map((c) => (c.id === "moradia" ? Object.assign({}, c, { budget: 4321 }) : c)),
  }));`);
  run(`startOnboarding(); state.onboarding.step = 4; finishOnboarding();`);
  check("teto digitado sobrevive a uma nova conclusão",
    run(`state.data.categories.find((c) => c.id === "moradia").budget`) === 4321,
    run(`state.data.categories.find((c) => c.id === "moradia").budget`));

  // Sem renda declarada não existe cota para dividir; concluir não pode inventar
  // teto nenhum, e muito menos um teto de R$ 0,00.
  run(`state.data = migrate(defaultData());`);
  run(`state.onboarding = Object.assign(freshOnboarding(), { open: true, step: 4, income: "", skipAccount: true });`);
  run(`finishOnboarding()`);
  check("sem renda a conclusão não grava teto",
    run(`state.data.categories.filter((c) => c.budget !== null).length`) === 0);
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
