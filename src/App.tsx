import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowRightLeft, ArrowUpFromLine, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CircleDot, Code2, Copy, Cpu, Download, ExternalLink, GitBranch, Layers, Maximize2, Menu, Minus, Network, Pause, Play, Plus, Radio, RotateCcw, Settings2, Share2, SkipBack, SkipForward, SlidersHorizontal, Terminal, X } from 'lucide-react';
import { chunkColors, codeFor, formatBytes, formatTime, isReduction, isRooted, metrics, operations, parseConfig, simulate, valueOf } from './simulation';
import type { Algorithm, Config, Frame, Operation, Reduction } from './simulation';
import { t } from './i18n';
import BenchmarkPanel from './BenchmarkPanel';

const operationIcons = { AllReduce: Network, Broadcast: Radio, Reduce: ArrowDownToLine, AllGather: Layers, ReduceScatter: GitBranch, AllToAll: ArrowRightLeft, Gather: ArrowDownToLine, Scatter: ArrowUpFromLine };
const shortDescriptions = { AllReduce: 'Reduce & replicate', Broadcast: 'One to everyone', Reduce: 'Everyone to one', AllGather: 'Gather & replicate', ReduceScatter: 'Reduce & partition', AllToAll: 'Personalized exchange', Gather: 'Collect at root', Scatter: 'Distribute from root' };
const bandwidths = [{ value: 50, label: 'NVLink-like', detail: '50 GB/s · 2 µs' }, { value: 100, label: 'Fast fabric', detail: '100 GB/s · 2 µs' }, { value: 32, label: 'PCIe-like', detail: '32 GB/s · 5 µs' }, { value: 16, label: 'Network-like', detail: '16 GB/s · 5 µs' }];
type Page = 'simulator' | 'compare' | 'reference';
type DetailTab = 'buffers' | 'transfers' | 'code';
function IconButton({ label, children, onClick, disabled, className = '' }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field" title={hint}><span>{label}{hint && <CircleHelp size={12} />}</span><div className="select-wrap">{children}<ChevronDown size={13} /></div></label>; }

export default function App() {
  const [config, setConfig] = useState<Config>(() => parseConfig(window.location.search));
  const [page, setPage] = useState<Page>('simulator');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const stepDurationMs = 1100 / speed;
  const [rank, setRank] = useState(0);
  const [tab, setTab] = useState<DetailTab>('buffers');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const frames = useMemo(() => simulate(config), [config]);
  const frame = frames[Math.min(step, frames.length - 1)];
  const total = frames.length - 1;
  const stats = useMemo(() => metrics(config, frames), [config, frames]);
  const completed = step === total && !playing;
  const notify = (message: string) => setToast(message);

  function update(patch: Partial<Config>) {
    setConfig(previous => {
      const next = { ...previous, ...patch };
      if (!(operations[next.operation].algorithms as readonly string[]).includes(next.algorithm)) next.algorithm = operations[next.operation].algorithms[0];
      next.root = Math.min(next.root, next.ranks - 1);
      return next;
    });
    setStep(0); setPlaying(false); setRank(0);
  }
  function chooseOperation(operation: Operation) { update({ operation }); setPage('simulator'); setSidebarOpen(false); }
  function goTo(value: number) { setPlaying(false); setStep(Math.max(0, Math.min(total, value))); }
  function togglePlay() {
    if (playing) { setPlaying(false); return; }
    if (step >= total) setStep(0);
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step >= total) setPlaying(false);
      else setStep(s => Math.min(total, s + 1));
    }, stepDurationMs);
    return () => clearTimeout(timer);
  }, [playing, step, total, stepDurationMs]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (page !== 'simulator') setPlaying(false); }, [page]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
      if (event.code === 'Escape') { setSidebarOpen(false); setSettingsOpen(false); }
      if (event.code === 'KeyS') { setPage('simulator'); setSidebarOpen(false); }
      if (page !== 'simulator' || settingsOpen) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      if (event.code === 'ArrowRight') { event.preventDefault(); goTo(step + 1); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); goTo(step - 1); }
      if (event.code === 'KeyR') goTo(0);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    Object.entries({ op: config.operation, alg: config.algorithm, n: config.ranks, size: config.sizeMiB, root: config.root, red: config.reduction, bw: config.bandwidth }).forEach(([key, val]) => p.set(key, String(val)));
    window.history.replaceState(null, '', url);
  }, [config]);

  async function copy(text: string, message: string) {
    try { await navigator.clipboard.writeText(text); notify(message); }
    catch { notify('Clipboard unavailable. Copy the configuration from your browser address bar.'); }
  }
  function exportTrace() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, model: 'Educational synchronous, full-duplex, per-rank link bandwidth model. Not an NCCL runtime trace.', config, metrics: stats, frames }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `nccl-${config.operation.toLowerCase()}-${config.algorithm.toLowerCase()}-${config.ranks}ranks.json`; a.click(); URL.revokeObjectURL(url); notify('Simulation trace exported');
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to simulator</a>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('simulator'); }}><span className="brand-icon"><Cpu size={23} /></span><span>NCCL<span className="brand-lab">Lab</span></span><span className="brand-dot" /></a>
      <div className="workspace-label"><span className="workspace-symbol">N</span><span>Communication workspace<small>Interactive learning environment</small></span></div>
      <nav aria-label="Workspace" className="main-nav">
        <button className={page === 'simulator' ? 'nav-active' : ''} onClick={() => { setPage('simulator'); setSidebarOpen(false); }}><Activity size={17} />{t.simulator}<span className="nav-key">S</span></button>
        <button className={page === 'compare' ? 'nav-active' : ''} onClick={() => { setPage('compare'); setSidebarOpen(false); }}><SlidersHorizontal size={17} />Compare algorithms</button>
        <button className={page === 'reference' ? 'nav-active' : ''} onClick={() => { setPage('reference'); setSidebarOpen(false); }}><BookOpen size={17} />Collective reference</button>
      </nav>
      <div className="side-section-heading">{t.operations}<span>8</span></div>
      <nav className="operation-nav" aria-label="Collective operations">{(Object.keys(operations) as Operation[]).map(op => {
        const Icon = operationIcons[op];
        return <button key={op} className={config.operation === op && page === 'simulator' ? 'operation-active' : ''} onClick={() => chooseOperation(op)}><Icon size={18} /><span>{op}<small>{shortDescriptions[op]}</small></span>{config.operation === op && page === 'simulator' && <span className="active-dot" />}</button>;
      })}</nav>
      <div className="sidebar-bottom"><div className="local-status"><span className="status-dot" />Runs in your browser<span className="version">v1.0</span></div><p>No GPUs required. Just curiosity.</p><a href="https://github.com/devinjeon/gpu-comm-visualizer" target="_blank" rel="noreferrer">Inspired by gpu-comm-visualizer<ExternalLink size={12} /></a></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={19} /></IconButton><span>Workspace</span><ChevronRight size={14} /><strong>{page === 'simulator' ? 'Simulator' : page === 'compare' ? 'Compare algorithms' : 'Reference'}</strong></div><div className="topbar-right"><span className="educational"><span className="status-dot" />Interactive simulation</span><span className="topbar-divider" /><a href="https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html" target="_blank" rel="noreferrer">{t.docs}<ExternalLink size={13} /></a></div></header>
      <main id="main">
        <div className="page-heading"><div><h1>{page === 'simulator' ? t.playground : page === 'compare' ? t.comparison : t.reference}</h1><p>{page === 'simulator' ? t.playgroundDescription : page === 'compare' ? 'Find the trade-off between latency, bandwidth, and scale.' : 'Eight patterns. The building blocks of distributed computing.'}</p></div><div className="heading-actions">{page === 'compare' && <a className="button" href="#benchmark-import"><Download size={15} /><span>Import benchmark</span></a>}<button className="button subtle" onClick={exportTrace}><Download size={15} /><span>Export trace</span></button><button className="button" onClick={() => copy(window.location.href, 'Configuration link copied')}><Share2 size={15} /><span>Share configuration</span></button></div></div>
        {page === 'reference' ? <Reference onChoose={chooseOperation} /> : <>
          <div className="operation-heading"><div className="operation-title"><span className="operation-symbol"><Network size={20} /></span><h2>{config.operation}</h2><span className="tag">{operations[config.operation].tag}</span></div><span className="operation-formula">{operations[config.operation].formula}</span></div>
          <p className="operation-description">{operations[config.operation].en}</p>
          <div className="configuration">
            <Field label="Algorithm"><select aria-label="Algorithm" value={config.algorithm} onChange={e => update({ algorithm: e.target.value as Algorithm })}>{operations[config.operation].algorithms.map(alg => <option key={alg}>{alg}</option>)}</select></Field>
            <Field label="GPU count"><select aria-label="GPU count" value={config.ranks} onChange={e => update({ ranks: Number(e.target.value) })}>{[2, 4, 8, 16].map(n => <option key={n} value={n}>{n} GPUs</option>)}</select></Field>
            <Field label="Tensor size" hint="Full logical tensor footprint. AllGather: total output. ReduceScatter: total input. Gather/Scatter: total root buffer. AllToAll: total send buffer per rank."><select aria-label="Tensor size" value={config.sizeMiB} onChange={e => update({ sizeMiB: Number(e.target.value) })}>{[0.00390625, 0.0625, 1, 4, 16, 32, 64, 256].map(n => <option key={n} value={n}>{formatBytes(n * 1048576)}</option>)}</select></Field>
            <Field label={isRooted(config.operation) ? 'Root rank' : 'Reduction'}><select aria-label={isRooted(config.operation) ? 'Root rank' : 'Reduction'} disabled={!isRooted(config.operation) && !isReduction(config.operation)} value={isRooted(config.operation) ? config.root : isReduction(config.operation) ? config.reduction : 'none'} onChange={e => isRooted(config.operation) ? update({ root: Number(e.target.value) }) : update({ reduction: e.target.value as Reduction })}>{isRooted(config.operation) ? Array.from({ length: config.ranks }, (_, i) => <option key={i} value={i}>Rank {i}</option>) : isReduction(config.operation) ? ['Sum', 'Average', 'Min', 'Max'].map(red => <option key={red}>{red}</option>) : <option value="none">Not applicable</option>}</select></Field>
            <Field label="Interconnect model"><select aria-label="Interconnect model" value={config.bandwidth} onChange={e => { const bandwidth = Number(e.target.value); update({ bandwidth, latency: bandwidth <= 32 ? 5 : 2 }); }}>{bandwidths.map(b => <option key={b.value} value={b.value}>{b.label} · {b.value} GB/s</option>)}</select></Field>
            <IconButton label="Model settings" className={settingsOpen ? 'settings-active' : ''} onClick={() => setSettingsOpen(v => !v)}><Settings2 size={18} /></IconButton>
          </div>
          {settingsOpen && <div className="settings-panel"><div><h3><Settings2 size={16} />Simulation assumptions</h3><p>One synchronous transfer round at a time, full-duplex links, no overlap between rounds. Bandwidth is a per-rank, one-direction budget; concurrent sends share it.</p></div><div className="settings-facts"><span>Link startup <strong>{config.latency} µs / round</strong></span><span>Data type <strong>float32</strong></span><span>Partition <strong>{formatBytes(config.sizeMiB * 1048576 / config.ranks)}</strong></span><span>Reduction cost <strong>Not modeled</strong></span></div>{isReduction(config.operation) && isRooted(config.operation) && <Field label="Reduction"><select aria-label="Reduction" value={config.reduction} onChange={e => update({ reduction: e.target.value as Reduction })}>{['Sum', 'Average', 'Min', 'Max'].map(v => <option key={v}>{v}</option>)}</select></Field>}<p className="settings-caveat">Illustrative link presets, not device specifications. No NCCL channels, protocol efficiency, kernel launch overhead, pipelining, or physical topology contention. Tree uses a single binomial tree; Naive is a direct baseline.</p></div>}
          {page === 'compare' ? <Comparison config={config} onSelect={algorithm => { update({ algorithm }); setPage('simulator'); }} /> : <>
            <section className="simulation-panel" aria-label="Interactive collective simulator"><div className="visualization-grid"><div className="topology-panel"><div className="panel-heading"><h3><Network size={16} />{t.topology}<span className="small-tag">{config.algorithm}</span></h3><span className="panel-caption">{config.ranks} ranks · full duplex</span></div><Topology config={config} frame={frame} step={step} total={total} selectedRank={rank} onSelectRank={setRank} playing={playing} stepDurationMs={stepDurationMs} /><div className="graph-legend"><span><i className="legend-line active" />Active transfer</span><span><i className="legend-line" />Logical link</span><span><i className="legend-square" />Data partition</span><span className="graph-hint">Select a GPU to inspect</span></div></div>
              <aside className="inspector"><div className="panel-heading"><h3>{t.inspector}</h3><span className={`live-label ${playing ? 'running' : ''}`}><span />{playing ? 'RUNNING' : completed ? 'COMPLETE' : step ? 'PAUSED' : 'READY'}</span></div><div className="inspector-body"><div className="phase-count">STEP <b>{String(step).padStart(2, '0')}</b><span>/ {String(total).padStart(2, '0')}</span></div><h3 className="phase-title">{completed ? t.complete : step ? frame.phase : t.initial}</h3><p className="phase-description">{completed ? t.completeDescription : !step ? t.initialDescription : frame.phase === 'Reduce-scatter' ? 'Each rank sends one partition clockwise. The receiver combines it with its local contribution.' : frame.phase === 'All-gather' ? 'Each rank forwards a complete partition. Results propagate until every rank has the full buffer.' : frame.description}</p><div className="step-facts"><span>Transfers this step<strong>{frame.transfers.length}<span> parallel</span></strong></span><span>Payload / transfer<strong>{frame.transfers[0] ? formatBytes(frame.transfers[0].bytes) : '—'}</strong></span><span>Model elapsed<strong>{formatTime(frame.timeUs)}</strong></span></div>
              <div className="rank-inspection"><div className="rank-inspection-heading"><span><Cpu size={15} />GPU {rank}</span><span>rank {rank}</span></div><div className="rank-chunks">{frame.buffers[rank].map((cell, i) => <div key={i} style={{ '--chunk-color': chunkColors[i] } as CSSProperties} className={cell ? 'filled' : ''} title={`Chunk ${i}: ${cell ? valueOf(cell, config.reduction) : 'empty'}`}>{cell ? formatValue(valueOf(cell, config.reduction)) : '·'}</div>)}</div><p>{frame.buffers[rank].filter(Boolean).length} / {config.ranks} partitions populated</p></div>
              <div className="inspector-tip"><CircleHelp size={15} /><p>{config.algorithm === 'Ring' ? 'A logical ring is an ordering of ranks, not a physical cabling diagram.' : config.algorithm === 'Tree' ? 'A single binomial tree illustrates the dependency structure. NCCL may use multiple trees.' : 'Direct communication provides a simple baseline. Hardware concurrency can change the trade-off.'}</p></div></div></aside></div>
              <div className="playback"><div className="playback-controls"><IconButton label="Reset simulation (R)" onClick={() => goTo(0)} disabled={step === 0 && !playing}><RotateCcw size={16} /></IconButton><IconButton label="Previous step (left arrow)" onClick={() => goTo(step - 1)} disabled={step === 0}><SkipBack size={16} /></IconButton><button className="play-button" onClick={togglePlay} aria-label={playing ? 'Pause simulation' : completed ? 'Replay simulation' : 'Play simulation'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}<span>{playing ? 'Pause' : completed ? 'Replay' : 'Play'}</span></button><IconButton label="Next step (right arrow)" onClick={() => goTo(step + 1)} disabled={completed}><SkipForward size={16} /></IconButton><span className="playback-divider" /><label className="speed-control"><span>Speed</span><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.25, 0.5, 1, 1.5, 2, 4].map(v => <option key={v} value={v}>{v}×</option>)}</select></label><span className="keyboard-hint"><kbd>space</kbd> to {playing ? 'pause' : 'play'}</span><span className="step-indicator">Step <b>{step}</b> of {total}</span></div><div className="timeline">{frames.slice(1).map((f, i) => <button key={i} aria-label={`Go to step ${i + 1}: ${f.phase}`} aria-current={step === i + 1 ? 'step' : undefined} title={`Step ${i + 1} · ${f.phase}`} className={`${step >= i + 1 ? 'done' : ''} ${step === i + 1 ? 'current' : ''} ${f.phase === 'All-gather' || f.phase === 'Broadcast' ? 'gather-step' : ''}`} onClick={() => goTo(i + 1)}><span>{i + 1}</span></button>)}</div><div className="phase-track">{phaseGroups(frames).map(g => <button key={g.phase} onClick={() => goTo(g.start)} style={{ flex: g.count }}><span className={g.phase === 'All-gather' || g.phase === 'Broadcast' ? 'cyan-dot' : 'green-dot'} /><span>{g.phase}</span><small>{g.count} steps</small></button>)}</div></div>
            </section>
            <div className="metrics-strip"><Metric label="Communication steps" value={String(total)} suffix="rounds" note={config.algorithm === 'Ring' ? config.operation === 'AllReduce' ? '2(N − 1)' : 'N − 1' : config.algorithm === 'Tree' ? config.operation === 'AllReduce' ? '2⌈log₂ N⌉' : '⌈log₂ N⌉' : 'Direct schedule'} /><Metric label="Total network traffic" value={formatBytes(stats.totalBytes).split(' ')[0]} suffix={formatBytes(stats.totalBytes).split(' ')[1]} note="Summed over all senders" /><Metric label="Estimated completion" value={formatTime(stats.duration).split(' ')[0]} suffix={formatTime(stats.duration).split(' ')[1]} note="α–β communication model" /><Metric label="Algorithm bandwidth" value={stats.algbw.toFixed(1)} suffix="GB/s" note="Logical tensor bytes / time" /></div>
            <section className="detail-panel"><div className="detail-header"><div className="detail-tabs" role="tablist" aria-label="Simulation details">{([{ id: 'buffers', label: 'Rank buffers', icon: Layers }, { id: 'transfers', label: 'Transfer log', icon: Terminal }, { id: 'code', label: 'NCCL code', icon: Code2 }] as const).map(item => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}><item.icon size={15} />{item.label}{item.id === 'transfers' && <span>{frames.slice(0, step + 1).reduce((s, f) => s + f.transfers.length, 0)}</span>}</button>)}</div><span className="detail-caption">{tab === 'buffers' ? 'One scalar sample per partition' : tab === 'transfers' ? 'Deterministic execution trace' : 'C++ · illustrative API usage'}</span>{tab === 'code' && <IconButton label="Copy NCCL code" onClick={() => copy(codeFor(config), 'NCCL code copied')}><Copy size={15} /></IconButton>}</div><div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === 'buffers' ? <BufferTable config={config} frame={frame} selectedRank={rank} onSelectRank={setRank} complete={completed} /> : tab === 'transfers' ? <TransferLog config={config} frames={frames} step={step} /> : <pre className="code-block"><code>{codeFor(config)}</code></pre>}</div></section>
          </>}
        </>}
        <footer className="page-footer"><span><CircleDot size={13} />{t.modelNote}</span><span>Built for understanding distributed systems.<a href="https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md" target="_blank" rel="noreferrer">Model reference<ExternalLink size={11} /></a></span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

