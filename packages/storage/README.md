# @rootware/storage

Async-first object storage abstraction for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

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

## API Summary

- `createStorage`
- `memoryStorageStore`
- `createStorageBucket`
- `noopStorage`
- `createStorageObject`
- `normalizeStorageKey`
- `normalizeBucketName`

## Security

Storage logs include keys, sizes, and content types only. File contents,
metadata values, and blobs are not logged by default.

## Limitations

This package does not implement filesystem, S3, R2, Supabase Storage, signed
URLs, multipart uploads, or streaming adapters yet.

[Back to Rootware](../../README.md)
