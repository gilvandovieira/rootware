# @rootware/storage

Async-first object storage abstraction for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createStorage, memoryStorageStore } from "jsr:@rootware/storage";
```

## Example

```ts
const storage = createStorage({
  store: memoryStorageStore(),
  publicBaseUrl: "https://cdn.example.com/assets",
});

await storage.put(
  "avatars/u_123.png",
  new Blob(["content"], {
    type: "image/png",
  }),
);

const avatar = await storage.get("avatars/u_123.png");
const url = storage.publicUrl("avatars/u_123.png");
```

## API

- `createStorage`
- `memoryStorageStore`
- `localStorageStore`
- `s3StorageStore` (+ `S3StorageStoreOptions`, `StorageFetch`)
- `createStorageBucket`
- `noopStorage`
- `createStorageObject`
- `normalizeStorageKey`
- `normalizeBucketName`
- `signUrl` + `SignUrlOptions` / `SignedUrl` / `ResolvedSignUrlOptions`
- `createUploadValidator` (+ `matchesContentType`, `extensionOf`) — `0.5`

`localStorageStore({ rootDir })` persists objects to disk using Deno file APIs
(needs `--allow-read`/`--allow-write` on `rootDir`). Inject a custom
`StorageFileSystem` to test without touching disk.

## Upload validation (`0.5`)

`createUploadValidator` validates a prospective upload before `put` — useful at
an upload endpoint — throwing a typed `StorageError` on the first violation:

```ts
import { createUploadValidator, getBodySize } from "jsr:@rootware/storage";

const validate = createUploadValidator({
  maxSizeBytes: 5_000_000,
  allowedContentTypes: ["image/*", "application/pdf"], // exact or type/* wildcard
  allowedExtensions: ["png", "jpg", "pdf"],
  requiredMetadata: ["owner"],
  maxMetadataValueLength: 256,
}).validate;

validate({
  key: "avatars/u_1.png",
  size: getBodySize(body),
  contentType: "image/png",
  metadata: { owner: "u_1" },
});
// throws STORAGE_MAX_SIZE_EXCEEDED / _INVALID_CONTENT_TYPE / _INVALID_EXTENSION /
// _INVALID_METADATA otherwise.
```

## S3-compatible storage (`0.4`)

`s3StorageStore` is an S3-compatible `StorageStore` (AWS S3, Cloudflare R2,
RustFS). It signs requests with **AWS Signature V4** via Web Crypto and issues
SigV4 **presigned URLs** — no provider SDK, the only external surface is `fetch`
(injectable via `StorageFetch`):

```ts
import { createStorage, s3StorageStore } from "jsr:@rootware/storage";

const storage = createStorage({
  store: s3StorageStore({
    bucket: "my-bucket",
    region: "auto", // R2/RustFS accept "auto"
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    endpoint: "https://<account>.r2.cloudflarestorage.com", // omit for AWS
  }),
});

await storage.put("photos/cat.png", bytes, { contentType: "image/png" });
const url = await storage.signUrl("photos/cat.png", { expiresInMs: 60_000 });
```

`forcePathStyle` defaults to path-style when a custom `endpoint` is set (R2 and
RustFS) and virtual-hosted for the AWS default; `sessionToken` is supported for
temporary credentials. Object user metadata maps to `x-amz-meta-*` and the
provider `ETag` surfaces as the object `checksum`.

## Signed URLs (`0.3`)

`signUrl` issues a time-limited URL for a download (`GET`) or direct upload
(`PUT`), letting clients transfer bytes without proxying through your server:

```ts
const download = await storage.signUrl("avatars/u_123.png"); // GET, 15 min
const upload = await storage.bucket("uploads").signUrl("u_123.png", {
  method: "PUT",
  expiresInMs: 60_000,
  contentType: "image/png",
});
// { url, method, expiresAt, key }
```

**Expiry rules.** `expiresInMs` defaults to 15 minutes and is capped at 7 days;
the returned `expiresAt` is an absolute ISO timestamp, so validity is decided by
the **signing service's** clock, not the caller's. A `0`/negative/over-cap
expiry is rejected with `STORAGE_SIGN_FAILED`. Signing does not check object
existence — a `PUT` URL is issued for a key that does not exist yet, and a `GET`
URL may outlive a deletion.

**Unsupported stores.** Signing needs a backend that can sign (S3, R2, GCS). A
store advertises support by implementing the optional `StorageStore.signUrl`;
the in-memory and local-filesystem stores (and `noopStorage`) cannot sign, so
`signUrl` rejects with `STORAGE_SIGNING_UNSUPPORTED`.

## Security

Storage logs include keys, sizes, and content types only. File contents,
metadata values, and blobs are not logged by default.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package ships memory, local-filesystem, S3-compatible (`s3StorageStore`,
which can sign), and noop stores. Supabase adapters, multipart uploads, and
streaming adapters are future work.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
