// js/screens/calendar.js. Calendário do mês e previsão financeira. Modelos em calendar.js e forecast.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// CALENDÁRIO FINANCEIRO E PREVISÃO (Módulo 4)
// ------------------------------------------------------------------
// Como nas telas anteriores, nenhum cálculo mora aqui: `calendar.js`
// entrega a grade pronta e `forecast.js` entrega o saldo dia a dia.
// Este bloco só decide layout e cor.
// ==================================================================

const CAL_KIND = {
  done:        { label: "Lançado",   color: "var(--ink-faint)" },
  goal:        { label: "Meta",      color: "var(--goal)" },
  installment: { label: "Parcela",   color: "var(--brand)" },
  scheduled:   { label: "Agendado",  color: "var(--brand)" },
  recurring:   { label: "Previsto",  color: "var(--goal)" },
  income:      { label: "Renda",     color: "var(--positive)" },
  liability:   { label: "Dívida",    color: "var(--negative)" },
  late:        { label: "Atrasado",  color: "var(--negative)" },
  "goal-deadline": { label: "Prazo", color: "var(--goal)" },
};

function renderCalendarScreen() {
  const ref = addMonths(new Date(), state.calendar.monthOffset);
  const cal = buildCalendarMonth(state.data, keyOfDate(ref));
  const forecast = forecastModel();
  const selected = state.calendar.selectedDay;

  return `<div class="screen">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <h1 class="page-title">Calendário</h1>
      </div>
      <div class="month-nav">
        <button class="icon-btn" data-action="cal-prev" aria-label="Mês anterior">${svgIcon("chevronLeft", 17)}</button>
        <span class="month-nav__label">${MONTH_ABBR[cal.month]} ${cal.year}</span>
        <button class="icon-btn" data-action="cal-next" aria-label="Próximo mês">${svgIcon("chevronRight", 17)}</button>
      </div>
    </div>

    <div class="grid-dashboard">
      ${renderCalendarSummary(cal)}
      ${renderCalendarGrid(cal)}
      ${selected ? renderCalendarDayPanel(cal, selected) : ""}
      ${renderForecastCard(forecast, true)}
      ${renderAnnualPlanCard()}
      <p class="footnote span-3">Dias com barra cheia já foram lançados; barra vazada é previsão. Nada aqui vira lançamento sozinho; o calendário só antecipa o que já está nos seus dados.</p>
    </div>
  </div>`;
}

