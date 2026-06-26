# Release

Rootware uses independent versioning per package.

Examples:

- `@rootware/errors@0.1.0`
- `@rootware/env@0.1.0`
- `@rootware/log@0.2.0`
- `@rootware/schema@0.1.0`

Do not synchronize every package version automatically. Only bump and publish a
package when that package changed.

## Versioning

- Patch: bug fixes.
- Minor: compatible features.
- Major: breaking changes.

Packages are experimental while they are in `0.x`. Breaking changes in `0.x`
must still be documented clearly in release notes.

## Release Checklist

- Version bumped in the correct package.
- README updated.
- JSDoc updated.
- Tests passing.
- Package graph passing.
- `deno task ci` passing.
- `deno task publish:dry` passing.
- Package linked to `gilvandovieira/rootware` in JSR.
- Release notes prepared.

Package READMEs are published package docs. `ROADMAP.md` files are repository
planning docs unless a package manifest explicitly includes them.
