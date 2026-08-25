// test-health-render.js — smoke test de RENDERIZAÇÃO da tela de Saúde Financeira.
// Carrega app.js num contexto de VM com um DOM mínimo e chama renderHealthScreen()
// com cenários diferentes, conferindo se o HTML sai íntegro (sem `undefined`,
// `NaN`, `[object Object]` ou tags desbalanceadas). Ferramenta de dev, não vai
// para o app.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Telas fatiadas de app.js. Mesma ordem do index.html: elas carregam ANTES de
// app.js, cujo estado inicial chama freshOnboarding() na avaliação.
const SCREEN_FILES = [
  "js/screens/_shared.js",
  "js/screens/onboarding.js",
  "js/screens/dashboard.js",
  "js/screens/accounts.js",
  "js/screens/debts.js",
  "js/screens/add.js",
  "js/screens/analytics.js",
  "js/screens/goals.js",
  "js/screens/calendar.js",
  "js/screens/health.js",
  "js/screens/wealth.js",
  "js/screens/portfolio.js",
  "js/screens/invest.js",
  "js/screens/simulators.js",
  "js/screens/simulate.js",
  "js/screens/insights.js",
  "js/screens/subscriptions.js",
  "js/screens/notifications.js",
  "js/screens/achievements.js",
  "js/screens/import.js",
  "js/screens/all.js",
  "js/screens/rules.js",
  "js/screens/categories.js",
  "js/screens/settings.js",
  "js/screens/privacy.js",
  "js/screens/account.js",
  "js/screens/modals.js",
];
// Varreduras de código-fonte precisam ver o app INTEIRO, não só o núcleo.
const uiSrc = () => ["js/app.js", "js/actions.js"].concat(SCREEN_FILES).map(readSrc).join("\n");

