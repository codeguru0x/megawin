# Keno — Stats Worker Simplification (Analysis)

> **Status:** `discussing` · **Ngày:** 02/08/2026
> **Nguồn tham chiếu:**
> - Analysis gốc: `.cursor/analysis/keno-operations-risk-control.analysis.md` (§3.3, §11)
> - Plan scale-hardening: `.cursor/plans/keno-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md`
> - Source đã đọc (02/08/2026): `apps/worker-keno/src/handlers/stats/stats-sync.ts`,
>   `packages/game-keno-application/src/use-cases/operations/{sync-betting-stats,stats-accumulator,evaluate-alerts}.ts`,
>   `packages/game-keno-application/src/infras/repos/{betting-stats,combo-stats,combo-accounts,entry,draw}-repo.ts`,
>   `packages/worker-core/src/use-cases/lock/single-run-worker.ts`, `apps/worker-keno/src/functions/stats.yml`
> - Đây là analysis **kế thừa** p2-01 (không thay thế): p2-01 sửa scale/correctness của đường GHI;
>   analysis này sửa **cấu trúc** để dễ đọc, dễ vận hành, và làm mẫu port sang bingo18/max3d/max3dpro.
> - **Đã cập nhật tên class 03/08/2026** (theo `.cursor/plans/worker-core-usecase-restructure/`) — doc
>   này DÙNG tên canonical mới. Ánh xạ nếu đọc code cũ: `LockedWorkerUseCase → SingleRunWorker`,
>   `TickLoopWorkerUseCase → TickLoopWorker`; file `locked-worker-use-case.ts` → `lock/single-run-worker.ts`,
>   `tick-loop-worker-use-case.ts` → `lock/tick-loop-worker.ts`; import qua subpath
>   `@megawin/worker-core/workers`.

## 1. Bối cảnh & câu hỏi đặt ra

Sau p2-01, worker `stats-sync` của Keno **đúng về nghiệp vụ và scale được**, nhưng user review lại
và đặt 3 câu hỏi:

1. **Code khó đọc, tính toán phức tạp** — có cách nào đơn giản hơn nữa không?
2. **Có nên tách alert và sync betting stats thành 2 worker riêng** trong `apps/worker-keno`?
3. **Làm sao đảm bảo dữ liệu đồng nhất & chính xác** — stats đúng, và biết chắc *kỳ nào cần tính*?

Ràng buộc không đổi: game quay nhanh (Keno 6–8 phút/kỳ, ~120 kỳ/ngày), hot path place-bet không
được chạm, backoffice chỉ đọc pre-aggregated, staff ít người → alert-driven.

**Kết luận trước (tóm tắt):** kiến trúc dữ liệu sau p2-01 là ĐÚNG và giữ nguyên. Cái cần sửa là
**cách tổ chức code**: 1 use case đang ôm 3 vai (điều phối tick/lock + sync data + đánh giá alert).
Tách alert ra worker riêng là **NÊN LÀM** — lý do gắn nó vào sync worker đã biến mất sau p2-01 (§4.2).

## 2. Vòng đời 1 kỳ Keno — dòng dữ liệu thật (nền tảng cho mọi quyết định)

```
        (staff tạo kỳ hàng loạt cho cả ngày — có thể ~120 kỳ Scheduled cùng lúc)
              │
Scheduled ──► SalesOpen ──► SalesClosed ──► Published ──► Settling ──► Settled  (TERMINAL)
              ▲   6–8 phút      │ 60s trước quay                          hoặc
              └─────────────────┘ (mở bán lại HỢP LỆ!)        Voiding ──► Void   (TERMINAL)
```

Ba sự thật quyết định thiết kế worker — **đọc kỹ trước khi port sang game khác**:

1. **Entries của 1 kỳ KHÔNG chỉ đến trong cửa sổ 6–8 phút của nó.** Vé multi-draw (tối đa 20 kỳ)
   tạo entry cho MỌI kỳ ngay tại place-bet (`auto-enroll-entries.ts` đã deprecated thành no-op).
   → Kỳ `Scheduled` xa hàng giờ vẫn nhận entry mới → **D (số kỳ cần theo dõi đồng thời) là vài chục
   đến >100, không phải 1**. Mọi chi phí per-tick phải nhân D.
2. **`SalesClosed` KHÔNG phải terminal** — `OpenSalesUseCase` cho phép `SalesClosed → SalesOpen`.
   Chỉ `Settled`/`Void` (= `DRAW_COMPLETED_STATUSES`) là điểm không quay lại. Mọi cờ "đã xong"
   đặt trên trạng thái tạm là bom hẹn giờ (p2-01 §3.5.2).
3. **Kỳ có thể nhảy nhiều status giữa 2 tick** (10s): `SalesClosed → Published → Settling` diễn ra
   trong vài giây khi kết quả về. → Hàng đợi việc KHÔNG được suy từ status draw; phải là trạng thái
   CÔNG VIỆC trên chính stats doc (`final: false`).

Dòng dữ liệu ops (derived, không phải source of truth tài chính):

```
place-bet ──insert──► keno_ticket_entries  (insert-only, _id tăng đơn điệu = watermark tự nhiên)
                            │  worker đọc theo watermark per-draw, loại status:Void tại nguồn
                            ▼
              ┌─ keno_draw_betting_stats   (1 doc/kỳ: totals, byPlayType, numberFreq, exposure…)
   $inc +     ├─ keno_draw_combo_stats     (1 doc/kỳ×combo: sets, amount, accountCount phái sinh)
   watermark  ├─ keno_draw_combo_accounts  (1 doc/kỳ×combo×account — chi tiết drill-down)
   per-doc    └─ keno_draw_account_stats   (1 doc/kỳ×account — nguồn topAccounts chính xác)
                            │  (đọc)
                            ▼
              evaluateAlerts (pure) ──upsert dedupeKey──► keno_ops_alerts ──► badge/panel backoffice
```

## 3. Hiện trạng — cái gì đã ĐÚNG (giữ nguyên, không đụng)

Đối chiếu code thực tế 02/08/2026, các quyết định sau của p2-01 đã vào code và **là nền móng đúng**:

| # | Quyết định | Ở đâu | Vì sao đúng |
|---|---|---|---|
| K1 | **Delta-only accumulator** — không seed baseline, không state cross-tick | `stats-accumulator.ts` | Không đọc baseline → không thể drift; RAM chặn ở `READ_BATCH` |
| K2 | **Watermark per-document** — `$inc` + `$set lastEntryId` cùng 1 lệnh, filter `$lt`, 11000 = no-op | 4 repo `bulkUpsertDelta`/`applyDelta` | Idempotent theo bản chất, tự hội tụ sau mọi crash, không cần transaction |
| K3 | **Hàng đợi = `final:false` trên stats doc**, chỉ stamp final ở `Settled`/`Void` + đã hút cạn | `findNotFinal` + `stampFinal` | Bền với mọi tốc độ chuyển status; không thể bỏ sót kỳ |
| K4 | **Loại void tại nguồn đọc** (`status: {$ne: Void}` trong query entries) | `getEntriesForStatsAfter` | Không có cơ chế "trừ bù"; số đã tích trước void là audit trail hợp lệ |
| K5 | **Counter phái sinh `$set` tuyệt đối** (`accountCount` đếm lại rồi ghi) | `syncAccountCounts` | `$inc` theo delta không thể idempotent khi delta nằm khác collection |
| K6 | **Xoá recompute** — 1 thuật toán duy nhất | p2-01 §3.5 | 2 code path cùng tính 1 con số = 1 trong 2 sẽ sai |
| K7 | Trần entries/kỳ/tick + trần kỳ/tick + `extendLock` TRONG vòng đọc + try/catch per-draw | `sync-betting-stats.ts` | Chống livelock, chống 2 writer, 1 kỳ lỗi không sập invocation |
| K8 | Projection thin theo đường thực thi (`listUnfinishedDrawIds`, `getStatusesByDrawIds`, `findNotFinal`) | `draw-repo.ts`, `betting-stats-repo.ts` | Chi phí idle O(D) bị chặn |

**KHÔNG mở lại các quyết định này.** Mọi "đơn giản hoá" mà phá 1 trong 8 điểm trên là quay lại
đúng các bug p2-01 đã trả giá để sửa.

## 4. Phân tích — phức tạp còn lại nằm ở đâu?

### 4.1. Bản đồ độ phức tạp

