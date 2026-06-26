import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { RootwareError } from "@rootware/errors";
import {
  calculateBackoffMs,
  calculateNextRunAt,
  createJobAttempt,
  createJobId,
  createJobQueue,
  createJobRecord,
  cronMatches,
  DEFAULT_JOBS_TABLE,
  defineJob,
  defineJobs,
  deserializeJobError,
  isJobReady,
  isRetryableJobStatus,
  isTerminalJobStatus,
  JOB_TABLE_COLUMNS,
  JobError,
  jobsTableDdl,
  memoryJobStore,
  nextCronRun,
  nextRecurrenceAt,
  noopJobQueue,
  noopJobStore,
  normalizeJobName,
  normalizeQueueName,
  parseCronExpression,
  type RecurrenceRule,
  safeJobInfo,
  serializeJobError,
} from "./mod.ts";

Deno.test("@rootware/jobs - definitions ids records attempts and helpers", () => {
  const job = defineJob({
    name: "email:welcome",
    run: (input: { userId: string }) => ({ sent: input.userId }),
    validate: (payload) => payload as { userId: string },
    defaultRetry: { attempts: 3, backoffMs: 10 },
    defaultPriority: "high",
  });

  assertEquals(job.name, "email:welcome");
  assertThrows(() => defineJobs([job, job]), JobError);
  assert(createJobId({ prefix: "job" }).startsWith("job_"));

  const record = createJobRecord("email:welcome", { userId: "u_123" }, {
    now: 0,
    delayMs: 10,
    attempts: 3,
    metadata: { source: "test" },
    idempotencyKey: "welcome:u_123",
  });

  assertEquals(record.status, "queued");
  assertEquals(record.timestamps.runAt, "1970-01-01T00:00:00.010Z");
  assertEquals(
    createJobAttempt({ attempt: 1, startedAt: 0 }).startedAt,
    "1970-01-01T00:00:00.000Z",
  );
  assertEquals(
    calculateBackoffMs(3, { backoffMs: 10, backoffStrategy: "linear" }),
    30,
  );
  assertEquals(calculateBackoffMs(3, { backoffMs: 10, maxBackoffMs: 25 }), 25);
  assertEquals(
    calculateNextRunAt({ ...record, attempts: 2 }, { now: 0 }),
    "1970-01-01T00:00:02.000Z",
  );
  assertEquals(isJobReady(record, 9), false);
  assertEquals(isJobReady(record, 10), true);
  assertEquals(isTerminalJobStatus("succeeded"), true);
  assertEquals(isRetryableJobStatus("dead"), true);
  assertEquals(normalizeJobName("a.b:c-1"), "a.b:c-1");
  assertEquals(normalizeQueueName("default"), "default");
  assertThrows(() => normalizeJobName("bad name"), JobError);
});

Deno.test("@rootware/jobs - error serialization and safe info", () => {
  const record = createJobRecord("job", { secret: "hidden" }, { now: 0 });
  const info = safeJobInfo(record);

  assertEquals(info.name, "job");
  assertEquals("payload" in info, false);
  assertEquals("metadata" in info, false);

  const rootwareError = new RootwareError("boom", {
    code: "ROOTWARE_INTERNAL_ERROR",
    details: { safe: true },
  });
  const serialized = serializeJobError(rootwareError);
  assertEquals(serialized.code, "ROOTWARE_INTERNAL_ERROR");
  assertEquals(deserializeJobError(serialized).message, "boom");
  assertEquals(deserializeJobError("text").message, "text");
});

