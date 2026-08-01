import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT_DIR = process.env.OUT_DIR ?? 'artifacts/ux-audit';
const routes = [
  { key: 'game', url: '/index.html', maxStates: 70 },
  { key: 'combat-lab', url: '/combat-lab.html', maxStates: 140 },
  { key: 'ai-editor', url: '/ai-node-editor.html', maxStates: 90 },
];
const viewports = {
  wide: { width: 1920, height: 1080 },
  standard: { width: 1440, height: 900 },
  narrow: { width: 1100, height: 760 },
};
const interactiveSelector = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  'summary',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select',
].join(',');

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(path.join(OUT_DIR, 'screenshots'), { recursive: true });
await fs.mkdir(path.join(OUT_DIR, 'dom'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  routes: {},
  errors: [],
  viewportChecks: [],
};

const safe = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70) || 'unnamed';
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function preparePage(context, routeKey, localErrors) {
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      localErrors.push({ type: 'console.error', routeKey, url: page.url(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    localErrors.push({ type: 'pageerror', routeKey, url: page.url(), text: error.message, stack: error.stack });
  });
  page.on('dialog', async (dialog) => {
    localErrors.push({ type: 'dialog', routeKey, url: page.url(), dialogType: dialog.type(), text: dialog.message() });
    await dialog.accept().catch(() => {});
  });
  return page;
}

async function collectInteractions(page) {
  return page.locator(interactiveSelector).evaluateAll((nodes) => nodes.map((node, index) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const text = (node.innerText || node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('value') || '')
      .replace(/\s+/g, ' ')
      .trim();
    const visible = rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    const disabled = Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true');
    return {
      index,
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || '',
      id: node.id || '',
      testid: node.getAttribute('data-testid') || '',
      aria: node.getAttribute('aria-label') || '',
      title: node.getAttribute('title') || '',
      name: node.getAttribute('name') || '',
      type: node.getAttribute('type') || '',
      href: node.getAttribute('href') || '',
      text,
      visible,
      disabled,
      checked: 'checked' in node ? Boolean(node.checked) : null,
      selected: node.getAttribute('aria-selected') || '',
      expanded: node.getAttribute('aria-expanded') || '',
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  }));
}

async function stateSnapshot(page) {
  const data = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')]
      .filter((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })
      .map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600));
    const active = [...document.querySelectorAll('[aria-selected="true"], [aria-current], .active, [data-state="active"]')]
      .map((node) => (node.innerText || node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40);
    const overflow = {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
    };
    const overflowing = [...document.querySelectorAll('body *')]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { node, rect };
      })
      .filter(({ rect }) => rect.width > 1 && rect.height > 1 && (rect.right > window.innerWidth + 1 || rect.left < -1))
      .slice(0, 30)
      .map(({ node, rect }) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        className: String(node.className || '').slice(0, 160),
        text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        rect: { x: Math.round(rect.x), width: Math.round(rect.width), right: Math.round(rect.right) },
      }));
    return { bodyText, dialogs, active, overflow, overflowing, title: document.title };
  });
  const signaturePayload = JSON.stringify({
    url: page.url().replace(/[?#].*$/, ''),
    title: data.title,
    body: data.bodyText.slice(0, 16000),
    dialogs: data.dialogs,
    active: data.active,
  });
  return { ...data, url: page.url(), signature: hash(signaturePayload) };
}

async function findDescriptor(page, descriptor) {
  let locator;
  if (descriptor.testid) locator = page.locator(`[data-testid="${CSS.escape(descriptor.testid)}"]`);
  else if (descriptor.id) locator = page.locator(`#${CSS.escape(descriptor.id)}`);
  else if (descriptor.aria) locator = page.locator(interactiveSelector).filter({ has: page.locator(`:scope[aria-label="${descriptor.aria.replace(/"/g, '\\"')}"]`) });

  if (locator && await locator.count()) return locator.first();

  const candidates = page.locator(interactiveSelector);
  const count = await candidates.count();
  const matches = [];
  for (let i = 0; i < count; i += 1) {
    const item = candidates.nth(i);
    const meta = await item.evaluate((node) => ({
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || '',
      aria: node.getAttribute('aria-label') || '',
      title: node.getAttribute('title') || '',
      href: node.getAttribute('href') || '',
      text: (node.innerText || node.textContent || node.getAttribute('value') || '').replace(/\s+/g, ' ').trim(),
    })).catch(() => null);
    if (!meta) continue;
    const score = [
      meta.tag === descriptor.tag ? 2 : 0,
      meta.role === descriptor.role ? 1 : 0,
      descriptor.text && meta.text === descriptor.text ? 5 : 0,
      descriptor.aria && meta.aria === descriptor.aria ? 5 : 0,
      descriptor.title && meta.title === descriptor.title ? 3 : 0,
      descriptor.href && meta.href === descriptor.href ? 4 : 0,
    ].reduce((a, b) => a + b, 0);
    if (score >= 5) matches.push({ i, score });
  }
  matches.sort((a, b) => b.score - a.score || a.i - b.i);
  if (matches.length) return candidates.nth(matches[0].i);
  if (descriptor.index < count) return candidates.nth(descriptor.index);
  return null;
}

async function openPath(route, viewport, clickPath, routeKey) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  const localErrors = [];
  let page = await preparePage(context, routeKey, localErrors);
  const clickResults = [];
  try {
    await page.goto(new URL(route, BASE_URL).href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await delay(700);
    for (const descriptor of clickPath) {
      const locator = await findDescriptor(page, descriptor);
      if (!locator) {
        clickResults.push({ descriptor, status: 'not-found' });
        break;
      }
      const beforePages = context.pages().length;
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click({ timeout: 7000 }).catch(async (error) => {
        clickResults.push({ descriptor, status: 'click-error', error: error.message });
        await locator.click({ timeout: 3000, force: true }).catch(() => {});
      });
      await delay(800);
      const pages = context.pages();
      if (pages.length > beforePages) {
        page = pages.at(-1);
        page.on('console', (message) => {
          if (message.type() === 'error') localErrors.push({ type: 'console.error', routeKey, url: page.url(), text: message.text() });
        });
        page.on('pageerror', (error) => localErrors.push({ type: 'pageerror', routeKey, url: page.url(), text: error.message }));
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      clickResults.push({ descriptor, status: 'clicked', resultingUrl: page.url() });
    }
    const snapshot = await stateSnapshot(page);
    const interactions = await collectInteractions(page);
    return { context, page, snapshot, interactions, clickResults, localErrors };
  } catch (error) {
    localErrors.push({ type: 'runner-error', routeKey, route, text: error.message, stack: error.stack });
    return { context, page, snapshot: null, interactions: [], clickResults, localErrors };
  }
}

function descriptorKey(item) {
  return JSON.stringify([item.tag, item.role, item.id, item.testid, item.aria, item.title, item.href, item.text]);
}

async function saveState(routeKey, viewportName, sequence, opened, clickPath) {
  if (!opened.snapshot) return null;
  const last = clickPath.at(-1);
  const label = last ? (last.text || last.aria || last.title || last.href || last.tag) : 'start';
  const stem = `${routeKey}_${viewportName}_${String(sequence).padStart(3, '0')}_${safe(label)}_${opened.snapshot.signature}`;
  await opened.page.screenshot({ path: path.join(OUT_DIR, 'screenshots', `${stem}.png`), fullPage: false });
  await fs.writeFile(path.join(OUT_DIR, 'dom', `${stem}.html`), await opened.page.content(), 'utf8');
  return stem;
}

for (const routeConfig of routes) {
  const routeReport = {
    route: routeConfig.url,
    states: [],
    discoveredControls: {},
    clickedControls: {},
    unresolvedControls: [],
  };
  report.routes[routeConfig.key] = routeReport;

  const queue = [{ path: [], depth: 0 }];
  const queuedPaths = new Set(['root']);
  const seenStates = new Set();
  let sequence = 0;

  while (queue.length && routeReport.states.length < routeConfig.maxStates) {
    const task = queue.shift();
    const opened = await openPath(routeConfig.url, viewports.standard, task.path, routeConfig.key);
    report.errors.push(...opened.localErrors);
    if (!opened.snapshot) {
      await opened.context.close();
      continue;
    }

    const stateAlreadySeen = seenStates.has(opened.snapshot.signature);
    if (!stateAlreadySeen) seenStates.add(opened.snapshot.signature);
    const stem = await saveState(routeConfig.key, '1440x900', sequence++, opened, task.path);
    const stateRecord = {
      signature: opened.snapshot.signature,
      screenshot: stem ? `screenshots/${stem}.png` : null,
      url: opened.snapshot.url,
      title: opened.snapshot.title,
      path: task.path,
      depth: task.depth,
      bodyText: opened.snapshot.bodyText.slice(0, 6000),
      dialogs: opened.snapshot.dialogs,
      active: opened.snapshot.active,
      overflow: opened.snapshot.overflow,
      overflowing: opened.snapshot.overflowing,
      interactions: opened.interactions,
      clickResults: opened.clickResults,
      stateAlreadySeen,
    };
    routeReport.states.push(stateRecord);

    for (const item of opened.interactions) {
      if (!item.visible) continue;
      const key = descriptorKey(item);
      routeReport.discoveredControls[key] ??= { descriptor: item, states: [] };
      routeReport.discoveredControls[key].states.push(opened.snapshot.signature);
    }
    for (const result of opened.clickResults) {
      const key = descriptorKey(result.descriptor);
      routeReport.clickedControls[key] ??= [];
      routeReport.clickedControls[key].push({ status: result.status, resultingUrl: result.resultingUrl || '', state: opened.snapshot.signature });
    }

    if (!stateAlreadySeen && task.depth < 3) {
      const visibleItems = opened.interactions.filter((item) => item.visible && !item.disabled);
      for (const item of visibleItems) {
        if (item.tag === 'a' && item.href && /^(mailto:|tel:|javascript:)/i.test(item.href)) continue;
        const nextPath = [...task.path, item];
        const pathKey = nextPath.map(descriptorKey).join('>');
        if (!queuedPaths.has(pathKey)) {
          queuedPaths.add(pathKey);
          queue.push({ path: nextPath, depth: task.depth + 1 });
        }
      }
    }
    await opened.context.close();
  }

  const clickedKeys = new Set(Object.keys(routeReport.clickedControls));
  routeReport.unresolvedControls = Object.entries(routeReport.discoveredControls)
    .filter(([key]) => !clickedKeys.has(key))
    .map(([, value]) => value);

  const candidateStates = routeReport.states.filter((state, index) => {
    if (index === 0) return true;
    return /(Симуляц|Редактир|Настройк|Программ|Серия|Метрик|Журнал|Graph|граф|бойц|профил|данн|каталог)/i.test(state.bodyText);
  });
  const uniqueCandidates = [];
  const candidateSignatures = new Set();
  for (const state of candidateStates) {
    if (!candidateSignatures.has(state.signature)) {
      candidateSignatures.add(state.signature);
      uniqueCandidates.push(state);
    }
  }

  for (const [viewportName, viewport] of [['1920x1080', viewports.wide], ['1100x760', viewports.narrow]]) {
    let viewportSequence = 0;
    for (const state of uniqueCandidates.slice(0, viewportName === '1100x760' ? 35 : 24)) {
      const opened = await openPath(routeConfig.url, viewport, state.path, routeConfig.key);
      report.errors.push(...opened.localErrors);
      const stem = await saveState(routeConfig.key, viewportName, viewportSequence++, opened, state.path);
      if (opened.snapshot) {
        report.viewportChecks.push({
          routeKey: routeConfig.key,
          viewport: viewportName,
          sourceState: state.signature,
          resultingState: opened.snapshot.signature,
          screenshot: stem ? `screenshots/${stem}.png` : null,
          url: opened.snapshot.url,
          bodyText: opened.snapshot.bodyText.slice(0, 2500),
          overflow: opened.snapshot.overflow,
          overflowing: opened.snapshot.overflowing,
        });
      }
      await opened.context.close();
    }
  }
}

await browser.close();

const summaryLines = [
  '# UX audit reconnaissance',
  '',
  `Generated: ${report.generatedAt}`,
  `Base URL: ${report.baseUrl}`,
  '',
];
for (const [routeKey, routeData] of Object.entries(report.routes)) {
  summaryLines.push(`## ${routeKey}`);
  summaryLines.push(`- Route: ${routeData.route}`);
  summaryLines.push(`- Captured states: ${routeData.states.length}`);
  summaryLines.push(`- Visible controls discovered: ${Object.keys(routeData.discoveredControls).length}`);
  summaryLines.push(`- Controls clicked: ${Object.keys(routeData.clickedControls).length}`);
  summaryLines.push(`- Unresolved controls: ${routeData.unresolvedControls.length}`);
  summaryLines.push('');
}
summaryLines.push('## Errors');
summaryLines.push(`- Total captured events: ${report.errors.length}`);
for (const error of report.errors.slice(0, 100)) {
  summaryLines.push(`- ${error.type}: ${error.text || error.dialogType || 'unknown'} (${error.url || error.route || ''})`);
}

await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
await fs.writeFile(path.join(OUT_DIR, 'report.md'), summaryLines.join('\n'), 'utf8');
console.log(summaryLines.join('\n'));
