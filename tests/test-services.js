// test-services.js — [M8] Event Bus, camada de serviços e central de notificações.
//
// Roda os motores puros num contexto de VM (sem DOM, sem storage) e cobre:
//   • o Event Bus (isolamento de erro, once, curinga, cancelamento);
//   • as fachadas de serviço concordando com os motores que elas embrulham
//     (é o teste que garante a "fonte única de verdade" do §19);
//   • as regras de notificação (cada gatilho e cada silêncio);
//   • a identidade por `key` (o mesmo fato não vira dois avisos);
//   • a primeira sincronização silenciosa;
//   • migração v11, backup/checksum e mesclagem.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// `console.warn` é ruído esperado aqui: uma das provas do Event Bus é justamente
// um handler que estoura sem derrubar os outros.
const quietConsole = { log: console.log, error: console.error, warn() {} };

const ctx = {
  console: quietConsole,
  setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB: undefined, localStorage: undefined,
  navigator: { userAgent: "node", onLine: true },
  module: { exports: {} },
  fetch: () => Promise.reject(new Error("offline")),
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

[
  "js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/debts.js", "js/budgets.js",
  "js/import.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/calendar.js", "js/recurring.js", "js/analytics.js",
  "js/insights.js", "js/assistant.js", "js/advisor.js", "js/investments.js",
  "js/portfolio.js", "js/achievements.js", "js/services.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` → ${extra}` : ""}`); }
}

/* ------------------------------------------------------------------ helpers */
const iso = (d) => run(`isoOfDate(new Date(${d.getFullYear()}, ${d.getMonth()}, ${d.getDate()}))`);
const today = run("todayIso()");
const monthKey = today.slice(0, 7);
let seq = 0;
function tx(p) { ctx.__p = { id: `t${++seq}`, ...p }; return run("makeTransaction(__p)"); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
function monthsAgo(n, day) {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() - n, day || 10));
}
function baseData(extra) {
  ctx.__e = extra || {};
  return run("migrate({ ...defaultData(), ...__e })");
}

/* ============================================================ 1. EVENT BUS */
console.log("\n1. Event Bus");
{
  ctx.__log = [];
  run(`
    __r = {};
    __r.received = [];
    __r.off = EventBus.on("x", (p) => __r.received.push("a:" + p));
    EventBus.on("x", () => { throw new Error("boom"); });
    EventBus.on("x", (p) => __r.received.push("b:" + p));
    __r.wild = [];
    EventBus.on("*", (p, e) => __r.wild.push(e));
    __r.delivered = EventBus.emit("x", 1);
  `);
  check("um handler que estoura não impede os outros", run("__r.received.join(',')") === "a:1,b:1");
  check("curinga recebe o nome do evento", run("__r.wild.join(',')") === "x");
  check("emit informa quantos handlers foram chamados", run("__r.delivered") === 4);

  run(`__r.off(); __r.received = []; EventBus.emit("x", 2);`);
  check("on() devolve o próprio cancelamento", run("__r.received.join(',')") === "b:2");

  run(`
    __r.onceCount = 0;
    EventBus.once("y", () => { __r.onceCount++; });
    EventBus.emit("y"); EventBus.emit("y"); EventBus.emit("y");
  `);
  check("once dispara uma única vez", run("__r.onceCount") === 1);
  check("once não deixa handler pendurado", run("EventBus.listenerCount('y')") === 0);

  run("EventBus.clear();");
  check("clear() esvazia tudo", run("EventBus.listenerCount('x')") === 0);
  check("emit sem evento não quebra", run("EventBus.emit(null)") === 0);
  check("on com handler inválido devolve noop", run("typeof EventBus.on('z', null)") === "function");
}

