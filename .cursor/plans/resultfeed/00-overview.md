# ResultFeed — Overview

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

## 1. Đặt tên — `resultfeed`

> ⚠️ **Cập nhật 02/09/2026:** đảo lại quyết định app-naming ban đầu (bảng dưới) theo yêu cầu user —
> ưu tiên **đồng bộ với convention `worker-<domain>`/`api-<domain>` đã dùng cho toàn bộ app core**
> (`worker-keno`, `worker-mega645`, `api-player`, `api-tenant`, …) thay vì "product prefix đứng
> trước" như lý luận cũ. Domain/application package (`packages/resultfeed*`) **không đổi** — chỉ đổi
> tên 2 **app** (`apps/*`). `apps/resultfeed-worker` đã tồn tại thật trong code (không chỉ trên
> giấy) — đổi tên là việc rename thư mục + `package.json` name + README + comment tham chiếu, KHÔNG
> đổi service name trong `serverless.yml` (đã sẵn `mw-worker-resultfeed`, tình cờ khớp tên mới).

| Loại | Tên |
| --- | --- |
| Domain package | `packages/resultfeed` → `@megawin/resultfeed` |
| Application package | `packages/resultfeed-application` → `@megawin/resultfeed-application` |
| Worker app | `apps/worker-resultfeed` → `@megawin/worker-resultfeed` |
| Public API app | `apps/api-resultfeed` → `@megawin/api-resultfeed` |
| Database | `megawin-resultfeed` (cùng cluster/URI `MONGODB_URI` với core — `01-data-model.plan.md` §1) |

Áp đúng convention `operator-monorepo-structure.mdc` §3 dùng cho core: **runtime prefix đứng trước**
(`worker-<domain>`, `api-<domain>`), đồng bộ với `worker-keno`, `worker-mega645`, `api-player`,
`api-tenant`. Domain/application package (`resultfeed`, `resultfeed-application`) vẫn giữ tên
**compound trần** như cũ (không đổi) — chỉ 2 app runtime đổi để nhất quán toàn repo.

**Kiểm tra va chạm từ vựng** (rule §2 yêu cầu làm việc này trước khi đặt tên):

| Từ | Nghĩa trong core | Có va chạm? |
| --- | --- | --- |
| `result` | `DrawResultSource`, `draw_results` — kết quả **thuộc một draw của MegaWin** | ⚠️ Có, với tên TRẦN. Vì vậy **KHÔNG** đặt `packages/result-*`/`results` trần. `resultfeed` là **compound** (giống cách `drawfeed` từng compound hoá `draw`) ⇒ không chiếm nghĩa trần, đọc tên biết ngay đây là "nguồn thu thập kết quả từ ngoài", không phải `DrawResultSource` nội bộ |
| `feed` | `entry_feed`, `feed_sync_cursor` — feed **entry cược** đẩy cho tenant | Chia sẻ danh từ chung, nhưng có định tố phân biệt (`entry` vs `result`) và **ngữ nghĩa giống nhau** (một dòng dữ liệu). Không phải va chạm ngữ nghĩa kiểu `agent`/`wallet` ⇒ chấp nhận |
| `draw` | `DrawDoc` mỗi game | `resultfeed` không dùng `draw` — tên đã đổi khỏi `drawfeed` chính vì DB/collection nên phản ánh "kết quả" (mục tiêu cuối), không phải "kỳ quay" (khái niệm đã thuộc core) |

**Tên để dành, KHÔNG được chiếm:** `result`, `results`, `feed`, `draw` (trần). Nếu sau này bán feed cho khách
B2B thành sản phẩm riêng thì tạo package mới, **không** refactor `resultfeed`.

---

## 2. Bảy quyết định kiến trúc

### D1 — Vendor lấy bytes là chi tiết hạ tầng THAY ĐƯỢC, không phải quyết định kiến trúc

`FetchProvider` (D2) tồn tại đúng để việc này **không quan trọng**: nguồn lấy HTML về là gì — Oxylabs,
context.dev, một proxy khác, hay sau này một **Chrome extension đẩy HTML lên** — đều là **một class
implement `FetchProvider`**, cắm/rút không đụng adapter, domain, hay consensus. Đây không phải danh
sách "đã duyệt vĩnh viễn"; đổi provider là việc vận hành bình thường, làm bao nhiêu lần cũng được.

**Ghi lại 1 dữ kiện kỹ thuật thật (30/08/2026) để không ai tốn thời gian thử lại:** Bright Data trả
thẳng lỗi khi gọi `vietlott.vn` qua Web Unlocker:

```
Access denied: www.vietlott.vn is classified as Gambling and blocked by Bright Data
```

