import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503, 504] as const;
const DEFAULT_RETRYABLE_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
const DEFAULT_BACKOFF_MS = 100;
const DEFAULT_MAX_BACKOFF_MS = 2000;
const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
] as const;
const SENSITIVE_NAME_PARTS = [
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "private_key",
  "api_key",
  "apikey",
] as const;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type HttpErrorCode =
  | "HTTP_INVALID_URL"
  | "HTTP_TIMEOUT"
  | "HTTP_ABORTED"
  | "HTTP_NETWORK_ERROR"
  | "HTTP_RESPONSE_ERROR"
  | "HTTP_PARSE_ERROR"
  | "HTTP_RESPONSE_TOO_LARGE"
  | "HTTP_RETRY_EXHAUSTED"
  | "HTTP_UNKNOWN_ERROR"
  | (string & Record<never, never>);

export type HttpHeaders = HeadersInit;

export type HttpQueryValue = string | number | boolean | null | undefined;

export type HttpQuery = Record<
  string,
  HttpQueryValue | HttpQueryValue[]
>;

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type HttpResponseErrorBody =
  | Record<string, unknown>
  | readonly unknown[]
  | string
  | number
  | boolean
  | null;

/** Retry configuration for transient HTTP failures. */
export interface RetryOptions {
  readonly attempts?: number;
  /** Base delay used for exponential backoff. Defaults to `100`. */
  readonly backoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly retryOnStatuses?: number[];
  readonly retryOnMethods?: HttpMethod[];
  /** Apply full jitter to the backoff delay. Defaults to `true`. */
  readonly jitter?: boolean;
  /** Honor a `Retry-After` response header when retrying. Defaults to `true`. */
  readonly respectRetryAfter?: boolean;
}

export interface RequiredRetryOptions {
  readonly attempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  readonly retryOnStatuses: number[];
  readonly retryOnMethods: HttpMethod[];
  readonly jitter: boolean;
  readonly respectRetryAfter: boolean;
}

/** Context passed to retry decision helpers. */
export interface RetryContext {
  readonly attempt: number;
  readonly method: HttpMethod;
  readonly response?: Response;
  readonly error?: unknown;
  readonly options: RequiredRetryOptions;
}

/** Options used when creating an HTTP client. */
export interface HttpClientOptions {
  readonly baseUrl?: string | URL;
  readonly headers?: HttpHeaders;
  readonly timeoutMs?: number;
  readonly retry?: RetryOptions;
  readonly fetch?: FetchLike;
  readonly logger?: Logger;
  readonly userAgent?: string;
  /**
   * Maximum response body size, in bytes, accepted when reading a JSON or error
   * body. A larger body fails with `HTTP_RESPONSE_TOO_LARGE` instead of being
   * buffered. Unbounded when omitted.
   */
  readonly maxResponseBytes?: number;
}

/** Options for one raw HTTP request. */
export interface HttpRequestOptions {
  readonly method?: HttpMethod;
  readonly path?: string;
  readonly query?: HttpQuery;
  readonly headers?: HttpHeaders;
  readonly body?: BodyInit | null;
  readonly timeoutMs?: number;
  readonly retry?: RetryOptions | false;
  readonly signal?: AbortSignal;
  readonly expectOk?: boolean;
  /** Per-request override of the client's `maxResponseBytes`. */
  readonly maxResponseBytes?: number;
}

/** Options for one JSON request. */
export interface JsonRequestOptions extends Omit<HttpRequestOptions, "body"> {
  readonly json?: unknown;
}

/** Small typed wrapper around the Web Fetch API. */
export interface HttpClient {
  request(path: string, options?: HttpRequestOptions): Promise<Response>;

  get(path: string, options?: HttpRequestOptions): Promise<Response>;
  post(path: string, options?: HttpRequestOptions): Promise<Response>;
  put(path: string, options?: HttpRequestOptions): Promise<Response>;
  patch(path: string, options?: HttpRequestOptions): Promise<Response>;
  delete(path: string, options?: HttpRequestOptions): Promise<Response>;

