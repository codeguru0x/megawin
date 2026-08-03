# p0-03 — Tách worker `max3dpro:ops-alerts` khỏi `max3dpro:stats-sync`

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` §5.3 · **Phase:** P0 ·
> **Phụ thuộc:** p0-02 (`TickLoopWorker`, `findNotFinal`, mô hình `$inc`), p0-01 (`pair_stats` cho
> pair_liability/combo_concentration).
> **Blocks:** p1-01 (Q1 rà JSDoc sau tách).
> **Bản chuẩn:** Keno `p0-02-keno-split-ops-alerts-worker`.

## Mục tiêu

Sau p0-02, accumulator delta-only → evaluator KHÔNG còn "data sẵn trong RAM", phải đọc lại stats doc từ
DB. Nó là consumer ĐỌC nằm nhầm trong đường GHI: ăn chung budget 55s, lỗi rule alert đếm vào `failed` của
sync, backlog sync làm alert trễ. Tách worker riêng `max3dpro:ops-alerts`:

- **Vai duy nhất:** đọc stats docs ĐÃ ĐỔI kể từ cursor → `evaluateMax3dproAlerts` (pure) + đọc `pair_stats`
  cho `pair_liability`/`combo_concentration` (ordered) → `bulkUpsertByDedupe`.
- **Trigger:** `updatedAt > cursor` trên `max3dpro_draw_betting_stats` — kỳ không cược mới đứng yên → 0
  đánh giá lại. `stampFinal` bump `updatedAt` → mỗi kỳ đánh giá 1 lần chốt.
- **Idempotent tự nhiên:** evaluate pure + upsert theo dedupeKey → cursor lùi/trùng vô hại.

Độ trễ alert = tick sync + tick alert (~20s worst-case) — chấp nhận (chu kỳ nhiều ngày, chốt analysis).

## Pattern tham chiếu

- Keno `evaluate-ops-alerts.ts` — mẫu worker cursor `updatedAt` + at-least-once + `findChangedSince`.
- Pro `sync-betting-stats.ts:212-227` (`evaluateDrawAlerts` — di chuyển sang worker mới), `evaluate-alerts.ts`
  (pure, giữ), `ops-alert-repo.ts:45` (`bulkUpsertByDedupe`).
- Pro `betting-stats-repo.ts` (thêm `findChangedSince`), `pair-stats-repo.ts` (getTopByUnits — p0-01).
- `apps/worker-max3dpro/src/functions/stats.yml` + `handlers/stats/stats-sync.ts` — mẫu yml/handler.

## 1. Repo — `findChangedSince` (betting-stats-repo.ts)

```typescript
/**
 * Kỳ có stats doc ĐỔI kể từ `since` — hàng đợi worker ops-alerts. Trigger theo updatedAt
 * (bump bởi applyDelta/stampFinal). Trả FULL entity (evaluator cần totals+byPlayType+topPotential).
 * Sort updatedAt ASC (cursor tiến tuần tự), limit chặn tick bận. Index {updatedAt:1}. $gt (doc trùng
 * ms xử lý lại ở lần bump sau — vô hại, evaluate idempotent). Qua mapper (không findManyAsDocuments).
 */
async findChangedSince(since: Date, limit: number): Promise<Max3dproDrawBettingStatsEntity[]>
```

## 2. Index — `{updatedAt:1}` (game-max3dpro/indexes)

Thêm vào `BettingStats`: `key:{updatedAt:1}` `name:"idx_updatedAt"` `purpose:"Worker ops-alerts
findChangedSince"`. Tạo THỦ CÔNG Atlas TRƯỚC deploy (nợ vận hành 00-overview).

## 3. Use case mới — `evaluate-ops-alerts.ts`

`game-max3dpro-application/src/use-cases/operations/evaluate-ops-alerts.ts`. `extends TickLoopWorker<void,
EvaluateOpsAlertsResult>`, lock `"max3dpro:ops-alerts"`, `ttlSeconds=120`.

- `beforeLoop`: đọc GlobalConfig 1 lần (`ops.alerts` + `defaultPrizes.standard` cho exposure); đọc cursor
  cũ `lockRepo.findByKey("max3dpro:ops-alerts")?.cursor` → `new Date(cursor)` (rỗng → `new Date(0)`);
  reset counters; `description = "Max 3D Pro ops alerts worker"`.
- `resolveTickMs`: `config.ops.stats.tickSeconds * 1000` (dùng chung nhịp sync).
- `runTick`: `findChangedSince(this.cursor, MAX_DOCS_PER_TICK=50)`; rỗng → `{}`. Mỗi doc `try { evaluateDoc }
  catch { logError + break }` (KHÔNG tiến cursor qua kỳ lỗi — cursor global, nhảy qua = mất đánh giá vĩnh
  viễn); success → `this.cursor = stats.updatedAt`. Cuối: `setCursor(iso)`; false → `{shouldStop:true}`.
- Worker-health: `catch` (không phải lock takeover) → `recordStalledItem(drawId, error)`; success →
  `clearStalledItem(drawId)`. KHÔNG `worker_stuck`.

