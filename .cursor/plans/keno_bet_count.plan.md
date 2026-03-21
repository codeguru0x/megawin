---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Keno — Thêm betCount multiplier + Rename selectionCount

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/keno-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc`
3. **Entity files**: Đọc toàn bộ `packages/game-keno/src/entities/` trước khi sửa
4. **Plan mẫu**: `.cursor/plans/max3d_bet_count.plan.md` — plan gốc cho Max3D

---

## Quy tắc đồng nhất field names cross-game (QUY CHUẨN)

> **Tất cả game PHẢI tuân thủ bảng này** khi implement betCount multiplier.

### Bảng field names chuẩn


| Field                                       | Ý nghĩa                                                                                        | Keno/Bingo18                            | Max3D/Max3DPro                  | Lotto/Mega/Power (tương lai) |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------- | ---------------------------- |
| `**betCount`** per board/sideBet            | **Multiplier** — số lần tham gia dự thưởng per bet (player chọn, ≥ minBetCount, ≤ maxBetCount) | board.betCount + sideBet.betCount       | board.betCount (đã có)          | board.betCount               |
| `**selectionCount`** trên Entry             | Số bets logic = đếm số selections (boards + sideBets)                                          | **RENAME** từ `betCount` cũ             | Không cần (chỉ có boards)       | Không cần (chỉ có boards)    |
| `**betUnitCount`** trên Entry               | Tổng đơn vị cược thực tế, dùng tính tiền                                                       | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(lineCount × betCount) (đã có) | Σ(lineCount × betCount)      |
| `**lineCount`** trên Entry                  | Số lines matching (expand bao/combo)                                                           | Không có (Keno/Bingo18 không có lines)  | Σ(board.lineCount) (đã có)      | Σ(board.lineCount)           |
| `**amount`** trên Entry                     | Tiền cược = betUnitCount × unitPrice                                                           | Như mới                                 | Đã có                           | Tương lai                    |
| `**selectionsPerDraw`** trên Ticket.pricing | Số bets logic mỗi kỳ                                                                           | **RENAME** từ `betsPerDraw` cũ          | Không cần                       | Không cần                    |
| `**betUnitsPerDraw`** trên Ticket.pricing   | Tổng đơn vị cược mỗi kỳ                                                                        | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(lineCount × betCount) (đã có) | Tương lai                    |


### Config fields chuẩn


| Field                   | Ý nghĩa                                                      | Tất cả game |
| ----------------------- | ------------------------------------------------------------ | ----------- |
| `PlayRules.minBetCount` | Số lần cược tối thiểu per board/sideBet (≥ 1, ≤ maxBetCount) | BẮT BUỘC    |
| `PlayRules.maxBetCount` | Số lần cược tối đa per board/sideBet                         | BẮT BUỘC    |


### Quy tắc backward compat cho data cũ


| Đọc field                        | Fallback                              | Ghi chú                                                                          |
| -------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `board.betCount`                 | `?? 1`                                | Boards cũ chưa có multiplier                                                     |
| `sideBet.betCount`               | `?? 1`                                | SideBets cũ chưa có multiplier                                                   |
| `entry.betUnitCount`             | `?? entry.selectionCount`             | Entries cũ chưa có betUnitCount thì fallback = selectionCount (mỗi bet = 1 unit) |
| `ticket.pricing.betUnitsPerDraw` | `?? ticket.pricing.selectionsPerDraw` | Tương tự                                                                         |


> **LƯU Ý**: Rename `betCount` → `selectionCount` và `betsPerDraw` → `selectionsPerDraw` là **clean rename** — KHÔNG giữ field cũ, KHÔNG cần fallback chain đọc field cũ. Code chỉ dùng tên mới.

### Game đã implement

- **Max3D**: ✅ `minBetCount`, `maxBetCount`, `board.betCount`, `betUnitCount` (không cần selectionCount — chỉ có boards)
- **Max3D Pro**: ✅ tương tự Max3D
- **Keno**: ⬜ plan này
- **Bingo18**: ⬜ cần plan tương tự
- **Lotto535, Mega645, Power655**: ⬜ tương lai

---

## Phân tích hiện trạng Keno

### Breaking change: Rename `betCount` → `selectionCount`

Keno **ĐÃ CÓ `betCount`** trên `TicketEntryDoc` nhưng ý nghĩa = `boards.length + sideBets.length` (đếm số bets logic). **CẦN RENAME** thành `selectionCount` để dành tên `betCount` cho multiplier — đồng nhất với Max3D/Max3DPro.


| Field                                           | Hiện tại              | Sau rename                        |
| ----------------------------------------------- | --------------------- | --------------------------------- |
| Entry.`betCount` (= boards+sideBets count)      | `betCount: number`    | **→ `selectionCount: number`**    |
| Ticket.pricing.`betsPerDraw`                    | `betsPerDraw: number` | **→ `selectionsPerDraw: number`** |
| DTO `PlayerEntryInfo.betCount`                  | `betCount: number`    | **→ `selectionCount: number`**    |
| DTO `LiveEntryItem` (boardCount + sideBetCount) | Giữ nguyên tách riêng | Giữ nguyên                        |


### Thuật ngữ cho Keno (sau rename)

- `selectionCount` (entry): số bets logic = boards.length + sideBets.length (RENAME từ `betCount` cũ)
- `selectionsPerDraw` (ticket.pricing): = selectionCount (RENAME từ `betsPerDraw` cũ)
- `betCount` (per board/sideBet): **MỚI** — multiplier, số lần tham gia dự thưởng (≥ minBetCount)
- `betUnitsPerDraw` (ticket.pricing): **MỚI** = Σ(board.betCount) + Σ(sideBet.betCount)
- `betUnitCount` (entry): **MỚI** = betUnitsPerDraw (snapshot, dùng tính tiền)

### Cấu trúc Keno đặc thù

- **KHÔNG có Line entity** — không có `line-repo.ts`, `line.ts`
- **Có side bets** (bigSmall, evenOdd) — mỗi side bet cũng cần betCount
- **Có payout caps** (bậc 8/9/10) — extra step trong settle
- **KHÔNG có Jackpot** — financials đơn giản

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị thưởng tương ứng với 01 lần tham gia dự thưởng."

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (cấu hình trong `PlayRules`, mặc định 10.000 VND)
- `betCount` per board/sideBet = số lần tham gia dự thưởng cho 1 bet (player tự chọn, ≥ `minBetCount`, ≤ `maxBetCount`)
- Tiền cược board = `1 × betCount × unitPrice` (Keno board = 1 selection, không có lineCount)
- Tiền cược sideBet = `1 × betCount × unitPrice`
- Tiền thưởng board = `matchWinAmount × betCount`
- Tiền thưởng sideBet = `sideBetWinAmount × betCount`

---

## Quyết định kiến trúc (đã xác nhận)


| #   | Quyết định                                                                                                           | Lý do                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **RENAME** `entry.betCount` → `entry.selectionCount` (= boards.length + sideBets.length). Thêm `betUnitCount`        | Đồng nhất tên `betCount` cross-game = multiplier |
| 2   | **RENAME** `ticket.pricing.betsPerDraw` → `ticket.pricing.selectionsPerDraw`                                         | Đồng nhất cross-game                             |
| 3   | `entry.amount = betUnitCount × unitPrice`                                                                            | Phản ánh tiền thực trả                           |
| 4   | `TicketPricing` thêm `betUnitsPerDraw`, rename `betsPerDraw` → `selectionsPerDraw`                                   | Backward compat qua fallback                     |
| 5   | `BasicBoard` thêm `betCount`, `SideBet` thêm `betCount`                                                              | Mỗi bet có multiplier riêng                      |
| 6   | `EntryBoardSnapshot` thêm `betCount`, `EntrySideBetSnapshot` thêm `betCount`                                         | Snapshot cho settle                              |
| 7   | `matchBasicBoard()` / `matchBigSmallBet()` / `matchEvenOddBet()` **giữ nguyên** — trả kết quả per-unit               | Pure matching logic, không biết betCount         |
| 8   | Settle nhân betCount tại `EntryBoardPayout.winAmount` và `EntrySideBetPayout.winAmount`                              | winAmount trên payout = tổng thực tế đã nhân     |
| 9   | `EntryBoardPayout` thêm `betCount`, `EntrySideBetPayout` thêm `betCount`                                             | Audit trail                                      |
| 10  | ApplyPayoutCaps: `winnerCount` đếm **số bộ** (không nhân betCount), `cappedPrize` per-unit → nhân `betCount` khi ghi | 1 board betCount=5 vẫn = 1 bộ trúng              |
| 11  | `PlayRules` thêm `minBetCount` (default 1) + `maxBetCount` (default 10)                                              | Đồng nhất với Max3D/Max3DPro                     |


---

## Phase 1: Entity Layer — Thêm fields + Rename

### 1.1 Game Config — `packages/game-keno/src/entities/types.ts`

**Interface**: `PlayRules`

```typescript
export interface PlayRules {
  unitPrice: number;
  /**
   * Số lần cược tối thiểu per board/sideBet (≥ 1).
   * Mặc định 1 — player luôn phải cược ít nhất 1 lần.
   */
  minBetCount: number;                    // ← MỚI
  /** Số lần cược tối đa per board/sideBet. Mặc định 10. */
  maxBetCount: number;                    // ← MỚI
  maxBasicBoardsPerTicket: number;
  maxDrawCount: number;
  salesCloseBeforeSeconds: number;
  drawIntervalMinutes: number;
  firstDrawTime: string;
  lastDrawTime: string;
  timezone: string;
}
```

**File**: `packages/game-keno/src/rules/financials.ts` — `DEFAULT_KENO_CONFIG`

Thêm `minBetCount: 1`, `maxBetCount: 10` vào `DEFAULT_KENO_CONFIG.play`.

### 1.2 Ticket — `packages/game-keno/src/entities/ticket.ts`

**Interface `BasicBoard`** — thêm `betCount`:

```typescript
export interface BasicBoard {
  boardNo: string;
  playType: KenoPlayType;
  numbers: string[];
  /** Số lần cược nhân bội cho board (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `SideBet`** — thêm `betCount`:

```typescript
export interface SideBet {
  playType: KenoSideBetPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
  /** Số lần cược nhân bội cho side bet (≥ minBetCount). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketPricing`** — RENAME + thêm fields:

```typescript
export interface TicketPricing {
  unitPrice: number;
  /** Số selections mỗi kỳ = boards.length + sideBets.length. RENAME từ betsPerDraw. */
  selectionsPerDraw: number;              // ← RENAME từ betsPerDraw
  /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền. */
  betUnitsPerDraw: number;                // ← MỚI
  /** Tiền cược mỗi kỳ = betUnitsPerDraw × unitPrice (VND). */
  amountPerDraw: number;                  // ← ĐỔI CÔNG THỨC
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-keno/src/entities/entry.ts`

**Interface `EntryBoardSnapshot`** — thêm `betCount`:

```typescript
export interface EntryBoardSnapshot {
  boardNo: string;
  playType: KenoPlayType;
  numbers: string[];
  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board. */
  betCount: number;                       // ← MỚI
}
```

**Interface `EntrySideBetSnapshot`** — thêm `betCount`:

```typescript
export interface EntrySideBetSnapshot {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket side bet. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketEntryDoc`** — RENAME + thêm fields:

```typescript
  // ───── Stake ─────

