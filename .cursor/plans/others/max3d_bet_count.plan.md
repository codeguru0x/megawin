---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Max 3D — Thêm betCount (Số lần tham gia dự thưởng)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.
> **Plan mẫu**: Các game khác (Max3D Pro, Lotto535, Mega645, Power655, Keno, Bingo18) dùng plan này làm template — thay đổi entity paths và business rules tương ứng.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/max3d-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc` — JSDoc, comment business logic, DRY types
3. **Entity files**: Đọc toàn bộ `packages/game-max3d/src/entities/` trước khi sửa

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị thưởng tương ứng với 01 lần tham gia dự thưởng."

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (cấu hình trong `PlayRules`, mặc định 10.000 VND)
- `betCount` = số lần tham gia dự thưởng cho 1 board (player tự chọn, tối thiểu 1, tối đa theo config `maxBetCount`)
- Tiền cược board = `lineCount × betCount × unitPrice`
- Tiền thưởng board = `matchWinAmount × betCount`

---

## Quyết định kiến trúc (đã xác nhận)


| #   | Quyết định                                                                                           | Lý do                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `entry.lineCount` **giữ nguyên** = số line matching. Thêm `betUnitCount` = `Σ(lineCount × betCount)` | Tách biệt ý nghĩa: lineCount phục vụ settle matching, betUnitCount phục vụ tính tiền |
| 2   | `entry.amount = betUnitCount × unitPrice`                                                            | Phản ánh tiền thực trả                                                               |
| 3   | `TicketPricing` thêm `betUnitsPerDraw`, giữ `linesPerDraw`                                           | Backward compat, ý nghĩa rõ ràng                                                     |
| 4   | Line docs: `winAmount = unitWinAmount × betCount`, kèm `betCount`                                    | Self-documenting, `Σ(lineDoc.winAmount) = entry.payout.winAmount`                    |
| 5   | `buildPayoutTiers()` **giữ nguyên signature**                                                        | lineResults đã nhân betCount trước khi gom                                           |
| 6   | `matchBoard()` **giữ nguyên** — trả kết quả per-unit                                                 | Pure matching logic, không biết betCount                                             |


---

## Phase 1: Entity Layer — Thêm fields

### 1.1 Game Config — `packages/game-max3d/src/entities/types.ts`

**File**: `packages/game-max3d/src/entities/types.ts`
**Interface**: `PlayRules`

```typescript
export interface PlayRules {
  unitPrice: number;
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

**File**: `packages/game-max3d/src/rules/defaults.ts`

Thêm `maxBetCount: 10` vào `DEFAULT_MAX3D_CONFIG.play`.

### 1.2 Ticket — `packages/game-max3d/src/entities/ticket.ts`

**Interface `BoardDerived`** — thêm `betCount`:

```typescript
export interface BoardDerived {
  lineCount: number;
  /** Số lần cược nhân bội cho board (≥ 1). Player chọn khi đặt cược. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketPricing`** — thêm `betUnitsPerDraw`:

```typescript
export interface TicketPricing {
  unitPrice: number;
  /** Tổng lines matching mỗi kỳ = Σ(boards[].derived.lineCount). Dùng cho settle. */
  linesPerDraw: number;
  /** Tổng đơn vị cược mỗi kỳ = Σ(lineCount × betCount). Dùng tính tiền. */
  betUnitsPerDraw: number;                // ← MỚI
  /** Tiền cược mỗi kỳ = betUnitsPerDraw × unitPrice (VND). */
  amountPerDraw: number;                  // ← ĐỔI CÔNG THỨC
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-max3d/src/entities/entry.ts`

**Interface `EntryBoardSnapshot`** — thêm `betCount`:

```typescript
export interface EntryBoardSnapshot {
  boardNo: string;
  playMode: PlayMode;
  playType: PlayType;
  triplets: Triplet[];
  /** Số lines matching = số hoán vị. Phụ thuộc playType. */
  lineCount: number;
  /** Số lần cược nhân bội (≥ 1). Snapshot từ ticket board. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketEntryDoc`** — thêm `betUnitCount`:

```typescript
  /** Tổng lines matching = Σ(board.lineCount). Dùng cho settle. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.lineCount × board.betCount). Dùng tính tiền. */
  betUnitCount: number;                   // ← MỚI
  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;                         // ← ĐỔI CÔNG THỨC
  unitPrice: number;
```

### 1.4 Line — `packages/game-max3d/src/entities/line.ts`

**Interface `TicketLineDoc`** — thêm `betCount` vào line data section:

```typescript
  /** Số lần cược nhân bội của board chứa line này. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;                       // ← MỚI
```

**Interface `LineMatchResult`** — `winAmount` JSDoc cập nhật:

```typescript
export interface LineMatchResult {
  tier: BasicPrizeTier | PlusPrizeTier | null;
  /** Tiền thưởng thực tế = unitWinAmount × betCount (VND). */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA: tổng thực tế
}
```

### 1.5 Checklist Phase 1

- `types.ts` — `PlayRules.maxBetCount`
- `defaults.ts` — `maxBetCount: 10`
- `ticket.ts` — `BoardDerived.betCount`, `TicketPricing.betUnitsPerDraw`
- `entry.ts` — `EntryBoardSnapshot.betCount`, `TicketEntryDoc.betUnitCount`
- `line.ts` — `TicketLineDoc.betCount`, `LineMatchResult.winAmount` JSDoc
- Cập nhật barrel exports nếu cần (`index.ts`)

---

## Phase 1.5: Backoffice Game Config — Cấu hình maxBetCount

Flow: `PlayRulesSection` (UI form) → `useUpdateGameConfig` (PUT `/max3d/config`) → `updateGameConfigSchema` (Zod) → `UpdateGameConfigUseCase` → DB.

### 1.5.1 API Schema — `apps/backoffice/src/app/api/max3d/config/_lib/schema.ts`

**Thêm `maxBetCount` vào `playSchema`:**

```typescript
const playSchema = z.object({
  unitPrice: positiveInt,
  maxBetCount: positiveInt,                // ← MỚI
  maxBoardsPerTicket: positiveInt,
  maxDrawCount: positiveInt,
  salesCloseBeforeMinutes: positiveInt,
  drawsPerDay: positiveInt,
  drawTimes: z.array(z.string().regex(timePattern, "Giờ phải có format HH:mm")).min(1),
  drawDaysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Phải chọn ít nhất 1 ngày quay.")
    .max(7),
}).partial();
```

API route (`route.ts`) **không cần sửa** — đã dùng generic `updateGameConfigSchema` → auto nhận field mới.

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/max3d/config/_lib/play-rules-section.tsx`

**Zod schema** — thêm `maxBetCount`:

```typescript
const playFormSchema = z.object({
  unitPrice: z.coerce.number().int().positive("Phải > 0"),
  maxBetCount: z.coerce.number().int().min(1, "Tối thiểu 1").max(50, "Tối đa 50"),  // ← MỚI
  maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
  maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
  salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
  drawTime: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
  drawDaysOfWeek: z.array(z.number()).min(1, "Chọn ít nhất 1 ngày quay"),
});
```

**Form values** — thêm initial value:

```typescript
values: {
  unitPrice: config.play.unitPrice,
  maxBetCount: config.play.maxBetCount ?? 10,    // ← MỚI, fallback cho config cũ
  maxBoardsPerTicket: config.play.maxBoardsPerTicket,
  // ...
},
```

**handleSubmit** — thêm `maxBetCount` vào payload:

```typescript
onSave({
  play: {
    unitPrice: values.unitPrice,
    maxBetCount: values.maxBetCount,              // ← MỚI
    maxBoardsPerTicket: values.maxBoardsPerTicket,
    // ...
  },
});
```

**UI** — thêm field vào grid "Giá vé & Giới hạn". Đặt cạnh `maxBoardsPerTicket` và `maxDrawCount` trong grid 3 cột hiện tại, **đổi thành grid 4 cột** hoặc thêm 1 row:

```tsx
{/* Thêm vào grid grid-cols-3 hiện tại → đổi thành grid-cols-4, hoặc giữ 3 cột + row mới */}
<FormField
  control={form.control}
  name="maxBetCount"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-xs text-muted-foreground">
        Max lần cược/board
      </FormLabel>
      <FormControl>
        <MoneyInput
          className="text-center font-semibold"
          value={field.value}
          onValueChange={(v) => field.onChange(v ?? 1)}
          onBlur={field.onBlur}
          name={field.name}
          ref={field.ref}
          thousandSeparator={false}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### 1.5.3 Use Case — `packages/game-max3d-application/src/use-cases/game-config/`

`UpdateGameConfigUseCase` thường dùng partial merge (`$set`) → **không cần sửa** nếu đã generic. Nhưng cần verify:

- Đọc file `update-game-config.ts` (hoặc tương đương) để confirm partial update logic
- `GetGlobalConfigApiUseCase` trả toàn bộ config → auto bao gồm `maxBetCount` sau khi thêm vào DB

### 1.5.4 Checklist Phase 1.5

- `schema.ts` — thêm `maxBetCount: positiveInt` vào `playSchema`
- `play-rules-section.tsx` — Zod schema + form initial value + handleSubmit + UI field
- `use-game-config.ts` — verify `GameConfig` interface dùng `PlayRules` type (tự có `maxBetCount`)
- Verify `UpdateGameConfigUseCase` — partial merge tự nhận field mới
- Test manual: mở backoffice → Game Config → thấy field "Max lần cược/board" → sửa → Save → reload → giá trị giữ nguyên

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/max3d/place-bet.ts`

Thêm `betCount` vào cả 2 board schemas:

```typescript
const max3dBasicBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.Basic),
  playType: z.enum([PlayType.Straight, PlayType.Combo3, PlayType.Combo6]),
  triplets: z.array(max3dTripletSchema).length(1),
  betCount: z.number().int().min(1).default(1),   // ← MỚI, default 1 cho backward compat
});

