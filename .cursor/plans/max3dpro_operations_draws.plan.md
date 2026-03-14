# Plan: Max 3D Pro — Operations & Draws Pages

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Game Rules & Cursor Rules (đọc lần lượt)
1. **Game rule**: `.cursor/rules/max3dpro-game-rules.mdc` — ĐỌC ĐẦU TIÊN
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc` — JSDoc, comment business logic
3. **Entity design**: `.cursor/rules/entity-typesafe-mongodb.mdc` — Named interfaces, dot notation
4. **Dashboard UI**: `.cursor/rules/Dashboard-UI-Design.mdc` — Layout, tokens, KPI cards

### Template chính — Lotto535 (low-frequency) + Max 3D (cùng draw result format)
- **Operations page**: `apps/backoffice/src/app/(main)/games/lotto535/operations/` — COPY STRUCTURE
- **Operations API**: `apps/backoffice/src/app/api/lotto535/operations/` — COPY PATTERN
- **Operations use cases**: `packages/game-lotto535-application/src/use-cases/operations/` — COPY PATTERN
- **Draw selector DTO**: `packages/game-lotto535-application/src/use-cases/operations/dto/draw-selector.dto.ts`
- **Draw selector use case**: `packages/game-lotto535-application/src/use-cases/operations/get-draw-selector.ts`
- **Draw selector UI**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/draw-selector.tsx`
- **Draw context**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/use-draw-context.tsx`
- **Hooks**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/use-operations.ts`
- **Command center**: `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/draw-management/draw-command-center.tsx`

### Tham chiếu Max 3D (cùng draw result, publish result tương đồng)
- Nếu Max 3D operations đã được build trước → tham chiếu trực tiếp `apps/backoffice/src/app/(main)/games/max3d/operations/` thay vì Lotto535 cho phần publish-result, result section, analytics
- **Publish result**: Nếu Max 3D đã có, copy publish-result-action.tsx từ Max 3D (cùng 20 bộ ba, cùng 4 nhóm)
- **Result display**: Cùng format 20 bộ ba, nhưng **khác nhau về bảng giải** (8 hạng thay vì 4+7)

### Max3D Pro entities hiện có (đọc để hiểu data model)
- `packages/game-max3dpro/src/entities/enums.ts` — PlayMode (multiNumber, multiDigit), PlayType (straight, quickPick), PrizeTier (8 hạng: special, specialSub, first-sixth)
- `packages/game-max3dpro/src/entities/types.ts` — Triplet, TripletPair, BoardSelection (triplets + frontDigits? + backDigits?), PrizeAmounts (8 fields)
- `packages/game-max3dpro/src/entities/draw.ts` — DrawDoc
- `packages/game-max3dpro/src/entities/draw-result.ts` — Max3dproDrawResult { special[2], first[4], second[6], third[8] }
- `packages/game-max3dpro/src/entities/entry.ts` — TicketEntryDoc, EntryBoardSnapshot, EntryPayoutTier
- `packages/game-max3dpro/src/entities/line.ts` — TicketLineDoc, LineMatchResult
- `packages/game-max3dpro/src/rules/prize-tiers.ts` — matchPair() (ordered: ĐB vs phụ ĐB)
- `packages/game-max3dpro/src/rules/play-types.ts` — expandSelectionToPairs(), getUniquePermutations()

### Shared utils (import, KHÔNG tự viết lại)
- `@megawin/shared/utils/date` — formatVNDate, displayVNTime, todayVN
- `@megawin/shared/utils/number` — formatVND, formatVNDCompact, formatCurrency
- `@megawin/shared/utils/financial-date` — getFinancialDate, getFinancialDateRange
- `@megawin/shared/errors` — AppException
- `@megawin/game-core/entities` — DrawStatus, EntryStatus, EntryOutcome

### Existing Max3D Pro draws page (cần cleanup cuối cùng)
- `apps/backoffice/src/app/(main)/games/max3dpro/draws/` — XEM ĐỂ HIỂU, CLEANUP Ở PHASE CUỐI

---

## Tổng quan

Max 3D Pro: game low-frequency (3 kỳ/tuần T3/T5/T7, 18h00). KHÔNG CÓ Jackpot. Kết quả: 20 bộ ba số (giống Max 3D). Đơn vị cơ bản: **TripletPair** (ordered pair). 2 play modes: multiNumber (C(n,2) cặp) + multiDigit (perms front × perms back). **8 hạng giải** gồm Giải phụ ĐB (unique Max 3D Pro). **1 PrizeTier enum** (khác Max 3D có 2 enums).

