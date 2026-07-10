# 05 — Lô Live (chỉ Miền Bắc) — Phase 1

> `[Chốt]` Lô Live **chỉ mở cho Miền Bắc**, thiết kế đầy đủ ngay Phase 1. Bản chất là **kiểu cược Lô chơi trong lúc
> đang quay trực tiếp ("Live")**: player cược khi kết quả đang được mở dần từng giải.
>
> **Cập nhật v2 (theo feedback):**
> 1. **KHÔNG settle ngay** khi `closePrize`. Settle chạy bằng **worker sau khi kỳ mở thưởng kết thúc**, cùng lượt
>    settle cả draw (như playType thường). `closePrize` chỉ cập nhật trạng thái + payout, không đụng ví. `[Chốt]`
> 2. **`makeOdds` = thao tác chuyển giá từ kiểu cược "Lô" sang Lô Live**: `pricePerPoint` Lô Live **kế thừa** giá Lô
>    hiện hành của tenant, **bao gồm cả number surcharge**. VD số `00` Lô đang +10đ → Lô Live số `00` cũng +10đ. `[Chốt]`
> 3. Vận hành cần **staff online** ở backoffice gửi **ping liên tục (≤1s/lần)** để tránh khách lạm dụng khi đang quay.
>    `pingAt` phục vụ mục đích đó (`[Chốt]`). Xem §4.1 các giải pháp chống lạm dụng.
> 4. Thêm **`betMode`** cho Lô Live: `exact` (truyền thống, so các giải còn lại, có nháy) | `parity`/`sizes`
>    (đoán **giải mở KẾ TIẾP** là chẵn/lẻ, tài/xỉu — không nháy). `[Chốt]`
> 5. Naming: `gameType` → `region`, giữ `playType`.
>
> **Cập nhật v4 `[Chốt]`:** Lô Live là **market như mọi market khác** trong mô hình 2 lớp (01 §5.1) —
> marketKey `loLive.last.exact` / `loLive.last.parity` / `loLive.last.sizes`. Điểm khác duy nhất: trạng thái các
> market `loLive.*` do **LiveState điều khiển** (openLive/suspend/closeLive đồng bộ vào `draw.markets`), KHÔNG theo
> giờ đóng bán thường. Place-bet vẫn check thống nhất 1 đường `draw.markets[marketKey].status` (03 §3.6). Xem §4.3.

---

## 1. Ý tưởng

- Kỳ MB có **27 giải**. Vào phiên Live, staff mở **lần lượt từng giải** (`closePrize`).
- Player cược `loLive` **trong lúc quay**. Mỗi khi 1 giải đóng → **số giải còn lại giảm** → **payout định lại (tăng)**.
- Càng ít giải còn lại → xác suất số về càng thấp → payout càng cao. Còn **1 giải (ĐB)** → payout ≈ **Đề**.
- **Giá bán (`pricePerPoint`) cố định** trong suốt phiên (kế thừa từ Lô qua `makeOdds`); **chỉ payout tăng**.

> **Khác ref quan trọng `[Chốt]`:** ref cho **giá bán (Price) nhảy động theo cầu**. MegaWin: **giá bán cố định**
> theo tenant (kế thừa giá Lô); **chỉ payout (odds) tăng** theo số giải còn lại. Đây là điểm điều chỉnh cốt lõi.

> **Bản chất "Live" = biến thể realtime của Lô.** Không phải playType tách biệt về luật dò trúng — cùng dò "2 số cuối"
> như Lô, chỉ khác: (a) cược lúc đang quay, (b) payout theo remain, (c) betMode parity/sizes đoán giải kế tiếp.

---

## 2. Entities

### 2.1 `lottery_live_states` — trạng thái phiên Live

```ts
export const LotteryLiveStatus = {
  Closed: "closed",     // chưa mở / đã đóng phiên
  Opening: "opening",   // đang cược Live
  Suspended: "suspended", // tạm dừng nhận cược (mất ping / staff pause) — xem §4.1
} as const;
export type LotteryLiveStatus = (typeof LotteryLiveStatus)[keyof typeof LotteryLiveStatus];

export interface LotteryLiveStateDoc {
  _id: unknown;
  drawId: string;                 // luôn thuộc region = mienBac
  region: typeof LotteryRegion.MienBac;
  /** Số giải còn lại chưa mở (27 → 1). (ref: PrizeNr) */
  remainPrizeCount: number;
  /** Tổng giải = 27. (ref: TotalPrizeNr) */
  totalPrizeCount: number;
  status: LotteryLiveStatus;
  /** Hạng giải đã mở (theo thứ tự mở). */
  openedPrizes: LotteryPrizeTier[];
  /**
   * Ping cuối của staff console giữ phiên "sống".
   * Worker/gateway kiểm tra: now − pingAt > pingTimeoutMs → auto suspend (chặn cược). Xem §4.1.
   */
  pingAt?: Date;
  /** Ai đang trực phiên (staff account). Audit + chịu trách nhiệm. */
  operatorId?: string;
  createdAt: Date;
  updatedAt: Date;
  version: Long;
}
```

