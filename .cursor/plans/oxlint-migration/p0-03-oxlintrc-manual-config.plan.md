# P0-03 — Viết `.oxlintrc.json` tay (KHÔNG dùng `biome-to-oxc`)

> Nguồn: [`00-overview.md`](00-overview.md) §1. Phụ thuộc [`p0-01`](p0-01-typescript-7-upgrade.plan.md)
> (cần TS7 đã cài để bật `--type-aware`). Map trực tiếp từ `biome.json` hiện tại — mọi rule Oxlint
> dưới đây đã **verify tên thật** bằng cách cài `oxlint@1.83.0` vào `/tmp/ts7-test` (hoặc thư mục tạm
> tương đương) và chạy `oxlint --print-config -D all -D nursery --import-plugin --node-plugin
> --react-plugin --nextjs-plugin`, KHÔNG suy đoán từ docs.

## 1. Cấu trúc config đã xác nhận thật

`oxlint --print-config` trả JSON có top-level key: `plugins` (array tên plugin), `categories`,
`rules`, `settings`, `env`, `globals`, `ignorePatterns`. Plugin cần bật (đã verify tên):

```json
{
  "plugins": ["react", "unicorn", "typescript", "oxc", "import", "nextjs", "node"]
}
```

`unicorn`/`typescript`/`oxc` là **default** (không cần khai vẫn bật) — 4 plugin còn lại
(`react`/`import`/`nextjs`/`node`) cần khai tường minh vì repo cần rule của chúng (xem bảng §2).

## 2. Bảng mapping đầy đủ 27 rule khai báo tường minh trong `biome.json`

