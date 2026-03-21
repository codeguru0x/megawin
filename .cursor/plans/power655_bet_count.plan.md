---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Power 6/55 — Thêm betCount multiplier

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/power655-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc`
3. **Entity files**: Đọc toàn bộ `packages/game-power655/src/entities/` trước khi sửa
4. **Plan mẫu**: `.cursor/plans/lotto535_bet_count.plan.md` — plan gốc cho Lotto 5/35

---

## Quy tắc đồng nhất field names cross-game (QUY CHUẨN)

> **Tất cả game PHẢI tuân thủ bảng này** khi implement betCount multiplier.

### Bảng field names chuẩn


| Field                                     | Ý nghĩa                                                                                          | Power655 (plan này)                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `**betCount`** per board                  | **Multiplier** — số lần tham gia dự thưởng per board (player chọn, ≥ minBetCount, ≤ maxBetCount) | board.betCount (MỚI, trên Board + EntryBoardSnapshot) |
| `**lineCount`** trên Entry                | Số lines matching (expand bao/combo)                                                             | entry.lineCount (ĐÃ CÓ)                               |
| `**betUnitCount**` trên Entry             | Tổng đơn vị cược thực tế, dùng tính tiền                                                         | Σ(board.derived.expandedLines × board.betCount) (MỚI) |
| `**amount**` trên Entry                   | Tiền cược = betUnitCount × unitPrice                                                             | ĐỔI CÔNG THỨC                                         |
| `**betUnitsPerDraw**` trên Ticket.pricing | Tổng đơn vị cược mỗi kỳ                                                                          | Σ(board.derived.expandedLines × board.betCount) (MỚI) |


### Config fields chuẩn


| Field                   | Ý nghĩa                                              | Tất cả game |
| ----------------------- | ---------------------------------------------------- | ----------- |
| `PlayRules.minBetCount` | Số lần cược tối thiểu per board (≥ 1, ≤ maxBetCount) | BẮT BUỘC    |
| `PlayRules.maxBetCount` | Số lần cược tối đa per board                         | BẮT BUỘC    |


### Quy tắc backward compat cho data cũ


| Đọc field                        | Fallback                         | Ghi chú                                                  |
| -------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `board.betCount`                 | `?? 1`                           | Boards cũ chưa có multiplier                             |
| `entry.betUnitCount`             | `?? entry.lineCount`             | Entries cũ chưa có betUnitCount thì fallback = lineCount |
| `ticket.pricing.betUnitsPerDraw` | `?? ticket.pricing.linesPerDraw` | Tương tự                                                 |


### Game đã implement

- **Max3D**: ✅ `minBetCount`, `maxBetCount`, `board.betCount`, `betUnitCount`
- **Max3D Pro**: ✅ tương tự Max3D
- **Keno**: ✅ plan riêng (có side bets)
- **Bingo18**: ✅ plan riêng
- **Lotto535**: ✅ plan riêng
- **Mega645**: ⬜ tương lai (cấu trúc tương tự Lotto535/Power655)
- **Power655**: ⬜ plan này

---

## Phân tích hiện trạng Power 6/55

### Đặc thù Power 6/55 (khác Lotto 5/35)

- **CÓ Line entity** (`TicketLineDoc`) — lines tạo khi settle, mỗi line match độc lập
- **CÓ Dual Jackpot** (JP1 + JP2) — settle pipeline phức tạp hơn Lotto535
- **KHÔNG có Split Cycle** — không có bước ApplySplitBonuses (đơn giản hơn Lotto535)
- **CÓ Bonus number** — LineMatchResult có `bonusMatched` (khác Lotto535 có `specialMatched`)
- **KHÔNG cần rename** — Power655 chưa có field `betCount` nào trên entry, không conflict
- **Board có `derived.expandedLines`** — lineCount per board đã có sẵn
- **KHÔNG có payout caps** — Payout tính theo tier cố định
- **5 hạng giải**: JP1 (6/6), JP2 (5/6+bonus), tier1 (5/6), tier2 (4/6), tier3 (3/6)

### Thuật ngữ cho Power655

- `lineCount` (entry): tổng lines = Σ(board.derived.expandedLines) — ĐÃ CÓ, giữ nguyên
- `betCount` (per board): **MỚI** — multiplier, số lần tham gia dự thưởng (≥ minBetCount)
- `betUnitCount` (entry): **MỚI** = Σ(board.derived.expandedLines × board.betCount)
- `betUnitsPerDraw` (ticket.pricing): **MỚI** = betUnitCount
- `amount` (entry): **ĐỔI CÔNG THỨC** = betUnitCount × unitPrice (trước: lineCount × unitPrice)

### Cấu trúc settle đặc thù

Settle pipeline Power 6/55 có 7 steps (đơn giản hơn Lotto535 — không có Split Cycle):

```
PrepareSettle → SettleEntries (loop) → CalculateFinancials →
  CheckJackpotWinner (choice) →
    ├─ PatchJackpotPrize (có JP1 và/hoặc JP2 winner)
    └─ (skip, không có winner)
