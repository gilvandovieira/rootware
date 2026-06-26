import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

/** Error codes emitted by storage validation, object operations, and signing. */
export type StorageErrorCode =
  | "STORAGE_INVALID_KEY"
  | "STORAGE_INVALID_BUCKET"
  | "STORAGE_PUT_FAILED"
  | "STORAGE_GET_FAILED"
  | "STORAGE_DELETE_FAILED"
  | "STORAGE_LIST_FAILED"
  | "STORAGE_OBJECT_NOT_FOUND"
  | "STORAGE_INVALID_CONTENT_TYPE"
  | "STORAGE_MAX_SIZE_EXCEEDED"
  | "STORAGE_SIGNING_UNSUPPORTED"
  | "STORAGE_SIGN_FAILED"
  | "STORAGE_UNKNOWN_ERROR"
  | (string & Record<never, never>);

/** Normalized object key within a storage namespace or bucket. */
export type StorageKey = string;

/** Normalized storage bucket name. */
export type StorageBucketName = string;

/** User-defined string metadata attached to stored objects. */
export type StorageMetadata = Record<string, string>;

/** Body input accepted by {@link StorageClient.put}. */
export type StoragePutBody = Blob | Uint8Array | ArrayBuffer | string;

/** Stored object including its complete body. */
export interface StorageObject {
  readonly key: StorageKey;
  readonly blob: Blob;
  readonly contentType?: string;
  readonly size: number;
  readonly checksum?: string;
  readonly metadata: StorageMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Object metadata without the body payload. */
export interface StorageObjectInfo {
  readonly key: StorageKey;
  readonly contentType?: string;
  readonly size: number;
  readonly checksum?: string;
  readonly metadata: StorageMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Options for writing a storage object. */
export interface StoragePutOptions {
  readonly contentType?: string;
  readonly metadata?: StorageMetadata;
  readonly maxSizeBytes?: number;
  readonly checksum?: string;
  readonly publicUrl?: string;
}

/** Options for reading a storage object. */
export interface StorageGetOptions {
  readonly includeBody?: boolean;
}

/** Options for deleting a storage object. */
export interface StorageDeleteOptions {
  readonly silent?: boolean;
}

/** Options for listing storage objects. */
export interface StorageListOptions {
  readonly prefix?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

/** Paged list response returned by storage stores and clients. */
export interface StorageListResult {
  readonly objects: StorageObjectInfo[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

/** HTTP method a signed URL authorizes: download (`GET`) or upload (`PUT`). */
export type SignedUrlMethod = "GET" | "PUT";

/** Options for requesting a signed URL. */
export interface SignUrlOptions {
  /** Operation the URL authorizes. Defaults to `"GET"`. */
  readonly method?: SignedUrlMethod;
  /** Validity window. Defaults to 15 minutes; capped at 7 days. */
  readonly expiresInMs?: number;
  /** Required upload content type, for `PUT` URLs. */
  readonly contentType?: string;
}

/** Fully-resolved sign options handed to a {@link StorageStore.signUrl} adapter. */
export interface ResolvedSignUrlOptions {
  readonly method: SignedUrlMethod;
  readonly expiresInMs: number;
  readonly contentType?: string;
}

/** A time-limited signed URL produced by an adapter that supports signing. */
export interface SignedUrl {
  readonly url: string;
  readonly method: SignedUrlMethod;
  /** ISO timestamp after which the URL is no longer valid. */
  readonly expiresAt: string;
  readonly key: StorageKey;
}

/** Async-first adapter interface for object storage backends. */
export interface StorageStore {
  put(
    key: StorageKey,
    object: StorageObject,
    options?: StoragePutOptions,
  ): Promise<void>;

  get(
    key: StorageKey,
    options?: StorageGetOptions,
  ): Promise<StorageObject | undefined>;

  delete(
    key: StorageKey,
    options?: StorageDeleteOptions,
  ): Promise<boolean>;

  exists(
    key: StorageKey,
  ): Promise<boolean>;

  list(
    options?: StorageListOptions,
  ): Promise<StorageListResult>;

  /**
   * Optionally produces a time-limited signed URL. Stores that front a signing
   * backend (S3, R2, GCS) implement it; stores that cannot sign (in-memory,
   * local filesystem) omit it, and the client then throws
   * `STORAGE_SIGNING_UNSUPPORTED`.
   */
  signUrl?(
    key: StorageKey,
    options: ResolvedSignUrlOptions,
  ): Promise<SignedUrl>;

  clear?(): Promise<void>;

  close?(): Promise<void>;
}

/** User-facing storage client. */
export interface StorageClient {
  put(
    key: StorageKey,
    body: StoragePutBody,
    options?: StoragePutOptions,
  ): Promise<StorageObjectInfo>;

  get(
    key: StorageKey,
    options?: StorageGetOptions,
  ): Promise<StorageObject | undefined>;

  getInfo(
    key: StorageKey,
  ): Promise<StorageObjectInfo | undefined>;

  delete(
    key: StorageKey,
    options?: StorageDeleteOptions,
  ): Promise<boolean>;

  exists(
    key: StorageKey,
  ): Promise<boolean>;

  list(
    options?: StorageListOptions,
  ): Promise<StorageListResult>;

  bucket(
    name: StorageBucketName,
  ): StorageBucket;

  publicUrl(
    key: StorageKey,
  ): string | undefined;

  /**
   * Produces a time-limited signed URL for `key`. Throws
   * `STORAGE_SIGNING_UNSUPPORTED` when the underlying store cannot sign.
   */
  signUrl(
    key: StorageKey,
    options?: SignUrlOptions,
  ): Promise<SignedUrl>;

  clear(): Promise<void>;

  close(): Promise<void>;
}

/** Bucket-scoped storage client. */
export interface StorageBucket {
  readonly name: StorageBucketName;

  put(
    key: StorageKey,
    body: StoragePutBody,
    options?: StoragePutOptions,
  ): Promise<StorageObjectInfo>;

  get(
    key: StorageKey,
    options?: StorageGetOptions,
  ): Promise<StorageObject | undefined>;

  getInfo(
    key: StorageKey,
  ): Promise<StorageObjectInfo | undefined>;

  delete(
    key: StorageKey,
    options?: StorageDeleteOptions,
  ): Promise<boolean>;

  exists(
    key: StorageKey,
  ): Promise<boolean>;

  list(
    options?: StorageListOptions,
  ): Promise<StorageListResult>;

  publicUrl(
    key: StorageKey,
  ): string | undefined;

  signUrl(
    key: StorageKey,
    options?: SignUrlOptions,
  ): Promise<SignedUrl>;
}

/** Options for creating a storage client. */
export interface StorageOptions {
  readonly store?: StorageStore;
  readonly namespace?: string;
  readonly publicBaseUrl?: string;
  readonly maxSizeBytes?: number;
  readonly allowedContentTypes?: string[];
  readonly logger?: Logger;
}

/** Options for the in-memory storage store. */
export interface MemoryStorageStoreOptions {
  readonly maxObjects?: number;
  readonly cloneObjects?: boolean;
}

/**
 * Minimal filesystem surface used by {@link localStorageStore}. The default
 * implementation uses Deno file APIs (and so needs `--allow-read`/`--allow-write`
 * on the storage directory); tests inject an in-memory implementation instead.
 */
export interface StorageFileSystem {
  /** Reads a file, returning `undefined` when it does not exist. */
  readFile(path: string): Promise<Uint8Array | undefined>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Creates a directory recursively; a no-op when it already exists. */
  mkdir(path: string): Promise<void>;
  /** Lists file names directly under a directory; `[]` when it does not exist. */
  readDir(path: string): Promise<readonly string[]>;
}

/** Options for the local filesystem storage store. */
export interface LocalStorageStoreOptions {
  readonly rootDir: string;
  readonly fs?: StorageFileSystem;
}

/** Fetch-compatible transport injected into {@link s3StorageStore}. */
export type StorageFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Options for an S3-compatible {@link StorageStore} (AWS S3, Cloudflare R2,
 * RustFS, …). The `fetch` transport is injectable so the adapter is testable
 * without a live bucket, and SigV4 signing happens in-process via Web Crypto.
 */
export interface S3StorageStoreOptions {
  readonly bucket: string;
  /** AWS region (e.g. `"us-east-1"`); R2/RustFS accept `"auto"`. */
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Temporary-credential session token (`X-Amz-Security-Token`), if any. */
  readonly sessionToken?: string;
  /**
   * Service endpoint, e.g. `"https://s3.us-east-1.amazonaws.com"`,
   * `"https://<account>.r2.cloudflarestorage.com"`, or
   * `"http://localhost:9000"`. Defaults to the AWS regional endpoint.
   */
  readonly endpoint?: string;
  /**
   * Put the bucket in the path (`/bucket/key`) rather than the host
   * (`bucket.host/key`). Defaults to `true` when a custom `endpoint` is set
   * (R2/RustFS), `false` for the AWS default (virtual-hosted).
   */
  readonly forcePathStyle?: boolean;
  /** Signing service name; defaults to `"s3"`. */
  readonly service?: string;
  /** Injectable transport; defaults to global `fetch`. */
  readonly fetch?: StorageFetch;
}

/** Options accepted when constructing a {@link StorageError}. */
export interface StorageErrorOptions {
  readonly code?: StorageErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for storage validation and operation failures. */
export class StorageError extends RootwareError {
  constructor(message: string, options: StorageErrorOptions = {}) {
    super(message, {
      code: options.code ?? "STORAGE_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Creates a storage client backed by a store, defaulting to memory storage. */
export function createStorage(options: StorageOptions = {}): StorageClient {
  const store = options.store ?? memoryStorageStore();
  const namespace = options.namespace === undefined
    ? undefined
    : normalizeStorageKey(options.namespace);
  const publicBaseUrl = options.publicBaseUrl;
  const maxSizeBytes = normalizeMaxSizeBytes(options.maxSizeBytes);
  const allowedContentTypes = options.allowedContentTypes === undefined
    ? undefined
    : options.allowedContentTypes.map((contentType) =>
      normalizeRequiredContentType(contentType)
    );
  const logger = options.logger;

  return new RootwareStorageClient({
    store,
    namespace,
    publicBaseUrl,
    maxSizeBytes,
    allowedContentTypes,
    logger,
  });
}

/** Creates an in-memory object store for deterministic tests and local use. */
export function memoryStorageStore(
  options: MemoryStorageStoreOptions = {},
): StorageStore {
  const objects = new Map<StorageKey, StorageObject>();
  const maxObjects = normalizeMaxObjects(options.maxObjects);
  const cloneObjects = options.cloneObjects ?? false;

  return {
    put(
      key: StorageKey,
      object: StorageObject,
      _options: StoragePutOptions = {},
    ): Promise<void> {
      const normalizedKey = normalizeStorageKey(key);

      if (objects.has(normalizedKey)) {
        objects.delete(normalizedKey);
      }

      objects.set(
        normalizedKey,
        cloneObjects
          ? cloneStorageObjectWithBlob(object)
          : cloneStorageObject(object),
      );
      evictOldestObjects(objects, maxObjects);
      return Promise.resolve();
    },

    get(
      key: StorageKey,
      _options: StorageGetOptions = {},
    ): Promise<StorageObject | undefined> {
      const object = objects.get(normalizeStorageKey(key));

      if (object === undefined) {
        return Promise.resolve(undefined);
      }

      return Promise.resolve(
        cloneObjects
          ? cloneStorageObjectWithBlob(object)
          : cloneStorageObject(object),
      );
    },

    delete(
      key: StorageKey,
      _options: StorageDeleteOptions = {},
    ): Promise<boolean> {
      return Promise.resolve(objects.delete(normalizeStorageKey(key)));
    },

    exists(key: StorageKey): Promise<boolean> {
      return Promise.resolve(objects.has(normalizeStorageKey(key)));
    },

    list(options: StorageListOptions = {}): Promise<StorageListResult> {
      const prefix = normalizeOptionalStorageKey(options.prefix);
      const cursor = normalizeOptionalStorageKey(options.cursor);
      const limit = normalizeListLimit(options.limit);
      const keys = [...objects.keys()]
        .filter((key) => matchesPrefix(key, prefix))
        .sort();

      const startIndex = getCursorStartIndex(keys, cursor);
      const availableKeys = keys.slice(startIndex);
      const selectedKeys = limit === undefined
        ? availableKeys
        : availableKeys.slice(0, limit);
      const nextKey = limit === undefined ? undefined : availableKeys[limit];

      return Promise.resolve({
        objects: selectedKeys.map((key) =>
          toStorageObjectInfo(objects.get(key)!)
        ),
        ...(nextKey === undefined ? {} : { cursor: nextKey }),
        hasMore: nextKey !== undefined,
      });
    },

    clear(): Promise<void> {
      objects.clear();
      return Promise.resolve();
    },

    close(): Promise<void> {
      objects.clear();
      return Promise.resolve();
    },
  };
}

/**
 * Creates a {@link StorageStore} backed by the local filesystem. Each object is
 * persisted as one JSON file (metadata plus a base64 body) named after its key.
 * Pass a custom {@link StorageFileSystem} to test without touching disk.
 */
export function localStorageStore(
  options: LocalStorageStoreOptions,
): StorageStore {
  const fs = options.fs ?? denoStorageFileSystem();
  const rootDir = options.rootDir;
  let rootEnsured = false;

  const ensureRoot = async (): Promise<void> => {
    if (!rootEnsured) {
      await fs.mkdir(rootDir);
      rootEnsured = true;
    }
  };

  const pathFor = (key: StorageKey): string =>
    joinStoragePath(rootDir, `${encodeURIComponent(key)}.json`);

  const readRecord = async (
    key: StorageKey,
  ): Promise<LocalStorageRecord | undefined> => {
    const bytes = await fs.readFile(pathFor(key));

    if (bytes === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as LocalStorageRecord;
    } catch (cause) {
      throw new StorageError("Failed to read stored object", {
        code: "STORAGE_GET_FAILED",
        details: { key },
        cause,
      });
    }
  };

  return {
    async put(
      key: StorageKey,
      object: StorageObject,
      _options: StoragePutOptions = {},
    ): Promise<void> {
      await ensureRoot();
      const normalizedKey = normalizeStorageKey(key);
      const bytes = new Uint8Array(await object.blob.arrayBuffer());
      const record: LocalStorageRecord = {
        key: normalizedKey,
        contentType: object.contentType,
        size: object.size,
        checksum: object.checksum,
        metadata: object.metadata,
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
        body: encodeBase64(bytes),
      };

      await fs.writeFile(
        pathFor(normalizedKey),
        new TextEncoder().encode(JSON.stringify(record)),
      );
    },

    async get(
      key: StorageKey,
      _options: StorageGetOptions = {},
    ): Promise<StorageObject | undefined> {
      const record = await readRecord(normalizeStorageKey(key));
      return record === undefined ? undefined : recordToStorageObject(record);
    },

    async delete(
      key: StorageKey,
      _options: StorageDeleteOptions = {},
    ): Promise<boolean> {
      const normalizedKey = normalizeStorageKey(key);

      if (await readRecord(normalizedKey) === undefined) {
        return false;
      }

      await fs.remove(pathFor(normalizedKey));
      return true;
    },

    async exists(key: StorageKey): Promise<boolean> {
      return await readRecord(normalizeStorageKey(key)) !== undefined;
    },

    async list(options: StorageListOptions = {}): Promise<StorageListResult> {
      const prefix = normalizeOptionalStorageKey(options.prefix);
      const cursor = normalizeOptionalStorageKey(options.cursor);
      const limit = normalizeListLimit(options.limit);
      const keys = (await listStorageKeys(fs, rootDir))
        .filter((key) => matchesPrefix(key, prefix))
        .sort();

      const startIndex = getCursorStartIndex(keys, cursor);
      const availableKeys = keys.slice(startIndex);
      const selectedKeys = limit === undefined
        ? availableKeys
        : availableKeys.slice(0, limit);
      const nextKey = limit === undefined ? undefined : availableKeys[limit];

      const objects: StorageObjectInfo[] = [];
      for (const key of selectedKeys) {
        const record = await readRecord(key);
        if (record !== undefined) {
          objects.push(recordToStorageObjectInfo(record));
        }
      }

      return {
        objects,
        ...(nextKey === undefined ? {} : { cursor: nextKey }),
        hasMore: nextKey !== undefined,
      };
    },

    async clear(): Promise<void> {
      for (const key of await listStorageKeys(fs, rootDir)) {
        await fs.remove(pathFor(key));
      }
    },
  };
}

/**
 * Creates an S3-compatible {@link StorageStore} (AWS S3, Cloudflare R2, RustFS).
 *
 * Requests are signed with AWS Signature V4 using Web Crypto, and `signUrl`
 * produces SigV4 presigned URLs. The `fetch` transport is injectable, so the
 * adapter is unit-testable without a live bucket; the integration suite exercises
 * it against RustFS. Object user metadata is carried as `x-amz-meta-*` headers.
 */
export function s3StorageStore(
  options: S3StorageStoreOptions,
): StorageStore {
  const config = resolveS3Config(options);
  const fetchFn = options.fetch ?? getGlobalStorageFetch();

  const send = async (
    method: string,
    key: StorageKey | undefined,
    init: {
      readonly query?: Record<string, string>;
      readonly headers?: Record<string, string>;
      readonly body?: Uint8Array;
    } = {},
  ): Promise<Response> => {
    const { url, headers } = await signS3Request(config, {
      method,
      key,
      query: init.query,
      headers: init.headers,
      body: init.body,
    });

    return await fetchFn(url, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: toArrayBuffer(init.body) }),
    });
  };

  return {
    async put(
      key: StorageKey,
      object: StorageObject,
      _options: StoragePutOptions = {},
    ): Promise<void> {
      const normalizedKey = normalizeStorageKey(key);
      const body = new Uint8Array(await object.blob.arrayBuffer());
      const headers: Record<string, string> = {};

      if (object.contentType !== undefined) {
        headers["content-type"] = object.contentType;
      }
      for (const [name, value] of Object.entries(object.metadata)) {
        headers[`x-amz-meta-${name.toLowerCase()}`] = value;
      }

      const response = await send("PUT", normalizedKey, { headers, body });
      await assertS3Ok(response, "STORAGE_PUT_FAILED", normalizedKey);
    },

    async get(
      key: StorageKey,
      _options: StorageGetOptions = {},
    ): Promise<StorageObject | undefined> {
      const normalizedKey = normalizeStorageKey(key);
      const response = await send("GET", normalizedKey);

      if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
      }
      await assertS3Ok(response, "STORAGE_GET_FAILED", normalizedKey);

      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? undefined;
      const blob = new Blob([bytes], {
        ...(contentType === undefined ? {} : { type: contentType }),
      });

      return {
        key: normalizedKey,
        blob,
        ...(contentType === undefined ? {} : { contentType }),
        size: bytes.byteLength,
        ...(parseETag(response.headers.get("etag")) === undefined ? {} : {
          checksum: parseETag(response.headers.get("etag")),
        }),
        metadata: readAmzMetadata(response.headers),
        createdAt: response.headers.get("last-modified") ?? new Date()
          .toISOString(),
        updatedAt: response.headers.get("last-modified") ?? new Date()
          .toISOString(),
      };
    },

    async delete(
      key: StorageKey,
      _options: StorageDeleteOptions = {},
    ): Promise<boolean> {
      const normalizedKey = normalizeStorageKey(key);
      const existed = await this.exists(normalizedKey);

      const response = await send("DELETE", normalizedKey);
      // S3 returns 204 whether or not the object existed.
      if (response.status !== 204 && response.status !== 200) {
        await assertS3Ok(response, "STORAGE_DELETE_FAILED", normalizedKey);
      } else {
        await response.body?.cancel();
      }

      return existed;
    },

    async exists(key: StorageKey): Promise<boolean> {
      const normalizedKey = normalizeStorageKey(key);
      const response = await send("HEAD", normalizedKey);
      await response.body?.cancel();

      if (response.status === 200) {
        return true;
      }
      if (response.status === 404) {
        return false;
      }

      throw new StorageError("Storage exists check failed", {
        code: "STORAGE_GET_FAILED",
        details: { key: normalizedKey, status: response.status },
      });
    },

    async list(options: StorageListOptions = {}): Promise<StorageListResult> {
      const query: Record<string, string> = { "list-type": "2" };
      const prefix = normalizeOptionalStorageKey(options.prefix);
      const limit = normalizeListLimit(options.limit);

      if (prefix !== undefined) {
        query.prefix = prefix;
      }
      if (limit !== undefined) {
        query["max-keys"] = String(limit);
      }
      if (options.cursor !== undefined && options.cursor.length > 0) {
        query["continuation-token"] = options.cursor;
      }

      const response = await send("GET", undefined, { query });
      await assertS3Ok(response, "STORAGE_LIST_FAILED", undefined);

      const xml = await response.text();
      return parseS3ListResult(xml);
    },

    async signUrl(
      key: StorageKey,
      options: ResolvedSignUrlOptions,
    ): Promise<SignedUrl> {
      const normalizedKey = normalizeStorageKey(key);
      const url = await presignS3Url(config, normalizedKey, options);

      return {
        url,
        method: options.method,
        expiresAt: new Date(Date.now() + options.expiresInMs).toISOString(),
        key: normalizedKey,
      };
    },
  };
}

/** Creates a bucket wrapper that prefixes all keys with the bucket name. */
export function createStorageBucket(
  storage: StorageClient,
  bucketName: StorageBucketName,
): StorageBucket {
  const name = normalizeBucketName(bucketName);

  return {
    name,

    put(
      key: StorageKey,
      body: StoragePutBody,
      options?: StoragePutOptions,
    ): Promise<StorageObjectInfo> {
      return storage.put(joinStorageKey([name, key]), body, options);
    },

    get(
      key: StorageKey,
      options?: StorageGetOptions,
    ): Promise<StorageObject | undefined> {
      return storage.get(joinStorageKey([name, key]), options);
    },

    getInfo(
      key: StorageKey,
    ): Promise<StorageObjectInfo | undefined> {
      return storage.getInfo(joinStorageKey([name, key]));
    },

    delete(
      key: StorageKey,
      options?: StorageDeleteOptions,
    ): Promise<boolean> {
      return storage.delete(joinStorageKey([name, key]), options);
    },

    exists(key: StorageKey): Promise<boolean> {
      return storage.exists(joinStorageKey([name, key]));
    },

    list(options: StorageListOptions = {}): Promise<StorageListResult> {
      return storage.list({
        ...options,
        prefix: joinStorageKey([name, options.prefix]),
      });
    },

    publicUrl(key: StorageKey): string | undefined {
      return storage.publicUrl(joinStorageKey([name, key]));
    },

    signUrl(key: StorageKey, options?: SignUrlOptions): Promise<SignedUrl> {
      return storage.signUrl(joinStorageKey([name, key]), options);
    },
  };
}

/** Normalizes and validates an object key. */
export function normalizeStorageKey(key: StorageKey): StorageKey {
  if (typeof key !== "string") {
    throwStorageError("Storage key must be a string", "STORAGE_INVALID_KEY");
  }

  let normalizedKey = key.trim();

  if (normalizedKey.length === 0) {
    throwStorageError("Storage key cannot be empty", "STORAGE_INVALID_KEY");
  }

  if (hasControlCharacter(normalizedKey)) {
    throwStorageError(
      "Storage key cannot contain control characters",
      "STORAGE_INVALID_KEY",
    );
  }

  if (normalizedKey.startsWith("/")) {
    throwStorageError(
      "Storage key cannot be an absolute path",
      "STORAGE_INVALID_KEY",
    );
  }

  while (normalizedKey.startsWith("./")) {
    normalizedKey = normalizedKey.slice(2);
  }

  normalizedKey = normalizedKey.replace(/\/+/g, "/");

  if (normalizedKey.length === 0) {
    throwStorageError("Storage key cannot be empty", "STORAGE_INVALID_KEY");
  }

  const segments = normalizedKey.split("/");

  if (segments.some((segment) => segment === "..")) {
    throwStorageError(
      "Storage key cannot contain parent directory segments",
      "STORAGE_INVALID_KEY",
    );
  }

  return segments.filter((segment) => segment !== ".").join("/");
}

/** Normalizes and validates a bucket name. */
export function normalizeBucketName(
  name: StorageBucketName,
): StorageBucketName {
  if (typeof name !== "string") {
    throwStorageError("Bucket name must be a string", "STORAGE_INVALID_BUCKET");
  }

  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.length === 0) {
    throwStorageError("Bucket name cannot be empty", "STORAGE_INVALID_BUCKET");
  }

  if (!/^[a-z0-9_-]+$/.test(normalizedName)) {
    throwStorageError(
      "Bucket name can only contain letters, numbers, hyphens, and underscores",
      "STORAGE_INVALID_BUCKET",
    );
  }

  return normalizedName;
}

/** Joins key parts with `/` after validation, skipping empty parts. */
export function joinStorageKey(
  parts: Array<string | null | undefined>,
): StorageKey {
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === null || part === undefined || part.trim().length === 0) {
      continue;
    }

    normalizedParts.push(normalizeStorageKey(part));
  }

