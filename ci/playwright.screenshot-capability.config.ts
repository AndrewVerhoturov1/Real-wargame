import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshot-capability.spec.ts',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report/screenshot-capability', open: 'never' }],
  ],
  outputDir: '../test-results/screenshot-capability',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
