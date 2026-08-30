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
  // ESTA TELA PRECISA SER UM `<form>` DE VERDADE.
  //
  // O resto do app monta formulário com `div` + botão delegado, e para os
  // cadastros internos isso só custava o Enter (resolvido no `onKeydown`). No
  // login custa mais: gerenciador de senha e o autofill do navegador se
  // orientam pela estrutura do formulário - um par email/senha solto dentro de
  // `div` não é reconhecido como credencial, e salvar ou preencher a senha
  // deixa de ser oferecido. `data-action` continua fazendo o envio; o `submit`
  // é interceptado só para o Enter não recarregar a página.
  return `<form class="card account-auth-card" data-action-submit="account-auth" novalidate>
    <p class="eyebrow">Conta opcional</p>
    <h2 class="card-title">${recover ? "Recuperar acesso" : register ? "Criar conta" : "Entrar"}</h2>
    <p class="card-subtitle">${recover ? "Enviaremos um link para o email informado." : "A conta prepara o acesso em outros dispositivos. O uso local continua disponível sem cadastro."}</p>
    <div class="field"><label class="field__label" for="account-email">Email</label><input id="account-email" class="input" type="email" name="email" data-field="auth-email" data-validate="email" maxlength="254" value="${escapeHtml(a.form.email)}" autocomplete="email" inputmode="email" /></div>
    ${recover ? "" : `<div class="field"><label class="field__label" for="account-password">Senha</label><input id="account-password" class="input" type="password" name="password" data-field="auth-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.password)}" autocomplete="${register ? "new-password" : "current-password"}" />${register ? renderPasswordStrength(a.form.password, a.form.email) : `<p class="field-hint">Mínimo de 10 caracteres.</p>`}</div>`}
    <button type="submit" class="btn btn--primary btn--block" data-action="account-submit" data-value="${recover ? "recover" : (register ? "register" : "login")}" ${a.busy ? "disabled" : ""}>${a.busy ? svgIcon("loader", 16) : svgIcon(register ? "plus" : (recover ? "refresh" : "shieldCheck"), 16)} ${recover ? "Enviar link" : (register ? "Criar conta" : "Entrar")}</button>
    <div class="account-auth-links">
      ${recover ? `<button type="button" class="link-btn" data-action="account-mode" data-value="login">Voltar para entrar</button>` : `<button type="button" class="link-btn" data-action="account-mode" data-value="${register ? "login" : "register"}">${register ? "Já tenho uma conta" : "Criar uma conta"}</button><button type="button" class="link-btn" data-action="account-mode" data-value="recover">Esqueci minha senha</button>`}
    </div>
  </form>`;
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

const ACCOUNT_DEVICE_ICONS = {
  desktop: "monitor",
  phone: "phone",
  tablet: "tablet",
  unknown: "globe",
};

function accountDeviceType(device) {
  const informed = String((device && (device.type || device.deviceType)) || "").toLowerCase();
  if (ACCOUNT_DEVICE_ICONS[informed]) return informed;
  const label = String((device && device.label) || "").toLowerCase();
  if (/ipad|tablet/.test(label)) return "tablet";
  if (/iphone|android|celular|mobile/.test(label)) return "phone";
  if (/windows|macos|mac os|linux|chrome os|desktop|notebook/.test(label)) return "desktop";
  return "unknown";
}

