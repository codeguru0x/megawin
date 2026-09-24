# Dashboard Backoffice — Implementation Plan (Cập nhật: 2026-03-15)

## 1. Tổng quan

Trang dashboard (`/dashboard`) là trang mặc định sau login. Redirect từ `/` → `/dashboard`.
Hiển thị tổng hợp tài chính + vận hành hệ thống 7 games.

### Nguyên tắc thiết kế

- Mặc định hiển thị **financial date hôm nay** (partial data, ưu tiên real-time)
- Trend % chỉ hiển thị khi xem **ngày đã close** (yesterday trở về trước)
- So sánh **cùng thứ tuần trước** (same-day last week) — vì lịch quay phụ thuộc thứ
- Financial date persist trên URL qua `nuqs` (`?fd=YYYY-MM-DD`)
- Tối ưu query: 1 query `$in` cho KPIs + compare date, gộp 3 jackpots vào 1 use case

### Tech stack

- Next.js App Router, Server Component page + Client Component content
- shadcn/ui + Tailwind CSS v4
- TanStack React Query 5 (cache, dedup, auto-refresh)
- nuqs (URL state cho financial date)
- Recharts (PieChart donut, horizontal bars)
- Shared utils: `@megawin/shared/utils/number`, `@megawin/shared/utils/financial-date`

---

## 2. Layout — 5 Zones

```
┌──────────────────────────────────────────────────────────────┐
│  PAGE HEADER + Financial Date Picker (nuqs) + Refresh button │
├──────────────────────────────────────────────────────────────┤
│  ZONE 1: Hero KPIs — 4 stat cards (grid-cols-4)             │
│  [Stake] [GGR] [Net Profit] [Entries]                        │
│  Trend % chỉ khi ngày đã đóng (so cùng thứ tuần trước)       │
├──────────────────────────────────────────────────────────────┤
│  ZONE 2: Jackpot Pools — 3 cards (grid-cols-3)              │
│  [Mega 6/45 teal] [Power 6/55 red] [Lotto 5/35 amber]      │
│  Live data, refetch 30s                                      │
├─────────────────────────┬────────────────────────────────────┤
│  ZONE 3: Game Mix Donut │  ZONE 4: Game Performance Table   │
│  col-span-1             │  col-span-2                        │
│  PieChart donut          │  7 rows, footer tổng cộng         │
├─────────────────────────┴────────────────────────────────────┤
│  ZONE 5: Payout Ratio per-game horizontal bars              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Data Sources & Queries

### Financial Date Logic

- Mặc định: `getFinancialDate(new Date())` = ngày tài chính hiện tại (hôm nay)
- User chọn qua FinancialDateRangePicker → persist `?fd=2026-03-15` trên URL (nuqs)
- compareDate = fd - 7 ngày (chỉ khi fd < todayFd)

### Query Plan (2 queries client-side)

| # | Hook | API Route | Collection | Filter | Refresh |
|---|------|-----------|------------|--------|---------|
| Q1 | `useDashboardKpis` | `GET /api/dashboard/kpis?fd=&compare=` | `system_settle_game_daily` | `financialDate $in [fd, compare?]` | stale 5min |
| Q2 | `useDashboardJackpots` | `GET /api/dashboard/jackpots` | 3 jackpot collections | active cycle | 30s |

**Q1 là query chính** — 1 query phục vụ 4 zones (Hero KPIs, Game Table, Game Mix, Payout Ratio).
Client-side compute từ raw data → không cần extra queries.

### Trend % Logic

```
if (fd >= todayFinancialDate) {
  // Đang xem "hôm nay" (partial) → KHÔNG hiển thị trend %
  showTrend = false
} else {
  // Xem ngày đã close → so sánh cùng thứ tuần trước
  compareDate = fd - 7 ngày
  showTrend = true
}
```

---

## 4. File Structure (Thực tế)

```
apps/backoffice/src/
├── app/(main)/
│   ├── page.tsx                              ← redirect("/dashboard")
│   └── dashboard/
│       ├── page.tsx                          ← Server Component (auth + metadata)
│       ├── dashboard-content.tsx             ← Client Component (main layout)
│       ├── _lib/
│       │   ├── use-dashboard-filters.ts      ← nuqs: ?fd= URL state
│       │   ├── use-dashboard-queries.ts      ← React Query hooks (Q1, Q2)
│       │   └── compute.ts                    ← Pure compute helpers
│       └── _components/
│           ├── skeletons.tsx                 ← Skeleton loading states
│           ├── hero-kpis.tsx                 ← Zone 1: 4 KPI cards + trend
│           ├── jackpot-pools.tsx             ← Zone 2: 3 jackpot cards
│           ├── game-revenue-mix.tsx          ← Zone 3: Donut chart
│           └── game-performance.tsx          ← Zone 4 + 5: Table + Payout Ratio
├── lib/query-keys/
│   ├── modules.ts                            ← Thêm "dashboard" module
│   ├── dashboard.ts                          ← Query key factory (NEW)
│   └── index.ts                             ← Export dashboardKeys

apps/backoffice/src/app/api/
└── dashboard/
    ├── kpis/route.ts                         ← GET /api/dashboard/kpis
    └── jackpots/route.ts                     ← GET /api/dashboard/jackpots

packages/game-core-application/src/
├── use-cases/reports/
│   ├── get-dashboard-kpis.ts                 ← NEW: Q1 use case
│   ├── get-dashboard-jackpots.ts             ← NEW: Q2 use case (3 games parallel)
│   ├── index.ts                             ← Export new use cases + types
│   └── types.ts                             ← Thêm Dashboard DTO types
└── infras/repos/
    ├── system-settle-game-daily-repo.ts      ← Thêm findByFinancialDates()
    └── types/
        ├── index.ts                         ← Export DashboardGameDailyData
        └── system-settle-game-daily.types.ts ← Thêm DashboardGameDailyData type
```
