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

  function focusFirst(dialog) {
    const target = dialog.querySelector('[autofocus]') || dialog.querySelector(FOCUSABLE_SELECTOR) || dialog;
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    if (!dialog.contains(document.activeElement)) target.focus({ preventScroll: true });
  }

  function sync() {
    const dialogs = Array.from(document.querySelectorAll(DIALOG_SELECTOR));
    const dialog = dialogs[dialogs.length - 1] || null;
    if (dialog) {
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

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown, true);
  return Object.freeze({ sync });
}
