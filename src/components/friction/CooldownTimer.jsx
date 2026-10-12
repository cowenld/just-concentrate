import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../Icon.jsx';
import { formatCooldownMMSS } from '../../hooks/useCountdown.js';

// The cooling-off pause (§6.3): states what will turn off, and offers a way
// back while it counts down. The pause is where people reconsider.
export function CooldownTimer({ duration, description, confirmLabel = 'Confirm', onComplete, onCancel, destructive }) {
  const [endsAt] = useState(() => Date.now() + duration * 1000);
  const [remaining, setRemaining] = useState(duration);
  const done = remaining <= 0;
  const pct = Math.round(((duration - remaining) / duration) * 100);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, done]);

  return (
    <div>
      <div class="flex justify-center mb-4">
        <div class="w-12 h-12 border border-rule flex items-center justify-center text-ink-2">
          <Icon name="clock" size={24} />
        </div>
      </div>
      <div class="text-center font-mono text-4xl font-semibold text-ink mb-4">
        {formatCooldownMMSS(remaining)}
      </div>
      <div class="h-1.5 bg-rule-2 mb-4">
        <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div class="text-center text-sm text-ink-3 mb-6">{description}</div>
      <div class="flex justify-between items-center gap-3">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1" onClick={onCancel}>
          <Icon name="arrow-left" size={14} /> Keep me focused
        </button>
        <button class={`btn ${destructive ? 'btn-danger' : 'btn-ink'}`} disabled={!done} onClick={onComplete}>
          {done ? confirmLabel : `${confirmLabel} in ${remaining}s`}
        </button>
      </div>
    </div>
  );
}
