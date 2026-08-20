// netlify/functions/analyze.js
// ------------------------------------------------------------------------------
// Proxy seguro entre o PWA e a LLM.
//
//  • A chave da API vive SÓ aqui (variável de ambiente do Netlify); nunca no bundle.
//  • O payload recebido já chega REDUZIDO pelo js/insights.js (agregados
//    numéricos, nomes de categoria e nomes de meta). Reduzido não é anônimo:
//    nome de categoria e de meta podem revelar contexto pessoal, e a política
//    diz isso ao usuário. Ainda assim, esta função aplica uma "faxina"
//    defensiva: descarta qualquer campo fora do schema esperado e trunca
//    strings, para que descrições de lançamento jamais vazem por engano.
//  • A resposta é sempre JSON estruturado ({ analise: {...} }), validado antes
//    de voltar ao cliente.
//  • Toda chamada exige SESSÃO válida (ver "Controle de acesso" abaixo).
// ------------------------------------------------------------------------------

const api = require("./_shared/supabase-rest");
const { requireSession } = require("./account");
const rateLimit = require("./_shared/rate-limit");

const MODEL = process.env.ANALYZE_MODEL || "claude-haiku-4-5-20251001";
const MAX_CATEGORIES = 24;
const MAX_GOALS = 12;
const UPSTREAM_TIMEOUT_MS = 25000;

// ------------------------------------------------------------------------------
// Controle de acesso
// ------------------------------------------------------------------------------
// Esta função guarda uma chave de API paga: quem alcança o endpoint gasta o
// crédito do dono do site. São três camadas, da mais fraca para a mais forte:
//
//  1. Allowlist de `Origin`. Impede que outro site chame a função pelo
//     navegador do visitante. NÃO vale contra `curl`, onde `Origin` é só mais
//     um cabeçalho que o atacante escolhe. Fica como defesa em profundidade.
//  2. SESSÃO obrigatória (`requireSession`), igual ao que o sync.js já fazia.
//     É esta camada que realmente fecha o endpoint: sem cookie de sessão
//     válido e sem dispositivo reconhecido, a requisição morre antes de tocar
//     na chave da Anthropic.
//  3. Teto de requisições por CONTA (não por IP). O IP era contornável por
//     qualquer botnet doméstica e, pior, o teto em memória é por instância
//     da função, então na prática valia "20 × instâncias quentes". Com a
//     sessão obrigatória, a identidade estável passa a ser o `user.id`.
//
// Consequência deliberada: se o backend de contas NÃO estiver configurado, a
// função recusa TUDO em vez de liberar tudo. Um endpoint pago sem forma de
// autenticar o chamador é um endpoint aberto, e falhar fechado é a única
// resposta defensável. Ver docs/BACKEND_SETUP.md.
//
// `ALLOWED_ORIGIN` aceita lista separada por vírgula (produção + previews do
// Netlify + localhost). Sem configuração, aceitamos somente a origem que
// corresponde ao próprio host da função.
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function resolveOrigin(event) {
  const headers = (event && event.headers) || {};
  const origin = String(headers.origin || headers.Origin || "").trim().replace(/\/+$/, "");
  const forwardedHost = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  const forwardedProto = String(headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(forwardedHost);
  const siteOrigin = forwardedHost
    ? `${forwardedProto || (localHost ? "http" : "https")}://${forwardedHost}`.replace(/\/+$/, "")
    : "";
  const allowedOrigins = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : (siteOrigin ? [siteOrigin] : []);
  if (!origin) return { allowed: false, value: allowedOrigins[0] || siteOrigin || "null" };
  return { allowed: allowedOrigins.indexOf(origin) !== -1, value: origin };
}

function corsHeaders(originValue) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": originValue,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

// Compatibilidade: as funções internas continuam usando `json(...)` com o
// cabeçalho padrão; o handler reescreve o Origin da resposta no final.
const CORS = corsHeaders(ALLOWED_ORIGINS[0] || "*");

const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

// ---- Teto de requisições por conta ----
// Janela deslizante em memória. A instância da função é efêmera e pode haver
// várias em paralelo, então isto NÃO é um limite exato; é o que barra o abuso
// trivial (script raspando o endpoint com uma conta válida) sem depender de
// banco externo. Um teto global por instância cobre o caso de várias contas
// coordenadas. O limite forte contra anônimo é a sessão, não este contador.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_PER_USER = Number(process.env.RATE_LIMIT_PER_USER) || Number(process.env.RATE_LIMIT_PER_IP) || 20;
const RATE_GLOBAL = Number(process.env.RATE_LIMIT_GLOBAL) || 300;
const MAX_BODY_BYTES = 64 * 1024;

const hits = new Map();   // userId -> array de timestamps
let globalHits = [];

function pruneHits(list, now) {
  let i = 0;
  while (i < list.length && now - list[i] > RATE_WINDOW_MS) i++;
  return i === 0 ? list : list.slice(i);
}

function rateLimited(identity) {
  const now = Date.now();
  globalHits = pruneHits(globalHits, now);
  if (globalHits.length >= RATE_GLOBAL) return { limited: true, retryAfter: 60 };

  const key = String(identity || "desconhecido");
  const list = pruneHits(hits.get(key) || [], now);
  if (list.length >= RATE_PER_USER) {
    hits.set(key, list);
    return { limited: true, retryAfter: Math.ceil((RATE_WINDOW_MS - (now - list[0])) / 1000) };
  }

  list.push(now);
  hits.set(key, list);
  globalHits.push(now);

  // O Map não pode crescer sem fim numa instância de vida longa.

  if (hits.size > 5000) {
    hits.forEach((v, k) => { if (pruneHits(v, now).length === 0) hits.delete(k); });
  }
  return { limited: false };
}

// ---------- Sanitização defensiva do payload ----------
const num = (v, max = 1e12) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-max, Math.min(max, Math.round(n * 100) / 100));
};
const str = (v, len = 40) => String(v == null ? "" : v).replace(/[\u0000-\u001F<>]/g, "").slice(0, len);

