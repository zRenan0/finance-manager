// js/screens/onboarding.js; configuração inicial em 4 passos
//
// Toma a tela inteira no primeiro uso e some para sempre depois. Nada é gravado
// passo a passo: os campos vivem em `state.onboarding` e só viram dados reais
// (renda, conta, regra de orçamento) na confirmação final. Abandonar no meio,
// portanto, não deixa meia conta cadastrada.
//
// A ordem dos passos segue a dependência dos números, não a ordem do menu: a
// regra x/x/x é o último passo porque só faz sentido depois que existe uma renda
// para dividir; mostrar "50% de R$ 0,00" seria pedir uma decisão no escuro.
"use strict";

const ONB_STEPS = [
  { n: 1, label: "Boas-vindas" },
  { n: 2, label: "Renda" },
  { n: 3, label: "Conta" },
  { n: 4, label: "Gastos fixos" },
  { n: 5, label: "Orçamento" },
];

// ------------------------------------------------------------------------------
// PASSO 4: OS GASTOS FIXOS, E POR QUE ELE NÃO CRIA LANÇAMENTO
// ------------------------------------------------------------------------------
// A pergunta é a do roteiro do módulo ("deseja cadastrar gastos fixos?"), mas a
// resposta NÃO vira transação. Duas razões, as duas do próprio app:
//
//   1. Recorrência aqui é DERIVADA, não cadastrada. `recurring.js` classifica a
//      cadência pelo intervalo entre cobranças reais. Semear lançamentos para
//      alimentar esse motor seria dar histórico falso justamente ao componente
//      cujo trabalho é inferir o histórico verdadeiro.
//   2. Um aluguel que ainda não venceu não é despesa do mês. Gravá-lo hoje
//      inflaria "Despesas do mês"; gravá-lo no mês passado inventaria um
//      passado que a pessoa não viveu. Nenhuma das duas datas é honesta.
//
// O que a resposta faz é melhor e não custa nada em integridade: ela vira TETO
// da categoria antes da semeadura. `seedBudgetsFromSplit` já trata teto
// existente como intocável e o desconta da cota do grupo (ver budgets.js), de
// modo que declarar R$ 1.500 de moradia não só fixa a linha de moradia como
// reparte o que sobra de Necessidades entre as outras. O plano nasce pessoal em
// vez de percentual, e nenhum centavo foi inventado.
const ONB_FIXED_PRESETS = [
  { categoryId: "moradia", label: "Moradia", hint: "Aluguel ou financiamento, condomínio, luz, água" },
  { categoryId: "transporte", label: "Transporte", hint: "Combustível, transporte público, parcela do carro" },
  { categoryId: "saude", label: "Saúde", hint: "Plano, remédio de uso contínuo" },
  { categoryId: "educacao", label: "Educação", hint: "Escola, faculdade, curso" },
  { categoryId: "assinaturas", label: "Assinaturas e serviços", hint: "Celular, internet, streaming, academia" },
];

const ONB_SPLIT_PRESETS = [
  { id: "50/30/20", necessidade: 50, desejo: 30, futuro: 20, title: "50 / 30 / 20", hint: "O equilíbrio clássico. Bom ponto de partida para a maioria." },
  { id: "60/20/20", necessidade: 60, desejo: 20, futuro: 20, title: "60 / 20 / 20", hint: "Para quem tem custo fixo alto (aluguel, financiamento, filhos)." },
  { id: "40/20/40", necessidade: 40, desejo: 20, futuro: 40, title: "40 / 20 / 40", hint: "Foco agressivo em poupar. Exige custo fixo enxuto." },
];

function freshOnboarding() {
  return {
    open: false,
    // Assistente segurado: ver o bloco "O PORTÃO DO ASSISTENTE" abaixo.
    held: false,
    step: 1,
    name: "",
    income: "",
    account: { name: "", type: "corrente", balance: "", openingDate: todayIso() },
    skipAccount: false,
    // { [categoryId]: "texto digitado" }. Vazio é resposta válida: o passo 4
    // nunca bloqueia o avanço.
    fixed: {},
    legalAccepted: false,
    focus: "month",
    split: { necessidade: 50, desejo: 30, futuro: 20 },
  };
}

