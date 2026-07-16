# 03 — Place Bet (Đặt cược) & Multi-term

> Luồng đặt cược **pre-paid** (trừ ví player khi cược) — giống Keno/Bingo18, KHÁC hoàn toàn ref (post-paid ghi nợ
> đại lý). Tái dùng pattern place-bet của game hiện có: state machine + WAL (`tx_intents`) + idempotency `tx` UUIDv7.
> Nguồn: `game-bingo18` ticket flow, ref `07-game-play-dat-cuoc.md` (chỉ lấy công thức tính tiền).
>
> **Cập nhật v3:** naming `gameType`→`region`, giữ `playType`; thêm validation **`position`** + **`betMode`**;
> multi-term = nhiều ngày, **cho phép trộn nhiều đài trong 1 vé** (`[Chốt]`), kiểm tra kỳ đã kết sổ.
>
> **Cập nhật v4 `[Chốt]`:** selection dùng field canonical **`picks: string[]`** (grammar theo betMode — 01 §2.3.1);
> validate **2 lớp trạng thái** (draw status + `draw.markets[marketKey]` — 01 §5.1) + **marketRules** theo viewKey
> (`isEnabled`, min/max point, `maxPointPerNumber` — 02 §2.4).

---

## 1. Công thức tính tiền — `[Chốt]`

### 1.1 Mỗi board

```
boardAmount = pricePerPoint(board) × board.point
```

- `pricePerPoint` đã gồm number surcharge (resolve ở `02-config-pricing.md §5`).
- Board `exact` nhiều pick (Lô nhiều số): `boardAmount = Σ_pick (pricePerPoint(pick) × point)` — mỗi số 1 giá do surcharge riêng.
- Board `parity`/`sizes`: 1 pick duy nhất, không surcharge → `boardAmount = pricePerPoint × point`.

### 1.2 Mỗi kỳ (per draw)

```
amountPerDraw = Σ_board boardAmount
```

### 1.3 Cả vé (multi-term, có thể trộn đài)

```
// Mỗi board mang region riêng. Board chỉ sinh entry cho các draw CÙNG region.
totalAmount = Σ_draw ( Σ_board(region == draw.region) boardAmount )
```

- `drawIds` = danh sách kỳ mua (mỗi ngày × mỗi đài 1 kỳ). Có thể trộn nhiều đài & nhiều ngày trong 1 vé `[Chốt]`.
- Ví dụ `[Chốt]` đơn giản: số `00`, 10 điểm, 700đ/điểm, 1 kỳ MB → `700 × 10 = 7.000đ`.

> **Multi-term semantics (`[Chốt]`):** mỗi đài **1 kỳ/ngày** → "mua nhiều kỳ" = nhiều ngày (và/hoặc nhiều đài).
> Mỗi cặp **(board × draw cùng region)** → 1 entry. Board region A KHÔNG sinh entry cho draw region B. Tiền trừ 1 lần
> lúc mua = `totalAmount`.

---

## 2. State machine place-bet (tái dùng game hiện có)

```
prepare  → validate → reserve(WAL) → withdraw(ví) → persist → notify
```

| Bước | Việc | Ghi chú |
|---|---|---|
| `prepare` | Sinh `tx` (UUIDv7), ticketNo (`LOT-YYYYMMDD-NNNNN`) | Idempotency |
| `validate` | Kiểm tra board hợp lệ (xem §3), draw còn mở bán, tenant `isEnabled` | Fail-fast |
| `reserve` | Ghi WAL `tx_intents` (crash-safe) | Recovery scheduler |
| `withdraw` | Trừ ví player `totalAmount` (pre-paid) | player-sdk / wallet |
| `persist` | Insert `LotteryTicketDoc` + N `LotteryTicketEntryDoc` (1 per kỳ) | |
| `notify` | Emit feed/event | tenant feed |

> **Khác Keno:** Keno có `unitPrice` cố định × betCount. Lottery dùng `pricePerPoint × point` (point là biến chính,
> giá theo số). Bản chất cùng khung: `amount = giá × lượng`.

---

## 3. Validation theo playType × position × betMode (place-bet)

Dùng `LOTTERY_PLAY_TYPES_BY_REGION` (đài nào cho playType nào) + `LOTTERY_BET_MODES_BY_PLAY_TYPE` +
`LOTTERY_POSITION_FIRST_PLAY_TYPES` + `LOTTERY_PRIZE_SELECTOR_PLAY_TYPES` + grammar `picks`
(`01-domain-model.md §2.3.1, §7`):

1. `board.region` ∈ 4 đài; `board.playType` ∈ tập hợp lệ của đài đó (`LOTTERY_PLAY_TYPES_BY_REGION`).
2. `board.position`: mặc định `last`. Nếu `first` → playType phải ∈ `LOTTERY_POSITION_FIRST_PLAY_TYPES` (`de`/`lo`);
   riêng `lo`+`first` chỉ hợp lệ đài MB (MN chưa mở Lô đầu).
3. `board.betMode` ∈ tập hợp lệ của playType đó (`LOTTERY_BET_MODES_BY_PLAY_TYPE`; mặc định chỉ `exact`).
4. **Validate `picks` theo grammar của betMode** (01 §2.3.1) — mỗi betMode có 1 validator riêng, betMode
   mới trong tương lai chỉ cần thêm validator, KHÔNG đổi schema:
   - `exact`: token là con số zero-padded, độ dài theo playType:
     - 2 số: `de`, `lo`, `loLive`, `lo2D7` → `"00"–"99"`, ≥1 token distinct.
     - 3 số: `ba3D`, `ba3D17`, `ba3D7` → `"000"–"999"`.
     - 4 số: `bon4D`, `bon4D16` → `"0000"–"9999"`.
     - Xiên: `xien2/3/4` → đúng 2/3/4 token 2-chữ-số, distinct.
   - `parity`: đúng 1 token ∈ `{even, odd}`.
   - `sizes`: đúng 1 token ∈ `{xiu, tai}`.
