import { useState, useEffect } from 'preact/hooks';
import { saveList, getData } from '../../../lib/storage.js';
import { isScheduleInForce } from '../../../lib/schedule-engine.js';
import { normalizeEntry, formatEntry } from '../../../lib/formatting.js';
import { isListWeakened } from '../../../lib/friction.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';
import { EntryHint } from './EntryHint.jsx';

export function ListModal({ list, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [sites, setSites] = useState([]);
  const [siteInput, setSiteInput] = useState('');
  const [siteError, setSiteError] = useState('');
  const { gate, frictionModal } = useFrictionGate();

  useEffect(() => {
    if (list) {
      setName(list.name);
      setSites([...list.sites]);
    } else {
      setName('');
      setSites([]);
    }
    setSiteInput('');
  }, [list]);

  function addSite() {
    if (!siteInput.trim()) return;
    const val = normalizeEntry(siteInput);
    if (!val) {
      setSiteError(`“${siteInput.trim()}” isn't a domain, path or keyword: entry.`);
      return;
    }
    if (!sites.includes(val)) setSites([...sites, val]);
    setSiteInput('');
    setSiteError('');
  }

  function removeSite(i) {
    setSites(sites.filter((_, idx) => idx !== i));
  }

  async function save() {
    // Editing a bundled list forks it into a user list (it stops auto-updating).
    const next = {
      id: list ? list.id : undefined,
      name: name.trim() || 'Untitled list',
      sites,
      origin: 'user'
    };
    const doSave = async () => {
      const saved = await saveList(next);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
      onSaved(saved);
    };
    // Is a schedule using this list blocking right now? Checked at save time.
    const data = await getData();
    const inForce = !!list && data.schedules.some(s =>
      (s.listIds || []).includes(list.id) && !s.blackout && isScheduleInForce(s, data.suspensions));
    if (inForce && isListWeakened(list, next)) {
      gate({
        title: 'Remove sites from an active list',
        description: `“${list.name}” is used by a schedule that's blocking right now.`,
        confirmLabel: 'Save list'
      }, doSave);
      return;
    }
    await doSave();
  }

  return (
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bg-card border border-ink w-[90%] max-w-[520px] max-h-[85vh] overflow-y-auto shadow-pop">
        <div class="flex justify-between items-center px-6 pt-5 pb-3">
          <h2 class="text-[18px] font-semibold text-ink">{list ? 'Edit list' : 'New list'}</h2>
          <button class="bg-transparent border-none text-[24px] cursor-pointer text-ink-3 hover:text-ink px-1" onClick={onClose}>&times;</button>
        </div>
        <div class="px-6 pb-5">
          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">LIST NAME</label>
          <input type="text" value={name} onInput={e => setName(e.target.value)} class="field" placeholder="e.g. Social media" />

          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">SITES</label>
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              value={siteInput}
              onInput={e => { setSiteInput(e.target.value); setSiteError(''); }}
              onKeyDown={e => e.key === 'Enter' && addSite()}
              class="field flex-1"
              placeholder="e.g. twitter.com"
            />
            <button class="btn btn-outline" onClick={addSite}>ADD</button>
          </div>
          <EntryHint error={siteError} />
          <div class="flex flex-wrap gap-1.5 min-h-8">
            {sites.map((site, i) => (
              <span key={site + i} class="chip">
                {formatEntry(site)}
                <button class="chip-remove" onClick={() => removeSite(i)}>&times;</button>
              </span>
            ))}
          </div>
        </div>
        <div class="flex justify-end gap-2 px-6 pb-5 pt-3 border-t border-rule">
          <button class="btn btn-ghost" onClick={onClose}>CANCEL</button>
          <button class="btn btn-ink" onClick={save}>SAVE LIST</button>
        </div>
      </div>
      {frictionModal}
    </div>
  );
}
