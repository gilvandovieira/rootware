import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  type CacheClient,
  createCache,
  memoryCacheStore,
} from "@rootware/cache";
import {
  actorHasAllPermissions,
  actorHasAnyRole,
  actorHasPermission,
  actorHasRole,
  appendSetCookie,
  assertActorPermission,
  assertActorRole,
  assertCsrf,
  bearerTokenProvider,
  cacheSessionStore,
  cookieTokenProvider,
  createClearCookieHeader,
  createCsrfCookieHeader,
  createCsrfToken,
  createSessionId,
  createSessionManager,
  createSessionRecord,
  createSetCookieHeader,
  getCookie,
  isSameOriginRequest,
  isSessionExpired,
  memorySessionStore,
  noopSessionManager,
  normalizeCookieOptions,
  parseCookieHeader,
  refreshSession,
  requireProviderActor,
  safeSessionInfo,
  serializeCookie,
  SessionError,
  type SessionProvider,
  verifyCsrf,
} from "./mod.ts";

Deno.test("@rootware/session - ids records expiry and refresh", () => {
  const id = createSessionId({ prefix: "sess" });
  assert(id.startsWith("sess_"));

  const session = createSessionRecord({
    id: "abc_123",
    actor: { id: "u_123", type: "user" },
    data: { theme: "dark" },
    maxAgeMs: 1_000,
    now: 0,
  });

  assertEquals(session.createdAt, "1970-01-01T00:00:00.000Z");
  assertEquals(isSessionExpired(session, 999), false);
  assertEquals(isSessionExpired(session, 1_000), true);

  const refreshed = refreshSession(session, { maxAgeMs: 2_000, now: 10 });
  assertEquals(refreshed.updatedAt, "1970-01-01T00:00:00.010Z");
  assertEquals(refreshed.expiresAt, "1970-01-01T00:00:02.010Z");
  assertEquals(session.expiresAt, "1970-01-01T00:00:01.000Z");
});

Deno.test("@rootware/session - memory store and manager lifecycle", async () => {
  const manager = createSessionManager({
    store: memorySessionStore({ cloneSessions: true }),
    maxAgeMs: 60_000,
    rolling: true,
  });
  const session = await manager.create({
    actor: { id: "u_123", type: "user" },
    data: { theme: "dark" },
  });

  assertExists(await manager.getById(session.id));

  const headers = new Headers();
  manager.commit(headers, session);
  const request = new Request("https://example.com", {
    headers: { cookie: `${manager.cookieName()}=${session.id}` },
  });

  assertEquals((await manager.get(request))?.actor?.id, "u_123");
  assertEquals((await manager.requireActor(request)).id, "u_123");

  const updated = await manager.update(session, {
    data: { theme: "light" },
  });
  assertEquals(updated.data.theme, "light");

  await manager.save(updated);
  assertEquals(await manager.destroyById(session.id), true);
  await assertRejects(() => manager.requireSession(request), SessionError);
});

Deno.test("@rootware/session - cache store works with cache memory store", async () => {
  const cache = createCache({ store: memoryCacheStore() });
  const store = cacheSessionStore(cache, { prefix: "sess" });
  const session = createSessionRecord({ id: "cached_1" });

  await store.set(session);
  assertEquals((await store.get("cached_1"))?.id, "cached_1");
  await store.touch?.("cached_1");
  assertEquals(await store.delete("cached_1"), true);
});

Deno.test("@rootware/session - cache store clear deletes only its prefix", async () => {
  const cache = createCache({ store: memoryCacheStore() });
  const store = cacheSessionStore(cache, { prefix: "sess" });
  const otherStore = cacheSessionStore(cache, { prefix: "other" });

  await store.set(createSessionRecord({ id: "cached_1" }));
  await store.set(createSessionRecord({ id: "cached_2" }));
  await otherStore.set(createSessionRecord({ id: "cached_3" }));
  await cache.set("unrelated", "keep");

  await store.clear?.();

  assertEquals(await store.get("cached_1"), undefined);
  assertEquals(await store.get("cached_2"), undefined);
  assertEquals((await otherStore.get("cached_3"))?.id, "cached_3");
  assertEquals(await cache.get("unrelated"), "keep");
});