  requestJson<T = unknown>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<T>;

  getJson<T = unknown>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<T>;

  postJson<T = unknown>(
    path: string,
    json?: unknown,
    options?: JsonRequestOptions,
  ): Promise<T>;

  putJson<T = unknown>(
    path: string,
    json?: unknown,
    options?: JsonRequestOptions,
  ): Promise<T>;

  patchJson<T = unknown>(
    path: string,
    json?: unknown,
    options?: JsonRequestOptions,
  ): Promise<T>;

  deleteJson<T = unknown>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<T>;
}

/** Parsed data paired with the original HTTP response metadata. */
export interface HttpResult<T> {
  readonly data: T;
  readonly response: Response;
  readonly status: number;
  readonly headers: Headers;
}

/** Route definition used by createMockFetch. */
export interface MockRoute {
  readonly method?: HttpMethod;
  readonly path: string;
  readonly handler: MockRouteHandler;
}

export type MockRouteHandler = (
  request: Request,
) => Response | Promise<Response>;

export interface HttpErrorOptions {
  readonly code?: HttpErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for URL, timeout, network, response, and JSON parse failures. */
export class HttpError extends RootwareError {
  constructor(message: string, options: HttpErrorOptions = {}) {
    super(message, {
      code: options.code ?? "HTTP_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Creates a production-safe fetch wrapper with optional base URL, timeout, retry, and logger. */
export function createHttpClient(
  options: HttpClientOptions = {},
): HttpClient {
  const baseUrl = options.baseUrl;
  const defaultHeaders = mergeHeaders(
    options.headers,
    options.userAgent === undefined
      ? undefined
      : { "user-agent": options.userAgent },
  );
  const timeoutMs = options.timeoutMs;
  const retry = options.retry;
  const fetchFn = options.fetch ?? getGlobalFetch();
  const logger = options.logger;
  const defaultMaxResponseBytes = options.maxResponseBytes;

  const send = (
    path: string,
    requestOptions: HttpRequestOptions = {},
  ): Promise<Response> => {
    return executeRequest({
      baseUrl,
      defaultHeaders,
      defaultTimeoutMs: timeoutMs,
      defaultRetry: retry,
      fetch: fetchFn,
      logger,
      path,
      options: requestOptions,
      maxResponseBytes: requestOptions.maxResponseBytes ??
        defaultMaxResponseBytes,
    });
  };

  const sendJson = async <T = unknown>(
    path: string,
    requestOptions: JsonRequestOptions = {},
  ): Promise<T> => {
    const response = await send(path, prepareJsonOptions(requestOptions));
    return parseJsonResponse<T>(response, {
      maxBytes: requestOptions.maxResponseBytes ?? defaultMaxResponseBytes,
    });
  };

  return {
    request(
      path: string,
      requestOptions?: HttpRequestOptions,
    ): Promise<Response> {
      return send(path, requestOptions);
    },

    get(
      path: string,
      requestOptions: HttpRequestOptions = {},
    ): Promise<Response> {
      return send(path, { ...requestOptions, method: "GET" });
    },

    post(
      path: string,
      requestOptions: HttpRequestOptions = {},
    ): Promise<Response> {
      return send(path, { ...requestOptions, method: "POST" });
    },

    put(
      path: string,
      requestOptions: HttpRequestOptions = {},
    ): Promise<Response> {
      return send(path, { ...requestOptions, method: "PUT" });
    },

    patch(
      path: string,
      requestOptions: HttpRequestOptions = {},
    ): Promise<Response> {
      return send(path, { ...requestOptions, method: "PATCH" });
    },

    delete(
      path: string,
      requestOptions: HttpRequestOptions = {},
    ): Promise<Response> {
      return send(path, { ...requestOptions, method: "DELETE" });
    },

    requestJson<T = unknown>(
      path: string,
      requestOptions?: JsonRequestOptions,
    ): Promise<T> {
      return sendJson<T>(path, requestOptions);
    },

    getJson<T = unknown>(
      path: string,
      requestOptions: JsonRequestOptions = {},
    ): Promise<T> {
      return sendJson<T>(path, { ...requestOptions, method: "GET" });
    },

    postJson<T = unknown>(
      path: string,
      json?: unknown,
      requestOptions: JsonRequestOptions = {},
    ): Promise<T> {
      return sendJson<T>(
        path,
        prepareJsonMethodOptions(
          "POST",
          json,
          requestOptions,
          arguments.length >= 2,
        ),
      );
    },

    putJson<T = unknown>(
      path: string,
      json?: unknown,
      requestOptions: JsonRequestOptions = {},
    ): Promise<T> {
      return sendJson<T>(
        path,
        prepareJsonMethodOptions(
          "PUT",
          json,
          requestOptions,
          arguments.length >= 2,
        ),
      );
    },

    patchJson<T = unknown>(
      path: string,
      json?: unknown,
      requestOptions: JsonRequestOptions = {},
    ): Promise<T> {
      return sendJson<T>(
        path,
        prepareJsonMethodOptions(
          "PATCH",
          json,
          requestOptions,
          arguments.length >= 2,
        ),
      );
    },

    deleteJson<T = unknown>(
      path: string,
      requestOptions: JsonRequestOptions = {},
    ): Promise<T> {
      return sendJson<T>(path, { ...requestOptions, method: "DELETE" });
    },
  };
}

/** Top-level shortcut for a one-off HTTP request. */
export function request(
  input: string | URL,
  options: HttpRequestOptions & HttpClientOptions = {},
): Promise<Response> {
  return createHttpClient(options).request(String(input), options);
}

/** Resolves a path against an optional base URL and appends query parameters. */
export function buildUrl(
  baseUrl: string | URL | undefined,
  path: string,
  query?: HttpQuery,
): URL {
  try {
    const url = baseUrl === undefined
      ? new URL(path)
      : new URL(path, ensureBaseUrl(baseUrl));

    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        appendQueryValue(url.searchParams, key, value);
      }
    }

    return url;
  } catch (cause) {
    throw new HttpError("Invalid HTTP URL", {
      code: "HTTP_INVALID_URL",
      details: {
        hasBaseUrl: baseUrl !== undefined,
        path: sanitizeUrlText(path),
      },
      cause,
    });
  }
}

/** Merges multiple HeadersInit values into a new Headers instance. */
export function mergeHeaders(
  ...headers: Array<HeadersInit | undefined>
): Headers {
  const merged = new Headers();

  for (const headerSet of headers) {
    if (headerSet === undefined) {
      continue;
    }

    const current = new Headers(headerSet);

    for (const [key, value] of current.entries()) {
      merged.set(key, value);
    }
  }

  return merged;
}

/** Returns redacted headers suitable for diagnostics. */
export function redactHttpHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const output: Record<string, string> = {};

  if (headers === undefined) {
    return output;
  }

  for (const [key, value] of new Headers(headers).entries()) {
    output[key] = isSensitiveName(key) ? REDACTED_VALUE : value;
  }

  return output;
}

/** Returns a URL string with credentials and sensitive query parameters redacted. */
export function redactHttpUrl(value: string | URL): string {
  return safeUrlString(value instanceof URL ? value : new URL(value));
}

/** Returns a JSON-like value with sensitive key names redacted. */
export function redactHttpJson(value: unknown): unknown {
  return sanitizeJsonValue(value, new WeakSet<object>());
}

/** Options for reading and parsing a response body. */
export interface ParseJsonResponseOptions {
  /** Maximum body size in bytes; a larger body fails `HTTP_RESPONSE_TOO_LARGE`. */
  readonly maxBytes?: number;
}

/** Reads and parses a response body as JSON, throwing HttpError on invalid JSON. */
export async function parseJsonResponse<T = unknown>(
  response: Response,
  options: ParseJsonResponseOptions = {},
): Promise<T> {
  let text: string;

  try {
    text = await readResponseText(response, options.maxBytes);
  } catch (cause) {
    if (isHttpErrorCode(cause, "HTTP_RESPONSE_TOO_LARGE")) {
      throw cause;
    }

    throw new HttpError("Failed to read HTTP response body", {
      code: "HTTP_PARSE_ERROR",
      status: response.status,
      expose: false,
      severity: "error",
      details: {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      },
      cause,
    });
  }

  if (text.length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new HttpError("Failed to parse HTTP JSON response", {
      code: "HTTP_PARSE_ERROR",
      status: response.status,
      expose: false,
      severity: "error",
      details: {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      },
      cause,
    });
  }
}

/** Safely reads and parses JSON, returning undefined for empty or invalid bodies. */
export async function safeParseJsonResponse<T = unknown>(
  response: Response,
  options: ParseJsonResponseOptions = {},
): Promise<T | undefined> {
  try {
    return await parseJsonResponse<T>(response, options);
  } catch {
    return undefined;
  }
}

/**
 * Reads a response body as text, enforcing a maximum byte length.
 *
 * Rejects early on a `Content-Length` that exceeds `maxBytes`, then streams the
 * body and aborts as soon as the accumulated bytes pass the limit, so an
 * oversized or unbounded body is never fully buffered.
 */
async function readResponseText(
  response: Response,
  maxBytes: number | undefined,
): Promise<string> {
  if (maxBytes === undefined || !Number.isFinite(maxBytes)) {
    return await response.text();
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw responseTooLarge(response, maxBytes, declared);
  }

  const body = response.body;
  if (body === null) {
    const text = await response.text();
    if (textEncoder.encode(text).byteLength > maxBytes) {
      throw responseTooLarge(response, maxBytes);
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw responseTooLarge(response, maxBytes);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return textDecoder.decode(concatBytes(chunks, received));
}

function responseTooLarge(
  response: Response,
  maxBytes: number,
  contentLength?: number,
): HttpError {
  return new HttpError("HTTP response body exceeds the maximum size", {
    code: "HTTP_RESPONSE_TOO_LARGE",
    status: response.status,
    expose: false,
    severity: "error",
    details: {
      status: response.status,
      url: response.url,
      maxBytes,
      ...(contentLength === undefined ? {} : { contentLength }),
    },
  });
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

/** Returns true for default retryable HTTP status codes. */
export function isRetryableStatus(status: number): boolean {
  return DEFAULT_RETRYABLE_STATUSES.includes(
    status as typeof DEFAULT_RETRYABLE_STATUSES[number],
  );
}

/** Returns true for transient network and timeout errors. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.code === "HTTP_TIMEOUT" ||
      error.code === "HTTP_NETWORK_ERROR" ||
      error.code === "HTTP_RETRY_EXHAUSTED";
  }

  if (error instanceof DOMException) {
    return error.name === "NetworkError";
  }

  return error instanceof TypeError;
}

/** Applies retry count, method, status, and error rules. */
export function shouldRetry(context: RetryContext): boolean {
  if (context.attempt >= context.options.attempts) {
    return false;
  }

  if (!context.options.retryOnMethods.includes(context.method)) {
    return false;
  }

  if (context.response !== undefined) {
    return context.options.retryOnStatuses.includes(context.response.status);
  }

  if (context.error !== undefined) {
    return isRetryableError(context.error);
  }

  return false;
}

/** Waits for a number of milliseconds using setTimeout. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/** Wraps a fetch promise with an AbortController-backed timeout. */
export async function withTimeout<T>(
  fetchPromise: Promise<T>,
  timeoutMs: number | undefined,
  controller?: AbortController,
): Promise<T> {
  if (timeoutMs === undefined) {
    try {
      return await fetchPromise;
    } catch (cause) {
      throw classifyFetchError(cause);
    }
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new HttpError("HTTP timeout must be greater than zero", {
      code: "HTTP_TIMEOUT",
      details: { timeoutMs },
    });
  }

  let timeoutError: HttpError | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutError = new HttpError("HTTP request timed out", {
        code: "HTTP_TIMEOUT",
        details: { timeoutMs },
      });
      controller?.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (cause) {
    if (isHttpErrorCode(cause, "HTTP_TIMEOUT")) {
      throw cause;
    }

    if (timeoutError !== undefined) {
      throw timeoutError;
    }

    throw classifyFetchError(cause);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** Creates a deterministic fetch implementation for tests. */
export function createMockFetch(routes: MockRoute[]): FetchLike {
  const routeList = [...routes];

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    for (const route of routeList) {
      const method = route.method ?? "GET";

      if (
        request.method.toUpperCase() === method && url.pathname === route.path
      ) {
        return await route.handler(request);
      }
    }

    return createJsonResponse(
      { error: "Not found" },
      { status: 404, statusText: "Not Found" },
    );
  };
}

/** Creates a Response with an application/json content type. */
export function createJsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = mergeHeaders(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

/** Creates a Response with a text/plain UTF-8 content type. */
export function createTextResponse(
  body: string,
  init: ResponseInit = {},
): Response {
  const headers = mergeHeaders(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

interface ExecuteRequestOptions {
  readonly baseUrl?: string | URL;
  readonly defaultHeaders: Headers;
  readonly defaultTimeoutMs?: number;
  readonly defaultRetry?: RetryOptions;
  readonly fetch: FetchLike;
  readonly logger?: Logger;
  readonly path: string;
  readonly options: HttpRequestOptions;
  readonly maxResponseBytes?: number;
}

async function executeRequest(
  context: ExecuteRequestOptions,
): Promise<Response> {
  const method = context.options.method ?? "GET";
  const expectOk = context.options.expectOk ?? true;
  const url = buildUrl(
    context.baseUrl,
    context.options.path ?? context.path,
    context.options.query,
  );
  const headers = mergeHeaders(context.defaultHeaders, context.options.headers);
  const timeoutMs = context.options.timeoutMs ?? context.defaultTimeoutMs;
  const retryOptions = context.options.retry === false
    ? undefined
    : normalizeRetryOptions(context.options.retry ?? context.defaultRetry);
  const startedAt = Date.now();
  let attempt = 0;
  let lastError: unknown;
  const safeUrl = safeUrlString(url);

  logDebug(
    context.logger,
    { method, url: safeUrl },
    "http request started",
  );

  while (true) {
    const requestController = createRequestController(context.options.signal);
    const requestInit: RequestInit = {
      method,
      headers: mergeHeaders(headers),
      body: methodAllowsBody(method) ? context.options.body ?? null : null,
      signal: requestController.signal,
    };

    try {
      const response = await withTimeout(
        context.fetch(url, requestInit),
        timeoutMs,
        requestController.controller,
      );

      if (
        retryOptions !== undefined &&
        shouldRetry({ attempt, method, response, options: retryOptions })
      ) {
        attempt += 1;
        const retryAfterMs = retryOptions.respectRetryAfter
          ? parseRetryAfter(response.headers.get("retry-after"))
          : undefined;
        const delayMs = computeRetryDelay({
          attempt,
          backoffMs: retryOptions.backoffMs,
          maxBackoffMs: retryOptions.maxBackoffMs,
          jitter: retryOptions.jitter,
          retryAfterMs,
        });
        logWarn(
          context.logger,
          {
            method,
            url: safeUrl,
            attempt,
            status: response.status,
            delayMs,
          },
          "http request retrying",
        );
        await wait(delayMs);
        continue;
      }

      if (expectOk && !response.ok) {
        throw await createResponseError(
          response,
          method,
          url,
          context.maxResponseBytes,
        );
      }

      logDebug(
        context.logger,
        {
          method,
          url: safeUrl,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        "http request completed",
      );

      return response;
    } catch (cause) {
      const error = classifyFetchError(cause);
      lastError = error;

      if (
        retryOptions !== undefined &&
        shouldRetry({ attempt, method, error, options: retryOptions })
      ) {
        attempt += 1;
        const delayMs = computeRetryDelay({
          attempt,
          backoffMs: retryOptions.backoffMs,
          maxBackoffMs: retryOptions.maxBackoffMs,
          jitter: retryOptions.jitter,
        });
        logWarn(
          context.logger,
          {
            method,
            url: safeUrl,
            attempt,
            delayMs,
          },
          "http request retrying",
        );
        await wait(delayMs);
        continue;
      }

      logError(
        context.logger,
        {
          method,
          url: safeUrl,
          durationMs: Date.now() - startedAt,
        },
        "http request failed",
      );

      if (
        retryOptions !== undefined &&
        attempt >= retryOptions.attempts &&
        retryOptions.attempts > 0 &&
        isRetryableError(error)
      ) {
        throw new HttpError("HTTP retries exhausted", {
          code: "HTTP_RETRY_EXHAUSTED",
          expose: false,
          severity: "error",
          details: {
            method,
            url: safeUrl,
            attempts: retryOptions.attempts,
          },
          cause: lastError,
        });
      }

      throw error;
    }
  }
}

function prepareJsonOptions(options: JsonRequestOptions): HttpRequestOptions {
  const headers = mergeHeaders(options.headers);

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const requestOptions: HttpRequestOptions = {
    ...options,
    headers,
  };

  if ("json" in options) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return {
      ...requestOptions,
      body: JSON.stringify(options.json),
    };
  }

  return requestOptions;
}

function prepareJsonMethodOptions(
  method: HttpMethod,
  json: unknown,
  options: JsonRequestOptions,
  hasJson: boolean,
): JsonRequestOptions {
  if (!hasJson) {
    return { ...options, method };
  }

  return { ...options, method, json };
}

function normalizeRetryOptions(
  options: RetryOptions = {},
): RequiredRetryOptions {
  return {
    attempts: Math.max(0, Math.trunc(options.attempts ?? 0)),
    backoffMs: Math.max(0, options.backoffMs ?? DEFAULT_BACKOFF_MS),
    maxBackoffMs: Math.max(
      0,
      options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
    ),
    retryOnStatuses: [
      ...(options.retryOnStatuses ?? DEFAULT_RETRYABLE_STATUSES),
    ],
    retryOnMethods: [...(options.retryOnMethods ?? DEFAULT_RETRYABLE_METHODS)],
    jitter: options.jitter ?? true,
    respectRetryAfter: options.respectRetryAfter ?? true,
  };
}

/** Inputs to {@link computeRetryDelay}. */
export interface RetryDelayInput {
  /** 1-based number of the attempt about to be delayed. */
  readonly attempt: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  /** Apply full jitter to the exponential delay. */
  readonly jitter: boolean;
  /** Server-requested delay (from `Retry-After`), in milliseconds, if honored. */
  readonly retryAfterMs?: number;
  /** Injectable randomness for deterministic tests. Defaults to `Math.random`. */
  readonly random?: () => number;
}

/**
 * Computes the delay before a retry attempt.
 *
 * A server-supplied `Retry-After` delay takes precedence (and is not jittered);
 * otherwise the delay is exponential (`backoffMs * 2^(attempt-1)`) capped at
 * `maxBackoffMs`, with optional full jitter in `[0, capped]`. The result is
 * always bounded by `maxBackoffMs`, so a hostile `Retry-After` cannot pin the
 * client for an unbounded time.
 */
export function computeRetryDelay(input: RetryDelayInput): number {
  if (input.retryAfterMs !== undefined) {
    return Math.min(Math.max(0, input.retryAfterMs), input.maxBackoffMs);
  }

  const exponent = Math.max(0, input.attempt - 1);
  const exponential = input.backoffMs * 2 ** exponent;
  const capped = Math.min(exponential, input.maxBackoffMs);

  if (!input.jitter) {
    return capped;
  }

  const random = input.random ?? Math.random;
  return Math.round(capped * random());
}

/**
 * Parses a `Retry-After` header value into milliseconds.
 *
 * Supports both delta-seconds (`"120"`) and an HTTP-date. Returns `undefined`
 * for a missing, empty, or unparseable value, and never returns a negative
 * delay.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - now);
}

/** Returns true when a header, query, or field name is treated as sensitive. */
export function isSensitiveHttpName(name: string): boolean {
  return isSensitiveName(name);
}

function methodAllowsBody(method: HttpMethod): boolean {
  return method !== "GET" && method !== "HEAD";
}

function getGlobalFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new HttpError("globalThis.fetch is not available", {
      code: "HTTP_UNKNOWN_ERROR",
    });
  }

  return globalThis.fetch.bind(globalThis);
}

function ensureBaseUrl(baseUrl: string | URL): URL {
  const url = baseUrl instanceof URL
    ? new URL(baseUrl.toString())
    : new URL(baseUrl);

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url;
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: HttpQueryValue | HttpQueryValue[],
): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      appendQueryValue(searchParams, key, entry);
    }

    return;
  }

  if (value === null || value === undefined) {
    return;
  }

  searchParams.append(key, String(value));
}

async function createResponseError(
  response: Response,
  method: HttpMethod,
  url: URL,
  maxResponseBytes: number | undefined,
): Promise<HttpError> {
  const body = await safeParseJsonResponse<HttpResponseErrorBody>(
    response.clone(),
    { maxBytes: maxResponseBytes },
  );
  const isClientError = response.status >= 400 && response.status < 500;

  return new HttpError(`HTTP response error: ${response.status}`, {
    code: "HTTP_RESPONSE_ERROR",
    status: response.status,
    expose: isClientError,
    severity: isClientError ? "warn" : "error",
    details: {
      status: response.status,
      statusText: response.statusText,
      url: safeUrlString(url),
      method,
      ...(body === undefined ? {} : { body: sanitizeErrorBody(body) }),
    },
  });
}

function sanitizeErrorBody(body: unknown): HttpResponseErrorBody | undefined {
  const sanitized = sanitizeJsonValue(body, new WeakSet<object>());

  if (
    sanitized === undefined ||
    typeof sanitized === "function" ||
    typeof sanitized === "symbol"
  ) {
    return undefined;
  }

  return sanitized as HttpResponseErrorBody;
}

function sanitizeJsonValue(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      output[key] = isSensitiveName(key)
        ? REDACTED_VALUE
        : sanitizeJsonValue(entry, seen);
    }

    seen.delete(value);
    return output;
  }

  return String(value);
}

function classifyFetchError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof DOMException) {
    // A `TimeoutError` (e.g. from `AbortSignal.timeout`) is a timeout, not a
    // caller-initiated abort.
    if (error.name === "TimeoutError") {
      return new HttpError("HTTP request timed out", {
        code: "HTTP_TIMEOUT",
        expose: false,
        severity: "warn",
        cause: error,
      });
    }

    if (error.name === "AbortError") {
      return new HttpError("HTTP request aborted", {
        code: "HTTP_ABORTED",
        expose: false,
        severity: "warn",
        details: describeAbortReason(error),
        cause: error,
      });
    }
  }

