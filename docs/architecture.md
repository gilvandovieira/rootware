# Architecture

Rootware is a Deno workspace of small JSR packages. It is not a framework, not a
runtime, and not a build system.

Each package is published separately and keeps its public entrypoint in
`mod.ts`. Packages should remain narrow, explicit, and useful on their own.

## Dependency Graph

Packages follow the runtime graph documented in [packages.md](./packages.md).
`scripts/check_graph.ts` enforces that graph through `deno task graph`.

`@rootware/schema` is a dependency-free leaf package. It owns the serializable
schema snapshot contract shared by database tooling.

`@rootware/orm` produces schema snapshots. `@rootware/migrate` consumes schema
snapshots. Neither package imports the other; applications wire them together by
passing plain snapshot data.

## Adapters

Rootware packages define contracts first. Real adapters for databases, object
storage, queues, observability, and framework middleware can be added later
without changing the core primitives.

## Design Constraints

- Prefer Web APIs and Deno-native behavior.
- Avoid unnecessary dependencies.
- Keep package APIs small and explicit.
- Use memory/noop implementations for deterministic tests and scaffolding.
- Do not introduce a build step for package publication.
