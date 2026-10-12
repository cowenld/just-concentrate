import { localDateKey } from './schedule-engine.js';

// ─── Keys ───
// Config + runtime state live under one key; usage counters live under a
// separate key so that frequent writes (time tracking, block counts) don't
// trigger a rule rebuild or a sync write.
const DATA_KEY = 'justConcentrate';
export const USAGE_KEY = 'justConcentrateUsage';
export const SCHEMA_VERSION = 2;
const USAGE_RETENTION_DAYS = 30;

export const DEFAULT_SETTINGS = {
  // D5: friction is self-imposed. 'none' = overrides are instant, 'wait' =
  // cooling-off timer, 'passphrase' = type your own phrase, then the timer.
  frictionLevel: 'wait',
  passphrase: '',
  cooldownSeconds: 30,
  syncEnabled: false,
  onboardingComplete: false,
  trackTime: true,
  blockPageMessage: '',
  blockPageCss: ''
};

export const DEFAULT_DATA = {
  schemaVersion: SCHEMA_VERSION,
  schedules: [],
  lists: [],
  allowlist: [],
  budgets: [],          // [{ id, domain, minutes, enabled }]
  settings: DEFAULT_SETTINGS,
  focusSession: null,   // { startTime, endTime, blackout, domains, pomodoro? }
  suspensions: {}       // { 'schedule:<id>' | 'budget:<id>': untilTimestamp }
};

export const EMPTY_USAGE = { blockCounts: {}, escapeCounts: {}, siteTime: {} };

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Migration ───
// Upgrades a stored data object to the current schema. Pure: returns
// { data, usage, changed } where usage is any legacy usage block that must be
// moved to USAGE_KEY (or null).
export function migrateData(raw, now = Date.now()) {
  if (!raw) return { data: structuredClone(DEFAULT_DATA), usage: null, changed: true };
  if (raw.schemaVersion === SCHEMA_VERSION) return { data: raw, usage: null, changed: false };

  const data = { ...structuredClone(DEFAULT_DATA), ...raw };
  data.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  delete data.settings.theme;
  delete data.settings.snoozeDurationMinutes;
  data.schedules = (raw.schedules || []).map(s => ({ ...s }));

  // v1 "end early" disabled the schedule and stored commitmentEndTimes. v2
  // suspends it instead, so it resumes on its own at the next window.
  data.suspensions = { ...(raw.suspensions || {}) };
  for (const [id, until] of Object.entries(raw.commitmentEndTimes || {})) {
    const schedule = data.schedules.find(s => s.id === id);
    if (!schedule) continue;
    schedule.enabled = true;
    if (until > now) data.suspensions[`schedule:${id}`] = until;
  }
  delete data.commitmentEndTimes;
  delete data._snoozeUntil;

  let usage = null;
  if (raw.usage) {
    usage = {
      blockCounts: raw.usage.blockCounts || {},
      escapeCounts: raw.usage.escapeCounts || {},
      siteTime: raw.usage.siteTime || {}
    };
  }
  delete data.usage;

  data.configUpdatedAt = raw.updatedAt || 0;
  data.schemaVersion = SCHEMA_VERSION;
  return { data, usage, changed: true };
}

export async function getData() {
  const result = await chrome.storage.local.get(DATA_KEY);
  const { data, usage, changed } = migrateData(result[DATA_KEY]);
  if (changed) {
    if (usage) await chrome.storage.local.set({ [USAGE_KEY]: usage });
    await chrome.storage.local.set({ [DATA_KEY]: data });
  }
  return data;
}

// `config: false` marks runtime-state writes (focus sessions, suspensions,
// pruning). They bump updatedAt (which triggers a background refresh) but not
// configUpdatedAt, the timestamp sync's last-write-wins compares, and they're
// never written to sync.
export async function setData(data, { config = true } = {}) {
  data.updatedAt = Date.now();
  if (config) data.configUpdatedAt = data.updatedAt;
  await chrome.storage.local.set({ [DATA_KEY]: data });
  if (config && data.settings && data.settings.syncEnabled) {
    await writeSyncedConfig(data);
  }
}

