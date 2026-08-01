import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT_DIR = process.env.OUT_DIR ?? 'artifacts/ux-audit-fast';
const ROUTE = '/combat-lab.html';
const SELECTOR = 'button, a[href], [role="button"], [role="tab"], summary, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], select';
const VIEWPORT = { width: 1440, height: 900 };
const MAX_SECOND_LEVEL = 100;

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(path.join(OUT_DIR, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  route: ROUTE,
  initialControls: [],
  actions: [],
  discoveredControls: {},
  errors: [],
  complete: false,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
const safe = (value) => String(value || 'unnamed').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '').slice(0, 68) || 'unnamed';
const keyOf = (item) => JSON.stringify([item.tag, item.role, item.id, item.testid, item.aria, item.title, item.href, item.type, item.text]);

async function persist() {
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  const clickProblems = report.actions.flatMap((action) => action.clickResults || []).filter((item) => !['clicked', 'force-clicked'].includes(item.status));
  const lines = [
    '# Focused Combat Lab UX audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Complete: ${report.complete}`,
    `Initial visible controls: ${report.initialControls.length}`,
    `Captured actions: ${report.actions.length}`,
    `Unique visible controls: ${Object.keys(report.discoveredControls).length}`,
    `Click problems: ${clickProblems.length}`,
    `Browser events: ${report.errors.length}`,
    '',
    ...clickProblems.slice(0, 100).map((item) => `- ${item.status}: ${item.descriptor?.text || item.descriptor?.aria || item.descriptor?.id || item.descriptor?.tag}`),
  ];
  await fs.writeFile(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
}

async function createSession() {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  let page = await context.newPage();
  const bind = (target) => {
    target.on('console', (message) => {
      if (message.type() === 'error') report.errors.push({ type: 'console.error', url: target.url(), text: message.text() });
    });
    target.on('pageerror', (error) => report.errors.push({ type: 'pageerror', url: target.url(), text: error.message }));
    target.on('dialog', async (dialog) => {
      report.errors.push({ type: 'dialog', url: target.url(), dialogType: dialog.type(), text: dialog.message() });
      await dialog.accept().catch(() => {});
    });
  };
  bind(page);
  await page.goto(new URL(ROUTE, BASE_URL).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await wait(800);
  return {
    context,
    get page() { return page; },
    set page(value) { page = value; bind(value); },
  };
}

async function collectControls(page) {
  return page.locator(SELECTOR).evaluateAll((nodes) => nodes.map((node, index) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      index,
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || '',
      id: node.id || '',
      testid: node.getAttribute('data-testid') || '',
      aria: node.getAttribute('aria-label') || '',
      title: node.getAttribute('title') || '',
      href: node.getAttribute('href') || '',
      type: node.getAttribute('type') || '',
      text: (node.innerText || node.textContent || node.getAttribute('value') || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      visible: rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0',
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
      pressed: node.getAttribute('aria-pressed') || '',
      selected: node.getAttribute('aria-selected') || '',
      expanded: node.getAttribute('aria-expanded') || '',
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  }));
}

async function findControlIndex(page, descriptor) {
  return page.locator(SELECTOR).evaluateAll((nodes, expected) => {
    let best = { index: -1, score: -1 };
    nodes.forEach((node, index) => {
      const actual = {
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') || '',
        id: node.id || '',
        testid: node.getAttribute('data-testid') || '',
        aria: node.getAttribute('aria-label') || '',
        title: node.getAttribute('title') || '',
        href: node.getAttribute('href') || '',
        type: node.getAttribute('type') || '',
        text: (node.innerText || node.textContent || node.getAttribute('value') || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      };
      let score = 0;
      if (expected.testid && actual.testid === expected.testid) score += 100;
      if (expected.id && actual.id === expected.id) score += 90;
      if (actual.tag === expected.tag) score += 2;
      if (actual.role === expected.role) score += 1;
      if (actual.type === expected.type) score += 1;
      if (expected.text && actual.text === expected.text) score += 20;
      if (expected.aria && actual.aria === expected.aria) score += 20;
      if (expected.title && actual.title === expected.title) score += 8;
      if (expected.href && actual.href === expected.href) score += 10;
      if (score > best.score) best = { index, score };
    });
    return best.score >= 20 ? best.index : -1;
  }, descriptor);
}

async function snapshot(page) {
  const value = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')]
      .filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 1 && rect.height > 1; })
      .map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1800));
    const active = [...document.querySelectorAll('[aria-selected="true"], [aria-current], [aria-pressed="true"], .active, [data-state="active"]')]
      .map((node) => (node.innerText || node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean).slice(0, 100);
    const offscreen = [...document.querySelectorAll('body *')]
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 1 && rect.height > 1 && (rect.right > innerWidth + 1 || rect.left < -1))
      .slice(0, 50)
      .map(({ node, rect }) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        className: String(node.className || '').slice(0, 180),
        text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width),
      }));
    return {
      title: document.title,
      bodyText,
      dialogs,
      active,
      overflow: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
      offscreen,
    };
  });
  return { ...value, url: page.url(), signature: hash(JSON.stringify({ url: page.url(), body: value.bodyText.slice(0, 20000), dialogs: value.dialogs, active: value.active })) };
}

