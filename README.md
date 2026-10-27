# NCCL Lab

An English-first, interactive collective communication explorer built with React, TypeScript, and Vite. Runs locally in the browser without GPUs or a backend.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` produces `dist/`; `npm run preview` serves the production build. `npm test` validates collective output semantics.

## Explore

- Eight collectives: AllReduce, Broadcast, Reduce, AllGather, ReduceScatter, AllToAll, Gather, Scatter.
- Ring, single binomial tree, and direct baseline schedules, restricted to supported combinations.
- 2–16 ranks, tensor sizes from 4 KiB to 256 MiB, root selection, sum/average/min/max reductions.
- Step-by-step playback, timeline seeking, speed control, pan/zoom, keyboard controls (Space, arrows, R).
- Inspect GPU buffers, contribution provenance, transfer logs, and C++ NCCL examples.
- Compare modeled completion times, algorithm bandwidth, and NCCL-tests bus bandwidth.
- Share URL configurations or export complete simulation traces as JSON.

## Model boundaries

This is an independent educational tool, not an NVIDIA product, NCCL runtime trace, or hardware benchmark. Logical topology is not physical wiring. Each data partition shows a deterministic scalar sample; tensor size sets communication volume, not allocation of a full tensor in the browser.

The synchronous cost model sums startup latency plus the largest per-rank sent/received byte budget divided by one-direction link bandwidth. It assumes full-duplex links. It omits reduction compute, channels, protocols, pipelining, launch costs, congestion, and real hardware topology. Link presets are illustrative budgets, not device specifications.

The single binomial tree is a pedagogical baseline, not NCCL's full double-tree implementation. Naive AllReduce/Reduce/Broadcast serialize direct full-buffer transfers. AllToAll uses cyclic pairwise rounds. Gather and Scatter use direct sequential transfers. Gather/Scatter bus bandwidth is intentionally not reported.

Tensor size means full logical buffer bytes: AllGather total output, ReduceScatter total input, AllToAll per-rank input, Gather root output, Scatter root input. Other operations use the per-rank tensor size. Scalar sample: `10 * (rank + 1) + chunk`; AllToAll uses `100 * (source + 1) + destination`.

## Source structure

- `src/simulation.ts`: pure schedule generation, buffer state, cost model, URL configuration, and NCCL code examples.
- `src/App.tsx`: simulator, topology, comparison, and collective reference views.
- `src/i18n.ts`: initial English message dictionary. Future locales can extend this structure; additional inline UI strings still need extraction before full localization.
- `src/styles.css`: responsive design and reduced-motion behavior.

## References

- [NVIDIA NCCL collective operations](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html)
- [NCCL-tests performance definitions](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)
- [gpu-comm-visualizer](https://github.com/devinjeon/gpu-comm-visualizer), the original inspiration. Implementation written independently.
