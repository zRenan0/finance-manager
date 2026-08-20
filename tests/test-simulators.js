// test-simulators.js — asserções dos motores de simulação (Módulo 5).
// Cada cenário confere um número que dá para verificar na mão ou numa planilha.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, Math, Date, JSON, Number, String, Array, Object, isNaN, isFinite, parseInt, parseFloat, Intl };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/charts.js", "js/simulators.js"].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.02 : tol);
const call = (fn, args) => { ctx.__a = args; return run(`${fn}(__a)`); };

const RATES = { selic: 15, cdi: 14.9, ipca: 4.5, tr: 0.2, poupanca: 6.37 };

/* ------------------------------------------------------------------ tabelas */
console.log("\n1. Tabelas oficiais");
{
  check("IR 22,5% até 180 dias", run("irAliquotFor(180)") === 22.5);
  check("IR 20% em 181 dias", run("irAliquotFor(181)") === 20);
  check("IR 17,5% em 720 dias", run("irAliquotFor(720)") === 17.5);
  check("IR 15% acima de 720 dias", run("irAliquotFor(721)") === 15);
  check("IOF zera no 30º dia", run("iofPctFor(30)") === 0);
  check("IOF de 96% no 1º dia", run("iofPctFor(1)") === 96);
  check("IOF de 50% no 15º dia", run("iofPctFor(15)") === 50);

  // Faixas do saque-aniversário: 30% + R$ 150 sobre um saldo de R$ 3.000.
  check("saque-aniversário de R$ 3.000 = R$ 1.050", run("fgtsAnniversaryWithdrawal(3000)") === 1050,
    run("fgtsAnniversaryWithdrawal(3000)"));
  // Faixa 1: 50% de 400, sem parcela adicional.
  check("saque-aniversário de R$ 400 = R$ 200", run("fgtsAnniversaryWithdrawal(400)") === 200);
  check("saque nunca excede o saldo", run("fgtsAnniversaryWithdrawal(100)") <= 100);
}

/* -------------------------------------------------------------- conversões */
console.log("\n2. Conversão de taxas");
{
  const m = run("annualToMonthly(12)");
  check("12% a.a. equivale a ~0,9489% a.m.", near(m * 100, 0.9489, 0.001), (m * 100).toFixed(4));
  check("ida e volta preserva a taxa", near(run("monthlyToAnnual(annualToMonthly(15))"), 15, 0.0001));
  check("IPCA+6 compõe, não soma", near(run("compoundRates(4.5, 6)"), 10.77, 0.01), run("compoundRates(4.5, 6)"));

  ctx.__r = RATES;
  check("110% do CDI = 16,39%", near(run("effectiveAnnualRate('cdi', 110, __r)"), 16.39, 0.01));
  check("Selic + 0 = 15%", near(run("effectiveAnnualRate('selic', 0, __r)"), 15, 0.001));
  check("prefixado devolve a própria taxa", run("effectiveAnnualRate('pre', 13.5, __r)") === 13.5);
  check("poupança vem das premissas", near(run("effectiveAnnualRate('poupanca', 0, __r)"), 6.37, 0.001));
}

