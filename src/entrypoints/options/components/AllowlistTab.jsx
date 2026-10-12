import { useState, useEffect } from 'preact/hooks';
import { getAllowlist, saveAllowlist, getCachedBlockState, isBlockingAnything } from '../../../lib/storage.js';
import { normalizeDomain } from '../../../lib/formatting.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';

export function AllowlistTab() {
  const [allowlist, setAllowlist] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const { gate, frictionModal } = useFrictionGate();

  useEffect(() => {
    getAllowlist().then(setAllowlist);
  }, []);

  async function addDomain() {
    if (!input.trim()) return;
    const val = normalizeDomain(input);
    if (!val) { setError(`“${input.trim()}” isn't a domain.`); return; }
    if (allowlist.includes(val)) { setInput(''); return; }
    const doAdd = async () => {
      const updated = [...allowlist, val];
      await saveAllowlist(updated);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
      setAllowlist(updated);
      setInput('');
    };
    // Allowing a site while something is blocking can open a hole in it.
    if (isBlockingAnything(await getCachedBlockState())) {
      gate({
        title: 'Allow a site during a block',
        description: `A block is active right now. ${val} will always be reachable, even during blackout.`,
        confirmLabel: 'Allow site'
      }, doAdd);
      return;
    }
    await doAdd();
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
          onInput={e => { setInput(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && addDomain()}
          placeholder="add a domain, e.g. docs.google.com"
          class="field flex-1"
        />
        <button class="btn btn-ink" onClick={addDomain}>+ ADD</button>
      </div>
      {error && <p class="text-[12px] text-danger mb-3">{error}</p>}
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
      {frictionModal}
    </section>
  );
}
