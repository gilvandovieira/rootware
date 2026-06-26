import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { env } from "@rootware/env";
import { RootwareError } from "@rootware/errors";
import {
  assert as rootAssert,
  assertEquals as rootAssertEquals,
  assertErrorCode,
  assertExists as rootAssertExists,
  assertLog,
  assertNotEquals as rootAssertNotEquals,
  assertRejects as rootAssertRejects,
  assertRootwareError,
  assertThrows as rootAssertThrows,
  assertThrowsRootwareError,
  captureAsyncError,
  captureError,
  createFakeClock,
  createFixture,
  createTestContext,
  fail,
  noop,
  testEnv,
  testLogger,
  useFixture,
  wait,
} from "./mod.ts";

Deno.test("@rootware/testing - assertions", async () => {
  rootAssert(true);
  rootAssertEquals({ a: [1, 2] }, { a: [1, 2] });
  rootAssertNotEquals({ a: 1 }, { a: 2 });
  rootAssertExists("value");

  assertThrows(() => rootAssert(false));
  assertThrows(() => rootAssertEquals(1, 2));
  assertThrows(() => rootAssertNotEquals(1, 1));
  assertThrows(() => fail("boom"));

  rootAssertThrows(() => {
    throw new TypeError("boom");
  }, { errorClass: TypeError, includes: "boom" });

  await rootAssertRejects(() => Promise.reject(new Error("nope")), {
    includes: "nope",
  });
});

Deno.test("@rootware/testing - Rootware error assertions", async () => {
  const error = new RootwareError("configuration failed", {
    code: "ROOTWARE_CONFIGURATION_ERROR",
    cause: new Error("cause"),
  });

  assertRootwareError(error, {
    code: "ROOTWARE_CONFIGURATION_ERROR",
    message: /configuration/,
    cause: true,
  });
  assertErrorCode(error, "ROOTWARE_CONFIGURATION_ERROR");

  assertThrows(() => {
    assertErrorCode(error, "ROOTWARE_VALIDATION_ERROR");
  });
  assertThrows(() => {
    assertRootwareError(new Error("native"));
  });

  const syncError = await assertThrowsRootwareError(() => {
    throw error;
  }, { code: "ROOTWARE_CONFIGURATION_ERROR", message: "failed" });

  assertEquals(syncError.code, "ROOTWARE_CONFIGURATION_ERROR");

  const asyncError = await assertThrowsRootwareError(
    () =>
      Promise.reject(
        new RootwareError("validation failed", {
          code: "ROOTWARE_VALIDATION_ERROR",
        }),
      ),
    { code: "ROOTWARE_VALIDATION_ERROR", message: /validation/ },
  );

  assertEquals(asyncError.code, "ROOTWARE_VALIDATION_ERROR");

  await assertRejects(
    () => assertThrowsRootwareError(() => Promise.resolve(undefined)),
  );
});

Deno.test("@rootware/testing - capture helpers", async () => {
  assertEquals(captureError(() => undefined), undefined);
  assert(
    captureError(() => {
      throw new Error("boom");
    }) instanceof Error,
  );

  assertEquals(
    await captureAsyncError(() => Promise.resolve(undefined)),
    undefined,
  );
  assert(
    await captureAsyncError(() => Promise.reject(new Error("boom"))) instanceof
      Error,
  );
});

Deno.test("@rootware/testing - env and logger helpers", () => {
  const values = testEnv({
    PORT: env.integer().default(8000),
    LOG_LEVEL: env.enum(["debug", "info"]).default("debug"),
  });

  assertEquals(values.PORT, 8000);
  assertEquals(values.LOG_LEVEL, "debug");

  const { logger, sink } = testLogger();
  logger.info({ userId: "u_123" }, "user created");

  const assertion = assertLog(sink);
  assertion.hasMessage("user created");
  assertion.hasField("userId", "u_123");
  assertion.hasLevel("info");
  assertion.hasRecord((record) => record.userId === "u_123");
  assertEquals(assertion.count(), 1);
});

Deno.test("@rootware/testing - fake clock", () => {
  const clock = createFakeClock({ now: "2026-01-01T00:00:00.000Z" });

  assertEquals(clock.iso(), "2026-01-01T00:00:00.000Z");
  clock.advance(1000);
  assertEquals(clock.nowMs(), 1767225601000);
  clock.set("2026-01-02T00:00:00.000Z");
  assertEquals(clock.now().toISOString(), "2026-01-02T00:00:00.000Z");
  clock.reset();
  assertEquals(clock.iso(), "2026-01-01T00:00:00.000Z");
});

Deno.test("@rootware/testing - fixtures and context", async () => {
  let tornDown = false;
  const fixture = createFixture(
    "resource",
    () => ({ id: "r_123" }),
    () => {
      tornDown = true;
    },
  );

  await useFixture(fixture, (resource) => {
    assertEquals(resource.id, "r_123");
  });

  assertEquals(tornDown, true);

  const context = createTestContext({ name: "case" });
  const order: string[] = [];
  context.cleanup(() => {
    order.push("first");
  });
  context.cleanup(() => {
    order.push("second");
  });

  await context.runCleanup();

  assertEquals(context.name, "case");
  assertEquals(order, ["second", "first"]);
});

Deno.test("@rootware/testing - wait and noop", async () => {
  noop();
  await wait(1);
});

Deno.test("@rootware/testing - std assertRejects still checks package errors", async () => {
  await assertRejects(async () => {
    await useFixture(
      createFixture("bad", () => {
        throw new Error("setup");
      }),
      () => undefined,
    );
  });
});
