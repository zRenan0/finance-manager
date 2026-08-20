// js/screens/achievements.js. Gamificação: nível, XP e conquistas. A regra mora em achievements.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// [M6] GAMIFICAÇÃO; nível, XP e conquistas
// ------------------------------------------------------------------
// Toda a regra mora em `achievements.js`. Aqui só há HTML.
//
// A tela foi desenhada para responder, nesta ordem: "onde eu estou?" (nível),
// "o que eu já fiz?" (conquistas), "o que eu faço agora?" (próximas). A última
// pergunta é a que muda comportamento; por isso as trancadas COM progresso
// aparecem antes das já conquistadas dentro de cada grupo.
// ==================================================================

function achFormatValue(item, value) {
  if (item.unit === "money") return fmtBRLShort(value);
  if (item.unit === "pct") return `${fmtNum(Math.round(value))}%`;
  return fmtNum(Math.round(value * 10) / 10);
}

// Anel de nível: mesmo vocabulário visual do Score e das metas.
// `onDark` troca a paleta para o painel esmeralda; sobre fundo escuro a cor do
// nível (cinza no nível 1) some, então lá o arco usa o brilho da marca e o texto
// herda o branco do painel. Contraste não é detalhe estético.
function renderLevelRing(level, size, onDark) {
  const s = size || 92;
  const stroke = Math.round(s * 0.095);
  const r = s / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  const len = Math.max(0, clamp(level.progress, 0, 1) * c);
  const track = onDark ? "rgba(255,255,255,0.22)" : "var(--border)";
  const arc = onDark ? "var(--brand-glow)" : level.color;
  return `<svg class="level-ring" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" role="img" aria-label="Nível ${level.level}, ${escapeHtml(level.name)}, ${Math.round(level.progress * 100)}% para o próximo">
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}" />
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${arc}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${len} ${c - len}"
      transform="rotate(-90 ${s / 2} ${s / 2})" class="level-ring__arc" />
    <text x="50%" y="47%" text-anchor="middle" class="level-ring__num" fill="currentColor">${level.level}</text>
    <text x="50%" y="66%" text-anchor="middle" class="level-ring__cap" fill="currentColor">NÍVEL</text>
  </svg>`;
}

function renderAchievementBadge(item, compact) {
  const tier = item.tierMeta;
  const color = item.done ? tier.color : "var(--ink-faint)";
  const pct = Math.round(item.progress * 100);
  const open = state.gamification.detailId === item.id;
  const remaining = Math.max(0, item.target - item.current);
  return `<button class="ach-badge ${item.done ? "ach-badge--done" : ""} ${compact ? "ach-badge--compact" : ""} ${open ? "ach-badge--open" : ""}"
      data-action="ach-detail" data-id="${item.id}" aria-expanded="${open}"
      aria-label="${escapeHtml(item.name)}. ${item.done ? "conquistada" : `${pct}% concluída`}">
    <span class="ach-badge__medal" data-ui-css="--ach-color:${color}">
      ${svgIcon(item.icon, compact ? 17 : 20)}
      ${item.done ? `<span class="ach-badge__check">${svgIcon("check", 10)}</span>` : ""}
    </span>
    <span class="ach-badge__body">
      <span class="ach-badge__name">${escapeHtml(item.name)}</span>
      <span class="ach-badge__meta">
        <span class="ach-tier" data-ui-css="color:${tier.color}">${tier.label}</span>
        <span class="ach-xp">+${item.xp} XP</span>
      </span>
      ${item.done
        ? `<span class="ach-badge__done">${svgIcon("checkCircle", 12)} ${item.unlockedAt ? `Conquistada em ${fmtDateFull(item.unlockedAt)}` : "Conquistada"}</span>`
        : `<span class="ach-progress"><span class="ach-progress__fill" data-ui-css="width:${pct}%;background:${tier.color}"></span></span>
           <span class="ach-badge__hint">${achFormatValue(item, item.current)} de ${achFormatValue(item, item.target)}${remaining > 0 ? ` · faltam ${achFormatValue(item, remaining)}` : ""}</span>`}
      ${open ? `<span class="ach-badge__desc">${escapeHtml(item.desc)}</span>` : ""}
    </span>
  </button>`;
}

