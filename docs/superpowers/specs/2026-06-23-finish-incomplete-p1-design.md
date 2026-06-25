# Finish Incomplete P1 — Design

**Date:** 2026-06-23
**Scope:** Complete the three "Incomplete P1" backlog items so Focus Block is feature-complete and ready to ship (pending UX refinement). Items: (1) floating on-page countdown timer, (2) live "Adult" preset, (3) empty-state reuse of the onboarding template flow.

This is pre-approved work — the user asked to build all three. The goal afterward is to declare "ready to ship, needs a UX pass" rather than to ship as-is.

---

## Guiding constraint (applies to all three)

Focus Block's headline positioning is **privacy / "exfiltration-proof": the manifest requests no network and no host permissions** (verified — current `permissions` are `declarativeNetRequest, storage, alarms, tabs, webNavigation`; no host permissions, no `<all_urls>` outside `web_accessible_resources`). Nothing here may add an install-time host-permission prompt. D8 (zero runtime network) also holds — no feature fetches anything off-device.

---

## Feature 1 — Floating on-page countdown timer

**What it does:** An optional small overlay, fixed to the bottom-right of normal web pages, showing the time remaining (HH:MM:SS) in the currently-active Focus session or blocking schedule window, with the session label. Off by default.

**Permission model (the crux):** Adding a content script to web pages normally forces a required host permission at install — which would break the "no host permissions" claim. Instead:

- Add `"scripting"` to `permissions` and `"<all_urls>"` to a new `optional_host_permissions` in the manifest. Optional permissions do **not** appear at install and do **not** show the scary warning until the user opts in.
- The overlay ships **disabled**. Enabling it (Settings toggle) calls `chrome.permissions.request({ origins: ['<all_urls>'] })` from the options-page user gesture. If granted, the background registers a dynamic content script via `chrome.scripting.registerContentScripts`. If denied, the toggle reverts.
- Disabling unregisters the content script. `chrome.permissions.onRemoved` also unregisters + flips the setting off, so revoking access in `chrome://extensions` self-heals.
- A declarative manifest `content_scripts` entry is explicitly **not** used (it would force the install-time prompt).

**Components:**

- `content-timer.js` (NEW): runs in the ISOLATED world on top frames. Builds a host `<div>` attached to `document.documentElement` with an attached **Shadow DOM** so neither the host page's CSS nor ours leak across. All overlay CSS is inlined as a `<style>` string inside the shadow root (brand tokens hard-copied: accent `#1f4cff`, Geist Mono, white card, hairline rule). Queries background `{type:'getTimerState'}`; if `{active:true}`, shows the pill and ticks down locally every 1s from `endTime`. Re-polls every 20s and also listens for a pushed `{type:'timerStateChanged'}` to refresh immediately. Includes a small `×` to dismiss for the current page (until next navigation). Registered with `files:['content-timer.js']` — dynamically-registered content-script files do **not** require `web_accessible_resources`.
- `background.js`: new `getTimerState` message handler returning `{active, endTime, label}` via a new `getActiveSessionInfo()` helper (focus session wins; else the soonest-ending currently-active schedule, with midnight-cross handling, label = schedule name). New `registerTimerContentScript()` / `unregisterTimerContentScript()` (guarded). New `setFloatingTimer` message (called by options after the permission grant) that registers/unregisters and persists the setting. New `broadcastTimerState()` that `chrome.tabs.sendMessage`s `{type:'timerStateChanged'}` to all tabs (errors for tabs without the script are swallowed); called on focus start/end, the focus-end alarm, and the boundary alarm. On startup/install, re-register if the setting is on **and** the permission is still present.
- `storage.js`: `settings.floatingTimer` default `false`.
- `options.html` / `options.js`: a "Floating on-page timer" toggle in the Settings tab with copy explaining it needs permission to display on the pages you visit, and that this is the only feature that ever asks for page access. Enable → request permission → message background; revert on denial.

**Why this shape:** Shadow DOM is the robust way to render into arbitrary pages. Optional host permission is the only way to add a page overlay without breaking the privacy story. Local ticking + periodic re-sync keeps it accurate without a persistent connection (the SW can be killed any time).

