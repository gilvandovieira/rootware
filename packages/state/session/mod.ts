import { RootwareError } from "@rootware/errors";
import type { CacheClient } from "@rootware/cache";
import type { Logger } from "@rootware/log";

const DEFAULT_COOKIE_NAME = "sid";
const DEFAULT_COOKIE_PATH = "/";
const DEFAULT_COOKIE_SECURE = true;
const DEFAULT_COOKIE_HTTP_ONLY = true;
const DEFAULT_COOKIE_SAME_SITE: CookieSameSite = "lax";
const DEFAULT_SESSION_ID_BYTES = 32;
const DEFAULT_CACHE_PREFIX = "session";

/** Error codes emitted by session lifecycle, cookie, and actor helpers. */
export type SessionErrorCode =
  | "SESSION_MISSING"
  | "SESSION_EXPIRED"
  | "SESSION_INVALID"
  | "SESSION_ACTOR_REQUIRED"
  | "SESSION_FORBIDDEN"
  | "SESSION_CSRF_INVALID"
  | "SESSION_COOKIE_INVALID"
  | "SESSION_CREATE_FAILED"
  | "SESSION_GET_FAILED"
  | "SESSION_SAVE_FAILED"
  | "SESSION_ROTATE_FAILED"
  | "SESSION_DESTROY_FAILED"
  | "SESSION_UNKNOWN_ERROR"
  | (string & Record<never, never>);

/** Opaque server-side session identifier. */
export type SessionId = string;

/** JSON-like server-side data stored with a session. */
export type SessionData = Record<string, unknown>;

/** Allowed `SameSite` cookie policy values. */
export type CookieSameSite = "strict" | "lax" | "none";

/** Allowed cookie priority values for clients that support the attribute. */
export type CookiePriority = "low" | "medium" | "high";

/** Current authenticated or anonymous actor associated with a session. */
export interface SessionActor {
  id: string;
  type?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: unknown;
}

/** Stored server-side session record. */
export interface SessionRecord<TData extends SessionData = SessionData> {
  id: SessionId;
  actor?: SessionActor;
  data: TData;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

/** Cookie defaults used by a {@link SessionManager}. */
export interface SessionCookieOptions {
  readonly name?: string;
  readonly domain?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly sameSite?: CookieSameSite;
  readonly maxAgeSeconds?: number;
  readonly priority?: CookiePriority;
}

/** Options used when serializing a `Set-Cookie` header value. */
export interface CookieSerializeOptions {
  readonly domain?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly sameSite?: CookieSameSite;
  readonly maxAgeSeconds?: number;
  readonly expires?: Date;
  readonly priority?: CookiePriority;
}

/** Options used when parsing a `Cookie` header value. */
export interface CookieParseOptions {
  readonly decode?: boolean;
}

/** Options for creating a new server-side session record. */
export interface SessionCreateOptions<
  TData extends SessionData = SessionData,
> {
  readonly actor?: SessionActor;
  readonly data?: TData;
  readonly maxAgeMs?: number;
}

/** Options for updating an existing server-side session record. */
export interface SessionUpdateOptions<
  TData extends SessionData = SessionData,
> {
  readonly actor?: SessionActor;
  readonly data?: Partial<TData>;
  readonly maxAgeMs?: number;
}

/**
 * Options for {@link SessionManager.rotate}. Like {@link SessionUpdateOptions}
 * (so you can attach the authenticated actor while rotating), plus an optional
 * id prefix for the freshly minted session id.
 */
export interface SessionRotateOptions<
  TData extends SessionData = SessionData,
> extends SessionUpdateOptions<TData> {
  /** Prefix for the new session id (see {@link createSessionId}). */
  readonly idPrefix?: string;
}

/** Options for fetching a session by cookie or id. */
export interface SessionGetOptions {
  readonly allowExpired?: boolean;
}

/** Options for destroying a session by cookie or id. */
export interface SessionDestroyOptions {
  readonly silent?: boolean;
}

/** Async-first adapter interface for session storage backends. */
export interface SessionStore {
  get<TData extends SessionData = SessionData>(
    id: SessionId,
  ): Promise<SessionRecord<TData> | undefined>;

  set<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
  ): Promise<void>;

  delete(
    id: SessionId,
  ): Promise<boolean>;

  touch?(
    id: SessionId,
    expiresAt?: string,
  ): Promise<void>;

  clear?(): Promise<void>;

  close?(): Promise<void>;
}

/** Session manager for server-side session lifecycle and cookie boundaries. */
export interface SessionManager {
  create<TData extends SessionData = SessionData>(
    options?: SessionCreateOptions<TData>,
  ): Promise<SessionRecord<TData>>;

  get<TData extends SessionData = SessionData>(
    requestOrHeaders: Request | Headers,
    options?: SessionGetOptions,
  ): Promise<SessionRecord<TData> | undefined>;

  getById<TData extends SessionData = SessionData>(
    id: SessionId,
    options?: SessionGetOptions,
  ): Promise<SessionRecord<TData> | undefined>;

  save<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
  ): Promise<void>;

  update<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
    options: SessionUpdateOptions<TData>,
  ): Promise<SessionRecord<TData>>;

  /**
   * Issues a new session id for an existing session, persisting it under the new
   * id and deleting the old one. Call this on login and privilege change to
   * defend against session fixation. Optionally applies actor/data/maxAge
   * updates in the same step. Re-`commit` afterwards to set the new cookie.
   */
  rotate<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
    options?: SessionRotateOptions<TData>,
  ): Promise<SessionRecord<TData>>;

  destroy(
    requestOrHeaders: Request | Headers,
    options?: SessionDestroyOptions,
  ): Promise<boolean>;

  destroyById(
    id: SessionId,
    options?: SessionDestroyOptions,
  ): Promise<boolean>;

  requireSession<TData extends SessionData = SessionData>(
    requestOrHeaders: Request | Headers,
  ): Promise<SessionRecord<TData>>;

  requireActor(
    requestOrHeaders: Request | Headers,
  ): Promise<SessionActor>;

  commit(
    headers: Headers,
    session: SessionRecord,
  ): void;

  clearCookie(
    headers: Headers,
  ): void;

  cookieName(): string;

  close(): Promise<void>;
}

