// js/reconcile.js. [M35] Conciliação: o saldo do app contra o saldo do banco.
//
// A conciliação já existia em `accounts.js` (`reconcileAccount`) e continua lá,
// intacta. O que faltava era o passo do meio: o app recebia o saldo visto no
// banco e gravava o ajuste na mesma batida. Quem digitava R$ 1.200 nunca sabia
// POR QUE o número dele era outro; ganhava uma linha "Conciliação de saldo" que
// esconde o erro em vez de mostrá-lo. Um lançamento digitado duas vezes vira
// ajuste, o mês seguinte repete a diferença, e a base vai apodrecendo debaixo de
// ajustes que ninguém entende.
//
// Este arquivo não grava nada. Ele COMPARA e PROCURA:
//
//   comparar   saldo calculado, saldo informado e a diferença entre os dois;
//   procurar   qual movimento explicaria essa diferença exatamente.
//
// A regra do módulo é a mesma do M34: número e hipótese, nunca veredito. O app
// diz "se este lançamento for cópia, a diferença fecha"; quem decide é a pessoa,
// e o ajuste só é gravado depois de ela pedir.
"use strict";

// Sem conferência anterior, procura-se 90 dias para trás. Com conferência
// anterior mais antiga que isso, procura-se desde ela: o erro entrou depois da
// última vez que os dois números bateram, então essa é a janela verdadeira.
const RECONCILE_LOOKBACK_DAYS = 90;
// Mesma folga da importação (`DUPLICATE_WINDOW_DAYS`): dois movimentos iguais a
// até três dias são candidatos a "digitei duas vezes".
const RECONCILE_TWIN_WINDOW_DAYS = 3;
const RECONCILE_MAX_CANDIDATES = 6;

