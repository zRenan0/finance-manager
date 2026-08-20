// nlp.js. Lançamento Inteligente: linguagem natural → objeto de transação
// ------------------------------------------------------------------------------
// "Gastei 30 no ifood"  →  { type:"expense", amount:30, categoryId:"delivery",
//                            description:"iFood", date:hoje, payment:"Outro" }
//
// Estratégia: extração determinística por CAMADAS, executada 100% no aparelho e
// offline. Cada camada consome (remove) o trecho que reconheceu, então a camada
// seguinte trabalha num texto menor e menos ambíguo. A ordem importa muito:
//
//   1; parcelas ("em 3x")      → senão o "3" viraria o valor
//   2; datas ("12/03", "ontem")→ senão "12/03" viraria 12 reais
//   3; valor ("30", "R$ 30", "trinta e cinco")
//   4; forma de pagamento, recorrência, tipo (gasto/receita)
//   5; o que sobrou = estabelecimento/descrição → categoria
//
// A categorização combina três sinais, do mais forte para o mais fraco:
//   (a) HISTÓRICO do próprio usuário (se ele já lançou "ifood" em Delivery, é lá);
//   (b) NOME das categorias dele (inclusive as que ele criou);
//   (c) MOTOR DE REGRAS compartilhado com o importador (rules.js) :
//       reaproveitado de propósito para não existirem duas listas divergindo.
//
// O resultado carrega um `confidence` (0..1). A UI usa isso para decidir entre
// salvar direto ou pedir confirmação, e para oferecer o refinamento por IA.
"use strict";

// ---------------------------------------------------------------------------
// Números por extenso (pt-BR); cobre o que aparece em fala corriqueira.
// ---------------------------------------------------------------------------
const NLP_UNITS = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14,
  quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700,
  oitocentos: 800, novecentos: 900,
};
const NLP_MULTIPLIERS = { mil: 1000, milhao: 1000000, milhoes: 1000000 };

// Converte uma sequência de palavras-número em valor. Retorna null se não houver.

function nlpWordsToNumber(words) {
  let total = 0, current = 0, found = false;
  for (const w of words) {
    if (w === "e") continue;
    if (Object.prototype.hasOwnProperty.call(NLP_UNITS, w)) {
      current += NLP_UNITS[w]; found = true; continue;
    }
    if (Object.prototype.hasOwnProperty.call(NLP_MULTIPLIERS, w)) {
      const mult = NLP_MULTIPLIERS[w];
      current = (current === 0 ? 1 : current) * mult;
      total += current; current = 0; found = true; continue;
    }
    return found ? total + current : null;
  }
  return found ? total + current : null;
}

const NLP_NUMBER_WORD_RE = new RegExp(
  `\\b((?:${Object.keys(NLP_UNITS).concat(Object.keys(NLP_MULTIPLIERS)).join("|")})(?:\\s+e\\s+|\\s+)?)+\\b`, "g"
);

// ---------------------------------------------------------------------------
// Léxicos de intenção
// ---------------------------------------------------------------------------
const NLP_INCOME_VERBS = /\b(recebi|ganhei|entrou|caiu|creditaram|creditou|depositaram|depositei|vendi|receita|salario|pagamento recebido|reembolso|estorno|cashback|rendeu|rendimento)\b/;
const NLP_EXPENSE_VERBS = /\b(gastei|paguei|comprei|torrei|saiu|debitaram|debitou|gasto|despesa|assinei|abasteci|pedi|almocei|jantei|lanchei|investi)\b/;
const NLP_RECURRING = /\b(todo mes|todos os meses|mensal|mensalidade|assinatura|fixo|recorrente|sempre)\b/;

const NLP_PAYMENTS = [
  { value: "Pix", re: /\b(pix|no pix|via pix|por pix)\b/ },
  { value: "Crédito", re: /\b(credito|cartao de credito|no cartao|cartao|fatura|parcelado)\b/ },
  { value: "Débito", re: /\b(debito|cartao de debito|na funcao debito)\b/ },
  { value: "Dinheiro", re: /\b(dinheiro|especie|em cash|cash|papel)\b/ },
  { value: "Outro", re: /\b(boleto|transferencia|ted|doc|deposito)\b/ },
];

