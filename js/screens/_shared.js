// js/screens/_shared.js. Peças de UI reaproveitadas por mais de uma tela. Só HTML: nenhum cálculo
// financeiro e nenhuma escrita de estado moram aqui.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function renderCalculationButton(id, label) {
  return `<button class="calculation-link" data-action="calculation-open" data-id="${escapeHtml(id)}">${svgIcon("info", 14)} ${escapeHtml(label || "Como foi calculado")}</button>`;
}

function renderCalculationKinds(kinds) {
  return `<div class="calculation-kinds">${(kinds || []).map((id) => {
    const meta = CALCULATION_KIND[id] || CALCULATION_KIND.estimated;
    return `<span class="calculation-kind calculation-kind--${meta.id}">${svgIcon(meta.icon, 13)} ${escapeHtml(meta.label)}</span>`;
  }).join("")}</div>`;
}

// ---- Score financeiro (motor em score.js) ----
function renderScoreGauge(score, color, size) {
  const s = size || 88;
  const stroke = Math.round(s * 0.1);
  const r = s / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  const len = Math.max(0, clamp(score, 0, 100) / 100 * c);
  return `<div class="score-gauge" data-ui-css="width:${s}px;height:${s}px">
    <svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true">
      <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
      <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-dasharray="${len} ${c - len}" stroke-linecap="round" transform="rotate(-90 ${s / 2} ${s / 2})"/>
    </svg>
    <span class="score-gauge__value" data-ui-css="color:${color}">${score}</span>
  </div>`;
}

// ---- Mini gráfico de linha para a evolução patrimonial ----
function renderSparkline(series, color, width, height) {
  const w = width || 300;
  const h = height || 60;
  const values = series.map((p) => p.value);
  if (values.length < 2) return "";
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const gid = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Evolução do patrimônio">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function renderEmptyState(icon, title, subtitle) {
  return `<div class="empty-state">
    <span class="empty-state__icon">${svgIcon(icon, 26)}</span>
    <p class="empty-state__title">${escapeHtml(title)}</p>
    ${subtitle ? `<p class="empty-state__subtitle">${escapeHtml(subtitle)}</p>` : ""}
  </div>`;
}

function renderTxRow(t) {
  if (t.type === "income") {
    return `<div class="tx-row" data-action="edit-tx" data-id="${t.id}">
      <div class="icon-bubble icon-bubble--income">${svgIcon("trendUp", 18)}</div>
      <div class="tx-info">
        <p class="tx-title">${escapeHtml(t.description || "Receita")}</p>
        <p class="tx-meta">${fmtDateShort(t.date)} · ${escapeHtml(t.payment)}</p>
      </div>
      <p class="tx-amount tx-amount--income">+${fmtBRL(t.amount)}</p>
      <button class="icon-btn" data-action="delete-tx" data-id="${t.id}" aria-label="Excluir">${svgIcon("x", 15)}</button>
    </div>`;
  }
  const cat = categoryById(state.data, t.categoryId);
  return `<div class="tx-row" data-action="edit-tx" data-id="${t.id}">
    <div class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 18)}</div>
    <div class="tx-info">
      <p class="tx-title">${escapeHtml(t.description || cat.name)}</p>
      <p class="tx-meta">${escapeHtml(cat.name)} · ${fmtDateShort(t.date)} · ${escapeHtml(t.payment)}${t.recurring ? " · fixo" : ""}</p>
    </div>
    <p class="tx-amount tx-amount--expense">-${fmtBRL(t.amount)}</p>
    <button class="icon-btn" data-action="delete-tx" data-id="${t.id}" aria-label="Excluir">${svgIcon("x", 15)}</button>
  </div>`;
}

// ==================================================================
// CONTAS, CARTÕES E CONCILIAÇÃO
// ==================================================================
function moneyDraft(n) { return n ? Number(n).toFixed(2).replace(".", ",") : ""; }

function renderGoalRing(pct, color, icon, size) {
  const stroke = size * 0.1;
  const r = size / 2 - stroke / 2 - 1;
  const cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  const len = Math.max(0, clamp(pct, 0, 100) / 100 * c);
  return `<div class="goal-ring" data-ui-css="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    </svg>
    <span class="goal-ring__icon" data-ui-css="color:${color}">${svgIcon(icon, size * 0.36)}</span>
  </div>`;
}
