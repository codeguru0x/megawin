# P0-03 — Frontend: gộp config backoffice vào root + đưa `packages/ui` khỏi ESLint

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần [p0-01](p0-01-root-biome-config.plan.md) xong trước.

## Mục tiêu

`apps/backoffice` đang có `biome.json` riêng (114 dòng) trùng ~80% với root config sắp tạo. `packages/ui` là consumer ESLint duy nhất còn lại. Xử lý cả hai để đạt **một file config duy nhất** cho toàn monorepo.

## Quyết định kiến trúc: 1 file root, KHÔNG nested config

Hai lựa chọn:

- **(A) Chọn — xoá `apps/backoffice/biome.json`, dồn hết vào root** + override cho phần Next-riêng. Biome CLI tìm config bằng cách đi ngược lên thư mục cha, nên `pnpm --filter @megawin/backoffice lint` (cwd = `apps/backoffice`) vẫn dùng đúng root config. Biome v2 **tự phát hiện domain theo `package.json` từng package** → `next` + `react` tự bật ở backoffice, tự bật `react` ở `packages/ui`, tự tắt ở toàn bộ backend. Không cần khai báo tay.
- (B) Giữ nested config (`"root": false`, `"extends": "//"`). Chỉ nên dùng nếu sau này backoffice cần divergence lớn (vd team riêng, ruleset riêng). Hiện tại divergence chỉ là 5 rule → nested config là chi phí bảo trì vô ích (2 chỗ phải sync `lineWidth`, `quoteStyle`...).

Chọn (A). Nếu về sau cần tách, thêm lại nested config tốn 5 phút.

## Ghi chú: shadcn/ui KHÔNG bắt buộc ESLint

Trả lời dứt điểm câu hỏi "shadcn có dùng Biome được không hay bắt buộc ESLint":

- **shadcn KHÔNG phụ thuộc ESLint.** shadcn/ui không phải library runtime — CLI chỉ **copy source component** (TS/React thuần) vào `src/components/ui/`. Không có peer dependency, không có plugin lint, không có bước lint nào trong CLI. Docs shadcn dùng ESLint trong ví dụ template chỉ vì `create-next-app` mặc định có ESLint — không phải yêu cầu.
- **Bằng chứng ngay trong repo**: `apps/backoffice` đã chạy shadcn + Biome (không ESLint) từ trước migration này — `components.json` + `biome.json` chung sống bình thường.
- Cách xử lý đúng (đã chốt ở p0-02 (1b)): coi `src/components/ui/**` là **generated code** → tắt cả `linter` + `formatter` + `assist`. Lý do không phải "Biome không lint được shadcn" mà là: code generate sẽ bị regenerate khi `shadcn add` — mọi format/fix thủ công đều tạo diff vô nghĩa ở lần regenerate sau. Component **tự viết** dùng shadcn primitives (ngoài thư mục `ui/`) vẫn lint đầy đủ như code thường.

## Thay đổi

### 1. Bổ sung vào `/biome.json` (phần chưa có ở p0-01)

Kéo các setting Tailwind/CSS/HTML từ `apps/backoffice/biome.json` lên root — **cần ở root** vì `packages/ui` cũng có `className` (`money-input.tsx`, `toaster.tsx`) và file CSS (`src/styles/toast.css`):

```jsonc
{
  "formatter": {
    // ... p0-01 ...
    "expand": "auto",
    "useEditorconfig": false
  },
  "linter": {
    "rules": {
      "nursery": {
        "useSortedClasses": {
          "level": "on",
          "options": {
            "attributes": ["className"],
            "functions": ["clsx", "cva", "cn", "twMerge"]
          }
        }
      },
      "suspicious": {
        // ... p0-01 ...
        "noUnknownAtRules": "off"
      },
      "complexity": {
        // ... p0-01 ...
        "noImportantStyles": "off"
      }
    }
  },
  "css": {
    "parser": { "tailwindDirectives": true }
  },
  "html": {
    "formatter": { "indentScriptAndStyle": false, "selfCloseVoidElements": "always" }
  }
}
```

Giải trình:

| Setting | Lý do đặt ở ROOT (không phải chỉ backoffice) |
|---|---|
| `useSortedClasses` + `functions: ["clsx","cva","cn","twMerge"]` | `packages/ui` cũng dùng `cn()`/`className`. Class sort là chuẩn de-facto Tailwind 2026 (thay thế `prettier-plugin-tailwindcss`), giữ diff ổn định và tránh class trùng đè nhau. Vẫn là `nursery` → phải bật tường minh. |
| `css.parser.tailwindDirectives: true` | Tailwind v4 dùng `@theme`, `@custom-variant`, `@source` — không có setting này Biome báo lỗi parse. Cần cho `apps/backoffice/src/app/globals.css` + 3 preset và mọi CSS tương lai ở `packages/ui`. |
| `suspicious/noUnknownAtRules: "off"` | Hệ quả bắt buộc của Tailwind v4 at-rules. |
| `complexity/noImportantStyles: "off"` | Tailwind `!` modifier (`!mt-0`) là hợp lệ, không phải code smell. |
| `formatter.expand: "auto"` | Giữ nguyên hành vi format hiện tại của 1.103 file backoffice → tránh diff. |

### 2. Override cho rule Next-riêng (thêm vào mảng `overrides` của p0-02)

```jsonc
{
  "includes": ["apps/backoffice/**"],
  "linter": {
    "rules": {
      "performance": { "noImgElement": "warn" },
      "style": { "noHeadElement": "warn", "noCommonJs": "error" },
      "suspicious": { "noArrayIndexKey": "warn" }
    }
  }
}
```