| Biome rule (severity hiện tại) | Oxlint rule tương ứng | Đã verify | Ghi chú |
|---|---|---|---|
| `style.useBlockStatements` (warn) | **`curly`** (option `"all"`) | ✅ verify tên thật lần 2 (rule ESLint core, Oxlint port sẵn) | Đặt `"curly": ["error", "all"]` — nâng lên `error` vì §6 `code-quality-standards.mdc` ghi "luôn dùng `{}`, không có ngoại lệ", không nên chỉ `warn` |
| `style.noEnum` (error) | **KHÔNG có equivalent** | ✅ verify (0 kết quả khi grep `enum` trong catalog rule cấm khai báo) | Không enforce bằng máy — dựa Cursor rule §5.3 `code-quality-standards.mdc` + review tay. Rủi ro thấp: 0 vi phạm `enum` hiện tại (đã khảo sát ở lần migrate Biome trước) |
| `style.useAsConstAssertion` (error) | `typescript/prefer-as-const` | ✅ | 1-1 |
| `style.useImportType` (error) | `typescript/consistent-type-imports` | ✅ | 1-1, khớp `verbatimModuleSyntax` đã bật ở tsconfig |
| `style.useExportType` (error) | `typescript/consistent-type-exports` | ✅ | 1-1 |
| `style.noNamespace` (error) | `typescript/no-namespace` | ✅ | 1-1 |
| `style.noInferrableTypes` (error) | `typescript/no-inferrable-types` | ✅ | 1-1 |
| `style.noUselessElse` (error) | `no-else-return` | ✅ | Gần tương đương — kiểm tra option `allowElseIf` khi triage diagnostic mới |
| `style.noParameterAssign` (error) | `no-param-reassign` | ✅ | Kiểm tra option `props` (Biome không phân biệt props vs param thường) |
| `style.noNonNullAssertion` (warn) | `typescript/no-non-null-assertion` | ✅ | 1-1 |
| `style.noProcessEnv` (warn) | `node/no-process-env` | ✅ cần plugin `node` | Override tắt ở `apps/*/agent/**` — xem §3 |
| `style.useFilenamingConvention` (warn, kebab-case) | `unicorn/filename-case` | ✅ | Option `{"case": "kebabCase"}` — verify tên option thật khi viết config (không suy đoán) |
| `suspicious.noExplicitAny` (warn) | `typescript/no-explicit-any` | ✅ | Override off ở test files + `*-application/src/infras/**` — xem §3 |
| `suspicious.noConstantBinaryExpressions` (error) | `no-constant-binary-expression` | ✅ | 1-1 |
| `suspicious.noEmptyBlockStatements` (error) | `no-empty` | ✅ | Kiểm tra option `allowEmptyCatch` khi triage |
| `suspicious.noDoubleEquals` (error) | `eqeqeq` | ✅ | 1-1 |
| `suspicious.noConsole` (off) | `no-console` | n/a | Giữ **off** — khớp policy hiện tại (CloudWatch cần `console.*`) |
| `suspicious.noUnknownAtRules` (off) | — | n/a | Rule CSS của Biome — **Oxlint không lint CSS**, bỏ qua hoàn toàn, không cần mapping |
| `suspicious.noImportCycles` (error) | `import/no-cycle` | ✅ cần plugin `import` | 1-1 — bắt buộc giữ `error`, đây là enforce chính cho circular import |
| `suspicious.noUnnecessaryConditions` (warn) | `typescript/no-unnecessary-condition` | ✅ cần `--type-aware` | Hiện có backlog 297 ở mức `warn` (từ lần triage Biome trước) — giữ `warn`, KHÔNG nâng `error` |
| `correctness.noUnusedImports` (error) + `noUnusedVariables` (warn) + `noUnusedFunctionParameters` (warn) | **1 rule duy nhất** `no-unused-vars` | ✅ | Biome tách 3 severity khác nhau, Oxlint gộp 1 rule + options (`args`, `varsIgnorePattern`, `argsIgnorePattern: "^_"`). **Quyết định severity khi gộp: `"error"`** (giữ mức nghiêm nhất của `noUnusedImports`) — chấp nhận đây là siết chặt hơn 1 chút so với 2 rule đang `warn`, review backlog khi triage |
| `performance.noBarrelFile` (**off**) | `oxc/no-barrel-file` | ✅ | Biome đang **off** — Oxlint **on theo default** → PHẢI set tường minh `"oxc/no-barrel-file": "off"` ngay từ bản đầu (275 barrel file hợp lệ, xem analysis §4.1 R3) |
| `performance.noReExportAll` (off) | **KHÔNG tìm thấy equivalent** | ✅ verify (0 kết quả grep `re-?export`) | Đang off ở Biome nên không mất gì — bỏ qua |
| `performance.noDelete` (error) | **KHÔNG có equivalent** | ✅ verify (`no-delete` không tồn tại, `no-delete-var` khác mục đích — cấm `delete` biến, không phải property) | Không enforce bằng máy — dựa review tay. Cân nhắc viết JS plugin riêng NẾU phát sinh vi phạm thật khi audit (chưa cần ngay) |
| `complexity.noUselessTernary` (error) | `no-unneeded-ternary` | ✅ | 1-1 |
| `complexity.useOptionalChain` (error) | `typescript/prefer-optional-chain` | ✅ | 1-1 |
| `complexity.noImportantStyles` (off) | — | n/a | Rule CSS — bỏ qua |
| `nursery.noFloatingPromises` (error) | `typescript/no-floating-promises` | ✅ cần `--type-aware` | **Rule tài chính** — giữ `error` tuyệt đối, xem §4 |
| `nursery.noMisusedPromises` (error) | `typescript/no-misused-promises` | ✅ cần `--type-aware` | Giữ `error` |
| `nursery.useAwaitThenable` (error) | `typescript/await-thenable` | ✅ cần `--type-aware` | Giữ `error` |
| `nursery.useExhaustiveSwitchCases` (error) | `typescript/switch-exhaustiveness-check` | ✅ cần `--type-aware` | Giữ `error` |
| `nursery.useSortedClasses` (on) | **CHUYỂN SANG PRETTIER** (`prettier-plugin-tailwindcss`, format-time) | — | Không map sang Oxlint — xem [`p0-04`](p0-04-prettier-format-cutover.plan.md). Đây là thay đổi UX đã ghi nhận ở analysis §4.2 G4 (mất diagnostic lint-time, chuyển thành auto-fix format-time) |

## 3. Mapping 9 `overrides[]` trong `biome.json` → `.oxlintrc.json` `overrides[]`

Đọc trực tiếp từ `biome.json` hiện tại (dòng 150-231):

