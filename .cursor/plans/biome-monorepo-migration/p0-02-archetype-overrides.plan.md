# P0-02 — Overrides theo archetype package

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần [p0-01](p0-01-root-biome-config.plan.md) xong trước.

## Mục tiêu

Mỗi loại package trong monorepo có yêu cầu khác nhau (Next.js app vs Lambda handler vs domain package thuần vs SDK publish). Thay vì 43 file config, dùng **một mảng `overrides` trong root `biome.json`** — glob theo archetype.

## Ma trận archetype

| # | Archetype | Đường dẫn | File | Đặc thù cần config |
|---|---|---|---|---|
| 1 | Next.js App Router | `apps/backoffice` | 1.103 | Default export bắt buộc cho page/layout/route; Tailwind class sort; shadcn generated code; React Compiler bật |
| 2 | React component library | `packages/ui` | 10 | React domain (auto-detect), không có Next |
| 3 | Node/Lambda handler | `apps/api-*`, `apps/worker-*` | ~235 | `console` → CloudWatch; không DOM; không React |
| 4 | Domain package thuần | `packages/game-{keno,bingo18,max3d,max3dpro,lotto535,mega645,power655}`, `game-core`, `shared`, `identity`, `auth`, `data`, `cache`, `audit`, `http-client`, `tenant-*`, `worker-core`, `next` | ~340 | Strictest: named export only, không I/O, pure logic |
| 5 | Application layer | `packages/game-*-application`, `identity-application`, `game-core-application` | ~1.160 | `(r: any)` trong aggregate mapping được `mongodb.mdc` endorse |
| 6 | SDK publish ra ngoài | `packages/player-sdk` | 55 | Barrel entry là API contract; JSDoc là sản phẩm (TypeDoc) |
| 7 | Config + test files | `**/*.config.ts`, `**/test/**`, `**/*.test.ts`, `**/*.type-test.ts` | ~200 | Default export bắt buộc; test cần `any`/magic number thoải mái |

## Overrides đề xuất (thêm vào cuối `/biome.json`)

```jsonc
{
  // ... phần đã định nghĩa ở p0-01 ...
  "overrides": [
    // ── (7a) Config files: bắt buộc default export ────────────────────────────
    {
      "includes": ["**/*.config.ts", "**/*.config.mts", "**/*.config.js", "**/*.config.mjs", "**/next.config.ts"],
      "linter": {
        "rules": {
          "style": { "noDefaultExport": "off", "useFilenamingConvention": "off" }
        }
      }
    },

    // ── (7b) Test files: nới rule gây noise, giữ rule bắt bug thật ────────────
    {
      "includes": ["**/test/**", "**/*.test.ts", "**/*.test.tsx", "**/*.type-test.ts"],
      "linter": {
        "rules": {
          "suspicious": { "noExplicitAny": "off" },
          "style": { "noNonNullAssertion": "off", "useFilenamingConvention": "off" },
          "complexity": { "noExcessiveCognitiveComplexity": "off" }
        }
      }
    },

    // ── (4)(6) Library code: CHỈ named export ────────────────────────────────
    {
      "includes": ["packages/*/src/**"],
      "linter": {
        "rules": {
          "style": { "noDefaultExport": "error" }
        }
      }
    },

    // ── (5) Application layer: repos/mappers được dùng `any` cho aggregate ───
    {
      "includes": ["packages/*-application/src/infras/**"],
      "linter": {
        "rules": {
          "suspicious": { "noExplicitAny": "off" }
        }
      }
    },

    // ── (3) Lambda handler: console là kênh log chính thức ───────────────────
    {
      "includes": ["apps/api-*/**", "apps/worker-*/**"],
      "linter": {
        "rules": {
          "suspicious": { "noConsole": "off" },
          "style": { "noDefaultExport": "off" }
        }
      }
    },

    // ── (1) Next.js App Router: page/layout/route BẮT BUỘC default export ────
    {
      "includes": ["apps/backoffice/src/app/**"],
      "linter": {
        "rules": {
          "style": { "noDefaultExport": "off", "useFilenamingConvention": "off" }
        }
      }
    },

    // ── (1b) shadcn generated components: không lint, không format ───────────
    {
      "includes": ["apps/backoffice/src/components/ui/**"],
      "linter": { "enabled": false },
      "formatter": { "enabled": false }
    }
  ]
}
```

## Giải trình từng archetype

### (1) Next.js App Router — `apps/backoffice`

