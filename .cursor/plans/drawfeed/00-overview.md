# DrawFeed — Overview

Sản phẩm **độc lập** trong monorepo: thu thập kết quả xổ số từ **nhiều website không liên quan gì
nhau**, mỗi site một worker + một parser riêng, lưu vào **DB riêng**, tổng hợp thành **một kết quả
đồng thuận duy nhất**, cho người vận hành verify (flag cao nhất), rồi publish ra ngoài.

> Nghiên cứu nền: [`../../analysis/draw-result-brightdata-sources.analysis.md`](../../analysis/draw-result-brightdata-sources.analysis.md)
> — đặc biệt §13 (endpoint detail theo kỳ), §14 (Unlocker vs Studio), §9 (3 tầng dữ liệu), §10 (verify).
>
> ⚠️ Plan này **thay thế** [`../draw-result-auto-import/`](../draw-result-auto-import/) (bỏ hướng
> Chrome extension MV3, bỏ proxy, đổi tên sản phẩm). Xem `00-overview.md` của thư mục đó.

## Plan trong thư mục

| File | Nội dung |
| --- | --- |
| `00-overview.md` | Quyết định kiến trúc, đặt tên, chọn thư viện, chi phí, thứ tự làm |
| `01-data-model.plan.md` | 6 collection + canonicalization hash + index + wiring DB riêng |
| `02-fetch-parse.plan.md` | `FetchProvider` (đổi vendor không sửa domain) + `SourceAdapter` + workers |
| `03-consensus.plan.md` | Ưu tiên nguồn, xử lý sai lệch, human verify, publish |
| `04-backoffice-api.plan.md` | Trang vận hành trong backoffice + API nội bộ + API public (làm sau) |

---

## 1. Đặt tên — `drawfeed`

| Loại | Tên |
| --- | --- |
| Domain package | `packages/drawfeed` → `@megawin/drawfeed` |
| Application package | `packages/drawfeed-application` → `@megawin/drawfeed-application` |
| Worker app | `apps/drawfeed-worker` → `@megawin/drawfeed-worker` |
| Public API app (làm sau) | `apps/drawfeed-api` → `@megawin/drawfeed-api` |
| Database | `megawin-drawfeed` |
| Env URI | `DRAWFEED_MONGODB_URI` |

Theo triết lý `operator-monorepo-structure.mdc`: **product prefix đứng TRƯỚC, runtime là suffix**
(`drawfeed-worker`, `drawfeed-api`) — vì với sản phẩm tách biệt, "thuộc product nào" quan trọng hơn
"chạy bằng gì". Ngược convention `worker-*`/`api-*` của core một cách **có chủ đích**.

**Kiểm tra va chạm từ vựng** (rule §2 yêu cầu làm việc này trước khi đặt tên):

| Từ | Nghĩa trong core | Có va chạm? |
| --- | --- | --- |
| `result` | `DrawResultSource`, `draw_results` — kết quả **thuộc một draw của MegaWin** | ⚠️ Có. Vì vậy **KHÔNG** đặt `packages/result-*` (tên plan cũ) — dễ tưởng là kết quả nội bộ MegaWin |
| `feed` | `entry_feed`, `feed_sync_cursor` — feed **entry cược** đẩy cho tenant | Chia sẻ danh từ chung, nhưng có định tố phân biệt (`entry` vs `draw`) và **ngữ nghĩa giống nhau** (một dòng dữ liệu). Không phải va chạm ngữ nghĩa kiểu `agent`/`wallet` ⇒ chấp nhận |
| `draw` | `DrawDoc` mỗi game | `drawfeed` là compound, không chiếm tên trần `draw` |

**Tên để dành, KHÔNG được chiếm:** `results`, `feed`, `draw` (trần). Nếu sau này bán feed cho khách
B2B thành sản phẩm riêng thì tạo package mới, **không** refactor `drawfeed`.

---

## 2. Bảy quyết định kiến trúc

### D1 — CHỈ dùng Web Unlocker API, BỎ proxy

Trước đây chốt 2 zone (Z1 proxy cho `minhchinh`, Z2 Unlocker cho `vietlott`). **Bỏ Z1.** Lý do:

| | Proxy (đã bỏ) | Web Unlocker (chốt) |
| --- | --- | --- |
| Site bật Cloudflare/CAPTCHA sau này | **Vỡ** — phải viết lại transport, đổi zone, redeploy | Không đổi gì, Unlocker tự xử lý |
| Số code path transport | 2 (mỗi cái có retry/session/lỗi riêng) | **1** |
| Billing | per-GB (payload lớn → khó dự toán) | **per successful request** (dự toán được, HTML to không tốn thêm) |
| CAPTCHA / JS challenge | Tự lo | Có sẵn |

