import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const VIEWPORT = { width: 1440, height: 900 };
const OUTPUT_DIR = path.join('artifacts', 'screenshots', 'tactical-order-radial-menu-v1');
const HOLD_MS = 310;
const SECTOR_RADIUS_PX = 72;
const OUTSIDE_RADIUS_PX = 138;

type PresetId = 'move' | 'recon' | 'assault';

interface TacticalOrderSnapshot {
  selectedUnitId: string | null;
  presetId: string | null;
  navigationProfileId: string | null;
  attentionPolicy: string | null;
  contactPolicy: string | null;
  firePolicy: string | null;
  commandStatus: string | null;
  playerCommandId: string | null;
  movePlayerCommandId: string | null;
  routeStatus: string | null;
  target: { x: number; y: number } | null;
}

interface TacticalOrderVisualApi {
  reset(): TacticalOrderSnapshot;
  getSnapshot(): TacticalOrderSnapshot;
}

interface OpenMenuResult {
  center: { x: number; y: number };
  displayedTarget: { x: number; y: number };
}

test.describe('tactical order radial menu visual QA — approved by user', () => {
  test('captures compact transparency, edge parity, keyboard confirmation and cancellation bounds', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    await openHarness(page);
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounding box is unavailable.');
    const menu = page.locator('[data-role="tactical-order-radial-menu"]');
    const anchor = { x: box.x + Math.min(720, box.width * 0.58), y: box.y + Math.min(410, box.height * 0.52) };

    const normalOpen = await openMenu(page, anchor, 'move');
    await assertCompactMenu(menu);
    await expect(menu).toHaveAttribute('data-highlighted-preset', 'move');
    expect((await snapshot(page)).playerCommandId).toBeNull();
    await screenshot(page, '01-compact-radial-normal.png');
    await cancelInCenter(page, normalOpen.center);
    expect((await snapshot(page)).playerCommandId).toBeNull();

    const reconOpen = await openMenu(page, anchor, 'recon');
    await expect(page.locator('[data-preset-id="recon"]')).toHaveClass(/active/);
    await screenshot(page, '02-compact-radial-recon-hover.png');
    await cancelInCenter(page, reconOpen.center);

    const assaultOpen = await openMenu(page, anchor, 'assault');
    await expect(page.locator('[data-preset-id="assault"]')).toHaveClass(/active/);
    await screenshot(page, '03-compact-radial-assault-hover.png');
    await cancelInCenter(page, assaultOpen.center);

    await reset(page);
    const edgeAnchor = { x: box.x + 5, y: box.y + 5 };
    const edgeOpen = await openMenu(page, edgeAnchor, 'recon');
    expect(Math.abs(edgeOpen.center.x - edgeAnchor.x)).toBeGreaterThan(40);
    expect(Math.abs(edgeOpen.center.y - edgeAnchor.y)).toBeGreaterThan(40);
    await expect(page.locator('[data-preset-id="recon"]')).toHaveClass(/active/);
    await screenshot(page, '04-compact-radial-edge-recon-hover.png');
    await page.mouse.up({ button: 'right' });
    await expect(menu).toBeHidden();
    const edgeRecon = await waitForPreset(page, 'recon');
    expect(edgeRecon.target).toEqual(edgeOpen.displayedTarget);
    await expect(page.locator('[data-role="tactical-order-status"]')).toContainText('Приказ: Разведка');
    await screenshot(page, '05-edge-recon-order-issued.png');

    await reset(page);
    const oppositeEdgeAnchor = { x: box.x + box.width - 5, y: box.y + box.height - 5 };
    const oppositeOpen = await openMenu(page, oppositeEdgeAnchor, 'assault');
    await page.mouse.up({ button: 'right' });
    const oppositeAssault = await waitForPreset(page, 'assault');
    expect(oppositeAssault.target).toEqual(oppositeOpen.displayedTarget);

    await reset(page);
    const outsideOpen = await openMenu(page, anchor, null);
    await page.mouse.move(outsideOpen.center.x + OUTSIDE_RADIUS_PX, outsideOpen.center.y, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    await expect(menu).toBeHidden();
    expect((await snapshot(page)).playerCommandId).toBeNull();

    const keyboardCases: ReadonlyArray<readonly [string, PresetId, string]> = [
      ['1', 'move', 'normal'],
      ['2', 'recon', 'cautious'],
      ['3', 'assault', 'attack'],
    ];
    for (const [key, presetId, navigationProfileId] of keyboardCases) {
      await reset(page);
      await openMenu(page, anchor, null);
      await page.keyboard.press(key);
      await expect(menu).toBeHidden();
      await page.mouse.up({ button: 'right' });
      const keyboardOrder = await waitForPreset(page, presetId);
      expect(keyboardOrder.navigationProfileId).toBe(navigationProfileId);
      expect(keyboardOrder.movePlayerCommandId).toBe(keyboardOrder.playerCommandId);
    }

    await reset(page);
    const denseAnchor = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.42 };
    const denseOpen = await openMenu(page, denseAnchor, 'move');
    await assertCompactMenu(menu);
    await screenshot(page, '06-compact-menu-over-dense-map.png');
    await cancelInCenter(page, denseOpen.center);

    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toHaveCount(0);
    await expect(page.locator('[data-role="tactical-order-status"]')).toHaveCount(0);
  });
});

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?visualQa=tactical-order-radial-menu');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameTacticalOrderVisualQa));
  await reset(page);
  await expect(page.locator('[data-role="tactical-order-status"]')).toBeHidden();
}

