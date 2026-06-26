import type { LogRecord, LogSink } from "@rootware/log";
import { consume } from "./blackhole.ts";

const textEncoder = new TextEncoder();

export const fixedTimestamp = (): string => "2026-01-01T00:00:00.000Z";

export const benchmarkLogObject = Object.freeze({
  requestId: "req_benchmark_0001",
  route: "/benchmark/:id",
  method: "GET",
  status: 200,
  elapsedMs: 12.34,
  userId: "user_123",
  nested: {
    cache: "hit",
    region: "local",
  },
});

export function discardLogSink(): LogSink {
  return {
    write(line: Uint8Array): void {
      consume(line.byteLength);
    },
  };
}

export function writePlatformJsonLog(sink: LogSink): void {
  const record: LogRecord = {
    service: "benchmark",
    requestId: benchmarkLogObject.requestId,
    route: benchmarkLogObject.route,
    method: benchmarkLogObject.method,
    status: benchmarkLogObject.status,
    elapsedMs: benchmarkLogObject.elapsedMs,
    userId: benchmarkLogObject.userId,
    nested: benchmarkLogObject.nested,
    name: "rootware",
    level: 30,
    levelName: "info",
    time: fixedTimestamp(),
    msg: "request completed",
  };

  const result = sink.write(textEncoder.encode(`${JSON.stringify(record)}\n`));

  if (result instanceof Promise) {
    throw new Error("The platform log benchmark expects a synchronous sink");
  }
}