  if (error instanceof TypeError) {
    return new HttpError("HTTP network error", {
      code: "HTTP_NETWORK_ERROR",
      expose: false,
      severity: "error",
      cause: error,
    });
  }

  return new HttpError("Unknown HTTP error", {
    code: "HTTP_UNKNOWN_ERROR",
    expose: false,
    severity: "error",
    cause: error,
  });
}

function describeAbortReason(error: DOMException): Record<string, unknown> {
  // `DOMException` does not standardize a `reason`, but Deno/web abort errors
  // may carry one; surface a string form for diagnostics without leaking objects.
  const reason = (error as { readonly reason?: unknown }).reason;
  if (reason === undefined) {
    return {};
  }

  if (typeof reason === "string") {
    return { reason };
  }

  if (reason instanceof Error) {
    return { reason: reason.message };
  }

  return {};
}

function isHttpErrorCode(
  error: unknown,
  code: HttpErrorCode,
): error is HttpError {
  return error instanceof HttpError && error.code === code;
}

function createRequestController(signal: AbortSignal | undefined): {
  readonly controller: AbortController;
  readonly signal: AbortSignal;
} {
  const controller = new AbortController();

  if (signal !== undefined) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => controller.abort(signal.reason),
        { once: true },
      );
    }
  }

  return {
    controller,
    signal: controller.signal,
  };
}

