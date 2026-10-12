import { defineBackground } from 'wxt/utils/define-background';
import {
  getData, getUsage, getLists, saveList, getSettings,
  saveFocusSession, clearFocusSession, suspend, pruneExpiredState,
  recordBlock, recordEscape, addSiteTime, pruneStoredUsage,
  readSyncedConfig, applySyncedConfig, SYNC_META_KEY
} from '../../lib/storage.js';
import { domainMatches } from '../../lib/matching.js';
import {
  computeBlockState, evaluateUrl, getNextBoundary, getBlockingSources,
  isFocusActive, getPomodoroPhase, pomodoroEndTime
} from '../../lib/schedule-engine.js';
import { buildDnrRules } from '../../lib/dnr.js';
import { trackableHost, creditedSeconds } from '../../lib/tracking.js';
import { PRESETS, loadPresets } from '../../lib/templates.js';

// How blocking works (no host permissions, zero network):
//   1. declarativeNetRequest `block` rules stop matching top-level requests
//      before they leave the browser (lib/dnr.js).
//   2. The resulting ERR_BLOCKED_BY_CLIENT navigation error is turned into a
//      redirect to blocked.html (or the schedule's redirect URL).
//   3. onCommitted / history-state listeners catch anything the rules missed
//      (rule update races, single-page-app route changes for path entries).
// All three read the cached _blockState written by refresh().

