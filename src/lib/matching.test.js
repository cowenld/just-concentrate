import { describe, it, expect } from 'vitest';
import {
  extractRegistrableDomain, domainMatches, getEffectiveBlocklist, parseEntry, entryMatchesUrl
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

describe('parseEntry', () => {
  it('classifies domain, path and keyword entries', () => {
    expect(parseEntry('reddit.com')).toEqual({ type: 'domain', domain: 'reddit.com' });
    expect(parseEntry('linkedin.com/feed')).toEqual({ type: 'path', domain: 'linkedin.com', path: '/feed' });
    expect(parseEntry('youtube.com/shorts/x')).toEqual({ type: 'path', domain: 'youtube.com', path: '/shorts/x' });
    expect(parseEntry('keyword:casino')).toEqual({ type: 'keyword', keyword: 'casino' });
  });
});

describe('entryMatchesUrl', () => {
  const u = s => new URL(s);
  it('matches domains and subdomains', () => {
    expect(entryMatchesUrl('reddit.com', u('https://old.reddit.com/r/all'))).toBe(true);
    expect(entryMatchesUrl('reddit.com', u('https://notreddit.com/'))).toBe(false);
  });
  it('matches a path and its sub-paths only', () => {
    expect(entryMatchesUrl('linkedin.com/feed', u('https://www.linkedin.com/feed'))).toBe(true);
    expect(entryMatchesUrl('linkedin.com/feed', u('https://www.linkedin.com/feed/'))).toBe(true);
    expect(entryMatchesUrl('linkedin.com/feed', u('https://www.linkedin.com/feed/update/1?x=1'))).toBe(true);
    expect(entryMatchesUrl('linkedin.com/feed', u('https://www.linkedin.com/feedback'))).toBe(false);
    expect(entryMatchesUrl('linkedin.com/feed', u('https://www.linkedin.com/messaging'))).toBe(false);
    expect(entryMatchesUrl('youtube.com/shorts', u('https://m.youtube.com/Shorts/abc'))).toBe(true);
  });
  it('matches keywords anywhere in the URL, case-insensitively', () => {
    expect(entryMatchesUrl('keyword:casino', u('https://www.google.com/search?q=Casino+near+me'))).toBe(true);
    expect(entryMatchesUrl('keyword:casino', u('https://example.com/'))).toBe(false);
  });
});

describe('getEffectiveBlocklist with advanced entries', () => {
  it('keeps path and keyword entries intact', () => {
    const schedule = { adHocSites: ['www.LinkedIn.com/feed', 'keyword:casino'] };
    expect(getEffectiveBlocklist(schedule, []).sort()).toEqual(['keyword:casino', 'linkedin.com/feed']);
  });
});

describe('entryMatchesUrl with encoded entries', () => {
  it('matches percent-encoded keyword and path entries', () => {
    expect(entryMatchesUrl('keyword:caf%c3%a9', new URL('https://www.google.com/search?q=café'))).toBe(true);
    expect(entryMatchesUrl('de.wikipedia.org/wiki/caf%c3%a9', new URL('https://de.wikipedia.org/wiki/Café'))).toBe(true);
  });
});
