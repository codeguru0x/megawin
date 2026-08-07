# p0-02 — Stats Worker: Repos + Accumulator + 2 Worker Use-cases + Deploy

> **Nguồn:** `.cursor/analysis/power655-operations-risk-control.analysis.md` §3.1 (bất biến), §4 (worker), §3.5–§3.6 (combo/exposure)
> **Phase:** P0 · **Thứ tự:** 02 · **Phụ thuộc:** p0-01 (entities + index).
> **Package đích:** `packages/game-power655-application` + `apps/worker-power655`.

## Mục tiêu

Dựng đường ghi pre-aggregated hoàn chỉnh: entries insert-stream → accumulator delta-only → 5 collection stats + alerts, chạy bằng 2 `TickLoopWorker` độc lập deploy Lambda cron 1 phút. Sau plan này, data đã đầy — p0-03 chỉ đọc.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Keno production |
|---|---|
| Repo stats/alert (+ types tách) | `packages/game-keno-application/src/infras/repos/{betting-stats,account-stats,combo-stats,combo-accounts,ops-alert}-repo.ts` + `repos/types/` |
| Mapper (seed/normalize lúc ĐỌC) | `packages/game-keno-application/src/infras/mappers/{betting-stats,account-stats,combo-stats,combo-account,entry-for-stats}-mapper.ts` |
| Accumulator pure | `packages/game-keno-application/src/use-cases/operations/stats-accumulator.ts` |
| Worker sync | `.../operations/sync-betting-stats.ts` |
| Worker eval + rules pure | `.../operations/evaluate-ops-alerts.ts` + `evaluate-alerts.ts` |
| Handler + yml + serverless | `apps/worker-keno/src/handlers/stats/{stats-sync,ops-alerts}.ts` · `apps/worker-keno/src/functions/stats.yml` · `apps/worker-keno/serverless.yml` |
| Unit test mapper | `packages/game-keno-application/test/infras/betting-stats-mapper.test.ts` |

## File & thay đổi

### 1. TẠO 6 repos trong `packages/game-power655-application/src/infras/repos/`

Copy nguyên method-set Keno (repo class thuần theo `mongodb.mdc`, param types tách `repos/types/`, field path qua `docPath<TDoc>()`):

- `betting-stats-repo.ts` — `ensureDocs(drawIds)` (`$setOnInsert {final: false, lastEntryId: MIN_OBJECT_ID}` — CHỈ seed watermark/final, KHÔNG seed field nghiệp vụ; schema evolution xử lý ở mapper), `findNotFinal(limit)` (**projection mỏng** `{drawId: 1, lastEntryId: 1}`), `applyDelta(drawId, delta, batchMaxId, topPotentialK)` (1 lệnh `updateOne` duy nhất: filter `{drawId, lastEntryId: {$lt: batchMaxId}}` + `$inc` counters + `$push {$each, $sort: {fixedPotential: -1}, $slice: K}` cho topPotential + `$set {lastEntryId, updatedAt}`), `stampFinal(drawId)`, `findChangedSince(cursor, limit)`, `findByDrawId(drawId)`.
- `number-stats-repo.ts` — MỚI so với Keno: `bulkUpsertDelta(deltas[])` (`bulkWrite {ordered: false}`, mỗi op filter `{drawId, number, lastEntryId: {$lt}}` upsert `$inc {sets, amount, boards}` + `$setOnInsert {createdAt}`), `findByDrawId(drawId)` (≤55 docs, sort `{number: 1}`).
- `account-stats-repo.ts` — `bulkUpsertDelta` (`$inc {amount, entries, sets}` + `$set {username}` snapshot mới nhất), `findTopByAmount(drawId, k)` (sort trên index `{drawId, amount: -1}` limit K), `countByDrawId(drawId)` (→ `uniquePlayers`).
- `combo-stats-repo.ts` — `bulkUpsertDelta` (`$inc {sets, amount}` + `$setOnInsert {playType, mainNumbers}`), `findTopBySets(drawId, k)`, `findConcentrated(drawId, minAccounts, limit)` (filter `{drawId, accountCount: {$gte: minAccounts}}` — chạy trên index `{drawId, accountCount}`), `syncAccountCounts(pairs)` (`$set` tuyệt đối), `findByComboKey(drawId, comboKey)`.
- `combo-accounts-repo.ts` — `bulkUpsertDelta`, `countAccountsByCombo(drawId, comboKeys[])` (aggregation `$match` + `$group` — chấp nhận aggregation ở TẦNG GHI worker, cấm ở read path BO), `listByCombo(drawId, comboKey)`.
- `ops-alert-repo.ts` — `bulkUpsertByDedupe(alerts[])` (upsert `{drawId, dedupeKey}`, `$setOnInsert` createdAt/status New, `$set` severity/payload/updatedAt — alert đã Ack KHÔNG hạ về New: copy đúng semantics Keno), `listByFilter`, `ackById`, `countByStatus(drawId)`.

