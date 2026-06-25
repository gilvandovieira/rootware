import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  createErrorFactory,
  isRootwareError,
  RootwareError,
  serializeError,
  toRootwareError,
} from "./mod.ts";

Deno.test("@rootware/errors - RootwareError basic fields and JSON", () => {
  const cause = new Error("cause");
  const error = new RootwareError("boom", {
    code: "ROOTWARE_INTERNAL_ERROR",
    status: 500,
    expose: true,
    severity: "fatal",
    details: { requestId: "req_123" },
    cause,
  });

  assertEquals(error.name, "RootwareError");
  assertEquals(error.code, "ROOTWARE_INTERNAL_ERROR");
  assertEquals(error.status, 500);
  assertEquals(error.expose, true);
  assertEquals(error.severity, "fatal");
  assertEquals(error.details, { requestId: "req_123" });
  assertEquals(error.cause, cause);
  assertExists(error.stack);

  const json = error.toJSON();
  assertEquals(json.message, "boom");
  assertEquals(json.details, { requestId: "req_123" });
});

Deno.test("@rootware/errors - helpers identify and convert errors", () => {
  const native = new Error("native");
  const converted = toRootwareError(native, {
    code: "ROOTWARE_UNKNOWN_ERROR",
  });

  assert(isRootwareError(converted));
  assertEquals(converted.message, "native");
  assertEquals(toRootwareError(converted), converted);
  assertEquals(toRootwareError("from string").message, "from string");
  assertEquals(
    toRootwareError({ unknown: true }).message,
    "An unexpected error occurred",
  );
});

Deno.test("@rootware/errors - serializeError is safe by default", () => {
  const hidden = new RootwareError("secret", {
    code: "ROOTWARE_CONFIGURATION_ERROR",
    expose: false,
    details: { secret: "value" },
  });

  const serialized = serializeError(hidden);
  assertEquals(serialized.message, "An unexpected error occurred");
  assertEquals(serialized.details, undefined);
  assertEquals(serialized.code, "ROOTWARE_CONFIGURATION_ERROR");
});

Deno.test("@rootware/errors - factory and immutable modifiers", () => {
  const configurationError = createErrorFactory({
    code: "ROOTWARE_CONFIGURATION_ERROR",
    status: 500,
    expose: false,
    severity: "fatal",
  });

  const error = configurationError("Missing DATABASE_URL");
  const withDetails = error.withDetails({ variable: "DATABASE_URL" });
  const withCause = error.withCause(new Error("cause"));
  const withMessage = error.withMessage("Changed");

  assertEquals(error.is("ROOTWARE_CONFIGURATION_ERROR"), true);
  assertEquals(withDetails.details, { variable: "DATABASE_URL" });
  assertExists(withCause.cause);
  assertEquals(withMessage.message, "Changed");
  assertEquals(error.message, "Missing DATABASE_URL");
});

Deno.test("@rootware/errors - assertThrows receives RootwareError", () => {
  const thrown = assertThrows(() => {
    throw RootwareError.from("invalid", {
      code: "ROOTWARE_INVALID_ARGUMENT",
    });
  });

  assert(thrown instanceof RootwareError);
  assertEquals(thrown.code, "ROOTWARE_INVALID_ARGUMENT");
});
