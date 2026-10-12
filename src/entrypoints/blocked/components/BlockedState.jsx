import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { useCountdown, formatHMS } from '../../../hooks/useCountdown.js';
import { getSchedules } from '../../../lib/storage.js';
import { formatDaysLabel, formatTimeLabel, formatEntry } from '../../../lib/formatting.js';

const timeRange = s => (s.startTime === '00:00' && s.endTime === '23:59' ? 'ALL DAY' : `${formatTimeLabel(s.startTime)}–${formatTimeLabel(s.endTime)}`);

// The block moment (§6.3): names what caught you, shows when it lifts, and
// reminds you that you set this. Calm, no shaming.
export function BlockedState({ url, host, match, message, onEndEarly, onKeepBlocked }) {
  const [schedule, setSchedule] = useState(null);
  const remaining = useCountdown(match.endTime);

  useEffect(() => {
    if (match.source.kind !== 'schedule') return;
    getSchedules().then(list => setSchedule(list.find(s => s.id === match.source.id) || null));
  }, [match]);

  // Once the block has lifted, go back to the page that was blocked.
  const expired = match.endTime && remaining <= 0;
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => { window.location.href = url; }, 1500);
    return () => clearTimeout(t);
  }, [expired, url]);

  const detail = schedule
    ? `${formatDaysLabel(schedule.days)} · ${timeRange(schedule)}`
    : match.entry && match.entry !== host ? `Matched ${formatEntry(match.entry)}` : '';

  return (
    <div class="text-center">
      <div class="flex justify-center mb-4">
        <div class="w-12 h-12 border border-rule flex items-center justify-center text-ink-2">
          <Icon name="shield-check" size={24} />
        </div>
      </div>
      <div class="text-xl font-semibold text-ink mb-1 break-all">{host}</div>
      <div class="mono-cap mb-1">{match.label}</div>
      {detail && <div class="mono-cap mb-6">{detail}</div>}
      <div class="mono-cap mb-1 mt-6">Back in</div>
      <div class="font-mono text-4xl font-semibold text-ink mb-6">{formatHMS(remaining)}</div>
      <p class="text-sm text-ink-3 mb-8 leading-relaxed" id="jc-blocked-message">
        {message || 'You set this block to protect your focus. It lifts on its own — nothing to do but get back to what matters.'}
      </p>
      <div class="flex flex-col items-center gap-3">
        <button class="btn btn-ink" onClick={onKeepBlocked}>
          <Icon name="arrow-left" size={16} /> Keep me focused
        </button>
        <button class="btn btn-warn" onClick={onEndEarly}>
          End block early <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </div>
  );
}
