---
name: Max3D Financial Reports UI
overview: "Triển khai UI báo cáo cho Max 3D: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs. KHÔNG có Jackpot."
todos:
  - id: repo-types
    content: Tạo repos/types/ directory với settle-draw-report.types.ts, settle-tenant-report.types.ts, entry.types.ts + barrel index.ts. Migrate OutstandingGameSummary sang types/outstanding.types.ts
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
  - id: api-routes
    content: Tạo tất cả API routes tại /api/max3d/reports/ (draws, tenants, players, entries, void, outstanding)
    status: pending
  - id: page-financial
    content: Rewrite financial-reports/page.tsx — 2 tabs + nuqs + drill-down. BỎ cột JP Contribution
    status: pending
  - id: page-outstanding
    content: Tạo outstanding/page.tsx — single view + auto-refresh
    status: pending
  - id: page-void
    content: Tạo void-reports/page.tsx — table + snapshot dialog + date filter
    status: pending
  - id: typecheck
    content: Chạy tsc --noEmit kiểm tra không lỗi
    status: pending
isProject: false
---

# Max 3D Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `max3d-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (mock data) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- `OutstandingGameSummary` đang inline trong repo file — cần migrate sang `repos/types/`.
- Max 3D: CÓ `lineCount`, CÓ `companyTake`, **KHÔNG CÓ** `jackpotContribution`, 2 kỳ/ngày.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`.

## Khác biệt so với Lotto 5/35

| Aspect | Lotto 5/35 | Max 3D |
|--------|-----------|--------|
| Package | `game-lotto535` / `game-lotto535-application` | `game-max3d` / `game-max3d-application` |
| Collection prefix | `lotto535_` | `max3d_` |
| Route slug | `/games/lotto535/` | `/games/max3d/` |
| API prefix | `/api/lotto535/reports/` | `/api/max3d/reports/` |
| Entity import | `@megawin/game-lotto535/entities` | `@megawin/game-max3d/entities` |
| lineCount | CÓ | CÓ |
| jackpotContribution | **CÓ** | **KHÔNG** |
| companyTake | CÓ | CÓ |

### KHÔNG CÓ Jackpot

- Entity `SettleDrawReport` **KHÔNG có field** `jackpotContribution`.
- **BỎ cột JP Contribution** trong tất cả bảng.
- Cột bảng Draw level: Kỳ quay | Ngày TC | Entries | Players | Tenants | Lines | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Company Take | Payout %
- KPI Strip: 5 cards (bỏ JP Contribution) — Kỳ Quay, Doanh Thu, Trả Thưởng (+ payout%), GGR (+ margin%), Lợi Nhuận Ròng.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo `packages/game-max3d-application/src/infras/repos/types/` theo rule `mongodb-repository-architecture.mdc` §2.

#### `types/settle-draw-report.types.ts`:

```typescript
/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Max 3D: CÓ lineCount, KHÔNG CÓ jackpotContribution.
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  lineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}
```

#### `types/settle-tenant-report.types.ts`:

```typescript
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

#### `types/outstanding.types.ts` + `types/index.ts`: Giống Lotto 5/35.

### 1b–1f: Repo Methods

**Giống Lotto 5/35** — thay imports sang `@megawin/game-max3d/entities`.

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/max3d/reports/`

Endpoints **GIỐNG Lotto 5/35** — 9 routes (draws, summary, draw-tenants, tenants, tenant-draws, players, entries, void, outstanding).

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/max3d/financial-reports/page.tsx`.

- Hook: `useMax3DReportFilters()` (nuqs)
- 2 tabs, 4 cấp drill-down
- **BỎ cột JP Contribution** trong tất cả bảng
- CÓ cột Lines, CÓ cột Company Take

## Phase 4–5: Outstanding + Void Pages

Giống Lotto 5/35. Outstanding CÓ cột Lines.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-max3d-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `max3d_settle_draw_reports` | ~60/tháng | Paginated ✓ |
| Financial: Tenant/Draw | `max3d_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `max3d_ticket_entries` agg | ~500/draw/tenant | Scoped drawId ✓ |
| Outstanding | `max3d_outstanding_draw_reports` | ~4 draws | Tiny ✓ |
| Void | `max3d_void_draw_reports` | Very rare | Tiny ✓ |
