# Yahoo Finance 2 Development Instructions

Yahoo Finance 2 is a TypeScript/Deno library that provides programmatic access to Yahoo Finance data. It runs on Deno for development but builds to NPM packages for distribution. The library includes modules for stock quotes, historical data, financial summaries, search, and more.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Environment Setup
- **CRITICAL**: Install Deno runtime for development: 
  ```bash
  wget https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
  unzip deno-x86_64-unknown-linux-gnu.zip
  chmod +x deno
  sudo mv deno /usr/local/bin/
  ```
- **CRITICAL**: Set TLS CA store to avoid certificate issues:
  ```bash
  export DENO_TLS_CA_STORE=system
  ```

### Dependency Installation and Build Process
- **CRITICAL**: Dependencies download takes 5+ minutes. NEVER CANCEL. Set timeout to 10+ minutes:
  ```bash
  DENO_TLS_CA_STORE=system deno install
  ```
- **CRITICAL**: Build process takes 2+ minutes. NEVER CANCEL. Set timeout to 5+ minutes:
  ```bash
  DENO_TLS_CA_STORE=system deno task build:npm
  ```
- **CRITICAL**: Test suite execution time: Test runner takes 1-3 minutes. NEVER CANCEL. Set timeout to 5+ minutes:
  ```bash
  DENO_TLS_CA_STORE=system deno test -A --no-lock --parallel
  ```

### Core Development Commands
- View available tasks: `deno task`
- Run tests: `DENO_TLS_CA_STORE=system deno test -A --no-lock --parallel`
- Build NPM package: `DENO_TLS_CA_STORE=system deno task build:npm`
- Generate schemas: `DENO_TLS_CA_STORE=system deno task schema`
- Run CLI tool: `DENO_TLS_CA_STORE=system deno task cli <module> <args>`
- Lint code: `deno lint`
- Format code: `deno fmt`

### Development Workflow
1. **ALWAYS** set `DENO_TLS_CA_STORE=system` environment variable before any network operations
2. **ALWAYS** run schema generation after changing TypeScript interfaces: `deno task schema`
3. **ALWAYS** run `deno fmt` and `deno lint` before committing changes
4. Use `--no-lock` flag if encountering lockfile issues during development
5. HTTP requests are cached in `tests/fixtures/http` (~450k lines of test data) - delete relevant files to refresh test data
6. When adding new modules, follow the pattern: `.ts` file with `@yf-schema` comment + `.test.ts` + schema generation

## Validation

### Manual Testing Scenarios
After making code changes, ALWAYS test the following scenarios to validate functionality:

#### CLI Testing (requires network access)
- **Basic quote lookup**: `DENO_TLS_CA_STORE=system deno task cli quote AAPL`
- **Module with options**: `DENO_TLS_CA_STORE=system deno task cli quoteSummary AAPL '{"modules":["price", "summaryDetail"]}'`
- **Search functionality**: `DENO_TLS_CA_STORE=system deno task cli search AAPL`
- **Historical data**: `DENO_TLS_CA_STORE=system deno task cli historical AAPL`
- **Available modules**: `DENO_TLS_CA_STORE=system deno task cli --help` (shows: autoc, chart, dailyGainers, dailyLosers, fundamentalsTimeSeries, historical, insights, options, quote, quoteSummary, recommendationsBySymbol, screener, search, trendingSymbols)
- **Help command**: `DENO_TLS_CA_STORE=system deno task cli --help`

#### Schema Generation Testing  
- **Regenerate schemas**: `DENO_TLS_CA_STORE=system deno task schema` (required after TypeScript interface changes)
- **Verify schema files**: Check that `.schema.json` files are updated in `/src/modules/` 
- **Schema validation**: Look for `@yf-schema` comments in module files - only these are processed

#### Build and Code Quality Testing
- **NPM build validation**: `DENO_TLS_CA_STORE=system deno task build:npm` (builds distributable package)
- **Linting**: `deno lint` (expect some existing lint errors - focus on new code)
- **Formatting**: `deno fmt --check` or `deno fmt` to auto-format
- **Test execution**: `DENO_TLS_CA_STORE=system deno test -A --no-lock --parallel`

