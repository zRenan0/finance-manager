// test-goals-inflation.js — harness do M36 (Metas e inflação).
//
// O QUE ESTE ARQUIVO PROVA
//
// 1. a correção é OPT-IN: meta sem a marcação sai exatamente como antes;
// 2. a conta é juro composto sobre a premissa de IPCA do próprio app, e não uma
//    taxa inventada na tela de metas;
// 3. o alvo GRAVADO continua sendo o preço de hoje: progresso, "faltam X" e
//    "meta concluída" não se mexem quando a marcação liga;
// 4. a ausência de correção é explicada (sem prazo, prazo curto, taxa zero);
// 5. o campo sobrevive a gravação, backup e normalização, e some sem estrago
//    quando um cliente antigo normaliza a meta;
// 6. nenhuma frase promete preço: o texto do conselho diz que é estimativa.
//
// Ferramenta de dev: `node tests/test-goals-inflation.js`.
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
// Prazo em dias fixos exige um "hoje" estável; ver tests/helpers/fixed-clock.js.
const relogio = require("./helpers/fixed-clock").congelar(ctx);

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/score.js",
  "js/metrics.js", "js/portfolio.js", "js/goals.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

const run = (code) => vm.runInContext(code, ctx);
const {
  buildGoalsModel, goalInflationView, goalInflationPct, inflateMoney,
  createGoalWithInitialBalance, migrate, defaultData, buildBackupEnvelope, parseBackupFile,
} = ctx;
const GOAL_INFLATION_MIN_DAYS = run("GOAL_INFLATION_MIN_DAYS");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
const inDays = (n) => ctx.isoOfDate(new ctx.Date(ctx.Date.now() + n * 86400000));

const goal = (p) => ({
  id: p.id || "g1", name: p.name || "Notebook", target: p.target || 0,
  current: p.current || 0, savedUpfront: 0, existingBalance: 0,
  deadline: p.deadline || "", icon: "piggy", createdAt: relogio.iso,
  monthlyPlan: p.monthlyPlan || 0,
  ...(p.inflationAdjusted != null ? { inflationAdjusted: p.inflationAdjusted } : {}),
});
// Premissas com IPCA declarado; é a MESMA fonte que os simuladores leem.
const dataCom = (ipca, goals) => ({
  ...defaultData(),
  marketRates: { selic: 15, cdi: 14.9, ipca, tr: 0.2, updatedAt: relogio.iso },
  goals, transactions: [],
});
const primeira = (data) => buildGoalsModel(data, relogio.now()).goals[0];

/* ------------------------------------------------------ 1. a aritmética */
console.log("\n1. Juro composto, não regra de três");
{
  // O exemplo do roteiro: R$ 5.000 hoje, 5% ao ano, dois anos → ~R$ 5.512.
  check("5.000 a 5% por 2 anos = 5.512,50", near(inflateMoney(5000, 5, 2), 5512.5), inflateMoney(5000, 5, 2));
  check("não é 5.500 (a regra de três subestima)", inflateMoney(5000, 5, 2) > 5500);
  check("1 ano a 5% = 5.250", near(inflateMoney(5000, 5, 1), 5250), inflateMoney(5000, 5, 1));
  check("taxa zero não move o valor", near(inflateMoney(5000, 0, 10), 5000));
  check("prazo zero não move o valor", near(inflateMoney(5000, 9, 0), 5000));
  check("taxa negativa não vira desconto", near(inflateMoney(5000, -3, 5), 5000));
  check("valor zero continua zero", near(inflateMoney(0, 12, 30), 0));
}

/* ------------------------------------------- 2. a taxa vem das premissas */
console.log("\n2. A taxa é a premissa do app, não um número da tela de metas");
{
  check("lê o IPCA das premissas", near(goalInflationPct(dataCom(7.25, [])), 7.25), goalInflationPct(dataCom(7.25, [])));
  check("dado sem premissas cai no padrão do app", goalInflationPct({}) > 0, goalInflationPct({}));
  const m = primeira(dataCom(10, [goal({ target: 5000, deadline: inDays(730), inflationAdjusted: true })]));
  check("mudar a premissa muda o alvo estimado", m.inflation.targetAtDeadline > 6000, m.inflation.targetAtDeadline);
  check("a taxa usada viaja no modelo, para a tela poder escrevê-la", near(m.inflation.pct, 10), m.inflation.pct);
}

