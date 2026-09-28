import { diffSequences } from './myers.js';
import { arraysEqual } from './text.js';

/**
 * Three-way merge (the "diff3" algorithm Git uses).
 *
 * Inputs: BASE (the common ancestor), OURS and THEIRS (two versions that both started from BASE).
 * 1. Diff BASE->OURS and BASE->THEIRS. Each gives changed regions in BASE coordinates.
 * 2. Walk BASE from top to bottom. Regions from the two sides that overlap (or touch) are grouped.
 * 3. For each group:
 *      only ours changed it    -> take ours
 *      only theirs changed it  -> take theirs
 *      both made the same edit -> take it once
 *      both changed it differently -> CONFLICT (a human must decide)
 * Unchanged BASE lines between groups are copied as-is.
 *
 * Returns { clean, conflictCount, chunks, lines }
 *   chunks: [{ type: 'ok', lines }, { type: 'conflict', base, ours, theirs }, ...]
 *   lines:  the merged document when clean, otherwise null
 */
export function merge3(base, ours, theirs, { maxEdits = 20_000 } = {}) {
  const ro = diffSequences(base, ours, { maxEdits }).regions;
  const rt = diffSequences(base, theirs, { maxEdits }).regions;
  const chunks = [];
  const pushOk = (lines) => {
    if (!lines.length) return;
    const last = chunks[chunks.length - 1];
    if (last && last.type === 'ok') for (const l of lines) last.lines.push(l);
    else chunks.push({ type: 'ok', lines: [...lines] });
  };

  let pos = 0;
  let i = 0;
  let j = 0;
  while (i < ro.length || j < rt.length) {
    const takeOurs = j >= rt.length || (i < ro.length && ro[i].aStart <= rt[j].aStart);
    const first = takeOurs ? ro[i++] : rt[j++];
    const g = { aStart: first.aStart, aEnd: first.aEnd, ours: takeOurs ? [first] : [], theirs: takeOurs ? [] : [first] };

    // Pull in every region (from either side) that overlaps or touches the group.
    for (;;) {
      if (i < ro.length && ro[i].aStart <= g.aEnd) {
        g.ours.push(ro[i]);
        g.aEnd = Math.max(g.aEnd, ro[i].aEnd);
        i++;
      } else if (j < rt.length && rt[j].aStart <= g.aEnd) {
        g.theirs.push(rt[j]);
        g.aEnd = Math.max(g.aEnd, rt[j].aEnd);
        j++;
      } else break;
    }

    pushOk(base.slice(pos, g.aStart));
    const oursText = sideSlice(base, ours, g.ours, g);
    const theirsText = sideSlice(base, theirs, g.theirs, g);
    if (!g.theirs.length) pushOk(oursText);
    else if (!g.ours.length) pushOk(theirsText);
    else if (arraysEqual(oursText, theirsText)) pushOk(oursText);
    else chunks.push({ type: 'conflict', base: base.slice(g.aStart, g.aEnd), ours: oursText, theirs: theirsText });
    pos = g.aEnd;
  }
  pushOk(base.slice(pos));

  const conflictCount = chunks.filter((c) => c.type === 'conflict').length;
  return {
    clean: conflictCount === 0,
    conflictCount,
    chunks,
    lines: conflictCount === 0 ? chunks.flatMap((c) => c.lines) : null,
  };
}

/** What one side looks like for the base range covered by a group. */
function sideSlice(base, side, regions, g) {
  if (!regions.length) return base.slice(g.aStart, g.aEnd);
  const first = regions[0];
  const last = regions[regions.length - 1];
  // Outside its regions a side is identical to base, so the offsets line up exactly.
  const start = first.bStart - (first.aStart - g.aStart);
  const end = last.bEnd + (g.aEnd - last.aEnd);
  return side.slice(start, end);
}

/**
 * Builds the final text from chunks plus the user's choice for each conflict:
 * 'ours' | 'theirs' | 'both' | 'base' | { custom: "text" }
 */
export function resolveChunks(chunks, resolutions) {
  const out = [];
  let c = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'ok') {
      out.push(...chunk.lines);
      continue;
    }
    const choice = resolutions[c++];
    if (choice === 'ours') out.push(...chunk.ours);
    else if (choice === 'theirs') out.push(...chunk.theirs);
    else if (choice === 'both') out.push(...chunk.ours, ...chunk.theirs);
    else if (choice === 'base') out.push(...chunk.base);
    else if (choice && typeof choice.custom === 'string') out.push(...(choice.custom === '' ? [] : choice.custom.split('\n')));
    else throw new Error(`Conflict ${c} has no resolution`);
  }
  return out;
}

export const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7})( |$)/m;

/** Git-style conflict markers, for people who prefer to fix conflicts by hand. */
export function withConflictMarkers(chunks, oursLabel = 'current', theirsLabel = 'incoming') {
  const out = [];
  for (const chunk of chunks) {
    if (chunk.type === 'ok') out.push(...chunk.lines);
    else out.push(`<<<<<<< ${oursLabel}`, ...chunk.ours, '=======', ...chunk.theirs, `>>>>>>> ${theirsLabel}`);
  }
  return out.join('\n');
}
