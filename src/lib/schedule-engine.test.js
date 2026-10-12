import { describe, it, expect } from 'vitest';
import {
  isTimeInWindow, isDayActive, isScheduleActive, getWindowEndTimestamp,
  getPomodoroPhase, isFocusBlocking, pomodoroEndTime, getBudgetUsedSeconds, localDateKey,
  computeBlockState, evaluateUrl, getNextBoundary, getBlockingSources
} from './schedule-engine.js';

// Fixed reference: Wednesday 2024-01-03, 10:00 local time.
const wed10 = new Date(2024, 0, 3, 10, 0, 0);

describe('isTimeInWindow', () => {
  it('handles a normal daytime window', () => {
    expect(isTimeInWindow(wed10, '09:00', '17:00')).toBe(true);
    expect(isTimeInWindow(new Date(2024, 0, 3, 8, 0), '09:00', '17:00')).toBe(false);
    expect(isTimeInWindow(new Date(2024, 0, 3, 17, 0), '09:00', '17:00')).toBe(false);
  });

  it('handles a midnight-crossing window', () => {
    expect(isTimeInWindow(new Date(2024, 0, 3, 23, 0), '22:00', '07:00')).toBe(true);
    expect(isTimeInWindow(new Date(2024, 0, 3, 3, 0), '22:00', '07:00')).toBe(true);
    expect(isTimeInWindow(new Date(2024, 0, 3, 12, 0), '22:00', '07:00')).toBe(false);
  });
});

describe('isDayActive', () => {
  it('treats empty days as every day', () => {
    expect(isDayActive(wed10, [])).toBe(true);
    expect(isDayActive(wed10, undefined)).toBe(true);
  });
  it('matches the current weekday (0=Sun)', () => {
    expect(isDayActive(wed10, [3])).toBe(true);
    expect(isDayActive(wed10, [1, 2])).toBe(false);
  });
});

describe('isScheduleActive', () => {
  it('requires enabled, day, and time all to pass', () => {
    const base = { enabled: true, days: [3], startTime: '09:00', endTime: '17:00' };
    expect(isScheduleActive(base, wed10)).toBe(true);
    expect(isScheduleActive({ ...base, enabled: false }, wed10)).toBe(false);
    expect(isScheduleActive({ ...base, days: [1] }, wed10)).toBe(false);
    expect(isScheduleActive({ ...base, startTime: '11:00' }, wed10)).toBe(false);
  });
});

describe('overnight windows and day attribution', () => {
  const sched = { enabled: true, days: [5], startTime: '22:00', endTime: '07:00' }; // Friday nights
  it('stays active after midnight on the following day', () => {
    expect(isScheduleActive(sched, new Date(2024, 0, 6, 3, 0))).toBe(true);  // Sat 03:00
    expect(isScheduleActive(sched, new Date(2024, 0, 5, 3, 0))).toBe(false); // Fri 03:00 (Thu night)
    expect(isScheduleActive(sched, new Date(2024, 0, 5, 23, 0))).toBe(true); // Fri 23:00
  });
  it('treats a 23:59 end as the end of the day', () => {
    const allDay = { enabled: true, days: [], startTime: '00:00', endTime: '23:59' };
    expect(isScheduleActive(allDay, new Date(2024, 0, 3, 23, 59, 30))).toBe(true);
  });
});

describe('getPomodoroPhase', () => {
  const start = new Date(2024, 0, 3, 10, 0).getTime();
  const session = { startTime: start, endTime: start + (25 * 2 + 5) * 60000, pomodoro: { workMinutes: 25, breakMinutes: 5, cycles: 2 } };
  const at = min => start + min * 60000;
  it('walks work → break → work → done', () => {
    expect(getPomodoroPhase(session, at(1))).toEqual({ phase: 'work', cycle: 1, cycles: 2, phaseEnd: at(25) });
    expect(getPomodoroPhase(session, at(26))).toEqual({ phase: 'break', cycle: 1, cycles: 2, phaseEnd: at(30) });
    expect(getPomodoroPhase(session, at(31))).toEqual({ phase: 'work', cycle: 2, cycles: 2, phaseEnd: at(55) });
    expect(getPomodoroPhase(session, at(56)).phase).toBe('done');
  });
  it('isFocusBlocking is false during breaks and after the end', () => {
    expect(isFocusBlocking(session, at(1))).toBe(true);
    expect(isFocusBlocking(session, at(27))).toBe(false);
    expect(isFocusBlocking(session, at(60))).toBe(false);
    expect(isFocusBlocking({ startTime: start, endTime: at(30) }, at(10))).toBe(true);
    expect(isFocusBlocking(null, at(10))).toBe(false);
  });
  it('pomodoroEndTime adds cycles and the breaks between them', () => {
    expect(pomodoroEndTime(start, { workMinutes: 25, breakMinutes: 5, cycles: 4 })).toBe(at(115));
  });
});

