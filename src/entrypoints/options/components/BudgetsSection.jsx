import { useState, useEffect } from 'preact/hooks';
import { getBudgets, saveBudget, deleteBudget, getUsage, getSettings, USAGE_KEY } from '../../../lib/storage.js';
import { getBudgetUsedSeconds, localDateKey } from '../../../lib/schedule-engine.js';
import { normalizeDomain } from '../../../lib/formatting.js';
import { isBudgetWeakened } from '../../../lib/friction.js';
import { formatDuration } from '../../../lib/tracking.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';
import { Icon } from '../../../components/Icon.jsx';

const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

// Daily time limits: "15 minutes of reddit.com a day", any time of day.
// Once used up, the site is blocked until midnight.
export function BudgetsSection() {
  const [budgets, setBudgets] = useState([]);
  const [siteTime, setSiteTime] = useState({});
  const [trackTime, setTrackTime] = useState(true);
  const [domain, setDomain] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [error, setError] = useState('');
  const { gate, frictionModal } = useFrictionGate();

  async function refresh() {
    const [b, u, s] = await Promise.all([getBudgets(), getUsage(), getSettings()]);
    setBudgets(b);
    setSiteTime(u.siteTime);
    setTrackTime(s.trackTime !== false);
  }

  useEffect(() => {
    refresh();
    const onChange = changes => { if (changes.justConcentrate || changes[USAGE_KEY]) refresh(); };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  async function add() {
    const d = normalizeDomain(domain);
    if (!d) { setError('Enter a domain, e.g. reddit.com'); return; }
    if (budgets.some(b => b.domain === d)) { setError(`${d} already has a limit.`); return; }
    await saveBudget({ domain: d, minutes: Number(minutes), enabled: true });
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    setDomain('');
    setError('');
  }

  function update(budget, changes) {
    const next = { ...budget, ...changes };
    const doSave = async () => {
      await saveBudget(next);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
    };
    if (isBudgetWeakened(budget, next)) {
      gate({ title: 'Loosen a daily limit', description: `This gives you more time on ${budget.domain} today.`, confirmLabel: 'Save' }, doSave);
    } else {
      doSave();
    }
  }

  function remove(budget) {
    const doDelete = async () => {
      await deleteBudget(budget.id);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
    };
    if (budget.enabled) {
      gate({ title: 'Remove a daily limit', description: `This removes the ${budget.minutes}-minute limit on ${budget.domain}.`, confirmLabel: 'Remove', destructive: true }, doDelete);
    } else {
      doDelete();
    }
  }

  const today = localDateKey();

  return (
    <div class="mt-10">
      <div class="flex items-center gap-2 mb-1">
        <h3 class="text-[17px] font-medium text-ink">Daily time limits</h3>
      </div>
      <p class="text-sm text-ink-3 mb-4">Allow a site for a set amount of time each day, whenever you like. Once it's used up, the site is blocked until midnight.</p>

      {!trackTime && (
        <div class="callout mb-4" style="border-left-color: var(--color-warn); background: var(--color-warn-soft)">
          Time tracking is off in Settings, so limits can't count down.
        </div>
      )}

      {budgets.length > 0 && (
        <div class="flex flex-col gap-2 mb-4">
          {budgets.map(b => {
            const used = getBudgetUsedSeconds(siteTime, b.domain, today);
            const pct = Math.min(100, (used / (b.minutes * 60)) * 100);
            const exhausted = b.enabled && pct >= 100;
            return (
              <div key={b.id} class={`bg-card border border-rule p-4 flex items-center gap-4 ${b.enabled ? 'border-l-2 border-l-accent' : ''}`}>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline justify-between mb-1.5 gap-2">
                    <span class={`text-sm font-semibold truncate ${b.enabled ? 'text-ink' : 'text-ink-3'}`}>{b.domain}</span>
                    <span class="font-mono text-xs text-ink-3 shrink-0">
                      {exhausted ? 'USED UP · BACK AT MIDNIGHT' : `${formatDuration(used)} / ${b.minutes}m today`}
                    </span>
                  </div>
                  <div class="h-1.5 bg-rule-2 overflow-hidden">
                    <div class={`h-full ${exhausted ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <select class="field w-[88px] h-8 py-0" value={b.minutes} onChange={e => update(b, { minutes: Number(e.target.value) })}>
                  {[...new Set([...MINUTE_OPTIONS, b.minutes])].sort((x, y) => x - y).map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
                <label class="toggle shrink-0">
                  <input type="checkbox" checked={b.enabled} onChange={e => update(b, { enabled: e.target.checked })} />
                  <span class="toggle-slider" />
                </label>
                <button class="icon-btn" onClick={() => remove(b)} title="Remove"><Icon name="trash" size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div class="flex gap-2">
        <input
          type="text"
          class="field flex-1"
          placeholder="e.g. reddit.com"
          value={domain}
          onInput={e => { setDomain(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <select class="field w-[110px]" value={minutes} onChange={e => setMinutes(e.target.value)}>
          {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m} min/day</option>)}
        </select>
        <button class="btn btn-outline" onClick={add}>+ ADD LIMIT</button>
      </div>
      {error && <p class="text-[12px] text-danger mt-2">{error}</p>}
      {frictionModal}
    </div>
  );
}