const max3dPlusBoardSchema = z.object({
  boardNo: z.enum(VALID_BOARD_NOS),
  playMode: z.literal(PlayMode.Plus),
  playType: z.literal(PlayType.Straight),
  triplets: z.array(max3dTripletSchema).length(2),
  betCount: z.number().int().min(1).default(1),   // ← MỚI
});
```

Map `betCount` vào `PlaceBetBoardInput`:

```typescript
const boards: PlaceBetBoardInput[] = rawBoards.map((b) => ({
  boardNo: b.boardNo,
  playMode: b.playMode,
  playType: b.playType,
  selection: { triplets: b.triplets },
  betCount: b.betCount,                            // ← MỚI
}));
```

### 2.2 DTO — Place Bet Input

**File**: `packages/game-max3d-application/src/use-cases/place-bet/` (DTO hoặc place-bet.ts)

Thêm `betCount: number` vào `PlaceBetBoardInput`.

### 2.3 Use Case — `packages/game-max3d-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config:

```typescript
// Validate betCount không vượt maxBetCount (từ game config).
for (const bi of input.boards) {
  const betCount = bi.betCount ?? 1;
  if (betCount > play.maxBetCount) {
    throw new ValidationError(`betCount ${betCount} vượt quá giới hạn ${play.maxBetCount}`);
  }
}
```