/** Options for creating a {@link SessionManager}. */
export interface SessionManagerOptions {
  readonly store?: SessionStore;
  readonly cookie?: SessionCookieOptions;
  readonly maxAgeMs?: number;
  readonly rolling?: boolean;
  readonly logger?: Logger;
}

/** Options for the in-memory session store. */
export interface MemorySessionStoreOptions {
  readonly maxSessions?: number;
  readonly cloneSessions?: boolean;
}

/** Options for a cache-backed {@link SessionStore}. */
export interface CacheSessionStoreOptions {
  readonly prefix?: string;
  readonly ttlMs?: number;
}

/** Options for generating a session id. */
export interface CreateSessionIdOptions {
  readonly bytes?: number;
  readonly prefix?: string;
}

/** Options accepted when constructing a {@link SessionError}. */
export interface SessionErrorOptions {
  readonly code?: SessionErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for session lifecycle, cookie, and actor failures. */
export class SessionError extends RootwareError {
  constructor(message: string, options: SessionErrorOptions = {}) {
    super(message, {
      code: options.code ?? "SESSION_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Creates a session manager with memory storage by default. */
export function createSessionManager(
  options: SessionManagerOptions = {},
): SessionManager {
  const store = options.store ?? memorySessionStore();
  const cookie = normalizeCookieOptions(options.cookie);
  const maxAgeMs = normalizeOptionalPositiveInteger(
    options.maxAgeMs,
    "maxAgeMs",
    "SESSION_INVALID",
  );

  return new RootwareSessionManager({
    store,
    cookie,
    maxAgeMs,
    rolling: options.rolling ?? false,
    logger: options.logger,
  });
}

/**
 * Creates an in-memory store for tests and single-process development.
 *
 * Production applications should use a persistent or distributed store.
 */
export function memorySessionStore(
  options: MemorySessionStoreOptions = {},
): SessionStore {
  const sessions = new Map<SessionId, SessionRecord>();
  const maxSessions = normalizeOptionalPositiveInteger(
    options.maxSessions,
    "maxSessions",
    "SESSION_UNKNOWN_ERROR",
  );
  const cloneSessions = options.cloneSessions ?? false;

  return {
    get<TData extends SessionData = SessionData>(
      id: SessionId,
    ): Promise<SessionRecord<TData> | undefined> {
      const sessionId = normalizeSessionId(id);
      const session = sessions.get(sessionId);

      if (session === undefined) {
        return Promise.resolve(undefined);
      }

      if (isSessionExpired(session)) {
        sessions.delete(sessionId);
        return Promise.resolve(undefined);
      }

      return Promise.resolve(
        cloneSessionForStore(session, cloneSessions) as SessionRecord<TData>,
      );
    },

    set<TData extends SessionData = SessionData>(
      session: SessionRecord<TData>,
    ): Promise<void> {
      const normalized = normalizeSessionRecord(session);

      if (sessions.has(normalized.id)) {
        sessions.delete(normalized.id);
      }

      sessions.set(
        normalized.id,
        cloneSessionForStore(normalized, cloneSessions),
      );
      evictOldestSessions(sessions, maxSessions);
      return Promise.resolve();
    },

    delete(id: SessionId): Promise<boolean> {
      return Promise.resolve(sessions.delete(normalizeSessionId(id)));
    },

    touch(id: SessionId, expiresAt?: string): Promise<void> {
      const sessionId = normalizeSessionId(id);
      const session = sessions.get(sessionId);

      if (session === undefined) {
        return Promise.resolve();
      }

      const updated = refreshSession(session, {
        now: new Date(),
      });

      sessions.set(sessionId, {
        ...updated,
        ...(expiresAt === undefined ? {} : {
          expiresAt: normalizeIsoString(expiresAt, "expiresAt"),
        }),
      });
      return Promise.resolve();
    },

    clear(): Promise<void> {
      sessions.clear();
      return Promise.resolve();
    },

    close(): Promise<void> {
      sessions.clear();
      return Promise.resolve();
    },
  };
}

/** Adapts a Rootware cache client into a session store. */
export function cacheSessionStore(
  cache: CacheClient,
  options: CacheSessionStoreOptions = {},
): SessionStore {
  const prefix = normalizeCachePrefix(options.prefix ?? DEFAULT_CACHE_PREFIX);
  const ttlMs = normalizeOptionalPositiveInteger(
    options.ttlMs,
    "ttlMs",
    "SESSION_INVALID",
  );

  return {
    async get<TData extends SessionData = SessionData>(
      id: SessionId,
    ): Promise<SessionRecord<TData> | undefined> {
      const session = await cache.get<SessionRecord<TData>>(
        sessionCacheKey(prefix, id),
      );

      if (session === undefined) {
        return undefined;
      }

      return normalizeSessionRecord(session);
    },

    async set<TData extends SessionData = SessionData>(
      session: SessionRecord<TData>,
    ): Promise<void> {
      const normalized = normalizeSessionRecord(session);
      const resolvedTtlMs = resolveCacheTtlMs(normalized, ttlMs);

      await cache.set(
        sessionCacheKey(prefix, normalized.id),
        normalized,
        resolvedTtlMs === undefined ? undefined : { ttlMs: resolvedTtlMs },
      );
    },

    delete(id: SessionId): Promise<boolean> {
      return cache.delete(sessionCacheKey(prefix, id));
    },

    async touch(id: SessionId, expiresAt?: string): Promise<void> {
      const key = sessionCacheKey(prefix, id);
      const session = await cache.get<SessionRecord>(key);

      if (session === undefined) {
        return;
      }

      const updated = {
        ...refreshSession(session),
        ...(expiresAt === undefined ? {} : {
          expiresAt: normalizeIsoString(expiresAt, "expiresAt"),
        }),
      };
      const resolvedTtlMs = resolveCacheTtlMs(updated, ttlMs);

      await cache.set(
        key,
        normalizeSessionRecord(updated),
        resolvedTtlMs === undefined ? undefined : { ttlMs: resolvedTtlMs },
      );
    },

    clear(): Promise<void> {
      return Promise.resolve();
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** Creates a URL-safe session id using cryptographically secure randomness. */
export function createSessionId(
  options: CreateSessionIdOptions = {},
): SessionId {
  const bytes = normalizeOptionalPositiveInteger(
    options.bytes ?? DEFAULT_SESSION_ID_BYTES,
    "bytes",
    "SESSION_INVALID",
  ) ?? DEFAULT_SESSION_ID_BYTES;
  const crypto = globalThis.crypto;

  if (crypto === undefined || typeof crypto.getRandomValues !== "function") {
    throw new SessionError("Secure random generation is not available", {
      code: "SESSION_CREATE_FAILED",
      severity: "fatal",
      details: { reason: "crypto.getRandomValues unavailable" },
    });
  }

  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  const random = bytesToHex(randomBytes);

  if (options.prefix === undefined || options.prefix.trim().length === 0) {
    return random;
  }

  const prefix = normalizeSessionIdPrefix(options.prefix);
  return `${prefix}_${random}`;
}

/** Creates a server-side session record. */
export function createSessionRecord<
  TData extends SessionData = SessionData,
>(
  options: SessionCreateOptions<TData> & {
    readonly id?: SessionId;
    readonly now?: Date | string | number;
  } = {},
): SessionRecord<TData> {
  const id = options.id === undefined
    ? createSessionId()
    : normalizeSessionId(options.id);
  const now = toDate(options.now ?? new Date());
  const maxAgeMs = normalizeOptionalPositiveInteger(
    options.maxAgeMs,
    "maxAgeMs",
    "SESSION_INVALID",
  );
  const data = cloneSessionData((options.data ?? {}) as TData);
  const actor = options.actor === undefined
    ? undefined
    : cloneSessionActor(options.actor);
  const timestamp = now.toISOString();

  return {
    id,
    ...(actor === undefined ? {} : { actor }),
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(maxAgeMs === undefined ? {} : {
      expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
    }),
  };
}

/** Returns true when a session is revoked or expired. */
export function isSessionExpired(
  session: SessionRecord,
  now?: Date | string | number,
): boolean {
  if (session.revokedAt !== undefined) {
    return true;
  }

  if (session.expiresAt === undefined) {
    return false;
  }

  return toDate(now ?? new Date()).getTime() >=
    toDate(session.expiresAt).getTime();
}

/** Returns a refreshed copy of a session without mutating the input. */
export function refreshSession<TData extends SessionData = SessionData>(
  session: SessionRecord<TData>,
  options: {
    readonly maxAgeMs?: number;
    readonly now?: Date | string | number;
  } = {},
): SessionRecord<TData> {
  const now = toDate(options.now ?? new Date());
  const maxAgeMs = normalizeOptionalPositiveInteger(
    options.maxAgeMs,
    "maxAgeMs",
    "SESSION_INVALID",
  );

  return {
    ...normalizeSessionRecord(session),
    updatedAt: now.toISOString(),
    ...(maxAgeMs === undefined ? {} : {
      expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
    }),
  };
}

/** Parses a Cookie header into a name/value object. */
export function parseCookieHeader(
  header: string | null | undefined,
  options: CookieParseOptions = {},
): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (header === null || header === undefined || header.trim().length === 0) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();

    if (!isValidCookieName(name)) {
      continue;
    }

    if (hasHeaderUnsafeCharacter(rawValue)) {
      continue;
    }

    cookies[name] = options.decode === false
      ? rawValue
      : safeDecodeURIComponent(rawValue);
  }

  return cookies;
}

/** Reads a named cookie from a Request or Headers object. */
export function getCookie(
  requestOrHeaders: Request | Headers,
  name: string,
): string | undefined {
  validateCookieName(name);
  const headers = requestOrHeaders instanceof Request
    ? requestOrHeaders.headers
    : requestOrHeaders;
  const cookies = parseCookieHeader(headers.get("cookie"));

  return cookies[name];
}

/** Serializes a Set-Cookie header value. */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieSerializeOptions = {},
): string {
  validateCookieName(name);

  if (hasHeaderUnsafeCharacter(value)) {
    throw new SessionError("Cookie value contains invalid characters", {
      code: "SESSION_COOKIE_INVALID",
      details: { name },
    });
  }

  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAgeSeconds !== undefined) {
    const maxAgeSeconds = normalizeOptionalNonNegativeInteger(
      options.maxAgeSeconds,
      "maxAgeSeconds",
      "SESSION_COOKIE_INVALID",
    );
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  if (options.domain !== undefined) {
    const domain = validateCookieAttribute("Domain", options.domain);
    parts.push(`Domain=${domain}`);
  }

  if (options.path !== undefined) {
    const path = validateCookieAttribute("Path", options.path);
    parts.push(`Path=${path}`);
  }

  if (options.expires !== undefined) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly === true) {
    parts.push("HttpOnly");
  }

  if (options.secure === true) {
    parts.push("Secure");
  }

  if (options.sameSite !== undefined) {
    parts.push(`SameSite=${formatCookieSameSite(options.sameSite)}`);
  }

  if (options.priority !== undefined) {
    parts.push(`Priority=${formatCookiePriority(options.priority)}`);
  }

  return parts.join("; ");
}

/** Creates a Set-Cookie value for a session id cookie. */
export function createSetCookieHeader(
  session: SessionRecord,
  options: SessionCookieOptions,
): string {
  const cookie = normalizeCookieOptions(options);
  const expires = session.expiresAt === undefined
    ? undefined
    : toDate(session.expiresAt);

  return serializeCookie(cookie.name, session.id, {
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    maxAgeSeconds: cookie.maxAgeSeconds,
    expires,
    priority: cookie.priority,
  });
}

/** Creates an expired Set-Cookie value that removes the session cookie. */
export function createClearCookieHeader(
  options: SessionCookieOptions = {},
): string {
  const cookie = normalizeCookieOptions(options);

  return serializeCookie(cookie.name, "", {
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    maxAgeSeconds: 0,
    expires: new Date(0),
    priority: cookie.priority,
  });
}

/** Appends a Set-Cookie value without overwriting existing Set-Cookie headers. */
export function appendSetCookie(headers: Headers, value: string): void {
  headers.append("set-cookie", value);
}

/** Applies secure cookie defaults and validates cookie options. */
export function normalizeCookieOptions(
  options: SessionCookieOptions = {},
):
  & Required<
    Pick<
      SessionCookieOptions,
      "name" | "path" | "secure" | "httpOnly" | "sameSite"
    >
  >
  & Omit<
    SessionCookieOptions,
    "name" | "path" | "secure" | "httpOnly" | "sameSite"
  > {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const path = options.path ?? DEFAULT_COOKIE_PATH;
  const secure = options.secure ?? DEFAULT_COOKIE_SECURE;
  const httpOnly = options.httpOnly ?? DEFAULT_COOKIE_HTTP_ONLY;
  const sameSite = options.sameSite ?? DEFAULT_COOKIE_SAME_SITE;

  validateCookieName(name);
  validateCookieAttribute("Path", path);

  if (options.domain !== undefined) {
    validateCookieAttribute("Domain", options.domain);
  }

  if (options.maxAgeSeconds !== undefined) {
    normalizeOptionalNonNegativeInteger(
      options.maxAgeSeconds,
      "maxAgeSeconds",
      "SESSION_COOKIE_INVALID",
    );
  }

  validateSameSite(sameSite);

  if (options.priority !== undefined) {
    validatePriority(options.priority);
  }

  return {
    ...options,
    name,
    path,
    secure,
    httpOnly,
    sameSite,
  };
}

/** Returns a safe, redacted representation for logs. */
export function safeSessionInfo(
  session: SessionRecord,
): Record<string, unknown> {
  return {
    id: truncateSessionId(session.id),
    ...(session.actor?.id === undefined ? {} : { actorId: session.actor.id }),
    ...(session.actor?.type === undefined
      ? {}
      : { actorType: session.actor.type }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.expiresAt === undefined
      ? {}
      : { expiresAt: session.expiresAt }),
    ...(session.revokedAt === undefined
      ? {}
      : { revokedAt: session.revokedAt }),
  };
}

/** Reason a {@link verifyCsrf} check failed. */
export type CsrfFailureReason =
  | "missing-token"
  | "token-mismatch"
  | "origin-mismatch";

/** Result of a CSRF check. */
export type CsrfResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CsrfFailureReason };

/** Options for the CSRF double-submit cookie (readable by client JS). */
export interface CsrfCookieOptions {
  /** Cookie name; defaults to `"csrf"`. */
  readonly name?: string;
  readonly domain?: string;
  readonly path?: string;
  /** `Secure` flag; defaults to `true`. */
  readonly secure?: boolean;
  /** `SameSite`; defaults to `"lax"`. */
  readonly sameSite?: CookieSameSite;
  readonly maxAgeSeconds?: number;
  readonly priority?: CookiePriority;
}

/** Options for {@link verifyCsrf} / {@link assertCsrf}. */
export interface CsrfVerifyOptions {
  /** Double-submit cookie name; defaults to `"csrf"`. */
  readonly cookieName?: string;
  /** Request header carrying the echoed token; defaults to `"x-csrf-token"`. */
  readonly headerName?: string;
  /** Methods that skip the check; defaults to `GET`, `HEAD`, `OPTIONS`. */
  readonly safeMethods?: readonly string[];
  /** Extra allowed origins; the request's own origin is always allowed. */
  readonly allowedOrigins?: readonly string[];
  /** Fail when no `Origin`/`Sec-Fetch-Site` is present. Defaults to `false`. */
  readonly requireOrigin?: boolean;
}

/** Creates a URL-safe CSRF token using cryptographically secure randomness. */
export function createCsrfToken(bytes = 32): string {
  const size =
    normalizeOptionalPositiveInteger(bytes, "bytes", "SESSION_INVALID") ??
      32;
  const crypto = globalThis.crypto;

  if (crypto === undefined || typeof crypto.getRandomValues !== "function") {
    throw new SessionError("Secure random generation is not available", {
      code: "SESSION_CREATE_FAILED",
      severity: "fatal",
      details: { reason: "crypto.getRandomValues unavailable" },
    });
  }

  const randomBytes = new Uint8Array(size);
  crypto.getRandomValues(randomBytes);
  return bytesToHex(randomBytes);
}

/**
 * Creates a `Set-Cookie` value for the CSRF double-submit token. The cookie is
 * intentionally **not** `HttpOnly` so the client can read it and echo it back in
 * the configured header; pair it with a `SameSite` policy and HTTPS.
 */
export function createCsrfCookieHeader(
  token: string,
  options: CsrfCookieOptions = {},
): string {
  return serializeCookie(options.name ?? "csrf", token, {
    domain: options.domain,
    path: options.path ?? DEFAULT_COOKIE_PATH,
    secure: options.secure ?? true,
    httpOnly: false,
    sameSite: options.sameSite ?? "lax",
    maxAgeSeconds: options.maxAgeSeconds,
    priority: options.priority,
  });
}

/** Returns true when a request's `Origin`/`Sec-Fetch-Site` is same-origin. */
export function isSameOriginRequest(
  request: Request,
  allowedOrigins: readonly string[] = [],
): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin === null) {
    // No Origin header: rely on Sec-Fetch-Site (if any) and the token check.
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * Verifies a request against CSRF using origin validation plus a double-submit
 * cookie token. Safe methods always pass. For unsafe methods, the `Origin`/
 * `Sec-Fetch-Site` must be same-origin (or allow-listed) and the cookie token
 * must equal the header token (compared in constant time).
 */
export function verifyCsrf(
  request: Request,
  options: CsrfVerifyOptions = {},
): CsrfResult {
  const safeMethods = options.safeMethods ?? ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(request.method.toUpperCase())) {
    return { ok: true };
  }

  const hasOriginSignal = request.headers.get("origin") !== null ||
    request.headers.get("sec-fetch-site") !== null;
  if (options.requireOrigin === true && !hasOriginSignal) {
    return { ok: false, reason: "origin-mismatch" };
  }

  if (!isSameOriginRequest(request, options.allowedOrigins ?? [])) {
    return { ok: false, reason: "origin-mismatch" };
  }

  const cookieToken = parseCookieHeader(
    request.headers.get("cookie"),
  )[options.cookieName ?? "csrf"];
  const headerToken = request.headers.get(options.headerName ?? "x-csrf-token");

  if (
    cookieToken === undefined || cookieToken.length === 0 ||
    headerToken === null || headerToken.length === 0
  ) {
    return { ok: false, reason: "missing-token" };
  }

  if (!timingSafeEqualString(cookieToken, headerToken)) {
    return { ok: false, reason: "token-mismatch" };
  }

  return { ok: true };
}

/** Like {@link verifyCsrf}, but throws a `SESSION_CSRF_INVALID` error on failure. */
export function assertCsrf(
  request: Request,
  options: CsrfVerifyOptions = {},
): void {
  const result = verifyCsrf(request, options);

  if (!result.ok) {
    throw new SessionError("CSRF validation failed", {
      code: "SESSION_CSRF_INVALID",
      status: 403,
      expose: true,
      severity: "warn",
      details: { reason: result.reason },
    });
  }
}

/** Returns true when the actor carries `role`. */
export function actorHasRole(actor: SessionActor, role: string): boolean {
  return actor.roles?.includes(role) ?? false;
}

/** Returns true when the actor carries at least one of `roles`. */
export function actorHasAnyRole(
  actor: SessionActor,
  roles: readonly string[],
): boolean {
  return roles.some((role) => actorHasRole(actor, role));
}

/** Returns true when the actor carries `permission`. */
export function actorHasPermission(
  actor: SessionActor,
  permission: string,
): boolean {
  return actor.permissions?.includes(permission) ?? false;
}

/** Returns true when the actor carries every one of `permissions`. */
export function actorHasAllPermissions(
  actor: SessionActor,
  permissions: readonly string[],
): boolean {
  return permissions.every((permission) =>
    actorHasPermission(actor, permission)
  );
}

/** Throws `SESSION_FORBIDDEN` unless the actor carries `role`. */
export function assertActorRole(actor: SessionActor, role: string): void {
  if (!actorHasRole(actor, role)) {
    throw new SessionError("Actor is missing a required role", {
      code: "SESSION_FORBIDDEN",
      status: 403,
      expose: true,
      severity: "warn",
      details: { required: role, kind: "role" },
    });
  }
}

/** Throws `SESSION_FORBIDDEN` unless the actor carries `permission`. */
export function assertActorPermission(
  actor: SessionActor,
  permission: string,
): void {
  if (!actorHasPermission(actor, permission)) {
    throw new SessionError("Actor is missing a required permission", {
      code: "SESSION_FORBIDDEN",
      status: 403,
      expose: true,
      severity: "warn",
      details: { required: permission, kind: "permission" },
    });
  }
}

/** Creates a session manager that never persists sessions. */
export function noopSessionManager(): SessionManager {
  return {
    create<TData extends SessionData = SessionData>(
      options?: SessionCreateOptions<TData>,
    ): Promise<SessionRecord<TData>> {
      return Promise.resolve(createSessionRecord(options));
    },

    get<TData extends SessionData = SessionData>(
      _requestOrHeaders: Request | Headers,
      _options?: SessionGetOptions,
    ): Promise<SessionRecord<TData> | undefined> {
      return Promise.resolve(undefined);
    },

    getById<TData extends SessionData = SessionData>(
      _id: SessionId,
      _options?: SessionGetOptions,
    ): Promise<SessionRecord<TData> | undefined> {
      return Promise.resolve(undefined);
    },

    save<TData extends SessionData = SessionData>(
      _session: SessionRecord<TData>,
    ): Promise<void> {
      return Promise.resolve();
    },

    update<TData extends SessionData = SessionData>(
      session: SessionRecord<TData>,
      options: SessionUpdateOptions<TData>,
    ): Promise<SessionRecord<TData>> {
      return Promise.resolve(updateSessionRecord(session, options));
    },

    rotate<TData extends SessionData = SessionData>(
      session: SessionRecord<TData>,
      options: SessionRotateOptions<TData> = {},
    ): Promise<SessionRecord<TData>> {
      const hasUpdates = options.actor !== undefined ||
        options.data !== undefined || options.maxAgeMs !== undefined;
      const base = hasUpdates
        ? updateSessionRecord(session, options)
        : normalizeSessionRecord(session);
      return Promise.resolve({
        ...base,
        id: createSessionId(
          options.idPrefix === undefined ? {} : { prefix: options.idPrefix },
        ),
      });
    },

    destroy(
      _requestOrHeaders: Request | Headers,
      _options?: SessionDestroyOptions,
    ): Promise<boolean> {
      return Promise.resolve(false);
    },

    destroyById(
      _id: SessionId,
      _options?: SessionDestroyOptions,
    ): Promise<boolean> {
      return Promise.resolve(false);
    },

    requireSession<TData extends SessionData = SessionData>(
      _requestOrHeaders: Request | Headers,
    ): Promise<SessionRecord<TData>> {
      return Promise.reject(
        new SessionError("Session is required", {
          code: "SESSION_MISSING",
          status: 401,
          expose: true,
          severity: "warn",
        }),
      );
    },

    requireActor(_requestOrHeaders: Request | Headers): Promise<SessionActor> {
      return Promise.reject(
        new SessionError("Session actor is required", {
          code: "SESSION_ACTOR_REQUIRED",
          status: 401,
          expose: true,
          severity: "warn",
        }),
      );
    },

    commit(_headers: Headers, _session: SessionRecord): void {},

    clearCookie(_headers: Headers): void {},

    cookieName(): string {
      return DEFAULT_COOKIE_NAME;
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

interface RootwareSessionManagerOptions {
  readonly store: SessionStore;
  readonly cookie: ReturnType<typeof normalizeCookieOptions>;
  readonly maxAgeMs?: number;
  readonly rolling: boolean;
  readonly logger?: Logger;
}

class RootwareSessionManager implements SessionManager {
  readonly #store: SessionStore;
  readonly #cookie: ReturnType<typeof normalizeCookieOptions>;
  readonly #maxAgeMs?: number;
  readonly #rolling: boolean;
  readonly #logger?: Logger;

  constructor(options: RootwareSessionManagerOptions) {
    this.#store = options.store;
    this.#cookie = options.cookie;
    this.#maxAgeMs = options.maxAgeMs;
    this.#rolling = options.rolling;
    this.#logger = options.logger;
  }

  async create<TData extends SessionData = SessionData>(
    options: SessionCreateOptions<TData> = {},
  ): Promise<SessionRecord<TData>> {
    try {
      const session = createSessionRecord({
        ...options,
        maxAgeMs: options.maxAgeMs ?? this.#maxAgeMs,
      });

      await this.#store.set(session);
      this.#debug({ session: safeSessionInfo(session) }, "session created");
      return session;
    } catch (error) {
      throw this.#operationError("create", "SESSION_CREATE_FAILED", error);
    }
  }

  async get<TData extends SessionData = SessionData>(
    requestOrHeaders: Request | Headers,
    options: SessionGetOptions = {},
  ): Promise<SessionRecord<TData> | undefined> {
    const id = getCookie(requestOrHeaders, this.#cookie.name);

    if (id === undefined) {
      this.#debug(undefined, "session miss");
      return undefined;
    }

    return await this.getById<TData>(id, options);
  }

  async getById<TData extends SessionData = SessionData>(
    id: SessionId,
    options: SessionGetOptions = {},
  ): Promise<SessionRecord<TData> | undefined> {
    const sessionId = normalizeSessionId(id);

    try {
      const session = await this.#store.get<TData>(sessionId);

      if (session === undefined) {
        this.#debug(undefined, "session miss");
        return undefined;
      }

      if (isSessionExpired(session)) {
        if (options.allowExpired === true) {
          return session;
        }

        await this.#store.delete(sessionId);
        this.#debug(undefined, "session miss");
        return undefined;
      }

      if (this.#rolling) {
        const refreshed = refreshSession(session, {
          maxAgeMs: this.#maxAgeMs,
        });
        await this.#store.set(refreshed);
        this.#debug({ session: safeSessionInfo(refreshed) }, "session hit");
        return refreshed;
      }

      this.#debug({ session: safeSessionInfo(session) }, "session hit");
      return session;
    } catch (error) {
      throw this.#operationError("get", "SESSION_GET_FAILED", error, {
        sessionId: truncateSessionId(sessionId),
      });
    }
  }

  async save<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
  ): Promise<void> {
    try {
      await this.#store.set(refreshSession(session));
    } catch (error) {
      throw this.#operationError("save", "SESSION_SAVE_FAILED", error, {
        sessionId: truncateSessionId(session.id),
      });
    }
  }