Đo trên code hiện tại (`sync-betting-stats.ts` 347 dòng + `stats-accumulator.ts` 344 +
`evaluate-alerts.ts` 234 + 5 repo):

| Lớp | Bản chất | Phức tạp | Có giảm được không? |
|---|---|---|---|
| (a) Điều phối: cron 1' + loop ~55s + sleep(tick) + lock TTL + budget | **Hạ tầng**, không dính gì Keno | Trung bình | ✅ **Nâng lên `worker-core`** — 4 game × 2 worker dùng chung (§5.2) |
| (b) Hàng đợi việc: ensureDocs → findNotFinal → statusByDraw → stampFinal | Nghiệp vụ điều phối | Thấp | Giữ — đây là phần ĐÚNG (K3) |
| (c) Drain entries theo watermark, ghi 4 collection đúng thứ tự | Nghiệp vụ ghi | Cao nhưng **có chủ đích** | Giữ — mỗi dòng đều là fix cho 1 bug thật (K2, K5). Chỉ gói gọn + đặt tên rõ |
| (d) Accumulator: cộng entry → delta các chiều | Nghiệp vụ thuần, pure | Trung bình | Giữ — pure + test được. Dọn 2 điểm nhỏ (§6) |
| (e) **Đánh giá alert trong write path**: đọc lại stats doc + query combo + evaluate + upsert | Nghiệp vụ ĐỌC, khác pha với (c) | Trung bình | ✅ **Tách worker riêng** (§5.1) |
| (f) Đối chiếu/kiểm chứng đúng đắn | — | **Chưa có** (p2-01 §3.5.6 "Còn lại") | ✅ Bổ sung 2 phép đối chiếu rẻ (§5.3) |

Kết luận: cảm giác "quá nhiều tính toán phức tạp" đến từ việc **(a) + (c) + (e) trộn trong 1 class**.
Phần tính toán cốt lõi (c)(d) không giảm được nữa mà không mất tính đúng — nhưng tách (a) và (e) ra
thì file còn lại chỉ còn đúng 1 câu chuyện: *"hút entries mới → ghi delta → đóng dấu final"*.

### 4.2. Vì sao alert đang nằm trong sync worker — và vì sao lý do đó đã CHẾT

Analysis gốc §3.5 chốt *"evaluator chạy ngay trong stats worker — data đã có sẵn trong memory,
chi phí ≈ 0"*. Điều đó đúng ở bản **pre-p2-01** (accumulator giữ full state của kỳ trong RAM).

Sau p2-01, accumulator là **delta-only** → alert cần số TÍCH LUỸ nên `evaluateDrawAlerts` phải
**đọc lại stats doc từ DB** (`sync-betting-stats.ts:314`) + query `findConcentrated`. Tức là:

- Lợi ích "data sẵn trong memory" = **0**. Alert giờ là consumer đọc DB như mọi consumer khác.
- Chi phí alert (đọc doc ~33KB + 1 query combo) đang **ăn chung budget 55s** với đường ghi —
  kỳ backlog lớn làm alert của kỳ khác trễ, và ngược lại rule alert chậm làm chậm nhịp sync.
- Lỗi ở evaluator (rule mới sai, payload lỗi) throw trong cùng try/catch per-draw → được đếm
  vào `failed` của sync, khó phân biệt "sync hỏng" với "alert hỏng" khi trực ca.

**→ Coupling này là di sản của thiết kế cũ, không còn lý do kỹ thuật.** Tách là đơn giản hoá
thật sự, không phải thêm moving part vô ích.

### 4.3. Điểm code quality cụ thể (phát hiện 02/08/2026)

| # | Vấn đề | File:dòng | Mức |
|---|---|---|---|
| Q1 | **Comment stale**: handler ghi "`recomputeFull` lúc salesClosed sửa chính xác tuyệt đối mọi sai lệch" — `recomputeFull` đã bị XOÁ ở p2-01. Vi phạm `code-quality-standards` §4 (comment sai tệ hơn không có) | `apps/worker-keno/src/handlers/stats/stats-sync.ts:13` | 🟠 |
| Q2 | `resolvePlayTypeStat` cast `this.byPlayType as unknown as Record<string, KenoPlayTypeStat>` — lỗ type: đổi tên key trong `KenoByPlayType` compiler không bắt được nhánh basic | `stats-accumulator.ts:283` | 🟡 |
| Q3 | `stat.entries += 1` per **board** với comment "xấp xỉ" — field tên `entries` nhưng ngữ nghĩa là "board-hits per playType". 1 entry có 3 board cùng playType → `entries` của playType đó +3. UI đọc field này sẽ hiểu nhầm | `stats-accumulator.ts:172` | 🟡 |
| Q4 | Kỳ lỗi lặp lại (data bẩn) chỉ `logError` — chiếm 1 slot trong `MAX_DRAWS_PER_TICK=50` mãi mãi, không ai biết nếu không đọc log. Thiếu tín hiệu sức khoẻ cho chính worker. **Giải bằng `worker-core` (§5.7), KHÔNG bằng alert nghiệp vụ** | `sync-betting-stats.ts:205` | 🟡 |
| Q5 | Đối chiếu `countDocuments` vs `totals.entries` (p2-01 §3.5.6) **chưa implement** — tính đúng đắn hiện "tin vào thiết kế", chưa quan sát được | — | 🟠 |

## 5. Đề xuất (đã re-review theo tiêu chí: đơn giản hơn / không mở lại bug cũ / port được cho 3 game)

### 5.1. ✅ P0 — Tách 2 worker: `stats-sync` (ghi) và `ops-alerts` (đọc + đánh giá)

**Verdict: KEEP — trả lời trực tiếp câu hỏi 2 của user, câu trả lời là CÓ.**

| | `stats-sync` (sau tách) | `ops-alerts` (mới) |
|---|---|---|
| Vai duy nhất | Chuyển dữ liệu: entries → 4 collection stats | Đánh giá: stats docs → so ngưỡng → upsert alert |
| Lock | `keno:stats-sync` (giữ nguyên) | `keno:ops-alerts` (riêng — 2 worker chạy song song) |
| Schedule | cron 1' + loop tick (giữ nguyên) | cron 1' + loop tick (cùng `ops.stats.tickSeconds`) |
| State | Watermark per-doc (đã có) | **Cursor = `updatedAt` lớn nhất đã đánh giá**, persist qua `setCursor` sẵn có của `SingleRunWorker` |
| Mỗi tick | ensureDocs → findNotFinal → drain → stampFinal | `findChangedSince(cursor)` = `{updatedAt: {$gt: cursor}}` → mỗi doc: đọc full + `findConcentrated` (nếu rule bật) → `evaluateAlerts` (pure, giữ nguyên) → `bulkUpsertByDedupe` → tiến cursor |
| Tính đúng | Idempotent theo watermark (K2) | **Idempotent tự nhiên**: evaluate là hàm thuần, upsert theo dedupeKey — đánh giá lại 1 doc N lần vô hại → cursor lùi/trùng không sao |

Vì sao thiết kế alert worker này ĐƠN GIẢN (không phải thêm phức tạp):

1. **Không watermark per-collection, không batch, không thứ tự ghi** — toàn bộ machinery khó của
   sync không xuất hiện ở đây. Worker mới ~100 dòng, đọc hiểu trong 1 lần.
2. **Trigger theo `updatedAt` của stats doc** — kỳ không có cược mới thì `updatedAt` đứng yên →
   0 lần đánh giá lại (giữ đúng tinh thần conditional-write của analysis gốc §3.3 bước 3).
   `stampFinal` cũng bump `updatedAt` → mỗi kỳ được đánh giá **1 lần chốt** sau terminal — bonus
   đúng chỗ để chạy phép đối chiếu §5.3.
3. **Cô lập lỗi 2 chiều**: rule alert mới có bug → sync vẫn chạy, số liệu dashboard vẫn tươi.
   Kỳ backlog lớn đang drain → alert các kỳ khác vẫn đúng nhịp.
4. **Độ trễ alert** = tick sync + tick alert ≈ 10s + 10s = ~20s worst-case — thừa an toàn cho chu
   kỳ 6–8 phút (staff có 5–7 phút phản ứng trước đóng cược).

Chi phí phải trả (chấp nhận, nhỏ):

