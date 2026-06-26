import { assertEquals, assertThrows } from "@std/assert";
import { columns, defineTable, eq, OrmError } from "@rootware/orm";
import { createTursoDb } from "@rootware/orm/turso";
import type {
  LibsqlLikeClient,
  LibsqlResultSet,
  LibsqlStatement,
} from "@rootware/orm/libsql";

/** Minimal libSQL client fake; Turso uses the same client surface. */
function fakeClient(rows: Record<string, unknown>[] = []): LibsqlLikeClient {
  return {
    execute: (_statement: LibsqlStatement): Promise<LibsqlResultSet> =>
      Promise.resolve({ rows, rowsAffected: 0 }),
    transaction: () =>
      Promise.resolve({
        execute: (_s: LibsqlStatement) =>
          Promise.resolve({ rows, rowsAffected: 0 }),
        commit: () => Promise.resolve(),
        rollback: () => Promise.resolve(),
      }),
    close: () => {},
  };
}

Deno.test("@rootware/orm/turso - requires url and auth token", () => {
  assertThrows(
    () => createTursoDb({ url: "", authToken: "tok" }),
    OrmError,
    "Turso database url is required",
  );
  assertThrows(
    () => createTursoDb({ url: "libsql://x.turso.io", authToken: "" }),
    OrmError,
    "Turso auth token is required",
  );
});

Deno.test("@rootware/orm/turso - delegates to the libSQL adapter", async () => {
  // An injected client bypasses the real connection while keeping the surface.
  const db = await createTursoDb({ client: fakeClient([{ ok: 1 }]) });

  const users = defineTable("users", { id: columns.text().primaryKey() });
  const rows = await db.execute<{ ok: number }>("select ? as ok", [1]);
  assertEquals(rows.rows, [{ ok: 1 }]);

  // The same sqlite-dialect builder surface works.
  await db.select().from(users).where(eq(users.columns.id, "u_1")).execute();
});

Deno.test("@rootware/orm - root import does not expose Turso exports", async () => {
  const ormRoot = await import("@rootware/orm");
  assertEquals("createTursoDb" in ormRoot, false);
});
