# P1-01 — Type-aware rules + siết `tsconfig` (bổ trợ Biome)

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Chỉ làm khi P0 đã sạch.

## Mục tiêu

Bật lớp rule mà chỉ có thông tin type mới bắt được, và siết `tsconfig` để **compiler** đảm nhận phần linter không làm được. Đây là mảnh ghép biến Biome từ "formatter + style linter" thành "safety net thật".

## Phần 1 — Bật domain `types` + `project` (Biome)

Thêm vào `/biome.json`:

```jsonc
{
  "linter": {
    "domains": {
      "test": "recommended",
      "project": "recommended",   // ← mới
      "types": "recommended"      // ← mới
    },
    "rules": {
      "nursery": {
        "noFloatingPromises": "error",
        "noMisusedPromises": "error",
        "useAwaitThenable": "error",
        "noImportCycles": "error",
        "noUnnecessaryConditions": "warn",
        "useExhaustiveSwitchCases": "error"
      }
    }
  }
}
```

Giải trình từng rule — vì sao đáng với codebase này:

| Rule | Bug thật nó chặn ở repo này |
|---|---|
| `noFloatingPromises` | Promise không await trong settle pipeline → tiền được ghi nhưng transaction chưa commit khi Lambda kết thúc. Đây là **loại bug đắt nhất** trong hệ thống tài chính serverless. |
| `noMisusedPromises` | `if (somePromise)` luôn truthy → nhánh sai chạy im lặng. Cũng bắt `array.filter(async ...)`. |
| `useAwaitThenable` | `await` giá trị không phải Promise = code chết, thường là dấu hiệu quên gọi hàm. |
| `noImportCycles` | Repo có **248 barrel file** — barrel là nguồn circular import số một; cycle qua barrel gây `undefined` lúc runtime rất khó debug. Đây chính là rule tôi từng nhận định "Biome không có" — **đã có** từ v2. |
| `useExhaustiveSwitchCases` | Repo dùng discriminated union dày đặc (`PlayType`, `PrizeTier`, `DrawStatus`). Thêm member mới mà quên nhánh switch = giải thưởng tính sai. Rule này cực kỳ giá trị với pattern `const object as const` ở §5.3. |
| `noUnnecessaryConditions` (warn) | Bắt guard vô nghĩa (`if (x)` khi `x` không thể null). Đặt `warn` vì với `noUncheckedIndexedAccess` đang bật, rule dễ false-positive ở giai đoạn đầu. |

**Lưu ý bắt buộc**: mọi rule trên đều là `nursery` → **phải khai báo tường minh**, không được kích hoạt chỉ bằng `domains`. Đây là lỗi cấu hình phổ biến nhất khi bật type-aware linting của Biome.

### Chi phí hiệu năng — phải đo trước khi chốt

Bật `project`/`types` khiến Biome thực hiện **full scan** và index cả `.d.ts` trong `node_modules` (theo docs: "If any rule from the project domain is enabled, the scanner will index source files including their dependencies... `.d.ts` files and `package.json` manifests inside `node_modules/` may still get indexed too").

Quy trình đo:

```bash
# baseline (chưa bật domain)
hyperfine --warmup 1 'pnpm exec biome check .'
# sau khi bật
hyperfine --warmup 1 'pnpm exec biome check .'
```

Ngưỡng quyết định:

- **< 10s** → bật toàn repo.
- **10-30s** → giữ ở CI (`biome ci`) nhưng script `lint` local dùng `--changed` để lập trình viên không phải chờ.
- **> 30s** → thu hẹp bằng `files.experimentalScannerIgnores` (loại `.next`, `dist`, `coverage`, thư mục generated), hoặc chỉ bật type-aware cho `packages/game-*-application/**` + `apps/api-*/**` (nơi có logic tiền) qua `overrides`.

Biết trước một hạn chế đã ghi nhận trong issue tracker Biome: type inference chưa resolve tốt qua utility type (`Readonly<T>`, `Partial<T>`) → sẽ có false-negative. Chấp nhận: hiện tại backend đang có **0** rule loại này, đạt ~75% parity vẫn là bước tiến lớn.

## Phần 2 — Siết `tooling/typescript-config/base.json`

Compiler bắt được nhiều thứ linter không bao giờ bắt được. Config hiện tại đã tốt (`strict`, `noUncheckedIndexedAccess`, `isolatedModules`), còn thiếu 4 flag đáng thêm:

