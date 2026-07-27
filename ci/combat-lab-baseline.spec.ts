import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const targetUrl = process.env.TARGET_URL ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const evidenceDir = 'artifacts/vercel-e2e';

test('capture Combat Lab baseline geometry, layout and sound path', async ({ page, context, request }) => {
  await mkdir(evidenceDir, { recursive: true });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) {
    await context.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    });
  }

  await page.addInitScript(() => {
    const scope = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
      __combatAudioProbe?: Record<string, unknown>;
    };
    const Original = scope.AudioContext ?? scope.webkitAudioContext;
    const probe = {
      contextsCreated: 0,
      resumeCalls: 0,
      oscillatorStarts: 0,
      bufferSourceStarts: 0,
      states: [] as string[],
      errors: [] as string[],
    };
    scope.__combatAudioProbe = probe;
    if (!Original) return;

    class ProbedAudioContext extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contextsCreated += 1;
        probe.states.push(this.state);
        this.addEventListener('statechange', () => probe.states.push(this.state));
      }

      override async resume(): Promise<void> {
        probe.resumeCalls += 1;
        try {
          await super.resume();
        } catch (error) {
          probe.errors.push(String(error));
          throw error;
        }
      }

      override createOscillator(): OscillatorNode {
        const node = super.createOscillator();
        const originalStart = node.start.bind(node);
        node.start = ((...args: Parameters<OscillatorNode['start']>) => {
          probe.oscillatorStarts += 1;
          return originalStart(...args);
        }) as OscillatorNode['start'];
        return node;
      }

      override createBufferSource(): AudioBufferSourceNode {
        const node = super.createBufferSource();
        const originalStart = node.start.bind(node);
        node.start = ((...args: Parameters<AudioBufferSourceNode['start']>) => {
          probe.bufferSourceStarts += 1;
          return originalStart(...args);
        }) as AudioBufferSourceNode['start'];
        return node;
      }
    }

    scope.AudioContext = ProbedAudioContext;
    scope.webkitAudioContext = ProbedAudioContext;
  });

  const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
  expect(response?.status() ?? 200).toBeLessThan(400);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await expect(page.locator('.combat-lab-dock')).toBeVisible();
  await page.waitForTimeout(1200);

  const sourceUrl = new URL('/deployment-source.json', targetUrl).toString();
  const sourceResponse = await request.get(sourceUrl, {
    headers: bypass ? {
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    } : undefined,
  });
  const source = sourceResponse.ok() ? await sourceResponse.json() : null;

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const initial = await measure(page);
  await page.screenshot({ path: `${evidenceDir}/01-both-panels-open-stand.png` });
  await page.locator('.simulation-unit-bar').screenshot({ path: `${evidenceDir}/02-bottom-bar-baseline.png` });

  await page.locator('[data-combat-lab-tab="metrics"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${evidenceDir}/03-metrics.png` });
  await page.locator('[data-combat-lab-tab="log"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${evidenceDir}/04-log.png` });
  await page.locator('[data-combat-lab-tab="stand"]').click();

  const openFire = page.getByRole('button', { name: 'Открыть огонь' });
  await expect(openFire).toBeVisible();
  await openFire.click();
  const pause = page.locator('.workspace-time-controls [data-action="pause"]');
  if ((await pause.textContent())?.includes('Продолжить')) await pause.click();
  await page.waitForTimeout(3200);
  if ((await pause.textContent())?.includes('Пауза')) await pause.click();
  await page.waitForTimeout(250);
  const audio = await page.evaluate(() => ({
    probe: (window as unknown as { __combatAudioProbe?: unknown }).__combatAudioProbe ?? null,
    journal: document.querySelector('.combat-lab-journal')?.textContent ?? '',
  }));
  await page.screenshot({ path: `${evidenceDir}/05-after-fire.png` });

  const leftToggle = page.locator('.combat-lab-dock-toggle');
  const rightToggle = page.locator('.simulation-sidebar [data-action="collapse"]');

  await leftToggle.click();
  await page.waitForTimeout(450);
  const leftHidden = await measure(page);
  await page.screenshot({ path: `${evidenceDir}/06-left-hidden.png` });

  await leftToggle.click();
  await page.waitForTimeout(350);
  await rightToggle.click();
  await page.waitForTimeout(450);
  const rightHidden = await measure(page);
  await page.screenshot({ path: `${evidenceDir}/07-right-hidden.png` });

  await leftToggle.click();
  await page.waitForTimeout(450);
  const bothHidden = await measure(page);
  await page.screenshot({ path: `${evidenceDir}/08-both-hidden.png` });

  await writeFile(`${evidenceDir}/evidence.json`, JSON.stringify({
    expectedProductSha,
    observedProductSha: source?.sourceSha ?? null,
    productShaMatch: source?.sourceSha === expectedProductSha,
    source,
    initial,
    leftHidden,
    rightHidden,
    bothHidden,
    audio,
    pageErrors,
    consoleErrors,
  }, null, 2));
});

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
      if (!a || !b) return 0;
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    };
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    const canvasRect = canvas?.getBoundingClientRect() ?? null;
    const camera = (window as unknown as { __realWargameCameraDebug?: { zoom?: number } }).__realWargameCameraDebug ?? null;
    const mode = rect('.workspace-mode-switch');
    const time = rect('.workspace-time-controls');
    const actions = rect('.workspace-top-actions');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyScroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      header: rect('.tactical-workspace-bar'),
      mode,
      time,
      actions,
      overlaps: {
        modeTime: overlap(mode, time),
        timeActions: overlap(time, actions),
      },
      leftDock: rect('#combat-lab-extension-root'),
      rightSidebar: rect('.simulation-sidebar'),
      bottomBar: rect('.simulation-unit-bar'),
      app: rect('#app'),
      canvas: canvas && canvasRect ? {
        cssWidth: canvasRect.width,
        cssHeight: canvasRect.height,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        pixelRatioX: canvas.width / Math.max(1, canvasRect.width),
        pixelRatioY: canvas.height / Math.max(1, canvasRect.height),
      } : null,
      camera,
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
}
