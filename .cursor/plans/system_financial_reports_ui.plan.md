---
name: System Financial Reports UI
overview: "Triển khai UI báo cáo tài chính hệ thống: 2 pages riêng biệt (Financial + Outstanding). Dùng nuqs URL state, Dashboard-UI-Design standards."
todos:
  - id: sidebar-menu
    content: Thêm nhóm Báo cáo trong sidebar (2 items) + uncomment/thêm mục per-game cho 7 games
    status: pending
  - id: repo-types
    content: Tạo repos/types/ directory với system-settle-game-daily.types.ts, system-settle-tenant-daily.types.ts + barrel index.ts
    status: pending
  - id: repo-read-game-daily
    content: Thêm READ methods vào SystemSettleGameDailyRepo
    status: pending
  - id: repo-read-tenant-daily
    content: Thêm READ methods vào SystemSettleTenantDailyRepo
    status: pending
  - id: repo-read-outstanding
    content: Thêm READ method findAll vào SystemOutstandingReportRepo
    status: pending
  - id: api-financial
    content: Tạo 3 API routes cho /api/reports/financial/ (daily, by-game, by-tenant)
    status: pending
  - id: api-outstanding
    content: Tạo API route /api/reports/outstanding
    status: pending
  - id: page-financial
    content: Tạo reports/financial/page.tsx — 3 tabs + nuqs + KPI + tables
    status: pending
  - id: page-outstanding
    content: Tạo reports/outstanding/page.tsx — single view + auto-refresh
    status: pending
  - id: typecheck
    content: Chạy tsc --noEmit kiểm tra không lỗi
    status: pending
isProject: false
---

# System Financial Reports UI

Rule files: `financial-report-ui.mdc`, `mongodb-repository-architecture.mdc`, `Dashboard-UI-Design.mdc`, `frontend-url-state.mdc`.

## Hiện trạng

- Sidebar nhóm "Thống kê" (id: 2) **đã bị comment out** — thay thế bằng nhóm "Báo cáo" mới.
- Thư mục `apps/backoffice/src/app/(main)/reports/` **CHƯA TỒN TẠI**.
- Thư mục `apps/backoffice/src/app/api/reports/` **CHƯA TỒN TẠI**.
- Format utils: **ĐÃ CÓ SẴN** tại `@megawin/shared/utils/number` (`formatVND`, `formatVNDCompact`, `formatPercent`, `formatNumber`). Date utils tại `@megawin/shared/utils/date`.
- System repos có WRITE methods, cần thêm READ.

## Phase 1: Foundation

### 1a. Sidebar Menu

Sửa `apps/backoffice/src/navigation/sidebar/sidebar-items.ts`:

**Nhóm System** — Thay thế nhóm comment cũ (id: 2):

```typescript
{
  id: 2,
  label: "Báo cáo",
  items: [
    { title: "Báo cáo tài chính", url: "/reports/financial", icon: BarChart3 },
    { title: "Outstanding", url: "/reports/outstanding", icon: Clock },
  ],
},
```

**Per-game** — Thêm 3 sub-items cho mỗi game (7 game), sectionLabel "Báo cáo":

```typescript
{ title: "Báo cáo tài chính", url: "/games/{game}/financial-reports", icon: CircleDollarSign, sectionLabel: "Báo cáo" },
{ title: "Outstanding", url: "/games/{game}/outstanding", icon: Clock },
{ title: "Kỳ huỷ", url: "/games/{game}/void-reports", icon: Ban },
```

Cho Lotto 5/35: uncomment phần comment cũ rồi sửa lại. Cho 6 game còn lại: thêm mới.

## Phase 2: Repository READ Methods

### 2a. Types — Tạo thư mục `repos/types/`

Tạo thư mục `packages/game-core-application/src/infras/repos/types/` với các file riêng theo concern.

**LƯU Ý:** File `*-repo.ts` CHỈ chứa class + query logic. Tất cả aggregate result interfaces → `types/{concern}.types.ts`. Xem rule `mongodb-repository-architecture.mdc` §2.

#### `types/system-settle-game-daily.types.ts`:

```typescript
/**
 * Aggregate result khi nhóm theo financialDate — SUM tất cả game cho mỗi ngày.
 * Dùng cho tab "Tổng quan ngày" trong System Financial Reports.
 */
export interface DailyOverviewRow {
  financialDate: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo gameProduct — SUM tất cả ngày cho mỗi game.
 * Dùng cho tab "Theo game".
 */
export interface GameSummaryRow {
  gameProduct: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}
```

#### `types/system-settle-tenant-daily.types.ts`:

```typescript
/**
 * Aggregate result khi nhóm theo tenantId — SUM cross-game cho mỗi tenant.
 * Dùng cho tab "Theo đại lý".
 */
export interface TenantSummaryRow {
  tenantId: string;
  gameCount: number;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  commission: number;
  netProfit: number;
}
```

#### `types/index.ts` (barrel):

```typescript
export type { DailyOverviewRow, GameSummaryRow } from "./system-settle-game-daily.types";
export type { TenantSummaryRow } from "./system-settle-tenant-daily.types";
```

Re-export từ `repos/index.ts`:

```typescript
export type * from "./types";
```

### 2b. SystemSettleGameDailyRepo

File: `packages/game-core-application/src/infras/repos/system-settle-game-daily-repo.ts`

Import types từ `./types`, KHÔNG khai báo interface trong file này:

```typescript
import type { DailyOverviewRow, GameSummaryRow } from "./types";
```

Thêm methods:

```typescript
/** Aggregate by financialDate — SUM tất cả game cho mỗi ngày. Dùng tab "Tổng quan ngày". */
async aggregateByFinancialDate(from: string, to: string): Promise<DailyOverviewRow[]>
// Pipeline: $match {financialDate: {$gte: from, $lte: to}}
//   → $group by financialDate → $sort {financialDate: -1}

/** Aggregate by gameProduct — SUM tất cả ngày cho mỗi game. Dùng tab "Theo game". */
async aggregateByGameProduct(from: string, to: string): Promise<GameSummaryRow[]>
// Pipeline: $match {financialDate: {$gte, $lte}}
//   → $group by gameProduct

/** Raw query cho 1 ngày — dùng inline expand game breakdown. */
async findByFinancialDate(financialDate: string): Promise<SystemSettleGameDaily[]>
```

### 2c. SystemSettleTenantDailyRepo

File: `packages/game-core-application/src/infras/repos/system-settle-tenant-daily-repo.ts`

Import types từ `./types`:

```typescript
import type { TenantSummaryRow } from "./types";
```

Thêm methods:

```typescript
/** Aggregate by tenantId — SUM cross-game cho mỗi tenant. Dùng tab "Theo đại lý". */
async aggregateByTenantId(from: string, to: string, gameProduct?: GameProduct): Promise<TenantSummaryRow[]>
// Pipeline: $match {financialDate in range, optional gameProduct}
//   → $group by tenantId → $sort {totalStake: -1}

/** Game breakdown cho 1 tenant — dùng inline expand. */
async findTenantGameBreakdown(tenantId: string, from: string, to: string): Promise<SystemSettleTenantDaily[]>
// Pipeline: $match {tenantId, financialDate in range} → $sort {gameProduct: 1}
```

### 2d. SystemOutstandingReportRepo

File: `packages/game-core-application/src/infras/repos/system-outstanding-report-repo.ts`

Thêm:

```typescript
/** Query tất cả outstanding hiện tại (TTL active). Dùng outstanding page. */
async findAll(): Promise<SystemOutstandingGameDaily[]>
```

Export tất cả types + methods qua barrel `repos/index.ts`.

## Phase 3: API Route Handlers

### 3a. Financial — Daily Overview

Tạo `apps/backoffice/src/app/api/reports/financial/daily/route.ts`:

```
GET /api/reports/financial/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
→ systemSettleGameDailyRepo.aggregateByFinancialDate(from, to)
→ Return: { data: DailyOverviewRow[] }

GET /api/reports/financial/daily?date=YYYY-MM-DD  (inline expand)
→ systemSettleGameDailyRepo.findByFinancialDate(date)
→ Return: { data: SystemSettleGameDaily[] }
```

### 3b. Financial — By Game

Tạo `apps/backoffice/src/app/api/reports/financial/by-game/route.ts`:

```
GET /api/reports/financial/by-game?from=YYYY-MM-DD&to=YYYY-MM-DD
→ systemSettleGameDailyRepo.aggregateByGameProduct(from, to)
→ Return: { data: GameSummaryRow[] }
```

### 3c. Financial — By Tenant

Tạo `apps/backoffice/src/app/api/reports/financial/by-tenant/route.ts`:

```
GET /api/reports/financial/by-tenant?from=...&to=...&game=all|{gameProduct}
→ systemSettleTenantDailyRepo.aggregateByTenantId(from, to, gameProduct?)
→ Return: { data: TenantSummaryRow[] }

GET /api/reports/financial/by-tenant?tenantId=...&from=...&to=...  (inline expand)
→ systemSettleTenantDailyRepo.findTenantGameBreakdown(tenantId, from, to)
→ Return: { data: SystemSettleTenantDaily[] }
```

### 3d. Outstanding

