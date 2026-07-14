import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'ai-tactical-query');
const VIEWPORT = { width: 1440, height: 1000 };

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

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('shows Russian tactical query candidates, exclusions, scores and winner', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => {
    window.localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: 'soldier_clean_workspace_graph',
      unitId: 'visual-soldier',
      unitLabel: 'Стрелок',
      selectedBranchNodeId: 'root',
      selectedBranchName: 'Start',
      selectedBranchNameRu: 'Старт',
      ok: true,
      status: 'success',
      paused: false,
      nowMs: Date.now(),
      explanation: 'Query complete.',
      explanationRu: 'Тактический запрос завершён.',
      trace: [],
      scores: [],
      effects: [],
      tacticalQueries: {
        cover_query: {
          id: 'cover_query',
          kind: 'cover',
          status: 'selected',
          budget: { maxCandidates: 16, searchRadiusMeters: 50, maxCalculationMs: 12 },
          elapsedMs: 4.2,
          stopReason: { reason: 'Candidate budget stopped the query.', reasonRu: 'Лимит кандидатов остановил дальнейший поиск.' },
          winnerCandidateId: 'cover-b',
          candidates: [
            {
              id: 'cover-a',
              position: { x: 3, y: 4 },
              source: { label: 'Cover A', labelRu: 'Укрытие А' },
              totalScore: 0,
              excluded: true,
              exclusionReasons: [{ reason: 'No exact route.', reasonRu: 'До позиции нет точного доступного маршрута.' }],
              scoreBreakdown: { protection: 0, concealment: 0, distance: 0, routeDanger: 0, slope: 0, orderAlignment: 0 },
            },
            {
              id: 'cover-b',
              position: { x: 5, y: 4 },
              source: { label: 'Cover B', labelRu: 'Укрытие Б' },
              totalScore: 239.25,
              excluded: false,
              exclusionReasons: [],
              scoreBreakdown: { protection: 70, concealment: 19.25, distance: 20, routeDanger: 64, slope: 45, orderAlignment: 21 },
            },
          ],
        },
      },
    }));
  });

  await page.goto('/ai-node-editor.html');
  await expect(page.getByText('Тактический запрос', { exact: true })).toBeVisible();
  await expect(page.getByText(/Победитель/)).toBeVisible();
  await expect(page.getByText(/Причина исключения/)).toBeVisible();
  await expect(page.getByText(/Досрочная остановка/)).toBeVisible();
  await saveScreenshot(page, 'tactical-query-candidates.png');
});
