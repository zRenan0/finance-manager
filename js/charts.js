// charts.js; gráficos SVG/HTML minimalistas, sem bibliotecas externas
"use strict";

function renderDonut(segments, size = 176, strokeWidth = 20) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - strokeWidth / 2 - 2;
  const cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  let circles;
  if (total <= 0) {
    circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${strokeWidth}"/>`;
  } else {
    let offset = 0;
    circles = segments.map((seg) => {
      const frac = seg.value / total;
      const len = Math.max(0, frac * c - 2);
      const html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
      offset += frac * c;
      return html;
    }).join("");
  }
  return `<div class="donut" data-ui-css="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${circles}</svg>
    <div class="donut__center">
      <span class="donut__value">${fmtBRL(total).replace("R$", "").trim()}</span>
      <span class="donut__label">total</span>
    </div>
  </div>`;
}

function renderTrendChart(months) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  return `<div class="trend-chart">
    ${months.map((m) => `
      <div class="trend-col">
        <div class="trend-bars" title="${escapeHtml(m.label)}: entradas ${fmtBRL(m.income)}, gastos ${fmtBRL(m.expense)}">
          <div class="trend-bar trend-bar--income" data-ui-css="height:${Math.max(3, (m.income / max * 100)).toFixed(1)}%"></div>
          <div class="trend-bar trend-bar--expense" data-ui-css="height:${Math.max(3, (m.expense / max * 100)).toFixed(1)}%"></div>
        </div>
        <span class="trend-label">${escapeHtml(m.label)}</span>
      </div>`).join("")}
  </div>`;
}

// ==================================================================
// MOTOR "WHAT-IF"; simulação de cenários futuros com juros compostos
// ==================================================================
// Projeta, mês a mês, o patrimônio financeiro em dois cenários paralelos:
//
//   • REAL      → mantém o ritmo atual (saldo de hoje + sobra mensal média,
//                 rendendo à taxa informada).
//   • SIMULADO  → aplica a decisão que o usuário quer testar:
//                   - "aporte"        : guardar um valor extra todo mês;
//                   - "financiamento" : dar uma entrada e pagar N parcelas.
//
// Tudo é matemática pura, sem dependência de DOM; o renderizador logo abaixo
// desenha as duas linhas sobrepostas no mesmo SVG para comparação direta.
// ==================================================================

// Converte taxa anual (%) em taxa mensal equivalente (juros compostos).

function monthlyRateFromAnnual(annualRatePct) {
  const a = Math.max(-99, Number(annualRatePct) || 0);
  return Math.pow(1 + a / 100, 1 / 12) - 1;
}

// Tabela Price: valor da parcela fixa de um financiamento.

function pmt(principal, monthlyRate, months) {
  const n = Math.max(1, Math.round(months));
  const p = Math.max(0, roundMoney(principal));
  if (p === 0) return 0;
  if (!monthlyRate || Math.abs(monthlyRate) < 1e-9) return divMoney(p, n);
  const f = Math.pow(1 + monthlyRate, n);
  return roundMoney((p * monthlyRate * f) / (f - 1));   // parcela é dinheiro: 2 casas
}

// Projeta uma série de patrimônio acumulado com aportes mensais e juros compostos.
// contributionAt(m) permite que o aporte varie ao longo do tempo (ex.: parcela
// que acaba no mês 48 e libera o fluxo de caixa de novo).
function projectSeries({ start = 0, months = 120, monthlyRate = 0, contributionAt = () => 0 }) {
  const out = [{ month: 0, value: roundMoney(start), contributed: roundMoney(start), interest: 0 }];
  let value = roundMoney(start);
  let contributed = roundMoney(start);
  for (let m = 1; m <= months; m++) {
    const c = roundMoney(contributionAt(m));
    value = addMoney(mulMoney(value, 1 + monthlyRate), c);
    contributed = addMoney(contributed, c);
    out.push({ month: m, value, contributed, interest: subMoney(value, contributed) });
  }
  return out;
}

