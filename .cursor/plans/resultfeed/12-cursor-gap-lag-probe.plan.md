# ResultFeed — Cursor lag, probe lỗ kỳ, Skip-to-period

> Nguồn: incident Keno `vietlott-detail` 2026-09 (`0296759` kẹt 94 fail / ~2 ngày; nhảy tay
> `0296806` rồi phát hiện `0296762` vẫn còn). Runbook tay:
> [`apps/worker-resultfeed/GUIDE.md`](../../../apps/worker-resultfeed/GUIDE.md).
> Pipeline hiện tại: `02-fetch-parse.plan.md`, lịch: `05-lotto535-and-schedule.plan.md`.

## Bối cảnh & phạm vi

Cursor là **một pointer tuần tự**. `recordFailure` không tiến
`lastConfirmedPeriod`. `vietlott-detail` fetch URL đúng ID kỳ nên `period_gap` self-heal
(cùng response trả kỳ khác) **không** phủ lỗ số (P mất, P+K còn).

Hai hình lỗ:

| Hình | Outcome hiện tại | Hệ quả |
|---|---|---|
| Trang hỏng / không khớp marker “chưa có kết quả” | `parse_failed` → backoff 30 phút, pointer đứng | Incident 2026-09 |
| Trang báo “Không tìm thấy kết quả” cho kỳ không tồn tại | `recordUnavailable` → tắt `needsBackfill`, giả mép live | Poll mãi P, kỳ sau có cũng không lấy |

Mục tiêu: **không kẹt pointer**, **không bỏ kỳ vì nguồn trễ**, **bắt lỗi trong phút**.

**KHÔNG làm:** `seed:cursors --force` (neo theo consensus mới nhất = nhảy quá xa như
`0296806`). Chờ N≥5 `parse_failed` rồi mới probe. Dừng worker khi skip. Xóa observation /
consensus để “chạy lại từ đầu”.

## Nguyên tắc (bất biến)

1. Chỉ tiến cursor khi **parse `ok` một kỳ thật**.
2. `fetch_failed` **không** phải tín hiệu lỗ kỳ — không probe, không skip.
3. `result_unavailable` **trong grace** = mép live — `recordUnavailable` như cũ.
4. `needsBackfill` chỉ bật burst sau khi kỳ hiện tại xong; không có nghĩa “bỏ kỳ lỗi”.
5. `P` và `P+1` cùng `parse_failed` = parser/HTML hệ thống — **được phép dừng** ingest
   (alert Critical; có thể `isPaused` sau 3 cặp). Không walk `P+2…P+80` nuốt rác.

## Thứ tự ship (4 phase, độc lập deploy)

| Phase | Việc | Rủi ro ingest | Phụ thuộc |
|---|---|---|---|
| **P0** | Alert `CursorLag` + field `lastSuccessAt` | Không đổi fetch | — |
| **P1** | Probe ngay khi `parse_failed` | Chỉ nhảy khi probe `ok` | P0 nên có (ops thấy lag) nhưng không chặn |
| **P2** | `unavailable` quá grace → probe, không `recordUnavailable` | Sửa “giả mép live” | P1 (tái dùng walk probe) |
| **P3** | Use-case + API backoffice “Skip to period” | Chỉ khi Admin gọi | Không phụ thuộc P1/P2 |

---

## P0 — `CursorLag`

Incident: `parse_failed` đã bắn từ lần đầu nhưng không ai nhìn; backoff × 94 ≈ 2 ngày.

### Entity — `packages/resultfeed/src/entities/source-cursor.ts`

Thêm `lastSuccessAt: Date | null` — mốc `recordSuccess` gần nhất. **Không** dùng
`updatedAt` (`recordFailure` / `recordUnavailable` cũng bump). `ensureCursor` /
`seedAnchor` / Skip API: `null` (cold) hoặc `now` (ops vừa neo).

### Enum — `packages/resultfeed/src/entities/enums.ts`

```typescript
CursorLag: "cursor_lag",
```

