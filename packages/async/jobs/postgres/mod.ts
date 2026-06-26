/**
 * PostgreSQL durable job store for `@rootware/jobs`.
 *
 * The concrete `DurableJobStore` over PostgreSQL: atomic `FOR UPDATE SKIP
 * LOCKED` claims with a visibility lease, `heartbeat`, and `reclaimExpired`
 * crash recovery, plus `ensureJobsTable` and the pure row-mapping helpers.
 *
 * @module
 */

export type { PostgresJobStoreOptions } from "./store.ts";
export {
  createPostgresJobStore,
  ensureJobsTable,
  JOB_COLUMNS,
  jobToParams,
  rowToJobRecord,
} from "./store.ts";

export type {
  PgClient,
  PgConnectionOptions,
  PgDriverResult,
  PgPool,
} from "./pool.ts";
export { createPgPool } from "./pool.ts";
