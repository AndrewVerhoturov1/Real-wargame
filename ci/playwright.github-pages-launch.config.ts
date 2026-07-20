import { defineConfig, devices } from '@playwright/test';

const sharedUse = {
  trace: 'on' as const,
  screenshot: 'only-on-failure' as const,
  video: 'retain-on-failure' as const,
  launchOptions: {
    args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  },
};

export default defineConfig({
  testDir: '.',
  testMatch: ['github-pages-launch.spec.ts', 'github-pages-mobile-map.spec.ts'],
  timeout: 150_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report/github-pages-e2e', open: 'never' }],
  ],
  outputDir: '../test-results/github-pages-e2e',
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        browserName: 'chromium',
        ...sharedUse,
      },
    },
    {
      name: 'android-chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        ...sharedUse,
      },
    },
  ],
});
