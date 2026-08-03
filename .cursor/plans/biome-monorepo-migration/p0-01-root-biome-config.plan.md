# P0-01 — Root `biome.json` + cài Biome ở root

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md)

## Mục tiêu

Tạo nền tảng config duy nhất cho toàn monorepo: 1 file `biome.json` ở root + 1 devDependency duy nhất.

## Thay đổi

### 1. `package.json` (root)

Thêm vào `devDependencies`:

```json
"@biomejs/biome": "2.5.5"
```

**Pin exact version, không dùng caret** — khớp bản đang chạy ở `apps/backoffice` và là best practice: lint rule mới ở minor version có thể làm CI đỏ đột ngột. Cài ở root duy nhất; pnpm đưa `node_modules/.bin` của workspace root vào PATH khi chạy script ở package con nên mọi package vẫn gọi được `biome`.

### 2. Tạo `/biome.json`

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.5.5/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!**/dist", "!**/.next", "!**/.turbo", "!**/.serverless", "!**/coverage", "!**/*.tsbuildinfo"]
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": ["react", "react/**", ":BLANK_LINE:", "next/**", ":BLANK_LINE:", ":PACKAGE:", ":BLANK_LINE:", ":ALIAS:", ":BLANK_LINE:", ":PATH:"]
          }
        }
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 120,
    "attributePosition": "auto",
    "bracketSpacing": true
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSameLine": false
    }
  },
  "json": {
    "formatter": { "trailingCommas": "none" }
  },
  "linter": {
    "enabled": true,
    "domains": {
      "test": "recommended"
    },
    "rules": {
      "recommended": true,

      "style": {
        "useBlockStatements": "warn",
        "noEnum": "error",
        "useAsConstAssertion": "error",
        "useImportType": "error",
        "useExportType": "error",
        "noNamespace": "error",
        "noInferrableTypes": "error",
        "noUselessElse": "error",
        "noParameterAssign": "error",
        "noNonNullAssertion": "warn",
        "noProcessEnv": "warn",
        "useFilenamingConvention": {
          "level": "warn",
          "options": { "strictCase": false, "requireAscii": true, "filenameCases": ["kebab-case"] }
        }
      },

      "suspicious": {
        "noExplicitAny": "warn",
        "noConstantBinaryExpressions": "error",
        "noEmptyBlockStatements": "error",
        "noDoubleEquals": "error",
        "noConsole": "off"
      },

      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "warn",
        "noUnusedFunctionParameters": "warn"
      },

      "performance": {
        "noBarrelFile": "off",
        "noReExportAll": "off",
        "noDelete": "error"
      },

      "complexity": {
        "noUselessTernary": "error",
        "useOptionalChain": "error"
      }
    }
  }
}
```

## Giải trình từng lựa chọn (best practice 2026)

### Formatter

| Option | Giá trị | Lý do |
|---|---|---|
| `lineWidth` | **120** | Khớp `apps/backoffice/biome.json` hiện tại — 1.103 file đã format ở 120. Hạ về 100 (như `.prettierrc`) sẽ reformat lại toàn bộ backoffice thành diff vô nghĩa. |
| `indentStyle: space`, `indentWidth: 2` | | Khớp `.prettierrc` + backoffice hiện tại. Biome default là `tab` → phải khai báo tường minh. |
| `quoteStyle: double`, `semicolons: always`, `trailingCommas: all` | | Khớp `.prettierrc` (`singleQuote: false`, `semi: true`, `trailingComma: "all"`) → không đổi 1 dòng code nào về mặt style. |
| `vcs.useIgnoreFile: true` | | Biome tự tôn trọng `.gitignore` → không phải liệt kê tay `node_modules`/`dist`/`.next`. Đồng thời **mở khoá `--changed`/`--staged`** cho lint-staged và CI incremental (p1-02). |

`files.includes` vẫn khai báo thêm exclude cho `dist`/`.next`/`.turbo` dù `.gitignore` đã có — phòng khi ai đó chạy Biome ở thư mục con nơi `.gitignore` root chưa được resolve.

### Rule bật thêm ngoài `recommended`

| Rule | Level | Lý do |
|---|---|---|
| `style/useBlockStatements` | warn | Tương đương ESLint `curly` ("Same as curly" theo docs Biome). Enforce §6 `code-quality-standards.mdc` vừa chốt. Không nằm trong recommended → phải bật tay. |
| `style/noEnum` | **error** | §5.3 quy định dùng `const object as const` thay `enum`. Khảo sát: **0 enum** trong repo → bật error miễn phí, chặn tái phạm. |
| `style/useAsConstAssertion` | error | Mặt còn lại của §5.3 (đã bật sẵn ở backoffice, nay áp dụng toàn repo). |
| `style/useImportType` + `useExportType` | error | Repo dùng `import type` dày đặc; enforce nhất quán, giúp bundler drop type import an toàn (quan trọng cho Lambda bundle size). Nên bật kèm `verbatimModuleSyntax` ở tsconfig — xem [p1-01](p1-01-typeaware-and-tsconfig.plan.md). |
| `style/noNamespace` | error | Khớp `erasableSyntaxOnly` sẽ bật ở P1; đã có sẵn ở backoffice. |
| `style/noProcessEnv` | warn | Chỉ 20 chỗ, phần lớn đã tập trung ở `env.ts`/`config.ts`. Warn để nudge ~8 chỗ rải rác (`void-draw.ts` ở 5 game package, `api-player/handlers/auth/refresh-token.ts`) về chỗ tập trung. |
| `style/noNonNullAssertion` | warn | `!` che mất lỗi null ở code tài chính. Warn (không error) vì có chỗ dùng hợp lý sau guard. |
| `style/useFilenamingConvention` (kebab-case) | warn | Repo đã 100% kebab-case; rule chốt convention lại để file mới không lệch. `strictCase: false` để không phá tên có phần mở rộng nhiều tầng (`local-storage.client.ts`). |
| `correctness/noUnusedImports` | error | Auto-fix an toàn, giảm bundle. Đây là rule đáng error vì fix được 100% tự động. |
| `correctness/noUnusedVariables` | warn | Có thể có biến giữ lại cố ý (destructure bỏ field) → warn. |
| `suspicious/noDoubleEquals` | error | `==` trong code tính tiền là mìn. `eqeqeq` tương đương. |
| `performance/noDelete` | error | `delete` phá hidden class V8; trong hot path (place-bet/settle) đáng chặn hẳn. |
| `complexity/useOptionalChain`, `noUselessTernary` | error | Auto-fix, giảm noise khi review. |

### Rule CỐ Ý tắt (quan trọng — đừng bật lại)

| Rule | Lý do tắt |
|---|---|
| `performance/noBarrelFile` | Repo có **248** `export * from`; `mongodb.mdc` §6 và `player-sdk-jsdoc.mdc` **bắt buộc** mỗi thư mục có barrel `index.ts`. Bật rule này = chống lại kiến trúc đã chốt. |
| `performance/noReExportAll` | Cùng lý do. Các config best-practice ngoài (vd `dvashim/biome-config`) cũng tắt 2 rule này cho library. |
| `suspicious/noConsole` | 356 chỗ ở backend; `console` → CloudWatch là idiom Lambda chuẩn, repo không có logger abstraction. Frontend đã tự strip qua `compiler.removeConsole`. |

### Domain

`domains.test: "recommended"` — repo dùng Vitest ở mọi package. Bật domain này để có rule như `noFocusedTests` (chặn commit `it.only` làm CI xanh giả) — không tự phát hiện được, phải khai báo tay.

`react`/`next` **không cần khai báo**: Biome v2 đọc `package.json` của từng package trong monorepo và tự bật domain tương ứng → `apps/backoffice` + `packages/ui` được bật, backend tự tắt.

`project`/`types` (type-aware) **để P1** — chúng kích hoạt full scan (index cả `.d.ts` trong `node_modules`), cần đo hiệu năng riêng. Xem [p1-01](p1-01-typeaware-and-tsconfig.plan.md).

## Acceptance criteria

- `pnpm install` xong, `pnpm exec biome --version` in ra `2.5.5`.
- `pnpm exec biome check .` chạy được toàn repo, thời gian < 5s (kỳ vọng ~1-3s cho 3.122 file).
- `pnpm exec biome format --check .` trên `apps/backoffice` cho **0 diff** (chứng minh formatter config khớp bản đang dùng, không gây reformat vô nghĩa).
