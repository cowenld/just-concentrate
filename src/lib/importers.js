import { normalizeDomain as normalizeAllowed, normalizeEntry } from './formatting.js';

// Blocklist entries keep paths (e.g. "reddit.com/r/all"); allowlist entries
// are domains only.
const normalizeSite = d => (typeof d === 'string' ? normalizeEntry(d) : '') || null;
const normalizeDomain = d => (typeof d === 'string' ? normalizeAllowed(d) : '') || null;

function unique(arr) {
  return [...new Set(arr)];
}

export function parseJustConcentrate(content) {
  const data = JSON.parse(content);
  if (!data.version) throw new Error('Not a valid Just Concentrate export');

  const lists = (data.lists || [])
    .map(l => ({
      id: l.id,
      name: l.name || 'Imported list',
      sites: (l.sites || []).map(normalizeSite).filter(Boolean),
      origin: l.origin || 'user'
    }))
    .filter(l => l.sites.length > 0);

  return {
    source: 'Just Concentrate',
    lists,
    allowlist: (data.allowlist || []).map(normalizeDomain).filter(Boolean),
    schedules: data.schedules || [],
    budgets: (data.budgets || []).filter(b => b && normalizeDomain(b.domain) && b.minutes > 0)
      .map(b => ({ domain: normalizeDomain(b.domain), minutes: Number(b.minutes), enabled: b.enabled !== false })),
    settings: data.settings || null
  };
}

function parseLeechBlockOptions(opts) {
  const lists = [];

  for (let i = 1; i <= 30; i++) {
    const raw = opts[`sites${i}`];
    if (!raw) continue;
    const sites = raw.split(/\s+/).map(normalizeSite).filter(Boolean);
    if (sites.length === 0) continue;
    const name = opts[`setName${i}`] || `Block Set ${i}`;
    lists.push({ name, sites: unique(sites) });
  }

  if (lists.length === 0) throw new Error('No blocked sites found in LeechBlock export');
  return { source: 'LeechBlock NG', lists, allowlist: [] };
}

export function parseLeechBlockText(content) {
  const opts = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  }
  return parseLeechBlockOptions(opts);
}

export function parseLeechBlockJSON(content) {
  const opts = JSON.parse(content);
  if (!opts.sites1 && !opts.setName1) {
    throw new Error('Not a valid LeechBlock NG export');
  }
  return parseLeechBlockOptions(opts);
}

export function parseLeechBlock(content) {
  try {
    return parseLeechBlockJSON(content);
  } catch {
    return parseLeechBlockText(content);
  }
}

export function parseBlockSite(content) {
  const data = JSON.parse(content);
  if (!Array.isArray(data.blocked)) {
    throw new Error('Not a valid Block Site export');
  }

  const sites = data.blocked.map(normalizeSite).filter(Boolean);
  const lists = sites.length > 0
    ? [{ name: 'Block Site import', sites: unique(sites) }]
    : [];

  if (lists.length === 0) throw new Error('No blocked sites found');
  return { source: 'Block Site', lists, allowlist: [] };
}

export function parseColdTurkey(content) {
  const data = JSON.parse(content);
  const lists = [];
  const allowlist = [];

  const blocks = data.blockListInfo?.blocks || data.blocks || {};

  for (const [name, block] of Object.entries(blocks)) {
    const sites = (block.blockList || block.web || [])
      .map(normalizeSite).filter(Boolean);
    if (sites.length > 0) {
      lists.push({ name, sites: unique(sites) });
    }
    const exceptions = (block.exceptionList || block.exceptions || [])
      .map(normalizeDomain).filter(Boolean);
    allowlist.push(...exceptions);
  }

  if (lists.length === 0) throw new Error('No blocked sites found in Cold Turkey export');
  return { source: 'Cold Turkey', lists, allowlist: unique(allowlist) };
}

// ─── StayFocusd ───
// Three generations of export format (see docs/backlog.md for sources):
//   v4.x   { LOCAL, SYNC } — SYNC.timers { id: { name, blocklist[], allowedTimeMs } }, SYNC.whitelist[]
//   v2.x   { SYNC, LOCAL } — blockedGroups [{ groupName, websites[], maxTimeAllowed (s) }], whitelistNew[]
//   v1.x   { SYNC, LOCAL, HTML5 } or a flat object of strings — blacklist { domain: {} },
//          whitelist { domain: {} }, maxTimeAllowed (minutes), "1|2|3" days, "09:00|17:00" hours
// StayFocusd limits a whole group's combined time; we approximate that with a
// per-site daily limit. A limit of 0 ("blocked all day") becomes a schedule
// over StayFocusd's active days and hours.

function stayFocusdData(content) {
  try { return JSON.parse(decodeURIComponent(content)); } catch { return JSON.parse(content); }
}

const asValue = v => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};

const keysOrArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v) : []);
const hhmm = t => (t && typeof t === 'object' ? `${String(t.hours || 0).padStart(2, '0')}:${String(t.minutes || 0).padStart(2, '0')}` : null);

function parseActiveDays(v) {
  if (Array.isArray(v)) return v.map(Number).filter(d => d >= 0 && d <= 6);
  if (v === 'none') return [];
  if (typeof v === 'string' || typeof v === 'number') return String(v).split('|').map(Number).filter(d => d >= 0 && d <= 6);
  return [0, 1, 2, 3, 4, 5, 6];
}

