# Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) — Overview

> **Status:** `designed` · **Ngày tạo:** 28/08/2026 · **Sửa lớn:** 29/08/2026 (chuyển sang config-only)
> **Phạm vi:** gợi ý + prefill `vietlottRef` khi staff nhập kết quả, 7 game.
> **KHÔNG thuộc phạm vi:** tự động lấy kết quả — xem [`../draw-result-auto-import/`](../draw-result-auto-import/00-overview.md).

## 1. Vấn đề

Staff nhập tay mã kỳ Vietlott cho từng kỳ. Keno 119 kỳ/ngày + Bingo18 158 kỳ/ngày = 277 lần gõ số 7
chữ số mỗi ngày, không có gì chặn gõ sai.

`drawPeriod` của Vietlott là counter **tăng đúng 1 mỗi kỳ quay**. Biết mã kỳ của một mốc → suy ra
được mọi kỳ khác bằng số học.

## 2. Dữ kiện đã verify

| Dữ kiện | Nguồn |
| --- | --- |
| `drawPeriod` tăng đều 1, liên tục bắc cầu qua ngày (`#0293475` → `#0293476`) | dataset 3 ngày, [analysis §4.3](../../analysis/system-draw-result-auto-import.analysis.md) |
| Keno 119 kỳ/ngày (06:08→21:52, 8'), Bingo18 158 kỳ/ngày (06:06→21:48, 6') | config + dataset |
| Vietlott **KHÔNG expose giờ quay** — chỉ Ngày + Kỳ + Kết quả | ảnh trang chi tiết 27/08 |
| `drawTime` các kỳ MegaWin nằm **đúng trên lưới** `firstDrawTime + k×interval` | `calcDrawSlots` + vận hành 28/08 |
| MegaWin hiện mở **ít kỳ hơn** Vietlott, tương lai mở đủ | vận hành 28/08 |
| Staff nhập bù trong **cùng ngày**, có thể **không theo thứ tự**, theo lô ~3h/lần | vận hành 28/08 |
| **Mỗi game một dải `drawPeriod` riêng** (Max3D ≠ Max3DPro dù quay cùng giờ) | vận hành 29/08 |
| 5 game chậm cũng có lịch giống Vietlott + counter tăng đều 1 | vận hành 29/08 (đo lại bằng dataset khi rollout) |
| `vietlottRef` **KHÔNG nằm trên đường tiền** — metadata + index tra cứu | grep: 0 call site trong settle/payout |

## 3. Lỗ hổng trong analysis §4.3 — phải sửa

Analysis doc chốt `drawNo = drawPeriod − basePeriod + 1`. **Chỉ đúng nếu mở ĐỦ 119 kỳ/ngày.** Vận
hành đang mở ít hơn → `drawNo` (atomic counter đếm kỳ **ta tạo**, `create-draw.ts:8`) không phản ánh
vị trí trên lưới:

| Kỳ | `drawNo` (ta tạo) | Vị trí lưới Vietlott |
| --- | --- | --- |
| 06:08 | 1 | 1 |
| 12:00 | **2** | **45** |
| 18:00 | **3** | **90** |

Lệch 43 kỳ ngay ở kỳ thứ hai. Đại lượng đúng là **`slotIndex` suy từ `drawTime`**, không phải
`drawNo`.

## 4. Thiết kế: config-only (chốt 29/08)

```
slotIndex(drawTime)  = vị trí kỳ trong ngày theo lịch (xem §4.1 — 3 kiểu lịch)
gợi ý = anchorPeriod + ( slotsGiữa(neo → kỳ đích) tính theo lịch )
```

Neo là **một cặp giá trị bất kỳ** trong game config: `{ anchorDrawDate, anchorDrawTime, anchorPeriod }`
— mã kỳ **của bất kỳ kỳ nào**, kèm giờ quay của chính kỳ đó. **Không đọc `vietlottRef` của kỳ nào
trong DB.**

### 4.0 Vì sao neo là "kỳ bất kỳ", KHÔNG phải "kỳ đầu ngày"