  /** Số selections = boards.length + sideBets.length. RENAME từ betCount. */
  selectionCount: number;                 // ← RENAME từ betCount
  /** Tổng đơn vị cược = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền. */
  betUnitCount: number;                   // ← MỚI
  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;                         // ← ĐỔI CÔNG THỨC
  unitPrice: number;
```

**Interface `EntryBoardPayout`** — thêm `betCount`:

```typescript
export interface EntryBoardPayout {
  boardNo: string;
  playType: KenoPlayType;
  matchCount: number;
  pickCount: number;
  /** Số lần cược nhân bội. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;                       // ← MỚI
  /** Tiền thắng thực tế = unitWinAmount × betCount (VND). */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA
}
```

**Interface `EntrySideBetPayout`** — thêm `betCount`:

```typescript
export interface EntrySideBetPayout {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
  outcome: string;
  isWin: boolean;
  /** Số lần cược nhân bội. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;                       // ← MỚI
  /** Tiền thắng thực tế = unitWinAmount × betCount (VND). */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA
}
```

### 1.4 Checklist Phase 1

- `types.ts` — `PlayRules.minBetCount`, `PlayRules.maxBetCount`
- `financials.ts` — `DEFAULT_KENO_CONFIG.play.minBetCount: 1`, `maxBetCount: 10`
- `ticket.ts` — `BasicBoard.betCount`, `SideBet.betCount`, `TicketPricing.selectionsPerDraw` (RENAME), `TicketPricing.betUnitsPerDraw` (MỚI)
- `entry.ts` — `TicketEntryDoc.selectionCount` (RENAME), `TicketEntryDoc.betUnitCount` (MỚI), `EntryBoardSnapshot.betCount`, `EntrySideBetSnapshot.betCount`, `EntryBoardPayout.betCount`, `EntrySideBetPayout.betCount`
- Cập nhật barrel exports nếu cần (`index.ts`)

---

## Phase 1.5: Backoffice Game Config — Cấu hình minBetCount + maxBetCount

Flow: `PlayRulesSection` (UI form) → `useUpdateGameConfig` (PUT `/keno/config`) → `updateKenoGameConfigSchema` (Zod) → `UpdateGameConfigUseCase` → DB.

### 1.5.1 API Schema — `apps/backoffice/src/app/api/keno/config/_lib/schema.ts`

**Thêm `minBetCount` + `maxBetCount` vào `playSchema`:**

```typescript
const playSchema = z
  .object({
    unitPrice: positiveInt,
    minBetCount: positiveInt,                // ← MỚI
    maxBetCount: positiveInt,                // ← MỚI
    maxBasicBoardsPerTicket: positiveInt,
    maxDrawCount: positiveInt,
    salesCloseBeforeSeconds: positiveInt,
    drawIntervalMinutes: positiveInt,
    firstDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    lastDrawTime: z.string().regex(timePattern, "Giờ phải có format HH:mm"),
    timezone: z.string().min(1),
  })
  .partial();
```

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/keno/config/_lib/play-rules-section.tsx`

**Zod schema** — thêm `minBetCount` + `maxBetCount` với cross-validation:

```typescript
const playFormSchema = z.object({
  // ... existing fields ...
  minBetCount: z.coerce.number().int().min(1, "Tối thiểu 1"),
  maxBetCount: z.coerce.number().int().min(1, "Tối thiểu 1").max(50, "Tối đa 50"),
}).refine((data) => data.maxBetCount >= data.minBetCount, {
  message: "Max lần cược phải ≥ min lần cược",
  path: ["maxBetCount"],
});
```

**Form values** — thêm initial values với fallback:

```typescript
values: {
  // ... existing ...
  minBetCount: config.play.minBetCount ?? 1,
  maxBetCount: config.play.maxBetCount ?? 10,
},
```

**handleSubmit** — thêm cả 2 fields vào payload.

**UI** — thêm 2 fields "Min lần cược/bet" + "Max lần cược/bet" vào grid "Mệnh giá & Giới hạn". Tham khảo layout Max3D/Max3DPro đã implement (`max3d/config/_lib/play-rules-section.tsx`).

### 1.5.3 Checklist Phase 1.5

- `schema.ts` — thêm `minBetCount: positiveInt`, `maxBetCount: positiveInt` vào `playSchema`
- `play-rules-section.tsx` — Zod schema + cross-validation (maxBetCount ≥ minBetCount) + form initial values + handleSubmit + UI fields
- Verify `UpdateGameConfigUseCase` — partial merge tự nhận field mới

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/keno/place-bet.ts`

Thêm `betCount` vào cả board và sideBet schemas:

```typescript
export const kenoBoardSchema = z
  .object({
    boardNo: z.enum(KENO_BOARD_NO),
    numbers: z.array(kenoNumberSchema).min(1).max(10),
    betCount: z.number().int().min(1).default(1),   // ← MỚI, default 1 backward compat
  })
  .refine(/* ... existing ... */);

export const kenoSideBetSchema = z.object({
  playType: z.enum(SideBetPlayType),
  bet: z.enum(AllSideBetValues),
  betCount: z.number().int().min(1).default(1),     // ← MỚI
});
```

### 2.2 DTO — `packages/game-keno-application/src/use-cases/place-bet/dto/place-bet.dto.ts`

Thêm `betCount` vào cả 2 input interfaces:

```typescript
export interface PlaceBetBasicBoardInput {
  boardNo: string;
  numbers: string[];
  /** Số lần cược nhân bội (≥ 1). Default 1. */
  betCount?: number;                      // ← MỚI (optional cho backward compat)
}

export interface PlaceBetSideBetInput {
  playType: typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;
  bet: KenoBigSmallBet | KenoEvenOddBet;
  /** Số lần cược nhân bội (≥ 1). Default 1. */
  betCount?: number;                      // ← MỚI
}
```

Thêm `betUnitsPerDraw` vào output pricing:

```typescript
export interface PlaceBetOutput {
  // ... existing ...
  pricing: {
    unitPrice: number;
    betsPerDraw: number;
    betUnitsPerDraw: number;              // ← MỚI
    amountPerDraw: number;
    totalAmount: number;
  };
}
```

### 2.3 Use Case — `packages/game-keno-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config:

```typescript
// Validate betCount nằm trong khoảng [minBetCount, maxBetCount] (từ game config).
const minBetCount = play.minBetCount ?? 1;
const maxBetCount = play.maxBetCount ?? 10;
for (const bi of boardInputs) {
  const bc = bi.betCount ?? 1;
  if (bc < minBetCount || bc > maxBetCount) {
    throw AppException.badRequest(`betCount ${bc} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}]`);
  }
}
for (const si of sideBetInputs) {
  const bc = si.betCount ?? 1;
  if (bc < minBetCount || bc > maxBetCount) {
    throw AppException.badRequest(`betCount ${bc} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}]`);
  }
}
```

