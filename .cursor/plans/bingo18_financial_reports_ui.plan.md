---
name: Bingo18 Financial Reports UI
overview: "Triển khai UI báo cáo cho Bingo 18: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs. KHÔNG lineCount, KHÔNG JP. ~160 kỳ/ngày → pagination quan trọng nhất hệ thống."
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
    content: Tạo tất cả API routes tại /api/bingo18/reports/ (draws, tenants, players, entries, void, outstanding)
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

# Bingo 18 Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `bingo18-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (mock/placeholder) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- `OutstandingGameSummary` đang inline trong repo file — cần migrate sang `repos/types/`.
- Bingo 18: **KHÔNG CÓ** `lineCount`, **KHÔNG CÓ** `jackpotContribution`, CÓ `companyTake`.
- **~160 kỳ quay/ngày** (mỗi 6 phút) → pagination CỰC KỲ quan trọng — **CAO NHẤT** hệ thống.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`.

## Khác biệt so với Keno

| Aspect | Keno | Bingo 18 |
|--------|------|----------|
| Package | `game-keno` / `game-keno-application` | `game-bingo18` / `game-bingo18-application` |
| Collection prefix | `keno_` | `bingo18_` |
| Route slug | `/games/keno/` | `/games/bingo18/` |
| API prefix | `/api/keno/reports/` | `/api/bingo18/reports/` |
| Entity import | `@megawin/game-keno/entities` | `@megawin/game-bingo18/entities` |
| Kỳ quay/ngày | ~120 (8 phút) | **~160 (6 phút)** |

**Cấu trúc plan GIỐNG HỆT Keno** (KHÔNG lineCount, KHÔNG JP). Chỉ thay package names, route slugs.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo `packages/game-bingo18-application/src/infras/repos/types/` — **GIỐNG HỆT Keno** (KHÔNG `lineCount`, KHÔNG `jackpotContribution`).

### 1b–1f: Repo Methods

**Giống Keno** — thay imports sang `@megawin/game-bingo18/entities`.

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/bingo18/reports/` — 9 routes giống Keno.

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/bingo18/financial-reports/page.tsx`.

- Hook: `useBingo18ReportFilters()` (nuqs)
- 2 tabs, 4 cấp drill-down
- **BỎ cột Lines** và **BỎ cột JP Contribution**
- KPI Strip: 5 cards (giống Keno)

### LƯU Ý PAGINATION

**~160 kỳ/ngày** → 1 tháng = ~4,800 draws. **CAO NHẤT** hệ thống. Pagination 20 rows/page BẮT BUỘC.

## Phase 4–5: Outstanding + Void Pages

Giống Keno. Bingo 18 có thể có ~10+ active draws cùng lúc.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-bingo18-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `bingo18_settle_draw_reports` | **~4,800/tháng** | **Paginated BẮT BUỘC** ✓ |
| Financial: Tenant/Draw | `bingo18_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `bingo18_ticket_entries` agg | ~200/draw/tenant | Scoped drawId ✓ |
| Outstanding | `bingo18_outstanding_draw_reports` | ~10 draws | Small ✓ |
| Void | `bingo18_void_draw_reports` | Very rare | Tiny ✓ |
