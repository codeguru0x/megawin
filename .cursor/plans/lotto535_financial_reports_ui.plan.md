---
name: Lotto535 Financial Reports UI
overview: "Triển khai UI báo cáo cho Lotto 5/35: 3 pages riêng biệt (Financial Reports + Outstanding + Void Reports). Thay thế mock page. Drill-down 4 cấp qua nuqs."
todos:
  - id: repo-types
    content: Tạo repos/types/ directory với settle-draw-report.types.ts, settle-tenant-report.types.ts, entry.types.ts + barrel index.ts
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
    content: Tạo API /api/lotto535/reports/draws + draws/summary + draws/[drawId]/tenants
    status: pending
  - id: api-tenants
    content: Tạo API /api/lotto535/reports/tenants + tenants/[tenantId]/draws
    status: pending
  - id: api-players-entries
    content: Tạo API /api/lotto535/reports/players + entries
    status: pending
  - id: api-void
    content: Tạo API /api/lotto535/reports/void
    status: pending
  - id: api-outstanding
    content: Tạo API /api/lotto535/reports/outstanding
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

# Lotto 5/35 Financial Reports UI

Rule files: `financial-report-ui.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`, `lotto535-game-rules.mdc`.

## Hiện trạng

- `financial-reports/page.tsx` **ĐÃ TỒN TẠI** (398 dòng, mock data) — rewrite hoàn toàn.
- Thư mục `outstanding/` và `void-reports/` **CHƯA TỒN TẠI** — tạo mới.
- Per-game repos có WRITE methods, cần thêm READ.
- Lotto 5/35: CÓ `lineCount`, CÓ `jackpotContribution`, CÓ `companyTake`, 2 kỳ/ngày.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` (`formatVND`, `formatVNDCompact`, `formatPercent`, `formatNumber`). Date utils tại `@megawin/shared/utils/date`. Xem §6.2 trong `financial-report-ui.mdc`.

## Phase 1: Repository READ Methods

### 1a. Types — Tạo thư mục `repos/types/`

Tạo thư mục `packages/game-lotto535-application/src/infras/repos/types/` với các file riêng theo concern.

**LƯU Ý:** File `*-repo.ts` CHỈ chứa class + query logic. Tất cả aggregate result interfaces → `types/{concern}.types.ts`. Xem rule `mongodb-repository-architecture.mdc` §2.

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

#### `types/index.ts` (barrel):

```typescript
export type { DrawSummaryResult } from "./settle-draw-report.types";
export type { TenantAggregateSummary } from "./settle-tenant-report.types";
export type { PlayerBreakdownRow } from "./entry.types";
```

Re-export từ `repos/index.ts`:

```typescript
export type * from "./types";
```

### 1b. SettleDrawReportRepo

File: `packages/game-lotto535-application/src/infras/repos/settle-draw-report-repo.ts`

Đã có: `upsertDrawReport`, `deleteByDrawId`, `findByDrawId`. Import types từ `./types`:

```typescript
import type { DrawSummaryResult } from "./types";
```

Thêm methods:

```typescript
/**
 * Query settle draw reports trong date range, sorted DESC.
 * Dùng cho tab "Theo kỳ quay" cấp 1. Paginated.
 */
async findByDateRange(
  from: string, to: string,
  options?: { skip?: number; limit?: number },
): Promise<{ data: SettleDrawReport[]; total: number }>

/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Dùng cho KPI strip.
 */
async aggregateSummary(from: string, to: string): Promise<DrawSummaryResult | null>
```

### 1c. SettleTenantReportRepo

File: `packages/game-lotto535-application/src/infras/repos/settle-tenant-report-repo.ts`

Đã có: `upsertTenantReports`, `deleteByDrawId`. Import types từ `./types`:

```typescript
import type { TenantAggregateSummary } from "./types";
```

Thêm methods:

```typescript
/** Query tenant reports cho 1 draw. Drill cấp 2. */
async findByDrawId(drawId: string): Promise<SettleTenantReport[]>

/** Aggregate by tenantId trong date range. Tab "Theo đại lý" cấp 1. */
async aggregateByTenant(from: string, to: string): Promise<TenantAggregateSummary[]>

