// test-movements.js. Central de movimentações, revisão e procedência.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const ctx = {
  console, module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/movements.js"]
  .forEach((file) => vm.runInContext(readSrc(file), ctx, { filename: file }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, condition, extra) {
  if (condition) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${extra}`}`); }
}

console.log("\n1. Origem e histórico");
ctx.__legacy = { version: 20, transactions: [{ id:"old", type:"expense", amount:10, date:"2026-08-01", categoryId:"outros", source:"import-ofx", description:"Padaria" }] };
ctx.__migrated = run("migrate(__legacy)");
check("migração deriva a origem do source", ctx.__migrated.transactions[0].origin.label === "Extrato OFX", JSON.stringify(ctx.__migrated.transactions[0].origin));
check("migração cria a entrada inicial do histórico", ctx.__migrated.transactions[0].changeLog.length === 1 && ctx.__migrated.transactions[0].changeLog[0].action === "created");
ctx.__edited = run("updateTransaction(__migrated.transactions[0], { amount: 12, categoryId: 'alimentacao' })");
check("edição registra somente os campos alterados", JSON.stringify(ctx.__edited.changeLog.at(-1).fields.sort()) === JSON.stringify(["amount", "categoryId"]));
ctx.__reviewed = run("markTransactionIssueReviewed(__edited, 'category:old')");
check("decisão da revisão fica registrada", ctx.__reviewed.reviewedIssues.includes("category:old") && ctx.__reviewed.changeLog.at(-1).action === "reviewed");
ctx.__other = run("updateTransaction(__migrated.transactions[0], { description: 'Padaria nova' })");
ctx.__mergedAudit = run("mergeBackupInto({ ...defaultData(), transactions:[__reviewed] }, { ...defaultData(), transactions:[__other] }).data.transactions[0]");
check("mesclagem preserva alterações dos dois lados", ctx.__mergedAudit.changeLog.some((entry) => entry.fields.includes("amount")) && ctx.__mergedAudit.changeLog.some((entry) => entry.fields.includes("description")) && ctx.__mergedAudit.reviewedIssues.includes("category:old"));

console.log("\n2. Consulta e totais");
ctx.__data = run(`migrate({ version:21,
  accounts:[{id:'a1',name:'Principal',openingBalance:0,openingDate:'2026-01-01',reconciledAt:'2026-08-12'},{id:'a2',name:'Reserva',openingBalance:0,openingDate:'2026-01-01',reconciledAt:'2026-08-12'}],
  creditCards:[{id:'c1',name:'Azul',accountId:'a1',limit:1000,closingDay:20,dueDay:28}],
  transactions:[
    {id:'i1',type:'income',amount:1000,date:'2026-08-01',categoryId:'outros',description:'Salário',source:'manual',accountId:'a1'},
    {id:'e1',type:'expense',amount:200,date:'2026-08-02',categoryId:'alimentacao',description:'Mercado',source:'import-ofx',accountId:'a1'}
  ],
  accountTransfers:[{id:'tr1',fromAccountId:'a1',toAccountId:'a2',amount:100,date:'2026-08-03'}],
  cardPayments:[{id:'p1',accountId:'a1',creditCardId:'c1',amount:80,date:'2026-08-04',statementKey:'2026-08'}]
})`);
ctx.__model = run("buildMovementCenterModel(__data, { period:'all', search:'', type:'all', categoryId:'', accountId:'', source:'' })");
check("lista inclui lançamentos e movimentos internos", ctx.__model.count === 4, ctx.__model.count);
check("transferência e fatura não duplicam entradas ou saídas", ctx.__model.income === 1000 && ctx.__model.expense === 200 && ctx.__model.balance === 800, JSON.stringify(ctx.__model));
ctx.__search = run("buildMovementCenterModel(__data, { period:'all', search:'extrato ofx', type:'all', categoryId:'', accountId:'', source:'' })");
check("busca encontra pelo rótulo de origem", ctx.__search.count === 1 && ctx.__search.entries[0].id === "e1");
ctx.__destination = run("buildMovementCenterModel(__data, { period:'all', search:'', type:'transfer', categoryId:'', accountId:'a2', source:'' })");
check("filtro de conta encontra a transferência pelo destino", ctx.__destination.count === 1 && ctx.__destination.entries[0].kind === "transfer");

