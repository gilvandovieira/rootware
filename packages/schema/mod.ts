/**
 * Public entrypoint for @rootware/schema.
 *
 * This package defines the serializable schema snapshot contract shared by Rootware
 * database tooling. It intentionally has no Rootware dependencies.
 */

export const SCHEMA_SNAPSHOT_VERSION = 1 as const;

export type RootwareDialectName =
  | "generic"
  | "postgres"
  | "sqlite"
  | "mysql";

export interface RootwareSchemaSnapshot {
  readonly version: typeof SCHEMA_SNAPSHOT_VERSION;
  readonly dialect?: RootwareDialectName;
  readonly tables: readonly RootwareTableSnapshot[];
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareTableSnapshot {
  readonly name: string;
  readonly schema?: string;
  readonly columns: readonly RootwareColumnSnapshot[];
  readonly primaryKey?: RootwarePrimaryKeySnapshot;
  readonly indexes?: readonly RootwareIndexSnapshot[];
  readonly uniqueConstraints?: readonly RootwareUniqueConstraintSnapshot[];
  readonly foreignKeys?: readonly RootwareForeignKeySnapshot[];
  readonly checks?: readonly RootwareCheckConstraintSnapshot[];
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareColumnSnapshot {
  readonly name: string;
  readonly type: RootwareColumnType;
  readonly nullable?: boolean;
  readonly default?: RootwareColumnDefault;
  readonly generated?: boolean;
  readonly references?: {
    readonly table: string;
    readonly schema?: string;
    readonly column: string;
    readonly onDelete?: string;
    readonly onUpdate?: string;
  };
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareColumnType {
  readonly kind: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly array?: boolean;
  readonly dialectType?: string;
}

export type RootwareColumnDefault =
  | {
    readonly kind: "literal";
    readonly value: string | number | boolean | null;
  }
  | { readonly kind: "expression"; readonly sql: string };

export interface RootwarePrimaryKeySnapshot {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareIndexSnapshot {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly unique?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareUniqueConstraintSnapshot {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareForeignKeySnapshot {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly references: {
    readonly table: string;
    readonly schema?: string;
    readonly columns: readonly string[];
  };
  readonly onDelete?: string;
  readonly onUpdate?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RootwareCheckConstraintSnapshot {
  readonly name?: string;
  readonly expression: string;
  readonly metadata?: Record<string, unknown>;
}

export type RootwareSchemaIssueCode =
  | "SCHEMA_INVALID_VERSION"
  | "SCHEMA_INVALID_DIALECT"
  | "SCHEMA_INVALID_TABLE"
  | "SCHEMA_DUPLICATE_TABLE"
  | "SCHEMA_INVALID_COLUMN"
  | "SCHEMA_DUPLICATE_COLUMN"
  | "SCHEMA_UNKNOWN_COLUMN"
  | "SCHEMA_UNKNOWN_TARGET"
  | "SCHEMA_INVALID_CONSTRAINT"
  | (string & Record<never, never>);

export interface RootwareSchemaIssue {
  readonly code: RootwareSchemaIssueCode;
  readonly path: string;
  readonly message: string;
}

const DIALECTS = new Set<RootwareDialectName>([
  "generic",
  "postgres",
  "sqlite",
  "mysql",
]);

/** Normalizes and validates a schema snapshot. */
export function defineSchemaSnapshot(
  input: RootwareSchemaSnapshot,
): RootwareSchemaSnapshot {
  const snapshot = normalizeSchemaSnapshot(input);
  assertValidSchemaSnapshot(snapshot);
  return snapshot;
}

/** Returns validation issues for a schema snapshot without mutating it. */
export function validateSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): RootwareSchemaIssue[] {
  const issues: RootwareSchemaIssue[] = [];

  if (snapshot.version !== SCHEMA_SNAPSHOT_VERSION) {
    issues.push(issue(
      "SCHEMA_INVALID_VERSION",
      "version",
      "Schema snapshot version must be 1",
    ));
  }

  if (snapshot.dialect !== undefined && !DIALECTS.has(snapshot.dialect)) {
    issues.push(issue(
      "SCHEMA_INVALID_DIALECT",
      "dialect",
      "Schema snapshot dialect is not supported",
    ));
  }

  if (!Array.isArray(snapshot.tables)) {
    issues.push(issue(
      "SCHEMA_INVALID_TABLE",
      "tables",
      "Schema snapshot tables must be an array",
    ));
    return issues;
  }

  const tableKeys = new Set<string>();
  const tablesByKey = new Map<string, RootwareTableSnapshot>();

  for (
    let tableIndex = 0;
    tableIndex < snapshot.tables.length;
    tableIndex += 1
  ) {
    const table = snapshot.tables[tableIndex];
    const tablePath = `tables[${tableIndex}]`;

    if (!isNonEmptyString(table.name)) {
      issues.push(issue(
        "SCHEMA_INVALID_TABLE",
        `${tablePath}.name`,
        "Table name must be non-empty",
      ));
      continue;
    }

    const tableKey = tableSnapshotKey(table);

    if (tableKeys.has(tableKey)) {
      issues.push(issue(
        "SCHEMA_DUPLICATE_TABLE",
        `${tablePath}.name`,
        "Table names must be unique within schema/name",
      ));
    }

    tableKeys.add(tableKey);
    tablesByKey.set(tableKey, table);
    validateTable(table, tablePath, issues);
  }

  for (
    let tableIndex = 0;
    tableIndex < snapshot.tables.length;
    tableIndex += 1
  ) {
    validateForeignKeyTargets(
      snapshot.tables[tableIndex],
      `tables[${tableIndex}]`,
      tablesByKey,
      issues,
    );
  }

  return issues;
}

/** Throws when a schema snapshot is invalid. */
export function assertValidSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): void {
  const issues = validateSchemaSnapshot(snapshot);

  if (issues.length > 0) {
    const error = new Error(
      `Invalid Rootware schema snapshot: ${
        issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")
      }`,
    );
    (error as Error & { issues?: RootwareSchemaIssue[] }).issues = issues;
    throw error;
  }
}

/**
 * Returns a deterministic clone of a schema snapshot.
 *
 * Tables are sorted by `schema.name`; columns preserve declaration order because
 * order is meaningful to schema authors and later diffs.
 */
export function normalizeSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): RootwareSchemaSnapshot {
  return {
    version: snapshot.version,
    ...(snapshot.dialect === undefined ? {} : { dialect: snapshot.dialect }),
    tables: [...(snapshot.tables ?? [])]
      .map(normalizeTableSnapshot)
      .sort(compareTables),
    ...(snapshot.metadata === undefined
      ? {}
      : { metadata: cloneRecord(snapshot.metadata) }),
  };
}

function normalizeTableSnapshot(
  table: RootwareTableSnapshot,
): RootwareTableSnapshot {
  return {
    name: table.name,
    ...(table.schema === undefined ? {} : { schema: table.schema }),
    columns: [...(table.columns ?? [])].map(normalizeColumnSnapshot),
    ...(table.primaryKey === undefined
      ? {}
      : { primaryKey: normalizePrimaryKey(table.primaryKey) }),
    indexes: [...(table.indexes ?? [])].map(normalizeIndex).sort(compareNamed),
    uniqueConstraints: [...(table.uniqueConstraints ?? [])]
      .map(normalizeUniqueConstraint)
      .sort(compareNamed),
    foreignKeys: [...(table.foreignKeys ?? [])]
      .map(normalizeForeignKey)
      .sort(compareNamed),
    checks: [...(table.checks ?? [])].map(normalizeCheck).sort(compareNamed),
    ...(table.metadata === undefined
      ? {}
      : { metadata: cloneRecord(table.metadata) }),
  };
}

function normalizeColumnSnapshot(
  column: RootwareColumnSnapshot,
): RootwareColumnSnapshot {
  return {
    name: column.name,
    type: {
      kind: column.type.kind,
      ...(column.type.length === undefined
        ? {}
        : { length: column.type.length }),
      ...(column.type.precision === undefined
        ? {}
        : { precision: column.type.precision }),
      ...(column.type.scale === undefined ? {} : { scale: column.type.scale }),
      ...(column.type.array === undefined ? {} : { array: column.type.array }),
      ...(column.type.dialectType === undefined
        ? {}
        : { dialectType: column.type.dialectType }),
    },
    ...(column.nullable === undefined ? {} : { nullable: column.nullable }),
    ...(column.default === undefined
      ? {}
      : { default: normalizeColumnDefault(column.default) }),
    ...(column.generated === undefined ? {} : { generated: column.generated }),
    ...(column.references === undefined ? {} : {
      references: {
        table: column.references.table,
        ...(column.references.schema === undefined
          ? {}
          : { schema: column.references.schema }),
        column: column.references.column,
        ...(column.references.onDelete === undefined
          ? {}
          : { onDelete: column.references.onDelete }),
        ...(column.references.onUpdate === undefined
          ? {}
          : { onUpdate: column.references.onUpdate }),
      },
    }),
    ...(column.metadata === undefined
      ? {}
      : { metadata: cloneRecord(column.metadata) }),
  };
}

function normalizeColumnDefault(
  value: RootwareColumnDefault,
): RootwareColumnDefault {
  return value.kind === "literal"
    ? { kind: "literal", value: value.value }
    : { kind: "expression", sql: value.sql };
}

function normalizePrimaryKey(
  value: RootwarePrimaryKeySnapshot,
): RootwarePrimaryKeySnapshot {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    columns: [...value.columns],
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneRecord(value.metadata) }),
  };
}

function normalizeIndex(value: RootwareIndexSnapshot): RootwareIndexSnapshot {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    columns: [...value.columns],
    ...(value.unique === undefined ? {} : { unique: value.unique }),
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneRecord(value.metadata) }),
  };
}

