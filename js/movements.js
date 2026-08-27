// js/movements.js. Modelo de leitura da central de movimentações e da caixa de revisão.
"use strict";

const MOVEMENT_SOURCE_META = Object.freeze({
  manual: { label: "Manual", icon: "pencil" },
  "import-ofx": { label: "Extrato OFX", icon: "upload" },
  "import-csv": { label: "Extrato CSV", icon: "upload" },
  "import-pdf": { label: "PDF bancário", icon: "file" },
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
      // As categorias do app descrevem GASTO (Moradia, Alimentação, Transporte).
      // Receita não tem categoria própria e cai no "outros" por ser o padrão do
      // armazenamento, o que fazia o salário aparecer listado como "Outros" -
      // uma classificação errada, não uma ausência. Na leitura, receita é
      // receita; a caixa de revisão também ignora income, então nada aqui pede
      // correção que o usuário não tem como fazer.
      categoryId: t.categoryId,
      categoryName: t.type === "income" ? "Receita" : category.name,
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

// A mesma janela usada pela Caixa de revisão também protege a importação da
// segunda conta e a conversão pelo editor. Um Pix pode aparecer num banco no
// dia seguinte, mas uma janela grande demais passa a juntar pagamentos iguais
// que não têm relação entre si.
const TRANSFER_MATCH_WINDOW_DAYS = 2;

function hasTransferHint(value) {
  return /\b(pix|ted|doc|transf)/.test(normalizeText(value));
}

function transferDatesMatch(left, right) {
  return daysBetweenIso(left, right) <= TRANSFER_MATCH_WINDOW_DAYS;
}

// Procura a outra transação comum que representa a ponta oposta de uma
// transferência. A função não escolhe em caso de empate: quem chama decide se
// mostra uma sugestão ou pede a escolha da pessoa.
function resolveOppositeTransferTransaction(transaction, transactions, options) {
  const anchor = transaction || {};
  const opts = options || {};
  const matches = (transactions || []).filter((candidate) => {
    if (!candidate || candidate.id === anchor.id) return false;
    if (!anchor.accountId || !candidate.accountId || candidate.accountId === anchor.accountId) return false;
    if (opts.otherAccountId && candidate.accountId !== opts.otherAccountId) return false;
    if (candidate.type === anchor.type) return false;
    if (moneyToCents(candidate.amount) !== moneyToCents(anchor.amount)) return false;
    if (!transferDatesMatch(candidate.date, anchor.date)) return false;
    if (!hasTransferHint(anchor.description) && !hasTransferHint(candidate.description)) return false;
    if (candidate.creditCardId || candidate.goalId || candidate.debtId || candidate.installmentGroupId) return false;
    return true;
  });
  return {
    status: matches.length === 0 ? "none" : (matches.length === 1 ? "unique" : "ambiguous"),
    matches,
    transaction: matches.length === 1 ? matches[0] : null,
  };
}

// A tela de conversão e a gravação precisam enxergar exatamente a mesma outra
// ponta, senão o editor promete substituir dois lançamentos e a gravação
// substitui um. Esta função monta a âncora com os valores em edição e devolve a
// resolução crua; quem chama decide entre sugerir, exigir escolha ou recusar.
function resolveTransferConversionCounterpart(transaction, transactions, draft) {
  const source = transaction || {};
  const input = draft || {};
  const fromAccountId = input.fromAccountId || "";
  const toAccountId = input.toAccountId || "";
  const anchor = {
    ...source,
    amount: input.amount == null ? source.amount : input.amount,
    date: input.date == null ? source.date : input.date,
    description: input.description == null ? source.description : input.description,
  };
  // A conta do lançamento tem de continuar do lado que o tipo dele indica: uma
  // saída pertence à origem, uma entrada ao destino. Com a direção invertida, o
  // que existe do outro lado não é a contraparte deste lançamento.
  const linkedSideMatches = source.type === "expense"
    ? fromAccountId === source.accountId
    : toAccountId === source.accountId;
  const otherAccountId = fromAccountId === source.accountId
    ? toAccountId
    : (toAccountId === source.accountId ? fromAccountId : "");
  if (!linkedSideMatches || !otherAccountId) return { status: "none", matches: [], transaction: null };
  return resolveOppositeTransferTransaction(anchor, transactions, { otherAccountId });
}

// A segunda importação não procura outra transação: procura um registro de
// transferência que já representa justamente aquela ponta. O sinal da linha
// informa de que lado a conta do extrato deve aparecer.
function resolveRecordedAccountTransfer(row, statementAccountId, transfers) {
  const item = row || {};
  const matches = (transfers || []).filter((transfer) => {
    if (!transfer || !statementAccountId) return false;
    const accountMatches = item.type === "expense"
      ? transfer.fromAccountId === statementAccountId
      : (item.type === "income" && transfer.toAccountId === statementAccountId);
    if (!accountMatches) return false;
    if (moneyToCents(transfer.amount) !== moneyToCents(item.amount)) return false;
    if (!transferDatesMatch(transfer.date, item.date)) return false;
    return hasTransferHint(item.description) || hasTransferHint(transfer.description);
  });
  return {
    status: matches.length === 0 ? "none" : (matches.length === 1 ? "unique" : "ambiguous"),
    matches,
    transfer: matches.length === 1 ? matches[0] : null,
  };
}

function buildTransactionReviewModel(data) {
  const txs = [...(data.transactions || [])].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const issues = [];
  // UMA COMPRA PARCELADA É UMA DECISÃO, NÃO N DECISÕES.
  //
  // As N parcelas nascem juntas, com a mesma categoria e o mesmo destino: uma
  // compra em 10x virava dez itens idênticos de "categoria precisa de revisão",
  // e o usuário precisava escolher a mesma categoria dez vezes. Com 1.500
  // lançamentos importados a caixa passava de 300 pendências, quase todas
  // repetição da mesma escolha. `installmentGroupId` já existe no dado; aqui
  // ele passa a ser a unidade de revisão, e a decisão vale para o grupo inteiro.
  const categoryGroups = new Map();
  txs.forEach((t) => {
    if (t.type !== "expense" || t.categoryId !== "outros" || t.source === "manual") return;
    const groupId = t.installmentGroupId ? `group:${t.installmentGroupId}` : `tx:${t.id}`;
    const bucket = categoryGroups.get(groupId);
    if (bucket) bucket.push(t);
    else categoryGroups.set(groupId, [t]);
  });
  categoryGroups.forEach((list) => {
    const primary = list[0];
    const key = `category:${primary.id}`;
    if (transactionReviewIgnored(primary, key)) return;
    const total = list.length;
    // O rótulo da parcela ("(1/10)") só faz sentido linha a linha. No grupo, o
    // que identifica a compra é a descrição sem o contador.
    const label = String(primary.description || "Lançamento").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim() || "Lançamento";
    issues.push({
      key, type: "category", txId: primary.id, txIds: list.map((t) => t.id),
      title: "Categoria precisa de revisão",
      detail: total > 1
        ? `${label} está em Outros. A escolha vale para as ${total} parcelas.`
        : `${label} está em Outros.`,
      date: primary.date,
      amount: total > 1 ? sumMoney(list, (t) => t.amount) : primary.amount,
    });
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
