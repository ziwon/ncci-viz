export const operations = {
  AllReduce: { algorithms: ['Ring', 'Tree', 'Naive'], ko: '모든 GPU의 데이터를 합산하고 결과를 공유합니다.', en: 'Reduce across every rank. Replicate the result everywhere.', formula: 'Yᵢ = ⊕ⱼ Xⱼ', tag: 'REDUCE + REPLICATE' },
  Broadcast: { algorithms: ['Tree', 'Naive'], ko: '루트 GPU의 동일한 데이터를 모든 GPU에 복사합니다.', en: 'Replicate the root buffer across all ranks.', formula: 'Yᵢ = Xroot', tag: 'ONE → ALL' },
  Reduce: { algorithms: ['Tree', 'Naive'], ko: '모든 GPU의 데이터를 집계해 루트 GPU에 저장합니다.', en: 'Aggregate every rank into a single root buffer.', formula: 'Yroot = ⊕ⱼ Xⱼ', tag: 'ALL → ONE' },
  AllGather: { algorithms: ['Ring'], ko: '각 GPU의 고유한 조각을 rank 순서로 모든 GPU에 모읍니다.', en: 'Gather unique chunks in rank order on every GPU.', formula: 'Yᵢ = [X₀, …, Xₙ₋₁]', tag: 'GATHER + REPLICATE' },
  ReduceScatter: { algorithms: ['Ring'], ko: '전체 데이터를 집계하고 각 GPU에 해당 rank의 조각을 분배합니다.', en: 'Reduce the full buffer. Distribute one result chunk per rank.', formula: 'Yᵢ = (⊕ⱼ Xⱼ)[i]', tag: 'REDUCE + PARTITION' },
  AllToAll: { algorithms: ['Naive'], ko: '각 GPU가 목적지마다 서로 다른 데이터 조각을 교환합니다.', en: 'Exchange personalized chunks between every pair of ranks.', formula: 'Yᵢ[j] = Xⱼ[i]', tag: 'ALL ↔ ALL' },
  Gather: { algorithms: ['Naive'], ko: '각 GPU의 고유한 데이터 조각을 루트에 순서대로 모읍니다.', en: 'Collect rank-ordered chunks at the root.', formula: 'Yroot = [X₀, …, Xₙ₋₁]', tag: 'COLLECT AT ROOT' },
  Scatter: { algorithms: ['Naive'], ko: '루트의 데이터를 나누어 각 GPU에 해당 조각을 전달합니다.', en: 'Distribute one chunk from the root to each rank.', formula: 'Yᵢ = Xroot[i]', tag: 'PARTITION FROM ROOT' },
} as const;
export type Operation = keyof typeof operations;
export type Algorithm = 'Ring' | 'Tree' | 'Naive';
export type Reduction = 'Sum' | 'Average' | 'Min' | 'Max';
export interface Config { operation: Operation; algorithm: Algorithm; ranks: number; root: number; sizeMiB: number; reduction: Reduction; bandwidth: number; latency: number; }
export interface Cell { sources: number[]; values: number[]; }
export interface Transfer { from: number; to: number; chunks: number[]; reduce: boolean; bytes: number; values: number[]; }
export interface Frame { phase: string; description: string; buffers: (Cell | null)[][]; transfers: Transfer[]; timeUs: number; }
export interface SimulationMetrics { duration: number; algbw: number; busbw: number | null; factor: number | null; totalBytes: number; }
export const chunkColors = ['#b2e879', '#70c5d0', '#c3a1e5', '#e6ba75', '#7aa6e0', '#db94aa', '#a9c7b7', '#d4d384', '#8ed8bd', '#a6b3ea', '#d8a47c', '#b2c580', '#b7a3bf', '#88bbc4', '#c5ab8d', '#b2b6d2'];
export const defaultConfig: Config = { operation: 'AllReduce', algorithm: 'Ring', ranks: 8, root: 0, sizeMiB: 32, reduction: 'Sum', bandwidth: 50, latency: 2 };
export const isRooted = (op: Operation) => ['Broadcast', 'Reduce', 'Gather', 'Scatter'].includes(op);
export const isReduction = (op: Operation) => ['AllReduce', 'Reduce', 'ReduceScatter'].includes(op);
export const valueOf = (cell: Cell | null, reduction: Reduction): number | null => {
  if (!cell) return null;
  if (reduction === 'Min') return Math.min(...cell.values);
  if (reduction === 'Max') return Math.max(...cell.values);
  const sum = cell.values.reduce((a, b) => a + b, 0);
  return reduction === 'Average' ? sum / cell.values.length : sum;
};
const clone = (buffers: (Cell | null)[][]) => buffers.map(row => row.map(c => c ? { sources: [...c.sources], values: [...c.values] } : null));
const one = (rank: number, chunk: number): Cell => ({ sources: [rank], values: [(rank + 1) * 10 + chunk] });

