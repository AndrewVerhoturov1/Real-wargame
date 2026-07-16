import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const VIEWPORT = { width: 1440, height: 900 };
const OUTPUT_DIR = path.join('artifacts', 'screenshots', 'tactical-order-radial-menu-v1');
const HOLD_MS = 310;

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

test.describe('tactical order radial menu visual QA — approved by user', () => {
  test('captures radial menu sectors, edge clamping and issued orders', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    await openHarness(page);
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounding box is unavailable.');
    const anchor = { x: box.x + Math.min(720, box.width * 0.58), y: box.y + Math.min(410, box.height * 0.52) };

    await openMenu(page, anchor, 'move');
    await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toHaveAttribute('data-highlighted-preset', 'move');
    await screenshot(page, '01-radial-menu-normal.png');
    await cancelInCenter(page, anchor);
    expect((await snapshot(page)).playerCommandId).toBeNull();

    await openMenu(page, anchor, 'recon');
    await expect(page.locator('[data-preset-id="recon"]')).toHaveClass(/active/);
    await screenshot(page, '02-radial-menu-recon-hover.png');
    await cancelInCenter(page, anchor);

    await openMenu(page, anchor, 'assault');
    await expect(page.locator('[data-preset-id="assault"]')).toHaveClass(/active/);
    await screenshot(page, '03-radial-menu-assault-hover.png');
    await cancelInCenter(page, anchor);

    const edgeAnchor = { x: box.x + 24, y: box.y + 24 };
    await openMenu(page, edgeAnchor, null);
    const menuBox = await page.locator('[data-role="tactical-order-radial-menu"]').boundingBox();
    expect(menuBox).toBeTruthy();
    expect(menuBox?.x).toBeGreaterThanOrEqual(0);
    expect(menuBox?.y).toBeGreaterThanOrEqual(0);
    expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(VIEWPORT.width);
    expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(VIEWPORT.height);
    await screenshot(page, '04-radial-menu-near-screen-edge.png');
    await cancelInCenter(page, edgeAnchor);

    await reset(page);
    await issuePreset(page, anchor, 'recon');
    await expect(page.locator('[data-role="tactical-order-status"]')).toContainText('Приказ: Разведка');
    await expect(page.locator('[data-role="tactical-order-status"]')).toContainText('Осторожный');
    const recon = await snapshot(page);
    expect(recon.presetId).toBe('recon');
    expect(recon.navigationProfileId).toBe('cautious');
    expect(recon.attentionPolicy).toBe('search');
    expect(recon.contactPolicy).toBe('pause_and_observe');
    expect(recon.firePolicy).toBe('self_defense');
    expect(recon.playerCommandId).toBeTruthy();
    expect(recon.movePlayerCommandId).toBe(recon.playerCommandId);
    await screenshot(page, '05-recon-order-issued.png');

    await reset(page);
    await issuePreset(page, anchor, 'assault');
    await expect(page.locator('[data-role="tactical-order-status"]')).toContainText('Приказ: Штурм');
    await expect(page.locator('[data-role="tactical-order-status"]')).toContainText('Атакующий');
    const assault = await snapshot(page);
    expect(assault.presetId).toBe('assault');
    expect(assault.navigationProfileId).toBe('attack');
    expect(assault.attentionPolicy).toBe('engage');
    expect(assault.contactPolicy).toBe('press_attack');
    expect(assault.firePolicy).toBe('fire_at_will');
    expect(assault.playerCommandId).toBeTruthy();
    expect(assault.movePlayerCommandId).toBe(assault.playerCommandId);
    await screenshot(page, '06-assault-order-issued.png');
  });
});

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?visualQa=tactical-order-radial-menu');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameTacticalOrderVisualQa));
  await expect(page.locator('[data-role="tactical-order-status"]')).toBeVisible();
  await reset(page);
}

async function openMenu(
  page: Page,
  anchor: { x: number; y: number },
  presetId: PresetId | null,
): Promise<void> {
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(HOLD_MS);
  await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toBeVisible();
  if (presetId) {
    const point = presetPoint(anchor, presetId);
    await page.mouse.move(point.x, point.y, { steps: 4 });
  }
}

async function issuePreset(
  page: Page,
  anchor: { x: number; y: number },
  presetId: PresetId,
): Promise<void> {
  await openMenu(page, anchor, presetId);
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toBeHidden();
  await page.waitForFunction((expected) => {
    return window.__realWargameTacticalOrderVisualQa?.getSnapshot().presetId === expected;
  }, presetId);
}

async function cancelInCenter(page: Page, anchor: { x: number; y: number }): Promise<void> {
  await page.mouse.move(anchor.x, anchor.y, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toBeHidden();
}

function presetPoint(anchor: { x: number; y: number }, presetId: PresetId): { x: number; y: number } {
  if (presetId === 'recon') return { x: anchor.x, y: anchor.y - 92 };
  if (presetId === 'assault') return { x: anchor.x + 82, y: anchor.y + 48 };
  return { x: anchor.x - 82, y: anchor.y + 48 };
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
