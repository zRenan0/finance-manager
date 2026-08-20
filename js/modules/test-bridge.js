export function createTestBridge(currentLocation = location) {
  const params = new URLSearchParams(currentLocation.search);
  const localHost = currentLocation.hostname === '127.0.0.1' || currentLocation.hostname === 'localhost';
  const enabled = localHost && params.get('__test') === '1';
  let contract = null;

  function register(nextContract) {
    if (!enabled || contract || !nextContract || typeof nextContract.snapshot !== 'function') return false;
    contract = Object.freeze({ ...nextContract });
    return true;
  }

  function call(method, ...args) {
    if (!enabled || !contract || typeof contract[method] !== 'function') {
      throw new Error('Ponte de teste indisponível');
    }
    return contract[method](...args);
  }

  return Object.freeze({
    enabled,
    register,
    snapshot: () => call('snapshot'),
    navigate: (tab) => call('navigate', tab),
    theme: (value) => call('theme', value),
  });
}

