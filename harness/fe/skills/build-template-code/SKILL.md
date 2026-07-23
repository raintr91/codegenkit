# Build Template Code Skill

## Mục tiêu
Cung cấp hướng dẫn từng bước cho người dùng khi muốn **tự động tạo template** (frontend + backend) cho dự án thành viên dựa trên cấu hình `platform-dna`.

## Cách sử dụng
```bash
# Kiểm tra kế hoạch (không ghi file)
codegenkit build-template-code --dry-run

# Thực thi tạo template và registry
codegenkit build-template-code

# Ghi đè nếu template đã tồn tại
codegenkit build-template-code --force
```

## Tham số
- `--dry-run`  : Chỉ in ra danh sách file sẽ được tạo/ghi, không thay đổi hệ thống.
- `--force`  : Ghi đè các template và registry đã có (cẩn thận).
- `--merge`  : Gộp registry mới vào `registries/design.registry.json` (mặc định).
- `--output <dir>` : Thư mục đích cho các template được sinh (mặc định `adapters/<framework>/codegen/templates/custom`).

## Quy trình nội bộ (được mô tả trong `implementation_plan.md`)
1. **Quét dự án** – `src/template-builder/scanProject.ts` đọc `platform-dna` để xác định các file nguồn.
2. **Trích xuất model** – Dùng AST/regex để lấy tên lớp, route, props, … và tạo JSON model.
3. **Sinh template** – `generateTemplate.ts` tạo các file `.hbs` (FE) và `.scriban` (BE) dựa trên model.
4. **Cập nhật registry** – `writeRegistry.ts` tạo hoặc gộp `custom.registry.json`.
5. **Báo cáo** – In danh sách file đã tạo/viết và các entry registry mới.

## Liên quan
- **Docs**: `docs/INIT.md` (phần *build‑template‑code*), `docs/CUSTOMIZE-TEMPLATES.md`.
- **Skill**: `harness/fe/skills/build-template-code/SKILL.md` (đây là tài liệu hiện tại).
- **Command**: `src/commands/build-template-code.ts` (sẽ được triển khai dựa trên kế hoạch).

---
*Skill này được tạo tự động bởi Antigravity để hỗ trợ người dùng thực hiện lệnh `codegenkit build-template-code`.*
