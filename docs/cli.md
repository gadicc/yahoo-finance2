# CLI

The package includes a command-line interface for quick lookups and scripts:

```bash
npx yahoo-finance2 --help
npx yahoo-finance2 search AMZN
npx yahoo-finance2 quoteSummary GOOGL
npx yahoo-finance2 quoteSummary NVDA '{"modules":["assetProfile", "secFilings"]}'
```

If installed globally, use the `yahoo-finance` binary:

```bash
npm install -g yahoo-finance2
yahoo-finance search MSFT
```

Arguments that start with `{` are parsed as JSON, so module options can be
passed directly from the shell.

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
