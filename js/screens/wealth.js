// js/screens/wealth.js. Patrimônio: bens, dívidas e evolução. Cálculo em wealth.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// PATRIMÔNIO (Módulo 3)
// ------------------------------------------------------------------
// Cadastro de bens e dívidas + evolução mensal + comparação anual.
// Todo o cálculo mora em wealth.js/metrics.js; aqui só há montagem de
// HTML e manipulação do formulário. O gráfico é SVG puro, sem lib.
// ==================================================================
function renderWealthScreen() {
  const model = wealthModel(state.wealth.months);
  const wf = state.wealth.form;

  return `<div class="screen">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <h1 class="page-title">Patrimônio</h1>
      </div>
      <button class="btn btn--primary btn--sm" data-action="wealth-new">${svgIcon("plus", 15)} Cadastrar</button>
    </div>

    <div class="grid-dashboard">
      ${renderWealthHero(model)}
      ${wf ? renderWealthForm(wf) : ""}
      ${renderWealthChartCard(model)}
      ${renderWealthAnnualCard(model)}
      ${model.allocation.length > 0 ? renderWealthAllocationCard(model) : ""}
      ${renderWealthInsightsCard(model)}
      ${renderWealthGroups(model)}
      <p class="footnote span-3">O caixa vem dos seus lançamentos. Bens e dívidas cadastrados aqui completam o quadro; e cada item guarda o próprio histórico mensal, então a curva acima é reconstruída com o valor que cada bem tinha na época, não com o de hoje.</p>
    </div>
  </div>`;
}