  return normalizeStorageKey(normalizedParts.join("/"));
}

/** Returns the byte size of a Blob. */
export function getBlobSize(blob: Blob): number {
  return blob.size;
}

/** Returns the byte size of a supported storage body. */
export function getBodySize(body: StoragePutBody): number {
  if (body instanceof Blob) {
    return body.size;
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body).byteLength;
  }

  if (body instanceof Uint8Array) {
    return body.byteLength;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  throw new StorageError("Unsupported storage body", {
    code: "STORAGE_PUT_FAILED",
    details: { bodyType: typeof body },
  });
}

/** Converts a supported body into a Blob. */
export function bodyToBlob(
  body: StoragePutBody,
  options: StoragePutOptions = {},
): Blob {
  const contentType = normalizeContentType(options.contentType);

  if (body instanceof Blob) {
    if (contentType === undefined || body.type === contentType) {
      return body;
    }

    return new Blob([body], { type: contentType });
  }

  if (typeof body === "string" || body instanceof ArrayBuffer) {
    return new Blob(
      [body],
      contentType === undefined ? {} : { type: contentType },
    );
  }

  if (body instanceof Uint8Array) {
    const bytes = new Uint8Array(body);
    return new Blob(
      [bytes.buffer],
      contentType === undefined ? {} : { type: contentType },
    );
  }

  throw new StorageError("Unsupported storage body", {
    code: "STORAGE_PUT_FAILED",
    details: { bodyType: typeof body },
  });
}

/** Creates a StorageObject from a key, body, and metadata options. */
export function createStorageObject(
  key: StorageKey,
  body: StoragePutBody,
  options: StoragePutOptions = {},
): StorageObject {
  const normalizedKey = normalizeStorageKey(key);
  const contentType = normalizeContentType(
    options.contentType ?? (body instanceof Blob ? body.type : undefined),
  );
  const blob = bodyToBlob(body, { ...options, contentType });
  const size = getBlobSize(blob);
  const maxSizeBytes = normalizeMaxSizeBytes(options.maxSizeBytes);

  validateMaxSize(size, maxSizeBytes, normalizedKey);

  const now = new Date().toISOString();

  return {
    key: normalizedKey,
    blob,
    ...(contentType === undefined ? {} : { contentType }),
    size,
    ...(options.checksum === undefined ? {} : { checksum: options.checksum }),
    metadata: cloneMetadata(options.metadata ?? {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** Clones object metadata while preserving the original Blob reference. */
export function cloneStorageObject(object: StorageObject): StorageObject {
  return {
    key: object.key,
    blob: object.blob,
    ...(object.contentType === undefined
      ? {}
      : { contentType: object.contentType }),
    size: object.size,
    ...(object.checksum === undefined ? {} : { checksum: object.checksum }),
    metadata: cloneMetadata(object.metadata),
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
  };
}

/** Returns a content-derived SHA-256 checksum as lowercase hex. */
export async function calculateChecksum(body: StoragePutBody): Promise<string> {
  const crypto = globalThis.crypto;

  if (crypto?.subtle === undefined) {
    throw new StorageError("Web Crypto digest is not available", {
      code: "STORAGE_PUT_FAILED",
      details: { algorithm: "SHA-256" },
    });
  }

  const bytes = await bodyToBytes(body);
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return bytesToHex(new Uint8Array(digest));
}

/** Creates a storage client that does not persist objects. */
export function noopStorage(): StorageClient {
  const storage: StorageClient = {
    async put(
      key: StorageKey,
      body: StoragePutBody,
      options?: StoragePutOptions,
    ): Promise<StorageObjectInfo> {
      const checksum = options?.checksum ?? await calculateChecksum(body);
      return toStorageObjectInfo(
        createStorageObject(key, body, { ...options, checksum }),
      );
    },

    get(
      _key: StorageKey,
      _options?: StorageGetOptions,
    ): Promise<StorageObject | undefined> {
      return Promise.resolve(undefined);
    },

    getInfo(_key: StorageKey): Promise<StorageObjectInfo | undefined> {
      return Promise.resolve(undefined);
    },

    delete(
      _key: StorageKey,
      _options?: StorageDeleteOptions,
    ): Promise<boolean> {
      return Promise.resolve(false);
    },

    exists(_key: StorageKey): Promise<boolean> {
      return Promise.resolve(false);
    },

    list(_options?: StorageListOptions): Promise<StorageListResult> {
      return Promise.resolve({ objects: [], hasMore: false });
    },

    bucket(name: StorageBucketName): StorageBucket {
      return createNoopBucket(normalizeBucketName(name));
    },

    publicUrl(_key: StorageKey): string | undefined {
      return undefined;
    },

    signUrl(key: StorageKey, _options?: SignUrlOptions): Promise<SignedUrl> {
      return Promise.reject(
        buildSigningUnsupportedError(normalizeStorageKey(key)),
      );
    },

    clear(): Promise<void> {
      return Promise.resolve();
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };

  return storage;
}

interface RootwareStorageClientOptions {
  readonly store: StorageStore;
  readonly namespace?: string;
  readonly publicBaseUrl?: string;
  readonly maxSizeBytes?: number;
  readonly allowedContentTypes?: string[];
  readonly logger?: Logger;
}

class RootwareStorageClient implements StorageClient {
  readonly #store: StorageStore;
  readonly #namespace?: string;
  readonly #publicBaseUrl?: string;
  readonly #maxSizeBytes?: number;
  readonly #allowedContentTypes?: string[];
  readonly #logger?: Logger;

  constructor(options: RootwareStorageClientOptions) {
    this.#store = options.store;
    this.#namespace = options.namespace;
    this.#publicBaseUrl = options.publicBaseUrl;
    this.#maxSizeBytes = options.maxSizeBytes;
    this.#allowedContentTypes = options.allowedContentTypes;
    this.#logger = options.logger;
  }

  async put(
    key: StorageKey,
    body: StoragePutBody,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectInfo> {
    const fullKey = this.#key(key);

    try {
      const object = createStorageObject(fullKey, body, {
        ...options,
        checksum: options.checksum ?? await calculateChecksum(body),
        maxSizeBytes: options.maxSizeBytes ?? this.#maxSizeBytes,
      });

      validateAllowedContentType(
        object.contentType,
        this.#allowedContentTypes,
        fullKey,
      );

      await this.#store.put(fullKey, object, options);
      this.#debug(
        { key: fullKey, size: object.size, contentType: object.contentType },
        "storage put",
      );
      return toStorageObjectInfo(object);
    } catch (error) {
      throw this.#operationError("put", "STORAGE_PUT_FAILED", error, {
        key: fullKey,
      });
    }
  }

  async get(
    key: StorageKey,
    options: StorageGetOptions = {},
  ): Promise<StorageObject | undefined> {
    const fullKey = this.#key(key);

    try {
      const object = await this.#store.get(fullKey, options);

      if (object === undefined) {
        this.#debug({ key: fullKey }, "storage miss");
        return undefined;
      }

      this.#debug({ key: fullKey }, "storage hit");
      return object;
    } catch (error) {
      throw this.#operationError("get", "STORAGE_GET_FAILED", error, {
        key: fullKey,
      });
    }
  }

  async getInfo(key: StorageKey): Promise<StorageObjectInfo | undefined> {
    const object = await this.get(key, { includeBody: false });
    return object === undefined ? undefined : toStorageObjectInfo(object);
  }

  async delete(
    key: StorageKey,
    options: StorageDeleteOptions = {},
  ): Promise<boolean> {
    const fullKey = this.#key(key);

    try {
      const deleted = await this.#store.delete(fullKey, options);
      this.#debug({ key: fullKey, deleted }, "storage delete");
      return deleted;
    } catch (error) {
      throw this.#operationError("delete", "STORAGE_DELETE_FAILED", error, {
        key: fullKey,
      });
    }
  }

