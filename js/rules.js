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
//
// O dicionário é grande de propósito. Extrato brasileiro não escreve
// "restaurante": escreve "PAG*BURGUERIABRASA", "IFD*IFOOD" ou "PIX ENVIADO CP
// PADARIA DO ZE". Cada nome que falta aqui é uma linha caindo em "Outros", e
// "Outros" é exatamente o trabalho manual que o aplicativo promete tirar da
// frente da pessoa todo mês.
//
// Duas armadilhas resolvidas com `(?!...)`, ambas vistas em extrato real:
//   - "mercado livre" e "mercado pago" NÃO são supermercado;
//   - "agua mineral" comprada no mercado não é conta de água.
const BUILTIN_CATEGORY_RULES = [
  {
    id: "std-assinaturas", categoryId: "assinaturas", weight: 6,
    label: "Assinaturas e serviços digitais",
    sample: "netflix, spotify, prime video, icloud, adobe…",
    re: /\b(netflix|spotify|deezer|tidal|disney\+?|star ?\+|hbo|hbomax|max\b|paramount|globoplay|premiere|telecine|looke|mubi|crunchyroll|prime ?video|amazon ?prime|youtube ?premium|apple ?tv|apple ?music|apple\.com|itunes|icloud|google ?one|google ?storage|dropbox|onedrive|office ?365|microsoft ?365|adobe|canva|chatgpt|openai|midjourney|notion|evernote|linkedin ?premium|tinder|bumble|kindle ?unlimited|audible|skeelo|scribd|patreon|nordvpn|expressvpn|1password|github|figma|assinatura|mensalidade ?digital)\b/,
  },
  {
    id: "std-moradia", categoryId: "moradia", weight: 5,
    label: "Moradia e contas de casa",
    sample: "aluguel, condomínio, energia, água, internet…",
    re: /\b(aluguel|imobiliaria|condominio|iptu|energia|eletropaulo|enel|cemig|cpfl|copel|celesc|coelba|cosern|celpe|elektro|edp ?(?:sp|es|br)?|light|neoenergia|equatorial|energisa|ceee|sabesp|copasa|cedae|caesb|sanepar|corsan|embasa|casan|cagece|compesa|saae|saneamento|agua(?! ?(?:mineral|com|sem|de coco))|gas ?natural|comgas|ultragaz|liquigas|copagaz|supergasbras|nacional ?gas|internet|banda ?larga|vivo|claro|tim|oi ?fibra|nextel|sky|net ?claro|algar|brisanet|unifique|sumicity|seguro ?residencial|leroy ?merlin|telha ?norte|material ?de ?construcao)\b/,
  },
  {
    id: "std-mercado", categoryId: "mercado", weight: 5,
    label: "Supermercado e mercearia",
    sample: "supermercado, atacadão, assaí, hortifruti…",
    re: /\b(super ?mercado|hipermercado|mercadinho|minimercado|mercearia|mercado(?! ?(?:livre|pago|bitcoin|libre))|atacadao|atacarejo|assai|makro|tenda ?atacado|fort ?atacadista|sams? ?club|carrefour|pao de acucar|extra ?(?:hiper|super)|big ?bompreco|bompreco|sendas|prezunic|guanabara|zona ?sul|angeloni|condor|muffato|savegnago|st ?marche|oba ?hortifruti|natural ?da ?terra|verdemar|bh ?supermercados|super ?nosso|comper|bistek|nordestao|dia ?supermercado|hortifruti|sacolao|quitanda|feira ?livre|acougue|casa ?de ?carnes|peixaria|padoca|supermerc|merc)\b/,
  },
  {
    id: "std-delivery", categoryId: "delivery", weight: 5,
    label: "Delivery de comida",
    sample: "ifood, rappi, uber eats, aiqfome…",
    re: /\b(ifood|i ?food|rappi|uber ?eats|ubereats|ze ?delivery|zedelivery|delivery ?much|aiqfome|99 ?food|james ?delivery|goomer|anota ?ai|daki)\b/,
  },
  {
    id: "std-alimentacao", categoryId: "alimentacao", weight: 3,
    label: "Restaurantes e lanchonetes",
    sample: "restaurante, padaria, pizzaria, cafeteria…",
    re: /\b(restaurante|lanchonete|lancheria|padaria|panificadora|panificacao|confeitaria|doceria|pizzaria|hamburgueria|burgueria|churrascaria|espetinho|pastelaria|cafeteria|cafe\b|starbucks|the ?coffee|mc ?donalds|burger ?king|subway|habibs|bobs|outback|coco ?bambu|giraffas|spoleto|china ?in ?box|dominos|pizza ?hut|madero|jeronimo|patroni|divino ?fogao|sushi|temaki|yakisoba|acai|sorveteria|kopenhagen|cacau ?show|brasil ?cacau|self ?service|marmita|marmitex|bistro|rotisserie|buffet|food ?truck|quiosque)\b/,
  },
  {
    id: "std-transporte", categoryId: "transporte", weight: 5,
    label: "Transporte e veículo",
    sample: "uber, posto, pedágio, IPVA, estacionamento…",
    re: /\b(uber(?! ?eats)|99 ?(?:app|pop|taxi)?|cabify|indriver|blablacar|buser|clickbus|taxi|posto|ipiranga|shell|petrobras|br ?mania|ale ?combustiveis|texaco|gasolina|combustivel|etanol|alcool|diesel|gnv|estacionamento|estapar|zona ?azul|pedagio|sem ?parar|conectcar|veloe|move ?mais|taggy|metro|cptm|supervia|brt|onibus|bilhete ?unico|passagem|rodoviaria|localiza|movida|unidas|detran|ipva|licenciamento|dpvat|oficina|mecanica|auto ?center|centro ?automotivo|pneu|borracharia|lava ?rapido|lava ?jato|retifica)\b/,
  },
  {
    id: "std-saude", categoryId: "saude", weight: 5,
    label: "Saúde e bem-estar",
    sample: "farmácia, clínica, plano de saúde, academia…",
    re: /\b(farmacia|drogaria|drogasil|droga ?raia|raia|pacheco|pague ?menos|nissei|panvel|araujo|extrafarma|ultrafarma|hospital|clinica|laboratorio|fleury|dasa|delboni|sabin|hermes ?pardini|unimed|amil|bradesco ?saude|sulamerica|hapvida|notredame|prevent ?senior|golden ?cross|plano ?de ?saude|dentista|odonto|orthodontic|psicolog|psiquiatra|terapia|fisioterapia|nutricionista|academia|smart ?fit|bluefit|selfit|panobianco|bodytech|bio ?ritmo|gympass|totalpass|wellhub|crossfit|pilates|otica|oculos|vacina)\b/,
  },
  {
    id: "std-educacao", categoryId: "educacao", weight: 5,
    label: "Educação e cursos",
    sample: "escola, faculdade, udemy, alura, livraria…",
    re: /\b(escola|colegio|faculdade|universidade|unip|estacio|anhanguera|uninove|unopar|fgv|senai|senac|sesi|kumon|wizard|ccaa|fisk|cultura ?inglesa|cna|curso|udemy|alura|coursera|rocketseat|origamid|hotmart|kiwify|eduzz|braip|mensalidade ?escolar|material ?escolar|papelaria|kalunga|livraria|saraiva|amazon ?livros|kindle)\b/,
  },
  {
    id: "std-lazer", categoryId: "lazer", weight: 4,
    label: "Lazer, viagem e entretenimento",
    sample: "cinema, bar, steam, hotel, airbnb, passagem…",
    re: /\b(cinema|cinemark|kinoplex|uci|cinepolis|ingresso|ticket ?ma?ster|sympla|eventim|teatro|show|festival|bar|pub|boteco|adega|distribuidora ?de ?bebidas|balada|steam|playstation|psn|xbox|nintendo|epic ?games|riot|blizzard|battle ?net|garena|free ?fire|roblox|twitch|viagem|hotel|pousada|hostel|airbnb|booking|decolar|latam|gol ?linhas|azul ?linhas|voepass|123 ?milhas|maxmilhas|cvc|hurb|parque|beto ?carrero|hopi ?hari|zoologico|museu|boliche|paintball|kart)\b/,
  },
  {
    id: "std-compras", categoryId: "outros", weight: 5,
    label: "Compras e varejo",
    sample: "mercado livre, shopee, magalu, renner…",
    re: /\b(mercado ?livre|mercadolivre|mercado ?pago|mercadopago|shopee|aliexpress|shein|temu|magazine ?luiza|magalu|americanas|submarino|casas ?bahia|ponto ?frio|kabum|pichau|terabyte|renner|riachuelo|marisa|zara|hering|centauro|netshoes|decathlon|zattini|dafiti|amaro)\b/,
  },
  {
    id: "std-tarifas", categoryId: "outros", weight: 6,
    label: "Tarifas, juros e encargos do banco",
    sample: "tarifa, anuidade, IOF, juros, multa por atraso…",
    re: /\b(tarifa|cesta ?de ?servicos|manutencao ?de ?conta|anuidade|iof|juros|encargos|multa ?por|mora|credito ?rotativo|rotativo ?(?:do|da)|parcelamento ?de ?fatura|saldo ?parcelado|taxa ?de ?saque|seguro ?fatura|protecao ?(?:de|da) ?fatura)\b/,
  },
  {
    id: "std-investimento", categoryId: "investimento", weight: 6,
    label: "Aplicações e investimentos",
    sample: "tesouro direto, CDB, resgate, previdência…",
    re: /\b(aplicacao|resgate|tesouro ?direto|cdb|lci|lca|fundo ?de ?investimento|xp ?investimentos|rico ?investimentos|clear ?corretora|nuinvest|easynvest|btg|toro ?investimentos|genial ?investimentos|avenue|binance|mercado ?bitcoin|foxbit|novadax|coinbase|previdencia|pgbl|vgbl|aporte)\b/,
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
// O QUE A LINHA É, ANTES DE QUAL CATEGORIA ELA TEM
// ------------------------------------------------------------------------------
// Fatura de cartão não é extrato de conta, e tratar as duas como a mesma lista
// de "entradas e saídas" produz um erro caro: na fatura do Nubank, o pagamento
// que você fez no mês passado aparece como CRÉDITO, com a descrição "Pagamento
// recebido". Lido como número positivo, o aplicativo registra receita; o mês
// fecha com uma entrada que nunca existiu, o saldo mente, a taxa de poupança
// mente e o Score sobe por causa de uma dívida paga.
//
// A mesma fatura traz "Valor pendente do mês anterior", que é o saldo rolado:
// aquele gasto já foi contado no mês em que aconteceu, e importar de novo
// cobraria a pessoa duas vezes pela mesma compra.
//
// Nenhuma das duas linhas é lixo (elas explicam a fatura), então o motor não as
// esconde: ele as MARCA, a tela de revisão desmarca por padrão e escreve o
// porquê. Quem discordar tem uma caixa de seleção do lado.
const STATEMENT_ROW_ROLES = [
  {
    id: "card-payment",
    // Só no crédito. No extrato da CONTA, "pagamento de fatura" é dinheiro
    // saindo de verdade e precisa continuar entrando como saída.
    appliesTo: "income",
    label: "Pagamento de fatura",
    detail: "É a fatura do mês passado sendo paga, não dinheiro entrando.",
    re: /\bpagamento (?:recebido|de fatura|da fatura|fatura|efetuado|realizado)\b|\bpag(?:to|amento)? ?(?:de )?fatura\b|\bfatura paga\b|\bcredito de pagamento\b|\bpagamento em \d{2}\/\d{2}\b/,
  },
  {
    id: "carryover",
    appliesTo: "any",
    label: "Saldo da fatura anterior",
    detail: "Gasto do mês passado sendo rolado; já foi contado quando aconteceu.",
    re: /\bvalor pendente do mes anterior\b|\bsaldo (?:restante|anterior|em aberto|remanescente)(?: da fatura)?\b|\b(?:total|saldo) da fatura anterior\b|\bfatura anterior\b|\bdivida do mes anterior\b|\bsaldo em atraso\b/,
  },
];

// Devolve o papel da linha (ou null). `skip` é a recomendação de não importar;
// a decisão final é sempre da pessoa, na tela de revisão.
function classifyStatementRow(description, type) {
  const text = normalizeText(description);
  if (!text) return null;
  for (const role of STATEMENT_ROW_ROLES) {
    if (role.appliesTo !== "any" && role.appliesTo !== type) continue;
    let hit = false;
    try { hit = role.re.test(text); } catch (e) { hit = false; }
    if (hit) return { id: role.id, label: role.label, detail: role.detail, skip: true };
  }
  return null;
}

// ------------------------------------------------------------------------------
// NOME DO ESTABELECIMENTO DENTRO DO RUÍDO DO BANCO
// ------------------------------------------------------------------------------
// O banco não escreve "Padaria do Zé": escreve "COMPRA CARTAO 5678 PAG*PADARIA
// DO ZE 12/08 SAO PAULO BR". Duas linhas do mesmo lugar quase nunca chegam
// iguais, porque a data, a maquininha e a cidade mudam.
//
// Esta função extrai o miolo: tira o verbo do banco, o prefixo da maquininha,
// a máscara do cartão, a parcela, a data e a UF do fim. É o que permite dizer
// "isto é o mesmo estabelecimento de novembro" e reaproveitar a categoria que a
// pessoa escolheu naquela vez.
const STATEMENT_VERB_RE = /^(?:compra(?: com)?(?: cartao| debito| credito| aprovada)?|pagamento(?: de)?|pagto|pgto|pag|debito automatico|deb aut|dda|saque|transferencia(?: enviada| recebida)?|transf|ted|doc|pix(?: enviado| recebido| qrs| qr| cp)?|cip|recebimento|credito em conta|deposito|boleto|liquidacao|compras)\b[\s:-]*/;
// A maquininha aparece grudada no nome ("PAG*PADARIA", "IFD*IFOOD") e nem
// sempre no começo: o banco costuma pôr a máscara do cartão antes dela.
const STATEMENT_MACHINE_RE = /\b[a-z0-9]{2,6}\*\s?/g;
const STATEMENT_CARD_MASK_RE = /^\d{3,6}\b/;
// Siglas que todo extrato repete e que nunca são o nome do estabelecimento.
const STATEMENT_STOPWORD_RE = /\b(?:cp|cnpj|cpf|ltda|epp|eireli|me|sa|br|bra|ec|com|comercio de|servicos de)\b/g;
const STATEMENT_TAIL_RE = [
  /\*{2,}\s?\d+/g,                                   // máscara do cartão
  /\bfinal\s+\d{3,6}\b/g,
  /\bcartao\s+\d{3,6}\b/g,
  /\bparcela\s+\d{1,2}\s?\/\s?\d{1,2}\b/g,
  /\b\d{1,2}\s?\/\s?\d{1,2}(?:\s?\/\s?\d{2,4})?\b/g, // parcela ou data solta
  /\bref\.?\s?\d+\b/g,
  /\b\d{6,}\b/g,                                     // identificadores longos
];
const STATEMENT_UF_RE = /\s(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|br|bra)$/;

function statementMerchantCore(description) {
  let text = normalizeText(description);
  if (!text) return "";
  // Os verbos empilham ("PAGAMENTO PIX ENVIADO ..."); por isso o laço.
  for (let i = 0; i < 3; i++) {
    const stripped = text.replace(STATEMENT_VERB_RE, "").replace(STATEMENT_CARD_MASK_RE, "").trim();
    if (stripped === text) break;
    text = stripped;
  }
  text = text.replace(STATEMENT_MACHINE_RE, " ").replace(STATEMENT_STOPWORD_RE, " ");
  STATEMENT_TAIL_RE.forEach((re) => { text = text.replace(re, " "); });
  text = text.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) text = text.replace(STATEMENT_UF_RE, "").trim();
  // Sobrou nada (a linha era só verbo e número): devolve o texto original
  // normalizado, que ao menos é estável para comparar com ele mesmo.
  return text || normalizeText(description);
}

// ------------------------------------------------------------------------------
// MEMÓRIA: O QUE A PESSOA JÁ CLASSIFICOU À MÃO
// ------------------------------------------------------------------------------
// O dicionário de fábrica sabe de marcas nacionais. Ele nunca vai saber que
// "MERC BOM JESUS" é o mercado da esquina de quem mora ali. Mas o histórico
// sabe: a pessoa já corrigiu essa linha uma vez.
//
// A memória vale mais quando a categoria foi ESCOLHIDA (lançamento manual ou
// categoria editada depois) do que quando ela mesma foi um palpite do
// aplicativo; senão o motor só repetiria o próprio erro com mais confiança.
// Por isso o voto manual pesa 4 e o automático pesa 1.
//
// O índice é construído uma vez por versão dos dados. `setData` sempre cria um
// array novo de transações, então o WeakMap invalida sozinho quando algo muda,
// e uma importação de 300 linhas não varre o histórico 300 vezes.
const __CATEGORY_MEMORY_CACHE = typeof WeakMap === "function" ? new WeakMap() : null;
const CATEGORY_MEMORY_MIN_CORE = 4;

function transactionCategoryChosenByUser(t) {
  if (!t) return false;
  if (t.source === "manual" || t.source === "nlp") return true;
  return (Array.isArray(t.changeLog) ? t.changeLog : []).some((entry) => (
    entry && entry.action === "edited" && Array.isArray(entry.fields) && entry.fields.includes("categoryId")
  ));
}

function buildCategoryMemory(transactions) {
  const memory = new Map();
  (Array.isArray(transactions) ? transactions : []).forEach((t) => {
    if (!t || t.type !== "expense") return;
    const categoryId = t.categoryId;
    if (!categoryId || categoryId === "outros") return;
    const core = statementMerchantCore(t.description);
    if (core.length < CATEGORY_MEMORY_MIN_CORE) return;
    const manual = transactionCategoryChosenByUser(t);
    const votes = memory.get(core) || new Map();
    const vote = votes.get(categoryId) || { weight: 0, manual: false, count: 0 };
    vote.weight += manual ? 4 : 1;
    vote.count += 1;
    vote.manual = vote.manual || manual;
    votes.set(categoryId, vote);
    memory.set(core, votes);
  });
  return memory;
}

function categoryMemoryOf(data) {
  const transactions = data && Array.isArray(data.transactions) ? data.transactions : null;
  if (!transactions) return null;
  if (!__CATEGORY_MEMORY_CACHE) return buildCategoryMemory(transactions);
  const cached = __CATEGORY_MEMORY_CACHE.get(transactions);
  if (cached) return cached;
  const memory = buildCategoryMemory(transactions);
  __CATEGORY_MEMORY_CACHE.set(transactions, memory);
  return memory;
}

// Devolve { categoryId, manual, count } do estabelecimento, ou null. Empate
// entre duas categorias devolve a de maior peso; empate real devolve null, que
// é melhor do que escolher no par ou ímpar.
function recallCategoryFromMemory(data, description) {
  const memory = categoryMemoryOf(data);
  if (!memory || memory.size === 0) return null;
  const core = statementMerchantCore(description);
  if (core.length < CATEGORY_MEMORY_MIN_CORE) return null;
  const votes = memory.get(core);
  if (!votes) return null;
  let best = null;
  let tie = false;
  votes.forEach((vote, categoryId) => {
    if (!best || vote.weight > best.weight) { best = { categoryId, ...vote }; tie = false; return; }
    if (vote.weight === best.weight) tie = true;
  });
  if (!best || tie) return null;
  const categories = (data && Array.isArray(data.categories)) ? data.categories : [];
  if (categories.length && !categories.some((c) => c.id === best.categoryId)) return null;
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
    STATEMENT_ROW_ROLES, classifyStatementRow, statementMerchantCore,
    buildCategoryMemory, recallCategoryFromMemory, transactionCategoryChosenByUser,
  };
}
