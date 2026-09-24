# Release evidence checklist

This is a dry-run evidence record, not a release approval. A full release is blocked while any blocker below is open or any required check is not green.

## Run from a clean checkout

1. Check out the exact source SHA under review.
2. Run `npm ci`.
3. Run `npm run verify`.
4. Run `npm run release:evidence` after verification. The command writes `release/evidence.json` and `release/evidence.md`; both are ignored build outputs.
5. Review the generated record, attach it to the release PR, and obtain `the-ai-developer` approval.

## Required evidence

| Evidence | Required value | Source |
| --- | --- | --- |
| Source SHA | Exact commit packaged | `git rev-parse HEAD` and `dist/provenance.json` |
| Automated checks | `npm run verify` result | CI check and local command output |
| Artifact | Extension zip name and SHA-256 | `release/SHA256SUMS` |
| Permissions | Manifest permissions and host permissions | `src/manifest.json` and `docs/PERMISSIONS.md` |
| Privacy | Policy evidence and related tests | `docs/PRIVACY.md`, `tests/settings.test.ts`, `tests/hosted-publishing.test.ts` |
| Manual flows | Every live flow and its result | Release evidence record |

The evidence command refuses to run without `--verified` in its package script. It records the current source SHA and artifact hash; it does not publish, tag, or upload anything.

## Public claim map

| Claim allowed in release copy | Passing evidence |
| --- | --- |
| Local corpus and settings storage | `tests/settings.test.ts`, `docs/PRIVACY.md` |
| Search, briefs, and Morning Paper behavior | `tests/search.test.ts`, `tests/briefs.test.ts`, `tests/paper-job.test.ts` |
| Visibility-gated hosted sharing | `tests/hosted-publishing.test.ts`, `tests/visibility.test.ts` |
| Extension permissions and CSP | `tests/manifest.test.ts`, `docs/PERMISSIONS.md` |
| Responsive landing and reduced motion | `tests/landing.test.ts`, `scripts/smoke-landing.mjs` |
| Reproducible artifact provenance | `tests/release-provenance.test.mjs`, `scripts/package.mjs` |

Do not promote a claim merely because a module exists. Its mapped check must pass against the packaged source.

## Manual flows

| Flow | Required result | Current dry-run state |
| --- | --- | --- |
| Load the unpacked extension in Chrome | Panel, options, keyboard, and focus smoke passes | Automated by `scripts/smoke-extension.mjs` |
| Open an active X session and sync bookmarks and likes | User-visible sync completes with the approved X boundary | Not run; blocked by R3 |
| Generate a brief and Morning Paper with Grok | User-visible output and quota error path are correct | Not run; blocked by R3 |
| Publish and delete a selected collection | Visibility and remote deletion outcomes are explicit | Automated tests only; no live API run |
| Wipe local data and verify deletion | Local data is removed only after verified deletion | Automated tests only; no manual run |
| Inspect the landing page at mobile, tablet, and desktop | No overflow, missing names, or interaction trap | Automated by `scripts/smoke-landing.mjs` |

## Open blockers

- **R3 X boundary — issues #174–#182:** private operation discovery, session-secret lifecycle, CSRF handling, SSE parsing, authentication recovery, GraphQL error handling, and network timeout/cancellation work remain open or blocked by the approved official-API boundary in #173.
- **Live-flow evidence:** the clean dry-run does not exercise an active X session, Grok, or a configured hosted publishing API. Do not describe those flows as manually verified.
- **Release publication:** this repository has no release tag, store upload, or hosted landing deployment recorded by this checklist. Do not publish from the dry-run record.
- **Historical changelog:** `CHANGELOG.md` v1.0.0 is a historical draft and is not evidence that every listed feature is currently release-approved.

Any open blocker sets the generated evidence decision to `blocked`. Clearing one blocker does not clear the others.
