---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Bingo 18 — Operations & Draws Pages

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Game Rules & Cursor Rules (đọc lần lượt)

1. **Game rule**: `.cursor/rules/bingo18-game-rules.mdc` — ĐỌC ĐẦU TIÊN
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc` — JSDoc, comment business logic
3. **Entity design**: `.cursor/rules/entity-typesafe-mongodb.mdc` — Named interfaces, dot notation
4. **Dashboard UI**: `.cursor/rules/Dashboard-UI-Design.mdc` — Layout, tokens, KPI cards

### Template chính — Keno (cùng high-frequency pattern)

- **Operations page**: `apps/backoffice/src/app/(main)/games/keno/operations/` — COPY STRUCTURE
- **Operations API**: `apps/backoffice/src/app/api/keno/operations/` — COPY PATTERN
- **Operations use cases**: `packages/game-keno-application/src/use-cases/operations/` — COPY PATTERN
- **Draw selector DTO**: `packages/game-keno-application/src/use-cases/operations/dto/draw-selector.dto.ts`
- **Draw selector use case**: `packages/game-keno-application/src/use-cases/operations/get-draw-selector.ts`
- **Operations hooks**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts`
- **Draw context**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-draw-context.tsx`
- **Draw selector UI**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/draw-selector.tsx`

### Bingo18 entities hiện có (đọc để hiểu data model)

- `packages/game-bingo18/src/entities/enums.ts` — Bingo18PlayType, Bingo18BigSmallBet, Bingo18TripleKind
- `packages/game-bingo18/src/entities/types.ts` — Selections, Prizes, FinancialRates, PlayRules
- `packages/game-bingo18/src/entities/draw.ts` — DrawDoc (result: numbers[] + sum)
- `packages/game-bingo18/src/entities/entry.ts` — TicketEntryDoc (boardPayouts + sideBetPayouts)

### Shared utils (import, KHÔNG tự viết lại)

- `@megawin/shared/utils/date` — formatVNDate, displayVNTime, todayVN, etc.
- `@megawin/shared/utils/number` — formatVND, formatVNDCompact, formatCurrency
- `@megawin/shared/utils/financial-date` — getFinancialDate, getFinancialDateRange
- `@megawin/shared/errors` — AppException
- `@megawin/game-core/entities` — DrawStatus, EntryStatus, EntryOutcome

### Existing Bingo18 components (tái sử dụng)

- `apps/backoffice/src/components/games/bingo18/dice-display.tsx`
- `apps/backoffice/src/components/games/bingo18/draw-status-badge.tsx`
- `apps/backoffice/src/components/games/bingo18/stat-card.tsx`

### Existing Bingo18 draws page (cần cleanup cuối cùng)

- `apps/backoffice/src/app/(main)/games/bingo18/draws/` — XEM ĐỂ HIỂU, CLEANUP Ở PHASE CUỐI

---

## Tổng quan

Bingo 18: game high-frequency (~160 kỳ/ngày, mỗi 6 phút). KHÔNG CÓ Jackpot. Kết quả: 3 xúc xắc (1-6), tổng 3-18. Cấu trúc ticket: `boards[] + sideBets[]` tách biệt. 5 cách chơi (singleNum, doubleMatch, tripleMatch, sumTotal, bigSmallDraw).

**Financial model đơn giản**: `profit = totalRevenue - totalPrizes - totalAgentCommission`

---

## Phase 1: Application Layer

Tạo thư mục `packages/game-bingo18-application/src/use-cases/operations/`

### 1.1 DTOs — Tạo 5 files trong `dto/`

#### `dto/draw-selector.dto.ts`

Copy pattern từ Keno (`packages/game-keno-application/src/use-cases/operations/dto/draw-selector.dto.ts`).