console.log("\n3. Caixa de revisão");
ctx.__reviewData = run(`migrate({ version:21,
  accounts:[{id:'a1',name:'Principal',openingBalance:0,openingDate:'2026-01-01',reconciledAt:'2026-08-12'},{id:'a2',name:'Reserva',openingBalance:0,openingDate:'2026-01-01',reconciledAt:'2026-08-12'}],
  creditCards:[{id:'c1',name:'Azul',accountId:'a1',limit:1000,closingDay:20,dueDay:28}],
  transactions:[
    {id:'cat',type:'expense',amount:20,date:'2026-08-01',categoryId:'outros',description:'Loja X',source:'import-csv',accountId:'a1'},
    {id:'dup1',type:'expense',amount:50,date:'2026-08-02',categoryId:'alimentacao',description:'Mercado Y',source:'manual',accountId:'a1',createdAt:'2026-08-02T10:00:00Z'},
    {id:'dup2',type:'expense',amount:50,date:'2026-08-02',categoryId:'alimentacao',description:'Mercado Y',source:'import-ofx',accountId:'a1',createdAt:'2026-08-02T11:00:00Z'},
    {id:'out',type:'expense',amount:100,date:'2026-08-03',categoryId:'outros',description:'Pix transferência enviada',source:'import-ofx',accountId:'a1'},
    {id:'in',type:'income',amount:100,date:'2026-08-03',categoryId:'outros',description:'Pix transferência recebida',source:'import-ofx',accountId:'a2'},
    {id:'bill',type:'expense',amount:300,date:'2026-08-04',categoryId:'outros',description:'Pagamento fatura cartão',source:'import-ofx',accountId:'a1'}
  ]
})`);
ctx.__review = run("buildTransactionReviewModel(__reviewData)");
check("detecta categoria, duplicidade, transferência e fatura", ["category", "duplicate", "transfer", "card-payment"].every((type) => ctx.__review.issues.some((issue) => issue.type === type)), JSON.stringify(ctx.__review.counts));
const duplicate = ctx.__review.issues.find((issue) => issue.type === "duplicate");
ctx.__reviewData.transactions = ctx.__reviewData.transactions.map((tx) => tx.id === duplicate.txId ? run("markTransactionIssueReviewed(__reviewData.transactions.find(t => t.id === '" + duplicate.txId + "'), '" + duplicate.key + "')") : tx);
ctx.__reviewAfter = run("buildTransactionReviewModel(__reviewData)");
check("sugestão revisada não reaparece", !ctx.__reviewAfter.issues.some((issue) => issue.key === duplicate.key));

// FATURA IMPORTADA ANTES DE O IMPORTADOR APRENDER A LER FATURA.
//
// "Pagamento recebido" é o crédito que quita a fatura do mês anterior. Quem
// importou o arquivo do cartão ficou com uma RECEITA que nunca existiu, e o
// mês fecha sobrando um dinheiro que na verdade saiu da conta. O importador já
// não deixa mais entrar; a caixa de revisão existe para limpar o que entrou.
ctx.__faturaData = run(`migrate({ version:21,
  accounts:[{id:'a1',name:'Principal',openingBalance:0,openingDate:'2026-01-01',reconciledAt:'2026-08-12'}],
  transactions:[
    {id:'pg1',type:'income',amount:1771.44,date:'2026-08-24',categoryId:'outros',description:'Pagamento recebido',source:'import-csv',accountId:'a1'},
    {id:'sal',type:'income',amount:3200,date:'2026-08-05',categoryId:'outros',description:'Salário',source:'import-csv',accountId:'a1'},
    {id:'man',type:'income',amount:50,date:'2026-08-06',categoryId:'outros',description:'Pagamento recebido',source:'manual',accountId:'a1'}
  ]
})`);
ctx.__fatura = run("buildTransactionReviewModel(__faturaData)");
const faturaIssues = ctx.__fatura.issues.filter((issue) => issue.type === "invoice-income");
check("pagamento de fatura importado como receita é apontado", faturaIssues.length === 1 && faturaIssues[0].txId === "pg1", JSON.stringify(ctx.__fatura.counts));
check("receita comum não é apontada", !ctx.__fatura.issues.some((issue) => issue.txId === "sal"));
// Lançamento digitado à mão é decisão da pessoa: o app não a corrige.
check("receita lançada à mão não é apontada", !faturaIssues.some((issue) => issue.txId === "man"));
check("a pendência aparece antes das outras", ctx.__fatura.issues[0].type === "invoice-income");
ctx.__faturaData.transactions = ctx.__faturaData.transactions.map((tx) => (tx.id === "pg1"
  ? run(`markTransactionIssueReviewed(__faturaData.transactions.find((t) => t.id === "pg1"), "${faturaIssues[0].key}")`)
  : tx));
check("marcar como revisada silencia a pendência",
  !run("buildTransactionReviewModel(__faturaData)").issues.some((issue) => issue.type === "invoice-income"));

console.log("\n4. Conciliação sem diferença");
ctx.__reconciled = run("reconcileAccount(__data, 'a1', accountBalance(__data, 'a1', '2026-08-12'), '2026-08-12')");
check("conferência exata grava a data sem criar ajuste", ctx.__reconciled.adjustment === null && ctx.__reconciled.data.accounts.find((a) => a.id === "a1").reconciledAt === "2026-08-12");

console.log(`\nResultado: ${pass} passou, ${fail} falhou.`);
if (fail) process.exit(1);
