import { assertEquals, assertRejects } from "@std/assert";
import { columns, defineTable, eq, OrmError } from "@rootware/orm";
import {
  createLibsqlDb,
  type LibsqlLikeClient,
  type LibsqlLikeTransaction,
  type LibsqlResultSet,
  type LibsqlStatement,
  openLibsqlClient,
} from "@rootware/orm/libsql";

/** Fake libSQL client so the adapter is testable without `@libsql/client`. */
class FakeLibsqlClient implements LibsqlLikeClient {
  readonly statements: LibsqlStatement[] = [];
  readonly committed: boolean[] = [];
  rows: Record<string, unknown>[] = [];
  rowsAffected = 0;
  error?: unknown;
  closed = false;
  transactions = 0;

  execute(statement: LibsqlStatement): Promise<LibsqlResultSet> {
    this.statements.push({
      sql: statement.sql,
      args: [...(statement.args ?? [])],
    });
    if (this.error !== undefined) return Promise.reject(this.error);
    return Promise.resolve({
      rows: this.rows,
      rowsAffected: this.rowsAffected,
    });
  }

  transaction(_mode?: string): Promise<LibsqlLikeTransaction> {
    this.transactions += 1;
    // deno-lint-ignore no-this-alias
    const client = this;
    const tx: LibsqlLikeTransaction = {
      execute: (statement) => client.execute(statement),
      commit: () => {
        client.committed.push(true);
        return Promise.resolve();
      },
      rollback: () => {
        client.committed.push(false);
        return Promise.resolve();
      },
    };
    return Promise.resolve(tx);
  }

  close(): void {
    this.closed = true;
  }
}

Deno.test("@rootware/orm/libsql - executes parameterized SQL with ? placeholders", async () => {
  const client = new FakeLibsqlClient();
  client.rows = [{ ok: 1 }];
  const db = await createLibsqlDb({ client });

  const result = await db.execute<{ ok: number }>("select ? as ok", [1]);

  assertEquals(result.rows, [{ ok: 1 }]);
  assertEquals(result.rowCount, 1);
  assertEquals(client.statements, [{ sql: "select ? as ok", args: [1] }]);
});

Deno.test("@rootware/orm/libsql - non-SELECT reports rowsAffected", async () => {
  const client = new FakeLibsqlClient();
  client.rowsAffected = 2;
  const db = await createLibsqlDb({ client });

  const result = await db.execute("delete from t where x = ?", [1]);
  assertEquals(result.rows, []);
  assertEquals(result.rowCount, 2);
});

Deno.test("@rootware/orm/libsql - renders core builders for the sqlite dialect", async () => {
  const client = new FakeLibsqlClient();
  const db = await createLibsqlDb({ client });
  const users = defineTable("users", { id: columns.text().primaryKey() });

  await db.select().from(users).where(eq(users.columns.id, "u_1")).execute();

  assertEquals(client.statements.at(-1), {
    sql: 'select * from "users" where "users"."id" = ?',
    args: ["u_1"],
  });
});

Deno.test("@rootware/orm/libsql - transactions use the interactive handle and commit", async () => {
  const client = new FakeLibsqlClient();
  const db = await createLibsqlDb({ client });

  await db.transaction(async (tx) => {
    await tx.execute("insert into t (id) values (?)", ["a"]);
  });

  assertEquals(client.transactions, 1);
  assertEquals(client.committed, [true]); // committed, not rolled back
  assertEquals(client.statements.map((s) => s.sql), [
    "insert into t (id) values (?)",
  ]);
});

Deno.test("@rootware/orm/libsql - transaction rolls back on failure", async () => {
  const client = new FakeLibsqlClient();
  const db = await createLibsqlDb({ client });

  await assertRejects(() =>
    db.transaction(async (tx) => {
      await tx.execute("insert into t values (1)");
      throw new Error("boom");
    })
  );
  assertEquals(client.committed, [false]); // rolled back
});

Deno.test("@rootware/orm/libsql - wraps query errors in OrmError", async () => {
  const client = new FakeLibsqlClient();
  client.error = new Error("SQLITE_ERROR");
  const db = await createLibsqlDb({ client });

  await assertRejects(
    () => db.execute("select * from missing"),
    OrmError,
    "libSQL query failed",
  );
});

Deno.test("@rootware/orm/libsql - missing connection url is an OrmError", async () => {
  const error = await assertRejects(
    () => openLibsqlClient({ url: "" }),
    OrmError,
    "libSQL connection url is required",
  ) as OrmError;

  assertEquals(error.code, "ORM_DRIVER_MISSING");
  assertEquals(error.status, 400);
  assertEquals(error.details, { adapter: "libsql", field: "url" });
});