### 2.2 `lottery_live_prices` — payout theo số giải còn lại (tính trước ở `makeOdds`)

```ts
export interface LotteryLivePriceDoc {
  _id: unknown;
  drawId: string;
  region: typeof LotteryRegion.MienBac;
  /** Ứng với số giải còn lại (1..27). (ref: PrizeNr) */
  remainPrizeCount: number;
  /**
   * Giá bán mỗi điểm tại phiên này (VND) — CỐ ĐỊNH suốt phiên.
   * = pricePerPoint của playType `lo` (MB) của tenant, GỒM number surcharge. Kế thừa lúc makeOdds. `[Chốt]`
   * Lưu ở đây để audit / snapshot; không đổi theo remain.
   */
  pricePerPoint: number;
  /** Payout (odds) tại mức remain này — TĂNG khi remain giảm. (ref: Payouts) */
  payout: number;
  /** Xác suất số về (tham chiếu, để audit). (ref: Probability) */
  probability: number;
  /** Lợi nhuận kỳ vọng nhà cái (tham chiếu). (ref: Profit) */
  expectedProfit: number;
  createdAt: Date;
}
```

> **`pricePerPoint` Lô Live không cấu hình riêng** — nó **chuyển từ Lô sang** tại `makeOdds` (kể cả surcharge từng số).
> Chỉ **payout** biến thiên theo `remainPrizeCount`. Vì surcharge theo từng số, `pricePerPoint` thực tế resolve
> per-board lúc place-bet (xem §3.1), doc này lưu giá **base** (chưa surcharge) để audit.

---

## 3. `makeOdds` — chuyển giá từ Lô + tính payout theo remain

`makeOdds` chạy **1 lần trước khi mở phiên**. Hai việc:

### 3.1 Chuyển giá bán từ Lô sang Lô Live `[Chốt]`

```
base pricePerPoint(loLive) := pricePerPoint(playType = "lo", region = MB) của tenant (đã resolve tenant override)
number surcharge(loLive, số X) := number surcharge(playType = "lo", số X)   // kế thừa nguyên vẹn
→ giá 1 điểm Lô Live cho số X = base + surcharge(X)
```

Nghĩa là: nếu công ty đang bán số `00` Lô tăng thêm 10đ, thì khi Lô Live mở cửa, số `00` **cũng tăng 10đ**.
Không cấu hình riêng cho Lô Live → tránh lệch giá giữa 2 kiểu cùng bản chất.

### 3.2 Tính payout theo số giải còn lại (ref mục C)

Tính trước cho từng `remainPrizeCount` r = 27 → 1:

```
1. Xác suất ≥1 trong r giải trùng số lô 2 chữ số:
   probability(r) = 1 − (99/100)^r

2. Lợi nhuận mục tiêu (nội suy tuyến tính giữa minProfit ↔ maxProfit):
   profit(r) = minProfit + (maxProfit − minProfit) × (r / 27)

3. payout sao cho pricePerPoint ≈ payout × probability × (1 − profit):
   payout(r) = pricePerPoint / (probability(r) × (1 − profit(r)))

4. payout(r) tăng dần khi r giảm. Chốt trần:
   payout(1) ≈ payout của Đề (khi còn đúng 1 giải ĐB)   [Chốt yêu cầu]
```

> **Điều chỉnh so với ref:** ref giải cho `Price` với `Payouts` cố định. MegaWin đảo: **`pricePerPoint` cố định
> (kế thừa Lô)**, **giải cho `payout(r)`**. Hằng số `minProfit/maxProfit` lấy từ config. Ghi 27 bản `lottery_live_prices`.

> **Cần product xác nhận** `minProfit`, `maxProfit`, payout mục tiêu tại r=1 (= payout Đề) — `06`.

---

## 4. Luồng vận hành (backoffice + worker) — settle SAU khi kỳ kết thúc

