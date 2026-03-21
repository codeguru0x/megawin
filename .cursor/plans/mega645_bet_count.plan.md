---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Mega 6/45 — Thêm betCount multiplier

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/mega645-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc`
3. **Entity files**: Đọc toàn bộ `packages/game-mega645/src/entities/` trước khi sửa
4. **Plan mẫu**: `.cursor/plans/lotto535_bet_count.plan.md` — plan gốc cho Lotto 5/35

---

## Quy tắc đồng nhất field names cross-game (QUY CHUẨN)

> **Tất cả game PHẢI tuân thủ bảng này** khi implement betCount multiplier.

### Bảng field names chuẩn

| Field | Ý nghĩa | Mega645 (plan này) |
| --- | --- | --- |
| **`betCount`** per board | **Multiplier** — số lần tham gia dự thưởng per board (player chọn, ≥ minBetCount, ≤ maxBetCount) | board.betCount (MỚI, trên Board + EntryBoardSnapshot) |
| **`lineCount`** trên Entry | Số lines matching (expand bao/combo) | entry.lineCount (ĐÃ CÓ) |
| **`betUnitCount`** trên Entry | Tổng đơn vị cược thực tế, dùng tính tiền | Σ(board.derived.expandedLines × board.betCount) (MỚI) |
| **`amount`** trên Entry | Tiền cược = betUnitCount × unitPrice | ĐỔI CÔNG THỨC |
| **`betUnitsPerDraw`** trên Ticket.pricing | Tổng đơn vị cược mỗi kỳ | Σ(board.derived.expandedLines × board.betCount) (MỚI) |

### Config fields chuẩn

| Field | Ý nghĩa | Tất cả game |
| --- | --- | --- |
| `PlayRules.minBetCount` | Số lần cược tối thiểu per board (≥ 1, ≤ maxBetCount) | BẮT BUỘC |
| `PlayRules.maxBetCount` | Số lần cược tối đa per board | BẮT BUỘC |

### Quy tắc backward compat cho data cũ

| Đọc field | Fallback | Ghi chú |
| --- | --- | --- |
| `board.betCount` | `?? 1` | Boards cũ chưa có multiplier |
| `entry.betUnitCount` | `?? entry.lineCount` | Entries cũ chưa có betUnitCount thì fallback = lineCount (mỗi line = 1 unit) |
| `ticket.pricing.betUnitsPerDraw` | `?? ticket.pricing.linesPerDraw` | Tương tự |

### Game đã implement

- **Max3D**: ✅ `minBetCount`, `maxBetCount`, `board.betCount`, `betUnitCount`
- **Max3D Pro**: ✅ tương tự Max3D
- **Keno**: ⬜ plan riêng (có side bets)
- **Bingo18**: ⬜ cần plan tương tự
- **Lotto535**: ⬜ plan riêng
- **Mega645**: ⬜ plan này
- **Power655**: ⬜ tương lai (cấu trúc tương tự Mega645)

---

## Phân tích hiện trạng Mega 6/45

### Đặc thù Mega 6/45 (khác Lotto 5/35)

- **CÓ Line entity** (`TicketLineDoc`) — lines tạo khi settle, mỗi line match độc lập
- **CÓ Jackpot** — nhưng **KHÔNG có Split Cycle** (đơn giản hơn Lotto 5/35)
- **KHÔNG có số đặc biệt** — matching chỉ dựa trên `mainMatchCount`
- **KHÔNG có side bets** — chỉ có boards
- **KHÔNG cần rename** — Mega645 chưa có field `betCount` nào, không conflict
- **Board có `derived.expandedLines`** — lineCount per board đã có sẵn
- **KHÔNG có payout caps** — Payout tính theo tier cố định
- **4 hạng giải** — Jackpot (6/6), Tier1 (5/6), Tier2 (4/6), Tier3 (3/6)
- **6 boards A-F** — nhiều hơn Lotto 5/35 (5 boards A-E)
- **Jackpot hitCount luôn = 1 per entry** — C(6,6) = 1, bất kể chơi Bao mấy

### Thuật ngữ cho Mega645

- `lineCount` (entry): tổng lines = Σ(board.derived.expandedLines) — ĐÃ CÓ, giữ nguyên
- `betCount` (per board): **MỚI** — multiplier, số lần tham gia dự thưởng (≥ minBetCount)
- `betUnitCount` (entry): **MỚI** = Σ(board.derived.expandedLines × board.betCount)
- `betUnitsPerDraw` (ticket.pricing): **MỚI** = betUnitCount
- `amount` (entry): **ĐỔI CÔNG THỨC** = betUnitCount × unitPrice (trước: lineCount × unitPrice)

### Cấu trúc settle đặc thù

Settle pipeline Mega 6/45 có 8 steps (đơn giản hơn Lotto 5/35 vì KHÔNG có Split):

```
PrepareSettle → SettleEntries (loop) → CalculateFinancials →
  ├─ PatchJackpotPrize (có JP winner)
  └─ (skip, kỳ thường — KHÔNG có split bonuses)