→ SyncTicketSummaries → BuildSettleReport → PublishSettleDaily → FinalizeSettle → DispatchPayouts
```

**QUAN TRỌNG — Cách tính thưởng khi có betCount:**

- `matchLines()` giữ nguyên — trả kết quả per-unit (1 lần tham gia)
- Mỗi line match có `winAmount` = giải thưởng cho 1 lần tham gia
- Khi betCount > 1: `line.winAmount` = unitWinAmount × betCount
- **EntryPayoutTier.amount** = unitAmount × hitCount × betCount (của board chứa line đó)
- **Jackpot (JP1/JP2)**: winAmount = 0 tạm thời, PatchJackpotPrize patch sau
- **KHÔNG CÓ Split Bonuses** — Power655 không có cơ chế split cycle

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị thưởng tương ứng với 01 lần tham gia dự thưởng."

> **Luật Vietlott (Jackpot)**: "Trong trường hợp có nhiều người trúng thưởng giải Jackpot thì giải Jackpot được chia đều theo tỷ lệ giá trị tham gia dự thưởng của người trúng thưởng."

> **Luật Vietlott (hạng cao nhất)**: "Trong trường hợp vé trúng nhiều hạng giải thì chỉ lĩnh một hạng giải thưởng cao nhất." (Đã implement: `determineTiers()` chỉ trả hạng cao nhất per line)

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (10.000 VND)
- `betCount` per board = số lần tham gia dự thưởng cho board đó (player tự chọn)
- Tiền cược board = `expandedLines × betCount × unitPrice`
- Tiền thưởng giải cố định per line = `unitWinAmount × betCount` (của board chứa line đó)
- Jackpot chia theo tỷ lệ giá trị tham gia = `jackpotPerUnit × betCount`
- Tổng tiền thưởng entry = Σ(line.winAmount) đã nhân betCount

### Ví dụ minh họa

**Standard board, betCount = 3:**

- 1 board × 1 line × 3 betCount = 3 bet units → tiền cược = 30.000 VND
- Trúng tier3 (50.000 VND): thưởng = 50.000 × 3 = 150.000 VND

**Bao 7 (7 lines), betCount = 2:**

- 1 board × 7 lines × 2 betCount = 14 bet units → tiền cược = 140.000 VND
- Trúng 6/6: 1 line JP1 + 0 lines JP2 (bonus không thể match khi 6/6)
- Trúng 5/6+bonus: 6 lines JP2
- Trúng 4/6: N lines tier2 → mỗi line = 500.000 × 2 = 1.000.000 VND

**JP chia theo betCount:**

- Player A trúng JP1 1 line, betCount = 3 → tham gia 3 đơn vị
- Player B trúng JP1 1 line, betCount = 1 → tham gia 1 đơn vị
- Tổng = 4 đơn vị → jackpotPerUnit = floor(totalPool / 4)
- Player A nhận: jackpotPerUnit × 3
- Player B nhận: jackpotPerUnit × 1

---

## Quyết định kiến trúc (đã xác nhận)


| #   | Quyết định                                                              | Lý do                                                  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `Board` thêm `betCount` field                                           | Multiplier per board                                   |
| 2   | `EntryBoardSnapshot` thêm `betCount`                                    | Snapshot cho settle                                    |
| 3   | `TicketEntryDoc` thêm `betUnitCount`                                    | Tổng units cho tính tiền + report                      |
| 4   | `TicketPricing` thêm `betUnitsPerDraw`                                  | Pricing rõ ràng                                        |
| 5   | `entry.amount = betUnitCount × unitPrice`                               | Phản ánh tiền thực trả                                 |
| 6   | `matchLines()` **giữ nguyên** — per-unit                                | Pure matching logic, không biết betCount               |
| 7   | SettleEntries: nhân `betCount` tại level line doc (winAmount)           | Settle chính xác per line                              |
| 8   | `buildPayoutTiersFromLines()`: aggregate từ lineDocs đã nhân betCount   | Tổng thưởng đúng                                       |
| 9   | PatchJackpotPrize: chia JP theo tỷ lệ betCount (totalBetUnits)          | Đúng luật Vietlott: "chia theo tỷ lệ giá trị tham gia" |
| 10  | **KHÔNG có ApplySplitBonuses**                                          | Power655 không có split cycle                          |
| 11  | `PlayRules` thêm `minBetCount` (default 1) + `maxBetCount` (default 10) | Config chuẩn cross-game                                |


---

## Phase 1: Entity Layer — Thêm fields

### 1.1 Game Config — `packages/game-power655/src/entities/types.ts`

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
  drawsPerDay: number;
  drawTimes: string[];
  drawDaysOfWeek: number[];
}
```

