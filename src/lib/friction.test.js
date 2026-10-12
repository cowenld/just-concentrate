import { describe, it, expect } from 'vitest';
import { effectiveFriction, isFrictionDowngrade, isScheduleWeakened, isListWeakened, isBudgetWeakened } from './friction.js';

describe('effectiveFriction', () => {
  it('defaults to wait and needs a phrase for passphrase mode', () => {
    expect(effectiveFriction({})).toBe('wait');
    expect(effectiveFriction({ frictionLevel: 'none' })).toBe('none');
    expect(effectiveFriction({ frictionLevel: 'passphrase', passphrase: '' })).toBe('wait');
    expect(effectiveFriction({ frictionLevel: 'passphrase', passphrase: 'my reason' })).toBe('passphrase');
    expect(effectiveFriction({ frictionLevel: 'bogus' })).toBe('wait');
  });
});

describe('isFrictionDowngrade', () => {
  const s = { frictionLevel: 'passphrase', passphrase: 'why', cooldownSeconds: 30 };
  it('flags lowering the level or shortening the cooldown', () => {
    expect(isFrictionDowngrade(s, { frictionLevel: 'wait' })).toBe(true);
    expect(isFrictionDowngrade(s, { frictionLevel: 'none' })).toBe(true);
    expect(isFrictionDowngrade(s, { cooldownSeconds: 10 })).toBe(true);
    expect(isFrictionDowngrade(s, { passphrase: '' })).toBe(true);
  });
  it('allows strengthening freely', () => {
    expect(isFrictionDowngrade({ frictionLevel: 'none', cooldownSeconds: 30 }, { frictionLevel: 'wait' })).toBe(false);
    expect(isFrictionDowngrade(s, { cooldownSeconds: 60 })).toBe(false);
    expect(isFrictionDowngrade({ frictionLevel: 'none', cooldownSeconds: 30 }, { cooldownSeconds: 5 })).toBe(false);
  });
});

describe('isScheduleWeakened', () => {
  const s = { enabled: true, days: [1, 2], startTime: '09:00', endTime: '17:00', adHocSites: ['a.com'], listIds: ['l1'], blackout: false };
  it('allows adding sites and lists freely', () => {
    expect(isScheduleWeakened(s, { ...s, adHocSites: ['a.com', 'b.com'], listIds: ['l1', 'l2'], name: 'new name' })).toBe(false);
    expect(isScheduleWeakened(s, { ...s, days: [2, 1] })).toBe(false);
    expect(isScheduleWeakened(null, s)).toBe(false);
  });
  it('flags anything that narrows the block', () => {
    expect(isScheduleWeakened(s, { ...s, adHocSites: [] })).toBe(true);
    expect(isScheduleWeakened(s, { ...s, listIds: [] })).toBe(true);
    expect(isScheduleWeakened(s, { ...s, endTime: '16:00' })).toBe(true);
    expect(isScheduleWeakened(s, { ...s, days: [1] })).toBe(true);
    expect(isScheduleWeakened(s, { ...s, enabled: false })).toBe(true);
    expect(isScheduleWeakened({ ...s, blackout: true }, s)).toBe(true);
    expect(isScheduleWeakened(s, { ...s, action: 'redirect', redirectUrl: 'https://x.com' })).toBe(true);
  });
});

describe('isListWeakened / isBudgetWeakened', () => {
  it('flags removed sites', () => {
    expect(isListWeakened({ sites: ['a.com', 'b.com'] }, { sites: ['a.com'] })).toBe(true);
    expect(isListWeakened({ sites: ['a.com'] }, { sites: ['a.com', 'b.com'] })).toBe(false);
  });
  it('flags raised, disabled or moved budgets', () => {
    const b = { domain: 'a.com', minutes: 15, enabled: true };
    expect(isBudgetWeakened(b, { ...b, minutes: 30 })).toBe(true);
    expect(isBudgetWeakened(b, { ...b, enabled: false })).toBe(true);
    expect(isBudgetWeakened(b, { ...b, domain: 'b.com' })).toBe(true);
    expect(isBudgetWeakened(b, { ...b, minutes: 10 })).toBe(false);
    expect(isBudgetWeakened({ ...b, enabled: false }, { ...b, minutes: 60 })).toBe(false);
  });
});