const NLP_WEEKDAYS = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

// Verbos que, além de indicarem gasto, já entregam a categoria de graça
// ("almocei 42" não tem estabelecimento, mas obviamente é Alimentação).
const NLP_VERB_CATEGORY = [
  { re: /\b(almocei|jantei|lanchei|comi)\b/, categoryId: "alimentacao", confidence: 0.75 },
  { re: /\b(abasteci|estacionei)\b/, categoryId: "transporte", confidence: 0.8 },
  { re: /\b(investi|apliquei)\b/, categoryId: "investimento", confidence: 0.85 },
  { re: /\b(assinei)\b/, categoryId: "assinaturas", confidence: 0.7 },
];

// Palavras que nunca devem virar descrição por si só.

const NLP_STOPWORDS = new Set([
  "gastei", "paguei", "comprei", "torrei", "recebi", "ganhei", "entrou", "caiu", "saiu",
  "almocei", "jantei", "lanchei", "comi", "abasteci", "estacionei", "investi", "apliquei",
  "assinei", "pedi", "debitaram", "creditaram", "depositei", "gasto", "despesa", "receita",
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "com", "pra", "para",
  "por", "o", "a", "os", "as", "um", "uma", "meu", "minha", "reais", "real", "conto",
  "contos", "pila", "pilas", "pau", "paus", "hoje", "ontem", "anteontem", "e", "foi",
  "ali", "la", "aqui", "que", "ao", "aos", "num", "numa", "aquele", "esse", "este",
  "dia", "mes", "ano", "semana", "passada", "passado", "ultima", "ultimo", "agora",
  "vezes", "vez", "parcelas", "parcela", "sobre", "cerca", "quase", "mais", "menos",
]);

function nlpNormalize(text) {
  return normalizeText(text).replace(/[!?"']/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// CAMADA 1; parcelas
// ---------------------------------------------------------------------------
function nlpExtractInstallments(text) {
  let installments = 1;
  let out = text;
  const patterns = [
    /\bem\s+(\d{1,2})\s*x\b/,
    /\b(\d{1,2})\s*x(?:\s+de)?\b/,
    /\bem\s+(\d{1,2})\s+(?:vezes|parcelas)\b/,
    /\bparcelad[oa]\s+em\s+(\d{1,2})\b/,
  ];
  for (const re of patterns) {
    const m = out.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 48) { installments = n; out = out.replace(m[0], " "); }
      break;
    }
  }
  return { installments, text: out };
}

// ---------------------------------------------------------------------------
// CAMADA 2; data
// ---------------------------------------------------------------------------
function nlpExtractDate(text) {
  let out = text;
  const today = new Date();
  const iso = (d) => isoOfDate(d);
  const shift = (days) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };

  // dd/mm[/aaaa] ou dd-mm[-aaaa]
  let m = out.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (m) {
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    let y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      out = out.replace(m[0], " ");
      return { date: isoOfDate(new Date(y, mo - 1, Math.min(d, daysInMonthOf(y, mo - 1)))), text: out, explicit: true };
    }
  }

  if (/\banteontem\b/.test(out)) return { date: iso(shift(-2)), text: out.replace(/\banteontem\b/, " "), explicit: true };
  if (/\bontem\b/.test(out)) return { date: iso(shift(-1)), text: out.replace(/\bontem\b/, " "), explicit: true };
  if (/\bhoje\b/.test(out)) return { date: iso(today), text: out.replace(/\bhoje\b/, " "), explicit: true };
  if (/\bamanha\b/.test(out)) return { date: iso(shift(1)), text: out.replace(/\bamanha\b/, " "), explicit: true };

  // "dia 12" (mês corrente; se já passou muito, assume o mês anterior não :
  // mantém o mês atual, que é o comportamento menos surpreendente)
  m = out.match(/\bdia\s+(\d{1,2})\b/);
  if (m) {
    const d = clamp(parseInt(m[1], 10), 1, daysInMonthOf(today.getFullYear(), today.getMonth()));
    out = out.replace(m[0], " ");
    return { date: isoOfDate(new Date(today.getFullYear(), today.getMonth(), d)), text: out, explicit: true };
  }

  // "semana passada"
  if (/\bsemana passada\b/.test(out)) {
    return { date: iso(shift(-7)), text: out.replace(/\bsemana passada\b/, " "), explicit: true };
  }

  // dias da semana ("na sexta", "sabado passado") → ocorrência mais recente
  m = out.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?\b/);
  if (m) {
    const target = NLP_WEEKDAYS[m[1]];
    const diff = (today.getDay() - target + 7) % 7 || 7;
    out = out.replace(m[0], " ");
    return { date: iso(shift(-diff)), text: out, explicit: true };
  }

  return { date: todayIso(), text: out, explicit: false };
}

