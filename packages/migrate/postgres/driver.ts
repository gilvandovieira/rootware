import type { MigrationDriver } from "../core/mod.ts";

import { createPgExecutor, type SqlExecutor } from "./executor.ts";
import { toPgMigrationError } from "./errors.ts";
import type { PgConnectionOptions } from "./pool.ts";

export interface PgMigrationDriverOptions extends PgConnectionOptions {
  readonly executor?: SqlExecutor;
}

export function createPgMigrationDriver(
  options: PgMigrationDriverOptions,
): MigrationDriver {
  const executor = createPgExecutor(options);

  return {
    async execute(sql: string): Promise<void> {
      try {
        await executor.execute(sql);
      } catch (error) {
        throw toPgMigrationError(error, "PostgreSQL query failed", {
          code: "MIGRATION_EXECUTE_FAILED",
          sql,
        });
      }
    },

    transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (executor.transaction === undefined) {
        return fn();
      }

      return executor.transaction(async () => {
        try {
          return await fn();
        } catch (error) {
          throw toPgMigrationError(error, "PostgreSQL query failed", {
            code: "MIGRATION_EXECUTE_FAILED",
          });
        }
      });
    },

    async close(): Promise<void> {
      await executor.close?.();
    },
  };
}
