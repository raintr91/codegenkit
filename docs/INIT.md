# `codegenkit build-template-code`

## Mô tả
Lệnh này quét dự án thành viên hiện tại dựa trên **platform‑dna** configuration, tự động tạo các template Handlebars (frontend) và Scriban (backend) phù hợp, đồng thời cập nhật các entry trong `registries/design.registry.json` (hoặc tạo `registries/custom.registry.json`).

## Cách sử dụng
```bash
# Kiểm tra (dry‑run) – chỉ in ra những file sẽ được tạo/viết
codegenkit build-template-code --dry-run

# Thực thi thực tế – tạo template và registry
codegenkit build-template-code

# Ghi đè nếu đã tồn tại (cẩn thận)
codegenkit build-template-code --force
```

## Tham số
- `--dry-run` : Không ghi file, chỉ hiển thị kế hoạch.
- `--force`  : Ghi đè các template/registry đã tồn tại.
- `--merge`  : Gộp registry mới vào `registries/design.registry.json` (mặc định).
- `--output <dir>` : Thư mục đích cho template (mặc định `adapters/<framework>/codegen/templates/custom`).

## Khi nào dùng
- Khi muốn **đồng bộ** một dự án thành viên (FE + BE) với cấu hình `platform‑dna` mà đã có sẵn code.
- Khi cần **tự động tạo** template cho các thành phần mới mà không muốn viết tay.
- Khi muốn **cập nhật registry** để CodeGenKit nhận diện các component/shell mới.

## Liên quan
- Xem `docs/CUSTOMIZE-TEMPLATES.md` để biết cấu trúc template mẫu.
- Xem `docs/INIT.md` (phần **Managed lifecycle**) để hiểu cách init và wiring platform‑dna.
- Skill **build‑template‑code** (tại `harness/fe/skills/build-template-code/SKILL.md`) mô tả chi tiết quy trình và các tùy chọn.

---
*Đây là tài liệu được cập nhật tự động bởi Antigravity sau khi thêm lệnh mới.*