// ---------------------------------------------------------------------------
// CAMADA 3; valor
// ---------------------------------------------------------------------------
function nlpExtractAmount(text) {
  let out = text;

  // Percentuais nunca são valores.

  out = out.replace(/\b\d+(?:[.,]\d+)?\s*%/g, " ");

  // 3a) formato explícito com R$ (mais confiável)
  let m = out.match(/r\$\s*([\d.,]+)/);
  if (m) {
    const v = parseMoneyInput(m[1]);
    if (Number.isFinite(v) && v > 0) return { amount: v, text: out.replace(m[0], " "), confidence: 1 };
  }

  // 3b) número seguido de "reais/conto/pila/pau" ou precedido de "de"
  m = out.match(/\b([\d.,]+)\s*(?:reais|real|conto|contos|pila|pilas|pau|paus|mangos?)\b/);
  if (m) {
    const v = parseMoneyInput(m[1]);
    if (Number.isFinite(v) && v > 0) return { amount: v, text: out.replace(m[0], " "), confidence: 1 };
  }

  // 3c) número solto (o primeiro que fizer sentido como dinheiro)
  const numbers = [...out.matchAll(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b/g)];
  for (const match of numbers) {
    const v = parseMoneyInput(match[1]);
    if (Number.isFinite(v) && v > 0) {
      return { amount: v, text: out.replace(match[0], " "), confidence: 0.85 };
    }
  }

  // 3d) número por extenso ("trinta e cinco")
  NLP_NUMBER_WORD_RE.lastIndex = 0;
  const wordMatches = [...out.matchAll(NLP_NUMBER_WORD_RE)];
  for (const wm of wordMatches) {
    const phrase = wm[0].trim();
    const value = nlpWordsToNumber(phrase.split(/\s+/));
    if (value != null && value > 0) {
      return { amount: value, text: out.replace(phrase, " "), confidence: 0.8 };
    }
  }

  return { amount: null, text: out, confidence: 0 };
}

// ---------------------------------------------------------------------------
// CAMADA 4; pagamento, recorrência e tipo
// ---------------------------------------------------------------------------
function nlpExtractPayment(text) {
  for (const p of NLP_PAYMENTS) {
    const m = text.match(p.re);
    if (m) return { payment: p.value, text: text.replace(m[0], " "), explicit: true };
  }
  return { payment: null, text, explicit: false };
}

function nlpExtractType(text) {
  if (NLP_INCOME_VERBS.test(text)) return "income";
  if (NLP_EXPENSE_VERBS.test(text)) return "expense";
  return "expense";                      // padrão do app: quem digita rápido está lançando gasto
}

// ---------------------------------------------------------------------------
// CAMADA 5; descrição e categoria
// ---------------------------------------------------------------------------
function nlpExtractDescription(text) {
  const words = text.split(/\s+/).filter(Boolean).filter((w) => !NLP_STOPWORDS.has(w) && !/^\d+$/.test(w));
  if (words.length === 0) return "";
  // Mantém no máximo 4 palavras; descrição curta é o que cabe na lista.
  return words.slice(0, 4).join(" ");
}