## Feature 2 — Live "Adult" preset

**What it does:** A bundled, curated adult-content blocklist that users can add as a reusable list. Origin `"live"` (distinct from `"frozen"`): its sites re-sync from the bundled JSON whenever the extension updates, so the curated list stays current — without ever fetching from the network (the list ships in the package; "live" = follows the package, "frozen" = a user's one-time snapshot).

**Components:**

- `presets/adult.json` (NEW): `{ name: "Adult Content", origin: "live", sites: [...] }`, curated list of well-known adult domains (legitimate content-filtering / parental-control use).
- `manifest.json`: add `presets/adult.json` to `web_accessible_resources` so it's fetchable.
- `templates.js` (NEW, shared — see Feature 3): owns the `PRESETS` map (incl. `adult`), `loadPresets()`, and `addPresetList(presetKey)`. A list created from a `live` preset is saved as `{ origin: 'live', presetKey }`; others as `{ origin: 'frozen' }`.
- `options.html` / `options.js`: an "+ ADD FROM PRESET" affordance in the **Site Lists** tab that lets the user add any bundled preset (Social, News, Streaming, Adult Content) as a list at any time — the natural, discoverable home for the Adult preset, and a small bonus for the existing presets. Skips presets already added.
- `background.js`: `refreshLivePresets()` run on `onInstalled` with `reason === 'update'` — loads bundled presets and replaces `sites` on every list with `origin === 'live'` && a `presetKey`, then refreshes rules. Implemented by `importScripts('templates.js')`; `templates.js` is DOM-free so it is safe in the service worker.

## Feature 3 — Empty-state reuse

**What it does:** When there are no schedules, the Schedules tab's empty state offers the onboarding **template-and-teach** flow (Work Focus / Bedtime / Deep Work cards) for one-click setup, instead of only a bare "create your first schedule" button.

**Components:**

- `templates.js` (NEW, shared): extracts `TEMPLATES` and a UI-free `applyTemplateToStorage(templateKey)` (creates the preset lists + schedule in storage, returns `{ siteCount }`) out of `onboarding.js`, so onboarding and options share one source of truth.
- `onboarding.js`: refactored to consume `templates.js` (keeps its own step-UI logic; drops the duplicated data + storage writes).
- `onboarding.html`: add `<script src="templates.js">` before `onboarding.js`.
- `options.html` / `options.js`: the `schedules-empty` block renders the three template cards (reusing the existing onboarding card utility classes) plus the existing "create from scratch" button. Clicking a card calls `applyTemplateToStorage`, refreshes rules, and re-renders. The plain "create your first schedule" button is kept as the scratch path.

**Why shared `templates.js`:** Both surfaces now need the same template + preset logic; duplicating it would drift. DOM-free so the service worker can reuse it for `refreshLivePresets`.

---

## Cross-cutting / build

- Files touched by multiple features (`manifest.json`, `background.js`, `options.html`, `options.js`) mean features are implemented **sequentially**, not in parallel, to avoid clobbering.
- New utility-class strings used in `options.js`/`options.html` are picked up by the Tailwind v4 scanner; **run `npm run build`** and commit `styles.css`.
- The preview mock (`scripts/mock-chrome.js`) lacks `chrome.scripting` / `chrome.permissions`; the timer toggle is functional only in a real unpacked extension. Other surfaces preview normally.

## Testing / verification

- Static: `node -c` (syntax) on changed JS; confirm `manifest.json` is valid JSON; confirm `styles.css` rebuilt.
- Manual (unpacked extension): timer off by default and no host permission requested at install; enabling prompts for permission and shows the overlay during an active session; disabling/revoking removes it. Adding the Adult preset creates a `live` list that blocks; simulated update refreshes its sites. Deleting all schedules shows the template cards; a card recreates a schedule.
- Out of scope (deferred to the UX-refinement pass the user asked for next): visual polish of the overlay, onboarding/empty-state copy, and any animation.