Đăng ký barrel `repos/index.ts` + `repos/types/index.ts`.

### 2. TẠO mappers trong `src/infras/mappers/`

`betting-stats-mapper.ts` là chốt schema-evolution: doc DB thiếu field (doc mới tạo bởi `ensureDocs`, hoặc field thêm về sau) → mapper trả entity ĐẦY ĐỦ với zero-value (`totals` = 0, `byPlayType` seed đủ 12 key từ `PlayType` const, `exposure.fixedWorstCase: 0`, `topPotential: []`). JSDoc header ghi: "Normalize tại tầng ĐỌC — không seed skeleton lúc ghi (analysis §7.4)". Mapper mỏng tương tự cho number/account/combo/alert.

### 3. SỬA `src/infras/repos/entry-repo.ts` — thêm `getEntriesForStatsAfter`

Copy chữ ký Keno: `(drawId, afterId, limit)` → `find({drawId, _id: {$gt: afterId}}).sort({_id: 1}).limit(limit)` với **projection đúng 7 field**: `_id, accountId, username, tenantId, amount, betUnitCount, entrySummary.boards` (+ mapper `entry-for-stats-mapper.ts`). KHÔNG kéo `lines`/`payout` — vé Bao 18 có 18.564 lines, kéo nhầm là nổ RAM. Index hậu thuẫn theo kết luận p0-01 mục 7.

### 4. TẠO `src/use-cases/operations/stats-accumulator.ts` — pure, delta-only

`Power655StatsAccumulator` (class thuần không I/O, unit-test được). Constructor nhận `PrizeContext {tier1}` + `largeBetAmount` + `unitPrice`. JSDoc class ghi: "Delta-only: KHÔNG đọc baseline DB (bất biến §3.1); mọi giá trị RAW — biến đổi ở tầng đọc". `add(entry)` sinh delta theo analysis §4.3:

- `totals`: `revenue += amount`, `entries += 1`, `sets += betUnitCount`, `commission += commissionAmount` (đối chiếu field thật trên `TicketEntryDoc` lúc implement), `largeBetCount += amount >= largeBetAmount ? 1 : 0`.
- Per board trong `entrySummary.boards`: `boardAmount = expandedLines × betCount × unitPrice`; `byPlayType[playType] {amount += boardAmount, sets += expandedLines × betCount, boards += 1}` — comment vì sao `boards` không nhân betCount (tín hiệu "Bao 18 amount lớn nhưng boards nhỏ").
- `byTenant[tenantId]`: `{amount, entries, commission}`.
- `exposure.fixedWorstCase += betUnitCount × tier1` — comment công thức + "tier2/tier3 < tier1 nên không tách" (§3.6).
- `topPotential` candidate `{entryId, accountId, username, amount, fixedPotential: betUnitCount × tier1}`.
- Number deltas: per số trong `board.mainNumbers` (KHÔNG expand lines — comment "1 board Bao 18 chạm đúng 18 doc số"): `{sets += expandedLines × betCount, amount += boardAmount, boards += 1}`.
- Combo deltas: key `` `${playType}:${[...mainNumbers].sort().join(",")}` `` (sort trên bản copy — KHÔNG mutate input); combo-account delta per (comboKey × accountId).

Xuất `drainStatsDelta() / drainNumberDeltas() / drainAccountDeltas() / drainComboDeltas() / drainComboAccountDeltas()`.

### 5. TẠO `src/use-cases/operations/sync-betting-stats.ts`

`SyncBettingStatsUseCase extends TickLoopWorker<void, SyncBettingStatsResult>` — copy khung Keno, đổi wiring:

- Constants giữ nguyên Keno: `READ_BATCH = 1_000`, `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000`, `MAX_DRAWS_PER_TICK = 200` (comment: Power 6/55 thường chỉ 1 kỳ active — giữ hằng để đồng nhất codebase).
- `beforeLoop`: đọc GlobalConfig 1 lần (qua đường có merge-default `ops` — analysis §3.8) → `PrizeContext {tier1 = prizes.tier1}` + `statsConfig`; enroll: `drawRepo.listUnfinishedDrawIds()` → `statsRepo.ensureDocs`.
- `resolveTickMs = statsConfig.tickSeconds × 1000`. Lock `"power655:stats-sync"`, `ttlSeconds: 120`, `budgetMs: 55_000`.
- `runTick`: per-draw `syncDraw` bọc `try/catch` riêng (1 kỳ lỗi → `recordStalledItem`, KHÔNG chết tick — bài học Bingo18 R9): đọc batch → accumulator → `writeBatch` đúng thứ tự analysis §4.2(3): **comboAccounts → comboStats → `countAccountsByCombo` + `syncAccountCounts` → accountStats → numberStats → stats doc CUỐI** (stats doc mang watermark tổng: crash giữa chừng → watermark chưa tiến → tick sau ghi lại → `$lt` per-doc + duplicate 11000 chặn → hội tụ). Comment khối này giải thích vì sao stats doc ghi cuối.
- `extendLock()` trong vòng đọc batch (bài học Bingo18 F2); mất lock → throw `LockTakenOverError`.
- Draw TERMINAL (`Settled`/`Void`) + drained → `stampFinal`. KHÔNG stamp ở `SalesClosed` (có thể mở bán lại).

