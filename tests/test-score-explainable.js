// test-score-explainable.js — [M27] a nota de saúde financeira, explicada.
//
// O painel faz UMA promessa numérica: "fechar essa lacuna somaria até N pontos".
// Um app que promete pontos que não existem é pior do que um app que não explica
// nada, então a maior parte deste arquivo é sobre a aritmética dessa frase.
//
// A invariante central: a nota é normalizada sobre o peso do que foi AVALIADO,
// não sobre 100. Logo, somar todos os ganhos disponíveis tem de dar exatamente
// 100 menos a nota atual. Nem mais (promessa inflada), nem menos (ganho
// escondido).
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
vm.createContext(ctx);
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js",
  "js/debts.js", "js/metrics.js", "js/wealth.js", "js/goals.js", "js/score.js", "js/demo.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

ctx.__demo = run(`buildDemoData()`);
const modelo = run(`computeFinanceScore(__demo, keyOfDate(new Date()))`);
ctx.__modelo = modelo;
const ganhos = run(`scoreGains(__modelo)`);

section("1. O motor expõe o que o painel precisa mostrar");
{
  check("a nota existe", Number.isInteger(modelo.score), modelo.score);
  check("o peso avaliado é exposto", modelo.maxWeight > 0, modelo.maxWeight);
  check("os pontos ganhos são expostos", modelo.earned > 0, modelo.earned);
  check("a nota é os pontos sobre o peso avaliado",
    Math.round((modelo.earned / modelo.maxWeight) * 100) === modelo.score,
    { earned: modelo.earned, maxWeight: modelo.maxWeight, score: modelo.score });
  check("cada pilar traz pontos, peso e motivo",
    ganhos.every((g) => Number.isFinite(g.points) && g.weight > 0 && typeof g.detail === "string"));
  check("nenhum pilar ganha mais pontos que o próprio peso",
    ganhos.every((g) => g.points <= g.weight + 0.01),
    ganhos.filter((g) => g.points > g.weight + 0.01).map((g) => g.id));
}

section("2. A ARITMÉTICA DA PROMESSA");
{
  const soma = ganhos.reduce((s, g) => s + g.gain, 0);
  check("somar todos os ganhos leva exatamente a 100",
    Math.abs((modelo.score + soma) - 100) < 1, { score: modelo.score, soma: +soma.toFixed(2) });
  check("nenhum ganho é negativo", ganhos.every((g) => g.gain >= 0));
  check("pilar cheio não promete ganho",
    ganhos.filter((g) => g.ratio >= 1).every((g) => g.gain < 0.01),
    ganhos.filter((g) => g.ratio >= 1 && g.gain >= 0.01).map((g) => g.id));
  check("a lista vem ordenada pelo maior ganho",
    ganhos.every((g, i) => i === 0 || ganhos[i - 1].gain >= g.gain),
    ganhos.map((g) => +g.gain.toFixed(1)));
  check("o maior ganho não leva a nota acima de 100",
    ganhos.length === 0 || modelo.score + ganhos[0].gain <= 100.01);

  // A divisão pelo peso avaliado é o coração da correção. Sem ela, um pilar de
  // peso 15 prometeria 15 pontos mesmo quando só 90 de peso foram avaliados,
  // onde ele vale ~16,7. Este teste falha se alguém "simplificar" a fórmula.
  const maior = ganhos[0];
  if (maior) {
    const cru = maior.weight * (1 - maior.ratio);
    const normalizado = (cru / modelo.maxWeight) * 100;
    check("o ganho é normalizado pelo peso avaliado, não pelo peso bruto",
      Math.abs(maior.gain - normalizado) < 0.01 && (modelo.maxWeight === 100 || Math.abs(maior.gain - cru) > 0.01),
      { gain: +maior.gain.toFixed(2), cru: +cru.toFixed(2), maxWeight: modelo.maxWeight });
  }

  // Pilar fora da conta não pode virar promessa: ele não tem base de cálculo.
  check("pilar sem base de cálculo fica fora dos ganhos",
    ganhos.length === modelo.pillars.filter((p) => p.applicable).length,
    { ganhos: ganhos.length, aplicaveis: modelo.pillars.filter((p) => p.applicable).length });
}

