# p0-02 — Port `$inc` delta-only + xoá seed/recompute + `TickLoopWorker` + worker-health

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` §5.2 (port `$inc`, gộp
> p2-01) + §5.4 (tick-loop) + §5.8 (worker health) · **Phase:** P0 · **Phụ thuộc:** p0-01 (accumulator
> đã bỏ Set + drain pair/account).
> **Blocks:** p0-03 (worker alert dùng `TickLoopWorker` + `findNotFinal`), p0-04 (`beforeLoop` của base).
> **Bản chuẩn:** Keno `p0-01-worker-core-tick-loop` (base class + refactor) — Pro tái dùng base ĐÃ CÓ.

## Mục tiêu

Đưa doc chính `max3dpro_draw_betting_stats` từ `upsertFull` (`$set` full ~50–60KB/tick) sang `applyDelta`
(`$inc` path) + xoá 2 band-aid nặng: `seed()` (cross-invocation) và `recomputeClosedDraws` (full RAM 10⁶
pairs — nặng nhất 4 game). Đồng thời chuyển vòng lặp tick lên `TickLoopWorker` (worker-core, đã ship) và
tiêu thụ worker-health (`recordStalledItem`/`clearStalledItem`).

Đây là bước "gộp p2-01 + simplification" — Pro chưa từng làm p2-01, nên áp thẳng mô hình đích.

**KHÔNG thuộc plan này:** tách worker ops-alerts (p0-03); doc tối giản + mapper normalize (p0-04). Ở p0-02,
`evaluateDrawAlerts` VẪN nằm inline trong sync (gỡ ở p0-03) — chỉ đổi mô hình GHI, chưa tách vai.

## Pattern tham chiếu

- Keno `sync-betting-stats.ts` (SAU refactor) — mẫu `extends TickLoopWorker` + `beforeLoop`/`resolveTickMs`/
  `runTick`/`buildResult` + `recordStalledItem`/`clearStalledItem` + `LockTakenOverError`.
- Keno `betting-stats-repo.ts` `applyDelta`/`findNotFinal`/`stampFinal` — mẫu `$inc` path + docPath.
- Pro `betting-stats-repo.ts:54-59` (`upsertFull` — cái bị thay), `stats-accumulator.ts:263-325`
  (`toSnapshot` → đổi thành `toDelta`), `sync-betting-stats.ts` toàn bộ.
- `worker-core/src/use-cases/lock/{tick-loop-worker,single-run-worker}.ts` (base + API stalled-items).

## 1. Repo — `applyDelta` + `findNotFinal` + `stampFinal` (thay `upsertFull`)

`betting-stats-repo.ts`. `const f = docPath<Max3dproDrawBettingStatsDoc>()`.

### 1.1. `applyDelta(drawId, delta)` — `$inc` path per-doc

```typescript
/**
 * Cộng dồn delta 1 batch entries vào doc stats bằng $inc (conditional watermark).
 *
 * Filter {drawId, lastEntryId < newWatermark} (hoặc lastEntryId thiếu) → idempotent:
 * batch trùng KHÔNG cộng lại. $inc: totals (5 field), byPlayType.<mode> (amount/units/boards/entries),
 * tripletStakes.<t> (units/amount/boards — SPARSE dynamic path, triplet "000".."999" validated
 * place-bet, an toàn — §6 Q). byTenant.<tid> (amount/entries/commission). $set lastEntryId+updatedAt.
 * $inc tự tạo mọi path lồng còn thiếu → doc tối giản (p0-04) vẫn đúng.
 * pairKey ORDERED KHÔNG ghi ở đây — pair_stats/account_stats là collection phụ (p0-01).
 */