| Glob (`includes`) | Biome override | Oxlint override tương ứng |
|---|---|---|
| `**/*.config.ts`, `**/*.config.mts`, `**/*.config.js`, `**/*.config.mjs`, `**/next.config.ts` | tắt `noDefaultExport`, `useFilenamingConvention` | `files`: cùng glob, `rules`: `"import/no-default-export": "off"`, `"unicorn/filename-case": "off"` |
| `**/test/**`, `**/*.test.ts`, `**/*.test.tsx`, `**/*.type-test.ts` | tắt `noExplicitAny`, `noNonNullAssertion`, `useFilenamingConvention`, `noExcessiveCognitiveComplexity` | `"typescript/no-explicit-any": "off"`, `"typescript/no-non-null-assertion": "off"`, `"unicorn/filename-case": "off"`. `noExcessiveCognitiveComplexity` không có trong 27 rule tường minh — kiểm tra Oxlint có rule complexity tương đương (`eslint/complexity` hoặc `sonarjs/cognitive-complexity` qua JS plugin) khi thực thi, nếu không có thì bỏ qua (rule Biome này cũng không nằm trong `rules` tường minh ở `biome.json`, chỉ ở override — có thể là rule `recommended` mặc định) |
| `packages/*/src/**`, `tooling/*/src/**` | **bật** `noDefaultExport` = error | `"import/no-default-export": "error"` |
| `packages/*-application/src/infras/**` | tắt `noExplicitAny` | `"typescript/no-explicit-any": "off"` |
| `apps/api-*/**`, `apps/worker-*/**` | tắt `noConsole`, `noDefaultExport` | `"no-console": "off"` (đã off toàn cục, override dư — có thể bỏ), `"import/no-default-export": "off"` |
| `apps/backoffice/src/app/**` | tắt `noDefaultExport`, `useFilenamingConvention` | `"import/no-default-export": "off"`, `"unicorn/filename-case": "off"` (Next.js App Router bắt buộc default export + tên file quy ước `page.tsx`/`layout.tsx`) |
| `apps/backoffice/**` | `noImgElement`=warn, `noHeadElement`=warn, `noCommonJs`=error, `noArrayIndexKey`=warn | `"nextjs/no-img-element": "warn"`, `"nextjs/no-head-element": "warn"`, `"import/no-commonjs": "error"`, `"react/no-array-index-key": "warn"` — cần plugin `nextjs`+`react`+`import` đã khai ở §1 |
| `apps/*/agent/**` | tắt `noDefaultExport`, `useFilenamingConvention`, `noProcessEnv` | `"import/no-default-export": "off"`, `"unicorn/filename-case": "off"`, `"node/no-process-env": "off"` |
| `apps/backoffice/src/components/ui/**` | tắt HẲN linter+formatter+assist | `files`: cùng glob, `rules`: `{}` rỗng hoặc dùng `ignorePatterns` để loại khỏi lint hoàn toàn (verify cú pháp `ignorePatterns` per-override hay chỉ global khi viết config thật) |
| `packages/*/test/html/**` | tắt HẲN | Tương tự — dùng `ignorePatterns` hoặc override rules rỗng |

**Chú ý khi thực thi:** cú pháp `overrides[].files` (glob) của Oxlint có thể khác cách Biome dùng
`includes` — đọc `oxc.rs/docs/guide/usage/linter/config` để xác nhận field name đúng
(`files`/`includes`) trước khi viết, đừng suy đoán theo cú pháp ESLint cũ.

## 4. Bảo toàn nghiêm ngặt cho code tài chính

Theo `biome-lint-conventions.mdc` mục d: **CẤM** `biome-ignore`/tương đương cho
`noFloatingPromises`/`noMisusedPromises` trong `settle`/`payout`/`financial`/`wallet`/`commission`.
Khi viết `.oxlintrc.json`, **PHẢI**:

- Giữ 4 rule type-aware ở `"error"` toàn cục, KHÔNG hạ xuống `warn` ở bất kỳ override nào.
- KHÔNG thêm override tắt các rule này cho bất kỳ glob nào chứa `settle`/`payout`/`wallet`/
  `financial`/`commission`.
- Sau khi chạy `oxlint` lần đầu, nếu phát sinh diagnostic mới ở các file này → **sửa code thật**
  (`await`/`void` tường minh), KHÔNG dùng `oxlint-disable` để dập lỗi.

