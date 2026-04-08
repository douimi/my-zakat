import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test configuration for MyZakat.
 *
 * Prerequisites:
 *   docker-compose up -d   (backend + frontend + DB)
 *
 * Run:
 *   npx playwright test                    # headless
 *   npx playwright test --headed           # see the browser
 *   npx playwright test --ui               # interactive UI mode
 *   npx playwright show-report             # view HTML report
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Payment tests must run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker — Stripe sessions shouldn't overlap
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60_000, // 60s per test — Stripe redirects can be slow

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the Docker stack before tests if not already running */
  // Uncomment if you want Playwright to auto-start the stack:
  // webServer: {
  //   command: 'docker-compose up -d && sleep 10',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },
})
