system: draw-sequential-settle-guard-removal (Analysis)

> Status: discussing · Ngày tạo: 06/09/2026
> Phạm vi: Keno + Bingo18 — bỏ guard settle/void tuần tự để hỗ trợ vận hành nhiều kỳ liên tiếp (~119-158 kỳ/ngày)

## 0. Bối cảnh & câu hỏi gốc

Vận hành Keno/Bingo18 hiện tại: mỗi kỳ chỉ xử lý được tuần tự (mở bán → đóng bán → công bố KQ →
kết sổ), do guard `findUnfinishedDrawBefore` chặn settle/void kỳ T nếu còn kỳ T-1 chưa hoàn thành.
Với tần suất cao (Keno ~119 kỳ/ngày, Bingo18 ~158 kỳ/ngày), khi cần kết sổ dồn 8-10 kỳ/giờ, thao
tác tuần tự bắt buộc gây chậm trễ vận hành đáng kể. Câu hỏi đặt ra: Keno/Bingo18 không có Jackpot
(khác Lotto535/Mega645/Power655) — liệu guard này có phải ràng buộc tài chính thật, hay chỉ là quy
tắc vận hành có thể nới lỏng an toàn?

## 1. Kết luận chính

**Guard "settle tuần tự" đối với Keno/Bingo18 là RÀNG BUỘC VẬN HÀNH, KHÔNG phải ràng buộc dữ liệu
tài chính thật.**

Bằng chứng:

1. Guard được thêm bởi 1 commit duy nhất (`fa4cf378`) áp dụng đồng loạt cho cả 7 game (kể cả
   game không có jackpot: Keno, Bingo18, Max3D, Max3DPro) cùng lúc, dùng đúng 1 method
   `findUnfinishedDrawBefore`. Message commit: "enforce sequential settling... enhancing data
   integrity and user experience" — không hề nhắc jackpot/rollover ở bất kỳ đâu, kể cả ở 3 game
   CÓ jackpot.

2. Toàn bộ pipeline settle của Keno/Bingo18 (`calculate-financials.ts`, `settle-entries.ts`,
   `apply-payout-caps.ts`, `finalize-settle.ts`) chỉ đọc/ghi dữ liệu scoped đúng `drawId` hiện
   tại — không có field carry-over/cumulative nào giữa 2 kỳ. Khác hẳn `JackpotCycleDoc`
   (`jp1Current`/`jp2Current`) của Power655/Mega645/Lotto535 — nơi giá trị kỳ sau THẬT SỰ phụ
   thuộc kỳ trước (rollover khi chưa có winner).

3. Daily aggregate theo `financialDate` (`system_settle_game_daily`) là phép SUM idempotent,
   re-aggregate lại từ đầu mỗi lần chạy — không cần thứ tự đúng để ra kết quả đúng, chỉ cần đủ
   dữ liệu (self-healing).

## 2. Vị trí implement guard

```295:324:packages/game-keno-application/src/infras/repos/draw-repo.ts
async findUnfinishedDrawBefore(drawId: string): Promise<DrawEntity | null> {
  return await this.findOne(
    {
      drawId: { $lt: drawId },
      status: { $in: [...DRAW_UNFINISHED_STATUSES] },
    },
    { sort: { drawId: -1 }, projection: { drawId: 1, status: 1 } },
  );
}
```

Bingo18 giống nguyên văn (`packages/game-bingo18-application/src/infras/repos/draw-repo.ts:303-314`).
Query global (không filter tenant/financialDate) trên toàn collection `keno_draws`/`bingo18_draws`.

Guard được gọi ở 2 nơi cho mỗi game:

- `TriggerSettleUseCase.execute()` — `packages/game-keno-application/src/use-cases/draws/trigger-settle.ts:54-60`,
  error code `DRAW_SETTLE_ORDER`.
- `VoidDrawUseCase.execute()` — `packages/game-keno-application/src/use-cases/draws/void-draw.ts:72-77`,
  error code `DRAW_VOID_ORDER`.

Tương đương tại `packages/game-bingo18-application/src/use-cases/draws/{trigger-settle,void-draw}.ts`.

Sự cố thật đã ghi nhận trong `.cursor/analysis/system-draw-result-auto-import.analysis.md` §3.7:
1 kỳ Keno bị quarantine lúc 07:16 khiến 112 kỳ liên tiếp (07:24-21:52) publish được nhưng KHÔNG
kỳ nào settle được — "1 lỗi = 1 ngày chết".

## 3. Đánh giá rủi ro concurrency khi bỏ guard

