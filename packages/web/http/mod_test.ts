import { assert, assertEquals, assertRejects } from "@std/assert";
import { assertLog, testLogger } from "@rootware/testing";
import {
  buildUrl,
  computeRetryDelay,
  createHttpClient,
  createJsonResponse,
  createMockFetch,
  createTextResponse,
  HttpError,
  isSensitiveHttpName,
  mergeHeaders,
  parseJsonResponse,
  parseRetryAfter,
  redactHttpHeaders,
  redactHttpJson,
  redactHttpUrl,
  safeParseJsonResponse,
} from "./mod.ts";

Deno.test("@rootware/http - buildUrl and mergeHeaders", () => {
  const url = buildUrl("https://api.example.com", "/users", {
    page: 2,
    tag: ["a", "b"],
    empty: null,
  });
  const headers = mergeHeaders({ a: "1" }, { a: "2", b: "3" });

  assertEquals(
    url.toString(),
    "https://api.example.com/users?page=2&tag=a&tag=b",
  );
  assertEquals(headers.get("a"), "2");
  assertEquals(headers.get("b"), "3");
});

Deno.test("@rootware/http - response helpers and JSON parsing", async () => {
  const json = createJsonResponse({ ok: true });
  const text = createTextResponse("hello");

  assertEquals(json.headers.get("content-type"), "application/json");
  assertEquals(text.headers.get("content-type"), "text/plain; charset=utf-8");
  assertEquals(await parseJsonResponse<{ ok: boolean }>(json), { ok: true });
  assertEquals(await safeParseJsonResponse(new Response("{")), undefined);

  await assertRejects(
    () => parseJsonResponse(new Response("{")),
    HttpError,
  );
});

Deno.test("@rootware/http - mock fetch and JSON client", async () => {
  const fetch = createMockFetch([
    {
      path: "/health",
      handler: () => createJsonResponse({ ok: true }),
    },
    {
      method: "POST",
      path: "/users",
      handler: async (request) => {
        return createJsonResponse({ body: await request.json() }, {
          status: 201,
        });
      },
    },
  ]);
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    fetch,
  });

  assertEquals(await client.getJson("/health"), { ok: true });
  assertEquals(await client.postJson("/users", { name: "Lucas" }), {
    body: { name: "Lucas" },
  });
});

Deno.test("@rootware/http - expectOk controls response errors", async () => {
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    fetch: createMockFetch([]),
  });

  await assertRejects(() => client.getJson("/missing"), HttpError);

  const response = await client.get("/missing", { expectOk: false });
  assertEquals(response.status, 404);
});

Deno.test("@rootware/http - timeout uses mock fetch", async () => {
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    fetch: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(createJsonResponse({ ok: true })), 20);
      }),
  });

  await assertRejects(() => client.get("/slow", { timeoutMs: 1 }), HttpError);
});

Deno.test("@rootware/http - retries retryable GET status", async () => {
  let attempts = 0;
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    retry: { attempts: 2, backoffMs: 0 },
    fetch: createMockFetch([
      {
        path: "/retry",
        handler: () => {
          attempts += 1;
          return attempts === 1
            ? createJsonResponse({ ok: false }, { status: 503 })
            : createJsonResponse({ ok: true });
        },
      },
    ]),
  });

  assertEquals(await client.getJson("/retry"), { ok: true });
  assertEquals(attempts, 2);
});

Deno.test("@rootware/http - POST does not retry by default", async () => {
  let attempts = 0;
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    retry: { attempts: 2, backoffMs: 0 },
    fetch: createMockFetch([
      {
        method: "POST",
        path: "/retry",
        handler: () => {
          attempts += 1;
          return createJsonResponse({ ok: false }, { status: 503 });
        },
      },
    ]),
  });

  await assertRejects(() => client.post("/retry"), HttpError);
  assertEquals(attempts, 1);
});

Deno.test("@rootware/http - mock fetch returns 404 when no route matches", async () => {
  const response = await createMockFetch([])("https://api.example.com/missing");

  assertEquals(response.status, 404);
  assert((await response.text()).includes("Not found"));
});

