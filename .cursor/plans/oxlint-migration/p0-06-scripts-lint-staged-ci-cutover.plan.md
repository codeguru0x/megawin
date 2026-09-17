# P0-06 — Cutover `package.json` Scripts + `lint-staged`

> Nguồn: [`00-overview.md`](00-overview.md) §1. Phụ thuộc [`p0-03`](p0-03-oxlintrc-manual-config.plan.md)
> + [`p0-04`](p0-04-prettier-format-cutover.plan.md) đã chạy sạch song song với Biome. Đây là bước
> **đầu tiên** thay đổi quy trình dùng chung của team (script + git hook) — sau bước này, mọi
> commit mới sẽ chạy qua Oxlint+Prettier thay Biome, nhưng `biome.json`/`@biomejs/biome` **vẫn giữ
> nguyên trong repo** làm phương án rollback tới khi `p0-07`.

## 1. Trạng thái hiện tại (đã đọc thật từ `package.json` + `.husky/`)

```json
"scripts": {
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "format:check": "biome format .",
  "ci": "biome ci .",
  "format:docs": "prettier --write \"**/*.{md,yml,yaml}\"",
  "format:docs:check": "prettier --check \"**/*.{md,yml,yaml}\""
},
"lint-staged": {
  "*.{js,mjs,ts,tsx,json,jsonc,css}": ["biome check --write --no-errors-on-unmatched"],
  "*.{md,yml,yaml}": ["prettier --write"]
}
```

`.husky/pre-commit` chỉ gọi `pnpm exec lint-staged` — không cần đổi file hook, chỉ đổi config
`lint-staged` trong `package.json`. `.husky/post-commit` (GitNexus sync) **không liên quan**, không
đụng tới.

## 2. Scripts mới

```diff
 "scripts": {
-  "lint": "biome check .",
-  "lint:fix": "biome check --write .",
-  "format": "biome format --write .",
-  "format:check": "biome format .",
-  "ci": "biome ci .",
-  "format:docs": "prettier --write \"**/*.{md,yml,yaml}\"",
-  "format:docs:check": "prettier --check \"**/*.{md,yml,yaml}\"",
+  "lint": "oxlint .",
+  "lint:fix": "oxlint . --fix",
+  "format": "prettier --write .",
+  "format:check": "prettier --check .",
+  "ci": "oxlint . && prettier --check .",
 }
```

`format:docs`/`format:docs:check` **xoá hẳn** — đã gộp vào `format`/`format:check` chung vì Prettier
giờ phụ trách toàn bộ (kể cả `.md`/`.yml`/`.yaml`), không cần script riêng cho docs nữa.

**Lưu ý cú pháp `--fix`:** verify cú pháp thật của Oxlint CLI trước khi chốt (`oxlint --fix .` hay
`oxlint . --fix` — thứ tự flag có thể ảnh hưởng parse glob, kiểm tra bằng `oxlint --help` thật khi
thực thi, không suy đoán theo Biome).

## 3. `lint-staged` mới

```diff
 "lint-staged": {
-  "*.{js,mjs,ts,tsx,json,jsonc,css}": ["biome check --write --no-errors-on-unmatched"],
-  "*.{md,yml,yaml}": ["prettier --write"]
+  "*.{ts,tsx,js,mjs,json,jsonc,css,md,yml,yaml}": ["prettier --write"],
+  "*.{ts,tsx,js,mjs}": ["oxlint --fix"]
 }
```

Thứ tự 2 entry: `lint-staged` chạy TUẦN TỰ theo thứ tự khai báo cho **cùng 1 file** nếu file đó
match cả 2 pattern (VD `foo.ts` match cả 2 dòng) — Prettier format trước, Oxlint fix sau (khớp
quyết định thứ tự ở [`p0-05`](p0-05-ide-editor-integration.plan.md) §1). Verify hành vi thật của
`lint-staged@^17.5.1` (đã có sẵn) bằng cách đọc docs version cụ thể, KHÔNG suy đoán theo version cũ.

## 4. Cập nhật `.cursor/rules/biome-lint-conventions.mdc`

Đây là **rule always-applied**, ảnh hưởng mọi task agent sau này — PHẢI đổi đồng bộ, không để rule
cũ dẫn agent gọi lệnh `biome` sau khi đã cutover:

- Đổi toàn bộ bảng lệnh chuẩn (mục b) → `oxlint .`/`oxlint --fix .`/`prettier --write .`/
  `prettier --check .`/`oxlint . && prettier --check .`.
- Đổi chính sách suppression (mục d) → `oxlint-disable-next-line <rule>: <lý do>` (verify cú pháp
  suppression thật của Oxlint — có thể khác `// eslint-disable-next-line` classic, kiểm tra khi
  thực thi, không suy đoán).
- Đổi bảng convention (mục e) → tên rule Oxlint tương ứng theo bảng mapping đã có ở
  [`p0-03`](p0-03-oxlintrc-manual-config.plan.md) §2.
- **Cân nhắc đổi tên file** `biome-lint-conventions.mdc` → `oxlint-lint-conventions.mdc` (tên file
  nên khớp nội dung) — nếu đổi tên, kiểm tra không có file khác `.mdc` reference chéo tên cũ
  (`rg "biome-lint-conventions" .cursor/rules/`).

## 5. Việc cần làm — thứ tự thực thi

1. Sửa `package.json` theo §2 + §3.
2. Sửa `.cursor/rules/biome-lint-conventions.mdc` theo §4.
3. Chạy verify:
   ```bash
   pnpm lint            # phải xanh (oxlint .)
   pnpm format:check    # phải xanh (prettier --check .)
   pnpm ci              # phải xanh (cả 2)
   ```
4. Test `lint-staged` thật — không tin script đúng chỉ vì đọc JSON hợp lệ:
   ```bash
   # Tạo 1 thay đổi nhỏ cố tình sai style trong 1 file .ts đã track bởi git
   git add <file>
   pnpm exec lint-staged   # verify chạy đúng, tự fix, không lỗi
   ```
5. Commit thật 1 lần (sau khi mọi verify pass) để xác nhận `.husky/pre-commit` chạy đúng luồng mới
   qua git hook thật (không chỉ chạy `lint-staged` trực tiếp).

## KHÔNG làm ở phase này

- KHÔNG xoá `biome.json`, `@biomejs/biome` — giữ nguyên làm rollback path.
- KHÔNG đụng `.husky/post-commit` (GitNexus sync) — không liên quan.
- KHÔNG đụng CI pipeline (`.github/workflows`) — repo chưa có.

## Rollback nếu phát sinh vấn đề sau khi merge

```bash
git revert <commit-này>
# hoặc sửa tay package.json về lại biome check/format, không cần pnpm install (không đổi dependency)
```

## Verify hoàn tất

- [ ] `package.json` scripts đổi đủ theo §2, xoá `format:docs`/`format:docs:check`.
- [ ] `lint-staged` config đổi theo §3, thứ tự Prettier trước Oxlint sau.
- [ ] `.cursor/rules/biome-lint-conventions.mdc` cập nhật nội dung (hoặc đổi tên file) khớp Oxlint +
      Prettier.
- [ ] `pnpm lint` / `pnpm format:check` / `pnpm ci` đều xanh.
- [ ] `pnpm exec lint-staged` test tay pass trên 1 file thay đổi thật.
- [ ] 1 commit thật đã chạy qua `.husky/pre-commit` mới, xác nhận git hook hoạt động đúng.
