---
name: unit
description: /unit — unit test generation from codegen manifests via Codegenkit.
disable-model-invocation: true
---

# /unit

**Owner:** Codegenkit (`--type=fe`)

```bash
codegenkit unit-gen:dry --adapter=nuxt4 --docs-root=/path/to/docskit -- --id W-AD-AUTH-001
codegenkit unit-gen --adapter=nuxt4 --docs-root=/path/to/docskit -- --id W-AD-AUTH-001
codegenkit unit-registry --adapter=nuxt4
```

Requires a prior codegen manifest under the docskit Code `generated/` folder.
`--docs-root` / `CODEGENKIT_DOCS_ROOT` is the canonical registry/IR pointer;
local ArtifactGraph never replaces it.

## Route

Architecture/C4 → Docskit (`DOCSKIT_ROOT`); IR/registry/gen →
`CODEGENKIT_DOCS_ROOT`; symbols/call-graph for repo X → Platform DNA-wired
`codegraph-<repo-key>`. Never workspace-parent graphs or member-edited MCP.
Local ArtifactGraph is allowlist/tag hints for this repo only.

`dotnet-line` is not supported by these separate unit commands: its primary
`gen` pass already bundles generated test source.

## Accelerators (optional)

```text
if local ArtifactGraph available: recommend/check the FE repo's unit-gen allowlist
else: run codegenkit unit-gen directly
```

Missing ArtifactGraph never blocks unit generation. Complete the direct,
deterministic Codegenkit fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.