// ─── Sync (D11: config only, last-write-wins) ───
// chrome.storage.sync allows 8KB per item and ~100KB total, so the config is
// serialized once and sharded across `justConcentrateSync.0..n`, with a meta
// item `justConcentrateSync` = { v: 2, updatedAt, chunks, hash }. Every write
// goes out in a single set() call, and unchanged payloads aren't rewritten.

export const SYNC_META_KEY = 'justConcentrateSync';
const SYNC_ITEM_QUOTA = 8192;
export const SYNC_TOTAL_QUOTA = 102400;
const SYNC_CHUNK_BUDGET = SYNC_ITEM_QUOTA - 512; // headroom for key + quoting

const utf8Length = s => new TextEncoder().encode(s).length;

export function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Split a string into pieces whose JSON-encoded UTF-8 size fits the budget.
export function chunkString(s, maxBytes = SYNC_CHUNK_BUDGET) {
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    let len = Math.min(s.length - i, maxBytes);
    while (len > 1 && utf8Length(JSON.stringify(s.slice(i, i + len))) > maxBytes) {
      len = Math.floor(len * 0.9);
    }
    // Don't split a surrogate pair.
    const code = s.charCodeAt(i + len - 1);
    if (len > 1 && code >= 0xd800 && code <= 0xdbff) len--;
    chunks.push(s.slice(i, i + len));
    i += len;
  }
  return chunks;
}

export function buildSyncPayload(data) {
  return {
    updatedAt: data.configUpdatedAt || data.updatedAt,
    schedules: data.schedules,
    lists: data.lists,
    allowlist: data.allowlist,
    budgets: data.budgets || [],
    settings: data.settings
  };
}

// Encode a payload into the sync items to write. Returns { items, json, bytes }.
export function encodeSyncPayload(payload) {
  const { updatedAt, ...config } = payload;
  const json = JSON.stringify(config);
  const chunks = chunkString(json);
  const items = { [SYNC_META_KEY]: { v: 2, updatedAt, chunks: chunks.length, hash: hashString(json) } };
  chunks.forEach((c, i) => { items[`${SYNC_META_KEY}.${i}`] = c; });
  let bytes = 0;
  for (const [k, v] of Object.entries(items)) bytes += k.length + utf8Length(JSON.stringify(v));
  return { items, json, bytes };
}

// Rebuild a payload from sync items, or null if incomplete/inconsistent
// (e.g. some chunks from a newer write haven't arrived yet).
export function decodeSyncPayload(items) {
  const meta = items[SYNC_META_KEY];
  if (!meta || typeof meta !== 'object') return null;
  if (meta.v !== 2) return meta.schedules ? meta : null; // v1: a single item
  let json = '';
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = items[`${SYNC_META_KEY}.${i}`];
    if (typeof chunk !== 'string') return null;
    json += chunk;
  }
  if (hashString(json) !== meta.hash) return null;
  try {
    return { ...JSON.parse(json), updatedAt: meta.updatedAt };
  } catch {
    return null;
  }
}

async function writeSyncedConfig(data) {
  const { items, bytes } = encodeSyncPayload(buildSyncPayload(data));
  if (bytes > SYNC_TOTAL_QUOTA) {
    console.warn('[JustConcentrate] Config too large to sync:', bytes, 'bytes');
    return;
  }
  try {
    const current = await chrome.storage.sync.get(null);
    const meta = items[SYNC_META_KEY];
    const remote = current[SYNC_META_KEY];
    if (remote && remote.hash === meta.hash) return;
    // Never overwrite a newer config from another profile that hasn't been applied yet.
    if (remote && (remote.updatedAt || 0) > (meta.updatedAt || 0)) return;
    const stale = Object.keys(current).filter(k => k.startsWith(`${SYNC_META_KEY}.`) && !(k in items));
    await chrome.storage.sync.set(items);
    if (stale.length) await chrome.storage.sync.remove(stale);
  } catch (err) {
    console.warn('[JustConcentrate] Sync write failed:', err.message);
  }
}

