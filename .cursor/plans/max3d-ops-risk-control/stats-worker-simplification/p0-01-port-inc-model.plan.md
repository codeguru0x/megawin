# p0-01 — Port mô hình `$inc` + tick-loop (gộp p2-01 scale-hardening)

> **Phase:** P0 · **Phụ thuộc:** — (GATE cho p0-02/03/04) · **PR:** riêng, KHÔNG gộp.
> **Nguồn:** analysis §3–§4, §7 · bản chuẩn Keno `p0-01-worker-core-tick-loop.plan.md` + `p2-01` (đã ✅).
> **Bản chất:** Max 3D đang ở mô hình Keno PRE-refactor (`upsertFull` `$set` full + `seed()` +
> `recomputeClosedDraws` + alert inline). Plan này gộp p2-01 (đổi `$set`→`$inc`) + tick-loop base + stalled-item.

## 1. Mục tiêu

Biến `sync-betting-stats.ts` từ *"cộng RAM → `$set` full doc → recompute lúc đóng"* thành 1 câu chuyện duy
nhất: **lấy hàng đợi `final:false` → hút delta `$inc` idempotent theo watermark → đóng dấu `final` khi
terminal**. Vòng lặp/budget/cadence chuyển hết về `TickLoopWorker` (`worker-core`). Sức khoẻ worker qua
`recordStalledItem`/`clearStalledItem` (KHÔNG alert `worker_stuck`).

**Phần ăn tiền lớn nhất:** `tripletStakes` sparse ≤1000 key `$set` full = rewrite ~80KB mỗi 30s dù chỉ 1
triplet đổi. Đổi sang `$inc` path `tripletStakes.<t>.<field>` cho CHỈ triplet có delta.

> **Phạm vi:** plan này KHÔNG đụng `topPairs`/`topAccounts` (để p0-03 xoá) và KHÔNG đụng `ensureDocs`
> tối giản (p0-04). Ở p0-01, `applyDelta` vẫn ghi được kể cả khi doc chưa seed đủ — vì `$inc` tự tạo path.
> Nhưng hàng đợi `findNotFinal` cần doc `final:false` tồn tại → p0-01 tạm seed doc tối thiểu trong
> `ensureDocs` (chỉ `{final,updatedAt}`), p0-04 chỉ xác nhận + chuyển enroll vào `beforeLoop`.

## 2. Sửa cái gì, ở file nào, sửa như nào

### 2.1. `packages/game-max3d-application/src/infras/repos/types.ts` — thêm delta types

Thêm (đối chiếu Keno `types.ts`): `DrawStatsCursor { drawId; lastEntryId?: string }`,
`DrawStatsDelta` (totals + byPlayType partial + `tripletStakes: Record<string, Max3dTripletStake>` +
byTenant + `topPotential: Max3dTopPotential[]`), `AccountStatsDelta`, `PairStatsDelta` (p0-03 dùng nhưng
khai ở đây cho gọn — hoặc để p0-03 tự thêm; chọn 1, ghi rõ trong PR).

> **Không** đặt delta trong exposure/pair vào p0-01 nếu chưa chắc shape — p0-03 sẽ bổ sung. Giữ p0-01 tối
> thiểu: chỉ những gì `applyDelta` cần.

### 2.2. `betting-stats-repo.ts` — thêm 4 method mới, XOÁ `upsertFull`

Port từ Keno repo (đọc kỹ JSDoc bản chuẩn, giữ nguyên lý do trong comment):

- `findNotFinal(limit)`: `findManyAsDocuments({final:false}, {projection:{_id:0,drawId:1,lastEntryId:1}, sort:{drawId:1}, limit})` → `DrawStatsCursor[]`. Projection siêu mỏng — accumulator delta-only.
- `applyDelta(drawId, delta, batchMaxId, config)`: build `$inc` theo path:
  - `totals.*` (revenue/entries/sets/commission/largeBetCount).
  - `byPlayType.<key>.{amount,units,boards,entries}` — CHỈ 4 nhóm phẳng (basicStraight/basicCombo3/basicCombo6/plus), KHÔNG lồng 2 tầng như Keno bigSmall/evenOdd → đơn giản hơn Keno.
  - **`tripletStakes.<t>.{straightUnits,combo3Units,combo6Units,amount,boards}`** — chỉ triplet có delta (dùng `incBy` bỏ field 0). Đây là điểm khác Keno (Keno là `numberFreq.<num>`).
  - `byTenant.<id>.{amount,entries,commission}`.
  - `$set: {lastEntryId: batchMaxId, updatedAt: now}` cùng lệnh.
  - `topPotential` → `$push {$each,$sort:{potentialWin:-1},$slice:config.topPotentialK}` (metric BẤT BIẾN per-entry → top-K an toàn, giống Keno).
  - Filter `{drawId, lastEntryId:{$lt:batchMaxId}}` — idempotent. KHÔNG `upsert`.
  - Dùng `docPath<Max3dDrawBettingStatsDoc>()` + helper `incBy`/`incPlayTypeStat` (port nguyên).
