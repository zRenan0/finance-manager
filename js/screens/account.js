"use strict";

function accountStatusCard() {
  if (state.account.loading) return `<div class="card account-status">${svgIcon("loader", 20)}<div><p class="card-title">Verificando sua conta</p><p class="card-subtitle">Seus dados locais continuam disponíveis.</p></div></div>`;
  if (state.account.configured === false) return `<div class="card account-status">${svgIcon("wifi", 20)}<div><p class="card-title">Modo local ativo</p><p class="card-subtitle">O serviço de contas ainda não foi configurado nesta publicação. O app continua funcionando neste aparelho, sem enviar seus dados.</p></div></div>`;
  return "";
}

function accountGuestForm() {
  const a = state.account;
  const register = a.mode === "register";
  const recover = a.mode === "recover";
  return `<div class="card account-auth-card">
    <p class="eyebrow">Conta opcional</p>
    <h2 class="card-title">${recover ? "Recuperar acesso" : register ? "Criar conta" : "Entrar"}</h2>
    <p class="card-subtitle">${recover ? "Enviaremos um link para o email informado." : "A conta prepara o acesso em outros dispositivos. O uso local continua disponível sem cadastro."}</p>
    <div class="field"><label class="field__label" for="account-email">Email</label><input id="account-email" class="input" type="email" data-field="auth-email" data-validate="email" maxlength="254" value="${escapeHtml(a.form.email)}" autocomplete="email" inputmode="email" /></div>
    ${recover ? "" : `<div class="field"><label class="field__label" for="account-password">Senha</label><input id="account-password" class="input" type="password" data-field="auth-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.password)}" autocomplete="${register ? "new-password" : "current-password"}" /><p class="field-hint">Mínimo de 10 caracteres.</p></div>`}
    <button class="btn btn--primary btn--block" data-action="account-submit" data-value="${recover ? "recover" : (register ? "register" : "login")}" ${a.busy ? "disabled" : ""}>${a.busy ? svgIcon("loader", 16) : svgIcon(register ? "plus" : (recover ? "refresh" : "shieldCheck"), 16)} ${recover ? "Enviar link" : (register ? "Criar conta" : "Entrar")}</button>
    <div class="account-auth-links">
      ${recover ? `<button class="link-btn" data-action="account-mode" data-value="login">Voltar para entrar</button>` : `<button class="link-btn" data-action="account-mode" data-value="${register ? "login" : "register"}">${register ? "Já tenho uma conta" : "Criar uma conta"}</button><button class="link-btn" data-action="account-mode" data-value="recover">Esqueci minha senha</button>`}
    </div>
  </div>`;
}

// Cartão de confirmação pendente.
//
// Ele existe porque não havia saída para o email que não chega: a tela dizia
// "Confira seu email", o email não vinha, e não havia botão nenhum para pedir
// outro. Reenviar exigia cadastrar de novo, o que devolve a mesma resposta
// opaca do servidor e não dispara link nenhum para quem já tem conta.
function accountPendingCard() {
  const a = state.account;
  if (!a.pendingEmail || a.authenticated) return "";
  return `<div class="card account-sync account-pending">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--idle">${svgIcon("clock", 18)}</span>
      <div>
        <p class="card-title">Confirmação de email pendente</p>
        <p class="card-subtitle">O link de confirmação vai para ${escapeHtml(a.pendingEmail)}. Enquanto ele não for aberto, esta conta não entra e não sincroniza.</p>
        <p class="field-hint">O link vale 24 horas. Se ele não aparecer, procure na caixa de spam antes de pedir outro.</p>
      </div>
    </div>
    <button class="btn btn--secondary btn--sm" data-action="account-resend" ${a.busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Reenviar confirmação</button>
  </div>`;
}

function accountDeviceDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "data indisponível" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Estado da sincronização em linguagem de usuário. A regra de escrita aqui é
// não assustar: em toda situação de falha o aparelho continua com tudo, e a
// frase precisa dizer isso, senão a pessoa acha que perdeu o extrato.
const ACCOUNT_SYNC_VIEW = {
  syncing:  { icon: "loader",        title: "Sincronizando",            note: "Enviando e recebendo as alterações deste aparelho." },
  synced:   { icon: "checkCircle",   title: "Tudo sincronizado",        note: "" },
  offline:  { icon: "wifi",          title: "Sem conexão",              note: "As alterações ficam guardadas aqui e sobem assim que a rede voltar." },
  error:    { icon: "alertTriangle", title: "Sincronização com falha",  note: "Seus dados continuam completos neste aparelho." },
  idle:     { icon: "clock",         title: "Alterações pendentes",     note: "O envio acontece sozinho em alguns segundos." },
  disabled: { icon: "info",          title: "Sincronização indisponível", note: "Esta publicação não tem o serviço de sincronização configurado." },
};

