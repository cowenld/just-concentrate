---
description: Preview the extension UI in a browser for visual development. Opens HTML pages directly — CSS renders fully but chrome.* JS APIs won't work. Use for design iteration.
---

# Preview Extension UI

## Quick start

```bash
./scripts/preview.sh --all     # combined view with state toggles (recommended)
./scripts/preview.sh           # open all pages individually
./scripts/preview.sh popup     # open just the popup
./scripts/preview.sh --urls    # print URLs only
```

## Combined preview (`--all`)

Opens a single dark-background page showing all 4 extension surfaces at once:
- **Popup** at 360px width
- **Blocked page** with state toggle buttons (Default / Escape / Passphrase / Cooldown)
- **Onboarding** with step toggle buttons (Step 1 / Step 2 / Step 3)
- **Options** at full width

This mode starts a local HTTP server on port 3210 (required for iframe state toggling to work). URL: `http://localhost:3210/scripts/preview-all.html`

## Dev workflow

1. Run `./scripts/preview.sh --all` to open combined preview + start watcher
2. Edit HTML files or `src/input.css`
3. Tailwind auto-recompiles `styles.css` on every save
4. Refresh the browser tab to see changes

## Important: rebuilding CSS

- `npm run dev` — starts the watcher, auto-rebuilds on file changes (started by `preview.sh`)
- `npm run build` — one-shot minified build
- **If you edit HTML or CSS without the watcher running, you MUST run `npm run build` before committing.** The compiled `styles.css` is what the extension loads.

## Limitations

- Chrome extension APIs (`chrome.runtime`, `chrome.storage`, etc.) don't work — JS errors in console are expected, but UI layout/styling renders correctly
- For full functional testing, load as unpacked extension via `chrome://extensions`
