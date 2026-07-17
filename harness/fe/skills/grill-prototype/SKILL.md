---
name: grill-prototype
description: /grill-prototype — FE grill gate before /prototype generation.
disable-model-invocation: true
---

# /grill-prototype

**Owner:** Codegenkit · optional ArtifactGraph recommend/check before dry-gen.

```text
if ArtifactGraph available: allowlist_check + recommend_command for genDry
else: codegenkit gen:dry --adapter=… --docs-root=… -- --id …
```

Missing ArtifactGraph never blocks the grill. Complete the deterministic dry
generation fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.

Do not execute docs-hub scripts from the FE repo.
