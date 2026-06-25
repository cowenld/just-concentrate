import { useState } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';

export function PassphraseChallenge({ passphrase, onMatch, onCancel }) {
  const [typed, setTyped] = useState('');
  const progress = Math.min(typed.length / passphrase.length, 1);
  const pct = Math.round(progress * 100);
  const isMatch = typed === passphrase;
  const hint = pct >= 100 ? (isMatch ? 'MATCH!' : 'NOT QUITE...') : 'KEEP TYPING...';

  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6">
      <div class="max-w-[480px] w-full bg-card border border-ink p-8">
        <div class="flex justify-center mb-4">
          <div class="w-12 h-12 border border-rule flex items-center justify-center text-ink-2">
            <Icon name="lock" size={24} />
          </div>
        </div>
        <div class="text-center text-xl font-semibold text-ink mb-2">Type your commitment phrase</div>
        <div class="text-center text-sm text-ink-3 mb-6">"{passphrase}"</div>
        <input
          type="text"
          class="field mb-3"
          value={typed}
          onInput={e => setTyped(e.target.value)}
          onPaste={e => e.preventDefault()}
          placeholder="Type your phrase..."
          autofocus
        />
        <div class="h-1.5 bg-rule-2 mb-2">
          <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div class="flex justify-between items-center mb-6">
          <span class="mono-cap">{pct}% MATCHED</span>
          <span class="mono-cap">{hint}</span>
        </div>
        <div class="flex justify-between items-center">
          <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0" onClick={onCancel}>
            <Icon name="arrow-left" size={16} /> Cancel
          </button>
          <button class="btn btn-ink" disabled={!isMatch} onClick={onMatch}>Continue</button>
        </div>
      </div>
    </div>
  );
}
