# Performance notes

Measured with `node scripts/bench.mjs` on synthetic corpora. Numbers move with hardware, trends matter more.

## Current figures

| Corpus | Index build | 50 searches | Taxonomy | Topics x1000 |
|---|---|---|---|---|
| 1,000 posts | 24ms | 35ms | 97ms | 6ms |
| 5,000 posts | 88ms | 201ms | 825ms | 5ms |
| 20,000 posts | 354ms | 726ms | 11s | 8ms |

## Benchmark gate

`npm run verify` runs the benchmark after the extension build. The gate covers 1,000, 5,000, and 20,000 synthetic posts and fails when index build, 50-search, taxonomy, or topic extraction exceeds its documented limit. Run it directly with `npm run build && npm run bench`.

Search stays interactive past 20k posts. Index builds are one-time per session.

## Design rules that keep it fast

- Clustering runs in scheduled jobs, never on the render path. The panel shows progress and can cancel the active job.
- Taste-profile results are cached by account and corpus version; a changed corpus schedules a new build without discarding the previous valid cache.
- Signals shared by more than five percent of the corpus do not cluster. Common words carry no grouping value and explode candidate pairs on dense data. This cap fixed a crash at 20k posts.
- Library lists render at most 100 rows. Full scans happen in workers with progress callbacks.
- Media lookups use the by-post index, never full scans.
- Briefs, claims, and verdicts cache forever. Paid and slow work never repeats.

## Known limits

- Taxonomy past 20k posts wants chunking or a worker thread. File an issue with corpus size when it bites.
- Sync writes per page, not per post, to keep transactions short.