export function simulate(config: Config): Frame[] {
  const { operation: op, algorithm, ranks: n, root } = config;
  const bytes = config.sizeMiB * 1024 * 1024;
  const chunkBytes = bytes / n;
  let buffers: (Cell | null)[][] = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => {
    if (op === 'AllGather' || op === 'Gather') return r === c ? one(r, c) : null;
    if (op === 'AllToAll') return r === c ? { sources: [r], values: [(r + 1) * 100 + c] } : null;
    if (op === 'Broadcast' || op === 'Scatter') return r === root ? one(root, c) : null;
    return one(r, c);
  }));
  const frames: Frame[] = [{ phase: 'Initialize', description: 'Input buffers allocated. Every colored segment represents one partition.', buffers: clone(buffers), transfers: [], timeUs: 0 }];
  let timeUs = 0;
  const allChunks = Array.from({ length: n }, (_, i) => i);
  type Send = { from: number; to: number; chunks: number[]; reduce?: boolean; personalized?: boolean };
  function step(phase: string, sends: Send[]) {
    const next = clone(buffers);
    const transfers: Transfer[] = [];
    for (const send of sends) {
      const sentValues: number[] = [];
      for (const chunk of send.chunks) {
        const cell = send.personalized ? { sources: [send.from], values: [(send.from + 1) * 100 + send.to] } : buffers[send.from][chunk];
        if (!cell) throw new Error(`Invalid schedule: rank ${send.from} has no chunk ${chunk}`);
        sentValues.push(valueOf(cell, config.reduction)!);
        const destChunk = send.personalized ? send.from : chunk;
        const prev = next[send.to][destChunk];
        next[send.to][destChunk] = send.reduce && prev
          ? { sources: [...prev.sources, ...cell.sources], values: [...prev.values, ...cell.values] }
          : { sources: [...cell.sources], values: [...cell.values] };
      }
      transfers.push({ from: send.from, to: send.to, chunks: send.chunks, reduce: !!send.reduce, bytes: send.chunks.length * chunkBytes, values: sentValues });
    }
    const traffic = Array.from({ length: n }, (_, rank) => Math.max(
      transfers.filter(t => t.from === rank).reduce((s, t) => s + t.bytes, 0),
      transfers.filter(t => t.to === rank).reduce((s, t) => s + t.bytes, 0),
    ));
    timeUs += config.latency + Math.max(...traffic) / (config.bandwidth * 1000);
    buffers = next;
    frames.push({ phase, description: `${transfers.length} simultaneous transfer${transfers.length === 1 ? '' : 's'} · ${transfers.some(t => t.reduce) ? 'receive and reduce' : 'receive and copy'}`, buffers: clone(buffers), transfers, timeUs });
  }
  const mod = (x: number) => (x + n * 2) % n;
  const rank = (logical: number) => (logical + root) % n;
  const reducing = op === 'AllReduce' || op === 'Reduce' || op === 'ReduceScatter';
  if (algorithm === 'Ring') {
    if (reducing) {
      for (let s = 0; s < n - 1; s++) step('Reduce-scatter', allChunks.map(r => ({ from: r, to: mod(r + 1), chunks: [mod(r - s - 1)], reduce: true })));
    }
    if (op === 'AllReduce' || op === 'AllGather') {
      for (let s = 0; s < n - 1; s++) step('All-gather', allChunks.map(r => ({ from: r, to: mod(r + 1), chunks: [mod(r - s)] })));
    }
    if (op === 'ReduceScatter') frames[frames.length - 1].buffers = buffers.map((row, r) => row.map((c, i) => i === r ? c : null));
  } else if (algorithm === 'Tree') {
    const levels: Send[][] = [];
    for (let stride = 1; stride < n; stride *= 2) {
      const sends: Send[] = [];
      for (let i = 0; i < n; i += stride * 2) if (i + stride < n) sends.push({ from: rank(i + stride), to: rank(i), chunks: allChunks, reduce: true });
      levels.push(sends);
    }
    if (reducing) for (const sends of levels) step('Reduce', sends);
    if (op === 'AllReduce' || op === 'Broadcast') for (const sends of [...levels].reverse()) step('Broadcast', sends.map(t => ({ from: t.to, to: t.from, chunks: allChunks })));
  } else {
    if (reducing) for (let i = 1; i < n; i++) step('Reduce', [{ from: rank(i), to: root, chunks: allChunks, reduce: true }]);
    if (op === 'AllReduce' || op === 'Broadcast') for (let i = 1; i < n; i++) step('Broadcast', [{ from: root, to: rank(i), chunks: allChunks }]);
    if (op === 'Gather') for (let i = 1; i < n; i++) step('Gather', [{ from: rank(i), to: root, chunks: [rank(i)] }]);
    if (op === 'Scatter') {
      for (let i = 1; i < n; i++) step('Scatter', [{ from: root, to: rank(i), chunks: [rank(i)] }]);
      frames[frames.length - 1].buffers[root] = frames[frames.length - 1].buffers[root].map((c, i) => i === root ? c : null);
    }
    if (op === 'AllToAll') for (let offset = 1; offset < n; offset++) step('Exchange', allChunks.map(r => ({ from: r, to: mod(r + offset), chunks: [mod(r + offset)], personalized: true })));
  }
  return frames;
}

