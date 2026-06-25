/**
 * Public entrypoint for @rootware/migrate.
 *
 * TODO: Implement migration discovery, locking, planning, and execution.
 */

export type MigrationId = string;
export type MigrationDirection = "up" | "down";

export interface MigrationContext {
  readonly direction: MigrationDirection;
  readonly metadata?: Record<string, unknown>;
}

export type MigrationOperation = (
  context: MigrationContext,
) => void | Promise<void>;

export interface Migration {
  readonly id: MigrationId;
  readonly name?: string;
  readonly up: MigrationOperation;
  readonly down?: MigrationOperation;
}

export interface MigrationRecord {
  readonly id: MigrationId;
  readonly appliedAt: Date;
}

export interface MigrationPlan {
  readonly direction: MigrationDirection;
  readonly pending: readonly Migration[];
}

export interface MigrationStore {
  listApplied(): Promise<readonly MigrationRecord[]>;
  recordApplied(migration: Migration): Promise<void>;
  recordReverted(migration: Migration): Promise<void>;
}

export interface MigrationRunnerOptions {
  readonly migrations?: readonly Migration[];
  readonly store?: MigrationStore;
}

export class RootwareMigrator {
  constructor(readonly options: MigrationRunnerOptions = {}) {}

  plan(_direction?: MigrationDirection): Promise<MigrationPlan> {
    throw new Error("Not implemented");
  }

  up(): Promise<MigrationPlan> {
    throw new Error("Not implemented");
  }

  down(_steps?: number): Promise<MigrationPlan> {
    throw new Error("Not implemented");
  }

  status(): Promise<readonly MigrationRecord[]> {
    throw new Error("Not implemented");
  }
}

export function createMigrator(
  _options?: MigrationRunnerOptions,
): RootwareMigrator {
  throw new Error("Not implemented");
}
