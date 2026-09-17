# P0-04 — Cutover Formatter: Biome + Prettier(docs) → Prettier duy nhất

> Nguồn: [`00-overview.md`](00-overview.md) §1. Độc lập với `p0-01`/`p0-03` — có thể làm song song.
> KHÔNG dùng Oxfmt (còn beta, xem analysis §4.2 G1).

## Bằng chứng đã verify thật (npm view, không suy đoán)

| Package | Version | Cập nhật gần nhất | Ghi chú |
|---|---|---|---|
| `prettier` | `^3.9.6` (đã có sẵn trong repo, dùng cho docs) | — | Giữ nguyên, mở rộng phạm vi dùng |
| `@ianvs/prettier-plugin-sort-imports` | `4.7.1` | 04/02/2026 | Peer `prettier: "2 \|\| 3 \|\| ^4.0.0-0"` — khớp bản đang dùng. Bù đủ gap G2 (Oxfmt không sort specifier trong `{}`) + G3 (custom group order) |
| `prettier-plugin-tailwindcss` | `0.8.1` | 01/09/2026 (2 tuần trước phiên nghiên cứu) | Chính chủ Tailwind Labs, `peerDependenciesMeta` liệt kê tường minh tương thích `@ianvs/prettier-plugin-sort-imports` — đúng combo khuyến nghị chính thức |

## 1. Cấu hình `.prettierrc` mới — map từ `biome.json` hiện tại

So sánh field-by-field với `javascript.formatter`/`formatter` trong `biome.json` (dòng 53-73):

| Biome (`biome.json`) | Giá trị | Prettier tương ứng |
|---|---|---|
| `formatter.indentStyle` + `indentWidth` | `space`, `2` | `"useTabs": false, "tabWidth": 2` |
| `formatter.lineWidth` | `120` | `"printWidth": 120` (hiện `.prettierrc` đang để `100` — PHẢI đổi) |
| `formatter.lineEnding` | `lf` | `"endOfLine": "lf"` (đã khớp) |
| `javascript.formatter.quoteStyle` | `double` | `"singleQuote": false` (đã khớp) |
| `javascript.formatter.semicolons` | `always` | `"semi": true` (đã khớp) |
| `javascript.formatter.trailingCommas` | `all` | `"trailingComma": "all"` (đã khớp) |
| `javascript.formatter.arrowParentheses` | `always` | `"arrowParens": "always"` (đã khớp) |
| `javascript.formatter.bracketSameLine` | `false` | `"bracketSameLine": false` (thêm mới) |
| `javascript.formatter.quoteProperties` | `asNeeded` | `"quoteProps": "as-needed"` (thêm mới) |
| `json.formatter.trailingCommas` | `none` | Prettier tự xử lý đúng theo spec JSON, không cần field riêng |
| `assist...organizeImports.options.groups` | custom 6 group | `importOrder` của `@ianvs/prettier-plugin-sort-imports` — xem §2 |
| `nursery.useSortedClasses.options` | `attributes: ["className"]`, `functions: ["clsx","cva","cn","twMerge"]` | `tailwindAttributes`/`tailwindFunctions` của `prettier-plugin-tailwindcss` — xem §3 |

### `.prettierrc` đầy đủ sau khi sửa:

```json
{
  "plugins": ["@ianvs/prettier-plugin-sort-imports", "prettier-plugin-tailwindcss"],
  "semi": true,
  "singleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2,
  "arrowParens": "always",
  "bracketSameLine": false,
  "endOfLine": "lf",
  "proseWrap": "preserve",
  "importOrder": [
    "^react$",
    "^react/(.*)$",
    "",
    "^next/(.*)$",
    "",
    "<THIRD_PARTY_MODULES>",
    "",
    "^@/(.*)$",
    "^#(.*)$",
    "",
    "^[./]"
  ],
  "importOrderTypeScriptVersion": "7.0.2",
  "tailwindAttributes": ["className"],
  "tailwindFunctions": ["clsx", "cva", "cn", "twMerge"]
}
```

**Lưu ý quan trọng đã verify — KHÔNG phải mọi app dùng cùng alias `@/*`:**

