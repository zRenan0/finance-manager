const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])', '[href]', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function triggerDescriptor(element) {
  if (!element || !element.closest) return null;
  const trigger = element.closest('[data-action], button, a, input, select');
  if (!trigger) return null;
  if (trigger.id) return { id: trigger.id };
  if (trigger.dataset && trigger.dataset.action) {
    return { action: trigger.dataset.action, idValue: trigger.dataset.id || '', value: trigger.dataset.value || '' };
  }
  return null;
}

function findTrigger(descriptor) {
  if (!descriptor) return null;
  if (descriptor.id) return document.getElementById(descriptor.id);
  const candidates = Array.from(document.querySelectorAll(`[data-action="${descriptor.action}"]`));
  return candidates.find((node) => (node.dataset.id || '') === descriptor.idValue && (node.dataset.value || '') === descriptor.value) || candidates[0] || null;
}

function backgroundNodes(dialog) {
  const root = document.getElementById('app');
  if (!root) return [];
  return Array.from(root.querySelectorAll('.skip-link, .side-nav, .main-content, .bottom-nav'))
    .filter((node) => !node.contains(dialog));
}

export function createDialogController() {
  let wasOpen = false;
  let opener = null;
  let isolated = [];

  function releaseBackground() {
    isolated.forEach(({ node, ariaHidden }) => {
      node.inert = false;
      if (ariaHidden == null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', ariaHidden);
    });
    isolated = [];
  }

  function isolateBackground(dialog) {
    releaseBackground();
    isolated = backgroundNodes(dialog).map((node) => ({ node, ariaHidden: node.getAttribute('aria-hidden') }));
    isolated.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    });
  }

  // [M42] O FOCO INICIAL NÃO CAI NUM CONTROLE DESABILITADO POR ARIA.
  //
  // `FOCUSABLE_SELECTOR` exclui `[disabled]` porque o navegador já tira esses
  // elementos da ordem de tabulação. `aria-disabled` é outra coisa: ele diz
  // "desabilitado" para a tecnologia assistiva e MANTÉM o controle alcançável,
  // que é justamente o motivo de o assistente usá-lo (só assim o leitor de tela
  // anuncia a razão do bloqueio; ver js/screens/onboarding.js).
  //
  // O efeito colateral, que apareceu no primeiro corte: ao abrir o assistente,
  // o foco inicial passou a cair em "Já tenho conta", um botão que está
  // desabilitado. Quem usa leitor de tela era recebido pelo controle que não
  // pode usar, em vez do começo do conteúdo.
  //
  // A regra certa separa os dois momentos: para o foco INICIAL, um controle
  // marcado como desabilitado não é candidato; para o CICLO do Tab, ele
  // continua na roda, porque tirá-lo de lá desfaria o ganho de acessibilidade.
  const FOCO_INICIAL_SELECTOR = FOCUSABLE_SELECTOR
    .split(',')
    .map((parte) => `${parte.trim()}:not([aria-disabled="true"])`)
    .join(',');

  function focusFirst(dialog) {
    const target = dialog.querySelector('[autofocus]')
      || dialog.querySelector(FOCO_INICIAL_SELECTOR)
      || dialog.querySelector(FOCUSABLE_SELECTOR)
      || dialog;
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    if (!dialog.contains(document.activeElement)) target.focus({ preventScroll: true });
  }

  function sync() {
    const dialogs = Array.from(document.querySelectorAll(DIALOG_SELECTOR));
    const dialog = dialogs[dialogs.length - 1] || null;
    if (dialog) {
      // [M39] QUEM ABRIU PELO TECLADO TAMBÉM PRECISA VOLTAR PARA ONDE ESTAVA.
      //
      // `opener` só era gravado em `pointerdown`. Abrir o diálogo com Enter ou
      // Espaço não dispara `pointerdown` nenhum, então `opener` ficava nulo, o
      // `findTrigger` abaixo não achava alvo e, ao fechar, o foco caía no
      // `<body>`: a pessoa voltava para o topo da página e precisava tabular a
      // tela inteira de novo. O defeito atingia exatamente quem depende do
      // recurso (WCAG 2.4.3, ordem de foco).
      //
      // Aqui o foco ainda está no gatilho: `render()` reconstrói o HTML, chama
      // `restoreFocus` (que devolve o foco ao botão, que continua existindo
      // atrás do diálogo) e só então chama este `sync`. Ler o elemento focado
      // neste ponto cobre teclado, ponteiro e abertura por código, sem depender
      // de qual evento começou a história.
      if (!wasOpen && !opener) opener = triggerDescriptor(document.activeElement);
      dialog.dataset.managedDialog = 'true';
      isolateBackground(dialog);
      focusFirst(dialog);
      wasOpen = true;
      return;
    }
    releaseBackground();
    if (wasOpen) {
      wasOpen = false;
      const target = findTrigger(opener);
      opener = null;
      if (target && typeof target.focus === 'function') queueMicrotask(() => target.focus({ preventScroll: true }));
    }
  }

  function onPointerDown(event) {
    if (!document.querySelector(DIALOG_SELECTOR)) opener = triggerDescriptor(event.target);
  }

  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const dialogs = Array.from(document.querySelectorAll(DIALOG_SELECTOR));
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => node.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  // [M39] Declaração explícita de quem abriu, para o caso em que o gatilho SOME.
  //
  // O `pointerdown` e a leitura do foco em `sync` cobrem o botão que continua na
  // tela atrás do diálogo. Não cobrem o gatilho que a própria abertura remove -
  // o assistente é assim: o botão flutuante vira o painel. Quando o `sync` roda,
  // o botão não existe mais, o foco já caiu no `<body>` e não há o que guardar.
  //
  // `noteTrigger` é chamado por `openOverlay` (js/app.js), ANTES do render, com
  // o elemento que ainda está focado. Só grava se ainda não houver um gatilho
  // anotado, para não sobrescrever o do `pointerdown` da mesma abertura.
  function noteTrigger(element) {
    if (opener || document.querySelector(DIALOG_SELECTOR)) return;
    opener = triggerDescriptor(element || document.activeElement);
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown, true);
  return Object.freeze({ sync, noteTrigger });
}
