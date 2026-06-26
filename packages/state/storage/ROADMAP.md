# @rootware/storage Product Plan

## Status

`@rootware/storage` exists as part of the Rootware `v0.1` foundation.

This package should become the file/object storage abstraction for Rootware
apps.

> **Current `v0.1` surface (reconciled with source).** Ships `createStorage`,
> `memoryStorageStore`, `createStorageBucket`, the
> `StorageClient`/`StorageStore`/ `StorageBucket` contracts, safe key/bucket
> normalization, `list`, `calculateChecksum`, body-size helpers, and upload
> constraints (`maxSizeBytes`, required content type) — so parts of the v0.5
> "upload validation" milestone already exist. Two things differ from the
> contract below and are corrected there: the client is `StorageClient` (not
> `Storage`), the put body is
> `StoragePutBody = Blob | Uint8Array | ArrayBuffer | string` (not `BodyInit`,
> and not a stream), and `list` returns a `StorageListResult` (not an
> `AsyncIterable`).
>
> The checksum field is now content-derived for `StorageClient.put`: the client
> computes a SHA-256 lowercase hex checksum with Web Crypto unless a caller
> supplies `StoragePutOptions.checksum`. The synchronous `createStorageObject`
> helper no longer fabricates a size-derived checksum when none is supplied.
>
> The local filesystem adapter now ships as `localStorageStore` with an
> injectable `StorageFileSystem`, so tests can stay off-disk and
> permission-free. The genuine gaps are **signed URLs** (v0.3, not built) and
> provider adapters such as S3/R2. The "streaming-friendly API" goal is also
> unrealized — the body type is buffered, so either add a stream body type or
> drop the streaming claim.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/storage` is a JSR-native, Deno-first storage package for local files,
memory tests, and object storage adapters.

It exists because apps need a consistent way to store uploads, generated files,
reports, avatars, and media without baking S3/R2/local filesystem assumptions
into domain code.

The package should provide:

- Bucket abstraction.
- Object keys and metadata.
- Put/get/delete/list operations.
- Memory adapter for tests.
- Local filesystem adapter.
- Future S3/R2 adapter.
- Signed URL contract.
- Upload validation hooks.
- Streaming-friendly API.

One-line strategy:

> `@rootware/storage` lets Deno apps write storage code once and swap local,
> memory, S3, or R2 adapters later.

## Canonical package

```ts
jsr:@rootware/storage
```

Expected imports:

```ts
import { createStorage } from "@rootware/storage";
```

Expected usage:

```ts
const storage = createStorage(); // memory store by default

await storage.put("avatars/u_123.png", file, {
  contentType: "image/png",
});
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`

### Runtime imports

- `@rootware/errors` — `StorageError` (value import).
- `@rootware/log` — **type-only** (optional injected `Logger`).

### Example / dev-only imports

- `@rootware/env` — examples only (bucket config); not imported by the package.

### Disallowed dependencies

- S3/R2 provider SDKs in the core.
- `@rootware/testing` in runtime code.
- `@rootware/jobs` — jobs may process storage objects, not the reverse.
- `@rootware/orm` — metadata persistence belongs to apps or higher-level
  integrations.

## Responsibilities

This package owns:

- Storage contract.
- Object metadata shape.
- Memory adapter.
- Local adapter.
- Signed URL abstraction.
- Upload constraints contract.
- Safe key normalization.

This package does not own:

- Media processing.
- Virus scanning.
- CDN configuration.
- Database metadata tables.
- Provider-specific SDKs in core.
- Multipart upload in v0.2.

## Architecture

```txt
storage API -> key validation -> adapter -> object stream/bytes -> metadata
```

### 1. Public API

Expose `StorageClient`, `StorageStore`, `StorageObject`, `StoragePutOptions`,
`createStorage`, `memoryStorageStore`, and `createStorageBucket`.

### 2. Key boundary

Prevent unsafe path traversal in local adapter.

### 3. Adapter boundary

Provider behavior stays behind adapters.

### 4. Testing boundary

Memory adapter should be deterministic and easy to inspect.

## Public contracts

### Storage client

```ts
export type StoragePutBody = Blob | Uint8Array | ArrayBuffer | string;

