# Packages

Rootware is a workspace of independently published JSR packages.

Filesystem paths are lightly grouped by current package area. Public JSR names
remain flat `@rootware/<name>`.

## Runtime Dependency Graph

`scripts/check_graph.ts` is the implementation source of truth for runtime
dependency enforcement. CI runs it through `deno task graph`.

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
serializable schema snapshots, and `@rootware/migrate` consumes those snapshots
without either package importing the other.

## Build Order

Build order is product sequencing, not an import chain:

```txt
errors/schema -> env -> log -> testing -> http/cache/storage -> session -> migrate/orm -> jobs -> adapters
```

## Package Matrix

| Package             | Folder                        | Description                           | Allowed Runtime Dependencies                            | Status       |
| ------------------- | ----------------------------- | ------------------------------------- | ------------------------------------------------------- | ------------ |
| `@rootware/errors`  | `packages/foundation/errors`  | Application error primitives          | none                                                    | Experimental |
| `@rootware/schema`  | `packages/data/schema`        | Serializable schema snapshot contract | none                                                    | Experimental |
| `@rootware/env`     | `packages/foundation/env`     | Typed environment configuration       | `@rootware/errors`                                      | Experimental |
| `@rootware/log`     | `packages/foundation/log`     | Structured JSON logging               | `@rootware/errors`                                      | Experimental |
| `@rootware/testing` | `packages/foundation/testing` | Deterministic test utilities          | `@rootware/errors`, `@rootware/env`, `@rootware/log`    | Experimental |
| `@rootware/http`    | `packages/web/http`           | Fetch wrapper with timeout/retry      | `@rootware/errors`, `@rootware/log`                     | Experimental |
| `@rootware/cache`   | `packages/state/cache`        | Async-first cache abstraction         | `@rootware/errors`, `@rootware/log`                     | Experimental |
| `@rootware/storage` | `packages/state/storage`      | Object storage abstraction            | `@rootware/errors`, `@rootware/log`                     | Experimental |
| `@rootware/session` | `packages/state/session`      | Session and actor boundary helpers    | `@rootware/errors`, `@rootware/log`, `@rootware/cache`  | Experimental |
| `@rootware/migrate` | `packages/data/migrate`       | Migration planning and execution      | `@rootware/errors`, `@rootware/log`, `@rootware/schema` | Experimental |
| `@rootware/orm`     | `packages/data/orm`           | Small typed SQL and ORM primitives    | `@rootware/errors`, `@rootware/log`, `@rootware/schema` | Experimental |
| `@rootware/jobs`    | `packages/async/jobs`         | Background job queue primitives       | `@rootware/errors`, `@rootware/log`                     | Experimental |

## Implemented Subpaths

The package roots stay small and dependency-directed. Current implemented
subpath exports are:

```txt
@rootware/log/compat/pino  -> packages/foundation/log/compat/pino
@rootware/orm/postgres     -> packages/data/orm/postgres
@rootware/migrate/postgres -> packages/data/migrate/postgres
@rootware/migrate/cli      -> packages/data/migrate/cli
```

Other planned subpaths remain roadmap-only until their source files, tests, and
manifest export entries exist.

## No Circular Dependencies

Circular dependencies make package publication and API stability harder to
reason about. If a feature would create a circular dependency, move the shared
contract to a lower-level package or pass it in as an adapter.
