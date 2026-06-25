# Just Concentrate — Feature Backlog

Unbuilt features from the design document, ordered roughly by impact. Items marked with their original priority tier for context.

---

## Incomplete P1 — ✅ DONE (2026-06-23)

All three shipped in `feat: complete Incomplete-P1`. P1 is now feature-complete; a UX-refinement pass on these three is the recommended next step (see Ideas).

- [x] **Floating on-page countdown timer** — opt-in overlay (off by default) showing remaining time in the active Focus/schedule session. Ships with zero host permissions; enabling requests `<all_urls>` at runtime and injects a Shadow-DOM overlay via `chrome.scripting`. *(§9)*
- [x] **Live preset: Adult** — bundled curated adult-content list (`origin: "live"`), re-syncs from the packaged JSON on extension update (no network). Added via the new "+ FROM PRESET" picker in Site Lists. *(§4.2, D4)*
- [x] **Empty-state reuse** — the Schedules empty state now offers the onboarding template cards for one-click setup. Templates extracted to a shared `templates.js`. *(§6.1)*

## P2

Features explicitly deferred in the design document.

- [ ] **Path-level blocking** — block specific paths like `linkedin.com/feed` while allowing `linkedin.com/messaging`. Requires a content script watching client-side route changes. Fragile for SPAs. *(§8, §11.3)*
- [ ] **In-page blocking** — e.g. YouTube Shorts vs normal videos. Same content-script dependency as path-level. *(§8)*
- [ ] **Per-site daily time budgets** — a quota distinct from a time window. "15 minutes of Reddit per day" rather than "blocked 9–5." Needs active-tab time tracking (focus, audible, idle detection). *(§11.3, §13.4)*
- [ ] **Wildcard/keyword blocking UI** — `*.x.com` or keyword-based blocking behind an "advanced" affordance. Domain wildcards are partially supported in matching.js but no UI exists. *(§8, §11.3)*
- [ ] **Competitor import** — parse LeechBlock NG and StayFocusd JSON export formats. Needs format research for each. *(§11.3, §13.6)*
- [ ] **Custom CSS on block page** — let users apply their own HTML/CSS to the blocked page. *(§11.3)*
- [ ] **Pomodoro-style sessions** — work/break cycles with automatic timers, distinct from Focus Now's simple countdown. *(§11.3)*

## Known limitations

Working features with documented edges, in rough priority order.

- [x] **Incognito requires user opt-in (Chrome design)** — extensions don't run in incognito unless the user enables "Allow in Incognito", so incognito is an easy bypass. Chrome forbids extensions from auto-granting this. Mitigated (2026-06-23): manifest declares `"incognito": "spanning"` so blocking works correctly once enabled, and the Settings tab detects access via `chrome.extension.isAllowedIncognitoAccess()` and nudges (with a deep-link to the toggle) when it's off. Kept Settings-only to avoid being invasive. *(D1 — commitment device, not security enforcement)*
- [ ] **Sync payload sharding** — synced config is stored as a single `chrome.storage.sync` key, which has an 8KB-per-item quota. A very large config (dozens of lists with hundreds of sites) exceeds it. Mitigated: Settings now shows a warning at 75% and an error at 100%, and failed sync writes log to console. Full fix: shard the payload across multiple keys. *(§12 quota note)*

## Ideas (not in design doc)

Space for future ideas that come up during development or user feedback.

- [ ] *Add items here as they come up*
- [ ] **UX-refinement pass on the new P1 features** — visual polish of the floating-timer overlay (position/drag/animation), onboarding + empty-state copy accuracy, and the preset-picker layout. The features are functionally complete but shipped lean; this is the recommended next step before release.

---

**Last updated:** 2026-06-23
