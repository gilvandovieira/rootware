# @rootware/http

Production-safe fetch wrapper for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createHttpClient } from "jsr:@rootware/http";
```

## Example

```ts
const api = createHttpClient({
  baseUrl: "https://api.example.com",
  timeoutMs: 5000,
  retry: { attempts: 3, backoffMs: 250 },
});

const user = await api.getJson<{ id: string }>("/users/u_123");
```

## API

- `createHttpClient`
- `request`
- `buildUrl`
- `mergeHeaders`
- `parseJsonResponse`
- `createMockFetch`
- `createJsonResponse`

## Security

Request bodies and sensitive headers are not logged. URLs are redacted before
entering logs and error details.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not implement interceptors, OAuth, cookie jars, circuit
breakers, or OpenTelemetry yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
