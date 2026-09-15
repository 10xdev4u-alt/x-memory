# Agentic operating system

This repo is built by a crew, not a crowd. Every agent reads this file before touching anything.

## Identities

| Role | Who | Used for |
|---|---|---|
| Pusher | `10xdev4u-alt` / `10xdev4u@gmail.com` (repo-local identity) | all commits, pushes, `gh` commands |
| Reviewer | `the-ai-developer` | every PR review, sole reviewer authority |
| Co-author | `the-ai-developer`, only co-author on every commit | `Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>` |

Local identity is repo-scoped. Never set it global. Never rewrite it.

## Commit law

- Conventional commits, subject line exactly six space-separated words. `type(scope):` counts as word one.
- Example: `feat(sync): fetch bookmarks using active session` (six tokens).
- One logical change per commit. Present tense, imperative mood.
- Every commit carries the co-author trailer. No exceptions.
- Never amend a pushed commit, never force-push, never skip hooks, never commit secrets.

## Issue-first law

- One issue per branch, one branch per issue. Issue numbers ride in branches, footers, and PRs.
- 70-issue blitz precedes all code. New work starts as an issue or it does not start.

## PR lifecycle

Research, evaluate, confirm issues, validate the idea, build with tests, six-word commits, local validation (typecheck, tests, build, screenshots for UI), push, PR with the template, review by `the-ai-developer`, address everything, merge as a merge commit (squash and rebase stay off), delete local and remote branches, prune stale refs, next.

## Fleet roles

Scout (spikes), Architect (design, issue quality), Builder (one issue per branch), Reviewer (`the-ai-developer` voice), QA (acceptance checks), Wordsmith (docs, unslop gate), Release captain (milestones, changelog, tags).

## Skill hooks

Commits follow the git-commit skill and its safety protocol. Branching, merges, and releases follow git-workflow (GitHub Flow on `main`). GitHub operations run through `gh` as `10xdev4u-alt`. Docs, README, landing copy, and changelogs pass the unslop audit. Sensitive code passes security review before merge. Features carry tests.

## Definition of done

Acceptance criteria met, tests added and green, typecheck and build green, docs touched when behavior changed, unslop pass when words changed, screenshots when pixels changed, branches cleaned after merge.
