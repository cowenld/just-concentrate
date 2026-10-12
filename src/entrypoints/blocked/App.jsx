import { useState, useEffect } from 'preact/hooks';
import { sendMessage } from '../../hooks/useMessage.js';
import { getSettings } from '../../lib/storage.js';
import { Icon } from '../../components/Icon.jsx';
import { FrictionFlow } from '../../components/friction/FrictionFlow.jsx';
import { BlockedState } from './components/BlockedState.jsx';

// Reads the blocked URL from ?url=. Older tabs may still carry the v0.1
// ?domain= parameter.
function readTarget(params) {
  const url = params.get('url');
  if (url) return url;
  const domain = params.get('domain');
  return domain ? `https://${domain}/` : null;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'this site'; }
}

function closeTab() {
  chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
}

// "Keep me focused": leave for a fresh tab rather than closing the window.
function leaveToNewTab() {
  chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.update(tab.id, { url: 'chrome://newtab/' }); });
}

function Page({ children, settings }) {
  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6" id="jc-blocked-page">
      {settings && settings.blockPageCss && <style>{settings.blockPageCss}</style>}
      <div class="max-w-[480px] w-full bg-card border border-ink p-8" id="jc-blocked-card">{children}</div>
    </div>
  );
}

function Done({ title, message, url }) {
  return (
    <div class="text-center">
      <div class="flex justify-center mb-4 text-accent">
        <div class="w-12 h-12 border border-rule flex items-center justify-center">
          <Icon name="check" size={24} />
        </div>
      </div>
      <div class="text-xl font-semibold text-ink mb-2">{title}</div>
      <p class="text-sm text-ink-3 mb-6">{message}</p>
      <div class="flex justify-center gap-3">
        {url
          ? <button class="btn btn-ink" onClick={() => { window.location.href = url; }}>Continue to {hostOf(url)} <Icon name="arrow-right" size={14} /></button>
          : <button class="btn btn-ink" onClick={closeTab}><Icon name="check" size={16} /> Done</button>}
      </div>
    </div>
  );
}

function endEarlyCopy(match, host) {
  if (!match) return '';
  if (match.source.kind === 'budget') return `This lifts today's time limit for ${host}. It resets at midnight.`;
  if (match.source.kind === 'focus') return 'This ends your focus session now.';
  return `This ends the “${match.label}” block for now. It comes back at its next scheduled window.`;
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const url = readTarget(params);
  const host = url ? hostOf(url) : 'this site';

  const [settings, setSettings] = useState(null);
  const [match, setMatch] = useState(undefined); // undefined = loading, null = not blocked
  const [view, setView] = useState(action === 'endFocus' ? 'endFocus' : 'blocked');

  useEffect(() => {
    getSettings().then(setSettings);
    if (action === 'endFocus' || !url) { setMatch(null); return; }
    sendMessage('getBlockInfo', { url }).then(resp => setMatch((resp && resp.match) || null));
  }, [action, url]);

  if (!settings || match === undefined) {
    return <Page><div class="font-mono text-sm text-ink-3 text-center">Loading…</div></Page>;
  }

  if (view === 'endFocus') {
    return (
      <Page settings={settings}>
        <FrictionFlow
          settings={settings}
          description="This ends your focus session now."
          confirmLabel="End session"
          onCancel={closeTab}
          onConfirm={async () => { await sendMessage('endFocus'); setView('focusEnded'); }}
        />
      </Page>
    );
  }
  if (view === 'focusEnded') {
    return <Page settings={settings}><Done title="Focus session ended" message="Nice work getting started. You can begin another from the toolbar." /></Page>;
  }
  if (view === 'ended') {
    return <Page settings={settings}><Done title="Block ended" message={endEarlyCopy(match, host)} url={url} /></Page>;
  }
  if (!match) {
    return (
      <Page settings={settings}>
        <Done title={`${host} isn't blocked right now`} message="The block has lifted." url={url} />
      </Page>
    );
  }
  if (view === 'friction') {
    return (
      <Page settings={settings}>
        <FrictionFlow
          settings={settings}
          description={endEarlyCopy(match, host)}
          confirmLabel="End block"
          onCancel={() => setView('blocked')}
          onConfirm={async () => { await sendMessage('endBlockEarly', { url }); setView('ended'); }}
        />
      </Page>
    );
  }
  return (
    <Page settings={settings}>
      <BlockedState
        url={url}
        host={host}
        match={match}
        message={settings.blockPageMessage}
        onEndEarly={() => setView('friction')}
        onKeepBlocked={leaveToNewTab}
      />
    </Page>
  );
}
