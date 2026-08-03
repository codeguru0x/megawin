# Bingo 18 — Stats Worker Simplification (Analysis)

> **Status:** `approved` (mọi câu hỏi mở đã chốt — §6) · **Ngày:** 02/08/2026 (cập nhật 03/08/2026 — worker-health + chốt quyết định)
> **Nguồn tham chiếu:**
> - Analysis mẫu (Keno): `.cursor/analysis/keno-stats-worker-simplification.analysis.md` — khuôn §5 + §7 port
> - Worker health (đã ship): `.cursor/analysis/system-worker-health.analysis.md` (§5.7 — `recordStalledItem`/`clearStalledItem` thay `worker_stuck`) + `.cursor/plans/system-worker-health/`
> - Analysis gốc Bingo 18: `.cursor/analysis/bingo18-operations-risk-control.analysis.md`
> - Plan scale-hardening: `.cursor/plans/bingo18-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md`
> - Source đã đọc (02/08/2026): `apps/worker-bingo18/src/handlers/stats/stats-sync.ts`, `functions/stats.yml`,
>   `packages/game-bingo18-application/src/use-cases/operations/{sync-betting-stats,stats-accumulator,evaluate-alerts}.ts`,
>   `packages/game-bingo18-application/src/infras/repos/{betting-stats,entry}-repo.ts`, `use-cases/void/finalize-void.ts`,
>   `packages/game-bingo18/src/entities/betting-stats.ts`, `packages/game-bingo18/src/indexes/index.ts`
> - **Worker-core đã tái cấu trúc (03/08/2026 — `done`, xem `.cursor/plans/worker-core-usecase-restructure/`):**
>   `LockedWorkerUseCase → SingleRunWorker`, `TickLoopWorkerUseCase → TickLoopWorker`,
>   `BusinessLockCoordinator → DistributedMutex`. Machinery stalled-items tách ra `StalledItemTracker`
>   bằng composition — **API subclass `recordStalledItem`/`clearStalledItem` GIỮ NGUYÊN**. Import subpath
>   PHÂN TẦNG: `extends TickLoopWorker`/`SingleRunWorker` từ **`@megawin/worker-core/workers`** (kèm type
>   `TickLoopResult`/`TickOutcome`); `DistributedMutex` từ `@megawin/worker-core/locks`. Doc này DÙNG tên
>   canonical mới; body đã cập nhật. (Path cũ `@megawin/worker-core/use-cases` còn back-compat nhưng KHÔNG dùng khi port.)

## 1. Bối cảnh & mục tiêu

Keno đã hoàn tất 2 bước tiến hoá worker: **(1) p2-01 scale-hardening** (`$inc` delta + watermark per-doc + `findNotFinal` + xoá recompute) rồi **(2) simplification** (tách worker sync/alert, nâng tick-loop lên `worker-core`, đóng sổ drained+terminal, normalize ở mapper). Bingo 18 **chưa làm cả hai** — nên analysis này định nghĩa đường đi cho Bingo 18 **gộp cả 2 bước** thành 1 lần port, dùng Keno làm chuẩn.

Ràng buộc Bingo 18: game **quay nhanh nhất hệ thống** (~6 phút/kỳ, ~160 kỳ/ngày → D lớn nhất), vé multi-draw tối đa 20 kỳ → kỳ `Scheduled` xa vẫn nhận entry. Hot path place-bet không chạm; backoffice đọc pre-aggregated; alert-driven.

**Kết luận trước (tóm tắt):** kiến trúc dữ liệu (1 doc/kỳ, exposure 216 CHÍNH XÁC tính ở tầng đọc) là ĐÚNG, giữ nguyên. Cái cần đổi: **mô hình ghi `$set` full → `$inc` delta** + **tách alert khỏi write path** + **DRY tick-loop**. Bingo 18 là **ứng viên sạch nhất** cho hướng này vì doc nhỏ (38 bucket cố định ~2–3KB), KHÔNG combo/pair, KHÔNG collection phụ.

## 2. Vòng đời 1 kỳ Bingo 18 — dòng dữ liệu thật

```
Scheduled ──► SalesOpen ──► SalesClosed ──► Published ──► Settling ──► Settled  (TERMINAL)
              ▲   ~6 phút        │                                       hoặc
              └─────────────────┘ (mở bán lại — kiểm open-sales.ts)  Voiding ──► Void (TERMINAL)
```

