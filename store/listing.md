# Chrome Web Store listing — Just Concentrate

Everything needed for the Developer Dashboard. Assets are regenerated with `pnpm store:assets`.

## Package

`pnpm zip` → `.output/just-concentrate-<version>-chrome.zip`. Bump `package.json` version to `1.0.0` before the first submission.

## Store listing tab

**Name:** Just Concentrate

**Summary (≤132 chars):**
Block distracting sites on your schedule. Free, unlimited, and fully local — no accounts, no tracking, no data leaves your device.

**Category:** Productivity → Tools (or Workflow & Planning)

**Description:**

> Just Concentrate blocks the sites that pull you away, on the schedule you choose, and it keeps everything on your device.
>
> **Block on a schedule**
> • Recurring schedules: "social media, weekdays 9–5" or "streaming, every night 10pm–7am"
> • Reusable site lists, plus bundled lists for social media, news, streaming and adult content
> • Block everything except an allowlist ("deep work" blackout)
> • Advanced: block just a path (youtube.com/shorts, linkedin.com/feed) or any URL containing a keyword
>
> **Focus now**
> • Start an instant focus session from the toolbar, or run Pomodoro cycles. Sites unblock during breaks
> • The countdown shows on the toolbar icon
>
> **Daily time limits**
> • Give a site 15 minutes a day; once it's used up, it's blocked until midnight
>
> **Friction that helps, not punishes**
> • Ending a block early takes a cooldown, or typing your own commitment phrase, so impulses pass and real decisions don't get stuck
> • Turning off an active schedule or loosening a limit costs the same; tightening is always free
> • Blocks resume if you turn the extension off and on
>
> **Gentle, local insights**
> • See where your time went and what you blocked most, with supportive nudges. All worked out on your device
>
> **Private by design**
> • No network requests, no accounts, no analytics, no host permissions
> • Optional Chrome sync for your settings (never your usage) through your own Google account
> • Import from LeechBlock NG, StayFocusd, Block Site, Cold Turkey or a plain list
>
> Free and unlimited. No premium tier.

**Graphic assets:**
- Icon: `src/public/icons/icon128.png`
- Screenshots (1280×800, upload in this order): `store/screenshots/options-schedules.png`, `store/screenshots/blocked.png`, `store/screenshots/options-usage.png`, `store/screenshots/blocked-passphrase.png`, `store/screenshots/options-lists.png`
- Small promo tile (440×280): `store/promo-small-440x280.png`
- Marquee (1400×560): `store/promo-marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Block distracting websites on schedules, focus sessions and daily time limits that the user sets.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `declarativeNetRequest` | Blocks the top-level page requests for sites the user has chosen to block, before they load. Uses `block` rules only. |
| `webNavigation` | Detects navigation to a blocked address (including single-page-app route changes and blocked-request errors) so the extension can show its block page in that tab. |
| `tabs` | Reads tab URLs to apply a new block to tabs that are already open, to show the block page in a tab, and to show the current site in the popup. |
| `storage` | Saves the user's schedules, lists, settings and local usage statistics on the device (and optionally in Chrome sync). |
| `alarms` | Starts and ends blocks at schedule boundaries and ticks time-limit tracking once a minute. |
| `idle` | Pauses local time-on-site tracking while the user is away, so daily time limits only count active use. |

**Host permissions:** none. **Remote code:** No, the extension uses no remote code.

**Data usage disclosures:**
- Web history / website content: the extension reads URLs **locally** to decide whether to block them and, if time tracking is on, records time per hostname **on the device only**. Nothing is transmitted. Tick "Web history" and "User activity" only if the dashboard requires disclosure of locally processed data; state "processed locally, never transmitted".
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** publish `docs/privacy-policy.md` (e.g. GitHub Pages) and paste the URL.

## Distribution

Public, all regions, free.

## Submission checklist

- [ ] `pnpm test && pnpm lint && pnpm test:e2e` green
- [ ] Version bumped, `pnpm zip`
- [ ] Privacy policy URL live
- [ ] Listing copy, assets and privacy answers entered as above
- [ ] Manual QA in a clean Chrome profile (see `docs/backlog.md`)
