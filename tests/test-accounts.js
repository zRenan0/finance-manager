// test-accounts.js — regras financeiras de contas, cartões, faturas e conciliação
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = {
  console, module: { exports: {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" },
  addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/forecast.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b) => Math.abs(a - b) <= 0.001;

console.log("\n1. Schema e migração");
{
  const fresh = run("defaultData()");
  check("schema está na v23", fresh.version === 23, fresh.version);
  check("base nova contém as cinco coleções", ["accounts", "creditCards", "accountTransfers", "cardPayments", "accountAdjustments"].every((k) => Array.isArray(fresh[k])));

  ctx.__legacy = {
    version: 11,
    transactions: [
      { id: "l1", type: "income", amount: 1000, date: "2026-07-01", categoryId: "salario" },
      { id: "l2", type: "expense", amount: 250, date: "2026-07-02", categoryId: "moradia", accountId: "inexistente", creditCardId: "inexistente" },
    ],
  };
  const migrated = run("migrate(__legacy)");
  check("histórico antigo é preservado", migrated.transactions.length === 2);
  check("lançamentos sem conta continuam compondo o caixa", near(run("legacyCashBalance(__legacyMigrated = migrate(__legacy))"), 750));
  check("vínculos órfãos são removidos", migrated.transactions[1].accountId === null && migrated.transactions[1].creditCardId === null);
}

console.log("\n2. Saldos e movimentos internos");
{
  ctx.__raw = {
    ...run("defaultData()"),
    accounts: [
      { id: "a1", name: "Principal", type: "corrente", openingBalance: 1000, openingDate: "2026-08-01" },
      { id: "a2", name: "Reserva", type: "poupanca", openingBalance: 50, openingDate: "2026-08-01" },
    ],
    creditCards: [{ id: "c1", name: "Cartão", accountId: "a1", limit: 2000, closingDay: 20, dueDay: 28 }],
    transactions: [
      { id: "t0", type: "income", amount: 900, date: "2026-07-31", categoryId: "salario", accountId: "a1" },
      { id: "t1", type: "income", amount: 500, date: "2026-08-03", categoryId: "salario", accountId: "a1" },
      { id: "t2", type: "expense", amount: 200, date: "2026-08-04", categoryId: "moradia", accountId: "a1" },
      { id: "t3", type: "expense", amount: 300, date: "2026-08-05", categoryId: "mercado", creditCardId: "c1", payment: "Crédito" },
      { id: "t4", type: "income", amount: 100, date: "2026-08-02", categoryId: "salario" },
      { id: "t5", type: "expense", amount: 30, date: "2026-08-02", categoryId: "outros" },
    ],
    accountTransfers: [{ id: "tr1", fromAccountId: "a1", toAccountId: "a2", amount: 250, date: "2026-08-06" }],
    cardPayments: [{ id: "p1", accountId: "a1", creditCardId: "c1", amount: 100, statementKey: "2026-08", date: "2026-08-07" }],
    accountAdjustments: [{ id: "aj1", accountId: "a1", amount: 50, date: "2026-08-08" }],
  };
  run("__data = migrate(__raw)");
  check("saldo inicial ignora lançamentos anteriores à abertura", near(run("accountBalance(__data, 'a1', '2026-08-08')"), 1000), run("accountBalance(__data, 'a1', '2026-08-08')"));
  check("transferência entra na conta de destino", near(run("accountBalance(__data, 'a2', '2026-08-08')"), 300));
  check("compra no cartão não reduz a conta na compra", near(run("accountBalance({ ...__data, cardPayments: [], accountAdjustments: [], accountTransfers: [] }, 'a1', '2026-08-08')"), 1300));
  check("histórico sem conta permanece no total", near(run("legacyCashBalance(__data, '2026-08-08')"), 70));
  check("saldo total consolida contas e histórico", near(run("accountsCashBalance(__data, '2026-08-08')"), 1370), run("accountsCashBalance(__data, '2026-08-08')"));

  const totals = run("monthTotals(__data, '2026-08')");
  check("despesas do mês incluem a compra no cartão", near(totals.expense, 530), totals.expense);
  check("transferência e pagamento de fatura não duplicam despesas", totals.tx.length === 5, totals.tx.length);
}

console.log("\n3. Fechamento e pagamento de fatura");
{
  ctx.__cardA = { closingDay: 20, dueDay: 28 };
  check("compra antes do fechamento vence no mesmo mês", run("cardStatementKeyForDate(__cardA, '2026-08-10')") === "2026-08");
  check("compra após o fechamento vai para o mês seguinte", run("cardStatementKeyForDate(__cardA, '2026-08-21')") === "2026-09");

  ctx.__cardB = { closingDay: 25, dueDay: 5 };
  check("vencimento anterior ao fechamento avança um mês", run("cardStatementKeyForDate(__cardB, '2026-08-10')") === "2026-09");
  check("compra após o fechamento avança duas competências", run("cardStatementKeyForDate(__cardB, '2026-08-26')") === "2026-10");
  check("dia de vencimento é limitado ao último dia do mês", run("cardStatementDueDate({ dueDay: 31 }, '2026-02')") === "2026-02-28");

  const statements = run("cardStatements(__data, 'c1')");
  check("fatura soma as compras", near(statements[0].purchases, 300), statements[0].purchases);
  check("pagamento abate o aberto sem nova despesa", near(statements[0].outstanding, 200), statements[0].outstanding);
  const summary = run("accountsSummary(__data, '2026-08-31')");
  check("resumo desconta apenas faturas abertas do caixa", near(summary.availableAfterCards, 1170), summary.availableAfterCards);
  check("limite disponível considera toda a dívida do cartão", near(summary.cards[0].availableLimit, 1800), summary.cards[0].availableLimit);
}

console.log("\n4. Validação e conciliação");
{
  check("transferência para a mesma conta é recusada", run("makeAccountTransfer({ fromAccountId: 'a1', toAccountId: 'a1', amount: 10, date: '2026-08-10' }, __data.accounts)") === null);
  check("pagamento com conta inexistente é recusado", run("makeCardPayment({ accountId: 'x', creditCardId: 'c1', amount: 10, statementKey: '2026-08', date: '2026-08-10' }, __data.accounts, __data.creditCards)") === null);
  run("__rec = reconcileAccount(__data, 'a1', 1200, '2026-08-08')");
  check("conciliação cria ajuste pela diferença", near(run("__rec.adjustment.amount"), 200), run("__rec.adjustment.amount"));
  check("saldo conciliado chega ao valor informado", near(run("accountBalance(__rec.data, 'a1', '2026-08-08')"), 1200));
  run("__same = reconcileAccount(__rec.data, 'a1', 1200, '2026-08-08')");
  check("repetir a mesma conciliação não cria outro ajuste", run("__same.adjustment") === null);
}

console.log("\n4b. Passivo reconhecido do cartão");
{
  ctx.__liabilityRaw = {
    ...run("defaultData()"),
    accounts: [{ id: "la", name: "Conta", type: "corrente", openingBalance: 0, openingDate: "2026-08-01" }],
    creditCards: [{ id: "lc", name: "Cartão", accountId: "la", limit: 5000, closingDay: 20, dueDay: 28 }],
    transactions: run("makeInstallmentTransactions({ type: 'expense', amount: 1200, categoryId: 'outros', date: '2026-08-10', payment: 'Crédito', creditCardId: 'lc', installmentGroupId: 'lg' }, 3)").concat([
      { id: "future-single", type: "expense", amount: 100, categoryId: "outros", date: "2026-11-10", payment: "Crédito", creditCardId: "lc" },
    ]),
    cardPayments: [{ id: "lp", accountId: "la", creditCardId: "lc", statementKey: "2026-08", amount: 200, date: "2026-08-15" }],
  };
  run("__liability = migrate(__liabilityRaw); __cardLiability = cardLiabilitySummary(__liability, '2026-08-15', 30)");
  check("compra parcelada entra pelo compromisso total", near(run("__cardLiability.total"), 1000), run("__cardLiability.total"));
  check("pagamento parcial reduz o passivo", near(run("cardLiabilityStatements(__liability, 'lc', '2026-08-15')[0].outstanding"), 200));
  check("compra avulsa futura ainda não vira dívida", run("cardLiabilityStatements(__liability, 'lc', '2026-08-15').every(s => s.key !== '2026-11')"));
  check("antes da primeira parcela não há obrigação reconhecida", near(run("cardLiabilitySummary(__liability, '2026-07-31').total"), 0));
  check("fatura do mês entra nos próximos 30 dias", near(run("__cardLiability.dueWithin30"), 200), run("__cardLiability.dueWithin30"));
  check("fatura vencida é separada do restante", near(run("cardLiabilitySummary(__liability, '2026-09-01').overdue"), 200));

  run(`__liabilityPaid = migrate({ ...__liability, cardPayments: [
    { id: "p1", accountId: "la", creditCardId: "lc", statementKey: "2026-08", amount: 400, date: "2026-08-28" },
    { id: "p2", accountId: "la", creditCardId: "lc", statementKey: "2026-09", amount: 400, date: "2026-09-28" },
    { id: "p3", accountId: "la", creditCardId: "lc", statementKey: "2026-10", amount: 400, date: "2026-10-28" }
  ] })`);
  check("quitação zera o passivo", near(run("cardLiabilitySummary(__liabilityPaid, '2026-10-31').total"), 0));
}

console.log("\n5. Backup e mesclagem");
{
  run("__envelope = buildBackupEnvelope(__data)");
  check("backup inclui contas e cartões", run("__envelope.counts.accounts === 2 && __envelope.counts.creditCards === 1"));
  run("__parsed = parseBackupFile(JSON.stringify(__envelope))");
  check("checksum do backup é válido", run("__parsed.meta.checksumOk") === true);
  check("restauração preserva movimentos internos", run("__parsed.data.accountTransfers.length === 1 && __parsed.data.cardPayments.length === 1 && __parsed.data.accountAdjustments.length === 1"));
  run("__merged = mergeBackupInto(defaultData(), __parsed.data)");
  check("mesclagem leva as contas sem duplicar", run("__merged.data.accounts.length") === 2, run("__merged.data.accounts.length"));
  check("estatística da mesclagem informa contas e cartões", run("__merged.stats.accounts === 2 && __merged.stats.creditCards === 1"));
}

console.log("\n6. Previsão de caixa com cartão");
{
  ctx.__forecastRaw = {
    ...run("defaultData()"),
    accounts: [{ id: "fa", name: "Conta", type: "corrente", openingBalance: 1000, openingDate: "2026-08-01" }],
    creditCards: [{ id: "fc", name: "Cartão", accountId: "fa", limit: 2000, closingDay: 20, dueDay: 28 }],
    transactions: [{ id: "ft", type: "expense", amount: 300, date: "2026-08-10", categoryId: "mercado", creditCardId: "fc", payment: "Crédito" }],
  };
  run("__forecastData = migrate(__forecastRaw); __forecast = buildForecast(__forecastData, '2026-08-03')");
  check("compra futura no crédito não reduz o caixa na data da compra", run("__forecast.events.find(e => e.id === 'tx-ft').cashEffect") === false);
  check("fatura conhecida entra como saída no vencimento", run("__forecast.events.some(e => e.kind === 'card-statement' && e.iso === '2026-08-28' && e.amount === 300)"));
  check("fatura é descontada uma única vez no horizonte de 30 dias", near(run("__forecast.horizons.find(h => h.id === '30d').projected"), 700), run("__forecast.horizons.find(h => h.id === '30d').projected"));
  check("premissa da previsão explica o tratamento da fatura", run("__forecast.assumptions.some(a => /fatura conhecida/.test(a))"));

  ctx.__overdueRaw = {
    ...run("defaultData()"),
    accounts: [{ id: "oa", name: "Conta", type: "corrente", openingBalance: 1000, openingDate: "2026-07-01" }],
    creditCards: [{ id: "oc", name: "Cartão", accountId: "oa", limit: 2000, closingDay: 20, dueDay: 28 }],
    transactions: [{ id: "ot", type: "expense", amount: 250, date: "2026-07-10", categoryId: "mercado", creditCardId: "oc", payment: "Crédito", installmentGroupId: "og", installmentIndex: 1, installmentTotal: 1 }],
  };
  run("__overdue = buildForecast(migrate(__overdueRaw), '2026-08-03')");
  check("fatura vencida entra no primeiro dia da projeção", run("__overdue.events.some(e => e.kind === 'card-statement' && e.iso === '2026-08-04' && e.meta.overdue)"));
  check("fatura vencida reduz o horizonte de 7 dias", near(run("__overdue.horizons.find(h => h.id === '7d').projected"), 750));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
