// js/screens/insights.js. Conselheiro e padrões de gasto. Motores em advisor.js e analytics.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// [M7] CENTRAL INTELIGENTE; recomendações e insights avançados
// ------------------------------------------------------------------
// Três leituras da mesma base, separadas porque respondem perguntas
// diferentes: o que fazer (Recomendações), como você gasta (Padrões)
// e o que mudou (Comparar).
// ==================================================================
const ADV_TONE_COLOR = {
  danger: "var(--negative)",
  warn: "var(--goal)",
  info: "var(--brand)",
  positive: "var(--positive)",
};

const ADV_TONE_LABEL = { danger: "Urgente", warn: "Atenção", info: "Observação", positive: "Boa notícia" };

const INSIGHTS_VIEWS = [
  { id: "ia", label: "Recomendações" },
  { id: "padroes", label: "Padrões" },
  { id: "comparar", label: "Comparar" },
];

function renderInsightsScreen() {
  const mKey = insightsMonthKey();
  const an = analyticsModel(mKey);
  const adv = advisorModel(mKey);
  const view = state.insights.view;

  return `<div class="screen">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <div>
          <p class="eyebrow">Central inteligente</p>
          <h1 class="page-title">${escapeHtml(an.monthLabel)}</h1>
        </div>
      </div>
      <div class="month-nav">
        <button class="icon-btn" data-action="ins-prev" aria-label="Mês anterior">${svgIcon("chevronLeft", 17)}</button>
        <button class="icon-btn" data-action="ins-next" aria-label="Próximo mês" ${state.insights.monthOffset >= 0 ? "disabled" : ""}>${svgIcon("chevronRight", 17)}</button>
      </div>
    </div>

    ${!an.hasData ? renderEmptyState("sparkles", "Sem lançamentos neste mês.", "As recomendações e comparações aparecem assim que houver movimento registrado.") : `
      ${renderAdvisorHeadline(adv)}

      <div class="segmented">
        ${INSIGHTS_VIEWS.map((v) => `<button class="segmented__option ${view === v.id ? "active" : ""}" data-action="ins-view" data-value="${v.id}">${v.label}</button>`).join("")}
      </div>

      ${view === "ia" ? renderInsightsAdvice(adv) : ""}
      ${view === "padroes" ? renderInsightsPatterns(an) : ""}
      ${view === "comparar" ? renderInsightsCompare(an) : ""}
      <p class="footnote">Leitura educativa baseada apenas nos dados cadastrados. Ela não conhece todo o seu contexto e não substitui orientação profissional individual.</p>
    `}
  </div>`;
}

function renderAdvisorHeadline(adv) {
  const h = adv.headline;
  const color = ADV_TONE_COLOR[h.tone];
  return `<div class="card adv-hero" data-ui-css="--tone:${color}">
    <span class="adv-hero__icon">${svgIcon(h.icon, 22)}</span>
    <div class="adv-hero__text">
      <p class="eyebrow" data-ui-css="color:${color}">${ADV_TONE_LABEL[h.tone]}</p>
      <p class="adv-hero__title">${escapeHtml(h.title)}</p>
      <p class="adv-hero__message">${escapeHtml(h.message)}</p>
    </div>
    ${adv.all.length > 1 ? `<div class="adv-hero__counts">
      ${["danger", "warn", "info", "positive"].filter((t) => adv.counts[t]).map((t) => `
        <span class="adv-count" data-ui-css="--tone:${ADV_TONE_COLOR[t]}">${adv.counts[t]} ${ADV_TONE_LABEL[t].toLowerCase()}</span>`).join("")}
    </div>` : ""}
  </div>`;
}

function renderInsightsAdvice(adv) {
  const rest = adv.cards.filter((c) => c.id !== adv.headline.id);
  return `
    ${adv.plan.total > 0 ? renderSavingPlanCard(adv.plan) : ""}
    ${rest.length === 0
      ? renderEmptyState("checkCircle", "Só a leitura acima por enquanto.", "Quanto mais meses registrados, mais comparações o app consegue fazer.")
      : `<div class="adv-list">${rest.map((c) => renderAdvisorItem(c)).join("")}</div>`}
    ${renderAiCard()}
  `;
}