→ SyncTicketSummaries → BuildSettleReport → PublishSettleDaily → FinalizeSettle
```

**QUAN TRỌNG — Cách tính thưởng khi có betCount:**

- `matchLines()` giữ nguyên — trả kết quả per-unit (1 lần tham gia)
- Mỗi line match có `winAmount` = giải thưởng cho 1 lần tham gia
- Khi betCount > 1: `line.winAmount` = unitWinAmount × betCount
- **EntryPayoutTier.amount** = unitAmount × hitCount × betCount (của board chứa line đó)
- **Jackpot**: winAmount = 0 tạm thời, PatchJackpotPrize patch sau

**QUAN TRỌNG — Jackpot chia theo tỷ lệ betCount:**

Luật Vietlott: "Giải Đặc biệt được chia đều theo tỷ lệ giá trị tham gia dự thưởng."

Vì C(6,6) = 1, mỗi entry chỉ có **1 line trúng Jackpot**. Nhưng khi có betCount:
- "Giá trị tham gia dự thưởng" = betCount × unitPrice (không phải luôn 10.000 VND nữa)
- Chia JP theo tỷ lệ betCount giữa các winners

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng của các giải thưởng từ Giải Nhất đến Giải Ba được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị giải thưởng tương ứng với 01 lần tham gia dự thưởng."

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (10.000 VND)
- `betCount` per board = số lần tham gia dự thưởng cho board đó (player tự chọn)
- Tiền cược board = `expandedLines × betCount × unitPrice`
- Tiền thưởng per line (giải cố định) = `unitWinAmount × betCount` (của board chứa line đó)
- Tổng tiền thưởng entry = Σ(line.winAmount) đã nhân betCount

> **Luật Vietlott — Jackpot**: "Trong trường hợp có nhiều người trúng thưởng giải Đặc biệt thì giải Đặc biệt được chia đều theo tỷ lệ giá trị tham gia dự thưởng của người trúng thưởng."

- Khi betCount > 1: "giá trị tham gia dự thưởng" = betCount × 10.000 VND
- Jackpot chia theo **tỷ lệ betCount**, KHÔNG chia đều per entry nữa
- jackpotPerUnit = floor(totalPool / totalBetUnits)
- Mỗi winner nhận: jackpotPerUnit × betCount (của line trúng JP)

### Ví dụ minh họa

**Standard board, betCount = 3:**

- 1 board × 1 line × 3 betCount = 3 bet units → tiền cược = 30.000 VND
- Trúng tier3 (30.000 VND): thưởng = 30.000 × 3 = 90.000 VND

**Bao 8 (28 lines), betCount = 2, trúng 6/8 số:**

- 1 board × 28 lines × 2 betCount = 56 bet units → tiền cược = 560.000 VND
- 1 line JP: winAmount = 0 tạm (patch sau, nhận JP × 2)
- 12 lines Tier1: mỗi line = 10.000.000 × 2 = 20.000.000 → tổng = 240.000.000
- 15 lines Tier2: mỗi line = 300.000 × 2 = 600.000 → tổng = 9.000.000
- Tổng cố định = 249.000.000 + JP × 2

**Jackpot chia theo betCount:**

- Player A: betCount = 3 → tham gia 3 đơn vị
- Player B: betCount = 1 → tham gia 1 đơn vị
- Tổng = 4 đơn vị
- jackpotPerUnit = floor(totalPool / 4)
- Player A nhận: jackpotPerUnit × 3
- Player B nhận: jackpotPerUnit × 1

---

## Quyết định kiến trúc (đã xác nhận)

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | `Board` thêm `betCount` field | Multiplier per board |
| 2 | `EntryBoardSnapshot` thêm `betCount` | Snapshot cho settle |
| 3 | `TicketEntryDoc` thêm `betUnitCount` | Tổng units cho tính tiền + report |
| 4 | `TicketPricing` thêm `betUnitsPerDraw` | Pricing rõ ràng |
| 5 | `entry.amount = betUnitCount × unitPrice` | Phản ánh tiền thực trả |
| 6 | `matchLines()` **giữ nguyên** — per-unit | Pure matching logic, không biết betCount |
| 7 | SettleEntries: nhân `betCount` tại level line doc (winAmount) | Settle chính xác per line |
| 8 | `buildPayoutTiers()`: aggregate hitCount × betCount → tier amount | Tổng thưởng đúng |
| 9 | PatchJackpotPrize: **chia JP theo tỷ lệ betCount** (totalBetUnits = Σ betCount per JP line) | Luật Vietlott: chia theo giá trị tham gia |
| 10 | `PlayRules` thêm `minBetCount` (default 1) + `maxBetCount` (default 10) | Config chuẩn cross-game |
| 11 | `BoardDerived` thêm `betCount` (snapshot) | Truy xuất nhanh trên ticket |
| 12 | **KHÔNG có ApplySplitBonuses** | Mega645 KHÔNG có split cycle |

---

## Phase 1: Entity Layer — Thêm fields

### 1.1 Game Config — `packages/game-mega645/src/entities/types.ts`

**Interface `PlayRules`** — thêm 2 fields:

```typescript
export interface PlayRules {
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). Mặc định 1. */
  minBetCount: number;                    // ← MỚI
  /** Số lần cược tối đa per board. Mặc định 10. */
  maxBetCount: number;                    // ← MỚI
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  salesCloseBeforeMinutes: number;
  drawsPerWeek: number;
  drawDaysOfWeek: number[];
  drawTime: string;
}
```

**File**: `packages/game-mega645/src/rules/jackpot.ts` — `DEFAULT_MEGA645_CONFIG`

Thêm `minBetCount: 1`, `maxBetCount: 10` vào `DEFAULT_MEGA645_CONFIG.play`.

### 1.2 Ticket — `packages/game-mega645/src/entities/ticket.ts`

**Interface `Board`** — thêm betCount:

```typescript
export interface Board {
  boardNo: string;
  playType: PlayType;
  selection: BoardSelection;
  derived: BoardDerived;
  /** Số lần cược nhân bội cho board (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketPricing`** — thêm `betUnitsPerDraw`:

```typescript
export interface TicketPricing {
  unitPrice: number;
  linesPerDraw: number;
  /** Tổng đơn vị cược mỗi kỳ = Σ(expandedLines × betCount). Dùng tính tiền. */
  betUnitsPerDraw: number;                // ← MỚI
  /** Tiền cược mỗi kỳ = betUnitsPerDraw × unitPrice (VND). ĐỔI CÔNG THỨC. */
  amountPerDraw: number;
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-mega645/src/entities/entry.ts`

**Interface `EntryBoardSnapshot`** — thêm `betCount`:

```typescript
export interface EntryBoardSnapshot {
  boardNo: string;
  playType: PlayType;
  mainNumbers: string[];
  expandedLines: number;
  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketEntryDoc`** — thêm `betUnitCount`:

```typescript
  lineCount: number;
  /** Tổng đơn vị cược = Σ(expandedLines × betCount). Dùng tính tiền. */
  betUnitCount: number;                   // ← MỚI
  /** Tiền cược kỳ này (VND) = betUnitCount × unitPrice. ĐỔI CÔNG THỨC. */
  amount: number;
  unitPrice: number;
```

### 1.4 Line — `packages/game-mega645/src/entities/line.ts`

**Interface `TicketLineDoc`** — thêm `betCount`:

Line doc cần biết betCount của board chứa nó để lưu vết tính toán winAmount.

```typescript
export interface TicketLineDoc {
  // ... existing fields ...
  /** Số lần cược nhân bội cho board chứa line này. */
  betCount: number;                       // ← MỚI
  matchResult: LineMatchResult;
  createdAt: Date;
}
```

`**LineMatchResult**` — KHÔNG SỬA. Vẫn trả `winAmount` per-unit rồi nhân betCount ở settle layer.

### 1.5 Checklist Phase 1

- `types.ts` — `PlayRules.minBetCount`, `PlayRules.maxBetCount`
- `jackpot.ts` — `DEFAULT_MEGA645_CONFIG.play` thêm 2 fields
- `ticket.ts` — `Board.betCount`, `TicketPricing.betUnitsPerDraw`
- `entry.ts` — `EntryBoardSnapshot.betCount`, `TicketEntryDoc.betUnitCount`
- `line.ts` — `TicketLineDoc.betCount`

---

## Phase 1.5: Backoffice Game Config

### 1.5.1 API Schema — `apps/backoffice/src/app/api/mega645/config/_lib/schema.ts`

Thêm `minBetCount: positiveInt`, `maxBetCount: positiveInt` vào `playSchema`.

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/mega645/config/_lib/play-rules-section.tsx`

- Zod schema: `minBetCount`, `maxBetCount` + cross-validation (max ≥ min)
- Form values: fallback `?? 1` / `?? 10`
- UI: 2 fields trong grid. Tham khảo Max3D layout.

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/mega645/place-bet.ts`

Thêm `betCount` vào board schema:

```typescript
export const mega645BoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playType: z.enum([...]),
    selection: mega645SelectionSchema,
    betCount: z.number().int().min(1).default(1),   // ← MỚI, default 1 backward compat
  })
  .superRefine(/* ... existing ... */);