async function openMenu(
  page: Page,
  anchor: { x: number; y: number },
  presetId: PresetId | null,
): Promise<OpenMenuResult> {
  const menu = page.locator('[data-role="tactical-order-radial-menu"]');
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(HOLD_MS);
  await expect(menu).toBeVisible();
  const result = await readMenuGeometry(menu);
  if (presetId) {
    const point = presetPoint(result.center, presetId);
    await page.mouse.move(point.x, point.y, { steps: 4 });
  }
  return result;
}

async function readMenuGeometry(menu: Locator): Promise<OpenMenuResult> {
  return menu.evaluate((element) => {
    const root = element as HTMLElement;
    const centerX = Number(root.dataset.menuCenterX);
    const centerY = Number(root.dataset.menuCenterY);
    const targetX = Number(root.dataset.targetX);
    const targetY = Number(root.dataset.targetY);
    if (![centerX, centerY, targetX, targetY].every(Number.isFinite)) {
      throw new Error('Tactical order menu geometry diagnostics are incomplete.');
    }
    return {
      center: { x: centerX, y: centerY },
      displayedTarget: { x: targetX, y: targetY },
    };
  });
}

async function assertCompactMenu(menu: Locator): Promise<void> {
  const box = await menu.boundingBox();
  expect(box).toBeTruthy();
  expect(box?.width).toBeLessThanOrEqual(240);
  expect(box?.height).toBeLessThanOrEqual(240);
  const inactiveBackground = await menu.locator('[data-preset-id="recon"]').evaluate((element) => {
    return getComputedStyle(element).backgroundColor;
  });
  expect(inactiveBackground).toBe('rgba(0, 0, 0, 0)');
}

async function cancelInCenter(page: Page, center: { x: number; y: number }): Promise<void> {
  await page.mouse.move(center.x, center.y, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toBeHidden();
}

function presetPoint(center: { x: number; y: number }, presetId: PresetId): { x: number; y: number } {
  if (presetId === 'recon') return { x: center.x, y: center.y - SECTOR_RADIUS_PX };
  if (presetId === 'assault') return { x: center.x + 62, y: center.y + 36 };
  return { x: center.x - 62, y: center.y + 36 };
}

async function waitForPreset(page: Page, presetId: PresetId): Promise<TacticalOrderSnapshot> {
  await page.waitForFunction((expected) => {
    return window.__realWargameTacticalOrderVisualQa?.getSnapshot().presetId === expected;
  }, presetId);
  return snapshot(page);
}

async function reset(page: Page): Promise<TacticalOrderSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameTacticalOrderVisualQa as TacticalOrderVisualApi | undefined;
    if (!api) throw new Error('Tactical order visual QA API is unavailable.');
    return api.reset();
  });
}

async function snapshot(page: Page): Promise<TacticalOrderSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameTacticalOrderVisualQa as TacticalOrderVisualApi | undefined;
    if (!api) throw new Error('Tactical order visual QA API is unavailable.');
    return api.getSnapshot();
  });
}

async function screenshot(page: Page, fileName: string): Promise<void> {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: false,
  });
}
