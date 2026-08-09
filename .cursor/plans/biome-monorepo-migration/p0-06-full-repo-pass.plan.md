# P0-06 — Full-repo pass: format, auto-fix, chốt backlog

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần p0-01 → p0-05.

## Mục tiêu

Đưa 2.019 file chưa từng được lint (41 package backend + `packages/ui`) về trạng thái sạch, **mà không tạo ra một commit khổng lồ trộn lẫn format và logic**.

> **Bước 0 bắt buộc — re-survey:** số liệu khảo sát chốt ngày 01/08 (3.122 file, 571 `any`, 248 barrel...)
> đã drift do các plan song song (`monorepo-test-setup`, ops-risk-control 3 game — xem overview §3.1).
> Trước khi chạy full pass, chạy lại các lệnh đếm ripgrep trong overview §4 và cập nhật bảng backlog
> bên dưới bằng số MỚI. Đặc biệt lưu ý số file test/`vitest.config.ts` mới thêm.

> **Điều kiện tiên quyết — working tree SẠCH (overview §7 mục 1):** `git status --porcelain` phải rỗng
> (mọi work-in-progress đã commit/merge). Chạy format toàn repo trên tree bẩn = trộn diff format vào
> diff logic đang dở → không review nổi. p0-01→p0-05 không có ràng buộc này; p0-06 CÓ, tuyệt đối.

## Nguyên tắc: 3 commit tách biệt, KHÔNG trộn

### Commit 1 — format-only (không đổi hành vi)

```bash
pnpm exec biome format --write .
```

Chỉ đổi whitespace/quote/trailing comma. Commit message nên ghi rõ để reviewer skip được, ví dụ:
`chore(format): biome format toàn repo (format-only, không đổi logic)`

**Quan trọng**: sau commit này, thêm SHA vào `.git-blame-ignore-revs` để `git blame` không bị commit format che mất tác giả thật:

```
# .git-blame-ignore-revs
# chore(format): biome format toàn repo
<sha-commit-1>
```

Bật cho local: `git config blame.ignoreRevsFile .git-blame-ignore-revs`. Đây là practice chuẩn khi một repo lần đầu áp formatter lên codebase cũ.

### Commit 2 — safe auto-fix (Biome đảm bảo tương đương ngữ nghĩa)

```bash
pnpm exec biome check --write .
```

Áp các fix Biome đánh dấu **safe**: `noUnusedImports`, `useImportType`, `useOptionalChain`, `useSortedClasses`, `organizeImports`, `useBlockStatements`... Không dùng `--unsafe` ở bước này.

Kiểm tra bắt buộc trước khi commit: `pnpm check-types` phải xanh, `pnpm test` (Vitest) phải xanh.

### Commit 3 (tuỳ chọn, review từng file) — unsafe fix

```bash
pnpm exec biome check --write --unsafe .
```

Chỉ chạy khi commit 1+2 đã merge, và **phải đọc diff từng file**. Unsafe fix có thể đổi hành vi (vd `noExplicitAny` → `unknown`). Nếu diff quá lớn, bỏ hẳn bước này, đưa vào backlog.

## Chốt backlog warning còn lại

Sau commit 2, chạy:

```bash
pnpm exec biome check . --reporter=summary
```

Ghi kết quả vào chính file này thành bảng backlog (cập nhật khi thực thi):

**Đã thực thi 08/08/2026** — sau commit 1 (format-only, 1113 file) + commit 2 (safe autofix, +1726 file, không dùng `--unsafe`). Kết quả `biome check . --reporter=summary`: **107 error, 2552 warning, 5008 info**.

