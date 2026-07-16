import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join('artifacts', 'visual-qa', 'environment-materials-v1');

// Approval-gated by docs/workflow/VISUAL_QA_APPROVAL_POLICY.md.
// Keep this suite skipped until the user explicitly authorizes visual QA.
test.describe('environment material profiles visual QA — explicit approval required', () => {
  test.skip('shows continuous sparse/dense forest across zoom and danger-overlay states', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    await openMap(page);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounds unavailable.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-forest-zoom-1-danger-off.png'), fullPage: false });
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-forest-zoom-0-7-danger-off.png'), fullPage: false });
    await page.mouse.wheel(0, -1050);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-forest-zoom-1-3-danger-off.png'), fullPage: false });

    await page.locator('[data-tab="danger"]').click();
    await expect(page.locator('[data-role="sidebar-title"]')).toContainText(/Опасность|Danger/);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-forest-zoom-1-3-danger-on.png'), fullPage: false });

  });

  test.skip('live profile edit refreshes the open map without a page reload', async ({ context }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const mapPage = await context.newPage();
    await openMap(mapPage);
    const editorPage = await context.newPage();
    await editorPage.goto('/ai-node-editor.html');
    await editorPage.locator('[data-navigation-tab="environmentProfiles"]').click();
    await expect(editorPage.getByRole('heading', { name: 'Профили местности' })).toBeVisible();
    await editorPage.locator('[data-environment-material="sparse_forest"]').click();

    const coverage = editorPage.locator('input[type="number"][data-environment-path="presentation.coverage"]');
    const opacity = editorPage.locator('input[type="number"][data-environment-path="presentation.opacity"]');
    await coverage.fill('0.88');
    await coverage.dispatchEvent('input');
    await opacity.fill('0.96');
    await opacity.dispatchEvent('input');
    await editorPage.waitForTimeout(250);

    await mapPage.bringToFront();
    await mapPage.waitForTimeout(350);
    await mapPage.screenshot({ path: path.join(OUTPUT_DIR, '05-live-coverage-opacity-edit.png'), fullPage: false });

    await editorPage.bringToFront();
    await editorPage.screenshot({ path: path.join(OUTPUT_DIR, '06-environment-profile-editor.png'), fullPage: true });
  });
});

async function openMap(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/?visualQa=shared-visibility-vegetation');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await page.waitForTimeout(750);
}
