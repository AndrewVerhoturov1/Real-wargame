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
  await saveScreenshot(page, 'state-plan-node-editor.png');
});
