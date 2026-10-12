import { describe, it, expect } from 'vitest';
import {
  normalizeDomain, normalizeEntry, formatEntry, formatTime, formatTimeLabel, windowLabel, formatDaysLabel
} from './formatting.js';

describe('normalizeDomain', () => {
  it('strips protocol, www, path, and lowercases', () => {
    expect(normalizeDomain('  HTTPS://WWW.Reddit.com/r/all?x=1 ')).toBe('reddit.com');
    expect(normalizeDomain('http://twitter.com')).toBe('twitter.com');
    expect(normalizeDomain('youtube.com')).toBe('youtube.com');
  });
});

describe('formatTime / formatTimeLabel', () => {
  it('formats 12-hour times with lowercase suffix', () => {
    expect(formatTime('00:00')).toBe('12am');
    expect(formatTime('09:00')).toBe('9am');
    expect(formatTime('13:30')).toBe('1:30pm');
    expect(formatTime('')).toBe('');
  });
  it('uses an uppercase suffix for the label variant', () => {
    expect(formatTimeLabel('09:00')).toBe('9AM');
    expect(formatTimeLabel('23:15')).toBe('11:15PM');
  });
});

describe('windowLabel', () => {
  it('collapses a full day to "All day"', () => {
    expect(windowLabel('00:00', '23:59')).toBe('All day');
  });
  it('otherwise shows the formatted range', () => {
    expect(windowLabel('09:00', '17:00')).toBe('9am–5pm');
  });
});

describe('formatDaysLabel', () => {
  it('labels common day sets', () => {
    expect(formatDaysLabel([])).toBe('EVERY DAY');
    expect(formatDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('EVERY DAY');
    expect(formatDaysLabel([1, 2, 3, 4, 5])).toBe('MON–FRI');
    expect(formatDaysLabel([0, 6])).toBe('SAT–SUN');
    expect(formatDaysLabel([1, 3, 5])).toBe('MON, WED, FRI');
  });
});

describe('normalizeDomain validation', () => {
  it('rejects input that is not a domain', () => {
    expect(normalizeDomain('foo')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
    expect(normalizeDomain('*.x.com')).toBe('x.com');
    expect(normalizeDomain('localhost')).toBe('localhost');
  });
});

describe('normalizeEntry', () => {
  it('normalizes domains like normalizeDomain', () => {
    expect(normalizeEntry(' HTTPS://WWW.Reddit.com ')).toBe('reddit.com');
    expect(normalizeEntry('*.twitter.com')).toBe('twitter.com');
  });
  it('keeps a path, dropping query, hash and trailing slashes', () => {
    expect(normalizeEntry('https://www.linkedin.com/feed/?trk=1#x')).toBe('linkedin.com/feed');
    expect(normalizeEntry('youtube.com/shorts/')).toBe('youtube.com/shorts');
    expect(normalizeEntry('reddit.com/')).toBe('reddit.com');
  });
  it('supports keyword: entries', () => {
    expect(normalizeEntry('keyword: Casino ')).toBe('keyword:casino');
    expect(normalizeEntry('keyword:')).toBe('');
  });
  it('rejects junk', () => {
    expect(normalizeEntry('foo')).toBe('');
    expect(normalizeEntry('')).toBe('');
  });
  it('converts internationalized domains to punycode', () => {
    expect(normalizeEntry('bücher.de')).toBe('xn--bcher-kva.de');
  });
});

describe('formatEntry', () => {
  it('renders entries for display', () => {
    expect(formatEntry('keyword:casino')).toBe('“casino” in URL');
    expect(formatEntry('linkedin.com/feed')).toBe('linkedin.com/feed');
  });
});

describe('normalizeEntry edge cases', () => {
  it('percent-encodes non-ASCII keywords and paths like the browser does', () => {
    expect(normalizeEntry('keyword:café')).toBe('keyword:caf%c3%a9');
    expect(normalizeEntry('de.wikipedia.org/wiki/Café')).toBe('de.wikipedia.org/wiki/caf%c3%a9');
  });
  it('rejects empty or multi-word keywords', () => {
    expect(normalizeEntry('keyword:^^')).toBe('');
    expect(normalizeEntry('keyword:online poker')).toBe('');
    expect(normalizeEntry('keyword:a*b')).toBe('keyword:ab');
  });
  it('formats encoded entries readably', () => {
    expect(formatEntry('keyword:caf%c3%a9')).toBe('“café” in URL');
  });
});