/* -------------------------------------------------------------- renda fixa */
console.log("\n3. Renda fixa: bruto, IR por lote e líquido");
{
  // Aporte único de 10.000 a 12% a.a. por 24 meses = 10.000 × 1,12² = 12.544.
  const s = call("simFixedIncome", { principal: 10000, monthlyContribution: 0, months: 24, indexer: "pre", ratePct: 12, rates: RATES });
  check("valor bruto de 24 meses a 12% a.a.", near(s.grossFinal, 12544, 1), s.grossFinal);
  check("rendimento bruto", near(s.grossEarnings, 2544, 1), s.grossEarnings);
  // IR POR DIAS REAIS. O simulador contava 30 dias por mês, então 24 meses
  // davam 720 dias e caíam na faixa de 17,5%. O prazo real de 24 meses é de
  // 730 ou 731 dias, e a faixa correta é a de 15%: 2.544 × 15% = 381,60.
  // A diferença aparece exatamente na fronteira, que é onde está a decisão do
  // usuário ("deixo mais um mês aplicado?").
  check("IR de 15% no prazo real de 24 meses", near(s.tax, 381.6, 1), s.tax);
  check("o prazo do lote é contado em dias reais", s.lots[0].days >= 730, s.lots[0].days);
  check("a regra tributária usada é declarada", /11\.033/.test(s.taxRule.source || ""), s.taxRule.source);
  check("o modo de aporte é declarado", s.contributionMode === "unica", s.contributionMode);

  // Fronteiras da tabela regressiva, com datas reais.
  check("180 dias ainda é 22,5%", call("irAliquotFor", 180) === 22.5);
  check("181 dias já é 20%", call("irAliquotFor", 181) === 20);
  check("360 dias ainda é 20%", call("irAliquotFor", 360) === 20);
  check("361 dias já é 17,5%", call("irAliquotFor", 361) === 17.5);
  check("720 dias ainda é 17,5%", call("irAliquotFor", 720) === 17.5);
  check("721 dias já é 15%", call("irAliquotFor", 721) === 15);

  // Compra única x recorrente: na recorrente cada aporte tem prazo próprio, e
  // por isso a alíquota efetiva é MAIOR que a do aporte único de mesmo prazo.
  const recorrente = call("simFixedIncome", { principal: 0, monthlyContribution: 500, months: 24, indexer: "pre", ratePct: 12, rates: RATES });
  check("aporte recorrente é identificado", recorrente.contributionMode === "recorrente", recorrente.contributionMode);
  check("cada aporte recorrente tem prazo próprio",
    recorrente.lots.length === 24 && recorrente.lots[0].days > recorrente.lots[23].days,
    `${recorrente.lots[0].days} vs ${recorrente.lots[23].days}`);
  check("a alíquota efetiva do recorrente supera a do aporte único",
    recorrente.effectiveAliquot > s.effectiveAliquot,
    `${recorrente.effectiveAliquot} vs ${s.effectiveAliquot}`);
  check("sem IOF depois de 30 dias", s.iof === 0);
  check("líquido = bruto − IR", near(s.netFinal, s.grossFinal - s.tax, 0.02));
  check("rentabilidade líquida menor que a bruta", s.netAnnualPct < 12 && s.netAnnualPct > 9, s.netAnnualPct);
  check("retorno real desconta a inflação", s.realAnnualPct < s.netAnnualPct);

  // Isento (LCI/LCA): mesma taxa, sem imposto.
  const iso = call("simFixedIncome", { principal: 10000, months: 24, indexer: "pre", ratePct: 12, rates: RATES, taxExempt: true });
  check("isento não paga IR", iso.tax === 0 && iso.netFinal === iso.grossFinal);
  check("isento rende mais que tributado na mesma taxa", iso.netFinal > s.netFinal);

  // Resgate em 20 dias: IOF (33% do rendimento) + IR de 22,5% sobre o que sobrou.
  const curto = call("simFixedIncome", { principal: 10000, termDays: 20, indexer: "pre", ratePct: 12, rates: RATES });
  check("resgate em 20 dias cobra IOF", curto.iof > 0, curto.iof);
  check("IOF de 20 dias é 33% do rendimento", near(curto.iof / curto.grossEarnings * 100, 33, 0.01), curto.iof);
  check("alíquota efetiva do resgate curto passa de 22,5%", curto.effectiveAliquot > 22.5, curto.effectiveAliquot);
  check("resgate no 30º dia não tem IOF",
    call("simFixedIncome", { principal: 10000, termDays: 30, indexer: "pre", ratePct: 12, rates: RATES }).iof === 0);
  check("isento não paga IOF nem no curto prazo",
    call("simFixedIncome", { principal: 10000, termDays: 10, indexer: "pre", ratePct: 12, rates: RATES, taxExempt: true }).iof === 0);

  // Aportes mensais: cada lote tem prazo próprio, então a alíquota efetiva fica
  // ENTRE a do primeiro lote (mais velho) e a do último (mais novo).
  const lotes = call("simFixedIncome", { principal: 0, monthlyContribution: 1000, months: 24, indexer: "pre", ratePct: 12, rates: RATES });
  check("24 aportes de 1.000 somam 24.000 investidos", lotes.contributed === 24000, lotes.contributed);
  check("alíquota efetiva fica entre 17,5% e 22,5%", lotes.effectiveAliquot > 17.5 && lotes.effectiveAliquot < 22.5, lotes.effectiveAliquot);
  check("lotes recebem alíquotas diferentes", new Set(lotes.lots.map((l) => l.aliquot)).size > 1);

  // Taxa de administração corrói de forma composta.
  const comTaxa = call("simFixedIncome", { principal: 10000, months: 24, indexer: "pre", ratePct: 12, feeAnnualPct: 2, rates: RATES });
  check("taxa de administração reduz o bruto", comTaxa.grossFinal < s.grossFinal);
  check("taxa líquida de custo é composta, não subtraída", near(comTaxa.netOfFeeAnnual, 9.8039, 0.01), comTaxa.netOfFeeAnnual);

  // Poupança contra inflação alta.
  const poup = call("simFixedIncome", { principal: 10000, months: 12, indexer: "poupanca", rates: { ...RATES, ipca: 8 }, taxExempt: true });
  check("poupança abaixo da inflação é sinalizada", poup.losesToInflation === true, poup.realAnnualPct);
}

