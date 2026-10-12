// Friction levels (D5): self-imposed cost of undoing a commitment.
//   none        → overrides are instant
//   wait        → a cooling-off countdown
//   passphrase  → type your own phrase (D10), then the countdown
export const FRICTION_LEVELS = ['none', 'wait', 'passphrase'];

// The level actually applied: passphrase without a phrase falls back to wait.
export function effectiveFriction(settings) {
  const level = (settings && settings.frictionLevel) || 'wait';
  if (level === 'passphrase' && !(settings.passphrase || '').trim()) return 'wait';
  return FRICTION_LEVELS.includes(level) ? level : 'wait';
}

// Changing settings that weaken friction must itself pass the current friction.
export function isFrictionDowngrade(settings, next) {
  const current = { ...settings };
  const proposed = { ...settings, ...next };
  const rank = s => FRICTION_LEVELS.indexOf(effectiveFriction(s));
  if (rank(proposed) < rank(current)) return true;
  if (rank(current) > 0 && (proposed.cooldownSeconds || 0) < (current.cooldownSeconds || 0)) return true;
  return false;
}

const sameSet = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x));
const removedAny = (before = [], after = []) => before.some(x => !after.includes(x));

// Does saving `next` over `prev` make an active schedule block less? Adding
// sites or lists is free; anything that narrows the block passes friction.
export function isScheduleWeakened(prev, next) {
  if (!prev) return false;
  if (prev.enabled && !next.enabled) return true;
  if (prev.blackout && !next.blackout) return true;
  if (prev.startTime !== next.startTime || prev.endTime !== next.endTime) return true;
  if (!sameSet(prev.days, next.days)) return true;
  if (!prev.blackout && (removedAny(prev.adHocSites, next.adHocSites) || removedAny(prev.listIds, next.listIds))) return true;
  if ((prev.action || 'block') !== (next.action || 'block') || prev.redirectUrl !== next.redirectUrl) return true;
  return false;
}

export function isListWeakened(prev, next) {
  return !!prev && removedAny(prev.sites, next.sites);
}

export function isBudgetWeakened(prev, next) {
  if (!prev || !prev.enabled) return false;
  return !next.enabled || next.minutes > prev.minutes || next.domain !== prev.domain;
}
