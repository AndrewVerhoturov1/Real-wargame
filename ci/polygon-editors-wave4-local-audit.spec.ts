import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = process.env.TARGET_URL!;
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA!;
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const artifactRoot = path.resolve(process.cwd(), 'artifacts/polygon-editors-visual-audit');
fs.mkdirSync(artifactRoot, { recursive: true });

const editors = [
  ['routeProfiles', 'Профили маршрута', 'route-profiles'],
  ['tacticalPositions', 'Тактические позиции', 'tactical-positions'],
  ['soldierArchetypes', 'Архетипы бойцов', 'soldier-archetypes'],
  ['attentionProfiles', 'Профили внимания', 'attention-profiles'],
  ['perceptionProfiles', 'Профили восприятия', 'perception-profiles'],
  ['movementProfiles', 'Профили движения', 'movement-profiles'],
  ['weapons', 'Вооружение', 'weapons'],
  ['conditionProfiles', 'Ранения и подавление', 'condition-profiles'],
  ['surfaceTypes', 'Типы поверхностей', 'surface-types'],
  ['environmentProfiles', 'Профили местности', 'environment-profiles'],
  ['directionalTerrain', 'Направленный рельеф', 'directional-terrain'],
] as const;

async function openEditors(page: Page) {
  const identityResponse = await page.request.get(new URL('/deployment-source.json', targetUrl).toString());
  expect(identityResponse.status()).toBeLessThan(400);
  const identity = await identityResponse.json() as { sourceSha?: string; ref?: string; verificationStatus?: string; skippedChecks?: unknown[] };
  expect(identity.sourceSha).toBe(expectedProductSha);
  expect(identity.ref).toBe(canonicalFeatureBranch);
  expect(identity.verificationStatus).toBe('passed');
  expect(identity.skippedChecks ?? []).toHaveLength(0);

  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  if (response) expect(response.status()).toBeLessThan(400);
  await expect(page.locator('.polygon-shell')).toBeVisible();
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}' });
  await page.locator('.polygon-shell-top-button--editors').click();
  const portal = page.locator('.polygon-shell-editors-portal');
  await expect(portal).toBeVisible();
  return portal;
}

async function assertParityInvariants(host: ReturnType<Page['locator']>, editorId: string) {
  const result = await host.evaluate((node, id) => {
    const hiddenViolations = [...node.querySelectorAll<HTMLElement>('.polygon-editor-parity-root [hidden]')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => ({ className: element.className, display: getComputedStyle(element).display }));
    const soldierTabs = id === 'soldierArchetypes'
      ? node.querySelector<HTMLElement>('.gameplay-tuning-editor-form-panel > .polygon-editor-tabs')
      : null;
    const flow = id === 'perceptionProfiles' ? node.querySelector<HTMLElement>('.polygon-perception-flow') : null;
    const fields = id === 'perceptionProfiles' ? node.querySelector<HTMLElement>('.gameplay-tuning-editor-fields') : null;
    const form = id === 'perceptionProfiles' ? node.querySelector<HTMLElement>('.gameplay-tuning-editor-form-panel') : null;
    return {
      hiddenViolations,
      soldierTabs: soldierTabs ? {
        display: getComputedStyle(soldierTabs).display,
        visibility: getComputedStyle(soldierTabs).visibility,
        height: soldierTabs.getBoundingClientRect().height,
      } : null,
      perception: flow && fields && form ? {
        flowHeight: flow.getBoundingClientRect().height,
        fieldsHeight: fields.getBoundingClientRect().height,
        formHeight: form.getBoundingClientRect().height,
        gridTemplateRows: getComputedStyle(form).gridTemplateRows,
      } : null,
    };
  }, editorId);

  expect(result.hiddenViolations).toEqual([]);
  if (editorId === 'soldierArchetypes') {
    expect(result.soldierTabs).not.toBeNull();
    expect(result.soldierTabs?.display).not.toBe('none');
    expect(result.soldierTabs?.visibility).not.toBe('hidden');
    expect(result.soldierTabs?.height ?? 0).toBeGreaterThanOrEqual(30);
  }
  if (editorId === 'perceptionProfiles') {
    expect(result.perception).not.toBeNull();
    expect(result.perception?.flowHeight ?? 999).toBeLessThanOrEqual(100);
    expect(result.perception?.fieldsHeight ?? 0).toBeGreaterThan(result.perception?.flowHeight ?? 999);
  }
  return result;
}

