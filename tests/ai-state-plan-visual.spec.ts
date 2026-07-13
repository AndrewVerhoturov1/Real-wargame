import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'ai-state-plan-v1');
const VIEWPORT = { width: 1440, height: 900 };

type ScenarioName = 'following-order' | 'contact-take-cover' | 'suppressed' | 'restored';

interface VisualSnapshot {
  scenario: ScenarioName;
  stateId: string;
  planId?: string;
  planKind?: string;
  stepId?: string;
  stepAttempt?: number;
  lastEvent: string;
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

async function setScenario(page: Page, scenario: ScenarioName): Promise<VisualSnapshot> {
  const snapshot = await page.evaluate((requested) => {
    const api = window.__realWargameAiStatePlanVisualQa;
    if (!api) throw new Error('AI state-plan visual QA API is unavailable.');
    return api.setScenario(requested);
  }, scenario);
  await page.waitForTimeout(450);
  return snapshot;
}

async function openStatePlanPanel(page: Page): Promise<void> {
  const details = page.locator('[data-role="state-plan-panel"]');
  await expect(details).toBeVisible();
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await details.locator(':scope > summary').click();
  }
  await expect(details).toHaveAttribute('open', '');
}

async function expectStatePlanPopoverVisibleAboveBar(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.simulation-unit-bar');
    const panel = document.querySelector<HTMLElement>('[data-role="state-plan-panel"]');
    const popover = document.querySelector<HTMLElement>('.unit-state-plan-popover');
    if (!bar || !panel || !popover) throw new Error('State-plan layout elements are unavailable.');
    const barRect = bar.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const points = [
      [popoverRect.left + 12, popoverRect.top + 12],
      [popoverRect.left + popoverRect.width / 2, popoverRect.top + 12],
      [popoverRect.right - 12, popoverRect.top + 12],
    ] as const;
    return {
      barOverflow: getComputedStyle(bar).overflow,
      barTop: barRect.top,
      barLeft: barRect.left,
      barRight: barRect.right,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      panelWidth: panelRect.width,
      popoverBottom: popoverRect.bottom,
      popoverHeight: popoverRect.height,
      topPointsVisible: points.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && popover.contains(hit));
      }),
    };
  });

  expect.soft(geometry.barOverflow, 'Open state-plan popover must not be clipped by the compact unit bar.').not.toBe('hidden');
  expect.soft(geometry.panelWidth, 'State-plan summary must have usable width inside the unit bar.').toBeGreaterThan(150);
  expect.soft(geometry.panelLeft).toBeGreaterThanOrEqual(geometry.barLeft);
  expect.soft(geometry.panelRight).toBeLessThanOrEqual(geometry.barRight);
  expect.soft(geometry.popoverHeight, 'Expanded state-plan details must be fully laid out.').toBeGreaterThan(220);
  expect.soft(geometry.popoverBottom, 'Expanded details must open above the unit bar.').toBeLessThanOrEqual(geometry.barTop - 4);
  expect.soft(geometry.topPointsVisible, 'The top of the expanded details must be visible, not clipped by an ancestor.').toEqual([true, true, true]);
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('captures state and plan transitions in the tactical workspace', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?visualQa=ai-state-plan');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__realWargameAiStatePlanVisualQa))).toBe(true);

  const following = await setScenario(page, 'following-order');
  expect(following).toMatchObject({
    stateId: 'FollowingOrder',
    planId: 'visual-follow-plan-001',
    planKind: 'FollowMoveOrder',
    stepId: 'move_and_observe',
    stepAttempt: 1,
  });
  await openStatePlanPanel(page);
  const panel = page.locator('[data-role="state-plan-panel"]');
  await expect(panel).toContainText('Выполнение приказа');
  await expect(panel).toContainText('Выполнить приказ движения');
  await expect(panel).toContainText('Двигаться и наблюдать');
  await expect(page.locator('[data-live="state"]')).toHaveText('Выполнение приказа');
  await expectStatePlanPopoverVisibleAboveBar(page);
  await saveScreenshot(page, 'state-following-order.png');

  const contact = await setScenario(page, 'contact-take-cover');
  expect(contact).toMatchObject({
    stateId: 'Contact',
    planId: 'visual-cover-plan-002',
    planKind: 'TakeCover',
    stepId: 'take_cover',
    stepAttempt: 1,
  });
  await expect(panel).toContainText('Контакт');
  await expect(panel).toContainText('Замечен противник');
  await expect(panel).toContainText('Занять укрытие');
  await expect(panel).toContainText('Предыдущий план');
  await expect(panel).toContainText('Отменён');
  await expect(page.locator('[data-live="state"]')).toHaveText('Контакт');
  await saveScreenshot(page, 'state-contact-take-cover.png');

  const suppressed = await setScenario(page, 'suppressed');
  expect(suppressed).toMatchObject({
    stateId: 'Suppressed',
    planKind: 'TakeCover',
    stepId: 'take_cover',
    stepAttempt: 1,
  });
  await expect(panel).toContainText('Подавлен');
  await expect(panel).toContainText('Подавление достигло критического порога');
  await expect(panel).toContainText('Обычный приказ временно не допускается состоянием');
  await expect(panel.locator('[data-state-plan="plan"]')).toHaveText('Занять укрытие');
  await expect(page.locator('[data-live="state"]')).toHaveText('Подавлен');
  await saveScreenshot(page, 'state-suppressed.png');

  const restored = await setScenario(page, 'restored');
  expect(restored).toMatchObject({
    stateId: 'Suppressed',
    planId: 'visual-restored-cover-plan-003',
    stepId: 'take_cover',
    stepAttempt: 1,
    lastEvent: 'ai_runtime_scene_restored',
  });
  const restoredBefore = await page.evaluate(() => window.__realWargameAiStatePlanVisualQa?.getSnapshot());
  await page.waitForTimeout(900);
  const restoredAfter = await page.evaluate(() => window.__realWargameAiStatePlanVisualQa?.getSnapshot());
  expect(restoredAfter?.planId).toBe(restoredBefore?.planId);
  expect(restoredAfter?.stepId).toBe(restoredBefore?.stepId);
  expect(restoredAfter?.stepAttempt).toBe(1);
  const technical = panel.locator('.unit-state-plan-tech');
  if (!await technical.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await technical.locator(':scope > summary').click();
  }
  await expect(technical).toContainText('visual-restored-cover-plan-003');
  await saveScreenshot(page, 'plan-restored-after-load.png');
});

