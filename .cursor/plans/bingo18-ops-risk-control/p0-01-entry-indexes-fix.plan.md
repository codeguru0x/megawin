# p0-01 — Sửa index `bingo18_ticket_entries`: `drawDate` → `financialDate` + thêm `idx_draw_id`

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §2.2.1, §3.7, verdict #1.
> **Phase:** P0 · **Phụ thuộc:** — (độc lập, làm trước) · **Blocks:** p0-02 (watermark query cần `idx_draw_id`).

## Mục tiêu

1. Sửa **bug thật**: 3 index trong `BINGO18_INDEXES` khai field `drawDate` trên `bingo18_ticket_entries` nhưng `TicketEntryDoc` (`packages/game-bingo18/src/entities/entry.ts`) **chỉ có `financialDate`** — index vô dụng, mọi ops/report aggregation `$match: { financialDate }` COLLSCAN.
2. Thêm index MỚI `{ drawId: 1, _id: 1 }` (`idx_draw_id`) — bắt buộc cho watermark per-draw insert-stream + recompute cursor của worker stats (p0-02). Checklist rủi ro Keno §11 mục 2: **index phải có TRƯỚC khi code query**.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Cách sửa key+name+purpose | Keno đã sửa y hệt bug này: `packages/game-keno/src/indexes/index.ts` — so diff 3 index `idx_tenant_account_financialDate` / `idx_tenant_financialDate_status` / `idx_financialDate_status` + `idx_draw_id` |
| Plan mẫu | `../keno-ops-risk-control/p0-01-entry-indexes-fix.plan.md` |

## Việc cần làm

### 1. `packages/game-bingo18/src/indexes/index.ts`

Sửa 3 index (key + `name` + `purpose` đồng bộ):

| Hiện tại (SAI) | Sau khi sửa |
|---|---|
| `{ tenantId: 1, accountId: 1, drawDate: -1 }` `idx_tenant_account_drawDate` | `{ tenantId: 1, accountId: 1, financialDate: -1 }` `idx_tenant_account_financialDate` |
| `{ tenantId: 1, drawDate: 1, status: 1 }` `idx_tenant_drawDate_status` | `{ tenantId: 1, financialDate: 1, status: 1 }` `idx_tenant_financialDate_status` |
| `{ drawDate: 1, status: 1 }` `idx_drawDate_status` | `{ financialDate: 1, status: 1 }` `idx_financialDate_status` |

Thêm index mới (copy đúng entry của Keno, sửa collection):

```ts
{
  collection: Bingo18Collections.TicketEntries,
  key: { drawId: 1, _id: 1 },
  options: { name: "idx_draw_id" },
  purpose:
    "Ops stats worker: watermark per-draw insert-stream ({drawId, _id > lastEntryId}) + " +
    "recompute cursor. Equality prefix drawId + range _id, index-only. KHÔNG multikey.",
},
```

- KHÔNG đổi các index đúng sẵn có (`idx_ticket_draw_unique`, `idx_draw_status`, `idx_draw_payoutTx`…).
- KHÔNG đụng index `drawDate` trên collection `bingo18_draws` (`idx_drawDate_drawNo`…) — DrawDoc CÓ field `drawDate`, các index đó đúng.

### 2. Migration

Repo không có migration runner — DBA chạy trên Atlas (đúng tiền lệ Keno p0-01): drop 3 index sai + create 3 index đúng + create `idx_draw_id`. Ghi câu lệnh vào PR description.

## Không làm

- KHÔNG thêm bất kỳ index nào khác lên entries (không multikey trên `entrySummary.boards.*`).
- KHÔNG đổi field trong `TicketEntryDoc` — field `financialDate` là đúng, index sai.

## Verify

`pnpm --filter @megawin/game-bingo18 check-types` + lint. Grep `drawDate` trong `packages/game-bingo18/src/indexes/index.ts` — chỉ còn match ở section `bingo18_draws` (hợp lệ).

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] Đối chiếu từng index đã sửa với query thực tế đang dùng (`entry-repo.ts`: `aggregateOpsSummary`/`aggregateTenantBreakdown`/report queries `$match financialDate`) — key order khớp equality→sort/range.
- [ ] So diff với `KENO_INDEXES` bản đã sửa — cùng name/purpose convention.
- [ ] Ghi kết quả review vào đây + cập nhật `00-overview.md`.

## Định nghĩa Done

`BINGO18_INDEXES` hết `drawDate` trên TicketEntries, có `idx_draw_id`; câu lệnh migration ghi PR; review xong; overview cập nhật.