| Vùng dữ liệu | Có race khi bỏ guard? | Mức độ | Lý do |
|---|---|---|---|
| Ví/balance player | Không | — | Không đồng bộ; settle chỉ ghi `payout` vào entry doc, tiền thật đi qua outbox `tenant_dispatch_orders` → worker riêng gọi `tenantGateway.batchTransaction`, dedupe theo `tx` |
| Exposure cross-draw player/tenant | Không (gap thiết kế đã có từ trước) | — | Không tồn tại cơ chế gate exposure cộng dồn nhiều draw; đây không phải hệ quả của việc bỏ guard |
| `ticket_entries`/`ticket` (1 ticket trải nhiều draw, tối đa 20 kỳ) | Có, nhưng đã có bảo vệ sẵn | Thấp | `SyncTicketSummariesUseCase` dùng filter `$expr: {$lte: [{"$ifNull":["$progress.settledDraws",0]}, processedCount]}` chặn regression khi nhiều draw của cùng ticket settle song song (`ticket-repo.ts:169-179`) |
| Payout caps (Keno, bậc 8/9/10) | Không | — | Cap scoped tuyệt đối theo `drawId` (`maxPerDraw`), không cumulative theo ngày. Bingo18 không có payout cap |
| `system_settle_game_daily`/`system_settle_tenant_daily` (theo `{financialDate, gameProduct}`) | CÓ — TOCTOU giữa nhiều luồng ghi | Trung bình | `upsertGameDaily` là read-aggregate-rồi-overwrite, không optimistic lock. Tự sửa ở lần settle kế tiếp (self-healing vài phút) nhưng dashboard hiển thị sai tạm thời |
| Global lock cho settle | Không có — guard tuần tự hiện tại là LỚP BẢO VỆ CONCURRENCY DUY NHẤT | — | Không có `DistributedMutex` nào dùng cho settle lần đầu (chỉ dùng cho resettle, scoped theo 1 draw) |
| Double-trigger CÙNG 1 draw | Không — đã bảo vệ đủ 3 lớp, độc lập với guard tuần tự | — | (1) atomic CAS `findOneAndUpdate({drawId, status: Published})`, (2) `DistributedMutex` cho resettle, (3) SFN execution name deterministic → `ExecutionAlreadyExists` |

### 3.1. Phát hiện quan trọng về resettle

`TriggerResettleUseCase` (`packages/game-keno-application/src/use-cases/draws/trigger-resettle.ts:65-244`)
KHÔNG có guard `findUnfinishedDrawBefore` — resettle đã không bị ràng buộc tuần tự liên-draw từ
trước. Guard duy nhất là `DistributedMutex` với lock key `{game}:resettle:{drawId}`, scoped đúng
1 draw. JSDoc đầu file xác nhận đây là thiết kế có chủ đích (đồng nhất với settle lần đầu — cũng
không check gì thêm).

Tuy nhiên, resettle SFN (`apps/worker-keno/src/step-functions/resettle.ts:171-187`) dùng
`states:startExecution.sync:2` gọi lại TOÀN BỘ Settle SFN chính (`settle.ts:130-271`), bao gồm cả
bước `PublishSettleDaily` (dòng 203-210) và `PublishPlayerDaily` (dòng 212-222). Nghĩa là:

- Resettle của draw T CŨNG ghi vào đúng document `system_settle_game_daily{financialDate(T), game}`
  — là nguồn ghi THỨ 2 vào race daily rollup, không chỉ settle-lần-đầu.

### 3.2. Phát hiện quan trọng về void

Void KHÔNG chỉ transition status đơn thuần. Void SFN
(`apps/worker-keno/src/step-functions/void.ts`) có thứ tự:
`BuildVoidReport → PublishSettleDaily (REUSE) → PublishPlayerDaily → FinalizeVoid`.

Comment ASL: "Re-aggregate system daily reports. Settle totals tự giảm khi settle reports đã xoá."
→ Void CŨNG tham gia vào daily rollup giống settle — là nguồn ghi THỨ 3 vào cùng document.

**Kết luận tổng hợp:** optimistic lock cho `system_settle_game_daily`/`system_settle_tenant_daily`
phải thiết kế chịu được 3 nguồn ghi đồng thời (settle lần đầu, resettle, void), bất kỳ tổ hợp nào,
miễn cùng `financialDate` — không chỉ 2 settle như giả định ban đầu. Với tần suất Keno/Bingo18, khi
bỏ guard tuần tự, khả năng có ≥2 luồng chạy đồng thời trong cùng ngày tài chính tăng đáng kể.

