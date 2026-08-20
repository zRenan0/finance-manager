// rules.js; motor de categorização automática (regras de fábrica + regras do usuário)
// ------------------------------------------------------------------------------
// Antes deste arquivo, a heurística de categorização vivia como um `const` dentro
// de import.js: o usuário via o palpite errado na tela de revisão, corrigia à mão
// e no mês seguinte corrigia de novo. Agora as regras são DADO, não código.
//
// Três decisões que sustentam o resto do módulo:
//
//   1. O motor é puro. Não toca DOM, não lê `state`, não grava nada. Recebe
//      `data` e devolve resultado. É o que permite testá-lo no Node sem stub de
//      navegador e reaproveitá-lo em três consumidores diferentes (importador,
//      linguagem natural e leitor de QR).
//   2. As regras de fábrica continuam no código, mas ganharam id e rótulo. O
//      usuário não as edita: ele as DESLIGA ou redireciona para outra categoria.
//      Guardar só a diferença (em vez de copiar as ~11 regras para dentro do
//      backup de todo mundo) mantém o arquivo de backup pequeno e permite que
//      uma melhoria futura no dicionário chegue a quem já usa o app.
//   3. Regra do usuário nasce com peso maior que qualquer regra de fábrica.
//      Quem escreveu a regra à mão sabe mais sobre o próprio extrato do que o
//      dicionário genérico; em caso de empate de descrição, ele vence.
// ------------------------------------------------------------------------------
"use strict";

// Peso de referência. As regras de fábrica vão de 3 a 6; o usuário escolhe de 1
// a 10 e o padrão (8) já ganha de todas elas sem precisar entender a escala.
const RULE_WEIGHT_MIN = 1;
const RULE_WEIGHT_MAX = 10;
const RULE_WEIGHT_DEFAULT = 8;
const RULE_PATTERN_MAX = 120;

// Tipos de casamento. `regex` existe porque extratos brasileiros têm padrões que
// nenhum "contém" resolve (ex: `^pix (env|rec)`), mas é o último da lista de
// propósito: é o único que o usuário consegue escrever errado.
const RULE_MATCH_TYPES = [
  { id: "contains", label: "Contém o texto", hint: "Casa em qualquer parte da descrição. É o que você quer em 9 de 10 casos." },
  { id: "word", label: "Palavra inteira", hint: "Evita que “bar” case dentro de “barbearia”." },
  { id: "starts", label: "Começa com", hint: "Útil para prefixos que o banco repete, como “PIX ENVIADO”." },
  { id: "regex", label: "Expressão regular", hint: "Para quem já sabe o que é. Um erro aqui só desativa a regra, não quebra o app." },
];

function isRuleMatchType(t) {
  return RULE_MATCH_TYPES.some((m) => m.id === t);
}