function reconcileDescriptionKey(value) {
  return normalizeText(value || "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function reconcileShiftIso(iso, days) {
  const base = dateFromIso(iso);
  base.setDate(base.getDate() + days);
  return isoOfDate(base);
}

// ==============================================================================
// MOVIMENTOS QUE MEXEM NO SALDO DESTA CONTA
// ==============================================================================
// Espelha `accountBalance` item por item, de propósito, e mora ao lado dela na
// mesma lista de fontes. Se um dia a regra do saldo mudar e esta não, a
// conciliação passa a procurar a causa no lugar errado, pior que não procurar.
//
// `effectCents` é o efeito COM SINAL sobre o saldo. É ele, e não o valor
// digitado, que permite a única pergunta que interessa aqui: "tirar este
// movimento faria os dois números baterem?".
function accountCashEntries(data, accountId, asOf) {
  const account = accountById(data, accountId);
  if (!account) return [];
  const limit = asOf || todayIso();
  const dentro = (date) => String(date) <= limit && String(date) >= account.openingDate;
  const out = [];
  (data.transactions || []).forEach((t) => {
    if (t.accountId !== accountId || t.creditCardId || !dentro(t.date)) return;
    const cents = moneyToCents(t.amount);
    out.push({
      id: t.id, kind: "transaction", type: t.type, date: t.date,
      description: t.description || (t.type === "income" ? "Receita" : "Despesa"),
      amount: moneyFromCents(Math.abs(cents)),
      effectCents: t.type === "income" ? cents : -cents,
    });
  });
  (data.accountTransfers || []).forEach((t) => {
    if (!dentro(t.date)) return;
    const cents = moneyToCents(t.amount);
    const saida = t.fromAccountId === accountId;
    const entrada = t.toAccountId === accountId;
    if (!saida && !entrada) return;
    out.push({
      id: t.id, kind: "transfer", type: saida ? "transfer-out" : "transfer-in", date: t.date,
      description: t.description || "Transferência entre contas",
      amount: moneyFromCents(Math.abs(cents)),
      effectCents: saida ? -cents : cents,
    });
  });
  (data.cardPayments || []).forEach((p) => {
    if (p.accountId !== accountId || !dentro(p.date)) return;
    const card = creditCardById(data, p.creditCardId);
    const cents = moneyToCents(p.amount);
    out.push({
      id: p.id, kind: "card-payment", type: "card-payment", date: p.date,
      description: `Pagamento da fatura ${card ? card.name : "do cartão"}`,
      amount: moneyFromCents(Math.abs(cents)), effectCents: -cents,
    });
  });
  (data.accountAdjustments || []).forEach((a) => {
    if (a.accountId !== accountId || !dentro(a.date)) return;
    const cents = moneyToCents(a.amount);
    out.push({
      id: a.id, kind: "adjustment", type: "adjustment", date: a.date,
      description: a.note || "Conciliação de saldo",
      amount: moneyFromCents(Math.abs(cents)), effectCents: cents,
    });
  });
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Desde quando procurar. A data de abertura é o piso absoluto: antes dela o
// saldo inicial já embute tudo, e acusar um movimento de lá seria acusar o que
// nem entra na conta.
function reconciliationSearchStart(account, checkedAt) {
  const padrao = reconcileShiftIso(checkedAt, -RECONCILE_LOOKBACK_DAYS);
  const anterior = account.reconciledAt && account.reconciledAt < padrao ? account.reconciledAt : padrao;
  return anterior < account.openingDate ? account.openingDate : anterior;
}

// ==============================================================================
// CAUSAS POSSÍVEIS
// ==============================================================================
// `alvo` é o efeito do movimento que, se não existisse, faria os dois números
// baterem. Diferença positiva (banco tem mais) procura uma SAÍDA a mais no app;
// negativa procura uma ENTRADA a mais. É aritmética, não adivinhação: quando a
// conta fecha no centavo, a hipótese vale a pena ser mostrada.
function reconciliationCandidates(data, account, differenceCents, entries, checkedAt) {
  const alvo = -differenceCents;
  const porChave = new Map();
  entries.forEach((e) => {
    const chave = `${e.effectCents}|${reconcileDescriptionKey(e.description)}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push(e);
  });
  const temGemeo = (e) => {
    const chave = `${e.effectCents}|${reconcileDescriptionKey(e.description)}`;
    return (porChave.get(chave) || []).some((o) => o.id !== e.id
      && Math.abs(daysBetweenIso(o.date, e.date)) <= RECONCILE_TWIN_WINDOW_DAYS);
  };

  const out = [];
  entries.forEach((e) => {
    if (e.effectCents === alvo) out.push(reconciliationExactCandidate(e, temGemeo(e)));
    // Sinal invertido muda o saldo em DUAS vezes o valor do lançamento: sai de
    // -100 e vai para +100. Por isso o valor procurado aqui é a metade.
    else if (alvo % 2 === 0 && e.effectCents !== 0 && e.effectCents * 2 === alvo) out.push(reconciliationSignCandidate(e));
  });
  if (differenceCents < 0) out.push(...reconciliationStatementCandidates(data, account, -differenceCents, checkedAt));
  out.push(reconciliationMissingCandidate(differenceCents));

  return out
    .sort((a, b) => a.rank - b.rank || String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, RECONCILE_MAX_CANDIDATES);
}

const RECONCILE_KIND_LABEL = Object.freeze({
  transaction: "Lançamento",
  transfer: "Transferência",
  "card-payment": "Pagamento de fatura",
  adjustment: "Ajuste anterior",
});

function reconciliationExactCandidate(entry, gemeo) {
  const quando = fmtDateFull(entry.date);
  const valor = fmtBRL(entry.amount);
  if (gemeo) {
    return {
      id: `duplicado:${entry.id}`, cause: "duplicado", rank: 0, entryId: entry.id, entryKind: entry.kind,
      date: entry.date, amount: entry.amount,
      title: `Possível lançamento repetido: ${entry.description}`,
      detail: `${valor} em ${quando}. Existe outro movimento igual a poucos dias daqui. Se um dos dois for cópia, apagá-lo fecha a diferença no centavo.`,
    };
  }
  if (entry.kind === "transfer") {
    return {
      id: `transferencia:${entry.id}`, cause: "transferencia", rank: 0, entryId: entry.id, entryKind: entry.kind,
      date: entry.date, amount: entry.amount,
      title: `Transferência de ${valor} em ${quando}`,
      detail: "Confira se ela aconteceu mesmo nesta conta e se o outro lado não foi lançado também como receita ou despesa. Contada duas vezes, ela explica a diferença inteira.",
    };
  }
  if (entry.kind === "card-payment") {
    return {
      id: `fatura:${entry.id}`, cause: "fatura", rank: 0, entryId: entry.id, entryKind: entry.kind,
      date: entry.date, amount: entry.amount,
      title: `${entry.description}: ${valor} em ${quando}`,
      detail: "O pagamento está registrado aqui. Se o banco ainda não debitou (ou debitou outro valor), é ele que separa os dois saldos.",
    };
  }
  if (entry.kind === "adjustment") {
    return {
      id: `ajuste:${entry.id}`, cause: "ajuste", rank: 0, entryId: entry.id, entryKind: entry.kind,
      date: entry.date, amount: entry.amount,
      title: `Ajuste de conciliação de ${quando}`,
      detail: `${valor} registrados numa conferência anterior. Se aquele saldo foi digitado errado, é este ajuste que está sobrando hoje, e um ajuste novo por cima esconderia os dois.`,
    };
  }
  return {
    id: `lancamento:${entry.id}`, cause: "lancamento", rank: 0, entryId: entry.id, entryKind: entry.kind,
    date: entry.date, amount: entry.amount,
    title: `${entry.type === "income" ? "Receita" : "Despesa"} de ${valor}: ${entry.description}`,
    detail: `Lançada em ${quando}. Confira valor e data no extrato: sem ela, ou com o valor certo, os dois saldos batem exatamente.`,
  };
}

function reconciliationSignCandidate(entry) {
  const era = entry.effectCents > 0 ? "entrada" : "saída";
  const seria = entry.effectCents > 0 ? "saída" : "entrada";
  return {
    id: `sinal:${entry.id}`, cause: "sinal", rank: 1, entryId: entry.id, entryKind: entry.kind,
    date: entry.date, amount: entry.amount,
    title: `Sinal invertido? ${entry.description}`,
    detail: `${fmtBRL(entry.amount)} em ${fmtDateFull(entry.date)}, lançados como ${era}. Se na verdade for ${seria}, a diferença fecha no centavo.`,
  };
}

// Fatura vencida sem pagamento registrado e com o valor exato da diferença: o
// caso clássico de "o banco já debitou e o app não sabe". Vale só quando o banco
// tem MENOS que o app, que é o sentido de um débito não registrado.
function reconciliationStatementCandidates(data, account, faltaCents, checkedAt) {
  const out = [];
  (data.creditCards || []).forEach((card) => {
    if (card.accountId !== account.id) return;
    cardStatements(data, card.id).forEach((s) => {
      if (s.dueDate > checkedAt || moneyToCents(s.outstanding) !== faltaCents) return;
      out.push({
        id: `fatura-aberta:${card.id}:${s.key}`, cause: "fatura-aberta", rank: 0,
        entryId: null, entryKind: "statement", cardId: card.id, statementKey: s.key,
        date: s.dueDate, amount: s.outstanding,
        title: `Fatura do ${card.name} em aberto: ${fmtBRL(s.outstanding)}`,
        detail: `Venceu em ${fmtDateFull(s.dueDate)} e não tem pagamento registrado aqui. Se o banco já debitou, registre o pagamento da fatura: assim a fatura fecha junto, o que um ajuste de saldo não faria.`,
      });
    });
  });
  return out;
}

// Sempre presente, e sempre por último. Quando nenhuma hipótese fecha a conta, a
// resposta honesta é que falta um movimento, e dizer qual seria o formato dele
// é mais útil que oferecer um ajuste.
function reconciliationMissingCandidate(differenceCents) {
  const valor = fmtBRL(moneyFromCents(Math.abs(differenceCents)));
  const entrada = differenceCents > 0;
  return {
    id: "ausente", cause: "ausente", rank: 2, entryId: null, entryKind: null, date: null,
    amount: moneyFromCents(Math.abs(differenceCents)),
    title: `${entrada ? "Entrada" : "Saída"} de ${valor} ainda não registrada`,
    detail: entrada
      ? "O banco tem mais do que o app. Procure no extrato um crédito que não foi lançado: salário, estorno, rendimento ou uma transferência recebida."
      : "O banco tem menos do que o app. Procure no extrato um débito que não foi lançado: tarifa, compra no débito, boleto ou uma transferência enviada.",
  };
}

// ==============================================================================
// O MODELO DA TELA
// ==============================================================================
function buildReconciliationModel(data, accountId, informedBalance, date) {
  const account = accountById(data, accountId);
  if (!account) return null;
  const checkedAt = date || todayIso();
  const calculated = accountBalance(data, accountId, checkedAt);
  const informed = moneyFromCents(moneyToCents(informedBalance));
  const differenceCents = moneyToCents(informed) - moneyToCents(calculated);
  const searchFrom = reconciliationSearchStart(account, checkedAt);
  const scanned = accountCashEntries(data, accountId, checkedAt).filter((e) => e.date >= searchFrom);
  return {
    accountId, accountName: account.name, date: checkedAt,
    calculated, informed,
    difference: moneyFromCents(differenceCents),
    differenceCents,
    matched: differenceCents === 0,
    // Nome do ponto de vista de quem lê o extrato, não do banco de dados.
    direction: differenceCents === 0 ? null : (differenceCents > 0 ? "banco-maior" : "banco-menor"),
    searchFrom, scannedCount: scanned.length,
    lastReconciledAt: account.reconciledAt || null,
    candidates: differenceCents === 0 ? [] : reconciliationCandidates(data, account, differenceCents, scanned, checkedAt),
  };
}

// A frase de topo. Fica aqui, e não na tela, porque é ela que carrega a régua do
// módulo: descrever a diferença sem culpar ninguém e sem prometer explicação.
function reconciliationHeadline(model) {
  if (!model) return "";
  if (model.matched) return "O saldo do aplicativo já é igual ao do banco. Nada foi alterado.";
  const valor = fmtBRL(moneyFromCents(Math.abs(model.differenceCents)));
  return model.differenceCents > 0
    ? `O banco tem ${valor} a mais do que o aplicativo calculou.`
    : `O aplicativo calculou ${valor} a mais do que o banco mostra.`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RECONCILE_LOOKBACK_DAYS, RECONCILE_TWIN_WINDOW_DAYS, RECONCILE_KIND_LABEL,
    accountCashEntries, reconciliationSearchStart, reconciliationCandidates,
    buildReconciliationModel, reconciliationHeadline, reconcileDescriptionKey,
  };
}
