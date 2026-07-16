# 04 — Kết quả, Dò trúng & Kết sổ (Settle)

> Lõi nghiệp vụ. Cấu trúc kết quả khác nhau MB (27 bộ) vs MN (18 bộ). Công thức dò trúng + tính thưởng lấy
> **chính xác** từ ref (`10-lottery-result-ket-qua.md`, `11-bookkeeping-ket-so.md`) nhưng gói vào settle pipeline
> chuẩn MegaWin (Step Functions, `settledAt` high-water mark, `settleSummary` denormalized cho player API).
>
> **Cập nhật v3:** `gameType` → `region`, giữ `playType`; dò trúng rẽ theo **`position`** (last/first) +
> **`betMode`** (exact/parity/sizes); keyword rules chuẩn hoá; side-bet chẵn/lẻ = `betMode`; "Đề đầu/theo giải chọn"
> = `de` + trục, "Lô đầu" = `lo` + `position=first` (bỏ playType `deDau`/`deGiaiChon`/`deDauGiaiChon`/`loDau`).
>
> **Cập nhật v4 `[Chốt]`:** settle đọc selection từ field canonical **`board.picks: string[]`** (grammar theo
> betMode — 01 §2.3.1) thay cho `numbers`/`parityPick`/`sizePick`. Mỗi betMode có 1 **matcher** riêng —
> betMode mới trong tương lai chỉ thêm matcher, KHÔNG đổi pipeline.

---

## 0. Keyword dò trúng — `[Chốt]`

| Keyword | Quy tắc |
|---|---|
| **"Đề"** (`de`) | So với **1 kết quả duy nhất** (theo `prizeSelector`, mặc định giải Đặc Biệt). **KHÔNG nháy.** |
| **"Lô"** (`lo`) | So với **toàn bộ giải** đài (MB 27 / MN 18). **CÓ nháy.** |
| **`position=first`** ("Đầu") | Lấy các chữ số **đầu** của bộ số. de+first="Đề đầu"; lo+first="Lô đầu". |
| **`position=last`** (mặc định, "Đuôi") | Lấy các chữ số **cuối** của bộ số. |
| **2D/3D/4D** | So **2/3/4** chữ số (`length`). |
| **Nháy (frequence)** | Cược 1 số, so nhiều kết quả → số lần xuất hiện = số lần thắng. Chỉ `lo`/`ba3D*`/`bon4D*`/`loLive`. VD số `27` về ở 3 giải → nháy = 3 → thắng ×3. |

### 0.1 betMode ảnh hưởng dò trúng

| betMode | Cách so | Token `picks` | Nháy? |
|---|---|---|---|
| `exact` | So **chính xác số** player chọn với số kết quả (cắt theo `position`). | `["05","27"]` | Theo playType (Lô có, Đề không) |
| `parity` | So **chẵn/lẻ** của số (theo `position`) kết quả liên quan với `picks[0]`. | `["even"]` | **Không** (kết quả nhị phân) |
| `sizes` | So **tài/xỉu** (Xỉu 00–49 / Tài 50–99) của số (theo `position`) với `picks[0]`. | `["xiu"]` | **Không** |

---

## 1. Cấu trúc kết quả (`result` trong `LotteryDrawDoc`)

> **1 kỳ/ngày, 1 region/draw doc `[Chốt]`.** Mỗi `LotteryDrawDoc` chứa kết quả của đúng 1 đài. Không gộp 4 đài.

### 1.1 Union theo đài

```ts
export type LotteryDrawResult = LotteryNorthernResult | LotterySouthernResult;
```

### 1.2 Miền Bắc — 27 bộ số

```ts
export interface LotteryNorthernResult {
  region: typeof LotteryRegion.MienBac;
  /** Các giải theo hạng. Mỗi hạng là mảng số (string, giữ độ dài gốc). */
  prizes: {
    special: string[];   // 1 × 5 số
    first: string[];     // 1 × 5
    second: string[];    // 2 × 5
    third: string[];     // 6 × 5
    fourth: string[];    // 4 × 4
    fifth: string[];     // 6 × 4
    sixth: string[];     // 3 × 3
    seventh: string[];   // 4 × 2
  };
  publishedAt: Date;
}
```

### 1.3 Miền Nam — 18 bộ số (18A/18B/18C cùng shape)

```ts
export interface LotterySouthernResult {
  region: typeof LotteryRegion.MienNam18A
        | typeof LotteryRegion.MienNam18B
        | typeof LotteryRegion.MienNam18C;
  prizes: {
    special: string[];   // 1 × 6 số
    first: string[];     // 1 × 5
    second: string[];    // 1 × 5
    third: string[];     // 2 × 5
    fourth: string[];    // 7 × 5
    fifth: string[];     // 1 × 4
    sixth: string[];     // 3 × 4
    seventh: string[];   // 1 × 3
    eighth: string[];    // 1 × 2
  };
  publishedAt: Date;
}
```

> **Cờ chẵn/lẻ & tài/xỉu:** không lưu tách rời như v1 — settle tính trực tiếp từ 2 số cuối của giải liên quan tại
> thời điểm settle (rẻ, chỉ vài phép so). Nếu cần tối ưu player API, `settleSummary` group sẵn (§6).

