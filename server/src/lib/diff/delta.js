/**
 * Delta storage. Instead of saving the full document on every commit, a commit can store only
 * what changed compared to its parent:
 *
 *   delta = [ [aStart, aEnd, ["new line", ...]], ... ]
 *   "replace parent lines aStart..aEnd-1 with these lines"
 *
 * A 10,000-line document where one paragraph changed costs a few hundred bytes instead of ~500 KB.
 */
export function encodeDelta(newLines, regions) {
  return regions.map((r) => [r.aStart, r.aEnd, newLines.slice(r.bStart, r.bEnd)]);
}

export function applyDelta(baseLines, delta) {
  const out = [];
  let ai = 0;
  for (const [aStart, aEnd, inserted] of delta) {
    while (ai < aStart) out.push(baseLines[ai++]);
    for (let i = 0; i < inserted.length; i++) out.push(inserted[i]); // loop, not push(...x): no stack limit
    ai = aEnd;
  }
  while (ai < baseLines.length) out.push(baseLines[ai++]);
  return out;
}

/** Approximate stored size in bytes (for the "is a delta worth it?" decision and stats). */
export function deltaSize(delta) {
  let size = 2;
  for (const [, , inserted] of delta) {
    size += 16;
    for (const line of inserted) size += Buffer.byteLength(line, 'utf8') + 3;
  }
  return size;
}
