import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const targetUrl = process.env.TARGET_URL!;
const expectedSha = process.env.EXPECTED_PRODUCT_SHA!;
const featureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const outDir = 'artifacts/vercel-e2e';

test('capture exact Polygon six-X visual scope', async ({ page }) => {
  await mkdir(outDir, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const stages: Array<Record<string, unknown>> = [];

  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));

  let observedSha = 'unavailable';
  let failure: string | null = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    expect(response?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible();
    await expect(page.locator('#app canvas')).toBeVisible();
    await page.waitForTimeout(1400);

    const source = await page.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      return response.ok ? await response.json() as { sourceSha?: string; ref?: string; verificationStatus?: string } : null;
    });
    observedSha = source?.sourceSha ?? 'unavailable';
    expect(observedSha).toBe(expectedSha);
    expect(source?.ref).toBe(featureBranch);
    expect(source?.verificationStatus).toBe('passed');

    const overview = await readOverview(page);
    expect(overview.app).not.toBeNull();
    expect(overview.app!.x).toBeGreaterThanOrEqual(445);
    expect(overview.app!.x).toBeLessThanOrEqual(460);
    expect(overview.app!.y).toBeGreaterThanOrEqual(120);
    expect(overview.app!.y).toBeLessThanOrEqual(136);
    expect(overview.app!.width).toBeGreaterThanOrEqual(720);
    expect(overview.app!.width).toBeLessThanOrEqual(750);
    expect(overview.app!.height).toBeGreaterThanOrEqual(720);
    expect(overview.app!.height).toBeLessThanOrEqual(750);
    expect(overview.visibleUnitLabels.length).toBeGreaterThan(0);
    expect(overview.visibleUnitLabels.some(label => label.selected)).toBe(true);
    stages.push({ stage: 'overview', overview });
    await capture(page, '01-overview.png');
    await capture(page, '02-selected-unit.png');

    await clickWorkspaceTab(page, 'scene');
    await expect(page.locator('.polygon-map-editor-parity')).toBeVisible();
    await expect(page.getByText('Основа карты', { exact: true })).toBeVisible();
    stages.push({ stage: 'map-editor', text: await page.locator('.polygon-map-editor-parity').innerText() });
    await capture(page, '03-map-editor.png');

    await clickWorkspaceTab(page, 'parameters');
    await expect(page.locator('.polygon-unit-editor-parity')).toBeVisible();
    await expect(page.getByText('ТАКТИЧЕСКИЙ ЗНАК', { exact: true })).toBeVisible();
    expect(await page.locator('.polygon-unit-editor-posture').count()).toBe(3);
    stages.push({ stage: 'unit-editor', text: await page.locator('.polygon-unit-editor-parity').innerText() });
    await capture(page, '04-unit-editor.png');

    await page.locator('.polygon-shell-top-button--editors').click();
    await expect(page.locator('.polygon-shell-editors-portal')).toBeVisible();
    await expect(page.locator('.combat-lab-game-editor-workspace')).toBeVisible();
    await expect(page.locator('.combat-lab-game-editor-mounted-host')).toBeVisible();
    await expect(page.locator('.polygon-route-profile-editor')).toBeVisible();
    await expect(page.locator('.navigation-profile-list-panel')).toBeVisible();
    await expect(page.locator('.polygon-route-profile-tabs')).toBeVisible();
    await page.waitForTimeout(700);
    const editorState = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        outerNav: rect('.combat-lab-game-editor-nav'),
        profileList: rect('.navigation-profile-list-panel'),
        profileForm: rect('.navigation-profile-form-panel'),
        profileButtons: document.querySelectorAll('.navigation-profile-list [data-profile-id]').length,
        tabs: [...document.querySelectorAll('.polygon-route-profile-tabs button')].map(button => (button.textContent ?? '').trim()),
      };
    });
    expect(editorState.profileButtons).toBeGreaterThan(0);
    expect(editorState.profileList?.width ?? 0).toBeGreaterThan(200);
    expect(editorState.tabs).toEqual(['Основное', 'Местность', 'Тактика', 'Маршрут']);
    stages.push({ stage: 'shared-editors', editorState });
    await capture(page, '05-global-editors.png');

    await page.locator('.polygon-shell-editors-return').click();
    await expect(page.locator('.polygon-shell-editors-portal')).toBeHidden();
    await page.locator('[data-polygon-right-tab="info"]').click();
    const appBox = await page.locator('#app').boundingBox();
    if (appBox) await page.mouse.move(appBox.x + appBox.width * 0.52, appBox.y + appBox.height * 0.52);
    await page.waitForTimeout(700);
    await expect(page.locator('[data-polygon-right-panel="info"]')).toBeVisible();
    const info = await page.evaluate(() => ({
      bodyText: (document.querySelector('[data-polygon-right-panel="info"]')?.textContent ?? '').trim(),
      cards: document.querySelectorAll('[data-polygon-right-panel="info"] .polygon-linza-card').length,
      metrics: document.querySelectorAll('[data-polygon-right-panel="info"] .polygon-linza-metric').length,
    }));
    expect(info.bodyText.length).toBeGreaterThan(0);
    stages.push({ stage: 'right-info', info });
    await capture(page, '06-right-info.png');
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    await capture(page, '99-failure.png').catch(() => {});
    throw error;
  } finally {
    await writeFile(`${outDir}/evidence.json`, JSON.stringify({
      targetUrl,
      canonicalFeatureBranch: featureBranch,
      expectedProductSha: expectedSha,
      observedProductSha: observedSha,
      productShaMatch: observedSha === expectedSha,
      viewport: { width: 1600, height: 900 },
      stages,
      consoleErrors,
      pageErrors,
      requestFailures,
      failure,
    }, null, 2));
  }
});

async function readOverview(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const visibleUnitLabels = [...document.querySelectorAll<HTMLElement>('.unit-label')]
      .map(label => {
        const box = label.getBoundingClientRect();
        const style = getComputedStyle(label);
        return {
          text: (label.textContent ?? '').trim(),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          selected: label.classList.contains('unit-label-selected'),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
            && box.right >= 0 && box.bottom >= 0 && box.left <= innerWidth && box.top <= innerHeight,
        };
      })
      .filter(label => label.visible);
    return {
      app: rect('#app'),
      canvas: rect('#app canvas'),
      leftPanel: rect('#polygon-shell-left-panel'),
      rightPanel: rect('#polygon-shell-right-panel'),
      visibleUnitLabels,
    };
  });
}

async function clickWorkspaceTab(page: Page, tab: string): Promise<void> {
  const control = page.locator(`[data-combat-lab-tab="${tab}"]`).first();
  await expect(control).toBeVisible();
  await control.click();
  await page.waitForTimeout(650);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: false });
}
