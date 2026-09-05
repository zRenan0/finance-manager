// test-performance.js — harness do M38 (Performance).
//
// O QUE ESTE ARQUIVO PROVA
//
// O M38 acelerou o aplicativo com três mudanças que trocam trabalho repetido por
// memória: índice por id nas contas e cartões, cache das faturas por lista, e o
// caminho rápido de `moneyToCents` (este último travado em `test-money.js`, com
// a comparação contra a implementação anterior em milhões de casos).
//
// Otimização que guarda resultado tem um risco só, e é sempre o mesmo: **servir
// resposta velha**. Este arquivo não mede tempo, porque tempo depende de máquina
// e um teste que falha por lentidão da máquina ensina a ignorar falha. Ele trava
// os CONTRATOS que tornam o atalho seguro:
//
//   1. o índice devolve exatamente o que o `find` linear devolvia;
//   2. trocar a lista faz o índice trocar junto;
//   3. a fatura devolve objetos novos a cada chamada, então quem alterar o
//      resultado não corrompe a cache;
//   4. a data-limite faz parte da chave, e a data-limite ausente é resolvida
//      ANTES da chave (senão a virada do dia serviria o resultado de ontem).
//
// Ferramenta de dev: `node tests/test-performance.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, navigator: { onLine: true } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js",
  "js/score.js", "js/metrics.js", "js/goals.js", "js/accounts.js", "js/perf.js"]
  .forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}

const hoje = ctx.todayIso();
const conta = (id, extra) => ({
  id, name: `Conta ${id}`, type: "corrente", openingBalance: 100, openingDate: "2024-01-01",
  color: "#112233", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", ...extra,
});
const cartao = (id, extra) => ({
  id, name: `Cartão ${id}`, accountId: "acc1", limit: 2000, closingDay: 5, dueDay: 12,
  color: "#445566", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", ...extra,
});

/* ------------------------------------------------- 1. índice por id */
console.log("\n1. Índice por id devolve o que o find devolvia");
{
  const data = ctx.migrate({
    ...ctx.defaultData(),
    accounts: [conta("acc1"), conta("acc2"), conta("acc3")],
    creditCards: [cartao("card1"), cartao("card2")],
  });

  const linear = (lista, id) => lista.find((x) => x.id === id) || null;
  ["acc1", "acc2", "acc3", "inexistente", "", null, undefined].forEach((id) => {
    check(`conta ${JSON.stringify(id)} igual ao find linear`,
      ctx.accountById(data, id) === linear(data.accounts, id));
  });
  ["card1", "card2", "nao-existe"].forEach((id) => {
    check(`cartão ${JSON.stringify(id)} igual ao find linear`,
      ctx.creditCardById(data, id) === linear(data.creditCards, id));
  });
  check("devolve a MESMA referência, não uma cópia", ctx.accountById(data, "acc1") === data.accounts[0]);
  check("id desconhecido devolve null, não undefined", ctx.accountById(data, "xxx") === null);
  check("snapshot sem contas não quebra", ctx.accountById({}, "acc1") === null && ctx.creditCardById({}, "c") === null);
  check("snapshot nulo não quebra", ctx.accountById(null, "acc1") === null);

  // Duplicidade não acontece depois do `sanitize`, mas a regra do `find` é
  // devolver a PRIMEIRA ocorrência, e o índice precisa concordar com ela.
  const duplicado = { accounts: [conta("dup", { name: "primeira" }), conta("dup", { name: "segunda" })] };
  check("com id repetido, vence o primeiro (como no find)",
    ctx.accountById(duplicado, "dup").name === "primeira", ctx.accountById(duplicado, "dup").name);
}

/* --------------------------------------- 2. troca de lista invalida */
console.log("\n2. Trocar a lista troca o índice");
{
  const data = ctx.migrate({ ...ctx.defaultData(), accounts: [conta("acc1"), conta("acc2")] });
  check("estado inicial encontra as duas", !!ctx.accountById(data, "acc1") && !!ctx.accountById(data, "acc2"));

  const semSegunda = { ...data, accounts: data.accounts.filter((a) => a.id !== "acc2") };
  check("conta removida some do snapshot novo", ctx.accountById(semSegunda, "acc2") === null);
  check("o snapshot antigo continua respondendo o que sempre respondeu", !!ctx.accountById(data, "acc2"));

  const renomeada = { ...data, accounts: [{ ...data.accounts[0], name: "Novo nome" }, data.accounts[1]] };
  check("lista nova enxerga o valor novo", ctx.accountById(renomeada, "acc1").name === "Novo nome");
  check("lista antiga enxerga o valor antigo", ctx.accountById(data, "acc1").name === "Conta acc1");

  const acrescentada = { ...data, accounts: [...data.accounts, conta("acc9")] };
  check("conta acrescentada aparece", ctx.accountById(acrescentada, "acc9") !== null);
  check("e não vaza para o snapshot anterior", ctx.accountById(data, "acc9") === null);
}