Đã kiểm tra thật `paths` của cả 3 app có `tsconfig.json` riêng (analysis §2.2 chỉ nói "3 app có
`paths` riêng", không xác nhận chúng giống nhau — kiểm tra kỹ ở phase này mới lộ ra khác biệt):

| App | `paths` thật | Alias pattern |
|---|---|---|
| `apps/backoffice/tsconfig.json` | `"@/*": ["./src/*"]` | `@/` |
| `apps/api-player/tsconfig.json` | `"#lib/*": ["./src/lib/*"]`, `"#test/*": ["./test/*"]` | `#` (Node.js subpath imports style) |
| `apps/api-tenant/tsconfig.json` | `"#test/*": ["./test/*"]` | `#` |

Vì `.prettierrc` là **1 file root duy nhất** (không nested), pattern `"^#(.*)$"` đã thêm vào cùng
nhóm `:ALIAS:` để phủ cả 2 kiểu alias. Khi thực thi P0-04, **PHẢI** review diff thật trên ít nhất 1
file `apps/api-player` có import `#lib/*` để xác nhận nó rơi đúng group alias, không lẫn vào
`<THIRD_PARTY_MODULES>` (vì `#` có thể bị hiểu nhầm là scoped package nếu regex viết sai).

## 2. Import order — verify PHẢI làm trước khi tin cấu hình đúng

`@ianvs/prettier-plugin-sort-imports` xử lý **cả 2 việc cùng lúc** (khác Oxfmt — bù đủ gap G2):
sort thứ tự statement theo `importOrder`, VÀ sort specifier trong `{ }` theo alphabet
(`ignoreDeclarationSort`/`ignoreCase` là option để tinh chỉnh nếu cần, KHÔNG cần ép buộc mặc định
đã đúng ý — verify bằng cách chạy trên 1 file thật có nhiều import trước khi áp toàn repo).

## 3. Tailwind class sort — verify PHẢI làm trước khi tin cấu hình đúng

`prettier-plugin-tailwindcss` cần trỏ đúng theme Tailwind — kiểm tra `apps/backoffice` dùng
Tailwind v4 (CSS-first config, không có `tailwind.config.ts` truyền thống) → xác nhận plugin đọc
đúng theme từ `src/app/globals.css` (theo `components.json` đã xác nhận `"css": "src/app/globals.css"`
trong phiên nghiên cứu trước) mà không cần thêm option `tailwindConfig` (Tailwind v4 tự động
discover qua PostCSS, verify bằng cách chạy thật trên 1 file JSX của `apps/backoffice`).

## 4. `.prettierignore` — mở rộng phạm vi

Hiện tại đang **loại trừ** `*.ts`/`*.tsx`/`*.js`/`*.mjs`/`*.json`/`*.css` (comment "Biome quản format
cho các loại file này"). Xoá đoạn này — Prettier giờ sở hữu toàn bộ:

```diff
- # Biome quản format cho các loại file này — Prettier chỉ lo .md/.yml/.yaml
- *.ts
- *.tsx
- *.js
- *.mjs
- *.json
- *.css
```

Giữ nguyên phần trên (`node_modules`, `.next`, `dist`, `.turbo`, `.serverless`, `pnpm-lock.yaml`,
`coverage`, `.env*`, `docs`, `release`, `.gitignore`, `.cursorrules`, `.vscode`, `.cursor`,
`.gitnexus`) — không đổi.

**Thêm mới:** `apps/backoffice/src/components/ui/**` và `packages/*/test/html/**` — 2 glob hiện
đang **tắt hẳn** format ở Biome (`biome.json` dòng 220-230, generated shadcn components + test
fixture HTML) — phải giữ nguyên hành vi này ở Prettier, không format lại component đã generate.

## 5. Việc cần làm — thứ tự thực thi

### 5.1. Cài plugin

```bash
pnpm add -D -w prettier-plugin-tailwindcss@^0.8.1 @ianvs/prettier-plugin-sort-imports@^4.7.1
```

### 5.2. Sửa `.prettierrc` theo §1, `.prettierignore` theo §4

### 5.3. Chạy thử trên 3 file đại diện TRƯỚC khi chạy toàn repo

Chọn 3 file khác archetype nhất, xem diff bằng mắt:

```bash
npx prettier --write packages/game-keno-application/src/use-cases/settle/calculate-financials.ts
npx prettier --write apps/backoffice/src/app/\(main\)/games/keno/operations-hub/_lib/sections/queue/hub-queue-table.tsx
npx prettier --write apps/worker-keno/src/handler.ts
npx prettier --write apps/api-player/src/lib/*.ts   # xác nhận alias `#lib/*` sort đúng group
git diff -- packages/game-keno-application/src/use-cases/settle/calculate-financials.ts \
           'apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/sections/queue/hub-queue-table.tsx' \
           apps/worker-keno/src/handler.ts \
           apps/api-player/src/lib
```

Review kỹ: import order đúng theo `:ALIAS:`/`:PACKAGE:` như Biome cũ không, class Tailwind trong
`className` có sort không, comment `//` có bị đụng không (không nên đụng — cả 2 tool đều chỉ format
code, không rewrite comment).

Nếu diff SAI (VD group alias/package lẫn nhau) → sửa `importOrder` ở §1, chạy lại, KHÔNG chạy toàn
repo khi 3 file mẫu chưa đúng.

### 5.4. Chạy toàn repo, review diff theo archetype

```bash
git stash   # đảm bảo working tree sạch trước khi chạy để diff rõ ràng
npx prettier --write .
git diff --stat | tail -5   # xem tổng số file bị đổi
```

Review **ít nhất 1 file mỗi archetype** (không chỉ 3 file ở §5.3):
game package tài chính, Next.js app route, worker Lambda, library `packages/shared`, file `.md`,
file `.yml` (CI config nếu có), `package.json`.

### 5.5. Đo thời gian, so sánh baseline Biome

```bash
time npx prettier --check .
```

So với thời gian `biome format .` (Biome cũ) — ghi vào `00-overview.md` §6.

### 5.6. KHÔNG cutover `package.json` scripts ở phase này

Giữ `"format": "biome format --write ."` như cũ — việc đổi script thuộc
[`p0-06`](p0-06-scripts-lint-staged-ci-cutover.plan.md), sau khi cả `p0-03` và `p0-04` đã soak-test
song song với Biome.

## Verify hoàn tất

- [ ] `.prettierrc` đã map đủ field theo bảng §1, `printWidth: 120` (không còn `100`).
- [ ] `.prettierignore` đã bỏ exclude `.ts/.tsx/.js/.mjs/.json/.css`, giữ nguyên phần khác, thêm 2
      glob "tắt hẳn" từ Biome override.
- [ ] 3 file mẫu ở §5.3 review đúng import order + Tailwind sort bằng mắt.
- [ ] `npx prettier --check .` xanh toàn repo sau khi chạy `--write` 1 lần.
- [ ] Diff toàn repo đã review theo archetype (§5.4), không có thay đổi logic (chỉ format).
- [ ] `package.json` scripts CHƯA đổi (vẫn dùng Biome cho `format`/`format:docs`) — chờ `p0-06`.
- [ ] Số liệu thời gian đã ghi vào `00-overview.md` §6.
