import { assert, assertEquals } from "@std/assert";
import * as jobsRoot from "@rootware/jobs";
import { createJobRecord } from "@rootware/jobs";
import {
  createPostgresJobStore,
  ensureJobsTable,
  JOB_COLUMNS,
  jobToParams,
  type PgClient,
  rowToJobRecord,
} from "@rootware/jobs/postgres";

class FakePgClient implements PgClient {
  readonly queries: Array<{ sql: string; args: unknown[] }> = [];
  rows: Array<Record<string, unknown>> = [];
  rowCount?: number;

  queryObject<Row = Record<string, unknown>>(
    sql: string,
    args: unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount?: number }> {
    this.queries.push({ sql, args: [...args] });
    return Promise.resolve({
      rows: this.rows as Row[],
      rowCount: this.rowCount ?? this.rows.length,
    });
  }
}

Deno.test("@rootware/jobs/postgres - rowToJobRecord and jobToParams round-trip the record", () => {
  const job = createJobRecord("email:welcome", { userId: "u_1" }, {
    id: "job_1",
    now: 0,
    delayMs: 0,
    attempts: 3,
    priority: "high",
    metadata: { source: "test" },
    idempotencyKey: "welcome:u_1",
  });

  const params = jobToParams(job);
  // 21 positional params, one per persisted column.
  assertEquals(params.length, JOB_COLUMNS.length);

  // Simulate a Postgres row (jsonb decoded to objects, timestamps as Date).
  const row = {
    id: "job_1",
    queue: job.queue,
    name: "email:welcome",
    status: "queued",
    priority: "high",
    payload: { userId: "u_1" },
    output: null,
    metadata: { source: "test" },
    attempts: 0,
    max_attempts: 3,
    backoff_ms: job.backoffMs,
    max_backoff_ms: job.maxBackoffMs,
    backoff_strategy: job.backoffStrategy,
    created_at: new Date("1970-01-01T00:00:00.000Z"),
    updated_at: new Date("1970-01-01T00:00:00.000Z"),
    run_at: new Date("1970-01-01T00:00:00.000Z"),
    started_at: null,
    finished_at: null,
    attempt_history: [],
    error: null,
    idempotency_key: "welcome:u_1",
  };

  const decoded = rowToJobRecord(row);
  assertEquals(decoded.id, "job_1");
  assertEquals(decoded.name, "email:welcome");
  assertEquals(decoded.payload, { userId: "u_1" });
  assertEquals(decoded.priority, "high");
  assertEquals(decoded.maxAttempts, 3);
  assertEquals(decoded.idempotencyKey, "welcome:u_1");
  assertEquals(decoded.timestamps.runAt, "1970-01-01T00:00:00.000Z");
});

Deno.test("@rootware/jobs/postgres - claim issues FOR UPDATE SKIP LOCKED with a lease", async () => {
  const client = new FakePgClient();
  const store = createPostgresJobStore({ client, tableName: "rootware_jobs" });

  client.rows = [];
  const claimed = await store.claimNext({
    workerId: "worker-1",
    leaseMs: 5_000,
    queue: "default",
  });
  assertEquals(claimed, undefined);

  const sql = client.queries.at(-1)!.sql;
  assert(sql.toLowerCase().includes("for update skip locked"));
  assert(sql.includes("lease_expires_at"));
  // worker id, lease ms, queue, names — four params.
  assertEquals(client.queries.at(-1)!.args, [
    "worker-1",
    "5000",
    "default",
    null,
  ]);
});

Deno.test("@rootware/jobs/postgres - heartbeat and reclaim issue the right SQL", async () => {
  const client = new FakePgClient();
  const store = createPostgresJobStore({ client });

  client.rows = [];
  client.rowCount = 1;
  assertEquals(await store.heartbeat("job_1", 5_000), true);
  assert(client.queries.at(-1)!.sql.includes("lease_expires_at > now()"));

  client.rows = [];
  client.rowCount = 0;
  const reclaimed = await store.reclaimExpired({ queue: "default" });
  assertEquals(reclaimed, []);
  assert(
    client.queries.at(-1)!.sql.includes("lease_expires_at < now()"),
  );
});

Deno.test("@rootware/jobs/postgres - ensureJobsTable applies CREATE TABLE + indexes", async () => {
  const client = new FakePgClient();
  await ensureJobsTable({ client });

  const sqls = client.queries.map((q) => q.sql.toLowerCase());
  assert(sqls.some((sql) => sql.includes("create table if not exists")));
  assert(sqls.some((sql) => sql.includes("_claim_idx")));
  assert(sqls.some((sql) => sql.includes("_idempotency_idx")));
});

Deno.test("@rootware/jobs - root import does not expose Postgres exports", () => {
  assertEquals("createPostgresJobStore" in jobsRoot, false);
});
