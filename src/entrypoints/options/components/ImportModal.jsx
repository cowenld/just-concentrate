import { useState, useRef } from 'preact/hooks';
import { Modal } from '../../../components/Modal.jsx';
import { Icon } from '../../../components/Icon.jsx';
import { IMPORT_FORMATS, autoDetectAndParse } from '../../../lib/importers.js';
import { saveList, saveSchedule, getAllowlist, saveAllowlist, getSettings, saveSettings, getBudgets, saveBudget, generateId, getCachedBlockState, isBlockingAnything } from '../../../lib/storage.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';
import { isFrictionDowngrade } from '../../../lib/friction.js';

export function ImportModal({ visible, onClose, onImported }) {
  const [format, setFormat] = useState('auto');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);
  const { gate, frictionModal } = useFrictionGate();

  function reset() {
    setResult(null);
    setError(null);
    setDragOver(false);
    setImporting(false);
    setDone(null);
  }

  function handleClose() {
    reset();
    setFormat('auto');
    onClose();
  }

  async function processFile(file) {
    setResult(null);
    setError(null);
    setDone(null);
    try {
      const content = await file.text();
      let parsed;

      if (format === 'auto') {
        parsed = autoDetectAndParse(content, file.name);
      } else {
        const fmt = IMPORT_FORMATS.find(f => f.id === format);
        parsed = fmt.parse(content, file.name);
      }

      setResult(parsed);
    } catch (err) {
      setError(err.message || 'Could not parse file');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  // Imported allowlist entries can open holes in an active block.
  async function handleImport() {
    if (!result) return;
    if ((result.allowlist || []).length > 0 && isBlockingAnything(await getCachedBlockState())) {
      gate({ title: 'Import allowed sites during a block', description: `A block is active. This adds ${result.allowlist.length} always-allowed ${result.allowlist.length === 1 ? 'site' : 'sites'}.`, confirmLabel: 'Import' }, doImport);
      return;
    }
    await doImport();
  }

  async function doImport() {
    setImporting(true);
    setError(null);

    try {
      const idMap = {};
      for (const list of result.lists) {
        const oldId = list.id;
        const newList = await saveList({
          id: generateId(),
          name: list.name,
          sites: list.sites,
          origin: list.origin || 'user'
        });
        if (oldId) idMap[oldId] = newList.id;
      }

      const schedules = result.schedules || [];
      for (const sched of schedules) {
        const listIds = (sched.listIds || []).map(id => idMap[id] || id);
        await saveSchedule({
          ...sched,
          id: generateId(),
          listIds
        });
      }

      if (result.allowlist && result.allowlist.length > 0) {
        const existing = await getAllowlist();
        const merged = [...new Set([...existing, ...result.allowlist])];
        await saveAllowlist(merged);
      }

      const budgets = result.budgets || [];
      if (budgets.length > 0) {
        const existing = await getBudgets();
        for (const b of budgets) {
          if (!existing.some(e => e.domain === b.domain)) await saveBudget({ ...b });
        }
      }

      if (result.settings) {
        // Device-local preferences and the phrase are never imported; friction
        // only ever gets stronger through an import.
        const { syncEnabled: _sync, onboardingComplete: _onboarded, passphrase: _phrase, trackTime: _track, ...rest } = result.settings;
        if (rest.frictionLevel === 'passphrase' && !(await getSettings()).passphrase) delete rest.frictionLevel;
        if (isFrictionDowngrade(await getSettings(), rest)) {
          delete rest.frictionLevel;
          delete rest.cooldownSeconds;
        }
        await saveSettings(rest);
      }

      chrome.runtime.sendMessage({ type: 'refreshRules' });

      const totalSites = result.lists.reduce((sum, l) => sum + l.sites.length, 0);
      setDone({
        listCount: result.lists.length,
        siteCount: totalSites,
        scheduleCount: schedules.length,
        allowlistCount: (result.allowlist || []).length,
        hasSettings: !!result.settings
      });
      setImporting(false);
      onImported(result);
    } catch (err) {
      setError('Import failed: ' + err.message);
      setImporting(false);
    }
  }

  const totalSites = result
    ? result.lists.reduce((sum, l) => sum + l.sites.length, 0)
    : 0;

  return (
    <>
    <Modal visible={visible} onClose={handleClose} title="Import sites">

      {done && (
        <div>
          <div class="callout mb-4" style="border-left-color: var(--color-ok); background: var(--color-ok-soft)">
            <strong>Imported successfully.</strong>{' '}
            {done.listCount} {done.listCount === 1 ? 'list' : 'lists'} ({done.siteCount} sites)
            {done.scheduleCount > 0 && `, ${done.scheduleCount} ${done.scheduleCount === 1 ? 'schedule' : 'schedules'}`}
            {done.allowlistCount > 0 && `, ${done.allowlistCount} allowlist ${done.allowlistCount === 1 ? 'entry' : 'entries'}`}
            {done.hasSettings && ', settings'}
            {' '}added.
          </div>
          <div class="flex justify-end gap-3">
            <button class="btn btn-outline" onClick={reset}>IMPORT MORE</button>
            <button class="btn btn-ink" onClick={handleClose}>DONE</button>
          </div>
        </div>
      )}

      {!done && (
        <div>
          <div class="mb-4">
            <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">
              IMPORT FROM
            </label>
            <select
              class="field w-full"
              value={format}
              onChange={e => { setFormat(e.target.value); setResult(null); setError(null); }}
            >
              {IMPORT_FORMATS.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {!result && (
            <div
              class={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-accent bg-accent/5' : 'border-rule hover:border-ink-4'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={24} className="mx-auto mb-2 text-ink-4" />
              <div class="text-sm font-medium text-ink-3 mb-1">Drop file here</div>
              <div class="text-xs text-ink-4">or click to browse</div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.txt,.ctbbl,.csv"
                style="display:none"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {error && (
            <div class="callout mt-3" style="border-left-color: var(--color-danger); background: var(--color-danger-soft)">
              {error}
            </div>
          )}

          {result && (
            <div>
              <div class="text-sm text-ink-3 mb-3">
                Detected: <strong class="text-ink">{result.source}</strong>
              </div>

              <div class="flex flex-col gap-1.5 mb-3">
                {result.lists.map((list, i) => (
                  <div key={i} class="flex items-center justify-between bg-card border border-rule rounded px-3 py-2">
                    <span class="text-sm text-ink">{list.name}</span>
                    <span class="text-xs text-ink-4">{list.sites.length} sites</span>
                  </div>
                ))}
              </div>

              <div class="text-xs text-ink-4 mb-4 flex flex-col gap-0.5">
                <span>{result.lists.length} {result.lists.length === 1 ? 'list' : 'lists'}, {totalSites} total sites</span>
                {(result.schedules || []).length > 0 && (
                  <span>{result.schedules.length} {result.schedules.length === 1 ? 'schedule' : 'schedules'}</span>
                )}
                {(result.budgets || []).length > 0 && (
                  <span>{result.budgets.length} daily {result.budgets.length === 1 ? 'limit' : 'limits'}</span>
                )}
                {(result.allowlist || []).length > 0 && (
                  <span>{result.allowlist.length} allowlist {result.allowlist.length === 1 ? 'entry' : 'entries'}</span>
                )}
                {result.settings && <span>Settings (friction, cooldown, passphrase)</span>}
              </div>

              <div class="flex justify-end gap-3">
                <button class="btn btn-outline" onClick={() => { setResult(null); setError(null); }}>BACK</button>
                <button class="btn btn-ink" onClick={handleImport} disabled={importing}>
                  {importing ? 'IMPORTING...' : 'IMPORT'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
    {frictionModal}
    </>
  );
}
