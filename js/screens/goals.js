// js/screens/goals.js. Metas financeiras. Motor em goals.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// GOALS
// ==================================================================
const GOAL_ICON_OPTIONS = ["piggy", "target", "plane"];

function renderGoalsScreen() {
  const model = goalsModel();
  const gf = state.goalForm;
  const editing = !!state.editingGoalId;

  return `<div class="screen">
    <div class="screen-header">
      <h1 class="page-title">Metas financeiras</h1>
      ${gf.show ? "" : `<button class="btn btn--goal btn--sm" data-action="toggle-goal-form">${svgIcon("plus", 15)} Nova meta</button>`}
    </div>

    <div class="grid-dashboard">
      ${model.goals.length > 0 ? renderGoalsHero(model) : ""}
      ${gf.show ? renderGoalForm(gf, editing) : ""}
      ${model.goals.length > 0 ? renderGoalsPlanCard(model) : ""}
      ${model.advice.length > 0 ? renderGoalsAdviceCard(model) : ""}

      ${model.goals.length === 0 && !gf.show ? `<div class="card span-3">
        ${renderEmptyState("target", "Você ainda não criou metas.", "Escolha um objetivo abaixo ou toque em \u201cNova meta\u201d; o app passa a projetar quando você chega lá.")}
        <div class="goal-templates">
          ${GOAL_TEMPLATES.map((t) => `<button class="goal-template" data-action="goal-template" data-value="${t.id}">
            <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, var(--goal) 14%, transparent); color:var(--goal)">${svgIcon(t.icon, 15)}</span>
            <span class="goal-template__text"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.hint)}</span></span>
          </button>`).join("")}
        </div>
      </div>` : ""}

      ${model.goals.map((m) => renderGoalCard(m)).join("")}
    </div>
  </div>`;
}

// ---- Painel do topo: total guardado, progresso e o que entrou neste mês ----
function renderGoalsHero(model) {
  const t = model.totals;
  return `<div class="card card--hero span-3">
    <div class="hero-glow"></div>
    <div class="hero-label-row"><p class="hero-label">Total guardado em metas</p>${renderCalculationButton("goals")}</div>
    <p class="hero-value">${fmtBRL(t.saved)}</p>
    <p class="hero-reserved">${t.pct.toFixed(0)}% de ${fmtBRL(t.target)} · faltam ${fmtBRL(t.remaining)}</p>

    <div class="wealth-bar" role="img" aria-label="Progresso combinado das metas">
      <div class="wealth-bar__seg" data-ui-css="flex:${Math.max(t.pct, 1)}; background:var(--goal)"></div>
      <div class="wealth-bar__seg" data-ui-css="flex:${Math.max(100 - t.pct, 1)}; background:rgba(255,255,255,0.16)"></div>
    </div>

    <div class="hero-chips">
      <div class="hero-chip">${svgIcon("piggy", 17)}<div><span class="hero-chip__label">Aportado neste mês</span><span class="hero-chip__value">${fmtBRL(t.contributedThisMonth)}</span></div></div>
      <div class="hero-chip">${svgIcon("target", 17)}<div><span class="hero-chip__label">Metas ativas</span><span class="hero-chip__value">${model.counts.total - model.counts.done}</span></div></div>
      ${model.counts.done > 0 ? `<div class="hero-chip">${svgIcon("checkCircle", 17)}<div><span class="hero-chip__label">Concluídas</span><span class="hero-chip__value">${model.counts.done}</span></div></div>` : ""}
    </div>
  </div>`;
}