// Aprende com o próprio histórico: qual categoria o usuário costuma usar para
// lançamentos com esta palavra na descrição.
function nlpCategoryFromHistory(data, term) {
  if (!term) return null;
  const needle = nlpNormalize(term);
  if (needle.length < 3) return null;
  const tally = new Map();
  const list = data.transactions || [];
  for (let i = list.length - 1; i >= 0 && i >= list.length - 500; i--) {
    const t = list[i];
    if (t.type !== "expense") continue;
    const desc = nlpNormalize(t.description);
    if (!desc || (!desc.includes(needle) && !needle.includes(desc))) continue;
    tally.set(t.categoryId, (tally.get(t.categoryId) || 0) + 1);
  }
  let best = null;
  tally.forEach((count, id) => { if (!best || count > best.count) best = { id, count }; });
  return best && best.count >= 1 ? best.id : null;
}

// Casa com o nome das categorias do próprio usuário (inclusive as criadas por ele).

function nlpCategoryFromNames(data, text) {
  const hay = nlpNormalize(text);
  if (!hay) return null;
  let best = null;
  (data.categories || []).forEach((c) => {
    const name = nlpNormalize(c.name);
    if (name.length < 3) return;
    if (hay.includes(name) && (!best || name.length > best.len)) best = { id: c.id, len: name.length };
  });
  return best ? best.id : null;
}

function nlpResolveCategory(data, descriptionText, fullText) {
  const fromHistory = nlpCategoryFromHistory(data, descriptionText);
  if (fromHistory && (data.categories || []).some((c) => c.id === fromHistory)) {
    return { categoryId: fromHistory, source: "historico", confidence: 0.95 };
  }
  const fromNames = nlpCategoryFromNames(data, fullText);
  if (fromNames) return { categoryId: fromNames, source: "categoria", confidence: 0.9 };

  // Verbo de ação ("almocei", "abasteci"); só vale se a categoria ainda existir.

  for (const hint of NLP_VERB_CATEGORY) {
    if (hint.re.test(fullText) && (data.categories || []).some((c) => c.id === hint.categoryId)) {
      return { categoryId: hint.categoryId, source: "verbo", confidence: hint.confidence };
    }
  }

  // Motor de regras compartilhado com o importador de extratos (rules.js).
  // Passa o `data` inteiro, e não só as categorias: é o que faz uma regra
  // escrita pelo usuário valer também no lançamento por texto livre.
  if (typeof guessCategoryId === "function") {
    const guess = guessCategoryId(data, fullText);
    const conf = typeof categorySuggestionConfidence === "function"
      ? categorySuggestionConfidence(fullText, data) : "baixa";
    if (guess && guess !== "outros") {
      return { categoryId: guess, source: "dicionario", confidence: conf === "alta" ? 0.85 : conf === "media" ? 0.6 : 0.4 };
    }
  }
  return { categoryId: "outros", source: "padrao", confidence: 0.25 };
}

