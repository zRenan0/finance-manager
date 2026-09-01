// js/screens/simulate.js. Simulador de decisão pontual (impacto de uma compra no mês).
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// SIMULADOR "E SE...?"
// ==================================================================
function renderSimulateScreen() {
  const sim = state.simulate;
  const isFinance = sim.mode === "financiado";
  const amt = parseMoneyInput(sim.amount);
  const result = !isFinance && amt > 0 ? simulateExpenseImpact(state.data, amt, sim.goalId || null) : null;

  const fin = sim.finance;
  const financeReady = ["valorBem", "numParcelas", "valorParcela"].every((k) => moneyOrZero(fin[k]) > 0);
  const financeResult = isFinance && financeReady ? simulateFinancingImpact(state.data, {
    valorBem: moneyOrZero(fin.valorBem),
    entrada: moneyOrZero(fin.entrada),
    numParcelas: moneyOrZero(fin.numParcelas),
    valorParcela: moneyOrZero(fin.valorParcela),
  }, sim.goalId || null) : null;

  return `<div class="screen screen--narrow">
    ${renderBackHeader("Simular gasto")}
    <div class="segmented">
      <button class="segmented__option ${!isFinance ? "active" : ""}" data-action="set-sim-mode" data-value="vista">À Vista</button>
      <button class="segmented__option ${isFinance ? "active" : ""}" data-action="set-sim-mode" data-value="financiado">Financiado</button>
    </div>

    ${!isFinance ? `
    <div class="card" data-ui-css="margin-top:12px">
      <p class="card-subtitle" data-ui-css="margin-top:0">Veja o impacto de uma compra antes de fazer, sem lançar nada de verdade.</p>
      ${renderSimLabelField()}
      <div class="amount-input-wrap">
        <p class="field__label center">Quanto você pensa em gastar?</p>
        <div class="amount-row">
          <span class="amount-currency">R$</span>
          <input id="sim-amount-input" data-field="sim-amount" class="amount-field" value="${escapeHtml(sim.amount)}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
        </div>
      </div>
      ${renderSimGoalSelect()}
    </div>
    ${result ? renderSimulateResult(result, amt) : ""}
    ` : `
    <div class="card" data-ui-css="margin-top:12px">
      <p class="card-subtitle" data-ui-css="margin-top:0">Compare o custo real de financiar contra o valor à vista do bem.</p>
      ${renderSimLabelField()}
      <div class="field-row">
        <div class="field"><label class="field__label" for="fin-bem-input">Valor do bem</label>
          <input id="fin-bem-input" class="input" data-field="sim-finance-valorbem" value="${escapeHtml(fin.valorBem)}" inputmode="decimal" placeholder="0,00" /></div>
        <div class="field"><label class="field__label" for="fin-entrada-input">Valor da entrada</label>
          <input id="fin-entrada-input" class="input" data-field="sim-finance-entrada" value="${escapeHtml(fin.entrada)}" inputmode="decimal" placeholder="0,00" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field__label" for="fin-parcelas-input">Número de parcelas</label>
          <input id="fin-parcelas-input" type="number" min="1" max="120" class="input" data-field="sim-finance-numparcelas" value="${escapeHtml(fin.numParcelas)}" placeholder="12" /></div>
        <div class="field"><label class="field__label" for="fin-valorparcela-input">Valor de cada parcela</label>
          <input id="fin-valorparcela-input" class="input" data-field="sim-finance-valorparcela" value="${escapeHtml(fin.valorParcela)}" inputmode="decimal" placeholder="0,00" /></div>
      </div>
      ${renderSimGoalSelect()}
    </div>
    ${financeResult ? renderFinanceResult(financeResult) : ""}
    `}
  </div>`;
}

// [M31] O nome do produto não entra em conta nenhuma. Ele existe para a
// resposta falar da COISA que a pessoa está pensando em comprar, e não de "um
// gasto de R$ 4.000,00". Some do texto quando fica em branco.
function renderSimLabelField() {
  return `<div class="field">
    <label class="field__label" for="sim-label-input">O que você quer comprar? (opcional)</label>
    <input id="sim-label-input" class="input" data-field="sim-label" value="${escapeHtml(state.simulate.label)}" maxlength="60" placeholder="Notebook, geladeira, viagem..." autocomplete="off" />
  </div>`;
}

function simLabel() {
  const t = String(state.simulate.label || "").trim();
  return t ? escapeHtml(t) : "";
}