async function capture(clickPath, sequence) {
  const session = await createSession();
  const before = await snapshot(session.page);
  const clickResults = [];
  for (const descriptor of clickPath) {
    const index = await findControlIndex(session.page, descriptor);
    if (index < 0) {
      clickResults.push({ descriptor, status: 'not-found' });
      break;
    }
    const locator = session.page.locator(SELECTOR).nth(index);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    const pageCount = session.context.pages().length;
    try {
      await locator.click({ timeout: 4000 });
      clickResults.push({ descriptor, status: 'clicked' });
    } catch (error) {
      try {
        await locator.click({ timeout: 1500, force: true });
        clickResults.push({ descriptor, status: 'force-clicked', firstError: error.message });
      } catch (forceError) {
        clickResults.push({ descriptor, status: 'click-error', error: forceError.message });
        break;
      }
    }
    await wait(400);
    const pages = session.context.pages();
    if (pages.length > pageCount) session.page = pages.at(-1);
    await session.page.waitForLoadState('domcontentloaded', { timeout: 3500 }).catch(() => {});
  }
  const after = await snapshot(session.page);
  const visibleControls = (await collectControls(session.page)).filter((item) => item.visible);
  const last = clickPath.at(-1);
  const label = last ? (last.text || last.aria || last.title || last.href || last.tag) : 'initial';
  const file = `${String(sequence).padStart(3, '0')}-${safe(label)}-${after.signature}.png`;
  await session.page.screenshot({ path: path.join(OUT_DIR, 'screenshots', file), fullPage: false });
  await session.context.close();
  const action = {
    clickPath,
    clickResults,
    before,
    after,
    visibleControls,
    screenshot: `screenshots/${file}`,
    changed: before.signature !== after.signature,
  };
  report.actions.push(action);
  for (const item of visibleControls) report.discoveredControls[keyOf(item)] ??= { descriptor: item, firstSeenAfter: label };
  await persist();
  return action;
}

let sequence = 0;
const initial = await capture([], sequence++);
report.initialControls = initial.visibleControls;
await persist();

const initialEnabled = initial.visibleControls.filter((item) => !item.disabled);
const firstLevel = [];
for (const item of initialEnabled) firstLevel.push(await capture([item], sequence++));

const initialKeys = new Set(initial.visibleControls.map(keyOf));
const second = [];
const seenSecond = new Set();
for (const action of firstLevel) {
  const parent = action.clickPath[0];
  for (const child of action.visibleControls) {
    const key = keyOf(child);
    if (child.disabled || initialKeys.has(key) || seenSecond.has(key)) continue;
    seenSecond.add(key);
    second.push({ parent, child });
  }
}
for (const { parent, child } of second.slice(0, MAX_SECOND_LEVEL)) await capture([parent, child], sequence++);

report.complete = true;
report.finishedAt = new Date().toISOString();
report.initialEnabledClicked = initialEnabled.length;
report.secondLevelClicked = Math.min(second.length, MAX_SECOND_LEVEL);
await persist();
console.log(`Focused audit complete: ${report.actions.length} captured actions, ${Object.keys(report.discoveredControls).length} unique controls.`);
await browser.close();