/* ------------------------------------------------------ empréstimo / financiamento */
console.log("\n4. Empréstimo e financiamento");
{
  // Price: 100.000 em 120 meses a 12% a.a. (0,9489% a.m.) → parcela ~1.400.
  const price = call("simLoan", { principal: 100000, months: 120, annualRatePct: 12, system: "price" });
  check("parcela Price constante", near(price.schedule[0].payment, price.schedule[50].payment, 0.02), price.schedule[0].payment);
  check("parcela Price ~R$ 1.400", near(price.payment, 1400, 15), price.payment);
  check("saldo devedor zera na última parcela", price.schedule[119].balance === 0, price.schedule[119].balance);
  check("total pago = principal + juros", near(price.totalPaid, 100000 + price.totalInterest, 1));
  check("CET sem tarifa ≈ taxa contratada", near(price.cetAnnualPct, 12, 0.15), price.cetAnnualPct);

  // SAC: primeira parcela maior, última menor, juros totais menores que Price.
  const sac = call("simLoan", { principal: 100000, months: 120, annualRatePct: 12, system: "sac" });
  check("SAC começa mais caro que Price", sac.firstPayment > price.payment, sac.firstPayment);
  check("SAC termina mais barato", sac.lastPayment < price.payment, sac.lastPayment);
  check("SAC paga menos juros no total", sac.totalInterest < price.totalInterest,
    `${sac.totalInterest} vs ${price.totalInterest}`);
  check("amortização do SAC é constante", near(sac.schedule[0].amortization, sac.schedule[80].amortization, 0.02));

  // Tarifa e seguro elevam o CET acima da taxa anunciada — o ponto do indicador.
  const comTarifa = call("simLoan", { principal: 100000, months: 120, annualRatePct: 12, system: "price", monthlyFee: 25, monthlyInsurance: 40, upfrontFee: 1500 });
  check("CET maior que a taxa anunciada quando há tarifa", comTarifa.cetAnnualPct > 12 + 1, comTarifa.cetAnnualPct);
  check("extras entram no total pago", comTarifa.totalPaid > price.totalPaid);

  // Entrada reduz o principal financiado.
  const comEntrada = call("simLoan", { assetValue: 60000, downPayment: 20000, months: 48, annualRatePct: 22, system: "price" });
  check("entrada abate do financiado", comEntrada.principal === 40000, comEntrada.principal);
  check("custo total inclui a entrada", comEntrada.totalCost > comEntrada.totalPaid);
  check("percentual acima do valor à vista é positivo", comEntrada.surchargePct > 0, comEntrada.surchargePct);
}

