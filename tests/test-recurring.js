// test-recurring.js — harness do Módulo 7 (assinaturas e gastos recorrentes).
// O foco está nos três erros que o detector antigo cometia e que este motor
// existe para corrigir: cadência ignorada no total mensal, assinatura cancelada
// que nunca saía da conta e assinatura de preço fixo misturada com gasto
// recorrente de valor variável. Cobre também as propostas do §9, a migração
// v9→v10 e o backup.
// Ferramenta de dev: `node tests/test-recurring.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/import.js", "js/score.js",
 "js/metrics.js", "js/recurring.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const {
  buildRecurringModel, buildRecurringProposals, recPrefsOf, recPrefsWith,
  applyRecurringFlag, recCadenceOf, migrate, defaultData,
  buildBackupEnvelope, parseBackupFile, mergeBackupInto,
} = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const iso = (d) => ctx.isoOfDate(d);
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

const withTx = (transactions, extra) => migrate({ monthlyIncome: 6000, transactions, ...(extra || {}) });
const find = (list, name) => list.find((s) => s.name === name);

/* ================================================================= 1 */
console.log("\n1. Cadência sai do intervalo entre cobranças, não de \"apareceu em 2 meses\"");
{
  const transactions = [];
  for (let m = 5; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 55.9, categoryId: "assinaturas", date: monthsAgo(m, 12), description: "Netflix" }));
  }
  // Seguro anual: duas cobranças, separadas por 12 meses.
  transactions.push(tx({ type: "expense", amount: 1200, categoryId: "outros", date: monthsAgo(24, 5), description: "Seguro do carro" }));
  transactions.push(tx({ type: "expense", amount: 1200, categoryId: "outros", date: monthsAgo(12, 5), description: "Seguro do carro" }));

  const m = buildRecurringModel(withTx(transactions));
  const netflix = find(m.subscriptions, "Netflix");
  const seguro = find(m.subscriptions.concat(m.ended), "Seguro do carro");

  check("Netflix reconhecida como mensal", netflix && netflix.cadenceId === "mensal", netflix && netflix.cadenceId);
  check("Seguro reconhecido como anual", seguro && seguro.cadenceId === "anual", seguro && seguro.cadenceId);
  check("equivalente mensal do seguro é 1/12 da cobrança", seguro && near(seguro.monthlyEquivalent, 100), seguro && seguro.monthlyEquivalent);
  check("custo anual da Netflix é 12x a mensalidade", netflix && near(netflix.annualCost, 670.8), netflix && netflix.annualCost);
  check("total mensal NÃO soma o valor cheio do seguro", m.monthlyTotal < 200, m.monthlyTotal);
}

/* ================================================================= 2 */
console.log("\n2. Assinatura cancelada sai do total (o erro nº 2 do detector antigo)");
{
  // Spotify pago por 6 meses, último lançamento há 5 meses.
  const transactions = [];
  for (let m = 10; m >= 5; m--) {
    transactions.push(tx({ type: "expense", amount: 21.9, categoryId: "assinaturas", date: monthsAgo(m, 8), description: "Spotify" }));
  }
  transactions.push(tx({ type: "expense", amount: 39.9, categoryId: "assinaturas", date: monthsAgo(1, 8), description: "Prime" }));
  transactions.push(tx({ type: "expense", amount: 39.9, categoryId: "assinaturas", date: monthsAgo(0, 8), description: "Prime" }));

  const m = buildRecurringModel(withTx(transactions));
  check("Spotify vai para \"parou de cobrar\"", !!find(m.ended, "Spotify"));
  check("Spotify não aparece entre as assinaturas ativas", !find(m.subscriptions, "Spotify"));
  check("total mensal considera só a Prime", near(m.monthlyTotal, 39.9), m.monthlyTotal);
}

/* ================================================================= 3 */
console.log("\n3. Preço fixo (assinatura) x valor variável (gasto recorrente)");
{
  const transactions = [];
  for (let m = 4; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 99.9, categoryId: "assinaturas", date: monthsAgo(m, 15), description: "Internet" }));
    transactions.push(tx({ type: "expense", amount: 120 + m * 55, categoryId: "moradia", date: monthsAgo(m, 20), description: "Conta de luz" }));
  }
  const m = buildRecurringModel(withTx(transactions));
  check("Internet classificada como assinatura", !!find(m.subscriptions, "Internet"));
  check("Conta de luz classificada como recorrente variável", !!find(m.variable, "Conta de luz"));
  check("total de assinaturas ignora a luz", near(m.monthlyTotal, 99.9), m.monthlyTotal);
  check("total comprometido soma as duas", m.committedMonthly > 99.9, m.committedMonthly);
}

