# Contributing

Rootware is a Deno/JSR workspace. Use Deno 2.x.

## Setup

Install Deno from <https://deno.com/>.

```sh
deno --version
deno task ci
```

## Checks

```sh
deno task fmt:check
deno task lint
deno task check
deno task test
deno task test:coverage
deno task publish:dry
```

## Adding a Package

1. Create `packages/<name>/mod.ts`.
2. Add `packages/<name>` to the root `workspace`.
3. Add `packages/<name>/deno.json` with `name`, `version`, and `exports`.
4. Add a package README and tests.
5. Add CI and dry-run tasks if the package should be published.
6. Preserve the dependency order documented in
   [docs/packages.md](./docs/packages.md).

Avoid circular dependencies. Lower-level packages must not import higher-level
packages.

## JSDoc

Add concise JSDoc for public classes, major interfaces, public helper functions,
and exported objects. Prefer README examples for longer usage snippets.

## Versioning

Packages use independent versions. Bump only the package being released:

- Patch for bug fixes.
- Minor for compatible features.
- Major for breaking changes.

Experimental `0.x` packages may still contain breaking changes, but they must be
documented clearly.

## Pull Requests

Open PRs with focused changes. Before requesting review, run:

```sh
deno task ci
deno task publish:dry
```
