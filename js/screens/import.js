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
        ${renderImportUndoLine()}
      </div>` : renderImportReview(rows)}
  </div>`;
}

// [M14] Desfazer a última importação. Aparece só na tela de escolher arquivo
// (a de revisão já é o momento de decidir) e some depois de usada. Remove pelo
// identificador exatamente o que aquela importação criou, então o que a pessoa
// lançou ou editou depois não corre risco.
function renderImportUndoLine() {
  const undo = state.importUndo;
  if (!undo) return "";
  const total = (undo.transactionIds || []).length + (undo.transferIds || []).length;
  if (!total) return "";
  const quando = String(undo.at || "").slice(0, 10);
  return `<div class="import-notice" data-ui-css="margin-top:12px">
    ${svgIcon("refresh", 16)}
    <div>
      <b>Última importação: ${plural(total, "registro", "registros")}${undo.filename ? ` de ${escapeHtml(undo.filename)}` : ""}${isRealIsoDate(quando) ? ` em ${fmtDateFull(quando)}` : ""}.</b>
      <span>Se importou o arquivo errado, dá para remover de uma vez o que ele criou. O que você lançou ou editou depois não é tocado.</span>
      <button class="btn btn--ghost btn--sm" data-action="import-undo">${svgIcon("refresh", 15)} Desfazer importação</button>
    </div>
  </div>`;
}

// [M14] "Possível duplicata" dizia a mesma coisa para casos muito diferentes.
// Reimportar o mesmo extrato e ter dois gastos iguais na mesma semana têm
// consequências opostas, e quem decide precisa saber de qual se trata: as duas
// nascem desmarcadas, mas só uma delas merece continuar desmarcada.
const IMPORT_DUPLICATE_TAGS = Object.freeze({
  external: { rotulo: "já importado", motivo: "O banco deu a este movimento o mesmo identificador de um lançamento que já está aqui. É a mesma linha, reimportada." },
  exata: { rotulo: "já lançado", motivo: "Já existe um lançamento com a mesma data, o mesmo valor e a mesma descrição." },
  arquivo: { rotulo: "repetida no arquivo", motivo: "Esta linha aparece mais de uma vez dentro do próprio arquivo escolhido." },
  parecida: { rotulo: "parecida com um lançamento seu", motivo: "Mesmo valor e tipo, em data próxima, mas com descrição diferente. Pode ser outro movimento; confira antes de descartar." },
});