Deno.test("@rootware/session - cache store derives entry TTL from expiresAt", async () => {
  let lastSetTtlMs: number | undefined;
  const map = new Map<string, unknown>();
  const cache = {
    get: (key: string) => Promise.resolve(map.get(key)),
    set: (key: string, value: unknown, options?: { ttlMs?: number }) => {
      lastSetTtlMs = options?.ttlMs;
      map.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => Promise.resolve(map.delete(key)),
    has: (key: string) => Promise.resolve(map.has(key)),
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
    getOrSet: <T>(_key: string, factory: () => T | Promise<T>) =>
      Promise.resolve(factory()),
    namespace: () => cache,
    close: () => Promise.resolve(),
  } as unknown as CacheClient;

  const store = cacheSessionStore(cache);

  // A future expiresAt is mapped to the cache entry TTL (remaining lifetime).
  await store.set(createSessionRecord({ id: "s1", maxAgeMs: 60_000 }));
  assert(lastSetTtlMs !== undefined);
  assert(lastSetTtlMs > 55_000 && lastSetTtlMs <= 60_000);

  // A session without expiresAt and no store ttl leaves the entry TTL unset.
  lastSetTtlMs = -1;
  await store.set(createSessionRecord({ id: "s2" }));
  assertEquals(lastSetTtlMs, undefined);
});

Deno.test("@rootware/session - cache eviction drops a still-valid session (non-durable)", async () => {
  // A small cache evicts the oldest entry; sessions are not durable.
  const cache = createCache({ store: memoryCacheStore({ maxEntries: 1 }) });
  const store = cacheSessionStore(cache, { prefix: "sess" });

  await store.set(createSessionRecord({ id: "first", maxAgeMs: 60_000 }));
  await store.set(createSessionRecord({ id: "second", maxAgeMs: 60_000 }));

  // "first" was evicted by the cache even though it had not expired.
  assertEquals(await store.get("first"), undefined);
  assertEquals((await store.get("second"))?.id, "second");
});

Deno.test("@rootware/session - session expiry is enforced independently of cache TTL", async () => {
  // The cache keeps an already-expired session (its derived TTL is non-positive,
  // so it falls back to no TTL), but the session layer still treats it as gone.
  const cache = createCache({ store: memoryCacheStore() });
  const store = cacheSessionStore(cache, { prefix: "sess" });
  await store.set(
    createSessionRecord({ id: "expired_1", maxAgeMs: 1_000, now: 0 }),
  );

  // The raw entry is still in the cache...
  assertExists(await store.get("expired_1"));

  // ...but the manager resolves it to undefined because it has expired.
  const manager = createSessionManager({ store, maxAgeMs: 60_000 });
  const cookieName = manager.cookieName();
  const request = new Request("https://example.com", {
    headers: { cookie: `${cookieName}=expired_1` },
  });
  assertEquals(await manager.get(request), undefined);
});

Deno.test("@rootware/session - cookie helpers are safe", () => {
  const parsed = parseCookieHeader("sid=abc%20123; theme=dark");
  assertEquals(parsed.sid, "abc 123");
  assertEquals(getCookie(new Headers({ cookie: "sid=abc" }), "sid"), "abc");

  const cookie = serializeCookie("sid", "abc 123", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAgeSeconds: 60,
  });
  assert(cookie.includes("sid=abc%20123"));
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("Secure"));

  const session = createSessionRecord({
    id: "cookie_1",
    maxAgeMs: 1_000,
    now: 0,
  });
  assert(createSetCookieHeader(session, { name: "sid" }).includes("Expires="));
  assert(createClearCookieHeader({ name: "sid" }).includes("Max-Age=0"));

  const headers = new Headers();
  appendSetCookie(headers, "a=1");
  appendSetCookie(headers, "b=2");
  assert(headers.get("set-cookie")?.includes("a=1"));

  assertEquals(normalizeCookieOptions().name, "sid");
  assertThrows(() => serializeCookie("bad name", "x"), SessionError);
  assertThrows(
    () => serializeCookie("sid", "abc", { sameSite: "none" }),
    SessionError,
    "SameSite=None cookies must be Secure",
  );
  assertThrows(
    () => normalizeCookieOptions({ sameSite: "none", secure: false }),
    SessionError,
    "SameSite=None cookies must be Secure",
  );
  assertThrows(
    () => createCsrfCookieHeader("csrf", { sameSite: "none", secure: false }),
    SessionError,
    "SameSite=None cookies must be Secure",
  );
});