Deno.test("@rootware/http - redacts sensitive headers", () => {
  const headers = redactHttpHeaders({
    authorization: "Bearer secret",
    cookie: "sid=secret",
    "set-cookie": "sid=secret",
    "x-api-key": "secret",
    "x-safe": "visible",
  });

  assertEquals(headers.authorization, "[REDACTED]");
  assertEquals(headers.cookie, "[REDACTED]");
  assertEquals(headers["set-cookie"], "[REDACTED]");
  assertEquals(headers["x-api-key"], "[REDACTED]");
  assertEquals(headers["x-safe"], "visible");
});

Deno.test("@rootware/http - redacts URL credentials and query parameters", () => {
  const redacted = redactHttpUrl(
    "https://user:pass@example.com/path?token=abc&password=pw&secret=s&api_key=k&safe=ok",
  );

  assert(!redacted.includes("user:pass"));
  assert(!redacted.includes("token=abc"));
  assert(!redacted.includes("password=pw"));
  assert(!redacted.includes("secret=s"));
  assert(!redacted.includes("api_key=k"));
  assert(redacted.includes("safe=ok"));
});

Deno.test("@rootware/http - redacts sensitive JSON body keys", () => {
  assertEquals(
    redactHttpJson({
      password: "pw",
      token: "token",
      secret: "secret",
      authorization: "Bearer token",
      nested: { api_key: "key", safe: true },
    }),
    {
      password: "[REDACTED]",
      token: "[REDACTED]",
      secret: "[REDACTED]",
      authorization: "[REDACTED]",
      nested: { api_key: "[REDACTED]", safe: true },
    },
  );
});

Deno.test("@rootware/http - injected logger receives redacted lifecycle logs", async () => {
  const { logger, sink } = testLogger();
  const client = createHttpClient({
    logger,
    fetch: createMockFetch([
      { path: "/users", handler: () => createJsonResponse({ ok: true }) },
    ]),
  });

  await client.getJson(
    "https://user:pass@api.example.com/users?token=abc&safe=ok",
  );

  const logs = assertLog(sink);
  logs.hasMessage("http request started");
  logs.hasMessage("http request completed");
  // Logged URLs must not leak credentials or sensitive query parameters.
  logs.hasRecord((record) =>
    typeof record.url === "string" &&
    !record.url.includes("user:pass") &&
    !record.url.includes("token=abc") &&
    record.url.includes("safe=ok")
  );
});

Deno.test("@rootware/http - response error details redact URL and body", async () => {
  const client = createHttpClient({
    fetch: createMockFetch([
      {
        path: "/private",
        handler: () =>
          createJsonResponse(
            { password: "pw", nested: { token: "secret", safe: "ok" } },
            { status: 400 },
          ),
      },
    ]),
  });

  const error = await assertRejects(
    () =>
      client.getJson(
        "https://user:pass@example.com/private?token=abc&safe=ok",
      ),
    HttpError,
  );

  assert(error instanceof HttpError);
  assert(!String(error.details?.url).includes("user"));
  assert(!String(error.details?.url).includes("abc"));
  assertEquals(error.details?.body, {
    password: "[REDACTED]",
    nested: { token: "[REDACTED]", safe: "ok" },
  });
});

Deno.test("@rootware/http - computeRetryDelay: exponential, capped, jittered, retry-after", () => {
  const base = { backoffMs: 100, maxBackoffMs: 1000, jitter: false };

  // Exponential without jitter: 100, 200, 400...
  assertEquals(computeRetryDelay({ ...base, attempt: 1 }), 100);
  assertEquals(computeRetryDelay({ ...base, attempt: 2 }), 200);
  assertEquals(computeRetryDelay({ ...base, attempt: 3 }), 400);
  // Capped at maxBackoffMs.
  assertEquals(computeRetryDelay({ ...base, attempt: 10 }), 1000);

  // Full jitter stays within [0, capped] (deterministic random).
  assertEquals(
    computeRetryDelay({ ...base, attempt: 3, jitter: true, random: () => 0.5 }),
    200,
  );
  assertEquals(
    computeRetryDelay({ ...base, attempt: 3, jitter: true, random: () => 0 }),
    0,
  );

  // Retry-After takes precedence (not jittered) but is bounded by maxBackoffMs.
  assertEquals(
    computeRetryDelay({ ...base, attempt: 1, retryAfterMs: 500 }),
    500,
  );
  assertEquals(
    computeRetryDelay({ ...base, attempt: 1, retryAfterMs: 9_000 }),
    1000,
  );
});