function importDuplicateTag(row) {
  if (!row || !row.duplicate) return "";
  const info = IMPORT_DUPLICATE_TAGS[row.duplicateKind];
  if (!info) return `<span class="import-dup-tag">possível duplicata</span>`;
  return `<span class="import-dup-tag" title="${escapeHtml(info.motivo)}">${escapeHtml(info.rotulo)}</span>`;
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

  return `<div class="import-row ${!row.include ? "import-row--off" : ""} ${transfer ? "import-row--transfer" : ""}" id="import-row-${idx}">
    <button class="checkbox ${row.include ? "checked" : ""}" data-action="import-toggle" data-id="${idx}" aria-label="${row.include ? "Não importar" : "Importar"} ${escapeHtml(row.description || "movimento")}">${row.include ? svgIcon("check", 13) : ""}</button>
    <div class="import-row__info">
      <p class="import-row__desc">${escapeHtml(row.description || (row.type === "income" ? "Receita" : "Gasto"))} ${importDuplicateTag(row)}${row.roleLabel ? `<span class="import-role-tag">${escapeHtml(row.roleLabel)}</span>` : ""}${recordedTag}</p>
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

// Tudo que uma linha precisa saber sobre o documento inteiro. Fica separado
// porque `patchImportRow` refaz UMA linha e não pode inventar um contexto
// diferente do que a tela usou para desenhar as outras.
function importReviewContext() {
  const documentKind = state.importDocumentKind === "card" ? "card" : "account";
  const activeAccounts = (state.data.accounts || []).filter((account) => !account.archived);
  const destinations = documentKind === "card"
    ? (state.data.creditCards || []).filter((card) => !card.archived)
    : activeAccounts;
  const destinationId = destinations.some((item) => item.id === state.importDestinationId)
    ? state.importDestinationId
    : (destinations[0] ? destinations[0].id : "");
  return {
    documentKind, activeAccounts, destinations, destinationId,
    canTransfer: documentKind === "account" && activeAccounts.length > 1,
  };
}

// O que muda quando UMA linha muda: a frase do topo, os avisos e o botão. Sai
// separado do desenho da tela para que marcar uma caixa possa atualizar só isto.
function importReviewSummary(rows, context) {
  const ctx = context || importReviewContext();
  const included = rows.filter((row) => row.include);
  const includedTransfers = included.filter((row) => row.importAs === "transfer");
  const includedTransactions = included.filter((row) => row.importAs !== "transfer");
  const meta = rows.meta || {};

  // Transferência fica num terceiro balde. Misturá-la com saída ou entrada
  // faria a própria revisão prometer um gasto ou uma renda que não será criada.
  const totalEntradas = sumMoney(includedTransactions.filter((row) => row.type === "income"), (row) => row.amount);
  const totalSaidas = sumMoney(includedTransactions.filter((row) => row.type !== "income"), (row) => row.amount);
  const totalTransferencias = sumMoney(includedTransfers, (row) => row.amount);
  const partesTotal = [];
  if (totalEntradas > 0) partesTotal.push(`${fmtBRL(totalEntradas)} em entradas`);
  if (totalSaidas > 0) partesTotal.push(`${fmtBRL(totalSaidas)} em saídas`);
  if (totalTransferencias > 0) partesTotal.push(`${fmtBRL(totalTransferencias)} em transferências`);

  const contaDestino = ctx.documentKind === "account" ? accountById(state.data, ctx.destinationId) : null;
  const aberturaConta = contaDestino ? String(contaDestino.openingDate || "") : "";
  const linhasAntesDaAbertura = aberturaConta
    ? includedTransactions.filter((row) => String(row.date || "") < aberturaConta)
    : [];
  const anterioresAoSaldo = linhasAntesDaAbertura.length;
  // A data mais antiga do arquivo é o único valor que faz essas linhas passarem
  // a contar. Calculada aqui para o botão do aviso já sair com ela pronta.
  const primeiraDataDoArquivo = linhasAntesDaAbertura.reduce(
    (menor, row) => (!menor || String(row.date || "") < menor ? String(row.date || "") : menor), "");
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

  const documentLabel = ctx.documentKind === "card" ? "Fatura de cartão" : "Extrato bancário";
  const sourceParts = [meta.format ? meta.format.toUpperCase() : "ARQUIVO"];
  if (meta.bank) sourceParts.push(meta.bank);
  sourceParts.push(documentLabel);
  if (meta.pageCount) sourceParts.push(plural(meta.pageCount, "página", "páginas"));

  // [M14] Quantas linhas vieram desmarcadas e POR QUÊ. Só o número total não
  // deixa ninguém julgar se é uma reimportação inteira (esperada) ou um punhado
  // de linhas só parecidas (que merecem uma olhada antes de serem descartadas).
  const dup = meta.duplicates || {};
  const partesDup = [];
  if (dup.external) partesDup.push(`${plural(dup.external, "já veio deste mesmo extrato", "já vieram deste mesmo extrato")}`);
  if (dup.exata) partesDup.push(`${plural(dup.exata, "já está lançada", "já estão lançadas")}`);
  if (dup.arquivo) partesDup.push(`${plural(dup.arquivo, "se repete dentro do arquivo", "se repetem dentro do arquivo")}`);
  if (dup.parecida) partesDup.push(`${plural(dup.parecida, "é só parecida e merece conferência", "são só parecidas e merecem conferência")}`);
  const resumoDuplicatas = partesDup.length ? ` Das desmarcadas: ${partesDup.join("; ")}.` : "";

  const invalidTransfer = includedTransfers.some((row) => !ctx.activeAccounts.some((account) => account.id === row.otherAccountId && account.id !== ctx.destinationId));
  const buttonParts = [];
  if (includedTransactions.length) buttonParts.push(plural(includedTransactions.length, "lançamento", "lançamentos"));
  if (includedTransfers.length) buttonParts.push(plural(includedTransfers.length, "transferência", "transferências"));

  const notices = [
    ctx.documentKind === "account" && ctx.activeAccounts.length === 1
      ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>Cadastre outra conta para identificar Pix entre suas contas.</b><span>Com duas contas ativas, cada linha pode ser registrada como transferência e movimentar os dois saldos.</span></div></div>` : "",
    meta.confidence === "baixa"
      ? `<div class="import-notice">${svgIcon("alertTriangle", 16)}<div><b>Confira o tipo e os valores com atenção.</b><span>O banco ou o formato da tabela não foi reconhecido com segurança. Nada será gravado antes de você confirmar.</span></div></div>` : "",
    avisoPapeis.length
      ? `<div class="import-notice">${svgIcon("creditCard", 16)}<div><b>Isto parece a fatura de um cartão.</b><span>${escapeHtml(avisoPapeis.join(". "))}. As compras continuam marcadas normalmente; se você quiser importar alguma dessas linhas mesmo assim, é só marcar a caixa.</span></div></div>` : "",
    anterioresAoSaldo
      ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>${anterioresAoSaldo} ${anterioresAoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura de ${escapeHtml(contaDestino.name)} em ${fmtDateFull(aberturaConta)}.</b><span>${anterioresAoSaldo === 1 ? "Ele entra" : "Eles entram"} nas despesas, categorias e gráficos, mas não ${anterioresAoSaldo === 1 ? "altera" : "alteram"} o saldo da conta: o saldo inicial que você informou já inclui esse período. Se aquele saldo era o do dia ${fmtDateFull(aberturaConta)} e não o de antes do extrato, recue a abertura para que ${anterioresAoSaldo === 1 ? "ele conte" : "eles contem"} no saldo.</span>${primeiraDataDoArquivo ? `<button class="btn btn--ghost btn--sm" data-action="import-backdate-account" data-id="${escapeHtml(primeiraDataDoArquivo)}">Recuar abertura para ${fmtDateFull(primeiraDataDoArquivo)}</button>` : ""}</div></div>` : "",
    transferenciasAntesDaAbertura
      ? `<div class="import-notice">${svgIcon("info", 16)}<div><b>${transferenciasAntesDaAbertura === 1 ? "Uma transferência está" : `${transferenciasAntesDaAbertura} transferências estão`} fora do período acompanhado por uma das contas.</b><span>O saldo inicial dessa conta já inclui o movimento, então somente a ponta dentro do período será recalculada.</span></div></div>` : "",
    // [M35] O arquivo trouxe o saldo declarado pelo banco. Ele não é importado
    // como lançamento nem vira ajuste: fica reservado para a conferência, que
    // abre preenchida em Contas depois da importação.
    meta.statementBalance && ctx.documentKind === "account"
      ? `<div class="import-notice">${svgIcon("shieldCheck", 16)}<div><b>O extrato informa saldo de ${fmtBRL(meta.statementBalance.amount)}${meta.statementBalance.date ? ` em ${fmtDateFull(meta.statementBalance.date)}` : ""}.</b><span>Esse número não é importado como lançamento. Depois de confirmar, a conferência dessa conta abre em Contas já preenchida com ele, para você comparar com o saldo calculado aqui.</span></div></div>` : "",
  ].join("");

  return {
    subtitle: `${sourceParts.map(escapeHtml).join(" · ")} · ${plural(included.length, "selecionado para importar", "selecionados para importar")}${partesTotal.length ? ` · ${partesTotal.join(" e ")}` : ""}. Duplicados e transferências já registradas vêm desmarcados${meta.skipped ? ` · ${plural(meta.skipped, "linha ignorada", "linhas ignoradas")}` : ""}.${resumoDuplicatas}`,
    notices,
    buttonLabel: `Importar ${buttonParts.join(" e ")}`,
    blocked: included.length === 0 || !ctx.destinationId || invalidTransfer,
  };
}

// MARCAR UMA CAIXA NÃO PODE REDESENHAR SESSENTA LINHAS.
//
// `render()` reconstrói o aplicativo inteiro. Num extrato de sessenta
// lançamentos isso significa refazer as sessenta linhas, com todos os seus
// seletores, para mudar uma caixa: a tela treme, o seletor que a pessoa estava
// usando deixa de existir no meio da escolha e a lista volta para o topo. Estes
// dois remendos trocam a linha alterada e o resumo que depende dela; o resto do
// DOM nem toma conhecimento.
function patchImportRow(idx) {
  const alvo = document.getElementById(`import-row-${idx}`);
  const row = (state.importRows || [])[idx];
  if (!alvo || !row) return;
  // O seletor recriado é justamente o que a pessoa acabou de usar, então o foco
  // precisa voltar para ele pelo mesmo caminho que `render()` usaria.
  const ativo = document.activeElement;
  const chave = typeof focusKeyOf === "function" ? focusKeyOf(ativo) : null;
  const inicio = ativo && "selectionStart" in ativo ? ativo.selectionStart : null;
  const fim = ativo && "selectionStart" in ativo ? ativo.selectionEnd : null;
  alvo.outerHTML = renderImportReviewRow(row, idx, importReviewContext());
  if (chave && typeof restoreFocus === "function") restoreFocus(chave, inicio, fim);
}

function patchImportSummary() {
  const rows = state.importRows;
  if (!rows) return;
  const modelo = importReviewSummary(rows, importReviewContext());
  const resumo = document.getElementById("import-summary");
  const avisos = document.getElementById("import-notices");
  const botao = document.getElementById("import-confirm-btn");
  if (resumo) resumo.innerHTML = modelo.subtitle;
  if (avisos) avisos.innerHTML = modelo.notices;
  if (botao) {
    botao.textContent = modelo.buttonLabel;
    if (modelo.blocked) botao.setAttribute("disabled", "");
    else botao.removeAttribute("disabled");
  }
}

function renderImportReview(rows) {
  const ctx = importReviewContext();
  const modelo = importReviewSummary(rows, ctx);
  const meta = rows.meta || {};
  const visiveis = Math.min(rows.length, Math.max(IMPORT_PAGE_SIZE, state.importVisible || IMPORT_PAGE_SIZE));
  const restantes = rows.length - visiveis;

  return `<div class="card">
    <div class="settings-row-header">
      <p class="card-title">Revisar lançamentos (${rows.length})</p>
      <button class="icon-btn" data-action="import-cancel" aria-label="Cancelar importação">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle" id="import-summary">${modelo.subtitle}</p>
    <div class="import-destination-grid">
      <div class="field">
        <label class="field__label" for="import-document-kind">O que este arquivo contém</label>
        <select id="import-document-kind" class="input" data-action-select="import-document-kind">
          <option value="account" ${ctx.documentKind === "account" ? "selected" : ""}>Extrato bancário</option>
          <option value="card" ${ctx.documentKind === "card" ? "selected" : ""}>Fatura de cartão</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="import-destination">${ctx.documentKind === "card" ? "Cartão da fatura" : "Conta do extrato"}</label>
        <select id="import-destination" class="input" data-action-select="import-destination" ${ctx.destinations.length ? "" : "disabled"}>
          ${ctx.destinations.length
            ? ctx.destinations.map((item) => `<option value="${item.id}" ${item.id === ctx.destinationId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")
            : `<option value="">${ctx.documentKind === "card" ? "Nenhum cartão cadastrado" : "Nenhuma conta cadastrada"}</option>`}
        </select>
      </div>
    </div>
    ${!ctx.destinations.length ? `<div class="inline-error import-destination-error">${svgIcon("alertTriangle", 16)}<div><p class="inline-error__title">Cadastre ${ctx.documentKind === "card" ? "um cartão" : "uma conta"} antes de importar.</p><p class="inline-error__detail">O destino é obrigatório para manter saldos e faturas corretos.</p></div><button class="btn btn--secondary btn--sm" data-action="nav" data-tab="accounts">Cadastrar</button></div>` : ""}
    <div id="import-notices">${modelo.notices}</div>
    <div class="import-list">
      ${rows.slice(0, visiveis).map((row, idx) => renderImportReviewRow(row, idx, ctx)).join("")}
    </div>
    ${restantes > 0 ? `<button class="btn btn--secondary btn--block btn--sm" data-ui-css="margin-top:10px" data-action="import-show-more">Mostrar mais ${Math.min(restantes, IMPORT_PAGE_SIZE)} de ${plural(restantes, "linha restante", "linhas restantes")}</button>
    <p class="field-hint" data-ui-css="margin-top:6px">As linhas ainda não exibidas continuam marcadas e entram na importação; mostrar mais serve para conferir ou desmarcar.</p>` : ""}
    <button id="import-confirm-btn" class="btn btn--primary btn--block" data-ui-css="margin-top:14px" data-action="import-confirm" ${modelo.blocked ? "disabled" : ""}>${modelo.buttonLabel}</button>
    <button class="btn btn--ghost btn--block btn--sm" data-ui-css="margin-top:8px" data-action="nav" data-tab="rules">${svgIcon("tag", 14)} Corrigindo a mesma categoria várias vezes? Crie uma regra</button>
  </div>`;
}
