import { env, type EnvSource } from "@rootware/env";

export const benchmarkEnvSchema = {
  PORT: env.integer().default(8000),
  LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
  FEATURE_CACHE: env.boolean().default(true),
  WORKER_COUNT: env.integer().default(4),
  PUBLIC_ORIGIN: env.url().required(),
  DATABASE_URL: env.url().required().secret(),
  SESSION_SECRET: env.secret().required(),
} as const;

export const benchmarkEnvSource = {
  PORT: "8080",
  LOG_LEVEL: "info",
  FEATURE_CACHE: "true",
  WORKER_COUNT: "8",
  PUBLIC_ORIGIN: "https://example.test",
  DATABASE_URL: "postgres://rootware:rootware@localhost:5432/rootware",
  SESSION_SECRET: "benchmark-secret-value",
} satisfies EnvSource;

export interface ParsedBenchmarkEnv {
  readonly PORT: number;
  readonly LOG_LEVEL: "debug" | "info" | "warn" | "error";
  readonly FEATURE_CACHE: boolean;
  readonly WORKER_COUNT: number;
  readonly PUBLIC_ORIGIN: string;
  readonly DATABASE_URL: string;
  readonly SESSION_SECRET: string;
}

export function parseBenchmarkEnvDirect(
  source: EnvSource = benchmarkEnvSource,
): ParsedBenchmarkEnv {
  const logLevel = required(source, "LOG_LEVEL");

  if (!isLogLevel(logLevel)) {
    throw new Error("Invalid LOG_LEVEL");
  }

  return Object.freeze({
    PORT: parseIntegerDirect(required(source, "PORT")),
    LOG_LEVEL: logLevel,
    FEATURE_CACHE: parseBooleanDirect(required(source, "FEATURE_CACHE")),
    WORKER_COUNT: parseIntegerDirect(required(source, "WORKER_COUNT")),
    PUBLIC_ORIGIN: new URL(required(source, "PUBLIC_ORIGIN")).toString(),
    DATABASE_URL: new URL(required(source, "DATABASE_URL")).toString(),
    SESSION_SECRET: required(source, "SESSION_SECRET"),
  });
}

function required(source: EnvSource, key: string): string {
  const value = source[key];

  if (value === undefined) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

function isLogLevel(
  value: string,
): value is ParsedBenchmarkEnv["LOG_LEVEL"] {
  return value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error";
}

function parseBooleanDirect(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "on":
      return true;
    case "false":
    case "0":
    case "no":
    case "off":
      return false;
    default:
      throw new Error("Invalid boolean");
  }
}

function parseIntegerDirect(value: string): number {
  const normalizedValue = value.trim();

  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    throw new Error("Invalid integer");
  }

  return Number(normalizedValue);
}
