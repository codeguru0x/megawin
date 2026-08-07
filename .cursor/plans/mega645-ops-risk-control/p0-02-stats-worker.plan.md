# p0-02 — Stats Worker: Repos + Accumulator + 2 Worker Use-cases + Deploy

> **Nguồn:** `.cursor/analysis/mega645-operations-risk-control.analysis.md` §3.1 (bất biến), §4 (worker), §3.5–§3.6 (combo/exposure)
> **Phase:** P0 · **Thứ tự:** 02 · **Phụ thuộc:** p0-01 (entities + index).
> **Package đích:** `packages/game-mega645-application` + `apps/worker-mega645`.

## Mục tiêu

Dựng đường ghi pre-aggregated hoàn chỉnh: entries insert-stream → accumulator delta-only → 5 collection stats + alerts, chạy bằng 2 `TickLoopWorker` độc lập deploy Lambda cron 1 phút. Sau plan này, data đã đầy — p0-03 chỉ đọc.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File mẫu (Power 6/55 ĐÃ implement + test 79 passed) |
|---|---|
| Repo stats/alert (+ types tách) | `packages/game-power655-application/src/infras/repos/{betting-stats,number-stats,account-stats,combo-stats,combo-accounts,ops-alert}-repo.ts` + `repos/types/betting-stats.types.ts` |
| Mapper (seed/normalize lúc ĐỌC) | `packages/game-power655-application/src/infras/mappers/{betting-stats,number-stats,account-stats,combo-stats,combo-account,entry-for-stats,ops-alert}-mapper.ts` |
| Accumulator pure | `packages/game-power655-application/src/use-cases/operations/stats-accumulator.ts` |
| Worker sync | `.../operations/sync-betting-stats.ts` |
| Worker eval + rules pure | `.../operations/evaluate-ops-alerts.ts` + `evaluate-alerts.ts` |
| Handler + yml + serverless | `apps/worker-power655/src/handlers/stats/{stats-sync,ops-alerts}.ts` · `apps/worker-power655/src/functions/stats.yml` · `apps/worker-power655/serverless.yml` |
| Unit test accumulator/evaluator/mapper | `packages/game-power655-application/test/use-cases/{stats-accumulator,evaluate-alerts}.test.ts` + `test/infras/betting-stats-mapper.test.ts` |
| Test tích hợp idempotency | `packages/game-power655-application/test/infras/stats-repos-idempotency.test.ts` — **copy assertions, KHÔNG copy `deleteMany` cleanup** (quy tắc staging DB — 00-overview) |

## File & thay đổi

### 1. TẠO 6 repos trong `packages/game-mega645-application/src/infras/repos/`

Copy nguyên method-set Power 6/55 (repo class thuần theo `mongodb.mdc`, param types tách `repos/types/betting-stats.types.ts`, field path qua `docPath<TDoc>()`):

- `betting-stats-repo.ts` — `ensureDocs(drawIds)` (`$setOnInsert {final: false, lastEntryId: MIN_OBJECT_ID}` — CHỈ seed watermark/final, KHÔNG seed field nghiệp vụ; schema evolution xử lý ở mapper), `findNotFinal(limit)` (**projection mỏng** `{drawId: 1, lastEntryId: 1}`), `applyDelta(drawId, delta, batchMaxId, topPotentialK)` (1 lệnh `updateOne` duy nhất: filter `{drawId, lastEntryId: {$lt: batchMaxId}}` + `$inc` counters + `$push {$each, $sort: {fixedPotential: -1}, $slice: K}` cho topPotential + `$set {lastEntryId, updatedAt}`), `stampFinal(drawId)`, `findChangedSince(cursor, limit)`, `findByDrawId(drawId)`.
- `number-stats-repo.ts` — `bulkUpsertDelta(deltas[])` (`bulkWrite {ordered: false}`, mỗi op filter `{drawId, number, lastEntryId: {$lt}}` upsert `$inc {sets, amount, boards}` + `$setOnInsert {createdAt}`), `findByDrawId(drawId)` (≤45 docs, sort `{number: 1}`).
- `account-stats-repo.ts` — `bulkUpsertDelta` (`$inc {amount, entries, sets}` + `$set {username}` snapshot mới nhất), `findTopByAmount(drawId, k)` (sort trên index `{drawId, amount: -1}` limit K), `countByDrawId(drawId)` (→ `uniquePlayers`).
- `combo-stats-repo.ts` — `bulkUpsertDelta` (`$inc {sets, amount}` + `$setOnInsert {playType, numbers}`), `findTopBySets(drawId, k)`, `findConcentrated(drawId, minAccounts, limit)` (filter `{drawId, accountCount: {$gte: minAccounts}}` — chạy trên index `{drawId, accountCount}`), `syncAccountCounts(pairs)` (`$set` tuyệt đối), `findByComboKey(drawId, comboKey)`.
- `combo-accounts-repo.ts` — `bulkUpsertDelta`, `countAccountsByCombo(drawId, comboKeys[])` (aggregation `$match` + `$group` — chấp nhận aggregation ở TẦNG GHI worker, cấm ở read path BO), `listByCombo(drawId, comboKey)`.
- `ops-alert-repo.ts` — `bulkUpsertByDedupe(alerts[])` (upsert `{drawId, dedupeKey}`, `$setOnInsert` createdAt/status New, `$set` severity/payload/updatedAt — alert đã Ack KHÔNG hạ về New: copy đúng semantics Power 6/55/Keno), `listByFilter`, `ackById`, `countByStatus(drawId)`.

