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
deno task graph
deno task test
```

Run coverage:

```sh
deno task test:coverage
deno task coverage:lcov
```

Run publication dry-runs:

```sh
deno task publish:dry
```

## Adding A Package

1. Choose the current package group and create `packages/<group>/<name>/mod.ts`.
2. Ensure the group is covered by the root `workspace`.
3. Add `packages/<group>/<name>/deno.json` with flat JSR metadata.
4. Add `packages/<group>/<name>/README.md`.
5. Add `packages/<group>/<name>/mod_test.ts`.
6. Add `packages/<group>/<name>/ROADMAP.md` for repository planning.
7. Add the package to `scripts/check_graph.ts`.
8. Update the root README dependency graph.
9. Update [docs/packages.md](./docs/packages.md).
10. Add package dry-run tasks.
11. Add the package to publish workflow validation.
12. Preserve the dependency graph documented in
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

## Publishing

Publishing is manual through GitHub Actions:

1. Bump the target package version.
2. Run `deno task ci`.
3. Run `deno task publish:dry`.
4. Ensure the package exists or is prepared on JSR.
5. Ensure the JSR package is linked to `gilvandovieira/rootware`.
6. Run the `Publish` workflow with `dry_run: true`.
7. Run the same workflow with `dry_run: false` only when ready.

Do not add `JSR_TOKEN` when OIDC publishing is available.

## Pull Requests

Open focused PRs. Before requesting review, run:

```sh
deno task ci
deno task publish:dry
```
