import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import {
  migrateData, getData, saveSettings, saveSchedule, deleteList, saveList,
  recordBlock, addSiteTime, getUsage, pruneUsage, suspend, pruneExpiredState,
  chunkString, encodeSyncPayload, decodeSyncPayload, applySyncedConfig, readSyncedConfig,
  DEFAULT_SETTINGS, SCHEMA_VERSION, SYNC_META_KEY
} from './storage.js';
import { localDateKey } from './schedule-engine.js';

let chrome;
beforeEach(() => { chrome = installChromeMock(); });

describe('migrateData', () => {
  it('creates defaults when nothing is stored', () => {
    const { data, changed } = migrateData(undefined);
    expect(changed).toBe(true);
    expect(data.settings.frictionLevel).toBe('wait');
    expect(data.budgets).toEqual([]);
  });

  it('upgrades v1 data: usage split out, commitments become suspensions, dead settings dropped', () => {
    const now = 1000;
    const v1 = {
      schedules: [{ id: 'a', enabled: false }, { id: 'b', enabled: false }],
      lists: [], allowlist: [],
      settings: { frictionLevel: 'passphrase', passphrase: 'mine', theme: 'system', snoozeDurationMinutes: 5 },
      usage: { blockCounts: { 'x.com|2024-01-01': 2 }, escapeCounts: {}, snoozeCounts: { y: 1 }, siteTime: {} },
      commitmentEndTimes: { a: 5000, b: 500 },
      _snoozeUntil: {}
    };
    const { data, usage, changed } = migrateData(v1, now);
    expect(changed).toBe(true);
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, frictionLevel: 'passphrase', passphrase: 'mine' });
    expect(data.schedules.every(s => s.enabled)).toBe(true);
    expect(data.suspensions).toEqual({ 'schedule:a': 5000 });
    expect(data.usage).toBeUndefined();
    expect(data.commitmentEndTimes).toBeUndefined();
    expect(usage).toEqual({ blockCounts: { 'x.com|2024-01-01': 2 }, escapeCounts: {}, siteTime: {} });
  });

  it('leaves current-schema data alone', () => {
    const current = { schemaVersion: SCHEMA_VERSION, schedules: [] };
    expect(migrateData(current)).toEqual({ data: current, usage: null, changed: false });
  });
});

describe('getData', () => {
  it('persists the migration, moving usage to its own key', async () => {
    await chrome.storage.local.set({ justConcentrate: { schedules: [], lists: [], allowlist: [], settings: {}, usage: { blockCounts: { 'a|b': 1 } } } });
    const data = await getData();
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    const stored = chrome.storage.local._dump();
    expect(stored.justConcentrate.usage).toBeUndefined();
    expect(stored.justConcentrateUsage.blockCounts).toEqual({ 'a|b': 1 });
  });
});

describe('usage', () => {
  it('records blocks and site time under local-date keys', async () => {
    await recordBlock('reddit.com');
    await recordBlock('reddit.com');
    await addSiteTime('reddit.com', 30);
    await addSiteTime('reddit.com', 15);
    const usage = await getUsage();
    const key = `reddit.com|${localDateKey()}`;
    expect(usage.blockCounts[key]).toBe(2);
    expect(usage.siteTime[key]).toBe(45);
  });

  it('does not touch the config key (no rule rebuild / sync write)', async () => {
    await recordBlock('reddit.com');
    expect(chrome.storage.local._dump().justConcentrate).toBeUndefined();
  });

  it('prunes entries older than 30 days', () => {
    const now = new Date(2024, 1, 15);
    const usage = { blockCounts: { 'a|2024-02-14': 1, 'a|2024-01-01': 1 }, escapeCounts: {}, siteTime: { 'a|2024-01-20': 5 } };
    expect(pruneUsage(usage, now)).toEqual({ blockCounts: { 'a|2024-02-14': 1 }, escapeCounts: {}, siteTime: { 'a|2024-01-20': 5 } });
  });
});

describe('suspensions and focus expiry', () => {
  it('prunes expired suspensions and ended focus sessions', async () => {
    await suspend(['schedule:a', 'budget:b'], 100);
    const data = await getData();
    data.focusSession = { endTime: 50 };
    await chrome.storage.local.set({ justConcentrate: data });
    expect(await pruneExpiredState(75)).toBe(true);
    const after = await getData();
    expect(after.focusSession).toBe(null);
    expect(after.suspensions).toEqual({ 'schedule:a': 100, 'budget:b': 100 });
    await pruneExpiredState(200);
    expect((await getData()).suspensions).toEqual({});
  });
});

describe('deleteList', () => {
  it('detaches the list from schedules', async () => {
    const list = await saveList({ name: 'L', sites: ['a.com'] });
    await saveSchedule({ name: 'S', listIds: [list.id, 'other'] });
    await deleteList(list.id);
    expect((await getData()).schedules[0].listIds).toEqual(['other']);
  });
});

