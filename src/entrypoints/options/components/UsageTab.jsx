import { useState, useEffect } from 'preact/hooks';
import { getUsage } from '../../../lib/storage.js';
import { Icon } from '../../../components/Icon.jsx';

export function UsageTab() {
  const [stats, setStats] = useState(null);
  const [topDistractions, setTopDistractions] = useState([]);
  const [nudges, setNudges] = useState([]);
  const [dismissedNudges, setDismissedNudges] = useState(new Set());

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage() {
    const usage = await getUsage();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let todayBlocks = 0, weekBlocks = 0, weekEscapes = 0;
    const siteCounts = {};

    for (const [key, count] of Object.entries(usage.blockCounts || {})) {
      const [domain, date] = key.split('|');
      if (date === today) todayBlocks += count;
      if (date >= weekAgo) {
        weekBlocks += count;
        siteCounts[domain] = (siteCounts[domain] || 0) + count;
      }
    }
    for (const [key, count] of Object.entries(usage.escapeCounts || {})) {
      const [, date] = key.split('|');
      if (date >= weekAgo) weekEscapes += count;
    }

    setStats({ todayBlocks, weekBlocks, weekEscapes });

    const topSites = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]);

    setTopDistractions(topSites.slice(0, 5).map(([domain, count]) => ({ domain, count })));

    const newNudges = [];

    if (topSites.length > 0 && topSites[0][1] >= 10) {
      newNudges.push({
        id: 'top-site',
        iconName: 'refresh-cw',
        text: `${topSites[0][0]} pulled you back ${topSites[0][1]} times this week. Each block is a moment you chose your priorities.`
      });
    }
    if (weekBlocks > 0 && weekEscapes === 0) {
      newNudges.push({
        id: 'no-overrides',
        iconName: 'zap',
        text: `${weekBlocks} blocks this week and zero overrides. You're building a strong focus habit.`
      });
    }
    if (weekBlocks >= 20) {
      newNudges.push({
        id: 'high-blocks',
        iconName: 'trending-up',
        text: `${weekBlocks} blocks this week. Your focused time is adding up, keep going.`
      });
    }

    setNudges(newNudges);
  }

  function dismissNudge(id) {
    setDismissedNudges(prev => new Set([...prev, id]));
  }

  if (!stats) return null;
  const { todayBlocks, weekBlocks, weekEscapes } = stats;
  const visibleNudges = nudges.filter(n => !dismissedNudges.has(n.id));

  const STAT_CARDS = [
    { val: todayBlocks, label: 'Blocks today' },
    { val: weekBlocks, label: 'Blocks this week' },
    { val: weekEscapes, label: 'Overrides this week' },
  ];

  const maxCount = topDistractions.length > 0 ? topDistractions[0].count : 0;

  return (
    <section>
      <div class="flex justify-between items-start mb-5">
        <h2 class="text-[22px] font-medium text-ink">Usage</h2>
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
        <h3 class="text-[15px] font-semibold mb-1 text-ink">Top Distractions</h3>
        <p class="text-xs text-ink-4 mb-4">Sites blocked most this week</p>
        {topDistractions.length === 0 ? (
          <div class="bg-card border border-rule text-center py-8 px-6">
            <p class="mb-2 text-ink-4 flex justify-center"><Icon name="bar-chart" size={32} /></p>
            <p class="text-sm text-ink-3">No blocks recorded yet this week.</p>
          </div>
        ) : (
          <div class="flex flex-col gap-2">
            {topDistractions.map(({ domain, count }, i) => (
              <div key={domain} class="bg-card border border-rule py-3 px-4 flex items-center gap-3">
                <span class="font-mono text-xs text-ink-4 w-5 text-right shrink-0">{i + 1}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline justify-between mb-1.5">
                    <span class="text-sm font-medium text-ink truncate">{domain}</span>
                    <span class="font-mono text-xs text-ink-3 shrink-0 ml-2">{count} {count === 1 ? 'block' : 'blocks'}</span>
                  </div>
                  <div class="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div
                      class="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${Math.max(8, (count / maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="mt-8">
        <h3 class="text-[15px] font-semibold mb-3 text-ink">Insights</h3>
        {visibleNudges.length === 0 ? (
          <div class="text-center py-12 px-6">
            <p class="mb-3 text-ink-4 flex justify-center"><Icon name="target" size={36} /></p>
            <p class="text-[16px] font-semibold mb-2 text-ink">Keep going</p>
            <p class="text-sm text-ink-3 mb-5">Insights will appear as you use Just Concentrate. They're based on your local data only.</p>
          </div>
        ) : (
          <div class="flex flex-col gap-2">
            {visibleNudges.map(n => (
              <div key={n.id} class="bg-card border border-rule py-3.5 px-4 flex items-start gap-3">
                <span class="shrink-0 text-ink-2 flex items-center">
                  <Icon name={n.iconName} size={20} />
                </span>
                <span class="text-sm leading-relaxed text-ink-2">{n.text}</span>
                <button
                  class="bg-transparent border-none text-ink-4 cursor-pointer text-[16px] ml-auto shrink-0 hover:text-ink-3"
                  onClick={() => dismissNudge(n.id)}
                  title="Dismiss"
                >&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