Next.js App Router **bắt buộc** `export default` cho `page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, `not-found.tsx` — 94/110 default export của repo nằm ở đây. Nếu bật `noDefaultExport` toàn cục thì 94 warning không thể fix. Override tắt hẳn rule trong `src/app/**`.

`useFilenamingConvention` cũng tắt trong `src/app/**`: App Router có route group `(main)`, dynamic segment `[id]` — quy ước filename của framework, không phải của team.

`src/components/ui/**` là code generate bởi shadcn CLI (đã exclude trong `apps/backoffice/biome.json` hiện tại): **không lint, không format** — nếu format sẽ tạo diff mỗi lần `shadcn add` regenerate.

Phần Tailwind (`useSortedClasses`) + domain `next`/`react` giữ trong nested config — xem [p0-03](p0-03-frontend-configs.plan.md).

### (2) React component library — `packages/ui`

Không cần override riêng: Biome tự bật domain `react` vì `package.json` của nó có `react` dependency. Là library nên áp dụng chung rule `packages/*/src/**` → `noDefaultExport: "error"` (component export named, khớp barrel `src/components/index.ts` hiện có).

### (3) Node/Lambda handler — `apps/api-*`, `apps/worker-*`

- `noConsole: "off"`: 356 chỗ `console.*`, và với Lambda thì `console.log` → CloudWatch Logs là cách log chuẩn (không cần logger lib). Repo không có logger abstraction nào.
- `noDefaultExport: "off"`: handler Lambda và `serverless.yml` entry point thường export default.
- **Không** bật DOM globals ở đây — `tooling/typescript-config/serverless.json` đã chỉ dùng `lib: ["es2024"]`, Biome tự suy theo domain (không có react → không có JSX rule).

### (4) Domain package thuần — `packages/game-*`, `game-core`, `shared`...

Đây là nhóm strict nhất, chứa business rule tính tiền (`rules/financials.ts`, `helpers/match-result.ts`). Áp dụng đầy đủ rule nền của p0-01, **cộng** `noDefaultExport: "error"`.

Không cần nới gì: các package này pure logic, không I/O, không `any` (khảo sát cho thấy `any` tập trung ở tầng repos).

### (5) Application layer — `packages/*-application`

Chỉ nới **một** rule, trong **một** thư mục: `suspicious/noExplicitAny: "off"` cho `src/infras/**`.

Lý do có căn cứ: `mongodb.mdc` §5 chính thức đưa `result.map((r: any) => ({...}))` làm pattern ĐÚNG khi map aggregate result sang typed interface, và `BaseRepo<any>` xuất hiện trong ví dụ chuẩn của rule. Bật `noExplicitAny` ở đây = mâu thuẫn với rule kiến trúc đã chốt.

Phần `use-cases/**` của cùng package **vẫn** chịu `noExplicitAny: "warn"` — đúng tinh thần: `any` chỉ được phép ở ranh giới driver MongoDB, không được lan vào business logic.

### (6) SDK publish — `packages/player-sdk`

Không override: barrel file đã được tắt toàn cục (`noBarrelFile: "off"`), mà SDK thì barrel chính là public API contract (`src/index.ts`, `src/{game}/index.ts` — xem `player-sdk-jsdoc.mdc`).

Điều SDK cần mà **Biome không làm được**: enforce JSDoc đầy đủ cho public export (yêu cầu của TypeDoc). Đây là gap thật, giữ nguyên cách hiện tại (Cursor rule + review). Ứng viên tương lai: GritQL plugin hoặc `typedoc --validation.notDocumented` trong CI (xem [p1-02](p1-02-ci-and-git-hooks.plan.md)).

### (7) Config + test files

- Config (`vitest.config.ts`, `tsup.config.ts`, `next.config.ts`): 15/110 default export nằm ở đây, và các tool này **yêu cầu** default export → tắt rule.
- Test: `any` và `!` trong test là chuyện thường (dựng fixture, cast mock). Nới đúng 3 rule, **không** tắt cả linter — vẫn muốn bắt `noFocusedTests` (từ domain `test`) để chặn `it.only` lọt vào repo.

## Thứ tự override quan trọng

Biome áp dụng override **theo thứ tự khai báo, sau ghi đè trước**. Vì vậy:

1. `**/*.config.ts` và test đặt **trước** override `packages/*/src/**` — nhưng vì `*.config.ts` không nằm trong `src/**` nên không xung đột; test file trong `src/**` (nếu có) sẽ bị `noDefaultExport: error` áp lại → cần kiểm tra: repo đặt test ở `test/` riêng (đã verify: `packages/*/test/**`), nên không có xung đột.
2. `apps/backoffice/src/components/ui/**` phải là override **cuối cùng** để `linter.enabled: false` không bị override khác bật lại.

## Acceptance criteria

- `pnpm exec biome check .` cho **0 lỗi thuộc nhóm "không thể fix"**: không có warning `noDefaultExport` trong `apps/backoffice/src/app/**`, `**/*.config.ts`, `apps/api-*`, `apps/worker-*`.
- `pnpm exec biome check packages/game-keno-application/src/infras/repos` → không có warning `noExplicitAny`.
- `pnpm exec biome check packages/game-keno-application/src/use-cases` → **vẫn** báo `noExplicitAny` nếu có `any` (chứng minh override đúng scope).
- `pnpm exec biome check apps/backoffice/src/components/ui` → 0 diagnostic (linter tắt).
