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
  StorageError,
  type StorageFileSystem,
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