async applyDelta(drawId: string, delta: Max3dproStatsDelta): Promise<boolean>
```

`Max3dproStatsDelta` = shape delta (totals/byPlayType/tripletStakes/byTenant/topPotentialPush/newWatermark).
Build `$inc` object bằng helper `incBy` lọc field 0 (không ghi path thừa). `topPotential`: `$push` +
`$each/$sort:{potentialWin:-1}/$slice:topPotentialK` (giữ top-K không cần seed).

### 1.2. `findNotFinal(limit?)` — hàng đợi

```typescript
/** Kỳ stats chưa final — hàng đợi worker. Filter {final:false}, index {final:1}. */
async findNotFinal(limit = 50): Promise<Max3dproDrawBettingStatsEntity[]>
```

### 1.3. `stampFinal(drawId)` — đóng dấu (idempotent)

```typescript
/** Đóng dấu final (drained + terminal). Filter {drawId, final:false} → $set final:true, updatedAt. */
async stampFinal(drawId: string): Promise<boolean>
```

### 1.4. XOÁ `upsertFull`. (Nếu p0-01 recompute-cầu-tạm còn gọi → cũng xoá theo recompute §3.)

## 2. Accumulator — `seed()` XOÁ, `toSnapshot` → `toDelta`

`stats-accumulator.ts`.

- **XOÁ `seed()` hoàn toàn** (`:115-154`) + tham số `baseline` trong constructor. Accumulator giờ THUẦN
  delta-only: cộng entries đọc trong invocation này, xuất DELTA. Không seed cross-invocation.
- **XOÁ** mọi field seed cross-invocation (`revenue`/`entries`/`sets`... KHỞI TẠO 0, chỉ cộng delta batch).
  Watermark `lastEntryId` vẫn theo entry cuối đã cộng (cho `applyDelta` filter).
- **`toSnapshot` → `toDelta(config)`**: trả `Max3dproStatsDelta` (totals delta, byPlayType delta,
  tripletStakes delta Map, byTenant delta, topPotential mảng để `$push`, newWatermark). BỎ `final` (giờ
  do `stampFinal` riêng). BỎ `topPairs`/`topAccounts` (đã xoá p0-01, drain sang collection phụ).
- pair/account drain (p0-01) GIỮ — nhưng giờ ĐỒNG NHẤT mô hình: cả doc chính lẫn pair/account đều là
  delta-invocation `$inc`. Không còn "totals full + pair delta" như cầu tạm p0-01 → mấu chốt cộng-đôi
  p0-01 §3 BIẾN MẤT (mọi đường đều delta). GHI RÕ: sau p0-02, accumulator KHÔNG bao giờ seed từ baseline.

## 3. XOÁ `recomputeClosedDraws` + `POST_CLOSE_STATUSES` + `RECOMPUTE_PAGE_SIZE`

`sync-betting-stats.ts:64-73, 236-270`. XOÁ hoàn toàn (analysis §5.2 cảnh báo `$inc` + recompute = cộng
đôi/che drift). Thay bằng cơ chế đóng sổ drained + terminal (§4). Đây là lợi ích LỚN NHẤT của Pro (recompute
giữ map 10⁶ pairs + Set trong RAM — bỏ được là hạ RAM nhiều nhất).

## 4. Đóng sổ — drained + terminal → `stampFinal` (KHÔNG recompute, KHÔNG kiểm)

Trong `runTick` (sau p0-01/p0-02): với mỗi kỳ trong `findNotFinal`, drain entries qua watermark; nếu drain
xong (batch < READ_BATCH) VÀ draw status ∈ terminal (`Settled`/`Void`) → `stampFinal`. KHÔNG count-check,
KHÔNG rebuild (nguyên tắc chung #3). Status đọc qua `drawRepo.getUnfinishedDraws`/`getDrawsByIds` hoặc
1 method `getStatusesByDrawIds` (mẫu Keno). Rủi ro tồn dư watermark chấp nhận (ops-only).

## 5. `extends TickLoopWorker` + worker-health

`sync-betting-stats.ts`.

| Trước | Sau |
|---|---|
| `extends SingleRunWorker<void, SyncBettingStatsResult>` | `extends TickLoopWorker<void, SyncBettingStatsResult>` |
| `BUDGET_MS = 55_000` + vòng `while` trong `runLocked` | XOÁ — base lo (default 55s) |
| `runLocked` đọc config + build prize + loop | `beforeLoop` (đọc config, build `prize`/`statsConfig`, reset counters) + `resolveTickMs` |
| `private runTick(prize, stats, alerts)` | `protected runTick(): Promise<TickOutcome>` đọc field instance |
| counters cộng trong `runLocked` | field private, cộng trong `runTick`, gắn `buildResult` |

Field instance PHẢI reset trong `beforeLoop` (container reuse — bug dễ nhất). `resolveLockKey` giữ
`"max3dpro:stats-sync"`. `ttlSeconds = 120`.

**Worker-health (§5.8 analysis) — thêm ~3 dòng:**
- Trong `runTick`, mỗi kỳ bọc `try/catch`. Success (drain xong 1 kỳ không lỗi) → `this.clearStalledItem(drawId)`.
- `catch`: kiểm `instanceof LockTakenOverError` → **re-throw** (đừng nuốt — bài học Keno defect p0-01);
  ngược lại `this.recordStalledItem(drawId, error)` + `logError` + đếm `failed`, KHÔNG throw (1 kỳ bẩn
  không chết cả tick).
- Thêm `protected readonly description = "Max 3D Pro stats sync worker"` (worker-core `$set` vào lock doc,
  trang BO `/system/workers` hiển thị).
- KHÔNG thêm alert `worker_stuck` (Pro chưa từng có — grep 0; nguyên tắc chung / analysis §5.7).

`LockTakenOverError`: copy mẫu Keno (class riêng, `syncDraw` throw khi `extendLock()` false).

## 6. `stats.yml` + handler + JSDoc

- `stats.yml`: `stats-sync` GIỮ (chưa thêm ops-alerts — đó là p0-03).
- Handler `stats-sync.ts`: JSDoc XOÁ dòng `recomputeFull lúc salesClosed sửa chính xác` (`:12-13`) — cơ
  chế đã xoá. Sửa thành mô tả delta-only + đóng sổ drained+terminal.
- JSDoc class sync worker: bỏ bước "Safety-net recompute", "conditional write" mô tả lại theo `$inc`;
  cadence chuyển về base.

Câu hỏi `tripletStakes` `$inc` dynamic path: **đã xác nhận an toàn** (analysis §6 — triplet validated
place-bet như Max3D). Không cần check thêm.

## 7. Index — `{final:1}`

`indexes/index.ts`, thêm vào `BettingStats`: `key:{final:1}` `name:"idx_final"` — `findNotFinal`. Tạo tay
Atlas trước deploy.

## 8. Danh sách file

| File | Việc |
|---|---|
| `.../repos/betting-stats-repo.ts` | +`applyDelta`/`findNotFinal`/`stampFinal`, xoá `upsertFull` (§1) |
| `.../operations/stats-accumulator.ts` | xoá `seed()`+baseline, `toSnapshot`→`toDelta` (§2) |
| `.../operations/sync-betting-stats.ts` | extends `TickLoopWorker`, xoá recompute, đóng sổ, worker-health (§3–5) |
| `.../repos/types/betting-stats.types.ts` | +`Max3dproStatsDelta` |
| `apps/worker-max3dpro/src/handlers/stats/stats-sync.ts` | JSDoc (§6) |
| `game-max3dpro/src/indexes/index.ts` | +`idx_final` (§7) |

KHÔNG chạm: pair/account repo (p0-01), evaluate-alerts logic (chỉ vẫn gọi inline), matching/prize rules.

## 9. Đánh giá & verify

1. `check-types` `@megawin/game-max3dpro-application` + `@megawin/worker-max3dpro` + `@megawin/game-max3dpro`.
2. **Grep dead code:** `rg "upsertFull|recomputeClosedDraws|POST_CLOSE_STATUSES|RECOMPUTE_PAGE_SIZE|\.seed\("
   packages/game-max3dpro-application` → 0 match.
3. **Idempotent `$inc`:** chạy 2 invocation, kỳ không cược mới → totals KHÔNG đổi (filter watermark chặn
   cộng đôi). Batch trùng → không cộng.
4. **Đóng sổ:** kỳ settle → drain xong + terminal → `final:true`; invocation sau `findNotFinal` không trả
   kỳ đó. Kỳ `SalesClosed` (chưa terminal) → CHƯA final (chờ Settled/Void).
5. **Worker-health dev:** chèn entry data bẩn → `recordStalledItem(drawId)` ghi `worker_locks.stalledItems`;
   trang `/system/workers` hiện; sửa data → `clearStalledItem` gỡ.
6. **Container reuse:** grep field instance sync worker → mọi mutable reset trong `beforeLoop`.
7. So sánh số liệu doc trước/sau (dev): totals/byPlayType/tripletStakes khớp bản `upsertFull` cũ.

## 10. Review code & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | `$inc` cộng đôi do watermark filter sai | 🔴 | §9.3 test 2 invocation. Filter `applyDelta` = `{drawId, lastEntryId<new}` atomic |
| 2 | `seed()` xoá sót → còn nhánh seed baseline cộng đôi | 🔴 | Grep `\.seed(` = 0; accumulator constructor không nhận baseline |
| 3 | `recomputeClosedDraws` xoá nhưng đóng sổ mới sót kỳ terminal → final không bao giờ set | 🟠 | §9.4; logic drained+terminal đúng; `stampFinal` idempotent |
| 4 | `LockTakenOverError` bị `catch` nuốt (defect Keno p0-01) → worker chạy song song owner mới | 🔴 | `catch` re-throw `instanceof LockTakenOverError` TRƯỚC đếm failed |
| 5 | Container reuse giữ counters/prize cũ | 🔴 | `beforeLoop` reset toàn bộ mutable |
| 6 | `tripletStakes` dynamic path `$inc` sai key | 🟢 | Đã xác nhận an toàn (validated place-bet) |
| 7 | `recordStalledItem`/`description` sai tên API (dùng `*ItemFailure` cũ) | 🟠 | Tên canonical `recordStalledItem`/`clearStalledItem` (worker-core đã ship) |
| 8 | `idx_final` chưa tạo Atlas → COLLSCAN findNotFinal | 🟠 | Checklist deploy |

Quy trình: (a) diff accumulator — seed xoá sạch; (b) đọc `applyDelta` filter watermark; (c) đóng sổ logic;
(d) `catch` re-throw lock; (e) verify.

## 11. Rollback

Revert code. Doc đã ghi bằng `$inc` (không có `topPairs`/`topAccounts`) không tương thích ngược với
`upsertFull` cũ + `seed()` (seed đọc `b.topPairs`) → rollback = revert cả p0-01 + p0-02 cùng lúc. Vì dự án
chưa deploy production, không có doc thật cần dọn (bài học Keno Q5 "chưa deploy → không lớp tương thích").




