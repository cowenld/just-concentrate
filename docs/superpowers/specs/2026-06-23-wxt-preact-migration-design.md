# Focus Block: WXT + Preact Migration Design

## Goal

Migrate the vanilla JS Chrome extension to WXT + Preact + Vite to improve maintainability. Replace ~1,800 lines of manual DOM manipulation with Preact components. Keep files under 300 lines. Preserve all existing functionality, design system, and visual appearance exactly.

## Why

- `options.js` is 1,020 lines of innerHTML template construction with global mutable state — the largest maintenance burden
- `blocked.js` has a 5-state machine with scattered DOM updates and nested intervals
- Manual event delegation, class toggling, and re-rendering on every change
- No HMR — current preview tooling uses a custom mock-chrome script and iframe setup
- Pure logic layer (`storage.js`, `schedule-engine.js`, `matching.js`, `templates.js`) is already well-factored but can't be imported as ES modules

## What Doesn't Change

- **Visual appearance** — identical CSS, same Tailwind v4 setup, same design tokens
- **Business logic** — `storage.js`, `schedule-engine.js`, `matching.js`, `templates.js` keep their APIs
- **Background service worker** — stays vanilla JS (Chrome APIs, no UI)
- **Content script** (`content-timer.js`) — stays vanilla JS (Shadow DOM, isolated)
- **Data model** — same `chrome.storage.local['focusBlock']` schema
- **Message protocol** — same `chrome.runtime.sendMessage` types
- **Permissions and manifest capabilities** — identical

## Technology Choices

| Tool | Why |
|------|-----|
| **WXT** | Chrome extension framework. File-based entry points, auto-generates manifest, built-in HMR across all pages, handles multi-entry bundling. 9.8k stars, actively maintained. |
| **Preact** | 3KB React-compatible UI library. Same hooks/JSX API. Bundle size matters for extension popups. `preact/compat` available if React libraries needed later. |
| **Vite** | Build tool (bundled with WXT). Fast dev server, ESM-native, tree-shaking. |
| **Tailwind CSS v4** | Already in use. WXT/Vite integrates natively — no separate CLI step needed. |

## Project Structure

```
wxt.config.ts
package.json
tsconfig.json

src/
├── entrypoints/
│   ├── background/
│   │   └── index.js                    ← background.js (vanilla JS, minor edits for ES modules)
│   │
│   ├── content-timer.js                ← content-timer.js (vanilla JS, unchanged)
│   │
│   ├── popup/
│   │   ├── index.html                  ← minimal shell: <div id="root">
│   │   ├── main.jsx                    ← Preact render() call
│   │   └── App.jsx                     ← status display, focus timer, quick-block
│   │
│   ├── options/
│   │   ├── index.html
│   │   ├── main.jsx
│   │   ├── App.jsx                     ← tab shell + router
│   │   └── components/
│   │       ├── SchedulesTab.jsx        ← schedule list + empty state
│   │       ├── ScheduleModal.jsx       ← create/edit schedule form
│   │       ├── AllowlistTab.jsx        ← allowlist chip management
│   │       ├── ListsTab.jsx            ← site list cards + preset picker
│   │       ├── ListModal.jsx           ← create/edit list form
│   │       ├── UsageTab.jsx            ← analytics dashboard + coaching
│   │       └── SettingsTab.jsx         ← friction, sync, import/export, floating timer
│   │
│   ├── blocked/
│   │   ├── index.html
│   │   ├── main.jsx
│   │   ├── App.jsx                     ← state machine shell
│   │   └── components/
│   │       ├── BlockedState.jsx        ← countdown + "need to get in?" link
│   │       ├── EscapeMenu.jsx          ← snooze / allow / end-early buttons
│   │       ├── PassphraseChallenge.jsx ← real-time passphrase matching input
│   │       └── CooldownTimer.jsx       ← countdown + progress bar before confirm
│   │
│   └── onboarding/
│       ├── index.html
│       ├── main.jsx
│       └── App.jsx                     ← 3-step wizard (template → phrase → confirm)
│
├── lib/
│   ├── storage.js                      ← current storage.js with export statements added
│   ├── schedule-engine.js              ← current schedule-engine.js with exports
│   ├── matching.js                     ← current matching.js with exports
│   └── templates.js                    ← current templates.js with exports
│
├── hooks/
│   ├── useStorage.js                   ← read from chrome.storage + auto-refresh on changes
│   ├── useCountdown.js                 ← shared countdown interval logic (popup timer, blocked timer, cooldown)
│   └── useMessage.js                   ← send/receive chrome.runtime messages
│
├── components/
│   ├── Icon.jsx                        ← Preact wrapper around current icon() SVG paths
│   ├── Chip.jsx                        ← reusable chip with optional remove button
│   ├── DayPills.jsx                    ← 7-day selector (used in schedule modal + blocked page)
│   ├── Toggle.jsx                      ← on/off toggle switch
│   ├── Modal.jsx                       ← modal backdrop + container
│   └── EmptyState.jsx                  ← empty state with optional template cards
│
├── assets/
│   └── input.css                       ← current src/input.css (Tailwind source, unchanged)
│
└── public/
    ├── icons/                          ← icon16.png, icon48.png, icon128.png
    └── presets/                         ← social.json, news.json, streaming.json, adult.json
```

