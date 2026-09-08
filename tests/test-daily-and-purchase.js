// test-daily-and-purchase.js — [M30] limite diário e [M31] "posso comprar?".
//
// Os dois módulos respondem perguntas que terminam em decisão de gasto, e por
// isso o risco não é errar a conta: é a conta estar certa e a FRASE prometer
// outra coisa.
//
//   M30  o número não pode ser "o que cabe na renda". Ele é o que sobra depois
//        dos compromissos E da meta de guardar; se a meta não coubesse, o app
//        precisa dizer isso em vez de mostrar um teto convidativo.
//   M31  a resposta tem de ser mensal, não diária, e precisa das três leituras
//        que mudam a decisão: sobra antes/depois, comprometimento antes/depois
//        e o que acontece com a reserva.
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
  "js/debts.js", "js/metrics.js", "js/wealth.js", "js/goals.js", "js/forecast.js", "js/score.js",
  "js/insights.js", "js/demo.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

ctx.__d = run(`buildDemoData()`);
ctx.__fc = run(`buildForecast(__d)`);
const limite = run(`dailyAllowance(__d, __fc)`);
const fechamento = run(`monthCloseForecast(__fc)`);

section("1. [M30] O limite parte da meta, não da renda");
{
  check("o limite é produzido", !!limite);
  check("a meta vem do aporte planejado nas metas", limite.alvoFonte === "metas", limite.alvoFonte);
  check("a meta é a soma dos planos mensais",
    limite.alvo === run(`__d.goals.reduce((s, g) => addMoney(s, g.monthlyPlan), 0)`), limite.alvo);

  // [M41] A CONTA, INTEIRA. O primeiro termo deixou de ser o saldo em conta.
  //
  //   livre da renda = renda do mês − gasto realizado − compromissos datados
  //   folga de caixa = saldo hoje + receitas previstas − contas previstas
  //   disponível     = menor(livre, folga) − meta
  const outlook = run(`monthExpenseOutlook(__d, __fc.today)`);
  const livreDaRenda = limite.renda - outlook.realizado - outlook.compromissos;
  const folgaDeCaixa = fechamento.saldoAtual + fechamento.receitas - fechamento.contas;
  const teto = Math.min(livreDaRenda, folgaDeCaixa);
  check("teto = menor(renda ainda livre, folga de caixa)",
    Math.abs(limite.teto - teto) < 0.02, { teto: limite.teto, esperado: +teto.toFixed(2) });
  check("disponível = teto − meta",
    Math.abs(limite.disponivel - (teto - limite.alvo)) < 0.02,
    { disponivel: limite.disponivel, esperado: +(teto - limite.alvo).toFixed(2) });
  check("por dia = disponível dividido pelos dias que faltam",
    Math.abs(limite.porDia - limite.disponivel / limite.diasRestantes) < 0.02,
    { porDia: limite.porDia, diasRestantes: limite.diasRestantes });
  check("os dias restantes cabem no mês", limite.diasRestantes >= 1 && limite.diasRestantes <= 31, limite.diasRestantes);

  // A ESTIMATIVA DE VARIÁVEL NÃO ENTRA NA CONTA. Ela é o que este número
  // substitui por uma decisão; descontá-la seria contar duas vezes.
  check("a estimativa de variável fica fora do desconto",
    Math.abs(limite.disponivel - (teto - limite.alvo)) < 0.02 && limite.estimativaVariavel > 0,
    { estimativaVariavel: limite.estimativaVariavel });

  // Sem meta declarada, não há a que se referir.
  ctx.__semMeta = run(`(() => { const d = JSON.parse(JSON.stringify(__d)); d.goals = []; d.budgetSplit = { necessidade: 100, desejo: 0, futuro: 0 }; return d; })()`);
  const semMeta = run(`dailyAllowance(__semMeta, buildForecast(__semMeta))`);
  check("sem meta nenhuma o alvo é zero", semMeta.alvo === 0 && semMeta.alvoFonte === "nenhuma");

  // Com metas zeradas mas regra de orçamento, cai na fatia de futuro.
  ctx.__soRegra = run(`(() => { const d = JSON.parse(JSON.stringify(__d)); d.goals = []; return d; })()`);
  const soRegra = run(`dailyAllowance(__soRegra, buildForecast(__soRegra))`);
  check("sem metas o alvo vem da regra de orçamento",
    soRegra.alvoFonte === "regra" && soRegra.alvo > 0, { alvo: soRegra.alvo });
}

