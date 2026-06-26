# Rootware

JSR-native backend DX packages for Deno.

Status: experimental / early development.

Rootware is not a framework, not a runtime, and not a build system. It is a set
of small composable JSR packages that provide backend foundations for Deno
projects while staying close to the Web platform.

## Packages

Package source is grouped by current area under `packages/foundation`,
`packages/data`, `packages/web`, `packages/state`, and `packages/async`. Public
JSR package names stay flat as `@rootware/<name>`.

| Package             | Purpose                         | Status       |
| ------------------- | ------------------------------- | ------------ |
| `@rootware/errors`  | Application error primitives    | Experimental |
| `@rootware/env`     | Typed environment configuration | Experimental |
| `@rootware/log`     | Structured JSON logging         | Experimental |
| `@rootware/testing` | Test utilities                  | Experimental |
| `@rootware/http`    | Production-safe fetch wrapper   | Experimental |
| `@rootware/cache`   | Async-first cache abstraction   | Experimental |
| `@rootware/storage` | Object storage abstraction      | Experimental |
| `@rootware/session` | Sessions and actor boundaries   | Experimental |
| `@rootware/schema`  | Serializable schema snapshots   | Experimental |
| `@rootware/migrate` | Database migration primitives   | Experimental |
| `@rootware/orm`     | Typed SQL and ORM primitives    | Experimental |
| `@rootware/jobs`    | Background job queue primitives | Experimental |

## Dependency Graph

Runtime imports are enforced by `deno task graph`, using
`scripts/check_graph.ts` as the source of truth.

### Runtime Imports

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

### Build Order

```txt
errors/schema -> env -> log -> testing -> http/cache/storage -> session -> migrate/orm -> jobs -> adapters
```

The build order is product sequencing, not an import chain.

## Quick Example

```ts
import { RootwareError } from "jsr:@rootware/errors";
import { defineEnv, env } from "jsr:@rootware/env";
import { createLogger } from "jsr:@rootware/log";

const config = defineEnv({
  PORT: env.integer().default(8000),
  LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
}, {
  source: {
    PORT: "8000",
  },
});

const logger = createLogger({ level: config.LOG_LEVEL });

logger.info({ port: config.PORT }, "server configured");

throw new RootwareError("Example error", {
  code: "ROOTWARE_INTERNAL_ERROR",
});
```

## Development

```sh
deno task fmt:check
deno task lint
deno task check
deno task graph
deno task test
```

Run the local CI task:

```sh
deno task ci
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

## Publishing

Real publishing is manual through GitHub Actions. Use the `Publish` workflow,
choose a package, run with `dry_run: true`, and publish with `dry_run: false`
only after CI and the dry-run pass.

Before publishing through GitHub Actions, the package must be created or
prepared on JSR and linked to `gilvandovieira/rootware` in the JSR package
settings.

## Philosophy

- Not a framework.
- Not a runtime.
- Not a build system.
- Small composable JSR packages.
- Explicit adapters and test doubles.
- No unnecessary dependencies.
- No circular package relationships.

## License

MIT. See [LICENSE](./LICENSE).
