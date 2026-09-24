---
name: Mega645 Financial Reports
overview: Triển khai financial reporting cho Mega 6/45 (per-game). CÓ jackpot (single), CÓ lineCount. Copy pattern từ Lotto535 đã hoàn thành.
todos:
  - id: entity-mega645
    content: Tạo packages/game-mega645/src/entities/report.ts + export
    status: completed
  - id: repo-mega645
    content: Tạo settle-draw-report-repo.ts, settle-tenant-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts
    status: completed
  - id: entry-repo-agg
    content: Thêm aggregation methods vào entry-repo.ts (aggregatePlayerCountByTenant, aggregateTenantSettleMetrics, aggregateVoidMetrics, aggregateOutstandingByDraw)
    status: completed
  - id: void-context-fix
    content: Thêm financialDate vào VoidContext + cập nhật prepare-void.ts
    status: completed
  - id: usecase-settle
    content: Tạo build-settle-report.ts use case
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

# Financial Reports: Mega 6/45 Implementation

Rule file: `.cursor/rules/financial-reporting-system.mdc` — ĐỌC TOÀN BỘ trước khi code.
Reference: Lotto535 đã hoàn thành — copy pattern, đổi prefix/collection/import.

## Đặc thù Mega 6/45

- **CÓ Jackpot** (single): `jackpotContribution` lấy từ `financials.jackpotContribution`, `companyTake` từ `financials.actualCompanyTake`
- **CÓ lineCount** trên entry
- **CÓ CheckJackpotWinner + PatchJackpotPrize** trong settle flow (conditional)
- GameProduct: `GameProduct.Mega645`
- Collection prefix: `mega645`
- Entry collection: `mega645_ticket_entries`

## Hiện trạng

- `report.ts` entity CHƯA TỒN TẠI
- Old pattern: `report-repo.ts` dùng `mega645DailyReports` collection với `reportType` discriminator
- Settle ASL: `... → CheckSyncDone → BuildReport → FinalizeSettle → DispatchPayouts → ...`
- Void ASL: `... → CheckRefundDone → FinalizeVoid`
- VoidContext KHÔNG CÓ `financialDate` — cần thêm

## Phase 1: Entity Layer

Tạo `packages/game-mega645/src/entities/report.ts`:

- Copy từ `packages/game-lotto535/src/entities/report.ts`
- Đổi prefix: `LOTTO535_` → `MEGA645_`, `lotto535_` → `mega645_`
- Interfaces GIỐNG HỆT: SettleDrawReport, SettleTenantReport, VoidDrawReport, VoidPreviousSettleSnapshot, OutstandingDrawReport
- `lineCount` là optional field — Mega645 CÓ lineCount
- Export qua `packages/game-mega645/src/entities/index.ts`

## Phase 2: Repository Layer

Tạo trong `packages/game-mega645-application/src/infras/repos/`:

`**settle-draw-report-repo.ts`**:

- Copy từ lotto535 `settle-draw-report-repo.ts`
- Đổi import: `@megawin/game-mega645/entities`
- Đổi collection: `MEGA645_SETTLE_DRAW_REPORTS`
- Methods: `upsertDrawReport`, `deleteByDrawId`, `findByDrawId`

`**settle-tenant-report-repo.ts`**:

- Copy từ lotto535 `settle-tenant-report-repo.ts`
- Đổi import + collection: `MEGA645_SETTLE_TENANT_REPORTS`
- Methods: `upsertTenantReports` (bulkWrite), `deleteByDrawId`

`**void-report-repo.ts**`:

- Copy từ lotto535
- Đổi collection: `MEGA645_VOID_DRAW_REPORTS`
- Method: `upsertVoidReport`

`**outstanding-report-repo.ts**`:

- Copy từ lotto535
- Đổi collection: `MEGA645_OUTSTANDING_DRAW_REPORTS`
- Methods: `upsertDrawReport`, `aggregateForGame`

Export tất cả qua `repos/index.ts`.

## Phase 3: Entry Repository — Aggregation Methods

