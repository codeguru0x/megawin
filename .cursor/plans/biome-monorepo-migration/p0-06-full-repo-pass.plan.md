# P0-06 — Full-repo pass: format, auto-fix, chốt backlog

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần p0-01 → p0-05.

## Mục tiêu

Đưa 2.019 file chưa từng được lint (41 package backend + `packages/ui`) về trạng thái sạch, **mà không tạo ra một commit khổng lồ trộn lẫn format và logic**.

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
