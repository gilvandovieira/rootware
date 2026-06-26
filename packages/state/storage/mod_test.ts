import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  bodyToBlob,
  calculateChecksum,
  cloneStorageObject,
  createStorage,
  createStorageObject,
  getBlobSize,
  getBodySize,
  joinStorageKey,
  localStorageStore,
  memoryStorageStore,
  noopStorage,
  normalizeBucketName,
  normalizeStorageKey,
  type ResolvedSignUrlOptions,
  s3StorageStore,
  type SignedUrl,
  StorageError,
  type StorageFetch,
  type StorageFileSystem,
  type StorageKey,
  type StorageStore,
} from "./mod.ts";

/** In-memory {@link StorageFileSystem} so the local adapter is testable off-disk. */
function memoryFileSystem(): StorageFileSystem {
  const files = new Map<string, Uint8Array>();

  return {
    readFile(path: string): Promise<Uint8Array | undefined> {
      return Promise.resolve(files.get(path));
    },
    writeFile(path: string, data: Uint8Array): Promise<void> {
      files.set(path, data);
      return Promise.resolve();
    },
    remove(path: string): Promise<void> {
      files.delete(path);
      return Promise.resolve();
    },
    mkdir(): Promise<void> {
      return Promise.resolve();
    },
    readDir(path: string): Promise<readonly string[]> {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = [...files.keys()]
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length))
        .filter((name) => !name.includes("/"));
      return Promise.resolve(names);
    },
  };
}

Deno.test("@rootware/storage - localStorageStore round-trips objects via an injected filesystem", async () => {
  const storage = createStorage({
    store: localStorageStore({ rootDir: "/data", fs: memoryFileSystem() }),
  });

  const info = await storage.put("docs/readme.txt", "hello world", {
    contentType: "text/plain",
    metadata: { author: "lucas" },
  });
  assertEquals(info.size, 11);
  assertExists(info.checksum);

  const object = await storage.get("docs/readme.txt");
  assertExists(object);
  assertEquals(await object.blob.text(), "hello world");
  assertEquals(object.contentType, "text/plain");
  assertEquals(object.metadata.author, "lucas");

  assertEquals(await storage.exists("docs/readme.txt"), true);

  await storage.put("docs/notes.txt", "second");
  await storage.put("images/logo.bin", "third");

  const listed = await storage.list({ prefix: "docs" });
  assertEquals(listed.objects.map((entry) => entry.key), [
    "docs/notes.txt",
    "docs/readme.txt",
  ]);

  assertEquals(await storage.delete("docs/readme.txt"), true);
  assertEquals(await storage.delete("docs/readme.txt"), false);
  assertEquals(await storage.exists("docs/readme.txt"), false);
});

