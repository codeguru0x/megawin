# Changelog

Mọi thay đổi đáng chú ý của `@megawin/player-sdk` được ghi tại đây.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/).

---

## [1.0.21] - 2026-09-01

Cập nhật document và type của các API.

---

### Migration

```ts
// Trạng thái vé/entry — cập nhật theo union literal mới (Keno, Bingo18, Mega645, Lotto535, Power655)
if (ticket.status === "voided") { ... }   // Trước
if (ticket.status === "void") { ... }     // Sau

// Trạng thái vé/entry giờ dùng type dùng chung — import trực tiếp từ root package, không cần
// import lại theo từng game (Keno, Max3d, Max3dPro, Bingo18, Mega645, Lotto535, Power655)
import { TicketStatus, EntryStatus, EntryOutcome } from "@megawin/player-sdk";

if (ticket.status === TicketStatus.Completed) { ... }
if (entry.outcome === EntryOutcome.Win) { ... }

// Mega645/Power655/Max3dPro — outcome giờ đầy đủ "void" (kỳ quay bị huỷ), trước đây có thể
// thiếu giá trị này (bị bỏ sót trong union hoặc khai `string` trần)
if (entry.outcome === "void") { /* entry bị huỷ, tiền cược đã hoàn */ }

// getTicketEntries() không còn trả `ticket` (Keno, Max3d, Bingo18, Mega645, Lotto535, Power655)
const data = await client.<game>.getTicketEntries(ticketId);
console.log(data.ticket.ticketNo);                    // Trước — lỗi, field không tồn tại
console.log(data.entries[0]?.entrySummary.ticketNo);  // Sau

// placeBet() — input dùng drawIds (Max3d, Mega645, Power655, Max3dPro)
await client.<game>.placeBet({ drawId: "...", drawCount: 2, boards: [...] });   // Trước
await client.<game>.placeBet({ drawIds: ["...", "..."], boards: [...] });        // Sau

// placeBet() response — tổng tiền nằm trong pricing (Mega645, Power655)
console.log(result.totalAmount);          // Trước
console.log(result.pricing.totalAmount);  // Sau

// Bingo 18 — range Lớn/Hòa/Nhỏ đổi hoàn toàn, RÀ SOÁT lại mọi logic hiển thị hardcode theo range cũ
if (bet === "big") { /* Trước: hiểu là Tài 11-18. Sau: Lớn 12-18 */ }

// Mega645/Power655 — jackpot không còn nằm trong getCurrentDraw()
const draw = await client.mega645.getCurrentDraw();
console.log(draw.currentDraw?.jackpotCurrentAmount);  // Trước — lỗi, field không tồn tại
const jackpot = await client.mega645.getJackpot();    // Sau — gọi riêng
console.log(jackpot.currentAmount);

// client.player.getBalance() đã bị xoá hoàn toàn (không tồn tại backend)
const balance = await client.player.getBalance();  // Trước — lỗi, client.player không tồn tại
const result = await client.keno.placeBet({ ... }); // Sau — đọc balance từ response có ảnh hưởng ví
console.log(result.balance);
```

---

## [1.0.20] - 2026-08-13

### Added — `client.game.jackpots.list()`

API GỘP cross-game: lấy jackpot hiện tại của TẤT CẢ game có jackpot (Lotto 5/35, Mega 6/45, Power 6/55) trong 1 request. Thay cho việc gọi lần lượt `client.lotto535.getJackpot()`, `client.mega645.getJackpot()`, `client.power655.getJackpot()`. Phù hợp widget "Jackpot đang tích luỹ" ở trang chủ.

- `JackpotSummaryListResponse` — `{ jackpots: JackpotSummary[] }`. Chỉ trả game đang có active cycle; game chưa mở jackpot bị bỏ qua (không lỗi).
- `JackpotSummary` — thiết kế hybrid: field CHUNG chuẩn hoá (`gameProduct`, `displayName`, `primaryAmount`, `cycleNo`, `drawCount`, `startDrawId`) đủ render danh sách nhanh + `details` discriminated theo `gameProduct` chứa phần đặc thù.
- `JackpotDetails` — discriminated union: `Lotto535JackpotDetails | Mega645JackpotDetails | Power655JackpotDetails`. KHÔNG tự narrow được (không có discriminator riêng trong `details`) — narrow qua `JackpotSummary.gameProduct` ở tầng ngoài, TypeScript tự suy ra `details` đúng type con.
- `JackpotGameProduct` — const object (3 game jackpot), dùng thay string trần khi so sánh.
- `primaryAmount` — jackpot chính: lotto535/mega645 là `currentAmount`, power655 là `jackpot1CurrentAmount` (JP1). JP2 nằm trong `Power655JackpotDetails.jackpot2CurrentAmount`.
- Field trong `details` đặt tên mirror đúng response getJackpot riêng từng game — không phát sinh tên khác.

Import qua subpath `@megawin/player-sdk/game` hoặc từ root barrel.

```ts
const { jackpots } = await client.game.jackpots.list();

for (const jp of jackpots) {
  console.log(`${jp.displayName}: ${jp.primaryAmount.toLocaleString()} VND`);

  if (jp.gameProduct === "power655") {
    console.log(`  JP2: ${jp.details.jackpot2CurrentAmount.toLocaleString()} VND`);
  } else if (jp.gameProduct === "lotto535") {
    const { percentage, reachedSplitThreshold } = jp.details.progress;
    console.log(
      `  Tiến trình chia: ${percentage}%`,
      reachedSplitThreshold ? "(đã chạm ngưỡng)" : "",
    );
  }
}
```

### Changed — `Lotto535JackpotResponse.progress`

Thêm `reachedSplitThreshold: boolean` vào `progress`. Phản ánh vế "đã đủ tiền chia" (`currentAmount >= splitThreshold`) — nhất quán giữa `client.lotto535.getJackpot()` và `client.game.jackpots.list()`. Kỳ CHIA thực tế vẫn cần thêm điều kiện kỳ 21h + không ai trúng Jackpot (thông tin đó lấy từ `getCurrentDraw`).

