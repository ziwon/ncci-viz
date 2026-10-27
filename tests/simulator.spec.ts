import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const speed of [0.25, 0.5, 1, 1.5, 2, 4]) {
  test(`packets finish within each round at ${speed}x and the final round completes`, async ({ page }) => {
    await page.clock.install();
    await page.goto('/?op=AllReduce&alg=Ring&n=2');
    await page.getByLabel('Playback speed').selectOption(String(speed));
    await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
    const roundMs = 1100 / speed;
    await page.clock.runFor(Math.ceil(roundMs));
    await expect(page.locator('.step-indicator')).toHaveText('Step 1 of 2');
    const packet = page.locator('animateMotion').first();
    await expect(packet).toHaveAttribute('dur', `${roundMs * 0.8}ms`);
    await expect(packet).toHaveAttribute('repeatCount', '1');
    await expect(packet).toHaveAttribute('fill', 'freeze');
    await page.clock.runFor(Math.ceil(roundMs));
    await expect(page.locator('.step-indicator')).toHaveText('Step 2 of 2');
    await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toBeVisible();
    await expect(page.locator('animateMotion')).toHaveCount(2);
    await page.clock.runFor(Math.ceil(roundMs));
    await expect(page.getByRole('button', { name: 'Replay simulation', exact: true })).toBeVisible();
    await expect(page.locator('animateMotion')).toHaveCount(0);
    await expect(page.locator('.buffer-state.ready')).toHaveCount(2);
  });
}

test('pause on final step preserves the result and reset returns to initial buffers', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?n=2');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.clock.runFor(1100);
  await expect(page.locator('.step-indicator')).toHaveText('Step 1 of 2');
  await page.clock.runFor(1100);
  await expect(page.locator('.step-indicator')).toHaveText('Step 2 of 2');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(page.locator('.step-indicator')).toHaveText('Step 2 of 2');
  await expect(page.locator('animateMotion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset simulation (R)', exact: true }).click();
  await expect(page.locator('.step-indicator')).toHaveText('Step 0 of 2');
  await expect(page.locator('.buffer-state.ready')).toHaveCount(0);
});

test('reduced motion preserves playback without moving particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/?n=2');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.clock.runFor(1100);
  await expect(page.locator('.step-indicator')).toHaveText('Step 1 of 2');
  await expect(page.locator('animateMotion')).toHaveCount(0);
  await expect(page.locator('.active-edge')).toHaveCount(2);
});

for (const operation of ['Gather', 'Scatter']) {
  test(`${operation} exports undefined bus bandwidth as null`, async ({ page }) => {
    await page.goto(`/?op=${operation}&alg=Naive&n=4`);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export trace', exact: true }).click();
    const download = await downloadEvent;
    const trace = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(trace.config.operation).toBe(operation);
    expect(trace.metrics.busbw).toBeNull();
    expect(trace.metrics.factor).toBeNull();
    await page.getByRole('button', { name: 'Compare algorithms', exact: true }).click();
    await expect(page.locator('.comparison-table')).toContainText('Not defined');
  });
}

test('mobile navigation opens operations without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Scatter Distribute from root', exact: true }).click();
  await expect(page.locator('.operation-title h2')).toHaveText('Scatter');
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