**Tính pricing** — thay đổi:

```typescript
// TRƯỚC:
// const amountPerDraw = unitPrice * totalLinesPerDraw;

// SAU:
let totalLinesPerDraw = 0;
let totalBetUnitsPerDraw = 0;

for (const bi of input.boards) {
  const lineCount = calculateLineCount(bi.playMode, bi.playType, bi.selection);
  const betCount = bi.betCount ?? 1;
  totalLinesPerDraw += lineCount;
  totalBetUnitsPerDraw += lineCount * betCount;
  // ... build board with derived: { lineCount, betCount }
}

const amountPerDraw = unitPrice * totalBetUnitsPerDraw;
const totalAmount = amountPerDraw * drawCount;
```

**Board build** — thêm `betCount` vào `derived`:

```typescript
builtBoards.push({
  boardNo: bi.boardNo,
  playMode: bi.playMode,
  playType: bi.playType,
  selection: { triplets: bi.selection.triplets },
  derived: {
    lineCount,
    betCount,                              // ← MỚI
  },
});
```

**Ticket pricing** — thêm `betUnitsPerDraw`:

```typescript
pricing: {
  unitPrice,
  linesPerDraw: totalLinesPerDraw,
  betUnitsPerDraw: totalBetUnitsPerDraw,   // ← MỚI
  amountPerDraw,
  totalAmount,
},
```

**Entry snapshot** — thêm `betCount`:

```typescript
const boardSnapshots: EntryBoardSnapshot[] = builtBoards.map((b) => ({
  boardNo: b.boardNo,
  playMode: b.playMode,
  playType: b.playType,
  triplets: b.selection.triplets,
  lineCount: b.derived.lineCount,
  betCount: b.derived.betCount,            // ← MỚI
}));
```