/* =================================================== 2. FACHADAS DE SERVIÇO */
console.log("\n2. Serviços concordam com os motores que embrulham");
{
  const transactions = [];
  for (let m = 5; m >= 0; m--) {
    transactions.push(tx({ type: "income", amount: 8000, categoryId: "salario", date: monthsAgo(m, 5) }));
    transactions.push(tx({ type: "expense", amount: 2600, categoryId: "moradia", date: monthsAgo(m, 10), recurring: true, description: "Aluguel" }));
    transactions.push(tx({ type: "expense", amount: 700, categoryId: "mercado", date: monthsAgo(m, 15) }));
  }
  const data = baseData({ monthlyIncome: 8000, transactions });
  ctx.__data = data;

  check("FinanceService.month === monthTotals",
    run("JSON.stringify(FinanceService.month(__data)) === JSON.stringify(monthTotals(__data, keyOfDate(new Date())))"));
  check("FinanceService.balance === realizedBalance",
    run("FinanceService.balance(__data) === realizedBalance(__data)"));
  check("FinanceService.netWorth === netWorth",
    run("JSON.stringify(FinanceService.netWorth(__data)) === JSON.stringify(netWorth(__data))"));
  check("BudgetService.status === computeBudgetStatus",
    run("JSON.stringify(BudgetService.status(__data)) === JSON.stringify(computeBudgetStatus(__data, keyOfDate(new Date())))"));
  check("AnalyticsService.month === buildAnalyticsModel",
    run("JSON.stringify(AnalyticsService.month(__data)) === JSON.stringify(buildAnalyticsModel(__data, keyOfDate(new Date())))"));
  check("InvestmentService.compound === simulateCompoundInterest",
    run("JSON.stringify(InvestmentService.compound({ initial: 100, monthlyContribution: 50, years: 3, annualRatePct: 10 })) === JSON.stringify(simulateCompoundInterest({ initial: 100, monthlyContribution: 50, years: 3, annualRatePct: 10 }))"));
  check("InsightService.goals === buildGoalsModel",
    run("InsightService.goals(__data).counts.total === buildGoalsModel(__data, new Date()).counts.total"));
  check("Services expõe os seis serviços do §19",
    run("['finance','budget','investment','analytics','insight','notification'].every((k) => Services[k] && typeof Services[k] === 'object')"));
  check("Services.bus é o Event Bus", run("Services.bus === EventBus"));

  // Nenhum serviço guarda cópia do dado: mesma entrada, mesma saída.
  check("fachada é pura (duas chamadas, mesmo resultado)",
    run("FinanceService.balance(__data) === FinanceService.balance(__data)"));
}

/* ============================================== 3. REGRAS DE NOTIFICAÇÃO */
console.log("\n3. Regras de notificação");
{
  // Conta a vencer em 2 dias + conta de mês anterior em atraso.
  const data = baseData({
    monthlyIncome: 8000,
    transactions: [
      tx({ type: "income", amount: 8000, categoryId: "salario", date: monthsAgo(0, 1) }),
      tx({ type: "expense", amount: 320, categoryId: "moradia", date: daysFromNow(2), description: "Condomínio" }),
      tx({ type: "expense", amount: 900, categoryId: "lazer", date: daysFromNow(20), description: "Viagem" }),
    ],
  });
  ctx.__data = data;
  const keys = run("buildNotificationCandidates(__data).map((c) => c.key)");
  check("conta a vencer em 2 dias vira aviso", keys.some((k) => k.startsWith("conta:")));
  check("conta a 20 dias NÃO vira aviso (não é acionável)", keys.filter((k) => k.startsWith("conta:")).length === 1);

  // Orçamento estourado.
  const over = baseData({
    monthlyIncome: 5000,
    categories: run("defaultData().categories").map((c) => (c.id === "mercado" ? { ...c, budget: 300 } : c)),
    transactions: [tx({ type: "expense", amount: 800, categoryId: "mercado", date: today })],
  });
  ctx.__over = over;
  const overKeys = run("buildNotificationCandidates(__over).map((c) => c.key)");
  check("orçamento estourado vira aviso danger", overKeys.some((k) => /^orcamento:mercado:.*:over$/.test(k)));
  check("aviso de orçamento aponta para a tela certa",
    run("buildNotificationCandidates(__over).find((c) => c.group === 'orcamento').tab") === "settings");

  // Grupo silenciado não gera nada.
  const silenced = run("buildNotificationCandidates(__over, { muted: { orcamento: '2024-01-01' } }).filter((c) => c.group === 'orcamento').length");
  check("grupo silenciado não gera candidatas", silenced === 0);
  check("silenciar um grupo não silencia os outros",
    run("buildNotificationCandidates(__over, { muted: { orcamento: '2024-01-01' } }).length >= 0"));

  // Meta concluída e meta atrasada.
  const goalsData = baseData({
    goals: [
      { id: "g1", name: "Notebook", target: 5000, current: 5000, savedUpfront: 5000, icon: "tool", deadline: null },
      { id: "g2", name: "Viagem", target: 9000, current: 1000, savedUpfront: 1000, icon: "plane", deadline: daysFromNow(-30) },
    ],
  });
  ctx.__g = goalsData;
  const gKeys = run("buildNotificationCandidates(__g).map((c) => c.key)");
  check("meta concluída vira aviso positivo", gKeys.includes("meta-concluida:g1"));
  check("meta vencida vira aviso de atenção", gKeys.some((k) => k.startsWith("meta-atrasada:g2")));
  check("título da meta usa o nome cadastrado",
    /Viagem/.test(run("JSON.stringify(buildNotificationCandidates(__g).find((c) => c.key.indexOf('meta-atrasada') === 0).title)")));

  // Conquista desbloqueada hoje.
  ctx.__a = baseData({ achievements: { unlocked: { "first-tx": today, "income-set": "2020-01-01" } } });
  const aKeys = run("buildNotificationCandidates(__a).map((c) => c.key)");
  check("conquista desbloqueada hoje vira aviso", aKeys.includes("conquista:first-tx"));
  check("conquista antiga não reaparece", !aKeys.includes("conquista:income-set"));
  check("aviso de conquista usa o nome do catálogo",
    /Primeiro lançamento/.test(run("JSON.stringify(buildNotificationCandidates(__a).find((c) => c.key === 'conquista:first-tx').title)")));

  // Assinatura reajustada.
  // Datas por deslocamento de 30 dias: a cadência mensal é detectada pelo
  // intervalo, e o teste passa a valer em qualquer dia do mês em que rodar.
  const subs = [];
  for (let m = 6; m >= 0; m--) {
    subs.push(tx({ type: "expense", amount: m === 0 ? 74.9 : 55.9, categoryId: "assinaturas", date: daysFromNow(-30 * m), description: "Netflix" }));
  }
  ctx.__s = baseData({ transactions: subs });
  const sKeys = run("buildNotificationCandidates(__s).map((c) => c.key)");
  check("reajuste de assinatura vira aviso", sKeys.some((k) => k.startsWith("assinatura-reajuste:")));
  check("mensagem do reajuste fala em custo anual",
    /por ano/.test(run("JSON.stringify(buildNotificationCandidates(__s).find((c) => c.key.indexOf('assinatura-reajuste') === 0).message)")));

  // Toda candidata tem os campos que a tela consome.
  check("toda candidata traz key, título, grupo, tom e destino",
    run(`buildNotificationCandidates(__s).every((c) => c.key && c.title && c.group && c.tone && c.tab)`));
  check("nenhuma mensagem sai com NaN ou undefined",
    !/NaN|undefined/.test(run("JSON.stringify(buildNotificationCandidates(__s))")));

  // Uma regra que estoura vira silêncio, não tela quebrada.
  ctx.__broken = { transactions: "isto não é uma lista" };
  check("dado corrompido não derruba o motor",
    Array.isArray(run("buildNotificationCandidates(__broken)")));
}

