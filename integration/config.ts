/**
 * Database-version matrix for the integration suite.
 *
 * Targets default to the `compose.yaml` matrix and can be overridden with the
 * `RW_PG_URLS` / `RW_REDIS_URLS` environment variables (comma-separated, each
 * entry either `url` or `label=url`). Reading env needs `--allow-env`, which the
 * `test:integration` task grants; the default targets need no env at all.
 */

export interface DbTarget {
  readonly label: string;
  readonly url: string;
}

const DEFAULT_PG_TARGETS: readonly DbTarget[] = [
  { label: "postgres-14", url: pgUrl(5414) },
  { label: "postgres-15", url: pgUrl(5415) },
  { label: "postgres-16", url: pgUrl(5416) },
  { label: "postgres-17", url: pgUrl(5417) },
  { label: "postgres-18", url: pgUrl(5418) },
];

// A dedicated logical DB (15) is used so the suite can FLUSHDB safely.
const DEFAULT_REDIS_TARGETS: readonly DbTarget[] = [
  { label: "redis-6", url: redisUrl(6306) },
  { label: "redis-7", url: redisUrl(6307) },
  { label: "redis-8.8", url: redisUrl(6308) },
];

/** Connection settings for the RustFS (S3-compatible) target. */
export interface S3Target {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** S3/RustFS target, from `RW_S3_*` env vars or the compose defaults. */
export function s3Target(): S3Target {
  return {
    endpoint: readEnv("RW_S3_ENDPOINT") ?? "http://localhost:9000",
    region: readEnv("RW_S3_REGION") ?? "us-east-1",
    bucket: readEnv("RW_S3_BUCKET") ?? "rootware-test",
    accessKeyId: readEnv("RW_S3_ACCESS_KEY_ID") ?? "rootware",
    secretAccessKey: readEnv("RW_S3_SECRET_ACCESS_KEY") ?? "rootware-secret",
  };
}

/** PostgreSQL targets, from `RW_PG_URLS` or the compose defaults. */
export function pgTargets(): readonly DbTarget[] {
  return targetsFromEnv("RW_PG_URLS", DEFAULT_PG_TARGETS);
}

/** Redis targets, from `RW_REDIS_URLS` or the compose defaults. */
export function redisTargets(): readonly DbTarget[] {
  return targetsFromEnv("RW_REDIS_URLS", DEFAULT_REDIS_TARGETS);
}

function targetsFromEnv(
  variable: string,
  fallback: readonly DbTarget[],
): readonly DbTarget[] {
  const raw = readEnv(variable);

  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const separator = entry.indexOf("=");
      if (separator > 0 && !entry.slice(0, separator).includes(":")) {
        return {
          label: entry.slice(0, separator).trim(),
          url: entry.slice(separator + 1).trim(),
        };
      }
      return { label: `target-${index + 1}`, url: entry };
    });
}

/**
 * Returns true when the target's host:port accepts a TCP connection — a cheap
 * "is the service up?" gate so the suite can skip versions that were not started
 * (e.g. `docker compose up postgres-16`). Needs `--allow-net`.
 */
export async function canReach(url: string): Promise<boolean> {
  let hostname: string;
  let port: number;

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    port = Number(parsed.port);
  } catch {
    return false;
  }

  try {
    const conn = await Deno.connect({ hostname, port, transport: "tcp" });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

/** Returns a URL with credentials redacted, safe for test names and logs. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password.length > 0) {
      parsed.password = "***";
    }
    if (parsed.username.length > 0) {
      parsed.username = "***";
    }
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

function pgUrl(port: number): string {
  return `postgres://rootware:rootware@localhost:${port}/rootware`;
}

function redisUrl(port: number): string {
  return `redis://localhost:${port}/15`;
}

function readEnv(variable: string): string | undefined {
  const deno = (globalThis as {
    readonly Deno?: { readonly env?: { get(key: string): string | undefined } };
  }).Deno;

  try {
    return deno?.env?.get(variable);
  } catch {
    // No --allow-env: fall back to defaults.
    return undefined;
  }
}
