# Plan: Max 3D — Operations & Draws Pages

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Game Rules & Cursor Rules (đọc lần lượt)
1. **Game rule**: `.cursor/rules/max3d-game-rules.mdc` — ĐỌC ĐẦU TIÊN
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc` — JSDoc, comment business logic
3. **Entity design**: `.cursor/rules/entity-typesafe-mongodb.mdc` — Named interfaces, dot notation
4. **Dashboard UI**: `.cursor/rules/Dashboard-UI-Design.mdc` — Layout, tokens, KPI cards

### Template chính — Lotto535 (cùng low-frequency pattern)
- **Operations page**: `apps/backoffice/src/app/(main)/games/lotto535/operations/` — COPY STRUCTURE
- **Operations API**: `apps/backoffice/src/app/api/lotto535/operations/` — COPY PATTERN
- **Operations use cases**: `packages/game-lotto535-application/src/use-cases/operations/` — COPY PATTERN
- **Draw selector DTO**: `packages/game-lotto535-application/src/use-cases/operations/dto/draw-selector.dto.ts`
- **Draw selector use case**: `packages/game-lotto535-application/src/use-cases/operations/get-draw-selector.ts`
- **Operations hooks**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/use-operations.ts`
- **Draw context**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/use-draw-context.tsx`
- **Draw selector UI**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/draw-selector.tsx`
- **Draw command center**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/draw-management/draw-command-center.tsx`
- **Publish result**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`
- **Result section**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/result/index.tsx`

### Max3D entities hiện có (đọc để hiểu data model)
- `packages/game-max3d/src/entities/enums.ts` — PlayMode (basic, plus), PlayType (straight, combo3, combo6, quickPick), BasicPrizeTier (4 hạng), PlusPrizeTier (7 hạng)
- `packages/game-max3d/src/entities/types.ts` — Triplet, BoardSelection, BasicPrizeAmounts, ComboPrizeAmounts, PlusPrizeAmounts
- `packages/game-max3d/src/entities/draw.ts` — DrawDoc
- `packages/game-max3d/src/entities/draw-result.ts` — Max3dDrawResult { special[2], first[4], second[6], third[8] }
- `packages/game-max3d/src/entities/entry.ts` — TicketEntryDoc, EntryBoardSnapshot, EntryPayoutTier
- `packages/game-max3d/src/entities/line.ts` — TicketLineDoc, LineMatchResult

### Shared utils (import, KHÔNG tự viết lại)
- `@megawin/shared/utils/date` — formatVNDate, displayVNTime, todayVN
- `@megawin/shared/utils/number` — formatVND, formatVNDCompact, formatCurrency
- `@megawin/shared/utils/financial-date` — getFinancialDate, getFinancialDateRange
- `@megawin/shared/errors` — AppException
- `@megawin/game-core/entities` — DrawStatus, EntryStatus, EntryOutcome

### Existing Max3D draws page (cần cleanup cuối cùng)
- `apps/backoffice/src/app/(main)/games/max3d/draws/` — XEM ĐỂ HIỂU, CLEANUP Ở PHASE CUỐI

---

## Tổng quan

Max 3D: game low-frequency (3 kỳ/tuần T2/T4/T6, 18h00). KHÔNG CÓ Jackpot. Kết quả: 20 bộ ba số (triplet 000-999) chia 4 nhóm (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba). 2 play modes: basic (straight/combo3/combo6) + plus (2 bộ ba). 2 prize enums tách biệt: BasicPrizeTier (4 hạng) vs PlusPrizeTier (7 hạng).

**Financial model đơn giản**: `profit = totalRevenue - totalFixedPrizes - totalAgentCommission`

---

## Phase 1: Application Layer

Tạo thư mục `packages/game-max3d-application/src/use-cases/operations/`

### 1.1 DTOs — Tạo 5 files trong `dto/`

#### `dto/draw-selector.dto.ts`
Copy pattern từ **Lotto535** (`packages/game-lotto535-application/src/use-cases/operations/dto/draw-selector.dto.ts`).

```typescript
export interface DrawSelectorItem {
  /** Mã kỳ quay (format YYYY-MM-DD.001 — luôn 1 kỳ/ngày). */
  drawId: string;
  /** Số thứ tự kỳ (luôn = 1). */
  drawNo: number;
  /** Ngày quay, format DD/MM/YYYY. */
  drawDate: string;
  /** Giờ quay dự kiến, format HH:mm (luôn "18:00"). */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601). */
  salesOpenAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm quay số (ISO 8601). */
  drawResultAt?: string;
  status: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /**
   * active: cần xử lý. future: kỳ scheduled trong tương lai. recent: đã xong trong 48h.
   */
  group: "active" | "future" | "recent";
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
  /** Tổng lines (expand từ boards khi settle). */
  totalLines: number;
  /** Số người chơi unique. */
  totalPlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}
