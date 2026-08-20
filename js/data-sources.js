// data-sources.js. Visão agregada e local das contas e origens dos dados.
"use strict";

const DATA_SOURCE_ORDER = ["manual", "import-ofx", "import-csv", "qrcode-pix", "qrcode-nfce", "nlp", "transfer", "card-payment", "adjustment"];

function sourceTimestamp(entry) {
  return String(entry.updatedAt || entry.createdAt || (entry.origin && entry.origin.importedAt) || entry.date || "");
}

function buildDataSourcesModel(data) {
  const entries = typeof movementEntries === "function" ? movementEntries(data) : [];
  (data.accountAdjustments || []).forEach((adjustment) => entries.push({
    id: `adjustment:${adjustment.id}`, source: "adjustment", date: adjustment.date,
    createdAt: adjustment.createdAt, updatedAt: adjustment.updatedAt,
    origin: adjustment.origin, relatedAccountIds: [adjustment.accountId],
  }));

  const grouped = new Map();
  entries.forEach((entry) => {
    const key = entry.source || "manual";
    const current = grouped.get(key) || { id: key, count: 0, lastUpdatedAt: "", reference: null };
    current.count += 1;
    const timestamp = sourceTimestamp(entry);
    if (timestamp >= current.lastUpdatedAt) {
      current.lastUpdatedAt = timestamp;
      current.reference = entry.origin && entry.origin.reference ? entry.origin.reference : current.reference;
    }
    grouped.set(key, current);
  });

  const sourceMeta = {
    manual: { label: "Lançamentos manuais", icon: "pencil", status: "Dados locais", detail: "Incluídos por você neste aparelho." },
    "import-ofx": { label: "Arquivos OFX", icon: "upload", status: "Arquivo importado", detail: "Extratos lidos no navegador, sem envio para terceiros." },
    "import-csv": { label: "Arquivos CSV", icon: "upload", status: "Arquivo importado", detail: "Planilhas de extrato lidas no navegador." },
    "qrcode-pix": { label: "QR Code Pix", icon: "scan", status: "Leitura local", detail: "Dados extraídos da cobrança conferida por você." },
    "qrcode-nfce": { label: "QR Code de nota", icon: "scan", status: "Leitura conferida", detail: "Dados extraídos do cupom fiscal." },
    nlp: { label: "Texto livre", icon: "sparkles", status: "Interpretação local", detail: "Lançamentos criados pelo campo de texto inteligente." },
    transfer: { label: "Transferências", icon: "arrowRight", status: "Movimento interno", detail: "Move dinheiro entre contas sem criar receita ou despesa." },
    "card-payment": { label: "Pagamentos de fatura", icon: "creditCard", status: "Movimento interno", detail: "Reduz a conta sem duplicar as compras do cartão." },
    adjustment: { label: "Ajustes de conciliação", icon: "refresh", status: "Ajuste interno", detail: "Diferenças registradas ao conferir o saldo no banco." },
  };
  const sources = DATA_SOURCE_ORDER.filter((key) => grouped.has(key)).map((key) => ({ ...sourceMeta[key], ...grouped.get(key) }));
  const unknown = [...grouped.keys()].filter((key) => !DATA_SOURCE_ORDER.includes(key));
  unknown.forEach((key) => sources.push({ id: key, label: "Outra origem", icon: "file", status: "Dados locais", detail: "Origem preservada no histórico.", ...grouped.get(key) }));

  const review = typeof buildTransactionReviewModel === "function" ? buildTransactionReviewModel(data) : { issues: [] };
  const accountStats = (data.accounts || []).map((account) => {
    const related = entries.filter((entry) => (entry.relatedAccountIds || []).includes(account.id));
    const pending = review.issues.filter((issue) => issue.accountId === account.id || related.some((entry) => (issue.txIds || []).includes(entry.id)));
    return {
      accountId: account.id,
      movementCount: related.length,
      lastMovementAt: related.map((entry) => String(entry.date || "")).filter(Boolean).sort().pop() || null,
      reconciledAt: account.reconciledAt || null,
      pendingCount: pending.length,
    };
  });
  const cardStats = (data.creditCards || []).map((card) => {
    const related = entries.filter((entry) => entry.creditCardId === card.id);
    return { cardId: card.id, movementCount: related.length, lastMovementAt: related.map((entry) => String(entry.date || "")).filter(Boolean).sort().pop() || null };
  });
  const withoutDestination = (data.transactions || []).filter((tx) => !tx.accountId && !tx.creditCardId).length;
  return {
    connection: { id: "local", label: "Dados locais", detail: "Sem sincronização bancária automática", connected: false },
    sources, accountStats, cardStats, pendingCount: review.issues.length,
    totalRecords: entries.length, withoutDestination,
    lastUpdatedAt: entries.map(sourceTimestamp).sort().pop() || null,
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { DATA_SOURCE_ORDER, sourceTimestamp, buildDataSourcesModel };
