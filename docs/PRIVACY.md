# Privacy policy

x-memory keeps the corpus and working data on your device. Explicit sharing or publishing can send selected objects to a configured API. This page states what stays local, what can leave the browser, and what deletion does not cover.

## What stays local

- Your corpus: posts, authors, media references, briefs, claims, predictions, reviews, loops, collections, wagers, verdicts, views, and settings. Stored in IndexedDB and extension storage on your machine.
- Operation ids and the session bearer scanned from X pages. Stored locally and used only for the approved X flows.
- Local exports and backups. They are created only when you request an export or backup.
- Telemetry: none. The extension collects nothing and phones nothing home.

## What goes to X

The extension acts as you on X, using your active login session:

- Timeline reads for bookmarks and likes.
- Bookmark, unbookmark, and like actions you trigger.
- Grok conversation requests you trigger.

These calls go to X servers as your account. X sees them the way it sees your normal browsing.

## What never happens

- X cookies, tokens, and session material are not sent to the hosted API. A publisher API key is sent only to the configured API when an explicit publish or delete action invokes that adapter.
- No analytics, crash reporting, or usage pings unless you explicitly opt into a future telemetry toggle.
- No remote code. Every script ships in the extension package under a locked content policy.

## Shared and hosted objects

- Portable share links carry only the collection data you chose to share. The current Share action creates a local link; it does not call the hosted API.
- The hosted collection adapter sends one selected collection to the configured API only after a public or unlisted visibility check. Private is the default and is checked again immediately before the request. No public deployment URL is assumed.
- The hosted adapter deletes the remote collection before removing the local collection. A failed remote delete leaves local state intact. Local wipe does not delete hosted objects or abuse reports.
- Abuse reports carry the reported object id, a reason, and a hashed reporter key. Raw keys never persist server side; only keys in the configured moderator scope can read reports. Reports are retained for 90 days and capped at 1,000 entries.

## Deletion

- Wipe local data in options removes the extension's local databases and extension storage, then verifies both are empty. A blocked or incomplete wipe reports failure and does not clear storage.
- Uninstalling the extension removes extension storage, but hosted API objects and reports remain on the server.
- Reports cannot undo a publish; they flag it for moderator review.

## Claim evidence

| Claim | Evidence |
|---|---|
| Local storage is wiped only after database deletion completes | `tests/settings.test.ts` covers successful, blocked, and verified deletion paths. |
| Exports are explicit and local | `tests/export.test.ts` covers sanitized export and backup validation. |
| Visibility gates publishing | `tests/hosted-publishing.test.ts` and `tests/visibility.test.ts` cover private, public, and request-time checks. |
| Hosted deletion precedes local deletion | `tests/hosted-publishing.test.ts` covers success, forbidden, and already-absent responses. |
| Reports are scoped and bounded | `tests/server-api.test.ts` covers moderator access, retention, count, pagination, and rate limits. |
| Server state survives restart | `tests/server-api.test.ts` covers durable object, owner, and report reloads. |

## Questions

Open an issue on the repository. The permission audit in docs/PERMISSIONS.md lists every capability the extension requests and why.
