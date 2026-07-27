import fs from 'node:fs';
import { chromium } from 'playwright';

const out = process.env.EVIDENCE_DIR;
const productSha = process.env.PRODUCT_SHA;
const pageErrors = [];
let browser;

function check(value, message) {
  if (!value) throw new Error(message);
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyClasses: document.body.className,
      leftDock: rect('#combat-lab-extension-root'),
      map: rect('#app'),
      rightInspector: rect('.simulation-sidebar'),
      lowerPanel: rect('.simulation-unit-bar'),
      canvasCount: document.querySelectorAll('#app canvas').length,
      rightInsideLeft: Boolean(document.querySelector('#combat-lab-extension-root .simulation-sidebar')),
      fighterTab: Boolean(document.querySelector('[data-combat-lab-tab="fighter"]')),
      labTabs: Array.from(document.querySelectorAll('[data-combat-lab-tab]')).map((item) => item.getAttribute('data-combat-lab-tab')),
      gameTabs: document.querySelectorAll('.simulation-tabs button').length,
    };
  });
}

async function capture(page, name) {
  const state = await geometry(page);
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(state, null, 2));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  check(state.viewport.width === 1440 && state.viewport.height === 900, `${name}: wrong viewport`);
  check(state.documentWidth <= state.clientWidth, `${name}: horizontal overflow ${state.documentWidth}/${state.clientWidth}`);
  check(state.canvasCount === 1, `${name}: expected one canvas, got ${state.canvasCount}`);
  check(!state.rightInsideLeft, `${name}: right inspector was moved into the laboratory dock`);
  check(!state.fighterTab, `${name}: obsolete laboratory Fighter tab remains`);
  check(state.labTabs.join(',') === 'stand,metrics,log', `${name}: unexpected lab tabs ${state.labTabs.join(',')}`);
  check(state.gameTabs >= 4, `${name}: standard game inspector tabs are missing (${state.gameTabs})`);
  if (state.bodyClasses.includes('combat-lab-dock-open') && state.leftDock && state.map) {
    check(state.map.left + 1 >= state.leftDock.right, `${name}: map overlaps left dock`);
  }
  if (state.bodyClasses.includes('combat-lab-dock-open') && state.leftDock && state.lowerPanel) {
    check(state.lowerPanel.left + 1 >= state.leftDock.right, `${name}: lower panel overlaps left dock`);
  }
  if (state.bodyClasses.includes('sidebar-open') && state.rightInspector && state.map) {
    check(state.map.right <= state.rightInspector.left + 1, `${name}: map overlaps right inspector`);
  }
  if (state.bodyClasses.includes('sidebar-open') && state.rightInspector && state.lowerPanel) {
    check(state.lowerPanel.right <= state.rightInspector.left + 1, `${name}: lower panel overlaps right inspector`);
  }
  return state;
}

try {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(25000);
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:4173/combat-lab.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#combat-lab-extension-root[data-combat-lab-extension="active"]');
  await page.waitForSelector('#app canvas');
  await page.waitForSelector('.simulation-sidebar');
  await page.waitForTimeout(300);
  await capture(page, '00-stand-both-open');

  for (const selector of [
    '.simulation-controls [data-action="fire-contact"]',
    '.simulation-controls [data-action="toggle-fire-permission"]',
  ]) {
    const control = page.locator(selector);
    if (await control.count()) {
      check(!(await control.isVisible()), `Legacy shooting control remains visible: ${selector}`);
      check(await control.isDisabled(), `Legacy shooting control remains enabled: ${selector}`);
    }
  }

  const lowerPause = page.locator('.simulation-controls [data-action="pause"]');
  const labPause = page.locator('.combat-lab-run-controls > button').nth(1);
  check(await lowerPause.count() === 1 && await labPause.count() === 1, 'Shared pause controls are missing');
  await lowerPause.click();
  await page.waitForTimeout(250);
  check((await lowerPause.textContent()) === (await labPause.textContent()), `Pause controls diverged: ${await lowerPause.textContent()} / ${await labPause.textContent()}`);

  const speed2 = page.locator('.unit-bar-speed-group [data-speed="2"]');
  const labSpeed = page.locator('.combat-lab-run-controls > label select');
  check(await speed2.count() === 1 && await labSpeed.count() === 1, 'Shared speed controls are missing');
  await speed2.click();
  await page.waitForTimeout(250);
  check(await labSpeed.inputValue() === '2', `Speed controls diverged: laboratory=${await labSpeed.inputValue()}`);

  await page.locator('[data-combat-lab-tab="metrics"]').click();
  await capture(page, '01-metrics-both-open');
  await page.locator('[data-combat-lab-tab="log"]').click();
  await capture(page, '02-log-both-open');
  await page.locator('[data-combat-lab-tab="stand"]').click();

  const leftToggle = page.locator('.combat-lab-dock-toggle');
  const rightToggle = page.locator('.simulation-sidebar [data-action="collapse"]');
  check(await leftToggle.count() === 1, 'Left dock collapse control is missing');
  check(await rightToggle.count() === 1, 'Right inspector collapse control is missing');
  await leftToggle.click();
  await page.waitForTimeout(300);
  await capture(page, '03-left-collapsed-right-open');
  await leftToggle.click();
  await rightToggle.click();
  await page.waitForTimeout(300);
  await capture(page, '04-left-open-right-collapsed');
  await leftToggle.click();
  await page.waitForTimeout(300);
  await capture(page, '05-both-collapsed');

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app canvas');
  await page.waitForTimeout(250);
  const gameState = await page.evaluate(() => {
    const orderDetails = document.querySelector('.unit-bar-route-controls > .unit-route-details');
    const statePlan = document.querySelector('.unit-state-plan > summary');
    return {
      orderDetailsDisplay: orderDetails instanceof HTMLElement ? getComputedStyle(orderDetails).display : 'absent',
      statePlanPointerEvents: statePlan instanceof HTMLElement ? getComputedStyle(statePlan).pointerEvents : 'absent',
      canvasCount: document.querySelectorAll('#app canvas').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  fs.writeFileSync(`${out}/06-game-state.json`, JSON.stringify(gameState, null, 2));
  await page.screenshot({ path: `${out}/06-game-without-order-popover.png`, fullPage: false });
  check(gameState.orderDetailsDisplay === 'none' || gameState.orderDetailsDisplay === 'absent', 'Order popover remains available over the game map');
  check(gameState.statePlanPointerEvents !== 'none', 'State/plan diagnostics were disabled');
  check(gameState.canvasCount === 1 && !gameState.overflow, 'Standard game layout is invalid');
  check(pageErrors.length === 0, `Browser errors:\n${pageErrors.join('\n')}`);

  fs.writeFileSync(`${out}/browser-evidence.json`, JSON.stringify({ status: 'passed', productSha, pageErrors, gameState }, null, 2));
} catch (error) {
  const failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  fs.writeFileSync(`${out}/browser-failure.json`, JSON.stringify({ status: 'failed', productSha, pageErrors, failure }, null, 2));
  throw error;
} finally {
  await browser?.close();
}