- +1 Lambda + 1 lock doc + 1 file yml mỗi game. Không thêm collection.
- Index mới trên `keno_draw_betting_stats`: `{ updatedAt: 1 }` (single-field, phục vụ
  `findChangedSince`). Docs đã final không bao giờ update lại → phần index "nóng" luôn nhỏ.
- Alert đọc stats doc **full** (evaluator cần totals + exposure + byPlayType + topPotential —
  gần cả doc) — chi phí này hôm nay đã tồn tại trong sync worker, chỉ chuyển chỗ, và giờ chỉ
  trả cho doc THẬT SỰ đổi.

Điểm chuyển đi kèm (dọn `sync-betting-stats.ts`): xoá `evaluateDrawAlerts`, `AlertContext`,
`MAX_CONCENTRATED_COMBOS`, import `evaluateAlerts`/`OpsAlertRepository`/`ComboStatsRepository`
(chỉ còn dùng cho ghi delta) — use case sync còn ~250 dòng, đúng 1 câu chuyện.

### 5.2. ✅ P0 — Nâng "vòng lặp tick trong invocation" lên `worker-core`

**Verdict: KEEP — DRY đúng thời điểm.** Analysis gốc §8 nói "chỉ tách skeleton khi có game thứ 2"
— hiện đã có **4 bản copy** (keno/bingo18/max3d/max3dpro) của cùng đoạn `while (Date.now() <
deadline) { runTick(); sleep(remaining); }` + budget + giữ nhịp. Sau §5.1 sẽ thành **8 bản** (2
worker × 4 game). Đây không còn là "đoán mò abstraction" mà là gom code trùng có thật.

Thiết kế: class mới `TickLoopWorker<I, O>` trong `packages/worker-core/src/use-cases/lock/`,
extends `SingleRunWorker`:

```
subclass khai báo:  budgetMs (default 55_000) · resolveTickMs(input) · runTick(input)
base lo:            vòng lặp deadline, giữ nhịp đều tick (trừ thời gian xử lý), gom kết quả
```

- `runTick` trả `{ shouldStop?: boolean }` + counters tuỳ subclass — base cộng dồn qua reducer
  do subclass cung cấp (hoặc đơn giản: base trả `ticks`, subclass tự giữ counters — chọn phương
  án đơn giản nhất khi implement, KHÔNG generic hoá quá tay).
- `resolveTickMs` đọc từ config động (`ops.stats.tickSeconds`) — mỗi game tự quyết.
- KHÔNG đưa logic hàng đợi/watermark vào base — đó là nghiệp vụ per-game.

Kết quả: `SyncBettingStatsUseCase` và `EvaluateOpsAlertsUseCase` của mỗi game chỉ còn `runTick`
— phần hạ tầng biến mất khỏi tầm mắt người đọc nghiệp vụ.

### 5.3. ✅ P0 — Kết thúc stats 1 kỳ: drained + terminal → final. THẾ LÀ XONG.

**Chốt CUỐI 02/08 sau 4 vòng thảo luận.** Quyết định của user: *"đơn giản nhất việc kết thúc
stats 1 kỳ — đọc theo id trong tick, cuối loop check status draw, settled/void thì update final,
không check gì nữa, không alert, không rebuild."*

**Cơ chế đóng sổ — giữ nguyên code hiện tại, KHÔNG thêm gì:**

```
mỗi tick, mỗi kỳ chưa final:
  đọc entries {_id > watermark} theo batch → ghi delta
  hết entries (drained) VÀ status ∈ {Settled, Void}  →  final = true. XONG.
```

Kết sổ xong không build lại stats — số tổng đã tích giữ nguyên (kể cả phần entry void sau khi
đã cộng: audit trail hợp lệ, K4).

**Rủi ro tồn dư đã biết và CHẤP NHẬN CÓ CHỦ ĐÍCH** — ghi lại để không ai "phát hiện lại":

Trường hợp thiếu duy nhất: thứ tự `_id` ≠ thứ tự commit. ObjectId =
`[timestamp giây][random 5B][counter]` → 2 bet cùng GIÂY từ 2 Lambda container có thứ tự `_id`
do random bytes quyết định. Timeline lỗi:

```
10:00:05.000  Lambda A: transaction sinh _id X = ...05|a3...
10:00:05.010  Lambda B: transaction sinh _id Y = ...05|f1...  (Y > X dù B đến sau)
10:00:05.020  B COMMIT (nhanh)
10:00:05.030  ⚡ worker đọc: thấy Y, KHÔNG thấy X (A chưa commit) → watermark = Y
10:00:05.800  A COMMIT → X xuất hiện nhưng X < watermark → vĩnh viễn vô hình
              → kỳ đó thiếu entries của đúng 1 vé trong stats
```

Vì sao chấp nhận: cần ĐỒNG THỜI (1) 2 bet cùng giây, (2) commit lệch nhau, (3) worker đọc lọt
đúng khe vài chục ms giữa 2 commit trong khi tick 10s — xác suất thấp; thiệt hại chỉ là dashboard
ops của kỳ đó thiếu 1 vé; **tiền không bao giờ sai** (settle pipeline đọc thẳng entries, không
qua stats). Chi phí bộ máy vá (count-check + auto-rebuild + cờ trạng thái) KHÔNG tương xứng.

**Các phương án vá đã cân nhắc và LOẠI** (giữ lại làm tư liệu — nếu sau này tải tăng mạnh và
thấy cần, mở lại theo thứ tự):

| | Phương án | Vì sao loại (ở tải hiện tại) |
|---|---|---|
| A-lite | Đếm 1 lần lúc đóng sổ, lệch thì chỉ set cờ `verified:false` trên doc rồi VẪN đóng — đo lường, không sửa | 2 dòng code, gần free — là ứng viên ĐẦU TIÊN nếu sau này muốn biết tần suất thực tế. Hiện tại: chưa cần |
| A-full | Đếm + auto-rebuild 1 kỳ khi thiếu | Bộ máy thật (deleteMany 3 collection, reset watermark, chống loop) — không tương xứng rủi ro ops-only |
| C | Safety-lag: chỉ đọc entries già hơn ~LAG để triệt race tận gốc | Đổi độ tươi 10s→~90s lấy 1 giả định (txn lifetime + clock skew < LAG) gãy âm thầm |
| D | Watermark theo `version` (sequence `$inc` luôn tăng) thay `_id` | KHÔNG vá được — race nằm ở "token cấp TRƯỚC commit", không phải ở token nào: `nextVersion()` gọi trước `withTransaction` nên cửa sổ cấp→commit còn RỘNG hơn `_id`; thay số vào timeline trên ra đúng kịch bản cũ. Gap-detection cũng bất khả: version có gap hợp lệ (nextVersion tiêu số trước khi biết place-bet thành công — debit reject/txn fail → số tiêu nhưng không có entry), reader không phân biệt nổi "gap vì fail" với "gap vì chưa commit"; thêm timeout để phân biệt = phương án C đội lốt. Phụ phí: version per-ticket (20 entries cùng số) → cursor compound `(version,_id)` + index mới |

**Trả lời "kỳ nào cần tính":** danh sách kỳ = `findNotFinal()` — bất biến "mọi kỳ còn có thể
nhận entry đều có stats doc `final:false`" được `ensureDocs(listUnfinishedDrawIds())` duy trì
(§5.6: enroll 1 lần/invocation). "Kỳ đã final" = kỳ terminal đã hút cạn theo watermark.

**Sau kết sổ — quan hệ với dữ liệu settle & "số liệu đúng cuối cùng" (chốt 02/08):**

Settle pipeline (`CalculateFinancialsUseCase`) aggregate TRỰC TIẾP từ entries (đường hoàn toàn
độc lập với ops stats) và ghi vào `DrawDoc`:

```
DrawDoc.financial.totalRevenue      ← Σ entry.amount (số tài chính chính thức)
DrawDoc.stats.ticketEntryCount      ← số entry tham gia kỳ
DrawDoc.stats.totalSalesAmount / totalPayoutAmount
```

Ba quyết định rút ra:

1. **Ops stats sau final = dữ liệu THAM KHẢO đóng băng** — không sửa lại, không recompute
   (đúng yêu cầu user). Nó là ảnh chụp giai đoạn LIVE, có giá trị audit (kể cả phần entry
   void-sau-khi-cộng).
