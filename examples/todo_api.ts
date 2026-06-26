// deno-lint-ignore no-import-prefix
import { type Context, Hono } from "jsr:@hono/hono@^4.12.26";
import {
  createErrorFactory,
  defineErrorCode,
  serializeError,
  toRootwareError,
} from "@rootware/errors";
import { defineEnv, env, validateEnv } from "@rootware/env";
import { createLogger, type Logger, memorySink } from "@rootware/log";
import {
  assertValidSchemaSnapshot,
  deserializeSchemaSnapshot,
  serializeSchemaSnapshot,
} from "@rootware/schema";
import {
  and,
  columns,
  createSchemaSnapshot,
  defineTable,
  eq,
  type InferInsert,
  like,
  or,
} from "@rootware/orm";
import { createSqliteDb, type SqliteDatabase } from "@rootware/orm/sqlite";
import {
  type AppliedMigration,
  createMigrator,
  defineSqlMigration,
  type MigrationDriver,
  type MigrationStore,
} from "@rootware/migrate";
import { createHttpClient, type FetchLike } from "@rootware/http";
import {
  type CacheClient,
  createCache,
  memoryCacheStore,
} from "@rootware/cache";
import {
  cacheSessionStore,
  createSessionManager,
  safeSessionInfo,
  type SessionActor,
  type SessionManager,
} from "@rootware/session";
import { assert, assertEquals, assertExists } from "@rootware/testing";

export interface TodoApiConfig {
  readonly port: number;
  readonly databasePath: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly sessionSecure: boolean;
  readonly cacheTtlMs: number;
}

export interface CreateTodoApiOptions {
  readonly envSource?: Record<string, string | undefined>;
  readonly databasePath?: string;
}

export interface TodoApiResources {
  readonly app: Hono;
  readonly config: TodoApiConfig;
  readonly close: () => Promise<void>;
}

interface ResolvedTodoApiConfig extends TodoApiConfig {
  readonly ownsDatabasePath: boolean;
}