// ------------------------------------------------------------------------------
// [M41] O SALDO ACUMULADO NÃO É MESADA
// ------------------------------------------------------------------------------
// O defeito: `disponivel` começava em `saldoAtual`, o saldo INTEIRO da conta,
// reserva de emergência inclusa. Dividido pelos dias que faltavam, o app
// oferecia R$ 774,58 por dia a quem ganha R$ 240 por dia; e mostrava R$ 150,06
// por dia no cartão de saúde, uma rolagem abaixo. Esta seção trava as duas
// coisas: o teto vem da renda, e as duas telas leem o mesmo número.
section("1b. [M41] O limite sai da renda; o saldo é só piso de segurança");
{
  const rendaDoMes = limite.renda;
  check("a renda do mês é a base declarada", rendaDoMes > 0, rendaDoMes);
  check("o teto nunca passa da renda do mês",
    limite.teto <= rendaDoMes + 0.01, { teto: limite.teto, renda: rendaDoMes });
  const diasDoMes = run(`daysInMonthOf(Number(__fc.today.slice(0, 4)), Number(__fc.today.slice(5, 7)) - 1)`);
  check("o limite diário não passa da renda diária",
    limite.porDia <= rendaDoMes / diasDoMes + 0.01,
    { porDia: limite.porDia, rendaDiaria: +(rendaDoMes / diasDoMes).toFixed(2) });

  // Encher a conta de dinheiro NÃO aumenta o quanto dá para gastar no mês.
  ctx.__rico = run(`(() => {
    const d = JSON.parse(JSON.stringify(__d));
    d.accounts = (d.accounts || []).map((a, i) => (i === 0 ? { ...a, openingBalance: roundMoney(a.openingBalance + 500000) } : a));
    return d;
  })()`);
  const rico = run(`dailyAllowance(__rico, buildForecast(__rico))`);
  check("meio milhão a mais em conta não muda o limite diário",
    Math.abs(rico.porDia - limite.porDia) < 0.02, { antes: limite.porDia, depois: rico.porDia });
  check("e o saldo maior também não muda o teto",
    Math.abs(rico.teto - limite.teto) < 0.02, { antes: limite.teto, depois: rico.teto });

  // Mas conta vazia APERTA o limite: o saldo continua sendo piso de segurança.
  ctx.__seco = run(`(() => {
    const d = JSON.parse(JSON.stringify(__d));
    d.accounts = (d.accounts || []).map((a) => ({ ...a, openingBalance: 0 }));
    d.accountAdjustments = [];
    return d;
  })()`);
  const seco = run(`dailyAllowance(__seco, buildForecast(__seco))`);
  check("sem saldo em conta o limite aperta", seco.teto <= limite.teto + 0.01,
    { comSaldo: limite.teto, semSaldo: seco.teto });

  // As duas telas leem a MESMA função. Era aqui que nasciam os 5× de diferença.
  const painel = readSrc("js/screens/dashboard.js");
  check("o cartão de saúde do Início lê o teto de dailyAllowance",
    /dailyAllowance\(state\.data, forecastModel\(\)\)/.test(painel) && /limite\.tetoPorDia/.test(painel));
  check("o Início não extrapola mais o gasto pela fração do mês",
    !/mulMoney\(monthExpense, dim \/ dayOfMonth\)/.test(painel));

  // [P4.1] "O alvo vem de do aporte mensal" saiu em toda renderização: as duas
  // variantes de fonte já começam com preposição e o texto acrescentava outra.
  const telaCal = readSrc("js/screens/calendar.js");
  check("a preposição do alvo não sai duplicada",
    /O alvo vem \$\{fonte\}/.test(telaCal) && !/vem de \$\{fonte\}/.test(telaCal));
}

