import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { formatCooldownMMSS } from '../../../hooks/useCountdown.js';

export function CooldownTimer({ duration, description, onComplete, onCancel, destructive }) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef(null);
  const done = remaining <= 0;
  const pct = Math.round(((duration - remaining) / duration) * 100);

  useEffect(() => {
    setRemaining(duration);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [duration]);

  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6">
      <div class="max-w-[480px] w-full bg-card border border-ink p-8">
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
        <div class="flex justify-between items-center">
          <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1" onClick={() => { clearInterval(intervalRef.current); onCancel(); }}>
            <Icon name="arrow-left" size={16} /> Cancel
          </button>
          <button class={`btn ${destructive ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-ink'}`} disabled={!done} onClick={onComplete}>
            {done ? 'CONFIRM' : `CONFIRM IN ${remaining}S`}
          </button>
        </div>
      </div>
    </div>
  );
}