// ------------------------------------------------------------------------------
// O PORTÃO DO ASSISTENTE
// ------------------------------------------------------------------------------
// ESTE É O DEFEITO QUE DUPLICAVA A CONTA DO BANCO.
//
// Entrar numa conta troca o banco carregado por um banco NOVO e vazio: o
// conteúdo da conta só chega depois da primeira descida da nuvem. Quem decidia
// se o assistente abre olhava esse vazio e concluía "primeiro uso". O resultado
// aparecia logo depois do login: o assistente tomava a tela inteira e pedia
// nome, renda e conta do banco de novo. Quem respondia terminava com a conta do
// banco cadastrada duas vezes, a que desceu da nuvem e a que acabara de
// digitar, e sem nenhuma forma de apagar uma delas.
//
// O portão fecha o assistente enquanto a entrada na conta não termina.
// `refreshOnboardingGate` reavalia quando o conteúdo da conta chega, e só a
// liberação explícita, no fim da sequência de vínculo, pode reabrir.
function holdOnboardingGate() {
  state.onboarding.held = true;
  state.onboarding.open = false;
}

// O ASSISTENTE NUNCA TOMA UMA TELA QUE JÁ ESTÁ EM USO.
//
// Esta trava nasceu de um defeito relatado no beta, e ele era pior que o
// original. A liberação do portão espera `finishAccountBootstrap`, que roda um
// ciclo de sincronização inteiro: uma ida e volta na rede. Quem entrava numa
// conta ainda vazia via o painel carregar, navegava, e DOIS SEGUNDOS DEPOIS o
// assistente aparecia por cima, do nada, como se o aplicativo tivesse esquecido
// que a pessoa acabara de entrar. Nenhum clique provocou aquilo: foi a promessa
// da rede resolvendo tarde.
//
// Duas condições passaram a valer para o portão ABRIR o assistente:
//
//   1. A pessoa não pode ter encostado no aplicativo ainda. Um clique ou uma
//      tecla significam que a tela é dela; tomá-la depois disso é sequestro.
//   2. O banco carregado precisa ser o de VISITANTE. O assistente é a primeira
//      execução DO APARELHO, não DA CONTA. Quem entrou numa conta vazia vê o
//      aplicativo vazio, e refaz a configuração por Ajustes quando quiser; o
//      que ele não pode é ser recebido por um formulário de tela cheia toda vez
//      que a nuvem responder.
//
// Fechar continua livre, e sem `release` é a única coisa que esta função faz: o
// dado que chega da conta pode provar que a configuração já existe, nunca o
// contrário.

// Chamada do `onClick` e do `onInput`, os dois ouvintes da raiz. É o registro
// de que a tela passou para as mãos da pessoa. Mora no `state` e não numa
// variável de módulo porque é estado de sessão, igual ao `booting`.
function marcarAppEmUso() { state.appEmUso = true; }

// Devolve true quando a tela precisa ser redesenhada.
function refreshOnboardingGate(opts) {
  const liberar = !!(opts && opts.release);
  if (liberar) state.onboarding.held = false;
  const concluido = !!(state.data.onboarding && state.data.onboarding.done);
  const podeAbrir = liberar && !state.appEmUso
    && (typeof FinanceStore === "undefined" || FinanceStore.scope() === GUEST_SCOPE);
  const alvo = concluido ? false : (podeAbrir ? true : state.onboarding.open);
  if (alvo === state.onboarding.open) return false;
  state.onboarding.open = alvo;
  return true;
}

// Renda informada no passo 2, em reais. Usada pelo passo 4 para mostrar quanto
// cada grupo receberia de fato; percentual sozinho não ajuda a decidir.
function onbIncome() {
  const n = parseMoneyInput(state.onboarding.income);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
}

// A data a que o saldo informado se refere. Um valor digitado à mão pode estar
// pela metade ("2026-08-") enquanto a pessoa preenche, e um futuro deixaria a
// conta nascer fora do próprio período; nos dois casos hoje é o fallback certo.
function onbOpeningDate() {
  const raw = String(state.onboarding.account.openingDate || "").trim();
  const hoje = todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return hoje;
  return raw > hoje ? hoje : raw;
}

function onbSplitPresetId() {
  const s = state.onboarding.split;
  const found = ONB_SPLIT_PRESETS.find((p) => p.necessidade === s.necessidade && p.desejo === s.desejo && p.futuro === s.futuro);
  return found ? found.id : "";
}

// Cada passo diz por si só se pode avançar. Nenhum é obrigatório a não ser o
// segundo: sem renda, metade do app (regra x/x/x, score, previsão) fica muda.
function onbCanAdvance(step) {
  if (step === 1) return state.onboarding.legalAccepted === true;
  if (step === 2) return onbIncome() > 0;
  if (step === 3) {
    if (state.onboarding.skipAccount) return true;
    const a = state.onboarding.account;
    return !!String(a.name).trim()
      && Number.isFinite(parseMoneyInput(a.balance || "0"))
      && /^\d{4}-\d{2}-\d{2}$/.test(String(a.openingDate || ""));
  }
  return true;
}

