# @rootware/env Product Plan

## Status

`@rootware/env` exists as part of the Rootware `v0.1` foundation.

This package should become the typed configuration layer for Rootware packages
and Deno applications.

> **Current `v0.1` surface (reconciled with source).** Most of the "v0.2 typed
> env spine" below already ships: `defineEnv`, `validateEnv`, the `env` builder,
> explicit sources (`fromRecord`), `readDenoEnv`, secret redaction (`redactEnv`,
> `isSecretKey`), `generateEnvExample`, the parser helpers, `EnvError`,
> `InferEnv`, and prefix lookup through `DefineEnvOptions.prefix`. Treat the
> v0.2 chunks as verify-and-test. The v0.3 DX work is now done: better
> validation messages, prefix edge-case docs/tests, and actual `mode` semantics.
> The remaining forward work is the optional v0.4 file-loading helpers.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/env` is a JSR-native, Deno-first environment configuration package.

It exists because Deno apps need a small, typed, testable way to validate
environment variables without immediately pulling in a general validation
library or Node-oriented config framework.

The package should provide:

- Typed env schema builder.
- Explicit env source support for tests.
- Safe `Deno.env` reading.
- Defaults.
- Required/optional fields.
- Secret handling and redaction.
- `.env.example` generation.
- Helpful configuration errors through `@rootware/errors`.

One-line strategy:

> `@rootware/env` lets Deno developers validate runtime configuration once at
> startup and consume typed values everywhere else.

## Canonical package

```ts
jsr:@rootware/env
```

Expected imports:

```ts
import { defineEnv, env } from "@rootware/env";
```

Expected usage:

```ts
export const appEnv = defineEnv({
  DATABASE_URL: env.url(),
  LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: env.integer().default(8000),
  SESSION_SECRET: env.secret(),
});
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`

Allowed dependencies:

- `@rootware/errors` — typed configuration failures.

Disallowed dependencies:

- `@rootware/log` — config must work before logging exists.
- `@rootware/testing` — production package must not depend on testing.
- `@std/dotenv` in the core v0.2 — file loading should come later or through
  optional helpers.

## Responsibilities

This package owns:

- Env schema definition.
- Env validation.
- Env parsing.
- Secret marking and redaction.
- Testable env sources.
- `.env.example` generation.

This package does not own:

- Secrets management systems.
- Runtime-specific deployment config.
- Automatic `.env` file loading before v1.
- Application config beyond environment variables.
- Validation library integration.

## Architecture

```txt
schema builder -> explicit source/Deno.env -> parser/validator -> typed frozen object
```

### 1. Schema builder

Expose `env.string()`, `env.secret()`, `env.number()`, `env.integer()`,
`env.boolean()`, `env.url()`, and `env.enum()`.

### 2. Source boundary

Support explicit `EnvSource` first. Fall back to `Deno.env` only when no source
is provided.

### 3. Parser boundary

Keep parsers small and exported for tests.

### 4. Redaction boundary

Secret values must be redacted before logs, error details, or examples can
expose them.

## Public contracts

### Define options

```ts
export interface DefineEnvOptions {
  source?: EnvSource;
  mode?: EnvMode;
  prefix?: string;
  allowEmpty?: boolean;
}
```

### Env source

```ts
export type EnvSource = Record<string, string | undefined>;
```

### Main API

```ts
const values = defineEnv({
  PORT: env.integer().default(8000),
}, {
  source: { PORT: "3000" },
});
```

## Security and safety model

Rules:

- Never include raw secret values in error details.
- Treat keys containing `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE_KEY`, `API_KEY`,
  or `DATABASE_URL` as sensitive.
- `env.secret()` always marks the variable as sensitive.
- `redactEnv()` returns a copy.
- Missing variable errors should include the variable name, not its value.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy.
- JSR consumers.

Compatible by design:

- Bun and Node ESM when using explicit sources.
- Workers when using explicit sources.

## Non-goals before v1

- Automatic `.env` loading.
- `.env.local` merge logic.
- CLI file generation.
- Zod/Valibot integration.
- Provider presets.
- Config encryption.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm exported stubs and current dependency on `@rootware/errors`.

### Chunk 2 — Define public schema types

Stabilize `EnvVarDefinition<T>`, `EnvSchema`, and `InferEnv<TSchema>`.

### Chunk 3 — Add README skeleton

Document the intended quick start.

## v0.2.0 — Typed env spine

### Chunk 4 — Implement schema builder

Implement `env.string`, `env.secret`, `env.number`, `env.integer`,
`env.boolean`, `env.url`, and `env.enum`.

### Chunk 5 — Implement validation

Implement `defineEnv` and `validateEnv`.

### Chunk 6 — Implement explicit source support

Support `fromRecord()` and avoid `Deno.env` when a source is provided.

### Chunk 7 — Implement Deno.env reader

Implement `readDenoEnv()` with permission-safe `EnvError`.

### Chunk 8 — Implement redaction

Implement `isSecretKey` and `redactEnv`.

### Chunk 9 — Implement `.env.example`

Implement `generateEnvExample`.

### Chunk 10 — Add tests

Test parsers, defaults, required variables, redaction, enum inference, and
Deno.env failure behavior.

## v0.3.0 — Developer experience — **done (`0.3.0`)**

- **Better validation messages** — invalid-variable errors now read
  `Invalid environment variable PORT: expected integer` (and spell out enum
  choices), keeping the variable name and `expected` in `details`.
- **Prefix behavior** — documented in the README plus edge-case tests (empty
  prefix no-op, optional/default under a prefix, unprefixed-collision is
  ignored).
- **Actual `mode` semantics** — implemented and tested:
  - `development` (and unset): permissive — defaults apply to everything.
  - `test`: `defineEnv` refuses to fall back to `Deno.env`
    (`ENV_MODE_VIOLATION`) and ignores defaults for secrets.
  - `production`: ignores defaults for secrets (missing secret →
    `ENV_MISSING_VARIABLE` with `reason: "unsafe-default"`); non-secret defaults
    still apply. "Secret" means `env.secret()` **or** a key matched by
    `isSecretKey`.
- **Example app configuration** — README `config.ts` pattern (validate once,
  export the frozen result).
- **`@rootware/log` integration example** — README shows logging the `redactEnv`
  snapshot without `env` importing `log`.

Implemented `mode` semantics:

- `development`: allow defaults and ergonomic local configuration.
- `test`: require an explicit source and reject default secrets, so tests never
  pick up ambient or hard-coded production secrets.
- `production`: reject default secrets (no unsafe defaults) with clearer fatal
  configuration errors.

## v0.4.0 — File loading helpers — **done (`0.4.0`)**

- **`.env` loading helper** — `loadEnvFiles({ mode, dir, files, reader })`
  merges conventional files into an `EnvSource` for `defineEnv({ source })`. The
  reader is injectable (default `denoEnvFileReader`), so it is testable without
  disk.
- **`.env` / `.env.local` / `.env.<mode>` conventions** — merge order `.env` →
  `.env.<mode>` → `.env.local` → `.env.<mode>.local` (later wins); `*.local`
  skipped in `test` mode.
- **Parser** — `parseEnvFile` (comments, `export` prefix, single/double quotes,
  escape expansion). No `@std/dotenv` dependency; the package stays errors-only,
  and `@std/dotenv` can still be used by passing a custom `reader`/`source`.
- **Production guidance** — README documents not loading `.env` files in
  production (inject real env vars instead).

## v0.5.0 — Provider presets

Possible presets:

- Neon.
- Turso.
- Resend.
- Clerk.
- S3/R2.

Presets must not force provider dependencies into the core.

## v1.0.0 — Stable configuration contract

- Freeze builder API.
- Freeze generated example behavior.
- Freeze redaction semantics.
- Keep source-first testing model.

## Cross-package integrations

### @rootware/errors

`EnvError extends RootwareError`.

### @rootware/log

Examples should show logging redacted env values, but `@rootware/env` should not
import log.

### @rootware/testing

`@rootware/testing` can provide `testEnv()` using this package.

## First 10 implementation chunks

1. Audit `mod.ts`.
2. Create `EnvError`.
3. Implement parser helpers.
4. Implement env variable definition builder.
5. Implement `defineEnv`.
6. Implement explicit source validation.
7. Implement `readDenoEnv`.
8. Implement secret redaction.
9. Implement `.env.example`.
10. Add tests and README.

## Product rule

`@rootware/env` should fail fast, safely, and clearly. It should never make
runtime configuration mysterious.