function renderAdvisorItem(c) {
  const color = ADV_TONE_COLOR[c.tone];
  const open = state.insights.detailId === c.id;
  const hasDetail = Array.isArray(c.detail) && c.detail.length > 0;
  return `<div class="adv-item" data-ui-css="--tone:${color}">
    <span class="adv-item__icon">${svgIcon(c.icon, 17)}</span>
    <div class="adv-item__text">
      <p class="adv-item__title">${escapeHtml(c.title)}</p>
      <p class="adv-item__message">${escapeHtml(c.message)}</p>
      ${hasDetail && open ? `<div class="adv-item__detail">
        ${c.detail.map((d) => `<div class="adv-detail-row">
          <span class="cat-dot" data-ui-css="background:${d.color}"></span>
          <span>${escapeHtml(d.name)}</span>
          <b>${fmtBRL(d.excess)}</b>
        </div>`).join("")}
      </div>` : ""}
      <div class="adv-item__actions">
        ${hasDetail ? `<button class="btn btn--ghost btn--sm" data-action="ins-detail" data-id="${escapeHtml(c.id)}">${open ? "Ocultar detalhe" : "Ver detalhe"}</button>` : ""}
        ${c.action ? `<button class="btn btn--ghost btn--sm" data-action="nav" data-tab="${c.action.tab}">${escapeHtml(c.action.label)} ${svgIcon("chevronRight", 13)}</button>` : ""}
      </div>
    </div>
  </div>`;
}

