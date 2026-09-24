# Dashboard Frontend — Components & UI

## 1. Page Entry Point

**File:** `apps/backoffice/src/app/(main)/page.tsx`

Thay redirect hiện tại bằng render Dashboard:

```typescript
"use client";

import { Suspense } from "react";
import { DashboardContent } from "./_lib/dashboard/dashboard-content";
import { DashboardSkeleton } from "./_lib/dashboard/dashboard-skeleton";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
```

---

## 2. URL State (nuqs)

**File:** `apps/backoffice/src/app/(main)/_lib/dashboard/use-dashboard-filters.ts`

```typescript
import { useQueryState, parseAsString } from "nuqs";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { subDays, format } from "date-fns";

export function useDashboardFilters() {
  // financialDate hôm nay là default
  const todayFD = getFinancialDate(new Date());

  const [fd, setFd] = useQueryState("fd", parseAsString.withDefault(todayFD));

  // Tính compareDate (cùng thứ tuần trước) — chỉ khi fd < todayFD
  const isHistorical = fd < todayFD;
  const compareDate = isHistorical
    ? format(subDays(new Date(`${fd}T12:00:00`), 7), "yyyy-MM-dd")
    : undefined;

  return { fd, setFd, todayFD, isHistorical, compareDate };
}
```

---

## 3. Query Hooks

**File:** `apps/backoffice/src/app/(main)/_lib/dashboard/use-dashboard-queries.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { dashboardKeys, reportsKeys } from "@/lib/query-keys";

// === Q1: KPIs + Game data (settle) ===
export function useDashboardKpis(fd: string, compareDate?: string) {
  return useQuery({
    queryKey: dashboardKeys.kpis(fd),
    queryFn: () =>
      apiClient
        .get<GetDashboardKpisOutput>("/reports/dashboard/kpis", {
          params: { fd, compare: compareDate },
        })
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

// === Q2: Outstanding (live) — reuse existing ===
export function useDashboardOutstanding() {
  return useQuery({
    queryKey: reportsKeys.outstanding,
    queryFn: () =>
      apiClient.get<GetSystemOutstandingOutput>("/reports/outstanding").then((r) => r.data),
    refetchInterval: 60_000,
  });
}

// === Q3: Revenue Trend ===
export function useDashboardTrend(from: string, to: string) {
  return useQuery({
    queryKey: dashboardKeys.trend({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDailyOverviewOutput>("/reports/dashboard/trend", {
          params: { from, to },
        })
        .then((r) => r.data),
    refetchInterval: 300_000, // 5 phút
  });
}

// === Q4-6: Jackpots (live) ===
export function useDashboardJackpots() {
  return useQuery({
    queryKey: dashboardKeys.jackpots,
    queryFn: () =>
      apiClient.get<GetDashboardJackpotsOutput>("/reports/dashboard/jackpots").then((r) => r.data),
    refetchInterval: 30_000,
  });
}
```

---

## 4. Client-Side Data Transform

**File:** `apps/backoffice/src/app/(main)/_lib/dashboard/helpers/compute-dashboard-data.ts`

Pure functions — nhận raw Q1 data, trả computed values cho mỗi zone.
Không dùng hooks. Có thể dùng trong `useMemo`.

```typescript
import type { SystemSettleGameDaily } from "@megawin/game-core/entities";

/** Tách raw data thành current day + compare day. */
export function splitByDate(data: SystemSettleGameDaily[], currentFd: string, compareFd?: string) {
  const current = data.filter((d) => d.financialDate === currentFd);
  const compare = compareFd ? data.filter((d) => d.financialDate === compareFd) : [];
  return { current, compare };
}

/** Aggregate 7 per-game docs → 1 KPI total. */
export function computeKpiTotals(games: SystemSettleGameDaily[]) {
  return games.reduce(
    (acc, g) => ({
      totalStake: acc.totalStake + g.totalStake,
      ggr: acc.ggr + g.ggr,
      netProfit: acc.netProfit + g.netProfit,
      entryCount: acc.entryCount + g.entryCount,
      totalPayout: acc.totalPayout + g.totalPayout,
      totalCommission: acc.totalCommission + g.totalCommission,
      drawCount: acc.drawCount + g.drawCount,
    }),
    {
      totalStake: 0,
      ggr: 0,
      netProfit: 0,
      entryCount: 0,
      totalPayout: 0,
      totalCommission: 0,
      drawCount: 0,
    },
  );
}

/** Tính trend % giữa current vs compare. */
export function computeTrendPercent(current: number, compare: number): number | null {
  if (compare === 0) return null;
  return ((current - compare) / Math.abs(compare)) * 100;
}

/** Tính payout ratio per game. */
export function computePayoutRatio(game: SystemSettleGameDaily): number {
  if (game.totalStake === 0) return 0;
  return (game.totalPayout / game.totalStake) * 100;
}
```

