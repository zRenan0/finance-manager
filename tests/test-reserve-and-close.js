// test-reserve-and-close.js — [M28] escada da reserva e [M29] fechamento do mês.
//
// Os dois módulos exibem NÚMEROS QUE A PESSOA USA PARA DECIDIR, e cada um tem
// uma armadilha própria:
//
//   M28  dimensionar reserva pelo gasto TOTAL pede uma meta maior que a
//        necessária. A régua tem de ser o essencial, e nenhum degrau pode ser
//        apresentado como o certo.
//   M29  uma conta escrita na tela que não fecha destrói a confiança no cartão
//        inteiro. A soma das parcelas tem de dar exatamente o total exibido, e
//        as parcelas têm de vir da mesma fonte que produz o saldo diário.
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

// Relógio congelado. A escada da reserva depende de meses de histórico e as
// fixtures falam em dias fixos do mês. Ver `tests/helpers/fixed-clock.js`.
// O último dia do mês tem seção própria abaixo (3b): o fechamento precisa
// existir nele também, com um dia só pela frente.
const relogio = require("./helpers/fixed-clock").congelar(ctx);
const Date = relogio.DataFixa;
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js",
  "js/debts.js", "js/metrics.js", "js/wealth.js", "js/goals.js", "js/forecast.js", "js/score.js", "js/demo.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

ctx.__demo = run(`buildDemoData()`);
const escada = run(`emergencyLadder(__demo)`);

section("1. [M28] A régua é o essencial, não o gasto total");
{
  const essenciais = run(`avgMonthlyEssentials(__demo)`);
  const total = run(`avgMonthlyExpense(__demo)`);
  check("a média de essenciais é calculada", essenciais > 0, essenciais);
  check("essencial é menor que o gasto total", essenciais < total, { essenciais, total });
  check("a escada usa a média de essenciais", escada.essentials === essenciais);
  check("a escada se declara mensurável quando há essencial", escada.measurable === true);

  // O grupo `necessidade` é a mesma régua do orçamento, do score e da saúde.
  // Duplicá-la aqui seria criar uma segunda definição de "essencial".
  check("reaproveita o grupo de necessidade do orçamento",
    /monthGroupSpend\(data, key\)\.necessidade/.test(readSrc("js/metrics.js")));
}

section("2. [M28] Três degraus, nenhum obrigatório");
{
  check("são exatamente 3, 6 e 9 meses",
    escada.rungs.map((r) => r.months).join(",") === "3,6,9", escada.rungs.map((r) => r.months));
  check("cada degrau é meses vezes o essencial",
    escada.rungs.every((r) => Math.abs(r.target - escada.essentials * r.months) < 0.02),
    escada.rungs.map((r) => [r.months, r.target]));
  check("os alvos crescem com os meses",
    escada.rungs[0].target < escada.rungs[1].target && escada.rungs[1].target < escada.rungs[2].target);
  check("o que falta nunca é negativo", escada.rungs.every((r) => r.missing >= 0));
  check("exatamente um degrau é marcado como o escolhido",
    escada.rungs.filter((r) => r.chosen).length === 1,
    escada.rungs.filter((r) => r.chosen).map((r) => r.months));
  check("o escolhido é o que está nos dados, não um padrão do teste",
    escada.rungs.find((r) => r.chosen).months === escada.chosenMonths);

  // O roteiro é explícito: não tratar um número como obrigatório.
  const tela = readSrc("js/screens/health.js");
  check("nenhum degrau é chamado de recomendado",
    !/recomendad/i.test(tela.slice(tela.indexOf("renderEmergencyLadder"), tela.indexOf("// ---- Cartão de um indicador ----"))));
  check("a tela diz que nenhum é obrigatório", /Nenhum desses degraus é obrigatório/.test(tela));
  // O texto de cada degrau mora no motor, junto da definição, e a tela só o
  // exibe. É por isso que a checagem olha metrics.js.
  check("cada degrau explica para quem ele faz sentido",
    escada.rungs.every((r) => typeof r.note === "string" && r.note.length > 20)
    && /renda variável, autônomo ou sócio/.test(readSrc("js/metrics.js"))
    && /carteira assinada/.test(readSrc("js/metrics.js")));
  check("a tela exibe a explicação de cada degrau",
    /reserve-rung__note/.test(tela) && /escapeHtml\(r\.note\)/.test(tela));
  check("a tela explica por que a conta usa só o essencial",
    /continua saindo quando tudo o mais é cortado/.test(tela));

  // Sem essencial medido, qualquer alvo seria chute.
  ctx.__vazio = run(`migrate(defaultData())`);
  const vazia = run(`emergencyLadder(__vazio)`);
  check("base sem gasto não produz escada", vazia.measurable === false);
  check("e a tela some nesse caso", /if \(!e\.measurable\) return "";/.test(tela));
}

