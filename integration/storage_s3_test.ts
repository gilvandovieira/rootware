/**
 * Integration of `@rootware/storage`'s `s3StorageStore` against a live
 * S3-compatible server (RustFS from `compose.yaml`). Exercises the real AWS
 * SigV4-signed round-trip: put → get → list → presigned GET (fetched back) →
 * delete. Skipped when the server is unreachable.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` after
 * `docker compose up -d --wait`.
 */

import { assert, assertEquals } from "@std/assert";
import { createStorage, s3StorageStore } from "@rootware/storage";
import { canReach, s3Target } from "./config.ts";

Deno.test("integration: s3StorageStore against RustFS", async (t) => {
  const target = s3Target();
  const up = await canReach(target.endpoint);

  await t.step({
    name: `RustFS — ${target.endpoint} (${target.bucket})`,
    ignore: !up,
    fn: async () => {
      const storage = createStorage({
        store: s3StorageStore({
          bucket: target.bucket,
          region: target.region,
          accessKeyId: target.accessKeyId,
          secretAccessKey: target.secretAccessKey,
          endpoint: target.endpoint,
          forcePathStyle: true,
        }),
      });

      const suffix = `${Date.now().toString(36)}${
        Math.random().toString(36).slice(2, 8)
      }`;
      const key = `it/${suffix}/hello.txt`;
      const body = `hello rootware ${suffix}`;

      try {
        const info = await storage.put(key, body, {
          contentType: "text/plain",
          metadata: { owner: "integration" },
        });
        assertEquals(info.key, key);
        assertEquals(info.size, new TextEncoder().encode(body).byteLength);

        assertEquals(await storage.exists(key), true);

        const object = await storage.get(key);
        assert(object !== undefined);
        assertEquals(await object.blob.text(), body);
        assertEquals(object.contentType, "text/plain");
        assertEquals(object.metadata.owner, "integration");

        const listed = await storage.list({ prefix: `it/${suffix}/` });
        assertEquals(listed.objects.map((entry) => entry.key), [key]);

        // The presigned GET URL works without our credentials on the request.
        const signed = await storage.signUrl(key, { expiresInMs: 60_000 });
        const response = await fetch(signed.url);
        assertEquals(response.status, 200);
        assertEquals(await response.text(), body);

        assertEquals(await storage.delete(key), true);
        assertEquals(await storage.exists(key), false);
      } finally {
        await storage.delete(key, { silent: true }).catch(() => {});
      }
    },
  });

  if (!up) {
    console.warn(
      `Skipped: RustFS not reachable at ${target.endpoint}. Start it with ` +
        "`docker compose up -d --wait rustfs rustfs-init`.",
    );
  }
});
