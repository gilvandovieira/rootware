import { assert, assertEquals } from "@std/assert";
import { createLogger, memorySink, unbufferedSink } from "../mod.ts";
import { withRequestLogging } from "./mod.ts";

function loggerWithSink() {
  const sink = memorySink();
  const logger = createLogger(
    { level: "debug", timestamp: () => "2026-01-01T00:00:00.000Z" },
    unbufferedSink(sink),
  );
  return { sink, logger };
}

Deno.test("@rootware/log/http - logs a completed request and echoes the request id", async () => {
  const { sink, logger } = loggerWithSink();
  let clock = 1000;
  const handler = withRequestLogging(
    () => new Response("ok", { status: 200 }),
    { logger, now: () => clock, generateRequestId: () => "req_fixed" },
  );

  clock = 1000;
  const response = await handler(
    new Request("https://api.example.com/users?token=secret"),
  );
  clock = 1042;
  // (duration is captured inside the handler call; advance afterwards is moot)

  assertEquals(response.headers.get("x-request-id"), "req_fixed");

  const completed = sink.records().find((r) =>
    r.event === "http.request.completed"
  );
  assert(completed !== undefined);
  assertEquals(completed.method, "GET");
  // The query string (with the secret) is never logged — only the pathname.
  assertEquals(completed.path, "/users");
  assertEquals(completed.status, 200);
  assertEquals(completed.requestId, "req_fixed");
  assertEquals(typeof completed.durationMs, "number");
});

Deno.test("@rootware/log/http - escalates level by status and honors inbound request id", async () => {
  const { sink, logger } = loggerWithSink();
  const handler = withRequestLogging(
    (request) =>
      new Response(null, {
        status: request.url.endsWith("/boom") ? 503 : 404,
      }),
    { logger },
  );

  await handler(
    new Request("https://api.example.com/missing", {
      headers: { "x-request-id": "abc-123" },
    }),
  );
  await handler(new Request("https://api.example.com/boom"));

  const records = sink.records().filter((r) =>
    r.event === "http.request.completed"
  );
  // 404 → warn, 503 → error.
  assertEquals(records[0].levelName, "warn");
  assertEquals(records[0].requestId, "abc-123"); // inbound id preserved
  assertEquals(records[1].levelName, "error");
});

Deno.test("@rootware/log/http - logs and rethrows a handler error", async () => {
  const { sink, logger } = loggerWithSink();
  const handler = withRequestLogging(() => {
    throw new Error("handler boom");
  }, { logger });

  let thrown: unknown;
  try {
    await handler(new Request("https://api.example.com/x"));
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error);
  const failed = sink.records().find((r) => r.event === "http.request.failed");
  assert(failed !== undefined);
  assertEquals(failed.levelName, "error");
  assertEquals(
    (failed.error as { message: string }).message,
    "handler boom",
  );
});

Deno.test("@rootware/log/http - logs allow-listed headers only, never bodies", async () => {
  const { sink, logger } = loggerWithSink();
  const handler = withRequestLogging(
    () => new Response("ok"),
    { logger, logHeaders: ["user-agent"], setResponseHeader: false },
  );

  await handler(
    new Request("https://api.example.com/x", {
      method: "POST",
      headers: {
        "user-agent": "rootware-test",
        authorization: "Bearer secret",
      },
      body: "sensitive body",
    }),
  );

  const received = sink.records().find((r) =>
    r.event === "http.request.received"
  );
  assert(received !== undefined);
  assertEquals(received["user-agent"], "rootware-test");
  // The authorization header was not allow-listed, so it is not logged.
  assertEquals("authorization" in received, false);
  // No record carries the request body.
  assert(!sink.lines().some((line) => line.includes("sensitive body")));
});