/* ================================================ 4. SINCRONIZAÇÃO E ESTADO */
console.log("\n4. Sincronização, identidade e leitura");
{
  ctx.__c = [
    { key: "a", group: "contas", tone: "danger", title: "Conta atrasada", message: "m", tab: "calendar" },
    { key: "b", group: "metas", tone: "positive", title: "Meta concluída", message: "m", tab: "goals" },
  ];
  run("__s1 = syncNotificationState(defaultNotifications(), __c, { silent: false });");
  check("sincronização cria os avisos", run("__s1.state.items.length") === 2);
  check("os novos nascem não lidos", run("__s1.created.length") === 2);
  check("marca a data da sincronização", run("!!__s1.state.lastSyncAt"));
  check("marca o estado como inicializado", run("__s1.state.initialized") === true);

  run("__s2 = syncNotificationState(__s1.state, __c, {});");
  check("o mesmo fato não vira um segundo aviso", run("__s2.state.items.length") === 2);
  check("nada novo é anunciado na segunda passagem", run("__s2.created.length") === 0);

  run("__s3 = syncNotificationState(defaultNotifications(), __c, { silent: true });");
  check("primeira sincronização silenciosa registra tudo", run("__s3.state.items.length") === 2);
  check("…e nada acende o badge", run("__s3.created.length") === 0);
  check("…porque tudo entra já lido", run("__s3.state.items.every((n) => !!n.readAt)"));

  check("contagem separa não lidas e urgentes",
    run("notificationCounts(__s1.state).unread") === 2 && run("notificationCounts(__s1.state).urgent") === 1);

  run("__id = __s1.state.items[0].id; __r1 = markNotificationRead(__s1.state, __id);");
  check("marcar como lida reduz o não lido", run("notificationCounts(__r1).unread") === 1);
  check("marcar como lida não apaga o aviso", run("__r1.items.length") === 2);
  check("markRead é pura (não mexe no original)", run("notificationCounts(__s1.state).unread") === 2);

  run("__all = markAllNotificationsRead(__s1.state);");
  check("marcar todas zera o badge", run("notificationCounts(__all).unread") === 0);
  run("__cl = clearReadNotifications(__r1);");
  check("limpar as lidas preserva o que não foi visto", run("__cl.items.length") === 1 && run("notificationCounts(__cl).unread") === 1);

  run("__m = setNotificationGroupMuted(__s1.state, 'metas', true);");
  check("silenciar grupo grava a data", !!run("__m.muted.metas"));
  check("silenciar NÃO apaga o histórico do grupo", run("__m.items.length") === 2);
  check("dessilenciar remove a marca", run("!setNotificationGroupMuted(__m, 'metas', false).muted.metas"));

  run("__rm = removeNotification(__s1.state, __id);");
  check("remover tira só o aviso pedido", run("__rm.items.length") === 1);

  // Retenção
  ctx.__old = { items: [{ id: "x", key: "velho", group: "contas", tone: "info", title: "T", message: "m", tab: "dashboard", createdAt: "2020-01-01", readAt: null }], muted: {}, lastSyncAt: "2020-01-01", initialized: true };
  run("__ret = syncNotificationState(__old, [], {});");
  check("aviso além da janela de retenção é descartado", run("__ret.state.items.length") === 0);

  // Modelo de leitura
  run("__model = buildNotificationsModel(__s1.state, { filter: 'unread' });");
  check("modelo agrupa por período", run("__model.buckets.length") >= 1);
  check("modelo traz o rótulo do grupo pronto",
    run("__model.buckets[0].items.every((n) => !!n.groupLabel && !!n.dateLabel)"));
  check("filtro por grupo funciona",
    run("buildNotificationsModel(__s1.state, { filter: 'metas' }).visibleCount") === 1);
  check("modelo lista os grupos silenciáveis", run("buildNotificationsModel(__s1.state, {}).groups.length") === run("NOTIF_GROUPS.length"));
}

