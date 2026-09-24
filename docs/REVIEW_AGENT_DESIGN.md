# Evidence-led review agent design

Status: local design only, uncommitted
Applies to: pull request review operations for `10xdev4u-alt/x-memory`
Final approval identity: `the-ai-developer`

This document guides the development fleet. It is not a separate x-memory product and does not authorize commits, pushes, approvals, or merges.

## Objective

Produce fewer, stronger review findings by separating model judgment from evidence. Every blocking finding must survive a reproduction, static confirmation, contract comparison, or independent verification. The system should reduce noise, preserve review history, and keep the human reviewer in control.

## Evidence record

Every evidence record identifies:

- source repository, path, and line or contract location
- exact command, probe, or manual procedure
- observed result and environment
- limitations, assumptions, and missing context
- timestamp and evidence owner

A model statement, unrun benchmark, or inferred result is not evidence. When evidence is missing, the record states the gap and the finding cannot block.

## Decision record

Every material decision record states:

- decision and status: proposed, accepted, or superseded
- context and problem being solved
- evidence sources and limitations
- alternatives considered
- rationale for the selected option
- consequences, trade-offs, and affected systems
- reversal condition and rollback plan
- owner and decision date

A decision record cannot claim a benchmark, test, security probe, or release result that was not run. Superseded records retain their evidence and point to the replacement decision.

## System shape

```text
GitHub App control plane
  PR event ingestion
  delivery-id deduplication
  head-SHA snapshot requests
  check and review publisher
          |
          v
Snapshot orchestrator
  immutable checkout
  lockfile-aware dependency index
  symbol and call graph
  configuration map
  historical PR and comment index
          |
          v
Review planner
  deterministic change classifier
  policy-aware risk scorer
  relevant-context retrieval
  dependency-ordered analyzer DAG
          |
          v
Ephemeral analysis workers
  correctness
  security and privacy
  tests and coverage
  API and compatibility
  performance
  migration and data
  accessibility
  documentation and unslop
  runtime and E2E
          |
          v
Evidence and adjudication
  bounded reproduction
  static confirmation
  independent verifier
  finding normalization
  fingerprint deduplication
  severity and confidence calibration
          |
          v
GitHub output
  one required check per head SHA
  one grouped pending review per head SHA
  valid inline threads
  concise summary
  optional patch and test artifacts
```

## Control plane

The GitHub App receives a narrow event set:

- `pull_request` for opened, reopened, synchronize, ready for review, and converted to draft
- `pull_request_review` and `pull_request_review_comment`
- `check_run` and `check_suite`
- `issue_comment` for allowlisted commands from trusted collaborators
- `push` when a configured branch changes
- `installation` and `installation_repositories` for permission changes

Every delivery is processed by installation ID, repository ID, delivery GUID, event action, pull request ID, base SHA, and head SHA. The same delivery is idempotent. A repeated event for an existing head SHA reuses the completed result unless a policy or analyzer version changed.

The App requests the minimum installation permissions needed to read repository metadata and pull requests, create checks, and submit reviews. It does not request write access to contents or workflows. Installation tokens are repository-scoped and short-lived.

## Snapshot service

A snapshot is immutable and keyed by repository ID and head SHA. It records:

- base and head commits
- merge-base commit
- changed paths and diff hunks
- lockfile and package-manager hashes
- toolchain and build configuration
- dependency graph
- symbol table and call edges
- relevant configuration and permissions
- prior reviews, comments, and issue links
- analyzer and policy versions

Caches are content-addressed. A changed lockfile invalidates dependency results. A changed call graph invalidates only affected analyzer inputs. A failed or partial snapshot is a review gap, not a clean result.

## Untrusted code boundary

Pull request text, code, comments, generated files, test output, and workflow definitions are data. They cannot change policy, authorize commands, request secrets, select executables, or expand network access.

Untrusted code runs only in ephemeral workers with:

- no production credentials
- no write-capable repository token
- no access to the host runner filesystem
- read-only source mounts
- CPU, memory, disk, process, and time limits
- network disabled by default
- an explicit package and browser download policy
- command allowlists derived from trusted base-repository policy
- logs and artifacts retained according to a documented policy

Do not use `pull_request_target` to execute fork code. Prefer a restricted `pull_request` workflow or an App-controlled worker with an installation-scoped read token. Pin every action by commit SHA.

