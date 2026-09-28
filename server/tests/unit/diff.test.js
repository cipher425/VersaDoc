import { describe, expect, it } from 'vitest';
import { applyRegions, diffSequences, diffWords } from '../../src/lib/diff/myers.js';
import { applyDelta, encodeDelta } from '../../src/lib/diff/delta.js';
import { merge3, resolveChunks, withConflictMarkers, CONFLICT_MARKER_RE } from '../../src/lib/diff/merge3.js';
import { buildDiffView } from '../../src/lib/diff/view.js';
import { mergeBase, countAhead } from '../../src/lib/diff/graph.js';
import { splitLines, joinLines } from '../../src/lib/diff/text.js';

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const randomLines = (n) => Array.from({ length: n }, () => 'abcde'[Math.floor(rand() * 5)]);
function mutate(lines) {
  const out = [...lines];
  for (let i = 0; i < 1 + Math.floor(rand() * 6); i++) {
    const p = Math.floor(rand() * (out.length + 1));
    const r = rand();
    if (r < 0.4) out.splice(p, 0, `new${i}`);
    else if (r < 0.7) out.splice(p, 1);
    else out[p] = `changed${i}`;
  }
  return out;
}

describe('Myers diff', () => {
  it('returns no regions for identical input and handles empty sides', () => {
    expect(diffSequences(['a', 'b'], ['a', 'b']).regions).toEqual([]);
    expect(diffSequences([], ['x']).regions).toEqual([{ aStart: 0, aEnd: 0, bStart: 0, bEnd: 1 }]);
    expect(diffSequences(['x'], []).regions).toEqual([{ aStart: 0, aEnd: 1, bStart: 0, bEnd: 0 }]);
  });

  it('property test: applying the regions to A always produces B (500 random cases)', () => {
    for (let i = 0; i < 500; i++) {
      const a = randomLines(Math.floor(rand() * 40));
      const b = mutate(a);
      const { regions } = diffSequences(a, b);
      expect(applyRegions(a, b, regions)).toEqual(b);
    }
  });

  it('finds a minimal edit for a simple change', () => {
    const { regions } = diffSequences(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd']);
    expect(regions).toEqual([{ aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 }]);
  });

  it('falls back to a coarse diff when the edit budget is exceeded', () => {
    const r = diffSequences(['a', 'b', 'c'], ['x', 'y', 'z'], { maxEdits: 1 });
    expect(r.truncated).toBe(true);
    expect(applyRegions(['a', 'b', 'c'], ['x', 'y', 'z'], r.regions)).toEqual(['x', 'y', 'z']);
  });

  it('highlights changed words inside a line', () => {
    const w = diffWords('The quick brown fox', 'The quick red fox');
    expect(w.oldSeg.find((s) => s.type === 'del').text).toBe('brown');
    expect(w.newSeg.find((s) => s.type === 'ins').text).toBe('red');
  });
});

describe('delta storage', () => {
  it('encode + apply is lossless (300 random cases)', () => {
    for (let i = 0; i < 300; i++) {
      const a = randomLines(Math.floor(rand() * 50));
      const b = mutate(a);
      expect(applyDelta(a, encodeDelta(b, diffSequences(a, b).regions))).toEqual(b);
    }
  });

  it('text <-> lines round-trips, including trailing newlines', () => {
    for (const t of ['', 'a', 'a\n', 'a\nb', '\n\n']) expect(joinLines(splitLines(t))).toBe(t);
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('three-way merge', () => {
  const base = ['title', 'intro', 'body', 'end'];

  it('merges non-overlapping changes cleanly', () => {
    const r = merge3(base, ['TITLE', 'intro', 'body', 'end'], ['title', 'intro', 'body', 'END']);
    expect(r.clean).toBe(true);
    expect(r.lines).toEqual(['TITLE', 'intro', 'body', 'END']);
  });

  it('takes an identical change once', () => {
    const same = ['title', 'INTRO', 'body', 'end'];
    expect(merge3(base, same, same).lines).toEqual(same);
  });

  it('reports a conflict when both sides change the same line differently', () => {
    const r = merge3(base, ['title', 'ours', 'body', 'end'], ['title', 'theirs', 'body', 'end']);
    expect(r.clean).toBe(false);
    expect(r.conflictCount).toBe(1);
    const conflict = r.chunks.find((c) => c.type === 'conflict');
    expect(conflict).toMatchObject({ base: ['intro'], ours: ['ours'], theirs: ['theirs'] });
    expect(resolveChunks(r.chunks, ['theirs'])).toEqual(['title', 'theirs', 'body', 'end']);
    expect(resolveChunks(r.chunks, ['both'])).toEqual(['title', 'ours', 'theirs', 'body', 'end']);
    expect(CONFLICT_MARKER_RE.test(withConflictMarkers(r.chunks))).toBe(true);
  });

  it('keeps one-sided insertions and deletions', () => {
    const r = merge3(base, ['title', 'intro', 'body', 'end', 'appendix'], ['title', 'body', 'end']);
    expect(r.clean).toBe(true);
    expect(r.lines).toEqual(['title', 'body', 'end', 'appendix']);
  });
});

describe('diff view', () => {
  it('builds hunks with context and correct stats', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const b = [...a];
    b[9] = 'line ten';
    const v = buildDiffView(a, b, { context: 2 });
    expect(v.stats).toEqual({ additions: 1, deletions: 1 });
    expect(v.hunks).toHaveLength(1);
    expect(v.hunks[0].lines.map((l) => l.type)).toEqual(['context', 'context', 'del', 'add', 'context', 'context']);
    expect(v.hunks[0].oldStart).toBe(8);
  });
});

describe('commit graph', () => {
  // root -> a -> b (main) ; a -> c -> d (feature)
  const graph = new Map([
    ['root', { parents: [], generation: 1 }],
    ['a', { parents: ['root'], generation: 2 }],
    ['b', { parents: ['a'], generation: 3 }],
    ['c', { parents: ['a'], generation: 3 }],
    ['d', { parents: ['c'], generation: 4 }],
  ]);

  it('finds the merge base and ahead/behind counts', () => {
    expect(mergeBase(graph, 'b', 'd')).toBe('a');
    expect(countAhead(graph, 'd', 'b')).toBe(2);
    expect(countAhead(graph, 'b', 'd')).toBe(1);
    expect(mergeBase(graph, 'a', 'd')).toBe('a');
  });
});
