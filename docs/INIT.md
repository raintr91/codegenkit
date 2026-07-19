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
and installs the selected adapter's managed registry defaults under
`registries/` (including the `dotnet-line` FE registry). Codegenkit never
writes `platform-repos*.json`; the lane and adapters are recorded in
`.codegenkit/install-manifest.json`. Existing user-modified
registries are reported as conflicts unless `--force` is explicit.

For FE, pass `--docs-root=/absolute/path/to/docs-hub`. Init stores the
member-selected path as `CODEGENKIT_DOCS_ROOT`; this is the canonical bridge to
docs IR/registries. ArtifactGraph in FE remains local-only and does not replace
that pointer.

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
codegenkit deinit                         # current repo harness + local MCP
codegenkit uninstall                      # all tracked repos + MCP + CLI
codegenkit uninstall --discover ~/workspace --yes
```

`status` buckets manifest-owned targets into `healthy`, `missing`, `modified`,
and `stale`. A stale target changed locally is `modified`, and `prune --yes`
always keeps it. Prune derives the current managed set from the profile and
adapters stored in the manifest. It never scans for deletion candidates and
never deletes `platform-repos.json` or any other path absent from the install
manifest.

`deinit` is the inverse of `init` for one destination repo. `uninstall` is the
machine-wide lifecycle command and can run from anywhere: it reads Codegenkit's
XDG state ledger, removes each tracked repo install and local Cursor MCP entry,
then removes global Cursor MCP wiring and the CLI. Both commands preview and
confirm in a TTY; use `--yes` for automation.

Uninstall removes current and stale manifest-owned files only when their SHA-256
still matches the install manifest. Modified files and registries are preserved
and reported. Shared Cursor MCP JSON is edited by deleting only
`mcpServers.codegenkit`, so other toolkit entries remain intact. The ledger is
stored under `$CODEGENKIT_STATE_DIR`, otherwise
`$XDG_STATE_HOME/codegenkit` or `~/.local/state/codegenkit`; `--discover`
recovers older installs that do not yet appear there.
