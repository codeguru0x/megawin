# Trang Vận hành (Operations Page) — Layout & Chức năng Guideline

> **Mục đích:** Chốt layout + hành vi UI trang vận hành đã làm cho **Keno**, làm khuôn cho
> các game sau (lotto535/mega645/power655/max3d/…). Mỗi lần chỉnh trang vận hành Keno →
> cập nhật file này. File này là **guideline UI/UX**, không phải plan implementation
> (implementation ở `p0-07-operations-page.plan.md`).
>
> **Nguồn code tham chiếu (Keno):**
> `apps/backoffice/src/app/(main)/games/keno/operations/_lib/`

---

## 1. Bố cục 2 tab

Trang chia **2 tab** để giảm tải render + tách bối cảnh:

| Tab | Nội dung | Timer |
|---|---|---|
| **Giám sát** | Draw command center (điều khiển kỳ) + **Cảnh báo vận hành** (đầu tab) + KPI strip + Exposure card | Snapshot (timer 1, ETag/304) |
| **Phân tích cược** | PlayType card → Heatmap số → cụm 3 cột rủi ro [Top người chơi \| Top phải trả \| Bộ số phổ biến] → [Cược gần nhất \| Đại lý] | Snapshot + Live feed (timer 2, chỉ khi tab mở & kỳ chưa settle) |

**Cảnh báo vận hành đặt ĐẦU tab Giám sát** — việc cần xử lý ngay phải thấy trước, không cuộn tìm.

---

## 2. Hai trạng thái kỳ — luôn thiết kế cho cả hai

Mọi panel phải xử lý đúng 2 state:
- **Active/running** (đang mở bán): live feed chạy (`Live` chip nhấp nháy), heatmap/stats cập nhật ~10s/tick.
- **Settled/historical** (đã kết sổ): tắt live feed, hiện dữ liệu đóng dấu `final`. Không hiện chip Live.

Draw selector: **sort nhóm active theo `drawId` ASC** (kỳ sớm nhất / gần giờ hiện tại lên đầu).
`getUnfinishedDraws()` trả DESC → **phải re-sort** ở use-case, nếu không auto-select nhảy vào
kỳ xa nhất (sai kỳ vận hành). Auto-select mặc định = kỳ active đầu tiên sau sort.

---

## 3. Bảng số (Number grid / Heatmap) — bề mặt tương tác chính

Bảng số (Keno 80 ô; game khác dùng grid tương ứng) **không chỉ để xem heat** mà là nơi staff thao tác.

### 3.1. Chọn số tuỳ ý
- Mỗi ô render `<button>` (a11y: `aria-pressed`, keyboard). **LUÔN cho click chọn** — không có nút bật/tắt "select mode".
- **Chọn bao nhiêu số tuỳ ý**, KHÔNG giới hạn 8/9/10 ở bảng. Selection phục vụ nhiều thao tác (tra cứu combo, export, so sánh… về sau). Ràng buộc 8/9/10 chỉ áp trong dialog tra cứu.
- State `selected` **lift lên component cha** (`NumberHeatmap`) làm nguồn sự thật; grid + dialog cùng đọc/ghi (composition: decouple state khỏi UI con).

### 3.2. Mỗi ô hiển thị: Dòng tiền + số lượt
- Ô hiện: badge số (góc trên trái) · **Dòng tiền** (giá trị chính, giữa) · số lượt `Nx`.
- **Heat intensity nền theo Dòng tiền** — số nóng = số bị dồn tiền nhiều nhất. 5 cấp: cold→low→mid→warm→hot (hot = amber cross-game).

### 3.3. ⚠️ KHÔNG hiển thị per-number liability ("rủi ro chi trả nếu số này ra")
Đây là **quyết định quan trọng** (rút kinh nghiệm Keno 29/07):

