# Recache migration checkpoints

## Fixture validation and version checks (D06, 2026-10-16)

The portable Node filesystem implementation snapshots the bytes present when a
run begins. Comparing two snapshots reports added, removed and updated JSON
fixtures while excluding edits already present at the first snapshot. Traversal
ignores symlink entries and rejects aliased roots. Capture input reads check a
stable regular file, reject leaf/ancestor symlinks, and can require a single
hardlink before publication. These checks detect ordinary concurrent replacement;
they are not a transaction against hostile concurrent host filesystem changes.

Run the migrated validator with
`bun scripts/check-recache-rate-limits.ts LOG [CHANGED_FIXTURE ...]`.
It returns 0 for accepted inputs/help, 2 for invalid arguments, and 1 for unsafe
inputs, rate limits or transient responses. It detects 429 even when no fixture
was written, and rejects 408, 5xx, HTML/consent interstitials, malformed JSON text,
and rate-limit/timeout/upstream-error payloads in immediate API error envelopes.
Stable 404 responses and legitimate data fields such as `Timeout Holdings` are
not treated as transient errors. Diagnostics use fixed reasons and omit input
paths, cookies, crumbs and payload contents. Acceptance does not replace the
required human review of captures and interfaces.

The five existing version test leaves now use controlled registry fetches with
their original version/cache assertions. Fetch and version cache state are
restored after each leaf. They no longer depend on a skipped suite or its two
reported skipped hooks. The recache subprocess leaf remains skipped until C06.

The strict guarded command below passed **13 tests in three files**, with no
skips or failures; the existing Node type checker also passed. All **1,201**
repository fixture contents still match the checkpoint HEAD. Independent Sol
xhigh review found a missing generic-envelope/server-error case; the repaired
validator and expanded regressions passed independent review. Exact receipts
are in [D06 evidence](results/d06-fixture-validation.json).

```sh
bun scripts/test.ts --serial scripts/recache-fixtures.test.ts \
  scripts/check-recache-rate-limits.test.ts src/lib/versions.test.ts
bun run typecheck
```

## Capture orchestration work in progress

D05/C06, D07 and D08 remain open. Draft broker, preload and child support is
not a maintained live command. The intended design keeps the existing strict
replay guard, runs a replay baseline first, and requires explicit live opt-in.
Capture children retain kernel network denial and use a parent-side Unix-socket
fetch broker with exact HTTPS host checks and manual redirects. Captures are
staged privately, validated and published by the parent only after original-byte
checks. Generic recache must protect static/fake/geographic fixtures; country
profiles must be append-only and replay after compaction. None of these draft
contracts is claimed complete by this checkpoint. No live Yahoo verification
or repository fixture capture was performed.
