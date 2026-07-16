# 00 — Tổng quan sản phẩm Xổ số truyền thống (`@megawin/game-lottery`)

> **Vai trò tài liệu:** đây là bản thiết kế nền để lên plan code game mới `lottery` cho MegaWin.
> Tài liệu này **KHÔNG** phải bản dịch của `docs/game/lottery/ref` — nó lấy **luật chơi + công thức tài chính**
> từ ref nhưng **tái kiến trúc** theo đúng chuẩn game hiện có của MegaWin (Keno, Bingo 18, Mega 6/45).
>
> Mọi quyết định trong tài liệu đều có **căn cứ**: hoặc từ ref, hoặc từ code game hiện có, hoặc từ xác nhận
> trực tiếp của product owner (ghi `[Chốt]`). Điểm nào chưa rõ → liệt kê ở `06-roadmap-open-questions.md`.
>
> **Cập nhật quan trọng (v3) — đổi tên & mô hình cách chơi:**
> - `gameType` → **`region`** (đài); giữ **`playType`** (kiểu cược) — luôn có prefix `Lottery` nên không nhầm.
> - Mỗi đài **1 kỳ mở thưởng / ngày** (không nhiều lần trong ngày).
> - Mỗi board có **3 trục trực giao**: `playType` + **`position`** (`last`/`first`) + **`betMode`**
>   (`exact`/`parity`/`sizes`) + `prizeSelector?` (chỉ `de`). → "Đề đầu / theo giải chọn / Lô đầu / chẵn-lẻ / tài-xỉu"
>   KHÔNG còn là playType riêng, mà là tổ hợp trục (§4.0).
> - Cơ cấu giải chuẩn hoá theo xổ số VN thực tế (MB **27 bộ số**, MN **18 bộ số**).

---

## 1. MegaWin là **game provider thuần (RGS)** — không phải hệ thống ref

`docs/game/lottery/ref` mô tả một **operator hoàn chỉnh**: chơi tính tiền sau (post-paid), có cây đại lý đa cấp
(Owner → Company → Manager → Super → Master → Agent), chia thầu (share) và hoa hồng nội bộ giữa các cấp.

MegaWin **KHÔNG** làm những thứ đó. MegaWin đóng vai trò giống hệt Keno / Bingo 18:

| Khía cạnh | Ref (one789 operator) | MegaWin `game-lottery` (RGS) |
|---|---|---|
| Thanh toán | Sau (post-paid, ghi nợ đại lý) | **Trước** (pre-paid) — trừ ví player khi cược, như Keno |
| Cây đại lý | 6 cấp, tính WinLose từng cấp | **Không có** trong core. `tenantId` phẳng như game hiện có |
| Chia thầu (share) | Có (`ShareHolder`, `Percent`, `Income`) | **Bỏ hoàn toàn** khỏi core |
| Hoa hồng | Tính & chia nội bộ nhiều cấp | Chỉ **snapshot `commissionRate` + `commissionAmount`** vào tenant feed. Tenant tự chia (theo `.cursor/rules/tenant-feed-processing.mdc`) |
| Kết quả | Nhiều nguồn | Nhân viên MegaWin **nhập tay qua backoffice** (pattern `PublishResult` như game hiện có) |
| Giá bán | Nhảy động theo cầu (auto-price) | **Cố định theo tenant**, công ty chỉnh tay (xem §5) |

> **Nguyên tắc dịch chuyển:** mọi thứ thuộc "operator/đại lý/thầu/hoa hồng nội bộ" → **cắt khỏi core**, đẩy cho tenant.
> Mọi thứ thuộc "luật chơi/dò trúng/tính thưởng/kết sổ" → **giữ và chuẩn hoá** theo pattern MegaWin.

---

## 2. Định danh game

- **gameKey:** `lottery`
- **Package domain:** `@megawin/game-lottery` (`packages/game-lottery`)
- **Package application:** `@megawin/game-lottery-application` (`packages/game-lottery-application`)
- **DB collections prefix:** `lottery_*` (VD `lottery_draws`, `lottery_tickets`, `lottery_ticket_entries`, `lottery_game_configs`)
- **Ticket prefix:** `LOT` → `LOT-YYYYMMDD-NNNNN` (theo `.cursor/rules/player-sdk-jsdoc.mdc`, §TicketNo)

> Tên đài (Miền Bắc / Miền Nam) là **thuộc tính `region`** bên trong game `lottery`, KHÔNG phải game riêng.
> Ta giữ 1 game `lottery` với nhiều `region` — tránh nhân bản 4 package.
>
> **Naming `[Chốt v3]`:** `gameType` → **`region`** (đài); giữ **`playType`** (kiểu cược). Prefix `Lottery`
> (`LotteryPlayType`) đảm bảo không nhầm với gameKey cấp hệ thống. `region` = đài; `playType` = kiểu cược.