describe('sync sharding', () => {
  it('chunks strings within the byte budget, including multi-byte text', () => {
    const s = 'é'.repeat(5000) + 'a'.repeat(5000) + '"'.repeat(3000);
    const chunks = chunkString(s, 4000);
    expect(chunks.join('')).toBe(s);
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(4000);
  });

  it('round-trips a large payload through sync items', () => {
    const lists = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, name: `List ${i}`, sites: Array.from({ length: 30 }, (_, j) => `site-${i}-${j}.example.com`) }));
    const payload = { updatedAt: 42, schedules: [], lists, allowlist: [], budgets: [], settings: {} };
    const { items, bytes } = encodeSyncPayload(payload);
    expect(items[SYNC_META_KEY].chunks).toBeGreaterThan(1);
    expect(bytes).toBeGreaterThan(8192);
    for (const [k, v] of Object.entries(items)) expect(k.length + JSON.stringify(v).length).toBeLessThanOrEqual(8192);
    expect(decodeSyncPayload(items)).toEqual(payload);
  });

  it('rejects incomplete or mismatched chunk sets', () => {
    const { items } = encodeSyncPayload({ updatedAt: 1, schedules: [], lists: [{ name: 'x'.repeat(20000) }], allowlist: [], budgets: [], settings: {} });
    const missing = { ...items };
    delete missing[`${SYNC_META_KEY}.1`];
    expect(decodeSyncPayload(missing)).toBe(null);
    expect(decodeSyncPayload({ ...items, [`${SYNC_META_KEY}.0`]: 'tampered' })).toBe(null);
  });

  it('still reads a v1 single-item payload', () => {
    const v1 = { updatedAt: 5, schedules: [{ id: 'a' }], lists: [], allowlist: [], settings: {} };
    expect(decodeSyncPayload({ [SYNC_META_KEY]: v1 })).toEqual(v1);
  });

  it('writes shards when sync is on, skips unchanged writes, and removes stale shards', async () => {
    await saveSettings({ syncEnabled: true });
    const big = { name: 'Big', sites: Array.from({ length: 900 }, (_, i) => `s${i}.example.com`) };
    await saveList(big);
    const first = chrome.storage.sync._dump();
    expect(first[SYNC_META_KEY].chunks).toBeGreaterThan(1);
    expect((await readSyncedConfig()).lists[0].sites.length).toBe(900);

    // Shrink: stale shards must be removed.
    big.sites = ['one.com'];
    await saveList(big);
    const after = chrome.storage.sync._dump();
    expect(after[SYNC_META_KEY].chunks).toBe(1);
    expect(Object.keys(after).filter(k => k.startsWith(`${SYNC_META_KEY}.`))).toEqual([`${SYNC_META_KEY}.0`]);
  });

  it('applies newer synced config but keeps the local sync toggle', async () => {
    await saveSettings({ syncEnabled: true });
    const applied = await applySyncedConfig({ updatedAt: Date.now() + 10000, schedules: [{ id: 'r' }], lists: [], allowlist: ['a.com'], budgets: [{ id: 'b' }], settings: { syncEnabled: false, cooldownSeconds: 60 } });
    expect(applied).toBe(true);
    const data = await getData();
    expect(data.settings.syncEnabled).toBe(true);
    expect(data.settings.cooldownSeconds).toBe(60);
    expect(data.budgets).toEqual([{ id: 'b' }]);
    expect(await applySyncedConfig({ updatedAt: 1, schedules: [] })).toBe(false);
  });
});

describe('sync last-write-wins vs runtime state', () => {
  it('runtime-state writes do not bump configUpdatedAt or write to sync', async () => {
    await saveSettings({ syncEnabled: true });
    const before = (await getData()).configUpdatedAt;
    const syncBefore = JSON.stringify(chrome.storage.sync._dump());
    await suspend(['schedule:x'], Date.now() + 1000);
    expect((await getData()).configUpdatedAt).toBe(before);
    expect(JSON.stringify(chrome.storage.sync._dump())).toBe(syncBefore);
  });

  it('a newer remote config is applied even after local runtime writes', async () => {
    await saveSettings({ syncEnabled: true });
    const remoteTime = Date.now() + 5;
    await new Promise(r => setTimeout(r, 10));
    await suspend(['schedule:x'], Date.now() + 1000); // bumps updatedAt past remoteTime
    expect(await applySyncedConfig({ updatedAt: remoteTime, schedules: [{ id: 'remote' }], lists: [], allowlist: [] })).toBe(true);
  });

  it('never overwrites a newer remote config that has not been applied yet', async () => {
    await saveSettings({ syncEnabled: true });
    await chrome.storage.sync.set({ [SYNC_META_KEY]: { v: 2, updatedAt: Date.now() + 60000, chunks: 0, hash: 'other' } });
    await saveSchedule({ name: 'local edit' });
    expect(chrome.storage.sync._dump()[SYNC_META_KEY].hash).toBe('other');
  });
});

describe('usage write serialization', () => {
  it('concurrent usage writes are not lost', async () => {
    await Promise.all([recordBlock('a.com'), addSiteTime('a.com', 30), recordBlock('a.com'), addSiteTime('a.com', 30)]);
    const usage = await getUsage();
    const key = `a.com|${localDateKey()}`;
    expect(usage.blockCounts[key]).toBe(2);
    expect(usage.siteTime[key]).toBe(60);
  });
});