/* --------------------------------------------- entrada ou amortização futura */
console.log("\n4b. Dar entrada ou amortizar depois");
{
  const base = {
    assetValue: 50000, cashAvailable: 20000, reserveToKeep: 0,
    months: 48, prepaymentMonth: 12,
    entryAnnualRatePct: 18, fullAnnualRatePct: 22,
    investmentAnnualPct: 10, system: "price", prepaymentMode: "term",
  };
  const r = call("simDownPaymentVsPrepayment", base);
  check("exemplo de 20 mil para um bem de 50 mil recomenda entrada", r.winner === "entry", r.winner);
  check("entrada usa exatamente o dinheiro livre", r.entry.downPayment === 20000, r.entry.downPayment);
  check("financiamento integral começa em 50 mil", r.later.loan.principal === 50000, r.later.loan.principal);
  check("dinheiro rende até a amortização", r.later.fundAtPrepayment > 20000, r.later.fundAtPrepayment);
  check("amortização reduz o saldo devedor", r.later.loan.balanceAfterPrepayment < r.later.loan.balanceBeforePrepayment);
  check("reduzir prazo quita antes do contrato original", r.later.loan.payoffMonth < 48, r.later.loan.payoffMonth);
  check("comparação usa esforço mensal próximo", r.entry.loan.firstPayment <= r.later.loan.firstPayment + 0.02);
  check("entrada comparável quita antes da proposta de 48 meses", r.entry.loan.payoffMonth < r.entry.offerLoan.payoffMonth);
  check("taxa de equilíbrio supera o rendimento informado", r.breakEvenAnnualPct > 10, r.breakEvenAnnualPct);
  check("sem reserva, o risco de liquidez é sinalizado", r.reserveMissing === true);

  const parcela = call("simDownPaymentVsPrepayment", { ...base, prepaymentMode: "payment" });
  check("reduzir parcela mantém o prazo contratado", parcela.later.loan.payoffMonth === 48, parcela.later.loan.payoffMonth);
  check("parcela cai depois da amortização", parcela.later.loan.paymentAfterPrepayment < parcela.later.loan.firstPayment,
    `${parcela.later.loan.paymentAfterPrepayment} vs ${parcela.later.loan.firstPayment}`);

  const alta = call("simDownPaymentVsPrepayment", {
    ...base, entryAnnualRatePct: 22, fullAnnualRatePct: 22,
    investmentAnnualPct: 30, prepaymentMode: "payment",
  });
  check("rendimento líquido acima do crédito pode favorecer esperar", alta.winner === "later", alta.winner);

  const equilibrio = call("simDownPaymentVsPrepayment", {
    ...base, entryAnnualRatePct: 22, fullAnnualRatePct: 22,
    investmentAnnualPct: 10, prepaymentMode: "payment",
  });
  check("taxa de equilíbrio acompanha o custo do crédito quando as propostas são iguais",
    near(equilibrio.breakEvenAnnualPct, 22, 0.1), equilibrio.breakEvenAnnualPct);

  const comReserva = call("simDownPaymentVsPrepayment", { ...base, reserveToKeep: 5000, system: "sac" });
  check("reserva fica fora da entrada", comReserva.reserve === 5000 && comReserva.usableCash === 15000,
    `${comReserva.reserve}/${comReserva.usableCash}`);
  check("SAC também recebe amortização extraordinária", comReserva.later.loan.prepaymentApplied > 15000,
    comReserva.later.loan.prepaymentApplied);

  const semLivre = call("simDownPaymentVsPrepayment", { ...base, reserveToKeep: 20000 });
  check("reserva igual ao caixa deixa zero para entrada", semLivre.noEntryAvailable === true && semLivre.usableCash === 0);

  const contrato = call("simLoanWithPrepayment", {
    principal: 50000, months: 48, annualRatePct: 22, system: "price",
    prepaymentMonth: 12, prepaymentAmount: 20000, prepaymentMode: "term",
  });
  const semAmortizar = call("simLoanWithPrepayment", {
    principal: 50000, months: 48, annualRatePct: 22, system: "price",
    prepaymentAmount: 0,
  });
  check("aporte extraordinário é limitado ao saldo", contrato.prepaymentApplied <= contrato.balanceBeforePrepayment);
  check("amortizar corta juros futuros", contrato.totalInterest < semAmortizar.totalInterest,
    `${contrato.totalInterest} vs ${semAmortizar.totalInterest}`);
}

