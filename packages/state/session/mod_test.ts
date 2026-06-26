import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { createCache, memoryCacheStore } from "@rootware/cache";
import {
  appendSetCookie,
  cacheSessionStore,
  createClearCookieHeader,
  createSessionId,
  createSessionManager,
  createSessionRecord,
  createSetCookieHeader,
  getCookie,
  isSessionExpired,
  memorySessionStore,
  noopSessionManager,
  normalizeCookieOptions,
  parseCookieHeader,
  refreshSession,
  safeSessionInfo,
  serializeCookie,
  SessionError,
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
