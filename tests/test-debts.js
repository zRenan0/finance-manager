// test-debts.js — contrato da Central de Dívidas
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const ctx = { console, module:{ exports:{} }, indexedDB:undefined, localStorage:undefined };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js","js/rules.js", "js/layout.js", "js/storage.js","js/accounts.js","js/debts.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT,f),"utf8"),ctx,{filename:f}));
const run = (code) => vm.runInContext(code,ctx);
let pass = 0, fail = 0;
function check(name,cond,extra) { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : ` → ${extra}`}`); } }
function near(a,b,t=0.02) { return Math.abs(a-b) <= t; }

console.log("\n1. Migração e fonte única");
ctx.__emptyModel = run("buildDebtModel(migrate({}))");
check("base vazia não inventa data de quitação",ctx.__emptyModel.estimatedDebtFreeAt === null);
ctx.__data = run(`migrate({ version:12, assets:[
  { id:"cara", class:"divida", name:"Cartão", value:5000, monthlyPayment:500, cetAnnualPct:120, balanceCheckedAt:"2026-08-01" },
  { id:"barata", class:"divida", name:"Consignado", value:12000, monthlyPayment:700, ratePct:1.2, ratePeriod:"month" }
], transactions:[{ id:"p1",type:"expense",amount:500,categoryId:"outros",date:"2026-08-02",debtId:"cara" }] })`);
check("schema sobe para v23",ctx.__data.version === 23,ctx.__data.version);
check("plano padrão é avalanche",ctx.__data.debtPlan.strategy === "avalanche");
check("pagamento mantém vínculo válido",ctx.__data.transactions[0].debtId === "cara");
check("as dívidas continuam na coleção assets",ctx.__data.assets.length === 2 && !ctx.__data.debts);

console.log("\n2. Taxas e prioridade");
const cet = run("debtMonthlyRateInfo(__data.assets[0])");
check("CET anual vira taxa mensal composta",near(cet.monthly,Math.pow(2.2,1/12)-1,0.000001),cet.monthly);
check("avalanche prioriza maior custo",run("orderDebts(activeDebts(__data),'avalanche')[0].id") === "cara");
check("bola de neve prioriza menor saldo",run("orderDebts(activeDebts(__data),'snowball')[0].id") === "cara");

console.log("\n3. Projeção e rolagem das parcelas");
ctx.__simple = run(`migrate({ assets:[
  { id:"a",class:"divida",name:"A",value:1000,monthlyPayment:500,cetAnnualPct:0 },
  { id:"b",class:"divida",name:"B",value:2000,monthlyPayment:500,cetAnnualPct:0 }
] })`);
const sim = run("simulateDebtPayoff(__simple,{strategy:'snowball',extraMonthly:0})");
check("orçamento preserva a soma das parcelas",near(sim.monthlyBudget,1000),sim.monthlyBudget);
check("parcela liberada rola para a próxima dívida",sim.months === 3,sim.months);
check("projeção termina zerada",sim.complete && sim.timeline[sim.timeline.length-1].balance === 0);

console.log("\n4. Dados incompletos não inventam juros");
ctx.__unknown = run(`migrate({ assets:[{ id:"u",class:"divida",name:"Sem taxa",value:1200,monthlyPayment:100 }] })`);
const unknown = run("simulateDebtPayoff(__unknown,{})");
check("prazo linear ainda é exibido",unknown.months === 12,unknown.months);
check("total de juros fica incompleto",unknown.totalInterest === null);
check("dívida é marcada com taxa desconhecida",unknown.unknownRateIds.includes("u"));

console.log("\n5. Parcela insuficiente, pagamentos e saldo");
ctx.__negative = run(`migrate({ assets:[{ id:"n",class:"divida",name:"Rotativo",value:1000,monthlyPayment:50,ratePct:10,ratePeriod:"month" }] })`);
const neg = run("simulateDebtPayoff(__negative,{})");
check("amortização negativa é detectada",neg.negativeAmortizationIds.includes("n"));
check("pagamento equivalente é detectado",run("isDuplicateDebtPayment(__data,'cara','2026-08-02',500)"));
ctx.__paid = run("updateDebtBalance(__negative.assets[0],0,'2026-08-03')");
check("saldo zero quita automaticamente",ctx.__paid.value === 0 && ctx.__paid.debtStatus === "paid");

console.log("\n6. Backup");
ctx.__env = run("buildBackupEnvelope(__data)");
check("backup inclui plano de dívida",ctx.__env.data.debtPlan.strategy === "avalanche");
ctx.__restored = run("parseBackupFile(JSON.stringify(__env)).data");
check("restore preserva detalhes e vínculo",ctx.__restored.assets[0].cetAnnualPct === 120 && ctx.__restored.transactions[0].debtId === "cara");

/* ==============================================================================
 * Taxa contratual x CET, quitação antecipada e cronogramas
 * ============================================================================== */
console.log("\nTaxa contratual, CET, quitação e cronogramas");
{
  // O CET inclui IOF, tarifas e seguro; nada disso incide sobre o saldo mês a
  // mês. Usá-lo para fazer a dívida crescer inflava o saldo projetado.
  ctx.__d1 = { id: "d1", kind: "liability", name: "Empréstimo", value: 10000, ratePct: 2, ratePeriod: "month", cetAnnualPct: 45, monthlyPayment: 500, remainingInstallments: 24, debtStatus: "active" };
  const taxa = run("debtMonthlyRateInfo(__d1)");
  check("saldo usa a taxa CONTRATUAL", taxa.source === "rate" && Math.abs(taxa.monthly - 0.02) < 1e-9, JSON.stringify(taxa));
  const cet = run("debtCetInfo(__d1)");
  check("CET fica reservado para comparação", cet.source === "cet" && cet.annualPct === 45, JSON.stringify(cet));

  // Sem taxa contratual, o CET é aceito mas declarado como aproximação.
  ctx.__d2 = { id: "d2", kind: "liability", name: "Sem taxa", value: 5000, ratePeriod: "unknown", cetAnnualPct: 60, monthlyPayment: 300, remainingInstallments: 20, debtStatus: "active" };
  const fallback = run("debtMonthlyRateInfo(__d2)");
  check("sem taxa contratual, o CET entra declarado como aproximação",
    fallback.source === "cet-fallback" && fallback.approximate === true, JSON.stringify(fallback));

  // Quitação antecipada: valor presente das parcelas restantes (CDC art. 52).
  const quitacao = run("debtPayoffQuote(__d1)");
  check("quitação é calculada", quitacao.available === true, JSON.stringify(quitacao).slice(0, 120));
  check("quitação é menor que a soma nominal das parcelas",
    quitacao.payoff < quitacao.nominalRemaining, `${quitacao.payoff} vs ${quitacao.nominalRemaining}`);
  check("a economia da antecipação é positiva", quitacao.savings > 0, quitacao.savings);
  check("a base do cálculo é declarada", /valor presente/i.test(quitacao.basis || ""), quitacao.basis);

  ctx.__d3 = { id: "d3", kind: "liability", name: "Sem prazo", value: 5000, ratePct: 2, ratePeriod: "month", debtStatus: "active" };
  const semPrazo = run("debtPayoffQuote(__d3)");
  check("sem parcela ou prazo, a quitação não é inventada",
    semPrazo.available === false && semPrazo.payoff === 5000, JSON.stringify(semPrazo));

  // Price e SAC: a primeira parcela do SAC é maior e o total de juros é menor.
  const price = run("debtSchedule(10000, 0.02, 24, 'price')");
  const sac = run("debtSchedule(10000, 0.02, 24, 'sac')");
  check("Price tem parcela constante", Math.abs(price.rows[0].payment - price.rows[10].payment) < 0.02,
    `${price.rows[0].payment} vs ${price.rows[10].payment}`);
  check("SAC tem amortização constante", Math.abs(sac.rows[0].amortization - sac.rows[10].amortization) < 0.02,
    `${sac.rows[0].amortization} vs ${sac.rows[10].amortization}`);
  check("primeira parcela do SAC é maior que a do Price", sac.rows[0].payment > price.rows[0].payment);
  check("SAC paga menos juros no total", sac.totalInterest < price.totalInterest,
    `${sac.totalInterest} vs ${price.totalInterest}`);
  check("os dois cronogramas zeram o saldo", price.rows[price.rows.length - 1].balance === 0 && sac.rows[sac.rows.length - 1].balance === 0);
  const somaPrice = price.rows.reduce((s, r) => s + r.payment, 0);
  check("soma das parcelas do Price fecha com o total pago", Math.abs(somaPrice - price.totalPaid) < 0.005,
    `${somaPrice} vs ${price.totalPaid}`);
  const amortSac = sac.rows.reduce((s, r) => s + r.amortization, 0);
  check("a amortização do SAC soma o principal", Math.abs(amortSac - 10000) < 0.02, amortSac);
}

console.log(`\n${pass} passaram, ${fail} falharam.`);
if (fail) process.exit(1);