3 sự thật quyết định thiết kế (đọc kỹ — GIỐNG Keno):
1. **Entries không chỉ đến trong cửa sổ 6 phút** — vé multi-draw tạo entry cho mọi kỳ ngay tại place-bet. D = vài chục → >100. Mọi chi phí per-tick nhân D. Bingo 18 kỳ nhanh nhất → **D lớn nhất 4 game**.
2. **`SalesClosed` KHÔNG terminal** (cần đọc `open-sales.ts` Bingo 18 xác nhận có cho `SalesClosed → SalesOpen`). Chỉ `Settled`/`Void` là điểm không quay lại.
3. **Kỳ nhảy nhiều status giữa 2 tick** → hàng đợi phải là trạng thái CÔNG VIỆC (`final:false`), không suy từ `draw.status`.

Dòng dữ liệu ops Bingo 18 (đơn giản hơn Keno — chỉ 1–2 collection):
```
place-bet ──insert──► bingo18_ticket_entries  (insert-only, _id = watermark tự nhiên)
                            │  worker đọc watermark per-draw, loại status:Void tại nguồn
                            ▼
              ┌─ bingo18_draw_betting_stats  (1 doc/kỳ: totals, byPlayType 38 bucket, topPotential)
   $inc +     └─ bingo18_draw_account_stats  (MỚI — nguồn topAccounts chính xác, thay topAccounts in-doc)
   watermark                 │  (đọc; exposure 216 tính ở tầng đọc, KHÔNG lưu doc)
                            ▼
              evaluateAlerts (pure) ──upsert dedupeKey──► bingo18_ops_alerts ──► badge/panel
```

## 3. Hiện trạng — code thật 02/08/2026 (KHÔNG phỏng đoán)

Bingo 18 đang ở **mô hình `$set` full-doc + recompute + alert inline = Keno PRE-refactor**. Bằng chứng:

| # | Điểm | Hiện trạng Bingo 18 | Keno đích |
|---|---|---|---|
| H1 | Mô hình ghi | `upsertFull` = `updateOne({drawId}, {$set: snapshot}, {upsert:true})` — ghi đè TOÀN doc mỗi tick | `applyDelta` `$inc` path + `$set lastEntryId` cùng lệnh |
| H2 | Accumulator | Seed baseline từ doc rồi cộng dồn full state RAM (`seed()` nạp top-K) | Delta-only, KHÔNG seed → không drift |
| H3 | Safety-net | `recomputeClosedDraws` (cursor init `undefined` mỗi lần, full RAM) + `POST_CLOSE_STATUSES` gồm `Voiding` | XOÁ — 1 thuật toán, đóng sổ drained+terminal |
| H4 | Hàng đợi | Suy từ `getUnfinishedDraws([SalesOpen])` + recompute status | `findNotFinal()` trên stats doc |
| H5 | Alert | `evaluateDrawAlerts` gọi **inline trong `syncOpenDraws`** sau `upsertFull` (write path) | Worker `ops-alerts` riêng, cursor `updatedAt` |
| H6 | Tick loop | Copy thủ công `while(deadline){runTick;extendLock;sleep}` trong use-case | `TickLoopWorker` (worker-core, import `@megawin/worker-core/workers`) |
| H7 | try/catch per-draw | **KHÔNG** — 1 kỳ lỗi sập cả invocation | try/catch per-draw + trần entries/kỳ/tick |
| H8 | repo methods | Chỉ `getByDrawId`/`getManyByDrawIds`/`upsertFull` (không projection) | + `findNotFinal`/`applyDelta`/`ensureDocs`/`stampFinal` (thin projection) |
| H9 | Index | `betting_stats` chỉ `{drawId:1}` unique; KHÔNG `{final:1}`/`{updatedAt:1}` | + `{final:1}` (queue) + `{updatedAt:1}` (alert cursor) |
| H10 | `topAccounts` | Field `@deprecated` in-doc, top-K tích lũy → **drift** | Tách `*_draw_account_stats` `$inc` |
| H11 | handler JSDoc | Nhắc `recomputeFull` (comment stale — method thật `recomputeClosedDraws`) | JSDoc mô tả đúng watermark + đóng sổ |