| Rule | Số lượng | Mức | Xử lý | Ghi chú |
|---|---|---|---|---|
| `nursery/useSortedClasses` | 4822 | info | Đã fix qua commit 2 (safe) — số còn lại là info không cần fix | Chủ yếu backoffice, đúng dự đoán rủi ro #3 |
| `complexity/useLiteralKeys` | 102 | info | Backlog nhẹ | |
| `complexity/noUselessConstructor` | 48 | info | Backlog nhẹ | |
| `style/useTemplate` | 22 | info | Backlog nhẹ | |
| `correctness/useParseIntRadix` | 9 | info | Backlog nhẹ | |
| `style/useNodejsImportProtocol` | 4 | info | Backlog nhẹ | |
| `style/noNonNullAssertion` | 539 | warning | Backlog dài hạn | Ưu tiên file settle/payout trước |
| `style/useBlockStatements` | 1485 | warning | Backlog — cần review tay (đổi cấu trúc block) | Không auto-fix an toàn |
| `suspicious/noArrayIndexKey` | 194 | warning | Backlog | Chủ yếu backoffice list render |
| `suspicious/noExplicitAny` | 179 | warning | Backlog dài hạn (giảm từ 505 khảo sát 07/08 nhờ override `infras/**` off) | Đưa `any` ở `use-cases/**` về type thật, ưu tiên code tính tiền |
| `suspicious/noGlobalIsNan` | 68 | warning | Sửa ngay được (đổi `isNaN`→`Number.isNaN`) | Backlog ngắn hạn |
| `style/noProcessEnv` | 29 | warning | Sửa ngay được | Dồn về `env.ts`/config tập trung; bao gồm `tooling/vitest-config/src/setup-db-guard.ts` (2) |
| `correctness/noUnusedVariables` | 16 | warning | Sửa ngay | |
| `correctness/noUnusedFunctionParameters` | 10 | warning | Sửa ngay | |
| `suspicious/noConfusingVoidType` | 25 | warning | Backlog | `undefined as void` pattern — cần đổi type |
| `suspicious/noTemplateCurlyInString` | 3 | warning | Sửa ngay | Có thể là bug thật (thiếu template literal) |
| `suspicious/noDocumentCookie` | 2 | warning | Backlog nhẹ | |
| `complexity/noBannedTypes` | 1 | warning | Sửa ngay | |
| `correctness/noUnusedPrivateClassMembers` | 1 | warning | Sửa ngay | |
| `correctness/noUnusedImports` | 76 | **error** | **Commit 3 (unsafe) — ĐÃ HUỶ, xem lý do dưới** | |
| `complexity/useOptionalChain` | 14 | **error** | **Commit 3 (unsafe) — ĐÃ HUỶ, xem lý do dưới** | |
| `suspicious/noEmptyBlockStatements` | 10 | **error** | Backlog — cần review tay (10 file, xem danh sách dưới) | Không auto-fix |
| `style/noParameterAssign` | 4 | **error** | Backlog — `packages/cache/src/redis/client.ts:55`, `packages/data/src/mongo/repository.ts:277,280,285` | Cần review tay (đổi sang local variable) |
| `correctness/useExhaustiveDependencies` | 1 | **error** | Backlog — 1 file, xem `apps/backoffice/.../number-heatmap.tsx` | |
| `style/noDefaultExport` | 1 | **error** | Backlog — `packages/cache/src/redis/client.ts` (đúng "1 source thật" đã ghi ở overview §4) | Cần đánh giá đổi sang named export hoặc thêm override riêng cho file này |
| `performance/noDelete` | 1 | **error** | Backlog — `packages/player-sdk/scripts/prepack.mjs:17` (Unsafe fix) | Build script `.mjs`, chưa nằm trong override "config files" |
| `style/useFilenamingConvention` | 0 | | Đúng dự đoán — repo 100% kebab-case | |

