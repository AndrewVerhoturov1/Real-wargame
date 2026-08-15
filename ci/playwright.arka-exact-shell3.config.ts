import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'arka-exact-shell3.spec.ts',
  timeout: 90000,
  expect: { timeout: 20000 },
  outputDir: '../test-results/vercel-e2e',
  reporter: [['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name:'chromium', use:{ browserName:'chromium' } }],
});
