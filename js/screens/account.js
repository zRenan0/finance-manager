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
  return `<div class="card account-sync">
    <div class="account-sync__head">
      <span class="account-sync__icon account-sync__icon--${escapeHtml(phase)}">${svgIcon(view.icon, 18)}</span>
      <div>
        <p class="card-title">${escapeHtml(view.title)}</p>
        ${detalhe ? `<p class="card-subtitle">${escapeHtml(detalhe)}</p>` : ""}
        ${quando ? `<p class="field-hint">Última sincronização: ${escapeHtml(quando)}</p>` : ""}
      </div>
    </div>
    ${sync.enabled ? `<button class="btn btn--secondary btn--sm" data-action="account-sync-now" ${sync.phase === "syncing" ? "disabled" : ""}>${svgIcon("refresh", 15)} Sincronizar agora</button>` : ""}
  </div>`;
}

function accountSignedIn() {
  const a = state.account;
  return `<div class="card account-profile">
    <div class="account-profile__head"><span class="account-profile__icon">${svgIcon("shieldCheck", 22)}</span><div><p class="eyebrow">Conta conectada</p><h2 class="card-title">${escapeHtml(a.email)}</h2><p class="card-subtitle">A sessão fica em cookie protegido e não entra nos backups financeiros.</p></div></div>
    <button class="btn btn--secondary" data-action="account-logout" ${a.busy ? "disabled" : ""}>Sair desta conta</button>
  </div>
  ${accountSyncCard()}
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
    ${state.account.configured === false || state.account.loading ? "" : (state.account.authenticated ? accountSignedIn() : accountGuestForm())}
    ${state.account.error ? `<div class="form-error-summary" role="alert">${svgIcon("alertTriangle", 16)} ${escapeHtml(state.account.error)}</div>` : ""}
    ${state.account.message ? `<div class="account-message" role="status">${svgIcon("checkCircle", 16)} ${escapeHtml(state.account.message)}</div>` : ""}
    <p class="footnote">Com a conta conectada, seus lançamentos passam a ser sincronizados entre os aparelhos onde você entrar. A fusão é por união: nada é apagado de um lado pelo outro, e o que você excluir continua excluído em todos.</p>
  </div>`;
}