### Removed — `Power655JackpotResponse.startedAt` (BREAKING)

Xoá `startedAt` khỏi response `client.power655.getJackpot()`.

Cần mốc thời gian bắt đầu cycle thì dùng `startDrawId` (format `YYYY-MM-DD.NNN` — đã chứa ngày kỳ quay đầu cycle).

**Migration**

```ts
// Trước
const jp = await client.power655.getJackpot();
const started = new Date(jp.startedAt);

// Sau — lấy ngày từ startDrawId
const jp = await client.power655.getJackpot();
const started = new Date(jp.startDrawId.split(".")[0]); // "2026-01-28"
```

---

## [1.0.19] - 2026-08-10

### Added — `client.keno.getComboPopularity`

Kiểm tra độ đông 1 bộ số cappable (pick8/9/10) player đã cược — bao nhiêu bộ khác đang chơi cùng combo, để minh bạch cách chia giải khi vượt cap.

- `KenoComboPopularityParams` — `{ drawId, numbers }`. `numbers`: 8–10 số distinct, zero-padded `"01"`–`"80"`.
- `KenoComboPopularityResponse` — `{ found, sets? }`. `sets` là tổng số bộ đang cược cùng combo (Σ betCount) — tín hiệu độ đông tham khảo, KHÔNG phải mẫu số chia giải (mẫu số chia khi vượt cap là số bộ TRÚNG lúc settle).

**Ownership-gate:** chỉ xem được combo mình đã cược. Combo chưa cược hoặc chưa ai chơi đều trả `{ found: false }`, không phân biệt.

```ts
const res = await client.keno.getComboPopularity({
  drawId: "2026-03-07.001",
  numbers: ["01", "05", "12", "23", "34", "45", "56", "67", "78", "80"],
});
if (res.found) console.log(`${res.sets} bộ đang cược combo này`);
```

---

### Added — `client.mega645.getComboPopularity`

Kiểm tra độ đông 1 bộ số player đã cược; nếu là bộ 6 số standard, trả thêm mẫu số chia Jackpot thật khi trúng.

- `Mega645ComboPopularityParams` — `{ drawId, numbers }`. `numbers`: 5–18 số distinct, zero-padded `"01"`–`"45"` (số lượng khớp playType: 5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18).
- `Mega645ComboPopularityResponse` — `{ found, sets?, jackpotUnits? }`. `jackpotUnits` chỉ có ở bộ 6 số standard, dùng tính tiền jackpot **tạm tính**: `Math.floor(currentAmount / jackpotUnits) × betCount` (kết hợp `getJackpot()`).

**Ownership-gate:** giống Keno — chỉ xem bộ đã cược, `found: false` không phải error.

```ts
const res = await client.mega645.getComboPopularity({
  drawId: "2026-03-08.001",
  numbers: ["01", "05", "12", "23", "34", "45"], // standard 6 số
});
if (res.found && res.jackpotUnits) {
  const { currentAmount } = await client.mega645.getJackpot();
  console.log(`Tạm tính nếu trúng ngay: ${Math.floor(currentAmount / res.jackpotUnits) * 1} VND`);
}
```

---

### Added — `client.power655.getComboPopularity`

Kiểm tra độ đông 1 bộ số player đã cược; nếu là bộ 6 số standard, trả thêm mẫu số chia Jackpot 1 thật khi trúng.

- `Power655ComboPopularityParams` — `{ drawId, numbers }`. `numbers`: 5–18 số distinct, zero-padded `"01"`–`"55"` (số lượng khớp playType: 5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18).
- `Power655ComboPopularityResponse` — `{ found, sets?, jackpotUnits? }`. `jackpotUnits` chỉ có ở bộ 6 số standard, là mẫu số chia **Jackpot 1** (6/6), dùng tính tiền jackpot **tạm tính**: `Math.floor(jackpot1CurrentAmount / jackpotUnits) × betCount` (kết hợp `getJackpot()`). Không áp dụng cho Jackpot 2 (5/6 + bonus).

**Ownership-gate:** giống Keno — chỉ xem bộ đã cược, `found: false` không phải error.

```ts
const res = await client.power655.getComboPopularity({
  drawId: "2026-03-08.001",
  numbers: ["01", "05", "12", "23", "34", "45"], // standard 6 số
});
if (res.found && res.jackpotUnits) {
  const { jackpot1CurrentAmount } = await client.power655.getJackpot();
  console.log(
    `Tạm tính nếu trúng Jackpot 1 ngay: ${Math.floor(jackpot1CurrentAmount / res.jackpotUnits) * 1} VND`,
  );
}
```

---

### Added — `client.lotto535.getComboPopularity`

Kiểm tra độ đông 1 bộ số player đã cược; nếu là bộ CHUẨN (5 chính + 1 ĐB), trả thêm mẫu số chia Jackpot thật khi trúng.

- `Lotto535ComboPopularityParams` — `{ drawId, numbers, specials }`. `numbers`: 4–15 số chính distinct `"01"`–`"35"`; `specials`: 1–12 số đặc biệt distinct `"01"`–`"12"` (tổ hợp phải khớp 1 trong 4 playType).
- `Lotto535ComboPopularityResponse` — `{ found, sets?, jackpotUnits?, splitEligibleDraw? }`. `jackpotUnits` chỉ có ở bộ CHUẨN, dùng tính tiền jackpot **tạm tính**: `Math.floor(currentAmount / jackpotUnits) × betCount` (kết hợp `getJackpot()`). `splitEligibleDraw` chỉ báo kỳ có split cycle (JP ≥ ngưỡng + kỳ 21h) — không có số dự tính, pool chỉ biết sau khi có kết quả.

**Ownership-gate:** giống Keno — chỉ xem bộ đã cược, `found: false` không phải error.