**File**: `packages/game-power655/src/rules/jackpot.ts` — `DEFAULT_POWER655_CONFIG`

Thêm `minBetCount: 1`, `maxBetCount: 10` vào `DEFAULT_POWER655_CONFIG.play`.

### 1.2 Ticket — `packages/game-power655/src/entities/ticket.ts`

**Interface `Board`** — thêm betCount:

```typescript
export interface Board {
  boardNo: BoardNo;
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
  amountPerDraw: number;
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-power655/src/entities/entry.ts`

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

### 1.4 Line — `packages/game-power655/src/entities/line.ts`

**Interface `TicketLineDoc`** — thêm `betCount`:

```typescript
export interface TicketLineDoc {
  // ... existing fields ...
  /** Số lần cược nhân bội cho board chứa line này. */
  betCount: number;                       // ← MỚI
  matchResult: LineMatchResult;
  createdAt: Date;
}
```

`**LineMatchResult**` — KHÔNG SỬA. Vẫn trả `winAmount` per-unit nhân betCount ở settle layer.

### 1.5 Checklist Phase 1

- `types.ts` — `PlayRules.minBetCount`, `PlayRules.maxBetCount`
- `jackpot.ts` — `DEFAULT_POWER655_CONFIG.play` thêm 2 fields
- `ticket.ts` — `Board.betCount`, `TicketPricing.betUnitsPerDraw`
- `entry.ts` — `EntryBoardSnapshot.betCount`, `TicketEntryDoc.betUnitCount`
- `line.ts` — `TicketLineDoc.betCount`

---

## Phase 1.5: Backoffice Game Config

### 1.5.1 API Schema — `apps/backoffice/src/app/api/power655/config/_lib/schema.ts`

Thêm `minBetCount: positiveInt`, `maxBetCount: positiveInt` vào `playSchema`.

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/power655/config/_lib/play-rules-section.tsx`

- Zod schema: `minBetCount`, `maxBetCount` + cross-validation (max ≥ min)
- Form values: fallback `?? 1` / `?? 10`
- UI: 2 fields trong grid. Tham khảo Max3D / Lotto535 layout.

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/power655/place-bet.ts`

Thêm `betCount` vào board schema:

```typescript
export const power655BoardSchema = z
  .object({
    boardNo: z.enum(VALID_BOARD_NOS),
    playType: z.enum([...]),
    selection: power655SelectionSchema,
    betCount: z.number().int().min(1).default(1),   // ← MỚI, default 1 backward compat
  })
  .superRefine(/* ... existing ... */);
```

Handler mapping — thêm betCount:

```typescript
const boards = rawBoards.map((b: Power655Board) => ({
  boardNo: b.boardNo,
  playType: b.playType,
  selection: { mainNumbers: b.selection.mainNumbers },
  betCount: b.betCount ?? 1,            // ← MỚI
}));
```

### 2.2 DTO — `packages/game-power655-application/src/use-cases/place-bet/dto/place-bet.dto.ts`

Thêm `betCount` vào board input:

```typescript
export interface PlaceBetBoardInput {
  boardNo: string;
  playType: PlayType;
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

### 2.3 Use Case — `packages/game-power655-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config:

```typescript
const minBetCount = play.minBetCount ?? 1;
const maxBetCount = play.maxBetCount ?? 10;
for (const bi of boardInputs) {
  const bc = bi.betCount ?? 1;
  if (bc < minBetCount || bc > maxBetCount) {
    throw AppException.badRequest(
      `betCount ${bc} của board ${bi.boardNo} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}].`
    );
  }
}
```

**Build boards** — thêm betCount:

```typescript
builtBoards.push({
  boardNo: bi.boardNo as any,
  playType,
  selection: { mainNumbers: [...bi.selection.mainNumbers].sort() },
  derived: { expandedLines: lineCount },
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
  boardNo: String(b.boardNo),
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

**Thay đổi cốt lõi**: Mỗi line thuộc 1 board → board có betCount → line.winAmount *= betCount.

#### 3.1.1 Truyền betCount map vào settle loop

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
  const highestTier = perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
  const unitAmount = getFixedPrizeAmount(highestTier, fixedPrizeAmounts);
  const betCount = betCountByBoard.get(line.boardNo) ?? 1;

  return {
    // ... existing fields ...
    boardNo: line.boardNo,
    lineIndex: line.lineIndex,
    main: line.main,
    betCount,                                        // ← MỚI
    matchResult: {
      mainMatchCount: perLine.mainMatchCount,
      bonusMatched: perLine.bonusMatched,
      tier: highestTier,
      // JP1/JP2: winAmount = 0 tạm thời (PatchJackpotPrize patch sau).
      // Giải cố định: winAmount = unitAmount × betCount.
      winAmount:
        highestTier === PrizeTier.Jackpot1 || highestTier === PrizeTier.Jackpot2
          ? 0
          : unitAmount * betCount,
    },
    createdAt: now,
  };
});
```

#### 3.1.3 Build payout tiers — tính có betCount