Đăng ký barrel `repos/index.ts` + `repos/types/index.ts`.

### 2. TẠO mappers trong `src/infras/mappers/`

`betting-stats-mapper.ts` là chốt schema-evolution: doc DB thiếu field (doc mới tạo bởi `ensureDocs`, hoặc field thêm về sau) → mapper trả entity ĐẦY ĐỦ với zero-value (`totals` = 0, `byPlayType` seed đủ **12 key** từ `PlayType` const của Mega 6/45, `exposure.fixedWorstCase: 0`, `topPotential: []`). JSDoc header ghi: "Normalize tại tầng ĐỌC — không seed skeleton lúc ghi (analysis §7.4)". Mapper mỏng tương tự cho number/account/combo/combo-account/alert + `entry-for-stats-mapper.ts`. Đăng ký barrel `mappers/index.ts`.

### 3. SỬA `src/infras/repos/entry-repo.ts` — thêm `getEntriesForStatsAfter`

Copy chữ ký Power 6/55: `(drawId, afterId, limit)` → `find({drawId, _id: {$gt: afterId}}).sort({_id: 1}).limit(limit)` với **projection mỏng đúng field cần** (đối chiếu bản Power 6/55: `_id, accountId, username, tenantId, amount, betUnitCount, entrySummary.boards` + field commission trên `TicketEntryDoc` Mega 6/45 — xác định tên field thật lúc implement). KHÔNG kéo `lines`/`payout` — vé Bao 18 có 18.564 lines, kéo nhầm là nổ RAM. Index hậu thuẫn theo kết luận p0-01 mục 9.

### 4. TẠO `src/use-cases/operations/stats-accumulator.ts` — pure, delta-only

`Mega645StatsAccumulator` (class thuần không I/O, unit-test được). Constructor nhận `PrizeContext {tier1}` + `largeBetAmount` + `unitPrice`. JSDoc class ghi: "Delta-only: KHÔNG đọc baseline DB (bất biến §3.1); mọi giá trị RAW — biến đổi ở tầng đọc". `add(entry)` sinh delta theo analysis §4.3:

- `totals`: `revenue += amount`, `entries += 1`, `sets += betUnitCount`, `commission += tenant.commissionAmount` (đối chiếu field thật lúc implement), `largeBetCount += amount >= largeBetAmount ? 1 : 0`.
- Per board trong `entrySummary.boards`: `boardAmount = expandedLines × betCount × unitPrice`; `byPlayType[playType] {amount += boardAmount, sets += expandedLines × betCount, boards += 1}` — comment vì sao `boards` không nhân betCount.
- `byTenant[tenantId]`: `{amount, entries, commission}`.
- `exposure.fixedWorstCase += betUnitCount × tier1` — comment công thức + "tier2/tier3 < tier1 nên không tách" (§3.6).
- `topPotential` candidate `{entryId, accountId, username, amount, fixedPotential: betUnitCount × tier1}`.
- Number deltas: per số trong `board.numbers` (KHÔNG expand lines — comment "1 board Bao 18 chạm đúng 18 doc số"): `{sets += expandedLines × betCount, amount += boardAmount, boards += 1}`.
- Combo deltas: key qua `buildComboKey` từ `@megawin/game-mega645/rules` (p0-01 mục 5 — KHÔNG tự nối string); combo-account delta per (comboKey × accountId).