/* --------------------------------------------------------------- cartão */
console.log("\n5. Cartão de crédito");
{
  const c = call("simCreditCard", { debt: 5000, monthlyRatePct: 14, minPaymentPct: 15, months: 24, installments: 12, installmentRatePct: 7, alternativeAnnualPct: 30 });
  check("juros anuais equivalentes do rotativo são absurdos", c.annualEquivalentPct > 300, c.annualEquivalentPct);

  // Resolução CMN 4.549/2017: o rotativo dura UM ciclo de fatura. Antes o
  // simulador rolava 24 meses, um cenário que a instituição não pode oferecer,
  // e com isso inflava tanto o custo do rotativo quanto a economia anunciada.
  check("o rotativo dura um único ciclo", c.rotativo.months === 1 && c.rotativo.limitedToOneCycle === true, c.rotativo.months);
  check("os juros do ciclo saem da taxa do rotativo", Math.abs(c.rotativo.cycleInterest - 700) < 0.01, c.rotativo.cycleInterest);
  check("o pagamento mínimo é o percentual da fatura", Math.abs(c.rotativo.minPayment - 750) < 0.01, c.rotativo.minPayment);
  check("o saldo restante é o que vai para o parcelamento",
    Math.abs(c.rotativo.finalBalance - c.parcelamento.financedAmount) < 0.01,
    `${c.rotativo.finalBalance} vs ${c.parcelamento.financedAmount}`);

  // Invariante central: a soma das parcelas é EXATAMENTE o total pago. O código
  // anterior truncava o total no teto legal e deixava a parcela intacta, então
  // parcela × n não fechava com o total exibido logo abaixo.
  const somaParcelas = c.parcelamento.schedule.reduce((s, p) => s + p.payment, 0);
  check("soma das parcelas é igual ao total pago", Math.abs(somaParcelas - c.parcelamento.totalPaid) < 0.005,
    `${somaParcelas} vs ${c.parcelamento.totalPaid}`);
  check("o cronograma tem uma linha por parcela", c.parcelamento.schedule.length === 12, c.parcelamento.schedule.length);

  // Lei 14.690/2023: o teto de 100% vale para a SOMA das duas fases.
  check("encargos somados das duas fases respeitam o teto de 100%",
    c.cartaoTotalCharges <= 5000 + 0.01, c.cartaoTotalCharges);
  check("o custo do caminho do cartão soma as duas fases",
    Math.abs(c.cartaoTotalPaid - (c.rotativo.totalPaid + c.parcelamento.totalPaid)) < 0.01,
    `${c.cartaoTotalPaid}`);

  check("crédito mais barato é a melhor opção do ranking", c.ranking[0].id === "alternativa", c.ranking[0].id);
  check("economia contra o caminho do cartão é positiva", c.savingVsCartao > 0, c.savingVsCartao);
  check("a regra aplicada é declarada junto do resultado",
    c.legal.rotativoCycles === 1 && /4\.549/.test(c.legal.rotativoRule) && /14\.690/.test(c.legal.chargeCapRule),
    JSON.stringify(c.legal));

  // Teto acionado: dívida cara e prazo longo. Mesmo cortando encargos, a soma
  // das parcelas tem de continuar fechando com o total.
  const caro = call("simCreditCard", { debt: 5000, monthlyRatePct: 20, minPaymentPct: 15, installments: 48, installmentRatePct: 12, alternativeAnnualPct: 30 });
  check("o teto legal é acionado no cenário caro", caro.parcelamento.cappedByLaw === true);
  check("com o teto acionado, os encargos param em 100% da dívida",
    caro.cartaoTotalCharges <= 5000 + 0.01, caro.cartaoTotalCharges);
  const somaCaro = caro.parcelamento.schedule.reduce((s, p) => s + p.payment, 0);
  check("com o teto acionado, a soma das parcelas continua fechando",
    Math.abs(somaCaro - caro.parcelamento.totalPaid) < 0.005, `${somaCaro} vs ${caro.parcelamento.totalPaid}`);

  // Sem taxa informada, a premissa é declarada e não derivada do rotativo.
  const semTaxa = call("simCreditCard", { debt: 3000, monthlyRatePct: 6, minPaymentPct: 15, installments: 12, alternativeAnnualPct: 30 });
  check("sem taxa informada, a origem é declarada como premissa", semTaxa.parcelamento.rateSource === "premissa", semTaxa.parcelamento.rateSource);
  check("a premissa não vira parcelamento sem juros", semTaxa.parcelamento.monthlyRatePct > 0, semTaxa.parcelamento.monthlyRatePct);
}

