// Pure helpers for local time-on-site tracking (see background: flushTracking).

// Never credit more than this per flush: the background flushes at least once
// a minute, so a bigger gap means the machine slept or the worker was killed.
export const MAX_CREDIT_SECONDS = 120;

// Hostname to attribute time to, or null for non-web pages.
export function trackableHost(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function creditedSeconds(sinceMs, nowMs) {
  if (!sinceMs || nowMs <= sinceMs) return 0;
  return Math.min(MAX_CREDIT_SECONDS, Math.round((nowMs - sinceMs) / 1000));
}

// "1h 05m", "12m", "45s"
export function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
