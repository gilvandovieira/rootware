import { JobError, type JobErrorCode } from "../mod.ts";

/** Wraps a driver failure in a {@link JobError}, preserving existing job errors. */
export function toPostgresJobError(
  error: unknown,
  message: string,
  options: {
    readonly code?: JobErrorCode;
    readonly sql?: string;
    readonly status?: number;
  } = {},
): JobError {
  if (error instanceof JobError) {
    return error;
  }

  return new JobError(message, {
    code: options.code ?? "JOB_UNKNOWN_ERROR",
    status: options.status ?? 500,
    details: options.sql === undefined ? undefined : { sql: options.sql },
    cause: error,
  });
}
