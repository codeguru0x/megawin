# Bright Data + nguồn mirror sống — hướng đi mới cho auto-import kết quả (Analysis)

> **Status:** `discussing` · **Ngày:** 30/08/2026
> **Quan hệ:** phần tiếp của [`system-draw-result-auto-import.analysis.md`](./system-draw-result-auto-import.analysis.md).
> Tài liệu đó chốt P-D (Chrome extension trên máy chuyên dụng) là phương án CHÍNH và xếp
> P-C (dịch vụ scraping như Bright Data) là "dự phòng cuối". Tài liệu này **probe thật** hướng
> P-C + minhchinh.com và tìm ra **2 fact đảo ngược một phần kết luận đó**.

## 0. TL;DR — hai phát hiện đổi cục diện

| # | Phát hiện (đo thật 30/08/2026, từ IP datacenter Singapore) | Hệ quả |
|---|---|---|
| **F1** | **`minhchinh.com` Keno ĐANG SỐNG, KHÔNG Cloudflare, có endpoint feed JSON công khai.** `GET /livekqxs/xstt/KN.php` → `200`, 554 byte, chứa `ky` (mã kỳ Vietlott), `date` (**giờ quay chính xác**), 20 số zero-padded, và **5 checksum** (`chan/le/lon/nho/total`). Lag ≤ 1 kỳ. Probe cách nhau 6' thấy kỳ tăng `293943 → 293944` | §2.3 của tài liệu cũ ("KHÔNG có mirror nào còn sống") **SAI với Keno**. Probe cũ dùng **URL sai** (`/ket-qua-keno.html` — đã chết) rồi kết luận cả site chết. Quorum không gian cho Keno **khả thi trở lại** |
| **F2** | **Bright Data Web Unlocker chi phí ~$12/tháng cho CẢ 2 game**, free tier 5.000 req/tháng đủ chạy shadow mode **miễn phí**. Nó thay thế toàn bộ hạ tầng P-D (máy Windows GUI + LaunchAgent + extension + heartbeat + device token ≈ 2 tuần công + VM chạy 24/7) bằng 1 HTTP call từ cron Lambda đã có | Cán cân **chi phí engineering** đảo hẳn về phía P-C. Nhưng **không** đảo cán cân ToS (§4) |
| **F3** | **`minhchinh.com` Bingo18 CHẾT** — dữ liệu mới nhất `#169215` ngày **29/05/2026**, chậm ~3 tháng (~13.800 kỳ). Selector hoàn hảo, HTTP `200` | Bingo18 **vẫn phải** lấy từ Vietlott → vẫn cần Bright Data hoặc P-D. Đúng cái bẫy §0 bài học #2: `200` + selector khớp ≠ nguồn sống |

**Câu trả lời một dòng cho câu hỏi của bạn:** Bright Data **có** giải được bài toán, rẻ hơn và
nhanh hơn P-D rất nhiều — nhưng thứ đáng giá nhất tìm được hôm nay **không phải** Bright Data,
mà là **feed công khai của minhchinh.com cho Keno** (không cần vượt rào gì cả). Kiến trúc đúng là
**lai**: minhchinh làm nguồn realtime rẻ + Bright Data mở đường tới Vietlott (authoritative) cho
cả 2 game.

### 0.1. Bổ sung 30/08 (chiều) — trả lời trực tiếp 3 câu hỏi: sản phẩm nào, extract bằng gì, lưu ra sao

Đọc §8 (sản phẩm + extract) · §9 (kiến trúc dữ liệu) · §10 (verify 6 lớp + delta plan). Bốn kết luận
đáng đọc trước:

| # | Kết luận | Chi tiết |
| --- | --- | --- |
| **G4** | **Bright Data chỉ làm TRANSPORT (bytes). Parser là code trong repo ta.** KHÔNG dùng Scraper Studio để extract trên đường tiền — nó có "Self-Healing Tool" sửa mapping HTML→số bằng prompt AI từ xa, không qua diff/deploy nào của ta; và nó **xoá dữ liệu sau 7–16 ngày** nên không thay được raw store | §8.3 |
| **G5** | **⚠️ Bẫy thứ tự số.** `isSameKenoResult` so **theo thứ tự** và quyết định có RESETTLE hay không; nhưng thưởng Keno chỉ phụ thuộc **tập hợp**. Dùng 1 hash duy nhất là sai theo cả 2 chiều: hoặc `Conflicted` giả 100% kỳ, hoặc resettle oan kỳ đã settle. **Bắt buộc 2 hash:** `payoutHash` (sort — so nguồn) + `displayHash` (nguyên thứ tự — quyết publish lại) | §9.2 |
| **G6** | **Giá trị lớn nhất của nguồn confirm KHÔNG phải xác nhận 20 số** (Vietlott gần như không sai số của chính nó) **mà là xác nhận KỲ NÀO.** minhchinh cho `drawTimeSource` ⇒ suy `drawNo` từ đồng hồ, độc lập chuỗi `drawPeriod` ⇒ bắt được lỗi lệch neo `basePeriod` — dạng lỗi mà **mọi lớp verify khác đều báo xanh** | §9.6 |
| **G7** | **Nhịp 20 phút ⇒ chi phí Bright Data = $0** (vừa khít free tier 5.000 credit/tháng, vốn là **pool dùng chung** mọi sản phẩm chứ không phải 5.000 riêng mỗi cái). Mỗi request trả ~30 kỳ nên nhịp thưa **không mất kỳ**, chỉ tăng độ trễ — vô hại trong shadow mode | §10.3 |

**Đề xuất bỏ extension MV3** (`p2-extension.plan.md`, 732 dòng) + ingest API/device auth: Bright Data
làm được cùng việc mà không cần máy Windows chạy 24/7, CRX self-hosted, heartbeat, kill-switch. Đổi
`POST /api/ingest` (extension đẩy) → server **tự PULL** bằng `TickLoopWorker` có sẵn. Delta đầy đủ ở
§10.4. **Chưa sửa 2 plan** — chờ bạn chốt vì phụ thuộc quyết định ToS (§4), là quyết định kinh doanh.

### 0.2. Chỉ thị 30/08 (tối) — TẤT CẢ qua Bright Data để không lộ IP server

Đọc **§12** (thay thế §8.2). Năm kết luận:

| # | Kết luận | Chi tiết |
| --- | --- | --- |
| **H1** | **"Tất cả qua Bright Data" ≠ "tất cả qua Web Unlocker".** Proxy zone cũng là BD, cũng ẩn IP y hệt, nhưng tính **per GB**. `KN.php` = 554 B ⇒ qua proxy ~**$0,02/tháng**; qua Unlocker tốn 4.378 request = **gần hết free tier** mà Vietlott đang cần ⇒ **Z1 proxy cho minhchinh, Z2 Unlocker cho Vietlott** | §12.1 |
| **H2** | **Crawl API bị loại vì lý do CẤU TRÚC.** Nó chỉ nhận input `[{url}]` — không có chỗ truyền `POST`/`body`/3 header; phân trang của nó là "bò theo link", còn phân trang Vietlott nằm **trong POST body**. Endpoint `.ashx` là XHR target, không nằm trong graph link nào ⇒ không thể lách bằng cấu hình | §12.3 |
| **H3** | 🔴 **Bật Custom Headers ở Web Unlocker = MẤT "pay only for success", bị tính tiền 100% request kể cả FAIL** (docs nói rõ). Vietlott cần `X-AjaxPro-Method` ⇒ rơi vào đúng bẫy này. Mọi ước tính chi phí trước đó thành **sàn, không phải trần** ⇒ phải thử **U1 (không custom header)** trước tiên | §12.4 |
| **H4** | **Phân trang là 2 bài toán ngược nhau.** Vận hành ngày: `TotalRow=30` là **1 request** phủ 4 giờ ⇒ **không cần phân trang**. Backfill lịch sử: cần lặp `PageIndex` ⇒ **đây mới là chỗ Scraper Studio đúng**, vì nằm **ngoài đường tiền** nên 5 lý do phản đối ở §8.3 không áp dụng | §12.5 |
| **H5** | **Xoá `DirectFetcher` khỏi codebase**, không giữ làm fallback — nếu còn, một hôm BD hỏng sẽ có người bật "cho chạy tạm" và IP lộ đúng lúc không ai theo dõi. BD hỏng ⇒ fail + alert + nhập tay | §12.6 |

⚠️ Chỉ thị đạt **2/3 lớp ẩn danh**: ẩn được IP/ASN và fingerprint, **không** ẩn được **pattern hành
vi** (nhịp đều tăm tắp) — cần jitter ±20% nhịp poll. Và BD **thấy toàn bộ** nội dung ta thu thập: đây
là **dịch chuyển** tin cậy sang vendor, không phải xoá bỏ nó (§12.7).

### 0.3. Đính chính 30/08 (22:35) — ĐỔI PHƯƠNG ÁN CHÍNH. Đọc §13

Bạn đính chính 2 điều về `.ashx` và cho 1 endpoint mới. Kết quả: **phương án chính đổi hẳn.**

| # | Kết luận | Chi tiết |
| --- | --- | --- |
| **K1** | **`TotalRow` KHÔNG phải page size** — nó là **tổng row trong hệ thống**; page size **luôn 6**, muốn thêm phải nhảy `PageIndex`. Đây là lần **thứ hai** hiểu sai tham số này (tài liệu cũ từng sửa "tổng bản ghi"→"page size", và lần đó cũng sai) ⇒ mọi con số ở §10.3/§12.5/G7/H4 **sai theo hướng lạc quan**, đã sửa | §13.1 |
| **K2** | 🔴 **`GET .../view-detail-keno-result?id=0293945` xoá bỏ nút thắt H3.** `GET` thuần, tham số trên URL, **không cần header lạ** ⇒ **không phải bật Custom Headers** ⇒ **không phải xin compliance**, **giữ được pay-per-success**. Đổi lại 1 credit/kỳ thay vì 1/6 kỳ = **~$5,2/tháng**. Đây là món rẻ nhất trong cả nghiên cứu ⇒ **đảo phương án: detail URL là đường CHÍNH, `.ashx` chỉ dùng backfill/catch-up** | §13.3 |
| **K3** | **Trang detail cho 4 checksum của CHÍNH Vietlott** (CHẲN 9 / LẺ 11 / LỚN 11 / NHỎ 9 — tôi đã verify tay khớp 20 số trong ảnh). Tài liệu cũ tưởng "Vietlott chỉ cho 2 checksum" ⇒ **lớp verify 2 chạy được trên nguồn authoritative mà không cần mirror** | §13.2 |
| **K4** | **`id` = `ky` của `KN.php`** ⇒ luồng Keno: mirror rẻ phát hiện kỳ mới → gọi Vietlott detail đúng **1 lần/kỳ**. Không đoán, không phân trang. Bingo18 không có mirror ⇒ suy `id` bằng **số học** từ neo + re-anchor qua trang list | §13.4 |
| **K5** | **Vietlott hiển thị số TĂNG DẦN**, không phải thứ tự quay ⇒ rủi ro "conflict giả source-vs-source" (§9.2) **có thể không tồn tại**; nhưng rủi ro **manual-vs-auto resettle oan** vẫn còn và nay là rủi ro chính. Guard `payoutHash` vẫn bắt buộc. ⚠️ JSDoc `isSameKenoResult` có thể đang mô tả tiền đề không có thật | §13.6(a) |
| **K6** | **Cross-check 2 endpoint cùng nguồn** (`.ashx` vs detail — 2 code path độc lập) cho Bingo18 một **lớp veto** mà trước đây tưởng không có. Không được dùng để nâng `Verified` (cùng nguồn gốc) nhưng được dùng để **chặn**. Chạy trên mẫu 5% ⇒ ~$0,3/tháng | §13.6(b) |

**Sản phẩm chốt:** Z1 **Proxy zone** → minhchinh · Z2 **Web Unlocker** (`GET`, không custom header) →
Vietlott detail per-kỳ, **đường tiền** · Z3 **Scraper Studio** → backfill `.ashx` (tự set header trong
IDE của họ, không cần đơn compliance; **chỉ emit RAW**, không emit số đã parse). **Crawl API loại** —
đòi `dataset_id` của scraper đã tồn tại + trả record structured (vi phạm B1).

### 0.4. Bổ sung 30/08 (22:50) — Bingo18 detail + "Unlocker lâu / sao không Studio". Đọc §14

| # | Kết luận | Chi tiết |
| --- | --- | --- |
| **L1** | **Bingo18 detail URL xác nhận** (`?nocatche=1&id=0184131`), `id` zero-pad 7 giống Keno, **cũng có 2 checksum** (Cửa tổng 12 = 5+2+5 ✅; Lớn/Hòa/Nhỏ = Lớn ✅ khớp `BINGO18_BIG_MIN=12`) ⇒ lớp verify 2 chạy cho **cả 2 game** trên nguồn authoritative | §14.1 |
| **L2** | 🔴 **`5 2 5` chứng minh Bingo18 GIỮ THỨ TỰ QUAY** (sort sẽ là `2 5 5`) — **đối lập Keno** (tăng dần). K5 chỉ đúng cho Keno. ⇒ 2 game canonicalize KHÁC nhau: Bingo18 `displayHash` (`5,2,5`) ≠ `payoutHash` (`2,5,5`), phải giữ riêng cả hai | §14.1(b) |
| **L3** | **Mỗi trang detail là 1 phép kiểm config của ta** — Vietlott tự công bố phân loại Lớn/Hòa/Nhỏ ⇒ phát hiện ngay nếu họ đổi biên. Bật thành check thường trực, miễn phí | §14.1(c) |
| **L4** | **`nocatche=1` là cache-buster** (site viết sai `nocache`) ⇒ phải gửi kèm và cho giá trị **biến thiên**; nhận trang cache của kỳ trước = observation sai kỳ | §14.1 |
| **L5** | **Premise "Unlocker lâu" cần đảo: Studio CHẬM HƠN.** Unlocker `/request` **đồng bộ**; Studio **async + queue + chạy browser thật** cho một trang server-rendered không cần browser. Và độ trễ **không phải ràng buộc**: 3s vs 8s = 0,6–2% của nhịp kỳ (480s/360s) ⇒ đang tối ưu sai biến | §14.2 |
| **L6** | **"Tự parse cả đám HTML"** — CPU ~1–5ms (bỏ qua); băng thông **không tốn thêm** vì Unlocker tính per-request; storage 1,7 GB/tháng là chi phí thật ⇒ **gzip** (nén 8–10×) về ~210 MB. Parser thật chỉ **~150 dòng cho 2 game**, rẻ hơn vận hành 1 collector (versioning + trigger/poll + **mirror schema tay không có compiler bảo vệ** — cùng họ bug với `player-sdk`) | §14.3 |
| **L7** | ⚖️ **Nhượng bộ: §8.3 điểm 2 đã bị làm yếu.** Có 4 checksum nội tại ⇒ parse sai (dù ta hay self-heal) **vỡ checksum, bị chặn ở lớp 2** ⇒ self-heal không còn là kênh mất tiền âm thầm. Lý do thật còn lại: **governance/truy vết** (logic đường tiền phải có commit hash, không phải "phiên bản trên dashboard") + **phức tạp vận hành real-time** | §14.4 |
| **L8** | 💡 **Tổng hợp: dùng Studio làm PARSER THỨ HAI, không phải duy nhất.** Studio `collect({ rawHtml, studioNumbers, … })` ⇒ **1 request, 2 observation** (`studio-v1` + `repo-v1` parse lại cùng byte) = **lớp verify mới bắt được bug parser của CHÍNH TA** — thứ quorum nhiều nguồn không bắt được. Điều kiện: p95 < 15s, và `rawHtml` **nguyên văn** (`contentHash` khớp Unlocker). Không đạt ⇒ 2 hàm parse độc lập trong repo, được ~80% giá trị | §14.5 |

---

## 1. Probe log — đo thật, đủ 3 điều kiện (status + selector + độ mới)

Môi trường probe: egress `104.164.168.184`, Singapore, `AS137409 GSL Networks` — **IP datacenter**,
loại Cloudflare chặn mạnh nhất. Đây là điểm quan trọng: mọi kết quả `200` dưới đây đạt được từ
đúng loại IP mà `vietlott.vn` từ chối.

### 1.1. Bảng probe