Dedupe `cursor_lag:{sourceId}:{gameKey}`. Warning khi quá **2 chu kỳ**; Critical khi quá
**8 chu kỳ** (Keno ≈ 16 phút / ≈ 64 phút).

### Grace / chu kỳ — `schedule.ts`

Helper thuần `cycleMs(schedule, minIntervalMs)`:

- `continuous` / `continuous-daily-window` → `schedule.drawIntervalMs ?? minIntervalMs`
- `fixed` → khoảng ngắn nhất giữa 2 slot trong ngày; fallback `minIntervalMs`

Helper `isCursorLagging({ lastSuccessAt, schedule, minIntervalMs, now, cycles })`.

### Gọi chỗ nào

Cuối `fetchAndParseOnce` (mọi outcome trừ `not_due` / `source_disabled` / `awaiting_seed`)
và/hoặc đầu `ConsensusTickUseCase` quét cursor due. Ưu tiên **trong fetch**: cùng log
group với kỳ đang kẹt, không thêm cron.

`lastSuccessAt == null` + đã có `lastConfirmedPeriod` (cursor cũ): coi `updatedAt` **một
lần** rồi để tick success sau ghi đúng — hoặc backfill `lastSuccessAt = updatedAt` trong
`ensureCursor` path đọc. Không bắt buộc migration Mongo.

### Repo

`recordSuccess` `$set lastSuccessAt: now`. `recordFailure` / `recordUnavailable` không đụng.

### Test

- `cycleMs` / `isCursorLagging` (Keno 8 phút, Lotto535 fixed).
- Fetch tick `parse_failed` với `lastSuccessAt` quá 2 chu kỳ → upsert alert `cursor_lag`.
- `recordSuccess` reset điều kiện (alert không lặp nếu đã kịp — dedupe key giữ, severity
  không tăng).

---

## P1 — Probe khi `parse_failed`

Không chờ N lần. Cùng invocation với kỳ `P`.

### Tách “fetch URL → parse” khỏi “cập nhật cursor”

`fetch-and-parse.ts`: hàm nội bộ `fetchParsePeriod(period): { outcome, parsed?, submissionId }`
tái dùng bước 4–5 (provider + parse + submission). `fetchAndParseOnce` gọi cho `P`; probe
gọi cho `P+1…` **không** `recordFailure`/`recordSuccess` cho tới khi chốt.

Trần walk: hằng `PROBE_MAX_PERIODS_PER_INVOCATION = 20` (budget 100s, ~1–2s/request).

### Bảng quyết định `P`

| Outcome `P` | Việc |
|---|---|
| `fetch_failed` | `recordFailure` + backoff. Không probe. `CursorLag` nếu kéo dài. |
| `parse_failed` | Walk `P+1…` (mỗi bước không `parse_failed` kiểu hệ thống — xem dưới). |
| `ok` / `period_gap` | Như hiện tại. |
| `result_unavailable` | P2. P1 giữ nguyên `recordUnavailable`. |

### Bảng quyết định từng bước probe `Q`

| `Q` | Hành vi |
|---|---|
| `ok` | Lỗ xác nhận. `recordSuccess` neo `Q` (`nextExpected = incrementPeriod(Q)`). Alert Critical `period_gap` payload `{ expectedPeriod: P, actualPeriod: Q, skippedFrom: P, skippedTo: decrementPeriod(Q) }`. `needsBackfill` không tắt (`recordSuccess` vốn không đụng). Burst tiếp (`runTick` đã coi `period_gap` như `ok`). |
| `parse_failed` **và** `Q === P+1` (bước đầu) | Parser/HTML hệ thống. Dừng walk. `recordFailure` trên `P`. Alert Critical `parse_failed` (hoặc type mới `parser_systemic`) “P và P+1 đều parse_failed”. Đếm cặp liên tiếp — ≥ 3 ⇒ `recordIntrinsicFailure(..., pause: true)` **hoặc** reuse `isPaused` với lý do rõ (JSDoc: không chỉ intrinsic checksum). |
| `parse_failed` **và** `Q > P+1` | Coi kỳ `Q` là lỗ tiếp (HTML kỳ đó hỏng, chưa kết luận cả site). Walk tiếp tới trần. Nếu **mọi** bước sau `P` đều `parse_failed` → dừng như hàng trên (hệ thống). |
| `result_unavailable` | Chưa đủ bằng chứng. Giữ pointer `P`. Backoff **nhẹ** `minIntervalMs` (không luỹ tiến 30 phút). P2 sẽ siết grace. |
| `fetch_failed` | Giữ `P`, backoff vận chuyển. Không skip. |

