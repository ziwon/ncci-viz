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
- Import NCCL-tests console logs and compare reported timings with the selected model.
- Share URL configurations or export complete simulation traces as JSON.

## Compare an NCCL-tests run

1. Open **Compare algorithms**, then **Import benchmark**.
2. Upload a `.txt` or `.log` file, or paste one run with its column and unit headers.
3. Set the measured collective and total rank count. Confirm both values before comparing.
4. Select **Out-of-place** or **In-place** to inspect that placement's reported timings.

The importer accepts the standard 13-column console output with microsecond timing and decimal GB/s bandwidth. CPU-time, tuning, timestamp, and per-iteration extensions are not supported. Imports are limited to 1 MiB and 5,000 measurements. The table displays the first 100 measurements for the selected placement. Logs remain in the browser tab.

The comparison uses each row's displayed byte size. It requires matching operation, rank count, float32 datatype, reduction, and root where applicable. Failed correctness checks and incompatible configurations remain visible without a comparison ratio. Missing validation counts are marked **Not checked**. Missing total-rank metadata must be entered explicitly; GPUs per process are not the total rank count.

**Measured / model** means imported duration divided by modeled duration. It is not a hardware speedup or an accuracy score. The measured algorithm is unknown unless independently established; the model algorithm remains a separate assumption. **Load synthetic example** provides invented values for exploring the interface, not benchmark evidence.

## Run checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The unit tests check collective results, bandwidth definitions, log parsing, and comparison eligibility. Chromium tests cover playback speeds, final-frame completion, reduced motion, JSON export, mobile navigation, and benchmark import interactions. The browser test runner starts a server on port 5173 or reuses the local development server.

## Model boundaries

This is an independent educational tool, not an NVIDIA product, NCCL runtime trace, or hardware benchmark. Logical topology is not physical wiring. Each data partition shows a deterministic scalar sample; tensor size sets communication volume, not allocation of a full tensor in the browser.

The synchronous cost model sums startup latency plus the largest per-rank sent/received byte budget divided by one-direction link bandwidth. It assumes full-duplex links. It omits reduction compute, channels, protocols, pipelining, launch costs, congestion, and real hardware topology. Link presets are illustrative budgets, not device specifications.

The single binomial tree is a pedagogical baseline, not NCCL's full double-tree implementation. Naive AllReduce/Reduce/Broadcast serialize direct full-buffer transfers. AllToAll uses cyclic pairwise rounds. Gather and Scatter use direct sequential transfers. Gather/Scatter bus bandwidth is intentionally not reported.

Tensor size means full logical buffer bytes: AllGather total output, ReduceScatter total input, AllToAll per-rank input, Gather root output, Scatter root input. Other operations use the per-rank tensor size. Scalar sample: `10 * (rank + 1) + chunk`; AllToAll uses `100 * (source + 1) + destination`.

## Source structure

- `src/simulation.ts`: pure schedule generation, buffer state, cost model, URL configuration, and NCCL code examples.
- `src/App.tsx`: simulator, topology, comparison, and collective reference views.
- `src/i18n.ts`: initial English message dictionary. Future locales can extend this structure; additional inline UI strings still need extraction before full localization.
- `src/benchmark.ts`: NCCL-tests parser, measurement metadata, and comparison eligibility.
- `src/BenchmarkPanel.tsx`: browser-local log import and measured/model comparison.
- `src/styles.css`: responsive design and reduced-motion behavior.
- `tests/`: Chromium interaction tests, configured in `playwright.config.ts`.

## References

- [NVIDIA NCCL collective operations](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html)
- [NCCL-tests performance definitions](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)
- [NCCL-tests console report format](https://github.com/NVIDIA/nccl-tests/blob/master/src/util.cu)
- [gpu-comm-visualizer](https://github.com/devinjeon/gpu-comm-visualizer), the original inspiration. Implementation written independently.
