import { describe, it, expect } from 'vitest';
import {
  isTimeInWindow, isDayActive, isScheduleActive,
  getActiveBlockedDomains, getNextWindowBoundary, getWindowEndTimestamp
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

describe('getActiveBlockedDomains', () => {
  const lists = [{ id: 'l1', sites: ['twitter.com'] }];

  it('aggregates domains from active schedules only', () => {
    const schedules = [
      { enabled: true, days: [3], startTime: '09:00', endTime: '17:00', adHocSites: ['reddit.com'], listIds: ['l1'] },
      { enabled: false, days: [3], startTime: '09:00', endTime: '17:00', adHocSites: ['youtube.com'] }
    ];
    const r = getActiveBlockedDomains(schedules, lists, [], null, wed10);
    expect(r.blackout).toBe(false);
    expect(r.domains.sort()).toEqual(['reddit.com', 'twitter.com']);
  });

  it('returns blackout when an active schedule is blackout', () => {
    const schedules = [{ enabled: true, days: [], startTime: '00:00', endTime: '23:59', blackout: true, name: 'X' }];
    const r = getActiveBlockedDomains(schedules, lists, ['a.com'], null, wed10);
    expect(r.blackout).toBe(true);
    expect(r.allowlist).toEqual(['a.com']);
  });

  it('includes an active focus session and its blackout', () => {
    const future = Date.now() + 60000;
    expect(getActiveBlockedDomains([], [], [], { endTime: future, domains: ['x.com'] }).domains).toContain('x.com');
    expect(getActiveBlockedDomains([], [], [], { endTime: future, blackout: true }).blackout).toBe(true);
  });
});

describe('getNextWindowBoundary', () => {
  it('caps at 60 minutes and ignores disabled schedules', () => {
    expect(getNextWindowBoundary([])).toBe(60);
    expect(getNextWindowBoundary([{ enabled: false, startTime: '00:00', endTime: '00:30' }])).toBe(60);
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
