import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join('artifacts', 'visual-qa', 'environment-materials-v1');
const ZOOM_SENSITIVITY = 0.00042;
const MAX_WHEEL_DELTA_PER_FRAME = 360;

type VisualQaWindow = Window & {
  __realWargameCameraDebug?: { zoom: number };
  __realWargameAwarenessDebug?: {
    representation?: string;
    visible?: boolean;
    displayObjectCount?: number;
  };
};

// Approval-gated by docs/workflow/VISUAL_QA_APPROVAL_POLICY.md.
// Keep this suite skipped until the user explicitly authorizes visual QA.
test.describe('environment material profiles visual QA — explicit approval required', () => {
  test.skip('shows continuous sparse/dense forest across zoom and danger-overlay states', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    await openMap(page);

    const canvas = page.locator('canvas');
    await selectFixtureSoldier(page);

    await setZoom(page, 1);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-forest-zoom-1-danger-off.png'), fullPage: false });

    await setZoom(page, 0.7);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-forest-zoom-0-7-danger-off.png'), fullPage: false });

    await setZoom(page, 1.3);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-forest-zoom-1-3-danger-off.png'), fullPage: false });
    const dangerOffCanvas = await canvas.screenshot();

    await page.locator('[data-tab="danger"]').click();
    await expect(page.locator('[data-role="sidebar-title"]')).toContainText(/Опасность|Danger/);
    await page.waitForFunction(() => {
      const diagnostics = (window as VisualQaWindow).__realWargameAwarenessDebug;
      return diagnostics?.representation === 'raster-sprite'
        && diagnostics.visible === true
        && (diagnostics.displayObjectCount ?? 0) > 0;
    });
    await page.waitForTimeout(500);
    const dangerOnCanvas = await canvas.screenshot();
    expect(dangerOnCanvas.equals(dangerOffCanvas), 'danger-on must change the map canvas, not only the sidebar tab').toBe(false);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-forest-zoom-1-3-danger-on.png'), fullPage: false });
  });

  test.skip('live profile edit refreshes the open map without a page reload', async ({ context }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const mapPage = await context.newPage();
    await openMap(mapPage);
    const beforeEditCanvas = await mapPage.locator('canvas').screenshot();

    const editorPage = await context.newPage();
    await editorPage.setViewportSize({ width: 1440, height: 900 });
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
    await mapPage.waitForTimeout(500);
    const afterEditCanvas = await mapPage.locator('canvas').screenshot();
    expect(afterEditCanvas.equals(beforeEditCanvas), 'live presentation edits must change the open map canvas').toBe(false);
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

async function selectFixtureSoldier(page: Page): Promise<void> {
  const pause = page.locator('[data-action="pause"]');
  if ((await pause.textContent())?.includes('Пауза')) {
    await pause.click();
    await expect(pause).toContainText('Продолжить');
  }
  await page.waitForTimeout(200);

  const label = page.locator('.unit-label').filter({ hasText: 'Солдат' }).first();
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error('Fixture soldier label bounds unavailable.');

  const selectedName = page.locator('[data-role="unit-name"]');
  const centerX = box.x + box.width / 2;
  const xOffsets = [0, -4, 4, -8, 8, -12, 12, -16, 16];
  const firstY = box.y + box.height + 4;
  const lastY = box.y + box.height + 76;

  for (let y = firstY; y <= lastY; y += 4) {
    for (const xOffset of xOffsets) {
      await page.mouse.click(centerX + xOffset, y);
      await page.waitForTimeout(45);
      if ((await selectedName.textContent())?.includes('Солдат')) return;
    }
  }

  const zoom = await readZoom(page);
  throw new Error(`Could not select paused fixture soldier; label=${JSON.stringify(box)} zoom=${zoom}`);
}

async function setZoom(page: Page, target: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await readZoom(page);
    if (Math.abs(current - target) <= 0.015) break;
    const requiredDelta = -Math.log(target / current) / ZOOM_SENSITIVITY;
    const delta = Math.max(-MAX_WHEEL_DELTA_PER_FRAME, Math.min(MAX_WHEEL_DELTA_PER_FRAME, requiredDelta));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
  }

  const finalZoom = await readZoom(page);
  expect(Math.abs(finalZoom - target), `expected zoom ${target}, received ${finalZoom}`).toBeLessThanOrEqual(0.02);
}

async function readZoom(page: Page): Promise<number> {
  const zoom = await page.evaluate(() => (window as VisualQaWindow).__realWargameCameraDebug?.zoom);
  if (!zoom) throw new Error('Camera diagnostics unavailable.');
  return zoom;
}
