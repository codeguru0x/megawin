---
name: Max3D Financial Reports
overview: Triển khai financial reporting cho Max 3D (per-game). KHÔNG CÓ jackpot, CÓ lineCount. Settle flow đơn giản (7 steps).
todos:
  - id: entity-max3d
    content: Tạo packages/game-max3d/src/entities/report.ts + export
    status: pending
  - id: repo-max3d
    content: Tạo settle-draw-report-repo.ts, settle-tenant-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts
    status: pending
  - id: entry-repo-agg
    content: Thêm aggregation methods vào entry-repo.ts (CÓ lineCount)
    status: pending
  - id: void-context-fix
    content: Thêm financialDate vào VoidContext + cập nhật prepare-void.ts
    status: pending
  - id: usecase-settle
    content: Tạo build-settle-report.ts use case (KHÔNG có jackpotContribution, companyTake=profit)
    status: pending
  - id: usecase-void
    content: Tạo build-void-report.ts use case
    status: pending
  - id: worker-handlers
    content: Tạo lambda handlers
    status: pending
  - id: step-fn-settle
    content: Sửa settle.ts — thêm BuildSettleReport + PublishSettleDaily trước FinalizeSettle
    status: pending
  - id: step-fn-void
    content: Sửa void.ts — thêm BuildVoidReport + PublishSettleDaily trước FinalizeVoid
    status: pending
  - id: remove-old
    content: Xoá report-repo.ts, build-report.ts (use case + handler), step BuildReport
    status: pending
isProject: false
---

# Financial Reports: Max 3D Implementation

Rule file: `.cursor/rules/financial-reporting-system.mdc` — ĐỌC TOÀN BỘ trước khi code. Xem Section 11 cho game-specific notes.
Reference: Lotto535 đã hoàn thành — copy pattern, nhưng LƯU Ý khác biệt.

## Đặc thù Max 3D — KHÔNG CÓ JACKPOT, CÓ lineCount

- **KHÔNG CÓ Jackpot**: `jackpotContribution` KHÔNG có trong interface (khác lotto535/mega645/power655)
- `companyTake = financials.profit` (profit = totalRevenue - totalFixedPrizes - totalAgentCommission)
- **CÓ lineCount** trên entry (lines/pairs per board)
- **KHÔNG CÓ ApplyPayoutCaps, KHÔNG CÓ CheckJackpotWinner**
- GameProduct: `GameProduct.Max3d`
- Collection prefix: `max3d`
- Entry collection: `max3d_ticket_entries`
- SettleFinancials: `{ totalRevenue, totalFixedPrizes, totalAgentCommission, profit }`
- Old report collection: `max3dDailyReports` (extends AbstractReportRepository)

## Hiện trạng

- `report.ts` entity CHƯA TỒN TẠI
- Settle flow: `PrepareSettle → SettleEntries → SyncTicketSummaries → CalculateFinancials → BuildReport → FinalizeSettle → DispatchPayouts`
- Void flow: `PrepareVoid → VoidEntries → SyncTicketSummaries → DispatchRefunds → FinalizeVoid`
- VoidContext KHÔNG CÓ `financialDate` — cần thêm
- KHÔNG CÓ .asl.json files — chỉ có .ts

## Phase 1: Entity Layer

Tạo `packages/game-max3d/src/entities/report.ts`:
- Copy từ lotto535, đổi prefix `LOTTO535_` → `MAX3D_`, `lotto535_` → `max3d_`
- `lineCount` optional field — Max3D CÓ lineCount
- Export qua `index.ts`

## Phase 2: Repository Layer

Tạo trong `packages/game-max3d-application/src/infras/repos/`:

4 repo files — copy từ lotto535, đổi import + collection:
- `settle-draw-report-repo.ts` → `MAX3D_SETTLE_DRAW_REPORTS`
- `settle-tenant-report-repo.ts` → `MAX3D_SETTLE_TENANT_REPORTS`
- `void-report-repo.ts` → `MAX3D_VOID_DRAW_REPORTS`
- `outstanding-report-repo.ts` → `MAX3D_OUTSTANDING_DRAW_REPORTS`

Export qua `repos/index.ts`.

## Phase 3: Entry Repository — Aggregation Methods

Thêm vào `packages/game-max3d-application/src/infras/repos/entry-repo.ts`:
- `aggregatePlayerCountByTenant(drawId)`
- `aggregateTenantSettleMetrics(drawId)` — CÓ `$sum: "$lineCount"` (giống lotto535)
- `aggregateVoidMetrics(drawId)`
- `aggregateOutstandingByDraw()` — CÓ lineCount

## Phase 4: VoidContext Fix

Sửa `packages/game-max3d-application/src/use-cases/void/types.ts`:
- Thêm `financialDate: string`

Sửa `packages/game-max3d-application/src/use-cases/void/prepare-void.ts`:
- Đọc `draw.financialDate`, trả về trong VoidContext

## Phase 5: Use Case Layer

**`build-settle-report.ts`** — tại `use-cases/settle/`:
- Copy từ lotto535, đổi imports
- **KHÁC BIỆT**:
  ```typescript
  // Max3D KHÔNG có Jackpot — KHÔNG có field jackpotContribution trong upsert
  // companyTake = profit
  const companyTake = financials?.profit ?? 0;
  ```

**`build-void-report.ts`** — tại `use-cases/void/`:
- Copy từ lotto535, đổi imports. Logic GIỐNG HỆT.

Cập nhật barrel exports.

## Phase 6: Worker Integration

### Lambda Handlers
- `settle/build-settle-report.ts`
- `settle/publish-settle-daily.ts` — GameProduct.Max3d, MAX3D_SETTLE_*
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
