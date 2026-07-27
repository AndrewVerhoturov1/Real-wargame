import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const productSha = process.env.PRODUCT_SHA ?? '';
const evidenceDir = 'artifacts/combat-lab-final';

type Rect = { x: number; y: number; width: number; height: number; right: number; bottom: number } | null;

test('Combat Lab production build passes final 1440x900 UI, geometry and audio QA', async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.removeItem('real-wargame.workspace.sidebar-width.v1');
    localStorage.removeItem('real-wargame.combat-lab.dock-width.v1');
  });
  await page.goto(`${baseUrl}/combat-lab.html`, { waitUntil: 'networkidle' });
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.combat-lab-dock')).toBeVisible();
  await expect(page.locator('.simulation-sidebar')).toBeVisible();
  await expect(page.locator('.simulation-unit-bar')).toBeVisible();
  await expect(page.locator('.workspace-time-controls')).toBeVisible();
  await page.waitForTimeout(1200);

  const initial = await measure(page);
  assertCoreLayout(initial, 'initial');
  expect(initial.viewport).toEqual({ width: 1440, height: 900 });
  expect(initial.bodyScroll.width).toBeLessThanOrEqual(1440);
  expect(initial.headerOverlaps.modeTime).toBe(0);
  expect(initial.headerOverlaps.timeActions).toBe(0);
  expect(initial.timeButtonCount).toBe(7);
  expect(initial.leftDock?.width ?? 0).toBeGreaterThanOrEqual(350);
  expect(initial.leftDock?.width ?? 999).toBeLessThanOrEqual(390);
  expect(initial.rightSidebar?.width ?? 0).toBeGreaterThanOrEqual(350);
  expect(initial.rightSidebar?.width ?? 999).toBeLessThanOrEqual(390);
  expect(intersectionArea(initial.bottomBar, initial.leftDock)).toBe(0);
  expect(intersectionArea(initial.bottomBar, initial.rightSidebar)).toBe(0);
  expect(initial.weaponKind).toBe('rifle');
  expect(initial.weaponName.length).toBeGreaterThan(2);
  expect(initial.weaponAmmo).toContain('Магазин');

  await page.screenshot({ path: `${evidenceDir}/01-both-panels-open-stand.png` });
  await page.locator('#combat-lab-extension-root').screenshot({ path: `${evidenceDir}/02-left-panel-compact.png` });
  await page.locator('.simulation-unit-bar').screenshot({ path: `${evidenceDir}/03-bottom-panel.png` });

  await verifyPanelResizing(page);

  await page.locator('[data-combat-lab-tab="metrics"]').click();
  await expect(page.locator('.combat-lab-metrics-panel')).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/04-metrics.png` });

  await page.locator('[data-combat-lab-tab="log"]').click();
  await expect(page.locator('.combat-lab-log-panel')).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/05-journal.png` });
  await page.locator('[data-combat-lab-tab="stand"]').click();

  const audioBefore = await readAudio(page);
  await page.getByRole('button', { name: 'Открыть огонь' }).click();
  const speedTen = page.locator('.workspace-time-controls .unit-bar-speed-group button', { hasText: '×10' });
  await expect(speedTen).toBeVisible();
  await speedTen.click();
  const pause = page.locator('.workspace-time-controls [data-action="pause"]');
  if ((await pause.textContent())?.includes('Продолжить')) await pause.click();
  await expect.poll(async () => (await readAudio(page)).playedShotCount, { timeout: 20_000 })
    .toBe(audioBefore.playedShotCount + 1);
  if ((await pause.textContent())?.includes('Пауза')) await pause.click();
  await page.waitForTimeout(700);
  const audioAfter = await readAudio(page);
  expect(audioAfter.contextState).toBe('running');
  expect(audioAfter.audioUnlocked).toBe(true);
  expect(audioAfter.bufferReady).toBe(true);
  expect(audioAfter.bufferDurationSeconds).toBeGreaterThan(0.35);
  expect(audioAfter.playedShotCount - audioBefore.playedShotCount).toBe(1);
  expect(audioAfter.lastOutputPeak).toBeGreaterThan(0.01);
  expect(audioAfter.lastError).toBeNull();
  await page.locator('[data-combat-lab-tab="log"]').click();
  await page.screenshot({ path: `${evidenceDir}/10-shot-and-journal.png` });
  await page.locator('[data-combat-lab-tab="stand"]').click();

  const leftToggle = page.locator('.combat-lab-dock-toggle');
  const rightToggle = page.locator('.simulation-sidebar [data-action="collapse"]');
  await expect(leftToggle).toBeVisible();
  await expect(rightToggle).toBeVisible();

  await leftToggle.click();
  await page.waitForTimeout(500);
  const leftHidden = await measure(page);
  assertCoreLayout(leftHidden, 'left hidden');
  expect(leftHidden.worldScaleX).toBeCloseTo(initial.worldScaleX, 6);
  expect(leftHidden.worldScaleY).toBeCloseTo(initial.worldScaleY, 6);
  await page.screenshot({ path: `${evidenceDir}/06-left-hidden.png` });

  await leftToggle.click();
  await page.waitForTimeout(400);
  await rightToggle.click();
  await page.waitForTimeout(500);
  const rightHidden = await measure(page);
  assertCoreLayout(rightHidden, 'right hidden');
  expect(rightHidden.worldScaleX).toBeCloseTo(initial.worldScaleX, 6);
  expect(rightHidden.worldScaleY).toBeCloseTo(initial.worldScaleY, 6);
  await page.screenshot({ path: `${evidenceDir}/07-right-hidden.png` });

  await leftToggle.click();
  await page.waitForTimeout(500);
  const bothHidden = await measure(page);
  assertCoreLayout(bothHidden, 'both hidden');
  expect(bothHidden.worldScaleX).toBeCloseTo(initial.worldScaleX, 6);
  expect(bothHidden.worldScaleY).toBeCloseTo(initial.worldScaleY, 6);
  expect(bothHidden.canvas?.cssWidth ?? 0).toBeGreaterThan(initial.canvas?.cssWidth ?? 0);
  await page.screenshot({ path: `${evidenceDir}/08-both-hidden.png` });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.simulation-unit-bar')).toBeVisible();
  await expect(page.locator('.unit-bar-weapon')).toBeVisible();
  await page.waitForTimeout(900);
  const ordinaryGame = await measure(page);
  expect(ordinaryGame.weaponName.length).toBeGreaterThan(2);
  expect(ordinaryGame.bodyScroll.width).toBeLessThanOrEqual(1440);
  expect(ordinaryGame.headerOverlaps.modeTime).toBe(0);
  expect(ordinaryGame.headerOverlaps.timeActions).toBe(0);
  await page.screenshot({ path: `${evidenceDir}/09-ordinary-game-shared-bottom-panel.png` });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((entry) => !entry.includes('favicon'))).toEqual([]);

  await writeFile(`${evidenceDir}/evidence.json`, JSON.stringify({
    productSha,
    viewport: { width: 1440, height: 900 },
    initial,
    leftHidden,
    rightHidden,
    bothHidden,
    ordinaryGame,
    audioBefore,
    audioAfter,
    pageErrors,
    consoleErrors,
  }, null, 2));
});

