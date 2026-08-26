// js/screens/import.js. Importação de extrato e fatura (OFX/CSV/PDF).
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// IMPORTADOR DE EXTRATOS E FATURAS (OFX/CSV/PDF)
// ==================================================================
function renderImportScreen() {
  const rows = state.importRows;
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Importar extrato")}

    ${!rows ? `
      <div class="card">
        <p class="card-subtitle" data-ui-css="margin-top:0">Baixe o extrato ou a fatura no app do seu banco e solte aqui. Aceita OFX, CSV e PDF com texto selecionável. A leitura e a categorização acontecem no seu aparelho; nada é enviado para nenhum servidor.</p>
        ${state.importError ? `<div class="inline-error">
          ${svgIcon("alertTriangle", 16)}
          <div>
            <p class="inline-error__title">${escapeHtml(state.importError.title)}</p>
            ${state.importError.detail ? `<p class="inline-error__detail">${escapeHtml(state.importError.detail)}</p>` : ""}
          </div>
          <button class="icon-btn icon-btn--muted" data-action="dismiss-import-error" aria-label="Fechar erro de importação">${svgIcon("x", 14)}</button>
        </div>` : ""}
        ${state.importError && (state.importError.code === "PDF_PASSWORD_REQUIRED" || state.importError.code === "PDF_PASSWORD_INCORRECT") && state.importPendingFile ? `
        <div class="import-password">
          <div class="field">
            <label class="field__label" for="import-pdf-password">Senha do PDF</label>
            <input id="import-pdf-password" class="input" type="password" autocomplete="off" data-field="import-password" value="${escapeHtml(state.importPassword || "")}" />
          </div>
          <button class="btn btn--primary" data-action="import-password-retry">Abrir PDF</button>
        </div>` : ""}
        ${state.importLoading ? `<div class="ai-loading"><span class="spinner"></span> Lendo e categorizando o extrato…</div>` : `
        <label class="dropzone ${state.importDragOver ? "dropzone--over" : ""}" id="statement-dropzone" data-action="statement-dropzone-click">
          ${svgIcon("file", 30)}
          <span class="dropzone__title">Arraste o arquivo aqui</span>
          <span class="dropzone__subtitle">ou toque para escolher (.ofx, .csv, .pdf)</span>
        </label>`}
      </div>` : renderImportReview(rows)}
  </div>`;
}

function renderImportReviewRow(row, idx, context) {
  const transfer = row.importAs === "transfer";
  const otherAccounts = context.activeAccounts.filter((account) => account.id !== context.destinationId);
  const otherIsValid = otherAccounts.some((account) => account.id === row.otherAccountId);
  const transferError = transfer && !otherIsValid;
  const recordedTag = row.recordedTransferStatus === "unique"
    ? `<span class="import-role-tag">transferência já registrada</span>`
    : (row.recordedTransferStatus === "ambiguous" ? `<span class="import-dup-tag">transferência semelhante</span>` : "");
  const reason = row.recordedTransferStatus === "unique"
    ? "A outra conta já registrou esta transferência. Marque a linha apenas se for outro movimento."
    : (row.roleDetail || row.categoryReason || "");
  const typeLabel = transfer ? "Transferência" : (row.nature === "estorno" ? "Estorno" : (row.type === "income" ? "Receita" : "Gasto"));

  return `<div class="import-row ${!row.include ? "import-row--off" : ""} ${transfer ? "import-row--transfer" : ""}">
    <button class="checkbox ${row.include ? "checked" : ""}" data-action="import-toggle" data-id="${idx}" aria-label="${row.include ? "Não importar" : "Importar"} ${escapeHtml(row.description || "movimento")}">${row.include ? svgIcon("check", 13) : ""}</button>
    <div class="import-row__info">
      <p class="import-row__desc">${escapeHtml(row.description || (row.type === "income" ? "Receita" : "Gasto"))} ${row.duplicate ? `<span class="import-dup-tag">possível duplicata</span>` : ""}${row.roleLabel ? `<span class="import-role-tag">${escapeHtml(row.roleLabel)}</span>` : ""}${recordedTag}</p>
      <p class="import-row__meta">${fmtDateShort(row.date)} · ${typeLabel}${row.page ? ` · página ${row.page}` : ""}${reason ? ` · ${escapeHtml(reason)}` : ""}</p>
    </div>
    <span class="import-row__amount ${!transfer && row.type === "income" ? "tx-amount--income" : ""}">${row.type === "income" ? "+" : "-"}${fmtBRL(row.amount)}</span>
    <div class="import-row__controls">
      ${context.canTransfer ? `<select class="import-kind-select" data-action-select="import-record-type" data-id="${idx}" aria-label="Como registrar ${escapeHtml(row.description || "este movimento")}">
        <option value="transaction" ${transfer ? "" : "selected"}>${row.type === "income" ? "Entrada" : "Saída"}</option>
        <option value="transfer" ${transfer ? "selected" : ""}>Transferência entre minhas contas</option>
      </select>` : ""}
      ${transfer ? `<select class="import-transfer-select ${transferError ? "input--error" : ""}" data-action-select="import-transfer-account" data-id="${idx}" aria-label="Outra conta da transferência">
        <option value="">Escolha a outra conta</option>
        ${otherAccounts.map((account) => `<option value="${account.id}" ${account.id === row.otherAccountId ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}
      </select>` : (row.type === "expense" ? `<select class="import-cat-select" data-action-select="import-category" data-id="${idx}" aria-label="Categoria de ${escapeHtml(row.description || "gasto")}">
        ${state.data.categories.map((category) => `<option value="${category.id}" ${category.id === row.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
      </select>` : "")}
    </div>
    ${transferError ? `<p class="import-row__error">Escolha a outra conta para registrar a transferência.</p>` : ""}
  </div>`;
}

function renderImportReview(rows) {
  const included = rows.filter((row) => row.include);
  const includedTransfers = included.filter((row) => row.importAs === "transfer");
  const includedTransactions = included.filter((row) => row.importAs !== "transfer");
  const meta = rows.meta || {};
  const documentKind = state.importDocumentKind === "card" ? "card" : "account";
  const activeAccounts = (state.data.accounts || []).filter((account) => !account.archived);
  const destinations = documentKind === "card"
    ? (state.data.creditCards || []).filter((card) => !card.archived)
    : activeAccounts;
  const destinationId = destinations.some((item) => item.id === state.importDestinationId)
    ? state.importDestinationId
    : (destinations[0] ? destinations[0].id : "");
  const canTransfer = documentKind === "account" && activeAccounts.length > 1;

  // Transferência fica num terceiro balde. Misturá-la com saída ou entrada
  // faria a própria revisão prometer um gasto ou uma renda que não será criada.
  const totalEntradas = sumMoney(includedTransactions.filter((row) => row.type === "income"), (row) => row.amount);
  const totalSaidas = sumMoney(includedTransactions.filter((row) => row.type !== "income"), (row) => row.amount);
  const totalTransferencias = sumMoney(includedTransfers, (row) => row.amount);
  const partesTotal = [];
  if (totalEntradas > 0) partesTotal.push(`${fmtBRL(totalEntradas)} em entradas`);
  if (totalSaidas > 0) partesTotal.push(`${fmtBRL(totalSaidas)} em saídas`);
  if (totalTransferencias > 0) partesTotal.push(`${fmtBRL(totalTransferencias)} em transferências`);

  const contaDestino = documentKind === "account" ? accountById(state.data, destinationId) : null;
  const aberturaConta = contaDestino ? String(contaDestino.openingDate || "") : "";
  const anterioresAoSaldo = aberturaConta
    ? includedTransactions.filter((row) => String(row.date || "") < aberturaConta).length
    : 0;
  const transferenciasAntesDaAbertura = includedTransfers.filter((row) => {
    const other = accountById(state.data, row.otherAccountId);
    return (aberturaConta && String(row.date || "") < aberturaConta)
      || (other && other.openingDate && String(row.date || "") < other.openingDate);
  }).length;

  const papeis = meta.roles || {};
  const avisoPapeis = [];
  if (papeis["card-payment"]) {
    avisoPapeis.push(`${plural(papeis["card-payment"], "linha é o pagamento da própria fatura", "linhas são pagamentos da própria fatura")} e ${papeis["card-payment"] === 1 ? "veio desmarcada" : "vieram desmarcadas"}: esse dinheiro saiu da sua conta para quitar o mês passado, então lançá-lo como receita inflaria o que você recebeu`);
  }
  if (papeis.carryover) avisoPapeis.push(`${plural(papeis.carryover, "linha é o saldo da fatura anterior", "linhas são saldo da fatura anterior")}: aquele gasto já foi contado no mês em que aconteceu`);

  const documentLabel = documentKind === "card" ? "Fatura de cartão" : "Extrato bancário";
  const sourceParts = [meta.format ? meta.format.toUpperCase() : "ARQUIVO"];
  if (meta.bank) sourceParts.push(meta.bank);
  sourceParts.push(documentLabel);
  if (meta.pageCount) sourceParts.push(plural(meta.pageCount, "página", "páginas"));
  const invalidTransfer = includedTransfers.some((row) => !activeAccounts.some((account) => account.id === row.otherAccountId && account.id !== destinationId));
  const buttonParts = [];
  if (includedTransactions.length) buttonParts.push(plural(includedTransactions.length, "lançamento", "lançamentos"));
  if (includedTransfers.length) buttonParts.push(plural(includedTransfers.length, "transferência", "transferências"));

  return `<div class="card">
    <div class="settings-row-header">
      <p class="card-title">Revisar lançamentos (${rows.length})</p>
      <button class="icon-btn" data-action="import-cancel" aria-label="Cancelar importação">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${sourceParts.map(escapeHtml).join(" · ")} · ${plural(included.length, "selecionado para importar", "selecionados para importar")}${partesTotal.length ? ` · ${partesTotal.join(" e ")}` : ""}. Duplicados e transferências já registradas vêm desmarcados${meta.skipped ? ` · ${plural(meta.skipped, "linha ignorada", "linhas ignoradas")}` : ""}.</p>
    <div class="import-destination-grid">
      <div class="field">
        <label class="field__label" for="import-document-kind">O que este arquivo contém</label>
        <select id="import-document-kind" class="input" data-action-select="import-document-kind">
          <option value="account" ${documentKind === "account" ? "selected" : ""}>Extrato bancário</option>
          <option value="card" ${documentKind === "card" ? "selected" : ""}>Fatura de cartão</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="import-destination">${documentKind === "card" ? "Cartão da fatura" : "Conta do extrato"}</label>
        <select id="import-destination" class="input" data-action-select="import-destination" ${destinations.length ? "" : "disabled"}>
          ${destinations.length
            ? destinations.map((item) => `<option value="${item.id}" ${item.id === destinationId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")
            : `<option value="">${documentKind === "card" ? "Nenhum cartão cadastrado" : "Nenhuma conta cadastrada"}</option>`}
        </select>
      </div>
    </div>
    ${!destinations.length ? `<div class="inline-error import-destination-error">${svgIcon("alertTriangle", 16)}<div><p class="inline-error__title">Cadastre ${documentKind === "card" ? "um cartão" : "uma conta"} antes de importar.</p><p class="inline-error__detail">O destino é obrigatório para manter saldos e faturas corretos.</p></div><button class="btn btn--secondary btn--sm" data-action="nav" data-tab="accounts">Cadastrar</button></div>` : ""}
    ${documentKind === "account" && activeAccounts.length === 1 ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>Cadastre outra conta para identificar Pix entre suas contas.</b><span>Com duas contas ativas, cada linha pode ser registrada como transferência e movimentar os dois saldos.</span></div></div>` : ""}
    ${meta.confidence === "baixa" ? `<div class="import-notice">${svgIcon("alertTriangle", 16)}<div><b>Confira o tipo e os valores com atenção.</b><span>O banco ou o formato da tabela não foi reconhecido com segurança. Nada será gravado antes de você confirmar.</span></div></div>` : ""}
    ${avisoPapeis.length ? `<div class="import-notice">${svgIcon("creditCard", 16)}<div><b>Isto parece a fatura de um cartão.</b><span>${escapeHtml(avisoPapeis.join(". "))}. As compras continuam marcadas normalmente; se você quiser importar alguma dessas linhas mesmo assim, é só marcar a caixa.</span></div></div>` : ""}
    ${anterioresAoSaldo ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>${anterioresAoSaldo} ${anterioresAoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura de ${escapeHtml(contaDestino.name)} em ${fmtDateFull(aberturaConta)}.</b><span>${anterioresAoSaldo === 1 ? "Ele entra" : "Eles entram"} nas despesas, categorias e gráficos, mas não ${anterioresAoSaldo === 1 ? "altera" : "alteram"} o saldo da conta: o saldo inicial que você informou já inclui esse período. Para que ${anterioresAoSaldo === 1 ? "ele conte" : "eles contem"} no saldo, edite a conta e recue a data de abertura.</span></div></div>` : ""}
    ${transferenciasAntesDaAbertura ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>${transferenciasAntesDaAbertura === 1 ? "Uma transferência está" : `${transferenciasAntesDaAbertura} transferências estão`} fora do período acompanhado por uma das contas.</b><span>O saldo inicial dessa conta já inclui o movimento, então somente a ponta dentro do período será recalculada.</span></div></div>` : ""}
    <div class="import-list">
      ${rows.map((row, idx) => renderImportReviewRow(row, idx, { activeAccounts, destinationId, canTransfer })).join("")}
    </div>
    <button class="btn btn--primary btn--block" data-ui-css="margin-top:14px" data-action="import-confirm" ${included.length === 0 || !destinationId || invalidTransfer ? "disabled" : ""}>Importar ${buttonParts.join(" e ")}</button>
    <button class="btn btn--ghost btn--block btn--sm" data-ui-css="margin-top:8px" data-action="nav" data-tab="rules">${svgIcon("tag", 14)} Corrigindo a mesma categoria várias vezes? Crie uma regra</button>
  </div>`;
}
