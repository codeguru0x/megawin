# 07 — Risk Exposure & Bảng Thao Tác Giá (theo dõi rủi ro để tăng giá)

> Vấn đề vận hành: staff cần biết **mỗi con số của mỗi kiểu cược đang gánh bao nhiêu rủi ro** để quyết định
> tăng `pricePerPoint`/`numberSurcharge` (xem `02` §5) trước khi kỳ đóng bán. Xổ số là trò **payout cố định
> theo con số** → rủi ro tập trung ở các "con nóng" (khách dồn cược 1 số).
>
> **Mô hình chốt (`[Chốt]`, theo tiền lệ hệ thống one — `lottery-risk-helper.ts`):** rủi ro tính **riêng cho
> từng bảng `(region, playType)`** — mỗi bảng là dải số của kiểu cược đó (100 số cho 2D, 1000 cho 3D, 10000
> cho 4D). Lưu trữ **một schema tổng hợp**, grain đủ chi tiết để UI/report **tách riêng từng kiểu** hoặc
> **gộp lại** tuỳ nhu cầu (xem §5).
>
> **Cập nhật v4 `[Chốt]`:** trường `number` thống nhất = **pick token** (grammar 01 §2.3.1) — chính là phần tử
> của `board.picks`, mọi betMode (kể cả betMode tương lai) đều có risk row; `viewKey` dùng chung định nghĩa
> 01 §2.5; risk doc là nguồn số liệu enforce **`maxPointPerNumber`** (trần nhận cược 1 con — 02 §2.4, 03 §3.8).

---

## 0. Nguyên tắc cốt lõi — `[Chốt]`

**Rủi ro của 1 con số = lời/lỗ ròng của bảng nếu con đó về.** Không đo bằng liability tuyệt đối, mà bằng
**net risk = tiền thu về − tiền phải trả** cho kịch bản "con X trúng". Có 2 họ công thức (đúng như one):

| Họ | playType | Cơ sở tính | Vì sao |
|---|---|---|---|
| **Đề** | `de` (mọi position/prizeSelector), parity/sizes | theo **tiền** (`totalIncome`) | so **1 giải** → chỉ 1 con thắng, không nháy |
| **Lô-family** | `lo`, `lo2D7`, `xien*`, `ba3D*`, `bon4D*`, `loLive` | theo **điểm** (`totalPoint`) | so **nhiều giải**, có nháy → phải ước lượng phần điểm rải từ các số khác |

> **Grain lưu trữ = `(drawId, region, playType, position, betMode, number)`.** Một schema duy nhất; các chiều
> `playType`/`position`/`betMode` cho phép **tách riêng từng bảng** khi hiển thị, và **roll-up** khi báo cáo tổng.

---

## 1. Công thức risk — tái sử dụng nguyên vẹn hệ thống one `[Chốt]`

Cho 1 con số `X` trong bảng `(region, playType)`:
- `numberPoint` = tổng điểm đổ vào **chính con X**.
- `totalPoint` = tổng điểm của **cả bảng** (mọi con của playType đó trong kỳ).
- `totalIncome` = tổng **tiền thu** của cả bảng (`Σ pricePerPoint × point`).
- `payout` = tỉ lệ trả thưởng của kiểu cược đó (odds).

### 1.1 Đề (so 1 giải, không nháy) — theo TIỀN

```
riskDe(X) = totalIncome − numberPoint × payout
```

- `numberPoint × payout` = tiền phải trả nếu con X trúng.
- Kết quả > 0 = bảng vẫn lời khi X về; < 0 = lỗ (con nóng cần tăng giá).
- Áp cho: `de` (mọi position + prizeSelector), và `de`+parity/sizes (nhị phân, 1 lần thắng).

### 1.2 Lô-family (so nhiều giải, có nháy) — theo ĐIỂM kỳ vọng

```
riskLo(X)  = round( ( (totalPoint − numberPoint) / 99   − numberPoint ) × payout )   // 2D: lo, lo2D7, xien*
risk3DLo(X)= round( ( (totalPoint − numberPoint) / 999  − numberPoint ) × payout )   // 3D: ba3D, ba3D17, ba3D7
risk4DLo(X)= round( ( (totalPoint − numberPoint) / 9999 − numberPoint ) × payout )   // 4D: bon4D, bon4D16
```

**Diễn giải:** `(totalPoint − numberPoint) / N` = điểm **kỳ vọng** mà con X "nhận" từ phần còn lại của bảng khi
trải đều trên `N` khả năng (N = 99/999/9999 tương ứng số 2/3/4 chữ số). Trừ đi `numberPoint` (điểm thực đổ vào X)
rồi nhân payout → **lệch kỳ vọng lời/lỗ** của con X. Số càng âm = con càng bị dồn cược lệch so với mặt bằng → rủi ro.