Deno.test("@rootware/jobs - memory store list claim priority delay and idempotency", async () => {
  const store = memoryJobStore({ cloneValues: true, maxJobs: 10 });
  const low = await store.enqueue(createJobRecord("low", {}, {
    id: "low",
    priority: "low",
    now: 0,
  }));
  const high = await store.enqueue(createJobRecord("high", {}, {
    id: "high",
    priority: "critical",
    now: 0,
    idempotencyKey: "same",
  }));
  await store.enqueue(createJobRecord("delayed", {}, {
    id: "delayed",
    delayMs: 100,
    now: 0,
  }));

  assertEquals((await store.list({ limit: 2 })).jobs.length, 2);
  assertEquals((await store.findByIdempotencyKey?.("same"))?.id, "high");
  assertEquals((await store.claimNext({ now: 0 }))?.id, high.id);
  assertEquals((await store.claimNext({ now: 0 }))?.id, low.id);
  assertEquals(await store.claimNext({ now: 0 }), undefined);

  await store.update({ ...high, status: "succeeded" });
  assertEquals((await store.get("high"))?.status, "succeeded");
  assertEquals(await store.delete("high"), true);
});

Deno.test("@rootware/jobs - queue enqueue process success cancel retry drain and worker", async () => {
  const success = defineJob({
    name: "success",
    run: (input: { value: number }) => ({ value: input.value + 1 }),
  });
  const queue = createJobQueue({
    jobs: [success],
    store: memoryJobStore(),
  });

  const one = await queue.enqueue("success", { value: 1 });
  assertExists(await queue.get(one.id));

  const processed = await queue.processNext();
  assertEquals(processed?.status, "succeeded");
  assertEquals(processed?.attempts, 1);

  const canceled = await queue.enqueue("success", { value: 2 });
  assertEquals(await queue.cancel(canceled.id), true);
  const retried = await queue.retry(canceled.id);
  assertEquals(retried.status, "queued");

  await queue.enqueueMany([
    { name: "success", payload: { value: 3 } },
    { name: "success", payload: { value: 4 } },
  ]);
  assertEquals((await queue.drain({ limit: 3 })).length, 3);

  await queue.enqueue("success", { value: 5 });
  const worker = queue.worker({ concurrency: 1 });
  assertEquals((await worker.tick()).length, 1);
  worker.start();
  assertEquals(worker.running, true);
  await worker.stop();
  assertEquals(worker.running, false);
});

Deno.test("@rootware/jobs - queue failures retry and dead letter", async () => {
  let calls = 0;
  const failing = defineJob({
    name: "fail",
    run: () => {
      calls += 1;
      throw new Error("boom");
    },
  });
  const queue = createJobQueue({
    jobs: [failing],
    store: memoryJobStore(),
  });
  const job = await queue.enqueue("fail", {}, {
    attempts: 2,
    backoffMs: 0,
    maxBackoffMs: 0,
    backoffStrategy: "fixed",
  });

  await assertRejects(() => queue.processNext(), JobError);
  assertEquals((await queue.get(job.id))?.status, "queued");
  await assertRejects(() => queue.processNext(), JobError);
  assertEquals((await queue.get(job.id))?.status, "dead");
  assertEquals(calls, 2);
  await assertRejects(() => queue.enqueue("missing", {}), JobError);
});

Deno.test("@rootware/jobs - dead-lettered jobs are listable and worker stop is graceful", async () => {
  const failing = defineJob({
    name: "explode",
    run: () => {
      throw new Error("nope");
    },
  });
  const queue = createJobQueue({ jobs: [failing], store: memoryJobStore() });
  const job = await queue.enqueue("explode", {}, {
    attempts: 1,
    backoffMs: 0,
    maxBackoffMs: 0,
    backoffStrategy: "fixed",
  });

  // A single allowed attempt sends the job straight to the dead-letter state.
  await assertRejects(() => queue.processNext(), JobError);
  assertEquals((await queue.get(job.id))?.status, "dead");

  const dead = await queue.list({ status: "dead" });
  assertEquals(dead.jobs.map((entry) => entry.id), [job.id]);

  // Stopping a worker that was never started is rejected explicitly.
  const worker = queue.worker();
  assertEquals(worker.running, false);
  await assertRejects(() => worker.stop(), JobError);

  // A started worker stops gracefully.
  worker.start();
  assertEquals(worker.running, true);
  await worker.stop();
  assertEquals(worker.running, false);
});

