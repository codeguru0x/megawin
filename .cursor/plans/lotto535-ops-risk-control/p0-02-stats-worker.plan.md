# p0-02 — Stats Worker: Repos + Accumulator + 2 Worker Use-cases + Deploy

> **Nguồn:** `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.1 (bất biến), §4 (worker), §3.5–§3.7 (combo/exposure/alerts)
> **Phase:** P0 · **Thứ tự:** 02 · **Phụ thuộc:** p0-01 (entities + index + combo-key).
> **Package đích:** `packages/game-lotto535-application` + `apps/worker-lotto535`.

## Mục tiêu

Dựng đường ghi pre-aggregated hoàn chỉnh: entries insert-stream → accumulator delta-only → 5 collection stats + alerts, chạy bằng 2 `TickLoopWorker` độc lập deploy Lambda cron 1 phút. Sau plan này, data đã đầy — p0-03 chỉ đọc.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Power 6/55 production (p0-02 đã done, 79 test pass) |
|---|---|
| Repo stats/alert (+ types tách) | `packages/game-power655-application/src/infras/repos/{betting-stats,number-stats,account-stats,combo-stats,combo-accounts,ops-alert}-repo.ts` + `repos/types/betting-stats.types.ts` |
| Mapper (seed/normalize lúc ĐỌC) | `packages/game-power655-application/src/infras/mappers/{betting-stats,number-stats,account-stats,combo-stats,combo-account,ops-alert,entry-for-stats}-mapper.ts` |
| Accumulator pure | `packages/game-power655-application/src/use-cases/operations/stats-accumulator.ts` |
| Worker sync | `.../operations/sync-betting-stats.ts` |
| Worker eval + rules pure | `.../operations/evaluate-ops-alerts.ts` + `evaluate-alerts.ts` |
| Handler + yml + serverless | `apps/worker-power655/src/handlers/stats/{stats-sync,ops-alerts}.ts` · `apps/worker-power655/src/functions/stats.yml` · `apps/worker-power655/serverless.yml` |
| Unit test mẫu | `packages/game-power655-application/test/use-cases/{stats-accumulator,evaluate-alerts}.test.ts`, `test/infras/{betting-stats-mapper,stats-repos-idempotency}.test.ts` |

## File & thay đổi

### 1. TẠO 6 repos trong `packages/game-lotto535-application/src/infras/repos/`

Copy nguyên method-set Power 6/55 (repo class thuần theo `mongodb.mdc`, param types tách `repos/types/`, field path qua `docPath<TDoc>()`):

- `betting-stats-repo.ts` — `ensureDocs(drawIds)` (`$setOnInsert {final: false, lastEntryId: MIN_OBJECT_ID}` — CHỈ seed watermark/final, KHÔNG seed field nghiệp vụ), `findNotFinal(limit)` (**projection mỏng** `{drawId: 1, lastEntryId: 1}`), `applyDelta(drawId, delta, batchMaxId, topPotentialK)` (**1 lệnh `updateOne` duy nhất**: filter `{drawId, lastEntryId: {$lt: batchMaxId}}` + `$inc` counters + `$push {$each, $sort: {fixedPotential: -1}, $slice: K}` topPotential + `$set {lastEntryId, updatedAt}`), `stampFinal(drawId)`, `findChangedSince(cursor, limit)`, `findByDrawId(drawId)`.
- `number-stats-repo.ts` — `bulkUpsertDelta(deltas[])` (`bulkWrite {ordered: false}`, mỗi op filter `{drawId, kind, number, lastEntryId: {$lt}}` upsert `$inc {sets, amount, boards}` + `$setOnInsert {createdAt}`) — **KHÁC Power 6/55: filter/unique key có thêm `kind`**; `findByDrawId(drawId)` (≤47 docs, sort `{kind: 1, number: 1}`); `findByDrawIdAndKind(drawId, kind)` (input rule `special_skew` — ≤12 docs).
- `account-stats-repo.ts` — `bulkUpsertDelta` (`$inc {amount, entries, sets}` + `$set {username}`), `findTopByAmount(drawId, k)` (index `{drawId, amount: -1}`), `countByDrawId(drawId)` (→ `uniquePlayers`).
- `combo-stats-repo.ts` — `bulkUpsertDelta` (`$inc {sets, amount}` + `$setOnInsert {playType, mainNumbers, specialNumbers}` — thêm `specialNumbers` so với Power 6/55), `findTopBySets(drawId, k)`, `findConcentrated(drawId, minAccounts, limit)`, `syncAccountCounts(pairs)` (`$set` tuyệt đối), `findByComboKey(drawId, comboKey)`.
- `combo-accounts-repo.ts` — `bulkUpsertDelta`, `countAccountsByCombo(drawId, comboKeys[])` (aggregation `$match`+`$group` — chấp nhận ở TẦNG GHI worker, cấm ở read path BO), `listByCombo(drawId, comboKey)`.
- `ops-alert-repo.ts` — `bulkUpsertByDedupe(alerts[])` (upsert `{drawId, dedupeKey}`, `$setOnInsert` createdAt/status New, `$set` severity/payload/updatedAt — alert đã Ack KHÔNG hạ về New), `listByFilter`, `ackById` (filter `{_id, status: New}`), `countByStatus(drawId)`.

Đăng ký barrel `repos/index.ts` + `repos/types/index.ts`.

### 2. TẠO mappers trong `src/infras/mappers/`

`betting-stats-mapper.ts` là chốt schema-evolution: doc DB thiếu field → entity ĐẦY ĐỦ zero-value (`totals` = 0, **`byPlayType` seed đủ 13 key từ `Object.values(Lotto535StatsPlayKey)`** — KHÔNG hardcode danh sách, `exposure.fixedWorstCase: 0`, `topPotential: []`). JSDoc header: "Normalize tại tầng ĐỌC — không seed skeleton lúc ghi (analysis §7.4)". Mapper mỏng tương tự cho number/account/combo/combo-account/alert + `entry-for-stats-mapper.ts`.

### 3. SỬA `src/infras/repos/entry-repo.ts` — thêm `getEntriesForStatsAfter`

Copy chữ ký Power 6/55: `(drawId, afterId, limit)` → `find({drawId, _id: {$gt: afterId}}).sort({_id: 1}).limit(limit)` với **projection đúng field cần**: `_id, accountId, username, tenantId, amount, betUnitCount, tenant.commissionAmount, entrySummary.boards`. KHÔNG kéo `lines`/`payout` — board mainCover15 có 3.003 lines, kéo nhầm là nổ RAM. Index hậu thuẫn theo kết luận p0-01 mục 8.

### 4. TẠO `src/use-cases/operations/stats-accumulator.ts` — pure, delta-only

`Lotto535StatsAccumulator` (class thuần không I/O). Constructor nhận `PrizeContext {tier1}` + `largeBetAmount` + `unitPrice`. JSDoc class: "Delta-only: KHÔNG đọc baseline DB (bất biến §3.1); giá trị RAW — biến đổi ở tầng đọc". `add(entry)` sinh delta theo analysis §4.3:

- `totals`: `revenue += amount`, `entries += 1`, `sets += betUnitCount`, `commission += tenant.commissionAmount` (đối chiếu field thật trên `TicketEntryDoc` lúc implement), `largeBetCount += amount >= largeBetAmount ? 1 : 0`.
- Per board trong `entrySummary.boards`: `boardAmount = expandedLines × betCount × unitPrice`; `byPlayType[toStatsPlayKey(board)]` (import từ domain p0-01 — KHÔNG viết lại logic map) `{amount += boardAmount, sets += expandedLines × betCount, boards += 1}` — comment vì sao `boards` không nhân betCount.
- `byTenant[tenantId]`: `{amount, entries, commission}`.
- `exposure.fixedWorstCase += betUnitCount × tier1` — comment công thức + "tier2–5/consolation < tier1 nên không tách; split KHÔNG cộng (§3.6)".
- `topPotential` candidate `{entryId, accountId, username, amount, fixedPotential: betUnitCount × tier1}`.
- **Number deltas 2 CHIỀU** (khác Power 6/55): per số trong `board.mainNumbers` → delta `kind=Main`; per số trong `board.specialNumbers` → delta `kind=Special` — mỗi delta `{sets += expandedLines × betCount, amount += boardAmount, boards += 1}` (cộng TRỌN board, không chia). Comment: "1 board mainCover15 chạm đúng 15 doc main + 1 doc special — KHÔNG expand 3.003 lines".
- Combo deltas: key qua `buildComboKey(playType, mainNumbers, specialNumbers)` (rule p0-01 — sort bản copy, KHÔNG mutate input); combo-account delta per (comboKey × accountId).

Xuất `drainStatsDelta() / drainNumberDeltas() / drainAccountDeltas() / drainComboDeltas() / drainComboAccountDeltas()`.

### 5. TẠO `src/use-cases/operations/sync-betting-stats.ts`

`SyncBettingStatsUseCase extends TickLoopWorker<void, SyncBettingStatsResult>` — copy khung Power 6/55, đổi wiring:

- Constants giữ nguyên: `READ_BATCH = 1_000`, `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000`, `MAX_DRAWS_PER_TICK = 200` (comment: Lotto 5/35 thường chỉ 1 kỳ active/2 kỳ ngày — giữ hằng đồng nhất codebase).
- `beforeLoop`: đọc GlobalConfig 1 lần qua đường có merge-default `ops` (nếu p0-03 chưa merge → worker tự merge `DEFAULT_LOTTO535_CONFIG.ops` — copy đúng cách Power 6/55 đã giải quyết R7, ghi kết luận vào plan) → `PrizeContext {tier1 = prizes.tier1}` + `statsConfig`; enroll `drawRepo.listUnfinishedDrawIds()` → `statsRepo.ensureDocs`.
- `resolveTickMs = statsConfig.tickSeconds × 1000`. Lock `"lotto535:stats-sync"`, `ttlSeconds: 120`, `budgetMs: 55_000`.
- `runTick`: per-draw `syncDraw` bọc `try/catch` riêng (1 kỳ lỗi → `recordStalledItem`, KHÔNG chết tick): đọc batch → accumulator → `writeBatch` đúng thứ tự §4.2(3): **comboAccounts → comboStats → `countAccountsByCombo` + `syncAccountCounts` → accountStats → numberStats → stats doc CUỐI** (stats doc mang watermark tổng: crash giữa chừng → watermark chưa tiến → tick sau ghi lại → `$lt` per-doc + duplicate 11000 chặn → hội tụ). Comment khối này giải thích vì sao stats doc ghi cuối.
- `extendLock()` trong vòng đọc batch; mất lock → `LockTakenOverError`.
- Draw TERMINAL (`Settled`/`Void`) + drained → `stampFinal`. KHÔNG stamp ở `SalesClosed`.

### 6. TẠO `src/use-cases/operations/evaluate-alerts.ts` (pure) + `evaluate-ops-alerts.ts`

- `evaluate-alerts.ts` — pure function `evaluateAlerts(stats, concentratedCombos, specialNumberStats, opsConfig, unitPrice)` với **5 rule** đúng bảng analysis §4.4 (thêm param `specialNumberStats` so với Power 6/55):
  - `large_bet`: `totals.largeBetCount > 0`; Critical ≥ 10.
  - `exposure_threshold`: `fixedWorstCase ≥ fixedExposureWarnAmount`; Critical ≥ 2×.
  - `combo_concentration`: per combo `accountCount ≥ comboAccountsWarn`; Critical ≥ 2×; dedupeKey `combo:${comboKey}`.
  - `cover_high_stake`: lặp `byPlayType` các key `mainCover6`..`mainCover15` (dẫn xuất từ `Lotto535StatsPlayKey` — KHÔNG hardcode chuỗi), bật khi `boards > 0 && C(N,5) × unitPrice >= coverHighStakeAmount` (bảng C(N,5) lấy từ `rules/play-types.ts` domain — TÁI DÙNG, không chép số); Critical khi key = `mainCover15`.
  - `special_skew` (MỚI): `totalSpecial = Σ amount(kind=special)`; bật khi tồn tại số có `amount / totalSpecial ≥ specialSkewRatio` VÀ `totalSpecial ≥ specialSkewMinAmount`; Critical khi tỷ trọng ≥ 2× ratio; dedupeKey `special_skew:${number}`. Guard chia 0 khi `totalSpecial === 0` (không bật).
  - Mỗi rule respect `enabled[type]`. Comment từng rule trỏ về JSDoc alert type (p0-01 mục 5).
- `evaluate-ops-alerts.ts` — `EvaluateOpsAlertsUseCase extends TickLoopWorker`, lock `"lotto535:ops-alerts"`, `ttlSeconds: 120`, `MAX_DOCS_PER_TICK = 50`, `MAX_CONCENTRATED_COMBOS = 50`; cursor = max `updatedAt` đã đánh giá, persist qua `setCursor` trên lock doc (at-least-once — an toàn nhờ upsert dedupe); per doc gọi thêm `numberStatsRepo.findByDrawIdAndKind(drawId, Special)` (≤12 docs); lỗi 1 kỳ → break, KHÔNG tiến cursor. Evaluator **không bao giờ** import entry-repo.

Barrel `operations/index.ts`: export mới, GIỮ export cũ (xoá ở p0-03).

### 7. Worker app `apps/worker-lotto535/`

- TẠO `src/handlers/stats/stats-sync.ts` + `src/handlers/stats/ops-alerts.ts` — copy handler Power 6/55 (singleton use-case, `.run()`, wiring repos theo DI hiện hành của app).
- TẠO `src/functions/stats.yml` — copy `apps/worker-power655/src/functions/stats.yml`: 2 function `statsSync`/`opsAlerts`, `timeout: 120` (= lock TTL), `cron(* * * * ? *)`.
- SỬA `serverless.yml`: khối `functions:` thêm `- ${file(src/functions/stats.yml)}`.

## Nguyên tắc MongoDB áp trong plan này

1. **Idempotency 2 lớp**: filter `lastEntryId: {$lt: batchMaxId}` per-doc + unique index (p0-01). Duplicate key 11000 trong `bulkWrite {ordered: false}` là no-op ĐÚNG THIẾT KẾ — catch đúng code 11000, mọi code khác throw.
2. `$inc` + `$set` watermark trong **cùng 1 update op** — nguyên tử trên 1 doc.
3. `$setOnInsert` tách khỏi `$inc` — không ghi đè field bất biến (`playType`, `mainNumbers`, `specialNumbers`, `createdAt`).
4. Projection mỏng ở mọi query hàng đợi.
5. Sort luôn có index hậu thuẫn (p0-01) — verify bằng `explain` khi review.
6. KHÔNG `$where`/`$expr` trong filter worker.

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục; so từng file với file Power 6/55 tương ứng — sai khác ngoài danh mục diverge (number-stats có `kind` + 2 chiều delta, comboKey có special, 13 play key, rule `special_skew`, `cover_high_stake`) = red flag.
2. Kiểm thứ tự `writeBatch`: stats doc (watermark tổng) PHẢI ghi cuối — đọc code + comment.
3. Grep cấm: `rg "upsertFull|recomputeFull|resetFinal" packages/game-lotto535-application` = 0; projection stats không kéo `lines|payout`.
4. Kiểm pure: `stats-accumulator.ts` và `evaluate-alerts.ts` không import gì từ `infras/` (grep import path) — unit-test không cần DB.
5. Kiểm TÁI DÙNG domain: accumulator import `toStatsPlayKey` + `buildComboKey` từ `@megawin/game-lotto535` (grep) — 0 logic map/key viết lại trong application.
6. JSDoc: 2 use-case class ghi pipeline position + CRASH-SAFE/IDEMPOTENT; repo method có JSDoc side-effect.
7. **Rà rủi ro logic đặc thù khi review**: (a) delta `kind=special` có `boardAmount` TRỌN board (không chia đôi main/special); (b) unique filter number-stats đủ 3 chiều `{drawId, kind, number}` — thiếu `kind` là số "07" main và "07" special đè nhau; (c) `special_skew` guard chia 0; (d) `cover_high_stake` dùng C(N,5) từ domain rules, không chép bảng số vào evaluator.
8. `explain("executionStats")` trên DB staging cho `findNotFinal` / `findTopByAmount` / `findConcentrated` / `findByDrawIdAndKind` → `IXSCAN`, không `COLLSCAN`.

## Cách test

```bash
pnpm --filter @megawin/game-lotto535-application check-types
pnpm --filter @megawin/game-lotto535-application test
pnpm --filter @megawin/worker-lotto535 check-types
```

> **QUY TẮC DB STAGING CHUNG (00-overview — BẮT BUỘC):** test integration chạy trên DB staging dùng chung (env qua `vitest.config.ts` sẵn có). **CẤM `deleteMany`/`drop*`/helper cleanup.** Mỗi test seed bằng `drawId`/`accountId`/`comboKey` NGẪU NHIÊN duy nhất (`crypto.randomUUID()` hoặc drawId giả ngày quá khứ xa), CHỈ assert trên doc mình vừa seed (find theo key vừa sinh), so DELTA giữa 2 lần đọc thay vì giá trị tuyệt đối. Doc có `createdAt` thật để TTL tự dọn.

Unit tests PURE (không DB — ưu tiên tối đa):

1. `test/use-cases/stats-accumulator.test.ts`:
   - **Đúng logic** — entry standard (1 board, 1 line, betCount 1): totals/byPlayType/number/combo delta đúng từng con số; number deltas đúng 5 main + 1 special; `fixedWorstCase = 1 × tier1 = 10tr`.
   - Entry mainCover15 betCount 2: `sets = 3003 × 2 = 6006`; number deltas đúng **15 doc main + 1 doc special** (KHÔNG 3.003); comboKey KHÔNG expand; `fixedWorstCase = 6006 × tier1`; `boardAmount = 3003 × 2 × 10000`; byPlayType key = `"mainCover15"`.
   - Entry specialCover K=12: number deltas 5 main + **12 special**; `sets = 12 × betCount`; key = `PlayType.SpecialCover` (gộp — không tách theo K).
   - Entry mainCover4: 31 lines → `sets = 31 × betCount`, key = `PlayType.MainCover4`.
   - Vé 5 board hỗn hợp: cộng dồn per-board đúng; `totals.sets = Σ betUnitCount` toàn entry.
   - `amount >= 30tr` → `largeBetCount = 1`; dưới ngưỡng → 0.
   - 2 board cùng bộ số (main + special) cùng playType từ 2 account → 1 combo delta, 2 combo-account delta.
   - **Logic ngược/sai**: `mainNumbers`/`specialNumbers` chưa sort → comboKey ổn định VÀ input KHÔNG bị mutate; 2 board main giống nhau nhưng special khác → 2 combo delta RIÊNG (R6 p0-01); board mainCover 6 số vs 7 số → 2 key byPlayType khác nhau (không gộp).
2. `test/use-cases/evaluate-alerts.test.ts` — per rule 4 trạng thái: dưới ngưỡng (0 alert) / chạm ngưỡng (warn) / điều kiện critical / `enabled[type] = false` (0 alert). Riêng:
   - `cover_high_stake`: mainCover12 (`C(12,5)=792 × 10k = 7,92tr < 10tr` → KHÔNG bật), mainCover13 (`1287 × 10k = 12,87tr ≥ 10tr` → bật), có mainCover15 → critical.
   - `special_skew` (**test kỹ nhất — rule mới**): (a) 12 số đều nhau (~8,3% mỗi số) → 0 alert; (b) 1 số chiếm 40% & `totalSpecial = 100tr ≥ 50tr` → warn, dedupeKey `special_skew:07`; (c) 1 số chiếm 80% → critical; (d) **logic ngược**: 1 số chiếm 100% NHƯNG `totalSpecial = 1tr < specialSkewMinAmount` → 0 alert (chống nhiễu kỳ vắng); (e) `totalSpecial = 0` → 0 alert, KHÔNG chia 0/NaN; (f) 2 số cùng vượt ratio → 2 alert dedupeKey khác nhau.
3. `test/infras/betting-stats-mapper.test.ts` — doc skeleton (chỉ watermark) → entity đầy đủ zero-value **13 key** `byPlayType`; doc thiếu field lẻ → normalize; doc có field → giữ nguyên giá trị (không đè 0).

Test tích hợp repo (STAGING-SAFE — `test/infras/stats-repos-idempotency.test.ts`, mirror file cùng tên Power 6/55):

4. `applyDelta` gọi 2 lần cùng `batchMaxId` trên drawId random → đọc doc sau lần 1 và sau lần 2 → giá trị KHÔNG ĐỔI (watermark chặn).
5. `bulkUpsertDelta` (number/account/combo) chạy 2 lần cùng batch trên key random → KHÔNG double; đặc biệt number-stats: seed cùng `number: "07"` với `kind: main` và `kind: special` → 2 doc RIÊNG BIỆT (unique 3 chiều).
6. `syncAccountCounts`: seed 3 combo-account docs (accountId random) cùng comboKey random → `accountCount = 3`.
7. `bulkUpsertByDedupe`: upsert 2 lần cùng dedupeKey → 1 doc; ack rồi upsert lại → status GIỮ `ack` (không hạ về New); `ackById` 2 lần → lần 2 no-op.

Smoke test local: chạy handler `stats-sync` trỏ DB staging với kỳ dev đang có entry → 5 collection có doc; chạy lần 2 → số liệu KHÔNG đổi (idempotent). KHÔNG xoá gì sau smoke test.

## Rủi ro & cách test rủi ro (review đề phòng)

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Double-count sau crash** (ghi collection con xong, chết trước khi tiến watermark stats doc) | Test tích hợp 4–5: gọi ghi 2 lần cùng batch → MỌI collection giữ nguyên delta (watermark `$lt` per-doc chặn từng doc con). Test QUAN TRỌNG NHẤT của plan. |
| R2 | **Nổ cardinality do expand lines mainCover** | Test accumulator mainCover15: đúng 1 combo delta + 15+1 number deltas. Assert tổng delta doc/board ≤ (1 combo + N main + K special + 1 account). |
| R3 | Kéo nhầm `lines`/`payout` vào projection → RAM phình với vé mainCover | Review projection + test mapper `entry-for-stats` với doc entry CÓ `lines` → output không chứa `lines`. |
| R4 | Number stats thiếu chiều `kind` trong filter upsert → main/special đè nhau | Test tích hợp 5 (2 doc riêng biệt) + review filter đủ 3 chiều. Rủi ro đặc thù dễ nhất khi copy từ Power 6/55 (vốn 1 chiều). |
| R5 | `special_skew` chia 0 / NaN khi kỳ chưa có cược special | Test 2(e). Review guard trước phép chia. |
| R6 | `syncAccountCounts` đếm sai khi combo-accounts ghi sau combo | Thứ tự writeBatch: comboAccounts TRƯỚC count sync — test tích hợp 6. |
| R7 | GlobalConfig chưa có `ops` trong DB staging → worker crash `beforeLoop` | Test use-case với config doc KHÔNG có `ops` → chạy bằng `DEFAULT_LOTTO535_CONFIG.ops` (copy cách Power 6/55 chốt R7 — ghi kết luận vào plan khi implement). |
| R8 | Backlog lần đầu bật worker (kỳ đang mở tích nhiều entries) | `MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000` + budgetMs → hội tụ dần. Test pure: accumulator xử lý batch 1.000 entry hỗn hợp không lệch tổng (Σ delta = Σ tính tay theo công thức). |
| R9 | Evaluator tiến cursor khi 1 draw lỗi → alert bị nuốt | Test unit: mock repo throw ở draw 2/3 → cursor giữ ở draw 1, tick sau đánh giá lại draw 2. |
| R10 | Test staging ghi đè kỳ THẬT đang chạy (drawId trùng) | Quy ước drawId test = ngày quá khứ xa (vd `"2000-01-01.xxx"` + random) — không bao giờ trùng kỳ live. Review test file: 0 drawId "hôm nay". |
| R11 | Worker chiếm lock chết (Lambda kill giữa chừng) | TTL lock 120s = timeout Lambda — kiểm 2 con số khớp khi review yml. |

## Định nghĩa Done

check-types 2 package pass, toàn bộ test pure + integration (staging-safe) pass, smoke test handler idempotent trên staging, grep cấm sạch (kể cả `deleteMany|drop` trong test mới = 0), cập nhật bảng trạng thái `00-overview.md`.
