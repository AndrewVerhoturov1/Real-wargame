import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outputDir = process.env.REAR_ATTENTION_VISUAL_OUTPUT ?? 'visual-qa';
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const consoleLines = [];
page.on('console', (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.stack ?? error.message}`));

try {
  await page.goto('http://127.0.0.1:4173/?visualQa=ai-state-plan', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vision-toggle', { state: 'attached' });
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__realWargameAiStatePlanVisualQa));
  await page.evaluate(() => window.__realWargameAiStatePlanVisualQa.setScenario('following-order'));
  await page.waitForTimeout(600);

  const debugText = await page.locator('#debug-panel').innerText();
  if (debugText.includes('Выбрано: нет')) throw new Error('Visual QA harness did not select a unit.');

  await page.evaluate(() => {
    const button = document.querySelector('#vision-toggle');
    if (!button) throw new Error('Vision toggle is missing.');
    button.click();
  });
  await page.waitForTimeout(1200);
  const overlayPressed = await page.locator('#vision-toggle').getAttribute('aria-pressed');
  if (overlayPressed !== 'true') throw new Error(`Vision overlay did not activate: aria-pressed=${overlayPressed}`);
  await page.screenshot({ path: `${outputDir}/rear-attention-game.png`, fullPage: true });
  await writeFile(`${outputDir}/game-debug.txt`, `${debugText}\n\n${consoleLines.join('\n')}`, 'utf8');

  await page.goto('http://127.0.0.1:4173/ai-node-editor.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const attentionControl = page.getByText('Профили внимания', { exact: true }).first();
  if (await attentionControl.count()) {
    await attentionControl.evaluate((element) => element.click());
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outputDir}/attention-profile-editor.png`, fullPage: true });
  const rearHeading = page.getByText('Задний обзор', { exact: true }).first();
  if (await rearHeading.count()) {
    await rearHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${outputDir}/attention-profile-editor-rear.png`, fullPage: true });
  await writeFile(`${outputDir}/editor-text.txt`, await page.locator('body').innerText(), 'utf8');
} finally {
  await browser.close();
}

console.log(`Rear attention visual QA captured in ${outputDir}.`);