  async exists(key: StorageKey): Promise<boolean> {
    const fullKey = this.#key(key);

    try {
      return await this.#store.exists(fullKey);
    } catch (error) {
      throw this.#operationError("exists", "STORAGE_GET_FAILED", error, {
        key: fullKey,
      });
    }
  }

  async list(options: StorageListOptions = {}): Promise<StorageListResult> {
    try {
      const listOptions = this.#listOptions(options);
      const result = await this.#store.list(listOptions);
      this.#debug(
        { prefix: listOptions.prefix, limit: listOptions.limit },
        "storage list",
      );
      return result;
    } catch (error) {
      throw this.#operationError("list", "STORAGE_LIST_FAILED", error, {
        prefix: options.prefix,
      });
    }
  }

  bucket(name: StorageBucketName): StorageBucket {
    return createStorageBucket(this, name);
  }

  publicUrl(key: StorageKey): string | undefined {
    if (this.#publicBaseUrl === undefined) {
      return undefined;
    }

    return buildPublicUrl(this.#publicBaseUrl, this.#key(key));
  }

  async signUrl(
    key: StorageKey,
    options: SignUrlOptions = {},
  ): Promise<SignedUrl> {
    const fullKey = this.#key(key);
    const sign = this.#store.signUrl;

    if (sign === undefined) {
      throw buildSigningUnsupportedError(fullKey);
    }

    try {
      const resolved = resolveSignUrlOptions(options);
      const signed = await sign.call(this.#store, fullKey, resolved);
      this.#debug(
        { key: fullKey, method: resolved.method, expiresAt: signed.expiresAt },
        "storage sign url",
      );
      return signed;
    } catch (error) {
      throw this.#operationError("signUrl", "STORAGE_SIGN_FAILED", error, {
        key: fullKey,
      });
    }
  }

  async clear(): Promise<void> {
    try {
      await this.#store.clear?.();
    } catch (error) {
      throw this.#operationError("clear", "STORAGE_LIST_FAILED", error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.#store.close?.();
    } catch (error) {
      throw this.#operationError("close", "STORAGE_UNKNOWN_ERROR", error);
    }
  }

  #key(key: StorageKey): StorageKey {
    return this.#namespace === undefined
      ? normalizeStorageKey(key)
      : joinStorageKey([this.#namespace, key]);
  }

  #listOptions(options: StorageListOptions): StorageListOptions {
    const prefix = normalizeOptionalStorageKey(options.prefix);

    return {
      ...options,
      prefix: this.#namespace === undefined
        ? prefix
        : joinStorageKey([this.#namespace, prefix]),
    };
  }

  #operationError(
    operation: string,
    code: StorageErrorCode,
    error: unknown,
    details: Record<string, unknown> = {},
  ): StorageError {
    if (error instanceof StorageError) {
      this.#error({ operation, ...error.details }, "storage operation failed");
      return error;
    }

    this.#error({ operation, ...details }, "storage operation failed");

    return new StorageError(`Storage operation failed: ${operation}`, {
      code,
      severity: "error",
      details: { operation, ...details },
      cause: error,
    });
  }

  #debug(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.debug(record, message);
    } catch {
      // Logging must never break storage operations.
    }
  }

  #error(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.error(record, message);
    } catch {
      // Logging must never break storage operations.
    }
  }
}

