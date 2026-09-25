# ResultFeed — GUIDE vận hành lỗ kỳ

Runbook **tay** khi nguồn bị lỗ kỳ (cursor kẹt, `lastConfirmedPeriod` không nhích). Không
phải README package — thiết kế + implement nằm ở plan
[`.cursor/plans/resultfeed/12-cursor-gap-lag-probe.plan.md`](../../.cursor/plans/resultfeed/12-cursor-gap-lag-probe.plan.md).

Incident 2026-09: Keno `vietlott-detail` kẹt `0296759` (94 fail / ~2 ngày). Nhảy tay
`0296806` rồi thấy `0296762` vẫn còn — chạy lại đoạn bỏ sót (mục 3.1).

Code: `packages/resultfeed-application/src/use-cases/fetch/fetch-and-parse.ts`,
`packages/resultfeed-application/src/infras/repos/source-cursor-repo.ts`,
`packages/resultfeed/src/entities/source-cursor.ts`.

---

## Mục lục

1. [Vì sao kẹt — không phải `needsBackfill`](#1-vì-sao-kẹt--không-phải-needsbackfill)
2. [Chẩn đoán](#2-chẩn-đoán)
3. [Nhảy cursor tới kỳ có dữ liệu](#3-nhảy-cursor-tới-kỳ-có-dữ-liệu)
4. [Có cần dừng worker?](#4-có-cần-dừng-worker)
5. [Xác nhận sau khi nhảy](#5-xác-nhận-sau-khi-nhảy)
6. [Việc không làm](#6-việc-không-làm)
7. [Script / API có sẵn](#7-script--api-có-sẵn)
8. [Tương lai — xem plan](#8-tương-lai--xem-plan)

---

## 1. Vì sao kẹt — không phải `needsBackfill`

Cursor là **một pointer tuần tự**:

- `lastConfirmedPeriod` = kỳ đã confirm thành công gần nhất
- Tick sau luôn fetch `lastConfirmedPeriod + 1` (`planNextFetch` → `incrementPeriod`)
- Fail (`fetch_failed` / `parse_failed`) → `recordFailure`: tăng `consecutiveFailures`,
  set `needsBackfill = true`, đẩy `nextFetchAt` (backoff luỹ tiến, trần 30 phút).
  **Không** tiến pointer.

`needsBackfill = true` **không dừng** worker. Cờ này chỉ bật burst (nhiều kỳ / 1
invocation) **sau khi** kỳ hiện tại `ok`. Fail → `shouldStop` dù cờ đang `true` — không
hammer endpoint lỗi trong cùng invocation.

Không có hàng đợi gap / skip-and-backfill. `period_gap` chỉ self-heal khi **cùng URL**
trả kỳ khác kỳ vọng. `vietlott-detail` gọi URL **theo đúng ID kỳ**, nên lỗ số (kỳ P mất,
kỳ P+K còn) không tự nhảy.

`result_unavailable` (“Không tìm thấy kết quả” / “chưa có kết quả”) **không** phải lỗi:
`recordUnavailable` reset `consecutiveFailures = 0`, tắt `needsBackfill`. Nếu counter
đang tăng và cờ `true` → đó là `fetch_failed` hoặc `parse_failed`, không phải “kỳ chưa
quay”.

---

## 2. Chẩn đoán

Triệu chứng điển hình trên `source_cursors` (`sourceId` × `gameKey`):

| Field                       | Dấu hiệu kẹt lỗ kỳ                                                            |
| --------------------------- | ----------------------------------------------------------------------------- |
| `lastConfirmedPeriod`       | Đứng yên nhiều giờ/ngày                                                       |
| `nextExpectedPeriod`        | Luôn cùng 1 kỳ                                                                |
| `consecutiveFailures`       | Tăng đều (backoff ~30 phút/lần khi đã trần)                                   |
| `needsBackfill`             | `true` (hệ quả `recordFailure`, không phải nguyên nhân)                       |
| `isPaused`                  | `false` — nếu `true` thì là nhánh intrinsic-pause, **không** dùng runbook này |
| `updatedAt` / `nextFetchAt` | Vẫn đổi — worker sống, chỉ không tiến kỳ                                      |

Bước xác minh (bắt buộc trước khi nhảy):

1. Mở trang detail nguồn đúng `nextExpectedPeriod` — kỳ đó có số không?
2. Dò **kỳ đầu tiên còn dữ liệu** ngay sau kỳ kẹt (không phải kỳ mới nhất trên site).
   Thử `P+1`, `P+2`, … trên trang detail. Incident 2026-09: `0296759`–`0296761` mất,
   `0296762` còn — đừng nhảy thẳng tới kỳ live (vd `0296806`).
3. Thử vài kỳ giữa lỗ. Xác nhận là **lỗ phía nguồn**, không phải Oxylabs/parser.
4. Collection `submissions` (`sourceId` + `gameKey`, 1–2 ngày gần nhất):
   - `state = fetch_failed` → HTTP/provider. Nhảy cursor **không** chữa mạng.
   - `state = parse_failed` + HTML không phải marker “chưa có kết quả” → kỳ không tồn tại
     **hoặc** HTML đổi. Đối chiếu site để phân biệt.
5. Alert: `parse_failed:{sourceId}:{gameKey}` hoặc `fetch_failing:{sourceId}:{gameKey}`.
6. Cursor game khác cùng nguồn (`bingo18`, …) — outage site thường dính nhiều game.
7. MegaWin core: cửa sổ kỳ bị lỗ **đã bán vé chưa?**
   - Chưa → nhảy cursor an toàn. ResultFeed chỉ thiếu observation các kỳ nguồn không có.
   - Đã bán → nguồn này **không** settle được các kỳ đó. Cần nguồn khác hoặc nhập tay.
     Nhảy cursor chỉ cứu từ kỳ còn dữ liệu trở đi.

---

## 3. Nhảy cursor tới kỳ có dữ liệu

`planNextFetch` fetch `lastConfirmedPeriod + 1`. Muốn tick đầu gọi kỳ `FIRST_AVAILABLE`
thì neo **kỳ liền trước** (kỳ neo không cần tồn tại trên site). Giữ nguyên độ dài
zero-pad (Keno/Bingo18 = 7 chữ số).

Ví dụ: lỗ `0296759`–`0296761`, site còn từ `0296762` → neo `0296761`, kỳ vọng `0296762`.

Backoffice `seedAnchor` **chưa có**. `pnpm seed:cursors` **bỏ qua** cursor đã có tiến độ
(`lastConfirmedPeriod !== null`). Sửa thẳng Mongo (Compass / mongosh) trên đúng DB
ResultFeed.

```javascript
db.source_cursors.updateOne(
  { sourceId: "vietlott-detail", gameKey: "keno" },
  {
    $set: {
      lastConfirmedPeriod: "0296761",
      nextExpectedPeriod: "0296762",
      nextFetchAt: new Date(),
      consecutiveFailures: 0,
      needsBackfill: true,
      consecutiveIntrinsicFailures: 0,
      isPaused: false,
      updatedAt: new Date(),
    },
  },
);
```

Đổi `sourceId` / `gameKey` / hai mã kỳ cho đúng case.

| Field                          | Giá trị               | Lý do                                        |
| ------------------------------ | --------------------- | -------------------------------------------- |
| `lastConfirmedPeriod`          | `FIRST_AVAILABLE - 1` | Neo giả; worker không fetch kỳ này           |
| `nextExpectedPeriod`           | `FIRST_AVAILABLE`     | URL tick tới                                 |
| `nextFetchAt`                  | `now`                 | Cron phút tới vào việc                       |
| `consecutiveFailures`          | `0`                   | Xóa backoff                                  |
| `needsBackfill`                | `true`                | Burst đuổi từ `FIRST_AVAILABLE` tới mép live |
| `isPaused`                     | `false`               | Mở gate fetch                                |
| `consecutiveIntrinsicFailures` | `0`                   | Seed sạch; không dính counter pause cũ       |

### `needsBackfill` để `true` khi nào

- `true` (mặc định cho incident lỗ kỳ): một invocation lấy nhiều kỳ tới
  `result_unavailable` hoặc hết budget (~100s). `recordSuccess` **không** tắt cờ; chỉ
  `recordUnavailable` tắt khi đã chạm mép live.
- Nếu `FIRST_AVAILABLE` **đã là** kỳ mới nhất trên site: `true` chỉ thêm 1 tick dò →
  `result_unavailable` → cờ tự `false`. Tốn 1 request, không hại.
- Đặt `false` chỉ khi cố ý đi chậm (1 kỳ / phút cron) để giảm tải Oxylabs/Vietlott.

`SourceCursorRepository.seedAnchor()` reset `needsBackfill = false` — **đừng** gọi method
đó cho case đuổi backlog sau lỗ kỳ, trừ khi chủ động `markNeedsBackfill(true)` ngay sau.

### 3.1 Nhảy quá xa — chạy lại đoạn bị bỏ

Sau khi nhảy, nếu phát hiện site **vẫn có** các kỳ nằm giữa neo cũ và neo mới (vd đã nhảy
tới `0296806` rồi mới thấy `0296762`–`0296805` còn trên Vietlott):

**Được phép kéo cursor lùi** và burst lại. Không xóa observation / consensus / submission
đã có.

1. Xác nhận kỳ đầu còn dữ liệu (`FIRST_AVAILABLE`, vd `0296762`) và kỳ ngay trước lỗ
   vẫn không có (vd `0296759`–`0296761`). **Đừng** kéo về `0296758` — tick đầu lại fetch
   `0296759` và kẹt như ban đầu.
2. Cùng lệnh mục 3, neo `FIRST_AVAILABLE - 1` (vd `0296761` / `0296762`), `needsBackfill: true`.
3. Burst sẽ lấy đoạn thiếu (`0296762`–`0296805`), rồi **đi qua lại** các kỳ đã lấy
   (`0296806` trở đi) tới mép live.

Kỳ đã có **không bị duplicate, không throw**:

| Collection     | Unique key                                       | Khi fetch lại cùng kỳ                                                                                                                                                       |
| -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observations` | `{sourceId, gameKey, drawPeriod, parserVersion}` | Upsert `$set`. Cùng số → nội dung no-op, chỉ bump `updatedAt`.                                                                                                              |
| `submissions`  | `{sourceId, contentHash}`                        | Cùng HTML → `$inc seenCount`, không doc mới.                                                                                                                                |
| `consensus`    | `{gameKey, drawPeriod}`                          | Tick thấy `updatedAt` mới → tính lại. Cùng số → cùng hash. `HumanVerified` / `Rejected` máy không ghi đè. `Agreed` + `AUTO_PUBLISH` → `publishedAt` refresh, `version + 1`. |

Chỉ đáng ngại nếu site **đổi số** kỳ đã publish (hash khác) → có thể `conflict` hoặc đổi
consensus máy. Đối chiếu vài kỳ đã có trước khi kéo lùi nếu nghi nguồn sửa kết quả.

Không “chạy lại từ đầu” theo nghĩa xóa collection rồi import — không cần và mất audit.

---

## 4. Có cần dừng worker?

**Không.** Không undeploy Lambda, không tắt cron.

Worker đọc cursor **một lần đầu tick**. `recordFailure` không đụng
`lastConfirmedPeriod` / `nextExpectedPeriod` — neo vừa nhảy không bị tick fail ghi đè.

- `nextFetchAt` còn ở tương lai (đang backoff): update luôn. Cron thấy `not_due`, không ghi cursor.
- Đang invoke / `nextFetchAt <= now`: đợi 10–20 giây cho tick fail xong rồi update. Race
  tối đa: `recordFailure` `$inc` failures (0→1) và đẩy `nextFetchAt` ~30 phút — pointer
  vẫn đúng, chỉ chậm 1 nhịp.
- `recordSuccess` trên kỳ cũ (phá neo) gần như không xảy ra nếu kỳ đó đã fail liên tiếp.
- Không cần `isEnabled = false` trừ khi muốn loại hết race đó (nhớ bật lại; nhánh
  `source_disabled` **không** ghi `nextFetchAt`).

---

## 5. Xác nhận sau khi nhảy

1. 1–2 phút (hoặc sau 1 nhịp cron): `lastConfirmedPeriod` phải thành `FIRST_AVAILABLE`
   (vd `0296762`), `consecutiveFailures = 0`.
2. Burst: `lastConfirmedPeriod` tăng nhiều kỳ trong vài phút; `needsBackfill` vẫn `true`
   cho tới khi chạm mép live.
3. Khi đuổi kịp: outcome `result_unavailable` → `needsBackfill = false`,
   `nextExpectedPeriod` = kỳ live + 1, nhịp trở lại `minIntervalMs` / night-mode.
4. Nếu tick đầu lại `parse_failed` trên `FIRST_AVAILABLE`: sai kỳ neo hoặc kỳ đó cũng
   không parse được — **đừng** tăng `consecutiveFailures` bằng cách retry tay; đối chiếu
   lại site rồi nhảy tiếp.

---

## 6. Việc không làm

- Chỉ `markNeedsBackfill(false)` — pointer vẫn trỏ kỳ lỗ, lần fail sau bật lại cờ.
- `pnpm --filter @megawin/resultfeed-application seed:cursors` — script chỉ seed
  `lastConfirmedPeriod === null`.
- Nhảy `lastConfirmedPeriod = FIRST_AVAILABLE` nếu muốn **lấy cả** kỳ đó. Làm vậy tick
  đầu fetch `FIRST_AVAILABLE + 1`, bỏ sót kỳ vừa có dữ liệu.
- Coi `needsBackfill = true` là “đang dừng” rồi tắt worker / disable source.
- Auto-sửa `nextExpectedPeriod` mà không đổi `lastConfirmedPeriod` — tick sau
  `planNextFetch` tính lại từ `lastConfirmedPeriod`, ghi đè kỳ vọng.

---

## 7. Script / API có sẵn

| Đường                                                        | Dùng khi                         | Không dùng khi                                       |
| ------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @megawin/resultfeed-application seed:cursors` | Cold start sau import lịch sử    | Cursor đã có tiến độ (case lỗ kỳ)                    |
| `SourceCursorRepository.seedAnchor`                          | Neo sạch, không cần burst        | Đuổi backlog ngay sau lỗ kỳ (`needsBackfill` bị tắt) |
| `markNeedsBackfill`                                          | Bật/tắt burst, không đổi pointer | Pointer đang trỏ kỳ không tồn tại                    |
| `resumeFromPause`                                            | Hết `isPaused` (intrinsic)       | Lỗ kỳ — `isPaused` đang `false`                      |
| Backoffice seed/skip                                         | **Chưa xây**                     | —                                                    |
| Update Mongo tay (mục 3)                                     | Lỗ kỳ trên cursor đã chạy        | —                                                    |

Import lịch sử: `pnpm --filter @megawin/resultfeed-application import:historical`
(xem `src/scripts/import-historical-results.ts`). Không thay thế nhảy cursor sống.

---

## 8. Tương lai — xem plan

GUIDE này **chỉ** đường tay hôm nay (mục 2–7). Thiết kế tự động (`CursorLag`, probe lỗ kỳ,
Skip API, không `--force`) và thứ tự ship P0–P3:

[`.cursor/plans/resultfeed/12-cursor-gap-lag-probe.plan.md`](../../.cursor/plans/resultfeed/12-cursor-gap-lag-probe.plan.md)

Khi P3 xong: mục 3 đổi sang API backoffice; lệnh Mongo không còn là đường chính.
