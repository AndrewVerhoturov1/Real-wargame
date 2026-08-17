import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const cleanTargetUrl = process.env.TARGET_URL!;
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA!;
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const outDir = 'artifacts/vercel-e2e';

test('capture deployed Polygon states for prototype comparison', async ({ page }) => {
  await mkdir(outDir, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const stages: Array<Record<string, unknown>> = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    requestFailures.push(`${request.method()} ${redactUrl(request.url())} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    await page.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    });
  }

  let observedProductSha = 'unavailable';
  let productShaMatch: boolean | 'unproven' = 'unproven';
  let failure: string | null = null;

  try {
    const response = await page.goto(cleanTargetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    expect(response?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible();
    await expect(page.locator('#app canvas')).toBeVisible();
    await page.waitForTimeout(1_000);

    const sourceIdentity = await page.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json() as { sourceSha?: string; ref?: string; verificationStatus?: string };
    });
    if (sourceIdentity?.sourceSha) {
      observedProductSha = sourceIdentity.sourceSha;
      productShaMatch = observedProductSha === expectedProductSha;
    }
    expect(productShaMatch).toBe(true);

    stages.push({ stage: 'deployment-loaded', sourceIdentity });
    await capture(page, '01-overview.png');

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        app: box('#app'),
        canvas: box('#app canvas'),
        shellViewport: box('.polygon-shell-viewport'),
        leftPanel: box('#polygon-shell-left-panel'),
        rightPanel: box('#polygon-shell-right-panel'),
        topbar: box('.polygon-shell-topbar'),
        history: box('.polygon-shell-history-strip'),
      };
    });
    stages.push({ stage: 'geometry-recorded', geometry });

    await clickAndCapture(page, '[data-combat-lab-tab="program"]', '02-program.png', stages, 'program');
    await clickAndCapture(page, '[data-combat-lab-tab="scene"]', '03-map-editor.png', stages, 'map-editor');
    await clickAndCapture(page, '[data-combat-lab-tab="parameters"]', '04-unit-editor.png', stages, 'unit-editor');

    const editorsClicked = await clickFirst(page, [
      '.polygon-shell-top-button--editors',
      'button:has-text("РЕДАКТОРЫ")',
    ]);
    await page.waitForTimeout(500);
    stages.push({ stage: 'global-editors', clicked: editorsClicked });
    await capture(page, '05-global-editors.png');

    if (editorsClicked) {
      await clickFirst(page, ['.polygon-shell-editors-return', 'button:has-text("Назад")']);
      await page.waitForTimeout(300);
    }

    for (const [tab, file] of [
      ['info', '06-right-info.png'],
      ['attention', '07-right-attention.png'],
      ['memory', '08-right-memory.png'],
    ] as const) {
      const clicked = await clickFirst(page, [`[data-polygon-right-tab="${tab}"]`]);
      await page.waitForTimeout(500);
      stages.push({ stage: `right-${tab}`, clicked });
      await capture(page, file);
    }

    const viewControl = page.locator('.polygon-shell-top-button--view').first();
    const viewVisible = await viewControl.isVisible().catch(() => false);
    const viewEnabled = viewVisible ? await viewControl.isEnabled().catch(() => false) : false;
    const viewClicked = await clickFirst(page, [
      '.polygon-shell-top-button--view',
      'button:has-text("ВИД")',
    ]);
    await page.waitForTimeout(350);
    stages.push({ stage: 'view-control', visible: viewVisible, enabled: viewEnabled, clicked: viewClicked });
    await capture(page, '09-view-control.png');
    await page.keyboard.press('Escape');

    const mapBox = await page.locator('#app').boundingBox();
    let contextOpened = false;
    if (mapBox) {
      await page.mouse.click(
        mapBox.x + mapBox.width * 0.55,
        mapBox.y + mapBox.height * 0.55,
        { button: 'right' },
      );
      await page.waitForTimeout(400);
      contextOpened = await page.locator('.entity-context-menu:visible, [role="menu"]:visible').count().catch(() => 0) > 0;
    }
    stages.push({ stage: 'map-context', attempted: Boolean(mapBox), contextOpened });
    await capture(page, '10-map-context.png');
    await page.keyboard.press('Escape');

    const leftCollapsed = await clickFirst(page, ['button[aria-label="Скрыть левую панель"]']);
    const rightCollapsed = await clickFirst(page, ['button[aria-label="Скрыть правую панель"]']);
    await page.waitForTimeout(450);
    stages.push({ stage: 'panels-collapsed', leftCollapsed, rightCollapsed });
    await capture(page, '11-panels-collapsed.png');
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    await capture(page, '99-failure.png').catch(() => {});
    throw error;
  } finally {
    await writeFile(`${outDir}/evidence.json`, JSON.stringify({
      targetUrl: cleanTargetUrl,
      canonicalFeatureBranch,
      expectedProductSha,
      observedProductSha,
      productShaMatch,
      viewport: { width: 1600, height: 900 },
      stages,
      consoleErrors,
      pageErrors,
      requestFailures,
      failure,
    }, null, 2));
  }
});

async function capture(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: `${outDir}/${file}`, fullPage: false });
}

async function clickAndCapture(
  page: Page,
  selector: string,
  file: string,
  stages: Array<Record<string, unknown>>,
  stage: string,
): Promise<void> {
  const clicked = await clickFirst(page, [selector]);
  await page.waitForTimeout(500);
  stages.push({ stage, clicked });
  await capture(page, file);
}

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!await locator.count()) continue;
    if (!await locator.isVisible().catch(() => false)) continue;
    if (!await locator.isEnabled().catch(() => false)) continue;
    await locator.click({ timeout: 5_000 });
    return true;
  }
  return false;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('_vercel_share')) parsed.searchParams.set('_vercel_share', '<redacted>');
    return parsed.toString();
  } catch {
    return url.replace(/([?&]_vercel_share=)[^&]+/g, '$1<redacted>');
  }
}
