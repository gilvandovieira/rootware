# @rootware/env

Typed environment configuration for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { defineEnv, env } from "jsr:@rootware/env";
```

## Example

```ts
const config = defineEnv({
  DATABASE_URL: env.url(),
  PORT: env.integer().default(8000),
  SESSION_SECRET: env.secret(),
}, {
  source: {
    DATABASE_URL: "postgres://localhost/app",
    SESSION_SECRET: "dev-secret",
  },
});
```

## API

- `defineEnv`
- `validateEnv`
- `env`
- `redactEnv`
- `generateEnvExample`
- `readDenoEnv`

## Example app configuration

Validate once at startup and export the typed, frozen result; import it
everywhere else:

```ts
// config.ts
import { defineEnv, env } from "jsr:@rootware/env";

export const schema = {
  DATABASE_URL: env.url().describe("Primary database connection"),
  LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: env.integer().default(8000),
  SESSION_SECRET: env.secret(),
};

export const config = defineEnv(schema, {
  // "production" / "test" stop a development default secret from slipping
  // through; "test" additionally requires an explicit `source`.
  mode: Deno.env.get("DENO_ENV") === "production"
    ? "production"
    : "development",
});
```

## Modes

`mode` tightens validation per environment:

| Mode          | `Deno.env` fallback | Secret defaults               |
| ------------- | ------------------- | ----------------------------- |
| `development` | allowed             | applied (ergonomic local dev) |
| `test`        | **refused**         | ignored (must be explicit)    |
| `production`  | allowed             | ignored (must be explicit)    |

In `test` and `production`, a `secret()` (or a key matched by `isSecretKey`,
e.g. `*_TOKEN`) with a `.default(...)` is treated as required: a missing value
throws `ENV_MISSING_VARIABLE` rather than silently using the development
default. Non-secret defaults (like `PORT`) still apply in every mode.

## Logging redacted values

`@rootware/env` never imports `@rootware/log` (config must work before logging
exists), but the two compose well — log the **redacted** snapshot:

```ts
import { redactEnv } from "jsr:@rootware/env";
import { createLogger } from "jsr:@rootware/log";

const logger = createLogger();
logger.info("configuration loaded", { env: redactEnv(config, schema) });
// SESSION_SECRET and DATABASE_URL are replaced with "[REDACTED]".
```

## Loading `.env` files (`0.4`)

`loadEnvFiles` merges conventional `.env` files into a source you pass to
`defineEnv` — config still validates once at startup. Files are merged
last-wins: `.env` → `.env.<mode>` → `.env.local` → `.env.<mode>.local`, and
`*.local` files are skipped in `test` mode so tests stay deterministic.

```ts
import { defineEnv, env, loadEnvFiles } from "jsr:@rootware/env";

// Needs --allow-read for the .env files (default reader uses Deno).
export const config = defineEnv(schema, {
  source: loadEnvFiles({ mode: "development" }),
  mode: "development",
});
```

`loadEnvFiles` takes an injectable `reader` (default `denoEnvFileReader`), so
loaders are testable without touching disk; `parseEnvFile` is the pure parser
(comments, `export` prefix, single/double quotes, no new dependency on
`@std/dotenv`).

**Do not load `.env` files in production** — production should inject real
environment variables; reserve file loading for local development and tests.

## Security

Secrets are redacted by definition type and by common key names such as
`SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`, and `DATABASE_URL`.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not read `.env` files or merge environment-specific files yet.
Use explicit sources in tests and application bootstrap code.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
