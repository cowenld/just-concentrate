import { test, expect, allDay } from './fixtures.js';
import { mkdirSync } from 'node:fs';

// Renders every extension surface with realistic data, fails on console
// errors, and saves 1280x800 screenshots. SCREENSHOT_DIR=store/screenshots
// (pnpm store:assets) produces the Chrome Web Store listing images.
const SHOTS = process.env.SCREENSHOT_DIR || '.context/screenshots';
mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: 'serial' });

function watchErrors(page) {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

const seed = () => ({
  schedules: [
    allDay({ id: 's1', name: 'Work focus', days: [0, 1, 2, 3, 4, 5, 6], adHocSites: ['reddit.test', 'linkedin.com/feed', 'keyword:poker'], listIds: ['l1'] }),
    { id: 's2', name: 'Bedtime', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], startTime: '22:00', endTime: '07:00', blackout: false, action: 'block', adHocSites: [], listIds: ['l2'] },
    { id: 's3', name: 'Deep work', enabled: false, days: [], startTime: '00:00', endTime: '23:59', blackout: true, action: 'block', adHocSites: [], listIds: [] }
  ],
  lists: [
    { id: 'l1', name: 'Social media', origin: 'frozen', sites: ['twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com'] },
    { id: 'l2', name: 'Streaming', origin: 'frozen', sites: ['netflix.com', 'youtube.com', 'twitch.tv'] }
  ],
  allowlist: ['mail.google.com', 'calendar.google.com'],
  budgets: [{ id: 'b1', domain: 'news.ycombinator.com', minutes: 20, enabled: true }],
  settings: { frictionLevel: 'passphrase', passphrase: 'I am writing my book this year', cooldownSeconds: 30, trackTime: true }
});

function usageFor(today) {
  return {
    blockCounts: { [`reddit.test|${today}`]: 6, [`twitter.com|${today}`]: 4, [`youtube.com|${today}`]: 2 },
    escapeCounts: {},
    siteTime: {
      [`news.ycombinator.com|${today}`]: 12 * 60, [`github.com|${today}`]: 95 * 60,
      [`docs.google.com|${today}`]: 64 * 60, [`youtube.com|${today}`]: 3.5 * 3600
    }
  };
}

test('options page renders every tab without errors', async ({ context, configure, extensionId, worker }) => {
  const today = await worker.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await configure(seed(), usageFor(today));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = watchErrors(page);
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByText('Work focus')).toBeVisible();
  await expect(page.getByText('BLOCKING NOW').first()).toBeVisible();
  await expect(page.getByText('Daily time limits')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/options-schedules.png` });
  for (const [tab, check, file] of [
    ['ALLOWED SITES', 'mail.google.com', 'options-allowed'],
    ['USAGE', 'Where your time went', 'options-usage'],
    ['SITE LISTS', 'Social media', 'options-lists'],
    ['SETTINGS', 'Commitment phrase', 'options-settings']
  ]) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByText(check).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${file}.png` });
  }
  expect(errors).toEqual([]);
  await page.close();
});

test('turning off an active schedule goes through friction', async ({ context, configure, extensionId }) => {
  await configure(seed());
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('.toggle').first().click();
  await expect(page.getByText('Type your commitment phrase')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/options-friction.png` });
  await page.getByText('Keep me focused').click();
  await page.close();
});

test('popup renders with a running Pomodoro', async ({ context, configure, extensionId }) => {
  const now = Date.now() - 7 * 60000;
  await configure({ ...seed(), focusSession: { startTime: now, endTime: now + 115 * 60000, blackout: false, domains: ['twitter.com'], pomodoro: { workMinutes: 25, breakMinutes: 5, cycles: 4 } } });
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 420 });
  const errors = watchErrors(page);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByText('FOCUS · 1/4')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/popup.png` });
  expect(errors).toEqual([]);
  await page.close();
});

test('block page and passphrase challenge render', async ({ context, configure, site }) => {
  await configure(seed());
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = watchErrors(page);
  await page.goto(site.url('reddit.test', '/r/all')).catch(() => {});
  await expect(page.getByText('Work focus')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/blocked.png` });
  await page.getByRole('button', { name: /End block early/ }).click();
  await expect(page.getByText('Type your commitment phrase')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/blocked-passphrase.png` });
  expect(errors).toEqual([]);
  await page.close();
});

test('custom block page message and CSS apply', async ({ context, configure, site }) => {
  await configure({ ...seed(), settings: { frictionLevel: 'none', blockPageMessage: 'Finish the chapter first.', blockPageCss: '#jc-blocked-card { border-color: rgb(255, 0, 0); }' } });
  const page = await context.newPage();
  await page.goto(site.url('reddit.test')).catch(() => {});
  await expect(page.getByText('Finish the chapter first.')).toBeVisible();
  await expect(page.locator('#jc-blocked-card')).toHaveCSS('border-top-color', 'rgb(255, 0, 0)');
  await page.close();
});

test('onboarding renders', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = watchErrors(page);
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.getByText('Work Focus')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/onboarding.png` });
  expect(errors).toEqual([]);
  await page.close();
});

test('deleting an active schedule still asks for confirmation with friction off', async ({ context, configure, extensionId }) => {
  await configure({ ...seed(), settings: { frictionLevel: 'none' } });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByTitle('Delete').first().click();
  await expect(page.getByText('This permanently deletes it.')).toBeVisible();
  await page.getByText('Cancel').click();
  await expect(page.getByText('Work focus')).toBeVisible();
  await page.close();
});
