import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('numeric inputs retain valid state, convert units, and share odd GPU counts', async ({ page }) => {
  await page.goto('/');
  const gpu = page.getByRole('spinbutton', { name: 'GPU count', exact: true });
  await gpu.fill('3');
  await expect(page.locator('[data-rank]')).toHaveCount(3);
  await expect(page.locator('.configuration-note')).toContainText('Model padding adds 4 B');
  for (const invalid of ['', '0', '3.5', '17', '64']) {
    await gpu.fill(invalid);
    await expect(gpu).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-rank]')).toHaveCount(3);
  }
  await gpu.fill('5');
  const size = page.getByRole('spinbutton', { name: 'Tensor size', exact: true });
  await size.fill('12.5');
  await expect(size).toHaveAttribute('aria-invalid', 'false');
  await page.getByLabel('Tensor size unit', { exact: true }).selectOption('KiB');
  await expect(size).toHaveValue('12800');
  await size.fill('96');
  for (const invalid of ['', '-1', '0', '2000000000']) {
    await size.fill(invalid);
    await expect(size).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/size=0.09375/);
  }
  await size.fill('96');
  await page.reload();
  await expect(gpu).toHaveValue('5');
  await expect(size).toHaveValue('96');
  await expect(page.getByLabel('Tensor size unit', { exact: true })).toHaveValue('KiB');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trace', exact: true }).click();
  const download = await downloadEvent;
  const trace = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(trace.tensor.requestedBytes).toBe(98304);
  expect(trace.tensor.bytes).toBe(98320);
  expect(trace.tensor.chunkBytes).toBe(19664);
  expect(trace.frames[1].transfers[0].bytes).toBe(trace.tensor.chunkBytes);
});

for (const width of [1440, 390]) {
  test(`16 GPU transfers stay inside their scroll region at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?n=16&alg=Ring');
    await page.getByRole('button', { name: 'Go to step 30: All-gather', exact: true }).click();
    await page.getByRole('tab', { name: 'Transfer log', exact: false }).click();
    const rows = page.locator('.transfer-table tbody tr');
    await expect(rows).toHaveCount(16);
    await expect(page.locator('.transfer-toolbar')).toContainText('16 transfers · step 30');
    await page.getByLabel('Transfer log scope', { exact: true }).selectOption('history');
    await expect(rows).toHaveCount(480);
    const region = page.getByRole('region', { name: 'Transfer log rows', exact: true });
    const box = await region.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(400);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.locator('.transfer-table th').first()).toHaveCSS('position', 'sticky');
    await page.getByRole('button', { name: 'Go to step 1: Reduce-scatter', exact: true }).click();
    await expect(rows).toHaveCount(16);
    expect(await region.evaluate(element => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('odd rank tree layout keeps every rank inside the canvas and clamps root changes', async ({ page }) => {
  await page.goto('/?op=Broadcast&alg=Tree&n=5&root=4');
  await page.getByLabel('GPU count', { exact: true }).fill('3');
  await expect(page.getByLabel('Root rank', { exact: true })).toHaveValue('2');
  await expect(page.locator('.canvas-bottom-label')).toHaveText('root = 2 · depth = 1');
  const bounds = await page.locator('.topology-svg').evaluate(element => {
    const svg = element as SVGSVGElement;
    const view = svg.viewBox.baseVal;
    return Array.from(svg.querySelectorAll<SVGGElement>('[data-rank]')).every(node => {
      const translate = node.transform.baseVal.getItem(0).matrix;
      const rect = node.querySelector('rect')!;
      return translate.e >= 0 && translate.f >= 0 && translate.e + Number(rect.getAttribute('width')) <= view.width && translate.f + Number(rect.getAttribute('height')) <= view.height;
    });
  });
  expect(bounds).toBe(true);
  await page.getByRole('button', { name: 'Go to step 2: Broadcast', exact: true }).click();
  await expect(page.locator('.buffer-state.ready')).toHaveCount(3);
});