```
[createDraw]  tạo LiveState (status=Closed, remain=27, total=27)
    │
[makeOdds]    chuyển giá từ Lô (+surcharge) + tính payout r=27..1 → ghi lottery_live_prices  (TRƯỚC khi mở)
    │
[openLive]    staff mở phiên: status Closed→Opening; set operatorId; publish LO_LIVE_OPENING
    │
[ping]        staff console gửi ping ≤1s/lần → cập nhật pingAt. Mất ping quá ngưỡng → auto Suspended (§4.1)
    │
[placeBet]    player cược loLive: snapshot payout = live_prices[remain hiện tại]; snapshot pricePerPoint (base+surcharge)
    │           → CHỈ trừ ví + ghi entry pending (KHÔNG settle)
    │
[closePrize]  staff nhập số 1 giải:
    │           → remainPrizeCount −= 1; openedPrizes.push(tier)
    │           → publish LO_LIVE_PRIZE_CLOSED (client cập nhật payout mới từ live_prices)
    │           → KHÔNG settle ở bước này. Chỉ cập nhật trạng thái. `[Chốt]`
    │
[closeLive]   mở hết 27 giải → status→Closed; publish LO_LIVE_CLOSED
    │
[settle worker]  SAU khi kỳ kết thúc (draw published đủ 27 giải):
                 → settle CẢ DRAW: playType thường + loLive cùng lượt (pipeline 04 §4). `[Chốt]`
                 → mỗi board loLive dùng payout SNAPSHOT lúc cược để tính thưởng
```

- Cược `loLive` **bỏ qua kiểm tra giờ đóng bán thường** — đóng/mở do LiveState điều khiển, **đồng bộ vào
  `draw.markets["loLive.*"]`** (§4.3) — place-bet check 1 đường thống nhất qua markets.
- Chỉ nhận cược khi market `open`. `closed`/`suspended` → từ chối (`LIVE_NOT_OPEN` / `LIVE_SUSPENDED`).
- **Settle không tức thì:** entry loLive ở trạng thái `pending` đến khi worker settle cả draw sau khi kỳ kết thúc.
  → Đảm bảo nhất quán tài chính (1 lần settle/draw), tránh double-pay, dễ resettle nếu nhập sai giải.

### 4.1 Chống lạm dụng khi đang quay — `[Chốt + đề xuất]`

Rủi ro: player thấy kết quả thực tế (TV/nguồn ngoài) **trước** khi staff nhập → cược "chắc thắng". Biện pháp:

**Bắt buộc (Phase 1):**
1. **Staff ping ≤1s/lần** (`pingAt`). Gateway kiểm tra `now − pingAt > pingTimeoutMs` (VD 2s) → tự động chuyển
   `Opening → Suspended`, **chặn nhận cược** cho đến khi ping trở lại. Staff rời console = phiên đóng cược ngay.
2. **Chốt cược trước mỗi lần mở giải:** ngay trước khi staff bấm `closePrize`, hệ thống tự `Suspended` một khoảng
   ngắn (freeze window, VD 300–500ms) để "khoá sổ" — không nhận cược sát thời điểm giải sắp mở.

**Đề xuất bổ sung (chọn theo khẩu vị rủi ro — cần chốt `06`):**
3. **Betting delay (accept-latency):** mỗi lệnh cược Live giữ lại N ms trước khi xác nhận; nếu giải mở trong khoảng
   đó → huỷ lệnh. Chuẩn ngành sàn thể thao live ("bet delay").
4. **Server-authoritative clock:** payout/remain chỉ đọc từ server; client không tự quyết. Snapshot payout do server
   gán tại thời điểm nhận lệnh, không tin client.
5. **Two-person / dual-source publish:** nhập giải cần 2 staff hoặc đối chiếu nguồn thứ 2 trước khi `closePrize`
   (giảm nhập sai/gian lận nội bộ).
6. **Rate-limit + anomaly detection per account:** phát hiện burst cược đúng ngay trước mỗi lần mở giải → flag/lock.
7. **Heartbeat qua WebSocket thay vì HTTP ping:** ổn định hơn, phát hiện mất kết nối nhanh; fallback HTTP ping.

> Khuyến nghị Phase 1: (1)+(2)+(4)+(6). (3) betting delay và (5) dual-source cân nhắc theo quy mô vận hành.

### 4.2 Snapshot payout khi cược