function logDebug(
  logger: Logger | undefined,
  fields: Record<string, unknown>,
  message: string,
): void {
  try {
    logger?.debug(fields, message);
  } catch {
    // Logging must not affect the request.
  }
}

function logWarn(
  logger: Logger | undefined,
  fields: Record<string, unknown>,
  message: string,
): void {
  try {
    logger?.warn(fields, message);
  } catch {
    // Logging must not affect the request.
  }
}

function logError(
  logger: Logger | undefined,
  fields: Record<string, unknown>,
  message: string,
): void {
  try {
    logger?.error(fields, message);
  } catch {
    // Logging must not affect the request.
  }
}

function isSensitiveName(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  return SENSITIVE_HEADERS.includes(
    normalizedKey as typeof SENSITIVE_HEADERS[number],
  ) || SENSITIVE_NAME_PARTS.some((part) => normalizedKey.includes(part));
}

function safeUrlString(url: URL): string {
  try {
    const safeUrl = new URL(url.toString());

    if (safeUrl.username.length > 0) {
      safeUrl.username = REDACTED_VALUE;
    }

    if (safeUrl.password.length > 0) {
      safeUrl.password = REDACTED_VALUE;
    }

    for (const key of [...safeUrl.searchParams.keys()]) {
      if (isSensitiveName(key)) {
        safeUrl.searchParams.delete(key);
        safeUrl.searchParams.append(key, REDACTED_VALUE);
      }
    }

    return safeUrl.toString();
  } catch {
    return "[invalid-url]";
  }
}

