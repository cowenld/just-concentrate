import { defineBackground } from 'wxt/utils/define-background';
import {
  getData, setData, getSchedules, saveSchedule,
  getLists, saveList, getAllowlist,
  getSettings, saveSettings, getFocusSession, saveFocusSession, clearFocusSession,
  recordBlock, recordEscape,
  getCommitmentEndTimes, setCommitmentEndTime, clearCommitmentEndTime,
  applySyncedConfig
} from '../../lib/storage.js';
import {
  domainMatches, getEffectiveBlocklist
} from '../../lib/matching.js';
import {
  isScheduleActive, getActiveBlockedDomains, getNextWindowBoundary, getWindowEndTimestamp
} from '../../lib/schedule-engine.js';
import { PRESETS, loadPresets } from '../../lib/templates.js';

export default defineBackground(() => {
  const ALARM_NAME = 'jc-check';
  const DNR_RULE_START_ID = 1;
  let isUpdatingRules = false;

  // ─── Timer: active-session info ───
  async function getActiveSessionInfo() {
    const now = new Date();
    const focusSession = await getFocusSession();
    if (focusSession && focusSession.endTime > now.getTime()) {
      return { active: true, endTime: focusSession.endTime, label: 'Focus Now' };
    }
    const schedules = await getSchedules();
    let best = null;
    for (const schedule of schedules) {
      if (!isScheduleActive(schedule, now)) continue;
      const end = getWindowEndTimestamp(schedule, now);
      if (end > now.getTime() && (!best || end < best.endTime)) {
        best = { active: true, endTime: end, label: schedule.name };
      }
    }
    return best || { active: false, endTime: 0, label: '' };
  }

  // ─── Badge timer via offscreen document ───

  async function ensureOffscreen() {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (contexts.length) return;
    } catch { /* getContexts unavailable */ }
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen/index.html',
        reasons: ['BLOBS'],
        justification: 'Badge countdown ticker',
      });
    } catch { /* already exists or unavailable */ }
  }

  async function closeOffscreen() {
    try { await chrome.offscreen.closeDocument(); } catch { /* not open */ }
  }

  async function startBadgeTimer() {
    const info = await getActiveSessionInfo();
    if (!info.active) { await stopBadgeTimer(); return; }
    await ensureOffscreen();
    try {
      await chrome.runtime.sendMessage({ type: 'tickerStart', endTime: info.endTime });
    } catch { /* offscreen not ready yet — it self-syncs on load */ }
  }

  async function stopBadgeTimer() {
    try {
      await chrome.runtime.sendMessage({ type: 'tickerStop' });
    } catch { /* no listener */ }
    await closeOffscreen();
    await updateBadgeStatus();
  }

  async function updateBadgeStatus() {
    const state = (await chrome.storage.local.get('_blockState'))._blockState;
    const isBlocking = state && (state.blackout || (state.domains && state.domains.length > 0));
    chrome.action.setBadgeText({ text: '' });
    if (isBlocking) {
      await setIconWithDot();
    } else {
      chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
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
    chrome.action.setIcon({ imageData });
  }

  // ─── Live presets: re-sync bundled "live" lists on update ───

  async function refreshLivePresets() {
    await loadPresets();
    const lists = await getLists();
    isUpdatingRules = true;
    try {
      for (const list of lists) {
        if (list.origin === 'live' && list.presetKey && PRESETS[list.presetKey]) {
          list.sites = [...PRESETS[list.presetKey].sites];
          await saveList(list);
        }
      }
    } finally {
      isUpdatingRules = false;
    }
  }

  async function updateBlockingRules() {
    isUpdatingRules = true;
    try {
      const [schedules, lists, allowlistEntries, focusSession] = await Promise.all([
        getSchedules(), getLists(), getAllowlist(), getFocusSession()
      ]);

      const result = getActiveBlockedDomains(schedules, lists, allowlistEntries, focusSession);
      const rules = [];
      let ruleId = DNR_RULE_START_ID;

      if (result.blackout) {
        await chrome.storage.local.set({
          _blockState: {
            blackout: true,
            allowlist: result.allowlist,
            scheduleName: result.scheduleName,
            domains: []
          }
        });
      } else {
        // Filter out allowlisted and snoozed domains
        const data = await getData();
        const snoozeUntil = data._snoozeUntil || {};
        const now2 = Date.now();
        const filteredDomains = result.domains.filter(d =>
          !allowlistEntries.some(a => domainMatches(d, a)) &&
          !(snoozeUntil[d] && snoozeUntil[d] > now2)
        );

        // Single pass over active schedules builds both the domain→schedule-name
        // map (for the block page) and the domain→redirect-URL map.
        const domainScheduleMap = {};
        const domainRedirectMap = {};
        const now = new Date();
        for (const schedule of schedules) {
          if (!isScheduleActive(schedule, now)) continue;
          const effective = getEffectiveBlocklist(schedule, lists);
          const redirectUrl = schedule.action === 'redirect' && schedule.redirectUrl
            ? schedule.redirectUrl : null;
          for (const d of effective) {
            if (!domainScheduleMap[d]) domainScheduleMap[d] = schedule.name;
            if (redirectUrl && !domainRedirectMap[d]) domainRedirectMap[d] = redirectUrl;
          }
        }
        if (focusSession && focusSession.endTime > now.getTime()) {
          for (const d of (focusSession.domains || [])) {
            if (!domainScheduleMap[d]) domainScheduleMap[d] = 'Focus Now';
          }
        }

        for (const domain of filteredDomains) {
          const sName = domainScheduleMap[domain] || '';
          const redirectUrl = domainRedirectMap[domain];
          const ruleAction = redirectUrl
            ? { type: 'redirect', redirect: { url: redirectUrl } }
            : { type: 'redirect', redirect: { extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&schedule=${encodeURIComponent(sName)}` } };

          rules.push({
            id: ruleId++,
            priority: 1,
            action: ruleAction,
            condition: {
              urlFilter: `||${domain}`,
              resourceTypes: ['main_frame']
            }
          });
        }

        await chrome.storage.local.set({
          _blockState: {
            blackout: false,
            allowlist: allowlistEntries,
            domains: filteredDomains,
            scheduleName: '',
            // Cache the per-domain schedule name so the navigation handler can
            // label the block page without re-reading schedules/lists.
            scheduleNames: domainScheduleMap
          }
        });
      }

      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeIds = existingRules.map(r => r.id);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeIds,
        addRules: rules
      });

      await updateBadgeStatus();
    } finally {
      isUpdatingRules = false;
    }
  }

  async function checkAndRedirectTab(tabId, url) {
    const state = (await chrome.storage.local.get('_blockState'))._blockState;
    if (!state) return;

    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return;
    }

    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

    let shouldBlock = false;
    let scheduleName = state.scheduleName || '';

    if (state.blackout) {
      const isAllowed = state.allowlist.some(d => domainMatches(hostname, d));
      if (!isAllowed) {
        shouldBlock = true;
        scheduleName = state.scheduleName || 'Blackout';
      }
    } else {
      const scheduleNames = state.scheduleNames || {};
      for (const domain of state.domains) {
        if (domainMatches(hostname, domain)) {
          shouldBlock = true;
          // Use the cached label for the matched domain (avoids re-reading storage).
          scheduleName = scheduleNames[domain] || scheduleName;
          break;
        }
      }
    }

    if (shouldBlock) {
      const blockedUrl = chrome.runtime.getURL(
        `blocked.html?domain=${encodeURIComponent(hostname)}&schedule=${encodeURIComponent(scheduleName)}`
      );
      chrome.tabs.update(tabId, { url: blockedUrl });
    }
  }

  async function recheckAllTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url) {
        await checkAndRedirectTab(tab.id, tab.url);
      }
    }
  }

  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    await checkAndRedirectTab(details.tabId, details.url);
  });

  const _recentBlocks = new Map();
  const BLOCK_DEDUP_MS = 10000;

  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const url = details.url;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return; }

    const state = (await chrome.storage.local.get('_blockState'))._blockState;
    if (!state) return;

    let shouldRecord = false;
    let scheduleName = '';
    if (state.blackout) {
      const isAllowed = state.allowlist.some(d => domainMatches(hostname, d));
      if (!isAllowed) { shouldRecord = true; scheduleName = state.scheduleName || 'Blackout'; }
    } else if (state.domains) {
      for (const domain of state.domains) {
        if (domainMatches(hostname, domain)) { shouldRecord = true; break; }
      }
    }

    if (shouldRecord) {
      const dedupKey = `${details.tabId}|${hostname}`;
      const now = Date.now();
      // Prune stale entries so the dedup map stays bounded over long sessions.
      for (const [key, time] of _recentBlocks) {
        if (now - time > BLOCK_DEDUP_MS) _recentBlocks.delete(key);
      }
      const lastTime = _recentBlocks.get(dedupKey);
      if (!lastTime || now - lastTime > BLOCK_DEDUP_MS) {
        _recentBlocks.set(dedupKey, now);
        await recordBlock(hostname, scheduleName);
      }
    }
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      await updateBlockingRules();
      await recheckAllTabs();

      await startBadgeTimer();
      scheduleNextAlarm();
    } else if (alarm.name === 'jc-focus-end') {
      await clearFocusSession();
      await updateBlockingRules();
      await recheckAllTabs();

      await startBadgeTimer();
    } else if (alarm.name.startsWith('snooze-end-')) {
      const domain = alarm.name.replace('snooze-end-', '');
      const data = await getData();
      if (data._snoozeUntil) {
        delete data._snoozeUntil[domain];
        await setData(data);
      }
      await updateBlockingRules();
      await recheckAllTabs();
    }
  });

  async function scheduleNextAlarm() {
    const schedules = await getSchedules();
    const minutes = getNextWindowBoundary(schedules);
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: Math.max(1, minutes) });
  }

  // C3 fix: guard against re-entrant updates from our own writes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.justConcentrate && !isUpdatingRules) {
      await updateBlockingRules();
      scheduleNextAlarm();
    }

    // Sync read-back: config changed on another Chrome profile
    if (area === 'sync' && changes.justConcentrateSync && changes.justConcentrateSync.newValue) {
      const settings = await getSettings();
      if (!settings.syncEnabled) return;
      // Last-write-wins guard inside applySyncedConfig also skips our own
      // writes echoing back (their updatedAt equals local updatedAt).
      isUpdatingRules = true;
      let applied = false;
      try {
        applied = await applySyncedConfig(changes.justConcentrateSync.newValue);
      } finally {
        isUpdatingRules = false;
      }
      if (applied) {
        await updateBlockingRules();
        await recheckAllTabs();
        scheduleNextAlarm();
      }
    }
  });

  // Pull synced config on browser/extension startup (catches changes made
  // on other profiles while this one wasn't running).
  async function pullSyncedConfig() {
    const settings = await getSettings();
    if (!settings.syncEnabled) return;
    try {
      const res = await chrome.storage.sync.get('justConcentrateSync');
      if (res.justConcentrateSync) {
        await applySyncedConfig(res.justConcentrateSync);
      }
    } catch { /* sync unavailable */ }
  }

  // C2 fix: wrap all async message handlers with error handling
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'startFocus') {
      (async () => {
        const session = {
          startTime: Date.now(),
          endTime: Date.now() + (message.duration * 60 * 1000),
          blackout: message.blackout || false,
          domains: message.domains || []
        };
        await saveFocusSession(session);
        chrome.alarms.create('jc-focus-end', {
          delayInMinutes: message.duration
        });
        await updateBlockingRules();
        await recheckAllTabs();
  
        await startBadgeTimer();
        sendResponse({ success: true });
      })().catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (message.type === 'refreshRules') {
      (async () => {
        await updateBlockingRules();
        await recheckAllTabs();
        sendResponse({ success: true });
      })().catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (message.type === 'endBlockEarly') {
      (async () => {
        isUpdatingRules = true;
        try {
          const focusSession = await getFocusSession();
          if (focusSession && focusSession.endTime > Date.now()) {
            await clearFocusSession();
            chrome.alarms.clear('jc-focus-end');
          }

          const schedules = await getSchedules();
          const lists = await getLists();
          const now = new Date();
          for (const schedule of schedules) {
            if (!isScheduleActive(schedule, now)) continue;
            const effective = getEffectiveBlocklist(schedule, lists);
            if (effective.some(d => domainMatches(message.domain, d)) || schedule.blackout) {
              schedule.enabled = false;
              await saveSchedule(schedule);
              const [endH, endM] = schedule.endTime.split(':').map(Number);
              const endDate = new Date(now);
              endDate.setHours(endH, endM, 0, 0);
              if (endDate <= now) endDate.setDate(endDate.getDate() + 1);
              await setCommitmentEndTime(schedule.id, endDate.getTime());
            }
          }
          await recordEscape(message.domain, 'endEarly');
        } finally {
          isUpdatingRules = false;
        }
        await updateBlockingRules();
        await recheckAllTabs();
        sendResponse({ success: true });
      })().catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (message.type === 'getTimerState') {
      (async () => {
        sendResponse(await getActiveSessionInfo());
      })().catch(err => sendResponse({ active: false, error: err.message }));
      return true;
    }
    if (message.type === 'badgeTick') {
      if (message.text) {
        chrome.action.setBadgeText({ text: message.text });
        chrome.action.setBadgeBackgroundColor({ color: '#1f4cff' });
      } else {
        closeOffscreen();
        updateBadgeStatus();
      }
      return;
    }
  });

  // Resume-on-re-enable: check commitment end times on startup
  async function checkCommitmentEndTimes() {
    const endTimes = await getCommitmentEndTimes();
    const schedules = await getSchedules();
    const now = Date.now();
    for (const schedule of schedules) {
      const commitEnd = endTimes[schedule.id];
      if (commitEnd && commitEnd > now && !schedule.enabled) {
        schedule.enabled = true;
        await saveSchedule(schedule);
        await clearCommitmentEndTime(schedule.id);
      } else if (commitEnd && commitEnd <= now) {
        await clearCommitmentEndTime(schedule.id);
      }
    }
  }

  chrome.runtime.onInstalled.addListener(async (details) => {
    await getData();
    await pullSyncedConfig();
    await checkCommitmentEndTimes();
    if (details.reason === 'update') {
      await refreshLivePresets();
    }

    await updateBlockingRules();
    await startBadgeTimer();
    scheduleNextAlarm();
    if (details.reason === 'install') {
      const settings = await getSettings();
      if (!settings.onboardingComplete) {
        chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
      }
    }
  });

  chrome.runtime.onStartup.addListener(async () => {
    await pullSyncedConfig();
    await checkCommitmentEndTimes();

    await updateBlockingRules();
    await startBadgeTimer();
    scheduleNextAlarm();
  });
});