function createNoopBucket(name: StorageBucketName): StorageBucket {
  return {
    name,

    put(
      key: StorageKey,
      body: StoragePutBody,
      options?: StoragePutOptions,
    ): Promise<StorageObjectInfo> {
      return Promise.resolve(
        toStorageObjectInfo(
          createStorageObject(joinStorageKey([name, key]), body, options),
        ),
      );
    },

    get(
      _key: StorageKey,
      _options?: StorageGetOptions,
    ): Promise<StorageObject | undefined> {
      return Promise.resolve(undefined);
    },

    getInfo(_key: StorageKey): Promise<StorageObjectInfo | undefined> {
      return Promise.resolve(undefined);
    },

    delete(
      _key: StorageKey,
      _options?: StorageDeleteOptions,
    ): Promise<boolean> {
      return Promise.resolve(false);
    },

    exists(_key: StorageKey): Promise<boolean> {
      return Promise.resolve(false);
    },

    list(_options?: StorageListOptions): Promise<StorageListResult> {
      return Promise.resolve({ objects: [], hasMore: false });
    },

    publicUrl(_key: StorageKey): string | undefined {
      return undefined;
    },

    signUrl(key: StorageKey, _options?: SignUrlOptions): Promise<SignedUrl> {
      return Promise.reject(buildSigningUnsupportedError(joinStorageKey([
        name,
        key,
      ])));
    },
  };
}

