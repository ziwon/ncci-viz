# NCCL Lab

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Implementation assumption: React, TypeScript, Vite; standalone local application in the supplied workspace.

## Users
Distributed AI engineers studying GPU collective communication. User confirmed: English-first interface. Korean localization may be added later through the separate message dictionary.

## Product Purpose
Make eight collective operations understandable through deterministic step-by-step GPU communication and buffer inspection.

## Capabilities and Constraints
AllReduce (Ring, Tree, Naive), Broadcast and Reduce (Tree, Naive), AllGather and ReduceScatter (Ring), AllToAll, Gather and Scatter (Naive). Playback, configurable ranks and root, reductions, topology, trace, performance estimates, code examples, sharing and export. Models are pedagogical, not NVIDIA runtime traces or measured benchmarks. No NVIDIA affiliation is claimed.

Browser-local import of one standard NCCL-tests console run. Measured values and model estimates remain separate. Operation and total ranks require explicit confirmation. Failed correctness checks cannot produce comparison ratios. Synthetic examples are labeled as invented data.

## Evidence on Hand
User operation matrix; https://github.com/devinjeon/gpu-comm-visualizer ; NVIDIA NCCL collective documentation and nccl-tests performance definitions.

## Product Principles
Preserve collective semantics and rank ordering. Keep buffer state and transfer events consistent. Expose model assumptions. Make every control useful.
