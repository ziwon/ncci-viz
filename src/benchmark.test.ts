import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareMeasurement, demoNcclTests, parseNcclTests } from './benchmark.ts';
import type { BenchmarkContext } from './benchmark.ts';
import { defaultConfig } from './simulation.ts';

const header = '# size count type redop root time algbw busbw #wrong time algbw busbw #wrong\n# (B) (elements) (us) (GB/s) (GB/s) (us) (GB/s) (GB/s)';
const row = '4096 1024 float sum -1 35 0.12 0.20 0 33 0.12 0.22 0';
const context: BenchmarkContext = { operation: 'AllReduce', ranks: 8, confirmed: true };
const sample = () => parseNcclTests(`${header}\n${row}`).rows[0];

test('Imports both placements and preserves line numbers, duplicate sizes, and explicit metadata', () => {
  const parsed = parseNcclTests(`# Test (AllReduce)\n# ranks: 8\n${header}\n${row}\n${row}`);
  assert.equal(parsed.fatal, false);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.detectedOperation, 'AllReduce');
  assert.equal(parsed.detectedRanks, 8);
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual(parsed.rows.map(r => [r.line, r.placement, r.timeUs]), [[5, 'out-of-place', 35], [5, 'in-place', 33], [6, 'out-of-place', 35], [6, 'in-place', 33]]);
});

test('Recognizes executable names but never treats local GPU count as total ranks', () => {
  const parsed = parseNcclTests(`$ ./build/reduce_scatter_perf -g 8\n# nThread 1 nGpus 8\n${header}\n${row}`);
  assert.equal(parsed.detectedOperation, 'ReduceScatter');
  assert.equal(parsed.detectedRanks, null);
  assert.equal(parsed.fatal, false);
});

test('Allows the command and its one test banner to describe the same run', () => {
  const parsed = parseNcclTests(`./build/all_reduce_perf\n# Test (AllReduce)\n${header}\n${row}`);
  assert.equal(parsed.fatal, false);
  assert.equal(parsed.rows.length, 2);
});

test('Current upstream start banners and their command describe one run', () => {
  const start = '# Collective test starting: all_reduce_perf';
  const parsed = parseNcclTests(`./build/all_reduce_perf -g 8\n${start}\n${header}\n${row}`);
  assert.equal(parsed.fatal, false);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.detectedOperation, 'AllReduce');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parseNcclTests(`${start}\n${start}\n${header}\n${row}`).fatal, true);
  assert.equal(parseNcclTests(`./build/reduce_perf\n${start}\n${header}\n${row}`).fatal, true);
});

test('Rejects conflicting metadata and separate runs with the same metadata', () => {
  for (const prefix of ['# Test (AllReduce)\n# Test (Broadcast)', '# nranks 8\n# ranks: 16', '# Test (AllReduce)\n# Test (AllReduce)']) {
    const parsed = parseNcclTests(`${prefix}\n${header}\n${row}`);
    assert.equal(parsed.fatal, true);
    assert.ok(parsed.issues.length > 0);
  }
  assert.equal(parseNcclTests(`# Test (AllReduce)\n${header}\n${row}\n# Test (AllReduce)\n${header}\n${row}`).fatal, true);
});

test('Requires standard columns and microsecond/GB-per-second units', () => {
  for (const input of [row, `${header.replaceAll('(B)', '(KiB)')}\n${row}`, `${header.replaceAll('(us)', '(ms)')}\n${row}`, `${header.replaceAll('time', 'cputime')}\n${row}`, `${header.replaceAll('(GB/s)', '(GiB/s)')}\n${row}`]) {
    const parsed = parseNcclTests(input);
    assert.equal(parsed.fatal, true);
    assert.equal(parsed.rows.length, 0);
  }
});

test('Accepts inline units, CRLF, scientific notation, and terminal colors', () => {
  const inline = '# size(B) count(elements) type redop root time(us) algbw(GB/s) busbw(GB/s) #wrong time(us) algbw(GB/s) busbw(GB/s) #wrong';
  const parsed = parseNcclTests(`\u001b[32m${inline}\u001b[0m\r\n4.096e3 1.024e3 float sum -1 3.5e1 1.2e-1 2e-1 0 33 0.12 0.22 0\r\n`);
  assert.equal(parsed.fatal, false);
  assert.equal(parsed.rows[0].sizeBytes, 4096);
  assert.equal(parsed.rows[0].timeUs, 35);
});

test('Unknown validation and bus bandwidth remain null, not successful zero', () => {
  const parsed = parseNcclTests(`${header}\n4096 1024 float sum -1 35 0.12 N/A N/A 33 0.12 - -`);
  assert.equal(parsed.rows.length, 2);
  for (const measurement of parsed.rows) {
    assert.equal(measurement.wrong, null);
    assert.equal(measurement.busbwGBps, null);
  }
});

