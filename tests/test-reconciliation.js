// test-reconciliation.js — [M35] Conciliação: comparar, procurar a causa e não
// gravar nada antes de a pessoa pedir.
//
// O risco deste módulo tem dois lados:
//
//   * ARITMÉTICO: apontar como causa um movimento que não fecha a diferença.
//     Uma hipótese errada faz a pessoa apagar um lançamento verdadeiro.
//   * DE PODER: gravar ajuste sozinho. O ajuste faz o saldo bater e ESCONDE o
//     erro; se ele nascer sem pedido, a base apodrece por baixo e ninguém vê.
//
// Por isso metade do arquivo confere centavos e a outra metade confere que o
// diagnóstico não escreve no `data` e que a tela não grava sem o passo do meio.
//
// Ferramenta de dev: `node tests/test-reconciliation.js`.
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
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js",
  "js/reconcile.js",
].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const {
  buildReconciliationModel, reconciliationHeadline, reconciliationSearchStart,
  accountCashEntries, reconcileAccount, accountBalance,
} = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

const HOJE = relogio.iso;
const dia = (n) => ctx.isoOfDate(new ctx.Date(new ctx.Date(`${HOJE}T12:00:00`).getTime() + n * 86400000));

// Base comum: uma conta aberta há um ano com saldo inicial de R$ 1.000.
function base(extra) {
  return {
    accounts: [{
      id: "a1", name: "Principal", type: "corrente", openingBalance: 1000,
      openingDate: dia(-365), color: "#0B6B5C", archived: false, reconciledAt: null,
    }],
    creditCards: [], transactions: [], accountTransfers: [], cardPayments: [],
    accountAdjustments: [], graveyard: {}, ...extra,
  };
}
const despesa = (id, amount, date, description) => ({
  id, type: "expense", amount, date, description, categoryId: "outros", accountId: "a1", creditCardId: null,
});
const receita = (id, amount, date, description) => ({
  id, type: "income", amount, date, description, categoryId: "outros", accountId: "a1", creditCardId: null,
});
const causas = (m) => m.candidates.map((c) => c.cause);

/* ===================================================================== 1 */
section("1. [M35] Comparação: os dois saldos e a diferença");
{
  const d = base({ transactions: [despesa("t1", 250.35, dia(-5), "Mercado")] });
  const saldo = accountBalance(d, "a1", HOJE);
  check("saldo calculado é o do app", saldo === 749.65, saldo);

  const igual = buildReconciliationModel(d, "a1", 749.65, HOJE);
  check("saldos iguais: matched, sem candidato", igual.matched === true && igual.candidates.length === 0);
  check("saldos iguais: a frase diz que nada foi alterado", /Nada foi alterado/.test(reconciliationHeadline(igual)));
  check("saldos iguais: direção nula", igual.direction === null);

  const bancoMaior = buildReconciliationModel(d, "a1", 800, HOJE);
  check("banco com mais: diferença positiva no centavo", bancoMaior.differenceCents === 5035, bancoMaior.differenceCents);
  check("banco com mais: direção declarada", bancoMaior.direction === "banco-maior");
  check("banco com mais: a frase fala do banco", /banco tem R\$\s50,35 a mais/.test(reconciliationHeadline(bancoMaior)), reconciliationHeadline(bancoMaior));

  const bancoMenor = buildReconciliationModel(d, "a1", 700, HOJE);
  check("banco com menos: diferença negativa", bancoMenor.differenceCents === -4965, bancoMenor.differenceCents);
  check("banco com menos: a frase fala do aplicativo", /aplicativo calculou R\$\s49,65 a mais/.test(reconciliationHeadline(bancoMenor)), reconciliationHeadline(bancoMenor));

  check("conta inexistente devolve nulo", buildReconciliationModel(d, "zzz", 10, HOJE) === null);
}

/* ===================================================================== 2 */
section("2. [M35] O diagnóstico NÃO grava nada");
{
  const d = base({ transactions: [despesa("t1", 250.35, dia(-5), "Mercado")] });
  const antes = JSON.stringify(d);
  buildReconciliationModel(d, "a1", 123.45, HOJE);
  check("o modelo não altera os dados recebidos", JSON.stringify(d) === antes);
  check("nenhum ajuste apareceu", (d.accountAdjustments || []).length === 0);

  // A gravação continua sendo só de `reconcileAccount`, e continua igual.
  const gravado = reconcileAccount(d, "a1", 800, HOJE);
  check("gravar continua criando um ajuste da diferença", gravado.adjustment && gravado.adjustment.amount === 50.35, gravado.adjustment);
  check("gravar continua marcando a data da conferência", gravado.data.accounts[0].reconciledAt === HOJE);
  check("gravar não mexe no objeto original", (d.accountAdjustments || []).length === 0);
}

