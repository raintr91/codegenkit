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

Executable tools:

- `codegen_gen` / `codegen_gen_dry`
- `unit_gen` / `unit_gen_dry`
- `codegen_registry_validate` / `unit_registry_validate`
- `api_gen` / `api_gen_dry`

Set `CODEGENKIT_DOCS_ROOT` (or `--docs-root`). No sibling docs hub is assumed.

ArtifactGraph is optional for allowlist recommendation only.

The FastAPI adapter runs with `CODEGENKIT_PYTHON`, the target `.venv`, or
`python3`; its environment needs `typer`, `PyYAML` and `Jinja2`.
