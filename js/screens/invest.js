// js/screens/invest.js. Máquina do tempo dos juros compostos e motor What-If.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// FEATURE 3. Máquina do tempo dos juros compostos ("Investimentos")
// ==================================================================
function renderInvestScreen() {
  return `<div class="screen">
    <div class="screen-header">
      <div>
        <p class="eyebrow">Máquina do tempo</p>
        <h1 class="page-title">Juros compostos</h1>
      </div>
    </div>

    <div class="grid-2">${renderCompoundSimCards()}</div>

    ${renderWhatIfCard()}
  </div>`;
}

// [M5] Os dois cartões da máquina do tempo foram extraídos para cá sem
// nenhuma alteração de conteúdo: agora servem tanto a esta tela quanto ao
// simulador de juros compostos da nova central de Simuladores. Uma marcação
// só, um comportamento só.
function renderCompoundSimCards() {
  const inv = state.invest;
  const inicial = Math.max(0, moneyOrZero(inv.inicial));
  const aporte = Math.max(0, moneyOrZero(inv.aporte));
  const anos = clamp(parseInt(inv.anos, 10) || 1, 1, 40);
  const taxa = clamp(moneyOrZero(inv.taxa), 0, 30);
  const ratePresets = investmentRatePresets(state.data);

  const sim = simulateCompoundInterest({ initial: inicial, monthlyContribution: aporte, years: anos, annualRatePct: taxa });
  return `      <div class="card">
        <p class="card-title">Sua simulação</p>
        <p class="card-subtitle" data-ui-css="margin-top:0">Arraste para ver como aportes recorrentes viram patrimônio ao longo do tempo. Nada aqui é lançado na sua conta; é só uma projeção.</p>

        <div class="invest-field">
          <div class="invest-field__head"><span>Valor inicial</span><b>${fmtBRL(inicial)}</b></div>
          <input id="invest-inicial-input" class="input" data-field="invest-inicial" inputmode="decimal" value="${escapeHtml(inv.inicial)}" placeholder="0,00" autocomplete="off" />
        </div>

        <div class="invest-field">
          <div class="invest-field__head"><span>Aporte mensal</span><b>${fmtBRL(aporte)}</b></div>
          <input type="number" inputmode="decimal" id="invest-aporte-range-input" class="input input--stepper" min="0" max="5000" step="25" data-field="invest-aporte-range" value="${clamp(aporte, 0, 5000)}" placeholder="0" />
        </div>

        <div class="invest-field">
          <div class="invest-field__head"><span>Prazo</span><b>${anos} ${anos === 1 ? "ano" : "anos"}</b></div>
          <input type="number" inputmode="numeric" id="invest-anos-range-input" class="input input--stepper" min="1" max="40" step="1" data-field="invest-anos-range" value="${anos}" placeholder="1" />
        </div>

        <div class="invest-field">
          <div class="invest-field__head"><span>Taxa de juros ao ano</span><b>${fmtNum(taxa)}%</b></div>
          <input type="number" inputmode="decimal" id="invest-taxa-range-input" class="input input--stepper" min="0" max="25" step="0.1" data-field="invest-taxa-range" value="${taxa}" placeholder="0" />
          <div class="invest-presets">
            ${ratePresets.map((p) => `<button class="payment-chip ${Math.abs(taxa - p.ratePct) < 0.05 ? "active" : ""}" data-action="set-invest-rate" data-value="${p.ratePct}">${p.label}</button>`).join("")}
          </div>
        </div>
      </div>

      <div class="card">
        <p class="card-title">Patrimônio projetado</p>
        <div class="invest-stats">
          <div class="invest-stat invest-stat--total">
            <span>Valor final em ${anos} ${anos === 1 ? "ano" : "anos"}</span>
            <b>${fmtBRL(sim.totalFinal)}</b>
          </div>
          <div class="invest-stat">
            <span>Total investido (aportes)</span>
            <b>${fmtBRL(sim.totalContributed)}</b>
          </div>
          <div class="invest-stat invest-stat--interest">
            <span>Ganho em juros</span>
            <b>${fmtBRL(sim.totalInterest)}</b>
          </div>
        </div>
        ${renderInvestChart(sim)}
        <div class="trend-legend">
          <span><i data-ui-css="background:var(--brand)"></i>Patrimônio total (com juros)</span>
          <span><i data-ui-css="background:var(--border)"></i>Só o que foi aportado</span>
        </div>
        <p class="health-note">Se você guardar <b>${fmtBRL(aporte)}</b> por mês${inicial > 0 ? `, começando já com <b>${fmtBRL(inicial)}</b>,` : ""} rendendo <b>${fmtNum(taxa)}% ao ano</b>, em <b>${anos} ${anos === 1 ? "ano" : "anos"}</b> você teria <b data-ui-css="color:var(--positive)">${fmtBRL(sim.totalFinal)}</b>; dos quais <b>${fmtBRL(sim.totalInterest)}</b> vieram só dos juros, sem sair do seu bolso.</p>
      </div>`;
}

