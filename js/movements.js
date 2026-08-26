// js/movements.js. Modelo de leitura da central de movimentações e da caixa de revisão.
"use strict";

const MOVEMENT_SOURCE_META = Object.freeze({
  manual: { label: "Manual", icon: "pencil" },
  "import-ofx": { label: "Extrato OFX", icon: "upload" },
  "import-csv": { label: "Extrato CSV", icon: "upload" },
  nlp: { label: "Lançamento inteligente", icon: "sparkles" },
  "goal-upfront": { label: "Meta", icon: "target" },
  "qrcode-pix": { label: "QR Pix", icon: "scan" },
  "qrcode-nfce": { label: "QR nota fiscal", icon: "scan" },
  transfer: { label: "Transferência", icon: "arrowRight" },
  "card-payment": { label: "Pagamento de fatura", icon: "creditCard" },
});

function movementSourceMeta(source, origin) {
  const base = MOVEMENT_SOURCE_META[source] || { label: "Outra origem", icon: "file" };
  return { ...base, label: origin && origin.label ? origin.label : base.label };
}

function movementEntries(data) {
  const tx = (data.transactions || []).map((t) => {
    const category = categoryById(data, t.categoryId);
    const account = accountById(data, t.accountId);
    const card = creditCardById(data, t.creditCardId);
    return {
      id: t.id, kind: "transaction", type: t.type, amount: t.amount, date: t.date,
      description: t.description || (t.type === "income" ? "Receita" : category.name),
      categoryId: t.categoryId, categoryName: category.name,
      accountId: t.accountId || "", accountName: account ? account.name : "",
      creditCardId: t.creditCardId || "", cardName: card ? card.name : "",
      relatedAccountIds: [t.accountId, t.creditCardId].filter(Boolean),
      payment: t.payment, source: t.source || "manual", origin: t.origin,
      createdAt: t.createdAt, updatedAt: t.updatedAt, changeLog: t.changeLog || [], transaction: t,
    };
  });
  const transfers = (data.accountTransfers || []).map((t) => {
    const from = accountById(data, t.fromAccountId);
    const to = accountById(data, t.toAccountId);
    return {
      id: `transfer:${t.id}`, rawId: t.id, kind: "transfer", type: "transfer", amount: t.amount, date: t.date,
      description: t.description || "Transferência", categoryId: "", categoryName: "Transferência",
      accountId: t.fromAccountId, accountName: `${from ? from.name : "Conta"} para ${to ? to.name : "Conta"}`,
      creditCardId: "", cardName: "", payment: "Transferência", source: "transfer", origin: t.origin,
      relatedAccountIds: [t.fromAccountId, t.toAccountId],
      createdAt: t.createdAt, updatedAt: t.updatedAt, changeLog: t.changeLog || [], transaction: null,
    };
  });
  const payments = (data.cardPayments || []).map((p) => {
    const account = accountById(data, p.accountId);
    const card = creditCardById(data, p.creditCardId);
    return {
      id: `card-payment:${p.id}`, rawId: p.id, kind: "card-payment", type: "card-payment", amount: p.amount, date: p.date,
      description: `Pagamento da fatura ${card ? card.name : "do cartão"}`, categoryId: "", categoryName: "Fatura",
      accountId: p.accountId, accountName: account ? account.name : "", creditCardId: p.creditCardId,
      relatedAccountIds: [p.accountId, p.creditCardId],
      cardName: card ? card.name : "", payment: "Pagamento de fatura", source: "card-payment", origin: p.origin,
      createdAt: p.createdAt, updatedAt: p.updatedAt, changeLog: p.changeLog || [], transaction: null,
    };
  });
  return [...tx, ...transfers, ...payments];
}

function movementPeriodMatch(date, filters) {
  const now = new Date();
  const period = filters.period || "mes";
  if (period === "semana") { const diff = daysBetweenIso(date, todayIso()); return diff >= 0 && diff <= 7; }
  if (period === "mes") return monthKeyOf(date) === keyOfDate(now);
  if (period === "ano") return String(date).slice(0, 4) === String(now.getFullYear());
  if (period === "custom") return date >= filters.start && date <= filters.end;
  return true;
}

