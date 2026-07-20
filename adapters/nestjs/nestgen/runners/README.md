# Nest codegen (`nest-gen`)

HBS pipeline: `backend/01-backend-spec.yaml` → `server/src/modules/` (CQRS).

## Usage

```bash
pnpm contract:gen --spec docs/features/yaml/.../ir/spec.yaml   # prerequisite
pnpm nest:registry
pnpm nest:gen:dry --spec docs/features/yaml/.../backend/01-backend-spec.yaml
pnpm nest:gen --spec ... --force
pnpm nest:unit-gen --spec .../backend/01-backend-spec.yaml
```

## Layers

| Layer | Template |
|-------|----------|
| Module | `module.module.ts.hbs` |
| Controller | `entity.controller.ts.hbs` — wired by `codegen.wire` / `api.endpoints` |
| Resource | `entity.resource.ts.hbs` |
| Search | `queries/search.*.hbs` when `wire.search` |
| Commands | `commands/create|update|delete.*.hbs` when `wire.create|update|delete` |
| ORM | `orm/typeorm.entity.ts.hbs` — columns from spec fields + relation comments |

Registry: `registries/nest-codegen.registry.json`  
Unit tests: `pnpm nest:unit-gen` · `registries/nest-unit-test.registry.json`  
Common layer: `server/src/common/` · [NEST-API-STRUCTURE.md](../../docs/operational/NEST-API-STRUCTURE.md)

Workflow: [TEAM-AI-BACKEND-WORKFLOW.md](../../docs/operational/TEAM-AI-BACKEND-WORKFLOW.md)