**Financial model đơn giản**: `profit = totalRevenue - totalFixedPrizes - totalAgentCommission`

### Khác biệt chính với Max 3D

| Aspect | Max 3D | Max 3D Pro |
|---|---|---|
| Play modes | basic (straight/combo3/combo6) + plus | multiNumber + multiDigit |
| Đơn vị cơ bản | Triplet (basic) hoặc unordered pair (plus) | TripletPair (ordered) |
| Prize tiers | 2 enums: BasicPrizeTier (4) + PlusPrizeTier (7) | 1 enum: PrizeTier (8, gồm specialSub) |
| Giải phụ ĐB | KHÔNG | CÓ (400 triệu, ngược thứ tự) |
| Ordered pair | Không (plus: cùng nhóm là đủ) | Có (ĐB đúng thứ tự vs phụ ĐB ngược thứ tự) |
| Combo play | Có (combo3, combo6) | KHÔNG |
| Lịch quay | T2/T4/T6 | T3/T5/T7 |

---

## Phase 1: Application Layer

Tạo thư mục `packages/game-max3dpro-application/src/use-cases/operations/`

### 1.1 DTOs — Tạo 5 files trong `dto/`

#### `dto/draw-selector.dto.ts`
Copy từ **Lotto535** draw-selector.dto.ts. Group: `"active" | "future" | "recent"`. DrawNo luôn = 1.

#### `dto/operations.dto.ts`

```typescript
export interface OpsQueryInput {
  financialDate?: string;
  drawId?: string;
}

export interface OpsSummaryOutput {
  totalRevenue: number;
  totalEntries: number;
  /** Tổng TripletPair lines (expand từ boards). */
  totalLines: number;
  totalPlayers: number;
  totalCommission: number;
}

export interface PlayTypeDistributionItem {
  /** multiNumber hoặc multiDigit. */
  playMode: PlayMode;
  entries: number;
  revenue: number;
  /** Trung bình số cặp TripletPair per entry. */
  avgPairsPerEntry: number;
}
```
Thêm: `TenantBreakdownItem`, `TripletFrequencyItem` (giống Max 3D).

#### `dto/live-entries.dto.ts`

```typescript
export interface LiveEntryBoard {
  boardNo: string;
  playMode: PlayMode;          // multiNumber | multiDigit
  playType: PlayType;          // straight | quickPick
  /** multiNumber: danh sách bộ ba đã chọn. */
  triplets?: string[];
  /** multiDigit: 3 chữ số đầu. */
  frontDigits?: number[];
  /** multiDigit: 3 chữ số sau. */
  backDigits?: number[];
  /** Số cặp TripletPair expand ra. */
  lineCount: number;
}
```

#### `dto/winning-entries.dto.ts`

```typescript
export interface WinningLineDetail {
  /** TripletPair.first — bộ ba đầu. */
  first: string;
  /** TripletPair.second — bộ ba sau. */
  second: string;
  /** 1 trong 8 hạng giải (special, specialSub, first-sixth). */
  tier: PrizeTier;
  winAmount: number;
  /** 2 bộ ba giống nhau → giải thưởng × 2. */
  isDuplicate: boolean;
}
```

### 1.2 Use Cases — 8 files

| File | Max3D Pro-specific |
|---|---|
| `get-draw-selector.ts` | Copy Lotto535 logic. T3/T5/T7 |
| `get-ops-summary.ts` | `totalLines` = tổng TripletPair lines |
| `get-tenant-breakdown.ts` | Giống Lotto535 |
| `get-triplet-frequency.ts` | Top N bộ ba (giống Max 3D) |
| `get-playtype-distribution.ts` | 2 modes: multiNumber + multiDigit + avgPairsPerEntry |
| `get-live-entries.ts` | Board có frontDigits/backDigits cho multiDigit |
| `get-top-combos.ts` | Top N cặp TripletPair (ordered) phổ biến |
| `get-winning-entries.ts` | 8 PrizeTier (gồm specialSub), isDuplicate |