section("3. [M29] A CONTA TEM DE FECHAR");
{
  ctx.__fc = run(`buildForecast(__demo)`);
  const m = run(`monthCloseForecast(__fc)`);
  check("a cadeia é produzida", !!m);

  const soma = m.saldoAtual + m.receitas - m.contas - m.variaveis;
  check("a soma das parcelas dá exatamente o total exibido",
    Math.abs(soma - m.projetado) < 0.005, { soma: +soma.toFixed(2), projetado: m.projetado });

  // A conferência independente: a caminhada dia a dia tem de chegar ao mesmo
  // lugar. Centavos de arredondamento são tolerados; reais, não.
  check("a caminhada diária concorda com a soma",
    Math.abs(m.divergencia) < 0.10, { divergencia: m.divergencia, diario: m.projetadoDiario });

  check("as quatro parcelas do roteiro existem",
    Number.isFinite(m.saldoAtual) && Number.isFinite(m.receitas)
    && Number.isFinite(m.contas) && Number.isFinite(m.variaveis));
  check("saldo de hoje é o do motor", m.saldoAtual === run(`roundMoney(__fc.balance)`));
  check("o gasto variável vem da linha de base, não de outra conta",
    m.variaveis === run(`roundMoney(__fc.baseline.remainingCurrentMonth)`));
  check("receitas e contas não são negativas", m.receitas >= 0 && m.contas >= 0);
  check("a janela termina dentro do mês corrente",
    m.endIso.slice(0, 7) === m.monthKey && m.monthKey === run(`todayIso()`).slice(0, 7));
}

section("4. [M29] Margem e risco dizem a verdade");
{
  const m = run(`monthCloseForecast(__fc)`);
  // O PONTO: margem é o PIOR dia, não o último. Fechar positivo não ajuda quem
  // fica no vermelho no dia 18 e volta ao azul quando o salário cai no dia 30.
  const diasDoMes = run(`__fc.days.filter((d) => d.iso.slice(0, 7) === "${m.monthKey}").map((d) => d.balance)`);
  // Tolerância de centavos: quando o pior dia é o último, a margem passa a ser
  // o próprio saldo projetado, para a tela não mostrar dois números quase
  // iguais lado a lado. As duas rotas diferem por arredondamento, não por
  // cálculo.
  // No último dia do mês a caminhada não tem dia do mês corrente (ver 3b): o
  // pior dia é o próprio fechamento, e a margem é o saldo projetado.
  const minimo = diasDoMes.length ? Math.min(...diasDoMes) : m.projetado;
  check("a margem é o menor saldo do mês",
    Math.abs(m.margem - minimo) < 0.10, { margem: m.margem, minimo });
  check("quando o pior dia é o último, margem e projetado são o MESMO número",
    m.fundoIso !== m.endIso || m.margem === m.projetado, { fundoIso: m.fundoIso, endIso: m.endIso });
  check("a margem nunca é maior que o saldo projetado pela caminhada",
    m.margem <= m.projetadoDiario + 0.005, { margem: m.margem, projetado: m.projetadoDiario });
  check("risco só é verdadeiro quando algum dia fica negativo",
    m.risco === diasDoMes.some((b) => b < 0), { risco: m.risco });
  check("com risco existe a data; sem risco, não",
    m.risco ? !!m.riscoIso : m.riscoIso === null);

  const tela = readSrc("js/screens/calendar.js");
  check("a tela nomeia a margem de segurança", /Margem de segurança/.test(tela));
  // [M41] FLUXO E SALDO NÃO DIVIDEM VOCABULÁRIO. Este cartão fala de SALDO em
  // conta; o pilar de poupança do score, na mesma rolagem, fala de FLUXO
  // (entrou menos saiu). O painel dizia "você deve fechar o mês no vermelho em
  // R$ 6.857" logo acima de "sem risco de saldo negativo no mês", e as duas
  // frases eram verdadeiras ao mesmo tempo.
  check("a tela nomeia o risco de a conta ficar negativa", /Risco de a conta ficar negativa/.test(tela));
  check("a tela separa saldo de fluxo em palavras", /Isto é saldo, não fluxo/.test(tela));
  const scoreSemComentario = readSrc("js/score.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  check("o score fala de gasto acima da renda, não de \"vermelho\"",
    /o gasto \$\{base\.partial \? "deve superar" : "superou"\} a renda/.test(scoreSemComentario)
    && !/no vermelho/.test(scoreSemComentario));
  check("a margem é apresentada como o pior dia", /no pior dia do mês/.test(tela));
  check("o gasto variável é rotulado como estimativa",
    /média dos últimos meses, é estimativa/.test(tela));
  check("compromisso conhecido é distinguido de estimativa",
    /fixas, parcelas e faturas com data/.test(tela));
  check("a cadeia aparece nas duas versões do cartão",
    (tela.match(/\$\{renderMonthClose\(f\)\}/g) || []).length === 2,
    (tela.match(/\$\{renderMonthClose\(f\)\}/g) || []).length);
  check("todo rótulo é escapado", !/\$\{l\.label\}/.test(tela) && !/\$\{l\.nota\}/.test(tela));
}

