// accounts.js; contas, cartões, transferências, faturas e conciliação
"use strict";

const ACCOUNT_TYPE_LABELS = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro",
  digital: "Conta digital",
  outro: "Outra conta",
};

function accountById(data, id) {
  return (data.accounts || []).find((a) => a.id === id) || null;
}

function creditCardById(data, id) {
  return (data.creditCards || []).find((c) => c.id === id) || null;
}

function transactionAffectsCash(data, transaction, asOf) {
  const t = transaction || {};
  const limit = asOf || "9999-12-31";
  if (t.creditCardId || t.date > limit) return false;
  if (!t.accountId) return true;
  const account = accountById(data, t.accountId);
  return !!account && t.date >= account.openingDate;
}

function accountTransactionCents(data, account, asOf) {
  const limit = asOf || "9999-12-31";
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.accountId !== account.id || t.creditCardId || t.date > limit || t.date < account.openingDate) return;
    cents += t.type === "income" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return cents;
}

function accountBalance(data, accountId, asOf) {
  const account = accountById(data, accountId);
  if (!account) return 0;
  const limit = asOf || "9999-12-31";
  let cents = moneyToCents(account.openingBalance);
  cents += accountTransactionCents(data, account, limit);
  (data.accountTransfers || []).forEach((t) => {
    if (t.date > limit || t.date < account.openingDate) return;
    if (t.fromAccountId === account.id) cents -= moneyToCents(t.amount);
    if (t.toAccountId === account.id) cents += moneyToCents(t.amount);
  });
  (data.cardPayments || []).forEach((p) => {
    if (p.accountId === account.id && p.date <= limit && p.date >= account.openingDate) cents -= moneyToCents(p.amount);
  });
  (data.accountAdjustments || []).forEach((a) => {
    if (a.accountId === account.id && a.date <= limit && a.date >= account.openingDate) cents += moneyToCents(a.amount);
  });
  return moneyFromCents(cents);
}

function legacyCashBalance(data, asOf) {
  const limit = asOf || "9999-12-31";
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.accountId || t.creditCardId || t.date > limit) return;
    cents += t.type === "income" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(cents);
}

function accountsCashBalance(data, asOf) {
  let cents = moneyToCents(legacyCashBalance(data, asOf));
  (data.accounts || []).forEach((a) => { cents += moneyToCents(accountBalance(data, a.id, asOf)); });
  return moneyFromCents(cents);
}

function cardStatementKeyForDate(card, isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  let dueMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  // Quando o vencimento vem antes do fechamento no calendário, a fatura vence
  // no mês seguinte. Uma compra após o fechamento avança mais uma fatura.
  const monthOffset = (card.dueDay <= card.closingDay ? 1 : 0) + (d.getDate() > card.closingDay ? 1 : 0);
  if (monthOffset) dueMonth = addMonths(dueMonth, monthOffset);
  return keyOfDate(dueMonth);
}

