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

## Security

Secrets are redacted by definition type and by common key names such as
`SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`, and `DATABASE_URL`.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not read `.env` files or merge environment-specific files yet.
Use explicit sources in tests and application bootstrap code.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
