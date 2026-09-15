# Permissions audit

Least privilege. Every entry below names its job. New entries need sign-off in the PR that adds them.

## Host permissions

| Host | Job |
|---|---|
| `https://x.com/*` | Session GraphQL reads and user-triggered writes. The only site the extension ever calls. |

## Permissions

| Permission | Job |
|---|---|
| `storage` | Session snapshots, settings, and corpus metadata in `chrome.storage.local`. |
| `sidePanel` | Panel registration and open-on-action behavior. |

## Content scripts

| Match | Job |
|---|---|
| `https://x.com/*` at `document_idle` | Ambient-session network actor. Cookies attach automatically. Nothing exfiltrated. |

## Content security policy

`extension_pages` locks to `script-src 'self'; object-src 'self'`. No inline scripts, no remote code, no object embeds. All pages load bundled files only.

## Review checklist for permission diffs

- New host or permission names its job in this file.
- No cookies API, no webRequest, no debugger, no broad hosts.
- `dist/manifest.json` regenerated from `src` before submit.
