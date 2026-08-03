# p0-01 — Sửa index `max3d_ticket_entries`: `drawDate` → `financialDate` + thêm `idx_draw_id`

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §2.2.1, §3.7, verdict #1.
> **Phase:** P0 · **Phụ thuộc:** — · **Blocks:** p0-02 (watermark query cần `idx_draw_id`).

## Mục tiêu

Sửa bug 3 index khai `drawDate` trên `max3d_ticket_entries` trong khi `TicketEntryDoc` **chỉ có `financialDate`** (`packages/game-max3d/src/entities/entry.ts` dòng 251–252). **KHÁC Bingo18/Keno một điểm:** Max 3D ĐÃ có sẵn index đúng `idx_tenant_financialDate_status` (`indexes/index.ts` dòng 109) → 1 trong 3 index sai phải **XOÁ** (sửa key sẽ tạo bản trùng), 2 index còn lại đổi key. Thêm `idx_draw_id` cho watermark worker (p0-02).

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Convention name/purpose | `packages/game-keno/src/indexes/index.ts` (bản đã sửa) + `../bingo18-ops-risk-control/p0-01-entry-indexes-fix.plan.md` |
| Index hiện trạng | `packages/game-max3d/src/indexes/index.ts` dòng 79–92 (3 index sai) + dòng 109 (index đúng sẵn có) |

## Việc cần làm

### 1. `packages/game-max3d/src/indexes/index.ts`

| Index hiện tại (SAI) | Hành động |
|---|---|
| `{ tenantId: 1, accountId: 1, drawDate: -1 }` `idx_tenant_account_drawDate` (dòng 79) | **Đổi key** → `{ tenantId: 1, accountId: 1, financialDate: -1 }` `idx_tenant_account_financialDate` |
| `{ tenantId: 1, drawDate: 1, status: 1 }` `idx_tenant_drawDate_status` (dòng 85) | **XOÁ HẲN** — key sau khi sửa trùng 100% với `idx_tenant_financialDate_status` sẵn có (dòng 109). Giữ 2 bản = write amplification vô ích. |
| `{ drawDate: 1, status: 1 }` `idx_drawDate_status` (dòng 91) | **Đổi key** → `{ financialDate: 1, status: 1 }` `idx_financialDate_status` |

- Cập nhật `purpose` từng index đồng bộ. KHÔNG đụng index `drawDate` trên `max3d_draws`/`max3d_tickets` (các Doc đó CÓ field `drawDate` — hợp lệ, vd dòng 49 purpose "sortBy=drawDate" của tickets là settlement field khác, chỉ đổi khi key thực sự sai — soi từng entry trước khi sửa).

Thêm index mới:

```ts
{
  collection: Max3dCollections.TicketEntries,
  key: { drawId: 1, _id: 1 },
  options: { name: "idx_draw_id" },
  purpose:
    "Ops stats worker: watermark per-draw insert-stream ({drawId, _id > lastEntryId}) + " +
    "recompute cursor. Equality prefix drawId + range _id, index-only. KHÔNG multikey.",
},
```

### 2. Migration

DBA chạy Atlas (tiền lệ Keno p0-01): drop 3 index sai + create 2 index đúng (KHÔNG tạo lại bản trùng `{tenantId, financialDate, status}`) + create `idx_draw_id`. Ghi câu lệnh vào PR description.

## Không làm

- KHÔNG thêm index nào khác trên entries (không multikey trên `entrySummary.boards.triplets`).
- KHÔNG đổi field entity — `financialDate` đúng, index sai.

## Verify

`pnpm --filter @megawin/game-max3d check-types` + lint. Grep `drawDate` trong `indexes/index.ts` — chỉ còn match hợp lệ (collections có field `drawDate` thật: draws/tickets).

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] Đối chiếu từng index với query thực tế trong `entry-repo.ts` (report/ops `$match financialDate`) — không còn index chết, không index trùng key.
- [ ] Xác nhận từng match `drawDate` còn lại trỏ vào Doc có field đó thật (mở entity đối chiếu).
- [ ] Ghi kết quả review vào đây + cập nhật `00-overview.md`.

## Định nghĩa Done

`MAX3D_INDEXES` hết `drawDate` sai trên TicketEntries (2 sửa + 1 xoá), có `idx_draw_id`, migration ghi PR, review xong, overview cập nhật.
