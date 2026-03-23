# Changelog

Tất cả thay đổi đáng chú ý của `@megawin/player-sdk` được ghi tại đây.

---

## [1.0.12] - 2026-03-23

### Breaking Changes

#### `Bingo18BasicBoard` — Thêm `boardNo` (required) và đổi `kind` → `tripleKind`.

```ts
// TRƯỚC (SAI — handler bắt buộc boardNo, không có kind):
const board: Bingo18BasicBoard = {
  playType: "tripleMatch",
  kind: "specific", // ← sai tên
  number: 5,
};

// SAU:
const board: Bingo18BasicBoard = {
  boardNo: "A", // ← bắt buộc, mỗi vé tối đa 6 boards
  playType: "tripleMatch",
  tripleKind: "specific", // ← đúng tên theo handler
  number: 5,
};
```

#### `Max3dproBoardInput` — Tách thành discriminated union, thêm `playType: "straight"` (required)

```ts
// TRƯỚC (SAI — thiếu playType, triplets/frontDigits/backDigits optional sai):
const board: Max3dproBoardInput = {
  boardNo: "A",
  playMode: "multiNumber",
  triplets: ["123", "456"],
};

// SAU — multiNumber:
const board: Max3dproMultiNumberBoardInput = {
  boardNo: "A",
  playMode: "multiNumber",
  playType: "straight", // ← bắt buộc
  triplets: ["123", "456", "789"],
};

// SAU — multiDigit:
const board: Max3dproMultiDigitBoardInput = {
  boardNo: "B",
  playMode: "multiDigit",
  playType: "straight", // ← bắt buộc
  frontDigits: [1, 2, 3],
  backDigits: [4, 5, 6],
};
```

**Migration Guide:** Cập nhật tất cả nơi tạo `Max3dproBoardInput` để thêm `playType: "straight"` và dùng đúng interface theo `playMode`.

**Types mới được export:**

- `Max3dproMultiNumberBoardInput`
- `Max3dproMultiDigitBoardInput`

`Max3dproBoardInput` vẫn tồn tại là union type của hai interface trên.

---

## [1.0.11] - 2026-03-23

### Breaking Changes

#### `{Game}TicketPurchaseInput` — Đổi `drawId` + `drawCount` thành `drawIds: string[]` (5 games)

Các game Mega 6/45, Lotto 5/35, Power 6/55, Max 3D, Max 3D Pro đã dùng `drawIds: string[]` tại handler từ trước. SDK type bị khai báo sai là `drawId + drawCount`. Từ v1.0.11 SDK đã đồng bộ đúng với handler.

| Game       | Type bị thay đổi              |
| ---------- | ----------------------------- |
| Mega 6/45  | `Mega645TicketPurchaseInput`  |
| Lotto 5/35 | `Lotto535TicketPurchaseInput` |
| Power 6/55 | `Power655TicketPurchaseInput` |
| Max 3D     | `Max3dTicketPurchaseInput`    |
| Max 3D Pro | `Max3dproTicketPurchaseInput` |

**Migration Guide:**

```ts
// TRƯỚC (v1.0.10 trở về trước — SAI, handler trả 400):
client.mega645.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 3,
  boards: [...],
});

// SAU (v1.0.11+):
client.mega645.placeBet({
  drawIds: ["2026-03-07.001", "2026-03-14.001", "2026-03-21.001"],
  boards: [...],
});
```

Tương tự cho `client.lotto535`, `client.power655`, `client.max3d`, `client.max3dpro`.

> Lưu ý: `drawIds` là mảng các drawId cụ thể muốn tham gia, **không phải** drawId bắt đầu + số kỳ liên tiếp. Tối đa 6 kỳ mỗi vé.

---

## [1.0.10] - 2026-03-22

### Breaking Changes

#### `PlaceBetResponse` — Bổ sung đầy đủ fields (tất cả games)

Trước đây `{Game}PlaceBetResponse` chỉ trả về 3 fields tối thiểu. Từ v1.0.10, response trả về đầy đủ thông tin vé vừa tạo để hiển thị ngay mà không cần gọi thêm API:

| Game       | Type                       |
| ---------- | -------------------------- |
| Keno       | `KenoPlaceBetResponse`     |
| Lotto 5/35 | `Lotto535PlaceBetResponse` |
| Mega 6/45  | `Mega645PlaceBetResponse`  |
| Power 6/55 | `Power655PlaceBetResponse` |
| Max 3D     | `Max3dPlaceBetResponse`    |
| Max 3D Pro | `Max3dproPlaceBetResponse` |
| Bingo 18   | `Bingo18PlaceBetResponse`  |

