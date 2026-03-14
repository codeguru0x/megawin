---
name: Mega645 Financial Reports UI
overview: "Triển khai UI báo cáo cho Mega 6/45: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs."
todos:
  - id: repo-types
    content: Tạo repos/types/ directory với settle-draw-report.types.ts, settle-tenant-report.types.ts, entry.types.ts + barrel index.ts. Migrate OutstandingGameSummary từ repo file sang types/outstanding.types.ts
    status: pending
  - id: repo-settle-draw-read
    content: Thêm READ methods vào settle-draw-report-repo (findByDateRange, aggregateSummary)
    status: pending
  - id: repo-settle-tenant-read
    content: Thêm READ methods vào settle-tenant-report-repo (findByDrawId, aggregateByTenant, findByTenantAndDateRange)
    status: pending
  - id: repo-void-read
    content: Thêm READ method findByDateRange vào void-report-repo
    status: pending
  - id: repo-outstanding-read
    content: Thêm READ method findAll vào outstanding-report-repo
    status: pending
  - id: repo-entry-read
    content: Thêm aggregatePlayersByDrawAndTenant + findByDrawTenantPlayer vào entry-repo
    status: pending
  - id: api-draws
    content: Tạo API /api/mega645/reports/draws + draws/summary + draws/[drawId]/tenants
    status: pending
  - id: api-tenants
    content: Tạo API /api/mega645/reports/tenants + tenants/[tenantId]/draws
    status: pending
  - id: api-players-entries
    content: Tạo API /api/mega645/reports/players + entries
    status: pending
  - id: api-void
    content: Tạo API /api/mega645/reports/void
    status: pending
  - id: api-outstanding
    content: Tạo API /api/mega645/reports/outstanding
    status: pending
  - id: page-financial
    content: Rewrite financial-reports/page.tsx — 2 tabs (By Draw, By Tenant) + nuqs + drill-down
    status: pending
  - id: page-outstanding
    content: Tạo outstanding/page.tsx — single view + auto-refresh
    status: pending
  - id: page-void
    content: Tạo void-reports/page.tsx — table + snapshot dialog + date filter
    status: pending
  - id: drill-sections
    content: Tạo drill-down sections (draw-tenant-breakdown, player-breakdown, entry-list, entry-detail-dialog)
    status: pending
  - id: typecheck
    content: Chạy tsc --noEmit kiểm tra không lỗi
    status: pending
isProject: false
---

# Mega 6/45 Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `mega645-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (680 dòng, mock data) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- Per-game repos có WRITE methods, cần thêm READ.
- `OutstandingGameSummary` đang khai báo inline trong `outstanding-report-repo.ts` — cần migrate sang `repos/types/`.
- Mega 6/45: CÓ `lineCount`, CÓ `jackpotContribution`, CÓ `companyTake`, 2 kỳ/ngày.
- **Giống hệt Lotto 5/35** về cấu trúc entity và report fields.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`. Xem §6.2 trong `financial-report-ui.mdc`.

## Khác biệt so với Lotto 5/35

| Aspect | Lotto 5/35 | Mega 6/45 |
|--------|-----------|-----------|
| Package | `game-lotto535` / `game-lotto535-application` | `game-mega645` / `game-mega645-application` |
| Collection prefix | `lotto535_` | `mega645_` |
| Route slug | `/games/lotto535/` | `/games/mega645/` |
| API prefix | `/api/lotto535/reports/` | `/api/mega645/reports/` |
| Entity import | `@megawin/game-lotto535/entities` | `@megawin/game-mega645/entities` |
| lineCount | CÓ | CÓ |
| jackpotContribution | CÓ | CÓ |
| companyTake | CÓ | CÓ |
| Kỳ quay/ngày | ~2 | ~2 |

**Về cấu trúc plan: GIỐNG HỆT Lotto 5/35.** Chỉ thay đổi package names, route slugs, collection prefixes, entity imports.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo thư mục `packages/game-mega645-application/src/infras/repos/types/` theo rule `mongodb-repository-architecture.mdc` §2.

Migrate `OutstandingGameSummary` từ `outstanding-report-repo.ts` sang `types/outstanding.types.ts`.

#### `types/settle-draw-report.types.ts`:

```typescript
/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Dùng cho KPI strip tab "Theo kỳ quay".
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  lineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng sau thuế (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}
```

#### `types/settle-tenant-report.types.ts`:

```typescript
/**
 * Aggregate result nhóm theo tenantId trong date range.
 * Dùng cho tab "Theo đại lý" cấp 1.
 */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  commission: number;
}
```

#### `types/entry.types.ts`:

```typescript
/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * Kết quả của $group by accountId.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}
```

#### `types/outstanding.types.ts`:

```typescript
/** Summary aggregate outstanding cho toàn game — dùng cho SyncSystemOutstanding. */
export interface OutstandingGameSummary {
  activeDrawCount: number;
  totalEntryCount: number;
  totalPlayerCount: number;
  totalTenantCount: number;
  totalOutstandingStake: number;
  totalEstimatedCommission: number;
}
```

#### `types/index.ts` (barrel):

```typescript
export type { DrawSummaryResult } from "./settle-draw-report.types";
export type { TenantAggregateSummary } from "./settle-tenant-report.types";
export type { PlayerBreakdownRow } from "./entry.types";
export type { OutstandingGameSummary } from "./outstanding.types";
```

### 1b–1f: Repo Methods

**Giống hệt Lotto 5/35** — thay đổi package imports:

- `import type { SettleDrawReport } from "@megawin/game-mega645/entities"`
- `import type { DrawSummaryResult } from "./types"`
- Các methods: `findByDateRange`, `aggregateSummary`, `findByDrawId`, `aggregateByTenant`, `findByTenantAndDateRange`, `findAll`, `aggregatePlayersByDrawAndTenant`, `findByDrawTenantPlayer`

Xem chi tiết method signatures tại plan Lotto 5/35 Phase 1 (1b–1f).

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/mega645/reports/`

