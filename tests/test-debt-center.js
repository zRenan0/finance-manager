// test-debt-center.js — [M34] Central de dívidas: atraso, multa e estratégias.
//
// O risco deste módulo não é a conta: é a AFIRMAÇÃO.
//
//   * dizer que alguém está inadimplente porque um campo de data ficou velho;
//   * inventar a multa do contrato porque a lei tem um teto;
//   * eleger a avalanche como "a melhor" e transformar uma escolha pessoal em
//     veredito do aplicativo.
//
// Por isso metade deste arquivo confere números e a outra metade confere o que
// a tela tem permissão de dizer.
//
// Ferramenta de dev: `node tests/test-debt-center.js`.
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
const relogio = require("./helpers/fixed-clock").congelar(ctx);
const Date = relogio.DataFixa;
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js",
  "js/budgets.js", "js/metrics.js", "js/debts.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);
const { makeAsset, migrate, buildDebtModel, debtLateInfo, debtStrategyComparison, debtBurdenReading } = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }
const perto = (a, b, tol = 0.02) => Math.abs(a - b) < tol;

const HOJE = relogio.iso;
const diasAtras = (n) => ctx.isoOfDate(new Date(new Date(`${HOJE}T12:00:00`).getTime() - n * 86400000));
const diasAFrente = (n) => ctx.isoOfDate(new Date(new Date(`${HOJE}T12:00:00`).getTime() + n * 86400000));

let seq = 0;
const divida = (over) => makeAsset({
  id: `d${++seq}`, class: "divida", name: "Dívida", value: 5000,
  monthlyPayment: 500, ratePct: 3, ratePeriod: "month", ...over,
});

/* ===================================================================== 1 */
section("1. [M34] Atraso: o que o app viu, não o que ele supõe");
{
  const emDia = divida({ nextDueDate: diasAFrente(5) });
  check("vencimento futuro não é atraso", debtLateInfo(emDia, [], HOJE).late === false);

  const semData = divida({ nextDueDate: "" });
  check("sem data informada não há acusação", debtLateInfo(semData, [], HOJE).late === false);

  const vencida = divida({ id: "atrasada", nextDueDate: diasAtras(40) });
  const info = debtLateInfo(vencida, [], HOJE);
  check("vencimento passado sem pagamento é atraso", info.late === true);
  check("os dias de atraso são contados", info.daysLate === 40, info.daysLate);

  // O CAMPO VELHO NÃO É INADIMPLÊNCIA.
  const comPagamento = debtLateInfo(vencida, [{ debtId: "atrasada", date: diasAtras(10) }], HOJE);
  check("pagamento registrado depois do vencimento derruba a acusação", comPagamento.late === false);
  check("e vira pedido de atualização de data", comPagamento.likelyPaid === true);
  const pagamentoAntes = debtLateInfo(vencida, [{ debtId: "atrasada", date: diasAtras(50) }], HOJE);
  check("pagamento ANTERIOR ao vencimento não conta", pagamentoAntes.late === true);
  const deOutraDivida = debtLateInfo(vencida, [{ debtId: "outra", date: diasAtras(3) }], HOJE);
  check("pagamento de outra dívida não conta", deOutraDivida.late === true);
}

