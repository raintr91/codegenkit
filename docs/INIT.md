# `codegenkit init`

```bash
codegenkit init --type=fe --adapter=nuxt4 --target=cursor --docs-root=/path/to/docs-hub --yes
codegenkit init --type=fe --adapter=nextjs --yes
codegenkit init --type=be --adapter=fastapi --yes
codegenkit init --type=be --adapter=laravel --yes
codegenkit init --type=fe --adapter=dotnet-line --yes
codegenkit init --type=be --adapter=dotnet-integration --yes
codegenkit init --type=fullstack --fe-adapter=nuxt4 --be-adapter=fastapi --yes
```

Supported profiles are `fe`, `be`, and explicit `fullstack`. Docs/tests
profiles must not install Codegenkit.

`init` writes machine-local `.cursor/mcp.json`, syncs only selected lane skills,
merges owned skill IDs into `platform-repos.json`, and installs the selected
adapter's managed registry defaults under `registries/` (including the
`dotnet-line` FE registry). Existing user-modified
registries are reported as conflicts unless `--force` is explicit.

## Managed lifecycle

The install manifest at `.codegenkit/install-manifest.json` records every
managed target, its installed hash, selected profile, and adapters. On a later
`init`, targets no longer supplied by that profile/adapter are retained in the
manifest with `stale: true`; they are not silently deleted. This includes
adapter-owned registry defaults.

The `dotnet-line` and `dotnet-integration` adapters require the .NET 8 SDK and
resolve it from `CODEGENKIT_DOTNET`, then `dotnet`. Their pilot profiles are
`kiosk-check-in` and `mes-downtime`; they do not claim generic .NET support.
Their primary generation pass bundles generated test source, so they have no
separate unit-generation engine.

```bash
codegenkit status                         # JSON health and compatibility report
codegenkit prune                          # dry-run: list safe stale removals
codegenkit prune --yes                    # remove unmodified stale files
```

`status` buckets manifest-owned targets into `healthy`, `missing`, `modified`,
and `stale`. A stale target changed locally is `modified`, and `prune --yes`
always keeps it. Prune derives the current managed set from the profile and
adapters stored in the manifest. It never scans for deletion candidates and
never deletes `platform-repos.json` or any other path absent from the install
manifest.