---

## 5. Zone Components

### 5.1 Hero KPIs (Zone 1)

**File:** `sections/hero-kpis.tsx`

6 cards dùng `KpiCard` pattern hiện có. Grid `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`.

| Card           | Value                   | Trend                          | Source |
| -------------- | ----------------------- | ------------------------------ | ------ |
| Doanh thu      | `totalStake`            | vs tuần trước (nếu historical) | Q1     |
| GGR            | `ggr`                   | vs tuần trước                  | Q1     |
| Lợi nhuận ròng | `netProfit`             | vs tuần trước                  | Q1     |
| Số entry       | `entryCount`            | vs tuần trước                  | Q1     |
| Tồn đọng       | `totalOutstandingStake` | Không trend (live)             | Q2     |
| Kỳ active      | `activeDrawCount`       | Không trend (live)             | Q2     |

- 4 cards đầu: semantic color cho trend (success/danger)
- 2 cards cuối: badge "Live" nhỏ, border khác biệt nhẹ
- Skeleton: 6 cards matching size

### 5.2 Jackpot Pools (Zone 2)

**File:** `sections/jackpot-pools.tsx`

3 cards compact (nhỏ hơn trang Jackpot hero). Giữ **đúng màu sắc** trang Jackpot:

| Game       | BG Gradient                        | Icon Gradient            | Border      |
| ---------- | ---------------------------------- | ------------------------ | ----------- |
| Mega 6/45  | `teal-50 → cyan-50 → emerald-50`   | `teal-400 → emerald-500` | `teal-200`  |
| Power 6/55 | `red-50 → orange-50 → amber-50`    | `red-500 → orange-500`   | `red-200`   |
| Lotto 5/35 | `amber-50 → yellow-50 → orange-50` | `amber-400 → orange-500` | `amber-200` |

Mỗi card hiển thị:

- Icon Trophy + game name
- Current pool amount (`formatVNDCompact`)
- Cycle number + số kỳ liên tiếp
- Power 6/55: JP1 + JP2 tách riêng, JP2 dùng `text-blue-700`
- Lotto 5/35: badge "Split" nếu gần ngưỡng
- Sparkline nhỏ (optional, dùng SVG path đơn giản)

**Compact vs Jackpot page:** Không có decorative glows, không progress bar, không KPI sub-cards. Chỉ giữ core info + color identity.

### 5.3 Revenue Trend (Zone 3a)

**File:** `sections/revenue-trend.tsx`

- Recharts `AreaChart` với `ChartContainer` (shadcn wrapper)
- 3 series: Stake (primary), GGR (chart-2), Net Profit (chart-3)
- Toggle: 7d / 14d / 30d (local state, không URL)
- X-axis: financial date, Y-axis: VND (compact format)
- Tooltip: full VND format
- Loading: Skeleton fixed height `h-[280px]`
- Empty: "Chưa có dữ liệu" nếu range trống

### 5.4 Game Revenue Mix (Zone 3b)

**File:** `sections/game-revenue-mix.tsx`

- Horizontal bar chart HOẶC Recharts `PieChart` (donut)
- 7 games, sorted by totalStake desc
- Label: `GAME_LABELS[gameProduct]` (từ `@megawin/game-core/labels`)
- Click row → navigate `/games/{game}/financial-reports`
- Color: 7 colors từ CSS variables `chart-1` through `chart-5` + 2 thêm

### 5.5 Game Performance Table (Zone 4)

**File:** `sections/game-performance.tsx`

Bảng 7 rows (1 per game), các cột:

| Cột           | Align | Format                            | Source     |
| ------------- | ----- | --------------------------------- | ---------- |
| Game          | left  | `GAME_LABELS[gp]`                 | Q1 current |
| Doanh thu     | right | `formatVNDCompact` + tooltip full | Q1 current |
| GGR           | right | `formatVNDCompact`                | Q1 current |
| Payout %      | right | `formatPercent` + color-coded     | Computed   |
| Entries       | right | `formatNumber`                    | Q1 current |
| Kỳ quay       | right | number                            | Q1 current |
| vs tuần trước | right | Delta badge (▲/▼ %)               | Q1 compare |