5. `prizeSelector`: chỉ hợp lệ cho `de` (`LOTTERY_PRIZE_SELECTOR_PLAY_TYPES`). Mặc định `{tier:"special",index:0}`.
   `tier` hợp lệ với đài (MB tới `seventh`, MN có `eighth`), `index` trong phạm vi số bộ của hạng giải đó.
6. **Market status 2 lớp + market rules (`[Chốt: v4]`)** — cho `marketKey = ${playType}.${position}.${betMode}`,
   `viewKey = ${region}.${marketKey}`:
   1. `marketRules[viewKey].isEnabled !== false` (config dài hạn — 02 §2.4; resolve tenant → global).
   2. `draw.status = salesOpen` (lớp 1 — lifecycle).
   3. `draw.markets[marketKey].status = open` (lớp 2 — runtime; `suspended`/`closed` → reject với reason).
7. `point` trong `[minPoint, maxPoint]` — resolve `marketRules[viewKey].min/maxPointPerBoard` →
   fallback `LotteryPlayRules.min/maxPointPerBoard` (02 §2.4).
8. **`maxPointPerNumber` (trần nhận cược 1 con — 02 §2.4):** nếu market có trần, với từng pick token:
   `riskDoc.numberPoint + board.point ≤ maxPointPerNumber` (đọc `LotteryRiskDoc` của kỳ — 07). Vượt → reject
   board đó với mã lỗi rõ (`NUMBER_LIMIT_EXCEEDED`) kèm số điểm còn nhận được.
9. `loLive` chỉ hợp lệ khi `region = mienBac` **và** market `loLive.*` đang `open` (LiveState điều khiển — xem `05`).
10. **Multi-term / multi-đài (`[Chốt]`):**
    - `drawIds` ≤ `maxDrawCount`; tất cả `drawId` phải **tồn tại & chưa kết sổ** (status ∈ {scheduled, sales_open};
      **từ chối** kỳ đã `sales_closed`/`published`/`settled`).
    - Cho phép trộn nhiều đài & nhiều ngày. Mỗi board phải có **ít nhất 1 draw cùng region** trong `drawIds`
      (nếu không → board vô nghĩa, reject).
    - Lớp 2 check **từng draw**: board chỉ hợp lệ nếu `markets[marketKey].status = open` ở TẤT CẢ draw cùng region
      trong vé (tránh vé nửa nhận nửa từ chối — đơn giản, dễ hiểu cho player).
    - `loLive` chỉ 1 kỳ (kỳ Live đang mở), không multi-term.

> **Lưu ý risk-check (bước 8) là best-effort:** đọc risk doc có độ trễ batch (07 §4) nên có thể lọt nhẹ quanh trần.
> Chấp nhận được vì trần là công cụ quản trị rủi ro mềm; chặn cứng tuyệt đối cần counter atomic riêng (Phase 2 nếu cần).

---

## 4. Ticket pricing snapshot

```ts
export interface LotteryTicketPricing {
  /** Tổng tiền vé (VND) = Σ mọi (board × draw cùng region). Trừ ví 1 lần. */
  totalAmount: number;
  /** Số kỳ = drawPlan.drawCount. */
  drawCount: number;
  /** Tổng điểm toàn vé (thống kê). */
  totalPoint: number;
  /** Breakdown tiền theo từng drawId (để đối soát & sinh entry). */
  perDraw: { drawId: string; region: LotteryRegion; amount: number; point: number }[];
}
```

> Khi trộn nhiều đài, tiền mỗi kỳ khác nhau (board region khác nhau) → dùng `perDraw[]` thay cho 1 `amountPerDraw` chung.

---

## 5. Entry sinh ra từ ticket

Mỗi `drawId` trong `drawPlan` → gộp các board **cùng region với draw đó** → 1 `LotteryTicketEntryDoc`:

- `entry.region = draw.region`; chỉ chứa board cùng region.
- `entry.amount = perDraw[drawId].amount` (tiền của kỳ đó).
- `entry.tenant.commissionRate` = snapshot từ TenantConfig; `commissionAmount = amount × commissionRate`.
- `entry.entrySummary.boards` = snapshot boards cùng region (kèm `picks`, `pricePerPoint`, `payout`, `betMode` —
  multikey index trên `picks` phục vụ tra cứu theo con số, 01 §4.2).
- `entry.status = pending`.

> Commission chỉ **snapshot** để đẩy tenant feed — MegaWin không chia (theo `tenant-feed-processing.mdc`).

---

## 6. Idempotency & crash-safety

- `ticket.tx` (UUIDv7) unique → chống double-submit.
- WAL `tx_intents` + recovery scheduler: nếu crash sau `withdraw` trước `persist` → replay an toàn.
- `entry.payout.payoutTx` sinh lúc settle (không phải lúc place-bet).

---

## 7. Sự khác biệt so với ref (đã loại bỏ)

| Ref | MegaWin |
|---|---|
| `getIncomeAndCommission` chia thầu 6 cấp | Chỉ trừ ví player + snapshot 1 commissionRate |
| `PlaceBettingTx` DynamoDB (payload lớn do nhiều cấp) | WAL `tx_intents` như game hiện có; DynamoDB chỉ nếu payload vượt ngưỡng (cân nhắc `06`) |
| Ghi nợ đại lý (post-paid) | Trừ ví ngay (pre-paid) |
| `TicketCounter`/`TicketItemCounter` per đại lý | `draw_counters` sinh drawNo; ticketNo theo counter global |