```ts
const res = await client.lotto535.getComboPopularity({
  drawId: "2026-03-07.001",
  numbers: ["01", "08", "15", "22", "35"],
  specials: ["07"],
});
if (res.found && res.jackpotUnits) {
  const { currentAmount } = await client.lotto535.getJackpot();
  console.log(
    `Tạm tính nếu trúng Jackpot ngay: ${Math.floor(currentAmount / res.jackpotUnits) * 1} VND`,
  );
}
```

---

## [1.0.18] - 2026-05-17

### Changed — `boardNo` hỗ trợ số board động (tất cả games)

`boardNo` không còn giới hạn cứng theo danh sách chữ cái cố định (VD `"A"`–`"F"` hay `"A"`–`"D"`). Board giờ sinh tự động theo thứ tự chữ cái kiểu bảng tính: `"A"`, `"B"`, ..., `"Z"`, `"AA"`, `"AB"`, ... Số board tối đa mỗi vé do cấu hình game quyết định, không hard-code.

Type không đổi (`boardNo: string`) — thuần cập nhật JSDoc, **không breaking**. Tenant gửi nhiều hơn số board cũ (nếu game cho phép) chỉ cần tiếp tục đánh `boardNo` liên tục từ `"A"`, không skip, không trùng.

Áp dụng cho tất cả games. Field cấu hình giới hạn board:

| Game       | SDK type                                                        | Field giới hạn            |
| ---------- | --------------------------------------------------------------- | ------------------------- |
| Keno       | `KenoBoardInput`                                                | `maxBasicBoardsPerTicket` |
| Lotto 5/35 | `Lotto535BoardInput`                                            | `maxBoardsPerTicket`      |
| Mega 6/45  | `Mega645BoardInput`                                             | `maxBoardsPerTicket`      |
| Power 6/55 | `Power655BoardInput`                                            | `maxBoardsPerTicket`      |
| Max 3D     | `Max3dBoardInput`                                               | `maxBoardsPerTicket`      |
| Max 3D Pro | `Max3dproMultiNumberBoardInput`, `Max3dproMultiDigitBoardInput` | `maxBoardsPerTicket`      |
| Bingo 18   | `Bingo18BoardInput`                                             | `maxBasicBoardsPerTicket` |

```ts
// Board đánh liên tục từ "A", số lượng theo cấu hình game
await client.mega645.placeBet({
  drawIds: ["2026-03-07.001"],
  boards: [
    { boardNo: "A" /* ... */ },
    { boardNo: "B" /* ... */ },
    // ... "C", "D", ... tối đa theo maxBoardsPerTicket
  ],
});
```

---

## [1.0.16] - 2026-04-17

### Added

#### `placeBet()` — thêm `balance` vào response (tất cả games)

Tất cả `PlaceBetResponse` giờ trả thêm `balance: number` — số dư ví player sau khi trừ tiền cược (VND). Tenant dùng field này để cập nhật UI ngay sau khi cược, không cần gọi thêm API lấy số dư.

Áp dụng cho: `KenoPlaceBetResponse`, `Lotto535PlaceBetResponse`, `Mega645PlaceBetResponse`, `Power655PlaceBetResponse`, `Max3dPlaceBetResponse`, `Max3dproPlaceBetResponse`, `Bingo18PlaceBetResponse`.

```ts
const result = await client.keno.placeBet({ ... });
console.log(result.balance); // 990000
```

---

## [1.0.15] - 2026-03-25

### Fixed — Đồng bộ SDK types với API thực tế (tất cả games)

#### `getTicketEntries()` — bỏ `ticket` wrapper khỏi response

`KenoTicketEntriesResponse`, `Bingo18TicketEntriesResponse`, `Max3dproTicketEntriesResponse` khai báo sai — API chỉ trả `{ entries }`, không wrap thêm `ticket`. Đã align với `PlayerGetTicketEntriesOutput`.

**Migration:**

```ts
// Trước (≤ v1.0.14):
const { ticket, entries } = await client.keno.getTicketEntries(ticketId);

// Sau (v1.0.15+) — tương tự bingo18, max3dpro:
const { entries } = await client.keno.getTicketEntries(ticketId);
```

#### `EntryResult` / `EntryInfo` — xoá `drawDate`

`drawDate` không tồn tại trong `TicketEntryDoc` — entry chỉ có `drawId`. Đã xoá khỏi `KenoEntryInfo`, `Mega645EntryResult`, `Lotto535EntryResult`, `Power655EntryResult`.

#### `Max3dproTicketSummary.voidSummary` — sửa cấu trúc từ board-level sang draw-level

Max 3D Pro void theo draw, không phải board. Shape cũ sai hoàn toàn.

**Migration:**

```ts
// Trước (≤ v1.0.14):
voidSummary?: { isFullVoid: boolean; voidedBoards: string[]; originalAmount: number; refundAmount: number; voidedAt: string }

// Sau (v1.0.15+):
voidSummary?: { totalVoidedAmount: number; totalRefundedAmount: number; voidedDrawCount: number; voidedDrawIds: string[]; lastVoidedAt?: string }
```

#### `Max3dproEntryResult` — thêm `outcome`, `payoutAmount`, mở rộng `payout.tiers`

Các fields này đã có trong API response nhưng thiếu trong SDK:

```ts
outcome?: "win" | "loss"

// payout.tiers — thêm hitCount + unitAmount cho khớp với EntryPayoutTier:
tiers: Array<{ tier: string; hitCount: number; unitAmount: number; amount: number }>
```

#### `Max3dproLineInfo` — thêm `betCount`

`PlayerLineInfo` trả `betCount` nhưng SDK thiếu field này.

---

### Fixed — Mega 6/45

#### `Mega645EntryResult.result.winningNumbers`: `number[]` → `string[]`

Đổi sang zero-padded string (`"01"`–`"45"`) cho nhất quán với toàn bộ hệ thống.

**Migration:**

```ts
// Trước (≤ v1.0.13):
result.winningNumbers.join(", "); // "6, 12, 25"

// Sau (v1.0.14+):
result.winningNumbers.join(", "); // "06, 12, 25"
```