/* ------------------------------------------------------------ consórcio */
console.log("\n6. Consórcio");
{
  // 100.000 em 60 meses com 18% de taxa de administração: total 118.000 → 1.966,67.
  const k = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, reserveFundPct: 0, lancePct: 0, contemplationMonth: 30 });
  check("parcela = crédito + taxa, dividido pelo prazo", near(k.basePayment, 1966.67, 0.02), k.basePayment);
  check("total pago supera a carta", k.totalPaid > 100000);
  check("custo total = taxa de administração", near(k.costPct, 18, 0.1), k.costPct);
  // O desconto arbitrário de 0,8% ao mês saiu. Com ele, o simulador produzia um
  // "CET" para qualquer cenário; sem ele, a taxa só existe quando o fluxo de
  // fato se parece com um empréstimo (recebe antes, paga depois).
  // Contemplado no fim, o consórcio é uma poupança forçada que devolve MENOS do
  // que recebeu: a taxa correta é negativa. O código antigo, com o desconto de
  // 0,8%, devolvia um número positivo aqui e fazia o consórcio parecer um
  // investimento.
  check("contemplação no fim tem retorno NEGATIVO",
    k.scenarios.ultima.effectiveMonthlyPct < 0, k.scenarios.ultima.effectiveMonthlyPct);
  check("contemplação no início se comporta como empréstimo, com taxa positiva",
    k.scenarios.primeira.effectiveMonthlyPct > 0, k.scenarios.primeira.effectiveMonthlyPct);
  // No meio do prazo o fluxo não é nem empréstimo nem poupança: não existe taxa
  // única. Devolver `null` é a resposta honesta; inventar uma era o defeito.
  check("contemplação no meio não recebe taxa inventada",
    k.scenarios.meio.effectiveMonthlyPct === null, k.scenarios.meio.effectiveMonthlyPct);
  check("a faixa entre melhor e pior caso é exposta",
    k.effectiveRange.bestMonthlyPct > 0 && k.effectiveRange.worstMonthlyPct < 0,
    JSON.stringify(k.effectiveRange));
  check("o custo sobre a carta está sempre disponível", k.scenarios.ultima.costPct > 0, k.scenarios.ultima.costPct);
  check("os três cenários de contemplação são devolvidos",
    !!(k.scenarios.primeira && k.scenarios.meio && k.scenarios.ultima));
  check("as premissas são declaradas junto do resultado",
    k.assumptions && k.assumptions.contemplationInformed === true && k.assumptions.adjustmentInformed === false,
    JSON.stringify(k.assumptions));

  const comFundo = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, reserveFundPct: 2, lancePct: 0, contemplationMonth: 30 });
  check("fundo de reserva aumenta a parcela", comFundo.payment > k.payment);

  const comSeguro = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, insuranceMonthlyPct: 0.05, contemplationMonth: 30 });
  check("seguro entra na parcela", comSeguro.payment > k.payment, `${comSeguro.payment} vs ${k.payment}`);
  check("seguro é somado à parte e não confundido com taxa", comSeguro.scenario.insuranceTotal > 0, comSeguro.scenario.insuranceTotal);

  // Reajuste: a carta é corrigida no aniversário e as parcelas seguem. Sem isto
  // o total pago exibido ficava abaixo do real em qualquer prazo longo.
  const comReajuste = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, annualAdjustmentPct: 6, contemplationMonth: 30 });
  check("reajuste aumenta o total pago", comReajuste.totalPaid > k.totalPaid, `${comReajuste.totalPaid} vs ${k.totalPaid}`);
  check("reajuste aumenta a carta recebida", comReajuste.scenario.creditReceived > 100000, comReajuste.scenario.creditReceived);
  check("a última parcela é maior que a primeira quando há reajuste",
    comReajuste.scenario.lastPayment > comReajuste.scenario.firstPayment,
    `${comReajuste.scenario.lastPayment} vs ${comReajuste.scenario.firstPayment}`);
  check("sem reajuste informado, a premissa é zero e fica declarada",
    k.annualAdjustmentPct === 0 && k.assumptions.adjustmentInformed === false);

  const comLance = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, lancePct: 20, contemplationMonth: 12 });
  check("lance é percentual do crédito", near(comLance.lance, 20000, 1), comLance.lance);
  check("lance reduz o prazo restante", comLance.monthsAfterLance < 60, comLance.monthsAfterLance);
  const comLanceParcela = call("simConsortium", { credit: 100000, months: 60, adminPct: 18, lancePct: 20, contemplationMonth: 12, lanceMode: "parcela" });
  check("lance na parcela mantém o prazo", comLanceParcela.monthsAfterLance === 60, comLanceParcela.monthsAfterLance);
  check("lance na parcela reduz o valor das parcelas seguintes",
    comLanceParcela.scenario.lastPayment < comLanceParcela.scenario.firstPayment,
    `${comLanceParcela.scenario.lastPayment} vs ${comLanceParcela.scenario.firstPayment}`);
}

