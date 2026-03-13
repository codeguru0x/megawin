---
name: Keno Financial Reports
overview: Triển khai financial reporting cho Keno (per-game). KHÔNG CÓ jackpot, KHÔNG CÓ lineCount. Có ApplyPayoutCaps step đặc thù.
todos:
  - id: entity-keno
    content: Tạo packages/game-keno/src/entities/report.ts + export
    status: completed
  - id: repo-keno
    content: Tạo settle-draw-report-repo.ts, settle-tenant-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts
    status: completed
  - id: entry-repo-agg
    content: Thêm aggregation methods vào entry-repo.ts (KHÔNG có lineCount)
    status: completed
  - id: void-context-fix
    content: Thêm financialDate vào VoidContext + cập nhật prepare-void.ts
    status: completed
  - id: usecase-settle
    content: Tạo build-settle-report.ts use case (KHÔNG có jackpotContribution, companyTake=profit, NO lineCount)
    status: completed
  - id: usecase-void
    content: Tạo build-void-report.ts use case
    status: completed
  - id: worker-handlers
    content: Tạo lambda handlers
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

# Financial Reports: Keno Implementation

Rule file: `.cursor/rules/financial-reporting-system.mdc` — ĐỌC TOÀN BỘ trước khi code. Xem Section 11 cho game-specific notes.
Reference: Lotto535 đã hoàn thành — copy pattern, nhưng LƯU Ý khác biệt.

## Đặc thù Keno — KHÔNG CÓ JACKPOT

- **KHÔNG CÓ Jackpot**: `jackpotContribution` KHÔNG có trong interface (khác lotto535/mega645/power655)
- `companyTake = financials.profit` (KHÔNG phải `actualCompanyTake`)
- **KHÔNG CÓ lineCount**: Keno dùng `betCount` thay vì `lineCount`. Trong report, `lineCount` = `undefined`
- **CÓ ApplyPayoutCaps** step trong settle flow (cap bậc 8/9/10)
- GameProduct: `GameProduct.Keno`
- Collection prefix: `keno`
- Entry collection: `keno_ticket_entries`
- SettleFinancials: `{ totalRevenue, totalPrizes, totalAgentCommission, profit }`

## Hiện trạng

- `report.ts` entity CHƯA TỒN TẠI
- Old pattern: `report-repo.ts` dùng `kenoDailyReports` với discriminator
- Settle flow: `PrepareSettle → SettleEntries → ApplyPayoutCaps → SyncTicketSummaries → CalculateFinancials → BuildReport → FinalizeSettle → DispatchPayouts`
- Void flow: `PrepareVoid → VoidEntries → SyncTicketSummaries → DispatchRefunds → FinalizeVoid`
- VoidContext KHÔNG CÓ `financialDate` — cần thêm

## Phase 1: Entity Layer

Tạo `packages/game-keno/src/entities/report.ts`:
- Copy từ lotto535, đổi prefix `LOTTO535_` → `KENO_`, `lotto535_` → `keno_`
- **KHÁC BIỆT**: `lineCount` field KHÔNG CÓ trong entities (vẫn để optional `lineCount?: number` trong interface, nhưng sẽ không bao giờ được set)
- Export qua `index.ts`

## Phase 2: Repository Layer

Tạo trong `packages/game-keno-application/src/infras/repos/`:

4 repo files — copy từ lotto535, đổi import + collection:
- `settle-draw-report-repo.ts` → `KENO_SETTLE_DRAW_REPORTS`
- `settle-tenant-report-repo.ts` → `KENO_SETTLE_TENANT_REPORTS`
- `void-report-repo.ts` → `KENO_VOID_DRAW_REPORTS`
- `outstanding-report-repo.ts` → `KENO_OUTSTANDING_DRAW_REPORTS`

Export qua `repos/index.ts`.

## Phase 3: Entry Repository — Aggregation Methods

Thêm vào `packages/game-keno-application/src/infras/repos/entry-repo.ts`:
- `aggregatePlayerCountByTenant(drawId)`
- `aggregateTenantSettleMetrics(drawId)` — **KHÔNG aggregate lineCount** (bỏ `$sum: "$lineCount"`)
- `aggregateVoidMetrics(drawId)`
- `aggregateOutstandingByDraw()` — **KHÔNG aggregate lineCount**

## Phase 4: VoidContext Fix

Sửa `packages/game-keno-application/src/use-cases/void/types.ts`:
- Thêm `financialDate: string`

Sửa `packages/game-keno-application/src/use-cases/void/prepare-void.ts`:
- Đọc `draw.financialDate`, trả về trong VoidContext

## Phase 5: Use Case Layer

**`build-settle-report.ts`** — tại `use-cases/settle/`:
- Copy từ lotto535, đổi imports
- **KHÁC BIỆT**:
  ```typescript
  // Keno KHÔNG có Jackpot — KHÔNG có field jackpotContribution trong upsert
  // companyTake = profit (phần công ty thu toàn bộ sau trừ prizes + commission)
  const companyTake = financials?.profit ?? 0;
  // KHÔNG set lineCount (bỏ dòng lineCount trong upsert)
  ```

**`build-void-report.ts`** — tại `use-cases/void/`:
- Copy từ lotto535, đổi imports. Logic GIỐNG HỆT.

Cập nhật barrel exports.

## Phase 6: Worker Integration

### Lambda Handlers
- `settle/build-settle-report.ts`
- `settle/publish-settle-daily.ts` — GameProduct.Keno, KENO_SETTLE_*
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
