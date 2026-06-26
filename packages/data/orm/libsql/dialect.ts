import type { SqlDialect } from "../core/mod.ts";

/**
 * libSQL is SQLite-compatible, so it renders SQL with the `sqlite` dialect
 * (`?` placeholders, `"`-quoted identifiers).
 */
export const LIBSQL_DIALECT: SqlDialect = "sqlite";
