// js/screens/health.js. Saúde financeira. O diagnóstico vem de health.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// SAÚDE FINANCEIRA (Módulo 2)
// ------------------------------------------------------------------
// Tela dedicada de diagnóstico. Todo o raciocínio financeiro mora em
// health.js; aqui só existe transformação de modelo em HTML. O Score
// não é recalculado nem duplicado: o modelo devolve o mesmo objeto
// produzido por score.js e a tela reaproveita `renderScoreGauge`.
// ==================================================================
function renderHealthScreen() {
  const model = healthModel(keyOfCurrentMonth());
  const h = model.headline;
  const toneColor = { positive: "var(--positive)", warn: "var(--goal)", danger: "var(--negative)", neutral: "var(--ink-soft)" };

  // NOTA SEM DADOS É CHUTE COM CARA DE DIAGNÓSTICO.
  //
  // Sem nenhum lançamento, meta ou bem, os indicadores caem todos em valores
  // neutros e a média sai perto de 79 - "Bom". Quem abria a tela no primeiro
  // minuto de uso recebia um atestado de saúde financeira calculado sobre o
  // vazio, e é justamente esse número que a tela pede para levar a sério. O
  // Início já espera o primeiro lançamento para mostrar análise (ver
  // `isDashboardStarting`); aqui a espera faltava.
  if (typeof isDashboardStarting === "function" && isDashboardStarting(state.data)) {
    return `<div class="screen">
      ${renderBackHeader("Saúde financeira")}
      <div class="grid-dashboard">
        <div class="card card--dashed span-3 banner-inline">
          ${svgIcon("shieldCheck", 34, "banner-inline__icon")}
          <div class="banner-inline__text">
            <strong>O diagnóstico começa no primeiro lançamento</strong>
            <span>Reserva, liquidez, dívida e patrimônio são calculados a partir do que você registra. Sem nenhum lançamento não há nota a dar: qualquer número aqui seria chute.</span>
          </div>
          <button class="btn btn--primary btn--sm" data-action="nav" data-tab="add">Registrar</button>
        </div>
        <div class="card span-3">
          <p class="card-title">O que a nota vai olhar</p>
          <ul class="plain-list">
            ${HEALTH_INDICATORS.map((i) => `<li><b>${escapeHtml(i.label)}</b><span>${escapeHtml(i.what)}</span></li>`).join("")}
          </ul>
        </div>
      </div>
    </div>`;
  }

  return `<div class="screen">
    ${renderBackHeader("Saúde financeira")}
    <div class="grid-dashboard">
      ${renderHealthHero(model, h, toneColor)}
      ${renderScoreBreakdown(model.score)}
      ${renderEmergencyLadder()}
      ${model.indicators.map((i) => renderHealthIndicator(i)).join("")}
      ${renderHealthPlan(model)}
      <p class="footnote span-3">Os indicadores usam apenas os seus lançamentos, metas e renda cadastrada. Nada é enviado para fora do aparelho. As faixas são referências educativas, e indicadores sem base de cálculo ficam marcados como “sem dados”.</p>
    </div>
  </div>`;
}