// ---- Cartão do dashboard: nível, barra de XP e o que vem a seguir ----
function renderGamificationCard(m) {
  if (!(state.data.achievements && state.data.achievements.enabled)) return "";
  const lvl = m.level;
  const next = m.nextUp[0];
  return `<div class="card span-1 card--level">
    <div class="settings-row-header">
      <p class="card-title">Seu nível</p>
      <button class="link-btn" data-action="nav" data-tab="achievements">Ver conquistas ${svgIcon("chevronRight", 13)}</button>
    </div>
    <div class="level-head">
      ${renderLevelRing(lvl, 84)}
      <div class="level-head__text">
        <p class="level-name" data-ui-css="color:${lvl.color}">${escapeHtml(lvl.name)}</p>
        <p class="level-sub">${m.unlockedCount} de ${m.total} conquistas · ${fmtNum(m.xp)} XP</p>
        ${lvl.isMax
          ? `<p class="level-next">${svgIcon("star", 12)} Nível máximo alcançado.</p>`
          : `<p class="level-next">Faltam <b>${fmtNum(lvl.toNext)} XP</b> para <b>${escapeHtml(lvl.next.name)}</b></p>`}
      </div>
    </div>
    <div class="level-bar"><span class="level-bar__fill" data-ui-css="width:${Math.round(lvl.progress * 100)}%;background:${lvl.color}"></span></div>
    ${m.streak.saving >= 2
      ? `<p class="level-streak">${svgIcon("bolt", 13)} <b>${m.streak.saving} meses seguidos</b> economizando. Não quebre a sequência.</p>`
      : m.streak.active >= 2
        ? `<p class="level-streak">${svgIcon("refresh", 13)} <b>${m.streak.active} meses seguidos</b> registrando seus lançamentos.</p>`
        : ""}
    ${next ? `<div class="level-next-goal">
      <p class="level-next-goal__label">Próxima conquista</p>
      ${renderAchievementBadge(next, true)}
    </div>` : ""}
  </div>`;
}

// ---- Overlay de celebração ----
// Aparece UMA vez, no momento do desbloqueio, e não bloqueia nada: qualquer
// clique fecha. Comemoração que atrapalha vira interrupção.
function renderCelebrationOverlay() {
  if (!(state.data.achievements && state.data.achievements.enabled)) return "";
  const list = state.gamification.celebrating;
  if (!list || list.length === 0) return "";
  const first = list[0];
  return `<div class="celebrate-overlay" data-action="dismiss-celebration" role="dialog" aria-modal="true" aria-label="Nova conquista">
    <div class="celebrate-card" data-stop-close="1">
      <div class="celebrate-rays" aria-hidden="true"></div>
      <span class="celebrate-medal" data-ui-css="--ach-color:${first.tierMeta.color}">${svgIcon(first.icon, 34)}</span>
      <p class="celebrate-kicker">${list.length > 1 ? `${list.length} novas conquistas` : "Conquista desbloqueada"}</p>
      <p class="celebrate-title">${escapeHtml(first.name)}</p>
      <p class="celebrate-desc">${escapeHtml(first.desc)}</p>
      <p class="celebrate-xp">+${fmtNum(list.reduce((sum, i) => sum + i.xp, 0))} XP</p>
      ${list.length > 1 ? `<p class="celebrate-more">${list.slice(1).map((i) => escapeHtml(i.name)).join(" · ")}</p>` : ""}
      <div class="celebrate-actions">
        <button class="btn btn--primary btn--block" data-action="dismiss-celebration">Continuar</button>
        <button class="btn btn--block" data-action="celebration-see-all">Ver todas as conquistas</button>
      </div>
    </div>
  </div>`;
}

// ---- Tela completa ----
const ACH_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "locked", label: "Em andamento" },
  { id: "unlocked", label: "Conquistadas" },
];

