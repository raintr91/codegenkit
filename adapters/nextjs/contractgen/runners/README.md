# Contract codegen (`contract-gen`)

Zod contract SSOT in `packages/models` — shared by Next FE and Nest.

## Input

IR `…/ir/spec.yaml` with `entities[].fields[]` (`kind`, `scopes`, `contract`,
`persistence`). Discovery order when `--spec` is omitted:

1. `--yaml-root <path>`
2. `CODEGENKIT_DOCS_ROOT` (and `…/product`, `…/docs/features/yaml`)
3. `$CODEGENKIT_ROOT/docs/features/yaml`

When `entities` is empty, infers scalar/relation fields from `ui.columns`
(pilot fallback).

## Commands

```bash
codegenkit contract-registry
codegenkit contract-gen:dry -- --spec path/to/ir/spec.yaml
codegenkit contract-gen -- --spec path/to/ir/spec.yaml
codegenkit contract-gen -- --spec … --force
```

## Registry ownership

| Layer | Path |
|-------|------|
| Toolkit default (SSOT schema) | `adapters/nextjs/registries/contract-field.registry.json` |
| Product policy (synced on init for `--adapter=nextjs`) | `registries/contract-field.registry.json` |

Validator resolves **product first**, then adapter default.

## Output

| Path | Purpose |
|------|---------|
| `packages/models/src/{entity}/*.read.schema.ts` | Response / list contract |
| `packages/models/src/{entity}/*.write.schema.ts` | Create/update command payload |
| `packages/models/src/{entity}/*.relationships.meta.ts` | ORM-agnostic relation meta |
| `{function}/generated/contract.manifest.json` | Plan + written paths |

`codegenkit gen` does **not** emit models — run `codegenkit contract-gen` first.

Stale product-root `contractgen/` trees are reported by `codegenkit status` and
removed by `codegenkit prune --yes` when present.
