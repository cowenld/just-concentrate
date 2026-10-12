// Minimal in-memory chrome.storage for unit tests.
function createArea() {
  let store = {};
  return {
    _dump: () => store,
    _reset: () => { store = {}; },
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(store);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in store) out[k] = structuredClone(store[k]);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) store[k] = structuredClone(v);
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete store[k];
    }
  };
}

export function installChromeMock() {
  const chrome = {
    storage: { local: createArea(), sync: createArea(), session: createArea() }
  };
  globalThis.chrome = chrome;
  return chrome;
}
