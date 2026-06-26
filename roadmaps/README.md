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

- `../packages/foundation/errors/ROADMAP.md`
- `../packages/foundation/env/ROADMAP.md`
- `../packages/foundation/log/ROADMAP.md`
- `../packages/foundation/testing/ROADMAP.md`
- `../packages/web/http/ROADMAP.md`
- `../packages/state/cache/ROADMAP.md`
- `../packages/state/storage/ROADMAP.md`
- `../packages/state/session/ROADMAP.md`
- `../packages/data/schema/ROADMAP.md`
- `../packages/data/migrate/ROADMAP.md`
- `../packages/data/orm/ROADMAP.md`
- `../packages/async/jobs/ROADMAP.md`

`../packages/data/schema/ROADMAP.md` covers the dependency-free
`@rootware/schema` leaf package added during the 2026-06-26 alignment pass. It
owns the serializable schema-snapshot type so `@rootware/orm` can produce
snapshots and `@rootware/migrate` can consume prebuilt snapshots without
importing each other. See `../CHANGELOG.md` for the reconciliation history.

Implemented subpath exports are `@rootware/log/compat/pino`,
`@rootware/log/http`, `@rootware/orm/postgres`, `@rootware/orm/sqlite`,
`@rootware/orm/libsql`, `@rootware/orm/turso`, `@rootware/migrate/postgres`,
`@rootware/migrate/sqlite`, `@rootware/migrate/libsql`,
`@rootware/migrate/turso`, `@rootware/migrate/cli`, and
`@rootware/jobs/postgres`. Planned subpaths such as `@rootware/orm/neon` and
`@rootware/http/testing` remain roadmap targets only until their files and
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