export async function readSyncedConfig() {
  try {
    return decodeSyncPayload(await chrome.storage.sync.get(null));
  } catch {
    return null;
  }
}

export function getSyncPayloadSize(data) {
  const { bytes } = encodeSyncPayload(buildSyncPayload(data));
  return { bytes, quota: SYNC_TOTAL_QUOTA, percent: Math.round((bytes / SYNC_TOTAL_QUOTA) * 100) };
}

// Apply a synced config payload from another Chrome profile.
// Last-write-wins: only applies if the payload is newer than local data
// (pass force=true to skip the timestamp check, e.g. when first enabling sync).
// Writes local-only — never echoes back to chrome.storage.sync.
export async function applySyncedConfig(payload, force = false) {
  if (!payload || typeof payload !== 'object') return false;
  const data = await getData();
  if (!force && (payload.updatedAt || 0) <= (data.configUpdatedAt || 0)) return false;

  data.schedules = payload.schedules || [];
  data.lists = payload.lists || [];
  data.allowlist = payload.allowlist || [];
  data.budgets = payload.budgets || [];
  // Merge settings but keep this profile's own sync toggle
  data.settings = { ...data.settings, ...(payload.settings || {}), syncEnabled: data.settings.syncEnabled };
  data.configUpdatedAt = payload.updatedAt || Date.now();
  data.updatedAt = Date.now();
  await chrome.storage.local.set({ [DATA_KEY]: data });
  return true;
}

// ─── Schedules ───

export async function getSchedules() {
  return (await getData()).schedules;
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
  delete data.suspensions[`schedule:${id}`];
  await setData(data);
}

// ─── Lists ───

export async function getLists() {
  return (await getData()).lists;
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
  for (const s of data.schedules) {
    if (s.listIds) s.listIds = s.listIds.filter(lid => lid !== id);
  }
  await setData(data);
}

// ─── Allowlist ───

export async function getAllowlist() {
  return (await getData()).allowlist;
}

export async function saveAllowlist(allowlist) {
  const data = await getData();
  data.allowlist = allowlist;
  await setData(data);
}

// ─── Daily time budgets ───

export async function getBudgets() {
  return (await getData()).budgets;
}

export async function saveBudget(budget) {
  const data = await getData();
  if (!budget.id) {
    budget.id = generateId();
    data.budgets.push(budget);
  } else {
    const idx = data.budgets.findIndex(b => b.id === budget.id);
    if (idx >= 0) data.budgets[idx] = budget;
    else data.budgets.push(budget);
  }
  await setData(data);
  return budget;
}

export async function deleteBudget(id) {
  const data = await getData();
  data.budgets = data.budgets.filter(b => b.id !== id);
  delete data.suspensions[`budget:${id}`];
  await setData(data);
}

// ─── Settings ───

export async function getSettings() {
  return (await getData()).settings;
}

export async function saveSettings(settings) {
  const data = await getData();
  data.settings = { ...data.settings, ...settings };
  await setData(data);
}

// ─── Focus sessions ───

export async function getFocusSession() {
  return (await getData()).focusSession;
}

export async function saveFocusSession(session) {
  const data = await getData();
  data.focusSession = session;
  await setData(data, { config: false });
}

export async function clearFocusSession() {
  const data = await getData();
  data.focusSession = null;
  await setData(data, { config: false });
}

// ─── Suspensions ("end block early" until the window ends) ───

export async function suspend(keys, until) {
  const data = await getData();
  for (const key of keys) data.suspensions[key] = until;
  await setData(data, { config: false });
}