function buildMovementCenterModel(data, filters) {
  const query = normalizeText(filters.search);
  const entries = movementEntries(data).filter((entry) => {
    if (!movementPeriodMatch(entry.date, filters)) return false;
    if (filters.type && filters.type !== "all" && entry.type !== filters.type) return false;
    if (filters.categoryId && entry.categoryId !== filters.categoryId) return false;
    if (filters.accountId && !(entry.relatedAccountIds || []).includes(filters.accountId)) return false;
    if (filters.source && entry.source !== filters.source) return false;
    if (!query) return true;
    const source = movementSourceMeta(entry.source, entry.origin).label;
    const cents = String(moneyToCents(entry.amount));
    const haystack = normalizeText([entry.description, entry.categoryName, entry.accountName, entry.cardName, entry.payment, source, fmtBRL(entry.amount), fmtMoneySearch(entry.amount), cents].join(" "));
    return haystack.includes(query);
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const groups = [];
  entries.forEach((entry) => {
    let group = groups[groups.length - 1];
    if (!group || group.date !== entry.date) { group = { date: entry.date, entries: [] }; groups.push(group); }
    group.entries.push(entry);
  });
  const transactions = entries.filter((entry) => entry.kind === "transaction");
  return {
    entries, groups,
    income: sumMoney(transactions.filter((entry) => entry.type === "income"), (entry) => entry.amount),
    expense: sumMoney(transactions.filter((entry) => entry.type === "expense"), (entry) => entry.amount),
    balance: subMoney(sumMoney(transactions.filter((entry) => entry.type === "income"), (entry) => entry.amount), sumMoney(transactions.filter((entry) => entry.type === "expense"), (entry) => entry.amount)),
    count: entries.length,
  };
}

function fmtMoneySearch(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function transactionReviewIgnored(transaction, key) {
  return normalizeReviewedIssues(transaction.reviewedIssues).includes(key);
}

function reviewDescriptionKey(value) {
  return normalizeText(value).replace(/[^a-z0-9 ]/g, "").replace(/\b(transferencia|pix|ted|doc|pagamento|recebido|enviado)\b/g, "").replace(/\s+/g, " ").trim();
}

function buildTransactionReviewModel(data) {
  const txs = [...(data.transactions || [])].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const issues = [];
  txs.forEach((t) => {
    if (t.type === "expense" && t.categoryId === "outros" && t.source !== "manual") {
      const key = `category:${t.id}`;
      if (!transactionReviewIgnored(t, key)) issues.push({ key, type: "category", txId: t.id, txIds: [t.id], title: "Categoria precisa de revisão", detail: `${t.description || "Lançamento"} está em Outros.`, date: t.date, amount: t.amount });
    }
  });

  const duplicateBySignature = new Map();
  txs.forEach((transaction) => {
    const description = reviewDescriptionKey(transaction.description);
    const signature = `${transaction.date}|${transaction.type}|${moneyToCents(transaction.amount)}|${description}`;
    const previous = description ? duplicateBySignature.get(signature) : null;
    if (previous && !(transaction.installmentGroupId && transaction.installmentGroupId === previous.installmentGroupId)) {
        const ids = [previous.id, transaction.id].sort();
        const key = `duplicate:${ids.join(":")}`;
        const primary = String(previous.createdAt || "") > String(transaction.createdAt || "") ? previous : transaction;
        if (!transactionReviewIgnored(primary, key)) issues.push({ key, type: "duplicate", txId: primary.id, txIds: ids, title: "Possível duplicidade", detail: `${previous.description || "Lançamentos"} aparece duas vezes no mesmo dia.`, date: primary.date, amount: primary.amount });
    } else if (!previous) duplicateBySignature.set(signature, transaction);
  });

  const transferBuckets = new Map();
  const pairedTransferIds = new Set();
  txs.forEach((transaction) => {
    const text = normalizeText(transaction.description);
    const hinted = /\b(pix|ted|doc|transf)/.test(text);
    const imported = transaction.source.startsWith("import-");
    if ((!hinted && !imported) || !transaction.accountId || transaction.goalId || transaction.debtId || transaction.installmentGroupId || transaction.creditCardId) return;
    const oppositeKey = `${transaction.type === "expense" ? "income" : "expense"}|${moneyToCents(transaction.amount)}`;
    const oppositeAccounts = transferBuckets.get(oppositeKey);
    let match = null;
    if (oppositeAccounts) {
      for (const [accountId, candidates] of oppositeAccounts.entries()) {
        while (candidates.length && daysBetweenIso(candidates[0].date, transaction.date) > 2) candidates.shift();
        if (accountId === transaction.accountId || !candidates.length) continue;
        const candidate = candidates[candidates.length - 1];
        const pairImported = imported || candidate.source.startsWith("import-");
        const pairHinted = hinted || /\b(pix|ted|doc|transf)/.test(normalizeText(candidate.description));
        if (pairImported && pairHinted) { match = candidate; candidates.pop(); break; }
      }
    }
    if (match) {
      const expense = transaction.type === "expense" ? transaction : match;
      const income = transaction.type === "income" ? transaction : match;
      const ids = [expense.id, income.id].sort();
      if (!pairedTransferIds.has(expense.id) && !pairedTransferIds.has(income.id)) {
        const key = `transfer:${ids.join(":")}`;
        if (!transactionReviewIgnored(expense, key)) issues.push({ key, type: "transfer", txId: expense.id, txIds: ids, expenseId: expense.id, incomeId: income.id, title: "Possível transferência entre contas", detail: "A saída e a entrada têm o mesmo valor em contas diferentes.", date: expense.date, amount: expense.amount });
        pairedTransferIds.add(expense.id); pairedTransferIds.add(income.id);
      }
      return;
    }
    const ownKey = `${transaction.type}|${moneyToCents(transaction.amount)}`;
    if (!transferBuckets.has(ownKey)) transferBuckets.set(ownKey, new Map());
    const ownAccounts = transferBuckets.get(ownKey);
    if (!ownAccounts.has(transaction.accountId)) ownAccounts.set(transaction.accountId, []);
    ownAccounts.get(transaction.accountId).push(transaction);
  });

  // PAGAMENTO DE FATURA QUE ENTROU COMO RECEITA.
  //
  // Na fatura do cartão, o pagamento do mês anterior é um CRÉDITO com a
  // descrição "Pagamento recebido". Quem importou a fatura antes de o
  // importador aprender a reconhecer essa linha ficou com uma receita que
  // nunca existiu: o mês fecha sobrando dinheiro que na verdade saiu da conta
  // para quitar a dívida. O importador já não deixa mais isso entrar; aqui a
  // caixa de revisão limpa o que entrou antes.
  txs.forEach((t) => {
    const key = `invoice-income:${t.id}`;
    if (t.type !== "income") return;
    if (!String(t.source || "").startsWith("import-")) return;
    if (!classifyStatementRow(t.description, "income")) return;
    if (transactionReviewIgnored(t, key)) return;
    issues.push({
      key, type: "invoice-income", txId: t.id, txIds: [t.id],
      title: "Pagamento de fatura contado como receita",
      detail: "Essa linha da fatura é a dívida do mês passado sendo paga, não dinheiro que entrou.",
      date: t.date, amount: t.amount,
    });
  });

  txs.forEach((t) => {
    const key = `card-payment:${t.id}`;
    if (t.type === "expense" && t.source.startsWith("import-") && !t.goalId && !t.debtId && !t.installmentGroupId && !t.creditCardId && /\b(pagamento|pagto)\b.*\b(fatura|cartao)\b|\b(fatura|cartao)\b.*\b(pagamento|pagto)\b/.test(normalizeText(t.description)) && !transactionReviewIgnored(t, key)) {
      issues.push({ key, type: "card-payment", txId: t.id, txIds: [t.id], title: "Possível pagamento de fatura", detail: "Converter evita tratar o pagamento como uma nova despesa.", date: t.date, amount: t.amount });
    }
  });

  (data.accounts || []).filter((account) => !account.archived).forEach((account) => {
    const last = account.reconciledAt || null;
    const overdue = !last || daysBetweenIso(last, todayIso()) > 30;
    if (overdue) issues.push({ key: `account:${account.id}`, type: "account", accountId: account.id, txIds: [], title: "Saldo da conta precisa ser conferido", detail: last ? `${account.name} não é conferida há mais de 30 dias.` : `${account.name} ainda não foi conferida.`, date: last || account.openingDate, amount: accountBalance(data, account.id, todayIso()) });
  });

  const rank = { "invoice-income": 1, duplicate: 2, transfer: 3, "card-payment": 4, category: 5, account: 6 };
  issues.sort((a, b) => (rank[a.type] || 9) - (rank[b.type] || 9) || b.date.localeCompare(a.date));
  return {
    issues,
    counts: issues.reduce((out, issue) => ({ ...out, [issue.type]: (out[issue.type] || 0) + 1 }), {}),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { movementSourceMeta, movementEntries, buildMovementCenterModel, buildTransactionReviewModel, reviewDescriptionKey };
}