#### `Mega645EntryLinesResponse`: viết lại + thêm `Mega645LineInfo`

Interface cũ chỉ có `entryId` và `lines: Array<{ numbers: number[] }>` — thiếu pagination và match result.

**Migration:**

```ts
// Trước (≤ v1.0.13):
interface Mega645EntryLinesResponse {
  entryId: string;
  lines: Array<{ numbers: number[] }>;
}

// Sau (v1.0.14+):
interface Mega645EntryLinesResponse {
  entryId: string;
  drawId: string;
  lines: Mega645LineInfo[]; // numbers: string[] + boardNo, lineIndex, betCount, matchResult
  nextCursor: number | null;
  size: number;
}
```

#### `Mega645JackpotResponse`: viết lại

**Migration:**

```ts
// Trước (≤ v1.0.13):
interface Mega645JackpotResponse {
  jackpotAmount: number;
  cycleId: string;
  openedAt: string;
}

// Sau (v1.0.14+):
interface Mega645JackpotResponse {
  cycleNo: number;
  currentAmount: number;
  seedAmount: number;
  peakAmount: number;
  totalContribution: number;
  drawCount: number;
  startDrawId: string;
}
```

### Fixed — Power 6/55

#### `Power655TicketSummary`: sửa `pricing`, `progress`, `voidSummary`

Đổi tên field trong `pricing` cho đồng nhất với các game khác:

- `stakePerDraw` → `amountPerDraw`
- `totalStake` → `totalAmount`

Đổi cấu trúc `progress` cho khớp DTO:

- `settledDrawCount + voidDrawCount` → `totalDraws + settledDraws`

Sửa và bổ sung `voidSummary`:

- `totalRefundAmount` → `totalRefundedAmount`
- Thêm: `totalVoidedAmount`, `voidedDrawIds: string[]`, `lastVoidedAt?: string`

**Migration:**

```ts
ticket.pricing.stakePerDraw; // → ticket.pricing.amountPerDraw
ticket.pricing.totalStake; // → ticket.pricing.totalAmount
ticket.progress.settledDrawCount; // → ticket.progress.settledDraws
ticket.progress.voidDrawCount; // bỏ — dùng ticket.voidSummary?.voidedDrawCount
ticket.voidSummary?.totalRefundAmount; // → ticket.voidSummary?.totalRefundedAmount
```

#### `Power655EntryResult`: thêm `id`, `outcome`, mở rộng `payout`

- Thêm `id: string` — entry ID
- Thêm `outcome?: "win" | "loss"` — có sau khi settle
- `payout` thêm `payoutAmount: number` — tiền trả thực tế sau payout cap

**Migration:**

```ts
// Trước (≤ v1.0.13) — không có id, outcome, payoutAmount
// Sau (v1.0.14+):
entry.id; // string
entry.outcome; // "win" | "loss" | undefined
entry.payout?.payoutAmount; // number
```

#### `Power655LineInfo.matchResult`: `optional` → `required`

`getEntryLines` chỉ trả data khi entry đã settled — `matchResult` luôn có. Đã bỏ dấu `?`.

**Migration:**

```ts
// Trước: if (line.matchResult) { ... }
// Sau:
console.log(line.matchResult.mainMatchCount); // luôn defined
```

### Fixed — Max 3D

#### `Max3dTicketSummary.voidSummary`: shape sai hoàn toàn

SDK cũ model void theo board trong khi Max 3D void theo draw.

**Migration:**

```ts
// Trước (≤ v1.0.13):
ticket.voidSummary?.isFullVoid; // boolean
ticket.voidSummary?.voidedBoards; // string[]
ticket.voidSummary?.originalAmount; // number
ticket.voidSummary?.refundAmount; // number
ticket.voidSummary?.voidedAt; // string

// Sau (v1.0.14+):
ticket.voidSummary?.totalVoidedAmount; // number
ticket.voidSummary?.totalRefundedAmount; // number
ticket.voidSummary?.voidedDrawCount; // number
ticket.voidSummary?.voidedDrawIds; // string[]
ticket.voidSummary?.lastVoidedAt; // string | undefined
```

#### `Max3dEntryResult`: xoá `drawDate`, thêm `outcome`, mở rộng `payout`

- Xoá `drawDate` — field này không có trong DTO
- Thêm `outcome?: "win" | "loss"`
- `payout` thêm `payoutAmount`, mở rộng `tiers` với `playMode`, `hitCount`, `unitAmount`

**Migration:**

```ts
// Trước (≤ v1.0.13):
entry.drawDate; // bỏ
entry.payout?.tiers[0].tier; // string
entry.payout?.tiers[0].amount; // number

// Sau (v1.0.14+):
entry.outcome; // "win" | "loss" | undefined
entry.payout?.payoutAmount; // number
entry.payout?.tiers[0].playMode; // "basic" | "plus"
entry.payout?.tiers[0].hitCount; // number
entry.payout?.tiers[0].unitAmount; // number
entry.payout?.tiers[0].amount; // number
```

#### `Max3dLineInfo.matchResult`: `optional` → `required`

Tương tự Power655 — `getEntryLines` chỉ trả data sau khi settled.

**Migration:**

```ts
// Trước: if (line.matchResult) { ... }
// Sau:
console.log(line.matchResult.winAmount); // luôn defined
```

### Fixed — Lotto 5/35

#### `Lotto535DrawInfo`: viết lại

Shape cũ (`salesCloseAt`, `jackpotAmount`, `isSplitCycle`, `vietlottRef`) không khớp DTO server.

**Migration:**

```ts
// Trước (≤ v1.0.13):
draw.salesCloseAt; // string
draw.jackpotAmount; // number

// Sau (v1.0.14+):
draw.sales.closeAt; // string
draw.sales.openAt; // string | undefined
// jackpotAmount → gọi client.lotto535.getJackpot()
```