function normalizeUniqueConstraint(
  value: RootwareUniqueConstraintSnapshot,
): RootwareUniqueConstraintSnapshot {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    columns: [...value.columns],
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneRecord(value.metadata) }),
  };
}

function normalizeForeignKey(
  value: RootwareForeignKeySnapshot,
): RootwareForeignKeySnapshot {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    columns: [...value.columns],
    references: {
      table: value.references.table,
      ...(value.references.schema === undefined
        ? {}
        : { schema: value.references.schema }),
      columns: [...value.references.columns],
    },
    ...(value.onDelete === undefined ? {} : { onDelete: value.onDelete }),
    ...(value.onUpdate === undefined ? {} : { onUpdate: value.onUpdate }),
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneRecord(value.metadata) }),
  };
}

function normalizeCheck(
  value: RootwareCheckConstraintSnapshot,
): RootwareCheckConstraintSnapshot {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    expression: value.expression,
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneRecord(value.metadata) }),
  };
}

function validateTable(
  table: RootwareTableSnapshot,
  path: string,
  issues: RootwareSchemaIssue[],
): void {
  if (!Array.isArray(table.columns)) {
    issues.push(issue(
      "SCHEMA_INVALID_COLUMN",
      `${path}.columns`,
      "Table columns must be an array",
    ));
    return;
  }

  const columns = new Set<string>();

  for (
    let columnIndex = 0;
    columnIndex < table.columns.length;
    columnIndex += 1
  ) {
    const column = table.columns[columnIndex];
    const columnPath = `${path}.columns[${columnIndex}]`;

    if (!isNonEmptyString(column.name)) {
      issues.push(issue(
        "SCHEMA_INVALID_COLUMN",
        `${columnPath}.name`,
        "Column name must be non-empty",
      ));
      continue;
    }

    if (columns.has(column.name)) {
      issues.push(issue(
        "SCHEMA_DUPLICATE_COLUMN",
        `${columnPath}.name`,
        "Column names must be unique per table",
      ));
    }

    columns.add(column.name);

    if (!isNonEmptyString(column.type?.kind)) {
      issues.push(issue(
        "SCHEMA_INVALID_COLUMN",
        `${columnPath}.type.kind`,
        "Column type kind must be non-empty",
      ));
    }
  }

  validateColumnList(
    table.primaryKey?.columns,
    columns,
    `${path}.primaryKey`,
    issues,
  );
  validateNamedColumnLists(table.indexes, columns, `${path}.indexes`, issues);
  validateNamedColumnLists(
    table.uniqueConstraints,
    columns,
    `${path}.uniqueConstraints`,
    issues,
  );

  for (let index = 0; index < (table.foreignKeys ?? []).length; index += 1) {
    validateColumnList(
      table.foreignKeys?.[index].columns,
      columns,
      `${path}.foreignKeys[${index}]`,
      issues,
    );
  }
}