**ĐÚNG sẵn — giữ nguyên khi port:** watermark per-draw (`acc.lastEntryId`); conditional write (ETag/304); `getEntriesForStatsAfter` loại `status:Void` tại nguồn + có projection + có `limit`; exposure 216 tính ở tầng đọc (KHÔNG lưu doc); `finalize-void` KHÔNG chạm stats; `evaluate-alerts` là **pure function** (chỉ cần chuyển caller sang worker riêng).

## 4. Phân tích — 8 quyết định đúng của Keno (K1–K8) áp cho Bingo 18

Đối chiếu từng quyết định nền móng Keno với thực tế Bingo 18 để biết "port cái gì":

| Keno | Bingo 18 hiện tại | Việc phải làm |
|---|---|---|
| **K1** Delta-only accumulator | ❌ còn `seed()` baseline | Bỏ `seed()` → accumulator xuất **delta các chiều** (totals, 38 bucket byPlayType, topPotential entry mới) |
| **K2** Watermark per-doc (`$inc`+`$set lastEntryId` 1 lệnh, `$lt` no-op) | ⚠️ có watermark per-draw nhưng ghi qua `$set` full | Chuyển sang `applyDelta` `$inc` — 38 bucket path cố định + `byTenant` dynamic bounded |
| **K3** Hàng đợi `final:false`, stamp final chỉ ở Settled/Void + drained | ❌ suy từ status + recompute | `findNotFinal` + `stampFinal(drawId)` khi drained + terminal |
| **K4** Loại void tại nguồn đọc | ✅ đã có | Giữ nguyên |
| **K5** Counter phái sinh `$set` tuyệt đối | N/A (Bingo 18 không có `accountCount` combo) | Nếu tách `account_stats`: `uniquePlayers = countDocuments` (số thật) |
| **K6** Xoá recompute — 1 thuật toán | ❌ còn `recomputeClosedDraws` | **XOÁ** (điểm khác nghĩa: với `$inc`, recompute rescan-từ-đầu sẽ **cộng đôi**) |
| **K7** Trần + extendLock trong vòng + try/catch per-draw | ⚠️ extendLock sau tick (OK vì budget<ttl), **thiếu** trần + try/catch | Thêm trần entries/kỳ/tick + try/catch per-draw |
| **K8** Projection thin | ❌ `getManyByDrawIds` full doc | `findNotFinal` projection `{drawId,lastEntryId,final}` |

### 4.1. Đặc thù Bingo 18 làm việc port DỄ hơn Keno

- **Doc nhỏ, shape cố định 38 bucket** → `$inc` path sạch, KHÔNG có `numberFreq` 80 path / combo array như Keno. `applyDelta` chỉ đụng bucket có cược trong tick.
- **KHÔNG combo/pair** → KHÔNG `combo_stats`/`combo_accounts`/`findConcentrated` — bỏ toàn bộ nhóm rủi ro R1/R2 Keno. Chỉ còn 1 collection phụ tùy chọn (`account_stats` cho topAccounts).
- **Alert pure sẵn** (`evaluateBingo18Alerts`) → tách worker chỉ là **đổi caller** (từ `syncOpenDraws` → worker `ops-alerts` mới), không viết lại logic.

### 4.2. Điểm code quality cụ thể (phát hiện 02/08/2026)

| # | Vấn đề | File | Mức |
|---|---|---|---|
| Q1 | JSDoc handler nhắc `recomputeFull` (không tồn tại; method thật `recomputeClosedDraws` sẽ bị xoá) | `stats-sync.ts` handler | 🟠 |
| Q2 | `byPlayType.*.entries` per-board "xấp xỉ" (giống Keno Q3) — kiểm UI Bingo 18 có hiển thị không; nếu không → xoá field | `stats-accumulator.ts`, entity | 🟡 |
| Q3 | `topAccounts` `@deprecated` in-doc còn drift → **CHỐT tách `bingo18_draw_account_stats`** (§5.7) | entity, adapter | 🟠 |
| Q4 | Kỳ lỗi lặp (data bẩn) chỉ log, không có tín hiệu sức khoẻ worker → dùng `recordStalledItem` của `worker-core` (**KHÔNG** khai alert `worker_stuck`) | `sync-betting-stats.ts` | 🟡 |

## 5. Đề xuất (verdict — theo khuôn §5 + §7 Keno)

### 5.1. ✅ P0 — Port mô hình `$inc` (gộp p2-01 vào lần này)

