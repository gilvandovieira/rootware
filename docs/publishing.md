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
- Confirm `deno publish --dry-run` passes for the package.
- Confirm the package is linked to the GitHub repository in JSR settings.
- Prepare a Git tag or release notes if applicable.

## Dry Run

Run all package dry-runs:

```sh
deno task publish:dry
```

Run one package dry-run:

```sh
cd packages/errors
deno publish --dry-run --allow-dirty
```

The shared `deno task publish:dry` commands use `--allow-dirty` so local
validation works before committing. The manual publish workflow does not use
`--allow-dirty` for real publication.

## GitHub Actions Publishing

Before using the publish workflow, the package must be linked to this GitHub
repository in the JSR package settings. The workflow uses GitHub OIDC, not
`JSR_TOKEN`.

Manual workflow inputs:

- `package`: one of `errors`, `env`, `log`, `testing`, `http`, `cache`
- `dry_run`: `true` by default

Do not publish if CI is failing.