function sanitizePayload(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    mes: str(p.mes, 30),
    moeda: "BRL",
    rendaMensal: num(p.rendaMensal),
    gastosFixos: num(p.gastosFixos),
    gastosVariaveis: num(p.gastosVariaveis != null ? p.gastosVariaveis : p.gastosEsporadicos),
    saldoAtual: num(p.saldoAtual),
    taxaPoupanca: num(p.taxaPoupanca),
    comprometimentoCredito: num(p.comprometimentoCredito),
    parcelasFuturas: num(p.parcelasFuturas),
    regraOrcamento: {
      necessidades: num(p.regraOrcamento && p.regraOrcamento.necessidades),
      desejos: num(p.regraOrcamento && p.regraOrcamento.desejos),
      futuro: num(p.regraOrcamento && p.regraOrcamento.futuro),
    },
    historico: Array.isArray(p.historico)
      ? p.historico.slice(0, 12).map((h) => ({ mes: str(h && h.mes, 10), entradas: num(h && h.entradas), saidas: num(h && h.saidas) }))
      : [],
    categorias: Array.isArray(p.categorias)
      ? p.categorias.slice(0, MAX_CATEGORIES).map((c) => ({
          nome: str(c && c.nome, 40),
          grupo: str(c && c.grupo, 20),
          gasto: num(c && c.gasto),
          orcamento: c && c.orcamento != null ? num(c.orcamento) : null,
        }))
      : [],
    metas: Array.isArray(p.metas)
      ? p.metas.slice(0, MAX_GOALS).map((m) => ({ nome: str(m && m.nome, 40), atual: num(m && m.atual), meta: num(m && m.meta) }))
      : [],
  };
}

// ==============================================================================
// MODO "lancamento" (Feature 4); interpretação de frase em linguagem natural
// ==============================================================================
// Só entra em cena quando o parser LOCAL (js/nlp.js) fica em dúvida. O que sai
// do navegador aqui é mínimo: a frase digitada e a lista de NOMES de categoria.
// Nenhum valor de saldo, nenhum histórico, nenhum outro lançamento.
function sanitizeEntryRequest(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const cats = Array.isArray(p.categorias) ? p.categorias.slice(0, 40) : [];
  return {
    texto: str(p.texto, 240),
    hoje: /^\d{4}-\d{2}-\d{2}$/.test(String(p.hoje || "")) ? String(p.hoje) : new Date().toISOString().slice(0, 10),
    categorias: cats.map((c) => ({ id: str(c && c.id, 40), nome: str(c && c.nome, 40) })).filter((c) => c.id),
  };
}

