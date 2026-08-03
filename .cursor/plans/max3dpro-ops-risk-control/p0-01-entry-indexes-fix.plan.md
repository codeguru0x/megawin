# p0-01 — Sửa index `max3d_pro_ticket_entries`: `drawDate` → `financialDate` + thêm `idx_draw_id`

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §2.2.1, §3.7.
> **Phase:** P0 · **Phụ thuộc:** — · **Blocks:** p0-02.
> **Plan mẫu:** `../max3d-ops-risk-control/p0-01-entry-indexes-fix.plan.md` — làm Y HỆT trên package Pro.

## Việc cần làm

`packages/game-max3dpro/src/indexes/index.ts` (hiện trạng đã đối chiếu 30/07: 3 index `drawDate` sai dòng 74–87, index đúng `idx_tenant_financialDate_status` sẵn có dòng 104):

| Index hiện tại (SAI) | Hành động |
|---|---|
| `{ tenantId: 1, accountId: 1, drawDate: -1 }` `idx_tenant_account_drawDate` | Đổi key → `financialDate: -1`, name `idx_tenant_account_financialDate` |
| `{ tenantId: 1, drawDate: 1, status: 1 }` `idx_tenant_drawDate_status` | **XOÁ HẲN** — sửa xong sẽ trùng `idx_tenant_financialDate_status` sẵn có |
| `{ drawDate: 1, status: 1 }` `idx_drawDate_status` | Đổi key → `{ financialDate: 1, status: 1 }`, name `idx_financialDate_status` |

Thêm `idx_draw_id` `{ drawId: 1, _id: 1 }` trên `Max3dproCollections.TicketEntries` (copy entry + purpose từ Max 3D p0-01). Migration DBA ghi PR (drop 3 + create 2 + create idx_draw_id).

## Không làm / Verify / Review sau triển khai / Done

Y hệt Max 3D p0-01 (thay package `@megawin/game-max3dpro`, collection `max3d_pro_*`): không index mới khác, không multikey trên `triplets`; grep `drawDate` chỉ còn match Doc có field thật; review đối chiếu query `entry-repo.ts` Pro; cập nhật `00-overview.md`.