/* ---------------------------------------------------------------- FGTS */
console.log("\n7. FGTS");
{
  const f = call("simFgts", { balance: 20000, monthlySalary: 5000, years: 5, rates: RATES });
  check("depósito mensal é 8% do salário", f.deposit === 400, f.deposit);
  check("piso anual impede projeção abaixo do IPCA", f.losesToInflation === false && f.fgtsAnnualPct >= RATES.ipca);
  check("saque-aniversário investido a 13% supera o fundo", f.anniversaryWins === true,
    `${f.anniversary.final} vs ${f.keep.final}`);
  check("valor real é menor que o nominal", f.keep.realFinal < f.keep.final);
  check("saques acumulados são positivos", f.anniversary.withdrawn > 0, f.anniversary.withdrawn);
  check("saldo retido na demissão é informado", f.lockedOnDismissal > 0);

  // Com rendimento alternativo igual ao do FGTS, sacar não deve compensar
  // (o dinheiro sai da capitalização do fundo para render o mesmo lá fora).
  const neutro = call("simFgts", { balance: 20000, monthlySalary: 5000, years: 5, fgtsAnnualPct: 3, alternativeAnnualPct: RATES.ipca, rates: RATES });
  check("sem ganho de taxa, sacar não muda o total", near(neutro.anniversary.final, neutro.keep.final, 1),
    `${neutro.anniversary.final} vs ${neutro.keep.final}`);
}

