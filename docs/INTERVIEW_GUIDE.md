# VersaDoc — Interview Guide (explained in easy words)

Use this to explain VersaDoc confidently: what it is, how every part works, and why you built it that way.

1. Learn the **pitch** (section 1).
2. Practise the **demo** (section 2).
3. Master the **deep-dive questions** (section 5). Interviewers spend most of their time here.
4. Skim the **technology cards** (3), **concepts** (4) and **glossary** (10).
5. Only quote performance numbers you measured yourself (section 6).

---

## 1. The pitch

### 30 seconds
> "I built VersaDoc, a MERN app that brings Git-style version control to documents. People write in a Markdown editor, create branches to try changes, commit versions, compare any two versions with word-level diffs, and open merge requests where teammates comment on lines and approve. When two people edit the same text, a three-way merge combines their changes automatically and only asks about real conflicts. I wrote the diff, merge and storage engine myself instead of using a library."

### 2 minutes (add these)
- **The core algorithms are mine**: Myers diff (the algorithm Git uses), a three-way merge (diff3), a commit graph with merge-base search, and blame.
- **Storage like video keyframes**: most commits store only the change (a delta); every N commits a full snapshot. Every rebuilt version is verified with a SHA-256 hash.
- **Correct under concurrency**: two people committing at the same time can't overwrite each other — the branch pointer moves with a conditional update. A stale draft is updated with a three-way merge.
- **Real review workflow**: protected main branch, required approvals, and approvals become "stale" when new commits arrive — just like GitHub.
- **Security**: server-side role checks on every request, private documents return 404, Markdown sanitized against XSS, rotating refresh tokens.
- **Tested with property-based tests**: hundreds of random edits prove that applying my diff always reproduces the new text exactly.

---

## 2. Demo walkthrough (5 minutes)

Run `npm run seed` then `npm run dev`. Use two browser profiles: **Aarav (owner)** and **Priya (editor)**.

1. **Dashboard** — "waiting for your review" and recent activity.
2. **Open the report → Editor**. Type a sentence. *Say:* "Drafts autosave every 1.2 seconds after you stop typing; this is my personal working copy."
3. **Commit** — the dialog shows exactly what will be committed (a diff of the draft vs its base). *Say:* "Like `git diff --staged`."
4. **History** — commits grouped by day, each marked snapshot or delta with its stored size. Click one → **word-level diff**. *Say:* "Most commits store a few hundred bytes."
5. **Compare** two versions in split view.
6. **Blame** — who wrote each line.
7. As **Priya**, try to commit on `main` → "protected". Click **Propose changes** → her edit moves to a new branch.
8. **Merge requests → "Rewrite abstract"** — shows **1 conflict**. Open the resolver: current vs incoming, keep both / write your own. Merge → a merge commit with **two parents**.
9. **Merge request "Add references"** — review as Rahul (approve), line comment, then merge.
10. **Insights** — commits per day, contributors, "storage saved by deltas: X%".
11. **Public page** `/p/<slug>` of the Open Source guide — no login needed.

---

## 3. Technology cards — what, why, where

### React (+ Vite, Tailwind, React Router)
- **What**: component-based UI library. Vite = fast dev server/bundler. Tailwind = utility CSS. React Router = client-side pages.
- **Where**: `client/src/features/*` — organized by feature (editor, diff, reviews…), not by file type.
- **Nested routes**: `/d/:docId` loads the document once in `DocumentLayout`, and every tab (editor, history, branches…) reads it through `useOutletContext()` — no repeated fetching.

### TanStack Query
- **What**: manages *server state* — fetching, caching, refetching.
- **Where**: every API read. Query keys like `['draft', docId, branchId]`; after a commit we **invalidate** the related keys so the UI refreshes itself.
- **Q: Why not Redux?** Almost all state here comes from the server. React Query handles caching/loading/errors for it; the little local state (editor text, dialogs) is plain `useState`.

### CodeMirror 6
- **What**: the code-editor engine (used by many IDEs in the browser). Gives line numbers, Markdown syntax highlighting, fast editing of big documents.
- **Why not a textarea?** Line numbers matter for a version-control tool (diffs and comments refer to lines), and it stays fast with thousands of lines.

### marked + DOMPurify
- **marked** turns Markdown into HTML. **DOMPurify** removes dangerous HTML (`<script>`, `onerror=`…).
- **Q: Why sanitize?** Documents are shared. Without it, a collaborator could write `<img src=x onerror="steal()">` and run JavaScript in everyone's browser (**stored XSS**).

### Node.js + Express 5
- **What**: JavaScript on the server + a minimal web framework.
- **Where**: `server/src/app.js`, routers per module. Express 5 forwards errors from `async` handlers automatically.
- **Q: Node is single-threaded — isn't diffing CPU-heavy?** Yes: a huge diff blocks every other request. That's why the diff engine is pure functions and Stage 3 can run them in **worker threads** (`lib/diff/pool.js`).

