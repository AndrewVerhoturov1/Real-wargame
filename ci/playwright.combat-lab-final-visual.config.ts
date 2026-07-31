import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'combat-lab-final-visual.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  outputDir: '../test-results/vercel-e2e',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'on',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