#### `Lotto535BoardSummary`: `mainNumbers`/`specialNumbers` — `number[]` → `string[]`

Zero-padded string, đồng nhất với toàn bộ hệ thống.

**Migration:**

```ts
board.mainNumbers[0]; // trước: 1 (number) → sau: "01" (string)
```

#### `Lotto535EntryResult`: bổ sung fields, sửa types, xoá `Lotto535EntryPayoutSummary`

- Thêm `id: string`, `outcome?: "win" | "loss"`
- `status`: `"pending" | "settled"` → `string` (bao gồm cả `"voided"`)
- `result.winningMain` / `result.winningSpecial`: `number[]` / `number` → `string[]` / `string`
- `payout`: thêm `payoutAmount`, xoá `isJackpot?` trong tiers
- Xoá `Lotto535EntryPayoutSummary` — đã inline vào `payout`

**Migration:**

```ts
// Trước (≤ v1.0.13):
entry.status; // "pending" | "settled"
entry.result?.winningMain; // number[]
entry.payout?.winAmount; // number

// Sau (v1.0.14+):
entry.id; // string
entry.outcome; // "win" | "loss" | undefined
entry.status; // string — bao gồm "voided"
entry.result?.winningMain; // string[] ("01"–"35")
entry.result?.winningSpecial; // string ("01"–"12")
entry.payout?.payoutAmount; // number
```

#### `Lotto535JackpotResponse`: viết lại

Interface cũ chỉ có `jackpotAmount: number`.

**Migration:**

```ts
// Trước: jp.jackpotAmount
// Sau (v1.0.14+):
jp.currentAmount; // VND
jp.cycleNo;
jp.seedAmount;
jp.peakAmount;
jp.totalContribution;
jp.drawCount;
jp.startDrawId;
jp.progress.splitThreshold;
jp.progress.percentage;
```

#### `Lotto535EntryLinesResponse`: viết lại + thêm `Lotto535LineInfo`

Interface cũ thiếu pagination và match result.

**Migration:**

```ts
// Trước (≤ v1.0.13):
data.lines[0].mainNumbers; // number[]
data.lines[0].specialNumber; // number

// Sau (v1.0.14+):
data.drawId;
data.nextCursor; // number | null
data.size;
data.lines[0].boardNo; // "A" | "B" | ...
data.lines[0].lineIndex; // 0-based
data.lines[0].main; // string[] ("01"–"35")
data.lines[0].special; // string ("01"–"12")
data.lines[0].matchResult.mainMatchCount; // 0–5
data.lines[0].matchResult.specialMatched; // boolean
data.lines[0].matchResult.tier; // string | null
data.lines[0].matchResult.winAmount; // VND
```

---

## [1.0.13] - 2026-03-24

### Breaking Changes — Unified Boards (Keno + Bingo 18)

Keno và Bingo 18 refactor kiến trúc: tất cả loại chơi (cơ bản + side bet) gộp vào chung mảng `boards[]`. Mảng `sideBets[]` bị xoá.

#### Keno — `boardNo` bắt buộc, xoá `sideBets`

**Trước (≤ v1.0.12):**

```ts
const input: KenoTicketPurchaseInput = {
  drawIds: ["2026-03-24.001"],
  boards: [{ boardNo: "A", numbers: ["01", "15", "33", "44", "60"] }],
  sideBets: [
    { playType: "bigSmall", bet: "big" },
    { playType: "evenOdd", bet: "even" },
  ],
};
```

**Sau (v1.0.13+):**

```ts
const input: KenoTicketPurchaseInput = {
  drawIds: ["2026-03-24.001"],
  boards: [
    { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] },
    { boardNo: "B", playType: "bigSmall", bet: "big" },
    { boardNo: "C", playType: "evenOdd", bet: "even" },
  ],
};
```

**Thay đổi chi tiết:**

| Trước (≤ v1.0.12)                                | Sau (v1.0.13+)               | Ghi chú                                      |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------- |
| `KenoBoardInput.boardNo?: string`                | `boardNo: string` (required) | `"A"` / `"B"` / `"C"`                        |
| `KenoTicketPurchaseInput.sideBets`               | **Xoá**                      | Gộp vào `boards[]`                           |
| `KenoSideBetInput`                               | **Xoá**                      | Dùng `KenoBoardInput` với `playType` + `bet` |
| `KenoBoardSummary.boardNo?: string`              | `boardNo: string` (required) | Mọi board đều có `boardNo`                   |
| `KenoEntryPayoutSummary.sideBetPayouts`          | **Xoá**                      | Gộp vào `boardPayouts[]`                     |
| `KenoEntryPayoutSummary.boardPayouts[].boardNo?` | `boardNo: string` (required) |                                              |
| `KenoDrawResultDetail.sideBetPrizes`             | **Xoá**                      | Gộp vào `prizes[]`                           |
| `KenoSideBetPrizeDetail`                         | **Xoá**                      | Dùng `KenoDrawPrizeDetail`                   |
| `KenoPlaceBetResponse.sideBetCount`              | **Xoá**                      | `boardCount` bao gồm tất cả                  |

#### Bingo 18 — `boardNo` bắt buộc, xoá `sideBets`

**Trước (≤ v1.0.12):**

```ts
const input: Bingo18TicketPurchaseInput = {
  drawIds: ["2026-03-24.001"],
  boards: [{ boardNo: "A", playType: "singleNum", number: 5 }],
  sideBets: [
    { playType: "sumTotal", sum: 14 },
    { playType: "bigSmallDraw", bet: "big" },
  ],
};
```

**Sau (v1.0.13+):**

```ts
const input: Bingo18TicketPurchaseInput = {
  drawIds: ["2026-03-24.001"],
  boards: [
    { boardNo: "A", playType: "singleNum", number: 5 },
    { boardNo: "B", playType: "sumTotal", sum: 14 },
    { boardNo: "C", playType: "bigSmallDraw", bet: "big" },
  ],
};
```

**Thay đổi chi tiết:**

