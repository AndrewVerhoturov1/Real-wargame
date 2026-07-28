import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'combat-lab-accuracy-visual.spec.ts',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report/combat-lab-accuracy-visual', open: 'never' }],
  ],
  outputDir: '../test-results/combat-lab-accuracy-visual',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/combat-lab.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
