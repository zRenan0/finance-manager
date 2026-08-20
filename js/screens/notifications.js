// js/screens/notifications.js. Central de notificações. Modelo em services.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// [M8] CENTRAL DE NOTIFICAÇÕES
// ==================================================================
// A tela não decide nada: `NotificationService` monta o modelo (agrupado por
// período, com contagens e estado de leitura) e aqui só se desenha. A escrita
// volta pelas mesmas funções puras; a UI nunca mexe no array de avisos à mão.
const NOTIF_TONE_CLASS = { danger: "notif-item--danger", warn: "notif-item--warn", positive: "notif-item--positive", info: "" };

function renderNotificationsScreen() {
  const m = notificationsModel();
  const c = m.counts;

  return `<div class="screen screen--narrow">
    ${renderBackHeader("Notificações")}

    <div class="card card--hero">
      <div class="hero-glow"></div>
      <p class="hero-label">${c.unread > 0 ? `${c.unread} ${c.unread === 1 ? "aviso não lido" : "avisos não lidos"}` : "Tudo em dia"}</p>
      <p class="hero-value">${c.total}</p>
      <p class="hero-reserved">${svgIcon("bell", 14)} ${c.total === 1 ? "aviso no histórico" : "avisos no histórico"}${c.urgent > 0 ? ` · ${c.urgent} ${c.urgent === 1 ? "urgente" : "urgentes"}` : ""}</p>
      <div class="hero-tools">
        ${c.unread > 0 ? `<button class="hero-tool-btn" data-action="notif-read-all">${svgIcon("checkCircle", 15)}Marcar todas como lidas</button>` : ""}
        <button class="hero-tool-btn" data-action="notif-settings">${svgIcon("gear", 15)}Silenciar grupos</button>
        ${c.total > c.unread ? `<button class="hero-tool-btn" data-action="notif-clear">${svgIcon("trash", 15)}Limpar as lidas</button>` : ""}
      </div>
    </div>

    ${state.notif.settingsOpen ? renderNotifSettingsCard(m) : ""}

    <div class="segmented segmented--scroll">
      <button class="segmented__option ${state.notif.filter === "all" ? "active" : ""}" data-action="notif-filter" data-value="all">Todas${c.total > 0 ? ` (${c.total})` : ""}</button>
      <button class="segmented__option ${state.notif.filter === "unread" ? "active" : ""}" data-action="notif-filter" data-value="unread">Não lidas${c.unread > 0 ? ` (${c.unread})` : ""}</button>
      ${m.groups.filter((g) => g.count > 0).map((g) => `
        <button class="segmented__option ${state.notif.filter === g.id ? "active" : ""}" data-action="notif-filter" data-value="${g.id}">${escapeHtml(g.label)} (${g.count})</button>`).join("")}
    </div>

    ${m.buckets.length === 0
      ? renderEmptyState("bell", notifEmptyTitle(m), notifEmptyHint(m))
      : m.buckets.map((b) => `<div class="card">
          <p class="card-title">${b.label}</p>
          <div class="notif-list">${b.items.map(renderNotifItem).join("")}</div>
        </div>`).join("")}

    <p class="footnote">Os avisos são gerados no seu aparelho a partir do histórico já salvo; nenhum dado é enviado a servidor algum e nenhuma permissão de notificação do sistema é solicitada. Silenciar um grupo interrompe novos avisos daquele tipo, sem apagar nada do histórico.</p>
  </div>`;
}

function notifEmptyTitle(m) {
  if (!m.hasAny) return "Nenhum aviso ainda.";
  if (state.notif.filter === "unread") return "Você está em dia.";
  return "Nada neste filtro.";
}

function notifEmptyHint(m) {
  if (!m.hasAny) return "Contas a vencer, orçamento estourado, reajuste de assinatura, meta atrasada e saldo projetado negativo aparecem aqui assim que acontecerem.";
  if (state.notif.filter === "unread") return "Todos os avisos foram lidos. Os novos aparecem aqui automaticamente.";
  return "Troque o filtro para ver os outros avisos do histórico.";
}

function renderNotifItem(n) {
  return `<div class="notif-item ${NOTIF_TONE_CLASS[n.tone] || ""} ${n.readAt ? "is-read" : ""}">
    <span class="notif-item__icon">${svgIcon(n.icon, 16)}</span>
    <div class="notif-item__body">
      <p class="notif-item__title">${n.readAt ? "" : `<i class="notif-dot" aria-label="Não lida"></i>`}${escapeHtml(n.title)}</p>
      <p class="notif-item__msg">${escapeHtml(n.message)}</p>
      <p class="notif-item__meta">${escapeHtml(n.groupLabel)} · ${n.dateLabel}</p>
    </div>
    <div class="notif-item__actions">
      <button class="btn btn--secondary btn--sm" data-action="notif-open" data-id="${n.id}" data-tab="${n.tab}">Ver</button>
      ${n.readAt ? "" : `<button class="icon-btn icon-btn--muted" data-action="notif-read" data-id="${n.id}" aria-label="Marcar como lida">${svgIcon("check", 15)}</button>`}
      <button class="icon-btn icon-btn--muted" data-action="notif-remove" data-id="${n.id}" aria-label="Remover aviso">${svgIcon("x", 15)}</button>
    </div>
  </div>`;
}

function renderNotifSettingsCard(m) {
  return `<div class="card">
    <p class="card-title">O que pode me avisar</p>
    <p class="card-subtitle">Silenciar um grupo interrompe apenas a criação de novos avisos daquele tipo. Os lançamentos, os totais e as outras telas continuam exatamente iguais.</p>
    <div class="tool-links">
      ${m.groups.map((g) => `
        <button class="tool-link" data-action="notif-mute" data-id="${g.id}">
          ${svgIcon(g.icon, 17)}<span>${escapeHtml(g.label)}</span>
          <span class="switch ${g.muted ? "" : "active"}"><span class="switch__knob"></span></span>
        </button>`).join("")}
    </div>
  </div>`;
}