// ---- Painel principal: patrimônio líquido e composição ----
function renderWealthHero(m) {
  const c = m.composition;
  const d = m.delta.year;
  const trendColor = d.up ? "var(--positive)" : "var(--negative)";

  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <div class="hero-label-row"><p class="hero-label">Patrimônio líquido</p>${renderCalculationButton("net-worth")}</div>
    <p class="hero-value">${fmtBRL(m.worth.total)}</p>
    ${d.comparable ? `<p class="hero-reserved">${svgIcon(d.up ? "arrowUpRight" : "arrowDownRight", 14)} ${d.up ? "+" : "−"}${fmtBRL(Math.abs(d.value))} (${d.up ? "+" : "−"}${Math.abs(d.pct).toFixed(1)}%) em ${m.months} meses</p>` : ""}

    ${c.gross > 0 ? `<div class="wealth-bar">
      ${c.positive.map((b) => `<div class="wealth-bar__seg" data-ui-css="flex:${Math.max(b.value, 1)}; background:${b.color}" title="${escapeHtml(b.label)}"></div>`).join("")}
    </div>` : ""}

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("layout", 17)}<div><span class="hero-chip__label">Total em bens</span><span class="hero-chip__value">${fmtBRL(c.gross)}</span></div></div>
      <div class="hero-chip">${svgIcon("alertTriangle", 17)}<div><span class="hero-chip__label">Dívidas</span><span class="hero-chip__value">${fmtBRL(c.debts)}</span></div></div>
      ${m.monthlyPayment > 0 ? `<div class="hero-chip">${svgIcon("bell", 17)}<div><span class="hero-chip__label">Parcelas por mês</span><span class="hero-chip__value">${fmtBRL(m.monthlyPayment)}</span></div></div>` : ""}
    </div>
    ${c.debts > 0 ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="debts">Planejar quitação das dívidas</button>` : ""}

    <div class="wealth-legend">
      ${c.positive.map((b) => `<div class="wealth-legend__item">
        <span class="cat-dot" data-ui-css="background:${b.color}"></span>
        <div class="wealth-legend__text">
          <span class="wealth-legend__label">${escapeHtml(b.label)} · ${b.pct.toFixed(0)}%</span>
          <span class="wealth-legend__note">${escapeHtml(b.note)}</span>
        </div>
        <b>${fmtBRL(b.value)}</b>
      </div>`).join("")}
      ${c.negative.map((b) => `<div class="wealth-legend__item wealth-legend__item--neg">
        <span class="cat-dot" data-ui-css="background:${b.color}"></span>
        <div class="wealth-legend__text"><span class="wealth-legend__label">${escapeHtml(b.label)}</span></div>
        <b>−${fmtBRL(b.value)}</b>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Formulário de cadastro/edição ----
function renderWealthForm(f) {
  const cls = assetClassOf(f.class);
  const editing = !!f.id;
  const isLiability = cls.kind === "liability";
  const isAccount = f.class === "conta" || f.class === "carteira";

  return `<div class="card card--elevated span-3">
    <p class="card-title">${editing ? "Editar item" : "Cadastrar bem ou dívida"}</p>

    <div class="field"><p class="field__label">Tipo</p>
      <div class="class-picker">
        ${ASSET_CLASSES.map((c) => `<button class="class-chip ${f.class === c.id ? "active" : ""}" data-ui-css="--tone:${c.color}" data-action="wealth-set-class" data-value="${c.id}">
          ${svgIcon(c.icon, 15)}<span>${escapeHtml(c.label)}</span>
        </button>`).join("")}
      </div>
      <p class="field-hint">${escapeHtml(cls.hint)}</p>
    </div>

    <div class="field"><label class="field__label" for="wealth-name-input">Nome</label>
      <input id="wealth-name-input" class="input" data-field="wealth-name" value="${escapeHtml(f.name)}" placeholder="${escapeHtml(isLiability ? "Ex: Financiamento do carro" : "Ex: Apartamento")}" autocomplete="off" maxlength="60" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="wealth-value-input">${isLiability ? "Saldo devedor hoje" : "Valor atual"}</label>
        <input id="wealth-value-input" class="input" data-field="wealth-value" value="${escapeHtml(f.value)}" inputmode="decimal" placeholder="0,00" /></div>
      ${isLiability ? `<div class="field"><label class="field__label" for="wealth-payment-input">Parcela mensal</label>
        <input id="wealth-payment-input" class="input" data-field="wealth-payment" value="${escapeHtml(f.monthlyPayment)}" inputmode="decimal" placeholder="0,00" /></div>` : ""}
    </div>

    ${isLiability ? `<div class="field"><label class="field__label" for="wealth-dueday-input">Dia do vencimento (opcional)</label>
      <input id="wealth-dueday-input" class="input" data-field="wealth-dueday" value="${escapeHtml(f.dueDay)}" inputmode="numeric" placeholder="Ex: 10" maxlength="2" />
      <p class="field-hint">Informando o dia, a parcela aparece no Calendário e entra na previsão de saldo. Sem ele, nenhum dia é marcado; melhor não marcar do que marcar errado.</p></div>` : ""}

    <div class="field"><label class="field__label" for="wealth-note-input">Observação (opcional)</label>
      <input id="wealth-note-input" class="input" data-field="wealth-note" value="${escapeHtml(f.note)}" placeholder="Ex: Tesouro Selic 2029 na corretora" autocomplete="off" maxlength="140" /></div>

    ${isAccount ? `<button class="toggle-row" data-action="wealth-toggle-ledger">
      <span class="toggle-row__box ${f.inLedger ? "active" : ""}">${f.inLedger ? svgIcon("check", 13) : ""}</span>
      <span class="toggle-row__text">
        <b>O saldo desta conta já vem dos meus lançamentos</b>
        <span>Marque para o item aparecer na lista sem somar de novo no patrimônio; é o que evita contar o mesmo dinheiro duas vezes.</span>
      </span>
    </button>` : ""}

    ${isLiability ? `<p class="field-hint">A parcela mensal informada entra no indicador de Dívidas da tela Saúde Financeira.</p>` : ""}

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="wealth-cancel">Cancelar</button>
      <button class="btn btn--primary" data-action="wealth-save">${editing ? "Salvar alterações" : "Cadastrar"}</button>
    </div>
  </div>`;
}

// ---- Gráfico de evolução (SVG puro, com eixo e ponto destacado) ----
function renderWealthChart(series, width, height) {
  const w = width || 640;
  const h = height || 170;
  const padTop = 12;
  const padBottom = 22;
  const values = series.map((p) => p.value);
  if (values.length < 2) return `<p class="footnote">Ainda não há meses suficientes para desenhar a evolução.</p>`;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const plotH = h - padTop - padBottom;
  const x = (i) => (i / (series.length - 1)) * w;
  const y = (v) => padTop + plotH - ((v - min) / span) * plotH;

  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const area = `0,${padTop + plotH} ${pts.join(" ")} ${w},${padTop + plotH}`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--brand)" : "var(--negative)";
  const gid = `wealth-grad-${Math.random().toString(36).slice(2, 8)}`;
  const zeroY = min < 0 ? y(0) : null;
  const lastI = series.length - 1;

  return `<svg class="wealth-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Evolução do patrimônio ${series.length === 1 ? "no último mês" : `nos últimos ${series.length} meses`}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${zeroY != null ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>` : ""}
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(lastI).toFixed(1)}" cy="${y(values[lastI]).toFixed(1)}" r="4" fill="var(--card)" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function renderWealthChartCard(m) {
  const opts = [6, 12, 24];
  const first = m.series[0];
  const last = m.series[m.series.length - 1];
  return `<div class="card span-3">
    <div class="wealth-chart__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Evolução mensal</p>
        <p class="health-sub">De ${escapeHtml(first.label)}/${String(first.year).slice(2)} até hoje.</p>
      </div>
      <div class="seg-control">
        ${opts.map((o) => `<button class="seg-control__btn ${m.months === o ? "active" : ""}" data-action="wealth-months" data-value="${o}">${o}m</button>`).join("")}
      </div>
    </div>
    ${renderWealthChart(m.series)}
    <div class="wealth-axis">${m.series.map((p, i) => `<span class="${p.isCurrent ? "is-current" : ""}">${i % Math.ceil(m.series.length / 6) === 0 || p.isCurrent ? escapeHtml(p.label) : ""}</span>`).join("")}</div>
    <div class="wealth-deltas">
      ${[["No mês", m.delta.month], ["6 meses", m.delta.sixMonths], [`${m.months} meses`, m.delta.year]].map(([label, d]) => `
        <div class="wealth-delta">
          <span class="wealth-delta__label">${escapeHtml(label)}</span>
          <b class="wealth-delta__value" data-ui-css="color:${d.comparable ? (d.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)"}">
            ${d.comparable ? `${d.up ? "+" : "−"}${fmtBRLShort(Math.abs(d.value))}` : "Sem dados"}
          </b>
        </div>`).join("")}
    </div>
    <p class="footnote" data-ui-css="text-align:left">O último ponto é o patrimônio de hoje, não uma projeção de fim de mês; por isso ele bate exatamente com o número do topo. Início em ${fmtBRL(first.value)}, hoje ${fmtBRL(last.value)}.</p>
  </div>`;
}