function toStorageObjectInfo(object: StorageObject): StorageObjectInfo {
  return {
    key: object.key,
    ...(object.contentType === undefined
      ? {}
      : { contentType: object.contentType }),
    size: object.size,
    ...(object.checksum === undefined ? {} : { checksum: object.checksum }),
    metadata: cloneMetadata(object.metadata),
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
  };
}

function cloneStorageObjectWithBlob(object: StorageObject): StorageObject {
  const blob = object.blob.slice(
    0,
    object.blob.size,
    object.contentType ?? object.blob.type,
  );

  return {
    ...cloneStorageObject(object),
    blob,
  };
}

function cloneMetadata(metadata: StorageMetadata): StorageMetadata {
  const cloned: StorageMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string") {
      throw new StorageError("Storage metadata values must be strings", {
        code: "STORAGE_PUT_FAILED",
        details: { metadataKey: key },
      });
    }

    cloned[key] = value;
  }

  return cloned;
}

function normalizeOptionalStorageKey(
  key: string | undefined,
): StorageKey | undefined {
  if (key === undefined || key.trim().length === 0) {
    return undefined;
  }

  return normalizeStorageKey(key);
}

function normalizeContentType(
  contentType: string | undefined,
  required = false,
): string | undefined {
  if (contentType === undefined || contentType.trim().length === 0) {
    if (required) {
      throw new StorageError("Storage content type is required", {
        code: "STORAGE_INVALID_CONTENT_TYPE",
        details: { contentType: contentType ?? "" },
      });
    }

    return undefined;
  }

  const normalizedContentType = contentType.trim().toLowerCase();

  if (
    hasControlCharacter(normalizedContentType) ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalizedContentType)
  ) {
    throw new StorageError("Invalid storage content type", {
      code: "STORAGE_INVALID_CONTENT_TYPE",
      details: { contentType: normalizedContentType },
    });
  }

  return normalizedContentType;
}