### MongoDB + Mongoose
- **Why MongoDB fits**: commits hold variable-shape data (a snapshot string *or* a delta array), documents embed collaborators, and aggregation pipelines power the insights charts.
- **Transactions**: creating a document (document + first commit + main branch) is one transaction — requires a **replica set** (Atlas clusters are replica sets).
- **Where Mongo is NOT relied on for correctness**: branch updates use **conditional updates** instead of long transactions.

### JWT + bcrypt
- Access token (15 min) in memory; refresh token in an **httpOnly cookie**, stored hashed, **rotated** on each use; reuse of an old one revokes all sessions.
- bcrypt hashes passwords slowly with a salt; login compares with a dummy hash for unknown emails so timing doesn't reveal which emails exist.

### Zod
- Validates every request body/query/params. Unknown keys are stripped; types are enforced → blocks NoSQL injection like `{"email": {"$gt": ""}}`. Also validates environment variables at startup.

### worker_threads (Stage 3)
- Real OS threads inside Node. `pool.js` sends big diff/merge jobs to a small pool of workers so the main thread keeps answering requests.

### Vitest, Supertest, mongodb-memory-server, k6
- **Vitest**: test runner. **Supertest**: HTTP tests without starting a server. **mongodb-memory-server**: a real in-memory MongoDB *replica set* (so transactions are tested). **k6**: load testing.

---

## 4. Core concepts in plain English

**Commit** — a saved version that never changes. It knows its parent(s), author, message, and a hash.

**Branch** — a named pointer to one commit ("head"). Committing = create a commit whose parent is the head, then move the pointer.

**DAG (directed acyclic graph)** — commits point to parents; no cycles. A merge commit has **two** parents.

**Working copy / draft** — my unsaved text. It remembers which commit it started from (`baseCommit`).

**Diff** — the list of changes between two versions. Shown as hunks: changed lines plus 3 lines of context.

**Three-way merge** — merging two versions using their **common ancestor** as a reference, so the system knows who changed what. Two-way comparison can't tell "you deleted it" from "they added it"; three-way can.

**Merge base** — the most recent commit both branches share.

**Fast-forward** — if the target branch has no new commits since the branch was created, merging just moves the pointer; no merge commit needed.

**Conflict** — both sides changed the same lines differently. A human decides.

**Delta encoding** — storing only the difference from the previous version.

**Snapshot** — storing the full text.

**Hash (SHA-256)** — a fingerprint of the content. Same text → same hash; any change → different hash. Used to verify rebuilt versions and to skip empty commits.

**Optimistic concurrency** — don't lock; when writing, include what you expect the current value to be (`head: expected`). If someone changed it, your write matches nothing and you know you lost the race.

**Idempotent** — safe to repeat. Saving the same draft twice changes nothing.

**Property-based testing** — instead of a few hand-written examples, generate hundreds of random inputs and check a rule that must always hold (e.g. "apply(diff(a, b)) to a == b").

**LRU cache** — keeps the most recently used items; when full, drops the least recently used one.

**Event loop blocking** — Node runs JavaScript on one thread; a long computation freezes every other request until it finishes.

**RBAC** — role-based access control (owner/editor/reviewer/viewer).

**IDOR** — accessing someone else's data by changing an ID in the URL. Prevented by checking the user's role *for that document* on every request.

**Stored XSS** — malicious script saved in content and executed in other users' browsers. Prevented with DOMPurify.

---

## 5. Deep-dive questions (most important)

### Q1. How does your diff algorithm work?
"I implemented **Myers' algorithm**, the one Git uses. Imagine a grid: old lines along the top, new lines down the side. Moving right = delete a line, moving down = insert a line, moving diagonally = the lines are equal, which is free. The algorithm finds the path with the fewest non-diagonal moves — the smallest set of changes. It explores 'what's the furthest I can get with 0 edits, 1 edit, 2 edits…' and stops when it reaches the corner. It's O((N+M)·D), where D is the number of differences, so it's very fast when two versions are similar — which is the normal case.

Two practical additions: I strip the common beginning and end first (usually most of the document), and I cap the number of edits so a pathological input can't hang the server."

### Q2. How do you show exactly which words changed?
"After the line diff, I pair each deleted line with the corresponding added line in the same change block and run the same Myers algorithm on **words** instead of lines. If two lines have less than 30% in common I skip it — highlighting would just be noise."

### Q3. Explain your three-way merge.
"I have three versions: the **base** (the common ancestor), **ours** and **theirs**. I diff base→ours and base→theirs, which gives me the changed regions of each side in base coordinates. Then I walk through the base: regions from both sides that overlap are grouped. For each group — if only one side changed it, I take that side; if both made the identical change, I take it once; if they changed it differently, it's a **conflict** and I return the base, ours and theirs text for that spot. Everything else is copied. That's why most merges are automatic: people usually edit different paragraphs."

