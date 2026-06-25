import { saveList, saveSchedule, getLists } from './storage.js';

/* ── Bundled presets ──
   "frozen" presets become a one-time snapshot the user owns.
   "live" presets (origin: 'live') re-sync from the bundled JSON on
   extension update — see background.js:refreshLivePresets(). */
export const PRESETS = {
  social: null,
  news: null,
  streaming: null,
  adult: null
};

export async function loadPresets() {
  for (const key of Object.keys(PRESETS)) {
    if (PRESETS[key]) continue; // already loaded
    try {
      const url = chrome.runtime.getURL(`presets/${key}.json`);
      const resp = await fetch(url);
      PRESETS[key] = await resp.json();
    } catch { /* preset not found */ }
  }
}

/* ── Onboarding / empty-state templates ── */
export const TEMPLATES = {
  work: {
    schedule: {
      name: 'Work focus',
      days: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      blackout: false,
      adHocSites: [],
      listIds: [],
      enabled: true
    },
    presetKeys: ['social'],
    label: 'Work Focus'
  },
  bedtime: {
    schedule: {
      name: 'Bedtime',
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '22:00',
      endTime: '07:00',
      blackout: false,
      adHocSites: [],
      listIds: [],
      enabled: true
    },
    presetKeys: ['social', 'streaming'],
    label: 'Bedtime'
  },
  deepwork: {
    schedule: {
      name: 'Deep work',
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      blackout: true,
      adHocSites: [],
      listIds: [],
      enabled: false
    },
    presetKeys: [],
    label: 'Deep Work'
  }
};

/* ── Apply a template to storage (no UI side effects) ──
   Creates the template's preset lists (frozen) + the schedule.
   Returns { siteCount, listIds }. Caller is responsible for
   refreshing rules and any UI. */
export async function applyTemplateToStorage(templateKey) {
  const template = TEMPLATES[templateKey];
  if (!template) return { siteCount: 0, listIds: [] };

  await loadPresets();

  const listIds = [];
  let siteCount = 0;
  for (const presetKey of template.presetKeys) {
    const preset = PRESETS[presetKey];
    if (preset) {
      const list = await saveList({
        name: preset.name,
        sites: [...preset.sites],
        origin: 'frozen'
      });
      listIds.push(list.id);
      siteCount += preset.sites.length;
    }
  }

  const schedule = { ...template.schedule, listIds };
  await saveSchedule(schedule);
  return { siteCount, listIds };
}

/* ── Add a single preset as a reusable list ──
   Live presets are stored with origin 'live' + presetKey so they can
   be re-synced on update. Skips if an equivalent list already exists.
   Returns { list, created }. */
export async function addPresetList(presetKey) {
  await loadPresets();
  const preset = PRESETS[presetKey];
  if (!preset) return { list: null, created: false };

  const isLive = preset.origin === 'live';
  const existing = await getLists();
  const match = existing.find(l =>
    (isLive && l.presetKey === presetKey) || l.name === preset.name
  );
  if (match) return { list: match, created: false };

  const list = await saveList({
    name: preset.name,
    sites: [...preset.sites],
    origin: isLive ? 'live' : 'frozen',
    ...(isLive ? { presetKey } : {})
  });
  return { list, created: true };
}