/* ===================================================================== 2 */
section("2. [M34] Multa e mora saem do contrato, nunca do teto legal");
{
  const semEncargos = divida({ id: "sem", nextDueDate: diasAtras(30) });
  const info = debtLateInfo(semEncargos, [], HOJE);
  check("sem multa cadastrada, não há custo estimado", info.estimatedCost === null && info.costKnown === false);
  check("a tela sabe o que falta", info.missing.indexOf("multa") >= 0 && info.missing.indexOf("mora") >= 0, info.missing);
  check("o app NÃO assume os 2% do CDC", info.fine === null, info.fine);

  const comEncargos = divida({ id: "com", nextDueDate: diasAtras(30), monthlyPayment: 500, lateFeePct: 2, lateInterestMonthlyPct: 1 });
  const c = debtLateInfo(comEncargos, [], HOJE);
  check("a multa é percentual da parcela, uma vez só", perto(c.fine, 10), c.fine);
  check("a mora é proporcional aos dias", perto(c.moraInterest, 5), c.moraInterest);
  check("o custo é a soma dos dois", perto(c.estimatedCost, 15), c.estimatedCost);
  check("e é declarado como conhecido", c.costKnown === true);

  // 60 dias dobram a MORA e não dobram a MULTA: é o erro clássico.
  const doisMeses = debtLateInfo(divida({ id: "dois", nextDueDate: diasAtras(60), lateFeePct: 2, lateInterestMonthlyPct: 1 }), [], HOJE);
  check("o dobro de dias dobra só a mora", perto(doisMeses.moraInterest, 10) && perto(doisMeses.fine, 10),
    { mora: doisMeses.moraInterest, multa: doisMeses.fine });

  const semParcela = debtLateInfo(divida({ id: "sp", nextDueDate: diasAtras(30), monthlyPayment: 0, lateFeePct: 2, lateInterestMonthlyPct: 1 }), [], HOJE);
  check("sem parcela não dá para calcular encargo sobre nada", semParcela.costKnown === false && semParcela.missing.indexOf("parcela") >= 0);
}

/* ===================================================================== 3 */
section("3. [M34] Avalanche x bola de neve, com os números da pessoa");
{
  // Grande e cara contra pequena e barata: a avalanche economiza juros, a bola
  // de neve risca um nome da lista antes. As duas leituras são verdadeiras.
  const cenario = [
    divida({ id: "cara", name: "Rotativo", value: 9000, monthlyPayment: 400, ratePct: 5, ratePeriod: "month" }),
    divida({ id: "barata", name: "Consignado", value: 1200, monthlyPayment: 300, ratePct: 1.5, ratePeriod: "month" }),
  ];
  const av = run("simulateDebtPayoff")(cenario, { strategy: "avalanche", extraMonthly: 800 });
  const bn = run("simulateDebtPayoff")(cenario, { strategy: "snowball", extraMonthly: 800 });
  const c = debtStrategyComparison(av, bn);

  check("as duas rotas são comparáveis", c.comparable === true);
  check("a avalanche custa menos juros", c.cheaper === "avalanche", { diff: c.interestDiff });
  check("a diferença é positiva no sentido declarado (bola de neve custa a mais)",
    c.interestDiff > 0, c.interestDiff);
  check("a bola de neve quita a primeira dívida antes", c.firstWin === "snowball",
    { avalanche: c.avalanche.firstCleared, snowball: c.snowball.firstCleared });
  check("cada estratégia informa quantas dívidas somem em 12 meses",
    Number.isInteger(c.avalanche.clearedIn12) && Number.isInteger(c.snowball.clearedIn12));

  // Uma dívida só: não há ordem para escolher, e o app precisa dizer isso em vez
  // de vender uma decisão inexistente.
  const uma = [divida({ id: "unica", value: 3000, monthlyPayment: 400, ratePct: 4, ratePeriod: "month" })];
  const c1 = debtStrategyComparison(
    run("simulateDebtPayoff")(uma, { strategy: "avalanche" }),
    run("simulateDebtPayoff")(uma, { strategy: "snowball" }),
  );
  check("com uma dívida as duas empatam", c1.cheaper === "empate" && c1.monthsDiff === 0, c1);
  check("e a diferença é declarada irrelevante", c1.meaningful === false);

  // A INVERSÃO QUE ESTE TESTE PEGOU.
  //
  // Com uma dívida a 12% ao mês e orçamento curto, a avalanche quita em 45 meses
  // pagando R$ 43 mil de juros e a bola de neve NUNCA quita — a simulação para
  // com R$ 3,4 mil acumulados. Comparar os dois totais fazia a rota que não
  // termina parecer R$ 40 mil mais barata. Juros de uma simulação travada são
  // "juros até desistir", não "juros até quitar", e não entram na comparação.
  const travando = [
    divida({ id: "t-cara", value: 9000, monthlyPayment: 400, ratePct: 12, ratePeriod: "month" }),
    divida({ id: "t-barata", value: 1200, monthlyPayment: 300, ratePct: 1.5, ratePeriod: "month" }),
  ];
  const ct = debtStrategyComparison(
    run("simulateDebtPayoff")(travando, { strategy: "avalanche", extraMonthly: 500 }),
    run("simulateDebtPayoff")(travando, { strategy: "snowball", extraMonthly: 500 }),
  );
  check("uma ordem que não quita é identificada", ct.stalls === "snowball", ct.stalls);
  check("e os juros dela NÃO são comparados com os de quem quita",
    ct.interestDiff === null && ct.cheaper === null, { diff: ct.interestDiff, cheaper: ct.cheaper });
  check("a rota travada é marcada como incompleta",
    ct.snowball.complete === false && ct.avalanche.complete === true);
  check("a tela avisa antes de mandar escolher entre as duas",
    /não chega ao fim/.test(readSrc("js/screens/debts.js")));

  // Sem taxa não existe custo para comparar.
  const semTaxa = [
    divida({ id: "s1", value: 2000, monthlyPayment: 200, ratePct: null, ratePeriod: "unknown", cetAnnualPct: null }),
    divida({ id: "s2", value: 900, monthlyPayment: 150, ratePct: null, ratePeriod: "unknown", cetAnnualPct: null }),
  ];
  const c2 = debtStrategyComparison(
    run("simulateDebtPayoff")(semTaxa, { strategy: "avalanche" }),
    run("simulateDebtPayoff")(semTaxa, { strategy: "snowball" }),
  );
  check("sem taxa conhecida o custo não é comparado", c2.interestDiff === null && c2.cheaper === null, c2.cheaper);
}

