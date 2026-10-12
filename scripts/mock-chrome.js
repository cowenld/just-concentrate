// Mock chrome APIs for browser preview. Only runs outside the extension context.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  // Real extension — skip mocking
} else {

const d = n => { const t = new Date(Date.now() - n * 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

const MOCK_DATA = {
  justConcentrate: {
    schemaVersion: 2,
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
    budgets: [
      { id: 'budget-1', domain: 'news.ycombinator.com', minutes: 20, enabled: true }
    ],
    settings: {
      frictionLevel: 'passphrase',
      passphrase: 'I choose focus over impulse',
      cooldownSeconds: 30,
      syncEnabled: false,
      onboardingComplete: true,
      trackTime: true,
      blockPageMessage: '',
      blockPageCss: ''
    },
    focusSession: null,
    suspensions: {}
  },
  justConcentrateUsage: {
    blockCounts: {
      [`twitter.com|${d(0)}`]: 8, [`twitter.com|${d(1)}`]: 12, [`twitter.com|${d(2)}`]: 6,
      [`reddit.com|${d(0)}`]: 5, [`reddit.com|${d(1)}`]: 7,
      [`youtube.com|${d(0)}`]: 3, [`youtube.com|${d(1)}`]: 9,
      [`instagram.com|${d(0)}`]: 4, [`tiktok.com|${d(3)}`]: 8
    },
    escapeCounts: { [`twitter.com|${d(1)}`]: 1 },
    siteTime: {
      [`github.com|${d(0)}`]: 5400, [`docs.google.com|${d(0)}`]: 3800,
      [`news.ycombinator.com|${d(0)}`]: 720, [`news.ycombinator.com|${d(1)}`]: 1000,
      [`wikipedia.org|${d(2)}`]: 11200
    }
  }
};

const storage = JSON.parse(JSON.stringify(MOCK_DATA));
const changeListeners = [];

function area(store, name) {
  return {
    get(keys, cb) {
      if (typeof keys === 'function') { cb = keys; keys = null; }
      const list = keys == null ? Object.keys(store) : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const result = {};
      for (const k of list) if (k in store) result[k] = JSON.parse(JSON.stringify(store[k]));
      if (cb) cb(result);
      return Promise.resolve(result);
    },
    set(data, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(data)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = JSON.parse(JSON.stringify(v));
      }
      changeListeners.forEach(l => l(changes, name));
      if (cb) cb();
      return Promise.resolve();
    },
    remove(keys, cb) {
      for (const k of [].concat(keys)) delete store[k];
      if (cb) cb();
      return Promise.resolve();
    }
  };
}

const noopEvent = { addListener() {}, removeListener() {} };

window.chrome = {
  storage: {
    local: area(storage, 'local'),
    sync: area({}, 'sync'),
    session: area({}, 'session'),
    onChanged: {
      addListener(fn) { changeListeners.push(fn); },
      removeListener(fn) { const i = changeListeners.indexOf(fn); if (i >= 0) changeListeners.splice(i, 1); }
    }
  },
  runtime: {
    id: undefined,
    getURL(path) { return path; },
    getManifest() { return { version: 'preview' }; },
    openOptionsPage() { window.open('options.html', '_blank'); },
    sendMessage(msg, cb) {
      const response = handleMessage(msg);
      if (cb) setTimeout(() => cb(response), 50);
      return Promise.resolve(response);
    },
    onMessage: noopEvent,
    onInstalled: noopEvent
  },
  extension: { isAllowedIncognitoAccess(cb) { cb(false); } },
  tabs: {
    query(opts, cb) {
      const tabs = [{ id: 1, url: 'https://youtube.com/watch?v=abc123', active: true }];
      if (cb) cb(tabs);
      return Promise.resolve(tabs);
    },
    getCurrent(cb) { if (cb) cb({ id: 1 }); },
    create() {},
    update() {}
  },
  permissions: { contains: () => Promise.resolve(false) }
};

function handleMessage(msg) {
  const data = storage.justConcentrate;
  switch (msg.type) {
    case 'getBlockInfo': {
      const end = new Date(); end.setHours(17, 0, 0, 0);
      if (end <= new Date()) end.setDate(end.getDate() + 1);
      return { match: { entry: 'youtube.com', label: 'Work Focus', source: { kind: 'schedule', id: 'sched-1' }, endTime: end.getTime(), redirectUrl: null } };
    }
    case 'startFocus': {
      const startTime = Date.now();
      const p = msg.pomodoro;
      const endTime = p
        ? startTime + (p.cycles * p.workMinutes + (p.cycles - 1) * p.breakMinutes) * 60000
        : startTime + msg.duration * 60000;
      window.chrome.storage.local.set({ justConcentrate: { ...data, focusSession: { startTime, endTime, blackout: msg.blackout, domains: msg.domains || [], ...(p ? { pomodoro: p } : {}) } } });
      return { success: true };
    }
    case 'endFocus':
      window.chrome.storage.local.set({ justConcentrate: { ...data, focusSession: null } });
      return { success: true };
    default:
      return { success: true };
  }
}

console.log('%c[Mock Chrome] Preview mode — using test data', 'color: #1f4cff; font-weight: bold');

} // end guard
