# Rootware

JSR-native backend DX packages for Deno.

Status: experimental / early development.

Rootware is not a framework, not a runtime, and not a build system. It is a set
of small composable JSR packages that provide backend foundations for Deno
projects while staying close to the Web platform.

## Packages

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
| `@rootware/migrate` | Database migration primitives   | Experimental |
| `@rootware/orm`     | Typed SQL and ORM primitives    | Experimental |
| `@rootware/jobs`    | Background job queue primitives | Experimental |

## Dependency Order

Packages may depend only on packages earlier in this list:

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