- Dùng `tabular-nums` cho tất cả cột số
- Sort client-side (default: totalStake desc)
- Click row → navigate `/games/{game}/financial-reports`
- vs tuần trước: ẩn nếu `!isHistorical`
- Footer row: TOTAL (SUM all games)

### 5.6 Payout Ratio (Zone 5a)

**File:** `sections/payout-ratio.tsx`

- Recharts `BarChart` horizontal
- 7 bars, mỗi bar = payout % của 1 game
- Color-coded: `< 85%` success, `85-95%` warning, `> 95%` danger
- Label: game name + exact % value

### 5.7 Draw Timeline (Zone 5b)

**File:** `sections/draw-timeline.tsx`

- Card list scrollable (max-h fixed)
- 2 sections: "Sắp quay" + "Vừa settle"
- Mỗi item: icon status + time + game name + draw info
- Keno/Bingo: badge "Liên tục" (quay mỗi 6-8 phút)
- Data source: có thể reuse outstanding data + thêm 1 query nhỏ cho recent draws
- Hoặc hardcode lịch quay static từ game rules (đơn giản hơn)

---

## 6. Skeleton & Loading States

**File:** `apps/backoffice/src/app/(main)/_lib/dashboard/dashboard-skeleton.tsx`

Layout-preserving skeleton matching 6 zones:

- Zone 1: 6 skeleton cards (`h-24 rounded-xl`)
- Zone 2: 3 skeleton cards (`h-32 rounded-xl`)
- Zone 3: 2 skeleton blocks (`h-[280px] rounded-xl`)
- Zone 4: skeleton table (`h-[300px]`)
- Zone 5: 2 skeleton blocks (`h-[250px] rounded-xl`)

Mỗi section component cũng có internal skeleton riêng khi data đang loading.

---

## 7. Responsive

| Breakpoint   | Zone 1 | Zone 2 | Zone 3 | Zone 4      | Zone 5 |
| ------------ | ------ | ------ | ------ | ----------- | ------ |
| `xl` (1280+) | 6 cols | 3 cols | 2 cols | full        | 2 cols |
| `lg` (1024)  | 3 cols | 3 cols | 2 cols | full        | 2 cols |
| `md` (768)   | 2 cols | 1 col  | 1 col  | full scroll | 1 col  |
| `sm` (640)   | 1 col  | 1 col  | 1 col  | full scroll | 1 col  |

---

## 8. React Query Cache Strategy

| Query            | staleTime | gcTime | refetchInterval | Lý do                                           |
| ---------------- | --------- | ------ | --------------- | ----------------------------------------------- |
| KPIs (Q1)        | 30s       | 5min   | 60s             | Data settle cập nhật mỗi khi có draw mới settle |
| Outstanding (Q2) | 0         | 5min   | 60s             | Live data, luôn fresh                           |
| Trend (Q3)       | 5min      | 30min  | 300s            | Historical, ít thay đổi                         |
| Jackpots (Q4-6)  | 15s       | 5min   | 30s             | Pool thay đổi mỗi kỳ quay                       |

---

## 9. Implementation Order

1. **Backend first:**
   - [ ] Thêm `dashboard` vào `MODULES`
   - [ ] Tạo `dashboardKeys` query key factory
   - [ ] Thêm DTO types vào `repos/types/`
   - [ ] Thêm repo method `findByFinancialDates`
   - [ ] Tạo `GetDashboardKpisUseCase`
   - [ ] Tạo `GetDashboardJackpotsUseCase`
   - [ ] Tạo 3 API routes

2. **Frontend hooks:**
   - [ ] `use-dashboard-filters.ts` (nuqs)
   - [ ] `use-dashboard-queries.ts` (React Query)
   - [ ] `compute-dashboard-data.ts` (pure functions)

3. **UI sections (top → bottom):**
   - [ ] `dashboard-skeleton.tsx` (skeleton first)
   - [ ] `hero-kpis.tsx` (Zone 1)
   - [ ] `jackpot-pools.tsx` (Zone 2)
   - [ ] `revenue-trend.tsx` (Zone 3a)
   - [ ] `game-revenue-mix.tsx` (Zone 3b)
   - [ ] `game-performance.tsx` (Zone 4)
   - [ ] `payout-ratio.tsx` (Zone 5a)
   - [ ] `draw-timeline.tsx` (Zone 5b)

4. **Page composition:**
   - [ ] `dashboard-content.tsx` — assemble all zones
   - [ ] `page.tsx` — Suspense + render

5. **Polish:**
   - [ ] Dark mode verification
   - [ ] Responsive testing
   - [ ] Empty states
   - [ ] Navigation links (click game → game reports)
