# ResultFeed — Đơn giản hoá reanchor + Lịch fetch theo giờ quay + Lotto 5/35

## Bối cảnh & phạm vi

Ba việc, tách rõ ràng:

1. **Đơn giản hoá `needsReanchor`** — cơ chế hiện tại (`needsReanchor` + `planReanchor` +
   `supportsReanchorParse`) chưa từng chạy được (`supportsReanchorParse: false` ở mọi adapter),
   và khi `period_gap` xảy ra thì tick sau bị đưa vào `awaiting_anchor` — deadlock chờ ops
   `seedAnchor`. Thực tế period_gap chỉ xảy ra khi actual period trả về LỆCH khỏi
   `expectedPeriod` (không phải do "chạy chậm" — chạy chậm đã được `ResultUnavailableError` +
   burst catch-up xử lý tốt rồi). Bỏ hẳn cơ chế list-page chưa dùng được, thay bằng: lệch kỳ →
   ghi alert Warning (để biết) → **tự nhận actual period làm anchor mới** và tiếp tục — không
   block.
2. **Lịch fetch theo giờ quay cố định** — cho game chỉ quay 1-2 lần/ngày (Lotto 5/35 quay 13:00 +
   21:00 VN mọi ngày), thay vì poll đều `minIntervalMs` suốt ngày, tính `nextFetchAt` nhảy thẳng
   tới giờ quay kế tiếp sau khi 1 kỳ đã confirm — nhánh "chưa có kết quả"/lỗi vẫn dùng
   backoff/`minIntervalMs` như cũ (không đổi phần chờ site publish muộn — đúng ý "site có thể
   publish muộn, cứ chạy tiếp tới khi bắt kịp").
3. **Lotto 5/35 end-to-end** — ví dụ thật cho cơ chế (2), thêm vào adapter `vietlott-detail` sẵn
   có (cùng site, cùng nguồn authoritative), dùng fixture thật đã có (`test/html/lotto535.html`,
   `test/html/lotto535-detail-error.html`).

**KHÔNG làm trong plan này**: backfill lịch sử qua scraping. User đã có sẵn file `.jsonl` chứa dữ
liệu cũ cho từng game (`test/history-result/*.jsonl`) và sẽ làm plan import riêng sau — plan này
không tạo, không tìm thêm, không đọc nội dung các file đó. Vì vậy cũng không cần `manual_floor`,
không cần parser trang list.

## 1. Đơn giản hoá needsReanchor / period_gap

### Entity — `packages/resultfeed/src/entities/source-cursor.ts`
- Xoá field `needsReanchor` (dòng ~30-34) — không còn ai set `true` được (self-heal, không block).

### Adapter contract — `packages/resultfeed-application/src/sources/types.ts`
- Xoá `planReanchor()` và `supportsReanchorParse` khỏi interface `SourceAdapter` (dòng ~104-131).
  `FetchPlan.expectedPeriod` giữ nguyên (`null` chỉ còn dùng cho case lý thuyết, thực tế
  `planNextFetch` luôn trả kỳ dự đoán cụ thể).

### vietlott-detail adapter — `.../vietlott-detail/adapter.ts`
- Xoá `planReanchor`, `supportsReanchorParse`.
- Xoá `buildListUrl` khỏi `urls.ts` (chỉ được gọi từ `planReanchor`, dead code sau khi xoá).

### Repo — `source-cursor-repo.ts`
- `ensureCursor`, `recordSuccess`, `seedAnchor`: bỏ set `needsReanchor`.
- `recordFailure(id, { nextFetchAt, needsReanchor? })`: bỏ param `needsReanchor` — chữ ký còn
  `{ nextFetchAt: Date }`.
- Cập nhật JSDoc liên quan (mô tả cũ nhắc `needsReanchor`/`awaiting_anchor` ở nhiều nơi).

### Orchestration — `fetch-and-parse.ts`
- Bước 3 (dòng ~313-338): điều kiện reanchor cũ `cursor.needsReanchor || cursor.lastConfirmedPeriod
  === null` → chỉ còn `cursor.lastConfirmedPeriod === null` (cold start thật, chưa từng seed).
  Đổi outcome status `awaiting_anchor` → `awaiting_seed` (rõ nghĩa hơn — không còn khái niệm
  "anchor từ trang list"). Message alert `SourceStale` bỏ nhắc `needsReanchor`.
- Bước 7 (dòng ~490-516, period_gap): thay `recordFailure(..., needsReanchor: true)` bằng
  **self-heal**: vẫn ghi alert `PeriodGap` (Warning, giữ nguyên), rồi gọi `recordSuccess` với
  `lastConfirmedPeriod = parsed.drawPeriod` (actual, không phải expected) — coi kỳ trả về là
  anchor mới, tiếp tục dự đoán +1 từ đó. Không tăng `consecutiveFailures`, không set
  `needsBackfill`.
- `runTick`: điều kiện tiếp tục burst-loop (dòng ~276) đổi từ `outcome.status === "ok"` thành
  `outcome.status === "ok" || outcome.status === "period_gap"` — lệch kỳ không còn là lý do dừng
  vòng lặp catch-up.
- `FetchAndParseOutcome` type: đổi `awaiting_anchor` → `awaiting_seed`.

### Test + doc liên quan
- `test/sources/vietlott/vietlott-detail.test.ts`, `test/infras/source-cursor-repo.test.ts`,
  `test/infras/mappers.test.ts`: bỏ assertion/setup liên quan
  `needsReanchor`/`supportsReanchorParse`/`planReanchor`.
- `02-fetch-parse.plan.md` + `01-data-model.plan.md` (cùng thư mục): cập nhật đoạn mô tả pipeline
  bước 3/7 và field `needsReanchor` cho khớp thiết kế mới (tài liệu nguồn của hệ thống — để sai sẽ
  gây hiểu nhầm lần đọc sau).

## 2. Lịch fetch theo giờ quay cố định (schedule-aware)

Chỉ ảnh hưởng đúng 1 điểm trong pipeline: cách tính `nextFetchAt` ở nhánh **thành công** (bước 9,
cả đường bình thường và đường self-heal ở mục 1). Nhánh lỗi/`unavailable` giữ nguyên
`minIntervalMs`-based.

### Thiết kế

Game 1 ngày quay nhiều lần (Lotto535: mọi ngày, 13:00+21:00) và game vài ngày/tuần (Power655: Thứ
3/5/7 18:00; Mega645: Thứ 4/6/CN 18:00) là **cùng một shape dữ liệu** — chỉ khác có/không giới hạn
thứ trong tuần. `packages/game-core/src/utils/vietlott-period.ts` đã giải đúng bài toán này cho nhu
cầu suy mã kỳ (`VietlottFixedTimesSchedule { drawTimes: string[]; drawDaysOfWeek?: number[] }`,
quy ước `0`=Chủ Nhật…`6`=Thứ Bảy theo `dayOfWeek()`/`Date.getUTCDay()`). **Không import thẳng type
đó** — `resultfeed` bị cấm import `@megawin/game-*` (boundary lint, `00-overview.md` §6) — nhưng
**mirror đúng shape** thành type riêng của `resultfeed`, chỉ tái dùng `dayOfWeek()`/`toVNDate()` từ
`@megawin/shared/utils` (package trung lập).

- Thêm type `GameFetchSchedule` (file mới `packages/resultfeed-application/src/use-cases/fetch/schedule.ts`):
  ```ts
  type GameFetchSchedule =
    | { type: "continuous" }                                              // Keno, Bingo18 — hành vi hiện tại
    | {
        type: "fixed";
        drawTimesVn: string[];        // "HH:mm" giờ VN, không cần sort trước
        drawDaysOfWeek?: number[];    // 0=CN…6=T7 (dayOfWeek()); undefined/rỗng = quay MỌI ngày
      };
  ```
  Ví dụ dùng ngay (Lotto535, mọi ngày): `{ type: "fixed", drawTimesVn: ["13:00", "21:00"] }`.
  Ví dụ dùng sau khi implement Power655 (Thứ 3/5/7):
  `{ type: "fixed", drawTimesVn: ["18:00"], drawDaysOfWeek: [2, 4, 6] }`. Mega645 (Thứ 4/6/CN):
  `{ type: "fixed", drawTimesVn: ["18:00"], drawDaysOfWeek: [3, 5, 0] }`.
- Hàm `computeNextFetchAt(schedule, now, minIntervalMs)`:
  - `continuous` → `scheduleWithJitter(minIntervalMs)` (y nguyên hàm cũ).
  - `fixed` → dò tối đa 7 ngày tới kể từ `now` (giờ VN); ngày nào có `drawDaysOfWeek` mà không
    khớp `dayOfWeek(dateStr)` thì bỏ qua; trong ngày khớp, xét từng `drawTimesVn` đã sort, chọn mốc
    gần nhất SAU `now` (dựng `Date` bằng `toVNDate`, tái dùng từ `@megawin/shared/utils`), rồi áp
    jitter nhỏ (vài phút) để tránh gọi đúng giây quay. `drawDaysOfWeek` rỗng/không set → mọi ngày
    đều khớp (đúng hành vi Lotto535).
- `FetchAndParseDeps` thêm field `schedule: GameFetchSchedule` (bắt buộc, mỗi handler Lambda tự
  khai khi khởi tạo use-case — Keno/Bingo18 khai `{ type: "continuous" }`, Lotto535 khai
  `{ type: "fixed", drawTimesVn: ["13:00", "21:00"] }`).
- Trong `fetchAndParseOnce`, 2 chỗ gọi `scheduleWithJitter(source.minIntervalMs)` cho nhánh thành
  công (bước 9 bình thường + self-heal mục 1) đổi thành
  `computeNextFetchAt(this.deps.schedule, new Date(), source.minIntervalMs)`. Nhánh
  lỗi/backoff/`recordUnavailable`/`paused` KHÔNG đổi.

Không cần sửa `SourceDoc`/DB — schedule là hằng số khai báo tại code (Lambda handler), không phải
data vận hành đổi qua backoffice (giống cách `gameKey`/`sourceId` hiện đang khai cứng ở handler).

## 3. Lotto 5/35 end-to-end trên vietlott-detail

### Bằng chứng thật đã có (từ user)
- URL: `https://www.vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/535?id=00860&nocatche=1` —
  khác hẳn pattern `/view-detail-{game}-result?id=` của Keno/Bingo18; giống Bingo18 ở việc
  `nocatche=1` là hằng số (cả 2 fixture — thành công `#00860` và lỗi `#00863` — đều dùng
  `nocatche=1` và ra đúng nội dung mong đợi).
- Period 5 chữ số (`00860`), khác 7 chữ số của Keno/Bingo18.
- Kết quả: 5 số chính (`.day_so_ket_qua_v2` → `<span class="bong_tron small">`) + `<i>|</i>` + 1 số
  đặc biệt (`<span class="... active">`) — **không** nằm trong `<tr>` như Keno/Bingo18, mà trong
  `<h5>Kỳ quay thưởng <b>#00860</b> ngày <b>01/09/2026</b></h5>` — phải viết reader riêng, không
  tái dùng `dom-helpers.ts` (vốn giả định cấu trúc bảng `<tr><td>`).
- Trang "chưa có kết quả": vẫn giữ khung `form#ctl00` + `#__VIEWSTATE` hợp lệ, text `"Không tìm
  thấy kết quả [00863]"` — khớp `UNAVAILABLE_MARKERS` hiện có, tái dùng được logic nhận diện
  `ResultUnavailableError` (chỉ khác selector kết quả/h5).
- Quy tắc chơi (xác nhận qua vietlott.vn + đối chiếu `.cursor/rules/lotto535-game-rules.mdc`): 5 số
  chính `01`-`35` (không trùng) + 1 số đặc biệt `01`-`12`. Quay 13:00 và 21:00 VN, mọi ngày. KHÔNG
  có checksum (chẵn/lẻ/lớn/nhỏ) công bố trên trang — `claimedChecksums` sẽ luôn rỗng.

### Enum — `packages/resultfeed/src/entities/enums.ts`
- Thêm `ResultFeedGameKey.Lotto535 = "lotto535"`.

### URL builder — `urls.ts`
- `buildDetailUrl`: thêm case Lotto535 → `${BASE_URL}/535?id=${period}&nocatche=1` (theo bằng
  chứng thật, không theo timestamp như Keno).

### Parser mới — `packages/resultfeed-application/src/sources/vietlott/vietlott-detail/parse-lotto535.ts`
- Đọc riêng (KHÔNG import từ `dom-helpers.ts` vì cấu trúc DOM khác hẳn — không có `<tr>`):
  - Ngày + kỳ từ `<h5>` (`Kỳ quay thưởng <b>#00860</b> ngày <b>01/09/2026</b>`) — regex trên text,
    không cần `td`.
  - "Chưa có kết quả": giữ nguyên kiểm tra `form#ctl00` + `#__VIEWSTATE` + `UNAVAILABLE_MARKERS`
    (export thêm 1 helper dùng chung phần "shell hợp lệ" từ `dom-helpers.ts`, HOẶC copy cục bộ nếu
    tách ra làm phức tạp thêm — quyết định lúc code theo mức tái dùng thực tế).
  - Số: lấy toàn bộ `<span class="bong_tron small">` trong `.day_so_ket_qua_v2`, 5 phần tử đầu =
    main (giữ thứ tự nguồn, không sort), phần tử thứ 6 (sau `<i>|</i>`, có class `active`) = số
    đặc biệt. `numbersDisplay = [...5 main, special]` — **quy ước: số đặc biệt luôn ở vị trí CUỐI
    cùng** (ghi rõ trong JSDoc vì ảnh hưởng canonicalize + intrinsic-check).
  - `claimedChecksums = {}` (không có checksum công bố).

### Rule layer
Cần sửa vì Lotto535 có 2 "miền số" khác nhau (main 1-35, đặc biệt 1-12, chồng lấp giá trị 1-12) —
sort toàn bộ mảng flat sẽ làm mất phân biệt main/đặc biệt.

- `packages/resultfeed/src/rules/canonicalize.ts`: `canonicalizeNumbers` hiện luôn sort toàn mảng
  — thêm switch theo `gameKey`: Keno/Bingo18 giữ nguyên (sort toàn mảng); Lotto535 sort riêng 5
  phần tử đầu (main), giữ cố định phần tử thứ 6 (đặc biệt) ở cuối. Cập nhật JSDoc đầu file (không
  còn đúng "mọi game đều sort tăng dần").
- `packages/resultfeed/src/rules/intrinsic-check.ts`: thêm `checkLotto535` (hằng số tự khai riêng:
  `LOTTO535_MAIN_COUNT=5`, `LOTTO535_MAIN_MIN=1`, `LOTTO535_MAIN_MAX=35`, `LOTTO535_SPECIAL_MIN=1`,
  `LOTTO535_SPECIAL_MAX=12`) — validate hình thức (6 phần tử, 5 main không trùng trong biên, 1 đặc
  biệt trong biên), không có checksum nào để so ⇒ luôn `NotAvailable` khi hình thức hợp lệ,
  `Failed` khi sai hình thức. Thêm case vào switch `checkIntrinsic` (exhaustive switch hiện tại sẽ
  compile-fail nếu quên, đúng ý muốn).

### Adapter — `adapter.ts`
- `gameKeys`: thêm `ResultFeedGameKey.Lotto535`.
- `parse()`: thêm case gọi `parseLotto535($)`.

### Fixture test — dùng file đã có
- `test/html/lotto535.html`, `test/html/lotto535-detail-error.html` (đã có, do user cung cấp) —
  viết test cho `parseLotto535` (case thành công đọc đúng 5 main + 1 đặc biệt + ngày/kỳ; case lỗi
  throw `ResultUnavailableError`), theo khuôn test hiện có cho keno/bingo18.

### Worker — Lambda handler mới
- `apps/worker-resultfeed/src/handlers/fetch/vietlott-lotto535.ts` — mirror
  `vietlott-bingo18.ts`, khai `schedule: { type: "fixed", drawTimesVn: ["13:00", "21:00"] }`
  (mục 2, không set `drawDaysOfWeek` vì Lotto535 quay mọi ngày).
- `apps/worker-resultfeed/src/functions/fetch.yml` — thêm entry `fetch-vietlott-lotto535` (cron 1
  phút, timeout 120 — giữ cron ngắn vì `nextFetchAt` mới là thứ quyết định nhịp thật; poll 1
  phút/lần nhưng đa số lần chỉ thoát sớm ở bước 1 do chưa tới giờ quay).

### Vận hành (ghi chú, không phải code)
- Seed doc `sources` cho `vietlott-detail` cần thêm `lotto535` vào `gameKeys` + ops chạy
  `seedAnchor` một lần cho cursor `vietlott-detail × lotto535` (cold start, giống Keno/Bingo18 lúc
  mới triển khai).

## Việc KHÔNG làm (out of scope, đã xác nhận với user)

- Backfill lịch sử Lotto535 (hoặc bất kỳ game nào) qua scraping ngược, và KHÔNG đụng tới nội dung
  các file `test/history-result/*.jsonl` — user đã có dữ liệu, sẽ làm plan import riêng sau.
- Parser trang list (`/winning-number-*`) cho bất kỳ game nào — không còn cần thiết sau khi bỏ cơ
  chế reanchor.
- Thêm Power 6/55, Mega 6/45 — chỉ Lotto 5/35 làm ví dụ cụ thể lần này; `GameFetchSchedule` kiểu
  `fixed` (mục 2) đã tổng quát sẵn cho cả 2 game này (`drawDaysOfWeek: [2,4,6]` cho Power655,
  `[3,5,0]` cho Mega645, cùng `drawTimesVn: ["18:00"]`) — chỉ cần khai đúng tham số lúc làm, không
  cần đổi type.