> **Nhập kết quả tay** (Phase 1, `[Chốt]`): backoffice `PublishResult` — staff nhập từng hạng giải. Validate độ dài
> & số lượng bộ mỗi hạng theo cơ cấu đài. Sau publish → `status = published` → trigger settle.

---

## 2. Helper dò số & đếm nháy (từ ref `getNumberFrequence`)

```ts
/**
 * Đếm số nháy (frequence) của từng con số trong tập giải.
 * @param prizes   danh sách số giải (đã flatten theo playType)
 * @param length   2 (Lô/2D) | 3 (3D) | 4 (4D)
 * @param position "last" (đuôi) | "first" (đầu)
 * @returns Map<numberStr, frequence>
 * (ref: bookkeeping-helper.ts getNumberFrequence)
 */
function getNumberFrequence(
  prizes: string[], length: 2 | 3 | 4, position: LotteryNumberPosition,
): Map<string, number>;
```

Cắt số: `position === "last" ? p.slice(-length) : p.slice(0, length)`. Tăng đếm mỗi lần xuất hiện = **nháy**.

### 2.1 Tập giải để dò theo playType × position

`position` do board quyết (mặc định `last`; `de`/`lo` cho phép `first`). Cột "position" dưới đây là **mặc định**,
board có thể override với `de`/`lo`.

| playType | Đài | Tập giải flatten | length | position | prizeSelector |
|---|---|---|:---:|---|---|
| `lo` | MB | **cả 27 bộ** | 2 | last (hoặc first = "Lô đầu", chỉ MB) | — |
| `lo` | MN | **cả 18 bộ** | 2 | last | — |
| `lo2D7` | MN | 7 bộ **giải tư** | 2 | last | — |
| `ba3D` | MB | các bộ có ≥3 số | 3 | last | — |
| `ba3D17` | MN | 17 bộ ≥3 số | 3 | last | — |
| `ba3D7` | MN | 7 bộ giải tư | 3 | last | — |
| `bon4D` | MB | các bộ ≥4 số | 4 | last | — |
| `bon4D16` | MN | 16 bộ ≥4 số | 4 | last | — |
| `de` | cả | **1 giải theo `prizeSelector`** (mặc định Đặc biệt) | 2 | last (hoặc first = "Đề đầu") | ✅ |
| `loLive` | MB | tập giải theo **số giải còn lại** (xem `05`) | 2 | last | — |

> **"Đề đầu"** = `de` + `position=first`. **"Đề theo giải chọn"** = `de` + `prizeSelector` ≠ Đặc biệt.
> **"Lô đầu" (MB)** = `lo` + `position=first`: so 2 số **đầu** của cả 27 bộ (có nháy).

> **Danh sách "bộ có ≥N số" cụ thể** phụ thuộc cơ cấu từng đài (§1). Cần chốt chính xác bộ nào thuộc "17 Lô"/"16 Lô"
> MN theo bảng tỉ lệ công ty (xem `06`).

---

## 3. Công thức tính thưởng per-board — `[Chốt]`

> Dò trúng rẽ nhánh theo **`betMode` trước**, rồi mới đến playType. Mỗi betMode = 1 **matcher**
> `(board, result) → { winAmount, multiPay }` — pattern strategy, thêm betMode mới = thêm matcher (v4).
> Selection đọc từ `board.picks` (grammar 01 §2.3.1).

### 3.1 betMode = `exact`, playType CÓ nháy (`lo`, `ba3D*`, `bon4D*`, `loLive`, `lo2D7`)

```
// board.picks có thể nhiều số — tính từng pick rồi cộng
freqMap = getNumberFrequence(prizes, length, position)     // §2
winAmount = Σ_pick ( freqMap.get(pick) > 0 ? board.payout × board.point × freqMap.get(pick) : 0 )
multiPay  = Σ_pick freqMap.get(pick)
```

### 3.2 betMode = `exact`, playType KHÔNG nháy (`de` — mọi position/prizeSelector)

```
winNumber = số (đầu/cuối theo position) của giải liên quan (§2.1, giải theo prizeSelector)
isWin = board.picks.includes(winNumber)      // de thường 1 pick; nhiều pick = nhiều số cùng board
winAmount = isWin ? board.payout × board.point : 0
multiPay  = isWin ? 1 : 0
```

### 3.3 betMode = `parity` (chẵn/lẻ) — áp cho `de`/`lo`/`lo2D7`/`loLive`

```
target = số (đầu/cuối theo position) của giải liên quan
         (de: giải theo prizeSelector; lo: giải chuẩn mặc định giải ĐB — xem chú ý)
actualEven = (parseInt(target, 10) % 2 === 0)
isWin = (board.picks[0] === "even") === actualEven      // picks = ["even"] | ["odd"]
winAmount = isWin ? board.payout × board.point : 0
multiPay  = isWin ? 1 : 0        // parity/sizes KHÔNG nháy
```

