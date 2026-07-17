---
name: unit
description: /unit — unit test generation from codegen manifests via Codegenkit.
disable-model-invocation: true
---

# /unit

**Owner:** Codegenkit (`--type=fe`)

```bash
codegenkit unit-gen:dry --adapter=nuxt4 --docs-root=/path/to/docs-hub -- --id W-AD-AUTH-001
codegenkit unit-gen --adapter=nuxt4 --docs-root=/path/to/docs-hub -- --id W-AD-AUTH-001
codegenkit unit-registry --adapter=nuxt4
```

Requires a prior codegen manifest under the docs-hub Code `generated/` folder.

`dotnet-line` is not supported by these separate unit commands: its primary
`gen` pass already bundles generated test source.

## Accelerators (optional)

```text
if ArtifactGraph available: recommend/check unit-gen allowlist
else: run codegenkit unit-gen directly
```

Missing ArtifactGraph never blocks unit generation. Complete the direct,
deterministic Codegenkit fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.
