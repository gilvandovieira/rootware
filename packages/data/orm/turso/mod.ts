/**
 * Turso adapter for `@rootware/orm`.
 *
 * Turso is hosted libSQL, so this is a thin, Turso-named entrypoint over the
 * `@rootware/orm/libsql` adapter that **requires** a `url` and `authToken`
 * (hosted Turso databases are always authenticated) and otherwise behaves
 * identically — the same `defineTable`/`columns`/query-builder surface over the
 * bundled `@libsql/client`.
 *
 * @module
 */

import type { Logger } from "@rootware/log";

import { OrmError } from "../core/mod.ts";
import {
  createLibsqlDb,
  type CreateLibsqlDbOptions,
  type LibsqlDatabase,
} from "../libsql/mod.ts";

export type { LibsqlDatabase as TursoDatabase } from "../libsql/mod.ts";
export { sqliteColumnAffinity } from "../sqlite/dialect.ts";

/** Options for opening a Turso-backed database facade. */
export interface CreateTursoDbOptions {
  /** Turso database URL (`libsql://<db>-<org>.turso.io`). */
  readonly url?: string;
  /** Turso database auth token (required for hosted databases). */
  readonly authToken?: string;
  /** An already-open libSQL client or executor (for tests). */
  readonly client?: CreateLibsqlDbOptions["client"];
  readonly executor?: CreateLibsqlDbOptions["executor"];
  readonly logger?: Logger;
}

/**
 * Opens a Turso-backed database facade. Equivalent to `createLibsqlDb`, but for
 * a real connection it validates that a `url` **and** `authToken` are present (a
 * hosted Turso connection without an auth token is almost always a mistake). An
 * injected `client`/`executor` bypasses that for tests.
 */
export function createTursoDb(
  options: CreateTursoDbOptions,
): Promise<LibsqlDatabase> {
  const injected = options.client !== undefined ||
    options.executor !== undefined;

  if (!injected) {
    if (typeof options.url !== "string" || options.url.trim().length === 0) {
      throw new OrmError("Turso database url is required", {
        code: "ORM_DRIVER_MISSING",
        status: 400,
      });
    }

    if (
      typeof options.authToken !== "string" ||
      options.authToken.trim().length === 0
    ) {
      throw new OrmError("Turso auth token is required", {
        code: "ORM_DRIVER_MISSING",
        status: 400,
      });
    }
  }

  return createLibsqlDb({
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.authToken === undefined
      ? {}
      : { authToken: options.authToken }),
    ...(options.client === undefined ? {} : { client: options.client }),
    ...(options.executor === undefined ? {} : { executor: options.executor }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
}

/** Convenience alias for {@link createTursoDb}. */
export function connect(
  options: CreateTursoDbOptions,
): Promise<LibsqlDatabase> {
  return createTursoDb(options);
}
