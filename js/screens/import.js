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

function renderImportReview(rows) {
  const included = rows.filter((r) => r.include);
  const meta = rows.meta || {};
  const documentKind = state.importDocumentKind === "card" ? "card" : "account";
  const destinations = documentKind === "card"
    ? (state.data.creditCards || []).filter((card) => !card.archived)
    : (state.data.accounts || []).filter((account) => !account.archived);
  const destinationId = destinations.some((item) => item.id === state.importDestinationId)
    ? state.importDestinationId
    : (destinations[0] ? destinations[0].id : "");

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
  const contaDestino = documentKind === "account" ? accountById(state.data, destinationId) : null;
  const aberturaConta = contaDestino ? String(contaDestino.openingDate || "") : "";
  const anterioresAoSaldo = aberturaConta
    ? included.filter((r) => String(r.date || "") < aberturaConta).length
    : 0;

  // Linhas que a fatura traz para explicar a própria fatura: o pagamento do mês
  // passado e o saldo rolado. Elas chegam desmarcadas, e o aviso diz por quê;
  // sem essa frase o usuário só veria caixas desmarcadas sem explicação, o que
  // é pior do que o erro que estamos evitando.
  const papeis = meta.roles || {};
  const avisoPapeis = [];
  if (papeis["card-payment"]) {
    avisoPapeis.push(`${plural(papeis["card-payment"], "linha é o pagamento da própria fatura", "linhas são pagamentos da própria fatura")} e ${papeis["card-payment"] === 1 ? "veio desmarcada" : "vieram desmarcadas"}: esse dinheiro saiu da sua conta para quitar o mês passado, então lançá-lo como receita inflaria o que você recebeu`);
  }
  if (papeis.carryover) {
    avisoPapeis.push(`${plural(papeis.carryover, "linha é o saldo da fatura anterior", "linhas são saldo da fatura anterior")}: aquele gasto já foi contado no mês em que aconteceu`);
  }

  const documentLabel = documentKind === "card" ? "Fatura de cartão" : "Extrato bancário";
  const sourceParts = [meta.format ? meta.format.toUpperCase() : "ARQUIVO"];
  if (meta.bank) sourceParts.push(meta.bank);
  sourceParts.push(documentLabel);
  if (meta.pageCount) sourceParts.push(plural(meta.pageCount, "página", "páginas"));

  return `<div class="card">
    <div class="settings-row-header">
      <p class="card-title">Revisar lançamentos (${rows.length})</p>
      <button class="icon-btn" data-action="import-cancel" aria-label="Cancelar importação">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${sourceParts.map(escapeHtml).join(" · ")} · ${plural(included.length, "selecionado para importar", "selecionados para importar")}${partesTotal.length ? ` · ${partesTotal.join(" e ")}` : ""}. Duplicados já vêm desmarcados${meta.skipped ? ` · ${plural(meta.skipped, "linha ignorada", "linhas ignoradas")}` : ""}.</p>
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
    ${meta.confidence === "baixa" ? `<div class="import-notice">${svgIcon("alertTriangle", 16)}<div><b>Confira o tipo e os valores com atenção.</b><span>O banco ou o formato da tabela não foi reconhecido com segurança. Nada será gravado antes de você confirmar.</span></div></div>` : ""}
    ${avisoPapeis.length ? `<div class="import-notice">${svgIcon("creditCard", 16)}<div>
      <b>Isto parece a fatura de um cartão.</b>
      <span>${escapeHtml(avisoPapeis.join(". "))}. As compras continuam marcadas normalmente; se você quiser importar alguma dessas linhas mesmo assim, é só marcar a caixa.</span>
    </div></div>` : ""}
    ${anterioresAoSaldo ? `<div class="import-notice">${svgIcon("info", 16)}<div>
      <b>${anterioresAoSaldo} ${anterioresAoSaldo === 1 ? "lançamento é anterior" : "lançamentos são anteriores"} à abertura de ${escapeHtml(contaDestino.name)} em ${fmtDateFull(aberturaConta)}.</b>
      <span>${anterioresAoSaldo === 1 ? "Ele entra" : "Eles entram"} nas despesas, categorias e gráficos, mas não ${anterioresAoSaldo === 1 ? "altera" : "alteram"} o saldo da conta: o saldo inicial que você informou já inclui esse período. Para que ${anterioresAoSaldo === 1 ? "ele conte" : "eles contem"} no saldo, edite a conta e recue a data de abertura.</span>
    </div></div>` : ""}
    <div class="import-list">
      ${rows.map((r, idx) => `<div class="import-row ${!r.include ? "import-row--off" : ""}">
        <button class="checkbox ${r.include ? "checked" : ""}" data-action="import-toggle" data-id="${idx}">${r.include ? svgIcon("check", 13) : ""}</button>
        <div class="import-row__info">
          <p class="import-row__desc">${escapeHtml(r.description || (r.type === "income" ? "Receita" : "Gasto"))} ${r.duplicate ? `<span class="import-dup-tag">possível duplicata</span>` : ""}${r.roleLabel ? `<span class="import-role-tag">${escapeHtml(r.roleLabel)}</span>` : ""}</p>
          <p class="import-row__meta">${fmtDateShort(r.date)} · ${r.nature === "estorno" ? "Estorno" : (r.type === "income" ? "Receita" : "Gasto")}${r.page ? ` · página ${r.page}` : ""}${r.roleDetail ? ` · ${escapeHtml(r.roleDetail)}` : (r.categoryReason ? ` · ${escapeHtml(r.categoryReason)}` : "")}</p>
        </div>
        ${r.type === "expense" ? `<select class="import-cat-select" data-action-select="import-category" data-id="${idx}">
          ${state.data.categories.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>` : ""}
        <span class="import-row__amount ${r.type === "income" ? "tx-amount--income" : ""}">${r.type === "income" ? "+" : "-"}${fmtBRL(r.amount)}</span>
      </div>`).join("")}
    </div>
    <button class="btn btn--primary btn--block" data-ui-css="margin-top:14px" data-action="import-confirm" ${included.length === 0 || !destinationId ? "disabled" : ""}>Importar ${plural(included.length, "lançamento", "lançamentos")}</button>
    <button class="btn btn--ghost btn--block btn--sm" data-ui-css="margin-top:8px" data-action="nav" data-tab="rules">
      ${svgIcon("tag", 14)} Corrigindo a mesma categoria várias vezes? Crie uma regra
    </button>
  </div>`;
}