/* ===================================================================== 4 */
section("4. [M34] Comprometimento da renda com régua declarada");
{
  const faixas = [[10, "ok"], [25, "atencao"], [40, "alto"], [70, "critico"]];
  faixas.forEach(([pct, nivel]) => {
    const r = debtBurdenReading(pct);
    check(`${pct}% da renda cai na faixa ${nivel}`, r.level === nivel, r.level);
    check(`  a faixa ${nivel} explica o porquê`, typeof r.note === "string" && r.note.length > 40);
  });
  const semRenda = debtBurdenReading(null);
  check("sem renda o app não inventa faixa", semRenda.available === false && semRenda.level === "desconhecido");

  const fonte = readSrc("js/debts.js");
  check("a régua é declarada como referência de credor, não como regra pessoal",
    /régua deles|referência|referencia/i.test(fonte) && /consignado é 35%/.test(fonte));
  check("a faixa crítica aponta renegociação antes de ordem de pagamento",
    /renegociação/i.test(debtBurdenReading(70).note));
}

/* ===================================================================== 5 */
section("5. [M34] O modelo entrega tudo isso junto");
{
  const data = migrate({
    monthlyIncome: 5000,
    assets: [
      divida({ id: "m1", name: "Cartão", value: 4000, monthlyPayment: 600, ratePct: 10, ratePeriod: "month", nextDueDate: diasAtras(15), lateFeePct: 2, lateInterestMonthlyPct: 1 }),
      divida({ id: "m2", name: "Empréstimo", value: 1500, monthlyPayment: 250, ratePct: 2, ratePeriod: "month", nextDueDate: diasAFrente(9) }),
    ],
  });
  const m = buildDebtModel(data);
  check("o modelo carrega o atraso por dívida", !!m.late && m.late.m1.late === true && m.late.m2.late === false);
  check("a lista de vencidas existe", m.overdueIds.length === 1 && m.overdueIds[0] === "m1", m.overdueIds);
  check("o total vencido é o saldo da vencida", perto(m.overdueTotal, 4000), m.overdueTotal);
  check("o custo do atraso soma só o que tem encargo cadastrado",
    m.overdueEstimatedCost != null && m.overdueEstimatedCost > 0, m.overdueEstimatedCost);
  check("o comprometimento vem com faixa", m.burden.available === true && !!m.burden.label);
  check("o comprometimento bate com parcelas sobre renda",
    perto(m.burdenPct, 850 / 5000 * 100), m.burdenPct);
  check("a comparação entre estratégias vem pronta", !!m.comparison && !!m.comparison.avalanche);

  const semEncargo = buildDebtModel(migrate({
    monthlyIncome: 5000,
    assets: [divida({ id: "x", value: 1000, monthlyPayment: 100, nextDueDate: diasAtras(20) })],
  }));
  check("sem encargos cadastrados o custo do atraso fica nulo",
    semEncargo.overdueEstimatedCost === null, semEncargo.overdueEstimatedCost);
}

