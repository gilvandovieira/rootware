# Release Process

Rootware uses independent package versions.

Examples:

- `@rootware/errors@0.1.0`
- `@rootware/env@0.1.0`
- `@rootware/log@0.2.0`

Do not synchronize versions automatically across all packages.

## Versioning

- Patch: bug fix with no intended API change.
- Minor: compatible feature or additive API.
- Major: breaking change.

Packages are experimental while in `0.x`. Breaking changes in `0.x` still need
clear release notes and migration guidance.

## Release Checklist

1. Update the target package version.
2. Update README and docs where needed.
3. Run `deno task ci`.
4. Run `deno task publish:dry`.
5. Confirm the package is linked to the GitHub repo in JSR.
6. Run the manual publish workflow with `dry_run: true`.
7. Run the manual publish workflow with `dry_run: false`.
8. Create GitHub release notes or a tag if the release needs public tracking.
