import { Worker } from 'node:worker_threads';
import { env } from '../../config/env.js';
import { logger } from '../../infra/logger.js';
import { TASKS } from './tasks.js';

/**
 * Stage 3: a tiny worker-thread pool.
 *
 * Node runs JavaScript on ONE thread. Diffing two 50,000-line documents can take hundreds of
 * milliseconds of pure CPU - during which the server can't answer anyone else. With
 * DIFF_WORKERS > 0, big diffs/merges run on separate threads and the event loop stays free.
 * Small inputs still run inline (sending data to a thread has its own cost).
 */
let workers = [];
let nextWorker = 0;
let seq = 0;
const pending = new Map();

function failAll(err) {
  for (const { reject } of pending.values()) reject(err);
  pending.clear();
  workers.forEach((w) => w.terminate().catch(() => {}));
  workers = []; // recreated on next use
}

function ensureWorkers() {
  if (workers.length) return;
  for (let i = 0; i < env.DIFF_WORKERS; i++) {
    const w = new Worker(new URL('./worker.js', import.meta.url));
    w.on('message', ({ id, result, error }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    });
    w.on('error', (err) => {
      logger.error({ err }, 'Diff worker crashed');
      failAll(err);
    });
    w.unref();
    workers.push(w);
  }
}

/** Runs TASKS[name](...args) inline or in a worker depending on size and config. */
export function runDiffTask(name, args, sizeInLines) {
  if (env.DIFF_WORKERS === 0 || sizeInLines < env.WORKER_THRESHOLD_LINES) {
    return Promise.resolve(TASKS[name](...args));
  }
  ensureWorkers();
  const id = ++seq;
  const worker = workers[nextWorker++ % workers.length];
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, name, args });
  });
}

export async function closeDiffPool() {
  await Promise.all(workers.map((w) => w.terminate()));
  workers = [];
}