Đổi lấy: request đơn giản đi qua Unlocker **đắt hơn** proxy. Chấp nhận, vì §3 cho thấy tổng request
nhỏ nhờ **dự đoán `id`** thay vì poll. Một code path cho N site là thứ đáng trả tiền — mỗi site mới
chỉ phải viết **parser**, không phải viết transport.

**Bất biến:** mọi request ra internet đi qua `FetchProvider`. **KHÔNG** `fetch()` trực tiếp tới site
nguồn ở bất kỳ đâu trong `drawfeed`. Điều này vừa thoả yêu cầu ẩn IP server, vừa là điều kiện để đổi
vendor.

### D2 — Vendor chỉ bán bytes, KHÔNG bao giờ parse

`FetchProvider` trả **raw bytes + contentType**, không hơn. HTML hay JSON tuỳ site/vendor — tầng
parser quyết định cách đọc. Bright Data hôm nay; mai thêm vendor khác chỉ là **một class mới
implement interface**, không sửa domain, không sửa parser.

Chi tiết ở `02-fetch-parse.plan.md` §1. Lý do **không** để vendor extract (Scraper Studio) đã phân
tích ở analysis §8.3 + §14.4 — tóm lại: logic đường tiền phải có commit hash, không phải "phiên bản
trên dashboard".

### D3 — DB riêng, cluster tách được, từ ngày đầu

`Constants.Default.DrawFeedDbName = "megawin-drawfeed"` + base repo riêng dùng
**`mongoEnvKey: "DRAWFEED_MONGODB_URI"`**. `MongoRepository` đã nhận `mongoEnvKey?` sẵn
(`packages/data/src/mongo/repository.ts:66-80`) ⇒ tách **cluster vật lý** sau này không cần sửa code,
chỉ đổi env. Tiền lệ có sẵn: comment ở `ReportReadRepo` (`base-repos.ts:102`) ghi đúng ý này.

Dev có thể trỏ `DRAWFEED_MONGODB_URI` về cùng cluster; prod tách. Chi tiết `01-data-model.plan.md` §1.

### D4 — Mỗi site = một `SourceAdapter` + một Lambda function, KHÔNG biết nhau

Yêu cầu "các website lấy kết quả khác nhau không liên quan gì đến nhau" được enforce bằng cấu trúc:
adapter của site A **không import** gì từ site B, không đọc observation của site B. Chúng chỉ gặp
nhau ở **tầng consensus** (`03-consensus.plan.md`).

**Một app `apps/drawfeed-worker`, N function** (không N app): mỗi source × game là một function riêng
trong `serverless.yml` ⇒ tách concurrency, tách schedule, tách log group, tách lock, một site sập
không kéo site khác. Nhưng vẫn một lần deploy, một bộ dependency. N app cho N site là chi phí vận hành
không đổi lại được gì.

### D5 — Fetch và consensus là 2 function TÁCH BIỆT

Fetch lỗi (site sập, vendor lỗi) **không được** chặn việc chốt consensus cho dữ liệu đã thu được, và
ngược lại. Hai nhịp khác nhau, hai lock khác nhau.

### D6 — `HumanVerified` là flag cao nhất, không gì ghi đè được

Máy **không bao giờ** ghi đè kết quả người đã verify. Bất biến này phát biểu tường minh, có test, và
là điều kiện chặn ở mọi write path (`03-consensus.plan.md` §3).

### D7 — MegaWin core PULL, DrawFeed không biết gì về MegaWin

`drawfeed` **không** import `@megawin/game-*`, không gọi `PublishResultUseCase`. Core tự PULL kết quả
đã chốt. Giữ được: (a) `drawfeed` bán được cho khách ngoài mà không kéo theo core, (b) core không phụ
thuộc hệ thống scraping. Enforce bằng lint boundary (`00-overview.md` §6).

---

## 3. Nhịp chạy & chi phí — dự đoán `id` thay vì poll

Phát hiện ở analysis §13.4/§14.1: `id` của trang detail **tăng tuần tự 1 mỗi kỳ**
(Keno `0293945`, Bingo18 `0184131`, zero-pad 7). Nên **không cần poll để phát hiện kỳ mới**:

```
nextId = lastConfirmedId + 1
đến giờ quay dự kiến → fetch nextId
  ├─ trang khớp kỳ/ngày kỳ vọng → nhận
  ├─ trang rỗng / kỳ chưa có     → backoff, thử lại
  └─ kỳ/ngày LỆCH kỳ vọng        → re-anchor từ trang list, báo alert
```

| Nhịp | Số request/ngày |
| --- | --- |
| Vietlott detail — Keno (~120 kỳ) + Bingo18 (~160 kỳ) | ~280 |
| Nguồn confirm Keno (1 lần/kỳ, không poll) | ~120 |
| Re-anchor + retry (biên 10%) | ~40 |
| **Tổng** | **~440/ngày ≈ 13.200/tháng** |

Chi phí = `13.200 × <giá Unlocker/request>`. **Giá phải xác nhận trên dashboard Bright Data** — không
chốt số ở đây (analysis §13.7 từng ước ~$5,2/tháng cho 8.400 request; free tier 5.000 credit/tháng
không đủ). Đây là phép đo #11 trong danh sách chặn.

So sánh: nếu poll 2 phút/site thì ~720 request/ngày **chỉ cho việc phát hiện kỳ mới** — dự đoán `id`
tiết kiệm hơn ~60% và còn **đúng hơn** (biết chính xác kỳ nào đang chờ, phát hiện được kỳ bị nhảy số).

---

## 4. Thư viện parser — chốt `cheerio@^1.2.0`

Chưa có thư viện HTML nào trong repo (đã grep toàn bộ `package.json` + lock). Chốt **cheerio 1.2.0**,
đặt ở `packages/drawfeed-application` (tầng infra), **KHÔNG** ở `packages/drawfeed` (domain phải pure).

**Vì sao cheerio:**

1. **Bề mặt bảo trì chính là parser per-site**, không phải tốc độ. N site × HTML đổi theo thời gian ⇒
   thứ quyết định là **dễ đọc, dễ review PR, dễ sửa nhanh**. API selector kiểu jQuery là thứ nhiều
   người biết nhất ⇒ reviewer không phải học cú pháp mới để duyệt một parser.
2. **Chịu được HTML bẩn.** Trang ASP.NET WebForms (`vietlott.vn`) có markup không chuẩn; cheerio dựa
   trên `htmlparser2`/`parse5` — dung thứ, không throw giữa đường.
3. **Không browser, không JS engine** ⇒ cold start Lambda nhỏ, bundle esbuild gọn. Unlocker đã lo
   render nếu cần (analysis §14.2) nên phía ta **không cần** browser.
4. Traversal đủ mạnh cho dữ liệu **theo vị trí trong bảng** — đúng dạng dữ liệu của trang detail.

**Đã cân nhắc và loại:**

| Thư viện | Lý do loại |
| --- | --- |
| `node-html-parser@9.0.2` | Nhanh hơn, nhẹ hơn ~10× — nhưng selector yếu hơn và ít được thử thách trên markup bẩn. Chênh lệch tốc độ **vô nghĩa** ở 440 trang/ngày ⇒ đổi ergonomics lấy tốc độ không cần là lỗ |
| `jsdom` | Full DOM + thực thi JS: nặng, cold start lớn, ta không cần JS |
| `playwright` / `puppeteer` | Cần browser thật — trùng việc Unlocker đã làm, đắt gấp nhiều lần |
| `linkedom` | Hợp lý về kỹ thuật nhưng ecosystem/tài liệu mỏng hơn ⇒ chi phí review cao hơn |
| Regex thuần | Dùng làm **parser thứ hai** để đối chiếu (analysis §14.5), **không** làm parser chính |

**Kỷ luật kèm theo (bắt buộc, không tuỳ chọn):**

- Parser là **hàm pure**: `(raw: Buffer) => ParsedObservation`. Không I/O, không đọc DB, không `Date.now()`
  ⇒ test được bằng fixture, không cần mock.
- Mỗi site có `test/fixtures/<sourceId>/<case>.html` **commit vào repo** (HTML thật đã lưu). Test assert
  đủ số + đủ checksum.
- HTML site đổi ⇒ **thêm fixture mới, bump `parserVersion`**, không sửa lặng lẽ fixture cũ. `parserVersion`
  nằm trong khoá unique của `observations` ⇒ parse lại bằng version mới tạo **observation mới**, giữ được
  cả hai để so.

---

## 5. Kiến trúc tổng thể

