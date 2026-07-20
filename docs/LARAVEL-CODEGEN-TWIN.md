# Laravel codegen twin (planner / api-gen)

**Decision (2026-07-20):** keep Node planner in-package at
`adapters/laravel/codegen/`. Invoked only via `codegenkit api-gen` with
`CODEGENKIT_ROOT` — product checkouts must **not** restore a root `codegen/`
tree.

PHP port of the planner is deferred until unitgen PHP (already shipped under
`adapters/laravel/php/` → `src/.codegenkit/`) has soaked in product `api`.

## Audit (modules stay Node-in-kit)

| Module | Role |
|--------|------|
| `plan.mjs` | Command plan from registry + workspace |
| `read-spec.mjs` | YAML IR |
| `tag-plan.mjs` | `#gen:*` tag plan |
| `stub-services.mjs` | Manual service stubs |
| `workspace-analysis.mjs` | Existing module detection |
| `write-manifest.mjs` / `write-handoff.mjs` | Feature handoff |
| `exec-artisan.mjs` | `php artisan m:*` |

Artisan stubs remain product/app-owned; manifests stay beside the feature spec
on the docs hub / feature dir.

## Init contract

`managedSources()` syncs Laravel **PHP unitgen** only (`src/.codegenkit/`) plus
`registries/`. It does **not** sync Node codegen into the product.