**Entry doc** — thêm `betUnitCount`:

```typescript
{
  lineCount: totalLinesPerDraw,
  betUnitCount: totalBetUnitsPerDraw,      // ← MỚI
  amount: amountPerDraw,
  unitPrice,
}
```

### 2.4 Checklist Phase 2

- API schema: `betCount` + `.default(1)` + `.max(play.maxBetCount)`
- DTO: `PlaceBetBoardInput.betCount`
- Use case: validate `betCount <= maxBetCount`
- Use case: tính `totalBetUnitsPerDraw`, `amountPerDraw = unitPrice × totalBetUnitsPerDraw`
- Board derived: `{ lineCount, betCount }`
- Ticket pricing: `betUnitsPerDraw`
- Entry snapshot: `betCount` per board
- Entry doc: `betUnitCount`
- PlaceBetOutput: thêm `betUnitsPerDraw` nếu có DTO output

---

## Phase 3: Settle — Nhân betCount khi tính thưởng

### 3.1 Settle Entries — `packages/game-max3d-application/src/use-cases/settle/settle-entries.ts`

**Đây là thay đổi quan trọng nhất.** `matchBoard()` giữ nguyên (per-unit). Nhân betCount tại settle layer.

**Thay đổi trong loop board:**

```typescript
for (const board of boards) {
  const boardMatch = matchBoard(
    { boardNo: board.boardNo, playMode: board.playMode, playType: board.playType, triplets: board.triplets },
    flattenedResult,
    prizeConfig,
  );

  // betCount = số lần cược nhân bội — nhân vào winAmount và ghi vào lineDoc.
  // matchBoard() trả kết quả per-unit (1 lần cược), nhân betCount ở đây.
  const betCount = board.betCount ?? 1;

  boardResults.push(boardMatch);
  entryWinAmount += boardMatch.winAmount * betCount;

  for (const lineResult of boardMatch.lineResults) {
    // winAmount đã nhân betCount → lineDoc.matchResult.winAmount = tổng thực tế.
    // betCount lưu kèm để audit trail — giải thích tại sao winAmount > giá trị 1 unit.
    const effectiveWin = lineResult.winAmount * betCount;

    lineDocs.push({
      tenantId: entry.tenantId,
      accountId: entry.accountId,
      username: entry.username,
      ticketId: entry.ticketId,
      entryId: entry.id,
      drawId: entry.drawId,
      financialDate: entry.financialDate,
      boardNo: board.boardNo,
      lineIndex: lineIndex,
      playMode: board.playMode,
      playType: board.playType,
      triplets: lineResult.triplets,
      betCount,                                    // ← MỚI
      matchResult: {
        tier: lineResult.tier,
        winAmount: effectiveWin,                   // ← ĐÃ NHÂN betCount
      },
      createdAt: now,
    });
    lineIndex++;
  }
}
```

### 3.2 buildPayoutTiers — `packages/game-max3d/src/rules/prize-tiers.ts`

**KHÔNG cần sửa signature.** Tuy nhiên, `buildPayoutTiers` hiện nhận `BoardMatchResult[]` (per-unit). Cần thay đổi cách gọi:

**Cách 1 (khuyến nghị)**: Tạo "effective" boardResults với winAmount đã nhân betCount trước khi truyền vào `buildPayoutTiers()`:

```typescript
// Trong settle-entries, sau khi đã build tất cả boardResults:
// Tạo adjusted results để buildPayoutTiers gom đúng amount.
const adjustedResults: BoardMatchResult[] = boardResults.map((br, idx) => {
  const betCount = boards[idx]!.betCount ?? 1;
  return {
    ...br,
    lineResults: br.lineResults.map((lr) => ({
      ...lr,
      winAmount: lr.winAmount * betCount,
    })),
  };
});

const payoutTiers = buildPayoutTiers(adjustedResults);
```

**Cách 2**: Nhân betCount trực tiếp khi push lineDocs (đã làm ở 3.1), rồi build payoutTiers từ lineDocs thay vì boardResults. Nhưng cách 1 ít thay đổi hơn.

### 3.3 Checklist Phase 3

