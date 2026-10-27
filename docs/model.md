# Model reference

[Back to NCCL Lab](../README.md)

NCCL Lab is an independent educational model, not an NVIDIA product, an NCCL runtime trace, or a hardware benchmark. Each GPU represents one rank. The visualization accepts 2 to 16 ranks for readability.

## Tensor size and sample data

The tensor input accepts 4 B to 1 TiB in KiB, MiB, or GiB. Changing units preserves the size. Invalid input drafts retain the last valid simulation.

| Collective | Meaning of tensor size |
| --- | --- |
| AllReduce, Broadcast, Reduce | Per-rank buffer |
| AllGather | Total output buffer on each rank |
| ReduceScatter | Total input buffer on each rank |
| AllToAll | Per-rank input buffer |
| Gather | Root's output buffer |
| Scatter | Root's input buffer |

The model rounds requested bytes up to a multiple of `4 × ranks`. Each partition then contains the same whole number of float32 elements. The interface displays any padding. Metrics, transfer payloads, and generated code use the effective size. JSON exports include requested and effective sizes in `tensor`.

This padding is an educational model choice, not a general NCCL requirement. Imported benchmark measurements are never padded.

Each partition stores one deterministic scalar sample and its contribution provenance. Tensor size controls traffic volume without allocating a full tensor in the browser. The sample is `10 × (rank + 1) + chunk`. AllToAll uses `100 × (source + 1) + destination`.

## Schedules

- Ring AllReduce performs reduce-scatter followed by all-gather.
- Tree uses a single binomial tree as a pedagogical baseline. It does not reproduce NCCL's full double-tree implementation.
- Naive AllReduce, Reduce, and Broadcast serialize direct full-buffer transfers.
- AllToAll uses cyclic pairwise rounds.
- Gather and Scatter use direct sequential transfers.

The generated C++ illustrates NCCL API usage. It does not force NCCL to use the selected simulation schedule.

## Time and bandwidth

Each synchronous round costs startup latency plus the largest per-rank sent or received byte budget divided by one-direction link bandwidth. The model sums these costs across rounds and assumes full-duplex links.

The model omits reduction compute, channels, protocols, pipelining, launch costs, congestion, and real hardware topology. Link presets are illustrative budgets rather than device specifications.

Algorithm bandwidth uses logical tensor bytes divided by modeled duration. Bus bandwidth applies the collective's normalization factor from the [NCCL-tests performance definitions](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md). Gather and Scatter do not report bus bandwidth. Their exported bus bandwidth and normalization factor are `null`.

## Configuration links and traces

A shared URL stores the simulation configuration. A JSON trace includes the configuration, tensor layout, metrics, and all frames. The trace describes this model's execution, not activity captured from a GPU.

See [benchmark import](benchmark-import.md) for the rules used to compare real measurements with this model.