function accountDeviceLastSeen(value, current) {
  if (current) return "Ativo agora";
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Último acesso indisponível";
  const now = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = todayDate.getTime();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (day === today) return `Hoje, ${time}`;
  if (day === yesterdayDate.getTime()) return `Ontem, ${time}`;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// [M7] "Entrou pela primeira vez em" só precisa do DIA, e por isso não reutiliza
// `accountDeviceDate` (que traz data E hora, e serve à última sincronização, que
// é recente por natureza). A hora exata de meses atrás não ajuda ninguém a
// reconhecer um acesso e polui a linha que precisa ser lida de relance.
function accountDeviceFirstSeen(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "data indisponível";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// [M6] O medidor só aparece onde a senha está sendo ESCOLHIDA (cadastro e nova
// senha). No campo de entrar ele seria ruído: a senha já existe, e comentar a
// força dela ali não muda nada além de assustar.
//
// A barra é decorativa (`aria-hidden`); quem lê por leitor de tela recebe o
// texto, que é onde a informação realmente está.
function renderPasswordStrength(senha, email) {
  const forca = passwordStrength(senha, email);
  if (forca.empty) return `<p class="field-hint">Mínimo de 10 caracteres. Uma frase com três ou quatro palavras funciona bem.</p>`;
  return `<div class="pwd-meter" data-score="${forca.score}">
    <span class="pwd-meter__track" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `<i class="pwd-meter__step${i < forca.score ? " is-on" : ""}"></i>`).join("")}
    </span>
    <p class="field-hint pwd-meter__text" role="status">Força: <b>${escapeHtml(forca.label)}</b>${forca.hint ? ` · ${escapeHtml(forca.hint)}` : ""}</p>
  </div>`;
}

function accountDevicesCard(account) {
  const devices = (Array.isArray(account.devices) ? account.devices : [])
    .filter((device) => !device.revokedAt)
    .sort((a, b) => Number(!!b.current) - Number(!!a.current) || new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
  const activeCount = devices.length;
  const rows = devices.map((device) => {
    const type = accountDeviceType(device);
    const current = !!device.current;
    return `<div class="account-device account-device--${type}${current ? " account-device--current" : ""}">
      <span class="account-device__rail" aria-hidden="true"></span>
      <span class="account-device__icon">${svgIcon(ACCOUNT_DEVICE_ICONS[type], 20)}</span>
      <span class="account-device__body">
        <span class="account-device__identity"><strong>${escapeHtml(device.label || "Navegador não identificado")}</strong>${current ? `<span class="account-device__badge">Este aparelho</span>` : ""}</span>
        <small>${escapeHtml(accountDeviceLastSeen(device.lastSeenAt, current))}${device.firstSeenAt ? ` · entrou pela primeira vez em ${escapeHtml(accountDeviceFirstSeen(device.firstSeenAt))}` : ""}</small>
      </span>
      ${current ? "" : `<button class="btn btn--ghost btn--sm account-device__revoke" data-action="account-revoke" data-id="${escapeHtml(device.id)}" ${account.busy ? "disabled" : ""}>Revogar acesso</button>`}
    </div>`;
  }).join("");

  return `<section class="card account-access" aria-labelledby="account-access-title">
    <div class="account-access__header">
      <div class="account-access__heading">
        <p class="eyebrow">Segurança da conta</p>
        <h2 class="card-title" id="account-access-title">Dispositivos com acesso</h2>
        <p class="card-subtitle">Confira onde sua conta está aberta e encerre qualquer acesso que você não reconheça.</p>
      </div>
      <div class="account-access__tools">
        <span class="account-access__count">${escapeHtml(activeCount === 1 ? "1 ativo" : `${activeCount} ativos`)}</span>
        <button class="btn btn--secondary btn--sm account-access__refresh" data-action="account-refresh" ${account.busy ? "disabled" : ""}>${svgIcon("refresh", 15)} Atualizar</button>
      </div>
    </div>
    <div class="account-device-list">${rows || `<p class="account-access__empty">Nenhum dispositivo com acesso.</p>`}</div>
    ${accountRevokeOthersBlock(account, activeCount)}
  </section>`;
}

// [M7] SAIR DE TODOS OS OUTROS APARELHOS.
//
// Só aparece quando há OUTRO aparelho para encerrar: um botão que não tem o que
// fazer é ruído numa tela de segurança, e ruído é o que faz as pessoas pararem
// de ler exatamente a tela em que precisam prestar atenção.
//
// A senha é pedida aqui, e não em `revoke-device`, porque as duas ações têm
// naturezas opostas. Cortar UM acesso estranho é defesa, e defesa precisa ser
// rápida. Derrubar TODOS os outros é ação de dono: quem tomou uma sessão
// emprestada não pode usá-la para expulsar o dono do próprio aparelho.
function accountRevokeOthersBlock(a, ativos) {
  if (ativos < 2) return "";
  const aberto = !!state.accountRevokeOthersOpen;
  const senha = a.form.revokeOthersPassword || "";
  return `<div class="account-access__others">
    <button type="button" class="btn btn--secondary btn--sm" data-action="account-revoke-others-toggle" aria-expanded="${aberto ? "true" : "false"}" aria-controls="account-revoke-others-body" ${a.busy ? "disabled" : ""}>
      ${svgIcon("shieldCheck", 15)} Sair dos outros aparelhos
    </button>
    <div class="account-access__others-body" id="account-revoke-others-body" ${aberto ? "" : "hidden"}>
      <p class="card-subtitle">Encerra o acesso dos outros ${ativos - 1 === 1 ? "aparelho" : `${ativos - 1} aparelhos`} e para a sincronização deles imediatamente. Este aparelho continua conectado. O que já estiver salvo nos outros não é apagado à distância.</p>
      <div class="field">
        <label class="field__label" for="account-revoke-others-password">Sua senha</label>
        <input id="account-revoke-others-password" class="input" type="password" data-field="auth-revoke-others-password" maxlength="128" value="${escapeHtml(senha)}" autocomplete="current-password" />
      </div>
      ${a.revokeOthersHint ? `<p class="account-danger__hint" role="alert">${svgIcon("alertTriangle", 15)} ${escapeHtml(a.revokeOthersHint)}</p>` : ""}
      <button class="btn btn--danger btn--sm" data-action="account-revoke-others" ${a.busy ? "disabled" : ""}>Encerrar os outros acessos</button>
    </div>
  </div>`;
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
  // O caminho saudável é automático. A ação manual só aparece quando houve
  // uma falha e a pessoa precisa de uma saída imediata além da recuperação do
  // próprio motor.
  const podeTentar = phase === "error";
  // A CONFERÊNCIA COMPLETA É UMA SAÍDA, NÃO UMA ROTINA.
  //
  // O ciclo comum é incremental: o cursor diz até onde este aparelho já leu, e
  // o servidor nunca reenvia o que ficou atrás dele. Quando uma operação escapa
  // (marca recusada, gravação desfeita, aba fechada na hora errada), o aparelho
  // fica atrasado sem ter como perceber, e a conta aparece com saldos
  // diferentes em cada navegador. Este botão é o caminho de volta: relê a conta
  // inteira e reoferece a base inteira. Fica sempre à mão porque a pessoa que
  // precisa dele está justamente vendo uma tela que diz "Tudo sincronizado".
  const podeConferir = phase !== "disabled" && phase !== "syncing";
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
    ${podeTentar ? `<button class="btn btn--secondary btn--sm" data-action="account-sync-now">${svgIcon("refresh", 15)} Tentar novamente</button>` : ""}
    ${podeConferir ? `<div class="account-sync__repair">
      <button class="btn btn--secondary btn--sm" data-action="account-reconcile">${svgIcon("refresh", 15)} Conferir a conta inteira</button>
      <p class="field-hint">Use se este aparelho mostrar números diferentes de outro na mesma conta. Ele relê tudo o que está na conta e reapresenta tudo o que está aqui. Nada é apagado dos dois lados: quando o mesmo registro existe nos dois, vence a versão mais recente.</p>
    </div>` : ""}
  </div>`;
}

// Cartão do vínculo entre os dados deste aparelho e a conta.
//
// Ele só mostra CONTAGENS e estado. Nunca a impressão do conteúdo, nunca o UUID
// da conta, nunca o id de um registro: quem está olhando a tela precisa decidir,
// não auditar. E a decisão nunca é gravada por abrir ou fechar o cartão.
function accountLinkParts(resumo) {
  if (!resumo) return "";
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
      stats ? `<p class="field-hint">Incorporados: ${escapeHtml(plural(Number(stats.added) || 0, "lançamento", "lançamentos"))}, ${escapeHtml(plural(Number(stats.goals) || 0, "meta", "metas"))}, ${escapeHtml(plural(Number(stats.accounts) || 0, "conta", "contas"))}.</p>` : ""
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
  ${a.mode === "password" ? `<div class="card"><p class="card-title">Definir nova senha</p><div class="field"><label class="field__label" for="account-new-password">Nova senha</label><input id="account-new-password" class="input" type="password" data-field="auth-new-password" minlength="10" maxlength="128" value="${escapeHtml(a.form.newPassword)}" autocomplete="new-password" />${renderPasswordStrength(a.form.newPassword, a.email)}</div><button class="btn btn--primary" data-action="account-submit" data-value="password" ${a.busy ? "disabled" : ""}>Salvar nova senha</button></div>` : ""}
  ${accountDevicesCard(a)}
  ${accountDangerCard(a)}`;
}

// O ABERTO/FECHADO MORA NO ESTADO, NÃO NO `<details>`.
//
// Este bloco era um `<details>` nativo. Como `render()` refaz o DOM inteiro e a
// própria tela de conta redesenha sozinha (volta periódica da sincronização,
// atualização da lista de aparelhos, qualquer aviso), o painel se fechava no
// meio da digitação da senha. Quem tentava apagar a conta via o formulário
// sumir sem explicação e concluía, com razão, que o botão não funcionava.
function accountDangerCard(a) {
  const aberto = !!state.accountDangerOpen;
  const pronto = a.form.deleteText === "APAGAR CONTA" && a.form.deletePassword.length >= 10;
  return `<section class="card account-danger${aberto ? " account-danger--open" : ""}">
    <button type="button" class="account-danger__summary" data-action="account-danger-toggle" aria-expanded="${aberto ? "true" : "false"}" aria-controls="account-danger-body">
      <span class="account-danger__row">
        <span class="account-danger__icon">${svgIcon("trash", 18)}</span>
        <span class="account-danger__heading"><span class="card-title">Apagar conta e dados</span><span class="card-subtitle">Exclua a conta e os dados guardados no servidor e neste aparelho.</span></span>
        <span class="account-danger__chevron">${svgIcon("chevronDown", 18)}</span>
      </span>
    </button>
    <div class="account-danger__body" id="account-danger-body" ${aberto ? "" : "hidden"}>
      <p class="card-subtitle">A cópia deste aparelho também será apagada. Outros aparelhos perderão o acesso ao servidor, mas manterão o que já estiver salvo neles.</p>
      <div class="field"><label class="field__label" for="account-delete-password">Senha atual</label><input id="account-delete-password" class="input" type="password" data-field="auth-delete-password" maxlength="128" value="${escapeHtml(a.form.deletePassword)}" autocomplete="current-password" /></div>
      <div class="field"><label class="field__label" for="account-delete-text">Digite APAGAR CONTA</label><input id="account-delete-text" class="input" data-field="auth-delete-text" maxlength="20" value="${escapeHtml(a.form.deleteText)}" autocomplete="off" /></div>
      ${a.deleteHint ? `<p class="account-danger__hint" role="alert">${svgIcon("alertTriangle", 15)} ${escapeHtml(a.deleteHint)}</p>` : ""}
      <button class="btn btn--danger" data-action="account-delete-request" ${a.busy ? "disabled" : ""}>Apagar conta e dados</button>
      ${pronto ? "" : `<p class="card-subtitle account-danger__requisito">Preencha a senha da conta (10 caracteres ou mais) e digite APAGAR CONTA para liberar a exclusão. A frase seguinte, na confirmação, também precisa vir em maiúsculas.</p>`}
    </div>
  </section>`;
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