## 5. Việc cần làm — thứ tự thực thi

### 5.1. Cài Oxlint làm devDependency thật (không chỉ tạm)

```bash
pnpm add -D -w oxlint@^1.83.0
```

### 5.2. Viết `.oxlintrc.json` ở root theo bảng §2 + §3

Bắt đầu bằng cách dump lại config catalog thật trong chính repo (không dùng thư mục tạm nữa, để
xác nhận version cài vào repo khớp) trước khi viết tay:

```bash
npx oxlint --print-config -D all -D nursery --import-plugin --node-plugin --react-plugin --nextjs-plugin > /tmp/oxlint-full-catalog.json
```

Dùng file này để tra đúng tên option của từng rule (VD option thật của `unicorn/filename-case`,
`no-param-reassign`) trước khi điền vào `.oxlintrc.json` — không suy đoán tên option.

### 5.3. Bật `--type-aware`

Thêm vào `.oxlintrc.json` (verify field tên đúng — `options.typeAware` theo tài liệu đã đọc ở
analysis §3.1, chỉ set được ở **root config**):

```json
{
  "options": { "typeAware": true }
}
```

Cần `pnpm -r build` trước (để có `.d.ts` cho package phụ thuộc) — verify bước này bắt buộc theo
docs Oxlint cho monorepo (analysis §3.1).

### 5.4. Set tường minh `oxc/no-barrel-file: off`

```json
{
  "rules": {
    "oxc/no-barrel-file": "off"
  }
}
```

**Việc này PHẢI làm ở bản config ĐẦU TIÊN**, không phải sau khi CI đỏ — 275 barrel file hợp lệ.

### 5.5. Chạy Oxlint lần đầu, đo baseline

```bash
pnpm -r build
time npx oxlint . 2>&1 | tee /tmp/oxlint-first-run.log
grep -c "error" /tmp/oxlint-first-run.log
```

Ghi thời gian vào `00-overview.md` §6 cột "Sau migrate" dòng "Lint toàn repo".

### 5.6. Triage toàn bộ diagnostic mới

- Với mỗi rule mới phát sinh lỗi mà Biome KHÔNG có (VD nếu Oxlint bắt được case Biome bỏ sót) →
  đọc code thật, quyết định sửa code hay đây là false-positive cần cấu hình lại option.
  **KHÔNG** dùng `oxlint-disable` tràn lan để dập lỗi cho nhanh.
- Đặc biệt kiểm tra kỹ diagnostic ở file chứa `settle`/`payout`/`wallet`/`financial`/`commission`
  (§4) — nếu có floating promise mới lộ ra (Oxlint bắt chặt hơn Biome ở edge case nào), phải sửa
  code, không né bằng ignore.
- So sánh số lượng diagnostic `noUnnecessaryConditions`/`typescript/no-unnecessary-condition` với
  backlog 297 đã biết ở Biome — nếu số lệch nhiều (không phải do gộp/tách rule), điều tra nguyên
  nhân trước khi kết luận "tương đương".

### 5.7. So sánh song song với Biome (chưa tắt Biome)

```bash
pnpm lint      # Biome — vẫn phải xanh
npx oxlint .   # Oxlint — phải xanh sau khi triage xong bước 5.6
```

Cả 2 phải cùng xanh trong giai đoạn này — đây là điều kiện để chuyển sang [`p0-06`](p0-06-scripts-lint-staged-ci-cutover.plan.md).

## Verify hoàn tất

- [ ] `.oxlintrc.json` viết tay xong, map đủ 27 rule (bảng §2) + 9 override (bảng §3).
- [ ] `"oxc/no-barrel-file": "off"` đã set.
- [ ] `--type-aware` bật, `pnpm -r build` chạy trước khi lint không lỗi.
- [ ] `npx oxlint .` chạy 0 error trên toàn repo.
- [ ] 4 rule type-aware tài chính (`no-floating-promises`, `no-misused-promises`,
      `await-thenable`, `switch-exhaustiveness-check`) giữ `error`, KHÔNG bị override tắt ở bất kỳ
      glob tài chính nào.
- [ ] `pnpm lint` (Biome) vẫn xanh song song — chưa tắt Biome.
- [ ] Số liệu thời gian đã ghi vào `00-overview.md` §6.
