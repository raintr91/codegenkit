---
name: grill-unit
description: /grill-unit — FE grill gate before /unit generation.
disable-model-invocation: true
---

# /grill-unit

**Owner:** Codegenkit · optional ArtifactGraph recommend/check before unit dry-gen.

```text
if ArtifactGraph available: allowlist_check + recommend_command for unitGenDry
else: codegenkit unit-gen:dry --adapter=… --docs-root=… -- --id …
```
