// deno-lint-ignore-file no-import-prefix
import {
  bufferedSink,
  createLogger,
  memorySink,
  unbufferedSink,
} from "@rootware/log";
import pino from "npm:pino@^9";
import * as stdlog from "jsr:@std/log@^0.224";

import { consume } from "../fixtures/blackhole.ts";
import {
  benchmarkLogObject,
  discardLogSink,
  fixedTimestamp,
  writePlatformJsonLog,
} from "../fixtures/log.ts";
import { benchmarkName } from "../fixtures/names.ts";

const LOG_WRITE = "log.write.json";
const LOG_DISABLED = "log.disabled";
const LOG_MEMORY = "log.memory";

// --- rootware loggers ---

const rootwareUnbuffered = createLogger({
  level: "info",
  name: "rootware",
  base: null,
  bindings: { service: "benchmark" },
  timestamp: fixedTimestamp,
}, unbufferedSink(discardLogSink()));

const rootwareBuffered = createLogger({
  level: "info",
  name: "rootware",
  base: null,
  bindings: { service: "benchmark" },
  timestamp: fixedTimestamp,
}, bufferedSink(discardLogSink(), { maxRecords: 1_000 }));

const rootwareMemory = createLogger({
  level: "info",
  base: null,
  timestamp: fixedTimestamp,
}, unbufferedSink(memorySink()));

const platformLogSink = discardLogSink();

// --- npm:pino with a synchronous discard destination (no worker transport) ---

const pinoDestination = {
  write(line: string): boolean {
    consume(line.length);
    return true;
  },
};
const pinoLogger = pino(
  { level: "info", base: null, timestamp: false },
  pinoDestination as unknown as Parameters<typeof pino>[1],
);

// --- @std/log with a discard handler ---

class DiscardHandler extends stdlog.BaseHandler {
  override log(message: string): void {
    consume(message.length);
  }
}

// Use a JSON formatter so @std/log does comparable serialization work (its
// default formatter emits plain text and would not serialize the object).
stdlog.setup({
  handlers: {
    discard: new DiscardHandler("INFO", {
      formatter: (record) =>
        JSON.stringify({
          level: record.levelName,
          msg: record.msg,
          ...(record.args[0] as Record<string, unknown>),
        }),
    }),
  },
  loggers: { bench: { level: "INFO", handlers: ["discard"] } },
});
const stdLogger = stdlog.getLogger("bench");

// --- log.write.json: emit one structured info record to a discard ---

Deno.bench({
  name: benchmarkName(LOG_WRITE, "rootware:unbuffered"),
  group: LOG_WRITE,
  baseline: true,
  fn(): void {
    rootwareUnbuffered.info(benchmarkLogObject, "request completed");
  },
});

Deno.bench({
  name: benchmarkName(LOG_WRITE, "rootware:buffered"),
  group: LOG_WRITE,
  fn(): void {
    rootwareBuffered.info(benchmarkLogObject, "request completed");
  },
});

Deno.bench({
  name: benchmarkName(LOG_WRITE, "platform:json-line"),
  group: LOG_WRITE,
  fn(): void {
    writePlatformJsonLog(platformLogSink);
  },
});

Deno.bench({
  name: benchmarkName(LOG_WRITE, "npm:pino"),
  group: LOG_WRITE,
  fn(): void {
    pinoLogger.info(benchmarkLogObject, "request completed");
  },
});

Deno.bench({
  name: benchmarkName(LOG_WRITE, "std:log"),
  group: LOG_WRITE,
  fn(): void {
    stdLogger.info("request completed", benchmarkLogObject);
  },
});

// --- log.disabled: overhead of a call below the active level (should be ~free) ---

Deno.bench({
  name: benchmarkName(LOG_DISABLED, "rootware"),
  group: LOG_DISABLED,
  baseline: true,
  fn(): void {
    // The logger level is "info"; a debug call must be dropped cheaply.
    rootwareUnbuffered.debug(benchmarkLogObject, "ignored");
  },
});

Deno.bench({
  name: benchmarkName(LOG_DISABLED, "npm:pino"),
  group: LOG_DISABLED,
  fn(): void {
    pinoLogger.debug(benchmarkLogObject, "ignored");
  },
});

Deno.bench({
  name: benchmarkName(LOG_DISABLED, "std:log"),
  group: LOG_DISABLED,
  fn(): void {
    stdLogger.debug("ignored", benchmarkLogObject);
  },
});

// --- log.memory: memorySink throughput (deterministic test sink) ---

Deno.bench({
  name: benchmarkName(LOG_MEMORY, "rootware:memorySink"),
  group: LOG_MEMORY,
  baseline: true,
  fn(): void {
    rootwareMemory.info(benchmarkLogObject, "stored");
  },
});