- `ensureDocs(drawIds)`: bulkWrite `$setOnInsert:{final:false, updatedAt:now}`, `upsert:true`, `ordered:false`.
- `stampFinal(drawId)`: `updateOne({drawId, final:false}, {$set:{final:true, updatedAt:now}})`. KHÔNG thêm `resetFinal`.
- **XOÁ** `upsertFull` hoàn toàn.

### 2.3. `stats-accumulator.ts` — bỏ `seed()`, đổi `toSnapshot` → `drainStatsDelta`

- **XOÁ** `constructor` param `baseline` + toàn bộ `seed()`. Accumulator giờ delta-only (1 batch, KHÔNG cross-invocation state).
- **XOÁ** `PairState.baselineAccounts` + band-aid `Math.max(baselineAccounts, accountIds.size)` (analysis §7, guide §5 bẫy #6).
- Thêm `drainStatsDelta(): DrawStatsDelta` thay `toSnapshot`: xuất totals + byPlayType + tripletStakes (Map→Record) + byTenant + topPotential từ state batch hiện tại. KHÔNG `final`, KHÔNG top-K pair/account (p0-03 tách ra `drainPairDeltas`/`drainAccountDeltas`).
- `lastEntryId` giữ nguyên (per-entry update trong `addEntry`), nhưng KHÔNG dùng để seed nữa — worker truyền `batchMaxId` riêng.
- **GIỮ NGUYÊN từng dòng** `addEntry`/`applyBoard`/`applyStat`/`bumpTriplet`/`toPairKey` — chỉ đổi CÁCH XUẤT, không đổi logic tính. Diff ngoài phạm vi này = red flag.

> **Lưu ý pair/account:** p0-01 chỉ cần `drainStatsDelta`. `pairs`/`accounts` Map trong accumulator để p0-03
> chuyển thành `drainPairDeltas`/`drainAccountDeltas`. Ở p0-01, tạm GIỮ 2 Map + để `topPairs`/`topAccounts`
> KHÔNG được ghi (đã bỏ khỏi delta) — p0-03 dọn sạch. Cách khác: làm p0-03 NGAY sau p0-01 nên khoảng "chết"
> này ngắn. Ghi rõ trong PR "topPairs/topAccounts tạm ngừng ghi, p0-03 chuyển sang collection phụ".

### 2.4. `sync-betting-stats.ts` — `extends TickLoopWorker`, bỏ loop tay + recompute + alert

Port cấu trúc Keno `SyncBettingStatsUseCase`:

- `extends TickLoopWorker<void, SyncBettingStatsResult>` (thay `SingleRunWorker`).
- Thêm `description` (BO `/system/workers`): `"Max 3D — đồng bộ thống kê cược theo delta (tick ~30s, mọi kỳ chưa final)"`.
- **XOÁ** `while` loop (dòng 102–118), `BUDGET_MS`, `RECOMPUTE_PAGE_SIZE`, `POST_CLOSE_STATUSES`, `recomputeClosedDraws`, `evaluateDrawAlerts`, `syncOpenDraws` (thay bằng `syncDraw` per-kỳ).
- `beforeLoop()`: đọc GlobalConfig, `buildPrizeContext`, `statsConfig`, reset `counters` (container reuse!), enroll `ensureDocs(await drawRepo.listUnfinishedDrawIds())`.
- `resolveTickMs()`: `statsConfig.tickSeconds * 1000`.
- `runTick()`: `findNotFinal(MAX_DRAWS_PER_TICK)` → `getStatusesByDrawIds` → for each: `try { syncDraw(); clearStalledItem(); if terminal && drained stampFinal() } catch { if LockTakenOverError throw; recordStalledItem() }`.
- `syncDraw(drawId, lastEntryId, prize, stats)`: vòng đọc batch → accumulator/batch → `writeBatch` → tiến cursor → `extendLock` (heartbeat TRONG vòng đọc) → trần `MAX_ENTRIES_PER_DRAW_PER_TICK`. Trả `{entriesApplied, drained}`.
- `writeBatch`: p0-01 chỉ gọi `statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats)`. p0-03 thêm pair/account trước dòng đó.
- Thêm `LockTakenOverError` class + `TERMINAL_STATUSES = new Set(DRAW_COMPLETED_STATUSES)` + hằng `READ_BATCH`/`MAX_ENTRIES_PER_DRAW_PER_TICK`/`MAX_DRAWS_PER_TICK`.
- `SyncBettingStatsResult` thêm field `failed`.

### 2.5. `draw-repo.ts` — thêm `listUnfinishedDrawIds` + `getStatusesByDrawIds`

Max 3D **thiếu** cả hai (Keno có). Thêm:

- `listUnfinishedDrawIds(): Promise<string[]>` — `findManyAsDocuments({status:{$in:UNFINISHED_STATUSES}}, {projection:{_id:0,drawId:1}})` → map `drawId`. (Dùng danh sách status "chưa hoàn thành" đã có trong `game-core`.)
- `getStatusesByDrawIds(drawIds): Promise<Map<string,DrawStatus>>` — projection `{drawId,status}`.

> Đối chiếu Keno `draw-repo.ts` cho tên chính xác + `UNFINISHED_STATUSES`/`DRAW_COMPLETED_STATUSES` import từ `@megawin/game-core/entities`.

### 2.6. `apps/worker-max3d/src/handlers/stats/stats-sync.ts` — không đổi logic

Handler chỉ `new SyncBettingStatsUseCase().run()` — signature giữ nguyên (base đổi nhưng `run()` vẫn có). Xác nhận build.

### 2.7. `packages/game-max3d/src/indexes/index.ts`

p0-01 chưa cần index mới (`{updatedAt:1}` là p0-02; pair/account là p0-03). Không đụng.

## 3. Đánh giá & verify (chạy SAU khi code)

1. `pnpm --filter @megawin/game-max3d-application check-types` + `--filter @megawin/worker-max3d check-types`.
2. Grep dead code: `rg "upsertFull|recomputeClosedDraws|POST_CLOSE_STATUSES|RECOMPUTE_PAGE_SIZE|\.seed\(|baselineAccounts" packages/game-max3d*` → phải 0 match trong Max 3D (trừ comment giải thích lịch sử nếu cố ý giữ).
3. Grep import sót: `SingleRunWorker` không còn trong `sync-betting-stats.ts`; `TickLoopWorker`/`TickOutcome`/`TickLoopResult` có mặt.
4. **Smoke (staging):** 1 invocation với 1 kỳ đang mở có cược thật → so `totals.revenue`/`byPlayType`/`tripletStakes` với aggregate trực tiếp `max3d_ticket_entries` (bằng nhau). Chạy 2 invocation liên tiếp KHÔNG có cược mới → `updatedAt` không đổi (conditional/idempotent OK).
5. Kỳ chuyển `Settled` → tick sau `final:true`; kỳ `SalesClosed` → KHÔNG final.

## 4. Ngoại lệ & rủi ro khi review (BẮT BUỘC soi)

| # | Rủi ro | Vì sao nguy hiểm | Cách review |
|---|---|---|---|
| R1 | Quên filter `lastEntryId:{$lt:batchMaxId}` ở `applyDelta` | `$inc` KHÔNG idempotent → crash giữa tick ⇒ **cộng đôi** batch | Đọc filter `updateOne`; test chạy 2 lần cùng batch → lần 2 no-op (`false`). |
| R2 | Giữ lại `seed()`/baseline "cho chắc" | Với `$inc`, seed baseline = cộng baseline VÀO `$inc` ⇒ gấp đôi mỗi tick | Grep `seed`/`baseline` = 0. Accumulator KHÔNG nhận baseline. |
| R3 | Giữ `recomputeClosedDraws`/`upsertFull` song song `$inc` | `$set` full ghi đè counter `$inc` ⇒ mất delta các tick sau; 2 mô hình xung đột | Grep = 0. Chỉ 1 đường ghi `applyDelta`. |
| R4 | `stampFinal` ở `SalesClosed` | `SalesClosed→SalesOpen` hợp lệ (kiểm `VALID_TRANSITIONS` draw-repo) → cược sau final bị bỏ | `TERMINAL_STATUSES` = `DRAW_COMPLETED_STATUSES` (Settled/Void); KHÔNG chứa SalesClosed. |
| R5 | `LockTakenOverError` bị `catch` ăn mất | Mất lock mà chạy tiếp ⇒ 2 writer `$inc` song song = double | Nhánh catch `if (error instanceof LockTakenOverError) throw`. `extendLock` fail TRONG `syncDraw` throw class này. |
| R6 | Không reset `counters` trong `beforeLoop` | Lambda container reuse giữ instance ⇒ số liệu cộng dồn sai across invocation | `beforeLoop` gán `this.counters = {…0}`. |
| R7 | `tripletStakes` `$inc` cho CẢ 1000 key | Vượt mục tiêu (rewrite lại như `$set`) | `incBy` bỏ field 0; chỉ path triplet trong `delta.tripletStakes`. |
| R8 | Đổi logic `addEntry`/`applyBoard`/`toPairKey` | Ngoài phạm vi "đổi cách ghi" → thay đổi số liệu ngầm | Diff 3 hàm này = 0 dòng nghiệp vụ (chỉ đổi xuất). |
| R9 | `topPotential` `$push` không `$slice` | Mảng lớn vô hạn → doc phình | Có `$slice: config.topPotentialK`. |
| R10 | Kỳ tồn đọng lớn hút hết budget, bỏ đói kỳ mở | Kỳ đang bán không cập nhật | Trần `MAX_ENTRIES_PER_DRAW_PER_TICK` → `drained:false`, tick sau tiếp (watermark đã tiến). |

## 5. Định nghĩa Done (p0-01)

- `sync-betting-stats.ts` `extends TickLoopWorker`, không còn loop tay/recompute/alert/`upsertFull`/`seed`.
- `applyDelta` `$inc` path (gồm `tripletStakes.<t>` sparse) idempotent theo watermark; `findNotFinal`/`ensureDocs`/`stampFinal` hoạt động.
- `draw-repo` có `listUnfinishedDrawIds` + `getStatusesByDrawIds`.
- `check-types` xanh; grep dead code 0 match; smoke staging số liệu khớp aggregate.
