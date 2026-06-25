# Packages

Rootware is a workspace of independently published JSR packages.

## Dependency Order

Packages may depend on packages earlier in this list, but must not depend on
packages later in the list.

1. `@rootware/errors`
2. `@rootware/env`
3. `@rootware/log`
4. `@rootware/testing`
5. `@rootware/http`
6. `@rootware/cache`
7. `@rootware/storage`
8. `@rootware/session`
9. `@rootware/migrate`
10. `@rootware/orm`
11. `@rootware/jobs`

## Package Matrix

| Package             | Folder             | Description                        | Allowed Dependencies                                   | Status       |
| ------------------- | ------------------ | ---------------------------------- | ------------------------------------------------------ | ------------ |
| `@rootware/errors`  | `packages/errors`  | Application error primitives       | none                                                   | Experimental |
| `@rootware/env`     | `packages/env`     | Typed environment configuration    | `@rootware/errors`                                     | Experimental |
| `@rootware/log`     | `packages/log`     | Structured JSON logging            | `@rootware/errors`                                     | Experimental |
| `@rootware/testing` | `packages/testing` | Deterministic test utilities       | `@rootware/errors`, `@rootware/env`, `@rootware/log`   | Experimental |
| `@rootware/http`    | `packages/http`    | Fetch wrapper with timeout/retry   | `@rootware/errors`, `@rootware/log`                    | Experimental |
| `@rootware/cache`   | `packages/cache`   | Async-first cache abstraction      | `@rootware/errors`, `@rootware/log`                    | Experimental |
| `@rootware/storage` | `packages/storage` | Object storage abstraction         | `@rootware/errors`, `@rootware/log`                    | Experimental |
| `@rootware/session` | `packages/session` | Session and actor boundary helpers | `@rootware/errors`, `@rootware/log`, `@rootware/cache` | Experimental |
| `@rootware/migrate` | `packages/migrate` | Migration planning and execution   | `@rootware/errors`, `@rootware/log`                    | Experimental |
| `@rootware/orm`     | `packages/orm`     | Small typed SQL and ORM primitives | `@rootware/errors`, `@rootware/log`                    | Experimental |
| `@rootware/jobs`    | `packages/jobs`    | Background job queue primitives    | `@rootware/errors`, `@rootware/log`                    | Experimental |

## No Circular Dependencies

Circular dependencies make package publication and API stability harder to
reason about. If a feature would create a circular dependency, move the shared
contract to a lower-level package or pass it in as an adapter.
