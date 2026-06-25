import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

export type OrmErrorCode =
  | "ORM_INVALID_TABLE"
  | "ORM_INVALID_COLUMN"
  | "ORM_INVALID_QUERY"
  | "ORM_INVALID_SQL"
  | "ORM_DRIVER_MISSING"
  | "ORM_EXECUTE_FAILED"
  | "ORM_TRANSACTION_FAILED"
  | "ORM_SERIALIZATION_FAILED"
  | "ORM_UNKNOWN_ERROR"
  | (string & Record<never, never>);

export type TableName = string;

export type ColumnName = string;

export type ColumnDataType =
  | "text"
  | "integer"
  | "number"
  | "boolean"
  | "json"
  | "date"
  | "timestamp"
  | "uuid";

export type ColumnRuntimeType =
  | string
  | number
  | boolean
  | Date
  | null
  | Record<string, unknown>
  | unknown[];

/** Column metadata used by table definitions and future adapters. */
export interface ColumnDefinition<T> {
  readonly name?: ColumnName;
  readonly dataType: ColumnDataType;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly references?: {
    readonly table: string;
    readonly column: string;
  };
  readonly defaultValue?: T | (() => T);
}

/** Immutable column builder used to define table schemas. */
export interface ColumnBuilder<
  T,
  TOptional extends boolean = false,
  THasDefault extends boolean = false,
> {
  readonly definition: ColumnDefinition<T>;
  readonly optionalInsert: TOptional;
  readonly defaultInsert: THasDefault;

  named(name: string): ColumnBuilder<T, TOptional, THasDefault>;
  notNull(): ColumnBuilder<NonNullable<T>, TOptional, THasDefault>;
  nullable(): ColumnBuilder<T | null, TOptional, THasDefault>;
  optional(): ColumnBuilder<T | undefined, true, THasDefault>;
  default(value: T | (() => T)): ColumnBuilder<T, TOptional, true>;
  primaryKey(): ColumnBuilder<T, TOptional, THasDefault>;
  unique(): ColumnBuilder<T, TOptional, THasDefault>;
  references(
    table: string,
    column: string,
  ): ColumnBuilder<T, TOptional, THasDefault>;
}

export type TableColumns = Record<
  string,
  ColumnBuilder<unknown, boolean, boolean>
>;

export type ColumnDefinitionFromBuilder<TBuilder> = TBuilder extends
  ColumnBuilder<infer TValue, infer TOptional, infer THasDefault>
  ? Omit<ColumnDefinition<TValue>, "name"> & {
    readonly name: ColumnName;
    readonly optionalInsert: TOptional;
    readonly defaultInsert: THasDefault;
    readonly insertOptional: TOptional extends true ? true
      : THasDefault extends true ? true
      : false;
  }
  : never;

/** Table schema definition returned by defineTable. */
export interface TableDefinition<
  TColumns extends TableColumns = TableColumns,
> {
  readonly kind: "table";
  readonly name: TableName;
  readonly schema?: string;
  readonly columns: {
    readonly [K in keyof TColumns]: ColumnDefinitionFromBuilder<TColumns[K]> & {
      readonly propertyName: string;
      readonly tableName: string;
    };
  };
}

type ColumnValueFromBuilder<TBuilder> = TBuilder extends
  ColumnBuilder<infer TValue, boolean, boolean> ? TValue : never;

type InsertOptionalFromBuilder<TBuilder> = TBuilder extends
  ColumnBuilder<unknown, infer TOptional, infer THasDefault>
  ? TOptional extends true ? true
  : THasDefault extends true ? true
  : false
  : false;

type RequiredInsertKeys<TColumns extends TableColumns> = {
  [K in keyof TColumns]: InsertOptionalFromBuilder<TColumns[K]> extends true
    ? never
    : K;
}[keyof TColumns];

type OptionalInsertKeys<TColumns extends TableColumns> = {
  [K in keyof TColumns]: InsertOptionalFromBuilder<TColumns[K]> extends true ? K
    : never;
}[keyof TColumns];

export type InferSelect<TTable> = TTable extends TableDefinition<infer TColumns>
  ? {
    readonly [K in keyof TColumns]: ColumnValueFromBuilder<TColumns[K]>;
  }
  : never;

export type InferInsert<TTable> = TTable extends TableDefinition<infer TColumns>
  ?
    & {
      readonly [K in RequiredInsertKeys<TColumns>]: ColumnValueFromBuilder<
        TColumns[K]
      >;
    }
    & {
      readonly [K in OptionalInsertKeys<TColumns>]?: ColumnValueFromBuilder<
        TColumns[K]
      >;
    }
  : never;

export type SqlDialect = "postgres" | "sqlite" | "mysql" | "generic";

export type SqlParameter =
  | string
  | number
  | boolean
  | null
  | Date
  | Uint8Array
  | Record<string, unknown>
  | unknown[];

export interface SqlQuery {
  readonly text: string;
  readonly params: SqlParameter[];
}

/** SQL fragment made from safe chunks and separate parameters. */
export interface Sql {
  readonly kind: "sql";
  readonly chunks: readonly SqlChunk[];
}

export type SqlChunk =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "param"; readonly value: SqlParameter }
  | { readonly kind: "raw"; readonly value: string }
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "sql"; readonly value: Sql };

/** Boolean SQL condition wrapper used by query builders. */
export interface Condition {
  readonly kind: "condition";
  readonly sql: Sql;
}