// ---- Viabilidade do plano: o compromisso cabe na sobra real? ----
function renderGoalsPlanCard(model) {
  const p = model.plan;
  if (p.commitment <= 0 && p.capacity <= 0) return "";
  const tone = p.feasible === false ? "var(--negative)" : (p.feasible === true ? "var(--positive)" : "var(--ink-faint)");
  const ratio = p.capacity > 0 ? clamp(safePct(p.commitment, p.capacity), 0, 100) : 0;

  return `<div class="card span-3" data-ui-css="--tone:${tone}">
    <div class="mini-card__head">
      <div>
        <p class="card-title" data-ui-css="margin:0">Seu plano cabe no orçamento?</p>
        <p class="mini-card__sub">${p.capacityBasis === "historico"
          ? `Sobra média dos últimos ${p.capacityMonths} ${p.capacityMonths === 1 ? "mês" : "meses"} com movimento`
          : p.capacityBasis === "renda" ? "Estimativa de 20% da renda informada (ainda sem histórico)" : "Sem histórico para estimar a sobra"}</p>
      </div>
      <span class="plan-verdict" data-ui-css="color:${tone}">${p.feasible === false ? "Aperta" : p.feasible === true ? "Cabe" : "Sem base"}</span>
    </div>

    <div class="plan-meter"><div class="plan-meter__fill" data-ui-css="width:${ratio}%; background:${tone}"></div></div>

    <div class="plan-grid">
      <div class="plan-cell"><span>Compromisso mensal</span><b>${fmtBRL(p.commitment)}</b></div>
      <div class="plan-cell"><span>Sobra média</span><b>${fmtBRL(p.capacity)}</b></div>
      <div class="plan-cell"><span>Ritmo real somado</span><b>${fmtBRL(p.paceTotal)}</b></div>
    </div>

    <p class="field-hint">${p.feasible === false
      ? `Faltam ${fmtBRL(p.gap)} por mês. Compare reduzir o valor, ampliar o prazo ou aumentar o aporte sem comprometer o orçamento.`
      : p.plannedTotal > 0
        ? "Compromisso = soma dos aportes mensais que você definiu. Sem aporte definido, entra o valor necessário para bater o prazo."
        : "Nenhuma meta tem aporte mensal definido ainda. Defina um para o app acompanhar o ritmo em vez de só o total."}</p>
  </div>`;
}

function renderGoalsAdviceCard(model) {
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--brand)" };
  return `<div class="card card--summary span-3">
    <div class="leak-header">
      ${svgIcon("sparkles", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">O que fazer agora</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Ordenado por urgência, calculado no seu aparelho</p>
      </div>
    </div>
    <div class="summary-grid">
      ${model.advice.map((a) => `<div class="summary-item" data-ui-css="--tone:${tone[a.tone]}">
        <span class="summary-item__icon">${svgIcon(a.icon, 16)}</span>
        <p class="summary-item__text">${escapeHtml(a.text)}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