section("2. [M30] Quando não cabe, o app diz que não cabe");
{
  // Meta impossível: o teto não pode aparecer como um número convidativo.
  ctx.__apertado = run(`(() => {
    const d = JSON.parse(JSON.stringify(__d));
    d.goals = d.goals.map((g) => ({ ...g, monthlyPlan: 999999 }));
    return d;
  })()`);
  const apertado = run(`dailyAllowance(__apertado, buildForecast(__apertado))`);
  check("meta maior que o caixa marca aperto", apertado.apertado === true);
  check("e o por dia vira zero em vez de negativo", apertado.porDia === 0, apertado.porDia);

  const tela = readSrc("js/screens/calendar.js");
  check("o aperto tem texto próprio", /o mês já não tem folga para gasto variável/.test(tela));
  check("o aperto não é apresentado como bloqueio", /Isso não bloqueia nada/.test(tela));
  check("a frase do roteiro está lá",
    /Para terminar o mês com/.test(tela) && /por dia/.test(tela));
  check("o app diz de onde veio o alvo",
    /do aporte mensal que você planejou nas suas metas/.test(tela)
    && /da fatia de futuro da sua regra de orçamento/.test(tela));
  check("é declarado como referência, não obrigação", /É referência, não obrigação/.test(tela));
  check("mora no mesmo painel do fechamento, não em cartão separado",
    tela.indexOf("renderDailyAllowance(f)") > tela.indexOf("month-close__rows"));
}

section("3. [M31] A resposta é mensal e traz as três leituras");
{
  // O exemplo do roteiro: notebook de R$ 4.000 em 10x de R$ 400.
  const r = run(`simulateFinancingImpact(__d, { valorBem: 4000, entrada: 0, numParcelas: 10, valorParcela: 400 }, null)`);
  check("traz a sobra mensal antes e depois",
    Number.isFinite(r.monthlyBefore) && Number.isFinite(r.monthlyAfter));
  check("a sobra cai exatamente o valor da parcela",
    Math.abs((r.monthlyBefore - r.monthlyAfter) - 400) < 0.02,
    { antes: r.monthlyBefore, depois: r.monthlyAfter });
  check("traz o comprometimento antes e depois",
    r.commitmentBefore != null && r.commitmentAfter != null,
    { antes: r.commitmentBefore, depois: r.commitmentAfter });
  check("o comprometimento sobe, e sobe pelo tanto certo",
    Math.abs((r.commitmentAfter - r.commitmentBefore) - (400 / r.income) * 100) < 0.1,
    { antes: +r.commitmentBefore.toFixed(2), depois: +r.commitmentAfter.toFixed(2) });
  check("o comprometimento de hoje sai das dívidas cadastradas",
    r.commitmentNow === run(`monthlyDebtCommitment(__d)`), r.commitmentNow);
  check("traz a leitura da reserva", !!r.reserveImpact && typeof r.reserveImpact.affected === "boolean");
  check("compra que cabe na sobra não afeta a reserva",
    r.reserveImpact.affected === false && r.reserveImpact.reason === "preservada", r.reserveImpact);

  // À vista também precisa das três leituras: é a mesma pergunta.
  const v = run(`simulateExpenseImpact(__d, 4000, null)`);
  check("o modo à vista traz sobra mensal", Number.isFinite(v.monthlyBefore) && Number.isFinite(v.monthlyAfter));
  check("o modo à vista traz a reserva", !!v.reserveImpact);
}

