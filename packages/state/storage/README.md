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

`localStorageStore({ rootDir })` persists objects to disk using Deno file APIs
(needs `--allow-read`/`--allow-write` on `rootDir`). Inject a custom
`StorageFileSystem` to test without touching disk.

## Security

Storage logs include keys, sizes, and content types only. File contents,
metadata values, and blobs are not logged by default.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not implement filesystem, S3, R2, Supabase Storage, signed
URLs, multipart uploads, or streaming adapters yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