// ------------------------------------------------------------------
// Cenário completo: linha real x linha simulada + resumo comparativo.
// params:
//   startingBalance   saldo/patrimônio de hoje
//   monthlySurplus    sobra média mensal atual (renda − gastos)
//   annualRatePct     rendimento anual esperado do dinheiro guardado
//   years             horizonte da projeção
//   mode              "aporte" | "financiamento"
//   extraContribution valor extra guardado por mês (modo aporte)
//   financing         { valorBem, entrada, meses, jurosAnualPct } (modo financiamento)
// ------------------------------------------------------------------
function computeWhatIfScenario(params) {
  const years = clamp(Number(params.years) || 10, 1, 40);
  const months = Math.round(years * 12);
  const monthlyRate = monthlyRateFromAnnual(params.annualRatePct);
  const start = Number(params.startingBalance) || 0;
  const surplus = Number(params.monthlySurplus) || 0;
  const mode = params.mode === "financiamento" ? "financiamento" : "aporte";

  // ---- Cenário real: nada muda ----
  const baseline = projectSeries({ start, months, monthlyRate, contributionAt: () => surplus });

  let simulated, summary;

  if (mode === "aporte") {
    const extra = Math.max(0, Number(params.extraContribution) || 0);
    simulated = projectSeries({ start, months, monthlyRate, contributionAt: () => surplus + extra });

    const finalBase = baseline[baseline.length - 1].value;
    const finalSim = simulated[simulated.length - 1].value;
    const totalAportado = extra * months;
    summary = {
      mode,
      finalBase, finalSim,
      diferenca: finalSim - finalBase,
      totalAportado,
      jurosGerados: (finalSim - finalBase) - totalAportado,
      parcela: null, custoJuros: null, totalPago: null,
      comprometimentoPct: surplus > 0 ? (extra / surplus) * 100 : null,
      viavel: extra <= Math.max(0, surplus),
      months,
    };
  } else {
    const f = params.financing || {};
    const valorBem = Math.max(0, Number(f.valorBem) || 0);
    const entrada = clamp(Number(f.entrada) || 0, 0, valorBem);
    const nParcelas = clamp(Math.round(Number(f.meses) || 12), 1, months);
    const jurosFin = monthlyRateFromAnnual(f.jurosAnualPct);
    const financiado = Math.max(0, valorBem - entrada);
    const parcela = pmt(financiado, jurosFin, nParcelas);
    const totalPago = entrada + parcela * nParcelas;
    const custoJuros = totalPago - valorBem;

    // A entrada sai do bolso hoje; a parcela consome a sobra até acabar.

    simulated = projectSeries({
      start: start - entrada,
      months,
      monthlyRate,
      contributionAt: (m) => surplus - (m <= nParcelas ? parcela : 0),
    });

    const finalBase = baseline[baseline.length - 1].value;
    const finalSim = simulated[simulated.length - 1].value;
    summary = {
      mode,
      finalBase, finalSim,
      diferenca: finalSim - finalBase,
      totalAportado: null,
      jurosGerados: null,
      valorBem, entrada, nParcelas, parcela, totalPago, custoJuros,
      custoJurosPct: valorBem > 0 ? (custoJuros / valorBem) * 100 : 0,
      comprometimentoPct: surplus > 0 ? (parcela / surplus) * 100 : null,
      viavel: parcela <= Math.max(0, surplus),
      months,
    };
  }

  // Primeiro mês em que o cenário simulado passa a ser melhor que o real.

  let breakevenMonth = null;
  for (let i = 1; i < simulated.length; i++) {
    if (simulated[i].value >= baseline[i].value) { breakevenMonth = i; break; }
  }
  summary.breakevenMonth = breakevenMonth;
  summary.ficaNegativo = simulated.some((p) => p.value < 0);

  return { baseline, simulated, summary, months, monthlyRate };
}

// Reduz a série para caber no SVG sem centenas de segmentos.
// Apelido da implementação única de utils.js (era uma cópia literal de
// downsampleSeries, em investments.js).
function sampleSeries(series, targetPoints = 72) {
  return resampleSeries(series, targetPoints);
}