Đây là **hành vi thực tế đã đo được** của riêng sản phẩm/tài khoản đó tại thời điểm đó — không phải
kết luận cấm dùng scraping vendor nói chung. Chuyển sang provider khác là đủ, đúng như đổi từ Bright
Data sang Oxylabs đã làm được ngay mà không sửa gì ở tầng adapter/parser/consensus.

**Provider đang dùng: Oxylabs Web Unblocker (primary), context.dev Scrape HTML (secondary/failover).**
Đây là lựa chọn **hiện tại**, chọn vì đơn giản nhất để chạy được ngay (so sánh kỹ thuật ở
`02-fetch-parse.plan.md` §5). Không có gì ngăn thêm provider thứ ba, thứ tư, hoặc thay hẳn — mỗi lần
đổi chỉ tốn 1 class mới + 1 dòng registry, không tốn refactor.

**Việc của provider chỉ là MỘT thứ: trả về bytes HTML/JSON nguyên văn của trang.** Không parse, không
suy diễn số (D2). Vì phạm vi hẹp như vậy, provider hoàn toàn có thể là:

| Loại provider | Khi nào hợp | Ghi chú |
| --- | --- | --- |
| Unblocker API (Oxylabs, context.dev, …) | Mặc định — chạy server, không cần máy vật lý | Đang dùng |
| Proxy thuần | Site không có Cloudflare/CAPTCHA | Rẻ hơn nhưng vỡ khi site bật chống bot (D1c) |
| Chrome extension (người/máy mở trang thật, đẩy HTML về) | Site chặn mọi datacenter IP, hoặc muốn giảm phụ thuộc 1 vendor | Chỉ cần 1 endpoint nhận `{ url, body }` rồi ghi vào đúng `submissions` — vẫn qua `FetchProvider`-shaped flow |
| Tự vận hành exit node (VPS/IP dân dụng) | Cần kiểm soát toàn phần | Đắt vận hành hơn, chỉ chọn khi các cách trên đều không ổn |

Không cần chốt trước "chỉ dùng 1 loại mãi mãi" — thứ cần chốt là **interface** (`FetchProvider`,
`FetchRequest`/`FetchResult`), việc đó đã xong ở D2 và `02-fetch-parse.plan.md` §1.

### D1b — Manh mối cần kiểm chứng: `api.vietlott.vn` (CHƯA xác nhận tồn tại)

⚠️ **Đây là giả thuyết, KHÔNG phải phát hiện đã kiểm chứng.** Ghi rõ vì bản trước của mục này kết luận
sai và suy luận sai đó đã bị bắt lại ngày 31/08.