export interface OrmQueryResult<T = unknown> {
  readonly rows: T[];
  readonly rowCount?: number;
}

/** Async-first driver contract for future database adapters. */
export interface OrmDriver {
  query<T = unknown>(
    query: SqlQuery,
  ): Promise<OrmQueryResult<T>>;

  execute(
    query: SqlQuery,
  ): Promise<OrmQueryResult>;

  transaction?<T>(
    fn: (tx: OrmTransaction) => Promise<T>,
  ): Promise<T>;

  close?(): Promise<void>;
}

export interface OrmTransaction {
  query<T = unknown>(query: SqlQuery): Promise<OrmQueryResult<T>>;
  execute(query: SqlQuery): Promise<OrmQueryResult>;
}

/** Database facade used by query builders and manual SQL execution. */
export interface Database {
  readonly dialect: SqlDialect;

  execute<T = unknown>(
    query: Sql,
  ): Promise<OrmQueryResult<T>>;

  query<T = unknown>(
    query: Sql,
  ): Promise<OrmQueryResult<T>>;

  select(): SelectBuilder<unknown, unknown>;

  insert<TTable extends TableDefinition>(
    table: TTable,
  ): InsertBuilder<TTable>;

  update<TTable extends TableDefinition>(
    table: TTable,
  ): UpdateBuilder<TTable>;

  delete<TTable extends TableDefinition>(
    table: TTable,
  ): DeleteBuilder<TTable>;

  transaction<T>(
    fn: (tx: Database) => Promise<T>,
  ): Promise<T>;

  close(): Promise<void>;
}

export interface DatabaseOptions {
  readonly driver?: OrmDriver;
  readonly dialect?: SqlDialect;
  readonly logger?: Logger;
}

export interface SelectBuilder<TTable, TResult> {
  from<TNewTable extends TableDefinition>(
    table: TNewTable,
  ): SelectBuilder<TNewTable, InferSelect<TNewTable>>;

  where(condition: Condition): SelectBuilder<TTable, TResult>;

  orderBy(
    column: unknown,
    direction?: "asc" | "desc",
  ): SelectBuilder<TTable, TResult>;

  limit(count: number): SelectBuilder<TTable, TResult>;

  offset(count: number): SelectBuilder<TTable, TResult>;

  toSql(): Sql;

  execute(): Promise<TResult[]>;
}

export interface InsertBuilder<TTable extends TableDefinition> {
  values(
    value: InferInsert<TTable> | InferInsert<TTable>[],
  ): InsertBuilder<TTable>;

  returning(): InsertBuilder<TTable>;

  toSql(): Sql;

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>>;
}

export interface UpdateBuilder<TTable extends TableDefinition> {
  set(
    values: Partial<InferInsert<TTable>>,
  ): UpdateBuilder<TTable>;

  where(condition: Condition): UpdateBuilder<TTable>;

  returning(): UpdateBuilder<TTable>;

  toSql(): Sql;

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>>;
}

export interface DeleteBuilder<TTable extends TableDefinition> {
  where(condition: Condition): DeleteBuilder<TTable>;

  returning(): DeleteBuilder<TTable>;

  toSql(): Sql;

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>>;
}

export interface MemoryOrmDriverOptions {
  readonly tables?: Record<string, Array<Record<string, unknown>>>;
}

