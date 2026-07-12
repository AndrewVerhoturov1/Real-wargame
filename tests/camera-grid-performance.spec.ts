import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface CameraDiagnostics {
  x: number;
  y: number;
  zoom: number;
  wheelEventCount: number;
  wheelApplyCount: number;
  keyboardPanFrameCount: number;
}

interface OverlayDiagnostics {
  knowledgeRebuildCount: number;
  probeRebuildCount: number;
  interactionUpdateCount: number;
  interactionObjectCount: number;
  fullMapFingerprintScanCount: number;
}

interface UnitRendererDiagnostics {
  viewCount: number;
  creationCount: number;
  removalCount: number;
  updateCount: number;
  geometryRebuildCount: number;
}

interface CoverCacheDiagnostics {
  buildCount: number;
  hitCount: number;
  coverCount: number;
}

interface MapQualityDiagnostics {
  cacheAsBitmap: boolean;
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

async function readCameraDiagnostics(page: Page): Promise<CameraDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameCameraDebug?: CameraDiagnostics }
  ).__realWargameCameraDebug);
}

async function readOverlayDiagnostics(page: Page): Promise<OverlayDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameOverlayDebug?: OverlayDiagnostics }
  ).__realWargameOverlayDebug);
}

async function readUnitRendererDiagnostics(page: Page): Promise<UnitRendererDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameUnitRendererDebug?: UnitRendererDiagnostics }
  ).__realWargameUnitRendererDebug);
}

async function readCoverCacheDiagnostics(page: Page): Promise<CoverCacheDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameCoverCacheDebug?: CoverCacheDiagnostics }
  ).__realWargameCoverCacheDebug);
}

async function readMapQualityDiagnostics(page: Page): Promise<MapQualityDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameMapQualityDebug?: MapQualityDiagnostics }
  ).__realWargameMapQualityDebug);
}

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

async function canvasCenter(canvas: Locator): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5,
  };
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

test('camera supports WASD/arrows and input bursts do not rebuild expensive grid overlays', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const debugWindow = window as Window & {
      __realWargameCameraDebug?: CameraDiagnostics;
      __realWargameOverlayDebug?: OverlayDiagnostics;
      __realWargameUnitRendererDebug?: UnitRendererDiagnostics;
    };
    return Boolean(
      debugWindow.__realWargameCameraDebug
      && debugWindow.__realWargameOverlayDebug
      && debugWindow.__realWargameUnitRendererDebug,
    );
  });

  const initialCamera = await readCameraDiagnostics(page);
  const initialUnits = await readUnitRendererDiagnostics(page);
  expect(initialCamera).toBeDefined();
  expect(initialUnits?.viewCount ?? 0).toBeGreaterThan(0);

  await page.keyboard.down('d');
  await expect.poll(async () => {
    const current = await readCameraDiagnostics(page);
    return (current?.x ?? 0) - (initialCamera?.x ?? 0);
  }, { timeout: 2000 }).toBeGreaterThan(20);
  await page.keyboard.up('d');
  const afterD = await readCameraDiagnostics(page);
  expect((afterD?.keyboardPanFrameCount ?? 0) - (initialCamera?.keyboardPanFrameCount ?? 0)).toBeGreaterThan(1);

  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => {
    const current = await readCameraDiagnostics(page);
    return (afterD?.y ?? 0) - (current?.y ?? 0);
  }, { timeout: 2000 }).toBeGreaterThan(15);
  await page.keyboard.up('ArrowUp');

  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(60);
  const beforePointerBurst = await readOverlayDiagnostics(page);
  const beforePointerUnits = await readUnitRendererDiagnostics(page);
  expect(beforePointerBurst).toBeDefined();

  await page.mouse.move(center.x + 8, center.y + 8, { steps: 80 });
  await page.waitForTimeout(120);
  const afterPointerBurst = await readOverlayDiagnostics(page);
  const afterPointerUnits = await readUnitRendererDiagnostics(page);
  expect((afterPointerBurst?.knowledgeRebuildCount ?? 0) - (beforePointerBurst?.knowledgeRebuildCount ?? 0)).toBe(0);
  expect(afterPointerBurst?.interactionObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2);
  expect((afterPointerBurst?.interactionUpdateCount ?? 0) - (beforePointerBurst?.interactionUpdateCount ?? 0)).toBeLessThan(20);
  expect(afterPointerBurst?.fullMapFingerprintScanCount).toBe(0);
  expect(afterPointerUnits?.creationCount).toBe(beforePointerUnits?.creationCount);
  expect(afterPointerUnits?.removalCount).toBe(beforePointerUnits?.removalCount);

  const beforeWheelBurst = await readCameraDiagnostics(page);
  const beforeWheelUnits = await readUnitRendererDiagnostics(page);
  await canvas.evaluate((element, point) => {
    for (let index = 0; index < 30; index += 1) {
      element.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        deltaY: -3,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      }));
    }
  }, center);
  await page.waitForTimeout(100);
  const afterWheelBurst = await readCameraDiagnostics(page);
  const afterWheelUnits = await readUnitRendererDiagnostics(page);
  expect((afterWheelBurst?.wheelEventCount ?? 0) - (beforeWheelBurst?.wheelEventCount ?? 0)).toBe(30);
  expect((afterWheelBurst?.wheelApplyCount ?? 0) - (beforeWheelBurst?.wheelApplyCount ?? 0)).toBeLessThanOrEqual(2);
  expect(afterWheelBurst?.zoom).not.toBe(beforeWheelBurst?.zoom);
  expect(afterWheelUnits?.creationCount).toBe(beforeWheelUnits?.creationCount);
  expect(afterWheelUnits?.removalCount).toBe(beforeWheelUnits?.removalCount);

  await saveScreenshot(page, '12-camera-keyboard-grid-performance.png');
});

test('danger-layer pointer movement reuses cover analysis and map stays at native quality', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
  await page.locator('[data-tab="danger"]').click();
  await page.waitForFunction(() => Boolean(
    (window as Window & { __realWargameCoverCacheDebug?: CoverCacheDiagnostics }).__realWargameCoverCacheDebug,
  ));

  const quality = await readMapQualityDiagnostics(page);
  expect(quality?.cacheAsBitmap).toBe(false);
  const before = await readCoverCacheDiagnostics(page);
  expect(before).toBeDefined();

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  await page.mouse.move(box.x + 250, box.y + 250);
  await page.mouse.move(box.x + 850, box.y + 520, { steps: 80 });
  await page.waitForTimeout(250);

  const after = await readCoverCacheDiagnostics(page);
  expect((after?.buildCount ?? 0) - (before?.buildCount ?? 0)).toBeLessThanOrEqual(1);
  expect(after?.hitCount ?? 0).toBeGreaterThan(before?.hitCount ?? 0);

  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(200);
  const qualityAfterZoom = await readMapQualityDiagnostics(page);
  expect(qualityAfterZoom?.cacheAsBitmap).toBe(false);
  await saveScreenshot(page, '13-native-map-quality-danger.png');
});
