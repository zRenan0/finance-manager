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

    ${renderSubsTypes(m)}

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
      : `<div class="sub-list">${list.map((s) => renderSubItem(s, view === "ignoradas", m.income)).join("")}</div>`}

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
      <div class="health-stat"><span>Recorrências no ano</span><b>${fmtBRL(m.committedAnnual)}</b></div>
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

// [M33] Painel por tipo de recorrência.
//
// A pergunta que a tela respondia era "quanto custa cada assinatura". A que
// faltava é "quanto do meu mês é streaming, software, academia ou serviço" -
// que é a pergunta que se responde antes de decidir o que revisar.
//
// O agrupamento é INFERIDO pelo nome e a tela diz isso. Não substitui a
// categoria financeira do lançamento, que continua exatamente onde estava.
function renderSubsTypes(m) {
  if (!m.byType || m.byType.length < 2) return "";
  return `<div class="card">
    <p class="card-title">Por tipo de recorrência</p>
    <p class="card-subtitle">Somado pelo equivalente mensal, para que um seguro anual não pareça uma cobrança de todo mês. O tipo é reconhecido pelo nome do lançamento; a categoria de cada gasto continua a mesma.</p>
    <div class="leak-list">
      ${m.byType.map((t) => `<div class="leak-row">
        <span class="icon-bubble" data-ui-css="width:26px;height:26px">${svgIcon(t.icon, 13)}</span>
        <span class="leak-name">${escapeHtml(t.label)}</span>
        <span class="import-row__meta">${t.count} ${t.count === 1 ? "item" : "itens"} · ${fmtBRL(t.annual)}/ano</span>
        <span class="leak-value">${fmtBRL(t.monthly)}/mês</span>
      </div>`).join("")}
    </div>
  </div>`;
}

// [M33] "Revisar assinatura".
//
// O roteiro é explícito: o app NÃO afirma que uma assinatura é inútil. Ele não
// sabe. Não sabe se você usa, se é da família toda, se é ferramenta de trabalho.
// O que ele sabe é o preço, a cadência, o histórico e o peso na renda; e é isso
// que esta ficha coloca lado a lado, com as perguntas que só você responde.
//
// "Marcar como revisada" guarda uma DATA, não um veredito.
//
// As perguntas mudam com o tipo porque a pergunta genérica erra o alvo: "você
// usou nos últimos 30 dias?" faz sentido para um streaming e é absurda para o
// aluguel. Perguntar errado desmoraliza a ficha inteira.
const SUBS_REVIEW_QUESTIONS = {
  streaming: [
    "Você assistiu ou ouviu alguma coisa aqui no último mês?",
    "Existe plano anual, familiar ou com anúncios que sirva igual?",
    "Alguém da casa já paga um serviço parecido?",
  ],
  software: [
    "Você abriu esta ferramenta no último mês?",
    "O plano contratado corresponde ao que você usa, ou sobra recurso?",
    "Existe versão anual, gratuita ou incluída em outra assinatura que você já paga?",
  ],
  academia: [
    "Quantas vezes você foi no último mês?",
    "O plano é o que cabe na sua frequência real, ou você paga pelo ilimitado?",
    "Há fidelidade ou multa se você quiser mudar?",
  ],
  telecom: [
    "A franquia ou velocidade contratada corresponde ao seu uso real?",
    "Há serviço extra na fatura que você não reconhece ou não usa?",
    "Faz quanto tempo que você não revisa o plano com a operadora?",
  ],
  moradia: [
    "O valor mudou por consumo, por reajuste ou por cobrança nova?",
    "Há algo na conta que você não reconhece?",
    "Este custo ainda corresponde ao que você precisa hoje?",
  ],
  seguros: [
    "A cobertura ainda corresponde ao que você tem e a quem depende de você?",
    "Você cotou com outra seguradora nos últimos 12 meses?",
    "Existe franquia ou carência que você precisa lembrar antes de mexer?",
  ],
  educacao: [
    "O curso ou a matrícula ainda está em andamento?",
    "Você tem usado o acesso que está pagando?",
    "Existe plano anual ou material incluído que evite pagar duas vezes?",
  ],
  servicos: [
    "Você usou este serviço no último mês?",
    "Existe plano menor, anual ou compartilhado que sirva igual?",
    "Alguém da casa já paga algo que faz o mesmo?",
  ],
};
const SUBS_REVIEW_DEFAULT = [
  "Você usou ou precisou disto no último mês?",
  "O valor cobrado corresponde ao que você contratou?",
  "Existe opção mais simples, anual ou compartilhada que sirva igual?",
];

function subsReviewQuestions(s) {
  return SUBS_REVIEW_QUESTIONS[s.typeId] || SUBS_REVIEW_DEFAULT;
}

// Aluguel e conta de luz são compromissos recorrentes, não assinaturas.
// Chamá-los de assinatura no botão faria a tela parecer que não entendeu o que
// está olhando.
const SUBS_NOT_SUBSCRIPTION = ["moradia", "telecom", "seguros", "outros"];
function subsReviewLabel(s) {
  return SUBS_NOT_SUBSCRIPTION.indexOf(s.typeId) >= 0 ? "Revisar compromisso" : "Revisar assinatura";
}

