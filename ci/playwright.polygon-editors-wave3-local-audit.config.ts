import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'polygon-editors-wave3-local-audit.spec.ts',
    'polygon-editors-wave3-perception-diagnostic.spec.ts',
  ],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results/polygon-editors-wave3-local-audit',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: { args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
