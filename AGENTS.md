# Agent Instructions

## Project Shape

Rootware is a Deno 2.x workspace of independently published JSR packages.

It is not a framework, runtime, or build system. Keep packages small, explicit,
and useful on their own.

Package source lives under `packages/<group>/<name>/`, grouped by current
ecosystem area while keeping public JSR names flat:

```txt
packages/foundation/errors -> @rootware/errors
packages/foundation/env    -> @rootware/env
packages/foundation/log    -> @rootware/log
packages/foundation/testing -> @rootware/testing
packages/data/schema       -> @rootware/schema
packages/data/migrate      -> @rootware/migrate
packages/data/orm          -> @rootware/orm
packages/web/http          -> @rootware/http
packages/state/cache       -> @rootware/cache
packages/state/storage     -> @rootware/storage
packages/state/session     -> @rootware/session
packages/async/jobs        -> @rootware/jobs
```

Each package directory contains:

- `mod.ts` as the public entrypoint.
- `mod_test.ts` for package tests.
- `deno.json` for JSR package metadata.
- `README.md` as published package documentation.
- `ROADMAP.md` as repository-only planning documentation.

## Dependency Graph

Runtime package imports are enforced by `deno task graph`. The implementation
source of truth is `scripts/check_graph.ts`.

Current runtime graph:

```txt
@rootware/errors  -> none
@rootware/schema  -> none
@rootware/env     -> @rootware/errors
@rootware/log     -> @rootware/errors
@rootware/testing -> @rootware/errors, @rootware/env, @rootware/log
@rootware/http    -> @rootware/errors, @rootware/log
@rootware/cache   -> @rootware/errors, @rootware/log
@rootware/storage -> @rootware/errors, @rootware/log
@rootware/session -> @rootware/errors, @rootware/cache, @rootware/log
@rootware/migrate -> @rootware/errors, @rootware/log, @rootware/schema
@rootware/orm     -> @rootware/errors, @rootware/log, @rootware/schema
@rootware/jobs    -> @rootware/errors, @rootware/log
```

`@rootware/schema` is a dependency-free leaf. `@rootware/orm` produces
serializable schema snapshots; `@rootware/migrate` consumes those snapshots.
Neither package may import the other.

Product build order:

```txt
errors/schema -> env -> log -> testing -> http/cache/storage -> session -> migrate/orm -> jobs -> adapters
```

The build order is sequencing, not an import chain.

## Development Commands

Run focused checks while working:

```sh
deno task fmt:check
deno task lint
deno task check
deno task graph
deno task test
```

Run local CI:

```sh
deno task ci
```

Run package publish dry-runs:

```sh
deno task publish:dry
```

Run coverage only when needed:

```sh
deno task test:coverage
deno task coverage:lcov
```

## Editing Rules

- Use Web APIs and Deno-native behavior.
- Avoid unnecessary dependencies.
- Do not add a build step for package publication.
- Do not add subpath exports until the target files and tests exist.
- Keep planned subpaths as roadmap-only until implemented.
- Do not import `@rootware/testing` from production package code.
- Put higher-package test fakes in the owning package's future `/testing`
  subpath, not in `@rootware/testing` core.
- Preserve user changes in the working tree. Do not revert unrelated edits.

## Documentation Rules

- Root `README.md` owns the public package table, runtime graph, and build-order
  summary.
- `docs/packages.md` owns detailed package graph and package matrix policy.
- `packages/<group>/<name>/README.md` is published package documentation.
- `packages/<group>/<name>/ROADMAP.md` is repository-only planning documentation
  unless a package manifest explicitly includes it.
- Keep package READMEs free of `ROADMAP.md` links while roadmaps are excluded
  from JSR package contents.

## Publishing Rules

Publishing is manual through the GitHub `Publish` workflow.

Before publishing a package:

- Bump only that package's version.
- Update the package README and public JSDoc.
- Run `deno task ci`.
- Run `deno task publish:dry`.
- Ensure the JSR package exists or is prepared and linked to
  `gilvandovieira/rootware`.
- Use GitHub OIDC. Do not add `JSR_TOKEN` when OIDC publishing is available.

## Adding A Package

When adding a package:

1. Choose the current package group and create `packages/<group>/<name>/mod.ts`.
2. Ensure the package group is covered by the root `workspace`.
3. Add `packages/<group>/<name>/deno.json` with flat JSR metadata.
4. Add `packages/<group>/<name>/README.md`.
5. Add `packages/<group>/<name>/mod_test.ts`.
6. Add `packages/<group>/<name>/ROADMAP.md`.
7. Add the package to `scripts/check_graph.ts`.
8. Update the root README dependency graph.
9. Update `docs/packages.md`.
10. Add package dry-run tasks.
11. Add the package to publish workflow validation.