  async update<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
    options: SessionUpdateOptions<TData>,
  ): Promise<SessionRecord<TData>> {
    try {
      const updated = updateSessionRecord(session, options);
      await this.#store.set(updated);
      return updated;
    } catch (error) {
      throw this.#operationError("update", "SESSION_SAVE_FAILED", error, {
        sessionId: truncateSessionId(session.id),
      });
    }
  }

  async rotate<TData extends SessionData = SessionData>(
    session: SessionRecord<TData>,
    options: SessionRotateOptions<TData> = {},
  ): Promise<SessionRecord<TData>> {
    const previousId = normalizeSessionId(session.id);

    try {
      const hasUpdates = options.actor !== undefined ||
        options.data !== undefined || options.maxAgeMs !== undefined;
      const base = hasUpdates
        ? updateSessionRecord(session, options)
        : normalizeSessionRecord(session);
      const rotated: SessionRecord<TData> = {
        ...base,
        id: createSessionId(
          options.idPrefix === undefined ? {} : { prefix: options.idPrefix },
        ),
        updatedAt: new Date().toISOString(),
      };

      await this.#store.set(rotated);

      if (rotated.id !== previousId) {
        await this.#store.delete(previousId);
      }

      this.#debug(
        {
          session: safeSessionInfo(rotated),
          previousId: truncateSessionId(previousId),
        },
        "session rotated",
      );
      return rotated;
    } catch (error) {
      throw this.#operationError("rotate", "SESSION_ROTATE_FAILED", error, {
        sessionId: truncateSessionId(previousId),
      });
    }
  }

  async destroy(
    requestOrHeaders: Request | Headers,
    options: SessionDestroyOptions = {},
  ): Promise<boolean> {
    const id = getCookie(requestOrHeaders, this.#cookie.name);

    if (id === undefined) {
      return false;
    }

    return await this.destroyById(id, options);
  }

  async destroyById(
    id: SessionId,
    options: SessionDestroyOptions = {},
  ): Promise<boolean> {
    try {
      const sessionId = normalizeSessionId(id);
      const deleted = await this.#store.delete(sessionId);
      this.#debug(
        { sessionId: truncateSessionId(sessionId), deleted },
        "session destroyed",
      );
      return deleted;
    } catch (error) {
      if (options.silent === true) {
        return false;
      }

      throw this.#operationError("destroy", "SESSION_DESTROY_FAILED", error);
    }
  }

  async requireSession<TData extends SessionData = SessionData>(
    requestOrHeaders: Request | Headers,
  ): Promise<SessionRecord<TData>> {
    const session = await this.get<TData>(requestOrHeaders);

    if (session === undefined) {
      throw new SessionError("Session is required", {
        code: "SESSION_MISSING",
        status: 401,
        expose: true,
        severity: "warn",
      });
    }

    return session;
  }

  async requireActor(
    requestOrHeaders: Request | Headers,
  ): Promise<SessionActor> {
    const session = await this.requireSession(requestOrHeaders);

    if (session.actor === undefined) {
      throw new SessionError("Session actor is required", {
        code: "SESSION_ACTOR_REQUIRED",
        status: 401,
        expose: true,
        severity: "warn",
        details: { sessionId: truncateSessionId(session.id) },
      });
    }

    return session.actor;
  }

  commit(headers: Headers, session: SessionRecord): void {
    appendSetCookie(headers, createSetCookieHeader(session, this.#cookie));
  }

  clearCookie(headers: Headers): void {
    appendSetCookie(headers, createClearCookieHeader(this.#cookie));
  }

  cookieName(): string {
    return this.#cookie.name;
  }

  async close(): Promise<void> {
    try {
      await this.#store.close?.();
    } catch (error) {
      throw this.#operationError("close", "SESSION_UNKNOWN_ERROR", error);
    }
  }

  #operationError(
    operation: string,
    code: SessionErrorCode,
    error: unknown,
    details: Record<string, unknown> = {},
  ): SessionError {
    this.#error({ operation, ...details }, "session operation failed");

    if (error instanceof SessionError) {
      return error;
    }

    return new SessionError(`Session operation failed: ${operation}`, {
      code,
      severity: "error",
      details: { operation, ...details },
      cause: error,
    });
  }

  #debug(record: Record<string, unknown> | undefined, message: string): void {
    try {
      if (record === undefined) {
        this.#logger?.debug(message);
      } else {
        this.#logger?.debug(record, message);
      }
    } catch {
      // Logging must never break session operations.
    }
  }

  #error(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.error(record, message);
    } catch {
      // Logging must never break session operations.
    }
  }
}

