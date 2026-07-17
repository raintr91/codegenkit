---
name: api
description: /api — backend API generation through Codegenkit BE adapters.
disable-model-invocation: true
---

# /api — Backend API

**Owner:** Codegenkit (`--type=be`)  
**Adapters:** `fastapi` · `laravel`

## Generate

```bash
codegenkit api-gen:dry --adapter=fastapi -- --spec /path/to/ir/spec.yaml
codegenkit api-gen --adapter=fastapi -- --spec /path/to/ir/spec.yaml

codegenkit api-gen:dry --adapter=laravel -- --spec /path/to/ir/spec.yaml
codegenkit api-gen --adapter=laravel -- --spec /path/to/ir/spec.yaml
```

The selected backend repository is the only write target. Never infer a sibling
docs hub or frontend checkout.

## Review requirements

- Replace generated auth/authorization placeholders with project policy.
- Verify validation, resources/presenters, transactions and error mapping.
- Run backend tests and `/business-impact-review` for risky changes.

## Accelerators (optional)

```text
if ArtifactGraph available: allowlist/recommend API generation
else: execute Codegenkit adapter directly

if CodeGraph available: inspect existing module conventions/callers
else: targeted repository search and reads
```

Missing accelerators never block API generation.