function validateForeignKeyTargets(
  table: RootwareTableSnapshot,
  path: string,
  tablesByKey: Map<string, RootwareTableSnapshot>,
  issues: RootwareSchemaIssue[],
): void {
  const checkTarget = (
    targetTable: string,
    targetSchema: string | undefined,
    targetColumn: string,
    targetPath: string,
  ): void => {
    const target = tablesByKey.get(tableSnapshotKey({
      name: targetTable,
      ...(targetSchema === undefined ? {} : { schema: targetSchema }),
    }));

    if (target === undefined) {
      return;
    }

    if (!target.columns.some((column) => column.name === targetColumn)) {
      issues.push(issue(
        "SCHEMA_UNKNOWN_TARGET",
        targetPath,
        "Foreign key target column does not exist",
      ));
    }
  };

  for (let index = 0; index < table.columns.length; index += 1) {
    const reference = table.columns[index].references;

    if (reference !== undefined) {
      checkTarget(
        reference.table,
        reference.schema,
        reference.column,
        `${path}.columns[${index}].references.column`,
      );
    }
  }

  for (let index = 0; index < (table.foreignKeys ?? []).length; index += 1) {
    const foreignKey = table.foreignKeys![index];
    const target = tablesByKey.get(tableSnapshotKey({
      name: foreignKey.references.table,
      ...(foreignKey.references.schema === undefined
        ? {}
        : { schema: foreignKey.references.schema }),
    }));

    if (target === undefined) {
      continue;
    }

    const targetColumns = new Set(target.columns.map((column) => column.name));

    for (
      let columnIndex = 0;
      columnIndex < foreignKey.references.columns.length;
      columnIndex += 1
    ) {
      const column = foreignKey.references.columns[columnIndex];

      if (!targetColumns.has(column)) {
        issues.push(issue(
          "SCHEMA_UNKNOWN_TARGET",
          `${path}.foreignKeys[${index}].references.columns[${columnIndex}]`,
          "Foreign key target column does not exist",
        ));
      }
    }
  }
}

