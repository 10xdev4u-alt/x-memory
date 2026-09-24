# Recovery audit

Date: 2026-09-24
Repository: `10xdev4u-alt/x-memory`
Branch: `main`
Working tree at audit baseline: clean; recovery artifacts are intentionally uncommitted while issues are worked one at a time

## Verification baseline

- `npm test`: 61 files and 261 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run build:server`: passed, but the documented server entrypoint was missing.
- `npm audit --audit-level=moderate`: one critical and one moderate Vitest advisory.
- Coverage: no report or coverage gate exists.
- Lint: no repository lint script or configured linter exists.
- Performance benchmark: 20,000-post taxonomy clustering took 11,012 ms in the local run.

Passing tests prove only the current contracts. They do not prove that the real browser path, network boundary, data ownership, or release artifact works.

## Confirmed findings

### Critical

1. The content script reads a page JavaScript global from Chrome's isolated world. `src/content/x-session.ts:8-11` cannot see `window.webpackChunk_twitter_responsive_web` as implemented.
2. Grok requests target `https://grok.x.com`, while the manifest grants only `https://x.com/*`. `src/lib/grok.ts:100-105` and `src/manifest.json:1`.
3. `ensureConversation()` reads `document.cookie` from the extension origin, not X. `src/lib/grok.ts:46`; callers omit the stored CSRF value at `src/panel.ts:575` and `src/panel.ts:684`.
4. Any valid server key can overwrite another owner's object and become its owner. `server/src/server.ts:271-286`.
5. A minimally valid backup can clear the corpus before restore fails. `src/lib/export.ts:52-56` and `src/lib/backup.ts:23-31`.
6. Shared packages can overwrite authentic posts and briefs by ID. `src/lib/sharing.ts:74-92` and `src/lib/sharing.ts:101-117`.
7. The private X interface strategy conflicts with current X terms that restrict scraping and non-published access. This is a product and account-risk decision, not a small implementation detail.

### High

8. Account database naming exists but is not used. `src/lib/accounts.ts:18-20`; runtime paths open the default database.
9. One sync progress key is shared by bookmarks, likes, and every account. `src/lib/sync-progress.ts:3-28` and `src/lib/sync.ts:83-85`.
10. Repeated sync signals inflate author aggregates and overwrite saved or liked provenance. `src/lib/authors.ts:31-40` and `src/lib/sync.ts:100-112`.
11. SSE parsing assumes arbitrary network chunks contain complete events. `src/lib/grok.ts:117-143`.
12. GraphQL errors are returned as successful envelopes and can be treated as end-of-feed. `src/lib/session-client.ts:24-26`, `src/lib/session-client.ts:96`, and `src/lib/sync.ts:93-94`.
13. The session check treats `ct0` as authentication and does not clear stale bearer or CSRF values on logout. `src/lib/session-machine.ts:17-18` and `src/content/x-session.ts:44-57`.
14. Visible sync controls dispatch events with no listener. `src/panel.ts:84-87` and `src/options.html:16-17`.
15. Failed paper generation can still mark onboarding complete. `src/panel.ts:570-594` and `src/panel.ts:767-773`.
16. The server is volatile, browser integration is absent, and the documented entrypoint is wrong. `server/src/server.ts:43-45`, `server/README.md:8`, and `server/tsconfig.json:1`.
17. Clustering runs on the library render path and can block for seconds. `src/panel.ts:350-438` and `src/lib/profile.ts:38-49`.
18. Untrusted post text is inserted into model prompts without a prompt-injection boundary. `src/lib/ask.ts:32-44` and related intelligence modules.
19. The release pipeline does not verify the server, package, audit, coverage, lint, or real extension flow. `.github/workflows/ci.yml:18-24`.
20. The changelog and store copy describe features that have no production integration. `CHANGELOG.md:7-15` and `src/panel.ts:1-778`.

### Medium

21. Global keyboard shortcuts intercept arrow keys and digits while editing inputs. `src/panel.ts:46-69`.
22. The palette uses dialog semantics without focus containment or restoration. `src/panel.html:21-23` and `src/panel.ts:91-115`.
23. CSV export permits formula-triggering text from posts. `src/lib/notion-obsidian.ts:8-27`.
24. IDB delete and clear helpers resolve on request success rather than transaction completion. `src/lib/db.ts:127-133` and `src/lib/db.ts:167-181`.
25. Wipe resolves as successful when database deletion is blocked. `src/lib/settings.ts:36-48`.
26. Nested profile validation accepts malformed arrays and values. `server/src/server.ts:85-93`.
27. Quota functions are not called by production Grok paths. `src/lib/quota.ts:52-76`.
28. The content script can stringify the webpack registry several times per page load. `src/content/x-session.ts:33-41`.
29. The release build has no clean step and can retain stale generated files. `scripts/copy-assets.mjs:1-13` and `scripts/package.mjs:9-16`.
30. The server README points to an entrypoint that the server build does not create. `server/README.md:8`.

## Reproduction commands

```bash
npm test
npm run typecheck
npm run build
npm run build:server
npm audit --audit-level=moderate
node scripts/bench.mjs
```

