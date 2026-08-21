// test-router.js — endereço de tela, pilha de camadas e lápides de exclusão.
//
// Roda dois blocos:
//   A) `js/router.js` puro, com um History API falso, para conferir a gramática
//      do endereço e a aritmética da profundidade.
//   B) núcleo e ações num contexto de VM com `history` e `location.hash`
//      reais o bastante, disparando os handlers de verdade (`onClick`,
//      `popstate`) — é assim que se descobre uma navegação que escapou do
//      histórico antes do usuário descobrir com o botão voltar.
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
  "js/screens/modals.js",
];
// Varreduras de código-fonte precisam ver o app INTEIRO, não só o núcleo.
const uiSrc = () => ["js/app.js", "js/actions.js"].concat(SCREEN_FILES).map(readSrc).join("\n");

let ok = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { ok++; console.log("  \u2713 " + label); }
  else { fail++; console.log("  \u2717 " + label + (extra !== undefined ? "  \u2192 " + JSON.stringify(extra) : "")); }
}
function section(t) { console.log("\n" + t); }

/* ============================================================ History falso */
// Pilha de verdade: `pushState` empilha, `go(-1)` desempilha e dispara popstate.
// Sem isso o teste checaria apenas que as funções foram chamadas, não que a
// sequência resultante é a que o usuário percebe.
function makeHistory(win) {
  const stack = [{ state: null, url: "" }];
  let idx = 0;
  return {
    get state() { return stack[idx].state; },
    get length() { return stack.length; },
    get __index() { return idx; },
    get __stack() { return stack; },
    pushState(state, _title, url) {
      stack.length = idx + 1;
      stack.push({ state, url: url || "" });
      idx = stack.length - 1;
      win.location.hash = String(url || "");
    },
    replaceState(state, _title, url) {
      stack[idx] = { state, url: url || "" };
      win.location.hash = String(url || "");
    },
    go(delta) {
      const target = Math.min(stack.length - 1, Math.max(0, idx + delta));
      if (target === idx) return;
      idx = target;
      win.location.hash = String(stack[idx].url || "");
      win.__firePopstate(stack[idx].state);
    },
    back() { this.go(-1); },
  };
}

/* ============================================================ Bloco A — puro */
section("1. Gramática do endereço (js/router.js isolado)");
{
  const ctx = { console, module: { exports: {} }, window: undefined };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readSrc("js/router.js"), ctx, { filename: "router.js" });
  const { Router } = ctx.module.exports;

  check("slug em português resolve a rota", Router.parse("#/saude") === "health");
  check("id interno também resolve", Router.parse("#/health") === "health");
  check("barra sobrando não atrapalha", Router.parse("#//patrimonio") === "wealth");
  check("caixa alta é aceita", Router.parse("#/METAS") === "goals");
  check("query depois do slug é ignorada", Router.parse("#/contas?x=1") === "accounts");
  check("rota inexistente devolve null", Router.parse("#/naoexiste") === null);
  check("hash vazio devolve null", Router.parse("") === null);
  check("hash do dashboard é o padrão", Router.hashFor("dashboard") === "#/inicio");
  check("Recursos preserva o endereço existente",
    Router.hashFor("all") === "#/tudo" && Router.parse("#/tudo") === "all");
  check("rota inválida cai no padrão ao gerar hash", Router.hashFor("zzz") === "#/inicio");

  const tabs = Router.TABS;
  const slugs = tabs.map((t) => Router.slugFor(t));
  check("toda rota tem slug próprio", new Set(slugs).size === tabs.length, slugs.length - new Set(slugs).size);
  check("ida e volta é estável", tabs.every((t) => Router.parse(Router.hashFor(t)) === t));

  // O `switch` de telas do app é a lista real de rotas: uma tela que exista lá
  // e não aqui seria inalcançável por endereço.
  const appSrc = uiSrc();
  const inSwitch = (appSrc.match(/case "([a-z]+)": return render[A-Za-z]+Screen\(\)/g) || [])
    .map((m) => m.match(/case "([a-z]+)"/)[1]);
  const faltando = inSwitch.filter((t) => !Router.isTab(t));
  check("toda tela do switch tem rota", faltando.length === 0, faltando);

  check("camada desconhecida é descartada da pilha", Router.overlaysOf({ ov: ["qr", "hackeado"] }).join() === "qr");
  check("pilha não numérica vira vazia", Router.overlaysOf({ ov: "qr" }).length === 0);
  check("profundidade negativa é normalizada", Router.stateFor("goals", [], -5).d === 0);
}

