import { assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as ormRoot from "@rootware/orm";
import { columns, defineTable, eq, OrmError } from "@rootware/orm";
import { createPgDb, type PgClient } from "@rootware/orm/postgres";

class FakePgClient implements PgClient {
  readonly queries: Array<{
    readonly sql: string;
    readonly params: readonly unknown[];
  }> = [];
  rows: Array<Record<string, unknown>> = [];
  rowCount?: number;
  error?: unknown;

  queryObject<Row = Record<string, unknown>>(
    sql: string,
    args: readonly unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount?: number }> {
    this.queries.push({ sql, params: [...args] });

    if (this.error !== undefined) {
      return Promise.reject(this.error);
    }

    return Promise.resolve({
      rows: this.rows as Row[],
      rowCount: this.rowCount ?? this.rows.length,
    });
  }
}

Deno.test("@rootware/orm/postgres - creates db and executes parameterized SQL", async () => {
  const client = new FakePgClient();
  client.rows = [{ ok: 1 }];
  const db = await createPgDb({ client });

  const result = await db.execute<{ ok: number }>(
    "select $1::int as ok",
    [1],
  );

  assertEquals(result.rows, [{ ok: 1 }]);
  assertEquals(result.rowCount, 1);
  assertEquals(client.queries, [
    { sql: "select $1::int as ok", params: [1] },
  ]);
});

Deno.test("@rootware/orm/postgres - supports core query builders", async () => {
  const client = new FakePgClient();
  const db = await createPgDb({ client });
  const users = defineTable("users", {
    id: columns.text().primaryKey(),
  });

  await db.select().from(users).where(eq(users.columns.id, "u_1")).execute();

  assertEquals(client.queries.at(-1), {
    sql: 'select * from "users" where "users"."id" = $1',
    params: ["u_1"],
  });
});

Deno.test("@rootware/orm/postgres - maps query errors into RootwareError", async () => {
  const client = new FakePgClient();
  client.error = new Error("database unavailable");
  const db = await createPgDb({ client });

  await assertRejects(
    () => db.execute("select broken"),
    OrmError,
    "PostgreSQL query failed",
  );
});

Deno.test("@rootware/orm/postgres - logs query execution", async () => {
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const client = new FakePgClient();
  const db = await createPgDb({ client, logger });

  await db.execute("select 1 as ok");

  assertEquals(
    sink.records().map((record) => record.msg),
    ["orm query started", "orm query completed"],
  );
});

Deno.test("@rootware/orm - root import does not expose PostgreSQL exports", () => {
  assertEquals("createPgDb" in ormRoot, false);
  assertEquals("createPgOrmDriver" in ormRoot, false);
});