Tạo `apps/backoffice/src/app/api/reports/outstanding/route.ts`:

```
GET /api/reports/outstanding
→ systemOutstandingReportRepo.findAll()
→ Return: { data: SystemOutstandingGameDaily[] }
```

## Phase 4: UI — Financial Reports Page

### 4a. URL State Hook

Tạo `apps/backoffice/src/app/(main)/reports/financial/_lib/use-report-filters.ts`:

```typescript
const SYSTEM_TABS = ["daily", "by-game", "by-tenant"] as const;

export function useSystemReportFilters() {
  const [tab, setTab] = useQueryState("tab",
    parseAsStringLiteral(SYSTEM_TABS).withDefault("daily"));
  const [from, setFrom] = useQueryState("from", parseAsString);
  const [to, setTo] = useQueryState("to", parseAsString);
  const [expandedDate, setExpandedDate] = useQueryState("date", parseAsString);
  const [expandedTenant, setExpandedTenant] = useQueryState("tenant", parseAsString);
  return { tab, setTab, from, to, setFrom, setTo, expandedDate, setExpandedDate, expandedTenant, setExpandedTenant };
}
```

### 4b. Page Shell

Tạo `apps/backoffice/src/app/(main)/reports/financial/page.tsx`:

```tsx
export default function SystemFinancialReportsPage() {
  return (
    <Suspense>
      <SystemFinancialReportsContent />
    </Suspense>
  );
}
```

- PageHeader: "Báo cáo tài chính hệ thống" + DateRangePicker + Export
- 3 tabs (shadcn Tabs): "Tổng quan ngày" / "Theo game" / "Theo đại lý"

### 4c. Tab: Tổng quan ngày

File: `_lib/tabs/daily-overview.tsx`

1. **KPI Strip**: 4 cards — Doanh thu, Trả thưởng, GGR (+ margin%), Lợi nhuận (+ net margin%)
2. **Daily P&L Table**:
  - Cột: Ngày TC | Kỳ quay | Entries | Players | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Payout %
  - Full VND separator, tabular-nums, right-aligned
  - Summary Footer Row **TỔNG CỘNG**
  - Click row → expand inline: game breakdown (query `findByFinancialDate`)
3. **Inline Expand**: Sub-table 7 game, click game → `router.push(`/games/${slug}/financial-reports`)`

### 4d. Tab: Theo game

File: `_lib/tabs/by-game.tsx`

- **Game Comparison Table**: Cột: Game | Kỳ quay | Entries | Players | Tenants | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Payout % | Margin %
- Summary Footer Row
- Click game → `router.push(`/games/${slug}/financial-reports?from=${from}&to=${to}`)`

### 4e. Tab: Theo đại lý

File: `_lib/tabs/by-tenant.tsx`

- **Tenant Ranking Table**: Cột: # | Đại lý | Games | Entries | Players | Doanh thu | Trả thưởng | GGR | Hoa hồng | Lợi nhuận | Payout %
- Default sort: Doanh thu DESC
- Summary Footer Row
- Click row → expand inline: game breakdown per tenant

## Phase 5: UI — Outstanding Page

Tạo `apps/backoffice/src/app/(main)/reports/outstanding/page.tsx`:

- PageHeader: "Outstanding — Số liệu đang chờ" + timestamp "Cập nhật lúc: HH:mm:ss"
- **KPI Strip**: 3 cards — Tổng Pending Stake, Active Draws (sum all games), Est. Commission
- **Outstanding Table**: Cột: Game | Active Draws | Entries | Players | Tenants | Pending Stake | Est. Commission
- React Query: `refetchInterval: 60_000`
- Click game → `router.push(`/games/${slug}/outstanding`)`

## Phase 6: Typecheck

- `pnpm tsc --noEmit` trong `apps/backoffice` + `packages/game-core-application`
- Fix type errors
- Kiểm tra barrel exports

## Data Source Summary


| Page        | Tab/View        | Collection                      | Query                                 |
| ----------- | --------------- | ------------------------------- | ------------------------------------- |
| Financial   | Tổng quan ngày  | `system_settle_game_daily`      | aggregate by financialDate            |
| Financial   | Ngày → expand   | `system_settle_game_daily`      | findMany WHERE financialDate          |
| Financial   | Theo game       | `system_settle_game_daily`      | aggregate by gameProduct              |
| Financial   | Theo đại lý     | `system_settle_tenant_daily`    | aggregate by tenantId                 |
| Financial   | Tenant → expand | `system_settle_tenant_daily`    | findMany WHERE {tenantId, date range} |
| Outstanding | —               | `system_outstanding_game_daily` | findAll()                             |