function updateSessionRecord<TData extends SessionData>(
  session: SessionRecord<TData>,
  options: SessionUpdateOptions<TData>,
): SessionRecord<TData> {
  const normalized = normalizeSessionRecord(session);
  const now = new Date();
  const maxAgeMs = normalizeOptionalPositiveInteger(
    options.maxAgeMs,
    "maxAgeMs",
    "SESSION_INVALID",
  );
  const data = {
    ...normalized.data,
    ...(options.data ?? {}),
  } as TData;

  return {
    ...normalized,
    ...(options.actor === undefined
      ? {}
      : { actor: cloneSessionActor(options.actor) }),
    data: cloneSessionData(data),
    updatedAt: now.toISOString(),
    ...(maxAgeMs === undefined ? {} : {
      expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
    }),
  };
}

function normalizeSessionRecord<TData extends SessionData>(
  session: SessionRecord<TData>,
): SessionRecord<TData> {
  const id = normalizeSessionId(session.id);
  const data = cloneSessionData(session.data);
  const actor = session.actor === undefined
    ? undefined
    : cloneSessionActor(session.actor);

  return {
    id,
    ...(actor === undefined ? {} : { actor }),
    data,
    createdAt: normalizeIsoString(session.createdAt, "createdAt"),
    updatedAt: normalizeIsoString(session.updatedAt, "updatedAt"),
    ...(session.expiresAt === undefined ? {} : {
      expiresAt: normalizeIsoString(session.expiresAt, "expiresAt"),
    }),
    ...(session.revokedAt === undefined ? {} : {
      revokedAt: normalizeIsoString(session.revokedAt, "revokedAt"),
    }),
  };
}