interface TodoRow {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly notes: string | null;
  readonly completed: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

interface TodoResponse {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly notes: string | null;
  readonly completed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

type TodoInsert = InferInsert<typeof todos>;

const TODO_ENV_SCHEMA = {
  TODO_API_PORT: env.integer().default(8000).describe("Todo API HTTP port"),
  TODO_API_DATABASE_PATH: env.string().optional().describe(
    "SQLite database path. Omit to use a disposable temp file.",
  ),
  TODO_API_LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default(
    "info",
  ),
  TODO_API_SESSION_SECURE: env.boolean().default(false).describe(
    "Whether the session cookie should include the Secure attribute.",
  ),
  TODO_API_CACHE_TTL_MS: env.integer().default(30_000).describe(
    "Todo lookup cache TTL in milliseconds.",
  ),
};

const todoValidationError = createErrorFactory({
  code: defineErrorCode("TODO_VALIDATION_FAILED"),
  status: 422,
  expose: true,
  severity: "warn",
});
const todoUnauthorizedError = createErrorFactory({
  code: defineErrorCode("TODO_UNAUTHORIZED"),
  status: 401,
  expose: true,
  severity: "warn",
});
const todoNotFoundError = createErrorFactory({
  code: defineErrorCode("TODO_NOT_FOUND"),
  status: 404,
  expose: true,
  severity: "info",
});
const todoConflictError = createErrorFactory({
  code: defineErrorCode("TODO_CONFLICT"),
  status: 409,
  expose: true,
  severity: "warn",
});

const todos = defineTable("todos", {
  id: columns.text().primaryKey(),
  ownerId: columns.text().notNull(),
  title: columns.varchar(160).notNull(),
  notes: columns.text().nullable().optional(),
  completed: columns.integer().default(0),
  createdAt: columns.text().notNull(),
  updatedAt: columns.text().notNull(),
  completedAt: columns.text().nullable().optional(),
});

const todoSchemaSnapshot = createSchemaSnapshot({
  dialect: "sqlite",
  tables: [todos],
  metadata: { example: "todo_api" },
});
assertValidSchemaSnapshot(todoSchemaSnapshot);
const serializedTodoSchema = serializeSchemaSnapshot(todoSchemaSnapshot);

const todoMigrations = [
  defineSqlMigration({
    id: "001_create_todos",
    description: "Create todos table",
    up: `
create table if not exists "todos" (
  "id" text primary key,
  "ownerId" text not null,
  "title" text not null,
  "notes" text,
  "completed" integer not null default 0 check ("completed" in (0, 1)),
  "createdAt" text not null,
  "updatedAt" text not null,
  "completedAt" text
)`.trim(),
    down: `drop table if exists "todos"`,
  }),
  defineSqlMigration({
    id: "002_index_todos_owner_updated",
    description: "Index todos by owner and update time",
    up:
      `create index if not exists "idx_todos_owner_updated" on "todos" ("ownerId", "updatedAt")`,
    down: `drop index if exists "idx_todos_owner_updated"`,
  }),
];

export async function createTodoApi(
  options: CreateTodoApiOptions = {},
): Promise<TodoApiResources> {
  const config = await resolveConfig(options);
  const logger = createLogger({
    level: config.logLevel,
    name: "todo-api-example",
    base: { service: "rootware-todo-api" },
    redact: ["authorization", "cookie", "set-cookie"],
  }, memorySink());

  const db = await createSqliteDb({
    path: config.databasePath,
    logger,
  });
  await ensureMigrationHistoryTable(db);

  const migrator = createMigrator({
    migrations: todoMigrations,
    store: sqliteMigrationStore(db),
    driver: sqliteMigrationDriver(db),
    logger,
  });
  await migrator.up();

  const cache = createCache({
    store: memoryCacheStore({ cloneValues: true }),
    namespace: "todo-api",
    defaultTtlMs: config.cacheTtlMs,
    logger,
  });
  const todoCache = cache.namespace("todos");
  const sessions = createSessionManager({
    store: cacheSessionStore(cache.namespace("sessions"), {
      prefix: "sid",
      ttlMs: 60 * 60 * 1000,
    }),
    cookie: {
      name: "rw_todo_sid",
      secure: config.sessionSecure,
      sameSite: "lax",
    },
    maxAgeMs: 60 * 60 * 1000,
    logger,
  });

  const app = createApp({
    db,
    migrator,
    cache: todoCache,
    sessions,
    logger,
    cacheTtlMs: config.cacheTtlMs,
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;

    await sessions.close();
    await cache.close();
    await migrator.close();
    await db.close();
    await logger.close();

    if (config.ownsDatabasePath) {
      await removeIfExists(config.databasePath);
    }
  };

  logger.info(
    { port: config.port, databasePath: config.databasePath },
    "todo api ready",
  );

  return { app, config, close };
}

export async function runTodoApiExample(): Promise<void> {
  const databasePath = await Deno.makeTempFile({
    prefix: "rootware-todo-api-",
    suffix: ".sqlite3",
  });
  let resources: TodoApiResources | undefined;

  try {
    resources = await createTodoApi({
      databasePath,
      envSource: {
        TODO_API_PORT: "0",
        TODO_API_LOG_LEVEL: "debug",
        TODO_API_SESSION_SECURE: "false",
        TODO_API_CACHE_TTL_MS: "30000",
      },
    });

    const fetch: FetchLike = (input, init) => {
      const request = new Request(input, init);
      return Promise.resolve(resources!.app.fetch(request));
    };
    const http = createHttpClient({
      baseUrl: "http://todo.example.test",
      fetch,
      maxResponseBytes: 16 * 1024,
      userAgent: "rootware-todo-api-example",
    });

    assertEquals(await http.getJson("/health"), {
      ok: true,
      service: "rootware-todo-api",
    });

    const unauthorized = await http.get("/todos", { expectOk: false });
    assertEquals(unauthorized.status, 401);

    const sessionResponse = await http.post("/sessions", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u_1" }),
    });
    const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0];
    assertExists(cookie);
    const sessionBody = await sessionResponse.json() as {
      readonly session: { readonly actorId?: string };
    };
    assertEquals(sessionBody.session.actorId, "u_1");

    const headers = { cookie };
    const created = await http.postJson<TodoResponse>("/todos", {
      title: "Write Rootware todo API example",
      notes: "Exercise Hono, SQLite, sessions, cache, and migrations.",
    }, { headers });
    assertEquals(created.completed, false);

    const list = await http.getJson<{ readonly todos: TodoResponse[] }>(
      "/todos",
      { headers },
    );
    assertEquals(list.todos.map((todo) => todo.id), [created.id]);

    const firstRead = await http.getJson<TodoResponse>(
      `/todos/${created.id}`,
      { headers },
    );
    const cachedRead = await http.getJson<TodoResponse>(
      `/todos/${created.id}`,
      { headers },
    );
    assertEquals(cachedRead, firstRead);

    const completed = await http.patchJson<TodoResponse>(
      `/todos/${created.id}`,
      { completed: true },
      { headers },
    );
    assertEquals(completed.completed, true);
    assertExists(completed.completedAt);

    const meta = await http.getJson<{
      readonly schema: string;
      readonly snapshot: { readonly dialect?: string };
      readonly migrations: {
        readonly pending: readonly string[];
        readonly applied: readonly string[];
      };
    }>("/meta/schema");
    const snapshot = deserializeSchemaSnapshot(meta.schema);
    assertEquals(snapshot.dialect, "sqlite");
    assertEquals(meta.snapshot.dialect, "sqlite");
    assertEquals(meta.migrations.pending, []);
    assert(meta.migrations.applied.length >= 2);

    const deleted = await http.deleteJson<{ readonly deleted: boolean }>(
      `/todos/${created.id}`,
      { headers },
    );
    assertEquals(deleted.deleted, true);

    const missing = await http.get(`/todos/${created.id}`, {
      headers,
      expectOk: false,
    });
    assertEquals(missing.status, 404);
  } finally {
    await resources?.close();
    await removeIfExists(databasePath);
  }
}

interface TodoAppServices {
  readonly db: SqliteDatabase;
  readonly migrator: ReturnType<typeof createMigrator>;
  readonly cache: CacheClient;
  readonly sessions: SessionManager;
  readonly logger: Logger;
  readonly cacheTtlMs: number;
}

function createApp(services: TodoAppServices): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      services.logger.info({
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        status: context.res.status,
        durationMs: elapsedMs(startedAt),
      }, "todo api request");
    }
  });

  app.onError((error) => {
    services.logger.error(
      { error: serializeError(toRootwareError(error)) },
      "todo api request failed",
    );
    return errorResponse(error);
  });

  app.notFound(() => {
    return errorResponse(todoNotFoundError("Route not found"));
  });

  app.get("/health", () => {
    return jsonResponse({ ok: true, service: "rootware-todo-api" });
  });

  app.get("/meta/schema", async () => {
    const plan = await services.migrator.plan();
    return jsonResponse({
      schema: serializedTodoSchema,
      snapshot: todoSchemaSnapshot,
      migrations: {
        applied: plan.applied.map((item) => item.migration.id),
        pending: plan.pending.map((item) => item.migration.id),
        hasPending: plan.hasPending,
      },
    });
  });

  app.post("/sessions", async (context) => {
    const body = await readJsonObject(context, { allowEmpty: true });
    const userId = typeof body.userId === "string" && body.userId.trim() !== ""
      ? body.userId.trim()
      : "demo";
    const session = await services.sessions.create({
      actor: { id: userId, type: "user", roles: ["demo"] },
      data: { source: "todo-api-example" },
    });
    const headers = new Headers();
    services.sessions.commit(headers, session);

    return jsonResponse(
      { session: safeSessionInfo(session) },
      { status: 201, headers },
    );
  });

  app.delete("/sessions/current", async (context) => {
    const destroyed = await services.sessions.destroy(context.req.raw, {
      silent: true,
    });
    const headers = new Headers();
    services.sessions.clearCookie(headers);
    return jsonResponse({ destroyed }, { headers });
  });

  app.get("/todos", async (context) => {
    const actor = await requireActor(context, services.sessions);
    const completed = parseCompletedQuery(context.req.query("completed"));
    const q = normalizeOptionalSearch(context.req.query("q"));
    const limit = parseIntegerQuery(context.req.query("limit"), {
      name: "limit",
      defaultValue: 25,
      min: 1,
      max: 100,
    });
    const offset = parseIntegerQuery(context.req.query("offset"), {
      name: "offset",
      defaultValue: 0,
      min: 0,
      max: 10_000,
    });
    const conditions = [
      eq(todos.columns.ownerId, actor.id),
      completed === undefined
        ? undefined
        : eq(todos.columns.completed, completed),
      q === undefined ? undefined : or(
        like(todos.columns.title, `%${q}%`),
        like(todos.columns.notes, `%${q}%`),
      ),
    ];
    const rows = await services.db.select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(todos.columns.updatedAt, "desc")
      .limit(limit)
      .offset(offset)
      .execute() as TodoRow[];

    return jsonResponse({ todos: rows.map(rowToTodo) });
  });

  app.post("/todos", async (context) => {
    const actor = await requireActor(context, services.sessions);
    const input = validateCreateTodoInput(await readJsonObject(context));
    const now = new Date().toISOString();
    const insert: TodoInsert = {
      id: crypto.randomUUID(),
      ownerId: actor.id,
      title: input.title,
      notes: input.notes,
      completed: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    try {
      await services.db.insert(todos).values(insert).execute();
    } catch (cause) {
      throw todoConflictError("Todo could not be created", { cause });
    }

    const created = await findTodo(services.db, actor.id, insert.id);
    assertExists(created);
    return jsonResponse(rowToTodo(created), { status: 201 });
  });

  app.get("/todos/:id", async (context) => {
    const actor = await requireActor(context, services.sessions);
    const id = normalizeTodoId(context.req.param("id"));
    const todo = await getCachedTodo(services, actor.id, id);

    if (todo === null) {
      throw todoNotFoundError("Todo was not found", {
        details: { id },
      });
    }

    return jsonResponse(todo);
  });

  app.patch("/todos/:id", async (context) => {
    const actor = await requireActor(context, services.sessions);
    const id = normalizeTodoId(context.req.param("id"));
    const existing = await findTodo(services.db, actor.id, id);

    if (existing === undefined) {
      throw todoNotFoundError("Todo was not found", { details: { id } });
    }

    const input = validatePatchTodoInput(await readJsonObject(context));
    const now = new Date().toISOString();
    const patch: Partial<TodoInsert> = {
      updatedAt: now,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.completed === undefined ? {} : {
        completed: input.completed ? 1 : 0,
        completedAt: input.completed ? now : null,
      }),
    };

    await services.db.update(todos)
      .set(patch)
      .where(and(eq(todos.columns.id, id), eq(todos.columns.ownerId, actor.id)))
      .execute();
    await services.cache.delete(todoCacheKey(actor.id, id), { silent: true });

    const updated = await findTodo(services.db, actor.id, id);
    assertExists(updated);
    return jsonResponse(rowToTodo(updated));
  });

  app.delete("/todos/:id", async (context) => {
    const actor = await requireActor(context, services.sessions);
    const id = normalizeTodoId(context.req.param("id"));
    const result = await services.db.delete(todos)
      .where(and(eq(todos.columns.id, id), eq(todos.columns.ownerId, actor.id)))
      .execute();

    if ((result.rowCount ?? 0) === 0) {
      throw todoNotFoundError("Todo was not found", { details: { id } });
    }

    await services.cache.delete(todoCacheKey(actor.id, id), { silent: true });
    return jsonResponse({ deleted: true });
  });

  return app;
}