**Fields mới được thêm vào tất cả `PlaceBetResponse`:**

```ts
// TRƯỚC (v1.0.9 trở về trước):
interface XxxPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number; // chỉ 3 fields
}

// SAU (v1.0.10+):
interface XxxPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  status: string; // thêm
  drawPlan: {
    drawIds: string[]; // thêm — danh sách kỳ đã đăng ký
    drawCount: number; // thêm
  };
  pricing: {
    unitPrice: number;
    // ...              // xem chi tiết theo từng game
    totalAmount: number;
  };
  boardCount: number; // thêm
  entryCount: number; // thêm
}
```

> `totalAmount` vẫn tồn tại trong `pricing.totalAmount`. Nếu code cũ dùng `result.totalAmount`, phải cập nhật sang `result.pricing.totalAmount`.

---

#### `KenoPlaceBetResponse.pricing` — Đổi tên field

| Field cũ      | Field mới           | Ghi chú                        |
| ------------- | ------------------- | ------------------------------ |
| `betsPerDraw` | `selectionsPerDraw` | Số boards + side bets mỗi kỳ   |
| _(không có)_  | `betUnitsPerDraw`   | Tổng đơn vị cược = Σ(betCount) |

```ts
// TRƯỚC:
result.pricing.betsPerDraw; // SAI — không còn tồn tại

// SAU:
result.pricing.selectionsPerDraw; // số selections (boards + sideBets) mỗi kỳ
result.pricing.betUnitsPerDraw; // tổng đơn vị cược = Σ(board.betCount) + Σ(sideBet.betCount)
```

Tương tự, `KenoTicketSummary.pricing` (trong `listPendingTickets`, `listTickets`) cũng đổi tên theo:

- `betsPerDraw` → `selectionsPerDraw`
- Thêm mới `betUnitsPerDraw`

---

#### `betCount` trong board/sideBet summary — Bắt buộc (required)

`betCount` trong các summary type (trả về từ `getTicketEntries`, `listTickets`...) đã đổi từ optional sang **required**:

| Game       | Type                                | Field bị ảnh hưởng |
| ---------- | ----------------------------------- | ------------------ |
| Keno       | `KenoBasicBoardSummary`             | `betCount: number` |
| Keno       | `KenoSideBetSummary`                | `betCount: number` |
| Keno       | `KenoEntryInfo.boards[].betCount`   | `betCount: number` |
| Keno       | `KenoEntryInfo.sideBets[].betCount` | `betCount: number` |
| Lotto 5/35 | `Lotto535BoardSummary`              | `betCount: number` |
| Mega 6/45  | `Mega645BoardSummary`               | `betCount: number` |
| Power 6/55 | `Power655BoardSummary`              | `betCount: number` |
| Max 3D     | `Max3dBoardSummary`                 | `betCount: number` |
| Max 3D Pro | `Max3dproBoardSummary`              | `betCount: number` |
| Bingo 18   | `Bingo18BoardSummary`               | `betCount: number` |
| Bingo 18   | `Bingo18SideBetSummary`             | `betCount: number` |

**Lưu ý**: `betCount` trong **input** (khi place bet) vẫn là optional, mặc định = 1.

---

#### `GameRules` — Thêm `minBetCount` và `maxBetCount`

Tất cả `{Game}GameRules` (trong `getGameConfig` response) đã thêm 2 fields mới:

```ts
interface XxxGameRules {
  // ...fields cũ...
  minBetCount: number; // thêm — số lần cược tối thiểu (thường = 1)
  maxBetCount: number; // thêm — số lần cược tối đa cho 1 board/side bet
}
```

Áp dụng cho tất cả games: Keno, Lotto 5/35, Mega 6/45, Power 6/55, Max 3D, Max 3D Pro, Bingo 18.

---

### Added

- **Bingo 18**: `Bingo18ListPendingTicketsParams` — tham số phân trang cho `listPendingTickets` (chỉ `size` + `cursor`, không hỗ trợ lọc ngày)
- **Bingo 18**: `Bingo18ListAllTicketsParams` — tham số lọc và phân trang cho `listTickets` (thêm `from` + `to`)

### Migration Guide

#### 1. `PlaceBetResponse.totalAmount` đã chuyển vào `pricing`

```ts
// TRƯỚC:
const result = await client.lotto535.placeBet({ ... });
console.log(result.totalAmount); // number — SAI, không còn ở root

// SAU:
console.log(result.pricing.totalAmount); // ✓
```

#### 2. `KenoTicketSummary` và `KenoPlaceBetResponse`: đổi tên field pricing