function formatValue(value: number | null) { return value == null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1); }
function phaseGroups(frames: Frame[]) {
  const groups: { phase: string; count: number; start: number }[] = [];
  frames.slice(1).forEach((frame, i) => { const last = groups[groups.length - 1]; if (last?.phase === frame.phase) last.count++; else groups.push({ phase: frame.phase, count: 1, start: i + 1 }); });
  return groups;
}
function Metric({ label, value, suffix, note }: { label: string; value: string; suffix: string; note: string }) { return <div className="metric"><span>{label}</span><div><strong>{value}</strong><span>{suffix}</span></div><small>{note}</small></div>; }

function startTransfer(animation: SVGElement | null) {
  if (animation instanceof SVGAnimateMotionElement) animation.beginElement();
}

function Topology({ config, frame, step, total, selectedRank, onSelectRank, playing, stepDurationMs }: { config: Config; frame: Frame; step: number; total: number; selectedRank: number; onSelectRank: (rank: number) => void; playing: boolean; stepDurationMs: number }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { ranks: n, algorithm } = config;
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReducedMotion(query.matches); sync(); query.addEventListener('change', sync); return () => query.removeEventListener('change', sync); }, []);
  useEffect(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, [n, algorithm]);
  const positions = Array.from({ length: n }, (_, i) => {
    if (algorithm === 'Tree') {
      // The fixed binomial layout follows the same rooted tree as the schedule.
      const logical = (i - config.root + n) % n;
      const depth = (value: number) => value.toString(2).split('1').length - 1;
      const level = depth(logical);
      const maxLevel = Math.log2(n);
      const peers = Array.from({ length: n }, (_, r) => r).filter(r => depth(r) === level);
      return { x: 450 + ((peers.indexOf(logical) + 0.5) / peers.length - 0.5) * 690, y: 65 + level * 350 / maxLevel };
    }
    const angle = -Math.PI / 2 + i * Math.PI * 2 / n;
    return { x: 450 + Math.cos(angle) * (n > 8 ? 330 : 270), y: 250 + Math.sin(angle) * (n > 8 ? 194 : 180) };
  });
  const baseEdges: { from: number; to: number }[] = [];
  if (algorithm === 'Ring') for (let r = 0; r < n; r++) baseEdges.push({ from: r, to: (r + 1) % n });
  else if (algorithm === 'Tree') {
    for (let stride = 1; stride < n; stride *= 2) for (let i = 0; i < n; i += stride * 2) if (i + stride < n) baseEdges.push({ from: (i + config.root) % n, to: (i + stride + config.root) % n });
  } else if (config.operation === 'AllToAll') { for (let r = 0; r < n; r++) for (let j = r + 1; j < n; j++) baseEdges.push({ from: r, to: j }); }
  else { for (let r = 0; r < n; r++) if (r !== config.root) baseEdges.push({ from: config.root, to: r }); }
  const nodeWidth = n > 8 ? 88 : 122;
  const nodeHeight = n > 8 ? 49 : 64;
  function path(from: number, to: number) {
    const a = positions[from], b = positions[to]; const dx = b.x - a.x, dy = b.y - a.y;
    const ratio = Math.min((nodeWidth / 2 + 7) / Math.max(Math.abs(dx), 0.001), (nodeHeight / 2 + 7) / Math.max(Math.abs(dy), 0.001), 0.42);
    return `M ${a.x + dx * ratio} ${a.y + dy * ratio} L ${b.x - dx * ratio} ${b.y - dy * ratio}`;
  }
  const cyan = frame.phase === 'All-gather' || frame.phase === 'Broadcast';
  return <div className={`topology-canvas ${playing ? 'is-playing' : ''}`}>
    <div className="canvas-label"><span className="status-dot" />{algorithm === 'Tree' ? 'Binomial tree' : algorithm === 'Ring' ? 'Unidirectional ring' : 'Direct communication'}<span>LOGICAL TOPOLOGY</span></div>
    <svg ref={svgRef} className="topology-svg" viewBox="0 0 900 500" role="group" aria-label={`${n} GPU ${algorithm} topology, step ${step} of ${total}. Select a GPU to inspect its buffer.`} onPointerDown={e => { if ((e.target as SVGElement).closest('[data-rank]')) return; drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current) return; const scale = 900 / e.currentTarget.clientWidth; setOffset({ x: drag.current.ox + (e.clientX - drag.current.x) * scale, y: drag.current.oy + (e.clientY - drag.current.y) * scale }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id="canvas-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#2a302b" /></pattern><marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b2e879" /></marker><marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#70c5d0" /></marker></defs>
      <rect width="900" height="500" fill="url(#canvas-dots)" />
      <g transform={`translate(${450 + offset.x}, ${250 + offset.y}) scale(${zoom}) translate(-450,-250)`}>
        {baseEdges.map((edge, i) => <path key={`base-${i}`} d={path(edge.from, edge.to)} className="base-edge" />)}
        {frame.transfers.map((transfer, i) => <g key={`${step}-${stepDurationMs}-${i}`}><path d={path(transfer.from, transfer.to)} className={`active-edge ${cyan ? 'cyan-edge' : ''}`} markerEnd={`url(#arrow-${cyan ? 'cyan' : 'green'})`} />{playing && !reducedMotion && <circle r="3.5" fill={cyan ? '#a0ebed' : '#d4ffa3'}><animateMotion ref={startTransfer} begin="indefinite" dur={`${stepDurationMs * 0.8}ms`} repeatCount="1" fill="freeze" path={path(transfer.from, transfer.to)} /></circle>}</g>)}
        {algorithm !== 'Tree' && <g className="graph-center"><circle cx="450" cy="244" r="39" fill="#1c231a" stroke="#333f2b" strokeWidth="1" /><g transform="translate(435,229)"><Network size={30} color="#b2e879" strokeWidth={1.3} /></g><text x="450" y="311" textAnchor="middle" className="graph-center-title">{algorithm === 'Ring' ? 'Ring' : 'Direct'} {config.operation}</text><text x="450" y="332" textAnchor="middle" className="graph-center-subtitle">{step === total && !playing ? 'Collective complete' : step ? frame.phase : `${n} GPUs · ${formatBytes(config.sizeMiB * 1048576)} tensor`}</text></g>}
        {positions.map((point, r) => {
          const active = frame.transfers.some(t => t.to === r || t.from === r);
          const isSelected = r === selectedRank;
          const size = (nodeWidth - 20) / n;
          return <g key={r} data-rank={r} role="button" tabIndex={0} aria-label={`Inspect GPU ${r}`} aria-pressed={isSelected} className={`gpu-node ${active ? 'gpu-active' : ''} ${isSelected ? 'gpu-selected' : ''}`} transform={`translate(${point.x - nodeWidth / 2}, ${point.y - nodeHeight / 2})`} onClick={() => onSelectRank(r)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelectRank(r); } }}>
            <rect className="gpu-background" width={nodeWidth} height={nodeHeight} rx="7" /><g transform={`translate(10,${n > 8 ? 10 : 13})`}><Cpu size={n > 8 ? 13 : 17} strokeWidth={1.5} /></g><text x={n > 8 ? 29 : 36} y={n > 8 ? 20 : 26} className="gpu-title">GPU {r}</text>{isRooted(config.operation) && r === config.root ? <circle cx={nodeWidth - 12} cy={n > 8 ? 16 : 21} r="3" fill="#b2e879" /> : <circle cx={nodeWidth - 12} cy={n > 8 ? 16 : 21} r="2.5" fill={active ? '#b2e879' : '#59674e'} />}
            {frame.buffers[r].map((cell, i) => <rect key={i} x={10 + i * size} y={nodeHeight - 19} width={Math.max(2, size - 3)} height="8" rx="1.5" fill={cell ? chunkColors[i] : '#282e28'} opacity={cell ? 0.9 : 0.65} />)}
            {isSelected && <text x={nodeWidth / 2} y={nodeHeight + 16} textAnchor="middle" className="selected-rank-label">SELECTED</text>}
          </g>;
        })}
      </g>
    </svg>
    <div className="canvas-controls"><IconButton label="Zoom out" onClick={() => setZoom(z => Math.max(0.6, z - 0.15))} disabled={zoom <= 0.6}><Minus size={15} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))} disabled={zoom >= 1.6}><Plus size={15} /></IconButton><span className="control-separator" /><IconButton label="Fit topology to view" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 size={14} /></IconButton></div>
    <span className="canvas-bottom-label">{config.algorithm === 'Ring' ? `rank i → rank (i + 1) mod ${n}` : config.algorithm === 'Tree' ? `root = ${config.root} · depth = ${Math.ceil(Math.log2(n))}` : config.operation === 'AllToAll' ? 'pairwise cyclic exchange' : `root = ${config.root} · direct fan-in / fan-out`}</span>
  </div>;
}