function cloneSessionForStore<TData extends SessionData>(
  session: SessionRecord<TData>,
  cloneSession: boolean,
): SessionRecord<TData> {
  if (cloneSession) {
    return cloneWithStructuredClone(session);
  }

  return normalizeSessionRecord(session);
}

function cloneWithStructuredClone<TData extends SessionData>(
  session: SessionRecord<TData>,
): SessionRecord<TData> {
  try {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(session);
    }
  } catch {
    // Fall through to a safe shallow clone.
  }

  return normalizeSessionRecord(session);
}

function cloneSessionData<TData extends SessionData>(data: TData): TData {
  if (!isPlainRecord(data)) {
    throw new SessionError("Session data must be an object", {
      code: "SESSION_INVALID",
      details: { field: "data" },
    });
  }

  return { ...data } as TData;
}

function cloneSessionActor(actor: SessionActor): SessionActor {
  if (typeof actor.id !== "string" || actor.id.trim().length === 0) {
    throw new SessionError("Session actor id is required", {
      code: "SESSION_INVALID",
      details: { field: "actor.id" },
    });
  }

  return {
    ...actor,
    id: actor.id,
    ...(actor.roles === undefined ? {} : { roles: [...actor.roles] }),
    ...(actor.permissions === undefined
      ? {}
      : { permissions: [...actor.permissions] }),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSessionId(id: SessionId): SessionId {
  if (typeof id !== "string") {
    throw new SessionError("Session id must be a string", {
      code: "SESSION_INVALID",
    });
  }

  const normalized = id.trim();

  if (
    normalized.length === 0 ||
    hasHeaderUnsafeCharacter(normalized) ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new SessionError("Session id is invalid", {
      code: "SESSION_INVALID",
    });
  }

  return normalized;
}

function normalizeSessionIdPrefix(prefix: string): string {
  const normalized = prefix.trim();

  if (normalized.length === 0 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new SessionError("Session id prefix is invalid", {
      code: "SESSION_INVALID",
      details: { field: "prefix" },
    });
  }

  return normalized;
}

function normalizeCachePrefix(prefix: string): string {
  const normalized = prefix.trim();

  if (normalized.length === 0 || hasHeaderUnsafeCharacter(normalized)) {
    throw new SessionError("Session cache prefix is invalid", {
      code: "SESSION_INVALID",
      details: { field: "prefix" },
    });
  }

  return normalized;
}

function sessionCacheKey(prefix: string, id: SessionId): string {
  return `${prefix}:${normalizeSessionId(id)}`;
}

function resolveCacheTtlMs(
  session: SessionRecord,
  fallbackTtlMs: number | undefined,
): number | undefined {
  if (session.expiresAt !== undefined) {
    const ttlMs = toDate(session.expiresAt).getTime() - Date.now();

    if (ttlMs > 0) {
      return ttlMs;
    }
  }

  return fallbackTtlMs;
}

function normalizeIsoString(value: string, field: string): string {
  const date = toDate(value);
  const iso = date.toISOString();

  if (iso !== value) {
    return iso;
  }

  if (Number.isNaN(date.getTime())) {
    throw new SessionError("Session timestamp is invalid", {
      code: "SESSION_INVALID",
      details: { field },
    });
  }

  return value;
}

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new SessionError("Session date is invalid", {
      code: "SESSION_INVALID",
    });
  }

  return date;
}

