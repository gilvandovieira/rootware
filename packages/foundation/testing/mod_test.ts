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
  callHandler,
  captureAsyncError,
  captureError,
  createCleanupStack,
  createFakeClock,
  createFixture,
  createTestContext,
  fail,
  noop,
  type ServeHandler,
  testEnv,
  testLogger,
  testRequest,
  useFixture,
  wait,
  withEnvSource,
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

Deno.test("@rootware/testing - context.use composes fixtures onto the cleanup stack", async () => {
  const events: string[] = [];
  const context = createTestContext();

  const fixture = createFixture(
    "db",
    () => {
      events.push("setup");
      return { id: "conn_1" };
    },
    (value) => {
      events.push(`teardown:${value.id}`);
    },
  );

  const resource = await context.use(fixture);
  assertEquals(resource.id, "conn_1");
  assertEquals(events, ["setup"]);

  // Teardown runs only when the context is cleaned up.
  await context.runCleanup();
  assertEquals(events, ["setup", "teardown:conn_1"]);
});

Deno.test("@rootware/testing - assertLog ergonomics: matching, messages, last, empty", () => {
  const { logger, sink } = testLogger();

  const empty = assertLog(sink);
  empty.isEmpty();

  logger.info("user u_1 created");
  logger.warn({ code: "QUOTA" }, "quota nearly reached");

  const assertion = assertLog(sink);
  assertion.hasMessageMatching(/^user \w+ created$/);
  assertEquals(assertion.messages(), [
    "user u_1 created",
    "quota nearly reached",
  ]);
  assertEquals(assertion.last()?.msg, "quota nearly reached");
  assertion.hasNoRecord((record) => record.levelName === "error");

  rootAssertThrows(() => assertion.isEmpty());
  rootAssertThrows(() => assertion.hasMessageMatching(/nonexistent/));
});

Deno.test("@rootware/testing - createCleanupStack runs LIFO and aggregates the first error", async () => {
  const order: string[] = [];
  const stack = createCleanupStack();

  stack.push(() => {
    order.push("first");
  });
  stack.push(() => {
    throw new Error("boom");
  });
  stack.push(() => {
    order.push("third");
  });

  assertEquals(stack.size, 3);

  const error = await assertRejects(
    () => stack.run(),
    RootwareError,
  ) as RootwareError;
  assertEquals(error.code, "TEST_FIXTURE_FAILED");
  // Every callback still ran, in reverse order, despite the middle failure.
  assertEquals(order, ["third", "first"]);
  assertEquals(stack.size, 0);
});

Deno.test("@rootware/testing - withEnvSource scopes an isolated env source", () => {
  const original = { PORT: "3000" };

  const port = withEnvSource(original, (source) => {
    source.PORT = "9999"; // mutating the scoped copy must not leak out
    return testEnv({ PORT: env.integer() }, source).PORT;
  });

  assertEquals(port, 9999);
  assertEquals(original.PORT, "3000");
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

Deno.test("@rootware/testing - testRequest builds requests", async () => {
  const get = testRequest("/health");
  rootAssertEquals(get.method, "GET");
  rootAssertEquals(new URL(get.url).pathname, "/health");

  const withQuery = testRequest("/search", { query: { q: "deno", page: 2 } });
  const url = new URL(withQuery.url);
  rootAssertEquals(url.searchParams.get("q"), "deno");
  rootAssertEquals(url.searchParams.get("page"), "2");

  const json = testRequest("/users", { json: { name: "ada" } });
  rootAssertEquals(json.method, "POST");
  rootAssertEquals(json.headers.get("content-type"), "application/json");
  rootAssertEquals(await json.json(), { name: "ada" });

  rootAssertThrows(() => testRequest("/users", { json: { a: 1 }, body: "x" }));
});

Deno.test("@rootware/testing - callHandler invokes a Deno.serve handler", async () => {
  const handler: ServeHandler = async (request) => {
    if (request.method === "POST") {
      const body = await request.json();
      return Response.json({ created: body.name }, {
        status: 201,
        headers: { "x-trace": "abc" },
      });
    }
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  };

  const created = await callHandler(handler, "/users", {
    json: { name: "ada" },
  });
  created
    .assertStatus(201)
    .assertOk()
    .assertHeader("x-trace", "abc")
    .assertJson({ created: "ada" });

  const root = await callHandler(handler, "/");
  root.assertOk().assertBodyIncludes("ok");
  rootAssertEquals(root.text(), "ok");
});

Deno.test("@rootware/testing - callHandler passes remoteAddr and reports throws", async () => {
  const echoAddr: ServeHandler = (_request, info) =>
    Response.json({
      host: info.remoteAddr.hostname,
      port: info.remoteAddr.port,
    });

  const res = await callHandler(echoAddr, "/whoami", {
    remoteAddr: { hostname: "10.0.0.1", port: 5555 },
  });
  res.assertJson({ host: "10.0.0.1", port: 5555 });

  const boom: ServeHandler = () => {
    throw new Error("handler exploded");
  };
  await assertThrowsRootwareError(() => callHandler(boom, "/boom"), {
    code: "TEST_HANDLER_FAILED",
  });
});