/* --------------------------------------------- 3. cache das faturas */
console.log("\n3. Cache das faturas: mesmo resultado, objetos novos");
{
  const tx = (id, dia, valor, cardId) => ctx.makeTransaction({
    id, type: "expense", amount: valor, categoryId: "mercado",
    date: dia, payment: "Crédito", description: `Compra ${id}`, accountId: "acc1", creditCardId: cardId,
  });
  const data = ctx.migrate({
    ...ctx.defaultData(),
    accounts: [conta("acc1")],
    creditCards: [cartao("card1"), cartao("card2", { closingDay: 20, dueDay: 28 })],
    transactions: [
      tx("t1", "2026-01-02", 100, "card1"),
      tx("t2", "2026-01-20", 50, "card1"),
      tx("t3", "2026-02-03", 30, "card1"),
      tx("t4", "2026-01-15", 70, "card2"),
    ],
  });

  const a = ctx.cardStatements(data, "card1");
  const b = ctx.cardStatements(data, "card1");
  check("duas chamadas devolvem o mesmo conteúdo", JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));
  check("mas não o mesmo array", a !== b);
  check("nem os mesmos objetos de linha", a.length > 0 && a[0] !== b[0]);

  // Se a cache devolvesse a mesma referência, esta alteração contaminaria a
  // próxima leitura de qualquer tela do aplicativo.
  a[0].purchases = 999999;
  a.push({ key: "invasor" });
  const c = ctx.cardStatements(data, "card1");
  check("alterar o resultado não contamina a próxima chamada",
    JSON.stringify(c) === JSON.stringify(b), JSON.stringify(c));

  check("cartões diferentes não compartilham resultado",
    JSON.stringify(ctx.cardStatements(data, "card1")) !== JSON.stringify(ctx.cardStatements(data, "card2")));
  check("cartão inexistente devolve lista vazia", ctx.cardStatements(data, "nao-existe").length === 0);

  const menos = { ...data, transactions: data.transactions.filter((t) => t.id !== "t2") };
  check("trocar a lista de lançamentos recalcula",
    JSON.stringify(ctx.cardStatements(menos, "card1")) !== JSON.stringify(ctx.cardStatements(data, "card1")));

  const pagamento = {
    id: "cp1", creditCardId: "card1", accountId: "acc1", amount: 150, date: "2026-02-12",
    statementKey: "2026-02", createdAt: "2026-02-12T00:00:00.000Z", updatedAt: "2026-02-12T00:00:00.000Z",
  };
  const comPagamento = ctx.migrate({ ...data, cardPayments: [pagamento] });
  check("trocar a lista de pagamentos recalcula",
    JSON.stringify(ctx.cardStatements(comPagamento, "card1")) !== JSON.stringify(ctx.cardStatements(data, "card1")));
}

/* ------------------------------------ 4. a data-limite entra na chave */
console.log("\n4. A data-limite faz parte da chave");
{
  const tx = (id, dia, valor) => ctx.makeTransaction({
    id, type: "expense", amount: valor, categoryId: "mercado",
    date: dia, payment: "Crédito", description: `Compra ${id}`, accountId: "acc1", creditCardId: "card1",
  });
  const data = ctx.migrate({
    ...ctx.defaultData(),
    accounts: [conta("acc1")],
    creditCards: [cartao("card1")],
    transactions: [tx("t1", "2026-01-02", 100), tx("t2", "2026-03-02", 500)],
  });

  const ate = (d) => ctx.cardLiabilityStatements(data, "card1", d);
  const janeiro = ate("2026-01-31");
  const marco = ate("2026-03-31");
  check("limite anterior reconhece menos passivo",
    ctx.sumMoney(janeiro, (s) => s.purchases) < ctx.sumMoney(marco, (s) => s.purchases),
    `${ctx.sumMoney(janeiro, (s) => s.purchases)} vs ${ctx.sumMoney(marco, (s) => s.purchases)}`);
  check("o mesmo limite repete o mesmo resultado", JSON.stringify(ate("2026-01-31")) === JSON.stringify(janeiro));
  check("um limite não contamina o outro", JSON.stringify(ate("2026-03-31")) === JSON.stringify(marco));

  // `asOf` ausente vale "hoje". Como a chave é montada DEPOIS de resolver o
  // padrão, a resposta de hoje nunca é a que ficou guardada ontem.
  check("sem data-limite equivale a hoje",
    JSON.stringify(ctx.cardLiabilityStatements(data, "card1")) === JSON.stringify(ate(hoje)));
  check("o resultado sem data também vem em objetos novos",
    ctx.cardLiabilityStatements(data, "card1") !== ctx.cardLiabilityStatements(data, "card1"));
}

/* ------------------------------- 5. a fonte declara o que fez e por quê */
console.log("\n5. A decisão está escrita onde ela mora");
{
  const contas = read("js/accounts.js");
  const utils = read("js/utils.js");
  check("o índice explica por que é indexado pelo ARRAY, não pelo snapshot",
    /IDENTIDADE DO ARRAY/.test(contas) && /reatribui `data\.accounts`/.test(contas));
  check("o índice avisa que mutação no lugar quebraria a premissa",
    /MUTAR a lista no lugar/.test(contas));
  check("a cache das faturas explica a resolução do limite antes da chave",
    /limite JÁ RESOLVIDO/.test(contas));
  check("a cache das faturas explica por que devolve cópia",
    /objetos NOVOS a cada chamada/.test(contas));
  check("o caminho rápido do dinheiro aponta o teto e o motivo",
    /MONEY_FAST_MAX/.test(utils) && /borda de meio centavo/.test(utils));
  check("o caminho rápido aponta onde a equivalência é medida",
    /tests\/test-money\.js/.test(utils));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
