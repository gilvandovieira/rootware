import {
  DEFAULT_JOBS_TABLE,
  type DurableJobStore,
  type JobClaimOptions,
  type JobId,
  type JobListOptions,
  type JobListResult,
  type JobReclaimOptions,
  type JobRecord,
  jobsTableDdl,
} from "../mod.ts";

import { toPostgresJobError } from "./errors.ts";
import {
  type PgClient,
  type PgConnectionOptions,
  type PgConnectionSource,
  resolvePgConnectionSource,
} from "./pool.ts";

/** Options for creating a PostgreSQL-backed durable job store. */
export interface PostgresJobStoreOptions extends PgConnectionOptions {
  /** Table name; defaults to `rootware_jobs`. */
  readonly tableName?: string;
  /** Default lease (visibility timeout) in ms for `claimNext`. Defaults to 30s. */
  readonly defaultLeaseMs?: number;
}

const DEFAULT_LEASE_MS = 30_000;

/**
 * Creates a {@link DurableJobStore} backed by PostgreSQL. Claims are atomic via
 * `... FOR UPDATE SKIP LOCKED`, so many workers can pull from the same queue
 * safely; crashed workers' expired leases are recovered with `reclaimExpired`.
 * Run {@link ensureJobsTable} (or apply `jobsTableDdl`) once before use.
 */
