// Shared formatting + input-normalization helpers.
// Single source of truth for time/day display and domain input parsing,
// previously duplicated across popup, options, onboarding, and blocked surfaces.

const DAY_NAMES_UPPER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Lowercase a host and convert internationalized names to punycode (the
// form the browser and declarativeNetRequest use). Returns '' if invalid.
function toAsciiHost(host) {
  if (!host) return '';
  try {
    const parsed = new URL('http://' + host).hostname;
    return parsed.includes('.') || parsed === 'localhost' ? parsed : '';
  } catch {
    return '';
  }
}

function stripHostPrefixes(raw) {
  return raw.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '');
}

// Parse a user-typed domain into a bare registrable domain.
// Strips protocol, leading "www." / "*.", any path/query, and lowercases.
// Returns '' when the input isn't a usable domain.
export function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const host = stripHostPrefixes(raw).split(/[/?#]/)[0].replace(/\.$/, '');
  return toAsciiHost(host);
}

// Parse a user-typed blocklist entry. Three forms (see lib/matching.js):
//   "reddit.com"          domain + all subdomains
//   "linkedin.com/feed"   a path (and its sub-paths) on a domain
//   "keyword:casino"      any URL containing the keyword
// Returns '' when the input isn't a usable entry.
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith('keyword:')) {
    // A single URL-safe token: DNR urlFilter reserves * | ^, URLs can't
    // contain spaces, and non-ASCII appears percent-encoded in URLs.
    const kw = trimmed.slice('keyword:'.length).trim().replace(/[*|^]/g, '');
    if (!kw || /\s/.test(kw)) return '';
    return `keyword:${encodeURIComponent(kw).toLowerCase()}`;
  }
  const rest = stripHostPrefixes(trimmed).split(/[?#]/)[0];
  const slash = rest.indexOf('/');
  const host = toAsciiHost((slash === -1 ? rest : rest.slice(0, slash)).replace(/\.$/, ''));
  if (!host) return '';
  let path = slash === -1 ? '' : rest.slice(slash).replace(/\/+$/, '');
  if (path) {
    // Percent-encode the way browsers do, so it matches url.pathname.
    try { path = new URL('http://h' + path).pathname.toLowerCase(); } catch { return ''; }
  }
  return path ? host + path : host;
}

// Human-readable label for an entry chip.
export function formatEntry(entry) {
  const decode = t => { try { return decodeURIComponent(t); } catch { return t; } };
  if (entry.startsWith('keyword:')) return `“${decode(entry.slice('keyword:'.length))}” in URL`;
  return decode(entry);
}

// "09:00" -> "9am", "09:30" -> "9:30am", "13:00" -> "1pm" (lowercase suffix).
export function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

// Same as formatTime but with an uppercase suffix ("9AM"), for mono-cap labels.
export function formatTimeLabel(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

// Human window label: "All day" for a full 00:00–23:59 window, else "9am–5pm".
export function windowLabel(startTime, endTime) {
  if (startTime === '00:00' && endTime === '23:59') return 'All day';
  return `${formatTime(startTime)}–${formatTime(endTime)}`;
}

// Uppercase day summary: "EVERY DAY", "MON–FRI", "SAT–SUN", or "MON, WED, FRI".
export function formatDaysLabel(days) {
  if (!days || days.length === 0 || days.length === 7) return 'EVERY DAY';
  const sorted = [...days].sort();
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return 'MON–FRI';
  if (sorted.length === 2 && sorted.join(',') === '0,6') return 'SAT–SUN';
  return sorted.map(d => DAY_NAMES_UPPER[d]).join(', ');
}