function accountSyncCard() {
  if (typeof CloudSync === "undefined") return "";
  const sync = CloudSync.status();
  const phase = sync.phase === "idle" && !sync.pending ? "synced" : sync.phase;
  const view = ACCOUNT_SYNC_VIEW[phase] || ACCOUNT_SYNC_VIEW.idle;
  const quando = sync.lastSyncAt ? accountDeviceDate(sync.lastSyncAt) : null;
  const detalhe = sync.error || view.note;
  // A frase que tranquiliza NÃO pode ocupar o lugar da que explica. Quando o
  // servidor manda o motivo, os dois aparecem: o motivo em cima, a garantia de
  // que nada se perdeu embaixo. Antes, um excluía o outro, e no caso de falha o
  // motivo era exatamente o que sumia.
  const garantia = phase === "error" && sync.error ? view.note : "";
  // Falha precisa de saída. O botão só existia com o motor LIGADO, e a falha
  // que mais acontece (ligar e não conseguir) desliga o motor: sobrava
  // recarregar a página, sem nada na tela dizendo isso.
  const podeTentar = sync.enabled || phase === "error";
  return `<div class="card account-sync">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--${escapeHtml(phase)}">${svgIcon(view.icon, 18)}</span>
      <div>
        <p class="card-title">${escapeHtml(view.title)}</p>
        ${detalhe ? `<p class="card-subtitle">${escapeHtml(detalhe)}</p>` : ""}
        ${garantia ? `<p class="field-hint">${escapeHtml(garantia)}</p>` : ""}
        ${quando ? `<p class="field-hint">Última sincronização: ${escapeHtml(quando)}</p>` : ""}
        ${phase === "error" && sync.errorCode ? `<p class="field-hint">Código da falha: ${escapeHtml(sync.errorCode)}</p>` : ""}
      </div>
    </div>
    ${podeTentar ? `<button class="btn btn--secondary btn--sm" data-action="account-sync-now" ${sync.phase === "syncing" ? "disabled" : ""}>${svgIcon("refresh", 15)} ${sync.enabled ? "Sincronizar agora" : "Tentar de novo"}</button>` : ""}
  </div>`;
}