async function verifyPanelResizing(page: Page): Promise<void> {
  const left = page.locator('.workspace-resize-handle-left');
  const right = page.locator('.workspace-resize-handle-right');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  const leftBox = await left.boundingBox();
  expect(leftBox).not.toBeNull();
  await page.mouse.move((leftBox?.x ?? 0) + 2, (leftBox?.y ?? 0) + 60);
  await page.mouse.down();
  await page.mouse.move(438, (leftBox?.y ?? 0) + 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await measure(page)).leftDock?.width ?? 0).toBeGreaterThan(420);

  const rightBox = await right.boundingBox();
  expect(rightBox).not.toBeNull();
  await page.mouse.move((rightBox?.x ?? 0) + 2, (rightBox?.y ?? 0) + 60);
  await page.mouse.down();
  await page.mouse.move(1000, (rightBox?.y ?? 0) + 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await measure(page)).rightSidebar?.width ?? 0).toBeGreaterThan(420);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--combat-lab-dock-width', '370px');
    document.documentElement.style.setProperty('--workspace-sidebar', '370px');
    localStorage.setItem('real-wargame.combat-lab.dock-width.v1', '370');
    localStorage.setItem('real-wargame.workspace.sidebar-width.v1', '370');
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(350);
}

function assertCoreLayout(value: Awaited<ReturnType<typeof measure>>, stage: string): void {
  expect(value.canvasCount, `${stage}: only one canvas`).toBe(1);
  expect(value.bodyScroll.width, `${stage}: no horizontal overflow`).toBeLessThanOrEqual(1440);
  expect(value.canvas, `${stage}: canvas exists`).not.toBeNull();
  expect(Math.abs((value.canvas?.pixelRatioX ?? 0) - (value.canvas?.pixelRatioY ?? 0)), `${stage}: equal backing ratios`).toBeLessThan(0.02);
  expect(Math.abs(value.worldScaleX - value.worldScaleY), `${stage}: uniform world scale`).toBeLessThan(0.000001);
  expect(Math.abs(value.pixelsPer100MetresX - value.pixelsPer100MetresY), `${stage}: equal metric scale`).toBeLessThan(0.001);
}