```typescript
import type { DrawStatus } from "@megawin/game-core/entities";

export interface DrawSelectorItem {
  /** Mã định danh kỳ (format YYYY-MM-DD.NNN). */
  drawId: string;
  /** Ngày quay, format DD/MM/YYYY. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1-~160). */
  drawNo: number;
  /** Giờ quay, format HH:mm (giờ VN). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm mở bán (ISO 8601), optional nếu chưa mở. */
  salesOpenAt?: string;
  /** Thời điểm quay theo lịch (ISO 8601) — luôn có, dùng pre-fill form sửa lịch. */
  scheduledDrawAt: string;
  /** Thời điểm công bố kết quả (ISO 8601), chỉ có sau khi published. */
  drawResultAt?: string;
  status: DrawStatus;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /**
   * Nhóm hiển thị trong dropdown.
   * active: đang xử lý. upcoming: kỳ scheduled sắp tới. recent: kỳ settled gần đây.
   */
  group: "active" | "upcoming" | "recent";
}

export interface GetDrawSelectorOutput {
  draws: DrawSelectorItem[];
}
```

#### `dto/operations.dto.ts`

```typescript
export interface OpsQueryInput {
  financialDate?: string;
  drawId?: string;
}

export interface OpsSummaryOutput {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng số entry. */
  totalEntries: number;
  /** Tổng basic boards (singleNum + doubleMatch + tripleMatch). */
  totalBoards: number;
  /** Tổng side bets (sumTotal + bigSmallDraw). */
  totalSideBets: number;
  /** Số người chơi unique. */
  totalPlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}
```

Thêm: `TenantBreakdownItem`, `DiceFrequencyItem` (diceValue 1-6, amount, count), `PlayTypeDistributionItem` (playType, tripleKind?, entries, revenue).

#### `dto/live-entries.dto.ts`

Tham chiếu Keno `live-entries.dto.ts`. Entry Bingo18 có `boards: LiveEntryBoard[]` (boardNo, playType, number?, tripleKind?) + `sideBets: LiveEntrySideBet[]` (playType, sum?, bet?).

#### `dto/top-combos.dto.ts`

Top N side bet combinations (sumTotal values + bigSmallDraw bets phổ biến nhất).

#### `dto/winning-entries.dto.ts`

Cursor-based pagination. WinningEntryItem có `boardDetails: WinningBoardDetail[]` + `sideBetDetails: WinningSideBetDetail[]`. Mỗi board detail có matchCount (singleNum: 1/2/3), winAmount.

### 1.2 Use Cases — Tạo 8 files

Copy pattern từ Keno, tất cả extend `NextApiUseCase`:


| File                           | Input                   | Logic Bingo18-specific                                                                                |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `get-draw-selector.ts`         | void                    | 3 parallel queries: active + upcoming(10) + recent(15). **Copy logic từ Keno** `get-draw-selector.ts` |
| `get-ops-summary.ts`           | OpsQueryInput           | `entryRepo.aggregateOpsSummary()` — totalBoards + totalSideBets                                       |
| `get-tenant-breakdown.ts`      | OpsQueryInput           | `entryRepo.aggregateTenantBreakdown()`                                                                |
| `get-dice-frequency.ts`        | OpsQueryInput           | Aggregate mặt xúc xắc 1-6 từ boards (singleNum + doubleMatch). Pad đủ 6 giá trị                       |
| `get-playtype-distribution.ts` | OpsQueryInput           | 5 playTypes (tripleMatch split specific/any = 6 rows)                                                 |
| `get-live-entries.ts`          | drawId, limit?          | Validate draw exists + recent entries desc                                                            |
| `get-top-combos.ts`            | drawId, limit?          | Top N side bet combos                                                                                 |
| `get-winning-entries.ts`       | drawId, cursor?, limit? | Filter entries outcome win/partial_win                                                                |


### 1.3 Helpers — `helpers.ts`

Tạo `getFinancialDateToday()` — copy từ Keno `helpers.ts`.

### 1.4 Barrel export — `index.ts`

Export tất cả 8 use cases + tất cả DTO types.

### 1.5 Repository methods — Thêm vào `Bingo18EntryRepo`

Kiểm tra `packages/game-bingo18-application/src/infras/repos/entry-repo.ts`, thêm:

- `aggregateOpsSummary(filter)` — MongoDB aggregation pipeline
- `aggregateTenantBreakdown(filter)`
- `aggregateDiceFrequency(filter)` — `$unwind` boards → match singleNum/doubleMatch → group by number
- `aggregatePlayTypeDistribution(filter)` — group by playType + tripleKind
- `getRecentEntries(drawId, limit)` — sort createdAt desc
- `aggregateTopCombos(drawId, limit)` — aggregate sideBets
- `getWinningEntries(drawId, cursor?, limit?)` — filter outcome in [win, partial_win]