```

Handler mapping — thêm betCount:

```typescript
const boards = rawBoards.map((b: Mega645Board) => ({
  boardNo: b.boardNo,
  playType: b.playType,
  selection: { ... },
  betCount: b.betCount ?? 1,            // ← MỚI
}));
```

### 2.2 DTO — `packages/game-mega645-application/src/use-cases/place-bet/dto/place-bet.dto.ts`

Thêm `betCount` vào board input:

```typescript
export interface PlaceBetBoardInput {
  boardNo: string;
  playType: string;
  selection: BoardSelection;
  /** Số lần cược nhân bội (≥ 1). Default 1. */
  betCount?: number;                      // ← MỚI (optional cho backward compat)
}
```

Thêm `betUnitsPerDraw` vào output pricing:

```typescript
pricing: {
  unitPrice: number;
  linesPerDraw: number;
  betUnitsPerDraw: number;              // ← MỚI
  amountPerDraw: number;
  totalAmount: number;
};
```

### 2.3 Use Case — `packages/game-mega645-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config:

```typescript
const minBetCount = play.minBetCount ?? 1;
const maxBetCount = play.maxBetCount ?? 10;
for (const bi of boardInputs) {
  const bc = bi.betCount ?? 1;
  if (bc < minBetCount || bc > maxBetCount) {
    throw AppException.badRequest(
      `betCount ${bc} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}]`
    );
  }
}
```