**Build boards** — thêm betCount:

```typescript
builtBoards.push({
  boardNo: bi.boardNo,
  playType,
  numbers: [...bi.numbers].sort(),
  betCount: bi.betCount ?? 1,            // ← MỚI
});
```

**Build sideBets** — thêm betCount:

```typescript
const builtSideBets: SideBet[] = sideBetInputs.map((si) => ({
  playType: si.playType as SideBet["playType"],
  bet: si.bet,
  betCount: si.betCount ?? 1,            // ← MỚI
}));
```

**Tính pricing** — thay đổi:

```typescript
const selectionsPerDraw = builtBoards.length + builtSideBets.length;
// betUnitsPerDraw = tổng đơn vị cược thực tế (đã nhân betCount).
const betUnitsPerDraw =
  builtBoards.reduce((sum, b) => sum + (b.betCount ?? 1), 0) +
  builtSideBets.reduce((sum, s) => sum + (s.betCount ?? 1), 0);
const amountPerDraw = unitPrice * betUnitsPerDraw;  // ← ĐỔI: dùng betUnitsPerDraw
const totalAmount = amountPerDraw * drawIds.length;
const commissionAmount = Math.round(amountPerDraw * commissionRate);
```

**Ticket pricing** — rename + thêm:

```typescript
pricing: {
  unitPrice,
  selectionsPerDraw,                      // ← RENAME từ betsPerDraw
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
  numbers: b.numbers,
  betCount: b.betCount ?? 1,             // ← MỚI
}));

const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map((s) => ({
  playType: s.playType,
  bet: s.bet,
  betCount: s.betCount ?? 1,             // ← MỚI
}));
```