/* ------------------------------------------------------ 3. é opt-in */
console.log("\n3. Sem a marcação, nada muda");
{
  const a = primeira(dataCom(5, [goal({ target: 5000, deadline: inDays(730) })]));
  const b = primeira(dataCom(5, [goal({ target: 5000, deadline: inDays(730), inflationAdjusted: true })]));

  check("meta sem marcação não recebe correção", a.inflation.on === false && a.inflation.reason === "off");
  check("meta sem marcação não ganha alvo corrigido", near(a.inflation.targetAtDeadline, 5000), a.inflation.targetAtDeadline);
  // O contrato central do módulo: ligar a correção não mexe em NENHUM número que
  // já existia. Se um destes mudar, tela, testes e histórico passam a discordar.
  ["target", "saved", "remaining", "pct", "done", "requiredMonthly", "plannedMonthly",
    "paceMonthly", "projectionRate", "etaMonths", "etaIso", "gap", "status"].forEach((campo) => {
    check(`ligar a correção não altera \`${campo}\``, JSON.stringify(a[campo]) === JSON.stringify(b[campo]), `${JSON.stringify(a[campo])} ≠ ${JSON.stringify(b[campo])}`);
  });
}

/* --------------------------------------------- 4. o que a correção diz */
console.log("\n4. A leitura corrigida");
{
  const m = primeira(dataCom(5, [goal({ target: 5000, deadline: inDays(730), inflationAdjusted: true })]));
  check("o alvo estimado bate o exemplo do roteiro", near(m.inflation.targetAtDeadline, 5511.87, 1), m.inflation.targetAtDeadline);
  check("o acréscimo é a diferença contra o alvo de hoje", near(m.inflation.extra, m.inflation.targetAtDeadline - 5000, 0.02), m.inflation.extra);
  check("o necessário corrigido é maior que o nominal", m.inflation.requiredMonthly > m.requiredMonthly, `${m.inflation.requiredMonthly} vs ${m.requiredMonthly}`);
  check("o necessário corrigido fecha a conta no prazo", near(m.inflation.requiredMonthly * m.monthsLeft, m.inflation.targetAtDeadline, m.monthsLeft), m.inflation.requiredMonthly * m.monthsLeft);
  check("sem saldo, o que falta é o alvo corrigido inteiro", near(m.inflation.remaining, m.inflation.targetAtDeadline, 0.02));

  const n = primeira(dataCom(5, [goal({ target: 5000, current: 2000, deadline: inDays(730), inflationAdjusted: true })]));
  check("saldo existente abate o alvo corrigido", near(n.inflation.remaining, n.inflation.targetAtDeadline - 2000, 0.02), n.inflation.remaining);
  check("o progresso continua medido pelo alvo de hoje", near(n.pct, 40), n.pct);
}

/* ------------------------------------ 5. quando NÃO há o que corrigir */
console.log("\n5. A ausência de correção é explicada, não escondida");
{
  const semPrazo = primeira(dataCom(5, [goal({ target: 5000, inflationAdjusted: true })]));
  check("sem prazo não há horizonte, e o motivo é declarado", semPrazo.inflation.reason === "sem-prazo", semPrazo.inflation.reason);
  check("sem prazo o alvo estimado é o de hoje", near(semPrazo.inflation.targetAtDeadline, 5000));

  const curto = primeira(dataCom(5, [goal({ target: 5000, deadline: inDays(GOAL_INFLATION_MIN_DAYS - 1), inflationAdjusted: true })]));
  check("prazo abaixo do mínimo não inventa correção", curto.inflation.reason === "prazo-curto", curto.inflation.reason);

  const semTaxa = primeira(dataCom(0, [goal({ target: 5000, deadline: inDays(730), inflationAdjusted: true })]));
  check("premissa em zero é dita, não silenciada", semTaxa.inflation.reason === "sem-taxa", semTaxa.inflation.reason);

  const concluida = primeira(dataCom(5, [goal({ target: 5000, current: 5000, deadline: inDays(730), inflationAdjusted: true })]));
  check("meta concluída não é reaberta pela inflação", concluida.inflation.reason === "concluida" && concluida.done === true, concluida.inflation.reason);

  const vencida = primeira(dataCom(5, [goal({ target: 5000, deadline: inDays(-30), inflationAdjusted: true })]));
  check("prazo vencido não recebe correção", vencida.inflation.reason === "prazo-curto", vencida.inflation.reason);
  check("prazo vencido continua com o status antigo", vencida.status === "late", vencida.status);
}