function BufferTable({ config, frame, selectedRank, onSelectRank, complete }: { config: Config; frame: Frame; selectedRank: number; onSelectRank: (rank: number) => void; complete: boolean }) {
  return <><div className="table-scroll"><table className="buffer-table"><thead><tr><th>Device / rank</th>{Array.from({ length: config.ranks }, (_, i) => <th key={i}><span className="chunk-header"><i style={{ background: chunkColors[i] }} />C{i}</span></th>)}<th>Buffer state</th></tr></thead><tbody>{frame.buffers.map((row, r) => <tr key={r} className={r === selectedRank ? 'selected-row' : ''}><th><button onClick={() => onSelectRank(r)}><Cpu size={14} />GPU {r}{isRooted(config.operation) && r === config.root && <span className="root-tag">root</span>}</button></th>{row.map((cell, i) => <td key={i}><span className={`buffer-value ${cell ? 'has-value' : ''}`} style={cell ? { color: chunkColors[i], background: `${chunkColors[i]}0d` } : {}} title={cell ? `Chunk ${i} · contributing ranks: ${cell.sources.join(', ')} · ${config.reduction}: ${cell.values.join(', ')}` : 'No data in this partition'}>{formatValue(valueOf(cell, config.reduction))}</span></td>)}<td><span className={`buffer-state ${complete && (!['Gather', 'Reduce'].includes(config.operation) || r === config.root) ? 'ready' : ''}`}>{complete && (!['Gather', 'Reduce'].includes(config.operation) || r === config.root) ? <><CheckCheck size={13} />Output ready</> : <><span className="buffer-state-dot" />{frame.phase === 'Initialize' ? 'Initialized' : 'Working buffer'}</>}</span></td></tr>)}</tbody></table></div><div className="table-note"><CircleHelp size={13} />{config.operation === 'AllToAll' ? 'Sample X[source][destination] = 100 × (source + 1) + destination. Columns are ordered by source rank.' : 'Sample X[rank][chunk] = 10 × (rank + 1) + chunk. Hover a value to see its contributing ranks.'}<span>Values illustrate float32 partitions.</span></div></>;
}

