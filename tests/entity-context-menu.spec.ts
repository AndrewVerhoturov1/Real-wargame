import { expect, test, type Page } from '@playwright/test';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { entityContextDragExceeded, resolveEntityContextPendingRelease } from '../src/input/EntityContextGesture';
import { resolveEntityContextTarget } from '../src/input/EntityContextTarget';

const CELL_SIZE_PX = 4.8;
const WORLD_OFFSET_PX = 72;
const SOLDIER_ONE_GRID = { x: 108.366, y: 35.998 };
const SOLDIER_TWO_GRID = { x: 95.198, y: 43.382 };
const HOLD_MS = 310;

interface TacticalOrderVisualSnapshot {
  selectedUnitId: string | null;
  playerCommandId: string | null;
}

interface TacticalOrderVisualApi {
  reset(): TacticalOrderVisualSnapshot;
  getSnapshot(): TacticalOrderVisualSnapshot;
}

test.describe('entity context menu arbitration', () => {
  test('target resolver distinguishes unit, map object and empty ground without a second store', () => {
    const state = {
      units: [{ id: 'unit-1', labels: { en: 'Unit', ru: 'Боец' }, position: { x: 2, y: 2 } }],
      map: {
        objects: [{
          id: 'object-1',
          kind: 'cover',
          x: 5,
          y: 5,
          widthCells: 2,
          heightCells: 2,
          rotationRadians: 0,
          labels: { en: 'Cover', ru: 'Укрытие' },
        }],
      },
    } as unknown as SimulationState;

    expect(resolveEntityContextTarget(state, { x: 2, y: 2 })).toMatchObject({ kind: 'unit', id: 'unit-1' });
    expect(resolveEntityContextTarget(state, { x: 5.5, y: 5.5 })).toMatchObject({ kind: 'map-object', id: 'object-1' });
    expect(resolveEntityContextTarget(state, { x: 12, y: 12 })).toBeNull();
  });

  test('drag threshold deterministically keeps entity click separate from tactical release', () => {
    const anchor = { x: 100, y: 100 };
    expect(entityContextDragExceeded(anchor, { x: 103, y: 100 })).toBe(false);
    expect(entityContextDragExceeded(anchor, { x: 104, y: 100 })).toBe(true);
    expect(resolveEntityContextPendingRelease(true, false)).toBe('context-menu');
    expect(resolveEntityContextPendingRelease(true, true)).toBe('tactical-release');
    expect(resolveEntityContextPendingRelease(false, false)).toBe('tactical-release');
  });

  test('short entity RMB opens menu without move; drag and hold remain tactical', async ({ page }) => {
    await openHarness(page);
    const target = await soldierOneScreenPoint(page);
    const api = await reset(page);
    expect(api.playerCommandId).toBeNull();

    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });

    const contextMenu = page.locator('[data-role="entity-context-menu"]');
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu).toHaveAttribute('data-target-kind', 'unit');
    await expect(contextMenu).toHaveAttribute('data-target-id', 'soldier_1');
    await expect(contextMenu.locator('[data-action-id="select"]')).toBeEnabled();
    await expect(contextMenu.locator('[data-action-id="unit"]')).toBeDisabled();
    await expect(contextMenu.locator('[data-action-id="attention"]')).toBeDisabled();
    await expect(contextMenu.locator('[data-action-id="memory"]')).toBeDisabled();
    expect((await snapshot(page)).playerCommandId).toBeNull();

    await page.keyboard.press('Escape');
    await expect(contextMenu).toBeHidden();

    await reset(page);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(target.x + 24, target.y + 10, { steps: 3 });
    await page.mouse.up({ button: 'right' });
    await expect(contextMenu).toBeHidden();
    await page.waitForFunction(() => Boolean(window.__realWargameTacticalOrderVisualQa?.getSnapshot().playerCommandId));

    await reset(page);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(HOLD_MS);
    await expect(page.locator('[data-role="tactical-order-radial-menu"]')).toBeVisible();
    await expect(contextMenu).toBeHidden();
    await page.mouse.up({ button: 'right' });
  });

  test('entity RMB works with no selected unit and outside pointer closes it', async ({ page }) => {
    await openHarness(page);
    const target = await soldierOneScreenPoint(page);
    await page.mouse.click(20, 20, { button: 'left' });

    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    const contextMenu = page.locator('[data-role="entity-context-menu"]');
    await expect(contextMenu).toBeVisible();

    const nextSelection = await gridScreenPoint(page, SOLDIER_TWO_GRID);
    await page.mouse.click(nextSelection.x, nextSelection.y, { button: 'left' });
    await expect(contextMenu).toBeHidden();
    expect((await snapshot(page)).selectedUnitId).toBe('editor_unit_1');
  });
});

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=tactical-order-radial-menu');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameTacticalOrderVisualQa));
}

async function soldierOneScreenPoint(page: Page): Promise<{ x: number; y: number }> {
  return gridScreenPoint(page, SOLDIER_ONE_GRID);
}

async function gridScreenPoint(page: Page, grid: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable.');
  return {
    x: box.x + WORLD_OFFSET_PX + grid.x * CELL_SIZE_PX,
    y: box.y + WORLD_OFFSET_PX + grid.y * CELL_SIZE_PX,
  };
}

async function reset(page: Page): Promise<TacticalOrderVisualSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameTacticalOrderVisualQa as TacticalOrderVisualApi | undefined;
    if (!api) throw new Error('Tactical order visual QA API is unavailable.');
    return api.reset();
  });
}

async function snapshot(page: Page): Promise<TacticalOrderVisualSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameTacticalOrderVisualQa as TacticalOrderVisualApi | undefined;
    if (!api) throw new Error('Tactical order visual QA API is unavailable.');
    return api.getSnapshot();
  });
}