Thiết kế đầu (28/08) lưu `anchorFirstPeriod` = mã kỳ **đầu ngày**. Sai ở hai chỗ:

1. **Kỳ đầu ngày có thể bị huỷ / không quay** → không tồn tại mã kỳ đầu ngày để nhập.
2. Staff đang publish kỳ 07:04, họ biết mã kỳ *của kỳ đó*, không biết mã kỳ đầu ngày → phải tự tính
   `basePeriod = period − (slotIndex − 1)`, tức tự tính 07:04 là slot thứ 8. Đó là chỗ dễ nhập sai
   nhất, và nó đi vào đúng giá trị neo (sai neo ⇒ **mọi** kỳ sau đó sai).

→ Nhận `{ ngày, giờ quay, mã kỳ }` của **bất kỳ kỳ nào** rồi backend tự quy đổi. Staff chỉ copy 3 giá
trị họ đang nhìn thấy, không phải tính gì. Việc này xoá luôn nhu cầu "bộ đếm read-only để staff tự
kiểm phép tính" trong bản trước.

### 4.1 Ba kiểu lịch — helper phải xử lý cả ba

| Kiểu | Game | Cấu hình | `slotIndex` trong ngày | Số kỳ/ngày |
| --- | --- | --- | --- | --- |
| **A. Lưới trong ngày** | Keno, Bingo18 | `firstDrawTime` + `drawIntervalMinutes` + `lastDrawTime` | `(phút − phútĐầu) / interval + 1` | 119 / 158 |
| **B. Nhiều giờ cố định, mọi ngày** | Lotto535 | `drawTimes: ["13:00","21:00"]` | vị trí trong `drawTimes` đã sort, +1 | 2 |
| **C. Theo thứ trong tuần** | Mega645, Power655, Max3D, Max3DPro | `drawDaysOfWeek` + `drawTime`/`drawTimes` | như kiểu B | `drawTimes.length` (chỉ ngày quay) |

Mô hình hoá chung để không phải 3 nhánh rời rạc:

```
slotsPerDay(date)      → 0 nếu không phải ngày quay, ngược lại số kỳ trong ngày
slotIndexInDay(time)   → vị trí kỳ trong ngày đó
delta = Σ slotsPerDay(d) cho d trong (ngàyNeo … ngàyĐích) + (slotĐích − slotNeo)
```

Kiểu C = **kiểu B + filter ngày quay** → không cần code riêng. ⚠️ Không hardcode `slotsPerDay = 1` cho
kiểu C: thêm giờ quay là đổi **config**, không đổi code (xem [P4](p4-slow-games.plan.md)).

⚠️ **Tên field lịch không nhất quán giữa các game** — Mega645 dùng `drawTime: string`, còn Power655 /
Max3D / Max3DPro dùng `drawTimes: string[]`. Tầng gọi từng game tự map sang interface chung; helper
`game-core` không đọc tên field của game nào.

### 4.1.1 Nguồn lịch: config trong DB, KHÔNG phải `DEFAULT_*_CONFIG`

Chốt 29/08: mọi phép tính lấy lịch từ `GlobalConfigDoc` qua `GetGlobalConfigUseCase`.

Không phải lo ngại lý thuyết: `DEFAULT_KENO_CONFIG.play.firstDrawTime` đã sửa `06:00` → `06:08` trong
code, nhưng doc đã seed trong DB **không tự đổi theo**. Lấy lịch từ default sẽ lệch `slotIndex` **1 kỳ ở
mọi kỳ**, im lặng. Với kiểu C còn nặng hơn: sai `drawDaysOfWeek` làm độ lệch **tăng dần** theo khoảng
cách tới neo.

⇒ Helper `game-core` là **hàm thuần nhận lịch qua tham số**, không import `DEFAULT_*`. Config DB thiếu
field lịch → trả `null`, **không fallback** (fallback im lặng chính là cái bẫy trên).

