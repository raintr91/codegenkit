# API codegen (`api-gen`)

Mirror `portal:gen` — đọc `01-backend-spec.yaml`, map tags qua `registries/codegen.registry.json`, sinh lệnh `php artisan m:*` / `add:*`, stub Service, `generated/codegen.manifest.json` + `HANDOFF.md`.

Chạy từ **repo root**:

```bash
# Validate tag registry
pnpm api:registry

# Gate sau /grill-api-spec
pnpm api:gen:dry --spec docs/features/{slug}/01-backend-spec.yaml

# Grill cập nhật codegen.commands + manifest + HANDOFF vào feature/generated/
pnpm api:gen:dry --spec docs/features/{slug}/01-backend-spec.yaml --write-spec

# /api-code — thực thi generators (cần approval.status: approved)
pnpm api:gen --spec docs/features/{slug}/01-backend-spec.yaml --write-spec
```

| Flag | Mô tả |
|------|--------|
| `--dry-run` | Validate + in plan + tag plan, không chạy artisan |
| `--write-spec` | Ghi `codegen.commands[]`, `generated/codegen.manifest.json`, `HANDOFF.md` |
| `--plan-only` | Ghi HANDOFF, không chạy artisan |
| `--force` | Chạy lại artisan dù module/model/controller đã tồn tại |

Khi chạy lại, script **phân tích `src/`** rồi chỉ sinh lệnh còn thiếu:

| Đã có | Hành vi |
|--------|---------|
| `Modules/{M}/module.json` | Không gọi `m:module` |
| `app/Models/{Platform\|Tenant}/{E}.php` | Không gọi `m:model` (`--shared-model=no` trên wizard) |
| Controller + route wired | Không gọi wizard; dùng `add:action` cho endpoint còn thiếu |
| Tests | `m:module-test --type=controller --class={E}` nếu chỉ thiếu controller test |

`--force` → thêm `--force` / `--yes` / `--overwrite-controller=yes` theo `make_help.md`.

| Output | Mô tả |
|--------|--------|
| `registries/codegen.registry.json` | Tag → artisan command / HANDOFF phase (tham khảo Portal registry) |
| `generated/codegen.manifest.json` | Tag plan, commands, manual items — agent đọc trước HANDOFF |
| `generated/HANDOFF.md` | Checklist `#manual-*` sau khi generators chạy |

Extracts: `.cursor/extracts/api-codegen-tags.md`, `api-codegen-readiness.md`