Giữ đúng level hiện tại của backoffice (hạ `noImgElement`/`noHeadElement` từ error → warn) để migration **không tạo thêm 1 lỗi mới nào**. Việc siết lên error là backlog riêng, không trộn vào migration.

### 3. Xoá `apps/backoffice/biome.json`

Sau khi verify `biome format --check apps/backoffice` cho 0 diff so với trước.

### 4. `apps/backoffice/package.json`

- Xoá `"@biomejs/biome": "2.5.7"` khỏi `devDependencies` (đã có ở root — bump từ 2.5.5 lên 2.5.7 xảy ra ở p0-01).
- Giữ nguyên script `lint`/`format` (đang gọi `biome`) — vẫn hoạt động qua root config.

### 5. `packages/ui` — rời ESLint

- Xoá `packages/ui/eslint.config.mjs`.
- `packages/ui/package.json`:
  - `"lint": "eslint . --max-warnings 0"` → `"lint": "biome check ."`
  - Xoá `devDependencies`: `"@megawin/eslint-config": "workspace:*"`, `"eslint": "^10.0.2"`.

Không tạo `packages/ui/biome.json`: domain `react` tự bật nhờ `react` trong dependencies; rule library-code (`noDefaultExport: "error"`) đã áp qua override `packages/*/src/**`.

## Rule React đáng chú ý (được domain `react` bật tự động)

Bối cảnh: `apps/backoffice/next.config.ts` có **`reactCompiler: true`**. React Compiler chỉ tối ưu đúng khi code tuân thủ Rules of React — nên các rule dưới đây từ "nice to have" trở thành "bắt buộc":

| Rule | Vai trò khi React Compiler bật |
|---|---|
| `correctness/useExhaustiveDependencies` | Dependency thiếu/sai làm compiler suy luận sai memoization → bug stale value. |
| `correctness/useHookAtTopLevel` | Hook gọi có điều kiện làm compiler bail out toàn component. |
| `correctness/noNestedComponentDefinitions` | Component định nghĩa lồng nhau reset state mỗi render, compiler không cứu được. |
| `correctness/noChildrenProp`, `useJsxKeyInIterable` | Rule React cơ bản, đã trong recommended. |

Mặt khác, vì React Compiler tự memo hoá, **không** thêm rule kiểu "bắt buộc `useMemo`/`memo`" — trái với `vercel-react-best-practices` (§5.5: "If your project has React Compiler enabled, manual memoization is not necessary").

## Acceptance criteria

- `apps/backoffice/biome.json` đã xoá; `pnpm exec biome check apps/backoffice` cho **cùng số diagnostic** như trước khi xoá (so sánh trước/sau bằng cách lưu output).
- `pnpm exec biome format --check apps/backoffice` → 0 file cần format.
- `pnpm exec biome check apps/backoffice/src/app/globals.css` → không lỗi parse `@theme`.
- `pnpm --filter @megawin/ui lint` chạy Biome, exit 0 (hoặc chỉ còn warning đã ghi vào backlog p0-06).
- `rg "eslint" packages/ui` → không còn kết quả.

## Phương án review sau thực thi

**1. Diff review — file được phép đổi:**

```
biome.json                          (bổ sung Tailwind/CSS/HTML settings + override Next)
apps/backoffice/biome.json          (XOÁ)
apps/backoffice/package.json        (xoá dep @biomejs/biome)
packages/ui/eslint.config.mjs       (XOÁ)
packages/ui/package.json            (script lint đổi + xoá 2 dep ESLint)
pnpm-lock.yaml
```

**2. So sánh diagnostic TRƯỚC/SAU xoá nested config (bước quan trọng nhất của plan này):**

```bash
# TRƯỚC khi xoá apps/backoffice/biome.json:
pnpm exec biome check apps/backoffice --reporter=summary > /tmp/before.txt 2>&1
# SAU khi xoá + gộp vào root:
pnpm exec biome check apps/backoffice --reporter=summary > /tmp/after.txt 2>&1
diff /tmp/before.txt /tmp/after.txt
# KỲ VỌNG: 0 khác biệt về số lượng và loại rule. Có khác = root config chưa gộp đủ setting — dò từng rule lệch.
```

**3. Lệnh verify:**

| Lệnh | Kỳ vọng |
|---|---|
| `pnpm exec biome format --check apps/backoffice` | 0 file cần format |
| `pnpm exec biome check apps/backoffice/src/app/globals.css` | không lỗi parse `@theme`/`@custom-variant` |
| `pnpm --filter @megawin/ui lint` | chạy Biome, không phải ESLint |
| `pnpm exec biome check packages/ui 2>&1 \| rg useExhaustiveDependencies` | rule react domain hoạt động ở packages/ui (nếu có vi phạm) |
| `rg -l "eslint" packages/ui` | 0 kết quả |
| `rg '"@biomejs/biome"' -g 'package.json' -g '!node_modules'` | đúng 1 kết quả (root) |

**4. Negative test — domain react auto-detect ở `packages/ui`:** thêm tạm hook gọi trong điều kiện (`if (x) { useState(0); }`) vào 1 component → check → KỲ VỌNG error `useHookAtTopLevel` → revert. Chứng minh domain `react` tự bật KHÔNG cần khai báo.

**5. Rollback:** `git checkout -- biome.json apps/backoffice/ packages/ui/ && pnpm install`.