```
Thêm: `TenantBreakdownItem` (tenantId, tenantName, entries, revenue, commission, players), `TripletFrequencyItem` (triplet string "000"-"999", amount, count), `PlayTypeDistributionItem` (playMode, playType, entries, revenue).

#### `dto/live-entries.dto.ts`
LiveEntryBoard: boardNo ("A"-"D"), playMode (basic/plus), playType (straight/combo3/combo6/quickPick), triplets string[].

#### `dto/top-combos.dto.ts`
Top N bộ ba + cặp bộ ba plus phổ biến.

#### `dto/winning-entries.dto.ts`
WinningLineDetail: triplet, secondTriplet? (plus mode), tier (BasicPrizeTier | PlusPrizeTier), winAmount, isDuplicate? (plus: 2 bộ giống → x2).

### 1.2 Use Cases — 8 files

Copy pattern từ **Lotto535**, tất cả extend `NextApiUseCase`:

| File | Input | Logic Max3D-specific |
|---|---|---|
| `get-draw-selector.ts` | void | Active + future 14 ngày + recent 48h. **Copy logic từ Lotto535** `get-draw-selector.ts`. Chỉ 3 kỳ/tuần (T2/T4/T6) |
| `get-ops-summary.ts` | OpsQueryInput | `totalLines` (không có totalBoards/totalSideBets) |
| `get-tenant-breakdown.ts` | OpsQueryInput | Giống Lotto535 |
| `get-triplet-frequency.ts` | OpsQueryInput | Top N bộ ba phổ biến (000-999 space = 1000, dùng top N thay vì full) |
| `get-playtype-distribution.ts` | OpsQueryInput | 4 types: straight, combo3, combo6, plus. Cần group by playMode + playType |
| `get-live-entries.ts` | drawId, limit? | Boards A-D với triplets |
| `get-top-combos.ts` | drawId, limit? | Top N bộ ba + cặp bộ ba plus |
| `get-winning-entries.ts` | drawId, cursor?, limit? | Lines với BasicPrizeTier/PlusPrizeTier, isDuplicate |

### 1.3 Helpers — `helpers.ts`
Tạo `getFinancialDateToday()`.

### 1.4 Barrel export — `index.ts`

### 1.5 Repository methods — Thêm vào `Max3dEntryRepo`
Kiểm tra `packages/game-max3d-application/src/infras/repos/entry-repo.ts`, thêm:
- `aggregateOpsSummary(filter)` — totalLines cần `$sum: "$entrySummary.lineCount"`
- `aggregateTenantBreakdown(filter)`
- `aggregateTripletFrequency(filter, limit)` — `$unwind` boards → `$unwind` triplets → group by triplet → sort desc → limit
- `aggregatePlayTypeDistribution(filter)` — group by (playMode, playType)
- `getRecentEntries(drawId, limit)`
- `aggregateTopCombos(drawId, limit)`
- `getWinningEntries(drawId, cursor?, limit?)`

Tham chiếu Lotto535 entry-repo: `packages/game-lotto535-application/src/infras/repos/entry-repo.ts`

---

## Phase 2: API Routes

Tạo thư mục `apps/backoffice/src/app/api/max3d/operations/`

### 2.1 Schemas — `_lib/schema.ts`
Giống Bingo18/Keno schemas: `opsQuerySchema`, `liveEntriesQuerySchema`, `topCombosQuerySchema`, `winningEntriesQuerySchema`.

### 2.2 Route handlers — 8 files

```
operations/
├── _lib/schema.ts
├── draw-selector/route.ts          → GetDrawSelectorUseCase
├── summary/route.ts                → GetOpsSummaryUseCase
├── tenants/route.ts                → GetTenantBreakdownUseCase
├── triplet-frequency/route.ts      → GetTripletFrequencyUseCase
├── playtype-distribution/route.ts  → GetPlayTypeDistributionUseCase
├── live-entries/route.ts           → GetLiveEntriesUseCase
├── top-combos/route.ts             → GetTopCombosUseCase
└── winning-entries/route.ts        → GetWinningEntriesUseCase
```

Pattern route giống Lotto535:
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

## Phase 3: Frontend Core

Tạo `apps/backoffice/src/app/(main)/games/max3d/operations/`

### 3.1 `_lib/types.ts`

```typescript
import type { PlayMode, PlayType, BasicPrizeTier, PlusPrizeTier } from "@megawin/game-max3d/entities";

export interface OpsKpi {
  revenue: number;
  entries: number;
  lines: number;          // Thay vì boards+sideBets
  players: number;
  commission: number;
}

