import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = requireEnv('TARGET_URL');
const expectedProductSha = requireEnv('EXPECTED_PRODUCT_SHA');
const canonicalFeatureBranch = requireEnv('CANONICAL_FEATURE_BRANCH');
const artifactRoot = path.resolve(process.cwd(), 'artifacts/polygon-editors-visual-audit');

const editors = [
  { id: 'routeProfiles', label: 'Профили маршрута', slug: 'route-profiles' },
  { id: 'tacticalPositions', label: 'Тактические позиции', slug: 'tactical-positions' },
  { id: 'soldierArchetypes', label: 'Архетипы бойцов', slug: 'soldier-archetypes' },
  { id: 'attentionProfiles', label: 'Профили внимания', slug: 'attention-profiles' },
  { id: 'perceptionProfiles', label: 'Профили восприятия', slug: 'perception-profiles' },
  { id: 'movementProfiles', label: 'Профили движения', slug: 'movement-profiles' },
  { id: 'weapons', label: 'Вооружение', slug: 'weapons' },
  { id: 'conditionProfiles', label: 'Ранения и подавление', slug: 'condition-profiles' },
  { id: 'surfaceTypes', label: 'Типы поверхностей', slug: 'surface-types' },
  { id: 'environmentProfiles', label: 'Профили местности', slug: 'environment-profiles' },
  { id: 'directionalTerrain', label: 'Направленный рельеф', slug: 'directional-terrain' },
] as const;

interface BrowserErrors {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

const evidence = {
  targetUrl,
  canonicalFeatureBranch,
  expectedProductSha,
  observedProductSha: null as string | null,
  productShaMatch: false,
  viewport: { width: 1440, height: 900 },
  productMetrics: null as unknown,
  productEditors: [] as Array<Record<string, unknown>>,
  productErrors: { consoleErrors: [], pageErrors: [], requestFailures: [] } as BrowserErrors,
  stage: 'started',
};

fs.mkdirSync(artifactRoot, { recursive: true });

function persistEvidence(): void {
  fs.writeFileSync(path.join(artifactRoot, 'deployment-evidence.json'), JSON.stringify(evidence, null, 2));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function collectErrors(page: Page, bucket: BrowserErrors): void {
  page.on('console', (message) => {
    if (message.type() === 'error') bucket.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => bucket.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    bucket.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });
}

async function productShellMetrics(page: Page): Promise<unknown> {
  return page.locator('.polygon-shell-editors-portal').evaluate((portal) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const rows = [...portal.querySelectorAll<HTMLElement>('.combat-lab-game-editor-item')].map((row) => {
      const r = row.getBoundingClientRect();
      const css = getComputedStyle(row);
      return {
        id: row.dataset.gameEditorId ?? null,
        label: row.textContent?.replace('НЕДОСТУПНО', '').trim() ?? '',
        height: r.height,
        padding: css.padding,
        fontSize: css.fontSize,
        background: css.backgroundColor,
        disabled: (row as HTMLButtonElement).disabled,
      };
    });
    return {
      portal: rect(portal),
      header: rect(portal.querySelector('.polygon-shell-editors-portal-header')),
      nav: rect(portal.querySelector('.combat-lab-game-editor-nav')),
      stage: rect(portal.querySelector('.combat-lab-game-editor-stage')),
      rows,
    };
  });
}

async function disableMotion(page: Page): Promise<void> {
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      scroll-behavior: auto !important;
    }
  ` });
}

test('capture every Polygon editor from the real Vercel deployment', async ({ browser }) => {
  const context = await browser.newContext({ viewport: evidence.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  collectErrors(page, evidence.productErrors);

  try {
    const identityUrl = new URL('/deployment-source.json', targetUrl).toString();
    const identityResponse = await page.request.get(identityUrl);
    expect(identityResponse.status()).toBeLessThan(400);
    const identity = await identityResponse.json() as { sourceSha?: string; verificationStatus?: string; skippedChecks?: unknown[] };
    evidence.observedProductSha = identity.sourceSha ?? null;
    evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.sourceSha).toBe(expectedProductSha);
    expect(identity.verificationStatus).toBe('passed');
    expect(identity.skippedChecks ?? []).toHaveLength(0);

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await disableMotion(page);

    const editorsButton = page.locator('.polygon-shell-top-button--editors');
    await expect(editorsButton).toBeVisible();
    await expect(editorsButton).not.toHaveAttribute('aria-disabled', 'true');
    await editorsButton.click();

    const portal = page.locator('.polygon-shell-editors-portal');
    await expect(portal).toBeVisible();
    await expect(page.locator('[data-combat-lab-game-editor-catalogue="true"]')).toBeVisible();
    evidence.productMetrics = await productShellMetrics(page);
    evidence.stage = 'portal-opened';
    persistEvidence();

    for (let index = 0; index < editors.length; index += 1) {
      const editor = editors[index];
      const number = String(index + 1).padStart(2, '0');
      const button = portal.locator(`.combat-lab-game-editor-item[data-game-editor-id="${editor.id}"]`);
      await expect(button).toBeVisible();
      const disabled = await button.isDisabled();
      const title = await button.getAttribute('title');

      if (editor.id === 'surfaceTypes') {
        expect(disabled).toBe(true);
        await button.scrollIntoViewIfNeeded();
        const file = `product-${number}-${editor.slug}-unavailable.png`;
        await portal.screenshot({ path: path.join(artifactRoot, file), animations: 'disabled' });
        evidence.productEditors.push({ id: editor.id, label: editor.label, disabled, title, screenshot: file, state: 'unavailable' });
        persistEvidence();
        continue;
      }

      expect(disabled).toBe(false);
      await button.click();
      await expect(button).toHaveClass(/is-active/);
      await expect(portal.locator('.combat-lab-game-editor-stage-title')).toHaveText(editor.label);
      const host = portal.locator(`.polygon-global-editor--${editor.id}`);
      await expect(host).toBeVisible();
      await expect.poll(async () => host.locator('.polygon-editor-parity-root').count(), { timeout: 10_000 }).toBeGreaterThan(0);
      const file = `product-${number}-${editor.slug}.png`;
      await portal.screenshot({ path: path.join(artifactRoot, file), animations: 'disabled' });
      evidence.productEditors.push({ id: editor.id, label: editor.label, disabled, title, screenshot: file, state: 'active' });
      persistEvidence();
    }

    evidence.stage = 'completed';
    persistEvidence();
  } finally {
    await context.close();
    persistEvidence();
  }
});
