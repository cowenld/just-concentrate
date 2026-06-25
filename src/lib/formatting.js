// Shared formatting + input-normalization helpers.
// Single source of truth for time/day display and domain input parsing,
// previously duplicated across popup, options, onboarding, and blocked surfaces.

const DAY_NAMES_UPPER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Parse a user-typed domain into a bare registrable domain.
// Strips protocol, leading "www.", any path/query, and lowercases.
export function normalizeDomain(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
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
