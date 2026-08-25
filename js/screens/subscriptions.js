// js/screens/subscriptions.js. Assinaturas e recorrências. Modelo em recurring.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// ASSINATURAS E RECORRÊNCIAS
// ==================================================================
// ==================================================================
// [M7] ASSINATURAS E RECORRÊNCIAS
// ------------------------------------------------------------------
// A tela é montada a partir de UM modelo (`buildRecurringModel`, em
// recurring.js). Nenhum cálculo mora aqui.
//
// A inversão de hierarquia é deliberada: o número grande é o CUSTO
// ANUAL, não a mensalidade. "R$ 55,90" não faz ninguém reavaliar um
// plano; "R$ 670,80 por ano" faz. A mensalidade continua visível,
// como referência; só deixou de ser a manchete.
// ==================================================================
const SUBS_VIEWS = [
  { id: "assinaturas", label: "Assinaturas" },
  { id: "variaveis", label: "Recorrentes" },
  { id: "ignoradas", label: "Sem acompanhar" },
];

function renderSubscriptionsScreen() {
  const mKey = keyOfCurrentMonth();
  const m = recurringModel(mKey);
  const view = state.subs.view;
  const list = view === "assinaturas" ? m.subscriptions : view === "variaveis" ? m.variable : m.ignored;

  return `<div class="screen screen--narrow">
    ${renderBackHeader("Assinaturas e recorrências")}

    ${renderSubsHero(m)}

    ${m.proposals.length > 0 ? renderRecurringProposals(m.proposals) : ""}

    ${m.increases.length > 0 ? `<div class="banner">
      ${svgIcon("alertTriangle", 20, "banner__icon")}
      <div class="banner__text">
        <strong>${m.increases.length === 1 ? "Um reajuste detectado" : `${m.increases.length} reajustes detectados`}</strong>
        <span>${m.increases.slice(0, 3).map((s) => `${escapeHtml(s.name)} (+${s.increasePct.toFixed(0)}%, ${fmtBRL(s.increaseAnnualImpact)}/ano)`).join(" · ")}</span>
      </div>
    </div>` : ""}

    <div class="segmented">
      ${SUBS_VIEWS.map((v) => {
        const count = v.id === "assinaturas" ? m.counts.subscriptions : v.id === "variaveis" ? m.counts.variable : m.counts.ignored;
        return `<button class="segmented__option ${view === v.id ? "active" : ""}" data-action="subs-view" data-value="${v.id}">${v.label}${count > 0 ? ` (${count})` : ""}</button>`;
      }).join("")}
    </div>

    ${list.length === 0
      ? renderEmptyState("refresh", subsEmptyTitle(view), subsEmptyHint(view))
      : `<div class="sub-list">${list.map((s) => renderSubItem(s, view === "ignoradas")).join("")}</div>`}

    ${view !== "ignoradas" && m.ended.length > 0 ? `<div class="card">
      <p class="card-title">Parou de cobrar</p>
      <p class="card-subtitle">Sem lançamento há mais tempo do que a própria cadência. Já saíram do total mensal; se voltarem a aparecer, retornam sozinhas.</p>
      <div class="leak-list">
        ${m.ended.map((s) => `<div class="leak-row">
          <span class="icon-bubble" data-ui-css="width:26px;height:26px;background:color-mix(in srgb, ${s.categoryColor} 14%, transparent); color:${s.categoryColor}">${svgIcon(s.categoryIcon, 13)}</span>
          <span class="leak-name">${escapeHtml(s.name)}</span>
          <span class="import-row__meta">último em ${fmtDateShort(s.lastDate)}</span>
          <span class="leak-value">${fmtBRL(s.lastAmount)}</span>
        </div>`).join("")}
      </div>
    </div>` : ""}

    <p class="footnote">Tudo é identificado a partir do histórico salvo neste navegador; nada é enviado para servidor algum. "Parar de acompanhar" tira o item das listas e dos totais, mas não apaga nenhum lançamento.</p>
  </div>`;
}

function subsEmptyTitle(view) {
  if (view === "ignoradas") return "Você não parou de acompanhar nada.";
  if (view === "variaveis") return "Nenhuma cobrança recorrente de valor variável.";
  return "Nenhuma assinatura identificada ainda.";
}

