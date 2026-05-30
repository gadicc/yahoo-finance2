# CLI

The package includes a command-line interface for quick lookups and scripts:

```bash
npx yahoo-finance2 --help
npx yahoo-finance2 search AMZN
npx yahoo-finance2 quoteSummary GOOGL
npx yahoo-finance2 quoteSummary NVDA '{"modules":["assetProfile", "secFilings"]}'
npx yahoo-finance2 quote '["AAPL", "MSFT"]' '{"return":"object"}'
```

If installed globally, use the `yahoo-finance` binary:

```bash
npm install -g yahoo-finance2
yahoo-finance search MSFT
```

Arguments that start with `{` or `[` are parsed as JSON, so module options and
array arguments can be passed directly from the shell.

## Stdin Input

Use `--stdin` to read a single module call as JSON from stdin. The most general
form mirrors the JavaScript method call:

```bash
npx yahoo-finance2 --stdin <<'JSON'
{
  "module": "quoteSummary",
  "args": [
    "AAPL",
    { "modules": ["assetProfile", "secFilings"] },
    { "validateResult": false, "validateOptions": true }
  ]
}
JSON
```

When the module is supplied on the command line, stdin may use the convenience
shape:

```bash
npx yahoo-finance2 quoteSummary --stdin <<'JSON'
{
  "query": "AAPL",
  "queryOptions": {
    "modules": ["assetProfile", "secFilings"]
  },
  "moduleOptions": {
    "validateResult": false
  }
}
JSON
```

`--stdin` cannot be combined with positional module arguments. Put the complete
argument list in the stdin JSON instead:

```bash
npx yahoo-finance2 quote --stdin <<'JSON'
{
  "args": [
    ["AAPL", "MSFT"],
    { "return": "map" }
  ]
}
JSON
```

## Output Streams

The CLI is intended to be safe for scripting:

- Successful module results are written to stdout.
- `--help` and `--version` are written to stdout.
- Errors, warnings, and validation diagnostics are written to stderr.

When stdout is a terminal, successful results are printed in a human-readable
form. When stdout is piped or redirected, successful results are JSON:

```bash
npx yahoo-finance2 quote AAPL | jq '.regularMarketPrice'
```

For JSON output, CLI results are normalized to JSON-safe values. For example, a
`Map` result such as `quote` with `{ "return": "map" }` is written as a plain
JSON object keyed by symbol.

## Exit Codes

The CLI uses these exit codes:

- `0` for successful module calls, `--help`, and `--version`.
- `2` for usage errors, including missing modules, unknown modules, malformed
  JSON arguments, invalid options, and wrong argument shapes.
- `1` for runtime failures, including Yahoo, network, HTTP, validation-result,
  and unexpected errors.

Example:

```bash
set +e
result=$(npx yahoo-finance2 search AAPL 2>error.log)
status=$?
set -e

case "$status" in
  0) printf '%s\n' "$result" ;;
  2) printf 'Usage error:\n%s\n' "$(cat error.log)" >&2 ;;
  *) printf 'Runtime error:\n%s\n' "$(cat error.log)" >&2 ;;
esac
```