function parseActiveHours(v) {
  const range = Array.isArray(v) ? v[0] : v;
  if (range && typeof range === 'object' && range.start) return { startTime: hhmm(range.start), endTime: hhmm(range.end) };
  if (typeof range === 'string' && range.includes('|')) {
    const [startTime, endTime] = range.split('|');
    return { startTime, endTime };
  }
  return { startTime: '00:00', endTime: '23:59' };
}

export function parseStayFocusd(content) {
  const data = stayFocusdData(content);
  if (!data || typeof data !== 'object') throw new Error('Not a valid StayFocusd export');
  const buckets = [data.SYNC, data.LOCAL, data.HTML5, data].filter(b => b && typeof b === 'object');
  const get = key => {
    for (const b of buckets) {
      for (const k of [key, `sync_${key}`]) {
        if (b[k] !== undefined && b[k] !== null) return asValue(b[k]);
      }
    }
    return undefined;
  };

  // [{ name, sites, minutes }] where minutes 0 = blocked during active hours.
  const groups = [];
  const timers = get('timers');
  const blockedGroups = get('blockedGroups');
  if (timers && typeof timers === 'object' && !Array.isArray(timers)) {
    for (const t of Object.values(timers)) {
      if (!t || t.isEnabled === false) continue;
      groups.push({ name: t.name, sites: t.blocklist || [], minutes: Math.round((t.allowedTimeMs || 0) / 60000) });
    }
  } else if (Array.isArray(blockedGroups)) {
    for (const g of blockedGroups) groups.push({ name: g.groupName, sites: g.websites || [], minutes: Math.round((g.maxTimeAllowed || 0) / 60) });
  } else {
    const max = get('maxTimeAllowed');
    groups.push({ name: 'StayFocusd', sites: keysOrArray(get('blacklist')), minutes: max == null ? 10 : Number(max) || 0 });
  }

  const days = parseActiveDays(get('activeDays'));
  const { startTime, endTime } = parseActiveHours(get('activeHours'));
  const lists = [];
  const schedules = [];
  const budgets = [];

  groups.forEach((g, i) => {
    const sites = unique(g.sites.map(normalizeSite).filter(Boolean));
    if (sites.length === 0) return;
    const id = `stayfocusd-${i}`;
    const name = !g.name || g.name === 'Default' ? 'StayFocusd' : `StayFocusd · ${g.name}`;
    lists.push({ id, name, sites });
    if (g.minutes > 0) {
      for (const site of sites) {
        if (!site.includes('/') && !site.startsWith('keyword:')) budgets.push({ domain: site, minutes: g.minutes, enabled: true });
      }
    } else if (days.length > 0) {
      schedules.push({ name, days, startTime, endTime, blackout: false, action: 'block', adHocSites: [], listIds: [id], enabled: true });
    }
  });

  if (lists.length === 0) throw new Error('No blocked sites found in StayFocusd export');
  const allowed = get('whitelist') ?? get('whitelistNew');
  return {
    source: 'StayFocusd',
    lists,
    schedules,
    budgets,
    allowlist: unique(keysOrArray(allowed).map(normalizeDomain).filter(Boolean))
  };
}

function looksLikeStayFocusd(data) {
  const b = [data.SYNC, data.LOCAL, data].filter(x => x && typeof x === 'object');
  return b.some(x => x.timers || x.blockedGroups || x.blacklist || x.sync_blacklist || x.whitelistNew);
}

export function parsePlainText(content) {
  const sites = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+/)[0])
    .map(normalizeSite)
    .filter(Boolean);

  if (sites.length === 0) throw new Error('No valid domains found');

  return {
    source: 'Plain text',
    lists: [{ name: 'Imported sites', sites: unique(sites) }],
    allowlist: []
  };
}

export function autoDetectAndParse(content, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  if (ext === 'ctbbl') return parseColdTurkey(content);

  try {
    const data = stayFocusdData(content);
    if (looksLikeStayFocusd(data)) return parseStayFocusd(content);

    if (data.version && (data.schedules || data.lists)) return parseJustConcentrate(content);
    if (Array.isArray(data.blocked)) return parseBlockSite(content);
    if (data.blockListInfo || (data.blocks && typeof data.blocks === 'object')) {
      return parseColdTurkey(content);
    }
    if (data.sites1 || data.setName1) return parseLeechBlockJSON(content);
  } catch {
    // Not JSON — try text formats
  }

  if (/^sites\d+=/m.test(content) || /^setName\d+=/m.test(content)) {
    return parseLeechBlockText(content);
  }

  return parsePlainText(content);
}

export const IMPORT_FORMATS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'justconcentrate', label: 'Just Concentrate', parse: parseJustConcentrate },
  { id: 'leechblock', label: 'LeechBlock NG', parse: parseLeechBlock },
  { id: 'stayfocusd', label: 'StayFocusd', parse: parseStayFocusd },
  { id: 'blocksite', label: 'Block Site', parse: parseBlockSite },
  { id: 'coldturkey', label: 'Cold Turkey', parse: parseColdTurkey },
  { id: 'plaintext', label: 'Plain text list', parse: parsePlainText },
];
