/**
 * Myers' O(ND) difference algorithm (Eugene W. Myers, 1986) - the same idea Git uses.
 *
 * Think of editing sequence A into sequence B as a walk on a grid: moving right deletes an
 * element of A, moving down inserts an element of B, and moving diagonally is free when the
 * elements are equal. Myers finds the path with the fewest non-diagonal moves (the shortest
 * edit script) by exploring "how far can I get with D edits?" for D = 0, 1, 2, ...
 * Cost: O((N + M) * D) time - very fast when the two versions are similar, which is the
 * normal case for document revisions.
 *
 * Output: "regions" - maximal changed blocks, in A coordinates:
 *   { aStart, aEnd, bStart, bEnd }  meaning  A[aStart:aEnd] was replaced by B[bStart:bEnd]
 * (pure insertion when aStart === aEnd, pure deletion when bStart === bEnd).
 * Everything between regions is unchanged. This one representation powers the diff viewer,
 * delta storage and three-way merge.
 */

const EQ = 0;
const DEL = 1;
const INS = 2;

/** Returns the edit operations (EQ/DEL/INS) or null if more than maxEdits are needed. */
function myersEdits(a, b, maxEdits) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3); // v[off + k] = furthest x reached on diagonal k
  const trace = []; // snapshot of v before each round d, only for k in [-d-1, d+1] -> O(D^2) memory
  let found = -1;

  outer: for (let d = 0; d <= max; d++) {
    if (d > maxEdits) return null;
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      // Choose whether we arrive on diagonal k by moving down (insert) or right (delete).
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++; // follow the free diagonal ("snake")
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }

  // Walk the trace backwards to recover the actual path.
  const ops = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const snap = trace[d];
    const get = (k) => snap[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const prevX = get(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push(EQ);
      x--;
      y--;
    }
    if (d > 0) ops.push(x === prevX ? INS : DEL);
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

function toRegions(ops, offset) {
  const regions = [];
  let ai = 0;
  let bi = 0;
  let cur = null;
  for (const op of ops) {
    if (op === EQ) {
      if (cur) regions.push(cur);
      cur = null;
      ai++;
      bi++;
      continue;
    }
    if (!cur) cur = { aStart: ai + offset, aEnd: ai + offset, bStart: bi + offset, bEnd: bi + offset };
    if (op === DEL) cur.aEnd = ++ai + offset;
    else cur.bEnd = ++bi + offset;
  }
  if (cur) regions.push(cur);
  return regions;
}

/**
 * Diff two arrays (of lines or words).
 * Common prefix/suffix are stripped first - cheap and hugely effective for typical edits.
 * If the change is enormous (> maxEdits), returns one coarse "everything in the middle changed"
 * region and truncated: true, so a pathological input can never hang the server.
 */
export function diffSequences(a, b, { maxEdits = Infinity } = {}) {
  let start = 0;
  const min = Math.min(a.length, b.length);
  while (start < min && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return { regions: [], truncated: false };
  const whole = [{ aStart: start, aEnd: endA, bStart: start, bEnd: endB }];
  if (start === endA || start === endB) return { regions: whole, truncated: false };

  const ops = myersEdits(a.slice(start, endA), b.slice(start, endB), maxEdits);
  if (!ops) return { regions: whole, truncated: true };
  return { regions: toRegions(ops, start), truncated: false };
}

/** Rebuilds B from A and the regions (used by tests to prove the diff is correct). */
export function applyRegions(a, b, regions) {
  const out = [];
  let ai = 0;
  for (const r of regions) {
    while (ai < r.aStart) out.push(a[ai++]);
    for (let j = r.bStart; j < r.bEnd; j++) out.push(b[j]);
    ai = r.aEnd;
  }
  while (ai < a.length) out.push(a[ai++]);
  return out;
}

const TOKEN_RE = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;
export const tokenize = (line) => line.match(TOKEN_RE) || [];

/** Word-level diff of two lines, for highlighting exactly what changed inside a line. */
export function diffWords(oldLine, newLine) {
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  const { regions } = diffSequences(a, b, { maxEdits: 400 });
  const oldSeg = [];
  const newSeg = [];
  const push = (arr, type, text) => {
    if (!text) return;
    const last = arr[arr.length - 1];
    if (last && last.type === type) last.text += text;
    else arr.push({ type, text });
  };
  let ai = 0;
  let bi = 0;
  for (const r of regions) {
    push(oldSeg, 'eq', a.slice(ai, r.aStart).join(''));
    push(newSeg, 'eq', b.slice(bi, r.bStart).join(''));
    push(oldSeg, 'del', a.slice(r.aStart, r.aEnd).join(''));
    push(newSeg, 'ins', b.slice(r.bStart, r.bEnd).join(''));
    ai = r.aEnd;
    bi = r.bEnd;
  }
  push(oldSeg, 'eq', a.slice(ai).join(''));
  push(newSeg, 'eq', b.slice(bi).join(''));
  const same = oldSeg.filter((s) => s.type === 'eq').reduce((n, s) => n + s.text.length, 0);
  // If the lines have almost nothing in common, word highlighting is just noise.
  const useful = same / Math.max(1, oldLine.length, newLine.length) >= 0.3;
  return { oldSeg, newSeg, useful };
}
