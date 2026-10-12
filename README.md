# Just Concentrate

A free, privacy-respecting Chrome extension that blocks distracting websites on recurring daily schedules. Fully local, zero data collection, no backend.

## Getting Started

### Prerequisites

- Node.js 20.12+
- [pnpm](https://pnpm.io/)
- Chrome browser

### Install & Build

```bash
pnpm install
pnpm build
```

### Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select `.output/chrome-mv3/`
4. Just Concentrate appears in your toolbar

### Development

```bash
pnpm dev              # WXT dev server with HMR — loads extension into Chrome automatically
```

### Preview UI (no extension install needed)

Preview all extension surfaces in a single browser page with mock data:

```bash
pnpm preview
```

Opens `http://localhost:3210` with every surface — popup, blocked page, onboarding, and options — rendered side-by-side. Chrome APIs are stubbed so the UI renders outside the extension context. For full functional testing, use the unpacked extension.

### Test

```bash
pnpm test             # unit tests (Vitest): engine, rules, storage, importers, coaching
pnpm test:e2e         # builds, then loads the real extension in Chromium (Playwright)
pnpm lint
```

The e2e suite serves fake `*.test` sites locally and checks real blocking: domain, path (incl. SPA route changes), keyword, blackout, redirect, open-tab cutover, end-early, cooldown, daily limits and Pomodoro.

### Build for Store

```bash
pnpm store:assets     # regenerate icons, promo tiles and screenshots (1280x800 store shots + detail shots)
pnpm zip              # creates a .zip ready for Chrome Web Store upload
```

Listing copy, permission justifications and the submission checklist live in `store/listing.md`; the privacy policy is `docs/privacy-policy.md`.

## Architecture

Built with [WXT](https://wxt.dev/) + [Preact](https://preactjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/).

```
wxt.config.ts              WXT config: manifest, Vite plugins
src/
  entrypoints/
    background/index.js    Service worker: block state, DNR rules, navigation intercept, alarms, time tracking
    popup/                 Toolbar popup: status, Focus Now / Pomodoro, quick-block
    options/               Settings: schedules + daily limits, allowlist, usage, lists, settings
    blocked/               Block page: countdown, "End block early" (friction-gated)
    onboarding/            First-run flow: templates, optional commitment phrase
  lib/                     Pure logic: schedule engine, matching, DNR rules, storage, friction, coaching, importers
  hooks/                   Preact hooks: storage, messaging, countdown, friction gate
  components/              Shared UI: Icon, DayPills, Modal, friction flow
  assets/input.css         Tailwind v4 source with @theme tokens
  public/
    icons/                 Extension icons (16, 32, 48, 128px)
    presets/               Bundled site lists (social, news, streaming, adult)
e2e/                       Playwright tests against the built extension
store/                     Web Store listing copy and assets
```

## No Network Required

The extension makes zero network requests at runtime and requests no host permissions. No analytics, no telemetry, no external API calls. Site lists and fonts are bundled in the extension and refresh only via Web Store updates.
