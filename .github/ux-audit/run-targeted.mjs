import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT_DIR = process.env.OUT_DIR ?? 'artifacts/ux-audit-targeted';
const ROUTE = '/combat-lab.html';
const SELECTOR = 'button, [role="button"], [role="tab"], summary, input[type="checkbox"], select';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
const safe = (value) => String(value).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '').slice(0, 72) || 'unnamed';

const targetPaths = [
  ...[
    'Отменить reload', 'Установить ДП-27', 'Снять ДП-27', 'Отменить',
    'Отменить transfer', 'Начать первую помощь', 'Отменить помощь',
  ].map((child) => ['Параметры', child]),
  ...[
    'Граф поведения Откроется в полноэкранном редакторе',
    'Профили маршрута Откроется поверх карты',
    'Тактические позиции Откроется поверх карты',
    'Данные бойца Откроется поверх карты',
    'Архетипы бойцов Откроется поверх карты',
    'Профили внимания Откроется поверх карты',
    'Профили восприятия Откроется поверх карты',
    'Профили движения Откроется поверх карты',
    'Вооружение Откроется поверх карты',
    'Ранения и подавление Откроется поверх карты',
    'Профили местности Откроется поверх карты',
    'Направленный рельеф Откроется поверх карты',
  ].map((child) => ['Настройка игры', child]),
  ['Метрики', 'Подробная диагностика'],
  ['Создать бойца', 'Закрыть'],
  ['Создать бойца', 'Сохранить'],
  ...[
    'Выбрать / двигать', 'Поставить предмет', 'Удалять кликом', 'Удалить выбранное',
    'Предмет', 'Боец', 'Угроза', 'Рельеф', 'Сцена',
    'Взять параметры выбранного', 'Применить к выбранному',
  ].map((child) => ['Редактирование', child]),
  ...['Сохранить сцену', 'Загрузить сцену', 'Отчёт производительности'].map((child) => ['Файл', child]),
  ...[
    'Сетка: выкл', 'Цифры высоты: выкл', 'Русский', 'Реальный рельеф: выкл',
    'Обзор и память: выкл', 'Приказ · план · маршрут: вкл', 'Линия фронта: вкл',
  ].map((child) => ['Вид', child]),
];

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(path.join(OUT_DIR, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), route: ROUTE, actions: [], errors: [], complete: false };

async function persist() {
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  const problems = report.actions.flatMap((action) => action.steps).filter((step) => step.status !== 'clicked');
  const lines = [
    '# Targeted remaining Combat Lab controls', '',
    `Complete: ${report.complete}`,
    `Captured paths: ${report.actions.length} / ${targetPaths.length}`,
    `Step problems: ${problems.length}`,
    `Browser events: ${report.errors.length}`,
    ...problems.map((step) => `- ${step.status}: ${step.label}`),
  ];
  await fs.writeFile(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
}

async function locate(page, label) {
  const index = await page.locator(SELECTOR).evaluateAll((nodes, wanted) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const candidates = nodes.map((node, index) => ({
      index,
      text: normalize(node.innerText || node.textContent || node.getAttribute('value') || node.getAttribute('aria-label')),
      aria: normalize(node.getAttribute('aria-label')),
      title: normalize(node.getAttribute('title')),
      rect: node.getBoundingClientRect(),
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    }));
    const exact = candidates.find((item) => !item.disabled && (item.text === wanted || item.aria === wanted || item.title === wanted));
    if (exact) return exact.index;
    const starts = candidates.find((item) => !item.disabled && (item.text.startsWith(wanted) || item.aria.startsWith(wanted)));
    if (starts) return starts.index;
    const contains = candidates.find((item) => !item.disabled && (item.text.includes(wanted) || item.aria.includes(wanted)));
    return contains?.index ?? -1;
  }, label);
  return index < 0 ? null : page.locator(SELECTOR).nth(index);
}

async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24000),
    dialogs: [...document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')]
      .filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 1 && rect.height > 1; })
      .map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2400)),
    overflow: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
  }));
}

for (let index = 0; index < targetPaths.length; index += 1) {
  const labels = targetPaths[index];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  let page = await context.newPage();
  const bind = (target) => {
    target.on('console', (message) => {
      if (message.type() === 'error') report.errors.push({ type: 'console.error', labelPath: labels, text: message.text() });
    });
    target.on('pageerror', (error) => report.errors.push({ type: 'pageerror', labelPath: labels, text: error.message }));
    target.on('dialog', async (dialog) => {
      report.errors.push({ type: 'dialog', labelPath: labels, dialogType: dialog.type(), text: dialog.message() });
      await dialog.accept().catch(() => {});
    });
  };
  bind(page);
  await page.goto(new URL(ROUTE, BASE_URL).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await wait(800);
  const before = await snapshot(page);
  const steps = [];
  for (const label of labels) {
    const target = await locate(page, label);
    if (!target) {
      steps.push({ label, status: 'not-found' });
      break;
    }
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const countBefore = context.pages().length;
    try {
      await target.click({ timeout: 4000 });
      steps.push({ label, status: 'clicked' });
    } catch (error) {
      steps.push({ label, status: 'click-error', error: error.message });
      break;
    }
    await wait(500);
    const pages = context.pages();
    if (pages.length > countBefore) {
      page = pages.at(-1);
      bind(page);
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    }
  }
  const after = await snapshot(page);
  const signature = hash(JSON.stringify(after));
  const file = `${String(index).padStart(3, '0')}-${safe(labels.join('--'))}-${signature}.png`;
  await page.screenshot({ path: path.join(OUT_DIR, 'screenshots', file), fullPage: false });
  report.actions.push({ labels, steps, before, after, changed: JSON.stringify(before) !== JSON.stringify(after), screenshot: `screenshots/${file}` });
  await context.close();
  await persist();
}

report.complete = true;
report.finishedAt = new Date().toISOString();
await persist();
console.log(`Targeted audit complete: ${report.actions.length} paths.`);
await browser.close();
