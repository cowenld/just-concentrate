import { useState, useEffect } from 'preact/hooks';
import { sendMessage } from '../../hooks/useMessage.js';
import { getSettings, deleteSchedule } from '../../lib/storage.js';
import { Icon } from '../../components/Icon.jsx';
import { BlockedState } from './components/BlockedState.jsx';
import { PassphraseChallenge } from './components/PassphraseChallenge.jsx';
import { CooldownTimer } from './components/CooldownTimer.jsx';

function EndedConfirmation({ scheduleName, deleted }) {
  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6">
      <div class="max-w-[480px] w-full bg-card border border-ink p-8 text-center">
        <div class="flex justify-center mb-4 text-accent">
          <div class="w-12 h-12 border border-rule flex items-center justify-center">
            <Icon name="check" size={24} />
          </div>
        </div>
        <div class="text-xl font-semibold text-ink mb-2">
          {deleted ? 'Schedule deleted' : 'Block ended'}
        </div>
        <p class="text-sm text-ink-3 mb-6">
          {deleted
            ? `The "${scheduleName}" schedule has been deleted.`
            : `The "${scheduleName}" block has been ended early. It will resume at its next scheduled window.`
          }
        </p>
        <button class="btn btn-ink" onClick={() => {
          chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
        }}>
          <Icon name="check" size={16} /> Done
        </button>
      </div>
    </div>
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain') || 'this site';
  const scheduleName = params.get('schedule') || 'your schedule';
  const action = params.get('action');
  const scheduleId = params.get('scheduleId');

  const [view, setView] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getSettings().then(s => {
      const loaded = s || {};
      setSettings(loaded);
      if (action === 'endFocus' || action === 'deleteSchedule') {
        const hasPassphrase = loaded.passphrase && loaded.passphrase.length > 0;
        const friction = loaded.frictionLevel || 'passphrase';
        setView(hasPassphrase && friction === 'passphrase' ? 'passphrase' : 'cooldown');
      } else {
        setView('blocked');
      }
    });
  }, [action]);

  if (!settings || !view) {
    return (
      <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6">
        <div class="max-w-[480px] w-full bg-card border border-ink p-8 text-center">
          <div class="font-mono text-sm text-ink-3">Loading…</div>
        </div>
      </div>
    );
  }

  function handleEndEarly() {
    const hasPassphrase = settings.passphrase && settings.passphrase.length > 0;
    const friction = settings.frictionLevel || 'passphrase';

    if (hasPassphrase && friction === 'passphrase') {
      setView('passphrase');
    } else {
      setView('cooldown');
    }
  }

  function handlePassphraseMatch() {
    setView('cooldown');
  }

  async function handleCooldownComplete() {
    if (action === 'deleteSchedule' && scheduleId) {
      await deleteSchedule(scheduleId);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
      setView('deleted');
    } else {
      await sendMessage('endBlockEarly', { domain });
      setView('ended');
    }
  }

  function handleCancel() {
    if (action === 'endFocus' || action === 'deleteSchedule') {
      chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
    } else {
      setView('blocked');
    }
  }

  const cooldownDesc = action === 'deleteSchedule'
    ? `This will permanently delete the "${scheduleName}" schedule.`
    : `This will end the "${scheduleName}" block until its next scheduled window.`;

  switch (view) {
    case 'blocked':
      return <BlockedState domain={domain} scheduleName={scheduleName} onEndEarly={handleEndEarly} />;
    case 'passphrase':
      return <PassphraseChallenge passphrase={settings.passphrase} onMatch={handlePassphraseMatch} onCancel={handleCancel} />;
    case 'cooldown':
      return <CooldownTimer duration={settings.cooldownSeconds || 30} description={cooldownDesc} onComplete={handleCooldownComplete} onCancel={handleCancel} destructive={action === 'deleteSchedule'} />;
    case 'ended':
      return <EndedConfirmation scheduleName={scheduleName} deleted={false} />;
    case 'deleted':
      return <EndedConfirmation scheduleName={scheduleName} deleted />;
    default:
      return null;
  }
}