/* ================================================================= 4 */
console.log("\n4. Reajuste: percentual e impacto anual");
{
  const transactions = [];
  for (let m = 4; m >= 1; m--) {
    transactions.push(tx({ type: "expense", amount: 40, categoryId: "assinaturas", date: monthsAgo(m, 5), description: "Academia" }));
  }
  transactions.push(tx({ type: "expense", amount: 50, categoryId: "assinaturas", date: monthsAgo(0, 5), description: "Academia" }));

  const m = buildRecurringModel(withTx(transactions));
  const gym = find(m.subscriptions, "Academia");
  check("aumento de 25% detectado", gym && near(gym.increasePct, 25, 0.5), gym && gym.increasePct);
  check("impacto anual do reajuste é 12 x R$ 10", gym && near(gym.increaseAnnualImpact, 120), gym && gym.increaseAnnualImpact);
  check("entra na lista de reajustes", m.increases.length === 1 && m.increases[0].name === "Academia");
  check("variação desde a primeira cobrança também é exposta", gym && near(gym.sinceFirstPct, 25, 0.5), gym && gym.sinceFirstPct);
}

/* ================================================================= 5 */
console.log("\n5. Propostas de cadastro (§9)");
{
  const transactions = [];
  for (let m = 3; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 89.9, categoryId: "assinaturas", date: monthsAgo(m, 10), description: "Internet" }));
  }
  // Já marcado como recorrente: não deve virar proposta.
  for (let m = 3; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 1500, categoryId: "moradia", date: monthsAgo(m, 5), description: "Aluguel", recurring: true }));
  }
  // Duas ocorrências só: abaixo do portão de 3.
  transactions.push(tx({ type: "expense", amount: 70, categoryId: "saude", date: monthsAgo(1, 3), description: "Consulta" }));
  transactions.push(tx({ type: "expense", amount: 70, categoryId: "saude", date: monthsAgo(0, 3), description: "Consulta" }));

  const data = withTx(transactions);
  const m = buildRecurringModel(data);
  const names = m.proposals.map((p) => p.name);
  check("Internet vira proposta", names.includes("Internet"), names.join("|"));
  check("Aluguel já recorrente não vira proposta", !names.includes("Aluguel"));
  check("2 ocorrências não bastam", !names.includes("Consulta"));
  check("frase do padrão no formato do briefing", (m.proposals[0] || {}).pattern === "Todo dia 10", (m.proposals[0] || {}).pattern);

  // Recusar a proposta
  const dismissed = { ...data, recurringPrefs: recPrefsWith(data, "dismissed", m.proposals[0].key, "2024-01-01") };
  check("proposta recusada não volta a aparecer", buildRecurringModel(dismissed).proposals.every((p) => p.name !== "Internet"));

  // Aceitar: marca os lançamentos
  const applied = applyRecurringFlag(data, m.proposals[0].key, true);
  check("aceitar marca as 4 ocorrências", applied.touched === 4, applied.touched);
  check("aceitar não muda o total de lançamentos", applied.transactions.length === data.transactions.length);
  check("original não foi mutado", data.transactions.filter((t) => t.description === "Internet").every((t) => !t.recurring));
  const after = buildRecurringModel({ ...data, transactions: applied.transactions });
  check("depois de aceitar, some das propostas", after.proposals.every((p) => p.name !== "Internet"));
}

/* ================================================================= 6 */
console.log("\n6. \"Parar de acompanhar\" tira dos totais sem apagar lançamento");
{
  const transactions = [];
  for (let m = 3; m >= 0; m--) {
    transactions.push(tx({ type: "expense", amount: 55.9, categoryId: "assinaturas", date: monthsAgo(m, 12), description: "Netflix" }));
    transactions.push(tx({ type: "expense", amount: 21.9, categoryId: "assinaturas", date: monthsAgo(m, 14), description: "Spotify" }));
  }
  const data = withTx(transactions);
  const before = buildRecurringModel(data);
  const key = find(before.subscriptions, "Netflix").key;

  const ignoredData = { ...data, recurringPrefs: recPrefsWith(data, "ignored", key, "2024-05-01") };
  const after = buildRecurringModel(ignoredData);
  check("sai da lista de assinaturas", !find(after.subscriptions, "Netflix"));
  check("aparece na lista de ignoradas", !!find(after.ignored, "Netflix"));
  check("total mensal cai para só o Spotify", near(after.monthlyTotal, 21.9), after.monthlyTotal);
  check("nenhum lançamento foi removido", ignoredData.transactions.length === data.transactions.length);
  check("data do \"parar de acompanhar\" é preservada", find(after.ignored, "Netflix").ignoredAt === "2024-05-01");

  const back = buildRecurringModel({ ...data, recurringPrefs: recPrefsWith(ignoredData, "ignored", key, null) });
  check("voltar a acompanhar restaura o total", near(back.monthlyTotal, 77.8), back.monthlyTotal);
}

