/** A libSQL result set (rows plus affected-row count). */
export interface LibsqlResultSet {
  readonly rows: Record<string, unknown>[];
  readonly rowsAffected: number;
}

/** A single libSQL statement (`?`-placeholder SQL plus positional args). */
export interface LibsqlStatement {
  readonly sql: string;
  readonly args?: readonly unknown[];
}

/** An interactive libSQL transaction (required: HTTP requests are autocommit). */
export interface LibsqlLikeTransaction {
  execute(statement: LibsqlStatement): Promise<LibsqlResultSet>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close?(): void | Promise<void>;
}

/**
 * Minimal libSQL client surface used by the migration adapter. The bundled
 * `@libsql/client` `Client` satisfies it structurally, and tests inject a fake.
 */
export interface LibsqlLikeClient {
  execute(statement: LibsqlStatement): Promise<LibsqlResultSet>;
  transaction(mode?: string): Promise<LibsqlLikeTransaction>;
  close(): void | Promise<void>;
}

/** Options for connecting to a libSQL/Turso database. */
export interface LibsqlConnectionOptions {
  /** Database URL (`libsql://…`, `https://…`, or `file:…`). */
  readonly url?: string;
  /** Auth token for hosted databases (Turso). */
  readonly authToken?: string;
  /** An already-open libSQL client to use instead of creating one. */
  readonly client?: LibsqlLikeClient;
}

/**
 * Opens a libSQL client with the bundled `@libsql/client` driver, imported
 * lazily so the package's fake-backed tests pull in no npm dependency; only a
 * real connect needs `--allow-net`/`--allow-env`.
 */
export async function openLibsqlClient(
  options: LibsqlConnectionOptions = {},
): Promise<LibsqlLikeClient> {
  if (options.client !== undefined) {
    return options.client;
  }

  if (options.url === undefined || options.url.trim().length === 0) {
    throw new Error("libSQL connection url is required");
  }

  // deno-lint-ignore no-import-prefix
  const { createClient } = await import("npm:@libsql/client@^0.15");

  return createClient({
    url: options.url,
    ...(options.authToken === undefined
      ? {}
      : { authToken: options.authToken }),
  }) as unknown as LibsqlLikeClient;
}
