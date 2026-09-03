// test-anomalies-subscriptions.js — [M32] anomalias e [M33] recorrências.
//
// Os dois módulos falham do mesmo jeito quando falham: com uma frase certa
// sobre uma conta errada.
//
//   M32  o risco NÃO é errar a subtração. É comparar um mês pela metade com um
//        mês inteiro e chamar isso de "você economizou". No dia 3, tudo caiu.
//        Por isso a maior parte deste arquivo é sobre JANELA, não sobre média.
//   M33  o risco é o app opinar. Ele não sabe se você usa a assinatura, se ela
//        é da família ou se é ferramenta de trabalho; pode mostrar o preço, a
//        cadência e o peso na renda, e devolver a decisão.
//
// Ferramenta de dev: `node tests/test-anomalies-subscriptions.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = {
  console, module: { exports: {} }, setTimeout, clearTimeout,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
ctx.fetch = () => Promise.reject(new Error("offline"));
vm.createContext(ctx);
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js",
  "js/debts.js", "js/import.js", "js/metrics.js", "js/wealth.js", "js/goals.js", "js/score.js",
  "js/recurring.js", "js/analytics.js", "js/insights.js", "js/assistant.js", "js/advisor.js", "js/demo.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);
const { migrate, buildAnalyticsModel, buildAdvisorModel } = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

