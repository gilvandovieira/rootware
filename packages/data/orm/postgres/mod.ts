import type { Logger } from "@rootware/log";

import {
  createDatabase,
  type Database,
  type OrmQueryResult,
  type SqlInput,
  type SqlParameter,
} from "../core/mod.ts";

import { POSTGRES_DIALECT } from "./dialect.ts";
import { createPgOrmDriver, type PgOrmDriverOptions } from "./driver.ts";

export type { PgQueryResult, PgSqlExecutor } from "./executor.ts";
export { createPgExecutor } from "./executor.ts";
export { createPgOrmDriver } from "./driver.ts";
export type { PgClient, PgConnectionOptions, PgPool } from "./pool.ts";
export { createPgPool } from "./pool.ts";

export interface PgDatabase extends Database {
  execute<T = unknown>(
    query: SqlInput,
    params?: readonly SqlParameter[],
  ): Promise<OrmQueryResult<T>>;

  query<T = unknown>(
    query: SqlInput,
    params?: readonly SqlParameter[],
  ): Promise<OrmQueryResult<T>>;
}

export interface CreatePgDbOptions extends PgOrmDriverOptions {
  readonly logger?: Logger;
}

export function createPgDb(
  options: CreatePgDbOptions,
): Promise<PgDatabase> {
  const driver = createPgOrmDriver(options);

  return Promise.resolve(
    createDatabase({
      driver,
      dialect: POSTGRES_DIALECT,
      logger: options.logger,
    }) as PgDatabase,
  );
}