Deno.test("@rootware/jobs - noop store and queue", async () => {
  const store = noopJobStore();
  const job = createJobRecord("noop", {});

  assertEquals((await store.enqueue(job)).id, job.id);
  assertEquals(await store.get(job.id), undefined);
  assertEquals(await store.delete(job.id), false);
  assertEquals((await store.list()).jobs, []);

  const queue = noopJobQueue();
  assertEquals((await queue.enqueue("noop", {})).name, "noop");
  assertEquals(await queue.processNext(), undefined);
  assertEquals(await queue.drain(), []);
  await assertRejects(() => queue.retry("missing"), JobError);
});

Deno.test("@rootware/jobs - parseCronExpression and cronMatches handle fields", () => {
  const schedule = parseCronExpression("*/15 9-17 * * 1-5");
  assertEquals([...schedule.minutes], [0, 15, 30, 45]);
  assertEquals(schedule.hours.has(9), true);
  assertEquals(schedule.hours.has(18), false);

  // Monday 2026-06-29 09:15 UTC matches; Sunday and off-minute do not.
  assert(cronMatches(schedule, new Date("2026-06-29T09:15:00.000Z")));
  assert(!cronMatches(schedule, new Date("2026-06-28T09:15:00.000Z")));
  assert(!cronMatches(schedule, new Date("2026-06-29T09:10:00.000Z")));

  assertThrows(() => parseCronExpression("* * * *"), JobError);
  assertThrows(() => parseCronExpression("60 * * * *"), JobError);
  assertThrows(() => parseCronExpression("*/0 * * * *"), JobError);
});

Deno.test("@rootware/jobs - nextCronRun finds the next matching minute (UTC)", () => {
  // Daily at 00:00 UTC: from mid-day, the next run is the following midnight.
  const next = nextCronRun("0 0 * * *", new Date("2026-06-26T12:34:56.000Z"));
  assertEquals(next.toISOString(), "2026-06-27T00:00:00.000Z");

  // Strictly after `after`: an exact match rolls to the next occurrence.
  const after = nextCronRun("0 0 * * *", new Date("2026-06-26T00:00:00.000Z"));
  assertEquals(after.toISOString(), "2026-06-27T00:00:00.000Z");
});

Deno.test("@rootware/jobs - nextRecurrenceAt supports interval and cron rules", () => {
  const base = new Date("2026-06-26T00:00:00.000Z");
  const interval: RecurrenceRule = { kind: "interval", everyMs: 60_000 };
  assertEquals(
    nextRecurrenceAt(interval, base).toISOString(),
    "2026-06-26T00:01:00.000Z",
  );

  const cron: RecurrenceRule = { kind: "cron", expression: "30 * * * *" };
  assertEquals(
    nextRecurrenceAt(cron, base).toISOString(),
    "2026-06-26T00:30:00.000Z",
  );

  assertThrows(
    () => nextRecurrenceAt({ kind: "interval", everyMs: 0 }),
    JobError,
  );
});

Deno.test("@rootware/jobs - calculateBackoffMs applies opt-in full jitter", () => {
  const options = {
    backoffMs: 100,
    maxBackoffMs: 10_000,
    backoffStrategy: "exponential" as const,
  };
  // Without jitter, exponential growth is deterministic.
  assertEquals(calculateBackoffMs(3, options), 400);

  // Full jitter scales the capped value by the random factor in [0, 1].
  assertEquals(
    calculateBackoffMs(3, { ...options, jitter: true, random: () => 0.5 }),
    200,
  );
  assertEquals(
    calculateBackoffMs(3, { ...options, jitter: true, random: () => 0 }),
    0,
  );
});