## Review planning

The deterministic classifier reads:

- changed paths and language
- public API and contract files
- dependency and lockfile changes
- database schemas and migrations
- authentication, authorization, secrets, and storage code
- build, CI, release, and permission changes
- generated files and test gaps
- issue and PR scope

The risk score combines deterministic weights. Models may explain or adjust classification, but they cannot lower a deterministic policy floor. P0 and P1 changes receive full relevant-context retrieval and independent runtime evidence when possible.

## Analyzer contract

Every analyzer returns the same typed finding shape:

```ts
interface ReviewFinding {
  repositoryId: number;
  headSha: string;
  fingerprint: string;
  path: string;
  line?: number;
  rule: string;
  severity: "P0" | "P1" | "P2" | "P3";
  confidence: number;
  title: string;
  impact: string;
  evidence: ReviewEvidence[];
  recommendation: string;
  regressionTest?: string;
}
```

`ReviewEvidence` must identify at least one of:

- failing test or command
- bounded reproduction
- static-analysis trace
- contract mismatch
- dependency or configuration proof
- independent verifier result
- measured performance result

A model statement is context, not evidence.

## Evidence gate

A finding may be published when at least two conditions hold:

1. The analyzer points to a valid changed line or a relevant file-level location.
2. The evidence reproduces, confirms, or independently verifies the claim.

Only verified P0 and P1 findings can block. P2 and P3 findings are advisory. Missing evidence lowers confidence and removes blocking status. A finding that cannot map to the current diff moves to the summary.

## Deduplication and supersession

The fingerprint uses repository, rule, normalized path, symbol or contract identity, normalized code evidence, and policy version. A new push:

- reuses unchanged findings
- moves comments that no longer map to the summary
- marks superseded findings as stale
- never reposts the same fingerprint
- preserves existing human replies

## GitHub output

The publisher creates one pending review per head SHA, adds valid inline threads, and submits the review once. This avoids notification spam and secondary rate limits.

The check contains:

- snapshot status
- analyzer status
- verified blocker count
- review-gaps count
- test and runtime evidence
- concise summary
- link to the grouped review

The App may submit `REQUEST_CHANGES` for verified blocking findings. It never submits `APPROVE` and never merges. `the-ai-developer` remains the final approval authority.

Suggested patches and tests are artifacts. They are never committed, pushed, or opened as a PR by the review system. A Builder applies them only through the issue, branch, six-word commit, local validation, and human review workflow.

## Historical context

The historical index stores public repository records:

- prior PR diffs and review comments
- accepted and dismissed findings
- issue links
- release incidents
- regression tests
- analyzer accuracy and false-positive history

It retrieves only context relevant to the changed contract, path, symbol, or rule. Historical comments cannot authorize commands or policy changes.

## Quality evaluation

The system is not called better than another reviewer without measurements. Track:

- verified true-positive rate
- false-positive rate by rule and analyzer
- duplicate suppression rate
- valid-inline rate
- review latency and cost
- escaped-defect rate
- reviewer acceptance and dismissal rates
- flaky reproduction rate
- security findings discovered before merge

A new rule or analyzer starts in shadow mode. It must meet repository-defined precision, recall, latency, and cost thresholds before it can block.

## Failure behavior

The flow fails closed:

- missing snapshot: no clean result
- failed build: report the gap
- unavailable analyzer: report the gap
- missing evidence: advisory only
- API publication failure: retry idempotently, then report partial output
- rate limit: stop publishing and resume from stored findings
- policy parse failure: block automated approval and request human review

## Official constraints applied

- GitHub App permissions should be the minimum required for API access and webhook events.
- Installation access tokens are repository-scoped and expire.
- Pull request review comments are diff- and commit-sensitive.
- Grouped pending reviews reduce notification and secondary-rate-limit pressure.
- `pull_request_target` and `workflow_run` must not execute untrusted fork code with secrets or write-capable tokens.
- Persistent self-hosted runners require stronger isolation because a compromised runner can survive between jobs.

## Sources

- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
- https://docs.github.com/en/rest/pulls/comments
- https://docs.github.com/en/rest/pulls/reviews
- https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- https://docs.github.com/en/actions/reference/security/secure-use
