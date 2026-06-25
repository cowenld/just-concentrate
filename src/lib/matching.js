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