Xuất `drainStatsDelta() / drainNumberDeltas() / drainAccountDeltas() / drainComboDeltas() / drainComboAccountDeltas()`.

### 5. TẠO `src/use-cases/operations/sync-betting-stats.ts`

`SyncBettingStatsUseCase extends TickLoopWorker<void, SyncBettingStatsResult>` — copy khung Power 6/55, đổi wiring:

- Constants giữ nguyên: `READ_BATCH = 1_000`, `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000`, `MAX_DRAWS_PER_TICK = 200` (comment: Mega 6/45 thường chỉ 1 kỳ active — giữ hằng để đồng nhất codebase).
- `beforeLoop`: đọc GlobalConfig 1 lần (qua đường có merge-default `ops` — analysis §3.8; nếu p0-03 chưa merge thì worker tự merge `DEFAULT_MEGA645_CONFIG.ops`, copy đúng cách Power 6/55 đã giải quyết R7) → `PrizeContext {tier1 = defaultPrizes.tier1}` + `statsConfig`; enroll: `drawRepo.listUnfinishedDrawIds()` → `statsRepo.ensureDocs`.
- `resolveTickMs = statsConfig.tickSeconds × 1000`. Lock `"mega645:stats-sync"`, `ttlSeconds: 120`, `budgetMs: 55_000`.
- `runTick`: per-draw `syncDraw` bọc `try/catch` riêng (1 kỳ lỗi → `recordStalledItem`, KHÔNG chết tick): đọc batch → accumulator → `writeBatch` đúng thứ tự analysis §4.2(3): **comboAccounts → comboStats → `countAccountsByCombo` + `syncAccountCounts` → accountStats → numberStats → stats doc CUỐI** (stats doc mang watermark tổng: crash giữa chừng → watermark chưa tiến → tick sau ghi lại → `$lt` per-doc + duplicate 11000 chặn → hội tụ). Comment khối này giải thích vì sao stats doc ghi cuối.
- `extendLock()` trong vòng đọc batch; mất lock → throw `LockTakenOverError`.
- Draw TERMINAL (`Settled`/`Void`) + drained → `stampFinal`. KHÔNG stamp ở `SalesClosed` (có thể mở bán lại).

### 6. TẠO `src/use-cases/operations/evaluate-alerts.ts` (pure) + `evaluate-ops-alerts.ts`

- `evaluate-alerts.ts` — pure function `evaluateAlerts(stats, concentratedCombos, opsConfig, unitPrice)` với 4 rule đúng bảng analysis §4.4. Rule `bao_high_stake`: lặp `byPlayType` các key nhóm bao cao, bật khi `boards > 0 && BAO_COMBINATIONS[pt] × unitPrice >= baoHighStakeAmount`; Critical khi `byPlayType.bao18.boards > 0`. Mỗi rule respect `enabled[type]`. Comment từng rule trỏ về JSDoc alert type (p0-01 mục 6).
- `evaluate-ops-alerts.ts` — `EvaluateOpsAlertsUseCase extends TickLoopWorker`, lock `"mega645:ops-alerts"`, `ttlSeconds: 120`, `MAX_DOCS_PER_TICK = 50`, `MAX_CONCENTRATED_COMBOS = 50`; cursor = max `updatedAt` đã đánh giá, persist qua `setCursor` trên lock doc (at-least-once — an toàn nhờ upsert dedupe); lỗi 1 kỳ → break, KHÔNG tiến cursor. Evaluator **không bao giờ** import entry-repo (chỉ đọc stats/combo pre-aggregated).

Barrel `operations/index.ts`: export mới, GIỮ export cũ (xoá ở p0-03).

### 7. Worker app `apps/worker-mega645/`

- TẠO `src/handlers/stats/stats-sync.ts` + `src/handlers/stats/ops-alerts.ts` — copy handler Power 6/55 (singleton use-case, `.run()`, wiring repos theo DI hiện hành của app).
- TẠO `src/functions/stats.yml` — copy `apps/worker-power655/src/functions/stats.yml`: 2 function `statsSync`/`opsAlerts`, `timeout: 120` (= lock TTL), `cron(* * * * ? *)`.
- SỬA `serverless.yml` (khối `functions:` hiện có 5 nhóm settle/resettle/void/feed/outstanding): thêm `- ${file(src/functions/stats.yml)}`.