/* -------------------------------------------------------- aposentadoria */
console.log("\n8. Aposentadoria");
{
  const r = call("simRetirement", { currentAge: 30, retireAge: 60, lifeExpectancy: 90, currentSaved: 50000, monthlyContribution: 1000, desiredIncome: 8000, annualRatePct: 10, rates: RATES });
  check("taxa real é menor que a nominal", r.realAnnualPct < 10 && r.realAnnualPct > 4, r.realAnnualPct);
  check("acumula 30 anos de aportes", r.accumMonths === 360);
  check("patrimônio na aposentadoria supera o aportado", r.atRetirement > r.contributed);
  check("renda perpétua é menor que a renda que consome o principal",
    r.incomePerpetual < r.incomeDepleting, `${r.incomePerpetual} vs ${r.incomeDepleting}`);
  check("capital para renda perpétua é maior", r.capitalPerpetual > r.capitalDepleting);
  check("aporte necessário é coerente com a meta", r.requiredMonthly > 0);
  check("onTrack responde a pergunta certa", typeof r.onTrack === "boolean");

  // Quem já está no caminho não deve receber aporte adicional exigido.
  const folgado = call("simRetirement", { currentAge: 30, retireAge: 60, lifeExpectancy: 90, currentSaved: 500000, monthlyContribution: 5000, desiredIncome: 3000, annualRatePct: 10, rates: RATES });
  check("cenário confortável fica no caminho", folgado.onTrack === true);
  check("sem lacuna de aporte no cenário confortável", folgado.contributionGap === 0, folgado.contributionGap);

  // Taxa real negativa (juro abaixo da inflação) é sinalizada em vez de projetar
  // crescimento que não existe.
  const ruim = call("simRetirement", { currentAge: 40, retireAge: 65, currentSaved: 10000, monthlyContribution: 500, annualRatePct: 4, rates: { ...RATES, ipca: 6 } });
  check("taxa real negativa é sinalizada", ruim.realRateNegative === true, ruim.realAnnualPct);

  // Com taxa real negativa as fórmulas de anuidade continuam valendo; o atalho
  // "saldo ÷ meses" só vale quando a taxa real é exatamente zero. Usar o atalho
  // fazia o app prometer uma renda maior do que a sustentável e pedir um aporte
  // menor do que o necessário, justamente no cenário mais apertado.
  const drawMonths = (90 - 65) * 12;
  check("renda sustentável com taxa real negativa é MENOR que saldo ÷ meses",
    ruim.incomeDepleting < ruim.atRetirement / drawMonths,
    `${ruim.incomeDepleting} vs ${ruim.atRetirement / drawMonths}`);
  check("renda perpétua não existe sem juro real positivo",
    ruim.incomePerpetual === null && ruim.perpetualAvailable === false, ruim.incomePerpetual);
  check("o motivo da ausência é explicado", /juro real positivo/.test(ruim.perpetualUnavailableReason || ""));

  const comMeta = call("simRetirement", { currentAge: 40, retireAge: 65, lifeExpectancy: 90, currentSaved: 10000, monthlyContribution: 500, desiredIncome: 4000, annualRatePct: 4, rates: { ...RATES, ipca: 6 } });
  check("capital perpétuo é nulo, não zero, com taxa real negativa",
    comMeta.capitalPerpetual === null, comMeta.capitalPerpetual);
  check("capital para consumir o principal é maior que renda x meses com taxa negativa",
    comMeta.capitalDepleting > 4000 * drawMonths,
    `${comMeta.capitalDepleting} vs ${4000 * drawMonths}`);
  const comMetaLinear = 4000 * drawMonths;
  check("o aporte necessário não é subestimado", comMeta.requiredMonthly > 0 && comMeta.capitalDepleting > comMetaLinear);

  // Taxa real exatamente zero continua usando a divisão linear, que é o limite
  // correto da fórmula nesse ponto.
  const neutro = call("simRetirement", { currentAge: 40, retireAge: 65, lifeExpectancy: 90, currentSaved: 120000, monthlyContribution: 0, annualRatePct: 6, rates: { ...RATES, ipca: 6 } });
  check("taxa real zero usa a divisão linear",
    Math.abs(neutro.incomeDepleting - neutro.atRetirement / drawMonths) < 0.02,
    `${neutro.incomeDepleting} vs ${neutro.atRetirement / drawMonths}`);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
