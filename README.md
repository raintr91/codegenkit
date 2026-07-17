# Codegenkit

Independent MCP/harness package for FE and BE code generation.

The installers default to immutable release tag `v0.4.0` and enforce the
committed lockfile (`pnpm --frozen-lockfile` or `npm ci`). Set
`CODEGENKIT_REF` / PowerShell `-Ref` only for an explicit alternate release.

Adapters by lane:

- FE: `nuxt4`, `nextjs`, `dotnet-line`
- BE: `fastapi`, `laravel`, `dotnet-integration`

Docs/tests init is **forbidden**. Choose a lane and stack:

```bash
codegenkit init --type=fe --adapter=nuxt4 --docs-root=/path/to/docs-hub --yes
codegenkit init --type=be --adapter=fastapi --yes
codegenkit init --type=be --adapter=laravel --yes
codegenkit init --type=fe --adapter=dotnet-line --yes
codegenkit init --type=be --adapter=dotnet-integration --yes
codegenkit init --type=fullstack --fe-adapter=nextjs --be-adapter=fastapi --yes
```

Inspect and safely clean managed harness assets:

```bash
codegenkit status
codegenkit prune                         # dry-run
codegenkit prune --yes                   # delete unmodified stale files only
```

Changing profile or adapter keeps targets from the previous install in
`.codegenkit/install-manifest.json` as stale. `status` reports managed files as
`healthy`, `missing`, `modified`, or `stale`, plus package/API compatibility.
`prune` considers only paths recorded in that manifest, never
`platform-repos.json` or unrelated project files, and always preserves locally
modified stale files.

Executable tools:

- `codegen_gen` / `codegen_gen_dry`
- `unit_gen` / `unit_gen_dry`
- `codegen_registry_validate` / `unit_registry_validate`
- `api_gen` / `api_gen_dry`
- `api_unit_gen` / `api_unit_gen_dry`
- `api_registry_validate` / `api_unit_registry_validate`
- `common_registry_validate` (CLI: `codegenkit common-registry`)

Set `CODEGENKIT_DOCS_ROOT` (or `--docs-root`). No sibling docs hub is assumed.
ID-based FE generation requires the docs-hub Code artifact at `ir/spec.yaml`;
bundle YAML is never accepted as a codegen fallback.

The published `schemas/common-registry.schema.json` describes the installed
`registries/common.registry.json` format. The common-registry validator also
checks that every alias targets an existing entry.

ArtifactGraph is optional for allowlist recommendation only.

The FastAPI adapter runs with `CODEGENKIT_PYTHON`, the target `.venv`, or
`python3`; its environment needs `PyYAML` and `Jinja2`.
It generates every entity in `modules[*].entities[*]` (or flat `entities[*]`)
as one preflighted batch. Generated code and unit manifests record SHA-256
ownership: unchanged or previously owned files update safely, local/unmanaged
files block writes, and `--force` explicitly replaces conflicts. Multi-entity
endpoints are matched conservatively; ambiguous endpoints use isolated CRUD
defaults with a warning instead of being cross-wired.

The Laravel adapter targets the `modules-v1` layout: Laravel 12 with
`nwidart/laravel-modules`, `artisan` and `composer.json` at the project root or
under `src/`. The incompatible app-layer layout is not selected implicitly.

The vendored .NET adapters require the .NET 8 SDK. They use
`CODEGENKIT_DOTNET` when set, otherwise `dotnet`, and always use
`CODEGENKIT_ROOT` as the product root and sole write boundary:

```bash
codegenkit gen:dry --adapter=dotnet-line -- --spec ir/spec.yaml
codegenkit gen --adapter=dotnet-line -- --spec ir/spec.yaml
codegenkit registry --adapter=dotnet-line
codegenkit api-gen:dry --adapter=dotnet-integration -- --spec ir/spec.yaml
codegenkit api-gen --adapter=dotnet-integration -- --spec ir/spec.yaml
codegenkit api-registry --adapter=dotnet-integration
```

These are canonical C# Scriban engines vendored from Line at `27ddf1f` and
Integration at `c42d567`; they are pilot-specific (`kiosk-check-in` and
`mes-downtime`), not generic .NET generators. Each main generation pass also
emits its test source. Separate `unit-gen` / `api-unit-gen` and unit-registry
commands are intentionally unsupported for these adapters.