function normalizeRequiredContentType(contentType: string): string {
  return normalizeContentType(contentType, true) as string;
}

function validateAllowedContentType(
  contentType: string | undefined,
  allowedContentTypes: string[] | undefined,
  key: StorageKey,
): void {
  if (allowedContentTypes === undefined) {
    return;
  }

  if (contentType === undefined || !allowedContentTypes.includes(contentType)) {
    throw new StorageError("Storage content type is not allowed", {
      code: "STORAGE_INVALID_CONTENT_TYPE",
      details: { key, contentType },
    });
  }
}

function normalizeMaxSizeBytes(
  maxSizeBytes: number | undefined,
): number | undefined {
  if (maxSizeBytes === undefined) {
    return undefined;
  }

  if (!Number.isFinite(maxSizeBytes) || maxSizeBytes < 0) {
    throw new StorageError("Storage maxSizeBytes must be a finite number", {
      code: "STORAGE_MAX_SIZE_EXCEEDED",
      details: { maxSizeBytes },
    });
  }

  return maxSizeBytes;
}

function validateMaxSize(
  size: number,
  maxSizeBytes: number | undefined,
  key: StorageKey,
): void {
  if (maxSizeBytes === undefined || size <= maxSizeBytes) {
    return;
  }

  throw new StorageError("Storage object exceeds maximum size", {
    code: "STORAGE_MAX_SIZE_EXCEEDED",
    details: { key, size, maxSizeBytes },
  });
}

function normalizeMaxObjects(
  maxObjects: number | undefined,
): number | undefined {
  if (maxObjects === undefined) {
    return undefined;
  }

  if (!Number.isFinite(maxObjects) || maxObjects <= 0) {
    throw new StorageError(
      "Memory storage maxObjects must be greater than zero",
      {
        code: "STORAGE_UNKNOWN_ERROR",
        details: { option: "maxObjects" },
      },
    );
  }

  return Math.floor(maxObjects);
}

function normalizeListLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new StorageError("Storage list limit must be greater than zero", {
      code: "STORAGE_LIST_FAILED",
      details: { limit },
    });
  }

  return Math.floor(limit);
}

function getCursorStartIndex(
  keys: string[],
  cursor: string | undefined,
): number {
  if (cursor === undefined) {
    return 0;
  }

  const exactIndex = keys.indexOf(cursor);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const nextIndex = keys.findIndex((key) => key > cursor);
  return nextIndex < 0 ? keys.length : nextIndex;
}

function matchesPrefix(key: string, prefix: string | undefined): boolean {
  if (prefix === undefined) {
    return true;
  }

  return key === prefix || key.startsWith(`${prefix}/`);
}

/** Serialized form of a stored object on the local filesystem. */
interface LocalStorageRecord {
  readonly key: StorageKey;
  readonly contentType?: string;
  readonly size: number;
  readonly checksum?: string;
  readonly metadata: StorageMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
}