Tham chiếu Keno entry-repo để thấy pattern aggregation: `packages/game-keno-application/src/infras/repos/entry-repo.ts`

---

## Phase 2: API Routes

Tạo thư mục `apps/backoffice/src/app/api/bingo18/operations/`

### 2.1 Schemas — `_lib/schema.ts`

```typescript
import { z } from "zod";
import { ISO_DATE_REGEX } from "@megawin/shared/constants/validation";

export const opsQuerySchema = z.object({
  financialDate: z.string().regex(ISO_DATE_REGEX).optional(),
  drawId: z.string().optional(),
});

export const liveEntriesQuerySchema = z.object({
  drawId: z.string(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const topCombosQuerySchema = z.object({
  drawId: z.string(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const winningEntriesQuerySchema = z.object({
  drawId: z.string(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
```

### 2.2 Route handlers — 8 files

Mỗi route theo pattern chuẩn. Tham chiếu: `apps/backoffice/src/app/api/keno/operations/summary/route.ts`

```
operations/
├── _lib/schema.ts
├── draw-selector/route.ts     → GetDrawSelectorUseCase (no query)
├── summary/route.ts           → GetOpsSummaryUseCase (opsQuerySchema)
├── tenants/route.ts           → GetTenantBreakdownUseCase (opsQuerySchema)
├── dice-frequency/route.ts    → GetDiceFrequencyUseCase (opsQuerySchema)
├── playtype-distribution/route.ts → GetPlayTypeDistributionUseCase (opsQuerySchema)
├── live-entries/route.ts      → GetLiveEntriesUseCase (liveEntriesQuerySchema)
├── top-combos/route.ts        → GetTopCombosUseCase (topCombosQuerySchema)
└── winning-entries/route.ts   → GetWinningEntriesUseCase (winningEntriesQuerySchema)
```

Pattern mỗi route:

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
const useCase = new XXXUseCase();
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(schemaName)
  .handler(async ({ query }) => useCase.run({ ...query }));
```

---

## Phase 3: Frontend Core — types, hooks, context, selector

Tạo thư mục `apps/backoffice/src/app/(main)/games/bingo18/operations/`

### 3.1 `_lib/types.ts`

```typescript
import type { Bingo18PlayType, Bingo18BigSmallBet, Bingo18TripleKind } from "@megawin/game-bingo18/entities";

/** KPI tổng hợp cho Bingo18 operations. */
export interface OpsKpi {
  revenue: number;
  entries: number;
  boards: number;
  sideBets: number;
  players: number;
  commission: number;
}

/** Kết quả xúc xắc Bingo18 (3 viên, tổng 3-18). */
export interface Bingo18DrawResult {
  numbers: number[];     // [d1, d2, d3] — 3 xúc xắc 1-6
  sum: number;           // d1+d2+d3 (3-18)
  publishedAt: string;
}

/** Tài chính kỳ quay (KHÔNG có Jackpot). */
export interface Bingo18FinancialDisplay {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;   // = revenue - prizes - commission
}

/** Thông tin huỷ kỳ. */
export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount?: number;
}