function buildEntryPrompt(d) {
  const lista = d.categorias.map((c) => `${c.id} = ${c.nome}`).join("\n");
  return `Converta a frase de um usuário brasileiro em um lançamento financeiro estruturado.

Hoje é ${d.hoje} (formato AAAA-MM-DD).

Categorias disponíveis (use SOMENTE um destes ids):
${lista}

Frase: "${d.texto}"

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown e sem texto ao redor:

{
  "tipo": "expense|income",
  "valor": 0,
  "categoriaId": "id exatamente como na lista",
  "data": "AAAA-MM-DD",
  "pagamento": "Pix|Dinheiro|Débito|Crédito|Outro",
  "descricao": "estabelecimento ou motivo, curto",
  "recorrente": false,
  "parcelas": 1,
  "confianca": 0.0
}

Regras:
- "valor" é um número em reais (use ponto decimal). Se a frase não tiver valor, use 0.
- "data" nunca pode ser futura, exceto se a frase disser explicitamente uma data futura.
- "parcelas" entre 1 e 48. Se houver parcelas, "pagamento" deve ser "Crédito".
- "confianca" de 0 a 1 indicando o quanto você tem certeza da interpretação.
- Para receitas, use "outros" como categoriaId.`;
}

function normalizeEntry(a, ctx) {
  const validIds = new Set(ctx.categorias.map((c) => c.id));
  const pagamentos = ["Pix", "Dinheiro", "Débito", "Crédito", "Outro"];
  const parcelas = Math.max(1, Math.min(48, Math.round(Number(a.parcelas) || 1)));
  const tipo = a.tipo === "income" ? "income" : "expense";
  let categoriaId = str(a.categoriaId, 40);
  if (!validIds.has(categoriaId)) categoriaId = validIds.has("outros") ? "outros" : (ctx.categorias[0] || {}).id || "outros";
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(a.data || "")) ? String(a.data) : ctx.hoje;
  let pagamento = pagamentos.includes(a.pagamento) ? a.pagamento : "Outro";
  if (parcelas > 1) pagamento = "Crédito";
  return {
    tipo,
    valor: Math.max(0, num(a.valor, 1e9)),
    categoriaId: tipo === "income" ? "outros" : categoriaId,
    data,
    pagamento,
    descricao: str(a.descricao, 60),
    recorrente: !!a.recorrente,
    parcelas,
    confianca: Math.max(0, Math.min(1, Number(a.confianca) || 0.5)),
  };
}

// ---------- Prompt ----------
function buildPrompt(d) {
  return `Você é um consultor financeiro pessoal brasileiro, direto e prático, especializado em orçamento doméstico (métodos 50/30/20 e orçamento base zero).

Analise os dados AGREGADOS e ANÔNIMOS abaixo (todos os valores em reais):

${JSON.stringify(d, null, 2)}

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem crases, sem texto antes ou depois, exatamente neste formato:

{
  "diagnostico": "uma frase resumindo a situação financeira do mês",
  "fluxoCaixa": {
    "situacao": "positivo|equilibrado|negativo",
    "sobraEstimada": 0,
    "comentario": "uma frase interpretando o fluxo de caixa e a tendência do histórico"
  },
  "riscos": [
    { "titulo": "curto", "nivel": "alto|medio|baixo", "descricao": "uma frase explicando o risco e o valor envolvido" }
  ],
  "recomendacoes": [
    { "acao": "ação concreta e realista", "impacto": "o ganho estimado por mês, em reais quando fizer sentido" }
  ],
  "metasComentario": "uma frase sobre o progresso das metas, ou string vazia se não houver metas"
}

Regras:
- NÃO devolva nota, score ou pontuação. A nota de saúde financeira é calculada
  pelo aplicativo a partir de regras auditáveis; um número gerado aqui competiria
  com ela e não teria como ser explicado ao usuário.
- Em "riscos", inclua APENAS o que os números sustentam. Se não houver risco
  aparente, devolva uma lista vazia. Não invente preocupação para preencher
  espaço: alarme sem base destrói a confiança no que é alarme de verdade.
- Em "recomendacoes", no máximo 4, e só o que couber nos dados enviados.
- Português do Brasil, tom direto, sem jargão, sem asteriscos.
- Interprete os números (não os repita literalmente).
- Se faltar dado para alguma seção, diga que falta dado em vez de estimar.`;
}

// ---------- Extração/validação da resposta ----------
function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (e) { return null; }
}

