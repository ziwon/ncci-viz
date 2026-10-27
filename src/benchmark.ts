import { isReduction, isRooted, isValidRanks, MAX_RANKS, MIN_RANKS, metrics, operations } from './simulation.ts';
import type { Config, Operation } from './simulation.ts';

export type Placement = 'out-of-place' | 'in-place';
export interface Measurement {
  line: number;
  sizeBytes: number;
  count: number;
  dataType: string;
  reduction: string;
  root: number;
  placement: Placement;
  timeUs: number;
  algbwGBps: number;
  busbwGBps: number | null;
  wrong: number | null;
}
export interface ParsedBenchmark {
  rows: Measurement[];
  detectedOperation: Operation | null;
  detectedRanks: number | null;
  issues: { line: number; message: string }[];
  fatal: boolean;
}
export interface BenchmarkContext { operation: Operation; ranks: number; confirmed: boolean; }
export type MeasurementComparison =
  | { status: 'comparable'; modelTimeUs: number; ratio: number }
  | { status: 'unavailable'; reason: string };

const expectedColumns = 'size count type redop root time algbw busbw #wrong time algbw busbw #wrong';
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const missingToken = /^(?:N\/A|-)$/i;
const executableOperations: Record<string, Operation> = {
  all_reduce: 'AllReduce', all_gather: 'AllGather', reduce_scatter: 'ReduceScatter',
  alltoall: 'AllToAll', all_to_all: 'AllToAll', broadcast: 'Broadcast', reduce: 'Reduce',
  gather: 'Gather', scatter: 'Scatter',
};
function numeric(token: string): number | undefined {
  if (!numberToken.test(token)) return undefined;
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}
function nonnegative(token: string): number | undefined {
  const value = numeric(token);
  return value !== undefined && value >= 0 ? value : undefined;
}
function integer(token: string, minimum: number): number | undefined {
  const value = numeric(token);
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum ? value : undefined;
}
function nullableNumber(token: string, whole: boolean): number | null | undefined {
  return missingToken.test(token) ? null : whole ? integer(token, 0) : nonnegative(token);
}
function hasUnits(line: string) {
  return /\(B\)/.test(line) && /\(elements\)/.test(line)
    && (line.match(/\((?:us|µs|μs)\)/g)?.length === 2)
    && (line.match(/\(GB\/s\)/g)?.length === 4);
}

