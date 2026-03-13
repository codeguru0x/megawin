---
name: Lotto535 + System Reports
overview: Triển khai financial reporting cho Lotto 5/35 (per-game) + system-level reports. Tạo entity, repo, use case, worker integration. Các game khác sẽ replicate từ pattern này + rule file.
todos:
  - id: entity-system
    content: Tao packages/game-core/src/entities/financial-report.ts + export
    status: pending
  - id: entity-lotto535
    content: Tao packages/game-lotto535/src/entities/report.ts + export
    status: pending
  - id: repo-system
    content: Tao system-settle-report-repo.ts + system-outstanding-report-repo.ts trong game-core-application
    status: pending
  - id: repo-lotto535
    content: Tao settle-report-repo.ts, void-report-repo.ts, outstanding-report-repo.ts trong game-lotto535-application
    status: pending
  - id: usecase-settle
    content: Tao build-settle-report.ts use case cho lotto535
    status: pending
  - id: usecase-void
    content: Tao build-void-report.ts use case cho lotto535
    status: pending
  - id: usecase-publish
    content: Tao publish-settle-daily.ts use case trong game-core-application
    status: pending
  - id: worker-integrate
    content: Tao lambda handlers + sua settle.asl.json va void.asl.json cho worker-lotto535
    status: pending
  - id: outstanding
    content: Tao outstanding sync handler + scheduled job config
    status: pending
  - id: remove-old-lotto535
    content: Xoa report-repo.ts, build-report.ts (use case + handler + ASL step) cua lotto535
    status: pending
  - id: remove-old-core
    content: Xoa game-daily-report.ts, game-daily-report-repo.ts, game-daily-report-query-repo.ts, publish-game-report.ts cua game-core
    status: pending
isProject: false
---

# Financial Reports: System + Lotto 5/35 Implementation

Rule file: `[.cursor/rules/financial-reporting-system.mdc](.cursor/rules/financial-reporting-system.mdc)` -- doc nay la nguon su that duy nhat cho thiet ke.

## Hien trang

- `report.ts` entity CHUA TON TAI o lotto535 va game-core
- Old pattern: `report-repo.ts` dung `lotto535DailyReports` collection voi `reportType` discriminator -- GIU NGUYEN, khong sua, khong xoa. He thong moi song song.
- Settle ASL hien tai: `... -> BuildReport -> FinalizeSettle -> DispatchPayouts`
- Void ASL hien tai: `... -> DispatchRefunds -> FinalizeVoid`

## Phase 1: Entity Layer

### 1a. System entities

Tao `[packages/game-core/src/entities/financial-report.ts](packages/game-core/src/entities/financial-report.ts)`:

- Import `GameProduct` tu `game-core.enums.ts`
- Define: `SystemSettleGameDaily`, `SystemSettleTenantDaily`, `SystemOutstandingGameDaily`
- Collection constants: `SYSTEM_SETTLE_GAME_DAILY`, `SYSTEM_SETTLE_TENANT_DAILY`, `SYSTEM_OUTSTANDING_GAME_DAILY`
- Export tu `[packages/game-core/src/entities/index.ts](packages/game-core/src/entities/index.ts)`

### 1b. Lotto535 per-game entities

Tao `[packages/game-lotto535/src/entities/report.ts](packages/game-lotto535/src/entities/report.ts)`:

- Define: `SettleDrawReport`, `SettleTenantReport`, `VoidDrawReport`, `VoidPreviousSettleSnapshot`, `OutstandingDrawReport`
- Collection constants voi prefix `lotto535_`: `LOTTO535_SETTLE_DRAW_REPORTS`, `LOTTO535_SETTLE_TENANT_REPORTS`, `LOTTO535_VOID_DRAW_REPORTS`, `LOTTO535_OUTSTANDING_DRAW_REPORTS`
- Export tu `[packages/game-lotto535/src/entities/index.ts](packages/game-lotto535/src/entities/index.ts)`

## Phase 2: Repository Layer

### 2a. System repos

Tao trong `packages/game-core-application/src/infras/repos/`:

