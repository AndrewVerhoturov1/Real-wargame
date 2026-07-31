import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetOrigin = process.env.TARGET_ORIGIN ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';
const artifactDir = path.resolve('artifacts/vercel-ui-audit');

interface PageEvidence {
  path: string;
  title?: string;
  loaded?: boolean;
  screenshots: string[];
  missingControls: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  surface?: unknown;
  performance?: unknown;
}

const evidence: {
  targetOrigin: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string;
  productShaMatch: boolean | 'unproven';
  stage: string;
  pages: Record<string, PageEvidence>;
} = {
  targetOrigin,
  canonicalFeatureBranch,
  expectedProductSha,
  observedProductSha: 'unavailable',
  productShaMatch: 'unproven',
  stage: 'started',
  pages: {},
};

async function saveEvidence(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

async function installAuditHooks(page: Page, pageEvidence: PageEvidence): Promise<void> {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    await page.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    });
  }

  page.on('console', (message) => {
    if (message.type() === 'error') pageEvidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageEvidence.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    pageEvidence.requestFailures.push(
      `${request.method()} ${stripQuery(request.url())} :: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });

  await page.addInitScript(() => {
    const target = window as typeof window & { __uiAuditLongTasks?: number[] };
    target.__uiAuditLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) target.__uiAuditLongTasks?.push(entry.duration);
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // Some browsers do not expose the Long Tasks API.
    }
  });
}

async function loadApplicationPage(
  page: Page,
  pageEvidence: PageEvidence,
  route: string,
  readySelector: string,
): Promise<void> {
  const response = await page.goto(`${targetOrigin}${route}`, { waitUntil: 'domcontentloaded' });
  if (response) expect(response.status(), `${route} navigation status`).toBeLessThan(400);
  await expect(page.locator(readySelector)).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  await expect(page.getByText(/Authentication Required|Log in to Vercel/i)).toHaveCount(0);
  pageEvidence.loaded = true;
  pageEvidence.title = await page.title();
}

async function readDeploymentIdentity(page: Page): Promise<void> {
  try {
    const source = await page.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`deployment-source status ${response.status}`);
      return await response.json() as { sourceSha?: string; ref?: string };
    });
    evidence.observedProductSha = source.sourceSha ?? 'unavailable';
    evidence.productShaMatch = evidence.observedProductSha === expectedProductSha;
  } catch {
    evidence.observedProductSha = 'unavailable';
    evidence.productShaMatch = 'unproven';
  }
}

async function capture(page: Page, pageEvidence: PageEvidence, fileName: string, fullPage = false): Promise<void> {
  const relative = `${fileName}.png`;
  await page.screenshot({ path: path.join(artifactDir, relative), fullPage });
  pageEvidence.screenshots.push(relative);
  await saveEvidence();
}

async function collectSurface(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const elements = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="tab"], [role="dialog"]'))
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          text: (element.innerText || element.getAttribute('aria-label') || element.title || '').trim(),
          ariaSelected: element.getAttribute('aria-selected'),
          ariaCurrent: element.getAttribute('aria-current'),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: entry.startTime }));
    const auditWindow = window as typeof window & { __uiAuditLongTasks?: number[] };
    return {
      title: document.title,
      bodyText: document.body.innerText.slice(0, 60_000),
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        nodeCount: document.querySelectorAll('*').length,
        canvasCount: document.querySelectorAll('canvas').length,
        stylesheetCount: document.styleSheets.length,
      },
      elements,
      navigation: navigation ? {
        domContentLoaded: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
        transferSize: navigation.transferSize,
        decodedBodySize: navigation.decodedBodySize,
      } : null,
      paints,
      resources: performance.getEntriesByType('resource').length,
      longTasks: auditWindow.__uiAuditLongTasks ?? [],
    };
  });
}

async function sampleFrames(page: Page): Promise<unknown> {
  return await page.evaluate(async () => {
    const intervals = await new Promise<number[]>((resolve) => {
      const values: number[] = [];
      let previous = performance.now();
      const tick = (now: number) => {
        values.push(now - previous);
        previous = now;
        if (values.length >= 120) resolve(values);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
    return {
      samples: intervals.length,
      averageMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
      p95Ms: percentile(0.95),
      maxMs: Math.max(...intervals),
      framesOver33Ms: intervals.filter((value) => value > 33).length,
      framesOver50Ms: intervals.filter((value) => value > 50).length,
    };
  });
}

async function clickAndCapture(
  page: Page,
  pageEvidence: PageEvidence,
  label: string,
  fileName: string,
): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() === 0) {
    pageEvidence.missingControls.push(label);
    await saveEvidence();
    return;
  }
  await button.scrollIntoViewIfNeeded();
  if (!(await button.isVisible())) {
    pageEvidence.missingControls.push(`${label} (hidden)`);
    await saveEvidence();
    return;
  }
  await button.click();
  await page.waitForTimeout(900);
  await capture(page, pageEvidence, fileName);
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

test('inspect the deployed AI editor and Combat Lab', async ({ browser }) => {
  test.skip(!targetOrigin, 'TARGET_ORIGIN is required.');
  await saveEvidence();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    const editorEvidence: PageEvidence = {
      path: '/ai-node-editor.html',
      screenshots: [],
      missingControls: [],
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
    };
    evidence.pages.editor = editorEvidence;
    evidence.stage = 'editor-started';
    await saveEvidence();

    const editor = await context.newPage();
    await installAuditHooks(editor, editorEvidence);
    await loadApplicationPage(editor, editorEvidence, '/ai-node-editor.html', '.navigation-profile-tabs');
    await readDeploymentIdentity(editor);
    await capture(editor, editorEvidence, '01-editor-initial-1440x900');

    const editorSections = [
      'Тактические позиции',
      'Граф поведения',
      'Профили маршрута',
      'Профили движения',
      'Вооружение',
      'Профили внимания',
      'Данные бойца',
      'Направленный рельеф',
    ];
    for (let index = 0; index < editorSections.length; index += 1) {
      const label = editorSections[index]!;
      await clickAndCapture(editor, editorEvidence, label, `editor-${String(index + 2).padStart(2, '0')}-${slug(label)}`);
    }

    editorEvidence.surface = await collectSurface(editor);
    editorEvidence.performance = await sampleFrames(editor);
    await editor.setViewportSize({ width: 1100, height: 760 });
    await editor.waitForTimeout(700);
    await capture(editor, editorEvidence, '10-editor-narrow-1100x760');
    await editor.close();

    evidence.stage = 'combat-lab-started';
    await saveEvidence();
    const labEvidence: PageEvidence = {
      path: '/combat-lab.html',
      screenshots: [],
      missingControls: [],
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
    };
    evidence.pages.combatLab = labEvidence;

    const lab = await context.newPage();
    await installAuditHooks(lab, labEvidence);
    await loadApplicationPage(lab, labEvidence, '/combat-lab.html', '.combat-lab-workspace');
    await capture(lab, labEvidence, '11-combat-lab-initial-1440x900');

    const labTabs = ['Сцена', 'Программа', 'Серия', 'Параметры', 'Метрики', 'Журнал'];
    for (let index = 0; index < labTabs.length; index += 1) {
      const label = labTabs[index]!;
      await clickAndCapture(lab, labEvidence, label, `lab-${String(index + 12).padStart(2, '0')}-${slug(label)}`);
    }
    await clickAndCapture(lab, labEvidence, 'Свернуть', '18-combat-lab-collapsed');

    labEvidence.surface = await collectSurface(lab);
    labEvidence.performance = await sampleFrames(lab);
    await lab.setViewportSize({ width: 1100, height: 760 });
    await lab.waitForTimeout(700);
    await capture(lab, labEvidence, '19-combat-lab-narrow-1100x760');
    await lab.close();

    evidence.stage = 'completed';
    await saveEvidence();

    expect(editorEvidence.loaded).toBe(true);
    expect(labEvidence.loaded).toBe(true);
    expect(evidence.productShaMatch).toBe(true);
    expect(editorEvidence.pageErrors, 'AI editor uncaught errors').toEqual([]);
    expect(labEvidence.pageErrors, 'Combat Lab uncaught errors').toEqual([]);
  } finally {
    await saveEvidence();
    await context.close();
  }
});

function slug(value: string): string {
  const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return value.toLocaleLowerCase('ru-RU')
    .split('')
    .map((character) => transliteration[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
