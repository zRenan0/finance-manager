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

  // O "total" antigo somava receita e despesa no mesmo balde e devolvia um
  // número que não existe em lugar nenhum do extrato: R$ 5.420,00 de salário
  // mais R$ 1.830,25 de gastos viravam "total R$ 7.250,25", que não é nem o
  // que entrou, nem o que saiu, nem o saldo entre os dois. As duas direções
  // andam separadas. r.amount é sempre a magnitude; quem dá o sinal é r.type.
  // sumMoney trabalha em centavos inteiros, ao contrário do reduce com + que
  // acumulava erro de float a cada linha do arquivo.
  const totalEntradas = sumMoney(included.filter((r) => r.type === "income"), (r) => r.amount);
  const totalSaidas = sumMoney(included.filter((r) => r.type !== "income"), (r) => r.amount);
  // Extrato só de gastos é o caso comum. Mostrar "R$ 0,00 em entradas" ali
  // seria ruído, então cada direção só aparece quando tem valor.
  const partesTotal = [];
  if (totalEntradas > 0) partesTotal.push(`${fmtBRL(totalEntradas)} em entradas`);
  if (totalSaidas > 0) partesTotal.push(`${fmtBRL(totalSaidas)} em saídas`);

  // A DATA DE ABERTURA DA CONTA MORDE MAIS FORTE AQUI.
  //
  // O extrato vem com o mês inteiro, quase sempre com datas anteriores ao dia
  // em que a conta foi cadastrada. Esses lançamentos entram nas despesas, nos
  // gráficos e nas categorias, mas ficam de fora do SALDO, porque o saldo
  // inicial informado no cadastro já os embute, e somar de novo seria contar
  // duas vezes. A regra é correta; o que faltava era dizê-la. Sem isso o
  // usuário importa agosto, vê o gasto subir, vê o saldo parado e conclui,
  // razoavelmente, que a conta do aplicativo está errada.
  const contaDestino = accountById(state.data, defaultCashAccountId());
  const aberturaConta = contaDestino ? String(contaDestino.openingDate || "") : "";
  const anterioresAoSaldo = aberturaConta
    ? included.filter((r) => String(r.date || "") < aberturaConta).length
    : 0;

  return `<div class="card">
    <div class="settings-row-header">
      <p class="card-title">Revisar lançamentos (${rows.length})</p>
      <button class="icon-btn" data-action="import-cancel" aria-label="Cancelar importação">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${(rows.meta && rows.meta.format ? rows.meta.format.toUpperCase() + " · " : "")}${plural(included.length, "selecionado para importar", "selecionados para importar")}${partesTotal.length ? ` · ${partesTotal.join(" e ")}` : ""}. Duplicados já vêm desmarcados${rows.meta && rows.meta.skipped ? ` · ${plural(rows.meta.skipped, "linha ignorada", "linhas ignoradas")}` : ""}.</p>
    ${anterioresAoSaldo ? `<div class="import-notice">${svgIcon("info", 16)}<div>
      <b>${anterioresAoSaldo} ${anterioresAoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura de ${escapeHtml(contaDestino.name)} em ${fmtDateFull(aberturaConta)}.</b>
      <span>${anterioresAoSaldo === 1 ? "Ele entra" : "Eles entram"} nas despesas, categorias e gráficos, mas não ${anterioresAoSaldo === 1 ? "altera" : "alteram"} o saldo da conta: o saldo inicial que você informou já inclui esse período. Para que ${anterioresAoSaldo === 1 ? "ele conte" : "eles contem"} no saldo, edite a conta e recue a data de abertura.</span>
    </div></div>` : ""}
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
    <button class="btn btn--primary btn--block" data-ui-css="margin-top:14px" data-action="import-confirm" ${included.length === 0 ? "disabled" : ""}>Importar ${plural(included.length, "lançamento", "lançamentos")}</button>
    <button class="btn btn--ghost btn--block btn--sm" data-ui-css="margin-top:8px" data-action="nav" data-tab="rules">
      ${svgIcon("tag", 14)} Corrigindo a mesma categoria várias vezes? Crie uma regra
    </button>
  </div>`;
}
