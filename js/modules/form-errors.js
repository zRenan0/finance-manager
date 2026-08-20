function fieldElement(key) {
  return document.getElementById(key) || document.querySelector(`[data-field="${key}"]`);
}

function errorIdFor(field) {
  return `${field.id || field.dataset.field || 'field'}-error`;
}

export function createFormErrorController() {
  const errors = new Map();

  function removeRendered(field) {
    if (!field) return;
    const errorId = errorIdFor(field);
    const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter((id) => id !== errorId);
    if (describedBy.length) field.setAttribute('aria-describedby', describedBy.join(' '));
    else field.removeAttribute('aria-describedby');
    field.removeAttribute('aria-invalid');
    const rendered = document.getElementById(errorId);
    if (rendered) rendered.remove();
  }

  function renderField(key, message) {
    const field = fieldElement(key);
    if (!field) return null;
    removeRendered(field);
    const errorId = errorIdFor(field);
    field.setAttribute('aria-invalid', 'true');
    const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    field.setAttribute('aria-describedby', Array.from(new Set(describedBy.concat(errorId))).join(' '));
    const error = document.createElement('p');
    error.id = errorId;
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    const container = field.closest('.field') || field.parentElement;
    container.appendChild(error);
    return field;
  }

  function sync(options = {}) {
    let first = null;
    Array.from(errors.entries()).forEach(([key, message]) => {
      if (!fieldElement(key)) { errors.delete(key); return; }
      first = first || renderField(key, message);
    });
    if (options.focus !== false && first) first.focus({ preventScroll: false });
  }

  function show(nextErrors) {
    clearAll();
    Object.entries(nextErrors || {}).forEach(([key, message]) => {
      if (message) errors.set(key, String(message));
    });
    sync();
    return errors.size === 0;
  }

  function clearField(key) {
    const field = fieldElement(key);
    if (field) removeRendered(field);
    errors.delete(key);
    if (field && field.dataset && field.dataset.field) errors.delete(field.dataset.field);
    if (field && field.id) errors.delete(field.id);
  }

  function clearAll() {
    document.querySelectorAll('[aria-invalid="true"]').forEach(removeRendered);
    errors.clear();
  }

  return Object.freeze({ show, sync, clearField, clearAll, hasErrors: () => errors.size > 0 });
}