export interface OrmErrorOptions {
  readonly code?: OrmErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for schema, SQL, execution, and transaction failures. */
export class OrmError extends RootwareError {
  constructor(message: string, options: OrmErrorOptions = {}) {
    super(message, {
      code: options.code ?? "ORM_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

interface ColumnsFactory {
  text(): ColumnBuilder<string>;
  integer(): ColumnBuilder<number>;
  number(): ColumnBuilder<number>;
  boolean(): ColumnBuilder<boolean>;
  json<T = Record<string, unknown>>(): ColumnBuilder<T>;
  date(): ColumnBuilder<Date>;
  timestamp(): ColumnBuilder<Date>;
  uuid(): ColumnBuilder<string>;
}

/** Column builder factory for table schemas. */
export const columns: ColumnsFactory = Object.freeze({
  text(): ColumnBuilder<string> {
    return createColumnBuilder<string>("text");
  },

  integer(): ColumnBuilder<number> {
    return createColumnBuilder<number>("integer");
  },

  number(): ColumnBuilder<number> {
    return createColumnBuilder<number>("number");
  },

  boolean(): ColumnBuilder<boolean> {
    return createColumnBuilder<boolean>("boolean");
  },

  json<T = Record<string, unknown>>(): ColumnBuilder<T> {
    return createColumnBuilder<T>("json");
  },

  date(): ColumnBuilder<Date> {
    return createColumnBuilder<Date>("date");
  },

  timestamp(): ColumnBuilder<Date> {
    return createColumnBuilder<Date>("timestamp");
  },

  uuid(): ColumnBuilder<string> {
    return createColumnBuilder<string>("uuid");
  },
});

/** Defines a typed table schema. */
export function defineTable<TColumns extends TableColumns>(
  name: TableName,
  tableColumns: TColumns,
  options: {
    readonly schema?: string;
  } = {},
): TableDefinition<TColumns> {
  const tableName = normalizeTableName(name);
  const schema = options.schema === undefined
    ? undefined
    : normalizeTableName(options.schema);
  const finalColumns: Record<string, unknown> = {};

  for (const [propertyName, builder] of Object.entries(tableColumns)) {
    if (!isColumnBuilder(builder)) {
      throw new OrmError("Table column must be a ColumnBuilder", {
        code: "ORM_INVALID_COLUMN",
        details: { table: tableName, propertyName },
      });
    }

    const columnName = normalizeColumnName(
      builder.definition.name ?? propertyName,
    );
    const definition = cloneColumnDefinition(builder.definition);

    finalColumns[propertyName] = Object.freeze({
      ...definition,
      name: columnName,
      propertyName,
      tableName,
      optionalInsert: builder.optionalInsert,
      defaultInsert: builder.defaultInsert,
      insertOptional: builder.optionalInsert || builder.defaultInsert,
    });
  }

  return Object.freeze({
    kind: "table",
    name: tableName,
    ...(schema === undefined ? {} : { schema }),
    columns: Object.freeze(finalColumns),
  }) as TableDefinition<TColumns>;
}

/** SQL tagged template that keeps interpolated values as parameters. */
export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Sql {
  const chunks: SqlChunk[] = [];

  for (let index = 0; index < strings.length; index += 1) {
    const text = strings[index];

    if (text.length > 0) {
      chunks.push({ kind: "text", value: text });
    }

    if (index < values.length) {
      const value = values[index];

      if (isSql(value)) {
        chunks.push({ kind: "sql", value });
      } else {
        chunks.push({ kind: "param", value: serializeSqlValue(value) });
      }
    }
  }

  return makeSql(chunks);
}

/**
 * Creates an unsafe raw SQL fragment.
 *
 * `raw()` does not sanitize input. Only use it with trusted SQL literals.
 */
export function raw(value: string): Sql {
  if (typeof value !== "string") {
    throw new OrmError("Raw SQL must be a string", {
      code: "ORM_INVALID_SQL",
    });
  }

  return makeSql([{ kind: "raw", value }]);
}

/** Creates a validated SQL identifier fragment. */
export function identifier(value: string): Sql {
  validateIdentifierPath(value, "ORM_INVALID_SQL");
  return makeSql([{ kind: "identifier", value }]);
}

/** Joins SQL fragments with a separator. */
export function joinSql(
  items: Sql[],
  separator: Sql = raw(", "),
): Sql {
  const chunks: SqlChunk[] = [];

  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) {
      chunks.push({ kind: "sql", value: separator });
    }

    chunks.push({ kind: "sql", value: items[index] });
  }

  return makeSql(chunks);
}

/** Returns an empty SQL fragment. */
export function emptySql(): Sql {
  return makeSql([]);
}

/** Renders a SQL fragment into driver text and parameter array. */
export function renderSql(
  query: Sql,
  options: {
    readonly dialect?: SqlDialect;
  } = {},
): SqlQuery {
  if (!isSql(query)) {
    throw new OrmError("Expected a SQL fragment", {
      code: "ORM_INVALID_SQL",
    });
  }

  const state: RenderState = {
    text: "",
    params: [],
    dialect: options.dialect ?? "generic",
  };

  renderSqlInto(query, state);

  return {
    text: state.text,
    params: state.params,
  };
}

/** Quotes and validates a SQL identifier for a dialect. */
export function quoteIdentifier(
  name: string,
  dialect: SqlDialect = "generic",
): string {
  const normalized = validateIdentifierPath(name, "ORM_INVALID_SQL");
  const quote = dialect === "mysql" ? "`" : '"';

  return normalized
    .split(".")
    .map((part) => `${quote}${part}${quote}`)
    .join(".");
}

export function eq(column: unknown, value: unknown): Condition {
  return binaryCondition(column, "=", value);
}

export function ne(column: unknown, value: unknown): Condition {
  return binaryCondition(column, "<>", value);
}

export function gt(column: unknown, value: unknown): Condition {
  return binaryCondition(column, ">", value);
}

export function gte(column: unknown, value: unknown): Condition {
  return binaryCondition(column, ">=", value);
}

export function lt(column: unknown, value: unknown): Condition {
  return binaryCondition(column, "<", value);
}

export function lte(column: unknown, value: unknown): Condition {
  return binaryCondition(column, "<=", value);
}

export function like(column: unknown, value: unknown): Condition {
  return binaryCondition(column, "like", value);
}

export function isNull(column: unknown): Condition {
  return createCondition(sql`${columnToSql(column)} is null`);
}

export function isNotNull(column: unknown): Condition {
  return createCondition(sql`${columnToSql(column)} is not null`);
}

export function and(
  ...conditions: Array<Condition | null | undefined>
): Condition {
  return combineConditions("and", conditions);
}

export function or(
  ...conditions: Array<Condition | null | undefined>
): Condition {
  return combineConditions("or", conditions);
}

export function not(condition: Condition): Condition {
  assertCondition(condition);
  return createCondition(sql`not (${condition.sql})`);
}

/** Creates a database facade from a driver and dialect. */
export function createDatabase(options: DatabaseOptions = {}): Database {
  return new RootwareDatabase({
    driver: options.driver ?? noopOrmDriver(),
    dialect: options.dialect ?? "generic",
    logger: options.logger,
  });
}

/**
 * Creates a driver that never touches a real database.
 *
 * Useful for tests and scaffolding; it always returns empty result sets.
 */
export function noopOrmDriver(): OrmDriver {
  return {
    query<T = unknown>(_query: SqlQuery): Promise<OrmQueryResult<T>> {
      return Promise.resolve({ rows: [], rowCount: 0 });
    },

    execute(_query: SqlQuery): Promise<OrmQueryResult> {
      return Promise.resolve({ rows: [], rowCount: 0 });
    },

    transaction<T>(fn: (tx: OrmTransaction) => Promise<T>): Promise<T> {
      return fn(this);
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** Creates a tiny in-memory driver that records no data and returns empty rows. */
export function memoryOrmDriver(
  _options: MemoryOrmDriverOptions = {},
): OrmDriver {
  const history: SqlQuery[] = [];

  return {
    query<T = unknown>(query: SqlQuery): Promise<OrmQueryResult<T>> {
      history.push(cloneSqlQuery(query));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },

    execute(query: SqlQuery): Promise<OrmQueryResult> {
      history.push(cloneSqlQuery(query));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },

    transaction<T>(fn: (tx: OrmTransaction) => Promise<T>): Promise<T> {
      return fn(this);
    },

    close(): Promise<void> {
      history.length = 0;
      return Promise.resolve();
    },
  };
}

/** Normalizes a table name. */
export function normalizeTableName(name: TableName): TableName {
  if (typeof name !== "string") {
    throw new OrmError("Table name must be a string", {
      code: "ORM_INVALID_TABLE",
    });
  }

  return validateIdentifierPath(name.trim(), "ORM_INVALID_TABLE");
}

/** Normalizes a simple column name. */
export function normalizeColumnName(name: ColumnName): ColumnName {
  if (typeof name !== "string") {
    throw new OrmError("Column name must be a string", {
      code: "ORM_INVALID_COLUMN",
    });
  }

  const normalized = name.trim();

  if (!isValidIdentifierPart(normalized)) {
    throw new OrmError("Column name is invalid", {
      code: "ORM_INVALID_COLUMN",
      details: { name },
    });
  }

  return normalized;
}

/** Creates a named column definition from metadata. */
export function createColumn<T>(
  name: ColumnName,
  definition: ColumnDefinition<T>,
): ColumnDefinition<T> & { readonly name: ColumnName } {
  return Object.freeze({
    ...cloneColumnDefinition(definition),
    name: normalizeColumnName(name),
  });
}

/** Returns table columns. */
export function getTableColumns<TTable extends TableDefinition>(
  table: TTable,
): TTable["columns"] {
  assertTable(table);
  return table.columns;
}

/** Returns the normalized table name. */
export function getTableName(table: TableDefinition): TableName {
  assertTable(table);
  return table.name;
}

export function isTable(value: unknown): value is TableDefinition {
  return isRecord(value) && value.kind === "table" &&
    typeof value.name === "string" &&
    isRecord(value.columns);
}

export function isColumn(
  value: unknown,
): value is ColumnDefinition<unknown> & {
  readonly name: ColumnName;
  readonly tableName: string;
  readonly propertyName?: string;
} {
  return isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.tableName === "string" &&
    typeof value.dataType === "string";
}

export function isSql(value: unknown): value is Sql {
  return isRecord(value) && value.kind === "sql" && Array.isArray(value.chunks);
}

/** Converts a JS value into a SQL parameter. */
export function serializeSqlValue(value: unknown): SqlParameter {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" || value === null ||
    value instanceof Date || value instanceof Uint8Array
  ) {
    return value;
  }

  if (isSql(value)) {
    throw new OrmError("SQL fragments cannot be serialized as parameters", {
      code: "ORM_SERIALIZATION_FAILED",
    });
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    return value;
  }

  throw new OrmError("SQL value is not serializable", {
    code: "ORM_SERIALIZATION_FAILED",
    details: { type: typeof value },
  });
}

/** Converts a SQL fragment or condition into SQL. */
export function toSql(query: Sql | Condition): Sql {
  if (isSql(query)) {
    return query;
  }

  if (isCondition(query)) {
    return query.sql;
  }

  throw new OrmError("Value cannot be converted to SQL", {
    code: "ORM_INVALID_SQL",
  });
}

class RootwareColumnBuilder<
  T,
  TOptional extends boolean,
  THasDefault extends boolean,
> implements ColumnBuilder<T, TOptional, THasDefault> {
  readonly definition: ColumnDefinition<T>;
  readonly optionalInsert: TOptional;
  readonly defaultInsert: THasDefault;

  constructor(
    definition: ColumnDefinition<T>,
    optionalInsert: TOptional,
    defaultInsert: THasDefault,
  ) {
    this.definition = Object.freeze(cloneColumnDefinition(definition));
    this.optionalInsert = optionalInsert;
    this.defaultInsert = defaultInsert;
  }

  named(name: string): ColumnBuilder<T, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      { ...this.definition, name: normalizeColumnName(name) },
      this.optionalInsert,
      this.defaultInsert,
    );
  }

  notNull(): ColumnBuilder<NonNullable<T>, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      { ...this.definition, nullable: false } as ColumnDefinition<
        NonNullable<T>
      >,
      this.optionalInsert,
      this.defaultInsert,
    );
  }

