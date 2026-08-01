import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT_DIR = process.env.OUT_DIR ?? 'artifacts/ux-audit-fast';
const ROUTE = '/combat-lab.html';
const selector = 'button, a[href], [role="button"], [role="tab"], summary, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], select';
const viewport = { width: 1440, height: 900 };

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
};

const safe = (value) => String(value || 'unnamed')
  .replace(/\s+/g, '-')
  .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '')
  .slice(0, 72) || 'unnamed';
const digest = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function descriptorKey(item) {
  return JSON.stringify([item.tag, item.role, item.id, item.testid, item.aria, item.title, item.href, item.text, item.type]);
}

async function newPage() {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  let page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ type: 'console.error', url: page.url(), text: message.text() });
  });
  page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', url: page.url(), text: error.message }));
  page.on('dialog', async (dialog) => {
    report.errors.push({ type: 'dialog', url: page.url(), dialogType: dialog.type(), text: dialog.message() });
    await dialog.accept().catch(() => {});
  });
  await page.goto(new URL(ROUTE, BASE_URL).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await wait(1200);
  return { context, get page() { return page; }, set page(value) { page = value; } };
}

async function controls(page) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node, index) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const text = (node.innerText || node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('value') || '')
      .replace(/\s+/g, ' ')
      .trim();
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
      text,
      visible: rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0',
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      pressed: node.getAttribute('aria-pressed') || '',
      selected: node.getAttribute('aria-selected') || '',
      expanded: node.getAttribute('aria-expanded') || '',
    };
  }));
}

async function snapshot(page) {
  const state = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      })
      .map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1600));
    const active = [...document.querySelectorAll('[aria-selected="true"], [aria-current], [aria-pressed="true"], .active, [data-state="active"]')]
      .map((node) => (node.innerText || node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 80);
    const overflow = {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    };
    const offscreen = [...document.querySelectorAll('body *')]
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 1 && rect.height > 1 && (rect.right > innerWidth + 1 || rect.left < -1))
      .slice(0, 40)
      .map(({ node, rect }) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        className: String(node.className || '').slice(0, 180),
        text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        x: Math.round(rect.x),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }));
    return { title: document.title, bodyText, dialogs, active, overflow, offscreen };
  });
  return {
    ...state,
    url: page.url(),
    signature: digest(JSON.stringify({ url: page.url(), bodyText: state.bodyText.slice(0, 20000), dialogs: state.dialogs, active: state.active })),
  };
}

async function locate(page, descriptor) {
  if (descriptor.testid) {
    const candidate = page.locator(`[data-testid="${descriptor.testid.replace(/"/g, '\\"')}"]`);
    if (await candidate.count()) return candidate.first();
  }
  if (descriptor.id) {
    const candidate = page.locator(`#${descriptor.id.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`);
    if (await candidate.count()) return candidate.first();
  }
  const candidates = page.locator(selector);
  const count = await candidates.count();
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const meta = await candidates.nth(i).evaluate((node) => ({
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || '',
      aria: node.getAttribute('aria-label') || '',
      title: node.getAttribute('title') || '',
      href: node.getAttribute('href') || '',
      type: node.getAttribute('type') || '',
      text: (node.innerText || node.textContent || node.getAttribute('value') || '').replace(/\s+/g, ' ').trim(),
    })).catch(() => null);
    if (!meta) continue;
    let score = 0;
    if (meta.tag === descriptor.tag) score += 2;
    if (meta.role === descriptor.role) score += 1;
    if (meta.type === descriptor.type) score += 1;
    if (descriptor.text && meta.text === descriptor.text) score += 8;
    if (descriptor.aria && meta.aria === descriptor.aria) score += 8;
    if (descriptor.title && meta.title === descriptor.title) score += 5;
    if (descriptor.href && meta.href === descriptor.href) score += 6;
    if (!best || score > best.score) best = { index: i, score };
  }
  return best && best.score >= 7 ? candidates.nth(best.index) : null;
}