> **`[Chốt]` 3D/4D so 3/4 số CUỐI (hoặc đầu nếu có "đầu", thường không):** dải số là 1000 (3D) / 10000 (4D),
> KHÔNG quy về 2 số cuối. Vì vậy dùng mẫu số 999/9999 — không gian mẫu lớn → rủi ro nháy rất thấp.

### 1.3 Cap nháy cho worst-case (`maxFrequenceForRisk`) `[Chốt]`

Công thức §1.2 là **kỳ vọng**. Để cảnh báo sớm ("nếu con này về nhiều nháy"), tính thêm bản **worst-case** với
số nháy **cap cứng** (config, mặc định **3**) — vì trong thực tế 1 số về >3 nháy ở MB là xác suất rất thấp,
dùng maxFrequence tuyệt đối (27) sẽ quá bi quan làm nhiễu vận hành:

```
maxLiability(X) = numberPoint × payout × min(maxFrequenceForRisk, prizeCount)
                  // Đề: maxFrequenceForRisk = 1
worstRisk(X)    = totalIncome − maxLiability(X)   // dùng tiền thu để so cùng đơn vị
```

- `maxFrequenceForRisk` cấu hình ở `GlobalConfig`/`TenantConfig` (mặc định 3 cho Lô-family, 1 cho Đề).
- Staff xem **cả hai**: `riskLo` (kỳ vọng — định giá thường ngày) và `worstRisk` (worst-case cap 3 — chặn thảm hoạ).

---

## 2. Entity — `LotteryRiskDoc` (collection `lottery_risks`)

> Một schema **tổng hợp** cho mọi bảng. Grain đủ để tách riêng từng `(region, playType, position, betMode)` khi
> hiển thị (§5). **Không realtime từng bet** — cập nhật **định kỳ** (mini-batch) tránh contention hot-key (§4).

```ts
/**
 * Rủi ro tích luỹ trên 1 pick của 1 bảng cược trong 1 kỳ.
 * Grain: (drawId, region, playType, position, betMode, number).
 * `number` = PICK TOKEN theo grammar 01 §2.3.1 (chính là phần tử board.picks):
 *   exact → "00".."99"/"000".."999"/"0000".."9999"; parity → "even"/"odd"; sizes → "xiu"/"tai";
 *   betMode tương lai → token của mode đó. Nhờ vậy MỌI betMode đều có risk row, schema không đổi.
 */
export interface LotteryRiskDoc {
  _id: unknown;
  tenantId: string;               // rủi ro & giá riêng từng tenant
  drawId: string;                 // YYYY-MM-DD.NNN

  region: LotteryRegion;
  playType: LotteryPlayType;      // Lô & Lô đầu GỘP chung playType=lo (phân biệt bằng position)
  position: LotteryNumberPosition; // last | first
  betMode: LotteryBetMode;        // exact | parity | sizes

  /** PICK TOKEN (grammar 01 §2.3.1). exact: con số; parity: "even"/"odd"; sizes: "xiu"/"tai". */
  number: string;

  /** Tổng điểm đổ vào chính con/pick này. */
  numberPoint: number;
  /** Tổng doanh thu của con này (VND) = Σ pricePerPoint × point. */
  numberRevenue: number;

  /** Payout snapshot dùng để tính risk (đồng nhất trong bảng; nếu lệch → lấy weighted). */
  payout: number;

  /** Net risk kỳ vọng (riskDe / riskLo-family theo playType). Âm = lỗ nếu con về. */
  expectedRisk: number;
  /** Net risk worst-case (cap nháy maxFrequenceForRisk). */
  worstRisk: number;

  updatedAt: Date;
  version: number;                // optimistic lock cho batch upsert
}
```

> **Tổng cấp bảng** (`totalPoint`, `totalIncome`) cần cho công thức §1 → lưu riêng ở `LotteryRiskTableDoc`
> (grain `(drawId, region, playType, position, betMode)`), fold cùng lượt batch. Tránh nhân bản `totalPoint`
> vào từng con (dễ lệch khi update lệch nhịp).

```ts
/** Tổng cấp bảng — mẫu số cho công thức risk từng con. */
export interface LotteryRiskTableDoc {
  _id: unknown;
  tenantId: string;
  drawId: string;
  region: LotteryRegion;
  playType: LotteryPlayType;
  position: LotteryNumberPosition;
  betMode: LotteryBetMode;
  totalPoint: number;             // Σ point cả bảng
  totalIncome: number;            // Σ revenue cả bảng
  /** N cho công thức Lô-family: 99 (2D) | 999 (3D) | 9999 (4D). Đề: bỏ qua. */
  spaceSize: number;
  updatedAt: Date;
  version: number;
}
```