/* ===================================================================== 3 */
section("3. [M35] Causa: lançamento repetido");
{
  const d = base({ transactions: [
    despesa("t1", 120, dia(-6), "Farmácia São Paulo"),
    despesa("t2", 120, dia(-5), "Farmácia São Paulo"),
    despesa("t3", 33.9, dia(-2), "Padaria"),
  ] });
  // Duas farmácias iguais: o banco tem R$ 120 a mais que o app.
  const m = buildReconciliationModel(d, "a1", accountBalance(d, "a1", HOJE) + 120, HOJE);
  const dup = m.candidates.filter((c) => c.cause === "duplicado");
  check("as duas cópias entram como hipótese", dup.length === 2, causas(m));
  check("a duplicidade vem antes da hipótese de ausência", m.candidates[0].cause === "duplicado");
  check("aponta o lançamento pelo id", dup.every((c) => ["t1", "t2"].includes(c.entryId)), dup.map((c) => c.entryId));
  check("o texto é hipótese, não veredito", /Se um dos dois for cópia/.test(dup[0].detail), dup[0].detail);
  check("a hipótese de ausência continua no fim", m.candidates[m.candidates.length - 1].cause === "ausente");
}

/* ===================================================================== 4 */
section("4. [M35] Causa: lançamento único, transferência, fatura e ajuste");
{
  const d = base({
    transactions: [despesa("t1", 87.4, dia(-3), "Assinatura")],
    accountTransfers: [{ id: "tr1", fromAccountId: "a1", toAccountId: "a2", amount: 500, date: dia(-4), description: "Para a reserva" }],
    cardPayments: [{ id: "p1", accountId: "a1", creditCardId: "c1", statementKey: "2026-07", amount: 310.2, date: dia(-8) }],
    accountAdjustments: [{ id: "aj1", accountId: "a1", amount: -42, date: dia(-20), note: "Conciliação de saldo" }],
    creditCards: [{ id: "c1", name: "Cartão", accountId: "a1", closingDay: 5, dueDay: 12, limit: 5000, archived: false, color: "#000" }],
  });
  const saldo = accountBalance(d, "a1", HOJE);

  const porLancamento = buildReconciliationModel(d, "a1", saldo + 87.4, HOJE);
  check("despesa única que fecha a conta vira hipótese", porLancamento.candidates.some((c) => c.cause === "lancamento" && c.entryId === "t1"), causas(porLancamento));

  const porTransferencia = buildReconciliationModel(d, "a1", saldo + 500, HOJE);
  check("transferência que fecha a conta é nomeada como transferência", porTransferencia.candidates.some((c) => c.cause === "transferencia" && c.entryId === "tr1"), causas(porTransferencia));
  check("o texto da transferência lembra da contagem dupla", /duas vezes/.test((porTransferencia.candidates.find((c) => c.cause === "transferencia") || {}).detail || ""));

  const porFatura = buildReconciliationModel(d, "a1", saldo + 310.2, HOJE);
  check("pagamento de fatura registrado aqui vira hipótese", porFatura.candidates.some((c) => c.cause === "fatura" && c.entryId === "p1"), causas(porFatura));

  // O ajuste de -42 deixou o app R$ 42 mais pobre; sem ele, o app teria 42 a
  // mais. Para que APAGÁ-LO feche a conta, o banco precisa ter 42 a mais.
  const porAjuste = buildReconciliationModel(d, "a1", saldo + 42, HOJE);
  check("ajuste anterior é apontado como causa possível", porAjuste.candidates.some((c) => c.cause === "ajuste" && c.entryId === "aj1"), causas(porAjuste));
  check("o texto do ajuste avisa que um ajuste novo esconderia os dois", /esconderia os dois/.test((porAjuste.candidates.find((c) => c.cause === "ajuste") || {}).detail || ""));
}