### File Size Estimates (all under 300 lines)

| File | Est. Lines | Notes |
|------|-----------|-------|
| `popup/App.jsx` | ~120 | Status + focus timer + quick-block |
| `options/App.jsx` | ~60 | Tab shell, renders active tab component |
| `options/SchedulesTab.jsx` | ~150 | Schedule cards + empty state |
| `options/ScheduleModal.jsx` | ~200 | Largest form — days, times, sites, lists, action |
| `options/AllowlistTab.jsx` | ~80 | Chip list + input |
| `options/ListsTab.jsx` | ~120 | List cards + preset picker |
| `options/ListModal.jsx` | ~100 | List name + site chips |
| `options/UsageTab.jsx` | ~150 | Analytics table + coaching nudges |
| `options/SettingsTab.jsx` | ~120 | Friction, sync, import/export toggles |
| `blocked/App.jsx` | ~80 | State machine shell, delegates to child |
| `blocked/BlockedState.jsx` | ~80 | Countdown + escape link |
| `blocked/EscapeMenu.jsx` | ~60 | Three action buttons |
| `blocked/PassphraseChallenge.jsx` | ~90 | Input + progress + match feedback |
| `blocked/CooldownTimer.jsx` | ~70 | Timer + progress bar |
| `onboarding/App.jsx` | ~150 | 3-step wizard inline |
| Shared hooks (3 files) | ~40 each | Small, focused |
| Shared components (6 files) | ~30-60 each | Small, reusable |

## Key Design Details