**Quyết định Commit 3 (unsafe fix): HUỶ, đưa vào backlog.** `noUnusedImports` + `useOptionalChain` được Biome
2.5.7 đánh dấu **"Unsafe fix"** (khác giả định ban đầu của plan là "safe") — cộng lại ảnh hưởng **86 file**,
vượt xa ngưỡng "~30 file" mà plan quy định để huỷ bước này. Theo đúng plan: *"Nếu diff quá lớn, bỏ hẳn bước
này, đưa vào backlog."* → 90 diagnostic error (`noUnusedImports` + `useOptionalChain`) ở lại backlog, xử lý
dần theo từng PR nhỏ có review tay, KHÔNG chạy `--unsafe` đại trà.

**10 file `noEmptyBlockStatements` cần review tay:**
```
packages/cache/src/redis/client.ts
packages/cache/src/stores/noop-store.ts
packages/cache/test/cached-fetcher.test.ts
packages/data/src/mongo/repository.ts
packages/game-lotto535-application/test/use-cases/patch-jackpot-prize.test.ts
packages/player-sdk/scripts/prepack.mjs
packages/shared/src/mappers/mapper.ts
packages/tenant-gateway/src/transaction/transaction-api.ts
packages/worker-core/src/use-cases/lock/tick-loop-worker.ts
apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/analytics/number-heatmap.tsx (có kèm biome-ignore useExhaustiveDependencies)
```

Nguyên tắc: **không hạ rule xuống `off` để làm sạch output**. Nếu một rule tạo quá nhiều warning nhưng có giá trị → giữ `warn` và ghi vào backlog; chỉ `off` khi rule mâu thuẫn với convention đã chốt (như `noBarrelFile`).

## Rủi ro cần canh

| Rủi ro | Cách xử lý |
|---|---|
| `biome check --write` sửa import order làm vỡ side-effect import (vd `import "./src/env"` trong `next.config.ts` phải chạy TRƯỚC) | `organizeImports` của Biome **không** di chuyển import có side effect qua nhau, nhưng vẫn phải verify `apps/backoffice/next.config.ts` và mọi file có `import "..."` (không có binding) sau commit 2 |
| Format lại file test làm snapshot lệch | Chạy `pnpm test` sau mỗi commit; snapshot Vitest không phụ thuộc format source, rủi ro thấp |
| Commit format-only làm conflict với branch đang mở | Thực thi khi ít branch song song; merge/rebase branch cũ **trước** khi chạy |
| 1.103 file backoffice bị reformat do lệch config | Đã chặn ở p0-01 (`lineWidth: 120`, `expand: "auto"`) — verify bằng `biome format --check apps/backoffice` cho 0 diff TRƯỚC khi chạy full pass |

## Acceptance criteria

- `pnpm exec biome check .` → không còn diagnostic mức `error`.
- `pnpm check-types` xanh, `pnpm test` xanh sau mỗi commit.
- `git log --oneline -3` cho thấy 2-3 commit tách biệt rõ mục đích (format / autofix / unsafe).
- `.git-blame-ignore-revs` tồn tại và chứa SHA commit format.
- Bảng backlog ở trên đã được điền số thật.

### Trạng thái thực tế sau khi thực thi (08/08/2026)

| Tiêu chí | Trạng thái | Ghi chú |
|---|---|---|
| `biome check .` → 0 error | ❌ **Không đạt** | Còn 107 error, toàn bộ đã phân loại vào backlog (bảng trên) với lý do rõ ràng — chủ yếu do commit 3 (unsafe) bị huỷ theo đúng điều khoản "diff quá lớn" của chính plan này |
| `pnpm check-types` xanh | ⚠️ Xanh trừ 1 lỗi tiền tồn | `apps/api-tenant/test/list-players.test.ts` — xác nhận KHÔNG do format/autofix gây ra (file không nằm trong diff commit 1/2), tồn tại từ trước migration |
| `pnpm test` xanh | ⚠️ Xanh trừ lỗi tiền tồn | (a) nhiều package thiếu `MONGODB_URI` local trong `.env.test.local` → db-guard chặn hợp lệ; (b) `apps/api-player` có 3 assertion fail thật (đã verify diff format/autofix không đụng logic); (c) `player-sdk` 3 test fail đã biết trước theo `player-sdk-jsdoc.mdc`. Không có failure MỚI do format/autofix |
| 2-3 commit tách biệt | ❌ **Không thực hiện** | Theo quyết định của user: KHÔNG tự tạo git commit trong phiên này. Toàn bộ thay đổi (format-only + safe autofix) đang nằm chung, CHƯA commit, trong working tree. User tự chia commit khi review |
| `.git-blame-ignore-revs` | ❌ **Chưa tạo** | Phụ thuộc SHA của commit format-only — chỉ tạo được sau khi user tự commit. Xem hướng dẫn ở cuối file |
| Bảng backlog điền số thật | ✅ Đã điền | Xem bảng trên |