function TransferLog({ config, frames, step }: { config: Config; frames: Frame[]; step: number }) {
  if (!step) return <div className="empty-state"><Terminal size={27} /><h3>Your execution trace starts here</h3><p>Play the collective or advance one step to inspect every transfer.</p></div>;
  return <div className="table-scroll transfer-scroll"><table className="transfer-table"><thead><tr><th>Step</th><th>Phase</th><th>Route</th><th>Partition</th><th>Action</th><th>Payload</th><th>Sent sample</th></tr></thead><tbody>{frames.slice(1, step + 1).flatMap((f, s) => f.transfers.map((transfer, i) => <tr key={`${s}-${i}`} className={s + 1 === step ? 'current-transfer' : ''}><td>{String(s + 1).padStart(2, '0')}</td><td>{f.phase}</td><td><span className="transfer-route">GPU {transfer.from}<ArrowRight size={12} />GPU {transfer.to}</span></td><td>{transfer.chunks.length === config.ranks ? 'Full buffer' : `C${transfer.chunks[0]}`}</td><td><span className={transfer.reduce ? 'reduce-label' : 'copy-label'}>{transfer.reduce ? config.reduction.toUpperCase() : 'COPY'}</span></td><td>{formatBytes(transfer.bytes)}</td><td>{transfer.values.map(v => formatValue(v)).join(', ')}</td></tr>)).reverse()}</tbody></table></div>;
}