---

## 3. Region (Đài) — `[Chốt]`

Bốn đài, mỗi đài có **cơ cấu giải khác nhau** → là gốc rễ mọi khác biệt betType & dò trúng.
**Mỗi đài mở thưởng đúng 1 kỳ / ngày `[Chốt]`** (không nhiều lần trong ngày).

| region | Tên hiển thị | Cơ cấu giải | Số "lô" (2 số cuối mỗi bộ) | Lô Live |
|---|---|---|---|:---:|
| `mienBac` | Miền Bắc | **27 bộ số** | 27 | ✅ |
| `mienNam18A` | Miền Nam 18A | **18 bộ số** | 18 | — |
| `mienNam18B` | Miền Nam 18B | **18 bộ số** | 18 | — |
| `mienNam18C` | Miền Nam 18C | **18 bộ số** | 18 | — |

> **Giải thích mâu thuẫn yêu cầu ban đầu:** yêu cầu đầu ghi "Bỏ Đài Miền Nam 18A và B", nhưng làm rõ sau đó
> `[Chốt]` là **giữ cả 3 đài Miền Nam (18A/18B/18C)** như 3 `region` riêng. Tài liệu này theo bản chốt.

### 3.1 Cơ cấu giải Miền Bắc (27 giải)

| Hạng giải | Số lượng | Độ dài số |
|---|:---:|:---:|
| Đặc biệt (special) | 1 | 5 |
| Giải nhất (first) | 1 | 5 |
| Giải nhì (second) | 2 | 5 |
| Giải ba (third) | 6 | 5 |
| Giải tư (fourth) | 4 | 4 |
| Giải năm (fifth) | 6 | 4 |
| Giải sáu (sixth) | 3 | 3 |
| Giải bảy (seventh) | 4 | **2** |
| **Tổng** | **27** | |

### 3.2 Cơ cấu giải Miền Nam (18 giải) — áp dụng cho cả 18A/18B/18C

| Hạng giải | Số lượng | Độ dài số |
|---|:---:|:---:|
| Đặc biệt | 1 | 6 |
| Giải nhất | 1 | 5 |
| Giải nhì | 1 | 5 |
| Giải ba | 2 | 5 |
| Giải tư | 7 | 5 |
| Giải năm | 1 | 4 |
| Giải sáu | 3 | 4 |
| Giải bảy | 1 | 3 |
| Giải tám | 1 | **2** |
| **Tổng** | **18** | |

> Cấu trúc kết quả chi tiết + cách flatten để lấy "lô" xem `04-result-settle.md`.

---

## 4. PlayType (Kiểu cược) + BetMode (Cách chơi) — `[Chốt]`

PlayType là **kiểu cược** — enum `playType`. Miền Bắc và Miền Nam có
**tập playType khác nhau** vì cơ cấu giải khác nhau (`[Chốt]`: "Miền Nam có kiểu cược riêng, không giống Miền Bắc").

> **Naming `[Chốt v3]`:** dùng `region` (đài) + `playType` (kiểu cược) + `betMode` (cách chơi). `playType` luôn có
> prefix `Lottery` (`LotteryPlayType`) nên không nhầm với gameKey cấp hệ thống MegaWin.

### 4.0 Ba trục trực giao (orthogonal) của 1 board — `[Chốt: merge]`

Thay vì tạo nhiều playType trùng lặp cho "đề đầu / theo giải chọn / chẵn lẻ", 1 board mang **3 trục độc lập**:

| Trục | Field | Giá trị | Ý nghĩa |
|---|---|---|---|
| **PlayType** | `playType` | `de`, `lo`, `xien2/3/4`, `ba3D*`, `bon4D*`, `loLive`... | Kiểu cược gốc |
| **Position** | `position` | `last` (đuôi, mặc định) \| `first` (đầu) | Lấy chữ số cuối hay đầu của bộ số |
| **BetMode** | `betMode` | `exact` (mặc định) \| `parity` \| `sizes` | Chọn số chính xác / chẵn-lẻ / tài-xỉu |
| **PrizeSelector** | `prizeSelector?` | `{ tier, index }` | (Chỉ `de`) chọn giải cụ thể; mặc định = đặc biệt |