Index:
- `LotteryRiskDoc`: `{ tenantId, drawId, region, playType, position, betMode, number }` unique (upsert key);
  `{ tenantId, drawId, region, playType, position, betMode, expectedRisk: 1 }` (top-risk theo bảng).
- `LotteryRiskTableDoc`: `{ tenantId, drawId, region, playType, position, betMode }` unique.

---

## 3. Áp công thức theo playType (bảng tra — mirror one `getRisk`)

| region | playType | betMode | Công thức | N |
|---|---|---|---|:---:|
| MB/MN | `de` (mọi position/prizeSelector) | exact/parity/sizes | `riskDe` (§1.1) | — |
| MB | `lo` (last=Lô, first=Lô đầu) | exact | `riskLo` | 99 |
| MB | `lo` | parity/sizes | `riskDe` (nhị phân, so giải chuẩn) | — |
| MB | `xien2/3/4` | exact | `riskLo` | 99 |
| MB | `ba3D` | exact | `risk3DLo` | 999 |
| MB | `bon4D` | exact | `risk4DLo` | 9999 |
| MB | `loLive` | exact | `riskLo` (theo giải còn lại) | 99 |
| MB | `loLive` | parity/sizes | `riskDe` (đoán giải kế tiếp) | — |
| MN | `lo`, `lo2D7` | exact | `riskLo` | 99 |
| MN | `ba3D17`, `ba3D7` | exact | `risk3DLo` | 999 |
| MN | `bon4D16` | exact | `risk4DLo` | 9999 |
| MN | `xien2/3/4` | exact | `riskLo` | 99 |

> **Khác one:** one có 2 hàm `getRisk` (xếp Xiên vào Lô) và `getRiskForPriceManagement` (chỉ Đề + Lô cơ bản).
> MegaWin gộp thành 1 helper `LotteryRiskHelper.getRisk({ region, playType, betMode, totalPoint, totalIncome,
> numberPoint, payout, spaceSize, maxFrequenceForRisk })` trả `{ expectedRisk, worstRisk }`.

---

## 4. Cập nhật risk — pipeline (định kỳ, không hot-write) `[Chốt]`

```
place-bet (persist entry)  → KHÔNG cập nhật risk trực tiếp (tránh contention hot-key)
        │
        └─ đánh dấu dirty draw (hoặc emit "entry_persisted" Kinesis/SQS)
        │
[Worker] AggregateRisk (chạy mỗi N giây / theo batch, per drawId)
        │   1. đọc entries mới kể từ high-water mark (cursor _id UUIDv7 monotonic → idempotent)
        │   2. fold điểm/doanh thu vào LotteryRiskTableDoc + LotteryRiskDoc ($inc, optimistic version)
        │   3. tính lại expectedRisk / worstRisk từng con (công thức §1, dùng total của table doc)
        │
        └─ publish "risk_updated" → backoffice dashboard (SSE/WebSocket)
```

- **Vì sao định kỳ:** khách dồn 1 con → ghi realtime tạo hot document, contention/khoá. Batch fold (2–5s) gom
  nhiều bet thành 1 `$inc` → chịu tải tốt, đủ tươi cho quyết định giá.
- **Reset khi settle/void:** kỳ `published`/`voided` → freeze risk (giữ để audit), không fold thêm.

### 4.1 Ngưỡng cảnh báo & hành động

| Tín hiệu | Ngưỡng (config `GlobalConfig`/`TenantConfig`) | Hành động |
|---|---|---|
| `expectedRisk` < `−alertThreshold` | VD −50tr | UI đỏ con số → **tăng `numberSurcharge`** (02 §5) |
| `worstRisk` < `−hardCap` | trần cứng/con số/kỳ | **auto-throttle**: chặn bán thêm con đó (PlayRules stop-list tạm) |
| `numberPoint` ≥ `marketRules[viewKey].maxPointPerNumber` | trần điểm/con (02 §2.4) | place-bet **reject** bet mới cho con đó (03 §3.8) — enforcement đọc trực tiếp `LotteryRiskDoc.numberPoint` |
| Top-N con nóng mỗi bảng | bảng xếp hạng | điều chỉnh giá chủ động |