// ---- Cabeçalho do mês: realizado x previsto, lado a lado e nunca somados ----
function renderCalendarSummary(cal) {
  const t = cal.totals;
  const netTone = t.net >= 0 ? "var(--positive)" : "var(--negative)";
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <p class="hero-label">Resultado previsto de ${MONTH_NAMES[cal.month]}</p>
    <p class="hero-value">${t.net >= 0 ? "" : "−"}${fmtBRL(Math.abs(t.net))}</p>
    <p class="hero-reserved">${t.count} ${t.count === 1 ? "evento no mês" : "eventos no mês"}${t.lateCount > 0 ? ` · ${t.lateCount} em atraso` : ""}</p>

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("arrowUpRight", 17)}<div>
        <span class="hero-chip__label">Entradas</span>
        <span class="hero-chip__value">${fmtBRL(t.income)}</span>
      </div></div>
      <div class="hero-chip">${svgIcon("arrowDownRight", 17)}<div>
        <span class="hero-chip__label">Saídas</span>
        <span class="hero-chip__value">${fmtBRL(t.expense)}</span>
      </div></div>
      <div class="hero-chip">${svgIcon("clock", 17)}<div>
        <span class="hero-chip__label">Ainda por vir</span>
        <span class="hero-chip__value">${fmtBRL(t.plannedExpense)}</span>
      </div></div>
    </div>

    <div class="cal-split">
      <div class="cal-split__row">
        <span class="cal-split__dot cal-split__dot--done"></span>
        <span>Já lançado</span>
        <b>${fmtBRL(t.realizedExpense)}</b>
      </div>
      <div class="cal-split__row">
        <span class="cal-split__dot cal-split__dot--planned"></span>
        <span>Previsto até o fim do mês</span>
        <b>${fmtBRL(t.plannedExpense)}</b>
      </div>
    </div>
    ${t.lateCount > 0 ? `<p class="cal-late-note" data-ui-css="color:${netTone}">${svgIcon("alertTriangle", 13)} ${fmtBRL(t.lateTotal)} em gastos fixos venceram e ainda não foram lançados.</p>` : ""}
  </div>`;
}

// ---- Grade do mês ----
function renderCalendarGrid(cal) {
  const maxC = cal.weeks.reduce((mx, week) => week.reduce((m, d) => Math.max(m, moneyToCents(d.expense)), mx), 0);
  const selected = state.calendar.selectedDay;

  return `<div class="card span-3">
    <p class="card-title">${escapeHtml(cal.label)}</p>
    <div class="cal-grid" role="grid" aria-label="Calendário de ${escapeHtml(cal.label)}">
      ${cal.weekdays.map((w) => `<span class="cal-weekday">${w}</span>`).join("")}
      ${cal.weeks.map((week) => week.map((d) => {
        if (!d.inMonth) return `<span class="cal-day cal-day--out" aria-hidden="true">${d.day}</span>`;
        const ratio = maxC > 0 ? moneyToCents(d.expense) / maxC : 0;
        const classes = [
          "cal-day",
          d.isToday ? "is-today" : "",
          selected === d.iso ? "is-selected" : "",
          d.hasLate ? "is-late" : "",
          d.count > 0 ? "has-events" : "",
        ].filter(Boolean).join(" ");
        return `<button class="${classes}" data-action="cal-day" data-value="${d.iso}"
          aria-label="${d.day}. ${d.count} ${d.count === 1 ? "evento" : "eventos"}">
          <span class="cal-day__num">${d.day}</span>
          ${d.income > 0 ? `<span class="cal-day__in"></span>` : ""}
          ${d.expense > 0 ? `<span class="cal-day__bar ${d.hasPlanned ? "is-planned" : ""}" data-ui-css="height:${clamp(18 + ratio * 60, 18, 78)}%"></span>` : ""}
        </button>`;
      }).join("")).join("")}
    </div>
    <div class="cal-legend">
      <span><i class="cal-legend__swatch cal-legend__swatch--done"></i>Lançado</span>
      <span><i class="cal-legend__swatch cal-legend__swatch--planned"></i>Previsto</span>
      <span><i class="cal-legend__swatch cal-legend__swatch--in"></i>Entrada</span>
      <span><i class="cal-legend__swatch cal-legend__swatch--late"></i>Atraso</span>
    </div>
    ${cal.heaviest.length > 0 ? `<div class="cal-heavy">
      <p class="card-subtitle" data-ui-css="margin:0 0 8px">Dias mais pesados do mês</p>
      ${cal.heaviest.map((h) => `<button class="cal-heavy__row" data-action="cal-day" data-value="${h.iso}">
        <span class="cal-heavy__date">${fmtDateShort(h.iso)}</span>
        <span class="cal-heavy__count">${h.count} ${h.count === 1 ? "evento" : "eventos"}</span>
        <b>${fmtBRL(h.expense)}</b>
      </button>`).join("")}
    </div>` : ""}
  </div>`;
}

// ---- Painel do dia selecionado ----
function renderCalendarDayPanel(cal, iso) {
  const row = cal.dayOf(iso);
  const events = row ? row.events : [];
  const income = sumMoney(events.filter((e) => e.type === "income"), (e) => e.amount);
  const expense = sumMoney(events.filter((e) => e.type === "expense"), (e) => e.amount);

  return `<div class="card card--elevated span-3">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">${fmtDateFull(iso)}</p>
        <p class="mini-card__sub">${events.length === 0 ? "Nenhum evento neste dia" : `${events.length} ${events.length === 1 ? "evento" : "eventos"}`}</p>
      </div>
      <button class="icon-btn icon-btn--muted" data-action="cal-close-day" aria-label="Fechar detalhes do dia">${svgIcon("x", 16)}</button>
    </div>

    ${events.length === 0
      ? renderEmptyState("calendar", "Dia livre.", "Nenhuma conta, parcela ou recebimento previsto para esta data.")
      : `<div class="bill-list">
        ${events.map((e) => {
          const kind = CAL_KIND[e.kind] || CAL_KIND.scheduled;
          const sign = e.type === "income" ? "+" : (e.type === "marker" ? "" : "−");
          const amountColor = e.type === "income" ? "var(--positive)" : (e.type === "marker" ? "var(--ink-faint)" : "var(--ink)");
          return `<div class="bill-row ${e.done ? "" : "bill-row--planned"}">
            <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${e.color} 14%, transparent); color:${e.color}">${svgIcon(e.icon, 14)}</span>
            <div class="bill-row__info">
              <p class="bill-row__label">${escapeHtml(e.label)}${e.installment ? ` <span class="bill-row__inst">${e.installment}</span>` : ""}</p>
              <p class="bill-row__meta" data-ui-css="color:${kind.color}">${kind.label}${e.certain ? "" : " · estimativa"} · ${escapeHtml(e.categoryName)}</p>
            </div>
            ${e.type === "marker"
              ? `<span class="bill-row__amount" data-ui-css="color:${amountColor}">${e.meta && e.meta.remaining > 0 ? `faltam ${fmtBRL(e.meta.remaining)}` : "no prazo"}</span>`
              : `<span class="bill-row__amount" data-ui-css="color:${amountColor}">${sign}${fmtBRL(e.amount)}</span>`}
          </div>`;
        }).join("")}
      </div>
      <div class="cal-day-total">
        <span>Saldo do dia</span>
        <b data-ui-css="color:${subMoney(income, expense) >= 0 ? "var(--positive)" : "var(--negative)"}">${subMoney(income, expense) >= 0 ? "+" : "−"}${fmtBRL(Math.abs(subMoney(income, expense)))}</b>
      </div>`}
  </div>`;
}

// ---- Previsão financeira ----
// `full = true` mostra gráfico, premissas e alerta de saldo negativo (tela do
// calendário). `full = false` é a versão compacta do Dashboard.
// UMA JANELA VAZIA PRECISA DIZER QUE ESTÁ VAZIA.
//
// A aba padrão são 30 dias, e ela mostrava "+R$ 0,00" com o gráfico reto sempre
// que o próximo evento caía no dia 31 - o caso mais comum de todos, porque
// salário, assinatura e parcela repetem no MESMO dia do mês. Quem declarou
// R$ 5.000 de renda lia o cartão como quebrado. O número está certo: o que
// faltava era dizer que não há nada agendado nessa janela e quando é o próximo.
function forecastNextMoveNote(f, active) {
  if (active.income !== 0 || active.expense !== 0) return "";
  const proximo = (f.days || []).find((d) => d.income !== 0 || d.expense !== 0);
  if (!proximo) {
    return `<p class="forecast-note forecast-note--empty">Nada agendado nos próximos ${active.label}. Lançamentos fixos, parcelas e contas futuras aparecem aqui assim que existirem.</p>`;
  }
  return `<p class="forecast-note forecast-note--empty">Nada agendado nos próximos ${active.label}: o próximo movimento previsto é em <b>${fmtDateFull(proximo.iso)}</b>. Escolha um prazo maior para vê-lo.</p>`;
}

// ==================================================================
// [M29] O FECHAMENTO DO MÊS, PARCELA POR PARCELA
// ==================================================================
// O cartão já dizia o resultado ("R$ 18.587,55 em 30 dias"). O que faltava era
// a conta: de onde sai esse número. Um valor projetado que ninguém consegue
// reconstruir é palpite com tipografia bonita, e é justamente o número que a
// pessoa usa para decidir se pode gastar.
//
// A cadeia vem de `monthCloseForecast` (forecast.js), que lê as parcelas do
// MESMO lugar que produz o saldo diário. A conta exibida fecha no centavo: o
// valor mostrado é o resultado da soma que está na tela, e não um segundo
// número calculado por outro caminho.
//
// Duas colunas de honestidade que o roteiro pede:
//   • margem de segurança é medida no PIOR dia do mês, não no último. Fechar
//     positivo não ajuda quem fica no vermelho no dia 18;
//   • gasto variável é estimativa por média e vem rotulado como tal, ao lado
//     de compromissos que são conhecidos.
function renderMonthClose(f) {
  if (typeof monthCloseForecast !== "function") return "";
  const m = monthCloseForecast(f);
  if (!m) return "";

  const linhas = [
    { label: "Saldo hoje", valor: m.saldoAtual, sinal: "", nota: "o que está nas contas agora" },
    { label: "Receitas previstas", valor: m.receitas, sinal: "+", nota: "entradas já esperadas até o fim do mês" },
    { label: "Contas previstas", valor: m.contas, sinal: "−", nota: "fixas, parcelas e faturas com data" },
    { label: "Gastos variáveis estimados", valor: m.variaveis, sinal: "−", nota: "média dos últimos meses, é estimativa" },
  ];
  const tom = m.risco ? "var(--negative)" : (m.projetado >= m.saldoAtual ? "var(--positive)" : "var(--goal)");

  return `<div class="month-close">
    <p class="card-subtitle month-close__title">Como o mês fecha</p>
    <ul class="month-close__rows">
      ${linhas.map((l) => `<li class="month-close__row">
        <span class="month-close__label"><span class="month-close__line">${l.sinal ? `<b aria-hidden="true">${l.sinal}</b>` : ""}${escapeHtml(l.label)}</span><small>${escapeHtml(l.nota)}</small></span>
        <span class="month-close__value">${fmtBRL(l.valor)}</span>
      </li>`).join("")}
      <li class="month-close__row month-close__row--total">
        <span class="month-close__label">Saldo projetado no fim do mês<small>${fmtDateFull(m.endIso)}</small></span>
        <span class="month-close__value" data-ui-css="color:${tom}">${fmtBRL(m.projetado)}</span>
      </li>
    </ul>
    ${renderDailyAllowance(f)}

    <div class="month-close__flags">
      <p class="month-close__flag">
        ${svgIcon("shieldCheck", 14)}
        <span><b>Margem de segurança</b>: no pior dia do mês, ${fmtDateShort(m.fundoIso)}, o saldo chega a <b>${fmtBRL(m.margem)}</b>.</span>
      </p>
      ${m.risco
        ? `<p class="month-close__flag month-close__flag--risk">${svgIcon("alertTriangle", 14)}<span><b>Risco de fechar negativo</b>: pelo ritmo atual o saldo fica abaixo de zero em <b>${fmtDateFull(m.riscoIso)}</b>.</span></p>`
        : `<p class="month-close__flag">${svgIcon("checkCircle", 14)}<span>Sem risco de saldo negativo no mês, com as informações de hoje.</span></p>`}
    </div>
  </div>`;
}

// [M30] O limite diário fica no mesmo painel do fechamento porque é a MESMA
// conta olhada por outro lado: o que sobra depois de compromissos e da meta,
// dividido pelos dias que faltam. Separá-lo em outro cartão faria parecerem
// dois cálculos independentes que podem discordar.
function renderDailyAllowance(f) {
  if (typeof dailyAllowance !== "function") return "";
  const d = dailyAllowance(state.data, f);
  if (!d || d.alvo <= 0) return "";

  const fonte = d.alvoFonte === "metas"
    ? "do aporte mensal que você planejou nas suas metas"
    : "da fatia de futuro da sua regra de orçamento";

  if (d.apertado) {
    return `<p class="daily-allowance daily-allowance--tight">
      ${svgIcon("info", 14)}
      <span>Para guardar os <b>${fmtBRL(d.alvo)}</b> que você planejou, o mês já não tem folga para gasto variável.
      Isso não bloqueia nada: é a conta dizendo que ou o alvo cede, ou alguma despesa cede.</span>
    </p>`;
  }

  return `<p class="daily-allowance">
    ${svgIcon("target", 14)}
    <span>Para terminar o mês com <b>${fmtBRL(d.alvo)}</b> guardados, sobram <b>${fmtBRL(d.disponivel)}</b> para gasto variável,
    o equivalente a cerca de <b>${fmtBRL(d.porDia)} por dia</b> nos ${d.diasRestantes} dias que faltam.
    O alvo vem de ${fonte}. É referência, não obrigação.</span>
  </p>`;
}

function renderForecastCard(forecast, full) {
  const f = forecast || forecastModel();
  const active = f.horizons.find((h) => h.id === state.forecastHorizon) || f.horizons[1];
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)" }[active.tone];
  const emptyNote = forecastNextMoveNote(f, active);

  const chips = `<div class="horizon-chips">
      ${f.horizons.map((h) => `<button class="horizon-chip ${h.id === active.id ? "active" : ""}" data-action="set-forecast-horizon" data-value="${h.id}">${h.label}</button>`).join("")}
    </div>`;
  const alert = f.negativeDayIso
    ? `<p class="forecast-alert">${svgIcon("alertTriangle", 14)}<span>No ritmo atual seu saldo fica negativo em <b>${fmtDateFull(f.negativeDayIso)}</b>. O menor ponto é ${fmtBRL(f.lowest.value)} em ${fmtDateShort(f.lowest.iso)}.</span></p>`
    : "";

  // Versão compacta do Dashboard: faixa horizontal de largura inteira, para não
  // abrir buraco na grade de três colunas.
  if (!full) {
    return `<div class="card card--forecast span-3">
      <div class="forecast-strip">
        <div class="forecast-strip__main">
          <p class="card-title" data-ui-css="margin:0">Previsão de saldo</p>${renderCalculationButton("forecast")}
          <p class="forecast-value" data-ui-css="color:${tone}">${fmtBRL(active.projected)}</p>
          <p class="forecast-note">em ${active.label} · hoje você tem ${fmtBRL(f.balance)} (${active.delta >= 0 ? "+" : "−"}${fmtBRL(Math.abs(active.delta))})</p>
        </div>
        <div class="forecast-strip__side">
          ${chips}
          <div class="forecast-strip__stats">
            <span>${svgIcon("arrowUpRight", 13)} ${fmtBRL(active.income)}</span>
            <span>${svgIcon("arrowDownRight", 13)} ${fmtBRL(active.expense)}</span>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="nav" data-tab="calendar">${svgIcon("calendar", 14)} Calendário</button>
        </div>
      </div>
      ${emptyNote}${alert}
      ${renderMonthClose(f)}
    </div>`;
  }

  return `<div class="card span-3 card--forecast">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Previsão de saldo</p>
        <p class="mini-card__sub">Hoje: ${fmtBRL(f.balance)}</p>
      </div>
      ${renderCalculationButton("forecast")}
    </div>

    ${chips}

    <p class="forecast-value" data-ui-css="color:${tone}">${fmtBRL(active.projected)}</p>
    <p class="forecast-note">
      ${active.delta >= 0 ? "+" : "−"}${fmtBRL(Math.abs(active.delta))} em ${active.label} ·
      entradas ${fmtBRL(active.income)} · saídas ${fmtBRL(active.expense)}
    </p>

    ${renderForecastChart(f, active)}
    ${emptyNote}${alert}
    ${renderMonthClose(f)}

    <div class="forecast-assumptions">
      <p class="card-subtitle" data-ui-css="margin:0 0 8px">De onde vêm estes números</p>
      <ul class="forecast-list">${f.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
      <p class="field-hint">Quanto mais longe o horizonte, maior a margem de erro: 7 e 30 dias saem quase todos de dados reais; 12 meses depende de médias.</p>
    </div>
  </div>`;
}

function renderForecastChart(f, horizon) {
  const w = 640, h = 170, padTop = 12, padBottom = 22;
  const slice = f.days.slice(0, horizon.days);
  const series = [{ iso: f.today, balance: f.balance }].concat(slice);
  const points = resampleSeries(series, 90);
  const values = points.map((p) => p.balance);
  if (values.length < 2) return "";

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const plotH = h - padTop - padBottom;
  const x = (i) => (i / (points.length - 1)) * w;
  const y = (v) => padTop + plotH - ((v - min) / span) * plotH;
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`);
  const color = values[values.length - 1] >= 0 ? "var(--brand)" : "var(--negative)";
  const gid = `fc-grad-${Math.random().toString(36).slice(2, 8)}`;
  const zeroY = min < 0 ? y(0) : null;

  return `<div class="forecast-chart-wrap">
    <svg class="wealth-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Projeção de saldo para ${horizon.label}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${zeroY != null ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" stroke="var(--negative)" stroke-width="1" stroke-dasharray="4 4"/>` : ""}
      <polygon points="0,${padTop + plotH} ${pts.join(" ")} ${w},${padTop + plotH}" fill="url(#${gid})"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="4" fill="var(--card)" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="chart-axis">
      <span>${fmtDateShort(f.today)}</span>
      <span>${fmtDateShort(horizon.endIso)}</span>
    </div>
  </div>`;
}

// ---- Planejamento anual ----
function renderAnnualPlanCard() {
  const plan = buildAnnualPlan(state.data);
  const open = state.calendar.annualOpen;
  const list = open ? plan.items : plan.upcoming.slice(0, 4);

  return `<div class="card span-3">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Planejamento anual de ${plan.year}</p>
        <p class="mini-card__sub">Datas que chegam todo ano e mesmo assim pegam de surpresa</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="toggle-annual">${open ? "Ver só o que vem" : "Ver o ano todo"}</button>
    </div>

    ${plan.knownTotal > 0 ? `<div class="annual-summary">
      <div><span class="annual-summary__label">Estimado pelo seu histórico</span><b>${fmtBRL(plan.knownTotal)}</b></div>
      <div><span class="annual-summary__label">Guardando por mês</span><b>${fmtBRL(plan.monthlyReserve)}</b></div>
    </div>` : ""}

    <div class="annual-list">
      ${list.map((i) => `<div class="annual-row ${i.passed ? "is-past" : ""} ${i.isCurrent ? "is-current" : ""}">
        <span class="annual-row__month">${i.monthAbbr}</span>
        <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${i.isIncome ? "var(--positive)" : "var(--goal)"} 14%, transparent); color:${i.isIncome ? "var(--positive)" : "var(--goal)"}">${svgIcon(i.icon, 14)}</span>
        <div class="annual-row__info">
          <p class="annual-row__name">${escapeHtml(i.name)}</p>
          <p class="annual-row__note">${escapeHtml(i.note)}</p>
        </div>
        <span class="annual-row__value">${i.estimated
          ? `${i.isIncome ? "+" : ""}${fmtBRL(i.estimated)}<span class="annual-row__from">em ${i.estimatedFrom}</span>`
          : `<span class="annual-row__from">sem histórico</span>`}</span>
      </div>`).join("")}
    </div>
    <p class="field-hint">O valor vem do que você lançou em anos anteriores no mesmo mês; nada é estimado por média de mercado.</p>
  </div>`;
}
