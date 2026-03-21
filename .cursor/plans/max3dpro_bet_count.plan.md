---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Max 3D Pro — Thêm betCount (Số lần tham gia dự thưởng)

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự. PHẢI đọc các file tham chiếu trước khi code.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

1. **Game rule**: `.cursor/rules/max3dpro-game-rules.mdc`
2. **Code quality**: `.cursor/rules/code-quality-standards.mdc` — JSDoc, comment business logic, DRY types
3. **Entity files**: Đọc toàn bộ `packages/game-max3dpro/src/entities/` trước khi sửa
4. **Plan mẫu**: `.cursor/plans/max3d_bet_count.plan.md` — plan Max 3D gốc, dùng làm tham chiếu

---

## Quy tắc nghiệp vụ

> **Luật Vietlott**: "Giá trị lĩnh thưởng được tính theo số lần tham gia dự thưởng của bộ số trúng thưởng (01 lần tham gia dự thưởng mệnh giá 10.000 đồng) nhân với giá trị thưởng tương ứng với 01 lần tham gia dự thưởng."

- `unitPrice` = mệnh giá 1 lần tham gia dự thưởng (cấu hình trong `PlayRules`, mặc định 10.000 VND)
- `betCount` = số lần tham gia dự thưởng cho 1 board (player tự chọn, tối thiểu 1, tối đa theo config `maxBetCount`)
- Tiền cược board = `lineCount × betCount × unitPrice`
- Tiền thưởng pair = `matchWinAmount × betCount`

**ĐẶC THÙ Max 3D Pro so với Max 3D:**

- Đơn vị cơ bản là **TripletPair** (ordered pair), không phải single triplet
- `lineCount` = số cặp (pairs): multiNumber → P(n,2), multiDigit → perms(front) × perms(back)
- Mỗi pair có thể trúng **NHIỀU giải đồng thời** (wonTiers[]) → betCount nhân vào TỪNG giải
- 8 hạng giải, 1 PrizeTier enum (khác Max 3D có 2 enums)
- `matchPair()` trả `PairMatchResult { wonTiers[], winAmount }` — KHÔNG phải 1 giải duy nhất

---

## Quyết định kiến trúc (đã xác nhận)


| #   | Quyết định                                                                                            | Lý do                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `entry.lineCount` **giữ nguyên** = số pairs matching. Thêm `betUnitCount` = `Σ(lineCount × betCount)` | Tách biệt: lineCount phục vụ settle matching, betUnitCount phục vụ tính tiền |
| 2   | `entry.amount = betUnitCount × unitPrice`                                                             | Phản ánh tiền thực trả                                                       |
| 3   | `TicketPricing` thêm `betUnitsPerDraw`, giữ `linesPerDraw`                                            | Backward compat, ý nghĩa rõ ràng                                             |
| 4   | Line docs: `winAmount = wonTier.winAmount × betCount`, kèm `betCount`                                 | Self-documenting                                                             |
| 5   | `buildPayoutTiers()` **giữ nguyên signature**                                                         | pairResults đã nhân betCount trước khi gom                                   |
| 6   | `matchPair()` **giữ nguyên** — trả kết quả per-unit                                                   | Pure matching logic, không biết betCount                                     |


---

## Phase 1: Entity Layer — Thêm fields

### 1.1 Game Config — `packages/game-max3dpro/src/entities/types.ts`

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
  multiNumberMin: number;
  multiNumberMax: number;
}
```

**File**: `packages/game-max3dpro/src/rules/defaults.ts`

Thêm `maxBetCount: 10` vào `DEFAULT_MAX3D_PRO_CONFIG.play`.

### 1.2 Ticket — `packages/game-max3dpro/src/entities/ticket.ts`

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
  /** Tổng cặp (pairs) mỗi kỳ = Σ(boards[].derived.lineCount). Dùng cho settle. */
  linesPerDraw: number;
  /** Tổng đơn vị cược mỗi kỳ = Σ(lineCount × betCount). Dùng tính tiền. */
  betUnitsPerDraw: number;                // ← MỚI
  /** Tiền cược mỗi kỳ = betUnitsPerDraw × unitPrice (VND). */
  amountPerDraw: number;                  // ← ĐỔI CÔNG THỨC
  totalAmount: number;
}
```

