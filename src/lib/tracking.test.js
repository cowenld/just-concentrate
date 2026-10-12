import { describe, it, expect } from 'vitest';
import { trackableHost, creditedSeconds, formatDuration, MAX_CREDIT_SECONDS } from './tracking.js';

describe('trackableHost', () => {
  it('returns the hostname without www for web pages only', () => {
    expect(trackableHost('https://www.reddit.com/r/all')).toBe('reddit.com');
    expect(trackableHost('http://old.reddit.com')).toBe('old.reddit.com');
    expect(trackableHost('chrome://newtab')).toBe(null);
    expect(trackableHost('chrome-extension://abc/blocked.html')).toBe(null);
    expect(trackableHost(undefined)).toBe(null);
  });
});

describe('creditedSeconds', () => {
  it('credits elapsed seconds, capped to survive sleep', () => {
    expect(creditedSeconds(1000, 31000)).toBe(30);
    expect(creditedSeconds(0, 31000)).toBe(0);
    expect(creditedSeconds(1000, 1000 + 3600000)).toBe(MAX_CREDIT_SECONDS);
    expect(creditedSeconds(5000, 1000)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats seconds compactly', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60 + 5)).toBe('12m');
    expect(formatDuration(3900)).toBe('1h 05m');
  });
});
