# Privacy policy

x-memory keeps your data on your device. This page states exactly what lives where and what, if anything, leaves the browser.

## What stays local

- Your corpus: posts, authors, media references, briefs, claims, predictions, reviews, loops, collections, wagers, verdicts, views, and settings. Stored in IndexedDB and extension storage on your machine.
- Operation ids and the session bearer scanned from X pages. Stored locally, never transmitted anywhere except back to X itself.
- Telemetry: none. The extension collects nothing and phones nothing home.

## What goes to X

The extension acts as you on X, using your active login session:

- Timeline reads for bookmarks and likes.
- Bookmark, unbookmark, and like actions you trigger.
- Grok conversation requests you trigger.

These calls go to X servers as your account. X sees them the way it sees your normal browsing.

## What never happens

- No cookies, tokens, or session material leave the browser for any third party.
- No analytics, crash reporting, or usage pings unless you explicitly opt into a future telemetry toggle.
- No remote code. Every script ships in the extension package under a locked content policy.

## Shared and hosted objects

- Portable share links carry only the collection data you chose to share, peer to peer.
- Publishing to the hosted API sends only the object you publish, under the visibility you set. Private is the default.
- Abuse reports carry the reported object id, a reason, and a hashed reporter key. Raw keys never persist server side.

## Deletion

- Wipe local data in options removes the corpus, settings, and cached operations from the device.
- Uninstalling the extension removes everything the extension stored.
- Hosted objects delete through owner takedown. Reports cannot undo a publish, they flag it for review.

## Questions

Open an issue on the repository. The permission audit in docs/PERMISSIONS.md lists every capability the extension requests and why.
