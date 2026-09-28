# Stage 3 — Optimizations (behind config flags)

Every optimization is a setting in `server/.env`, so Stage 1 behaviour is one change away and before/after can be measured with the same tests.

| # | Problem it targets | Change | Setting |
|---|---|---|---|
| 1 | The same versions get rebuilt from deltas again and again (opening a doc, comparing, merging) | In-memory **LRU cache** of rebuilt versions (`infra/lru.js`, used in `storage.service.js`) | `CONTENT_CACHE_SIZE=500` |
| 2 | Big diffs / merges block the single Node event loop | **Worker-thread pool** (`lib/diff/pool.js`); only inputs above a size threshold use it | `DIFF_WORKERS=2`, `WORKER_THRESHOLD_LINES=2000` |
| 3 | Storage vs rebuild-speed trade-off | Tune the **snapshot interval** using the benchmark (table 4 vs table 5) | `SNAPSHOT_INTERVAL=…` |
| 4 | Pathological inputs | Edit budget for Myers — falls back to a coarse diff instead of hanging | `MAX_DIFF_EDITS=20000` |
| 5 | Blame recomputed for the same head | Blame results cached per head commit | automatic |

Check the live configuration and cache hit rate: `GET /api/v1/system/stats` (logged-in).

## Suggested Stage 3 `.env`

```
CONTENT_CACHE_SIZE=500
DIFF_WORKERS=2
WORKER_THRESHOLD_LINES=2000
SNAPSHOT_INTERVAL=20   # or what your benchmark suggests
```

## Re-measure (real numbers only)

| Test | Metric | Stage 1 | Stage 3 | Change |
|---|---|---|---|---|
| Bench 6 | event-loop delay during big diff (via API) | | | |
| k6 20 writers | open document p95 | | | |
| k6 20 writers | compare p95 | | | |
| k6 100 writers | autosave p95 | | | |
| `/system/stats` | cache hit rate | – | | |

## Next steps if measurements show a need

- **Several API servers** → move the cache to Redis (in-process caches are per server).
- **Very long histories** → cache the commit graph per document instead of loading it per request.
- **Real-time co-editing** → CRDTs (Yjs) over WebSockets, periodically committed into the same commit model.
