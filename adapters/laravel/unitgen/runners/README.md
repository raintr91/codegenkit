# api:unit-gen

Mechanical PHPUnit scaffolding after `api:gen` — registry-driven patterns + `#needs-unit-test` DSL.

## Prerequisite

```bash
pnpm api:gen --spec docs/features/{slug}/01-backend-spec.yaml
```

`crud-standard` profiles auto-run `api:unit-gen` at the end of `api:gen` (tag `#gen:test-unit`).  
`api:gen` only passes `--force` to unit-gen when **you** pass `api:gen --force`.

## Commands

```bash
pnpm api:unit-registry
pnpm api:unit-gen:dry --spec docs/features/chain/hotel/01-backend-spec.yaml
pnpm api:unit-gen --spec docs/features/chain/hotel/01-backend-spec.yaml
pnpm api:unit-gen --spec ... --phase enriched --force
pnpm api:unit-gen --spec ... --phase stub --force   # refresh structural stubs only
```

## Stub dedupe (direction C)

Structural tests may already exist from:

1. `api:gen` → `#gen:test-module` → `m:module-test`
2. `m:controller` wizard → per-layer `m:action` / `m:query` / … each calls `ensureGeneratedClassTest`

When `phase` is `all` (default), `moduleTest.stub` is **skipped** if:

- `generated/codegen.manifest.json` shows `module-test` as `OK` / `SKIPPED`, or
- `#gen:test-module` in `tagPlan` is `skipped`, or
- workspace already has `*Test.php` for every prod class of the entity

Use `--phase stub` or tag `#gen:test-module-stub` to force `m:module-test` anyway.

## Overwrite

| Goal | Command |
|------|---------|
| Regen enriched/behavioral only | `pnpm api:unit-gen --spec ... --phase behavioral` |
| Overwrite enriched templates | `pnpm api:unit-gen --spec ... --force` |
| Refresh structural stubs | `pnpm api:unit-gen --spec ... --phase stub --force` |
| Full code + unit refresh | `pnpm api:gen --spec ... --force` |

Without `--force`, existing template outputs are skipped (`exists (use --force)`).

## Output

- `docs/features/{slug}/generated/unit.manifest.json` — `needsUnit[]`, `files[]`, `skippedPatterns[]`
- `docs/features/{slug}/generated/UNIT-HANDOFF.md` — verify commands

## Tag DSL (`tags:` in `01-backend-spec.yaml`)

| Tag | Behavior |
|-----|----------|
| `#gen:test-module` | Structural stubs via `api:gen` → `m:module-test` |
| `#gen:test-module-stub` | Force `m:module-test` in `api:unit-gen` even when deduped |
| `#gen:test-request-validation-hooks` | Force enriched request tests |
| `#gen:test-controller-invoke` | Force `{Entity}ControllerInvokeTest` |
| `#skip-unit-test:controller-invoke` | Skip invoke pattern |
| `#needs-unit-test:query:Hotel:chain-scope` | Gap queue (`status: planned` only) |
| `#test-mock:db-factory` | Mock boundary hint in manifest |

`#manual-action:*` topics map to registry `patternId` via `manualTopicMap` (when conditions on patterns).

App concerns (`src/tests/Unit/Concerns/`) are **commonBaselines** — never generated per module. Module gets `ModuleTestSupport.php` only.

## Phases

| `--phase` | Patterns |
|-----------|----------|
| `stub` | `m:module-test` (always planned; use `--force` to overwrite) |
| `enriched` | `ModuleTestSupport`, validation hooks, controller invoke |
| `behavioral` | Rules, scope, relationships, OpenAPI shape (`*BehaviorTest.php`) |
| `all` (default) | enriched + behavioral; stub only if not deduped |

Registry: `registries/unit-test.registry.json`
