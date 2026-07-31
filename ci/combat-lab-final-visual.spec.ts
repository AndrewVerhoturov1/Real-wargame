import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetUrl = (process.env.TARGET_URL ?? '').replace(/\/$/, '');
const expectedSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';
const evidenceDir = path.resolve(process.cwd(), '../artifacts/vercel-e2e');
const evidencePath = path.join(evidenceDir, 'evidence.json');

interface Evidence {
  targetUrl: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string;
  productShaMatch: boolean | 'unproven';
  stage: string;
  milestones: string[];
  layout: Record<string, unknown>;
  program: Record<string, unknown>;
  parameters: Record<string, unknown>;
  batch: Record<string, unknown>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  ignoredServiceFailures: string[];
  failure?: string;
}

const evidence: Evidence = {
  targetUrl,
  canonicalFeatureBranch: canonicalBranch,
  expectedProductSha: expectedSha,
  observedProductSha: 'unavailable',
  productShaMatch: 'unproven',
  stage: 'started',
  milestones: [],
  layout: {},
  program: {},
  parameters: {},
  batch: {},
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  ignoredServiceFailures: [],
};

async function persist(stage?: string): Promise<void> {
  if (stage) evidence.stage = stage;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

async function screenshot(page: Page, file: string, stage: string): Promise<void> {
  const destination = path.join(evidenceDir, file);
  await page.screenshot({ path: destination, fullPage: false });
  evidence.milestones.push(file);
  await persist(stage);
}

test('final Combat Lab assembly works on exact deployed Preview', async ({ page }) => {
  test.skip(!targetUrl, 'TARGET_URL is required.');
  test.skip(!/^[0-9a-f]{40}$/i.test(expectedSha), 'EXPECTED_PRODUCT_SHA must be a full SHA.');

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const headers: Record<string, string> = {};
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
    headers['x-vercel-set-bypass-cookie'] = 'true';
    await page.setExtraHTTPHeaders(headers);
  }

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`;
    if (/vercel|analytics|insights/i.test(request.url())) evidence.ignoredServiceFailures.push(failure);
    else evidence.requestFailures.push(failure);
  });

  await persist();

  try {
    const sourceResponse = await page.request.get(`${targetUrl}/deployment-source.json`, { headers });
    expect(sourceResponse.status()).toBeLessThan(400);
    const source = await sourceResponse.json() as { sourceSha?: string; ref?: string };
    evidence.observedProductSha = source.sourceSha ?? 'unavailable';
    evidence.productShaMatch = evidence.observedProductSha === expectedSha;
    expect(evidence.observedProductSha).toBe(expectedSha);
    await persist('product-identity-read');

    const navigation = await page.goto(`${targetUrl}/combat-lab.html`, { waitUntil: 'networkidle' });
    expect(navigation?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator('#combat-lab-extension-root .combat-lab-workspace')).toBeVisible();
    await expect(page.locator('#app canvas')).toBeVisible();
    await expect(page.getByText('Испытательный полигон', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Vercel Authentication|Log in to Vercel/i)).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvasCount: document.querySelectorAll('canvas').length,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
    }));
    evidence.layout = layout;
    expect(layout.canvasCount).toBe(1);
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 2);
    await screenshot(page, '01-deployment-loaded.png', 'deployment-loaded');

    const programTab = page.getByRole('tab', { name: 'Программа', exact: true });
    await programTab.click();
    await expect(programTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Программа эксперимента' })).toBeVisible();
    const firstStepCard = page.locator('.combat-lab-step-card').first();
    await expect(firstStepCard).toBeVisible();
    const beforeAction = await firstStepCard.innerText();
    await screenshot(page, '02-program-tab.png', 'program-opened');

    await firstStepCard.getByRole('button', { name: 'Изменить действие' }).click();
    const dialog = page.getByRole('dialog', { name: 'Изменить действие' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Изменить действие' })).toBeVisible();
    await screenshot(page, '03-action-dialog.png', 'action-dialog-opened');

    await dialog.getByLabel('Тип действия').selectOption('wait-time');
    await expect(dialog).toContainText('Ждать');
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(firstStepCard).toContainText('Ждать');
    const afterAction = await firstStepCard.innerText();
    expect(afterAction).not.toBe(beforeAction);
    evidence.program = { beforeAction, afterAction, changed: true };
    await screenshot(page, '04-action-changed.png', 'action-changed');

    const parametersTab = page.getByRole('tab', { name: 'Параметры', exact: true });
    await parametersTab.click();
    await expect(parametersTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Параметры бойцов' })).toBeVisible();
    const parameterControl = page.locator('.combat-lab-quick-parameter-control').first();
    await expect(parameterControl).toBeVisible();
    const numberInput = parameterControl.locator('input[type="number"]');
    const initialValue = Number(await numberInput.inputValue());
    const bounds = await numberInput.evaluate((node: HTMLInputElement) => ({
      min: Number(node.min), max: Number(node.max), step: Number(node.step) || 1,
    }));
    const candidate = initialValue + bounds.step <= bounds.max
      ? initialValue + bounds.step
      : initialValue - bounds.step;
    expect(candidate).toBeGreaterThanOrEqual(bounds.min);
    expect(candidate).toBeLessThanOrEqual(bounds.max);
    await numberInput.fill(String(candidate));
    await expect(parameterControl).toHaveClass(/is-dirty/);
    const apply = page.getByRole('button', { name: 'Применить', exact: true });
    await expect(apply).toBeEnabled();
    await screenshot(page, '05-parameter-dirty.png', 'parameter-dirty');

    await apply.click();
    await expect(apply).toBeDisabled();
    await expect(numberInput).toHaveValue(String(candidate));
    evidence.parameters = { initialValue, appliedValue: candidate, changed: candidate !== initialValue };
    await screenshot(page, '06-parameter-applied.png', 'parameter-applied');

    const batchTab = page.getByRole('tab', { name: 'Серия', exact: true });
    await batchTab.click();
    await expect(batchTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Серия прогонов' })).toBeVisible();
    const seedMode = page.getByLabel('Режим seed');
    const seedValue = page.getByLabel('Первый или фиксированный seed');
    await expect(seedMode).toBeVisible();
    await expect(seedValue).toBeVisible();
    evidence.batch = {
      seedMode: await seedMode.inputValue(),
      seedValue: await seedValue.inputValue(),
      hint: await page.locator('.combat-lab-batch-seed-hint').innerText(),
    };
    await screenshot(page, '07-batch-seeds.png', 'batch-seeds-verified');

    const sceneTab = page.getByRole('tab', { name: 'Сцена', exact: true });
    await sceneTab.click();
    await expect(sceneTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Начальная сцена' })).toBeVisible();
    await screenshot(page, '08-scene-unified-editor.png', 'scene-verified');

    await parametersTab.click();
    await expect(numberInput).toHaveValue(String(candidate));
    await page.waitForTimeout(2500);
    await expect(numberInput).toHaveValue(String(candidate));
    await screenshot(page, '09-parameter-persistence.png', 'persistence-verified');

    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    await persist('completed');
  } catch (error) {
    evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
    await persist('failed');
    throw error;
  }
});