**Build boards** — thêm betCount:

```typescript
builtBoards.push({
  boardNo: bi.boardNo,
  playType,
  selection: { mainNumbers: sortedMain },
  derived: { expandedLines: lineCount, baoSize },
  betCount: bi.betCount ?? 1,            // ← MỚI
});
```

**Tính pricing** — thay đổi:

```typescript
const linesPerDraw = totalLinesPerDraw;   // giữ nguyên
// betUnitsPerDraw = tổng đơn vị cược thực tế (lines × betCount per board).
const betUnitsPerDraw = builtBoards.reduce(
  (sum, b) => sum + b.derived.expandedLines * (b.betCount ?? 1), 0
);
const amountPerDraw = unitPrice * betUnitsPerDraw;  // ← ĐỔI: dùng betUnitsPerDraw
const totalAmount = amountPerDraw * drawCount;
const commissionAmount = Math.round(amountPerDraw * commissionRate);
```

**Ticket pricing** — thêm field:

```typescript
pricing: {
  unitPrice,
  linesPerDraw: totalLinesPerDraw,        // giữ nguyên
  betUnitsPerDraw,                        // ← MỚI
  amountPerDraw,
  totalAmount,
},
```

**Entry snapshots** — thêm betCount:

```typescript
const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
  boardNo: b.boardNo,
  playType: b.playType,
  mainNumbers: b.selection.mainNumbers,
  expandedLines: b.derived.expandedLines,
  betCount: b.betCount ?? 1,             // ← MỚI
}));
```