function subsEmptyHint(view) {
  if (view === "ignoradas") return "Itens que você mandar parar de acompanhar aparecem aqui e podem voltar a qualquer momento.";
  if (view === "variaveis") return "Contas de luz, água e mercado entram aqui quando repetem a cadência com valores diferentes.";
  return "Assim que o mesmo gasto aparecer duas vezes no mesmo intervalo, ele é reconhecido automaticamente.";
}

// Manchete: o ano inteiro. Ver a nota no topo do bloco.

function renderSubsHero(m) {
  return `<div class="card sub-hero">
    <div class="sub-hero__main">
      <p class="eyebrow">Assinaturas · custo de 12 meses</p>
      <p class="sub-hero__annual">${fmtBRL(m.annualTotal)}</p>
      <p class="sub-hero__monthly">${fmtBRL(m.monthlyTotal)} por mês em ${m.counts.subscriptions} ${m.counts.subscriptions === 1 ? "cobrança" : "cobranças"} de valor fixo</p>
    </div>
    <div class="health-grid">
      <div class="health-stat"><span>Recorrentes variáveis</span><b>${fmtBRL(m.variableMonthly)}</b></div>
      <div class="health-stat"><span>Comprometido por mês</span><b>${fmtBRL(m.committedMonthly)}</b></div>
      ${m.income > 0 ? `<div class="health-stat"><span>Da sua renda</span><b>${m.incomeShare.toFixed(0)}%</b></div>` : ""}
      <div class="health-stat"><span>Próximos 30 dias</span><b>${fmtBRL(m.upcomingTotal)}</b></div>
    </div>
    ${m.upcoming.length > 0 ? `<div class="sub-upcoming">
      ${m.upcoming.slice(0, 4).map((s) => `<span class="sub-chip" title="${escapeHtml(s.name)}">
        <i data-ui-css="background:${s.categoryColor}"></i><span class="sub-chip__txt">${fmtDateShort(s.nextDate)} · ${escapeHtml(s.name)} · ${fmtBRL(s.lastAmount)}</span>
      </span>`).join("")}
    </div>` : ""}
  </div>`;
}

// §9; a pergunta do briefing, feita só quando o app tem confiança de acertar.

function renderRecurringProposals(proposals) {
  return `<div class="card card--proposal">
    <div class="leak-header">
      ${svgIcon("refresh", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Padrão detectado</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Estes gastos se repetem sempre no mesmo intervalo, mas ainda não estão marcados como recorrentes. Marcar faz a previsão de saldo e o calendário já contarem com eles.</p>
      </div>
    </div>
    <div class="rec-proposals">
      ${proposals.map((p) => `<div class="rec-proposal">
        <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${p.categoryColor} 14%, transparent); color:${p.categoryColor}">${svgIcon(p.categoryIcon, 16)}</span>
        <div class="rec-proposal__text">
          <b>${escapeHtml(p.pattern)} · ${escapeHtml(p.name)}</b>
          <span>${fmtBRL(p.amount)} · ${p.occurrences} cobranças · ${fmtBRL(p.annualCost)} por ano</span>
        </div>
        <div class="rec-proposal__actions">
          <button class="btn btn--secondary btn--sm" data-action="rec-dismiss" data-id="${escapeHtml(p.key)}">Agora não</button>
          <button class="btn btn--primary btn--sm" data-action="rec-confirm" data-id="${escapeHtml(p.key)}">Cadastrar</button>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

function subStatusBadge(s) {
  if (s.status === "atrasada") {
    return `<span class="status-badge" data-ui-css="background:var(--goal-soft); color:var(--goal)">${svgIcon("clock", 11)} não veio ainda</span>`;
  }
  if (s.increasePct > 3) {
    return `<span class="status-badge" data-ui-css="background:var(--negative-soft); color:var(--negative)">${svgIcon("arrowUpRight", 11)} +${s.increasePct.toFixed(0)}%</span>`;
  }
  return "";
}

