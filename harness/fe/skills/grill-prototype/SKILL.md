---
name: grill-prototype
description: /grill-prototype — FE grill gate before /prototype generation.
disable-model-invocation: true
---

# /grill-prototype

**Owner:** Codegenkit · optional local ArtifactGraph allowlist check before dry-gen.

```text
if local ArtifactGraph available: check the FE repo's allowlist for genDry
else: codegenkit gen:dry --adapter=… --docs-root=… -- --id …
```

Canonical IR/registries come from `CODEGENKIT_DOCS_ROOT`; ArtifactGraph does
not follow that pointer. Architecture IDs → Hubdocs (`HUBDOCS_ROOT`); symbols
in other repos → `codegraph-<key>` only.

Missing ArtifactGraph never blocks the grill. Complete the deterministic dry
generation fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.

Do not execute docs-hub scripts from the FE repo.