Deno.test("@rootware/http - parseRetryAfter handles seconds and HTTP-date", () => {
  assertEquals(parseRetryAfter("120"), 120_000);
  assertEquals(parseRetryAfter(null), undefined);
  assertEquals(parseRetryAfter("   "), undefined);
  assertEquals(parseRetryAfter("not-a-date"), undefined);

  const now = Date.parse("2026-06-26T00:00:00.000Z");
  assertEquals(
    parseRetryAfter("Fri, 26 Jun 2026 00:00:30 GMT", now),
    30_000,
  );
  // A past date never yields a negative delay.
  assertEquals(
    parseRetryAfter("Fri, 26 Jun 2026 00:00:00 GMT", now + 5_000),
    0,
  );
});

Deno.test("@rootware/http - maxResponseBytes rejects oversized JSON bodies", async () => {
  const big = "x".repeat(5_000);
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    maxResponseBytes: 1_000,
    fetch: createMockFetch([
      { path: "/big", handler: () => createJsonResponse({ big }) },
    ]),
  });

  const error = await assertRejects(() => client.getJson("/big"), HttpError);
  assert(error instanceof HttpError);
  assertEquals(error.code, "HTTP_RESPONSE_TOO_LARGE");
  assertEquals(error.details?.maxBytes, 1_000);

  // A small body under the limit still parses.
  const okClient = createHttpClient({
    baseUrl: "https://api.example.com",
    maxResponseBytes: 1_000,
    fetch: createMockFetch([
      { path: "/small", handler: () => createJsonResponse({ ok: true }) },
    ]),
  });
  assertEquals(await okClient.getJson("/small"), { ok: true });
});

Deno.test("@rootware/http - parseJsonResponse rejects bodies over maxBytes via content-length", async () => {
  const response = createJsonResponse({ value: "y".repeat(2_000) });
  const error = await assertRejects(
    () => parseJsonResponse(response, { maxBytes: 100 }),
    HttpError,
  );
  assert(error instanceof HttpError);
  assertEquals(error.code, "HTTP_RESPONSE_TOO_LARGE");
});

Deno.test("@rootware/http - isSensitiveHttpName and redactHttpHeaders policy", () => {
  assert(isSensitiveHttpName("authorization"));
  assert(isSensitiveHttpName("X-API-Key"));
  assert(isSensitiveHttpName("session-token"));
  assert(!isSensitiveHttpName("content-type"));

  const redacted = redactHttpHeaders({
    authorization: "Bearer abc",
    cookie: "sid=1",
    "content-type": "application/json",
  });
  assertEquals(redacted.authorization, "[REDACTED]");
  assertEquals(redacted.cookie, "[REDACTED]");
  assertEquals(redacted["content-type"], "application/json");
});

Deno.test("@rootware/http - retry lifecycle logs occur in order with delays", async () => {
  let calls = 0;
  const { logger, sink } = testLogger();
  const client = createHttpClient({
    baseUrl: "https://api.example.com",
    logger,
    retry: { attempts: 2, backoffMs: 0 },
    fetch: createMockFetch([
      {
        path: "/flaky",
        handler: () => {
          calls += 1;
          return calls < 2
            ? createJsonResponse({ error: "later" }, { status: 503 })
            : createJsonResponse({ ok: true });
        },
      },
    ]),
  });

  assertEquals(await client.getJson("/flaky"), { ok: true });

  // Guaranteed ordering: started -> retrying -> completed.
  const messages = assertLog(sink).messages();
  assertEquals(messages, [
    "http request started",
    "http request retrying",
    "http request completed",
  ]);
  assertLog(sink).hasRecord(
    (record) =>
      record.msg === "http request retrying" &&
      typeof record.delayMs === "number",
  );
});