Void chỉ đổi `status`/`voidInfo`/`voidSummary` của CHÍNH draw T — không đụng dữ liệu draw T-1, nên
việc bỏ `DRAW_VOID_ORDER` không gây sai lệch dữ liệu per-draw của kỳ trước.

## 4. Quyết định đã chốt (06/09/2026)

1. Bỏ hoàn toàn guard tuần tự bắt buộc (`DRAW_SETTLE_ORDER` + `DRAW_VOID_ORDER`) cho Keno và
   Bingo18 CHỈ — không đụng 5 game còn lại (đều có jackpot/rollover thật).
2. Thay bằng concurrency cap ở tầng orchestration: tối đa 5 kỳ settle/void đồng thời qua bulk API
   mới (không phải business guard trong use-case).
3. Vá race daily rollup (optimistic lock, version/counter-based) là điều kiện BẮT BUỘC làm TRƯỚC
   khi bỏ guard — phải chịu được 3 nguồn ghi (settle, resettle, void).
4. Bulk API làm cả settle-batch VÀ void-batch cùng lúc (không tách làm 2 giai đoạn).
5. Resettle không cần thay đổi gì ở guard (đã sẵn không có ràng buộc liên-draw) — chỉ hưởng lợi
   gián tiếp từ việc vá race daily rollup ở Phase 0.

## 5. Nghiên cứu thiết kế trang Multi-Draw Monitor (`operations-hub`)

### 5.1. Hiện trạng 2 trang đang có — vì sao KHÔNG đủ cho vận hành nhiều kỳ

**`/games/keno/draws`** (`apps/backoffice/src/app/(main)/games/keno/draws/page.tsx`): chỉ có 2 khối
— (1) 1 card "kỳ đang mở" (`KenoPrimaryDrawCard`) + vài card queue đơn giản không KPI/alert
(`KenoQueueDrawCard`), poll 15s; (2) `DrawHistorySection` — bảng LỊCH SỬ đã settle (page-based,
KHÔNG cursor, KHÔNG checkbox chọn nhiều dòng, KHÔNG bulk action), click 1 dòng chỉ điều hướng sang
`/operations?drawId=...`. Đây là bảng tài chính nhìn lại, không phải bảng giám sát real-time nhiều
kỳ đang chạy song song.

**`/games/keno/operations`**: thiết kế 100% cho **1 draw tại 1 thời điểm** — `DrawSelector` dropdown
đổi `drawId` trong URL, toàn bộ KPI/exposure/alert/analytics bên dưới render lại cho đúng 1 draw đó.
Không có khả năng xem 5-10 draw cùng lúc trên 1 màn hình.

**Kết luận:** cần trang thứ 3 thật — không phải mở rộng 2 trang hiện có, vì cả hai đều được thiết
kế xoay quanh "đúng 1 draw", trái ngược hoàn toàn với yêu cầu "N draw cùng lúc, so sánh song song".

### 5.2. Khối dữ liệu đã có sẵn — tái dùng, KHÔNG xây lại

| Khối | Vị trí | Trạng thái |
|---|---|---|
| Danh sách draw active/future/recent | `GetDrawSelectorUseCase` → `DrawRepository.getUnfinishedDraws()` (`packages/game-keno-application/src/use-cases/operations/get-draw-selector.ts:26-67`) | Tái dùng nguyên, đây đúng là nguồn "N draw đang mở" |
| Exposure/cap-sets theo 1 draw | `GetOpsSnapshotUseCase` (`.../get-ops-snapshot.ts:37-122`) — trả `SnapshotCappedExposure` (`worstCaseByPlayType`, `worstCaseTotal`) + `alertCounts: {new, critical}` | Đã tính đúng theo `drawId`, chỉ thiếu bản gọi HÀNG LOẠT nhiều `drawId` |
| Alert model | `OpsAlertBase.drawId` (`packages/game-core/src/types/ops-alert.ts:42-44`) — mỗi alert LUÔN gắn đúng 1 draw, severity 3 cấp (`Info/Warning/Critical`), status 3 cấp (`New/Ack/Resolved`) | Đã đúng cấu trúc cần cho badge "N alert" trên mỗi dòng Queue Table |
| 6 loại alert Keno | `KenoOpsAlertType` (`packages/game-keno/src/entities/ops-alert.ts:20-35`): `large_bet`, `exposure_threshold`, `sidebet_skew`, `cap_sets_near`, `combo_concentration`, (`revenue_anomaly`, `settle_stuck` để dành) | Dùng để tô màu/nhãn badge alert trên Queue Table |
| Lifecycle stepper + action bar per draw | `LifecycleStepper`/`getDrawLifecycleSteps` (`apps/backoffice/src/components/games/shared/draw-lifecycle-stepper.tsx`) + `DrawCommandCenter` per game (VD `bingo18/operations/_lib/sections/draw-management/draw-command-center.tsx`) | Tái dùng 100% làm nội dung Detail Panel (slide-in) — KHÔNG viết lại action button, badge màu theo status, overdue banner |