### 6. TẠO `src/use-cases/operations/evaluate-alerts.ts` (pure) + `evaluate-ops-alerts.ts`

- `evaluate-alerts.ts` — pure function `evaluateAlerts(stats, concentratedCombos, opsConfig, unitPrice)` với 4 rule đúng bảng analysis §4.4. Rule `bao_high_stake`: lặp `byPlayType` các key `bao13..bao18`, bật khi `boards > 0 && BAO_COMBINATIONS[pt] × unitPrice >= baoHighStakeAmount`; Critical khi `byPlayType.bao18.boards > 0`. Mỗi rule respect `enabled[type]`. Comment từng rule trỏ về JSDoc alert type (p0-01 mục 4).
- `evaluate-ops-alerts.ts` — `EvaluateOpsAlertsUseCase extends TickLoopWorker`, lock `"power655:ops-alerts"`, `ttlSeconds: 120`, `MAX_DOCS_PER_TICK = 50`, `MAX_CONCENTRATED_COMBOS = 50`; cursor = max `updatedAt` đã đánh giá, persist qua `setCursor` trên lock doc (at-least-once — an toàn nhờ upsert dedupe); lỗi 1 kỳ → break, KHÔNG tiến cursor. Evaluator **không bao giờ** import entry-repo (chỉ đọc stats/combo pre-aggregated).

Barrel `operations/index.ts`: export mới, GIỮ export cũ (xoá ở p0-03).

### 7. Worker app `apps/worker-power655/`

- TẠO `src/handlers/stats/stats-sync.ts` + `src/handlers/stats/ops-alerts.ts` — copy handler Keno (singleton use-case, `.run()`, wiring repos theo DI hiện hành của app).
- TẠO `src/functions/stats.yml` — copy `apps/worker-keno/src/functions/stats.yml`: 2 function `statsSync`/`opsAlerts`, `timeout: 120` (= lock TTL), `cron(* * * * ? *)`.
- SỬA `serverless.yml` (khối `functions:` dòng 73–78): thêm `- ${file(src/functions/stats.yml)}`.

## Nguyên tắc MongoDB áp trong plan này

1. **Idempotency 2 lớp**: filter `lastEntryId: {$lt: batchMaxId}` per-doc + unique index (p0-01). Duplicate key 11000 trong `bulkWrite {ordered: false}` là no-op ĐÚNG THIẾT KẾ — catch đúng code 11000, mọi code khác throw.
2. `$inc` + `$set` watermark trong **cùng 1 update op** — nguyên tử trên 1 doc, không cần transaction.
3. `$setOnInsert` tách khỏi `$inc` — không ghi đè field bất biến (`playType`, `mainNumbers`, `createdAt`) khi doc đã tồn tại.
4. Projection mỏng ở mọi query hàng đợi (`findNotFinal`, `getEntriesForStatsAfter`).
5. Sort luôn có index hậu thuẫn (khai ở p0-01) — verify bằng `explain` khi review.
6. KHÔNG `$where`/`$expr` trong filter worker — counter vô hướng đã lo phần sargable.

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục trên; so từng file với file Keno tương ứng — sai khác ngoài danh mục diverge (number-stats repo, comboKey theo board, exposure fixed, bao rule) = red flag.
2. Kiểm thứ tự `writeBatch`: stats doc (watermark tổng) PHẢI ghi cuối — đọc code + comment.
3. Grep cấm: `rg "upsertFull|recomputeFull|resetFinal" packages/game-power655-application` = 0; projection stats không kéo `lines|payout`.
4. Kiểm pure: `stats-accumulator.ts` và `evaluate-alerts.ts` không import gì từ `infras/` (grep import path) — bảo đảm unit-test không cần DB.
5. JSDoc: 2 use-case class ghi pipeline position + CRASH-SAFE/IDEMPOTENT; repo method có JSDoc side-effect (`code-quality-standards.mdc` §2).
6. `explain("executionStats")` trên DB dev cho `findNotFinal` / `findTopByAmount` / `findConcentrated` → `IXSCAN`, không `COLLSCAN`.