function renderSavingPlanCard(plan) {
  return `<div class="card">
    <p class="card-title">Onde estão os ${fmtBRL(plan.total)}</p>
    <p class="card-subtitle">Comparação com a sua própria média dos últimos ${plan.baselineMonths} ${plan.baselineMonths === 1 ? "mês" : "meses"}; não com um padrão genérico. Categorias essenciais ficam fora da sugestão.</p>
    <div class="plan-list">
      ${plan.items.map((i) => `<div class="plan-row">
        <span class="icon-bubble" data-ui-css="width:28px;height:28px;background:color-mix(in srgb, ${i.color} 14%, transparent); color:${i.color}">${svgIcon(i.icon, 14)}</span>
        <div class="plan-row__text">
          <b>${escapeHtml(i.name)}</b>
          <span>${fmtBRL(i.current)} este mês · média de ${fmtBRL(i.baseline)}</span>
        </div>
        <span class="plan-row__value">${fmtBRL(i.excess)}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Padrões: quando e como o dinheiro sai ----
function renderInsightsPatterns(an) {
  const w = an.weekday;
  const avg = an.averages;
  const day = state.insights.heatDay
    ? an.heatmap.days.find((d) => d.iso === state.insights.heatDay)
    : null;

  return `
    <div class="card">
      <p class="card-title">Média diária e semanal</p>
      <div class="health-grid">
        <div class="health-stat"><span>Por dia</span><b>${fmtBRL(avg.daily)}</b></div>
        <div class="health-stat"><span>Por semana</span><b>${fmtBRL(avg.weekly)}</b></div>
        <div class="health-stat"><span>${avg.isCurrentMonth ? "Projeção do mês" : "Total do mês"}</span><b>${fmtBRL(avg.projected)}</b></div>
        <div class="health-stat"><span>Dias considerados</span><b>${avg.elapsedDays} de ${avg.totalDays}</b></div>
      </div>
      ${avg.isCurrentMonth ? `<p class="card-subtitle" data-ui-css="margin-top:10px">A média divide o gasto pelos dias já vividos do mês, não pelos ${avg.totalDays} dias completos; senão o mês pareceria barato justamente enquanto ainda dá para corrigir.</p>` : ""}
    </div>

    <div class="card">
      <p class="card-title">Mapa de calor do mês</p>
      <p class="card-subtitle">Cada quadrado é um dia; quanto mais escuro, mais saiu. Dias que ainda não chegaram ficam vazados.</p>
      ${renderHeatmap(an.heatmap, { action: "heat-day", selected: state.insights.heatDay })}
      ${day ? `<div class="heat-detail">
        <b>${fmtDateFull(day.iso)}</b>
        <span>${day.value > 0 ? `${fmtBRL(day.value)} em ${day.count} ${day.count === 1 ? "lançamento" : "lançamentos"}` : "Nenhum gasto neste dia"}</span>
        <button class="icon-btn icon-btn--muted" data-action="heat-clear" aria-label="Fechar">${svgIcon("x", 14)}</button>
      </div>` : ""}
      <div class="health-grid" data-ui-css="margin-top:12px">
        <div class="health-stat"><span>Dia mais caro</span><b>${an.heatmap.top.length ? `${fmtDateShort(an.heatmap.top[0].iso)} · ${fmtBRL(an.heatmap.top[0].value)}` : "Sem dados"}</b></div>
        <div class="health-stat"><span>Dias sem gasto</span><b>${an.heatmap.quietDays}</b></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <p class="card-title">Dia da semana</p>
        ${w.available ? `
          <p class="card-subtitle">Média por ocorrência do dia; um mês com cinco sábados não faz sábado parecer mais caro só por existir mais vezes.</p>
          ${renderBarList(w.rows.filter((r) => r.occurrences > 0).map((r) => ({
            label: r.label, value: r.average,
            color: r.weekend ? "var(--goal)" : "var(--brand)",
            highlight: w.heaviest && r.index === w.heaviest.index,
          })))}
          ${w.heaviest ? `<p class="card-subtitle" data-ui-css="margin-top:10px">Seu dia mais caro é <b>${escapeHtml(w.heaviest.label)}</b>, com média de ${fmtBRL(w.heaviest.average)}.${w.weekendExcessPct != null && w.weekendExcessPct > 0 ? ` O fim de semana custa ${w.weekendExcessPct.toFixed(0)}% mais que os dias úteis.` : ""}</p>` : ""}
        ` : renderEmptyState("calendar", "Ainda sem gastos registrados neste mês.")}
      </div>

      <div class="card">
        <p class="card-title">Horário</p>
        ${an.hours.available ? `
          <p class="card-subtitle">Hora em que o lançamento foi registrado, contando apenas os que você lançou no mesmo dia da compra (${an.hours.sample} de ${(an.extremes.count || 0)} lançamentos).</p>
          ${renderBarList(an.hours.periods.map((p) => ({
            label: p.label, value: p.total, hint: p.hint,
            highlight: an.hours.peakPeriod && p.id === an.hours.peakPeriod.id,
          })))}
          ${an.hours.peakPeriod ? `<p class="card-subtitle" data-ui-css="margin-top:10px">A maior parte sai à <b>${escapeHtml(an.hours.peakPeriod.label.toLowerCase())}</b>, com pico por volta das ${an.hours.peakHourLabel}.</p>` : ""}
        ` : `<p class="card-subtitle">Ainda não há registros suficientes lançados no mesmo dia da compra para uma leitura de horário confiável. O app prefere não desenhar um gráfico que não se sustenta.</p>`}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <p class="card-title">Extremos do mês</p>
        ${an.extremes.available ? `
          <div class="extreme-row">
            <span class="icon-bubble" data-ui-css="background:var(--negative-soft); color:var(--negative)">${svgIcon("arrowUpRight", 16)}</span>
            <div class="extreme-row__text"><b>${escapeHtml(an.extremes.biggest.description)}</b><span>${escapeHtml(an.extremes.biggest.categoryName)} · ${fmtDateShort(an.extremes.biggest.date)}</span></div>
            <span class="extreme-row__value">${fmtBRL(an.extremes.biggest.amount)}</span>
          </div>
          <div class="extreme-row">
            <span class="icon-bubble" data-ui-css="background:var(--positive-soft); color:var(--positive)">${svgIcon("arrowDownRight", 16)}</span>
            <div class="extreme-row__text"><b>${escapeHtml(an.extremes.smallest.description)}</b><span>${escapeHtml(an.extremes.smallest.categoryName)} · ${fmtDateShort(an.extremes.smallest.date)}</span></div>
            <span class="extreme-row__value">${fmtBRL(an.extremes.smallest.amount)}</span>
          </div>
          <div class="health-grid" data-ui-css="margin-top:12px">
            <div class="health-stat"><span>Ticket médio</span><b>${fmtBRL(an.extremes.ticket)}</b></div>
            <div class="health-stat"><span>Lançamentos</span><b>${an.extremes.count}</b></div>
          </div>
        ` : renderEmptyState("wallet", "Nenhum gasto neste mês.")}
      </div>

      <div class="card">
        <p class="card-title">Categoria dominante</p>
        ${an.dominant.available ? `
          <div class="dominant">
            <span class="icon-bubble icon-bubble--lg" data-ui-css="background:color-mix(in srgb, ${an.dominant.color} 14%, transparent); color:${an.dominant.color}">${svgIcon(an.dominant.icon, 22)}</span>
            <div>
              <p class="dominant__name">${escapeHtml(an.dominant.name)}</p>
              <p class="dominant__value">${fmtBRL(an.dominant.value)} · ${an.dominant.share.toFixed(0)}% do mês</p>
            </div>
          </div>
          <div class="progress" data-ui-css="margin-top:12px"><div class="progress__fill" data-ui-css="width:${an.dominant.share}%; background:${an.dominant.color}"></div></div>
          <p class="card-subtitle" data-ui-css="margin-top:10px">${an.dominant.concentrated
            ? "Uma categoria acima de 40% concentra o mês. Não é erro; moradia costuma passar disso, mas é onde qualquer corte tem efeito real."
            : "Seus gastos estão distribuídos: nenhuma categoria domina o mês."}</p>
        ` : renderEmptyState("pie", "Sem gastos para ranquear.")}
      </div>
    </div>
  `;
}

// ---- Comparar: o que mudou ----
function renderInsightsCompare(an) {
  const mom = an.mom;
  const yoy = an.yoy;
  const cats = an.categories;
  const deltaBadge = (d) => {
    if (!d.comparable) return `<span class="status-badge" data-ui-css="background:var(--paper-alt); color:var(--ink-soft)">sem base</span>`;
    const up = d.direction === "up";
    const color = up ? "var(--negative)" : "var(--positive)";
    return `<span class="status-badge" data-ui-css="background:color-mix(in srgb, ${color} 14%, transparent); color:${color}">${svgIcon(up ? "arrowUpRight" : "arrowDownRight", 12)}${Math.abs(d.pct || 0).toFixed(0)}%</span>`;
  };

  return `
    <div class="card">
      <p class="card-title">Contra o mês anterior</p>
      <p class="card-subtitle">${escapeHtml(mom.prevLabel)} ${svgIcon("arrowRight", 13)} ${escapeHtml(mom.label)}</p>
      ${!mom.hasPrevious ? renderEmptyState("calendar", "Não há lançamentos no mês anterior para comparar.") : `
      <div class="cmp-grid">
        <div class="cmp-cell">
          <span class="cmp-cell__label">Gastos</span>
          <b class="cmp-cell__value">${fmtBRL(mom.expense.current)}</b>
          <span class="cmp-cell__prev">era ${fmtBRL(mom.expense.previous)}</span>
          ${deltaBadge(mom.expense)}
        </div>
        <div class="cmp-cell">
          <span class="cmp-cell__label">Receitas</span>
          <b class="cmp-cell__value">${fmtBRL(mom.income.current)}</b>
          <span class="cmp-cell__prev">era ${fmtBRL(mom.income.previous)}</span>
          ${deltaBadge(mom.income)}
        </div>
        <div class="cmp-cell">
          <span class="cmp-cell__label">Sobra</span>
          <b class="cmp-cell__value">${fmtBRL(mom.saving.current)}</b>
          <span class="cmp-cell__prev">era ${fmtBRL(mom.saving.previous)}</span>
          ${deltaBadge(mom.saving)}
        </div>
      </div>`}
    </div>

    <div class="card">
      <p class="card-title">O que subiu e o que caiu</p>
      ${(cats.grew.length + cats.shrank.length) === 0
        ? renderEmptyState("pie", "Sem variação relevante entre os dois meses.")
        : `<p class="card-subtitle">Comparação por categoria principal; o gasto de uma subcategoria conta na categoria-mãe, a mesma herança dos orçamentos.</p>
           ${renderDivergingBars(cats.grew.concat(cats.shrank.slice().reverse()))}`}
    </div>

    <div class="card">
      <p class="card-title">Contra o ano passado</p>
      ${!yoy.available ? renderEmptyState("clock", "Ainda não há um ano de histórico.", "A comparação anual aparece quando existirem lançamentos do mesmo período do ano anterior.") : `
        <div class="cmp-grid">
          ${yoy.sameMonthAvailable ? `<div class="cmp-cell">
            <span class="cmp-cell__label">Mesmo mês</span>
            <b class="cmp-cell__value">${fmtBRL(yoy.sameMonth.current)}</b>
            <span class="cmp-cell__prev">${escapeHtml(yoy.sameMonthLabel)}: ${fmtBRL(yoy.sameMonth.previous)}</span>
            ${deltaBadge(yoy.sameMonth)}
          </div>` : ""}
          <div class="cmp-cell">
            <span class="cmp-cell__label">Gasto no ano</span>
            <b class="cmp-cell__value">${fmtBRL(yoy.ytdExpense.current)}</b>
            <span class="cmp-cell__prev">${yoy.lastYear}: ${fmtBRL(yoy.ytdExpense.previous)}</span>
            ${deltaBadge(yoy.ytdExpense)}
          </div>
          <div class="cmp-cell">
            <span class="cmp-cell__label">Receita no ano</span>
            <b class="cmp-cell__value">${fmtBRL(yoy.ytdIncome.current)}</b>
            <span class="cmp-cell__prev">${yoy.lastYear}: ${fmtBRL(yoy.ytdIncome.previous)}</span>
            ${deltaBadge(yoy.ytdIncome)}
          </div>
        </div>
        <p class="card-subtitle" data-ui-css="margin-top:10px">O acumulado compara janeiro até ${escapeHtml(an.monthLabel.split(" de ")[0].toLowerCase())} nos dois anos; nunca um ano inteiro contra um ano pela metade.</p>
      `}
    </div>

    <div class="card">
      <p class="card-title">Últimos 12 meses</p>
      ${renderTrendChart(an.series.filter((s) => !s.empty).length > 1 ? an.series : an.series.slice(-6))}
      <div class="trend-legend"><span><i data-ui-css="background:var(--brand)"></i>Entradas</span><span><i data-ui-css="background:var(--negative)"></i>Gastos</span></div>
    </div>
  `;
}

// Cartão do Dashboard; porta de entrada da central.

function renderAdvisorCard(mKey) {
  const adv = advisorModel(mKey);
  if (!adv.hasData) return "";
  const items = adv.cards.slice(0, 3);
  if (items.length === 0) return "";
  return `<div class="card span-2 card--advisor">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Central inteligente</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${adv.all.length} ${adv.all.length === 1 ? "leitura" : "leituras"} sobre o seu mês</p>
      </div>
    </div>
    <div class="adv-list adv-list--compact">
      ${items.map((c) => `<div class="adv-item adv-item--compact" data-ui-css="--tone:${ADV_TONE_COLOR[c.tone]}">
        <span class="adv-item__icon">${svgIcon(c.icon, 15)}</span>
        <div class="adv-item__text">
          <p class="adv-item__title">${escapeHtml(c.title)}</p>
          <p class="adv-item__message">${escapeHtml(c.message)}</p>
        </div>
      </div>`).join("")}
    </div>
    <button class="btn btn--secondary btn--block" data-ui-css="margin-top:10px" data-action="nav" data-tab="insights">Ver todas as recomendações</button>
  </div>`;
}

// ==================================================================
// Prévia do envio para a IA
// ------------------------------------------------------------------
// O cartão de IA prometia que "antes do envio você verá exatamente quais dados
// sairão do aparelho", e o que aparecia era um parágrafo descrevendo o pacote.
// Descrição não é o pacote: ela envelhece quando o formato muda e não mostra
// os NOMES que o usuário escolheu para categorias e metas, que são justamente
// a parte que pode revelar contexto pessoal.
//
// Esta tela usa `buildAiPayloadPreview`, a mesma função que monta o envio, e
// por isso não pode divergir dele.
// ==================================================================

// Quanto o pacote ocupa, em palavra de gente.
function aiPreviewSize(bytes) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} bytes`;
}

function renderAiPreviewFields(preview, hide) {
  const oculto = new Set(hide);
  return Object.entries(preview.ocultaveis).map(([id, label]) => {
    const incluido = !oculto.has(id);
    return `<label class="ai-preview__field">
      <input type="checkbox" data-action-select="ai-preview-field" data-value="${escapeHtml(id)}" ${incluido ? "checked" : ""} />
      <span>
        <b>${escapeHtml(label)}</b>
        <small>${incluido ? "Vai junto no envio" : (id === "categorias" ? "Sai como Categoria 1, Categoria 2..." : "Removido do pacote")}</small>
      </span>
    </label>`;
  }).join("");
}

function renderAiPreviewModal() {
  const mKey = state.aiPreview.monthKey;
  if (!mKey) return "";
  const hide = state.aiPreview.hide;
  let preview = null;
  try {
    preview = buildAiPayloadPreview(state.data, mKey, { hide });
  } catch (e) {
    return "";
  }
  // `_rendaLancada` é chave interna: `JSON.stringify` já a omite (o valor é
  // undefined), então mostrá-la na lista de campos anunciaria um envio que não
  // acontece.
  const campos = preview.campos.filter((nome) => nome.charAt(0) !== "_");
  return `<div class="modal-overlay" data-action="ai-preview-cancel">
    <div class="modal-sheet ai-preview" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="ai-preview-title">
      <div class="modal-header">
        <span class="icon-bubble icon-bubble--lg">${svgIcon("sparkles", 20)}</span>
        <div>
          <p class="card-title" id="ai-preview-title" data-ui-css="margin:0">O que será enviado</p>
          <p class="card-subtitle" data-ui-css="margin:3px 0 0">${escapeHtml(anMonthLabel(mKey))}. Nada sai do aparelho até você tocar em enviar.</p>
        </div>
        <button class="icon-btn" data-action="ai-preview-cancel" aria-label="Fechar prévia do envio">${svgIcon("x", 16)}</button>
      </div>

      <div class="ai-preview__body">
        <p class="ai-preview__summary">${svgIcon("shieldCheck", 15)} <span>${escapeHtml(preview.resumo)}</span></p>

        <p class="field__label">O que você pode tirar antes de enviar</p>
        <div class="ai-preview__fields">${renderAiPreviewFields(preview, hide)}</div>

        <div class="ai-preview__meta">
          <span>${campos.length} ${campos.length === 1 ? "campo" : "campos"}</span>
          <span>${aiPreviewSize(preview.bytes)}</span>
        </div>

        <details class="ai-preview__json" ${state.aiPreview.showJson ? "open" : ""}>
          <summary data-action="ai-preview-toggle-json">Ver o pacote inteiro</summary>
          <pre><code>${escapeHtml(preview.json)}</code></pre>
        </details>
      </div>

      <div class="ai-preview__actions">
        <button type="button" class="btn btn--ghost" data-action="ai-preview-cancel">Cancelar</button>
        <button type="button" class="btn btn--primary" data-action="ai-preview-send">${svgIcon("sparkles", 15)} Enviar e analisar</button>
      </div>
    </div>
  </div>`;
}
