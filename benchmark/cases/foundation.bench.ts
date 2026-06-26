import {
  RootwareError,
  serializeError,
  toRootwareError,
} from "@rootware/errors";
import { validateEnv } from "@rootware/env";
import { consume } from "../fixtures/blackhole.ts";
import {
  benchmarkEnvSchema,
  benchmarkEnvSource,
  parseBenchmarkEnvDirect,
} from "../fixtures/env.ts";
import { benchmarkName } from "../fixtures/names.ts";

// Log benchmarks live in `log.bench.ts` (the `0.8` benchmarks milestone).

const ERRORS_CONSTRUCT = "errors.construct";
const ERRORS_CONVERT = "errors.convert";
const ERRORS_SERIALIZE = "errors.serialize";
const ENV_VALIDATE = "env.validate";

const rootwareError = new RootwareError("Benchmark failure", {
  code: "ROOTWARE_INTERNAL_ERROR",
  status: 500,
  expose: true,
  details: {
    requestId: "req_benchmark_0001",
    route: "/benchmark/:id",
  },
  cause: new Error("database unavailable"),
});

const nativeError = new Error("Benchmark failure", {
  cause: new Error("database unavailable"),
});

Deno.bench({
  name: benchmarkName(ERRORS_CONSTRUCT, "rootware"),
  group: ERRORS_CONSTRUCT,
  baseline: true,
  fn(): void {
    consume(
      new RootwareError("Benchmark failure", {
        code: "ROOTWARE_INTERNAL_ERROR",
        details: {
          requestId: "req_benchmark_0001",
        },
      }),
    );
  },
});

Deno.bench({
  name: benchmarkName(ERRORS_CONSTRUCT, "platform:error"),
  group: ERRORS_CONSTRUCT,
  fn(): void {
    consume(new Error("Benchmark failure"));
  },
});

Deno.bench({
  name: benchmarkName(ERRORS_CONVERT, "rootware"),
  group: ERRORS_CONVERT,
  baseline: true,
  fn(): void {
    consume(toRootwareError(nativeError, {
      code: "ROOTWARE_EXTERNAL_SERVICE_ERROR",
    }));
  },
});

Deno.bench({
  name: benchmarkName(ERRORS_SERIALIZE, "rootware"),
  group: ERRORS_SERIALIZE,
  baseline: true,
  fn(): void {
    consume(serializeError(rootwareError));
  },
});

Deno.bench({
  name: benchmarkName(ERRORS_SERIALIZE, "platform:error-object"),
  group: ERRORS_SERIALIZE,
  fn(): void {
    consume(serializeNativeErrorDirect(nativeError));
  },
});

Deno.bench({
  name: benchmarkName(ENV_VALIDATE, "rootware"),
  group: ENV_VALIDATE,
  baseline: true,
  fn(): void {
    consume(validateEnv(benchmarkEnvSchema, benchmarkEnvSource, {
      mode: "production",
    }));
  },
});

Deno.bench({
  name: benchmarkName(ENV_VALIDATE, "platform:direct-parser"),
  group: ENV_VALIDATE,
  fn(): void {
    consume(parseBenchmarkEnvDirect());
  },
});

function serializeNativeErrorDirect(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    cause: error.cause instanceof Error
      ? {
        name: error.cause.name,
        message: error.cause.message,
      }
      : undefined,
  };
}