> **Parity/sizes cũng có risk `[Chốt]`:** bảng chỉ 2 pick (`even`/`odd` hoặc `xiu`/`tai`) nhưng khách dồn 1 bên
> vẫn tạo lệch — `riskDe = totalIncome − numberPoint × payout` áp nguyên. Bảng heat-map 2 ô, cùng pipeline.
> Đây cũng là lý do `number` = pick token: không cần schema riêng cho betMode phi-số.

> **Liên kết `02`:** tăng giá = tăng `numberSurcharge[region][playType][position][number]` (chỉ áp `betMode=exact`,
> xem `02` §5.1). Surcharge CÓ chiều `position` — khớp 1-1 với bảng risk: "Lô đầu 27" nóng → tăng đúng
> `lo/first/27`, không ảnh hưởng "Lô 27". Giá base & payout vẫn chung theo playType.

---

## 5. Backoffice — Bảng Thao Tác Giá (tách riêng từng kiểu, roll-up khi cần) `[Chốt]`

Yêu cầu: **lưu tổng hợp nhưng hiển thị tách** để staff dễ vận hành.

- **Chế độ tách (mặc định vận hành):** chọn `(region, playType, position, betMode)` → hiện đúng 1 bảng số của
  kiểu đó (100 / 1000 / 10000 ô). Đây là "Bảng Thao Tác Giá" như one — staff nhìn từng kiểu riêng, không lẫn.
  - Query: filter `LotteryRiskDoc` theo đúng 5 chiều → trả các con + `expectedRisk`/`worstRisk` + `numberPoint`.
- **Chế độ roll-up (báo cáo tổng):** group theo con số qua nhiều playType → tổng `numberPoint`/rủi ro của cùng
  1 con `X` xuất hiện ở nhiều kiểu. Dùng cho báo cáo "con nóng toàn cục".
  - Cảnh báo: **KHÔNG cộng thẳng `expectedRisk`** giữa các họ khác đơn vị (Đề theo tiền, Lô theo điểm) — roll-up
    chỉ cộng trong **cùng họ** hoặc quy về **liability tiền** (`numberPoint × payout × freq`) để so sánh chéo.
- **Heatmap** mỗi bảng: màu theo `expectedRisk`. Click con → drill-down entries.
- **Live refresh** qua `risk_updated` (SSE), 2–5s.

### 5.1 Report View Catalog — định danh & label từng bảng tách `[Chốt]`

Vì grain lưu trữ đã chứa đủ 4 chiều `(region, playType, position, betMode)`, mỗi tổ hợp hợp lệ **derive**
thành một **report view** có định danh (`viewKey`) và **label tiếng Việt** cố định — staff nhìn tên là biết
ngay đang xem bảng nào, so với vị trí nào của kết quả. **Không cần thêm field vào DB** — `viewKey` tính từ key.

```ts
/** Một view report = 1 bảng tách trên UI/report. Sinh từ tổ hợp hợp lệ, KHÔNG lưu DB. */
export interface LotteryReportView {
  /** Định danh ổn định — dùng chung LotteryViewKey (01 §2.5): `${region}.${playType}.${position}.${betMode}`. */
  viewKey: LotteryViewKey;
  region: LotteryRegion;
  playType: LotteryPlayType;
  position: LotteryNumberPosition;
  betMode: LotteryBetMode;
  /** Tên hiển thị cho staff. VD "Lô đầu". */
  label: string;
  /** Mô tả cách so kết quả — staff mới đọc là hiểu. */
  description: string;
  /** Kích thước bảng số: 100 | 1000 | 10000 | 2 (parity/sizes). */
  boardSize: number;
}
```

Catalog sinh tự động từ `LOTTERY_PLAY_TYPES_BY_REGION` × `LOTTERY_POSITION_FIRST_PLAY_TYPES` ×
`LOTTERY_BET_MODES_BY_PLAY_TYPE` (01 §2.2–2.3) — thêm playType mới là catalog tự có view mới. Label chuẩn:

**Miền Bắc:**