async function followPath(session, clickPath) {
  const clickResults = [];
  for (const descriptor of clickPath) {
    const target = await locate(session.page, descriptor);
    if (!target) {
      clickResults.push({ descriptor, status: 'not-found' });
      break;
    }
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const pagesBefore = session.context.pages().length;
    try {
      await target.click({ timeout: 5000 });
      clickResults.push({ descriptor, status: 'clicked' });
    } catch (error) {
      try {
        await target.click({ timeout: 2500, force: true });
        clickResults.push({ descriptor, status: 'force-clicked', firstError: error.message });
      } catch (forceError) {
        clickResults.push({ descriptor, status: 'click-error', error: forceError.message });
        break;
      }
    }
    await wait(650);
    const pages = session.context.pages();
    if (pages.length > pagesBefore) session.page = pages.at(-1);
    await session.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }
  return clickResults;
}

async function captureAction(clickPath, number) {
  const session = await newPage();
  const before = await snapshot(session.page);
  const clickResults = await followPath(session, clickPath);
  const after = await snapshot(session.page);
  const visibleControls = (await controls(session.page)).filter((item) => item.visible);
  const last = clickPath.at(-1);
  const label = last ? (last.text || last.aria || last.title || last.href || last.tag) : 'initial';
  const stem = `${String(number).padStart(3, '0')}-${safe(label)}-${after.signature}`;
  await session.page.screenshot({ path: path.join(OUT_DIR, 'screenshots', `${stem}.png`), fullPage: false });
  await session.context.close();
  return {
    clickPath,
    clickResults,
    before,
    after,
    screenshot: `screenshots/${stem}.png`,
    visibleControls,
    changed: before.signature !== after.signature,
  };
}

const initial = await captureAction([], 0);
report.initialControls = initial.visibleControls;
report.actions.push(initial);
for (const item of initial.visibleControls) {
  report.discoveredControls[descriptorKey(item)] = { descriptor: item, source: 'initial' };
}

const initialClickable = initial.visibleControls.filter((item) => !item.disabled);
let sequence = 1;
const firstLevelResults = [];
for (const item of initialClickable) {
  const result = await captureAction([item], sequence++);
  report.actions.push(result);
  firstLevelResults.push(result);
  for (const revealed of result.visibleControls) {
    report.discoveredControls[descriptorKey(revealed)] ??= { descriptor: revealed, source: item.text || item.aria || item.id || item.tag };
  }
}

const initialKeys = new Set(initial.visibleControls.map(descriptorKey));
const secondLevelCandidates = [];
const secondLevelSeen = new Set();
for (const result of firstLevelResults) {
  const parent = result.clickPath[0];
  for (const child of result.visibleControls) {
    const key = descriptorKey(child);
    if (child.disabled || initialKeys.has(key) || secondLevelSeen.has(key)) continue;
    secondLevelSeen.add(key);
    secondLevelCandidates.push({ parent, child });
  }
}

for (const { parent, child } of secondLevelCandidates.slice(0, 120)) {
  const result = await captureAction([parent, child], sequence++);
  report.actions.push(result);
  for (const revealed of result.visibleControls) {
    report.discoveredControls[descriptorKey(revealed)] ??= { descriptor: revealed, source: `${parent.text || parent.id} > ${child.text || child.id}` };
  }
}

const changed = report.actions.filter((action) => action.changed).length;
const clickErrors = report.actions.flatMap((action) => action.clickResults).filter((result) => !['clicked', 'force-clicked'].includes(result.status));
const summary = [
  '# Focused Combat Lab UX audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Initial visible controls: ${report.initialControls.length}`,
  `Initial enabled controls clicked: ${initialClickable.length}`,
  `New second-level controls clicked: ${Math.min(secondLevelCandidates.length, 120)}`,
  `Total captured actions: ${report.actions.length}`,
  `Actions that changed visible state: ${changed}`,
  `Unique visible controls discovered: ${Object.keys(report.discoveredControls).length}`,
  `Click errors/not-found: ${clickErrors.length}`,
  `Console/page errors/dialogs: ${report.errors.length}`,
  '',
  '## Click problems',
  ...clickErrors.slice(0, 100).map((item) => `- ${item.status}: ${item.descriptor?.text || item.descriptor?.aria || item.descriptor?.id || item.descriptor?.tag}`),
  '',
  '## Browser events',
  ...report.errors.slice(0, 100).map((item) => `- ${item.type}: ${item.text}`),
];

await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(path.join(OUT_DIR, 'report.md'), summary.join('\n'), 'utf8');
console.log(summary.join('\n'));
await browser.close();