const now = new Date();
const keyMinus = (n) => ctx.keyOfDate(new Date(now.getFullYear(), now.getMonth() - n, 1));
const thisKey = ctx.keyOfDate(now);
const dia = (key, d) => {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(Math.min(d, ctx.daysInMonthOf(y, m - 1))).padStart(2, "0")}`;
};
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });
const card = (adv, id) => adv.all.find((c) => c.id === id);
// fmtBRL separa o "R$" do número com espaço INSEPARÁVEL; sem normalizar, toda
// comparação de frase falharia por causa de um caractere invisível.
const txt = (v) => String(v == null ? "" : v).replace(/ /g, " ");
const REGRAS = run("ADVISOR_RULES");
const regra = (id) => REGRAS.find((r) => r.id === id);

/* ===================================================================== 1 */
section("1. [M32] A janela de comparação");
{
  const key = keyMinus(1);
  ctx.__janela = migrate({
    monthlyIncome: 6000,
    transactions: [
      tx({ type: "expense", amount: 100, categoryId: "mercado", date: dia(key, 3) }),
      tx({ type: "expense", amount: 200, categoryId: "mercado", date: dia(key, 12) }),
      tx({ type: "expense", amount: 400, categoryId: "mercado", date: dia(key, 25) }),
    ],
  });
  const j5 = run(`anExpenseByRootThroughDay(__janela, "${key}", 5)`);
  const j15 = run(`anExpenseByRootThroughDay(__janela, "${key}", 15)`);
  const inteiro = run(`anExpenseByRootThroughDay(__janela, "${key}", null)`);
  const legado = run(`anExpenseByRoot(__janela, "${key}")`);
  check("a janela até o dia 5 só soma o que ocorreu até o dia 5",
    ctx.moneyFromCents(j5.get("alimentacao") || 0) === 100, [...j5]);
  check("a janela até o dia 15 acumula os dois primeiros",
    ctx.moneyFromCents(j15.get("alimentacao") || 0) === 300, [...j15]);
  check("sem janela, soma o mês inteiro",
    ctx.moneyFromCents(inteiro.get("alimentacao") || 0) === 700, [...inteiro]);
  check("a função antiga devolve exatamente o mesmo do mês inteiro",
    ctx.moneyFromCents(legado.get("alimentacao") || 0) === 700);
  check("a subcategoria continua somando na categoria-mãe", !j15.has("mercado"));
}

/* ===================================================================== 2 */
section("2. [M32] Anomalia contra a própria média, em mês fechado");
const alvo = keyMinus(1);
const baseMeses = [keyMinus(2), keyMinus(3), keyMinus(4)];
function comBase(extras) {
  const lista = [];
  baseMeses.forEach((key) => {
    lista.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: dia(key, 5) }));
    lista.push(tx({ type: "expense", amount: 400, categoryId: "delivery", date: dia(key, 12) }));
    lista.push(tx({ type: "expense", amount: 800, categoryId: "transporte", date: dia(key, 15) }));
    lista.push(tx({ type: "expense", amount: 1000, categoryId: "moradia", date: dia(key, 20) }));
    lista.push(tx({ type: "expense", amount: 30, categoryId: "lazer", date: dia(key, 22) }));
  });
  lista.push(tx({ type: "income", amount: 6000, categoryId: "salario", date: dia(alvo, 5) }));
  return migrate({ monthlyIncome: 6000, transactions: lista.concat(extras) });
}
{
  const data = comBase([
    tx({ type: "expense", amount: 568, categoryId: "delivery", date: dia(alvo, 12) }),    // +42%
    tx({ type: "expense", amount: 1080, categoryId: "transporte", date: dia(alvo, 15) }), // +R$ 280
    tx({ type: "expense", amount: 1000, categoryId: "moradia", date: dia(alvo, 20) }),    // estável
    tx({ type: "expense", amount: 120, categoryId: "lazer", date: dia(alvo, 22) }),       // +300% de R$ 30
  ]);
  const an = buildAnalyticsModel(data, alvo);
  const a = an.anomalies;
  const nome = (id) => (a.items.find((i) => i.id === id) || {});

  check("o mês fechado é declarado como não parcial", a.partial === false);
  check("três meses de base foram usados", a.baselineMonths === 3, a.baselineMonths);
  check("a base aparece na frase", /mês fechado, contra a média dos últimos 3 meses/.test(a.basis), a.basis);
  check("alimentação é apontada 42% acima da média",
    Math.round(nome("alimentacao").pct) === 42, nome("alimentacao").pct);
  check("transporte é apontado com R$ 280 a mais",
    nome("transporte").diff === 280, nome("transporte").diff);
  check("a categoria estável não vira alerta", !a.items.some((i) => i.id === "moradia"));
  check("categoria de base minúscula não vira alerta mesmo subindo 300%",
    !a.items.some((i) => i.id === "lazer"), a.items.map((i) => i.id));
  check("a ordem principal é por diferença em reais", a.items[0].id === "transporte", a.items[0].id);
  check("a ordem por percentual é outra lista", a.upByPct[0].id === "alimentacao", a.upByPct[0].id);
  check("nada foi classificado como queda", a.down.length === 0);

  const adv = buildAdvisorModel(data, alvo);
  const alta = card(adv, "anomalia-alta");
  const valor = card(adv, "anomalia-valor");
  check("a frase do roteiro sai inteira",
    !!alta && /42% acima da sua média dos últimos 3 meses/.test(alta.title), alta && alta.title);
  check("a frase em reais também sai",
    !!valor && /aumentou R\$ 280,00/.test(txt(valor.title)), valor && valor.title);
  check("a alta não vira tom de urgência sozinha", alta.tone === "warn" || alta.tone === "info", alta.tone);
  check("o cartão diz que estar fora da média não é erro",
    /não é erro/.test(alta.message), alta.message);
}

/* ===================================================================== 3 */
section("3. [M32] Portões contra alerta irrelevante");
{
  const poucaDiferenca = comBase([
    tx({ type: "expense", amount: 440, categoryId: "delivery", date: dia(alvo, 12) }),   // +R$ 40
    tx({ type: "expense", amount: 800, categoryId: "transporte", date: dia(alvo, 15) }),
    tx({ type: "expense", amount: 1000, categoryId: "moradia", date: dia(alvo, 20) }),
  ]);
  const a1 = buildAnalyticsModel(poucaDiferenca, alvo).anomalies;
  check("diferença de R$ 40 não vira alerta (mínimo em reais)", !a1.available, a1.items);

  const poucoPercentual = comBase([
    tx({ type: "expense", amount: 400, categoryId: "delivery", date: dia(alvo, 12) }),
    tx({ type: "expense", amount: 890, categoryId: "transporte", date: dia(alvo, 15) }), // +11%
    tx({ type: "expense", amount: 1000, categoryId: "moradia", date: dia(alvo, 20) }),
  ]);
  const a2 = buildAnalyticsModel(poucoPercentual, alvo).anomalies;
  check("alta de 11% não vira alerta (mínimo em percentual)", !a2.available, a2.items);

  const semBase = migrate({
    monthlyIncome: 6000,
    transactions: [
      tx({ type: "expense", amount: 400, categoryId: "delivery", date: dia(baseMeses[0], 12) }),
      tx({ type: "expense", amount: 900, categoryId: "delivery", date: dia(alvo, 12) }),
    ],
  });
  const a3 = buildAnalyticsModel(semBase, alvo).anomalies;
  check("um mês de base não é padrão", a3.reason === "sem-base" && !a3.available, a3.reason);

  const doMes = buildAnalyticsModel(comBase([]), thisKey).anomalies;
  if (now.getDate() < 5) {
    check("nos primeiros dias do mês o app não arrisca leitura", doMes.reason === "poucos-dias", doMes.reason);
  } else {
    check("passados os primeiros dias, a leitura do mês corrente é tentada",
      doMes.reason !== "poucos-dias", doMes.reason);
  }
}

/* ===================================================================== 4 */
section("4. [M32] O elogio errado no meio do mês");
{
  // Chamada direta à regra: assim o teste não depende de que dia é hoje.
  const anParcial = {
    categories: { grew: [], shrank: [{ id: "mercado", name: "Mercado", comparable: true, diff: -300, pct: -30 }] },
    averages: { isCurrentMonth: true, elapsedDays: 3, totalDays: 30 },
    anomalies: { available: false, up: [], upByPct: [], down: [] },
  };
  check("mês em curso não é parabenizado por queda contra mês inteiro",
    regra("categoria-em-queda").run({ an: anParcial }) === null);

  const anFechado = { ...anParcial, averages: { isCurrentMonth: false, elapsedDays: 30, totalDays: 30 } };
  check("mês fechado continua elogiando como antes",
    regra("categoria-em-queda").run({ an: anFechado }) !== null);

  const anDuplicado = {
    ...anFechado,
    anomalies: {
      available: true, up: [], upByPct: [],
      down: [{ id: "mercado", name: "Mercado", diff: -300, current: 700, baseline: 1000 }],
      basis: "mês fechado, contra a média dos últimos 3 meses",
    },
  };
  check("o mesmo fato não é dito duas vezes (queda)",
    regra("categoria-em-queda").run({ an: anDuplicado }) === null);

  const anAlta = {
    categories: { grew: [{ id: "transporte", name: "Transporte", comparable: true, diff: 300, pct: 30 }], shrank: [] },
    averages: { isCurrentMonth: false, elapsedDays: 30, totalDays: 30 },
    anomalies: {
      available: true, down: [],
      up: [{ id: "transporte", name: "Transporte", diff: 300 }],
      upByPct: [{ id: "transporte", name: "Transporte", pct: 30, diff: 300, current: 1300, baseline: 1000 }],
      basis: "mês fechado, contra a média dos últimos 3 meses", baselineMonths: 3,
    },
  };
  check("o mesmo fato não é dito duas vezes (alta)",
    regra("categoria-em-alta").run({ an: anAlta }) === null);

  const anQueda = {
    categories: { grew: [], shrank: [] },
    averages: { isCurrentMonth: true, elapsedDays: 12, totalDays: 30 },
    anomalies: {
      available: true, up: [], upByPct: [],
      down: [{ id: "mercado", name: "Mercado", diff: -180, current: 320, baseline: 500 }],
      basis: "até o dia 12, contra os mesmos 12 primeiros dias dos últimos 3 meses", baselineMonths: 3,
    },
  };
  const elogio = regra("anomalia-queda").run({ an: anQueda });
  check("o elogio comparável existe e vale no meio do mês",
    !!elogio && /R\$ 180,00 a menos com Mercado/.test(txt(elogio.title)), elogio && elogio.title);
  check("o elogio carrega a base da comparação",
    /até o dia 12, contra os mesmos 12 primeiros dias/.test(txt(elogio.message)), elogio.message);
}

/* ===================================================================== 5 */
section("5. [M32] Despesas fixas na renda");
{
  const rec = { committedMonthly: 3660, incomeShare: 61, counts: { subscriptions: 4, variable: 2 } };
  const c = regra("despesas-fixas").run({ rec, income: 6000 });
  check("a frase do roteiro sai inteira",
    !!c && /Suas despesas fixas representam 61% da renda/.test(c.title), c && c.title);
  check("o valor comprometido aparece na explicação", /R\$ 3\.660,00/.test(txt(c.message)), c.message);
  check("acima de 65% o tom sobe",
    regra("despesas-fixas").run({ rec: { ...rec, incomeShare: 70 }, income: 6000 }).tone === "warn");
  check("abaixo do limiar não há alerta",
    regra("despesas-fixas").run({ rec: { ...rec, incomeShare: 40 }, income: 6000 }) === null);
  check("sem renda declarada não há percentual para afirmar",
    regra("despesas-fixas").run({ rec, income: 0 }) === null);
  check("sem compromisso recorrente não há cartão",
    regra("despesas-fixas").run({ rec: { ...rec, committedMonthly: 0 }, income: 6000 }) === null);

  // E o número não é inventado: sai do motor de recorrências.
  ctx.__demo = run("buildDemoData()");
  const m = run("buildRecurringModel(__demo)");
  const advDemo = run("buildAdvisorModel(__demo)");
  const cartao = advDemo.all.find((x) => x.id === "despesas-fixas");
  check("no conjunto de demonstração o cartão usa o comprometido do motor",
    !cartao || cartao.value === m.committedMonthly, { cartao: cartao && cartao.value, motor: m.committedMonthly });
}

/* ===================================================================== 6 */
section("6. [M33] Tipo da recorrência");
{
  const tipoDe = (nome) => run(`recTypeOf(${JSON.stringify(nome)}).id`);
  [
    ["Netflix", "streaming"], ["Spotify Premium", "streaming"], ["Streaming de vídeo", "streaming"],
    ["Adobe Creative Cloud", "software"], ["Google One", "software"],
    ["Smart Fit", "academia"], ["Academia", "academia"],
    ["Vivo Fibra", "telecom"], ["TIM Controle", "telecom"], ["Oi Internet", "telecom"],
    ["Conta de Luz - Enel", "moradia"], ["Aluguel", "moradia"],
    ["Alura", "educacao"], ["Unimed", "seguros"], ["Seguro do carro", "seguros"],
    ["Assinatura Clube do Livro", "servicos"],
  ].forEach(([nome, esperado]) => check(`${nome} entra em ${esperado}`, tipoDe(nome) === esperado, tipoDe(nome)));
  check("nome desconhecido cai em Outros, não em Serviços", tipoDe("Padaria do Zé") === "outros");
  check("nome vazio não quebra e cai em Outros", tipoDe("") === "outros");
  check("palavra curta só casa inteira", tipoDe("Boi na brasa") === "outros", tipoDe("Boi na brasa"));
}

/* ===================================================================== 7 */
section("7. [M33] Painel consolidado");
{
  ctx.__demo = run("buildDemoData()");
  const m = run("buildRecurringModel(__demo)");
  const soma = (lista, campo) => lista.reduce((s, t) => ctx.addMoney(s, t[campo]), 0);
  const anualVariavel = m.variable.reduce((s, x) => ctx.addMoney(s, x.annualCost), 0);

  check("o total mensal de recorrências é mês fixo + mês variável",
    m.committedMonthly === ctx.addMoney(m.monthlyTotal, m.variableMonthly), m.committedMonthly);
  check("o total anual soma a parte exata com a estimada",
    m.committedAnnual === ctx.addMoney(m.annualTotal, ctx.mulMoney(m.variableMonthly, 12)), m.committedAnnual);
  check("os subtotais por tipo fecham com o total mensal",
    soma(m.byType, "monthly") === m.committedMonthly, { tipos: soma(m.byType, "monthly"), total: m.committedMonthly });
  check("os subtotais por tipo fecham com o custo anual dos itens",
    soma(m.byType, "annual") === ctx.addMoney(m.annualTotal, anualVariavel), soma(m.byType, "annual"));
  check("cada tipo sabe quantos itens tem",
    m.byType.reduce((s, t) => s + t.count, 0) === m.counts.subscriptions + m.counts.variable);
  check("a lista de tipos vem ordenada pelo peso mensal",
    m.byType.every((t, i) => i === 0 || m.byType[i - 1].monthly >= t.monthly));
  check("todo item acompanhado carrega o tipo reconhecido",
    m.subscriptions.concat(m.variable).every((s) => !!s.typeId && !!s.typeLabel));
  check("o equivalente mensal nunca passa do custo anual do mesmo tipo",
    m.byType.every((t) => t.monthly <= t.annual));
}

/* ===================================================================== 8 */
section("8. [M33] Revisar assinatura: data, nunca veredito");
{
  ctx.__base = migrate({ transactions: [] });
  const prefs = run(`recPrefsWith(__base, "review", "netflix|assinaturas", "2026-08-10")`);
  check("o balde de revisão guarda a data", prefs.review["netflix|assinaturas"] === "2026-08-10", prefs.review);
  check("os baldes antigos continuam existindo",
    !!prefs.ignored && !!prefs.dismissed && !!prefs.confirmed);

  ctx.__prefs = prefs;
  const normalizado = run("normalizeRecurringPrefs(__prefs)");
  check("a normalização preserva a revisão", normalizado.review["netflix|assinaturas"] === "2026-08-10");

  const legado = run(`normalizeRecurringPrefs({ ignored: { "a|b": "2026-01-02" } })`);
  check("dado antigo sem o balde novo normaliza para vazio, sem perder nada",
    legado.ignored["a|b"] === "2026-01-02" && JSON.stringify(legado.review) === "{}", legado);

  ctx.__a = { review: { "x|y": "2026-05-01" } };
  ctx.__b = { review: { "x|y": "2026-07-01" } };
  const merged = run("mergeRecurringPrefs(__a, __b)");
  check("na fusão entre dispositivos vence a revisão mais recente",
    merged.review["x|y"] === "2026-07-01", merged.review);

  // O item decorado leva a data para a tela.
  ctx.__demo = run("buildDemoData()");
  const alvoKey = run("buildRecurringModel(__demo).subscriptions[0].key");
  ctx.__demoRev = run(`(() => { const d = JSON.parse(JSON.stringify(__demo)); d.recurringPrefs = recPrefsWith(d, "review", ${JSON.stringify(alvoKey)}, todayIso()); return d; })()`);
  const item = run(`buildRecurringModel(__demoRev).subscriptions.find((s) => s.key === ${JSON.stringify(alvoKey)})`);
  check("o item revisado carrega a data", item.reviewedAt === run("todayIso()"), item.reviewedAt);
  check("e quantos dias se passaram", item.daysSinceReview === 0, item.daysSinceReview);
  check("item nunca revisado não inventa data",
    run("buildRecurringModel(__demo).subscriptions[0].reviewedAt") === "");
  check("revisar não muda nenhum total",
    run("buildRecurringModel(__demoRev).committedMonthly") === run("buildRecurringModel(__demo).committedMonthly"));
  check("revisar não tira o item de lugar nenhum",
    run("buildRecurringModel(__demoRev).counts.subscriptions") === run("buildRecurringModel(__demo).counts.subscriptions"));
  check("a contagem de revisados acompanha", run("buildRecurringModel(__demoRev).counts.reviewed") === 1);
}

/* ===================================================================== 9 */
section("9. [M33] A tela não decide pelo usuário");
{
  const fonte = readSrc("js/screens/subscriptions.js");
  // Só o que chega ao usuário. O comentário de código explica a regra e precisa
  // poder citar a palavra que a interface não pode dizer.
  const tela = fonte.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  check("existe a ação Revisar assinatura", /Revisar assinatura/.test(tela));
  check("o comentário do código registra a regra de linguagem",
    /não afirma que uma assinatura é inútil/i.test(fonte));
  check("a ficha devolve a decisão ao usuário",
    /O app não diz se .* vale a pena/.test(tela) && /a decisão é sua/.test(tela));
  check("a ficha adapta a pergunta ao tipo, em vez de perguntar sempre a mesma coisa",
    /SUBS_REVIEW_QUESTIONS/.test(tela) && /Quantas vezes você foi no último mês/.test(tela));
  check("aluguel e conta de luz não são chamados de assinatura",
    /Revisar compromisso/.test(tela));
  check("a marcação é declarada como data, não como juízo",
    /guarda só a data|nenhum juízo/.test(tela));
  check("o tipo é declarado como inferência", /reconhecido pelo nome|inferid/i.test(tela));
  [
    "inútil", "desperdício", "não vale a pena manter", "cancele ", "você deveria cancelar",
    "gasto desnecessário", "corte essa", "livre-se",
  ].forEach((frase) => check(`a tela não diz ${frase.trim()}`, tela.toLowerCase().indexOf(frase.toLowerCase()) < 0));
  check("a tela continua dizendo que nada é apagado",
    /não apaga nenhum lançamento/.test(tela));

  const insights = readSrc("js/screens/insights.js");
  check("[M32] a tela mostra a base da comparação", /Comparação com a sua própria média/.test(insights));
  check("[M32] a tela avisa quando o mês ainda está em curso",
    /O mês ainda está em curso/.test(insights));
}

console.log(`\n${pass} passaram, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
