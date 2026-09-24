# Permissions audit

Least privilege. Every entry below names its job. New entries need sign-off in the PR that adds them.

## Host permissions

| Host | Job |
|---|---|
| `https://x.com/*` | Reserved for user-triggered flows that use an approved X boundary. Private GraphQL operation discovery is blocked from release. |
| `http://127.0.0.1/*` | Local public API for explicitly invoked publishing, deletion, and abuse-report submission. |

## Permissions

| Permission | Job |
|---|---|
| `storage` | Session snapshots, settings, and corpus metadata in `chrome.storage.local`. |
| `sidePanel` | Panel registration and open-on-action behavior. |
| `alarms` | Daily overnight paper trigger. Fires a stored due flag, nothing else. |

## Content scripts

| Match | Job |
|---|---|
| `https://x.com/*` at `document_idle` | Reserved for user-authorized X flows using the approved boundary. Private operation discovery and bearer extraction are blocked from release. |

## Content security policy

`extension_pages` locks to `script-src 'self'; object-src 'self'`. No inline scripts, no remote code, no object embeds. All pages load bundled files only.

## Review checklist for permission diffs

- New host or permission names its job in this file.
- No cookies API, no webRequest, no debugger, no broad hosts.
- `dist/manifest.json` regenerated from `src` before submit.