**Follow-up: why not just compare the two versions?** "With two versions you can't tell 'Priya deleted this line' from 'Aarav added this line'. The base tells you who changed what."

### Q4. How do you find the merge base?
"I load the commit graph of the document into memory (just ids, parents and a 'generation' number). I collect all ancestors of one head, then do a breadth-first search from the other head; the ancestors I hit that are shared are candidates, and I pick the one with the highest generation — the most recent common ancestor. The same graph gives 'X commits ahead, Y behind' and the list of commits in a merge request."

### Q5. How do you store versions efficiently?
"Like video keyframes. Most commits store a **delta**: 'replace lines 10–12 of the parent with these lines'. Every 20 commits I store a full **snapshot**, so rebuilding any version takes at most 20 small steps. I also store a snapshot when a delta wouldn't be much smaller than the full text. Every commit records a SHA-256 of its full content, and when I rebuild a version I check the hash — so a bug or corrupted delta can never silently return the wrong document. The Insights page shows how much space deltas saved."

**Follow-up: why not only deltas?** "Then opening version 500 would mean replaying 500 deltas. Snapshots bound the cost."
**Follow-up: why not only snapshots?** "A 50 KB document with 500 small edits would take 25 MB instead of a few hundred KB."

### Q6. What happens if two people commit to the same branch at the same moment?
"The branch pointer moves with a **conditional update**: 'set head = my new commit **only if** head is still the commit I started from'. MongoDB does that atomically, so exactly one wins. The loser gets a 409 'branch moved', and the commit it created is deleted. Their draft is safe; they click 'Update draft', which runs a three-way merge between the version they started from, their draft and the new head."

### Q7. How does autosave work, and what is a stale draft?
"The editor waits 1.2 seconds after the user stops typing (debounce), then PUTs the full text. Each save carries the `baseCommit` the user started from. If the branch head moves past that base — a teammate committed — the draft is **stale**. Committing is refused until they update, which is a three-way merge: base = their base commit, ours = their draft, theirs = the new head. Clean → the draft updates automatically; otherwise the conflict resolver opens."

**Follow-up: why send the whole text instead of changes?** "Simplicity and robustness — no risk of the server and browser getting out of sync. Documents are capped at 500 KB. Sending operations (like Google Docs) is the next step for real-time co-editing (see section 7)."

### Q8. What makes an approval 'stale'?
"When someone approves, I store the source branch head they reviewed. If the author pushes new commits, the head changes, and that approval no longer counts toward the required approvals. Otherwise someone could get approval and then sneak in a different change — GitHub has the same rule."

### Q9. How do line comments stay correct after new commits?
"Each line comment stores the commit it was written against. When the source branch moves on, the comment is marked **outdated** instead of being shown next to a line that may now contain different text."

### Q10. How is permission enforced?
"Every document route passes through a middleware `withDocument(action)`. It loads the document, works out my role from the owner and collaborators list, and checks the action against a role ladder: viewer < reviewer < editor < owner. If I have no role on a private document it returns **404**, not 403 — so you can't even discover that a document exists. The frontend hides buttons, but that's only cosmetic — every request is checked on the server."

### Q11. What's a protected branch?
"The default branch can be protected. Then only the owner can commit to it directly; editors must use a merge request. In the editor, if you're on a protected branch, 'Propose changes' creates a new branch, moves your draft there, and you open a merge request."

### Q12. How does blame work?
"I walk the first-parent chain from the oldest commit to the head, keeping an array that says which commit wrote each line. For every commit I apply its change: lines it inserted are credited to it; unchanged lines keep their previous author. Because deltas already tell me exactly which lines changed, most steps are cheap. Results are cached per head commit."

### Q13. Restore vs. rewriting history?
"Restoring an old version creates a **new** commit with that content. History is never deleted or rewritten, so you can always undo the restore too."

### Q14. How did you test the algorithms?
"With **property-based tests**: generate hundreds of random line arrays and random edits, and assert rules that must always be true — applying my diff to A gives exactly B; encoding and applying a delta is lossless; text → lines → text round-trips. Plus fixed cases for merges: clean merge, identical change, conflict, one-sided delete. And end-to-end API tests: protected branch, conflict, resolution with leftover markers rejected, merge commit with two parents, stale draft detection."

### Q15. What about XSS in shared documents?
"Markdown is converted with `marked` and then sanitized with DOMPurify before it's inserted into the page. A malicious `<script>` or `onerror` attribute is removed."

### Q16. Why a monolith?
"One developer, one database, one deploy. The version-control engine is isolated as pure functions in `lib/diff`, so if it ever needed to scale separately it could become its own service — but nothing measured says it has to."

