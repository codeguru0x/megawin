---
name: Keno Financial Reports UI
overview: "Triển khai UI báo cáo cho Keno: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs. KHÔNG lineCount, KHÔNG JP. ~120 kỳ/ngày → pagination quan trọng."
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
    content: Tạo tất cả API routes tại /api/keno/reports/ (draws, tenants, players, entries, void, outstanding)
    status: pending
  - id: page-financial
    content: Rewrite financial-reports/page.tsx — 2 tabs + nuqs + drill-down. BỎ cột Lines + JP
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

# Keno Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `keno-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (mock/placeholder) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- `OutstandingGameSummary` đang inline trong repo file — cần migrate sang `repos/types/`.
- Keno: **KHÔNG CÓ** `lineCount`, **KHÔNG CÓ** `jackpotContribution`, CÓ `companyTake`.
- **~120 kỳ quay/ngày** (mỗi 8 phút) → pagination CỰC KỲ quan trọng.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`.

## Khác biệt so với Lotto 5/35

| Aspect | Lotto 5/35 | Keno |
|--------|-----------|------|
| Package | `game-lotto535` / `game-lotto535-application` | `game-keno` / `game-keno-application` |
| Collection prefix | `lotto535_` | `keno_` |
| Route slug | `/games/lotto535/` | `/games/keno/` |
| API prefix | `/api/lotto535/reports/` | `/api/keno/reports/` |
| Entity import | `@megawin/game-lotto535/entities` | `@megawin/game-keno/entities` |
| lineCount | **CÓ** | **KHÔNG** |
| jackpotContribution | **CÓ** | **KHÔNG** |
| companyTake | CÓ | CÓ |
| Kỳ quay/ngày | ~2 | **~120** |

### KHÁC BIỆT QUAN TRỌNG

1. **BỎ cột Lines** trong TẤT CẢ bảng (draw list, tenant breakdown, player breakdown, outstanding).
2. **BỎ cột JP Contribution** trong tất cả bảng.
3. **Pagination mặc định 20 rows** — ~120 kỳ/ngày = ~3,600/tháng → phải paginated.
4. Types `DrawSummaryResult`, `TenantAggregateSummary`, `PlayerBreakdownRow` **KHÔNG CÓ field `lineCount`**.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo `packages/game-keno-application/src/infras/repos/types/` theo rule `mongodb-repository-architecture.mdc` §2.

#### `types/settle-draw-report.types.ts`:

```typescript
/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Keno: KHÔNG CÓ lineCount, KHÔNG CÓ jackpotContribution.
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
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
/** Keno: KHÔNG CÓ lineCount. */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  commission: number;
}
```

#### `types/entry.types.ts`:

```typescript
/** Keno: KHÔNG CÓ lineCount. */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}
```

#### `types/outstanding.types.ts` + `types/index.ts`: Barrel re-export tất cả.

### 1b–1f: Repo Methods

**Giống Lotto 5/35 về method signatures** — thay imports sang `@megawin/game-keno/entities`.

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/keno/reports/` — 9 routes giống Lotto 5/35.

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/keno/financial-reports/page.tsx`.

- Hook: `useKenoReportFilters()` (nuqs)
- 2 tabs: "Theo kỳ quay" / "Theo đại lý"
- 4 cấp drill-down
- **BỎ cột Lines** và **BỎ cột JP Contribution** trong tất cả bảng
- Cột bảng Draw level: Kỳ quay | Ngày TC | Entries | Players | Tenants | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Company Take | Payout %
- KPI Strip: 5 cards — Kỳ Quay, Doanh Thu, Trả Thưởng (+ payout%), GGR (+ margin%), Lợi Nhuận Ròng

### LƯU Ý PAGINATION

~120 kỳ/ngày → 1 tháng = ~3,600 draws. **BẮT BUỘC** pagination 20 rows/page cho draw list.

## Phase 4: UI — Outstanding Page

Tạo `apps/backoffice/src/app/(main)/games/keno/outstanding/page.tsx`.
Cột bảng **KHÔNG CÓ** Lines. Keno có thể có ~10+ active draws cùng lúc.

## Phase 5: UI — Void Reports Page

Tạo `apps/backoffice/src/app/(main)/games/keno/void-reports/page.tsx`.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-keno-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `keno_settle_draw_reports` | **~3,600/tháng** | **Paginated BẮT BUỘC** ✓ |
| Financial: Tenant/Draw | `keno_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `keno_ticket_entries` agg | ~200/draw/tenant | Scoped drawId ✓ |
| Outstanding | `keno_outstanding_draw_reports` | ~10 draws | Small ✓ |
| Void | `keno_void_draw_reports` | Very rare | Tiny ✓ |