test('Malformed fields produce diagnostics while valid measurements remain visible', () => {
  for (const bad of ['NaN', 'Infinity', '-2', '0', '35ms', '1e999']) {
    const parsed = parseNcclTests(`${header}\n${row.replace('35 ', `${bad} `)}`);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].placement, 'in-place');
    assert.match(parsed.issues[0].message, /Invalid out-of-place/);
  }
  for (const bad of ['-1', '1.1', '9007199254740992', '4096bytes']) {
    const parsed = parseNcclTests(`${header}\n${row.replace('4096 ', `${bad} `)}`);
    assert.equal(parsed.rows.length, 0);
    assert.ok(parsed.issues.length > 0);
  }
  assert.equal(parseNcclTests(`${header}\n${row} extra`).rows.length, 0);
  const badCount = parseNcclTests(`${header}\n${row}\n${row.replace('1024', 'broken')}`);
  assert.equal(badCount.rows.length, 2);
  assert.equal(badCount.issues.length, 1);
});

test('An ending banner is not a second run, but a new configuration after data is', () => {
  assert.equal(parseNcclTests(`# Test (AllReduce)\n${header}\n${row}\n# Test (AllReduce) end`).fatal, false);
  assert.equal(parseNcclTests(`${header}\n${row}\n# nThread 1 nGpus 8`).fatal, true);
});

test('Import limits are explicit and do not silently truncate a run', () => {
  const tooLarge = parseNcclTests('x'.repeat(1048577));
  assert.equal(tooLarge.fatal, true);
  assert.match(tooLarge.issues[0].message, /1 MiB/);
  const tooMany = parseNcclTests(`${header}\n${Array.from({ length: 2501 }, () => row).join('\n')}`);
  assert.equal(tooMany.rows.length, 5000);
  assert.equal(tooMany.fatal, true);
  assert.match(tooMany.issues.at(-1)!.message, /5,000/);
});

test('Comparison requires confirmed matching metadata and a representable measurement', () => {
  const measurement = sample();
  assert.equal(compareMeasurement(measurement, { ...context, confirmed: false }, defaultConfig).status, 'unavailable');
  assert.equal(compareMeasurement(measurement, { ...context, ranks: 4 }, defaultConfig).status, 'unavailable');
  assert.equal(compareMeasurement(measurement, { ...context, operation: 'Reduce' }, defaultConfig).status, 'unavailable');
  assert.equal(compareMeasurement(measurement, { ...context, ranks: 17 }, { ...defaultConfig, ranks: 17 }).status, 'unavailable');
  for (const patch of [{ dataType: 'half' }, { reduction: 'max' }, { wrong: 1 }, { sizeBytes: 4097 }]) {
    assert.equal(compareMeasurement({ ...measurement, ...patch }, context, defaultConfig).status, 'unavailable');
  }
  assert.equal(compareMeasurement({ ...measurement, wrong: null }, context, defaultConfig).status, 'comparable');
});

test('Rooted comparisons require the same root', () => {
  const cfg = { ...defaultConfig, operation: 'Broadcast' as const, algorithm: 'Tree' as const, root: 2 };
  const ctx = { ...context, operation: 'Broadcast' as const };
  assert.equal(compareMeasurement({ ...sample(), root: 0 }, ctx, cfg).status, 'unavailable');
  assert.equal(compareMeasurement({ ...sample(), root: 2 }, ctx, cfg).status, 'comparable');
});

test('Three-rank comparisons accept exact partitions and never pad measured sizes', () => {
  const ctx = { ...context, ranks: 3 };
  for (const algorithm of ['Ring', 'Tree', 'Naive'] as const) {
    const model = { ...defaultConfig, ranks: 3, algorithm };
    const aligned = compareMeasurement({ ...sample(), sizeBytes: 4092, count: 1023 }, ctx, model);
    assert.equal(aligned.status, 'comparable');
    const misaligned = compareMeasurement(sample(), ctx, model);
    assert.equal(misaligned.status, 'unavailable');
    if (misaligned.status === 'unavailable') assert.match(misaligned.reason, /Measured sizes are never padded/);
  }
});

test('Uses the measured byte size and returns measured time divided by model time', () => {
  const result = compareMeasurement(sample(), context, defaultConfig);
  assert.equal(result.status, 'comparable');
  if (result.status !== 'comparable') return;
  const expectedTime = 14 * 2 + (2 * 7 / 8 * 4096) / (50 * 1000);
  assert.ok(Math.abs(result.modelTimeUs - expectedTime) < 1e-10);
  assert.ok(Math.abs(result.ratio - 35 / expectedTime) < 1e-10);
});

test('AllGather and ReduceScatter compare total displayed bytes, not the per-rank parameter count', () => {
  for (const operation of ['AllGather', 'ReduceScatter'] as const) {
    const measurement = { ...sample(), count: 128 };
    const result = compareMeasurement(measurement, { ...context, operation }, { ...defaultConfig, operation });
    assert.equal(result.status, 'comparable');
    if (result.status === 'comparable') assert.ok(Math.abs(result.modelTimeUs - (7 * 2 + 7 / 8 * 4096 / 50000)) < 1e-10);
  }
});

test('Demo data is explicitly synthetic and imports without diagnostics', () => {
  assert.match(demoNcclTests, /SYNTHETIC DEMO/);
  const result = parseNcclTests(demoNcclTests);
  assert.equal(result.fatal, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 6);
});