- Keno quay **20 số/kỳ**. Một board pick-N chỉ trả thưởng khi trúng **đủ ngưỡng số** của nó, **KHÔNG** phải khi "1 số cụ thể ra".
- Gán worst-case của board (vd pick10 = 2 tỷ) cho **từng số** trong board → 1 board pick10 cộng 2 tỷ vào cả 10 ô → tổng liability heatmap bị **nhân ~10 lần**, con số vô nghĩa để ra quyết định + gây hiểu nhầm.
- → **Bỏ hẳn** `potentialWin` khỏi `KenoNumberStat` (data) và khỏi ô heatmap (UI). Game sau **không** thêm lại per-number liability.
- Rủi ro chi trả đo **ở cấp entry** — xem §5 "Top phải trả tiềm năng" (per-entry, đúng, không double-count).

### 3.4. Action menu ⋯ + dialog thao tác (không render inline)
- **Nút X "Bỏ chọn tất cả"** đặt **NGOÀI menu**, cạnh counter "Đã chọn N số" (thao tác hay dùng → nằm sẵn, không giấu trong menu).
- **Action menu ⋯** (`DropdownMenu`) ở góc phải header Card — chứa các thao tác trên bảng số. Hiện tại: "Tra cứu P8/9/10" (enable khi đã chọn ≥ 1 số). Điểm mở rộng chuẩn cho export, so sánh 2 kỳ… về sau.
- **Mỗi thao tác mở dialog riêng** (`Dialog`) — **KHÔNG render inline dưới bảng**. Dialog tra cứu: input CSV editable (đồng bộ 2 chiều với selection) + chips số (click chip = bỏ) + counter "Đã chọn N số · pickN / cần 8/9/10" + kết quả accounts. Dialog **tự validate** đúng 8/9/10 (nút Tra cứu disabled nếu sai), play type suy theo số lượng.

---

## 4. Cảnh báo vận hành (Alerts panel) — đọc là hiểu, không lộ JSON

Rút kinh nghiệm Keno (payload thô hiện `pick=pick10 · sets=29 · top=[object Object]`):

- **KHÔNG render payload thô** dạng `k=v · k=v`. Payload nested (array/object) sinh `[object Object]`.
- **Formatter theo từng loại alert** → 1 câu tóm tắt tiếng Việt + các **chip số liệu** nổi bật. Loại chưa có formatter → fallback liệt kê field primitive (bỏ object/array).
  - `large_bet` → "N cược lớn trong kỳ (ngưỡng ≥ X VND)" + chip [Số cược lớn, Ngưỡng].
  - `exposure_threshold` → "Rủi ro chi trả tối đa chạm P% hạn mức kỳ" + chip [% hạn mức, Worst-case, Hạn mức kỳ].
  - `sidebet_skew` → "Tiền cược [pair] dồn P% về một hướng" + chip [Hướng, Tỷ lệ lệch, Tổng cặp].
  - `cap_sets_near` → "PickN: S bộ trọn bậc, gần cap C bộ" + chip [Bộ trọn, Cap kỳ].
  - `combo_concentration` → "N người chơi cùng dồn 1 bộ số" + chip [Người chơi, Số bộ, Tổng tiền].
- **Severity trực quan:** chấm màu + viền trái item (đỏ=critical, amber=warning, sky=info); critical thêm icon ⚠️ ở accordion header (chỉ khi còn alert `new` — xem mục ack dưới đây). Accordion mở sẵn nhóm **còn alert cần xử lý**; nhóm đã xử lý hết đóng lại.
- Chip số cần chú ý (tiền lớn / % rủi ro) tô **đỏ** (`danger`).
- **Item đã Ack → KHÔNG xoá khỏi UI, nhưng thu gọn dưới mỗi nhóm (chốt 30/07/2026):** `ack` chỉ có nghĩa "staff đã biết", KHÔNG có nghĩa "hết rủi ro" (dedupeKey vẫn còn, payload vẫn cập nhật mỗi tick worker). Xoá hẳn mất audit trail (ai xử lý lúc nào) và có thể che mất tín hiệu "vấn đề còn treo". Nhưng để lẫn cùng cấp với alert `new` khi cấu hình ngưỡng quá nhạy (VD `comboAccountsWarn` thấp → hàng chục alert `combo_concentration`) làm panel dài, khó quét mắt việc thật sự cần làm.
  - Mỗi accordion nhóm: chỉ render item `status=new` mặc định; item đã ack đẩy xuống 1 dòng gọn **"Xem N đã xử lý ▾"** cuối nhóm (per-group toggle, không phải global — mỗi loại alert có nhịp xử lý riêng).
  - Badge count trên `AccordionTrigger` chỉ đếm phần **cần xử lý** (`new`), khớp ý nghĩa với badge header (mới/critical) — không cộng cả phần đã ack (staff dễ hiểu lầm "còn N việc" khi thực ra đã xử lý xong).
  - Accordion `defaultValue`: nhóm còn alert `new` → mở sẵn; nhóm toàn `ack` → đóng (không chiếm mắt khi không còn gì cần làm).
  - Nhóm hết alert `new` (đã xử lý sạch) → hiện 1 dòng phụ "Đã xử lý hết cảnh báo mới của nhóm này." thay vì trống trơn — xác nhận trạng thái yên tâm.