> **Hệ quả `[Chốt]`** — các "kiểu chơi" của bản v1/ref là **tổ hợp trục**, KHÔNG phải playType riêng:
> - "Đề đầu" = `de` + `position=first`.
> - "Đề theo giải chọn" = `de` + `prizeSelector={tier}`.
> - "Đề đầu theo giải chọn" = `de` + `position=first` + `prizeSelector`.
> - "Lô đầu" (MB, mới) = `lo` + `position=first`.
> - "Chẵn/lẻ", "Tài/Xỉu" = `betMode=parity|sizes`.
>
> → **Bỏ** hẳn các playType `deDau`, `deGiaiChon`, `deDauGiaiChon`, `loDau`, `dau2DChanLe`, `duoi2DChanLe` và enum
> `LotteryParity` của bản v1. Lý do: đúng chuẩn composition (tránh bùng nổ variant + state trùng — `de` chính là
> `de@special,last,exact`).

### 4.0a Giải thích keyword luật chơi — `[Chốt]`

| Keyword | Nghĩa |
|---|---|
| **"Đề"** (`de`) | So với **1 kết quả duy nhất** (theo `prizeSelector`, mặc định **giải Đặc Biệt**). 1 kết quả → **KHÔNG nháy**. |
| **"Lô"** (`lo`) | So với **toàn bộ giải** của đài (MB 27 bộ / MN 18 bộ). Nhiều kết quả → **CÓ nháy**. |
| **Position `first`** ("Đầu") | Lấy các chữ số **đầu** của bộ số. |
| **Position `last`** (mặc định, "Đuôi") | Lấy các chữ số **cuối** của bộ số. |
| **2D / 3D / 4D** | So **2 / 3 / 4** chữ số. |
| **Xiên n** | Chọn **n bộ số** cùng lúc; thắng khi **TẤT CẢ** bộ đều về. `numbers` là **mảng** n phần tử. |
| **Nháy** | Cược 1 số, so nhiều kết quả → xuất hiện bao nhiêu lần thì **thắng bấy nhiêu lần**. Chỉ `lo`/`ba3D*`/`bon4D*`/`loLive` (nhiều kết quả). |

### 4.0b BetMode — 3 cách chơi — `[Chốt]`

| betMode | Nghĩa | Trả thưởng |
|---|---|---|
| `exact` | Chọn **CHÍNH XÁC số** (mặc định). | Cao nhất |
| `parity` | Đoán kết quả là **CHẴN / LẺ**. | Thấp hơn exact |
| `sizes` | Đoán **TÀI / XỈU** (`[Chốt]` Xỉu 00–49, Tài 50–99). | Thấp hơn exact |

- Áp cho: `de`, `lo`, `lo2D7`, `loLive`.
- `ba3D*`, `bon4D*`, `xien*`: **chỉ** `exact`.
- Với `de` (1 kết quả): parity/sizes xét đúng kết quả đã chọn, không nháy.
- Với `lo` exact: có nháy. parity/sizes: xét kết quả tương ứng (chi tiết `04`).
- Với `loLive`: `exact` = so các giải còn lại (có nháy); `parity`/`sizes` = **đoán giải mở KẾ TIẾP** (xem `05`).

### 4.1 PlayType Miền Bắc

| playType | Tên | Dò trên | Nháy (exact)? | position | betMode | prizeSelector |
|---|---|---|:---:|---|---|:---:|
| `de` | Đề (+ Đề đầu / theo giải chọn) | 1 giải (mặc định ĐB) | Không | last/first | exact/parity/sizes | ✅ (mặc định ĐB) |
| `lo` | Lô / Lô đầu (2D) | cả 27 bộ | **Có** | last/first | exact/parity/sizes | — |
| `xien2` | Xiên 2 | 2 bộ số cùng về | Không | last | exact | — |
| `xien3` | Xiên 3 | 3 bộ số cùng về | Không | last | exact | — |
| `xien4` | Xiên 4 | 4 bộ số cùng về | Không | last | exact | — |
| `ba3D` | 3D đuôi | 3 số cuối các bộ ≥ 3 chữ số | **Có** | last | exact | — |
| `bon4D` | 4D đuôi | 4 số cuối các bộ ≥ 4 chữ số | **Có** | last | exact | — |
| `loLive` | Lô Live | giải còn lại (exact) / giải kế tiếp (parity/sizes) | **Có** (exact) | last | exact/parity/sizes | — |

> **Lô đầu `[Chốt]`:** = `lo` + `position=first` — so **2 số đầu** của cả 27 bộ (thay vì 2 số cuối). Có nháy.
> Bộ dài 2 chữ số (giải 7 MB) → "2 số đầu" = "2 số cuối" = cả số, vẫn tính vào Lô đầu.