### 4.1.2 Shape config `vietlott` thống nhất cả 7 game

| Phần | Giống nhau? |
| --- | --- |
| Type neo `VietlottPeriodAnchor` (`@megawin/game-core/types`) | ✅ **một** type chung, không nhân bản per-game |
| Field `vietlott?: VietlottPeriodAnchor` trong `GlobalConfig` | ✅ cùng tên |
| Base Zod: `anchorDrawDate` `YYYY-MM-DD` · `anchorDrawTime` `HH:mm` · `anchorPeriod` `^\d+$` string | ✅ giống |
| **Giá trị** neo | ❌ riêng từng game (mỗi game 1 dải mã kỳ trên Vietlott) |
| `.refine()` | ❌ khác theo kiểu lịch (A khớp lưới · B ∈ `drawTimes` · C thêm điều kiện ngày quay) |

7 interface cùng shape là đúng thứ `code-quality-standards.mdc` §5 cấm; chỉ `.refine()` được khác vì nó
validate neo so với lịch của chính game đó.

`slotIndex` suy từ `drawTime` + lịch trong config → **không phụ thuộc số kỳ ta mở** (§3). Mở 30 hay
119 kỳ/ngày đều ra cùng kết quả.

### 4.2 Vì sao chọn config-only

Config-only **miễn nhiễm cấu trúc** với "kỳ nhập lung tung": neo không đọc dữ liệu vận hành thì một
kỳ nhập sai không thể lan sang kỳ khác. Thiết kế trước phải dựng cả cơ chế bầu đa số chỉ để đạt điều
mà config-only có sẵn.

Bỏ được: `listVietlottRefsByDate` × 7 game, logic bầu đa số + phát hiện outlier, luật bắc cầu 1 ngày,
4 mức tin cậy, drift report tự động.

Đổi lấy: sai khi Vietlott nghỉ/nhảy số → staff cập nhật lại neo. Tần suất ~1 lần/năm (Tết). Viết
hàng loạt code ở 7 game để tự động hoá việc xảy ra 1 lần/năm là đánh đổi tệ.

### 4.3 Detector duy nhất: staff đối chiếu

Cơ chế phát hiện neo cũ = **staff nhập giá trị khác gợi ý**. Tín hiệu này có sẵn **ở client lúc
submit**, không cần query DB, không cần index.

⚠️ Điều này chỉ hoạt động nếu staff **thực sự đọc mã kỳ từ Vietlott**. Prefill ở đây là **giá trị để
đối chiếu**, KHÔNG phải giá trị để bấm qua. Bỏ quy trình đối chiếu = hệ thống mất toàn bộ khả năng
phát hiện sai. Vì vậy §7 yêu cầu 1 dòng lưu ý dưới form.

Giá trị vẫn thật: **đọc + so 7 chữ số nhanh hơn gõ 7 chữ số**.

Cảnh báo lệch phải hiện ở **mọi kỳ**, không chỉ kỳ đầu ngày (chốt 29/08) — vì mọi kỳ đều suy từ cùng
một neo, nên một kỳ lệch = neo đã cũ = **tất cả** kỳ sau sẽ lệch. Cảnh báo phải nói rõ: cập nhật neo ở
cấu hình game để các kỳ tiếp theo tự tính đúng.

### 4.4 Phiếu đối chiếu từ ref gần nhất — ĐÃ LOẠI

Từng dự kiến: lấy thêm 1 phiếu từ ref gần nhất trong DB (query invariant §6 đã cần sẵn) để cảnh báo
"neo config có thể đã cũ". **Loại**, vì nó sai đúng lúc cần nhất:

| Ngày sau kỳ nghỉ | Phiếu config | Phiếu ref gần nhất | Cảnh báo |
| --- | --- | --- | --- |
| Staff **thực sự đối chiếu**, gõ giá trị đúng | sai | đúng | ✅ nổ |
| Staff **bấm qua** theo gợi ý | sai | ref lưu = gợi ý ⇒ trùng | ❌ **im lặng** |