**Entry doc** — rename + thêm:

```typescript
entryDocs.push({
  // ... existing fields ...
  selectionCount: selectionsPerDraw,      // ← RENAME từ betCount
  betUnitCount: betUnitsPerDraw,          // ← MỚI
  amount: amountPerDraw,                  // đã dùng betUnitsPerDraw
  unitPrice,
  // ...
});
```

### 2.4 Checklist Phase 2

- API schema: `betCount` + `.default(1)` trên cả board + sideBet
- DTO: `PlaceBetBasicBoardInput.betCount`, `PlaceBetSideBetInput.betCount`, output `betUnitsPerDraw`
- Use case: validate `minBetCount ≤ betCount ≤ maxBetCount` cho cả boards + sideBets
- Use case: tính `betUnitsPerDraw`, `amountPerDraw = unitPrice × betUnitsPerDraw`
- Board/SideBet build: thêm `betCount`
- Ticket pricing: `selectionsPerDraw` (RENAME), `betUnitsPerDraw` (MỚI)
- Entry snapshots: `betCount` per board + per sideBet
- Entry doc: `selectionCount` (RENAME), `betUnitCount` (MỚI)

---

## Phase 3: Settle — Nhân betCount khi tính thưởng

### 3.1 Settle Entries — `packages/game-keno-application/src/use-cases/settle/settle-entries.ts`