// ------------------------------------------------------------------
// Gráfico comparativo: linha do cenário real + linha de projeção paralela
// do cenário simulado, no mesmo estilo minimalista dos demais gráficos.
// ------------------------------------------------------------------
function renderWhatIfChart(scenario, opts = {}) {
  const w = opts.width || 600, h = opts.height || 220, pad = 10;
  const base = sampleSeries(scenario.baseline);
  const sim = sampleSeries(scenario.simulated);
  const totalMonths = scenario.months || 1;

  const allValues = base.concat(sim).map((p) => p.value);
  const maxVal = Math.max(1, ...allValues);
  const minVal = Math.min(0, ...allValues);
  const span = maxVal - minVal || 1;

  const xScale = (m) => pad + (totalMonths > 0 ? m / totalMonths : 0) * (w - 2 * pad);
  const yScale = (v) => h - pad - ((v - minVal) / span) * (h - 2 * pad);
  const pathOf = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.month).toFixed(1)} ${yScale(p.value).toFixed(1)}`).join(" ");

  const basePath = pathOf(base);
  const simPath = pathOf(sim);
  const areaPath = `${basePath} L ${xScale(totalMonths).toFixed(1)} ${yScale(minVal).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(minVal).toFixed(1)} Z`;
  const zeroY = yScale(0).toFixed(1);
  const gid = "whatIfFill" + (opts.idSuffix || "");

  return `<svg viewBox="0 0 ${w} ${h}" class="invest-chart" preserveAspectRatio="none" role="img" aria-label="Comparação entre o cenário atual e o cenário simulado">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${minVal < 0 ? `<line x1="0" y1="${zeroY}" x2="${w}" y2="${zeroY}" stroke="var(--negative)" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.6"/>` : ""}
    <path d="${areaPath}" fill="url(#${gid})" stroke="none"/>
    <path d="${basePath}" fill="none" stroke="var(--brand)" stroke-width="3"/>
    <path d="${simPath}" fill="none" stroke="var(--goal)" stroke-width="3" stroke-dasharray="7 5"/>
  </svg>`;
}

// ==================================================================
// [M7] GRÁFICOS DE INSIGHTS
// ------------------------------------------------------------------
// Três desenhos novos, todos SVG/HTML puro e todos com uma regra em
// comum: NENHUMA cor é escolhida aqui. Intensidade, tom e destaque
// chegam prontos do modelo (em `--tone` ou em `style`), como no
// Módulo 2; assim uma função de desenho nunca decide se um número é
// bom ou ruim.
// ==================================================================

// Mapa de calor mensal (§16). Uma célula por dia, em grade de semana,
// com a opacidade proporcional ao gasto do dia. Dias futuros ficam
// vazados: pintar zero num dia que ainda não chegou faria o fim do mês
// parecer barato.
function renderHeatmap(heatmap, opts) {
  const o = opts || {};
  const labels = ["D", "S", "T", "Q", "Q", "S", "S"];
  const blanks = heatmap.firstWeekday || 0;
  const cells = [];
  for (let i = 0; i < blanks; i++) cells.push('<div class="heat-cell heat-cell--blank" aria-hidden="true"></div>');
  heatmap.days.forEach((d) => {
    // Piso de 8% para o dia com gasto não sumir; 0 real fica sem preenchimento.
    const alpha = d.value > 0 ? Math.max(0.08, d.intensity) : 0;
    const title = d.value > 0
      ? `${fmtDateShort(d.iso)}: ${fmtBRL(d.value)} em ${d.count} ${d.count === 1 ? "lançamento" : "lançamentos"}`
      : `${fmtDateShort(d.iso)}: sem gastos`;
    // O contraste do número é decidido no JS, onde a intensidade é conhecida:
    // um seletor de CSS não consegue comparar valores numéricos de variável.
    cells.push(`<button type="button" class="heat-cell ${alpha >= 0.55 ? "is-dark" : ""} ${d.future ? "is-future" : ""} ${d.weekend ? "is-weekend" : ""} ${o.selected === d.iso ? "is-selected" : ""}"
      data-ui-css="--heat:${alpha.toFixed(3)}"
      ${o.action ? `data-action="${o.action}" data-value="${d.iso}"` : "disabled"}
      title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      <span>${d.day}</span>
    </button>`);
  });
  return `<div class="heatmap">
    <div class="heatmap__head" aria-hidden="true">${labels.map((l) => `<span>${l}</span>`).join("")}</div>
    <div class="heatmap__grid">${cells.join("")}</div>
    <div class="heatmap__scale" aria-hidden="true">
      <span>menos</span>
      <i data-ui-css="--heat:0.12"></i><i data-ui-css="--heat:0.35"></i><i data-ui-css="--heat:0.6"></i><i data-ui-css="--heat:0.85"></i><i data-ui-css="--heat:1"></i>
      <span>mais</span>
    </div>
  </div>`;
}

// Barras horizontais comparativas; usadas para dia da semana e horário.
// `rows`: [{ label, value, hint, highlight }].
function renderBarList(rows, opts) {
  const o = opts || {};
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="barlist">
    ${rows.map((r) => `<div class="barlist__row ${r.highlight ? "is-top" : ""}">
      <span class="barlist__label">${escapeHtml(r.label)}</span>
      <span class="barlist__track"><span class="barlist__fill" data-ui-css="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%; background:${r.color || "var(--brand)"}"></span></span>
      <span class="barlist__value">${o.format ? o.format(r.value) : fmtBRL(r.value)}</span>
    </div>${r.hint ? `<span class="barlist__hint">${escapeHtml(r.hint)}</span>` : ""}`).join("")}
  </div>`;
}

// Barras divergentes: cresceu para a direita, encolheu para a esquerda,
// tudo na mesma escala. É a única forma de ver, num relance, se o mês
// piorou ou melhorou no saldo das mudanças.
function renderDivergingBars(rows) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.diff)));
  return `<div class="diverge">
    ${rows.map((r) => {
      const pctWidth = (Math.abs(r.diff) / max) * 50;
      const up = r.diff > 0;
      return `<div class="diverge__row">
        <span class="diverge__label"><span class="cat-dot" data-ui-css="background:${r.color}"></span>${escapeHtml(r.name)}</span>
        <span class="diverge__track">
          <span class="diverge__axis"></span>
          <span class="diverge__fill ${up ? "is-up" : "is-down"}"
            data-ui-css="width:${pctWidth.toFixed(1)}%; ${up ? "left:50%" : `left:${(50 - pctWidth).toFixed(1)}%`}"></span>
        </span>
        <span class="diverge__value" data-ui-css="color:${up ? "var(--negative)" : "var(--positive)"}">${up ? "+" : "−"}${fmtBRL(Math.abs(r.diff)).replace("R$", "").trim()}</span>
      </div>`;
    }).join("")}
  </div>`;
}