2. **"Số liệu đúng cuối cùng" đã tồn tại MIỄN PHÍ** — chính là `DrawDoc.financial`/`DrawDoc.stats`
   do settle tính lúc kết sổ. KHÔNG cần worker kiểm/copy/đối chiếu gì thêm: consumer nào cần số
   chính thức của kỳ đã đóng thì **JOIN lúc ĐỌC** (adapter/API đọc thêm `financial` từ DrawDoc —
   1 projection, kỳ đã đóng nên cache thoải mái). Đây là cách "tận dụng lúc kết sổ" đúng: tận
   dụng số settle ĐÃ tính, không phải thêm bước tính vào worker.
3. Lệch nhỏ giữa 2 bộ số là **kỳ vọng được** (ops stats giữ audit void-sau-cộng + rủi ro tồn dư
   watermark): UI kỳ đã đóng ưu tiên hiển thị số chính thức từ `financial`, số ops chỉ để soi
   chi tiết cơ cấu (byPlayType, heatmap, combo…) — thứ settle không có.

Hệ quả hay: rủi ro tồn dư watermark (bảng trên) càng thêm chấp nhận được — vì "số đúng cuối
cùng" NGAY TỪ ĐẦU không lấy từ ops stats, mà từ settle.

#### 5.3.1. `resetFinal` — API thừa hưởng từ kiến trúc CŨ, đã xoá (02/08/2026)

