---
name: Max3DPro Financial Reports UI
overview: "Triển khai UI báo cáo cho Max 3D Pro: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs. KHÔNG có Jackpot."
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
    content: Tạo tất cả API routes tại /api/max3dpro/reports/ (draws, tenants, players, entries, void, outstanding)
    status: completed
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
    status: completed
isProject: false
---

# Max 3D Pro Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `max3dpro-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (mock data) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- `OutstandingGameSummary` đang inline trong repo file — cần migrate sang `repos/types/`.
- Max 3D Pro: CÓ `lineCount` (pairs), CÓ `companyTake`, **KHÔNG CÓ** `jackpotContribution`, 2 kỳ/ngày.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` + `@megawin/shared/utils/date`.

## Khác biệt so với Max 3D

| Aspect | Max 3D | Max 3D Pro |
|--------|--------|------------|
| Package | `game-max3d` / `game-max3d-application` | `game-max3dpro` / `game-max3dpro-application` |
| Collection prefix | `max3d_` | `max3dpro_` |
| Route slug | `/games/max3d/` | `/games/max3dpro/` |
| API prefix | `/api/max3d/reports/` | `/api/max3dpro/reports/` |
| Entity import | `@megawin/game-max3d/entities` | `@megawin/game-max3dpro/entities` |
| lineCount semantics | Lines (numbers) | Pairs (cặp số) |

**Cấu trúc plan GIỐNG HỆT Max 3D.** Chỉ thay package names, route slugs, collection prefixes.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo `packages/game-max3dpro-application/src/infras/repos/types/` — **GIỐNG HỆT Max 3D** (CÓ `lineCount`, KHÔNG CÓ `jackpotContribution`).

### 1b–1f: Repo Methods

**Giống Max 3D** — thay imports sang `@megawin/game-max3dpro/entities`.

## Phase 2: API Route Handlers

Base path: `apps/backoffice/src/app/api/max3dpro/reports/` — 9 routes giống Max 3D.

## Phase 3: UI — Financial Reports Page (2 tabs)

Rewrite `apps/backoffice/src/app/(main)/games/max3dpro/financial-reports/page.tsx`.

- Hook: `useMax3DProReportFilters()` (nuqs)
- 2 tabs, 4 cấp drill-down
- **BỎ cột JP Contribution**, CÓ cột Lines (Pairs), CÓ cột Company Take

## Phase 4–5: Outstanding + Void Pages

Giống Max 3D.

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-max3dpro-application && pnpm tsc --noEmit`

## Performance Summary

| Page | Data Source | Max Records | Safe? |
|------|-----------|-------------|-------|
| Financial: Draw List | `max3dpro_settle_draw_reports` | ~60/tháng | Paginated ✓ |
| Financial: Tenant/Draw | `max3dpro_settle_tenant_reports` | ~10/draw | Tiny ✓ |
| Financial: Players | `max3dpro_ticket_entries` agg | ~500/draw/tenant | Scoped drawId ✓ |
| Outstanding | `max3dpro_outstanding_draw_reports` | ~4 draws | Tiny ✓ |
| Void | `max3dpro_void_draw_reports` | Very rare | Tiny ✓ |
