import { useMemo, useState } from 'react';
import { AlertTriangle, Check, FileCode2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Form';
import { cn } from '../../lib/cn';

/** Same rules as the server's resolveChunks(). */
function compose(chunks, choices) {
  const out = [];
  let c = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'ok') {
      out.push(...chunk.lines);
      continue;
    }
    const choice = choices[c++];
    if (choice === 'ours') out.push(...chunk.ours);
    else if (choice === 'theirs') out.push(...chunk.theirs);
    else if (choice === 'both') out.push(...chunk.ours, ...chunk.theirs);
    else if (choice?.custom !== undefined) out.push(...(choice.custom === '' ? [] : choice.custom.split('\n')));
  }
  return out.join('\n');
}

function Block({ title, lines, tone, selected, onPick, label }) {
  return (
    <div className={cn('flex flex-col rounded-xl border-2', selected ? 'border-brand-600' : 'border-slate-200')}>
      <div className={cn('flex items-center justify-between rounded-t-lg px-3 py-1.5 text-xs font-semibold', tone)}>
        {title}
        <Button size="sm" variant={selected ? 'primary' : 'secondary'} className="h-7" onClick={onPick}>
          {selected && <Check className="h-3.5 w-3.5" />} {label}
        </Button>
      </div>
      <pre className="min-h-12 flex-1 whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-6 text-slate-800">{lines.length ? lines.join('\n') : <span className="italic text-slate-400">(deleted)</span>}</pre>
    </div>
  );
}

/**
 * Lets a human decide each conflict the three-way merge couldn't:
 * keep current, keep incoming, keep both, or write a custom version.
 * Power users can switch to editing the whole file with Git-style conflict markers.
 */
export function ConflictResolver({ chunks, labels, withMarkers, onResolve, onCancel, submitting, submitLabel = 'Save resolution' }) {
  const conflicts = useMemo(() => chunks.filter((c) => c.type === 'conflict'), [chunks]);
  const [choices, setChoices] = useState(() => conflicts.map(() => null));
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState(withMarkers || '');
  const done = choices.every(Boolean);
  const setChoice = (i, v) => setChoices((prev) => prev.map((c, j) => (j === i ? v : c)));

  if (manual) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Edit the text and remove every <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> marker. The server rejects the merge if any marker is left.</p>
        <Textarea rows={22} className="font-mono text-[13px]" value={manualText} onChange={(e) => setManualText(e.target.value)} />
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setManual(false)}>Back to guided mode</Button>
          <div className="flex gap-2">
            {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
            <Button loading={submitting} onClick={() => onResolve(manualText)}>{submitLabel}</Button>
          </div>
        </div>
      </div>
    );
  }

  let conflictIndex = -1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}: both sides changed the same lines. Choose what to keep.</span>
        {withMarkers && <Button size="sm" variant="secondary" onClick={() => setManual(true)}><FileCode2 className="h-4 w-4" /> Edit as text</Button>}
      </div>

      {chunks.map((chunk, idx) => {
        if (chunk.type === 'ok') {
          const n = chunk.lines.length;
          return (
            <div key={idx} className="rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-500">
              {n <= 4 ? chunk.lines.join('\n') || ' ' : `${chunk.lines[0]}\n… ${n - 2} unchanged lines …\n${chunk.lines[n - 1]}`}
            </div>
          );
        }
        conflictIndex++;
        const i = conflictIndex;
        const choice = choices[i];
        return (
          <div key={idx} className="card space-y-3 p-4">
            <p className="text-sm font-semibold text-slate-900">Conflict {i + 1} of {conflicts.length}</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <Block title={labels?.ours || 'Current'} lines={chunk.ours} tone="bg-sky-50 text-sky-800" selected={choice === 'ours'} onPick={() => setChoice(i, 'ours')} label="Keep this" />
              <Block title={labels?.theirs || 'Incoming'} lines={chunk.theirs} tone="bg-emerald-50 text-emerald-800" selected={choice === 'theirs'} onPick={() => setChoice(i, 'theirs')} label="Keep this" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={choice === 'both' ? 'primary' : 'secondary'} onClick={() => setChoice(i, 'both')}>Keep both</Button>
              <Button size="sm" variant={choice?.custom !== undefined ? 'primary' : 'secondary'} onClick={() => setChoice(i, { custom: [...chunk.ours, ...chunk.theirs].join('\n') })}>Write my own</Button>
            </div>
            {choice?.custom !== undefined && (
              <Textarea rows={Math.min(12, chunk.ours.length + chunk.theirs.length + 1)} className="font-mono text-[13px]" value={choice.custom} onChange={(e) => setChoice(i, { custom: e.target.value })} />
            )}
          </div>
        );
      })}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
        <span className="text-sm text-slate-500">{choices.filter(Boolean).length} / {conflicts.length} resolved</span>
        <div className="flex gap-2">
          {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button disabled={!done} loading={submitting} onClick={() => onResolve(compose(chunks, choices))}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}
