# Packages

Rootware is a workspace of independently published JSR packages.

## Dependency Order

1. `@rootware/errors`
2. `@rootware/env`
3. `@rootware/log`
4. `@rootware/testing`
5. `@rootware/http`
6. `@rootware/cache`

Packages may depend on packages earlier in this list, but must not depend on
packages later in the list.

## Status

| Package             | Status       | Depends On                                           |
| ------------------- | ------------ | ---------------------------------------------------- |
| `@rootware/errors`  | Experimental | none                                                 |
| `@rootware/env`     | Experimental | `@rootware/errors`                                   |
| `@rootware/log`     | Experimental | `@rootware/errors`                                   |
| `@rootware/testing` | Experimental | `@rootware/errors`, `@rootware/env`, `@rootware/log` |
| `@rootware/http`    | Experimental | `@rootware/errors`, `@rootware/log`                  |
| `@rootware/cache`   | Experimental | `@rootware/errors`, `@rootware/log`                  |

## No Circular Dependencies

Circular dependencies make package publication and API stability harder to
reason about. If a feature would create a circular dependency, move the shared
contract to a lower-level package or pass it in as an adapter.
