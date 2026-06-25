# WXT + Preact Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Focus Block Chrome extension from vanilla JS to WXT + Preact + Vite, replacing ~1,800 lines of manual DOM manipulation with Preact components while preserving identical functionality and appearance.

**Architecture:** WXT framework manages multi-entry-point bundling (popup, options, blocked, onboarding, background, content script). Preact renders all UI pages via JSX components. Pure business logic files (storage, schedule-engine, matching, templates) move to `src/lib/` with ES module exports. Shared hooks (`useStorage`, `useCountdown`, `useMessage`) replace manual DOM update patterns. Tailwind CSS v4 integrates natively through Vite.

**Tech Stack:** WXT, Preact, Vite, Tailwind CSS v4

## Global Constraints

- All files must stay under 300 lines
- Visual appearance must be pixel-identical to current extension
- No new npm dependencies beyond WXT, Preact, and their required modules
- No TypeScript in source files (`.jsx` and `.js` only) — `wxt.config.ts` and `tsconfig.json` are exceptions required by WXT
- `background.js` and `content-timer.js` stay vanilla JS (no Preact)
- Same `chrome.storage.local['focusBlock']` data model — no schema changes
- Same `chrome.runtime.sendMessage` protocol — no message type changes
- No `dangerouslySetInnerHTML` with user-provided data (Preact auto-escapes)

---

### Task 1: Scaffold WXT Project and Move Static Assets

**Files:**
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `src/assets/input.css`
- Create: `src/public/icons/icon16.png`, `src/public/icons/icon48.png`, `src/public/icons/icon128.png`
- Create: `src/public/presets/social.json`, `src/public/presets/news.json`, `src/public/presets/streaming.json`, `src/public/presets/adult.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: working WXT scaffold that builds with `npm run dev`; `wxt.config.ts` exports manifest config; `src/assets/input.css` provides all Tailwind theme tokens and component classes

- [ ] **Step 1: Initialize WXT and install dependencies**

```bash
npm install wxt @preact/preset-vite preact --save-dev
npm install @tailwindcss/vite --save-dev
```

- [ ] **Step 2: Create `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact(), tailwindcss()],
  }),
  manifest: {
    name: 'Focus Block',
    version: '0.1.0',
    description: 'A free, privacy-respecting website blocker. Block distracting sites on recurring schedules. Fully local, zero data collection.',
    permissions: ['declarativeNetRequest', 'storage', 'alarms', 'tabs', 'webNavigation', 'scripting'],
    optional_host_permissions: ['<all_urls>'],
    incognito: 'spanning',
    declarative_net_request: {
      rule_resources: []
    },
    web_accessible_resources: [{
      resources: ['presets/social.json', 'presets/news.json', 'presets/streaming.json', 'presets/adult.json'],
      matches: ['<all_urls>']
    }]
  }
});
```

- [ ] **Step 3: Create minimal `tsconfig.json`**

WXT requires this file to exist even for JS-only projects:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 4: Copy `src/input.css` to `src/assets/input.css`**

Copy the file as-is. The content is identical — same `@import "tailwindcss"`, same `@theme` block, same component classes. No modifications needed.

- [ ] **Step 5: Copy static assets to `src/public/`**

```bash
mkdir -p src/public/icons src/public/presets
cp icons/icon16.png icons/icon48.png icons/icon128.png src/public/icons/
cp presets/social.json presets/news.json presets/streaming.json presets/adult.json src/public/presets/
```

- [ ] **Step 6: Update `package.json`**

Replace the existing scripts and add WXT scripts. Keep the existing metadata:

```json
{
  "name": "focus-block",
  "version": "0.1.0",
  "description": "Focus Block Chrome Extension",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "postinstall": "wxt prepare"
  },
  "devDependencies": {
    "wxt": "latest",
    "preact": "latest",
    "@preact/preset-vite": "latest",
    "@tailwindcss/vite": "latest",
    "tailwindcss": "^4.3.1"
  }
}
```

Note: Keep exact version numbers from `npm install` output rather than `"latest"`.

- [ ] **Step 7: Update `.gitignore`**

Add WXT output directories:

```
.output/
.wxt/
node_modules/
```

- [ ] **Step 8: Create a minimal entry point to verify the build**

Create `src/entrypoints/popup/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus Block</title>
</head>
<body>
  <div id="root">Loading...</div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

Create `src/entrypoints/popup/main.jsx`:

```jsx
import { render } from 'preact';
import '../../assets/input.css';

function App() {
  return <div class="p-4 font-sans text-ink">Focus Block scaffold works</div>;
}

render(<App />, document.getElementById('root'));
```

- [ ] **Step 9: Run `npm run dev` and verify build succeeds**

Run: `npm run dev`
Expected: WXT builds to `.output/chrome-mv3-dev/` without errors. The generated `manifest.json` in `.output/` should contain the correct permissions, icons, and popup entry point.

- [ ] **Step 10: Verify generated manifest**

Compare `.output/chrome-mv3-dev/manifest.json` against the current `manifest.json`. Check that permissions, `web_accessible_resources`, `incognito`, and `declarative_net_request` all match. Fix any differences in `wxt.config.ts`.

- [ ] **Step 11: Commit**

```bash
git add wxt.config.ts tsconfig.json package.json package-lock.json .gitignore src/
git commit -m "feat: scaffold WXT + Preact project with Tailwind v4"
```

---

### Task 2: Move Pure Logic to `src/lib/` with ES Module Exports

**Files:**
- Create: `src/lib/storage.js` (from `storage.js`)
- Create: `src/lib/schedule-engine.js` (from `schedule-engine.js`)
- Create: `src/lib/matching.js` (from `matching.js`)
- Create: `src/lib/templates.js` (from `templates.js`)

**Interfaces:**
- Consumes: nothing
- Produces: ES module versions of all pure logic files. Every function that was a global is now a named export. APIs are identical — same function names, same parameters, same return types.

Key exports per file:
- `storage.js`: `DEFAULT_DATA`, `generateId()`, `getData()`, `setData(data)`, `applySyncedConfig(payload, force)`, `getSchedules()`, `saveSchedule(schedule)`, `deleteSchedule(id)`, `getLists()`, `saveList(list)`, `deleteList(id)`, `getAllowlist()`, `saveAllowlist(allowlist)`, `getSettings()`, `saveSettings(settings)`, `getFocusSession()`, `saveFocusSession(session)`, `clearFocusSession()`, `getUsage()`, `recordBlock(domain, scheduleName)`, `recordEscape(domain, type)`, `getCommitmentEndTimes()`, `setCommitmentEndTime(scheduleId, endTime)`, `clearCommitmentEndTime(scheduleId)`, `exportData()`, `importData(jsonString)`
- `schedule-engine.js`: `isTimeInWindow(now, startTime, endTime)`, `isDayActive(now, days)`, `isScheduleActive(schedule, now)`, `getActiveBlockedDomains(schedules, lists, allowlist, focusSession)`, `getNextWindowBoundary(schedules)`
- `matching.js`: `extractRegistrableDomain(hostname)`, `domainMatches(urlHostname, blockedDomain)`, `isUrlBlocked(url, blockedDomains, allowlist)`, `getEffectiveBlocklist(schedule, lists)`
- `templates.js`: `PRESETS`, `loadPresets()`, `TEMPLATES`, `applyTemplateToStorage(templateKey)`, `addPresetList(presetKey)`

- [ ] **Step 1: Create `src/lib/storage.js`**

Copy the entire content of `storage.js` and add `export` before every function declaration and before `const DEFAULT_DATA`. Replace `function generateId()` with `export function generateId()`, etc.

