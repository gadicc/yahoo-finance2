# Plan 007: Security hardening — cookie file permissions, consent redirect depth, constant-time token compare

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- bin/yahoo-finance.ts bin/yahoo-finance-mcp.ts src/lib/getCrumb.ts src/mcp/http.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 001/004 also touch
> `getCrumb.ts`; their diffs — type alias + WeakMap state — are expected.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md; land after plans/004-per-instance-state.md to avoid `getCrumb.ts` conflicts
- **Category**: security (defensive hardening; all three items LOW severity)
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

Three small defensive gaps, none critical, all cheap:

1. **Cookie file permissions** — both CLIs persist Yahoo cookies to
   `~/.yf2-cookies.json` via `FileCookieStore`, which creates the file with
   default umask (typically world-readable 0644). The cookies are anonymous
   Yahoo session/consent cookies (no user login), so impact is limited, but on
   shared machines another local user can read and reuse them. 0600 is the
   norm for dotfile credentials.
2. **Unbounded consent recursion** — `_getCrumb` recurses into itself at the
   end of the EU-consent redirect flow with no depth limit. A misbehaving or
   MITM'd endpoint that keeps redirecting to the consent flow loops the client
   in unbounded recursion (each cycle is ~5 network requests) until stack or
   rate-limit death. A depth cap turns that into a clean error.
3. **Non-constant-time bearer comparison** — the MCP HTTP handler compares
   `authorization === \`Bearer ${bearerToken}\``. String `===` short-circuits;
   timing attacks over a network against it are largely theoretical, but a
   constant-time compare is a one-function fix and standard practice.

## Current state

- `bin/yahoo-finance.ts:17-30`:

  ```ts
  function getCookiePath() {
    const home = Deno.env.get("HOME");
    if (!home) throw new Error("HOME environment variable is not set");
    return path.join(home, ".yf2-cookies.json");
  }

  function createClient(logger: CliLogger): CliClient {
    const cookieJar = new ExtendedCookieJar(new FileCookieStore(getCookiePath()));
    ...
  ```

- `bin/yahoo-finance-mcp.ts:33-37` — identical `getCookiePath()`, and
  `createClient()` at lines 59-66 with the same `FileCookieStore` construction.

- `src/lib/getCrumb.ts` — `_getCrumb(cookieJar, fetch, fetchOptionsBase, logger, url, develOverride, noCache)`
  (signature at lines 42–56). The recursion (consent flow tail):

  ```ts
  // src/lib/getCrumb.ts:277-289
  return await _getCrumb(
    cookieJar,
    fetch,
    finalResponseFetchOptions,
    logger,
    copyConsentResponseLocation,
    {
      id: "getCrumb-quote-AAPL-consent-final-redirect.html",
      ...
    },
    noCache,
  );
  ```

  Note: after plan 004, the body threads a `state` object; the signature and
  recursion call remain — anchor on `return await _getCrumb(`.

- `src/mcp/http.ts:93-101`:

  ```ts
  function validateBearerToken(
    authorization: string | null | undefined,
    bearerToken: string | undefined,
  ) {
    if (!bearerToken) return undefined;
    if (authorization === `Bearer ${bearerToken}`) return undefined;

    return jsonRpcError(401, -32001, "Missing or invalid bearer token.");
  }
  ```

  Constraint: `src/mcp/http.ts` must run on **web-standard runtimes**
  (Cloudflare Workers via `WebStandardStreamableHTTPServerTransport`), so do
  NOT import `node:crypto`'s `timingSafeEqual`. Implement a small local
  constant-time string compare instead.

- Existing tests: `src/mcp/http.test.ts` exists — read it and follow its
  request-construction pattern when adding auth cases. `bin/` has no tests
  (CLI behavior is tested via `src/lib/cli.test.ts`, which doesn't cover
  cookie-file creation).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| MCP tests | `deno task test src/mcp/http.test.ts` | all pass |
| getCrumb tests | `deno task test src/lib/getCrumb.test.ts` | all pass |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0 |
| Lint/format | `deno lint && deno fmt --check` | exit 0 |

## Scope

**In scope**:
- `bin/yahoo-finance.ts`, `bin/yahoo-finance-mcp.ts` (chmod after jar creation)
- `src/lib/getCrumb.ts` (depth parameter)
- `src/mcp/http.ts` (constant-time compare)
- `src/mcp/http.test.ts`, `src/lib/getCrumb.test.ts` (new cases)

**Out of scope** (do NOT touch):
- `src/lib/cookieJar.ts` / the `FileCookieStore` dependency — don't fork or
  wrap the store; a post-creation chmod in the two bins is sufficient.
- Encrypting cookies / keyring integration — explicitly rejected as
  disproportionate (anonymous cookies); see plans/README.md.
- MCP auth *policy* (`allowedHosts`, `--unsafe-no-token`) — by-design, documented.

## Git workflow

- Branch from `dev`: `advisor/007-security-hardening`
- Three commits, e.g. `fix(cli): restrict cookie file permissions to 0600`,
  `fix(getCrumb): cap consent redirect recursion depth`,
  `fix(mcp): constant-time bearer token comparison`.
  Per `AGENTS.md`, end commit bodies with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Cookie file permissions (both bins)