function normalizeAnalysis(a) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  // O `score` do modelo é DESCARTADO aqui, mesmo que ele insista em enviá-lo.
  // O aplicativo tem uma nota própria, calculada por regras auditáveis e
  // explicáveis pilar a pilar (js/score.js). Duas notas diferentes na mesma
  // tela, uma delas sem como ser justificada, é pior do que nota nenhuma.
  return {
    diagnostico: str(a.diagnostico, 400),
    fluxoCaixa: {
      situacao: ["positivo", "equilibrado", "negativo"].includes(a.fluxoCaixa && a.fluxoCaixa.situacao) ? a.fluxoCaixa.situacao : "equilibrado",
      sobraEstimada: num(a.fluxoCaixa && a.fluxoCaixa.sobraEstimada),
      comentario: str(a.fluxoCaixa && a.fluxoCaixa.comentario, 400),
    },
    riscos: arr(a.riscos).slice(0, 5).map((r) => ({
      titulo: str(r && r.titulo, 80),
      nivel: ["alto", "medio", "baixo"].includes(r && r.nivel) ? r.nivel : "medio",
      descricao: str(r && r.descricao, 400),
    })).filter((r) => r.titulo || r.descricao),
    recomendacoes: arr(a.recomendacoes).slice(0, 5).map((r) => ({
      acao: str(r && r.acao, 200),
      impacto: str(r && r.impacto, 200),
    })).filter((r) => r.acao),
    metasComentario: str(a.metasComentario, 400),
  };
}

// Texto simples equivalente; mantém compatibilidade com telas que só exibem prosa.

function toPlainText(a) {
  const linhas = [];
  if (a.diagnostico) linhas.push(a.diagnostico);
  if (a.fluxoCaixa && a.fluxoCaixa.comentario) linhas.push(a.fluxoCaixa.comentario);
  a.riscos.forEach((r) => linhas.push(`${r.titulo}: ${r.descricao}`));
  a.recomendacoes.forEach((r) => linhas.push(`${r.acao}${r.impacto ? ` (${r.impacto})` : ""}`));
  if (a.metasComentario) linhas.push(a.metasComentario);
  return linhas.join("\n");
}

// Handler do modo "lancamento": prompt curto, resposta curta, timeout curto.

async function handleEntryParse(payload, apiKey) {
  const ctx = sanitizeEntryRequest(payload);
  if (!ctx.texto.trim()) return json(422, { error: "Frase vazia.", code: "NOT_ENOUGH_DATA" });
  if (ctx.categorias.length === 0) return json(422, { error: "Nenhuma categoria enviada.", code: "NOT_ENOUGH_DATA" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        system: "Você responde sempre e somente com JSON válido, sem markdown e sem comentários.",
        messages: [{ role: "user", content: buildEntryPrompt(ctx) }],
      }),
    });
    if (!res.ok) {
      const code = res.status === 429 ? "RATE_LIMIT" : res.status === 401 ? "BAD_KEY" : "UPSTREAM_ERROR";
      return json(502, { error: "A IA não respondeu corretamente.", code });
    }
    const body = await res.json();
    const text = (body.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
    const parsed = extractJson(text);
    if (!parsed) return json(422, { error: "Não consegui entender essa frase.", code: "BAD_RESPONSE" });
    return json(200, { ok: true, lancamento: normalizeEntry(parsed, ctx), modelo: MODEL });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return json(aborted ? 504 : 500, {
      error: aborted ? "Demorou demais para responder." : "Falha ao conectar à IA.",
      code: aborted ? "TIMEOUT" : "NETWORK",
    });
  } finally {
    clearTimeout(timer);
  }
}

// Traduz a falha de sessão para o vocabulário de erros que o js/insights.js já
// entende, sem vazar detalhe do backend de contas para o cliente.
function sessionFailure(error) {
  const code = error && error.code;
  if (code === "not_configured") {
    return json(503, { error: "As análises com IA exigem uma conta, e o backend de contas não está configurado neste site.", code: "ACCOUNT_UNAVAILABLE" });
  }
  if (code === "invalid_device") {
    return json(400, { error: "Este dispositivo não foi identificado corretamente.", code: "DEVICE_INVALID" });
  }
  if (code === "device_revoked" || code === "device_unknown") {
    return json(403, { error: "Este dispositivo teve o acesso revogado. Entre novamente.", code: "DEVICE_REVOKED" });
  }
  return json(401, { error: "Entre na sua conta para usar as análises com IA.", code: "AUTH_REQUIRED" });
}