// ---- Comparação anual ----
function renderWealthAnnualCard(m) {
  const a = m.annual;
  const years = a.years;
  const maxAbs = Math.max(...years.map((r) => Math.abs(r.value)), 1);

  return `<div class="card span-2">
    <p class="card-title">Comparação anual</p>
    <p class="health-sub">Fechamento de cada ano civil. O ano corrente é parcial, com o valor de hoje.</p>

    <div class="year-bars">
      ${years.map((r) => {
        const pct = clamp((Math.abs(r.value) / maxAbs) * 100, 2, 100);
        const neg = r.value < 0;
        return `<div class="year-bar ${r.isCurrent ? "is-current" : ""}">
          <span class="year-bar__label">${r.year}${r.isCurrent ? " · hoje" : ""}</span>
          <div class="year-bar__track"><div class="year-bar__fill" data-ui-css="width:${pct}%; background:${neg ? "var(--negative)" : (r.isCurrent ? "var(--brand)" : "color-mix(in srgb, var(--brand) 55%, transparent)")}"></div></div>
          <b class="year-bar__value">${fmtBRLShort(r.value)}</b>
        </div>`;
      }).join("")}
    </div>

    <div class="wealth-deltas" data-ui-css="margin-top:16px">
      <div class="wealth-delta">
        <span class="wealth-delta__label">No ano (desde 31/12)</span>
        <b class="wealth-delta__value" data-ui-css="color:${a.ytd.comparable ? (a.ytd.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)"}">
          ${a.ytd.comparable ? `${a.ytd.up ? "+" : "−"}${fmtBRLShort(Math.abs(a.ytd.value))}` : "Sem dados"}
        </b>
      </div>
      <div class="wealth-delta">
        <span class="wealth-delta__label">Contra 12 meses atrás</span>
        <b class="wealth-delta__value" data-ui-css="color:${a.yoy.comparable ? (a.yoy.up ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)"}">
          ${a.yoy.comparable ? `${a.yoy.up ? "+" : "−"}${Math.abs(a.yoy.pct).toFixed(1)}%` : "Sem dados"}
        </b>
      </div>
    </div>
  </div>`;
}