function renderSubReview(s, income) {
  const share = income > 0 ? safePct(s.monthlyEquivalent, income) : null;
  return `<div class="sub-review">
    <p class="field__label">Revisar ${escapeHtml(s.name)}</p>
    <div class="health-grid">
      <div class="health-stat"><span>Custo em 12 meses</span><b>${fmtBRL(s.annualCost)}</b></div>
      <div class="health-stat"><span>Equivalente mensal</span><b>${fmtBRL(s.monthlyEquivalent)}</b></div>
      ${share != null ? `<div class="health-stat"><span>Da sua renda</span><b>${share.toFixed(1)}%</b></div>` : ""}
      <div class="health-stat"><span>Tipo reconhecido</span><b>${escapeHtml(s.typeLabel)}</b></div>
    </div>
    <p class="sub-item__note">${s.occurrences > 1
      ? `${s.occurrences} cobranças registradas desde ${fmtDateShort(s.firstDate)}${s.sinceFirstPct > 3 ? `, com alta de ${s.sinceFirstPct.toFixed(0)}% no período` : ", sem reajuste relevante no período"}.`
      : "Ainda há uma cobrança só no histórico; os números acima usam o valor lançado."}</p>
    <p class="field__label">O que só você pode responder</p>
    <ul class="sub-review__list">
      ${subsReviewQuestions(s).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}
      <li>Este compromisso ocupa ${fmtBRL(s.monthlyEquivalent)} por mês do seu orçamento. O que mais poderia ocupar esse espaço?</li>
    </ul>
    <p class="sub-item__note">O app não diz se ${SUBS_NOT_SUBSCRIPTION.indexOf(s.typeId) >= 0 ? "este compromisso" : "esta assinatura"} vale a pena; ele não sabe o que isso significa para você. Aqui estão os números; a decisão é sua, e não decidir também é uma decisão válida.</p>
    <div class="sub-item__actions">
      <button class="btn btn--primary btn--sm" data-action="sub-reviewed" data-id="${escapeHtml(s.key)}">${s.reviewedAt ? "Revisei de novo hoje" : "Marcar como revisada"}</button>
      <button class="btn btn--ghost btn--sm" data-action="sub-review" data-id="${escapeHtml(s.key)}">Fechar ficha</button>
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

function renderSubItem(s, ignored, income) {
  const open = state.subs.expandedKey === s.key;
  const reviewing = open && state.subs.reviewKey === s.key;
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
        <div class="health-stat"><span>Tipo reconhecido</span><b>${escapeHtml(s.typeLabel)}</b></div>
      </div>
      ${s.sinceFirstPct > 3 ? `<p class="sub-item__note">Desde a primeira cobrança o valor subiu ${s.sinceFirstPct.toFixed(0)}%; de ${fmtBRL(s.firstAmount)} para ${fmtBRL(s.lastAmount)}.</p>` : ""}
      ${s.kind === "recorrente" ? `<p class="sub-item__note">O valor varia entre as cobranças, então este é um gasto recorrente e não uma assinatura de preço fixo. O total usa a última cobrança como referência.</p>` : ""}
      ${s.reviewedAt ? `<p class="sub-item__note">Você revisou este item em ${fmtDateFull(s.reviewedAt)}${s.daysSinceReview > 0 ? ` (há ${s.daysSinceReview} ${s.daysSinceReview === 1 ? "dia" : "dias"})` : ""}. A marcação guarda só a data; nenhum juízo sobre a assinatura.</p>` : ""}
      ${s.declaredOnly ? `<p class="sub-item__note">Este compromisso vem da marcação "gasto fixo mensal" no lançamento, não de um histórico de cobranças. A partir da segunda cobrança o app passa a usar as datas e os valores reais.</p>` : ""}
      <div class="sub-item__actions">
        ${ignored
          ? `<button class="btn btn--primary btn--sm" data-action="sub-track" data-id="${escapeHtml(s.key)}">Voltar a acompanhar</button>`
          : `${s.flaggedRecurring
              ? `<button class="btn btn--secondary btn--sm" data-action="sub-unflag" data-id="${escapeHtml(s.key)}">Desmarcar como recorrente</button>`
              : `<button class="btn btn--secondary btn--sm" data-action="rec-confirm" data-id="${escapeHtml(s.key)}">Marcar como recorrente</button>`}
             <button class="btn btn--secondary btn--sm" data-action="sub-review" data-id="${escapeHtml(s.key)}">${reviewing ? "Fechar revisão" : subsReviewLabel(s)}</button>
             <button class="btn btn--ghost btn--sm" data-action="sub-ignore" data-id="${escapeHtml(s.key)}">Parar de acompanhar</button>`}
      </div>
      ${reviewing && !ignored ? renderSubReview(s, income) : ""}
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