  nullable(): ColumnBuilder<T | null, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      { ...this.definition, nullable: true } as ColumnDefinition<T | null>,
      this.optionalInsert,
      this.defaultInsert,
    );
  }

  optional(): ColumnBuilder<T | undefined, true, THasDefault> {
    return new RootwareColumnBuilder(
      this.definition as ColumnDefinition<T | undefined>,
      true,
      this.defaultInsert,
    );
  }

  default(value: T | (() => T)): ColumnBuilder<T, TOptional, true> {
    return new RootwareColumnBuilder(
      {
        ...this.definition,
        hasDefault: true,
        defaultValue: value,
      },
      this.optionalInsert,
      true,
    );
  }

  primaryKey(): ColumnBuilder<T, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      { ...this.definition, primaryKey: true },
      this.optionalInsert,
      this.defaultInsert,
    );
  }

  unique(): ColumnBuilder<T, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      { ...this.definition, unique: true },
      this.optionalInsert,
      this.defaultInsert,
    );
  }

  references(
    table: string,
    column: string,
  ): ColumnBuilder<T, TOptional, THasDefault> {
    return new RootwareColumnBuilder(
      {
        ...this.definition,
        references: {
          table: normalizeTableName(table),
          column: normalizeColumnName(column),
        },
      },
      this.optionalInsert,
      this.defaultInsert,
    );
  }
}