**Việc còn lại để user tự hoàn tất (không do agent thực hiện):**
1. Review `git diff` hiện tại (1985 file, gộp cả format-only + safe autofix chưa tách lớp).
2. Tự quyết định chia thành 1 hoặc nhiều commit (khuyến nghị theo đúng 2 lớp format/autofix nếu muốn giữ đúng tinh thần plan).
3. Sau khi có SHA commit format-only, tạo `.git-blame-ignore-revs`:
   ```
   # chore(format): biome format toàn repo
   <sha-commit-format>
   ```
   rồi bật `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
4. Xử lý dần backlog 107 error + ~2552 warning theo bảng trên (không có deadline cứng, ưu tiên các mục "Sửa ngay được").

## Phương án review sau thực thi

**1. Review commit 1 (format-only) — chứng minh KHÔNG đổi hành vi:**

```bash
# Diff chỉ được chứa whitespace/quote/comma — verify bằng diff bỏ qua whitespace:
git diff HEAD~1 --ignore-all-space --ignore-blank-lines --stat
# KỲ VỌNG: gần như rỗng (chỉ còn quote style đổi ' → " nếu có, và trailing comma)
# Kiểm tra máy móc: AST không đổi
pnpm check-types    # xanh — TS không quan tâm format
pnpm test           # xanh — hành vi runtime không đổi
```

**2. Review commit 2 (safe auto-fix) — soi đúng các loại fix đã khai báo:**

```bash
git diff HEAD~1 --stat | tail -1                       # ghi lại quy mô
git diff HEAD~1 | rg '^\-.*import ' | head -30          # import bị xoá/đổi — phải toàn unused/type-only
# Side-effect import KHÔNG được di chuyển qua nhau:
rg -n '^import ["'"'"']' apps/backoffice/next.config.ts apps/backoffice/src/env.ts
pnpm check-types && pnpm test && pnpm build             # cả 3 xanh
```

**3. Review commit 3 (unsafe — nếu chạy):** đọc diff TỪNG FILE, không gộp. Từ chối mọi fix đổi `any` → `unknown` trong `infras/**` (mâu thuẫn mongodb.mdc). Nếu diff > ~30 file → huỷ, đưa backlog.

**4. Verify tổng:**

| Lệnh | Kỳ vọng |
|---|---|
| `pnpm exec biome check . --reporter=summary` | 0 error; warning khớp bảng backlog đã điền |
| `git log --oneline -3` | 2-3 commit tách bạch format / autofix / (unsafe) |
| `git config blame.ignoreRevsFile` | `.git-blame-ignore-revs` |
| `git blame packages/game-keno/src/entities/enums.ts \| head -3` | tác giả THẬT, không phải commit format |

**5. Smoke test UI (rủi ro `useSortedClasses` — overview §7 mục 3):** mở backoffice local, đi qua operations 4 game + config page, so màn hình với trước migration. Đặc biệt các component trong `packages/ui` (10 file lần đầu bị sort class).

**6. Rollback:** commit tách bạch nên revert theo lớp: `git revert <sha-commit-3>` (nếu có) → đo lại; format-only revert là phương án cuối cùng (tạo lại diff khổng lồ) — ưu tiên fix-forward.
