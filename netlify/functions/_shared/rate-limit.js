"use strict";

// Limite de tentativas compartilhado e PERSISTIDO.
//
// A versão anterior usava um `Map` dentro de cada função serverless. Isso falha
// de três formas ao mesmo tempo: a memória zera no cold start, instâncias
// concorrentes não compartilham a contagem (com 10 instâncias o limite efetivo
// era 10 vezes o configurado) e o mapa crescia sem poda.
//
// A contagem agora vive no banco, com janela deslizante e trava por linha.
//
// A identidade nunca é gravada em claro: o IP é dado pessoal e não precisa ser
// legível para contar tentativas. O que vai para o banco é um HMAC-SHA256 com
// segredo do servidor.

const crypto = require("crypto");
const api = require("./supabase-rest");
const { headersOf } = require("./http");

// Fallback em memória, usado apenas quando o banco não está disponível. Ele é
// pior que o do banco por definição, mas é melhor do que não limitar nada
// enquanto o backend não responde.
const localHits = new Map();

function secret() {
  const value = String(process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!value) throw Object.assign(new Error("Servidor sem segredo configurado"), { statusCode: 503, code: "not_configured" });
  return value;
}

// Hash estável por identidade e por bucket. Incluir o bucket no HMAC impede
// cruzar a mesma identidade entre finalidades diferentes a partir da tabela.
function identityHash(bucket, identity) {
  return crypto.createHmac("sha256", secret())
    .update(`${bucket}:${String(identity == null ? "" : identity)}`)
    .digest("hex");
}

function clientIp(event) {
  const h = headersOf(event);
  return h["x-nf-client-connection-ip"]
    || String(h["x-forwarded-for"] || "").split(",")[0].trim()
    || "desconhecido";
}

function localFallback(bucket, identity, limit, windowMs) {
  const key = `${bucket}:${identity}`;
  const now = Date.now();
  const list = (localHits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    localHits.set(key, list);
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  localHits.set(key, list);
  // Poda: sem isto o mapa cresce até a reciclagem da instância.
  if (localHits.size > 5000) {
    for (const [k, v] of localHits) {
      if (!v.length || now - v[v.length - 1] > windowMs) localHits.delete(k);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

// `bucket` separa finalidades (login, ia, ...) para que o consumo de uma não
// bloqueie a outra.
async function hit(event, { bucket, identity, limit, windowSeconds }) {
  const janelaMs = Math.max(1, Number(windowSeconds) || 60) * 1000;
  const alvo = identity == null ? clientIp(event) : identity;

  if (!api.config().configured) return localFallback(bucket, alvo, limit, janelaMs);

  try {
    const rows = await api.db("rpc/cofre_rate_hit", {
      method: "POST", service: true,
      body: {
        p_bucket: String(bucket).slice(0, 40),
        p_identity_hash: identityHash(bucket, alvo),
        p_limit: Math.max(1, Number(limit) || 30),
        p_window_seconds: Math.max(1, Number(windowSeconds) || 60),
      },
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result) return localFallback(bucket, alvo, limit, janelaMs);
    return { allowed: result.allowed !== false, retryAfter: Number(result.retry_after) || 0, hits: Number(result.hits) || 0 };
  } catch (error) {
    // Banco fora do ar não pode abrir a porta: cai no limite local, que ainda
    // segura uma rajada vinda da mesma instância.
    return localFallback(bucket, alvo, limit, janelaMs);
  }
}

// Versão que lança o erro pronto para o handler, como o código antigo fazia.
async function enforce(event, options) {
  const result = await hit(event, options);
  if (!result.allowed) {
    throw Object.assign(new Error("Muitas tentativas. Aguarde e tente novamente."), {
      statusCode: 429, code: "rate_limited", retryAfter: result.retryAfter,
    });
  }
  return result;
}

module.exports = { hit, enforce, identityHash, clientIp };
