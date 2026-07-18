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
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vision-toggle', { state: 'attached' });
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForTimeout(1200);

  const canvas = page.locator('canvas').first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Game canvas has no bounding box.');
  // Default soldier_1 is at roughly cell 108.4 × 36.0 on a 4.8 px native grid.
  await page.mouse.click(canvasBox.x + 108.9 * 4.8, canvasBox.y + 36.5 * 4.8);
  await page.waitForTimeout(400);
  await page.locator('#vision-toggle').click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outputDir}/rear-attention-game.png`, fullPage: true });
  await writeFile(`${outputDir}/game-debug.txt`, `${await page.locator('#debug-panel').innerText()}\n\n${consoleLines.join('\n')}`, 'utf8');

  await page.goto('http://127.0.0.1:4173/ai-node-editor.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const attentionControl = page.getByText('Профили внимания', { exact: true }).first();
  if (await attentionControl.count()) await attentionControl.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outputDir}/attention-profile-editor.png`, fullPage: true });
  await writeFile(`${outputDir}/editor-text.txt`, await page.locator('body').innerText(), 'utf8');
} finally {
  await browser.close();
}

console.log(`Rear attention visual QA captured in ${outputDir}.`);
