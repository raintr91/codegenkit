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
codegenkit api-gen --adapter=fastapi -- --spec /path/to/ir/spec.yaml --force
codegenkit api-unit-gen:dry --adapter=fastapi -- --spec /path/to/ir/spec.yaml

codegenkit api-gen:dry --adapter=laravel -- --spec /path/to/ir/spec.yaml
codegenkit api-gen --adapter=laravel -- --spec /path/to/ir/spec.yaml

codegenkit api-unit-gen:dry --adapter=laravel -- --spec /path/to/ir/spec.yaml
codegenkit api-registry --adapter=laravel
codegenkit api-unit-registry --adapter=laravel
```

The selected backend repository is the only write target. Never infer a sibling
docs hub or frontend checkout.

Laravel supports the detected `modules-v1` profile only. FastAPI requires an
explicit Python runtime or target virtual environment.

FastAPI generates all nested module entities, with flat `entities` and legacy
`codegen.entity` compatibility. Code and unit manifests retain SHA-256
ownership: identical and unmodified managed files are safe, while unmanaged or
locally modified files block the whole batch. Inspect dry-run statuses before
using `--force`, which explicitly overwrites conflicts. Ambiguous global
endpoints in a multi-entity spec are not shared across entities; the generator
warns and uses entity-local CRUD defaults.

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

Missing accelerators never block API generation. Complete each documented
direct or targeted-local fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for deduplicated
once-per-run-and-optional telemetry with observed metrics only.