The full list of lines to change (add `export` keyword at the start):
- `const DEFAULT_DATA` → `export const DEFAULT_DATA`
- `function generateId()` → `export function generateId()`
- `async function getData()` → `export async function getData()`
- `async function setData(data)` → `export async function setData(data)`
- `async function applySyncedConfig(payload, force = false)` → `export async function applySyncedConfig(payload, force = false)`
- `async function getSchedules()` → `export async function getSchedules()`
- `async function saveSchedule(schedule)` → `export async function saveSchedule(schedule)`
- `async function deleteSchedule(id)` → `export async function deleteSchedule(id)`
- `async function getLists()` → `export async function getLists()`
- `async function saveList(list)` → `export async function saveList(list)`
- `async function deleteList(id)` → `export async function deleteList(id)`
- `async function getAllowlist()` → `export async function getAllowlist()`
- `async function saveAllowlist(allowlist)` → `export async function saveAllowlist(allowlist)`
- `async function getSettings()` → `export async function getSettings()`
- `async function saveSettings(settings)` → `export async function saveSettings(settings)`
- `async function getFocusSession()` → `export async function getFocusSession()`
- `async function saveFocusSession(session)` → `export async function saveFocusSession(session)`
- `async function clearFocusSession()` → `export async function clearFocusSession()`
- `async function getUsage()` → `export async function getUsage()`
- `async function recordBlock(domain, scheduleName)` → `export async function recordBlock(domain, scheduleName)`
- `async function recordEscape(domain, type)` → `export async function recordEscape(domain, type)`
- `async function getCommitmentEndTimes()` → `export async function getCommitmentEndTimes()`
- `async function setCommitmentEndTime(scheduleId, endTime)` → `export async function setCommitmentEndTime(scheduleId, endTime)`
- `async function clearCommitmentEndTime(scheduleId)` → `export async function clearCommitmentEndTime(scheduleId)`
- `async function exportData()` → `export async function exportData()`
- `async function importData(jsonString)` → `export async function importData(jsonString)`

No other changes to the file content.

- [ ] **Step 2: Create `src/lib/schedule-engine.js`**

Copy `schedule-engine.js`, add `export` before every function. Also add `export` before `getEffectiveBlocklist` — wait, that function is in `matching.js`, not `schedule-engine.js`. The functions in this file:

- `function isTimeInWindow(now, startTime, endTime)` → `export function isTimeInWindow(...)`
- `function isDayActive(now, days)` → `export function isDayActive(...)`
- `function isScheduleActive(schedule, now)` → `export function isScheduleActive(...)`
- `function getActiveBlockedDomains(schedules, lists, allowlist, focusSession)` → `export function getActiveBlockedDomains(...)`

This function calls `getEffectiveBlocklist` which is defined in `matching.js`. Add an import at the top:

```js
import { getEffectiveBlocklist } from './matching.js';
```

- `function getNextWindowBoundary(schedules)` → `export function getNextWindowBoundary(...)`

- [ ] **Step 3: Create `src/lib/matching.js`**

Copy `matching.js`, add `export` before every function:

- `function extractRegistrableDomain(hostname)` → `export function extractRegistrableDomain(...)`
- `function domainMatches(urlHostname, blockedDomain)` → `export function domainMatches(...)`
- `function isUrlBlocked(url, blockedDomains, allowlist)` → `export function isUrlBlocked(...)`
- `function getEffectiveBlocklist(schedule, lists)` → `export function getEffectiveBlocklist(...)`

- [ ] **Step 4: Create `src/lib/templates.js`**

Copy `templates.js`. This file references globals from `storage.js` (`saveList`, `saveSchedule`, `getLists`). Add imports and exports:

Add at top:
```js
import { saveList, saveSchedule, getLists } from './storage.js';
```

Remove the comment block at top referencing `importScripts`.

Add `export` before:
- `const PRESETS` → `export const PRESETS`
- `async function loadPresets()` → `export async function loadPresets()`
- `const TEMPLATES` → `export const TEMPLATES`
- `async function applyTemplateToStorage(templateKey)` → `export async function applyTemplateToStorage(...)`
- `async function addPresetList(presetKey)` → `export async function addPresetList(...)`

- [ ] **Step 5: Verify imports work**

Add a temporary test import to `src/entrypoints/popup/main.jsx`:

```jsx
import { DEFAULT_DATA } from '../../lib/storage.js';
console.log('Storage default data:', DEFAULT_DATA);
```

Run: `npm run dev`
Expected: Builds without errors, console logs the default data object.

Remove the test import after verifying.

- [ ] **Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: move pure logic files to src/lib/ with ES module exports"
```

---

### Task 3: Build Shared Hooks

**Files:**
- Create: `src/hooks/useStorage.js`
- Create: `src/hooks/useCountdown.js`
- Create: `src/hooks/useMessage.js`

**Interfaces:**
- Consumes: `getData()` from `src/lib/storage.js`
- Produces:
  - `useStorage(selector)` — returns the selected slice of `chrome.storage.local['focusBlock']`, auto-updates on storage changes. Returns `null` while loading.
  - `useCountdown(endTime)` — returns remaining milliseconds, ticking every 1s. Returns 0 when expired or no endTime.
  - `useMessage(type, payload)` — sends a `chrome.runtime.sendMessage` and returns `{ data, loading, error, send(payload) }`.

- [ ] **Step 1: Create `src/hooks/useStorage.js`**

```jsx
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { getData } from '../lib/storage.js';

