import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir='artifacts/vercel-e2e';
const targetUrl=process.env.TARGET_URL??'';
const expectedProductSha=process.env.EXPECTED_PRODUCT_SHA??'';
const canonicalFeatureBranch=process.env.CANONICAL_FEATURE_BRANCH??'';
const near=(actual:number,expected:number,tolerance=3)=>expect(Math.abs(actual-expected)).toBeLessThanOrEqual(tolerance);

test('screenshot-matched Polygon shell',async({page,request})=>{
  mkdirSync(artifactDir,{recursive:true});
  const evidence:any={targetUrl,canonicalFeatureBranch,expectedProductSha,observedProductSha:'unavailable',productShaMatch:'unproven',stage:'started',geometry:{},consoleErrors:[],pageErrors:[],requestFailures:[],ignoredServiceFailures:[]};
  page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text())});
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('requestfailed',r=>{const u=r.url(),entry=`${r.method()} ${u} :: ${r.failure()?.errorText??'unknown'}`;if(u.includes('vercel.live')||u.includes('_next-live')||u.includes('/.well-known/vercel/')||(r.method()==='HEAD'&&u===targetUrl))evidence.ignoredServiceFailures.push(entry);else evidence.requestFailures.push(entry)});
  try{
    const identityResponse=await request.get(new URL('/deployment-source.json',targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity=await identityResponse.json();
    evidence.observedProductSha=identity.sourceSha??'unavailable';
    evidence.productShaMatch=identity.sourceSha===expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch);expect(identity.sourceSha).toBe(expectedProductSha);expect(identity.verificationStatus).toBe('passed');expect(identity.skippedChecks??[]).toEqual([]);
    const response=await page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:60000});if(response)expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({timeout:30000});await expect(page.locator('.polygon-shell-map-placeholder')).toBeVisible();await page.waitForTimeout(750);
    expect(await page.locator('#app canvas').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');
    expect(await page.locator('.polygon-shell-map-placeholder').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(197, 196, 186)');
    expect(await page.locator('.polygon-shell-map-board').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(183, 180, 166)');
    expect(await page.locator('.polygon-shell-left .polygon-shell-panel-body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(250, 250, 244)');
    expect(await page.locator('.polygon-shell-right .polygon-shell-panel-body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    const topbar=await page.locator('.polygon-shell-topbar').boundingBox(),history=await page.locator('.polygon-shell-history-strip').boundingBox(),left=await page.locator('.polygon-shell-left').boundingBox(),right=await page.locator('.polygon-shell-right').boundingBox(),board=await page.locator('.polygon-shell-map-board').boundingBox();
    expect(topbar&&history&&left&&right&&board).toBeTruthy();near(topbar!.height,58,1);near(history!.y,58,1);near(history!.height,30,1);near(left!.x,14,2);near(left!.y,102,2);near(left!.width,372,2);near(right!.x,1250,2);near(right!.width,336,2);near(board!.x,451,3);near(board!.y,127,3);near(board!.width,734,3);near(board!.height,734,3);
    const program=page.locator('[data-combat-lab-tab="program"]'),unit=page.locator('[data-combat-lab-tab="parameters"]'),journal=page.locator('[data-combat-lab-tab="journal"]'),rightUnit=page.locator('[data-polygon-right-tab="unit"]');
    await expect(program).toHaveClass(/active/);await expect(rightUnit).toHaveClass(/active/);
    const unitBox=await unit.boundingBox(),journalBox=await journal.boundingBox();expect(unitBox&&journalBox).toBeTruthy();near(unitBox!.y,journalBox!.y,1);
    evidence.geometry.desktop={topbar,history,left,right,board,unitTab:unitBox,journalTab:journalBox};
    await page.screenshot({path:`${artifactDir}/01-exact-shell-1600x900.png`,fullPage:false});evidence.stage='desktop-captured';
    await journal.click();const memory=page.locator('[data-polygon-right-tab="memory"]');await memory.click();await expect(journal).toHaveClass(/active/);await expect(memory).toHaveClass(/active/);expect(await memory.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(52, 67, 33)');
    await page.screenshot({path:`${artifactDir}/02-tabs-selected-1600x900.png`,fullPage:false});evidence.stage='tabs-verified';
    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();await page.locator('[aria-controls="polygon-shell-right-panel"]').click();await expect(page.locator('.polygon-shell-run-toolbar')).toBeVisible();await page.screenshot({path:`${artifactDir}/03-panels-collapsed-1600x900.png`,fullPage:false});evidence.stage='collapse-verified';
    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();await page.locator('[aria-controls="polygon-shell-right-panel"]').click();await page.setViewportSize({width:1080,height:800});await page.waitForTimeout(500);
    const nb=await page.locator('.polygon-shell-map-board').boundingBox(),nl=await page.locator('.polygon-shell-left').boundingBox(),nr=await page.locator('.polygon-shell-right').boundingBox();expect(nb&&nl&&nr).toBeTruthy();near(nl!.x,14,2);near(nr!.x,730,2);near(nb!.x,431,3);near(nb!.y,317,3);near(nb!.width,254,3);near(nb!.height,254,3);evidence.geometry.narrow={left:nl,right:nr,board:nb};
    await page.screenshot({path:`${artifactDir}/04-exact-shell-1080x800.png`,fullPage:false});evidence.stage='narrow-captured';
    expect(evidence.pageErrors).toEqual([]);expect(evidence.requestFailures).toEqual([]);evidence.stage='completed';
  }finally{writeFileSync(`${artifactDir}/evidence.json`,JSON.stringify(evidence,null,2)+'\n','utf8')}
});