// POR QUE O MOTIVO DO BLOQUEIO PRECISA ESTAR ESCRITO NA TELA.
//
// "Continuar" e "Pular por agora" nascem desabilitados e nada dizia por quê:
// o usuário clicava, não acontecia nada, e não havia texto, title nem relação
// de acessibilidade que ligasse o botão morto ao aceite que faltava. Botão
// desabilitado sem explicação é um beco, e o passo 1 não era o único: o 2
// trava sem renda e o 3 sem nome e saldo da conta, com o mesmo silêncio.
//
// Cada passo passa a dizer em uma linha o que falta, e os botões apontam para
// essa linha por aria-describedby, para o leitor de tela anunciar a exigência
// junto do botão em vez de deixá-la solta no meio da tela.
function onbBlockReason(step) {
  if (step === 1) return "Marque o aceite da política e dos termos para continuar ou entrar na sua conta.";
  if (step === 2) return "Informe uma renda maior que zero para continuar.";
  if (step === 3) return "Dê um nome à conta e informe o saldo, ou marque a opção de cadastrar depois.";
  return "";
}

function renderOnboardingLayer() {
  const o = state.onboarding;
  const motivo = onbBlockReason(o.step);
  const travado = !onbCanAdvance(o.step);
  const body = o.step === 1 ? renderOnbWelcome()
    : o.step === 2 ? renderOnbIncome()
    : o.step === 3 ? renderOnbAccount()
    : o.step === 4 ? renderOnbFixed()
    : renderOnbSplit();
  const last = o.step === ONB_STEPS.length;
  return `<div class="onb" role="dialog" aria-modal="true" aria-label="Configuração inicial">
    <div class="onb__sheet">
      <div class="onb__head">
        <div class="onb__brand">${svgIcon("wallet", 18)}<span>Cofre</span></div>
        <div class="onb__head-actions">
          <button class="btn btn--ghost btn--sm" data-action="onb-have-account" ${o.legalAccepted ? "" : `disabled aria-describedby="onb-block-reason"`}>Já tenho conta</button>
          <button class="btn btn--ghost btn--sm" data-action="onb-skip" ${o.legalAccepted ? "" : `disabled aria-describedby="onb-block-reason"`}>Pular por agora</button>
        </div>
      </div>
      ${renderOnbProgress(o.step)}
      <div class="onb__body">${body}</div>
      ${motivo ? `<p class="onb__block-hint" id="onb-block-reason" ${travado ? "" : "hidden"}>${svgIcon("info", 14)}<span>${motivo}</span>${o.step === 1 && !o.legalAccepted ? `<button type="button" class="link-btn onb__block-jump" data-action="onb-goto-legal">Ir para o aceite</button>` : ""}</p>` : ""}
      <div class="onb__foot">
        ${o.step > 1 ? `<button class="btn btn--secondary" data-action="onb-back">${svgIcon("chevronLeft", 16)} Voltar</button>` : `<span></span>`}
        <button id="onb-advance" class="btn btn--primary" data-action="${last ? "onb-finish" : "onb-next"}" ${travado ? `disabled aria-describedby="onb-block-reason"` : ""}>
          ${last ? `${svgIcon("checkCircle", 16)} Concluir` : "Continuar"}
        </button>
      </div>
    </div>
  </div>`;
}

// O botão "Continuar" reage a cada tecla, mas re-renderizar a tela inteira
// enquanto se digita um valor com vírgula perde o cursor. Patch pontual, mesmo
// padrão de patchSubmitButton() na tela de lançamento.
function patchOnboardingFooter() {
  const pode = onbCanAdvance(state.onboarding.step);
  const btn = document.getElementById("onb-advance");
  const aviso = document.getElementById("onb-block-reason");
  if (btn) {
    btn.disabled = !pode;
    // O motivo só descreve o botão enquanto ele está travado. Um
    // aria-describedby fixo faria o leitor de tela anunciar, a cada foco, uma
    // exigência que o usuário já cumpriu.
    if (pode) btn.removeAttribute("aria-describedby");
    else btn.setAttribute("aria-describedby", "onb-block-reason");
  }
  // O aviso acompanha o botão no patch: sem isto ele continuaria na tela
  // depois de a renda ser digitada, contradizendo um botão já liberado.
  if (aviso) aviso.hidden = pode;
}