export interface StorageClient {
  put(
    key: string,
    body: StoragePutBody,
    options?: StoragePutOptions,
  ): Promise<StorageObjectInfo>;
  get(
    key: string,
    options?: StorageGetOptions,
  ): Promise<StorageObject | undefined>;
  getInfo(key: string): Promise<StorageObjectInfo | undefined>;
  delete(key: string, options?: StorageDeleteOptions): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  list(options?: StorageListOptions): Promise<StorageListResult>;
}
```

`StoragePutBody` is buffered (no `ReadableStream`), so `etag`/checksum can be
computed eagerly in `put`. If streaming uploads are added later, the etag-on-put
guarantee has to be revisited for the streaming path.

### Storage object

```ts
export interface StorageObject {
  readonly key: string;
  readonly blob: Blob;
  readonly size: number;
  readonly contentType?: string;
  readonly checksum?: string;
  readonly metadata: StorageMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

## Security and safety model

Rules:

- Local adapter must prevent `../` path traversal.
- Object keys must be normalized.
- Content type validation must be explicit.
- Signed URLs must have expiry.
- Memory adapter is not durable.
- Local adapter should not be recommended for multi-instance production.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy for memory/provider adapters.
- JSR consumers.

Compatible by design:

- Bun.
- Node ESM.
- Workers where streaming APIs are available.

## Non-goals before v1

- Image processing.
- Video processing.
- Multipart uploads.
- Virus scanning.
- CDN cache invalidation.
- Full S3 implementation in core.
- Database metadata management.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm current stubs and package boundaries.

### Chunk 2 — Define storage contract

Stabilize `StorageClient`, `StorageStore`, and object metadata.

### Chunk 3 — Add README skeleton

Show memory and local storage examples.

## v0.2.0 — Memory/local storage spine

> The memory store, local filesystem adapter, bucket contract, key safety,
> object metadata, listing, and `StorageError` now ship. Read the chunks below
> as verify, add tests, and document the existing implementation — not build
> from scratch, and do not replace the shipped code.

### Chunk 4 — Verify memory storage (ships in v0.1)

Verify the shipped memory storage behavior.

### Chunk 5 — Verify local storage (ships in v0.2)

Verify `localStorageStore`, its explicit Deno permissions, and the injectable
filesystem boundary.

### Chunk 6 — Verify key normalization (ships in v0.1)

Reject unsafe keys.

### Chunk 7 — Verify object metadata (ships in v0.1)

Size, content type, and SHA-256 checksum metadata.

### Chunk 8 — Verify list (ships in v0.1)

Support prefix listing.

### Chunk 9 — Verify StorageError (ships in v0.1)

Use `RootwareError`.

### Chunk 10 — Add tests

Test put/get/delete/list/key safety.

## v0.3.0 — Signed URL contract — **done (`0.3.0`)**

- **Signed read/write URL interface** — `SignUrlOptions` (`method` GET/PUT,
  `expiresInMs`, `contentType`), the resolved `ResolvedSignUrlOptions` handed to
  adapters, and the `SignedUrl` result (`url`, `method`, `expiresAt`, `key`).
  `signUrl` is on `StorageClient`/`StorageBucket`; the optional
  `StorageStore.signUrl` is the adapter seam.
- **Unsupported behavior** — stores that cannot sign omit
  `StorageStore.signUrl`; the client/bucket (and `noopStorage`) then reject with
  `STORAGE_SIGNING_UNSUPPORTED`. The memory and local-filesystem stores are
  unsupported.
- **Expiry rules** — 15-minute default, 7-day cap, absolute `expiresAt` from the
  signer's clock, `STORAGE_SIGN_FAILED` for invalid/over-cap expiry; documented
  in the README (signing does not check existence). Covered by tests with a fake
  signing store.

The concrete S3/R2/GCS signing adapters stay deferred (they require live
services); the contract and unsupported behavior they plug into ship now.

## v0.4.0 — S3/R2 adapter — **done (`0.4.0`)**

- **`s3StorageStore(options)`** — an S3-compatible `StorageStore` for AWS S3,
  Cloudflare R2, and RustFS. Implements `put`/`get`/`delete`/`exists`/`list`/
  `signUrl`, mapping user metadata to `x-amz-meta-*` headers and carrying object
  `ETag` through as the `checksum`.
- **No provider SDK in core** — requests are signed with **AWS Signature V4**
  using Web Crypto (HMAC/SHA-256), and `signUrl` produces SigV4 **presigned
  URLs**. The only external surface is fetch, injected via `StorageFetch`
  (defaults to global `fetch`), so the adapter is unit-testable without a live
  bucket and adds zero dependencies.
- **Path/virtual-hosted styles** — `forcePathStyle` defaults to path-style when
  a custom `endpoint` is set (R2/RustFS) and virtual-hosted for the AWS default.
  Supports `sessionToken` for temporary credentials.
- **Real ETag/checksum behavior** — `get`/`list` surface the provider ETag; the
  in-core stores' content-hash checksum is unchanged.
- **RustFS integration test** — the opt-in integration suite exercises the real
  signed round-trip (put → get → list → signed-GET → delete) against RustFS (an
  actively maintained S3-compatible server).

## v0.5.0 — Upload validation — **done (`0.5.0`)**

- **`createUploadValidator(options)`** → a reusable `UploadValidator` for
  app-level upload endpoints; `validate(candidate)` throws a typed
  `StorageError` on the first violation (before `put`):
  - **Max size** — `maxSizeBytes` → `STORAGE_MAX_SIZE_EXCEEDED`.
  - **Allowed content types** — exact or `type/*` wildcard; a missing type when
    a list is set is rejected → `STORAGE_INVALID_CONTENT_TYPE` (415).
  - **Extension checks** — `allowedExtensions` (case-insensitive, dot optional)
    → `STORAGE_INVALID_EXTENSION` (415).
  - **Metadata validation** — `requiredMetadata`, `maxMetadataKeys`,
    `maxMetadataValueLength` → `STORAGE_INVALID_METADATA` (422).
- **Pure helpers** — `matchesContentType(type, patterns)` and `extensionOf(key)`
  are exported and unit-tested; the validator composes with `getBodySize` to
  check a body before persisting.
- Range reads and multipart upload remain future work.

## v1.0.0 — Stable storage contract

- Freeze key semantics.
- Freeze object shape.
- Freeze adapter contract.

## Cross-package integrations

### @rootware/env

Examples use env for bucket config.

### @rootware/log

Storage operations may emit diagnostics.

### @rootware/jobs

Jobs can process uploaded objects.

### Doomscrollr

Use storage for memes, avatars, thumbnails, and generated media.

## First 10 implementation chunks

The memory store, local adapter, buckets, key safety, metadata, and upload
validation already ship; start with verification and the remaining signed-URL /
provider-adapter gaps.

1. Audit the published surface (`createStorage`, `memoryStorageStore`,
   `createStorageBucket`, `StorageError`).
2. Verify the `StorageClient` / `StorageStore` / `StorageBucket` contracts.
3. Verify the memory adapter and safe key normalization (no `../` traversal).
4. Verify object metadata (size, content type, SHA-256 checksum) and `list`
   prefixing.
5. Verify the local filesystem adapter and injected filesystem boundary.
6. Verify upload constraints (`maxSizeBytes`, required content type).
7. Verify `StorageError`.
8. Define the signed-URL contract (v0.3) and unsupported behavior for adapters
   that cannot sign.
9. Decide on a stream body type, or drop the "streaming-friendly" claim.
10. Expand tests and examples.

## Product rule

`@rootware/storage` should make local development and production object storage
feel like the same application contract.
