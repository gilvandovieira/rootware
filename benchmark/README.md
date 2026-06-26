# Rootware Benchmarks

This directory contains reproducible benchmark cases for Rootware packages.
Benchmarks use Deno's built-in `Deno.bench` runner and a small wrapper that
stores raw machine-readable results with enough metadata to compare runs later.

## Commands

Run benchmarks directly:

```sh
deno task bench
```

Run benchmarks and write a tracked result envelope:

```sh
deno task benchmark
```

Filter a run:

```sh
deno task benchmark --filter schema
```

Run one case file and annotate the result:

```sh
deno task benchmark --case benchmark/cases/foundation.bench.ts --tag local --note "laptop baseline"
```

## Layout

- `cases/` contains `*.bench.ts` files registered with `Deno.bench`.
- `fixtures/` contains deterministic inputs shared across benchmark cases.
- `results/` receives JSON result envelopes from `deno task benchmark`.
- `run.ts` wraps `deno bench --json` and records runtime, git, command, seed,
  lockfile hash, config hash, tags, notes, and raw Deno benchmark output.

## Naming

Use Deno bench groups for comparable operations:

```ts
Deno.bench({
  name: "schema.serialize.large/rootware",
  group: "schema.serialize.large",
  baseline: true,
  fn() {
    // ...
  },
});
```

Use implementation names that make comparisons explicit:

- `rootware` for the Rootware implementation.
- `platform:*` for direct Web/Deno/JavaScript baselines.
- `jsr:*` or `npm:*` for external package offerings.

Platform baselines are reference points, not always feature-equivalent
competitors. When adding a true competing offering, keep setup outside `fn`,
place it in the same group as the matching Rootware operation, and document any
semantic differences in this README or the case file.

## Reproducibility

For comparable results:

- Run from a clean git tree when possible.
- Use the same machine, power profile, Deno version, and lockfile.
- Prefer `deno task benchmark` over `deno task bench` when preserving data.
- Commit only benchmark result files that are useful as named baselines.

The result envelope keeps the raw Deno JSON intact so future analysis can use
new metrics without re-running old benchmark data.