/** Kết quả 20 bộ ba số chia 4 hạng. */
export interface Max3dDrawResultDisplay {
  special: string[];      // 2 bộ ba ĐB
  first: string[];        // 4 bộ ba Nhất
  second: string[];       // 6 bộ ba Nhì
  third: string[];        // 8 bộ ba Ba
  publishedAt: string;
}

/** Tài chính kỳ quay (KHÔNG có Jackpot). */
export interface Max3dFinancialDisplay {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
}

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount?: number;
}

export interface LiveFeedEntry {
  entryId: string;
  username: string;
  tenantName: string;
  amount: number;
  boards: Array<{
    boardNo: string;
    playMode: PlayMode;
    playType: PlayType;
    triplets: string[];
  }>;
  createdAt: string;
}
```

### 3.2 `_lib/use-operations.ts`
Copy từ **Lotto535** `use-operations.ts`, thay đổi:
- Query keys: `max3dKeys` (kiểm tra `apps/backoffice/src/lib/query/max3d.ts`)
- API paths: `/max3d/operations/...`
- Endpoint `triplet-frequency` thay `number-frequency`
- Refetch intervals **thấp hơn Keno** (vì low-frequency): 30s summary, 60s tenants, 120s analytics

**9 Query Hooks**: useDrawSelectorList, useDrawDetail, useOpsSummary, useOpsTenantBreakdown, useOpsTripletFrequency, useOpsPlayTypeDistribution, useOpsLiveEntries, useOpsTopCombos, useWinningEntries

**8 Mutation Hooks**: endpoints `/max3d/draws/...`

### 3.3 `_lib/use-draw-context.tsx`
Copy từ **Lotto535**, thay query keys + API paths → max3d.

### 3.4 `_lib/draw-selector.tsx`
Copy từ **Lotto535** (Simple Select dropdown, KHÔNG phải Command Palette):
- 3 groups: "Cần xử lý" / "Kỳ tương lai" / "Vừa hoàn thành (48h)"
- Chỉ vài kỳ (3 kỳ/tuần) → Select đơn giản đủ rồi
- Footer link → `/games/max3d/draws`

---

## Phase 4: Frontend — Draw Management Section

### 4.1 `sections/draw-management/index.tsx`
Copy từ Lotto535, thay mutations → max3d.

### 4.2 `sections/draw-management/draw-command-center.tsx`
Copy từ Lotto535, thay đổi:
- Accent gradient: **Rose/pink** (Max3D brand)
- Kết quả inline: Hiển thị 20 bộ ba số (grouped) thay vì LottoNumberBall
- **Không có Jackpot hero card**

### 4.3 Draw Actions

| File | Max3D-specific | Tham chiếu |
|---|---|---|
| `create-draw-action.tsx` | Tạo 1-12 kỳ. DrawNo = 1. Ngày chỉ T2/T4/T6. Giờ = 18:00 | Lotto535 create-draw-action.tsx |
| `edit-schedule-action.tsx` | Giống Lotto535 (date+time inputs) | Lotto535 edit-schedule-action.tsx |
| `publish-result-action.tsx` | **ĐẶC THÙ MAX3D**: Nhập **20 bộ ba số** chia 4 nhóm. UI: 4 sections (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba). Mỗi input validate `/^\d{3}$/`. DevRandomFillButton generate random 000-999. Zod schema validate đủ 20 bộ | VIẾT MỚI |
| `void-draw-action.tsx` | Giống Lotto535 | Lotto535 void-draw-action.tsx |
| `index.ts` | Barrel export | |

**Chi tiết publish-result-action.tsx:**
```
┌─────────────────────────────────────────┐
│ Công bố kết quả Max 3D                 │
├─────────────────────────────────────────┤
│ Giải Đặc Biệt (2 bộ):                 │
│ [___] [___]                             │
│                                         │
│ Giải Nhất (4 bộ):                      │
│ [___] [___] [___] [___]                │
│                                         │
│ Giải Nhì (6 bộ):                       │
│ [___] [___] [___] [___] [___] [___]    │
│                                         │
│ Giải Ba (8 bộ):                        │
│ [___] [___] [___] [___]                │
│ [___] [___] [___] [___]                │
│                                         │
│ [DevRandomFill]    [Huỷ] [Công bố]     │
└─────────────────────────────────────────┘
```

---

## Phase 5: Frontend — KPI, Result, Analytics

### 5.1 KPI Section — **5 KPI Cards** (không có sideBets)

| Card | Metric | Color |
|---|---|---|
| Doanh thu | revenue | Rose |
| Entries | entries | Blue |
| Lines | lines | Indigo |
| Người chơi | players | Violet |
| Hoa hồng ĐL | commission | Amber |

### 5.2 Result Section
Hiển thị khi Published/Settling/Settled. Layout: `grid lg:grid-cols-[3fr_2fr]`.

**ResultAndPrize (trái)**:
- 20 bộ ba số grouped theo 4 nhóm (ĐB highlight, Nhất/Nhì/Ba phân cấp visual)
- **Bảng giải Basic** (4 hạng): ĐB / Nhất / Nhì / Ba — 3 cột giá trị: straight, combo3, combo6
- **Bảng giải Plus** (7 hạng): ĐB / Nhất / Nhì / Ba / Tư / Năm / Sáu — 1 cột giá trị
- Nút "Xem entries trúng" → WinningEntriesDialog

**FinancialSummary (phải)**:
- Revenue - Prizes - Commission = Profit
- Note: "Max 3D không có Jackpot tích luỹ"

**WinningEntriesDialog**: Table hiển thị lines trúng, tier, isDuplicate (x2 label), winAmount.

### 5.3 Analytics Section

**`analytics-panels.tsx`**:
- PlayTypeCard: Bar chart 4 loại (straight, combo3, combo6, plus). Color-coded basic vs plus
- TenantBreakdownCard: Bảng đại lý

**`triplet-chart.tsx`** (VIẾT MỚI — thay thế number-heatmap):
- **Top N bộ ba phổ biến**: Horizontal bar chart (top 20-30)
- KHÔNG dùng full heatmap 1000 ô (quá nhiều)
- Section Top Combos Plus: cặp bộ ba plus phổ biến nhất (with medals)

**`live-feed.tsx`**: Copy từ Lotto535, thay:
- Hiển thị triplets cho mỗi board
- Tag playMode (basic/plus) + playType (straight/combo)

---

## Phase 6: Frontend — page.tsx

Copy từ Lotto535 `page.tsx`, compose:

```
DrawContextProvider
└── OperationsContent
    ├── PageHeader (title + DrawSelector + "Tạo kỳ" + LastUpdatedBadge)
    ├── DrawManagementSection       ← KHÔNG có JackpotHeroCard (khác Lotto535)
    ├── KpiSection
    ├── ResultSection (khi published+)
    └── AnalyticsSection (khi salesOpen+)