// As três leituras que o M31 acrescentou, compartilhadas pelos dois modos:
// sobra mensal antes e depois, comprometimento da renda antes e depois, e o que
// acontece com a reserva. A conclusão é EDUCATIVA: o app diz o que muda e o que
// isso costuma significar, e não se a pessoa deve ou não comprar.
function renderPurchaseReadings(r, opts) {
  const o = opts || {};
  const sobraCor = r.monthlyAfter < 0 ? "var(--negative)" : (r.monthlyAfter < r.monthlyBefore * 0.4 ? "var(--goal)" : "var(--positive)");
  const temComprometimento = r.commitmentBefore != null && r.commitmentAfter != null;
  const compCor = temComprometimento && r.commitmentAfter > 30 ? "var(--negative)" : (temComprometimento && r.commitmentAfter > 20 ? "var(--goal)" : "var(--positive)");
  const res = r.reserveImpact || {};

  return `<div class="purchase-readings">
    <div class="health-grid">
      <div class="health-stat"><span>Sobra mensal hoje</span><b>${fmtBRL(r.monthlyBefore)}</b></div>
      <div class="health-stat"><span>Sobra mensal depois</span><b data-ui-css="color:${sobraCor}">${fmtBRL(r.monthlyAfter)}</b></div>
    </div>

    ${temComprometimento ? `<p class="health-note">
      A parte da renda presa em parcelas passa de <b>${r.commitmentBefore.toFixed(0)}%</b> para
      <b data-ui-css="color:${compCor}">${r.commitmentAfter.toFixed(0)}%</b>.
      ${r.commitmentNow > 0 ? `Hoje são ${fmtBRL(r.commitmentNow)} por mês em dívidas cadastradas.` : "Hoje não há dívida cadastrada com parcela mensal."}
    </p>` : ""}

    <p class="health-note">${res.affected
      ? (res.reason === "caixa"
        ? `Pagar isso agora encostaria na sua reserva de ${fmtBRL(res.reserve)}: o caixa livre não cobre a compra sem tocar nela.`
        : `Com a sobra mensal negativa, a diferença sairia da sua reserva de ${fmtBRL(res.reserve)} todo mês.`)
      : res.reason === "sem-reserva"
        ? "Você ainda não tem reserva de emergência registrada, então não há o que preservar nesta conta."
        : `Sua reserva de ${fmtBRL(res.reserve)} <b>não seria afetada</b> por esta compra.`}</p>

    ${o.nota ? `<p class="field-hint">${o.nota}</p>` : ""}
  </div>`;
}

