import { useState, useEffect } from 'preact/hooks';
import { getSettings, saveSettings, exportData, applySyncedConfig, readSyncedConfig, getData, getSyncPayloadSize, clearUsage, getBudgets, getCachedBlockState, isBlockingAnything } from '../../../lib/storage.js';
import { effectiveFriction, isFrictionDowngrade } from '../../../lib/friction.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';
import { Modal } from '../../../components/Modal.jsx';
import { ImportModal } from './ImportModal.jsx';

const FRICTION_OPTIONS = [
  { value: 'none', label: 'None', desc: 'Overrides happen immediately.' },
  { value: 'wait', label: 'Wait', desc: 'Wait out a cooldown before an override goes through.' },
  { value: 'passphrase', label: 'Passphrase', desc: 'Type your commitment phrase, then wait the cooldown.' }
];

export function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [newPhrase, setNewPhrase] = useState('');
  const [incognitoAllowed, setIncognitoAllowed] = useState(null);
  const [syncConfirm, setSyncConfirm] = useState(null);
  const [syncSize, setSyncSize] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [blockCss, setBlockCss] = useState('');
  const [blockPageSaved, setBlockPageSaved] = useState(false);
  const [confirmClearUsage, setConfirmClearUsage] = useState(false);
  const { gate, frictionModal } = useFrictionGate();

  useEffect(() => {
    loadSettings();
    checkIncognito();
  }, []);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
    setBlockMessage(s.blockPageMessage || '');
    setBlockCss(s.blockPageCss || '');
    if (s.syncEnabled) {
      const data = await getData();
      setSyncSize(getSyncPayloadSize(data));
    } else {
      setSyncSize(null);
    }
  }

  async function checkIncognito() {
    try {
      const allowed = await new Promise(resolve => {
        if (chrome.extension && chrome.extension.isAllowedIncognitoAccess) {
          chrome.extension.isAllowedIncognitoAccess(resolve);
        } else {
          resolve(null);
        }
      });
      setIncognitoAllowed(allowed);
    } catch {
      setIncognitoAllowed(null);
    }
  }

  // Weakening friction must pass the current friction (recursive, D10).
  async function changeFriction(changes, { title, description }) {
    const apply = async () => { await saveSettings(changes); loadSettings(); };
    if (isFrictionDowngrade(settings, changes)) {
      gate({ title, description, confirmLabel: 'Change' }, apply);
    } else {
      await apply();
    }
  }

  // Changing an active phrase is recursive (D10): it passes the current
  // friction, i.e. typing the current phrase and waiting out the cooldown.
  async function savePhrase() {
    const phrase = newPhrase.trim();
    if (!phrase) return;
    const apply = async () => {
      await saveSettings({ passphrase: phrase });
      setNewPhrase('');
      loadSettings();
    };
    if (effectiveFriction(settings) === 'passphrase') {
      gate({ title: 'Change your commitment phrase', description: 'This replaces the phrase you type to override a block.', confirmLabel: 'Change phrase' }, apply);
    } else {
      await apply();
    }
  }

  function handleFrictionChange(level) {
    if (level === 'passphrase' && !(settings.passphrase || '').trim()) {
      // Passphrase mode needs a phrase first; the field appears below.
      saveSettings({ frictionLevel: 'passphrase' }).then(loadSettings);
      return;
    }
    changeFriction({ frictionLevel: level }, {
      title: 'Lower friction',
      description: `This makes overriding a block easier (${level === 'none' ? 'no friction' : 'cooldown only'}).`
    });
  }

  function handleCooldownChange(e) {
    const seconds = Math.min(600, Math.max(5, parseInt(e.target.value) || 30));
    changeFriction({ cooldownSeconds: seconds }, {
      title: 'Shorten the cooldown',
      description: `This shortens the cooldown from ${settings.cooldownSeconds}s to ${seconds}s.`
    }).then(loadSettings);
  }

  async function saveBlockPage() {
    await saveSettings({ blockPageMessage: blockMessage.trim(), blockPageCss: blockCss });
    setBlockPageSaved(true);
    setTimeout(() => setBlockPageSaved(false), 2000);
  }

  async function doClearUsage() {
    await clearUsage();
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    setConfirmClearUsage(false);
  }

  // Clearing usage resets today's time limits, so it's gated while any are on.
  async function handleClearUsage() {
    if ((await getBudgets()).some(b => b.enabled)) {
      gate({ title: 'Clear usage data', description: "This deletes all usage on this device and resets today's time limits to zero.", confirmLabel: 'Clear', destructive: true }, doClearUsage);
    } else {
      setConfirmClearUsage(true);
    }
  }

  // Turning tracking off stops daily limits from counting down, so it's gated
  // while any limit is on.
  async function toggleTracking(e) {
    const trackTime = e.target.checked;
    const apply = async () => { await saveSettings({ trackTime }); loadSettings(); };
    if (!trackTime && (await getBudgets()).some(b => b.enabled)) {
      e.target.checked = true;
      gate({ title: 'Turn off time tracking', description: "Your daily time limits won't count down while tracking is off.", confirmLabel: 'Turn off' }, apply);
    } else {
      await apply();
    }
  }

  // Replacing local config with an older synced copy can undo active blocks.
  async function useSynced() {
    const remote = syncConfirm;
    setSyncConfirm(null);
    const apply = async () => {
      await applySyncedConfig(remote, true);
      await saveSettings({ syncEnabled: true });
      chrome.runtime.sendMessage({ type: 'refreshRules' });
      loadSettings();
    };
    if (isBlockingAnything(await getCachedBlockState())) {
      gate({ title: 'Replace with synced settings', description: 'A block is active. Synced settings replace your schedules, lists and allowed sites on this device.', confirmLabel: 'Use synced' }, apply);
    } else {
      await apply();
    }
  }

  async function handleSyncToggle(e) {
    const enabled = e.target.checked;
    if (!enabled) {
      await saveSettings({ syncEnabled: false });
      loadSettings();
      return;
    }
    const remote = await readSyncedConfig();

    if (remote && (remote.schedules || []).length > 0) {
      setSyncConfirm(remote);
      return;
    }
    await saveSettings({ syncEnabled: true });
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    loadSettings();
  }

  async function handleExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `just-concentrate-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openExtSettings() {
    try {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    } catch { /* not available outside the extension */ }
  }

  if (!settings) return null;

  return (
    <section>
      <div class="mb-5">
        <h2 class="text-[22px] font-medium text-ink">Settings</h2>
      </div>

      <div class="flex flex-col gap-3">
        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Friction</h3>
          <p class="text-sm text-ink-3 mb-4 leading-relaxed">How much it takes to end a block early, turn off an active schedule, or loosen a limit. This is a commitment device, not a lock: there's always a way out, it just costs enough to make you pause.</p>

          <div class="grid grid-cols-3 gap-2 mb-4" role="radiogroup">
            {FRICTION_OPTIONS.map(o => {
              const selected = (settings.frictionLevel || 'wait') === o.value;
              return (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={selected}
                  class={`text-left p-3 cursor-pointer transition-colors ${selected ? 'border-2 border-accent bg-accent-faint p-[11px]' : 'border border-rule bg-card hover:border-ink-3'}`}
                  onClick={() => !selected && handleFrictionChange(o.value)}
                >
                  <div class="text-[13px] font-semibold text-ink">{o.label}</div>
                  <div class="text-[12px] text-ink-3 leading-snug mt-1">{o.desc}</div>
                </button>
              );
            })}
          </div>

          {settings.frictionLevel === 'passphrase' && (
            <div class="pt-4 border-t border-rule">
              <h3 class="text-[15px] font-semibold mb-1">Commitment phrase</h3>
              <p class="text-sm text-ink-3 mb-3">Your own reason, in your words. You'll type it exactly (no pasting) to override a block.</p>
              {settings.passphrase
                ? <p class="text-sm text-ink-2 mb-3">Current: <strong>“{settings.passphrase}”</strong></p>
                : <div class="callout mb-3" style="border-left-color: var(--color-warn); background: var(--color-warn-soft)">Set a phrase to turn on passphrase mode. Until then, overrides use the cooldown only.</div>}
              {settings.passphrase && (
                <p class="text-[12px] text-ink-3 mb-2">To change it you'll type your current phrase first, then wait the cooldown.</p>
              )}
              <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">
                {settings.passphrase ? 'NEW PHRASE' : 'YOUR PHRASE'}
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={newPhrase}
                  onInput={e => setNewPhrase(e.target.value)}
                  class="field flex-1"
                  placeholder="e.g. I'm building something that matters to me"
                  autocomplete="off"
                />
                <button class="btn btn-ink" onClick={savePhrase}>SAVE</button>
              </div>
            </div>
          )}

          {effectiveFriction(settings) !== 'none' && (
            <div class="mt-4 pt-4 border-t border-rule">
              <h3 class="text-[15px] font-semibold mb-2">Cooldown</h3>
              <p class="text-sm text-ink-3 mb-4 leading-relaxed">Seconds to wait before an override goes through.</p>
              <input
                type="number"
                class="field w-[100px]"
                min="5"
                max="600"
                value={settings.cooldownSeconds || 30}
                onChange={handleCooldownChange}
              />
            </div>
          )}
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Block page</h3>
          <p class="text-sm text-ink-3 mb-3 leading-relaxed">Shown when a site is blocked. Leave blank for the default.</p>
          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">MESSAGE</label>
          <textarea
            class="field h-auto py-2.5 leading-relaxed mb-3"
            rows={2}
            maxLength={280}
            value={blockMessage}
            onInput={e => setBlockMessage(e.target.value)}
            placeholder="e.g. Close the tab. Finish the chapter."
          />
          <details class="mb-3">
            <summary class="mono-cap cursor-pointer hover:text-ink">Advanced: custom CSS</summary>
            <p class="text-[12px] text-ink-3 my-2 leading-relaxed">
              Applied to the block page only. Target <span class="font-mono">#jc-blocked-page</span>, <span class="font-mono">#jc-blocked-card</span> and <span class="font-mono">#jc-blocked-message</span>.
            </p>
            <textarea
              class="field h-auto py-2.5 font-mono text-[12px]"
              rows={6}
              spellcheck={false}
              value={blockCss}
              onInput={e => setBlockCss(e.target.value)}
              placeholder={'#jc-blocked-page { background: #10131a; }\n#jc-blocked-card { border-radius: 12px; }'}
            />
          </details>
          <div class="flex items-center gap-3">
            <button class="btn btn-outline" onClick={saveBlockPage}>SAVE BLOCK PAGE</button>
            <button class="btn btn-ghost" onClick={() => window.open(chrome.runtime.getURL('/blocked.html?url=' + encodeURIComponent('https://example.com/')), '_blank')}>PREVIEW</button>
            {blockPageSaved && <span class="mono-cap text-ok">Saved</span>}
          </div>
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Time tracking</h3>
          <p class="text-sm text-ink-3 mb-3 leading-relaxed">Counts time on each site while its tab is in front and you're active. Powers the Usage tab and daily time limits. Stays on this device and is deleted after 30 days.</p>
          <label class="text-sm flex items-center gap-2 cursor-pointer text-ink-2 mb-3">
            <input type="checkbox" checked={settings.trackTime !== false} onChange={toggleTracking} />
            Track time on sites
          </label>
          <button class="btn btn-outline" onClick={handleClearUsage}>CLEAR USAGE DATA</button>
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Chrome sync</h3>
          <p class="text-sm text-ink-3 mb-4 leading-relaxed">Sync schedules, lists, and settings across your devices via your Google account. Usage data stays local.</p>
          <label class="text-sm flex items-center gap-2 cursor-pointer text-ink-2">
            <input type="checkbox" checked={settings.syncEnabled || false} onChange={handleSyncToggle} />
            Enable Chrome sync
          </label>
          {syncSize && syncSize.percent >= 100 && (
            <div class="callout mt-3" style="border-left-color: var(--color-danger); background: var(--color-danger-soft)">
              <strong>Sync quota exceeded.</strong> Your config is too large to sync ({Math.round(syncSize.bytes / 1024)}KB / 100KB). Remove some lists or sites to resume syncing.
            </div>
          )}
          {syncSize && syncSize.percent >= 75 && syncSize.percent < 100 && (
            <div class="callout mt-3" style="border-left-color: var(--color-warn); background: var(--color-warn-soft)">
              <strong>Sync storage {syncSize.percent}% full</strong> ({Math.round(syncSize.bytes / 1024)}KB / 100KB). Adding more lists or sites may exceed the limit.
            </div>
          )}
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Incognito windows</h3>
          <p class="text-sm text-ink-3 mb-3 leading-relaxed">Chrome requires you to explicitly allow extensions in incognito. Without it, incognito windows bypass your blocks.</p>
          {incognitoAllowed === true && (
            <div class="callout" style="border-left-color: var(--color-ok); background: var(--color-ok-soft)">
              <strong>Active in incognito.</strong> Your blocks apply in incognito windows too.
            </div>
          )}
          {incognitoAllowed === false && (
            <div>
              <div class="callout" style="border-left-color: var(--color-warn); background: var(--color-warn-soft)">
                <strong>Not active in incognito.</strong> Incognito windows are currently unblocked.
              </div>
              <div class="mt-3">
                <p class="text-sm text-ink-3 mb-2 leading-relaxed">Open Just Concentrate's details page and turn on <strong>"Allow in Incognito."</strong></p>
                <button class="btn btn-outline" onClick={openExtSettings}>OPEN EXTENSION SETTINGS</button>
              </div>
            </div>
          )}
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Data</h3>
          <p class="text-sm text-ink-3 mb-3 leading-relaxed">Export your settings, or import from Just Concentrate, LeechBlock NG, StayFocusd, Block Site, Cold Turkey, or a plain text list.</p>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-outline" onClick={handleExport}>EXPORT SETTINGS</button>
            <button class="btn btn-outline" onClick={() => setShowImport(true)}>IMPORT</button>
          </div>
        </div>

        <div class="bg-card border border-rule p-4">
          <h3 class="text-[15px] font-semibold mb-2">Privacy</h3>
          <p class="text-sm text-ink-3 leading-relaxed">
            Just Concentrate makes no network requests. Your schedules, lists and usage never leave this device, except your config
            (never your usage) if you turn on Chrome sync above, which goes through your own Google account. No accounts, no analytics, no tracking.
          </p>
        </div>
      </div>

      <div class="mt-4">
        <p class="text-sm text-ink-4">Just Concentrate v{chrome.runtime.getManifest ? chrome.runtime.getManifest().version : ''}</p>
      </div>

      <Modal visible={!!syncConfirm} onClose={() => setSyncConfirm(null)} title="Synced Settings Found">
        <p class="text-sm text-ink-3 mb-5">
          Found synced settings from another device. What would you like to do?
        </p>
        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" onClick={async () => {
            setSyncConfirm(null);
            await saveSettings({ syncEnabled: true });
            chrome.runtime.sendMessage({ type: 'refreshRules' });
            loadSettings();
          }}>Keep local</button>
          <button class="btn btn-ink" onClick={useSynced}>Use synced</button>
        </div>
      </Modal>

      <Modal visible={confirmClearUsage} onClose={() => setConfirmClearUsage(false)} title="Clear usage data">
        <p class="text-sm text-ink-3 mb-5">This deletes all block counts and time tracked on this device. Today's time limits start again from zero.</p>
        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" onClick={() => setConfirmClearUsage(false)}>Cancel</button>
          <button class="btn btn-danger" onClick={doClearUsage}>Clear</button>
        </div>
      </Modal>

      {frictionModal}

      <ImportModal
        visible={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => loadSettings()}
      />
    </section>
  );
}
