# VersaDoc — Architecture

## 1. The idea in one paragraph

A **document** works like a Git repository. Every saved version is an immutable **commit** that points to its parent(s). A **branch** is just a named pointer to a commit. Users type into a personal **draft** (working copy) that autosaves; "Commit" turns the draft into a new commit and moves the branch pointer. **Merge requests** combine branches after review, using a **three-way merge** that only asks humans about real conflicts.

## 2. Modules (modular monolith)

| Module | Responsibility |
|---|---|
| `auth`, `users` | Register/login, JWT + rotating refresh tokens, profile |
| `documents` | Documents, collaborators & roles, settings, the `withDocument(action)` permission middleware |
| `versioning` | Branches, drafts, commits, restore, compare, history, blame, snapshot/delta storage |
| `reviews` | Merge requests, reviews/approvals, merging, conflicts, comments |
| `activity` | Activity feed, notifications, insights, dashboard |
| `public` | Read-only published documents |
| `lib/diff` | Pure algorithms: Myers diff, word diff, diff view, delta, three-way merge, commit graph, worker pool |

The algorithms in `lib/diff` are **pure functions with no database access** — that's what makes them easy to unit-test, benchmark, and move to worker threads.

## 3. Data model

| Collection | Key fields | Notes |
|---|---|---|
| `users` | name, email, passwordHash, avatarColor | |
| `sessions` | tokenHash, expiresAt (TTL) | refresh-token rotation |
| `documents` | owner, title, slug, visibility, **collaborators[] {user, role}**, settings {requiredApprovals, protectDefaultBranch}, mrCounter, stats | collaborators embedded: small, always needed for permission checks |
| `branches` | document, name (unique per doc), **head → commit**, isDefault | a branch is only a pointer |
| `commits` | document, hash, **parents[]**, generation, author, message, kind, **storage: snapshot \| delta**, snapshot / delta, chainDepth, **contentHash**, stats | immutable; forms a DAG |
| `drafts` | branch + user (unique), **baseCommit**, content | autosaved working copy |
| `mergerequests` | number (per doc), source/target branch, status, **reviewers[] {user, state, reviewedHead}**, mergeCommit | |
| `comments` | mergeRequest, author, body, **anchor {side, line, commit}**, parent, resolved | line comments become "outdated" after new commits |
| `activities`, `notifications` | feed + inbox | |

## 4. Storage: snapshots + deltas

Storing the full text on every commit wastes space; storing only changes makes old versions slow to rebuild. VersaDoc does both, like video keyframes:

- A commit stores a **delta** against its first parent: `[[aStart, aEnd, [new lines]], …]`.
- Every `SNAPSHOT_INTERVAL` commits (or when the delta would not be much smaller), a full **snapshot** is stored and `chainDepth` resets.
- Rebuilding a version = walk back to the nearest snapshot (≤ SNAPSHOT_INTERVAL steps), then apply deltas forward.
- Every rebuilt version is checked against the stored **SHA-256 contentHash** — a corrupted delta can never silently return the wrong text.
- Optional LRU cache (`CONTENT_CACHE_SIZE`) keeps recently rebuilt versions in memory.

## 5. Algorithms

**Myers diff** (`myers.js`) — finds the shortest edit script between two line arrays in O((N+M)·D). Common prefix/suffix are stripped first. A budget (`MAX_DIFF_EDITS`) prevents pathological inputs from hanging the server (falls back to one coarse block). Output: **regions** `{aStart, aEnd, bStart, bEnd}` — the single representation used by the diff viewer, delta storage and merge.

**Word diff** — the same algorithm on word tokens (Unicode-aware) for modified line pairs; skipped when two lines have <30% in common (highlighting would be noise).

**Three-way merge / diff3** (`merge3.js`) — diff base→ours and base→theirs, group overlapping regions, then: only one side changed → take it; both made the same edit → take once; different edits → conflict chunk `{base, ours, theirs}`.

**Merge base** (`graph.js`) — the commit graph is loaded in memory; BFS from one head finds common ancestors of the other and picks the one with the highest `generation`. The same graph gives ahead/behind counts and "commits in this merge request".

**Blame** (`history.service.js`) — walk the first-parent chain oldest→newest, keeping `origin[line] = commit`. Deltas already say exactly which lines changed, so most steps are cheap.

## 6. Concurrency & correctness

| Situation | How it's handled |
|---|---|
| Two people commit to the same branch at once | Branch head moves with a **conditional update** `{_id, head: expected}`. The loser gets `409 BRANCH_MOVED` and its orphan commit is deleted. |
| A teammate committed while I was editing | My draft remembers `baseCommit`; commit is refused, and **rebase** runs a three-way merge (base = my base, ours = my draft, theirs = new head). |
| Target branch changes while resolving conflicts | Merge sends `expectedTargetHead`; mismatch → `409 TARGET_MOVED`. |
| Approve, then new commits pushed | Each review stores `reviewedHead`; approvals only count if it equals the current source head. |
| Two MRs created at once | MR numbers come from an atomic `$inc` on the document. |
| Document creation half-fails | Document + root commit + main branch are created in **one MongoDB transaction**. |

## 7. Security

- Every document route goes through `withDocument(action)` → role check on the server. Private documents you can't access return **404** (existence is not leaked).
- Role matrix: viewer (read) < reviewer (comment, review) < editor (edit, branch, merge) < owner (manage, commit to protected).
- Zod validation on every input (strips unknown keys → blocks NoSQL operator injection).
- Markdown is rendered with `marked` and sanitized with **DOMPurify** (stored XSS protection).
- Access token in memory, refresh token in an httpOnly cookie, rotated with reuse detection.
- Helmet, CORS allow-list, rate limits (auth, writes), request size limits, document size limit.

## 8. API (prefix `/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `GET /auth/me` |
| Users | `PATCH /users/me` `PATCH /users/me/password` `GET /users/lookup?email=` |
| Documents | `GET/POST /documents` `GET /documents/templates` `GET/PATCH/DELETE /documents/:docId` `POST /documents/:docId/collaborators` `PATCH/DELETE /documents/:docId/collaborators/:userId` `GET /documents/:docId/activity` `GET /documents/:docId/insights` |
| Branches | `GET/POST /documents/:docId/branches` `GET/DELETE /documents/:docId/branches/:branchId` `GET /…/branches/:branchId/blame` |
| Drafts | `GET/PUT/DELETE /…/branches/:branchId/draft` `GET /…/draft/diff` `POST /…/draft/rebase` |
| Commits | `POST /…/branches/:branchId/commits` `POST /…/branches/:branchId/restore` `GET /documents/:docId/commits?ref=` `GET /documents/:docId/commits/:commitId` `GET /…/commits/:commitId/content` `GET /documents/:docId/compare?from=&to=` |
| Merge requests | `GET/POST /documents/:docId/merge-requests` `GET /…/merge-requests/:number` `GET /…/:number/conflicts` `POST /…/:number/reviews` `POST /…/:number/merge` `POST /…/:number/close` `POST /…/:number/reopen` `GET/POST /…/:number/comments` `PATCH/DELETE /documents/:docId/comments/:commentId` |
| Other | `GET /dashboard` `GET /notifications` `GET /notifications/unread-count` `PATCH /notifications/:id/read` `POST /notifications/read-all` `GET /public/:slug` `GET /system/stats` |

`ref` accepts a branch name, a commit id, or a short hash (7+ characters).