### 5.3. Khối cần xây mới (gap thật)

1. **`DrawSelectorItem` chưa có field KPI/exposure/alert** (`draw-selector.dto.ts:10-51` chỉ có
   id + status + timestamp) — cần DTO mới `MonitorDrawRow extends DrawSelectorItem` với thêm
   `entryCount`, `totalStakeAmount`, `exposureTotal`, `alertCounts: {warning, critical}`.
2. **Use-case batch mới** `GetMonitorQueueUseCase` (per game) — lấy danh sách active draws từ
   `getUnfinishedDraws()`, rồi chạy song song (`Promise.all`, giới hạn concurrency) snapshot/alert
   cho từng `drawId`, trả về `MonitorDrawRow[]`. KHÔNG sửa `GetOpsSnapshotUseCase` — gọi lại nó
   nhiều lần hoặc viết truy vấn gộp tối ưu hơn (batch `$in: drawIds` cho các query aggregate) nếu
   N draw lớn ảnh hưởng hiệu năng — quyết định kỹ thuật này để lúc code, không chốt trước.
3. **`ListAlertsInput` hiện chỉ nhận 1 `drawId`** (`dto/alerts.dto.ts:9-15`) — cần mở rộng nhận
   `drawId[]` (hoặc thêm use-case list-alerts-batch riêng) để badge alert trên Queue Table không
   phải gọi N request riêng lẻ.
4. **UI Queue Table + bulk action + Detail Panel** — hoàn toàn mới, chưa có tiền lệ nào trong 2
   trang hiện tại có checkbox chọn nhiều dòng.

### 5.4. Đề xuất layout trang `/games/{game}/operations-hub`

```
Zone 1 — PageHeader: tên game + subtitle "Giám sát nhiều kỳ" + toggle Auto-Pilot (Phase 4, ẩn ở Phase 3)
Zone 2 — KPI Strip tổng hợp: tổng số kỳ active · tổng entries · tổng stake · tổng exposure ·
         số alert critical đang mở (toàn hệ thống, không phải 1 draw)
Zone 3 — Queue Table (trung tâm trang):
         [checkbox] [drawId+giờ] [mini lifecycle badge] [entries] [stake] [exposure]
         [alert badge: 🔴N 🟡N] [action nhanh: Đóng bán/Công bố/Kết sổ tuỳ trạng thái]
         — checkbox chọn nhiều dòng → bulk action bar nổi lên trên: "Kết sổ N kỳ đã chọn" /
           "Huỷ N kỳ đã chọn" (gọi bulk API Phase 2, concurrency cap 5)
         — sort/filter: theo status, theo alert (chỉ hiện kỳ có alert), theo exposure giảm dần
Zone 4 — Detail Panel (slide-in từ phải, KHÔNG phải trang riêng):
         click 1 dòng → mở panel tái dùng NGUYÊN `DrawCommandCenter` + `LifecycleStepper` +
         `ExposureCard` hiện có của trang operations — không phải build lại, chỉ đổi container
         từ full-page thành Sheet/Drawer
```

**Nguyên tắc thiết kế:** Queue Table là màn hình CHÍNH (bao quát N kỳ), Detail Panel là lớp phụ
(soi sâu 1 kỳ khi cần) — đảo ngược đúng vai trò so với trang `operations` hiện tại (nơi 1 draw là
chính, không có khái niệm "N kỳ cùng lúc"). Theo `operations-page-ui.mdc` cho token màu/spacing/
font-size khi build Zone 2 (KPI Strip) và badge, nhưng Zone 3 (Queue Table) là pattern MỚI không
có trong rule đó — cần bổ sung rule riêng khi implement thật (không tự chế token mới ngoài spacing
scale `4/8/12/16/24/32/48` đã quy định).

## 6. Việc cần làm (tham chiếu plan thực thi)

Xem plan chi tiết trong `.cursor/plans/` (Phase 0-3): vá optimistic lock daily rollup trước, sau
đó xoá guard trong `trigger-settle.ts`/`void-draw.ts` của 2 game, thêm bulk settle/void API với
concurrency limiter, và trang Multi-Draw Monitor mới (`/games/{game}/operations-hub`, thiết kế chi
tiết ở §5) để khai thác khả năng xử lý nhiều kỳ không tuần tự này.