Deno.test("@rootware/storage - memory store and client put/get/delete", async () => {
  const storage = createStorage({ store: memoryStorageStore() });
  const info = await storage.put("docs/readme.txt", "hello", {
    contentType: "text/plain",
    metadata: { owner: "docs" },
  });

  assertEquals(info.key, "docs/readme.txt");
  assertEquals(info.size, 5);
  assertEquals(info.contentType, "text/plain");
  assertEquals(
    info.checksum,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  assertEquals(await storage.exists("docs/readme.txt"), true);

  const object = await storage.get("docs/readme.txt");
  assertExists(object);
  assertEquals(await object.blob.text(), "hello");

  const objectInfo = await storage.getInfo("docs/readme.txt");
  assertEquals(objectInfo?.metadata.owner, "docs");

  assertEquals(await storage.delete("docs/readme.txt"), true);
  assertEquals(await storage.get("docs/readme.txt"), undefined);
});

Deno.test("@rootware/storage - body helpers support Blob string bytes and ArrayBuffer", async () => {
  const blob = new Blob(["abc"], { type: "text/plain" });
  const bytes = new Uint8Array([1, 2, 3]);
  const buffer = bytes.buffer.slice(0);

  assertEquals(getBlobSize(blob), 3);
  assertEquals(getBodySize("abc"), 3);
  assertEquals(getBodySize(bytes), 3);
  assertEquals(getBodySize(buffer), 3);
  assertEquals(await bodyToBlob(bytes).arrayBuffer(), buffer);
});

Deno.test("@rootware/storage - calculateChecksum uses SHA-256 content", async () => {
  assertEquals(
    await calculateChecksum(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assertEquals(
    await calculateChecksum("hello"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  assertEquals(
    await calculateChecksum("same"),
    await calculateChecksum("same"),
  );
  assertEquals(
    (await calculateChecksum("same")) !== await calculateChecksum("different"),
    true,
  );
});

Deno.test("@rootware/storage - list supports prefix limit cursor and buckets", async () => {
  const storage = createStorage({ store: memoryStorageStore() });
  await storage.put("avatars/a.png", new Uint8Array([1]));
  await storage.put("avatars/b.png", new Uint8Array([2]));
  await storage.put("docs/a.txt", "a");

  const firstPage = await storage.list({ prefix: "avatars", limit: 1 });
  assertEquals(firstPage.objects.map((object) => object.key), [
    "avatars/a.png",
  ]);
  assertEquals(firstPage.hasMore, true);
  assertEquals(firstPage.cursor, "avatars/b.png");

  const secondPage = await storage.list({
    prefix: "avatars",
    cursor: firstPage.cursor,
  });
  assertEquals(secondPage.objects.map((object) => object.key), [
    "avatars/b.png",
  ]);

  const avatars = storage.bucket("Avatars");
  await avatars.put("c.png", new Blob(["c"]));
  assertEquals(await avatars.exists("c.png"), true);
  assertEquals(
    (await avatars.list()).objects.some((object) =>
      object.key === "avatars/c.png"
    ),
    true,
  );
});

Deno.test("@rootware/storage - public URLs and validations", async () => {
  const storage = createStorage({
    publicBaseUrl: "https://cdn.example.com/assets",
    allowedContentTypes: ["image/png"],
    maxSizeBytes: 4,
  });

  await storage.put(
    "avatars/u 123.png",
    new Blob(["1234"], {
      type: "image/png",
    }),
  );

  assertEquals(
    storage.publicUrl("avatars/u 123.png"),
    "https://cdn.example.com/assets/avatars/u%20123.png",
  );

  await assertRejects(
    () => storage.put("bad.txt", "text", { contentType: "text/plain" }),
    StorageError,
  );
  await assertRejects(
    () => storage.put("large.png", "12345", { contentType: "image/png" }),
    StorageError,
  );
});

Deno.test("@rootware/storage - key helpers and object cloning", () => {
  assertEquals(normalizeStorageKey("./a//b.txt"), "a/b.txt");
  assertEquals(normalizeBucketName("Avatars_1"), "avatars_1");
  assertEquals(
    joinStorageKey(["avatars", "", "u_123.png"]),
    "avatars/u_123.png",
  );
  assertThrows(() => normalizeStorageKey("../secret"), StorageError);
  assertThrows(() => normalizeBucketName("bad/name"), StorageError);

  const object = createStorageObject("a.txt", "hello", {
    metadata: { kind: "text" },
  });
  const cloned = cloneStorageObject(object);

  assertEquals(cloned.key, object.key);
  assertEquals(cloned.metadata, object.metadata);
  assert(cloned.metadata !== object.metadata);
});

Deno.test("@rootware/storage - memory options and noop storage", async () => {
  const store = memoryStorageStore({ maxObjects: 1, cloneObjects: true });
  const storage = createStorage({ store });

  await storage.put("a.txt", "a");
  await storage.put("b.txt", "b");

  assertEquals(await storage.get("a.txt"), undefined);
  assertExists(await storage.get("b.txt"));

  const noop = noopStorage();
  const info = await noop.put("x.txt", "x");

  assertEquals(info.key, "x.txt");
  assertEquals(await noop.get("x.txt"), undefined);
  assertEquals(await noop.exists("x.txt"), false);
  assertEquals((await noop.list()).objects, []);
});

Deno.test("@rootware/storage - signUrl is unsupported on stores that cannot sign", async () => {
  const storage = createStorage({ store: memoryStorageStore() });
  const error = await assertRejects(
    () => storage.signUrl("a.txt"),
    StorageError,
  );
  assertEquals(error.code, "STORAGE_SIGNING_UNSUPPORTED");
  assertEquals(error.details?.key, "a.txt");

  // The noop client and its buckets reject the same way.
  const noopError = await assertRejects(
    () => noopStorage().signUrl("a.txt"),
    StorageError,
  );
  assertEquals(noopError.code, "STORAGE_SIGNING_UNSUPPORTED");
  const bucketError = await assertRejects(
    () => noopStorage().bucket("avatars").signUrl("a.txt"),
    StorageError,
  );
  assertEquals(bucketError.code, "STORAGE_SIGNING_UNSUPPORTED");
});

Deno.test("@rootware/storage - signUrl delegates to a signing store with resolved options", async () => {
  const seen: { key?: StorageKey; options?: ResolvedSignUrlOptions } = {};

  const signingStore: StorageStore = {
    ...memoryStorageStore(),
    signUrl(
      key: StorageKey,
      options: ResolvedSignUrlOptions,
    ): Promise<SignedUrl> {
      seen.key = key;
      seen.options = options;
      return Promise.resolve({
        key,
        method: options.method,
        url: `https://signed.example.com/${key}?exp=${options.expiresInMs}`,
        expiresAt: new Date(Date.now() + options.expiresInMs).toISOString(),
      });
    },
  };

  const storage = createStorage({ store: signingStore, namespace: "app" });

  // Default options: GET and 15-minute expiry.
  const get = await storage.signUrl("photos/p1.jpg");
  assertEquals(seen.key, "app/photos/p1.jpg");
  assertEquals(seen.options?.method, "GET");
  assertEquals(seen.options?.expiresInMs, 15 * 60_000);
  assert(get.url.includes("app/photos/p1.jpg"));

  // Explicit PUT upload options pass through, including under a bucket prefix.
  const put = await storage.bucket("uploads").signUrl("p2.jpg", {
    method: "PUT",
    expiresInMs: 60_000,
    contentType: "image/jpeg",
  });
  assertEquals(seen.key, "app/uploads/p2.jpg");
  assertEquals(seen.options?.method, "PUT");
  assertEquals(seen.options?.contentType, "image/jpeg");
  assertEquals(put.method, "PUT");

  // Invalid expiry is rejected before reaching the store.
  await assertRejects(
    () => storage.signUrl("photos/p1.jpg", { expiresInMs: 0 }),
    StorageError,
  );
});

/** Mock S3 transport that records requests and returns canned responses. */
interface CapturedS3Request {
  method: string;
  url: string;
  headers: Headers;
  body?: Uint8Array;
}

function mockS3(
  handler: (request: CapturedS3Request) => Response,
): { fetch: StorageFetch; calls: CapturedS3Request[] } {
  const calls: CapturedS3Request[] = [];
  const fetch: StorageFetch = async (input, init) => {
    let body: Uint8Array | undefined;
    if (init?.body !== undefined && init.body !== null) {
      body = new Uint8Array(
        await new Response(init.body as BodyInit).arrayBuffer(),
      );
    }
    const request: CapturedS3Request = {
      method: init?.method ?? "GET",
      url: String(input),
      headers: new Headers(init?.headers),
      body,
    };
    calls.push(request);
    return handler(request);
  };
  return { fetch, calls };
}

function makeS3(handler: (request: CapturedS3Request) => Response) {
  const mock = mockS3(handler);
  const storage = createStorage({
    store: s3StorageStore({
      bucket: "my-bucket",
      region: "us-east-1",
      accessKeyId: "AKID",
      secretAccessKey: "SECRET",
      endpoint: "http://localhost:9000", // path-style (RustFS/R2 shape)
      fetch: mock.fetch,
    }),
  });
  return { storage, calls: mock.calls };
}

Deno.test("@rootware/storage - s3StorageStore signs and shapes a PUT", async () => {
  const { storage, calls } = makeS3(() =>
    new Response(null, { status: 200, headers: { etag: '"abc"' } })
  );

  const info = await storage.put(
    "photos/cat.png",
    new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    { metadata: { owner: "u1" } },
  );
  assertEquals(info.key, "photos/cat.png");

  const req = calls[0];
  assertEquals(req.method, "PUT");
  assertEquals(req.url, "http://localhost:9000/my-bucket/photos/cat.png");
  const auth = req.headers.get("authorization") ?? "";
  assert(auth.startsWith("AWS4-HMAC-SHA256 Credential=AKID/"));
  assert(auth.includes("SignedHeaders="));
  assert(auth.includes("Signature="));
  assertExists(req.headers.get("x-amz-date"));
  assertExists(req.headers.get("x-amz-content-sha256"));
  assertEquals(req.headers.get("content-type"), "image/png");
  assertEquals(req.headers.get("x-amz-meta-owner"), "u1");
  assertEquals([...(req.body ?? [])], [1, 2, 3]);
});

Deno.test("@rootware/storage - s3StorageStore GET maps response to a StorageObject", async () => {
  const { storage } = makeS3((req) =>
    req.method === "GET"
      ? new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: {
          "content-type": "text/plain",
          etag: '"xyz"',
          "x-amz-meta-owner": "u2",
        },
      })
      : new Response(null, { status: 404 })
  );

  const object = await storage.get("notes/a.txt");
  assertExists(object);
  assertEquals(object!.contentType, "text/plain");
  assertEquals(object!.size, 2);
  assertEquals(object!.checksum, "xyz");
  assertEquals(object!.metadata.owner, "u2");
  assertEquals([...new Uint8Array(await object!.blob.arrayBuffer())], [9, 9]);
});

Deno.test("@rootware/storage - s3StorageStore GET 404 returns undefined", async () => {
  const { storage } = makeS3(() => new Response(null, { status: 404 }));
  assertEquals(await storage.get("missing"), undefined);
});

Deno.test("@rootware/storage - s3StorageStore delete checks existence then deletes", async () => {
  const { storage, calls } = makeS3((req) => {
    if (req.method === "HEAD") return new Response(null, { status: 200 });
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });

  assertEquals(await storage.delete("a/b.txt"), true);
  assertEquals(calls.map((c) => c.method), ["HEAD", "DELETE"]);
});

Deno.test("@rootware/storage - s3StorageStore list parses the XML result", async () => {
  const xml =
    `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>` +
    `<Contents><Key>a/1.txt</Key><Size>10</Size><ETag>&quot;e1&quot;</ETag>` +
    `<LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>` +
    `<Contents><Key>a/2.txt</Key><Size>20</Size><ETag>&quot;e2&quot;</ETag>` +
    `<LastModified>2026-01-02T00:00:00.000Z</LastModified></Contents>` +
    `<NextContinuationToken>tok123</NextContinuationToken></ListBucketResult>`;
  const { storage, calls } = makeS3(() => new Response(xml, { status: 200 }));

  const result = await storage.list({ prefix: "a/", limit: 2 });
  assertEquals(result.objects.map((o) => o.key), ["a/1.txt", "a/2.txt"]);
  assertEquals(result.objects[0].size, 10);
  assertEquals(result.objects[0].checksum, "e1");
  assertEquals(result.hasMore, true);
  assertEquals(result.cursor, "tok123");

  const url = calls[0].url;
  assert(url.includes("list-type=2"));
  assert(url.includes("prefix=a%2F"));
  assert(url.includes("max-keys=2"));
});

Deno.test("@rootware/storage - s3StorageStore signUrl builds a presigned URL", async () => {
  const { storage } = makeS3(() => new Response(null, { status: 200 }));

  const signed = await storage.signUrl("downloads/file.zip", {
    method: "GET",
    expiresInMs: 60_000,
  });

  assertEquals(signed.method, "GET");
  assertEquals(signed.key, "downloads/file.zip");

  const url = new URL(signed.url);
  assertEquals(url.host, "localhost:9000");
  assertEquals(url.pathname, "/my-bucket/downloads/file.zip");
  assertEquals(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assertEquals(url.searchParams.get("X-Amz-Expires"), "60");
  assertExists(url.searchParams.get("X-Amz-Signature"));
  assert(url.searchParams.get("X-Amz-Credential")?.startsWith("AKID/"));
});

Deno.test("@rootware/storage - s3StorageStore validates required options", () => {
  assertThrows(
    () =>
      s3StorageStore({
        bucket: "",
        region: "us-east-1",
        accessKeyId: "AKID",
        secretAccessKey: "SECRET",
      }),
    StorageError,
  );
});
