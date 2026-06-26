# Rootware Roadmaps

Last reviewed: 2026-06-26

This directory holds workspace-level roadmap material. Package-specific roadmaps
live beside the package they describe.

The public dependency graph lives in `../README.md`; the detailed package graph
policy lives in `../docs/packages.md`.

## Workspace roadmaps

- `rootware-roadmap.md`
- `adapters.md`
- `template.md`

## Package roadmaps

- `../packages/errors/ROADMAP.md`
- `../packages/env/ROADMAP.md`
- `../packages/log/ROADMAP.md`
- `../packages/testing/ROADMAP.md`
- `../packages/http/ROADMAP.md`
- `../packages/cache/ROADMAP.md`
- `../packages/storage/ROADMAP.md`
- `../packages/session/ROADMAP.md`
- `../packages/schema/ROADMAP.md`
- `../packages/migrate/ROADMAP.md`
- `../packages/orm/ROADMAP.md`
- `../packages/jobs/ROADMAP.md`

`../packages/schema/ROADMAP.md` covers the dependency-free `@rootware/schema`
leaf package added during the 2026-06-26 alignment pass. It owns the
serializable schema-snapshot type so `@rootware/orm` can produce snapshots and
`@rootware/migrate` can consume prebuilt snapshots without importing each other.
See `../CHANGELOG.md` for the reconciliation history.

Subpath packages such as `@rootware/orm/postgres`, `@rootware/orm/neon`,
`@rootware/http/testing`, `@rootware/migrate/cli`, and
`@rootware/log/compat/pino` are roadmap targets only until their files and
exports exist.

The intended dependency ladder remains:

```txt
errors/schema -> env -> log -> testing -> http/cache/storage -> session -> migrate/orm -> jobs -> adapters
```

Arrows here mean **build order**, not imports. `migrate` and `orm` are siblings:
neither imports the other, and they integrate only through the serializable
schema snapshot type owned by the dependency-free `@rootware/schema` leaf
(which, like `@rootware/errors`, depends on nothing). See `rootware-roadmap.md`
("Schema snapshot handoff") for the exact contract.

The important product rule is that each package should make the next package
easier to build and test.