test('captures every exact Polygon editor state after perception grid correction', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));

  const evidence: Record<string, unknown> = { expectedProductSha, canonicalFeatureBranch, viewport: { width: 1440, height: 900 }, editors: [] };
  const portal = await openEditors(page);

  for (let index = 0; index < editors.length; index += 1) {
    const [id, label, slug] = editors[index];
    const number = String(index + 1).padStart(2, '0');
    const button = portal.locator(`.combat-lab-game-editor-item[data-game-editor-id="${id}"]`);
    await expect(button).toBeVisible();
    const disabled = await button.isDisabled();
    const title = await button.getAttribute('title');

    if (id === 'surfaceTypes') {
      expect(disabled).toBe(true);
      const screenshot = `wave4-product-${number}-${slug}-unavailable.png`;
      await portal.screenshot({ path: path.join(artifactRoot, screenshot), animations: 'disabled' });
      (evidence.editors as Array<Record<string, unknown>>).push({ id, label, disabled, title, screenshot, state: 'unavailable' });
      continue;
    }

    expect(disabled).toBe(false);
    await button.click();
    await expect(button).toHaveClass(/is-active/);
    await expect(portal.locator('.combat-lab-game-editor-stage-title')).toHaveText(label);
    const host = portal.locator(`.polygon-global-editor--${id}`);
    await expect(host).toBeVisible();
    await expect.poll(async () => host.locator('.polygon-editor-parity-root').count()).toBeGreaterThan(0);
    const invariants = await assertParityInvariants(host, id);
    const screenshot = `wave4-product-${number}-${slug}.png`;
    await portal.screenshot({ path: path.join(artifactRoot, screenshot), animations: 'disabled' });
    (evidence.editors as Array<Record<string, unknown>>).push({ id, label, disabled, title, screenshot, state: 'active', invariants });
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  evidence.errors = { consoleErrors, pageErrors, requestFailures };
  fs.writeFileSync(path.join(artifactRoot, 'wave4-local-audit-evidence.json'), JSON.stringify(evidence, null, 2));
  await context.close();
});

test('captures aligned Linear infantryman and PPSh-41 states', async ({ page }) => {
  const portal = await openEditors(page);

  const soldierOuter = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="soldierArchetypes"]');
  await soldierOuter.click();
  const soldier = portal.getByText('Линейный пехотинец', { exact: true }).first();
  await expect(soldier).toBeVisible();
  await soldier.click();
  await assertParityInvariants(portal.locator('.polygon-global-editor--soldierArchetypes'), 'soldierArchetypes');
  await portal.screenshot({ path: path.join(artifactRoot, 'wave4-product-03-soldier-archetypes-aligned.png'), animations: 'disabled' });

  const weaponOuter = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="weapons"]');
  await weaponOuter.click();
  const weaponTab = portal.getByText('Оружие', { exact: true }).first();
  await expect(weaponTab).toBeVisible();
  await weaponTab.click();
  const weapon = portal.getByText('Пистолет-пулемёт Шпагина ППШ-41', { exact: true }).first();
  await expect(weapon).toBeVisible();
  await weapon.click();
  await assertParityInvariants(portal.locator('.polygon-global-editor--weapons'), 'weapons');
  await portal.screenshot({ path: path.join(artifactRoot, 'wave4-product-07-weapons-aligned.png'), animations: 'disabled' });
});