// ------------------------------------------------------------------------------
// DICIONÁRIO DE FÁBRICA
// ------------------------------------------------------------------------------
// Cada regra tem id estável (o override do usuário aponta para ele), rótulo em
// português (a tela precisa mostrar algo legível) e `sample`: os termos que
// resumem a regra para quem não vai ler o Regex.
const BUILTIN_CATEGORY_RULES = [
  {
    id: "std-assinaturas", categoryId: "assinaturas", weight: 6,
    label: "Assinaturas e serviços digitais",
    sample: "netflix, spotify, prime video, icloud, adobe…",
    re: /\b(netflix|spotify|deezer|disney\+?|hbo|max\b|paramount|globoplay|prime ?video|amazon ?prime|youtube ?premium|icloud|google ?one|dropbox|office ?365|microsoft ?365|adobe|canva|chatgpt|openai|assinatura|mensalidade ?digital)\b/,
  },
  {
    id: "std-moradia", categoryId: "moradia", weight: 5,
    label: "Moradia e contas de casa",
    sample: "aluguel, condomínio, energia, água, internet…",
    re: /\b(aluguel|condominio|iptu|energia|eletric|enel|cemig|cpfl|copel|celesc|coelba|light|neoenergia|sabesp|copasa|cedae|caesb|sanepar|saneamento|agua|gas ?natural|comgas|internet|vivo|claro|tim|oi ?fibra|net ?claro)\b/,
  },
  {
    id: "std-mercado", categoryId: "mercado", weight: 5,
    label: "Supermercado e mercearia",
    sample: "supermercado, atacadão, assaí, hortifruti…",
    re: /\b(supermercado|mercado|atacadao|assai|carrefour|pao de acucar|extra|big ?bompreco|sendas|hortifruti|sacolao|acougue|mercearia|makro|tenda ?atacado|dia ?supermercado)\b/,
  },
  {
    id: "std-delivery", categoryId: "delivery", weight: 5,
    label: "Delivery de comida",
    sample: "ifood, rappi, uber eats, aiqfome…",
    re: /\b(ifood|rappi|uber ?eats|zedelivery|delivery ?much|aiqfome|99 ?food)\b/,
  },
  {
    id: "std-alimentacao", categoryId: "alimentacao", weight: 3,
    label: "Restaurantes e lanchonetes",
    sample: "restaurante, padaria, pizzaria, cafeteria…",
    re: /\b(restaurante|lanchonete|padaria|pizzaria|hamburgueria|churrascaria|cafeteria|starbucks|mc ?donalds|burger ?king|subway|habibs|bobs|outback|coco ?bambu|self ?service|marmita|bistro|sushi)\b/,
  },
  {
    id: "std-transporte", categoryId: "transporte", weight: 5,
    label: "Transporte e veículo",
    sample: "uber, posto, pedágio, IPVA, estacionamento…",
    re: /\b(uber|99 ?(app|pop|taxi)?|cabify|indriver|posto|ipiranga|shell|petrobras|br ?mania|gasolina|combustivel|etanol|alcool|diesel|estacionamento|zona ?azul|pedagio|sem ?parar|conectcar|veloe|metro|cptm|onibus|bilhete ?unico|passagem|rodoviaria|localiza|movida|unidas|detran|ipva|licenciamento|oficina|mecanica|pneu)\b/,
  },
  {
    id: "std-saude", categoryId: "saude", weight: 5,
    label: "Saúde e bem-estar",
    sample: "farmácia, clínica, plano de saúde, academia…",
    re: /\b(farmacia|drogaria|drogasil|raia|pacheco|pague ?menos|hospital|clinica|laboratorio|fleury|dasa|sabin|unimed|amil|bradesco ?saude|sulamerica|hapvida|notredame|plano ?de ?saude|dentista|odonto|psicolog|terapia|academia|smart ?fit|bluefit|gympass|totalpass)\b/,
  },
  {
    id: "std-educacao", categoryId: "educacao", weight: 5,
    label: "Educação e cursos",
    sample: "escola, faculdade, udemy, alura, livraria…",
    re: /\b(escola|colegio|faculdade|universidade|unip|estacio|anhanguera|senai|senac|curso|udemy|alura|coursera|rocketseat|hotmart|mensalidade ?escolar|material ?escolar|livraria|saraiva|amazon ?livros|kindle)\b/,
  },
  {
    id: "std-lazer", categoryId: "lazer", weight: 4,
    label: "Lazer, viagem e entretenimento",
    sample: "cinema, bar, steam, hotel, airbnb, passagem…",
    re: /\b(cinema|cinemark|kinoplex|uci|ingresso|ticket ?ma?ster|sympla|teatro|show|festival|bar|pub|boteco|balada|steam|playstation|psn|xbox|nintendo|epic ?games|riot|blizzard|viagem|hotel|pousada|airbnb|booking|decolar|latam|gol ?linhas|azul ?linhas|123 ?milhas|parque)\b/,
  },
  {
    id: "std-investimento", categoryId: "investimento", weight: 6,
    label: "Aplicações e investimentos",
    sample: "tesouro direto, CDB, resgate, previdência…",
    re: /\b(aplicacao|resgate|tesouro ?direto|cdb|lci|lca|fundo ?de ?investimento|xp ?investimentos|rico|clear|nuinvest|btg|previdencia)\b/,
  },
];

// Nome antigo mantido: import.js e o parser de linguagem natural o citam, e
// quebrar a referência por estética não paga o risco.
const CATEGORY_RULES = BUILTIN_CATEGORY_RULES;

// ------------------------------------------------------------------------------
// FORMA DO DADO
// ------------------------------------------------------------------------------
function defaultCategoryRules() {
  return { custom: [], builtin: {} };
}

function clampRuleWeight(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return RULE_WEIGHT_DEFAULT;
  return Math.max(RULE_WEIGHT_MIN, Math.min(RULE_WEIGHT_MAX, v));
}

