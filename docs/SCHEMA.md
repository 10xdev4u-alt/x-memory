# Corpus schema (v2)

Database `x-memory`, version 2. Five stores, all keyed for upsert sync.

| Store | Key | Indexes | Holds |
|---|---|---|---|
| posts | id | by-author, by-provenance | post text, author ref plus cached handle and name, quote and reply references, timestamps, saved/liked/both |
| authors | id | none | handle, name, save/like counts, last seen |
| media | id | by-post | images, videos, links per post |
| briefs | postId | none | Grok brief text plus creation time |
| claims | id | by-post, by-status | factual claims with fresh, evolving, or dead status plus evidence |

Migrations bump `DB_VERSION` and add stores or indexes in `onupgradeneeded`. Never rename a store in place. Sync writes with `put`, so replays stay idempotent.
