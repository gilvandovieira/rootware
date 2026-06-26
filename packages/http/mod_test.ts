import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  buildUrl,
  createHttpClient,
  createJsonResponse,
  createMockFetch,
  createTextResponse,
  HttpError,
  mergeHeaders,
  parseJsonResponse,
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