async function resolveConfig(
  options: CreateTodoApiOptions,
): Promise<ResolvedTodoApiConfig> {
  const envConfig = options.envSource === undefined
    ? defineEnv(TODO_ENV_SCHEMA)
    : validateEnv(TODO_ENV_SCHEMA, options.envSource);
  const databasePath = options.databasePath ??
    envConfig.TODO_API_DATABASE_PATH ??
    await Deno.makeTempFile({
      prefix: "rootware-todo-api-",
      suffix: ".sqlite3",
    });

  return {
    port: envConfig.TODO_API_PORT,
    databasePath,
    logLevel: envConfig.TODO_API_LOG_LEVEL,
    sessionSecure: envConfig.TODO_API_SESSION_SECURE,
    cacheTtlMs: envConfig.TODO_API_CACHE_TTL_MS,
    ownsDatabasePath: options.databasePath === undefined &&
      envConfig.TODO_API_DATABASE_PATH === undefined,
  };
}

async function ensureMigrationHistoryTable(db: SqliteDatabase): Promise<void> {
  await db.execute(`
create table if not exists "rootware_migrations" (
  "id" text primary key,
  "checksum" text not null,
  "description" text,
  "appliedAt" text not null,
  "executionMs" real
)`.trim());
}

function sqliteMigrationDriver(db: SqliteDatabase): MigrationDriver {
  return {
    async execute(statement: string): Promise<void> {
      await db.execute(statement);
    },
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      return db.transaction(() => fn());
    },
  };
}