**Entry doc** — thêm betUnitCount:

```typescript
entryDocs.push({
  // ... existing fields ...
  lineCount: totalLinesPerDraw,           // giữ nguyên
  betUnitCount: betUnitsPerDraw,          // ← MỚI
  amount: amountPerDraw,                  // đã dùng betUnitsPerDraw
  unitPrice,
  // ...
});
```

### 2.4 Checklist Phase 2

- API schema: `betCount` + `.default(1)` trên board
- DTO: `PlaceBetBoardInput.betCount`, output `betUnitsPerDraw`
- Use case: validate `minBetCount ≤ betCount ≤ maxBetCount`
- Use case: tính `betUnitsPerDraw = Σ(expandedLines × betCount)`
- Use case: `amountPerDraw = unitPrice × betUnitsPerDraw`
- Board build: thêm `betCount`
- Ticket pricing: thêm `betUnitsPerDraw`
- Entry snapshots: `betCount` per board
- Entry doc: thêm `betUnitCount`

---

## Phase 3: Settle — Nhân betCount khi tính thưởng (CRITICAL)

> **ĐÂY LÀ THAY ĐỔI QUAN TRỌNG NHẤT.** Phải tính thưởng chính xác theo luật Vietlott.

### 3.1 Settle Entries — `settle-entries.ts`

**File**: `packages/game-mega645-application/src/use-cases/settle/settle-entries.ts`

**Thay đổi cốt lõi**: Mỗi line thuộc 1 board → board có betCount → line.winAmount *= betCount.

#### 3.1.1 Truyền betCount map vào settle loop

Hiện tại `expandAllBoards(boards)` trả `lines[]` với `boardNo` + `lineIndex`. Cần biết betCount per boardNo:

```typescript
// Build betCount map: boardNo → betCount (từ entry snapshot)
const betCountByBoard = new Map<string, number>();
for (const b of entry.entrySummary.boards) {
  betCountByBoard.set(b.boardNo, b.betCount ?? 1);
}
```

#### 3.1.2 Line docs — nhân betCount vào winAmount

```typescript
const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
  const perLine = matchResult.perLineResults[i]!;
  const unitAmount = perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;
  const betCount = betCountByBoard.get(line.boardNo) ?? 1;

  return {
    // ... existing fields ...
    boardNo: line.boardNo,
    lineIndex: line.lineIndex,
    main: line.main,
    betCount,                                        // ← MỚI
    matchResult: {
      mainMatchCount: perLine.mainMatchCount,
      tier: perLine.tier,
      // Jackpot: winAmount = 0 tạm thời (PatchJackpotPrize patch sau).
      // Giải cố định: winAmount = unitAmount × betCount.
      winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount * betCount,
    },
    createdAt: now,
  };
});
```

> **LƯU Ý**: Mega 6/45 KHÔNG có `special` field trên line (khác Lotto 5/35). Chỉ có `main: string[]`.

#### 3.1.3 Build payout tiers — tính có betCount

`buildPayoutTiers()` cần biết betCount per board. Thay đổi approach:

**OPTION A (khuyến nghị)**: Aggregate từ lineDocs đã có betCount trong winAmount.

```typescript
// Tính payout tiers từ lineDocs thay vì tierCounts
// Vì mỗi line có betCount khác nhau (multi-board), không thể dùng simple tierCounts × betCount.
const payoutTiers = buildPayoutTiersFromLines(lineDocs, prizeAmounts);
```

