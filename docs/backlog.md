# Just Concentrate — Backlog

What's left, roughly in priority order. Everything in design doc §11.1–11.3 has shipped except in-page blocking.

**Last updated:** 2026-10-12 (v0.2.0)

---

## Before first store release

- [ ] **Manual QA pass in real Chrome** on a normal profile: install, onboarding, every template, sync between two profiles, incognito on/off, disable → re-enable during a block, laptop sleep across a window boundary. The automated suite covers blocking end-to-end (`pnpm test:e2e`) but not sync between real profiles or sleep/wake.
- [ ] **Publish the privacy policy** (`docs/privacy-policy.md`) at a public URL (e.g. GitHub Pages) and put the link in the store listing.
- [ ] **Create the Chrome Web Store developer account** ($5 one-off), then submit using `store/listing.md` (copy, permission justifications, data disclosures, assets).
- [ ] **Open-source the repo** (D8's trust lever) and link it from the listing and the in-app Privacy card.
- [ ] **Version 1.0.0** when submitting (currently 0.2.0).

## P2 — not built

- [ ] **In-page blocking** — hide YouTube Shorts shelves, the LinkedIn feed module, etc. inside otherwise-allowed pages. Needs a content script on every page, which means `<all_urls>` host access — at best as an optional permission requested at runtime. Path entries (`youtube.com/shorts`, `linkedin.com/feed`) cover the common cases without it. *(§8)*

## Ideas

- [ ] **Dark theme** — tokens are centralized in `src/assets/input.css`; needs a dark `@theme` variant and a Settings toggle (the old unused `theme` setting was removed in the v2 schema).
- [ ] **Coaching tuning** — design §9 calls for full / wins-only / off. Insights are currently always on (but dismissible and pull-only).
- [ ] **Edge / Firefox builds** — WXT can target both; Firefox MV3 has DNR differences to verify.
- [ ] **Group budgets** — StayFocusd limits a whole group's combined time; imports approximate this as per-site limits.
- [ ] **Schedule exceptions** — skip a schedule for one day (holidays) without turning it off.

## Known limitations

- **Incognito needs user opt-in** (Chrome design). Settings detects it and links to the toggle. *(D1)*
- **Disabling the extension** at `chrome://extensions` always works — this is a commitment device, not enforcement (D1, §7). Blocks resume on re-enable.
- **Keyword entries match URLs, not page content.**
- **Time tracking granularity** — credited on tab/window/idle changes and once a minute; capped at 2 minutes per interval so sleep isn't counted. Budgets can overshoot by up to a minute.
- **DST** — windows spanning the twice-yearly change drift by an hour (accepted, §13).
- **Regex rule cap** — Chrome allows 1,000 regex DNR rules; path entries beyond that still block via navigation interception, just after the request starts.

## Done (history)

- **v0.2.0 (2026-10-12)** — Fixed the dead DNR layer (redirect rules silently needed host permissions; now `block` rules + navigation-error redirect, no host permissions). End early now suspends instead of disabling (schedules previously never re-enabled). Fixed: toggling an active schedule off threw and did nothing; overnight windows ignored day-of-week after midnight; usage dates were UTC; usage writes rebuilt rules and hit sync rate limits; Google Fonts loaded from the network (now bundled); presets were web-accessible to every site. Added: friction levels none/wait/passphrase (default wait) gating every weakening action; path + keyword entries; daily time budgets with local time tracking; Pomodoro; custom block page; time-based coaching; StayFocusd import; sharded sync; real icons + store assets; Playwright e2e suite.
- **2026-06-23** — Incomplete P1 shipped (floating timer — since replaced by the badge countdown, Adult live preset, empty-state templates). Incognito `spanning` + Settings nudge.