| Trước (≤ v1.0.12)                                 | Sau (v1.0.13+)               | Ghi chú                     |
| ------------------------------------------------- | ---------------------------- | --------------------------- |
| `Bingo18BoardInput.boardNo?: string`              | `boardNo: string` (required) | `"A"` – `"F"`               |
| `Bingo18TicketPurchaseInput.sideBets`             | **Xoá**                      | Gộp vào `boards[]`          |
| `Bingo18SideBet` (input)                          | **Xoá**                      | Dùng `Bingo18BoardInput`    |
| `Bingo18TicketSummary.boards[].boardNo?`          | `boardNo: string` (required) | Mọi board đều có `boardNo`  |
| `Bingo18EntryInfo.payout.sideBetPayouts`          | **Xoá**                      | Gộp vào `boardPayouts[]`    |
| `Bingo18EntryInfo.payout.boardPayouts[].boardNo?` | `boardNo: string` (required) |                             |
| `Bingo18DrawResultInfo.sideBetPrizes`             | **Xoá**                      | Gộp vào `prizes[]`          |
| `Bingo18DrawSideBetPrize`                         | **Xoá**                      | Dùng `Bingo18DrawPrize`     |
| `Bingo18PlaceBetResponse.sideBetCount`            | **Xoá**                      | `boardCount` bao gồm tất cả |

### Removed

**Keno:** `KenoSideBetInput`, `KenoSideBetSummary`, `KenoSideBetPrizeDetail`

**Bingo 18:** `Bingo18SideBet`, `Bingo18SideBetSummary`, `Bingo18DrawSideBetPrize`

### Fixed

- **Bingo 18**: `Bingo18DrawResultSummary.vietlottRef.drawPeriod` và `Bingo18DrawResultInfo.vietlottRef.drawPeriod` — đổi từ `number` sang `string`, đồng nhất với Keno.
- **Keno**: `KenoEntryInfo` — bổ sung các fields bị thiếu:
  - `unitPrice: number` — mệnh giá 1 lần tham gia
  - `selectionCount: number` — số boards (`boards.length`)
  - Đổi tên `betCount` → `betUnitCount` (`Σ(board.betCount)`, dùng tính tiền: `amount = betUnitCount × unitPrice`)
  - `entrySummary.boards[].betCount: number` — thêm field bị thiếu trong board snapshot
- **Power 6/55**: `Power655DrawResultSummary.vietlottRef.drawPeriod` — `number` → `string`.
- **Max 3D**: `Max3dDrawResultSummary.vietlottRef.drawPeriod` — `number` → `string`.
- **Max 3D Pro**: `Max3dproDrawResultSummary.vietlottRef.drawPeriod` — `number` → `string`.
- **Max 3D**: `Max3dTicketEntriesResponse.entries[]` — thay inline type thiếu fields bằng `Max3dEntryResult[]`, bổ sung `unitPrice`, `lineCount`, `betUnitCount`.
- **Max 3D Pro**: `Max3dproTicketEntriesResponse.entries[]` — tương tự Max 3D.

### Migration Guide

1. Xoá `sideBets` khỏi input `placeBet()`. Gộp side bets vào `boards[]` với `boardNo` riêng.
2. Thêm `boardNo` cho mọi board. Keno: `"A"`–`"C"`, Bingo 18: `"A"`–`"F"`.
3. Xoá các type đã bị removed. Thay bằng `KenoBoardInput` / `Bingo18BoardInput`.
4. Cập nhật xử lý response: `sideBetPayouts` → filter trong `boardPayouts[]`; `sideBetPrizes` → filter trong `prizes[]`.
5. `KenoEntryInfo.betCount` → `betUnitCount`:

```ts
entry.betCount; // ≤ v1.0.12 — không còn tồn tại
entry.betUnitCount; // v1.0.13+ — Σ(board.betCount)
entry.unitPrice; // mệnh giá (VND)
entry.selectionCount; // số boards
```

1. `KenoBoardInput.playType` bắt buộc cho pick boards:

```ts
// Trước — API từ chối nhưng TypeScript không báo lỗi:
const board: KenoBoardInput = { boardNo: "A", numbers: ["01", "15", "33", "44", "60"] };

// Sau:
const board: KenoBoardInput = {
  boardNo: "A",
  playType: "pick5", // bắt buộc
  numbers: ["01", "15", "33", "44", "60"],
};
```

1. Max 3D / Max 3D Pro — `getTicketEntries()` nay trả `Max3dEntryResult[]` / `Max3dproEntryResult[]` thay vì inline type:

```ts
const { entries } = await client.max3d.getTicketEntries(ticketId);
entries[0].unitPrice; // VND — field mới
entries[0].lineCount; // Σ(board.lineCount) — field mới
entries[0].betUnitCount; // field mới
entries[0].payout?.tiers; // [{ tier, amount }]
```

---

## [1.0.12] - 2026-03-23

### Breaking Changes

#### `Bingo18BasicBoard` — thêm `boardNo` (required), đổi `kind` → `tripleKind`

```ts
// Trước (handler bắt buộc boardNo, field kind không tồn tại):
const board: Bingo18BasicBoard = {
  playType: "tripleMatch",
  kind: "specific", // sai tên
  number: 5,
};

// Sau:
const board: Bingo18BasicBoard = {
  boardNo: "A", // required, tối đa 6 boards/vé
  playType: "tripleMatch",
  tripleKind: "specific", // đúng tên theo handler
  number: 5,
};
```

#### `Max3dproBoardInput` — tách thành discriminated union, thêm `playType: "straight"` (required)

```ts
// Trước (thiếu playType, triplets/frontDigits/backDigits optional sai):
const board: Max3dproBoardInput = {
  boardNo: "A",
  playMode: "multiNumber",
  triplets: ["123", "456"],
};

// Sau — multiNumber:
const board: Max3dproMultiNumberBoardInput = {
  boardNo: "A",
  playMode: "multiNumber",
  playType: "straight", // required
  triplets: ["123", "456", "789"],
};

// Sau — multiDigit:
const board: Max3dproMultiDigitBoardInput = {
  boardNo: "B",
  playMode: "multiDigit",
  playType: "straight", // required
  frontDigits: [1, 2, 3],
  backDigits: [4, 5, 6],
};
```

