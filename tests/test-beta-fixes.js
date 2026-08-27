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
//   F-18  entrar na conta reabria o assistente e duplicava a conta do banco
//   F-19  não havia como excluir uma conta do banco nem um cartão
//   F-20  o conserto do F-18 fazia o assistente tomar a tela dois segundos depois
//   F-21  a tela subia sozinha ao digitar, e ao criar ou editar uma categoria
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

  // A CONTAGEM SOZINHA NÃO DECIDE NADA. "1 lançamento ficou de fora" não diz
  // se é R$ 5 ou R$ 1.180, e sem o valor ninguém consegue julgar se o saldo
  // está certo — o painel se contradizia em silêncio, porque a despesa
  // aparecia em "Despesas do mês" e o saldo não se mexia.
  const fora2 = run(`accountPreOpeningEffect(state.data, "acc-1", "2026-08-26")`);
  check("o efeito no saldo é quantificado", fora2.count === 1 && fora2.amount.toFixed(2) === "-89.90", JSON.stringify(fora2));
  check("saldo mais o que ficou de fora reconstroem a conta inteira",
    (run(`accountsSummary(state.data, "2026-08-26").cash`) + fora2.amount).toFixed(2) === "2895.70",
    run(`accountsSummary(state.data, "2026-08-26").cash`) + fora2.amount);
  check("o aviso da tela traz o valor", /89,90/.test(tela), tela.slice(tela.indexOf("anterior à abertura") - 40, tela.indexOf("anterior à abertura") + 240));
  check("e diz o que fazer a respeito", /corrija a data de abertura ou o valor inicial/.test(tela));

  // O painel é onde a contradição aparecia; o aviso precisa estar lá também.
  const painel = run(`renderDashboardScreen()`);
  check("o painel anuncia o que está fora do saldo", /está fora deste saldo/.test(painel));
  check("o painel traz o valor", /89,90/.test(painel));

  // A explicação do cálculo deixa de ser genérica quando há algo de fora.
  const premissas = run(`calculationExplanation(state.data, "accounts-balance", {}).premises`);
  check("a explicação do cálculo traz o número", premissas.some((t) => /89,90/.test(t)), JSON.stringify(premissas));

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
  check("nem o painel", !/fora deste saldo/.test(run(`renderDashboardScreen()`)));
  check("e a explicação volta à frase genérica",
    run(`calculationExplanation(state.data, "accounts-balance", {}).premises`)
      .includes("Cada conta considera apenas movimentos a partir da data de abertura informada."));
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

/* ------------------------------------------------------------------ F-08 */
function blocoF08() {
  section("F-08. Plural de verdade no lugar do \"(s)\"");

  check("o singular não leva s",
    run(`plural(1, "lançamento", "lançamentos")`) === "1 lançamento");
  check("o plural leva",
    run(`plural(2, "lançamento", "lançamentos")`) === "2 lançamentos");
  // O caso que quase todo ternário escrito à mão erra: em português o zero é
  // plural. Era `n > 1` no helper local da tela de conta, que dizia "0 meta".
  check("zero conta como plural, não como singular",
    run(`plural(0, "meta", "metas")`) === "0 metas");
  check("pluralWord devolve só a palavra, para o artigo e o verbo concordarem",
    run(`pluralWord(1, "linha ignorada", "linhas ignoradas")`) === "linha ignorada");
  check("pluralWord segue a mesma regra do zero",
    run(`pluralWord(0, "ativa", "ativas")`) === "ativas");
  // Contagem que ainda não chegou não pode imprimir "NaN lançamentos".
  check("contagem ausente vira zero em vez de NaN",
    run(`plural(undefined, "conta", "contas")`) === "0 contas");

  // Varredura do código entregue. A lista de palavras é fechada de propósito:
  // sem ela, `escapeHtml(s)` e `objectStore(s)` seriam confundidos com
  // marcador de plural, e o teste passaria a acusar chamada de função.
  const PALAVRAS = ["lançamento", "categoria", "subcategoria", "regra", "dia", "novo", "linha",
    "resultado", "ocorrência", "orçamento", "meta", "conta", "gasto", "fixo", "lançado",
    "importado", "exportado", "atualizado", "recategorizado", "alterado", "alterada",
    "estourado", "estourada", "existente", "existia", "ativa", "ignorada", "selecionado",
    "mês", "cartão", "pagamento", "transferência", "conciliação"];
  const marcador = new RegExp(`(${PALAVRAS.join("|")})\\((s|m)\\)`, "i");

  const entregues = fs.readdirSync(path.join(ROOT, "js"), { recursive: true })
    .map((nome) => String(nome))
    .filter((nome) => nome.endsWith(".js"))
    .map((nome) => path.join("js", nome));
  const sujos = entregues.filter((arquivo) => marcador.test(readSrc(arquivo)));
  check("nenhum texto entregue voltou a usar o marcador \"(s)\"", sujos.length === 0, sujos);
  check("a varredura de fato olhou o código todo, inclusive o pacote gerado",
    entregues.length > 60 && entregues.some((f) => f.includes("app.generated")), entregues.length);
}

