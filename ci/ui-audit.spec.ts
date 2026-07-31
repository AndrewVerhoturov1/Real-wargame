import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.TARGET_ORIGIN ?? '';
const expectedSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE || undefined;
const output = path.resolve('artifacts/vercel-ui-audit');

type PageRecord = {
  route: string;
  screenshots: string[];
  missing: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  surface?: unknown;
  frames?: unknown;
};

const report: {
  origin: string;
  expectedSha: string;
  observedSha: string;
  shaMatches: boolean | 'unproven';
  stage: string;
  pages: Record<string, PageRecord>;
} = {
  origin,
  expectedSha,
  observedSha: 'unavailable',
  shaMatches: 'unproven',
  stage: 'started',
  pages: {},
};

async function save(): Promise<void> {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function observe(page: Page, record: PageRecord): void {
  page.on('console', (message) => {
    if (message.type() === 'error') record.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => record.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    record.requestFailures.push(`${request.method()} ${request.url().split('?')[0]} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });
}

async function open(page: Page, record: PageRecord, route: string, ready: string): Promise<void> {
  const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 0, `${route} status`).toBeGreaterThanOrEqual(200);
  expect(response?.status() ?? 500, `${route} status`).toBeLessThan(400);
  await expect(page.locator(ready)).toBeVisible({ timeout: 35_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_200);
  await expect(page.getByText(/Log in to Vercel|Authentication Required/i)).toHaveCount(0);
  await save();
}

async function shot(page: Page, record: PageRecord, name: string): Promise<void> {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  record.screenshots.push(`${name}.png`);
  await save();
}

async function choose(page: Page, record: PageRecord, label: string, name: string): Promise<void> {
  const control = page.getByRole('button', { name: label, exact: true }).first();
  if (await control.count() === 0 || !(await control.isVisible())) {
    record.missing.push(label);
    await save();
    return;
  }
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await page.waitForTimeout(850);
  await shot(page, record, name);
}

async function surface(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const controls = [...document.querySelectorAll<HTMLElement>('button, a, [role="tab"], [role="dialog"]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || '').trim(),
          role: element.getAttribute('role'),
          selected: element.getAttribute('aria-selected'),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return {
      title: document.title,
      text: document.body.innerText.slice(0, 60_000),
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        nodes: document.querySelectorAll('*').length,
        canvases: document.querySelectorAll('canvas').length,
      },
      controls,
      navigation: navigation ? {
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        transferSize: navigation.transferSize,
        decodedBodySize: navigation.decodedBodySize,
      } : null,
      resourceCount: performance.getEntriesByType('resource').length,
    };
  });
}

async function frames(page: Page): Promise<unknown> {
  return await page.evaluate(async () => {
    const values = await new Promise<number[]>((resolve) => {
      const result: number[] = [];
      let previous = performance.now();
      const tick = (now: number) => {
        result.push(now - previous);
        previous = now;
        if (result.length === 120) resolve(result);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const ordered = [...values].sort((a, b) => a - b);
    return {
      samples: values.length,
      averageMs: values.reduce((sum, value) => sum + value, 0) / values.length,
      p95Ms: ordered[Math.floor(ordered.length * 0.95)],
      maxMs: Math.max(...values),
      over33Ms: values.filter((value) => value > 33).length,
      over50Ms: values.filter((value) => value > 50).length,
    };
  });
}

function record(route: string): PageRecord {
  return { route, screenshots: [], missing: [], consoleErrors: [], pageErrors: [], requestFailures: [] };
}

test('audit exact deployed editor and Combat Lab', async ({ browser }) => {
  test.skip(!origin, 'TARGET_ORIGIN is required');
  await save();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    storageState,
  });

  try {
    const editorRecord = record('/ai-node-editor.html');
    report.pages.editor = editorRecord;
    report.stage = 'editor';
    const editor = await context.newPage();
    observe(editor, editorRecord);
    await open(editor, editorRecord, editorRecord.route, '.navigation-profile-tabs');
    const identity = await editor.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json() as { sourceSha?: string };
    });
    report.observedSha = identity?.sourceSha ?? 'unavailable';
    report.shaMatches = report.observedSha === expectedSha;
    await shot(editor, editorRecord, '01-editor-initial-1440x900');

    const sections = [
      'Тактические позиции', 'Граф поведения', 'Профили маршрута', 'Профили движения',
      'Вооружение', 'Профили внимания', 'Данные бойца', 'Направленный рельеф',
    ];
    for (let index = 0; index < sections.length; index += 1) {
      await choose(editor, editorRecord, sections[index]!, `editor-${String(index + 2).padStart(2, '0')}`);
    }
    editorRecord.surface = await surface(editor);
    editorRecord.frames = await frames(editor);
    await editor.setViewportSize({ width: 1100, height: 760 });
    await editor.waitForTimeout(700);
    await shot(editor, editorRecord, '10-editor-narrow-1100x760');
    await editor.close();

    const labRecord = record('/combat-lab.html');
    report.pages.combatLab = labRecord;
    report.stage = 'combat-lab';
    const lab = await context.newPage();
    observe(lab, labRecord);
    await open(lab, labRecord, labRecord.route, '.combat-lab-workspace');
    await shot(lab, labRecord, '11-combat-lab-initial-1440x900');
    const tabs = ['Сцена', 'Программа', 'Серия', 'Параметры', 'Метрики', 'Журнал'];
    for (let index = 0; index < tabs.length; index += 1) {
      await choose(lab, labRecord, tabs[index]!, `lab-${String(index + 12).padStart(2, '0')}`);
    }
    await choose(lab, labRecord, 'Свернуть', '18-combat-lab-collapsed');
    labRecord.surface = await surface(lab);
    labRecord.frames = await frames(lab);
    await lab.setViewportSize({ width: 1100, height: 760 });
    await lab.waitForTimeout(700);
    await shot(lab, labRecord, '19-combat-lab-narrow-1100x760');
    await lab.close();

    report.stage = 'completed';
    await save();
    expect(report.shaMatches).toBe(true);
    expect(editorRecord.pageErrors).toEqual([]);
    expect(labRecord.pageErrors).toEqual([]);
  } finally {
    await save();
    await context.close();
  }
});
