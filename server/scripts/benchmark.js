/**
 * Stage 2 benchmark - measures the core algorithms on synthetic documents.
 * No database needed:  npm run bench
 *
 * Questions it answers (with numbers from YOUR machine):
 *  1. How long does a diff take for small vs large documents and small vs large edits?
 *  2. How long does a three-way merge take?
 *  3. How much space does delta storage save compared to storing every version in full?
 *  4. How does rebuilding a version get slower as the delta chain grows (SNAPSHOT_INTERVAL)?
 *  5. How long does one big diff BLOCK the Node event loop (why Stage 3 adds worker threads)?
 */
import { performance } from 'node:perf_hooks';
import { diffSequences, applyRegions } from '../src/lib/diff/myers.js';
import { buildDiffView } from '../src/lib/diff/view.js';
import { merge3 } from '../src/lib/diff/merge3.js';
import { applyDelta, deltaSize, encodeDelta } from '../src/lib/diff/delta.js';

const WORDS = 'the system parking sensor data user campus report method result analysis design network cloud mobile time spot lot gate student staff'.split(' ');
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sentence = () => Array.from({ length: 8 + Math.floor(rand() * 10) }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ') + '.';
const makeDoc = (n) => Array.from({ length: n }, sentence);

/** Edits `ratio` of the lines: modify, insert or delete at random positions. */
function edit(lines, ratio) {
  const out = [...lines];
  const count = Math.max(1, Math.floor(lines.length * ratio));
  for (let i = 0; i < count; i++) {
    const pos = Math.floor(rand() * out.length);
    const r = rand();
    if (r < 0.6) out[pos] = sentence();
    else if (r < 0.8) out.splice(pos, 0, sentence());
    else out.splice(pos, 1);
  }
  return out;
}

function time(fn, runs = 5) {
  fn(); // warm-up
  const samples = [];
  let result;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    result = fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return { ms: samples[Math.floor(samples.length / 2)], result };
}

const fmt = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

console.log(`VersaDoc algorithm benchmark - Node ${process.version}, ${new Date().toISOString()}\n`);

console.log('1) Line diff (Myers) - median of 5 runs');
console.table(
  [1_000, 10_000, 50_000].flatMap((size) =>
    [0.01, 0.1].map((ratio) => {
      const a = makeDoc(size);
      const b = edit(a, ratio);
      const { ms, result } = time(() => diffSequences(a, b));
      const ok = JSON.stringify(applyRegions(a, b, result.regions)) === JSON.stringify(b);
      return { lines: size, edited: `${ratio * 100}%`, regions: result.regions.length, diff: fmt(ms), correct: ok };
    })
  )
);

console.log('2) Diff view with word highlights (what the UI requests)');
console.table(
  [1_000, 10_000].map((size) => {
    const a = makeDoc(size);
    const b = edit(a, 0.05);
    const { ms, result } = time(() => buildDiffView(a, b));
    return { lines: size, hunks: result.hunks.length, additions: result.stats.additions, deletions: result.stats.deletions, time: fmt(ms) };
  })
);

console.log('3) Three-way merge');
console.table(
  [1_000, 10_000, 50_000].map((size) => {
    const base = makeDoc(size);
    const ours = edit(base, 0.02);
    const theirs = edit(base, 0.02);
    const { ms, result } = time(() => merge3(base, ours, theirs), 3);
    return { lines: size, conflicts: result.conflictCount, time: fmt(ms) };
  })
);

console.log('4) Storage: 100 versions of a 2,000-line document, 1% edited each time');
{
  const versions = [makeDoc(2_000)];
  for (let i = 1; i < 100; i++) versions.push(edit(versions[i - 1], 0.01));
  const full = versions.reduce((s, v) => s + Buffer.byteLength(v.join('\n')), 0);
  const rows = [1, 5, 20, 50].map((interval) => {
    let stored = 0;
    for (let i = 0; i < versions.length; i++) {
      if (i % interval === 0) stored += Buffer.byteLength(versions[i].join('\n'));
      else stored += deltaSize(encodeDelta(versions[i], diffSequences(versions[i - 1], versions[i]).regions));
    }
    return { SNAPSHOT_INTERVAL: interval, stored: kb(stored), full: kb(full), saved: `${Math.round((1 - stored / full) * 100)}%` };
  });
  console.table(rows);
}

console.log('5) Rebuild time vs delta chain length (worst case for a given SNAPSHOT_INTERVAL)');
{
  const base = makeDoc(5_000);
  const deltas = [];
  let cur = base;
  for (let i = 0; i < 100; i++) {
    const next = edit(cur, 0.01);
    deltas.push(encodeDelta(next, diffSequences(cur, next).regions));
    cur = next;
  }
  console.table(
    [1, 5, 20, 50, 100].map((chain) => {
      const { ms } = time(() => {
        let lines = base;
        for (let i = 0; i < chain; i++) lines = applyDelta(lines, deltas[i]);
        return lines.length;
      });
      return { chainLength: chain, rebuild: fmt(ms), note: 'plus one DB read per step in the real app' };
    })
  );
}

console.log('6) Event-loop blocking: how late does a 5 ms timer fire while a big diff runs?');
{
  const a = makeDoc(50_000);
  const b = edit(a, 0.2);
  const t0 = performance.now();
  await new Promise((resolve) => {
    setTimeout(() => {
      console.log(`   timer scheduled for 5 ms fired after ${fmt(performance.now() - t0)} (every other request waits this long)\n`);
      resolve();
    }, 5);
    diffSequences(a, b);
  });
}

console.log('Copy these tables into docs/STAGE2_BENCHMARKS.md.');