**Nguồn URL:** README của repo GitHub [`HVgiang86/vietlott_data_crawling_android`](https://github.com/HVgiang86/vietlott_data_crawling_android)
— 0 star, 1 contributor, tạo 09/2022, **chưa cập nhật 4 năm**. README chỉ ghi **duy nhất**
`GetMax3DResult`. Tên `GetKenoResult` / `GetBingo18Result` là **suy đoán theo pattern, KHÔNG có trong
bất kỳ nguồn nào**.

**Điều ta THỰC SỰ biết:** hostname `api.vietlott.vn` resolve về IP Cloudflare (`104.17.12.17`).
Hết. Không biết `/services/` có tồn tại, không biết `Command` nào hợp lệ.

**Suy luận SAI đã mắc:** "request trả 403 chứ không 404 ⇒ endpoint tồn tại thật". Phép thử phản chứng:
`GET https://api.vietlott.vn/duong-dan-rac-khong-ton-tai-12345` **cũng** trả `403` + `cf-mitigated: challenge`.
Cloudflare trả challenge **ở edge, trước khi origin thấy path** ⇒ status code từ IP bị challenge
**không mang thông tin gì** về tính hợp lệ của path hay query. Bài học chung: **không suy ra sự tồn tại
của resource từ response của một lớp bảo vệ đứng trước nó.**

**Cách kiểm chứng đúng** (chỉ 1 trong 2 mới kết luận được):
1. Chạy từ IP mà Cloudflare tin (máy cá nhân ở VN, không VPN/datacenter) — rẻ nhất, làm trước.
2. Chạy qua unblocker của vendor đã chốt.

**Nếu xác nhận có thật** thì đây là thắng lợi lớn: JSON ổn định hơn selector HTML, và `PageSize` lấy N kỳ
trong 1 request ⇒ backfill sau khi sửa parser rẻ hẳn. **Nếu không có thật** thì bỏ, đi tiếp bằng
`vietlott-detail` (HTML) như plan gốc — không mất gì vì chưa ai code quanh nó. Đây là hướng **upside có
điều kiện**, không phải phụ thuộc — kế hoạch mặc định của G0 chỉ đo qua `vietlott-detail` (HTML), xem
`02-fetch-parse.plan.md` §5.6.

### D1c — Vì sao vẫn là Unblocker API, không phải proxy thuần

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
nguồn ở bất kỳ đâu trong `resultfeed`. Điều này vừa thoả yêu cầu ẩn IP server, vừa là điều kiện để đổi
vendor.

### D2 — Vendor chỉ bán bytes, KHÔNG bao giờ parse

`FetchProvider` trả **raw bytes + contentType**, không hơn. HTML hay JSON tuỳ site/vendor — tầng
parser quyết định cách đọc. Đổi vendor chỉ là **một class mới implement interface**, không sửa domain,
không sửa parser. ✅ **Quyết định này vừa được trả lãi ngay**: mất Bright Data vì AUP (D1) chỉ tốn đúng
một class, không tốn adapter/consensus/schema nào.

Chi tiết ở `02-fetch-parse.plan.md` §1. Lý do **không** để vendor extract (Scraper Studio) đã phân
tích ở analysis §8.3 + §14.4 — tóm lại: logic đường tiền phải có commit hash, không phải "phiên bản
trên dashboard".

### D3 — DB riêng (tên/collection tách biệt), CÙNG cluster với core

`Constants.Default.ResultFeedDbName = "megawin-resultfeed"` — một `dbName` mới, nhưng **không** một
`mongoEnvKey`/connection string mới. `ResultFeedRepo` không truyền `mongoEnvKey` ⇒ tự rơi về default
`"MONGODB_URI"` (`packages/data/src/mongo/repository.ts:88-89`), đúng tiền lệ `AuditRepo`/`ReportRepo`/
`IdentityRepo` (DB khác nhau, cluster giống nhau). Tách **tên DB** đủ để giữ collection/schema của
`resultfeed` không lẫn với `game-*`/`identity*`; tách **cluster vật lý** là việc để dành khi có nhu cầu
đo được (tải đọc từ API public lớn), không phải mặc định — `mongoEnvKey` là tham số optional sẵn có
(`repository.ts:66-80`), thêm lúc đó chỉ là 1 dòng, không phải refactor. Chi tiết `01-data-model.plan.md` §1.

### D4 — Mỗi site = một `SourceAdapter` + một Lambda function, KHÔNG biết nhau

Yêu cầu "các website lấy kết quả khác nhau không liên quan gì đến nhau" được enforce bằng cấu trúc:
adapter của site A **không import** gì từ site B, không đọc observation của site B. Chúng chỉ gặp
nhau ở **tầng consensus** (`03-consensus.plan.md`).

**Một app `apps/worker-resultfeed`, N function** (không N app): mỗi source × game là một function riêng
trong `serverless.yml` ⇒ tách concurrency, tách schedule, tách log group, tách lock, một site sập
không kéo site khác. Nhưng vẫn một lần deploy, một bộ dependency. N app cho N site là chi phí vận hành
không đổi lại được gì.

### D5 — Fetch và consensus là 2 function TÁCH BIỆT

Fetch lỗi (site sập, vendor lỗi) **không được** chặn việc chốt consensus cho dữ liệu đã thu được, và
ngược lại. Hai nhịp khác nhau, hai lock khác nhau.

### D6 — `HumanVerified` là flag cao nhất, không gì ghi đè được

Máy **không bao giờ** ghi đè kết quả người đã verify. Bất biến này phát biểu tường minh, có test, và
là điều kiện chặn ở mọi write path (`03-consensus.plan.md` §3).

### D7 — MegaWin core PULL, ResultFeed không biết gì về MegaWin

`resultfeed` **không** import `@megawin/game-*`, không gọi `PublishResultUseCase`. Core tự PULL kết quả
đã chốt. Giữ được: (a) `resultfeed` bán được cho khách ngoài mà không kéo theo core, (b) core không phụ
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

Chi phí = `13.200 × <giá unblocker/request>`. **Giá phải xác nhận trên dashboard vendor sau khi chốt
vendor** (`02-fetch-parse.plan.md` §5) — không chốt số ở đây. Con số analysis §13.7 (~$5,2/tháng cho
8.400 request) là **của Bright Data nên đã hết giá trị tham chiếu**; vendor mới có bảng giá khác. Đây là
phép đo P8 trong G0.

Điều quan trọng hơn giá: **~13.200 request/tháng là volume rất nhỏ**, nên ta không bị kẹt ở provider
nào vì lý do quy mô — tiêu chí chọn provider là **vượt được Cloudflare** và **ổn định**, không phải
giá. Đổi provider khi cần là việc rẻ (D1), nên không phải tối ưu chọn đúng ngay từ đầu.

So sánh: nếu poll 2 phút/site thì ~720 request/ngày **chỉ cho việc phát hiện kỳ mới** — dự đoán `id`
tiết kiệm hơn ~60% và còn **đúng hơn** (biết chính xác kỳ nào đang chờ, phát hiện được kỳ bị nhảy số).

---

## 4. Thư viện parser — chốt `cheerio@^1.2.0`

Chưa có thư viện HTML nào trong repo (đã grep toàn bộ `package.json` + lock). Chốt **cheerio 1.2.0**,
đặt ở `packages/resultfeed-application` (tầng infra), **KHÔNG** ở `packages/resultfeed` (domain phải pure).

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
                    ┌── Unblocker API: Oxylabs (primary) / context.dev (2nd) ──┐
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

1. **`no-core-to-resultfeed`** — core (`packages/game-*`, `apps/api-*`, `apps/worker-<game>`) **KHÔNG**
   được import `@megawin/resultfeed*`. Vi phạm = đã phá D7.
2. **`resultfeed-import-allowlist`** — `resultfeed` chỉ được import: `@megawin/shared`, `app-core`, `data`,
   `cache`, `audit`, `http-client`, `worker-core`, `next`, `ui`. **KHÔNG** import `game-*`,
   `identity*`, `tenant-*`.

⚠️ **Va chạm glob sau khi đổi tên app (02/09/2026):** `apps/api-resultfeed`/`apps/worker-resultfeed`
tự thân khớp pattern `apps/api-*`/`apps/worker-<game>` ở rule 1 — nhưng 2 app này **CHÍNH LÀ**
resultfeed, không phải "core", nên **PHẢI được loại trừ khỏi rule 1** (chúng được phép, và cần, import
`@megawin/resultfeed*`). Viết rule bằng danh sách app game thật (`worker-keno`, `worker-mega645`,
`worker-power655`, `worker-lotto535`, `worker-bingo18`, `worker-max3d`, `worker-max3dpro`,
`worker-game-core`, `worker-tenant-dispatch`) + `api-player`/`api-tenant`, **không** dùng glob
`apps/worker-*`/`apps/api-*` mù. Ngược lại, rule 2 (`resultfeed-import-allowlist`) áp dụng đúng cho
`packages/resultfeed`/`packages/resultfeed-application` — không đổi.

Điểm quan trọng: `resultfeed` **không được** import `@megawin/game-keno` để dùng `isSameKenoResult` hay
`BINGO18_BIG_MIN`. Nó phải **tự khai báo** rule kiểm checksum của mình. Nghe như trùng lặp, nhưng đó
chính là điều làm phép kiểm có giá trị: nếu `resultfeed` dùng chung hằng số với core thì khi core sai,
phép kiểm cũng sai theo và không phát hiện được gì (analysis §14.1(c)).

---

## 7. Thứ tự triển khai

| Giai đoạn | Nội dung | Rủi ro tiền |
| --- | --- | --- |
| **G0** | Probe kỹ thuật nhanh P1–P11 (`02` §5.6) qua provider đang chốt (Oxylabs) — P1/P2 (HTML, **đường chính**), P7 latency, P8 giá thật, **P10 tắt cache** (context.dev), **P11 base64 WSA**. Fail ⇒ đổi provider (1 class), không chặn gì khác | 0 |
| **G1** | `packages/resultfeed` (domain) + wiring DB riêng + index. Chưa có I/O | 0 |
| **G2** | `FetchProvider` + provider đang chốt + adapter **1 site duy nhất** + `submissions`/`observations`. Chạy shadow | 0 |
| **G3** | `consensus-tick` + trang vận hành + **human verify**. Vẫn shadow — không ai đọc kết quả | 0 |
| **G4** | Thêm site thứ 2 (confirm Keno) ⇒ bật so sánh chéo thật. Thêm Bingo18 | 0 |
| **G5** | MegaWin core PULL, **manual approve mỗi kỳ** | thấp |
| **G6** | Auto-publish có ngưỡng exposure + kill-switch | có — cần điều kiện tin cậy đo được |
| **G7** | API public cho khách ngoài | — |

**G0 chỉ là bước đo kỹ thuật** (site có trả đủ dữ liệu qua provider hiện tại không, tốc độ, chi phí),
không phải điều kiện chặn có/không được làm. Nếu provider đang chốt không đạt, đổi provider (D1) là
việc 1 class, quay lại G0 với provider mới — không mất công G1 trở đi vì domain/schema không đổi.
G1→G4 rủi ro tiền = 0 vì không kết quả nào chảy vào MegaWin.

---

## 8. Không làm (phạm vi này)

- ❌ Để vendor extract structured data (analysis §8.3, §14.4) — provider chỉ trả bytes (D2), dù là
  provider nào (Oxylabs, context.dev, extension, …).
- ❌ Auto-publish ngay (G6, sau khi có số liệu tin cậy).
- ❌ Sửa `isSameKenoResult` / logic settle của core — việc của core, không phải `resultfeed`.
- ❌ Thêm game ngoài Keno/Bingo18 — kiến trúc mở sẵn nhưng chưa làm.
