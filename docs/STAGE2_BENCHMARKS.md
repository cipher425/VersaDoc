# Stage 2 — Benchmarks (measure before optimizing)

> Only real numbers from your own runs go here. Write down the machine next to every result.

| Item | Value |
|---|---|
| CPU / RAM | |
| Node version | |
| MongoDB | Atlas M0 / local |
| Settings | SNAPSHOT_INTERVAL=20, CONTENT_CACHE_SIZE=0, DIFF_WORKERS=0 |

## A. Algorithm benchmark (no database)

```bash
npm run bench
```

Paste the tables it prints:

**1. Line diff**

| lines | edited | regions | diff time | correct |
|---|---|---|---|---|
| | | | | |

**2. Diff view with word highlights**

| lines | hunks | time |
|---|---|---|
| | | |

**3. Three-way merge**

| lines | conflicts | time |
|---|---|---|
| | | |

**4. Storage — 100 versions, 1% edits each**

| SNAPSHOT_INTERVAL | stored | full | saved |
|---|---|---|---|
| | | | |

**5. Rebuild time vs chain length**

| chain length | rebuild |
|---|---|
| | |

**6. Event-loop blocking**: a 5 ms timer fired after ____ ms while a 50,000-line diff ran.

## B. API load test (k6)

Server `.env`: `RATE_LIMIT_ENABLED=false`, a separate database (e.g. `/versadoc_loadtest`).

```bash
npm start -w server
k6 run -e BASE=http://localhost:5000 -e USERS=20 load-tests/k6/editing.js
k6 run -e BASE=http://localhost:5000 -e USERS=100 load-tests/k6/editing.js
```

| Writers | req/s | error % | autosave p95 | commit p95 | open document p95 | history p95 | compare p95 | commits created |
|---|---|---|---|---|---|---|---|---|
| 20 | | | | | | | | |
| 100 | | | | | | | | |

## C. Hypotheses

| # | Hypothesis | Confirmed? | Evidence |
|---|---|---|---|
| H1 | Diffs of typical edits are fast (< 10 ms for 10k lines) because D is small | | |
| H2 | Delta storage saves > 80% space | | |
| H3 | Rebuild cost grows linearly with chain length → SNAPSHOT_INTERVAL matters | | |
| H4 | A big diff blocks the event loop noticeably | | |
| H5 | Opening documents repeatedly rebuilds the same versions (cache would help) | | |
| H6 | Loading the whole commit graph per request gets slower with long histories | | |

## D. Findings → Stage 3 actions

| Finding | Numbers | Change |
|---|---|---|
| | | |