/* ------------------------------------------------------------------ F-09 */
function blocoF09() {
  section("F-09. A importação separa entradas de saídas em vez de somar as duas");

  run(`state.data = migrate(defaultData());`);
  run(`state.importRows = [
    { include: true, date: todayIso(), type: "income",  amount: 5420,   description: "Salário",  categoryId: null,      duplicate: false },
    { include: true, date: todayIso(), type: "expense", amount: 1200,   description: "Mercado",  categoryId: "mercado", duplicate: false },
    { include: true, date: todayIso(), type: "expense", amount: 630.25, description: "Farmácia", categoryId: "saude",   duplicate: false },
  ];`);
  const html = run(`renderImportReview(state.importRows)`);

  check("o que entra aparece com o próprio valor",
    /R\$\s*5\.420,00 em entradas/.test(html));
  check("o que sai aparece com o próprio valor",
    /R\$\s*1\.830,25 em saídas/.test(html));
  // O número que a tela inventava: 5.420,00 + 1.830,25 somados em módulo. Não
  // é entrada, não é saída e não é saldo; não existe no extrato.
  check("a soma das duas direções não aparece em lugar nenhum",
    !/7\.250,25/.test(html), html.slice(html.indexOf("card-subtitle"), html.indexOf("card-subtitle") + 220));
  check("o rótulo do botão concorda com a contagem",
    /Importar 3 lançamentos/.test(html));

  // Extrato só de gastos é o caso comum; "R$ 0,00 em entradas" seria ruído.
  run(`state.importRows = state.importRows.map((r) => r.type === "income" ? { ...r, include: false } : r);`);
  const soSaidas = run(`renderImportReview(state.importRows)`);
  check("sem receita selecionada, a linha de entradas some",
    !/em entradas/.test(soSaidas));
  check("e a de saídas continua",
    /R\$\s*1\.830,25 em saídas/.test(soSaidas));

  // Uma linha só: o lugar onde o "(s)" mais aparecia.
  run(`state.importRows = [state.importRows[1]];`);
  const uma = run(`renderImportReview(state.importRows)`);
  check("uma linha só fica no singular",
    /1 selecionado para importar/.test(uma));
  check("uma linha só não escreve o plural do selecionado",
    !/1 selecionados/.test(uma));
  check("nem o plural do botão",
    /Importar 1 lançamento</.test(uma));
}

/* ------------------------------------------------------------------ F-15 */
function blocoF15() {
  section("F-15. O modelo de reserva chega com o valor alvo preenchido");

  // Despesa no mês fechado anterior: é dela que sai a média, porque
  // avgMonthlyExpense ignora o mês corrente enquanto houver mês fechado.
  const mesPassado = run(`keyOfDate(addMonths(new Date(), -1))`);
  const dataPassada = run(`isoOfDate(addMonths(new Date(), -1))`);
  const semear = `state.data = migrate({ ...defaultData(), transactions: [{
    id: "t-reserva", type: "expense", amount: 900, categoryId: "mercado",
    date: ${JSON.stringify(dataPassada)}, monthKey: ${JSON.stringify(mesPassado)},
    payment: "Pix", description: "Mercado", recurring: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }] });`;
  run(semear);

  check("a base da conta é a despesa média do histórico",
    run(`avgMonthlyExpense(state.data)`) === 900, run(`avgMonthlyExpense(state.data)`));
  check("e o horizonte é o que está configurado, seis meses por padrão",
    run(`emergencyFund(state.data).targetMonths`) === 6);
  check("o modelo entrega meses de despesa vezes a despesa média",
    run(`goalTemplateTarget(goalTemplateById("reserva"), state.data)`) === 5400,
    run(`goalTemplateTarget(goalTemplateById("reserva"), state.data)`));

  // O alvo tem que sair do CÁLCULO, não do campo `target` de uma reserva que
  // já exista: senão o modelo copia a meta antiga em vez de sugerir uma.
  run(`state.data = { ...state.data, goals: [{ id: "g-velha", name: "Reserva antiga", target: 99999,
    current: 0, savedUpfront: 0, existingBalance: 0, deadline: "", icon: "shieldCheck",
    createdAt: todayIso(), monthlyPlan: 0 }], emergencyGoalId: "g-velha" };`);
  check("meta de reserva já existente não contamina a sugestão do modelo",
    run(`goalTemplateTarget(goalTemplateById("reserva"), state.data)`) === 5400,
    run(`goalTemplateTarget(goalTemplateById("reserva"), state.data)`));

  // Os outros modelos não têm conta a fazer e continuam como estavam.
  check("modelo sem conta a fazer segue sem alvo",
    run(`goalTemplateTarget(goalTemplateById("viagem"), state.data)`) === 0);
  check("modelo inexistente não quebra o formulário",
    run(`goalTemplateTarget(goalTemplateById("nao-existe"), state.data)`) === 0);

  // Sem histórico não há conta honesta a fazer, e alvo inventado é pior que
  // alvo em branco: o campo fica vazio de propósito.
  run(`state.data = migrate(defaultData());`);
  check("sem histórico de despesa o alvo fica vazio em vez de inventar número",
    run(`goalTemplateTarget(goalTemplateById("reserva"), state.data)`) === 0);
}