### 4.2 PlayType Miền Nam (18A/18B/18C) — `[Chốt: theo ref]`

Do 18 bộ số, tập lô/độ dài khác MB. Danh sách chốt (không có Lô Live, không có Lô đầu):

| playType | Tên | Dò trên | Nháy? | position | betMode |
|---|---|---|:---:|---|---|
| `de` | Đề (+ Đề đầu / theo giải chọn) | 1 giải (mặc định ĐB) | Không | last/first | exact/parity/sizes |
| `lo` | Lô (2D 18 Lô) | 2 số cuối cả **18 bộ** | **Có** | last | exact/parity/sizes |
| `lo2D7` | 2D 7 Lô | 2 số cuối của **7 giải tư** | **Có** | last | exact/parity/sizes |
| `ba3D17` | 3D 17 Lô | 3 số cuối các bộ ≥ 3 số (17 bộ) | **Có** | last | exact |
| `ba3D7` | 3D 7 Lô | 3 số cuối của 7 giải tư | **Có** | last | exact |
| `bon4D16` | 4D 16 Lô | 4 số cuối các bộ ≥ 4 số (16 bộ) | **Có** | last | exact |
| `xien2` / `xien3` / `xien4` | Xiên 2/3/4 | tổ hợp cùng về | Không | last | exact |

> **Số "lô" (7/16/17/18)** bắt nguồn từ số bộ có độ dài ≥ độ dài yêu cầu, theo cơ cấu 18 bộ MN. Tập bộ cụ thể
> để dò từng playType ghi trong `04-result-settle.md`.
>
> **MN chưa mở Lô đầu** (`lo` position chỉ `last`) — nếu product cần, thêm sau như MB.

### 4.3 "Theo giải chọn" (prizeSelector) — `[Chốt: seven_plus]`

Chỉ áp cho `playType=de`. Player **chọn 1 giải bất kỳ** (mọi hạng: đặc biệt → giải 7/8) và chơi **2 số cuối**
(`position=last`) hoặc **2 số đầu** (`position=first`) của **đúng giải đó**. Mặc định `prizeSelector` = giải Đặc Biệt.

- Board input kèm `prizeSelector` (VD `{ tier: "seventh", index: 0 }`).
- Giải có nhiều bộ (VD giải ba MB 6 bộ) → `index` chỉ định bộ. Chi tiết `01-domain-model.md`.
- Thắng khi 2 số player khớp 2 số (đầu/cuối) của giải đã chọn (hoặc đúng chẵn/lẻ, tài/xỉu nếu betMode ≠ exact).

### 4.4 Chẵn/lẻ & Tài/Xỉu

Không có playType riêng — dùng `betMode=parity` hoặc `betMode=sizes` trên playType gốc (§4.0b).
`DrawResult` lưu sẵn cờ chẵn/lẻ & tài/xỉu của các giải chuẩn để settle nhanh (chi tiết `04`).

---

## 5. Mô hình GIÁ BÁN & ĐIỂM — `[Chốt: keep_unit_price]`

Đây là điểm khác biệt lớn nhất so với ref. **Giá KHÔNG nhảy tự động.**

### 5.1 Khái niệm

- **Điểm (`point`)**: đơn vị cược. Player chọn số điểm cho mỗi con số.
- **Giá bán mỗi điểm (`pricePerPoint`, VND)**: số tiền player trả cho **1 điểm**. **Đây chính là "giá bán".**
- **Payout (odds)**: tỉ lệ trả thưởng (VD Đề "1 ăn 99"). Là **khái niệm riêng**, cấu hình riêng, KHÔNG phải giá bán.

### 5.2 Công thức tính tiền player phải trả

Tính theo từng board (1 kiểu cược × 1 con số × 1 kỳ), rồi cộng toàn vé:

```
boardAmount = pricePerPoint × point        (cho 1 kỳ)
payAmount   = Σ boardAmount  (qua mọi board × mọi kỳ trong vé)
```

- Vé multi-term có thể **mix nhiều đài + nhiều ngày**; mỗi kỳ resolve `pricePerPoint` riêng (surcharge có thể khác).
  Vì vậy KHÔNG dùng 1 hệ số `betCount` phẳng — cộng breakdown per-draw (xem `03-placebet.md` §pricing).
- Ví dụ `[Chốt]`: cược số `00`, 10 điểm, giá 700đ/điểm, 1 kỳ → `700 × 10 = 7.000đ`.

### 5.3 Tăng giá — 3 tầng override (mở rộng pattern `KenoPrizeOverrides`)

