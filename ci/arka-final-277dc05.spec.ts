import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const targetUrl=process.env.TARGET_URL??'';
const sha=process.env.EXPECTED_PRODUCT_SHA??'';
const branch=process.env.CANONICAL_FEATURE_BRANCH??'';
const out='artifacts/vercel-e2e';
const near=(a:number,b:number,t=3)=>expect(Math.abs(a-b)).toBeLessThanOrEqual(t);

test('final ARKA exact shell visual evidence',async({page,request})=>{
  mkdirSync(out,{recursive:true});
  const evidence:any={targetUrl,expectedProductSha:sha,stage:'started',desktop:{},narrow:{},pageErrors:[],requestFailures:[]};
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('requestfailed',r=>{const u=r.url();if(!u.includes('vercel.live')&&!u.includes('/.well-known/vercel/')&&!(r.method()==='HEAD'&&u===targetUrl))evidence.requestFailures.push(`${r.method()} ${u}`)});
  try{
    const id=await (await request.get(new URL('/deployment-source.json',targetUrl).toString())).json();expect(id.ref).toBe(branch);expect(id.sourceSha).toBe(sha);expect(id.verificationStatus).toBe('passed');expect(id.skippedChecks??[]).toEqual([]);
    await page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:60000});await expect(page.locator('.polygon-shell')).toBeVisible({timeout:30000});await page.waitForTimeout(650);
    const left=await page.locator('.polygon-shell-left').boundingBox(),right=await page.locator('.polygon-shell-right').boundingBox(),board=await page.locator('.polygon-shell-map-board').boundingBox();expect(left&&right&&board).toBeTruthy();near(left!.x,14,2);near(left!.width,372,2);near(right!.x,1250,2);near(right!.width,336,2);near(board!.x,451,3);near(board!.width,734,3);evidence.desktop={left,right,board};
    await page.screenshot({path:`${out}/01-final-277dc05-1600x900.png`,fullPage:false});
    await page.setViewportSize({width:1080,height:800});await page.waitForTimeout(450);
    const nl=await page.locator('.polygon-shell-left').boundingBox(),nr=await page.locator('.polygon-shell-right').boundingBox(),nb=await page.locator('.polygon-shell-map-board').boundingBox();expect(nl&&nr&&nb).toBeTruthy();near(nl!.x,14,2);near(nl!.width,372,2);near(nr!.x,730,2);near(nr!.width,336,2);near(nb!.x,431,3);near(nb!.y,317,3);near(nb!.width,254,3);near(nb!.height,254,3);
    const start=page.locator('.polygon-shell-run-toolbar .combat-lab-run-toolbar > button').nth(1);await expect(start).toContainText('ПУСК');const startBox=await start.boundingBox();expect(startBox).toBeTruthy();expect(startBox!.width).toBeGreaterThanOrEqual(55);near(startBox!.height,34,1);
    evidence.narrow={left:nl,right:nr,board:nb,start:startBox,startText:await start.textContent()};
    await page.screenshot({path:`${out}/02-final-277dc05-1080x800.png`,fullPage:false});
    expect(evidence.pageErrors).toEqual([]);expect(evidence.requestFailures).toEqual([]);evidence.stage='completed';
  }finally{writeFileSync(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n')}
});
