import { expect, test } from '@playwright/test';

const header = '# size count type redop root time algbw busbw #wrong time algbw busbw #wrong\n# (B) (elements) (us) (GB/s) (GB/s) (us) (GB/s) (GB/s)';
const validRow = '4096 1024 float sum -1 35 0.12 0.20 0 33 0.12 0.22 0';
const confirmation = 'I confirm the measured collective and total rank count.';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare algorithms', exact: true }).click();
});

test('synthetic data requires confirmation, keeps placement separate, and reacts to model changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Load synthetic example', exact: true }).click();
  await expect(page.locator('.benchmark-demo')).toContainText('not hardware measurements');
  await expect(page.getByLabel('Measured collective', { exact: true })).toHaveValue('AllReduce');
  await expect(page.getByLabel('Total ranks', { exact: true })).toHaveValue('8');
  await expect(page.locator('.benchmark-table tbody tr')).toHaveCount(3);
  const first = page.locator('.benchmark-table tbody tr').first();
  await expect(first).toContainText('Unavailable');
  await page.getByRole('checkbox', { name: confirmation, exact: true }).check();
  await expect(first).toContainText('35.0 µs');
  await expect(first).toContainText('28.1 µs');
  await expect(first).toContainText('1.24×');
  await page.getByLabel('Buffer placement', { exact: true }).selectOption('in-place');
  await expect(first).toContainText('33.0 µs');
  await page.getByLabel('GPU count', { exact: true }).fill('4');
  await expect(first).toContainText('rank count does not match');
  await expect(page.locator('.benchmark-table tbody tr')).toHaveCount(3);
});

test('paste without metadata requires explicit context and keeps failed checks visible', async ({ page }) => {
  const failedRow = '1048576 262144 float sum -1 80 13.11 22.94 2 78 13.44 23.53 N/A';
  await page.getByLabel('NCCL-tests output', { exact: false }).fill(`${header}\n${validRow}\n${failedRow}`);
  await page.getByRole('button', { name: 'Import results', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: confirmation, exact: true })).toBeDisabled();
  await page.getByLabel('Measured collective', { exact: true }).selectOption('AllReduce');
  await page.getByLabel('Total ranks', { exact: true }).fill('8');
  await page.getByRole('checkbox', { name: confirmation, exact: true }).check();
  const rows = page.locator('.benchmark-table tbody tr');
  await expect(rows.first()).toContainText('Same collective');
  await expect(rows.nth(1)).toContainText('2 errors');
  await expect(rows.nth(1)).toContainText('failed its correctness check');
  await page.getByLabel('Buffer placement', { exact: true }).selectOption('in-place');
  await expect(rows.nth(1)).toContainText('Not checked');
});

test('file upload imports locally and rejects conflicting metadata', async ({ page }) => {
  await page.getByLabel('Upload NCCL-tests log', { exact: true }).setInputFiles({ name: 'run.log', mimeType: 'text/plain', buffer: Buffer.from(`./build/all_reduce_perf -g 8\n# Collective test starting: all_reduce_perf\n# ranks: 8\n${header}\n${validRow}`) });
  await expect(page.locator('.benchmark-source')).toContainText('run.log');
  await expect(page.locator('.benchmark-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: confirmation, exact: true })).toBeEnabled();
  await page.getByLabel('Total ranks', { exact: true }).fill('4');
  await expect(page.getByRole('checkbox', { name: confirmation, exact: true })).toBeDisabled();
  await expect(page.locator('.benchmark-error')).toContainText('log identifies 8 total ranks');
});

test('invalid units and multiple runs are reported instead of compared', async ({ page }) => {
  await page.getByLabel('NCCL-tests output', { exact: false }).fill(`${header.replaceAll('(us)', '(ms)')}\n${validRow}`);
  await page.getByRole('button', { name: 'Import results', exact: true }).click();
  await expect(page.locator('.benchmark-import-status')).toContainText('No measurements imported');
  await expect(page.locator('.benchmark-diagnostics')).toContainText('microseconds');
  await page.getByLabel('NCCL-tests output', { exact: false }).fill(`# Test (AllReduce)\n${header}\n${validRow}\n# Test (AllReduce)\n${header}\n${validRow}`);
  await page.getByRole('button', { name: 'Import results', exact: true }).click();
  await expect(page.locator('.benchmark-import-status')).toContainText('Comparison is blocked');
  await expect(page.getByRole('checkbox', { name: confirmation, exact: true })).toBeDisabled();
});

test('oversized files are rejected and clear removes imported state', async ({ page }) => {
  await page.getByRole('button', { name: 'Load synthetic example', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.benchmark-table')).toHaveCount(0);
  await expect(page.getByLabel('NCCL-tests output', { exact: false })).toHaveValue('');
  await page.getByLabel('Upload NCCL-tests log', { exact: true }).setInputFiles({ name: 'oversized.log', mimeType: 'text/plain', buffer: Buffer.alloc(1048577, 'x') });
  await expect(page.locator('.benchmark-error')).toContainText('exceeds 1 MiB');
  await expect(page.locator('.benchmark-table')).toHaveCount(0);
});
