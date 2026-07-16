import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

async function saveScreenshot(page: Page, name: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
  } finally {
    await session.detach();
  }
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// Approval-gated by docs/workflow/VISUAL_QA_APPROVAL_POLICY.md.
// Remove test.skip only after the user explicitly authorizes visual QA.
test.skip('forest presentation remains opaque and sparse/dense cells remain distinguishable', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      pageErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/?visualQa=shared-visibility-vegetation');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await page.waitForTimeout(750);

  await saveScreenshot(page, 'shared-visibility-vegetation-forest-opacity.png');
  expect(pageErrors, `Browser errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
