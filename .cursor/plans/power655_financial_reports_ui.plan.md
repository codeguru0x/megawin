---
name: Power655 Financial Reports UI
overview: "Triển khai UI báo cáo cho Power 6/55: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs. Dual Jackpot (JP1 + JP2)."
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
  - id: api-draws
    content: Tạo API /api/power655/reports/draws + draws/summary + draws/[drawId]/tenants
    status: pending
  - id: api-tenants
    content: Tạo API /api/power655/reports/tenants + tenants/[tenantId]/draws
    status: pending
  - id: api-players-entries
    content: Tạo API /api/power655/reports/players + entries
    status: pending
  - id: api-void
    content: Tạo API /api/power655/reports/void
    status: pending
  - id: api-outstanding
    content: Tạo API /api/power655/reports/outstanding
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

# Power 6/55 Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `power655-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (668 dòng, mock data) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- Per-game repos có WRITE methods, cần thêm READ.
- `OutstandingGameSummary` đang khai báo inline trong `outstanding-report-repo.ts` — cần migrate sang `repos/types/`.
- Power 6/55: CÓ `lineCount`, CÓ `jackpotContribution`, CÓ `companyTake`, 2 kỳ/ngày.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`.

## Khác biệt so với Lotto 5/35

| Aspect | Lotto 5/35 | Power 6/55 |
|--------|-----------|------------|
| Package | `game-lotto535` / `game-lotto535-application` | `game-power655` / `game-power655-application` |
| Collection prefix | `lotto535_` | `power655_` |
| Route slug | `/games/lotto535/` | `/games/power655/` |
| API prefix | `/api/lotto535/reports/` | `/api/power655/reports/` |
| Entity import | `@megawin/game-lotto535/entities` | `@megawin/game-power655/entities` |
| Jackpot | Single JP | **Dual JP (JP1 + JP2)** |

### ĐẶC BIỆT: Dual Jackpot

Power 6/55 có **2 pool Jackpot riêng biệt** (JP1 = Giải Đặc biệt, JP2 = Giải Phụ đặc biệt).

- Entity `SettleDrawReport.jackpotContribution` = **tổng** `jackpot1Contribution + jackpot2Contribution`
- `DrawFinancial` lưu chi tiết: `jackpot1Contribution`, `jackpot2Contribution`, `jp1Overflow`
- **UI report dùng `jackpotContribution` (tổng)** — không cần tách JP1/JP2 trên bảng báo cáo.
- Nếu cần chi tiết JP1/JP2 → xem tại trang Jackpot Management (`/games/power655/jackpot/`).

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo thư mục `packages/game-power655-application/src/infras/repos/types/` theo rule `mongodb-repository-architecture.mdc` §2.

Migrate `OutstandingGameSummary` từ `outstanding-report-repo.ts` sang `types/outstanding.types.ts`.

Types **GIỐNG HỆT Lotto 5/35** (cả `lineCount` lẫn `jackpotContribution` đều CÓ):
- `settle-draw-report.types.ts` → `DrawSummaryResult` (CÓ `lineCount`)
- `settle-tenant-report.types.ts` → `TenantAggregateSummary` (CÓ `lineCount`)
- `entry.types.ts` → `PlayerBreakdownRow` (CÓ `lineCount`)
- `outstanding.types.ts` → `OutstandingGameSummary` (migrate từ repo)
- `index.ts` → barrel re-export

### 1b–1f: Repo Methods

**Giống hệt Lotto 5/35** — thay đổi package imports sang `@megawin/game-power655/entities`.

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/power655/reports/`

| API | Route | Repo Method |
|-----|-------|-------------|
| Draws list | `GET /api/power655/reports/draws?from&to&page&limit` | `settleDrawReportRepo.findByDateRange` |
| Draws summary | `GET /api/power655/reports/draws/summary?from&to` | `settleDrawReportRepo.aggregateSummary` |
| Draw tenants | `GET /api/power655/reports/draws/[drawId]/tenants` | `settleTenantReportRepo.findByDrawId` |
| Tenant summary | `GET /api/power655/reports/tenants?from&to` | `settleTenantReportRepo.aggregateByTenant` |
| Tenant draws | `GET /api/power655/reports/tenants/[tenantId]/draws?from&to&page&limit` | `settleTenantReportRepo.findByTenantAndDateRange` |
| Players | `GET /api/power655/reports/players?drawId&tenantId` | `entryRepo.aggregatePlayersByDrawAndTenant` |
| Entries | `GET /api/power655/reports/entries?drawId&tenantId&accountId` | `entryRepo.findByDrawTenantPlayer` |
| Void | `GET /api/power655/reports/void?from&to` | `voidReportRepo.findByDateRange` |
| Outstanding | `GET /api/power655/reports/outstanding` | `outstandingReportRepo.findAll` |

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/power655/financial-reports/page.tsx`.

Cấu trúc **GIỐNG HỆT Lotto 5/35** Phase 3:
- Hook: `usePower655ReportFilters()` (nuqs)
- 2 tabs: "Theo kỳ quay" / "Theo đại lý"
- 4 cấp drill-down
- Cột bảng **CÓ** Lines, **CÓ** Company Take, **CÓ** JP Contribution (tổng JP1+JP2)

## Phase 4: UI — Outstanding Page

Tạo `apps/backoffice/src/app/(main)/games/power655/outstanding/page.tsx`. Cột bảng **CÓ** Lines.

## Phase 5: UI — Void Reports Page

Tạo `apps/backoffice/src/app/(main)/games/power655/void-reports/page.tsx`.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-power655-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `power655_settle_draw_reports` | ~60/tháng | Paginated ✓ |
| Financial: Tenant/Draw | `power655_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `power655_ticket_entries` agg | ~500/draw/tenant | Scoped drawId ✓ |
| Outstanding | `power655_outstanding_draw_reports` | ~4 draws | Tiny ✓ |
| Void | `power655_void_draw_reports` | Very rare | Tiny ✓ |
