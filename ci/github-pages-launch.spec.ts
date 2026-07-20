import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const targetUrl = requireEnv('TARGET_URL');
const expectedProductSha = requireEnv('EXPECTED_PRODUCT_SHA');
const evidenceDirectory = path.resolve('artifacts/github-pages-e2e');
mkdirSync(evidenceDirectory, { recursive: true });

test('live GitHub Pages game starts and renders the tactical canvas', async ({ page }) => {
  const capture = installCapture(page);
  let navigationStatus: number | null = null;
  let navigationError: string | null = null;

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    navigationStatus = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(8_000);
  } catch (error) {
    navigationError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const state = await readGameState(page);
  const productIdentity = await readProductIdentity(page);
  await page.screenshot({ path: path.join(evidenceDirectory, 'game-after-load.png'), fullPage: true });

  const evidence = {
    targetUrl,
    expectedProductSha,
    navigationStatus,
    navigationError,
    state,
    productIdentity,
    ...capture.snapshot(),
  };
  writeFileSync(path.join(evidenceDirectory, 'game-evidence.json'), JSON.stringify(evidence, null, 2));

  expect(navigationError, navigationError ?? 'navigation must succeed').toBeNull();
  expect(navigationStatus).not.toBeNull();
  expect(navigationStatus!).toBeLessThan(400);
  expect(state.title).toBe('Тактическая карта');
  expect(state.canvasCount, `canvas missing; debug=${state.debugText}`).toBeGreaterThan(0);
  expect(state.visibleCanvasCount, `canvas exists but is not visible; debug=${state.debugText}`).toBeGreaterThan(0);
  expect(state.bootstrapState, `bootstrap failed; debug=${state.debugText}`).not.toBe('failed');
  expect(state.debugText).not.toContain('Не удалось запустить тактическую карту');
  expect(state.debugText).not.toBe('Загрузка тактической карты...');
  expect(productIdentity.scriptContainsExpectedSha, 'deployed game bundle must contain the expected product SHA').toBe(true);
  expect(capture.pageErrors, `page errors: ${capture.pageErrors.join('\n')}`).toEqual([]);
  expect(capture.failedRequests, `failed requests: ${JSON.stringify(capture.failedRequests)}`).toEqual([]);
});

test('live GitHub Pages AI editor starts', async ({ page }) => {
  const capture = installCapture(page);
  const editorUrl = new URL('ai-node-editor.html', targetUrl).toString();
  let navigationStatus: number | null = null;
  let navigationError: string | null = null;

  try {
    const response = await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    navigationStatus = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(5_000);
  } catch (error) {
    navigationError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const state = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body.innerText.slice(0, 4000),
    rootChildren: document.querySelector('#ai-node-editor-root')?.children.length ?? null,
  })).catch((error) => ({
    title: '',
    bodyText: '',
    rootChildren: null,
    evaluationError: error instanceof Error ? error.message : String(error),
  }));
  await page.screenshot({ path: path.join(evidenceDirectory, 'ai-editor-after-load.png'), fullPage: true });

  const evidence = {
    editorUrl,
    navigationStatus,
    navigationError,
    state,
    ...capture.snapshot(),
  };
  writeFileSync(path.join(evidenceDirectory, 'ai-editor-evidence.json'), JSON.stringify(evidence, null, 2));

  expect(navigationError, navigationError ?? 'navigation must succeed').toBeNull();
  expect(navigationStatus).not.toBeNull();
  expect(navigationStatus!).toBeLessThan(400);
  expect(state.title).toBe('Редактор ИИ солдата');
  expect(state.rootChildren, `editor root is empty; body=${state.bodyText}`).not.toBeNull();
  expect(state.rootChildren!).toBeGreaterThan(0);
  expect(capture.pageErrors, `page errors: ${capture.pageErrors.join('\n')}`).toEqual([]);
  expect(capture.failedRequests, `failed requests: ${JSON.stringify(capture.failedRequests)}`).toEqual([]);
});

function installCapture(page: Page) {
  const consoleMessages: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  const failedRequests: Array<{ url: string; errorText: string | null }> = [];
  const badResponses: Array<{ url: string; status: number }> = [];

  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.stack ?? error.message);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), errorText: request.failure()?.errorText ?? null });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });

  return {
    consoleMessages,
    pageErrors,
    failedRequests,
    badResponses,
    snapshot: () => ({ consoleMessages, pageErrors, failedRequests, badResponses }),
  };
}

async function readGameState(page: Page) {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return {
      title: document.title,
      bodyText: document.body.innerText.slice(0, 4000),
      canvasCount: canvases.length,
      visibleCanvasCount: canvases.filter((canvas) => {
        const box = canvas.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }).length,
      canvasSizes: canvases.map((canvas) => {
        const box = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          boxWidth: box.width,
          boxHeight: box.height,
        };
      }),
      rootChildren: document.querySelector('#app')?.children.length ?? null,
      bootstrapState: document.querySelector<HTMLElement>('#app')?.dataset.bootstrapState ?? null,
      debugText: document.querySelector('#debug-panel')?.textContent ?? null,
    };
  }).catch((error) => ({
    title: '',
    bodyText: '',
    canvasCount: 0,
    visibleCanvasCount: 0,
    canvasSizes: [],
    rootChildren: null,
    bootstrapState: null,
    debugText: null,
    evaluationError: error instanceof Error ? error.message : String(error),
  }));
}

async function readProductIdentity(page: Page) {
  return page.evaluate(async (expectedSha) => {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    const scriptUrl = script?.src ?? null;
    let scriptContainsExpectedSha = false;
    let scriptFetchStatus: number | null = null;
    if (scriptUrl) {
      const response = await fetch(scriptUrl, { cache: 'no-store' });
      scriptFetchStatus = response.status;
      if (response.ok) scriptContainsExpectedSha = (await response.text()).includes(expectedSha);
    }
    return { scriptUrl, scriptFetchStatus, scriptContainsExpectedSha };
  }, expectedProductSha).catch((error) => ({
    scriptUrl: null,
    scriptFetchStatus: null,
    scriptContainsExpectedSha: false,
    error: error instanceof Error ? error.message : String(error),
  }));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