Deno.test("@rootware/session - set-cookie uses secure defaults", () => {
  const session = createSessionRecord({
    id: "flag_1",
    maxAgeMs: 1_000,
    now: 0,
  });
  const header = createSetCookieHeader(session, { name: "sid" });

  assert(header.includes("HttpOnly"));
  assert(header.includes("Secure"));
  assert(header.includes("SameSite=Lax"));
  assert(header.includes("Path=/"));
});

Deno.test("@rootware/session - expired and missing sessions resolve to undefined", async () => {
  const store = memorySessionStore();
  // expiresAt is at the epoch, so it is expired against the real clock.
  await store.set(
    createSessionRecord({ id: "expired_1", maxAgeMs: 1_000, now: 0 }),
  );

  const manager = createSessionManager({ store, maxAgeMs: 60_000 });
  const cookieName = manager.cookieName();

  const expiredRequest = new Request("https://example.com", {
    headers: { cookie: `${cookieName}=expired_1` },
  });
  assertEquals(await manager.get(expiredRequest), undefined);
  await assertRejects(
    () => manager.requireSession(expiredRequest),
    SessionError,
  );

  const unknownRequest = new Request("https://example.com", {
    headers: { cookie: `${cookieName}=does_not_exist` },
  });
  assertEquals(await manager.get(unknownRequest), undefined);

  // No cookie at all.
  assertEquals(
    await manager.get(new Request("https://example.com")),
    undefined,
  );
});

Deno.test("@rootware/session - safe info and noop manager", async () => {
  const session = createSessionRecord({
    id: "abcdef1234567890",
    actor: { id: "u_123", type: "user", secret: "hidden" },
    data: { secret: "hidden" },
  });
  const info = safeSessionInfo(session);

  assertEquals(info.actorId, "u_123");
  assertEquals("data" in info, false);
  assertEquals("secret" in info, false);

  const noop = noopSessionManager();
  assertEquals(noop.cookieName(), "sid");
  assertEquals(await noop.get(new Headers()), undefined);
  await assertRejects(() => noop.requireActor(new Headers()), SessionError);
});

Deno.test("@rootware/session - rotate issues a new id and invalidates the old one", async () => {
  const store = memorySessionStore();
  const sessions = createSessionManager({ store });

  const anon = await sessions.create({ data: { cart: ["a"] } });
  const oldId = anon.id;

  // On login: rotate the id and attach the authenticated actor.
  const loggedIn = await sessions.rotate(anon, {
    actor: { id: "u_1", roles: ["member"] },
  });

  assert(loggedIn.id !== oldId);
  assertEquals(loggedIn.actor?.id, "u_1");
  assertEquals(loggedIn.data.cart, ["a"]); // data is preserved

  // The old id no longer resolves; the new one does.
  assertEquals(await sessions.getById(oldId), undefined);
  assertExists(await sessions.getById(loggedIn.id));
});

Deno.test("@rootware/session - createCsrfToken and double-submit verifyCsrf", () => {
  const token = createCsrfToken();
  assertEquals(token.length, 64); // 32 bytes hex
  assert(createCsrfCookieHeader(token).includes("csrf="));
  assert(!createCsrfCookieHeader(token).includes("HttpOnly"));

  const make = (init: RequestInit & { token?: string; cookie?: string }) =>
    new Request("https://app.example.com/transfer", {
      method: "POST",
      headers: {
        origin: "https://app.example.com",
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
        ...(init.token === undefined ? {} : { "x-csrf-token": init.token }),
      },
    });

  // Matching cookie + header passes.
  assertEquals(
    verifyCsrf(make({ cookie: `csrf=${token}`, token })),
    { ok: true },
  );

  // Mismatched token fails.
  assertEquals(
    verifyCsrf(make({ cookie: `csrf=${token}`, token: "deadbeef" })),
    { ok: false, reason: "token-mismatch" },
  );

  // Missing header token fails.
  assertEquals(
    verifyCsrf(make({ cookie: `csrf=${token}` })),
    { ok: false, reason: "missing-token" },
  );

  // Safe methods skip the check.
  assertEquals(
    verifyCsrf(new Request("https://app.example.com/", { method: "GET" })),
    { ok: true },
  );
});

