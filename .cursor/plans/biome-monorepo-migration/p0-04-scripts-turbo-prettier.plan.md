# P0-04 — Scripts root, Turbo task, thu hẹp Prettier

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần [p0-01](p0-01-root-biome-config.plan.md).

## Vấn đề đang tồn tại (cần sửa, không chỉ migrate)

1. **Prettier và Biome đang đánh nhau**: root `.prettierrc` có `printWidth: 100`, `apps/backoffice/biome.json` có `lineWidth: 120`. Script root `pnpm format` chạy Prettier trên `**/*.{ts,tsx,...}` → reformat lại 1.103 file backoffice về 100 cột; ai chạy `biome format` sau đó lại đưa về 120. Đây là churn vô hạn, phải chấm dứt.
2. `turbo run lint` chỉ chạm được 3 package (`backoffice`, `ui`, `game-lotto535-application`), trong đó `game-lotto535-application` **hỏng** (`eslint` không được cài) → `pnpm lint` ở root hiện fail hoặc bỏ qua 40 package.

## Thay đổi

### 1. `package.json` (root) — scripts

```jsonc
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "check-types": "turbo run check-types",

    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "ci": "biome ci .",

    "format:docs": "prettier --write \"**/*.{md,yml,yaml}\"",
    "format:docs:check": "prettier --check \"**/*.{md,yml,yaml}\""
  }
}
```

Giải trình:

| Script | Best practice |
|---|---|
| `lint` = `biome check .` | `check` = format + lint + import sort trong **một lần đọc file**. Đây là khuyến nghị chính thức của Biome ("use `biome check` as your single command"). Không đi qua Turbo: 1 process duyệt 3.122 file mất ~1-3s, nhanh hơn overhead orchestration + cache của Turbo. |
| `ci` = `biome ci .` | `biome ci` **không bao giờ ghi file**, exit code rõ ràng, output tối ưu cho log CI. Dùng đúng subcommand này trong pipeline (xem [p1-02](p1-02-ci-and-git-hooks.plan.md)) thay vì `check --write`. |
| `format:docs` chỉ còn `md,yml,yaml` | Biome 2.5 chưa format Markdown/YAML → giữ Prettier đúng phần đó. Bỏ `ts,tsx,js,mjs,json,css` khỏi glob Prettier để chấm dứt xung đột 100 vs 120 cột. |

### 2. `turbo.json` — xoá task `lint`

```jsonc
// XOÁ khối này
"lint": {
  "dependsOn": ["^lint"]
}
```

Lý do: task `lint` với `dependsOn: ["^lint"]` buộc chờ lint của dependency chạy trước — vô nghĩa với Biome (lint không cần build artifact của package khác). Giữ `check-types` trong Turbo vì `tsc --noEmit` **thực sự** cần `.d.ts` của dependency và **thực sự** đáng cache.

Nếu vẫn muốn `pnpm lint` chạy được từ bất kỳ package (DX), giữ script `lint` per-package = `biome check .` — Biome tự tìm root config bằng cách đi ngược lên thư mục cha.

### 3. `packages/game-lotto535-application/package.json`

Xoá script hỏng:

```json
"lint": "eslint . --max-warnings 0"
```

Package này không có `eslint` dependency lẫn config → script này chưa từng chạy được. Không thêm lại script `lint` (root command đã bao phủ), giữ package.json nhất quán với 40 package cùng loại.

### 4. `.prettierrc` — giữ nguyên, thêm ghi chú scope

Không đổi giá trị (`printWidth: 100` cho Markdown là hợp lý). Chỉ cần **scope** được siết ở script (mục 1). Cân nhắc thêm `"proseWrap": "preserve"` để Prettier không tự bọc dòng văn xuôi trong `.md` (giữ diff nhỏ khi sửa docs — repo có rất nhiều `.mdc`/`.md` dài).

### 5. `.prettierignore` — bổ sung

Thêm để chặn Prettier vô tình chạm vào phần Biome quản:

```
*.ts
*.tsx
*.js
*.mjs
*.json
*.css
```

Đây là lớp phòng thủ thứ hai (ngoài glob ở script): nếu ai chạy `prettier --write .` trực tiếp thì cũng không phá format của Biome.

Lưu ý `.prettierignore` hiện đã ignore `docs` và `.cursor` — nghĩa là `format:docs` **không** chạm tới `docs/**` và `.cursor/**`. Giữ nguyên (docs/plans đang được viết tay có chủ đích, không muốn Prettier reflow bảng Markdown).

### 6. `.vscode/settings.json` — DX (khuyến nghị thêm mới)

```jsonc
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "[markdown]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[yaml]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "typescript.preferences.preferTypeOnlyAutoImports": true
}
```

`preferTypeOnlyAutoImports` là mảnh ghép còn thiếu của `style/useImportType`: nó khiến auto-import của TS server sinh sẵn `import type`, thay vì để Biome phải báo lỗi rồi mới fix. Đây là khuyến nghị nằm ngay trong docs của rule `useImportType`.

## Acceptance criteria

- `pnpm lint` ở root chạy Biome trên toàn repo, không còn dính `eslint: command not found`.
- `pnpm format:docs:check` chỉ liệt kê file `.md`/`.yml`/`.yaml`.
- Chạy `pnpm format:docs` rồi `pnpm format:check` → **0 file** cần format lại (chứng minh Prettier và Biome không còn chồng lấn).
- `rg '"lint"' turbo.json` → không còn kết quả.