section("4. [M31] A reserva é avaliada pelas duas portas de risco");
{
  // Porta 1: pagar à vista esvazia o caixa até abaixo da reserva.
  const caixa = run(`roundMoney(realizedBalance(__d))`);
  const reserva = run(`roundMoney(emergencyFund(__d).current)`);
  const quaseTudo = run(`simulateExpenseImpact(__d, ${Math.round(caixa - reserva + 1000)}, null)`);
  check("compra que encosta na reserva é sinalizada",
    quaseTudo.reserveImpact.affected === true && quaseTudo.reserveImpact.reason === "caixa",
    quaseTudo.reserveImpact);

  // Porta 2: a parcela deixa a sobra mensal negativa.
  const parcelaImpossivel = run(`simulateFinancingImpact(__d, { valorBem: 999999, entrada: 0, numParcelas: 60, valorParcela: 99999 }, null)`);
  check("parcela que estoura a sobra é sinalizada",
    parcelaImpossivel.reserveImpact.affected === true
    && parcelaImpossivel.reserveImpact.reason === "sobra-negativa", parcelaImpossivel.reserveImpact);

  // Sem reserva não há o que preservar, e inventar aviso seria ruído.
  ctx.__semReserva = run(`(() => { const d = JSON.parse(JSON.stringify(__d)); d.goals = []; d.emergencyGoalId = null; return d; })()`);
  const semReserva = run(`simulateExpenseImpact(__semReserva, 100, null)`);
  check("sem reserva registrada o app diz isso em vez de alarmar",
    semReserva.reserveImpact.affected === false && semReserva.reserveImpact.reason === "sem-reserva");
}

section("5. [M31] A tela pergunta o produto e não empurra a compra");
{
  const tela = readSrc("js/screens/simulate.js");
  check("existe campo para o produto", /data-field="sim-label"/.test(tela) && /O que você quer comprar/.test(tela));
  check("o produto é opcional", /\(opcional\)/.test(tela));
  check("o nome do produto é escapado", /escapeHtml\(state\.simulate\.label\)/.test(tela));
  check("as leituras aparecem nos dois modos",
    (tela.match(/\$\{renderPurchaseReadings\(r,/g) || []).length === 2,
    (tela.match(/\$\{renderPurchaseReadings\(r,/g) || []).length);
  check("mostra sobra mensal hoje e depois",
    /Sobra mensal hoje/.test(tela) && /Sobra mensal depois/.test(tela));
  check("mostra o comprometimento passando de X para Y",
    /A parte da renda presa em parcelas passa de/.test(tela));
  check("diz se a reserva é afetada ou não",
    /não seria afetada/.test(tela) && /encostaria na sua reserva/.test(tela));

  // "Não incentivar endividamento" é requisito do roteiro: o app descreve o
  // efeito e devolve a decisão, sem recomendar nem condenar.
  check("a análise se declara educativa", /Leitura educativa, calculada com os seus números/.test(tela));
  check("a decisão fica com a pessoa", /A decisão continua sua: o app não diz se vale a pena/.test(tela));
  check("parcelar não é julgado por si", /Parcelar não é errado nem certo por si/.test(tela));
  ["vale a pena comprar", "você deveria", "recomendamos", "aproveite", "boa oportunidade"]
    .forEach((frase) => check(`sem empurrão: não diz "${frase}"`, !new RegExp(frase, "i").test(tela)));
}

section("6. Nada foi reescrito");
{
  const insights = readSrc("js/insights.js");
  check("simulateExpenseImpact continua devolvendo o que devolvia",
    ["dailyBefore", "dailyAfter", "daysLeft", "dailyDrop", "willExceedIncome", "goalDelay"]
      .every((k) => new RegExp(`\\b${k}[,:]`).test(insights)));
  check("simulateFinancingImpact continua com o custo real",
    /totalPaid, interestCost, interestPct,/.test(insights) && /commitmentPct, commitmentWarning,/.test(insights));
  check("as funções novas são puras",
    !/document\.|\bstate\./.test(insights.slice(insights.indexOf("function monthlyDebtCommitment"), insights.indexOf("function simulateExpenseImpact"))));
  check("dailyAllowance é puro",
    !/document\.|\bstate\./.test(readSrc("js/forecast.js").slice(
      readSrc("js/forecast.js").indexOf("function savingTargetOf"),
      readSrc("js/forecast.js").indexOf("function monthCloseForecast"))));
  check("modelo ausente não quebra o limite diário",
    run(`dailyAllowance(__d, { today: todayIso(), days: [] })`) === null);
}

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
