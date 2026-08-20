// test-achievements.js — harness do Módulo 6 (gamificação).
// Cobre: contagem de sequências (incluindo o mês corrente ainda em aberto),
// a natureza "sticky" do desbloqueio, o progresso das conquistas trancadas,
// os níveis, a migração v8→v9 e a memoização por identidade do snapshot.
// Ferramenta de dev: `node tests/test-achievements.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.addEventListener = () => {};
ctx.requestIdleCallback = undefined;
ctx.requestAnimationFrame = undefined;
ctx.setTimeout = setTimeout;
ctx.matchMedia = undefined;
vm.createContext(ctx);

[
  "js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js",
  "js/score.js", "js/metrics.js", "js/achievements.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const {
  buildAchievementsModel, buildAchievementContext, achStreak, levelForXp,
  withUnlockedAchievements, achievementById, memoByData, memoSize,
  migrate, defaultData,
} = ctx;
const ACHIEVEMENTS = run("ACHIEVEMENTS");
const ACH_LEVELS = run("ACH_LEVELS");
const ACH_GROUPS = run("ACH_GROUPS");
const ACH_TIERS = run("ACH_TIERS");
const ACH_TOTAL_XP = run("ACH_TOTAL_XP");

const SCHEMA_VERSION = run("SCHEMA_VERSION");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}

const iso = (d) => ctx.isoOfDate(d);
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

// Base mínima: renda declarada e nada mais.
function base(patch) {
  return migrate({ ...defaultData(), monthlyIncome: 5000, ...(patch || {}) });
}
const model = (data) => buildAchievementsModel(data, new Date());
const item = (m, id) => m.items.find((i) => i.id === id);

/* -------------------------------------------------- 1. catálogo coerente */
console.log("\n1. O catálogo está bem formado");
{
  const ids = ACHIEVEMENTS.map((a) => a.id);
  check("ids únicos", new Set(ids).size === ids.length);
  check("todo grupo declarado existe",
    ACHIEVEMENTS.every((a) => ACH_GROUPS.some((g) => g.id === a.group)));
  check("todo tier declarado existe",
    ACHIEVEMENTS.every((a) => !!ACH_TIERS[a.tier]));
  check("todo XP é positivo", ACHIEVEMENTS.every((a) => a.xp > 0));
  check("o nível máximo é alcançável antes de 100% das conquistas",
    ACH_LEVELS[ACH_LEVELS.length - 1].xp < ACH_TOTAL_XP,
    `${ACH_LEVELS[ACH_LEVELS.length - 1].xp} < ${ACH_TOTAL_XP}`);
  check("níveis em ordem crescente de XP",
    ACH_LEVELS.every((l, i) => i === 0 || l.xp > ACH_LEVELS[i - 1].xp));
  check("achievementById encontra pelo id", achievementById("first-tx") !== null);
  check("achievementById devolve null para id inexistente", achievementById("nao-existe") === null);
}

/* -------------------------------------------------- 2. sequências */
console.log("\n2. Sequência de meses (o mês corrente ainda está acontecendo)");
{
  const h = (arr) => arr.map((v) => ({ ok: v }));
  const p = (x) => x.ok;
  check("sequência simples", achStreak(h([false, true, true, true]), p) === 3);
  check("mês corrente vazio NÃO zera a sequência anterior",
    achStreak(h([true, true, true, false]), p) === 3);
  check("dois meses vazios no fim quebram", achStreak(h([true, true, false, false]), p) === 0);
  check("histórico sem nada devolve zero", achStreak(h([false, false]), p) === 0);
  check("histórico vazio devolve zero", achStreak([], p) === 0);
}

/* -------------------------------------------------- 3. níveis */
console.log("\n3. Níveis e barra de progresso");
{
  const l0 = levelForXp(0);
  check("XP zero começa no nível 1", l0.level === 1 && l0.levelFloor === 0);
  check("progresso dentro da faixa, não sobre o total", l0.progress === 0);

  const meio = levelForXp((ACH_LEVELS[0].xp + ACH_LEVELS[1].xp) / 2);
  check("metade da faixa devolve ~50%", Math.abs(meio.progress - 0.5) < 0.01, meio.progress);
  check("faltando XP até o próximo nível", meio.toNext === ACH_LEVELS[1].xp - meio.xp);

  const topo = levelForXp(999999);
  check("XP acima de tudo trava no último nível", topo.level === ACH_LEVELS.length);
  check("nível máximo marca isMax e barra cheia", topo.isMax === true && topo.progress === 1);
  check("XP negativo não quebra", levelForXp(-50).level === 1);
}