/** Draw list cho 1 tenant trong date range. Drill cấp 2 (tenant tab). Paginated. */
async findByTenantAndDateRange(
  tenantId: string, from: string, to: string,
  options?: { skip?: number; limit?: number },
): Promise<{ data: SettleTenantReport[]; total: number }>
```

### 1d. VoidReportRepo

File: `packages/game-lotto535-application/src/infras/repos/void-report-repo.ts`

Đã có: `upsertVoidReport`. Thêm:

```typescript
/** Query void draw reports trong date range. */
async findByDateRange(from: string, to: string): Promise<VoidDrawReport[]>
```

### 1e. OutstandingReportRepo

File: `packages/game-lotto535-application/src/infras/repos/outstanding-report-repo.ts`

Đã có: `upsertDrawReport`, `aggregateForGame`. Thêm:

```typescript
/** Query tất cả outstanding draw reports (TTL active). */
async findAll(): Promise<OutstandingDrawReport[]>
```

### 1f. EntryRepo

File: `packages/game-lotto535-application/src/infras/repos/entry-repo.ts`

Import types từ `./types`:

```typescript
import type { PlayerBreakdownRow } from "./types";
```

Thêm methods:

```typescript
/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * BẮT BUỘC drawId — KHÔNG query cross-draw.
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
async aggregatePlayersByDrawAndTenant(
  drawId: string, tenantId: string,
): Promise<PlayerBreakdownRow[]>
// Pipeline:
//   $match { drawId, "tenant.tenantId": tenantId, status: "settled" }
//   $group by accountId → entryCount, lineCount, totalStake, totalWin, totalPayout
//   $sort { totalStake: -1 }

/**
 * Query entries cho 1 draw × 1 tenant × 1 player. Drill cấp 4.
 */
async findByDrawTenantPlayer(
  drawId: string, tenantId: string, accountId: string,
): Promise<TicketEntryDoc[]>
```

Export tất cả types + methods qua barrel `repos/index.ts`.

## Phase 2: API Route Handlers

### 2a. Draws APIs

`apps/backoffice/src/app/api/lotto535/reports/draws/route.ts`:

```
GET ?from=...&to=...&page=1&limit=20
→ settleDrawReportRepo.findByDateRange(from, to, {skip, limit})
→ { data, total, page, limit }
```

`apps/backoffice/src/app/api/lotto535/reports/draws/summary/route.ts`:

```
GET ?from=...&to=...
→ settleDrawReportRepo.aggregateSummary(from, to)
→ { data: DrawSummaryResult }
```

`apps/backoffice/src/app/api/lotto535/reports/draws/[drawId]/tenants/route.ts`:

```
GET (drawId from path)
→ settleTenantReportRepo.findByDrawId(drawId)
→ { data: SettleTenantReport[] }
```

### 2b. Tenants APIs

`apps/backoffice/src/app/api/lotto535/reports/tenants/route.ts`:

```
GET ?from=...&to=...
→ settleTenantReportRepo.aggregateByTenant(from, to)
→ { data: TenantAggregateSummary[] }
```

`apps/backoffice/src/app/api/lotto535/reports/tenants/[tenantId]/draws/route.ts`:

```
GET ?from=...&to=...&page=1&limit=20
→ settleTenantReportRepo.findByTenantAndDateRange(tenantId, from, to, {skip, limit})
→ { data, total, page, limit }
```

### 2c. Players + Entries APIs

`apps/backoffice/src/app/api/lotto535/reports/players/route.ts`:

```
GET ?drawId=...&tenantId=...     ← CẢ 2 BẮT BUỘC, return 400 nếu thiếu
→ entryRepo.aggregatePlayersByDrawAndTenant(drawId, tenantId)
→ { data: PlayerBreakdownRow[] }
```

`apps/backoffice/src/app/api/lotto535/reports/entries/route.ts`:

```
GET ?drawId=...&tenantId=...&accountId=...     ← CẢ 3 BẮT BUỘC
→ entryRepo.findByDrawTenantPlayer(drawId, tenantId, accountId)
→ { data: TicketEntryDoc[] }
```

### 2d. Void API

`apps/backoffice/src/app/api/lotto535/reports/void/route.ts`:

```
GET ?from=...&to=...
→ voidReportRepo.findByDateRange(from, to)
→ { data: VoidDrawReport[] }
```

### 2e. Outstanding API

`apps/backoffice/src/app/api/lotto535/reports/outstanding/route.ts`:

```
GET (no params)
→ outstandingReportRepo.findAll()
→ { data: OutstandingDrawReport[] }
```

## Phase 3: UI — Financial Reports Page (2 tabs)

### 3a. URL State Hook

Tạo `apps/backoffice/src/app/(main)/games/lotto535/financial-reports/_lib/use-report-filters.ts`:

```typescript
const TABS = ["draws", "tenants"] as const;
type DrillLevel = "list" | "draw-tenants" | "players" | "entries" | "tenant-draws";