async function route(event, session) {
  if (event.httpMethod !== "POST") return json(405, { error: "Método não permitido." });

  // Corpo grande demais nem chega a ser analisado: `JSON.parse` de megabytes é
  // trabalho gratuito oferecido a quem estiver testando o endpoint.
  if (typeof event.body === "string" && Buffer.byteLength(event.body, "utf8") > MAX_BODY_BYTES) {
    return json(413, { error: "Requisição grande demais.", code: "TOO_LARGE" });
  }

  // Limite por usuário E limite global, os dois persistidos: em memória eles
  // zeravam a cada cold start e não eram compartilhados entre instâncias, que é
  // exatamente o cenário de um pico de chamadas pagas à IA.
  const porUsuario = await rateLimit.hit(event, {
    bucket: "ia-usuario", identity: session.user.id,
    limit: RATE_PER_USER, windowSeconds: RATE_WINDOW_MS / 1000,
  });
  const global = porUsuario.allowed
    ? await rateLimit.hit(event, { bucket: "ia-global", identity: "todos", limit: RATE_GLOBAL, windowSeconds: RATE_WINDOW_MS / 1000 })
    : { allowed: false, retryAfter: porUsuario.retryAfter };
  const limit = {
    limited: !porUsuario.allowed || !global.allowed,
    retryAfter: porUsuario.retryAfter || global.retryAfter || 60,
  };
  if (limit.limited) {
    return {
      statusCode: 429,
      headers: { ...CORS, "Retry-After": String(limit.retryAfter) },
      body: JSON.stringify({ error: "Muitas análises seguidas. Tente de novo em alguns minutos.", code: "RATE_LIMIT" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "ANTHROPIC_API_KEY não configurada no servidor.", code: "NO_API_KEY" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "JSON inválido no corpo da requisição.", code: "BAD_JSON" });
  }

  // ---- Roteamento de modo: análise do mês (padrão) x interpretação de frase ----
  if (payload && payload.modo === "lancamento") {
    return handleEntryParse(payload, apiKey);
  }

  const dados = sanitizePayload(payload);
  if (dados.rendaMensal === 0 && dados.gastosFixos === 0 && dados.gastosVariaveis === 0 && dados.categorias.length === 0) {
    return json(422, { error: "Ainda não há dados suficientes para gerar uma análise.", code: "NOT_ENOUGH_DATA" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        temperature: 0.3,
        system: "Você responde sempre e somente com JSON válido, sem markdown e sem comentários.",
        messages: [{ role: "user", content: buildPrompt(dados) }],
      }),
    });

    if (!res.ok) {
      const code = res.status === 429 ? "RATE_LIMIT" : res.status === 401 ? "BAD_KEY" : "UPSTREAM_ERROR";
      return json(502, { error: "A IA não respondeu corretamente.", code });
    }

    const body = await res.json();
    const text = (body.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
    const parsed = extractJson(text);

    if (!parsed) {
      // Degradação graciosa: devolve o texto bruto para a UI não ficar vazia.
      return json(200, { ok: true, estruturado: false, insight: text || "Não foi possível gerar uma análise no momento.", analise: null });
    }

    const analise = normalizeAnalysis(parsed);
    return json(200, { ok: true, estruturado: true, analise, insight: toPlainText(analise), modelo: MODEL });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return json(aborted ? 504 : 500, {
      error: aborted ? "A análise demorou demais para responder. Tente novamente." : "Falha ao conectar à IA.",
      code: aborted ? "TIMEOUT" : "NETWORK",
    });
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  const origin = resolveOrigin(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: origin.allowed ? 204 : 403, headers: corsHeaders(origin.value), body: "" };
  }
  if (!origin.allowed) {
    return {
      statusCode: 403,
      headers: corsHeaders(origin.value),
      body: JSON.stringify({ error: "Origem não autorizada.", code: "FORBIDDEN_ORIGIN" }),
    };
  }

  // Falha fechada: sem backend de contas não há como saber quem está chamando,
  // e um endpoint pago sem chamador identificável é um endpoint aberto.
  let res;
  if (!api.config().configured) {
    res = sessionFailure({ code: "not_configured" });
  } else {
    let session;
    try { session = await requireSession(event); }
    catch (error) { session = null; res = sessionFailure(error); }
    if (session) {
      res = await route(event, session);
      // Renovação de sessão e carimbo de dispositivo precisam voltar ao cliente,
      // senão o refresh silencioso se perde e a próxima chamada cai em 401.
      if (session.cookies && session.cookies.length) {
        res = { ...res, multiValueHeaders: { ...(res.multiValueHeaders || {}), "Set-Cookie": session.cookies } };
      }
    }
  }
  // A resposta ecoa a origem que passou na allowlist, nunca `*` quando há lista.
  return { ...res, headers: { ...(res.headers || CORS), ...corsHeaders(origin.value) } };
};