test('shows state, plan, and active subgraph in the node editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      kind: 'ai-graph-runtime-debug',
      version: 1,
      graphId: 'visual-state-plan-graph',
      unitId: 'visual-soldier',
      unitLabel: 'Боец',
      selectedBranchNodeId: 'root',
      selectedBranchName: 'Root',
      selectedBranchNameRu: 'Старт',
      ok: true,
      status: 'running',
      paused: false,
      nowMs: Date.now(),
      explanation: 'Plan movement is active.',
      explanationRu: 'План движения выполняется.',
      trace: [],
      scores: [],
      effects: [],
      statePlan: {
        stateId: 'Contact',
        stateLabelRu: 'Контакт',
        parentStateId: 'Combat',
        parentStateLabelRu: 'Бой',
        previousStateId: 'FollowingOrder',
        previousStateLabelRu: 'Выполнение приказа',
        transitionReasonRu: 'Замечен противник.',
        transitionTrigger: 'enemy_spotted',
        transitionAtMs: 2200,
        allowedUtilityBranches: ['take_cover', 'threat_response', 'observe'],
        activePlan: {
          id: 'visual-cover-plan-002',
          kind: 'TakeCover',
          goalRu: 'Занять укрытие',
          status: 'active',
          currentStepId: 'take_cover',
          currentStepLabelRu: 'Движение к укрытию',
          currentStepIndex: 0,
          stepCount: 2,
          reasonsRu: ['Замечен противник.', 'Рядом найдено укрытие.', 'Путь к укрытию доступен.'],
          abortConditionsRu: ['Укрытие стало недоступно.', 'Маршрут к укрытию заблокирован.'],
          replanConditionsRu: ['Найдено более безопасное укрытие.'],
          activeSubgraphId: 'take_cover',
          replacesPlanId: 'visual-follow-plan-001',
        },
        previousPlan: {
          id: 'visual-follow-plan-001',
          goalRu: 'Выполнить приказ движения',
          status: 'cancelled',
          cancellationReasonRu: 'Замечен противник.',
        },
        planSequence: 2,
      },
    }));
  });
  await page.goto('/ai-node-editor.html');
  await expect(page.locator('#migrate-graph')).toHaveCount(0);
  await expect(page.locator('.graph-v1-warning')).toHaveCount(0);

  const dock = page.locator('.ai-debug-panel-dock');
  const stateCard = page.locator('[data-ai-debug-panel="state-plan"]');
  const traceCard = page.locator('[data-ai-debug-panel="runtime-trace"]');
  await expect(dock).toBeVisible();
  await expect(stateCard.getByText('Состояние и план', { exact: true })).toBeVisible();
  await expect(traceCard.getByText('След ИИ', { exact: true })).toBeVisible();
  await expect(stateCard).toHaveAttribute('open', '');
  await expect(traceCard).not.toHaveAttribute('open', '');

  const panel = page.locator('.ai-state-plan-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Контакт');
  await expect(panel).toContainText('Занять укрытие');
  await expect(panel).toContainText('Движение к укрытию');
  await expect(panel).toContainText('Выполнить приказ движения · Отменён');

  const openSubgraph = panel.getByRole('button', { name: 'Показать активный подграф' });
  await expect(openSubgraph).toBeEnabled();
  await openSubgraph.click();
  await expect(page.locator('.graph-breadcrumb')).toContainText('Занять укрытие');
  await expect(page.getByRole('button', { name: '← К родительскому графу' })).toBeVisible();
  await expect(panel, 'State and plan details must survive the editor re-render caused by subgraph navigation.').toContainText('Контакт');
  await expect(panel).toContainText('Занять укрытие');
  await expect(panel.locator('[data-state-plan="step"]')).toContainText('Движение к укрытию');
  await saveScreenshot(page, 'state-plan-node-editor.png');

  await traceCard.locator(':scope > summary').click();
  await expect(traceCard).toHaveAttribute('open', '');
  await expect(stateCard).not.toHaveAttribute('open', '');
  await expect(page.locator('.ai-runtime-debug-panel')).toBeVisible();
  await expect(panel).not.toBeVisible();
  await expect(page.locator('.ai-runtime-debug-panel')).toContainText('План движения выполняется.');

  const geometry = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.ai-debug-panel-card'));
    const openCards = cards.filter((card) => (card as HTMLDetailsElement).open);
    const rectangles = cards.map((card) => card.getBoundingClientRect());
    const separated = rectangles.length < 2
      || rectangles[0].bottom <= rectangles[1].top + 0.5
      || rectangles[1].bottom <= rectangles[0].top + 0.5;
    return { openCount: openCards.length, separated };
  });
  expect(geometry.openCount, 'Only one AI diagnostics card may be expanded at once.').toBe(1);
  expect(geometry.separated, 'Collapsed and expanded diagnostics cards must not overlap.').toBe(true);
  await saveScreenshot(page, 'state-plan-node-editor-trace.png');
});