/* ------------------------------------------------------------------ F-16 */
function blocoF16() {
  section("F-16. O chip da categoria mostra o caminho, não troca o pai pelo filho");

  run(`state.data = migrate(defaultData()); state.tab = "add"; state.form = freshTxForm();`);
  const semFilho = run(`renderAddScreen()`);
  check("sem subcategoria escolhida o chip mostra só a categoria principal",
    /chip__label">Alimentação</.test(semFilho));

  run(`state.form = { ...state.form, categoryId: "mercado" };`);
  const comFilho = run(`renderAddScreen()`);
  check("com subcategoria escolhida o chip mostra o caminho inteiro",
    /chip__label">Alimentação › Mercado</.test(comFilho));
  // O defeito: o rótulo virava só "Mercado" e a fila de chips passava a
  // misturar dois níveis da taxonomia, "Moradia, Mercado, Transporte".
  check("o nome do filho não aparece sozinho no lugar do pai",
    !/chip__label">Mercado</.test(comFilho));
  check("os outros chips continuam sendo categorias principais",
    /chip__label">Moradia</.test(comFilho) && /chip__label">Transporte</.test(comFilho));
  // O ícone do filho já mudava antes e é o que confirma a escolha; preservar.
  check("o ícone continua sendo o da subcategoria escolhida",
    comFilho.includes(run(`svgIcon("cart", 17)`)));
  check("o separador é o mesmo já usado no resto do app",
    run(`categoryFullName(state.data, "mercado")`) === "Alimentação › Mercado");
}

/* ------------------------------------------------------------------ F-10 */
function blocoF10() {
  section("F-10. Botão desabilitado precisa dizer o que falta");

  check("o passo do aceite explica o bloqueio",
    /aceite/i.test(run(`onbBlockReason(1)`)), run(`onbBlockReason(1)`));
  check("o passo da renda também explica",
    run(`onbBlockReason(2)`).length > 0, run(`onbBlockReason(2)`));
  check("o passo da conta também explica",
    run(`onbBlockReason(3)`).length > 0, run(`onbBlockReason(3)`));
  // O último passo não trava, então inventar exigência ali seria pior que calar.
  check("o passo que não trava não inventa exigência",
    run(`onbBlockReason(4)`) === "");

  run(`state.onboarding = { ...freshOnboarding(), open: true, step: 1, legalAccepted: false };`);
  const travado = run(`renderOnboardingLayer()`);
  check("com o avanço travado a tela mostra o motivo",
    /id="onb-block-reason"/.test(travado));
  check("e o motivo é o aceite",
    /Marque o aceite/.test(travado));
  // O elo entre o botão morto e o motivo: sem ele o leitor de tela anuncia um
  // botão desabilitado e nada mais, que é o mesmo beco só que pior.
  check("o Continuar aponta para o motivo",
    /data-action="onb-next"[^>]*aria-describedby="onb-block-reason"/.test(travado));
  check("o Pular por agora também aponta",
    /data-action="onb-skip"[^>]*aria-describedby="onb-block-reason"/.test(travado));
  const trechoTravado = travado.slice(travado.indexOf("onb__block-hint"), travado.indexOf("onb__block-hint") + 130);
  check("e a linha está visível enquanto trava",
    !/hidden/.test(trechoTravado), trechoTravado);

  run(`state.onboarding = { ...freshOnboarding(), open: true, step: 1, legalAccepted: true };`);
  const livre = run(`renderOnboardingLayer()`);
  check("aceito, o Continuar deixa de ser descrito pela exigência",
    !/data-action="onb-next"[^>]*aria-describedby/.test(livre));
  check("aceito, o Pular por agora destrava",
    !/data-action="onb-skip"[^>]*disabled/.test(livre));
  const trechoLivre = livre.slice(livre.indexOf("onb__block-hint"), livre.indexOf("onb__block-hint") + 130);
  check("e a linha sai da tela em vez de contradizer o botão liberado",
    /hidden/.test(trechoLivre), trechoLivre);
}

/* ------------------------------------------------------------------ F-11 */
function blocoF11() {
  section("F-11. Landing e aplicativo são o mesmo produto");

  const landing = readSrc("landing.html");
  const app = readSrc("index.html");
  const manifest = JSON.parse(readSrc("manifest.webmanifest"));
  const tituloLanding = (landing.match(/<title>([^<]+)<\/title>/) || [])[1];
  const tituloApp = (app.match(/<title>([^<]+)<\/title>/) || [])[1];

  check("a landing continua sendo o Cofre", /^Cofre\b/.test(tituloLanding), tituloLanding);
  check("e o aplicativo passa a ser o mesmo nome", /^Cofre\b/.test(tituloApp), tituloApp);
  // O defeito: quem clicava em "Começar grátis" no Cofre chegava numa página
  // chamada "Finanças", que lê como outro produto e não como a mesma casa.
  check("os dois títulos coincidem", tituloLanding === tituloApp, [tituloLanding, tituloApp]);
  check("o manifesto instala o atalho com o nome certo",
    manifest.short_name === "Cofre" && /^Cofre\b/.test(manifest.name), [manifest.name, manifest.short_name]);
  check("o atalho do iOS também", /apple-mobile-web-app-title" content="Cofre"/.test(app));
  check("o cabeçalho da navegação diz Cofre",
    /side-nav__brand[\s\S]{0,140}<span>Cofre<\/span>/.test(readSrc("js/app.js")));
  check("e o cabeçalho do onboarding, que é a primeira tela vinda da landing",
    /onb__brand[^`]*<span>Cofre<\/span>/.test(readSrc("js/screens/onboarding.js")));
  check("a marca antiga não sobrou no aplicativo",
    !/Finanças \| Controle Financeiro Pessoal/.test(app + JSON.stringify(manifest)));
  // "Mestre das Finanças" é nome de conquista, uso comum da palavra, e não
  // pode ser confundido com marca por uma varredura preguiçosa.
  check("a palavra comum segue livre onde não é marca",
    /Mestre das Finanças/.test(readSrc("js/achievements.js")));
}

/* ------------------------------------------------------------------ F-12 */
function blocoF12() {
  section("F-12. Teto de sanidade para a quantia digitada");

  check("o teto é um número finito", Number.isFinite(run(`MONEY_MAX`)), run(`MONEY_MAX`));
  check("o valor exatamente no teto passa",
    run(`moneyWithinMax(999999999.99)`) === true);
  // O caso do relato: R$ 999.999.999.999 salvos faziam o seletor de conta
  // exibir "-R$ 1.000.000.001.063,26" e estourar a largura do controle.
  check("um bilhão não passa",
    run(`moneyWithinMax(1000000000)`) === false);
  check("o valor do relato não passa",
    run(`moneyWithinMax(999999999999)`) === false);
  check("o teto vale igual para o lado negativo",
    run(`moneyWithinMax(-1000000000)`) === false);
  // Saldo negativo é legítimo (conta no vermelho) e não pode ser barrado junto.
  check("saldo negativo dentro do teto continua válido",
    run(`moneyWithinMax(-5000)`) === true);
  check("valor não numérico não escapa pelo teto",
    run(`moneyWithinMax(NaN)`) === false && run(`moneyWithinMax("abc")`) === false);
  check("a mensagem diz o limite em reais, não só que é inválido",
    /R\$\s*999\.999\.999,99/.test(run(`moneyMaxMessage("Valor")`)), run(`moneyMaxMessage("Valor")`));

  // As entradas que GRAVAM registro precisam cobrar o teto; é por elas que o
  // número absurdo entrava no armazenamento e ia parar no seletor de conta.
  const acoes = readSrc("js/actions.js");
  check("o lançamento cobra o teto", /moneyWithinMax\(amt\)/.test(acoes));
  check("o saldo de abertura da conta cobra o teto", /moneyWithinMax\(openingBalance\)/.test(acoes));
  check("a conciliação cobra o teto", /moneyWithinMax\(actual\)/.test(acoes));
  check("a transferência cobra o teto", /moneyWithinMax\(amount\)/.test(acoes));
  check("o alvo da meta cobra o teto", /moneyWithinMax\(target\)/.test(acoes));
}

/* ------------------------------------------------------------------ F-13 */
function blocoF13() {
  section("F-13. Contraste mínimo de 4,5:1 no tema escuro");

  // WCAG 2.1 relative luminance. O teste calcula em vez de comparar string:
  // trocar o token e continuar passando é justamente o que não pode acontecer.
  const canalLinear = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminancia = (hex) => {
    const h = String(hex).replace("#", "");
    return 0.2126 * canalLinear(parseInt(h.slice(0, 2), 16))
      + 0.7152 * canalLinear(parseInt(h.slice(2, 4), 16))
      + 0.0722 * canalLinear(parseInt(h.slice(4, 6), 16));
  };
  const contraste = (a, b) => {
    const la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const baseCss = readSrc("css/base.css");
  const blocoEscuro = baseCss.slice(baseCss.indexOf('[data-theme="dark"]'));
  const tokenEscuro = (nome) => {
    const m = blocoEscuro.match(new RegExp(`--${nome}:\\s*(#[0-9A-Fa-f]{6})`));
    return m ? m[1] : null;
  };

  const fundoBadge = (readSrc("css/screens/notifications-onboarding.css")
    .match(/\[data-theme="dark"\]\s*\.notif-bell__badge\s*\{[^}]*background:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
  check("o badge do sino ganhou fundo próprio no tema escuro", !!fundoBadge, fundoBadge);
  check("e o branco em cima dele passa dos 4,5:1",
    !!fundoBadge && contraste("#FFFFFF", fundoBadge) >= 4.5,
    fundoBadge ? contraste("#FFFFFF", fundoBadge).toFixed(2) : null);
  // Controle negativo: sem a regra, o token cru reprovaria. Se algum dia o
  // --negative escurecer sozinho, este check avisa que a regra virou supérflua.
  check("o vermelho padrão do tema escuro de fato reprovaria sozinho",
    contraste("#FFFFFF", tokenEscuro("negative")) < 4.5,
    contraste("#FFFFFF", tokenEscuro("negative")).toFixed(2));

  const tokenPilula = (readSrc("css/screens/planning.css")
    .match(/\[data-theme="dark"\]\s*\.horizon-chip\.active\s*\{[^}]*color:\s*var\(--([\w-]+)\)/) || [])[1];
  check("a pílula do horizonte usa um token de texto no tema escuro", !!tokenPilula, tokenPilula);
  const corPilula = tokenPilula ? tokenEscuro(tokenPilula) : null;
  const fundoPilula = tokenEscuro("brand");
  check("e esse texto sobre o teal passa dos 4,5:1",
    !!corPilula && contraste(corPilula, fundoPilula) >= 4.5,
    corPilula ? `${corPilula} sobre ${fundoPilula} = ${contraste(corPilula, fundoPilula).toFixed(2)}` : null);
  check("o branco em cima do teal, que era o defeito, de fato reprovaria",
    contraste("#FFFFFF", fundoPilula) < 4.5,
    contraste("#FFFFFF", fundoPilula).toFixed(2));
}

/* ------------------------------------------------------------------ F-14 */
function blocoF14() {
  section("F-14. Alvo de toque de 44px no link de transparência");

  const css = readSrc("css/screens/transparency-assistant-sources.css");
  const alturas = [...css.matchAll(/\.calculation-link[^{]*\{[^}]*min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
  check("o link declara altura mínima em algum lugar", alturas.length > 0, alturas);
  // O defeito não era a regra base (já nascia em 44) e sim a media query que a
  // derrubava para 40 justamente na largura de celular, onde se toca com o dedo.
  check("nenhuma regra derruba a altura abaixo de 44px",
    alturas.every((h) => h >= 44), alturas);
}

/* ------------------------------------------------------------------ F-17 */
function blocoF17() {
  section("F-17. \"do último mês\" no lugar de \"dos últimos 1 mês\"");

  const plano = (meses) => run(`renderGoalsPlanCard(${JSON.stringify({
    plan: { commitment: 100, capacity: 500, feasible: true, capacityBasis: "historico", capacityMonths: meses, paceTotal: 0 },
  })})`);

  const um = plano(1);
  check("um mês de histórico vira singular com a preposição certa",
    /Sobra média do último mês com movimento/.test(um));
  // "dos últimos 1 mês" era o texto exato que aparecia na tela.
  check("e o \"últimos 1\" não sobra em lugar nenhum do cartão",
    !/últimos 1\b/.test(um), um.slice(0, 400));

  const tres = plano(3);
  check("mais de um mês continua no plural",
    /Sobra média dos últimos 3 meses com movimento/.test(tres));

  // A mesma frase quebrada existia em outras cinco telas; duas delas nem
  // tinham singular, e diziam "últimos 1 meses" e "últimos 1 dias".
  check("a correção alcançou a saúde financeira",
    /No último mês com movimento/.test(readSrc("js/health.js")));
  check("e os insights", /do último mês/.test(readSrc("js/screens/insights.js")));
  check("e a carteira", /No último mês/.test(readSrc("js/screens/portfolio.js")));
  check("e o patrimônio", /no último mês/.test(readSrc("js/screens/wealth.js")));
  check("e a projeção de gastos do mês", /do último dia/.test(readSrc("js/screens/analytics.js")));
}

// ------------------------------------------------------------------------------
// F-18. ENTRAR NA CONTA REABRIA O ASSISTENTE, E ISSO DUPLICAVA A CONTA DO BANCO
// ------------------------------------------------------------------------------
// Relatado no beta: "cadastrei uma conta de banco, mas duplicou na hora que fiz
// login". A causa não estava na sincronização, que funde por id e não duplica
// nada. Estava aqui: entrar numa conta abre um banco local NOVO e vazio, o
// aplicativo lia esse vazio como "primeiro uso" e o assistente de quatro passos
// tomava a tela inteira pedindo renda e conta do banco outra vez. O que a
// pessoa digitava nascia com id próprio, e a conta que descia da nuvem chegava
// em seguida: duas contas do mesmo banco, lado a lado.
function blocoF18() {
  section("F-18. Entrar na conta não pode reabrir o assistente");

  run(`state.data = migrate({ ...defaultData(), onboarding: { done: false, skipped: false, completedAt: null } });`);
  run(`state.onboarding = freshOnboarding(); state.onboarding.open = true; state.onboarding.held = false;`);

  run(`holdOnboardingGate();`);
  check("segurar fecha o assistente", run(`state.onboarding.open`) === false);
  check("e registra que a decisão ainda não saiu", run(`state.onboarding.held`) === true);

  // O caso do defeito: a descida traz o conteúdo da conta, e com ele a prova de
  // que a configuração já foi feita em outro aparelho.
  run(`state.onboarding.held = false; state.onboarding.open = true;`);
  run(`state.data = { ...state.data, onboarding: { done: true, skipped: false, completedAt: "2026-08-20" } };`);
  const fechou = run(`refreshOnboardingGate()`);
  check("dado que chega da conta fecha o assistente", fechou === true && run(`state.onboarding.open`) === false);

  // Negativo: sem liberação explícita, esta função NUNCA abre. Abrir a partir
  // de uma descida vazia é justamente o que recriava o defeito.
  run(`state.onboarding.open = false; state.onboarding.held = true;`);
  run(`state.data = { ...state.data, onboarding: { done: false, skipped: false, completedAt: null } };`);
  check("sem liberação, o portão não abre sozinho",
    run(`refreshOnboardingGate()`) === false && run(`state.onboarding.open`) === false);

  // Base de visitante mesmo vazia, e ninguém tocou no aplicativo ainda: aí sim
  // o assistente é o certo, e a liberação o abre.
  run(`state.appEmUso = false;`);
  check("liberado num aparelho novo e intocado, o assistente abre",
    run(`refreshOnboardingGate({ release: true })`) === true && run(`state.onboarding.open`) === true);

  // Liberar uma conta que já tem configuração não pode reabrir nada.
  run(`state.onboarding.open = false; state.onboarding.held = true;`);
  run(`state.data = { ...state.data, onboarding: { done: true, skipped: false, completedAt: "2026-08-20" } };`);
  check("liberar não reabre onde a configuração já existe",
    run(`refreshOnboardingGate({ release: true })`) === false && run(`state.onboarding.open`) === false);

  // Os quatro pontos onde o portão precisa estar preso ao ciclo de vida da conta.
  const auth = readSrc("js/auth.js");
  check("trocar para o escopo de uma conta segura o assistente",
    /escopo !== GUEST_SCOPE\) holdOnboardingGate\(\)/.test(auth));
  check("o fim do vínculo é quem libera",
    /finishAccountBootstrapAndGate[\s\S]{0,200}refreshOnboardingGate\(\{ release: true \}\)/.test(auth));
  check("abrir o app já dentro de uma conta também segura",
    /scope\(\) !== GUEST_SCOPE\) holdOnboardingGate\(\)/.test(readSrc("js/app.js")));
  check("o que desce da nuvem reavalia o portão",
    /setDataFromRemote[\s\S]{0,400}refreshOnboardingGate\(\)/.test(readSrc("js/app.js")));

  // A outra metade do defeito: não havia como entrar numa conta existente sem
  // antes inventar renda e conta do banco, porque o assistente cobria tudo.
  run(`state.onboarding = freshOnboarding(); state.onboarding.open = true; state.onboarding.legalAccepted = true;`);
  const camada = run(`renderOnboardingLayer()`);
  check("o assistente oferece a entrada na conta", /data-action="onb-have-account"/.test(camada));
  check("com rótulo que diz o que faz", /Já tenho conta/.test(camada));
  check("a ação está ligada no despachante",
    /case "onb-have-account": openAccountFromOnboarding\(\);/.test(readSrc("js/actions.js")));

  // Entrar na conta não pode gravar configuração nenhuma: se gravasse, a base
  // de visitante passaria a contar como conteúdo e toda entrada exigiria a
  // confirmação de "juntar dados".
  const fonteOnb = readSrc("js/screens/onboarding.js");
  const corpo = fonteOnb.slice(fonteOnb.indexOf("function openAccountFromOnboarding"));
  check("entrar na conta grava só o aceite legal",
    /privacy: acceptLegalTexts/.test(corpo.slice(0, 600)) && !/onboarding: \{ done: true/.test(corpo.slice(0, 600)));

  run(`state.onboarding = freshOnboarding(); state.appEmUso = false;`);
}

// ------------------------------------------------------------------------------
// F-20. O CONSERTO DO F-18 CRIOU UM DEFEITO PIOR: O ASSISTENTE SEQUESTRAVA A TELA
// ------------------------------------------------------------------------------
// Relatado no beta, com vídeo. A liberação do portão espera
// `finishAccountBootstrap`, que roda um ciclo de sincronização inteiro: uma ida
// e volta na rede. Quem entrava numa conta ainda vazia via o painel carregar,
// navegava para Início, e DOIS SEGUNDOS DEPOIS o assistente aparecia por cima,
// sem nenhum clique, como se o aplicativo tivesse esquecido que a pessoa
// acabara de entrar e sincronizar.
function blocoF20() {
  section("F-20. O assistente não pode tomar uma tela que já está em uso");

  const semConfig = `state.data = migrate({ ...defaultData(),
    onboarding: { done: false, skipped: false, completedAt: null } });`;

  // 1. O caso do vídeo: a pessoa já mexeu no aplicativo quando a rede responde.
  run(semConfig);
  run(`state.onboarding = freshOnboarding(); state.appEmUso = false;`);
  run(`holdOnboardingGate();`);
  run(`marcarAppEmUso();`);
  check("depois de a pessoa usar o app, a liberação não abre nada",
    run(`refreshOnboardingGate({ release: true })`) === false && run(`state.onboarding.open`) === false);

  // Negativo do mesmo caso: sem o toque, a mesma liberação abre.
  run(`state.appEmUso = false; state.onboarding = freshOnboarding(); holdOnboardingGate();`);
  check("e sem ninguém ter tocado, ela continua abrindo",
    run(`refreshOnboardingGate({ release: true })`) === true && run(`state.onboarding.open`) === true);

  // 2. Um clique em qualquer lugar do app marca a tela como em uso. É o clique
  //    do vídeo, no item "Início" do menu lateral.
  run(`state.appEmUso = false;`);
  run(`onClick({ target: { closest: (sel) => (sel === "[data-action]"
    ? { dataset: { action: "nav", value: "dashboard" }, classList: { contains: () => false } } : null) } });`);
  check("um clique qualquer registra que a tela é da pessoa", run(`state.appEmUso`) === true);

  // 3. O assistente é a primeira execução DO APARELHO, não DA CONTA. Dentro de
  //    uma conta ele não abre nem com o app recém-aberto, porque o banco local
  //    da conta pode estar vazio só porque a descida ainda não veio.
  const fonte = readSrc("js/screens/onboarding.js");
  check("a regra exige banco de visitante para abrir",
    /podeAbrir = liberar && !state\.appEmUso[\s\S]{0,140}FinanceStore\.scope\(\) === GUEST_SCOPE/.test(fonte));
  check("e exige que ninguém tenha tocado no app", /!state\.appEmUso/.test(fonte));
  check("os dois ouvintes da raiz marcam o uso",
    /marcarAppEmUso\(\)/.test(readSrc("js/actions.js")) && /marcarAppEmUso\(\)/.test(readSrc("js/app.js")));

  // 4. Fechar continua livre: dado que chega da conta prova que a configuração
  //    já foi feita, e isso vale a qualquer momento.
  run(`state.onboarding = freshOnboarding(); state.onboarding.open = true; state.appEmUso = true;`);
  run(`state.data = { ...state.data, onboarding: { done: true, skipped: false, completedAt: "2026-08-20" } };`);
  check("mesmo com o app em uso, o dado da conta ainda fecha o assistente",
    run(`refreshOnboardingGate()`) === true && run(`state.onboarding.open`) === false);

  run(`state.onboarding = freshOnboarding(); state.appEmUso = false;`);
}

// ------------------------------------------------------------------------------
// F-19. NÃO EXISTIA COMO APAGAR UMA CONTA DO BANCO NEM UM CARTÃO
// ------------------------------------------------------------------------------
// Arquivar era a única saída, e ela mantém o registro na tela, no total de
// contas e no seletor de conciliação. Quem terminou com um cadastro duplicado
// (ver F-18) não tinha nenhuma forma de desfazer.
function blocoF19() {
  section("F-19. Excluir conta do banco e cartão");

  const base = `state.data = migrate({ ...defaultData(),
    accounts: [
      { id: "acc-um", name: "Nubank", type: "digital", openingBalance: 1000, openingDate: "2026-08-01", color: "#0B6B5C" },
      { id: "acc-dois", name: "Itau", type: "corrente", openingBalance: 500, openingDate: "2026-08-01", color: "#3C6E8F" },
    ],
    creditCards: [{ id: "card-um", name: "Nubank Roxinho", accountId: "acc-um", limit: 2000, closingDay: 20, dueDay: 28, color: "#7B4BC4" }],
    transactions: [
      { id: "tx-conta", type: "expense", amount: 100, categoryId: "mercado", date: "2026-08-10", accountId: "acc-um" },
      { id: "tx-cartao", type: "expense", amount: 60, categoryId: "lazer", date: "2026-08-10", creditCardId: "card-um" },
      { id: "tx-outra", type: "expense", amount: 30, categoryId: "lazer", date: "2026-08-10", accountId: "acc-dois" },
    ],
    accountTransfers: [{ id: "tr-um", fromAccountId: "acc-um", toAccountId: "acc-dois", amount: 50, date: "2026-08-11" }],
    cardPayments: [{ id: "pg-um", accountId: "acc-um", creditCardId: "card-um", amount: 60, statementKey: "2026-09", date: "2026-08-12" }],
    accountAdjustments: [{ id: "aj-um", accountId: "acc-um", amount: 5, date: "2026-08-13" }],
  });`;

  run(base);
  const impacto = run(`accountDeletionImpact(state.data, "acc-um")`);
  check("o impacto conta o que está pendurado na conta",
    impacto.transactions === 1 && impacto.transfers === 1 && impacto.payments === 1
    && impacto.adjustments === 1 && impacto.cards === 1, impacto);
  check("e uma base sem contas tem impacto zero",
    run(`accountDeletionImpact(migrate(defaultData()), "acc-um")`).total === 0);

  run(`state.data = migrate(removeAccountWithIntegrity(state.data, "acc-um"));`);
  check("a conta sai da lista", run(`(state.data.accounts || []).some((a) => a.id === "acc-um")`) === false);
  check("a outra conta continua intacta", run(`(state.data.accounts || []).some((a) => a.id === "acc-dois")`) === true);
  check("o lançamento continua no histórico, sem conta",
    run(`state.data.transactions.some((t) => t.id === "tx-conta")`) === true
    && run(`(state.data.transactions.find((t) => t.id === "tx-conta") || {}).accountId`) == null);
  check("o cartão continua existindo, sem conta de pagamento",
    run(`state.data.creditCards.some((c) => c.id === "card-um")`) === true
    && run(`(state.data.creditCards.find((c) => c.id === "card-um") || {}).accountId`) == null);
  check("transferência, pagamento e conciliação saem junto",
    run(`state.data.accountTransfers.length`) === 0 && run(`state.data.cardPayments.length`) === 0
    && run(`state.data.accountAdjustments.length`) === 0);
  check("a exclusão da conta deixa lápide", !!run(`state.data.graveyard.accounts["acc-um"]`));
  check("e os dependentes também, senão o outro aparelho os devolve",
    !!run(`state.data.graveyard.accountTransfers["tr-um"]`)
    && !!run(`state.data.graveyard.cardPayments["pg-um"]`)
    && !!run(`state.data.graveyard.accountAdjustments["aj-um"]`));

  // A lápide precisa valer na mesclagem, senão a conta volta no próximo backup
  // restaurado ou no vínculo dos dados de visitante.
  run(`__antes = state.data;`);
  // O backup carrega a data ORIGINAL do registro. A regra da lápide diz que um
  // registro só ressuscita se foi editado DEPOIS da exclusão; um arquivo antigo
  // não foi, e por isso a conta tem de continuar apagada.
  run(`__voltou = mergeBackupInto(__antes, migrate({ ...defaultData(),
    accounts: [{ id: "acc-um", name: "Nubank", type: "digital", openingBalance: 1000, openingDate: "2026-08-01",
      color: "#0B6B5C", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" }] }));`);
  check("mesclar um backup antigo não ressuscita a conta excluída",
    run(`__voltou.data.accounts.some((a) => a.id === "acc-um")`) === false);
  // E o contrário também precisa valer: editar a conta em outro aparelho DEPOIS
  // da exclusão ganha da lápide, senão uma exclusão antiga apagaria trabalho novo.
  run(`__editada = mergeBackupInto(__antes, migrate({ ...defaultData(),
    accounts: [{ id: "acc-um", name: "Nubank", type: "digital", openingBalance: 1000, openingDate: "2026-08-01",
      color: "#0B6B5C", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2099-01-01T10:00:00.000Z" }] }));`);
  check("mas uma edição posterior à exclusão continua ganhando",
    run(`__editada.data.accounts.some((a) => a.id === "acc-um")`) === true);

  // Cartão.
  run(base);
  const impactoCartao = run(`cardDeletionImpact(state.data, "card-um")`);
  check("o impacto do cartão conta compras e pagamentos",
    impactoCartao.transactions === 1 && impactoCartao.payments === 1, impactoCartao);
  run(`state.data = migrate(removeCreditCardWithIntegrity(state.data, "card-um"));`);
  check("o cartão sai da lista", run(`state.data.creditCards.length`) === 0);
  check("a compra continua no histórico, sem cartão",
    run(`state.data.transactions.some((t) => t.id === "tx-cartao")`) === true
    && run(`(state.data.transactions.find((t) => t.id === "tx-cartao") || {}).creditCardId`) == null);
  check("o pagamento da fatura sai com lápide",
    run(`state.data.cardPayments.length`) === 0 && !!run(`state.data.graveyard.cardPayments["pg-um"]`));
  check("a conta do banco não é afetada pela exclusão do cartão",
    run(`state.data.accounts.length`) === 2);

  // A confirmação precisa dizer, em número, o que vai acontecer.
  run(base);
  const clique = (acao, id) => run(`onClick({ target: { closest: (sel) => (sel === "[data-action]"
    ? { dataset: { action: ${JSON.stringify(acao)}, id: ${JSON.stringify(id)} }, classList: { contains: () => false } } : null) } });`);
  clique("account-delete", "acc-um");
  const caixa = run(`state.confirmation`);
  check("excluir conta pede confirmação antes", !!caixa && caixa.tone === "danger", caixa && caixa.title);
  check("a confirmação nomeia a conta", /Nubank/.test((caixa || {}).message || ""));
  check("e diz o que acontece com o histórico",
    /histórico sem conta/.test((caixa || {}).message || ""), (caixa || {}).message);
  check("e avisa que as faturas pagas voltam a aparecer",
    /voltam a aparecer em aberto/.test((caixa || {}).message || ""));
  check("arquivar continua oferecido na mesma caixa", (caixa || {}).alternateLabel === "Só arquivar");
  run(`state.confirmation.onConfirm();`);
  check("confirmar exclui de verdade", run(`state.data.accounts.some((a) => a.id === "acc-um")`) === false);

  run(base);
  clique("card-delete", "card-um");
  const caixaCartao = run(`state.confirmation`);
  check("excluir cartão pede confirmação antes", !!caixaCartao && caixaCartao.tone === "danger");
  check("a confirmação do cartão explica o efeito no saldo",
    /passa a sair do saldo em contas/.test((caixaCartao || {}).message || ""), (caixaCartao || {}).message);
  run(`state.confirmation = null;`);

  // E os botões precisam existir na tela, senão nada disso é alcançável.
  run(base);
  const tela = run(`renderAccountsScreen()`);
  check("a linha da conta tem o botão de excluir", /data-action="account-delete"/.test(tela));
  check("o cartão também", /data-action="card-delete"/.test(tela));
  check("com rótulo acessível", /aria-label="Excluir Nubank"/.test(tela));
  check("e arquivar continua disponível", /data-action="account-archive"/.test(tela));
}

/* ------------------------------------------------------------------ F-21 */
// A TELA SUBIA SOZINHA A CADA TECLA.
//
// `render()` troca o `innerHTML` do app inteiro e devolve o foco ao campo
// recriado. O foco sem `preventScroll` arrasta a janela até o elemento, e uma
// folha modal refeita nasce com `scrollTop` zero. Juntos, os dois jogavam a
// pessoa para o topo enquanto ela digitava o nome de uma categoria.
function blocoF21() {
  section("F-21. Redesenhar a mesma tela não pode jogar a rolagem para o topo");
  const fonte = readSrc("js/app.js");
  check("o foco volta sem arrastar a rolagem",
    /el\.focus\(\{ preventScroll: true \}\)/.test(fonte));
  check("navegador antigo, sem a opção, continua recebendo o foco",
    /catch \(e\) \{ el\.focus\(\); \}/.test(fonte));

  // ---- A chave visual: o que conta como "a mesma tela" ----
  run(`state.data = migrate(defaultData()); state.tab = "categories"; state.booting = false;`);
  run(`state.categoriesUi.editor = freshCategoryEditor({ name: "Merc" });`);
  const editorAntes = run(`renderSurfaceKey()`);
  run(`state.categoriesUi.editor.name = "Mercado";`);
  check("digitar no editor de categoria continua sendo a mesma tela",
    run(`renderSurfaceKey()`) === editorAntes, [editorAntes, run(`renderSurfaceKey()`)]);
  run(`state.categoriesUi.editor = null;`);
  check("fechar a folha do editor muda a tela desenhada",
    run(`renderSurfaceKey()`) !== editorAntes);
  const abaAntes = run(`renderSurfaceKey()`);
  run(`state.tab = "dashboard";`);
  check("trocar de aba muda a tela desenhada", run(`renderSurfaceKey()`) !== abaAntes);
  run(`state.onboarding.open = true; state.onboarding.step = 2;`);
  const passoAntes = run(`renderSurfaceKey()`);
  run(`state.onboarding.step = 3;`);
  check("avançar o onboarding muda a tela desenhada",
    run(`renderSurfaceKey()`) !== passoAntes);
  run(`state.onboarding.open = false; state.onboarding.step = 1;`);

  // ---- O comportamento, com um DOM que registra o que foi rolado ----
  const documentoOriginal = ctx.document;
  const scrollToOriginal = ctx.scrollTo;
  const rolagens = [];
  // Dois contêineres, porque preservar só o de fora era metade do defeito: a
  // folha modal rola, e a grade de ícones dentro dela rola por conta própria.
  let folha = fakeEl("div");
  let grade = fakeEl("div");
  folha.scrollTop = 220;
  grade.scrollTop = 96;
  const raiz = fakeEl("div");
  let html = "";
  // Trocar o `innerHTML` é o que destrói os dois: os novos nascem no topo,
  // exatamente como no navegador.
  Object.defineProperty(raiz, "innerHTML", {
    get() { return html; },
    set(valor) {
      html = valor;
      folha = fakeEl("div"); folha.scrollTop = 0;
      grade = fakeEl("div"); grade.scrollTop = 0;
    },
  });
  const campo = fakeEl("input");
  campo.id = "cat-editor-name-input";
  ctx.document = Object.assign(Object.create(null), documentoOriginal, {
    getElementById: (id) => (id === "app" ? raiz : (id === campo.id ? campo : null)),
    querySelector: () => null,
    // A ordem é a chave usada por `restoreScrollSnapshot`; o DOM devolve os
    // contêineres na ordem do documento, e a folha vem antes da grade.
    querySelectorAll: (sel) => (sel === run("SCROLL_CONTAINERS") ? [folha, grade] : []),
    activeElement: campo,
  });
  ctx.scrollTo = (x, y) => rolagens.push([x, y]);
  ctx.scrollX = 0;
  ctx.scrollY = 0;

  run(`state.tab = "categories"; state.categoriesUi.editor = freshCategoryEditor({ name: "Merc" });`);
  run(`render()`);                    // primeiro desenho desta tela: nada a herdar
  check("abrir a tela não repõe rolagem nenhuma", rolagens.length === 0, rolagens);

  ctx.scrollY = 380;
  folha.scrollTop = 220;
  grade.scrollTop = 96;
  run(`state.categoriesUi.editor.name = "Mercado";`);
  run(`render()`);
  // A posição é reposta duas vezes de propósito: depois do HTML novo e outra vez
  // depois do foco, para o caso de o navegador não conhecer `preventScroll`.
  check("a mesma tela redesenhada volta para onde estava",
    rolagens.length > 0 && rolagens.every(([x, y]) => x === 0 && y === 380), rolagens);
  check("a folha modal recriada também volta para onde estava",
    folha.scrollTop === 220, folha.scrollTop);
  check("a grade de ícones, que rola por dentro, também volta",
    grade.scrollTop === 96, grade.scrollTop);

  // Navegar é outra coisa: a tela nova começa onde o navegador quiser.
  const antesDaNavegacao = rolagens.length;
  run(`state.categoriesUi.editor = null; state.tab = "dashboard";`);
  run(`render()`);
  check("navegar para outra aba não herda a rolagem anterior",
    rolagens.length === antesDaNavegacao, rolagens.slice(antesDaNavegacao));

  // E uma rolagem pedida de propósito continua tendo prioridade.
  run(`render()`);                    // segunda vez na mesma aba: herdaria
  const antesDoReveal = rolagens.length;
  run(`state.revealTarget = "wealth-form";`);
  run(`render()`);
  check("revealTarget não herda a rolagem antiga",
    rolagens.length === antesDoReveal, rolagens.slice(antesDoReveal));
  run(`state.revealTarget = null;`);

  // A LISTA DE CONTÊINERES TEM DE ACOMPANHAR O CSS.
  //
  // Quem criar amanhã um bloco com rolagem própria não vai lembrar de avisar o
  // `render()`. Este teste lê o CSS entregue, encontra todo mundo que rola e
  // exige que a lista de `SCROLL_CONTAINERS` cubra cada um; a saída de emergência
  // é marcar o elemento com `data-scroll-keep` no HTML.
  const lista = run("SCROLL_CONTAINERS");
  const cssDoApp = ["css/components.css", "css/base.css", "css/layout.css", "css/utilities.css"]
    .concat(fs.readdirSync(path.join(ROOT, "css", "screens")).map((nome) => `css/screens/${nome}`))
    .map((arquivo) => readSrc(arquivo)).join("\n");
  const roláveis = Array.from(cssDoApp.matchAll(/([^{}]+)\{([^}]*overflow(?:-y)?:\s*(?:auto|scroll)[^}]*)\}/g))
    .map((achado) => achado[1].split(",").map((parte) => parte.trim()).filter(Boolean))
    .reduce((todos, parte) => todos.concat(parte), [])
    .filter((seletor) => seletor.startsWith(".") && !seletor.includes(":"));
  const descobertos = Array.from(new Set(roláveis));
  const faltando = descobertos.filter((seletor) => !lista.includes(seletor));
  check("todo bloco com rolagem própria está na lista preservada",
    faltando.length === 0, faltando);
  check("a lista encontrou blocos de verdade no CSS", descobertos.length >= 5, descobertos);

  ctx.document = documentoOriginal;
  ctx.scrollTo = scrollToOriginal;
  delete ctx.scrollX;
  delete ctx.scrollY;
  run(`state.tab = "dashboard"; state.categoriesUi.editor = null;`);
}

async function main() {
  blocoF01();
  blocoF02();
  await blocoF03();
  blocoF04();
  blocoF05();
  blocoF07();
  blocoF08();
  blocoF09();
  blocoF10();
  blocoF11();
  blocoF12();
  blocoF13();
  blocoF14();
  blocoF15();
  blocoF16();
  blocoF17();
  blocoF18();
  blocoF20();
  blocoF19();
  blocoF21();
  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Erro inesperado na suíte:", error);
  process.exit(1);
});