Deno.test("@rootware/jobs - queue.deadLetter lists only dead jobs", async () => {
  const queue = createJobQueue({
    jobs: [
      defineJob({
        name: "always-fails",
        run: () => {
          throw new Error("nope");
        },
      }),
    ],
    store: memoryJobStore(),
  });

  await queue.enqueue("always-fails", {}, { attempts: 1, backoffMs: 0 });
  // A single allowed attempt fails and dead-letters the job.
  await assertRejects(() => queue.processNext(), JobError);

  const dead = await queue.deadLetter();
  assertEquals(dead.jobs.length, 1);
  assertEquals(dead.jobs[0].status, "dead");
  assertEquals(dead.jobs[0].name, "always-fails");

  assertEquals((await noopJobQueue().deadLetter()).jobs, []);
});

Deno.test("@rootware/jobs - worker lifecycle: start, running flag, and stop guards", async () => {
  const queue = createJobQueue({
    jobs: [defineJob({ name: "noop", run: () => undefined })],
    store: memoryJobStore(),
  });
  const worker = queue.worker({ intervalMs: 5 });

  // Stopping before starting is rejected explicitly.
  assertEquals(worker.running, false);
  await assertRejects(() => worker.stop(), JobError);

  worker.start();
  assertEquals(worker.running, true);
  // Starting again while running is rejected.
  assertThrows(() => worker.start(), JobError);

  await worker.stop();
  assertEquals(worker.running, false);

  // A manual tick still drains ready work after stopping.
  await queue.enqueue("noop", {});
  const processed = await worker.tick();
  assertEquals(processed.length, 1);
});

Deno.test("@rootware/jobs - jobsTableDdl generates Postgres DDL with indexes", () => {
  const ddl = jobsTableDdl({ dialect: "postgres" });

  assert(
    ddl.createTable.includes(`create table if not exists "rootware_jobs"`),
  );
  assert(ddl.createTable.includes(`"id" text primary key`));
  assert(ddl.createTable.includes(`"payload" jsonb not null`));
  assert(ddl.createTable.includes(`"lease_expires_at" timestamptz`));
  assert(ddl.createTable.includes(`"locked_by" text`));
  // Lease/claim/idempotency indexes are present.
  assert(ddl.indexes.some((sql) => sql.includes("_claim_idx")));
  assert(ddl.indexes.some((sql) => sql.includes("_lease_idx")));
  assert(
    ddl.indexes.some((sql) =>
      sql.includes("_idempotency_idx") &&
      sql.includes(`where "idempotency_key" is not null`)
    ),
  );
  assertEquals(ddl.statements.length, 1 + ddl.indexes.length);
  assertEquals(ddl.statements[0], ddl.createTable);
});

Deno.test("@rootware/jobs - jobsTableDdl maps SQLite types and honors a table name", () => {
  const ddl = jobsTableDdl({ dialect: "sqlite", tableName: "app_jobs" });

  assert(ddl.createTable.includes(`create table if not exists "app_jobs"`));
  assert(ddl.createTable.includes(`"payload" TEXT not null`));
  assert(ddl.createTable.includes(`"run_at" TEXT not null`));
  assert(ddl.createTable.includes(`"attempts" INTEGER not null`));
  assert(ddl.indexes.every((sql) => sql.includes(`"app_jobs"`)));

  assertThrows(() =>
    jobsTableDdl({ dialect: "sqlite", tableName: "bad name" })
  );
});

Deno.test("@rootware/jobs - JOB_TABLE_COLUMNS covers the record and lease columns", () => {
  assertEquals(DEFAULT_JOBS_TABLE, "rootware_jobs");
  const names = JOB_TABLE_COLUMNS.map((column) => column.name);

  // Lease columns exist for at-least-once durability.
  assert(names.includes("lease_expires_at"));
  assert(names.includes("locked_by"));
  assert(names.includes("idempotency_key"));
  // The primary key is id and exactly one column is flagged.
  assertEquals(
    JOB_TABLE_COLUMNS.filter((column) => column.primaryKey === true).map((c) =>
      c.name
    ),
    ["id"],
  );
});
