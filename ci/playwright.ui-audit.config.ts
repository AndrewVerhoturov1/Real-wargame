import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'ui-audit.spec.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report-ui-audit', open: 'never' }],
  ],
  outputDir: '../test-results/vercel-ui-audit',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});