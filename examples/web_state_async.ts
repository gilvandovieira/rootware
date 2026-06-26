import {
  buildUrl,
  computeRetryDelay,
  createHttpClient,
  createJsonResponse,
  createMockFetch,
  redactHttpHeaders,
  redactHttpJson,
  redactHttpUrl,
} from "@rootware/http";
import {
  createCache,
  createNamespacedCache,
  jsonCacheSerializer,
  memoryCacheStore,
} from "@rootware/cache";
import {
  calculateChecksum,
  createStorage,
  joinStorageKey,
  memoryStorageStore,
} from "@rootware/storage";
import {
  cacheSessionStore,
  createSessionManager,
  getCookie,
  parseCookieHeader,
  safeSessionInfo,
} from "@rootware/session";
import {
  createJobQueue,
  defineJob,
  memoryJobStore,
  safeJobInfo,
} from "@rootware/jobs";
import { createLogger, memorySink } from "@rootware/log";
import { assert, assertEquals, assertExists } from "@rootware/testing";

interface UserProfile {
  readonly id: string;
  readonly name: string;
}

interface WelcomePayload {
  readonly userId: string;
}

interface WelcomeOutput {
  readonly storedKey: string;
}

export async function runWebStateAsyncExample(): Promise<void> {
  const logSink = memorySink();
  const logger = createLogger({
    level: "debug",
    name: "web-state-async-example",
    timestamp: () => "2024-01-01T00:00:00.000Z",
  }, logSink);

  let flakyAttempts = 0;
  const fetch = createMockFetch([
    {
      method: "GET",
      path: "/users/u_1",
      handler: () => createJsonResponse({ id: "u_1", name: "Ada" }),
    },
    {
      method: "GET",
      path: "/flaky",
      handler: () => {
        flakyAttempts += 1;
        return flakyAttempts === 1
          ? createJsonResponse({ retry: true }, { status: 503 })
          : createJsonResponse({ ok: true });
      },
    },
    {
      method: "POST",
      path: "/audit",
      handler: async (request) => {
        const body = await request.json();
        return createJsonResponse({ stored: true, body });
      },
    },
  ]);

  const http = createHttpClient({
    baseUrl: "https://api.example.test",
    fetch,
    logger,
    retry: { attempts: 1, backoffMs: 0, jitter: false },
    maxResponseBytes: 4_096,
    userAgent: "rootware-examples",
  });

  const cache = createCache({
    store: memoryCacheStore({ cloneValues: true }),
    namespace: "example",
    defaultTtlMs: 5_000,
    logger,
  });
  const userCache = createNamespacedCache(cache, "users");

  let userFetches = 0;
  const user = await userCache.getOrSet<UserProfile>("u_1", async () => {
    userFetches += 1;
    return await http.getJson<UserProfile>("/users/u_1");
  });
  assertEquals(user, { id: "u_1", name: "Ada" });
  assertEquals(
    await userCache.getOrSet<UserProfile>("u_1", () => {
      throw new Error("cached value should be reused");
    }),
    user,
  );
  assertEquals(userFetches, 1);

  const serializer = jsonCacheSerializer();
  assertEquals(
    serializer.deserialize(serializer.serialize({ ok: true })),
    { ok: true },
  );

  const storage = createStorage({
    store: memoryStorageStore({ cloneObjects: true }),
    namespace: "tenant_1",
    publicBaseUrl: "https://cdn.example.test/assets",
    allowedContentTypes: ["application/json"],
    logger,
  });
  const profileKey = joinStorageKey(["profiles", `${user.id}.json`]);
  const profileBody = JSON.stringify(user);
  const checksum = await calculateChecksum(profileBody);
  const profileInfo = await storage.put(profileKey, profileBody, {
    contentType: "application/json",
    metadata: { owner: user.id },
    checksum,
  });
  assertEquals(profileInfo.metadata.owner, "u_1");
  assertEquals(
    await (await storage.get(profileKey))?.blob.text(),
    profileBody,
  );
  assert(storage.publicUrl(profileKey)?.includes("tenant_1/profiles/u_1.json"));

  const sessionCache = createCache({ store: memoryCacheStore() });
  const sessions = createSessionManager({
    store: cacheSessionStore(sessionCache, {
      prefix: "sid",
      ttlMs: 60_000,
    }),
    cookie: { name: "rw_sid", secure: true },
    maxAgeMs: 60_000,
    logger,
  });
  const session = await sessions.create({
    actor: { id: user.id, type: "user", roles: ["admin"] },
    data: { theme: "dark" },
  });
  const responseHeaders = new Headers();
  sessions.commit(responseHeaders, session);
  const cookieHeader = responseHeaders.get("set-cookie")?.split(";")[0];
  assertExists(cookieHeader);

  const requestHeaders = new Headers({ cookie: cookieHeader });
  assertEquals(getCookie(requestHeaders, "rw_sid"), session.id);
  assertEquals(parseCookieHeader(cookieHeader).rw_sid, session.id);
  assertEquals((await sessions.requireActor(requestHeaders)).id, user.id);
  assertEquals(safeSessionInfo(session).actorId, user.id);

  assertEquals(await http.getJson<{ readonly ok: boolean }>("/flaky"), {
    ok: true,
  });
  assertEquals(
    await http.postJson<{ readonly stored: boolean }>("/audit", {
      userId: user.id,
    }),
    { stored: true, body: { userId: "u_1" } },
  );
  assertEquals(
    buildUrl("https://api.example.test", "/users", { page: 1 }).toString(),
    "https://api.example.test/users?page=1",
  );
  assertEquals(
    redactHttpHeaders({ authorization: "Bearer secret", "x-safe": "ok" }),
    { authorization: "[REDACTED]", "x-safe": "ok" },
  );
  assert(
    !redactHttpUrl("https://user:pass@example.test?a=1&token=secret").includes(
      "pass",
    ),
  );
  assertEquals(redactHttpJson({ password: "secret", ok: true }), {
    password: "[REDACTED]",
    ok: true,
  });
  assertEquals(
    computeRetryDelay({
      attempt: 2,
      backoffMs: 100,
      maxBackoffMs: 1_000,
      jitter: false,
    }),
    200,
  );

  const welcomeJob = defineJob<WelcomePayload, WelcomeOutput>({
    name: "email:welcome",
    validate: validateWelcomePayload,
    defaultRetry: { attempts: 2, backoffMs: 10, maxBackoffMs: 20 },
    defaultPriority: "high",
    run: async (payload, ctx) => {
      const profile = await userCache.getOrSet<UserProfile>(
        payload.userId,
        () => http.getJson<UserProfile>(`/users/${payload.userId}`),
      );
      const storedKey = joinStorageKey(["welcome", `${payload.userId}.json`]);
      await storage.put(
        storedKey,
        JSON.stringify({
          name: profile.name,
          attempt: ctx.attempt,
        }),
        {
          contentType: "application/json",
        },
      );
      ctx.logger?.info({ userId: payload.userId }, "welcome prepared");
      return { storedKey };
    },
  });
  const queue = createJobQueue({
    jobs: [welcomeJob],
    store: memoryJobStore({ cloneValues: true }),
    logger,
  });

  const enqueued = await queue.enqueue("email:welcome", { userId: "u_1" }, {
    id: "welcome_u_1",
    idempotencyKey: "welcome:u_1",
  });
  const duplicate = await queue.enqueue("email:welcome", { userId: "u_1" }, {
    idempotencyKey: "welcome:u_1",
  });
  assertEquals(duplicate.id, enqueued.id);

  const processed = await queue.processNext();
  assertExists(processed);
  assertEquals(processed.status, "succeeded");
  assertEquals(
    (processed.output as WelcomeOutput).storedKey,
    "welcome/u_1.json",
  );
  assertEquals(safeJobInfo(processed).status, "succeeded");
  assertEquals((await queue.list({ status: "succeeded" })).jobs.length, 1);

  await queue.enqueue("email:welcome", { userId: "u_1" }, {
    id: "welcome_u_2",
  });
  const worker = queue.worker({ names: ["email:welcome"], concurrency: 1 });
  assertEquals((await worker.tick()).length, 1);

  assert(logSink.records().some((record) => record.msg === "welcome prepared"));

  await queue.close();
  await sessions.close();
  await sessionCache.close();
  await storage.close();
  await cache.close();
}

function validateWelcomePayload(payload: unknown): WelcomePayload {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "userId" in payload &&
    typeof (payload as { readonly userId: unknown }).userId === "string"
  ) {
    return { userId: (payload as { readonly userId: string }).userId };
  }

  throw new Error("Welcome job payload requires a userId string");
}

if (import.meta.main) {
  await runWebStateAsyncExample();
  console.log("web/state/async example passed");
}