| Target | HTTP | Dữ liệu mới nhất | Kết luận |
|---|---|---|---|
| `www.vietlott.vn/…/winning-number-keno` | **403** (Cloudflare) | — | Xác nhận lại §2.1 tài liệu cũ. Không đổi |
| `www.minhchinh.com/` (homepage) | **200**, 663 KB | Keno `#293938` · 30/08/2026 · **20:08** | **SỐNG.** Server-rendered, không JS |
| `www.minhchinh.com/livekqxs/xstt/KN.php` | **200**, 554 B | Keno `#293943` → `#293944` | **SỐNG, có cấu trúc.** Feed chính |
| `www.minhchinh.com/livekqxs/xstt/js/KN.js` | **200**, 487 B | cùng payload | Endpoint **thứ 2** cùng dữ liệu (dự phòng sẵn) |
| `www.minhchinh.com/ket-qua-keno.html` | 301 → homepage | — | URL chết — **đây là URL probe cũ đã dùng** |
| `www.minhchinh.com/livekqxs/xstt/BINGO.php` | 200, 120 B | **không có `lastResult`** | **CHẾT** |
| `www.minhchinh.com/bingo18-xo-so-bingo18` | 200, 633 KB | `#169215` · **29/05/2026** | **CHẾT 3 tháng** |
| `www.minhchinh.com/kqxs-bingo18-ngay-30-08-2026` | 200 | **0 kỳ** | Rỗng — xác nhận F3 |
| `www.minhchinh.com/kqxs-keno-ngay-…` / `-ky-…` | 301 → homepage | — | Pattern archive **không có** cho Keno |
| `www.minhchinh.com/ket-qua-xo-so/29-08-2026.html` | 200, 650 KB | có XSMN/XSMT/XSMB + Mega/Power/Max3D/Lotto ngày 29/08 · **0 kỳ Keno** | Archive theo ngày **chỉ cho game quay ngày**, không có Keno/Bingo18 |

### 1.2. Payload thật của `KN.php` — đây là phần đáng giá nhất

```js
xsdt[8]={ "runtt":1, "newtime":1788044403, "delay":3000,
  "next_ky":293945, "next_date":"2026-08-30 21:04:00",
  "live_ky":293944, "live_date":"2026-08-30 20:56:00",
  "lastResult": {
    "kq":["04","06","09","14","17","20","22","24","25","26",
          "28","32","33","47","55","59","61","62","66","68"],
    "chan":12, "le":8, "lon":7, "nho":13, "total":678,
    "ky":293944, "date":"2026-08-30 20:56:00"
  }, "cllb":{},"ts":{},"nt":{},"it":{},"cv":{}};
key="…"; returntime="1788098188";
```

Đối chiếu từng thứ với yêu cầu của tài liệu cũ:

| Cái tài liệu cũ cần | `KN.php` có? | Ghi chú |
|---|:--:|---|
| 20 số dạng `"01"`–`"80"` zero-padded | ✅ | **Đúng y format** `KenoDrawDoc` cần. Không phải parse HTML, không cần regex |
| Mã kỳ Vietlott (`drawPeriod`) | ✅ `ky` | Dùng cho lớp B (§3.4 cũ — kiểm liên tục +1) và `vietlottRef.drawPeriod` |
| **Giờ quay** | ✅ `date` | **Vietlott KHÔNG expose cái này** (§4.3 cũ). Giải trực tiếp bài toán match `slotIndex` |
| Checksum nội tại (lớp A) | ✅ **5 cái** | Vietlott chỉ cho 2 (`Chẵn`, `Nhỏ`). Đây có `chan/le/lon/nho/total` |
| Lịch kỳ kế tiếp | ✅ `next_ky`+`next_date` | Biết trước kỳ sau là mã gì, quay lúc nào → **tự tạo kỳ** (§2.8 cũ) có nguồn |

Verify checksum bằng tay trên payload trên: chẵn = `04,06,14,20,22,24,26,28,32,62,66,68` = **12** ✓ ·
lẻ = **8** ✓ · nhỏ (≤40) = `04,06,09,14,17,20,22,24,25,26,28,32,33` = **13** ✓ · lớn = **7** ✓.
Cả 4 khớp. Trên payload probe lần 1 (`ky:293943`) cũng khớp cả 4 + `total:855` = tổng đúng.

**Sức bắt lỗi tăng vọt so với Vietlott:** 5 checksum ràng buộc lẫn nhau. Đổi 1 số bất kỳ làm lệch
`total` (bắt 100%), và thường lệch thêm parity hoặc nhóm lớn/nhỏ. Tức Keno qua nguồn này đạt mức
**bắt 100% lỗi 1 chữ số** — bằng Bingo18, trong khi qua Vietlott chỉ ~¾ (§3.4 cũ).

### 1.3. Cơ chế của trang live — nó được thiết kế để bị poll

Đọc JS trong `/truc-tiep-xo-so-tu-chon-keno.html`:

```js
var strUrlJS = [ '/livekqxs/xstt/js/KN.js', '/livekqxs/xstt/KN.php' ];
// delay = xsdt[8].delay  → 3000ms
setInterval(function(){ checkrunxstt(); }, 20000);
```

Trang tự poll endpoint này mỗi **3 giây**, có **2 URL fallback** sẵn, và trang render 100%
client-side từ đó. Nghĩa là:

- Nhịp poll của ta (mỗi 1–8 phút) **thấp hơn nhiều** so với chính trang chủ của họ → không phải
  mẫu hành vi bất thường.
- Không có anti-bot, không cookie, không token, không `Referer` bắt buộc (probe không gửi
  `Referer` vẫn `200`).
- Đây là **JSON endpoint công khai**, không phải scrape DOM → không vỡ khi họ đổi layout CSS.

### 1.4. Lỗ hổng của nguồn minhchinh — phải ghi rõ

