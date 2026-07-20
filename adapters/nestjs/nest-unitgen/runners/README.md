# Nest Unit Gen

Generate Jest specs for `nest:gen` output from `backend/01-backend-spec.yaml`.

## Usage

```bash
pnpm nest:unit-registry
pnpm nest:unit-gen:dry --spec docs/features/yaml/.../backend/01-backend-spec.yaml
pnpm nest:unit-gen --spec ... --force
pnpm --filter @portal/api test
```

Registry: `registries/nest-unit-test.registry.json`  
Patterns follow `codegen.wire` (`wire.search` → search handler spec).

Prerequisite: `pnpm nest:gen` on the same backend spec.
