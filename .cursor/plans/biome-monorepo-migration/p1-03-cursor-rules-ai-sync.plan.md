# P1-03 — Đồng bộ Cursor rules với chuẩn Biome (AI sync)

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md).
> Cần [p0-06](p0-06-full-repo-pass.plan.md) xong trước (rule set + backlog đã chốt bằng số thật).
> Chạy song song được với p1-01/p1-02; cập nhật bổ sung sau khi p1-01 bật type-aware.

## Vấn đề

Migration Biome chỉ giải quyết tầng **tool**. Nhưng phần lớn code trong repo này do AI (Cursor agent)
sinh ra — nếu `.cursor/rules/` không mô tả chuẩn lint mới, AI sẽ tiếp tục sinh code theo thói quen cũ
rồi để Biome sửa sau (hoặc tệ hơn: tự thêm `biome-ignore`, tự tạo `biome.json` per-package, tự hạ rule).
Vòng lặp "AI viết sai → lint báo → AI sửa" tốn context và tạo diff bẩn.

Mục tiêu: **AI sinh code đúng convention ngay từ đầu** — Cursor rule là lớp chặn TĨNH trước cả pre-commit
hook (cùng mô hình 3 lớp như `test-data-safety.mdc`).

## Thay đổi

### 1. Tạo `.cursor/rules/biome-lint-conventions.mdc` (alwaysApply: true)

Nội dung bắt buộc có (viết theo phong cách các rule hiện hữu — tiếng Việt, thuật ngữ tiếng Anh, có ví dụ ĐÚNG/SAI):

**a. Kiến trúc config — MỘT file duy nhất:**
- Toàn repo dùng **một** `/biome.json` root. **CẤM** tạo `biome.json` per-package, `.eslintrc`, `eslint.config.*` mới.
- Package/app mới KHÔNG cần thêm gì để được lint — root config + domain auto-detect tự phủ.
- Khác biệt theo loại package xử lý bằng `overrides[].includes` trong root config — sửa ở đó, kèm giải trình.

**b. Lệnh chuẩn (AI phải dùng đúng các lệnh này, không bịa lệnh khác):**

| Việc | Lệnh |
|---|---|
| Lint + format check toàn repo | `pnpm lint` (= `biome check .`) |
| Auto-fix an toàn | `pnpm lint:fix` (= `biome check --write .`) |
| Format | `pnpm format` (= `biome format --write .`) |
| Docs (md/yml) | `pnpm format:docs` (Prettier — Biome chưa hỗ trợ Markdown/YAML) |
| CI | `pnpm ci` (= `biome ci .` — không bao giờ ghi file) |

**c. Phân giới tool:** Biome = `.ts/.tsx/.js/.mjs/.json/.css`; Prettier = CHỈ `.md/.yml/.yaml`.
KHÔNG chạy Prettier lên file TS (đã chặn bằng `.prettierignore`, nhưng AI cũng không được gợi ý).

**d. Chính sách suppression — phần quan trọng nhất với AI:**
- `biome-ignore` chỉ được dùng dạng đầy đủ: `// biome-ignore lint/<group>/<rule>: <lý do cụ thể>` —
  Biome 2.x bắt buộc phần giải thích; lý do phải nói VÌ SAO chỗ này là ngoại lệ hợp lệ, không viết "fix later".
- **CẤM** `biome-ignore-all` (file-level) trừ file generated.
- **CẤM** hạ level rule trong `biome.json` để làm sạch output — rule chỉ đổi level qua review có giải trình
  (nguyên tắc đã chốt ở p0-06). Warning nhiều → ghi backlog, không tắt rule.
- **CẤM** `biome-ignore` cho `noFloatingPromises` trong code tài chính (`settle`, `payout`, `financial`) —
  vi phạm ở đó phải fix thật (nguyên tắc từ p1-01).

**e. Convention Biome enforce — để AI viết đúng từ đầu (map với `code-quality-standards.mdc`):**

