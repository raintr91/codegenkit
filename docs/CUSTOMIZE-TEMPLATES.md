# Hướng dẫn chi tiết: Tùy chỉnh Templates và Rules trong Codegenkit

Tài liệu này là cẩm nang toàn diện dành cho team member để nắm bắt cách **Codegenkit** sinh code, từ đó tự tin tùy chỉnh (customize) các file sinh ra sao cho đúng với chuẩn (convention) của dự án thực tế. Bạn không cần đọc tài liệu của các tool base bên dưới, mọi thứ bạn cần đều nằm ở đây.

---

## 1. Khái niệm cốt lõi: Rules & Templates là gì?

Để thực sự làm chủ `codegenkit`, bạn cần hiểu rõ 2 khái niệm cốt lõi điều khiển toàn bộ quá trình sinh code: **Rules** (Quy tắc) và **Templates** (Khuôn mẫu).

### 1.1. Templates (Khuôn mẫu) là gì? Tại sao lại cần?

**Ý nghĩa:** Template là một "bản nháp" hoặc "bộ khung" của file code. Nó chứa mã nguồn thực tế của ngôn ngữ bạn đang dùng (Javascript, Python, C#, Java...) nhưng có đan xen các "lỗ hổng" (được gọi là các biến/placeholder).
Về mặt kiến trúc, **mỗi một Template thường đại diện cho một loại Class ở một Layer cụ thể**. Ví dụ:
- Trong kiến trúc **CQRS**, bạn sẽ có các template riêng biệt dùng để sinh ra `Actions`, `Queries`, `Handlers` hoặc `Controller`.
- Trong kiến trúc **MVC** truyền thống, các template sẽ tương ứng dùng để đẻ ra `Controller`, `Services`, `Repositories`.
Việc hiểu Template ở góc độ Layer này giúp bạn dễ dàng tư duy khi muốn chuyển đổi mô hình kiến trúc của dự án (chỉ việc thêm/bớt và viết lại các template tương ứng).

**Tại sao lại cần Template?**
Nếu không có Template, để tạo ra một file code tự động, bạn phải viết những đoạn script nối chuỗi rất lằng nhằng và khó đọc (ví dụ: `const code = "class " + className + " {\n" + "  constructor()...\n}"`). 
Với Template, bạn viết code như bình thường, giữ nguyên được syntax highlight của IDE, và chỉ việc đục lỗ điền biến vào những chỗ cần thay đổi (dynamic). Điều này giúp việc bảo trì và chỉnh sửa code sinh ra cực kỳ trực quan và nhàn hạ.

**Các dạng Template thường gặp:**
Tùy thuộc vào Adapter và hệ sinh thái công nghệ, template có thể mang nhiều định dạng (extension) khác nhau:
- **Node.js/JS Ecosystem (Dùng nhiều trong Codegenkit):** Handlebars (`.hbs`), EJS (`.ejs`), Eta (`.eta`).
  *Ví dụ (`.hbs`):* `export class {{pascalCase name}}Controller {}`
- **PHP / Laravel:** Thường dùng file `.stub` hoặc Blade.
  *Ví dụ (`.stub`):* `class {{ class }} extends Controller`
- **Python:** Thường dùng Jinja2 (`.j2` hoặc `.jinja`).
  *Ví dụ (`.j2`):* `class {{ name | capitalize }}(Model):`
- **C# / .NET:** Thường dùng T4 Templates (`.tt`) hoặc Razor.
  *Ví dụ (`.tt`):* `public class <#= Model.Name #> { }`
- **Java:** Thường dùng Velocity (`.vm`) hoặc FreeMarker (`.ftl`).

*Trong phần lớn các adapter của Codegenkit, chúng ta sẽ làm việc với Handlebars (`.hbs`).*

### 1.2. Rules (Quy tắc) là gì? Dùng để làm gì?

Nếu Template giải quyết câu hỏi *"Nội dung file code trông như thế nào?"*, thì **Rules** giải quyết câu hỏi *"Khi nào thì sinh ra file đó, sinh ra bao nhiêu file, và đặt file đó ở đâu?"*.

**Chức năng của Rules:**
Rule là các đoạn script (logic) thực thi trước khi mã được sinh ra (giai đoạn **Plan**). Nhiệm vụ của nó là:
1. **Phân tích:** Đọc dữ liệu đầu vào (ví dụ: schema định nghĩa bảng `User`).
2. **Quyết định:** Từ bảng `User` đó, có cần tạo file `user.controller.ts` không? Có tạo file `user.service.ts` không? (Nếu bảng đóng vai trò bảng phụ trung gian thì rule có thể quyết định không tạo controller).
3. **Định tuyến:** Tính toán chính xác đường dẫn sẽ lưu file (ví dụ: `src/modules/users/user.controller.ts`).
4. **Gắn kết (Binding):** Chỉ định file đường dẫn trên sẽ được render từ file Template nào (ví dụ template `controller.hbs`).

**Tóm lại:** Bạn có 1 file template `controller.hbs`. Nếu không có **Rule**, tool không biết phải áp dụng template này lúc nào. Rule sẽ đứng ra chỉ đạo: *"Duyệt qua 10 bảng trong DB, với mỗi bảng, hãy lấy template `controller.hbs` này, truyền tên bảng vào, và đẻ ra 10 file tương ứng"*.

---

## 2. Bước 1: Khai báo cấu hình (Configuration)

Để bắt đầu tùy chỉnh, bạn cần báo cho Codegenkit biết thư mục chứa template và rule tự định nghĩa của team. Hãy tạo hoặc sửa file `codegenkit.config.js` ở root dự án:

```javascript
// codegenkit.config.js
module.exports = {
  // Adapter mặc định của dự án, ví dụ: 'nestjs' hoặc 'nuxt4'
  adapter: 'nestjs', 
  
  // Trỏ đường dẫn đến thư mục chứa template và rule tùy chỉnh của team
  customTemplatesDir: './.codegenkit/templates',
  customRulesDir: './.codegenkit/rules',
  
  // Nơi chứa source code chính
  rootDir: './src'
};
```

*Lưu ý: Mọi thư mục liên quan đến tùy chỉnh nên đặt gọn trong folder `.codegenkit/` ở root dự án để dễ quản lý và không lẫn vào code nghiệp vụ.*

---

## 3. Bước 2: Bắt tay vào ghi đè (Override) Template

Giả sử file `Controller` mặc định của tool sinh ra đang áp dụng kiến trúc CQRS (Command/Query), nhưng dự án của bạn lại dùng mô hình MVC truyền thống.

**Cách thực hiện:**

1. **Tìm template gốc:** Thường nằm trong `node_modules/codegenkit/adapters/nestjs/templates/` (hoặc các package adapter tương ứng).
2. **Copy về thư mục custom:**
   Tạo file tại đường dẫn dự án của bạn: `.codegenkit/templates/controller.hbs`. (Tên và đường dẫn phải khớp với template gốc).
3. **Chỉnh sửa nội dung Handlebars:**

```handlebars
// File: .codegenkit/templates/controller.hbs
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { {{pascalCase name}}Service } from './{{kebabCase name}}.service';
import { Create{{pascalCase name}}Dto } from './dto/create-{{kebabCase name}}.dto';

@Controller('{{kebabCase name}}')
export class {{pascalCase name}}Controller {
  constructor(private readonly {{camelCase name}}Service: {{pascalCase name}}Service) {}

  @Post()
  create(@Body() createDto: Create{{pascalCase name}}Dto) {
    return this.{{camelCase name}}Service.create(createDto);
  }

  // Thêm các method khác theo chuẩn của dự án bạn...
}
```

Từ giờ, mỗi khi sinh module mới, Codegenkit sẽ dùng file `controller.hbs` của bạn thay vì file mặc định của hệ thống.

---

## 4. Các biến khả dụng trong Template (Available Variables)

Khi viết template Handlebars, bạn sẽ truy cập vào một object chứa dữ liệu gọi là `Context` (do Rule truyền xuống). 

### 4.1. Biến định danh (Naming)
Thay vì hard-code tên biến dễ sai sót, bạn dùng các helper format sau để Codegenkit tự động chuyển đổi:
- `{{name}}`: Tên gốc (vd: `user profile`).
- `{{camelCase name}}`: Biến thông thường (vd: `userProfile`).
- `{{pascalCase name}}`: Tên Class/Component (vd: `UserProfile`).
- `{{kebabCase name}}`: Tên file/URL (vd: `user-profile`).
- `{{snakeCase name}}`: Khóa DB (vd: `user_profile`).

### 4.2. Dữ liệu thuộc tính (Properties)
Khi sinh code từ một entity/schema, bạn có thể lặp qua các field:
```handlebars
export interface I{{pascalCase name}} {
{{#each properties}}
  {{this.name}}: {{this.type}}; // Ví dụ sinh ra: age: number;
{{/each}}
}
```

---

## 5. Kỹ năng Debug Template (Troubleshooting)

"Code sinh ra bị thiếu dòng" hoặc "Template báo lỗi không tìm thấy biến" là chuyện hết sức bình thường khi viết template. Dưới đây là tuyệt chiêu giải quyết nhanh nhất:

### Kỹ thuật "Dump Context" (Quan trọng nhất)
Nếu bạn không biết Rule đang truyền xuống những dữ liệu gì cho Template, hãy in toàn bộ cục dữ liệu đó ra thẳng file code bằng cú pháp `json`:

```handlebars
/* 
--- DEBUG DUMP START ---
{{{json this}}}
--- DEBUG DUMP END ---
*/
```
Chạy lệnh sinh code, mở file kết quả lên bạn sẽ thấy toàn bộ cây object JSON. Từ đó bạn có thể dễ dàng mò được biến mình cần (vd: `this.relations[0].targetEntity`).

### Các lỗi phổ biến khác
- **Lỗi thiếu helper:** Chú ý dùng đúng `{{kebabCase ...}}` (nhiều bạn viết nhầm thành `{{kebab ...}}`). Hãy kiểm tra lại log CLI nếu Handlebars báo lỗi `Missing helper`.
- **Sai đường dẫn Override:** Nếu tool vẫn sinh ra code cũ mèm, hãy chắc chắn đường dẫn thư mục và tên file `.hbs` trong `.codegenkit/templates/` khớp 100% với cấu trúc thư mục của file template gốc.

---

## 6. Các Use-case (Showcase) kinh điển của team

Dưới đây là một số ví dụ thực tiễn mà team thường xuyên phải tự customize để phù hợp với dự án:

### Showcase 1: Chuyển đổi Component UI (Từ thư viện sang HTML/CSS thuần)
Trong Adapter `nextjs` hoặc `nuxt4`, template mặc định có thể đang dùng các component phức tạp (vd: `<Button>`, `<Card>`). Nếu dự án dùng Tailwind CSS thuần:
1. Mở file `.codegenkit/templates/list/page.vue.hbs` (hoặc tương tự).
2. Xóa các đoạn `import { Button } from '@/components/ui/button'` đi.
3. Chỉnh HTML trực tiếp trong file:
   ```handlebars
   <!-- Mặc định: <Button>Thêm mới {{pascalCase name}}</Button> -->
   <!-- Team sửa thành: -->
   <button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
      Thêm mới {{pascalCase name}}
   </button>
   ```

### Showcase 2: Tùy chỉnh bằng Custom Rules (Thay đổi thư mục Test)
Mặc định, Codegenkit có thể sinh file test vào một thư mục riêng biệt như `__tests__/`. Nhưng team muốn file test `*.spec.ts` phải nằm sát cạnh file logic.
Lúc này, ghi đè Template là vô ích (vì template chỉ định nghĩa nội dung file). Bạn phải viết **Custom Rule** (can thiệp vào logic đường dẫn sinh ra):

```javascript
// .codegenkit/rules/custom-test-path.js
module.exports = {
  apply(ctx, plan) {
    // Sửa lại đường dẫn của mọi file sinh ra có liên quan tới test
    plan.files.forEach(file => {
      if (file.path.includes('__tests__')) {
         // Di chuyển file ra ngoài và đổi đuôi .test sang .spec
         file.path = file.path.replace('__tests__/', '').replace('.test.ts', '.spec.ts');
      }
    });
  }
}
```
Kích hoạt rule này trong `codegenkit.config.js` là bạn đã thay đổi hoàn toàn kiến trúc file test theo đúng ý dự án mà không tốn sức đổi tay từng file.
