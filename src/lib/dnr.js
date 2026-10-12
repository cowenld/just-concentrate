import { parseEntry } from './matching.js';

// Chrome caps regex rules per extension (MAX_NUMBER_OF_REGEX_RULES).
export const MAX_REGEX_RULES = 1000;

const MAIN_FRAME = ['main_frame'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// RE2 pattern for "this path (or a sub-path) on this domain or a subdomain".
export function pathRegex(domain, path) {
  return `^https?://([^/?#]*\\.)?${escapeRegex(domain)}(:[0-9]+)?${escapeRegex(path)}([/?#].*)?$`;
}

const ASCII_PRINTABLE = /^[\x21-\x7e]+$/;

export function isValidEntry(entry) {
  if (!entry || !ASCII_PRINTABLE.test(entry)) return false;
  const parsed = parseEntry(entry);
  if (parsed.type === 'keyword') return parsed.keyword.length > 0 && !/[*|^]/.test(parsed.keyword);
  return parsed.domain.length > 0;
}

// Turn a block state (see schedule-engine.js:computeBlockState) into
// declarativeNetRequest dynamic rules.
//
// Every rule uses the `block` action: with only the `declarativeNetRequest`
// permission, redirect rules would need host permissions, which this
// extension deliberately doesn't request. The background turns the resulting
// net::ERR_BLOCKED_BY_CLIENT navigation error into a redirect to blocked.html
// (or the schedule's redirect URL) via webNavigation.onErrorOccurred.
// The allowlist is excluded from every rule, so it always wins (D3).
export function buildDnrRules(state) {
  const rules = [];
  const exclude = state.allowlist && state.allowlist.length > 0
    ? { excludedRequestDomains: [...state.allowlist] }
    : {};
  const push = condition => rules.push({
    id: rules.length + 1,
    priority: 1,
    action: { type: 'block' },
    condition: { resourceTypes: MAIN_FRAME, ...condition, ...exclude }
  });

  if (state.blackout) {
    push({});
    return rules;
  }

  const domains = [];
  let regexCount = 0;
  for (const { entry } of state.entries) {
    // Chrome rejects non-ASCII and empty filters, and one invalid rule fails the
    // whole update; normalizeEntry() prevents these, but stored data may predate it.
    if (!isValidEntry(entry)) continue;
    const parsed = parseEntry(entry);
    if (parsed.type === 'domain') {
      domains.push(parsed.domain);
    } else if (parsed.type === 'path') {
      if (regexCount >= MAX_REGEX_RULES) continue;
      regexCount++;
      push({ regexFilter: pathRegex(parsed.domain, parsed.path) });
    } else {
      push({ urlFilter: parsed.keyword });
    }
  }
  if (domains.length > 0) {
    // Keep ids stable-ish and put the big domain rule first.
    rules.unshift({
      id: 0, priority: 1, action: { type: 'block' },
      condition: { resourceTypes: MAIN_FRAME, requestDomains: domains, ...exclude }
    });
    rules.forEach((r, i) => { r.id = i + 1; });
  }
  return rules;
}