// O RÓTULO DE RESERVA, E POR QUE ELE EXISTE.
//
// Com cinco passos, a 320 px e com zoom de 200%, cada coluna fica com menos de
// 50 px e "Boas-vindas" passa a ser cortado. Encolher a fonte só adia o
// problema e piora a leitura de quem ampliou a tela justamente para enxergar.
// Abaixo desse limite os cinco rótulos saem e fica só o do passo atual, em
// linha própria e com espaço inteiro. Nada se perde: o grupo já anuncia
// "Passo X de N" para leitor de tela, em qualquer largura.
function renderOnbProgress(step) {
  const atual = ONB_STEPS.find((s) => s.n === step);
  return `<div class="onb__progress" role="group" aria-label="Passo ${step} de ${ONB_STEPS.length}">
    ${ONB_STEPS.map((s) => `<div class="onb__step ${s.n === step ? "active" : ""} ${s.n < step ? "done" : ""}">
      <span class="onb__step-bar"></span>
      <span class="onb__step-label">${s.label}</span>
    </div>`).join("")}
  </div>
  <p class="onb__progress-now" aria-hidden="true">${atual ? atual.label : ""}</p>`;
}

/* --------------------------------------------------------------- passo 1 */
function renderOnbWelcome() {
  return `<div class="onb__intro">
    <span class="onb__icon">${svgIcon("sparkles", 26)}</span>
    <h1 class="onb__title">Vamos deixar o app com a sua cara</h1>
    <p class="onb__lead">São cinco telas curtas, e só duas pedem um número. Dá para mudar tudo depois em Ajustes.</p>
  </div>
  <div class="field">
    <label class="field__label" for="onb-name">Como você quer ser chamado?</label>
    <input id="onb-name" class="input" data-field="onb-name" value="${escapeHtml(state.onboarding.name)}" maxlength="40" placeholder="Seu primeiro nome" autocomplete="given-name" />
  </div>
  <p class="field-hint">Opcional. Serve só para a saudação da tela inicial.</p>
  <fieldset class="onb-focus">
    <legend class="field__label">Qual é seu objetivo principal agora?</legend>
    <div class="onb-focus__grid">
      ${DASHBOARD_FOCUS_OPTIONS.map((option) => `<button type="button" class="onb-focus__option ${state.onboarding.focus === option.id ? "active" : ""}" data-action="onb-focus" data-value="${option.id}" aria-pressed="${state.onboarding.focus === option.id ? "true" : "false"}">
        <span class="onb-focus__icon" aria-hidden="true">${svgIcon(option.icon, 18)}</span>
        <span><b>${escapeHtml(option.label)}</b><small>${escapeHtml(option.hint)}</small></span>
      </button>`).join("")}
    </div>
  </fieldset>
  <div class="onb__note">
    ${svgIcon("shieldCheck", 17)}
    <p>Sem conta, seus dados financeiros ficam neste aparelho. Recursos de IA só enviam o conteúdo descrito depois da sua confirmação.</p>
  </div>
  <details class="onb-legal-summary">
    <summary>Resumo da política e dos termos</summary>
    <p>O app organiza dados e produz estimativas educativas. Ele não substitui proposta, contrato, consultoria de investimentos ou análise do INSS. Sem conta, os dados ficam no navegador até você exportar ou apagar; com conta ligada, eles também são sincronizados com o servidor. IA e consulta de nota fiscal usam rede apenas quando você aciona esses recursos.</p>
    <p>A tela Privacidade traz a política inteira: controlador, prazos de retenção, seus direitos e o canal para incidentes.</p>
  </details>
  <label class="legal-consent"><input id="onb-legal-check" type="checkbox" data-action-select="onb-legal" ${state.onboarding.legalAccepted ? "checked" : ""} /><span>Li e aceito a política de privacidade e os termos de uso da versão ${LEGAL_TEXT_VERSION}.</span></label>`;
}

/* --------------------------------------------------------------- passo 2 */
function renderOnbIncome() {
  const income = onbIncome();
  return `<div class="onb__intro">
    <span class="onb__icon">${svgIcon("wallet", 26)}</span>
    <h1 class="onb__title">Quanto entra por mês?</h1>
    <p class="onb__lead">Some salário, pró-labore e o que for recorrente. Um valor aproximado já resolve.</p>
  </div>
  <div class="field">
    <label class="field__label" for="onb-income">Renda mensal</label>
    <input id="onb-income" class="input" data-field="onb-income" value="${escapeHtml(state.onboarding.income)}" inputmode="decimal" placeholder="0,00" />
  </div>
  ${income > 0
    ? `<p class="field-hint">Cerca de <b>${fmtBRL(mulMoney(income, 12))}</b> por ano, ou <b>${fmtBRL(mulMoney(income, 1 / 30))}</b> por dia.</p>`
    : `<p class="field-hint">É a base do orçamento, do score e da previsão. Sem ela, essas telas ficam sem referência.</p>`}
  <div class="onb__note">
    ${svgIcon("alertTriangle", 17)}
    <p>Renda variável? Use a média dos últimos meses. Dá para ajustar mês a mês depois.</p>
  </div>`;
}

