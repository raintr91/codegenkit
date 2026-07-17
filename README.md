# Codegenkit

Independent MCP/harness package for FE and BE code generation.

Adapters by lane:

- FE: `nuxt4`, `nextjs`
- BE: `fastapi`, `laravel`

Docs/tests init is **forbidden**. Choose a lane and stack:

```bash
codegenkit init --type=fe --adapter=nuxt4 --docs-root=/path/to/docs-hub --yes
codegenkit init --type=be --adapter=fastapi --yes
codegenkit init --type=be --adapter=laravel --yes
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

Set `CODEGENKIT_DOCS_ROOT` (or `--docs-root`). No sibling docs hub is assumed.

ArtifactGraph is optional for allowlist recommendation only.

The FastAPI adapter runs with `CODEGENKIT_PYTHON`, the target `.venv`, or
`python3`; its environment needs `typer`, `PyYAML` and `Jinja2`.

The Laravel adapter targets the `modules-v1` layout: Laravel 12 with
`nwidart/laravel-modules`, `artisan` and `composer.json` at the project root or
under `src/`. The incompatible app-layer layout is not selected implicitly.