// Saneia o que veio do disco ou de um backup. Regra sem padrão ou sem categoria
// é descartada: uma regra que não casa nada só ocuparia espaço na tela.
function normalizeCategoryRules(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const custom = (Array.isArray(src.custom) ? src.custom : [])
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const pattern = String(r.pattern == null ? "" : r.pattern).trim().slice(0, RULE_PATTERN_MAX);
      const rawCategoryId = String(r.categoryId == null ? "" : r.categoryId).trim();
      if (!pattern || !rawCategoryId) return null;
      const categoryId = typeof normalizeRecordId === "function"
        ? normalizeRecordId(rawCategoryId, "category")
        : (/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(rawCategoryId) ? rawCategoryId : "outros");
      const rawId = typeof r.id === "string" && r.id ? r.id : uid();
      const id = typeof normalizeRecordId === "function"
        ? normalizeRecordId(rawId, "rule")
        : (/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(rawId) ? rawId.slice(0, 40) : uid());
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        pattern,
        matchType: isRuleMatchType(r.matchType) ? r.matchType : "contains",
        categoryId,
        weight: clampRuleWeight(r.weight),
        enabled: r.enabled !== false,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : todayIso(),
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : todayIso(),
      };
    })
    .filter(Boolean)
    .slice(0, 200);

  const builtin = {};
  const overrides = src.builtin && typeof src.builtin === "object" ? src.builtin : {};
  BUILTIN_CATEGORY_RULES.forEach((rule) => {
    const o = overrides[rule.id];
    if (!o || typeof o !== "object") return;
    const enabled = o.enabled !== false;
    const rawCategoryId = typeof o.categoryId === "string" && o.categoryId ? o.categoryId : null;
    const categoryId = rawCategoryId && typeof normalizeRecordId === "function"
      ? normalizeRecordId(rawCategoryId, "category")
      : rawCategoryId;
    // Só gravamos a DIFERENÇA. Um override que devolve o padrão é ruído.
    if (enabled && (!categoryId || categoryId === rule.categoryId)) return;
    builtin[rule.id] = { enabled, categoryId: categoryId && categoryId !== rule.categoryId ? categoryId : null };
  });

  return { custom, builtin };
}

// União das regras de dois lados (usado pelo "mesclar" do restore de backup).
// Conflito de id resolve a favor do aparelho: quem está restaurando enxerga a
// própria lista na tela e não deveria vê-la mudar sem pedir. O que só existe no
// arquivo entra; o que existe nos dois fica como está aqui.
function mergeCategoryRules(currentRaw, incomingRaw) {
  const current = normalizeCategoryRules(currentRaw);
  const incoming = normalizeCategoryRules(incomingRaw);
  const byId = new Map();
  incoming.custom.forEach((r) => byId.set(r.id, r));
  current.custom.forEach((r) => byId.set(r.id, r));

  // Padrão idêntico vindo dos dois lados com ids diferentes viraria regra
  // duplicada silenciosa; o usuário veria a mesma linha duas vezes e não teria
  // como saber qual apagar.
  const seenPattern = new Set();
  const custom = Array.from(byId.values()).filter((r) => {
    const key = r.matchType + "|" + normalizeText(r.pattern) + "|" + r.categoryId;
    if (seenPattern.has(key)) return false;
    seenPattern.add(key);
    return true;
  });

  return normalizeCategoryRules({ custom, builtin: Object.assign({}, incoming.builtin, current.builtin) });
}

function makeCategoryRule(input) {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: (input && input.id) || uid(),
    pattern: String((input && input.pattern) || "").trim().slice(0, RULE_PATTERN_MAX),
    matchType: isRuleMatchType(input && input.matchType) ? input.matchType : "contains",
    categoryId: String((input && input.categoryId) || "").trim(),
    weight: clampRuleWeight(input && input.weight),
    enabled: !(input && input.enabled === false),
    createdAt: (input && input.createdAt) || now,
    updatedAt: now,
  };
}

// ------------------------------------------------------------------------------
// COMPILAÇÃO DO PADRÃO
// ------------------------------------------------------------------------------
// O texto comparado já passou por normalizeText (minúsculo, sem acento), então o
// padrão precisa passar pela MESMA normalização; do contrário "Padaria" nunca
// casaria com "padaria" e o usuário culparia o app, com razão.
//
// Um Regex inválido não derruba nada: devolve `{ ok:false, error }`. A tela usa
// isso para mostrar o problema na hora, e o motor simplesmente pula a regra.
function escapeForRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRulePattern(pattern, matchType) {
  const raw = String(pattern == null ? "" : pattern).trim();
  if (!raw) return { ok: false, re: null, error: "Escreva o texto que a regra deve procurar." };

  if (matchType === "regex") {
    try {
      // Sem normalizar: quem escreve Regex está no controle da própria sintaxe.
      // Só forçamos minúsculas, porque o texto comparado sempre chega assim.
      return { ok: true, re: new RegExp(raw.toLowerCase()), error: null };
    } catch (e) {
      return { ok: false, re: null, error: "Expressão regular inválida: " + (e && e.message ? e.message : "erro de sintaxe") };
    }
  }

  const norm = normalizeText(raw);
  if (!norm) return { ok: false, re: null, error: "Escreva o texto que a regra deve procurar." };
  const esc = escapeForRegex(norm);
  try {
    if (matchType === "starts") return { ok: true, re: new RegExp("^" + esc), error: null };
    if (matchType === "word") return { ok: true, re: new RegExp("(^|[^a-z0-9])" + esc + "([^a-z0-9]|$)"), error: null };
    return { ok: true, re: new RegExp(esc), error: null };
  } catch (e) {
    return { ok: false, re: null, error: "Não foi possível montar a regra com esse texto." };
  }
}

