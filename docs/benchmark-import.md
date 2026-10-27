# Import and compare benchmarks

[Back to NCCL Lab](../README.md)

Compare one `nccl-tests` run with the selected simulation model. The comparison uses each row's displayed byte size, independently of the simulator's tensor-size input.

## Import a run

1. Open **Compare algorithms**, then **Import benchmark**.
2. Upload a `.txt` or `.log` file, or paste a run with its column and unit headers.
3. Set the measured collective and total rank count. Confirm both values before comparing.
4. Select **Out-of-place** or **In-place** to inspect that placement's timings.

Logs stay in the browser tab. **Load synthetic example** uses invented measurements to demonstrate the interface. It provides no hardware benchmark evidence.

## Accepted format

The importer accepts the standard 13-column console report with microsecond timings and decimal GB/s bandwidth. CPU-time, tuning, timestamp, and per-iteration extensions are not supported.

Imports are limited to 1 MiB and 5,000 measurements across both placements. The table shows the first 100 measurements for the selected placement.

## Comparison requirements

A comparison requires matching operation, total rank count, float32 datatype, reduction, and root where applicable. If total-rank metadata is missing, enter it explicitly. GPUs per process are not the total rank count.

The measured byte size must divide into equal whole float32 partitions across ranks. Imported measurements are never padded. The importer uses the reported byte size rather than deriving it from the element count.

Failed correctness checks and incompatible configurations remain visible without a comparison ratio. Missing validation counts display **Not checked** and do not establish correctness.

## Read the ratio

**Measured / model** is the imported duration divided by modeled duration. A value of 2 means that the measured run took twice the modeled time. The ratio is not a hardware speedup or an accuracy score.

The measured algorithm is unknown unless independently established. Selecting Ring or Tree in the model does not identify the algorithm used by the measured run.

Read the [model reference](model.md) for the assumptions behind the estimated duration. The accepted report structure is based on [NCCL-tests console output](https://github.com/NVIDIA/nccl-tests/blob/master/src/util.cu).