> **Lô + parity/sizes:** so với **giải chuẩn** (mặc định giải ĐB) của đài, KHÔNG so toàn bộ giải → không nháy.
> Đây là biến thể "đoán tính chất kết quả" thay vì đoán chính xác số.

### 3.4 betMode = `sizes` (tài/xỉu) — Xỉu 00–49, Tài 50–99 `[Chốt]`

```
target = số (đầu/cuối theo position) của giải liên quan
n = parseInt(target, 10)          // 00..99
actual = n <= 49 ? "xiu" : "tai"
isWin = board.picks[0] === actual               // picks = ["xiu"] | ["tai"]
winAmount = isWin ? board.payout × board.point : 0
multiPay  = isWin ? 1 : 0
```

### 3.5 Xiên (`xien2/3/4`) — chỉ `exact`

```
// thắng khi TẤT CẢ số trong tổ hợp đều về (xuất hiện ≥1 trong tập lô đài)
isWin = board.picks.every(n => loSet.has(n))    // picks = đúng 2/3/4 token 2-số
winAmount = isWin ? board.payout × board.point : 0
multiPay  = isWin ? 1 : 0
```

> Tập `loSet` = distinct 2-số-cuối của toàn bộ giải đài (như `getXienResult` ref). MB dùng 27 bộ, MN dùng 18 bộ.

### 3.6 Lô Live (`loLive`) — xem `05`

- `exact`: dò như §3.1 nhưng tập giải = các giải **còn lại** tại thời điểm cược (payout snapshot theo remain).
- `parity`/`sizes`: đoán **giải mở KẾ TIẾP** — dò như §3.3/§3.4 nhưng target = giải mở ngay sau lúc cược. Không nháy.

### 3.7 Entry tổng hợp

```
entry.payout.winAmount    = Σ boardPayouts.winAmount
entry.payout.payoutAmount = winAmount        // xác nhận có cap hay không — 06
entry.outcome = winAmount>0 ? (tất cả board thắng ? "win" : "partial_win") : "lose"
```

> **KHÔNG có `WinLose = Result − NetAmount` per-item** (đó là mô hình post-paid ref). MegaWin: tiền cược đã trừ ví lúc
> place-bet; settle chỉ **cộng tiền thắng** vào ví (payout). Lời/lỗ kỳ suy ở `DrawFinancial` (§5).

---

## 4. Settle pipeline (Step Functions — chuẩn MegaWin)

```
PublishResult (BO)                 → draw.status = published, result set
  │
TriggerSettle
  │
[SFN] SettleEntries (phân trang)   → dò trúng + ghi payout từng entry (bulkWrite)
  │      (mỗi (region,playType) một nhánh xử lý, như ref chia theo đài)
  │
CalculateFinancials                → ghi draw.financial + stats + settleSummary (IDEMPOTENT)
  │
EnqueueDispatchPayouts             → tạo tenant_dispatch_orders (payoutTx UUIDv7)
  │
FinalizeSettle                     → draw.settledAt = now (high-water mark)
```

- **Resettle** (nhập sai kết quả): pattern `TriggerResettle` như Bingo18 — `PrepareResettle` set `reversal` (đảo payout cũ)
  rồi replay `SettleEntries`. Reuse `EntryReversal` (`01-domain-model.md §4`).
- Phân trang entries trong SFN để tránh timeout/OOM (ref cũng làm vậy).

---

## 5. Financial kỳ (`DrawFinancial`) — chuẩn MegaWin

```
totalRevenue        = Σ entry.amount
totalPrizes         = Σ entry.payout.payoutAmount
totalAgentCommission= Σ entry.tenant.commissionAmount
companyTake         = totalRevenue − totalPrizes − totalAgentCommission
```

> Giống Bingo18 (`profit = revenue − prizes − commission`, không jackpot). Commission chỉ là **snapshot** cho tenant;
> việc tenant chia hoa hồng nội bộ nằm ngoài core.

---

## 6. `settleSummary` denormalized (player API)

Như Bingo18 `DrawSettleSummary.prizes[]` — bảng giải đã có người trúng, group theo `(viewKey, pick/prizeSelector)`
(viewKey = region.playType.position.betMode — 01 §2.5), chỉ ghi `winnerCount > 0`. Cho phép `GetDrawResult` trả
bảng giải trong **1 DB call** không join entries.

> Lưu ý Lô Live settle sau khi kỳ kết thúc (không settle ngay) — xem `05`. Entry Lô Live vẫn gộp vào cùng draw settle.

---

## 7. Đã LƯỢC BỎ so với ref

| Ref | Xử lý |
|---|---|
| `ancestorBookKeepingResult` (WinLose 6 cấp đại lý) | Bỏ — RGS thuần |
| `mb2-bookkeeping-service` (Thần Tài) | Bỏ — không có MB2 |
| Lô Trượt / Đề Trượt (logic đảo) | Bỏ |
| Kết sổ thử `temp_*` cho đại lý | Bỏ Phase 1 (thêm sau nếu ops cần) |
| `mn18avab` (Xiên ghép 18A+18B) | Bỏ — mỗi đài độc lập |
