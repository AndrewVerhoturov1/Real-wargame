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

    const gameplay = id === 'soldierArchetypes' || id === 'conditionProfiles'
      ? (() => {
          const form = node.querySelector<HTMLElement>('.gameplay-tuning-editor-form-panel');
          const tabs = form?.querySelector<HTMLElement>(':scope > .polygon-editor-tabs') ?? null;
          const summary = form?.querySelector<HTMLElement>(':scope > .polygon-editor-summary') ?? null;
          const fields = form?.querySelector<HTMLElement>(':scope > .gameplay-tuning-editor-fields') ?? null;
          if (!form || !tabs || !summary || !fields) return null;
          const tr = tabs.getBoundingClientRect();
          const sr = summary.getBoundingClientRect();
          const fr = fields.getBoundingClientRect();
          return {
            tabsDisplay: getComputedStyle(tabs).display,
            tabsHeight: tr.height,
            summaryDisplay: getComputedStyle(summary).display,
            summaryHeight: sr.height,
            fieldsHeight: fr.height,
            tabsBottom: tr.bottom,
            summaryTop: sr.top,
            summaryBottom: sr.bottom,
            fieldsTop: fr.top,
            gridTemplateRows: getComputedStyle(form).gridTemplateRows,
          };
        })()
      : null;

    const perception = id === 'perceptionProfiles'
      ? (() => {
          const flow = node.querySelector<HTMLElement>('.polygon-perception-flow');
          const fields = node.querySelector<HTMLElement>('.gameplay-tuning-editor-fields');
          const form = node.querySelector<HTMLElement>('.gameplay-tuning-editor-form-panel');
          if (!flow || !fields || !form) return null;
          return {
            flowHeight: flow.getBoundingClientRect().height,
            fieldsHeight: fields.getBoundingClientRect().height,
            formHeight: form.getBoundingClientRect().height,
            gridTemplateRows: getComputedStyle(form).gridTemplateRows,
          };
        })()
      : null;

    return { hiddenViolations, gameplay, perception };
  }, editorId);

  expect(result.hiddenViolations).toEqual([]);
  if (editorId === 'soldierArchetypes' || editorId === 'conditionProfiles') {
    expect(result.gameplay).not.toBeNull();
    expect(result.gameplay?.tabsDisplay).not.toBe('none');
    expect(result.gameplay?.tabsHeight ?? 999).toBeGreaterThanOrEqual(30);
    expect(result.gameplay?.tabsHeight ?? 999).toBeLessThanOrEqual(70);
    expect(result.gameplay?.summaryDisplay).not.toBe('none');
    expect(result.gameplay?.summaryHeight ?? 0).toBeGreaterThan(40);
    expect(result.gameplay?.fieldsHeight ?? 0).toBeGreaterThan(200);
    expect(Math.abs((result.gameplay?.summaryTop ?? 0) - (result.gameplay?.tabsBottom ?? 0))).toBeLessThanOrEqual(2);
    expect((result.gameplay?.fieldsTop ?? 0) + 1).toBeGreaterThanOrEqual(result.gameplay?.summaryBottom ?? 0);
  }
  if (editorId === 'perceptionProfiles') {
    expect(result.perception).not.toBeNull();
    expect(result.perception?.flowHeight ?? 999).toBeLessThanOrEqual(100);
    expect(result.perception?.fieldsHeight ?? 0).toBeGreaterThan(result.perception?.flowHeight ?? 999);
  }
  return result;
}

test('captures every exact Polygon editor state after gameplay tuning row correction', async ({ browser }) => {
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
      const screenshot = `final-product-${number}-${slug}-unavailable.png`;
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
    const screenshot = `final-product-${number}-${slug}.png`;
    await portal.screenshot({ path: path.join(artifactRoot, screenshot), animations: 'disabled' });
    (evidence.editors as Array<Record<string, unknown>>).push({ id, label, disabled, title, screenshot, state: 'active', invariants });
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  evidence.errors = { consoleErrors, pageErrors, requestFailures };
  fs.writeFileSync(path.join(artifactRoot, 'final-local-audit-evidence.json'), JSON.stringify(evidence, null, 2));
  await context.close();
});

test('captures aligned Linear infantryman and PPSh-41 states', async ({ page }) => {
  const portal = await openEditors(page);

  await portal.locator('.combat-lab-game-editor-item[data-game-editor-id="soldierArchetypes"]').click();
  const soldier = portal.getByText('Линейный пехотинец', { exact: true }).first();
  await expect(soldier).toBeVisible();
  await soldier.click();
  await assertParityInvariants(portal.locator('.polygon-global-editor--soldierArchetypes'), 'soldierArchetypes');
  await portal.screenshot({ path: path.join(artifactRoot, 'final-product-03-soldier-archetypes-aligned.png'), animations: 'disabled' });

  await portal.locator('.combat-lab-game-editor-item[data-game-editor-id="weapons"]').click();
  const weaponTab = portal.getByText('Оружие', { exact: true }).first();
  await expect(weaponTab).toBeVisible();
  await weaponTab.click();
  const weapon = portal.getByText('Пистолет-пулемёт Шпагина ППШ-41', { exact: true }).first();
  await expect(weapon).toBeVisible();
  await weapon.click();
  await assertParityInvariants(portal.locator('.polygon-global-editor--weapons'), 'weapons');
  await portal.screenshot({ path: path.join(artifactRoot, 'final-product-07-weapons-aligned.png'), animations: 'disabled' });
});