Hàm helper mới:

```typescript
/**
 * Build payout tiers từ line docs đã có winAmount (đã nhân betCount).
 *
 * Multi-board ticket: board A betCount=1, board B betCount=3
 * → mỗi line có betCount khác nhau, không thể dùng flat tierCounts.
 * Aggregate: group by tier → sum winAmount → derive hitCount + unitAmount.
 */
function buildPayoutTiersFromLines(
  lineDocs: Array<Omit<TicketLineDoc, "_id">>,
  prizeAmounts: Record<string, number>,
): EntryPayoutTier[] {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const line of lineDocs) {
    const { tier, winAmount } = line.matchResult;
    if (tier == null) continue;

    const existing = tierMap.get(tier) ?? { hitCount: 0, totalAmount: 0 };
    existing.hitCount += 1;
    existing.totalAmount += winAmount;
    tierMap.set(tier, existing);
  }

  const tiers: EntryPayoutTier[] = [];
  for (const [tier, data] of tierMap) {
    if (tier === PrizeTier.Jackpot) {
      // Jackpot: amount = 0, patch sau ở PatchJackpotPrize
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount: 0,
        amount: 0,
      });
    } else {
      const unitAmount = prizeAmounts[tier] ?? 0;
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount,
        amount: data.totalAmount,     // đã nhân betCount từ lineDocs
      });
    }
  }

  return tiers;
}
```

> **LƯU Ý quan trọng**: `EntryPayoutTier.hitCount` = số LINES trúng (không nhân betCount). `amount` = tổng thưởng đã nhân betCount. Nếu board A (betCount=2) có 3 lines trúng tier3 → hitCount=3, amount=3×30.000×2=180.000.

### 3.2 PatchJackpotPrize — Chia JP theo tỷ lệ betCount

**File**: `packages/game-mega645-application/src/use-cases/settle/patch-jackpot-prize.ts`

Hiện tại: `jackpotPerWinner = floor(totalPool / jackpotEntries.length)`.

**QUY TẮC VIETLOTT**: "Giải Đặc biệt được chia đều **theo tỷ lệ giá trị tham gia dự thưởng** của người trúng thưởng."

→ Khi có betCount, Jackpot KHÔNG chia đều per entry, mà **chia theo tỷ lệ betCount**.

Vì C(6,6) = 1, mỗi entry chỉ có **1 line trúng JP**. Nên:
- "Giá trị tham gia dự thưởng" cho JP line = betCount × unitPrice
- totalBetUnits = Σ(betCount) cho mỗi JP line (= Σ betCount per JP winner)

**VÍ DỤ**:

- Player A trúng JP, betCount = 3 → tham gia 3 đơn vị
- Player B trúng JP, betCount = 1 → tham gia 1 đơn vị
- Tổng = 4 đơn vị
- jackpotPerUnit = floor(totalPool / 4)
- Player A nhận: jackpotPerUnit × 3
- Player B nhận: jackpotPerUnit × 1

**Thay đổi code**:

```typescript
// ── Bước 1: Load jackpot lines + betCount ──
// Mỗi entry chỉ có TỐI ĐA 1 line trúng JP (C(6,6) = 1).
const jackpotLines = await lineRepo.findJackpotLinesByDrawId(drawId);
// jackpotLines[].betCount = betCount của board chứa line JP.

// ── Bước 2: Tính jackpot per unit (theo tỷ lệ tham gia dự thưởng) ──
// Quy tắc Vietlott: chia theo tỷ lệ giá trị tham gia = betCount.
// totalBetUnits = tổng betCount của tất cả lines trúng JP.
const totalBetUnits = jackpotLines.reduce(
  (sum, line) => sum + (line.betCount ?? 1), 0
);
const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
const jackpotPerUnit = Math.floor(totalJackpotPrize / totalBetUnits);

// ── Bước 3: Patch mỗi line + entry ──
// line.matchResult.winAmount = jackpotPerUnit × line.betCount
// entry.payout.tiers[jackpot].amount = jackpotPerUnit × line.betCount
```