- Settle loop: `entryWinAmount += boardMatch.winAmount * betCount`
- LineDoc: thêm `betCount`, `matchResult.winAmount = lineResult.winAmount * betCount`
- buildPayoutTiers: truyền adjusted boardResults (lineResults.winAmount đã nhân betCount)
- Verify: `Σ(lineDoc.matchResult.winAmount) = entry.payout.winAmount`
- Verify: `entry.payout.payoutAmount = entryWinAmount` (tổng đã nhân betCount)

---

## Phase 4: Entry Repo — Review Aggregate Queries

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-max3d-application/src/infras/repos/entry-repo.ts`

Tất cả aggregate queries dùng `$sum: "$lineCount"` cần review:


| Method                                | Hiện dùng                                 | Nên dùng                             | Lý do                                             |
| ------------------------------------- | ----------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `aggregateTotalRevenue()`             | `$sum: "$amount"`                         | **Giữ nguyên**                       | `amount` đã phản ánh betCount                     |
| `aggregateOpsSummary()`               | `$sum: "$lineCount"` cho totalLines       | **Đổi sang `$sum: "$betUnitCount"`** | KPI "tổng đơn vị cược" phải phản ánh tiền thực    |
| `aggregateTenantBreakdown()`          | `$sum: "$lineCount"` cho lines            | **Đổi sang `$sum: "$betUnitCount"`** | Report tenant phải khớp revenue                   |
| `aggregateTenantSettleMetrics()`      | `$sum: "$lineCount"`                      | Cân nhắc                             | Nếu report "lines settled" vs "bet units settled" |
| `aggregateOutstandingMetricsByDraw()` | `$sum: "$lineCount"`                      | **Đổi sang `$sum: "$betUnitCount"`** | Outstanding phải khớp revenue                     |
| `aggregatePlayTypeDistribution()`     | `$divide: [boardLineCount, "$lineCount"]` | Review                               | Tỷ lệ revenue per playType                        |
| `aggregateTripletFrequency()`         | `$divide: [boardLineCount, "$lineCount"]` | Review                               | Tỷ lệ revenue per triplet                         |


### 4.2 Quy tắc review

- **Revenue/tiền cược** → dùng `$sum: "$betUnitCount"` hoặc `$sum: "$amount"`
- **Matching/settle count** → giữ `$sum: "$lineCount"`
- **Khi chia tỷ lệ revenue** → dùng `betUnitCount` thay vì `lineCount`

### 4.3 Checklist Phase 4

- Đọc toàn bộ `entry-repo.ts` (~1500 dòng)
- Liệt kê tất cả methods dùng `lineCount` trong aggregate pipeline
- Phân loại mỗi method: revenue-related (đổi) vs matching-related (giữ)
- Sửa từng method, cập nhật JSDoc

---

## Phase 5: Backoffice — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `apps/backoffice/src/app/(main)/games/max3d/operations/_lib/sections/analytics/`

- Hiển thị `betCount` badge khi `betCount > 1` trên live feed entries
- KPI "Total Lines" → đổi label thành "Total Bet Units" hoặc hiện cả 2

### 5.2 Tickets / Pending Tickets Pages

**Files**: `apps/backoffice/src/app/(main)/games/max3d/tickets/`, `pending-tickets/`

- Thêm cột `betCount` per board (hoặc badge `×N` cạnh board)
- Tổng tiền đã phản ánh betCount (từ `entry.amount`)

### 5.3 Operations DTO

**File**: `packages/game-max3d-application/src/use-cases/operations/dto/`

- `LiveEntryDto`: thêm `betUnitCount` nếu cần hiển thị riêng
- `OpsSummaryDto`: `totalLines` → `totalBetUnits` (hoặc thêm field mới)

### 5.4 Checklist Phase 5

- Live feed UI: badge betCount
- Tickets page: cột/badge betCount per board
- Pending tickets: tương tự
- Operations DTO: review + thêm fields
- KPI labels: rõ ràng "Bet Units" vs "Lines"

---

## Phase 6: Game Rules Doc + Tests

### 6.1 Game Rules

**File**: `.cursor/rules/max3d-game-rules.mdc`

Cập nhật:

- Section 1 (Tổng quan): thêm "betCount = số lần tham gia dự thưởng per board"
- Section 3 (Giải thưởng): ghi rõ "giá trị giải thưởng áp dụng cho 1 lần, nhân betCount"
- Section 9 (Codebase Map): cập nhật entity fields mới
- Section 11 (Quy tắc cho AI Agent): thêm rule betCount

### 6.2 Tests

**File**: `packages/game-max3d-application/test/use-cases/settle-entries.test.ts`

Thêm test cases:

- `matchBoard` kết quả vẫn per-unit (không thay đổi)
- Settle với `betCount = 1` → behavior giữ nguyên (regression)
- Settle với `betCount = 3` → `entryWinAmount = matchWinAmount × 3`
- Line doc `winAmount = unitWin × betCount`
- Line doc có `betCount` field
- `buildPayoutTiers` với adjusted boardResults → `amount = unitAmount × hitCount × betCount`
- Entry `betUnitCount = Σ(lineCount × betCount)`

---

## Phase 7: Backward Compatibility

### 7.1 Data Migration (entries cũ)

Entries cũ không có `betCount` / `betUnitCount`. Xử lý:

- **Code**: mọi nơi đọc `betCount` phải dùng `?? 1` (default)
- **Code**: mọi nơi đọc `betUnitCount` phải dùng `?? lineCount` (fallback)
- **Migration script** (optional): `db.max3d_ticket_entries.updateMany({ betUnitCount: { $exists: false } }, { $set: { betUnitCount: "$lineCount" } })`

### 7.2 API Backward Compat

- `betCount` trong Zod schema dùng `.default(1)` → client cũ không gửi vẫn hoạt động
- Response DTO thêm `betUnitsPerDraw` — client cũ ignore field mới

### 7.3 Checklist Phase 7

- Tất cả reads `board.betCount` dùng `?? 1`
- Tất cả reads `entry.betUnitCount` dùng `?? entry.lineCount`
- API schema `.default(1)`
- Optional: migration script

---

## Tóm tắt Impact — Sắp xếp theo thứ tự thực hiện


| Phase              | Files                                                         | Mức                |
| ------------------ | ------------------------------------------------------------- | ------------------ |
| 1. Entity          | `types.ts`, `defaults.ts`, `ticket.ts`, `entry.ts`, `line.ts` | 🟡 Nhỏ             |
| 1.5. BO Config     | `schema.ts`, `play-rules-section.tsx`                         | 🟡 Nhỏ             |
| 2. Place Bet       | `place-bet.ts` (handler), DTO, `place-bet.ts` (use case)      | 🟠 Trung bình      |
| 3. Settle          | `settle-entries.ts`                                           | 🔴 Critical        |
| 4. Entry Repo      | `entry-repo.ts` (~10 aggregate queries)                       | 🟠 Trung bình      |
| 5. Backoffice Ops  | 4-5 UI files + DTO                                            | 🟡 Nhỏ             |
| 6. Docs + Tests    | `max3d-game-rules.mdc`, `settle-entries.test.ts`              | 🟠 Trung bình      |
| 7. Backward Compat | Across all files                                              | 🟡 Nhỏ (checklist) |


---

## Template cho game khác

Khi apply cho game khác, thay đổi:

1. **Entity paths**: `packages/game-{GAME}/src/entities/`
2. **Application paths**: `packages/game-{GAME}-application/src/`
3. **API handler**: `apps/api-player/src/handlers/{GAME}/place-bet.ts`
4. **Backoffice config UI**: `apps/backoffice/src/app/(main)/games/{GAME}/config/_lib/play-rules-section.tsx`
5. **Backoffice config API schema**: `apps/backoffice/src/app/api/{GAME}/config/_lib/schema.ts`
6. **Backoffice operations/tickets**: `apps/backoffice/src/app/(main)/games/{GAME}/`
7. **Business rules**: mỗi game có cách tính `lineCount` khác nhau (bao types, side bets, etc.)
8. **Settle logic**: mỗi game có `matchBoard()` / `matchEntry()` khác nhau
9. **Aggregate queries**: review `entry-repo.ts` riêng cho mỗi game

**Các game KHÔNG CÓ Jackpot** (Keno, Bingo18, Max3D, Max3D Pro): financial pipeline đơn giản, không cần sửa `calculate-financials.ts`.
**Các game CÓ Jackpot** (Lotto535, Mega645, Power655): `calculate-financials.ts` đọc `$sum: "$amount"` nên tự đúng nếu `entry.amount` đúng. Nhưng cần review jackpot contribution ratio nếu tính theo lineCount.