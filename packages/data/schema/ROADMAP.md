# @rootware/schema Product Plan

## Status

> **API freeze (`0.9.0`):** the public surface is audited and frozen to reduce
> churn toward `1.0`. The package stays **experimental** until it has real
> consumers — breaking changes remain possible even at `1.0`.

`@rootware/schema` now exists as a dependency-free leaf package. It owns the
schema-snapshot contract that `@rootware/orm` produces and `@rootware/migrate`
consumes, so neither package depends on the other and the type cannot drift
between two copies.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/schema` is a JSR-native, Deno-first leaf package that defines the
serializable schema-snapshot contract for Rootware database tooling.

It exists because the snapshot is a hand-off between two sibling packages
(`@rootware/orm` produces it, `@rootware/migrate` consumes it). If either
package owned the type, the other would have to depend on it, creating a
`migrate <-> orm` edge the workspace forbids. A tiny shared leaf removes that
coupling and gives the contract a single, versioned home.

The package should provide:

- The `RootwareSchemaSnapshot` type and its member types.
- A snapshot format version constant.
- Minimal, dependency-free validation and normalization helpers.
- No production runtime behavior beyond the contract and its guards.
- No dependency on any other Rootware package.

One-line strategy:

> `@rootware/schema` is the one place the schema-snapshot shape is defined, so
> the ORM and the migrator can integrate without importing each other.

## Canonical package

```ts
jsr:@rootware/schema
```

Expected imports:

```ts
import type { RootwareSchemaSnapshot } from "@rootware/schema";
import {
  assertValidSchemaSnapshot,
  defineSchemaSnapshot,
  normalizeSchemaSnapshot,
} from "@rootware/schema";
```

Naming rules:

- Always refer to this package as `@rootware/schema`.
- The snapshot type is always `RootwareSchemaSnapshot`.
- Do not redeclare the snapshot type in `@rootware/orm` or `@rootware/migrate`;
  import it from here.

## Rootware workspace fit

This package is a **leaf**. Like `@rootware/errors`, it depends on nothing and
can be imported by anything.

### Runtime imports

- None.

### Example / dev-only imports

- None.

### Disallowed dependencies

- `@rootware/errors`, `@rootware/env`, `@rootware/log` — a leaf this low should
  carry no dependency at all. (Validation errors surface as plain thrown
  `Error`s or boolean guards; callers in `@rootware/migrate` can wrap them in
  `MigrateError` if desired.)
- `@rootware/orm` / `@rootware/migrate` — would invert the whole point of the
  package.
- Any framework or driver.

## Responsibilities

This package owns:

- The `RootwareSchemaSnapshot` type and all member types.
- The snapshot format version constant.
- Deterministic shape guards / version checks.

This package does not own:

- Snapshot **production** from table metadata — that is `@rootware/orm`
  (`createSchemaSnapshot`).
- Snapshot **consumption** (diffing, SQL generation, journaling, persistence) —
  that is `@rootware/migrate`.
- Any dialect-specific SQL behavior.
- Any runtime database access.

## Public contracts

This is the single source of truth for the snapshot shape. `@rootware/orm` and
`@rootware/migrate` import these types rather than declaring their own.

```ts
export const SCHEMA_SNAPSHOT_VERSION = 1 as const;

export type RootwareDialectName = "generic" | "postgres" | "sqlite" | "mysql";

export interface RootwareSchemaSnapshot {
  version: typeof SCHEMA_SNAPSHOT_VERSION;
  dialect?: RootwareDialectName;
  tables: RootwareTableSnapshot[];
  metadata?: Record<string, unknown>;
}

export interface RootwareTableSnapshot {
  name: string;
  schema?: string;
  columns: RootwareColumnSnapshot[];
  primaryKey?: RootwarePrimaryKeySnapshot;
  uniqueConstraints?: RootwareUniqueConstraintSnapshot[];
  indexes?: RootwareIndexSnapshot[];
  foreignKeys?: RootwareForeignKeySnapshot[];
  checks?: RootwareCheckConstraintSnapshot[];
  metadata?: Record<string, unknown>;
}