**Verdict: KEEP.** Đây là nền cho mọi bước sau. `upsertFull` → `applyDelta` (`$inc` 38 bucket path + `$set lastEntryId`); bỏ `seed()`; **xoá `recomputeClosedDraws`**. Repo thêm `findNotFinal`/`ensureDocs`/`stampFinal`, xoá `upsertFull`.

> ⚠️ **Cảnh báo §7 Keno áp trực tiếp:** khi port sang `$inc`, `recomputeClosedDraws` + `seed()` **phải bị XOÁ hoàn toàn**, KHÔNG "giữ cho chắc" — với `$inc` chúng **cộng đôi**. Nếu Bingo 18 có `resetFinal` (hiện KHÔNG có) cũng phải xoá.

### 5.2. ✅ P0 — Tách worker `ops-alerts` riêng

**Verdict: KEEP** (câu trả lời câu hỏi "tách alert không" = CÓ). Lý do coupling đã chết y Keno §4.2: sau `$inc` delta, alert cần số tích lũy → phải đọc lại stats doc từ DB → "data sẵn trong RAM" = 0. Worker `ops-alerts` mới: cursor `updatedAt`, `findChangedSince` → `evaluateBingo18Alerts` (pure, giữ nguyên) → `bulkUpsertByDedupe`. Cô lập lỗi 2 chiều. **Bonus Bingo 18:** kỳ nhanh (6 phút) → trễ alert ~20s (2 tick) vẫn thừa an toàn (staff có ~5 phút phản ứng), nhưng nên cân nhắc `tickSeconds` nhỏ hơn Keno vì kỳ ngắn hơn.

### 5.3. ✅ P0 — Nâng tick-loop lên `worker-core`

**Verdict: KEEP.** Dùng chung `TickLoopWorker` (import `@megawin/worker-core/workers`; Keno §5.2 tạo, đã ship). Bingo 18 sync + alert chỉ còn `runTick`. KHÔNG generic quá tay: base lo deadline/nhịp/gom kết quả; hàng đợi/watermark ở subclass.

### 5.4. ✅ P0 — Đóng sổ drained + terminal → final. Hết.

**Verdict: KEEP** (Keno §5.3). Mỗi tick, mỗi kỳ chưa final: drain `_id > watermark` → `$inc`; drained (batch cuối < READ_BATCH) VÀ status ∈ {Settled, Void} → `stampFinal`. KHÔNG rebuild, KHÔNG kiểm. **Rủi ro tồn dư watermark** (2 bet cùng giây, `_id` ≠ thứ tự commit → thiếu 1 vé) **CHẤP NHẬN CÓ CHỦ ĐÍCH** — ops-only, tiền không sai (settle đọc thẳng entries). Số chính thức kỳ đã đóng lấy từ `DrawDoc.financial`/`DrawDoc.stats` (JOIN lúc đọc). **KHÔNG viết `resetFinal`** (§5.3.1 Keno: flip `final` là no-op, "sửa" bằng reset watermark ⇒ cộng đôi).

### 5.5. ✅ P0 — Doc ghi tối thiểu + normalize ở mapper

**Verdict: KEEP** (Keno §5.5). `ensureDocs` chỉ `$setOnInsert {final:false, updatedAt}`; `$inc` tự tạo path 38 bucket còn thiếu; `BettingStatsMapper` deep-merge default (38 bucket zero-stat) lúc ĐỌC. Entity contract không đổi. Giải schema evolution triệt để, không migration.

### 5.6. ✅ P1 — `ensureDocs` 1 lần/invocation + dọn code quality (Q1–Q4)

**Verdict: KEEP.** Enroll ra khỏi tick (1 lần đầu invocation). Q1 sửa JSDoc; Q2 kiểm UI field `entries` → xoá nếu không hiển thị; Q3 chốt `account_stats` vs nhãn.

**Q4 — ĐỔI HƯỚNG 03/08/2026 (đã ship ở Keno + worker-core — đọc kỹ trước khi port):** ~~alert `worker_stuck`~~ → dùng
`this.recordStalledItem(drawId, error)` / `this.clearStalledItem(drawId)` của `SingleRunWorker`
(`worker-core`, **đã implement**). Nguồn: `.cursor/analysis/system-worker-health.analysis.md` (đã `approved`);
Keno analysis §5.7. Tên method thực tế là `recordStalledItem`/`clearStalledItem` (analysis system-worker-health
đề xuất tên `recordItemFailure` nhưng bản implement đổi thành `*StalledItem` cho khớp field `stalledItems`).

