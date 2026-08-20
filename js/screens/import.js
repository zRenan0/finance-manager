// js/screens/import.js. Importação de extrato (OFX/CSV). Parser em import.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// IMPORTADOR DE EXTRATOS (OFX/CSV)
// ==================================================================
function renderImportScreen() {
  const rows = state.importRows;
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Importar extrato")}

    ${!rows ? `
      <div class="card">
        <p class="card-subtitle" data-ui-css="margin-top:0">Baixe o extrato OFX ou CSV no app do seu banco e solte aqui. A leitura e a categorização acontecem no seu aparelho; nada é enviado para nenhum servidor.</p>
        ${state.importError ? `<div class="inline-error">
          ${svgIcon("alertTriangle", 16)}
          <div>
            <p class="inline-error__title">${escapeHtml(state.importError.title)}</p>
            ${state.importError.detail ? `<p class="inline-error__detail">${escapeHtml(state.importError.detail)}</p>` : ""}
          </div>
          <button class="icon-btn icon-btn--muted" data-action="dismiss-import-error" aria-label="Fechar erro de importação">${svgIcon("x", 14)}</button>
        </div>` : ""}
        ${state.importLoading ? `<div class="ai-loading"><span class="spinner"></span> Lendo e categorizando o extrato…</div>` : `
        <label class="dropzone ${state.importDragOver ? "dropzone--over" : ""}" id="statement-dropzone" data-action="statement-dropzone-click">
          ${svgIcon("file", 30)}
          <span class="dropzone__title">Arraste o arquivo aqui</span>
          <span class="dropzone__subtitle">ou toque para escolher (.ofx, .csv)</span>
        </label>`}
      </div>` : renderImportReview(rows)}
  </div>`;
}

function renderImportReview(rows) {
  const included = rows.filter((r) => r.include);
  const totalIn = included.reduce((s, r) => s + r.amount, 0);
  return `<div class="card">
    <div class="settings-row-header">
      <p class="card-title">Revisar lançamentos (${rows.length})</p>
      <button class="icon-btn" data-action="import-cancel" aria-label="Cancelar importação">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${(rows.meta && rows.meta.format ? rows.meta.format.toUpperCase() + " · " : "")}${included.length} selecionados para importar · total ${fmtBRL(totalIn)}. Duplicados já vêm desmarcados${rows.meta && rows.meta.skipped ? ` · ${rows.meta.skipped} linha(s) ignorada(s)` : ""}.</p>
    <div class="import-list">
      ${rows.map((r, idx) => `<div class="import-row ${!r.include ? "import-row--off" : ""}">
        <button class="checkbox ${r.include ? "checked" : ""}" data-action="import-toggle" data-id="${idx}">${r.include ? svgIcon("check", 13) : ""}</button>
        <div class="import-row__info">
          <p class="import-row__desc">${escapeHtml(r.description || (r.type === "income" ? "Receita" : "Gasto"))} ${r.duplicate ? `<span class="import-dup-tag">possível duplicata</span>` : ""}</p>
          <p class="import-row__meta">${fmtDateShort(r.date)} · ${r.type === "income" ? "Receita" : "Gasto"}</p>
        </div>
        ${r.type === "expense" ? `<select class="import-cat-select" data-action-select="import-category" data-id="${idx}">
          ${state.data.categories.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>` : ""}
        <span class="import-row__amount ${r.type === "income" ? "tx-amount--income" : ""}">${r.type === "income" ? "+" : "-"}${fmtBRL(r.amount)}</span>
      </div>`).join("")}
    </div>
    <button class="btn btn--primary btn--block" data-ui-css="margin-top:14px" data-action="import-confirm" ${included.length === 0 ? "disabled" : ""}>Importar ${included.length} lançamento(s)</button>
    <button class="btn btn--ghost btn--block btn--sm" data-ui-css="margin-top:8px" data-action="nav" data-tab="rules">
      ${svgIcon("tag", 14)} Corrigindo a mesma categoria várias vezes? Crie uma regra
    </button>
  </div>`;
}