#### Development Workflow Testing
1. Make a small TypeScript interface change in a module file
2. Run schema generation: `deno task schema`
3. Run tests to verify nothing broke: `deno test -A --no-lock --parallel`
4. Format and lint: `deno fmt && deno lint`
5. Test CLI functionality with the changed module

### Network and Certificate Issues
- If encountering SSL certificate errors with npm registries, use `DENO_TLS_CA_STORE=system`
- Network access required for:
  - Dependency downloads (JSR and NPM registries) - ~5 minutes initial download
  - Yahoo Finance API calls during testing and CLI usage
  - Schema generation (requires npm package access)
- **Cached test data**: ~450k lines of HTTP responses cached in `tests/fixtures/http/`
- **Offline development**: Lint, format, and local file operations work without network access

## Common Issues and Solutions

### Build Failures
- **SSL Certificate Issues**: Always use `DENO_TLS_CA_STORE=system`
- **Lockfile Corruption**: Use `--no-lock` flag to bypass lockfile issues
- **Timeout Issues**: NEVER CANCEL long-running operations. Build and test processes are expected to take several minutes

### Network Dependencies
- The project requires network access to NPM registry and JSR (JavaScript Registry)
- Initial dependency download: ~5 minutes (NEVER CANCEL)
- Cached dependencies significantly reduce subsequent command execution times

### Testing
- Tests use cached HTTP responses stored in `tests/fixtures/http`
- To refresh test data, delete relevant fixture files
- Tests run in parallel by default for faster execution
- Some tests may require actual Yahoo Finance API access

## Project Structure

### Key Directories
- `/src` - Main TypeScript source code
  - `/src/modules` - Individual Yahoo Finance API modules (quote, chart, search, etc.)
  - `/src/lib` - Core library functionality
- `/tests` - Test files and HTTP fixtures
- `/bin` - CLI entry point
- `/scripts` - Build and schema generation scripts
- `/docs` - Documentation
- `deno.json` - Deno configuration with tasks and dependencies

### Important Files
- `deno.json` - Project configuration and task definitions
- `deno.lock` - Dependency lockfile (may need `--no-lock` to bypass)
- `CONTRIBUTING.md` - Additional development guidance
- `/scripts/build_npm.ts` - NPM package build script
- `/scripts/schema-gen.ts` - TypeScript to JSON schema generator

## Module Development

### Adding a New Module
1. Create module file: `src/modules/myModule.ts`
2. Add TypeScript interfaces with `@yf-schema` comment (required for schema generation)
3. Create test file: `src/modules/myModule.test.ts` 
4. Run `DENO_TLS_CA_STORE=system deno task schema` to generate `myModule.schema.json`
5. Add module to `src/index-common.ts` for export
6. Create documentation in `docs/modules/myModule.md`
7. Update README.md to link new module documentation
8. Test via CLI: `deno task cli myModule <symbol> <options>`

### Schema Generation Details
- **CRITICAL**: Only files with `@yf-schema` keyword are processed by schema generator
- **CRITICAL**: Must run `deno task schema` after any interface changes
- Schema files are automatically generated as `*.schema.json` alongside `*.ts` files
- Schemas enable runtime validation of Yahoo Finance API responses
- Pattern: `// @yf-schema: see the docs on how this file is automatically updated.`

### Testing New Code
- **Unit tests**: Use existing test patterns with cached HTTP responses
- **Integration tests**: Test CLI commands with real Yahoo Finance data
- **Schema validation**: Verify interfaces match actual API responses
- **Cache management**: Delete specific files in `tests/fixtures/http/` to refresh data for your tests

## CI/CD Pipeline

### CircleCI Build Process
1. Install Deno runtime
2. Install dependencies (`deno install`) - takes ~5 minutes
3. Run tests with coverage (`deno test -A --coverage`) - takes ~3 minutes
4. Generate coverage report (`deno coverage --lcov`)
5. Build NPM package (`deno task build:npm`) - takes ~2 minutes
6. Run semantic release for publishing

