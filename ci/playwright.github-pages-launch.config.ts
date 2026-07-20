import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'github-pages-launch.spec.ts',
  timeout: 150_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report/github-pages-e2e', open: 'never' }],
  ],
  outputDir: '../test-results/github-pages-e2e',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
