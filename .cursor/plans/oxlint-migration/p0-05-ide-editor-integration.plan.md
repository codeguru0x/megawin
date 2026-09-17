# P0-05 — Tích hợp IDE: Format-on-Save (Prettier) + Lint Fix-on-Save (Oxlint)

> Nguồn: [`00-overview.md`](00-overview.md) §1 + yêu cầu tường minh của user: "tích hợp cả format
> trong IDE khi code nhấn save file". Phụ thuộc [`p0-03`](p0-03-oxlintrc-manual-config.plan.md) +
> [`p0-04`](p0-04-prettier-format-cutover.plan.md) (cần `.oxlintrc.json` + `.prettierrc` viết xong,
> và Oxlint/Prettier chạy sạch trước khi trỏ IDE vào chúng).

## Bằng chứng đã verify thật (web search, không suy đoán tên setting)

Extension chính thức: **`oxc.oxc-vscode`** (Marketplace + Open VSX, tương thích Cursor — dựa trên
VS Code engine). Các setting đã xác nhận từ README chính thức `oxc-project/oxc-vscode`:

| Setting | Mặc định | Vai trò |
|---|---|---|
| `oxc.enable.oxlint` | `true` | Bật linter — **giữ `true`** |
| `oxc.enable.oxfmt` | `true` | Bật formatter Oxfmt — **PHẢI set `false`** (quyết định không dùng Oxfmt, dùng Prettier) |
| `oxc.enable` | `null` | Master toggle override cả 2 — **KHÔNG set** (để 2 setting con tự quyết, tránh bug đã biết ở issue #29: `oxc.enable` là override "root" làm setting con bị lu mờ status bar, dù logic vẫn đúng) |
| `oxc.lint.run` | `onType` | Chạy lint theo keystroke hoặc save. Repo lớn (3122 file) → cân nhắc `onSave` để đỡ tốn CPU liên tục, quyết định ở §2 |
| `oxc.configPath` | `null` (auto-discover) | Không cần set — `.oxlintrc.json` ở root sẽ tự được tìm thấy |
| `oxc.typeAware` | — | Cần set `true` để khớp `--type-aware` đã bật ở `p0-03`; cần thêm `oxlint-tsgolint` cài sẵn (theo README: "khi `oxlint-tsgolint` package cài + `oxc.typeAware` = true") |

Code action ID chính thức (từ README + `discussions/16494`): `source.fixAll.oxc` (fix lint),
`source.format.oxc` (format nếu dùng Oxfmt — **KHÔNG dùng** ở đây vì đã chọn Prettier).

## 1. Quyết định thứ tự chạy khi save

Yêu cầu: Prettier format **trước**, Oxlint fix **sau** (đúng thứ tự cũ Biome:
`source.organizeImports.biome` rồi `source.fixAll.biome` — nhưng giờ Prettier lo cả format +
import order, Oxlint chỉ lo lint-fix thuần).

`editor.codeActionsOnSave` là **object có thứ tự theo key insertion** — VS Code/Cursor chạy tuần tự
theo thứ tự khai báo trong JSON. Do đó đặt `source.fixAll.oxc` **sau** khi format đã xảy ra qua
`editor.formatOnSave` (Prettier là `defaultFormatter` chạy trước code actions).

## 2. Cấu hình `.vscode/settings.json` — thay đổi cụ thể

So với file hiện tại (đã đọc — có block Biome cũ cần xoá):

```diff
-  "editor.defaultFormatter": "biomejs.biome",
+  "editor.defaultFormatter": "esbenp.prettier-vscode",
   "editor.codeActionsOnSave": {
-    "source.fixAll.biome": "explicit",
-    "source.organizeImports.biome": "explicit"
+    "source.fixAll.oxc": "explicit"
   },

   "[markdown]": {
     "editor.defaultFormatter": "esbenp.prettier-vscode"
   },
   "[yaml]": {
     "editor.defaultFormatter": "esbenp.prettier-vscode"
   },
+  "[json]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  },
+  "[jsonc]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  },
+  "[css]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  },

   "js/ts.tsdk.path": "node_modules/typescript/lib",
   "js/ts.tsserver.experimental.enableProjectDiagnostics": true,
   "typescript.preferences.preferTypeOnlyAutoImports": true,
   "prettier.resolveGlobalModules": false,
-  "prettier.documentSelectors": ["**/*.md", "**/*.yml", "**/*.yaml"],
   "prettier.requireConfig": true,
+  "oxc.enable.oxlint": true,
+  "oxc.enable.oxfmt": false,
+  "oxc.typeAware": true,
+  "oxc.lint.run": "onSave",
   "git.ignoreLimitWarning": true,
   ...
   "[typescript]": {
-    "editor.defaultFormatter": "esbenp.prettier-vscode"
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
   }
+  "[typescriptreact]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  },
+  "[javascript]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  },
+  "[javascriptreact]": {
+    "editor.defaultFormatter": "esbenp.prettier-vscode"
+  }
```

**Điểm quan trọng cần verify khi thực thi:** setting `prettier.documentSelectors` hiện tại giới hạn
Prettier extension chỉ chạy trên `.md`/`.yml`/`.yaml` — **PHẢI xoá dòng này** (hoặc mở rộng đủ
`.ts/.tsx/.js/.mjs/.json/.jsonc/.css`), nếu không Prettier extension sẽ **im lặng không format**
các file `.ts`/`.tsx` dù đã set `defaultFormatter` — đây là nguyên nhân phổ biến nhất gây "format on
save không chạy" khi migrate, PHẢI test tay xác nhận (§4), không chỉ đọc setting rồi tin.

`oxc.lint.run: "onSave"` là **quyết định chủ động** khác mặc định `onType` — lý do: repo 3122 file,
tránh tốn CPU liên tục theo keystroke khi mở nhiều file lớn (game settle use-case, Next.js page dài).
Nếu team thấy cần feedback real-time hơn, đổi lại `onType` sau — không phải quyết định bất khả hồi.

## 3. Cập nhật `.vscode/extensions.json` — khuyến nghị extension cho contributor

File này **hiện chưa tồn tại** trong repo (`Glob` xác nhận 0 kết quả) — tạo mới:

```json
{
  "recommendations": ["oxc.oxc-vscode", "esbenp.prettier-vscode"]
}
```

Nếu có `unbiased.biome` hoặc `biomejs.biome` trong file cũ (không có — vì file chưa tồn tại, không
cần xoá gì).

## 4. Test tay bắt buộc — KHÔNG tin config đúng chỉ vì JSON hợp lệ

Đây là bước quan trọng nhất của phase này. Theo các issue đã đọc ở research (§0), format-on-save
qua extension có nhiều lỗi thực tế đã xảy ra với người dùng khác (binary không tìm thấy, thứ tự
code action sai, `documentSelectors` chặn ngầm) — phải tự tay xác nhận trên chính máy dev:

1. Mở 1 file `.ts` trong `packages/game-keno-application/src/...`, cố tình gõ sai style (VD thêm
   dấu `;` dư, xoá 1 dòng blank giữa import group, viết `if (x) doThing()` không có `{}`).
2. Nhấn Cmd+S (save). Quan sát:
   - File có tự format lại đúng style Prettier (thụt lề, quote, import order) không.
   - `if` thiếu `{}` có tự được Oxlint fix thêm `{}` không (rule `curly` có autofix).
3. Mở file `.tsx` trong `apps/backoffice`, cố tình viết class Tailwind lộn thứ tự trong
   `className="..."`. Save → xác nhận `prettier-plugin-tailwindcss` tự sort lại.
4. Mở file `.md` — xác nhận Prettier vẫn format đúng như trước (không bị đổi hành vi ngoài ý muốn).
5. Kiểm tra Output panel (`Oxc (Lint)` và extension Prettier) — không có lỗi "binary not found"
   hoặc "config not found".
6. **Trường hợp binary không tìm thấy** (đã biết là lỗi phổ biến theo issue #17881/#93): nếu Output
   panel báo "No valid oxlint binary found", thêm tường minh vào `.vscode/settings.json`:
   ```json
   "oxc.path.oxlint": "node_modules/.bin/oxlint"
   ```
   Chỉ thêm dòng này NẾU bước test thất bại — không thêm phòng hờ trước khi xác nhận có cần hay
   không (tránh setting thừa gây nhiễu khi review).

## 5. KHÔNG xoá cấu hình Biome trong `.vscode/settings.json` cho tới `p0-07`

Đây là điểm khác với cách trình bày diff ở §2 — thực tế khi thực thi, **giữ song song 2 bộ config**
theo file `[extension].json` riêng để dev có thể quay lại nhanh nếu Oxlint/Prettier IDE integration
có vấn đề chưa lường trước:

- Cân nhắc dùng `git stash`/branch riêng cho thay đổi `.vscode/settings.json` này, KHÔNG merge vào
  `main` cho tới khi `p0-06` xong và test tay §4 pass trên ít nhất 2 máy dev khác nhau (nếu team > 1
  người) — vì `.vscode/settings.json` là **file dùng chung qua git**, ảnh hưởng toàn team ngay khi
  merge, khác với các phase trước chỉ ảnh hưởng CLI cá nhân.

## Verify hoàn tất

- [ ] `.vscode/settings.json` đã đổi `defaultFormatter` → Prettier, `codeActionsOnSave` →
      `source.fixAll.oxc`, xoá/mở rộng `prettier.documentSelectors`.
- [ ] `.vscode/extensions.json` đã tạo với `oxc.oxc-vscode` + `esbenp.prettier-vscode`.
- [ ] Test tay §4 bước 1-4 đều pass thật (không chỉ đọc code, phải thực sự mở IDE bấm save).
- [ ] Output panel không báo lỗi binary/config not found (hoặc đã fix bằng `oxc.path.oxlint` nếu
      cần).
- [ ] Đã thông báo/xin xác nhận với các dev khác trong team trước khi merge thay đổi
      `.vscode/settings.json` (ảnh hưởng toàn team).