interface RootwareDatabaseOptions {
  readonly driver: OrmDriver;
  readonly dialect: SqlDialect;
  readonly logger?: Logger;
}

class RootwareDatabase implements Database {
  readonly dialect: SqlDialect;
  readonly #driver: OrmDriver;
  readonly #logger?: Logger;

  constructor(options: RootwareDatabaseOptions) {
    this.#driver = options.driver;
    this.dialect = options.dialect;
    this.#logger = options.logger;
  }

  async execute<T = unknown>(query: Sql): Promise<OrmQueryResult<T>> {
    return await this.#run<T>("execute", query, async (rendered) => {
      const result = await this.#driver.execute(rendered);
      return result as OrmQueryResult<T>;
    });
  }

  async query<T = unknown>(query: Sql): Promise<OrmQueryResult<T>> {
    return await this.#run<T>(
      "query",
      query,
      (rendered) => this.#driver.query<T>(rendered),
    );
  }

  select(): SelectBuilder<unknown, unknown> {
    return new RootwareSelectBuilder(this);
  }

  insert<TTable extends TableDefinition>(
    table: TTable,
  ): InsertBuilder<TTable> {
    assertTable(table);
    return new RootwareInsertBuilder(this, table);
  }

  update<TTable extends TableDefinition>(
    table: TTable,
  ): UpdateBuilder<TTable> {
    assertTable(table);
    return new RootwareUpdateBuilder(this, table);
  }

  delete<TTable extends TableDefinition>(
    table: TTable,
  ): DeleteBuilder<TTable> {
    assertTable(table);
    return new RootwareDeleteBuilder(this, table);
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    try {
      if (this.#driver.transaction === undefined) {
        return await fn(this);
      }

      return await this.#driver.transaction(async (tx) => {
        const transactionDatabase = new RootwareDatabase({
          driver: transactionToDriver(tx),
          dialect: this.dialect,
          logger: this.#logger,
        });

        return await fn(transactionDatabase);
      });
    } catch (error) {
      throw new OrmError("ORM transaction failed", {
        code: "ORM_TRANSACTION_FAILED",
        cause: error,
      });
    }
  }

  async close(): Promise<void> {
    await this.#driver.close?.();
  }

  async #run<T>(
    operation: "query" | "execute",
    query: Sql,
    run: (rendered: SqlQuery) => Promise<OrmQueryResult<T>>,
  ): Promise<OrmQueryResult<T>> {
    const rendered = renderSql(query, { dialect: this.dialect });
    const startedAt = performance.now();

    this.#debug({ sql: rendered.text }, "orm query started");

    try {
      const result = await run(rendered);
      this.#debug(
        {
          rowCount: result.rowCount ?? result.rows.length,
          durationMs: elapsedMs(startedAt),
        },
        "orm query completed",
      );
      return result;
    } catch (error) {
      this.#error({ sql: rendered.text }, "orm query failed");
      throw new OrmError(`ORM ${operation} failed`, {
        code: "ORM_EXECUTE_FAILED",
        details: { sql: rendered.text },
        cause: error,
      });
    }
  }

  #debug(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.debug(record, message);
    } catch {
      // Logging must not break queries.
    }
  }

  #error(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.error(record, message);
    } catch {
      // Logging must not break queries.
    }
  }
}

