import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = requireEnv('TARGET_URL');
const prototypeUrl = requireEnv('PROTOTYPE_URL');
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

interface AuditEvidence {
  targetUrl: string;
  prototypeUrl: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string | null;
  productShaMatch: boolean;
  prototypeVersion: string | null;
  viewport: { width: number; height: number };
  productMetrics: unknown;
  prototypeMetrics: unknown;
  productEditors: Array<Record<string, unknown>>;
  prototypeEditors: Array<Record<string, unknown>>;
  productErrors: BrowserErrors;
  prototypeErrors: BrowserErrors;
  stage: string;
}

fs.mkdirSync(artifactRoot, { recursive: true });

const evidence: AuditEvidence = {
  targetUrl,
  prototypeUrl,
  canonicalFeatureBranch,
  expectedProductSha,
  observedProductSha: null,
  productShaMatch: false,
  prototypeVersion: null,
  viewport: { width: 1440, height: 900 },
  productMetrics: null,
  prototypeMetrics: null,
  productEditors: [],
  prototypeEditors: [],
  productErrors: emptyErrors(),
  prototypeErrors: emptyErrors(),
  stage: 'started',
};

function persistEvidence(): void {
  fs.writeFileSync(path.join(artifactRoot, 'evidence.json'), JSON.stringify(evidence, null, 2));
}

function emptyErrors(): BrowserErrors {
  return { consoleErrors: [], pageErrors: [], requestFailures: [] };
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
    const nav = portal.querySelector('.combat-lab-game-editor-nav');
    const stage = portal.querySelector('.combat-lab-game-editor-stage');
    const header = portal.querySelector('.polygon-shell-editors-portal-header');
    const rows = [...portal.querySelectorAll<HTMLElement>('.combat-lab-game-editor-item')].map((row) => {
      const r = row.getBoundingClientRect();
      const css = getComputedStyle(row);
      return {
        id: row.dataset.gameEditorId ?? null,
        height: r.height,
        padding: css.padding,
        fontSize: css.fontSize,
        background: css.backgroundColor,
      };
    });
    return { portal: rect(portal), header: rect(header), nav: rect(nav), stage: rect(stage), rows };
  });
}