`evaluateDoc(stats)`: đọc `pairStatsRepo.getTopByUnits(stats.drawId, topCombosK)` → `topPairs` (ordered);
`computeMax3dproExposure(topPairs, totalUnits, prizes)`; `evaluateMax3dproAlerts({drawId, stats, exposure,
topPairs, alerts})` (input `topPairs` thêm ở p0-01 §5.3); `bulkUpsertByDedupe`. Tiết kiệm 1 query so với
code cũ (nhận entity sẵn thay vì `getByDrawId`).

## 4. Dọn `sync-betting-stats.ts` (đường ghi)

XOÁ: method `evaluateDrawAlerts` (`:212-227`); field `alertRepo`; import `evaluateMax3dproAlerts`,
`OpsAlertRepository`, `computeMax3dproExposure`, `Max3dproPrizeSet` (giữ import nào accumulator còn dùng —
`largeBetAmount` cho `PrizeContext` GIỮ, đó là accumulator không phải alert); block gọi `evaluateDrawAlerts`
trong `syncOpenDraws`. `buildPrizeContext` GIỮ (accumulator cần `largeBetAmount`). Kiểm bằng check-types +
grep. JSDoc class: bỏ bước evaluator, thêm câu trỏ `EvaluateOpsAlertsUseCase`.

## 5. Handler + yml + barrel

| File | Nội dung |
|---|---|
| `apps/worker-max3dpro/src/handlers/stats/ops-alerts.ts` | **MỚI** — 3 dòng theo mẫu `stats-sync.ts` + JSDoc vai/lock/cursor |
| `apps/worker-max3dpro/src/functions/stats.yml` | +function `ops-alerts`: `handler: src/handlers/stats/ops-alerts.handler`, `timeout:120`, cron `* * * * ? *` — y hệt block `stats-sync` |
| `.../use-cases/operations/index.ts` | export `EvaluateOpsAlertsUseCase` |

Kiểm `serverless.yml` include `functions/*.yml` (stats.yml đã include → thêm block đủ).

## 6. Đánh giá & verify

1. `check-types` `@megawin/game-max3dpro-application` + `@megawin/worker-max3dpro` (+`game-max3dpro`).
2. **Grep dead code:** `rg "evaluateDrawAlerts" packages/game-max3dpro-application` → chỉ còn worker mới.
   `rg "alertRepo" sync-betting-stats.ts` → 0.
3. **Cursor dev:** invocation đầu cursor rỗng → quét doc cũ không crash; đặt cược 1 kỳ → ~20s alert xuất
   hiện; kỳ không cược → `findChangedSince` 0 doc; kỳ settle → `stampFinal` bump → đánh giá 1 lần chốt;
   kill giữa chừng → không alert trùng (dedupeKey), không mất.
4. **Ordered:** cược (A,B) vượt ngưỡng pair_liability → alert `pair_liability:A>B` (KHÔNG gộp B>A);
   payload `unitsForward`/`unitsReverse` đúng chiều.
5. **Explain Atlas:** `{updatedAt:{$gt}}` sort `updatedAt` → IXSCAN `idx_updatedAt`.
6. So sánh 24h sau deploy: số alert/ngày tương đương trước tách; `failed` sync giảm phần evaluator.

## 7. Review code & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Deploy trước tạo `idx_updatedAt` → COLLSCAN mỗi tick | 🟠 | Checklist: index TRƯỚC. Explain xác nhận |
| 2 | Cursor tiến TRƯỚC upsert (at-most-once) → crash mất alert | 🟠 | Thứ tự: upsert → gán cursor → setCursor |
| 3 | Sync dọn sót (còn gọi alert) / dọn quá tay (xoá `largeBetAmount`) | 🟠 | Grep §6.2 + `buildPrizeContext` giữ nguyên 3 field |
| 4 | 2 doc cùng ms + limit cắt giữa → `$gt` bỏ qua | 🟡 | Chấp nhận (tự hội tụ ở stampFinal). JSDoc ghi |
| 5 | 1 kỳ data bẩn chặn cursor global vĩnh viễn | 🟡 | `logError`+`recordStalledItem(drawId)` → `/system/workers`; trade-off ghi JSDoc |
| 6 | Container reuse: `cursor`/counters không reset | 🔴 | `beforeLoop` reset + đọc lại cursor từ lock doc |
| 7 | **Ordered pair sai chiều** khi worker đọc pair_stats | 🔴 | `getTopByUnits` giữ pairKey nguyên; audit không sort (A,B) |
| 8 | Evaluator đọc `pair_stats` rỗng (kỳ chưa có pair) → crash | 🟠 | `getTopByUnits` trả `[]` → exposure = 0, không crash |

Quy trình: (a) đọc worker mới + cursor contract; (b) diff sync (chỉ xoá); (c) audit ordered pair_stats read;
(d) verify; (e) 24h sau deploy.

## 8. Rollback

Revert code + disable function `ops-alerts` yml (hoặc `isEnabled:false` lock `max3dpro:ops-alerts`). Sync
worker sau dọn KHÔNG còn nhánh alert → rollback = revert cả p0-03 (sync + worker mới) cùng commit. Index
`updatedAt` giữ vô hại.