`**system-settle-report-repo.ts**`:

- Extend `GameCoreBaseRepo`
- `upsertGameDaily(report: SystemSettleGameDaily)` -- filter: `{ financialDate, gameProduct }`
- `upsertTenantDaily(report: SystemSettleTenantDaily)` -- filter: `{ financialDate, tenantId, gameProduct }`
- Tat ca dung upsert pattern tu rule Section 9

`**system-outstanding-report-repo.ts**`:

- `upsertGameOutstanding(report: SystemOutstandingGameDaily)` -- filter: `{ gameProduct }`

Export tu `[packages/game-core-application/src/infras/repos/index.ts](packages/game-core-application/src/infras/repos/index.ts)`

### 2b. Lotto535 per-game repos

Tao trong `packages/game-lotto535-application/src/infras/repos/`:

`**settle-report-repo.ts**`:

- Extend base repo, collection: `LOTTO535_SETTLE_DRAW_REPORTS` / `LOTTO535_SETTLE_TENANT_REPORTS`
- `upsertDrawReport(report: SettleDrawReport)` -- filter: `{ drawId }`
- `upsertTenantReports(reports: SettleTenantReport[])` -- bulkWrite upsert, filter: `{ drawId, tenantId }`
- `deleteByDrawId(drawId)` -- deleteMany cho ca 2 collections
- `findByDrawId(drawId)` -- tim settle draw report (dung cho void snapshot)
- `aggregateByFinancialDate(financialDate)` -- SUM cho system publish

`**void-report-repo.ts**`:

- `upsertVoidReport(report: VoidDrawReport)` -- filter: `{ drawId }`

`**outstanding-report-repo.ts**`:

- `upsertDrawReport(report: OutstandingDrawReport)` -- filter: `{ drawId }`, set `snapshotAt = now`

Export tu index.ts

## Phase 3: Use Case Layer

### 3a. BuildSettleReport (lotto535)

Tao `[packages/game-lotto535-application/src/use-cases/settle/build-settle-report.ts](packages/game-lotto535-application/src/use-cases/settle/build-settle-report.ts)`:

Input: `SettleContext` (drawId, financialDate, financials)

Logic:

1. Aggregate entries `{ drawId, status: "settled" }`:

- Group by `{ tenantId, accountId }` -> playerCount per tenant
- Group by `{ tenantId }` -> entryCount, totalStake, totalWin, totalPayout, commission, lineCount

1. Build `SettleTenantReport[]` -> `settleReportRepo.upsertTenantReports()`
2. SUM tenant reports + `context.financials` (companyTake, jackpotContribution) -> build `SettleDrawReport`
3. `settleReportRepo.upsertDrawReport(drawReport)`

Tinh `netProfit = ggr - totalCommission` (co the am).

### 3b. BuildVoidReport (lotto535)

Tao `[packages/game-lotto535-application/src/use-cases/void/build-void-report.ts](packages/game-lotto535-application/src/use-cases/void/build-void-report.ts)`:

Input: `VoidContext` (drawId, financialDate)

Logic:

1. Phase 0 -- Cleanup (void-after-settle):

- `settleReportRepo.findByDrawId(drawId)` -> neu co, snapshot vao `VoidPreviousSettleSnapshot`
- `settleReportRepo.deleteByDrawId(drawId)` -- xoa ca draw + tenant settle reports

1. Phase 1 -- Build:

- Aggregate voided entries: entryCount, playerCount, tenantCount, totalOriginalStake, totalRefundAmount
- `voidReportRepo.upsertVoidReport(voidReport)`

### 3c. PublishSettleDaily (game-core, SHARED)

Tao `[packages/game-core-application/src/use-cases/publish-settle-daily.ts](packages/game-core-application/src/use-cases/publish-settle-daily.ts)`:

Input: `{ gameProduct, financialDate, settleDrawReportCollection, settleTenantReportCollection }`

Logic:

1. Aggregate per-game `settle_draw_reports` WHERE `{ financialDate }` -> SUM metrics
2. `systemSettleReportRepo.upsertGameDaily(gameDailyReport)`
3. Aggregate per-game `settle_tenant_reports` WHERE `{ financialDate }` -> group by tenantId
4. For each tenant: `systemSettleReportRepo.upsertTenantDaily(tenantDailyReport)` voi gameProduct

**LUU Y**: Use case nay nhan collection names lam input de reuse cho moi game.

## Phase 4: Worker Integration

### 4a. Lambda handlers

Tao `apps/worker-lotto535/src/handlers/settle/build-settle-report.ts`:

- Parse event (SettleContext)
- Init repos
- Call `BuildSettleReport` use case

Tao `apps/worker-lotto535/src/handlers/void/build-void-report.ts`:

- Parse event (VoidContext)
- Init repos
- Call `BuildVoidReport` use case

Tao handlers cho PublishSettleDaily (co the chung 1 handler goi tu ca settle va void).

### 4b. Step Function ASL

Sua `[apps/worker-lotto535/src/step-functions/settle.asl.json](apps/worker-lotto535/src/step-functions/settle.asl.json)`:

- Chen `BuildSettleReport` state SAU `BuildReport`, TRUOC `FinalizeSettle`
- Chen `PublishSettleDaily` state SAU `BuildSettleReport`, TRUOC `FinalizeSettle`

Sua `[apps/worker-lotto535/src/step-functions/void.asl.json](apps/worker-lotto535/src/step-functions/void.asl.json)`:

- Chen `BuildVoidReport` state SAU `DispatchRefunds`, TRUOC `FinalizeVoid`
- Chen `PublishSettleDaily` state SAU `BuildVoidReport`, TRUOC `FinalizeVoid`

Sua `settle.ts` va `void.ts` -- them handler exports.

## Phase 5: Outstanding (Scheduled Job)

Tao `apps/worker-lotto535/src/handlers/outstanding/sync-outstanding.ts`:

- Aggregate entries WHERE `{ status: "scheduled" }` group by drawId
- Upsert `lotto535_outstanding_draw_reports` voi `snapshotAt = now`

Tao `packages/game-core-application/src/use-cases/sync-system-outstanding.ts`:

- Aggregate ALL outstanding_draw_reports per game
- Upsert `system_outstanding_game_daily`

EventBridge rule + Lambda config -- them vao SST/CDK config.

## He thong cu — XOA

Xoa toan bo code va references cua he thong report cu:

**Lotto535**:

- Xoa `packages/game-lotto535-application/src/infras/repos/report-repo.ts`
- Xoa step `BuildReport` khoi `settle.asl.json` va handler tuong ung
- Xoa `packages/game-lotto535-application/src/use-cases/settle/build-report.ts`
- Cap nhat barrel exports (index.ts) o repos va use-cases

**Game-core**:

- Xoa `packages/game-core/src/entities/game-daily-report.ts`
- Xoa `packages/game-core-application/src/infras/repos/game-daily-report-repo.ts`
- Xoa `packages/game-core-application/src/infras/repos/game-daily-report-query-repo.ts`
- Xoa `packages/game-core-application/src/use-cases/publish-game-report.ts`
- Cap nhat barrel exports (index.ts)

**LUU Y**: Chi xoa cho lotto535 + game-core trong lan nay. Cac game khac se xoa khi lam report cho game do.

## Replicate cho game khac

Sau khi lotto535 xong, cac game khac chi can:

1. Tao `report.ts` trong `packages/game-{game}/src/entities/` -- copy tu lotto535, doi prefix
2. Tao 3 repos trong `packages/game-{game}-application/src/infras/repos/` -- copy tu lotto535, doi collection
3. Tao `build-settle-report.ts` + `build-void-report.ts` -- copy tu lotto535, dieu chinh aggregation theo entry structure cua game do (vi du keno khong co lineCount, bingo18 co board structure khac)
4. Tao handlers + sua ASL trong `apps/worker-{game}/`
5. System repos + PublishSettleDaily **KHONG CAN TAO LAI** -- da share

Rule file `.cursor/rules/financial-reporting-system.mdc` co du thong tin de agent doc va lam.