The recovery program adds a reproduction or validation command to every issue. The issue is not ready when it only says “add tests” or “fix security.”

## Evidence probes

The probes below are read-only or use disposable fake databases and fetch stubs. They are not production commands.

- **P-01, isolated world:** Bounded browser probe. Load a fixture page that sets a webpack-like global in the page world. Run the content script in Chrome's isolated world and record that the global is not visible. Expected: the healer receives an empty registry.
- **P-02, host permission:** `node -e "const m=require('./src/manifest.json'); if(m.host_permissions.includes('https://grok.x.com/*')) process.exit(1)"`. Expected: the command exits successfully because the permission is absent.
- **P-03, CSRF origin:** Bounded Node probe: seed `xmem.ops` and `xmem.bearer` in a fake Chrome storage object, set `document.cookie` to an empty string, and call `ensureConversation` with a fetch spy. Expected: `expired missing csrf token` before the fetch spy is called.
- **P-04, ownership:** Start `dist-server/src/server.js` with two keys, PUT as owner, PUT the same ID as attacker, then DELETE as attacker. Expected: overwrite and delete both return 200.
- **P-05, destructive restore:** `node --input-type=module -e "import{indexedDB}from'fake-indexeddb';import{openDb,putRecords,countRecords}from'./dist/src/lib/db.js';import{restoreBackup}from'./dist/src/lib/backup.js';globalThis.indexedDB=indexedDB;let d=await openDb(indexedDB,'audit');await putRecords(d,'posts',[{id:'keep'}]);d.close();try{await restoreBackup(JSON.stringify({version:1,posts:[]}),{dbFactory:indexedDB,dbName:'audit'})}catch{};d=await openDb(indexedDB,'audit');console.log(await countRecords(d,'posts'));d.close()"`. Expected: `0` after the failed restore.
- **P-06, shared overwrite:** Seed a post with ID `real` in fake IndexedDB, import a shared package with the same ID, then read the post. Expected: the imported author, text, URL, and brief replace the original.
- **P-07, X terms:** Bounded research probe against the official April 10, 2026 X terms PDF. Search for `scraping`, `published interfaces`, and `circumvent`. Expected: the terms contain restrictions relevant to the current private-interface strategy.
- **P-08, account scope:** `node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/accounts.ts','utf8');console.log((s.match(/dbNameFor/g)||[]).length)"` and search production callers. Expected: the helper exists but has no runtime caller.
- **P-09, progress scope:** Write a progress record with `cursor: BOOKMARK_CURSOR`, run `syncLikes` with a fake transport, and inspect the first variables. Expected: Likes receives the bookmarks cursor.
- **P-10, author replay:** Upsert the same author signal three times into fake IndexedDB and read the record. Expected: `saveCount` becomes 3 instead of remaining 1.
- **P-11, SSE framing:** Feed `sendGrokMessage` a stream split inside one JSON SSE event. Expected: the final `fullText` contains a JSON fragment instead of the decoded text.
- **P-12, GraphQL errors:** Call `callOperation` with a successful HTTP response whose JSON contains `errors` and no `data`. Expected: the client resolves an envelope instead of throwing a typed session error.
- **P-13, session marker:** `node --input-type=module -e "import{probeSession}from'./dist/src/lib/session-machine.js';console.log(probeSession('ct0=present'))"`. Expected: `active` without an authentication cookie.
- **P-14, dead controls:** Count `xmem:command` dispatch sites and listeners across `src`. Expected: dispatches exist with no listener.
- **P-15, onboarding completion:** Read the paper onboarding branch in `src/panel.ts` and follow the `generatePaper` return path. Expected: `completeStep("paper")` runs after a caught generation failure.
- **P-16, server entrypoint:** Run `npm run build:server` and `test -f dist-server/main.js`. Expected: the documented file is absent while `dist-server/src/main.js` exists.
- **P-17, render performance:** Run `node scripts/bench.mjs` and record the 20,000-post taxonomy time. Expected: the clustering benchmark takes seconds, not an interactive frame budget.
- **P-18, prompt boundary:** Build an ask prompt with a post containing `Ignore previous instructions`. Expected: the untrusted text is concatenated into the instruction-bearing prompt without a source boundary.
- **P-19, release gates:** Read `.github/workflows/ci.yml` and compare its commands with `package.json`. Expected: no server build, package check, audit, coverage, lint, or E2E command.
- **P-20, release claims:** Compare `CHANGELOG.md` and `docs/STORE.md` with production imports and visible controls. Expected: claimed features have no corresponding production path.

## Research sources

- Chrome cross-origin requests: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Chrome content-script isolation: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome storage: https://developer.chrome.com/docs/extensions/reference/api/storage
- IndexedDB transaction completion: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event
- OWASP CSV injection: https://owasp.org/www-community/attacks/CSV_Injection
- X terms: https://cdn.cms-twdigitalassets.com/content/dam/legal-twitter/site-assets/x-terms-of-service-2026-04-10/en/x-terms-of-service-2026-04-10.pdf