function renderSubItem(s, ignored) {
  const open = state.subs.expandedKey === s.key;
  return `<div class="sub-item ${open ? "is-open" : ""}">
    <button class="sub-item__head" data-action="sub-expand" data-id="${escapeHtml(s.key)}" aria-expanded="${open ? "true" : "false"}">
      <span class="icon-bubble" data-ui-css="background:color-mix(in srgb, ${s.categoryColor} 14%, transparent); color:${s.categoryColor}">${svgIcon(s.categoryIcon, 16)}</span>
      <span class="sub-item__id">
        <b>${escapeHtml(s.name)}</b>
        <span>${s.cadenceLabel}${s.cadenceId === "mensal" ? ` · todo dia ${s.dayOfMonth}` : ""} · ${escapeHtml(s.categoryName)}</span>
      </span>
      ${subStatusBadge(s)}
      <span class="sub-item__price">
        <b>${fmtBRL(s.annualCost)}</b>
        <span>por ano · ${fmtBRL(s.lastAmount)}/${s.cadenceId === "mensal" ? "mês" : s.cadenceLabel.toLowerCase()}</span>
      </span>
      ${svgIcon(open ? "chevronUp" : "chevronDown", 15, "sub-item__chevron")}
    </button>
    ${open ? `<div class="sub-item__body">
      <div class="health-grid">
        <div class="health-stat"><span>Próxima cobrança</span><b>${fmtDateFull(s.nextDate)}</b></div>
        <div class="health-stat"><span>Equivalente mensal</span><b>${fmtBRL(s.monthlyEquivalent)}</b></div>
        <div class="health-stat"><span>Cobranças registradas</span><b>${s.occurrences}</b></div>
        <div class="health-stat"><span>Acompanhando desde</span><b>${fmtDateShort(s.firstDate)}</b></div>
      </div>
      ${s.sinceFirstPct > 3 ? `<p class="sub-item__note">Desde a primeira cobrança o valor subiu ${s.sinceFirstPct.toFixed(0)}%; de ${fmtBRL(s.firstAmount)} para ${fmtBRL(s.lastAmount)}.</p>` : ""}
      ${s.kind === "recorrente" ? `<p class="sub-item__note">O valor varia entre as cobranças, então este é um gasto recorrente e não uma assinatura de preço fixo. O total usa a última cobrança como referência.</p>` : ""}
      <div class="sub-item__actions">
        ${ignored
          ? `<button class="btn btn--primary btn--sm" data-action="sub-track" data-id="${escapeHtml(s.key)}">Voltar a acompanhar</button>`
          : `${s.flaggedRecurring
              ? `<button class="btn btn--secondary btn--sm" data-action="sub-unflag" data-id="${escapeHtml(s.key)}">Desmarcar como recorrente</button>`
              : `<button class="btn btn--secondary btn--sm" data-action="rec-confirm" data-id="${escapeHtml(s.key)}">Marcar como recorrente</button>`}
             <button class="btn btn--ghost btn--sm" data-action="sub-ignore" data-id="${escapeHtml(s.key)}">Parar de acompanhar</button>`}
      </div>
    </div>` : ""}
  </div>`;
}

// Cartão do Dashboard; agora com o número que importa (o ano) e o alerta de
// reajuste, que antes só existia na tela cheia.
function renderSubscriptionsCard() {
  const m = recurringModel(keyOfCurrentMonth());
  if (m.counts.subscriptions === 0 && m.counts.variable === 0) return "";
  const top = m.subscriptions.concat(m.variable).slice(0, 3);
  return `<div class="card card--subs span-3" data-action="nav" data-tab="subscriptions" data-ui-css="cursor:pointer">
    <div class="leak-header">
      ${svgIcon("refresh", 18, "leak-header__icon")}
      <div>
        <p class="card-title" data-ui-css="margin:0">Assinaturas e recorrências</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${m.counts.subscriptions + m.counts.variable} identificadas · ${fmtBRL(m.annualTotal)} por ano em assinaturas</p>
      </div>
      <span class="leak-total">${fmtBRL(m.committedMonthly)}/mês</span>
    </div>
    <div class="leak-list">
      ${top.map((s) => `<div class="leak-row">
        <span class="icon-bubble" data-ui-css="width:26px;height:26px;background:color-mix(in srgb, ${s.categoryColor} 14%, transparent); color:${s.categoryColor}">${svgIcon(s.categoryIcon, 13)}</span>
        <span class="leak-name">${escapeHtml(s.name)}</span>
        ${s.increasePct > 3 ? `<span class="status-badge" data-ui-css="background:var(--negative-soft); color:var(--negative)">${svgIcon("arrowUpRight", 11)} +${s.increasePct.toFixed(0)}%</span>` : ""}
        <span class="leak-value">${fmtBRL(s.lastAmount)}</span>
      </div>`).join("")}
    </div>
    ${m.proposals.length > 0 ? `<p class="card-subtitle" data-ui-css="margin:8px 0 0">${svgIcon("info", 13)} ${m.proposals.length} ${m.proposals.length === 1 ? "padrão aguarda" : "padrões aguardam"} confirmação de cadastro.</p>` : ""}
  </div>`;
}