/** Entry trong live feed. */
export interface LiveFeedEntry {
  entryId: string;
  username: string;
  tenantName: string;
  amount: number;
  boards: Array<{
    boardNo: string;
    playType: Bingo18PlayType;
    number?: number;
    tripleKind?: Bingo18TripleKind;
  }>;
  sideBets: Array<{
    playType: Bingo18PlayType;
    sum?: number;
    bet?: Bingo18BigSmallBet;
  }>;
  createdAt: string;
}
```

### 3.2 `_lib/use-operations.ts`

Copy từ Keno `use-operations.ts`, thay đổi:

- Query keys: dùng `bingo18Keys` (kiểm tra `apps/backoffice/src/lib/query/bingo18.ts`)
- API paths: `/bingo18/operations/...` thay vì `/keno/operations/...`
- Endpoint `dice-frequency` thay `number-frequency`
- Refetch intervals: giữ giống Keno (15s summary, 60s analytics) vì cùng high-frequency

**9 Query Hooks**: useDrawSelectorList, useDrawDetail, useOpsSummary, useOpsTenantBreakdown, useOpsDiceFrequency, useOpsPlayTypeDistribution, useOpsLiveEntries, useOpsTopCombos, useWinningEntries

**8 Mutation Hooks**: useOpenSales, useCloseSales, usePublishResult, useTriggerSettle, useVoidDraw, useUpdateSchedule, useCreateDraw, usePreviewDraws — endpoints `/bingo18/draws/...`

### 3.3 `_lib/use-draw-context.tsx`

Copy từ Keno `use-draw-context.tsx`, thay:

- Query keys → bingo18
- API paths → `/bingo18/...`
- Auto-select logic giữ nguyên (active → upcoming → draws[0])

### 3.4 `_lib/draw-selector.tsx`

Copy từ Keno `draw-selector.tsx` (Command Palette pattern, vì ~160 kỳ/ngày):

- 3 groups: active / upcoming / recent
- Search by giờ quay hoặc số kỳ
- Animated status dots
- Brand accent: **Teal/emerald** (khác Keno orange)

---

## Phase 4: Frontend — Draw Management Section

### 4.1 `sections/draw-management/index.tsx`

Copy từ Keno `sections/draw-management/index.tsx`:

- Orchestrator: 7 boolean dialog states
- 3 AlertDialogs: Mở bán, Đóng bán, Kết sổ
- 4 Action Dialogs: PublishResult, EditSchedule, VoidDraw, CreateDraw

### 4.2 `sections/draw-management/draw-command-center.tsx`

Copy từ Keno, thay đổi:

- Accent gradient: Teal (Bingo18 brand)
- Lifecycle Stepper: 4 bước giống nhau
- Kết quả inline: Dùng `DiceDisplay` (component có sẵn) thay vì KenoNumberBall

### 4.3 Draw Actions — `sections/draw-management/draw-actions/`


| File                        | Bingo18-specific                                                                                                                              | Tham chiếu                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `create-draw-action.tsx`    | Tạo 1-30 kỳ. Interval 6 phút. Preview API                                                                                                     | Keno create-draw-action.tsx        |
| `edit-schedule-action.tsx`  | react-hook-form + Zod. 3 trường: salesOpenAt, salesCloseAt, drawTime                                                                          | Keno edit-schedule-action.tsx      |
| `publish-result-action.tsx` | **ĐẶC THÙ**: Nhập 3 số xúc xắc (1-6). UI: 3 ô lớn dạng dice. Auto-calculate sum. DevRandomFillButton. Zod validate: array 3 numbers, each 1-6 | VIẾT MỚI (đơn giản hơn Keno 20 số) |
| `void-draw-action.tsx`      | Textarea lý do. Cảnh báo "không thể hoàn tác"                                                                                                 | Keno void-draw-action.tsx          |
| `index.ts`                  | Barrel export                                                                                                                                 |                                    |


---

## Phase 5: Frontend — KPI, Result, Analytics Sections

### 5.1 KPI Section — `sections/kpi/`

Copy từ Keno kpi, giữ **6 KPI Cards**:


| Card          | Metric     | Color  |
| ------------- | ---------- | ------ |
| Doanh thu     | revenue    | Teal   |
| Entries       | entries    | Blue   |
| Boards cơ bản | boards     | Indigo |
| Side bets     | sideBets   | Cyan   |
| Người chơi    | players    | Violet |
| Hoa hồng ĐL   | commission | Amber  |


### 5.2 Result Section — `sections/result/`

Hiển thị khi Published/Settling/Settled. Layout: `grid lg:grid-cols-[3fr_2fr]`.

**ResultAndPrize (trái)**:

- `DiceDisplay` — 3 viên xúc xắc + tổng (dùng component có sẵn)
- Bảng giải Basic (`basicPrizes`): SingleNum match1/2/3, DoubleMatch win, TripleMatch specific/any
- Bảng giải Side Bet (`sideBetPrizes`): SumTotal theo tổng, BigSmallDraw big/draw/small
- Nút "Xem entries trúng" → WinningEntriesDialog

**FinancialSummary (phải)**:

- Revenue - Prizes - Commission = Profit
- Note: "Bingo 18 không có Jackpot tích luỹ"
- KHÔNG hiển thị jackpotContribution

**WinningEntriesDialog**: Full-screen dialog, tham chiếu Keno winning-entries-dialog.tsx.

### 5.3 Analytics Section — `sections/analytics/`

Hiển thị khi SalesOpen+.

`**analytics-panels.tsx`**:

- PlayTypeCard: Bar chart 6 loại (singleNum, doubleMatch, tripleMatch-specific, tripleMatch-any, sumTotal, bigSmallDraw)
- TenantBreakdownCard: Bảng đại lý (tham chiếu Keno)

`**dice-heatmap.tsx`** (VIẾT MỚI — thay thế number-heatmap 80 số):

- Grid **6 ô** (1-6): mỗi ô hiển thị count + amount
- Đơn giản hơn Keno nhiều (6 vs 80 ô)
- Top Combos sidebar: Top N sumTotal values + bigSmallDraw picks

`**live-feed.tsx`**: Copy từ Keno, thay đổi:

- Color-coded theo playType (basic teal, side bet cyan)
- Hiển thị dice number cho basic, sum/bet cho side bets

---

## Phase 6: Frontend — page.tsx

Copy từ Keno `page.tsx`, compose tất cả sections:

```
DrawContextProvider
└── OperationsContent
    ├── PageHeader (title + DrawSelector + "Tạo kỳ" + LastUpdatedBadge)
    ├── DrawManagementSection
    ├── KpiSection
    ├── ResultSection (khi published+)
    └── AnalyticsSection (khi salesOpen+)
