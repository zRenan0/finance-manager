// test-xss-surface.js — [M4] superfície de XSS e entradas não confiáveis.
//
// O QUE ESTE ARQUIVO DEFENDE, E POR QUE ELE EXISTE.
//
// A auditoria do M4 não encontrou injeção explorável. Encontrou uma DEFESA EM
// DUAS CAMADAS que funciona e que nada garantia que continuaria funcionando:
//
//   1. NORMALIZAÇÃO NA BORDA (js/storage.js). Todo dado que entra — backup
//      restaurado, operação baixada da nuvem, extrato importado — passa por
//      `migrate()`, e lá cada campo que a interface interpola sem escapar tem
//      um normalizador com alfabeto fechado: `normalizeRecordId`,
//      `normalizeHexColor`, `normalizeIconName`, `ACCOUNT_TYPES.includes`,
//      `BUDGET_GROUPS.includes`, `isRealIsoDate`.
//   2. ESCAPE NO RENDER (js/utils.js `escapeHtml`, 350+ chamadas nas telas).
//
// As duas juntas explicam por que `data-ui-css="--account-color: ${a.color}"`
// não é uma quebra de atributo esperando acontecer: `a.color` só existe em
// `#RRGGBB`. A camada 1 é invisível para quem lê a tela, e é exatamente a que
// se perde numa refatoração inocente — alguém troca `normalizeHexColor` por
// `String(a.color)` para aceitar `rgb()`, e três telas viram injeção de
// atributo de uma vez. Este arquivo existe para que essa troca reprove aqui.
//
// Ele NÃO tenta provar que o app é seguro. Ele congela as invariantes que a
// auditoria conferiu uma a uma, e falha quando alguma delas cair.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0;
let fail = 0;
function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : ` → ${extra}`}`); }
}

// Fontes do app (sem o módulo gerado, que é cópia de todas elas).
function listaFontes() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".js")) continue;
      if (entry.name === "app.generated.js") continue;
      out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  })(path.join(ROOT, "js"));
  return out.sort();
}
const FONTES = listaFontes();

// ==============================================================================
console.log("\n1. Sinks proibidos");
// ==============================================================================
// `eval` e companhia não aparecem em lugar nenhum hoje, e a política de conteúdo
// em produção já não traz `unsafe-eval`. Quem reintroduzir um deles descobre
// aqui, e não no navegador do usuário.
const PROIBIDOS = [
  [/\beval\s*\(/, "eval("],
  [/\bnew\s+Function\s*\(/, "new Function("],
  [/document\.write\b/, "document.write"],
  [/insertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bsrcdoc\b/, "srcdoc"],
  [/setAttribute\(\s*["'`]on/i, "setAttribute('on...')"],
  [/\bjavascript:/i, "URL javascript:"],
];
for (const [regex, rotulo] of PROIBIDOS) {
  const culpados = FONTES.filter((f) => regex.test(readSrc(f)));
  check(`nenhuma fonte usa ${rotulo}`, culpados.length === 0, culpados.join(", "));
}

// ==============================================================================
console.log("\n2. Inventário de sinks de HTML");
// ==============================================================================
// A lista abaixo é o resultado da varredura do M4: são os ÚNICOS pontos em que
// o app entrega HTML montado a mão ao navegador. Cada um foi conferido:
//
//   js/app.js:903,2223       `renderShell()` — raiz do render; tudo abaixo é
//                            template das telas, todas com escapeHtml.
//   js/app.js:1074           dois <input type="file"> fixos, sem interpolação.
//   js/modules/bootstrap.js  tela de falha de carga, HTML constante.
//   js/screens/add.js        avisos e histórico do formulário, escapados.
//   js/screens/import.js     linha e resumo da revisão de importação, escapados.
//
// Um sink NOVO é a única forma barata de reintroduzir XSS num app que já
// escapa em todo lugar; por isso o teste é sobre a CONTAGEM POR ARQUIVO, e
// obriga quem adiciona um a passar por aqui e justificar.
const SINKS_ESPERADOS = {
  "js/app.js": 3,
  "js/modules/bootstrap.js": 1,
  "js/screens/add.js": 2,
  "js/screens/import.js": 3,
};
const SINK_RE = /\.(innerHTML|outerHTML)\s*=/g;
const sinksAchados = {};
for (const f of FONTES) {
  const n = (readSrc(f).match(SINK_RE) || []).length;
  if (n) sinksAchados[f] = n;
}
check("nenhum arquivo novo escreve HTML direto no DOM",
  Object.keys(sinksAchados).every((f) => SINKS_ESPERADOS[f] != null),
  Object.keys(sinksAchados).filter((f) => SINKS_ESPERADOS[f] == null).join(", ") || "-");