Hai phiếu **tương quan qua hành vi staff**: nhận gợi ý sai → giá trị sai vào DB → phiếu thứ hai suy
từ nó → đồng thuận trên cùng một giá trị sai. Đúng cái bẫy
[analysis §3.4](../../analysis/system-draw-result-auto-import.analysis.md) đã cảnh báo.

Và ở hàng đầu tiên, tín hiệu "staff nhập ≠ gợi ý" (§4.3) đã bắt được rồi. → Phiếu này chỉ hoạt động
khi tín hiệu miễn phí đã bắt, và im lặng khi không. Bỏ.

## 5. Fail-wrong — điều kiện tiên quyết phải giữ

| | Ngày nghỉ Tết → kỳ đầu ngày sau |
| --- | --- |
| Neo từ DB (thiết kế cũ) | không có ref ngày trước → **để trống** (fail-safe) |
| **Config-only** (đã chốt) | **hiện số sai** (fail-wrong) |

Fail-wrong chấp nhận được **chỉ vì** `vietlottRef` là metadata thuần — đã verify 0 call site trong
settle/payout.

⚠️ **Ràng buộc:** ngày nào `vietlottRef` được dùng cho tính toán tài chính, hoặc làm ground truth đối
chiếu cho [auto-import](../draw-result-auto-import/00-overview.md), **phải xét lại quyết định này** —
lúc đó fail-wrong không còn tolerable. Ghi vào plan để không ai lặng lẽ vượt qua ranh giới đó.

## 6. Hai việc độc lập, làm trước

1. **Bug đang xảy ra:** ô `Ngày Vietlott` default `todayVN()` ở cả 7 game, đúng phải là `drawDate`
   của chính kỳ đó. Mở kỳ `2026-06-26.019` ngày 28/08 thì ô hiện `28/08/2026` → không sửa là ghi sai
   `vietlottRef.drawDate` âm thầm.
2. **Invariant server-side** khi ghi `vietlottRef` — giá trị độc lập với phần gợi ý:
   - Không trùng `drawPeriod` với `drawId` khác (dùng index `idx_vietlott_drawPeriod` sparse để
     query; **KHÔNG** đổi thành unique index — dữ liệu cũ có thể đã trùng).
   - ⚠️ **Chốt 30/08:** đã BỎ check "`drawPeriod` đơn điệu tăng theo `drawTime`" (chi tiết + lý do ở
     [P0.2](p0-shared.plan.md)) — trùng vai trò với cảnh báo lệch trên dialog publish, lại đòi thêm
     partial index `{drawTime}` cho cả 7 game.
   - ⚠️ Invariant còn lại bắt **trùng mã kỳ**, KHÔNG bắt được typo ra mã kỳ chưa ai dùng, cũng KHÔNG
     bắt được lệch neo: khi Vietlott nghỉ, gợi ý thừa `sốNgàyNghỉ × drawsPerDay` → vẫn không trùng
     (thừa lên phía trên). Detector cho lệch neo chỉ có staff (§4.2).

## 7. Quyết định UI

| Quyết định | Nội dung |
| --- | --- |
| `vietlottRef` **giữ optional** | `undefined` đang mang ngữ nghĩa "chỉ sửa số, giữ ref cũ" ở `publish-result.ts:81`. Required không chặn được *sai*, chỉ chặn *trống* |
| **Không** hiện cơ sở suy luận | Chốt 29/08 |
| **Có** 1 dòng lưu ý dưới form Vietlott | Nhắc staff đối chiếu mã kỳ với trang Vietlott — đây là detector duy nhất (§4.3), không phải hint trang trí |
| Cảnh báo lệch ở **mọi kỳ** | Staff nhập ≠ gợi ý → cảnh báo + nhắc cập nhật neo ở cấu hình game. Vẫn cho lưu. Chốt 29/08 |
| **Hướng dẫn rõ từng trường hợp** | Không có gợi ý (thiếu neo / lệch lưới / trước ngày neo) và lệch gợi ý là **các thông báo khác nhau**, mỗi cái nói rõ nguyên nhân + việc cần làm (§7.1) |
| Tạo kỳ: chỉ điền `drawDate` | **KHÔNG** ghi `drawPeriod` suy đoán vào DB (§8) |
| Neo nhận **kỳ bất kỳ** | `{ ngày, giờ quay, mã kỳ }` — backend tự quy đổi. Staff không phải tự tính (§4.0) |

