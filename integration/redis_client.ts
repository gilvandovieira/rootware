/**
 * A tiny, dependency-free RESP (REDIS Serialization Protocol) client over a raw
 * TCP socket — enough for the integration suite to exercise a real Redis server
 * of any 6/7/8 version with only `--allow-net`. It implements the
 * `RedisLikeClient` contract from `@rootware/cache` plus a few admin commands.
 */

import type { RedisLikeClient } from "@rootware/cache";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CR = 13;
const LF = 10;

/** A parsed RESP reply. */
export type RedisReply = string | number | null | RedisReply[];

export interface RedisConnectOptions {
  readonly hostname: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
}

/** Parses a `redis://[:password@]host:port[/db]` URL. */
export function parseRedisUrl(url: string): RedisConnectOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.replace(/^\//, "");

  return {
    hostname: parsed.hostname,
    port: parsed.port.length > 0 ? Number(parsed.port) : 6379,
    ...(parsed.password.length > 0 ? { password: parsed.password } : {}),
    ...(db.length > 0 ? { db: Number(db) } : {}),
  };
}

/** Opens a Redis connection, authenticating and selecting a DB when requested. */
export async function connectRedis(
  options: RedisConnectOptions,
): Promise<RedisConnection> {
  const conn = await Deno.connect({
    hostname: options.hostname,
    port: options.port,
    transport: "tcp",
  });
  const client = new RedisConnection(conn);

  if (options.password !== undefined) {
    await client.send(["AUTH", options.password]);
  }
  if (options.db !== undefined) {
    await client.send(["SELECT", String(options.db)]);
  }

  return client;
}

/** A live Redis connection implementing {@link RedisLikeClient}. */
export class RedisConnection implements RedisLikeClient {
  readonly #conn: Deno.Conn;
  #buffer = new Uint8Array(0);
  #offset = 0;

  constructor(conn: Deno.Conn) {
    this.#conn = conn;
  }

  // --- RedisLikeClient ----------------------------------------------------

  async get(key: string): Promise<string | null> {
    const reply = await this.send(["GET", key]);
    return reply === null ? null : String(reply);
  }

  set(
    key: string,
    value: string,
    options: { readonly pxMs?: number } = {},
  ): Promise<unknown> {
    const args = ["SET", key, value];
    if (options.pxMs !== undefined) {
      args.push("PX", String(Math.max(1, Math.round(options.pxMs))));
    }
    return this.send(args);
  }

  del(...keys: string[]): Promise<unknown> {
    if (keys.length === 0) {
      return Promise.resolve(0);
    }
    return this.send(["DEL", ...keys]);
  }

  async scan(
    cursor: string,
    options: { readonly match?: string; readonly count?: number } = {},
  ): Promise<readonly [string, string[]]> {
    const args = ["SCAN", cursor];
    if (options.match !== undefined) {
      args.push("MATCH", options.match);
    }
    if (options.count !== undefined) {
      args.push("COUNT", String(options.count));
    }

    const reply = await this.send(args);
    if (!Array.isArray(reply) || reply.length !== 2) {
      throw new Error("Unexpected SCAN reply");
    }
    const [next, keys] = reply;
    return [String(next), (keys as RedisReply[]).map((key) => String(key))];
  }

  // --- Admin helpers ------------------------------------------------------

  async ping(): Promise<string> {
    return String(await this.send(["PING"]));
  }

  flushdb(): Promise<unknown> {
    return this.send(["FLUSHDB"]);
  }

  close(): void {
    this.#conn.close();
  }

  // --- RESP transport -----------------------------------------------------

  async send(args: string[]): Promise<RedisReply> {
    const chunks: Uint8Array[] = [encoder.encode(`*${args.length}\r\n`)];
    for (const arg of args) {
      const body = encoder.encode(arg);
      chunks.push(encoder.encode(`$${body.length}\r\n`));
      chunks.push(body);
      chunks.push(encoder.encode("\r\n"));
    }

    await this.#writeAll(concat(chunks));
    return await this.#readReply();
  }

  async #writeAll(data: Uint8Array): Promise<void> {
    let written = 0;
    while (written < data.length) {
      written += await this.#conn.write(data.subarray(written));
    }
  }

  async #readReply(): Promise<RedisReply> {
    const line = await this.#readLine();
    const prefix = line[0];
    const rest = line.slice(1);

    switch (prefix) {
      case "+":
        return rest;
      case "-":
        throw new Error(`Redis error: ${rest}`);
      case ":":
        return Number(rest);
      case "$": {
        const length = Number(rest);
        return length === -1 ? null : await this.#readBulk(length);
      }
      case "*": {
        const count = Number(rest);
        if (count === -1) {
          return null;
        }
        const items: RedisReply[] = [];
        for (let index = 0; index < count; index += 1) {
          items.push(await this.#readReply());
        }
        return items;
      }
      default:
        throw new Error(`Unexpected RESP reply: ${line}`);
    }
  }

  async #readLine(): Promise<string> {
    while (true) {
      const index = indexOfCrlf(this.#buffer, this.#offset);
      if (index !== -1) {
        const line = decoder.decode(this.#buffer.subarray(this.#offset, index));
        this.#offset = index + 2;
        return line;
      }
      await this.#fill();
    }
  }

  async #readBulk(length: number): Promise<string> {
    while (this.#buffer.length - this.#offset < length + 2) {
      await this.#fill();
    }
    const value = decoder.decode(
      this.#buffer.subarray(this.#offset, this.#offset + length),
    );
    this.#offset += length + 2;
    return value;
  }

  async #fill(): Promise<void> {
    const incoming = new Uint8Array(4096);
    const read = await this.#conn.read(incoming);
    if (read === null) {
      throw new Error("Redis connection closed");
    }

    const remaining = this.#buffer.subarray(this.#offset);
    const merged = new Uint8Array(remaining.length + read);
    merged.set(remaining);
    merged.set(incoming.subarray(0, read), remaining.length);
    this.#buffer = merged;
    this.#offset = 0;
  }
}

function indexOfCrlf(buffer: Uint8Array, from: number): number {
  for (let index = from; index + 1 < buffer.length; index += 1) {
    if (buffer[index] === CR && buffer[index + 1] === LF) {
      return index;
    }
  }
  return -1;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
