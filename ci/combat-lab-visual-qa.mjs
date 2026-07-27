import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const expectedSha = process.env.SOURCE_SHA ?? '';
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error(`Invalid SOURCE_SHA: ${expectedSha}`);

const distRoot = path.resolve('dist');
const qaRoot = path.resolve('artifacts/combat-lab-visual');
mkdirSync(qaRoot, { recursive: true });

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const resolved = path.resolve(distRoot, `.${pathname}`);
    if (!resolved.startsWith(`${distRoot}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const target = statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(target)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(readFileSync(target));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Static server did not expose a port.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const evidence = {
  schemaVersion: 1,
  expectedSha,
  viewport: { width: 1440, height: 900 },
  screenshots: [],
  states: {},
  pageErrors,
  consoleErrors,
};

try {
  await openReady('/combat-lab.html');
  await assertCombatLabStructure();
  await assertSharedTime();
  await assertEditorRoundTrip();

  await selectLabTab('stand');
  evidence.states.bothOpen = await assertGeometry('both-open');
  await screenshot('combat-lab-stand-both-open.png');

  await selectLabTab('metrics');
  await screenshot('combat-lab-metrics.png');

  await selectLabTab('log');
  await screenshot('combat-lab-log.png');

  await selectLabTab('stand');
  await page.locator('.combat-lab-dock-toggle').click();
  await page.waitForFunction(() => document.body.classList.contains('combat-lab-dock-collapsed'));
  evidence.states.leftCollapsedRightOpen = await assertGeometry('left-collapsed-right-open');
  await screenshot('combat-lab-left-collapsed-right-open.png');

  await page.locator('.combat-lab-dock-toggle').click();
  await page.waitForFunction(() => document.body.classList.contains('combat-lab-dock-open'));
  await page.locator('.simulation-sidebar [data-action="collapse"]').click();
  await page.waitForFunction(() => document.body.classList.contains('sidebar-collapsed'));
  evidence.states.leftOpenRightCollapsed = await assertGeometry('left-open-right-collapsed');
  await screenshot('combat-lab-left-open-right-collapsed.png');

  await page.locator('.combat-lab-dock-toggle').click();
  await page.waitForFunction(() => document.body.classList.contains('combat-lab-dock-collapsed'));
  evidence.states.bothCollapsed = await assertGeometry('both-collapsed');
  await screenshot('combat-lab-both-collapsed.png');

  await openReady('/');
  const gameRouteDetailsDisplay = await page.locator('.unit-bar-route-controls > .unit-route-details').evaluate((element) => getComputedStyle(element).display);
  if (gameRouteDetailsDisplay !== 'none') throw new Error(`Order/route popover is visible in normal game: ${gameRouteDetailsDisplay}`);
  if (await page.locator('.simulation-sidebar').count() !== 1) throw new Error('Normal game must have one right inspector.');
  if (await page.locator('canvas').count() !== 1) throw new Error('Normal game must have exactly one canvas.');
  await assertNoHorizontalOverflow('normal-game');
  await screenshot('game-no-order-route-popover.png');

  if (pageErrors.length > 0) throw new Error(`Page errors observed:\n${pageErrors.join('\n')}`);
  writeFileSync(path.join(qaRoot, 'visual-qa.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Chromium visual QA passed with ${evidence.screenshots.length} screenshots.`);
} catch (error) {
  try {
    await page.screenshot({ path: path.join(qaRoot, 'failure-state.png'), fullPage: false });
  } catch {}
  evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  writeFileSync(path.join(qaRoot, 'visual-qa.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function openReady(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('#app[data-bootstrap-state="ready"]', { timeout: 120_000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1, undefined, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function assertCombatLabStructure() {
  if (await page.locator('#combat-lab-extension-root').count() !== 1) throw new Error('Left Combat Lab dock is missing.');
  if (await page.locator('.simulation-sidebar').count() !== 1) throw new Error('Right game inspector is missing or duplicated.');
  if (await page.locator('.simulation-unit-bar').count() !== 1) throw new Error('Lower game panel is missing or duplicated.');
  if (await page.locator('canvas').count() !== 1) throw new Error('Combat Lab must have exactly one canvas.');
  if (await page.locator('[data-combat-lab-tab="fighter"]').count() !== 0) throw new Error('Obsolete fighter tab still exists.');
  if (await page.locator('[data-combat-lab-tab]').count() !== 3) throw new Error('Combat Lab must have exactly three laboratory tabs.');
  if (await page.locator('.simulation-tabs button').count() < 5) throw new Error('Right inspector tabs are incomplete.');
  if (await page.locator('.workspace-mode-switch [data-mode="simulation"]').count() !== 1) throw new Error('Simulation mode switch is missing.');
  if (await page.locator('.workspace-mode-switch [data-mode="editor"]').count() !== 1) throw new Error('Editor mode switch is missing.');

  const legacyFire = page.locator('.simulation-controls [data-action="fire-contact"]');
  if (await legacyFire.count() !== 1) throw new Error('Legacy fire control is absent from the production DOM.');
  const legacyFireHidden = await legacyFire.evaluate((element) => getComputedStyle(element).display === 'none' && element.disabled);
  if (!legacyFireHidden) throw new Error('Legacy manual fire remains available in Combat Lab.');

  const permission = page.locator('.simulation-controls [data-action="toggle-fire-permission"]');
  const permissionHidden = await permission.evaluate((element) => getComputedStyle(element).display === 'none' && element.disabled);
  if (!permissionHidden) throw new Error('Legacy fire-permission control remains available in Combat Lab.');

  if (await page.getByRole('button', { name: 'Открыть огонь', exact: true }).count() !== 1) throw new Error('Stage 9 laboratory fire control is missing.');
  const routeDetailsDisplay = await page.locator('.unit-bar-route-controls > .unit-route-details').evaluate((element) => getComputedStyle(element).display);
  if (routeDetailsDisplay !== 'none') throw new Error(`Order/route popover is visible in Combat Lab: ${routeDetailsDisplay}`);
}

async function assertSharedTime() {
  const labSpeed = page.locator('#combat-lab-extension-root .combat-lab-run-controls select');
  await page.locator('.unit-bar-speed-group [data-speed="4"]').click();
  await page.waitForFunction(() => document.querySelector('#combat-lab-extension-root .combat-lab-run-controls select')?.value === '4');
  await labSpeed.selectOption('2');
  await page.waitForFunction(() => document.querySelector('.unit-bar-speed-group [data-speed="2"]')?.classList.contains('active'));

  const lowerPause = page.locator('.simulation-controls [data-action="pause"]');
  const labPause = page.locator('#combat-lab-extension-root .combat-lab-run-controls button').filter({ hasText: /^(Пауза|Продолжить)$/ }).first();
  const before = (await lowerPause.textContent())?.trim();
  await lowerPause.click();
  await page.waitForFunction((previous) => document.querySelector('.simulation-controls [data-action="pause"]')?.textContent?.trim() !== previous, before);
  const afterLowerClick = (await lowerPause.textContent())?.trim();
  if (afterLowerClick !== (await labPause.textContent())?.trim()) throw new Error('Pause controls diverged after lower-panel click.');

  await labPause.click();
  await page.waitForFunction((previous) => document.querySelector('.simulation-controls [data-action="pause"]')?.textContent?.trim() !== previous, afterLowerClick);
  const restored = (await lowerPause.textContent())?.trim();
  if (restored !== (await labPause.textContent())?.trim()) throw new Error('Pause controls diverged after laboratory click.');
  const topPressed = await page.locator('#pause-toggle').getAttribute('aria-pressed');
  if (topPressed !== String(restored === 'Продолжить')) throw new Error('Top pause control does not reflect shared time state.');
}

async function assertEditorRoundTrip() {
  await page.locator('.workspace-mode-switch [data-mode="editor"]').click();
  await page.waitForFunction(() => document.body.classList.contains('workspace-editor'));
  if (await page.locator('#hud .game-editor-workbench').count() !== 1) throw new Error('Full editor workbench is unavailable in Combat Lab.');
  await page.locator('.workspace-mode-switch [data-mode="simulation"]').click();
  await page.waitForFunction(() => document.body.classList.contains('workspace-simulation'));
  if (await page.locator('.simulation-sidebar').count() !== 1) throw new Error('Right inspector did not return after editor round trip.');
}

async function selectLabTab(tab) {
  await page.locator(`[data-combat-lab-tab="${tab}"]`).click();
  await page.waitForFunction((requested) => document.querySelector(`[data-combat-lab-tab="${requested}"]`)?.classList.contains('active'), tab);
}

async function assertGeometry(label) {
  await page.waitForTimeout(200);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      leftDock: rect('#combat-lab-extension-root'),
      map: rect('#app'),
      rightInspector: rect('.simulation-sidebar'),
      lowerBar: rect('.simulation-unit-bar'),
      bodyClasses: [...document.body.classList],
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });

  if (geometry.canvasCount !== 1) throw new Error(`${label}: expected one canvas, found ${geometry.canvasCount}`);
  if (geometry.scrollWidth > geometry.viewport.width + 1) throw new Error(`${label}: horizontal overflow ${geometry.scrollWidth} > ${geometry.viewport.width}`);
  for (const key of ['leftDock', 'map', 'rightInspector', 'lowerBar']) {
    if (!geometry[key]) throw new Error(`${label}: missing geometry for ${key}`);
  }

  const overlapArea = (first, second) => (
    Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
    * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
  );
  if (overlapArea(geometry.leftDock, geometry.map) > 1) throw new Error(`${label}: left dock overlaps map.`);
  if (overlapArea(geometry.map, geometry.rightInspector) > 1) throw new Error(`${label}: map overlaps right inspector.`);
  if (overlapArea(geometry.map, geometry.lowerBar) > 1) throw new Error(`${label}: map overlaps lower panel.`);
  if (overlapArea(geometry.leftDock, geometry.lowerBar) > 1) throw new Error(`${label}: left dock overlaps lower panel.`);
  if (overlapArea(geometry.rightInspector, geometry.lowerBar) > 1) throw new Error(`${label}: right inspector overlaps lower panel.`);
  return geometry;
}

async function assertNoHorizontalOverflow(label) {
  const values = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (values.scrollWidth > values.viewport + 1) throw new Error(`${label}: horizontal overflow ${values.scrollWidth} > ${values.viewport}`);
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(qaRoot, name), fullPage: false });
  evidence.screenshots.push(name);
}
