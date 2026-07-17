---
name: grill-api
description: /grill-api — audit generated FastAPI/Laravel API before integration.
disable-model-invocation: true
---

# /grill-api

Run after `codegenkit api-gen:dry` and after implementation.

Check:

- Routes/methods/statuses match the input contract.
- AuthZ and tenant scope use trusted context.
- Validation does not accept request-bag noise.
- Null/empty/error semantics remain distinct.
- Writes are transaction-safe; async retries are idempotent.
- Generated placeholders are replaced before ship.

## Accelerators (optional)

```text
if ArtifactGraph available: contract/tag/parity hints
else: scoped contract-to-code comparison

if CodeGraph available: callers/routes/jobs/listeners
else: targeted repository search
```

Handoff verified payloads/errors/permissions to FE `/wire`.