```jsonc
{
  "compilerOptions": {
    // ... hiện có ...
    "verbatimModuleSyntax": true,      // ← mới
    "erasableSyntaxOnly": true,        // ← mới
    "noImplicitOverride": true,        // ← mới
    "noFallthroughCasesInSwitch": true // ← mới
  }
}
```

| Flag | Lý do — gắn với chính codebase này |
|---|---|
| `verbatimModuleSyntax` | Mảnh ghép của `style/useImportType` (p0-01): buộc `import type` phải tường minh, TS không tự xoá import. Với Lambda bundle, import type bị nhầm thành runtime import kéo cả package vào bundle → tăng cold start. Bật flag này biến convention thành lỗi compile. |
| `erasableSyntaxOnly` | Chặn `enum`, `namespace`, parameter property (`constructor(private x)`) — đúng cùng mục tiêu với `style/noEnum` + `noNamespace`, nhưng ở tầng compiler (không thể bỏ qua bằng `biome-ignore`). Khảo sát: 0 enum, 0 namespace → bật miễn phí. |
| `noImplicitOverride` | Repo dùng inheritance thật: `extends InternalUseCase`, `extends NextApiUseCase`, `extends BaseRepo`. Thiếu flag này, đổi tên method ở base class làm override im lặng biến thành method mới → override chết âm thầm. **Đây là rủi ro thật với kiến trúc use-case của repo.** |
| `noFallthroughCasesInSwitch` | Bổ trợ `useExhaustiveSwitchCases`: rule Biome bắt "thiếu case", flag TS bắt "thiếu break". Hai mặt của cùng một bug tính giải thưởng. |

Cân nhắc **KHÔNG** bật:

| Flag | Lý do bỏ qua |
|---|---|
| `exactOptionalPropertyTypes` | Rất đúng về lý thuyết nhưng sẽ tạo hàng trăm lỗi với pattern `$set` partial update của MongoDB (`fields.commissionRate === undefined` khắp `infras/repos/**`). Chi phí > lợi ích ở thời điểm này. |
| `noPropertyAccessFromIndexSignature` | Xung đột với việc đọc document Mongo động. |
| `isolatedDeclarations` | Buộc annotate return type cho mọi export — thay đổi rất rộng, nên là quyết định riêng. |

**Thứ tự thực thi**: bật 4 flag → chạy `pnpm check-types` → sửa lỗi phát sinh. `verbatimModuleSyntax` có thể tạo nhiều lỗi nhất, nên bật **sau** khi `biome check --write` đã tự thêm `import type` ở p0-06 (giảm phần lớn công việc tay).

## Phần 3 — `dependency-cruiser` cho boundary kiến trúc (vẫn cần, khác mục đích)

`noImportCycles` bắt circular import, nhưng **không** bắt được rule kiến trúc ở `operator-monorepo-structure.mdc` §5:

- `no-core-to-operator`: core (`packages/game-*`, `apps/api-player`...) **không được** import `@megawin/operator-*`.
- `operator-import-core-allowlist`: operator chỉ được import core qua allowlist package.

Đây là rule về **hướng phụ thuộc giữa các package**, không phải cycle. Không linter nào (Biome lẫn ESLint) làm được ngoài `dependency-cruiser`. Rule kiến trúc này đã được chốt trong Cursor rule nhưng **chưa được enforce bằng tool nào** — là gap độc lập với migration Biome. Đưa vào backlog riêng, không block P1.

## Phần 4 — Gap còn lại và ứng viên GritQL plugin (P2, chưa cam kết)

Biome hỗ trợ custom rule bằng GritQL. Hai rule nội bộ của repo có thể tự động hoá:

- §5.4 `code-quality-standards.mdc`: cấm indexed-access type `SomeType["field"]`.
- §5.2: cấm `Pick<T, ...>` khi đã chọn đủ mọi field của `T` (khó, cần type info — có thể ngoài khả năng GritQL).

Chỉ làm nếu vi phạm tái diễn nhiều lần sau P0/P1. Hiện tại Cursor rule + review là đủ.

## Acceptance criteria

- Số liệu hiệu năng trước/sau khi bật domain được ghi vào chính file này.
- `pnpm exec biome check .` với type-aware bật → mọi diagnostic mới đều đã triage (fix hoặc ghi backlog kèm lý do).
- `pnpm check-types` xanh sau khi thêm 4 compiler flag.
- Không thêm `biome-ignore` nào để làm im lặng `noFloatingPromises` trong code tài chính (`settle`, `payout`, `financial`) — mọi vi phạm ở đó phải fix thật.