/* --------------------------------------------------------------- passo 3 */
function renderOnbAccount() {
  const a = state.onboarding.account;
  const skipped = state.onboarding.skipAccount;
  return `<div class="onb__intro">
    <span class="onb__icon">${svgIcon("creditCard", 26)}</span>
    <h1 class="onb__title">Sua conta principal</h1>
    <p class="onb__lead">Com o saldo real cadastrado, o app mostra quanto você tem hoje, não só o que gastou.</p>
  </div>
  <div class="onb__fields ${skipped ? "onb__fields--off" : ""}">
    <div class="field">
      <label class="field__label" for="onb-acc-name">Nome da conta</label>
      <input id="onb-acc-name" class="input" data-field="onb-acc-name" value="${escapeHtml(a.name)}" maxlength="40" placeholder="Nubank, Itaú, carteira..." ${skipped ? "disabled" : ""} />
    </div>
    <div class="field-row">
      <div class="field">
        <label class="field__label" for="onb-acc-type">Tipo</label>
        <select id="onb-acc-type" class="input" data-action-select="onb-acc-type" ${skipped ? "disabled" : ""}>
          ${Object.keys(ACCOUNT_TYPE_LABELS).map((k) => `<option value="${k}" ${a.type === k ? "selected" : ""}>${escapeHtml(ACCOUNT_TYPE_LABELS[k])}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="onb-acc-balance">Saldo nessa data</label>
        <input id="onb-acc-balance" class="input" data-field="onb-acc-balance" value="${escapeHtml(a.balance)}" inputmode="decimal" placeholder="0,00" ${skipped ? "disabled" : ""} />
      </div>
    </div>
    <div class="field">
      <label class="field__label" for="onb-acc-date">Saldo válido desde</label>
      <input id="onb-acc-date" type="date" class="input" data-field="onb-acc-date" value="${escapeHtml(a.openingDate || todayIso())}" max="${todayIso()}" ${skipped ? "disabled" : ""} />
      <p class="field-hint">Movimentos anteriores a essa data não alteram esta conta. Se você vai importar o extrato do mês, recue para o primeiro dia dele.</p>
    </div>
  </div>
  <button class="onb__toggle ${skipped ? "active" : ""}" data-action="onb-skip-account" aria-pressed="${skipped ? "true" : "false"}">
    <span class="onb__toggle-box">${skipped ? svgIcon("check", 13) : ""}</span>
    <span>Cadastro depois. Quero só registrar gastos por enquanto.</span>
  </button>`;
}

/* --------------------------------------------------------------- passo 4 */

// Valor digitado para uma categoria, em reais. Texto vazio ou lixo vira 0, que
// significa "não declarou" e não "declarou zero".
function onbFixedOf(categoryId) {
  const bruto = (state.onboarding.fixed || {})[categoryId];
  const n = parseMoneyInput(String(bruto == null ? "" : bruto));
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
}

function onbFixedTotal() {
  return sumMoney(ONB_FIXED_PRESETS, (p) => onbFixedOf(p.categoryId));
}

// As categorias como o motor de tetos deve enxergá-las: com o que a pessoa
// declarou já gravado como teto. Existe uma função só para isso porque a PRÉVIA
// (passo 5) e a GRAVAÇÃO (conclusão) precisam partir exatamente da mesma base;
// é a mesma razão pela qual `seeds` é calculado uma vez só na conclusão.
function onbSeedCategories() {
  const base = (state.data && state.data.categories) || [];
  const declarados = new Map();
  ONB_FIXED_PRESETS.forEach((p) => {
    const valor = onbFixedOf(p.categoryId);
    if (valor > 0) declarados.set(p.categoryId, valor);
  });
  if (declarados.size === 0) return base;
  // Teto que a pessoa já tinha continua ganhando: quem chega aqui com
  // categorias configuradas está refazendo o assistente, não começando.
  return base.map((c) => (declarados.has(c.id) && !hasBudgetCeiling(c)
    ? { ...c, budget: declarados.get(c.id) }
    : c));
}

// Somar cinco campos e só mostrar o resultado na próxima renderização
// esvaziaria o passo: a pessoa digita e nada responde. O corpo do assistente
// não é redesenhado a cada tecla (isso tiraria o foco do campo), então o
// resumo é remendado no lugar, do mesmo jeito que o rodapé já era.
//
// O remendo escreve TEXTO em elementos que já existem, e não HTML novo. Um
// `innerHTML` aqui seria o primeiro sink novo do app desde o M4 (ver
// tests/test-xss-surface.js) para exibir dois números formatados; o preço de
// abrir essa porta é maior que o negrito que ela compraria.
const ONB_FIXED_HINT_VAZIO = "Se preferir, siga em branco. O passo seguinte sugere tetos a partir da sua renda, e você ajusta depois.";
const ONB_FIXED_HINT_SEM_RENDA = "Sem renda informada, o app não tem como dizer o peso disso no mês.";

function onbFixedHint(income, total) {
  if (!(total > 0)) return ONB_FIXED_HINT_VAZIO;
  if (!(income > 0)) return ONB_FIXED_HINT_SEM_RENDA;
  const pct = Math.round((total / income) * 100);
  return `Isso é cerca de ${pct}% da sua renda. Sobram ${fmtBRL(subMoney(income, total))} para o resto do mês.`;
}

function patchOnbFixedSummary() {
  const total = onbFixedTotal();
  const caixa = document.getElementById("onb-fixed-total");
  const valor = document.getElementById("onb-fixed-total-value");
  const dica = document.getElementById("onb-fixed-hint");
  if (caixa) caixa.hidden = !(total > 0);
  if (valor) valor.textContent = fmtBRL(total);
  if (dica) dica.textContent = onbFixedHint(onbIncome(), total);
}

function renderOnbFixed() {
  return `<div class="onb__intro">
    <span class="onb__icon">${svgIcon("calendar", 26)}</span>
    <h1 class="onb__title">O que sai todo mês<br>sem você decidir?</h1>
    <p class="onb__lead">Só o que é fixo e previsível. Deixe em branco o que não se aplica; nada aqui é obrigatório.</p>
  </div>

  <div class="onb-fixed">
    ${ONB_FIXED_PRESETS.map((p) => `<div class="onb-fixed__row">
      <label class="onb-fixed__label" for="onb-fixed-${p.categoryId}">
        <span class="onb-fixed__name">${escapeHtml(p.label)}</span>
        <span class="onb-fixed__hint">${escapeHtml(p.hint)}</span>
      </label>
      <input id="onb-fixed-${p.categoryId}" class="input onb-fixed__input" data-field="onb-fixed" data-id="${p.categoryId}"
        value="${escapeHtml(String((state.onboarding.fixed || {})[p.categoryId] || ""))}"
        inputmode="decimal" placeholder="0,00" aria-label="Valor mensal de ${escapeHtml(p.label)}" />
    </div>`).join("")}
  </div>

  <div class="onb-fixed__total" id="onb-fixed-total" ${onbFixedTotal() > 0 ? "" : "hidden"}>
    <span>Fixo declarado</span>
    <b id="onb-fixed-total-value">${fmtBRL(onbFixedTotal())}</b>
  </div>
  <p class="field-hint" id="onb-fixed-hint">${escapeHtml(onbFixedHint(onbIncome(), onbFixedTotal()))}</p>

  <div class="onb__note">
    ${svgIcon("info", 17)}
    <p>Isso não cria lançamento nenhum. Vira o teto dessas categorias, e o passo seguinte reparte o que sobra entre as outras.</p>
  </div>`;
}

/* --------------------------------------------------------------- passo 5 */
function renderOnbSplit() {
  const income = onbIncome();
  const active = onbSplitPresetId();
  const s = state.onboarding.split;
  return `<div class="onb__intro">
    <span class="onb__icon">${svgIcon("pie", 26)}</span>
    <h1 class="onb__title">Como dividir o que entra</h1>
    <p class="onb__lead">Necessidades são as contas que não dá para cortar. Desejos é o que melhora o mês. Futuro é o que fica.</p>
  </div>
  <div class="onb__presets">
    ${ONB_SPLIT_PRESETS.map((p) => `<button class="onb__preset ${active === p.id ? "active" : ""}" data-action="onb-split" data-value="${p.id}">
      <span class="onb__preset-title">${p.title}</span>
      <span class="onb__preset-hint">${p.hint}</span>
    </button>`).join("")}
  </div>
  ${income > 0 ? `<div class="onb__preview">
    ${BUDGET_GROUPS.map((g) => `<div class="onb__preview-row">
      <span class="onb__preview-label">${svgIcon(GROUP_ICONS[g], 15)} ${GROUP_LABELS[g]} <span class="onb__preview-pct">${s[g]}%</span></span>
      <span class="onb__preview-value">${fmtBRL(mulMoney(income, s[g] / 100))}</span>
    </div>`).join("")}
  </div>` : ""}
  ${renderOnbSeedPreview()}
  <p class="field-hint">Estourar um grupo nunca bloqueia um lançamento. O app avisa e a decisão continua sua.</p>`;
}

// POR QUE A PRÉVIA DOS TETOS EXISTE.
//
// Escolher "50 / 30 / 20" gravava só três percentuais. O motor de tetos por
// categoria (budgets.js) fica mudo enquanto nenhuma categoria tem limite, e a
// sugestão automática dele depende de histórico, que no primeiro dia não existe.
// Resultado: a pessoa escolhia um modelo de orçamento e não ganhava orçamento.
//
// Agora a conclusão semeia um teto por categoria principal a partir da regra
// escolhida. Como isso grava coisa que o usuário não digitou, ele precisa ver o
// que vai acontecer ANTES de concluir; daí a prévia ficar aberta a um toque, e
// não escondida em uma tela de ajustes que ele ainda não sabe que existe.
function renderOnbSeedPreview() {
  const income = onbIncome();
  if (!(income > 0)) return "";
  const seeds = seedBudgetsFromSplit({ ...state.data, categories: onbSeedCategories() }, income, state.onboarding.split);
  if (seeds.items.length === 0 && seeds.kept.length === 0) return "";

  const n = seeds.items.length;
  const resumo = n === 0
    ? "Seus tetos atuais serão mantidos"
    : (n === 1 ? "Ver o teto sugerido para 1 categoria" : `Ver os tetos sugeridos para ${n} categorias`);

  return `<details class="onb-seed">
    <summary class="onb-seed__summary">${svgIcon("target", 14)}<span>${resumo}</span></summary>
    <div class="onb-seed__body">
      ${n > 0 ? `<div class="onb-seed__list">
        ${seeds.items.map((item) => `<div class="onb-seed__row">
          <span class="onb-seed__name">
            <span class="icon-bubble icon-bubble--sm" data-ui-css="${categoryBubbleCss(item.color)}">${svgIcon(item.icon, 13)}</span>
            ${escapeHtml(item.name)}
          </span>
          <span class="onb-seed__value">${fmtBRL(item.budget)}</span>
        </div>`).join("")}
      </div>` : ""}
      ${seeds.kept.length > 0 ? `<p class="field-hint" data-ui-css="margin:8px 0 0">${seeds.kept.length === 1
        ? "1 categoria já tem teto definido e não será alterada."
        : `${seeds.kept.length} categorias já têm teto definido e não serão alteradas.`}</p>` : ""}
      <p class="field-hint" data-ui-css="margin:8px 0 0">Ponto de partida do app, não regra de mercado. Cada teto é editável em Categorias, e passar de um deles nunca bloqueia um lançamento.</p>
    </div>
  </details>`;
}

/* ------------------------------------------------------------- conclusão */
// Uma única gravação para os quatro passos. Escrever a cada "Continuar"
// deixaria lixo no banco se o usuário fechasse a aba no meio.
function finishOnboarding() {
  const o = state.onboarding;
  const income = onbIncome();
  const name = String(o.name || "").trim().slice(0, 40);
  const wantsAccount = !o.skipAccount && !!String(o.account.name).trim();
  const balance = parseMoneyInput(o.account.balance || "0");
  // Calculado UMA vez, fora do setData, para que o texto do aviso e o que foi
  // de fato gravado venham do mesmo resultado. Recalcular dentro do reducer
  // abriria espaço para os dois divergirem.
  // Mesma base da prévia do passo 5: o que a pessoa declarou como fixo entra
  // como teto ANTES da semeadura, e o motor o preserva e o desconta da cota do
  // grupo. Ver o bloco do passo 4 e budgets.js.
  const categoriasBase = onbSeedCategories();
  const seeds = seedBudgetsFromSplit({ ...state.data, categories: categoriasBase }, income, o.split);

  // A ordem importa: `setData` já renderiza. Fechar a camada antes evita um
  // quadro em que a tela de boas-vindas reaparece por um instante com os dados
  // novos atrás dela.
  state.onboarding.open = false;
  setData((d) => {
    const next = {
      ...d,
      userName: name,
      monthlyIncome: income,
      budgetSplit: { ...o.split },
      dashboardFocus: normalizeDashboardFocus(o.focus),
      dashboardLayout: applyDashboardFocus(d.dashboardLayout, o.focus),
      onboarding: { done: true, skipped: false, completedAt: todayIso() },
      privacy: acceptLegalTexts(d.privacy),
      categories: categoriesWithSeededBudgets(categoriasBase, seeds),
    };
    if (wantsAccount) {
      next.accounts = [...(d.accounts || []), makeAccount({
        name: String(o.account.name).trim(),
        type: o.account.type,
        openingBalance: Number.isFinite(balance) ? balance : 0,
        // Antes isto era `todayIso()` fixo. O efeito era silencioso e grave:
        // a primeira coisa que o usuário faz é importar o extrato do mês, e
        // TODAS as linhas caíam antes da abertura, então o saldo não se mexia
        // um centavo enquanto "Despesas do mês" já contava tudo. O passo 3
        // agora pergunta a data a que o saldo se refere.
        openingDate: onbOpeningDate(),
        color: "#0B6B5C",
      })];
    }
    // O snapshot do mês precisa nascer junto: budgetForCategory lê o snapshot
    // antes de olhar a categoria, então gravar teto sem atualizar o snapshot
    // deixaria o cartão de orçamentos vazio até a virada do mês.
    return withBudgetSnapshot(next);
  });

  state.form = freshTxForm();
  setState({ tab: "dashboard" });
  const saudacao = name ? `Tudo pronto, ${name}` : "Tudo pronto";
  notify(seeds.items.length > 0
    ? `${saudacao}. Tetos sugeridos em ${plural(seeds.items.length, "categoria", "categorias")}.`
    : saudacao);
}

// ------------------------------------------------------------------------------
// "JÁ TENHO CONTA": A SAÍDA QUE FALTAVA
// ------------------------------------------------------------------------------
// O assistente tomava a tela inteira e não oferecia nenhum caminho para entrar
// numa conta que já existe. Quem instalava o app num aparelho novo era obrigado
// a INVENTAR renda e conta do banco antes de conseguir chegar na tela de login,
// e o que ele inventava virava um segundo cadastro ao lado do que a conta já
// tinha. Pior: aquele conteúdo de visitante passava a exigir a confirmação de
// "juntar dados" em toda entrada, que é exatamente o botão que ninguém quer
// apertar para ver o próprio dinheiro.
//
// Nada de configuração é gravado aqui. Só o aceite legal, que é do APARELHO e
// nunca sobe para a conta (`privacy` está fora de SYNC_ALLOWED_SETTINGS), e que
// por isso não faz a base de visitante contar como conteúdo a vincular.
function openAccountFromOnboarding() {
  if (!state.onboarding.legalAccepted) { notify("Aceite a política e os termos para continuar", "warn"); return; }
  setData((d) => ({ ...d, privacy: acceptLegalTexts(d.privacy) }));
  // Segurado, não concluído: quem entrar numa conta vazia ainda precisa
  // configurar, e a liberação no fim do vínculo reabre o assistente.
  holdOnboardingGate();
  setState({ tab: "account" });
  notify("Entre com seu email e senha para trazer os dados da sua conta");
}

// Pular também é um desfecho: registramos para não perguntar de novo a cada
// abertura. `skipped` fica marcado para que Ajustes possa oferecer o assistente.
function skipOnboarding() {
  if (!state.onboarding.legalAccepted) { notify("Aceite a política e os termos para continuar", "warn"); return; }
  setData((d) => ({ ...d, onboarding: { done: true, skipped: true, completedAt: todayIso() }, privacy: acceptLegalTexts(d.privacy) }));
  state.onboarding.open = false;
  render();
}

// Reabertura manual (Ajustes). Os campos nascem preenchidos com o que já existe,
// então refazer a configuração é revisão, não digitação do zero.
function startOnboarding() {
  const d = state.data;
  const first = (d.accounts || []).find((a) => !a.archived);
  state.onboarding = {
    ...freshOnboarding(),
    open: true,
    step: 1,
    name: d.userName || "",
    income: d.monthlyIncome ? moneyDraft(d.monthlyIncome) : "",
    account: first
      ? { name: first.name, type: first.type, balance: moneyDraft(accountBalance(d, first.id, todayIso())), openingDate: first.openingDate || todayIso() }
      : { name: "", type: "corrente", balance: "", openingDate: todayIso() },
    skipAccount: !!first,
    split: { ...d.budgetSplit },
    focus: normalizeDashboardFocus(d.dashboardFocus),
    legalAccepted: legalAccepted(d.privacy),
  };
  render();
}
