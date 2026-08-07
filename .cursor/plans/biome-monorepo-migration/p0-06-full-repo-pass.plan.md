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

| Rule | Số lượng | Xử lý | Ghi chú |
|---|---|---|---|
| `suspicious/noExplicitAny` | ~? (dự kiến < 571 sau khi trừ `infras/**` và test) | Backlog dài hạn | Đưa `any` ở `use-cases/**` về type thật, ưu tiên code tính tiền |
| `style/noNonNullAssertion` | ? | Backlog | Ưu tiên file settle/payout |
| `style/noProcessEnv` | ~8 | Sửa ngay được | Dồn về `env.ts` / inject qua config |
| `correctness/noUnusedVariables` | ? | Sửa ngay | |
| `style/useFilenamingConvention` | dự kiến ~0 | | Repo đã 100% kebab-case |

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