export default defineBackground(() => {
  const BOUNDARY_ALARM = 'jc-boundary';
  const TICK_ALARM = 'jc-tick';
  const BLOCK_STATE_KEY = '_blockState';

  // ─── Refresh: recompute block state, rules, tabs, alarms ───
  // Serialized and coalesced: concurrent requests collapse into one extra pass.
  // Idempotent, so it's safe for our own storage writes to trigger it again.
  let refreshing = null;
  let refreshPending = false;

  function requestRefresh() {
    if (refreshing) {
      refreshPending = true;
      return refreshing;
    }
    refreshing = (async () => {
      do {
        refreshPending = false;
        await refresh();
      } while (refreshPending);
    })().catch(err => console.error('[JustConcentrate] refresh failed:', err))
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  async function refresh() {
    await pruneExpiredState();
    const data = await getData();
    const usage = await getUsage();
    const state = computeBlockState({ ...data, siteTime: usage.siteTime });

    await applyRules(buildDnrRules(state));
    // dataUpdatedAt records which config version this state was built from.
    await chrome.storage.local.set({ [BLOCK_STATE_KEY]: { ...state, dataUpdatedAt: data.updatedAt || 0 } });

    await recheckAllTabs(state);
    await chrome.alarms.create(BOUNDARY_ALARM, { when: getNextBoundary(data) });
    await updateBadge(data, state);
  }

  // Replace all dynamic rules. If Chrome rejects the batch (one bad rule fails
  // the whole update), fall back to adding rules one by one and skip the bad ones,
  // so a single invalid entry can't freeze blocking.
  async function applyRules(rules) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(r => r.id);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
    } catch (err) {
      console.warn('[JustConcentrate] rule batch rejected, adding individually:', err.message);
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
      for (const rule of rules) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
        } catch (e) {
          console.warn('[JustConcentrate] skipped invalid rule', rule.condition, e.message);
        }
      }
    }
  }

  async function getBlockState() {
    return (await chrome.storage.local.get(BLOCK_STATE_KEY))[BLOCK_STATE_KEY] || null;
  }

  // ─── Navigation intercept ───

  function blockedPageUrl(url) {
    return chrome.runtime.getURL('/blocked.html') + '?url=' + encodeURIComponent(url);
  }

  // Avoid double redirects when several listeners fire for one navigation.
  const recentRedirects = new Map();

  async function redirectIfBlocked(tabId, url, state) {
    if (tabId < 0) return false;
    const match = evaluateUrl(url, state || await getBlockState());
    if (!match) return false;
    const last = recentRedirects.get(tabId);
    if (last && last.url === url && Date.now() - last.time < 2000) return true;
    recentRedirects.set(tabId, { url, time: Date.now() });
    let target = blockedPageUrl(url);
    if (match.redirectUrl && !evaluateUrl(match.redirectUrl, state || await getBlockState())) {
      target = match.redirectUrl;
    }
    try {
      await chrome.tabs.update(tabId, { url: target });
    } catch { /* tab closed or prerendering */ }
    return true;
  }

  async function recheckAllTabs(state) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url) await redirectIfBlocked(tab.id, tab.url, state);
    }
  }

  chrome.webNavigation.onErrorOccurred.addListener(details => {
    if (details.frameId !== 0 || !String(details.error).includes('ERR_BLOCKED_BY_CLIENT')) return;
    redirectIfBlocked(details.tabId, details.url).catch(() => {});
  });

  chrome.webNavigation.onCommitted.addListener(details => {
    if (details.frameId !== 0) return;
    redirectIfBlocked(details.tabId, details.url).catch(() => {});
  });

  // Single-page apps change routes without a network request (path entries).
  for (const event of [chrome.webNavigation.onHistoryStateUpdated, chrome.webNavigation.onReferenceFragmentUpdated]) {
    event.addListener(details => {
      if (details.frameId !== 0) return;
      redirectIfBlocked(details.tabId, details.url).catch(() => {});
    });
  }

  // Count block attempts (once per tab+host per 10s).
  const recentBlocks = new Map();
  const BLOCK_DEDUP_MS = 10000;

  chrome.webNavigation.onBeforeNavigate.addListener(async details => {
    if (details.frameId !== 0) return;
    const match = evaluateUrl(details.url, await getBlockState());
    if (!match) return;
    const host = trackableHost(details.url);
    const key = `${details.tabId}|${host}`;
    const now = Date.now();
    for (const [k, t] of recentBlocks) if (now - t > BLOCK_DEDUP_MS) recentBlocks.delete(k);
    if (recentBlocks.has(key)) return;
    recentBlocks.set(key, now);
    await recordBlock(host);
  });

  // ─── Time-on-site tracking (local only) ───
  // Credits time to the active tab's host while a browser window has focus
  // and the user isn't idle. Feeds the Usage tab and daily time budgets.

  let trackingQueue = Promise.resolve();

  function flushTracking() {
    trackingQueue = trackingQueue.then(doFlushTracking).catch(() => {});
    return trackingQueue;
  }

  async function currentActiveHost(settings) {
    if (!settings.trackTime) return null;
    if ((await chrome.idle.queryState(60)) !== 'active') return null;
    let win;
    try { win = await chrome.windows.getLastFocused(); } catch { return null; }
    if (!win || !win.focused) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return tab ? trackableHost(tab.url) : null;
  }

  async function doFlushTracking() {
    const now = Date.now();
    const data = await getData();
    const { _track } = await chrome.storage.session.get('_track');
    let budgetTouched = false;
    if (_track && _track.host) {
      const seconds = creditedSeconds(_track.since, now);
      if (seconds > 0) {
        await addSiteTime(_track.host, seconds);
        budgetTouched = data.budgets.some(b => b.enabled && domainMatches(_track.host, b.domain));
      }
    }
    const host = await currentActiveHost(data.settings);
    await chrome.storage.session.set({ _track: { host, since: now } });
    if (budgetTouched) requestRefresh();
  }

  chrome.tabs.onActivated.addListener(() => { flushTracking(); });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) flushTracking();
  });
  chrome.windows.onFocusChanged.addListener(() => { flushTracking(); });
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener(() => { flushTracking(); });

  // ─── Toolbar badge ───
  // Minutes left in a focus session ("25m", "brk" during a Pomodoro break),
  // and a dot on the icon whenever anything is being blocked.

  function badgeText(session, nowMs) {
    if (!isFocusActive(session, nowMs)) return '';
    let end = session.endTime;
    if (session.pomodoro) {
      const phase = getPomodoroPhase(session, nowMs);
      if (phase.phase === 'break') return 'brk';
      end = phase.phaseEnd;
    }
    const minutes = Math.ceil((end - nowMs) / 60000);
    return minutes > 99 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
  }

  async function updateBadge(data, state) {
    data = data || await getData();
    state = state || await getBlockState();
    const text = badgeText(data.focusSession, Date.now());
    await chrome.action.setBadgeText({ text });
    if (text) await chrome.action.setBadgeBackgroundColor({ color: text === 'brk' ? '#0a7c5a' : '#1f4cff' });
    const isBlocking = state && (state.blackout || state.entries.length > 0);
    if (isBlocking) {
      await setIconWithDot();
    } else {
      await chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    }
  }

  async function setIconWithDot() {
    const imageData = {};
    for (const size of [16, 48]) {
      const resp = await fetch(chrome.runtime.getURL(`icons/icon${size}.png`));
      const bitmap = await createImageBitmap(await resp.blob());
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const r = Math.max(3, Math.round(size * 0.16));
      ctx.beginPath();
      ctx.arc(size - r - 1, r + 1, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1f4cff';
      ctx.fill();
      imageData[size] = ctx.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
  }

  // ─── Alarms ───

  chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === BOUNDARY_ALARM) {
      await requestRefresh();
    } else if (alarm.name === TICK_ALARM) {
      await flushTracking();
      await updateBadge();
    }
  });

  // ─── Storage changes ───

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.justConcentrate) {
      requestRefresh();
    }
    // Sync read-back: config changed on another Chrome profile.
    // Shards can arrive after the meta item, so react to any of them.
    if (area === 'sync' && Object.keys(changes).some(k => k.startsWith(SYNC_META_KEY))) {
      const settings = await getSettings();
      if (!settings.syncEnabled) return;
      // Last-write-wins inside applySyncedConfig also skips our own writes
      // echoing back (their updatedAt equals the local updatedAt).
      await applySyncedConfig(await readSyncedConfig());
    }
  });

  async function pullSyncedConfig() {
    const settings = await getSettings();
    if (!settings.syncEnabled) return;
    await applySyncedConfig(await readSyncedConfig());
  }

  // ─── Live presets: re-sync bundled "live" lists on update ───

  async function refreshLivePresets() {
    await loadPresets();
    for (const list of await getLists()) {
      if (list.origin === 'live' && list.presetKey && PRESETS[list.presetKey]) {
        list.sites = [...PRESETS[list.presetKey].sites];
        await saveList(list);
      }
    }
  }

  // ─── Messages ───

  async function handleMessage(message) {
    switch (message.type) {
      case 'refreshRules':
        await requestRefresh();
        return { success: true };

      case 'getBlockInfo':
        return { match: evaluateUrl(message.url, await getBlockState()) };

      case 'startFocus': {
        const startTime = Date.now();
        const pomodoro = message.pomodoro || null;
        await saveFocusSession({
          startTime,
          endTime: pomodoro ? pomodoroEndTime(startTime, pomodoro) : startTime + message.duration * 60000,
          blackout: !!message.blackout,
          domains: message.domains || [],
          ...(pomodoro ? { pomodoro } : {})
        });
        await requestRefresh();
        return { success: true };
      }

      case 'endFocus':
        await clearFocusSession();
        await recordEscape('focus');
        await requestRefresh();
        return { success: true };

      case 'endBlockEarly': {
        // Lift everything blocking this URL until it would have ended anyway:
        // schedules until their window ends, budgets until midnight, and the
        // focus session entirely. Schedules resume on their next window.
        const data = await getData();
        const usage = await getUsage();
        const sources = getBlockingSources({ ...data, siteTime: usage.siteTime }, message.url);
        for (const source of sources) {
          if (source.focus) await clearFocusSession();
          else await suspend([source.key], source.until);
        }
        await recordEscape(trackableHost(message.url) || 'unknown');
        await requestRefresh();
        return { success: true, lifted: sources.length };
      }

    }
  }

  const MESSAGE_TYPES = new Set(['refreshRules', 'getBlockInfo', 'startFocus', 'endFocus', 'endBlockEarly']);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !MESSAGE_TYPES.has(message.type)) return false;
    handleMessage(message)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  });

  // ─── Lifecycle ───
  // The worker can be stopped at any time and the extension can be disabled
  // and re-enabled; neither fires onStartup. A session-storage flag makes the
  // first wake-up after any of these re-apply rules and alarms, so turning the
  // extension off and on doesn't clear an active block (resume-on-re-enable).

  async function initialize() {
    await chrome.storage.session.set({ _initialized: true });
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
    await requestRefresh();
  }

  (async () => {
    const { _initialized } = await chrome.storage.session.get('_initialized');
    if (!_initialized) await initialize();
  })().catch(err => console.error('[JustConcentrate] init failed:', err));

  chrome.runtime.onInstalled.addListener(async details => {
    await getData(); // runs any schema migration
    await pullSyncedConfig();
    if (details.reason === 'update') await refreshLivePresets();
    await pruneStoredUsage();
    await initialize();
    if (details.reason === 'install') {
      const settings = await getSettings();
      if (!settings.onboardingComplete) {
        chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
      }
    }
  });

  chrome.runtime.onStartup.addListener(async () => {
    await pullSyncedConfig();
    await pruneStoredUsage();
    await initialize();
  });
});
