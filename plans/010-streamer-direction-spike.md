# Plan 010: Decide the fate of the unexported streamer module (design spike)

> **Executor instructions**: This is a **design/spike plan** — the deliverable
> is a written report, not code. Do not modify any source file. Follow the
> steps, run the investigation commands, and write your findings to
> `plans/010-streamer-report.md`. If anything in the "STOP conditions" section
> occurs, stop and report. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/modules/streamer.ts src/modules/streamer.test.ts src/modules/index.ts deno.json`
> If `streamer.ts` changed materially since this plan was written, note it in
> the report rather than stopping — drift here is *signal* (active work).

## Status

- **Priority**: P3
- **Effort**: M (investigation + writing; no code)
- **Risk**: LOW (read-only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

`src/modules/streamer.ts` is 887 lines of working, tested code that decodes
Yahoo's live market-streaming protobuf messages — and it is surfaced nowhere:
not exported from `src/modules/index.ts`, no `deno.json` `exports` entry, not
in the README module list, no docs. Meanwhile the README's "Related Projects"
links an external live-quotes demo on Cloudflare Workers, showing real demand
for exactly this capability. Shipped-but-hidden functionality is the strongest
direction signal in this repo: either it should be exposed (a headline v3.x
feature), explicitly documented as in-progress, or removed. That's a
maintainer decision; this spike assembles everything needed to make it.

## Current state

- `src/modules/streamer.ts` — decodes typed market messages
  (`EncodedMarketMessage` with base64 protobuf payloads, e.g. type `"pricing"`),
  with `DecodeMarketMessageOptions.includeRawFields` for reverse-engineering
  support. Has a colocated `src/modules/streamer.test.ts`.
- Verified absences: `grep -n "streamer" src/modules/index.ts src/index.ts deno.json`
  → no matches. Not in README.md's module list. `docs/mcp.md` does not expose it.
- Notably, streamer.ts appears to cover **decoding** of messages; whether it
  also implements the **connection** side (websocket subscribe/unsubscribe to
  Yahoo's streamer endpoint) is a key question for Step 2.
- README.md:154-155 links `live-quotes` ("Demo to showcase running
  yahoo-finance2 in cloudflare workers with live quotes"), added in commit
  `1a9163c` (2026-06).
- Context on API-stability conventions in this repo: modules are validated
  against generated schemas (`@yf-schema`), documented via JSDoc on JSR, and
  wired in three places (`src/modules/index.ts`, `src/index.ts`, `deno.json`
  exports). An "experimental" surface has precedent in spirit —
  `bin/yahoo-finance.ts:15` has a commented `// moduleNames.push("_chart"); // modules in development`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| History | `git log --follow --oneline -- src/modules/streamer.ts` | when added, by whom, how active |
| Coverage | `deno task test src/modules/streamer.test.ts` | passes; read what it asserts |
| Issue/PR demand (optional; requires `gh` + network) | `gh search issues --repo gadicc/yahoo-finance2 "stream OR websocket OR live" --limit 20` | demand evidence |
| Upstream prior art | `gh search issues --repo gadicc/node-yahoo-finance2 "streamer" --limit 10` (if distinct) | context |

All commands are read-only. Do not run anything that writes outside `plans/`.

## Scope

**In scope** (writes):
- `plans/010-streamer-report.md` (create — the deliverable)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- ALL source, docs, and config files. No exports added, no README edits, no
  code changes of any kind. If the recommendation is "expose it", the report
  *specifies* the follow-up plan; it does not implement it.

## Steps

### Step 1: Reconstruct intent from history

`git log --follow --patch --oneline -- src/modules/streamer.ts | head -200`
plus the matching test file. Note: when it was added, whether commits reference
issues/PRs, whether the work tapered off mid-feature or reached a natural
decode-library completeness.

### Step 2: Map what exists vs. what a usable feature needs

Read `src/modules/streamer.ts` and `streamer.test.ts` fully. Answer precisely:

1. Does it only **decode** messages, or also **connect** (websocket handling,
   subscribe/unsubscribe, reconnect)?
2. What message types are supported (`pricing`, others?) and how complete are
   the field mappings?
3. What would a minimal public API look like given what's there — e.g.
   `decodeMarketMessage(msg, opts)` as a pure utility vs. a full
   `yahooFinance.streamer()` subscription API? Note that a pure decoder is
   runtime-agnostic (works in Workers), while a connection API drags in
   websocket lifecycle and doesn't fit the request/response `moduleExec`
   pattern used by every other module.
4. Does it depend on anything outside `src/modules/streamer.ts`?
   (`grep -n "^import" src/modules/streamer.ts`)

### Step 3: Gather demand evidence (best effort)

The `gh` searches above, plus: how does the linked `live-quotes` demo get its
streaming data — does it vendor/duplicate this decoding logic? (Fetch its repo
page with `gh repo view mnsrulz/live-quotes` if available; otherwise note as
unchecked.)

### Step 4: Write the report

Create `plans/010-streamer-report.md` with:

1. **History summary** (Step 1 findings).
2. **Capability inventory** (Step 2 answers, with line references).
3. **Demand evidence** (Step 3, honest about gaps).
4. **Options with trade-offs** — at minimum:
   - **A. Expose as experimental decoder utility** (export the decode API under
     `./modules/streamer` or `./other/streamer`, JSDoc-tagged `@experimental`,
     README section with a "no stability guarantee" note). Cheapest; matches
     what exists if it's decode-only.
   - **B. Build the full subscription API first** (websocket lifecycle, then
     expose). Scope it honestly based on Step 2.1.
   - **C. Keep private** (add a file-top comment stating why and what would
     trigger exposure).
   - **D. Remove** (if history shows it's abandoned and the demo doesn't need it).
5. **A recommendation** with reasoning — pick one; the maintainer can overrule.
6. **If A or B: a draft follow-up plan outline** (wiring points, schema/docs
   steps, test additions) ready to be turned into `plans/011-*.md`.

**Verify**: the report file exists, covers all six sections, and every claim
about the code carries a `file:line` reference.

## Test plan

Not applicable (no code). The report's quality bar: a maintainer who has not
read `streamer.ts` can make the expose/hold/remove decision from the report
alone.

## Done criteria

- [ ] `plans/010-streamer-report.md` exists with all six sections
- [ ] Every capability claim in it has a `file:line` reference
- [ ] No source/docs/config file modified (`git status` shows only `plans/`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `src/modules/streamer.ts` no longer exists or was exported since `8d4a72f`
  (decision already made) — record what happened in the status row and stop.
- Anything in this spike seems to require running live network connections to
  Yahoo's streamer endpoint — don't; static analysis and the existing test
  fixtures are sufficient for the report.

## Maintenance notes

- Related deferred item (see plans/README.md): the "helper APIs" placeholder
  removed from UPGRADING.md by plan 008 — if the recommendation is to expose
  streaming, a server→client streaming example would double as that helper
  content.
