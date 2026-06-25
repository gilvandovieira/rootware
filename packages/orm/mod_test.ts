import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  and,
  columns,
  createDatabase,
  defineTable,
  emptySql,
  eq,
  gt,
  gte,
  identifier,
  type InferInsert,
  type InferSelect,
  isColumn,
  isNotNull,
  isNull,
  isSql,
  isTable,
  joinSql,
  like,
  lt,
  lte,
  memoryOrmDriver,
  ne,
  noopOrmDriver,
  normalizeColumnName,
  normalizeTableName,
  not,
  or,
  OrmError,
  quoteIdentifier,
  raw,
  renderSql,
  serializeSqlValue,
  sql,
  toSql,
} from "./mod.ts";

const users = defineTable("users", {
  id: columns.text().primaryKey(),
  name: columns.text().notNull(),
  email: columns.text().notNull().unique(),
  age: columns.integer().optional(),
  score: columns.number().nullable(),
  active: columns.boolean().default(true),
  profile: columns.json<{ theme: string }>().optional(),
  birthday: columns.date().optional(),
  createdAt: columns.timestamp().default(() => new Date()),
  orgId: columns.uuid().references("organizations", "id"),
});

Deno.test("@rootware/orm - table columns and inference compile", () => {
  type User = InferSelect<typeof users>;
  type NewUser = InferInsert<typeof users>;

  const selected: User = {
    id: "u_123",
    name: "Lucas",
    email: "lucas@example.com",
    age: undefined,
    score: null,
    active: true,
    profile: undefined,
    birthday: undefined,
    createdAt: new Date(),
    orgId: "org_123",
  };
  const inserted: NewUser = {
    id: "u_123",
    name: "Lucas",
    email: "lucas@example.com",
    score: 1,
    orgId: "org_123",
  };

  assertEquals(selected.id, inserted.id);
  assertEquals(users.columns.orgId.references?.table, "organizations");
  assertEquals(isTable(users), true);
  assertEquals(isColumn(users.columns.id), true);
});

Deno.test("@rootware/orm - SQL fragments render safely", () => {
  const query = sql`select * from ${identifier("users")} where id = ${"u_123"}`;
  const rendered = renderSql(query, { dialect: "postgres" });

  assertEquals(rendered.text, 'select * from "users" where id = $1');
  assertEquals(rendered.params, ["u_123"]);
  assertEquals(renderSql(query).text, 'select * from "users" where id = ?');
  assertEquals(quoteIdentifier("users.id", "mysql"), "`users`.`id`");
  assertEquals(renderSql(joinSql([raw("a"), raw("b")])).text, "a, b");
  assertEquals(renderSql(emptySql()).text, "");
  assertEquals(isSql(query), true);
  assertThrows(() => identifier("bad name"), OrmError);
});

Deno.test("@rootware/orm - conditions render", () => {
  const condition = and(
    eq(users.columns.id, "u_123"),
    ne(users.columns.email, "x@example.com"),
    or(gt(users.columns.age, 18), gte(users.columns.age, 21)),
    lt(users.columns.age, 100),
    lte(users.columns.age, 99),
    like(users.columns.email, "%@example.com"),
    not(isNull(users.columns.name)),
    isNotNull(users.columns.email),
  );
  const rendered = renderSql(toSql(condition), { dialect: "postgres" });

  assert(rendered.text.includes('"users"."id" = $1'));
  assert(rendered.text.includes('not ("users"."name" is null)'));
  assertEquals(rendered.params.length, 7);
});

Deno.test("@rootware/orm - builders generate SQL and execute with noop driver", async () => {
  const db = createDatabase({ driver: noopOrmDriver(), dialect: "postgres" });

  const selectSql = db.select()
    .from(users)
    .where(eq(users.columns.id, "u_123"))
    .orderBy(users.columns.email, "desc")
    .limit(1)
    .offset(0)
    .toSql();
  assertEquals(
    renderSql(selectSql, { dialect: "postgres" }).text,
    'select * from "users" where "users"."id" = $1 order by "users"."email" desc limit $2 offset $3',
  );

  const insert = await db.insert(users).values({
    id: "u_123",
    name: "Lucas",
    email: "lucas@example.com",
    score: 1,
    orgId: "org_123",
  }).returning().execute();
  assertEquals(insert.rowCount, 0);

  const updateSql = db.update(users)
    .set({ name: "Lucas Vieira" })
    .where(eq(users.columns.id, "u_123"))
    .returning()
    .toSql();
  assert(renderSql(updateSql).text.includes('update "users" set "name" = ?'));

  const deleteSql = db.delete(users)
    .where(eq(users.columns.id, "u_123"))
    .returning()
    .toSql();
  assert(renderSql(deleteSql).text.includes('delete from "users" where'));
});

Deno.test("@rootware/orm - database query transaction and helpers", async () => {
  const db = createDatabase({ driver: memoryOrmDriver() });
  const result = await db.execute(sql`select ${1}`);
  assertEquals(result.rows, []);

  const txResult = await db.transaction(async (tx) => {
    await tx.query(sql`select ${1}`);
    return 1;
  });
  assertEquals(txResult, 1);

  assertEquals(normalizeTableName("public.users"), "public.users");
  assertEquals(normalizeColumnName("email"), "email");
  assertEquals(serializeSqlValue(undefined), null);
  assertEquals(serializeSqlValue(new Date(0)) instanceof Date, true);
  assertExists(toSql(sql`select 1`));
  await assertRejects(
    () =>
      createDatabase({
        driver: {
          query: () => Promise.reject(new Error("boom")),
          execute: () => Promise.reject(new Error("boom")),
        },
      }).query(sql`select 1`),
    OrmError,
  );
});
