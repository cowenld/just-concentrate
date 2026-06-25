import { getEffectiveBlocklist } from './matching.js';

export function isTimeInWindow(now, startTime, endTime) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

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
  if (!isDayActive(now, schedule.days)) return false;
  if (!isTimeInWindow(now, schedule.startTime, schedule.endTime)) return false;
  return true;
}

export function getActiveBlockedDomains(schedules, lists, allowlist, focusSession, now = new Date()) {
  const blocked = new Set();

  for (const schedule of schedules) {
    if (!isScheduleActive(schedule, now)) continue;

    if (schedule.blackout) {
      return { blackout: true, allowlist, scheduleName: schedule.name };
    }

    const effective = getEffectiveBlocklist(schedule, lists);
    for (const domain of effective) {
      blocked.add(domain);
    }
  }

  if (focusSession && focusSession.endTime > now.getTime()) {
    if (focusSession.blackout) {
      return { blackout: true, allowlist, scheduleName: 'Focus Now' };
    }
    if (focusSession.domains) {
      for (const domain of focusSession.domains) {
        blocked.add(domain);
      }
    }
  }

  return { blackout: false, domains: [...blocked] };
}

// Timestamp (ms) at which a schedule's current window ends, handling
// midnight-crossing windows. Assumes the schedule is currently active.
export function getWindowEndTimestamp(schedule, now) {
  if (!now) now = new Date();
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  const curMin = now.getHours() * 60 + now.getMinutes();
  const endDate = new Date(now);
  endDate.setHours(endH, endM, 0, 0);
  // Overnight window and we're past the start → ends tomorrow morning.
  if (endMin <= startMin && curMin >= startMin) endDate.setDate(endDate.getDate() + 1);
  if (endDate <= now) endDate.setDate(endDate.getDate() + 1);
  return endDate.getTime();
}

export function getNextWindowBoundary(schedules) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let nearest = Infinity;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const [endH, endM] = schedule.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    for (const boundary of [startMinutes, endMinutes]) {
      let diff = boundary - currentMinutes;
      if (diff <= 0) diff += 1440; // next day
      if (diff < nearest) nearest = diff;
    }
  }

  return nearest === Infinity ? 60 : Math.min(nearest, 60);
}