### 1.3 Entry — `packages/game-max3dpro/src/entities/entry.ts`

**Interface `EntryBoardSnapshot`** — thêm `betCount`:

```typescript
export interface EntryBoardSnapshot {
  boardNo: string;
  playMode: PlayMode;
  playType: PlayType;
  triplets: Triplet[];
  frontDigits?: number[];
  backDigits?: number[];
  lineCount: number;
  /** Số lần cược nhân bội (≥ 1). Snapshot từ ticket board. */
  betCount: number;                       // ← MỚI
}
```

**Interface `TicketEntryDoc`** — thêm `betUnitCount`:

```typescript
  /** Tổng cặp (pairs) = Σ(board.lineCount). Dùng cho settle. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.lineCount × board.betCount). Dùng tính tiền. */
  betUnitCount: number;                   // ← MỚI
  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;                         // ← ĐỔI CÔNG THỨC
  unitPrice: number;
```

### 1.4 Line — `packages/game-max3dpro/src/entities/line.ts`

**Interface `TicketLineDoc`** — thêm `betCount`:

```typescript
  /** Số lần cược nhân bội của board chứa line này. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;                       // ← MỚI
```

**Interface `LineMatchResult`** — `winAmount` JSDoc cập nhật:

```typescript
export interface LineMatchResult {
  tier: PrizeTier | null;
  /** Tiền thưởng thực tế = unitWinAmount × betCount (VND). */
  winAmount: number;                      // ← ĐỔI Ý NGHĨA: tổng thực tế
  matchDetails?: string;
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

Flow: `PlayRulesSection` (UI form) → `useUpdateGameConfig` (PUT `/max3dpro/config`) → `updateGameConfigSchema` (Zod) → `UpdateGameConfigUseCase` → DB.

### 1.5.1 API Schema — `apps/backoffice/src/app/api/max3dpro/config/_lib/schema.ts`

Thêm `maxBetCount: positiveInt` vào `playSchema`.

### 1.5.2 UI Form — `apps/backoffice/src/app/(main)/games/max3dpro/config/_lib/play-rules-section.tsx`

- Zod schema: thêm `maxBetCount: z.coerce.number().int().min(1).max(50)`
- Form values: thêm `maxBetCount: config.play.maxBetCount ?? 10`
- handleSubmit: thêm `maxBetCount: values.maxBetCount` vào payload
- UI: thêm FormField "Max lần cược/board" vào grid "Giá vé & Giới hạn"

### 1.5.3 Checklist Phase 1.5

- `schema.ts` — thêm `maxBetCount: positiveInt`
- `play-rules-section.tsx` — Zod + form + handleSubmit + UI
- Verify `UpdateGameConfigUseCase` — partial merge tự nhận field mới

---

## Phase 2: Place Bet — API + Use Case

### 2.1 API Schema — `apps/api-player/src/handlers/max3dpro/place-bet.ts`

Thêm `betCount` vào cả 2 board schemas (discriminated union by playMode):

- `max3dproMultiNumberBoardSchema`: thêm `betCount: z.number().int().min(1).default(1)`
- `max3dproMultiDigitBoardSchema`: thêm `betCount: z.number().int().min(1).default(1)`

Map `betCount` vào `PlaceBetBoardInput` trong handler:

```typescript
const boards: PlaceBetBoardInput[] = rawBoards.map((b) => ({
  ...existingFields,
  betCount: b.betCount,                            // ← MỚI
}));
```

### 2.2 DTO — `packages/game-max3dpro-application/src/use-cases/place-bet/dto/place-bet.dto.ts`

Thêm `betCount: number` vào `PlaceBetBoardInput`.

### 2.3 Use Case — `packages/game-max3dpro-application/src/use-cases/place-bet/place-bet.ts`

**Validation** — sau khi load game config, validate betCount <= maxBetCount per board.

**Tính pricing** — thay đổi:

```typescript
let totalLinesPerDraw = 0;
let totalBetUnitsPerDraw = 0;

for (const bi of boardInputs) {
  const lineCount = calculateLineCount(bi.playMode, bi.playType, bi.selection);
  const betCount = bi.betCount ?? 1;
  totalLinesPerDraw += lineCount;
  totalBetUnitsPerDraw += lineCount * betCount;
}