function recordToStorageObject(record: LocalStorageRecord): StorageObject {
  const bytes = decodeBase64(record.body);

  return {
    key: record.key,
    blob: new Blob([bytes], {
      ...(record.contentType === undefined ? {} : { type: record.contentType }),
    }),
    ...(record.contentType === undefined
      ? {}
      : { contentType: record.contentType }),
    size: record.size,
    ...(record.checksum === undefined ? {} : { checksum: record.checksum }),
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function recordToStorageObjectInfo(
  record: LocalStorageRecord,
): StorageObjectInfo {
  return {
    key: record.key,
    ...(record.contentType === undefined
      ? {}
      : { contentType: record.contentType }),
    size: record.size,
    ...(record.checksum === undefined ? {} : { checksum: record.checksum }),
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function listStorageKeys(
  fs: StorageFileSystem,
  rootDir: string,
): Promise<StorageKey[]> {
  const names = await fs.readDir(rootDir);
  const keys: StorageKey[] = [];

  for (const name of names) {
    if (name.endsWith(".json")) {
      keys.push(decodeURIComponent(name.slice(0, -".json".length)));
    }
  }

  return keys;
}

function joinStoragePath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Deno-backed {@link StorageFileSystem} used by {@link localStorageStore}. */
function denoStorageFileSystem(): StorageFileSystem {
  return {
    async readFile(path: string): Promise<Uint8Array | undefined> {
      try {
        return await Deno.readFile(path);
      } catch (cause) {
        if (cause instanceof Deno.errors.NotFound) {
          return undefined;
        }
        throw new StorageError("Failed to read storage file", {
          code: "STORAGE_GET_FAILED",
          details: { path },
          cause,
        });
      }
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      try {
        await Deno.writeFile(path, data);
      } catch (cause) {
        throw new StorageError("Failed to write storage file", {
          code: "STORAGE_PUT_FAILED",
          details: { path },
          cause,
        });
      }
    },

    async remove(path: string): Promise<void> {
      try {
        await Deno.remove(path);
      } catch (cause) {
        if (cause instanceof Deno.errors.NotFound) {
          return;
        }
        throw new StorageError("Failed to delete storage file", {
          code: "STORAGE_DELETE_FAILED",
          details: { path },
          cause,
        });
      }
    },

    async mkdir(path: string): Promise<void> {
      await Deno.mkdir(path, { recursive: true });
    },

    async readDir(path: string): Promise<readonly string[]> {
      const names: string[] = [];
      try {
        for await (const entry of Deno.readDir(path)) {
          if (entry.isFile) {
            names.push(entry.name);
          }
        }
      } catch (cause) {
        if (cause instanceof Deno.errors.NotFound) {
          return [];
        }
        throw new StorageError("Failed to list storage directory", {
          code: "STORAGE_LIST_FAILED",
          details: { path },
          cause,
        });
      }
      return names;
    },
  };
}

function evictOldestObjects(
  objects: Map<StorageKey, StorageObject>,
  maxObjects: number | undefined,
): void {
  if (maxObjects === undefined) {
    return;
  }

  while (objects.size > maxObjects) {
    const oldestKey = objects.keys().next().value as StorageKey | undefined;

    if (oldestKey === undefined) {
      return;
    }

    objects.delete(oldestKey);
  }
}

function buildPublicUrl(publicBaseUrl: string, key: StorageKey): string {
  const baseUrl = publicBaseUrl.endsWith("/")
    ? publicBaseUrl
    : `${publicBaseUrl}/`;
  const encodedKey = normalizeStorageKey(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return new URL(encodedKey, baseUrl).toString();
}

const DEFAULT_SIGNED_URL_EXPIRY_MS = 15 * 60_000;
const MAX_SIGNED_URL_EXPIRY_MS = 7 * 24 * 60 * 60_000;

/** Resolves and validates signed-URL options, applying defaults and the cap. */
function resolveSignUrlOptions(
  options: SignUrlOptions,
): ResolvedSignUrlOptions {
  const method: SignedUrlMethod = options.method ?? "GET";
  const expiresInMs = options.expiresInMs ?? DEFAULT_SIGNED_URL_EXPIRY_MS;

  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new StorageError("Signed URL expiry must be greater than zero", {
      code: "STORAGE_SIGN_FAILED",
      details: { option: "expiresInMs", expiresInMs },
    });
  }

  if (expiresInMs > MAX_SIGNED_URL_EXPIRY_MS) {
    throw new StorageError("Signed URL expiry exceeds the maximum", {
      code: "STORAGE_SIGN_FAILED",
      details: {
        option: "expiresInMs",
        expiresInMs,
        maxMs: MAX_SIGNED_URL_EXPIRY_MS,
      },
    });
  }

  return {
    method,
    expiresInMs,
    ...(options.contentType === undefined
      ? {}
      : { contentType: options.contentType }),
  };
}

function buildSigningUnsupportedError(key: StorageKey): StorageError {
  return new StorageError("This storage store does not support signed URLs", {
    code: "STORAGE_SIGNING_UNSUPPORTED",
    details: { key, operation: "signUrl" },
  });
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function throwStorageError(
  message: string,
  code: StorageErrorCode,
): never {
  throw new StorageError(message, {
    code,
    details: { reason: message },
  });
}

async function bodyToBytes(body: StoragePutBody): Promise<Uint8Array> {
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }

  if (body instanceof Uint8Array) {
    return new Uint8Array(body);
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body.slice(0));
  }

  throw new StorageError("Unsupported storage body", {
    code: "STORAGE_PUT_FAILED",
    details: { bodyType: typeof body },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// --- S3-compatible adapter (AWS Signature V4) ---

const S3_EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

interface ResolvedS3Config {
  readonly bucket: string;
  readonly region: string;
  readonly service: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly endpointUrl: URL;
  readonly pathStyle: boolean;
}

function resolveS3Config(options: S3StorageStoreOptions): ResolvedS3Config {
  for (
    const [field, value] of [
      ["bucket", options.bucket],
      ["region", options.region],
      ["accessKeyId", options.accessKeyId],
      ["secretAccessKey", options.secretAccessKey],
    ] as const
  ) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new StorageError(`S3 store ${field} is required`, {
        code: "STORAGE_UNKNOWN_ERROR",
        details: { field },
      });
    }
  }

  const endpoint = options.endpoint ??
    `https://s3.${options.region}.amazonaws.com`;

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch (cause) {
    throw new StorageError("S3 store endpoint is invalid", {
      code: "STORAGE_UNKNOWN_ERROR",
      details: { endpoint },
      cause,
    });
  }

  return {
    bucket: options.bucket,
    region: options.region,
    service: options.service ?? "s3",
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    sessionToken: options.sessionToken,
    endpointUrl,
    pathStyle: options.forcePathStyle ?? (options.endpoint !== undefined),
  };
}

function getGlobalStorageFetch(): StorageFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new StorageError("globalThis.fetch is not available", {
      code: "STORAGE_UNKNOWN_ERROR",
    });
  }

  return (input, init) => globalThis.fetch(input, init);
}

interface S3Target {
  readonly url: string;
  readonly host: string;
  readonly canonicalUri: string;
}

function buildS3Target(config: ResolvedS3Config, key?: StorageKey): S3Target {
  const protocol = config.endpointUrl.protocol;
  const endpointHost = config.endpointUrl.host;
  const keyPath = key === undefined
    ? undefined
    : key.split("/").map((segment) => awsUriEncode(segment)).join("/");

  let host: string;
  let path: string;

  if (config.pathStyle) {
    host = endpointHost;
    const bucketSegment = awsUriEncode(config.bucket);
    path = keyPath === undefined
      ? `/${bucketSegment}`
      : `/${bucketSegment}/${keyPath}`;
  } else {
    host = `${config.bucket}.${endpointHost}`;
    path = keyPath === undefined ? "/" : `/${keyPath}`;
  }

  return { url: `${protocol}//${host}${path}`, host, canonicalUri: path };
}

interface SignS3RequestInput {
  readonly method: string;
  readonly key?: StorageKey;
  readonly query?: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly body?: Uint8Array;
}

async function signS3Request(
  config: ResolvedS3Config,
  input: SignS3RequestInput,
): Promise<{ readonly url: string; readonly headers: Record<string, string> }> {
  const now = new Date();
  const amzdate = amzDate(now);
  const datestamp = amzdate.slice(0, 8);
  const target = buildS3Target(config, input.key);
  const payloadHash = input.body === undefined
    ? S3_EMPTY_SHA256
    : await sha256Hex(input.body);

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  headers.host = target.host;
  headers["x-amz-date"] = amzdate;
  headers["x-amz-content-sha256"] = payloadHash;
  if (config.sessionToken !== undefined) {
    headers["x-amz-security-token"] = config.sessionToken;
  }

  const canonicalQuery = buildCanonicalQuery(input.query ?? {});
  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    input.method,
    target.canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${datestamp}/${config.region}/${config.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzdate,
    scope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const key = await s3SigningKey(config, datestamp);
  const signature = bytesToHex(await hmacSha256(key, stringToSign));

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/` +
    `${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: canonicalQuery.length === 0
      ? target.url
      : `${target.url}?${canonicalQuery}`,
    headers,
  };
}

async function presignS3Url(
  config: ResolvedS3Config,
  key: StorageKey,
  options: ResolvedSignUrlOptions,
): Promise<string> {
  const now = new Date();
  const amzdate = amzDate(now);
  const datestamp = amzdate.slice(0, 8);
  const target = buildS3Target(config, key);
  const expiresSeconds = Math.min(
    7 * 24 * 60 * 60,
    Math.max(1, Math.round(options.expiresInMs / 1000)),
  );
  const scope = `${datestamp}/${config.region}/${config.service}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": amzdate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  if (config.sessionToken !== undefined) {
    query["X-Amz-Security-Token"] = config.sessionToken;
  }

  const canonicalQuery = buildCanonicalQuery(query);
  const canonicalRequest = [
    options.method,
    target.canonicalUri,
    canonicalQuery,
    `host:${target.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzdate,
    scope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await s3SigningKey(config, datestamp);
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

  return `${target.url}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function s3SigningKey(
  config: ResolvedS3Config,
  datestamp: string,
): Promise<Uint8Array> {
  const kDate = await hmacSha256(
    new TextEncoder().encode(`AWS4${config.secretAccessKey}`),
    datestamp,
  );
  const kRegion = await hmacSha256(kDate, config.region);
  const kService = await hmacSha256(kRegion, config.service);
  return await hmacSha256(kService, "aws4_request");
}

function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${awsUriEncode(key)}=${awsUriEncode(params[key])}`)
    .join("&");
}

const AWS_UNRESERVED = /[A-Za-z0-9\-_.~]/;

function awsUriEncode(value: string, encodeSlash = true): string {
  let output = "";

  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    if (AWS_UNRESERVED.test(char)) {
      output += char;
    } else if (char === "/" && !encodeSlash) {
      output += "/";
    } else {
      output += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }

  return output;
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** Copies bytes into a standalone ArrayBuffer accepted as a fetch body. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(
  keyBytes: Uint8Array,
  message: string | Uint8Array,
): Promise<Uint8Array> {
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(keyBuffer).set(keyBytes);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const data = typeof message === "string"
    ? new TextEncoder().encode(message)
    : message;
  const dataBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(dataBuffer).set(data);

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  return new Uint8Array(signature);
}

async function assertS3Ok(
  response: Response,
  code: StorageErrorCode,
  key: StorageKey | undefined,
): Promise<void> {
  if (response.ok) {
    return;
  }

  let body = "";
  try {
    body = (await response.text()).slice(0, 500);
  } catch {
    // Ignore body read failures while surfacing the status.
  }

  throw new StorageError(`S3 request failed (${response.status})`, {
    code,
    details: {
      status: response.status,
      ...(key === undefined ? {} : { key }),
      ...(body.length === 0 ? {} : { response: body }),
    },
  });
}

function parseETag(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const cleaned = value.replace(/^"|"$/g, "").replace(/&quot;/g, "");
  return cleaned.length === 0 ? undefined : cleaned;
}

function readAmzMetadata(headers: Headers): StorageMetadata {
  const metadata: StorageMetadata = {};

  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("x-amz-meta-")) {
      metadata[lower.slice("x-amz-meta-".length)] = value;
    }
  });

  return metadata;
}

function parseS3ListResult(xml: string): StorageListResult {
  const objects: StorageObjectInfo[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;

  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const key = xmlTagValue(block, "Key");
    if (key === undefined) {
      continue;
    }

    const size = Number(xmlTagValue(block, "Size") ?? "0");
    const etag = parseETag(xmlTagValue(block, "ETag") ?? null);
    const lastModified = xmlTagValue(block, "LastModified") ??
      new Date().toISOString();

    objects.push({
      key,
      size: Number.isFinite(size) ? size : 0,
      ...(etag === undefined ? {} : { checksum: etag }),
      metadata: {},
      createdAt: lastModified,
      updatedAt: lastModified,
    });
  }

  const truncated = xmlTagValue(xml, "IsTruncated") === "true";
  const cursor = xmlTagValue(xml, "NextContinuationToken");

  return {
    objects,
    ...(truncated && cursor !== undefined ? { cursor } : {}),
    hasMore: truncated,
  };
}

function xmlTagValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match === null ? undefined : decodeXmlEntities(match[1]);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Examples:
//
// const storage = createStorage({
//   store: memoryStorageStore(),
// });
//
// await storage.put("notes/hello.txt", new Blob(["hello"], {
//   type: "text/plain",
// }));
//
// const object = await storage.get("notes/hello.txt");
// const text = object === undefined ? undefined : await object.blob.text();
//
// const avatars = storage.bucket("avatars");
// await avatars.put("u_123.png", new Blob(["content"], {
//   type: "image/png",
// }), {
//   contentType: "image/png",
//   metadata: { userId: "u_123" },
// });
//
// await storage.list({ prefix: "avatars", limit: 50 });
//
// const publicStorage = createStorage({
//   publicBaseUrl: "https://cdn.example.com/assets",
// });
// publicStorage.publicUrl("avatars/u_123.png");
//
// const disabledStorage = noopStorage();
