const { defineConfig, devices } = require('@playwright/test');

require('dotenv').config({ path: '.env.local' });

const baseURL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 120 * 1000,
  expect: { timeout: 20 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180 * 1000,
  },
});