section("5. Os motores continuam puros e nada foi reescrito");
{
  const metrics = readSrc("js/metrics.js");
  const fc = readSrc("js/forecast.js");
  check("emergencyFund não foi alterado",
    /const targetMonths = Math\.max\(1, Number\(data\.emergencyMonths\) \|\| 6\);/.test(metrics));
  check("avgMonthlyExpense continua somando tudo",
    /function avgMonthlyExpense\(data, months = 3\)/.test(metrics));
  check("buildForecast continua devolvendo o que devolvia",
    ["today", "balance", "days", "events", "horizons", "lowest", "negativeDayIso", "baseline", "assumptions"]
      .every((k) => new RegExp(`^\\s*${k}[,:]`, "m").test(fc)));
  check("as funções novas são puras",
    !/document\.|\bstate\./.test(metrics.slice(metrics.indexOf("function avgMonthlyEssentials"), metrics.indexOf("function emergencyFund")))
    && !/document\.|\bstate\./.test(fc.slice(fc.indexOf("function monthCloseForecast"), fc.indexOf("function forecastAssumptions"))));
  check("modelo ausente não quebra a cadeia",
    run(`monthCloseForecast(null)`) === null && run(`monthCloseForecast({ days: [] })`) === null);
}

// ------------------------------------------------------------------------------
// O ÚLTIMO DIA DO MÊS TAMBÉM É UM DIA DO MÊS
// ------------------------------------------------------------------------------
// A caminhada de `buildForecast` começa amanhã. No dia 31 não sobrava dia do
// mês corrente nela, `monthCloseForecast` devolvia null e, em cascata, o bloco
// "Como o mês fecha", a margem de segurança e o limite diário sumiam do Início
// e do calendário, enquanto o cartão de saúde ao lado continuava falando em
// "1 dia". Esta seção prende o comportamento certo: no fechamento, nada mais
// entra nem sai por previsão, o saldo projetado é o de hoje menos a estimativa
// de variável do dia, e o limite diário divide a folga por um dia.
section("3b. O fechamento existe no último dia do mês");
{
  const hoje = run(`todayIso()`);
  const [ano, mes] = hoje.split("-").map(Number);
  const ultimoDia = run(`daysInMonthOf(${ano}, ${mes - 1})`);
  ctx.__ultimoIso = `${hoje.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;
  ctx.__fcUltimo = run(`buildForecast(__demo, __ultimoIso)`);
  const m = run(`monthCloseForecast(__fcUltimo)`);
  check("a cadeia é produzida no último dia", !!m, ctx.__ultimoIso);
  if (m) {
    check("o fechamento é hoje", m.endIso === ctx.__ultimoIso, m.endIso);
    check("nenhuma receita ou conta futura cai mais neste mês", m.receitas === 0 && m.contas === 0, { receitas: m.receitas, contas: m.contas });
    const soma = m.saldoAtual + m.receitas - m.contas - m.variaveis;
    check("a soma das parcelas continua dando o total exibido",
      Math.abs(soma - m.projetado) < 0.005, { soma: +soma.toFixed(2), projetado: m.projetado });
    check("as duas rotas concordam", m.divergencia === 0, m.divergencia);
    check("o pior dia é o próprio fechamento", m.fundoIso === ctx.__ultimoIso && m.margem === m.projetado);
  }
  const limite = run(`dailyAllowance(__demo, __fcUltimo)`);
  check("o limite diário existe no último dia", !!limite);
  if (limite) {
    check("falta exatamente um dia", limite.diasRestantes === 1, limite.diasRestantes);
    check("o dia que falta recebe a folga inteira",
      Math.abs(limite.porDia - Math.max(0, limite.disponivel)) < 0.005, { porDia: limite.porDia, disponivel: limite.disponivel });
  }
  // O caminho normal não mudou: no meio do mês o fechamento continua sendo o
  // último dia da caminhada, não hoje.
  const meio = run(`monthCloseForecast(buildForecast(__demo))`);
  check("no meio do mês o fechamento continua no fim do mês", !!meio && meio.endIso === ctx.__ultimoIso);
  if (hoje !== ctx.__ultimoIso) check("e, fora do último dia, ele não é hoje", !!meio && meio.endIso !== hoje, meio && meio.endIso);
}

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
