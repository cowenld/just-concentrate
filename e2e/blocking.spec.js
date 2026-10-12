import { test, expect, allDay } from './fixtures.js';

test.describe.configure({ mode: 'serial' });

test('blocks a scheduled domain at the network layer and shows the block page', async ({ context, site, configure, blockedUrlPrefix, worker }) => {
  await configure({ schedules: [allDay({ name: 'Work', adHocSites: ['reddit.test'] })] });
  const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  expect(rules).toHaveLength(1);
  expect(rules[0].action.type).toBe('block');

  const page = await context.newPage();
  const target = site.url('www.reddit.test', '/r/all');
  await page.goto(target).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  expect(new URL(page.url()).searchParams.get('url')).toBe(target);
  await expect(page.getByText('reddit.test')).toBeVisible();
  await expect(page.getByText('Work', { exact: true })).toBeVisible();
  // Never reached the server: the request was blocked before it left the browser.
  expect(site.requests.filter(r => r.includes('reddit.test'))).toEqual([]);
  await page.close();
});

test('leaves unblocked and allowlisted sites alone', async ({ context, site, configure }) => {
  await configure({ schedules: [allDay({ adHocSites: ['google.test'] })], allowlist: ['mail.google.test'] });
  const page = await context.newPage();
  await page.goto(site.url('mail.google.test'));
  await expect(page.locator('#page')).toHaveText(/mail\.google\.test/);
  await page.goto(site.url('example.test'));
  await expect(page.locator('#page')).toHaveText(/example\.test/);
  await page.close();
});

test('path entries block only that path, including single-page-app route changes', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [allDay({ adHocSites: ['social.test/feed'] })] });
  const page = await context.newPage();
  await page.goto(site.url('social.test', '/messages'));
  await expect(page.locator('#page')).toHaveText(/messages/);

  await page.click('#spa-feed'); // history.pushState to /feed, no network request
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));

  await page.goto(site.url('social.test', '/feed/123')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await page.close();
});

test('keyword entries block any URL containing the word', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [allDay({ adHocSites: ['keyword:poker'] })] });
  const page = await context.newPage();
  await page.goto(site.url('search.test', '/?q=online+Poker')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await page.goto(site.url('search.test', '/?q=chess'));
  await expect(page.locator('#page')).toHaveText(/chess/);
  await page.close();
});

test('blackout blocks everything except the allowlist', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [allDay({ name: 'Deep work', blackout: true })], allowlist: ['docs.test'] });
  const page = await context.newPage();
  await page.goto(site.url('anything.test')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await page.goto(site.url('docs.test'));
  await expect(page.locator('#page')).toHaveText(/docs\.test/);
  await page.close();
});

test('redirect schedules send you to the chosen URL', async ({ context, site, configure }) => {
  await configure({ schedules: [allDay({ adHocSites: ['video.test'], action: 'redirect', redirectUrl: site.url('focus.test', '/welcome') })] });
  const page = await context.newPage();
  await page.goto(site.url('video.test')).catch(() => {});
  await expect(page.locator('#page')).toHaveText(/focus\.test:\d+\/welcome/);
  await page.close();
});

test('already-open tabs are cut over when a block starts', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [] });
  const page = await context.newPage();
  await page.goto(site.url('open.test'));
  await expect(page.locator('#page')).toHaveText(/open\.test/);
  await configure({ schedules: [allDay({ adHocSites: ['open.test'] })] });
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await page.close();
});

test('ending a block early suspends the schedule and lets you continue', async ({ context, site, configure, worker }) => {
  await configure({ schedules: [allDay({ id: 'wk', name: 'Work', adHocSites: ['reddit.test'] })] });
  const page = await context.newPage();
  const target = site.url('reddit.test', '/');
  await page.goto(target).catch(() => {});
  await page.getByRole('button', { name: /End block early/ }).click();
  await page.getByRole('button', { name: 'End block' }).click(); // friction: none
  await expect(page.getByText('Block ended')).toBeVisible();
  const data = await worker.evaluate(async () => (await chrome.storage.local.get('justConcentrate')).justConcentrate);
  expect(data.suspensions['schedule:wk']).toBeGreaterThan(Date.now());
  expect(data.schedules[0].enabled).toBe(true); // resumes on its own next window
  await page.getByRole('button', { name: /Continue to/ }).click();
  await expect(page.locator('#page')).toHaveText(/reddit\.test/);
  await page.close();
});

test('the wait friction level enforces the cooldown', async ({ context, site, configure }) => {
  await configure({ schedules: [allDay({ adHocSites: ['reddit.test'] })], settings: { frictionLevel: 'wait', cooldownSeconds: 5 } });
  const page = await context.newPage();
  await page.goto(site.url('reddit.test')).catch(() => {});
  await page.getByRole('button', { name: /End block early/ }).click();
  const confirm = page.getByRole('button', { name: /End block/ });
  await expect(confirm).toBeDisabled();
  await expect(confirm).toBeEnabled({ timeout: 8000 });
  await page.close();
});

test('a used-up daily time limit blocks the site until midnight', async ({ context, site, configure, blockedUrlPrefix, worker }) => {
  const today = await worker.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await configure(
    { budgets: [{ id: 'b1', domain: 'reddit.test', minutes: 15, enabled: true }] },
    { blockCounts: {}, escapeCounts: {}, siteTime: { [`reddit.test|${today}`]: 15 * 60 } }
  );
  const page = await context.newPage();
  await page.goto(site.url('reddit.test')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await expect(page.getByText('Daily limit · 15 min')).toBeVisible();
  await page.close();
});

test('focus sessions block their sites, and Pomodoro breaks lift them', async ({ context, site, configure, blockedUrlPrefix }) => {
  const now = Date.now();
  await configure({ focusSession: { startTime: now, endTime: now + 25 * 60000, blackout: false, domains: ['focus-me.test'] } });
  const page = await context.newPage();
  await page.goto(site.url('focus-me.test')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));

  // Started 26 minutes ago with 25/5: we're in the first break.
  const start = Date.now() - 26 * 60000;
  await configure({ focusSession: { startTime: start, endTime: start + 55 * 60000, blackout: false, domains: ['focus-me.test'], pomodoro: { workMinutes: 25, breakMinutes: 5, cycles: 2 } } });
  await page.goto(site.url('focus-me.test'));
  await expect(page.locator('#page')).toHaveText(/focus-me\.test/);
  await page.close();
});

test('blocking survives the service worker being stopped', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [allDay({ adHocSites: ['reddit.test'] })] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await page.goto(site.url('reddit.test', '/after-restart')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  expect(site.requests.filter(r => r.includes('/after-restart'))).toEqual([]);
  await page.close();
});

test('an invalid stored entry does not stop other sites being blocked', async ({ context, site, configure, blockedUrlPrefix }) => {
  await configure({ schedules: [allDay({ adHocSites: ['keyword:café', 'keyword:', 'reddit.test'] })] });
  const page = await context.newPage();
  await page.goto(site.url('reddit.test')).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^${blockedUrlPrefix}`));
  await page.close();
});