const amountPerDraw = unitPrice * totalBetUnitsPerDraw;
const totalAmount = amountPerDraw * drawCount;
```

**Board derived**: `{ lineCount, betCount }`

**Ticket pricing**: thêm `betUnitsPerDraw: totalBetUnitsPerDraw`

**Entry snapshot**: thêm `betCount` per board

**Entry doc**: thêm `betUnitCount: totalBetUnitsPerDraw`

### 2.4 Checklist Phase 2

- API schema: `betCount` + `.default(1)` cho cả multiNumber và multiDigit
- DTO: `PlaceBetBoardInput.betCount`
- Use case: validate `betCount <= maxBetCount`
- Use case: tính `totalBetUnitsPerDraw`, `amountPerDraw = unitPrice × totalBetUnitsPerDraw`
- Board derived: `{ lineCount, betCount }`
- Ticket pricing: `betUnitsPerDraw`
- Entry snapshot: `betCount` per board
- Entry doc: `betUnitCount`
- PlaceBetOutput: thêm `betUnitsPerDraw`

---

## Phase 3: Settle — Nhân betCount khi tính thưởng

### 3.1 Settle Entries — `packages/game-max3dpro-application/src/use-cases/settle/settle-entries.ts`

**Đây là thay đổi quan trọng nhất.** `matchPair()` giữ nguyên (per-unit). Nhân betCount tại settle layer.

**ĐẶC THÙ Max 3D Pro**: Mỗi pair có thể trúng NHIỀU giải đồng thời (`wonTiers[]`). betCount phải nhân vào TỪNG wonTier.winAmount.

**Thay đổi trong loop board → pairs:**

```typescript
for (const board of boards) {
  // betCount = số lần cược nhân bội — nhân vào winAmount từng giải.
  // matchPair() trả kết quả per-unit (1 lần cược), nhân betCount ở đây.
  const betCount = board.betCount ?? 1;

  const pairs = expandSelectionToPairs(board.playMode, { ... });

  for (const pair of pairs) {
    const pairResult = matchPair(pair.first, pair.second, drawResult, prizeConfig.standard);

    allPairResults.push(pairResult);
    // entryWinAmount cộng dồn đã nhân betCount
    entryWinAmount += pairResult.winAmount * betCount;

    if (pairResult.wonTiers.length === 0) {
      allLineDocs.push({
        ...ownershipFields,
        betCount,                                    // ← MỚI
        matchResult: { tier: null, winAmount: 0 },
        ...
      });
      lineIndex++;
    } else {
      for (const wt of pairResult.wonTiers) {
        // winAmount đã nhân betCount → lineDoc.matchResult.winAmount = tổng thực tế.
        const effectiveWin = wt.winAmount * betCount;
        allLineDocs.push({
          ...ownershipFields,
          betCount,                                  // ← MỚI
          matchResult: {
            tier: wt.tier,
            winAmount: effectiveWin,                 // ← ĐÃ NHÂN betCount
          },
          ...
        });
        lineIndex++;
      }
    }
  }
}
```

### 3.2 buildPayoutTiers — Adjusted pairResults

`buildPayoutTiers()` nhận `PairMatchResult[]` (per-unit). Cần tạo adjusted results trước khi truyền:

```typescript
// Tạo adjusted pairResults để buildPayoutTiers gom đúng amount.
// allPairResults vẫn per-unit → nhân betCount per board trước khi build.
const adjustedPairResults: PairMatchResult[] = [];
let pairIdx = 0;
for (const board of boards) {
  const betCount = board.betCount ?? 1;
  const pairs = expandSelectionToPairs(board.playMode, { ... });
  for (let i = 0; i < pairs.length; i++) {
    const pr = allPairResults[pairIdx]!;
    adjustedPairResults.push({
      ...pr,
      wonTiers: pr.wonTiers.map(wt => ({
        ...wt,
        winAmount: wt.winAmount * betCount,
      })),
      winAmount: pr.winAmount * betCount,
    });
    pairIdx++;
  }
}