function sanitizeUrlText(value: string): string {
  try {
    return safeUrlString(new URL(value));
  } catch {
    return value.replace(
      /([?&][^=]*(?:token|secret|password|api[_-]?key)[^=]*=)[^&]*/gi,
      `$1${REDACTED_VALUE}`,
    );
  }
}

// Example: cliente simples com baseUrl.
// const api = createHttpClient({
//   baseUrl: "https://api.example.com",
//   headers: { authorization: "Bearer token" },
// });
//
// Example: GET JSON.
// const user = await api.getJson<{ id: string }>("/users/u_123");
//
// Example: POST JSON.
// const created = await api.postJson<{ id: string }>("/users", {
//   name: "Lucas",
// });
//
// Example: timeout.
// const fastApi = createHttpClient({
//   baseUrl: "https://api.example.com",
//   timeoutMs: 5000,
// });
//
// Example: retry.
// const retryingApi = createHttpClient({
//   baseUrl: "https://api.example.com",
//   retry: { attempts: 3, backoffMs: 250 },
// });
//
// Example: mock fetch para teste.
// const mockFetch = createMockFetch([
//   {
//     path: "/health",
//     handler: () => createJsonResponse({ ok: true }),
//   },
// ]);
// const testApi = createHttpClient({
//   baseUrl: "https://api.example.com",
//   fetch: mockFetch,
// });
// const health = await testApi.getJson<{ ok: boolean }>("/health");