function sqliteMigrationStore(db: SqliteDatabase): MigrationStore {
  return {
    async listApplied(): Promise<AppliedMigration[]> {
      const result = await db.query<Record<string, unknown>>(
        `select "id", "checksum", "description", "appliedAt", "executionMs"
         from "rootware_migrations"
         order by "id"`,
      );
      return result.rows.map(rowToAppliedMigration);
    },

    async getApplied(id: string): Promise<AppliedMigration | undefined> {
      const result = await db.query<Record<string, unknown>>(
        `select "id", "checksum", "description", "appliedAt", "executionMs"
         from "rootware_migrations"
         where "id" = ?`,
        [id],
      );
      return result.rows[0] === undefined
        ? undefined
        : rowToAppliedMigration(result.rows[0]);
    },

    async markApplied(migration: AppliedMigration): Promise<void> {
      await db.execute(
        `insert or replace into "rootware_migrations"
         ("id", "checksum", "description", "appliedAt", "executionMs")
         values (?, ?, ?, ?, ?)`,
        [
          migration.id,
          migration.checksum,
          migration.description ?? null,
          migration.appliedAt,
          migration.executionMs ?? null,
        ],
      );
    },

    async unmarkApplied(id: string): Promise<boolean> {
      const result = await db.execute(
        `delete from "rootware_migrations" where "id" = ?`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    acquireLock(): Promise<boolean> {
      return Promise.resolve(true);
    },

    releaseLock(): Promise<void> {
      return Promise.resolve();
    },
  };
}

function rowToAppliedMigration(row: Record<string, unknown>): AppliedMigration {
  const executionMs = typeof row.executionMs === "number"
    ? row.executionMs
    : undefined;

  return {
    id: expectString(row.id, "migration id"),
    checksum: expectString(row.checksum, "migration checksum"),
    appliedAt: expectString(row.appliedAt, "migration appliedAt"),
    ...(typeof row.description === "string"
      ? { description: row.description }
      : {}),
    ...(executionMs === undefined ? {} : { executionMs }),
  };
}

async function requireActor(
  context: Context,
  sessions: SessionManager,
): Promise<SessionActor & { readonly id: string }> {
  try {
    const actor = await sessions.requireActor(context.req.raw);
    return actor as SessionActor & { readonly id: string };
  } catch (cause) {
    throw todoUnauthorizedError("A todo session is required", { cause });
  }
}

async function findTodo(
  db: SqliteDatabase,
  ownerId: string,
  id: string,
): Promise<TodoRow | undefined> {
  const rows = await db.select()
    .from(todos)
    .where(and(eq(todos.columns.id, id), eq(todos.columns.ownerId, ownerId)))
    .limit(1)
    .execute() as TodoRow[];

  return rows[0];
}

async function getCachedTodo(
  services: TodoAppServices,
  ownerId: string,
  id: string,
): Promise<TodoResponse | null> {
  return await services.cache.getOrSet<TodoResponse | null>(
    todoCacheKey(ownerId, id),
    async () => {
      const row = await findTodo(services.db, ownerId, id);
      return row === undefined ? null : rowToTodo(row);
    },
    { ttlMs: services.cacheTtlMs },
  );
}

function rowToTodo(row: TodoRow): TodoResponse {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    notes: row.notes,
    completed: row.completed === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

async function readJsonObject(
  context: Context,
  options: { readonly allowEmpty?: boolean } = {},
): Promise<Record<string, unknown>> {
  const text = await context.req.raw.text();

  if (text.trim().length === 0) {
    if (options.allowEmpty === true) {
      return {};
    }

    throw todoValidationError("Request body must be JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw todoValidationError("Request body must be valid JSON", { cause });
  }

  if (!isRecord(parsed)) {
    throw todoValidationError("Request body must be a JSON object");
  }

  return parsed;
}

function validateCreateTodoInput(
  value: Record<string, unknown>,
): { readonly title: string; readonly notes?: string | null } {
  return {
    title: normalizeTitle(value.title),
    ...("notes" in value ? { notes: normalizeNotes(value.notes) } : {}),
  };
}

function validatePatchTodoInput(
  value: Record<string, unknown>,
): {
  readonly title?: string;
  readonly notes?: string | null;
  readonly completed?: boolean;
} {
  const patch = {
    ...("title" in value ? { title: normalizeTitle(value.title) } : {}),
    ...("notes" in value ? { notes: normalizeNotes(value.notes) } : {}),
    ...("completed" in value
      ? { completed: normalizeCompleted(value.completed) }
      : {}),
  };

  if (Object.keys(patch).length === 0) {
    throw todoValidationError("Patch body must include a todo field");
  }

  return patch;
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw todoValidationError("Todo title must be a string");
  }

  const title = value.trim();
  if (title.length === 0 || title.length > 160) {
    throw todoValidationError("Todo title must be 1-160 characters");
  }

  return title;
}

function normalizeNotes(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw todoValidationError("Todo notes must be a string or null");
  }

  const notes = value.trim();
  if (notes.length === 0) {
    return null;
  }

  if (notes.length > 1000) {
    throw todoValidationError("Todo notes must be at most 1000 characters");
  }

  return notes;
}

function normalizeCompleted(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw todoValidationError("Todo completed must be a boolean");
  }

  return value;
}

function normalizeTodoId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw todoValidationError("Todo id is required");
  }

  return value.trim();
}