function cardStatementDueDate(card, statementKey) {
  const parts = String(statementKey).split("-").map(Number);
  const last = new Date(parts[0], parts[1], 0).getDate();
  return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(Math.min(card.dueDay, last)).padStart(2, "0")}`;
}

function cardStatements(data, cardId) {
  const card = creditCardById(data, cardId);
  if (!card) return [];
  const map = new Map();
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, { key, purchases: 0, paid: 0, outstanding: 0, count: 0, dueDate: cardStatementDueDate(card, key) });
    return map.get(key);
  };
  (data.transactions || []).forEach((t) => {
    if (t.creditCardId !== cardId || t.type !== "expense") return;
    const row = ensure(cardStatementKeyForDate(card, t.date));
    row.purchases = addMoney(row.purchases, t.amount);
    row.count++;
  });
  (data.cardPayments || []).forEach((p) => {
    if (p.creditCardId !== cardId) return;
    const row = ensure(p.statementKey);
    row.paid = addMoney(row.paid, p.amount);
  });
  return Array.from(map.values()).map((r) => ({ ...r, outstanding: Math.max(0, subMoney(r.purchases, r.paid)) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Passivo reconhecido até uma data. Compras parceladas entram pelo valor total
// quando a primeira parcela começa; compras avulsas futuras só entram na data.
// Isso é diferente de `cardStatements`, que mostra todo o calendário cadastrado
// para a tela de contas e para a previsão de caixa.
function cardLiabilityStatements(data, cardId, asOf) {
  const card = creditCardById(data, cardId);
  if (!card) return [];
  const limit = asOf || todayIso();
  const groupStarts = new Map();

  (data.transactions || []).forEach((t) => {
    if (t.creditCardId !== cardId || t.type !== "expense" || !t.installmentGroupId) return;
    const current = groupStarts.get(t.installmentGroupId);
    if (!current || t.date < current) groupStarts.set(t.installmentGroupId, t.date);
  });

  const map = new Map();
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, {
      key, purchases: 0, paid: 0, outstanding: 0, count: 0,
      dueDate: cardStatementDueDate(card, key),
    });
    return map.get(key);
  };

  (data.transactions || []).forEach((t) => {
    if (t.creditCardId !== cardId || t.type !== "expense") return;
    const recognized = t.installmentGroupId
      ? groupStarts.get(t.installmentGroupId) <= limit
      : t.date <= limit;
    if (!recognized) return;
    const row = ensure(cardStatementKeyForDate(card, t.date));
    row.purchases = addMoney(row.purchases, t.amount);
    row.count++;
  });

  (data.cardPayments || []).forEach((p) => {
    if (p.creditCardId !== cardId || p.date > limit) return;
    const row = ensure(p.statementKey);
    row.paid = addMoney(row.paid, p.amount);
  });

  return Array.from(map.values())
    .map((row) => ({ ...row, outstanding: Math.max(0, subMoney(row.purchases, row.paid)) }))
    .filter((row) => row.purchases > 0 || row.outstanding > 0)
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

function cardLiabilitySummary(data, asOf, days) {
  const today = asOf || todayIso();
  const horizonDays = Math.max(0, Number(days) || 30);
  const limit = isoOfDate(new Date(dateFromIso(today).getTime() + horizonDays * 86400000));
  const cards = (data.creditCards || []).map((card) => {
    const statements = cardLiabilityStatements(data, card.id, today);
    const open = statements.filter((s) => s.outstanding > 0);
    return {
      ...card,
      statements,
      total: sumMoney(open, (s) => s.outstanding),
      overdue: sumMoney(open.filter((s) => s.dueDate < today), (s) => s.outstanding),
      dueWithin30: sumMoney(open.filter((s) => s.dueDate <= limit), (s) => s.outstanding),
      lastDueIso: open.reduce((last, s) => (s.dueDate > last ? s.dueDate : last), ""),
    };
  });
  const groupStarts = new Map();
  (data.transactions || []).forEach((t) => {
    if (t.type !== "expense" || !t.creditCardId || !t.installmentGroupId) return;
    const key = `${t.creditCardId}:${t.installmentGroupId}`;
    const first = groupStarts.get(key);
    if (!first || t.date < first) groupStarts.set(key, t.date);
  });
  const openStatementKeys = new Set();
  cards.forEach((card) => card.statements.forEach((statement) => {
    if (statement.outstanding > 0) openStatementKeys.add(`${card.id}:${statement.key}`);
  }));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const groupIds = new Set();
  (data.transactions || []).forEach((t) => {
    if (!t.creditCardId || !t.installmentGroupId) return;
    const groupKey = `${t.creditCardId}:${t.installmentGroupId}`;
    if (groupStarts.get(groupKey) > today) return;
    const card = cardMap.get(t.creditCardId);
    if (card && openStatementKeys.has(`${card.id}:${cardStatementKeyForDate(card, t.date)}`)) groupIds.add(groupKey);
  });
  return {
    cards,
    total: sumMoney(cards, (card) => card.total),
    overdue: sumMoney(cards, (card) => card.overdue),
    dueWithin30: sumMoney(cards, (card) => card.dueWithin30),
    lastDueIso: cards.reduce((last, card) => (card.lastDueIso > last ? card.lastDueIso : last), ""),
    openPurchases: groupIds.size,
  };
}

function accountsSummary(data, asOf) {
  const today = asOf || todayIso();
  const currentKey = monthKeyOf(today);
  const accounts = (data.accounts || []).map((a) => ({ ...a, balance: accountBalance(data, a.id, today) }));
  const legacy = legacyCashBalance(data, today);
  const cards = (data.creditCards || []).map((c) => {
    const statements = cardStatements(data, c.id);
    const due = sumMoney(statements.filter((s) => s.key <= currentKey), (s) => s.outstanding);
    const future = sumMoney(statements.filter((s) => s.key > currentKey), (s) => s.outstanding);
    const used = addMoney(due, future);
    return { ...c, statements, due, future, used, availableLimit: Math.max(0, subMoney(c.limit, used)) };
  });
  const cash = addMoney(sumMoney(accounts, (a) => a.balance), legacy);
  const cardDue = sumMoney(cards, (c) => c.due);
  return {
    accounts, cards, legacy, cash, cardDue,
    futureCard: sumMoney(cards, (c) => c.future),
    availableAfterCards: subMoney(cash, cardDue),
    hasAccounts: accounts.length > 0,
  };
}

function makeAccount(partial) {
  const now = new Date().toISOString();
  return normalizeAccounts([{ ...partial, id: partial.id || uid(), createdAt: partial.createdAt || now, updatedAt: now }])[0];
}

function makeCreditCard(partial, accounts) {
  const now = new Date().toISOString();
  return normalizeCreditCards([{ ...partial, id: partial.id || uid(), createdAt: partial.createdAt || now, updatedAt: now }], accounts)[0];
}

function makeAccountTransfer(partial, accounts) {
  return normalizeAccountTransfers([{ ...partial, id: partial.id || uid() }], accounts)[0] || null;
}

function makeCardPayment(partial, accounts, cards) {
  return normalizeCardPayments([{ ...partial, id: partial.id || uid() }], accounts, cards)[0] || null;
}

function reconcileAccount(data, accountId, actualBalance, date) {
  const checkedAt = date || todayIso();
  const current = accountBalance(data, accountId, checkedAt);
  const delta = subMoney(actualBalance, current);
  const accounts = (data.accounts || []).map((account) => account.id === accountId
    ? { ...account, reconciledAt: checkedAt, updatedAt: new Date().toISOString() }
    : account);
  if (moneyToCents(delta) === 0) return { data: { ...data, accounts }, adjustment: null };
  const adjustment = normalizeAccountAdjustments([{
    id: uid(), accountId, amount: delta, date: checkedAt,
    note: "Conciliação de saldo", createdAt: new Date().toISOString(),
  }], data.accounts)[0];
  return { data: { ...data, accounts, accountAdjustments: [...(data.accountAdjustments || []), adjustment] }, adjustment };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ACCOUNT_TYPE_LABELS, accountById, creditCardById, transactionAffectsCash, accountBalance, legacyCashBalance,
    accountsCashBalance, cardStatementKeyForDate, cardStatementDueDate, cardStatements,
    cardLiabilityStatements, cardLiabilitySummary,
    accountsSummary, makeAccount, makeCreditCard, makeAccountTransfer, makeCardPayment,
    reconcileAccount,
  };
}
