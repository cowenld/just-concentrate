function normalizeDomain(d) {
  if (!d || typeof d !== 'string') return null;
  d = d.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.split('/')[0];
  d = d.replace(/^\*\./, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\.$/, '');
  if (!d || !d.includes('.')) return null;
  return d;
}

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
      sites: (l.sites || []).map(normalizeDomain).filter(Boolean),
      origin: l.origin || 'user'
    }))
    .filter(l => l.sites.length > 0);

  return {
    source: 'Just Concentrate',
    lists,
    allowlist: (data.allowlist || []).map(normalizeDomain).filter(Boolean),
    schedules: data.schedules || [],
    settings: data.settings || null
  };
}

function decodeDaysBitmask(bitmask) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    if (bitmask & (1 << i)) days.push(i);
  }
  return days;
}

function parseLeechBlockOptions(opts) {
  const lists = [];

  for (let i = 1; i <= 30; i++) {
    const raw = opts[`sites${i}`];
    if (!raw) continue;
    const sites = raw.split(/\s+/).map(normalizeDomain).filter(Boolean);
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

  const sites = data.blocked.map(normalizeDomain).filter(Boolean);
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
      .map(normalizeDomain).filter(Boolean);
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

export function parsePlainText(content) {
  const sites = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+/)[0])
    .map(normalizeDomain)
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
    const data = JSON.parse(content);

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
  { id: 'blocksite', label: 'Block Site', parse: parseBlockSite },
  { id: 'coldturkey', label: 'Cold Turkey', parse: parseColdTurkey },
  { id: 'plaintext', label: 'Plain text list', parse: parsePlainText },
];