// ---- Cabeçalho: diagnóstico em uma frase + nota geral + distribuição ----
function renderHealthHero(model, h, toneColor) {
  const s = model.score;
  const counts = model.counts;
  const chips = [
    { id: "otimo",   label: "ótimo",    color: "var(--positive)" },
    { id: "bom",     label: "saudável", color: "var(--brand)" },
    { id: "atencao", label: "atenção",  color: "var(--goal)" },
    { id: "critico", label: "crítico",  color: "var(--negative)" },
    { id: "sem",     label: "sem dados", color: "var(--ink-faint)" },
  ].filter((c) => counts[c.id] > 0);

  return `<div class="card card--health-hero span-3" data-ui-css="--tone:${toneColor[h.tone]}">
    <div class="health-calculation-link">${renderCalculationButton("health")}</div>
    <div class="health-hero__grid">
      ${s && !s.insufficient ? `<div class="health-hero__gauge">
        ${renderScoreGauge(s.score, s.level.color, 104)}
        <p class="health-hero__gauge-label" data-ui-css="color:${s.level.color}">${s.level.label}</p>
        <p class="health-hero__gauge-note">Score financeiro</p>
      </div>` : ""}
      <div class="health-hero__text">
        <p class="health-hero__eyebrow">${svgIcon(h.tone === "positive" ? "checkCircle" : h.tone === "neutral" ? "info" : "alertTriangle", 14)}<span>Diagnóstico de ${MONTH_NAMES[new Date().getMonth()].toLowerCase()}</span></p>
        <h2 class="health-hero__title">${escapeHtml(h.title)}</h2>
        <p class="health-hero__desc">${escapeHtml(h.text)}</p>
        ${chips.length > 0 ? `<div class="health-chips">
          ${chips.map((c) => `<span class="health-chip" data-ui-css="--tone:${c.color}"><b>${counts[c.id]}</b> ${c.label}</span>`).join("")}
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

// ==================================================================
// [M27] "SUA PONTUAÇÃO": DE ONDE VÊM OS PONTOS
// ==================================================================
// A nota existia desde antes e era explicada só por fora: um número, um rótulo
// e um texto de método. Quem via "69 - Regular" não tinha como saber o que
// compõe 69, quanto cada parte pesa, nem o que mudaria o número.
//
// O motor (score.js) já calculava tudo isso e nada aparecia. Este painel mostra
// o que já existia: pontos ganhos sobre o peso de cada pilar, o motivo em
// linguagem humana e o que fazer a respeito.
//
// SOBRE A FRASE DO GANHO
//
// Ela é a única do painel que faz uma promessa, então é a que precisa de mais
// cuidado. O ganho vem de `scoreGains`, que divide a lacuna do pilar pelo peso
// AVALIADO, e não por 100: prometer pontos calculados sobre pilares que estão
// fora da conta seria inventar. O texto diz "até", porque fechar a lacuna
// inteira é o teto, não o esperado.
//
// E não há precisão falsa: a nota é declarada como indicador educacional, com a
// cobertura à vista quando algum pilar ficou sem base.
function renderScoreBreakdown(s) {
  if (!s || s.insufficient || typeof scoreGains !== "function") return "";
  const ganhos = scoreGains(s);
  if (ganhos.length === 0) return "";

  const maior = ganhos[0];
  // Meio ponto não é conselho; abaixo disso a nota já está no que dá.
  const vale = maior && maior.gain >= 0.5 ? maior : null;
  const alvo = vale ? Math.min(100, Math.round(s.score + vale.gain)) : null;

  return `<div class="card span-3 score-breakdown">
    <div class="score-breakdown__head">
      <p class="card-title">Sua pontuação</p>
      <p class="card-subtitle">${vale
        ? `Você está com <b>${s.score}</b>. O maior ganho disponível está em <b>${escapeHtml(vale.label)}</b>: fechar essa lacuna somaria até <b>${Math.round(vale.gain)} ${Math.round(vale.gain) === 1 ? "ponto" : "pontos"}</b>, chegando perto de <b>${alvo}</b>.`
        : `Você está com <b>${s.score}</b>. Nenhum pilar tem lacuna relevante agora; a nota se mantém acompanhando o que já está funcionando.`}</p>
    </div>

    <ul class="score-parts">
      ${ganhos.map((p) => {
        const pct = clamp(p.ratio * 100, 0, 100);
        const pontos = Math.round(p.points);
        const cor = p.good ? "var(--brand)" : "var(--goal)";
        return `<li class="score-part">
          <div class="score-part__head">
            <span class="score-part__label">${svgIcon(p.icon, 14)} ${escapeHtml(p.label)}</span>
            <span class="score-part__points"><b>${pontos}</b> de ${p.weight}</span>
          </div>
          <div class="score-part__meter" role="img" aria-label="${escapeHtml(p.label)}: ${pontos} de ${p.weight} pontos">
            <span class="score-part__fill" data-ui-css="width:${pct}%; background:${cor}"></span>
          </div>
          ${p.detail ? `<p class="score-part__detail">${escapeHtml(p.detail)}</p>` : ""}
          ${p.advice ? `<p class="score-part__advice">${svgIcon("sparkles", 13)} <span>${escapeHtml(p.advice)}</span></p>` : ""}
        </li>`;
      }).join("")}
    </ul>

    <p class="footnote score-breakdown__note">
      Indicador educacional, criado por este app para organizar a leitura do seu mês.
      Não é score de crédito, não é usado por banco nenhum e não vale como análise de risco.
      ${s.coverage < 100 ? `Hoje ${s.coverage}% dos pilares têm base de cálculo; os demais ficam fora da conta em vez de virar nota baixa.` : "Todos os pilares têm base de cálculo neste mês."}
    </p>
  </div>`;
}

// ==================================================================
// [M28] QUANTO GUARDAR PARA EMERGÊNCIAS
// ==================================================================
// O app já tinha um alvo de reserva, mas ele era um número só, calculado sobre
// o gasto TOTAL e apresentado como se fosse o certo. Duas coisas erradas nisso:
//
//   1. numa emergência a pessoa corta delivery e streaming antes de cortar
//      aluguel e remédio, então o gasto total pede uma reserva maior que a
//      necessária, e meta grande demais é a que ninguém começa;
//   2. três, seis e nove meses não são níveis de acerto: são apostas sobre
//      quanto tempo levaria para repor a renda. O app não sabe se quem está
//      lendo é concursado ou autônomo, e fingir que sabe é o erro.
//
// Por isso a escada mostra os três degraus lado a lado, com o que cada um
// compra, e apenas MARCA o que a pessoa escolheu em Ajustes.
function renderEmergencyLadder() {
  if (typeof emergencyLadder !== "function") return "";
  const e = emergencyLadder(state.data);
  if (!e.measurable) return "";

  const meses = e.monthsCovered;
  const cobertura = meses >= 0.1 ? `${meses.toFixed(1).replace(".", ",")} ${meses < 2 ? "mês" : "meses"}` : "menos de um mês";

  return `<div class="card span-3 reserve-ladder">
    <p class="card-title">Quanto guardar para emergências</p>
    <p class="card-subtitle">
      Seus gastos essenciais somam <b>${fmtBRL(e.essentials)} por mês</b>, na média dos últimos meses fechados.
      ${e.current > 0
        ? `Os <b>${fmtBRL(e.current)}</b> que você já reservou cobrem <b>${cobertura}</b> desse essencial.`
        : "Você ainda não tem reserva registrada."}
    </p>

    <ul class="reserve-rungs">
      ${e.rungs.map((r) => `<li class="reserve-rung ${r.chosen ? "is-chosen" : ""} ${r.reached ? "is-reached" : ""}">
        <div class="reserve-rung__head">
          <span class="reserve-rung__months">${escapeHtml(r.label)}${r.chosen ? ` <span class="reserve-rung__tag">seu alvo</span>` : ""}</span>
          <span class="reserve-rung__target">${fmtBRL(r.target)}</span>
        </div>
        <div class="reserve-rung__meter" role="img" aria-label="${escapeHtml(r.label)}: ${Math.round(r.pct)}% de ${fmtBRL(r.target)}">
          <span class="reserve-rung__fill" data-ui-css="width:${clamp(r.pct, 0, 100)}%"></span>
        </div>
        <p class="reserve-rung__note">${escapeHtml(r.note)}</p>
        <p class="reserve-rung__gap">${r.reached
          ? "Já alcançado."
          : `Faltam ${fmtBRL(r.missing)}.`}</p>
      </li>`).join("")}
    </ul>

    <p class="footnote reserve-ladder__note">
      Nenhum desses degraus é obrigatório, e o app não recomenda um. Quanto mais
      instável a renda, mais meses fazem sentido; quanto mais estável, menos.
      A conta usa só o essencial (o grupo de necessidades do seu orçamento),
      porque é o que continua saindo quando tudo o mais é cortado.
      Você escolhe o alvo em Ajustes.
    </p>
  </div>`;
}

// ---- Cartão de um indicador ----
function renderHealthIndicator(i) {
  const open = state.healthDetailId === i.id;
  const color = i.status.color;
  const pct = Math.round(i.ratio * 100);

  return `<div class="card card--indicator span-1" data-ui-css="--tone:${color}">
    <div class="indicator__head">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${color} 14%, transparent); color:${color}">${svgIcon(i.icon, 16)}</span>
      <div class="indicator__head-text">
        <p class="card-title" data-ui-css="margin:0">${escapeHtml(i.label)}</p>
        <p class="indicator__status" data-ui-css="color:${color}">${i.status.label}</p>
      </div>
    </div>

    ${i.applicable ? `
      <p class="indicator__value">${escapeHtml(i.display)}</p>
      <p class="indicator__caption">${escapeHtml(i.caption)}</p>
      <div class="indicator__meter" role="img" aria-label="${escapeHtml(i.label)}: ${pct} de 100">
        <div class="indicator__meter-fill" data-ui-css="width:${pct}%; background:${color}"></div>
        ${i.marks.map((m) => `<span class="indicator__mark" data-ui-css="left:${clamp(m.at * 100, 0, 100)}%" title="${escapeHtml(m.label)}"></span>`).join("")}
      </div>
    ` : `<p class="indicator__value indicator__value--empty">Sem dados</p>`}

    <p class="indicator__desc">${escapeHtml(i.description)}</p>

    ${i.recommendation ? `<div class="indicator__advice">
      ${svgIcon("sparkles", 14, "indicator__advice-icon")}
      <div>
        <p class="indicator__advice-text">${escapeHtml(i.recommendation)}</p>
        ${i.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${i.cta.tab}">${escapeHtml(i.cta.label)}</button>` : ""}
      </div>
    </div>` : ""}

    <button class="indicator__more" data-action="toggle-health-detail" data-id="${i.id}" aria-expanded="${open}">
      <span>${open ? "Ocultar" : "Como é calculado"}</span>${svgIcon(open ? "chevronUp" : "chevronDown", 14)}
    </button>
    ${open ? `<div class="indicator__method">
      <p>${escapeHtml(i.what)}</p>
      ${i.benchmark ? `<p class="indicator__benchmark">${escapeHtml(i.benchmark)}</p>` : ""}
    </div>` : ""}
  </div>`;
}

// ---- Plano de ação: fila priorizada, não uma lista de desejos ----
function renderHealthPlan(model) {
  const plan = model.actionPlan;
  if (plan.length === 0) {
    return `<div class="card span-3">
      <p class="card-title">Plano de ação</p>
      ${model.rated === 0
        ? renderEmptyState("target", "Sem diagnóstico ainda.", "Cadastre sua renda e alguns lançamentos para receber recomendações.")
        : renderEmptyState("checkCircle", "Nenhuma ação urgente.", "Todos os indicadores avaliados estão em nível saudável ou ótimo.")}
    </div>`;
  }
  return `<div class="card card--plan span-3">
    <p class="card-title">Plano de ação</p>
    <p class="health-sub">Na ordem em que faz sentido resolver: liquidez e dívida antes de reserva, reserva antes de investimento.</p>
    <ol class="plan-list">
      ${plan.map((p) => `<li class="plan-item" data-ui-css="--tone:${p.status.color}">
        <span class="plan-item__num">${p.order}</span>
        <div class="plan-item__body">
          <p class="plan-item__label">${svgIcon(p.icon, 13)}<span>${escapeHtml(p.label)}</span><span class="plan-item__tag">${p.status.label}</span></p>
          <p class="plan-item__text">${escapeHtml(p.text)}</p>
          ${p.cta ? `<button class="btn btn--secondary btn--sm" data-action="nav" data-tab="${p.cta.tab}">${escapeHtml(p.cta.label)}</button>` : ""}
        </div>
      </li>`).join("")}
    </ol>
  </div>`;
}