/* ===================================================================== 5 */
section("5. [M35] Causa: fatura em aberto que o banco já debitou");
{
  const vencida = dia(-9);
  const compra = dia(-40);
  const d = base({
    creditCards: [{ id: "c1", name: "Cartão Azul", accountId: "a1", closingDay: 28, dueDay: 5, limit: 5000, archived: false, color: "#000" }],
    transactions: [{ id: "t1", type: "expense", amount: 431.7, date: compra, description: "Compra", categoryId: "outros", accountId: null, creditCardId: "c1" }],
  });
  const statements = ctx.cardStatements(d, "c1");
  const aberta = statements.find((s) => s.outstanding > 0);
  check("a fatura existe em aberto para o teste", !!aberta && aberta.outstanding === 431.7, statements);
  if (aberta) {
    // Faz a fatura estar vencida ajustando o vencimento para o passado, que é o
    // caso que interessa: o banco debitou e o app não sabe.
    d.creditCards[0].dueDay = new ctx.Date(`${vencida}T12:00:00`).getDate();
    const s2 = ctx.cardStatements(d, "c1").find((s) => s.outstanding > 0);
    const saldo = accountBalance(d, "a1", HOJE);
    const m = buildReconciliationModel(d, "a1", saldo - 431.7, HOJE);
    const fat = m.candidates.find((c) => c.cause === "fatura-aberta");
    const vencidaAntes = s2 && s2.dueDate <= HOJE;
    check("fatura vencida e sem pagamento vira hipótese", vencidaAntes ? !!fat : true, { vencidaAntes, causas: causas(m) });
    if (fat) {
      check("a hipótese leva ao pagamento da fatura, não a um ajuste", fat.cardId === "c1" && !!fat.statementKey && /registre o pagamento da fatura/.test(fat.detail), fat);
    }
    // O sentido importa: com o banco tendo MAIS dinheiro, fatura em aberto não
    // explica nada e não pode ser oferecida.
    const inverso = buildReconciliationModel(d, "a1", saldo + 431.7, HOJE);
    check("no sentido contrário a fatura aberta não é oferecida", !inverso.candidates.some((c) => c.cause === "fatura-aberta"), causas(inverso));
  }
}

/* ===================================================================== 6 */
section("6. [M35] Causa: sinal invertido e ausência");
{
  const d = base({ transactions: [receita("t1", 200, dia(-3), "Reembolso")] });
  const saldo = accountBalance(d, "a1", HOJE);
  // Se os R$ 200 forem na verdade uma saída, o saldo cai R$ 400.
  const m = buildReconciliationModel(d, "a1", saldo - 400, HOJE);
  const sinal = m.candidates.find((c) => c.cause === "sinal");
  check("valor pela metade da diferença vira hipótese de sinal invertido", !!sinal && sinal.entryId === "t1", causas(m));
  check("o texto do sinal nomeia os dois lados", /lançados como entrada/.test(sinal.detail) && /for saída/.test(sinal.detail), sinal && sinal.detail);
  check("a hipótese de sinal vem depois das exatas", m.candidates.findIndex((c) => c.cause === "sinal") < m.candidates.findIndex((c) => c.cause === "ausente"));

  const semExplicacao = buildReconciliationModel(d, "a1", saldo - 17.33, HOJE);
  check("sem hipótese que feche, sobra só a ausência", causas(semExplicacao).join(",") === "ausente", causas(semExplicacao));
  check("ausência com banco menor procura um débito", /débito que não foi lançado/.test(semExplicacao.candidates[0].detail), semExplicacao.candidates[0].detail);
  const faltaEntrada = buildReconciliationModel(d, "a1", saldo + 17.33, HOJE);
  check("ausência com banco maior procura um crédito", /crédito que não foi lançado/.test(faltaEntrada.candidates[0].detail), faltaEntrada.candidates[0].detail);
  check("a hipótese de ausência não aponta lançamento nenhum", faltaEntrada.candidates[0].entryId === null);
}

/* ===================================================================== 7 */
section("7. [M35] A janela da procura");
{
  const conta = { id: "a1", openingDate: "2020-01-01", reconciledAt: null };
  check("sem conferência anterior, 90 dias", reconciliationSearchStart(conta, "2026-06-30") === "2026-04-01", reconciliationSearchStart(conta, "2026-06-30"));
  check("conferência mais antiga que 90 dias alarga a janela",
    reconciliationSearchStart({ ...conta, reconciledAt: "2025-12-10" }, "2026-06-30") === "2025-12-10");
  check("conferência recente não estreita a janela abaixo dos 90 dias",
    reconciliationSearchStart({ ...conta, reconciledAt: "2026-06-20" }, "2026-06-30") === "2026-04-01");
  check("a abertura da conta é o piso",
    reconciliationSearchStart({ ...conta, openingDate: "2026-05-01" }, "2026-06-30") === "2026-05-01");

  // Movimento fora da janela não pode ser acusado.
  const d = base({ transactions: [despesa("velho", 60, dia(-200), "Antigo")] });
  const m = buildReconciliationModel(d, "a1", accountBalance(d, "a1", HOJE) + 60, HOJE);
  check("movimento fora da janela não vira hipótese", !m.candidates.some((c) => c.entryId === "velho"), causas(m));
  check("a janela é declarada no modelo", m.searchFrom === dia(-90) && typeof m.scannedCount === "number", { searchFrom: m.searchFrom, scanned: m.scannedCount });
}

