import { useState } from 'preact/hooks';
import { Icon } from '../Icon.jsx';
import { PassphraseChallenge } from './PassphraseChallenge.jsx';
import { CooldownTimer } from './CooldownTimer.jsx';
import { effectiveFriction } from '../../lib/friction.js';

// The full override flow at the user's chosen friction level (D5):
//   passphrase → type the phrase, then the cooldown
//   wait       → the cooldown
//   none       → a plain confirmation
export function FrictionFlow({ settings, description, confirmLabel = 'Confirm', destructive = false, onConfirm, onCancel }) {
  const level = effectiveFriction(settings);
  const [stage, setStage] = useState(level === 'passphrase' ? 'phrase' : level === 'wait' ? 'cooldown' : 'confirm');

  if (stage === 'phrase') {
    return <PassphraseChallenge passphrase={settings.passphrase} onMatch={() => setStage('cooldown')} onCancel={onCancel} />;
  }
  if (stage === 'cooldown') {
    return (
      <CooldownTimer
        duration={settings.cooldownSeconds || 30}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
        onComplete={onConfirm}
        onCancel={onCancel}
      />
    );
  }
  return (
    <div>
      <div class="text-center text-sm text-ink-2 mb-6">{description}</div>
      <div class="flex justify-between items-center gap-3">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1" onClick={onCancel}>
          <Icon name="arrow-left" size={14} /> Cancel
        </button>
        <button class={`btn ${destructive ? 'btn-danger' : 'btn-ink'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