async function prototypeShellMetrics(page: Page): Promise<unknown> {
  return page.locator('.modal--editors-v1').evaluate((modal) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const nav = modal.querySelector('.ge-editor-nav');
    const stage = modal.querySelector('.ge-editor-stage');
    const header = modal.querySelector('.ge-modal-head');
    const rows = [...modal.querySelectorAll<HTMLElement>('.ge-editor-nav button')].map((row) => {
      const r = row.getBoundingClientRect();
      const css = getComputedStyle(row);
      return {
        label: row.textContent?.trim() ?? '',
        height: r.height,
        padding: css.padding,
        fontSize: css.fontSize,
        background: css.backgroundColor,
      };
    });
    return { modal: rect(modal), header: rect(header), nav: rect(nav), stage: rect(stage), rows };
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

test('capture every Polygon editor in deployment and accepted HTML prototype', async ({ browser }) => {
  const productContext = await browser.newContext({ viewport: evidence.viewport, deviceScaleFactor: 1 });
  const productPage = await productContext.newPage();
  collectErrors(productPage, evidence.productErrors);

  try {
    const identityUrl = new URL('/deployment-source.json', targetUrl).toString();
    const identityResponse = await productPage.request.get(identityUrl);
    expect(identityResponse.status()).toBeLessThan(400);
    const identity = await identityResponse.json() as { sourceSha?: string; ref?: string; verificationStatus?: string; skippedChecks?: unknown[] };
    evidence.observedProductSha = identity.sourceSha ?? null;
    evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.sourceSha).toBe(expectedProductSha);
    expect(identity.verificationStatus).toBe('passed');
    expect(identity.skippedChecks ?? []).toHaveLength(0);

    const response = await productPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(productPage.locator('.polygon-shell')).toBeVisible();
    await expect(productPage.locator('canvas').first()).toBeVisible();
    await disableMotion(productPage);

    const editorsButton = productPage.locator('.polygon-shell-top-button--editors');
    await expect(editorsButton).toBeVisible();
    await expect(editorsButton).not.toHaveAttribute('aria-disabled', 'true');
    await editorsButton.click();

    const productPortal = productPage.locator('.polygon-shell-editors-portal');
    await expect(productPortal).toBeVisible();
    await expect(productPage.locator('[data-combat-lab-game-editor-catalogue="true"]')).toBeVisible();
    evidence.productMetrics = await productShellMetrics(productPage);
    evidence.stage = 'product-opened';
    persistEvidence();

    for (let index = 0; index < editors.length; index += 1) {
      const editor = editors[index];
      const number = String(index + 1).padStart(2, '0');
      const button = productPortal.locator(`.combat-lab-game-editor-item[data-game-editor-id="${editor.id}"]`);
      await expect(button).toBeVisible();
      const disabled = await button.isDisabled();
      const title = await button.getAttribute('title');

      if (editor.id === 'surfaceTypes') {
        expect(disabled).toBe(true);
        await button.scrollIntoViewIfNeeded();
        const file = `product-${number}-${editor.slug}-unavailable.png`;
        await productPortal.screenshot({ path: path.join(artifactRoot, file), animations: 'disabled' });
        evidence.productEditors.push({ id: editor.id, label: editor.label, disabled, title, screenshot: file, state: 'unavailable' });
        persistEvidence();
        continue;
      }

      expect(disabled).toBe(false);
      await button.click();
      await expect(button).toHaveClass(/is-active/);
      await expect(productPortal.locator('.combat-lab-game-editor-stage-title')).toHaveText(editor.label);
      const host = productPortal.locator(`.polygon-global-editor--${editor.id}`);
      await expect(host).toBeVisible();
      await expect.poll(async () => host.locator('.polygon-editor-parity-root').count(), { timeout: 10_000 }).toBeGreaterThan(0);
      const activeText = await productPortal.locator('.combat-lab-game-editor-stage-title').textContent();
      const file = `product-${number}-${editor.slug}.png`;
      await productPortal.screenshot({ path: path.join(artifactRoot, file), animations: 'disabled' });
      evidence.productEditors.push({ id: editor.id, label: editor.label, disabled, title, screenshot: file, activeText: activeText?.trim() ?? '' });
      persistEvidence();
    }

    evidence.stage = 'product-captured';
    persistEvidence();
  } finally {
    await productContext.close();
  }

  const prototypeContext = await browser.newContext({ viewport: evidence.viewport, deviceScaleFactor: 1 });
  const prototypePage = await prototypeContext.newPage();
  collectErrors(prototypePage, evidence.prototypeErrors);

  try {
    const response = await prototypePage.goto(prototypeUrl, { waitUntil: 'load' });
    if (response) expect(response.status()).toBeLessThan(400);
    evidence.prototypeVersion = await prototypePage.locator('meta[name="prototype-version"]').getAttribute('content');
    expect(evidence.prototypeVersion).toBe('polygon-map-editor-unified-v44-infantry-integrated-20260815-memory-v3-interface-linkage-v1');
    await disableMotion(prototypePage);
    await prototypePage.locator('#editorsButton').click();
    const prototypeModal = prototypePage.locator('.modal--editors-v1');
    await expect(prototypeModal).toBeVisible();
    evidence.prototypeMetrics = await prototypeShellMetrics(prototypePage);
    evidence.stage = 'prototype-opened';
    persistEvidence();

    for (let index = 0; index < editors.length; index += 1) {
      const editor = editors[index];
      const number = String(index + 1).padStart(2, '0');
      const button = prototypeModal.locator('.ge-editor-nav button').filter({ hasText: editor.label }).first();
      await expect(button).toBeVisible();
      await button.click();
      await expect(button).toHaveClass(/is-active/);
      const file = `prototype-${number}-${editor.slug}.png`;
      await prototypeModal.screenshot({ path: path.join(artifactRoot, file), animations: 'disabled' });
      const stageText = (await prototypeModal.locator('.ge-editor-stage').innerText()).slice(0, 600);
      evidence.prototypeEditors.push({ id: editor.id, label: editor.label, screenshot: file, stageText });
      persistEvidence();
    }

    evidence.stage = 'completed';
    persistEvidence();
  } finally {
    await prototypeContext.close();
    persistEvidence();
  }
});