/* ===================================================================== 8 */
section("8. [M35] O que NÃO conta como movimento da conta");
{
  const d = base({
    transactions: [
      despesa("t1", 10, dia(-2), "Débito"),
      { id: "t2", type: "expense", amount: 99, date: dia(-2), description: "No cartão", categoryId: "outros", accountId: "a1", creditCardId: "c1" },
      despesa("t3", 77, dia(3), "Agendado"),
      despesa("t4", 55, dia(-400), "Antes da abertura"),
      { id: "t5", type: "expense", amount: 12, date: dia(-2), description: "Outra conta", categoryId: "outros", accountId: "a2", creditCardId: null },
    ],
  });
  const ids = accountCashEntries(d, "a1", HOJE).map((e) => e.id);
  check("compra no cartão não mexe no saldo da conta", !ids.includes("t2"), ids);
  check("lançamento futuro fica fora da conferência de hoje", !ids.includes("t3"), ids);
  check("lançamento anterior à abertura fica fora", !ids.includes("t4"), ids);
  check("lançamento de outra conta fica fora", !ids.includes("t5"), ids);
  check("o débito da própria conta entra", ids.includes("t1"), ids);
  check("a lista bate com o saldo calculado",
    accountCashEntries(d, "a1", HOJE).reduce((c, e) => c + e.effectCents, 100000) === ctx.moneyToCents(accountBalance(d, "a1", HOJE)));
}

/* ===================================================================== 9 */
section("9. [M35] O que a tela tem permissão de fazer");
{
  const tela = readSrc("js/screens/accounts.js");
  const acoes = readSrc("js/actions.js");

  check("o passo de comparação existe antes de gravar", /data-action="account-reconcile-check"/.test(tela));
  check("gravar só aparece dentro do painel de revisão",
    tela.indexOf("account-reconcile-save") > tela.indexOf("renderReconcilePanel"), {
      save: tela.indexOf("account-reconcile-save"), painel: tela.indexOf("renderReconcilePanel"),
    });
  check("o botão de gravar diz o valor do ajuste", /Registrar ajuste de \$\{diferenca\}/.test(tela));
  check("existe saída sem gravar nada", /Vou corrigir o lançamento/.test(tela));
  check("a tela avisa que o ajuste não corrige a causa", /não corrige a causa/.test(tela));
  check("a tela avisa que nada foi alterado até ali", /nada foi alterado/i.test(tela));

  // XSS: título e detalhe carregam descrição digitada pelo usuário.
  check("título e detalhe da causa são escapados", /escapeHtml\(c\.title\)/.test(tela) && /escapeHtml\(c\.detail\)/.test(tela));

  const blocoCheck = acoes.slice(acoes.indexOf('case "account-reconcile-check"'), acoes.indexOf('case "account-reconcile-edit"'));
  check("comparar não grava", !/setData\(/.test(blocoCheck), blocoCheck.slice(0, 200));
  check("comparar usa o modelo do M35", /buildReconciliationModel\(/.test(blocoCheck));
  check("a data da conferência é validada contra o futuro", /informada > todayIso\(\)/.test(acoes));
}

/* ==================================================================== 10 */
section("10. [M35] Saldo declarado pelo extrato (OFX)");
{
  const importSrc = readSrc("js/import.js");
  check("o saldo do OFX é lido do LEDGERBAL", /parseOfxLedgerBalance/.test(importSrc) && /LEDGERBAL/.test(importSrc));
  check("ele viaja como statementBalance, sem virar lançamento", /statementBalance: parseOfxLedgerBalance\(text\)/.test(importSrc));
  const commit = readSrc("js/actions.js");
  const bloco = commit.slice(commit.indexOf('case "import-confirm"'), commit.indexOf('case "open-qr"'));
  check("depois da importação a conferência abre preenchida, sem gravar ajuste",
    /state\.accountsUi\.reconcileValue = moneyDraft\(saldoDoExtrato\.amount\)/.test(bloco) && !/reconcileAccount\(/.test(bloco));
  check("data futura declarada no arquivo não é aceita", /saldoDoExtrato\.date <= todayIso\(\)/.test(bloco));
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
