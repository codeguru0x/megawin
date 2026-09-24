---
name: Power655 Financial Reports
overview: Triển khai financial reporting cho Power 6/55 (per-game). CÓ DUAL jackpot (JP1+JP2), CÓ lineCount. jackpotContribution = JP1 + JP2.
todos:
  - id: entity-power655
    content: Tạo packages/game-power655/src/entities/report.ts + export
    status: completed
  - id: repo-power655
    content: Tạo settle-draw-report-repo.ts, settle-tenant-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts
    status: completed
  - id: entry-repo-agg
    content: Thêm aggregation methods vào entry-repo.ts
    status: completed
  - id: void-context-fix
    content: Thêm financialDate vào VoidContext + cập nhật prepare-void.ts
    status: completed
  - id: usecase-settle
    content: "Tạo build-settle-report.ts use case (LƯU Ý: jackpotContribution = JP1 + JP2)"
    status: completed
  - id: usecase-void
    content: Tạo build-void-report.ts use case
    status: completed
  - id: worker-handlers
    content: Tạo lambda handlers (build-settle-report, publish-settle-daily x2, build-void-report, sync-outstanding)
    status: completed
  - id: step-fn-settle
    content: Sửa settle.ts — thêm BuildSettleReport + PublishSettleDaily trước FinalizeSettle
    status: completed
  - id: step-fn-void
    content: Sửa void.ts — thêm BuildVoidReport + PublishSettleDaily trước FinalizeVoid
    status: completed
  - id: remove-old
    content: Xoá report-repo.ts, build-report.ts (use case + handler), step BuildReport
    status: completed
isProject: false
---

# Financial Reports: Power 6/55 Implementation

Rule file: `.cursor/rules/financial-reporting-system.mdc` — ĐỌC TOÀN BỘ trước khi code.
Reference: Lotto535 đã hoàn thành — copy pattern, đổi prefix/collection/import.

## Đặc thù Power 6/55

- **CÓ DUAL Jackpot** (JP1 + JP2): `jackpotContribution = financials.jackpot1Contribution + financials.jackpot2Contribution`
- `companyTake = financials.actualCompanyTake`
- **CÓ lineCount** trên entry
- **CÓ CheckJackpotWinner + PatchJackpotPrize** trong settle flow
- GameProduct: `GameProduct.Power655`
- Collection prefix: `power655`
- Entry collection: `power655_ticket_entries`

## Hiện trạng

- `report.ts` entity CHƯA TỒN TẠI
- Old pattern: `report-repo.ts` dùng `power655DailyReports` với `reportType` discriminator
- Settle ASL: `... → CheckSyncDone → BuildReport → FinalizeSettle → DispatchPayouts → ...`
- Void ASL: `... → CheckRefundDone → FinalizeVoid`
- VoidContext KHÔNG CÓ `financialDate` — cần thêm

## Phase 1: Entity Layer

Tạo `packages/game-power655/src/entities/report.ts`:
- Copy từ lotto535, đổi prefix `LOTTO535_` → `POWER655_`, `lotto535_` → `power655_`
- Interfaces GIỐNG HỆT lotto535
- Export qua `index.ts`

## Phase 2: Repository Layer

Tạo trong `packages/game-power655-application/src/infras/repos/`:

4 repo files — copy từ lotto535, đổi import `@megawin/game-power655/entities` + collection constants:
- `settle-draw-report-repo.ts` → `POWER655_SETTLE_DRAW_REPORTS`
- `settle-tenant-report-repo.ts` → `POWER655_SETTLE_TENANT_REPORTS`
- `void-report-repo.ts` → `POWER655_VOID_DRAW_REPORTS`
- `outstanding-report-repo.ts` → `POWER655_OUTSTANDING_DRAW_REPORTS`

Export qua `repos/index.ts`.

## Phase 3: Entry Repository — Aggregation Methods

Thêm vào `packages/game-power655-application/src/infras/repos/entry-repo.ts`:
- `aggregatePlayerCountByTenant(drawId)`
- `aggregateTenantSettleMetrics(drawId)`
- `aggregateVoidMetrics(drawId)`
- `aggregateOutstandingByDraw()`

Entry field paths GIỐNG lotto535.

## Phase 4: VoidContext Fix

Sửa `packages/game-power655-application/src/use-cases/void/types.ts`:
- Thêm `financialDate: string` vào VoidContext

Sửa `packages/game-power655-application/src/use-cases/void/prepare-void.ts`:
- Đọc `draw.financialDate` và trả về trong VoidContext

## Phase 5: Use Case Layer

**`build-settle-report.ts`** — tại `use-cases/settle/`:
- Copy từ lotto535, đổi imports
- **KHÁC BIỆT QUAN TRỌNG**: jackpotContribution tính từ DUAL jackpot:
  ```typescript
  // Power655 có 2 jackpot — tổng contribution = JP1 + JP2
  const jackpotContribution = (financials?.jackpot1Contribution ?? 0)
    + (financials?.jackpot2Contribution ?? 0);
  const companyTake = financials?.actualCompanyTake ?? 0;
  ```

**`build-void-report.ts`** — tại `use-cases/void/`:
- Copy từ lotto535, đổi imports
- Logic GIỐNG HỆT

Cập nhật barrel exports: `settle/index.ts`, `void/index.ts`.

## Phase 6: Worker Integration

### Lambda Handlers (tạo trong `apps/worker-power655/src/handlers/`)

- `settle/build-settle-report.ts`
- `settle/publish-settle-daily.ts` — GameProduct.Power655, POWER655_SETTLE_*
- `void/build-void-report.ts`
- `void/publish-settle-daily.ts`
- `outstanding/sync-outstanding.ts`

### Step Functions (chỉ sửa .ts)

Sửa `settle.ts`: Thêm BuildSettleReport + PublishSettleDaily SAU BuildReport, TRƯỚC FinalizeSettle
Sửa `void.ts`: Thêm BuildVoidReport + PublishSettleDaily TRƯỚC FinalizeVoid

## Phase 7: Xoá report cũ

- Xoá `report-repo.ts`, `build-report.ts` (use case + handler)
- Xoá step `BuildReport` khỏi `settle.ts`
- Cập nhật barrel exports
