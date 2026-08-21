// test-beta-fixes.js. Regressões encontradas no primeiro teste de beta.
//
// Cada bloco trava UM defeito observado usando o aplicativo de verdade. Todos
// eram silenciosos: nenhum lançava exceção, nenhum aparecia no console, e por
// isso nenhum teste existente os pegava.
//
//   F-01  o service worker nunca era registrado (offline e PWA não existiam)
//   F-02  o cartão do saldo somava renda projetada com economia realizada
//   F-03  a tela de conta abria com erro quando /api devolvia HTML com 200
//   F-04  data pura lida como UTC voltava um dia e inventava horário
//   F-05  lançamentos anteriores à abertura sumiam do saldo sem aviso
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let ok = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { ok++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function section(t) { console.log("\n" + t); }

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
  "js/safe-errors.js", "js/storage.js", "js/auth.js", "js/accounts.js", "js/movements.js",
  "js/data-sources.js", "js/debts.js", "js/budgets.js", "js/charts.js",
  "js/import.js", "js/nlp.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/transparency.js", "js/calendar.js", "js/recurring.js",
  "js/analytics.js", "js/insights.js", "js/assistant.js", "js/contextual-assistant.js",
  "js/advisor.js", "js/investments.js", "js/portfolio.js",
  "js/simulators.js", "js/qrcode.js", "js/achievements.js", "js/wrapped.js", "js/services.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"]).forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (expr) => vm.runInContext(expr, ctx);
run(`state.data = migrate(defaultData()); state.booting = false; state.form = freshTxForm();`);