// ==================================================================
// MOTOR WHAT-IF; comparar o cenário real com um cenário simulado
// ==================================================================
// Usa o saldo real (IndexedDB) e a sobra média dos últimos meses como ponto de
// partida, e desenha a projeção simulada em paralelo à projeção atual.
function renderWhatIfCard() {
  const wi = state.whatIf;
  const num = (v) => Math.max(0, moneyOrZero(v));

  const saldoHoje = realizedBalance(state.data);
  const sobraMensal = estimateAvgMonthlySaving(state.data);
  const anos = clamp(parseInt(wi.anos, 10) || 10, 1, 40);
  const taxa = clamp(num(wi.taxa), 0, 30);
  const isFin = wi.mode === "financiamento";
  const ratePresets = investmentRatePresets(state.data);

  const scenario = computeWhatIfScenario({
    startingBalance: saldoHoje,
    monthlySurplus: sobraMensal,
    annualRatePct: taxa,
    years: anos,
    mode: wi.mode,
    extraContribution: num(wi.aporteExtra),
    financing: {
      valorBem: num(wi.valorBem),
      entrada: num(wi.entrada),
      meses: clamp(parseInt(wi.meses, 10) || 12, 1, anos * 12),
      jurosAnualPct: clamp(num(wi.jurosFin), 0, 200),
    },
  });
  const s = scenario.summary;
  const positivo = s.diferenca >= 0;

  return `<div class="card span-mt">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Motor What-If</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Compare o seu cenário real com uma decisão que você está pensando em tomar</p>
      </div>
      <button class="icon-btn" data-action="toggle-whatif" aria-label="${wi.open ? "Recolher" : "Abrir"} comparação de cenários" aria-expanded="${wi.open ? "true" : "false"}">${svgIcon(wi.open ? "chevronDown" : "chevronRight", 16)}</button>
    </div>

    ${!wi.open ? "" : `
    <div class="whatif-base">
      <div><span>Saldo de hoje</span><b>${fmtBRL(saldoHoje)}</b></div>
      <div><span>Sobra média por mês</span><b>${fmtBRL(sobraMensal)}</b></div>
    </div>

    <div class="segmented" data-ui-css="margin-top:12px">
      <button class="segmented__option ${!isFin ? "active" : ""}" data-action="set-whatif-mode" data-value="aporte">Guardar mais por mês</button>
      <button class="segmented__option ${isFin ? "active" : ""}" data-action="set-whatif-mode" data-value="financiamento">Financiar uma compra</button>
    </div>

    <div class="grid-2" data-ui-css="margin-top:12px">
      <div>
        ${!isFin ? `
          <div class="invest-field">
            <div class="invest-field__head"><span>Aporte extra por mês</span><b>${fmtBRL(num(wi.aporteExtra))}</b></div>
            <input type="number" inputmode="decimal" id="whatif-aporte-input" class="input input--stepper" min="0" max="3000" step="25" data-field="whatif-aporte" value="${clamp(num(wi.aporteExtra), 0, 3000)}" placeholder="0" />
          </div>
        ` : `
          <div class="invest-field">
            <div class="invest-field__head"><span>Valor do bem</span><b>${fmtBRL(num(wi.valorBem))}</b></div>
            <input id="whatif-valorbem-input" class="input" data-field="whatif-valorbem" inputmode="decimal" value="${escapeHtml(wi.valorBem)}" placeholder="0,00" autocomplete="off" />
          </div>
          <div class="invest-field">
            <div class="invest-field__head"><span>Entrada</span><b>${fmtBRL(num(wi.entrada))}</b></div>
            <input id="whatif-entrada-input" class="input" data-field="whatif-entrada" inputmode="decimal" value="${escapeHtml(wi.entrada)}" placeholder="0,00" autocomplete="off" />
          </div>
          <div class="invest-field">
            <div class="invest-field__head"><span>Parcelas</span><b>${clamp(parseInt(wi.meses, 10) || 12, 1, anos * 12)}x</b></div>
            <input type="number" inputmode="numeric" id="whatif-meses-input" class="input input--stepper" min="1" max="${anos * 12}" step="1" data-field="whatif-meses" value="${clamp(parseInt(wi.meses, 10) || 12, 1, anos * 12)}" placeholder="12" />
          </div>
          <div class="invest-field">
            <div class="invest-field__head"><span>Juros do financiamento (ao ano)</span><b>${fmtNum(num(wi.jurosFin))}%</b></div>
            <input type="number" inputmode="decimal" id="whatif-jurosfin-input" class="input input--stepper" min="0" max="60" step="0.5" data-field="whatif-jurosfin" value="${clamp(num(wi.jurosFin), 0, 60)}" placeholder="0" />
          </div>
        `}
      </div>
      <div>
        <div class="invest-field">
          <div class="invest-field__head"><span>Horizonte da projeção</span><b>${anos} ${anos === 1 ? "ano" : "anos"}</b></div>
          <input type="number" inputmode="numeric" id="whatif-anos-input" class="input input--stepper" min="1" max="40" step="1" data-field="whatif-anos" value="${anos}" placeholder="1" />
        </div>
        <div class="invest-field">
          <div class="invest-field__head"><span>Rendimento do dinheiro guardado</span><b>${fmtNum(taxa)}% a.a.</b></div>
          <input type="number" inputmode="decimal" id="whatif-taxa-input" class="input input--stepper" min="0" max="25" step="0.1" data-field="whatif-taxa" value="${taxa}" placeholder="0" />
          <div class="invest-presets">
            ${ratePresets.map((p) => `<button class="payment-chip ${Math.abs(taxa - p.ratePct) < 0.05 ? "active" : ""}" data-action="set-whatif-rate" data-value="${p.ratePct}">${p.label}</button>`).join("")}
          </div>
        </div>
      </div>
    </div>

    ${renderWhatIfChart(scenario, { idSuffix: "Main" })}
    <div class="trend-legend">
      <span><i data-ui-css="background:var(--brand)"></i>Cenário atual</span>
      <span><i data-ui-css="background:var(--goal)"></i>Cenário simulado</span>
    </div>

    <div class="whatif-stats">
      <div class="invest-stat">
        <span>Em ${anos} ${anos === 1 ? "ano" : "anos"}, mantendo tudo como está</span>
        <b>${fmtBRL(s.finalBase)}</b>
      </div>
      <div class="invest-stat ${positivo ? "invest-stat--interest" : ""}">
        <span>No cenário simulado</span>
        <b data-ui-css="color:${positivo ? "var(--positive)" : "var(--negative)"}">${fmtBRL(s.finalSim)}</b>
      </div>
      <div class="invest-stat">
        <span>Diferença</span>
        <b data-ui-css="color:${positivo ? "var(--positive)" : "var(--negative)"}">${positivo ? "+" : "−"}${fmtBRL(Math.abs(s.diferenca))}</b>
      </div>
    </div>

    ${isFin ? `
      <p class="health-note">Financiando <b>${fmtBRL(s.valorBem)}</b> com <b>${fmtBRL(s.entrada)}</b> de entrada em <b>${s.nParcelas}x</b>, a parcela fica em <b>${fmtBRL(s.parcela)}</b>. Você pagaria <b>${fmtBRL(s.totalPago)}</b> no total. <b data-ui-css="color:var(--negative)">${fmtBRL(s.custoJuros)}</b> só de juros (${fmtNum(s.custoJurosPct)}% a mais que o valor à vista).${s.comprometimentoPct != null ? ` A parcela consome <b>${fmtNum(s.comprometimentoPct)}%</b> da sua sobra mensal.` : ""}</p>
      ${!s.viavel ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} A parcela é maior que a sua sobra média mensal; nesse ritmo o saldo entra no vermelho durante o financiamento.</p>` : ""}
    ` : `
      <p class="health-note">Guardando <b>${fmtBRL(num(wi.aporteExtra))}</b> a mais por mês, você aportaria <b>${fmtBRL(s.totalAportado)}</b> do próprio bolso e terminaria com <b data-ui-css="color:var(--positive)">${fmtBRL(s.diferenca)}</b> a mais. <b>${fmtBRL(Math.max(0, s.jurosGerados))}</b> disso vêm só dos juros compostos.${s.comprometimentoPct != null ? ` Isso equivale a <b>${fmtNum(s.comprometimentoPct)}%</b> da sua sobra mensal atual.` : ""}</p>
      ${!s.viavel ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} Esse aporte é maior que a sua sobra média mensal. Dá para começar menor e aumentar aos poucos.</p>` : ""}
    `}
    `}
  </div>`;
}