// Cartão do vínculo entre os dados deste aparelho e a conta.
//
// Ele só mostra CONTAGENS e estado. Nunca a impressão do conteúdo, nunca o UUID
// da conta, nunca o id de um registro: quem está olhando a tela precisa decidir,
// não auditar. E a decisão nunca é gravada por abrir ou fechar o cartão.
function accountLinkParts(resumo) {
  if (!resumo) return "";
  const plural = (n, um, muitos) => `${n} ${n > 1 ? muitos : um}`;
  const partes = [];
  if (resumo.transactions) partes.push(plural(resumo.transactions, "lançamento", "lançamentos"));
  if (resumo.accounts) partes.push(plural(resumo.accounts, "conta", "contas"));
  if (resumo.creditCards) partes.push(plural(resumo.creditCards, "cartão", "cartões"));
  if (resumo.accountTransfers) partes.push(plural(resumo.accountTransfers, "transferência", "transferências"));
  if (resumo.cardPayments) partes.push(plural(resumo.cardPayments, "pagamento", "pagamentos"));
  if (resumo.accountAdjustments) partes.push(plural(resumo.accountAdjustments, "conciliação", "conciliações"));
  if (resumo.goals) partes.push(plural(resumo.goals, "meta", "metas"));
  if (resumo.assets) partes.push(plural(resumo.assets, "item de patrimônio", "itens de patrimônio"));
  if (resumo.categories) partes.push(plural(resumo.categories, "categoria personalizada", "categorias personalizadas"));
  if (resumo.monthlyIncome) partes.push("a renda cadastrada");
  const restante = Number(resumo.settings) - (resumo.monthlyIncome ? 1 : 0);
  if (restante > 0) partes.push(plural(restante, "configuração financeira", "configurações financeiras"));
  if (!partes.length) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

const ACCOUNT_LINK_VIEW = {
  checking: { icon: "loader", title: "Conferindo os dados deste aparelho" },
  linking: { icon: "loader", title: "Vinculando dados deste aparelho" },
  linked: { icon: "checkCircle", title: "Dados deste aparelho vinculados" },
  confirm: { icon: "upload", title: "Trazer os dados deste aparelho?" },
  waiting: { icon: "wifi", title: "Vínculo aguardando conexão" },
  pending: { icon: "alertTriangle", title: "Vínculo pendente" },
  dismissed: { icon: "info", title: "Dados deste aparelho separados da conta" },
};

function accountGuestLinkCard() {
  const link = state.account.guestLink || freshGuestLink();
  const view = ACCOUNT_LINK_VIEW[link.phase];
  // `idle` é ausência de trabalho: nenhum cartão, nenhuma pergunta.
  if (!view) return "";
  const conteudo = accountLinkParts(link.summary);
  const busy = !!link.busy || link.phase === "checking" || link.phase === "linking";

  let corpo = "";
  if (link.phase === "confirm") {
    corpo = `<p class="card-subtitle">Este navegador tem ${escapeHtml(conteudo || "dados salvos sem conta")} guardados fora da conta.${
      link.errorCode === "remote_changed"
        ? " A conta recebeu alterações de outro aparelho enquanto isto era preparado."
        : (String(link.remoteRevision || "0") === "0" ? "" : " A conta já tem conteúdo de outro aparelho.")
    }</p>
    <p class="field-hint">Juntar não substitui nem apaga nada: registros diferentes entram por união e, no mesmo registro, vence a versão mais recente. A cópia deste aparelho continua aqui de qualquer forma.</p>`;
  } else if (link.phase === "linked") {
    const stats = link.stats || null;
    corpo = `<p class="card-subtitle">O conteúdo deste aparelho já faz parte da conta e está no servidor.</p>${
      stats ? `<p class="field-hint">Incorporados: ${escapeHtml(String(Number(stats.added) || 0))} lançamento(s), ${escapeHtml(String(Number(stats.goals) || 0))} meta(s), ${escapeHtml(String(Number(stats.accounts) || 0))} conta(s).</p>` : ""
    }`;
  } else if (link.phase === "dismissed") {
    corpo = `<p class="card-subtitle">Você escolheu manter ${escapeHtml(conteudo || "esses dados")} fora da conta. Nada foi apagado.</p>
      <p class="field-hint">Se mudar de ideia, o vínculo continua disponível aqui.</p>`;
  } else if (link.phase === "waiting") {
    corpo = `<p class="card-subtitle">${escapeHtml(link.error || "Sem conexão para conferir a conta.")}</p>
      <p class="field-hint">Nada é presumido sem saber o que a conta já tem. O vínculo termina quando a rede voltar.</p>`;
  } else if (link.phase === "pending") {
    corpo = `<p class="card-subtitle">${escapeHtml(link.error || "O vínculo não foi concluído.")}</p>
      <p class="field-hint">Seus dados continuam completos nos dois lados. A sincronização não aparece como concluída enquanto isto não terminar.</p>
      ${link.errorCode ? `<p class="field-hint">Código da falha: ${escapeHtml(link.errorCode)}</p>` : ""}`;
  } else {
    corpo = `<p class="card-subtitle">Conferindo o que existe aqui e o que a conta já tem, antes de qualquer envio.</p>`;
  }

  let acoes = "";
  if (link.phase === "confirm") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--primary btn--sm" data-action="account-link-confirm" ${busy ? "disabled" : ""}>${svgIcon("upload", 15)} Juntar dados</button>
      <button class="btn btn--secondary btn--sm" data-action="account-link-dismiss" ${busy ? "disabled" : ""}>Manter separados</button>
      <button class="link-btn" data-action="account-link-later">Agora não</button>
    </div>`;
  } else if (link.phase === "pending") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--secondary btn--sm" data-action="account-link-confirm" ${busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Tentar novamente</button>
      <button class="link-btn" data-action="account-link-later">Agora não</button>
    </div>`;
  } else if (link.phase === "dismissed" || link.phase === "waiting") {
    acoes = `<div class="account-link__actions">
      <button class="btn btn--secondary btn--sm" data-action="account-link-review" ${busy ? "disabled" : ""}>Vincular dados deste aparelho</button>
    </div>`;
  }

  return `<div class="card account-sync account-link">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--${escapeHtml(link.phase)}">${svgIcon(view.icon, 18)}</span>
      <div>
        <p class="card-title">${escapeHtml(view.title)}</p>
        ${corpo}
      </div>
    </div>
    ${acoes}
  </div>`;
}