## Nguyên tắc MongoDB áp trong plan này

1. **Idempotency 2 lớp**: filter `lastEntryId: {$lt: batchMaxId}` per-doc + unique index (p0-01). Duplicate key 11000 trong `bulkWrite {ordered: false}` là no-op ĐÚNG THIẾT KẾ — catch đúng code 11000, mọi code khác throw.
2. `$inc` + `$set` watermark trong **cùng 1 update op** — nguyên tử trên 1 doc, không cần transaction.
3. `$setOnInsert` tách khỏi `$inc` — không ghi đè field bất biến (`playType`, `numbers`, `createdAt`) khi doc đã tồn tại.
4. Projection mỏng ở mọi query hàng đợi (`findNotFinal`, `getEntriesForStatsAfter`).
5. Sort luôn có index hậu thuẫn (khai ở p0-01) — verify bằng `explain` khi review.
6. KHÔNG `$where`/`$expr` trong filter worker — counter vô hướng đã lo phần sargable.

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục trên; so từng file với file Power 6/55 tương ứng — sai khác ngoài danh mục adapt (45 số, field `numbers`, tier1 10tr, prefix collection/lock) = red flag.
2. Kiểm thứ tự `writeBatch`: stats doc (watermark tổng) PHẢI ghi cuối — đọc code + comment.
3. Grep cấm: `rg "upsertFull|recomputeFull|resetFinal" packages/game-mega645-application` = 0; projection stats không kéo `lines|payout`.
4. Kiểm pure: `stats-accumulator.ts` và `evaluate-alerts.ts` không import gì từ `infras/` (grep import path) — bảo đảm unit-test không cần DB; comboKey lấy từ `buildComboKey` domain, không nối string tại chỗ.
5. JSDoc: 2 use-case class ghi pipeline position + CRASH-SAFE/IDEMPOTENT; repo method có JSDoc side-effect (`code-quality-standards.mdc` §2).
6. `explain("executionStats")` trên DB dev cho `findNotFinal` / `findTopByAmount` / `findConcentrated` → `IXSCAN`, không `COLLSCAN`.
7. **Kiểm quy tắc test staging DB**: `rg "deleteMany|deleteOne|drop" packages/game-mega645-application/test` = 0 match MỚI (file test mới thêm không được chứa hàm xoá — 00-overview).

## Cách test

```bash
pnpm --filter @megawin/game-mega645-application check-types
pnpm --filter @megawin/game-mega645-application test
pnpm --filter @megawin/worker-mega645 check-types
```

Vitest ĐÃ setup sẵn trong package (`vitest.config.ts` + `@megawin/vitest-config`) — KHÔNG cần setup mới. Test chạy trên **DB staging dùng chung** → tuân quy tắc 00-overview: **KHÔNG `deleteMany`/cleanup**; cô lập bằng key duy nhất per-run:

```ts
// Mỗi run 1 drawId riêng — không cần dọn baseline, assert giá trị tuyệt đối luôn đúng.
const TEST_DRAW_ID = `9999-01-01.${new ObjectId().toHexString().slice(-6)}`;
```

Unit tests BẮT BUỘC viết mới:

1. `test/use-cases/stats-accumulator.test.ts` (pure — không DB):
   - **Đúng logic:** Entry standard (1 board, 1 line, betCount 1): totals/byPlayType/number/combo delta đúng từng con số; `fixedWorstCase = 1 × tier1 (10tr)`.
   - Entry bao18 betCount 2: `sets = 18564 × 2`; number deltas đúng **18 doc** (không 18.564); comboKey KHÔNG expand; `fixedWorstCase = 37128 × 10tr`; `boardAmount = 18564 × 2 × 10000`.
   - Entry bao5: `sets = 40 × betCount` (40 = 45−5, KHÔNG copy 50 của Power 6/55 — điểm dễ sai nhất khi port); number deltas đúng 5 doc.
   - Entry 6 board hỗn hợp A–F (nhiều hơn Power 6/55 1 board): cộng dồn per-board đúng; `totals.sets = Σ betUnitCount`.
   - `amount >= 30tr` → `largeBetCount = 1`; dưới ngưỡng → 0.
   - 2 board cùng bộ số + cùng playType từ 2 account → 1 combo delta, 2 combo-account delta.
   - **Logic ngược:** `numbers` chưa sort → comboKey ổn định và input KHÔNG bị mutate; board playType lạ/`numbers` rỗng → không throw ngầm nuốt board khác (hành vi copy đúng Power 6/55 — ghi lại kết luận).