/* ===================================================================== 6 */
section("6. [M34] Compatibilidade dos campos novos");
{
  const antiga = makeAsset({ id: "velha", class: "divida", name: "Antiga", value: 900, monthlyPayment: 90 });
  check("dívida antiga nasce sem os campos novos, e isso é nulo e não zero",
    antiga.lateFeePct === null && antiga.lateInterestMonthlyPct === null, {
      multa: antiga.lateFeePct, mora: antiga.lateInterestMonthlyPct,
    });
  check("e nada quebra ao ler o atraso dela", debtLateInfo(antiga, [], HOJE).late === false);

  const nova = makeAsset({ ...antiga, lateFeePct: 2, lateInterestMonthlyPct: 1 });
  check("os campos sobrevivem à normalização", nova.lateFeePct === 2 && nova.lateInterestMonthlyPct === 1);
  const round = migrate({ assets: [nova] }).assets[0];
  check("e sobrevivem à migração", round.lateFeePct === 2 && round.lateInterestMonthlyPct === 1, round.lateFeePct);
  const absurdo = makeAsset({ ...antiga, lateFeePct: -5 });
  check("valor negativo não entra", absurdo.lateFeePct == null || absurdo.lateFeePct >= 0, absurdo.lateFeePct);

  check("os campos antigos continuam onde estavam",
    antiga.kind === "liability" && antiga.debtStatus === "active" && antiga.monthlyPayment === 90);
}

/* ===================================================================== 7 */
section("7. [M34] A tela não elege vencedor universal");
{
  const fonte = readSrc("js/screens/debts.js");
  const tela = fonte.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

  check("as duas estratégias aparecem com o rótulo do roteiro",
    /Financeiramente mais eficiente/.test(tela) && /Mais simples para reduzir o número de dívidas/.test(tela));
  check("cada uma tem vantagem e desvantagem", /debt-strategy__pro/.test(tela) && /debt-strategy__con/.test(tela));
  check("a tela diz que não existe estratégia universal", /Não existe estratégia universal/.test(tela));
  check("a desvantagem da avalanche é dita (a lista demora a encolher)",
    /a lista pode ficar meses sem encolher/.test(tela));
  check("a desvantagem da bola de neve é dita (custa mais juros)",
    /costuma custar mais em juros/.test(tela));
  check("renegociar taxa é apontado como maior alavanca que a ordem",
    /renegociar uma taxa alta/.test(tela));
  check("o atraso é mostrado sem acusar quem só não atualizou a data",
    /há pagamento registrado depois dele/.test(tela));
  check("a multa não cadastrada é declarada, não estimada",
    /ele não inventa o número/.test(tela));
  check("o comprometimento aparece com a leitura da faixa", /debt-burden__label/.test(tela));

  [
    "recomendamos", "a melhor estratégia é", "você deve pagar", "escolha certa",
    "estratégia ideal", "garantimos",
  ].forEach((frase) => check(`a tela não diz "${frase}"`, tela.toLowerCase().indexOf(frase) < 0));
}

console.log(`\n${pass} passaram, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