**LƯU Ý**: Khi betCount = 1 cho tất cả (backward compat), totalBetUnits = số winners. Kết quả giống hệt code cũ.

### 3.3 KHÔNG CÓ ApplySplitBonuses

**Mega 6/45 KHÔNG có Split Cycle.** Khi Jackpot không có winner → roll-over toàn bộ sang kỳ tiếp theo. Giải Nhất/Nhì/Ba luôn cố định.

→ **KHÔNG CẦN sửa ApplySplitBonuses** (file không tồn tại).

Đây là điểm khác biệt lớn nhất so với plan Lotto 5/35.

### 3.4 CalculateFinancials — Step 3

**File**: `packages/game-mega645-application/src/use-cases/settle/calculate-financials.ts`

`aggregateSettleSummary(drawId)` aggregate từ entries → `totalFixedPrizes = SUM(entry.payout.winAmount)`.

**KHÔNG CẦN SỬA** logic tài chính vì:
- `entry.payout.winAmount` đã bao gồm betCount (từ SettleEntries)
- `totalRevenue = SUM(entry.amount)` — `amount` đã phản ánh betCount
- `totalAgentCommission = SUM(entry.tenant.commissionAmount)` — commission tính trên amount

### 3.5 Checklist Phase 3

- SettleEntries: build `betCountByBoard` map từ entry snapshot
- SettleEntries: line.matchResult.winAmount = unitAmount × betCount (trừ JP = 0)
- SettleEntries: line doc thêm `betCount` field
- SettleEntries: `buildPayoutTiersFromLines()` — aggregate từ lineDocs đã nhân betCount
- PatchJackpotPrize: **chia JP theo tỷ lệ betCount** (totalBetUnits = Σ betCount per JP line)
- PatchJackpotPrize: jackpotPerUnit = floor(total / totalBetUnits), line.winAmount = jackpotPerUnit × betCount
- **KHÔNG CÓ ApplySplitBonuses** (Mega645 không có split cycle)
- CalculateFinancials: KHÔNG CẦN SỬA (amount/winAmount đã phản ánh betCount)
- matchLines(): KHÔNG SỬA (pure per-unit logic)

---

