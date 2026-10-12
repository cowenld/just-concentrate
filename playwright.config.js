import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (.output/chrome-mv3) into
// Chromium. Run `pnpm build` first (`pnpm test:e2e` does both).
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list'
});
