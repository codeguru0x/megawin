---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Bingo 18 — Thêm betCount multiplier + Rename

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/bingo18-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc`
3. **Entity files**: Đọc toàn bộ `packages/game-bingo18/src/entities/` trước khi sửa
4. **Plan mẫu**: `.cursor/plans/keno_bet_count.plan.md` — plan gốc cho Keno (cùng cấu trúc Board + SideBet)

---

## Quy tắc đồng nhất field names cross-game (QUY CHUẨN)

> **Tất cả game PHẢI tuân thủ bảng này** khi implement betCount multiplier.

### Bảng field names chuẩn


| Field                                   | Ý nghĩa                                            | Bingo18 (plan này)                      | Keno (đã plan)                          | Max3D/Max3DPro (đã có)  |
| --------------------------------------- | -------------------------------------------------- | --------------------------------------- | --------------------------------------- | ----------------------- |
| `betCount` per board/sideBet            | **Multiplier** — số lần tham gia dự thưởng per bet | board.betCount + sideBet.betCount       | board.betCount + sideBet.betCount       | board.betCount (đã có)  |
| `selectionCount` trên Entry             | Số bets logic = đếm số selections                  | **RENAME** từ `betCount` cũ             | **RENAME** từ `betCount` cũ             | Không cần               |
| `betUnitCount` trên Entry               | Tổng đơn vị cược thực tế, dùng tính tiền           | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(lineCount × betCount) |
| `lineCount` trên Entry                  | Số lines matching                                  | Không có (Bingo18 không có lines)       | Không có                                | Σ(board.lineCount)      |
| `amount` trên Entry                     | Tiền cược = betUnitCount × unitPrice               | Như mới                                 | Như mới                                 | Đã có                   |
| `selectionsPerDraw` trên Ticket.pricing | Số bets logic mỗi kỳ                               | **RENAME** từ `betsPerDraw` cũ          | **RENAME** từ `betsPerDraw` cũ          | Không cần               |
| `betUnitsPerDraw` trên Ticket.pricing   | Tổng đơn vị cược mỗi kỳ                            | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(board.betCount) + Σ(sideBet.betCount) | Σ(lineCount × betCount) |


### Config fields chuẩn


| Field                   | Ý nghĩa                                                      | Tất cả game |
| ----------------------- | ------------------------------------------------------------ | ----------- |
| `PlayRules.minBetCount` | Số lần cược tối thiểu per board/sideBet (≥ 1, ≤ maxBetCount) | BẮT BUỘC    |
| `PlayRules.maxBetCount` | Số lần cược tối đa per board/sideBet                         | BẮT BUỘC    |


> **KHÔNG CẦN backward compat**: DB sẽ mới hoàn toàn, chưa có đơn cược nào. Clean rename, KHÔNG cần fallback `?? 1` hay `?? selectionCount`. Code chỉ dùng tên mới.

---

## Phân tích hiện trạng Bingo18

### Breaking change: Rename `betCount` → `selectionCount`

Bingo18 **ĐÃ CÓ `betCount`** trên `TicketEntryDoc` nhưng ý nghĩa = `boards.length + sideBets.length` (đếm số bets logic). **CẦN RENAME** thành `selectionCount` để dành tên `betCount` cho multiplier — đồng nhất với Max3D/Max3DPro và Keno.


| Field                                           | Hiện tại              | Sau rename                        |
| ----------------------------------------------- | --------------------- | --------------------------------- |
| Entry.`betCount` (= boards+sideBets count)      | `betCount: number`    | **→ `selectionCount: number`**    |
| Ticket.pricing.`betsPerDraw`                    | `betsPerDraw: number` | **→ `selectionsPerDraw: number`** |
| DTO `PlayerEntryInfo.betCount`                  | `betCount: number`    | **→ `selectionCount: number`**    |
| DTO `LiveEntryItem` (boardCount + sideBetCount) | Giữ nguyên tách riêng | Giữ nguyên                        |


### Thuật ngữ cho Bingo18 (sau rename) — PHẢI comment đầy đủ vào entity fields

> **QUY TẮC BẮT BUỘC**: Mỗi field dưới đây PHẢI có JSDoc comment ghi rõ **công thức tính** trực tiếp trên interface definition trong entity files. Agent PHẢI copy công thức từ bảng này vào JSDoc khi implement Phase 1.


| Field               | Vị trí                                       | Công thức / Ý nghĩa                                                        | JSDoc bắt buộc                                                                                                                           |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `betCount`          | `BasicBoard`, `SideBet`                      | Multiplier do player chọn. Phạm vi: `minBetCount ≤ betCount ≤ maxBetCount` | `/** Số lần tham gia dự thưởng cho board/sideBet này (≥ minBetCount, ≤ maxBetCount). Player chọn khi đặt cược. */`                       |
| `betCount`          | `EntryBoardSnapshot`, `EntrySideBetSnapshot` | Snapshot từ ticket board/sideBet                                           | `/** Số lần tham gia dự thưởng. Snapshot từ ticket board/sideBet lúc place-bet. */`                                                      |
| `selectionCount`    | `TicketEntryDoc`                             | `= boards.length + sideBets.length`                                        | `/** Số lượng cược (selections) = boards.length + sideBets.length. Đếm số bets logic, KHÔNG tính multiplier. */`                         |
| `betUnitCount`      | `TicketEntryDoc`                             | `= Σ(board.betCount) + Σ(sideBet.betCount)`                                | `/** Tổng đơn vị cược thực tế = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền: amount = betUnitCount × unitPrice. */`          |
| `amount`            | `TicketEntryDoc`                             | `= betUnitCount × unitPrice`                                               | `/** Tổng tiền cược (VND) = betUnitCount × unitPrice. */`                                                                                |
| `selectionsPerDraw` | `TicketPricing`                              | `= boards.length + sideBets.length`                                        | `/** Số selections mỗi kỳ = boards.length + sideBets.length. Đếm bets logic, KHÔNG tính multiplier. */`                                  |
| `betUnitsPerDraw`   | `TicketPricing`                              | `= Σ(board.betCount) + Σ(sideBet.betCount)`                                | `/** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền: amountPerDraw = betUnitsPerDraw × unitPrice. */` |
| `amountPerDraw`     | `TicketPricing`                              | `= betUnitsPerDraw × unitPrice`                                            | `/** Tiền cược mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */`                                                                           |
| `totalAmount`       | `TicketPricing`                              | `= amountPerDraw × drawCount`                                              | `/** Tổng tiền vé (VND) = amountPerDraw × drawPlan.drawCount. */`                                                                        |
| `betCount`          | `EntryBoardPayout`                           | Snapshot từ board, dùng audit trail                                        | `/** Số lần tham gia dự thưởng. Snapshot từ board. winAmount = unitWinAmount × betCount. */`                                             |
| `unitWinAmount`     | `EntryBoardPayout`                           | Giá trị giải per-unit trước khi nhân betCount                              | `/** Giá trị giải per-unit (VND) trước khi nhân betCount. = 0 nếu thua. Dùng bởi aggregation prizePerUnit. */`                           |
| `winAmount`         | `EntryBoardPayout`                           | `= unitWinAmount × betCount`                                               | `/** Tiền thắng thực tế (VND) = giá trị giải per-unit × betCount. Đã nhân multiplier. */`                                                |
| `betCount`          | `EntrySideBetPayout`                         | Snapshot từ sideBet, dùng audit trail                                      | `/** Số lần tham gia dự thưởng. Snapshot từ sideBet. winAmount = unitWinAmount × betCount. */`                                           |
| `unitWinAmount`     | `EntrySideBetPayout`                         | Giá trị giải per-unit trước khi nhân betCount                              | `/** Giá trị giải per-unit (VND) trước khi nhân betCount. = 0 nếu thua. Dùng bởi aggregation prizePerUnit. */`                           |
| `winAmount`         | `EntrySideBetPayout`                         | `= unitWinAmount × betCount`                                               | `/** Tiền thắng thực tế (VND) = giá trị giải per-unit × betCount. Đã nhân multiplier. */`                                                |
| `minBetCount`       | `PlayRules`                                  | Config, default 1                                                          | `/** Số lần cược tối thiểu per board/sideBet (≥ 1). Mặc định 1. */`                                                                      |
| `maxBetCount`       | `PlayRules`                                  | Config, default 10                                                         | `/** Số lần cược tối đa per board/sideBet. Mặc định 10. */`                                                                              |


### Cấu trúc Bingo18 đặc thù

- **KHÔNG có Line entity** — không có `line-repo.ts`, `line.ts`
- **Có side bets** (sumTotal, bigSmallDraw) — mỗi side bet cũng cần betCount
- **KHÔNG có Payout caps** — đơn giản hơn Keno
- **KHÔNG có Jackpot** — financials đơn giản nhất
- **Có TripleKind** (specific/any) — concept riêng, KHÔNG ảnh hưởng betCount logic

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị thưởng tương ứng với 01 lần tham gia dự thưởng."

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (cấu hình trong `PlayRules`, mặc định 10.000 VND)
- `betCount` per board/sideBet = số lần tham gia dự thưởng cho 1 bet (player tự chọn, ≥ `minBetCount`, ≤ `maxBetCount`)
- Tiền cược board = `1 × betCount × unitPrice` (Bingo18 board = 1 selection, không có lineCount)
- Tiền cược sideBet = `1 × betCount × unitPrice`
- Tiền thưởng board = `matchWinAmount × betCount`
- Tiền thưởng sideBet = `sideBetWinAmount × betCount`

---

## Quyết định kiến trúc (đã xác nhận)


| #   | Quyết định                                                                                                                                         | Lý do                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **RENAME** `entry.betCount` → `entry.selectionCount` (= boards.length + sideBets.length). Thêm `betUnitCount`                                      | Đồng nhất tên `betCount` cross-game = multiplier |
| 2   | **RENAME** `ticket.pricing.betsPerDraw` → `ticket.pricing.selectionsPerDraw`                                                                       | Đồng nhất cross-game                             |
| 3   | `entry.amount = betUnitCount × unitPrice`                                                                                                          | Phản ánh tiền thực trả                           |
| 4   | `TicketPricing` thêm `betUnitsPerDraw`, rename `betsPerDraw` → `selectionsPerDraw`                                                                 | Đồng nhất cross-game, clean rename               |
| 5   | `BasicBoard` thêm `betCount`, `SideBet` thêm `betCount`                                                                                            | Mỗi bet có multiplier riêng                      |
| 6   | `EntryBoardSnapshot` thêm `betCount`, `EntrySideBetSnapshot` thêm `betCount`                                                                       | Snapshot cho settle                              |
| 7   | `matchSingleNum()` / `matchDoubleMatch()` / `matchTripleMatch()` / `matchSumTotal()` / `matchBigSmallDraw()` **giữ nguyên** — trả kết quả per-unit | Pure matching logic, không biết betCount         |
| 8   | Settle nhân betCount tại `EntryBoardPayout.winAmount` và `EntrySideBetPayout.winAmount`                                                            | winAmount trên payout = tổng thực tế đã nhân     |
| 9   | `EntryBoardPayout` thêm `betCount`, `EntrySideBetPayout` thêm `betCount`                                                                           | Audit trail                                      |
| 10  | **KHÔNG có ApplyPayoutCaps** — Bingo18 không có payout caps (đơn giản hơn Keno)                                                                    | Bingo18 trả thưởng 100%                          |
| 11  | `PlayRules` thêm `minBetCount` (default 1) + `maxBetCount` (default 10)                                                                            | Đồng nhất với Max3D/Max3DPro/Keno                |


---

## Phase 1: Entity Layer — Thêm fields + Rename

### 1.1 Game Config — `packages/game-bingo18/src/entities/types.ts`

**Interface**: `PlayRules` (dòng 153-170)

```typescript
export interface PlayRules {
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Default: 10.000. */
  unitPrice: number;
  /** Số lần cược tối thiểu per board/sideBet (≥ 1). Mặc định 1. */
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

**File**: `packages/game-bingo18/src/rules/financials.ts` — `DEFAULT_BINGO18_CONFIG`

Thêm `minBetCount: 1`, `maxBetCount: 10` vào `DEFAULT_BINGO18_CONFIG.play`.

### 1.2 Ticket — `packages/game-bingo18/src/entities/ticket.ts`

**Interface `BasicBoard`** (dòng 85-94) — thêm `betCount`:

```typescript
export interface BasicBoard {
  boardNo: string;
  playType: Bingo18PlayType;
  number?: number;
  tripleKind?: Bingo18TripleKind;
  /** Số lần tham gia dự thưởng cho board này (≥ minBetCount, ≤ maxBetCount). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `SideBet`** (dòng 101-108) — thêm `betCount`:

```typescript
export interface SideBet {
  playType: Bingo18SideBetPlayType;
  sum?: number;
  bet?: Bingo18BigSmallBet;
  /** Số lần tham gia dự thưởng cho side bet này (≥ minBetCount, ≤ maxBetCount). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketPricing`** (dòng 28-37) — RENAME + thêm fields:

```typescript
export interface TicketPricing {
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Snapshot từ global config. */
  unitPrice: number;
  /** Số selections mỗi kỳ = boards.length + sideBets.length. Đếm bets logic, KHÔNG tính multiplier. */
  selectionsPerDraw: number;              // ← RENAME từ betsPerDraw
  /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền: amountPerDraw = betUnitsPerDraw × unitPrice. */
  betUnitsPerDraw: number;                // ← MỚI
  /** Tiền cược mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
  amountPerDraw: number;                  // ← ĐỔI CÔNG THỨC
  /** Tổng tiền vé (VND) = amountPerDraw × drawPlan.drawCount. */
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-bingo18/src/entities/entry.ts`

**Interface `EntryBoardSnapshot`** (dòng 195-204) — thêm `betCount`:

```typescript
export interface EntryBoardSnapshot {
  boardNo: string;
  playType: Bingo18PlayType;
  number?: number;
  tripleKind?: Bingo18TripleKind;
  /** Số lần tham gia dự thưởng. Snapshot từ ticket board lúc place-bet. */
  betCount: number;                       // ← MỚI
}
```

**Interface `EntrySideBetSnapshot`** (dòng 207-214) — thêm `betCount`:

```typescript
export interface EntrySideBetSnapshot {
  playType: Bingo18PlayType;
  sum?: number;
  bet?: Bingo18BigSmallBet;
  /** Số lần tham gia dự thưởng. Snapshot từ ticket side bet lúc place-bet. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketEntryDoc`** (dòng 140-147) — RENAME + thêm fields:

```typescript
  // ───── Stake ─────

  /** Số lượng cược (selections) = boards.length + sideBets.length. Đếm số bets logic, KHÔNG tính multiplier. */
  selectionCount: number;                 // ← RENAME từ betCount
  /** Tổng đơn vị cược thực tế = Σ(board.betCount) + Σ(sideBet.betCount). Dùng tính tiền: amount = betUnitCount × unitPrice. */
  betUnitCount: number;                   // ← MỚI
  /** Tổng tiền cược (VND) = betUnitCount × unitPrice. */
  amount: number;                         // ← ĐỔI CÔNG THỨC
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Snapshot từ global config. */
  unitPrice: number;
```

**Interface `EntryBoardPayout`** (dòng 217-234) — thêm `betCount`:

```typescript
export interface EntryBoardPayout {
  boardNo: string;
  playType: Bingo18PlayType;
  tripleKind?: Bingo18TripleKind;
  matchCount: number;
  /** Số lần tham gia dự thưởng. Snapshot từ board. winAmount = giá trị giải per-unit × betCount. */
  betCount: number;                       // ← MỚI
  /** Tiền thắng thực tế (VND) = giá trị giải per-unit × betCount. Đã nhân multiplier. */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA
}
```

**Interface `EntrySideBetPayout`** (dòng 237-273) — thêm `betCount`:

```typescript
export interface EntrySideBetPayout {
  playType: Bingo18PlayType;
  sum?: number;
  bet?: Bingo18BigSmallBet;
  outcome: string;
  isWin: boolean;
  /** Số lần tham gia dự thưởng. Snapshot từ sideBet. winAmount = giá trị giải per-unit × betCount. */
  betCount: number;                       // ← MỚI
  /** Tiền thắng thực tế (VND) = giá trị giải per-unit × betCount. Đã nhân multiplier. */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA
}
```

### 1.4 Checklist Phase 1

- `types.ts` — `PlayRules.minBetCount`, `PlayRules.maxBetCount`
- `financials.ts` — `DEFAULT_BINGO18_CONFIG.play.minBetCount: 1`, `maxBetCount: 10`
- `ticket.ts` — `BasicBoard.betCount`, `SideBet.betCount`, `TicketPricing.selectionsPerDraw` (RENAME), `TicketPricing.betUnitsPerDraw` (MỚI)
- `entry.ts` — `TicketEntryDoc.selectionCount` (RENAME), `TicketEntryDoc.betUnitCount` (MỚI), `EntryBoardSnapshot.betCount`, `EntrySideBetSnapshot.betCount`, `EntryBoardPayout.betCount`, `EntrySideBetPayout.betCount`
- Cập nhật barrel exports nếu cần (`index.ts`)

---

## Phase 1.5: Backoffice Game Config — Cấu hình minBetCount + maxBetCount

Flow: `PlayRulesSection` (UI form) → `useUpdateGameConfig` (PUT `/bingo18/config`) → `updateBingo18GameConfigSchema` (Zod) → `UpdateGameConfigUseCase` → DB.

### 1.5.1 API Schema — `apps/backoffice/src/app/api/bingo18/config/_lib/schema.ts`

**Thêm `minBetCount` + `maxBetCount` vào `playSchema`** (dòng 59-70):

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

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/bingo18/config/_lib/play-rules-section.tsx`

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

**Form values** — thêm initial values:

```typescript
values: {
  // ... existing ...
  minBetCount: config.play.minBetCount,
  maxBetCount: config.play.maxBetCount,
},
```

**handleSubmit** — thêm cả 2 fields vào payload.

**UI** — thêm 2 fields "Min lần cược/bet" + "Max lần cược/bet" vào grid "Mệnh giá & Giới hạn". Tham khảo layout Max3D/Max3DPro hoặc Keno đã implement.

### 1.5.3 Checklist Phase 1.5

- `schema.ts` — thêm `minBetCount: positiveInt`, `maxBetCount: positiveInt` vào `playSchema`
- `play-rules-section.tsx` — Zod schema + cross-validation (maxBetCount ≥ minBetCount) + form initial values + handleSubmit + UI fields
- Verify `UpdateGameConfigUseCase` — partial merge tự nhận field mới

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/bingo18/place-bet.ts`

Thêm `betCount` vào cả board và sideBet schemas:

```typescript
export const bingo18BoardSchema = z
  .object({
    boardNo: z.enum(BINGO18_BOARD_NO),
    playType: z.enum(BasicPlayType),
    number: bingo18NumberSchema.optional(),
    tripleKind: z.enum(Bingo18TripleKind).optional(),
    betCount: z.number().int().min(1).default(1),   // ← MỚI, default 1 khi player không chọn
  })
  .refine(/* ... existing ... */);

export const bingo18SideBetSchema = z
  .object({
    playType: z.enum(SideBetPlayType),
    sum: bingo18SumSchema.optional(),
    bet: z.enum(Bingo18BigSmallBet).optional(),
    betCount: z.number().int().min(1).default(1),     // ← MỚI
  })
  .refine(/* ... existing ... */);
```

### 2.2 DTO — `packages/game-bingo18-application/src/use-cases/place-bet/dto/place-bet.dto.ts`

Thêm `betCount` vào cả 2 input interfaces:

```typescript
export interface PlaceBetBasicBoardInput {
  boardNo: string;
  playType: ...;
  number?: number;
  tripleKind?: Bingo18TripleKind;
  /** Số lần tham gia dự thưởng (≥ minBetCount, ≤ maxBetCount). */
  betCount: number;                       // ← MỚI
}

export interface PlaceBetSideBetInput {
  playType: Bingo18SideBetPlayType;
  sum?: number;
  bet?: Bingo18BigSmallBet;
  /** Số lần tham gia dự thưởng (≥ minBetCount, ≤ maxBetCount). */
  betCount: number;                       // ← MỚI
}
```

Thêm `betUnitsPerDraw` + rename vào output pricing:

```typescript
export interface PlaceBetOutput {
  // ... existing ...
  pricing: {
    unitPrice: number;
    selectionsPerDraw: number;            // ← RENAME từ betsPerDraw
    betUnitsPerDraw: number;              // ← MỚI
    amountPerDraw: number;
    totalAmount: number;
  };
}
```

### 2.3 Use Case — `packages/game-bingo18-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config (sau dòng 63):

```typescript
// Validate betCount nằm trong khoảng [minBetCount, maxBetCount] (từ game config).
const { minBetCount, maxBetCount } = play;
for (const bi of boardInputs) {
  if (bi.betCount < minBetCount || bi.betCount > maxBetCount) {
    throw AppException.badRequest(`betCount ${bi.betCount} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}]`);
  }
}
for (const si of sideBetInputs) {
  if (si.betCount < minBetCount || si.betCount > maxBetCount) {
    throw AppException.badRequest(`betCount ${si.betCount} phải nằm trong khoảng [${minBetCount}, ${maxBetCount}]`);
  }
}
```

**Build boards** (dòng 80-86) — thêm betCount:

```typescript
builtBoards.push({
  boardNo: bi.boardNo,
  playType: bi.playType,
  number: bi.number,
  tripleKind: bi.tripleKind,
  betCount: bi.betCount,                  // ← MỚI
});
```

**Build sideBets** (dòng 88-93) — thêm betCount:

```typescript
const builtSideBets: SideBet[] = sideBetInputs.map((si) => ({
  playType: si.playType,
  sum: si.sum,
  bet: si.bet,
  betCount: si.betCount,                  // ← MỚI
}));
```

**Tính pricing** (dòng 123-128) — thay đổi:

```typescript
const selectionsPerDraw = builtBoards.length + builtSideBets.length;
// betUnitsPerDraw = tổng đơn vị cược thực tế = Σ(board.betCount) + Σ(sideBet.betCount).
const betUnitsPerDraw =
  builtBoards.reduce((sum, b) => sum + b.betCount, 0) +
  builtSideBets.reduce((sum, s) => sum + s.betCount, 0);
// amountPerDraw = betUnitsPerDraw × unitPrice (VND).
const amountPerDraw = unitPrice * betUnitsPerDraw;
const totalAmount = amountPerDraw * drawIds.length;
const commissionAmount = Math.round(amountPerDraw * commissionRate);
```

**Ticket pricing** (dòng 148-152) — rename + thêm:

```typescript
pricing: {
  unitPrice,
  selectionsPerDraw,                      // ← RENAME từ betsPerDraw
  betUnitsPerDraw,                        // ← MỚI
  amountPerDraw,
  totalAmount,
},
```

**Entry snapshots** (dòng 170-181) — thêm betCount:

```typescript
const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
  boardNo: b.boardNo,
  playType: b.playType,
  number: b.number,
  tripleKind: b.tripleKind,
  betCount: b.betCount,                   // ← MỚI
}));

const sideBetSnapshots: EntrySideBetSnapshot[] = builtSideBets.map((s) => ({
  playType: s.playType,
  sum: s.sum,
  bet: s.bet,
  betCount: s.betCount,                   // ← MỚI
}));
```

**Entry doc** (dòng 194-198) — rename + thêm:

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

- API schema: `betCount` trên cả board + sideBet (`.default(1)` cho client không gửi)
- DTO: `PlaceBetBasicBoardInput.betCount`, `PlaceBetSideBetInput.betCount`, output `betUnitsPerDraw`
- Use case: validate `minBetCount ≤ betCount ≤ maxBetCount` cho cả boards + sideBets
- Use case: tính `betUnitsPerDraw = Σ(board.betCount) + Σ(sideBet.betCount)`, `amountPerDraw = unitPrice × betUnitsPerDraw`
- Board/SideBet build: thêm `betCount`
- Ticket pricing: `selectionsPerDraw` (RENAME), `betUnitsPerDraw` (MỚI)
- Entry snapshots: `betCount` per board + per sideBet
- Entry doc: `selectionCount` (RENAME), `betUnitCount` (MỚI), `amount = betUnitCount × unitPrice`

---

## Phase 3: Settle — Nhân betCount khi tính thưởng

### 3.1 Settle Entries — `packages/game-bingo18-application/src/use-cases/settle/settle-entries.ts`

**Đây là thay đổi quan trọng nhất.** 5 hàm match (`matchSingleNum`, `matchDoubleMatch`, `matchTripleMatch`, `matchSumTotal`, `matchBigSmallDraw`) giữ nguyên (per-unit). Nhân betCount tại settle layer.

**Thay đổi trong loop board cơ bản (dòng 115-171):**

Mỗi case trong switch cần thêm `betCount` và nhân vào `winAmount`:

```typescript
case Bingo18PlayType.SingleNum: {
  const matchResult = matchSingleNum(board.number!, drawResult, config.singleNumPrizes);
  boardPayouts.push({
    boardNo: board.boardNo,
    playType: board.playType,
    matchCount: matchResult.matchCount,
    betCount: board.betCount,                        // ← MỚI
    // winAmount = giá trị giải per-unit × betCount.
    winAmount: matchResult.winAmount * board.betCount, // ← NHÂN betCount
  });
  break;
}

case Bingo18PlayType.DoubleMatch: {
  const matchResult = matchDoubleMatch(board.number!, drawResult, config.doubleMatchPrizes);
  boardPayouts.push({
    boardNo: board.boardNo,
    playType: board.playType,
    matchCount: matchResult.matchCount,
    betCount: board.betCount,                        // ← MỚI
    winAmount: matchResult.winAmount * board.betCount, // ← NHÂN betCount
  });
  break;
}

case Bingo18PlayType.TripleMatch: {
  const matchResult = matchTripleMatch(...);
  boardPayouts.push({
    boardNo: board.boardNo,
    playType: board.playType,
    tripleKind: board.tripleKind as Bingo18TripleKind,
    matchCount: matchResult.isWin ? 3 : 0,
    betCount: board.betCount,                        // ← MỚI
    winAmount: matchResult.winAmount * board.betCount, // ← NHÂN betCount
  });
  break;
}
```

**Thay đổi trong loop side bet (dòng 177-212):**

```typescript
case Bingo18PlayType.SumTotal: {
  const matchResult = matchSumTotal(sb.sum!, drawResult, config.sumTotalPrizes);
  sideBetPayouts.push({
    playType: sb.playType,
    sum: sb.sum,
    outcome: matchResult.outcome,
    isWin: matchResult.isWin,
    betCount: sb.betCount,                           // ← MỚI
    // winAmount = giá trị giải per-unit × betCount.
    winAmount: matchResult.winAmount * sb.betCount,   // ← NHÂN betCount
  });
  break;
}

case Bingo18PlayType.BigSmallDraw: {
  const matchResult = matchBigSmallDraw(sb.bet as Bingo18BigSmallBet, drawResult, config.bigSmallDrawPrizes);
  sideBetPayouts.push({
    playType: sb.playType,
    bet: sb.bet,
    outcome: matchResult.outcome,
    isWin: matchResult.isWin,
    betCount: sb.betCount,                           // ← MỚI
    winAmount: matchResult.winAmount * sb.betCount,   // ← NHÂN betCount
  });
  break;
}
```

**Tổng hợp winAmount** (dòng 217-218) — giữ nguyên vì boardPayouts + sideBetPayouts đã nhân betCount:

```typescript
const winAmount =
  sumBy(boardPayouts, (b) => b.winAmount) + sumBy(sideBetPayouts, (s) => s.winAmount);
```

### 3.2 KHÔNG cần ApplyPayoutCaps

Bingo18 **KHÔNG có payout caps** (khác Keno). Đây là điểm đơn giản hơn Keno — payoutAmount = winAmount trực tiếp. Không cần sửa thêm file nào cho caps.

### 3.3 Checklist Phase 3

- Settle board loop (3 cases): `winAmount = matchResult.winAmount * betCount`
- Settle sideBet loop (2 cases): `winAmount = matchResult.winAmount * betCount`
- BoardPayout + SideBetPayout: thêm `betCount` field
- Verify: `Σ(boardPayouts.winAmount + sideBetPayouts.winAmount) = entry.payout.winAmount`
- matchSingleNum/matchDoubleMatch/matchTripleMatch/matchSumTotal/matchBigSmallDraw: KHÔNG SỬA

---

## Phase 4: Entry Repo — Review Aggregate Queries + Rename betCount

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-bingo18-application/src/infras/repos/entry-repo.ts`

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
- Phân loại: revenue-related (đổi sang betUnitCount) vs counting-related (đổi sang selectionCount)
- Sửa từng method, cập nhật JSDoc

---

## Phase 5: Backoffice + Player DTO — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `packages/game-bingo18-application/src/use-cases/operations/dto/live-entries.dto.ts`

- `LiveEntryBoard` + `LiveEntrySideBet`: thêm `betCount` field
- `LiveEntryItem`: thêm `betUnitCount` nếu cần hiển thị riêng

**File**: `packages/game-bingo18-application/src/use-cases/operations/get-live-entries.ts`

- Map `betCount` từ entry boards/sideBets vào DTO

**File**: Backoffice UI live feed — hiển thị `betCount` badge khi board/sideBet có `betCount > 1`

### 5.2 Operations DTO

**File**: `packages/game-bingo18-application/src/use-cases/operations/dto/operations.dto.ts`

- `OpsSummaryOutput`: review `totalBoards` + `totalSideBets` — thêm `totalBetUnits` nếu cần
- KPI "Total Bets" → đổi label hoặc hiện cả 2: "Selections" vs "Bet Units"

### 5.3 Player DTO

**File**: `packages/game-bingo18-application/src/use-cases/player/dto/player.dto.ts`

- **RENAME** `PlayerEntryInfo.betCount` → `PlayerEntryInfo.selectionCount`. Thêm `betUnitCount`.
- **RENAME** `PlayerTicketSummary.pricing.betsPerDraw` → `selectionsPerDraw`. Thêm `betUnitsPerDraw`.
- Board/SideBet arrays: thêm `betCount` field
- Payout arrays: thêm `betCount` field

**File**: `packages/game-bingo18-application/src/use-cases/player/get-ticket-entries-player.ts`

- Map `selectionCount` + `betUnitCount` từ entry
- Map `betCount` per board/sideBet

**File**: `packages/game-bingo18-application/src/use-cases/player/mappers/ticket.ts`

- Rename `betsPerDraw` → `selectionsPerDraw`, thêm `betUnitsPerDraw`

### 5.4 Checklist Phase 5

- Live feed DTO: `betCount` per board/sideBet
- Operations DTO: review + thêm fields
- Player DTO: rename `betCount` → `selectionCount`, thêm `betUnitCount`
- Player DTO boards/sideBets: thêm `betCount`
- Player mapper: rename + thêm fields
- KPI labels: rõ ràng "Selections" vs "Bet Units"

---

## Phase 6: Game Rules Doc + Tests

### 6.1 Game Rules

**File**: `.cursor/rules/bingo18-game-rules.mdc`

Cập nhật:

- Section 1 (Tổng quan): thêm "betCount = số lần tham gia dự thưởng per board/sideBet"
- Section 4 (Cấu trúc Ticket): cập nhật pricing formula dùng betUnitsPerDraw
- Section 5 (Tỷ lệ tài chính): ghi rõ "giá trị giải thưởng áp dụng cho 1 lần, nhân betCount"
- Section 9 (Codebase Map): cập nhật entity fields mới
- Section 11 (Quy tắc cho AI Agent): thêm rule betCount

### 6.2 Tests

**File**: `packages/game-bingo18-application/test/use-cases/`

Thêm test cases:

- `matchSingleNum` kết quả vẫn per-unit (không thay đổi — regression)
- `matchDoubleMatch` / `matchTripleMatch` kết quả vẫn per-unit
- `matchSumTotal` / `matchBigSmallDraw` kết quả vẫn per-unit
- Settle với `betCount = 1` trên mọi bets → behavior giữ nguyên (regression)
- Settle với `betCount = 3` trên board singleNum → `boardPayout.winAmount = matchWin × 3`
- Settle với `betCount = 2` trên sideBet sumTotal → `sideBetPayout.winAmount = sumTotalWin × 2`
- Entry `betUnitCount = Σ(board.betCount) + Σ(sideBet.betCount)`
- Entry `amount = betUnitCount × unitPrice`

---

## Tóm tắt Impact — Sắp xếp theo thứ tự thực hiện


| Phase                      | Files                                                | Mức                 |
| -------------------------- | ---------------------------------------------------- | ------------------- |
| 1. Entity + Rename         | `types.ts`, `financials.ts`, `ticket.ts`, `entry.ts` | Trung bình (rename) |
| 1.5. BO Config             | `schema.ts`, `play-rules-section.tsx`                | Nhỏ                 |
| 2. Place Bet               | `place-bet.ts` (handler + DTO + use case)            | Trung bình          |
| 3. Settle                  | `settle-entries.ts`                                  | Critical            |
| 4. Entry Repo              | `entry-repo.ts` (review + rename aggregate queries)  | Trung bình          |
| 5. Backoffice + Player DTO | 6-8 UI/DTO files (rename betCount → selectionCount)  | Trung bình          |
| 6. Docs + Tests            | `bingo18-game-rules.mdc`, test files                 | Trung bình          |


> **KHÔNG CÓ Phase 7 Backward Compat** — DB mới hoàn toàn, không cần fallback.

---

## Khác biệt chính so với Keno plan


| Aspect              | Keno                             | Bingo18 (plan này)                                                      |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **Rename betCount** | CẦN RENAME → selectionCount      | CẦN RENAME → selectionCount (GIỐNG Keno)                                |
| Board structure     | BasicBoard + numbers[]           | BasicBoard + number? + tripleKind?                                      |
| Side bets           | BigSmall + EvenOdd               | SumTotal + BigSmallDraw                                                 |
| Payout caps         | CÓ (ApplyPayoutCaps)             | **KHÔNG CÓ** (đơn giản hơn)                                             |
| Matching functions  | 3 hàm (basic, bigSmall, evenOdd) | **5 hàm** (singleNum, doubleMatch, tripleMatch, sumTotal, bigSmallDraw) |
| TripleKind          | Không có                         | **CÓ** (specific/any) — thêm `tripleKind` vào payout                    |
| Jackpot             | Không có                         | Không có (GIỐNG)                                                        |
| Tần suất            | 10 phút/kỳ                       | **6 phút/kỳ** (settle nhanh hơn)                                        |
| Config              | `minBetCount` + `maxBetCount`    | `minBetCount` + `maxBetCount` (GIỐNG)                                   |
| Max kỳ liên tiếp    | 1                                | **20** (multi-draw)                                                     |


---

## Danh sách files cần sửa (đầy đủ)

### Entity layer (`packages/game-bingo18/`)

1. `src/entities/types.ts` — PlayRules + minBetCount + maxBetCount
2. `src/entities/ticket.ts` — BasicBoard.betCount, SideBet.betCount, TicketPricing rename+thêm
3. `src/entities/entry.ts` — TicketEntryDoc rename+thêm, snapshots+payouts thêm betCount
4. `src/rules/financials.ts` — DEFAULT_BINGO18_CONFIG thêm minBetCount, maxBetCount

### Application layer (`packages/game-bingo18-application/`)

1. `src/use-cases/place-bet/dto/place-bet.dto.ts` — input+output betCount
2. `src/use-cases/place-bet/place-bet.ts` — validate+build+pricing+entry
3. `src/infras/repos/place-bet-store.ts` — review (có thể không cần sửa)
4. `src/use-cases/settle/settle-entries.ts` — nhân betCount khi tính thưởng
5. `src/infras/repos/entry-repo.ts` — rename aggregate queries
6. `src/use-cases/operations/dto/live-entries.dto.ts` — thêm betCount
7. `src/use-cases/operations/dto/operations.dto.ts` — review+thêm fields
8. `src/use-cases/operations/get-live-entries.ts` — map betCount
9. `src/use-cases/player/dto/player.dto.ts` — rename+thêm fields
10. `src/use-cases/player/get-ticket-entries-player.ts` — map fields
11. `src/use-cases/player/mappers/ticket.ts` — rename pricing fields

### API layer (`apps/api-player/`)

1. `src/handlers/bingo18/place-bet.ts` — Zod schema betCount

### Backoffice (`apps/backoffice/`)

1. `src/app/api/bingo18/config/_lib/schema.ts` — thêm minBetCount, maxBetCount
2. `src/app/(main)/games/bingo18/config/_lib/play-rules-section.tsx` — UI form

### Docs

1. `.cursor/rules/bingo18-game-rules.mdc` — cập nhật

