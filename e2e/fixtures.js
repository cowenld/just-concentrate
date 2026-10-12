import { test as base, chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EXTENSION_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.output', 'chrome-mv3');

// A local web server standing in for real sites. *.test hostnames resolve to
// it via --host-resolver-rules, so DNR domain rules see real hostnames.
// Every request is logged, so tests can prove a blocked page never loaded.
function startServer() {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(`${req.headers.host.split(':')[0]}${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>${req.headers.host}${req.url}</title>
      <h1 id="page">${req.headers.host}${req.url}</h1>
      <button id="spa-feed" onclick="history.pushState({}, '', '/feed')">feed</button>`);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port })));
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  site: [async ({}, use) => {
    const s = await startServer();
    await use({ requests: s.requests, url: (host, p = '/') => `http://${host}:${s.port}${p}` });
    s.server.close();
  }, { scope: 'worker' }],

  // eslint-disable-next-line no-empty-pattern
  extContext: [async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--host-resolver-rules=MAP *.test 127.0.0.1'
      ]
    });
    await use(context);
    await context.close();
  }, { scope: 'worker' }],

  worker: [async ({ extContext: context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  }, { scope: 'worker' }],

  // Test-scoped alias so specs can use the familiar `context` name.
  context: async ({ extContext }, use) => { await use(extContext); },

  extensionId: [async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  }, { scope: 'worker' }],

  // Replace the extension's config and wait for the background to apply it.
  configure: async ({ worker }, use) => {
    await use(async (patch, usage) => {
      const updatedAt = await worker.evaluate(async ({ patch, usage }) => {
        const { justConcentrate: current } = await chrome.storage.local.get('justConcentrate');
        const base = {
          schemaVersion: 2, schedules: [], lists: [], allowlist: [], budgets: [], focusSession: null, suspensions: {},
          settings: { ...(current && current.settings), frictionLevel: 'none', onboardingComplete: true, trackTime: false }
        };
        const next = { ...base, ...patch, settings: { ...base.settings, ...(patch.settings || {}) }, updatedAt: Date.now() };
        await chrome.storage.local.set({ justConcentrateUsage: usage || { blockCounts: {}, escapeCounts: {}, siteTime: {} } });
        await chrome.storage.local.remove('_blockState');
        await chrome.storage.local.set({ justConcentrate: next });
        return next.updatedAt;
      }, { patch, usage });
      await expect.poll(() => worker.evaluate(async () => {
        const { _blockState } = await chrome.storage.local.get('_blockState');
        return _blockState && _blockState.dataUpdatedAt;
      })).toBe(updatedAt);
    });
  },

  blockedUrlPrefix: async ({ extensionId }, use) => {
    await use(`chrome-extension://${extensionId}/blocked.html`);
  }
});

export const allDay = (overrides = {}) => ({
  id: 'all-day', name: 'All day', enabled: true, days: [], startTime: '00:00', endTime: '23:59',
  blackout: false, action: 'block', adHocSites: [], listIds: [], ...overrides
});

export { expect };
