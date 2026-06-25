/**
 * Public entrypoint for @rootware/http.
 *
 * TODO: Implement HTTP client transport, retry policy, timeout handling, and errors.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type HttpHeaders = Record<string, string>;

export interface RetryOptions {
  readonly attempts?: number;
  readonly backoffMs?: number;
  readonly retryOnStatus?: readonly number[];
}

export interface TimeoutOptions {
  readonly requestMs?: number;
}

export interface HttpClientOptions {
  readonly baseUrl?: string;
  readonly headers?: HttpHeaders;
  readonly retry?: RetryOptions;
  readonly timeout?: TimeoutOptions;
}

export interface HttpRequest<TBody = unknown> {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers?: HttpHeaders;
  readonly body?: TBody;
}

export interface HttpResponse<TBody = unknown> {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly body: TBody;
}

export class RootwareHttpClient {
  constructor(readonly options: HttpClientOptions = {}) {}

  request<TBody = unknown, TResponse = unknown>(
    _request: HttpRequest<TBody>,
  ): Promise<HttpResponse<TResponse>> {
    throw new Error("Not implemented");
  }

  get<TResponse = unknown>(
    _url: string,
    _headers?: HttpHeaders,
  ): Promise<HttpResponse<TResponse>> {
    throw new Error("Not implemented");
  }

  post<TBody = unknown, TResponse = unknown>(
    _url: string,
    _body?: TBody,
    _headers?: HttpHeaders,
  ): Promise<HttpResponse<TResponse>> {
    throw new Error("Not implemented");
  }

  put<TBody = unknown, TResponse = unknown>(
    _url: string,
    _body?: TBody,
    _headers?: HttpHeaders,
  ): Promise<HttpResponse<TResponse>> {
    throw new Error("Not implemented");
  }

  delete<TResponse = unknown>(
    _url: string,
    _headers?: HttpHeaders,
  ): Promise<HttpResponse<TResponse>> {
    throw new Error("Not implemented");
  }
}

export function createHttpClient(
  _options?: HttpClientOptions,
): RootwareHttpClient {
  throw new Error("Not implemented");
}