function validateNamedColumnLists(
  values:
    | readonly RootwareIndexSnapshot[]
    | readonly RootwareUniqueConstraintSnapshot[]
    | undefined,
  columns: Set<string>,
  path: string,
  issues: RootwareSchemaIssue[],
): void {
  for (let index = 0; index < (values ?? []).length; index += 1) {
    validateColumnList(
      values?.[index].columns,
      columns,
      `${path}[${index}]`,
      issues,
    );
  }
}

function validateColumnList(
  names: readonly string[] | undefined,
  columns: Set<string>,
  path: string,
  issues: RootwareSchemaIssue[],
): void {
  if (names === undefined) {
    return;
  }

  if (!Array.isArray(names) || names.length === 0) {
    issues.push(issue(
      "SCHEMA_INVALID_CONSTRAINT",
      `${path}.columns`,
      "Constraint columns must be a non-empty array",
    ));
    return;
  }

  for (let index = 0; index < names.length; index += 1) {
    if (!columns.has(names[index])) {
      issues.push(issue(
        "SCHEMA_UNKNOWN_COLUMN",
        `${path}.columns[${index}]`,
        "Constraint column does not exist",
      ));
    }
  }
}

function issue(
  code: RootwareSchemaIssueCode,
  path: string,
  message: string,
): RootwareSchemaIssue {
  return { code, path, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function tableSnapshotKey(
  table: Pick<RootwareTableSnapshot, "name" | "schema">,
): string {
  return `${table.schema ?? ""}.${table.name}`;
}

function compareTables(
  left: RootwareTableSnapshot,
  right: RootwareTableSnapshot,
): number {
  return tableSnapshotKey(left).localeCompare(tableSnapshotKey(right));
}

function compareNamed(
  left: { readonly name?: string; readonly columns?: readonly string[] },
  right: { readonly name?: string; readonly columns?: readonly string[] },
): number {
  const leftKey = left.name ?? (left.columns ?? []).join(",");
  const rightKey = right.name ?? (right.columns ?? []).join(",");
  return leftKey.localeCompare(rightKey);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}
