import { MigrationError } from "../core/mod.ts";

import { toLibsqlMigrationError } from "./errors.ts";
import type {
  LibsqlLikeClient,
  LibsqlLikeTransaction,
  LibsqlResultSet,
} from "./database.ts";

/** Rows and affected-row count returned by a libSQL migration executor. */
export interface QueryResult<Row = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount: number;
}

/** Minimal SQL executor used by the libSQL migration adapter. */
export interface SqlExecutor {
  execute<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<Row>>;

  transaction?<T>(fn: () => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

/** Options for creating a libSQL SQL executor. */
export interface LibsqlExecutorOptions {
  readonly executor?: SqlExecutor;
  readonly client?: LibsqlLikeClient;
  readonly ownsClient?: boolean;
}

/** Creates a libSQL SQL executor from an existing executor or open client. */
export function createLibsqlExecutor(
  options: LibsqlExecutorOptions = {},
): SqlExecutor {
  if (options.executor !== undefined) {
    return options.executor;
  }

  if (options.client === undefined) {
    throw new MigrationError("libSQL client is required", {
      code: "MIGRATION_INVALID",
      status: 400,
    });
  }

  return new RootwareLibsqlExecutor(
    options.client,
    options.ownsClient ?? false,
  );
}

function toQueryResult<Row>(result: LibsqlResultSet): QueryResult<Row> {
  const rowCount = result.rows.length > 0
    ? result.rows.length
    : result.rowsAffected;
  return { rows: result.rows as Row[], rowCount };
}

class RootwareLibsqlExecutor implements SqlExecutor {
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
  ): Promise<QueryResult<Row>> {
    try {
      const statement = { sql, args: params };
      const result = this.#tx !== undefined
        ? await this.#tx.execute(statement)
        : await this.#client.execute(statement);
      return toQueryResult<Row>(result);
    } catch (error) {
      throw toLibsqlMigrationError(error, "libSQL query failed", {
        code: "MIGRATION_EXECUTE_FAILED",
        sql,
      });
    }
  }

  // libSQL over HTTP is autocommit per request, so a multi-statement migration
  // must run through the interactive `transaction()` handle.
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
        // Preserve the original migration failure.
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