export function metrics(config: Config, frames = simulate(config)): SimulationMetrics {
  const n = config.ranks;
  const bytes = config.sizeMiB * 1024 * 1024;
  const duration = frames[frames.length - 1].timeUs;
  const factors: Record<Operation, number | null> = {
    AllReduce: 2 * (n - 1) / n,
    Broadcast: 1,
    Reduce: 1,
    AllGather: (n - 1) / n,
    ReduceScatter: (n - 1) / n,
    AllToAll: (n - 1) / n,
    Gather: null,
    Scatter: null,
  };
  const factor = factors[config.operation];
  const algbw = bytes / (duration * 1000);
  return { duration, algbw, busbw: factor === null ? null : algbw * factor, factor, totalBytes: frames.flatMap(f => f.transfers).reduce((s, t) => s + t.bytes, 0) };
}
export function formatBytes(bytes: number) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes % 1048576 ? 1 : 0)} MiB` : `${(bytes / 1024).toFixed(bytes % 1024 ? 1 : 0)} KiB`; }
export function formatTime(us: number) { return us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`; }
export function parseConfig(search: string): Config {
  const p = new URLSearchParams(search);
  const op = p.get('op') as Operation;
  const operation = op && Object.hasOwn(operations, op) ? op : defaultConfig.operation;
  const alg = p.get('alg') as Algorithm;
  const algorithm = (operations[operation].algorithms as readonly string[]).includes(alg) ? alg : operations[operation].algorithms[0];
  const ranks = [2, 4, 8, 16].includes(Number(p.get('n'))) ? Number(p.get('n')) : 8;
  const root = Math.min(ranks - 1, Math.max(0, Math.floor(Number(p.get('root')) || 0)));
  const sizeMiB = [0.00390625, 0.0625, 1, 4, 16, 32, 64, 256].includes(Number(p.get('size'))) ? Number(p.get('size')) : 32;
  const reduction = ['Sum', 'Average', 'Min', 'Max'].includes(p.get('red') || '') ? p.get('red') as Reduction : 'Sum';
  const bandwidth = [16, 32, 50, 100].includes(Number(p.get('bw'))) ? Number(p.get('bw')) : 50;
  return { operation, algorithm, ranks, root, sizeMiB, reduction, bandwidth, latency: bandwidth <= 32 ? 5 : 2 };
}

export function codeFor(config: Config) {
  const op = { Sum: 'ncclSum', Average: 'ncclAvg', Min: 'ncclMin', Max: 'ncclMax' }[config.reduction];
  const count = config.sizeMiB * 1048576 / 4;
  const intro = `// One communicator, ${config.ranks} ranks · float32\n// Each rank calls this on its own CUDA stream.\nconst size_t count = ${count};\nconst size_t chunk = count / ${config.ranks};\n`;
  const calls: Record<Operation, string> = {
    AllReduce: `ncclAllReduce(sendbuf, recvbuf, count,\n              ncclFloat32, ${op}, comm, stream);`,
    Broadcast: `ncclBroadcast(sendbuf, recvbuf, count,\n              ncclFloat32, ${config.root}, comm, stream);`,
    Reduce: `ncclReduce(sendbuf, recvbuf, count, ncclFloat32,\n           ${op}, ${config.root}, comm, stream);`,
    AllGather: `// count is the final receive-buffer size.\nncclAllGather(sendbuf, recvbuf, chunk,\n              ncclFloat32, comm, stream);`,
    ReduceScatter: `// chunk is the receive count per rank.\nncclReduceScatter(sendbuf, recvbuf, chunk,\n                  ncclFloat32, ${op}, comm, stream);`,
    AllToAll: `// Grouped P2P formulation; float* buffers.\nncclGroupStart();\nfor (int peer = 0; peer < ${config.ranks}; ++peer) {\n  ncclSend(sendbuf + peer * chunk, chunk,\n           ncclFloat32, peer, comm, stream);\n  ncclRecv(recvbuf + peer * chunk, chunk,\n           ncclFloat32, peer, comm, stream);\n}\nncclGroupEnd();`,
    Gather: `// Root recvbuf has count float elements.\nncclGroupStart();\nif (rank == ${config.root}) {\n  for (int peer = 0; peer < ${config.ranks}; ++peer)\n    ncclRecv(recvbuf + peer * chunk, chunk,\n             ncclFloat32, peer, comm, stream);\n}\nncclSend(sendbuf, chunk, ncclFloat32, ${config.root}, comm, stream);\nncclGroupEnd();`,
    Scatter: `// Root sendbuf has count float elements.\nncclGroupStart();\nif (rank == ${config.root}) {\n  for (int peer = 0; peer < ${config.ranks}; ++peer)\n    ncclSend(sendbuf + peer * chunk, chunk,\n             ncclFloat32, peer, comm, stream);\n}\nncclRecv(recvbuf, chunk, ncclFloat32, ${config.root}, comm, stream);\nncclGroupEnd();`,
  };
  return intro + '\n' + calls[config.operation] + '\n\n// Check return codes and synchronize before reading output.\n// NCCL chooses the execution schedule; this UI is an\n// educational model, not a trace of these API calls.';
}
