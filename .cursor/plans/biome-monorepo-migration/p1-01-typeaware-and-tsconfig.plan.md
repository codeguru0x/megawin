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
      // LƯU Ý NHÓM RULE: Biome 2.5.0 đã promote 73 rule khỏi nursery.
      // Khai báo sai nhóm → Biome báo lỗi config. Trạng thái verify với 2.5.7:
      "suspicious": {
        "noImportCycles": "error",          // promoted — KHÔNG còn ở nursery
        "noUnnecessaryConditions": "warn"   // promoted ở 2.5.0
      },
      "nursery": {
        "noFloatingPromises": "error",      // vẫn nursery (verify 07/08/2026)
        "noMisusedPromises": "error",       // vẫn nursery
        "useAwaitThenable": "error",        // vẫn nursery (rule từ v2.3.9)
        "useExhaustiveSwitchCases": "error" // vẫn nursery
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
| `noImportCycles` | Repo có **~275 barrel file** — barrel là nguồn circular import số một; cycle qua barrel gây `undefined` lúc runtime rất khó debug. Đây chính là rule tôi từng nhận định "Biome không có" — **đã có** từ v2, nay thuộc nhóm `suspicious` (domain `project`). Option `ignoreTypes` mặc định `true` — nhưng khi bật `verbatimModuleSyntax` (Phần 2), named type import (`import { type Foo }`) KHÔNG được coi là type-only → cân nhắc để mặc định. |
| `useExhaustiveSwitchCases` | Repo dùng discriminated union dày đặc (`PlayType`, `PrizeTier`, `DrawStatus`). Thêm member mới mà quên nhánh switch = giải thưởng tính sai. Rule này cực kỳ giá trị với pattern `const object as const` ở §5.3. |
| `noUnnecessaryConditions` (warn) | Bắt guard vô nghĩa (`if (x)` khi `x` không thể null). Đặt `warn` vì với `noUncheckedIndexedAccess` đang bật, rule dễ false-positive ở giai đoạn đầu. |

**Lưu ý bắt buộc**: các rule type-aware còn ở `nursery` **phải khai báo tường minh**, không được kích hoạt chỉ bằng `domains`. Đây là lỗi cấu hình phổ biến nhất khi bật type-aware linting của Biome. Đồng thời, mỗi lần **bump minor version Biome** phải kiểm tra changelog mục "Promoted rules" — rule promote khỏi nursery mà config vẫn khai ở `nursery` sẽ làm Biome báo lỗi config (đã xảy ra với chính plan này: bản nháp đầu đặt `noImportCycles`/`noUnnecessaryConditions` ở nursery, sai kể từ 2.5.0).

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
| `erasableSyntaxOnly` | Chặn `enum`, `namespace`, parameter property (`constructor(private x)`) — đúng cùng mục tiêu với `style/noEnum` + `noNamespace`, nhưng ở tầng compiler (không thể bỏ qua bằng `biome-ignore`). Khảo sát lại 07/08: 0 enum, 0 namespace, nhưng **2 parameter property** phải refactor trước khi bật: `packages/worker-core/src/use-cases/lock/distributed-mutex.ts:139` và `packages/game-core-application/src/use-cases/sync-entry-feed.ts:128` (chuyển sang khai báo field + gán trong constructor body). |
| `noImplicitOverride` | Repo dùng inheritance thật: `extends InternalUseCase`, `extends NextApiUseCase`, `extends BaseRepo`. Thiếu flag này, đổi tên method ở base class làm override im lặng biến thành method mới → override chết âm thầm. **Đây là rủi ro thật với kiến trúc use-case của repo.** |
| `noFallthroughCasesInSwitch` | Bổ trợ `useExhaustiveSwitchCases`: rule Biome bắt "thiếu case", flag TS bắt "thiếu break". Hai mặt của cùng một bug tính giải thưởng. |

Cân nhắc **KHÔNG** bật:

| Flag | Lý do bỏ qua |
|---|---|
| `exactOptionalPropertyTypes` | Rất đúng về lý thuyết nhưng sẽ tạo hàng trăm lỗi với pattern `$set` partial update của MongoDB (`fields.commissionRate === undefined` khắp `infras/repos/**`). Chi phí > lợi ích ở thời điểm này. |
| `noPropertyAccessFromIndexSignature` | Xung đột với việc đọc document Mongo động. |
| `isolatedDeclarations` | Buộc annotate return type cho mọi export — thay đổi rất rộng, nên là quyết định riêng. |

**Thứ tự thực thi**: bật 4 flag → chạy `pnpm check-types` → sửa lỗi phát sinh. `verbatimModuleSyntax` có thể tạo nhiều lỗi nhất, nên bật **sau** khi `biome check --write` đã tự thêm `import type` ở p0-06 (giảm phần lớn công việc tay). Điểm cần canh riêng: script `generate:presets` của backoffice chạy `ts-node --compiler-options '{"module":"CommonJS"}'` — `verbatimModuleSyntax` báo lỗi ESM import syntax khi emit CJS; nếu vướng, chuyển script sang `tsx` (đã có trong devDependencies backoffice) thay vì hạ flag.

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

## Phương án review sau thực thi

**1. Diff review — file được phép đổi:** `biome.json`, `tooling/typescript-config/base.json`, cùng các file source được sửa để pass flag mới (mỗi file sửa phải map được về đúng 1 diagnostic — ghi bảng đối chiếu file ↔ rule/flag trong PR description).

**2. Verify hiệu năng (BẮT BUỘC ghi số vào đây):**

```bash
hyperfine --warmup 1 'pnpm exec biome check .'   # trước khi bật domain → ghi baseline
# ... bật domain project/types ...
hyperfine --warmup 1 'pnpm exec biome check .'   # sau → so với ngưỡng <10s / 10-30s / >30s
```

**3. Negative test type-aware — chứng minh rule bắt bug thật:**

```bash
cat > packages/shared/src/probe-types.ts <<'EOF'
async function pay(): Promise<number> { return 1; }
export function run() { pay(); }                       // noFloatingPromises
export function pick(s: "a" | "b") { switch (s) { case "a": return 1; } }  // useExhaustiveSwitchCases
EOF
pnpm exec biome check packages/shared/src/probe-types.ts
# KỲ VỌNG: 2 error đúng tên rule; sau đó rm file probe
```

**4. Negative test compiler flags:**

```bash
# noImplicitOverride: đổi tên 1 method base class tạm thời → mọi override phải báo lỗi compile
# verbatimModuleSyntax: thêm `import { SomeType } from ...` (không có `type`) dùng type-only → phải lỗi
pnpm check-types   # xanh trở lại sau khi revert probe
```

**5. Kiểm tra cam kết "không ignore code tài chính":** `rg -n "biome-ignore.*(noFloatingPromises|noMisusedPromises)" packages apps` → 0 kết quả trong path chứa `settle|payout|financial`.

**6. Rollback:** revert `biome.json` (tắt domain) độc lập với revert tsconfig flags — 2 phần không phụ thuộc nhau, rollback riêng lẻ được.