In `bin/yahoo-finance.ts` and `bin/yahoo-finance-mcp.ts`, after constructing
the `FileCookieStore` (which creates the file lazily), tighten permissions.
Because the store may create the file on first write rather than at
construction, the robust approach is to ensure the file exists, then chmod:

```ts
function ensurePrivateFile(filePath: string) {
  try {
    Deno.writeTextFileSync(filePath, "", { createNew: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
  try {
    Deno.chmodSync(filePath, 0o600);
  } catch {
    // chmod is unsupported on Windows; best-effort only.
  }
}
```

Call `ensurePrivateFile(cookiePath)` in each bin's `createClient()` before
`new FileCookieStore(cookiePath)`. Caution: `FileCookieStore` may fail parsing
an empty file — check its behavior (it tolerates empty/missing files in v2;
if an empty file breaks it, write `"{}"` instead of `""` — decide by testing
Step 1's verify command).

**Verify**:
`HOME=$(mktemp -d) deno run -A bin/yahoo-finance.ts search AAPL >/dev/null 2>&1; stat -c '%a' "$HOME/.yf2-cookies.json"`
→ prints `600`. (Network access required; if offline, verify file mode with a
`--help` invocation that constructs the client, or note the limitation.)

### Step 2: Consent recursion depth cap

In `src/lib/getCrumb.ts`:
- Add a trailing parameter to `_getCrumb`: `depth = 0`.
- At the top of the function body, add:

  ```ts
  const MAX_CONSENT_REDIRECT_DEPTH = 5;
  if (depth > MAX_CONSENT_REDIRECT_DEPTH) {
    throw new Error(
      "Too many consent redirects while fetching Yahoo crumb (max " +
        MAX_CONSENT_REDIRECT_DEPTH + "). Please report.",
    );
  }
  ```

  (Hoist the constant to module scope near the other constants if you prefer —
  match local style.)
- In the recursion call (`return await _getCrumb(...)` around line 277–289),
  pass `depth + 1` as the new final argument.
- The public wrapper `getCrumb` does not pass `depth` — default 0 applies.

**Verify**: `deno task test src/lib/getCrumb.test.ts` → all pass (the happy
path and consent-flow fixtures never exceed depth 1). Add the test from the
Test plan section and see it pass.

### Step 3: Constant-time bearer comparison

In `src/mcp/http.ts`, add a local helper (module scope, near the other
validators):

```ts
function timingSafeStringEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i % aBytes.length || 1] ?? 0) ^ (bBytes[i % (bBytes.length || 1)] ?? 0);
  }
  return diff === 0;
}
```

(Simpler equivalent is fine — the requirements: compare over the full length of
both inputs, no early return on first mismatch, length difference still yields
false. If the modulo indexing above reads awkwardly, iterate `i < len` with
`(aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)` — that is sufficient and clearer.)

Change `validateBearerToken`'s success check to:

```ts
if (
  typeof authorization === "string" &&
  timingSafeStringEqual(authorization, `Bearer ${bearerToken}`)
) return undefined;
```

**Verify**: `deno task test src/mcp/http.test.ts` → all pass, including new
cases below.

### Step 4: Full verification

Run `deno fmt` on all edited files, then
`deno task test && deno task check && deno lint && deno fmt --check`.

**Verify**: all exit 0.

## Test plan

- `src/lib/getCrumb.test.ts`: one new case — call `_getCrumb` with the new
  `depth` argument above the cap (e.g. `6`) using a fresh jar and any devel id,
  assert it rejects with `/Too many consent redirects/` **before** any fetch
  occurs (no fixture needed since the throw precedes network use).
- `src/mcp/http.test.ts`: following the file's existing handler-invocation
  pattern, with a `bearerToken`-configured handler assert:
  1. correct `Authorization: Bearer <token>` → not a 401;
  2. wrong token → 401;
  3. missing header → 401;
  4. token of different length → 401 (exercises the length branch).
- Verification: `deno task test src/lib/getCrumb.test.ts src/mcp/http.test.ts`
  → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "chmodSync" bin/yahoo-finance.ts bin/yahoo-finance-mcp.ts` → one match each (inside the shared helper per bin)
- [ ] `grep -n "depth" src/lib/getCrumb.ts` shows the parameter, the cap check, and `depth + 1` at the recursion site
- [ ] `grep -n 'authorization === `Bearer' src/mcp/http.ts` → no matches
- [ ] New tests exist and pass; `deno task test` exits 0
- [ ] `deno task check`, `deno lint`, `deno fmt --check` exit 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `FileCookieStore` errors on a pre-created empty (or `{}`) file and no trivial
  content variant satisfies it — don't start patching the store.
- The `_getCrumb` signature at HEAD differs from both this plan's excerpt and
  plan 004's post-state (unexpected drift).
- `src/mcp/http.test.ts`'s structure doesn't accommodate auth-header cases
  without new test infrastructure.

## Maintenance notes

- The depth cap (5) is generous — the real consent flow uses 1 recursion. If
  Yahoo's flow ever legitimately needs more, the error message says exactly
  what to raise.
- `ensurePrivateFile` is duplicated across the two bins (they already duplicate
  `getCookiePath`); consolidating bin-shared helpers is a maintainer style call,
  not attempted here.
- Windows: chmod is a no-op (caught). If Windows cookie privacy matters later,
  it needs ACL work — deferred.
