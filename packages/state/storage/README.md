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
- `createStorageBucket`
- `noopStorage`
- `createStorageObject`
- `normalizeStorageKey`
- `normalizeBucketName`
- `signUrl` + `SignUrlOptions` / `SignedUrl` / `ResolvedSignUrlOptions`

`localStorageStore({ rootDir })` persists objects to disk using Deno file APIs
(needs `--allow-read`/`--allow-write` on `rootDir`). Inject a custom
`StorageFileSystem` to test without touching disk.

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

This package ships memory, local-filesystem, and noop stores. S3/R2/Supabase
adapters (and the signing backends behind `signUrl`), multipart uploads, and
streaming adapters are future work — the `signUrl` **contract** ships now, but
no bundled store can sign.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