class RootwareSelectBuilder<TTable, TResult>
  implements SelectBuilder<TTable, TResult> {
  readonly #database: Database;
  readonly #table?: TableDefinition;
  readonly #condition?: Condition;
  readonly #order?: {
    readonly column: unknown;
    readonly direction: "asc" | "desc";
  };
  readonly #limit?: number;
  readonly #offset?: number;

  constructor(
    database: Database,
    state: {
      readonly table?: TableDefinition;
      readonly condition?: Condition;
      readonly order?: {
        readonly column: unknown;
        readonly direction: "asc" | "desc";
      };
      readonly limit?: number;
      readonly offset?: number;
    } = {},
  ) {
    this.#database = database;
    this.#table = state.table;
    this.#condition = state.condition;
    this.#order = state.order;
    this.#limit = state.limit;
    this.#offset = state.offset;
  }

  from<TNewTable extends TableDefinition>(
    table: TNewTable,
  ): SelectBuilder<TNewTable, InferSelect<TNewTable>> {
    assertTable(table);
    return new RootwareSelectBuilder<TNewTable, InferSelect<TNewTable>>(
      this.#database,
      {
        table,
        condition: this.#condition,
        order: this.#order,
        limit: this.#limit,
        offset: this.#offset,
      },
    );
  }

  where(condition: Condition): SelectBuilder<TTable, TResult> {
    assertCondition(condition);
    return new RootwareSelectBuilder<TTable, TResult>(this.#database, {
      table: this.#table,
      condition,
      order: this.#order,
      limit: this.#limit,
      offset: this.#offset,
    });
  }

  orderBy(
    column: unknown,
    direction: "asc" | "desc" = "asc",
  ): SelectBuilder<TTable, TResult> {
    const normalizedDirection = normalizeOrderDirection(direction);

    return new RootwareSelectBuilder<TTable, TResult>(this.#database, {
      table: this.#table,
      condition: this.#condition,
      order: { column, direction: normalizedDirection },
      limit: this.#limit,
      offset: this.#offset,
    });
  }

  limit(count: number): SelectBuilder<TTable, TResult> {
    return new RootwareSelectBuilder<TTable, TResult>(this.#database, {
      table: this.#table,
      condition: this.#condition,
      order: this.#order,
      limit: normalizePositiveInteger(count, "limit"),
      offset: this.#offset,
    });
  }

  offset(count: number): SelectBuilder<TTable, TResult> {
    return new RootwareSelectBuilder<TTable, TResult>(this.#database, {
      table: this.#table,
      condition: this.#condition,
      order: this.#order,
      limit: this.#limit,
      offset: normalizeNonNegativeInteger(count, "offset"),
    });
  }

  toSql(): Sql {
    if (this.#table === undefined) {
      throw new OrmError("Select query requires a table", {
        code: "ORM_INVALID_QUERY",
      });
    }

    const parts: Sql[] = [
      raw("select * from "),
      identifier(this.#table.name),
    ];

    if (this.#condition !== undefined) {
      parts.push(raw(" where "), this.#condition.sql);
    }

    if (this.#order !== undefined) {
      parts.push(
        raw(" order by "),
        columnToSql(this.#order.column),
        raw(` ${this.#order.direction}`),
      );
    }

    if (this.#limit !== undefined) {
      parts.push(raw(" limit "), paramSql(this.#limit));
    }

    if (this.#offset !== undefined) {
      parts.push(raw(" offset "), paramSql(this.#offset));
    }

    return joinSql(parts, emptySql());
  }

  async execute(): Promise<TResult[]> {
    const result = await this.#database.query<TResult>(this.toSql());
    return result.rows;
  }
}

class RootwareInsertBuilder<TTable extends TableDefinition>
  implements InsertBuilder<TTable> {
  readonly #database: Database;
  readonly #table: TTable;
  readonly #rows?: Array<InferInsert<TTable>>;
  readonly #returning: boolean;

  constructor(
    database: Database,
    table: TTable,
    rows?: Array<InferInsert<TTable>>,
    returning = false,
  ) {
    this.#database = database;
    this.#table = table;
    this.#rows = rows;
    this.#returning = returning;
  }

  values(
    value: InferInsert<TTable> | InferInsert<TTable>[],
  ): InsertBuilder<TTable> {
    const rows = Array.isArray(value) ? value : [value];

    if (rows.length === 0) {
      throw new OrmError("Insert values cannot be empty", {
        code: "ORM_INVALID_QUERY",
      });
    }

    return new RootwareInsertBuilder(
      this.#database,
      this.#table,
      rows.map((row) => ({ ...row })),
      this.#returning,
    );
  }

  returning(): InsertBuilder<TTable> {
    return new RootwareInsertBuilder(
      this.#database,
      this.#table,
      this.#rows,
      true,
    );
  }

  toSql(): Sql {
    if (this.#rows === undefined || this.#rows.length === 0) {
      throw new OrmError("Insert query requires values", {
        code: "ORM_INVALID_QUERY",
      });
    }

    const columnNames = getInsertColumnNames(this.#table, this.#rows);

    if (columnNames.length === 0) {
      throw new OrmError("Insert query has no columns", {
        code: "ORM_INVALID_QUERY",
      });
    }

    const columnSql = joinSql(columnNames.map((name) => identifier(name)));
    const valuesSql = joinSql(
      this.#rows.map((row) =>
        sql`(${
          joinSql(
            columnNames.map((name) =>
              paramSql((row as Record<string, unknown>)[name])
            ),
          )
        })`
      ),
    );
    const parts = [
      raw("insert into "),
      identifier(this.#table.name),
      raw(" ("),
      columnSql,
      raw(") values "),
      valuesSql,
    ];

    if (this.#returning) {
      parts.push(raw(" returning *"));
    }

    return joinSql(parts, emptySql());
  }

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>> {
    return this.#database.execute<InferSelect<TTable>>(this.toSql());
  }
}

class RootwareUpdateBuilder<TTable extends TableDefinition>
  implements UpdateBuilder<TTable> {
  readonly #database: Database;
  readonly #table: TTable;
  readonly #values?: Partial<InferInsert<TTable>>;
  readonly #condition?: Condition;
  readonly #returning: boolean;

  constructor(
    database: Database,
    table: TTable,
    values?: Partial<InferInsert<TTable>>,
    condition?: Condition,
    returning = false,
  ) {
    this.#database = database;
    this.#table = table;
    this.#values = values;
    this.#condition = condition;
    this.#returning = returning;
  }

  set(values: Partial<InferInsert<TTable>>): UpdateBuilder<TTable> {
    return new RootwareUpdateBuilder(
      this.#database,
      this.#table,
      { ...values },
      this.#condition,
      this.#returning,
    );
  }

  where(condition: Condition): UpdateBuilder<TTable> {
    assertCondition(condition);
    return new RootwareUpdateBuilder(
      this.#database,
      this.#table,
      this.#values,
      condition,
      this.#returning,
    );
  }

  returning(): UpdateBuilder<TTable> {
    return new RootwareUpdateBuilder(
      this.#database,
      this.#table,
      this.#values,
      this.#condition,
      true,
    );
  }

  toSql(): Sql {
    if (this.#values === undefined) {
      throw new OrmError("Update query requires set values", {
        code: "ORM_INVALID_QUERY",
      });
    }

    const entries = getDefinedEntries(this.#table, this.#values);

    if (entries.length === 0) {
      throw new OrmError("Update query has no set values", {
        code: "ORM_INVALID_QUERY",
      });
    }

    const setSql = joinSql(
      entries.map(([name, value]) => sql`${identifier(name)} = ${value}`),
    );
    const parts = [
      raw("update "),
      identifier(this.#table.name),
      raw(" set "),
      setSql,
    ];

    // TODO: add opt-in full-table update protection in a future version.
    if (this.#condition !== undefined) {
      parts.push(raw(" where "), this.#condition.sql);
    }

    if (this.#returning) {
      parts.push(raw(" returning *"));
    }

    return joinSql(parts, emptySql());
  }

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>> {
    return this.#database.execute<InferSelect<TTable>>(this.toSql());
  }
}

class RootwareDeleteBuilder<TTable extends TableDefinition>
  implements DeleteBuilder<TTable> {
  readonly #database: Database;
  readonly #table: TTable;
  readonly #condition?: Condition;
  readonly #returning: boolean;

  constructor(
    database: Database,
    table: TTable,
    condition?: Condition,
    returning = false,
  ) {
    this.#database = database;
    this.#table = table;
    this.#condition = condition;
    this.#returning = returning;
  }

  where(condition: Condition): DeleteBuilder<TTable> {
    assertCondition(condition);
    return new RootwareDeleteBuilder(
      this.#database,
      this.#table,
      condition,
      this.#returning,
    );
  }

  returning(): DeleteBuilder<TTable> {
    return new RootwareDeleteBuilder(
      this.#database,
      this.#table,
      this.#condition,
      true,
    );
  }

  toSql(): Sql {
    const parts = [
      raw("delete from "),
      identifier(this.#table.name),
    ];

    // TODO: add opt-in full-table delete protection in a future version.
    if (this.#condition !== undefined) {
      parts.push(raw(" where "), this.#condition.sql);
    }

    if (this.#returning) {
      parts.push(raw(" returning *"));
    }

    return joinSql(parts, emptySql());
  }

  execute(): Promise<OrmQueryResult<InferSelect<TTable>>> {
    return this.#database.execute<InferSelect<TTable>>(this.toSql());
  }
}

function createColumnBuilder<T>(dataType: ColumnDataType): ColumnBuilder<T> {
  return new RootwareColumnBuilder<T, false, false>(
    {
      dataType,
      nullable: false,
      hasDefault: false,
      primaryKey: false,
      unique: false,
    },
    false,
    false,
  );
}

function cloneColumnDefinition<T>(
  definition: ColumnDefinition<T>,
): ColumnDefinition<T> {
  return {
    ...(definition.name === undefined ? {} : { name: definition.name }),
    dataType: definition.dataType,
    nullable: definition.nullable,
    hasDefault: definition.hasDefault,
    primaryKey: definition.primaryKey,
    unique: definition.unique,
    ...(definition.references === undefined ? {} : {
      references: {
        table: definition.references.table,
        column: definition.references.column,
      },
    }),
    ...(definition.defaultValue === undefined
      ? {}
      : { defaultValue: definition.defaultValue }),
  };
}

function isColumnBuilder(value: unknown): value is ColumnBuilder<unknown> {
  return isRecord(value) && isRecord(value.definition) &&
    typeof value.named === "function" &&
    typeof value.notNull === "function";
}

function makeSql(chunks: SqlChunk[]): Sql {
  return Object.freeze({
    kind: "sql",
    chunks: Object.freeze([...chunks]),
  });
}

function paramSql(value: unknown): Sql {
  return makeSql([{ kind: "param", value: serializeSqlValue(value) }]);
}

interface RenderState {
  text: string;
  params: SqlParameter[];
  dialect: SqlDialect;
}

function renderSqlInto(query: Sql, state: RenderState): void {
  for (const chunk of query.chunks) {
    if (chunk.kind === "text" || chunk.kind === "raw") {
      state.text += chunk.value;
      continue;
    }

    if (chunk.kind === "identifier") {
      state.text += quoteIdentifier(chunk.value, state.dialect);
      continue;
    }

    if (chunk.kind === "param") {
      state.params.push(chunk.value);
      state.text += state.dialect === "postgres"
        ? `$${state.params.length}`
        : "?";
      continue;
    }

    renderSqlInto(chunk.value, state);
  }
}

function binaryCondition(
  column: unknown,
  operator: string,
  value: unknown,
): Condition {
  return createCondition(sql`${columnToSql(column)} ${raw(operator)} ${value}`);
}

function createCondition(conditionSql: Sql): Condition {
  return Object.freeze({
    kind: "condition",
    sql: conditionSql,
  });
}

function combineConditions(
  operator: "and" | "or",
  conditions: Array<Condition | null | undefined>,
): Condition {
  const validConditions = conditions.filter((
    condition,
  ): condition is Condition => condition !== undefined && condition !== null);

  if (validConditions.length === 0) {
    throw new OrmError("At least one condition is required", {
      code: "ORM_INVALID_QUERY",
      details: { operator },
    });
  }

  if (validConditions.length === 1) {
    return validConditions[0];
  }

  return createCondition(
    joinSql(
      validConditions.map((condition) => sql`(${condition.sql})`),
      raw(` ${operator} `),
    ),
  );
}

function assertCondition(value: Condition): void {
  if (!isCondition(value)) {
    throw new OrmError("Expected a condition", {
      code: "ORM_INVALID_QUERY",
    });
  }
}

function isCondition(value: unknown): value is Condition {
  return isRecord(value) && value.kind === "condition" && isSql(value.sql);
}

function columnToSql(column: unknown): Sql {
  if (isSql(column)) {
    return column;
  }

  if (isColumn(column)) {
    return identifier(`${column.tableName}.${column.name}`);
  }

  if (typeof column === "string") {
    return identifier(column);
  }

  throw new OrmError("Expected a SQL column", {
    code: "ORM_INVALID_COLUMN",
  });
}

function assertTable(value: unknown): asserts value is TableDefinition {
  if (!isTable(value)) {
    throw new OrmError("Expected a table definition", {
      code: "ORM_INVALID_TABLE",
    });
  }
}

function getInsertColumnNames<TTable extends TableDefinition>(
  table: TTable,
  rows: Array<InferInsert<TTable>>,
): string[] {
  const names = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if ((row as Record<string, unknown>)[key] !== undefined) {
        assertTableColumn(table, key);
        names.add(key);
      }
    }
  }

  return [...names];
}

function getDefinedEntries<TTable extends TableDefinition>(
  table: TTable,
  values: Partial<InferInsert<TTable>>,
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];

  for (
    const [key, value] of Object.entries(values as Record<string, unknown>)
  ) {
    if (value === undefined) {
      continue;
    }

    assertTableColumn(table, key);
    entries.push([key, value]);
  }

  return entries;
}

function assertTableColumn(table: TableDefinition, key: string): void {
  if (!Object.hasOwn(table.columns, key)) {
    throw new OrmError("Unknown table column", {
      code: "ORM_INVALID_COLUMN",
      details: { table: table.name, column: key },
    });
  }
}

function normalizeOrderDirection(direction: "asc" | "desc"): "asc" | "desc" {
  if (direction !== "asc" && direction !== "desc") {
    throw new OrmError("Invalid order direction", {
      code: "ORM_INVALID_QUERY",
      details: { direction },
    });
  }

  return direction;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OrmError(`${field} must be greater than zero`, {
      code: "ORM_INVALID_QUERY",
      details: { field },
    });
  }

  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new OrmError(`${field} must be zero or greater`, {
      code: "ORM_INVALID_QUERY",
      details: { field },
    });
  }

  return Math.floor(value);
}

function validateIdentifierPath(
  name: string,
  code: OrmErrorCode,
): string {
  if (typeof name !== "string") {
    throw new OrmError("Identifier must be a string", { code });
  }

  const normalized = name.trim();

  if (
    normalized.length === 0 ||
    normalized.startsWith(".") ||
    normalized.endsWith(".") ||
    normalized.includes("..") ||
    hasControlCharacter(normalized) ||
    normalized.includes('"') ||
    normalized.includes("`")
  ) {
    throw new OrmError("Identifier is invalid", {
      code,
      details: { name },
    });
  }

  for (const part of normalized.split(".")) {
    if (!isValidIdentifierPart(part)) {
      throw new OrmError("Identifier is invalid", {
        code,
        details: { name },
      });
    }
  }

  return normalized;
}

function isValidIdentifierPart(value: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(value);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneSqlQuery(query: SqlQuery): SqlQuery {
  return {
    text: query.text,
    params: [...query.params],
  };
}

function transactionToDriver(transaction: OrmTransaction): OrmDriver {
  return {
    query<T = unknown>(query: SqlQuery): Promise<OrmQueryResult<T>> {
      return transaction.query<T>(query);
    },

    execute(query: SqlQuery): Promise<OrmQueryResult> {
      return transaction.execute(query);
    },
  };
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}

// Examples:
//
// const users = defineTable("users", {
//   id: columns.text().primaryKey(),
//   name: columns.text().notNull(),
//   email: columns.text().notNull().unique(),
//   age: columns.integer().optional(),
//   createdAt: columns.timestamp().default(() => new Date()),
// });
//
// type User = InferSelect<typeof users>;
// type NewUser = InferInsert<typeof users>;
//
// const db = createDatabase({
//   driver: noopOrmDriver(),
// });
//
// const rows = await db
//   .select()
//   .from(users)
//   .where(eq(users.columns.id, "u_123"))
//   .limit(1)
//   .execute();
//
// await db.insert(users).values({
//   id: "u_123",
//   name: "Lucas",
//   email: "lucas@example.com",
//   createdAt: new Date(),
// }).execute();
//
// await db.update(users)
//   .set({ name: "Lucas Vieira" })
//   .where(eq(users.columns.id, "u_123"))
//   .execute();
//
// await db.delete(users)
//   .where(eq(users.columns.id, "u_123"))
//   .execute();
//
// await db.execute(sql`
//   select *
//   from users
//   where id = ${"u_123"}
// `);
//
// await db.transaction(async (tx) => {
//   await tx.insert(users).values({
//     id: "u_456",
//     name: "Ana",
//     email: "ana@example.com",
//     createdAt: new Date(),
//   }).execute();
// });