/* ================================================================= 7 */
console.log("\n7. O que NÃO é recorrência");
{
  const transactions = [
    // Parcelamento: tem fim, não é assinatura.
    tx({ type: "expense", amount: 200, categoryId: "outros", date: monthsAgo(2, 7), description: "Notebook", installmentGroupId: "g1", installmentIndex: 1, installmentTotal: 3 }),
    tx({ type: "expense", amount: 200, categoryId: "outros", date: monthsAgo(1, 7), description: "Notebook", installmentGroupId: "g1", installmentIndex: 2, installmentTotal: 3 }),
    tx({ type: "expense", amount: 200, categoryId: "outros", date: monthsAgo(0, 7), description: "Notebook", installmentGroupId: "g1", installmentIndex: 3, installmentTotal: 3 }),
    // Aporte em meta: não é cobrança.
    tx({ type: "expense", amount: 300, categoryId: "investimento", date: monthsAgo(2, 9), description: "Aporte", goalId: "g" }),
    tx({ type: "expense", amount: 300, categoryId: "investimento", date: monthsAgo(1, 9), description: "Aporte", goalId: "g" }),
    tx({ type: "expense", amount: 300, categoryId: "investimento", date: monthsAgo(0, 9), description: "Aporte", goalId: "g" }),
    // Receita.
    tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(1, 5), description: "Salário" }),
    tx({ type: "income", amount: 6000, categoryId: "salario", date: monthsAgo(0, 5), description: "Salário" }),
    // Intervalo caótico: 3 dias, depois 200.
    tx({ type: "expense", amount: 30, categoryId: "lazer", date: daysAgo(210), description: "Cinema" }),
    tx({ type: "expense", amount: 30, categoryId: "lazer", date: daysAgo(207), description: "Cinema" }),
    tx({ type: "expense", amount: 30, categoryId: "lazer", date: daysAgo(5), description: "Cinema" }),
  ];
  const m = buildRecurringModel(withTx(transactions));
  const all = m.subscriptions.concat(m.variable, m.ended).map((s) => s.name);
  check("parcelamento fora", !all.includes("Notebook"), all.join("|"));
  check("aporte em meta fora", !all.includes("Aporte"));
  check("receita fora", !all.includes("Salário"));
  check("intervalo irregular fora", !all.includes("Cinema"));
}

/* ================================================================= 8 */
console.log("\n8. Próxima cobrança avança por mês, não por 30 dias");
{
  const transactions = [];
  // Cobrança sempre no dia 31 — fevereiro não pode empurrar para março.
  [4, 3, 2, 1, 0].forEach((m) => {
    const d = new Date();
    const ref = new Date(d.getFullYear(), d.getMonth() - m + 1, 0); // último dia
    transactions.push(tx({ type: "expense", amount: 30, categoryId: "assinaturas", date: iso(ref), description: "Nuvem" }));
  });
  const m = buildRecurringModel(withTx(transactions));
  const s = find(m.subscriptions.concat(m.variable), "Nuvem");
  check("reconhecida como mensal", s && s.cadenceId === "mensal", s && s.cadenceId);
  check("próxima data é futura", s && s.nextDate > ctx.todayIso(), s && s.nextDate);
  check("próxima data é válida (dia existe no mês)", s && !isNaN(new Date(s.nextDate + "T00:00:00").getTime()));
}

/* ================================================================= 9 */
console.log("\n9. Cadências e faixas");
{
  check("30 dias → mensal", recCadenceOf(30).id === "mensal");
  check("7 dias → semanal", recCadenceOf(7).id === "semanal");
  check("15 dias → quinzenal", recCadenceOf(15).id === "quinzenal");
  check("365 dias → anual", recCadenceOf(365).id === "anual");
  check("45 dias → nenhuma faixa (vale de propósito)", recCadenceOf(45) === null);
  check("semanal tem 52 cobranças/ano", recCadenceOf(7).perYear === 52);
}