Chưa thấy `ok` hết trần → giữ `P`, alert Warning `period_gap` (hoặc `cursor_lag` payload
`probedAhead: 20`). Invocation sau lặp (cùng `P`).

Ví dụ Keno `0296759`–`61` mất, `0296762` còn: 1 invocation, vài giây.

### Rule — `packages/resultfeed/src/rules/period.ts`

Thêm `decrementPeriod(period)` — `Number - 1`, `padStart(period.length)`. Throw
`AppException` / error domain nếu `Number(period) <= 0`. Test cạnh `incrementPeriod`
(`"0296762"` → `"0296761"`, `"1000000"` length 7 → `"0999999"`).

### Test

- Fixture: `P` parse_failed + `P+1` ok → cursor neo `P+1`, 1 alert gap, 1 observation kỳ `P+1`.
- `P` và `P+1` parse_failed → không `recordSuccess`, pointer `P`, không fetch `P+2`.
- `P` parse_failed + `P+1` fetch_failed → không skip.
- Walk 3 lỗ rồi `ok` (mock provider theo URL/period).

---

## P2 — `unavailable` quá grace không còn giả mép live

`recordUnavailable` tắt `needsBackfill` = “đã đuổi tới mép”. Sai khi P không tồn tại nhưng
P+K còn.

### Điều kiện “trong grace”

`lastSuccessAt + 2 * cycleMs >= now` **hoặc** (chưa có `lastSuccessAt`) tick
`unavailable` **đầu tiên** sau một `ok`. Trong grace → `recordUnavailable` như cũ.

### Quá grace

Không gọi `recordUnavailable`. Cùng walk probe P1. `Q` `ok` → skip như P1.
`Q` `unavailable` → tiếp `Q+1` tới trần (khác P1: chuỗi “không tìm thấy” phía trước lỗ là
bình thường). `Q` `parse_failed` ở `P+1` ngay → không kết luận lỗ; giữ `P`, alert (trang
lạ, không phải marker). `Q` `fetch_failed` → dừng walk, backoff mạng.

### Test

- `unavailable` lần đầu sau success 1 phút (Keno) → `recordUnavailable`, `needsBackfill false`.
- `lastSuccessAt` 30 phút trước + `unavailable` → không tắt `needsBackfill`; probe `P+1`.
- Probe `P+1`/`P+2` unavailable, `P+3` ok → neo `P+3`.

---

## P3 — Skip to period (ops)

Thay Mongo tay trong GUIDE mục 3. Không dừng worker.

### Use-case

`packages/resultfeed-application/src/use-cases/sources/skip-to-period.ts` (hoặc
`use-cases/cursors/`):

Input: `{ sourceId, gameKey, firstAvailablePeriod }` (zero-pad, cùng độ dài cursor đang
lưu). Zod: string digits.

Server:

1. `findBySourceAndGameKey`. Không có cursor → `ensureCursor` rồi seed.
2. `lastConfirmedPeriod = decrementPeriod(firstAvailablePeriod)`,
   `nextExpectedPeriod = firstAvailablePeriod`.
3. `$set` giống GUIDE: failures 0, `needsBackfill true`, `isPaused false`,
   intrinsic 0, `nextFetchAt now`, `lastSuccessAt now` (ops xác nhận neo), `updatedAt now`.