| API | Route | Repo Method |
|-----|-------|-------------|
| Draws list | `GET /api/mega645/reports/draws?from&to&page&limit` | `settleDrawReportRepo.findByDateRange` |
| Draws summary | `GET /api/mega645/reports/draws/summary?from&to` | `settleDrawReportRepo.aggregateSummary` |
| Draw tenants | `GET /api/mega645/reports/draws/[drawId]/tenants` | `settleTenantReportRepo.findByDrawId` |
| Tenant summary | `GET /api/mega645/reports/tenants?from&to` | `settleTenantReportRepo.aggregateByTenant` |
| Tenant draws | `GET /api/mega645/reports/tenants/[tenantId]/draws?from&to&page&limit` | `settleTenantReportRepo.findByTenantAndDateRange` |
| Players | `GET /api/mega645/reports/players?drawId&tenantId` | `entryRepo.aggregatePlayersByDrawAndTenant` |
| Entries | `GET /api/mega645/reports/entries?drawId&tenantId&accountId` | `entryRepo.findByDrawTenantPlayer` |
| Void | `GET /api/mega645/reports/void?from&to` | `voidReportRepo.findByDateRange` |
| Outstanding | `GET /api/mega645/reports/outstanding` | `outstandingReportRepo.findAll` |

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/mega645/financial-reports/page.tsx`.

Cấu trúc **GIỐNG HỆT Lotto 5/35** Phase 3:
- Hook: `useMega645ReportFilters()` (nuqs)
- 2 tabs: "Theo kỳ quay" / "Theo đại lý"
- 4 cấp drill-down: draws → draw-tenants → players → entries
- Cột bảng **CÓ** Lines, **CÓ** Company Take, **CÓ** JP Contribution

## Phase 4: UI — Outstanding Page

Tạo `apps/backoffice/src/app/(main)/games/mega645/outstanding/page.tsx`.
Cột bảng **CÓ** Lines.

## Phase 5: UI — Void Reports Page

Tạo `apps/backoffice/src/app/(main)/games/mega645/void-reports/page.tsx`.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-mega645-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `mega645_settle_draw_reports` | ~60/tháng | Paginated ✓ |
| Financial: Tenant/Draw | `mega645_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `mega645_ticket_entries` agg | ~500/draw/tenant | Scoped drawId ✓ |
| Outstanding | `mega645_outstanding_draw_reports` | ~4 draws | Tiny ✓ |
| Void | `mega645_void_draw_reports` | Very rare | Tiny ✓ |