// ---- Formulário (mesmo componente para criar e editar) ----
function renderGoalForm(gf, editing) {
  return `<div class="card card--elevated span-3">
    <p class="card-title">${editing ? "Editar meta" : "Nova meta"}</p>

    ${!editing ? `<div class="field"><p class="field__label">Começar de um modelo</p>
      <div class="class-picker">
        ${GOAL_TEMPLATES.map((t) => `<button class="class-chip" data-ui-css="--tone:var(--goal)" data-action="goal-template" data-value="${t.id}">
          ${svgIcon(t.icon, 15)}<span>${escapeHtml(t.name)}</span>
        </button>`).join("")}
      </div>
    </div>` : ""}

    <div class="field"><label class="field__label" for="goal-name-input">Nome da meta</label>
      <input id="goal-name-input" class="input" data-field="goal-name" value="${escapeHtml(gf.name)}" placeholder="Ex: Reserva de emergência" autocomplete="off" /></div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="goal-target-input">Valor alvo</label>
        <input id="goal-target-input" class="input" data-field="goal-target" value="${escapeHtml(gf.target)}" inputmode="decimal" placeholder="0,00" /></div>
      <div class="field"><label class="field__label" for="goal-saved-input">${editing ? "Valor já guardado" : "Valor inicial"}</label>
        <input id="goal-saved-input" class="input" data-field="goal-saved-upfront" value="${escapeHtml(gf.savedUpfront)}" inputmode="decimal" placeholder="0,00" ${editing ? "disabled" : ""} /></div>
    </div>

    <div class="field-row">
      <div class="field"><label class="field__label" for="goal-deadline-input">Prazo (opcional)</label>
        <input id="goal-deadline-input" type="date" class="input" data-field="goal-deadline" value="${gf.deadline}" /></div>
      <div class="field"><label class="field__label" for="goal-plan-input">Aporte mensal planejado</label>
        <input id="goal-plan-input" class="input" data-field="goal-monthly-plan" value="${escapeHtml(gf.monthlyPlan)}" inputmode="decimal" placeholder="0,00" /></div>
    </div>

    <p class="field-hint">${editing
      ? "O valor guardado só muda por aporte ou resgate; assim o histórico de lançamentos nunca discorda do saldo da meta."
      : "Se informar um valor inicial, você escolherá se ele sai do saldo agora ou se já estava guardado antes."}</p>
    <p class="field-hint">O aporte planejado é o seu compromisso. O app compara ele com o que você realmente guardou e com o que o prazo exige.</p>

    <div class="field"><p class="field__label">Ícone</p>
      <div class="icon-picker">${GOAL_ICON_OPTIONS.map((k) => `<button class="icon-picker__btn ${gf.icon === k ? "active" : ""}" data-action="set-goal-icon" data-value="${k}" aria-label="Escolher ícone ${k}" aria-pressed="${gf.icon === k ? "true" : "false"}">${svgIcon(k, 19)}</button>`).join("")}</div>
    </div>

    <div class="form-actions">
      <button class="btn btn--ghost" data-action="cancel-goal-form">Cancelar</button>
      <button class="btn btn--goal" data-action="submit-goal">${editing ? "Salvar alterações" : "Criar meta"}</button>
    </div>
  </div>`;
}

// Sugere quanto aportar por mês para bater a meta até o prazo, com base no
// valor que ainda falta e nos meses restantes até o deadline.
function goalMonthlySuggestion(g) {
  if (!g.deadline || !(g.target > 0)) return null;
  const remaining = subMoney(g.target, g.current);
  if (remaining <= 0) return null;
  const daysLeft = daysBetweenIso(todayIso(), g.deadline);
  if (daysLeft <= 0) return null;
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.44));
  return divMoney(remaining, monthsLeft);
}

