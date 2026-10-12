---
description: Preview the extension UI in a browser for visual development. Serves the WXT build with a mocked chrome.* API (scripts/mock-chrome.js). Use for design iteration.
---

# Preview Extension UI

## Quick start

```bash
pnpm build      # preview serves .output/chrome-mv3/ (built automatically if missing)
pnpm preview    # http://localhost:3210
```

## Combined preview

`http://localhost:3210/` (also `/preview-all.html`) shows all 4 extension surfaces at once:
- **Popup** at 360px width
- **Blocked page** with state toggles (Default / Passphrase Challenge / Cooldown)
- **Onboarding** with step toggles (Step 1 / Step 2 / Step 3)
- **Options** at full width

Individual pages are served from the build: `/popup.html`, `/options.html`, `/onboarding.html`, `/blocked.html?url=…`.

## Dev workflow

1. Edit JSX in `src/entrypoints/**` or styles in `src/assets/input.css`
2. `pnpm build` (the preview server doesn't watch; rebuild, then refresh)
3. For HMR inside real Chrome, use `pnpm dev` instead

WXT bundles the CSS; there is no compiled `styles.css` to commit.

## Limitations

- `chrome.*` is mocked by `scripts/mock-chrome.js` (v2 data model, in-memory). Messages to the background and real blocking don't run
- For functional testing use `pnpm test:e2e` or load `.output/chrome-mv3/` unpacked via `chrome://extensions`