export function useLotto535ReportFilters() {
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("draws"));
  const [from, setFrom] = useQueryState("from", parseAsString);
  const [to, setTo] = useQueryState("to", parseAsString);
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);

  const level: DrillLevel = playerId ? "entries"
    : (tenantId && drawId) ? "players"
    : drawId ? "draw-tenants"
    : tenantId ? "tenant-draws"
    : "list";

  const navigateToList = useCallback(() => {
    setDrawId(null); setTenantId(null); setPlayerId(null);
  }, [setDrawId, setTenantId, setPlayerId]);

  const navigateToDraw = useCallback((id: string) => {
    setDrawId(id); setTenantId(null); setPlayerId(null);
  }, [setDrawId, setTenantId, setPlayerId]);

  const navigateToTenantInDraw = useCallback((id: string) => {
    setTenantId(id); setPlayerId(null);
  }, [setTenantId, setPlayerId]);

  const navigateToPlayer = useCallback((id: string) => {
    setPlayerId(id);
  }, [setPlayerId]);

  // Tenant tab drill
  const navigateToTenantDrills = useCallback((id: string) => {
    setTenantId(id); setDrawId(null); setPlayerId(null);
  }, [setTenantId, setDrawId, setPlayerId]);

  return {
    tab, setTab, from, to, setFrom, setTo,
    drawId, tenantId, playerId, level,
    navigateToList, navigateToDraw, navigateToTenantInDraw,
    navigateToPlayer, navigateToTenantDrills,
  };
}
```

### 3b. Rewrite Page

Rewrite `apps/backoffice/src/app/(main)/games/lotto535/financial-reports/page.tsx`:

- Xoá toàn bộ mock data
- Suspense → Content component
- PageHeader: "Lotto 5/35 — Báo cáo tài chính" + DateRangePicker + Export
- 2 tabs: "Theo kỳ quay" / "Theo đại lý"

### 3c. Tab "Theo kỳ quay" — 4 cấp drill-down

File: `_lib/tabs/by-draw.tsx`

Render based on `level`:

**level = "list"** → DrawTable:

- Breadcrumb: `[Kỳ quay]`
- KPI Strip: 6 cards (React Query → `/api/lotto535/reports/draws/summary`)
- Data Table (React Query → `/api/lotto535/reports/draws?from&to&page&limit`):
  - Cột: Kỳ quay | Ngày TC | Entries | Players | Tenants | Lines | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Company Take | JP Contribution | Payout %
  - Summary Footer, pagination
  - Click row → `navigateToDraw(drawId)`

**level = "draw-tenants"** → DrawTenantBreakdown:

- Breadcrumb: `[Kỳ quay]` → `[Draw #drawId]`
- Draw Summary Card
- Tenant Table (React Query → `/api/lotto535/reports/draws/${drawId}/tenants`):
  - Cột: Đại lý | Entries | Players | Lines | Doanh thu | Trả thưởng | GGR | Hoa hồng | Payout %
  - Click row → `navigateToTenantInDraw(tenantId)`

**level = "players"** → PlayerBreakdown:

- Breadcrumb: `[Kỳ quay]` → `[Draw]` → `[Tenant]`
- Player Table (React Query → `/api/lotto535/reports/players?drawId&tenantId`):
  - Cột: Player | Username | Entries | Lines | Cược | Thắng | Trả thưởng | Kết quả ròng
  - Click row → `navigateToPlayer(accountId)`

**level = "entries"** → EntryList:

- Breadcrumb: `[Kỳ quay]` → `[Draw]` → `[Tenant]` → `[Player]`
- Entry Table (React Query → `/api/lotto535/reports/entries?drawId&tenantId&accountId`):
  - Cột: Entry ID | Mã vé | Lines | Cược | Thắng | Trả thưởng | Giải | Trạng thái
  - Click row → EntryDetailDialog

### 3d. Tab "Theo đại lý" — 2 cấp drill-down

File: `_lib/tabs/by-tenant.tsx`

**level = "list"** (no tenantId) → TenantSummaryTable:

- Breadcrumb: `[Đại lý]`
- Table (React Query → `/api/lotto535/reports/tenants?from&to`):
  - Cột: # | Đại lý | Kỳ quay | Entries | Players | Lines | Doanh thu | Trả thưởng | GGR | Hoa hồng | Payout %
  - Sort: Doanh thu DESC
  - Click row → `navigateToTenantDrills(tenantId)`

**level = "tenant-draws"** (has tenantId) → TenantDrawList:

- Breadcrumb: `[Đại lý]` → `[Tenant name]`
- Table (React Query → `/api/lotto535/reports/tenants/${tenantId}/draws?from&to`):
  - Cột: Kỳ quay | Ngày TC | Entries | Players | Lines | Doanh thu | Trả thưởng | GGR | Hoa hồng
  - Click row → chuyển sang tab "draws" drill cấp 2+:
  `setTab("draws"); navigateToDraw(drawId); navigateToTenantInDraw(tenantId);`

### 3e. Shared Sections

`_lib/sections/entry-detail-dialog.tsx`:

- Dialog hiển thị: entryId, ticketNo, drawId, status, boards, payout tiers, commission

## Phase 4: UI — Outstanding Page (separate)

Tạo `apps/backoffice/src/app/(main)/games/lotto535/outstanding/page.tsx`:

- PageHeader: "Lotto 5/35 — Outstanding" + timestamp
- **KPI Strip**: 3 cards — Active Draws, Pending Entries, Pending Stake
- **Outstanding Table** (React Query → `/api/lotto535/reports/outstanding`, `refetchInterval: 60_000`):
  - Cột: Kỳ quay | Ngày TC | Entries | Players | Tenants | Lines | Pending Stake | Est. Commission
  - Không pagination (thường ít draw, tối đa ~4 cho Lotto535)
- Không drill-down sâu hơn

Tạo `_lib/outstanding-table.tsx` nếu cần tách component.

## Phase 5: UI — Void Reports Page (separate)

Tạo `apps/backoffice/src/app/(main)/games/lotto535/void-reports/page.tsx`:

- PageHeader: "Lotto 5/35 — Kỳ huỷ" + DateRangePicker
- **KPI Strip**: 2 cards — Tổng kỳ huỷ (count), Tổng hoàn trả (VND)
- **Void Table** (React Query → `/api/lotto535/reports/void?from&to`):
  - Cột: Kỳ quay | Ngày TC | Entries | Players | Tenants | Cược gốc | Hoàn trả | Settle trước?
  - "Settle trước?": Badge "Có" (warning) + button "Xem snapshot" / Badge "Không"
  - Click "Xem snapshot" → VoidSnapshotDialog

Tạo `_lib/void-snapshot-dialog.tsx`:

- Dialog hiển thị `previousSettleSnapshot`: totalStake, totalPayout, ggr, totalCommission, netProfit
- Impact text: "Void đã xoá X doanh thu + Y lợi nhuận khỏi báo cáo ngày Z"

nuqs cho void page: chỉ `from` + `to` (đơn giản, không drill-down).

## Phase 6: Typecheck

- `cd apps/backoffice && pnpm tsc --noEmit`
- `cd packages/game-lotto535-application && pnpm tsc --noEmit`
- Fix type errors, kiểm tra barrel exports

## Performance Summary


| Page                      | Data Source                         | Max Records      | Safe?           |
| ------------------------- | ----------------------------------- | ---------------- | --------------- |
| Financial: Draw List      | `lotto535_settle_draw_reports`      | ~60/tháng        | Paginated ✓     |
| Financial: Tenant/Draw    | `lotto535_settle_tenant_reports`    | ~10/draw         | Tiny ✓          |
| Financial: Tenant Summary | aggregate settle_tenant_reports     | ~10 tenants      | Indexed ✓       |
| Financial: Players        | `lotto535_ticket_entries` agg       | ~500/draw/tenant | Scoped drawId ✓ |
| Financial: Entries        | `lotto535_ticket_entries`           | ~20/player/draw  | Tiny ✓          |
| Outstanding               | `lotto535_outstanding_draw_reports` | ~4 draws         | Tiny ✓          |
| Void                      | `lotto535_void_draw_reports`        | Very rare        | Tiny ✓          |


## Replicate cho game khác

Mỗi game = 1 plan riêng. Copy từ Lotto535 rồi điều chỉnh:


| Game       | lineCount | jackpotContribution | Lưu ý đặc biệt                                         |
| ---------- | --------- | ------------------- | ------------------------------------------------------ |
| Mega 6/45  | CÓ        | CÓ                  | Giống hệt Lotto535                                     |
| Power 6/55 | CÓ        | CÓ                  | JP = jp1 + jp2                                         |
| Max 3D     | CÓ        | KHÔNG               | Bỏ cột JP                                              |
| Max 3D Pro | CÓ        | KHÔNG               | Bỏ cột JP                                              |
| Keno       | KHÔNG     | KHÔNG               | Bỏ cột Lines + JP. 120 kỳ/ngày → pagination quan trọng |
| Bingo 18   | KHÔNG     | KHÔNG               | Bỏ cột Lines + JP                                      |


