from pathlib import Path

path = Path('tests/performance-report-v6-browser.spec.ts')
text = path.read_text(encoding='utf-8')
old = """async function addMarkerThroughUi(page: Page, label: string): Promise<void> {
  page.once('dialog', async (dialog) => dialog.accept(label));
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-performance-marker=\"add\"]');
    if (!button) throw new Error('Performance marker control is missing.');
    button.click();
  });
  await page.waitForTimeout(250);
}
"""
new = """async function addMarkerThroughUi(page: Page, label: string): Promise<void> {
  await page.waitForFunction(() => Boolean(document.querySelector('[data-performance-marker=\"add\"]')));
  page.once('dialog', async (dialog) => dialog.accept(label));
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-performance-marker=\"add\"]');
    if (!button) throw new Error('Performance marker control disappeared before activation.');
    button.click();
  });
  await page.waitForTimeout(250);
}
"""
if new in text:
    raise SystemExit(0)
if text.count(old) != 1:
    raise SystemExit(f'expected one marker helper, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