/* ================================================================ 10 */
console.log("\n10. Migração v9 → v10 e preferências corrompidas");
{
  const legacy = migrate({ version: 9, transactions: [], goals: [] });
  check("base antiga ganha recurringPrefs", !!legacy.recurringPrefs && !!legacy.recurringPrefs.ignored);
  // A asserção acompanha o SCHEMA_VERSION em vez de fixar o número: cada módulo
  // novo sobe o schema, e o teste do M7 não deveria quebrar por isso.
  check("versão sobe para a atual do schema", legacy.version === run("SCHEMA_VERSION"), legacy.version);

  const dirty = migrate({
    version: 9,
    recurringPrefs: { ignored: { "netflix|assinaturas": "2024-03-05", "": "x", ruim: 42 }, dismissed: "não é objeto", lixo: 1 },
  });
  check("chave válida preservada", dirty.recurringPrefs.ignored["netflix|assinaturas"] === "2024-03-05");
  check("chave vazia descartada", dirty.recurringPrefs.ignored[""] === undefined);
  check("valor não-ISO vira data de hoje", /^\d{4}-\d{2}-\d{2}$/.test(dirty.recurringPrefs.ignored.ruim));
  check("bucket não-objeto vira vazio", Object.keys(dirty.recurringPrefs.dismissed).length === 0);
  check("bucket desconhecido não entra", dirty.recurringPrefs.lixo === undefined);
}

/* ================================================================ 11 */
console.log("\n11. Backup e mesclagem");
{
  const base = migrate({ transactions: [], recurringPrefs: { ignored: { "a|x": "2024-01-01" } } });
  const env = buildBackupEnvelope(base);
  check("recurringPrefs entra no envelope", !!env.data.recurringPrefs.ignored["a|x"]);
  const parsed = parseBackupFile(JSON.stringify(env));
  check("checksum continua válido com o campo novo", parsed.meta.checksumOk === true);
  check("prefs sobrevivem ao ciclo exportar → importar", parsed.data.recurringPrefs.ignored["a|x"] === "2024-01-01");

  const current = migrate({ transactions: [], recurringPrefs: { ignored: { "b|y": "2024-02-02" } } });
  const merged = mergeBackupInto(current, parsed.data);
  check("mesclagem une os dois lados", !!merged.data.recurringPrefs.ignored["a|x"] && !!merged.data.recurringPrefs.ignored["b|y"]);

  const olderFile = migrate({ transactions: [], recurringPrefs: { ignored: { "b|y": "2023-01-01" } } });
  const merged2 = mergeBackupInto(current, olderFile);
  check("conflito resolvido pela data mais recente", merged2.data.recurringPrefs.ignored["b|y"] === "2024-02-02", merged2.data.recurringPrefs.ignored["b|y"]);

  const legacyBackup = parseBackupFile(JSON.stringify({ version: 8, transactions: [], categories: [], goals: [] }));
  check("backup antigo (sem o campo) continua aceito", legacyBackup.meta.legacy === true);
  check("…e é normalizado na leitura", !!legacyBackup.data.recurringPrefs);
}

/* ================================================================ 12 */
console.log("\n12. Modelo resistente a base vazia e a dado quebrado");
{
  const empty = buildRecurringModel(defaultData());
  check("base vazia não quebra", empty.subscriptions.length === 0 && empty.monthlyTotal === 0);
  check("proposta vazia", empty.proposals.length === 0);
  check("contadores zerados", empty.counts.subscriptions === 0 && empty.counts.ignored === 0);

  const broken = migrate({
    transactions: [
      { id: "x1", type: "expense", amount: 10, categoryId: "outros", date: "", description: "Fantasma" },
      { id: "x2", type: "expense", amount: 10, categoryId: "outros", date: "", description: "Fantasma" },
    ],
  });
  let ok = true;
  try { buildRecurringModel(broken); } catch (e) { ok = false; }
  check("data inválida não derruba o modelo", ok);

  const prefs = recPrefsOf({ recurringPrefs: null });
  check("recPrefsOf tolera null", !!prefs.ignored && !!prefs.dismissed && !!prefs.confirmed);
}

console.log(`\n${pass} passaram, ${fail} falharam.\n`);
process.exit(fail ? 1 : 0);
