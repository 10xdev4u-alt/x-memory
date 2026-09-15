# Corpus schema (v1)

Database `x-memory`, version 1. Four stores, all keyed for upsert sync.

| Store | Key | Indexes | Holds |
|---|---|---|---|
| posts | id | by-author, by-provenance | post text, author ref, timestamps, saved/liked/both |
| authors | id | none | handle, name, save/like counts, last seen |
| media | id | by-post | images, videos, links per post |
| briefs | postId | none | Grok brief text plus creation time |

Migrations bump `DB_VERSION` and add stores or indexes in `onupgradeneeded`. Never rename a store in place. Sync writes with `put`, so replays stay idempotent.
