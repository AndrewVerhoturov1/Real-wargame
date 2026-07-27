import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'combat-lab-baseline.spec.ts',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
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
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-gl=swiftshader',
        '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
