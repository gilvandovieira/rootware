import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

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
  | "STORAGE_UNKNOWN_ERROR"
  | (string & Record<never, never>);

export type StorageKey = string;

export type StorageBucketName = string;

export type StorageMetadata = Record<string, string>;

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

export interface StoragePutOptions {
  readonly contentType?: string;
  readonly metadata?: StorageMetadata;
  readonly maxSizeBytes?: number;
  readonly checksum?: string;
  readonly publicUrl?: string;
}

export interface StorageGetOptions {
  readonly includeBody?: boolean;
}

export interface StorageDeleteOptions {
  readonly silent?: boolean;
}

export interface StorageListOptions {
  readonly prefix?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface StorageListResult {
  readonly objects: StorageObjectInfo[];
  readonly cursor?: string;
  readonly hasMore: boolean;
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