**Migration:** Thêm `playType: "straight"` và dùng đúng interface theo `playMode`.

Types mới được export: `Max3dproMultiNumberBoardInput`, `Max3dproMultiDigitBoardInput`. `Max3dproBoardInput` vẫn là union của hai interface trên.

---

## [1.0.11] - 2026-03-23

### Breaking Changes

#### `{Game}TicketPurchaseInput` — đổi `drawId + drawCount` sang `drawIds: string[]` (5 games)

Handler các game Mega 6/45, Lotto 5/35, Power 6/55, Max 3D, Max 3D Pro đã dùng `drawIds: string[]` từ trước. SDK type khai báo sai là `drawId + drawCount`. Đã đồng bộ.

| Game       | Type                          |
| ---------- | ----------------------------- |
| Mega 6/45  | `Mega645TicketPurchaseInput`  |
| Lotto 5/35 | `Lotto535TicketPurchaseInput` |
| Power 6/55 | `Power655TicketPurchaseInput` |
| Max 3D     | `Max3dTicketPurchaseInput`    |
| Max 3D Pro | `Max3dproTicketPurchaseInput` |

**Migration:**

```ts
// Trước (v1.0.10 — handler trả 400):
client.mega645.placeBet({
  drawId: "2026-03-07.001",
  drawCount: 3,
  boards: [...],
});

// Sau (v1.0.11+):
client.mega645.placeBet({
  drawIds: ["2026-03-07.001", "2026-03-14.001", "2026-03-21.001"],
  boards: [...],
});
```

Tương tự cho `client.lotto535`, `client.power655`, `client.max3d`, `client.max3dpro`.

> `drawIds` là mảng các drawId cụ thể muốn tham gia, không phải drawId bắt đầu + số kỳ liên tiếp. Tối đa 6 kỳ/vé.

---

## [1.0.10] - 2026-03-22

### Breaking Changes

#### `PlaceBetResponse` — bổ sung đầy đủ fields (tất cả games)

Response trả đủ thông tin vé vừa tạo để hiển thị ngay mà không cần gọi thêm API.

```ts
// Trước (v1.0.9):
interface XxxPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

// Sau (v1.0.10+):
interface XxxPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  status: string;
  drawPlan: { drawIds: string[]; drawCount: number };
  pricing: {
    unitPrice: number;
    // ...chi tiết theo từng game
    totalAmount: number;
  };
  boardCount: number;
  entryCount: number;
}
```

> `totalAmount` chuyển vào `pricing.totalAmount`. Cập nhật mọi nơi đọc `result.totalAmount`.

---

#### `KenoPlaceBetResponse.pricing` — đổi tên field

| Cũ            | Mới                 | Ghi chú                        |
| ------------- | ------------------- | ------------------------------ |
| `betsPerDraw` | `selectionsPerDraw` | Số boards mỗi kỳ               |
| _(không có)_  | `betUnitsPerDraw`   | Tổng đơn vị cược = Σ(betCount) |

`KenoTicketSummary.pricing` đổi tương tự.

---

#### `betCount` trong board/sideBet summary — `optional` → `required`

`betCount` trong các summary type (từ `getTicketEntries`, `listTickets`…) đã bắt buộc.

| Game       | Type                    | Field              |
| ---------- | ----------------------- | ------------------ |
| Keno       | `KenoBasicBoardSummary` | `betCount: number` |
| Keno       | `KenoSideBetSummary`    | `betCount: number` |
| Lotto 5/35 | `Lotto535BoardSummary`  | `betCount: number` |
| Mega 6/45  | `Mega645BoardSummary`   | `betCount: number` |
| Power 6/55 | `Power655BoardSummary`  | `betCount: number` |
| Max 3D     | `Max3dBoardSummary`     | `betCount: number` |
| Max 3D Pro | `Max3dproBoardSummary`  | `betCount: number` |
| Bingo 18   | `Bingo18BoardSummary`   | `betCount: number` |

> `betCount` trong **input** (place bet) vẫn optional, mặc định = 1.

```ts
// Trước: const count = board.betCount ?? 1;
// Sau:
const count = board.betCount; // luôn defined
```

---

#### `GameRules` — thêm `minBetCount` và `maxBetCount`

```ts
interface XxxGameRules {
  // ...
  minBetCount: number; // thường = 1
  maxBetCount: number; // giới hạn tối đa cho 1 board
}
```

Áp dụng cho tất cả 7 games.

---

### Added

- **Bingo 18**: `Bingo18ListPendingTicketsParams` — pagination cho `listPendingTickets` (`size` + `cursor`)
- **Bingo 18**: `Bingo18ListAllTicketsParams` — filter + pagination cho `listTickets` (thêm `from` + `to`)

### Migration Guide

```ts
// 1. totalAmount chuyển vào pricing:
result.totalAmount; // ≤ v1.0.9 — không còn ở root
result.pricing.totalAmount; // v1.0.10+

// 2. Keno pricing fields:
ticket.pricing.betsPerDraw; // bỏ
ticket.pricing.selectionsPerDraw; // mới
ticket.pricing.betUnitsPerDraw; // mới
```

---

#### `KenoCurrentDrawResponse` — xoá `lastResult`

`lastResult` không bao giờ được API trả về — luôn là `undefined`. Đã xoá khỏi type. Để lấy kết quả gần nhất, dùng `listDrawResults()`.

```ts
// Trước — luôn undefined, nay TypeScript báo lỗi:
const data = await client.keno.getCurrentDraw();
data.lastResult;

// Sau:
const results = await client.keno.listDrawResults({ size: 1 });
const lastResult = results.items[0];
```

---

## [1.0.9] - 2026-03-13