2. `test/use-cases/evaluate-alerts.test.ts` (pure) — per rule: dưới ngưỡng (0 alert) / chạm ngưỡng (warn) / điều kiện critical / `enabled[type] = false` (0 alert). Riêng `bao_high_stake`: bao13 (17,16tr < 30tr → KHÔNG bật), bao14 (30,03tr ≥ 30tr → bật), có bao18 → critical. **Logic ngược:** stats doc zero-value (worker mới enroll) → 0 alert, không throw.
3. `test/infras/betting-stats-mapper.test.ts` (pure) — doc skeleton (chỉ watermark) → entity đầy đủ zero-value 12 key `byPlayType`; doc thiếu field lẻ → normalize; doc entry CÓ `lines` qua `entry-for-stats-mapper` → output không chứa `lines`.
4. `test/infras/stats-repos-idempotency.test.ts` (tích hợp staging DB — key duy nhất per-run, KHÔNG cleanup): `applyDelta` gọi 2 lần cùng `batchMaxId` → doc chỉ nhận 1 lần (assert `applied2 === false`, giá trị không double); `bulkUpsertDelta` chạy 2 lần cùng batch → giá trị KHÔNG double; 3 account cùng combo → `countAccountsByCombo` + `syncAccountCounts` → `accountCount = 3`.

Smoke test dev: chạy handler `stats-sync` trỏ DB dev có entry seed → 5 collection có doc; chạy lần 2 → số liệu KHÔNG đổi (idempotent).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Double-count sau crash** (ghi collection con xong, chết trước khi tiến watermark stats doc) | Test tích hợp 4: gọi `writeBatch`/`bulkUpsertDelta` 2 lần cùng batch → MỌI collection giữ nguyên giá trị (watermark `$lt` per-doc chặn từng doc con, không chỉ doc tổng). Test QUAN TRỌNG NHẤT của plan. |
| R2 | **Copy nhầm hằng số Power 6/55** (bao5 = 50 lines, 55 số, tier1 40tr) | Test accumulator bao5 = 40 lines + heatmap 45 số + `fixedWorstCase` theo tier1 10tr — chính là các case "logic ngược" trong test 1. Review đối chiếu `PLAY_TYPE_CONFIGS`/`BAO_COMBINATIONS` Mega 6/45. |
| R3 | **Nổ cardinality do expand lines Bao** | Test accumulator bao18: đúng 1 combo delta + 18 number deltas. Assert tổng delta doc/entry ≤ số board × (1 combo + 18 number + 1 account). |
| R4 | Kéo nhầm `lines` vào projection → RAM/network phình với vé Bao | Review projection + test mapper 3. |
| R5 | Test staging DB rớt rác/đụng data thật | Key `9999-*` + suffix ObjectId per-run (00-overview); grep review mục 7 khẳng định 0 hàm xoá; KHÔNG upsert global config đè doc staging. |
| R6 | `syncAccountCounts` đếm sai khi combo-accounts ghi sau combo | Thứ tự writeBatch: comboAccounts TRƯỚC count sync — test tích hợp 4 (3 account cùng combo → `accountCount = 3`). |
| R7 | Worker chiếm lock chết (Lambda bị kill giữa chừng) | TTL lock 120s = timeout Lambda — kiểm 2 con số khớp nhau khi review yml. |
| R8 | GlobalConfig chưa có `ops` trong DB → worker crash `beforeLoop` | Test use-case với config doc KHÔNG có `ops` (truyền doc object qua mapper — không đụng DB) → chạy bằng defaults. Copy đúng cách Power 6/55 p0-02 đã chốt. |
| R9 | Backlog lần đầu bật worker (kỳ 2–3 ngày tích nhiều entries) | `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000` + budgetMs → hội tụ dần. Test: seed 25k entry (drawId test riêng) → tick 1 xử lý 20k, tick 2 drain nốt, số cuối đúng. |
| R10 | Evaluator tiến cursor khi 1 draw lỗi → alert bị nuốt | Test: mock repo throw ở draw thứ 2/3 → cursor giữ ở draw 1, tick sau đánh giá lại draw 2. |