// ------------------------------------------------------------------------------
// MONTAGEM DA LISTA EFETIVA
// ------------------------------------------------------------------------------
// Devolve as regras que realmente valem AGORA, já com override aplicado, já
// compiladas e já filtradas por categoria existente. Uma regra que aponta para
// uma categoria apagada é mantida no dado (o usuário pode recriar a categoria)
// mas fica fora do motor; categorizar para um id fantasma é pior que não
// categorizar.
function compileCategoryRules(data) {
  const cfg = normalizeCategoryRules(data && data.categoryRules);
  const categories = (data && Array.isArray(data.categories)) ? data.categories : [];
  const has = (id) => categories.some((c) => c.id === id);
  const out = [];

  cfg.custom.forEach((r) => {
    if (!r.enabled) return;
    const c = compileRulePattern(r.pattern, r.matchType);
    if (!c.ok) return;
    if (categories.length > 0 && !has(r.categoryId)) return;
    out.push({ id: r.id, source: "custom", label: r.pattern, categoryId: r.categoryId, weight: r.weight, re: c.re });
  });

  BUILTIN_CATEGORY_RULES.forEach((rule) => {
    const o = cfg.builtin[rule.id];
    if (o && o.enabled === false) return;
    const categoryId = (o && o.categoryId) || rule.categoryId;
    out.push({ id: rule.id, source: "builtin", label: rule.label, categoryId, weight: rule.weight, re: rule.re });
  });

  return out;
}

// Vence o maior peso; empate vence a regra do usuário; empate ainda, a primeira.
// A ordem importa e é estável: a mesma descrição sempre cai na mesma categoria,
// senão a revisão do importador vira loteria.
function matchCategoryRules(compiled, normalizedText) {
  if (!normalizedText) return null;
  let best = null;
  for (const rule of compiled) {
    let hit = false;
    try { hit = rule.re.test(normalizedText); } catch (e) { hit = false; }
    if (!hit) continue;
    if (!best) { best = rule; continue; }
    if (rule.weight > best.weight) { best = rule; continue; }
    if (rule.weight === best.weight && rule.source === "custom" && best.source === "builtin") best = rule;
  }
  return best;
}

// ------------------------------------------------------------------------------
// APLICAR ÀS TRANSAÇÕES JÁ EXISTENTES
// ------------------------------------------------------------------------------
// Criar uma regra e ver o histórico continuar errado é a queixa óbvia. Mas
// recategorizar tudo em silêncio é pior: apagaria correções feitas à mão.
//
// O meio-termo: só mexemos em despesas que estão na categoria de sobra
// ("Outros"), ou seja, exatamente naquelas em que ninguém decidiu nada. E o
// resultado é sempre mostrado ANTES de gravar.
function previewRuleApplication(data, opts) {
  const options = opts || {};
  const onlyFallback = options.onlyFallback !== false;
  const fallbackId = (data.categories || []).some((c) => c.id === "outros") ? "outros" : null;
  const compiled = compileCategoryRules(data);
  const changes = [];

  (data.transactions || []).forEach((t) => {
    if (t.type !== "expense") return;
    if (onlyFallback && t.categoryId !== fallbackId) return;
    const best = matchCategoryRules(compiled, normalizeText(t.description || ""));
    if (!best || best.categoryId === t.categoryId) return;
    changes.push({ id: t.id, description: t.description, from: t.categoryId, to: best.categoryId, ruleId: best.id, ruleLabel: best.label });
  });

  const byCategory = {};
  changes.forEach((c) => { byCategory[c.to] = (byCategory[c.to] || 0) + 1; });
  return { changes, count: changes.length, byCategory, scanned: (data.transactions || []).filter((t) => t.type === "expense").length };
}

function applyRulesToTransactions(data, changes) {
  if (!changes || changes.length === 0) return data;
  const map = {};
  changes.forEach((c) => { map[c.id] = c.to; });
  const stamp = new Date().toISOString();
  return {
    ...data,
    transactions: data.transactions.map((t) => (
      map[t.id] ? { ...t, categoryId: map[t.id], updatedAt: stamp } : t
    )),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BUILTIN_CATEGORY_RULES, CATEGORY_RULES, RULE_MATCH_TYPES,
    RULE_WEIGHT_MIN, RULE_WEIGHT_MAX, RULE_WEIGHT_DEFAULT,
    defaultCategoryRules, normalizeCategoryRules, makeCategoryRule,
    compileRulePattern, compileCategoryRules, matchCategoryRules, mergeCategoryRules,
    previewRuleApplication, applyRulesToTransactions,
  };
}
