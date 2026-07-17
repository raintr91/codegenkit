# Portal Gen

> **Doc chính:** [Portal codegen (gen + unit)](../../docs/operational/PORTAL-CODEGEN.md) — đọc trước khi quên thứ tự lệnh.

Generate 4-layer scaffold from feature `spec.yaml` (Handlebars templates).

## Usage

```bash
pnpm portal:registry   # validate registries/design.registry.json
pnpm portal:gen --spec docs/features/yaml/admin/hotel/list/ir/spec.yaml
pnpm portal:gen:dry --spec docs/features/.../ir/spec.yaml
pnpm portal:gen --spec ... --force
```

## Design registry

**Source:** `registries/design.registry.json`  
**Docs:** `.cursor/extracts/platform-design-registry.md` · Rule: `.cursor/rules/platform-design-vocabulary.mdc`

- shadcn/ui = canonical (`#ui: AlertDialog`)
- List default shell: `#shell: DataListPage` (aliases: `DataListTable`, `common list`)
- `portal:gen` resolves shell → list template (`page.vue.hbs` vs `page.custom.vue.hbs`)
- Unknown `#ui:` / `#widget:` → dry-run fails

## Spec requirements

Copy `docs/templates/spec.yaml`. Required:

- `codegen.profile` — `list` | `create`
- `codegen.entity`, `codegen.module`
- `codegen.namespace` (optional) — when `module` differs from admin entity paths (e.g. `chain-hotels` → files under `chain-hotel/`)
- `ui.routes`, `ui.columns` (list), `ui.filters` (optional)
- `api.endpoints` with `action: list` or `create`
- `tags` — see `.cursor/extracts/codegen/tags.md`

**List default tags (grill):**

```yaml
tags:
  - "#shell: DataListPage"
  - "#pattern: CRUD"
  - "#style: shadcn/ui"
  - "#style: compact"
  - "#style: flat"
```

**Namespace collision:** `entity: hotel` + `module: chain-hotels` writes to `models/chain-hotel/`, not `models/hotel/` (admin). Explicit `codegen.namespace: chain-hotel` also works.

**Lifecycle:** Khi ghi `pages/*.vue`, portal-gen cập nhật registry (`prototype`) + `pnpm portal:lifecycle sync`. Xóa: `pnpm portal:remove --spec <file>`. Doc: `docs/operational/PAGE-LIFECYCLE.md`.

## Output

- App code under `models/`, `services/`, `composables/`, `pages/`, `mocks/`
- `docs/features/{feature}/generated/HANDOFF.md` — *Prototype next*: slot inventory (`#needs-component`); gen does not emit `Mo*` stubs
- `docs/features/{feature}/generated/codegen.manifest.json` (includes `shell`, `shellVariant`)

## Templates

```
codegen/templates/
  list/       — DataListPage; wires cell slots only when Mo* file exists
  create/     — form + useApiForm
codegen/runners/lib/
  design-registry.mjs  — load registry, resolve shell, validate tags
```

`#needs-component` in spec → page placeholder + HANDOFF; implement in `/prototype`, then re-gen.

Tag examples:

```yaml
tags:
  - "#shell: DataListPage"
  - "#needs-component: cell-status:MoStatusChip:label"
columns:
  - key: status
    render: custom
```

Stack: Node ESM + `yaml` + `handlebars` (same family as `scripts/docs/render-docs.mjs`).

Registry promotion is **prototype-only** — see `docs/operational/DESIGN-REGISTRY-PROMOTION.md`.