/* ------------------------------------------------- DOM mínimo (só o que app.js toca) */
function fakeEl() {
  return {
    innerHTML: "", value: "", style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
}
const documentStub = {
  documentElement: fakeEl(),
  body: fakeEl(),
  getElementById() { return fakeEl(); },
  querySelector() { return fakeEl(); },
  querySelectorAll() { return []; },
  createElement() { return fakeEl(); },
  addEventListener() {}, removeEventListener() {},
  activeElement: null, visibilityState: "visible",
};

const ctx = {
  console,
  document: documentStub,
  navigator: { userAgent: "node", language: "pt-BR", onLine: true, serviceWorker: undefined, share: undefined },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost" },
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined,
  module: { exports: {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  alert() {}, confirm() { ctx.__confirmCalls = (ctx.__confirmCalls || 0) + 1; return ctx.__confirmResult !== false; }, prompt() { return null; },
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js", "js/safe-errors.js", "js/storage.js", "js/accounts.js", "js/movements.js", "js/data-sources.js", "js/debts.js", "js/budgets.js", "js/charts.js",
  "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/transparency.js", "js/calendar.js",
  "js/recurring.js", "js/analytics.js",
  "js/insights.js", "js/assistant.js", "js/contextual-assistant.js", "js/advisor.js", "js/investments.js",
  "js/portfolio.js", "js/simulators.js", "js/qrcode.js",
  "js/achievements.js", "js/wrapped.js", "js/services.js",
  "js/auth.js", "js/cloud-sync.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

// `state` e as funções de app.js são declaradas com let/function em escopo de
// script — não viram propriedades do objeto de contexto. O acesso é por avaliação.
const run = (code) => vm.runInContext(code, ctx);
function setData(data) { ctx.__d = data; run("state.data = __d; state.monthOffset = 0;"); }
function setTab(tab) { ctx.__t = tab; run("state.tab = __t;"); }
function setDetail(id) { ctx.__i = id; run("state.healthDetailId = __i;"); }

/* ------------------------------------------------------------------ cenários */
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` → ${extra}` : ""}`); }
}

function auditHtml(label, html) {
  check(`${label}: HTML não vazio`, html.length > 500, `${html.length} chars`);
  check(`${label}: sem "undefined"`, !/undefined/.test(html));
  check(`${label}: sem "NaN"`, !/NaN/.test(html));
  check(`${label}: sem "[object Object]"`, !html.includes("[object Object]"));
  check(`${label}: sem template literal cru`, !html.includes("${"));
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  check(`${label}: <div> balanceadas (${open}/${close})`, open === close);
  const bOpen = (html.match(/<button\b/g) || []).length;
  const bClose = (html.match(/<\/button>/g) || []).length;
  check(`${label}: <button> balanceados (${bOpen}/${bClose})`, bOpen === bClose);
  check(`${label}: todas as ações têm alvo válido`,
    (html.match(/data-tab="([a-z]+)"/g) || []).every((m) => {
      const tab = m.match(/"([a-z]+)"/)[1];
      return ["dashboard", "analytics", "add", "invest", "goals", "settings", "import", "simulate", "subscriptions", "health", "wealth", "calendar", "simulators", "achievements", "insights", "notifications", "accounts", "debts", "all", "rules", "categories", "privacy", "account"].includes(tab);
    }));
}

let seq = 0;
const tx = (p) => { ctx.__p = { id: `t${++seq}`, ...p }; return run("makeTransaction(__p)"); };
const iso = (d) => { ctx.__dt = d; return run("isoOfDate(__dt)"); };
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };

console.log("\n1. Tela com base vazia");
{
  setData(run("defaultData()"));
  setTab("health");
  setDetail(null);
  auditHtml("vazio", run("renderHealthScreen()"));
}

console.log("\n2. Tela com perfil completo + acordeão aberto");
{
  const transactions = [];
  for (let m = 5; m >= 0; m--) {
    transactions.push(tx({ type: "income", amount: 7500, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 2800, categoryId: "moradia", date: monthsAgo(m, 8), recurring: true }));
    transactions.push(tx({ type: "expense", amount: 1400, categoryId: "lazer", date: monthsAgo(m, 14), payment: "Crédito" }));
    transactions.push(tx({ type: "expense", amount: 900, categoryId: "investimento", date: monthsAgo(m, 6) }));
  }
  for (let i = 1; i <= 6; i++) {
    transactions.push(tx({
      type: "expense", amount: 350, categoryId: "outros", payment: "Crédito",
      date: iso(new Date(new Date().getFullYear(), new Date().getMonth() + i, 15)),
      description: `Celular (${i}/6)`, installmentGroupId: "g1", installmentIndex: i, installmentTotal: 6,
    }));
  }
  setData({ ...run("defaultData()"), monthlyIncome: 7500, transactions,
    goals: [{ id: "g", name: "Reserva de emergência", target: 30000, current: 12000, savedUpfront: 0, icon: "piggy", deadline: null }] });
  setDetail("dividas");
  const html = run("renderHealthScreen()");
  auditHtml("completo", html);
  check("acordeão aberto renderiza o método", html.includes("indicator__method"));
  check("os 7 indicadores aparecem", (html.match(/card--indicator/g) || []).length === 7,
    (html.match(/card--indicator/g) || []).length);
  check("plano de ação presente", html.includes("plan-list"));
  check("medidor tem largura percentual", /indicator__meter-fill[^>]*width:\d+%/.test(html));
}

console.log("\n3. Tela de Patrimônio (Módulo 3)");
{
  setTab("wealth");
  // Cadastro completo montado dentro da VM para usar as fábricas reais.
  run(`state.data = { ...state.data, assets: [
    makeAsset({ class: "conta", name: "Banco digital", value: 3200, inLedger: true }),
    makeAsset({ class: "investimento", name: "Tesouro Selic", value: 48000 }),
    makeAsset({ class: "imovel", name: "Apartamento", value: 420000 }),
    makeAsset({ class: "veiculo", name: "Carro", value: 58000 }),
    makeAsset({ class: "divida", name: "Financiamento", value: 190000, monthlyPayment: 2400 }),
  ] };`);
  auditHtml("patrimônio", run("renderWealthScreen()"));

  const html = run("renderWealthScreen()");
  check("gráfico de evolução renderizado", html.includes("wealth-chart"));
  check("comparação anual presente", html.includes("year-bars"));
  check("distribuição por classe presente", html.includes("alloc-list"));
  check("todos os grupos cadastrados aparecem", (html.match(/wealth-group__head/g) || []).length === 5,
    (html.match(/wealth-group__head/g) || []).length);
  check("item marcado como já-lançado recebe etiqueta", html.includes("já nos lançamentos"));
  check("parcela mensal do financiamento exibida", html.includes("por mês"));

  // Formulário aberto
  run("state.wealth.form = freshWealthForm('divida');");
  const form = run("renderWealthScreen()");
  auditHtml("formulário", form);
  check("formulário mostra campo de parcela para dívida", form.includes('data-field="wealth-payment"'));
  run("state.wealth.form = freshWealthForm('conta');");
  const formConta = run("renderWealthScreen()");
  check("conta oferece o interruptor anti-dupla-contagem", formConta.includes('data-action="wealth-toggle-ledger"'));
  check("conta NÃO mostra campo de parcela", !formConta.includes('data-field="wealth-payment"'));
  run("state.wealth.form = null;");

  // Linha expandida para atualizar valor e diálogo compartilhado de confirmação
  run("state.wealth.updatingId = state.data.assets[1].id; state.wealth.updateValue = '50000';");
  const upd = run("renderWealthScreen()");
  auditHtml("atualizar valor", upd);
  check("campo de atualização renderizado", upd.includes('data-field="wealth-update"'));
  run("state.wealth.updatingId = null; requestConfirmation({ title: 'Excluir?', message: 'Confirmar exclusão', tone: 'danger' });");
  const del = run("renderConfirmationModal()");
  check("exclusão usa popup", del.includes('role="alertdialog"') && del.includes('data-action="confirmation-accept"'));
  run("closeOverlayState('confirmation'); state.overlayStack = [];");

  // Janelas do gráfico
  [6, 12, 24].forEach((mo) => {
    ctx.__mo = mo;
    run("state.wealth.months = __mo;");
    let ok = true, err = null;
    try { run("renderWealthScreen()"); } catch (e) { ok = false; err = e.message; }
    check(`janela de ${mo} meses renderiza`, ok, err);
  });
  run("state.wealth.months = 12;");
}

console.log("\n3b. Telas do Módulo 4 (metas, calendário e previsão)");
{
  // Base com histórico, metas em situações diferentes e uma dívida com vencimento.
  const transactions = [];
  for (let m = 3; m >= 0; m--) {
    transactions.push(tx({ type: "income", amount: 6200, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 1600, categoryId: "moradia", date: monthsAgo(m, 10), recurring: true, description: "Aluguel" }));
    transactions.push(tx({ type: "expense", amount: 820, categoryId: "mercado", date: monthsAgo(m, 16) }));
    transactions.push(tx({ type: "expense", amount: 400, categoryId: "investimento", date: monthsAgo(m, 6), goalId: "meta-1", description: "Aporte" }));
  }
  for (let i = 1; i <= 5; i++) {
    transactions.push(tx({
      type: "expense", amount: 290, categoryId: "outros", payment: "Crédito",
      date: iso(new Date(new Date().getFullYear(), new Date().getMonth() + i, 12)),
      description: `Notebook (${i}/5)`, installmentGroupId: "gx", installmentIndex: i, installmentTotal: 5,
    }));
  }
  const aheadIso = iso(new Date(Date.now() + 200 * 86400000));
  setData({
    ...run("defaultData()"), monthlyIncome: 6200, transactions,
    goals: [
      { id: "meta-1", name: "Viagem", target: 12000, current: 4800, savedUpfront: 0, deadline: aheadIso, icon: "plane", createdAt: monthsAgo(4), monthlyPlan: 500 },
      { id: "meta-2", name: "Reserva", target: 30000, current: 30000, savedUpfront: 0, deadline: "", icon: "piggy", createdAt: monthsAgo(6), monthlyPlan: 0 },
      { id: "meta-3", name: "Carro", target: 40000, current: 200, savedUpfront: 0, deadline: iso(new Date(Date.now() - 20 * 86400000)), icon: "target", createdAt: monthsAgo(5), monthlyPlan: 0 },
    ],
  });
  run(`state.data = { ...state.data, assets: [
    makeAsset({ class: "divida", name: "Financiamento", value: 88000, monthlyPayment: 740, dueDay: 18 }),
  ] };`);

  setTab("calendar");
  run("state.calendar = { monthOffset: 0, selectedDay: null, annualOpen: false };");
  const cal = run("renderCalendarScreen()");
  auditHtml("calendário", cal);
  check("grade do mês renderizada", cal.includes("cal-grid"));
  check("legenda de fato x previsão presente", cal.includes("cal-legend__swatch--planned"));
  check("cartão de previsão presente", cal.includes("forecast-value"));
  check("gráfico da projeção presente", cal.includes("forecast-chart-wrap"));
  check("premissas do cálculo listadas", cal.includes("forecast-list"));
  check("planejamento anual presente", cal.includes("annual-list"));
  check("os 7 cabeçalhos de dia da semana aparecem", (cal.match(/cal-weekday/g) || []).length === 7,
    (cal.match(/cal-weekday/g) || []).length);

  // Dia selecionado e ano expandido
  run("state.calendar.selectedDay = todayIso(); state.calendar.annualOpen = true;");
  const dia = run("renderCalendarScreen()");
  auditHtml("dia selecionado", dia);
  check("painel do dia renderizado", dia.includes("cal-day-total") || dia.includes("Dia livre"));
  check("ano inteiro expandido mostra 10 eventos", (dia.match(/annual-row /g) || []).length >= 10,
    (dia.match(/annual-row /g) || []).length);
  run("state.calendar.selectedDay = null; state.calendar.annualOpen = false;");

  // Todos os horizontes renderizam
  ["7d", "30d", "3m", "12m"].forEach((h) => {
    ctx.__h = h;
    run("state.forecastHorizon = __h;");
    let ok = true, err = null;
    try { run("renderCalendarScreen()"); } catch (e) { ok = false; err = e.message; }
    check(`horizonte ${h} renderiza`, ok, err);
  });
  run("state.forecastHorizon = '30d';");

  // Meses adjacentes
  [-2, -1, 1, 2].forEach((off) => {
    ctx.__o = off;
    run("state.calendar.monthOffset = __o;");
    let ok = true, err = null;
    try { run("renderCalendarScreen()"); } catch (e) { ok = false; err = e.message; }
    check(`mês ${off > 0 ? "+" : ""}${off} renderiza`, ok, err);
  });
  run("state.calendar.monthOffset = 0;");

  // Tela de metas
  setTab("goals");
  const metas = run("renderGoalsScreen()");
  auditHtml("metas", metas);
  check("os três aportes aparecem no cartão", (metas.match(/goal-number__label/g) || []).length >= 3,
    (metas.match(/goal-number__label/g) || []).length);
  check("estimativa de conclusão exibida", metas.includes("goal-eta"));
  check("status da meta exibido", metas.includes("goal-status"));
  check("viabilidade do plano presente", metas.includes("plan-meter"));
  check("meta atrasada é a primeira da lista",
    metas.indexOf("Carro") < metas.indexOf("Viagem"), "ordem incorreta");
  check("meta concluída aparece por último",
    metas.lastIndexOf("Reserva") > metas.indexOf("Viagem"));

  // Formulário de meta (criar e editar)
  run("state.goalForm = { ...freshGoalForm(), show: true };");
  const novo = run("renderGoalsScreen()");
  auditHtml("nova meta", novo);
  check("formulário oferece modelos de meta", novo.includes('data-action="goal-template"'));
  check("campo de aporte mensal presente", novo.includes('data-field="goal-monthly-plan"'));
  run("state.goalForm = freshGoalForm(); state.editingGoalId = null;");
}

console.log("\n4. Rota e navegação");
{
  setTab("health");
  check("renderScreen() roteia para a tela de saúde", run("renderScreen()").includes("card--health-hero"));
  setTab("dashboard");
  check("dashboard oferece o atalho para a tela", run("renderDashboardScreen()").includes('data-tab="health"'));
  setTab("settings");
  check("“Recursos” oferece o atalho para saúde", run("renderAllScreen()").includes('data-tab="health"'));
  check("“Recursos” oferece o atalho para patrimônio", run("renderAllScreen()").includes('data-tab="wealth"'));
  check("ajustes leva à tela “Recursos”", run("renderSettingsScreen()").includes('data-tab="all"'));
  setTab("wealth");
  check("renderScreen() roteia para patrimônio", run("renderScreen()").includes("Patrimônio"));
  setTab("dashboard");
  check("dashboard oferece o atalho para patrimônio", run("renderDashboardScreen()").includes('data-tab="wealth"'));
  setTab("calendar");
  check("renderScreen() roteia para o calendário", run("renderScreen()").includes("cal-grid"));
  setTab("settings");
  check("“Recursos” oferece o atalho para o calendário", run("renderAllScreen()").includes('data-tab="calendar"'));
  setTab("dashboard");
  check("dashboard oferece o atalho para o calendário", run("renderDashboardScreen()").includes('data-tab="calendar"'));
}

console.log("\n5. Fluxo de cadastro ponta a ponta (clique → estado → dados)");
{
  // Simula os eventos reais passando pelos handlers delegados do app, em vez de
  // chamar as funções internas: é assim que se descobre uma ação sem `case`.
  ctx.__click = (action, extra) => {
    const btn = { dataset: { action, ...(extra || {}) }, classList: { contains: () => false } };
    return { target: { closest: () => btn } };
  };
  ctx.__type = (field, value, id) => ({ target: { dataset: { field, id }, value } });
  const click = (action, extra) => { ctx.__e = ctx.__click(action, extra); run("onClick(__e)"); };
  const type = (field, value, id) => { ctx.__e = ctx.__type(field, value, id); run("onInput(__e)"); };

  run("state.data = { ...defaultData() }; state.tab = 'wealth'; state.wealth = { months: 12, form: null, updatingId: null, updateValue: '', confirmDeleteId: null };");

  click("wealth-new");
  check("clique abre o formulário", run("!!state.wealth.form"));

  click("wealth-set-class", { value: "imovel" });
  check("classe trocada para imóvel", run("state.wealth.form.class") === "imovel");
  type("wealth-name", "Apartamento");
  type("wealth-value", "420.000,00");
  type("wealth-note", "Financiado pela Caixa");
  click("wealth-save");
  check("item gravado", run("state.data.assets.length") === 1, run("state.data.assets.length"));
  check("valor interpretado no formato brasileiro", run("state.data.assets[0].value") === 420000, run("state.data.assets[0].value"));
  check("formulário fechado após salvar", run("state.wealth.form") === null);
  check("histórico inicia com um ponto", run("state.data.assets[0].history.length") === 1);

  // Validação: nome vazio não grava
  click("wealth-new");
  click("wealth-set-class", { value: "veiculo" });
  type("wealth-value", "50000");
  click("wealth-save");
  check("item sem nome é recusado", run("state.data.assets.length") === 1, run("state.data.assets.length"));
  click("wealth-cancel");

  // Dívida com parcela
  click("wealth-new");
  click("wealth-set-class", { value: "divida" });
  type("wealth-name", "Financiamento");
  type("wealth-value", "190000");
  type("wealth-payment", "2400");
  click("wealth-save");
  check("dívida gravada com kind correto", run("state.data.assets[1].kind") === "liability", run("state.data.assets[1].kind"));
  check("parcela mensal gravada", run("state.data.assets[1].monthlyPayment") === 2400, run("state.data.assets[1].monthlyPayment"));

  // Atualização de valor cria ponto no histórico do mês corrente
  const assetId = run("state.data.assets[0].id");
  click("wealth-update-open", { id: assetId });
  check("campo de atualização abre com o valor atual", run("state.wealth.updateValue") === "420000,00", run("state.wealth.updateValue"));
  type("wealth-update", "435000");
  click("wealth-update-save", { id: assetId });
  check("valor atualizado", run("state.data.assets[0].value") === 435000, run("state.data.assets[0].value"));
  check("mesmo mês não duplica ponto no histórico", run("state.data.assets[0].history.length") === 1, run("state.data.assets[0].history.length"));

  // Edição preserva histórico e id
  click("wealth-edit", { id: assetId });
  check("formulário carrega o item", run("state.wealth.form.name") === "Apartamento", run("state.wealth.form.name"));
  type("wealth-name", "Apartamento (quitado)");
  click("wealth-save");
  check("edição preserva o id", run("state.data.assets.some((a) => a.id === '" + assetId + "')"));
  check("edição preserva o nome novo", run("state.data.assets.find((a) => a.id === '" + assetId + "').name") === "Apartamento (quitado)");

  // Exclusão por popup
  click("wealth-delete", { id: assetId });
  check("primeiro clique só pede confirmação", run("state.data.assets.length") === 2 && run("!!state.confirmation"));
  run("closeOverlayState('confirmation'); state.overlayStack = [];");
  check("cancelar mantém o item", run("state.data.assets.length") === 2);
  click("wealth-delete", { id: assetId });
  run("state.confirmation.accepted = true; closeOverlayState('confirmation'); state.overlayStack = [];");
  check("confirmar exclui", run("state.data.assets.length") === 1, run("state.data.assets.length"));

  // Janela do gráfico e acordeão da Saúde Financeira pelo handler real
  click("wealth-months", { value: "24" });
  check("janela do gráfico muda por clique", run("state.wealth.months") === 24, run("state.wealth.months"));
  click("toggle-health-detail", { id: "liquidez" });
  check("acordeão de indicador abre por clique", run("state.healthDetailId") === "liquidez");
  click("toggle-health-detail", { id: "liquidez" });
  check("segundo clique fecha", run("state.healthDetailId") === null);
}

console.log("\n5b. Fluxo do Módulo 4 pelos handlers reais");
{
  const click = (action, extra) => { ctx.__e = ctx.__click(action, extra); run("onClick(__e)"); };
  const type = (field, value, id) => { ctx.__e = ctx.__type(field, value, id); run("onInput(__e)"); };

  run("state.data = { ...defaultData() }; state.tab = 'goals'; state.goalForm = freshGoalForm(); state.editingGoalId = null;");

  // Criar a partir de um modelo
  click("goal-template", { value: "viagem" });
  check("modelo abre o formulário preenchido", run("state.goalForm.show && state.goalForm.name === 'Viagem'"), run("state.goalForm.name"));
  check("modelo sugere um prazo", run("!!state.goalForm.deadline"));
  type("goal-target", "12.000,00");
  type("goal-saved-upfront", "1.200,00");
  type("goal-monthly-plan", "500");
  click("submit-goal");
  check("aporte inicial abre popup antes de gravar", run("!!state.confirmation") && run("state.data.goals.length") === 0);
  run("closeOverlayState('confirmation'); state.overlayStack = [];");
  check("cancelar o aporte inicial não cria a meta", run("state.data.goals.length") === 0 && run("state.data.transactions.length") === 0);
  click("submit-goal");
  run("state.confirmation.accepted = true; closeOverlayState('confirmation'); state.overlayStack = [];");
  check("meta criada", run("state.data.goals.length") === 1, run("state.data.goals.length"));
  check("valor alvo no formato brasileiro", run("state.data.goals[0].target") === 12000, run("state.data.goals[0].target"));
  check("valor inicial entra no progresso", run("state.data.goals[0].current") === 1200, run("state.data.goals[0].current"));
  check("valor inicial gera a contrapartida no caixa", run("state.data.transactions.length") === 1 && run("state.data.transactions[0].id").startsWith("goal-upfront:"));
  check("valor inicial não aumenta o patrimônio", run("netWorth(state.data).total") === 0, run("netWorth(state.data).total"));
  check("aporte mensal gravado", run("state.data.goals[0].monthlyPlan") === 500, run("state.data.goals[0].monthlyPlan"));
  check("formulário fechado após salvar", run("state.goalForm.show") === false);

  // Meta sem valor alvo é recusada
  click("toggle-goal-form");
  type("goal-name", "Sem alvo");
  click("submit-goal");
  check("meta sem valor alvo é recusada", run("state.data.goals.length") === 1, run("state.data.goals.length"));
  click("cancel-goal-form");
  check("cancelar limpa o rascunho", run("state.goalForm.name") === "" && run("state.goalForm.show") === false);

  // Editar
  const goalId = run("state.data.goals[0].id");
  click("edit-goal", { id: goalId });
  check("edição carrega a meta", run("state.editingGoalId") === goalId && run("state.goalForm.name") === "Viagem");
  check("valor guardado fica travado na edição", run("renderGoalsScreen()").includes("disabled"));
  type("goal-name", "Viagem — Chile");
  type("goal-monthly-plan", "650");
  click("submit-goal");
  check("edição preserva o id", run("state.data.goals.length") === 1 && run("state.data.goals[0].id") === goalId);
  check("nome atualizado", run("state.data.goals[0].name") === "Viagem — Chile", run("state.data.goals[0].name"));
  check("aporte mensal atualizado", run("state.data.goals[0].monthlyPlan") === 650, run("state.data.goals[0].monthlyPlan"));
  check("modo de edição encerrado", run("state.editingGoalId") === null);

  // Aporte real move a meta e gera lançamento
  click("expand-goal", { id: goalId, value: "aportar" });
  type("contribution-amount", "300");
  click("submit-goal-action", { id: goalId });
  check("aporte soma na meta", run("state.data.goals[0].current") === 1500, run("state.data.goals[0].current"));
  check("aporte virou lançamento com goalId", run(`state.data.transactions.filter((t) => t.goalId === '${goalId}').length`) === 2);

  // Calendário
  run("state.tab = 'calendar';");
  click("cal-next");
  check("avançar mês", run("state.calendar.monthOffset") === 1, run("state.calendar.monthOffset"));
  click("cal-prev"); click("cal-prev");
  check("voltar mês", run("state.calendar.monthOffset") === -1, run("state.calendar.monthOffset"));
  click("cal-next");
  ctx.__today = run("todayIso()");
  click("cal-day", { value: run("todayIso()") });
  check("selecionar dia abre o painel", run("state.calendar.selectedDay") === run("todayIso()"));
  click("cal-day", { value: run("todayIso()") });
  check("clicar de novo fecha", run("state.calendar.selectedDay") === null);
  click("cal-day", { value: run("todayIso()") });
  click("cal-close-day");
  check("botão de fechar limpa a seleção", run("state.calendar.selectedDay") === null);
  click("toggle-annual");
  check("planejamento anual expande", run("state.calendar.annualOpen") === true);
  click("set-forecast-horizon", { value: "12m" });
  check("horizonte da previsão muda por clique", run("state.forecastHorizon") === "12m", run("state.forecastHorizon"));
  run("state.forecastHorizon = '30d'; state.calendar = { monthOffset: 0, selectedDay: null, annualOpen: false };");

  // Dívida com dia de vencimento pelo formulário real de patrimônio
  run("state.tab = 'wealth'; state.wealth = { months: 12, form: null, updatingId: null, updateValue: '', confirmDeleteId: null };");
  click("wealth-new");
  click("wealth-set-class", { value: "divida" });
  type("wealth-name", "Financiamento");
  type("wealth-value", "88000");
  type("wealth-payment", "740");
  type("wealth-dueday", "18");
  click("wealth-save");
  check("dia de vencimento gravado", run("state.data.assets[0].dueDay") === 18, run("state.data.assets[0].dueDay"));
  click("wealth-edit", { id: run("state.data.assets[0].id") });
  check("edição recarrega o dia de vencimento", run("state.wealth.form.dueDay") === "18", run("state.wealth.form.dueDay"));
  click("wealth-set-class", { value: "imovel" });
  check("trocar para bem limpa o dia de vencimento", run("state.wealth.form.dueDay") === "");
  click("wealth-cancel");

  // Privacidade: cancelar deve encerrar antes de mudar estado ou chamar a rede.
  run("state.aiInsight = { loading: false, text: null, error: null, analise: null }; requestAiInsight();");
  check("cancelar análise por IA não inicia envio", run("state.aiInsight.loading") === false);
  run("closeOverlayState('confirmation'); state.overlayStack = [];");
  run("state.nlp = { text: 'mercado 30', drafts: [], error: null, loading: false, touched: true }; refineNaturalEntryWithAi();");
  check("cancelar refinamento por IA mantém o rascunho local", run("state.nlp.loading") === false && run("state.nlp.text") === "mercado 30");
  run("closeOverlayState('confirmation'); state.overlayStack = [];");
}

console.log("\n5c. Fluxo do Módulo 5 pelos handlers reais");
{
  const click = (action, extra) => { ctx.__e = ctx.__click(action, extra); run("onClick(__e)"); };
  const type = (field, value, id) => { ctx.__e = ctx.__type(field, value, id); run("onInput(__e)"); };
  const blur = (field, id) => {
    ctx.__e = { target: { dataset: id ? { field, id } : { field }, value: "" }, preventDefault() {} };
    run("onFocusOut(__e)");
  };

  run("state.data = { ...defaultData() }; state.tab = 'invest'; state.portfolio = { months: 12, form: null, expandedId: null, updatingId: null, updateValue: '', dividendId: null, dividendValue: '', confirmDeleteId: null };");

  // Cadastro de uma aplicação pela tela real
  click("pf-new");
  check("formulário de aplicação abre", run("!!state.portfolio.form"));
  click("pf-set-type", { value: "fii" });
  check("tipo é selecionado", run("state.portfolio.form.invType") === "fii");
  type("pf-name", "FII de tijolo");
  type("pf-value", "12.500,00");
  type("pf-invested", "10000");
  type("pf-dividends", "350");
  click("pf-save");
  check("aplicação cadastrada", run("state.data.assets.length") === 1, run("state.data.assets.length"));
  check("valor no formato brasileiro", run("state.data.assets[0].value") === 12500, run("state.data.assets[0].value"));
  check("custo gravado", run("state.data.assets[0].invested") === 10000);
  check("proventos gravados", run("state.data.assets[0].dividends") === 350);
  check("classe é investimento (mesma coleção do Módulo 3)", run("state.data.assets[0].class") === "investimento");
  check("formulário fecha após salvar", run("state.portfolio.form") === null);

  const invId = run("state.data.assets[0].id");

  // A carteira alimenta o patrimônio sem contagem dupla
  check("patrimônio enxerga a aplicação", run("registeredInvestments(state.data)") === 12500, run("registeredInvestments(state.data)"));

  // Detalhe, provento e atualização de valor
  click("pf-toggle", { id: invId });
  check("detalhe abre por clique", run("state.portfolio.expandedId") === invId);
  click("pf-dividend-open", { id: invId });
  type("pf-dividend", "150");
  click("pf-dividend-save", { id: invId });
  check("provento acumula", run("state.data.assets[0].dividends") === 500, run("state.data.assets[0].dividends"));
  check("provento não altera o patrimônio", run("registeredInvestments(state.data)") === 12500);
  click("pf-update-open", { id: invId });
  type("pf-update", "13.000");
  click("pf-update-save", { id: invId });
  check("valor de mercado atualizado", run("state.data.assets[0].value") === 13000, run("state.data.assets[0].value"));
  check("histórico ganhou ponto do mês", run("state.data.assets[0].history.length") >= 1);

  // Edição recarrega os campos novos
  click("pf-edit", { id: invId });
  check("edição recarrega o custo", run("state.portfolio.form.invested") === "10000,00", run("state.portfolio.form.invested"));
  check("edição recarrega o tipo", run("state.portfolio.form.invType") === "fii");
  click("pf-cancel");
  check("cancelar fecha o formulário", run("state.portfolio.form") === null);

  // Janela do gráfico
  click("pf-months", { value: "24" });
  check("janela do gráfico muda", run("state.portfolio.months") === 24);
  run("state.portfolio.months = 12;");

  // Exclusão por popup
  click("pf-delete", { id: invId });
  check("exclusão pede confirmação", run("!!state.confirmation"));
  run("closeOverlayState('confirmation'); state.overlayStack = [];");
  check("cancelar mantém a aplicação", run("state.data.assets.length") === 1);

  // Simuladores: todos renderizam e reagem aos campos
  run("state.tab = 'simulators'; state.sim = { id: 'juros', values: {} };");
  ["juros", "rendafixa", "emprestimo", "financiamento", "entrada-amortizacao", "cartao", "consorcio", "fgts", "aposentadoria"].forEach((simId) => {
    click("sim-select", { value: simId });
    check(`simulador "${simId}" selecionado`, run("state.sim.id") === simId);
    let out = "", err = null;
    try { out = run("renderSimulatorsScreen()"); } catch (e) { err = e.message; }
    check(`simulador "${simId}" renderiza`, !err && out.length > 500, err || `${out.length} chars`);
    auditHtml(`sim:${simId}`, out);
  });

  click("sim-select", { value: "entrada-amortizacao" });
  const comparaEntrada = run("renderSimulatorsScreen()");
  check("comparador responde com o menor custo estimado", comparaEntrada.includes("Menor custo estimado"));
  type("sim-field", "30", "entrada-amortizacao.taxatotal");
  check("taxa da proposta integral é editável", run("state.sim.values['entrada-amortizacao.taxatotal']") === "30");
  const taxaMaior = run("renderSimulatorsScreen()");
  check("mudar a proposta recalcula o veredito", taxaMaior !== comparaEntrada);
  click("sim-set", { id: "entrada-amortizacao.efeito", value: "payment" });
  check("usuário pode escolher reduzir parcela", run("state.sim.values['entrada-amortizacao.efeito']") === "payment");

  // Campos do simulador alteram o resultado
  click("sim-select", { value: "rendafixa" });
  type("sim-field", "50000", "rendafixa.principal");
  check("campo do simulador é gravado", run("state.sim.values['rendafixa.principal']") === "50000");
  const comCdb = run("renderSimulatorsScreen()");
  click("sim-set", { id: "rendafixa.produto", value: "lci" });
  check("produto isento é selecionado", run("state.sim.values['rendafixa.produto']") === "lci");
  const comLci = run("renderSimulatorsScreen()");
  check("trocar o produto muda o resultado", comCdb !== comLci);
  check("isento aparece no detalhamento", comLci.includes("isento"));

  // Premissas de mercado em Ajustes
  run("state.tab = 'settings'; state.ratesDraft = {};");
  type("market-rate", "12,5", "cdi");
  blur("market-rate", "cdi");
  check("premissa de CDI gravada", run("state.data.marketRates.cdi") === 12.5, run("state.data.marketRates.cdi"));
  check("data de revisão carimbada", run("state.data.marketRates.updatedAt") === run("todayIso()"));
  check("rascunho é limpo depois do blur", run("Object.keys(state.ratesDraft).length") === 0);
  click("rates-reset");
  check("restaurar volta ao padrão", run("state.data.marketRates.cdi") === 14.9, run("state.data.marketRates.cdi"));
  run("state.tab = 'invest';");
}

console.log("\n6. Telas antigas continuam renderizando (não-regressão)");
{
  const telas = {
    dashboard: "renderDashboardScreen()",
    add: "(state.form = freshTxForm(), renderAddScreen())",
    analytics: "renderAnalyticsScreen()",
    goals: "renderGoalsScreen()",
    settings: "renderSettingsScreen()",
    privacidade: "renderPrivacyScreen()",
    invest: "renderPortfolioScreen()",
    "juros compostos (legado)": "renderInvestScreen()",
    simuladores: "renderSimulatorsScreen()",
    simulate: "renderSimulateScreen()",
    subscriptions: "renderSubscriptionsScreen()",
    import: "renderImportScreen()",
    health: "renderHealthScreen()",
    wealth: "renderWealthScreen()",
    calendar: "renderCalendarScreen()",
    contas: "renderAccountsScreen()",
    dívidas: "renderDebtsScreen()",
    conquistas: "renderAchievementsScreen()",
    recursos: "renderAllScreen()",
    regras: "renderRulesScreen()",
    categorias: "renderCategoriesScreen()",
    "categorias/grupos": "(state.categoriesUi.view = 'groups', renderCategoriesScreen())",
    "categorias/tetos": "(state.categoriesUi.view = 'budgets', renderCategoriesScreen())",
    "categorias/editor": "(state.categoriesUi.view = 'tree', state.categoriesUi.editor = freshCategoryEditor({ id: 'mercado', name: 'Mercado', parentId: 'alimentacao', icon: 'cart', color: '#3C6E8F' }), renderCategoryEditorModal())",
    shell: "renderShell()",
  };
  Object.entries(telas).forEach(([nome, code]) => {
    let out = "", err = null;
    try { out = run(code); } catch (e) { err = e.message; }
    check(`tela "${nome}" renderiza`, !err && out.length > 200, err || `${out.length} chars`);
  });
  run("state.categoriesUi = { view: 'tree', search: '', collapsed: [], editor: null };");
}

/* ------------------------------------------- Privacidade: os dois estados do aceite */
// A tela cresceu para caber controlador, retenção, direitos e incidentes, e
// tem dois caminhos distintos: sem aceite nenhum e com aceite de versão
// anterior. O segundo só aparece quando o histórico existe, então precisa ser
// renderizado de propósito, senão nunca é exercitado.
console.log("\n6b. Tela de privacidade nos dois estados de aceite");
{
  const original = run("JSON.stringify(state.data.privacy)");
  run("state.data = { ...state.data, privacy: defaultPrivacy() };");
  const semAceite = run("renderPrivacyScreen()");
  auditHtml("privacidade sem aceite", semAceite);
  check("sem aceite, oferece o botão de aceitar", semAceite.includes('data-action="legal-accept"'));
  check("sem aceite, não inventa histórico", !semAceite.includes("Você já havia aceitado"));
  check("campo pendente aparece como não definido", semAceite.includes("Ainda não definido"));
  check("marcador do código não vaza para a tela", !semAceite.includes("definir antes da oferta"));

  run("state.data = { ...state.data, privacy: acceptLegalTexts({ termsVersion:'2026-08-12.2', privacyVersion:'2026-08-12.2', acceptedAt:'2026-08-12T10:00:00.000Z' }) };");
  const comAceite = run("renderPrivacyScreen()");
  auditHtml("privacidade com aceite renovado", comAceite);
  check("com aceite, o botão some", !comAceite.includes('data-action="legal-accept"'));
  check("com aceite, o anterior continua registrado", comAceite.includes("2026-08-12.2"));
  check("privacidade deixa escolher os campos do envio para IA", comAceite.includes('data-action-select="privacy-ai-field"'));
  run("state.data = { ...state.data, privacy: { ...normalizePrivacy(state.data.privacy), aiSharing:'blocked' } };");
  check("com IA bloqueada, os campos do envio somem", !run("renderPrivacyScreen()").includes('data-action-select="privacy-ai-field"'));
  ctx.__privacyOriginal = JSON.parse(original || "null");
  run("state.data = { ...state.data, privacy: __privacyOriginal || defaultPrivacy() };");
}

/* -------------------------------------------------- Prévia do envio para a IA */
// O cartão prometia que o usuário veria o pacote antes do envio, e o que
// aparecia era um parágrafo descrevendo o pacote. A tela agora mostra o JSON
// que sai e deixa tirar partes dele; o que este bloco protege é justamente a
// igualdade entre o que a prévia mostra e o que a ocultação faz.
console.log("\n6c. Prévia do envio para a IA");
{
  run("state.aiPreview = { monthKey: keyOfCurrentMonth(), hide: [], showJson: false };");
  const tudo = run("renderAiPreviewModal()");
  auditHtml("prévia sem ocultação", tudo);
  check("mostra os quatro campos ocultáveis", (tudo.match(/data-action-select="ai-preview-field"/g) || []).length === 4);
  check("traz o botão de enviar", tudo.includes('data-action="ai-preview-send"'));
  check("traz o botão de cancelar", tudo.includes('data-action="ai-preview-cancel"'));
  check("mostra o pacote inteiro", tudo.includes("<pre><code>"));
  check("não anuncia chave interna como campo enviado", !tudo.includes("_rendaLancada"));
  // O JSON sai escapado dentro do <pre>. Comparar o HTML inteiro pegaria o
  // `data-value="metas"` da caixa de seleção e daria falso positivo, então a
  // conferência é feita só no pacote exibido.
  const pacoteDe = (html) => ((html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/) || [])[1] || "").replace(/&quot;/g, '"');
  check("o pacote sem ocultação leva as metas", /"metas"/.test(pacoteDe(tudo)));
  check("o pacote sem ocultação leva o histórico", /"historico"/.test(pacoteDe(tudo)));

  run("state.aiPreview = { ...state.aiPreview, hide: ['metas', 'historico'] };");
  const oculto = run("renderAiPreviewModal()");
  auditHtml("prévia com ocultação", oculto);
  // A prova de que a caixa faz o que diz: o campo some do pacote exibido.
  check("ocultar metas remove o campo do pacote exibido", !/"metas"/.test(pacoteDe(oculto)));
  check("ocultar histórico remove o campo do pacote exibido", !/"historico"/.test(pacoteDe(oculto)));
  check("o pacote exibido encolhe ao ocultar", pacoteDe(oculto).length < pacoteDe(tudo).length, `${pacoteDe(oculto).length} vs ${pacoteDe(tudo).length}`);

  // Ocultar categorias não apaga o campo: ele vai com nome trocado. Precisa de
  // um gasto no mês corrente, senão a lista sai vazia e a troca não aparece.
  const dadosAnteriores = run("state.data");
  run("state.data = migrate({ version:21, monthlyIncome:5000, transactions:[{ id:'aip1', type:'expense', amount:120, date:todayIso(), categoryId:'alimentacao', description:'Mercado' }] });");
  run("state.aiPreview = { monthKey: keyOfCurrentMonth(), hide: [], showJson: false };");
  const comNome = pacoteDe(run("renderAiPreviewModal()"));
  run("state.aiPreview = { ...state.aiPreview, hide: ['categorias'] };");
  const semNome = pacoteDe(run("renderAiPreviewModal()"));
  check("sem ocultação, o nome real da categoria vai no pacote", /"Alimentação"/.test(comNome), comNome.slice(0, 120));
  check("ocultar categorias troca o nome, não apaga o campo",
    /"Categoria 1"/.test(semNome) && !/"Alimentação"/.test(semNome) && /"categorias"/.test(semNome));
  ctx.__aiDadosAnteriores = dadosAnteriores;
  run("state.data = __aiDadosAnteriores;");
  run("state.aiPreview = { monthKey: keyOfCurrentMonth(), hide: ['metas', 'historico'], showJson: false };");
  check("as caixas ocultadas aparecem desmarcadas", (oculto.match(/data-action-select="ai-preview-field" data-value="[a-z]+" checked/g) || []).length === 2);

  run("state.aiPreview = { monthKey: null, hide: [], showJson: false };");
  check("sem prévia aberta, a tela não renderiza", run("renderAiPreviewModal()") === "");
}

/* ------------------------------------------------- Módulo 6: gamificação e a11y */
console.log("\n7. Módulo 6 — gamificação, esqueleto e acessibilidade");
{
  setData(ctx.__cheio || ctx.__d);
  run("state.data = { ...state.data, achievements: { ...state.data.achievements, enabled: true, initialized: true } };");
  setTab("achievements");
  const tela = run("renderAchievementsScreen()");
  check("a tela de conquistas mostra o nível", tela.includes("level-ring"));
  check("mostra a barra de XP", tela.includes("level-bar__fill"));
  check("lista medalhas", tela.includes("ach-badge"));
  check("oferece os filtros", tela.includes('data-action="ach-filter"'));
  check("sem lixo de template", !/undefined|NaN|\[object Object\]/.test(tela));

  const dash = (setTab("dashboard"), run("renderDashboardScreen()"));
  check("dashboard tem o cartão de nível", dash.includes("card--level"));
  check("cartão de nível leva para as conquistas", dash.includes('data-tab="achievements"'));
  check("“Recursos” oferece o atalho para conquistas",
    run("renderAllScreen()").includes('data-tab="achievements"'));

  const esqueleto = run("renderDashboardSkeleton()");
  check("esqueleto marca aria-busy", esqueleto.includes('aria-busy="true"'));
  check("esqueleto tem a mesma grade do dashboard", esqueleto.includes("grid-dashboard"));

  const shell = run("renderShell()");
  check("shell tem link de pular para o conteúdo", shell.includes("skip-link"));
  check("shell tem região de anúncio para leitor de tela", shell.includes('aria-live="polite"'));
  check("navegação inferior é rotulada", shell.includes('aria-label="Navegação principal"'));
  check("aba ativa marca aria-current", shell.includes('aria-current="page"'));

  const celebra = run("(state.gamification.celebrating = buildAchievementsModel(state.data, new Date()).items.slice(0,1), renderCelebrationOverlay())");
  check("celebração é um diálogo modal", celebra.includes('role="dialog"') && celebra.includes('aria-modal="true"'));
  check("celebração oferece saída", celebra.includes('data-action="dismiss-celebration"'));
  run("state.gamification.celebrating = [];");

  const filtrado = (run("state.gamification.filter = 'unlocked';"), run("renderAchievementsScreen()"));
  check("filtro de conquistadas não quebra a tela", filtrado.length > 200 && !/undefined/.test(filtrado));
  run("state.gamification.filter = 'all';");
}

/* ================================================================= [M7] */
console.log("\n[M7] Central inteligente, assinaturas e recorrências");
{
  const kOf = (n) => { ctx.__n = n; return run("keyOfDate(addMonths(new Date(), __n))"); };
  const dayIn = (key, day) => {
    const [y, m] = key.split("-").map(Number);
    ctx.__y = y; ctx.__m = m - 1;
    const last = run("daysInMonthOf(__y, __m)");
    return `${key}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };

  const transactions = [];
  for (let i = 5; i >= 0; i--) {
    const key = kOf(-i);
    transactions.push(tx({ type: "income", amount: 7000, categoryId: "salario", date: dayIn(key, 5) }));
    transactions.push(tx({ type: "expense", amount: 1800, categoryId: "moradia", date: dayIn(key, 8), recurring: true, description: "Aluguel" }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 1500 : 700, categoryId: "mercado", date: dayIn(key, 12), payment: "Crédito" }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 900 : 300, categoryId: "lazer", date: dayIn(key, 18), payment: "Crédito" }));
    transactions.push(tx({ type: "expense", amount: i === 0 ? 69.9 : 55.9, categoryId: "assinaturas", date: dayIn(key, 15), description: "Netflix" }));
    transactions.push(tx({ type: "expense", amount: 99.9, categoryId: "assinaturas", date: dayIn(key, 10), description: "Internet" }));
    transactions.push(tx({ type: "expense", amount: 18, categoryId: "alimentacao", date: dayIn(key, 4), description: "Cafe" }));
    transactions.push(tx({ type: "expense", amount: 22, categoryId: "alimentacao", date: dayIn(key, 6), description: "Cafe" }));
  }
  ctx.__p = { monthlyIncome: 7000, transactions };
  const richData = run("migrate(__p)");
  setData(richData);

  // ---- Assinaturas: as três abas ----
  setTab("subscriptions");
  ["assinaturas", "variaveis", "ignoradas"].forEach((v) => {
    ctx.__v = v;
    run("state.subs.view = __v; state.subs.expandedKey = null;");
    auditHtml(`assinaturas/${v}`, run("renderSubscriptionsScreen()"));
  });

  // ---- Item com o detalhe aberto ----
  const key0 = run("(recurringModel(keyOfCurrentMonth()).subscriptions[0] || {}).key || ''");
  check("M7: alguma assinatura foi detectada", typeof key0 === "string" && key0.length > 0, key0);
  ctx.__k = key0;
  run("state.subs.view = 'assinaturas'; state.subs.expandedKey = __k;");
  const subOpen = run("renderSubscriptionsScreen()");
  auditHtml("assinaturas/detalhe aberto", subOpen);
  check("M7: o número grande é o custo anual", /por ano/.test(subOpen));
  check("M7: oferece parar de acompanhar", /data-action="sub-ignore"/.test(subOpen));

  // ---- Central inteligente: as três visões ----
  setTab("insights");
  ["ia", "padroes", "comparar"].forEach((v) => {
    ctx.__v = v;
    run("state.insights.view = __v; state.insights.detailId = null; state.insights.heatDay = null; state.insights.monthOffset = 0;");
    auditHtml(`insights/${v}`, run("renderInsightsScreen()"));
  });

  // ---- Detalhe do plano e dia do mapa de calor ----
  run("state.insights.view = 'ia'; state.insights.detailId = 'potencial-economia';");
  auditHtml("insights/plano aberto", run("renderInsightsScreen()"));

  const someDay = run("analyticsModel(insightsMonthKey()).heatmap.days[3].iso");
  ctx.__d2 = someDay;
  run("state.insights.view = 'padroes'; state.insights.detailId = null; state.insights.heatDay = __d2;");
  const heat = run("renderInsightsScreen()");
  auditHtml("insights/dia selecionado", heat);
  check("M7: mapa de calor desenha as células do mês", (heat.match(/class="heat-cell/g) || []).length > 20);
  check("M7: célula selecionada é marcada", /is-selected/.test(heat));

  // ---- Mês anterior ----
  run("state.insights.monthOffset = -1; state.insights.heatDay = null;");
  auditHtml("insights/mês anterior", run("renderInsightsScreen()"));
  run("state.insights.monthOffset = 0;");

  // ---- Dashboard ----
  setTab("dashboard");
  const dash = run("renderDashboardScreen()");
  auditHtml("dashboard com M7", dash);
  check("M7: cartão da central aparece no dashboard", /Central inteligente/.test(dash));
  check("M7: cartão de assinaturas cita o custo anual", /por ano em assinaturas/.test(dash));

  // ---- Base vazia não quebra nenhuma tela nova ----
  setData(run("defaultData()"));
  setTab("insights");
  run("state.insights.view = 'ia'; state.insights.monthOffset = 0; state.insights.heatDay = null;");
  auditHtml("insights/base vazia", run("renderInsightsScreen()"));
  setTab("subscriptions");
  run("state.subs.view = 'assinaturas'; state.subs.expandedKey = null;");
  auditHtml("assinaturas/base vazia", run("renderSubscriptionsScreen()"));

  // ---- Toda ação nova precisa de um `case` no switch ----
  const onClickSrc = run("onClick.toString()");
  [
    "ins-view", "ins-prev", "ins-next", "ins-detail", "heat-day", "heat-clear",
    "subs-view", "sub-expand", "sub-ignore", "sub-track", "rec-confirm", "sub-unflag", "rec-dismiss",
  ].forEach((a) => {
    check(`M7: ação "${a}" tem case no onClick`, onClickSrc.includes(`case "${a}"`));
  });

  // ---- Ajustes lista a central ----
  setData(richData);
  setTab("settings");
  const settings = run("renderSettingsScreen()");
  auditHtml("ajustes com M7", settings);
  check("M7: “Recursos” leva à central inteligente", /data-tab="insights"/.test(run("renderAllScreen()")));
}

console.log("\n[M8] Central de notificações, sino e serviços");
{
  // ---- Sem nenhum aviso ----
  setData(run("defaultData()"));
  setTab("notifications");
  run("state.notif.filter = 'all'; state.notif.settingsOpen = false;");
  const vazio = run("renderNotificationsScreen()");
  auditHtml("notificações/vazio", vazio);
  check("M8: tela vazia explica o que vai aparecer ali", /Nenhum aviso ainda/.test(vazio));
  check("M8: sino sem badge quando não há não lidas", !/notif-bell__badge/.test(run("renderNotificationBell()")));

  // ---- Com avisos de vários tons ----
  const hoje = run("todayIso()");
  ctx.__n = {
    items: [
      { id: "1", key: "k1", group: "contas", tone: "danger", title: "Conta em atraso", message: "Aluguel venceu.", tab: "calendar", amount: 2600, createdAt: hoje, readAt: null },
      { id: "2", key: "k2", group: "orcamento", tone: "warn", title: "Mercado deve estourar", message: "No ritmo atual o mês fecha acima do teto.", tab: "settings", amount: 900, createdAt: hoje, readAt: null },
      { id: "3", key: "k3", group: "metas", tone: "positive", title: "Meta concluída", message: "Você chegou lá.", tab: "goals", amount: 5000, createdAt: "2000-01-01", readAt: hoje },
    ],
    muted: { assinaturas: hoje },
    lastSyncAt: hoje,
    initialized: true,
  };
  setData(run("migrate({ ...defaultData(), notifications: __n })"));
  setTab("notifications");
  const cheio = run("renderNotificationsScreen()");
  auditHtml("notificações/com avisos", cheio);
  check("M8: aviso urgente recebe a classe de tom", /notif-item--danger/.test(cheio));
  check("M8: aviso já lido é marcado como lido", /is-read/.test(cheio));
  check("M8: cada aviso oferece 'Ver'", (cheio.match(/data-action="notif-open"/g) || []).length === 3);
  check("M8: só o não lido oferece 'marcar como lida'", (cheio.match(/data-action="notif-read"/g) || []).length === 2);
  check("M8: oferece marcar todas como lidas", /data-action="notif-read-all"/.test(cheio));
  check("M8: oferece limpar as lidas", /data-action="notif-clear"/.test(cheio));

  const sino = run("renderNotificationBell()");
  check("M8: sino mostra o número de não lidas", /notif-bell__badge">2</.test(sino));
  check("M8: sino sinaliza urgência", /notif-bell--urgent/.test(sino));

  // ---- Filtros e painel de silêncio ----
  run("state.notif.filter = 'unread';");
  const naoLidas = run("renderNotificationsScreen()");
  auditHtml("notificações/não lidas", naoLidas);
  check("M8: filtro de não lidas esconde o aviso lido", !/Meta concluída/.test(naoLidas));

  run("state.notif.filter = 'all'; state.notif.settingsOpen = true;");
  const ajustes = run("renderNotificationsScreen()");
  auditHtml("notificações/silenciar grupos", ajustes);
  check("M8: painel lista todos os grupos", (ajustes.match(/data-action="notif-mute"/g) || []).length === run("NOTIF_GROUPS.length"));
  const rowSilenciada = ajustes.slice(ajustes.indexOf('data-id="assinaturas"')).slice(0, 800);
  check("M8: grupo silenciado aparece com o interruptor desligado",
    /class="switch "/.test(rowSilenciada) && !/class="switch active"/.test(rowSilenciada.slice(0, rowSilenciada.indexOf("</button>"))));

  // ---- Dashboard e Ajustes ----
  setTab("dashboard");
  const dash = run("renderDashboardScreen()");
  auditHtml("dashboard com M8", dash);
  check("M8: sino aparece no cabeçalho do dashboard", /data-tab="notifications"/.test(dash));
  setTab("settings");
  check("M8: “Recursos” leva à central de notificações", /data-tab="notifications"/.test(run("renderAllScreen()")));

  // ---- Toda ação nova precisa de um `case` no switch ----
  const onClickSrc = run("onClick.toString()");
  ["notif-filter", "notif-settings", "notif-read", "notif-read-all", "notif-remove", "notif-clear", "notif-mute", "notif-open"]
    .forEach((a) => check(`M8: ação "${a}" tem case no onClick`, onClickSrc.includes(`case "${a}"`)));

  // ---- Foco preservado: nenhum campo delegado pode ficar sem âncora ----
  // O bug era este: `render()` reconstrói o DOM e só reencontrava o campo pelo
  // `id`. Sem id (e sem o plano B do data-field), o input perdia o foco na
  // primeira tecla e o cursor voltava ao início.
  const appSrc = uiSrc();
  const inputsSemAncora = (appSrc.match(/<input[^>]*>/g) || [])
    .filter((tag) => /data-field=/.test(tag))
    .filter((tag) => !/ id="/.test(tag));
  check("BUGFIX: todo input delegado tem id", inputsSemAncora.length === 0, inputsSemAncora.join(" | "));
  check("BUGFIX: render() tem plano B por data-field", /focusKeyOf/.test(appSrc) && /restoreFocus/.test(appSrc));

  const simCards = run("renderCompoundSimCards()");
  auditHtml("juros compostos (campos do bug)", simCards);
  check("BUGFIX: campo 'valor inicial' tem id", /id="invest-inicial-input"/.test(simCards));
  run("state.whatIf.open = true; state.whatIf.mode = 'financiamento';");
  const whatIf = run("renderWhatIfCard()");
  check("BUGFIX: campos do What-If têm id",
    /id="whatif-valorbem-input"/.test(whatIf) && /id="whatif-entrada-input"/.test(whatIf));
}

console.log("\n[Categorias] Central de categorias: estrutura, grupos e tetos");
{
  setData(ctx.__cheio || ctx.__d);
  setTab("categories");
  run("state.categoriesUi = { view: 'tree', search: '', collapsed: [], editor: null };");

  const arvore = run("renderCategoriesScreen()");
  auditHtml("categorias/estrutura", arvore);
  check("a estrutura aninha a subcategoria dentro da mãe", /cat-node__children/.test(arvore) && /cat-child\b/.test(arvore));
  check("qualquer categoria abre o editor", /data-action="cat-editor-open"/.test(arvore));
  check("a mãe oferece criar subcategoria dentro dela", /data-action="cat-editor-open" data-parent=/.test(arvore));
  check("as três lentes estão disponíveis", (arvore.match(/data-action="cat-view"/g) || []).length === 3);

  run("state.categoriesUi.view = 'groups';");
  const grupos = run("renderCategoriesScreen()");
  auditHtml("categorias/grupos", grupos);
  check("grupos mostram um cartão por grupo da Regra x/x/x",
    (grupos.match(/cat-group-card cat-group-card--/g) || []).length === run("BUDGET_GROUPS.length"));

  run("state.categoriesUi.view = 'budgets';");
  const tetos = run("renderCategoriesScreen()");
  auditHtml("categorias/tetos", tetos);
  check("cada teto tem campo com id (o foco sobrevive ao render)", /id="cat-budget-input-moradia"/.test(tetos));

  run("state.categoriesUi.view = 'tree'; state.categoriesUi.search = 'merc';");
  const busca = run("renderCategoriesScreen()");
  check("a busca encontra a subcategoria pelo nome", /Mercado/.test(busca));
  check("a busca descarta o que não casa", !/Assinaturas/.test(busca));
  run("state.categoriesUi.search = 'zzzz';");
  check("busca sem resultado explica o que fazer", /Nenhuma categoria com esse nome/.test(run("renderCategoriesScreen()")));
  run("state.categoriesUi.search = '';");

  run("state.categoriesUi.editor = freshCategoryEditor({});");
  const novo = run("renderCategoryEditorModal()");
  auditHtml("categorias/editor novo", novo);
  check("o editor novo cria", /data-action="cat-editor-save"/.test(novo) && /Criar categoria/.test(novo));
  check("o editor novo não oferece excluir", !/data-action="cat-editor-delete"/.test(novo));
  check("o editor decide onde a categoria fica", /data-action="cat-editor-set-parent"/.test(novo));

  run("state.categoriesUi.editor = freshCategoryEditor({ id: 'mercado', name: 'Mercado', parentId: 'alimentacao', icon: 'cart', color: '#3C6E8F' });");
  const edicao = run("renderCategoryEditorModal()");
  auditHtml("categorias/editor edição", edicao);
  check("editar uma subcategoria mostra de quem ela depende", /Subcategoria de Alimenta/.test(edicao));
  check("editar oferece excluir", /data-action="cat-editor-delete"/.test(edicao));

  run("state.categoriesUi.editor.confirmDelete = true;");
  const exclusao = run("renderCategoryEditorModal()");
  check("a exclusão confirma dentro da própria folha", /data-action="cat-editor-delete-confirm"/.test(exclusao));
  check("a exclusão avisa que o lançamento vai para Outros", /Outros/.test(exclusao));

  run("state.categoriesUi.editor = freshCategoryEditor({ id: 'alimentacao', name: 'Alimentação', parentId: '' });");
  check("categoria com subcategorias não pode virar subcategoria", !/data-value="moradia"/.test(run("renderCategoryEditorModal()")));
  run("state.categoriesUi.editor = null;");

  setTab("settings");
  const ajustesCat = run("renderSettingsScreen()");
  auditHtml("ajustes sem o editor de categorias", ajustesCat);
  check("Ajustes entrega a central de categorias", /data-tab="categories"/.test(ajustesCat));
  check("Ajustes não edita mais categoria",
    !/data-field="category-name"/.test(ajustesCat) && !/data-action="add-category"/.test(ajustesCat));

  const catClickSrc = run("onClick.toString()");
  ["cat-view", "cat-search-clear", "cat-toggle", "cat-editor-open", "cat-editor-close", "cat-editor-save",
    "cat-editor-set-parent", "cat-editor-set-group", "cat-editor-set-icon", "cat-editor-set-color",
    "cat-editor-suggest", "cat-editor-delete", "cat-editor-delete-cancel", "cat-editor-delete-confirm"]
    .forEach((a) => check(`ação "${a}" tem case no onClick`, catClickSrc.includes(`case "${a}"`)));

  setTab("dashboard");
}

console.log("\n[Conta] Extrato de acessos e área destrutiva");
{
  ctx.__devices = [
    { id: "device-desktop", label: "Chrome no Windows", type: "desktop", current: true, lastSeenAt: new Date().toISOString() },
    { id: "device-phone", label: "Safari no iPhone", type: "phone", current: false, lastSeenAt: "2026-08-24T20:55:00Z" },
    { id: "device-tablet", label: "Safari no iPad", type: "tablet", current: false, lastSeenAt: "2026-08-24T17:16:00Z" },
    { id: "device-unknown", label: "Navegador desconhecido", type: "unknown", current: false, lastSeenAt: "2026-08-24T16:39:00Z" },
    { id: "device-revoked", label: "Acesso antigo", type: "phone", current: false, revokedAt: "2026-08-24T21:00:00Z", lastSeenAt: "2026-08-24T15:00:00Z" },
  ];
  run(`state.account = freshAccountState();
    state.account.loading = false;
    state.account.configured = true;
    state.account.authenticated = true;
    state.account.email = "pessoa@example.com";
    state.account.devices = __devices;
    Object.assign(CloudSync.status(), { enabled: true, phase: "synced", pending: false, error: null, errorCode: null });`);

  const conta = run("renderAccountScreen()");
  auditHtml("conta/dispositivos", conta);
  check("a seção se apresenta como dispositivos com acesso", /Dispositivos com acesso/.test(conta));
  check("a lista mostra a contagem de acessos ativos", /4 ativos/.test(conta));
  check("o aparelho atual recebe selo próprio", /Este aparelho/.test(conta));
  check("o aparelho revogado não aparece como conectado", !/Acesso antigo/.test(conta));
  check("computador recebe ícone próprio", /account-device--desktop/.test(conta));
  check("celular recebe ícone próprio", /account-device--phone/.test(conta));
  check("tablet recebe ícone próprio", /account-device--tablet/.test(conta));
  check("tipo desconhecido recebe tratamento próprio", /account-device--unknown/.test(conta));
  check("somente os outros aparelhos podem ser revogados",
    (conta.match(/data-action="account-revoke"/g) || []).length === 3,
    String((conta.match(/data-action="account-revoke"/g) || []).length));
  check("a ação destrutiva diz exatamente o que faz", /Revogar acesso/.test(conta));
  const accountClickSrc = run("onClick.toString()");
  check("a confirmação explica o limite da revogação",
    /não poderá mais acessar nem sincronizar/.test(accountClickSrc)
      && /cópia já salva nele não será apagada à distância/.test(accountClickSrc));
  check("a exclusão descreve servidor, aparelho atual e outros aparelhos",
    /dados guardados no servidor e neste aparelho serão apagados/.test(accountClickSrc)
      && /outros aparelhos não serão apagadas à distância/.test(accountClickSrc));
  check("a exclusão distingue servidor confirmado da preparação local",
    /resetResult\s*=\s*await CloudSync\.resetRemote\(\)/.test(accountClickSrc)
      && /!resetResult\.remoteDeleted/.test(accountClickSrc)
      && /!resetResult\.localPrepared/.test(accountClickSrc)
      && /typeof resetResult\.ok\s*!==\s*"boolean"/.test(accountClickSrc));
  check("falha local depois da confirmação remota ainda tenta apagar a cópia",
    /await apagarLocal\(/.test(accountClickSrc)
      && /Os dados foram apagados da conta, mas o navegador não permitiu apagar a cópia deste aparelho/.test(accountClickSrc));
  check("a exclusão captura o escopo e a geração antes da confirmação",
    /expectedScope\s*=\s*FinanceStore\.scope\(\)/.test(accountClickSrc)
      && /expectedGeneration\s*=\s*FinanceStore\.generation\(\)/.test(accountClickSrc)
      && /FinanceStore\.scope\(\)\s*!==\s*expectedScope/.test(accountClickSrc)
      && /FinanceStore\.generation\(\)\s*!==\s*expectedGeneration/.test(accountClickSrc));
  check("resultado remoto desconhecido não promete que nada foi apagado",
    /Não foi possível confirmar a exclusão na conta/.test(accountClickSrc)
      && /A cópia deste aparelho não foi apagada/.test(accountClickSrc)
      && !/Nada foi apagado/.test(accountClickSrc));
  check("atualização da lista tem texto visível", /data-action="account-refresh"[^>]*>[\s\S]*Atualizar/.test(conta));
  check("estado saudável não oferece sincronização manual", !/data-action="account-sync-now"/.test(conta));
  // O painel começa recolhido, e o recolhido/aberto mora no ESTADO, não num
  // `<details>` nativo: `render()` refaz o DOM inteiro, e o painel se fechava
  // sozinho no meio da digitação da senha, o que fazia a exclusão parecer
  // quebrada. Ver `accountDangerCard` em js/screens/account.js.
  check("a exclusão da conta começa recolhida",
    /<section[^>]*account-danger/.test(conta)
      && /data-action="account-danger-toggle"/.test(conta)
      && /aria-expanded="false"/.test(conta)
      && /account-danger__body[^>]*hidden/.test(conta));
  check("a exclusão da conta não usa <details>, que não sobrevive ao render",
    !/<details[^>]*account-danger/.test(conta));
  check("a área destrutiva não promete preservar a cópia que será apagada",
    /Apagar conta e dados/.test(conta)
      && /A cópia deste aparelho também será apagada/.test(conta)
      && !/dados locais ficam neste aparelho/.test(conta));

  run(`Object.assign(CloudSync.status(), { enabled: false, phase: "error", pending: true, error: "Falha simulada", errorCode: "network_error" });`);
  const contaComFalha = run("renderAccountScreen()");
  check("falha oferece tentativa imediata", /data-action="account-sync-now"/.test(contaComFalha) && /Tentar novamente/.test(contaComFalha));

  const accountCss = readSrc("css/screens/account.css");
  check("ações móveis mantêm alvo de toque", /min-height:\s*44px/.test(accountCss));
  check("o extrato tem linha de atividade própria", /account-device__rail/.test(accountCss));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
