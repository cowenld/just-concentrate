import { defineConfig } from 'vitest/config';

// Unit tests only; e2e/ runs under Playwright (pnpm test:e2e).
export default defineConfig({
  test: { include: ['src/**/*.test.js'] }
});