### Added

- **Power 6/55**: `Power655PlayType.Bao5` (`"bao5"`) — chọn 5 số, hệ thống ghép với 50 số còn lại → 50 bộ số dự thưởng. Giá vé 500.000đ/kỳ.

### Fixed

- **Power 6/55**: Bổ sung `Bao5` vào `Power655PlayType` enum — backend đã hỗ trợ từ trước, SDK nay đồng bộ.

---

## [1.0.8] - 2026-03-13

### Added

- **Power 6/55**: `listDrawResults(params?)` — `GET /games/power655/draw-results`
- **Power 6/55**: `getDrawResult(drawId)` — `GET /games/power655/draw-results/{drawId}`
- **Max 3D**: `listDrawResults(params?)` — `GET /games/max3d/draw-results`
- **Max 3D**: `getDrawResult(drawId)` — `GET /games/max3d/draw-results/{drawId}`
- **Max 3D Pro**: `listDrawResults(params?)` — `GET /games/max3dpro/draw-results`
- **Max 3D Pro**: `getDrawResult(drawId)` — `GET /games/max3dpro/draw-results/{drawId}`
- **Bingo 18**: `listDrawResults(params?)` — `GET /games/bingo18/draw-results`
- **Bingo 18**: `getDrawResult(drawId)` — `GET /games/bingo18/draw-results/{drawId}` (bao gồm `basicPrizes` + `sideBetPrizes`)
- **Power 6/55**: Types `Power655DrawResultSummary`, `Power655DrawResultInfo`, `Power655DrawTierPrize`, `Power655LineInfo`, `Power655ListDrawResultsParams`, `Power655ListDrawResultsResponse`
- **Max 3D**: Types `Max3dDrawResultSummary`, `Max3dDrawResultInfo`, `Max3dDrawTierPrize`, `Max3dLineInfo`, `Max3dListDrawResultsParams`, `Max3dListDrawResultsResponse`
- **Max 3D Pro**: Types `Max3dproDrawResultSummary`, `Max3dproDrawResultInfo`, `Max3dproDrawTierPrize`, `Max3dproLineInfo`, `Max3dproListDrawResultsParams`, `Max3dproListDrawResultsResponse`
- **Bingo 18**: Types `Bingo18DrawResultSummary`, `Bingo18DrawResultInfo`, `Bingo18DrawBasicPrize`, `Bingo18DrawSideBetPrize`, `Bingo18ListDrawResultsParams`, `Bingo18ListDrawResultsResponse`

### Changed

- **BREAKING — Power 6/55**: `Power655EntryLinesResponse` viết lại cho khớp API:
  - Thêm `drawId: string`, `nextCursor: number | null`, `size: number`
  - `lines[]`: `Array<{ mainNumbers: number[] }>` → `Array<Power655LineInfo>` — `main: string[]` (zero-padded), thêm `boardNo`, `lineIndex`, `matchResult`
- **BREAKING — Max 3D**: `Max3dEntryLinesResponse` viết lại tương tự:
  - Thêm `drawId`, `nextCursor`, `size`
  - `lines[]`: `Array<{ triplet: string }>` → `Array<Max3dLineInfo>` — `triplets: string[]`, thêm `boardNo`, `lineIndex`, `playMode`, `playType`, `matchResult`
- **BREAKING — Max 3D Pro**: `Max3dproEntryLinesResponse` viết lại tương tự Max 3D:
  - `lines[]`: `Array<{ first: string; second: string }>` → `Array<Max3dproLineInfo>`
- **BREAKING — Max 3D**: `Max3dTicketEntriesResponse.entries[].result` — sửa shape:
  - Cũ: `{ firstPrize: string; secondPrize: string; publishedAt: string }`
  - Mới: `{ special: string[]; first: string[]; second: string[]; third: string[]; publishedAt: string }` — 20 bộ ba chia 4 hạng giải
- **BREAKING — Max 3D Pro**: `Max3dproTicketEntriesResponse.entries[].result` — sửa shape tương tự Max 3D.

### Removed

- **BREAKING — Mega 6/45**: `Mega645PlayType.QuickPick` (`"quickPick"`) — handler không còn chấp nhận, sẽ bị `VALIDATION_ERROR`.
- **BREAKING — Power 6/55**: `Power655PlayType.QuickPick` — lý do như trên.
- **BREAKING — Lotto 5/35**: `Lotto535PlayType.QuickPick` — lý do như trên.
- **BREAKING — Max 3D**: `Max3dPlayType.QuickPick` — handler chỉ còn chấp nhận `straight`, `combo3`, `combo6`.

### Migration Guide

#### QuickPick bị xoá — dùng chọn số thủ công

```ts
// Trước (VALIDATION_ERROR):
boards: [{ boardNo: "A", playType: "quickPick", selection: { mainNumbers: [] } }];

// Sau:
boards: [
  {
    boardNo: "A",
    playType: "standard",
    selection: { mainNumbers: ["05", "12", "23", "34", "40", "45"] },
  },
];
```

#### Power 6/55 `getEntryLines` response đổi

```ts
// Trước:
lines[0].mainNumbers; // number[]

// Sau (v1.0.8+):
const { lines, nextCursor } = await client.power655.getEntryLines(entryId, { size: 50 });
lines[0].main; // string[] — VD: ["03", "11", "25"]
lines[0].boardNo; // "A"
lines[0].matchResult?.tier; // "jackpot1" | "tier1" | null
```

#### Max 3D `getTicketEntries` entry result đổi

```ts
// Trước:
entry.result?.firstPrize; // không tồn tại
entry.result?.secondPrize; // không tồn tại

// Sau (v1.0.8+):
entry.result?.special; // string[] — hạng Đặc Biệt
entry.result?.first; // string[] — hạng Nhất
entry.result?.second; // string[] — hạng Nhì
entry.result?.third; // string[] — hạng Ba
```

---

## [1.0.7] - 2026-03-01

Initial tracked release.
