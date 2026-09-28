import { buildDiffView } from './view.js';
import { merge3 } from './merge3.js';

/** CPU-heavy operations that may run in a worker thread (Stage 3). Pure functions only. */
export const TASKS = {
  diffView: (oldLines, newLines, opts) => buildDiffView(oldLines, newLines, opts),
  merge3: (base, ours, theirs, opts) => merge3(base, ours, theirs, opts),
};