```

---

## Phase 7: Draws Page Cleanup

Trang draws hiện tại cần chuyển thành **readonly overview**:

### 7.1 Xoá files

```
draws/_lib/actions/open-sales-action.tsx       → XOÁ
draws/_lib/actions/close-sales-action.tsx       → XOÁ
draws/_lib/actions/publish-result-action.tsx    → XOÁ
draws/_lib/actions/trigger-settle-action.tsx    → XOÁ
draws/_lib/actions/edit-schedule-action.tsx     → XOÁ
draws/_lib/actions/void-draw-action.tsx         → XOÁ
draws/_lib/create-draw-dialog.tsx               → XOÁ
```

### 7.2 Sửa files

- `draws/_lib/active-draw-card.tsx`: Xoá action bar, chỉ giữ readonly display + link sang operations
- `draws/page.tsx`: Xoá import actions, thêm prominent link "Đi đến trang vận hành" → `/games/bingo18/operations`
- `draws/_lib/use-draws.ts`: Xoá mutation hooks không còn dùng

### 7.3 Giữ nguyên

- `draws/_lib/draw-history-section.tsx` — Đã có link sang operations `?draw=xxx`

---

## Phase 8: Type Check & Lint

```bash
npx tsc --noEmit --project packages/game-bingo18-application/tsconfig.json
npx tsc --noEmit --project apps/backoffice/tsconfig.json
```

Kiểm tra lint trên tất cả file đã tạo/sửa.

---

## Lưu ý quan trọng

1. **KHÔNG CÓ Jackpot**: Financial model đơn giản, KHÔNG hiển thị jackpot sections
2. **boards + sideBets tách biệt**: Ticket, Entry, KPI, Result đều tách 2 mảng riêng
3. **High-frequency polling**: 15s cho summary/live-entries, 60s cho analytics (giống Keno)
4. **Draw selector dùng Command Palette**: ~160 kỳ/ngày cần search + grouping (giống Keno)
5. **3 xúc xắc 1-6**: Publish result chỉ cần nhập 3 số (rất đơn giản so với Keno 20 số)
6. **DiceDisplay component đã có sẵn**: Tái sử dụng cho result section
7. **salesCloseBeforeSeconds = 30s**: Đóng bán tính bằng GIÂY, không phải phút
8. **Brand color Teal/emerald**: Phân biệt với Keno (orange)

