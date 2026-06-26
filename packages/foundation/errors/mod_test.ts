import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  clearErrorRedactors,
  createErrorFactory,
  getErrorCause,
  getErrorChain,
  getErrorMessage,
  isRootwareError,
  namespacedErrorCode,
  redactErrorKeys,
  registerErrorRedactor,
  RootwareError,
  serializeError,
  toRootwareError,
} from "./mod.ts";

const DEFAULT_MESSAGE = "An unexpected error occurred";

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

Deno.test("@rootware/errors - serialization never leaks stack and recurses exposed cause", () => {
  const exposed = new RootwareError("outer", {
    code: "ROOTWARE_VALIDATION_ERROR",
    expose: true,
    cause: new RootwareError("inner", {
      code: "ROOTWARE_INVALID_ARGUMENT",
      expose: true,
    }),
  });

  const json = exposed.toJSON();
  assert(!Object.hasOwn(json, "stack"));
  assertEquals(json.cause?.message, "inner");
  assert(json.cause !== undefined && !Object.hasOwn(json.cause, "stack"));

  // A non-exposed error hides its message and drops the cause entirely.
  const hidden = new RootwareError("secret", {
    expose: false,
    cause: new Error("hidden cause"),
  });
  const hiddenJson = hidden.toJSON();
  assertEquals(hiddenJson.message, "An unexpected error occurred");
  assertEquals(hiddenJson.cause, undefined);
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

Deno.test("@rootware/errors - converts native errors, strings, objects, null, undefined", () => {
  const native = toRootwareError(new TypeError("nope"));
  assert(isRootwareError(native));
  assertEquals(native.name, "TypeError");
  assertEquals(native.message, "nope");

  assertEquals(toRootwareError("oops").message, "oops");
  assertEquals(toRootwareError("   ").message, DEFAULT_MESSAGE);

  const fromObject = toRootwareError({ unknown: true });
  assertEquals(fromObject.message, DEFAULT_MESSAGE);
  assertEquals(fromObject.cause, { unknown: true });

  const fromNull = toRootwareError(null);
  assertEquals(fromNull.message, DEFAULT_MESSAGE);
  assertEquals(fromNull.cause, null);

  const fromUndefined = toRootwareError(undefined);
  assertEquals(fromUndefined.message, DEFAULT_MESSAGE);
  assertEquals(fromUndefined.cause, undefined);

  // Message/cause extraction helpers degrade gracefully too.
  assertEquals(getErrorMessage(null), DEFAULT_MESSAGE);
  assertEquals(getErrorMessage(undefined), DEFAULT_MESSAGE);
  assertEquals(getErrorMessage(42), DEFAULT_MESSAGE);
  assertEquals(getErrorCause(null), undefined);
  assertEquals(getErrorCause(new Error("x", { cause: "root" })), "root");

  // Serializing any of these is safe and never throws.
  for (const value of [null, undefined, 42, { secret: 1 }, "boom"]) {
    const json = serializeError(value);
    assert(!Object.hasOwn(json, "stack"));
  }
});

Deno.test("@rootware/errors - redaction hooks strip secrets from serialized details", () => {
  const unregister = registerErrorRedactor(
    redactErrorKeys(["password", "API_KEY"]),
  );
  try {
    const error = new RootwareError("bad login", {
      expose: true,
      details: { user: "alice", password: "hunter2", api_key: "sk_live" },
    });
    const json = error.toJSON();
    assertEquals(json.details, {
      user: "alice",
      password: "[redacted]",
      api_key: "[redacted]",
    });
    // The live error is untouched — redaction only affects serialized output.
    assertEquals(error.details?.password, "hunter2");
  } finally {
    unregister();
  }

  // After unregistering, details pass through unredacted.
  const json = new RootwareError("x", {
    expose: true,
    details: { password: "p" },
  }).toJSON();
  assertEquals(json.details, { password: "p" });
});

Deno.test("@rootware/errors - per-call redactor and buggy redactor safety", () => {
  const error = new RootwareError("denied", {
    expose: true,
    details: { token: "secret", user: "bob" },
  });
  const json = serializeError(error, { redact: redactErrorKeys(["token"]) });
  assertEquals(json.details, { token: "[redacted]", user: "bob" });

  // A redactor that throws drops details instead of leaking them.
  const unregister = registerErrorRedactor(() => {
    throw new Error("redactor blew up");
  });
  try {
    const unsafe = serializeError(error);
    assertEquals(unsafe.details, undefined);
  } finally {
    unregister();
  }
  clearErrorRedactors();
});

Deno.test("@rootware/errors - getErrorChain walks causes safely", () => {
  const root = new RootwareError("root");
  const mid = new RootwareError("mid", { cause: root });
  const top = new RootwareError("top", { cause: mid });

  assertEquals(getErrorChain(top).map((e) => e.message), [
    "top",
    "mid",
    "root",
  ]);
  assertEquals(getErrorChain(null), []);
  assertEquals(getErrorChain(top, { maxDepth: 2 }).length, 2);

  // A self-referential cause still terminates.
  const cyclic = new RootwareError("cyclic");
  cyclic.cause = cyclic;
  assertEquals(getErrorChain(cyclic).length, 1);

  // Mixed native/string causes are converted per link.
  const mixed = new RootwareError("outer", {
    cause: new Error("native", { cause: "string root" }),
  });
  assertEquals(getErrorChain(mixed).map((e) => e.message), [
    "outer",
    "native",
    "string root",
  ]);
});

Deno.test("@rootware/errors - serialization honors maxDepth on deep cause chains", () => {
  const deep = new RootwareError("l0", {
    expose: true,
    cause: new RootwareError("l1", {
      expose: true,
      cause: new RootwareError("l2", { expose: true }),
    }),
  });

  const json = serializeError(deep, { maxDepth: 1 });
  assertEquals(json.message, "l0");
  assertEquals(json.cause?.message, "l1");
  // Beyond maxDepth the chain is truncated with a generic marker.
  assertEquals(json.cause?.cause?.message, DEFAULT_MESSAGE);
  assertEquals(json.cause?.cause?.code, "ROOTWARE_INTERNAL_ERROR");
});

Deno.test("@rootware/errors - namespacedErrorCode builds and validates convention codes", () => {
  assertEquals(namespacedErrorCode("cache", "get_failed"), "CACHE_GET_FAILED");
  assertEquals(namespacedErrorCode("HTTP", "timeout"), "HTTP_TIMEOUT");
  assertEquals(
    namespacedErrorCode("env", "mode violation"),
    "ENV_MODE_VIOLATION",
  );
  assertEquals(
    namespacedErrorCode("orm", "invalid-query"),
    "ORM_INVALID_QUERY",
  );
  // Numeric segments are allowed (e.g. HTTP_404-style names).
  assertEquals(namespacedErrorCode("http", "404"), "HTTP_404");
  assertThrows(() => namespacedErrorCode("", "x"));
  assertThrows(() => namespacedErrorCode("cache", "bad.name"));
});