Deno.test("@rootware/session - verifyCsrf rejects a cross-origin request", () => {
  const token = createCsrfToken();
  const crossOrigin = new Request("https://app.example.com/transfer", {
    method: "POST",
    headers: {
      origin: "https://evil.example.com",
      cookie: `csrf=${token}`,
      "x-csrf-token": token,
    },
  });

  assertEquals(verifyCsrf(crossOrigin), {
    ok: false,
    reason: "origin-mismatch",
  });
  assert(
    !isSameOriginRequest(crossOrigin),
  );
  assertThrows(() => assertCsrf(crossOrigin), SessionError);

  // An allow-listed cross origin passes the origin gate.
  assert(isSameOriginRequest(crossOrigin, ["https://evil.example.com"]));
});

Deno.test("@rootware/session - actor role and permission helpers", () => {
  const actor = {
    id: "u_1",
    roles: ["member", "billing"],
    permissions: ["invoice:read", "invoice:write"],
  };

  assert(actorHasRole(actor, "billing"));
  assert(!actorHasRole(actor, "admin"));
  assert(actorHasAnyRole(actor, ["admin", "member"]));
  assert(actorHasPermission(actor, "invoice:read"));
  assert(actorHasAllPermissions(actor, ["invoice:read", "invoice:write"]));
  assert(!actorHasAllPermissions(actor, ["invoice:read", "invoice:delete"]));

  assertActorRole(actor, "member");
  assertActorPermission(actor, "invoice:write");

  const forbidden = assertThrows(
    () => assertActorPermission(actor, "invoice:delete"),
    SessionError,
  ) as SessionError;
  assertEquals(forbidden.status, 403);
});

Deno.test("@rootware/session - bearerTokenProvider resolves an actor via an injected verifier", async () => {
  // Stand-in for a Clerk/Auth0/JWT verifier the adapter package would supply.
  const verify = (token: string) =>
    token === "good-token" ? { id: "u_1", roles: ["member"] } : undefined;
  const provider = bearerTokenProvider({ verify });

  const authed = await provider.resolveActor(
    new Request("https://app.example.com/me", {
      headers: { authorization: "Bearer good-token" },
    }),
  );
  assertEquals(authed?.id, "u_1");

  // Wrong scheme, missing header, and bad token all resolve to undefined.
  assertEquals(
    await provider.resolveActor(
      new Request("https://app.example.com/me", {
        headers: { authorization: "Basic good-token" },
      }),
    ),
    undefined,
  );
  assertEquals(
    await provider.resolveActor(new Request("https://app.example.com/me")),
    undefined,
  );
  assertEquals(
    await provider.resolveActor(
      new Headers({ authorization: "Bearer bad" }),
    ),
    undefined,
  );
});

Deno.test("@rootware/session - cookieTokenProvider and requireProviderActor", async () => {
  const provider: SessionProvider = cookieTokenProvider({
    cookieName: "sb-token",
    verify: (token) => token === "valid" ? { id: "u_2" } : undefined,
  });

  const request = new Request("https://app.example.com/", {
    headers: { cookie: "sb-token=valid" },
  });
  assertEquals((await requireProviderActor(provider, request)).id, "u_2");

  // Unauthenticated requests raise SESSION_ACTOR_REQUIRED (401).
  const anon = new Request("https://app.example.com/");
  const error = await assertRejects(
    () => requireProviderActor(provider, anon),
    SessionError,
  ) as SessionError;
  assertEquals(error.status, 401);
  assertEquals(error.code, "SESSION_ACTOR_REQUIRED");
});
