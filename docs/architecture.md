# Architecture

Rootware is a Deno workspace of small JSR packages. It is not a framework, not a
runtime, and not a build system.

Each package is designed to be:

- Publicly importable from JSR.
- Published independently.
- Small enough to understand without framework-level conventions.
- Useful on its own.
- Friendly to explicit dependency injection and deterministic tests.

## Boundaries

Packages should avoid unnecessary dependencies. Lower-level packages define
contracts; higher-level packages compose them.

Adapters for Redis, Deno KV, Postgres, storage providers, telemetry, and
application frameworks are intentionally left for future packages or optional
integrations.

## Publication Model

Each package has its own `deno.json`, version, README, and `mod.ts` entrypoint.
The root `deno.json` only coordinates development tasks and workspace
resolution.

## Dependency Rules

- Do not introduce circular dependencies.
- Prefer Web APIs and Deno-native APIs over Node compatibility.
- Keep package APIs explicit and documented.
- Use injected sources, clients, stores, and sinks for testability.
