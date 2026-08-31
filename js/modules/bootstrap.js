document.documentElement.setAttribute('data-module-boot', 'loading');
try {
  const [{ createDialogController }, { createFormErrorController }, { createDynamicStyleController }, { createTestBridge }] = await Promise.all([
    import('./dialog-controller.js'),
    import('./form-errors.js'),
    import('./dynamic-styles.js'),
    import('./test-bridge.js'),
  ]);

  const api = Object.freeze({
    dialogs: createDialogController(),
    forms: createFormErrorController(),
    styles: createDynamicStyleController(),
    test: createTestBridge(),
  });

  Object.defineProperty(window, 'CofreUI', {
    value: api,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  api.styles.observe(document.documentElement);
  await import('./app.generated.js');
  document.documentElement.setAttribute('data-module-boot', 'ready');
} catch (error) {
  document.documentElement.setAttribute('data-module-boot', 'failed');
  console.error('Falha ao iniciar o aplicativo');
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `
      <main class="boot-error" role="alert">
        <h1>Não foi possível abrir o aplicativo</h1>
        <p>Atualize a página. Se o problema continuar, use a versão anterior do aplicativo.</p>
        <button class="btn btn--primary" type="button" data-boot-reload>Atualizar página</button>
      </main>`;
    root.querySelector('[data-boot-reload]')?.addEventListener('click', () => location.reload());
  }
  throw error;
}