function renderAchievementsScreen() {
  if (!(state.data.achievements && state.data.achievements.enabled)) {
    return `<div class="screen screen--narrow">
      ${renderBackHeader("Conquistas")}
      <div class="card card--starter">
        <span class="starter-mark" aria-hidden="true">${svgIcon("star", 20)}</span>
        <div class="starter-copy">
          <p class="card-title">Conquistas estão desligadas</p>
          <p class="card-subtitle">Seu organizador funciona por completo sem níveis, XP ou celebrações. Ative apenas se esse tipo de acompanhamento ajudar você.</p>
        </div>
        <button class="btn btn--primary btn--block" data-action="toggle-gamification">Ativar conquistas</button>
      </div>
    </div>`;
  }
  const m = achievementsModel();
  const filter = state.gamification.filter;
  const groups = m.byGroup
    .map((g) => ({
      ...g,
      visible: g.items.filter((i) =>
        filter === "all" ? true : filter === "unlocked" ? i.done : filter === "locked" ? !i.done : g.id === filter),
    }))
    .filter((g) => g.visible.length > 0);

  return `<div class="screen">
    ${renderBackHeader("Conquistas")}
    <div class="grid-dashboard">
      ${renderAchievementsHero(m)}
      ${m.nextUp.length > 0 ? `<div class="card span-2">
        <p class="card-title">O que vem a seguir</p>
        <p class="card-subtitle">As três conquistas mais próximas de fechar.</p>
        <div class="ach-grid">${m.nextUp.map((i) => renderAchievementBadge(i)).join("")}</div>
      </div>` : ""}
      ${m.recent.length > 0 ? `<div class="card span-1">
        <p class="card-title">Conquistas recentes</p>
        <div class="ach-recent">
          ${m.recent.map((i) => `<div class="ach-recent__row">
            <span class="ach-recent__medal" data-ui-css="--ach-color:${i.tierMeta.color}">${svgIcon(i.icon, 15)}</span>
            <div class="ach-recent__text"><b>${escapeHtml(i.name)}</b><span>${fmtDateFull(i.unlockedAt)}</span></div>
            <span class="ach-xp">+${i.xp}</span>
          </div>`).join("")}
        </div>
      </div>` : ""}

      <div class="card span-3">
        <div class="settings-row-header">
          <p class="card-title">Todas as conquistas</p>
          <span class="card-subtitle" data-ui-css="margin:0">${m.unlockedCount}/${m.total}</span>
        </div>
        <div class="ach-filters" role="tablist" aria-label="Filtrar conquistas">
          ${ACH_FILTERS.map((f) => `<button class="ach-filter-chip ${filter === f.id ? "active" : ""}" role="tab" aria-selected="${filter === f.id}" data-action="ach-filter" data-value="${f.id}">${f.label}</button>`).join("")}
          ${m.byGroup.map((g) => `<button class="ach-filter-chip ${filter === g.id ? "active" : ""}" role="tab" aria-selected="${filter === g.id}" data-action="ach-filter" data-value="${g.id}">${svgIcon(g.icon, 12)}${g.label}</button>`).join("")}
        </div>
        ${groups.length === 0
          ? renderEmptyState("target", "Nada por aqui ainda.", "Troque o filtro para ver as outras conquistas.")
          : groups.map((g) => `
            <div class="ach-group">
              <div class="ach-group__head">
                <span class="ach-group__icon">${svgIcon(g.icon, 15)}</span>
                <div class="ach-group__text">
                  <b>${g.label}</b>
                  <span>${g.desc}</span>
                </div>
                <span class="ach-group__count">${g.unlocked}/${g.total}</span>
              </div>
              <div class="ach-grid">${g.visible.map((i) => renderAchievementBadge(i)).join("")}</div>
            </div>`).join("")}
      </div>
    </div>
  </div>`;
}

function renderAchievementsHero(m) {
  const lvl = m.level;
  const tierCounts = ["bronze", "prata", "ouro", "platina"].map((t) => ({
    ...ACH_TIERS[t],
    count: m.items.filter((i) => i.tier === t && i.done).length,
    total: m.items.filter((i) => i.tier === t).length,
  }));
  return `<div class="card card--hero span-3 level-hero">
    <div class="hero-glow"></div>
    <div class="level-hero__main">
      ${renderLevelRing(lvl, 104, true)}
      <div class="level-hero__text">
        <p class="hero-label">Nível ${lvl.level}</p>
        <p class="level-hero__name">${escapeHtml(lvl.name)}</p>
        <p class="level-hero__sub">${fmtNum(m.xp)} XP acumulados · ${m.unlockedCount} de ${m.total} conquistas (${m.completionPct}%)</p>
        <div class="level-bar level-bar--lg level-bar--on-dark"><span class="level-bar__fill" data-ui-css="width:${Math.round(lvl.progress * 100)}%"></span></div>
        <p class="level-hero__next">${lvl.isMax
          ? "Você chegou ao topo. Agora é manter."
          : `Faltam <b>${fmtNum(lvl.toNext)} XP</b> para <b>${escapeHtml(lvl.next.name)}</b>`}</p>
      </div>
    </div>
    <div class="level-hero__chips">
      ${tierCounts.map((t) => `<div class="level-tier-chip"><span class="level-tier-dot" data-ui-css="background:${t.color}"></span><b>${t.count}/${t.total}</b><span>${t.label}</span></div>`).join("")}
      <div class="level-tier-chip"><span class="level-tier-dot" data-ui-css="background:var(--brand)"></span><b>${m.streak.saving}</b><span>meses economizando</span></div>
      <div class="level-tier-chip"><span class="level-tier-dot" data-ui-css="background:var(--goal)"></span><b>${m.streak.active}</b><span>meses seguidos ativos</span></div>
    </div>
  </div>`;
}