4. Audit (`@megawin/audit`): actor, kỳ cũ, kỳ mới, dải bỏ
   `[oldNext, decrementPeriod(firstAvailable)]` nếu kéo tới / lùi.

Kéo lùi (GUIDE 3.1): cùng use-case, `firstAvailable < lastConfirmed` hiện tại — **cho phép**.
Upsert kỳ đã có là idempotent (GUIDE 3.1).

Preview (GET hoặc flag `dryRun`): trả `{ lastConfirmedPeriod, nextExpectedPeriod, skippedFrom, skippedTo, direction: "forward" | "rewind" }` không ghi.

**Không** gọi `seedAnchor()` hiện tại — method đó tắt `needsBackfill`. Hoặc sửa
`seedAnchor` thêm `needsBackfill?: boolean` mặc định `false` (cold start), Skip truyền
`true`. Ưu tiên **method mới** `skipToPeriod` để không đổi nghĩa cold-start.

### API backoffice — theo `07-admin-management-page.plan.md`

- `POST /api/resultfeed/cursors/skip` body `{ sourceId, gameKey, firstAvailablePeriod }`
  `.auth({ roles: [CompanyRole.Admin] })`.
- `POST …/skip/preview` cùng body, không ghi.
- UI: trang sources / periods — 1 form “Kỳ đầu còn trên site”, hiện preview dải bỏ,
  checklist (mở URL, đã dò P+1… không lấy kỳ live, rà vé). Không bắt buộc checkbox kỹ
  thuật nếu copy GUIDE đủ.

### CLI (tuỳ chọn, sau API)

Không `--force`. `tsx` gọi cùng use-case, bắt buộc `--period=`, có `--dry-run`.
`seed:cursors` giữ chỉ `lastConfirmedPeriod === null`.

### Test

- Skip `0296762` trên cursor `0296758/0296759` → `0296761/0296762`, `needsBackfill true`.
- Preview không ghi.
- Cold start (`lastConfirmedPeriod null`) + skip = seed có burst.
- Staff 403.

---

## File đụng (toàn bộ 4 phase)

| File | Phase |
|---|---|
| `packages/resultfeed/src/entities/source-cursor.ts` | P0 |
| `packages/resultfeed/src/entities/enums.ts` | P0 |
| `packages/resultfeed/src/rules/period.ts` + test | P1 |
| `packages/resultfeed-application/src/use-cases/fetch/schedule.ts` | P0, P2 |
| `packages/resultfeed-application/src/use-cases/fetch/fetch-and-parse.ts` | P0–P2 |
| `packages/resultfeed-application/src/infras/repos/source-cursor-repo.ts` + integration test | P0, P3 |
| `packages/resultfeed-application/src/infras/mappers/source-cursor-mapper.ts` | P0 |
| `packages/resultfeed-application/src/use-cases/sources/skip-to-period.ts` | P3 |
| `apps/backoffice` route + form cursor skip | P3 |
| `apps/worker-resultfeed/GUIDE.md` | P3 xong: mục 3 trỏ API, bỏ lệnh Mongo làm đường chính |

## Việc không làm (nhắc lại)

- `seed:cursors --force`
- Probe khi `fetch_failed`
- `recordUnavailable` khi quá grace (P2)
- Tiến cursor không có kỳ `ok`
- Walk 80 kỳ khi `P` và `P+1` cùng `parse_failed`
- Ghi observation giả cho kỳ skip (v1: chỉ alert + pointer)

## Xong khi nào

- P0: cursor kẹt bất kỳ lý do → Warning ≤ 2 chu kỳ Keno (~16 phút), không cần mở Mongo.
- P1: lỗ `parse_failed` 3 kỳ → skip trong 1 invocation, không backoff 30 phút.
- P2: “Không tìm thấy P” quá hạn + P+K còn → không tắt `needsBackfill`, lấy được P+K.
- P3: Admin skip/rewind không sửa Mongo tay; `needsBackfill true`.