Thêm vào `packages/game-mega645-application/src/infras/repos/entry-repo.ts`:

Copy 4 methods từ lotto535 `entry-repo.ts`:

1. `aggregatePlayerCountByTenant(drawId)` — group by { tenantId, accountId } → playerCount
2. `aggregateTenantSettleMetrics(drawId)` — group by tenantId → entryCount, lineCount, totalStake, totalWin, totalPayout, totalCommission
3. `aggregateVoidMetrics(drawId)` — void entries: entryCount, playerCount, tenantCount, totalOriginalStake, totalRefundAmount
4. `aggregateOutstandingByDraw()` — scheduled entries group by drawId

**LƯU Ý**: Entry field paths GIỐNG lotto535 — `amount`, `payout.winAmount`, `payout.payoutAmount`, `tenant.commissionAmount`, `lineCount`, `voidInfo.originalAmount`, `voidInfo.refundAmount`.

## Phase 4: VoidContext Fix

Sửa `packages/game-mega645-application/src/use-cases/void/types.ts`:

- Thêm `financialDate: string` vào `VoidContext`

Sửa `packages/game-mega645-application/src/use-cases/void/prepare-void.ts`:

- Đọc `draw.financialDate` và trả về trong VoidContext

## Phase 5: Use Case Layer

`**build-settle-report.ts`** — tại `use-cases/settle/`:

- Copy từ lotto535
- Đổi imports: dùng mega645 repos + entities
- Logic GIỐNG HỆT: aggregate entries → upsert tenant reports → upsert draw report
- `companyTake = financials?.actualCompanyTake ?? 0`
- `jackpotContribution = financials?.jackpotContribution ?? 0`

`**build-void-report.ts`** — tại `use-cases/void/`:

- Copy từ lotto535
- Đổi imports: dùng mega645 repos
- Logic GIỐNG HỆT: snapshot settle → delete settle → aggregate void → upsert void report

Cập nhật barrel exports: `settle/index.ts`, `void/index.ts`.

## Phase 6: Worker Integration

### Lambda Handlers

Tạo trong `apps/worker-mega645/src/handlers/`:

`**settle/build-settle-report.ts**`: Import BuildSettleReportUseCase, parse SettleContext
`**settle/publish-settle-daily.ts**`: Import PublishSettleDailyUseCase, truyền GameProduct.Mega645 + MEGA645_SETTLE_DRAW_REPORTS + MEGA645_SETTLE_TENANT_REPORTS
`**void/build-void-report.ts**`: Import BuildVoidReportUseCase, parse VoidContext
`**void/publish-settle-daily.ts**`: Import PublishSettleDailyUseCase (reuse)
`**outstanding/sync-outstanding.ts**`: Aggregate scheduled entries → upsert outstanding reports → call SyncSystemOutstandingUseCase

### Step Functions (chỉ sửa .ts, KHÔNG tạo .asl.json)

Sửa `apps/worker-mega645/src/step-functions/settle.ts`:

- Thêm `BuildSettleReport` state SAU `BuildReport`, TRƯỚC `FinalizeSettle`
- Thêm `PublishSettleDaily` state SAU `BuildSettleReport`, TRƯỚC `FinalizeSettle`

Sửa `apps/worker-mega645/src/step-functions/void.ts`:

- Thêm `BuildVoidReport` state SAU `CheckRefundDone` (done branch), TRƯỚC `FinalizeVoid`
- Thêm `PublishSettleDaily` state SAU `BuildVoidReport`, TRƯỚC `FinalizeVoid`

## Phase 7: Xoá report cũ

- Xoá `packages/game-mega645-application/src/infras/repos/report-repo.ts`
- Xoá `packages/game-mega645-application/src/use-cases/settle/build-report.ts`
- Xoá `apps/worker-mega645/src/handlers/settle/build-report.ts`
- Xoá step `BuildReport` khỏi `settle.ts` step function
- Cập nhật barrel exports (repos/index.ts, settle/index.ts)