**Đây là thay đổi quan trọng nhất.** `matchBasicBoard()`, `matchBigSmallBet()`, `matchEvenOddBet()` giữ nguyên (per-unit). Nhân betCount tại settle layer.

**Thay đổi trong loop board (cách chơi cơ bản):**

```typescript
for (const board of boards) {
  // ... existing matching logic giữ nguyên ...
  const matchResult = matchBasicBoard(board.numbers, result, prizeTable);
  const betCount = board.betCount ?? 1;

  boardPayouts.push({
    boardNo: board.boardNo,
    playType: board.playType,
    matchCount: matchResult.matchCount,
    pickCount: matchResult.pickCount,
    betCount,                                    // ← MỚI
    winAmount: matchResult.winAmount * betCount,  // ← NHÂN betCount
  });

  // hasCappablePrize logic giữ nguyên — cap áp dụng trên tổng bộ trúng,
  // betCount không ảnh hưởng số bộ trúng (1 board betCount=5 vẫn = 1 bộ).
}
```

**Thay đổi trong loop side bet (cách chơi bổ sung):**

```typescript
for (const sb of sideBets) {
  const betCount = sb.betCount ?? 1;

  if (sb.playType === KenoPlayType.BigSmall) {
    const matchResult = matchBigSmallBet(sb.bet as KenoBigSmallBet, result, config.bigSmallPrizes);
    sideBetPayouts.push({
      playType: sb.playType,
      bet: sb.bet,
      outcome: matchResult.outcome,
      isWin: matchResult.isWin,
      betCount,                                    // ← MỚI
      winAmount: matchResult.winAmount * betCount,  // ← NHÂN betCount
    });
  } else if (sb.playType === KenoPlayType.EvenOdd) {
    const matchResult = matchEvenOddBet(sb.bet as KenoEvenOddBet, result, config.evenOddPrizes);
    sideBetPayouts.push({
      playType: sb.playType,
      bet: sb.bet,
      outcome: matchResult.outcome,
      isWin: matchResult.isWin,
      betCount,                                    // ← MỚI
      winAmount: matchResult.winAmount * betCount,  // ← NHÂN betCount
    });
  }
}
```

