import { diffSequences, diffWords } from './myers.js';

/**
 * Turns two versions into what a reviewer sees: hunks of changed lines with a few lines
 * of unchanged context around them, line numbers on both sides, and word-level highlights.
 *
 * Result:
 *   { stats: { additions, deletions }, truncated,
 *     hunks: [{ oldStart, oldCount, newStart, newCount,
 *               lines: [{ type: 'context'|'add'|'del', oldNo?, newNo?, text, segments? }] }] }
 */
export function buildDiffView(oldLines, newLines, { context = 3, maxEdits = 20_000 } = {}) {
  const { regions, truncated } = diffSequences(oldLines, newLines, { maxEdits });
  const all = [];
  let additions = 0;
  let deletions = 0;
  let ai = 0;
  let bi = 0;

  const pushContextUntil = (aTarget) => {
    while (ai < aTarget) {
      all.push({ type: 'context', oldNo: ai + 1, newNo: bi + 1, text: oldLines[ai] });
      ai++;
      bi++;
    }
  };

  for (const r of regions) {
    pushContextUntil(r.aStart);
    const dels = [];
    const adds = [];
    for (let i = r.aStart; i < r.aEnd; i++) dels.push({ type: 'del', oldNo: i + 1, text: oldLines[i] });
    for (let j = r.bStart; j < r.bEnd; j++) adds.push({ type: 'add', newNo: j + 1, text: newLines[j] });
    // Pair "modified" lines (i-th deleted with i-th added) for word-level highlighting.
    const pairs = Math.min(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      if (dels[p].text.length > 2000 || adds[p].text.length > 2000) continue;
      const w = diffWords(dels[p].text, adds[p].text);
      if (w.useful) {
        dels[p].segments = w.oldSeg;
        adds[p].segments = w.newSeg;
      }
    }
    all.push(...dels, ...adds);
    deletions += dels.length;
    additions += adds.length;
    ai = r.aEnd;
    bi = r.bEnd;
  }
  pushContextUntil(oldLines.length);

  // Keep only changed lines plus `context` lines around them, grouped into hunks.
  const keep = new Uint8Array(all.length);
  all.forEach((line, idx) => {
    if (line.type === 'context') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(all.length - 1, idx + context); k++) keep[k] = 1;
  });

  const hunks = [];
  let current = null;
  for (let idx = 0; idx < all.length; idx++) {
    if (!keep[idx]) {
      current = null;
      continue;
    }
    const line = all[idx];
    if (!current) {
      current = { oldStart: 0, newStart: 0, oldCount: 0, newCount: 0, lines: [] };
      hunks.push(current);
    }
    current.lines.push(line);
  }
  for (const h of hunks) {
    const firstOld = h.lines.find((l) => l.oldNo);
    const firstNew = h.lines.find((l) => l.newNo);
    h.oldStart = firstOld?.oldNo ?? 0;
    h.newStart = firstNew?.newNo ?? 0;
    h.oldCount = h.lines.filter((l) => l.type !== 'add').length;
    h.newCount = h.lines.filter((l) => l.type !== 'del').length;
  }

  return { stats: { additions, deletions }, truncated, hunks };
}

/** Only the numbers - cheap enough to store on every commit. */
export function diffStats(oldLines, newLines, opts) {
  const { regions } = diffSequences(oldLines, newLines, opts);
  let additions = 0;
  let deletions = 0;
  for (const r of regions) {
    additions += r.bEnd - r.bStart;
    deletions += r.aEnd - r.aStart;
  }
  return { additions, deletions, regions };
}