describe('getBudgetUsedSeconds', () => {
  it('sums subdomains for the given day only', () => {
    const siteTime = { 'reddit.com|2024-01-03': 60, 'old.reddit.com|2024-01-03': 30, 'reddit.com|2024-01-02': 999, 'x.com|2024-01-03': 5 };
    expect(getBudgetUsedSeconds(siteTime, 'reddit.com', '2024-01-03')).toBe(90);
  });
});

describe('localDateKey', () => {
  it('uses the local calendar date', () => {
    expect(localDateKey(new Date(2024, 0, 3, 23, 30))).toBe('2024-01-03');
    expect(localDateKey(new Date(2024, 11, 31, 0, 5))).toBe('2024-12-31');
  });
});

describe('computeBlockState', () => {
  const lists = [{ id: 'l1', sites: ['twitter.com'] }];
  const work = { id: 's1', name: 'Work', enabled: true, days: [3], startTime: '09:00', endTime: '17:00', adHocSites: ['reddit.com', 'linkedin.com/feed'], listIds: ['l1'] };

  it('collects entries from active schedules with labels and end times', () => {
    const st = computeBlockState({ schedules: [work], lists, allowlist: [] }, wed10);
    expect(st.blackout).toBe(null);
    expect(st.entries.map(e => e.entry).sort()).toEqual(['linkedin.com/feed', 'reddit.com', 'twitter.com']);
    const r = st.entries.find(e => e.entry === 'reddit.com');
    expect(r.label).toBe('Work');
    expect(r.source).toEqual({ kind: 'schedule', id: 's1' });
    expect(new Date(r.endTime).getHours()).toBe(17);
  });

  it('skips suspended schedules until the suspension ends', () => {
    const suspensions = { 'schedule:s1': wed10.getTime() + 3600000 };
    expect(computeBlockState({ schedules: [work], lists, allowlist: [], suspensions }, wed10).entries).toEqual([]);
    const later = new Date(wed10.getTime() + 2 * 3600000);
    expect(computeBlockState({ schedules: [work], lists, allowlist: [], suspensions }, later).entries.length).toBe(3);
  });

  it('carries the redirect URL for redirect schedules', () => {
    const st = computeBlockState({ schedules: [{ ...work, action: 'redirect', redirectUrl: 'https://example.com' }], lists, allowlist: [] }, wed10);
    expect(st.entries[0].redirectUrl).toBe('https://example.com');
  });

  it('reports blackout from a schedule or focus session', () => {
    const bo = { ...work, blackout: true };
    expect(computeBlockState({ schedules: [bo], lists, allowlist: ['a.com'] }, wed10).blackout.label).toBe('Work');
    const focus = { startTime: wed10.getTime(), endTime: wed10.getTime() + 60000, blackout: true };
    expect(computeBlockState({ schedules: [], lists, allowlist: [], focusSession: focus }, wed10).blackout.source).toEqual({ kind: 'focus' });
  });

  it('includes focus domains only during work phases', () => {
    const start = wed10.getTime();
    const focus = { startTime: start, endTime: start + 55 * 60000, domains: ['x.com'], pomodoro: { workMinutes: 25, breakMinutes: 5, cycles: 2 } };
    expect(computeBlockState({ schedules: [], lists, allowlist: [], focusSession: focus }, wed10).entries[0].entry).toBe('x.com');
    const inBreak = new Date(start + 27 * 60000);
    expect(computeBlockState({ schedules: [], lists, allowlist: [], focusSession: focus }, inBreak).entries).toEqual([]);
  });

  it('blocks a budgeted domain once its daily limit is used up', () => {
    const budgets = [{ id: 'b1', domain: 'reddit.com', minutes: 15, enabled: true }];
    const under = { 'reddit.com|2024-01-03': 14 * 60 };
    const over = { 'reddit.com|2024-01-03': 15 * 60 };
    expect(computeBlockState({ schedules: [], lists, allowlist: [], budgets, siteTime: under }, wed10).entries).toEqual([]);
    const st = computeBlockState({ schedules: [], lists, allowlist: [], budgets, siteTime: over }, wed10);
    expect(st.entries[0]).toMatchObject({ entry: 'reddit.com', source: { kind: 'budget', id: 'b1' } });
    expect(new Date(st.entries[0].endTime).getDate()).toBe(4);
    const suspended = { 'budget:b1': wed10.getTime() + 1000 };
    expect(computeBlockState({ schedules: [], lists, allowlist: [], budgets, siteTime: over, suspensions: suspended }, wed10).entries).toEqual([]);
  });

  it('keeps the latest-ending source when an entry is blocked twice', () => {
    const late = { ...work, id: 's2', name: 'Late', startTime: '09:00', endTime: '20:00' };
    const st = computeBlockState({ schedules: [work, late], lists, allowlist: [] }, wed10);
    expect(st.entries.find(e => e.entry === 'reddit.com').label).toBe('Late');
  });
});