```
                    ┌──────────────── Bright Data Web Unlocker ────────────────┐
                    │        (FetchProvider — đổi vendor không sửa domain)      │
                    └──┬─────────────┬─────────────┬──────────────┬────────────┘
   site A (vietlott) ──┘   site B ───┘   site C ───┘   site N ────┘
        │                    │              │              │
        ▼                    ▼              ▼              ▼          ← mỗi site 1 Lambda,
   adapter A            adapter B      adapter C      adapter N          1 parser, KHÔNG biết nhau
        └────────────────────┴──────────────┴──────────────┘
                                 │
              ①  submissions   ← raw bytes (gzip) + provider meta + contentHash
                                 │  parse (pure fn)
              ②  observations  ← 1 source × 1 game × 1 kỳ × 1 parserVersion
                                 │
                          ┌──────▼───────┐
                          │ consensus-tick│  ← Lambda RIÊNG (D5)
                          └──────┬───────┘
              ③  consensus     ← 1 game × 1 kỳ, state + numbers + decidedBy
                                 │
                    ┌────────────┴─────────────┐
                    ▼                          ▼
        backoffice (vận hành,           MegaWin core PULL  ·  API public (sau)
        human verify = flag cao nhất)
```

Ba tầng ①②③ giữ nguyên tinh thần analysis §9.1, chi tiết ở `01-data-model.plan.md`.

---

## 6. Lint boundary — enforce, không chỉ bằng tên

Thêm rule `dependency-cruiser` (chạy trong task `lint`):

1. **`no-core-to-drawfeed`** — core (`packages/game-*`, `apps/api-*`, `apps/worker-<game>`) **KHÔNG**
   được import `@megawin/drawfeed*`. Vi phạm = đã phá D7.
2. **`drawfeed-import-allowlist`** — `drawfeed` chỉ được import: `@megawin/shared`, `app-core`, `data`,
   `cache`, `audit`, `http-client`, `worker-core`, `next`, `ui`. **KHÔNG** import `game-*`,
   `identity*`, `tenant-*`.

Điểm quan trọng: `drawfeed` **không được** import `@megawin/game-keno` để dùng `isSameKenoResult` hay
`BINGO18_BIG_MIN`. Nó phải **tự khai báo** rule kiểm checksum của mình. Nghe như trùng lặp, nhưng đó
chính là điều làm phép kiểm có giá trị: nếu `drawfeed` dùng chung hằng số với core thì khi core sai,
phép kiểm cũng sai theo và không phát hiện được gì (analysis §14.1(c)).

---

## 7. Thứ tự triển khai

| Giai đoạn | Nội dung | Rủi ro tiền |
| --- | --- | --- |
| **G0** | 11 phép đo chặn (analysis §13.8 + §14.6) — đặc biệt #11 giá Unlocker, #10 có cần `render`, #8 `nocatche` bust cache thật | 0 |
| **G1** | `packages/drawfeed` (domain) + wiring DB riêng + index. Chưa có I/O | 0 |
| **G2** | `FetchProvider` + `BrightDataUnlockerProvider` + adapter **1 site duy nhất** (vietlott detail Keno) + `submissions`/`observations`. Chạy shadow | 0 |
| **G3** | `consensus-tick` + trang vận hành + **human verify**. Vẫn shadow — không ai đọc kết quả | 0 |
| **G4** | Thêm site thứ 2 (confirm Keno) ⇒ bật so sánh chéo thật. Thêm Bingo18 | 0 |
| **G5** | MegaWin core PULL, **manual approve mỗi kỳ** | thấp |
| **G6** | Auto-publish có ngưỡng exposure + kill-switch | có — cần điều kiện tin cậy đo được |
| **G7** | API public cho khách ngoài | — |

G0 **chặn toàn bộ**. G1→G4 rủi ro tiền = 0 vì không kết quả nào chảy vào MegaWin.

---

## 8. Không làm (phạm vi này)

- ❌ Chrome extension MV3 (plan cũ `p2-extension.plan.md`) — Unlocker thay thế hoàn toàn.
- ❌ Proxy zone (D1).
- ❌ Để vendor extract structured data (analysis §8.3, §14.4).
- ❌ Auto-publish ngay (G6, sau khi có số liệu tin cậy).
- ❌ Sửa `isSameKenoResult` / logic settle của core — việc của core, không phải `drawfeed`.
- ❌ Thêm game ngoài Keno/Bingo18 — kiến trúc mở sẵn nhưng chưa làm.