```ts
// TRƯỚC:
ticket.pricing.betsPerDraw; // SAI — không còn tồn tại

// SAU:
ticket.pricing.selectionsPerDraw; // số boards + sideBets mỗi kỳ
ticket.pricing.betUnitsPerDraw; // tổng đơn vị cược mỗi kỳ
```

#### 3. `betCount` trong summary giờ không thể undefined

```ts
// TRƯỚC — cần check optional:
const count = board.betCount ?? 1;

// SAU — luôn có giá trị:
const count = board.betCount; // number, không cần fallback
```

---

#### `KenoCurrentDrawResponse` — Xóa field `lastResult`

Field `lastResult` đã bị **xóa** khỏi response của `getCurrentDraw()` (Keno).
API không trả về field này — nếu code cũ truy cập `data.lastResult`, giá trị thực tế luôn là `undefined`.
Để lấy kết quả kỳ gần nhất, dùng `listDrawResults()`.

```ts
// TRƯỚC — field tồn tại trong type nhưng API không bao giờ trả về:
const data = await client.keno.getCurrentDraw();
data.lastResult; // luôn undefined, TypeScript nay báo lỗi

// SAU — dùng listDrawResults để lấy kết quả gần nhất:
const results = await client.keno.listDrawResults({ size: 1 });
const lastResult = results.items[0]; // ✓
```

---

## [1.0.9] - 2026-03-13

### Added

- **Power 6/55**: `Power655PlayType.Bao5` (`"bao5"`) — loại hình chơi mới: chọn 5 số, hệ thống ghép từng số trong 50 số còn lại (55-5=50) → 50 bộ số dự thưởng. Giá vé = 500.000đ / kỳ.

### Fixed

- **Power 6/55**: Đã bổ sung `Bao5` vào `Power655PlayType` enum (thiếu trong 1.0.8). Backend đã hỗ trợ Bao 5 từ trước, SDK nay đồng bộ lại.

---

## [1.0.8] - 2026-03-13

### Added

