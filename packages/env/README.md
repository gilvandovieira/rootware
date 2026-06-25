# @rootware/env

Typed environment configuration for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

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

## API Summary

- `defineEnv`
- `validateEnv`
- `env`
- `redactEnv`
- `generateEnvExample`
- `readDenoEnv`

## Security

Secrets are redacted by definition type and by common key names such as
`SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`, and `DATABASE_URL`.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not read `.env` files or merge environment-specific files yet.
Use explicit sources in tests and application bootstrap code.

[Back to Rootware](../../README.md)
