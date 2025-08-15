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
1. **ALWAYS** set `DENO_TLS_CA_STORE=system` environment variable
2. **ALWAYS** run schema generation after changing TypeScript interfaces: `deno task schema`
3. **ALWAYS** run `deno fmt` and `deno lint` before committing
4. Use `--no-lock` flag if encountering lockfile issues
5. HTTP requests are cached in `tests/fixtures/http` - delete relevant files to refresh test data

## Validation

### Manual Testing Scenarios
- **CLI Testing**: Test the CLI by running quote lookups: `deno task cli quote AAPL`
- **Module Testing**: Test individual modules via CLI: `deno task cli quoteSummary AAPL '{"modules":["price", "summaryDetail"]}'`
- **Schema Validation**: Run `deno task schema` after any interface changes to regenerate JSON schemas
- **Build Validation**: Run full build process to ensure NPM package generation works

### Network and Certificate Issues
- If encountering SSL certificate errors with npm registries, use `DENO_TLS_CA_STORE=system`
- Network access required for:
  - Dependency downloads (JSR and NPM registries)
  - Yahoo Finance API calls during testing
  - Schema generation (may require network access)

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
2. Create test file: `src/modules/myModule.test.ts`
3. Add TypeScript interfaces with `@yf-schema` comments
4. Run `deno task schema` to generate JSON schemas
5. Add module to `src/index-common.ts`
6. Create documentation in `docs/modules/myModule.md`
7. Update README.md to link new module documentation

### Schema Generation
- **CRITICAL**: Schemas must be regenerated after interface changes
- Only files with `@yf-schema` keyword are processed
- Command: `deno task schema`
- Automatic in VSCode with Deno extension

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

### Performance Notes
- First-time setup requires significant network downloading
- Subsequent runs are much faster due to caching
- Use `--parallel` flag for tests to maximize performance
- Build artifacts are generated in `/npm` directory for NPM distribution

## Legacy Documentation
The project includes legacy documentation for Version 2 which used Node.js/yarn. Current development uses Deno exclusively. Ignore references to:
- `yarn` commands (use `deno task` instead)
- `npm` commands for development (use `deno` commands)
- TypeScript compilation with `tsc` (handled by Deno)