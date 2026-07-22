# Security policy

This policy explains which versions receive security fixes, how to report a
vulnerability, and what happens after you submit a report.

## Supported versions

Maintainers provide security fixes for the current major version. Run the latest
available release within that major version.

| Version         | Supported |
| --------------- | --------- |
| 4.x             | Yes       |
| 3.x and earlier | No        |

Maintainers do not normally backport fixes to unsupported versions. If a
vulnerability also affects the current version, please report it even if you
found it in an older release.

## Report a vulnerability

Please do not disclose suspected vulnerabilities in a public issue, discussion,
pull request, or social media post.

Submit your report through
[GitHub private vulnerability reporting](https://github.com/gadicc/yahoo-finance2/security/advisories/new).

If private reporting is unavailable, open a
[minimal public issue](https://github.com/gadicc/yahoo-finance2/issues/new) with
the title `Security contact request`. Include only your preferred contact method
and the affected project area. Do not include vulnerability details,
proof-of-concept code, secrets, or other sensitive information. A maintainer
will arrange a private channel.

Include as much of the following as you can in the private report:

- The affected package version, runtime, and entry point (library, CLI, or MCP).
- A description of the issue, its impact, and the conditions needed to exploit
  it.
- Minimal reproduction steps or a proof of concept.
- Any known mitigations or suggested fixes.
- Your disclosure plans and whether you would like public credit.

Do not include real credentials, personal information, or production data. Use
synthetic data and the smallest safe reproduction possible.

## What to expect after reporting

This is a community-maintained project, so it cannot guarantee response or
remediation times. A maintainer will acknowledge and triage your report, may ask
for more information, and will share material progress. If you receive no
response after seven calendar days, use the fallback above to request contact
without publishing details.

When maintainers accept a report, they will work with the reporter on a fix and
coordinated disclosure. Depending on the severity, disclosure may include a
GitHub Security Advisory, a CVE, release notes, and patched npm and JSR
releases.

## Check whether a report is in scope

A report is in scope when it affects a supported release of:

- The `yahoo-finance2` npm package or the `@gadicc/yahoo-finance2` JSR package.
- The CLI or MCP server shipped by this repository.
- This repository's source code, build process, or release process.
- A dependency vulnerability that is exploitable through the supported package.

Do not report the following as project security vulnerabilities unless they have
a direct security impact on a supported release:

- Vulnerabilities in Yahoo services, websites, or infrastructure.
- Yahoo API availability, rate limiting, response-shape changes, or financial
  data accuracy.
- Issues limited to unsupported versions and not reproducible in a supported
  version.
- Vulnerabilities in third-party applications that use this package but do not
  originate in this project's code.
- General bugs, feature requests, or validation errors without a security
  impact. Report these through the public issue tracker.

If you are unsure whether an issue is in scope, report it privately and explain
the potential security impact.

## Follow the research and disclosure guidelines

When investigating this project:

- Prefer local tests, cached fixtures, mocks, and systems you control.
- Do not access, modify, or retain data that belongs to someone else.
- Do not disrupt Yahoo or any other third-party service, perform denial-of-
  service testing, or generate excessive traffic.
- Stop testing and report the issue if you encounter sensitive data or gain
  unintended access.
- Allow a reasonable opportunity to investigate and release a fix before public
  disclosure.

The project will not pursue action against good-faith research that follows this
policy and applicable law. This assurance applies only to systems and code that
this project controls; it does not authorize testing against Yahoo, GitHub, npm,
JSR, or any other third party.