Lý do đổi: sức khoẻ worker là **trạng thái hạ tầng** (tự hết khi worker hồi phục, không thuộc kỳ nào),
còn `ops_alerts` là collection cho **sự kiện nghiệp vụ của 1 kỳ** (`drawId` bắt buộc, cần staff ack).
Keno từng định ship alert `worker_stuck` rồi hoàn nguyên vì 4 defect: badge đỏ vĩnh viễn
(`OpsAlertStatus.Resolved` không ai set), badge đếm global nhưng panel lọc per-draw, key thừa trong
`Record<{Game}OpsAlertType, boolean>` không consumer nào đọc, và streak reset mỗi invocation.

**Cụ thể Bingo 18 KHÔNG phải làm:** thêm member vào `Bingo18OpsAlertType`, thêm key vào `enabled`
default (`game-bingo18/src/rules/`) + zod schema backoffice, thêm label `ops-constants.ts`, thêm nhánh
render `alerts-panel.tsx`. **Bingo 18 hiện chưa có `worker_stuck`** (grep 0) → thuần ADD 2 dòng gọi base class
trong `runTick` (nhánh success `clearStalledItem`, nhánh catch SAU guard `LockTakenOverError` gọi
`recordStalledItem`), **không** try/catch bọc ngoài (API không có I/O nên không thể throw). Kèm khai
`protected readonly description` cho mỗi worker mới (nếu không, trang BO hiện `lockKey` kỹ thuật). Tín hiệu
hiển thị ở trang BO chung `/system/workers`.

Điều kiện tiên quyết: `system-worker-health/p0-01` (base method) + `p0-02` (Keno gỡ `worker_stuck`) — **cả hai đã có trong code**.

### 5.7. ✅ P0 — CHỐT: tách `bingo18_draw_account_stats` (user duyệt 03/08/2026)

**Quyết định (user chốt):** tách collection phụ `bingo18_draw_account_stats` y như Keno — "gọn database", hết drift `topAccounts`. KHÔNG chọn phương án giữ trong doc + nhãn.

- Entity + collection `bingo18_draw_account_stats`: `{drawId, accountId}` unique, `$inc amount/entries/sets`, index `{drawId:1, amount:-1}`, TTL 90d. Mẫu: `packages/game-keno/src/entities/account-stats.ts`.
- Accumulator: bỏ map `accounts` build top-K + bỏ `seed()` đọc `b.topAccounts`; thay bằng drain delta per-account → `bulkUpsertDelta` (mẫu Keno `drainAccountDeltas`).
- `get-ops-snapshot`: derive `topAccounts` bằng `sort({amount:-1}).limit(topAccountsK)` khi đọc. DTO/FE **không đổi** (vẫn nhận `TopAccountStat[]`). `uniquePlayers` = `countDocuments` (số thật) + có sẵn nguồn link outstanding per player/kỳ.
- Xoá dòng khai `topAccounts` trong `entities/betting-stats.ts` → compiler chỉ ra mọi chỗ còn ghi. `topAccountsK` trong `ops.stats` **giữ nguyên** (số phần tử cắt lúc đọc).

### 5.8. ✅ P0 — Worker health (phần worker MỚI nhất, dùng chung `worker-core`)

**Verdict: KEEP** — nguồn `.cursor/analysis/system-worker-health.analysis.md` (approved 03/08). Đây là hạ tầng **đã code xong** ở `worker-core` + Keno; Bingo 18 chỉ tiêu thụ:

- **`stalledItems` trên lock doc** thay `worker_stuck` alert: worker bắt lỗi per-item (K7) nên `runLocked` không throw → `lastError`/`lastSuccessAt` báo "khoẻ" trong khi kỳ kẹt. `SingleRunWorker` (qua `StalledItemTracker` composition) lấp lỗ đó bằng `stalledItems` (persist qua invocation, tự rỗng khi item hồi phục, flush trong `finalizeAndRelease` ⇒ **0 DB call thêm**).
- **2 method base (đã có):** `recordStalledItem(itemKey, error)` (nhánh catch, SAU guard `LockTakenOverError`) + `clearStalledItem(itemKey)` (nhánh success). Chỉ đụng RAM, KHÔNG throw ⇒ KHÔNG try/catch bọc.
- **`description`** (`protected readonly`, ghi bằng `$set`): mô tả worker cho trang BO `/system/workers`. Bingo 18 khai cho CẢ 2 worker (`stats-sync` + `ops-alerts`). Mẫu: `"Bingo 18 — đồng bộ thống kê cược theo delta (tick ~Ns, mọi kỳ đang mở)"`.
- **`kind: Worker`** tự động (base hardcode) — KHÔNG khai thủ công, KHÔNG thêm `WorkerLockKind` mới.
- **Trang BO** `/system/workers` đọc chung 9 worker → Bingo 18 tự xuất hiện sau khi khai `description`, KHÔNG cần code UI riêng.