describe('evaluateUrl', () => {
  const state = {
    allowlist: ['mail.google.com'],
    blackout: null,
    entries: [
      { entry: 'reddit.com', label: 'Work', source: { kind: 'schedule', id: 's1' }, endTime: 1 },
      { entry: 'linkedin.com/feed', label: 'Work', source: { kind: 'schedule', id: 's1' }, endTime: 1 },
      { entry: 'google.com', label: 'Work', source: { kind: 'schedule', id: 's1' }, endTime: 1 }
    ]
  };
  it('matches entries and respects the allowlist', () => {
    expect(evaluateUrl('https://www.reddit.com/r/all', state).label).toBe('Work');
    expect(evaluateUrl('https://linkedin.com/messaging', state)).toBe(null);
    expect(evaluateUrl('https://mail.google.com/', state)).toBe(null);
    expect(evaluateUrl('https://www.google.com/', state).entry).toBe('google.com');
  });
  it('ignores non-web URLs', () => {
    expect(evaluateUrl('chrome://extensions', state)).toBe(null);
    expect(evaluateUrl('not a url', state)).toBe(null);
    expect(evaluateUrl('https://reddit.com', null)).toBe(null);
  });
  it('falls back to blackout for anything not allowlisted', () => {
    const bo = { ...state, entries: [], blackout: { label: 'Deep work', source: { kind: 'schedule', id: 's9' }, endTime: 5 } };
    expect(evaluateUrl('https://example.com', bo)).toMatchObject({ entry: null, label: 'Deep work' });
    expect(evaluateUrl('https://mail.google.com', bo)).toBe(null);
  });
});

describe('getNextBoundary', () => {
  it('returns the soonest schedule edge, focus end, suspension end or midnight, capped at an hour', () => {
    const now = wed10.getTime();
    const min = m => now + m * 60000;
    expect(getNextBoundary({ schedules: [] }, wed10)).toBe(min(60));
    expect(getNextBoundary({ schedules: [{ enabled: true, startTime: '10:20', endTime: '17:00' }] }, wed10)).toBe(min(20));
    expect(getNextBoundary({ schedules: [], focusSession: { startTime: now, endTime: min(7) } }, wed10)).toBe(min(7));
    expect(getNextBoundary({ schedules: [], suspensions: { 'schedule:x': min(3) } }, wed10)).toBe(min(3));
    const lateNight = new Date(2024, 0, 3, 23, 50);
    expect(getNextBoundary({ schedules: [], budgets: [{ enabled: true }] }, lateNight)).toBe(new Date(2024, 0, 4, 0, 0).getTime());
  });
});

describe('getWindowEndTimestamp', () => {
  it('returns todays end for a normal window', () => {
    const end = getWindowEndTimestamp({ startTime: '09:00', endTime: '17:00' }, wed10);
    expect(new Date(end).getHours()).toBe(17);
    expect(new Date(end).getDate()).toBe(3);
  });

  it('rolls to the next morning for an overnight window past the start', () => {
    const lateNight = new Date(2024, 0, 3, 23, 0);
    const end = getWindowEndTimestamp({ startTime: '22:00', endTime: '07:00' }, lateNight);
    expect(new Date(end).getHours()).toBe(7);
    expect(new Date(end).getDate()).toBe(4);
  });
});

describe('getBlockingSources', () => {
  const lists = [{ id: 'l1', sites: ['twitter.com'] }];
  const s1 = { id: 's1', name: 'Work', enabled: true, days: [], startTime: '09:00', endTime: '17:00', adHocSites: ['reddit.com'], listIds: [] };
  const s2 = { id: 's2', name: 'Lists', enabled: true, days: [], startTime: '09:00', endTime: '12:00', adHocSites: [], listIds: ['l1'] };
  const bo = { id: 's3', name: 'BO', enabled: true, days: [], startTime: '09:00', endTime: '11:00', blackout: true };

  it('returns every schedule, focus session and budget blocking the URL', () => {
    const focus = { startTime: wed10.getTime(), endTime: wed10.getTime() + 60000, domains: ['reddit.com'] };
    const budgets = [{ id: 'b1', domain: 'reddit.com', minutes: 1, enabled: true }];
    const siteTime = { 'reddit.com|2024-01-03': 120 };
    const sources = getBlockingSources({ schedules: [s1, s2, bo], lists, focusSession: focus, budgets, siteTime }, 'https://www.reddit.com/', wed10);
    expect(sources.map(s => s.key || 'focus')).toEqual(['schedule:s1', 'schedule:s3', 'focus', 'budget:b1']);
    expect(new Date(sources[0].until).getHours()).toBe(17);
    expect(new Date(sources[3].until).getDate()).toBe(4);
  });

  it('returns nothing for allowlisted or unblocked URLs', () => {
    expect(getBlockingSources({ schedules: [s1, bo], lists, allowlist: ['reddit.com'] }, 'https://reddit.com', wed10)).toEqual([]);
    expect(getBlockingSources({ schedules: [s1], lists }, 'https://example.com', wed10)).toEqual([]);
  });
});
