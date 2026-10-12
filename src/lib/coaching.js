// Rule-based, fully local coaching (D9): each insight is a threshold on a
// local counter plus a pre-written template. Wins lead; nothing shames.
import { localDateKey } from './schedule-engine.js';
import { domainMatches } from './matching.js';
import { formatDuration } from './tracking.js';

function lastNDays(n, now) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(localDateKey(d));
  }
  return days;
}

const parseKey = key => {
  const sep = key.lastIndexOf('|');
  return [key.slice(0, sep), key.slice(sep + 1)];
};

// Aggregate usage for the last 7 days (including today).
export function summarizeUsage(usage, now = new Date()) {
  const week = new Set(lastNDays(7, now));
  const today = localDateKey(now);
  const blocksBySite = {};
  const timeBySite = {};
  let todayBlocks = 0, weekBlocks = 0, weekEscapes = 0, todaySeconds = 0, weekSeconds = 0;

  for (const [key, count] of Object.entries(usage.blockCounts || {})) {
    const [domain, date] = parseKey(key);
    if (date === today) todayBlocks += count;
    if (week.has(date)) { weekBlocks += count; blocksBySite[domain] = (blocksBySite[domain] || 0) + count; }
  }
  for (const [key, count] of Object.entries(usage.escapeCounts || {})) {
    if (week.has(parseKey(key)[1])) weekEscapes += count;
  }
  for (const [key, seconds] of Object.entries(usage.siteTime || {})) {
    const [host, date] = parseKey(key);
    if (date === today) todaySeconds += seconds;
    if (week.has(date)) { weekSeconds += seconds; timeBySite[host] = (timeBySite[host] || 0) + seconds; }
  }
  const sortDesc = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return {
    todayBlocks, weekBlocks, weekEscapes, todaySeconds, weekSeconds,
    topBlocked: sortDesc(blocksBySite).map(([domain, count]) => ({ domain, count })),
    topTime: sortDesc(timeBySite).map(([domain, seconds]) => ({ domain, seconds }))
  };
}

// Is this host already covered by a schedule entry or a budget?
function isCovered(host, config) {
  const { schedules = [], lists = [], budgets = [] } = config;
  const domains = new Set(budgets.map(b => b.domain));
  for (const s of schedules) for (const site of s.adHocSites || []) domains.add(site);
  for (const l of lists) for (const site of l.sites) domains.add(site);
  return [...domains].some(d => !d.includes('/') && !d.startsWith('keyword:') && domainMatches(host, d));
}

// Returns [{ id, icon, text, action? }]. action = { label, budget: { domain, minutes } }.
export function buildInsights(usage, config, now = new Date()) {
  const summary = summarizeUsage(usage, now);
  const insights = [];
  const week = lastNDays(7, now);

  // Win: kept daily limits.
  for (const budget of (config.budgets || []).filter(b => b.enabled)) {
    let kept = 0, tracked = 0;
    for (const date of week.slice(1)) { // completed days only
      let used = 0;
      let anyTracking = false;
      for (const [key, seconds] of Object.entries(usage.siteTime || {})) {
        const [host, d] = parseKey(key);
        if (d !== date) continue;
        anyTracking = true;
        if (domainMatches(host, budget.domain)) used += seconds;
      }
      if (!anyTracking) continue; // no data that day (browser closed or tracking off)
      tracked++;
      if (used < budget.minutes * 60) kept++;
    }
    if (kept >= 3) {
      insights.push({ id: `budget-kept-${budget.id}`, icon: 'check', text: `You stayed within your ${budget.minutes}-minute ${budget.domain} limit on ${kept} of the last ${tracked} days.` });
    }
  }

  if (summary.weekBlocks > 0 && summary.weekEscapes === 0) {
    insights.push({ id: 'no-overrides', icon: 'zap', text: `${summary.weekBlocks} blocks this week and zero overrides. You're building a strong focus habit.` });
  }

  const top = summary.topBlocked[0];
  if (top && top.count >= 10) {
    insights.push({ id: 'top-site', icon: 'refresh-cw', text: `${top.domain} pulled you back ${top.count} times this week. Each block is a moment you chose your priorities.` });
  }

  // Suggest a pause: lots of time on a site that isn't blocked or limited yet.
  const heavy = summary.topTime.find(t => t.seconds >= 3 * 3600 && !isCovered(t.domain, config));
  if (heavy) {
    insights.push({
      id: `suggest-limit-${heavy.domain}`,
      icon: 'clock',
      text: `You spent ${formatDuration(heavy.seconds)} on ${heavy.domain} this week. Want to give it a daily limit?`,
      action: { label: 'Add 30 min/day limit', budget: { domain: heavy.domain, minutes: 30 } }
    });
  }

  if (summary.weekBlocks >= 20) {
    insights.push({ id: 'high-blocks', icon: 'trending-up', text: `${summary.weekBlocks} blocks this week. Your focused time is adding up, keep going.` });
  }

  return insights;
}
