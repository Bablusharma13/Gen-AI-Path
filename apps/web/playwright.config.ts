import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against a running stack (API + web + seeded MongoDB):
 *   pnpm seed && pnpm build && (start API and web) && pnpm --filter @genpath/web e2e
 * Uses the locally installed Chrome (`channel: 'chrome'`), so no browser download is needed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  // On CI, `github` turns failures into annotations on the pull request (readable without
  // downloading logs).
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  outputDir: '../../test-results/e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