Thay `buildPayoutTiers(tierCounts, ...)` bằng `buildPayoutTiersFromLines(lineDocs, ...)`:

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
  fixedPrizeAmounts: PrizeAmounts,
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
    if (tier === PrizeTier.Jackpot1 || tier === PrizeTier.Jackpot2) {
      // JP1/JP2: amount = 0, patch sau ở PatchJackpotPrize
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount: 0,
        amount: 0,
      });
    } else {
      const unitAmount = getFixedPrizeAmount(tier as PrizeTier, fixedPrizeAmounts);
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

> **LƯU Ý**: `EntryPayoutTier.hitCount` = số LINES trúng (không nhân betCount). `amount` = tổng thưởng đã nhân betCount.

### 3.2 PatchJackpotPrize — Dual Jackpot với betCount

**File**: `packages/game-power655-application/src/use-cases/settle/patch-jackpot-prize.ts`

**QUY TẮC VIETLOTT**: "Giải Jackpot được chia đều **theo tỷ lệ giá trị tham gia dự thưởng** của người trúng thưởng."

→ Jackpot KHÔNG chia đều per entry, mà **chia theo tỷ lệ betCount** (= số lần tham gia dự thưởng).

**Hiện tại** (TRƯỚC betCount):

```
jp1PerWinner = floor(totalJp1Prize / jp1Entries.length)
```

**SAU betCount**: Mỗi entry trúng JP có thể có betCount khác nhau (từ board chứa JP line). Cần tính totalBetUnits.

**Thay đổi logic JP1:**

```typescript
// ── JP1: chia theo tỷ lệ giá trị tham gia ────────────────────────
if (hasJackpot1Winner) {
  const jp1Entries = await this.entryRepo.findJackpot1Winners(drawId);
  // Lấy betCount per entry (từ line trúng JP1 → boardNo → board.betCount)
  const jp1Lines = await this.lineRepo.findJackpot1Lines(drawId);

  // totalBetUnits = Σ(betCount) cho tất cả lines trúng JP1
  const totalBetUnits = jp1Lines.reduce((sum, l) => sum + (l.betCount ?? 1), 0);
  const totalJp1Prize = jp1CurrentAmount + jackpot1Contribution;
  const jackpotPerUnit = Math.floor(totalJp1Prize / totalBetUnits);

  // Patch entries: mỗi entry nhận jackpotPerUnit × (tổng betCount JP1 lines của entry)
  // Patch lines: mỗi line.winAmount = jackpotPerUnit × line.betCount
}
```

**Tương tự cho JP2.**

**VÍ DỤ JP1**:

- Entry A trúng JP1 1 line, betCount = 3 → 3 đơn vị
- Entry B trúng JP1 1 line, betCount = 1 → 1 đơn vị
- totalBetUnits = 4
- jackpotPerUnit = floor(totalJp1Prize / 4)
- Entry A: jackpotPerUnit × 3
- Entry B: jackpotPerUnit × 1

**LƯU Ý**: Khi betCount = 1 cho tất cả (backward compat), totalBetUnits = số lines = hiện tại. Kết quả giống nhau.

**Thay đổi cần thiết trong repo layer:**

- `entryRepo.patchJackpotPrize()`: cần biết betCount per entry để tính amount chính xác
- `lineRepo.patchJackpotLineWinAmount()`: cần nhân betCount khi set winAmount
- Hoặc tách thành per-entry patch thay vì bulk update uniform amount

**Approach khuyến nghị**: Thay vì `patchJackpotPrize(drawId, tier, uniformAmount)` (set cùng 1 amount cho tất cả entries), đổi thành loop per entry:

- Lấy danh sách JP lines + betCount
- Group by entryId → tính totalBetUnits per entry
- Per entry: `amount = jackpotPerUnit × entryBetUnits`
- Patch entry + lines riêng lẻ

### 3.3 CalculateFinancials — Step 3

**File**: `calculate-financials.ts`

`aggregateSettleSummary(drawId)` aggregate từ entries → `totalFixedPrizes = SUM(entry.payout.winAmount)`.

**KHÔNG CẦN SỬA logic tính toán** vì `entry.payout.winAmount` đã bao gồm betCount (từ SettleEntries).
`totalRevenue = SUM(entry.amount)` — `amount` đã phản ánh betCount.

### 3.4 Checklist Phase 3

- SettleEntries: build `betCountByBoard` map từ entry snapshot
- SettleEntries: line.matchResult.winAmount = unitAmount × betCount (trừ JP1/JP2 = 0)
- SettleEntries: line doc thêm `betCount` field
- SettleEntries: `buildPayoutTiersFromLines()` — aggregate từ lineDocs đã nhân betCount
- PatchJackpotPrize (JP1): **chia JP1 theo tỷ lệ betCount** (totalBetUnits = Σ betCount per JP1 line)
- PatchJackpotPrize (JP2): **chia JP2 theo tỷ lệ betCount** (tương tự JP1)
- PatchJackpotPrize: jackpotPerUnit = floor(total / totalBetUnits), line.winAmount = jackpotPerUnit × betCount
- CalculateFinancials: KHÔNG cần sửa logic (amount/winAmount đã phản ánh betCount)
- matchLines(): KHÔNG SỬA (pure per-unit logic)

---

## Phase 4: Entry Repo — Review Aggregate Queries

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-power655-application/src/infras/repos/entry-repo.ts`

Review tất cả aggregate queries — Power655 KHÔNG rename `betCount`, chỉ thêm `betUnitCount`:


| Method                       | Hiện dùng           | Nên dùng                     | Lý do                         |
| ---------------------------- | ------------------- | ---------------------------- | ----------------------------- |
| `aggregateTotalRevenue()`    | `$sum: "$amount"`   | **Giữ nguyên**               | `amount` đã phản ánh betCount |
| `aggregateOpsSummary()`      | Nếu có `totalLines` | Thêm `$sum: "$betUnitCount"` | Phân biệt lines vs bet units  |
| `aggregateTenantBreakdown()` | `$sum: "$amount"`   | **Giữ nguyên**               | Revenue = amount đã đúng      |
| `aggregateSettleSummary()`   | Giữ                 | **Giữ nguyên**               | Tính financials từ amount     |


### 4.2 Quy tắc review

- **Revenue/tiền cược** → `$sum: "$amount"` hoặc `$sum: "$betUnitCount"` (đều đúng)
- **Counting lines** → `$sum: "$lineCount"` (không đổi)
- **Counting bet units** → `$sum: "$betUnitCount"` (MỚI, thêm nếu cần)

---

## Phase 5: Backoffice — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `packages/game-power655-application/src/use-cases/operations/dto/live-entries.dto.ts`

- `LiveEntryBoard`: thêm `betCount?: number` (hiển thị badge ×N khi > 1)
- `LiveEntryItem`: thêm `betUnitCount?: number`

### 5.2 Operations Summary

**File**: `operations.dto.ts`

- `OpsSummaryOutput`: thêm `totalBetUnits?: number` (phân biệt lines vs bet units)

### 5.3 Player DTO

**File**: `player.dto.ts`

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

**File**: `.cursor/rules/power655-game-rules.mdc`

Cập nhật:

- Section 1: thêm "betCount = số lần tham gia dự thưởng per board"
- Section 3: ghi rõ "giá vé = expandedLines × betCount × unitPrice"
- Section 11: cập nhật entity fields mới
- Section 13: thêm quy tắc betCount

### 6.2 Tests

**File**: `packages/game-power655-application/test/use-cases/`

Test cases:

- `matchLines()` vẫn per-unit (regression)
- Settle `betCount = 1` → behavior giữ nguyên
- Settle `betCount = 3` standard board → winAmount × 3
- Settle multi-board: board A betCount=1, board B betCount=2 → mixed winAmount
- Entry `betUnitCount = Σ(expandedLines × betCount)`
- Entry `amount = betUnitCount × unitPrice`
- PatchJackpotPrize JP1: chia theo tỷ lệ betCount (không chia đều per entry)
- PatchJackpotPrize JP2: tương tự JP1
- PatchJackpotPrize cùng kỳ JP1+JP2: cả 2 chia đúng betCount

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


| Phase              | Files                                                        | Mức          |
| ------------------ | ------------------------------------------------------------ | ------------ |
| 1. Entity          | `types.ts`, `jackpot.ts`, `ticket.ts`, `entry.ts`, `line.ts` | Trung bình   |
| 1.5. BO Config     | `schema.ts`, `play-rules-section.tsx`                        | Nhỏ          |
| 2. Place Bet       | `place-bet.ts` (handler + DTO + use case)                    | Trung bình   |
| 3. Settle          | `settle-entries.ts`, `patch-jackpot-prize.ts`                | **CRITICAL** |
| 4. Entry Repo      | `entry-repo.ts` (review aggregates)                          | Nhỏ          |
| 5. Backoffice      | DTOs + UI                                                    | Nhỏ          |
| 6. Docs + Tests    | game rules + test files                                      | Trung bình   |
| 7. Backward Compat | Across all files                                             | Nhỏ          |


---

## Khác biệt chính so với Lotto535 plan


| Aspect                   | Lotto 5/35                                       | Power 6/55                                                  |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| **Jackpot type**         | Single JP + Split Cycle                          | **Dual JP (JP1 + JP2)** — KHÔNG có split                    |
| **PatchJackpotPrize**    | 1 JP pool, chia theo betCount                    | **2 JP pools**, mỗi pool chia riêng theo betCount           |
| **ApplySplitBonuses**    | CÓ — bonus × betCount                            | **KHÔNG CÓ** — Power655 không có split cycle                |
| **PrizeTier count**      | 7 (JP, 5 tier + Consolation)                     | **5** (JP1, JP2, tier1-3)                                   |
| **Bonus number**         | Có `specialMatched`                              | Có `bonusMatched`                                           |
| **LineMatchResult**      | `mainMatchCount + specialMatched`                | `mainMatchCount + bonusMatched`                             |
| **determineTier params** | `(mainMatchCount, specialMatched)`               | `(mainMatchCount, bonusMatched)`                            |
| **JP overflow**          | Không                                            | CÓ — JP1 overflow → JP2 (không ảnh hưởng betCount logic)    |
| **Board structure**      | `Board` + `BoardDerived.expandedLines`           | Tương tự                                                    |
| **Side bets**            | Không                                            | Không                                                       |
| **Line entity**          | CÓ `TicketLineDoc`                               | CÓ `TicketLineDoc` — tương tự                               |
| **betUnitCount**         | `Σ(expandedLines × betCount)`                    | Tương tự                                                    |
| **Settle nhân betCount** | Per LINE doc                                     | Tương tự                                                    |
| **Settle pipeline**      | 9 steps (có CheckPrizeRoute + ApplySplitBonuses) | **7 steps** (chỉ có CheckJackpotWinner → PatchJackpotPrize) |