/* ------------------------------------------ 6. o aviso que muda decisão */
console.log("\n6. O ritmo que basta para hoje e não para o prazo");
{
  // Falta ~5.000 em ~24 meses → necessário ≈ 208/mês. O plano de 215 cobre o
  // alvo nominal e NÃO cobre o corrigido (~230/mês).
  const model = buildGoalsModel(dataCom(5, [goal({ target: 5000, deadline: inDays(730), monthlyPlan: 215, inflationAdjusted: true })]), relogio.now());
  const m = model.goals[0];
  check("o plano cobre o alvo de hoje", m.projectionRate >= m.requiredMonthly, `${m.projectionRate} vs ${m.requiredMonthly}`);
  check("o plano não cobre o alvo corrigido", m.inflation.covers === false, m.inflation.covers);
  check("a falta mensal causada pela inflação é medida", m.inflation.gap > 0, m.inflation.gap);

  const frase = model.advice.map((a) => a.text).join(" ");
  check("o conselho aparece", /poder de compra/.test(frase), frase.slice(0, 120));
  check("o conselho declara a taxa usada", /% ao ano/.test(frase));
  check("o conselho diz que é estimativa, não previsão", /estimativa, não previsão/.test(frase));
  check("nenhuma promessa de preço garantido", !/vai custar|custará|garantid/i.test(frase), frase.slice(0, 160));

  // Quem já não cobria nem o alvo nominal continua recebendo o aviso ANTIGO
  // (status "risk"), sem ganhar um segundo alerta sobre o mesmo problema.
  const fraco = buildGoalsModel(dataCom(5, [goal({ target: 5000, deadline: inDays(730), monthlyPlan: 50, inflationAdjusted: true })]), relogio.now());
  check("meta que já estava atrás não recebe conselho duplicado",
    fraco.advice.filter((a) => /poder de compra/.test(a.text)).length === 0,
    fraco.advice.map((a) => a.text.slice(0, 40)));
}

/* ---------------------------------- 7. persistência e compatibilidade */
console.log("\n7. Gravação, backup e cliente antigo");
{
  const criada = createGoalWithInitialBalance(migrate(defaultData()), {
    name: "Notebook", target: 5000, savedUpfront: 0, deadline: inDays(730),
    icon: "piggy", monthlyPlan: 200, inflationAdjusted: true,
  }, "cash", null);
  check("a marcação é gravada na meta", criada.goals[0].inflationAdjusted === true);

  const normalizada = migrate(criada);
  check("a marcação sobrevive à normalização", normalizada.goals[0].inflationAdjusted === true);

  const restaurada = parseBackupFile(JSON.stringify(buildBackupEnvelope(normalizada))).data;
  check("a marcação sobrevive ao backup", restaurada.goals[0].inflationAdjusted === true);

  const semCampo = migrate({ ...normalizada, goals: normalizada.goals.map((g) => { const copia = { ...g }; delete copia.inflationAdjusted; return copia; }) });
  check("meta antiga (sem o campo) normaliza para desligado", semCampo.goals[0].inflationAdjusted === false);
  check("meta antiga preserva alvo, prazo e plano", near(semCampo.goals[0].target, 5000)
    && semCampo.goals[0].deadline === normalizada.goals[0].deadline
    && near(semCampo.goals[0].monthlyPlan, 200));

  const lixo = migrate({ ...normalizada, goals: normalizada.goals.map((g) => ({ ...g, inflationAdjusted: "sim" })) });
  check("valor não booleano vira desligado", lixo.goals[0].inflationAdjusted === false);

  // O campo é opcional e aditivo: não subiu o SCHEMA_VERSION (mesmo critério do
  // `review` das recorrências, M33). Se alguém subir a versão sem migração, este
  // teste avisa antes de o servidor recusar o snapshot de todo mundo.
  check("SCHEMA_VERSION segue em 23", run("SCHEMA_VERSION") === 23, run("SCHEMA_VERSION"));
}

/* ------------------------------------------ 8. o modelo puro isolado */
console.log("\n8. goalInflationView responde sozinho");
{
  const base = { target: 1000, saved: 0, remaining: 1000, done: false, daysLeft: 365, monthsLeft: 12, projectionRate: 0, inflationPct: 10 };
  const off = goalInflationView({ deadline: "2030-01-01" }, base);
  check("sem a marcação devolve objeto neutro", off.on === false && off.requiredMonthly === null);
  const on = goalInflationView({ deadline: "2030-01-01", inflationAdjusted: true }, base);
  check("com a marcação corrige 10% em um ano", near(on.targetAtDeadline, 1100, 1), on.targetAtDeadline);
  check("ritmo zero não cobre o alvo corrigido", on.covers === false, on.covers);
  check("o objeto nunca é nulo (a tela sempre tem o que dizer)", !!off && !!on);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
