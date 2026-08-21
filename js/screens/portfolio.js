// js/screens/portfolio.js. Carteira de investimentos. Cálculo em portfolio.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// MÓDULO 5. CENTRAL DE INVESTIMENTOS
// ------------------------------------------------------------------
// A carteira é a mesma coleção `assets` do Módulo 3 (classe "investimento").
// Esta tela não cria um cadastro paralelo: ela acrescenta o DETALHE que
// transforma "quanto eu tenho aplicado" em "quanto isso está rendendo".
// Todo cálculo mora em portfolio.js; aqui só há HTML.
// ==================================================================

function freshPortfolioForm(typeId) {
  return {
    id: null, invType: typeId || "tesouro-selic", name: "",
    value: "", invested: "", dividends: "", startedAt: todayIso(), note: "",
  };
}

function renderPortfolioScreen() {
  const m = portfolioModel(state.portfolio.months);
  const f = state.portfolio.form;

  return `<div class="screen">
    <div class="screen-header">
      <div>
        <p class="eyebrow">Central de investimentos</p>
        <h1 class="page-title">Minha carteira</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn--ghost btn--sm" data-action="nav" data-tab="simulators">${svgIcon("sparkles", 15)} Simuladores</button>
        <button class="btn btn--primary btn--sm" data-action="pf-new">${svgIcon("plus", 15)} Aplicação</button>
      </div>
    </div>

    <div class="grid-dashboard">
      ${renderPortfolioHero(m)}
      ${f ? renderPortfolioForm(f) : ""}
      ${m.hasItems ? renderPortfolioChartCard(m) : ""}
      ${m.benchmark.comparable ? renderPortfolioBenchmarkCard(m) : ""}
      ${m.allocation.length > 0 ? renderPortfolioAllocationCard(m) : ""}
      ${m.insights.length > 0 ? renderPortfolioInsightsCard(m) : ""}
      ${renderPortfolioGroups(m)}
      <p class="footnote span-3">O valor de mercado de cada aplicação é o que entra no seu patrimônio. Os proventos recebidos entram apenas no cálculo de rentabilidade; o dinheiro deles, quando cai na conta, já é um lançamento de receita, e somá-lo aqui contaria duas vezes.</p>
    </div>
  </div>`;
}

