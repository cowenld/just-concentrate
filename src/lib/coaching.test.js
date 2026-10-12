import { describe, it, expect } from 'vitest';
import { summarizeUsage, buildInsights } from './coaching.js';

const now = new Date(2024, 0, 10, 12, 0); // Wed 10 Jan

describe('summarizeUsage', () => {
  it('aggregates today and the last 7 days', () => {
    const usage = {
      blockCounts: { 'reddit.com|2024-01-10': 3, 'reddit.com|2024-01-05': 2, 'x.com|2024-01-01': 9 },
      escapeCounts: { 'reddit.com|2024-01-09': 1 },
      siteTime: { 'youtube.com|2024-01-10': 600, 'youtube.com|2024-01-08': 1200, 'old.com|2023-12-01': 50 }
    };
    const s = summarizeUsage(usage, now);
    expect(s).toMatchObject({ todayBlocks: 3, weekBlocks: 5, weekEscapes: 1, todaySeconds: 600, weekSeconds: 1800 });
    expect(s.topBlocked).toEqual([{ domain: 'reddit.com', count: 5 }]);
    expect(s.topTime).toEqual([{ domain: 'youtube.com', seconds: 1800 }]);
  });
});

describe('buildInsights', () => {
  it('leads with wins and suggests a limit for heavy unblocked sites', () => {
    const siteTime = {};
    for (const d of ['04', '05', '06', '07', '08', '09']) siteTime[`reddit.com|2024-01-${d}`] = 300;
    siteTime['youtube.com|2024-01-09'] = 4 * 3600;
    const usage = { blockCounts: { 'x.com|2024-01-10': 2 }, escapeCounts: {}, siteTime };
    const config = { schedules: [], lists: [], budgets: [{ id: 'b', domain: 'reddit.com', minutes: 10, enabled: true }] };
    const ids = buildInsights(usage, config, now).map(i => i.id);
    expect(ids).toEqual(['budget-kept-b', 'no-overrides', 'suggest-limit-youtube.com']);
    const suggestion = buildInsights(usage, config, now).find(i => i.action);
    expect(suggestion.action.budget).toEqual({ domain: 'youtube.com', minutes: 30 });
  });

  it("doesn't suggest limits for sites already blocked", () => {
    const usage = { blockCounts: {}, escapeCounts: {}, siteTime: { 'www.youtube.com|2024-01-09': 4 * 3600 } };
    const config = { schedules: [], lists: [{ id: 'l', sites: ['youtube.com'] }], budgets: [] };
    expect(buildInsights(usage, config, now)).toEqual([]);
  });
});

describe('budget insight', () => {
  it('only counts days that have tracking data', () => {
    const usage = { blockCounts: {}, escapeCounts: {}, siteTime: { 'github.com|2024-01-09': 60, 'github.com|2024-01-08': 60 } };
    const config = { budgets: [{ id: 'b', domain: 'reddit.com', minutes: 10, enabled: true }] };
    expect(buildInsights(usage, config, now).map(i => i.id)).toEqual([]); // only 2 tracked days
  });
});
