# Architecture

Rootware is a Deno workspace of small JSR packages. It is not a framework, not a
runtime, and not a build system.

Each package is published separately and keeps its public entrypoint in
`mod.ts`. Packages should remain narrow, explicit, and useful on their own.

## Dependency Ladder

Packages follow the order documented in [packages.md](./packages.md). A package
may import a lower package, but must not import a higher package. This keeps
publication boundaries simple and prevents circular dependencies.

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
