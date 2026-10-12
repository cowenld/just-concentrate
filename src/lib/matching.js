export function extractRegistrableDomain(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function domainMatches(urlHostname, blockedDomain) {
  const host = urlHostname.toLowerCase();
  const domain = extractRegistrableDomain(blockedDomain);
  if (host === domain || host === 'www.' + domain) return true;
  if (host.endsWith('.' + domain)) return true;
  return false;
}

// Blocklist entries are strings in one of three forms:
//   "reddit.com"          → { type: 'domain', domain }
//   "linkedin.com/feed"   → { type: 'path', domain, path: '/feed' }
//   "keyword:casino"      → { type: 'keyword', keyword }
export function parseEntry(entry) {
  if (entry.startsWith('keyword:')) return { type: 'keyword', keyword: entry.slice('keyword:'.length) };
  const slash = entry.indexOf('/');
  if (slash === -1) return { type: 'domain', domain: entry };
  return { type: 'path', domain: entry.slice(0, slash), path: entry.slice(slash) };
}

// Does a blocklist entry match a URL object? Paths match themselves and their
// sub-paths ("/feed" matches "/feed/x" but not "/feedback"), case-insensitively.
export function entryMatchesUrl(entry, url) {
  const parsed = parseEntry(entry);
  if (parsed.type === 'keyword') return url.href.toLowerCase().includes(parsed.keyword);
  if (!domainMatches(url.hostname, parsed.domain)) return false;
  if (parsed.type === 'domain') return true;
  const pathname = url.pathname.toLowerCase();
  const path = parsed.path.toLowerCase();
  return pathname === path || pathname.startsWith(path + '/');
}

export function getEffectiveBlocklist(schedule, lists) {
  const domains = new Set();

  if (schedule.adHocSites) {
    for (const site of schedule.adHocSites) {
      domains.add(extractRegistrableDomain(site));
    }
  }

  if (schedule.listIds) {
    const listMap = new Map(lists.map(l => [l.id, l]));
    for (const listId of schedule.listIds) {
      const list = listMap.get(listId);
      if (list && list.sites) {
        for (const site of list.sites) {
          domains.add(extractRegistrableDomain(site));
        }
      }
    }
  }

  return [...domains];
}
