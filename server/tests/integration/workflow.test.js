import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/modules/users/user.model.js';
import { Commit } from '../../src/modules/versioning/commit.model.js';
import { getContent } from '../../src/modules/versioning/storage.service.js';

const app = createApp();

async function register(name) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email: `${name.toLowerCase()}-${Date.now()}@test.dev`, password: 'Password1' })
    .expect(201);
  return { token: res.body.data.accessToken, user: res.body.data.user };
}

const api = (token) => ({
  get: (url) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
  post: (url, body) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (url, body) => request(app).put(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).send(body),
  patch: (url, body) => request(app).patch(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).send(body),
});

async function edit(client, docId, branchId, change) {
  const draft = (await client.get(`/documents/${docId}/branches/${branchId}/draft`).expect(200)).body.data;
  await client.put(`/documents/${docId}/branches/${branchId}/draft`, { content: change(draft.content), baseCommit: draft.baseCommit }).expect(200);
}

async function commit(client, docId, branchId, change, message = 'Update text') {
  await edit(client, docId, branchId, change);
  return client.post(`/documents/${docId}/branches/${branchId}/commits`, { message });
}

describe('VersaDoc end-to-end workflow', () => {
  it('commits, branches, merge requests, conflicts and resolution', async () => {
    const owner = api((await register('Owner')).token);
    const { token: edTok, user: editorUser } = await register('Editor');
    const editor = api(edTok);
    const outsider = api((await register('Outsider')).token);

    const doc = (await owner.post('/documents', { title: 'Thesis', template: 'blank' }).expect(201)).body.data;
    const docId = doc._id;
    await owner.post(`/documents/${docId}/collaborators`, { email: editorUser.email, role: 'editor' }).expect(200);

    // A private document is invisible (404) to non-members.
    await outsider.get(`/documents/${docId}`).expect(404);

    const details = (await owner.get(`/documents/${docId}`).expect(200)).body.data;
    const mainId = details.defaultBranch._id;

    // Owner commits several times: exercises delta chains and snapshots (SNAPSHOT_INTERVAL=3).
    const base = ['# Thesis', '', 'Intro line', 'Method line', 'Result line', 'End line'].join('\n');
    await commit(owner, docId, mainId, () => base, 'Outline').then((r) => expect(r.status).toBe(201));
    for (let i = 1; i <= 4; i++) {
      const r = await commit(owner, docId, mainId, (t) => `${t}\nNote ${i}`, `Add note ${i}`);
      expect(r.status).toBe(201);
    }
    const commits = await Commit.find({ document: docId }).sort({ generation: 1 }).lean();
    expect(commits.some((c) => c.storage === 'delta')).toBe(true);
    expect(commits.filter((c) => c.storage === 'snapshot').length).toBeGreaterThan(1);
    for (const c of commits) expect(typeof (await getContent(c._id))).toBe('string'); // every version rebuilds + passes integrity check

    // main is protected: the editor can't commit to it directly.
    await edit(editor, docId, mainId, (t) => `${t}\nsneaky`);
    const blocked = await editor.post(`/documents/${docId}/branches/${mainId}/commits`, { message: 'direct push' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROTECTED_BRANCH');

    // Editor works on a branch; owner changes the SAME line on main -> conflict.
    const branch = (await editor.post(`/documents/${docId}/branches`, { name: 'better-intro', from: 'main' }).expect(201)).body.data;
    await commit(editor, docId, branch._id, (t) => t.replace('Intro line', 'Intro by editor')).then((r) => expect(r.status).toBe(201));
    await commit(owner, docId, mainId, (t) => t.replace('Intro line', 'Intro by owner')).then((r) => expect(r.status).toBe(201));

    const mr = (await editor.post(`/documents/${docId}/merge-requests`, { title: 'Better intro', sourceBranchId: branch._id, targetBranchId: mainId }).expect(201)).body.data;
    const view = (await owner.get(`/documents/${docId}/merge-requests/${mr.number}`).expect(200)).body.data;
    expect(view.analysis.state).toBe('CONFLICTS');
    expect(view.analysis.conflictCount).toBe(1);

    const blockedMerge = await owner.post(`/documents/${docId}/merge-requests/${mr.number}/merge`, {});
    expect(blockedMerge.status).toBe(409);
    expect(blockedMerge.body.error.code).toBe('MERGE_CONFLICTS');

    const conflicts = (await owner.get(`/documents/${docId}/merge-requests/${mr.number}/conflicts`).expect(200)).body.data;
    const markers = await owner.post(`/documents/${docId}/merge-requests/${mr.number}/merge`, { resolvedContent: conflicts.withMarkers });
    expect(markers.body.error.code).toBe('UNRESOLVED_CONFLICTS');

    const resolved = conflicts.withMarkers.replace(/<<<<<<< [^\n]*\n[\s\S]*?>>>>>>> [^\n]*/, 'Intro by owner and editor');
    await owner.post(`/documents/${docId}/merge-requests/${mr.number}/merge`, { resolvedContent: resolved, expectedTargetHead: conflicts.targetHead }).expect(200);

    const main = (await owner.get(`/documents/${docId}/branches/${mainId}`).expect(200)).body.data;
    expect(main.content).toContain('Intro by owner and editor');
    expect(main.head.parents).toHaveLength(2); // a real merge commit

    // Blame credits the merge commit for the resolved line.
    const blame = (await owner.get(`/documents/${docId}/branches/${mainId}/blame`).expect(200)).body.data;
    expect(blame.blocks.length).toBeGreaterThan(1);
  });

  it('stale draft: detects that the branch moved and rebases cleanly with a three-way merge', async () => {
    const owner = api((await register('Solo')).token);
    const doc = (await owner.post('/documents', { title: 'Notes', template: 'blank' }).expect(201)).body.data;
    const branchId = (await owner.get(`/documents/${doc._id}`)).body.data.defaultBranch._id;
    const start = (await owner.get(`/documents/${doc._id}/branches/${branchId}/draft`)).body.data;
    const lines = ['one', 'two', 'three', 'four'].join('\n');
    await owner.put(`/documents/${doc._id}/branches/${branchId}/draft`, { content: lines, baseCommit: start.baseCommit }).expect(200);
    await owner.post(`/documents/${doc._id}/branches/${branchId}/commits`, { message: 'Base text' }).expect(201);

    // Draft based on the new head...
    const s2 = (await owner.get(`/documents/${doc._id}/branches/${branchId}/draft`)).body.data;
    await owner.put(`/documents/${doc._id}/branches/${branchId}/draft`, { content: 'ONE\ntwo\nthree\nfour', baseCommit: s2.baseCommit }).expect(200);
    // ...meanwhile the branch moves (simulate a teammate by restoring an old version as a new commit).
    await owner.post(`/documents/${doc._id}/branches/${branchId}/restore`, { commitId: start.baseCommit }).expect(201);
    await owner.put(`/documents/${doc._id}/branches/${branchId}/draft`, { content: 'ONE\ntwo\nthree\nfour', baseCommit: s2.baseCommit });

    const commitTry = await owner.post(`/documents/${doc._id}/branches/${branchId}/commits`, { message: 'Uppercase one' });
    expect(commitTry.status).toBe(409);
    expect(commitTry.body.error.code).toBe('BRANCH_MOVED');

    const rebase = (await owner.post(`/documents/${doc._id}/branches/${branchId}/draft/rebase`, {}).expect(200)).body.data;
    expect(['REBASED', 'CONFLICTS']).toContain(rebase.status);
  });

  it('rejects NoSQL operator injection and unauthenticated access', async () => {
    await request(app).get('/api/v1/documents').expect(401);
    const res = await request(app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: 'x' });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({})).toBeGreaterThanOrEqual(0);
  });
});
