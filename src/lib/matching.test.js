import { describe, it, expect } from 'vitest';
import {
  extractRegistrableDomain, domainMatches, getEffectiveBlocklist
} from './matching.js';

describe('extractRegistrableDomain', () => {
  it('lowercases and strips www.', () => {
    expect(extractRegistrableDomain('WWW.Reddit.com')).toBe('reddit.com');
    expect(extractRegistrableDomain('reddit.com')).toBe('reddit.com');
  });
});

describe('domainMatches', () => {
  it('matches the bare domain and www.', () => {
    expect(domainMatches('reddit.com', 'reddit.com')).toBe(true);
    expect(domainMatches('www.reddit.com', 'reddit.com')).toBe(true);
  });

  it('matches subdomains', () => {
    expect(domainMatches('old.reddit.com', 'reddit.com')).toBe(true);
    expect(domainMatches('a.b.reddit.com', 'reddit.com')).toBe(true);
  });

  it('normalizes a www. prefix on the blocked domain', () => {
    expect(domainMatches('old.reddit.com', 'www.reddit.com')).toBe(true);
  });

  it('does not match unrelated or partial domains', () => {
    expect(domainMatches('notreddit.com', 'reddit.com')).toBe(false);
    expect(domainMatches('reddit.com.evil.com', 'reddit.com')).toBe(false);
    expect(domainMatches('example.com', 'reddit.com')).toBe(false);
  });
});

describe('getEffectiveBlocklist', () => {
  const lists = [
    { id: 'l1', sites: ['twitter.com', 'WWW.Facebook.com'] },
    { id: 'l2', sites: ['youtube.com'] }
  ];

  it('combines adHocSites and referenced lists, normalized and deduped', () => {
    const schedule = { adHocSites: ['Reddit.com', 'twitter.com'], listIds: ['l1'] };
    const result = getEffectiveBlocklist(schedule, lists).sort();
    expect(result).toEqual(['facebook.com', 'reddit.com', 'twitter.com']);
  });

  it('ignores unknown list ids and missing fields', () => {
    expect(getEffectiveBlocklist({ listIds: ['nope'] }, lists)).toEqual([]);
    expect(getEffectiveBlocklist({}, lists)).toEqual([]);
  });
});