function parseCompletedQuery(value: string | undefined): 0 | 1 | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
      return 1;
    case "false":
    case "0":
      return 0;
    default:
      throw todoValidationError("completed must be true, false, 1, or 0");
  }
}

function normalizeOptionalSearch(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function parseIntegerQuery(
  value: string | undefined,
  options: {
    readonly name: string;
    readonly defaultValue: number;
    readonly min: number;
    readonly max: number;
  },
): number {
  if (value === undefined || value.trim() === "") {
    return options.defaultValue;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw todoValidationError(`${options.name} must be an integer`);
  }

  const parsed = Number(value);
  if (parsed < options.min || parsed > options.max) {
    throw todoValidationError(
      `${options.name} must be between ${options.min} and ${options.max}`,
    );
  }

  return parsed;
}

function todoCacheKey(ownerId: string, id: string): string {
  return `${ownerId}:${id}`;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function errorResponse(error: unknown): Response {
  const serialized = serializeError(toRootwareError(error));
  return jsonResponse({
    error: {
      code: serialized.code,
      message: serialized.message,
      status: serialized.status,
    },
  }, { status: serialized.status });
}

function expectString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw todoValidationError(`${name} must be a string`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

if (import.meta.main) {
  if (Deno.args.includes("--serve")) {
    const resources = await createTodoApi();
    const server = Deno.serve(
      { port: resources.config.port },
      resources.app.fetch,
    );
    console.log(
      `todo api listening on http://localhost:${resources.config.port}`,
    );
    await server.finished.finally(() => resources.close());
  } else {
    await runTodoApiExample();
    console.log("todo api example passed");
  }
}
