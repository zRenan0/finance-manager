// js/screens/privacy.js. Privacidade, termos, limites financeiros e diagnóstico.
"use strict";

// Um campo do controlador que ainda não foi definido é mostrado como pendência
// explícita, e não escondido. Esconder daria à política a aparência de pronta.
function renderLegalControllerField(label, value) {
  const pendente = String(value == null ? "" : value).trim() === "" || String(value) === LEGAL_PENDING;
  return `<div><dt>${escapeHtml(label)}</dt><dd class="${pendente ? "legal-pending" : ""}">${pendente ? "Ainda não definido" : escapeHtml(String(value))}</dd></div>`;
}

function renderLegalRetentionGroup(scope, title, note) {
  const itens = LEGAL_RETENTION.filter((item) => item.scope === scope);
  if (!itens.length) return "";
  return `<p class="legal-subhead">${escapeHtml(title)}</p>
    <p class="card-subtitle">${escapeHtml(note)}</p>
    <dl class="legal-list">${itens.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.term)}</dd></div>`).join("")}</dl>`;
}

function renderLegalDataInventoryItem(item) {
  const fields = [
    ["Finalidade", item.purpose],
    ["Onde fica", item.storage],
    ["Retenção", item.retention],
    ["Quem acessa", item.access],
    ["Terceiros", item.thirdParties],
    ["Como excluir", item.deletion],
  ];
  return `<details class="legal-inventory__item">
    <summary>${escapeHtml(item.data)}</summary>
    <dl class="legal-list">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
  </details>`;
}

function renderLegalDataInventoryGroup(group) {
  const items = LEGAL_DATA_INVENTORY.filter((item) => item.group === group.id);
  if (!items.length) return "";
  return `<section class="legal-inventory__group" aria-labelledby="legal-inventory-${escapeHtml(group.id)}">
    <p class="legal-subhead" id="legal-inventory-${escapeHtml(group.id)}">${escapeHtml(group.title)}</p>
    <p class="card-subtitle">${escapeHtml(group.detail)}</p>
    <div class="legal-inventory__items">${items.map(renderLegalDataInventoryItem).join("")}</div>
  </section>`;
}

function renderPrivacyScreen() {
  const privacy = normalizePrivacy(state.data.privacy || defaultPrivacy());
  const accepted = legalAccepted(privacy);
  const diagnostics = safeErrorSummary();
  const gaps = legalControllerGaps(LEGAL_CONTROLLER);
  const inventoryGaps = legalDataInventoryGaps(LEGAL_DATA_INVENTORY);
  const anteriores = privacy.acceptedVersions.filter((item) => item.version !== LEGAL_TEXT_VERSION);
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Privacidade, termos e fontes")}

    <div class="card legal-status ${accepted ? "legal-status--ok" : "legal-status--pending"}">
      <div class="settings-row-header">
        <div><p class="card-title">Estado dos textos</p><p class="card-subtitle">Versão ${LEGAL_TEXT_VERSION}. Revisão em ${fmtDateFull(LEGAL_REVIEW_DATE)}.</p></div>
        <span class="status-badge">${accepted ? "Aceitos" : "Pendente"}</span>
      </div>
      <p class="card-subtitle">${accepted ? `Aceitos em ${fmtDateFull(String(privacy.acceptedAt).slice(0, 10))}.` : "Nenhum aceite foi presumido para dados que já existiam antes desta versão."}</p>
      ${anteriores.length ? `<p class="card-subtitle">Você já havia aceitado ${anteriores.map((item) => `a versão ${escapeHtml(item.version)} em ${fmtDateFull(String(item.at).slice(0, 10))}`).join("; ")}. O registro fica neste aparelho e, com conta ligada, acompanha a sincronização das preferências.</p>` : ""}
      ${accepted ? "" : `<button class="btn btn--primary btn--block" data-action="legal-accept">${svgIcon("checkCircle", 16)} Aceitar política e termos</button>`}
    </div>

    <div class="card">
      <p class="card-title">Quem responde por estes dados</p>
      <p class="card-subtitle">O controlador é quem decide como os dados são tratados e a quem você dirige qualquer pedido (LGPD, art. 5, VI).</p>
      <dl class="legal-list">
        ${renderLegalControllerField("Controlador", LEGAL_CONTROLLER.name)}
        ${renderLegalControllerField("CPF ou CNPJ", LEGAL_CONTROLLER.document)}
        ${renderLegalControllerField("Endereço", LEGAL_CONTROLLER.address)}
        ${renderLegalControllerField("Canal de atendimento", LEGAL_CONTROLLER.supportEmail)}
        ${renderLegalControllerField("Encarregado pelos dados", LEGAL_CONTROLLER.dpoName)}
        ${renderLegalControllerField("Contato do encarregado", LEGAL_CONTROLLER.dpoEmail)}
      </dl>
      <p class="card-subtitle">Prazo de resposta a pedidos do titular: ${LEGAL_CONTROLLER.responseDays} dias (art. 19, II).</p>
      ${gaps.length ? `<div class="financial-notice" role="note">${svgIcon("alertTriangle", 16)}<div><p><b>Identificação incompleta.</b> Falta definir: ${escapeHtml(gaps.join(", "))}. Enquanto isso, esta instalação é versão local em desenvolvimento e não deve ser oferecida ao público.</p><small>Nada aqui foi preenchido por suposição.</small></div></div>` : ""}
    </div>

    <div class="card">
      <p class="card-title">Onde seus dados ficam</p>
      <p class="card-subtitle">Sem conta, lançamentos, contas financeiras, cartões, metas, dívidas, categorias e preferências ficam apenas no armazenamento deste navegador. Com conta ligada, esses mesmos registros passam a ser sincronizados com o servidor para aparecerem em outros aparelhos, junto com email, sessão e identificação dos aparelhos.</p>
      <div class="legal-facts">
        <p>${svgIcon("shieldCheck", 15)} O backup JSON é criado apenas quando você toca em exportar.</p>
        <p>${svgIcon("archive", 15)} Espelho, fallback, desfazer e backup legado podem conter seus dados em JSON legível e sem criptografia neste aparelho.</p>
        <p>${svgIcon("wifi", 15)} Precisam de rede: a conta, a IA, a checagem de senha vazada e a consulta opcional de nota fiscal ao portal da Sefaz.</p>
        <p>${svgIcon("file", 15)} A tipografia é servida pelo próprio app. Nenhuma fonte, métrica ou script de terceiro carrega junto com a página.</p>
        <p>${svgIcon("phone", 15)} Apagar a conta online (tela Conta e acesso) e apagar os dados deste aparelho são ações separadas. Uma não faz a outra.</p>
      </div>
      <div class="source-links"><a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" target="_blank" rel="noopener noreferrer">Direitos do titular na ANPD</a><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noopener noreferrer">Lei Geral de Proteção de Dados</a></div>
    </div>

    <div class="card">
      <p class="card-title">Inventário dos dados</p>
      <p class="card-subtitle">Cada item informa a finalidade, onde fica, por quanto tempo permanece, quem acessa, quais terceiros participam e como excluir. Abra uma categoria para ver o caminho completo.</p>
      ${inventoryGaps.length ? `<div class="financial-notice" role="alert">${svgIcon("alertTriangle", 16)}<div><p><b>Inventário incompleto.</b> Esta versão não deve ser oferecida ao público.</p><small>${escapeHtml(inventoryGaps.join("; "))}</small></div></div>` : ""}
      <div class="legal-inventory">${LEGAL_DATA_INVENTORY_GROUPS.map(renderLegalDataInventoryGroup).join("")}</div>
    </div>

    <div class="card">
      <p class="card-title">Por quanto tempo cada coisa fica</p>
      ${renderLegalRetentionGroup("local", "Neste aparelho", "Você controla diretamente e pode apagar a qualquer momento.")}
      ${renderLegalRetentionGroup("conta", "No servidor, apenas com conta ligada", "Sem conta criada, nada nesta lista existe.")}
    </div>

    <div class="card">
      <p class="card-title">Seus direitos</p>
      <p class="card-subtitle">A LGPD garante os direitos do art. 18, listados abaixo. Onde há botão no app, o botão é o caminho mais rápido; o pedido pelo canal de atendimento continua valendo e é respondido em ${LEGAL_CONTROLLER.responseDays} dias.</p>
      <dl class="legal-list">
        ${LEGAL_SUBJECT_RIGHTS.map((right) => `<div><dt>${escapeHtml(right.title)} <span class="legal-law">${escapeHtml(right.law)}</span></dt><dd>${escapeHtml(right.detail)}${right.selfService ? ` <span class="legal-self">Já disponível no app.</span>` : ""}</dd></div>`).join("")}
      </dl>
    </div>

    <div class="card">
      <p class="card-title">Se houver incidente de segurança</p>
      <p class="card-subtitle">Incidente com risco ou dano relevante a você deve ser comunicado a você e à ANPD em prazo razoável (art. 48). O aviso descreve os dados atingidos, o risco, as medidas tomadas e o que você pode fazer.</p>
      <dl class="legal-list">
        ${renderLegalControllerField("Canal para comunicar ou receber aviso de incidente", LEGAL_CONTROLLER.incidentEmail)}
      </dl>
      <p class="card-subtitle">Encontrou uma falha? Use o mesmo canal. Enquanto a conta não é usada, um incidente no servidor não alcança dados financeiros que nunca saíram do seu aparelho.</p>
      <div class="source-links"><a href="https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis" target="_blank" rel="noopener noreferrer">Comunicação de incidente na ANPD</a></div>
    </div>

    <div class="card">
      <p class="card-title">Envio para IA</p>
      <p class="card-subtitle">O padrão é confirmar cada envio. A análise financeira envia totais mensais, nomes de categorias, nomes e valores de metas e regras de orçamento. O refinamento de lançamento envia a frase digitada e os nomes das categorias. Esses pacotes são agregados ou limitados, mas não são chamados de anônimos porque os nomes podem revelar contexto pessoal.</p>
      <button class="theme-toggle" data-action="privacy-ai-mode" data-value="ask" role="radio" aria-checked="${privacy.aiSharing !== "blocked" ? "true" : "false"}">
        ${svgIcon("shieldCheck", 17)}<span><b>Perguntar antes de enviar</b><small>Mostra o conteúdo e pede confirmação em cada uso.</small></span><span class="switch ${privacy.aiSharing !== "blocked" ? "active" : ""}"><span class="switch__knob"></span></span>
      </button>
      <button class="theme-toggle" data-action="privacy-ai-mode" data-value="blocked" role="radio" aria-checked="${privacy.aiSharing === "blocked" ? "true" : "false"}">
        ${svgIcon("x", 17)}<span><b>Bloquear envios para IA</b><small>Os recursos locais continuam funcionando.</small></span><span class="switch ${privacy.aiSharing === "blocked" ? "active" : ""}"><span class="switch__knob"></span></span>
      </button>
      ${privacy.aiSharing === "blocked" ? "" : `
      <p class="legal-subhead">O que sai por padrão</p>
      <p class="card-subtitle">Desmarque o que não deve acompanhar o envio. A prévia mostrada na hora do envio já vem com esta escolha, e pode ser mudada lá também.</p>
      <div class="ai-preview__fields">${Object.entries(AI_HIDEABLE_FIELDS).map(([id, label]) => {
        const incluido = privacy.aiHide.indexOf(id) === -1;
        return `<label class="ai-preview__field">
          <input type="checkbox" data-action-select="privacy-ai-field" data-value="${escapeHtml(id)}" ${incluido ? "checked" : ""} />
          <span><b>${escapeHtml(label)}</b><small>${incluido ? "Vai junto no envio" : (id === "categorias" ? "Sai como Categoria 1, Categoria 2..." : "Removido do pacote")}</small></span>
        </label>`;
      }).join("")}</div>`}
    </div>

    <div class="card">
      <p class="card-title">Seus controles</p>
      <div class="tool-links">
        <button class="tool-link tool-link--rich" data-action="export-json"><span class="tool-link__icon">${svgIcon("download", 17)}</span><span class="tool-link__text"><span class="tool-link__label">Exportar todos os dados</span><span class="tool-link__desc">Cria um backup JSON que você controla.</span></span>${svgIcon("chevronRight", 15, "tool-link__chevron")}</button>
        <button class="tool-link tool-link--rich" data-action="privacy-delete-all"><span class="tool-link__icon">${svgIcon("trash", 17)}</span><span class="tool-link__text"><span class="tool-link__label">Apagar todos os dados deste aparelho</span><span class="tool-link__desc">Remove dados financeiros, preferências, cópias locais de recuperação e diagnósticos.</span></span>${svgIcon("chevronRight", 15, "tool-link__chevron")}</button>
      </div>
    </div>

    <div class="card">
      <p class="card-title">Limites financeiros e jurídicos</p>
      <p class="card-subtitle">O aplicativo organiza informações e produz estimativas educativas. Ele não presta consultoria de valores mobiliários, não conhece seu perfil completo, não oferece crédito, não garante rentabilidade e não confirma direito ou valor de aposentadoria. Propostas, contratos, tributos, regras e taxas oficiais prevalecem sobre os cálculos.</p>
      <div class="source-links">
        <a href="https://www.bcb.gov.br/meubc/faqs/p/cuidados-na-hora-de-contratar-uma-operacao-de-credito" target="_blank" rel="noopener noreferrer">CET e crédito no Banco Central</a>
        <a href="https://www.gov.br/cvm/pt-br/assuntos/educacao/" target="_blank" rel="noopener noreferrer">Educação do investidor na CVM</a>
        <a href="https://www.gov.br/pt-br/servicos/simular-aposentadoria" target="_blank" rel="noopener noreferrer">Simulação oficial no Meu INSS</a>
      </div>
    </div>

    <div class="card">
      <div class="settings-row-header"><div><p class="card-title">Diagnóstico local</p><p class="card-subtitle">${plural(diagnostics.total, "ocorrência", "ocorrências")} nos últimos 30 dias. Limite de 50.</p></div><span class="status-badge">Não enviado</span></div>
      <p class="card-subtitle">O registro contém somente data, área, código controlado, versão, schema e estado de conexão. Mensagens, pilhas, valores, descrições, contas, categorias, metas, arquivos e identificadores não entram.</p>
      <div class="button-row">
        <button class="btn btn--secondary" data-action="diagnostics-export" ${diagnostics.total ? "" : "disabled"}>${svgIcon("download", 15)} Exportar resumo</button>
        <button class="btn btn--ghost" data-action="diagnostics-clear" ${diagnostics.total ? "" : "disabled"}>${svgIcon("trash", 15)} Apagar diagnóstico</button>
      </div>
    </div>

    <div class="card">
      <p class="card-title">Termos de uso</p>
      <div class="legal-copy">
        <p><b>1. O que este aplicativo é.</b> Uma ferramenta de organização financeira pessoal que registra o que você informa e calcula estimativas educativas a partir disso. Ele não é instituição financeira, corretora, consultoria de valores mobiliários, correspondente bancário nem órgão previdenciário.</p>
        <p><b>2. Quem pode usar.</b> Uso pessoal e não comercial, por pessoa capaz de contratar. O aplicativo não é destinado a menores de 18 anos e não coleta dados de crianças ou adolescentes de forma consciente.</p>
        <p><b>3. Sua responsabilidade.</b> Conferir os dados inseridos e as condições reais antes de contratar crédito, investir, resgatar recursos ou tomar decisão previdenciária. Números do app não substituem proposta, contrato, extrato oficial nem simulação do Meu INSS.</p>
        <p><b>4. Backups são seus.</b> O funcionamento local reduz o envio de dados, mas exige que você mantenha backups. Limpar o navegador, trocar de aparelho ou perder o aparelho pode apagar informações sem recuperação. Com conta ligada há cópia no servidor, e ela também depende de a conta continuar existindo.</p>
        <p><b>5. Disponibilidade.</b> Não há garantia de funcionamento ininterrupto, de preservação de dados no servidor nem de prazo de atendimento além do prazo legal de resposta ao titular. Recursos que dependem de rede podem ficar indisponíveis sem aviso.</p>
        <p><b>6. Limite de responsabilidade.</b> O aplicativo é fornecido no estado em que se encontra. Ele não responde por decisão financeira tomada com base nas estimativas, por perda de dados no seu aparelho nem por indisponibilidade de terceiros. Esta cláusula não afasta direitos do consumidor previstos em lei.</p>
        <p><b>7. Uso indevido.</b> É vedado tentar acessar conta alheia, contornar limites de uso, automatizar chamadas às funções do servidor ou usar o aplicativo para atividade ilícita. A conta usada dessa forma pode ser encerrada.</p>
        <p><b>8. Propriedade.</b> O código e o conteúdo do aplicativo pertencem ao seu titular. Os dados financeiros que você registra pertencem a você, e o app não os usa por conta própria para publicidade, perfilamento comercial, venda a terceiros ou treinamento de modelo. O tratamento pelo provedor de IA depende do contrato e da política dele.</p>
        <p><b>9. Mudanças nos textos.</b> Alteração de conteúdo sobe a versão do texto e o aceite é pedido de novo. O aceite anterior permanece no histórico e, com conta ligada, acompanha a configuração sincronizada. Continuar usando sem aceitar mantém o app funcionando localmente, com os envios opcionais desligados.</p>
        <p><b>10. Encerramento.</b> Você pode encerrar quando quiser apagando os dados deste aparelho e, se houver, a conta online. Nenhuma das duas ações exige pedido, aprovação ou espera.</p>
        <p><b>11. Lei e foro.</b> Aplica-se a lei brasileira. O foro é o do domicílio do consumidor, na forma do Código de Defesa do Consumidor.</p>
        <p><b>12. Estado desta instalação.</b> ${gaps.length ? "Enquanto a identificação do controlador e o canal de atendimento não forem definidos, esta instalação deve ser tratada como versão local em desenvolvimento e não deve ser oferecida ao público." : "Identificação do controlador e canal de atendimento definidos."}</p>
      </div>
    </div>
  </div>`;
}
