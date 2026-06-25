# Just Concentrate — Chrome Extension

A free, privacy-respecting Manifest V3 Chrome extension that blocks distracting websites on recurring daily schedules. Fully local, zero data collection, no backend.

## Quick Reference

- **Type:** Chrome Extension (Manifest V3), built with WXT + Preact
- **Version:** 0.1.0
- **Dev server:** `pnpm dev` — starts WXT dev server with HMR, loads extension into Chrome automatically
- **Production build:** `pnpm build` — outputs to `.output/chrome-mv3/`
- **Package for store:** `pnpm zip`
- **Test in Chrome:** `chrome://extensions` → Developer mode → Load unpacked → select `.output/chrome-mv3/`

## Architecture

```
wxt.config.ts              ← WXT config: manifest, Vite plugins (Preact, Tailwind)
src/
  entrypoints/
    background/index.js    ← Service worker: rule evaluation, DNR, alarms, message hub
    popup/
      index.html           ← Toolbar popup HTML shell
      main.jsx             ← Popup entry point
      App.jsx              ← Popup root component
    options/
      index.html           ← Full settings UI HTML shell
      main.jsx             ← Options entry point
      App.jsx              ← Options root component (5 tabs)
      components/          ← SchedulesTab, ListsTab, AllowlistTab, UsageTab, SettingsTab, modals
    blocked/
      index.html           ← Block page HTML shell
      main.jsx             ← Blocked page entry point
      App.jsx              ← Blocked page root component
      components/          ← BlockedState, CooldownTimer, EscapeMenu, PassphraseChallenge
    onboarding/
      index.html           ← Onboarding HTML shell
      main.jsx             ← Onboarding entry point
      App.jsx              ← Onboarding root component
    content-timer.js       ← Content script: floating timer overlay
  lib/
    storage.js             ← Data layer: chrome.storage.local/sync abstraction
    schedule-engine.js     ← Pure functions: time window evaluation, next-boundary calc
    matching.js            ← Pure functions: domain matching, URL checking
    templates.js           ← Onboarding template definitions
  hooks/
    useStorage.js          ← Preact hook: reactive chrome.storage access
    useMessage.js          ← Preact hook: chrome.runtime.sendMessage wrapper
    useCountdown.js        ← Preact hook: countdown timer logic
  components/
    Icon.jsx               ← Inline SVG icon helper (Lucide-style)
    Toggle.jsx             ← Toggle switch component
    Chip.jsx               ← Chip/tag component
    DayPills.jsx           ← Day-of-week pill selector
    Modal.jsx              ← Modal dialog wrapper
    EmptyState.jsx         ← Empty state placeholder
  assets/
    input.css              ← Tailwind v4 source: @theme tokens + component classes
  public/
    icons/                 ← icon16.png, icon48.png, icon128.png
    presets/               ← Bundled site lists: social.json, news.json, streaming.json, adult.json
docs/design-doc.md         ← Full design document with all decisions (D1-D12)
docs/backlog.md            ← Deferred features and known limitations
scripts/
  preview-all.html         ← Side-by-side UI preview (all surfaces)
  mock-chrome.js           ← Chrome API mock for preview tooling
```

## Data Model (src/lib/storage.js)

All state lives in `chrome.storage.local['justConcentrate']`:

```
schedules[]        — Array of Schedule objects (id, name, days[], startTime, endTime, blackout, adHocSites[], listIds[], enabled)
lists[]            — Array of List objects (id, name, sites[], origin: "user"|"frozen"|"live")
allowlist[]        — Array of domain strings (always wins over blocklist)
settings           — { frictionLevel, passphrase, theme, syncEnabled, cooldownSeconds, snoozeDurationMinutes, onboardingComplete }
focusSession       — Active focus session or null (duration, endTime, blackout, domains)
usage              — { blockCounts, escapeCounts, snoozeCounts, siteTime } keyed by "domain|YYYY-MM-DD"
commitmentEndTimes — { scheduleId: timestamp } for resume-on-re-enable
```

## How Blocking Works (Three Layers)

1. **DNR rules** (`chrome.declarativeNetRequest`) — redirect matched URLs to `blocked.html`
2. **Navigation intercept** (`chrome.webNavigation.onCommitted`) — catches redirects DNR misses
3. **Cached block state** (`_blockState` in storage) — fast lookup for blocked page

`src/entrypoints/background/index.js:updateBlockingRules()` is the main orchestrator — called when schedules change, alarms fire, or focus sessions start/end.

## Message Protocol (chrome.runtime.sendMessage)

Messages from popup/options/blocked → background:

| type | purpose | sender |
|------|---------|--------|
| `getBlockStatus` | current block state | popup |
| `startFocus` | begin focus session | popup |
| `endFocus` | cancel focus session | popup |
| `refreshRules` | force re-evaluation | options, popup, onboarding |
| `snooze` | temporarily unblock domain | blocked |
| `allowPermanently` | add to allowlist | blocked |
| `endBlockEarly` | disable schedule until next window | blocked |
| `getSettings` | return current settings | blocked |