## Phase 4: Entry Repo — Review Aggregate Queries

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-mega645-application/src/infras/repos/entry-repo.ts`

Review tất cả aggregate queries:

| Method | Hiện dùng | Nên dùng | Lý do |
| --- | --- | --- | --- |
| `aggregateTotalRevenue()` | `$sum: "$amount"` | **Giữ nguyên** | `amount` đã phản ánh betCount |
| `aggregateOpsSummary()` | Nếu có `totalLines` | Thêm `$sum: "$betUnitCount"` | Phân biệt lines vs bet units |
| `aggregateTenantBreakdown()` | `$sum: "$amount"` | **Giữ nguyên** | Revenue = amount đã đúng |
| `aggregateSettledPayoutSummary()` | Giữ | **Giữ nguyên** | Tính financials từ amount |

### 4.2 Quy tắc review

- **Revenue/tiền cược** → `$sum: "$amount"` (đều đúng, amount đã phản ánh betCount)
- **Counting lines** → `$sum: "$lineCount"` (không đổi)
- **Counting bet units** → `$sum: "$betUnitCount"` (MỚI, thêm nếu cần)

---

## Phase 5: Backoffice — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `packages/game-mega645-application/src/use-cases/operations/dto/live-entries.dto.ts`

- `LiveEntryBoard`: thêm `betCount?: number` (hiển thị badge ×N khi > 1)
- `LiveEntryItem`: thêm `betUnitCount?: number`

### 5.2 Operations Summary

**File**: `operations.dto.ts` (nếu có)

- `OpsSummaryOutput`: thêm `totalBetUnits?: number` (phân biệt lines vs bet units)

### 5.3 Player DTO

**File**: `packages/game-mega645-application/src/use-cases/player/dto/player.dto.ts`

- `PlayerBoardInfo` (nếu có): thêm `betCount`
- Ticket pricing: thêm `betUnitsPerDraw`

### 5.4 Checklist Phase 5

- Live feed DTO: `LiveEntryBoard.betCount`, `LiveEntryItem.betUnitCount`
- Operations DTO: `totalBetUnits`
- Player DTO: board betCount, pricing betUnitsPerDraw
- UI: badge `×N` khi betCount > 1

---

## Phase 6: Game Rules Doc + Tests

### 6.1 Game Rules

**File**: `.cursor/rules/mega645-game-rules.mdc`

Cập nhật:

- Section 1: thêm "betCount = số lần tham gia dự thưởng per board"
- Section 2: ghi rõ "giá vé = expandedLines × betCount × unitPrice"
- Section 10: cập nhật entity fields mới (Board.betCount, TicketPricing.betUnitsPerDraw, v.v.)
- Section 12: thêm quy tắc betCount

### 6.2 Tests

**File**: `packages/game-mega645-application/test/use-cases/`

Test cases:

- `matchLines()` vẫn per-unit (regression)
- Settle `betCount = 1` → behavior giữ nguyên
- Settle `betCount = 3` standard board → winAmount × 3
- Settle multi-board: board A betCount=1, board B betCount=2 → mixed winAmount
- Entry `betUnitCount = Σ(expandedLines × betCount)`
- Entry `amount = betUnitCount × unitPrice`
- PatchJackpotPrize: **chia theo tỷ lệ betCount**, KHÔNG chia đều per entry
- PatchJackpotPrize: betCount=1 cho tất cả → giống hành vi cũ (backward compat)

---

## Phase 7: Backward Compatibility

### 7.1 Entries cũ

- `board.betCount` → `?? 1` (boards cũ chưa có)
- `entry.betUnitCount` → `?? entry.lineCount` (cũ = mỗi line 1 unit)
- `ticket.pricing.betUnitsPerDraw` → `?? ticket.pricing.linesPerDraw`

### 7.2 API Backward Compat

- `betCount` trong Zod schema dùng `.default(1)` → client cũ không gửi vẫn hoạt động
- Response DTO thêm fields mới (additive, không breaking)

---

## Tóm tắt Impact

| Phase | Files | Mức |
| --- | --- | --- |
| 1. Entity | `types.ts`, `jackpot.ts`, `ticket.ts`, `entry.ts`, `line.ts` | Trung bình |
| 1.5. BO Config | `schema.ts`, `play-rules-section.tsx` | Nhỏ |
| 2. Place Bet | `place-bet.ts` (handler + DTO + use case) | Trung bình |
| 3. Settle | `settle-entries.ts`, `patch-jackpot-prize.ts` | **CRITICAL** |
| 4. Entry Repo | `entry-repo.ts` (review aggregates) | Nhỏ |
| 5. Backoffice | DTOs + UI | Nhỏ |
| 6. Docs + Tests | game rules + test files | Trung bình |
| 7. Backward Compat | Across all files | Nhỏ |

---

## Khác biệt chính so với Lotto 5/35 plan

| Aspect | Lotto 5/35 | Mega 6/45 |
| --- | --- | --- |
| **Số đặc biệt** | CÓ (special number) | KHÔNG CÓ |
| **Hạng giải** | 7 (JP + 5 tier + Consolation) | 4 (JP + 3 tier) |
| **Split Cycle** | CÓ → cần ApplySplitBonuses | **KHÔNG CÓ** → bỏ hoàn toàn |
| **Matching** | mainMatchCount + specialMatched | Chỉ mainMatchCount |
| **Line fields** | `main + special` | Chỉ `main` |
| **Max boards** | 5 (A-E) | 6 (A-F) |
| **Bao types** | Bao 4 + Bao 6-15 + Bao ĐB | Bao 5 + Bao 7-18 |
| **JP hitCount per entry** | 1 (C(5,5)×C(1,1)=1) | 1 (C(6,6)=1) |
| **JP chia** | Theo tỷ lệ betCount | Theo tỷ lệ betCount (giống) |
| **Settle steps** | 9 steps (có Split) | 8 steps (không có Split) |
| **EntryBoardSnapshot** | mainNumbers + specialNumbers | Chỉ mainNumbers |
| **LineValue** | `{ main, special }` | `{ main }` (chỉ main) |
