/**
 * Temporary-file integration test for `@rootware/log`'s `fileSink`. It opens a
 * real file via Deno APIs, writes structured records through a logger, and reads
 * the bytes back to confirm append/truncate semantics.
 *
 * Excluded from `deno task test` (which is network-, fs-, and DB-free); run with
 * `deno task test:integration`, which grants `--allow-read`/`--allow-write`.
 */

import { assert, assertEquals } from "@std/assert";
import { createLogger, fileSink, unbufferedSink } from "@rootware/log";

Deno.test("integration: fileSink writes newline-delimited JSON to disk", async () => {
  const path = await Deno.makeTempFile({
    prefix: "rootware_log_",
    suffix: ".jsonl",
  });

  try {
    const sink = fileSink(path);
    const logger = createLogger(
      { level: "info", timestamp: () => "2026-01-01T00:00:00.000Z" },
      sink,
    );

    logger.info({ requestId: "req_1" }, "first");
    logger.warn({ requestId: "req_2" }, "second");
    await logger.close();

    const lines = (await Deno.readTextFile(path)).trimEnd().split("\n");
    assertEquals(lines.length, 2);

    const first = JSON.parse(lines[0]);
    assertEquals(first.msg, "first");
    assertEquals(first.requestId, "req_1");
    assertEquals(first.levelName, "info");

    const second = JSON.parse(lines[1]);
    assertEquals(second.msg, "second");
    assertEquals(second.levelName, "warn");
  } finally {
    await Deno.remove(path).catch(() => {});
  }
});

Deno.test("integration: fileSink append vs truncate", async () => {
  const path = await Deno.makeTempFile({
    prefix: "rootware_log_",
    suffix: ".jsonl",
  });

  try {
    const write = async (
      options: { append?: boolean },
      msg: string,
    ): Promise<void> => {
      const logger = createLogger(
        { level: "info", timestamp: () => "2026-01-01T00:00:00.000Z" },
        unbufferedSink(fileSink(path, options)),
      );
      logger.info(msg);
      await logger.close();
    };

    await write({ append: false }, "one");
    await write({ append: true }, "two");
    const appended = (await Deno.readTextFile(path)).trimEnd().split("\n");
    assertEquals(appended.map((line) => JSON.parse(line).msg), ["one", "two"]);

    // Truncating reopens the file empty before writing.
    await write({ append: false }, "fresh");
    const truncated = (await Deno.readTextFile(path)).trimEnd().split("\n");
    assertEquals(truncated.length, 1);
    assert(truncated[0].includes("fresh"));
  } finally {
    await Deno.remove(path).catch(() => {});
  }
});