function accountSignedIn() {
  const a = state.account;
  return `<div class="card account-profile">
    <div class="account-profile__head"><span class="account-profile__icon">${svgIcon("shieldCheck", 22)}</span><div><p class="eyebrow">Conta conectada</p><h2 class="card-title">${escapeHtml(a.email)}</h2><p class="card-subtitle">A sessão fica em cookie protegido e não entra nos backups financeiros.</p></div></div>
    <button class="btn btn--secondary" data-action="account-logout" ${a.busy ? "disabled" : ""}>Sair desta conta</button>
  </div>
  ${accountSyncCard()}
  ${accountGuestLinkCard()}
  ${a.mode === "password" ? `<div class="card"><p class="card-title">Definir nova senha</p><div class="field"><label class="field__label" for="account-new-password">Nova senha</label><input id="account-new-password" class="input" type="password" data-field="auth-new-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.newPassword)}" autocomplete="new-password" /></div><button class="btn btn--primary" data-action="account-submit" data-value="password" ${a.busy ? "disabled" : ""}>Salvar nova senha</button></div>` : ""}
  <div class="card"><div class="settings-row-header"><div><p class="card-title">Dispositivos conectados</p><p class="card-subtitle">Revogue qualquer acesso que você não reconheça.</p></div><button class="icon-btn" data-action="account-refresh" aria-label="Atualizar dispositivos">${svgIcon("refresh", 16)}</button></div>
    <div class="account-device-list">${a.devices.length ? a.devices.map((device) => `<div class="account-device"><span class="account-device__icon">${svgIcon("phone", 18)}</span><span><b>${escapeHtml(device.label || "Dispositivo")}${device.current ? " (este)" : ""}</b><small>Último acesso: ${escapeHtml(accountDeviceDate(device.lastSeenAt))}${device.revokedAt ? " · acesso revogado" : ""}</small></span>${device.revokedAt ? "" : `<button class="btn btn--ghost btn--sm" data-action="account-revoke" data-id="${escapeHtml(device.id)}">Revogar</button>`}</div>`).join("") : `<p class="field-hint">Nenhum dispositivo listado.</p>`}</div>
  </div>
  <div class="card account-danger"><p class="card-title">Apagar conta online</p><p class="card-subtitle">Apaga a conta e os dados guardados no servidor. Seus dados locais ficam neste aparelho até você apagá-los em Privacidade.</p>
    <div class="field"><label class="field__label" for="account-delete-password">Senha atual</label><input id="account-delete-password" class="input" type="password" data-field="auth-delete-password" maxlength="128" value="${escapeHtml(a.form.deletePassword)}" autocomplete="current-password" /></div>
    <div class="field"><label class="field__label" for="account-delete-text">Digite APAGAR CONTA</label><input id="account-delete-text" class="input" data-field="auth-delete-text" maxlength="20" value="${escapeHtml(a.form.deleteText)}" autocomplete="off" /></div>
    <button class="btn btn--danger" data-action="account-delete-request" ${a.busy ? "disabled" : ""}>Apagar conta online</button>
  </div>`;
}

function renderAccountScreen() {
  const status = accountStatusCard();
  return `<div class="screen screen--narrow">${renderBackHeader("Conta e acesso")}${status}
    ${state.account.configured === false || state.account.loading ? "" : accountPendingCard()}
    ${state.account.configured === false || state.account.loading ? "" : (state.account.authenticated ? accountSignedIn() : accountGuestForm())}
    ${state.account.error ? `<div class="form-error-summary" role="alert">${svgIcon("alertTriangle", 16)} ${escapeHtml(state.account.error)}</div>` : ""}
    ${state.account.message ? `<div class="account-message" role="status">${svgIcon("checkCircle", 16)} ${escapeHtml(state.account.message)}</div>` : ""}
    <p class="footnote">Com a conta conectada, seus lançamentos passam a ser sincronizados entre os aparelhos onde você entrar. A fusão é por união: nada é apagado de um lado pelo outro, e o que você excluir continua excluído em todos.</p>
  </div>`;
}
