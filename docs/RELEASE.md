# Release process

## Channels

- Internal: unpacked dist loaded by the crew for smoke checks.
- Beta: store beta track or direct zip to testers. Ship with `-beta` packages.
- Staged: 25 percent rollout, watch crash and quota signals for 48 hours.
- Full: 100 percent with the changelog entry linked in the listing.

## Cut a release

1. Bump versions together. The release test fails the build on drift.
2. Run typecheck, tests, build, then package: `npm run package`.
3. Tag `vX.Y.Z` after the release PR merges. Tags never move.
4. Upload the zip from `release/` to the store tracks in channel order.

## Rollback

1. Halt the staged rollout in the store console first.
2. Revert the offending merge with a revert PR through the normal review loop.
3. Rebuild the previous tag, repackage, and publish as a hotfix version.
4. Open a postmortem issue with the timeline, the trigger, and the guard that would have caught it.
5. Beta testers stay on the fixed build for one cycle before restaging.

## Version gates

- Risky updates never skip beta.
- Rollback artifacts keep for two releases, then delete.