- **Power 6/55**: `client.power655.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/power655/draw-results`)
- **Power 6/55**: `client.power655.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/power655/draw-results/{drawId}`)
- **Max 3D**: `client.max3d.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/max3d/draw-results`)
- **Max 3D**: `client.max3d.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/max3d/draw-results/{drawId}`)
- **Max 3D Pro**: `client.max3dpro.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/max3dpro/draw-results`)
- **Max 3D Pro**: `client.max3dpro.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay (`GET /games/max3dpro/draw-results/{drawId}`)
- **Bingo 18**: `client.bingo18.listDrawResults(params?)` — lấy danh sách kết quả kỳ quay đã công bố (`GET /games/bingo18/draw-results`)
- **Bingo 18**: `client.bingo18.getDrawResult(drawId)` — lấy chi tiết kết quả 1 kỳ quay, bao gồm `basicPrizes` và `sideBetPrizes` (`GET /games/bingo18/draw-results/{drawId}`)
- **Power 6/55**: New types `Power655DrawResultSummary`, `Power655DrawResultInfo`, `Power655DrawTierPrize`, `Power655LineInfo`, `Power655ListDrawResultsParams`, `Power655ListDrawResultsResponse`
- **Max 3D**: New types `Max3dDrawResultSummary`, `Max3dDrawResultInfo`, `Max3dDrawTierPrize`, `Max3dLineInfo`, `Max3dListDrawResultsParams`, `Max3dListDrawResultsResponse`
- **Max 3D Pro**: New types `Max3dproDrawResultSummary`, `Max3dproDrawResultInfo`, `Max3dproDrawTierPrize`, `Max3dproLineInfo`, `Max3dproListDrawResultsParams`, `Max3dproListDrawResultsResponse`
- **Bingo 18**: New types `Bingo18DrawResultSummary`, `Bingo18DrawResultInfo`, `Bingo18DrawBasicPrize`, `Bingo18DrawSideBetPrize`, `Bingo18ListDrawResultsParams`, `Bingo18ListDrawResultsResponse`

### Changed

- **BREAKING — Power 6/55**: `Power655EntryLinesResponse` đã được cập nhật để khớp chính xác với API response:
  - Thêm `drawId: string` — ID kỳ quay
  - Thêm `nextCursor: number | null` — cursor phân trang (integer line index)
  - Thêm `size: number` — số lines thực tế trả về trong trang
  - `lines[]` đổi từ `Array<{ mainNumbers: number[] }>` sang `Array<Power655LineInfo>`:
    - `main: string[]` thay vì `mainNumbers: number[]` — mảng string zero-padded (VD: `"01"-"55"`) thay vì number
    - Thêm `boardNo: string` — board mà line này thuộc về
    - Thêm `lineIndex: number` — vị trí line trong entry (0-based)
    - Thêm `matchResult` — kết quả đối chiếu sau khi kỳ quay kết thúc (gồm `mainMatchCount`, `bonusMatched`, `tier`, `prizeAmount`)

- **BREAKING — Max 3D**: `Max3dEntryLinesResponse` đã được cập nhật để khớp chính xác với API response:
  - Thêm `drawId: string`, `nextCursor: number | null`, `size: number`
  - `lines[]` đổi từ `Array<{ triplet: string }>` sang `Array<Max3dLineInfo>`:
    - `triplets: string[]` thay vì `triplet: string` — mảng bộ ba số
    - Thêm `boardNo`, `lineIndex`, `playMode`, `playType`, `matchResult`

- **BREAKING — Max 3D Pro**: `Max3dproEntryLinesResponse` đã được cập nhật tương tự Max 3D:
  - Thêm `drawId: string`, `nextCursor: number | null`, `size: number`
  - `lines[]` đổi từ `Array<{ first: string; second: string }>` sang `Array<Max3dproLineInfo>`

- **BREAKING — Max 3D**: `Max3dTicketEntriesResponse.entries[].result` đã sửa để khớp với kết quả quay số thực tế:
  - Cũ: `{ firstPrize: string; secondPrize: string; publishedAt: string }`
  - Mới: `{ special: string[]; first: string[]; second: string[]; third: string[]; publishedAt: string }` — khớp với 20 bộ ba chia 4 hạng giải (đặc biệt, nhất, nhì, ba)

- **BREAKING — Max 3D Pro**: `Max3dproTicketEntriesResponse.entries[].result` đã sửa tương tự Max 3D:
  - Cũ: `{ firstPrize: string; secondPrize: string; publishedAt: string }`
  - Mới: `{ special: string[]; first: string[]; second: string[]; third: string[]; publishedAt: string }`

### Removed

- **BREAKING — Mega 6/45**: `Mega645PlayType.QuickPick` (`"quickPick"`) đã bị xóa. API handler không còn chấp nhận giá trị này, mọi request với `playType: "quickPick"` sẽ bị từ chối (`VALIDATION_ERROR`). Thay bằng: chọn số thủ công với `Standard` hoặc `Bao*` play types.
- **BREAKING — Power 6/55**: `Power655PlayType.QuickPick` (`"quickPick"`) đã bị xóa. Lý do giống Mega 6/45.
- **BREAKING — Lotto 5/35**: `Lotto535PlayType.QuickPick` (`"quickPick"`) đã bị xóa. Lý do giống trên.
- **BREAKING — Max 3D**: `Max3dPlayType.QuickPick` (`"quickPick"`) đã bị xóa. API handler chỉ chấp nhận `straight`, `combo3`, `combo6`.

### Migration Guide

#### QuickPick đã bị loại bỏ

```ts
// TRƯỚC (sẽ bị VALIDATION_ERROR):
await client.mega645.placeBet({
  drawIds: ["2026-03-07.001"],
  boards: [{ boardNo: "A", playType: "quickPick", selection: { mainNumbers: [] } }],
});

// SAU — chọn số thủ công:
await client.mega645.placeBet({
  drawIds: ["2026-03-07.001"],
  boards: [
    {
      boardNo: "A",
      playType: "standard",
      selection: { mainNumbers: ["05", "12", "23", "34", "40", "45"] },
    },
  ],
});
```

#### Power 6/55 `getEntryLines` response đã đổi

```ts
// TRƯỚC:
const { lines } = await client.power655.getEntryLines(entryId);
for (const line of lines) {
  console.log(line.mainNumbers); // number[] — SAI
}

// SAU (v1.0.8):
const { lines, nextCursor } = await client.power655.getEntryLines(entryId, { size: 50 });
for (const line of lines) {
  console.log(line.main); // string[] — VD: ["03", "11", "25"]
  console.log(line.boardNo); // "A"
  console.log(line.matchResult?.tier); // "jackpot1" | "tier1" | null
}
```

#### Max 3D `getTicketEntries` entry result đã đổi

```ts
// TRƯỚC:
entry.result?.firstPrize; // string — SAI, không tồn tại
entry.result?.secondPrize; // string — SAI, không tồn tại

// SAU (v1.0.8):
entry.result?.special; // string[] — VD: ["123", "456", ...]  (bộ ba hạng Đặc Biệt)
entry.result?.first; // string[] — VD: ["789", ...]         (bộ ba hạng Nhất)
entry.result?.second; // string[] — ...                      (bộ ba hạng Nhì)
entry.result?.third; // string[] — ...                      (bộ ba hạng Ba)
```

---

## [1.0.7] - 2026-03-01

Initial tracked release.
