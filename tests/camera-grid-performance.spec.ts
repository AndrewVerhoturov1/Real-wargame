import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };

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

test('camera supports WASD/arrows and input bursts do not rebuild expensive grid overlays', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const debugWindow = window as Window & {
      __realWargameCameraDebug?: CameraDiagnostics;
      __realWargameOverlayDebug?: OverlayDiagnostics;
    };
    return Boolean(debugWindow.__realWargameCameraDebug && debugWindow.__realWargameOverlayDebug);
  });

  const initialCamera = await readCameraDiagnostics(page);
  expect(initialCamera).toBeDefined();

  await page.keyboard.down('d');
  await page.waitForTimeout(240);
  await page.keyboard.up('d');
  const afterD = await readCameraDiagnostics(page);
  expect((afterD?.x ?? 0) - (initialCamera?.x ?? 0)).toBeGreaterThan(20);
  expect((afterD?.keyboardPanFrameCount ?? 0) - (initialCamera?.keyboardPanFrameCount ?? 0)).toBeGreaterThan(1);

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(220);
  await page.keyboard.up('ArrowUp');
  const afterArrow = await readCameraDiagnostics(page);
  expect((afterD?.y ?? 0) - (afterArrow?.y ?? 0)).toBeGreaterThan(15);

  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(60);
  const beforePointerBurst = await readOverlayDiagnostics(page);
  expect(beforePointerBurst).toBeDefined();

  await page.mouse.move(center.x + 8, center.y + 8, { steps: 80 });
  await page.waitForTimeout(120);
  const afterPointerBurst = await readOverlayDiagnostics(page);
  expect((afterPointerBurst?.knowledgeRebuildCount ?? 0) - (beforePointerBurst?.knowledgeRebuildCount ?? 0)).toBe(0);
  expect(afterPointerBurst?.interactionObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2);
  expect((afterPointerBurst?.interactionUpdateCount ?? 0) - (beforePointerBurst?.interactionUpdateCount ?? 0)).toBeLessThan(20);

  const beforeWheelBurst = await readCameraDiagnostics(page);
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
  expect((afterWheelBurst?.wheelEventCount ?? 0) - (beforeWheelBurst?.wheelEventCount ?? 0)).toBe(30);
  expect((afterWheelBurst?.wheelApplyCount ?? 0) - (beforeWheelBurst?.wheelApplyCount ?? 0)).toBeLessThanOrEqual(2);
  expect(afterWheelBurst?.zoom).not.toBe(beforeWheelBurst?.zoom);

  await saveScreenshot(page, '12-camera-keyboard-grid-performance.png');
});