### 1.3 Repository methods — Thêm vào `Max3dproEntryRepo`
Kiểm tra `packages/game-max3dpro-application/src/infras/repos/entry-repo.ts`, thêm tương tự Max 3D.

---

## Phase 2: API Routes

Tạo `apps/backoffice/src/app/api/max3dpro/operations/`

```
operations/
├── _lib/schema.ts
├── draw-selector/route.ts
├── summary/route.ts
├── tenants/route.ts
├── triplet-frequency/route.ts
├── playtype-distribution/route.ts
├── live-entries/route.ts
├── top-combos/route.ts
└── winning-entries/route.ts
```

Pattern route chuẩn giống Max 3D.

---

## Phase 3: Frontend Core

Tạo `apps/backoffice/src/app/(main)/games/max3dpro/operations/`

### 3.1 `_lib/types.ts`

```typescript
import type { PlayMode, PlayType, PrizeTier } from "@megawin/game-max3dpro/entities";

export interface OpsKpi {
  revenue: number;
  entries: number;
  lines: number;          // TripletPair lines
  players: number;
  commission: number;
}

/** Kết quả 20 bộ ba — giống Max 3D nhưng thứ tự ĐB quan trọng. */
export interface Max3dproDrawResultDisplay {
  /** special[0] = Giải ĐB, special[1] = Giải phụ ĐB — THỨ TỰ QUAN TRỌNG. */
  special: string[];
  first: string[];
  second: string[];
  third: string[];
  publishedAt: string;
}

export interface Max3dproFinancialDisplay {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
}
```

### 3.2 `_lib/use-operations.ts`
Copy từ Lotto535 (hoặc Max 3D nếu đã build). Thay:
- Query keys: `max3dproKeys`
- API paths: `/max3dpro/operations/...`
- Refetch: 30s summary, 120s analytics (low-frequency)

### 3.3 `_lib/use-draw-context.tsx`
Copy từ Lotto535/Max 3D, thay keys + paths.

### 3.4 `_lib/draw-selector.tsx`
Simple Select dropdown (giống Max 3D/Lotto535). Footer link → `/games/max3dpro/draws`

---

## Phase 4: Frontend — Draw Management

### 4.1 `sections/draw-management/index.tsx`
Copy từ Max 3D (nếu đã build) hoặc Lotto535.

### 4.2 `sections/draw-management/draw-command-center.tsx`
- Accent gradient: **Purple/violet** (Max3D Pro brand)
- Kết quả inline: 20 bộ ba grouped (giống Max 3D)
- **HIGHLIGHT**: special[0] label "ĐB" + special[1] label "Phụ ĐB" — phân biệt rõ thứ tự

### 4.3 Draw Actions

| File | Max3D Pro-specific |
|---|---|
| `create-draw-action.tsx` | Tạo 1-12 kỳ. Ngày T3/T5/T7 (khác Max 3D T2/T4/T6). Giờ 18:00 |
| `edit-schedule-action.tsx` | Giống Max 3D |
| `publish-result-action.tsx` | **GIỐNG Max 3D**: 20 bộ ba, 4 nhóm. **NHƯNG** label ĐB phải ghi rõ "Bộ ba ĐB thứ nhất" và "Bộ ba ĐB thứ hai" vì **thứ tự quyết định** Giải ĐB (2 tỷ) vs Giải phụ ĐB (400 triệu). Nếu Max 3D đã build → copy và thêm label |
| `void-draw-action.tsx` | Giống Max 3D |

**Chi tiết publish-result — ĐẶC THÙ thứ tự ĐB:**
```
┌─────────────────────────────────────────────────┐
│ Giải Đặc Biệt:                                 │
│ ĐB 1 (2 tỷ): [___]    ĐB 2 (Phụ 400tr): [___] │
│ ⚠ Thứ tự quan trọng: ĐB 1 trước, ĐB 2 sau    │
│                                                 │
│ Giải Nhất (4 bộ):                              │
│ [___] [___] [___] [___]                         │
│ ...                                             │
└─────────────────────────────────────────────────┘
```

---

## Phase 5: Frontend — KPI, Result, Analytics

### 5.1 KPI Section — **5 KPI Cards**

| Card | Metric | Color |
|---|---|---|
| Doanh thu | revenue | Purple |
| Entries | entries | Blue |
| Lines (cặp) | lines | Indigo |
| Người chơi | players | Violet |
| Hoa hồng ĐL | commission | Amber |

