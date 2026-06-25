import { useState, useEffect } from 'preact/hooks';
import { getAllowlist, saveAllowlist } from '../../../lib/storage.js';
import { normalizeDomain } from '../../../lib/formatting.js';

export function AllowlistTab() {
  const [allowlist, setAllowlist] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    getAllowlist().then(setAllowlist);
  }, []);

  async function addDomain() {
    const val = normalizeDomain(input);
    if (!val || allowlist.includes(val)) return;
    const updated = [...allowlist, val];
    await saveAllowlist(updated);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    setAllowlist(updated);
    setInput('');
  }

  async function removeDomain(i) {
    const updated = allowlist.filter((_, idx) => idx !== i);
    await saveAllowlist(updated);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    setAllowlist(updated);
  }

  return (
    <section>
      <div class="flex justify-between items-start mb-5">
        <h2 class="text-[22px] font-medium text-ink">Allowed Sites</h2>
      </div>
      <div class="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onInput={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addDomain()}
          placeholder="add a domain, e.g. docs.google.com"
          class="field flex-1"
        />
        <button class="btn btn-ink" onClick={addDomain}>+ ADD</button>
      </div>
      <div class="mono-cap text-accent mb-2.5">
        /// {allowlist.length} ALLOWED DOMAIN{allowlist.length !== 1 ? 'S' : ''}
      </div>
      <div class="flex flex-wrap gap-1.5 min-h-8">
        {allowlist.map((site, i) => (
          <button key={site} class="chip chip-removable" onClick={() => removeDomain(i)}>
            {site}
            <span class="chip-remove">&times;</span>
          </button>
        ))}
      </div>
      <div class="callout mt-5">
        Allowed sites are never blocked, even during blackout. Keep the list short to avoid loopholes.
      </div>
    </section>
  );
}
