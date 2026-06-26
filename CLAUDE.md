# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

Rootware is a Deno 2.x / JSR workspace of small, independently published backend
packages (`@rootware/*`). It is deliberately **not** a framework, runtime, or
build system — there is no build step, and packages publish straight from source
`mod.ts`. Each package is narrow, depends on as little as possible, and should
be useful on its own.

## Commands

```sh
deno task ci          # fmt:check + lint + check + graph + test — run before any PR
deno task fmt         # format (fmt:check only verifies)
deno task lint
deno task check       # type-checks every grouped package entrypoint
deno task graph       # enforces the package dependency graph (see below)
deno task test
```

Run a single package's tests, a single file, or filter by test name:

```sh
deno test packages/foundation/errors/             # one package
deno test packages/foundation/errors/mod_test.ts  # one file
deno test --filter "serializeError"    # by test name across the workspace
```

Coverage and publishing dry-runs:

```sh
deno task test:coverage && deno task coverage:lcov
deno task publish:dry   # runs `deno publish --dry-run` for every package
deno task ci:full       # ci + coverage + publish:dry
```

There is no `--allow-all`. Tests must not touch the real network, filesystem,
env, or databases — use memory/noop implementations and mock fetch. Add a
specific `--allow-*` only when a test genuinely needs it.

## Package graph (the core constraint)

`scripts/check_graph.ts` is the **source of truth** for which packages may
import which, enforced by `deno task graph` in CI. Editing the
allowed-dependency map there is what makes a new cross-package import legal; the
README and `docs/packages.md` graphs are documentation that must be kept in sync
with it.

Current runtime imports:

```txt
errors  -> none          schema  -> none
env     -> errors        log     -> errors
testing -> errors, env, log
http    -> errors, log   cache   -> errors, log   storage -> errors, log
session -> errors, cache, log
migrate -> errors, log, schema
orm     -> errors, log, schema
jobs    -> errors, log
```

The graph script enforces two rules: (1) a package may only import the
`@rootware/*` packages whitelisted for it (test files may additionally import
`@rootware/testing`), and (2) relative imports may not escape a package's own
directory. Lower-level packages must never import higher-level ones; if a
feature would create a cycle, push the shared contract down to a lower package
or inject it as an adapter.

**`schema` ↔ `orm`/`migrate` decoupling:** `orm` _produces_ serializable schema
snapshots and `migrate` _consumes_ them, but neither imports the other. The
shared contract lives in the dependency-free `@rootware/schema` leaf, and
applications wire the two together by passing plain snapshot data. Preserve this
— do not add an `orm`→`migrate` or `migrate`→`orm` import.

The "build order" ladder in the docs
(`errors/schema -> env -> log -> testing -> ... -> jobs -> adapters`) is
**product sequencing, not an import chain** — it expresses that each package
should make the next easier to build, not that imports flow along it.

## Conventions

- **Package layout:** each `packages/<group>/<name>/` has `mod.ts` (sole public
  entrypoint / JSR `exports`), `mod_test.ts` (tests live beside code),
  `deno.json` (flat JSR package name + independent `version`), `README.md`, and
  `ROADMAP.md`. Filesystem groups are `foundation`, `data`, `web`, `state`, and
  `async`; public package names remain flat `@rootware/<name>`.
- **Errors:** throw `RootwareError` (from `@rootware/errors`) with a `code`,
  `status`, `severity`, and `expose` flag. `toJSON()`/`serializeError()` only
  reveal message/details/cause when `expose` is true — keep internal errors
  un-exposed. Define new codes via `defineErrorCode` and specialized
  constructors via `createErrorFactory`.
- **`@rootware/testing`** is a test-utility package, not production code: never
  import it from a package's `mod.ts`. Higher-level fakes belong in their owning
  package's future `/testing` subpath, not in the testing core.
- **JSDoc** the public surface (classes, exported interfaces, helper functions);
  keep longer usage examples in the package README instead.
- **Versioning** is per-package and independent. Bump only the package you are
  releasing (patch/minor/major; `0.x` breaking changes are allowed but must be
  documented in the package and `CHANGELOG.md`).

## Adding a package

Follow the checklist in `CONTRIBUTING.md`: create
`packages/<group>/<name>/{mod.ts,mod_test.ts,deno.json,README.md,ROADMAP.md}`,
then register the package in **all** of: root `deno.json` `workspace` +
`imports`, `scripts/check_graph.ts` (`ALLOWED_RUNTIME_DEPS`), the README and
`docs/packages.md` graphs, the `publish:dry:<name>` task, and the publish
workflow. Skipping `check_graph.ts` will fail `deno task graph` because every
public `@rootware/*` package must appear in the policy map.

## Publishing

Manual, via the GitHub `Publish` workflow only — never publish locally. The
package must first exist on JSR and be linked to `gilvandovieira/rootware`. Run
the workflow with `dry_run: true`, then `dry_run: false` only after
`deno task ci` and `deno task publish:dry` pass. Publishing uses OIDC; do not
add a `JSR_TOKEN`.
