/**
 * Real-execution integration of `@rootware/jobs/postgres` durable queue against
 * live PostgreSQL. Exercises the at-least-once primitives: atomic
 * `FOR UPDATE SKIP LOCKED` claim with a lease, lease heartbeat, and
 * `reclaimExpired` crash recovery. Run once per configured Postgres version.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` after
 * `docker compose up -d --wait`.
 */

import { assert, assertEquals } from "@std/assert";
import { createJobRecord } from "@rootware/jobs";
import {
  createPgPool,
  createPostgresJobStore,
  ensureJobsTable,
} from "@rootware/jobs/postgres";
import { canReach, type DbTarget, pgTargets, redactUrl } from "./config.ts";

Deno.test("integration: @rootware/jobs/postgres durable queue", async (t) => {
  const targets = pgTargets();
  let reachable = 0;

  for (const target of targets) {
    const up = await canReach(target.url);
    if (up) reachable += 1;
    await t.step({
      name: `${target.label} — ${redactUrl(target.url)}`,
      ignore: !up,
      fn: () => runDurableQueue(target),
    });
  }

  if (reachable === 0) {
    throw new Error(
      "No PostgreSQL targets were reachable. Start them with " +
        "`docker compose up -d --wait` (or set RW_PG_URLS).",
    );
  }
});

async function runDurableQueue(target: DbTarget): Promise<void> {
  const suffix = `${Date.now().toString(36)}${
    Math.random().toString(36).slice(2, 8)
  }`;
  const tableName = `it_jobs_${suffix}`;
  const pool = createPgPool({ url: target.url });
  const store = createPostgresJobStore({ pool, tableName });

  try {
    await ensureJobsTable({ pool, tableName });

    // Enqueue a job and claim it with a short lease.
    const job = createJobRecord("send-email", { to: "a@b.com" }, {
      id: `j_${suffix}`,
      now: 0,
    });
    await store.enqueue(job);

    const claimed = await store.claimNext({
      workerId: "worker-1",
      leaseMs: 50,
    });
    assert(claimed !== undefined);
    assertEquals(claimed!.id, job.id);
    assertEquals(claimed!.status, "running");

    // A second claim finds nothing (the only job is leased).
    assertEquals(await store.claimNext({ workerId: "worker-2" }), undefined);

    // Heartbeat extends the lease while it is still held.
    assertEquals(await store.heartbeat(job.id, 50), true);

    // Wait for the lease to expire, then reclaim it back to `queued`.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const reclaimed = await store.reclaimExpired({});
    assertEquals(reclaimed.map((r) => r.id), [job.id]);

    // The reclaimed job is claimable again by another worker.
    const reclaimedJob = await store.claimNext({ workerId: "worker-2" });
    assertEquals(reclaimedJob?.id, job.id);

    // Heartbeat on a lost lease returns false.
    assertEquals(await store.heartbeat("does-not-exist", 50), false);

    // Persist a terminal state and read it back.
    await store.update({ ...reclaimedJob!, status: "succeeded" });
    assertEquals((await store.get(job.id))?.status, "succeeded");
    assertEquals(await store.delete(job.id), true);
  } finally {
    // Best-effort drop of the throwaway table via a fresh connection.
    const client = await pool.connect();
    try {
      await client.queryObject(`drop table if exists "${tableName}" cascade`);
    } catch {
      // ignore
    } finally {
      client.release?.();
    }
    await store.close?.();
    await pool.end?.();
  }
}
