# @rootware/<package> Product Plan

## Status

`@rootware/<package>` is currently `<status>`.

This package should be treated as a real Rootware product, not as a proof of
concept. The current phase is to define the smallest credible product spine,
stabilize the public surface, and move through small, testable releases.

Last reviewed: `<YYYY-MM-DD>`

## Product thesis

`@rootware/<package>` is a JSR-native, Deno-first `<category>` package for
`<target users/use case>`.

It exists because `<current ecosystem pain point>`.

The package should provide:

- `<capability 1>`
- `<capability 2>`
- `<capability 3>`
- Deno-first runtime behavior.
- JSR-native imports.
- No required npm runtime dependency in the core.
- Explicit public contracts.
- Tests, examples, and benchmarks where relevant.

One-line strategy:

> `<package>` helps Deno developers `<job to be done>` without depending on
> Node/npm compatibility as the default path.

## Canonical package

```ts
jsr:@rootware/<package>
```

Expected imports:

```ts
import { <mainApi> } from "@rootware/<package>";
```

Optional subpaths:

```ts
import { <adapterApi> } from "@rootware/<package>/<subpath>";
import { <testingApi> } from "@rootware/<package>/testing";
```

Naming rules:

- The package is always referred to as `@rootware/<package>`.
- Avoid alternate names in docs, issue titles, examples, and cross-package
  references.
- Internal variable names may use domain language when it reads better.

## Rootware workspace fit

This package sits after:

- `@rootware/errors`, if it needs typed public errors.
- `@rootware/env`, if examples need configuration validation.
- `@rootware/log`, if it emits structured diagnostics.

This package must not depend on higher-level packages unless explicitly
justified.

Allowed dependencies:

- `<dependency>` — `<reason>`

Disallowed dependencies:

- `<dependency>` — `<reason>`

## Responsibilities

This package owns:

- `<owned responsibility>`
- `<owned responsibility>`
- `<owned responsibility>`

This package does not own:

- `<non-goal or responsibility delegated elsewhere>`
- `<non-goal or responsibility delegated elsewhere>`
- `<non-goal or responsibility delegated elsewhere>`

## Relationship with other Rootware packages

### @rootware/errors

Use for typed public errors:

- `<Package>Error`
- `<Specific>Error`

### @rootware/env

Use in examples when environment configuration is needed. Avoid making it a hard
dependency unless configuration validation is core behavior.

### @rootware/log

Accept an injected logger when useful. Default to a noop logger or no logging if
logging is optional.

Recommended events:

```txt
<package>.<area>.<action>
```

### Other packages

Document each package boundary explicitly:

- `@rootware/<other>` owns `<responsibility>`.
- `@rootware/<package>` owns `<responsibility>`.
- The integration point is `<public contract>`.

## Architecture

The package should be split internally into clear layers.

```txt
<Input/API> -> <Internal model> -> <Compiler/Executor/Adapter> -> <Output>
```

### 1. Public API

Defines the ergonomic user-facing entrypoint.

### 2. Internal model

Represents behavior before it is executed, serialized, compiled, or sent to
adapters.

### 3. Adapter boundary

Keeps runtime-specific behavior away from the core.

### 4. Testing boundary

Allows public behavior to be tested without fragile integration setup.

## Public contracts

### Main options

```ts
export interface <Package>Options {
  readonly <field>?: <type>;
}
```

### Main client/interface

```ts
export interface <Package>Client {
  <method>(): Promise<void>;
  close?(): Promise<void>;
}
```

### Adapter contract

```ts
export interface <Package>Adapter {
  <method>(input: <Input>): Promise<<Output>>;
}
```

### Result shape

```ts
export interface <Package>Result {
  readonly ok: boolean;
}
```

Rules:

- Public types must be exported intentionally.
- Internal types must stay internal unless there is a clear extension use case.
- Public contracts must have tests or type assertions.
- Breaking contract changes require migration notes.

## Security and safety model

The package should be safe by default.

Safe by default:

- `<safe behavior>`
- `<safe behavior>`

Potentially unsafe:

- `<unsafe behavior>`
- `<unsafe behavior>`

Unsafe behavior requires one of:

- Explicit option.
- Explicit CLI flag.
- Explicit confirmation.
- Separate advanced API.

Security rules:

- Do not log secrets by default.
- Do not expose stack traces to public outputs by default.
- Do not perform destructive actions silently.
- Do not hide partial failure states.

## Runtime targets

Primary runtime:

- Deno 2.x

Secondary compatibility targets:

- Deno Deploy, where practical.
- Bun, where practical.
- Web-standard runtimes, where practical.

Non-targets before v1:

- Node-first APIs.
- CommonJS exports.
- npm-only plugin protocols.

## Non-goals before v1

Explicit non-goals:

- `<non-goal>`
- `<non-goal>`
- `<non-goal>`

The package should solve its core job before expanding into adjacent systems.

## Documentation requirements

Recommended docs:

```txt
docs/
  introduction.md
  quickstart.md
  configuration.md
  api.md
  testing.md
  examples.md
  security.md
  roadmap.md
```

README structure:

```md
# @rootware/<package>

## Install

## Quick Start

## Why this package exists

## API

## Testing

## Security / Safety

## Runtime Support

## Limitations

## Roadmap

## License
```

## Testing strategy

Required tests:

- Public constructor behavior.
- Public option validation.
- Happy-path behavior.
- Failure behavior.
- Edge cases.
- Adapter boundary behavior.
- Serialization/formatting behavior, if applicable.
- Type assertions, if the package claims type safety.

Every feature should end with at least one of:

- Unit test.
- Integration test.
- Type assertion.
- Example.
- Documented public contract.

## Benchmark strategy

Benchmark only claims that matter for product positioning.

Possible metrics:

- Cold start cost.
- Warm memory usage.
- Throughput.
- Latency.
- Allocation pressure.
- Deno `--watch` reload retention.
- Type-check time.
- Package graph size.

Rules:

- Do not claim performance wins without reproducible scripts.
- Include runtime version, OS, machine, and command used.
- Compare against raw primitives and likely alternatives.

## Release roadmap

## v0.1.x — Published foundation cleanup

Goal: make the current package understandable, installable, and safe to
evaluate.

Tasks:

- Audit current exports.
- Audit public types.
- Identify accidental internals.
- Check README status.
- Check examples status.
- Check tests status.
- Verify clean install with `deno add jsr:@rootware/<package>`.

Acceptance:

- A contributor can read the audit and know exactly what is public.

## v0.2.0 — Product spine

Goal: ship the smallest complete workflow.

A user should be able to:

```txt
<step 1> -> <step 2> -> <step 3> -> <useful result>
```

### Chunk 1 — <first implementation chunk>

Goal: `<goal>`.

Tasks:

- `<task>`
- `<task>`
- `<task>`

Acceptance:

- `<testable acceptance condition>`.

### Chunk 2 — <second implementation chunk>

Goal: `<goal>`.

Tasks:

- `<task>`
- `<task>`
- `<task>`

Acceptance:

- `<testable acceptance condition>`.

## v0.3.0 — Hardening

Goal: make the package safe for careful real usage.

Scope:

- Better error handling.
- Better docs.
- Integration tests.
- Edge-case tests.
- Runtime compatibility checks.

## v0.4.0 — Adapters or integrations

Goal: add the first non-core integration without corrupting the core API.

Scope:

- `<adapter>`
- `<integration>`
- `<example>`

## v1.0.0 — Stable public API

Goal: make `@rootware/<package>` safe to recommend for production Deno apps.

Minimum requirements:

- Stable public API.
- Stable public types.
- Stable error model.
- Stable documentation.
- Clear semver policy.
- Passing CI.
- Publish dry-run green.
- Compatibility limitations documented.

## Suggested issue backlog

### Documentation

- [ ] Expand README.
- [ ] Add quickstart.
- [ ] Add API docs.
- [ ] Add testing guide.
- [ ] Add security/safety notes.

### API

- [ ] Audit public exports.
- [ ] Hide internals.
- [ ] Add JSDoc.
- [ ] Add type tests.

### Testing

- [ ] Add unit tests.
- [ ] Add integration tests.
- [ ] Add failure tests.
- [ ] Add edge-case tests.

### Examples

- [ ] Add minimal example.
- [ ] Add real-app example.
- [ ] Add deployment example, if relevant.

### Performance

- [ ] Add benchmark harness.
- [ ] Compare against raw baseline.
- [ ] Compare against ecosystem alternative.

## Release process

Recommended release process:

1. Update package version.
2. Update README.
3. Update public JSDoc.
4. Run formatting.
5. Run linting.
6. Run type checking.
7. Run tests.
8. Run publish dry-run.
9. Publish manually through the Rootware workflow.

Commands:

```sh
deno task fmt:check
deno task lint
deno task check
deno task test
deno task publish:dry:<package>
```

## First 10 implementation chunks

Do these first:

1. Audit current package.
2. Define public exports.
3. Add product warning to README.
4. Add documentation skeleton.
5. Implement the smallest public contract.
6. Add tests for that contract.
7. Add error model.
8. Add testing helper or example.
9. Add integration boundary.
10. Add release notes for the next version.

## Product rule

Every chunk must end with one of:

- A passing test.
- A working example.
- A documented public contract.
- A benchmark result.
- A typed API assertion.
- A failing safety check that protects the user.

The package should move like a real product: small public contracts, tested
behavior, clean release notes, and no accidental API drift.
