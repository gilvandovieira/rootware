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

## Status

| Package             | Status       | Depends On                                             |
| ------------------- | ------------ | ------------------------------------------------------ |
| `@rootware/errors`  | Experimental | none                                                   |
| `@rootware/env`     | Experimental | `@rootware/errors`                                     |
| `@rootware/log`     | Experimental | `@rootware/errors`                                     |
| `@rootware/testing` | Experimental | `@rootware/errors`, `@rootware/env`, `@rootware/log`   |
| `@rootware/http`    | Experimental | `@rootware/errors`, `@rootware/log`                    |
| `@rootware/cache`   | Experimental | `@rootware/errors`, `@rootware/log`                    |
| `@rootware/storage` | Experimental | `@rootware/errors`, `@rootware/log`                    |
| `@rootware/session` | Experimental | `@rootware/errors`, `@rootware/log`, `@rootware/cache` |
| `@rootware/migrate` | Experimental | `@rootware/errors`, `@rootware/log`                    |
| `@rootware/orm`     | Experimental | `@rootware/errors`, `@rootware/log`                    |
| `@rootware/jobs`    | Experimental | `@rootware/errors`, `@rootware/log`                    |

## Descriptions

- `@rootware/errors`: shared application error primitives.
- `@rootware/env`: typed environment configuration.
- `@rootware/log`: structured JSON logging.
- `@rootware/testing`: deterministic test utilities.
- `@rootware/http`: fetch wrapper with timeouts and retries.
- `@rootware/cache`: async-first cache abstraction.
- `@rootware/storage`: object storage abstraction.
- `@rootware/session`: session and actor boundary primitives.
- `@rootware/migrate`: migration planning and execution primitives.
- `@rootware/orm`: small typed SQL and ORM primitives.
- `@rootware/jobs`: background job queue primitives.

## No Circular Dependencies

Circular dependencies make package publication and API stability harder to
reason about. If a feature would create a circular dependency, move the shared
contract to a lower-level package or pass it in as an adapter.