export function createPostgresJobStore(
  options: PostgresJobStoreOptions = {},
): DurableJobStore {
  const source = resolvePgConnectionSource(options);
  const table = quoteIdent(options.tableName ?? DEFAULT_JOBS_TABLE);
  const defaultLeaseMs = options.defaultLeaseMs ?? DEFAULT_LEASE_MS;

  const run = <Row = Record<string, unknown>>(
    sql: string,
    args: readonly unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount: number }> =>
    withClient(source, async (client) => {
      try {
        const result = await client.queryObject<Row>(sql, [...args]);
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? result.rows.length,
        };
      } catch (error) {
        throw toPostgresJobError(error, "PostgreSQL job query failed", {
          code: "JOB_STORE_FAILED",
          sql,
        });
      }
    });

  const columns = JOB_COLUMNS.join(", ");

  return {
    async enqueue(job: JobRecord): Promise<JobRecord> {
      await run(upsertSql(table), jobToParams(job));
      return job;
    },

    async get(id: JobId): Promise<JobRecord | undefined> {
      const result = await run<JobRow>(
        `select ${columns} from ${table} where id = $1 limit 1`,
        [id],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : rowToJobRecord(row);
    },

    async update(job: JobRecord): Promise<void> {
      await run(upsertSql(table), jobToParams(job));
    },

    async delete(id: JobId): Promise<boolean> {
      const result = await run(`delete from ${table} where id = $1`, [id]);
      return result.rowCount > 0;
    },

    async claimNext(
      options: JobClaimOptions = {},
    ): Promise<JobRecord | undefined> {
      const leaseMs = options.leaseMs ?? defaultLeaseMs;
      const names = options.names === undefined || options.names.length === 0
        ? null
        : options.names;
      const result = await run<JobRow>(claimSql(table, columns), [
        options.workerId ?? null,
        String(leaseMs),
        options.queue ?? null,
        names,
      ]);
      const row = result.rows[0];
      return row === undefined ? undefined : rowToJobRecord(row);
    },

    async heartbeat(
      id: JobId,
      leaseMs: number,
      _now?: Date | string | number,
    ): Promise<boolean> {
      const result = await run(
        `update ${table} set
           lease_expires_at = now() + ($2::text || ' milliseconds')::interval,
           updated_at = now()
         where id = $1 and status = 'running'
           and lease_expires_at is not null and lease_expires_at > now()
         returning id`,
        [id, String(leaseMs)],
      );
      return result.rowCount > 0;
    },

    async reclaimExpired(
      options: JobReclaimOptions = {},
    ): Promise<JobRecord[]> {
      const result = await run<JobRow>(reclaimSql(table, columns), [
        options.queue ?? null,
        options.limit ?? null,
      ]);
      return result.rows.map(rowToJobRecord);
    },

    async list(options: JobListOptions = {}): Promise<JobListResult> {
      const limit = options.limit ?? 100;
      const result = await run<JobRow>(listSql(table, columns), [
        options.queue ?? null,
        options.name ?? null,
        options.status ?? null,
        options.cursor ?? null,
        limit + 1,
      ]);
      const jobs = result.rows.slice(0, limit).map(rowToJobRecord);
      const hasMore = result.rows.length > limit;
      const cursor = hasMore ? jobs[jobs.length - 1]?.id : undefined;
      return {
        jobs,
        ...(cursor === undefined ? {} : { cursor }),
        hasMore,
      };
    },

    async findByIdempotencyKey(key: string): Promise<JobRecord | undefined> {
      const result = await run<JobRow>(
        `select ${columns} from ${table} where idempotency_key = $1 limit 1`,
        [key],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : rowToJobRecord(row);
    },

    async clear(): Promise<void> {
      await run(`delete from ${table}`);
    },

    async close(): Promise<void> {
      if (source.ownsPool && source.pool?.end !== undefined) {
        await source.pool.end();
      }
      if (source.ownsClient && source.client?.end !== undefined) {
        await source.client.end();
      }
    },
  };
}

/** Creates the durable job table and indexes if they do not exist. */
export async function ensureJobsTable(
  options: PostgresJobStoreOptions = {},
): Promise<void> {
  const source = resolvePgConnectionSource(options);
  const ddl = jobsTableDdl({
    dialect: "postgres",
    tableName: options.tableName,
  });

  await withClient(source, async (client) => {
    for (const statement of ddl.statements) {
      await client.queryObject(statement);
    }
  });

  if (source.ownsPool && source.pool?.end !== undefined) {
    await source.pool.end();
  }
  if (source.ownsClient && source.client?.end !== undefined) {
    await source.client.end();
  }
}

// --- Pure row mapping (exported for tests) ---

/** Snake_case columns persisted for a job, in a stable order. */
export const JOB_COLUMNS: readonly string[] = Object.freeze([
  "id",
  "queue",
  "name",
  "status",
  "priority",
  "payload",
  "output",
  "metadata",
  "attempts",
  "max_attempts",
  "backoff_ms",
  "max_backoff_ms",
  "backoff_strategy",
  "created_at",
  "updated_at",
  "run_at",
  "started_at",
  "finished_at",
  "attempt_history",
  "error",
  "idempotency_key",
]);

interface JobRow {
  readonly id: string;
  readonly queue: string;
  readonly name: string;
  readonly status: string;
  readonly priority: string;
  readonly payload: unknown;
  readonly output: unknown;
  readonly metadata: unknown;
  readonly attempts: number | string;
  readonly max_attempts: number | string;
  readonly backoff_ms: number | string;
  readonly max_backoff_ms: number | string;
  readonly backoff_strategy: string;
  readonly created_at: unknown;
  readonly updated_at: unknown;
  readonly run_at: unknown;
  readonly started_at?: unknown;
  readonly finished_at?: unknown;
  readonly attempt_history: unknown;
  readonly error?: unknown;
  readonly idempotency_key?: unknown;
}

/** Maps a database row to a {@link JobRecord}. */
export function rowToJobRecord(row: JobRow): JobRecord {
  const startedAt = toIso(row.started_at);
  const finishedAt = toIso(row.finished_at);
  const error = asObject(row.error);
  const idempotencyKey = row.idempotency_key;

  return {
    id: String(row.id),
    queue: String(row.queue),
    name: String(row.name),
    status: row.status as JobRecord["status"],
    priority: row.priority as JobRecord["priority"],
    payload: row.payload,
    ...(row.output === null || row.output === undefined
      ? {}
      : { output: row.output }),
    metadata: asObject(row.metadata) ?? {},
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    backoffMs: Number(row.backoff_ms),
    maxBackoffMs: Number(row.max_backoff_ms),
    backoffStrategy: row.backoff_strategy as JobRecord["backoffStrategy"],
    timestamps: {
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
      runAt: toIso(row.run_at) ?? new Date().toISOString(),
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(finishedAt === undefined ? {} : { finishedAt }),
    },
    attemptHistory: (asArray(row.attempt_history) ??
      []) as JobRecord["attemptHistory"],
    ...(error === undefined ? {} : { error }),
    ...(typeof idempotencyKey === "string" ? { idempotencyKey } : {}),
  };
}

/** Maps a {@link JobRecord} to positional upsert params (JSON-encoded columns). */
export function jobToParams(job: JobRecord): unknown[] {
  return [
    job.id,
    job.queue,
    job.name,
    job.status,
    job.priority,
    JSON.stringify(job.payload ?? null),
    job.output === undefined ? null : JSON.stringify(job.output),
    JSON.stringify(job.metadata ?? {}),
    job.attempts,
    job.maxAttempts,
    job.backoffMs,
    job.maxBackoffMs,
    job.backoffStrategy,
    job.timestamps.createdAt,
    job.timestamps.updatedAt,
    job.timestamps.runAt,
    job.timestamps.startedAt ?? null,
    job.timestamps.finishedAt ?? null,
    JSON.stringify(job.attemptHistory ?? []),
    job.error === undefined ? null : JSON.stringify(job.error),
    job.idempotencyKey ?? null,
  ];
}

function upsertSql(table: string): string {
  // $1..$21 map to JOB_COLUMNS; JSON/timestamp columns are cast explicitly.
  const casts: Record<string, string> = {
    payload: "::jsonb",
    output: "::jsonb",
    metadata: "::jsonb",
    attempt_history: "::jsonb",
    error: "::jsonb",
    created_at: "::timestamptz",
    updated_at: "::timestamptz",
    run_at: "::timestamptz",
    started_at: "::timestamptz",
    finished_at: "::timestamptz",
  };
  const values = JOB_COLUMNS
    .map((column, index) => `$${index + 1}${casts[column] ?? ""}`)
    .join(", ");
  const updates = JOB_COLUMNS
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  return `insert into ${table} (${JOB_COLUMNS.join(", ")}, lease_expires_at, ` +
    `locked_by) values (${values}, null, null) ` +
    `on conflict (id) do update set ${updates}, lease_expires_at = null, ` +
    `locked_by = null`;
}

function claimSql(table: string, columns: string): string {
  return `update ${table} j set
      status = 'running',
      locked_by = $1,
      lease_expires_at = now() + ($2::text || ' milliseconds')::interval,
      started_at = coalesce(j.started_at, now()),
      updated_at = now()
    where j.id = (
      select id from ${table}
      where status = 'queued' and run_at <= now()
        and ($3::text is null or queue = $3)
        and ($4::text[] is null or name = any($4))
      order by case priority
        when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3
      end, run_at asc
      for update skip locked
      limit 1
    )
    returning ${prefixColumns("j", columns)}`;
}

function reclaimSql(table: string, columns: string): string {
  return `update ${table} set
      status = 'queued', locked_by = null, lease_expires_at = null,
      updated_at = now()
    where id in (
      select id from ${table}
      where status = 'running' and lease_expires_at is not null
        and lease_expires_at < now()
        and ($1::text is null or queue = $1)
      order by lease_expires_at asc
      limit case when $2::int is null then 1000000 else $2 end
      for update skip locked
    )
    returning ${columns}`;
}

function listSql(table: string, columns: string): string {
  return `select ${columns} from ${table}
    where ($1::text is null or queue = $1)
      and ($2::text is null or name = $2)
      and ($3::text is null or status = $3)
      and ($4::text is null or id > $4)
    order by id asc
    limit $5`;
}

function prefixColumns(alias: string, columns: string): string {
  return columns
    .split(", ")
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

async function withClient<T>(
  source: PgConnectionSource,
  fn: (client: PgClient) => Promise<T>,
): Promise<T> {
  if (source.client !== undefined) {
    return await fn(source.client);
  }

  const client = await source.pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release?.();
  }
}

function quoteIdent(name: string): string {
  return name.trim().split(".").map((part) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
      throw new Error(`Invalid identifier: ${name}`);
    }
    return `"${part}"`;
  }).join(".");
}

function toIso(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return isRecord(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