/* -------------------------------------------------- 4. desbloqueio real */
console.log("\n4. Conquistas destravam com o dado real");
{
  const vazio = model(base());
  check("base vazia: nada conquistado além da renda declarada",
    item(vazio, "first-tx").done === false && item(vazio, "income-set").done === true);
  check("renda declarada conta como conquista de início",
    item(vazio, "income-set").xp > 0 && vazio.xp === item(vazio, "income-set").xp);

  const comTx = model(base({
    transactions: [
      tx({ type: "expense", amount: 100, categoryId: "mercado", date: monthsAgo(0) }),
      tx({ type: "income", amount: 900, categoryId: "outros", date: monthsAgo(0) }),
    ],
  }));
  check("primeiro lançamento destrava", item(comTx, "first-tx").done === true);
  check("primeira receita destrava", item(comTx, "first-income").done === true);
  check("500 lançamentos continuam trancados", item(comTx, "tx-500").done === false);

  const semRenda = model(migrate({ ...defaultData() }));
  check("sem renda declarada a conquista fica trancada", item(semRenda, "income-set").done === false);
}

/* -------------------------------------------------- 5. progresso do trancado */
console.log("\n5. O que está trancado mostra progresso, não um cadeado mudo");
{
  const txs = [];
  for (let i = 0; i < 50; i++) txs.push(tx({ type: "expense", amount: 10, categoryId: "mercado", date: monthsAgo(0) }));
  const m = model(base({ transactions: txs }));
  const c = item(m, "tx-100");
  check("progresso é fração real do alvo", Math.abs(c.progress - 0.5) < 0.001, c.progress);
  check("current e target vêm na mesma unidade", c.current === 50 && c.target === 100);
  check("100 lançamentos já conquistado permanece em 1", item(m, "tx-25").progress === 1);
  check("progresso nunca passa de 1", m.items.every((i) => i.progress <= 1));
  check("progresso nunca é negativo", m.items.every((i) => i.progress >= 0));
}

/* -------------------------------------------------- 6. sticky */
console.log("\n6. Conquista desbloqueada não volta a trancar");
{
  const dados = base({ achievements: { unlocked: { "streak-12": "2024-01-15" } } });
  const m = model(dados);
  const c = item(m, "streak-12");
  check("registro antigo mantém a conquista", c.done === true);
  check("mas o motor sabe que o dado de hoje não a satisfaz", c.meetsNow === false);
  check("não é reofertada como celebração", c.isNew === false);
  check("a data do desbloqueio é preservada", c.unlockedAt === "2024-01-15");
  check("o XP dela entra no total", m.xp >= c.xp);
}

/* -------------------------------------------------- 7. gravação */
console.log("\n7. withUnlockedAchievements é puro e idempotente");
{
  const antes = { unlocked: { a: "2024-01-01" } };
  const depois = withUnlockedAchievements(antes, ["b"], "2025-06-02");
  check("não muta o objeto original", antes.unlocked.b === undefined);
  check("acrescenta o novo id com data", depois.unlocked.b === "2025-06-02");
  check("preserva os antigos", depois.unlocked.a === "2024-01-01");

  const denovo = withUnlockedAchievements(depois, ["b"], "2030-01-01");
  check("regravar NÃO sobrescreve a data original", denovo.unlocked.b === "2025-06-02");
  check("record indefinido não quebra",
    Object.keys(withUnlockedAchievements(undefined, ["x"], "2025-01-01").unlocked).length === 1);
  check("lista vazia devolve o mesmo conteúdo",
    Object.keys(withUnlockedAchievements(antes, [], "2025-01-01").unlocked).length === 1);
}