**Tổng hợp winAmount** — giữ nguyên logic vì boardPayouts + sideBetPayouts đã nhân betCount:

```typescript
const winAmount =
  boardPayouts.reduce((sum, b) => sum + b.winAmount, 0) +
  sideBetPayouts.reduce((sum, s) => sum + s.winAmount, 0);
```

### 3.2 ApplyPayoutCaps — `packages/game-keno-application/src/use-cases/settle/apply-payout-caps.ts`

**CẦN REVIEW nhưng KHÔNG CẦN SỬA logic cap.** Lý do:

- `hasCappablePrize` flag dựa trên `matchCount === pickCount` — không liên quan betCount
- Cap tính theo **số bộ trúng** (winnerCount), không theo betCount
- Khi cap áp dụng: `cappedPrize = floor(maxPerDraw / winnerCount)` — đây là prize per unit
- **Nhưng cần đảm bảo**: khi cap thay đổi `EntryBoardPayout.winAmount`, phải nhân lại `betCount`

Cụ thể trong ApplyPayoutCaps, khi recalculate winAmount cho capped entries:

```typescript
// Khi áp dụng cap: cappedPrize = per-unit price → nhân lại betCount
const betCount = boardPayout.betCount ?? 1;
boardPayout.winAmount = cappedPrize * betCount;
```

### 3.3 Checklist Phase 3

- Settle board loop: `winAmount = matchResult.winAmount * betCount`
- Settle sideBet loop: `winAmount = matchResult.winAmount * betCount`
- BoardPayout + SideBetPayout: thêm `betCount` field
- ApplyPayoutCaps: khi recalculate capped prize, nhân lại `betCount`
- Verify: `Σ(boardPayouts.winAmount + sideBetPayouts.winAmount) = entry.payout.winAmount`
- matchBasicBoard/matchBigSmallBet/matchEvenOddBet: KHÔNG SỬA

---