section("3. Sem base, sem nota e sem painel");
{
  ctx.__vazio = run(`migrate(defaultData())`);
  const vazio = run(`computeFinanceScore(__vazio, keyOfDate(new Date()))`);
  check("base vazia não produz nota", vazio.insufficient === true && vazio.score === null);
  check("base vazia não produz ganhos", run(`scoreGains(computeFinanceScore(__vazio, keyOfDate(new Date())))`).length === 0);
  check("modelo nulo não quebra", run(`scoreGains(null)`).length === 0);
  check("modelo sem peso avaliado não quebra",
    run(`scoreGains({ score: 50, insufficient: false, maxWeight: 0, pillars: [] })`).length === 0);
}

section("4. O painel diz o que o roteiro pede");
{
  const tela = readSrc("js/screens/health.js");
  check("existe o painel", /function renderScoreBreakdown/.test(tela));
  check("é chamado na tela de saúde", /\$\{renderScoreBreakdown\(model\.score\)\}/.test(tela));
  check("tem o título do roteiro", /Sua pontuação/.test(tela));
  check("mostra pontos sobre o peso", /de \$\{p\.weight\}/.test(tela));
  check("mostra o motivo de cada pilar", /p\.detail/.test(tela));
  check("mostra como melhorar", /p\.advice/.test(tela));
  check("traz a frase do maior ganho",
    /maior ganho disponível está em/.test(tela) && /somaria até/.test(tela));
  check("a promessa é um teto, não uma previsão", /somaria até/.test(tela) && /chegando perto de/.test(tela));

  // "NÃO apresentar falsa precisão científica" é requisito do roteiro.
  check("declara que é indicador educacional", /Indicador educacional/.test(tela));
  check("nega explicitamente ser score de crédito",
    /Não é score de crédito/.test(tela) && /não é usado por banco nenhum/.test(tela));
  check("explica o que acontece com pilar sem base",
    /ficam fora da conta em vez de virar nota baixa/.test(tela));
  check("mostra a cobertura quando ela não é total", /s\.coverage < 100/.test(tela));

  // Ganho irrelevante não vira conselho: meio ponto não muda a vida de ninguém.
  check("ganho abaixo de meio ponto não vira recomendação", /maior\.gain >= 0\.5/.test(tela));
  check("sem lacuna relevante o texto muda", /Nenhum pilar tem lacuna relevante agora/.test(tela));

  check("a barra é decorativa e o número é a informação",
    /role="img"/.test(tela) && /aria-label="\$\{escapeHtml\(p\.label\)\}: \$\{pontos\} de \$\{p\.weight\} pontos"/.test(tela));
  check("todo texto do painel é escapado",
    !/\$\{p\.detail\}/.test(tela) && !/\$\{p\.advice\}/.test(tela) && !/\$\{p\.label\}/.test(tela));
}

section("5. O motor não foi alterado, só exposto");
{
  const motor = readSrc("js/score.js");
  check("os sete pilares continuam lá",
    ["poupanca", "gastos", "reserva", "investimento", "patrimonio", "pontualidade", "credito"]
      .every((id) => new RegExp(`id: "${id}"`).test(motor)));
  check("os pesos não mudaram",
    (motor.match(/weight: \d+/g) || []).join(",") === "weight: 25,weight: 15,weight: 20,weight: 15,weight: 10,weight: 10,weight: 5",
    (motor.match(/weight: \d+/g) || []).join(","));
  check("a soma dos pesos continua 100",
    (motor.match(/weight: (\d+)/g) || []).reduce((s, m) => s + Number(m.split(" ")[1]), 0) === 100);
  check("scoreGains é puro: sem DOM, sem state",
    !/document\.|\bstate\./.test(motor.slice(motor.indexOf("function scoreGains"), motor.indexOf("function computeFinanceScore"))));
  check("pilar que não se aplica continua saindo da conta, não zerando",
    /applicable: false/.test(motor) && /SAEM da conta/.test(motor)
    && /normalizada sobre o peso do que foi/.test(motor));
}

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