### Expected Timings
- **Dependency installation**: 5+ minutes (NEVER CANCEL)
- **Test execution**: 2-3 minutes (NEVER CANCEL)
- **NPM build**: 2+ minutes (NEVER CANCEL)
- **Schema generation**: 30 seconds
- **Linting/formatting**: 10 seconds

## Environment Variables

### Required for Network Operations
- `DENO_TLS_CA_STORE=system` - Fixes SSL certificate issues with npm registry
- `YF_QUERY_HOST` - Yahoo Finance API host (defaults to query2.yahoo.finance.com)

### Development Flags
- `FETCH_DEVEL=nocache` - Disable HTTP caching for development
- `NODE_ENV=test` - Enable strict validation mode

## Troubleshooting

### Common Error Messages
- "Failed loading https://registry.npmjs.org/" - Use `DENO_TLS_CA_STORE=system`
- "invalid peer certificate: UnknownIssuer" - SSL certificate issue, use system CA store
- "Failed upgrading lockfile" - Use `--no-lock` flag
- "JSR package manifest failed to load" - Network connectivity issue to JSR registry

## Example Development Workflow

### Complete Example: Adding a Simple Interface Change
```bash
# 1. Set up environment
export DENO_TLS_CA_STORE=system

# 2. Make a change to a TypeScript interface in src/modules/quote.ts
# (example: add a new optional field to QuoteBase interface)

# 3. Regenerate schemas (REQUIRED after interface changes)
deno task schema  # Takes ~30 seconds

# 4. Run tests to ensure nothing broke
deno test -A --no-lock --parallel  # Takes 2-3 minutes. NEVER CANCEL.

# 5. Test the specific module via CLI
deno task cli quote AAPL  # Verify real API calls work

# 6. Format and lint code
deno fmt  # Auto-formats files
deno lint  # Shows any linting issues

# 7. Build NPM package to verify distribution works
deno task build:npm  # Takes ~2 minutes. NEVER CANCEL.
```

### Example: Refreshing Test Data for a Module
```bash
# 1. Delete cached HTTP responses for specific API calls
rm tests/fixtures/http/quote-AAPL.json
rm tests/fixtures/http/quote-TSLA.json

# 2. Run tests - they will fetch fresh data and cache it
DENO_TLS_CA_STORE=system deno test -A --no-lock src/modules/quote.test.ts

# 3. Verify new cached data looks correct
cat tests/fixtures/http/quote-AAPL.json | head -20
```

### Performance Notes
- First-time setup requires significant network downloading
- Subsequent runs are much faster due to caching
- Use `--parallel` flag for tests to maximize performance
- Build artifacts are generated in `/npm` directory for NPM distribution

## Key Project Insights

### Architecture Overview
- **Runtime**: Deno for development, compiles to Node.js/NPM for distribution
- **API Coverage**: Comprehensive Yahoo Finance API access (quotes, historical data, search, financials, etc.)
- **Type Safety**: Full TypeScript with runtime validation via JSON schemas
- **Caching**: HTTP responses cached to disk for consistent/fast testing
- **CLI**: Full command-line interface for all modules and functions

### Development Philosophy  
- **Schema-driven**: TypeScript interfaces with `@yf-schema` generate runtime validation
- **Test-first**: Extensive cached test data ensures consistent behavior
- **Performance-conscious**: Parallel testing, efficient caching, minimal dependencies
- **Cross-platform**: Develop on Deno, distribute via NPM for broad compatibility

### Common Modules and Use Cases
- **quote**: Get current stock prices and basic info
- **quoteSummary**: Detailed financial data with submodules (earnings, balance sheet, etc.)
- **historical**: Historical price data with date ranges
- **search**: Find stocks/securities by symbol or name  
- **chart**: Price charts with various timeframes and indicators
- **trendingSymbols**: Currently trending stocks by region
- **options**: Options chain data for stocks
- **insights**: Market insights and analyst recommendations

## Legacy Documentation
The project includes legacy documentation for Version 2 which used Node.js/yarn. Current development uses Deno exclusively. Ignore references to:
- `yarn` commands (use `deno task` instead)
- `npm` commands for development (use `deno` commands)
- TypeScript compilation with `tsc` (handled by Deno)