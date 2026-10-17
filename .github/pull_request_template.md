<!--
Thanks for contributing. Target the `dev` branch and review CONTRIBUTING.md
before submitting your pull request.
-->

## Summary

<!-- Explain the problem and why this change is needed. -->

<!-- Link an issue when applicable, for example: Closes #123 -->

## Changes

<!-- List the important implementation or documentation changes. -->

## Verification

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun run typecheck` and `bun run typecheck:negative`
- [ ] Relevant strict replay tests pass with `bun run test:serial -- path/to/file.test.ts`
      (or the explicitly disclosed trusted native scope)
- [ ] Schemas were regenerated with `bun run schema` and checked with `bun run schema:check`, or exported interfaces
      are unchanged
- [ ] HTTP fixtures were inspected, or fixtures are unchanged
- [ ] Documentation/JSDoc were updated and `bun run docs:lint` passes, or unchanged
- [ ] Cloudflare tests pass with the maintained [Workers procedure](../docs/platforms.md#cloudflare-workers), or npm output and
      runtime behavior are unchanged

## Additional notes

<!-- Note follow-up work, compatibility concerns, or reviewer context. -->