Phát hiện lúc review: `BettingStatsRepository.resetFinal(drawId)` (chỉ `$set final:false`) tồn
tại với JSDoc *"dành cho vận hành — tính lại kỳ này"*, viện dẫn `mongodb.mdc` §8.5 ("không có
đường reset thì sai số là vĩnh viễn"). **0 caller trong toàn repo.** Đã xoá.

Đáng ghi lại vì lý do xoá KHÔNG phải "dead code": **nó không làm được việc nó tự nhận.** Trong
kiến trúc `$inc` + watermark per-doc, flip `final` là **no-op**:

```
resetFinal("2026-08-02.004")   →  final:false, nhưng lastEntryId vẫn ở mức CAO NHẤT
tick sau: findNotFinal()       →  trả kỳ đó kèm lastEntryId cũ
  getEntriesForStatsAfter(_id > lastEntryId)  →  0 entry
  drained: true, status Settled  →  stampFinal() lại
```

Kết quả: 1 vòng ghi vô ích, số liệu y nguyên. Không có gì được "tính lại".

**Cạm bẫy thật nằm ở bước tiếp theo** — người bảo trì thấy no-op sẽ "sửa" bằng cách reset luôn
`lastEntryId` về `undefined`. Lúc đó counter `$inc` chưa bị xoá, nên worker cộng lại từ entry đầu
→ **doanh thu/entries/sets của kỳ đó gấp đôi**. Sai âm thầm, không exception, dashboard vẫn xanh.

Recompute đúng trong kiến trúc delta đắt hơn hẳn 1 dòng `$set`: zero **toàn bộ** counter + reset
watermark trong CÙNG 1 update (nếu tách 2 lệnh, crash ở giữa để lại doc zero với watermark cao =
mất sạch số kỳ đó), cộng thêm `deleteMany` ở 3 collection phụ (`combo`, `combo_accounts`,
`account_stats` — mỗi doc tự mang watermark riêng), và chống loop khi lỗi lặp.

Vì sao API này từng hợp lý: thời `$set` full snapshot, rescan-từ-đầu **tự ghi đè** toàn doc nên
`final:false` là đủ để tính lại. Chuyển sang `$inc` (§5.1) đã làm nó vô nghĩa nhưng nó sống sót
qua refactor vì compiler không bắt được method public không ai gọi.

**Quyết định:** KHÔNG có đường reset. Nếu về sau thật cần "tính lại 1 kỳ", viết use-case riêng
(không phải method repo lẻ) thực hiện đủ 4 việc trên, có audit log, và chỉ mở cho staff. Rủi ro
"sai vĩnh viễn" mà §8.5 lo đã được chặn ở tầng khác: ops stats là dữ liệu THAM KHẢO, số chính
thức đến từ settle (`DrawDoc.financial`) — đường hoàn toàn độc lập, tự tính lại khi resettle.

> **Bài học tổng quát cho port (§7):** mỗi khi đổi mô hình ghi (`$set` full → `$inc` delta), rà
> lại **mọi** method public của repo hỏi "API này còn nghĩa gì trong mô hình mới?". Method không
> caller là dấu hiệu, không phải kết luận — cái nguy hiểm là method còn caller nhưng đã đổi
> nghĩa. 3 game còn lại hiện vẫn ở mô hình `$set` full (`upsertFull` + `recomputeFull`), nơi
> reset-final CÒN hợp lý — nên khi port sang `$inc`, `recomputeFull` phải bị xoá hoặc viết lại
> hoàn toàn, KHÔNG được giữ lại "cho chắc".

**Phương án A — UI-level reconcile (USER ĐÃ DUYỆT 02/08):**

Kiểm chứng thực tế trên trang Operations Keno: khi kỳ terminal, trang **đã fetch sẵn cả 2
nguồn** — `useOpsSnapshot` (ops stats) và `useDrawDetail` → `GET /keno/draws/{id}` trả
`result + financial + stats + settleSummary` (đang render ở `ResultSection`/`FinancialSummary`).
Nghĩa là khi kỳ `Settled`, cùng màn hình đang có 2 con số "Doanh thu" (KPI strip từ ops vs
FinancialSummary từ settle) có thể lệch nhau. Phương án A hợp nhất: **chỉ sửa adapter `toKpi`**
nhận thêm `financial`/`drawStats` optional, ưu tiên số chính thức khi kỳ Settled. Zero request
mới, zero thay đổi worker/backend/settle.

Ma trận nguồn số cho KPI strip:

| KPI | Live / Settling | **Settled** | **Void** |
|---|---|---|---|
| Doanh thu | ops `totals.revenue` | **`financial.totalRevenue`** | ops |
| Hoa hồng ĐL | ops `totals.commission` | **`financial.totalAgentCommission`** | ops |
| Net (sau HH) | ops (revenue − commission) | **financial** (revenue − commission) | ops |
| Entries | ops `totals.entries` | **`DrawDoc.stats.ticketEntryCount`** (= totalSettled, đã loại void) | ops |
| Boards | ops `totals.boards` | ops — settle KHÔNG có boards, ops là nguồn duy nhất | ops |
| Người chơi | ops `uniquePlayers` (countDocuments account_stats — số thật) | ops — settle không có | ops |

Căn cứ đã kiểm:

- Settle ghi `DrawStats { ticketEntryCount: summary.totalSettled, totalSalesAmount,
  totalPayoutAmount }` (`calculate-financials.ts`) — có Entries chính thức, KHÔNG có
  Boards/Players. **Quyết định: KHÔNG mở rộng settle** để thêm 2 số này — sửa đường tài chính
  7 game chỉ phục vụ ô dashboard là coupling ngược; ops đã có sẵn và đủ chính xác.
- Void 2 tầng: (a) void **entry** — worker loại `status: Void` ngay tại nguồn đọc, entry
  void-sau-khi-cộng giữ nguyên (audit, không trừ bù); (b) void **cả kỳ** — void flow "không có
  financial calculation" (`void/types.ts`) → kỳ Void KHÔNG có `financial`/`stats`, ops stats là
  **dữ liệu duy nhất còn lại** mô tả kỳ đó → cột Void toàn bộ fallback ops.
- Guard khi implement: `RESULT_SHOW` gồm cả `Published/Settling` (financial có thể chưa ghi) —
  adapter chỉ override khi `status === Settled` **VÀ** `financial` tồn tại, ngược lại fallback
  ops. Resettle ghi đè financial (idempotent overwrite) → vẫn đúng nguồn chính thức.

### 5.4. ✅ P1 — Dọn code quality (Q1–Q4)

- **Q1:** viết lại JSDoc handler `stats-sync.ts` — bỏ câu `recomputeFull`, mô tả đúng cơ chế hiện
  tại (watermark + đóng sổ drained/terminal). Đồng thời rà JSDoc 2 file use-case sau khi tách §5.1.
- **Q2:** thay cast bằng map tường minh `KenoBasicPlayType → KenoPlayTypeStat` (switch/Record
  typed) — hết lỗ type.
- **Q3:** ~~đổi tên/chú thích~~ — ĐÃ CHỐT (§9.1): **xoá field `entries` khỏi `KenoPlayTypeStat`**
  — UI không hiển thị nó (PickCard chỉ dùng `selections`/`revenue`), giữ lại chỉ gây hiểu nhầm.
  Xoá ở: accumulator, `incPlayTypeStat`, adapter `PlayTypeRow.entries`, entity. Doc cũ còn field
  thừa: vô hại, mapper normalize (§5.5) bỏ qua.
- **Q4:** ~~kỳ fail liên tiếp ≥ N tick → alert `worker_stuck`~~ — **SUPERSEDED 03/08/2026**, xem §5.7.
  Nhu cầu (biết kỳ nào kẹt) là THẬT, nhưng `ops_alerts` là chỗ SAI: đó là collection cho **sự kiện
  nghiệp vụ của 1 kỳ**, còn sức khoẻ worker là **trạng thái hạ tầng** (tự hết khi worker hồi phục,
  không thuộc kỳ nào). Đã dời xuống `worker-core`.

### 5.5. ✅ P0 — `ensureDocs` tối giản + default chuyển sang PHÍA ĐỌC (mapper)

**Bổ sung 02/08 sau review của user — user đúng: skeleton `$setOnInsert` là rủi ro schema evolution.**

Hiện trạng: `ensureDocs` seed doc mới với FULL skeleton (~25 dòng object: totals=0, đủ 15 slot
`byPlayType`, exposure, topPotential=[]…). Lý do gốc ghi ở `stats-shape.ts`: reader truy cập
thẳng `bp.bigSmall.big.amount` (interface shape cố định), `$inc` chỉ tạo path được chạm → slot
thiếu nổ runtime.

**Vì sao thiết kế này yếu (đúng như user chỉ ra):**

1. **Thêm field mới → MỌI doc cũ thiếu field đó** — `$setOnInsert` chỉ chạy lúc INSERT, không
   sửa được quá khứ. Reader kiểu gì cũng phải chịu được field thiếu → skeleton chỉ cho cảm giác
   an toàn giả, không cho bảo đảm thật.
2. **Default bị rải 2 nơi**: shape lúc ghi (`ensureDocs`) và kỳ vọng lúc đọc — lệch nhau là bug.
   Chính file `stats-shape.ts` đã thừa nhận nghịch lý: `numberFreq`/`byTenant` KHÔNG seed vì
   "reader đã tolerant `?? 0`" — tức là tolerant-read đã được công nhận là đúng, nhưng chỉ áp
   dụng nửa vời.
3. Skeleton kéo theo cả chuỗi phức tạp phụ: JSDoc dài giải thích vì sao seed slot này mà không
   seed slot kia, dependency `createEmptyByPlayType` ở tầng repo, doc nặng hơn mức cần.

**Giải pháp — normalize 1 chỗ duy nhất ở `BettingStatsMapper` (phía đọc):**

```
GHI:  ensureDocs → $setOnInsert: { final: false, updatedAt }   ← 2 field, hết skeleton
      applyDelta → $inc tự tạo mọi path lồng còn thiếu (hành vi chuẩn Mongo)
                   $push tự tạo mảng topPotential

ĐỌC:  BettingStatsMapper.mapProps(doc) → normalize:
      totals/exposure thiếu → zeros · byPlayType deep-merge với createEmptyByPlayType()
      → slot thiếu = zero-stat · topPotential ?? [] · byTenant/numberFreq ?? {}
```

- **Entity contract KHÔNG đổi** — `KenoDrawBettingStatsEntity` vẫn full shape, mọi consumer
  (adapters, `evaluateAlerts`, UI) giữ nguyên. Chỉ nơi BẢO ĐẢM shape chuyển từ lúc ghi sang
  lúc đọc.
- **Schema evolution giải quyết triệt để**: field mới thêm vào entity + 1 dòng default trong
  mapper → doc cũ lẫn mới đều đúng, không cần migration, không cần backfill.
- `createEmptyByPlayType` vẫn là single source (rule §5) — chỉ chuyển người dùng từ repo-ghi
  sang mapper-đọc (accumulator vẫn dùng như cũ).
- Chi phí: normalize chạy mỗi lần đọc — vài chục phép `??` trên 1 doc, không đáng kể so với
  round-trip DB. Mapper hiện tại đang spread mù (`{...rest} as Entity` — bản thân nó là 1 lỗ
  type sẵn có) → normalize còn sửa luôn lỗ đó.
- `stampFinal` filter `{final: false}` vẫn hoạt động — `final` là 1 trong 2 field còn seed
  (nó là TRẠNG THÁI hàng đợi, không phải default hiển thị — phải tồn tại từ lúc enroll).

Áp dụng đồng bộ nguyên tắc này khi port bingo18/max3d/max3dpro: **doc ghi tối thiểu,
shape bảo đảm ở mapper**.

### 5.6. ✅ P1 — Đơn giản hoá vòng tick: `ensureDocs` 1 lần/invocation

**Bổ sung 02/08 — trả lời "code loằng ngoằng ở runTick bước 1–2".**

Vòng tick hiện tại là 4 truy vấn tuần tự: `listUnfinishedDrawIds` → `ensureDocs` →
`findNotFinal` → `getStatusesByDrawIds`. Bản chất đây là 3 nghiệp vụ của một durable queue —
**enroll** (kỳ mới vào hàng đợi), **take** (lấy việc + watermark), **close** (biết khi nào đóng) —
không bỏ được nghiệp vụ nào, nhưng sắp xếp lại được:

1. **Enroll dời ra khỏi tick** — chạy 1 lần đầu invocation (trong `runLocked`, trước vòng lặp).
   Draws được staff tạo batch cho cả ngày; kỳ tạo giữa invocation chỉ chờ tối đa ~55s để vào
   hàng đợi — vô nghĩa so với chu kỳ 6–8 phút. `runTick` còn đúng 1 câu chuyện:
   *"lấy hàng đợi → hút delta → đóng dấu"* (2 truy vấn thay vì 4).
2. **KHÔNG gộp hàng đợi về draw doc** (đã xét): muốn bỏ hẳn `ensureDocs` thì cờ `final` +
   watermark phải dọn sang `DrawDoc` → ops state chui vào collection core (settle pipeline,
   player API cùng đụng) — đổi 2 truy vấn rẻ lấy coupling cross-domain. Loại.
3. **"Đọc hết entries" — bảo đảm bằng chính vòng đọc, chấp nhận rủi ro tồn dư (chốt §5.3).**
   "Đã hút cạn" = `drained` (batch cuối < READ_BATCH) + status terminal. Về lý thuyết có đúng
   1 lỗ: watermark `{_id > lastEntryId}` dựa trên giả định *thứ tự `_id` = thứ tự commit* —
   giả định này gãy được với 2 place-bet song song:

   ```
   t0  Lambda A: transaction bắt đầu, insertMany sinh _id = X
   t1  Lambda B: sinh _id = Y (Y > X), transaction COMMIT ngay
   t2  Worker tick đọc {_id > watermark} → thấy Y (X chưa commit) → watermark = Y
   t3  Lambda A: COMMIT — X xuất hiện, nhưng X < Y = watermark
   t4+ Mọi lần đọc sau {_id > Y} → X VĨNH VIỄN không được đọc, drained vẫn true
   ```

   (Cùng giây, thứ tự ObjectId giữa 2 container do random bytes quyết định — không cần clock
   skew.) Phân tích đầy đủ + timeline chi tiết + lý do CHẤP NHẬN không vá: §5.3. Lưu ý các
   khẳng định vẫn đúng: `stampFinal` SỚM không xảy ra ("tick trước đọc chưa hết, tick sau kết
   sổ" là không thể — stamp đòi `drained` trong CÙNG tick, kỳ terminal không nhận entry mới).

Sau §5.5 + §5.6, `betting-stats-repo.ts` còn: `getByDrawId` · `findNotFinal` · `applyDelta` ·
`ensureDocs` (3 dòng) · `stampFinal` (1 update 1 dòng). `resetFinal` đã bị **xoá** — nó là API thừa
hưởng từ kiến trúc `$set` full-snapshot cũ và trở thành no-op nguy hiểm trong mô hình `$inc`; phân tích
đầy đủ ở §5.3.1. Phần JSDoc giải thích skeleton/seed-slot biến mất theo skeleton.

### 5.7. ✅ P0 — Sức khoẻ worker thuộc `worker-core`, KHÔNG thuộc `ops_alerts` (chốt 03/08/2026)

> **Mục này THAY THẾ Q4 ở §5.4.** Phân tích đầy đủ: `.cursor/analysis/system-worker-health.analysis.md`.
> Plans: `.cursor/plans/system-worker-health/` (p0-01 worker-core · p0-02 Keno gỡ alert · p1-01 trang BO).
>
> **3 game bingo18/max3d/max3dpro đọc kỹ mục này:** analysis của các game đó tham chiếu Q4 ở đây, và Q4
> đã bị bỏ. Port theo mô tả mới, KHÔNG khai thêm alert type.

Q4 đã được code (alert `worker_stuck` bắn từ cả 2 worker) rồi bị **hoàn nguyên** sau review. Lý do —
đây là bài học thiết kế đáng giữ lại:

**Ranh giới đúng giữa 2 loại tín hiệu:**

| | `ops_alerts` (per-game) | `worker_locks` (`worker-core`) |
|---|---|---|
| Bản chất | **Sự kiện nghiệp vụ** đã xảy ra trong 1 kỳ | **Trạng thái sức khoẻ** hạ tầng |
| Thuộc về | 1 `drawId` (field bắt buộc của `OpsAlertBase`) | 1 `lockKey` |
| Tự hết? | KHÔNG — cần staff ack | CÓ — item thành công là hết |
| Cấu hình tắt | Có (`ops.alerts.enabled`) | KHÔNG — không ai được tắt cảnh báo sức khoẻ |
| Số bản cài | 1/game (thật sự khác nhau) | **1 bản** cho cả 9 worker app |

**Luật:** tín hiệu *tự hết khi hệ thống hồi phục* và *không thuộc 1 kỳ quay* → thuộc `worker_locks`.

**4 defect do đặt sai chỗ** (chi tiết + dòng code: system analysis §3):

1. **Badge đỏ vĩnh viễn.** `OpsAlertStatus.Resolved` không có nơi nào set (grep toàn repo: chỉ dòng khai
   báo) — đường duy nhất là `ack()` bằng tay. Worker khỏi rồi badge vẫn đỏ ⇒ staff học phản xạ "ack cho
   hết đỏ" ⇒ **mòn giá trị badge của alert nghiệp vụ thật**. Đây là cái giá đắt nhất.
2. **Sai scope hiển thị.** Badge đếm **global** (`countActiveCritical`), panel lọc **per-draw**
   (`listByDrawAndStatus`). Worker kẹt luôn ở kỳ **cũ nhất** (`findNotFinal` sort asc), staff mở trang
   kỳ **đang chạy** ⇒ đỏ mà panel trống, không có đường tra.
3. **Type nói dối.** `Record<KenoOpsAlertType, boolean>` buộc `enabled` phải có key `worker_stuck` dù
   **0 consumer đọc** ⇒ phải viết JSDoc 8 dòng bào chữa. Khi cần JSDoc dài để giải thích vì sao 1 member
   không tuân luật của enum chứa nó → member đó không thuộc enum đó.
4. **Streak đo sai thứ cần đo.** `Map` reset ở `beforeLoop` ⇒ chỉ đếm được "3 tick trong 1 invocation"
   (~30s) ⇒ không phân biệt "lỗi thoáng qua" với "kẹt 6 tiếng". `worker_locks` vốn đã persist state qua
   invocation sẵn (`cursor`/`lastError`) — chỉ cần dùng.

**Lỗ hổng thật cần lấp (và Q4 đã lấp sai chỗ):** `SingleRunWorker` chỉ ghi `lastError` khi
`runLocked` **throw**. Nhưng ta bắt lỗi **per-item** để 1 kỳ bẩn không làm chết cả tick (K7) ⇒
`runLocked` không throw ⇒ mỗi invocation vẫn ghi `lastSuccessAt = now`, `lastError = null` **dù 1 kỳ kẹt
vĩnh viễn**. Lock doc hoàn toàn xanh. Tín hiệu là cần thật; chỗ để nó mới là chỗ sai.

**Thiết kế chốt:**

- `WorkerLockDoc` thêm `stalledItems: WorkerStalledItem[]` (`itemKey`, `failCount`, `firstFailedAt`,
  `lastFailedAt`, `lastError`).
- `SingleRunWorker` thêm `recordStalledItem(itemKey, error)` / `clearStalledItem(itemKey)` (tên thực tế
  khi ship; system-worker-health đề xuất tên `recordItemFailure` nhưng bản implement đổi cho khớp `stalledItems`) — chỉ đụng
  RAM, **không có I/O ⇒ không thể throw ⇒ caller KHÔNG bọc try/catch**.
- Flush 1 lần ghép vào `finalizeAndRelease` (lệnh update đã tồn tại ở cuối mọi invocation) ⇒ **0 DB call
  thêm**, so với bản alert cũ tốn 1 `bulkWrite` mỗi lần chạm ngưỡng mỗi tick mỗi kỳ.
- Streak **tích luỹ qua các invocation** (seed từ doc đọc sẵn lúc acquire) ⇒ đo được "kẹt bao lâu".
- Ngưỡng `STALLED_ALERT_THRESHOLD = 3` chỉ để trang BO filter — **không tác động tự động** (không dừng
  worker, không skip kỳ), theo đúng tiền lệ `RETRY_ALERT_THRESHOLD` của `tenant-dispatch`.
- Trang BO `/system/workers` đọc `worker_locks`: trạng thái Idle/Running/**Crashed**, tuổi
  `lastSuccessAt`, `lastError`, `stalledItems`, toggle kill-switch `isEnabled` — trả nợ cho **cả 9
  worker app**, vì hiện KHÔNG UI nào đọc `worker_locks` (kill-switch phải sửa bằng mongo shell).

**Kết quả ở Keno:** xoá `KenoOpsAlertType.WorkerStuck` + key default config + `WORKER_STUCK_THRESHOLD`
(2 bản song sinh) + `consecutiveFails`/`stuckStreak` + 2 method `record*AndMaybeAlert` + 2 khối
try/catch phòng-hộ + nhánh render FE + label ≈ **75 dòng**, thay bằng 2 dòng gọi base class. Sync
worker cũng bỏ luôn field `alertRepo` (alert worker vẫn giữ — nó cần cho alert nghiệp vụ).

## 6. Những phương án ĐÃ CÂN NHẮC VÀ LOẠI (để không ai đề xuất lại)

| Phương án | Vì sao loại |
|---|---|
| **Change Streams / Atlas Triggers** thay polling | Cần process sống liên tục (trái mô hình Lambda), resume token phức tạp hơn watermark, không idempotent sẵn. Polling 10s là đủ tốt cho chu kỳ 6–8 phút — độ trễ không phải vấn đề cần giải |
| **Tính stats ngay trong place-bet** ($inc trực tiếp lúc ghi entry) | Chạm hot path — vi phạm ràng buộc số 1 của analysis gốc. **Phân tích sâu được/mất: §6.1** |
| **Gộp 4 collection stats lại "cho đơn giản"** | Quay lại đúng bug p2-01 R1 (mảng không chặn → 16MB) và R2 (write amplification). Số collection không phải nguồn phức tạp — thứ tự ghi mới là, và thứ tự đó đã đóng gói trong `writeBatch` |
| **Transaction đa collection thay watermark** | Đắt hơn, giữ lock DB lâu hơn, vẫn phải xử lý retry sau abort — watermark per-doc đạt cùng bảo đảm (hội tụ đúng) với chi phí thấp hơn và không cần replica-set transaction semantics trong code |
| **Alert đánh giá inline ngay sau `applyDelta` từng kỳ** (giữ như hiện tại nhưng "dọn code") | Đã phân tích §4.2 — coupling không còn lý do tồn tại; dọn code không sửa được việc 2 vòng đời lỗi/2 nhịp độ trộn nhau |
| **Alert worker đọc entries trực tiếp** (bỏ qua stats doc) | Lặp lại toàn bộ máy tính toán tích luỹ lần 2 — vi phạm K6 (1 con số 1 code path). Alert PHẢI đọc từ stats doc |
| **Đối chiếu định kỳ toàn bộ kỳ đang mở** (aggregate lại từ entries mỗi 5') | Chính là `recomputeClosedDraws` đội lốt — p2-01 R3 đã xoá. Rủi ro tồn dư đã chấp nhận có chủ đích ở §5.3 |

### 6.1. Phân tích sâu — "tính stats ngay trong place-bet" (được/mất, theo yêu cầu review 02/08)

Phương án: sau (hoặc trong) bước save ticket+entries, place-bet tự `$inc` luôn vào 4 collection
stats thay vì để worker làm. Đối chiếu với hot path THỰC TẾ hiện nay
(`place-bet.ts` + `place-bet-store.ts`):

```
Hot path hiện tại (mỗi lần cược):
  2 config read → 1 draw read (batch) → 1 counter $inc → WAL insert + HTTP debit tenant
  → 1 transaction { insert ticket + insertMany D entries } → WAL markCompleted
  = ~7 lệnh DB + 1 HTTP call, phần ghi stats = 0

Nếu inline stats (vé 20 kỳ, 3 board combo — hoàn toàn hợp lệ theo maxDrawCount):
  + betting_stats:   20 × $inc          (1 doc/kỳ)
  + combo_stats:     20 × 3 = 60 upsert
  + combo_accounts:  20 × 3 = 60 upsert
  + account_stats:   20 × $inc
  = +160 write ops ĐỒNG BỘ trong request của player (dù gộp bulkWrite vẫn là 4 round-trip
    + document-level lock trên các doc nóng)
```

#### Được

| # | Lợi ích | Giá trị thật |
|---|---|---|
| Đ1 | **Stats tươi tức thì** — dashboard/alert thấy cược ngay, thay vì trễ 1 tick (~10s) + 1 tick alert (~10s) | 🟡 Thấp. Chu kỳ 6–8 phút, staff có 5–7 phút phản ứng — 20s không đổi quyết định nào. Đây là lợi ích duy nhất có thật |
| Đ2 | Bỏ được máy móc watermark/tick-loop của sync worker? | ❌ **Ảo** — xem M4, M6: vẫn cần worker cho alert + finalize + verify + void; và idempotency lại khó hơn |
| Đ3 | "Ghi 1 lần tại nguồn" nghe đơn giản hơn về mental model | ❌ **Ảo** — sự đơn giản chuyển thành phức tạp ở failure handling (M2), là chỗ đắt nhất |

#### Mất

| # | Cái giá | Mức |
|---|---|---|
| M1 | **Latency + contention hot path.** Mọi player cược kỳ hiện tại đều `$inc` vào CÙNG 1 doc `betting_stats` → document-level lock serialize toàn bộ luồng cược lúc cao điểm (60s trước đóng cược — đúng lúc tải đỉnh). Upsert combo trong burst còn thêm write-conflict/duplicate-key retry | 🔴 |
| M2 | **Failure coupling — câu hỏi không có đáp án tốt:** stats ghi fail SAU khi đã debit + save ticket thì sao? (a) fail request → lỗi ops data làm hỏng đường DOANH THU, player bị trừ tiền nhưng nhận error; (b) rollback tất cả → không bán được vé vì dashboard hỏng; (c) fire-and-forget → stats thiếu VĨNH VIỄN không cơ chế nào phát hiện/bù (không có watermark để replay) → drift tích luỹ, mất K2. Muốn bù thì phải viết… một worker đối chiếu đọc lại entries — tức là xây lại chính worker hiện tại | 🔴 |
| M3 | **Idempotency gãy.** Watermark per-doc hoạt động vì worker đọc entries theo `_id` tăng đơn điệu. Tại place-bet không có cursor: Lambda retry / crash giữa 2 trong 4 bulkWrite / crash sau stats trước markCompleted (các crash window WAL đã liệt kê ngay trong file) → **đếm đôi không phát hiện được**. Chống lại thì phải nhét cả 4 collection stats vào transaction cùng ticket+entries → transaction chạm 1+20+160 docs, upsert trong transaction race unique index, abort rate tăng đúng lúc cao điểm | 🔴 |
| M4 | **Hai writer cho cùng 1 con số.** Void vẫn cần xử lý (hiện loại tại nguồn đọc — K4; inline thì phải ghi "trừ bù" lúc void = anti-pattern đã tránh). `accountCount` vẫn cần đếm lại (K5). Finalize + verify vẫn cần worker. Kết quả: place-bet ghi VÀ worker ghi cùng doc — vi phạm trực diện K6, mọi lệch số phải debug 2 code path | 🔴 |
| M5 | **Mất batching.** Worker gộp ~500 entries/1 bulkWrite; inline là mỗi vé tự trả round-trip riêng. Tổng ops DB tăng theo số vé thay vì số batch; chi phí trả ĐỒNG BỘ bởi player thay vì ASYNC bởi worker | 🟠 |
| M6 | **Blast radius.** Bug ở accumulator (vd Q2, Q3 §4.3) hiện chỉ làm sai dashboard; inline thì bug đó nằm trong bundle Lambda place-bet → mỗi lần sửa rule stats là deploy lại đường doanh thu | 🟠 |
| M7 | Multi-draw khuếch đại: 1 vé 20 kỳ chạm stats doc của 20 kỳ ngay lập tức — kể cả kỳ 2 giờ nữa mới quay, không ai cần số đó "tươi" | 🟡 |

#### Biến thể trung gian đã xét — cũng loại

- **"Chỉ `$inc` totals của kỳ hiện tại tại place-bet, phần còn lại để worker"**: vẫn dính M1
  (hotspot), M3 (đếm đôi khi retry), M4 (2 writer) — mà chỉ đổi lấy Đ1 vốn không có giá trị ở
  chu kỳ 6–8 phút. Nếu một ngày cần realtime <10s (vd game 30s/kỳ), giải pháp đúng là **giảm
  `tickSeconds`** (config động sẵn có, không đổi kiến trúc), không phải inline.
- **"Ghi stats qua queue (SQS/EventBridge) từ place-bet"**: thêm 1 hạ tầng mới + vẫn cần
  consumer idempotent → consumer đó chính là worker hiện tại nhưng nguồn dữ liệu kém hơn
  (message có thể mất/trùng; `keno_ticket_entries` thì không — nó LÀ nguồn chân lý, insert-only,
  có sẵn watermark tự nhiên).

#### Kết luận

**Loại.** Được duy nhất Đ1 (~20s tươi hơn) không có giá trị vận hành ở chu kỳ 6–8 phút; đổi lại
3 cái mất đỏ (M1 contention lúc đỉnh tải, M2 failure coupling vào đường tiền, M3 mất idempotency).
Kiến trúc hiện tại đúng nguyên lý **CQRS tự nhiên**: đường ghi (place-bet) chỉ ghi source of
truth tối thiểu; đường đọc (stats) derive async từ nguồn, sai thì tự hội tụ/tính lại được —
inline stats phá đúng ranh giới đó.

## 7. Khuôn mẫu port sang bingo18 / max3d / max3dpro

Cấu trúc đích per-game sau khi thực hiện §5 (Keno làm chuẩn, 3 game còn lại copy đúng khung):

```
packages/worker-core/src/use-cases/lock/
└── tick-loop-worker.ts                 # §5.2 — dùng chung 4 game

packages/game-{game}-application/src/use-cases/operations/
├── sync-betting-stats.ts               # runTick: findNotFinal → drain → stampFinal (enroll 1 lần/invocation)
├── stats-accumulator.ts                # pure, delta-only — phần DUY NHẤT khác nhau nhiều giữa các game
├── evaluate-ops-alerts.ts              # runTick: findChangedSince → evaluateAlerts → upsert → cursor
└── evaluate-alerts.ts                  # pure rules — khác nhau theo game (alert type riêng)

apps/worker-{game}/src/handlers/stats/
├── stats-sync.ts                       # 3 dòng: new UseCase().run()
└── ops-alerts.ts                       # 3 dòng
apps/worker-{game}/src/functions/stats.yml   # 2 function, cùng pattern timeout=TTL, cron 1'
```

Phần **giống hệt** (port máy móc): tick loop (base class), hàng đợi `final:false`, watermark
per-doc, đóng sổ drained+terminal (§5.3), cursor `updatedAt` cho alert, **và tín hiệu sức khoẻ worker
qua `recordItemFailure`/`clearItemFailure` của base class** (§5.7 — KHÔNG khai alert type mới).

**Phần PHẢI XOÁ khi port — không được "giữ lại cho chắc":** 3 game hiện ở mô hình `$set` full
snapshot (`upsertFull` + `recomputeFull` + seed baseline trong accumulator). Chuyển sang `$inc`
delta làm cả nhóm API đó **đổi nghĩa hoặc mất nghĩa**:

| API hiện có (3 game) | Sau khi port sang `$inc` | Vì sao |
|---|---|---|
| `upsertFull(drawId, snapshot)` | **XOÁ** — thay bằng `applyDelta` | Ghi full doc = write amplification + lost-update (xem JSDoc `betting-stats-repo.ts` Keno) |
| `recomputeFull(...)` | **XOÁ** | Rescan-từ-đầu chỉ tự đúng khi ghi bằng `$set` (tự ghi đè). Với `$inc` nó **cộng đôi** |
| `resetFinal(drawId)` (nếu có) | **XOÁ** — Keno đã xoá, xem §5.3.1 | Flip `final` là no-op; "sửa" nó bằng reset watermark ⇒ cộng đôi |
| `accumulator.seed(baseline)` | **XOÁ** | Delta-only không cần baseline (đó chính là cách hết drift) |

Đây là bài học đắt nhất của lần refactor Keno: `resetFinal` sống sót qua chuyển đổi mô hình vì
compiler không bắt được method public không ai gọi, và JSDoc của nó vẫn mô tả hành vi của mô hình
CŨ — đọc lên vẫn thấy hợp lý. Quy tắc cho người port: **mỗi method public của repo phải trả lời
được "API này còn nghĩa gì trong mô hình `$inc`?"** trước khi PR được merge; câu trả lời ghi vào
plan, không để trong đầu.

Phần **khác theo game** — chỉ nằm trong accumulator + evaluate-alerts + schema stats doc:

| | Keno (chuẩn) | Bingo18 | Max3D/Pro |
|---|---|---|---|
| Chiều stats đặc thù | numberFreq 80, combo, bigSmall/evenOdd | diceFreq, sum 3–18, exposure per-outcome (đếm được → exposure CHÍNH XÁC, không phải worst-case) | tripletFreq, exposure theo số được cược |
| Multi-draw entries | Có (20 kỳ) → D lớn | Có → D lớn | Có → D lớn |
| Alert đặc thù | combo_concentration, cap_sets_near | sum_skew, outcome_exposure | number_concentration |
| Kỳ/ngày | ~120 | ~200+ (nhanh hơn) | ~40 |

**Alert type: KHÔNG game nào khai `worker_stuck`** (§5.7). Sức khoẻ worker do `worker-core` lo, dùng
chung 9 worker app. Cụ thể 3 game **không** phải: thêm member vào `{Game}OpsAlertType`, thêm key vào
`enabled` default + zod schema, thêm label + nhánh render FE. Chỉ gọi 2 method của base class trong
`runTick` — đúng 2 dòng, không try/catch.

Thứ tự triển khai khuyến nghị: **Keno refactor xong + chạy ổn 1 tuần → bingo18 (kỳ nhanh nhất,
stress-test khung) → max3d → max3dpro** (2 game cuối gần như copy nhau).

## 8. Rủi ro của chính đề xuất này

| Rủi ro | Mức | Giảm nhẹ |
|---|---|---|
| Refactor làm regress đường ghi đang chạy đúng | 🟠 | §5.1 chỉ DI CHUYỂN code alert ra (đường ghi không đổi hành vi); §5.2 chỉ nâng vòng lặp (runTick giữ nguyên body). Diff review được từng phần |
| Cursor `updatedAt` của alert worker và độ phân giải thời gian (2 doc cùng ms) | 🟡 | Cursor lùi/trùng vô hại (evaluate idempotent — §5.1). Dùng `$gte` + dedupe theo lần chạy nếu cần, quyết khi implement |
| Alert trễ hơn hiện tại ~1 tick | 🟢 | ~20s worst-case trên chu kỳ 6–8 phút — chấp nhận có chủ đích |
| `TickLoopWorker` generic hoá quá tay | 🟡 | Chốt nguyên tắc trong §5.2: base CHỈ lo deadline/nhịp/gom kết quả — mọi thứ khác ở subclass |
| Watermark nhảy cóc làm stats kỳ đó thiếu 1 vé (không có gì phát hiện) | 🟡 | Chấp nhận có chủ đích — phân tích và quyết định ở §5.3; ops-only, tiền không sai. Nếu sau này cần đo tần suất: bật A-lite (2 dòng) |

## 9. Câu hỏi mở & bước tiếp theo

**Câu hỏi mở — TẤT CẢ ĐÃ CHỐT 02/08:**

1. ~~**Q3 (§4.3):** field `byPlayType.*.entries` per-board~~ — ĐÃ KIỂM UI: field này **KHÔNG
   được hiển thị**. `PickCard` (analytics-panels.tsx) chỉ render `row.selections` (= `boards`,
   label "lượt") + `revenue`; `totalSelections` cũng tính từ `selections`. `PlayTypeRow.entries`
   được adapter map ra nhưng không component nào đọc. (Các chỗ khác hiển thị "lượt" là
   `byTenant.*.entries` và top-accounts `entries` — đếm per-entry CHÍNH XÁC, không liên quan.)
   → **Quyết định: XOÁ field `entries` khỏi `KenoPlayTypeStat`** (accumulator, applyDelta,
   adapter `PlayTypeRow.entries`) — bỏ hẳn số xấp xỉ gây hiểu nhầm thay vì sửa/chú thích nó.
   Doc cũ còn field thừa: vô hại, mapper normalize (§5.5) bỏ qua.
2. ~~Kiểm đếm/alert khi đóng sổ~~ — ĐÃ CHỐT: đóng sổ = drained + terminal → final,
   không kiểm gì thêm, không alert, không rebuild; rủi ro tồn dư chấp nhận có chủ đích (§5.3).
   Số chính thức sau kết sổ lấy từ `DrawDoc.financial` (JOIN lúc đọc — §5.3 phần "Sau kết sổ").
3. ~~Thứ tự port~~ — ĐÃ CHỐT: **Keno trước** (refactor + chạy ổn định), sau đó 3 game còn lại
   theo thứ tự bingo18 → max3d → max3dpro (§7).

**Plans phái sinh** — ĐÃ TẠO 02/08/2026 tại
`.cursor/plans/keno-ops-risk-control/stats-worker-simplification/` (xem `00-overview.md` thư mục đó
để theo dõi trạng thái):

- `p0-01-worker-core-tick-loop.plan.md` — §5.2, không chạm nghiệp vụ · ⏳ pending
- `p0-02-keno-split-ops-alerts-worker.plan.md` — §5.1 + index `updatedAt` + yml · ⏳ pending
- `p0-03-keno-minimal-docs-read-defaults.plan.md` — §5.5 (ensureDocs tối giản + mapper normalize) + §5.6 (enroll 1 lần/invocation) · ⏳ pending
- `p1-01-keno-stats-code-quality.plan.md` — §5.4 Q1–Q3 + xoá `byPlayType.*.entries` (§9.1) · ✅ done
  (Q4 đã ship rồi **hoàn nguyên** — xem §5.7 và thư mục plans riêng bên dưới)
- `p1-02-keno-ops-kpi-official-financial.plan.md` — Phương án A (§5.3): adapter `toKpi` ưu tiên
  `financial`/`DrawDoc.stats` khi kỳ Settled, theo ma trận nguồn số; chỉ chạm UI backoffice · ⏳ pending
- `p2-01-port-guide-bingo18-max3d-max3dpro.md` — §7, GUIDE quy trình nghiên cứu→plan→review cho 3 game
  (mỗi game sẽ tự có plan riêng theo guide), mở sau khi Keno ổn ~1 tuần · ⏳ pending

**Plans phái sinh — §5.7 (sức khoẻ worker)** — TẠO 03/08/2026 tại `.cursor/plans/system-worker-health/`.
Thư mục RIÊNG vì scope là **hạ tầng dùng chung 9 worker app**, không thuộc feature ops-risk-control của
Keno (xem `00-overview.md` thư mục đó):

- `p0-01-worker-core-item-failure.plan.md` — `stalledItems` + `recordItemFailure`/`clearItemFailure` · ⏳ pending
- `p0-02-keno-drop-worker-stuck-alert.plan.md` — gỡ `worker_stuck` khỏi Keno, nối API mới · ⏳ pending
- `p1-01-backoffice-workers-health-page.plan.md` — trang `/system/workers` cho cả 9 worker · ⏳ pending

---

*Analysis này là living document — cập nhật khi các plan phái sinh đổi trạng thái, theo đúng
quy trình `.cursor/analysis/README.md`.*