| viewKey (rút gọn) | Label | Cách so kết quả (description) | Bảng |
|---|---|---|:---:|
| `de.last.exact` | **Đề** | 2 số **cuối** của 1 giải (mặc định ĐB, hoặc giải chọn) | 100 |
| `de.first.exact` | **Đề đầu** | 2 số **đầu** của 1 giải | 100 |
| `de.last.parity` / `.sizes` | Đề chẵn/lẻ · Đề tài/xỉu | 2 số cuối 1 giải là chẵn/lẻ · tài/xỉu | 2 |
| `lo.last.exact` | **Lô** | 2 số **cuối** của cả 27 giải (có nháy) | 100 |
| `lo.first.exact` | **Lô đầu** | kiểu Lô nhưng so 2 số **đầu** mỗi giải (27 kết quả, có nháy) | 100 |
| `lo.last.parity` / `.sizes` | Lô chẵn/lẻ · Lô tài/xỉu | như Lô nhưng đoán chẵn/lẻ · tài/xỉu | 2 |
| `xien2/3/4.last.exact` | Xiên 2 · 3 · 4 | 2/3/4 bộ số cùng về trong 27 giải | 100 |
| `ba3D.last.exact` | **3D đuôi** | 3 số **cuối** các giải ≥3 chữ số (có nháy) | 1000 |
| `bon4D.last.exact` | **4D đuôi** | 4 số **cuối** các giải ≥4 chữ số (có nháy) | 10000 |
| `loLive.last.exact` | **Lô Live** | như Lô, chơi trong lúc quay (giải còn lại) | 100 |
| `loLive.last.parity` / `.sizes` | Lô Live chẵn/lẻ · tài/xỉu | đoán 2 số cuối **giải kế tiếp** | 2 |

**Miền Nam (18A/18B/18C — mỗi đài 1 bộ view riêng):**

| viewKey (rút gọn) | Label | Cách so kết quả (description) | Bảng |
|---|---|---|:---:|
| `de.last.exact` / `de.first.exact` | Đề · Đề đầu | 2 số cuối/đầu của 1 giải | 100 |
| `lo.last.exact` | Lô | 2 số cuối cả 18 bộ số (có nháy) | 100 |
| `lo2D7.last.exact` | 2D 7 Lô | 2 số cuối 7 bộ giải tư (có nháy) | 100 |
| `ba3D17.last.exact` | 3D 17 Lô | 3 số cuối 17 bộ ≥3 chữ số (có nháy) | 1000 |
| `ba3D7.last.exact` | 3D 7 Lô | 3 số cuối 7 bộ giải tư (có nháy) | 1000 |
| `bon4D16.last.exact` | 4D 16 Lô | 4 số cuối 16 bộ ≥4 chữ số (có nháy) | 10000 |
| `xien2/3/4.last.exact` | Xiên 2 · 3 · 4 | tổ hợp bộ số cùng về trong 18 bộ | 100 |

> Quy tắc đặt label (tự động): position=`first` thêm hậu tố **"đầu"**; betMode=`parity` thêm **"chẵn/lẻ"**,
> `sizes` thêm **"tài/xỉu"**. Catalog sống ở **domain package** (`game-lottery/src/labels/report-views.ts`,
> cạnh `labels/` đã có trong 06 §1) — backoffice và report engine cùng import, không hardcode 2 nơi.

**Ứng dụng catalog (mở rộng v4 — viewKey là "trục xương sống" xuyên hệ thống):**
1. **Bảng Thao Tác Giá**: dropdown chọn view theo `label` (nhóm theo region) → filter `LotteryRiskDoc` đúng 4 chiều.
2. **Report định kỳ / export**: mỗi `viewKey` một sheet/section, tiêu đề = `label` + `description` — staff mới
   không cần thuộc mapping position/betMode vẫn hiểu "Lô đầu = kiểu Lô so 2 số đầu".
3. **Alert**: message cảnh báo dùng label ("`Lô đầu` con `27` vượt ngưỡng...") thay vì tuple kỹ thuật.
4. **Config market rules** (02 §2.4): key của `MarketRulesTable` = `viewKey` — UI config dùng cùng dropdown/label.
5. **Đóng/mở market runtime** (01 §5.1): `draw.markets` key = `marketKey` (viewKey bỏ region) — cùng catalog label.
6. **Xem đơn cược theo bảng**: filter entries theo `(drawId, viewKey dims)` + multikey `boards.picks` → danh sách
   vé cược con số X của đúng bảng đó (1 IXSCAN — 01 §4.2).

---

## 6. Câu hỏi mở (bổ sung `06` §4)

1. **`maxFrequenceForRisk`** mặc định 3 cho Lô-family — xác nhận, và có cần khác nhau theo playType/đài không?
2. **Ngưỡng `alertThreshold` / `hardCap`** cụ thể (VND) — theo tenant hay global mặc định?
3. **Auto-throttle** bật Phase 1 hay chỉ cảnh báo, để staff thao tác tay?
4. **Chu kỳ batch** (2s? 5s?) — cân bằng độ tươi vs tải Mongo.
5. **Roll-up chéo họ** (Đề theo tiền vs Lô theo điểm): quy chung về liability tiền có chấp nhận cho báo cáo tổng?
6. **Xiên** dùng `riskLo` (N=99) như one gán vào từng số thành phần — xác nhận đủ cho Phase 1, hay track tổ hợp riêng?
