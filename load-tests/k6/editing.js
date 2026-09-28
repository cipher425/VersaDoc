/**
 * Stage 2 - API load test: many writers autosaving and committing at the same time,
 * plus readers opening history and diffs.
 *
 * Server: RATE_LIMIT_ENABLED=false (all virtual users share your IP), separate test database.
 *   k6 run -e BASE=http://localhost:5000 -e USERS=50 load-tests/k6/editing.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE || 'http://localhost:5000';
const API = `${BASE}/api/v1`;
const USERS = Number(__ENV.USERS || 50);
const DURATION = __ENV.DURATION || '2m';

const autosaveMs = new Trend('autosave_ms', true);
const commitMs = new Trend('commit_ms', true);
const historyMs = new Trend('history_ms', true);
const compareMs = new Trend('compare_ms', true);
const contentMs = new Trend('open_document_ms', true);
const commits = new Counter('commits_created');

export const options = {
  setupTimeout: '5m',
  scenarios: {
    writers: { executor: 'constant-vus', vus: USERS, duration: DURATION },
  },
  thresholds: { http_req_failed: ['rate<0.01'] },
};

const auth = (token) => ({ headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });

export function setup() {
  const run = Date.now();
  const users = [];
  for (let i = 0; i < USERS; i += 25) {
    const batch = [];
    for (let j = i; j < Math.min(i + 25, USERS); j++) {
      batch.push(['POST', `${API}/auth/register`, JSON.stringify({ name: `Writer ${j}`, email: `writer-${run}-${j}@load.test`, password: 'Password123' }), { headers: { 'Content-Type': 'application/json' } }]);
    }
    for (const r of http.batch(batch)) users.push(r.json('data.accessToken'));
  }
  // Each writer gets their own document based on the "report" template.
  return users.map((token, i) => {
    const doc = http.post(`${API}/documents`, JSON.stringify({ title: `Load test doc ${i}`, template: 'report' }), auth(token)).json('data');
    const details = http.get(`${API}/documents/${doc._id}`, auth(token)).json('data');
    return { token, docId: doc._id, branchId: details.defaultBranch._id };
  });
}

const PARAGRAPH = 'The pilot deployment collected sensor readings every ten seconds and forwarded them to the cloud. ';

export default function (writers) {
  const w = writers[exec.vu.idInTest - 1];
  const h = auth(w.token);
  const draftUrl = `${API}/documents/${w.docId}/branches/${w.branchId}/draft`;

  const open = http.get(draftUrl, h);
  contentMs.add(open.timings.duration);
  if (!check(open, { 'open 200': (r) => r.status === 200 })) return;
  let { content, baseCommit } = open.json('data');

  // Simulate typing: 5 autosaves a few seconds apart, each adding a sentence.
  for (let i = 0; i < 5; i++) {
    content += `\n${PARAGRAPH}(${exec.scenario.iterationInTest}.${i})`;
    const save = http.put(draftUrl, JSON.stringify({ content, baseCommit }), h);
    autosaveMs.add(save.timings.duration);
    check(save, { 'autosave 200': (r) => r.status === 200 });
    sleep(1 + Math.random());
  }

  const c = http.post(`${API}/documents/${w.docId}/branches/${w.branchId}/commits`, JSON.stringify({ message: `Iteration ${exec.scenario.iterationInTest}` }), h);
  commitMs.add(c.timings.duration);
  if (check(c, { 'commit 201': (r) => r.status === 201 })) commits.add(1);

  const log = http.get(`${API}/documents/${w.docId}/commits?ref=main&limit=30`, h);
  historyMs.add(log.timings.duration);

  const cmp = http.get(`${API}/documents/${w.docId}/compare?from=main&to=${log.json('data.1.hash')?.slice(0, 7) || 'main'}`, h);
  compareMs.add(cmp.timings.duration);
  sleep(1);
}