const payoutTiers = buildPayoutTiers(adjustedPairResults);
```

### 3.3 Checklist Phase 3

- Settle loop: `entryWinAmount += pairResult.winAmount * betCount`
- LineDoc: thêm `betCount`, `matchResult.winAmount = wt.winAmount * betCount`
- buildPayoutTiers: truyền adjusted pairResults (wonTiers.winAmount đã nhân betCount)
- Verify: `Σ(lineDoc.matchResult.winAmount) = entry.payout.winAmount`
- Verify: `entry.payout.payoutAmount = entryWinAmount` (tổng đã nhân betCount)

---

## Phase 4: Entry Repo — Review Aggregate Queries

### 4.1 Tầm ảnh hưởng

**File**: `packages/game-max3dpro-application/src/infras/repos/entry-repo.ts`

Tất cả aggregate queries dùng `$sum: "$lineCount"` cần review:


| Method                                | Hiện dùng                                | Nên dùng                             | Lý do                                                 |
| ------------------------------------- | ---------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `countLinesByDrawId()`                | `$sum: "$lineCount"`                     | **Cân nhắc**                         | Nếu đếm pairs matching → giữ. Nếu đếm bet units → đổi |
| `aggregateOpsSummary()`               | `$sum: "$lineCount"` → totalLines        | **Đổi sang `$sum: "$betUnitCount"`** | KPI phải phản ánh tiền thực                           |
| `aggregateTenantBreakdown()`          | `$sum: "$lineCount"` → lines             | **Đổi sang `$sum: "$betUnitCount"`** | Report tenant phải khớp revenue                       |
| `aggregateTenantSettleMetrics()`      | `$sum: "$lineCount"`                     | Cân nhắc                             | Revenue-related → đổi                                 |
| `aggregateOutstandingMetricsByDraw()` | `$sum: "$lineCount"`                     | **Đổi sang `$sum: "$betUnitCount"`** | Outstanding phải khớp revenue                         |
| `aggregatePlayTypeDistribution()`     | `$sum: "$entrySummary.boards.lineCount"` | Review                               | Tỷ lệ revenue per playType                            |
| `aggregateTripletFrequency()`         | weight dùng lineCount                    | Review                               | Tỷ lệ revenue per triplet                             |
| `aggregateTopPairCombos()`            | N/A                                      | Cân nhắc thêm betCount weight        | Revenue-weighted ranking                              |


### 4.2 Quy tắc review

- **Revenue/tiền cược** → dùng `$sum: "$betUnitCount"` hoặc `$sum: "$amount"`
- **Matching/settle count** → giữ `$sum: "$lineCount"`
- **Khi chia tỷ lệ revenue** → dùng `betUnitCount` thay vì `lineCount`

### 4.3 Checklist Phase 4

- Đọc toàn bộ `entry-repo.ts`
- Liệt kê tất cả methods dùng `lineCount` trong aggregate pipeline
- Phân loại: revenue-related (đổi) vs matching-related (giữ)
- Sửa từng method, cập nhật JSDoc

---

## Phase 5: Backoffice — Hiển thị betCount

### 5.1 Operations Live Feed

**File**: `apps/backoffice/src/app/(main)/games/max3dpro/operations/_lib/sections/analytics/`

- Hiển thị `betCount` badge khi `betCount > 1` trên live feed entries
- KPI "Total Lines" → đổi label thành "Total Bet Units" hoặc hiện cả 2

### 5.2 Tickets / Pending Tickets Pages

- Thêm cột/badge `betCount` per board (hoặc badge `×N` cạnh board)
- Tổng tiền đã phản ánh betCount (từ `entry.amount`)

### 5.3 Operations DTO

**File**: `packages/game-max3dpro-application/src/use-cases/operations/dto/`

- `OpsSummaryOutput`: `totalLines` → `totalBetUnits` (hoặc thêm field mới)
- `TenantBreakdownItem`: `lines` → `betUnits`

### 5.4 Checklist Phase 5

- Live feed UI: badge betCount
- Tickets page: cột/badge betCount per board
- Operations DTO: review + thêm fields
- KPI labels: rõ ràng "Bet Units" vs "Lines"

---

## Phase 6: Game Rules Doc + Tests

### 6.1 Game Rules

**File**: `.cursor/rules/max3dpro-game-rules.mdc`

Cập nhật:

- Section 1 (Tổng quan): thêm "betCount = số lần tham gia dự thưởng per board"
- Section 3 (Giải thưởng): ghi rõ "giá trị giải thưởng áp dụng cho 1 lần, nhân betCount"
- Section 10 (Codebase Map): cập nhật entity fields mới
- Section 12 (Quy tắc cho AI Agent): thêm rule betCount

### 6.2 Tests

**File**: `packages/game-max3dpro-application/test/use-cases/settle-entries.test.ts`

Thêm test cases:

- `matchPair` kết quả vẫn per-unit (không thay đổi)
- Settle với `betCount = 1` → behavior giữ nguyên (regression)
- Settle với `betCount = 3` → `entryWinAmount = matchWinAmount × 3`
- Line doc `winAmount = unitWin × betCount` cho TỪNG giải trong wonTiers
- Line doc có `betCount` field
- `buildPayoutTiers` với adjusted pairResults → `amount` đã nhân betCount
- Entry `betUnitCount = Σ(lineCount × betCount)`
- Test case pair trúng NHIỀU giải + betCount > 1 → tổng thưởng = Σ(wonTier.winAmount × betCount)

---

## Phase 7: Backward Compatibility

### 7.1 Data Migration (entries cũ)

Entries cũ không có `betCount` / `betUnitCount`. Xử lý:

- **Code**: mọi nơi đọc `betCount` phải dùng `?? 1` (default)
- **Code**: mọi nơi đọc `betUnitCount` phải dùng `?? lineCount` (fallback)
- **Migration script** (optional): `db.max3d_pro_ticket_entries.updateMany({ betUnitCount: { $exists: false } }, { $set: { betUnitCount: "$lineCount" } })`

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


| Phase              | Files                                                         | Mức             |
| ------------------ | ------------------------------------------------------------- | --------------- |
| 1. Entity          | `types.ts`, `defaults.ts`, `ticket.ts`, `entry.ts`, `line.ts` | Nhỏ             |
| 1.5. BO Config     | `schema.ts`, `play-rules-section.tsx`                         | Nhỏ             |
| 2. Place Bet       | `place-bet.ts` (handler), DTO, `place-bet.ts` (use case)      | Trung bình      |
| 3. Settle          | `settle-entries.ts`                                           | Critical        |
| 4. Entry Repo      | `entry-repo.ts` (~10 aggregate queries)                       | Trung bình      |
| 5. Backoffice Ops  | 4-5 UI files + DTO                                            | Nhỏ             |
| 6. Docs + Tests    | `max3dpro-game-rules.mdc`, `settle-entries.test.ts`           | Trung bình      |
| 7. Backward Compat | Across all files                                              | Nhỏ (checklist) |


---

## Khác biệt chính so với plan Max 3D


| Điểm                        | Max 3D                                   | Max 3D Pro                                                              |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Play modes                  | basic + plus                             | multiNumber + multiDigit                                                |
| Board schemas               | 2 schemas (basic/plus)                   | 2 schemas (multiNumber/multiDigit) — discriminated union by playMode    |
| Line expansion              | combo perms                              | P(n,2) ordered pairs / Cartesian product                                |
| Match function              | `matchBoard()` → per-board lineResults   | `matchPair()` → PairMatchResult với **wonTiers[]** (nhiều giải)         |
| Prize tiers                 | 2 enums (BasicPrizeTier + PlusPrizeTier) | 1 enum (PrizeTier, 8 hạng)                                              |
| Settle: betCount nhân       | `boardMatch.winAmount * betCount`        | `pairResult.winAmount * betCount` + nhân TỪNG `wt.winAmount * betCount` |
| Line docs từ settle         | 1 lineResult → 1 lineDoc                 | 1 wonTier → 1 lineDoc (pair trúng 3 giải → 3 lineDocs)                  |
| buildPayoutTiers input      | `BoardMatchResult[]` adjusted            | `PairMatchResult[]` adjusted                                            |
| BoardSelection              | `{ triplets }`                           | `{ triplets, frontDigits?, backDigits? }`                               |
| Entry snapshot extra fields | Không                                    | `frontDigits?`, `backDigits?`                                           |
| PlayRules extra fields      | Không                                    | `multiNumberMin`, `multiNumberMax`                                      |