/* ============================================================ Bloco B — app */
section("2. Navegação real (js/app.js num contexto de VM)");

function fakeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(), innerHTML: "", value: "", disabled: false,
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    // O cartão "resumo do mês" desenha em canvas dentro do afterRender.
    width: 0, height: 0, toDataURL() { return "data:,"; }, toBlob(cb) { cb(null); },
    getContext() {
      const noop = () => {};
      return new Proxy({ canvas: el, measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }), getImageData: () => ({ data: [] }) },
        { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
    },
  };
  return el;
}

const documentStub = {
  documentElement: fakeEl("html"),
  body: fakeEl("body"),
  getElementById() { return fakeEl(); },
  querySelector() { return fakeEl(); },
  querySelectorAll() { return []; },
  createElement(t) { return fakeEl(t); },
  addEventListener() {}, removeEventListener() {},
  activeElement: null, visibilityState: "visible",
};

const ctx = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: documentStub,
  navigator: { userAgent: "node", language: "pt-BR", onLine: true, serviceWorker: undefined, share: undefined },
  location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  requestIdleCallback: undefined,
  fetch: () => Promise.reject(new Error("offline")),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: undefined, localStorage: undefined,
  module: { exports: {} },
  removeEventListener() {}, dispatchEvent() { return true; },
  scrollTo() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  alert() {}, confirm() { return true; }, prompt() { return null; },
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;

const popListeners = [];
ctx.addEventListener = function (type, fn) { if (type === "popstate") popListeners.push(fn); };
ctx.__firePopstate = function (state) { popListeners.slice().forEach((fn) => fn({ state })); };
ctx.history = makeHistory(ctx);