Công ty có quyền tăng giá **toàn tenant** hoặc **1 tenant cụ thể**, tới mức **từng con số trong 1 kiểu cược** `[Chốt]`:

1. **Global default** (`GlobalConfigDoc`): giá mặc định mỗi (`region`, `playType`). Payout mặc định mỗi (`region`, `playType`, `betMode`).
2. **Tenant override** (`TenantConfigDoc`): tenant chỉnh giá mỗi (`region`, `playType`) và/hoặc payout mỗi (`region`, `playType`, `betMode`).
3. **Number surcharge** (bảng phụ trong TenantConfig / GlobalConfig): tăng thêm cho **(region, playType, số cụ thể)**.
   - Ví dụ `[Chốt]`: tăng +5đ cho số `00` của Lô MB → `00` thành 705đ/điểm, các số khác vẫn 700đ.

> Giá **không** phụ thuộc `betMode` (chẵn/lẻ, tài/xỉu vẫn trả tiền/điểm như exact) — chỉ **payout** phân theo `betMode`.

> Giá cuối cùng resolve theo thứ tự: `numberSurcharge ?? tenantOverride ?? globalDefault`.
> Chi tiết cấu trúc & thuật toán resolve trong `02-config-pricing.md`.

---

## 6. Những gì **BỎ** khỏi core (so với ref) — `[Chốt]`

| Bỏ | Lý do |
|---|---|
| Miền Bắc 2 (MB2) | Gộp: chỉ còn "Miền Bắc"; kéo 3D đuôi & 4D đuôi sang MB |
| Thần Tài, Đề đầu Thần Tài | Yêu cầu bỏ |
| Lô Trượt, Đề Trượt | Yêu cầu bỏ |
| Cây đại lý đa cấp + chia thầu (Share) | MegaWin RGS thuần |
| `ancestorBookKeepingResult` (WinLose 6 cấp) | Không có đại lý trong core |
| Auto-price / relationship-price / extra-price động | Giá cố định per-tenant (§5) |
| Kết sổ thử `temp_*` cho đại lý | Không có đại lý; có thể thêm sau nếu ops cần |
| Stop-number theo cấp đại lý | Nếu cần chặn số → dạng đơn giản per-tenant/global (bàn ở roadmap) |
| `LotteryParity` enum + playType `dau2DChanLe`/`duoi2DChanLe` (bản v1) | Thay bằng `betMode` (§4.0b) |
| playType `deDau`/`deGiaiChon`/`deDauGiaiChon`/`loDau` riêng (bản v1) | Thay bằng trục `position` + `prizeSelector` trên `de`/`lo` (§4.0) |

## 7. Những gì **GIỮ & CHUẨN HOÁ**

| Giữ | Chuẩn hoá thành |
|---|---|
| Luật dò trúng + đếm nháy (`Frequence`) | Helper trong `game-lottery-application` (xem `04`) |
| Công thức `Result = Payout × Point × nháy` (có nháy) / `Payout × Point` (không nháy) | Settle use-case |
| `WinLose = Result − NetAmount` (post-paid ref) | **Bỏ** — pre-paid tách `amount` (trừ ví lúc cược) & `payoutAmount` (trả khi thắng); `profit` suy ở `DrawFinancial` |
| Lô Live định giá động | `05-lolive.md` — Phase 1 |
| Multi-term (mua nhiều kỳ = nhiều ngày) | `boards[]` + `drawPlan.drawIds`, như game hiện có |
| Nhập kết quả tay | Backoffice `PublishResult` |

---

## 8. Bản đồ tài liệu

| File | Nội dung |
|---|---|
| `00-tong-quan.md` | (file này) product scope, Region, PlayType, position, betMode, giá/điểm, bỏ/giữ |
| `01-domain-model.md` | Entities: Draw, Ticket, Entry, Config; board schema unified (region/playType/position/betMode) |
| `02-config-pricing.md` | GlobalConfig/TenantConfig, resolve giá 3 tầng, payout table |
| `03-placebet.md` | Luồng đặt cược, multi-term (nhiều ngày), tính tiền, betMode validation, idempotency |
| `04-result-settle.md` | Cấu trúc kết quả MB27/MN18, dò trúng từng playType/position/betMode, nháy, settle & financial |
| `05-lolive.md` | Lô Live: settle sau kỳ, makeOdds chuyển giá từ Lô, staff ping, betMode Live (Phase 1) |
| `06-roadmap-open-questions.md` | Phân phase, cấu trúc package, câu hỏi còn mở |
| `07-risk-exposure.md` | Bảng phơi nhiễm (exposure) theo (region, số, position) để staff cân nhắc tăng giá |
