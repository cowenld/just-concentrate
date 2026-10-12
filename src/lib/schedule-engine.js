import { getEffectiveBlocklist, domainMatches, entryMatchesUrl } from './matching.js';

const MINUTE = 60000;
const DAY_MINUTES = 1440;

// "HH:MM" → minutes since midnight. An end of "23:59" means the end of the
// day, so all-day windows (00:00–23:59) don't leave a one-minute gap.
function toMinutes(time, isEnd = false) {
  const [h, m] = time.split(':').map(Number);
  const minutes = h * 60 + m;
  return isEnd && minutes === DAY_MINUTES - 1 ? DAY_MINUTES : minutes;
}

export function isTimeInWindow(now, startTime, endTime) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime, true);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Midnight crossing: e.g. 22:00 - 07:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function isDayActive(now, days) {
  if (!days || days.length === 0) return true;
  const dayIndex = now.getDay(); // 0=Sun, 1=Mon, ...
  return days.includes(dayIndex);
}

export function isScheduleActive(schedule, now) {
  if (!schedule.enabled) return false;
  if (!now) now = new Date();
  if (!isTimeInWindow(now, schedule.startTime, schedule.endTime)) return false;
  // The after-midnight part of an overnight window belongs to the day it
  // started on: a Friday 22:00–07:00 window is still active at Sat 03:00.
  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime, true);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (endMinutes <= startMinutes && currentMinutes < endMinutes) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isDayActive(yesterday, schedule.days);
  }
  return isDayActive(now, schedule.days);
}

// Active right now and not paused by "end block early".
export function isScheduleInForce(schedule, suspensions, now = new Date()) {
  return isScheduleActive(schedule, now) && !isSuspended(suspensions, `schedule:${schedule.id}`, now.getTime());
}

// Timestamp (ms) at which a schedule's current window ends, handling
// midnight-crossing windows. Assumes the schedule is currently active.
export function getWindowEndTimestamp(schedule, now) {
  if (!now) now = new Date();
  const startMin = toMinutes(schedule.startTime);
  const endMin = toMinutes(schedule.endTime, true);
  const curMin = now.getHours() * 60 + now.getMinutes();
  const endDate = new Date(now);
  endDate.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  // Overnight window and we're past the start → ends tomorrow morning.
  if (endMin <= startMin && curMin >= startMin) endDate.setDate(endDate.getDate() + 1);
  if (endDate <= now) endDate.setDate(endDate.getDate() + 1);
  return endDate.getTime();
}

