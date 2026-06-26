/**
 * Production-safe request logging for `Deno.serve`-style fetch handlers.
 *
 * `withRequestLogging` wraps a handler and emits one structured record per
 * request with the method, **pathname** (no query string, so secrets in the
 * query are never logged), status, duration, and a stable `requestId`. Request
 * and response **bodies are never logged**, and headers are logged only when
 * explicitly allow-listed. The completion level escalates with the status
 * (`5xx` → error, `4xx` → warn, otherwise the configured level).
 *
 * @module
 */

import { createNoopLogger, type Logger, type LogLevelName } from "../mod.ts";

/** Network address shape a `Deno.serve` handler receives. */
export interface ServeHandlerInfo {
  readonly remoteAddr?: {
    readonly hostname?: string;
    readonly port?: number;
    readonly transport?: string;
  };
  readonly completed?: Promise<void>;
}

/** A `Deno.serve`-style request handler. */
export type ServeHandler = (
  request: Request,
  info?: ServeHandlerInfo,
) => Response | Promise<Response>;

/** Options for {@link withRequestLogging}. */
export interface RequestLoggingOptions {
  /** Logger to use; defaults to a no-op logger. */
  readonly logger?: Logger;
  /** Request header carrying an inbound request id; defaults to `x-request-id`. */
  readonly requestIdHeader?: string;
  /** Generates a request id when none is inbound; defaults to `crypto.randomUUID`. */
  readonly generateRequestId?: () => string;
  /** Echo the request id back on the response. Defaults to `true`. */
  readonly setResponseHeader?: boolean;
  /** Base level for a completed request. Defaults to `"info"`. */
  readonly level?: LogLevelName;
  /** Event name for the completion record. Defaults to `"http.request.completed"`. */
  readonly eventName?: string;
  /** Header names to include (lowercased) — nothing is logged by default. */
  readonly logHeaders?: readonly string[];
  /** Injectable clock for deterministic durations; defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Wraps a `Deno.serve` handler so each request is logged safely. Logging never
 * changes the response (beyond optionally adding the `x-request-id` header) and
 * a handler that throws is logged and then re-thrown unchanged.
 *
 * ```ts
 * Deno.serve(withRequestLogging(handler, { logger }));
 * ```
 */
export function withRequestLogging(
  handler: ServeHandler,
  options: RequestLoggingOptions = {},
): ServeHandler {
  const logger = options.logger ?? createNoopLogger();
  const requestIdHeader = (options.requestIdHeader ?? "x-request-id")
    .toLowerCase();
  const generateRequestId = options.generateRequestId ?? defaultRequestId;
  const setResponseHeader = options.setResponseHeader ?? true;
  const baseLevel = options.level ?? "info";
  const eventName = options.eventName ?? "http.request.completed";
  const logHeaderNames = (options.logHeaders ?? []).map((name) =>
    name.toLowerCase()
  );
  const now = options.now ?? Date.now;

  return async (
    request: Request,
    info?: ServeHandlerInfo,
  ): Promise<Response> => {
    const requestId = request.headers.get(requestIdHeader) ??
      generateRequestId();
    const method = request.method;
    const path = safePathname(request.url);
    const startedAt = now();
    const headerFields = pickHeaders(request.headers, logHeaderNames);

    log(logger, "debug", {
      event: "http.request.received",
      requestId,
      method,
      path,
      ...headerFields,
    }, "http request received");

    try {
      const response = await handler(request, info);
      const durationMs = now() - startedAt;
      const level = levelForStatus(response.status, baseLevel);

      log(logger, level, {
        event: eventName,
        requestId,
        method,
        path,
        status: response.status,
        durationMs,
      }, "http request completed");

      if (setResponseHeader) {
        try {
          response.headers.set("x-request-id", requestId);
        } catch {
          // Immutable response headers (rare): leave the response untouched.
        }
      }

      return response;
    } catch (error) {
      const durationMs = now() - startedAt;

      log(logger, "error", {
        event: "http.request.failed",
        requestId,
        method,
        path,
        durationMs,
        error: serializeHandlerError(error),
      }, "http request failed");

      throw error;
    }
  };
}

function levelForStatus(status: number, base: LogLevelName): LogLevelName {
  if (status >= 500) {
    return "error";
  }
  if (status >= 400) {
    return "warn";
  }
  return base;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "[invalid-url]";
  }
}

function pickHeaders(
  headers: Headers,
  names: readonly string[],
): Record<string, string> {
  if (names.length === 0) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      output[name] = value;
    }
  }
  return output;
}

function serializeHandlerError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}

function defaultRequestId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function log(
  logger: Logger,
  level: LogLevelName,
  fields: Record<string, unknown>,
  message: string,
): void {
  try {
    if (level === "silent") {
      return;
    }
    logger[level](fields, message);
  } catch {
    // Logging must never affect the request.
  }
}
