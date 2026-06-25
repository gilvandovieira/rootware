# Rootware

JSR-native backend DX packages for Deno.

Status: experimental / early development.

Rootware is not a framework, not a runtime, and not a build system. It is a
small set of composable packages that provide backend foundations for Deno
projects while staying native to JSR and the Web platform.

## Packages

| Package             | Purpose                         | Status       |
| ------------------- | ------------------------------- | ------------ |
| `@rootware/errors`  | Application error primitives    | Experimental |
| `@rootware/env`     | Typed environment configuration | Experimental |
| `@rootware/log`     | Structured JSON logging         | Experimental |
| `@rootware/testing` | Test utilities                  | Experimental |
| `@rootware/http`    | Production-safe fetch wrapper   | Experimental |
| `@rootware/cache`   | Async-first cache abstraction   | Experimental |

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
deno task publish:dry
```

## Philosophy

- Small packages over a large framework.
- Native Deno and JSR workflows.
- Explicit sources, adapters, and test doubles.
- No build step for packages.
- Avoid unnecessary dependencies and circular package relationships.

## License

MIT. See [LICENSE](./LICENSE).
