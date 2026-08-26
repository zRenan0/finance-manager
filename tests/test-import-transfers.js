// test-import-transfers.js. Pix entre contas próprias na importação e edição.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const readSrc = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ctx = {
  console, module: { exports: {} }, URL, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob,
  crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB: undefined, localStorage: undefined,
  navigator: { userAgent: "node", language: "pt-BR", onLine: true },
  document: { addEventListener() {}, visibilityState: "visible", baseURI: "http://localhost/" },
  addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/icons.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/movements.js", "js/budgets.js", "js/import.js", "js/screens/_shared.js", "js/screens/add.js", "js/screens/import.js", "js/actions.js"]
  .forEach((file) => vm.runInContext(readSrc(file), ctx, { filename: file }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`); }
}
function section(label) { console.log(`\n${label}`); }

section("1. Construção e efeito financeiro");
ctx.__data = run(`migrate({ version:22,
  accounts:[
    {id:'a1',name:'Principal',openingBalance:1000,openingDate:'2026-01-01'},
    {id:'a2',name:'Reserva',openingBalance:500,openingDate:'2026-01-01'}
  ],
  transactions:[], accountTransfers:[]
})`);
ctx.__sent = [{
  date:"2026-08-20", amount:120, description:"PIX ENVIADO RENAN",
  type:"expense", include:true, importAs:"transfer", otherAccountId:"a2",
}];
ctx.__sentRecords = run("buildImportRecordsFromRows(__sent, 'ofx', { documentKind:'account', destinationId:'a1' }, 'principal.ofx', __data.accounts)");
check("Pix enviado cria uma transferência e nenhum lançamento",
  ctx.__sentRecords.accountTransfers.length === 1 && ctx.__sentRecords.transactions.length === 0,
  ctx.__sentRecords);
check("a conta do extrato vira origem na saída",
  ctx.__sentRecords.accountTransfers[0].fromAccountId === "a1" && ctx.__sentRecords.accountTransfers[0].toAccountId === "a2",
  ctx.__sentRecords.accountTransfers[0]);

ctx.__withSent = run("({ ...__data, accountTransfers:__sentRecords.accountTransfers })");
check("o valor sai da origem e entra no destino",
  run("accountBalance(__withSent, 'a1', '2026-08-31')") === 880
    && run("accountBalance(__withSent, 'a2', '2026-08-31')") === 620,
  [run("accountBalance(__withSent, 'a1', '2026-08-31')"), run("accountBalance(__withSent, 'a2', '2026-08-31')")]);
ctx.__totals = run("realizedMonthTotals(__withSent, '2026-08', '2026-08-31')");
check("transferência não entra como gasto nem renda",
  ctx.__totals.expense === 0 && ctx.__totals.income === 0,
  ctx.__totals);

ctx.__received = [{
  date:"2026-08-21", amount:75, description:"PIX RECEBIDO RENAN",
  type:"income", include:true, importAs:"transfer", otherAccountId:"a1",
}];
ctx.__receivedRecords = run("buildImportRecordsFromRows(__received, 'csv', { documentKind:'account', destinationId:'a2' }, 'reserva.csv', __data.accounts)");
check("a conta do extrato vira destino na entrada",
  ctx.__receivedRecords.accountTransfers[0].fromAccountId === "a1"
    && ctx.__receivedRecords.accountTransfers[0].toAccountId === "a2",
  ctx.__receivedRecords.accountTransfers[0]);
check("a referência do arquivo é preservada",
  ctx.__receivedRecords.accountTransfers[0].origin.reference === "reserva.csv",
  ctx.__receivedRecords.accountTransfers[0].origin);

section("2. Linhas comuns continuam iguais");
ctx.__ordinary = [{
  date:"2026-08-22", amount:30, description:"PADARIA", type:"expense",
  include:true, importAs:"transaction", categoryId:"alimentacao",
}];
ctx.__ordinaryRecords = run("buildImportRecordsFromRows(__ordinary, 'csv', { documentKind:'account', destinationId:'a1' }, 'extrato.csv', __data.accounts)");
check("lançamento comum não vira transferência",
  ctx.__ordinaryRecords.transactions.length === 1 && ctx.__ordinaryRecords.accountTransfers.length === 0,
  ctx.__ordinaryRecords);

section("3. Contraparte numa segunda importação");
ctx.__existing = run("__sentRecords.accountTransfers[0]");
ctx.__counterpart = {
  date:"2026-08-21", amount:120, description:"PIX RECEBIDO RENAN", type:"income",
  include:true, defaultInclude:true, importAs:"transaction",
};
ctx.__match = run("resolveRecordedAccountTransfer(__counterpart, 'a2', [__existing])");
check("a outra ponta encontra a transferência existente",
  ctx.__match.status === "unique" && ctx.__match.transfer.id === ctx.__existing.id,
  ctx.__match);

ctx.__matchedRows = run("applyRecordedTransferMatches([__counterpart], { accountTransfers:[__existing] }, 'a2')");
check("a contraparte vem desmarcada e explicada",
  ctx.__matchedRows[0].include === false
    && ctx.__matchedRows[0].recordedTransferId === ctx.__existing.id
    && ctx.__matchedRows[0].recordedTransferStatus === "unique",
  ctx.__matchedRows[0]);

ctx.__existing2 = run("makeAccountTransfer({ fromAccountId:'a1', toAccountId:'a2', amount:120, date:'2026-08-20', description:'PIX ENVIADO RENAN' }, __data.accounts)");
ctx.__ambiguous = run("resolveRecordedAccountTransfer(__counterpart, 'a2', [__existing, __existing2])");
check("duas candidatas não são decididas automaticamente",
  ctx.__ambiguous.status === "ambiguous" && ctx.__ambiguous.matches.length === 2,
  ctx.__ambiguous);

section("4. Validação das contas");
ctx.__invalid = [{
  date:"2026-08-20", amount:50, description:"PIX ENVIADO", type:"expense",
  include:true, importAs:"transfer", otherAccountId:"a1",
}];
let invalidError = null;
try {
  run("buildImportRecordsFromRows(__invalid, 'ofx', { documentKind:'account', destinationId:'a1' }, 'x.ofx', __data.accounts)");
} catch (error) { invalidError = error; }
check("origem e destino iguais são recusados",
  invalidError && invalidError.code === "IMPORT_TRANSFER_ACCOUNT",
  invalidError && { code: invalidError.code, message: invalidError.message });

section("5. Conversão depois da importação");
ctx.__pairData = run(`migrate({ version:22,
  accounts:__data.accounts,
  transactions:[
    {id:'out',type:'expense',amount:90,date:'2026-08-23',categoryId:'outros',description:'PIX ENVIADO RENAN',source:'import-ofx',accountId:'a1',origin:{channel:'import-ofx',label:'Extrato OFX',reference:'principal.ofx'}},
    {id:'in',type:'income',amount:90,date:'2026-08-24',categoryId:'outros',description:'PIX RECEBIDO RENAN',source:'import-ofx',accountId:'a2',origin:{channel:'import-ofx',label:'Extrato OFX',reference:'reserva.ofx'}}
  ]
})`);
ctx.__converted = run("convertTransactionToAccountTransfer(__pairData, 'out', { fromAccountId:'a1', toAccountId:'a2' })");
check("duas pontas viram uma transferência",
  ctx.__converted.data.transactions.length === 0 && ctx.__converted.data.accountTransfers.length === 1,
  ctx.__converted);
check("a conversão preserva os dois identificadores removidos",
  JSON.stringify([...ctx.__converted.transfer.sourceTransactionIds].sort()) === JSON.stringify(["in", "out"]),
  ctx.__converted.transfer);
check("a conversão também deixa gasto e renda em zero",
  (() => {
    ctx.__convertedTotals = run("realizedMonthTotals(__converted.data, '2026-08', '2026-08-31')");
    return ctx.__convertedTotals.expense === 0 && ctx.__convertedTotals.income === 0;
  })(),
  ctx.__convertedTotals);

ctx.__singleData = run(`migrate({ version:22, accounts:__data.accounts, transactions:[
  {id:'only',type:'expense',amount:40,date:'2026-08-25',categoryId:'outros',description:'PIX ENVIADO',source:'import-csv',accountId:'a1'}
] })`);
ctx.__singleConverted = run("convertTransactionToAccountTransfer(__singleData, 'only', { fromAccountId:'a1', toAccountId:'a2' })");
check("uma ponta isolada também pode virar transferência real",
  ctx.__singleConverted.data.transactions.length === 0 && ctx.__singleConverted.data.accountTransfers.length === 1,
  ctx.__singleConverted);

section("6. Revisão visual");
ctx.__reviewRows = [{
  date:"2026-08-20", amount:120, description:"PIX ENVIADO RENAN", type:"expense",
  include:true, defaultInclude:true, importAs:"transfer", otherAccountId:"a2", categoryId:"outros",
}];
ctx.__reviewRows.meta = { format:"ofx", documentKind:"account", skipped:0, roles:{} };
ctx.state = {
  data: ctx.__data,
  importRows: ctx.__reviewRows,
  importDocumentKind:"account",
  importDestinationId:"a1",
};
ctx.__reviewHtml = run("renderImportReview(__reviewRows)");
check("linha permite escolher como será importada",
  ctx.__reviewHtml.includes('data-action-select="import-record-type"'),
  ctx.__reviewHtml);
check("transferência mostra a escolha da outra conta",
  ctx.__reviewHtml.includes('data-action-select="import-transfer-account"')
    && ctx.__reviewHtml.includes('value="a2" selected'),
  ctx.__reviewHtml);
check("transferência não mostra seletor de categoria na mesma linha",
  !ctx.__reviewHtml.includes('data-action-select="import-category"'),
  ctx.__reviewHtml);
check("resumo separa transferência de entrada e saída",
  ctx.__reviewHtml.includes("em transferências") && !ctx.__reviewHtml.includes("em saídas"),
  ctx.__reviewHtml);

ctx.state = {
  data: ctx.__pairData,
  form: {
    type:"expense", amount:"90,00", categoryId:"outros", date:"2026-08-23", payment:"Débito",
    description:"PIX ENVIADO RENAN", recurring:false, installments:"1", source:"import-ofx",
    accountId:"a1", creditCardId:"", nature:"transferencia", transferFromAccountId:"a1",
    transferToAccountId:"a2", transferCounterpartId:"in",
  },
  editingTxId:"out", editingTxReturnTab:"analytics", natureFieldOpen:true,
};
ctx.__editHtml = run("renderAddScreen()");
check("editor de transferência mostra origem e destino",
  ctx.__editHtml.includes('data-action-select="tx-transfer-from"')
    && ctx.__editHtml.includes('data-action-select="tx-transfer-to"'),
  ctx.__editHtml);
check("editor não chama a conversão de gasto nem de renda",
  ctx.__editHtml.includes("Converter em transferência")
    && !ctx.__editHtml.includes('data-action="set-type"'),
  ctx.__editHtml);

console.log(`\nResultado: ${pass} passou, ${fail} falhou.`);
if (fail) process.exit(1);