vm.createContext(ctx);
[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/movements.js", "js/debts.js",
  "js/budgets.js", "js/charts.js", "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js",
  "js/wealth.js", "js/goals.js", "js/forecast.js", "js/calendar.js", "js/recurring.js", "js/analytics.js",
  "js/insights.js", "js/assistant.js", "js/advisor.js", "js/investments.js", "js/portfolio.js", "js/simulators.js",
  "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (expr) => vm.runInContext(expr, ctx);

// Estado mínimo e a rota inicial, como o `init()` faz.
run(`state.data = migrate(defaultData()); state.booting = false; state.form = freshTxForm();`);
run(`NavHistory.replace(state.tab, [], 0);`);
// O `init()` do app não é chamado aqui (ele abre banco e câmera); registramos
// só o que interessa a este teste, exatamente como ele faz.
run(`window.addEventListener("popstate", applyHistoryRoute);`);

// Clique de verdade: monta um alvo com dataset e dispara `onClick`.
function click(action, dataset) {
  const btn = fakeEl("button");
  btn.dataset = Object.assign({ action }, dataset || {});
  const evt = {
    target: { closest: (sel) => (sel === "[data-action]" ? btn : null), dataset: btn.dataset },
    preventDefault() {}, stopPropagation() {},
  };
  ctx.__btn = btn; ctx.__evt = evt;
  run(`onClick(__evt)`);
}

section("2.1 Toda troca de tela deixa entrada no histórico");
{
  const before = run("history.__index");
  click("nav", { tab: "health" });
  check("aba muda", run("state.tab") === "health");
  check("hash acompanha a tela", ctx.location.hash === "#/saude", ctx.location.hash);
  check("empilhou uma entrada", run("history.__index") === before + 1);
  check("profundidade subiu", run("NavHistory.current().depth") === 1);

  click("nav", { tab: "wealth" });
  check("segunda navegação empilha", run("history.__index") === before + 2);

  run(`history.go(-1)`);
  check("voltar devolve a tela anterior", run("state.tab") === "health", run("state.tab"));
  check("voltar corrige o hash", ctx.location.hash === "#/saude", ctx.location.hash);

  run(`history.go(-1)`);
  check("voltar de novo chega ao dashboard", run("state.tab") === "dashboard");
  check("profundidade zerou na raiz", run("NavHistory.current().depth") === 0);
}

section("2.2 Navegação fora do `case nav` também entra no histórico");
{
  // Este é o motivo de a sincronia viver em `setState` e não no handler: há
  // onze pontos no app.js que trocam de tela por conta própria.
  const before = run("history.__index");
  run(`setState({ tab: "calendar" })`);
  check("setState direto empilha", run("history.__index") === before + 1);
  check("hash reflete a tela", ctx.location.hash === "#/calendario");
  run(`history.go(-1)`);
  check("e o voltar funciona igual", run("state.tab") === "dashboard");
}

section("2.3 O voltar fecha a camada antes de sair da tela");
{
  click("nav", { tab: "analytics" });
  const depthAtScreen = run("history.__index");
  click("open-wrapped", {});
  check("camada abriu", run("state.wrapped.open") === true);
  check("camada empilhou entrada própria", run("history.__index") === depthAtScreen + 1);
  check("camada NÃO entra no hash", ctx.location.hash === "#/analises", ctx.location.hash);
  check("pilha registrada", run(`state.overlayStack.join()`) === "wrapped");

  run(`history.go(-1)`);
  check("voltar fecha a camada", run("state.wrapped.open") === false);
  check("voltar NÃO trocou de tela", run("state.tab") === "analytics", run("state.tab"));
  check("pilha esvaziou", run("state.overlayStack.length") === 0);
}

section("2.4 Fechar pelo X usa a mesma sequência do voltar");
{
  const before = run("history.__index");
  click("open-wrapped", {});
  click("close-wrapped", {});
  check("camada fechou", run("state.wrapped.open") === false);
  check("fechar pelo X desempilha de verdade", run("history.__index") === before, { before, depois: run("history.__index") });
  check("pilha limpa depois do X", run("state.overlayStack.length") === 0);
  // Voltar agora tem de sair da tela, não reabrir/fechar um modal fantasma.
  run(`history.go(-1)`);
  check("voltar depois do X troca de tela", run("state.tab") !== "analytics", run("state.tab"));
}

section("2.5 Trocar de tela com camada aberta não deixa pilha suja");
{
  run(`setState({ tab: "analytics" })`);
  click("open-wrapped", {});
  run(`setState({ tab: "goals" })`);
  check("pilha zerada ao trocar de tela", run("state.overlayStack.length") === 0);
  check("chegou na tela nova", run("state.tab") === "goals");
}

section("2.6 Endereço colado abre a tela certa");
{
  ctx.location.hash = "#/dividas";
  check("rota lida do endereço", run(`NavHistory.current().tab`) === "debts");
  // Aba nova com endereço inválido: sem `history.state` para consultar, o app
  // abre o dashboard em vez de renderizar tela em branco.
  run(`history.replaceState(null, "", "#/rota-que-nao-existe")`);
  ctx.location.hash = "#/rota-que-nao-existe";
  check("rota inválida cai no dashboard", run(`NavHistory.current().tab`) === "dashboard", run(`NavHistory.current().tab`));
}

/* ============================================================ Lápides */
section("3. Lápides de exclusão (v14)");
{
  const iso = (d) => new Date(d).toISOString();

  check("schema subiu para 22", run("SCHEMA_VERSION") === 22);
  check("banco novo nasce com cemitério vazio",
    Object.keys(run("migrate(defaultData()).graveyard.transactions")).length === 0);
  check("cemitério cobre as nove entidades sincronizáveis",
    Object.keys(run("migrate(defaultData()).graveyard")).sort().join()
      === "accountAdjustments,accountTransfers,accounts,assets,cardPayments,categories,creditCards,goals,transactions",
    Object.keys(run("migrate(defaultData()).graveyard")).sort().join());

  // Backup antigo (sem o campo) continua válido.
  ctx.__legacy = { version: 3, transactions: [], categories: [], goals: [] };
  check("backup antigo é normalizado sem quebrar",
    typeof run("migrate(__legacy).graveyard") === "object");

  // Lápide corrompida é descartada, não consertada com data inventada.
  ctx.__sujo = { transactions: { a: "não é data", b: 12345, c: iso(Date.now()) } };
  const limpo = run("normalizeGraveyard(__sujo).transactions");
  check("data inválida é descartada", !("a" in limpo) && !("b" in limpo));
  check("lápide válida sobrevive", "c" in limpo);

  ctx.__antigo = { transactions: { velha: iso(Date.now() - 900 * 24 * 3600 * 1000) } };
  check("lápide de 2+ anos é podada", Object.keys(run("normalizeGraveyard(__antigo).transactions")).length === 0);

  // ---- O caso que motiva o módulo ----
  const t0 = iso(Date.now() - 10 * 3600 * 1000);   // criação
  const tDel = iso(Date.now() - 5 * 3600 * 1000);  // exclusão neste aparelho
  const tEdit = iso(Date.now() - 1 * 3600 * 1000); // edição no outro aparelho

  ctx.__atual = run(`migrate(defaultData())`);
  ctx.__atual.graveyard = { transactions: { tx1: tDel, tx2: tDel }, categories: {}, goals: {}, assets: {} };
  ctx.__backup = run(`migrate(defaultData())`);
  ctx.__backup.transactions = [
    { id: "tx1", date: "2026-01-10", type: "expense", amount: 50, categoryId: "outros", description: "apagado aqui", createdAt: t0, updatedAt: t0 },
    { id: "tx2", date: "2026-01-11", type: "expense", amount: 70, categoryId: "outros", description: "editado depois", createdAt: t0, updatedAt: tEdit },
    { id: "tx3", date: "2026-01-12", type: "expense", amount: 90, categoryId: "outros", description: "novo", createdAt: t0, updatedAt: t0 },
  ];

  const merged = run(`mergeBackupInto(__atual, __backup).data || mergeBackupInto(__atual, __backup)`);
  const ids = (merged.transactions || []).map((t) => t.id).sort();
  check("registro apagado NÃO ressuscita", ids.indexOf("tx1") === -1, ids);
  check("registro editado depois da exclusão volta", ids.indexOf("tx2") !== -1, ids);
  check("registro sem lápide entra normalmente", ids.indexOf("tx3") !== -1, ids);
  check("cemitério sobrevive à mesclagem", !!merged.graveyard && !!merged.graveyard.transactions.tx1);

  // União dos dois lados, exclusão mais recente prevalece.
  // A lápide passou a guardar { at, rev }: a data continua legível e a marca do
  // relógio lógico é quem decide o conflito quando os relógios divergem.
  const uni = run(`mergeGraveyards({ transactions: { x: "${tDel}" } }, { transactions: { x: "${tEdit}", y: "${tDel}" } })`);
  check("união mantém a exclusão mais recente", uni.transactions.x.at === tEdit, JSON.stringify(uni.transactions.x));
  check("união traz o que só existia do outro lado", uni.transactions.y.at === tDel);
  check("lápide carrega marca lógica comparável", run(`isSyncRev(mergeGraveyards({ transactions: { x: "${tDel}" } }, {}).transactions.x.rev)`));

  // Envelope de backup e checksum.
  ctx.__env = run(`buildBackupEnvelope(__atual)`);
  check("cemitério entra no backup", !!ctx.__env.data.graveyard);
  check("checksum confere com o payload",
    run(`checksumOf(canonicalJson(__env.data))`) === ctx.__env.checksum);

  // Toda exclusão na UI grava lápide — varredura anti-regressão.
  const appSrc = uiSrc();
  const deletes = (appSrc.match(/\.filter\(\([a-z]\) => [a-z]\.id !== id\)/g) || []).length;
  const graves = (appSrc.match(/withTombstones\(/g) || []).length;
  check("nenhuma exclusão de id único ficou sem lápide", graves >= deletes, { deletes, graves });
}

/* ============================================================ Lembrete de backup */
section("4. Lembrete de backup (grupo novo na central)");
{
  const dia = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const tx = (i, criadoEm) => ({
    id: "b" + i, date: criadoEm, type: "expense", amount: 10, categoryId: "outros",
    description: "x", payment: "Débito", createdAt: criadoEm + "T12:00:00.000Z", updatedAt: criadoEm + "T12:00:00.000Z",
  });
  const chaves = (d) => {
    ctx.__d = d;
    return run(`buildNotificationCandidates(__d, {}).map((c) => c.key)`).filter((k) => k.indexOf("backup:") === 0);
  };

  check("grupo de backup existe na central",
    run(`NOTIF_GROUPS.some((g) => g.id === "backup")`) === true);

  // Poucos lançamentos: perder isso custa pouco, o aviso seria só ruído.
  const poucos = run(`migrate(defaultData())`);
  poucos.transactions = [tx(1, dia(2)), tx(2, dia(1))];
  check("banco quase vazio não gera aviso", chaves(poucos).length === 0, chaves(poucos));

  // Histórico de verdade e nenhum backup: é o caso que motiva a regra.
  const semBackup = run(`migrate(defaultData())`);
  semBackup.transactions = Array.from({ length: 20 }, (_, i) => tx(i, dia(i + 1)));
  const k1 = chaves(semBackup);
  check("nunca fez backup gera aviso", k1.some((k) => k.indexOf("backup:nunca") === 0), k1);
  check("aviso leva para Ajustes",
    (() => { ctx.__d = semBackup; return run(`buildNotificationCandidates(__d, {}).filter((c) => c.group === "backup")[0].tab`); })() === "settings");

  // Meta cadastrada sozinha já justifica o aviso, mesmo sem lançamentos.
  const soMeta = run(`migrate(defaultData())`);
  soMeta.goals = [{ id: "g1", name: "Reserva", target: 1000, saved: 100, createdAt: dia(30) }];
  check("só uma meta cadastrada já gera aviso", chaves(soMeta).some((k) => k.indexOf("backup:nunca") === 0));

  // Backup recente cala a regra.
  const recente = run(`migrate(defaultData())`);
  recente.transactions = Array.from({ length: 20 }, (_, i) => tx(i, dia(i + 1)));
  recente.lastBackupAt = dia(3);
  check("backup recente não incomoda", chaves(recente).length === 0, chaves(recente));

  // Backup velho SEM movimento novo: quem parou de usar não precisa de lembrete.
  const paradoVelho = run(`migrate(defaultData())`);
  paradoVelho.transactions = Array.from({ length: 20 }, (_, i) => tx(i, dia(i + 100)));
  paradoVelho.lastBackupAt = dia(60);
  check("backup velho sem movimento novo fica calado", chaves(paradoVelho).length === 0, chaves(paradoVelho));

  // Backup velho COM movimento novo: aí sim.
  const velhoComMovimento = run(`migrate(defaultData())`);
  velhoComMovimento.transactions = Array.from({ length: 20 }, (_, i) => tx(i, dia(i + 1)));
  velhoComMovimento.lastBackupAt = dia(60);
  const k2 = chaves(velhoComMovimento);
  check("backup velho com movimento novo avisa", k2.some((k) => k.indexOf("backup:desatualizado") === 0), k2);

  // Identidade por fato, não por render.
  check("a chave carrega o mês (um aviso por mês, não por render)",
    /backup:(nunca|desatualizado):\d{4}-\d{2}$/.test(k2[0] || k1[0]), k2[0] || k1[0]);

  // Silenciar o grupo faz o aviso parar de nascer.
  ctx.__d = velhoComMovimento;
  check("silenciar o grupo cala a regra",
    run(`buildNotificationCandidates(__d, { muted: { backup: true } }).filter((c) => c.group === "backup").length`) === 0);

  // Data corrompida vira "nunca fez backup" em vez de silêncio.
  const sujo = run(`migrate(defaultData())`);
  sujo.transactions = Array.from({ length: 20 }, (_, i) => tx(i, dia(i + 1)));
  ctx.__sujoIn = { ...sujo, lastBackupAt: "trinta de maio" };
  check("data inválida não silencia o aviso",
    run(`migrate(__sujoIn).lastBackupAt`) === null);

  // A linha de estado em Ajustes tem de renderizar nos três casos.
  run(`state.data = migrate(defaultData())`);
  check("sem lançamento, a linha some", run(`renderLastBackupLine()`) === "");
  run(`state.data = { ...state.data, transactions: [{ id:"t1", date:"2026-01-01", type:"expense", amount:10, categoryId:"outros", description:"x", payment:"Débito", createdAt:"2026-01-01T12:00:00.000Z", updatedAt:"2026-01-01T12:00:00.000Z" }] }`);
  const semLinha = run(`renderLastBackupLine()`);
  check("sem backup, avisa em vermelho", semLinha.indexOf("ainda não exportou") !== -1, semLinha.slice(0, 90));
  run(`state.data = { ...state.data, lastBackupAt: todayIso() }`);
  const comLinha = run(`renderLastBackupLine()`);
  check("com backup de hoje, mostra a data", comLinha.indexOf("hoje") !== -1 && comLinha.indexOf("undefined") === -1, comLinha.slice(0, 90));
  check("a linha não vaza NaN", comLinha.indexOf("NaN") === -1);

  // Backup e mesclagem.
  ctx.__comData = { ...sujo, lastBackupAt: dia(3) };
  check("data do backup entra no envelope",
    run(`buildBackupEnvelope(__comData).data.lastBackupAt`) === dia(3));
  ctx.__novo = { ...run(`migrate(defaultData())`), lastBackupAt: dia(1) };
  ctx.__antigo2 = { ...run(`migrate(defaultData())`), lastBackupAt: dia(90) };
  check("mesclagem fica com a data mais recente",
    run(`mergeBackupInto(__novo, __antigo2).lastBackupAt || mergeBackupInto(__novo, __antigo2).data.lastBackupAt`) === dia(1));
}

section(fail === 0 ? `\nTUDO CERTO — ${ok} verificações.` : `\nFALHAS ENCONTRADAS — ${ok} ok, ${fail} falha(s).`);
process.exit(fail === 0 ? 0 : 1);
