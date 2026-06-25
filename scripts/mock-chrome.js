// Mock chrome APIs for browser preview. Only runs outside the extension context.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  // Real extension — skip mocking
} else {

const MOCK_DATA = {
  justConcentrate: {
    schedules: [
      {
        id: 'sched-1',
        name: 'Work Focus',
        days: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00',
        blackout: false,
        action: 'block',
        adHocSites: ['reddit.com', 'news.ycombinator.com'],
        listIds: ['list-1', 'list-2'],
        enabled: true
      },
      {
        id: 'sched-2',
        name: 'Bedtime',
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: '22:00',
        endTime: '06:00',
        blackout: true,
        action: 'block',
        adHocSites: [],
        listIds: ['list-1', 'list-3'],
        enabled: true
      },
      {
        id: 'sched-3',
        name: 'Deep Work',
        days: [],
        startTime: '00:00',
        endTime: '23:59',
        blackout: true,
        action: 'redirect',
        redirectUrl: 'https://focusblock.app/breathe',
        adHocSites: [],
        listIds: [],
        enabled: false
      }
    ],
    lists: [
      { id: 'list-1', name: 'Social Media', origin: 'frozen', sites: ['twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'linkedin.com'] },
      { id: 'list-2', name: 'News', origin: 'frozen', sites: ['cnn.com', 'bbc.com', 'nytimes.com', 'theguardian.com'] },
      { id: 'list-3', name: 'Streaming', origin: 'frozen', sites: ['youtube.com', 'netflix.com', 'twitch.tv', 'disneyplus.com'] }
    ],
    allowlist: ['mail.google.com', 'calendar.google.com', 'docs.google.com', 'github.com', 'notion.so', 'linear.app', 'stackoverflow.com', 'figma.com'],
    settings: {
      frictionLevel: 'passphrase',
      passphrase: 'I choose focus over impulse',
      theme: 'light',
      syncEnabled: false,
      cooldownSeconds: 30,
      snoozeDurationMinutes: 5,
      onboardingComplete: true
    },
    focusSession: null,
    usage: {
      blockCounts: {
        'twitter.com|2026-06-17': 8,
        'twitter.com|2026-06-16': 12,
        'twitter.com|2026-06-15': 6,
        'reddit.com|2026-06-17': 5,
        'reddit.com|2026-06-16': 7,
        'youtube.com|2026-06-17': 3,
        'youtube.com|2026-06-16': 9,
        'instagram.com|2026-06-17': 4,
        'instagram.com|2026-06-16': 3,
        'news.ycombinator.com|2026-06-17': 2,
        'facebook.com|2026-06-15': 5,
        'tiktok.com|2026-06-14': 8,
        'netflix.com|2026-06-13': 2,
      },
      escapeCounts: {
        'twitter.com|2026-06-16': 1,
        'youtube.com|2026-06-15': 1,
      },
      snoozeCounts: {
        'reddit.com|2026-06-17': 1,
        'twitter.com|2026-06-16': 2,
      }
    },
    commitmentEndTimes: {}
  }
};

const storage = { ...MOCK_DATA };

window.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        if (typeof keys === 'function') { cb = keys; keys = null; }
        const result = {};
        if (!keys || keys === 'justConcentrate' || (Array.isArray(keys) && keys.includes('justConcentrate'))) {
          result.justConcentrate = JSON.parse(JSON.stringify(storage.justConcentrate));
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set(data, cb) {
        if (data.justConcentrate) storage.justConcentrate = { ...storage.justConcentrate, ...data.justConcentrate };
        if (cb) cb();
        return Promise.resolve();
      }
    },
    sync: {
      get(keys, cb) {
        if (cb) cb({});
        return Promise.resolve({});
      },
      set(data, cb) {
        if (cb) cb();
        return Promise.resolve();
      }
    },
    onChanged: {
      addListener() {}
    }
  },
  runtime: {
    id: undefined,
    getURL(path) { return path; },
    openOptionsPage() { window.open('options.html', '_blank'); },
    sendMessage(msg, cb) {
      const response = handleMessage(msg);
      if (cb) setTimeout(() => cb(response), 50);
    },
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} }
  },
  tabs: {
    query(opts, cb) {
      const tabs = [{ id: 1, url: 'https://youtube.com/watch?v=abc123', active: true }];
      if (cb) cb(tabs);
      return Promise.resolve(tabs);
    },
    getCurrent(cb) { if (cb) cb({ id: 1 }); },
    update() {}
  },
  declarativeNetRequest: {
    updateDynamicRules() { return Promise.resolve(); },
    getDynamicRules() { return Promise.resolve([]); }
  },
  alarms: {
    create() {},
    clear() {},
    onAlarm: { addListener() {} }
  },
  webNavigation: {
    onCommitted: { addListener() {} }
  },
  action: {
    setBadgeText() {},
    setBadgeBackgroundColor() {}
  }
};

function handleMessage(msg) {
  switch (msg.type) {
    case 'getSettings':
      return { settings: storage.justConcentrate.settings };
    case 'getBlockStatus':
      return { blocking: false, domains: [] };
    case 'startFocus':
      storage.justConcentrate.focusSession = {
        duration: msg.duration,
        endTime: Date.now() + msg.duration * 60000,
        startTime: Date.now(),
        blackout: msg.blackout,
        domains: msg.domains || []
      };
      return { success: true };
    case 'endFocus':
      storage.justConcentrate.focusSession = null;
      return { success: true };
    case 'refreshRules':
      return { success: true };
    case 'snooze':
      return { success: true };
    case 'allowPermanently':
      return { success: true };
    case 'endBlockEarly':
      return { success: true };
    default:
      return {};
  }
}

console.log('%c[Mock Chrome] Preview mode — using test data', 'color: #1f4cff; font-weight: bold');

} // end guard
