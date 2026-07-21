---
name: grill-unit
description: /grill-unit — FE grill gate before /unit generation.
disable-model-invocation: true
---

# /grill-unit

**Owner:** Codegenkit · optional local ArtifactGraph allowlist check before unit dry-gen.

```text
if local ArtifactGraph available: check the FE repo's allowlist for unitGenDry
else: codegenkit unit-gen:dry --adapter=… --docs-root=… -- --id …
```

Canonical IR/registries come from `CODEGENKIT_DOCS_ROOT`; ArtifactGraph does
not follow that pointer. Architecture IDs → Docskit (`DOCSKIT_ROOT`); symbols
in other repos → `codegraph-<key>` only.

Missing ArtifactGraph never blocks the grill. Complete the deterministic dry
generation fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.