const valorDoChip = (html) => (html.match(/hero-chip__value">([^<]+)</g) || [])
  .map((s) => s.replace(/.*">/, "").replace(/</, ""))
  .map((s) => Number(String(s).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")));

/* ------------------------------------------------------------------ F-01 */
function blocoF01() {
  section("F-01. O service worker precisa ser registrado mesmo depois do `load`");
  const fonte = readSrc("js/app.js");
  const bloco = fonte.slice(fonte.indexOf('if ("serviceWorker" in navigator)'));
  const trecho = bloco.slice(0, bloco.indexOf("controllerchange"));

  check("o registro cobre o caso de a página já ter carregado",
    /document\.readyState\s*===\s*"complete"/.test(trecho));
  check("o registro ainda cobre o caso de a página não ter carregado",
    /addEventListener\("load"/.test(trecho));
  check("o listener de `load` não dispara mais de uma vez",
    /\{\s*once:\s*true\s*\}/.test(trecho));
  check("a falha de registro deixa de ser engolida por um catch vazio",
    !/register\("service-worker\.js"\)\s*\.catch\(\(\)\s*=>\s*\{\}\)/.test(trecho));
  check("a falha de registro vai para o diagnóstico local",
    /sw_register_failed/.test(trecho));

  // A raiz do defeito: `init()` é async e espera o IndexedDB, então quando esta
  // linha executa o `load` já passou. Listener registrado depois do evento
  // nunca roda, e nenhum service worker era criado. Se algum dia o `await`
  // sair daqui, este teste deixa de fazer sentido e precisa ser revisto.
  const init = fonte.slice(fonte.indexOf("async function init()"));
  const antesDoSw = init.slice(0, init.indexOf('if ("serviceWorker" in navigator)'));
  check("o bloco de fato vem depois de um `await` dentro de init()",
    /await\s+initStorage\(\)/.test(antesDoSw));
}

/* ------------------------------------------------------------------ F-02 */
function blocoF02() {
  section("F-02. Receitas, despesas e economia do mês têm que fechar entre si");
  const hoje = run(`todayIso()`);
  const mes = run(`keyOfDate(new Date())`);

  // Cenário do primeiro dia de uso: renda DECLARADA no onboarding, nenhuma
  // receita lançada ainda, uma despesa registrada. Era exatamente aqui que a
  // tela mostrava 5.420 menos 214,90 dando menos 214,90.
  run(`state.data = migrate({ ...defaultData(), monthlyIncome: 5420, userName: "Renan" });`);
  run(`state.data = { ...state.data, transactions: [{
    id: "t-desp", type: "expense", amount: 214.9, categoryId: "mercado",
    date: ${JSON.stringify(hoje)}, monthKey: ${JSON.stringify(mes)},
    payment: "Pix", description: "Mercado", recurring: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }] };`);

  const html = run(`renderHeroCard(dashboardModel(new Date()))`);
  const chips = valorDoChip(html);
  check("o painel mostra os três chips", chips.length === 3, chips);
  check("receitas menos despesas é exatamente a economia exibida",
    chips.length === 3 && Math.abs((chips[0] - chips[1]) - chips[2]) < 0.005, chips);
  check("sem receita lançada, receitas do mês é zero e não a renda declarada",
    chips[0] === 0, chips[0]);
  check("a renda declarada não some da tela; vira aviso",
    /renda declarada ainda não lançada/.test(html));

  // Com a receita lançada as duas bases coincidem e o aviso não faz mais sentido.
  run(`state.data = { ...state.data, transactions: [...state.data.transactions, {
    id: "t-rec", type: "income", amount: 5420, categoryId: null,
    date: ${JSON.stringify(hoje)}, monthKey: ${JSON.stringify(mes)},
    payment: "Pix", description: "Salário", recurring: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }] };`);
  const html2 = run(`renderHeroCard(dashboardModel(new Date()))`);
  const chips2 = valorDoChip(html2);
  check("com a receita lançada os três chips continuam fechando",
    chips2.length === 3 && Math.abs((chips2[0] - chips2[1]) - chips2[2]) < 0.005, chips2);
  check("com a receita lançada o aviso de renda pendente some",
    !/renda declarada ainda não lançada/.test(html2));

  // O cartão de planejamento pode usar outra base, mas precisa DIZER isso;
  // era a segunda metade da confusão: dois números diferentes chamados de sobra.
  run(`state.data = { ...state.data, transactions: state.data.transactions.filter((t) => t.type !== "income") };`);
  const saude = run(`renderBudgetHealth(new Date(), true, 214.9, 0, 214.9)`);
  check("o cartão de saúde identifica a base prevista quando a renda não entrou",
    /Renda prevista/.test(saude) && /Sobra prevista/.test(saude));

  run(`state.data = { ...state.data, transactions: [...state.data.transactions, {
    id: "t-rec2", type: "income", amount: 5420, categoryId: null,
    date: ${JSON.stringify(hoje)}, monthKey: ${JSON.stringify(mes)},
    payment: "Pix", description: "Salário", recurring: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }] };`);
  const saude2 = run(`renderBudgetHealth(new Date(), true, 214.9, 0, 214.9)`);
  check("com a renda realizada o cartão volta aos rótulos simples",
    !/Renda prevista/.test(saude2) && !/Sobra prevista/.test(saude2));
}

/* ------------------------------------------------------------------ F-03 */
function resposta(status, tipo, corpo) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (h) => (String(h).toLowerCase() === "content-type" ? tipo : null) },
    json: () => (String(tipo).indexOf("json") !== -1
      ? Promise.resolve(JSON.parse(corpo))
      : Promise.reject(new Error("não é JSON"))),
  };
}

async function chamar(expr, r) {
  ctx.fetch = () => Promise.resolve(r);
  try { return { ok: true, valor: await run(expr) }; }
  catch (e) { return { ok: false, erro: e.message, code: e.code }; }
}

async function blocoF03() {
  section("F-03. Resposta sem JSON em /api significa modo local, não erro");

  // O caso exato do servidor de desenvolvimento e de qualquer publicação
  // estática: o fallback de SPA entrega o index.html com status 200.
  let r = await chamar(`AccountAPI.session()`, resposta(200, "text/html; charset=utf-8", "<!doctype html>"));
  check("HTML com status 200 vira modo local, sem erro", r.ok && r.valor.configured === false, r);

  r = await chamar(`AccountAPI.session()`, resposta(404, "text/html", "<!doctype html>"));
  check("404 continua virando modo local", r.ok && r.valor.configured === false, r);

  r = await chamar(`AccountAPI.session()`, resposta(200, "application/json", '{"ok":true,"configured":true,"authenticated":false}'));
  check("JSON de verdade continua sendo respeitado", r.ok && r.valor.configured === true, r);

  r = await chamar(`AccountAPI.devices()`, resposta(200, "text/html", "<!doctype html>"));
  check("em outras rotas, HTML vira erro claro de serviço indisponível",
    !r.ok && r.code === "account_unavailable", r);

  r = await chamar(`AccountAPI.login({ email: "a@b.c", password: "12345678901" })`,
    resposta(401, "application/json", '{"ok":false,"code":"bad_credentials","message":"E-mail ou senha inválidos."}'));
  check("erro real do servidor continua chegando com a própria mensagem",
    !r.ok && r.erro === "E-mail ou senha inválidos.", r);

  // A consulta de sessão é automática na abertura. Falha nela não descreve
  // nada que o usuário fez e não pode virar alerta vermelho na tela.
  // `state.account.configured = true;` só existe no catch EXTERNO da função,
  // que é o da consulta automática. O catch interno (lista de dispositivos)
  // continua podendo mostrar erro: sessão revogada ou expirada é informação
  // acionável, e não deve ser silenciada junto.
  const auth = readSrc("js/auth.js");
  const refresh = auth.slice(auth.indexOf("async function refreshAccountSession"));
  const externo = refresh.slice(refresh.indexOf("state.account.configured = true;"));
  const janela = externo.slice(0, 800);
  check("o catch da sessão automática deixa o erro vazio",
    /state\.account\.error = "";/.test(janela));
  check("o catch da sessão automática não copia mais a mensagem crua",
    !/state\.account\.error = error\.message;/.test(janela));

  // O servidor de desenvolvimento também não pode responder /api com HTML.
  const serve = readSrc("scripts/serve.js");
  check("o servidor de desenvolvimento responde /api em JSON",
    /indexOf\("\/api\/"\)\s*===\s*0/.test(serve) && /application\/json/.test(serve));
}

/* ------------------------------------------------------------------ F-04 */
function blocoF04() {
  section("F-04. Data pura não é UTC e não tem hora");
  const puro = run(`formatMovementTimestamp("2026-08-20")`);
  check("data pura mostra o próprio dia", puro === "20/08/2026", puro);
  check("data pura não inventa horário", !/\d{2}:\d{2}/.test(puro), puro);
  const virada = run(`formatMovementTimestamp("2026-01-01")`);
  check("virada de ano não volta um dia", virada === "01/01/2026", virada);
  const completo = run(`formatMovementTimestamp("2026-08-20T15:30:00")`);
  check("carimbo completo continua mostrando hora",
    /\d{2}\/\d{2}\/\d{4}.*\d{2}:\d{2}/.test(completo), completo);
  check("valor vazio segue com a mensagem de sempre",
    run(`formatMovementTimestamp("")`) === "Data não disponível");
  check("valor nulo segue com a mensagem de sempre",
    run(`formatMovementTimestamp(null)`) === "Data não disponível");
  check("valor inválido segue com a mensagem de sempre",
    run(`formatMovementTimestamp("banana")`) === "Data não disponível");
}

/* ------------------------------------------------------------------ F-05 */
function blocoF05() {
  section("F-05. Lançamento anterior à abertura precisa ser anunciado");
  run(`state.data = migrate({ ...defaultData(), monthlyIncome: 5420 });`);
  run(`state.data = { ...state.data,
    accounts: [{ id: "acc-1", name: "Nubank", type: "digital", openingBalance: 3200.5,
      openingDate: "2026-08-20", color: "#0B6B5C", archived: false, reconciledAt: null }],
    transactions: [
      { id: "t-antes", type: "expense", amount: 89.9, categoryId: "moradia", date: "2026-08-19",
        monthKey: "2026-08", payment: "Débito", description: "Internet", recurring: false,
        accountId: "acc-1", source: "manual", createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z" },
      { id: "t-depois", type: "expense", amount: 214.9, categoryId: "mercado", date: "2026-08-20",
        monthKey: "2026-08", payment: "Pix", description: "Mercado", recurring: false,
        accountId: "acc-1", source: "import-ofx", createdAt: "2026-08-20T11:00:00.000Z", updatedAt: "2026-08-20T11:00:00.000Z" },
    ] };`);

  const saldo = run(`accountBalance(state.data, "acc-1", null)`);
  check("o saldo segue ignorando o lançamento anterior à abertura", saldo === 2985.6, saldo);
  const fora = run(`buildDataSourcesModel(state.data).accountStats[0].beforeOpeningCount`);
  check("o modelo conta quantos ficaram de fora", fora === 1, fora);

  const tela = run(`renderAccountsScreen()`);
  check("a tela de contas avisa, junto do saldo", /não entra neste saldo/.test(tela));
  check("o aviso mostra a data de abertura", /20\/08\/2026/.test(tela));
  check("o aviso usa singular com um lançamento só", /1 lançamento é anterior/.test(tela));

  // A importação é onde o extrato traz o mês inteiro para trás da abertura.
  run(`state.importRows = Object.assign([
    { include: true, type: "expense", amount: 1450, categoryId: "moradia", date: "2026-08-05", description: "ALUGUEL" },
    { include: true, type: "expense", amount: 44.9, categoryId: "assinaturas", date: "2026-08-10", description: "NETFLIX" },
    { include: true, type: "expense", amount: 32, categoryId: "transporte", date: "2026-08-22", description: "UBER" },
  ], { meta: { format: "ofx" } });`);
  const revisao = run(`renderImportReview(state.importRows)`);
  check("a revisão da importação avisa antes de confirmar",
    /2 lançamentos são anteriores à abertura/.test(revisao));
  check("o aviso da importação nomeia a conta de destino", /Nubank/.test(revisao));
  check("a revisão explica como fazer valerem no saldo", /recue a data de abertura/.test(revisao));

  // Linha desmarcada não deve entrar na contagem do aviso.
  run(`state.importRows[0].include = false; state.importRows[1].include = false;`);
  check("linhas desmarcadas saem da contagem do aviso",
    !/anteriores à abertura/.test(run(`renderImportReview(state.importRows)`)));
  run(`state.importRows = null;`);

  // Sem nada anterior à abertura, nenhum aviso aparece.
  run(`state.data = { ...state.data, transactions: state.data.transactions.filter((t) => t.id !== "t-antes") };`);
  check("sem lançamento anterior, a tela não inventa aviso",
    !/não entra neste saldo/.test(run(`renderAccountsScreen()`)));
}

/* ------------------------------------------------------------------ F-07 */
function blocoF07() {
  section("F-07. O foco do teclado tem que sobreviver ao render");

  const chave = (el) => run(`focusKeyOf(${JSON.stringify(el)})`);

  check("elemento nulo continua sem chave", chave(null) === null);
  check("elemento sem nada aproveitável continua sem chave",
    chave({ dataset: {} }) === null);
  check("campo com id é localizado por id",
    JSON.stringify(chave({ id: "tx-amount-input", dataset: {} }))
      === JSON.stringify({ by: "id", id: "tx-amount-input" }));

  const campo = chave({ dataset: { field: "reconcile-value" } });
  check("campo com data-field continua funcionando como antes",
    campo && campo.by === "selector" && campo.sel === '[data-field="reconcile-value"]', campo);

  // A regressão: botões de ação não têm id nem data-field. Antes a função
  // devolvia null aqui e o foco caía no body a cada clique.
  const chip = chave({ dataset: { action: "set-category", value: "mercado" } });
  check("chip de categoria agora gera chave",
    chip !== null && chip.by === "selector", chip);
  check("a chave do chip usa ação e valor",
    chip && chip.sel === '[data-action="set-category"][data-value="mercado"]', chip);

  const navegacao = chave({ dataset: { action: "nav", tab: "add" } });
  check("botão de navegação usa a aba de destino",
    navegacao && navegacao.sel === '[data-action="nav"][data-tab="add"]', navegacao);

  const linha = chave({ dataset: { action: "import-toggle", id: "3" } });
  check("botão de linha usa o id da linha",
    linha && linha.sel === '[data-action="import-toggle"][data-id="3"]', linha);

  const select = chave({ dataset: { actionSelect: "import-category", id: "2" } });
  check("select com data-action-select também é coberto",
    select && select.sel === '[data-action-select="import-category"][data-id="2"]', select);

  // Aspas no valor não podem quebrar o seletor: `60/20/20` é inofensivo, mas
  // descrição de categoria vinda do usuário chega aqui em outros pontos.
  const aspas = chave({ dataset: { action: "cat-pick", value: 'a"b' } });
  let seletorValido = true;
  try { run(`document.querySelectorAll(${JSON.stringify(aspas.sel)})`); } catch (e) { seletorValido = false; }
  check("valor com aspas é escapado e não quebra o seletor",
    seletorValido && aspas.sel.indexOf('\\"') !== -1, aspas);

  // restoreFocus precisa acertar o elemento certo quando há vários iguais.
  const focados = [];
  const falso = (marca) => ({ marca, focus() { focados.push(marca); }, setSelectionRange() {} });
  const lista = [falso("primeiro"), falso("segundo"), falso("terceiro")];
  const docOriginal = { qs: ctx.document.querySelector, qsa: ctx.document.querySelectorAll };
  ctx.document.querySelectorAll = () => lista;
  ctx.document.querySelector = () => lista[0];

  run(`restoreFocus({ by: "selector", sel: "[data-action=\\"x\\"]", nth: 2 }, null, null)`);
  check("com vários iguais, o foco volta para a posição certa",
    focados[focados.length - 1] === "terceiro", focados);

  run(`restoreFocus({ by: "selector", sel: "[data-action=\\"x\\"]", nth: 0 }, null, null)`);
  check("sem posição guardada, o foco volta para o primeiro",
    focados[focados.length - 1] === "primeiro", focados);

  ctx.document.querySelectorAll = () => [];
  ctx.document.querySelector = () => null;
  const antes = focados.length;
  run(`restoreFocus({ by: "selector", sel: "[data-action=\\"sumiu\\"]", nth: 0 }, null, null)`);
  check("elemento que deixou de existir não força foco em vizinho",
    focados.length === antes, focados);

  ctx.document.querySelector = docOriginal.qs;
  ctx.document.querySelectorAll = docOriginal.qsa;

  // A tela precisa mesmo emitir os atributos que a chave usa.
  run(`state.data = migrate({ ...defaultData(), monthlyIncome: 5420 });`);
  run(`state.tab = "add"; state.form = freshTxForm();`);
  const tela = run(`renderAddScreen()`);
  check("os chips da tela de lançamento trazem ação e valor",
    /data-action="[^"]+"[^>]*data-(value|id)="/.test(tela));
}

async function main() {
  blocoF01();
  blocoF02();
  await blocoF03();
  blocoF04();
  blocoF05();
  blocoF07();
  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Erro inesperado na suíte:", error);
  process.exit(1);
});