```

**LƯU Ý**: Lotto535 có `JackpotHeroCard` ở zone 2 — Max 3D KHÔNG CÓ, bỏ qua.

---

## Phase 7: Draws Page Cleanup

### 7.1 Xoá files
```
draws/_lib/actions/open-sales-action.tsx
draws/_lib/actions/close-sales-action.tsx
draws/_lib/actions/publish-result-action.tsx
draws/_lib/actions/trigger-settle-action.tsx
draws/_lib/actions/edit-schedule-action.tsx
draws/_lib/actions/void-draw-action.tsx
draws/_lib/create-draw-dialog.tsx
```

### 7.2 Sửa files
- `active-draw-card.tsx`: Xoá action bar → readonly + link sang operations
- `page.tsx`: Thêm link "Đi đến trang vận hành" → `/games/max3d/operations`
- `use-draws.ts`: Xoá mutation hooks

---

## Phase 8: Type Check & Lint

```bash
npx tsc --noEmit --project packages/game-max3d-application/tsconfig.json
npx tsc --noEmit --project apps/backoffice/tsconfig.json
```

---

## Lưu ý quan trọng

1. **KHÔNG CÓ Jackpot, KHÔNG CÓ companyRate**: profit = revenue - prizes - commission. KHÔNG hiển thị jackpot sections
2. **Triplet = string "000"-"999"**: Validate `/^\d{3}$/`. Zero-padded 3 chữ số
3. **2 Prize Enums tách biệt**: `BasicPrizeTier` (4 hạng) vs `PlusPrizeTier` (7 hạng) — result section cần 2 bảng giải
4. **Combo CHỈ cho basic**: Plus mode chỉ straight/quickPick
5. **Duplicate x2 trong Plus**: 2 bộ ba giống → giải × 2 — hiển thị badge "x2"
6. **20 bộ kết quả/kỳ**: DrawResult 4 mảng: special[2], first[4], second[6], third[8]
7. **Low-frequency polling**: 30s summary, 120s analytics (khác Keno 15s/60s)
8. **Simple Select dropdown**: 3 kỳ/tuần → không cần Command Palette
9. **Brand color Rose/pink**: Phân biệt với Keno (orange) và Bingo18 (teal)
10. **Lịch quay T2/T4/T6**: Create draw action cần validate ngày phù hợp
11. **DrawNo luôn = 1**: 1 kỳ/ngày (khác Lotto535 có drawNo 1|2)
