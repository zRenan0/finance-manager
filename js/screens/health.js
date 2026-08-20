// js/screens/health.js. Saúde financeira. O diagnóstico vem de health.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// SAÚDE FINANCEIRA (Módulo 2)
// ------------------------------------------------------------------
// Tela dedicada de diagnóstico. Todo o raciocínio financeiro mora em
// health.js; aqui só existe transformação de modelo em HTML. O Score
// não é recalculado nem duplicado: o modelo devolve o mesmo objeto
// produzido por score.js e a tela reaproveita `renderScoreGauge`.
// ==================================================================
function renderHealthScreen() {
  const model = healthModel(keyOfCurrentMonth());
  const h = model.headline;
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };

  return `<div class="screen">
    ${renderBackHeader("Saúde financeira")}
    <div class="grid-dashboard">
      ${renderHealthHero(model, h, toneColor)}
      ${model.indicators.map((i) => renderHealthIndicator(i)).join("")}
      ${renderHealthPlan(model)}
      <p class="footnote span-3">Os indicadores usam apenas os seus lançamentos, metas e renda cadastrada. Nada é enviado para fora do aparelho. As faixas são referências educativas, e indicadores sem base de cálculo ficam marcados como “sem dados”.</p>
    </div>
  </div>`;
}

// ---- Cabeçalho: diagnóstico em uma frase + nota geral + distribuição ----
function renderHealthHero(model, h, toneColor) {
  const s = model.score;
  const counts = model.counts;
  const chips = [
    { id: "otimo",   label: "ótimo",    color: "var(--positive)" },
    { id: "bom",     label: "saudável", color: "var(--brand)" },
    { id: "atencao", label: "atenção",  color: "var(--goal)" },
    { id: "critico", label: "crítico",  color: "var(--negative)" },
    { id: "sem",     label: "sem dados", color: "var(--ink-faint)" },
  ].filter((c) => counts[c.id] > 0);

  return `<div class="card card--health-hero span-3" data-ui-css="--tone:${toneColor[h.tone]}">
    <div class="health-calculation-link">${renderCalculationButton("health")}</div>
    <div class="health-hero__grid">
      ${s && !s.insufficient ? `<div class="health-hero__gauge">
        ${renderScoreGauge(s.score, s.level.color, 104)}
        <p class="health-hero__gauge-label" data-ui-css="color:${s.level.color}">${s.level.label}</p>
        <p class="health-hero__gauge-note">Score financeiro</p>
      </div>` : ""}
      <div class="health-hero__text">
        <p class="health-hero__eyebrow">${svgIcon(h.tone === "positive" ? "checkCircle" : h.tone === "neutral" ? "info" : "alertTriangle", 14)}<span>Diagnóstico de ${MONTH_NAMES[new Date().getMonth()].toLowerCase()}</span></p>
        <h2 class="health-hero__title">${escapeHtml(h.title)}</h2>
        <p class="health-hero__desc">${escapeHtml(h.text)}</p>
        ${chips.length > 0 ? `<div class="health-chips">
          ${chips.map((c) => `<span class="health-chip" data-ui-css="--tone:${c.color}"><b>${counts[c.id]}</b> ${c.label}</span>`).join("")}
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

// ---- Cartão de um indicador ----
function renderHealthIndicator(i) {
  const open = state.healthDetailId === i.id;
  const color = i.status.color;
  const pct = Math.round(i.ratio * 100);

  return `<div class="card card--indicator span-1" data-ui-css="--tone:${color}">
    <div class="indicator__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${color} 14%, transparent); color:${color}">${svgIcon(i.icon, 16)}</span>
      <div class="indicator__head-text">
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(i.label)}</p>
        <p class="indicator__status" data-ui-css="color:${color}">${i.status.label}</p>
      </div>
    </div>

    ${i.applicable ? `
      <p class="indicator__value">${escapeHtml(i.display)}</p>
      <p class="indicator__caption">${escapeHtml(i.caption)}</p>
      <div class="indicator__meter" role="img" aria-label="${escapeHtml(i.label)}: ${pct} de 100">
        <div class="indicator__meter-fill" data-ui-css="width:${pct}%; background:${color}"></div>
        ${i.marks.map((m) => `<span class="indicator__mark" data-ui-css="left:${clamp(m.at * 100, 0, 100)}%" title="${escapeHtml(m.label)}"></span>`).join("")}
      </div>
    ` : `<p class="indicator__value indicator__value--empty">Sem dados</p>`}

    <p class="indicator__desc">${escapeHtml(i.description)}</p>

    ${i.recommendation ? `<div class="indicator__advice">
      ${svgIcon("sparkles", 14, "indicator__advice-icon")}
      <div>
        <p class="indicator__advice-text">${escapeHtml(i.recommendation)}</p>
        ${i.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${i.cta.tab}">${escapeHtml(i.cta.label)}</button>` : ""}
      </div>
    </div>` : ""}

    <button class="indicator__more" data-action="toggle-health-detail" data-id="${i.id}" aria-expanded="${open}">
      <span>${open ? "Ocultar" : "Como é calculado"}</span>${svgIcon(open ? "chevronUp" : "chevronDown", 14)}
    </button>
    ${open ? `<div class="indicator__method">
      <p>${escapeHtml(i.what)}</p>
      ${i.benchmark ? `<p class="indicator__benchmark">${escapeHtml(i.benchmark)}</p>` : ""}
    </div>` : ""}
  </div>`;
}

// ---- Plano de ação: fila priorizada, não uma lista de desejos ----
function renderHealthPlan(model) {
  const plan = model.actionPlan;
  if (plan.length === 0) {
    return `<div class="card span-3">
      <p class="card-title">Plano de ação</p>
      ${model.rated === 0
        ? renderEmptyState("target", "Sem diagnóstico ainda.", "Cadastre sua renda e alguns lançamentos para receber recomendações.")
        : renderEmptyState("checkCircle", "Nenhuma ação urgente.", "Todos os indicadores avaliados estão em nível saudável ou ótimo.")}
    </div>`;
  }
  return `<div class="card card--plan span-3">
    <p class="card-title">Plano de ação</p>
    <p class="health-sub">Na ordem em que faz sentido resolver: liquidez e dívida antes de reserva, reserva antes de investimento.</p>
    <ol class="plan-list">
      ${plan.map((p) => `<li class="plan-item" data-ui-css="--tone:${p.status.color}">
        <span class="plan-item__num">${p.order}</span>
        <div class="plan-item__body">
          <p class="plan-item__label">${svgIcon(p.icon, 13)}<span>${escapeHtml(p.label)}</span><span class="plan-item__tag">${p.status.label}</span></p>
          <p class="plan-item__text">${escapeHtml(p.text)}</p>
          ${p.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${p.cta.tab}">${escapeHtml(p.cta.label)}</button>` : ""}
        </div>
      </li>`).join("")}
    </ol>
  </div>`;
}
