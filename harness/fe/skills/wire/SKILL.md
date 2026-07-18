---
name: wire
description: /wire — replace prototype mocks with real API wiring (FE Codegenkit lane).
disable-model-invocation: true
---

# /wire

**Owner:** Codegenkit (`--type=fe`)

Use after `/prototype` when tags/handoff mark `#wire-only` or real API integration is required.
Keep generation through Codegenkit adapters; resolve canonical docs evidence
through `CODEGENKIT_DOCS_ROOT` and do not invent sibling layout.

## Accelerators (optional)

```text
if local ArtifactGraph available: local FE tags/allowlist slice for wire readiness
else: model review from scoped HANDOFF + registry evidence
```

Missing ArtifactGraph never blocks wiring. Complete the scoped model fallback
first, then follow `.cursor/rules/codegenkit-optional-integrations.mdc` for
once-per-run telemetry with observed metrics only.
