import { useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FileText, FlaskConical, Upload, X } from 'lucide-react';
import { compareMeasurement, demoNcclTests, parseNcclTests } from './benchmark';
import type { BenchmarkContext, ParsedBenchmark, Placement } from './benchmark';
import { formatBytes, formatTime, operations } from './simulation';
import type { Config, Operation } from './simulation';
import './benchmark.css';

type ImportSource = { kind: 'paste' } | { kind: 'file'; name: string } | { kind: 'demo' };
const maxFileBytes = 1024 * 1024;
const visibleRowLimit = 100;

export default function BenchmarkPanel({ config }: { config: Config }) {
  const id = useId();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParsedBenchmark | null>(null);
  const [source, setSource] = useState<ImportSource>({ kind: 'paste' });
  const [operation, setOperation] = useState<Operation | ''>('');
  const [ranks, setRanks] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [placement, setPlacement] = useState<Placement>('out-of-place');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const rankCount = Number(ranks);
  const validContext = operation !== '' && ranks.trim() !== '' && Number.isSafeInteger(rankCount) && rankCount > 0;
  const metadataConflict = result?.detectedOperation && operation && result.detectedOperation !== operation
    ? `The log identifies ${result.detectedOperation}. Select that collective to compare this run.`
    : result?.detectedRanks && ranks && result.detectedRanks !== rankCount
      ? `The log identifies ${result.detectedRanks} total ranks. Use that count to compare this run.`
      : '';
  const filteredRows = useMemo(() => result?.rows.filter(row => row.placement === placement) ?? [], [result, placement]);
  const displayedRows = filteredRows.slice(0, visibleRowLimit);

  function clearResult() {
    setResult(null);
    setOperation('');
    setRanks('');
    setConfirmed(false);
    setError('');
  }

  function importText(nextText: string, nextSource: ImportSource) {
    requestVersion.current++;
    setLoading(false);
    setText(nextText);
    setSource(nextSource);
    clearResult();
    if (new TextEncoder().encode(nextText).byteLength > maxFileBytes) {
      setError('This log exceeds 1 MiB. Import a smaller single-run log.');
      return;
    }
    const parsed = parseNcclTests(nextText);
    setResult(parsed);
    setOperation(parsed.detectedOperation ?? '');
    setRanks(parsed.detectedRanks === null ? '' : String(parsed.detectedRanks));
    setPlacement(parsed.rows.some(row => row.placement === 'out-of-place') ? 'out-of-place' : 'in-place');
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    const version = ++requestVersion.current;
    clearResult();
    setLoading(false);
    setSource({ kind: 'file', name: file.name });
    setText('');
    if (file.size > maxFileBytes) {
      setError('This file exceeds 1 MiB. Choose a smaller single-run log.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    if (!/\.(txt|log)$/i.test(file.name)) {
      setError('Choose a .txt or .log file containing NCCL-tests console output.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setLoading(true);
    try {
      const contents = await file.text();
      if (version !== requestVersion.current) return;
      importText(contents, { kind: 'file', name: file.name });
    } catch {
      if (version === requestVersion.current) setError('The file could not be read. Try another file or paste its text below.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function reset() {
    requestVersion.current++;
    clearResult();
    setText('');
    setSource({ kind: 'paste' });
    setLoading(false);
    setPlacement('out-of-place');
    if (fileInput.current) fileInput.current.value = '';
  }

  const hasMeasurements = !!result?.rows.length;
  const canConfirm = hasMeasurements && validContext && !result?.fatal && !metadataConflict;

  return <section id="benchmark-import" className="benchmark-panel" aria-labelledby={`${id}-title`}>
    <div className="benchmark-heading">
      <div><h3 id={`${id}-title`}><FileText size={17} />Compare with NCCL-tests</h3><p>Bring a measured run alongside the communication model.</p></div>
      <span className="benchmark-local">Processed in your browser</span>
    </div>
    <div className="benchmark-import">
      <div className="benchmark-import-toolbar">
        <label className="benchmark-upload"><Upload size={14} />Upload log file<input ref={fileInput} type="file" accept=".txt,.log,text/plain" aria-label="Upload NCCL-tests log" onChange={event => void readFile(event.target.files?.[0])} /></label>
        <button className="benchmark-button benchmark-quiet" onClick={() => importText(demoNcclTests, { kind: 'demo' })}><FlaskConical size={14} />Load synthetic example</button>
        <button className="benchmark-button benchmark-clear" onClick={reset} disabled={!text && !result && !error && !loading}><X size={13} />Clear</button>
      </div>
      <label className="benchmark-editor-label" htmlFor={`${id}-output`}>NCCL-tests output<span>One run · .txt or .log · maximum 1 MiB</span></label>
      <textarea aria-label="NCCL-tests output" id={`${id}-output`} className="benchmark-editor" spellCheck={false} value={text} placeholder={'Paste the column headers and result rows from your NCCL-tests run.\n# size  count  type  redop  root  time  algbw  busbw  #wrong ...'} onChange={event => { requestVersion.current++; setLoading(false); setText(event.target.value); setSource(previous => previous.kind === 'demo' ? previous : { kind: 'paste' }); clearResult(); }} aria-describedby={`${id}-privacy`} />
      <div className="benchmark-import-footer"><p id={`${id}-privacy`}>Raw logs stay in this browser tab. No upload to a server.</p><button className="benchmark-button benchmark-primary" disabled={!text.trim() || loading} onClick={() => importText(text, source)}>{loading ? 'Reading file…' : 'Import results'}</button></div>
      {loading && <p className="benchmark-notice" role="status">Reading the selected log file.</p>}
      {error && <p className="benchmark-notice benchmark-error" role="alert"><AlertCircle size={14} />{error}</p>}
      {source.kind === 'demo' && <p className="benchmark-notice benchmark-demo"><FlaskConical size={14} />Synthetic example. These values demonstrate the importer and are not hardware measurements.</p>}
      {source.kind === 'file' && !loading && <p className="benchmark-source">Source file <strong>{source.name}</strong></p>}
      {result && <p className="benchmark-import-status" role="status">{result.rows.length ? `${result.rows.length} measurements imported across both placement modes.` : 'No measurements imported.'}{result.fatal && ' Comparison is blocked until the log errors are resolved.'}</p>}
      {!!result?.issues.length && <details className="benchmark-diagnostics" open={result.fatal || !hasMeasurements}><summary><AlertCircle size={13} />{result.issues.length} import {result.issues.length === 1 ? 'issue' : 'issues'}</summary><ul>{result.issues.slice(0, 25).map((issue, index) => <li key={`${issue.line}-${index}`}><span>{issue.line > 0 ? `Line ${issue.line}` : 'Log'}</span>{issue.message}</li>)}</ul>{result.issues.length > 25 && <p>Showing the first 25 issues. Correct the log and import it again.</p>}</details>}
    </div>
    {hasMeasurements && <>
      <div className="benchmark-context">
        <div className="benchmark-context-heading"><h4>Confirm the measured run</h4><p>These fields describe the imported run, independently of the model controls above.</p></div>
        <div className="benchmark-context-fields">
          <label htmlFor={`${id}-operation`}>Measured collective<div className="benchmark-select"><select aria-label="Measured collective" aria-describedby={`${id}-operation-hint`} id={`${id}-operation`} value={operation} onChange={event => { setOperation(event.target.value as Operation | ''); setConfirmed(false); }}><option value="">Select the measured collective</option>{(Object.keys(operations) as Operation[]).map(op => <option key={op}>{op}</option>)}</select><ChevronDown size={13} /></div><small id={`${id}-operation-hint`}>{result?.detectedOperation ? `Detected in log: ${result.detectedOperation}` : 'Not detected. Enter the operation used for this run.'}</small></label>
          <label htmlFor={`${id}-ranks`}>Total ranks<input aria-label="Total ranks" aria-describedby={`${id}-ranks-hint`} id={`${id}-ranks`} type="number" min="1" step="1" inputMode="numeric" placeholder="Across all processes" value={ranks} onChange={event => { setRanks(event.target.value); setConfirmed(false); }} /><small id={`${id}-ranks-hint`}>{result?.detectedRanks ? `Detected in log: ${result.detectedRanks}` : 'Total participating ranks, not GPUs per process.'}</small></label>
          <label htmlFor={`${id}-placement`}>Buffer placement<div className="benchmark-select"><select aria-label="Buffer placement" id={`${id}-placement`} value={placement} onChange={event => setPlacement(event.target.value as Placement)}><option value="out-of-place">Out-of-place</option><option value="in-place">In-place</option></select><ChevronDown size={13} /></div><small>Each mode retains its own measurement.</small></label>
        </div>
        {metadataConflict && <p className="benchmark-notice benchmark-error" role="alert"><AlertCircle size={14} />{metadataConflict}</p>}
        <label className="benchmark-confirm"><input type="checkbox" checked={confirmed} disabled={!canConfirm} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm the measured collective and total rank count.</span></label>
      </div>
      <div className="benchmark-results-heading"><div><h4>{source.kind === 'demo' ? 'Synthetic example vs. model' : 'Imported measurements vs. model'}</h4><p>Measured algorithm not recorded; model uses {config.algorithm}.</p></div><span>{filteredRows.length} {filteredRows.length === 1 ? 'measurement' : 'measurements'}</span></div>
      <div className="benchmark-table-scroll"><table className="benchmark-table"><thead><tr><th>Tensor size</th><th>Data type</th><th>{source.kind === 'demo' ? 'Example time' : 'Measured time'}</th><th>Model time</th><th>{source.kind === 'demo' ? 'Example / model' : 'Measured / model'}</th><th>Reported alg. BW</th><th>Correctness</th><th>Comparison status</th></tr></thead><tbody>{displayedRows.map((row, index) => {
        const context: BenchmarkContext | null = validContext && operation ? { operation, ranks: rankCount, confirmed } : null;
        const comparison = result?.fatal
          ? { status: 'unavailable' as const, reason: 'Resolve the log errors before comparison.' }
          : metadataConflict
            ? { status: 'unavailable' as const, reason: metadataConflict }
            : !context
              ? { status: 'unavailable' as const, reason: 'Enter the measured collective and total rank count.' }
              : compareMeasurement(row, context, config);
        const correctness = row.wrong === null ? 'Not checked' : row.wrong > 0 ? `${row.wrong} errors` : 'Passed';
        return <tr key={`${row.line}-${row.placement}-${index}`}><th title={`${row.sizeBytes.toLocaleString()} bytes · source line ${row.line}`}>{formatBytes(row.sizeBytes)}</th><td>{row.dataType}</td><td>{formatTime(row.timeUs)}</td><td>{comparison.status === 'comparable' ? formatTime(comparison.modelTimeUs) : 'Unavailable'}</td><td>{comparison.status === 'comparable' ? `${comparison.ratio.toFixed(2)}×` : 'Unavailable'}</td><td>{row.algbwGBps.toFixed(2)} GB/s</td><td><span className={`benchmark-correctness ${row.wrong === null ? 'unchecked' : row.wrong > 0 ? 'failed' : 'passed'}`}>{row.wrong === 0 && <Check size={12} />}{correctness}</span></td><td className="benchmark-comparison-status">{comparison.status === 'comparable' ? 'Same collective, ranks, and tensor size.' : comparison.reason}</td></tr>;
      })}</tbody></table></div>
      {!filteredRows.length && <p className="benchmark-empty">This log has no measurements for the selected buffer placement.</p>}
      {filteredRows.length > visibleRowLimit && <p className="benchmark-row-limit">Showing the first {visibleRowLimit} of {filteredRows.length} measurements for this placement. Import a smaller log to inspect the remaining rows.</p>}
      <p className="benchmark-footnote">The ratio is imported time divided by modeled time. It is not a hardware speedup or a prediction accuracy score. The model omits compute, runtime overhead, and physical topology contention.</p>
    </>}
  </section>;
}
