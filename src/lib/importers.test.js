import { describe, it, expect } from 'vitest';
import { parseStayFocusd, autoDetectAndParse, parsePlainText, parseJustConcentrate } from './importers.js';

describe('parseStayFocusd', () => {
  it('reads v4 exports (timers + whitelist), turning limits into daily budgets', () => {
    const file = JSON.stringify({
      LOCAL: { activeDays: [1, 2, 3, 4, 5], activeHours: [{ start: { hours: 9, minutes: 0 }, end: { hours: 17, minutes: 30 } }] },
      SYNC: {
        timers: {
          a: { id: 'a', name: 'Default', allowedTimeMs: 3600000, blocklist: ['https://www.reddit.com/', 'youtube.com/shorts'], isEnabled: true },
          b: { id: 'b', name: 'News', allowedTimeMs: 0, blocklist: ['cnn.com'], isEnabled: true },
          c: { id: 'c', name: 'Off', allowedTimeMs: 0, blocklist: ['x.com'], isEnabled: false }
        },
        whitelist: ['mail.google.com']
      }
    });
    const r = parseStayFocusd(file);
    expect(r.source).toBe('StayFocusd');
    expect(r.lists.map(l => [l.name, l.sites])).toEqual([
      ['StayFocusd', ['reddit.com', 'youtube.com/shorts']],
      ['StayFocusd · News', ['cnn.com']]
    ]);
    expect(r.budgets).toEqual([{ domain: 'reddit.com', minutes: 60, enabled: true }]);
    expect(r.schedules).toEqual([expect.objectContaining({ days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:30', listIds: ['stayfocusd-1'] })]);
    expect(r.allowlist).toEqual(['mail.google.com']);
  });

  it('reads v2 exports (blockedGroups, seconds, pipe strings)', () => {
    const file = JSON.stringify({
      SYNC: { blockedGroups: [{ groupName: 'Default', websites: ['facebook.com'], maxTimeAllowed: 600 }], whitelistNew: ['docs.google.com'] },
      LOCAL: { activeDays: '1|2', activeHours: '08:00|12:00' }
    });
    const r = parseStayFocusd(file);
    expect(r.budgets).toEqual([{ domain: 'facebook.com', minutes: 10, enabled: true }]);
    expect(r.allowlist).toEqual(['docs.google.com']);
  });

  it('reads URL-encoded v1 exports (blacklist object, minutes)', () => {
    const v1 = { SYNC: { blacklist: { 'netflix.com': {}, 'reddit.com': {} }, whitelist: { 'wikipedia.org': {} } }, LOCAL: { maxTimeAllowed: 0, activeDays: '1|2|3|4|5', activeHours: '09:00|16:00' } };
    const r = parseStayFocusd(encodeURIComponent(JSON.stringify(v1)));
    expect(r.lists[0].sites).toEqual(['netflix.com', 'reddit.com']);
    expect(r.budgets).toEqual([]);
    expect(r.schedules[0]).toMatchObject({ days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '16:00' });
    expect(r.allowlist).toEqual(['wikipedia.org']);
  });

  it('reads the oldest flat, all-strings format', () => {
    const r = parseStayFocusd(JSON.stringify({ sync_blacklist: '{"twitter.com":{}}', maxTimeAllowed: 'null' }));
    expect(r.budgets).toEqual([{ domain: 'twitter.com', minutes: 10, enabled: true }]);
  });

  it('is picked by auto-detect', () => {
    expect(autoDetectAndParse(JSON.stringify({ SYNC: { timers: { a: { blocklist: ['a.com'], allowedTimeMs: 0 } } }, LOCAL: {} }), 'StayFocusd_2024-1-2.json').source).toBe('StayFocusd');
  });

  it('throws when there are no sites', () => {
    expect(() => parseStayFocusd(JSON.stringify({ SYNC: { blockedGroups: [] } }))).toThrow();
  });
});

describe('other importers keep path entries', () => {
  it('plain text keeps paths and drops junk', () => {
    expect(parsePlainText('# comment\nreddit.com/r/all\nfoo\nhttps://www.x.com/home?x=1').lists[0].sites).toEqual(['reddit.com/r/all', 'x.com/home']);
  });
  it('own format imports budgets', () => {
    const r = parseJustConcentrate(JSON.stringify({ version: 2, lists: [], budgets: [{ domain: 'www.reddit.com', minutes: 15 }, { domain: 'bad', minutes: 5 }] }));
    expect(r.budgets).toEqual([{ domain: 'reddit.com', minutes: 15, enabled: true }]);
  });
});