## Phase 4: Entry Repo — Review Aggregate Queries + Rename betCount

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-keno-application/src/infras/repos/entry-repo.ts` (~1558 dòng)

Review tất cả aggregate queries — lưu ý `betCount` trong DB sẽ được rename thành `selectionCount`:


| Method                                | Hiện dùng                         | Nên dùng                                                         | Lý do                                               |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `aggregateTotalRevenue()`             | `$sum: "$amount"`                 | **Giữ nguyên**                                                   | `amount` đã phản ánh betCount                       |
| `aggregateOpsSummary()`               | `$sum: "$betCount"` cho totalBets | **Đổi** → `$sum: "$selectionCount"`                              | Rename field + thêm `$sum: "$betUnitCount"` nếu cần |
| `aggregateTenantBreakdown()`          | `$sum: "$betCount"`               | **Đổi** → `$sum: "$selectionCount"` hoặc `$sum: "$betUnitCount"` | Report tenant nên khớp revenue                      |
| `aggregateTenantSettleMetrics()`      | `$sum: "$betCount"`               | **Đổi** → `$sum: "$selectionCount"`                              | "selections settled"                                |
| `aggregateOutstandingMetricsByDraw()` | `$sum: "$betCount"`               | **Đổi** → `$sum: "$betUnitCount"`                                | Outstanding phải khớp revenue                       |


### 4.2 Quy tắc review

- **Revenue/tiền cược** → dùng `$sum: "$betUnitCount"` hoặc `$sum: "$amount"`
- **Counting selections** (số bets logic) → dùng `$sum: "$selectionCount"`
- **Khi chia tỷ lệ revenue** → dùng `betUnitCount`

### 4.3 Checklist Phase 4

- Đọc toàn bộ `entry-repo.ts`
- Liệt kê tất cả methods dùng `betCount` trong aggregate pipeline
- Phân loại: revenue-related (đổi sang betUnitCount) vs counting-related (giữ betCount)
- Sửa từng method, cập nhật JSDoc

---

## Phase 5: Backoffice — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/analytics/`

- Hiển thị `betCount` badge khi board/sideBet có `betCount > 1` trên live feed entries
- KPI "Total Bets" → đổi label hoặc hiện cả 2: "Bets" vs "Bet Units"

### 5.2 Tickets / Pending Tickets Pages

**Files**: `apps/backoffice/src/app/(main)/games/keno/tickets/`, `pending-tickets/`

- Thêm badge `×N` cạnh board/sideBet khi `betCount > 1`
- Tổng tiền đã phản ánh betCount (từ `entry.amount`)

### 5.3 Operations DTO

**File**: `packages/game-keno-application/src/use-cases/operations/dto/`

- `LiveEntryItem`: thêm `betUnitCount` nếu cần hiển thị riêng
- `GetOpsSummaryOutput`: review `totalBets` → `totalBetUnits` hoặc thêm field mới

### 5.4 Player DTO

**File**: `packages/game-keno-application/src/use-cases/player/dto/player.dto.ts`

- **RENAME** `PlayerEntryInfo.betCount` → `PlayerEntryInfo.selectionCount` (= selections count). Thêm `betUnitCount`.

### 5.5 Checklist Phase 5

- Live feed UI: badge betCount per board/sideBet
- Tickets page: badge `×N`
- Operations DTO: review + thêm fields + rename betCount → selectionCount
- Player DTO: rename `betCount` → `selectionCount`, thêm `betUnitCount`
- KPI labels: rõ ràng "Selections" vs "Bet Units"

---

## Phase 6: Game Rules Doc + Tests

### 6.1 Game Rules

**File**: `.cursor/rules/keno-game-rules.mdc`

Cập nhật:

- Section 1 (Tổng quan): thêm "betCount = số lần tham gia dự thưởng per board/sideBet"
- Section 5 (Cách tính thưởng): ghi rõ "giá trị giải thưởng áp dụng cho 1 lần, nhân betCount"
- Section 9 (Codebase Map): cập nhật entity fields mới
- Section 11 (Quy tắc cho AI Agent): thêm rule betCount

### 6.2 Tests

**File**: `packages/game-keno-application/test/use-cases/`

Thêm test cases:

- `matchBasicBoard` kết quả vẫn per-unit (không thay đổi — regression)
- `matchBigSmallBet` / `matchEvenOddBet` kết quả vẫn per-unit
- Settle với `betCount = 1` trên mọi bets → behavior giữ nguyên (regression)
- Settle với `betCount = 3` trên board → `boardPayout.winAmount = matchWin × 3`
- Settle với `betCount = 2` trên sideBet → `sideBetPayout.winAmount = sideBetWin × 2`
- Entry `betUnitCount = Σ(board.betCount) + Σ(sideBet.betCount)`
- Entry `amount = betUnitCount × unitPrice`
- ApplyPayoutCaps với betCount > 1: capped prize được nhân betCount

