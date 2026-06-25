import { useState, useEffect } from 'preact/hooks';
import { getSettings, saveSettings, exportData, applySyncedConfig, getData, getSyncPayloadSize } from '../../../lib/storage.js';
import { Modal } from '../../../components/Modal.jsx';
import { ImportModal } from './ImportModal.jsx';

export function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [verifyPhrase, setVerifyPhrase] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [incognitoAllowed, setIncognitoAllowed] = useState(null);
  const [syncConfirm, setSyncConfirm] = useState(null);
  const [syncSize, setSyncSize] = useState(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadSettings();
    checkIncognito();
  }, []);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
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

  async function savePhrase() {
    if (!newPhrase.trim()) return;
    if (settings.passphrase) {
      if (verifyPhrase !== settings.passphrase) {
        alert("Current phrase doesn't match. Type your existing phrase to change it.");
        return;
      }
    }
    await saveSettings({ passphrase: newPhrase.trim() });
    setVerifyPhrase('');
    setNewPhrase('');
    loadSettings();
  }

  async function handleFrictionChange(e) {
    await saveSettings({ frictionLevel: e.target.value });
    loadSettings();
  }

  async function handleCooldownChange(e) {
    await saveSettings({ cooldownSeconds: parseInt(e.target.value) || 30 });
  }

  async function handleSyncToggle(e) {
    const enabled = e.target.checked;
    if (!enabled) {
      await saveSettings({ syncEnabled: false });
      loadSettings();
      return;
    }
    let remote = null;
    try {
      remote = (await chrome.storage.sync.get('justConcentrateSync')).justConcentrateSync;
    } catch { /* sync unavailable */ }

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
          <h3 class="text-[15px] font-semibold mb-2">Friction, passphrase {"&"} cooldown</h3>
          <p class="text-sm text-ink-3 mb-4 leading-relaxed">To override a block you'll either type your commitment phrase or wait out a cooldown timer.</p>

          <div class="flex items-center gap-3 mb-4">
            <label class="toggle">
              <input type="checkbox"
                checked={(settings.frictionLevel || 'passphrase') === 'passphrase'}
                onChange={e => handleFrictionChange({ target: { value: e.target.checked ? 'passphrase' : 'wait' } })}
              />
              <span class="toggle-slider" />
            </label>
            <div>
              <div class="text-[13px] font-medium text-ink">
                {(settings.frictionLevel || 'passphrase') === 'passphrase' ? 'Passphrase mode' : 'Timer only'}
              </div>
              <div class="text-[12px] text-ink-3">
                {(settings.frictionLevel || 'passphrase') === 'passphrase'
                  ? 'Type your phrase, then wait the cooldown'
                  : 'Just wait the cooldown timer'}
              </div>
            </div>
          </div>

          {(settings.frictionLevel === 'passphrase' || (!settings.frictionLevel)) && (
            <div class="pt-4 border-t border-rule">
              <h3 class="text-[15px] font-semibold mb-2">Commitment phrase</h3>
              <p class="text-sm text-ink-3 mb-2">Current: <strong>{settings.passphrase}</strong></p>
              {settings.passphrase && (
                <div class="mb-2">
                  <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">TYPE YOUR CURRENT PHRASE FIRST</label>
                  <input
                    type="text"
                    value={verifyPhrase}
                    onInput={e => setVerifyPhrase(e.target.value)}
                    class="field"
                    autocomplete="off"
                  />
                </div>
              )}
              <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">
                NEW PHRASE
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={newPhrase}
                  onInput={e => setNewPhrase(e.target.value)}
                  class="field flex-1"
                  placeholder="e.g. I'm building something important"
                  autocomplete="off"
                />
                <button class="btn btn-ink" onClick={savePhrase}>SAVE</button>
              </div>
            </div>
          )}

          <div class="mt-4 pt-4 border-t border-rule">
            <h3 class="text-[15px] font-semibold mb-2">Cooldown</h3>
            <p class="text-sm text-ink-3 mb-4 leading-relaxed">Seconds to wait before an override goes through.</p>
            <input
              type="number"
              class="field w-[100px]"
              min="5"
              max="120"
              value={settings.cooldownSeconds || 30}
              onChange={handleCooldownChange}
            />
          </div>
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
              <strong>Sync quota exceeded.</strong> Your config is too large to sync ({Math.round(syncSize.bytes / 1024)}KB / 8KB). Remove some lists or sites to resume syncing.
            </div>
          )}
          {syncSize && syncSize.percent >= 75 && syncSize.percent < 100 && (
            <div class="callout mt-3" style="border-left-color: var(--color-warn); background: var(--color-warn-soft)">
              <strong>Sync storage {syncSize.percent}% full</strong> ({Math.round(syncSize.bytes / 1024)}KB / 8KB). Adding more lists or sites may exceed the limit.
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
          <p class="text-sm text-ink-3 mb-3 leading-relaxed">Export your settings, or import from Just Concentrate, LeechBlock NG, Block Site, Cold Turkey, or a plain text list.</p>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-outline" onClick={handleExport}>EXPORT SETTINGS</button>
            <button class="btn btn-outline" onClick={() => setShowImport(true)}>IMPORT</button>
          </div>
        </div>
      </div>

      <div class="mt-4">
        <p class="text-sm text-ink-4">Just Concentrate v0.1.0</p>
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
          <button class="btn btn-ink" onClick={async () => {
            await applySyncedConfig(syncConfirm, true);
            setSyncConfirm(null);
            await saveSettings({ syncEnabled: true });
            chrome.runtime.sendMessage({ type: 'refreshRules' });
            loadSettings();
          }}>Use synced</button>
        </div>
      </Modal>

      <ImportModal
        visible={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => loadSettings()}
      />
    </section>
  );
}
