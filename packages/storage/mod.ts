/**
 * Public entrypoint for @rootware/storage.
 *
 * TODO: Implement bucket/object adapters, streaming, signed URLs, and metadata.
 */

export type BucketName = string;
export type ObjectKey = string;
export type StorageBody = ReadableStream<Uint8Array> | Uint8Array | string;

export interface StorageObjectMetadata {
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly etag?: string;
  readonly custom?: Record<string, string>;
}

export interface StorageObject {
  readonly bucket: BucketName;
  readonly key: ObjectKey;
  readonly body?: StorageBody;
  readonly metadata?: StorageObjectMetadata;
}

export interface StoragePutOptions {
  readonly metadata?: StorageObjectMetadata;
  readonly overwrite?: boolean;
}

export interface StorageGetOptions {
  readonly range?: {
    readonly start: number;
    readonly end?: number;
  };
}

export interface StorageListOptions {
  readonly prefix?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface StorageListResult {
  readonly objects: readonly StorageObject[];
  readonly cursor?: string;
}

export interface StorageBucket {
  get(
    key: ObjectKey,
    options?: StorageGetOptions,
  ): Promise<StorageObject | null>;
  put(
    key: ObjectKey,
    body: StorageBody,
    options?: StoragePutOptions,
  ): Promise<StorageObject>;
  delete(key: ObjectKey): Promise<boolean>;
  list(options?: StorageListOptions): Promise<StorageListResult>;
}

export interface StorageClientOptions {
  readonly defaultBucket?: BucketName;
}

export class RootwareStorage {
  constructor(readonly options: StorageClientOptions = {}) {}

  bucket(_name: BucketName): StorageBucket {
    throw new Error("Not implemented");
  }

  get(
    _bucket: BucketName,
    _key: ObjectKey,
    _options?: StorageGetOptions,
  ): Promise<StorageObject | null> {
    throw new Error("Not implemented");
  }

  put(
    _bucket: BucketName,
    _key: ObjectKey,
    _body: StorageBody,
    _options?: StoragePutOptions,
  ): Promise<StorageObject> {
    throw new Error("Not implemented");
  }

  delete(_bucket: BucketName, _key: ObjectKey): Promise<boolean> {
    throw new Error("Not implemented");
  }

  list(
    _bucket: BucketName,
    _options?: StorageListOptions,
  ): Promise<StorageListResult> {
    throw new Error("Not implemented");
  }
}

export function createStorage(
  _options?: StorageClientOptions,
): RootwareStorage {
  throw new Error("Not implemented");
}