---

## Phase 7: Backward Compatibility

### 7.1 Entries cũ (chưa có betCount multiplier)

Entries cũ có `selectionCount` nhưng boards/sideBets chưa có `betCount` (multiplier). Xử lý:

- **Code**: mọi nơi đọc `board.betCount` phải dùng `?? 1` (default — cũ = 1 lần)
- **Code**: mọi nơi đọc `sideBet.betCount` phải dùng `?? 1` (default)
- **Code**: mọi nơi đọc `entry.betUnitCount` phải dùng `?? entry.selectionCount` (cũ = mỗi bet 1 unit)
- **Code**: mọi nơi đọc `ticket.pricing.betUnitsPerDraw` phải dùng `?? ticket.pricing.selectionsPerDraw`

### 7.2 API Backward Compat

- `betCount` trong Zod schema dùng `.default(1)` → client cũ không gửi vẫn hoạt động
- Response DTO dùng tên mới: `selectionsPerDraw`, `betUnitsPerDraw`

### 7.3 Checklist Phase 7

- Tất cả reads `board.betCount` dùng `?? 1`
- Tất cả reads `sideBet.betCount` dùng `?? 1`
- Tất cả reads `entry.betUnitCount` dùng `?? entry.selectionCount`
- Tất cả reads `ticket.pricing.betUnitsPerDraw` dùng `?? ticket.pricing.selectionsPerDraw`
- API schema `.default(1)` trên cả board + sideBet

---

## Tóm tắt Impact — Sắp xếp theo thứ tự thực hiện


| Phase              | Files                                                 | Mức                           |
| ------------------ | ----------------------------------------------------- | ----------------------------- |
| 1. Entity + Rename | `types.ts`, `financials.ts`, `ticket.ts`, `entry.ts`  | Trung bình (rename)           |
| 1.5. BO Config     | `schema.ts`, `play-rules-section.tsx`                 | Nhỏ                           |
| 2. Place Bet       | `place-bet.ts` (handler + DTO + use case)             | Trung bình                    |
| 3. Settle          | `settle-entries.ts`, `apply-payout-caps.ts`           | Critical                      |
| 4. Entry Repo      | `entry-repo.ts` (review + rename aggregate queries)   | Trung bình                    |
| 5. Backoffice Ops  | 4-5 UI files + DTO (rename betCount → selectionCount) | Trung bình                    |
| 6. Docs + Tests    | `keno-game-rules.mdc`, test files                     | Trung bình                    |
| 7. Backward Compat | Across all files                                      | Trung bình (rename fallbacks) |


---

## Khác biệt chính so với Max3D plan


| Aspect               | Max3D                                        | Keno                                                               |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| **Rename betCount**  | Không cần (không có field cũ)                | **CẦN RENAME** `betCount` → `selectionCount`                       |
| Board structure      | `BoardDerived.lineCount + betCount`          | `BasicBoard.betCount` (không có lineCount)                         |
| Side bets            | Không có                                     | `SideBet.betCount` — cần xử lý riêng                               |
| Line entity          | Có `TicketLineDoc` + `LineMatchResult`       | Không có Line entity                                               |
| Entry betCount field | Không có → thêm `betUnitCount`               | **RENAME** `betCount` → `selectionCount`, thêm `betUnitCount`      |
| Ticket pricing       | `linesPerDraw` + `betUnitsPerDraw`           | **RENAME** `betsPerDraw` → `selectionsPerDraw` + `betUnitsPerDraw` |
| Settle               | Nhân betCount per line → lineDoc.winAmount   | Nhân betCount per board/sideBet → payout.winAmount                 |
| Payout caps          | Không có                                     | Có — cần đảm bảo cap recalculation nhân lại betCount               |
| buildPayoutTiers     | Cần adjusted boardResults                    | Không có (payout trực tiếp trên entry)                             |
| Config               | `minBetCount` + `maxBetCount` (đã implement) | `minBetCount` + `maxBetCount` (plan này)                           |


