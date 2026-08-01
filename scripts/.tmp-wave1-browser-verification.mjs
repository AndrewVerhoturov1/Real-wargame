import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = 'http://127.0.0.1:4173';
const pagePaths = ['/', '/ai-node-editor.html', '/combat-lab.html'];
const viewports = [
  { width: 1440, height: 900 },
  { width: 1100, height: 760 },
];
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const path of pagePaths) {
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(`${viewport.width}x${viewport.height} ${path} console: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        errors.push(`${viewport.width}x${viewport.height} ${path} pageerror: ${error.message}`);
      });
      page.on('requestfailed', (request) => {
        errors.push(`${viewport.width}x${viewport.height} ${path} requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
      });

      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      const trigger = page.locator('[data-app-shell-menu-root="true"] .app-shell-menu-trigger');
      await trigger.waitFor({ state: 'visible' });
      assert.equal(await trigger.count(), 1, `${path}: expected one compact menu trigger`);
      assert.equal(await page.locator('body.with-app-shell-menu').count(), 0, `${path}: legacy top reservation must be absent`);
      assert.equal(
        await page.locator('[data-app-shell-menu-root="true"] .app-shell-mode-links').count(),
        0,
        `${path}: mode links must not remain permanently visible`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        true,
        `${path}: horizontal page overflow`,
      );

      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Общее игровое меню Real Wargame' });
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.locator('[aria-current="page"]').count(), 1, `${path}: one current mode expected`);
      assert.equal(await dialog.locator('.app-shell-current-marker').count(), 1, `${path}: current mode marker expected`);
      assert.equal(
        await page.evaluate(() => {
          const active = document.activeElement;
          const modal = document.querySelector('[role="dialog"]');
          return active instanceof Node && modal?.contains(active) === true;
        }),
        true,
        `${path}: focus must move inside menu`,
      );

      const expectedPaths = ['/', '/ai-node-editor.html', '/combat-lab.html'];
      const hrefPaths = await dialog.locator('a.app-shell-mode-link').evaluateAll(
        (links) => links.map((link) => new URL(link.href).pathname),
      );
      assert.deepEqual(hrefPaths, expectedPaths, `${path}: mode destinations changed`);

      const menuButtons = dialog.locator('button:not([disabled]), a[href]');
      const lastControl = menuButtons.last();
      await lastControl.focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await menuButtons.first().evaluate((element) => document.activeElement === element),
        true,
        `${path}: Tab from last menu control must wrap`,
      );
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await lastControl.evaluate((element) => document.activeElement === element),
        true,
        `${path}: Shift+Tab from first menu control must wrap`,
      );

      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(
        await trigger.evaluate((element) => document.activeElement === element),
        true,
        `${path}: focus must return to trigger`,
      );
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });

      if (path === '/ai-node-editor.html') {
        const tabs = page.locator('[data-game-editor-id]');
        await tabs.first().waitFor({ state: 'visible' });
        assert.equal(await tabs.count(), 9, 'AI editor must expose nine shared registry sections');
        await page.evaluate(() => {
          const graph = document.getElementById('ai-node-editor-root');
          if (!graph) throw new Error('Graph root missing.');
          graph.dataset.browserIdentity = 'canonical-graph-root';
        });
        await page.locator('[data-game-editor-id="weapons"]').click();
        await page.locator('[data-combat-catalog-editor]').waitFor({ state: 'visible' });
        assert.equal(
          await page.locator('[data-combat-catalog-editor]').count(),
          1,
          'one weapon catalog expected after first opening',
        );
        await page.locator('[data-game-editor-id="movementProfiles"]').click();
        await page.locator('[data-game-editor-id="weapons"]').click();
        await page.locator('[data-combat-catalog-editor]').waitFor({ state: 'visible' });
        assert.equal(
          await page.locator('[data-combat-catalog-editor]').count(),
          1,
          'weapon editor switching must not create a second catalog',
        );
        await page.locator('[data-game-editor-id="behaviorGraph"]').click();
        assert.equal(
          await page.evaluate(() => document.querySelectorAll('#ai-node-editor-root').length),
          1,
          'Graph v2 root must remain singular',
        );
        assert.equal(
          await page.locator('#ai-node-editor-root').getAttribute('data-browser-identity'),
          'canonical-graph-root',
          'Graph v2 must retain its original canvas root',
        );
      }

      await page.close();
    }

    for (const sourcePath of pagePaths) {
      for (const destinationPath of pagePaths.filter((candidate) => candidate !== sourcePath)) {
        const page = await context.newPage();
        await page.goto(`${baseUrl}${sourcePath}`, { waitUntil: 'networkidle' });
        await page.locator('.app-shell-menu-trigger').click();
        await Promise.all([
          page.waitForURL((url) => url.pathname === destinationPath),
          page.locator(`a.app-shell-mode-link[href="${destinationPath}"]`).click(),
        ]);
        assert.equal(
          new URL(page.url()).pathname,
          destinationPath,
          `${sourcePath} -> ${destinationPath} navigation failed`,
        );
        await page.close();
      }
    }
    await context.close();
  }

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
  console.log('Wave 1 browser verification passed at 1440x900 and 1100x760.');
} finally {
  await browser.close();
}