export function useStorage(selector) {
  const [value, setValue] = useState(null);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    getData().then(data => setValue(selectorRef.current(data)));

    const listener = (changes) => {
      if (changes.focusBlock && changes.focusBlock.newValue) {
        setValue(selectorRef.current(changes.focusBlock.newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return value;
}

export function useStorageData() {
  return useStorage(d => d);
}
```

- [ ] **Step 2: Create `src/hooks/useCountdown.js`**

```jsx
import { useState, useEffect } from 'preact/hooks';

export function useCountdown(endTime) {
  const [remaining, setRemaining] = useState(() =>
    endTime ? Math.max(0, endTime - Date.now()) : 0
  );

  useEffect(() => {
    if (!endTime) { setRemaining(0); return; }
    setRemaining(Math.max(0, endTime - Date.now()));
    const id = setInterval(() => {
      const r = endTime - Date.now();
      setRemaining(r > 0 ? r : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}

export function formatHMS(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
}

export function formatMS(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatCooldownMMSS(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
```

- [ ] **Step 3: Create `src/hooks/useMessage.js`**

```jsx
import { useState, useCallback } from 'preact/hooks';

export function useMessage() {
  const [loading, setLoading] = useState(false);

  const send = useCallback((type, payload = {}) => {
    setLoading(true);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
        setLoading(false);
        resolve(resp);
      });
    });
  }, []);

  return { send, loading };
}

export function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
      resolve(resp);
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/
git commit -m "feat: add shared Preact hooks — useStorage, useCountdown, useMessage"
```

---

### Task 4: Build Shared Components

**Files:**
- Create: `src/components/Icon.jsx`
- Create: `src/components/Chip.jsx`
- Create: `src/components/DayPills.jsx`
- Create: `src/components/Toggle.jsx`
- Create: `src/components/Modal.jsx`
- Create: `src/components/EmptyState.jsx`

**Interfaces:**
- Consumes: nothing external
- Produces:
  - `<Icon name="shield-check" size={18} />` — renders SVG icon from ICONS map
  - `<Chip label="reddit.com" onRemove={() => {}} />` — chip with optional remove button; accepts `className` for variants
  - `<DayPills days={[1,2,3,4,5]} onChange={setDays} readOnly={false} />` — 7-day selector (M T W T F S S order)
  - `<Toggle checked={true} onChange={fn} />` — on/off toggle switch
  - `<Modal visible={true} onClose={fn} title="Edit schedule">{children}</Modal>` — modal backdrop + container
  - `<EmptyState icon="calendar" title="..." description="...">{children}</EmptyState>` — empty state card

- [ ] **Step 1: Create `src/components/Icon.jsx`**

```jsx
const ICONS = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'bar-chart': '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
  'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'code-2': '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

export function Icon({ name, size = 16, className = '' }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
```

Note: `dangerouslySetInnerHTML` is safe here because ICONS values are hardcoded strings, never user input.

- [ ] **Step 2: Create `src/components/Chip.jsx`**

```jsx
export function Chip({ label, onRemove, className = '' }) {
  return (
    <span class={`chip ${className}`}>
      {label}
      {onRemove && (
        <button class="chip-remove" onClick={onRemove}>&times;</button>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Create `src/components/DayPills.jsx`**

```jsx
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

export function DayPills({ days = [], onChange, readOnly = false }) {
  const allActive = days.length === 0;

  function toggle(dayIndex) {
    if (readOnly) return;
    if (days.includes(dayIndex)) {
      onChange(days.filter(d => d !== dayIndex));
    } else {
      onChange([...days, dayIndex]);
    }
  }

  return (
    <div class="flex gap-1">
      {DISPLAY_ORDER.map(d => {
        const active = allActive || days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            class={`w-7 h-7 inline-flex items-center justify-center font-mono text-[10.5px] font-medium italic border ${
              active ? 'bg-accent border-accent text-white' : 'border-rule text-ink-3'
            }`}
            disabled={readOnly}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

export function QuickDayButtons({ onChange }) {
  return (
    <div class="flex gap-2">
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([1, 2, 3, 4, 5])}>Weekdays</button>
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([0, 6])}>Weekends</button>
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/Toggle.jsx`**

```jsx
export function Toggle({ checked, onChange, id }) {
  return (
    <label class="toggle">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span class="toggle-slider" />
    </label>
  );
}
```

- [ ] **Step 5: Create `src/components/Modal.jsx`**

```jsx
export function Modal({ visible, onClose, title, children }) {
  if (!visible) return null;

  return (
    <div
      class="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="bg-bg w-full max-w-xl border border-rule shadow-pop">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rule">
          <span class="text-[15px] font-semibold text-ink">{title}</span>
          <button class="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-5">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/EmptyState.jsx`**

```jsx
import { Icon } from './Icon.jsx';

export function EmptyState({ icon, title, description, children }) {
  return (
    <div class="text-center py-12">
      {icon && (
        <div class="flex justify-center mb-4 text-ink-3">
          <Icon name={icon} size={32} />
        </div>
      )}
      <div class="text-[15px] font-semibold text-ink mb-1">{title}</div>
      {description && <div class="text-sm text-ink-3 mb-6">{description}</div>}
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "feat: add shared Preact components — Icon, Chip, DayPills, Toggle, Modal, EmptyState"
```

---

### Task 5: Convert Background Service Worker and Content Script

**Files:**
- Create: `src/entrypoints/background/index.js`
- Create: `src/entrypoints/content-timer.js`

**Interfaces:**
- Consumes: all exports from `src/lib/storage.js`, `src/lib/matching.js`, `src/lib/schedule-engine.js`, `src/lib/templates.js`
- Produces: functioning background service worker and content script under WXT conventions

- [ ] **Step 1: Create `src/entrypoints/background/index.js`**

Take the entire body of `background.js` and wrap it in `defineBackground()`. Replace `importScripts(...)` at line 1 with ES module imports.

Top of file:
```js
import { defineBackground } from 'wxt/sandbox';
import {
  getData, setData, getSchedules, saveSchedule, deleteSchedule,
  getLists, saveList, getAllowlist, saveAllowlist,
  getSettings, saveSettings, getFocusSession, saveFocusSession, clearFocusSession,
  getUsage, recordBlock, recordEscape,
  getCommitmentEndTimes, setCommitmentEndTime, clearCommitmentEndTime,
  applySyncedConfig
} from '../../lib/storage.js';
import {
  extractRegistrableDomain, domainMatches, isUrlBlocked, getEffectiveBlocklist
} from '../../lib/matching.js';
import {
  isScheduleActive, getActiveBlockedDomains, getNextWindowBoundary
} from '../../lib/schedule-engine.js';
import { PRESETS, loadPresets } from '../../lib/templates.js';

export default defineBackground(() => {
  // Paste the ENTIRE body of background.js here, starting from:
  // const ALARM_NAME = 'focusblock-check';
  // ... through to the end.
  // Do NOT include the importScripts line.
});
```

The content inside `defineBackground(...)` is the exact body of `background.js` from line 3 (`const ALARM_NAME = ...`) through line 571 (`});`), with no modifications. All function calls to `getData`, `isScheduleActive`, etc. resolve via the imports above.

One change: the `onboarding.html` URL in `chrome.runtime.onInstalled` needs updating. In WXT, the onboarding page will be at a different path. Change:
```js
chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
```
to:
```js
chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
```
(WXT maps entry points to root-level paths in the built extension.)

Similarly, update the blocked page redirect path in `updateBlockingRules()`:
```js
extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&schedule=${encodeURIComponent(sName)}`
```
This should already work with WXT's output paths, but verify during testing.

- [ ] **Step 2: Create `src/entrypoints/content-timer.js`**

```js
import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  registration: 'runtime',
  main() {
    // Paste the ENTIRE body of the IIFE from content-timer.js here,
    // starting from: if (window.top !== window.self) return;
    // through to: refresh();
    // Do NOT include the outer (() => { ... })(); wrapper.
  }
});
```

The content script ID for dynamic registration in background.js uses `'focus-block-timer'`. WXT's `registration: 'runtime'` means WXT won't auto-register this script — the background service worker's `registerTimerContentScript()` handles it. The `id` in `registerContentScripts` must match WXT's generated ID. Check the WXT docs for the naming convention — it may need to reference the entrypoint name (`content-timer`). If WXT changes the script path, update the `js: ['content-timer.js']` in `registerTimerContentScript()` to the correct output path.

- [ ] **Step 3: Run `npm run dev` and verify build succeeds**

Run: `npm run dev`
Expected: Builds without errors. Check `.output/chrome-mv3-dev/manifest.json` for correct `background.service_worker` and content script entries.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/background/ src/entrypoints/content-timer.js
git commit -m "feat: migrate background service worker and content script to WXT"
```

---

### Task 6: Convert Onboarding Page

**Files:**
- Create: `src/entrypoints/onboarding/index.html`
- Create: `src/entrypoints/onboarding/main.jsx`
- Create: `src/entrypoints/onboarding/App.jsx`

**Interfaces:**
- Consumes: `saveSettings` from `src/lib/storage.js`; `TEMPLATES`, `applyTemplateToStorage`, `loadPresets` from `src/lib/templates.js`; `Icon` from `src/components/Icon.jsx`
- Produces: 3-step onboarding wizard (template selection → commitment phrase → confirmation) that behaves identically to current `onboarding.html` + `onboarding.js`

- [ ] **Step 1: Create `src/entrypoints/onboarding/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus Block — Get Started</title>
</head>
<body class="bg-bg min-h-screen">
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/entrypoints/onboarding/main.jsx`**

```jsx
import { render } from 'preact';
import '../../assets/input.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('root'));
```

- [ ] **Step 3: Create `src/entrypoints/onboarding/App.jsx`**

Build the 3-step wizard component. This replaces `onboarding.js` (151 lines) and the body content of `onboarding.html` (160 lines):

```jsx
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { saveSettings } from '../../lib/storage.js';
import { TEMPLATES, applyTemplateToStorage, loadPresets } from '../../lib/templates.js';

const TEMPLATE_CARDS = [
  { key: 'work', icon: 'calendar', title: 'Work Focus', desc: 'Block social media during work hours, Mon–Fri 9–5.' },
  { key: 'bedtime', icon: 'moon', title: 'Bedtime', desc: 'Wind down by blocking social + streaming, 10pm–7am.' },
  { key: 'deepwork', icon: 'braces', title: 'Deep Work', desc: 'Block everything except your allowed sites.' },
  { key: 'custom', icon: 'plus', title: 'Start from scratch', desc: 'Set up your own schedule in settings.' },
];

export function App() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(null);
  const [siteCount, setSiteCount] = useState(0);
  const [phraseWasSaved, setPhraseWasSaved] = useState(false);

  useEffect(() => { loadPresets(); }, []);

  async function applyTemplate() {
    if (!selected) return;
    if (selected === 'custom') {
      await saveSettings({ onboardingComplete: true });
      chrome.runtime.openOptionsPage();
      return;
    }
    const { siteCount: count } = await applyTemplateToStorage(selected);
    setSiteCount(count);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    await saveSettings({ onboardingComplete: true });
    setStep(2);
  }

  async function savePhrase() {
    const input = document.getElementById('ob-phrase-input');
    const phrase = input.value.trim();
    if (phrase) {
      await saveSettings({ passphrase: phrase, frictionLevel: 'passphrase' });
      setPhraseWasSaved(true);
    }
    setStep(3);
  }

  if (step === 1) {
    return (
      <div class="max-w-xl mx-auto px-6 py-16">
        <div class="flex items-center gap-2 mb-1">
          <Icon name="shield-check" size={24} />
          <span class="text-xl font-semibold text-ink">Focus Block</span>
        </div>
        <p class="text-ink-3 text-sm mb-8">Choose a template to get started, or build your own.</p>
        <div class="grid grid-cols-2 gap-3 mb-6">
          {TEMPLATE_CARDS.map(t => (
            <button
              key={t.key}
              onClick={() => setSelected(t.key)}
              class={selected === t.key
                ? 'border-2 border-accent bg-accent-faint p-[19px] cursor-pointer text-left flex flex-col transition-colors duration-150'
                : 'bg-card border border-rule p-5 cursor-pointer text-left flex flex-col transition-colors duration-150 hover:border-ink-3'
              }
            >
              <div class={`w-9 h-9 border ${selected === t.key ? 'border-accent-soft' : 'border-rule'} flex items-center justify-center shrink-0 text-ink-2`}>
                <Icon name={t.icon} size={20} />
              </div>
              <div class="text-[14px] font-medium text-ink mt-3">{t.title}</div>
              <div class="text-[12px] text-ink-3 leading-snug mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
        <div class="flex justify-between items-center">
          <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
            onClick={async () => { await saveSettings({ onboardingComplete: true }); chrome.runtime.openOptionsPage(); }}>
            Start from scratch
          </button>
          <button class="btn btn-ink" disabled={!selected} onClick={applyTemplate}>
            Continue <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div class="max-w-xl mx-auto px-6 py-16">
        <div class="flex items-center gap-2 mb-1">
          <Icon name="shield-check" size={24} />
          <span class="text-xl font-semibold text-ink">Set a commitment phrase</span>
        </div>
        <p class="text-ink-3 text-sm mb-6">
          Write a short phrase that reminds you why you're blocking these sites. You'll type it to override a block.
        </p>
        <input id="ob-phrase-input" class="field mb-4" type="text" placeholder="e.g. I choose focus over impulse" />
        <div class="flex justify-between items-center">
          <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
            onClick={() => { setPhraseWasSaved(false); setStep(3); }}>
            Skip for now
          </button>
          <button class="btn btn-ink" onClick={savePhrase}>
            Save <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    );
  }

  const templateLabel = TEMPLATES[selected] ? TEMPLATES[selected].label : 'Custom';
  return (
    <div class="max-w-xl mx-auto px-6 py-16 text-center">
      <div class="flex justify-center mb-4 text-accent">
        <Icon name="check" size={24} />
      </div>
      <div class="text-xl font-semibold text-ink mb-2">You're all set</div>
      <p class="text-ink-3 text-sm mb-6">
        Your <strong>{templateLabel}</strong> schedule is armed{phraseWasSaved ? ' and a commitment phrase is in place' : ''}.
        Focus Block runs quietly in your toolbar.
      </p>
      <div class="flex justify-center gap-8 mb-8">
        <div><div class="font-mono text-lg font-semibold text-accent">1</div><div class="mono-cap">Schedule</div></div>
        <div><div class="font-mono text-lg font-semibold text-accent">{siteCount}</div><div class="mono-cap">Sites</div></div>
        <div><div class="font-mono text-lg font-semibold text-accent">{phraseWasSaved ? 'On' : 'Off'}</div><div class="mono-cap">Phrase</div></div>
      </div>
      <button class="btn btn-ink" onClick={() => chrome.runtime.openOptionsPage()}>
        Open settings <Icon name="arrow-right" size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run `npm run dev`, load extension, and verify onboarding page**

Navigate to the onboarding page in the loaded extension. Verify:
- Template cards render with correct icons and text
- Selecting a card highlights it (accent border + faint background)
- Clicking Continue creates the schedule and lists in storage
- Step 2 phrase input works (save + skip)
- Step 3 confirmation shows correct stats
- "Open settings" button opens options page

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/onboarding/
git commit -m "feat: convert onboarding page to Preact"
```

---

### Task 7: Convert Popup Page

**Files:**
- Create: `src/entrypoints/popup/App.jsx` (replace the scaffold from Task 1)
- Modify: `src/entrypoints/popup/main.jsx`

**Interfaces:**
- Consumes: `useStorage` from `src/hooks/useStorage.js`; `useCountdown`, `formatMS` from `src/hooks/useCountdown.js`; `sendMessage` from `src/hooks/useMessage.js`; `Icon` from `src/components/Icon.jsx`; `getActiveBlockedDomains`, `isScheduleActive` from `src/lib/schedule-engine.js`; `domainMatches`, `getEffectiveBlocklist` from `src/lib/matching.js`; `saveSchedule` from `src/lib/storage.js`
- Produces: popup UI (360px) with status display, focus timer, quick-block — identical to current `popup.js`

- [ ] **Step 1: Update `src/entrypoints/popup/main.jsx`**

```jsx
import { render } from 'preact';
import '../../assets/input.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('root'));
```

- [ ] **Step 2: Create `src/entrypoints/popup/App.jsx`**

```jsx
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { useStorage } from '../../hooks/useStorage.js';
import { useCountdown, formatMS } from '../../hooks/useCountdown.js';
import { sendMessage } from '../../hooks/useMessage.js';
import { getActiveBlockedDomains, isScheduleActive } from '../../lib/schedule-engine.js';
import { domainMatches, getEffectiveBlocklist } from '../../lib/matching.js';
import { saveSchedule } from '../../lib/storage.js';

export function App() {
  const data = useStorage(d => d);
  if (!data) return null;

  const { schedules, lists, allowlist, focusSession, settings } = data;
  const result = getActiveBlockedDomains(schedules, lists, allowlist, focusSession);
  const focusActive = focusSession && focusSession.endTime > Date.now();

  return (
    <div class="w-[360px] bg-bg font-sans">
      <Header />
      <div class="px-4 pb-4 flex flex-col gap-3">
        <StatusBar result={result} schedules={schedules} />
        {focusActive
          ? <FocusTimer session={focusSession} />
          : <FocusStart schedules={schedules} lists={lists} />
        }
        <CurrentSite schedules={schedules} lists={lists} allowlist={allowlist} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div class="flex items-center justify-between px-4 py-3 border-b border-rule">
      <div class="flex items-center gap-1.5 text-ink font-semibold text-sm">
        <Icon name="shield-check" size={18} />
        <span>Focus Block</span>
      </div>
      <button class="icon-btn" onClick={() => chrome.runtime.openOptionsPage()}>
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
}

function StatusBar({ result, schedules }) {
  if (result.blackout) {
    return (
      <div class="border border-rule border-l-2 border-l-accent p-3 flex items-center gap-2.5 bg-card">
        <span class="w-2 h-2 rounded-pill bg-accent shrink-0" />
        <span class="font-mono text-[13px] text-ink-2">
          Session active &middot; <strong class="font-semibold text-ink">{result.scheduleName}</strong>
        </span>
      </div>
    );
  }
  if (result.domains && result.domains.length > 0) {
    const activeNames = schedules.filter(s => isScheduleActive(s)).map(s => s.name).join(', ');
    return (
      <div class="border border-rule border-l-2 border-l-accent p-3 flex items-center gap-2.5 bg-card">
        <span class="w-2 h-2 rounded-pill bg-accent shrink-0" />
        <span class="font-mono text-[13px] text-ink-2">
          Session active{activeNames ? <> &middot; <strong class="font-semibold text-ink">{activeNames}</strong></> : ''}
        </span>
      </div>
    );
  }
  const armedCount = schedules.filter(s => s.enabled).length;
  return (
    <div class="border border-rule p-3 flex items-center gap-2.5 bg-card">
      <span class="w-2 h-2 rounded-pill bg-ink-4 shrink-0" />
      <span class="font-mono text-[13px] text-ink-2">
        No active block &middot; {armedCount} schedule{armedCount !== 1 ? 's' : ''} armed
      </span>
    </div>
  );
}

function FocusTimer({ session }) {
  const remaining = useCountdown(session.endTime);
  const totalDuration = session.endTime - (session.startTime || (session.endTime - remaining));
  const elapsed = totalDuration - remaining;
  const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  const totalMin = Math.floor(totalDuration / 60000);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const totalStr = totalH > 0 ? `${totalH}:${totalM.toString().padStart(2, '0')}` : `0:${totalM.toString().padStart(2, '0')}`;
  const count = session.domains ? session.domains.length : 0;
  const blockingLabel = session.blackout ? 'BLACKOUT MODE' : `BLOCKING ${count} SITE${count !== 1 ? 'S' : ''}`;

  return (
    <div class="bg-card border border-rule p-4">
      <div class="flex justify-between items-center mb-2">
        <span class="font-mono text-2xl font-semibold text-ink">{formatMS(remaining)}</span>
        <span class="mono-cap">{totalStr}</span>
      </div>
      <div class="h-1 bg-rule-2 mb-2">
        <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div class="flex justify-between items-center">
        <span class="mono-cap">{blockingLabel}</span>
        <button class="btn btn-outline h-8 px-3 text-[10px]"
          onClick={() => sendMessage('endFocus')}>End early</button>
      </div>
    </div>
  );
}

function FocusStart({ schedules, lists }) {
  const [blackout, setBlackout] = useState(false);

  async function startFocus(minutes) {
    const domains = new Set();
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const effective = getEffectiveBlocklist(schedule, lists);
      for (const d of effective) domains.add(d);
    }
    await sendMessage('startFocus', { duration: minutes, blackout, domains: [...domains] });
  }

  return (
    <div class="bg-card border border-rule p-4">
      <div class="mono-cap mb-3">Focus now</div>
      <div class="flex gap-2 mb-3">
        {[25, 60, 120].map(m => (
          <button key={m} class="btn btn-ink flex-1" onClick={() => startFocus(m)}>
            {m < 60 ? `${m}m` : `${m / 60}h`}
          </button>
        ))}
      </div>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={blackout} onChange={e => setBlackout(e.target.checked)}
          class="hidden" id="focus-blackout" />
        <span class={`fb-check ${blackout ? '' : ''}`} />
        <span class="text-[13px] text-ink-2">Block everything (blackout)</span>
      </label>
    </div>
  );
}

function CurrentSite({ schedules, lists, allowlist }) {
  const [tab, setTab] = useState(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t));
  }, []);

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return <span class="text-[13px] text-ink-3">No blockable site on this tab</span>;
  }

  let hostname;
  try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return null; }
  const firstLetter = hostname.charAt(0).toLowerCase();
  const isAllowed = allowlist.some(d => domainMatches(hostname, d));
  const isBlocked = !isAllowed && schedules.some(s => {
    if (!isScheduleActive(s)) return false;
    return getEffectiveBlocklist(s, lists).some(d => domainMatches(hostname, d));
  });

  async function quickBlock() {
    let target = schedules.find(s => s.name === 'Quick blocks');
    if (!target) {
      target = { name: 'Quick blocks', days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59', blackout: false, adHocSites: [], listIds: [], enabled: true };
    }
    if (!target.adHocSites) target.adHocSites = [];
    if (!target.adHocSites.includes(hostname)) {
      target.adHocSites.push(hostname);
      await saveSchedule(target);
      sendMessage('refreshRules');
    }
  }

  const favicon = (
    <div class="w-7 h-7 border border-rule flex items-center justify-center font-mono text-xs text-ink-3 bg-elev shrink-0">
      {firstLetter}
    </div>
  );
  const info = (
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-ink truncate">{hostname}</div>
      <div class="mono-cap mt-px">CURRENT TAB</div>
    </div>
  );

  return (
    <div class="flex items-center gap-2.5">
      {favicon}{info}
      {isAllowed && <span class="text-[13px] text-ink-3">On your allowlist</span>}
      {isBlocked && <span class="text-[13px] text-ink-3">Currently blocked</span>}
      {!isAllowed && !isBlocked && (
        <button class="btn btn-ink shrink-0" onClick={quickBlock}>BLOCK SITE</button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify popup renders correctly**

Load the extension, click the popup icon. Verify:
- Header with shield icon and settings button
- Status bar shows correct state (idle/active/blocked count)
- Focus Now buttons work (25m, 1h, 2h)
- Timer countdown displays when focus session is active
- Current site detection and quick-block button work

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/popup/
git commit -m "feat: convert popup page to Preact"
```

---

### Task 8: Convert Blocked Page

**Files:**
- Create: `src/entrypoints/blocked/index.html`
- Create: `src/entrypoints/blocked/main.jsx`
- Create: `src/entrypoints/blocked/App.jsx`
- Create: `src/entrypoints/blocked/components/BlockedState.jsx`
- Create: `src/entrypoints/blocked/components/EscapeMenu.jsx`
- Create: `src/entrypoints/blocked/components/PassphraseChallenge.jsx`
- Create: `src/entrypoints/blocked/components/CooldownTimer.jsx`

**Interfaces:**
- Consumes: `useCountdown`, `formatHMS`, `formatCooldownMMSS` from hooks; `sendMessage` from hooks; `getData` from storage; `Icon` from components; `DayPills` from components
- Produces: block page with 4-state machine (blocked → escape → passphrase → cooldown) identical to current `blocked.js`

- [ ] **Step 1: Create `src/entrypoints/blocked/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus Block — Site Blocked</title>
</head>
<body class="bg-bg min-h-screen flex items-center justify-center">
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/entrypoints/blocked/main.jsx`**

```jsx
import { render } from 'preact';
import '../../assets/input.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('root'));
```

- [ ] **Step 3: Create `src/entrypoints/blocked/App.jsx`**

This is the state machine shell. It reads URL params and delegates to child components:

```jsx
import { useState, useEffect } from 'preact/hooks';
import { sendMessage } from '../../hooks/useMessage.js';
import { getData } from '../../lib/storage.js';
import { BlockedState } from './components/BlockedState.jsx';
import { EscapeMenu } from './components/EscapeMenu.jsx';
import { PassphraseChallenge } from './components/PassphraseChallenge.jsx';
import { CooldownTimer } from './components/CooldownTimer.jsx';

export function App() {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain') || 'this site';
  const scheduleName = params.get('schedule') || 'your schedule';

  const [view, setView] = useState('blocked');
  const [settings, setSettings] = useState({});
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    sendMessage('getSettings').then(resp => {
      if (resp && resp.settings) setSettings(resp.settings);
    });
  }, []);

  function handleEscapeAction(action) {
    if (settings.frictionLevel === 'none' || (!settings.passphrase && settings.frictionLevel !== 'wait')) {
      executeAction(action);
      return;
    }
    if (settings.frictionLevel === 'wait') {
      setPendingAction(action);
      setView('cooldown-wait');
      return;
    }
    setPendingAction(action);
    setView('passphrase');
  }

  function executeAction(action) {
    if (action === 'snooze') {
      sendMessage('snooze', { domain }).then(resp => {
        if (resp && resp.success) window.location.href = 'https://' + domain;
      });
    } else if (action === 'allow') {
      sendMessage('allowPermanently', { domain }).then(resp => {
        if (resp && resp.success) window.location.href = 'https://' + domain;
      });
    } else if (action === 'endEarly') {
      setView('cooldown-end');
    }
  }

  function handlePassphraseMatch() {
    if (pendingAction) executeAction(pendingAction);
    setPendingAction(null);
  }

  function handleCooldownComplete() {
    if (view === 'cooldown-wait') {
      executeAction(pendingAction);
    } else {
      sendMessage('endBlockEarly', { domain }).then(resp => {
        if (resp && resp.success) window.location.href = 'https://' + domain;
      });
    }
  }

  switch (view) {
    case 'blocked':
      return <BlockedState domain={domain} scheduleName={scheduleName} onEscape={() => setView('escape')} />;
    case 'escape':
      return <EscapeMenu domain={domain} scheduleName={scheduleName} onAction={handleEscapeAction} onBack={() => setView('blocked')} />;
    case 'passphrase':
      return <PassphraseChallenge passphrase={settings.passphrase} onMatch={handlePassphraseMatch} onCancel={() => { setView('escape'); setPendingAction(null); }} />;
    case 'cooldown-wait':
      return <CooldownTimer duration={5} description="Take a moment to reconsider before continuing." onComplete={handleCooldownComplete} onCancel={() => { setView('escape'); setPendingAction(null); }} />;
    case 'cooldown-end':
      return <CooldownTimer duration={settings.cooldownSeconds || 30} description={`This will end the "${scheduleName}" block until its next scheduled window.`} onComplete={handleCooldownComplete} onCancel={() => setView('escape')} />;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Create `src/entrypoints/blocked/components/BlockedState.jsx`**

```jsx
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { useCountdown, formatHMS } from '../../../hooks/useCountdown.js';
import { getData } from '../../../lib/storage.js';

export function BlockedState({ domain, scheduleName, onEscape }) {
  const [endTime, setEndTime] = useState(null);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const remaining = useCountdown(endTime);

  useEffect(() => {
    findEndTime(domain, scheduleName).then(setEndTime);
    loadScheduleInfo(scheduleName).then(setScheduleInfo);
  }, [domain, scheduleName]);

  useEffect(() => {
    if (endTime && remaining <= 0) {
      setTimeout(() => { window.location.href = 'https://' + domain; }, 1500);
    }
  }, [remaining, endTime, domain]);

  const daysLabel = scheduleInfo ? formatDaysLabel(scheduleInfo.days) : '';
  const timeLabel = scheduleInfo ? `${formatTimeLabel(scheduleInfo.startTime)}-${formatTimeLabel(scheduleInfo.endTime)}` : '';

  return (
    <div class="max-w-md mx-auto px-6 py-16 text-center">
      <div class="flex justify-center mb-4 text-ink"><Icon name="shield-check" size={24} /></div>
      <div class="text-xl font-semibold text-ink mb-1">{domain}</div>
      <div class="mono-cap mb-1">{scheduleName}</div>
      {scheduleInfo && <div class="mono-cap mb-6">{daysLabel} &middot; {timeLabel}</div>}
      <div class="font-mono text-4xl font-semibold text-ink mb-8">{formatHMS(remaining)}</div>
      <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 mb-4" onClick={onEscape}>
        Need to get in? <Icon name="chevron-right" size={12} />
      </button>
      <div>
        <button class="btn btn-ink" onClick={() => {
          if (window.history.length > 1) window.history.back();
          else chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.update(tab.id, { url: 'chrome://newtab' }); });
        }}>
          <Icon name="arrow-left" size={16} /> Keep me blocked
        </button>
      </div>
    </div>
  );
}

async function findEndTime(domain, scheduleName) {
  const result = await chrome.storage.local.get('focusBlock');
  const data = result.focusBlock;
  if (!data) return null;
  const now = new Date();
  if (data.focusSession && data.focusSession.endTime > now.getTime()) return data.focusSession.endTime;
  for (const schedule of data.schedules || []) {
    if (!schedule.enabled) continue;
    const curMin = now.getHours() * 60 + now.getMinutes();
    const [sH, sM] = schedule.startTime.split(':').map(Number);
    const [eH, eM] = schedule.endTime.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const inWindow = startMin <= endMin ? (curMin >= startMin && curMin < endMin) : (curMin >= startMin || curMin < endMin);
    if (!inWindow) continue;
    if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(now.getDay())) continue;
    const endDate = new Date(now);
    endDate.setHours(eH, eM, 0, 0);
    if (endMin <= startMin && curMin >= startMin) endDate.setDate(endDate.getDate() + 1);
    if (endDate > now) return endDate.getTime();
  }
  return null;
}

async function loadScheduleInfo(scheduleName) {
  const result = await chrome.storage.local.get('focusBlock');
  const data = result.focusBlock;
  if (!data) return null;
  const schedule = (data.schedules || []).find(s => s.name === scheduleName);
  if (!schedule) return null;
  return { days: schedule.days || [], startTime: schedule.startTime || '', endTime: schedule.endTime || '' };
}

function formatDaysLabel(days) {
  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  if (!days || days.length === 0 || days.length === 7) return 'EVERY DAY';
  const sorted = [...days].sort();
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return 'MON-FRI';
  if (sorted.length === 2 && sorted.join(',') === '0,6') return 'SAT-SUN';
  return sorted.map(d => names[d]).join(', ');
}

function formatTimeLabel(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}
```

- [ ] **Step 5: Create `src/entrypoints/blocked/components/EscapeMenu.jsx`**

```jsx
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { getData } from '../../../lib/storage.js';

export function EscapeMenu({ domain, scheduleName, onAction, onBack }) {
  const [overrideCount, setOverrideCount] = useState(0);

  useEffect(() => { loadOverrideCount().then(setOverrideCount); }, []);

  return (
    <div class="max-w-md mx-auto px-6 py-16">
      <div class="flex justify-center mb-4 text-ink"><Icon name="shield-check" size={24} /></div>
      <div class="text-center text-xl font-semibold text-ink mb-1">{domain}</div>
      <div class="text-center mono-cap mb-6">{scheduleName}</div>
      {overrideCount > 0 && (
        <div class="callout mb-4">
          You've overridden <strong>{overrideCount} time{overrideCount !== 1 ? 's' : ''}</strong> this week. Each override makes the next one easier to justify.
        </div>
      )}
      <div class="flex flex-col gap-2 mb-6">
        <button class="btn btn-outline w-full justify-between" onClick={() => onAction('snooze')}>
          Snooze for 5 minutes <Icon name="clock" size={14} />
        </button>
        <button class="btn btn-outline w-full justify-between" onClick={() => onAction('allow')}>
          Allow permanently <Icon name="check" size={14} />
        </button>
        <button class="btn btn-warn w-full justify-between" onClick={() => onAction('endEarly')}>
          End block early <Icon name="arrow-right" size={14} />
        </button>
      </div>
      <div class="text-center">
        <button class="btn btn-ink" onClick={onBack}>
          <Icon name="arrow-left" size={16} /> Keep me blocked
        </button>
      </div>
    </div>
  );
}

async function loadOverrideCount() {
  try {
    const data = await getData();
    const usage = data.usage || { escapeCounts: {}, snoozeCounts: {} };
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);
    let count = 0;
    const allEscapes = { ...usage.escapeCounts, ...usage.snoozeCounts };
    for (const key of Object.keys(allEscapes)) {
      const dateStr = key.split('|')[1];
      if (!dateStr) continue;
      const d = new Date(dateStr + 'T00:00:00');
      if (d >= monday && d <= now) count += allEscapes[key];
    }
    return count;
  } catch { return 0; }
}
```

- [ ] **Step 6: Create `src/entrypoints/blocked/components/PassphraseChallenge.jsx`**

```jsx
import { useState } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';

export function PassphraseChallenge({ passphrase, onMatch, onCancel }) {
  const [typed, setTyped] = useState('');
  const progress = Math.min(typed.length / passphrase.length, 1);
  const pct = Math.round(progress * 100);
  const isMatch = typed === passphrase;
  const hint = pct >= 100 ? (isMatch ? 'MATCH!' : 'NOT QUITE...') : 'KEEP TYPING...';

  return (
    <div class="max-w-md mx-auto px-6 py-16">
      <div class="flex justify-center mb-4 text-ink"><Icon name="lock" size={24} /></div>
      <div class="text-center text-xl font-semibold text-ink mb-2">Type your commitment phrase</div>
      <div class="text-center text-sm text-ink-3 mb-4">"{passphrase}"</div>
      <input
        type="text"
        class="field mb-3"
        value={typed}
        onInput={e => setTyped(e.target.value)}
        onPaste={e => e.preventDefault()}
        placeholder="Type your phrase..."
        autofocus
      />
      <div class="h-1.5 bg-rule-2 mb-2">
        <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div class="flex justify-between items-center mb-6">
        <span class="mono-cap">{pct}% MATCHED</span>
        <span class="mono-cap">{hint}</span>
      </div>
      <div class="flex justify-between items-center">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0" onClick={onCancel}>
          <Icon name="arrow-left" size={16} /> Cancel
        </button>
        <button class="btn btn-ink" disabled={!isMatch} onClick={onMatch}>Continue</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/entrypoints/blocked/components/CooldownTimer.jsx`**

```jsx
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { formatCooldownMMSS } from '../../../hooks/useCountdown.js';

export function CooldownTimer({ duration, description, onComplete, onCancel }) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef(null);
  const done = remaining <= 0;
  const pct = Math.round(((duration - remaining) / duration) * 100);

  useEffect(() => {
    setRemaining(duration);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [duration]);

  return (
    <div class="max-w-md mx-auto px-6 py-16">
      <div class="flex justify-center mb-4 text-ink"><Icon name="clock" size={24} /></div>
      <div class="text-center font-mono text-4xl font-semibold text-ink mb-4">
        {formatCooldownMMSS(remaining)}
      </div>
      <div class="h-1.5 bg-rule-2 mb-4">
        <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div class="text-center text-sm text-ink-3 mb-6">{description}</div>
      <div class="flex justify-between items-center">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0" onClick={() => { clearInterval(intervalRef.current); onCancel(); }}>
          <Icon name="arrow-left" size={16} /> Cancel
        </button>
        <button class="btn btn-ink" disabled={!done} onClick={onComplete}>
          {done ? 'CONFIRM' : `CONFIRM IN ${remaining}S`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify blocked page works**

Load the extension. Navigate to a blocked site. Verify:
- Countdown timer displays and ticks
- "Need to get in?" shows escape menu
- Override count callout appears when applicable
- Passphrase challenge works (paste disabled, progress bar, match detection)
- Cooldown timer works (countdown, button enables on completion)
- Snooze/allow/end-early all redirect correctly

- [ ] **Step 9: Commit**

```bash
git add src/entrypoints/blocked/
git commit -m "feat: convert blocked page to Preact with state machine components"
```

---

### Task 9: Convert Options Page

This is the largest task. The 1,020-line `options.js` splits into 7 component files plus a shell.

**Files:**
- Create: `src/entrypoints/options/index.html`
- Create: `src/entrypoints/options/main.jsx`
- Create: `src/entrypoints/options/App.jsx`
- Create: `src/entrypoints/options/components/SchedulesTab.jsx`
- Create: `src/entrypoints/options/components/ScheduleModal.jsx`
- Create: `src/entrypoints/options/components/AllowlistTab.jsx`
- Create: `src/entrypoints/options/components/ListsTab.jsx`
- Create: `src/entrypoints/options/components/ListModal.jsx`
- Create: `src/entrypoints/options/components/UsageTab.jsx`
- Create: `src/entrypoints/options/components/SettingsTab.jsx`

**Interfaces:**
- Consumes: all shared hooks and components; all lib modules
- Produces: full options UI with 5 tabs, schedule/list CRUD modals, usage dashboard, settings — identical to current `options.js` + `options.html`

This task is large enough that the implementer should convert one component at a time, verifying each tab works before moving to the next. The implementation order within this task should be:

1. `index.html` + `main.jsx` + `App.jsx` (tab shell)
2. `SchedulesTab.jsx` + `ScheduleModal.jsx` (most complex)
3. `AllowlistTab.jsx` (simplest)
4. `ListsTab.jsx` + `ListModal.jsx`
5. `UsageTab.jsx`
6. `SettingsTab.jsx`

Each sub-component should be built, then the whole options page verified before committing.

- [ ] **Step 1: Create `src/entrypoints/options/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus Block — Settings</title>
</head>
<body class="bg-bg min-h-screen">
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/entrypoints/options/main.jsx`**

```jsx
import { render } from 'preact';
import '../../assets/input.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('root'));
```

- [ ] **Step 3: Create `src/entrypoints/options/App.jsx`**

```jsx
import { useState } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { SchedulesTab } from './components/SchedulesTab.jsx';
import { AllowlistTab } from './components/AllowlistTab.jsx';
import { ListsTab } from './components/ListsTab.jsx';
import { UsageTab } from './components/UsageTab.jsx';
import { SettingsTab } from './components/SettingsTab.jsx';

const TABS = [
  { key: 'schedules', label: 'Schedules', icon: 'calendar' },
  { key: 'allowlist', label: 'Allowed Sites', icon: 'shield' },
  { key: 'usage', label: 'Usage', icon: 'bar-chart' },
  { key: 'lists', label: 'Site Lists', icon: 'clipboard-list' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

const TAB_COMPONENTS = {
  schedules: SchedulesTab,
  allowlist: AllowlistTab,
  usage: UsageTab,
  lists: ListsTab,
  settings: SettingsTab,
};

export function App() {
  const [activeTab, setActiveTab] = useState('schedules');
  const TabContent = TAB_COMPONENTS[activeTab];

  return (
    <div class="max-w-2xl mx-auto px-6 py-8">
      <div class="flex items-center gap-2 mb-6">
        <Icon name="shield-check" size={20} />
        <span class="text-lg font-semibold text-ink">Focus Block</span>
      </div>
      <nav class="flex border-b border-rule mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors bg-transparent cursor-pointer ${
              activeTab === t.key
                ? 'text-ink border-b-accent'
                : 'text-ink-3 border-b-transparent hover:text-ink-2'
            }`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <TabContent />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/entrypoints/options/components/SchedulesTab.jsx`**

This component renders the schedule list with cards, empty state templates, and a "New schedule" button. The edit/create modal is a separate component.

The implementer should replicate the exact schedule card HTML from `options.js` lines 79–144, converting innerHTML template strings to JSX. Key elements per card:
- Name + type chip (BLOCK/BLACKOUT/REDIRECT)
- Detail string (time range, site count, list names)
- Day pills (M T W T F S S)
- Toggle switch with friction check on disable
- Edit/Delete buttons

The empty state with template cards (lines 148–175) should also be replicated.

The toggle friction check (`toggleSchedule`, lines 177–206) must prompt/confirm before disabling an active schedule if friction is configured.

- [ ] **Step 5: Create `src/entrypoints/options/components/ScheduleModal.jsx`**

This is the largest single component (~200 lines). It replaces `openScheduleModal` through `saveCurrentSchedule` (lines 224–492 of options.js).

State to manage:
- `name`, `days`, `startTime`, `endTime`, `blackout`, `action`, `redirectUrl`
- `sites` (ad-hoc domain list)
- `listIds` (attached list references)

Sub-elements:
- Name text input
- `DayPills` component + `QuickDayButtons`
- Start/end time inputs with overnight hint
- Blackout toggle (hides sites section when on)
- Action radio (block page vs redirect URL)
- Ad-hoc site chips with add input
- List attachment dropdown + attached list chips
- Summary line
- Save/Cancel buttons

- [ ] **Step 6: Create `src/entrypoints/options/components/AllowlistTab.jsx`**

Simplest tab. Renders chip list of allowed domains with add input. Replaces lines 494–536 of options.js.

- [ ] **Step 7: Create `src/entrypoints/options/components/ListsTab.jsx` and `ListModal.jsx`**

`ListsTab` renders list cards with name, site count, "used in" info, edit/delete buttons, and the preset picker toggle. Replaces lines 540–689 of options.js.

`ListModal` is the edit/create form for lists — name input + site chips with add input. Similar to the schedule modal but much simpler.

- [ ] **Step 8: Create `src/entrypoints/options/components/UsageTab.jsx`**

Renders the 4-stat grid (blocks today, blocks this week, snoozes today, overrides this week) and coaching nudges. Replaces lines 699–804 of options.js. The nudge generation logic (lines 752–788) should be replicated exactly.

- [ ] **Step 9: Create `src/entrypoints/options/components/SettingsTab.jsx`**

Renders friction level select, passphrase management (current display, verify, new input), cooldown seconds, sync toggle with remote config detection, floating timer toggle with permission request, incognito status detect-and-nudge, and import/export buttons.

Replaces lines 806–1007 of options.js. Key behaviors:
- Passphrase change requires typing existing phrase first
- Sync toggle checks for remote config and offers adopt/overwrite
- Floating timer requests `<all_urls>` permission on enable
- Incognito status uses `chrome.extension.isAllowedIncognitoAccess`
- Export creates downloadable JSON blob
- Import reads file, validates, writes to storage

- [ ] **Step 10: Verify all options tabs work**

Load the extension, open options page. Test each tab:
- Schedules: create, edit, toggle, delete schedule; empty state templates
- Allowed Sites: add, remove domains
- Usage: stats display, coaching nudges
- Site Lists: create, edit, delete lists; preset picker; attach to schedule
- Settings: passphrase, friction, sync, floating timer, incognito, export/import

- [ ] **Step 11: Verify all file sizes are under 300 lines**

```bash
wc -l src/entrypoints/options/**/*.jsx src/entrypoints/options/*.jsx
```

If any file exceeds 300 lines, split it. `ScheduleModal.jsx` is the most likely candidate — extract the site/list attachment UI into a helper component if needed.

- [ ] **Step 12: Commit**

```bash
git add src/entrypoints/options/
git commit -m "feat: convert options page to Preact — 7 component files from 1,020-line monolith"
```

---

### Task 10: Clean Up Old Files and Update CLAUDE.md

**Files:**
- Delete: `popup.html`, `popup.js`, `options.html`, `options.js`, `blocked.html`, `blocked.js`, `onboarding.html`, `onboarding.js`, `background.js`, `content-timer.js`, `storage.js`, `schedule-engine.js`, `matching.js`, `templates.js`, `icons.js`, `styles.css`
- Delete: `src/input.css` (moved to `src/assets/input.css`)
- Delete: `scripts/preview.sh`, `scripts/timer-demo.html` (replaced by WXT dev server)
- Keep: `scripts/preview-all.html`, `scripts/mock-chrome.js` (for side-by-side preview, to be updated later)
- Modify: `manifest.json` — delete (WXT generates it)
- Modify: `CLAUDE.md` — update with new project structure
- Modify: `.gitignore`

**Interfaces:**
- Consumes: all previous tasks complete
- Produces: clean project with no duplicate files; updated documentation

- [ ] **Step 1: Delete old root-level source files**

```bash
git rm popup.html popup.js options.html options.js blocked.html blocked.js onboarding.html onboarding.js background.js content-timer.js storage.js schedule-engine.js matching.js templates.js icons.js styles.css manifest.json
git rm src/input.css
git rm scripts/preview.sh scripts/timer-demo.html
```

- [ ] **Step 2: Update CLAUDE.md**

Replace the existing content with updated architecture, file structure, commands, and conventions reflecting the WXT + Preact setup. Key changes:

- Architecture section: update file tree to `src/entrypoints/`, `src/lib/`, `src/hooks/`, `src/components/`
- Quick Reference: `npm run dev` starts WXT dev server; `npm run build` builds for production
- Remove Tailwind CLI build instructions (Vite handles CSS now)
- Remove "committed styles.css" references
- Update "Common Tasks" section for Preact component patterns
- Update coding conventions: JSX, Preact hooks, ES modules

- [ ] **Step 3: Run `npm run build` and verify production build**

Run: `npm run build`
Expected: Builds to `.output/chrome-mv3/` without errors. All entry points present.

- [ ] **Step 4: Load production build as unpacked extension and smoke test**

Load `.output/chrome-mv3/` in Chrome. Verify:
- Popup opens and shows correct status
- Options page renders all 5 tabs
- Blocking works (schedule a test, visit a blocked site)
- Onboarding flow works (clear storage, reload)
- Focus Now works
- Escape actions work (snooze, allow, end early)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old vanilla JS files, update CLAUDE.md for WXT + Preact"
```

---

### Task 11: Rebuild Preview Tooling

**Files:**
- Modify: `scripts/preview-all.html` — update iframe src paths for WXT dev server
- Modify: `scripts/mock-chrome.js` — keep for fallback, update if API paths changed

**Interfaces:**
- Consumes: WXT dev server running on a port (default 3000-3100 range)
- Produces: side-by-side preview page showing all extension surfaces at realistic sizes

- [ ] **Step 1: Update `scripts/preview-all.html`**

WXT's dev server serves extension pages at the root (e.g., `http://localhost:3000/popup.html`). Update all iframe `src` attributes to point to the WXT dev server. The exact port is assigned at runtime — use a relative approach or a configurable base URL.

Since preview-all.html needs to load extension pages that require `chrome.*` APIs, the simplest approach is to create it as a WXT unlisted page entry point so it runs inside the extension context:

Create `src/entrypoints/preview.html`:
```html
<!-- WXT unlisted page for side-by-side preview -->
```

This page would use `chrome.runtime.getURL('/popup.html')` etc. for iframe sources. This approach gives real chrome API access in all iframed pages.

If WXT doesn't support iframing its own extension pages, fall back to the mock-chrome approach: serve preview-all.html separately and inject mock-chrome.js into each iframe.

- [ ] **Step 2: Test the preview page**

Run `npm run dev`, open the preview page. Verify all surfaces render at realistic sizes with real or mocked data.

- [ ] **Step 3: Commit**

```bash
git add scripts/ src/entrypoints/preview.html
git commit -m "feat: rebuild side-by-side preview tooling for WXT dev server"
```
