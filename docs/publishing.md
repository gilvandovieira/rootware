# Publishing

Each Rootware package is published separately to JSR. Every package has its own
`deno.json`, version, README, and `mod.ts` entrypoint.

Publication is manual and controlled through GitHub Actions. Pull requests and
normal CI runs must only validate and run `deno publish --dry-run`.

## Before Publishing

- Bump the version in the target package `deno.json`.
- Update the package README.
- Update JSDoc for public APIs.
- Confirm tests pass.
- Confirm `deno task ci` passes.
- Confirm `deno task publish:dry` passes.
- Confirm the package is created or prepared in JSR.
- Confirm the package is linked to `gilvandovieira/rootware` in JSR settings.
- Prepare release notes if applicable.

## Dry Run

Run all package dry-runs:

```sh
deno task publish:dry
```

Run one package dry-run:

```sh
deno task publish:dry:errors
```

The shared dry-run tasks use `--allow-dirty` so local validation can run without
committing preparation changes. The manual publish workflow does not use
`--allow-dirty` for real publication.

## GitHub Actions Publishing

Use the manual `Publish` workflow. Inputs:

- `package`: one of `errors`, `env`, `log`, `testing`, `http`, `cache`,
  `storage`, `session`, `migrate`, `orm`, `jobs`
- `dry_run`: `true` by default

The workflow uses GitHub OIDC with `id-token: write`. Do not configure
`JSR_TOKEN` when OIDC is available.

Do not publish if CI is failing. Do not publish automatically from pull
requests.