export interface RootwareColumnSnapshot {
  name: string;
  type: RootwareColumnType;
  nullable?: boolean;
  default?: RootwareColumnDefault;
  generated?: boolean;
  references?: {
    table: string;
    schema?: string;
    column: string;
    onDelete?: string;
    onUpdate?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface RootwareColumnType {
  kind: string;
  length?: number;
  precision?: number;
  scale?: number;
  array?: boolean;
  dialectType?: string;
}

export type RootwareColumnDefault =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "expression"; sql: string };
```

Helpers:

```ts
export function defineSchemaSnapshot(
  input: RootwareSchemaSnapshot,
): RootwareSchemaSnapshot;
export function validateSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): RootwareSchemaIssue[];
export function assertValidSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): void;
export function normalizeSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): RootwareSchemaSnapshot;
```

Rules:

- The format is versioned from the first published release.
- The shape is serializable: no functions, symbols, class instances, or
  runtime-only fields.
- Output must be deterministic (stable key/array ordering) so diffs and
  committed snapshot files are stable across machines.
- Breaking changes to the shape bump `SCHEMA_SNAPSHOT_VERSION` and require a
  documented migration path for older committed snapshots.

## Dialect decision

The snapshot dialect union is aligned with the shipped ORM runtime dialect
names: `"generic" | "postgres" | "sqlite" | "mysql"`. Provider-specific
SQLite-family names such as `libsql` and `turso` should be adapter metadata
unless they require a different persisted schema model.

## Runtime targets

Primary:

- Deno 2.x, Deno Deploy, JSR consumers.

Compatible by design:

- Bun, Node ESM, Workers — the package is pure types plus tiny pure-function
  guards.

## Non-goals before v1

- Snapshot production (lives in `@rootware/orm`).
- Snapshot diffing / SQL generation (lives in `@rootware/migrate`).
- Dialect-specific type systems.
- Any dependency on another Rootware package.

## Release roadmap

## v0.1.0 — Extract the contract

Status: implemented in the 2026-06-26 alignment pass.

- Create the package with zero dependencies.
- Define `RootwareSchemaSnapshot` and all member types.
- Add `SCHEMA_SNAPSHOT_VERSION`, validation issues, `assertValidSchemaSnapshot`,
  and `normalizeSchemaSnapshot`.
- Add deterministic-shape, duplicate-name, constraint-reference, and version
  tests.

Acceptance:

- `@rootware/orm` can import the type to build `createSchemaSnapshot`, and
  `@rootware/migrate` can import it to consume snapshots, with neither importing
  the other.

## v0.2.0 — Hardening

- Snapshot equality helper (normalization already exists).
- Documented serialization rules and a JSON round-trip test.
- Compatibility notes for future version bumps.

## v0.3.0 — Snapshot diff primitive — **done (`0.3.0`)**

- `diffSchemaSnapshots(from, to)` returns added/removed/changed tables, each
  changed table carrying per-column `added`/`removed`/`changed`. Both sides are
  normalized first, so ordering is ignored.
- `isEmptySchemaSnapshotDiff` for the no-change fast path.
- This is the dependency-free seam `@rootware/migrate` builds generated
  migrations on, preserving the `orm` ↔ `migrate` decoupling (both depend on
  `schema`, neither on the other).

## v1.0.0 — Stable contract

- Freeze the type shape and the version semantics.
- Commit to semver for the snapshot contract.

## Cross-package integrations

### @rootware/orm

Imports `RootwareSchemaSnapshot` and produces it from table metadata via
`createSchemaSnapshot(schema)`.

### @rootware/migrate

Imports `RootwareSchemaSnapshot` and consumes prebuilt snapshots (validate,
diff, generate SQL, journal). Never imports `@rootware/orm`.

## First 10 implementation chunks

1. Create the dependency-free package and `deno.json`.
2. Define `RootwareSchemaSnapshot` and `RootwareDialectName`.
3. Define the remaining member types (table/column/index/fk/unique/pk/check).
4. Add `SCHEMA_SNAPSHOT_VERSION`.
5. Implement `validateSchemaSnapshot`.
6. Implement `assertValidSchemaSnapshot`.
7. Implement deterministic `normalizeSchemaSnapshot`.
8. Add deterministic-shape tests.
9. Add version and reference validation tests.
10. Document the contract and the orm/migrate hand-off.

## Product rule

`@rootware/schema` must stay a pure, dependency-free contract. Its value is
being the single, stable place the snapshot shape is defined — not feature
volume.
