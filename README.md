# Just Concentrate

A free, privacy-respecting Chrome extension that blocks distracting websites on recurring daily schedules. Fully local, zero data collection, no backend.

## Getting Started

### Prerequisites

- Node.js 18+
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

### Build for Store

```bash
pnpm zip              # creates a .zip ready for Chrome Web Store upload
```

## Architecture

Built with [WXT](https://wxt.dev/) + [Preact](https://preactjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/).

```
wxt.config.ts              WXT config: manifest, Vite plugins
src/
  entrypoints/
    background/index.js    Service worker: rule evaluation, DNR, alarms
    popup/                 Toolbar popup: status, Focus Now, quick-block
    options/               Full settings: schedules, lists, allowlist, usage
    blocked/               Block page: countdown, escape actions
    onboarding/            First-run flow: templates, commitment phrase
    content-timer.js       Floating countdown overlay (opt-in)
  lib/                     Pure logic: storage, schedule engine, matching
  hooks/                   Preact hooks: storage, messaging, countdown
  components/              Shared UI: Icon, Toggle, Chip, DayPills, Modal
  assets/input.css         Tailwind v4 source with @theme tokens
  public/
    icons/                 Extension icons (16, 48, 128px)
    presets/                Bundled site lists (social, news, streaming, adult)
```

## No Network Required

The extension makes zero network requests at runtime. No analytics, no telemetry, no external API calls. Site lists are bundled in the extension and refresh only via Web Store updates.