// ---------------------------------------------------------------------------
// API PRINCIPAL
// ---------------------------------------------------------------------------
// Retorna um "rascunho" pronto para virar transação, com metadados de confiança
// para a UI decidir o que fazer.
function parseNaturalEntry(rawText, data) {
  const original = String(rawText || "").trim();
  const result = {
    ok: false, original,
    type: "expense", amount: null, categoryId: "outros", date: todayIso(),
    payment: "Outro", description: "", recurring: false, installments: 1,
    confidence: 0, categorySource: "padrao", missing: [], matched: {},
  };
  if (!original) { result.missing.push("texto"); return result; }

  const base = nlpNormalize(original);
  const type = nlpExtractType(base);

  const stepInstallments = nlpExtractInstallments(base);
  const stepDate = nlpExtractDate(stepInstallments.text);
  const stepAmount = nlpExtractAmount(stepDate.text);
  const stepPayment = nlpExtractPayment(stepAmount.text);

  const recurring = NLP_RECURRING.test(base);
  const descriptionRaw = nlpExtractDescription(stepPayment.text.replace(NLP_RECURRING, " "));

  result.type = type;
  result.amount = stepAmount.amount;
  result.date = stepDate.date;
  result.recurring = recurring;
  result.installments = stepInstallments.installments;
  result.matched = {
    date: stepDate.explicit, payment: stepPayment.explicit,
    installments: stepInstallments.installments > 1, recurring,
  };

  // Pagamento: explícito > inferido pelo parcelamento > padrão do tipo.

  if (stepPayment.payment) result.payment = stepPayment.payment;
  else if (stepInstallments.installments > 1) result.payment = "Crédito";
  else result.payment = type === "income" ? "Outro" : "Outro";

  if (type === "expense") {
    const cat = nlpResolveCategory(data, descriptionRaw, base);
    result.categoryId = cat.categoryId;
    result.categorySource = cat.source;
    result.categoryConfidence = cat.confidence;
  } else {
    result.categoryId = "outros";
    result.categoryConfidence = 1;
  }

  // Descrição final: preserva a capitalização original quando possível. Se a frase
  // não deixou nada aproveitável ("almocei 42"), usa o nome da categoria.
  result.description = nlpRecoverOriginalCase(original, descriptionRaw);
  if (!result.description) {
    result.description = result.type === "income"
      ? "Receita"
      : (categoryById(data, result.categoryId) || {}).name || "Gasto";
  }

  if (!(result.amount > 0)) result.missing.push("valor");
  if (type === "expense" && result.categorySource === "padrao") result.missing.push("categoria");

  // Confiança agregada: valor pesa mais que categoria (sem valor não há lançamento).

  const amountScore = result.amount > 0 ? stepAmount.confidence : 0;
  const catScore = result.categoryConfidence || 0;
  result.confidence = Number((amountScore * 0.6 + catScore * 0.4).toFixed(2));
  result.ok = result.amount > 0;
  return result;
}

// Recupera a grafia original ("ifood" → "iFood" se o usuário digitou assim).

function nlpRecoverOriginalCase(original, normalizedFragment) {
  if (!normalizedFragment) return "";
  const originalWords = original.split(/\s+/);
  const wanted = normalizedFragment.split(/\s+/);
  const picked = [];
  wanted.forEach((w) => {
    const found = originalWords.find((ow) => nlpNormalize(ow).replace(/[^a-z0-9]/g, "") === w.replace(/[^a-z0-9]/g, ""));
    picked.push(found ? found.replace(/[.,;:]$/, "") : w);
  });
  const text = picked.join(" ").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Permite lançar várias coisas de uma vez ("mercado 120; uber 18").

function parseNaturalEntries(rawText, data) {
  const chunks = String(rawText || "")
    .split(/[;\n]+|\s+\+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length <= 1) {
    const single = parseNaturalEntry(rawText, data);
    return single.original ? [single] : [];
  }
  return chunks.map((c) => parseNaturalEntry(c, data)).filter((r) => r.original);
}

// Converte o rascunho em transação(ões) reais, reutilizando as fábricas oficiais
// do storage.js; inclusive o rateio exato de parcelas.
function transactionsFromNaturalEntry(draft) {
  if (!draft || !(draft.amount > 0)) return [];
  const base = {
    type: draft.type,
    amount: draft.amount,
    categoryId: draft.type === "expense" ? draft.categoryId : "outros",
    date: draft.date,
    payment: draft.payment,
    description: draft.description || (draft.type === "income" ? "Receita" : "Gasto"),
    recurring: !!draft.recurring,
    source: "nlp",
  };
  if (draft.type === "expense" && draft.installments > 1) {
    return makeInstallmentTransactions({ ...base, payment: "Crédito" }, draft.installments);
  }
  return [makeTransaction(base)];
}

// Exemplos usados como placeholder/atalho na interface.

const NLP_EXAMPLES = [
  "Gastei 30 no ifood",
  "Paguei 120 de mercado ontem no débito",
  "Uber 18,50 hoje",
  "Recebi 2500 de salário",
  "Comprei um tênis 450 em 3x no crédito",
];
