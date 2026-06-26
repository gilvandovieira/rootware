import { OrmError } from "../core/mod.ts";

import { toLibsqlOrmError } from "./errors.ts";
import type {
  LibsqlLikeClient,
  LibsqlLikeTransaction,
  LibsqlResultSet,
} from "./database.ts";

/** Rows and affected-row count returned by a libSQL executor. */
export interface LibsqlQueryResult<Row = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount: number;
}

/** Minimal SQL executor used by the libSQL ORM adapter. */
export interface LibsqlSqlExecutor {
  execute<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<LibsqlQueryResult<Row>>;

  transaction?<T>(fn: () => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

/** Options for creating a libSQL SQL executor. */
export interface LibsqlExecutorOptions {
  readonly executor?: LibsqlSqlExecutor;
  readonly client?: LibsqlLikeClient;
  readonly ownsClient?: boolean;
}

/** Creates a libSQL SQL executor from an existing executor or open client. */
export function createLibsqlExecutor(
  options: LibsqlExecutorOptions = {},
): LibsqlSqlExecutor {
  if (options.executor !== undefined) {
    return options.executor;
  }

  if (options.client === undefined) {
    throw new OrmError("libSQL client is required", {
      code: "ORM_DRIVER_MISSING",
      status: 400,
    });
  }

  return new RootwareLibsqlExecutor(
    options.client,
    options.ownsClient ?? false,
  );
}

function toQueryResult<Row>(result: LibsqlResultSet): LibsqlQueryResult<Row> {
  // A SELECT reports its count via `rows.length`; a write reports `rowsAffected`.
  const rowCount = result.rows.length > 0
    ? result.rows.length
    : result.rowsAffected;
  return { rows: result.rows as Row[], rowCount };
}

class RootwareLibsqlExecutor implements LibsqlSqlExecutor {
  readonly #client: LibsqlLikeClient;
  readonly #ownsClient: boolean;
  #tx?: LibsqlLikeTransaction;
  #closed = false;

  constructor(client: LibsqlLikeClient, ownsClient: boolean) {
    this.#client = client;
    this.#ownsClient = ownsClient;
  }

  async execute<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<LibsqlQueryResult<Row>> {
    try {
      const statement = { sql, args: params };
      const result = this.#tx !== undefined
        ? await this.#tx.execute(statement)
        : await this.#client.execute(statement);
      return toQueryResult<Row>(result);
    } catch (error) {
      throw toLibsqlOrmError(error, "libSQL query failed", {
        code: "ORM_EXECUTE_FAILED",
        sql,
      });
    }
  }

  // libSQL over HTTP is autocommit per request, so a multi-statement transaction
  // must use the interactive `transaction()` handle.
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#tx !== undefined) {
      return await fn();
    }

    const tx = await this.#client.transaction("write");
    this.#tx = tx;

    try {
      const result = await fn();
      await tx.commit();
      return result;
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // Preserve the original query/transaction failure.
      }
      throw error;
    } finally {
      this.#tx = undefined;
      await tx.close?.();
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;

    if (this.#ownsClient) {
      await this.#client.close();
    }
  }
}