function Comparison({ config, onSelect }: { config: Config; onSelect: (alg: Algorithm) => void }) {
  const algorithms = operations[config.operation].algorithms;
  const results = algorithms.map(algorithm => ({ algorithm, ...metrics({ ...config, algorithm }), steps: simulate({ ...config, algorithm }).length - 1 }));
  const sizes = [0.00390625, 0.0625, 1, 4, 16, 64, 256];
  const colors = ['#b2e879', '#70c5d0', '#c3a1e5'];
  const series = algorithms.map(algorithm => sizes.map(sizeMiB => metrics({ ...config, algorithm, sizeMiB }).duration));
  const maxLog = Math.ceil(Math.log10(Math.max(...series.flat())));
  const minLog = Math.floor(Math.log10(Math.min(...series.flat())));
  const plotY = (v: number) => 280 - (Math.log10(v) - minLog) / Math.max(1, maxLog - minLog) * 230;
  return <div className="comparison-content"><section className="comparison-chart"><div className="panel-heading"><h3><Activity size={16} />Completion time vs. tensor size</h3><span className="small-tag">MODEL ESTIMATE</span></div><div className="chart-legend">{algorithms.map((a, i) => <span key={a}><i style={{ background: colors[i] }} />{a}</span>)}</div><svg viewBox="0 0 900 340" role="img" aria-label="Model-estimated completion time across tensor sizes. Exact values for the selected size are in the comparison table."><text x="20" y="23" className="axis-label">Time (µs, log scale)</text>{Array.from({ length: maxLog - minLog + 1 }, (_, i) => { const value = 10 ** (minLog + i), y = plotY(value); return <g key={i}><line x1="85" x2="850" y1={y} y2={y} className="chart-grid" /><text x="72" y={y + 4} textAnchor="end" className="axis-label">{value.toLocaleString()}</text></g>; })}{sizes.map((size, i) => <text key={size} x={100 + i * 120} y="312" textAnchor="middle" className="axis-label">{formatBytes(size * 1048576)}</text>)}{series.map((values, s) => <g key={s}><path d={values.map((v, i) => `${i ? 'L' : 'M'} ${100 + i * 120} ${plotY(v)}`).join(' ')} stroke={colors[s]} strokeWidth="2" fill="none" />{values.map((v, i) => <circle key={i} cx={100 + i * 120} cy={plotY(v)} r="4" fill="#171b16" stroke={colors[s]} strokeWidth="2"><title>{algorithms[s]} · {formatBytes(sizes[i] * 1048576)} · {formatTime(v)}</title></circle>)}</g>)}</svg></section><section className="detail-panel"><div className="panel-heading"><h3>At {formatBytes(config.sizeMiB * 1048576)} · {config.ranks} ranks</h3><span className="panel-caption">Same link budget for every algorithm</span></div><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Algorithm</th><th>Rounds</th><th>Completion</th><th>Algorithm BW</th><th>Bus BW</th><th>Explore</th></tr></thead><tbody>{results.map((r, i) => <tr key={r.algorithm}><th><span className="algorithm-label"><i style={{ background: colors[i] }} />{r.algorithm}</span></th><td>{r.steps}</td><td>{formatTime(r.duration)}</td><td>{r.algbw.toFixed(2)} GB/s</td><td>{r.busbw === null ? 'Not defined' : `${r.busbw.toFixed(2)} GB/s`}</td><td><button className="text-button" onClick={() => onSelect(r.algorithm)}>Simulate<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div></section><BenchmarkPanel config={config} /><div className="model-explanation"><div><h3>The cost of a collective</h3><code>T = Σrounds (α + max(bytes sent, bytes received) / B)</code><p>For each round, take the largest per-rank traffic budget. α is link startup latency, B is one-direction bandwidth. Algorithm bandwidth is logical tensor size / T. Bus bandwidth applies the NCCL-tests collective correction factor.</p></div><div><h3>Read the model, not a benchmark</h3><p>Ring partitions the tensor and overlaps transfers across ranks. The single-tree baseline sends full buffers through a binomial tree. Direct reduction and broadcast are serialized. Real NCCL uses additional algorithms, multiple channels, protocols, and overlapping work, so these curves do not predict a hardware winner.</p><a href="https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md" target="_blank" rel="noreferrer">NCCL-tests bandwidth definitions<ExternalLink size={13} /></a></div></div></div>;
}

function Reference({ onChoose }: { onChoose: (op: Operation) => void }) {
  return <div className="reference-content"><div className="reference-intro"><Network size={30} /><div><h2>One operation. A coordinated world of ranks.</h2><p>A collective is called by every participating rank with compatible counts and data types. The communication pattern determines where data moves; the operation determines what the output means.</p></div></div><section className="detail-panel"><div className="table-scroll"><table className="reference-table"><thead><tr><th>Collective</th><th>Output semantics</th><th>Visualized algorithms</th><th>Explore</th></tr></thead><tbody>{(Object.keys(operations) as Operation[]).map(op => <tr key={op}><th>{op}<small>{operations[op].formula}</small></th><td>{operations[op].en}</td><td>{operations[op].algorithms.map(alg => <span className="small-tag" key={alg}>{alg}</span>)}</td><td><IconButton label={`Explore ${op}`} onClick={() => onChoose(op)}><ArrowRight size={16} /></IconButton></td></tr>)}</tbody></table></div></section><div className="reference-notes"><article><GitBranch size={21} /><h3>Algorithms are implementations</h3><p>Ring, tree, and direct communication are ways to implement collective semantics. This tool shows representative schedules, not an exhaustive list of NCCL algorithms. Actual selection depends on topology, message size, and runtime tuning.</p></article><article><Layers size={21} /><h3>Partitions preserve rank order</h3><p>AllGather places each source rank at its corresponding output offset. ReduceScatter gives rank i the reduced i-th partition. AllToAll uses destination offsets in the send buffer and source offsets in the receive buffer.</p></article><article><Code2 size={21} /><h3>From model to runtime</h3><p>Code examples show NCCL API usage with float32 buffers. Gather, Scatter, and AllToAll examples use grouped send/receive for a portable formulation. Setup, allocation, and error handling are omitted from the snippets.</p></article></div><div className="source-list"><h3>Go to the source</h3><a href="https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html" target="_blank" rel="noreferrer"><span>NVIDIA NCCL User Guide<small>Collective semantics and API documentation</small></span><ExternalLink size={16} /></a><a href="https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md" target="_blank" rel="noreferrer"><span>NCCL-tests performance guide<small>Algorithm bandwidth and bus bandwidth</small></span><ExternalLink size={16} /></a><a href="https://github.com/devinjeon/gpu-comm-visualizer" target="_blank" rel="noreferrer"><span>gpu-comm-visualizer<small>Original inspiration by devinjeon</small></span><ExternalLink size={16} /></a></div><p className="independent-note">NCCL Lab is an independent educational project and is not affiliated with or endorsed by NVIDIA.</p></div>;
}