## Key Design Decisions

- **D1:** Self-control commitment device, not security enforcement
- **D3:** Single global allowlist — always wins, keeps email/banking reachable in blackout
- **D5:** Friction off by default, opt-in. Three levels: none / wait / passphrase
- **D6:** Domain-level matching only (v1). Subdomains auto-matched. Path-level deferred to P2
- **D8:** Zero runtime network. No network permission in manifest. Presets bundled
- **D10:** Passphrase = user's own reason. Exact match, paste disabled
- **D11:** Sync is config-only (last-write-wins). Usage stays local

## Domain Matching (src/lib/matching.js)

- Matches registrable domain + all subdomains
- `reddit.com` blocks `reddit.com`, `www.reddit.com`, `old.reddit.com`
- Normalization: lowercase, strip `www.` prefix
- Allowlist checked first (always wins)

## Schedule Engine (src/lib/schedule-engine.js)

- Time windows support midnight-crossing (e.g., 22:00–07:00)
- `days[]` uses 0=Sun through 6=Sat (empty = every day)
- `getNextWindowBoundary()` returns minutes until nearest schedule start/end (max 60)
- Blackout mode = block everything except allowlist

## Coding Conventions

- **Preact + JSX** — UI components use `.jsx` extension with Preact hooks (`useState`, `useEffect`, etc.)
- **ES modules** — use `import`/`export` in all source files; no script-tag globals
- **CSS class attribute** — use `class` (not `className`) in Preact JSX (Preact convention)
- **Tailwind CSS v4** — utility classes in JSX, component classes in `src/assets/input.css`; Vite rebuilds CSS automatically (no manual `npm run build` for CSS)
- Design tokens defined via `@theme` in `src/assets/input.css` — do not hardcode colors/fonts
- Storage access via `src/lib/storage.js` helpers, never raw `chrome.storage` API
- Icons via `<Icon name="..." size={...} />` component from `src/components/Icon.jsx`
- Shared UI primitives (Toggle, Chip, DayPills, Modal, EmptyState) in `src/components/`
- Async message handlers in background wrapped in `.catch()` to avoid service worker crashes
- `isUpdatingRules` guard in background prevents re-entrant storage listener loops

## Common Tasks

**Add a new escape action on the block page:** Add a new component or button in `src/entrypoints/blocked/components/EscapeMenu.jsx`, add handler in `src/entrypoints/blocked/App.jsx`, add message type in `src/entrypoints/background/index.js` message listener.

**Add a new setting:** Add default to `src/lib/storage.js:DEFAULT_DATA.settings`, add UI in `src/entrypoints/options/components/SettingsTab.jsx`, read in whichever component needs it.

**Add a new preset:** Create `src/public/presets/name.json` with `{name, origin: "frozen", sites: [...]}`, add to `wxt.config.ts` web_accessible_resources, reference in `src/lib/templates.js`.

**Modify blocking logic:** Core is in `src/entrypoints/background/index.js:updateBlockingRules()` and `src/lib/schedule-engine.js:getActiveBlockedDomains()`.

**Add a shared UI component:** Create `src/components/MyComponent.jsx`, import it in the entrypoint that needs it.

**Add a Preact hook:** Create `src/hooks/useMyHook.js`, import it in the component that needs it.

## Preview UI

The side-by-side preview shows all extension surfaces at realistic sizes. Builds automatically if needed:

```bash
pnpm preview
```

This starts a local server at `http://localhost:3210` that serves the build output with `mock-chrome.js` injected into each page. Chrome APIs are stubbed with test data so the UI renders outside the extension context. For full functional testing, load the unpacked extension at `chrome://extensions` → `.output/chrome-mv3/`.

## Git & GitHub

- **Push as `cowenld`:** This repo is owned by `cowenld`. Use `gh auth login` as `cowenld` or prefix push/PR commands with the correct account: `GH_TOKEN=$(gh auth token -h github.com -u cowenld) git push ...`
- Shortcut: `gh pr create` and `git push` will work if `cowenld` is the active `gh` auth account.

## Known Gotchas

- `src/entrypoints/background/index.js` is a Manifest V3 service worker — it can be terminated by Chrome at any time. All state must be in `chrome.storage`, not in-memory variables (except transient `isUpdatingRules` flag).
- The blocked page runs in an extension page context, not a content script — it can use `chrome.runtime.sendMessage` but not access the blocked page's DOM.
- Sync payload has 8KB quota per item — Settings shows a warning at 75% and an error at 100%. Payload sharding across multiple keys is a backlog item for extreme cases.
- Schedule times are "HH:MM" strings compared lexicographically for midnight-crossing detection.
- WXT generates `manifest.json` from `wxt.config.ts` — do not create a root-level `manifest.json`.
- CSS is compiled by Vite/Tailwind at build time — do not commit a root-level `styles.css`.
