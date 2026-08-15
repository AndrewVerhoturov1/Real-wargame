import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir = 'artifacts/vercel-e2e';
const targetUrl = process.env.TARGET_URL ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';
const near = (actual:number, expected:number, tolerance=3) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

test('final prototype-matched Polygon shell', async ({ page, request }) => {
  mkdirSync(artifactDir, { recursive: true });
  const evidence:any = { targetUrl, canonicalFeatureBranch, expectedProductSha, observedProductSha:'unavailable', productShaMatch:false, stage:'started', geometry:{}, tabs:{}, topbar:{}, consoleErrors:[], pageErrors:[], requestFailures:[], ignoredServiceFailures:[] };
  page.on('console', m => { if (m.type() === 'error') evidence.consoleErrors.push(m.text()); });
  page.on('pageerror', e => evidence.pageErrors.push(e.message));
  page.on('requestfailed', r => { const u=r.url(), entry=`${r.method()} ${u} :: ${r.failure()?.errorText ?? 'unknown'}`; if(u.includes('vercel.live') || u.includes('_next-live') || u.includes('/.well-known/vercel/') || (r.method()==='HEAD' && u===targetUrl)) evidence.ignoredServiceFailures.push(entry); else evidence.requestFailures.push(entry); });
  try {
    const identityResponse = await request.get(new URL('/deployment-source.json', targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity = await identityResponse.json();
    evidence.observedProductSha = identity.sourceSha ?? 'unavailable'; evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch); expect(identity.sourceSha).toBe(expectedProductSha); expect(identity.verificationStatus).toBe('passed'); expect(identity.skippedChecks ?? []).toEqual([]);

    const response = await page.goto(targetUrl, { waitUntil:'domcontentloaded', timeout:60000 }); if(response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({ timeout:30000 }); await expect(page.locator('.polygon-shell-map-placeholder')).toBeVisible(); await page.waitForTimeout(800);
    expect(await page.locator('#app canvas').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');

    const topbar = await page.locator('.polygon-shell-topbar').boundingBox();
    const history = await page.locator('.polygon-shell-history-strip').boundingBox();
    const left = await page.locator('.polygon-shell-left').boundingBox();
    const right = await page.locator('.polygon-shell-right').boundingBox();
    const board = await page.locator('.polygon-shell-map-board').boundingBox();
    expect(topbar && history && left && right && board).toBeTruthy();
    near(topbar!.height,58,1); near(history!.y,58,1); near(history!.height,30,1); near(left!.x,14,2); near(left!.y,102,2); near(left!.width,372,2); near(right!.x,1250,2); near(right!.width,336,2); near(board!.x,451,3); near(board!.y,127,3); near(board!.width,734,3); near(board!.height,734,3);

    const ids = ['program','laboratory','scene','parameters','batch','metrics','journal'];
    const boxes:any = {};
    for(const id of ids) boxes[id] = await page.locator(`[data-combat-lab-tab="${id}"]`).boundingBox();
    for(const id of ids) expect(boxes[id]).toBeTruthy();
    near(boxes.program.y, boxes.laboratory.y, 1); near(boxes.program.y, boxes.scene.y, 1);
    near(boxes.parameters.y, boxes.batch.y, 1); near(boxes.parameters.y, boxes.metrics.y, 1); near(boxes.parameters.y, boxes.journal.y, 1);
    near(boxes.parameters.y - boxes.program.y, 34, 1);
    await expect(page.locator('[data-combat-lab-tab="program"]')).toHaveClass(/active/);
    await expect(page.locator('[data-polygon-right-tab="unit"]')).toHaveClass(/active/);
    evidence.tabs = boxes;

    const runButtons = page.locator('.polygon-shell-run-toolbar .combat-lab-run-toolbar > button');
    const start = await runButtons.nth(1).boundingBox();
    const reset = await runButtons.nth(0).boundingBox();
    const speed = await page.locator('.polygon-shell-run-toolbar .combat-lab-experiment-speed-field').boundingBox();
    const pause = await runButtons.nth(2).boundingBox();
    const duration = await page.locator('.combat-lab-experiment-settings-summary__duration').boundingBox();
    const seed = await page.locator('.combat-lab-experiment-settings-summary__seed').boundingBox();
    expect(start && reset && speed && pause && duration && seed).toBeTruthy();
    expect(start!.x).toBeLessThan(reset!.x); expect(reset!.x).toBeLessThan(speed!.x); expect(speed!.x).toBeLessThan(pause!.x); expect(pause!.x).toBeLessThan(duration!.x); expect(duration!.x).toBeLessThan(seed!.x);
    evidence.topbar = {start, reset, speed, pause, duration, seed};
    evidence.geometry.desktop = {topbar, history, left, right, board};
    await page.screenshot({ path:`${artifactDir}/01-final-shell-1600x900.png`, fullPage:false }); evidence.stage='desktop-captured';

    const journal = page.locator('[data-combat-lab-tab="journal"]'); const memory = page.locator('[data-polygon-right-tab="memory"]');
    await journal.click(); await memory.click(); await expect(journal).toHaveClass(/active/); await expect(memory).toHaveClass(/active/);
    expect(await memory.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(52, 67, 33)');
    await page.screenshot({ path:`${artifactDir}/02-final-tabs-selected-1600x900.png`, fullPage:false }); evidence.stage='tabs-selected';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click(); await page.locator('[aria-controls="polygon-shell-right-panel"]').click(); await expect(page.locator('.polygon-shell-run-toolbar')).toBeVisible();
    await page.screenshot({ path:`${artifactDir}/03-final-panels-collapsed-1600x900.png`, fullPage:false }); evidence.stage='collapsed';
    await page.locator('[aria-controls="polygon-shell-left-panel"]').click(); await page.locator('[aria-controls="polygon-shell-right-panel"]').click();

    await page.setViewportSize({width:1080,height:800}); await page.waitForTimeout(500);
    const nb=await page.locator('.polygon-shell-map-board').boundingBox(), nl=await page.locator('.polygon-shell-left').boundingBox(), nr=await page.locator('.polygon-shell-right').boundingBox(); expect(nb&&nl&&nr).toBeTruthy();
    near(nl!.x,14,2); near(nr!.x,730,2); near(nb!.x,431,3); near(nb!.y,317,3); near(nb!.width,254,3); near(nb!.height,254,3);
    evidence.geometry.narrow={left:nl,right:nr,board:nb};
    await page.screenshot({path:`${artifactDir}/04-final-shell-1080x800.png`,fullPage:false}); evidence.stage='narrow-captured';

    expect(evidence.pageErrors).toEqual([]); expect(evidence.requestFailures).toEqual([]); evidence.stage='completed';
  } finally { writeFileSync(`${artifactDir}/evidence.json`, JSON.stringify(evidence,null,2)+'\n','utf8'); }
});