for (const [f, esperado] of Object.entries(SINKS_ESPERADOS)) {
  check(`${f} mantém ${esperado} ponto(s) de HTML`, sinksAchados[f] === esperado,
    `achou ${sinksAchados[f] == null ? 0 : sinksAchados[f]}`);
}

// ==============================================================================
// Contexto de execução: o app inteiro numa VM com um DOM mínimo.
// (mesma montagem de tests/test-render.js)
// ==============================================================================
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
const documentStub = {
  documentElement: fakeEl(), body: fakeEl(),
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
  setTimeout: (fn, ms) => (ms ? setTimeout(fn, ms) : 0), clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0, requestIdleCallback: undefined,
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

const SCREEN_FILES = [
  "js/screens/_shared.js", "js/screens/onboarding.js", "js/screens/dashboard.js",
  "js/screens/accounts.js", "js/screens/debts.js", "js/screens/add.js",
  "js/screens/analytics.js", "js/screens/goals.js", "js/screens/calendar.js",
  "js/screens/health.js", "js/screens/wealth.js", "js/screens/portfolio.js",
  "js/screens/invest.js", "js/screens/simulators.js", "js/screens/simulate.js",
  "js/screens/insights.js", "js/screens/subscriptions.js", "js/screens/notifications.js",
  "js/screens/achievements.js", "js/screens/import.js", "js/screens/all.js",
  "js/screens/rules.js", "js/screens/categories.js", "js/screens/settings.js",
  "js/screens/privacy.js", "js/screens/account.js", "js/screens/modals.js",
];
[
  "js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js", "js/layout.js",
  "js/safe-errors.js", "js/storage.js", "js/accounts.js", "js/movements.js", "js/data-sources.js",
  "js/debts.js", "js/budgets.js", "js/charts.js", "js/import.js", "js/nlp.js", "js/score.js",
  "js/metrics.js", "js/health.js", "js/wealth.js", "js/goals.js", "js/forecast.js",
  "js/transparency.js", "js/calendar.js", "js/recurring.js", "js/analytics.js", "js/insights.js",
  "js/assistant.js", "js/contextual-assistant.js", "js/advisor.js", "js/investments.js",
  "js/portfolio.js", "js/simulators.js", "js/qrcode.js", "js/achievements.js", "js/wrapped.js",
  "js/services.js", "js/auth.js", "js/cloud-sync.js",
].concat(SCREEN_FILES).concat(["js/actions.js", "js/app.js"])
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const call = (fn, ...args) => { ctx.__args = args; return run(`${fn}(...__args)`); };

// A carga usada em todos os testes de dado hostil, e o critério de vazamento.
//
// A MARCA PRECISA SER ÚNICA, SENÃO O TESTE ACUSA O PRÓPRIO APP.
//
// A primeira versão deste arquivo procurava `onerror=` e `"><` no HTML final.
// Os dois reprovavam por engano: `onerror=` continua aparecendo como TEXTO
// depois de escapado (`&lt;img src=x onerror=alert(1)&gt;` é inofensivo e
// contém a palavra), e `"><` casa com qualquer `<path .../><line ...>` dos
// ícones SVG. Ambas as marcas abaixo são inventadas e não existem em lugar
// nenhum do app, então elas só aparecem na forma procurada se a carga tiver
// mesmo escapado do contexto:
//
//   `<xssprobe`  → só existe se um `<` da carga chegou cru (abertura de tag);
//   `" xssattr`  → só existe se uma aspa da carga chegou crua (quebra de atributo).
const CARGA = `"><xssprobe onx=1>`;
const CARGA_CSS = `#fff" xssattr=1`;
const VAZAMENTOS = [/<xssprobe/i, /" xssattr/i, /<script\b/i];
function semVazamento(html) {
  return VAZAMENTOS.every((re) => !re.test(html));
}
// Uma carga que escapa do contexto costuma desbalancear a árvore antes de
// qualquer outra coisa; a contagem é grosseira de propósito, e é barata.
function divsBalanceadas(html) {
  return (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length;
}

// ==============================================================================
console.log("\n3. escapeHtml");
// ==============================================================================
check("escapa os cinco caracteres de saída de contexto",
  call("escapeHtml", `&<>"'`) === "&amp;&lt;&gt;&quot;&#39;");
check("a carga de teste deixa de ser marcação", semVazamento(call("escapeHtml", CARGA)));
check("nulo vira string vazia, não a palavra null", call("escapeHtml", null) === "");
check("número atravessa inteiro", call("escapeHtml", 12.5) === "12.5");

// ==============================================================================
console.log("\n4. Normalizadores de borda (a camada invisível)");
// ==============================================================================
// Cada um destes é interpolado SEM escape em pelo menos um template de tela.
// A segurança deles é o alfabeto fechado, não o escape.
check("cor só existe em #RRGGBB", call("normalizeHexColor", CARGA_CSS, "#0B6B5C") === "#0B6B5C");
check("cor válida é preservada (e normalizada)", call("normalizeHexColor", "#0b6b5c", "#000000") === "#0B6B5C");
check("cor com função CSS é recusada", call("normalizeHexColor", "rgb(0,0,0)", "#0B6B5C") === "#0B6B5C");
check("id hostil perde aspas e sinais de tag",
  !/[<>"'` ]/.test(call("normalizeRecordId", CARGA, "tx")));
check("id legítimo atravessa sem mudança", call("normalizeRecordId", "conta-principal", "account") === "conta-principal");
check("id vazio ganha um id novo, não string vazia", String(call("normalizeRecordId", "", "tx")).length > 0);
check("nome de ícone hostil cai no padrão", call("normalizeIconName", "<img>", "tag") === "tag");
check("nome de ícone legítimo atravessa", call("normalizeIconName", "trendUp", "tag") === "trendUp");
check("tipo de conta é whitelist fechada", run(`ACCOUNT_TYPES.length`) === 5 && run(`ACCOUNT_TYPES.includes("outro")`));
check("grupo de orçamento é whitelist fechada", run(`BUDGET_GROUPS.length`) === 3);

// ==============================================================================
console.log("\n5. migrate() com um backup hostil");
// ==============================================================================
// A restauração aceita QUALQUER JSON de 32 MB. É a maior entrada não confiável
// do app, e a única que o usuário abre por vontade própria achando que é dele.
ctx.__hostil = {
  version: 22,
  userName: CARGA,
  categories: [{ id: CARGA, name: CARGA, color: CARGA_CSS, icon: `<script>`, group: `"><b>`, parentId: CARGA }],
  accounts: [{ id: CARGA, name: CARGA, type: CARGA, color: CARGA_CSS, openingDate: CARGA, openingBalance: "x" }],
  creditCards: [{ id: CARGA, name: CARGA, color: CARGA_CSS, closingDay: CARGA, dueDay: CARGA }],
  transactions: [{ id: CARGA, type: CARGA, amount: "1", date: CARGA, description: CARGA, categoryId: CARGA, payment: CARGA }],
  goals: [{ id: CARGA, name: CARGA, target: 10, current: 1, deadline: CARGA, icon: `"><img>` }],
  assets: [{ id: CARGA, name: CARGA, class: CARGA, value: 1 }],
};
const limpo = run("migrate(__hostil)");
const campoSujo = (valor) => typeof valor === "string" && /[<>"]/.test(valor);
check("nenhum id sobrevive com marcação",
  ["categories", "accounts", "creditCards", "transactions", "goals", "assets"]
    .every((k) => (limpo[k] || []).every((r) => !campoSujo(r.id))));
check("nenhuma cor sobrevive com marcação",
  ["categories", "accounts", "creditCards"]
    .every((k) => (limpo[k] || []).every((r) => r.color == null || /^#[0-9A-F]{6}$/.test(r.color))));
check("nenhum ícone sobrevive com marcação",
  (limpo.categories || []).every((c) => !campoSujo(c.icon)));
check("tipo de conta caiu na whitelist",
  (limpo.accounts || []).every((a) => run(`ACCOUNT_TYPES`).includes(a.type)));
check("grupo de categoria caiu na whitelist",
  (limpo.categories || []).every((c) => run(`BUDGET_GROUPS`).includes(c.group)));
check("data hostil virou data real",
  (limpo.accounts || []).every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.openingDate))
  && (limpo.transactions || []).every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));
check("dia de fechamento e vencimento viraram número no intervalo",
  (limpo.creditCards || []).every((c) => c.closingDay >= 1 && c.closingDay <= 31 && c.dueDay >= 1 && c.dueDay <= 31));
// A descrição PODE conter marcação — é texto livre do usuário, e apagá-la seria
// perder dado. O contrato dela é outro: sai escapada no render (bloco 6).
check("a descrição continua sendo texto livre preservado",
  (limpo.transactions || []).some((t) => String(t.description).includes("<xssprobe")),
  JSON.stringify((limpo.transactions || []).map((t) => t.description)));

// ==============================================================================
console.log("\n6. Render com dados hostis");
// ==============================================================================
// O que a camada 1 deixa passar (texto livre) a camada 2 precisa escapar.
ctx.__d = limpo;
run("state.data = __d; state.monthOffset = 0; state.tab = 'dashboard';");
const TELAS = [
  ["Início", "renderDashboardScreen"],
  ["Contas e cartões", "renderAccountsScreen"],
  ["Categorias", "renderCategoriesScreen"],
  ["Movimentos", "renderAnalyticsScreen"],
  ["Metas", "renderGoalsScreen"],
  ["Patrimônio", "renderWealthScreen"],
  ["Ajustes", "renderSettingsScreen"],
];
for (const [rotulo, fn] of TELAS) {
  let html = "";
  let erro = null;
  try { html = String(run(`${fn}()`)); } catch (e) { erro = e && e.message; }
  check(`${rotulo}: renderiza com base hostil`, erro === null && html.length > 200, erro || `${html.length} chars`);
  check(`${rotulo}: a carga não virou marcação`, semVazamento(html));
  check(`${rotulo}: a marcação legítima continua fechando`, divsBalanceadas(html), rotulo);
}

// ==============================================================================
console.log("\n7. Análise de IA — o corpo remoto também é entrada não confiável");
// ==============================================================================
// `js/insights.js` devolve `body.analise` cru para `state.aiInsight`, e a tela
// interpola. Hoje `netlify/functions/analyze.js` normaliza tudo antes de
// responder; o cliente repete a whitelist para não depender só disso.
ctx.__ai = {
  score: CARGA,
  diagnostico: CARGA,
  fluxoCaixa: { situacao: "constructor", comentario: CARGA, sobraEstimada: 10 },
  riscos: [{ titulo: CARGA, nivel: "__proto__", descricao: CARGA }],
  recomendacoes: [{ acao: CARGA, impacto: CARGA }],
  metasComentario: CARGA,
};
const htmlAi = String(run("renderAiStructured(__ai)"));
check("análise de IA: a carga não virou marcação", semVazamento(htmlAi));
check("análise de IA: a marcação legítima continua fechando", divsBalanceadas(htmlAi));
check("análise de IA: nota não numérica não é exibida", !/\/100/.test(htmlAi), htmlAi.slice(0, 160));
check("análise de IA: nível fora da whitelist cai no padrão", htmlAi.includes("Atenção"));
check("análise de IA: situação fora da whitelist não vaza função herdada",
  !htmlAi.includes("[native code]") && !htmlAi.includes("undefined"));
// E o caminho normal continua funcionando.
ctx.__ai2 = {
  score: 74,
  diagnostico: "Mês equilibrado.",
  fluxoCaixa: { situacao: "positivo", comentario: "Sobrou.", sobraEstimada: 800 },
  riscos: [{ titulo: "Cartão", nivel: "alto", descricao: "Fatura alta." }],
  recomendacoes: [{ acao: "Reduzir delivery", impacto: "R$ 200" }],
  metasComentario: "No ritmo.",
};
const htmlAi2 = String(run("renderAiStructured(__ai2)"));
check("análise de IA: nota numérica continua sendo exibida", /<b>74<\/b><span>\/100<\/span>/.test(htmlAi2.replace(/\s+/g, "")));
check("análise de IA: rótulo de risco alto continua correto", htmlAi2.includes("Risco alto"));
check("análise de IA: fluxo positivo continua correto", htmlAi2.includes("Fluxo positivo"));

// ==============================================================================
console.log("\n8. svgIcon não olha a cadeia de protótipos");
// ==============================================================================
// `normalizeIconName` aceita `constructor` (bate com `[A-Za-z][A-Za-z0-9]*`).
// Sem a busca por chave própria, o ícone virava o código-fonte de `Object`.
for (const nome of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
  const svg = String(call("svgIcon", nome, 16));
  check(`ícone "${nome}" cai no padrão em vez de herdar de Object`,
    !svg.includes("native code") && !svg.includes("function"), svg.slice(0, 90));
}
check("ícone conhecido continua desenhando", String(call("svgIcon", "wallet", 16)).includes("<path"));
check("ícone desconhecido continua caindo em tag", call("svgIcon", "naoExiste", 16) === call("svgIcon", "tag", 16));

// ==============================================================================
console.log("\n9. Saída para planilha (injeção de fórmula)");
// ==============================================================================
// O CSV exportado é aberto no Excel do usuário. Uma descrição começando com
// `=`, `+`, `-` ou `@` vira comando lá, e o app nem participa do ataque.
for (const prefixo of ["=", "+", "-", "@", "\t"]) {
  const saida = String(call("csvCell", `${prefixo}cmd|'/c calc'!A1`));
  check(`fórmula começando com "${prefixo === "\t" ? "TAB" : prefixo}" é neutralizada`, saida.includes("'" + prefixo));
}
check("texto comum não ganha apóstrofo", call("csvCell", "Mercado") === "Mercado");
check("a neutralização é desfeita na reimportação",
  call("csvUncell", call("csvCell", "=SOMA(A1)").replace(/^"|"$/g, "")) === "=SOMA(A1)");

// ==============================================================================
console.log("\n10. Estilo dinâmico continua com alfabeto fechado");
// ==============================================================================
// `data-ui-css` existe porque a política de conteúdo proíbe `style=` inline.
// O sanitizador de js/modules/dynamic-styles.js é a razão de o valor de cor
// interpolado não virar `url()` nem fechar a regra.
// Em vez de casar o texto da expressão (que muda de forma sem mudar de
// efeito), o teste EXECUTA o sanitizador com as cargas que ele existe para
// recusar. `createDynamicStyleController` é um módulo ES; aqui basta a função
// interna, então o arquivo é avaliado com o `export` removido.
const dynSrc = readSrc("js/modules/dynamic-styles.js").replace(/^export /gm, "");
const dynCtx = { console };
dynCtx.globalThis = dynCtx;
vm.createContext(dynCtx);
vm.runInContext(dynSrc, dynCtx, { filename: "js/modules/dynamic-styles.js" });
const recusa = (valor) => {
  dynCtx.__v = valor;
  try { vm.runInContext("sanitizeDeclarations(__v)", dynCtx); return false; }
  catch (_) { return true; }
};
check("url() é recusado no estilo dinâmico", recusa("background:url(https://x/y.png)"));
check("expression() é recusado", recusa("width:expression(alert(1))"));
check("@import é recusado", recusa("color:red;@import 'x'"));
check("fechar a regra é recusado", recusa("color:red}body{display:none"));
check("sinal de tag é recusado", recusa("color:red;content:'<b>'"));
check("barra invertida é recusada", recusa("color:\\72 ed"));
check("propriedade fora do alfabeto é recusada", recusa("co lor:red"));
check("declaração legítima continua passando", !recusa("--account-color:#0B6B5C"));
check("declaração legítima com função de cor continua passando",
  !recusa("background:color-mix(in srgb, #0B6B5C 14%, transparent)"));

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
