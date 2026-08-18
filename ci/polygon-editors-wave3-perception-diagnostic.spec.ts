import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = process.env.TARGET_URL!;
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA!;
const artifactRoot = path.resolve(process.cwd(), 'artifacts/polygon-editors-visual-audit');
fs.mkdirSync(artifactRoot, { recursive: true });

test('records perception flow geometry without changing product state', async ({ page }) => {
  const identity = await (await page.request.get(new URL('/deployment-source.json', targetUrl).toString())).json() as { sourceSha?: string };
  expect(identity.sourceSha).toBe(expectedProductSha);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}' });
  await page.locator('.polygon-shell-top-button--editors').click();
  const portal = page.locator('.polygon-shell-editors-portal');
  await expect(portal).toBeVisible();
  await portal.locator('.combat-lab-game-editor-item[data-game-editor-id="perceptionProfiles"]').click();
  const host = portal.locator('.polygon-global-editor--perceptionProfiles');
  await expect(host.locator('.polygon-perception-flow')).toBeVisible();

  const geometry = await host.locator('.polygon-perception-flow').evaluate((flow) => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const value = (element as HTMLElement).getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    const style = (element: Element | null) => {
      if (!element) return null;
      const css = getComputedStyle(element as HTMLElement);
      return {
        display: css.display,
        position: css.position,
        width: css.width,
        minWidth: css.minWidth,
        maxWidth: css.maxWidth,
        height: css.height,
        minHeight: css.minHeight,
        padding: css.padding,
        margin: css.margin,
        gap: css.gap,
        flex: css.flex,
        flexWrap: css.flexWrap,
        justifyContent: css.justifyContent,
        alignItems: css.alignItems,
        gridColumn: css.gridColumn,
        whiteSpace: css.whiteSpace,
      };
    };
    return {
      flow: { rect: rect(flow), style: style(flow) },
      parent: { className: flow.parentElement?.className ?? null, rect: rect(flow.parentElement), style: style(flow.parentElement) },
      form: { rect: rect(flow.closest('.gameplay-tuning-editor-form-panel')), style: style(flow.closest('.gameplay-tuning-editor-form-panel')) },
      children: [...flow.children].map((child) => ({
        tag: child.tagName,
        text: child.textContent,
        rect: rect(child),
        style: style(child),
      })),
    };
  });

  fs.writeFileSync(path.join(artifactRoot, 'wave3-perception-flow-diagnostic.json'), JSON.stringify(geometry, null, 2));
  await portal.screenshot({ path: path.join(artifactRoot, 'wave3-product-05-perception-profiles-diagnostic.png'), animations: 'disabled' });
});
