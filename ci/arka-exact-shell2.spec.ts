import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir='artifacts/vercel-e2e';
const targetUrl=process.env.TARGET_URL??'';
const expectedProductSha=process.env.EXPECTED_PRODUCT_SHA??'';
const canonicalFeatureBranch=process.env.CANONICAL_FEATURE_BRANCH??'';

test('probe Polygon shell font metrics',async({page,request})=>{
  mkdirSync(artifactDir,{recursive:true});
  const evidence:any={targetUrl,canonicalFeatureBranch,expectedProductSha,observedProductSha:'unavailable',productShaMatch:'unproven',fontCandidates:{},pageErrors:[],requestFailures:[],ignoredServiceFailures:[]};
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('requestfailed',r=>{const u=r.url(),entry=`${r.method()} ${u} :: ${r.failure()?.errorText??'unknown'}`;if(u.includes('vercel.live')||u.includes('_next-live')||u.includes('/.well-known/vercel/')||(r.method()==='HEAD'&&u===targetUrl))evidence.ignoredServiceFailures.push(entry);else evidence.requestFailures.push(entry)});
  try{
    const identityResponse=await request.get(new URL('/deployment-source.json',targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity=await identityResponse.json(); evidence.observedProductSha=identity.sourceSha??'unavailable'; evidence.productShaMatch=identity.sourceSha===expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch); expect(identity.sourceSha).toBe(expectedProductSha);
    await page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:60000}); await expect(page.locator('.polygon-shell')).toBeVisible({timeout:30000}); await page.waitForTimeout(500);
    const selector='.polygon-shell-left-tabs .polygon-shell-tab';
    for(const family of ['Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif','Arial, sans-serif','Liberation Sans, Arial, sans-serif','sans-serif','Arial Narrow, Arial, sans-serif']){
      const result=await page.locator(selector).evaluateAll((els,family)=>{
        els.forEach((el:any)=>el.style.fontFamily=family as string);
        return els.map((el:any)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{text:el.textContent,width:r.width,x:r.x,y:r.y,fontFamily:s.fontFamily};});
      },family);
      evidence.fontCandidates[family]=result;
    }
    await page.screenshot({path:`${artifactDir}/01-font-probe-1600x900.png`,fullPage:false});
    expect(evidence.pageErrors).toEqual([]); expect(evidence.requestFailures).toEqual([]);
  }finally{writeFileSync(`${artifactDir}/evidence.json`,JSON.stringify(evidence,null,2)+'\n','utf8')}
});
