import { useState, useEffect } from 'preact/hooks';
import { getUsage, getData, saveBudget, getDismissedInsights, dismissInsight, USAGE_KEY } from '../../../lib/storage.js';
import { summarizeUsage, buildInsights } from '../../../lib/coaching.js';
import { formatDuration } from '../../../lib/tracking.js';
import { Icon } from '../../../components/Icon.jsx';

function BarList({ items, valueOf, labelOf, empty }) {
  if (items.length === 0) {
    return (
      <div class="bg-card border border-rule text-center py-8 px-6">
        <p class="mb-2 text-ink-4 flex justify-center"><Icon name="bar-chart" size={32} /></p>
        <p class="text-sm text-ink-3">{empty}</p>
      </div>
    );
  }
  const max = valueOf(items[0]) || 1;
  return (
    <div class="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={item.domain} class="bg-card border border-rule py-3 px-4 flex items-center gap-3">
          <span class="font-mono text-xs text-ink-4 w-5 text-right shrink-0">{i + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between mb-1.5">
              <span class="text-sm font-medium text-ink truncate">{item.domain}</span>
              <span class="font-mono text-xs text-ink-3 shrink-0 ml-2">{labelOf(item)}</span>
            </div>
            <div class="h-1.5 bg-rule-2 overflow-hidden">
              <div class="h-full bg-accent transition-all" style={{ width: `${Math.max(4, (valueOf(item) / max) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsageTab() {
  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [trackTime, setTrackTime] = useState(true);

  async function load() {
    const [usage, data, dismissedIds] = await Promise.all([getUsage(), getData(), getDismissedInsights()]);
    setSummary(summarizeUsage(usage));
    setInsights(buildInsights(usage, data));
    setDismissed(dismissedIds);
    setTrackTime(data.settings.trackTime !== false);
  }

  useEffect(() => {
    load();
    const onChange = changes => { if (changes[USAGE_KEY] || changes.justConcentrate) load(); };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  async function dismiss(id) {
    await dismissInsight(id);
    setDismissed(d => [...d, id]);
  }

  async function runAction(insight) {
    await saveBudget({ ...insight.action.budget, enabled: true });
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    await dismiss(insight.id);
  }

  if (!summary) return null;
  const visible = insights.filter(n => !dismissed.includes(n.id));

  const STAT_CARDS = [
    { val: summary.todayBlocks, label: 'Blocks today' },
    { val: summary.weekBlocks, label: 'Blocks this week' },
    { val: summary.weekEscapes, label: 'Overrides this week' },
    { val: trackTime ? formatDuration(summary.todaySeconds) : 'Off', label: 'Browsing today' },
  ];

  return (
    <section>
      <div class="flex justify-between items-start mb-5">
        <h2 class="text-[22px] font-medium text-ink">Usage</h2>
        <span class="mono-cap mt-2">Stored on this device only</span>
      </div>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {STAT_CARDS.map(({ val, label }) => (
          <div key={label} class="bg-card border border-rule p-5 text-center">
            <div class="font-mono text-[28px] font-semibold text-accent mb-1">{val}</div>
            <div class="mono-cap">{label}</div>
          </div>
        ))}
      </div>

      <div class="mt-8">
        <h3 class="text-[15px] font-semibold mb-3 text-ink">Insights</h3>
        {visible.length === 0 ? (
          <div class="bg-card border border-rule text-center py-8 px-6">
            <p class="mb-3 text-ink-4 flex justify-center"><Icon name="target" size={32} /></p>
            <p class="text-sm text-ink-3">Insights appear as you use Just Concentrate. They're worked out from your local data only.</p>
          </div>
        ) : (
          <div class="flex flex-col gap-2">
            {visible.map(n => (
              <div key={n.id} class="bg-card border border-rule py-3.5 px-4 flex items-start gap-3">
                <span class="shrink-0 text-ink-2 flex items-center"><Icon name={n.icon} size={20} /></span>
                <div class="flex-1">
                  <span class="text-sm leading-relaxed text-ink-2">{n.text}</span>
                  {n.action && (
                    <div class="mt-2">
                      <button class="btn btn-outline h-8 px-3 text-[10.5px]" onClick={() => runAction(n)}>{n.action.label}</button>
                    </div>
                  )}
                </div>
                <button
                  class="bg-transparent border-none text-ink-4 cursor-pointer text-[16px] ml-auto shrink-0 hover:text-ink-3"
                  onClick={() => dismiss(n.id)}
                  title="Dismiss"
                >&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="mt-8">
        <h3 class="text-[15px] font-semibold mb-1 text-ink">Where your time went</h3>
        <p class="text-xs text-ink-4 mb-4">Time with the tab in front, last 7 days</p>
        <BarList
          items={summary.topTime.slice(0, 8)}
          valueOf={i => i.seconds}
          labelOf={i => formatDuration(i.seconds)}
          empty={trackTime ? 'No time tracked yet this week.' : 'Time tracking is off in Settings.'}
        />
      </div>

      <div class="mt-8">
        <h3 class="text-[15px] font-semibold mb-1 text-ink">Top distractions</h3>
        <p class="text-xs text-ink-4 mb-4">Sites blocked most, last 7 days</p>
        <BarList
          items={summary.topBlocked.slice(0, 5)}
          valueOf={i => i.count}
          labelOf={i => `${i.count} ${i.count === 1 ? 'block' : 'blocks'}`}
          empty="No blocks recorded yet this week."
        />
      </div>
    </section>
  );
}