export async function clearSuspension(key) {
  const data = await getData();
  delete data.suspensions[key];
  await setData(data, { config: false });
}

// The background's cached block state (see schedule-engine.js:computeBlockState).
export async function getCachedBlockState() {
  return (await chrome.storage.local.get('_blockState'))._blockState || null;
}

export function isBlockingAnything(state) {
  return !!state && (!!state.blackout || state.entries.length > 0);
}

// Drop expired suspensions and an ended focus session. Returns true if
// anything changed.
export async function pruneExpiredState(now = Date.now()) {
  const data = await getData();
  let changed = false;
  for (const [key, until] of Object.entries(data.suspensions)) {
    if (until <= now) { delete data.suspensions[key]; changed = true; }
  }
  if (data.focusSession && data.focusSession.endTime <= now) {
    data.focusSession = null;
    changed = true;
  }
  if (changed) await setData(data, { config: false });
  return changed;
}

// ─── Usage (local only, never synced) ───

export async function getUsage() {
  const result = await chrome.storage.local.get(USAGE_KEY);
  return { ...EMPTY_USAGE, ...(result[USAGE_KEY] || {}) };
}

// Usage writes are read-modify-write; serialize them so concurrent callers in
// the same context (block counts, time tracking) don't overwrite each other.
let usageQueue = Promise.resolve();

function updateUsage(mutate) {
  const run = usageQueue.then(async () => {
    const usage = await getUsage();
    mutate(usage);
    await chrome.storage.local.set({ [USAGE_KEY]: usage });
  });
  usageQueue = run.catch(() => {});
  return run;
}

const usageKey = (domain, date = new Date()) => `${domain}|${localDateKey(date)}`;

export async function recordBlock(domain) {
  await updateUsage(u => {
    const key = usageKey(domain);
    u.blockCounts[key] = (u.blockCounts[key] || 0) + 1;
  });
}

export async function recordEscape(domain) {
  await updateUsage(u => {
    const key = usageKey(domain);
    u.escapeCounts[key] = (u.escapeCounts[key] || 0) + 1;
  });
}

export async function addSiteTime(hostname, seconds, date = new Date()) {
  if (!hostname || seconds <= 0) return;
  await updateUsage(u => {
    const key = usageKey(hostname, date);
    u.siteTime[key] = (u.siteTime[key] || 0) + seconds;
  });
}

// Remove usage entries older than the retention window.
export function pruneUsage(usage, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - USAGE_RETENTION_DAYS);
  const cutoffKey = localDateKey(cutoff);
  const pruned = {};
  for (const field of Object.keys(EMPTY_USAGE)) {
    pruned[field] = {};
    for (const [key, value] of Object.entries(usage[field] || {})) {
      if (key.slice(key.lastIndexOf('|') + 1) >= cutoffKey) pruned[field][key] = value;
    }
  }
  return pruned;
}

export function pruneStoredUsage() {
  return updateUsage(u => Object.assign(u, pruneUsage(u)));
}

export function clearUsage() {
  return updateUsage(u => Object.assign(u, structuredClone(EMPTY_USAGE)));
}

// Dismissed coaching insights (local only).
const DISMISSED_KEY = 'justConcentrateDismissed';

export async function getDismissedInsights() {
  return (await chrome.storage.local.get(DISMISSED_KEY))[DISMISSED_KEY] || [];
}

export async function dismissInsight(id) {
  const dismissed = await getDismissedInsights();
  if (!dismissed.includes(id)) await chrome.storage.local.set({ [DISMISSED_KEY]: [...dismissed, id].slice(-200) });
}

// ─── Import / export (own format) ───

export async function exportData() {
  const data = await getData();
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    schedules: data.schedules,
    lists: data.lists,
    allowlist: data.allowlist,
    budgets: data.budgets,
    settings: data.settings
  }, null, 2);
}