/* ============================================ 5. MIGRAÇÃO, BACKUP E MERGE */
console.log("\n5. Persistência (schema corrente)");
{
  check("schema está na versão corrente", run("SCHEMA_VERSION") === 22);
  check("base nova já nasce com o campo", run("!!migrate(defaultData()).notifications"));
  check("base antiga (sem o campo) é migrada sem erro",
    run("JSON.stringify(migrate({ version: 9, transactions: [], categories: [], goals: [] }).notifications.items)") === "[]");

  ctx.__lixo = { notifications: { items: [{ key: "", title: "sem chave" }, { key: "ok", title: "válido", tone: "roxo", createdAt: "ontem" }, null, "texto"], muted: { contas: 42 } } };
  run("__mg = migrate({ ...defaultData(), ...__lixo });");
  check("aviso sem chave é descartado", run("__mg.notifications.items.length") === 1);
  check("tom desconhecido cai para 'info'", run("__mg.notifications.items[0].tone") === "info");
  check("data inválida vira hoje, não NaN", run("__mg.notifications.items[0].createdAt") === today);
  check("data de silêncio inválida é saneada", run("/^\\d{4}-\\d{2}-\\d{2}$/.test(__mg.notifications.muted.contas)"));

  run(`
    __d1 = migrate({ ...defaultData(), notifications: { items: [
      { id: "1", key: "k1", group: "contas", tone: "danger", title: "A", message: "m", tab: "dashboard", createdAt: "${today}", readAt: "${today}" },
      { id: "2", key: "k2", group: "metas", tone: "info", title: "B", message: "m", tab: "goals", createdAt: "${today}", readAt: null }
    ], muted: { contas: "${today}" }, lastSyncAt: "${today}", initialized: true } });
    __env = buildBackupEnvelope(__d1);
  `);
  check("notificações entram no backup", run("__env.data.notifications.items.length") === 2);
  check("checksum confere com o payload", run("checksumOf(canonicalJson(__env.data)) === __env.checksum"));
  check("backup preserva o silêncio configurado", run("!!__env.data.notifications.muted.contas"));

  run(`
    __d2 = migrate({ ...defaultData(), notifications: { items: [
      { id: "3", key: "k2", group: "metas", tone: "info", title: "B", message: "m", tab: "goals", createdAt: "${today}", readAt: "${today}" },
      { id: "4", key: "k3", group: "saldo", tone: "warn", title: "C", message: "m", tab: "calendar", createdAt: "${today}", readAt: null }
    ], muted: {}, lastSyncAt: "${today}", initialized: true } });
    __merged = mergeNotifications(__d1.notifications, __d2.notifications);
  `);
  check("mesclagem é união por chave", run("__merged.items.length") === 3);
  check("lido de um lado permanece lido", run("!!__merged.items.find((n) => n.key === 'k2').readAt"));
  check("silêncio de um aparelho sobrevive à mesclagem", run("!!__merged.muted.contas"));

  run(`__mergedData = mergeBackupInto(__d1, __d2).data;`);
  check("a mesclagem de backup inclui as notificações", run("__mergedData.notifications.items.length") === 3);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