function renderSimGoalSelect() {
  const sim = state.simulate;
  if (state.data.goals.length === 0) return "";
  return `<div class="field">
    <p class="field__label">Ver efeito em uma meta (opcional)</p>
    <select class="input" id="sim-goal-select" data-action-select="sim-goal">
      <option value="">Nenhuma meta específica</option>
      ${state.data.goals.map((g) => `<option value="${g.id}" ${sim.goalId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}
    </select>
  </div>`;
}

function renderSimulateResult(r, amt) {
  const dropColor = r.willExceedIncome ? "var(--negative)" : (r.dailyDrop > r.dailyBefore * 0.3 ? "var(--goal)" : "var(--positive)");
  return `<div class="card card--elevated" data-ui-css="margin-top:14px">
    <p class="card-title">${simLabel() ? `${simLabel()} por ${fmtBRL(amt)}` : `Se você gastar ${fmtBRL(amt)} agora`}</p>
    ${renderPurchaseReadings(r, { nota: "Leitura educativa, calculada com os seus números. A decisão continua sua: o app não diz se vale a pena." })}
    <div class="health-grid">
      <div class="health-stat"><span>Orçamento diário hoje</span><b>${fmtBRL(r.dailyBefore)}</b></div>
      <div class="health-stat"><span>Orçamento diário depois</span><b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b></div>
    </div>
    <p class="health-note">${r.willExceedIncome
      ? `Esse gasto <b data-ui-css="color:var(--negative)">ultrapassa sua renda</b> disponível este mês.`
      : `Seu limite diário para os próximos ${r.daysLeft} dias cai de <b>${fmtBRL(r.dailyBefore)}</b> para <b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b>.`}</p>
    ${r.goalDelay && r.goalDelay.stalls ? `<p class="health-note">Esse gasto consome praticamente toda a sua capacidade de poupança do mês; a meta <b>${escapeHtml(r.goalDelay.goalName)}</b> ficaria <b data-ui-css="color:var(--negative)">parada</b> enquanto isso.</p>`
      : r.goalDelay && r.goalDelay.extraDays != null ? `<p class="health-note">Isso pode atrasar sua meta <b>${escapeHtml(r.goalDelay.goalName)}</b> em aproximadamente <b data-ui-css="color:var(--goal)">${r.goalDelay.extraDays} dias</b>.</p>` : ""}
  </div>`;
}

function renderFinanceResult(r) {
  const dropColor = r.willExceedIncome ? "var(--negative)" : (r.dailyDrop > r.dailyBefore * 0.3 ? "var(--goal)" : "var(--positive)");
  const interestColor = r.interestCost > 0 ? "var(--negative)" : "var(--positive)";
  const commitColor = r.commitmentWarning ? "var(--negative)" : "var(--positive)";
  return `<div class="card card--elevated" data-ui-css="margin-top:14px">
    <p class="card-title">${simLabel() ? `${simLabel()}: custo real do financiamento` : "Custo real do financiamento"}</p>
    <div class="health-grid">
      <div class="health-stat"><span>Valor do bem</span><b>${fmtBRL(r.valorBem)}</b></div>
      <div class="health-stat"><span>Total pago ao final</span><b>${fmtBRL(r.totalPaid)}</b></div>
      <div class="health-stat"><span>Juros/taxas</span><b data-ui-css="color:${interestColor}">${r.interestCost >= 0 ? "+" : ""}${fmtBRL(r.interestCost)}${r.valorBem > 0 ? ` (${r.interestPct.toFixed(1)}%)` : ""}</b></div>
      <div class="health-stat"><span>${r.numParcelas}x de</span><b>${fmtBRL(r.valorParcela)}</b></div>
    </div>

    ${r.commitmentPct != null ? `
    <p class="card-title" data-ui-css="margin-top:16px">Comprometimento da renda</p>
    <div class="progress"><div class="progress__fill" data-ui-css="width:${clamp(r.commitmentPct, 0, 100)}%; background:${commitColor}"></div></div>
    <p class="health-note">A parcela consome <b data-ui-css="color:${commitColor}">${r.commitmentPct.toFixed(1)}%</b> da sua renda fixa cadastrada.
      ${r.commitmentWarning ? `<b data-ui-css="color:var(--negative)"> Isso passa da faixa de atenção de 20% usada nesta análise. Compare também com sua sobra real e outras parcelas.</b>` : ""}</p>
    ` : `<p class="health-note" data-ui-css="margin-top:16px">Defina sua renda mensal fixa em Ajustes para eu calcular quanto essa parcela compromete do seu orçamento.</p>`}

    <p class="card-title" data-ui-css="margin-top:16px">O que muda no seu mês</p>
    ${renderPurchaseReadings(r, { nota: "Leitura educativa, calculada com os seus números. Parcelar não é errado nem certo por si: o que muda é quanto da sua renda deixa de estar disponível enquanto durar." })}

    <p class="card-title" data-ui-css="margin-top:16px">Impacto no saldo livre diário</p>
    <div class="health-grid">
      <div class="health-stat"><span>Orçamento diário hoje</span><b>${fmtBRL(r.dailyBefore)}</b></div>
      <div class="health-stat"><span>Com a parcela ativa</span><b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b></div>
    </div>
    <p class="health-note">${r.willExceedIncome
      ? `Com essa parcela, você <b data-ui-css="color:var(--negative)">ultrapassa sua renda</b> disponível nos meses em que ela estiver ativa.`
      : `Enquanto a parcela estiver ativa, seu orçamento diário cai de <b>${fmtBRL(r.dailyBefore)}</b> para <b data-ui-css="color:${dropColor}">${fmtBRL(r.dailyAfter)}</b>.`}</p>
    ${r.goalDelay && r.goalDelay.stalls ? `<p class="health-note">Essa parcela consome praticamente toda a sua capacidade de poupança do mês; a meta <b>${escapeHtml(r.goalDelay.goalName)}</b> ficaria <b data-ui-css="color:var(--negative)">parada</b> enquanto isso.</p>`
      : r.goalDelay && r.goalDelay.extraDays != null ? `<p class="health-note">Isso pode atrasar sua meta <b>${escapeHtml(r.goalDelay.goalName)}</b> em aproximadamente <b data-ui-css="color:var(--goal)">${r.goalDelay.extraDays} dias</b>.</p>` : ""}
  </div>`;
}