// ---- Distribuição por classe ----
function renderWealthAllocationCard(m) {
  return `<div class="card span-1">
    <p class="card-title">Distribuição dos bens</p>
    <div class="segment-bar" data-ui-css="margin:12px 0 14px">
      ${m.allocation.map((r) => `<div data-ui-css="flex:${Math.max(r.value, 1)}; background:${r.color}" title="${escapeHtml(r.label)}"></div>`).join("")}
    </div>
    <div class="alloc-list">
      ${m.allocation.map((r) => `<div class="alloc-row">
        <span class="cat-dot" data-ui-css="background:${r.color}"></span>
        <span class="alloc-row__label">${escapeHtml(r.label)}</span>
        <span class="alloc-row__pct">${r.pct.toFixed(0)}%</span>
        <b>${fmtBRLShort(r.value)}</b>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderWealthInsightsCard(m) {
  if (m.insights.length === 0) return "";
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };
  return `<div class="card span-3">
    <p class="card-title">Leitura do período</p>
    <div class="summary-grid" data-ui-css="margin-top:12px">
      ${m.insights.map((i) => `<div class="summary-item" data-ui-css="--tone:${toneColor[i.tone]}">
        <span class="summary-item__icon">${svgIcon(i.icon, 16)}</span>
        <p class="summary-item__text">${escapeHtml(i.text)}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Listas de bens e dívidas ----
function renderWealthGroups(m) {
  if (m.groups.length === 0) {
    return `<div class="card span-3">
      ${renderEmptyState("layout", "Nenhum bem ou dívida cadastrado.", "Cadastre suas contas, investimentos, veículos, imóveis e financiamentos para ver o patrimônio real; e não só o caixa dos lançamentos.")}
      <button class="btn btn--primary btn--block btn--sm" data-action="wealth-new">Cadastrar o primeiro item</button>
    </div>`;
  }
  return m.groups.map((g) => `<div class="card span-3" data-ui-css="--tone:${g.color}">
    <div class="wealth-group__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${g.color} 14%, transparent); color:${g.color}">${svgIcon(g.icon, 16)}</span>
      <div class="wealth-group__title">
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(g.label)}</p>
        <p class="mini-card__sub">${g.items.length} ${g.items.length === 1 ? "item" : "itens"}</p>
      </div>
      <b class="wealth-group__total" data-ui-css="color:${g.kind === "liability" ? "var(--negative)" : "var(--ink)"}">${g.kind === "liability" ? "−" : ""}${fmtBRL(g.total)}</b>
    </div>
    <div class="asset-list">
      ${g.items.map((a) => renderAssetRow(a, g)).join("")}
    </div>
  </div>`).join("");
}

function renderAssetRow(a, g) {
  const updating = state.wealth.updatingId === a.id;
  const ch = a.change;

  return `<div class="asset-row">
    <div class="asset-row__main">
      <div class="asset-row__info">
        <p class="asset-row__name">${escapeHtml(a.name)}${a.inLedger ? `<span class="asset-row__tag">já nos lançamentos</span>` : ""}</p>
        ${a.note ? `<p class="asset-row__note">${escapeHtml(a.note)}</p>` : ""}
        ${a.monthlyPayment > 0 ? `<p class="asset-row__note">${fmtBRL(a.monthlyPayment)} por mês</p>` : ""}
      </div>
      <div class="asset-row__values">
        <b class="asset-row__value ${a.inLedger ? "is-muted" : ""}">${fmtBRL(a.value)}</b>
        ${ch && Math.abs(ch.value) > 0 ? `<span class="asset-row__delta" data-ui-css="color:${ch.up ? "var(--positive)" : "var(--negative)"}">${ch.up ? "+" : "−"}${fmtBRLShort(Math.abs(ch.value))} no mês</span>` : ""}
      </div>
      <div class="asset-row__actions">
        <button class="icon-btn icon-btn--muted" data-action="wealth-update-open" data-id="${a.id}" aria-label="Atualizar valor de ${escapeHtml(a.name)}">${svgIcon("refresh", 15)}</button>
        <button class="icon-btn icon-btn--muted" data-action="wealth-edit" data-id="${a.id}" aria-label="Editar ${escapeHtml(a.name)}">${svgIcon("pencil", 15)}</button>
        <button class="icon-btn icon-btn--muted" data-action="wealth-delete" data-id="${a.id}" aria-label="Excluir ${escapeHtml(a.name)}">${svgIcon("trash", 15)}</button>
      </div>
    </div>

    ${updating ? `<div class="asset-row__update">
      <div class="field" data-ui-css="margin:0">
        <label class="field__label" for="wealth-update-input">Valor atual em ${escapeHtml(MONTH_NAMES[new Date().getMonth()])}</label>
        <input id="wealth-update-input" class="input" data-field="wealth-update" value="${escapeHtml(state.wealth.updateValue)}" inputmode="decimal" placeholder="0,00" />
      </div>
      <p class="field-hint">O valor anterior fica guardado no histórico; é ele que desenha a curva de evolução.</p>
      <div class="form-actions">
        <button class="btn btn--ghost btn--sm" data-action="wealth-update-cancel">Cancelar</button>
        <button class="btn btn--primary btn--sm" data-action="wealth-update-save" data-id="${a.id}">Atualizar</button>
      </div>
    </div>` : ""}

  </div>`;
}

function freshWealthForm(cls) {
  return { id: null, class: cls || "conta", name: "", value: "", monthlyPayment: "", dueDay: "", note: "", inLedger: false };
}
