import { describe, it, expect } from 'vitest';
import { buildDnrRules, pathRegex, MAX_REGEX_RULES } from './dnr.js';

const e = entry => ({ entry, label: 'X', source: { kind: 'schedule', id: 's' }, endTime: 1 });

describe('buildDnrRules', () => {
  it('returns no rules when nothing is blocked', () => {
    expect(buildDnrRules({ allowlist: [], blackout: null, entries: [] })).toEqual([]);
  });

  it('groups domain entries into one block rule that excludes the allowlist', () => {
    const rules = buildDnrRules({ allowlist: ['mail.google.com'], blackout: null, entries: [e('reddit.com'), e('google.com')] });
    expect(rules).toEqual([{
      id: 1, priority: 1, action: { type: 'block' },
      condition: { resourceTypes: ['main_frame'], requestDomains: ['reddit.com', 'google.com'], excludedRequestDomains: ['mail.google.com'] }
    }]);
  });

  it('uses only block actions (redirects need host permissions)', () => {
    const rules = buildDnrRules({ allowlist: [], blackout: { label: 'B' }, entries: [e('a.com'), e('a.com/x'), e('keyword:poker')] });
    expect(rules.every(r => r.action.type === 'block')).toBe(true);
  });

  it('builds a regex rule per path entry and a urlFilter rule per keyword', () => {
    const rules = buildDnrRules({ allowlist: [], blackout: null, entries: [e('linkedin.com/feed'), e('keyword:poker')] });
    expect(rules[0].condition).toEqual({ resourceTypes: ['main_frame'], regexFilter: pathRegex('linkedin.com', '/feed') });
    expect(rules[1].condition).toEqual({ resourceTypes: ['main_frame'], urlFilter: 'poker' });
    expect(rules.map(r => r.id)).toEqual([1, 2]);
  });

  it('blocks every top-level page except the allowlist in blackout', () => {
    const rules = buildDnrRules({ allowlist: ['a.com'], blackout: { label: 'B' }, entries: [] });
    expect(rules).toEqual([{ id: 1, priority: 1, action: { type: 'block' }, condition: { resourceTypes: ['main_frame'], excludedRequestDomains: ['a.com'] } }]);
  });

  it('caps regex rules at the Chrome limit', () => {
    const entries = Array.from({ length: MAX_REGEX_RULES + 5 }, (_, i) => e(`a.com/p${i}`));
    expect(buildDnrRules({ allowlist: [], blackout: null, entries }).length).toBe(MAX_REGEX_RULES);
  });
});

describe('pathRegex', () => {
  it('matches the path and sub-paths on the domain and its subdomains', () => {
    const re = new RegExp(pathRegex('linkedin.com', '/feed'), 'i');
    expect(re.test('https://www.linkedin.com/feed')).toBe(true);
    expect(re.test('https://linkedin.com/feed/?x=1')).toBe(true);
    expect(re.test('https://linkedin.com:443/feed#top')).toBe(true);
    expect(re.test('https://linkedin.com/feedback')).toBe(false);
    expect(re.test('https://notlinkedin.com/feed')).toBe(false);
    expect(re.test('https://evil.com/?u=linkedin.com/feed')).toBe(false);
  });
});

describe('invalid entries', () => {
  it('skips entries Chrome would reject instead of emitting them', () => {
    const rules = buildDnrRules({ allowlist: [], blackout: null, entries: [e('keyword:'), e('keyword:café'), e('a.com/é'), e('ok.com')] });
    expect(rules).toHaveLength(1);
    expect(rules[0].condition.requestDomains).toEqual(['ok.com']);
  });
});
