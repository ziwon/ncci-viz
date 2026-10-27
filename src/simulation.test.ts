import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultConfig, operations, parseConfig, simulate, valueOf, metrics } from './simulation.ts';
import type { Config, Operation, Reduction } from './simulation.ts';

const reductions: Reduction[] = ['Sum', 'Average', 'Min', 'Max'];
function expectedReduction(values: number[], reduction: Reduction) {
  if (reduction === 'Min') return Math.min(...values);
  if (reduction === 'Max') return Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  return reduction === 'Average' ? sum / values.length : sum;
}
for (const n of [2, 4, 8, 16]) {
  for (const operation of Object.keys(operations) as Operation[]) {
    for (const algorithm of operations[operation].algorithms) {
      test(`${operation}/${algorithm}: ${n} ranks, all roots, all reductions`, () => {
        for (let root = 0; root < n; root++) {
          for (const reduction of reductions) {
            const config: Config = { ...defaultConfig, ranks: n, operation, algorithm, root, reduction };
            const frames = simulate(config);
            const output = frames.at(-1)!.buffers;
            for (const frame of frames) for (const row of frame.buffers) for (const cell of row) {
              if (cell) assert.equal(new Set(cell.sources).size, cell.sources.length, 'No rank contribution can be counted twice');
            }
            for (let rank = 0; rank < n; rank++) for (let chunk = 0; chunk < n; chunk++) {
              const actual = valueOf(output[rank][chunk], reduction);
              const reduced = expectedReduction(Array.from({ length: n }, (_, r) => (r + 1) * 10 + chunk), reduction);
              if (operation === 'AllReduce') assert.equal(actual, reduced);
              if (operation === 'Reduce' && rank === root) assert.equal(actual, reduced);
              if (operation === 'ReduceScatter') assert.equal(actual, rank === chunk ? reduced : null);
              if (operation === 'Broadcast') assert.equal(actual, (root + 1) * 10 + chunk);
              if (operation === 'AllGather' || operation === 'Gather' && rank === root) assert.equal(actual, (chunk + 1) * 10 + chunk);
              if (operation === 'Scatter') assert.equal(actual, rank === chunk ? (root + 1) * 10 + chunk : null);
              if (operation === 'AllToAll') assert.equal(actual, (chunk + 1) * 100 + rank);
            }
          }
        }
      });
    }
  }
}
test('Ring AllReduce communication volume and latency match the analytic model', () => {
  const config = { ...defaultConfig, ranks: 8 };
  const frames = simulate(config);
  const m = metrics(config, frames);
  const bytes = config.sizeMiB * 1048576;
  assert.equal(frames.length - 1, 14);
  assert.equal(m.totalBytes, 2 * 7 * bytes);
  assert.ok(Math.abs(m.duration - (14 * config.latency + 2 * 7 / 8 * bytes / (config.bandwidth * 1000))) < 1e-8);
  assert.ok(m.busbw !== null);
  assert.ok(m.busbw < config.bandwidth);
});
test('Gather and Scatter preserve undefined bus bandwidth as null in exported JSON', () => {
  for (const operation of ['Gather', 'Scatter'] as const) {
    const result = metrics({ ...defaultConfig, operation, algorithm: 'Naive' });
    assert.equal(result.busbw, null);
    assert.equal(result.factor, null);
    const exported = JSON.parse(JSON.stringify({ metrics: result }));
    assert.equal(exported.metrics.busbw, null);
    assert.equal(exported.metrics.factor, null);
    assert.ok(Number.isFinite(exported.metrics.duration) && exported.metrics.duration > 0);
    assert.ok(Number.isFinite(exported.metrics.algbw) && exported.metrics.algbw > 0);
  }
});
test('Supported collectives retain their bus bandwidth correction factors', () => {
  const cases = [
    ['AllReduce', 'Ring', 1.5],
    ['Broadcast', 'Tree', 1],
    ['Reduce', 'Tree', 1],
    ['AllGather', 'Ring', 0.75],
    ['ReduceScatter', 'Ring', 0.75],
    ['AllToAll', 'Naive', 0.75],
  ] as const;
  for (const [operation, algorithm, factor] of cases) {
    const result = metrics({ ...defaultConfig, ranks: 4, operation, algorithm });
    assert.equal(result.factor, factor);
    assert.equal(result.busbw, result.algbw * factor);
  }
});
test('Malformed URL values fall back to supported configuration', () => {
  for (const op of ['__proto__', 'constructor', 'invalid']) assert.equal(parseConfig(`?op=${op}`).operation, 'AllReduce');
  const c = parseConfig('?op=Scatter&alg=Ring&n=7&root=999&size=-1&red=invalid&bw=0');
  assert.equal(c.algorithm, 'Naive');
  assert.equal(c.ranks, 8);
  assert.equal(c.root, 7);
  assert.equal(c.sizeMiB, 32);
  assert.equal(c.reduction, 'Sum');
  assert.equal(c.bandwidth, 50);
});