### Q17. How would you scale it?
"Measure first (Stage 2). Then: cache rebuilt versions (LRU, then Redis if there are several servers), run big diffs in worker threads, tune the snapshot interval from the benchmark, paginate history, and move the commit graph into a cached structure for very large documents. For huge teams: real-time co-editing with CRDTs (Yjs) on top of the same commit model."

---

## 6. Stage 2 & 3 — how to talk about performance

> Never invent numbers. Run `npm run bench` and the k6 test, fill in `docs/STAGE2_BENCHMARKS.md`, then quote those.

Story template:
> "My benchmark showed a diff of a [N]-line document with 10% edits takes [X ms], and a three-way merge [Y ms]. Delta storage saved [Z%] of space at snapshot interval 20, and rebuild time grew linearly with the chain length — [A ms] at 20 steps vs [B ms] at 100 — which is why I cap the chain. I also measured that one big diff delayed a 5 ms timer by [C ms], proving it blocks the event loop, so in Stage 3 I moved large diffs to worker threads and added an LRU cache for rebuilt versions. Re-running the load test, autosave p95 went from [..] to [..]."

---

## 7. Trade-offs and known limitations

| Topic | Now | Next step |
|---|---|---|
| Collaboration | Async (branches, drafts, merge) | Real-time co-editing with CRDTs (Yjs) |
| Autosave | Sends the full text | Send operations / patches |
| Commit graph | Loaded per request for merge-base | Cache per document, or store ancestry |
| Merge granularity | Line-based conflicts | Word-level merge for prose |
| Blame through merges | Lines from a merge are credited to the merge commit | Follow both parents |
| Cache | In-process LRU | Redis when running several servers |
| Files | Markdown text only | Images/attachments via object storage |

---

## 8. Rapid-fire questions

- **Why store `generation` on commits?** Cheap way to pick the most recent common ancestor without timestamps (clocks can lie).
- **Why short hashes?** Humans can type 7 characters; the server resolves them and rejects ambiguous ones.
- **Why is `mrCounter` on the document?** Atomic `$inc` gives !1, !2… without duplicates under concurrency.
- **Why 404 for private docs?** Don't leak existence.
- **Why does saving an unchanged draft delete it?** If the text equals the head again, there's nothing to keep.
- **What does `expectedTargetHead` do?** Makes sure you resolved conflicts against the version that's still there.
- **Why is `lib/diff` free of database code?** Pure functions → easy tests, benchmarks, worker threads.
- **What is `chainDepth`?** How many deltas since the last snapshot — decides when to store the next snapshot.
- **Why `lean()` in Mongoose?** Returns plain objects — faster for read-only queries.
- **Why normalize line endings?** Windows `\r\n` vs Unix `\n` would make every line look changed.

---

## 9. Code map

| Topic | File |
|---|---|
| Myers diff + word diff | `server/src/lib/diff/myers.js` |
| Diff view (hunks, context) | `server/src/lib/diff/view.js` |
| Three-way merge | `server/src/lib/diff/merge3.js` |
| Merge base / ahead-behind | `server/src/lib/diff/graph.js` |
| Delta encoding | `server/src/lib/diff/delta.js` |
| Worker-thread pool | `server/src/lib/diff/pool.js` |
| Snapshot/delta storage + integrity | `server/src/modules/versioning/storage.service.js` |
| Branches, drafts, commits, rebase | `server/src/modules/versioning/versioning.service.js` |
| History, blame, ref resolving | `server/src/modules/versioning/history.service.js` |
| Merge requests, reviews, merge | `server/src/modules/reviews/reviews.service.js` |
| Permissions | `server/src/modules/documents/access.js` |
| Tests | `server/tests/` |
| Benchmark | `server/scripts/benchmark.js` |
| Editor | `client/src/features/editor/EditorPage.jsx` |
| Diff viewer | `client/src/features/diff/DiffViewer.jsx` |
| Conflict resolver | `client/src/features/diff/ConflictResolver.jsx` |
| Merge request page | `client/src/features/reviews/MergeRequestPage.jsx` |

---

## 10. Glossary

| Term | Meaning |
|---|---|
| Hunk | A block of changed lines with some unchanged context around it |
| Region | `{aStart, aEnd, bStart, bEnd}` — old lines replaced by new lines |
| diff3 | The classic three-way merge algorithm |
| Merge commit | A commit with two parents |
| Head | The commit a branch currently points to |
| Stale | Based on an older version than the current one |
| Snapshot / delta | Full text / only the changes |
| Integrity check | Verifying rebuilt content against its stored hash |
| Debounce | Wait until the user stops typing before acting |
| LRU | Least-recently-used cache eviction |
| Worker thread | A separate JavaScript thread for CPU-heavy work |
