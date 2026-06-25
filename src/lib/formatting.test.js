import { describe, it, expect } from 'vitest';
import {
  normalizeDomain, formatTime, formatTimeLabel, windowLabel, formatDaysLabel
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