export function parseNcclTests(text: string): ParsedBenchmark {
  const result: ParsedBenchmark = { rows: [], detectedOperation: null, detectedRanks: null, issues: [], fatal: false };
  const issue = (line: number, message: string, fatal = false) => {
    result.issues.push({ line, message });
    result.fatal ||= fatal;
  };
  if (new TextEncoder().encode(text).length > 1048576) {
    issue(0, 'The log exceeds the 1 MiB import limit.', true);
    return result;
  }
  let columnsRecognized = false;
  let unitsRecognized = false;
  let bannerSeen = false;
  let executableSeen = false;
  let dataSeen = false;
  const lines = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;
    const banner = /\)\s*(?:end|finished|complete)\b/i.test(line) ? null : line.match(/^#\s*Test\s*\(([^)]+)\)/i);
    const executable = line.match(/\b(all_reduce|all_gather|reduce_scatter|alltoall|all_to_all|broadcast|reduce|gather|scatter)_perf(?:_[a-z0-9]+)?\b/i);
    const startsRun = !!banner || /^#\s*Collective test starting:/i.test(line);
    const command = !!executable && !startsRun;
    if (banner || executable) {
      if (dataSeen || (startsRun && bannerSeen) || (command && executableSeen)) {
        issue(lineNumber, 'Multiple benchmark runs detected. Import one run at a time.', true);
      }
      bannerSeen ||= startsRun;
      executableSeen ||= command;
      const namedOperation = banner?.[1].replace(/[\s_-]/g, '').toLowerCase();
      const operation = (Object.keys(operations) as Operation[]).find(op => op.toLowerCase() === namedOperation)
        ?? (executable ? executableOperations[executable[1].toLowerCase()] : undefined);
      if (!operation) issue(lineNumber, 'The benchmark operation is not supported by this explorer.', true);
      else if (result.detectedOperation && result.detectedOperation !== operation) issue(lineNumber, 'Conflicting collective operation metadata.', true);
      else result.detectedOperation = operation;
      continue;
    }
    const ranks = line.match(/^#\s*(?:nranks|ranks)\s*[:=]?\s*(\S+)\s*$/i);
    if (ranks) {
      const count = integer(ranks[1], 1);
      if (count === undefined) issue(lineNumber, 'Total ranks must be a positive safe integer.', true);
      else if (result.detectedRanks !== null && result.detectedRanks !== count) issue(lineNumber, 'Conflicting total-rank metadata.', true);
      else result.detectedRanks = count;
    }
    if (dataSeen && /^#\s*nThread\b/i.test(line)) issue(lineNumber, 'A second benchmark configuration was detected. Import one run at a time.', true);
    if (/^#\s*size\b/.test(line)) {
      const columns = line.replace(/^#\s*/, '').replace(/\([^)]*\)/g, '').trim().split(/\s+/).join(' ');
      columnsRecognized = columns === expectedColumns;
      unitsRecognized = hasUnits(line);
      if (!columnsRecognized) issue(lineNumber, 'Expected standard time/algbw/busbw/#wrong columns for both placements. CPU-time and custom columns are not supported.', true);
      continue;
    }
    if (columnsRecognized && line.startsWith('#') && /\((?:us|µs|μs|ms|s|GB\/s|GiB\/s)\)/.test(line)) {
      unitsRecognized = hasUnits(line);
      if (!unitsRecognized) issue(lineNumber, 'Expected time in microseconds and bandwidth in GB/s for both placements.', true);
      continue;
    }
    if (line.startsWith('#') || !/^(?:[+\-\d.]|NaN\b|Infinity\b)/.test(line)) continue;
    const fields = line.split(/\s+/);
    dataSeen = true;
    if (!columnsRecognized || !unitsRecognized) {
      issue(lineNumber, 'A recognized column header and (B)/(us)/(GB/s) units are required before data rows.', true);
      continue;
    }
    if (fields.length !== 13) {
      issue(lineNumber, `Expected 13 fields, received ${fields.length}. Row skipped.`);
      continue;
    }
    const sizeBytes = integer(fields[0], 1);
    const count = integer(fields[1], 1);
    const root = integer(fields[4], -1);
    if (sizeBytes === undefined || count === undefined || root === undefined || !/^[a-z][a-z0-9_]*$/i.test(fields[2]) || !/^[a-z][a-z0-9_]*$/i.test(fields[3])) {
      issue(lineNumber, 'Invalid size, count, datatype, reduction, or root. Row skipped.');
      continue;
    }
    for (const [placement, start] of [['out-of-place', 5], ['in-place', 9]] as const) {
      const timeUs = numeric(fields[start]);
      const algbwGBps = nonnegative(fields[start + 1]);
      const busbwGBps = nullableNumber(fields[start + 2], false);
      const wrong = nullableNumber(fields[start + 3], true);
      if (timeUs === undefined || timeUs <= 0 || algbwGBps === undefined || busbwGBps === undefined || wrong === undefined) {
        issue(lineNumber, `Invalid ${placement} timing, bandwidth, or validation count. Measurement skipped.`);
        continue;
      }
      if (result.rows.length === 5000) {
        issue(lineNumber, 'The log exceeds the 5,000 measurement import limit.', true);
        return result;
      }
      result.rows.push({ line: lineNumber, sizeBytes, count, dataType: fields[2].toLowerCase(), reduction: fields[3].toLowerCase(), root, placement, timeUs, algbwGBps, busbwGBps, wrong });
    }
  }
  if (!result.rows.length) issue(0, 'No valid benchmark measurements were found.', true);
  return result;
}

export function compareMeasurement(row: Measurement, context: BenchmarkContext, model: Config): MeasurementComparison {
  const unavailable = (reason: string): MeasurementComparison => ({ status: 'unavailable', reason });
  if (!context.confirmed) return unavailable('Confirm the benchmark operation and total rank count.');
  if (context.operation !== model.operation) return unavailable('The benchmark collective does not match the model.');
  if (context.ranks !== model.ranks) return unavailable('The benchmark rank count does not match the model.');
  if (!isValidRanks(context.ranks)) return unavailable(`The model supports integer rank counts from ${MIN_RANKS} to ${MAX_RANKS}.`);
  if (!['float', 'float32'].includes(row.dataType)) return unavailable('The model uses float32. This measurement uses a different datatype.');
  if (row.wrong !== null && row.wrong > 0) return unavailable('This measurement failed its correctness check.');
  if (isRooted(context.operation) && row.root !== model.root) return unavailable('The benchmark root rank does not match the model.');
  const reductionNames = { Sum: 'sum', Average: 'avg', Min: 'min', Max: 'max' } as const;
  if (isReduction(context.operation) && row.reduction !== reductionNames[model.reduction]) return unavailable('The benchmark reduction does not match the model.');
  if (row.sizeBytes % (4 * context.ranks) !== 0) return unavailable('This equal-partition model requires the measured buffer to split into whole float32 elements per rank. Measured sizes are never padded.');
  const modelTimeUs = metrics({ ...model, sizeMiB: row.sizeBytes / 1048576 }).duration;
  return { status: 'comparable', modelTimeUs, ratio: row.timeUs / modelTimeUs };
}

export const demoNcclTests = `# SYNTHETIC DEMO. These values are invented for interface exploration, not hardware measurements.
# Test (AllReduce)
# ranks: 8
# out-of-place in-place
# size count type redop root time algbw busbw #wrong time algbw busbw #wrong
# (B) (elements) (us) (GB/s) (GB/s) (us) (GB/s) (GB/s)
4096 1024 float sum -1 35.00 0.12 0.20 0 33.00 0.12 0.22 0
1048576 262144 float sum -1 78.00 13.44 23.53 0 74.00 14.17 24.80 0
33554432 8388608 float sum -1 1320.00 25.42 44.49 0 1260.00 26.63 46.60 0
`;
