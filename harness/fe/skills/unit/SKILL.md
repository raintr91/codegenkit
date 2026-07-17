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

## Accelerators (optional)

```text
if ArtifactGraph available: recommend/check unit-gen allowlist
else: run codegenkit unit-gen directly
```