### 5.2 Result Section

**ResultAndPrize (trái)**:
- 20 bộ ba grouped 4 nhóm — **ĐB highlight thứ tự**:
  - special[0]: Badge "Giải ĐB" (gold, prominent)
  - special[1]: Badge "Giải phụ ĐB" (silver)
- **Bảng giải 8 hạng** (1 bảng duy nhất, khác Max 3D 2 bảng):

| Hạng | Code | Giá trị mặc định |
|---|---|---|
| Giải Đặc Biệt | special | 2.000.000.000 |
| Giải phụ Đặc Biệt | specialSub | 400.000.000 |
| Giải Nhất | first | 30.000.000 |
| Giải Nhì | second | 10.000.000 |
| Giải Ba | third | 4.000.000 |
| Giải Tư | fourth | 1.000.000 |
| Giải Năm | fifth | 100.000 |
| Giải Sáu | sixth | 40.000 |

- Hiển thị số winners + tổng chi trả per tier
- Nút "Xem entries trúng" → WinningEntriesDialog

**FinancialSummary (phải)**:
- Giống Max 3D. Note: "Max 3D Pro không có Jackpot tích luỹ"

**WinningEntriesDialog**: Table với TripletPair (first + second), tier, isDuplicate badge "x2", winAmount.

### 5.3 Analytics Section

**`analytics-panels.tsx`**:
- PlayTypeCard: **2 bars** chính (multiNumber vs multiDigit) + thêm metric avgPairsPerEntry
- TenantBreakdownCard: Giống

**`triplet-chart.tsx`**: Giống Max 3D (top N bộ ba phổ biến). Top Combos: cặp TripletPair phổ biến.

**`live-feed.tsx`**:
- Hiển thị TripletPair cho multiNumber: "123 - 456" format
- Hiển thị digits cho multiDigit: "[1,2,3] × [4,5,6]" format + lineCount
- Tag playMode

---

## Phase 6: Frontend — page.tsx

```
DrawContextProvider
└── OperationsContent
    ├── PageHeader (title + DrawSelector + "Tạo kỳ" + LastUpdatedBadge)
    ├── DrawManagementSection       ← KHÔNG có JackpotHeroCard
    ├── KpiSection
    ├── ResultSection (khi published+)
    └── AnalyticsSection (khi salesOpen+)
```

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
- `active-draw-card.tsx`: Readonly + link sang operations
- `page.tsx`: Link "Đi đến trang vận hành" → `/games/max3dpro/operations`
- `use-draws.ts`: Xoá mutation hooks

---

## Phase 8: Type Check & Lint

```bash
npx tsc --noEmit --project packages/game-max3dpro-application/tsconfig.json
npx tsc --noEmit --project apps/backoffice/tsconfig.json
```

---

## Lưu ý quan trọng

1. **KHÔNG CÓ Jackpot, KHÔNG CÓ companyRate**: profit = revenue - prizes - commission
2. **TripletPair là đơn vị cơ bản**: Mọi line = ordered pair `{first, second}`
3. **THỨ TỰ ORDERED PAIR CỰC KỲ QUAN TRỌNG**: special[0] = ĐB (2 tỷ), special[1] = phụ ĐB (400 triệu). Publish result UI phải label rõ
4. **8 hạng giải — 1 PrizeTier enum**: Khác Max 3D (2 enums). Result section chỉ cần 1 bảng
5. **Giải phụ ĐB chỉ có ở Pro**: `PrizeTier.SpecialSub` — 400 triệu. Badge highlight đặc biệt
6. **KHÔNG có combo3/combo6**: Thay bằng multiNumber (C(n,2) cặp) + multiDigit (perms × perms)
7. **BoardSelection có thêm frontDigits/backDigits**: multiDigit mode khác hoàn toàn Max 3D
8. **Duplicate x2**: 2 bộ ba giống → giải × 2
9. **Lịch quay T3/T5/T7**: KHÔNG TRÙNG Max 3D (T2/T4/T6)
10. **Brand color Purple/violet**: Phân biệt với Max 3D (rose)
11. **Triplet = string "000"-"999"**: Validate `/^\d{3}$/`
12. **Low-frequency polling**: 30s summary, 120s analytics
13. **Nếu Max 3D đã build → copy phần publish-result, triplet-chart, live-feed** rồi adapt cho Pro