Payout ghi vào `board.payout` **tại thời điểm cược** = `live_prices[remainPrizeCount hiện tại]`. Settle (chạy sau)
dùng **đúng snapshot đó** (không đọc lại) → an toàn dù remain đã đổi nhiều lần sau khi cược.

### 4.3 Đồng bộ LiveState → `draw.markets` (mô hình 2 lớp — 01 §5.1) `[Chốt: v4]`

LiveState là **nguồn điều khiển**; `draw.markets[loLive.*]` là **nơi place-bet đọc** (đường check thống nhất):

| Sự kiện LiveState | `draw.markets["loLive.last.*"]` |
|---|---|
| `openLive` (Closed→Opening) | → `open` |
| mất ping / staff pause (→Suspended) | → `suspended` (reason: `PING_TIMEOUT` / `STAFF_PAUSE`) |
| ping trở lại / resume (→Opening) | → `open` |
| freeze window trước `closePrize` | → `suspended` (reason: `PRIZE_CLOSING`) rồi tự `open` lại |
| `closeLive` (mở hết 27 giải) | → `closed` |

- Cập nhật markets cùng transaction/use-case với LiveState — không để lệch 2 nguồn.
- 3 market `loLive.last.exact|parity|sizes` đóng/mở **cùng nhau** (Phase 1); nếu sau này muốn tách (VD chỉ đóng
  parity/sizes gần cuối phiên) thì set từng key riêng — schema đã hỗ trợ sẵn.
- Lợi ích: place-bet không cần biết LiveState tồn tại — chỉ check `draw.markets` như mọi playType (03 §3.6).

---

## 5. Events (SNS + realtime)

```ts
export const LotteryLiveEvents = {
  Opening: "LOTTERY_LO_LIVE_OPENING",
  PrizeClosed: "LOTTERY_LO_LIVE_PRIZE_CLOSED",
  Suspended: "LOTTERY_LO_LIVE_SUSPENDED",
  Resumed: "LOTTERY_LO_LIVE_RESUMED",
  Closed: "LOTTERY_LO_LIVE_CLOSED",
} as const;
```

Publish để client cập nhật bảng payout / trạng thái nhận cược tức thì mỗi khi remain đổi hoặc phiên suspend/resume.

---

## 6. Dò trúng Lô Live (liên hệ `04`) — settle cùng draw

Thực hiện trong lượt settle cả draw (không tức thì). Với mỗi board `loLive`:

### 6.1 betMode = `exact` (truyền thống, CÓ nháy)

- Tập giải để dò = các giải **còn lại tại thời điểm cược** (remain lúc snapshot). Board cược **trước** khi các giải đó mở.
- `freq` = số lần 2-số-cuối của board xuất hiện trong tập giải đó → `winAmount = board.payout(snapshot) × point × freq`.
- **Chốt cách tính nháy Live:** ref dùng `Win25/26/27Numbers` theo `PrizeNr` lúc cược. MegaWin đề xuất: nháy = số
  lần trúng trong đúng tập "giải còn lại lúc cược". **Cần chốt chi tiết edge-case** (giải mở đồng thời, giải ĐB) — `06`.

### 6.2 betMode = `parity` / `sizes` (đoán giải kế tiếp, KHÔNG nháy)

- Player đoán **giải mở KẾ TIẾP** (ngay sau thời điểm cược) có 2 số cuối là chẵn/lẻ (parity) hoặc tài/xỉu (sizes).
- Dò như `04` §3.3/§3.4 nhưng `target` = 2 số cuối của **giải mở liền sau** thời điểm cược. Nhị phân → không nháy.
- Snapshot "giải kế tiếp là giải nào" xác định tại settle theo `openedPrizes` thứ tự + thời điểm cược.

---

## 7. Đã LƯỢC BỎ so với ref

| Ref | Xử lý MegaWin |
|---|---|
| Giá bán (`Price`) nhảy động theo cầu | **Bỏ** — giá cố định kế thừa Lô, chỉ payout tăng theo remain |
| Settle tức thì mỗi lần mở giải | **Bỏ** — settle worker sau khi kỳ kết thúc, cùng cả draw `[Chốt]` |
| `LiveAutomaticException` / `RemoveExtraPrice` (chống dội giá) | Bỏ — không có auto-price |
| SQS `lo-live-change-by-point` định giá lại theo cầu | Bỏ — payout tính sẵn ở `makeOdds` |
| `HaiD18LoLive` (MN 18 giải) | Bỏ — Lô Live chỉ MB |
