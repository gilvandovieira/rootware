/**
 * Public entrypoint for @rootware/orm.
 *
 * TODO: Implement SQL building, adapters, schema mapping, and transactions.
 */

export type SqlPrimitive = string | number | boolean | bigint | null;
export type SqlValue = SqlPrimitive | Date | Uint8Array;

export interface SqlQuery {
  readonly text: string;
  readonly values: readonly SqlValue[];
}

export interface QueryResult<TRow = Record<string, unknown>> {
  readonly rows: readonly TRow[];
  readonly rowCount: number;
}

export interface DatabaseClient {
  query<TRow = Record<string, unknown>>(
    query: SqlQuery,
  ): Promise<QueryResult<TRow>>;
  transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "binary";

export interface ColumnDefinition<T = unknown> {
  readonly name: string;
  readonly type: ColumnType;
  readonly nullable?: boolean;
  readonly default?: T;
}

export interface TableSchema {
  readonly name: string;
  readonly columns: readonly ColumnDefinition[];
}

export interface QueryBuilder<TRow = Record<string, unknown>> {
  select(columns?: readonly string[]): QueryBuilder<TRow>;
  where(condition: SqlQuery): QueryBuilder<TRow>;
  limit(count: number): QueryBuilder<TRow>;
  toQuery(): SqlQuery;
}

export class RootwareOrm implements DatabaseClient {
  query<TRow = Record<string, unknown>>(
    _query: SqlQuery,
  ): Promise<QueryResult<TRow>> {
    throw new Error("Not implemented");
  }

  transaction<T>(_fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    throw new Error("Not implemented");
  }

  table<TRow = Record<string, unknown>>(
    _schema: TableSchema | string,
  ): QueryBuilder<TRow> {
    throw new Error("Not implemented");
  }
}

export function sql(
  _strings: TemplateStringsArray,
  ..._values: SqlValue[]
): SqlQuery {
  throw new Error("Not implemented");
}

export function createOrm(): RootwareOrm {
  throw new Error("Not implemented");
}
