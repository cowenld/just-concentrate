export const DEFAULT_DATA = {
  schedules: [],
  lists: [],
  allowlist: [],
  settings: {
    frictionLevel: 'passphrase',
    passphrase: 'I am choosing distraction over deep focus right now',
    theme: 'system',
    syncEnabled: false,
    cooldownSeconds: 30,
    snoozeDurationMinutes: 5,
    onboardingComplete: false
  },
  focusSession: null,
  usage: {
    blockCounts: {},
    escapeCounts: {},
    snoozeCounts: {},
    siteTime: {}
  },
  commitmentEndTimes: {}
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getData() {
  const result = await chrome.storage.local.get('justConcentrate');
  if (!result.justConcentrate) {
    await chrome.storage.local.set({ justConcentrate: DEFAULT_DATA });
    return structuredClone(DEFAULT_DATA);
  }
  return result.justConcentrate;
}

export async function setData(data) {
  data.updatedAt = Date.now();
  await chrome.storage.local.set({ justConcentrate: data });

  // Optional sync: mirror config (not usage) to chrome.storage.sync
  if (data.settings && data.settings.syncEnabled) {
    const syncPayload = buildSyncPayload(data);
    try {
      await chrome.storage.sync.set({ justConcentrateSync: syncPayload });
    } catch (err) {
      console.warn('[JustConcentrate] Sync write failed:', err.message);
    }
  }
}

// Apply a synced config payload from another Chrome profile.
// Last-write-wins: only applies if the payload is newer than local data
// (pass force=true to skip the timestamp check, e.g. when first enabling sync).
// Writes local-only — never echoes back to chrome.storage.sync.
export async function applySyncedConfig(payload, force = false) {
  if (!payload || typeof payload !== 'object') return false;
  const data = await getData();
  if (!force && (payload.updatedAt || 0) <= (data.updatedAt || 0)) return false;

  data.schedules = payload.schedules || [];
  data.lists = payload.lists || [];
  data.allowlist = payload.allowlist || [];
  // Merge settings but keep this profile's own sync toggle
  data.settings = { ...data.settings, ...(payload.settings || {}), syncEnabled: data.settings.syncEnabled };
  data.updatedAt = payload.updatedAt || Date.now();
  await chrome.storage.local.set({ justConcentrate: data });
  return true;
}

const SYNC_QUOTA_BYTES = 8192;
const SYNC_KEY = 'justConcentrateSync';

function buildSyncPayload(data) {
  return {
    updatedAt: data.updatedAt,
    schedules: data.schedules,
    lists: data.lists,
    allowlist: data.allowlist,
    settings: data.settings
  };
}

export function getSyncPayloadSize(data) {
  const payload = buildSyncPayload(data);
  // Chrome counts the key name + JSON-serialized value
  const bytes = SYNC_KEY.length + JSON.stringify(payload).length;
  return { bytes, quota: SYNC_QUOTA_BYTES, percent: Math.round((bytes / SYNC_QUOTA_BYTES) * 100) };
}

export async function getSchedules() {
  const data = await getData();
  return data.schedules;
}

export async function saveSchedule(schedule) {
  const data = await getData();
  if (!schedule.id) {
    schedule.id = generateId();
    data.schedules.push(schedule);
  } else {
    const idx = data.schedules.findIndex(s => s.id === schedule.id);
    if (idx >= 0) data.schedules[idx] = schedule;
    else data.schedules.push(schedule);
  }
  await setData(data);
  return schedule;
}

export async function deleteSchedule(id) {
  const data = await getData();
  data.schedules = data.schedules.filter(s => s.id !== id);
  await setData(data);
}

export async function getLists() {
  const data = await getData();
  return data.lists;
}

export async function saveList(list) {
  const data = await getData();
  if (!list.id) {
    list.id = generateId();
    data.lists.push(list);
  } else {
    const idx = data.lists.findIndex(l => l.id === list.id);
    if (idx >= 0) data.lists[idx] = list;
    else data.lists.push(list);
  }
  await setData(data);
  return list;
}

export async function deleteList(id) {
  const data = await getData();
  data.lists = data.lists.filter(l => l.id !== id);
  await setData(data);
}

export async function getAllowlist() {
  const data = await getData();
  return data.allowlist;
}

export async function saveAllowlist(allowlist) {
  const data = await getData();
  data.allowlist = allowlist;
  await setData(data);
}

export async function getSettings() {
  const data = await getData();
  return data.settings;
}

export async function saveSettings(settings) {
  const data = await getData();
  data.settings = { ...data.settings, ...settings };
  await setData(data);
}

export async function getFocusSession() {
  const data = await getData();
  return data.focusSession;
}

export async function saveFocusSession(session) {
  const data = await getData();
  data.focusSession = session;
  await setData(data);
}

export async function clearFocusSession() {
  const data = await getData();
  data.focusSession = null;
  await setData(data);
}

export async function getUsage() {
  const data = await getData();
  return data.usage || { blockCounts: {}, escapeCounts: {}, snoozeCounts: {}, siteTime: {} };
}

export async function recordBlock(domain, _scheduleName) {
  const data = await getData();
  if (!data.usage) data.usage = { blockCounts: {}, escapeCounts: {}, snoozeCounts: {}, siteTime: {} };
  const key = `${domain}|${new Date().toISOString().slice(0, 10)}`;
  data.usage.blockCounts[key] = (data.usage.blockCounts[key] || 0) + 1;
  await setData(data);
}

export async function recordEscape(domain, type) {
  const data = await getData();
  if (!data.usage) data.usage = { blockCounts: {}, escapeCounts: {}, snoozeCounts: {}, siteTime: {} };
  const key = `${domain}|${new Date().toISOString().slice(0, 10)}`;
  if (type === 'snooze') {
    data.usage.snoozeCounts[key] = (data.usage.snoozeCounts[key] || 0) + 1;
  } else {
    data.usage.escapeCounts[key] = (data.usage.escapeCounts[key] || 0) + 1;
  }
  await setData(data);
}

export async function getCommitmentEndTimes() {
  const data = await getData();
  return data.commitmentEndTimes || {};
}

export async function setCommitmentEndTime(scheduleId, endTime) {
  const data = await getData();
  if (!data.commitmentEndTimes) data.commitmentEndTimes = {};
  data.commitmentEndTimes[scheduleId] = endTime;
  await setData(data);
}

export async function clearCommitmentEndTime(scheduleId) {
  const data = await getData();
  if (data.commitmentEndTimes) {
    delete data.commitmentEndTimes[scheduleId];
    await setData(data);
  }
}

export async function exportData() {
  const data = await getData();
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    schedules: data.schedules,
    lists: data.lists,
    allowlist: data.allowlist,
    settings: data.settings
  }, null, 2);
}

export async function importData(jsonString) {
  const imported = JSON.parse(jsonString);
  if (!imported.version) throw new Error('Invalid Just Concentrate export file');
  const data = await getData();
  data.schedules = imported.schedules || [];
  data.lists = imported.lists || [];
  data.allowlist = imported.allowlist || [];
  if (imported.settings) {
    data.settings = { ...data.settings, ...imported.settings };
  }
  await setData(data);
}