- **Minh bạch người cược (rút kinh nghiệm Keno 29/07):** alert liên quan tài khoản (large_bet có `payload.top` là danh sách entry lớn) render **list entry**: `PlayerName` (username đồng nhất) + tiền cược + rủi ro, mỗi dòng **link → trang Outstanding của player kỳ đó** (drill sẵn draw × đại lý × player). Trang outstanding có sẵn entry detail dialog → staff thấy "ai cược, cược gì, bao nhiêu". Link dựng bằng `buildOutstandingHref(gameProduct, drawId, accountId, username)`; tenant suy từ suffix `@tenantId`. Alert không có account cụ thể (exposure/sidebet/cap_sets) → không cần link.

---

## 5. Các panel số liệu — compact, bao quát, không trống trải

Nguyên tắc: **dày dữ liệu, ít khoảng trống ngang**. Rút kinh nghiệm layout Keno (nhiều card full-width 1 dòng → trống bên phải).

- **Cụm rủi ro 3 cột** = [**Top người chơi** \| **Top phải trả tiềm năng** \| **Bộ số phổ biến**] (chốt 29/07 v3). Ba panel cùng bản chất "**bảng xếp hạng rủi ro/concentration**" → gom 1 cụm (`@640px:grid-cols-2`, `@1000px:grid-cols-3`), mỗi Card tự ẩn khi rỗng. **KHÔNG chôn "Bộ số phổ biến" trong Card heatmap** — heatmap là bề mặt **tương tác thuần** (chọn số + action menu), khác mục đích với bảng xếp hạng.
  - **Top người chơi:** rank badge (top 1 emerald), tiền cược tô **emerald** (dòng tiền vào), `PlayerOutstandingLink` → drill outstanding player kỳ này.
  - **Top phải trả tiềm năng:** rank badge (top 1 đỏ), `potentialWin` (per-entry, đúng — §3.3) trong **ô nền đỏ nhạt** nhãn "Phải trả" (rủi ro phải nổi nhất), + tiền cược phụ, `PlayerOutstandingLink`.
  - **Bộ số phổ biến nhất:** bộ pick8/9/10 nhiều người dồn (tín hiệu syndicate, cùng họ `combo_concentration`). Hiển thị **ĐỦ số** (wrap), medal 🥇🥈🥉, `boardCount` bộ / `entryCount` người. **KHÔNG collapse "+N"**.
