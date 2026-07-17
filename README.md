# Codegenkit

Independent MCP/harness package for FE portal and unit codegen.

Adapters:

- `nuxt4` (from Portal)
- `nextjs`

Docs-hub init is **forbidden**. Use:

```bash
codegenkit init --type=fe --adapter=nuxt4 --docs-root=/path/to/docs-hub --yes
```

Executable tools:

- `codegen_gen` / `codegen_gen_dry`
- `unit_gen` / `unit_gen_dry`
- `codegen_registry_validate` / `unit_registry_validate`

Set `CODEGENKIT_DOCS_ROOT` (or `--docs-root`). Sibling `../base-docs` is not assumed.

ArtifactGraph is optional for allowlist recommendation only.