// ---- Painel principal ----
function renderPortfolioHero(m) {
  const t = m.totals;
  const tone = t.up ? "var(--positive)" : "var(--negative)";
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <p class="hero-label">Total aplicado (valor de mercado)</p>
    <p class="hero-value">${fmtBRL(t.value)}</p>
    ${t.returnPct != null ? `<p class="hero-reserved">${svgIcon(t.up ? "arrowUpRight" : "arrowDownRight", 14)} ${t.up ? "+" : "−"}${fmtBRL(Math.abs(t.totalReturn))} (${t.up ? "+" : "−"}${fmtNum(Math.abs(t.returnPct))}%) sobre o que você aportou</p>` : ""}

    ${m.groups.length > 0 ? `<div class="wealth-bar" role="img" aria-label="Composição da carteira por classe">
      ${m.groups.map((g) => `<div class="wealth-bar__seg" data-ui-css="flex:${Math.max(g.value, 1)}; background:${g.color}" title="${escapeHtml(g.label)}"></div>`).join("")}
    </div>` : ""}

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("piggy", 17)}<div><span class="hero-chip__label">Total aportado</span><span class="hero-chip__value">${fmtBRL(t.invested)}</span></div></div>
      <div class="hero-chip">${svgIcon(t.up ? "trendUp" : "arrowDownRight", 17)}<div><span class="hero-chip__label">${t.up ? "Lucro" : "Prejuízo"}</span><span class="hero-chip__value" data-ui-css="color:${tone}">${fmtBRL(Math.abs(t.profit))}</span></div></div>
      ${t.dividends > 0 ? `<div class="hero-chip">${svgIcon("gift", 17)}<div><span class="hero-chip__label">Proventos</span><span class="hero-chip__value">${fmtBRL(t.dividends)}</span></div></div>` : ""}
      ${t.annualizedPct != null ? `<div class="hero-chip">${svgIcon("bolt", 17)}<div><span class="hero-chip__label">Rentabilidade a.a.</span><span class="hero-chip__value">${fmtNum(t.annualizedPct)}%</span></div></div>` : ""}
      ${t.realPct != null ? `<div class="hero-chip">${svgIcon("shieldCheck", 17)}<div><span class="hero-chip__label">Acima da inflação</span><span class="hero-chip__value">${fmtNum(t.realPct)}%</span></div></div>` : ""}
    </div>

    ${m.contributionThisMonth > 0 ? `<p class="hero-reserved" data-ui-css="margin-top:12px">${svgIcon("checkCircle", 14)} Você aportou ${fmtBRL(m.contributionThisMonth)} este mês</p>` : ""}
  </div>`;
}

// ---- Formulário de cadastro/edição ----
function renderPortfolioForm(f) {
  const type = investmentTypeOf(f.invType);
  const editing = !!f.id;

  return `<div class="card card--elevated span-3">
    <p class="card-title">${editing ? "Editar aplicação" : "Nova aplicação"}</p>

    <div class="field"><p class="field__label">Tipo de aplicação</p>
      <div class="class-picker">
        ${INVESTMENT_TYPES.map((t) => `<button class="class-chip ${f.invType === t.id ? "active" : ""}" data-ui-css="--tone:${t.color}" data-action="pf-set-type" data-value="${t.id}">
          <span>${escapeHtml(t.label)}</span>
        </button>`).join("")}
      </div>
      <p class="field-hint">${escapeHtml(type.hint)}</p>
    </div>

    <div class="field"><label class="field__label" for="pf-name-input">Nome</label>
      <input id="pf-name-input" class="input" data-field="pf-name" value="${escapeHtml(f.name)}" placeholder="Ex: CDB Banco X 110% CDI" autocomplete="off" maxlength="60" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="pf-value-input">Valor de mercado hoje</label>
        <input id="pf-value-input" class="input" data-field="pf-value" value="${escapeHtml(f.value)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">É este número que entra no seu patrimônio.</p></div>
      <div class="field"><label class="field__label" for="pf-invested-input">Total aportado (custo)</label>
        <input id="pf-invested-input" class="input" data-field="pf-invested" value="${escapeHtml(f.invested)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">Quanto saiu do seu bolso. Sem ele não há como calcular rentabilidade.</p></div>
    </div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="pf-started-input">Aplicado desde</label>
        <input id="pf-started-input" class="input" type="date" data-field="pf-started" value="${escapeHtml(f.startedAt)}" /></div>
      <div class="field"><label class="field__label" for="pf-dividends-input">Proventos já recebidos</label>
        <input id="pf-dividends-input" class="input" data-field="pf-dividends" value="${escapeHtml(f.dividends)}" inputmode="decimal" placeholder="0,00" />
        <p class="field-hint">Dividendos, JCP e aluguéis de FII acumulados.</p></div>
    </div>

    <div class="field"><label class="field__label" for="pf-note-input">Observação (opcional)</label>
      <input id="pf-note-input" class="input" data-field="pf-note" value="${escapeHtml(f.note)}" placeholder="Ex: vence em 2029, corretora Y" autocomplete="off" maxlength="140" /></div>

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="pf-cancel">Cancelar</button>
      <button class="btn btn--primary" data-action="pf-save">${editing ? "Salvar alterações" : "Cadastrar"}</button>
    </div>
  </div>`;
}

// ---- Evolução da carteira ----
function renderPortfolioChartCard(m) {
  const opts = [6, 12, 24];
  const d = m.delta;
  return `<div class="card span-2">
    <div class="wealth-chart__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Evolução da carteira</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Reconstruída com o valor que cada aplicação tinha em cada mês.</p>
      </div>
      <div class="seg-control">
        ${opts.map((o) => `<button class="seg-control__btn ${m.months === o ? "active" : ""}" data-action="pf-months" data-value="${o}">${o}m</button>`).join("")}
      </div>
    </div>
    ${renderWealthChart(m.series, 640, 170)}
    <div class="wealth-axis">${m.series.map((p, i) => `<span class="${p.isCurrent ? "is-current" : ""}">${i % Math.ceil(m.series.length / 6) === 0 || p.isCurrent ? escapeHtml(p.label) : ""}</span>`).join("")}</div>
    ${d.comparable ? `<p class="health-note">${m.months === 1 ? "No último mês" : `Nos últimos ${m.months} meses`} a carteira ${d.up ? "cresceu" : "recuou"} <b data-ui-css="color:${d.up ? "var(--positive)" : "var(--negative)"}">${fmtBRL(Math.abs(d.value))}</b> (${d.up ? "+" : "−"}${fmtNum(Math.abs(d.pct))}%). O gráfico mistura aporte novo e rendimento; para separar os dois, veja a comparação com o CDI abaixo.</p>` : ""}
  </div>`;
}

// ---- Comparação com os índices ----
function renderPortfolioBenchmarkCard(m) {
  const b = m.benchmark;
  const rows = [
    { label: "Sua carteira", value: b.portfolioPct, color: "var(--brand)", strong: true },
    { label: "CDI", value: b.cdiPct, color: "var(--goal)" },
    { label: "Poupança", value: b.poupancaPct, color: "var(--ink-faint)" },
    { label: "Inflação (IPCA)", value: b.ipcaPct, color: "var(--negative)" },
  ];
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);

  return `<div class="card">
    <p class="card-title">Contra os índices</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Mesmo prazo médio da sua carteira: ${fmtNum(b.months)} meses.</p>
    <div class="bench-list">
      ${rows.map((r) => `<div class="bench-row ${r.strong ? "bench-row--strong" : ""}">
        <span class="bench-row__label">${escapeHtml(r.label)}</span>
        <div class="bench-row__track"><div class="bench-row__fill" data-ui-css="width:${Math.max(2, (Math.abs(r.value) / max) * 100).toFixed(1)}%; background:${r.color}"></div></div>
        <b class="bench-row__value" data-ui-css="color:${r.value < 0 ? "var(--negative)" : "var(--ink)"}">${fmtNum(r.value)}%</b>
      </div>`).join("")}
    </div>
    <p class="health-note">${b.beatsCdi
      ? `Sua carteira está <b data-ui-css="color:var(--positive)">${fmtNum(Math.abs(b.diffCdi))} pontos acima do CDI</b> no período.`
      : `Sua carteira está <b data-ui-css="color:var(--negative)">${fmtNum(Math.abs(b.diffCdi))} pontos abaixo do CDI</b> no período. Em renda variável isso é normal no curto prazo; se persistir por anos, o problema costuma ser taxa de administração.`}</p>
  </div>`;
}

// ---- Alocação por tipo ----
function renderPortfolioAllocationCard(m) {
  const segments = m.allocation.map((row) => ({ value: row.value, color: row.type.color }));
  return `<div class="card">
    <p class="card-title">Alocação</p>
    <div class="donut-wrap">${renderDonut(segments, 168, 20)}</div>
    <div class="pf-legend">
      ${m.allocation.map((row) => `<div class="pf-legend__item">
        <span class="cat-dot" data-ui-css="background:${row.type.color}"></span>
        <div class="pf-legend__text">
          <span class="pf-legend__label">${escapeHtml(row.type.label)} · ${row.pct.toFixed(0)}%</span>
          <span class="pf-legend__note">${row.count} ${row.count === 1 ? "aplicação" : "aplicações"}</span>
        </div>
        <b>${fmtBRL(row.value)}</b>
      </div>`).join("")}
    </div>
    <div class="pf-groups-summary">
      ${m.groups.map((g) => `<div class="pf-group-pill" data-ui-css="--tone:${g.color}">
        <span>${escapeHtml(g.label)}</span><b>${g.pct.toFixed(0)}%</b>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Diagnóstico ----
function renderPortfolioInsightsCard(m) {
  const toneColor = { warn: "var(--negative)", ok: "var(--positive)", info: "var(--goal)" };
  return `<div class="card span-3">
    <p class="card-title">O que olhar na sua carteira</p>
    <div class="pf-insights">
      ${m.insights.map((i) => `<div class="pf-insight" data-ui-css="--tone:${toneColor[i.tone] || "var(--goal)"}">
        <span class="pf-insight__icon">${svgIcon(i.icon, 16)}</span>
        <div>
          <b>${escapeHtml(i.title)}</b>
          <span>${escapeHtml(i.text)}</span>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Listas por classe ----
function renderPortfolioGroups(m) {
  if (!m.hasItems) {
    return `<div class="card span-3">
      ${renderEmptyState("trendUp", "Nenhuma aplicação cadastrada ainda.", "Cadastre o que você já tem aplicado. Tesouro, CDB, ações, FIIs, cripto; para acompanhar rentabilidade, alocação e comparação com o CDI.")}
      <button class="btn btn--primary btn--block btn--sm" data-action="pf-new">Cadastrar a primeira aplicação</button>
    </div>`;
  }
  return m.groups.map((g) => `<div class="card span-3">
    <div class="wealth-group__head">
      <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${g.color} 14%, transparent); color:${g.color}">${svgIcon("trendUp", 17)}</span>
      <div class="wealth-group__title">
        <b>${escapeHtml(g.label)}</b>
        <span>${g.count} ${g.count === 1 ? "aplicação" : "aplicações"} · ${g.pct.toFixed(0)}% da carteira</span>
      </div>
      <b class="wealth-group__total">${fmtBRL(g.value)}</b>
    </div>
    <div class="pf-list">
      ${g.items.map((it) => renderPortfolioRow(it)).join("")}
    </div>
  </div>`).join("");
}

function renderPortfolioRow(it) {
  const open = state.portfolio.expandedId === it.id;
  const updating = state.portfolio.updatingId === it.id;
  const dividing = state.portfolio.dividendId === it.id;
  const tone = it.up ? "var(--positive)" : "var(--negative)";

  return `<div class="pf-item ${open ? "is-open" : ""}">
    <button class="pf-item__head" data-action="pf-toggle" data-id="${it.id}" aria-expanded="${open ? "true" : "false"}">
      <span class="cat-dot" data-ui-css="background:${it.type.color}"></span>
      <span class="pf-item__name">
        <b>${escapeHtml(it.name)}</b>
        <span>${escapeHtml(it.type.label)} · ${it.share.toFixed(0)}% da carteira</span>
      </span>
      <span class="pf-item__figures">
        <b>${fmtBRL(it.value)}</b>
        ${it.returnPct != null ? `<span data-ui-css="color:${tone}">${it.up ? "+" : "−"}${fmtNum(Math.abs(it.returnPct))}%</span>` : `<span class="pf-item__nodata">sem custo</span>`}
      </span>
      ${svgIcon(open ? "chevronDown" : "chevronRight", 15, "pf-item__chevron")}
    </button>

    ${!open ? "" : `<div class="pf-item__body">
      <div class="health-grid">
        <div class="health-stat"><span>Total aportado</span><b>${it.hasCost ? fmtBRL(it.invested) : "Sem dados"}</b></div>
        <div class="health-stat"><span>${it.up ? "Lucro" : "Prejuízo"}</span><b data-ui-css="color:${tone}">${it.hasCost ? fmtBRL(Math.abs(it.profit)) : "Sem dados"}</b></div>
        <div class="health-stat"><span>Proventos</span><b>${fmtBRL(it.dividends)}</b></div>
        <div class="health-stat"><span>Rentabilidade a.a.</span><b>${it.annualizedPct != null ? `${fmtNum(it.annualizedPct)}%` : "Sem dados"}</b></div>
        <div class="health-stat"><span>Acima da inflação</span><b>${it.realPct != null ? `${fmtNum(it.realPct)}%` : "Sem dados"}</b></div>
        <div class="health-stat"><span>No mês</span><b data-ui-css="color:${it.monthDelta.comparable ? (it.monthDelta.pct >= 0 ? "var(--positive)" : "var(--negative)") : "var(--ink-faint)"}">${it.monthDelta.comparable ? `${it.monthDelta.pct >= 0 ? "+" : "−"}${fmtNum(Math.abs(it.monthDelta.pct))}%` : "Sem dados"}</b></div>
      </div>
      ${it.annualizedPct == null && it.hasCost ? `<p class="field-hint">Menos de 3 meses de aplicação: o app mostra o retorno acumulado (${fmtNum(it.returnPct)}%) e não anualiza; anualizar prazo curto produz número enganoso.</p>` : ""}
      ${it.note ? `<p class="field-hint">${escapeHtml(it.note)}</p>` : ""}

      <div class="pf-item__actions">
        <button class="btn btn--ghost btn--sm" data-action="pf-update-open" data-id="${it.id}">${svgIcon("refresh", 14)} Atualizar valor</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-dividend-open" data-id="${it.id}">${svgIcon("gift", 14)} Provento</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-edit" data-id="${it.id}">${svgIcon("pencil", 14)} Editar</button>
        <button class="btn btn--ghost btn--sm" data-action="pf-delete" data-id="${it.id}">${svgIcon("trash", 14)} Excluir</button>
      </div>

      ${updating ? `<div class="asset-row__update">
        <div class="field" data-ui-css="margin:0">
          <label class="field__label" for="pf-update-input">Valor de mercado em ${escapeHtml(MONTH_NAMES[new Date().getMonth()])}</label>
          <input id="pf-update-input" class="input" data-field="pf-update" value="${escapeHtml(state.portfolio.updateValue)}" inputmode="decimal" placeholder="0,00" />
        </div>
        <p class="field-hint">O valor anterior não é apagado: ele vira um ponto no histórico e é o que desenha a curva de evolução.</p>
        <div class="form-actions">
          <button class="btn btn--ghost btn--sm" data-action="pf-update-cancel">Cancelar</button>
          <button class="btn btn--primary btn--sm" data-action="pf-update-save" data-id="${it.id}">Atualizar</button>
        </div>
      </div>` : ""}

      ${dividing ? `<div class="asset-row__update">
        <div class="field" data-ui-css="margin:0">
          <label class="field__label" for="pf-dividend-input">Provento recebido agora</label>
          <input id="pf-dividend-input" class="input" data-field="pf-dividend" value="${escapeHtml(state.portfolio.dividendValue)}" inputmode="decimal" placeholder="0,00" />
        </div>
        <p class="field-hint">Soma ao total de proventos desta aplicação e entra na rentabilidade. Não altera o patrimônio; se o dinheiro caiu na sua conta, lance-o como receita normalmente.</p>
        <div class="form-actions">
          <button class="btn btn--ghost btn--sm" data-action="pf-dividend-cancel">Cancelar</button>
          <button class="btn btn--primary btn--sm" data-action="pf-dividend-save" data-id="${it.id}">Registrar</button>
        </div>
      </div>` : ""}

    </div>`}
  </div>`;
}
