import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { isValidRanks, isValidSizeMiB, MAX_RANKS, MAX_SIZE_MIB, MIN_RANKS, MIN_SIZE_MIB } from './simulation';

export function GpuCountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = draft.trim() !== '' && isValidRanks(Number(draft));
  return <label className="field numeric-field">
    <span>GPU count</span>
    <input aria-label="GPU count" aria-describedby="gpu-count-help" aria-invalid={!valid}
      type="number" min={MIN_RANKS} max={MAX_RANKS} step="1" value={draft}
      onChange={event => {
        const text = event.target.value;
        setDraft(text);
        if (text.trim() && isValidRanks(Number(text))) onChange(Number(text));
      }} />
    <small id="gpu-count-help" className={valid ? '' : 'input-error'}>
      {valid ? `${MIN_RANKS}–${MAX_RANKS} GPUs · one rank each` : `Enter a whole number from ${MIN_RANKS} to ${MAX_RANKS}. Using ${value}.`}
    </small>
  </label>;
}

const units = { KiB: 1 / 1024, MiB: 1, GiB: 1024 } as const;
type Unit = keyof typeof units;
function initialUnit(sizeMiB: number): Unit { return sizeMiB < 1 ? 'KiB' : sizeMiB >= 1024 ? 'GiB' : 'MiB'; }

export function TensorSizeInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [unit, setUnit] = useState<Unit>(() => initialUnit(value));
  const [draft, setDraft] = useState(() => String(value / units[unit]));
  useEffect(() => setDraft(String(value / units[unit])), [value, unit]);
  const valid = draft.trim() !== '' && isValidSizeMiB(Number(draft) * units[unit]);
  return <div className="field numeric-field">
    <span><label htmlFor="tensor-size">Tensor size</label><span title="AllGather total output; ReduceScatter total input; Gather/Scatter root buffer; AllToAll send buffer per rank."><CircleHelp size={12} aria-label="Full logical tensor footprint" /></span></span>
    <div className="tensor-input">
      <input id="tensor-size" aria-label="Tensor size" aria-describedby="tensor-size-help" aria-invalid={!valid}
        type="number" min={MIN_SIZE_MIB / units[unit]} max={MAX_SIZE_MIB / units[unit]} step="any" value={draft}
        onChange={event => {
          const text = event.target.value;
          setDraft(text);
          const sizeMiB = Number(text) * units[unit];
          if (text.trim() && isValidSizeMiB(sizeMiB)) onChange(sizeMiB);
        }} />
      <select aria-label="Tensor size unit" value={unit} onChange={event => setUnit(event.target.value as Unit)}>
        {Object.keys(units).map(name => <option key={name}>{name}</option>)}
      </select>
    </div>
    <small id="tensor-size-help" className={valid ? '' : 'input-error'}>
      {valid ? '4 B to 1 TiB · logical buffer' : 'Enter a size from 4 B to 1 TiB. Keeping the last valid size.'}
    </small>
  </div>;
}
