# Just Concentrate — Privacy Policy

**Effective:** 12 October 2026

Just Concentrate is a website blocker that runs entirely in your browser. It has no servers, no accounts and no analytics.

## What we collect

Nothing. Just Concentrate makes **no network requests**. The developer never receives any data from the extension: not your browsing, your settings, your usage, or any identifier.

## What is stored on your device

Everything the extension needs is kept in your browser's extension storage (`chrome.storage.local`) on your device:

- **Your configuration:** schedules, site lists, allowed sites, daily time limits, and settings (including your commitment phrase, if you set one).
- **Usage statistics:** how many times sites were blocked and how often you ended a block early, and, if time tracking is on, how much time you spent on each website (by hostname, per day). Usage statistics are deleted automatically after 30 days. You can turn time tracking off and clear all usage data in Settings.

Uninstalling the extension deletes all of this.

## Chrome sync (optional, off by default)

If you turn on **Chrome sync** in Settings, your configuration (not your usage statistics) is stored in `chrome.storage.sync` so it's available in your other Chrome profiles. That data is synced by Google as part of your Chrome profile, under Google's privacy policy. The developer has no access to it.

## Permissions

- `declarativeNetRequest`: block the sites you choose before they load.
- `webNavigation`, `tabs`: notice when a tab navigates to a blocked address and show the block page; read the active tab's address for time tracking and the toolbar popup.
- `storage`: save your configuration and usage on your device.
- `alarms`: start and end blocks on schedule.
- `idle`: pause time tracking while you're away from your computer.

The extension requests no host permissions and cannot read or change the content of web pages.

## Data sharing and sale

There is no data to share or sell. Just Concentrate does not sell, transfer, or use data for advertising, credit-worthiness, or any purpose unrelated to blocking distracting websites.

## Changes

Any change to this policy will be published here with a new effective date.

## Contact

Questions: open an issue on the project's GitHub repository.