async function readAudio(page: Page) {
  return page.evaluate(() => {
    const api = (window as unknown as {
      __realWargameCombatAudio?: { read(): {
        contextState: string;
        audioUnlocked: boolean;
        bufferReady: boolean;
        bufferDurationSeconds: number;
        pendingShotCount: number;
        playedShotCount: number;
        lastOutputPeak: number;
        lastShotStartedAtMs: number;
        lastError: string | null;
      } };
    }).__realWargameCombatAudio;
    if (!api) throw new Error('Combat audio diagnostics are unavailable.');
    return api.read();
  });
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
      if (!a || !b) return 0;
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    };
    const diagnostics = (window as unknown as {
      __combatLabLayoutDiagnostics?: () => {
        canvasCount: number;
        worldScaleX: number;
        worldScaleY: number;
        pixelsPer100MetresX: number;
        pixelsPer100MetresY: number;
      } | null;
    }).__combatLabLayoutDiagnostics?.() ?? null;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    const canvasRect = canvas?.getBoundingClientRect() ?? null;
    const mode = rect('.workspace-mode-switch');
    const time = rect('.workspace-time-controls');
    const actions = rect('.workspace-top-actions');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyScroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      headerOverlaps: { modeTime: overlap(mode, time), timeActions: overlap(time, actions) },
      timeButtonCount: document.querySelectorAll('.workspace-time-controls button').length,
      leftDock: rect('#combat-lab-extension-root'),
      rightSidebar: rect('.simulation-sidebar'),
      bottomBar: rect('.simulation-unit-bar'),
      canvas: canvas && canvasRect ? {
        cssWidth: canvasRect.width,
        cssHeight: canvasRect.height,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        pixelRatioX: canvas.width / Math.max(1, canvasRect.width),
        pixelRatioY: canvas.height / Math.max(1, canvasRect.height),
      } : null,
      canvasCount: diagnostics?.canvasCount ?? document.querySelectorAll('canvas').length,
      worldScaleX: diagnostics?.worldScaleX ?? 1,
      worldScaleY: diagnostics?.worldScaleY ?? 1,
      pixelsPer100MetresX: diagnostics?.pixelsPer100MetresX ?? 100,
      pixelsPer100MetresY: diagnostics?.pixelsPer100MetresY ?? 100,
      weaponKind: document.querySelector('.unit-bar-weapon')?.getAttribute('data-weapon-kind') ?? '',
      weaponName: document.querySelector<HTMLElement>('[data-role="weapon-name"]')?.textContent?.trim() ?? '',
      weaponAmmo: document.querySelector<HTMLElement>('[data-role="weapon-ammo"]')?.textContent?.trim() ?? '',
    };
  });
}

function intersectionArea(a: Rect, b: Rect): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
}
