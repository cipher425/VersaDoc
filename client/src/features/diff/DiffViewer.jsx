import { Fragment, useState } from 'react';
import { Columns2, Rows3, MessageSquarePlus } from 'lucide-react';
import { cn } from '../../lib/cn';

const rowBg = { add: 'bg-emerald-50', del: 'bg-red-50', context: 'bg-white', empty: 'bg-slate-50' };
const markBg = { ins: 'bg-emerald-200/80', del: 'bg-red-200/80' };

function LineText({ line }) {
  if (!line?.segments) return <>{line?.text || ' '}</>;
  return line.segments.map((s, i) => (
    <span key={i} className={cn(markBg[s.type], 'rounded-sm')}>{s.text}</span>
  ));
}

/** Pairs deleted and added lines side by side (like GitHub's split view). */
function toSplitRows(lines) {
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'context') {
      rows.push({ left: lines[i], right: lines[i] });
      i++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++]);
    while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k] || null, right: adds[k] || null });
  }
  return rows;
}

const anchorOf = (line) => (line.type === 'del' ? { side: 'old', line: line.oldNo } : { side: 'new', line: line.newNo });
const keyOf = (a) => `${a.side}:${a.line}`;

/**
 * Renders the server's diff (hunks with line numbers and word highlights).
 * Optional line comments: onLineComment(anchor, text) + renderLineExtras(key).
 */
export function DiffViewer({ diff, onLineComment, renderLineExtras, defaultMode = 'unified' }) {
  const [mode, setMode] = useState(() => (window.innerWidth < 900 ? 'unified' : defaultMode));
  if (!diff) return null;
  const { hunks, stats, truncated } = diff;

  const numCell = 'w-12 select-none border-r border-slate-100 px-2 text-right align-top font-mono text-xs text-slate-400';
  const commentBtn = (line) =>
    onLineComment && line ? (
      <button
        onClick={() => onLineComment(anchorOf(line), line.text)}
        className="invisible absolute -left-1 top-0.5 rounded bg-brand-600 p-0.5 text-white group-hover:visible"
        aria-label="Comment on this line"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </button>
    ) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <p className="text-sm">
          <span className="font-semibold text-emerald-600">+{stats.additions}</span>{' '}
          <span className="font-semibold text-red-600">-{stats.deletions}</span>{' '}
          <span className="text-slate-500">lines</span>
          {truncated && <span className="ml-2 text-xs text-amber-700">(very large change - shown as a block)</span>}
        </p>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {[['unified', Rows3], ['split', Columns2]].map(([m, Icon]) => (
            <button key={m} onClick={() => setMode(m)} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', mode === m ? 'bg-slate-900 text-white' : 'text-slate-600')}>
              <Icon className="h-3.5 w-3.5" /> {m === 'unified' ? 'Unified' : 'Split'}
            </button>
          ))}
        </div>
      </div>
      {!hunks.length ? (
        <p className="p-8 text-center text-sm text-slate-500">No differences.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[13px] leading-6">
            <tbody>
              {hunks.map((h, hi) => (
                <Fragment key={hi}>
                  <tr className="bg-brand-50/60">
                    <td colSpan={mode === 'split' ? 4 : 3} className="px-3 py-1 text-xs text-brand-700">
                      @@ -{h.oldStart},{h.oldCount} +{h.newStart},{h.newCount} @@
                    </td>
                  </tr>
                  {mode === 'unified'
                    ? h.lines.map((line, li) => {
                        const key = keyOf(anchorOf(line));
                        return (
                          <Fragment key={li}>
                            <tr className={rowBg[line.type]}>
                              <td className={numCell}>{line.oldNo ?? ''}</td>
                              <td className={numCell}>{line.newNo ?? ''}</td>
                              <td className="group relative whitespace-pre-wrap break-words px-3">
                                {commentBtn(line)}
                                <span className={cn('mr-2 select-none', line.type === 'add' ? 'text-emerald-600' : line.type === 'del' ? 'text-red-600' : 'text-slate-300')}>
                                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                                </span>
                                <LineText line={line} />
                              </td>
                            </tr>
                            {renderLineExtras?.(key) && (
                              <tr><td colSpan={3} className="bg-slate-50 px-4 py-2 font-sans">{renderLineExtras(key)}</td></tr>
                            )}
                          </Fragment>
                        );
                      })
                    : toSplitRows(h.lines).map((row, ri) => {
                        const extras = [row.left, row.right].filter(Boolean).map((l) => renderLineExtras?.(keyOf(anchorOf(l)))).find(Boolean);
                        return (
                          <Fragment key={ri}>
                            <tr>
                              <td className={cn(numCell, row.left ? rowBg[row.left.type === 'context' ? 'context' : 'del'] : rowBg.empty)}>{row.left?.oldNo ?? ''}</td>
                              <td className={cn('group relative w-1/2 whitespace-pre-wrap break-words border-r border-slate-200 px-3', row.left ? rowBg[row.left.type] : rowBg.empty)}>
                                {row.left?.type === 'del' && commentBtn(row.left)}
                                <LineText line={row.left} />
                              </td>
                              <td className={cn(numCell, row.right ? rowBg[row.right.type === 'context' ? 'context' : 'add'] : rowBg.empty)}>{row.right?.newNo ?? ''}</td>
                              <td className={cn('group relative w-1/2 whitespace-pre-wrap break-words px-3', row.right ? rowBg[row.right.type] : rowBg.empty)}>
                                {row.right && commentBtn(row.right)}
                                <LineText line={row.right} />
                              </td>
                            </tr>
                            {extras && <tr><td colSpan={4} className="bg-slate-50 px-4 py-2 font-sans">{extras}</td></tr>}
                          </Fragment>
                        );
                      })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
