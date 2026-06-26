// deno-lint-ignore no-import-prefix
import { Pool } from "jsr:@db/postgres@^0.19.5";

import { MigrationError } from "../core/mod.ts";

export interface PgDriverResult<Row = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount?: number;
}

export interface PgClient {
  queryObject<Row = Record<string, unknown>>(
    query: string,
    args?: unknown[],
  ): Promise<PgDriverResult<Row>>;

  release?(): void;
  end?(): Promise<void>;
}

export interface PgPool {
  connect(): Promise<PgClient>;
  end?(): Promise<void>;
}

export interface PgConnectionOptions {
  readonly url?: string;
  readonly pool?: PgPool;
  readonly client?: PgClient;
  readonly poolSize?: number;
  readonly lazy?: boolean;
}

export interface PgConnectionSource {
  readonly pool?: PgPool;
  readonly client?: PgClient;
  readonly ownsPool: boolean;
  readonly ownsClient: boolean;
}

export function createPgPool(options: {
  readonly url: string;
  readonly poolSize?: number;
  readonly lazy?: boolean;
}): PgPool {
  return new Pool(options.url, options.poolSize ?? 5, options.lazy ?? true);
}

export function resolvePgConnectionSource(
  options: PgConnectionOptions,
): PgConnectionSource {
  if (options.pool !== undefined && options.client !== undefined) {
    throw new MigrationError(
      "Configure either a PostgreSQL pool or client, not both",
      {
        code: "MIGRATION_INVALID",
        status: 400,
      },
    );
  }

  if (options.pool !== undefined) {
    return {
      pool: options.pool,
      ownsPool: false,
      ownsClient: false,
    };
  }

  if (options.client !== undefined) {
    return {
      client: options.client,
      ownsPool: false,
      ownsClient: false,
    };
  }

  if (options.url === undefined || options.url.trim().length === 0) {
    throw new MigrationError("PostgreSQL connection url is required", {
      code: "MIGRATION_DRIVER_MISSING",
      status: 400,
    });
  }

  return {
    pool: createPgPool({
      url: options.url,
      poolSize: options.poolSize,
      lazy: options.lazy,
    }),
    ownsPool: true,
    ownsClient: false,
  };
}