### 7.1 Các trạng thái cần thông báo riêng

| Trạng thái | Nguyên nhân | Thông báo phải nói |
| --- | --- | --- |
| Chưa cấu hình neo | `vietlott` config rỗng | "Chưa cấu hình neo mã kỳ" + link tới cấu hình game |
| Kỳ **trước** ngày neo | `drawDate < anchorDrawDate` | Neo chỉ suy được cho kỳ từ ngày neo trở đi → nhập tay, hoặc đổi neo về mốc sớm hơn |
| Giờ quay lệch lưới | `slotIndex` không nguyên (staff sửa giờ tay) | Giờ quay không nằm trên lịch chuẩn → không suy được, nhập tay |
| Lịch đã đổi sau ngày neo | `firstDrawTime`/`interval`/`drawTimes` đổi | Neo cũ không còn hiệu lực → cập nhật neo |
| **Staff nhập lệch gợi ý** | Vietlott nghỉ/nhảy số, hoặc neo cũ | Nêu cả 2 giá trị + **yêu cầu cập nhật neo** để các kỳ sau tự đúng |

⚠️ 4 trạng thái đầu đều dẫn tới "không có gợi ý" nhưng **nguyên nhân và việc cần làm khác nhau** — gộp
thành một câu chung chung sẽ khiến staff không biết phải làm gì.

## 8. Vì sao không ghi `drawPeriod` lúc tạo kỳ

| Field | Lúc tạo kỳ | |
| --- | --- | --- |
| `drawDate` | Bằng `drawDate` của kỳ — biết chắc | ✅ điền |
| `drawPeriod` | Kỳ tạo trước cho tương lai, không ai đối chiếu | ❌ không ghi |

Lúc publish, staff đang mở trang Vietlott → sai có cơ hội bị bắt. Lúc tạo kỳ **không ai đọc mã kỳ** →
ghi sẵn hàng trăm kỳ tương lai với period suy đoán = ghi sẵn hàng trăm giá trị sai nếu Vietlott nhảy
số, **và chúng trông y như dữ liệu đã xác nhận**.

Thêm nữa: ghi `vietlottRef` lúc tạo kỳ làm index `idx_vietlott_drawPeriod` (sparse) mất tính chọn lọc
— từ "chỉ kỳ đã có kết quả" thành "mọi kỳ" — và invariant "không trùng period" sẽ va vào chính các
giá trị suy đoán chưa xác nhận.

Lợi ích kéo theo: **thứ tự tạo kỳ trở nên không liên quan** tới tính đúng của `vietlottRef`. Tạo kỳ
trước/sau/xen kẽ ngày nghỉ Tết đều không sinh dữ liệu sai.

## 9. Rủi ro

