import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUTPUT = 'artifacts/screenshots/ai-debug-dock-diagnostic';

test('captures diagnostics dock geometry', async ({ page }) => {
  mkdirSync(OUTPUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      kind: 'ai-graph-runtime-debug',
      version: 1,
      graphId: 'diagnostic',
      unitId: 'diagnostic-soldier',
      selectedBranchNodeId: 'root',
      selectedBranchName: 'Root',
      selectedBranchNameRu: 'Старт',
      ok: true,
      status: 'running',
      paused: false,
      nowMs: Date.now(),
      explanation: 'Diagnostic runtime.',
      explanationRu: 'Диагностический расчёт.',
      trace: [],
      scores: [],
      effects: [],
      statePlan: {
        stateId: 'Contact',
        stateLabelRu: 'Контакт',
        parentStateId: 'Combat',
        parentStateLabelRu: 'Бой',
        allowedUtilityBranches: ['take_cover'],
        planSequence: 1,
      },
    }));
  });
  await page.goto('/ai-node-editor.html');
  const dock = page.locator('.ai-debug-panel-dock');
  await expect(dock).toBeAttached();
  await page.waitForTimeout(1200);
  const geometry = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const parentRect = parent?.getBoundingClientRect();
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.ai-debug-panel-card')).map((card) => {
      const cardStyle = getComputedStyle(card);
      const cardRect = card.getBoundingClientRect();
      return {
        id: card.dataset.aiDebugPanel,
        open: (card as HTMLDetailsElement).open,
        display: cardStyle.display,
        visibility: cardStyle.visibility,
        width: cardRect.width,
        height: cardRect.height,
        top: cardRect.top,
        bottom: cardRect.bottom,
      };
    });
    return {
      dock: {
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        overflow: style.overflow,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      parent: parent && parentRect && parentStyle ? {
        tag: parent.tagName,
        id: parent.id,
        className: parent.className,
        display: parentStyle.display,
        position: parentStyle.position,
        overflow: parentStyle.overflow,
        width: parentRect.width,
        height: parentRect.height,
        top: parentRect.top,
        bottom: parentRect.bottom,
      } : null,
      cards,
      html: element.outerHTML.slice(0, 1500),
    };
  });
  console.log(`AI_DEBUG_DOCK_GEOMETRY=${JSON.stringify(geometry)}`);
  await page.screenshot({ path: `${OUTPUT}/ai-debug-dock-diagnostic.png`, fullPage: false });
  expect(geometry.dock.width).toBeGreaterThan(100);
  expect(geometry.dock.height).toBeGreaterThan(100);
});