function normalizeOptionalPositiveInteger(
  value: number | undefined,
  field: string,
  code: SessionErrorCode,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new SessionError(`${field} must be greater than zero`, {
      code,
      details: { field },
    });
  }

  return Math.floor(value);
}

function normalizeOptionalNonNegativeInteger(
  value: number | undefined,
  field: string,
  code: SessionErrorCode,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new SessionError(`${field} must be zero or greater`, {
      code,
      details: { field },
    });
  }

  return Math.floor(value);
}

function validateCookieName(name: string): void {
  if (!isValidCookieName(name)) {
    throw new SessionError("Cookie name is invalid", {
      code: "SESSION_COOKIE_INVALID",
      details: { name },
    });
  }
}

function isValidCookieName(name: string): boolean {
  return typeof name === "string" &&
    /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
}

function validateCookieAttribute(name: string, value: string): string {
  if (
    value.length === 0 || hasHeaderUnsafeCharacter(value) || value.includes(";")
  ) {
    throw new SessionError(`${name} cookie attribute is invalid`, {
      code: "SESSION_COOKIE_INVALID",
      details: { attribute: name },
    });
  }

  return value;
}

function validateSameSite(value: CookieSameSite): void {
  if (value !== "strict" && value !== "lax" && value !== "none") {
    throw new SessionError("Cookie sameSite value is invalid", {
      code: "SESSION_COOKIE_INVALID",
      details: { sameSite: value },
    });
  }
}