- **Cược gần nhất (Live feed) = cột RỘNG (chính):** đây là dữ liệu live hữu ích nhất → cho cột rộng (`1fr`), KHÔNG bóp vào cột hẹp. Hiển thị **ĐỦ số** mỗi entry (wrap). **Chia 2 cột LỆCH theo luật chơi** (chốt 29/07 v2): **Pick cơ bản cột rộng (`1.7fr`, trái)** — nhiều số, pick10=10 badge cần bề ngang; **Side bet cột hẹp (`1fr`, phải)** — chỉ 1 chip Lớn/Nhỏ, Chẵn/Lẻ. Mỗi cột header (icon + đếm) + **cuộn ĐỘC LẬP** (`max-h` ~560) → thấy cược mới nhất của cả 2 nhóm cùng lúc, không cuộn qua nhóm này mới tới nhóm kia. Container query `@[32rem]/feed` → màn hẹp stack dọc (Pick trên). Cược lớn (≥ ngưỡng) tô nền/viền đỏ + chip "Cược lớn".
- **Phân tích theo đại lý = card HẸP (phải), thích ứng số lượng:** core là RGS B2B → thường 1–2 tenant. **KHÔNG** dùng bảng 1fr trống trải cho vài dòng. Thay bằng: **≤ 3 đại lý → mỗi đại lý 1 card giàu thông tin** (rank + tên + % share + bar doanh thu + 3 ô chỉ số: doanh thu / hoa hồng / người chơi+lượt). **> 3 đại lý → bảng compact cuộn** (`max-h` + scroll). Đặt cột hẹp (`24rem`) cạnh Live feed cột rộng.
- **Side bet:** mỗi cặp (Lớn↔Nhỏ, Chẵn↔Lẻ) là **1 card compact** gộp phân bổ tiền 2 đầu + split bar đối xứng + % + hoà. Hướng ≥ `sidebetSkewPct` (từ config) → amber + badge "lệch X%". KHÔNG tách donut + progress bar full-width (dư diện tích).

---

## 6. Nhãn & thuật ngữ

- UI việt hoá: "Liability" → **"Rủi ro chi trả"**; giữ `liability`/`potentialWin` trong code/data.
- **Username hiển thị (rule `player-display-username.mdc`):** luôn `<primary> · <tenantId>` qua component chung **`@/components/player-name`** (`PlayerName`/`PlayerOutstandingLink`/`buildOutstandingHref`, nhận `gameProduct` để dựng đúng link outstanding của game đang xem) — **KHÔNG** raw `player4@devone`, **KHÔNG** show `accountId` dòng phụ (accountId chỉ dùng dựng link). Component này dùng chung **toàn backoffice**, không riêng Keno; game khác import thẳng, KHÔNG copy riêng vào `_lib/`.
- Số tiền: `formatNumber` (đầy đủ) ở bảng/tooltip; `formatCurrency` rút gọn (tr/k) ở ô heatmap/legend chật.

---

## 7. Checklist khi rollout trang vận hành sang game mới

- [ ] 2 tab Giám sát / Phân tích; alerts panel đầu tab Giám sát.
- [ ] Draw selector sort active `drawId` ASC + auto-select kỳ sớm nhất.
- [ ] Bảng số: click chọn tuỳ ý, state lift lên cha, X "Bỏ chọn" ngoài menu, action menu ⋯ → dialog riêng.
- [ ] Ô số chỉ Dòng tiền + số lượt; **KHÔNG** per-number liability.
- [ ] Alerts: formatter theo type (câu + chip), không lộ JSON/`[object Object]`; severity dot + viền. Alert account-related (large_bet) list entry + link → outstanding player kỳ này.
- [ ] Bộ số phổ biến & Live feed hiển thị đủ số (wrap). **Bộ số phổ biến tách khỏi Card heatmap** → cụm rủi ro.
- [ ] Cụm rủi ro **3 cột** [Top người chơi (emerald) \| Top phải trả (đỏ nền) \| Bộ số phổ biến] (`@1000px:grid-cols-3`, `@640px:grid-cols-2`).
- [ ] Live feed = cột rộng, chia **2 cột lệch** Pick cơ bản (rộng) | Side bet (hẹp), mỗi cột header + count + cuộn độc lập; Đại lý = card hẹp thích ứng (≤3 → card giàu thông tin, >3 → bảng cuộn).
- [ ] **Thứ tự panel: rủi ro TRƯỚC** (cụm 3 cột) → monitoring/phân bổ SAU (Live feed | Đại lý). Trang giám sát rủi ro: thứ giúp ra quyết định lên đầu, KHÔNG đưa Live feed/Đại lý lên trước Top risk.
- [ ] Layout compact: gộp cặp side bet 1 card; [Live feed (rộng) | Đại lý (hẹp)] 2 cột.
- [ ] Username hiển thị `<primary> · <tenant>` qua `@/components/player-name` (component chung backoffice, không copy riêng); KHÔNG raw `@`, KHÔNG show accountId (rule `player-display-username.mdc`).