// "YYYY-MM-DD" in local time — the key used for all per-day usage counters.
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextLocalMidnight(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ─── Focus sessions & Pomodoro ───
// A Pomodoro session is a focus session with { pomodoro: { workMinutes,
// breakMinutes, cycles } }. Phases are derived from startTime, so nothing
// needs to be persisted when a phase flips.

export function pomodoroEndTime(startTime, { workMinutes, breakMinutes, cycles }) {
  return startTime + (cycles * workMinutes + (cycles - 1) * breakMinutes) * MINUTE;
}

export function getPomodoroPhase(session, nowMs) {
  const { workMinutes, breakMinutes, cycles } = session.pomodoro;
  const work = workMinutes * MINUTE;
  const cycleLen = work + breakMinutes * MINUTE;
  const elapsed = nowMs - session.startTime;
  const index = Math.floor(elapsed / cycleLen);
  const within = elapsed - index * cycleLen;
  const cycleStart = session.startTime + index * cycleLen;
  if (elapsed < 0 || index >= cycles) return { phase: 'done', cycle: cycles, cycles, phaseEnd: session.endTime };
  if (within < work) return { phase: 'work', cycle: index + 1, cycles, phaseEnd: cycleStart + work };
  if (index === cycles - 1) return { phase: 'done', cycle: cycles, cycles, phaseEnd: session.endTime };
  return { phase: 'break', cycle: index + 1, cycles, phaseEnd: cycleStart + cycleLen };
}

export function isFocusActive(session, nowMs) {
  return !!session && session.endTime > nowMs;
}

export function isFocusBlocking(session, nowMs) {
  if (!isFocusActive(session, nowMs)) return false;
  if (!session.pomodoro) return true;
  return getPomodoroPhase(session, nowMs).phase === 'work';
}

// When the current focus block lifts: the phase end for Pomodoro, else the session end.
function focusBlockEnd(session, nowMs) {
  return session.pomodoro ? getPomodoroPhase(session, nowMs).phaseEnd : session.endTime;
}

// ─── Daily time budgets ───

// Seconds spent today on a budgeted domain, including its subdomains.
// siteTime is keyed "hostname|YYYY-MM-DD" → seconds.
export function getBudgetUsedSeconds(siteTime, domain, dateKey) {
  let total = 0;
  for (const [key, seconds] of Object.entries(siteTime || {})) {
    const sep = key.lastIndexOf('|');
    if (key.slice(sep + 1) !== dateKey) continue;
    if (domainMatches(key.slice(0, sep), domain)) total += seconds;
  }
  return total;
}

// ─── Block state ───
// The single source of truth for "what is blocked right now". The background
// caches the result in storage as _blockState; evaluateUrl() answers per-URL
// questions against it, and lib/dnr.js turns it into network rules.
//
// Shape: {
//   allowlist: string[],
//   blackout: null | { label, source, endTime },
//   entries: [{ entry, label, source, endTime, redirectUrl }]
// }
// source is { kind: 'schedule', id } | { kind: 'focus' } | { kind: 'budget', id }.

function isSuspended(suspensions, key, nowMs) {
  return !!suspensions && suspensions[key] > nowMs;
}

export function computeBlockState(input, now = new Date()) {
  const {
    schedules = [], lists = [], allowlist = [], budgets = [],
    focusSession = null, suspensions = {}, siteTime = {}
  } = input;
  const nowMs = now.getTime();
  const byEntry = new Map();
  let blackout = null;

  function add(entry, info) {
    const existing = byEntry.get(entry);
    if (!existing || info.endTime > existing.endTime) byEntry.set(entry, { entry, ...info });
  }

  for (const schedule of schedules) {
    if (!isScheduleActive(schedule, now)) continue;
    if (isSuspended(suspensions, `schedule:${schedule.id}`, nowMs)) continue;
    const info = {
      label: schedule.name,
      source: { kind: 'schedule', id: schedule.id },
      endTime: getWindowEndTimestamp(schedule, now),
      redirectUrl: schedule.action === 'redirect' && schedule.redirectUrl ? schedule.redirectUrl : null
    };
    if (schedule.blackout) {
      if (!blackout || info.endTime > blackout.endTime) blackout = { label: info.label, source: info.source, endTime: info.endTime };
      continue;
    }
    for (const entry of getEffectiveBlocklist(schedule, lists)) add(entry, info);
  }

  if (isFocusBlocking(focusSession, nowMs)) {
    const label = focusSession.pomodoro ? 'Pomodoro' : 'Focus Now';
    const info = { label, source: { kind: 'focus' }, endTime: focusBlockEnd(focusSession, nowMs), redirectUrl: null };
    if (focusSession.blackout) {
      if (!blackout || info.endTime > blackout.endTime) blackout = { label, source: info.source, endTime: info.endTime };
    } else {
      for (const entry of focusSession.domains || []) add(entry, info);
    }
  }

  const today = localDateKey(now);
  for (const budget of budgets) {
    if (!budget.enabled) continue;
    if (isSuspended(suspensions, `budget:${budget.id}`, nowMs)) continue;
    if (getBudgetUsedSeconds(siteTime, budget.domain, today) < budget.minutes * 60) continue;
    add(budget.domain, {
      label: `Daily limit · ${budget.minutes} min`,
      source: { kind: 'budget', id: budget.id },
      endTime: nextLocalMidnight(now),
      redirectUrl: null
    });
  }

  return { allowlist: [...allowlist], blackout, entries: [...byEntry.values()] };
}

// Is this URL blocked under the given block state? Returns the matching entry
// info ({ entry, label, source, endTime, redirectUrl }) or null. The allowlist
// always wins (D3); blackout catches everything else.
export function evaluateUrl(urlString, state) {
  if (!state) return null;
  let url;
  try { url = new URL(urlString); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if ((state.allowlist || []).some(a => domainMatches(url.hostname, a))) return null;
  const match = (state.entries || []).find(e => entryMatchesUrl(e.entry, url));
  if (match) return { ...match };
  if (state.blackout) return { entry: null, redirectUrl: null, ...state.blackout };
  return null;
}

// Timestamp of the next moment the block state could change: a schedule edge,
// a focus/Pomodoro phase change, a suspension ending, or midnight (budgets
// reset). Capped at an hour so the background re-checks regularly.
export function getNextBoundary(input, now = new Date()) {
  const { schedules = [], focusSession = null, suspensions = {}, budgets = [] } = input;
  const nowMs = now.getTime();
  let next = nowMs + 60 * MINUTE;
  const consider = t => { if (t > nowMs && t < next) next = t; };

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    for (const minutes of [toMinutes(schedule.startTime), toMinutes(schedule.endTime, true)]) {
      const d = new Date(now);
      d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
      consider(d.getTime());
    }
  }
  if (isFocusActive(focusSession, nowMs)) {
    consider(focusSession.endTime);
    if (focusSession.pomodoro) consider(getPomodoroPhase(focusSession, nowMs).phaseEnd);
  }
  for (const until of Object.values(suspensions || {})) consider(until);
  if (budgets.some(b => b.enabled)) consider(nextLocalMidnight(now));
  return next;
}

// Everything currently blocking this URL, so "end block early" can lift all of
// it at once: [{ key, until }] for suspensions ('schedule:<id>' until the
// window ends, 'budget:<id>' until midnight) plus { focus: true } if the focus
// session is involved. Allowlisted URLs return [].
export function getBlockingSources(input, urlString, now = new Date()) {
  const {
    schedules = [], lists = [], allowlist = [], budgets = [],
    focusSession = null, suspensions = {}, siteTime = {}
  } = input;
  let url;
  try { url = new URL(urlString); } catch { return []; }
  if (allowlist.some(a => domainMatches(url.hostname, a))) return [];
  const nowMs = now.getTime();
  const matches = entries => entries.some(e => entryMatchesUrl(e, url));
  const sources = [];

  for (const schedule of schedules) {
    if (!isScheduleActive(schedule, now)) continue;
    if (isSuspended(suspensions, `schedule:${schedule.id}`, nowMs)) continue;
    if (schedule.blackout || matches(getEffectiveBlocklist(schedule, lists))) {
      sources.push({ key: `schedule:${schedule.id}`, until: getWindowEndTimestamp(schedule, now) });
    }
  }
  if (isFocusBlocking(focusSession, nowMs) && (focusSession.blackout || matches(focusSession.domains || []))) {
    sources.push({ focus: true });
  }
  const today = localDateKey(now);
  for (const budget of budgets) {
    if (!budget.enabled || isSuspended(suspensions, `budget:${budget.id}`, nowMs)) continue;
    if (!domainMatches(url.hostname, budget.domain)) continue;
    if (getBudgetUsedSeconds(siteTime, budget.domain, today) < budget.minutes * 60) continue;
    sources.push({ key: `budget:${budget.id}`, until: nextLocalMidnight(now) });
  }
  return sources;
}