## Cách test

```bash
pnpm --filter @megawin/game-power655-application check-types
pnpm --filter @megawin/game-power655-application test
pnpm --filter @megawin/worker-power655 check-types
```

Unit tests BẮT BUỘC viết mới (vitest, theo tiền lệ `test/` của package):

1. `test/use-cases/stats-accumulator.test.ts`:
   - Entry standard (1 board, 1 line, betCount 1): totals/byPlayType/number/combo delta đúng từng con số; `fixedWorstCase = 1 × tier1`.
   - Entry bao18 betCount 2: `sets = 18564 × 2`; number deltas đúng **18 doc** (không 18.564); comboKey KHÔNG expand; `fixedWorstCase = 37128 × tier1`; `boardAmount = 18564 × 2 × 10000`.
   - Entry 5 board hỗn hợp (standard + bao5 + …): cộng dồn per-board đúng; `totals.sets = Σ betUnitCount`.
   - `amount >= 30tr` → `largeBetCount = 1`; dưới ngưỡng → 0.
   - 2 board cùng bộ số + cùng playType từ 2 account → 1 combo delta, 2 combo-account delta.
   - `mainNumbers` chưa sort → comboKey ổn định và input KHÔNG bị mutate.
2. `test/use-cases/evaluate-alerts.test.ts` — per rule: dưới ngưỡng (0 alert) / chạm ngưỡng (warn) / điều kiện critical / `enabled[type] = false` (0 alert). Riêng `bao_high_stake`: bao13 (17,16tr < 30tr → KHÔNG bật), bao14 (30,03tr ≥ 30tr → bật), có bao18 → critical.
3. `test/infras/betting-stats-mapper.test.ts` — doc skeleton (chỉ watermark) → entity đầy đủ zero-value 12 key `byPlayType`; doc thiếu field lẻ → normalize.
4. Test tích hợp repo (dùng mongodb-memory qua `test/global-setup.ts` như `settle-entries.test.ts`): `applyDelta` gọi 2 lần cùng `batchMaxId` → doc chỉ nhận 1 lần; `bulkUpsertDelta` chạy 2 lần cùng batch → giá trị KHÔNG double.

Smoke test local: chạy handler `stats-sync` trỏ DB dev có entry seed → 5 collection có doc; chạy lần 2 → số liệu KHÔNG đổi (idempotent).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Double-count sau crash** (ghi collection con xong, chết trước khi tiến watermark stats doc) | Test tích hợp: gọi `writeBatch` 2 lần cùng batch → MỌI collection giữ nguyên giá trị (watermark `$lt` per-doc chặn từng doc con, không chỉ doc tổng). Test QUAN TRỌNG NHẤT của plan. |
| R2 | **Nổ cardinality do expand lines Bao** | Test accumulator bao18: đúng 1 combo delta + 18 number deltas. Assert tổng delta doc/entry ≤ số board × (1 combo + 18 number + 1 account). |
| R3 | Kéo nhầm `lines` vào projection → RAM/network phình với vé Bao | Review projection + test mapper `entry-for-stats` với doc entry CÓ `lines` → output không chứa `lines`. |
| R4 | topPotential trùng entry khi resync (push 2 lần) | Đối chiếu hành vi Keno (chấp nhận hay có dedupe) và copy đúng — ghi kết luận vào plan khi implement; nếu Keno chấp nhận thì hành vi này nằm sau watermark nên thực tế không xảy ra (watermark chặn re-add) — xác nhận bằng test R1. |
| R5 | `syncAccountCounts` đếm sai khi combo-accounts ghi sau combo | Thứ tự writeBatch: comboAccounts TRƯỚC count sync — test tích hợp 3 account cùng combo → `accountCount = 3`. |
| R6 | Worker chiếm lock chết (Lambda bị kill giữa chừng) | TTL lock 120s = timeout Lambda — kiểm 2 con số khớp nhau khi review yml. |
| R7 | GlobalConfig chưa có `ops` trong DB → worker crash `beforeLoop` | Test use-case với config doc KHÔNG có `ops` → chạy bằng defaults (đường merge-default §3.8; nếu p0-03 chưa merge, worker tự merge `DEFAULT_POWER655_CONFIG.ops` — quyết định lúc implement, ghi lại vào plan). |
| R8 | Backlog lần đầu bật worker (kỳ 3 ngày tích 100k+ entries) | `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000` + budgetMs → hội tụ dần. Test: seed 25k entry → tick 1 xử lý 20k, tick 2 drain nốt, số cuối đúng. |
| R9 | Evaluator tiến cursor khi 1 draw lỗi → alert bị nuốt | Test: mock repo throw ở draw thứ 2/3 → cursor giữ ở draw 1, tick sau đánh giá lại draw 2. |
