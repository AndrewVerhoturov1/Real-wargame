import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const targetUrl = process.env.TARGET_URL?.trim();
if (!targetUrl) throw new Error('TARGET_URL is required');
const evidenceDirectory = path.resolve('artifacts/github-pages-e2e');
mkdirSync(evidenceDirectory, { recursive: true });

test('Android viewport leaves a usable part of the tactical map exposed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chromium', 'mobile layout acceptance only');
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(5_000);

  const state = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    const samples: Array<{ x: number; y: number; mapHit: boolean; topElement: string }> = [];
    const columns = 8;
    const rows = 10;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = (column + 0.5) * innerWidth / columns;
        const y = (row + 0.5) * innerHeight / rows;
        const element = document.elementFromPoint(x, y);
        const mapHit = Boolean(element && app && (element === canvas || app.contains(element)));
        samples.push({
          x: Math.round(x),
          y: Math.round(y),
          mapHit,
          topElement: element instanceof HTMLElement
            ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : ''}`
            : String(element?.nodeName ?? 'none'),
        });
      }
    }
    const mapHits = samples.filter((sample) => sample.mapHit).length;
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      appRect: app ? rectOf(app.getBoundingClientRect()) : null,
      canvasRect: canvas ? rectOf(canvas.getBoundingClientRect()) : null,
      mapHits,
      sampleCount: samples.length,
      exposedMapRatio: mapHits / samples.length,
      sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
      sidebarOpen: document.body.classList.contains('sidebar-open'),
      samples,
    };

    function rectOf(rect: DOMRect) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }
  });

  await page.screenshot({ path: path.join(evidenceDirectory, 'android-map-exposure-before-fix.png'), fullPage: true });
  writeFileSync(path.join(evidenceDirectory, 'android-map-exposure-before-fix.json'), JSON.stringify(state, null, 2));

  expect(state.sidebarCollapsed, 'mobile sidebar should start collapsed so the map is immediately usable').toBe(true);
  expect(state.exposedMapRatio, `only ${Math.round(state.exposedMapRatio * 100)}% of sampled viewport points expose the map`).toBeGreaterThanOrEqual(0.25);
});