// Gráfico de área SVG: patrimônio total (com juros) vs. total aportado (sem juros),
// no mesmo estilo minimalista dos outros gráficos do app (sem bibliotecas externas).
function renderInvestChart(sim) {
  const points = downsampleSeries(sim.series, 60);
  const w = 600, h = 220, pad = 6;
  const maxVal = Math.max(1, sim.totalFinal);
  const lastMonth = sim.months;
  const xScale = (m) => pad + (lastMonth > 0 ? m / lastMonth : 0) * (w - 2 * pad);
  const yScale = (v) => h - pad - (v / maxVal) * (h - 2 * pad);

  const totalPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.month).toFixed(1)} ${yScale(p.total).toFixed(1)}`).join(" ");
  const contribPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.month).toFixed(1)} ${yScale(p.contributed).toFixed(1)}`).join(" ");
  const areaPath = `${totalPath} L ${xScale(lastMonth).toFixed(1)} ${h - pad} L ${xScale(0).toFixed(1)} ${h - pad} Z`;

  return `<svg viewBox="0 0 ${w} ${h}" class="invest-chart" preserveAspectRatio="none">
    <defs>
      <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#investFill)" stroke="none"/>
    <path d="${contribPath}" fill="none" stroke="var(--border)" stroke-width="2.5" stroke-dasharray="5 5"/>
    <path d="${totalPath}" fill="none" stroke="var(--brand)" stroke-width="3"/>
  </svg>`;
}
