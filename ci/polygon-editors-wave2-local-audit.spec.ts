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

fs.mkdirSync(artifactRoot, { recursive: true });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function assertIdentity(page: Page): Promise<void> {
  const response = await page.request.get(new URL('/deployment-source.json', targetUrl).toString());
  expect(response.status()).toBeLessThan(400);
  const source = await response.json() as {
    sourceSha?: string;
    ref?: string;
    verificationStatus?: string;
    skippedChecks?: unknown[];
  };
  expect(source.sourceSha).toBe(expectedProductSha);
  expect(source.ref).toBe(canonicalFeatureBranch);
  expect(source.verificationStatus).toBe('passed');
  expect(source.skippedChecks ?? []).toHaveLength(0);
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

async function openEditors(page: Page) {
  await assertIdentity(page);
  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  if (response) expect(response.status()).toBeLessThan(400);
  await expect(page.locator('.polygon-shell')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}' });
  const editorsButton = page.locator('.polygon-shell-top-button--editors');
  await expect(editorsButton).toBeVisible();
  await editorsButton.click();
  const portal = page.locator('.polygon-shell-editors-portal');
  await expect(portal).toBeVisible();
  await expect(page.locator('[data-combat-lab-game-editor-catalogue="true"]')).toBeVisible();
  return portal;
}

async function shellMetrics(portal: ReturnType<Page['locator']>) {
  return portal.evaluate((node) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const rows = [...node.querySelectorAll<HTMLElement>('.combat-lab-game-editor-item')].map((row) => ({
      id: row.dataset.gameEditorId ?? null,
      rect: rect(row),
      fontSize: getComputedStyle(row.querySelector('.combat-lab-game-editor-item-label') ?? row).fontSize,
      padding: getComputedStyle(row).padding,
      disabled: (row as HTMLButtonElement).disabled,
      modeVisible: (() => {
        const mode = row.querySelector<HTMLElement>('.combat-lab-game-editor-item-mode');
        return mode ? getComputedStyle(mode).display !== 'none' : false;
      })(),
    }));
    return {
      portal: rect(node),
      header: rect(node.querySelector('.polygon-shell-editors-portal-header')),
      body: rect(node.querySelector('.polygon-shell-editors-portal-body')),
      nav: rect(node.querySelector('.combat-lab-game-editor-nav')),
      stage: rect(node.querySelector('.combat-lab-game-editor-stage')),
      stageBody: rect(node.querySelector('.combat-lab-game-editor-stage-body')),
      rows,
    };
  });
}

test('captures all 11 exact Polygon editor states', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: BrowserErrors = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  collectErrors(page, errors);
  const evidence: Record<string, unknown> = {
    targetUrl,
    canonicalFeatureBranch,
    expectedProductSha,
    viewport: { width: 1440, height: 900 },
    stage: 'started',
    editors: [],
    errors,
  };
  const saveEvidence = () => fs.writeFileSync(path.join(artifactRoot, 'local-audit-evidence.json'), JSON.stringify(evidence, null, 2));

  try {
    const portal = await openEditors(page);
    evidence.metrics = await shellMetrics(portal);
    evidence.stage = 'portal-opened';
    saveEvidence();

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
        const screenshot = `product-${number}-${editor.slug}-unavailable.png`;
        await portal.screenshot({ path: path.join(artifactRoot, screenshot), animations: 'disabled' });
        (evidence.editors as Array<Record<string, unknown>>).push({ ...editor, disabled, title, screenshot, state: 'unavailable' });
        saveEvidence();
        continue;
      }

      expect(disabled).toBe(false);
      await button.click();
      await expect(button).toHaveClass(/is-active/);
      await expect(portal.locator('.combat-lab-game-editor-stage-title')).toHaveText(editor.label);
      const host = portal.locator(`.polygon-global-editor--${editor.id}`);
      await expect(host).toBeVisible();
      await expect.poll(async () => host.locator('.polygon-editor-parity-root').count()).toBeGreaterThan(0);
      const screenshot = `product-${number}-${editor.slug}.png`;
      await portal.screenshot({ path: path.join(artifactRoot, screenshot), animations: 'disabled' });
      (evidence.editors as Array<Record<string, unknown>>).push({ ...editor, disabled, title, screenshot, state: 'active' });
      saveEvidence();
    }

    evidence.stage = 'completed';
    saveEvidence();
  } finally {
    await context.close();
    saveEvidence();
  }
});

test('captures aligned Linear infantryman state', async ({ page }) => {
  const portal = await openEditors(page);
  const outer = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="soldierArchetypes"]');
  await outer.click();
  await expect(outer).toHaveClass(/is-active/);
  const target = portal.getByText('Линейный пехотинец', { exact: true }).first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(portal.getByRole('heading', { name: 'Линейный пехотинец', exact: true }).first()).toBeVisible();
  await portal.screenshot({ path: path.join(artifactRoot, 'product-03-soldier-archetypes-aligned.png'), animations: 'disabled' });
});

test('captures aligned PPSh-41 weapon state', async ({ page }) => {
  const portal = await openEditors(page);
  const outer = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="weapons"]');
  await outer.click();
  await expect(outer).toHaveClass(/is-active/);
  const weaponTab = portal.getByText('Оружие', { exact: true }).first();
  await expect(weaponTab).toBeVisible();
  await weaponTab.click();
  const target = portal.getByText('Пистолет-пулемёт Шпагина ППШ-41', { exact: true }).first();
  await expect(target).toBeVisible();
  await target.click();
  await portal.screenshot({ path: path.join(artifactRoot, 'product-07-weapons-aligned.png'), animations: 'disabled' });
});