| Convention | Rule Biome | Nguồn |
|---|---|---|
| Luôn `{}` cho if/else/for | `style/useBlockStatements` | §6 code-quality |
| `const object as const`, không `enum` | `style/noEnum` + `useAsConstAssertion` | §5.3 code-quality |
| `import type` / `export type` tách bạch | `style/useImportType`/`useExportType` | p0-01 |
| File mới đặt tên kebab-case | `style/useFilenamingConvention` | hiện trạng 100% repo |
| Named export cho library (`packages/*/src`, `tooling/*/src`) | `style/noDefaultExport` (override) | p0-02 |
| `===`, không `==` | `suspicious/noDoubleEquals` | p0-01 |
| Không `delete obj.x` trong hot path | `performance/noDelete` | p0-01 |
| Import gộp đầu file, tự sort theo groups | assist `organizeImports` | §7 code-quality |
| Barrel `export * from` là HỢP LỆ (rule tắt có chủ đích) | `noBarrelFile`/`noReExportAll` OFF | mongodb.mdc §6 |
| `console.*` hợp lệ ở backend (CloudWatch) | `noConsole` OFF | p0-01 |
| `any` được phép DUY NHẤT ở `*-application/src/infras/**` và test | override p0-02 | mongodb.mdc §5 |

**f. Checklist cho AI trước khi kết thúc task có sửa code:** chạy `pnpm lint` trên phạm vi đã sửa
(hoặc `biome check <paths>`), fix hết error; warning mới phát sinh phải nêu trong summary.

### 2. Cập nhật rule hiện hữu bị stale

- `.cursor/rules/code-quality-standards.mdc` §6 "Lưu ý hạ tầng" — đã sửa ở [p0-05](p0-05-retire-eslint.plan.md);
  verify lại lần cuối ở đây: mọi mention `tooling/eslint-config`, "package chưa có lint" phải được thay bằng
  "Biome enforce toàn repo qua root `biome.json`".
- Grep toàn bộ `.cursor/rules/*.mdc` tìm `eslint|prettier` — cập nhật những chỗ mô tả sai hiện trạng tooling
  (giữ nguyên các mention lịch sử trong `.cursor/plans/`, `.cursor/analysis/`).

### 3. Cập nhật sau p1-01 (đợt 2, nhỏ)

Khi type-aware bật: bổ sung vào rule mục (e) các convention mới — "mọi Promise phải await/void tường minh"
(`noFloatingPromises`), "switch trên union phải exhaustive" (`useExhaustiveSwitchCases`), và 4 compiler flag
mới của `tooling/typescript-config/base.json` (đặc biệt `noImplicitOverride`: method override base class
phải ghi `override`).

## Acceptance criteria

- `.cursor/rules/biome-lint-conventions.mdc` tồn tại, `alwaysApply: true`, đủ 6 mục (a)–(f).
- `rg -l "tooling/eslint-config" .cursor/rules/` → 0 kết quả.
- Smoke test AI: mở chat mới, yêu cầu tạo 1 module mới trong `packages/shared` — code sinh ra pass
  `biome check` ngay lần đầu (đúng kebab-case, named export, import type, `{}` đầy đủ).

## Phương án review sau thực thi

**1. Diff review — file được phép đổi:** chỉ `.cursor/rules/*.mdc` (1 file mới + các file sửa mention stale). KHÔNG đụng code/config.

**2. Verify nội dung rule mới khớp config THẬT (chống rule mô tả sai tooling):**

```bash
# Mỗi rule Biome nêu trong bảng (e) phải tồn tại trong biome.json với đúng level:
rg -o '"(useBlockStatements|noEnum|useImportType|useFilenamingConvention|noDefaultExport|noDoubleEquals|noDelete)"' biome.json
# Mỗi lệnh nêu trong bảng (b) phải tồn tại trong package.json root:
rg '"(lint|lint:fix|format|format:docs|ci)":' package.json
```

**3. Smoke test AI (3 kịch bản, chat mới không context):**

| Kịch bản | Kỳ vọng |
|---|---|
| "Tạo helper mới trong packages/shared tính X" | file kebab-case, named export, `import type`, pass `biome check` lần đầu |
| "Fix warning noExplicitAny trong file Y" | AI sửa type thật, KHÔNG thêm `biome-ignore`, KHÔNG hạ rule trong biome.json |
| "Setup lint cho package mới Z" | AI trả lời KHÔNG cần config gì thêm — root config tự phủ; không tạo biome.json/eslintrc mới |

**4. Rollback:** revert file `.mdc` — không có side effect nào khác.
