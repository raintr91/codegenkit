# NestJS adapter

Backend Nest scaffold (`nestgen`) and Nest unit-test generation (`nest-unitgen`).
Promoted from `drafts/next_nest/` with `CODEGENKIT_ROOT` targeting.

## CLI

```bash
codegenkit api-gen --adapter=nestjs -- --spec <01-backend-spec.yaml> [--dry-run]
codegenkit api-unit-gen --adapter=nestjs -- --spec <…> [--dry-run]
codegenkit api-registry --adapter=nestjs
codegenkit api-unit-registry --adapter=nestjs
```

Registries sync on `codegenkit init --type=be --adapter=nestjs` into product
`registries/nest-*.registry.json`.
