import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir='artifacts/vercel-e2e';
const targetUrl=process.env.TARGET_URL??'';
const expectedProductSha=process.env.EXPECTED_PRODUCT_SHA??'';
const canonicalFeatureBranch=process.env.CANONICAL_FEATURE_BRANCH??'';
const near=(actual:number,expected:number,tolerance=3)=>expect(Math.abs(actual-expected)).toBeLessThanOrEqual(tolerance);

test('screenshot-matched Polygon shell diagnostics',async({page,request})=>{
  mkdirSync(artifactDir,{recursive:true});
  const evidence:any={targetUrl,canonicalFeatureBranch,expectedProductSha,observedProductSha:'unavailable',productShaMatch:'unproven',stage:'started',geometry:{},tabDiagnostics:[],consoleErrors:[],pageErrors:[],requestFailures:[],ignoredServiceFailures:[]};
  page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text())});
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('requestfailed',r=>{const u=r.url(),entry=`${r.method()} ${u} :: ${r.failure()?.errorText??'unknown'}`;if(u.includes('vercel.live')||u.includes('_next-live')||u.includes('/.well-known/vercel/')||(r.method()==='HEAD'&&u===targetUrl))evidence.ignoredServiceFailures.push(entry);else evidence.requestFailures.push(entry)});
  try{
    const identityResponse=await request.get(new URL('/deployment-source.json',targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity=await identityResponse.json();
    evidence.observedProductSha=identity.sourceSha??'unavailable'; evidence.productShaMatch=identity.sourceSha===expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch); expect(identity.sourceSha).toBe(expectedProductSha); expect(identity.verificationStatus).toBe('passed'); expect(identity.skippedChecks??[]).toEqual([]);
    const response=await page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:60000}); if(response)expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({timeout:30000}); await page.waitForTimeout(750);
    const topbar=await page.locator('.polygon-shell-topbar').boundingBox(),history=await page.locator('.polygon-shell-history-strip').boundingBox(),left=await page.locator('.polygon-shell-left').boundingBox(),right=await page.locator('.polygon-shell-right').boundingBox(),board=await page.locator('.polygon-shell-map-board').boundingBox();
    expect(topbar&&history&&left&&right&&board).toBeTruthy(); near(topbar!.height,58,1); near(history!.y,58,1); near(history!.height,30,1); near(left!.x,14,2); near(left!.y,102,2); near(left!.width,372,2); near(right!.x,1250,2); near(right!.width,336,2); near(board!.x,451,3); near(board!.y,127,3); near(board!.width,734,3); near(board!.height,734,3);
    evidence.geometry.desktop={topbar,history,left,right,board};
    evidence.tabDiagnostics=await page.locator('.polygon-shell-left-tabs .polygon-shell-tab').evaluateAll((els)=>els.map((el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el); return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,letterSpacing:s.letterSpacing,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,borderLeft:s.borderLeftWidth,borderRight:s.borderRightWidth,textTransform:s.textTransform,lineHeight:s.lineHeight};}));
    evidence.navDiagnostics=await page.locator('.polygon-shell-left-tabs').evaluate((el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,gap:s.gap,padding:s.padding,fontFamily:s.fontFamily};});
    await page.screenshot({path:`${artifactDir}/01-diagnostic-1600x900.png`,fullPage:false}); evidence.stage='desktop-diagnostics-captured';
    expect(evidence.pageErrors).toEqual([]); expect(evidence.requestFailures).toEqual([]); evidence.stage='completed';
  }finally{writeFileSync(`${artifactDir}/evidence.json`,JSON.stringify(evidence,null,2)+'\n','utf8')}
});