Đây là phần **tiết kiệm lớn nhất** so với hướng cũ (3 game × 4 điểm chạm `worker_stuck`): Bingo 18 chỉ ADD ~3 dòng/worker.

## 6. Câu hỏi mở — ĐÃ CHỐT TOÀN BỘ (user duyệt 03/08/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | `open-sales.ts` Bingo 18 có `SalesClosed → SalesOpen`? | **CÓ** — mọi game đều cho mở bán lại. → `final` **CHỈ** stamp ở `Settled`/`Void` (đúng chốt Keno §5.3.2), không bao giờ ở `SalesClosed`. Xác nhận bug `final` sai nghĩa là THẬT nếu stamp sớm. |
| 2 | `topAccounts` tách collection hay giữ doc? | **TÁCH** `bingo18_draw_account_stats` (§5.7) — gọn DB, hết drift. |
| 3 | `byPlayType.*.entries` per-playtype xoá hay giữ? | **Kiểm UI** (analytics-panels Bingo 18) — nếu không component nào render → **XOÁ** khỏi `Bingo18BucketStat`/`*PlayTypeStat` (làm trong plan p1-01, đối chiếu consumer như Keno Q3). |
| 4 | `tickSeconds` default Bingo 18 | **GIỮ 10s** (user chốt) — không giảm. Alert trễ ~2 tick = ~20s vẫn thừa an toàn cho kỳ 6 phút. |
| 5 | Thứ tự 3 game | **Bingo 18 → Max 3D → Max 3D Pro** (Keno §7). |

→ **Status analysis: sẵn sàng lên plan.**

## 7. Plans phái sinh (tạo khi approved)

Đặt tại `.cursor/plans/bingo18-ops-risk-control/stats-worker-simplification/` (mirror cấu trúc Keno):

- `p0-01-port-inc-model.plan.md` — §5.1: `applyDelta` `$inc` 38 bucket + bỏ `seed()` + **xoá `recomputeClosedDraws`** + `findNotFinal`/`ensureDocs`/`stampFinal` + extends `TickLoopWorker` (import `@megawin/worker-core/workers`, base đã có) + `recordStalledItem`/`clearStalledItem` + `description` (§5.8).
- `p0-02-split-ops-alerts-worker.plan.md` — §5.2: worker `ops-alerts` riêng + index `{updatedAt:1}` + yml 2 function + `description` worker alert.
- `p0-03-account-stats-collection.plan.md` — §5.7: tách `bingo18_draw_account_stats` (`$inc`, index `{drawId,amount:-1}`, TTL 90d) + drain delta per-account + `get-ops-snapshot` derive topAccounts + xoá `topAccounts` khỏi entity.
- `p0-04-minimal-docs-read-defaults.plan.md` — §5.5 + §5.6: ensureDocs tối giản (`$setOnInsert {final,updatedAt}`) + mapper normalize 38 bucket + enroll 1 lần/invocation.
- `p1-01-code-quality.plan.md` — §5.6 Q1 (JSDoc handler) + Q2 (kiểm UI → xoá `byPlayType.*.entries` nếu không render) + `tickSeconds` giữ 10s.

**Phần PHẢI XOÁ khi port (§7 Keno):** `upsertFull`, `recomputeClosedDraws`, `seed()`, `POST_CLOSE_STATUSES`, `RECOMPUTE_PAGE_SIZE`, `topAccounts` in-doc. Mỗi method public repo phải trả lời "còn nghĩa gì trong mô hình `$inc`?" trước khi merge.

Thứ tự: **Bingo 18 (game đầu)** → max3d → max3dpro. Trong game: p0-01 → p0-02 → p0-03 → p0-04 → p1-01.

---

*Analysis này là living document — cập nhật khi plan phái sinh đổi trạng thái, theo `.cursor/analysis/README.md`.*