function renderGoalCard(m) {
  const g = m.goal;
  const expanded = state.expandedGoalId === g.id;
  const mode = state.goalActionMode;
  const tone = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--brand)" }[m.tone];
  const ringColor = m.done ? "var(--positive)" : "var(--goal)";

  return `<div class="card goal-card card--elevated span-1" data-ui-css="--tone:${tone}">
    <div class="goal-header">
      ${renderGoalRing(m.pct, ringColor, g.icon, 62)}
      <div class="goal-header__text">
        <p class="goal-name">${escapeHtml(g.name)}</p>
        <p class="goal-progress-inline"><b>${fmtBRL(m.saved)}</b> de ${fmtBRL(m.target)}</p>
        <span class="goal-status" data-ui-css="color:${tone}">${svgIcon(m.statusIcon, 12)} ${m.statusLabel}</span>
      </div>
      <div class="goal-header__actions">
        <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Editar meta">${svgIcon("pencil", 15)}</button>
        <button class="icon-btn" data-action="delete-goal" data-id="${g.id}" aria-label="Excluir meta">${svgIcon("trash", 15)}</button>
      </div>
    </div>

    <div class="progress progress--sm" data-ui-css="margin:12px 0 4px"><div class="progress__fill" data-ui-css="width:${clamp(m.pct, 0, 100)}%; background:${ringColor}"></div></div>
    <p class="goal-remaining">${m.done ? `${svgIcon("checkCircle", 14)} Meta concluída` : `Faltam <b>${fmtBRL(m.remaining)}</b>`}${m.daysLeft != null ? ` · ${m.daysLeft >= 0 ? `${m.daysLeft} dias restantes` : "prazo encerrado"}` : ""}</p>

    ${!m.done ? `<div class="goal-numbers">
      <div class="goal-number">
        <span class="goal-number__label">Necessário</span>
        <b>${m.requiredMonthly != null ? `${fmtBRL(m.requiredMonthly)}` : "Sem dados"}</b>
        <span class="goal-number__hint">${m.requiredMonthly != null ? "para bater o prazo" : "sem prazo definido"}</span>
      </div>
      <div class="goal-number">
        <span class="goal-number__label">Planejado</span>
        <b>${m.plannedMonthly > 0 ? fmtBRL(m.plannedMonthly) : "Não definido"}</b>
        <span class="goal-number__hint">${m.plannedMonthly > 0 ? "definido por você" : "toque no lápis para definir"}</span>
      </div>
      <div class="goal-number">
        <span class="goal-number__label">Ritmo real</span>
        <b data-ui-css="color:${m.paceActive ? tone : "var(--ink-faint)"}">${m.paceActive ? fmtBRL(m.paceMonthly) : "Sem histórico"}</b>
        <span class="goal-number__hint">${m.paceActive ? `média de ${m.paceWindow} ${m.paceWindow === 1 ? "mês" : "meses"}` : "nenhum aporte ainda"}</span>
      </div>
    </div>` : ""}

    ${!m.done && m.etaIso ? `<p class="goal-eta ${m.etaLate ? "is-late" : ""}">
      ${svgIcon("clock", 13)} No ritmo ${m.projectionSource === "real" ? "atual" : "planejado"}, conclusão em <b>${fmtDateFull(m.etaIso)}</b>
      ${m.etaMonths ? ` (${m.etaMonths} ${m.etaMonths === 1 ? "mês" : "meses"})` : ""}${m.etaLate ? "; depois do prazo." : "."}
    </p>` : ""}
    ${!m.done && !m.etaIso ? `<p class="goal-eta">${svgIcon("info", 13)} Sem aportes nem plano definido, não dá para estimar a conclusão.</p>` : ""}
    ${!m.done && m.gap > 0 ? `<p class="goal-eta is-late">${svgIcon("alertTriangle", 13)} Faltam <b>${fmtBRL(m.gap)}</b> por mês para o prazo fechar.</p>` : ""}

    ${m.series.some((s) => s.contributed !== 0) ? `<div class="goal-spark">
      ${renderSparkline(m.series.map((s) => ({ value: s.balance })), ringColor, 300, 46)}
      <div class="chart-axis">${m.series.map((s) => `<span>${s.label}</span>`).join("")}</div>
    </div>` : ""}

    ${expanded ? `
      <div class="goal-contribute-row">
        <input id="goal-contribution-input" class="input" data-field="contribution-amount" value="${escapeHtml(state.goalContribution)}" inputmode="decimal" placeholder="Valor" autocomplete="off" />
        <button class="btn btn--goal" data-action="submit-goal-action" data-id="${g.id}">${mode === "resgatar" ? "Resgatar" : "Aportar"}</button>
        <button class="icon-btn" data-action="collapse-goal" aria-label="Fechar aporte ou resgate">${svgIcon("x", 15)}</button>
      </div>
      <p class="field-hint">${mode === "resgatar"
        ? (goalExistingBalance(g) > 0
          ? "O valor que já existia é liberado primeiro, sem alterar o saldo. Depois, a parte aportada volta como receita."
          : "O valor sai da meta e entra como receita no saldo livre deste mês.")
        : "O valor entra na meta e sai do seu saldo livre deste mês."}</p>
    ` : `<div class="goal-action-row">
        <button class="btn btn--goal-soft" data-action="expand-goal" data-value="aportar" data-id="${g.id}">${svgIcon("plus", 14)} Aportar${m.plannedMonthly > 0 && m.contributedThisMonth <= 0 ? ` ${fmtBRL(m.plannedMonthly)}` : ""}</button>
        <button class="btn btn--ghost" data-action="expand-goal" data-value="resgatar" data-id="${g.id}" ${m.saved <= 0 ? "disabled" : ""}>${svgIcon("arrowDownRight", 14)} Resgatar</button>
      </div>`}
  </div>`;
}