| Rủi ro | Hệ quả | Xử lý |
| --- | --- | --- |
| Vietlott nghỉ (Tết) hoặc nhảy số | Gợi ý sai từ điểm đó trở đi, **fail-wrong** | Staff phát hiện khi đối chiếu → cập nhật neo config. Chấp nhận được vì metadata thuần (§5) |
| **Staff bấm qua không đối chiếu** | Sai âm thầm, không detector nào khác | Dòng lưu ý dưới form (§7) + quy trình vận hành. ⚠️ Điểm yếu chính của thiết kế, phải nêu rõ khi training |
| Kỳ đầu ngày bị huỷ / không quay | Không có mã kỳ đầu ngày để làm neo | Neo nhận **kỳ bất kỳ** (§4.0) — không phụ thuộc kỳ đầu ngày tồn tại |
| Staff nhập neo sai | Neo sai ⇒ **mọi** kỳ sau đó sai | Chỉ copy 3 giá trị đang nhìn thấy, không tự tính (§4.0). Cảnh báo lệch ở mọi kỳ giúp phát hiện sớm |
| Đổi lịch quay sau ngày neo | Lưới đổi → neo cũ vô hiệu | Cảnh báo trong UI cấu hình lịch quay + thông báo riêng ở dialog (§7.1) |
| Staff sửa giờ quay tay (`EditScheduleAction`) → lệch lưới | `slotIndex` không nguyên | **Không gợi ý**, fail rõ ràng. KHÔNG làm tròn |
| Ta mở ít kỳ hơn Vietlott | — (vô hại) | `slotIndex` suy từ `drawTime`, độc lập số kỳ ta mở (§3) |
| Gợi ý bị dùng làm ground truth cho auto-import | An toàn giả | Phân biệt nguồn qua `DrawResultSource` (`Manual`/`Import`, enum đã có, 0 call site) + ràng buộc §5 |

## 10. Phương án đã cân nhắc và loại

| Phương án | Lý do loại |
| --- | --- |
| Neo theo `drawNo` (analysis §4.3) | Sai khi mở thiếu kỳ (§3) |
| Đếm số draw trong DB giữa 2 mốc | Đếm kỳ *ta có*, không phải kỳ *Vietlott quay* (§3) |
| Neo động từ DB + bầu đa số (thiết kế 28/08) | Phức tạp hơn nhiều (7 game × repo method + voting + 4 mức tin cậy) để tự động hoá việc xảy ra ~1 lần/năm |
| Phiếu đối chiếu từ ref gần nhất | Tương quan với hành vi staff → im lặng đúng lúc cần (§4.4) |
| **Neo = mã kỳ đầu ngày** (thiết kế 28/08) | Kỳ đầu ngày có thể bị huỷ; staff phải tự tính `basePeriod` — chỗ dễ sai nhất (§4.0) |
| Job tự cập nhật neo config hàng ngày | Chỉ chép lại giá trị suy từ dữ liệu vận hành → phá tính độc lập của neo, đóng băng kỳ nhập sai vào config |
| Cấu hình lịch nghỉ Vietlott để trừ ra | Duy trì thủ công, thiếu 1 mục là sai im lặng — trong khi staff đối chiếu đã bắt được |
| Bắt buộc `vietlottRef` required | `undefined` mang ngữ nghĩa "giữ ref cũ"; required không chặn *sai* (§7) |
| Ghi `drawPeriod` suy đoán lúc tạo kỳ | Sai hàng loạt không ai đối chiếu + hỏng tính chọn lọc index sparse (§8) |

## 11. Plan — mỗi game một file

Thứ tự: **Keno trước** (plan đầy đủ nhất), các game sau chỉ ghi **phần khác biệt**, không lặp lại.

| Plan | Game | Kiểu lịch (§4.1) | Ghi chú |
| --- | --- | --- | --- |
| [`p0-shared.plan.md`](p0-shared.plan.md) | — | — | Helper `game-core` + 2 fix độc lập + vá analysis doc. **Chặn tất cả plan sau** |
| [`p1-keno.plan.md`](p1-keno.plan.md) | Keno | A (lưới 8', 119 kỳ) | **Plan tham chiếu** — mô tả đầy đủ mọi bước |
| [`p2-bingo18.plan.md`](p2-bingo18.plan.md) | Bingo18 | A (lưới 6', 158 kỳ) | Khác Keno rất ít |
| [`p3-lotto535.plan.md`](p3-lotto535.plan.md) | Lotto 5/35 | **B** (`drawTimes` 13:00/21:00) | Kiểu lịch riêng, không có `drawInterval` |
| [`p4-slow-games.plan.md`](p4-slow-games.plan.md) | Mega645, Power655, Max3D, Max3DPro | C (theo thứ) | 4 game gần như giống nhau → 1 plan chung |