### WXT Configuration (`wxt.config.ts`)

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-preact'],
  manifest: {
    name: 'Focus Block',
    version: '0.1.0',
    description: 'A free, privacy-respecting website blocker...',
    permissions: ['declarativeNetRequest', 'storage', 'alarms', 'tabs', 'webNavigation', 'scripting'],
    optional_host_permissions: ['<all_urls>'],
    incognito: 'spanning',
    web_accessible_resources: [{
      resources: ['presets/social.json', 'presets/news.json', 'presets/streaming.json', 'presets/adult.json'],
      matches: ['<all_urls>']
    }]
  }
});
```

WXT auto-discovers entry points from the file structure and generates `manifest.json` during build. Permissions, icons, and web_accessible_resources are declared in config.

### `useStorage` Hook

The core hook that replaces manual `getData()` → `renderX()` patterns. Every component that reads storage data uses this instead of imperative re-render calls.

```jsx
function useStorage(selector) {
  const [value, setValue] = useState(null);

  useEffect(() => {
    // Initial load
    getData().then(data => setValue(selector(data)));

    // Listen for changes
    const listener = (changes) => {
      if (changes.focusBlock) {
        setValue(selector(changes.focusBlock.newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return value;
}

// Usage:
const schedules = useStorage(d => d.schedules);
const settings = useStorage(d => d.settings);
```

### `useCountdown` Hook

Replaces the 3 separate `setInterval` implementations (popup focus timer, blocked page countdown, cooldown timer).

```jsx
function useCountdown(endTime) {
  const [remaining, setRemaining] = useState(endTime ? endTime - Date.now() : 0);

  useEffect(() => {
    if (!endTime) return;
    const id = setInterval(() => {
      const r = endTime - Date.now();
      setRemaining(r > 0 ? r : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}
```

### Background Service Worker

`background.js` stays vanilla JS. The only changes:

1. Switch from `importScripts()` to ES module `import` statements (WXT service workers are ES modules)
2. Add WXT's `export default defineBackground()` wrapper
3. All internal logic stays identical

```js
import { defineBackground } from 'wxt/sandbox';
import { getData, setData, ... } from '@/lib/storage';
import { isScheduleActive, ... } from '@/lib/schedule-engine';
import { extractRegistrableDomain, ... } from '@/lib/matching';

export default defineBackground(() => {
  // ... existing background.js body, unchanged
});
```

### Content Script

`content-timer.js` stays vanilla JS with a WXT content script wrapper:

```js
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // ... existing content-timer.js body
  }
});
```

The floating timer content script is conditionally registered based on user settings (only injected when the user enables it). WXT supports this via `registration: 'runtime'`, which tells WXT to declare the content script in the manifest but not auto-inject it — registration stays in `background.js` via `chrome.scripting.registerContentScripts`, same as today.

### Blocked Page State Machine

The blocked page currently uses `showState(stateId)` to toggle div visibility. In Preact, this becomes a state enum:

```jsx
function App() {
  const [view, setView] = useState('blocked'); // 'blocked' | 'escape' | 'passphrase' | 'cooldown'

  switch (view) {
    case 'blocked':    return <BlockedState onEscape={() => setView('escape')} />;
    case 'escape':     return <EscapeMenu onAction={handleAction} onBack={() => setView('blocked')} />;
    case 'passphrase': return <PassphraseChallenge onMatch={handleMatch} onCancel={() => setView('escape')} />;
    case 'cooldown':   return <CooldownTimer duration={cooldownSecs} onComplete={handleConfirm} onCancel={() => setView('escape')} />;
  }
}
```

Each state component is self-contained with its own interval management via hooks.

### Options Tab Router

```jsx
function App() {
  const [tab, setTab] = useState('schedules');
  const TABS = [
    { key: 'schedules', label: 'Schedules' },
    { key: 'allowlist', label: 'Allowed Sites' },
    { key: 'usage', label: 'Usage' },
    { key: 'lists', label: 'Site Lists' },
    { key: 'settings', label: 'Settings' },
  ];

  const TabComponent = {
    schedules: SchedulesTab,
    allowlist: AllowlistTab,
    usage: UsageTab,
    lists: ListsTab,
    settings: SettingsTab,
  }[tab];

  return (
    <div>
      <nav>{TABS.map(t => <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} />)}</nav>
      <TabComponent />
    </div>
  );
}
```

### Tailwind CSS Integration

WXT + Vite handles Tailwind natively. No separate `npm run dev` / `npm run build` step.

- `src/assets/input.css` is imported in each entry point's `main.jsx`
- Vite processes it through Tailwind's PostCSS plugin
- All existing component classes (`.btn`, `.chip`, `.field`, `.toggle`, etc.) and `@theme` tokens carry over unchanged
- No more committed `styles.css` — CSS is bundled per entry point during build

### Icon System

Current `icon(name, size)` returns an HTML string. In Preact, this becomes a component:

```jsx
function Icon({ name, size = 16 }) {
  const path = ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

// Usage: <Icon name="shield-check" size={18} />
```

Same SVG paths from the current `icons.js`, just rendered as JSX instead of innerHTML strings.

### XSS Protection

Current code uses `esc()` to escape user input before inserting via `innerHTML`. In Preact, JSX auto-escapes text content by default — `{variable}` in JSX is safe. The `esc()` function is no longer needed. We must ensure no usage of `dangerouslySetInnerHTML` with user data.

## Preview Tooling

### WXT Dev Server (Primary)

`npm run dev` starts WXT's dev server with HMR. Changes to any Preact component hot-reload in the browser. To test:

1. `npm run dev` — starts Vite dev server + builds extension to `.output/chrome-mv3-dev/`
2. Load `.output/chrome-mv3-dev/` as unpacked extension in Chrome
3. Edit any file — popup, options, blocked, onboarding all hot-reload

### Side-by-Side Preview (Custom)

Rebuild the current `preview-all.html` concept to work with WXT's dev server. A standalone HTML page served on a separate port that iframes each entry point's dev URL:

```
scripts/
├── preview-all.html   ← iframes pointing at localhost:<wxt-port>/popup.html, /options.html, etc.
└── mock-chrome.js     ← same mock data, injected into iframes via postMessage or script injection
```

This gives the side-by-side view with state toggles for design iteration. We'll implement this as a WXT sandbox page entry point (`src/entrypoints/preview.html`) that renders all surfaces in iframes. As a sandbox page it runs inside the extension context with access to `chrome.*` APIs, so it can use real storage data rather than mocks. The mock-chrome script becomes a fallback for running outside the extension (e.g., in CI or for quick CSS checks).

## Migration Strategy

**Big Bang** — restructure all files at once on a feature branch.

### Order of Operations

1. **Scaffold** — `npm create wxt@latest`, install Preact module, configure `wxt.config.ts`
2. **Move pure logic** — `storage.js`, `schedule-engine.js`, `matching.js`, `templates.js` → `src/lib/` with `export` added
3. **Move static assets** — icons, presets → `src/public/`
4. **Move background + content script** — wrap in WXT's `defineBackground`/`defineContentScript`
5. **Build shared hooks** — `useStorage`, `useCountdown`, `useMessage`
6. **Build shared components** — `Icon`, `Chip`, `DayPills`, `Toggle`, `Modal`, `EmptyState`
7. **Convert onboarding** — simplest page, proves the pattern works
8. **Convert popup** — simple state + timer
9. **Convert blocked** — state machine conversion
10. **Convert options** — largest, split into 7 component files
11. **Move Tailwind source** — `src/input.css` → `src/assets/input.css`, configure Vite
12. **Rebuild preview tooling** — side-by-side page using WXT dev URLs
13. **Update CLAUDE.md** — new structure, commands, conventions
14. **Clean up** — remove old root-level JS/HTML files, old `scripts/`, old `package.json` scripts

### Verification at Each Step

- `npm run dev` builds without errors
- Extension loads in Chrome and functions identically
- Each converted page renders with correct styling
- All message types still work between pages and background
- Storage reads/writes produce same data shape

## What Gets Deleted

- Root-level `*.js` and `*.html` files (replaced by `src/entrypoints/`)
- `styles.css` (no longer committed — built per entry point)
- `src/input.css` (moves to `src/assets/input.css`)
- `scripts/preview.sh` (replaced by `npm run dev` + WXT dev server)
- `scripts/timer-demo.html` (no longer needed with HMR)
- Old `package.json` scripts (`dev`/`build` were Tailwind CLI — now WXT handles everything)

## What Gets Kept (Modified)

- `scripts/preview-all.html` — rebuilt to iframe WXT dev URLs
- `scripts/mock-chrome.js` — kept for preview tooling, may need API adjustments
- `CLAUDE.md` — updated with new structure and commands
- `docs/` — unchanged

## Risks

| Risk | Mitigation |
|------|-----------|
| WXT generates different manifest than hand-written | Compare generated manifest against current; fix in `wxt.config.ts` overrides |
| Content script dynamic registration doesn't map cleanly to WXT | Use WXT's `registration: 'runtime'` option, or keep manual registration in background |
| `web_accessible_resources` for blocked.html changes path | WXT handles this automatically for entry points; verify redirect URLs in DNR rules |
| Preview tooling can't iframe extension pages | Fall back to Option B (separate Vite page with mocks) |
| Bundle size regression | Preact is 3KB; monitor total output vs current (which is zero-overhead vanilla). Should be negligible. |
