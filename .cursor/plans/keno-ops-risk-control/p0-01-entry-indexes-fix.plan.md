# p0-01 — Sửa index `drawDate` → `financialDate` trên `keno_ticket_entries`

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §2.2, §3.6, verdict #1.
> **Phase:** P0 · **Phụ thuộc:** không · **Blocks:** không (độc lập, làm sớm nhất).

## Mục tiêu

`TicketEntryDoc` chỉ có field `financialDate`, nhưng 3 index khai `drawDate` → index vô dụng, mọi ops aggregation `$match { financialDate }` chạy COLLSCAN. Sửa 3 index cho khớp field thật. Bug này ảnh hưởng mọi báo cáo theo ngày, không chỉ ops → ưu tiên cao, độc lập.

## Pattern tham chiếu

- File index: `packages/game-keno/src/indexes/index.ts` — `const KENO_INDEXES: readonly IndexSpec[]`, interface `IndexSpec { collection; key; options?; purpose }`.
- Field đúng: `packages/game-keno/src/entities/entry.ts` — `TicketEntryDoc.financialDate`.
- Không có index runner tự động; consumer là migration/Atlas Index Management (header JSDoc của file index).

## Việc cần làm

### 1. Sửa 3 index (`packages/game-keno/src/indexes/index.ts`)

Trên collection `kenoTicketEntries`, đổi key `drawDate` → `financialDate`:

| Index name | Key hiện tại (sai) | Key sau sửa |
|---|---|---|
| `idx_tenant_account_drawDate` | `{ tenantId:1, accountId:1, drawDate:-1 }` | `{ tenantId:1, accountId:1, financialDate:-1 }` |
| `idx_tenant_drawDate_status` | `{ tenantId:1, drawDate:1, status:1 }` | `{ tenantId:1, financialDate:1, status:1 }` |
| `idx_drawDate_status` | `{ drawDate:1, status:1 }` | `{ financialDate:1, status:1 }` |

- Đổi luôn `name` cho khớp (vd `idx_tenant_account_financialDate`) để tên phản ánh key — nhưng xem quyết định migration bên dưới trước khi đổi name.
- Cập nhật `purpose` nếu đang nhắc `drawDate`.
- **KHÔNG** đổi index của `kenoDrawCounters` (`idx_drawDate_unique`) hay `kenoDraws` (`idx_drawDate_drawNo`) — 2 collection đó thật sự có field `drawDate`. Kiểm tra lại entity trước khi động.

### 2. Migration drop index cũ + tạo index mới

Viết migration script (theo cách team đang chạy index — Atlas Index Management hoặc script maintenance; xác nhận với DBA đường chạy thực tế):

```
// pseudocode — chạy trên collection keno_ticket_entries
dropIndex("idx_tenant_account_drawDate")
dropIndex("idx_tenant_drawDate_status")
dropIndex("idx_drawDate_status")
createIndex({ tenantId:1, accountId:1, financialDate:-1 }, { name: "idx_tenant_account_financialDate" })
createIndex({ tenantId:1, financialDate:1, status:1 }, { name: "idx_tenant_financialDate_status" })
createIndex({ financialDate:1, status:1 }, { name: "idx_financialDate_status" })
```

- Index cũ chưa từng được dùng (field không tồn tại) → drop an toàn, không ảnh hưởng query đang chạy.
- Tạo index mới nên chạy `background`/rolling nếu collection lớn (tuân quy trình Atlas của team).

### 3. Quyết định cần chốt trong plan

- **Đổi name index hay giữ name cũ?** Đổi name = migration rõ ràng (drop tên cũ, tạo tên mới) nhưng phải cập nhật mọi chỗ hardcode tên (grep `idx_*_drawDate` toàn repo). Giữ name cũ + chỉ đổi key = ít đụng chạm nhưng tên gây hiểu nhầm. **Đề xuất: đổi name** cho đúng — grep xác nhận không nơi nào hardcode tên index.

## Không làm

- KHÔNG thêm index mới nào lên `keno_ticket_entries` cho tính năng ops (tránh write amplification hot path). Đặc biệt KHÔNG multikey index trên `entrySummary.boards.numbers`.

## Verify

- `pnpm --filter @megawin/game-keno check-types`.
- Sau migration: `explain()` một ops aggregation (`aggregateOpsSummary` filter theo `financialDate`) xác nhận dùng IXSCAN thay vì COLLSCAN.
- Grep toàn repo `drawDate` trên context entries → 0 kết quả còn sai.

## Định nghĩa Done

3 index khai đúng `financialDate`, migration chạy trên môi trường, ops query theo ngày dùng index. Cập nhật status trong `00-overview.md`.
