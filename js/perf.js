// perf.js; camada de memoização e agendamento de trabalho não crítico.
//
// Por que existe
// --------------
// `render()` reconstrói a tela inteira a cada evento. Isso é barato para o DOM
// (uma string), mas caro para os MODELOS: `buildDashboardModel`,
// `buildHealthModel`, `buildGoalsModel`, `buildPortfolioModel` e
// `buildAchievementsModel` varrem transações, metas e ativos várias vezes cada.
// Num render de dashboard os mesmos números eram recalculados de 3 a 8 vezes.
//
// A chave da solução já existia no projeto: o app atualiza os dados de forma
// IMUTÁVEL (`setData((d) => ({ ...d, ... }))`). Logo, "mesmo objeto `data`" é
// equivalente a "nada mudou"; e um WeakMap com a identidade do snapshot como
// chave invalida o cache sozinho, sem invalidação manual e sem vazar memória
// (o cache morre junto com o snapshot antigo).
//
// Regra de uso: SÓ memoize funções puras de leitura. Nada que dependa de
// `state`, de `Date.now()` dentro do próprio cálculo, ou que grave dados.
// Quando o resultado depender do tempo (mês corrente, "hoje"), inclua essa
// dependência na chave.
"use strict";

const __modelCache = new WeakMap();

/**
 * Memoiza o resultado de `compute()` pela identidade do snapshot de dados.
 *
 * @param {string} ns      espaço de nomes (ex: "dashboard")
 * @param {object} data    snapshot; a identidade dele é a chave do cache
 * @param {string} key     variação dentro do namespace (ex: mês de referência)
 * @param {Function} compute função pura que produz o valor
 */
function memoByData(ns, data, key, compute) {
  if (!data || typeof data !== "object") return compute();
  let bucket = __modelCache.get(data);
  if (!bucket) { bucket = new Map(); __modelCache.set(data, bucket); }
  const full = `${ns}|${key}`;
  if (bucket.has(full)) return bucket.get(full);
  const value = compute();
  bucket.set(full, value);
  return value;
}

/** Descarta o cache de um snapshot (usado após restaurar backup). */
function invalidateMemo(data) {
  if (data && typeof data === "object") __modelCache.delete(data);
}

/** Quantas entradas há no cache do snapshot atual; usado só nos testes. */
function memoSize(data) {
  const bucket = __modelCache.get(data);
  return bucket ? bucket.size : 0;
}

// ---------------------------------------------------------------------------
// Trabalho ocioso
// ---------------------------------------------------------------------------
// Verificação de conquistas, sincronização de gamificação e afins não podem
// atrasar o próximo quadro. `idleTask` empurra para o tempo livre do navegador
// e degrada para `setTimeout` onde `requestIdleCallback` não existe (Safari).
function idleTask(fn, timeout) {
  const run = () => { try { fn(); } catch (e) { console.error(e); } };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: timeout || 600 });
  } else {
    setTimeout(run, 0);
  }
}

// ---------------------------------------------------------------------------
// Renderização coalescida
// ---------------------------------------------------------------------------
// Alguns fluxos disparam `render()` mais de uma vez no mesmo tick (ex: gravar
// dado + notificar + sincronizar conquistas). `scheduleRender` junta tudo em um
// único quadro. NÃO substitui `render()` nos caminhos que precisam de DOM
// sincronizado logo em seguida (foco, canvas, vídeo); por isso é opt-in.
let __renderQueued = false;
function scheduleRender(renderFn) {
  if (__renderQueued) return;
  __renderQueued = true;
  const flush = () => { __renderQueued = false; renderFn(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
  else setTimeout(flush, 16);
}

/** `true` quando o usuário pediu menos animação no sistema. */
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
