import { parentPort } from 'node:worker_threads';
import { TASKS } from './tasks.js';

parentPort.on('message', ({ id, name, args }) => {
  try {
    parentPort.postMessage({ id, result: TASKS[name](...args) });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