/* -------------------------------------------------- 8. migração v8→v9 */
console.log("\n8. Migração v8 → v9");
{
  const v8 = migrate({ version: 8, monthlyIncome: 3000 });
  check("base antiga ganha o mapa vazio",
    v8.achievements && typeof v8.achievements.unlocked === "object" &&
    Object.keys(v8.achievements.unlocked).length === 0);
  check("versão sobe para a corrente", v8.version === SCHEMA_VERSION, v8.version);

  const sujo = migrate({ version: 9, achievements: { unlocked: { ok: "2025-03-04", ruim: 12345, "": "2025-01-01" } } });
  check("data inválida vira hoje em vez de quebrar",
    /^\d{4}-\d{2}-\d{2}$/.test(sujo.achievements.unlocked.ruim));
  check("chave vazia é descartada", sujo.achievements.unlocked[""] === undefined);
  check("data válida é preservada", sujo.achievements.unlocked.ok === "2025-03-04");

  const nulo = migrate({ version: 9, achievements: null });
  check("achievements nulo não derruba a migração",
    nulo.achievements && Object.keys(nulo.achievements.unlocked).length === 0);

  check("achievements é chave de configuração persistida",
    run("SETTING_KEYS").includes("achievements"));
}

/* -------------------------------------------------- 9. modelo agregado */
console.log("\n9. Forma do modelo");
{
  const m = model(base({
    transactions: [tx({ type: "expense", amount: 50, categoryId: "mercado", date: monthsAgo(0) })],
    goals: [{ id: "g1", name: "Viagem", target: 1000, current: 1000, savedUpfront: 0, deadline: "", icon: "plane", createdAt: monthsAgo(3), monthlyPlan: 0 }],
  }));
  check("total bate com o catálogo", m.total === ACHIEVEMENTS.length);
  check("grupos cobrem todas as conquistas",
    m.byGroup.reduce((s, g) => s + g.total, 0) === ACHIEVEMENTS.length);
  check("meta concluída destrava goal-done", item(m, "goal-done").done === true);
  check("três metas ainda não", item(m, "goal-done-3").done === false);
  check("nextUp só traz trancadas", m.nextUp.every((i) => !i.done));
  check("nextUp vem ordenado do mais próximo", m.nextUp.every((i, k, arr) => k === 0 || arr[k - 1].progress >= i.progress));
  check("no máximo 3 sugestões", m.nextUp.length <= 3);
  check("completionPct é coerente",
    m.completionPct === Math.round((m.unlockedCount / m.total) * 100));
  check("nível derivado do XP", m.level.level === levelForXp(m.xp).level);
  check("pendingIds lista o que ainda não foi gravado",
    m.pendingIds.length === m.items.filter((i) => i.isNew).length);
  check("maxXp é o total do catálogo", m.maxXp === ACH_TOTAL_XP);
}

/* -------------------------------------------------- 10. contexto */
console.log("\n10. Contexto: só conta mês com movimento real");
{
  // Renda fixa de 5.000 e nenhum lançamento: no papel "sobrou" 5.000 todo mês.
  // Sem esse portão, o app daria 24 meses de sequência a quem nunca usou.
  const c = buildAchievementContext(base(), new Date());
  check("mês sem lançamento não conta como mês economizando", c.savingStreak === 0);
  check("nem como mês ativo", c.activeStreak === 0 && c.activeMonths === 0);
  check("total economizado é zero", c.totalSaved === 0);

  const comMovimento = buildAchievementContext(base({
    transactions: [
      tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(1, 5) }),
      tx({ type: "expense", amount: 1000, categoryId: "mercado", date: monthsAgo(1) }),
      tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(2, 5) }),
      tx({ type: "expense", amount: 1000, categoryId: "mercado", date: monthsAgo(2) }),
    ],
  }), new Date());
  check("dois meses com movimento e sobra contam", comMovimento.savingStreak === 2, comMovimento.savingStreak);
  check("total economizado soma os meses positivos", comMovimento.totalSaved === 8000, comMovimento.totalSaved);
}

/* -------------------------------------------------- 11. memoização */
console.log("\n11. memoByData (perf.js)");
{
  const d1 = base();
  let calls = 0;
  const f = () => { calls++; return { v: calls }; };
  const a = memoByData("t", d1, "k", f);
  const b = memoByData("t", d1, "k", f);
  check("mesmo snapshot + mesma chave → uma execução só", calls === 1 && a === b);

  memoByData("t", d1, "outra", f);
  check("chave diferente recalcula", calls === 2);

  const d2 = { ...d1, transactions: [] };
  memoByData("t", d2, "k", f);
  check("snapshot novo invalida o cache", calls === 3);
  check("cache é por snapshot", memoSize(d1) === 2 && memoSize(d2) === 1);

  calls = 0;
  memoByData("t", null, "k", f);
  check("data inválida cai no cálculo direto sem quebrar", calls === 1);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
