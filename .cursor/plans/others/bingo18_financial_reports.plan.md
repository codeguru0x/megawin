---
name: Bingo18 Financial Reports
overview: Triển khai financial reporting cho Bingo 18 (per-game). KHÔNG CÓ jackpot, KHÔNG CÓ lineCount, KHÔNG CÓ PayoutCaps. Game đơn giản nhất.
todos:
  - id: entity-bingo18
    content: Tạo packages/game-bingo18/src/entities/report.ts + export
    status: done
  - id: repo-bingo18
    content: Tạo settle-draw-report-repo.ts, settle-tenant-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts
    status: done
  - id: entry-repo-agg
    content: Thêm aggregation methods vào entry-repo.ts (KHÔNG có lineCount)
    status: done
  - id: void-context-fix
    content: Thêm financialDate vào VoidContext + cập nhật prepare-void.ts
    status: done
  - id: usecase-settle
    content: Tạo build-settle-report.ts use case (KHÔNG có jackpotContribution, companyTake=financials.companyTake, NO lineCount)
    status: done
  - id: usecase-void
    content: Tạo build-void-report.ts use case
    status: done
  - id: worker-handlers
    content: Tạo lambda handlers
    status: done
  - id: step-fn-settle
    content: Sửa settle.ts — thêm BuildSettleReport + PublishSettleDaily trước FinalizeSettle
    status: done
  - id: step-fn-void
    content: Sửa void.ts — thêm BuildVoidReport + PublishSettleDaily trước FinalizeVoid
    status: done
  - id: remove-old
    content: Xoá report-repo.ts, build-report.ts (use case + handler), step BuildReport
    status: done
isProject: false
---

# Financial Reports: Bingo 18 Implementation

Rule file: `.cursor/rules/financial-reporting-system.mdc` — ĐỌC TOÀN BỘ trước khi code. Xem Section 11 cho game-specific notes.
Reference: Lotto535 đã hoàn thành — copy pattern, nhưng LƯU Ý khác biệt.

## Đặc thù Bingo 18 — KHÔNG CÓ JACKPOT, Game đơn giản nhất

- **KHÔNG CÓ Jackpot**: `jackpotContribution` KHÔNG có trong interface (khác lotto535/mega645/power655)
- `companyTake = financials.companyTake` (Bingo18 dùng field `companyTake`, KHÔNG phải `profit` hay `actualCompanyTake`)
- **KHÔNG CÓ lineCount**: Bingo18 dùng `betCount`. Trong report, `lineCount` = `undefined`
- **KHÔNG CÓ ApplyPayoutCaps** (khác Keno)
- GameProduct: `GameProduct.Bingo18`
- Collection prefix: `bingo18`
- Entry collection: `bingo18_ticket_entries`
- SettleFinancials: `{ totalRevenue, totalPrizes, totalAgentCommission, companyTake }`
- Settle flow thứ tự: `SettleEntries → CalculateFinancials → SyncTicketSummaries → BuildReport → FinalizeSettle`

## Hiện trạng

- `report.ts` entity CHƯA TỒN TẠI
- Old pattern: `report-repo.ts` dùng `bingo18DailyReports` với discriminator
- Settle flow: `PrepareSettle → SettleEntries → CalculateFinancials → SyncTicketSummaries → BuildReport → FinalizeSettle → DispatchPayouts`
- Void flow: `PrepareVoid → VoidEntries → SyncTicketSummaries → DispatchRefunds → FinalizeVoid`
- VoidContext KHÔNG CÓ `financialDate` — cần thêm

## Phase 1: Entity Layer

Tạo `packages/game-bingo18/src/entities/report.ts`:
- Copy từ lotto535, đổi prefix `LOTTO535_` → `BINGO18_`, `lotto535_` → `bingo18_`
- `lineCount` optional field — sẽ không bao giờ set
- Export qua `index.ts`

## Phase 2: Repository Layer

Tạo trong `packages/game-bingo18-application/src/infras/repos/`:

4 repo files — copy từ lotto535, đổi import + collection:
- `settle-draw-report-repo.ts` → `BINGO18_SETTLE_DRAW_REPORTS`
- `settle-tenant-report-repo.ts` → `BINGO18_SETTLE_TENANT_REPORTS`
- `void-report-repo.ts` → `BINGO18_VOID_DRAW_REPORTS`
- `outstanding-report-repo.ts` → `BINGO18_OUTSTANDING_DRAW_REPORTS`

Export qua `repos/index.ts`.

## Phase 3: Entry Repository — Aggregation Methods

Thêm vào `packages/game-bingo18-application/src/infras/repos/entry-repo.ts`:
- `aggregatePlayerCountByTenant(drawId)`
- `aggregateTenantSettleMetrics(drawId)` — **KHÔNG aggregate lineCount**
- `aggregateVoidMetrics(drawId)`
- `aggregateOutstandingByDraw()` — **KHÔNG aggregate lineCount**

## Phase 4: VoidContext Fix

Sửa `packages/game-bingo18-application/src/use-cases/void/types.ts`:
- Thêm `financialDate: string`

Sửa `packages/game-bingo18-application/src/use-cases/void/prepare-void.ts`:
- Đọc `draw.financialDate`, trả về trong VoidContext

## Phase 5: Use Case Layer

**`build-settle-report.ts`** — tại `use-cases/settle/`:
- Copy từ lotto535, đổi imports
- **KHÁC BIỆT**:
  ```typescript
  // Bingo18 KHÔNG có Jackpot — KHÔNG có field jackpotContribution trong upsert
  // companyTake — Bingo18 dùng field tên companyTake (khác Keno dùng profit)
  const companyTake = financials?.companyTake ?? 0;
  // KHÔNG set lineCount
  ```

**`build-void-report.ts`** — tại `use-cases/void/`:
- Copy từ lotto535, đổi imports. Logic GIỐNG HỆT.

Cập nhật barrel exports.

## Phase 6: Worker Integration

### Lambda Handlers
- `settle/build-settle-report.ts`
- `settle/publish-settle-daily.ts` — GameProduct.Bingo18, BINGO18_SETTLE_*
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