| Hạn chế | Mức độ | Hệ quả thiết kế |
|---|---|---|
| **Chỉ có kỳ mới nhất, KHÔNG có history/backfill cho Keno** | **Cao** | Miss 1 nhịp poll = mất kỳ vĩnh viễn. Bắt buộc poll ≤ chu kỳ quay (8'), tốt hơn là 2–4'. Backfill phải lấy từ Vietlott |
| Bingo18 chết (F3) | **Cao** | Bingo18 không được lợi gì từ nguồn này |
| Là **mirror**, không phải nguồn chính thức | Trung bình | Theo §3.4 cũ: mirror chỉ có quyền **veto**, không có quyền **cấp** số. Xem §3 dưới |
| Site tự disclaim: *"dữ liệu chỉ mang tính chất tham khảo… vui lòng đối chiếu trực tiếp với kết quả chính thức"* | Trung bình | Không thể dùng làm nguồn duy nhất cho đường tiền. Củng cố vai trò veto |
| Endpoint nội bộ, có thể đổi/tắt không báo | Trung bình | Có 2 URL fallback, + phải degrade êm về nhập tay (§4.6 cũ) |
| `key=` + `returntime=` trong payload — chưa rõ dùng làm gì | Thấp | ⚠️ **CHƯA ĐO:** có thể là chống hotlink tương lai. Theo dõi trong P1 |

---

## 2. Bright Data — sản phẩm nào dùng được, sản phẩm nào không

Đọc docs chính thức (`docs.brightdata.com`) + trang pricing, ngày 30/08/2026. **Chưa mở account nên
chưa probe thật** — mọi con số dưới đây là *đọc từ docs/pricing*, không phải đo được (xem §6).

### 2.1. Bảng đánh giá 6 sản phẩm

| Sản phẩm | Giá | Cơ chế | Dùng cho bài toán này? |
|---|---|---|---|
| **Web Unlocker API** | **$1,5/1K request thành công** (PAYG) · $1,3/1K khi commit $499/th · **free 5K req/tháng** · **chỉ tính request THÀNH CÔNG** | 1 REST call `POST api.brightdata.com/request` → BD tự chọn proxy, giả fingerprint, giải CAPTCHA (gồm **Cloudflare Turnstile**), retry, trả HTML/JSON | ✅ **PHÙ HỢP NHẤT.** Xem §2.2 |
| **Residential Proxy** (`-country-vn`) | $4,00–5,88/GB (PAYG) · ~$2,50/GB khi commit $1.999/th · **geo-targeting miễn phí** | Proxy HTTP thường, IP thật của người dùng VN. **Không** giải CAPTCHA | ✅ **Dùng để TEST giả thuyết "IP Việt Nam lấy được"** — thứ tài liệu cũ ghi *"CHƯA VERIFY, quan trọng nhất"* (§6 #2 cũ). Xem §2.3 |
| **Browser API** (Scraping Browser) | **$8/GB** (PAYG), $5–7/GB khi commit | Chrome thật trên cloud BD, điều khiển qua CDP (`connectOverCDP`), có unblocking + CAPTCHA solver built-in | ⚠️ **Quá đắt & quá nặng.** Ta chỉ cần 1 POST, không có luồng nhiều bước. Ước ~$99/th vs $12/th của Unlocker. Chỉ xét nếu Unlocker fail |
| **Web Scraper API** (scraper dựng sẵn) | theo record | Scraper viết sẵn cho các site phổ biến (Amazon, LinkedIn, TikTok…) | ❌ **Không có** scraper cho `vietlott.vn`. Không liên quan |
| **Datasets marketplace** | theo dataset | Dataset đã crawl sẵn, bán theo bộ | ❌ **Không có** dataset xổ số Việt Nam. Không liên quan |
| **SERP API** | ~$1,5/1K | Kết quả Google/Bing | ❌ Không liên quan |

→ Chỉ **2 sản phẩm** thực sự đáng xét: **Web Unlocker** và **Residential Proxy VN**. Hai cái này
giải 2 bài toán khác nhau và **bù trừ nhau ở đúng điểm yếu** (§2.4).

### 2.2. Web Unlocker — khớp gì, vướng gì

Endpoint Vietlott là **POST AjaxPro** (§2.2 tài liệu cũ), không phải GET trang HTML. Kiểm từng
tham số Web Unlocker cần có:

| Yêu cầu của endpoint Vietlott | Web Unlocker hỗ trợ? | Bằng chứng từ docs |
|---|:--:|---|
| `POST` thay vì `GET` | ✅ | field `method` trong body `/request` (OpenAPI spec) |
| Body raw JSON (envelope `ORenderInfo`…) | ✅ | field `body` — *"Specifies the raw POST payload sent to the target URL"* |
| Header `X-AjaxPro-Method: ServerSideDrawResult` | ⚠️ **CÓ ĐIỀU KIỆN** | Mặc định BD **loại bỏ** header lạ: *"any extra elements that are sent along with the request are disregarded"*. Phải bật **Custom Web Unlocker → Manual headers & cookies**, và header ngoài *pre-approved list* phải **submit form cho compliance team BD duyệt** |
| Chọn IP Việt Nam | ✅ | field `country: "vn"` (ISO 3166-1) |
| Vượt Cloudflare Managed Challenge | ✅ (theo BD) | Danh sách solver có `Cloudflare Turnstile`. BD tự công bố ~99,9%; benchmark độc lập 95–98% |
| Bằng chứng screenshot cho audit | ✅ **BONUS** | `data_format: "screenshot"` → PNG trang đã render |
| Debug xem header nào thực sự được gửi | ✅ | `debug: true` → header `x-brd-debug` có `used_req_headers`, `peer_country`, `render`, `billed` |

**Vướng duy nhất đáng lo: custom header phải qua compliance BD.** Đây là rủi ro thật, không phải
thủ tục hình thức — BD sẽ hỏi mục đích. Ba đường thoát, xếp theo độ ưu tiên:

1. **Thử không cần custom header trước.** Chưa ai đo endpoint `.ashx` có bắt buộc
   `X-AjaxPro-Method` hay không (§6 tài liệu cũ ghi rõ là *cố ý không POST thử*). Nếu server AjaxPro
   đọc method từ URL/body thì khỏi cần header → hết vướng.
2. **Dùng Residential Proxy VN thay vì Unlocker.** Proxy thường **không kiểm duyệt header** — ta
   toàn quyền gửi bất kỳ header nào. Đánh đổi: không có CAPTCHA solver.
3. **Chuyển sang scrape trang HTML** `winning-number-keno` bằng GET thuần (không cần header đặc
   biệt) rồi parse bảng — chậm hơn vì phải phân trang, nhưng không vướng compliance.

### 2.3. Residential Proxy VN — giá trị lớn nhất là *giải quyết câu hỏi mở #2*

Tài liệu cũ liệt kê ở §7 "CHƯA kiểm chứng được", mục **quan trọng nhất**:

> `curl` từ **IP Việt Nam** trả `200` hay `403` — toàn bộ §4.6 P-A dựa vào suy luận từ 2 dữ kiện
> gián tiếp, chưa có phép đo trực tiếp.

Bright Data residential proxy với `-country-vn` **là phép đo đó**, và chi phí gần như 0:

```bash
# Test §2.1 cũ — nay đo được thật, không cần ai ở Việt Nam
curl -s -o /dev/null -w "%{http_code}\n" \
  --proxy brd.superproxy.io:33335 \
  --proxy-user brd-customer-<id>-zone-<zone>-country-vn:<pass> \
  -A "Mozilla/5.0 … Chrome/145.0.0.0 Safari/537.36" \
  "https://www.vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/winning-number-keno"
```

Hai kết cục, cả hai đều có giá trị:

- **`200`** → giả thuyết §2.1 đúng: Cloudflare chặn theo reputation IP/ASN, IP VN đi qua được.
  Khi đó **không cần Web Unlocker** cho Vietlott — chỉ cần residential proxy VN ~**$1,7–2,4/tháng**,
  và ta giữ **toàn quyền header** (hết vướng §2.2). Đây là kịch bản rẻ nhất và sạch nhất.
- **`403`** → giả thuyết SAI, CF chặn mọi non-browser bất kể IP. Khi đó Web Unlocker (có CAPTCHA
  solver + JS rendering) là đường duy nhất phía server, và P-D lại có lý hơn.

→ **Phép đo này phải làm TRƯỚC mọi quyết định kiến trúc khác.** Nó rẻ (< $1), nhanh (~15 phút sau
khi có account), và nó *chọn* giữa hai nhánh chi phí chênh nhau ~6×.

### 2.4. Hai sản phẩm bù trừ nhau ở đúng điểm yếu

| | Residential Proxy VN | Web Unlocker |
|---|---|---|
| Toàn quyền custom header | ✅ | ⚠️ cần compliance duyệt |
| Giải CAPTCHA / JS challenge | ❌ | ✅ |
| Tính tiền khi request FAIL | ❌ **có tính** (theo GB) | ✅ **không tính** |
| Giá cho ~276 req/ngày | ~$1,7–2,4/th | ~$12,4/th (free tier phủ shadow mode) |
| Screenshot audit sẵn | ❌ | ✅ `data_format: screenshot` |
| Phụ thuộc BD giữ tốc độ đua với CF | Thấp (chỉ là IP) | **Cao** (BD phải liên tục cập nhật) |

**Chiến lược đúng: bắt đầu bằng Residential VN, giữ Web Unlocker làm tầng leo thang.** Cùng 1
account BD, cùng 1 control panel — đổi zone là xong, không phải viết lại code.

### 2.5. Ước tính chi phí — tính trên nhịp thật

Cơ sở: `TotalRow` là **page size** (§0 S11 tài liệu cũ), nên **1 request lấy được 30 kỳ** — không
cần 1 request/kỳ. Keno 119 kỳ/ngày (06:08→21:52), Bingo18 158 kỳ/ngày (06:06→21:48).

| Nhịp poll | Req/ngày (2 game) | Req/tháng | Web Unlocker @$1,5/1K | Residential @$5,88/GB (~50KB/req) |
|---|---|---|---|---|
| 15 phút | 126 | 3.780 | **$0** (trong free tier 5K) | ~$0,3 |
| 8 phút (= chu kỳ Keno) | 236 | 7.080 | ~$10,6 | ~$2,1 |
| 4 phút | 472 | 14.160 | ~$21,2 | ~$4,2 |
| 2 phút | 944 | 28.320 | ~$42,5 | ~$8,3 |

Thêm minhchinh cho Keno: **$0** (không qua BD, GET trực tiếp từ Lambda).

**Nhận xét quan trọng:** ngay cả nhịp 2 phút cũng chỉ ~$42/tháng — **rẻ hơn 1 giờ lương staff**.
Chi phí **không phải** biến số quyết định ở đây. Biến số quyết định là **độ tin cậy** và **ToS**
(§3, §4).

---

## 3. Mô hình tin cậy được cải thiện thật — quorum không gian sống lại cho Keno

Tài liệu cũ §3.4 tuyên bố *"Quorum 3 nguồn là bất khả thi"* với **hai** lý do. F1 chỉ phá được lý
do thứ hai, **không phá** lý do thứ nhất — phải phân biệt rạch ròi:

| Lý do §3.4 cũ | Còn đúng? |
|---|---|
| (2) **Thực tế:** không còn mirror nào sống → không có gì để bầu | ❌ **SAI với Keno** (F1). Đúng với Bingo18 (F3) |
| (1) **Nguyên lý:** mirror copy từ Vietlott → **tương quan**, cùng sai nếu Vietlott sai. Quorum trên nguồn phụ thuộc cho *cảm giác an toàn giả* | ✅ **VẪN ĐÚNG NGUYÊN** |

→ Vì (1) còn đúng, **minhchinh KHÔNG được nâng lên authoritative.** Nó vẫn là mirror. Nhưng nó
làm được 3 việc mà tài liệu cũ nghĩ là không có nguồn nào làm được:

### 3.1. Lớp D mới — đối chiếu chéo 2 nguồn (quyền VETO, không có quyền CẤP)

Bổ sung vào 3 lớp §3.4 cũ (A checksum nội tại · B liên tục `drawPeriod` · C double-fetch theo thời gian):

> **Lớp D — cross-source veto.** Cùng 1 kỳ, so bộ số Vietlott (authoritative) với bộ số minhchinh.
> Khớp → tăng tin cậy, cho phép nới ngưỡng exposure auto-publish. **Lệch → quarantine tuyệt đối**,
> alert `critical`, không bao giờ auto-publish, bất kể lớp A/B/C đều pass.

Lớp này bắt được đúng loại lỗi mà A/B/C **không** bắt được: parser đọc đúng format nhưng lấy **sai
kỳ** (ví dụ trang Vietlott cache kỳ cũ mà `drawPeriod` vẫn liên tục vì ta chỉ thấy 1 kỳ). Hai nguồn
độc lập về **hạ tầng phân phối** (dù không độc lập về nguồn gốc dữ liệu) → bắt được lỗi tầng
truyền tải, cache, parse.

Đây là mức an toàn **cao hơn** cả P-D lẫn Bright Data đơn lẻ.

### 3.2. Giải bài toán match kỳ — thay vì suy luận, đọc thẳng

§4.3 tài liệu cũ phải xây thuật toán neo-đầu-ngày (`drawNo = drawPeriod − basePeriod + 1`), rồi
29/08 phát hiện **lỗ hổng**: công thức chỉ đúng nếu MegaWin mở đủ 119 kỳ/ngày; thực tế mở ít hơn nên
lệch 43 kỳ ngay ở kỳ thứ hai. Lời giải đã ghi là dùng `slotIndex` suy từ `drawTime`.

`KN.php` trả **`date: "2026-08-30 20:56:00"` trực tiếp**. Không cần neo, không cần đếm, không cần
giả định MegaWin mở đủ kỳ:

```
slotIndex = (phút(date_minhchinh) − phút(firstDrawTime)) / drawIntervalMinutes + 1
```

Và có `next_ky` + `next_date` → **biết trước** kỳ kế tiếp mã gì, quay lúc nào. Đây cũng là nguồn dữ
liệu cho bài toán tiền đề §2.8 cũ (*"chưa có gì tự tạo kỳ"*) — nếu sau này muốn tự sinh kỳ, lịch
đã có sẵn từ nguồn.

⚠️ **Nhưng `drawTime` từ mirror là dữ liệu untrusted** — dùng để *gợi ý* mapping và để *đối chiếu*,
không dùng làm khoá ghi DB mà không kiểm chéo với lịch config MegaWin.

### 3.3. Screenshot audit — khả thi trở lại

§6 #16 tài liệu cũ trả lời "KHÔNG chụp được ở P1" vì `chrome.tabs.captureVisibleTab` chỉ chụp tab
active, xung đột tab thu thập nền. Web Unlocker `data_format: "screenshot"` trả PNG trang đã render
**mà không cần tab nào** → khôi phục đúng use-case #1 của §3.3 cũ (*bằng chứng audit khi có tranh
chấp*). Lưu vào Blob theo `drawId`.

---

## 4. ToS — Bright Data KHÔNG cải thiện, nhưng minhchinh thì CÓ

Đây là chỗ dễ tự lừa nhất. Phải tách 2 nguồn ra vì vị thế pháp lý **khác nhau về bản chất**.

### 4.1. Vietlott qua Bright Data — vị thế xấu hơn P-D, đúng như §4.9 cũ đã cảnh báo

| | P-D (extension, Chrome thật) | Vietlott qua Bright Data |
|---|---|---|
| Bản chất | Người thật mở trang, công cụ đọc hộ nội dung **đã hiển thị cho người đó** | **Thuê dịch vụ chuyên nghiệp vượt biện pháp chống bot**, có giải CAPTCHA tự động |
| Vị thế khi bị hỏi "số lấy từ đâu?" | *"Nhân viên xem trang, công cụ nội bộ đọc hộ"* — gần với copy tay | *"Chúng tôi trả tiền cho vendor để bypass Cloudflare của Vietlott"* — **rõ ràng là circumvention** |
| Có bên thứ 3 trên đường tiền | Không | **Có** — request rời hạ tầng của ta |

§4.9 cũ đã kết luận đúng và **kết luận đó không đổi**: P-C *"không giải được vấn đề gốc mà P-D giải
(vị thế ToS)"*. F2 (chi phí thấp) **không** làm điều này tốt hơn — rẻ mà vẫn là vượt rào.

Với P-0 (xin kênh chính thức) đã bị loại (26/08), **không còn đường xoá** rủi ro này. Bright Data
chỉ **chuyển rủi ro kỹ thuật** sang vendor, **không chuyển rủi ro ToS**.

### 4.2. minhchinh qua GET thuần — vị thế tốt hơn P-D

Ngược lại hoàn toàn:

- **Không có biện pháp chống bot nào để vượt.** Không Cloudflare challenge, không CAPTCHA, không
  auth, không rate-limit gặp phải. Không circumvention → không phạm phần ToS về bypass.
- Endpoint được thiết kế để **poll mỗi 3 giây** bởi mọi browser vào trang. Ta poll **thưa hơn**
  trang chủ của họ.
- minhchinh **không phải** chủ sở hữu dữ liệu — họ tự ghi *"cập nhật từ các nguồn công bố công khai…
  chỉ mang tính chất tham khảo"*. Kết quả xổ số là **fact công bố công khai**, không phải tác phẩm
  có bản quyền (dù *cách trình bày/tuyển chọn* có thể).
- ⚠️ **Vẫn phải đọc ToS/robots.txt của minhchinh** trước khi bật production (§6 #2).

→ **Hệ quả kiến trúc quan trọng:** nếu bạn cần một nguồn **có vị thế ToS sạch nhất** thì đó là
minhchinh, không phải Vietlott-qua-BD. Nhưng minhchinh chỉ phủ Keno, và là mirror.

### 4.3. Rủi ro mới do Bright Data mang vào

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| **BD compliance từ chối target/use-case** | ⚠️ **Chưa đo** | BD có compliance team review, và có KYC. Target là site xổ số nhà nước + use-case là gambling operator → khả năng bị hỏi kỹ. **Phải xác nhận trước khi thiết kế dựa vào BD** |
| Custom header cần duyệt (§2.2) | ⚠️ Chưa đo | Có thể chặn hẳn đường AjaxPro POST |
| Tỷ lệ thành công **biến động theo thời gian** | Trung bình | Đúng như §4.6 cũ nêu: *"hôm nay 99%, tháng sau CF đổi thuật toán rớt còn 60%"*. Không kiểm soát được. Bắt buộc degrade êm |
| Latency 3–8s/request khi phải render | Thấp | Không vấn đề với nhịp phút |
| Request rời hạ tầng ta → BD thấy nội dung | Thấp | Dữ liệu là kết quả xổ số công khai, không phải PII/secret |

---

## 5. Kiến trúc đề xuất — lai 2 nguồn, giữ nguyên mọi bất biến an toàn

**Không đổi bất kỳ bất biến nào của tài liệu cũ:** B1 (LLM không sinh số) · ghi staging không ghi
`DrawDoc` · `settle` là action người · không auto-publish kỳ đã settle mà số đổi · degrade êm về
nhập tay.

```
┌─ NGUỒN 1: minhchinh (mirror, VETO-only) ───────────────────┐
│  GET /livekqxs/xstt/KN.php  (fallback: /js/KN.js)          │
│  Lambda cron sẵn có · 0 hạ tầng mới · 0 chi phí · 0 CF      │
│  → CHỈ Keno. Cho: ky, date(giờ quay), 20 số, 5 checksum     │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌─ NGUỒN 2: Vietlott (AUTHORITATIVE) ────────────────────────┐
│  POST .ashx qua Bright Data                                 │
│   ├─ B1 Residential proxy -country-vn   (thử TRƯỚC, ~$2/th) │
│   └─ B2 Web Unlocker + country:vn       (leo thang, ~$12/th)│
│  → CẢ Keno + Bingo18. Cho: bộ số + drawPeriod (+screenshot)  │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌─ SERVER: parse + 4 lớp verify (không tin nguồn nào) ───────┐
│  A checksum nội tại   B drawPeriod liên tục +1              │
│  C double-fetch theo thời gian                              │
│  D ✨ cross-source veto (chỉ Keno — Vietlott vs minhchinh)   │
│  → drawResultImports (staging). KHÔNG ghi DrawDoc            │
└──────────────────────────┬─────────────────────────────────┘
           4 lớp pass + exposure thấp → auto-publish (P3)
           còn lại → chờ người · fail → quarantine + alert
```

### 5.1. Bảng quyết định theo game

| | Keno | Bingo18 |
|---|---|---|
| Nguồn realtime | **minhchinh** (rẻ, sạch ToS, 5 checksum, có giờ quay) | **Vietlott qua BD** (không có lựa chọn khác) |
| Nguồn authoritative | Vietlott qua BD | Vietlott qua BD |
| Backfill / gap | Vietlott qua BD (`TotalRow: 30`) | Vietlott qua BD |
| Lớp verify | **A + B + C + D** (mạnh nhất) | A + B + C |
| Bắt lỗi 1 chữ số | ~**100%** (`total` + 4 checksum + veto) | **100%** (`total` 3 xúc xắc) |
| Nên bật auto-publish trước? | ✅ **Keno trước** — 4 lớp verify, và `drawNo` dùng atomic counter (§2.8 cũ) | Sau, khi Keno chạy sạch ≥1 tháng |

Trùng khớp với §5 P3 cũ (*"bật cho 1 game trước — Keno"*), nay có thêm lý do mạnh hơn: Keno là game
duy nhất có được lớp D.

### 5.2. Cái gì bị XOÁ khỏi phạm vi so với P-D

Đây là phần tiết kiệm thật, không phải tiết kiệm trên giấy:

| Hạng mục P-D | Ước lượng cũ | Với BD |
|---|---|---|
| Extension MV3 (outbox, tab lifecycle, backoff, alarms, timezone) | ~2 ngày | **0** |
| Máy chuyên dụng AWS WorkSpaces/EC2 Windows GUI + quản trị | §6 #5 (chưa định giá) + VM 24/7 | **0** |
| Unattended setup (LaunchAgent/Task Scheduler, auto-login, tắt Memory Saver) | 0,5 ngày | **0** |
| Heartbeat + kill-switch + alert mất tín hiệu | 1 ngày | **0** (cron lock `worker_locks` đã có) |
| Device token, rate-limit theo `deviceId`, rotate token | trong 1–2 ngày API | **0** |
| Enterprise policy + CRX self-hosted + update từ xa | trước P2 | **0** |
| Xử lý CF challenge (`cf-mitigated`, reload, phân loại 4 outcome) | trong 2 ngày extension | **0** (BD lo) |
| Câu hỏi mở #5, #11, #12, #13, #14 (máy nào, ai xử CF interactive, OS gì, ai quản, ngưỡng heartbeat) | 5 câu chặn | **Xoá cả 5** |

Còn lại: parser + 4 lớp verify (1–2 ngày) · collection `drawResultImports` (1 ngày) · client BD
(~0,5 ngày) · alert age-based settle (§3.7 cũ — 1–2 ngày, **vẫn bắt buộc**). **~1 tuần thay vì ~2
tuần**, và **không có hạ tầng vật lý nào phải trông**.

⚠️ Cửa ra P1 vẫn là **14 ngày quan sát** (§5 cũ) — không rút ngắn được bằng tiền.

---

## 6. Tham vọng "trở thành nơi cung cấp kết quả xổ số Việt Nam"

Bạn nêu thêm mục tiêu rộng hơn auto-import: **lưu trữ + cung cấp kết quả** như một nguồn dữ liệu.
Đây là bài toán **khác** với auto-publish (không nằm trên đường tiền, ràng buộc an toàn thấp hơn
nhiều) và **dễ hơn đáng kể**. Probe cho thấy nền tảng đã có sẵn.

### 6.1. minhchinh phủ gần trọn phổ, server-rendered, có archive theo ngày

Đo trên `GET /ket-qua-xo-so/29-08-2026.html` (200, 650 KB) và homepage:

| Nhóm | Có trong archive theo ngày? | Ghi chú |
|---|:--:|---|
| XSMN / XSMT / XSMB truyền thống | ✅ | **Bảng giải đầy đủ** (ĐB → G.Bảy), theo từng tỉnh/đài, HTML table |
| Mega 6/45 | ✅ | Kèm **giá trị Jackpot** + bảng số lượng người trúng từng giải |
| Power 6/55 · Lotto 5/35 · Max 3D · Max3D Pro | ✅ | |
| Điện toán 1\*2\*3 · 6\*36 · Thần Tài 4 | ✅ | |
| **Keno** | ❌ | Chỉ có kỳ mới nhất trên homepage + feed `KN.php` |
| **Bingo18** | ❌ | Chết từ 29/05/2026 (F3) |

→ **5 game quay ngày + toàn bộ xổ số truyền thống lấy được bằng 1 GET/ngày, $0, không Cloudflare,
có backfill lịch sử theo URL ngày.** Đây là nguồn tốt nhất tìm được cho mục tiêu "nơi cung cấp
kết quả".

Pattern URL đã verify: `/ket-qua-xo-so/DD-MM-YYYY.html` · `/ket-qua-xo-so-mien-nam/DD-MM-YYYY.html` ·
`/kqxs-<game>-ky-<period>` · `/kqxs-<game>-ngay-DD-MM-YYYY` (2 pattern cuối verify được trên
bingo18, **không** hoạt động cho keno).

### 6.2. Vì sao đây là bài toán dễ hơn — và đừng trộn nó với auto-publish

| | Kho dữ liệu công khai (§6) | Auto-publish (§5) |
|---|---|---|
| Sai 1 chữ số gây gì | Sai 1 dòng hiển thị, sửa được | **Trả thưởng sai bằng tiền thật**, không lấy lại được |
| Cần authoritative? | Không — ghi rõ *"tham khảo, đối chiếu nguồn chính thức"* như minhchinh làm | **Có, bắt buộc** |
| Cần 4 lớp verify? | Nên có A + B (rẻ) | **Bắt buộc cả 4** |
| Cần Bright Data? | **Không** cho 5 game chậm + truyền thống | Có (Vietlott authoritative) |
| Nhịp | 1–2 lần/ngày | 2–8 phút |

→ **Khuyến nghị: làm §6 TRƯỚC §5.** Nó cho 3 thứ mà §5 cần mà không mang rủi ro nào:

1. **Parser + schema + collection staging được test thật** trên khối lượng lớn, dữ liệu lịch sử,
   trước khi đụng đường tiền.
2. **Ground truth lịch sử** để verify thuật toán `slotIndex` (§3.2) và đối chiếu số staff đã nhập tay.
3. **Giá trị sản phẩm độc lập** (trang kết quả, SEO, tiện ích cho player) không phụ thuộc việc
   auto-publish có được duyệt ToS hay không.

⚠️ Nhưng phải giữ **ranh giới cứng**: dữ liệu trong kho §6 **không bao giờ** được chảy vào
`PublishResultUseCase`. Nếu trộn, ta đã âm thầm nâng mirror lên authoritative — đúng cái §3 cấm.
Tách bằng collection riêng + `resultSource` tường minh (§4.4 cũ).

---

## 7. Câu hỏi mở & việc phải làm — xếp theo thứ tự chặn

### 7.1. Bước 0 mới (~1 giờ) — thay thế "Bước 0 MỞ RỘNG 5 phép đo" của tài liệu cũ

Bước 0 cũ cần DevTools trên Chrome thật + extension throwaway. Bước 0 mới chạy được **hoàn toàn từ
server**, không cần máy Windows, không cần ai mở Chrome:

| # | Phép đo | Cách | Quyết định phụ thuộc |
|---|---|---|---|
| **1** | **`curl` từ IP Việt Nam tới `vietlott.vn` → `200` hay `403`?** | BD residential zone `-country-vn` (§2.3) | **Nhánh chi phí 6×.** Đây là câu hỏi mở #2 cũ, tồn từ 24/08 |
| 2 | Endpoint `.ashx` có **bắt buộc** header `X-AjaxPro-Method`? | Gửi POST có/không header, so response | Có vướng compliance BD hay không (§2.2) |
| 3 | BD compliance có nhận target `vietlott.vn` + use-case này? | Hỏi thẳng sales/support BD trước khi nạp tiền | **Chặn toàn bộ hướng BD** |
| 4 | minhchinh `robots.txt` + ToS có cấm automated access? | Đọc `/robots.txt` + trang Điều khoản | Vị thế §4.2 |
| 5 | `KN.php` có rate-limit / cần `Referer` / `key=` dùng làm gì? | Poll 1'/lần trong 1 giờ, quan sát | Nhịp poll an toàn |
| 6 | Ổn định `KN.php`: có bao giờ trả kỳ cũ / rỗng / lag > 1 kỳ? | Log liên tục 48h, so `next_ky`/`live_ky`/`lastResult.ky` | Có tin được làm nguồn P2 prefill |

### 7.2. Câu hỏi mở còn lại

| # | Câu hỏi | Ai quyết |
|---|---|---|
| 1 | **ToS:** chấp nhận rủi ro *"thuê vendor bypass bot protection"* (§4.1) — **xấu hơn** P-D — để đổi lấy ~1 tuần công + 0 hạ tầng? Hay giữ P-D cho Vietlott và chỉ dùng BD làm dự phòng? | **Business + Legal** |
| 2 | Nếu ToS chỉ chấp nhận mức P-D: có làm **kiến trúc lai** — minhchinh (sạch ToS) làm nguồn P1/P2 cho Keno, P-D cho Vietlott — hay hoãn Vietlott? | Business + Eng |
| 3 | Nhịp poll bao nhiêu phút? (minhchinh không có backfill → miss nhịp = mất kỳ, §1.4) | Vận hành |
| 4 | Có làm §6 (kho dữ liệu công khai) trước §5 không? | Product + Eng |
| 5 | Ngưỡng exposure auto-publish (**chưa trả lời từ 24/08**) | Vận hành + Risk |
| 6 | Lớp D lệch nhau → runbook xử lý thế nào để không block settle cả ngày (§3.7 cũ)? | Vận hành |

### 7.3. Việc nên làm ngay, không chờ quyết ToS

Ba việc này có giá trị **bất kể** hướng BD được duyệt hay không:

1. **Alert age-based cho draw published-chưa-settle** (§3.7 cũ) — chặn rủi ro 1 kỳ tắc làm chết cả
   ngày. Bắt buộc trước P3 ở mọi phương án. Không phụ thuộc nguồn dữ liệu nào.
2. **Logger shadow cho `KN.php`** — cron 2 phút, ghi thẳng staging, **không publish**, không cần BD,
   không cần ToS Vietlott. Sau 14 ngày có ngay dữ liệu trả lời cửa ra P1 cho Keno (§5 cũ) —
   ground truth miễn phí vì staff vẫn nhập tay.
3. **Đọc `robots.txt`/ToS minhchinh** — 15 phút, quyết định được việc #2 có chạy production được không.

---

## 8. Chốt sản phẩm Bright Data + công cụ extract (trả lời trực tiếp câu hỏi)

### 8.1. Sự thật mới tra được (30/08/2026) — 3 dữ kiện đổi kết luận §2

| # | Dữ kiện | Nguồn | Hệ quả |
| --- | --- | --- | --- |
| **G1** | **Free tier là POOL DÙNG CHUNG 5.000 credit/tháng cho TẤT CẢ sản phẩm**, không phải 5.000 riêng mỗi sản phẩm. Web Unlocker/SERP/Web Scraper = 1 credit/request; Scraper Studio = 1 credit/**page load**; Browser API (từ 01/09/2026) = 5 credit/MB | `docs.brightdata.com/general/account/billing-and-pricing/free-tier` | Sửa §2.5: ngân sách shadow mode là **5.000 request/tháng TỔNG**, ≈166/ngày cho cả 2 game — vẫn đủ, nhưng không có chỗ cho double-fetch phung phí |
| **G2** | **Scraper Studio** (tên mới của Web Scraper IDE, **chưa deprecated**) = nơi Bright Data cho ta viết JS chạy trên hạ tầng họ, tự parse ra **structured JSON** theo output schema tự định nghĩa. Trigger `POST /dca/trigger?collector=c_ID`, lấy kết quả qua `/dca/dataset`, hoặc push webhook/S3. Giá **$1.5/1K page load** — **y hệt** Web Unlocker | `docs.brightdata.com/datasets/scraper-studio/*` | Đây chính là "tool để extract ra schema" mà câu hỏi nhắm tới. Phải đánh giá nghiêm túc, và **kết luận là KHÔNG dùng cho đường tiền** — xem §8.3 |
| **G3** | **Scraper Studio xoá dữ liệu sau 16 ngày (batch) / 7 ngày (real-time)** | `docs.brightdata.com/datasets/scraper-studio/specifications` | Kho của họ **không phải archive**. Bất biến "re-run parser trên raw đã lưu" (`p1-service.plan.md` §Parse) chỉ sống nếu **ta** giữ raw |

### 8.2. Bảng chốt: nguồn nào → sản phẩm nào

> 🔴 **BỊ GHI ĐÈ 30/08 (tối) — ĐỌC §12 TRƯỚC.** Chỉ thị mới: **mọi request phải qua Bright Data**,
> lý do là **không để lộ IP/hạ tầng server**. Dòng "minhchinh → KHÔNG dùng Bright Data" dưới đây
> **không còn hiệu lực**. Giữ nguyên bảng để thấy rõ tiêu chí đã đổi: từ _"chỉ trả tiền cho việc vượt
> rào"_ sang _"trả tiền cho cả việc ẩn danh"_ — hai tiêu chí này chọn ra **hai sản phẩm khác nhau**.

Nguyên tắc: **chỉ trả tiền cho việc vượt rào. Nguồn không có rào thì không đi qua vendor.**

| Đích | Rào chắn | Sản phẩm | Vì sao |
| --- | --- | --- | --- |
| `minhchinh.com/livekqxs/xstt/KN.php` (Keno, confirm) | **Không có** | **KHÔNG dùng Bright Data.** Gọi thẳng bằng `@megawin/http-client` | Đã đo `200` từ IP datacenter, 554 byte, không Cloudflare. Đẩy qua vendor = thêm chi phí + thêm điểm chết + thêm latency để đổi lấy **số không** |
| `vietlott.vn` `.ashx` (Keno + Bingo18, **authoritative**) | Cloudflare | **B1 = Residential Proxy `-country-vn`** thử trước (~$0,6–2/th) → **B2 = Web Unlocker** leo thang (~$1,3–10/th) | B1: ta giữ toàn quyền header/cookie/session, rẻ nhất, nhưng **ta** tự lo CF. B2: họ lo CF, đổi lại mất quyền kiểm soát header (xem §2.2) |
| Nếu probe cho thấy Vietlott **bắt buộc nhiều bước JS** | Cloudflare + JS | **Browser API** (Playwright script của **ta**) — **KHÔNG phải Scraper Studio** | Cả hai đều chạy browser trên cloud họ. Khác biệt quyết định: Browser API chạy **code trong repo ta** (có PR review, có CI, test được local); Scraper Studio chạy code trong cloud IDE của họ |
| Backfill lịch sử / thăm dò mirror mới (**không** thuộc đường tiền) | tuỳ | **Scraper Studio** — đây là chỗ nó thực sự đáng dùng | Việc một lần, sai thì làm lại, không ai mất tiền. Đúng cho tham vọng §6 (dataset kết quả) |

**Điểm cần nhấn:** Bingo18 **không có** nguồn confirm nào còn sống (F3) → Bingo18 **bắt buộc** đi qua
Bright Data tới Vietlott, và **vĩnh viễn chỉ có 1 nguồn**. Mọi thiết kế phải chịu được trạng thái
"không bao giờ đạt quorum" thay vì coi đó là lỗi.

### 8.3. Vì sao KHÔNG để Bright Data extract — 5 lý do, không phải sở thích

Câu hỏi "dùng tool gì để extract ra schema result của Vietlott" có 2 đáp án khả thi. Đáp án đúng là
**Bright Data chỉ làm TRANSPORT (bytes), parser là code của ta**. Lý do:

1. **Bất biến B1 sụp đổ.** B1 = "số phải do parser tất định sinh ra từ bytes ta đang giữ". Vendor
   extract → ta nhận **số đã được suy diễn**, bằng chứng duy nhất là lời của họ. Không re-verify được,
   không unit-test được với fixture, không bisect được khi lệch.
2. **"Self-Healing Tool" là rủi ro nghiêm trọng nhất, không phải tính năng.** Bright Data quảng cáo
   sửa scraper bằng prompt tiếng Anh khi site đổi HTML. Nghĩa là **mapping HTML→số trên đường tiền có
   thể bị AI sửa từ xa, không qua diff nào ta xem, không qua deploy nào ta bấm**. Đây đúng là điều B1
   ("LLM không sinh số") tồn tại để ngăn — chỉ khác là vi phạm xảy ra bên ngoài repo ta.
3. **G3: họ xoá dữ liệu sau 7–16 ngày.** `p1-service.plan.md` chốt "đổi parser rồi chạy lại toàn bộ
   lịch sử" — chỉ khả thi nếu ta giữ raw. Mà nếu đã phải giữ raw thì đã tự fetch được raw → tiền trả
   cho extraction là tiền trả 2 lần cho cùng một việc.
4. **Không rẻ hơn.** Cùng $1.5/1K page load. Một page load trả về 30 kỳ ở cả hai cách → không tiết
   kiệm một xu.
5. **Mất kỷ luật review trên đường tiền.** Parser ở `packages/result-collector/src/rules` có PR, có
   `parserVersion`, có fixture, có `biome check`. Code trong cloud IDE của họ: không lịch sử git,
   không CI, đổi bằng cách bấm "Save to Production" — một mutation ngoài luồng vào đúng chỗ tính tiền.

### 8.4. Vậy "tool extract" cụ thể là gì

Không có tool bên thứ 3. Là **3 lớp code trong repo**, đúng layering `game-*`/`game-*-application`:

| Lớp | Vị trí | Nội dung | Ràng buộc |
| --- | --- | --- | --- |
| **Transport** | `packages/result-collector-application/src/services/fetchers/` | `DirectFetcher` (minhchinh), `BrightDataProxyFetcher`, `BrightDataUnlockerFetcher` — cùng 1 interface, trả `{ body, statusCode, fetchedAt }` | Dùng `createHttpClient` (`@megawin/http-client`, có retry+timeout sẵn). **Không** parse ở đây |
| **Parser** | `packages/result-collector/src/rules/parsers/` (pure, không I/O) | `parseVietlottKeno`, `parseVietlottBingo18`, `parseMinhchinhKeno` — `(raw: string) => ParsedDraw[]` | Tất định, không network, không `Date.now()`. Có `parserVersion` hằng số. Test bằng fixture raw thật |
| **Canonicalizer** | `packages/result-collector/src/rules/canonicalize.ts` | Đưa mọi nguồn về 1 dạng so được + sinh 2 hash (§9.2) | Per-game, tường minh. **Đây là chỗ dễ sai nhất** — xem §9.2 |

Zod chỉ dùng ở **ranh giới HTTP** (route ingest / results API), **không** dùng để parse HTML — đúng
§8 `code-quality-standards` (không duplicate validation giữa Zod và use-case).



## 9. Kiến trúc dữ liệu nhiều nguồn

Mục này **sửa** `p1-service.plan.md` §Data model ở 4 điểm; delta tóm tắt ở §10.4.

### 9.1. Ba tầng, không phải hai — lý do là con số, không phải thẩm mỹ

Plan hiện tại có 2 collection: `resultSubmissions` (raw, `parsedDraws?` nhúng bên trong) +
`resultConsensus`. Vấn đề cụ thể: **1 submission = 1 blob chứa ~30 kỳ**. Muốn trả lời câu hỏi trung
tâm của cả hệ thống — _"từng nguồn nói gì về kỳ X?"_ — phải query vào mảng `parsedDraws` **nằm trong
doc chứa raw**, nên mỗi lần đọc kéo cả blob theo. Trang duyệt 50 dòng = kéo 50 blob.

Thêm tầng giữa:

| Collection | 1 doc = | Cỡ | Retention | Đọc bởi |
| --- | --- | --- | --- | --- |
| `resultSubmissions` | 1 lần fetch raw từ 1 nguồn (~30 kỳ) | ~1–30 KB\* | TTL có điều kiện (§9.7) | Chỉ khi cần bằng chứng / re-parse |
| **`resultObservations`** ✨ mới | **1 nguồn × 1 kỳ × 1 bộ số** | ~400 B | Vĩnh viễn | Verify + trang duyệt |
| `resultConsensus` | 1 kỳ (`gameKey` + `drawId`) | ~1 KB | Vĩnh viễn | Trang duyệt + results API |

\* Dùng **endpoint JSON** thay vì HTML cả trang cắt cỡ ~20×: `KN.php` = 554 byte; `.ashx`
`totalRow=30` ước ~10–30 KB, so với 200–500 KB nếu tải HTML. Nhịp 10'/2 game: ~5,5 MB/ngày ≈
165 MB/tháng — chấp nhận được. Nếu tải HTML: ~4,1 GB/tháng — không.

`resultObservations` cũng là chỗ duy nhất `parserVersion` có nghĩa: đổi parser → re-parse từ
`resultSubmissions` → sinh observation **mới song song** cái cũ → so 2 phiên bản parser trên cùng raw
trước khi tin.

### 9.2. ⚠️ Bẫy lớn nhất: thứ tự số — sai chỗ này gây conflict giả 100% kỳ, hoặc resettle oan

Đọc code thật (`packages/game-keno/src/rules/draw-result.ts:9-20`):

> _"So sánh 2 bộ số trúng Keno **theo thứ tự** (element-by-element, exact order). Keno lưu
> `winningNumbers` **đúng thứ tự quay (KHÔNG sort trước khi lưu)** nên so sánh giữ nguyên thứ tự là
> chính xác — **đổi thứ tự cũng coi là kết quả khác**."_

`isSameKenoResult` chính là thứ `PublishResultUseCase` dùng để quyết định "sửa kết quả (⇒
**RESETTLE**)" vs "chỉ sửa metadata". Đồng thời **toàn bộ cách tính thưởng Keno không phụ thuộc thứ
tự**: `matchCount`, `bigCount`/`smallCount`, `evenCount`/`oddCount` đều là phép đếm trên **tập hợp**.

Hai sự thật đó cùng đúng, ghép lại sinh 2 lỗi ngược dấu:

| Nếu so bằng… | Hậu quả |
| --- | --- |
| **Mảng nguyên thứ tự**, giữa các nguồn | minhchinh trả số **tăng dần**, Vietlott trả **thứ tự quay** → khác nhau ở **mọi kỳ** → `Conflicted` giả 100%, lớp D thành máy báo động vô nghĩa rồi bị tắt |
| **Tập hợp đã sort**, rồi ghi vào `DrawDoc` | Publish số đã sort → sau republish đúng thứ tự quay → `isSameKenoResult` = `false` → **RESETTLE kỳ đã settle** dù tiền không đổi một đồng. Sự cố đường tiền sinh ra từ thuần thứ tự |

**Cách giải: 2 hash tách biệt, 2 mục đích, không được lẫn.**

```
payoutHash  = sha256(canonical semantic form)   → SO GIỮA CÁC NGUỒN
displayHash = sha256(exact array as fetched)    → quyết CÓ PUBLISH LẠI hay không
```

| Game | `payoutHash` canonical form | Ghi chú |
| --- | --- | --- |
| Keno | 20 số **sort tăng dần**, string zero-pad `"01".."80"` | Thưởng chỉ phụ thuộc tập hợp ⇒ sort là **đúng nghĩa**, không phải xấp xỉ |
| Bingo18 | 3 mặt xúc xắc **sort tăng dần**, `number` 1–6, **không** pad | Thưởng theo _số lần xuất hiện của n_ / tổng / ba mặt giống nhau (`rules/exposure.ts:167-185`) ⇒ độc lập thứ tự. **Verify lần cuối** xem có loại cược nào ăn theo thứ tự trước khi chốt |

Ba quy tắc bắt buộc:

1. **Agreement/veto so bằng `payoutHash`.** Thứ tự là _cách trình bày của nguồn_, không phải dữ liệu.
   Lệch thứ tự mà `payoutHash` khớp → vẫn `Verified`, chỉ ghi cờ `orderDivergent: true`.
2. **`consensus.numbers` copy NGUYÊN VĂN từ observation của nguồn authoritative** — giữ đúng thứ tự
   quay Vietlott. Nguồn confirm **không bao giờ** ảnh hưởng thứ tự, kể cả khi tới trước.
3. **Worker PULL so `payoutHash` với kỳ đã publish TRƯỚC KHI gọi `PublishResultUseCase`.** Trùng →
   **bỏ qua hoàn toàn**, đừng gọi publish. Đây là cái chặn resettle oan.

### 9.3. Bất đối xứng nguồn phải nằm trong SCHEMA, không nằm trong đầu người viết code

Yêu cầu của bạn — _"Vietlott là kết quả chính, minhchinh là nguồn confirm"_ — nếu chỉ ghi trong tài
liệu thì 6 tháng nữa sẽ có người viết `if (sources.length >= 2) autoApprove()` và thế là một mirror
nghiệp dư vừa được trao quyền quyết định tiền thật. Cách chặn: **đưa vai trò thành thuộc tính có kiểu**.

```ts
export const SourceRole = {
  /** Nguồn quyết định. CHỈ nguồn này được cấp số cho consensus. */
  Authoritative: "authoritative",
  /** Nguồn đối chiếu. Có quyền VETO, KHÔNG có quyền CẤP số. */
  Confirming: "confirming",
} as const;
export type SourceRole = (typeof SourceRole)[keyof typeof SourceRole];
```

Bốn bất biến do vai trò sinh ra — implement thành guard trong `rules/`, không phải comment:

| # | Bất biến | Vì sao |
| --- | --- | --- |
| **R1** | Không có observation `Authoritative` → **không tạo** consensus, dù 5 nguồn confirming đã khớp nhau | Nếu không, minhchinh sai → hệ thống sai theo mà không ai phản đối |
| **R2** | `consensus.numbers` **luôn** copy từ observation `Authoritative` (nguyên thứ tự) | Nguồn confirm không được nhuộm màu kết quả cuối |
| **R3** | Confirming khớp → nâng `status` `Verified`; confirming **lệch** → `Conflicted` (**chặn**) | Đúng nghĩa "veto không cấp": đối xứng ngược giữa quyền chặn và quyền cấp |
| **R4** | Confirming **vắng mặt** ≠ lỗi → `status` `Unconfirmed` (vẫn duyệt tay được) | Bingo18 **vĩnh viễn** ở trạng thái này (F3). Nếu coi vắng mặt là lỗi thì Bingo18 không bao giờ chạy |

Vì `numbers` luôn từ Authoritative, `displayHash` cũng chỉ tính trên nguồn đó. Confirming không có
`displayHash` — cố tình, để không ai vô tình so nó.

### 9.4. `resultObservations` — shape

```ts
export interface ResultObservationDoc {
  _id: unknown;
  submissionId: string;      // → resultSubmissions (bằng chứng)
  sourceId: ResultSourceId;
  sourceRole: SourceRole;    // snapshot lúc quan sát, KHÔNG join runtime
  gameKey: GameKey;

  // ── Nguồn nói gì (nguyên văn, chưa map sang MegaWin) ──
  drawPeriodSource: string;  // mã kỳ Vietlott, vd "293944"
  drawDateSource: ISODateString;
  drawTimeSource?: string;   // CHỈ minhchinh có (`date`) — Vietlott không cho
  numbers: string[];         // nguyên thứ tự nguồn trả

  // ── Hash (§9.2) ──
  payoutHash: string;
  displayHash: string;

  // ── Checksum nguồn tự khai, để đối chiếu với số parse được ──
  claimedChecksums?: Record<string, number>;  // minhchinh: chan/le/lon/nho/total

  // ── Verify nội tại (không cần nguồn khác) ──
  intrinsicChecks: { name: string; passed: boolean; detail?: string }[];

  parserVersion: string;     // re-parse sinh doc mới, không ghi đè
  observedAt: Date;          // = capturedAt của submission
  createdAt: Date;
}
```

Index: unique `{ sourceId, gameKey, drawPeriodSource, parserVersion }` — cùng parser thì idempotent,
đổi parser thì cho phép cùng tồn tại để so.

`claimedChecksums` là món quà từ minhchinh mà Vietlott không có: nguồn **tự khai** 5 con số
(`chan/le/lon/nho/total`). Ta đếm lại từ 20 số parse được rồi so — bắt được lỗi parser **của chính ta**
(lệch cột, nhầm ô) **mà không cần nguồn thứ hai**. Nó verify parser, không verify nguồn.

### 9.5. `resultConsensus` — shape

```ts
export interface ResultConsensusDoc {
  _id: unknown;
  gameKey: GameKey;
  drawId: string;            // "YYYY-MM-DD.NNN" — đã map (§9.6)
  drawNo: number;
  drawDate: ISODateString;
  vietlottRef: DrawVietlottRef;   // dùng type có sẵn @megawin/game-core, KHÔNG tự định nghĩa

  numbers: string[];         // R2: copy nguyên văn từ Authoritative
  payoutHash: string;
  displayHash: string;

  // ── Ai nói gì ──
  contributions: {
    sourceId: ResultSourceId;
    sourceRole: SourceRole;
    observationId: string;
    payoutHash: string;
    agrees: boolean;         // so payoutHash với Authoritative
    orderDivergent: boolean; // payoutHash khớp nhưng displayHash lệch → KHÔNG phải conflict
  }[];

  status: ConsensusStatus;
  verification: {
    intrinsicPassed: boolean;
    periodContinuous: boolean;   // drawPeriodSource = kỳ trước + 1
    dailyCountMatched: boolean;  // Keno = 119 kỳ/ngày
    confirmingAgreeCount: number;
    confirmingDisagreeCount: number;
  };

  // ── Vòng đời tách 3 giai đoạn (§9.8) ──
  reviewedBy?: string; reviewedAt?: Date;
  publishedAt?: Date; publishedDrawId?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

`ConsensusStatus` — 6 giá trị, `const object as const` (§5.3):

| Status | Nghĩa | Auto-publish (P3)? |
| --- | --- | --- |
| `Verified` | Authoritative + ≥1 confirming khớp + mọi check nội tại pass | ✅ đủ điều kiện |
| `Unconfirmed` | Chỉ Authoritative, check nội tại pass, **không có** confirming | ⚠️ chỉ khi game không có nguồn confirm (Bingo18) + exposure thấp |
| `Conflicted` | ≥1 confirming lệch `payoutHash` | ❌ **chặn cứng** — người xử |
| `IntrinsicFailed` | Checksum/format sai ngay từ 1 nguồn | ❌ quarantine |
| `Published` | Đã đẩy sang MegaWin thành công | — |
| `Rejected` | Người từ chối | ❌ |

Index: unique `{ gameKey, drawId }`; `{ status: 1, createdAt: -1 }` cho trang duyệt (theo tiền lệ
`ops_alerts`, `packages/game-keno/src/indexes/index.ts:350-361`).

### 9.6. Map `drawPeriod` → `drawId`: chỗ nguồn confirm có giá trị lớn nhất, lớn hơn cả việc so số

`p1-service.plan.md` map bằng **neo đầu ngày**: `drawNo = drawPeriodSource − basePeriod + 1`. Rủi ro
cấu trúc: nếu `basePeriod` sai (bỏ sót kỳ đầu ngày do downtime), **mọi kỳ sau đó lệch 1** —
số hoàn toàn hợp lệ, checksum pass, `payoutHash` khớp giữa các nguồn, mà **gán sai kỳ**. Đây là dạng
sai nguy hiểm nhất: mọi lớp verify đều xanh, tiền trả cho kỳ khác.

`drawTimeSource` của minhchinh (field `date`, có **giờ quay chính xác**) giải trực tiếp:

```
drawNo_derived = floor((drawTime − firstDrawTime) / drawIntervalMinutes) + 1
```

Keno: `firstDrawTime = "06:08"`, 8 phút/kỳ, 119 kỳ/ngày (đã verify, `keno-game-rules.mdc`). Suy ra
`drawNo` từ **đồng hồ**, độc lập hoàn toàn với chuỗi `drawPeriod` — rồi **so với** `drawNo` suy từ
neo. Lệch → `Conflicted`, không đoán.

Giá trị lớn nhất của nguồn confirm hoá ra **không phải** xác nhận 20 số (Vietlott gần như không thể
sai số của chính nó), mà là **xác nhận kỳ nào**. Cần ghi rõ vì nó đảo ưu tiên khi implement: làm
`drawTimeSource` cross-check **trước** khi làm so-số.

Bingo18 không có nguồn confirm → không có cross-check này → **luôn** phải kiểm `dailyCountMatched`
và `periodContinuous`, và ngưỡng auto-publish phải chặt hơn Keno.

### 9.7. Retention — TTL vô điều kiện là bẫy: nó xoá đúng thứ cần khi tranh chấp

Câu hỏi mở của plan (_"TTL của `resultSubmissions.raw` giữ bao lâu?"_) có một cái bẫy: TTL Mongo xoá
theo **thời gian**, không theo **trạng thái**. Đúng lúc tranh chấp trả thưởng nổ ra (thường sau nhiều
tuần), raw làm bằng chứng đã bị xoá.

Chính sách theo trạng thái, không theo tuổi:

| Loại | Giữ | Cách |
| --- | --- | --- |
| Submission mà mọi consensus liên quan đều `Verified`/`Published` | 30 ngày | TTL index có `partialFilterExpression` — tiền lệ `worker_locks` (`packages/worker-core/src/indexes/index.ts:39-44`) |
| Submission dính `Conflicted`/`IntrinsicFailed`/`Rejected` | **Vĩnh viễn** | Không match partial filter ⇒ TTL không chạm |
| `resultObservations` | **Vĩnh viễn** (~400 B × ~57K/tháng ≈ 23 MB/tháng) | Không TTL |
| `resultConsensus` | **Vĩnh viễn** | Không TTL |

Cần field điều khiển TTL (vd `retentionState`) do use-case set khi consensus chốt trạng thái — TTL
không đọc được collection khác. Đây là lý do phải là **field trên submission**, không phải suy ra
runtime.

### 9.8. Ba giai đoạn vòng đời — `Approved` là tên gây nhầm, phải tách

Plan hiện dùng `status: Approved` cho cả "người đã duyệt" và "đủ điều kiện đưa sang MegaWin". Trộn 2
việc: (a) **verify** — máy làm; (b) **review** — người làm; (c) **publish** — MegaWin làm. Ở P3
(auto-publish) giai đoạn (b) bị **bỏ qua**, nên nếu `Approved` là tiền đề của (c) thì P3 buộc phải
_giả vờ_ có người duyệt. Trạng thái giả trong audit trail của đường tiền là điều không được có.

Tách bằng `status` (máy) + 2 cặp timestamp (người/publish):

```
verify (máy)          → status = Verified | Unconfirmed | Conflicted | IntrinsicFailed
review (người, P1-P2) → reviewedBy + reviewedAt   (P3 bỏ qua, KHÔNG cần giả)
publish (MegaWin)     → publishedAt + status = Published
```

`GET /api/results` lọc theo **điều kiện tường minh**, không theo một chữ `Approved`:

```
P1–P2 (shadow):  status ∈ {Verified, Unconfirmed} AND reviewedAt != null
P3 (auto):       status = Verified AND exposure < threshold AND killSwitch = off
Bingo18 P3:      status ∈ {Verified, Unconfirmed} AND exposure < threshold (chặt hơn)
```

Đọc điều kiện là thấy ngay ai đã gật — không cần tra nghĩa của `Approved` ở phiên bản nào.

## 10. Verify cuối cùng — 6 lớp, xếp theo thứ tự "chặn sớm, rẻ trước"

### 10.1. Bảng 6 lớp

Lớp 1–3 cần **1 nguồn**; lớp 4–5 cần **nhiều nguồn**; lớp 6 là con người / ngưỡng tiền.

| # | Lớp | Cần gì | Bắt được lỗi gì | Kết quả khi fail |
| --- | --- | --- | --- | --- |
| **1** | **Format + intrinsic** — Keno đúng 20 số phân biệt `01–80`; Bingo18 3 mặt `1–6`; `payoutHash` tính được | 1 nguồn | Parser lệch cột, HTML đổi layout, response bị truncate | `IntrinsicFailed` → quarantine, **không** tạo consensus |
| **2** | **Đối chiếu `claimedChecksums`** — đếm lại chẵn/lẻ/lớn/nhỏ/tổng từ số parse được, so với 5 số nguồn tự khai | 1 nguồn (chỉ minhchinh có) | Parser đọc đúng format nhưng **sai ô** — lỗi nguy hiểm vì lớp 1 không bắt được | `IntrinsicFailed` |
| **3** | **Liên tục kỳ + đếm kỳ/ngày** — `drawPeriodSource` = kỳ trước +1; Keno đúng 119 kỳ/ngày | 1 nguồn + lịch sử | Bỏ sót kỳ, nguồn nhét kỳ lạ, lệch neo `basePeriod` | `periodContinuous=false` → chặn auto-publish, cho duyệt tay |
| **4** | **Cross-check `drawNo` từ giờ quay** (§9.6) | Confirming có `drawTimeSource` | **Lệch neo → gán số đúng cho kỳ sai.** Mọi lớp khác đều xanh | `Conflicted` — chặn cứng |
| **5** | **Veto `payoutHash` giữa các nguồn** | ≥2 nguồn | Một nguồn bị sửa/hỏng/tấn công | `Conflicted` — chặn cứng |
| **6** | **Ngưỡng exposure + người** | Dữ liệu cược MegaWin | Đúng dữ liệu nhưng **hệ quả tiền quá lớn** để tin máy | Buộc người duyệt bất kể lớp 1–5 xanh |

Lớp 6 là lớp duy nhất **không** kiểm dữ liệu — nó kiểm **hệ quả**. Kỳ có exposure cao bất thường phải
qua người dù 5 lớp trước hoàn hảo, vì cái giá của một lần sai không đối xứng với cái lợi của tự động.

### 10.2. Bất biến giữ nguyên từ tài liệu cũ

Không nới một cái nào; **B1 được củng cố** bởi §8.3:

- **B1** — số **chỉ** do parser tất định trong repo sinh ra từ bytes ta đang giữ. Không LLM, **không
  vendor extraction**.
- Service ghi `resultConsensus` (staging), **không** ghi `DrawDoc`. MegaWin PULL rồi tự publish.
- `settle` vẫn là **hành động của người**.
- **Không** auto-publish kỳ đã settle mà `payoutHash` đổi → alert, người xử.
- Degrade êm: mọi nguồn chết → nhập tay, không chặn vận hành.
- Alert hạ tầng (nguồn chết, fetch fail) vào `/system/workers`, **không** trộn vào `ops_alerts` (đó là
  alert rủi ro cược).

### 10.3. Nhịp fetch — ràng buộc là ngân sách credit, không phải Cloudflare

> 🔴 **ĐÃ ĐÍNH CHÍNH — đọc §13.1.** Bảng dưới giả định `TotalRow=30` lấy 30 kỳ/request. **Sai:** page
> size **luôn 6**. Mọi con số overlap ở đây phải chia ~5. Phương án chính cũng đã đổi sang detail URL
> per-kỳ (§13.3) nên bảng này chỉ còn giá trị lịch sử.

Với G1 (5.000 credit/tháng **tổng pool**):

| Nhịp | Vietlott req/tháng (2 game) | Free tier? | Ghi chú |
| --- | --- | --- | --- |
| 10 phút | ~8.640 | ❌ vượt 1,7× | ~$5,5/tháng nếu trả tiền |
| 15 phút | ~5.760 | ❌ vượt nhẹ | ~$1,1 sau khi trừ free |
| **20 phút** | **~4.320** | ✅ **vừa khít** | Keno 8'/kỳ ⇒ mỗi lần lấy `totalRow=30` phủ ~4h ⇒ **không mất kỳ nào**, chỉ trễ ≤20' |
| 30 phút | ~2.880 | ✅ thoải mái | Trễ ≤30' |

Điểm dễ bị bỏ qua: vì mỗi request trả **~30 kỳ lịch sử**, nhịp thưa **không** làm mất dữ liệu — chỉ
làm tăng độ trễ. Với shadow mode (không auto-publish) độ trễ hoàn toàn vô hại. **Chốt: 20 phút cho
shadow mode → chi phí Bright Data = $0.** minhchinh không tính credit (gọi thẳng) nên poll 5 phút được,
nhưng nên giữ 10 phút cho lịch sự.

Cả 2 fetcher chạy trong worker dùng `TickLoopWorker` (`@megawin/worker-core`) — lock `worker_locks` có
sẵn, tránh 2 Lambda cùng đốt credit.

### 10.4. Delta so với `p1-service.plan.md` — cần cập nhật plan

| # | Plan hiện tại | Sửa thành | Lý do |
| --- | --- | --- | --- |
| 1 | 2 collection | **3** (thêm `resultObservations`) | §9.1 — query per-source-per-draw không kéo blob |
| 2 | So sánh nguồn bằng `numbers` | **`payoutHash` + `displayHash` tách biệt** | §9.2 — conflict giả 100% / resettle oan |
| 3 | Nguồn ngang hàng, `agreement = khớp/tổng` | **`SourceRole`** + 4 bất biến R1–R4 | §9.3 — mirror không được cấp số |
| 4 | `status: Pending/Approved/Rejected/Conflict` | **6 status máy + `reviewedAt`/`publishedAt` tách** | §9.8 — P3 khỏi giả vờ có người duyệt |
| 5 | TTL raw theo tuổi | **TTL `partialFilterExpression` theo trạng thái** | §9.7 — đừng xoá bằng chứng tranh chấp |
| 6 | Extension MV3 (`p2-extension.plan.md`, 732 dòng) | **Hoãn.** Bright Data + fetch trực tiếp thay thế | §5.2 — bỏ máy Windows, CRX, heartbeat, device token |
| 7 | Nguồn = extension đẩy vào (`POST /api/ingest`) | **Server tự PULL** (`TickLoopWorker`) | Không còn extension ⇒ không cần ingest API/device auth ở P1 |
| 8 | Verify 3 lớp | **6 lớp** (§10.1) | Thêm checksum-claim, cross-check giờ quay, exposure |

Điểm 6–7 xoá phần lớn `p2-extension.plan.md` và các todo `ingest-api`/`heartbeat` của
`p1-service.plan.md`. **Chưa sửa 2 plan đó** — chờ bạn chốt hướng, vì nó phụ thuộc quyết định ToS
(§4) vốn là quyết định kinh doanh, không phải kỹ thuật.

## 12. Chỉ thị "TẤT CẢ qua Bright Data" — đối chiếu Web Unlocker / Crawl API / Scraper Studio

> **Chỉ thị 30/08 (tối):** mọi request đi qua Bright Data, mục tiêu **không lộ IP/hạ tầng server**.
> Mục này thay thế §8.2 và đi sâu vào 3 sản phẩm bạn nêu + bài toán phân trang Vietlott.

### 12.1. Chỉ thị này đổi tiêu chí chọn sản phẩm, không chỉ đổi danh sách nguồn

"Ẩn danh" và "vượt rào" là **hai bài toán khác nhau, hai mô hình tính tiền khác nhau**:

| Nhu cầu | Sản phẩm đúng | Tính tiền | minhchinh cần? | Vietlott cần? |
| --- | --- | --- | :--: | :--: |
| Ẩn IP, không cần vượt rào | **Proxy** (Residential / Datacenter) | **per GB** | ✅ | ✅ |
| Ẩn IP **+** vượt Cloudflare/CAPTCHA | **Web Unlocker** | **per request** | ❌ | ✅ |

Điểm dễ bỏ qua nhất: **"tất cả qua Bright Data" KHÔNG có nghĩa "tất cả qua Web Unlocker".** Proxy
cũng là Bright Data, cũng ẩn IP tuyệt đối như nhau, nhưng tính tiền theo GB. Với `KN.php` = **554
byte**, đẩy qua proxy tốn ~**2,4 MB/tháng** ≈ **$0,02**; đẩy qua Web Unlocker tốn **4.378 request**
tức gần **hết sạch free tier 5.000 credit** — đúng credit mà Vietlott (nguồn thật sự cần vượt rào)
đang cần. Dùng Web Unlocker cho minhchinh là **lấy ngân sách của việc khó đem tiêu cho việc dễ**.

⇒ Chỉ thị của bạn được tôn trọng 100%, chỉ khác cách thực hiện: **minhchinh qua Proxy zone, Vietlott
qua Unlocker/Scraper Studio.** Không request nào rời hạ tầng ta mà đi trực tiếp tới site đích.

### 12.2. Sự thật quyết định về endpoint Vietlott (đã có trong repo, §2.2 tài liệu cũ)

Ba đặc điểm này loại/chọn sản phẩm, nên phải đặt lên trước:

| Đặc điểm | Chi tiết | Hệ quả chọn sản phẩm |
| --- | --- | --- |
| **Là `POST`, không phải `GET`** | `POST /ajaxpro/Vietlott.PlugIn.WebParts.GameKenoCompareWebPart,...ashx` | Loại mọi sản phẩm chỉ nhận input `{url}` |
| **Cần 3 header đặc thù** | `Content-Type: text/plain; charset=utf-8` · `X-AjaxPro-Method: ServerSideDrawResult` · `X-Requested-With: XMLHttpRequest` | Đây là **nút thắt** của Web Unlocker (§12.4) |
| **Phân trang nằm TRONG BODY** | `{ ORenderInfo, GameId, GameDrawNo, DrawDate, PageIndex, TotalRow }` — `TotalRow` là **page size** (default 10) | Loại Crawl API (§12.3), và làm phân trang thành **non-issue** cho vận hành ngày (§12.5) |

### 12.3. Crawl API — bị loại vì lý do cấu trúc, không phải vì giá

Đọc OpenAPI thật (`docs.brightdata.com/api-reference/rest-api/scraper/crawl-api`): Crawl API là
`POST /datasets/v3/trigger?dataset_id=...`, thuộc họ **Web Scraper API / Datasets**, không phải họ
Unlocker.

| Nó đòi gì | Vietlott có? | Kết luận |
| --- | --- | --- |
| `dataset_id` — 1 scraper **đã tồn tại** cho site đích (`gd_...`) | ❌ Không có dataset cho `vietlott.vn` | Không có gì để trigger |
| Input là mảng `[{ url: "..." }]` — **chỉ URL** | ❌ Cần `method: POST` + `body` + 3 header | **Không có chỗ để truyền** body/header/method |
| Phân trang qua `limit_per_input` / `limit_multiple_results` — tức crawler **tự đi theo link** | ❌ Phân trang Vietlott nằm trong POST body, không có link để đi theo | Không paginate được endpoint này |
| Kết quả là **structured record** theo schema của dataset | ⚠️ Vi phạm B1 (§8.3) | Kể cả nếu chạy được cũng không nên |

**Crawl API sinh ra cho bài toán "cho tôi URL, tự bò theo link, trả record có cấu trúc".** Endpoint
Vietlott là **XHR target** — không nằm trong graph link nào, không tới được bằng cách bò. Đây là lý do
cấu trúc, không thể lách bằng cấu hình. **Loại.**

(Cùng lý do này loại luôn Web Scraper API pre-built và SERP API — đã ghi ở §2.1.)

### 12.4. Web Unlocker — chạy được, nhưng có 2 điều khoản phải biết TRƯỚC khi cam kết

Web Unlocker **hỗ trợ đủ** những gì Vietlott cần: `method: "POST"`, `body`, `country: "vn"`,
`data_format: "screenshot"` (bằng chứng audit), `debug: true`. Nút thắt duy nhất là **3 header đặc
thù**. Docs `web-unlocker/configuration` nói rõ: mặc định BD **tự sinh header và bỏ header lạ**; muốn
gửi header của mình phải bật **Custom Headers & Cookies**, và header ngoài pre-approved list phải
**submit cho compliance team BD duyệt**.

Bật tính năng đó kéo theo **hai hệ quả**, hệ quả thứ hai là thứ tôi mới tra được và nó đổi cả bài
toán chi phí:

| # | Hệ quả | Trích docs | Tác động |
| --- | --- | --- | --- |
| 1 | Header ngoài allowlist phải **compliance BD duyệt** | _"submit an approval request to Bright Data's compliance team... include details about the header/cookie and its purpose"_ | Có thể bị từ chối. `X-AjaxPro-Method` là header lạ ⇒ gần như chắc chắn phải xin |
| 2 | 🔴 **Tính tiền 100% request, kể cả FAIL** | _"enabling this feature means you'll be charged for 100% of the requests (both successful and failed). This change is due to Bright Data not having full control over the process"_ | **Mất hẳn cam kết "pay only for success"** — vốn là lý do chính chọn Web Unlocker. Nếu Vietlott chặn 40% thì ta trả cho cả 40% đó |

Hệ quả #2 nghiêm trọng hơn #1: **bật custom header là tự nguyện từ bỏ đúng cái làm Web Unlocker đáng
giá**. Nó cũng làm mọi ước tính chi phí ở §2.5/§10.3 thành **sàn, không phải trần** — con số thật phụ
thuộc tỷ lệ fail mà **chưa ai đo**.

Ba đường đi, xếp theo thứ tự thử:

| Ưu tiên | Cách | Vì sao đáng thử trước |
| --- | --- | --- |
| **U1** | POST qua Unlocker **KHÔNG custom header** (chỉ `method`+`body`+`country`) | Nếu server AjaxPro đọc method từ **URL/body** thay vì header thì **hết vướng cả #1 và #2**. Rẻ nhất, nhanh nhất, chưa ai đo — chính là phép đo §7.1 #2 |
| **U2** | GET **trang HTML** `winning-number-keno` qua Unlocker | GET thuần, **không cần header lạ** ⇒ giữ được "pay only for success". Đánh đổi: payload 200–500 KB thay vì ~10–30 KB, và phân trang phải giải khác (§12.5) |
| **U3** | Bật custom header + xin compliance | Chỉ khi U1 fail và U2 không phủ đủ dữ liệu. Chấp nhận trả cho request fail |

**U2 là phương án dự phòng thật sự**, không phải phương án chữa cháy — nó đánh đổi bandwidth (rẻ, đo
được) để lấy lại mô hình giá tốt và bỏ hẳn rủi ro compliance. Với nhịp 20 phút, 500 KB × 4.320 =
~2,1 GB/tháng, vẫn nhỏ.

### 12.5. Phân trang Vietlott — phải tách 2 bài toán, chúng có đáp án ngược nhau

> 🔴 **ĐÃ ĐÍNH CHÍNH — đọc §13.1 + §13.3.** Mục này viết khi còn tin `TotalRow` là page size. Kết luận
> "vận hành ngày không cần phân trang" **vẫn đúng** nhưng vì lý do khác (detail URL per-kỳ, không phải
> `TotalRow=30`). Việc tách 2 bài toán ngày/backfill **vẫn đúng và vẫn là điểm chính**.

Bạn nêu đúng một điểm dễ làm sai. Nhưng "phân trang" ở đây là **hai bài toán khác nhau**, và trộn
chúng lại sẽ dẫn tới thiết kế sai:

| | **Vận hành hằng ngày** | **Backfill lịch sử** |
| --- | --- | --- |
| Cần gì | ~30 kỳ gần nhất | Nhiều năm: ~119 kỳ/ngày × 365 × N năm |
| Số lần lấy | Liên tục, mãi mãi | **Một lần duy nhất** |
| Phân trang? | ❌ **KHÔNG CẦN** — `TotalRow: 30` là **1 request** phủ ~4 giờ | ✅ Cần đi hết `PageIndex` |
| Sai thì sao | **Sai số tiền thật** | Chạy lại, không ai mất tiền |
| Sản phẩm | Web Unlocker (U1/U2) | **Scraper Studio** — đây là chỗ nó thực sự đúng |

**Vận hành ngày: phân trang là non-issue.** `TotalRow` là **page size** (không phải tổng bản ghi — bản
hiểu sai này đã được sửa ở tài liệu cũ §4.8). Đặt `TotalRow: 30` với `PageIndex: 0` là lấy 30 kỳ gần
nhất **trong đúng 1 request**. Keno 8'/kỳ ⇒ 30 kỳ phủ **4 giờ**. Nhịp 20 phút ⇒ overlap ~12× ⇒ mất
kỳ chỉ xảy ra nếu hệ thống chết **>4 giờ liền**. Và khi đó, tăng `TotalRow` lên 200 (~26 giờ) **vẫn là
1 request** — phân trang không bao giờ vào đường nóng.

**Backfill: đây mới là chỗ phân trang tồn tại, và là chỗ Scraper Studio đáng dùng.** Vì:

- Cần vòng lặp `PageIndex = 0..N` với điều kiện dừng (page rỗng / trùng kỳ đã có) — Scraper Studio cho
  viết JS vòng lặp đó chạy trên hạ tầng họ; Web Unlocker thì ta tự lặp và tự trả tiền từng request.
- Nó **không nằm trên đường tiền** ⇒ 5 lý do phản đối vendor-extract ở §8.3 **không áp dụng**: kết quả
  backfill vẫn phải đi qua đúng 6 lớp verify (§10.1) trước khi được publish, nên "Self-Healing sửa
  parser bằng AI" không thể âm thầm làm sai một kỳ đang trả thưởng.
- G3 (họ xoá dữ liệu sau 16 ngày) **không thành vấn đề** với việc chạy một lần rồi kéo về ngay.

⇒ **Chốt phân công:** Scraper Studio làm **backfill + thăm dò nguồn mới**, Web Unlocker làm **nhịp
sống hằng ngày**. Cả hai đều là Bright Data ⇒ chỉ thị của bạn được giữ. Điều **không** nên làm là để
Scraper Studio chạy nhịp hằng ngày và tự extract ra số — đó là lúc §8.3 áp dụng đầy đủ.

Nếu đi nhánh **U2 (GET trang HTML)** thì phân trang ngày trở lại thành vấn đề thật, vì trang HTML chỉ
hiển thị ~10 kỳ và bấm sang trang lại là XHR POST. Đây là lý do U2 xếp sau U1 dù mô hình giá của nó
tốt hơn — và cũng là lý do phép đo U1 (§7.1 #2) là phép đo đáng làm nhất.

### 12.6. Kiến trúc chốt — 3 zone Bright Data, 1 abstraction trong repo

```
┌─ HẠ TẦNG TA (IP không bao giờ lộ ra site đích) ───────────────┐
│  TickLoopWorker (@megawin/worker-core, lock worker_locks)      │
│         │ mọi outbound đi qua Fetcher abstraction              │
└─────────┼─────────────────────────────────────────────────────┘
          ▼
┌─ BRIGHT DATA (3 zone, 1 tài khoản) ──────────────────────────┐
│  Z1  proxy zone (residential -country-vn)   → minhchinh       │
│      per-GB · 554 B/req ⇒ ~$0,02/tháng                        │
│  Z2  unlocker zone (country: vn)            → Vietlott ngày   │
│      per-request · U1 → U2 → U3 (§12.4)                       │
│  Z3  Scraper Studio collector               → backfill 1 lần  │
│      per-page-load · CHỈ ngoài đường tiền (§12.5)             │
└─────────┬─────────────────────────────────────────────────────┘
          ▼  raw bytes (KHÔNG phải số đã suy diễn — B1)
   resultSubmissions → parser trong repo → resultObservations
                     → 6 lớp verify (§10.1) → resultConsensus
```

Một interface duy nhất trong `packages/result-collector-application/src/services/fetchers/`:

```ts
export interface SourceFetcher {
  fetch(req: FetchRequest): Promise<FetchResult>;  // { body, statusCode, fetchedAt, transport }
}
```

Ba implementation: `ProxyFetcher` (Z1), `UnlockerFetcher` (Z2), `StudioFetcher` (Z3, chạy tay).
Parser **không biết** transport nào — đổi U1→U2 chỉ đổi 1 dòng config, không đụng parser. `transport`
lưu vào `resultSubmissions` để về sau truy được kỳ nào lấy qua đường nào.

Bắt buộc: **`DirectFetcher` bị xoá khỏi codebase**, không giữ làm fallback. Nếu còn tồn tại, một hôm
Bright Data hỏng, ai đó sẽ bật nó lên "cho chạy tạm" và IP server lộ đúng lúc không ai theo dõi. Thay
vào đó: BD hỏng → **fail + alert + degrade về nhập tay**, đúng bất biến "degrade êm" (§10.2).

### 12.7. Giới hạn thật của "không lộ thông tin server" — phải nói rõ để không tin sai

Chỉ thị đạt được **2 trong 3** lớp ẩn danh. Ghi rõ để sau này không ai tưởng đã kín hoàn toàn:

| | Site đích thấy gì | Đạt? |
| --- | --- | --- |
| **IP / ASN / vị trí hạ tầng ta** | Chỉ thấy IP Bright Data | ✅ Đạt |
| **Fingerprint / header / TLS của ta** | BD tự sinh (Unlocker) hoặc ta kiểm soát (Proxy) | ✅ Đạt (⚠️ Proxy thì **ta** phải tự lo TLS/UA cho giống browser thật) |
| **Pattern hành vi** — nhịp đều tăm tắp, luôn `TotalRow=30`, đúng 2 game | Vẫn nhận ra được là **một** client tự động | ❌ **Không** đạt bằng cách đổi sản phẩm |

Lớp thứ ba chỉ giảm được bằng **jitter nhịp poll** (±20% quanh 20 phút, không phải cron chẵn) và đừng
dùng `TotalRow` cố định. Rẻ, nên làm ngay từ đầu.

Hai điều **Bright Data không giải quyết**, đã ghi ở §4.1/§4.3 nhưng nhắc lại vì chỉ thị mới làm chúng
nặng hơn:

1. **ToS không được cải thiện** — đi qua vendor để vượt Cloudflare có vị thế **xấu hơn** extension trên
   máy thật. Ẩn IP làm ta khó bị chặn hơn, **không** làm việc đó hợp pháp hơn.
2. **Bright Data thấy toàn bộ nội dung request/response** — thay vì Vietlott thấy IP ta, giờ BD thấy ta
   đang thu thập gì, nhịp nào, từ đâu. Rủi ro thấp (kết quả xổ số là dữ liệu công khai, không PII,
   không secret) nhưng **là dịch chuyển tin cậy, không phải xoá bỏ nó**.

### 12.8. Cập nhật việc phải làm — thứ tự đã đổi

Chỉ thị mới đưa phép đo **U1** lên đầu, thay chỗ phép đo "IP Việt Nam" cũ:

| # | Phép đo | Quyết định phụ thuộc | Ước |
| --- | --- | --- | --- |
| **1** | **U1: POST `.ashx` qua Unlocker KHÔNG custom header** → `200` + `HtmlContent` có số? | Có phải bật custom header ⇒ có mất "pay only for success" + có phải xin compliance hay không. **Chặn cả chi phí lẫn tiến độ** | 30' |
| **2** | Hỏi compliance BD: nhận target `vietlott.vn` + use-case gambling operator? | **Chặn toàn bộ hướng BD** — hỏi trước khi nạp tiền | 1 ngày chờ |
| **3** | Nếu #1 fail → U2: GET trang HTML qua Unlocker, đếm số kỳ thấy được | U2 có phủ đủ nhịp ngày, hay buộc phải U3 | 30' |
| **4** | minhchinh qua **proxy zone**: `KN.php` còn `200`? (một số site chặn IP residential) | Z1 chạy được hay phải chuyển minhchinh sang Unlocker | 15' |
| **5** | Bingo18: có loại cược nào ăn theo **thứ tự** xúc xắc không? | Chốt canonical form `payoutHash` (§9.2) — đọc code, không cần BD | 20' |

Phép đo #4 là rủi ro mới **do chính chỉ thị sinh ra**: trước đây minhchinh gọi thẳng và đã đo `200`;
qua proxy residential thì chưa biết. Phải đo trước khi coi Z1 là xong.

## 13. Đính chính cơ chế `.ashx` + endpoint detail theo kỳ — đổi phương án chính

> **Nguồn:** bạn cung cấp 30/08 (22:35), kèm ảnh trang detail. Mục này **đính chính §10.3, §12.5, H4,
> G7** và **đổi phương án chính** cho Vietlott.

### 13.1. Đính chính: `TotalRow` KHÔNG phải page size — page size là 6 cố định

| | Tài liệu cũ hiểu | **Thực tế** |
| --- | --- | --- |
| `TotalRow` | Page size, đặt 30/200 để lấy nhiều kỳ 1 request | **Tổng số row có trong hệ thống** (khi không chọn ngày) — là **metadata đếm**, không phải tham số điều khiển |
| Số kỳ / 1 request | 30 hoặc 200 tuỳ ý | **Luôn 6** |
| Lấy thêm | Tăng `TotalRow` | **Phải nhảy `PageIndex`** |

Đây là **lần thứ hai** hiểu sai đúng tham số này: tài liệu cũ §4.8 từng sửa từ _"TotalRow là tổng bản
ghi"_ sang _"TotalRow là page size"_ — và lần sửa đó **cũng sai**. Bài học: tham số của endpoint nội bộ
không tự suy ra được từ tên, và không suy ra được từ code crawler bên thứ ba (repo
`vietlott-data` — đã biết là schema của nó sai với Keno, §2.2 tài liệu cũ). **Chỉ người đã gọi thật mới
biết.**

Hệ quả lên các con số đã viết — tất cả đều **sai theo hướng lạc quan**:

| Chỗ | Đã viết | Sửa thành |
| --- | --- | --- |
| §10.3 / G7 | `TotalRow=30` phủ 4 giờ ⇒ nhịp 20' overlap 12× | 6 kỳ ⇒ Keno phủ **48 phút** (6×8'), Bingo18 phủ **~36 phút**. Nhịp 20' overlap chỉ **2,4× / 1,8×** |
| §12.5 / H4 | "Vận hành ngày KHÔNG cần phân trang" | Vẫn **đúng** cho nhịp bình thường (6 kỳ > số kỳ sinh ra trong 20') nhưng **sai** cho catch-up: chết 4 giờ = 30 kỳ Keno ⇒ **5 lần nhảy `PageIndex`** |
| §12.5 | Backfill "lặp PageIndex" — không có số | Keno 119 kỳ/ngày ÷ 6 = **20 call/ngày-partition**; 7 năm ≈ **51.100 call** (~$77). Bingo18 ~27 call/ngày ≈ **69.000 call** (~$104) |

### 13.2. Endpoint detail theo kỳ — dữ liệu tốt hơn `.ashx`, và là `GET` thuần

```
GET https://www.vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/view-detail-keno-result?id=0293945
```

`id` = **`drawPeriod` zero-pad 7 chữ số**. Trang trả về (đã đọc ảnh):

| Dữ liệu | Giá trị trong ảnh | Ghi chú |
| --- | --- | --- |
| Ngày quay | `30/08/2026` | `DD/MM/YYYY` |
| Kỳ quay | `#0293945` | khớp `id` |
| 20 số | `07 09 14 15 16 19 20 25 34 43 47 49 56 58 61 63 70 71 76 78` | **tăng dần** — xem §13.6 |
| **CHẲN / LẺ** | `9 / 11` | ✅ **đã verify tay**: 14,16,20,34,56,58,70,76,78 = 9 chẵn |
| **LỚN / NHỎ** | `11 / 9` | ✅ **đã verify tay**: 43,47,49,56,58,61,63,70,71,76,78 = 11 số ≥41 |
| Bảng giải từng playtype | tab `Chọn 10 số` … `Chọn 1 số`, `Chẵn/Lẻ`, `Lớn/Nhỏ` + **số lượng trúng thưởng** | Không cần cho settle của ta, nhưng là bằng chứng audit rất mạnh |

**Bốn checksum này đến từ chính nguồn authoritative** — điều tài liệu cũ tưởng không có ("Vietlott chỉ
cho 2 checksum", §1.2). Nghĩa là **lớp verify 2 (đối chiếu `claimedChecksums`, §10.1) chạy được trên
Vietlott mà không cần minhchinh**. Đây là nâng cấp thật về độ an toàn, không chỉ về chi phí.

### 13.3. 🔴 Vì sao detail URL nên là đường CHÍNH, không phải fallback

`GET` + tham số trên **URL** + không header lạ ⇒ **xoá sạch nút thắt H3**:

| Vấn đề của `.ashx` | Detail URL |
| --- | --- |
| `POST` + `X-AjaxPro-Method` ⇒ phải bật **Custom Headers** | `GET` thuần ⇒ **không cần** |
| Custom Headers ⇒ phải **xin compliance BD duyệt** (có thể bị từ chối) | **Không phải xin gì** |
| Custom Headers ⇒ **tính tiền 100% request kể cả FAIL** | **Giữ nguyên "pay only for success"** |
| Input không phải URL ⇒ **loại Crawl API / Scraper Studio** | Input **là URL** ⇒ **mở cửa lại cả hai** |
| `id` phải khám phá qua phân trang | `id` = `drawPeriod`, **liên tục +1** ⇒ suy ra bằng **số học**, không cần khám phá |

Cái giá phải trả: **1 credit / 1 kỳ** thay vì 1 credit / 6 kỳ. Với nhịp ngày: Keno 119 + Bingo18 ~160 =
279 kỳ/ngày ⇒ **8.480 request/tháng** ⇒ vượt free tier, **~$5,2/tháng**.

**$5/tháng để đổi lấy: không đơn compliance, không rủi ro bị từ chối, giữ pay-per-success, dùng được
Scraper Studio, thêm 4 checksum authoritative.** Đây là món rẻ nhất trong cả nghiên cứu. Đảo phương án:

- **Đường chính (đường tiền):** detail URL, `GET`, per-kỳ.
- **Đường bulk (`.ashx`, 6 kỳ/call):** chỉ dùng khi **hiệu suất 6× thực sự đáng** — catch-up sau
  downtime dài và **backfill lịch sử**. Cả hai đều **ngoài đường nóng**, nên nếu compliance từ chối
  custom header thì chỉ mất tối ưu, **không chặn hệ thống**.

Điểm quan trọng về rủi ro: trước đính chính này, toàn bộ hệ thống **phụ thuộc** vào việc BD compliance
duyệt `X-AjaxPro-Method`. Sau đính chính, phụ thuộc đó **biến mất khỏi đường tiền** — nó tụt xuống
thành "tối ưu chi phí backfill". Đó là thay đổi lớn nhất mà thông tin của bạn mang lại.

### 13.4. Kiến trúc mới: minhchinh làm "con trỏ `id`", Vietlott detail làm nguồn quyết định

`id` của detail URL **chính là** `ky` mà `KN.php` trả về (đã đo: `293943` → `293944`; ảnh:
`#0293945` — cùng dãy, chỉ khác zero-pad). Ghép lại được một luồng rất gọn cho **Keno**:

```
① Z1 proxy → KN.php (554 B, ~$0,02/tháng)
   → biết ky mới nhất = 0293945 + 5 checksum của mirror
                │
② Z2 unlocker → GET view-detail-keno-result?id=0293945   (GET thuần, pay-per-success)
   → 20 số AUTHORITATIVE + 4 checksum của chính Vietlott
                │
③ so 2 nguồn (payoutHash) + so 4 checksum + so 5 checksum → 6 lớp verify §10.1
```

Ưu điểm so với poll `.ashx`: **không đoán, không phân trang, không header lạ.** Mirror làm việc rẻ
(phát hiện có kỳ mới), Vietlott làm việc đắt (khẳng định số) — và chỉ gọi Vietlott **đúng 1 lần / 1 kỳ
mới**, không gọi lặp vô ích.

**Bingo18 không có mirror** (F3) ⇒ phải tự khám phá `id`. Ba cách, xếp theo độ ưu tiên:

| Cách | Chi phí | Rủi ro |
| --- | --- | --- |
| **B-i. Suy bằng số học từ neo:** `drawPeriod` liên tục +1 và biết nhịp quay ⇒ tính `id` kỳ kế tiếp theo đồng hồ, gọi thẳng detail | **0 request phụ** | Kỳ huỷ/bù làm lệch neo ⇒ **bắt buộc** kiểm `drawDate`/giờ trong response khớp kỳ vọng, lệch thì re-anchor |
| **B-ii. GET trang list** `winning-number-bingo18` (GET thuần, không header lạ) để đọc kỳ mới nhất | 1 request/poll | Phải parse HTML trang list (layout đổi được) |
| **B-iii. `.ashx` `PageIndex=0`** lấy 6 kỳ mới nhất | 1 request/poll **+ custom header** | Kéo lại đúng nút thắt H3 vào đường nóng |

⇒ Chọn **B-i làm chính, B-ii làm cơ chế re-anchor** khi phát hiện lệch. Tránh B-iii trên đường nóng.

### 13.5. Sản phẩm Bright Data — chốt lại theo đúng 3 hình dạng request

| Việc | Hình dạng | **Sản phẩm** | Vì sao |
| --- | --- | --- | --- |
| minhchinh `KN.php` | `GET`, 554 B, không rào | **Z1 Proxy zone** (per-GB) | ~$0,02/tháng. Dùng Unlocker ở đây là đốt credit của việc khó cho việc dễ (§12.1) |
| **Vietlott detail per-kỳ (đường tiền)** | `GET` + query param, có Cloudflare | **Z2 Web Unlocker API** — `format: "raw"`, `country: "vn"` | Cần vượt CF. **Không** bật Custom Headers ⇒ giữ pay-per-success. `data_format: "screenshot"` khi `Conflicted` để có bằng chứng người đọc được |
| Backfill lịch sử | `POST .ashx`, lặp `PageIndex`, có header lạ | **Z3 Scraper Studio** (per-page-load) | Ta viết JS trong IDE của họ ⇒ **tự đặt header, không cần đơn compliance**; vòng lặp `PageIndex` chạy trên hạ tầng họ. **Bắt buộc `collect()` chỉ emit RAW `HtmlContent`**, không emit số đã parse (B1, §8.3) |
| Backfill (nếu không muốn dùng Studio) | `GET` detail, `id` tuần tự | **Z2 Unlocker** batch | Đắt hơn 6× nhưng đơn giản hơn và không cần Studio |

**Crawl API vẫn bị loại** — không phải vì hình dạng request nữa (detail URL đã là URL-based), mà vì nó
đòi `dataset_id` của một scraper **đã tồn tại** cho site đích, và nó trả **record đã structured** (vi
phạm B1). Nếu muốn dùng họ Datasets thì đường đúng là **Scraper Studio để tự build collector** rồi
trigger qua Collection API — chứ không phải Crawl API trên dataset không tồn tại.

### 13.6. Hai phát hiện phái sinh từ ảnh

**(a) Vietlott hiển thị số TĂNG DẦN, không phải thứ tự quay.** Ảnh: `07 09 14 15 16 19 20 25 34 43 47
49 56 58 61 63 70 71 76 78` — sắp xếp tăng dần tuyệt đối. Điều này **đổi hướng** rủi ro ở §9.2:

- Rủi ro _source-vs-source_ (minhchinh tăng dần vs Vietlott thứ tự quay) **có thể không tồn tại** — nếu
  Vietlott **không hề** công bố thứ tự quay ở bất kỳ bề mặt nào thì cả hai nguồn đều tăng dần ⇒
  `payoutHash` và `displayHash` trùng nhau.
- Nhưng rủi ro _manual-vs-auto_ **vẫn còn và nay là rủi ro chính**: kỳ nào staff đã nhập tay theo thứ
  tự khác sẽ khiến `isSameKenoResult` = `false` khi auto-import ghi đè ⇒ **resettle oan**. Guard ở §9.2
  quy tắc 3 (so `payoutHash` trước khi publish) **vẫn bắt buộc**, chỉ đổi lý do tồn tại.
- ⚠️ Cần verify: `.ashx` `HtmlContent` trả số theo thứ tự nào — nếu cũng tăng dần thì kết luận
  "Vietlott không công bố thứ tự quay" được xác nhận, và JSDoc của `isSameKenoResult`
  (`packages/game-keno/src/rules/draw-result.ts:11`) đang mô tả một tiền đề **không có thật**.

**(b) Cross-check cùng nguồn, hai endpoint — cứu Bingo18 khỏi "vĩnh viễn 1 nguồn".** `.ashx` và trang
detail là **hai code path khác nhau trên server Vietlott**, render độc lập. So kết quả 2 endpoint cho
**cùng `drawPeriod`** bắt được: parser ta sai, một endpoint bị cache cũ, HTML đổi layout. Đây **không
phải** quorum không gian thật (cùng nguồn gốc dữ liệu) nên **không được** dùng để nâng `Verified` —
nhưng **được** dùng để **veto**. Với Bingo18 (không có mirror), đây là **lớp veto duy nhất khả dụng**
⇒ trạng thái `Unconfirmed` của Bingo18 (R4, §9.3) bớt trống trải hẳn.

Chi phí: chỉ chạy trên **mẫu** (vd 5% số kỳ + 100% kỳ có exposure cao) ⇒ Keno ~$0,3/tháng.

### 13.7. Chi phí thật sau đính chính

Keno 119 kỳ/ngày + Bingo18 ~160 kỳ/ngày = **279 kỳ/ngày ≈ 8.480 kỳ/tháng**. Free tier 5.000
credit/tháng (pool dùng chung, G1):

| Phương án | Request/tháng | Sau free tier | Rủi ro compliance | Pay-per-success |
| --- | --- | --- | --- | --- |
| **Detail per-kỳ (đề xuất)** | 8.480 | **~$5,2** | ❌ không có | ✅ giữ |
| Detail + cross-check 5% mẫu | ~8.900 | ~$5,9 | ❌ không có | ✅ giữ |
| `.ashx` `PageIndex=0` mỗi 20' | ~4.320 | **$0** | ⚠️ **phải xin duyệt header** | ❌ **mất — trả cả request fail** |
| `.ashx` nếu fail 30% | 4.320 | $0 nhưng **trả cho 1.296 request rác** | ⚠️ | ❌ |
| Backfill 7 năm qua Studio (1 lần) | ~120.100 page load | **~$180 một lần** | ❌ (tự set header trong IDE) | — |
| Backfill 7 năm qua detail URL (1 lần) | ~712.000 | ~$1.068 một lần | ❌ | ✅ |

Hai điều đáng chú ý:

1. `.ashx` **rẻ hơn trên giấy** ($0 vs $5,2) nhưng con số $0 đó **giả định fail rate = 0**, mà chính
   điều khoản "charged for 100% of requests" tồn tại vì BD **không đảm bảo** được tỷ lệ thành công khi
   bật custom header. Chênh lệch thật có thể đảo dấu, và **chưa ai đo**.
2. Backfill qua Studio **rẻ hơn 6×** ($180 vs $1.068) — đây là chỗ hiệu suất 6 kỳ/call thực sự có giá
   trị bằng tiền. Nếu chỉ backfill 1 năm thì $26 vs $153.

### 13.8. Việc phải làm — cập nhật thứ tự lần 2

Đính chính này **hạ cấp** phép đo U1 (`.ashx` không custom header): nó không còn chặn đường tiền, chỉ
còn ảnh hưởng tối ưu backfill.

| # | Phép đo | Quyết định phụ thuộc | Ước |
| --- | --- | --- | --- |
| **1** | **`GET` detail URL qua Web Unlocker → `200` + HTML có 20 số?** | **Chặn toàn bộ đường tiền mới.** Nếu pass thì hết phụ thuộc compliance | 20' |
| **2** | Detail URL cho **Bingo18** — path/param tên gì? (`view-detail-bingo18-result?id=`?) | Bingo18 có dùng được đường này không, hay buộc `.ashx` | 10' |
| **3** | `id` **chưa quay** (tương lai) trả gì — `404`, trang rỗng, hay kỳ khác? | Cách detect "kỳ mới đã có" cho B-i (§13.4) mà không cần mirror | 10' |
| **4** | minhchinh `KN.php` qua **proxy residential** còn `200`? | Z1 chạy được hay phải chuyển sang Unlocker | 15' |
| **5** | `.ashx` trả số **theo thứ tự nào** (tăng dần hay thứ tự quay)? | Xác nhận §13.6(a); có thể phải sửa JSDoc `isSameKenoResult` | 15' |
| **6** | BD compliance nhận target `vietlott.vn` + use-case? | Vẫn chặn **toàn bộ** hướng BD (không liên quan header) | 1 ngày chờ |
| 7 | Bingo18 có cược nào ăn theo **thứ tự** xúc xắc? | Canonical form `payoutHash` (§9.2) — đọc code, không cần BD | 20' |
| ~~U1~~ | ~~`.ashx` POST không custom header~~ | **Hạ cấp**: chỉ còn ảnh hưởng chi phí backfill | 30' |

Phép đo #3 tinh vi nhưng quan trọng cho Bingo18: nếu `id` tương lai trả `200` với trang trống thì
không phân biệt được "chưa quay" và "lỗi", buộc phải có B-ii làm re-anchor.

## 14. Bingo18 detail + trả lời "Unlocker có lâu không, sao không dùng Scraper Studio"

### 14.1. Bingo18 detail URL — xác nhận, kèm 3 phát hiện

```
GET https://www.vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/view-detail-bingo18-result?nocatche=1&id=0184131
```

| Dữ liệu | Ảnh 30/08 | Kiểm chứng |
| --- | --- | --- |
| Ngày quay / Kỳ quay | `30/08/2026` · `#0184131` | `id` = `drawPeriod` zero-pad **7** — cùng quy ước Keno |
| Kết quả | `5` `2` `5` | — |
| **Cửa tổng** | `12` | ✅ 5+2+5 = 12 |
| **Lớn/Hòa/Nhỏ** | `Lớn` | ✅ MegaWin: `BINGO18_BIG_MIN = 12` ⇒ 12 → Lớn (`helpers/match-result.ts:314-317`) |
| Bảng giải + số lượng trúng | tab `Chọn 1 số` … `Lớn/Hòa/Nhỏ`, có `(Số lượng: 5)` | Bằng chứng audit |

**(a) Bingo18 cũng có 2 checksum nội tại** (tổng + phân loại Lớn/Hòa/Nhỏ) ⇒ lớp verify 2 (§10.1) chạy
được cho **cả hai game** trên nguồn authoritative. Trước đây tưởng chỉ Keno có (nhờ mirror).

**(b) 🔴 `5 2 5` chứng minh Bingo18 GIỮ THỨ TỰ QUAY.** Nếu sort tăng dần thì phải là `2 5 5`. Đối lập
hẳn với Keno (ảnh trước: `07 09 14 … 78`, tăng dần tuyệt đối). Hệ quả cho §9.2 — hai game phải
canonicalize **khác nhau**, và lý do giờ đã có bằng chứng chứ không còn là suy đoán:

| Game | Vietlott công bố | `payoutHash` | `displayHash` |
| --- | --- | --- | --- |
| Keno | **tăng dần** | sort tăng dần (trùng luôn dạng công bố) | = `payoutHash` ⇒ **rủi ro lệch thứ tự giữa nguồn ≈ 0** |
| Bingo18 | **thứ tự quay** | sort tăng dần (`2,5,5`) — thưởng độc lập thứ tự | `5,2,5` — **khác** `payoutHash`, phải giữ riêng |

⇒ Với Bingo18, `numbers` ghi vào `DrawDoc` **phải là `5,2,5`** (thứ tự quay), còn so sánh giữa các
nguồn/endpoint **phải dùng `2,5,5`**. Trộn hai cái là sai — và Bingo18 là game **dễ mắc** vì cả 3 giá
trị đều nhỏ, nhìn qua tưởng giống nhau.

**(c) Bonus: mỗi trang detail là một phép kiểm config của ta.** Vietlott tự công bố phân loại
Lớn/Hòa/Nhỏ; ta so với `BINGO18_BIG_MIN`/`BINGO18_SMALL_MAX`. Nếu Vietlott đổi biên (vd Lớn từ 11) mà
ta không biết, phép so này **phát hiện ngay ở kỳ đầu tiên** — trước khi settle sai hàng loạt. Miễn phí,
nên bật thành check thường trực. Keno tương tự với CHẲN/LẺ/LỚN/NHỎ.

`nocatche=1` (site viết sai chính tả `nocache`) là **cache-buster** — nên **luôn gửi kèm** và đặt giá
trị **thay đổi** (vd timestamp) để không nhận bản cache cũ. Đây là rủi ro thật với auto-import: nhận
trang cache của kỳ trước sẽ tạo observation sai kỳ.

### 14.2. "Dùng Web Unlocker thì lâu?" — Không, và Scraper Studio **chậm hơn**, không nhanh hơn

| | **Web Unlocker `/request`** | **Scraper Studio** |
| --- | --- | --- |
| Mô hình | **Đồng bộ** — 1 HTTP call, có body ngay | **Bất đồng bộ**: `POST /dca/trigger` → `snapshot_id` → poll `/dca/dataset` (hoặc webhook) |
| Có queue? | Không | **Có** — job vào hàng đợi |
| Chạy browser? | Không, nếu `render` tắt (trang này **server-rendered** ASP.NET ⇒ không cần JS) | **Có** — `navigate()` là page load bằng browser thật |
| Độ trễ thực tế | ~1–5s (không render) | Cộng thêm browser startup + queue + poll interval |

Premise cần đảo: **Studio không phải đường nhanh, nó là đường chậm hơn.** Nó chạy browser để làm việc
mà trang này không đòi browser.

Và quan trọng hơn: **độ trễ không phải ràng buộc của bài toán này.** Keno 8 phút/kỳ (480s), Bingo18
~6 phút/kỳ (360s). Chênh lệch 3s vs 8s là **0,6% – 2%** của một nhịp kỳ. Tối ưu độ trễ ở đây là tối ưu
sai biến — biến bị chặn là **độ đúng** và **khả năng truy vết**, không phải tốc độ.

### 14.3. "Phải chờ cả đám HTML rồi tự parse?" — Đúng, và đây là giá thật của nó

Không né: đúng là ta nhận cả trang HTML (~100–300 KB) để lấy 20 số. Ba chi phí, kèm cách xử lý:

| Chi phí | Thực tế | Xử lý |
| --- | --- | --- |
| **CPU parse** | 200 KB HTML, regex/cheerio nhắm đúng vùng bảng: **~1–5ms** | Không phải vấn đề. Lambda 128MB xử lý thoải mái |
| **Băng thông** | Unlocker tính **per request**, không per GB ⇒ payload lớn **không tốn thêm tiền** | Chỉ tốn ở Z1 proxy (per-GB), mà Z1 chỉ dùng cho `KN.php` 554 B |
| **Storage raw** | 200 KB × 279 kỳ/ngày = **56 MB/ngày ≈ 1,7 GB/tháng** — đây là chi phí thật, đúng như §9.1 đã cảnh báo | **Gzip trước khi lưu**: HTML nén ~8–10× ⇒ ~25 KB/kỳ ⇒ **~210 MB/tháng**. Cộng TTL có điều kiện (§9.7) là ổn |

Còn khối lượng code parser — đo cụ thể thay vì cảm tính: trích 20 số + 4 checksum từ trang detail Keno
≈ **60–80 dòng** kể cả test fixture; Bingo18 tương tự. Tổng **~150 dòng cho cả 2 game**, có `biome
check`, có git history, test bằng file HTML thật lưu sẵn.

Đối chiếu với chi phí vận hành một collector Studio: versioning collector, `trigger`→`snapshot_id`→poll,
xử lý snapshot lỗi/hết hạn, và **đồng bộ output schema bằng tay** giữa Studio và type trong repo — không
có compiler nào bảo vệ, đúng cùng họ vấn đề với `player-sdk` ↔ backend (đã có rule riêng cho nó vì đã
gây bug thật). **150 dòng parser có history và test rẻ hơn 1 collector không có cả hai.**

### 14.4. Xét lại công bằng — tôi nhượng bộ một điểm ở §8.3

Đã lập luận 2 lần chống Studio-extract; lần này soát lại thay vì lặp lại. **Một luận điểm của tôi ở
§8.3 đã bị làm yếu bởi chính phát hiện mới:**

> §8.3 điểm 2 nói "Self-Healing Tool sửa logic đường tiền từ xa" là rủi ro lớn nhất.

Đính chính: từ khi có **4 checksum nội tại từ chính trang detail** (§13.2 Keno, §14.1 Bingo18), một
parse sai — dù do ta hay do self-heal — sẽ **vỡ checksum và bị chặn ở lớp 2**, không thể lọt xuống
settle. Nghĩa là "self-heal chọn nhầm bảng" **không còn là kênh mất tiền âm thầm** như tôi đã viết. Rủi
ro tồn dư chỉ là trường hợp self-heal đọc lệch **đồng bộ cả số lẫn checksum** sang một khối HTML khác —
xác suất thấp.

Hai luận điểm còn lại thì **không** bị làm yếu, và chúng là lý do thật:

1. **Governance / truy vết.** Logic đường tiền nằm ngoài repo ⇒ không PR review, không CI, không `git
   blame`, không rollback bằng revert. Khi settle sai và cần trả lời "lúc 14:32 kỳ đó parse bằng logic
   nào", câu trả lời phải là một commit hash, không phải "phiên bản collector trên dashboard ai đó sửa".
2. **Độ phức tạp vận hành cho luồng real-time.** Async + queue + snapshot lifecycle + schema mirror tay,
   để thay cho 1 lời gọi HTTP đồng bộ (§14.2, §14.3).

### 14.5. Tổng hợp — dùng Studio làm **parser thứ hai**, không phải parser duy nhất

Bất đồng này có đường biến thành **tính năng**. Studio có thể `collect()` **cả raw HTML lẫn field nó tự
parse** trong cùng một page load:

```js
collect({ id, rawHtml: html, studioNumbers, studioSum, studioBigSmall });
```

Từ **1 request, 1 lần trả tiền**, ta có **hai observation của cùng một mớ byte**:

| observation | `parserVersion` | Nguồn logic |
| --- | --- | --- |
| A | `studio-v1` | Bright Data parse |
| B | `repo-v1` | Ta parse lại `rawHtml` |

Đây là **lớp verify mới, độc lập với mọi lớp hiện có**: cả 6 lớp ở §10.1 đều so *dữ liệu giữa các
nguồn/kỳ*; lớp này so **hai cách đọc của cùng một byte** ⇒ bắt được **bug parser của chính ta** — thứ mà
quorum nhiều nguồn không bắt được (parser ta chỉ có một, sai là sai đều). A ≠ B ⇒ chặn, alert, người
vào xem.

Điều kiện để chọn hướng này (phải **đo**, chưa được giả định):

- Studio real-time mode có độ trễ p95 chấp nhận được (đề xuất ngưỡng: < 15s) và tỷ lệ lỗi thấp.
- `rawHtml` trả về **đúng nguyên văn**, không bị Studio normalize/rewrite — nếu bị sửa thì B không còn
  parse "cùng một byte" nữa và cả ý tưởng sụp.
- `contentHash(rawHtml)` từ Studio khớp với hash khi fetch cùng URL qua Unlocker (kiểm 1 lần khi setup).

Nếu bất kỳ điều kiện nào không đạt ⇒ về **Unlocker + parser repo**, và lấy lớp "hai parser" bằng cách
rẻ hơn: parse `rawHtml` bằng **2 hàm độc lập trong repo** (một theo cấu trúc bảng, một theo regex thuần)
— được ~80% giá trị, không phụ thuộc vendor.

### 14.6. Chốt phân công (thay §13.5) + việc phải đo

| Việc | Sản phẩm | Vì sao |
| --- | --- | --- |
| Kỳ mới Keno/Bingo18 (real-time, đường tiền) | **Web Unlocker** trên URL detail — hoặc **Studio nếu đo đạt §14.5** | Đồng bộ, không queue, không cần browser |
| Parse ra số + 4 checksum | **Parser trong repo** (~150 dòng, có test) — bắt buộc, kể cả khi dùng Studio | Governance §14.4 |
| Backfill lịch sử (`.ashx`, loop PageIndex, custom header) | **Scraper Studio** | Batch, không nằm đường tiền, tránh form compliance của Unlocker (§13.5) |
| Nguồn confirm Keno (`KN.php`) | **Residential Proxy** (Z1) | 554 B, không Cloudflare, per-GB rẻ |

Ba phép đo mới cần thêm vào §13.8:

8. `nocatche` có thật sự bust cache? Gọi 2 lần cùng `id` với `nocatche=1` rồi `nocatche=<ts>`, so
   `contentHash`. Nếu không bust được ⇒ nguy cơ nhận trang kỳ cũ.
9. Studio `rawHtml` có nguyên văn không? So `contentHash` Studio vs Unlocker cùng `id`.
10. Trang detail có cần `render` không? Fetch với `render` tắt, kiểm còn đủ 20 số + 4 checksum. Nếu đủ ⇒
    đường nhanh nhất và rẻ nhất, xác nhận §14.2.

## 11. Nguồn tham chiếu & những gì CHƯA kiểm chứng

**Probe thật 30/08/2026, egress `104.164.168.184` (Singapore, AS137409 GSL Networks — IP datacenter):**
đầy đủ bảng ở §1.1. Mọi kết luận về minhchinh dựa trên response body đã tải và đọc trực tiếp
(không phải web search).

**Docs Bright Data đã đọc (30/08/2026):**
`docs.brightdata.com/scraping-automation/web-unlocker/send-your-first-request` ·
`.../web-unlocker/features` · `docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website`
(OpenAPI spec: `method`/`body`/`country`/`data_format`/`render`/`debug`) ·
`docs.brightdata.com/api-reference/proxy/geolocation-targeting` (`-country-vn`) ·
`docs.brightdata.com/proxy-networks/config-options` · trang pricing Web Unlocker / Residential /
Browser API.

**⚠️ CHƯA kiểm chứng — ghi rõ để người sau không tưởng là fact:**

- **Chưa mở account Bright Data** → mọi con số giá, tỷ lệ thành công, hành vi API là **đọc từ docs
  và pricing công bố**, chưa đo. Đặc biệt: tỷ lệ vượt CF trên **chính `vietlott.vn`** hoàn toàn chưa biết.
- **Chưa POST thử endpoint `.ashx`** (cố ý — chờ quyết ToS §7.2 #1). Nên chưa biết header
  `X-AjaxPro-Method` có bắt buộc hay không.
- **Chưa test IP Việt Nam** → câu hỏi mở quan trọng nhất từ 24/08 **vẫn chưa trả lời**. Đây là lý do
  §7.1 #1 đứng đầu.
- **Chưa đọc `robots.txt`/ToS của minhchinh.com.**
- **Chưa quan sát `KN.php` qua nhiều giờ** → chưa biết độ ổn định, rate-limit, hay lag tối đa. Chỉ có
  2 mẫu cách nhau ~6 phút.
- Chưa xác nhận BD compliance nhận target/use-case này.
- Chưa biết `key=` và `returntime=` trong payload `KN.php` dùng làm gì.

---

**Kết luận một dòng:** Bright Data giải được bài toán kỹ thuật với chi phí không đáng kể
(~$2–12/tháng) và **xoá ~1 tuần công + toàn bộ hạ tầng máy chuyên dụng của P-D** — nhưng nó
**không** cải thiện vị thế ToS, mà còn làm xấu hơn P-D (§4.1). Phát hiện có giá trị hơn là
**feed công khai `minhchinh.com/livekqxs/xstt/KN.php`**: sống, không Cloudflare, cấu trúc sẵn, có
**giờ quay** (thứ Vietlott không cho) và **5 checksum** (Vietlott chỉ cho 2) — đủ để dựng **lớp
verify thứ 4 (cross-source veto)** mà tài liệu cũ tưởng bất khả thi, với chi phí $0 và vị thế ToS
sạch hơn cả P-D. Bingo18 vẫn không có lối nào ngoài Vietlott (F3). Việc tiếp theo rẻ nhất và
chặn nhiều nhất: **1 giờ cho 6 phép đo ở §7.1** — trong đó phép đo #1 (IP Việt Nam) đã treo từ
24/08 và quyết định nhánh chi phí chênh 6×.
