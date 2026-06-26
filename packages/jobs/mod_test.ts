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
  defineJob,
  defineJobs,
  deserializeJobError,
  isJobReady,
  isRetryableJobStatus,
  isTerminalJobStatus,
  JobError,
  memoryJobStore,
  noopJobQueue,
  noopJobStore,
  normalizeJobName,
  normalizeQueueName,
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