function validatePriority(value: CookiePriority): void {
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new SessionError("Cookie priority value is invalid", {
      code: "SESSION_COOKIE_INVALID",
      details: { priority: value },
    });
  }
}

function formatCookieSameSite(value: CookieSameSite): string {
  validateSameSite(value);

  if (value === "strict") {
    return "Strict";
  }

  if (value === "none") {
    return "None";
  }

  return "Lax";
}

function formatCookiePriority(value: CookiePriority): string {
  validatePriority(value);

  if (value === "low") {
    return "Low";
  }

  if (value === "high") {
    return "High";
  }

  return "Medium";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncateSessionId(id: SessionId): string {
  const normalized = typeof id === "string" ? id : "";

  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";

  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, "0");
  }

  return output;
}

/** Compares two strings in time independent of where they first differ. */
function timingSafeEqualString(a: string, b: string): boolean {
  // Fold the length comparison into the loop so a mismatched length still does
  // constant work and does not early-return.
  let mismatch = a.length ^ b.length;

  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ (b.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function evictOldestSessions(
  sessions: Map<SessionId, SessionRecord>,
  maxSessions: number | undefined,
): void {
  if (maxSessions === undefined) {
    return;
  }

  while (sessions.size > maxSessions) {
    const oldestKey = sessions.keys().next().value as SessionId | undefined;

    if (oldestKey === undefined) {
      return;
    }

    sessions.delete(oldestKey);
  }
}

function hasHeaderUnsafeCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

// Examples:
//
// const sessions = createSessionManager({
//   store: memorySessionStore(),
//   cookie: {
//     name: "sid",
//     httpOnly: true,
//     sameSite: "lax",
//     secure: true,
//     path: "/",
//     maxAgeSeconds: 60 * 60 * 24 * 7,
//   },
// });
//
// const session = await sessions.create({
//   actor: {
//     id: "u_123",
//     type: "user",
//     roles: ["member"],
//   },
//   data: { theme: "dark" },
// });
//
// const headers = new Headers();
// sessions.commit(headers, session);
//
// const request = new Request("https://example.com", {
//   headers: { cookie: `${sessions.cookieName()}=${session.id}` },
// });
// const currentSession = await sessions.get(request);
//
// const actor = await sessions.requireActor(request);
//
// const cacheStore = cacheSessionStore(cache, {
//   prefix: "session",
//   ttlMs: 60 * 60 * 1000,
// });
//
// const disabledSessions = noopSessionManager();
