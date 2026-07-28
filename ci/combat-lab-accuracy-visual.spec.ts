import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const evidenceDir = 'artifacts/combat-lab-accuracy-visual';

test('Combat Lab shows honest accuracy controls and keeps forced fire contact-bound', async ({ page }) => {
  mkdirSync(evidenceDir, { recursive: true });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const response = await page.goto('/combat-lab.html', { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 200).toBeLessThan(400);
  await expect(page.getByRole('region', { name: 'Испытательный полигон' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  const controls = page.locator('.combat-lab-accuracy-controls');
  const diagnostics = page.locator('.combat-lab-diagnostics');
  const journal = page.locator('.combat-lab-journal');
  await expect(controls).toBeVisible();

  const expectedLabels = [
    'Уровень разброса',
    'Время прицеливания',
    'Порог прицеливания',
    'Навык стрельбы',
    'Владение классом оружия',
    'Порог восприятия',
    'Уровень случайности',
  ];
  for (const label of expectedLabels) {
    await expect(controls.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(controls.locator('input[type="range"]')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Принудительная стрельба', exact: true })).toBeVisible();

  const controlsBox = await controls.boundingBox();
  expect(controlsBox, 'Accuracy controls need measurable browser geometry.').not.toBeNull();
  if (controlsBox) {
    const viewport = page.viewportSize();
    expect(controlsBox.x).toBeGreaterThanOrEqual(0);
    expect(controlsBox.width).toBeGreaterThan(250);
    if (viewport) expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.screenshot({ path: `${evidenceDir}/01-combat-lab-initial-layout.png`, fullPage: true });
  await controls.screenshot({ path: `${evidenceDir}/02-accuracy-controls-production-defaults.png` });

  const initialDiagnostics = await readDiagnostics(diagnostics);
  expect(initialDiagnostics?.accuracyLab?.contact).toMatchObject({
    available: false,
    reason: 'production_contact_missing',
  });

  await page.getByRole('button', { name: 'Принудительная стрельба', exact: true }).click();
  await expect(journal.locator('.combat-lab-journal-entry').first()).toContainText('combat_lab_target_contact_missing');
  const forcedWithoutContact = await journal.locator('.combat-lab-journal-entry').first().innerText();
  await page.getByRole('tab', { name: 'Журнал', exact: true }).click();
  await page.screenshot({ path: `${evidenceDir}/03-force-fire-does-not-cheat.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Стенд', exact: true }).click();

  await setSlider(page, 'Уровень разброса', '2.5');
  await setSlider(page, 'Время прицеливания', '3.2');
  await setSlider(page, 'Порог прицеливания', '72');
  await setSlider(page, 'Навык стрельбы', '65');
  await setSlider(page, 'Владение классом оружия', '90');
  await setSlider(page, 'Порог восприятия', '88');
  await setSlider(page, 'Уровень случайности', '40');

  await expect.poll(async () => (await readDiagnostics(diagnostics))?.accuracyLab?.requested).toMatchObject({
    dispersionMultiplier: 2.5,
    aimTimeSeconds: 3.2,
    physicalAimThreshold: 0.72,
    shootingSkill: 0.65,
    weaponProficiency: 'specialist',
    perceptionThreshold: 0.88,
    randomnessMultiplier: 0.4,
  });
  const adjustedDiagnostics = await readDiagnostics(diagnostics);
  await controls.screenshot({ path: `${evidenceDir}/04-accuracy-controls-adjusted.png` });
  await page.screenshot({ path: `${evidenceDir}/05-adjusted-layout-and-controls.png`, fullPage: true });

  await page.getByRole('button', { name: 'Сбросить параметры', exact: true }).click();
  await expect.poll(async () => (await readDiagnostics(diagnostics))?.accuracyLab?.requested).toMatchObject({
    dispersionMultiplier: 1,
    physicalAimThreshold: 0.5,
    perceptionThreshold: 0.5,
    randomnessMultiplier: 1,
  });

  await page.getByRole('button', { name: '×10', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  let contactQuality: number | null = null;
  try {
    await expect.poll(async () => {
      const value = (await readDiagnostics(diagnostics))?.accuracyLab?.contact?.quality;
      contactQuality = typeof value === 'number' ? value : null;
      return contactQuality !== null;
    }, { timeout: 12_000 }).toBe(true);
  } finally {
    const pause = page.getByRole('button', { name: 'Пауза', exact: true });
    if (await pause.isVisible().catch(() => false)) await pause.click();
  }

  let forcedWithContact: string | null = null;
  if (contactQuality !== null) {
    await setSlider(page, 'Порог восприятия', '100');
    await page.getByRole('button', { name: 'Принудительная стрельба', exact: true }).click();
    const acceptedEntry = journal.locator('.combat-lab-journal-entry').filter({ hasText: 'Принято:' }).first();
    await expect(acceptedEntry).toContainText('Принято:');
    forcedWithContact = await acceptedEntry.innerText();
    await page.getByRole('tab', { name: 'Журнал', exact: true }).click();
    await page.screenshot({ path: `${evidenceDir}/06-force-fire-with-real-contact.png`, fullPage: true });
  }

  expect(pageErrors).toEqual([]);
  writeFileSync(`${evidenceDir}/evidence.json`, JSON.stringify({
    expectedProductSha: process.env.EXPECTED_PRODUCT_SHA ?? null,
    route: '/combat-lab.html',
    viewport: { width: 1600, height: 1100 },
    visibleSliderCount: 7,
    labels: expectedLabels,
    forcedWithoutContact,
    adjustedRequestedValues: adjustedDiagnostics?.accuracyLab?.requested ?? null,
    contactQuality,
    forcedWithContact,
    pageErrors,
    consoleErrors,
    screenshots: [
      '01-combat-lab-initial-layout.png',
      '02-accuracy-controls-production-defaults.png',
      '03-force-fire-does-not-cheat.png',
      '04-accuracy-controls-adjusted.png',
      '05-adjusted-layout-and-controls.png',
      ...(forcedWithContact ? ['06-force-fire-with-real-contact.png'] : []),
    ],
  }, null, 2));
});

async function setSlider(page: Page, label: string, value: string): Promise<void> {
  const row = page.locator('.combat-lab-slider').filter({ hasText: label }).first();
  await expect(row).toBeVisible();
  const number = row.locator('input[type="number"]');
  await number.fill(value);
  await expect(number).toHaveValue(value);
  await expect(row.locator('output')).not.toHaveText('');
}

async function readDiagnostics(locator: Locator): Promise<any> {
  const text = await locator.textContent();
  return JSON.parse(text || '{}');
}
