# p0-02 — Tách worker `max3d:ops-alerts` khỏi `max3d:stats-sync`

> **Phase:** P0 · **Phụ thuộc:** p0-01 (`TickLoopWorker` + `applyDelta` bump `updatedAt`), p0-03 (nguồn
> pair top-K cho ComboConcentration/PairLiability). **Blocks:** p1-01 (Q1 rà JSDoc sau tách).
> **Nguồn:** analysis §5.1 · bản chuẩn Keno `p0-02-keno-split-ops-alerts-worker.plan.md` (đã ✅ + review PASS).

> **Thứ tự merge:** làm p0-03 TRƯỚC p0-02 (xem 00-overview §"Thứ tự phụ thuộc"). Lý do: `evaluateMax3dAlerts`
> hiện đọc `stats.topPairs` (ComboConcentration, `evaluate-alerts.ts:126`) và `exposure.topPairLiabilities`
> (PairLiability). Sau p0-03, 2 nguồn này đến từ `max3d_draw_pair_stats`. Nếu p0-02 merge trước, evaluator
> viết bám `stats.topPairs` rồi p0-03 sửa lại → 2 lần sửa cùng chỗ. Làm p0-03 trước thì p0-02 viết đúng nguồn 1 lần.

## 1. Mục tiêu

Sau p0-01, accumulator delta-only → evaluator KHÔNG còn hưởng "data sẵn trong RAM", phải đọc lại stats doc.
Nó là consumer ĐỌC nằm nhầm trong đường GHI: ăn chung budget, lỗi rule alert đếm vào `failed` của sync,
backlog sync làm alert trễ. Tách `max3d:ops-alerts`:

- **Vai duy nhất:** đọc stats docs ĐÃ ĐỔI (`updatedAt > cursor`) → `computeMax3dExposure` + pair top-K từ
  `pair_stats` → `evaluateMax3dAlerts` (pure, giữ nguyên) → `bulkUpsertByDedupe`.
- **Trigger `updatedAt`:** kỳ không cược mới → đứng yên → 0 đánh giá lại. `stampFinal` bump `updatedAt` →
  mỗi kỳ 1 lần chốt.
- **Idempotent tự nhiên:** evaluate pure + upsert theo dedupeKey → cursor lùi/trùng vô hại.

Độ trễ alert mới = tick sync + tick alert ≈ ~60s worst-case (tick 30s) — chấp nhận có chủ đích (quay 3 kỳ/tuần).

## 2. Sửa cái gì, ở file nào

### 2.1. `betting-stats-repo.ts` — `findChangedSince(since, limit)`

Port nguyên Keno (JSDoc + `$gt` không `$gte`, sort `updatedAt` asc, qua mapper KHÔNG `findManyAsDocuments`
để reader nhận full shape sau p0-04). `updatedAt` field cấp 1 → không cần `docPath`.

### 2.2. `packages/game-max3d/src/indexes/index.ts` — `idx_updatedAt`

Thêm vào block `max3dDrawBettingStats`: `key:{updatedAt:1}`, `name:"idx_updatedAt"`, purpose mô tả hàng đợi
ops-alerts. **Nợ vận hành:** tạo tay trên Atlas TRƯỚC deploy function (00-overview §"Nợ vận hành").

### 2.3. Use case mới `evaluate-ops-alerts.ts`

File: `packages/game-max3d-application/src/use-cases/operations/evaluate-ops-alerts.ts`. `extends
TickLoopWorker`, lock `max3d:ops-alerts`, cursor = `updatedAt` lớn nhất (persist ISO string qua `setCursor`).

- `beforeLoop`: đọc GlobalConfig 1 lần → `alertsConfig = ops.alerts`, `prize` (cho `computeMax3dExposure`); đọc cursor cũ `lockRepo.findByKey("max3d:ops-alerts")?.cursor` → `new Date(cursor)`, rỗng → `new Date(0)`; reset counters (container reuse).
- `resolveTickMs`: `ops.stats.tickSeconds * 1000` (chung nhịp sync).
- `runTick`: `findChangedSince(this.cursor, MAX_DOCS_PER_TICK)` → for each doc: `try { evaluateDoc } catch { logError; break }` (KHÔNG tiến cursor qua kỳ lỗi — cursor GLOBAL); sau vòng: `setCursor(cursor.toISOString())`, fail → `{shouldStop:true}`.
- `evaluateDoc(stats)`:
  1. `exposure = computeMax3dExposure(stats.tripletStakes, <topPairs>, stats.byPlayType.plus.units, prize.prizes)`.
  2. **Nguồn pair top-K (SAU p0-03):** `topPairs = await pairStatsRepo.getTopPairs(stats.drawId, alertsConfig...K)` — KHÔNG đọc `stats.topPairs` (đã xoá khỏi doc ở p0-03). `computeMax3dExposure` nhận danh sách pair này.
  3. `newAlerts = evaluateMax3dAlerts({ drawId, stats, exposure, alerts: alertsConfig })`. Lưu ý `evaluateMax3dAlerts` cũng đọc `stats.topPairs` cho ComboConcentration → **p0-03 phải đổi evaluator nhận `topPairs` qua tham số** thay vì đọc `stats.topPairs`. Điều phối: p0-03 sửa signature `EvaluateAlertsInput` (thêm `topPairs`), p0-02 truyền vào.
  4. `bulkUpsertByDedupe(newAlerts)`.

> Nếu vì lý do thứ tự PR mà p0-02 tạm merge trước p0-03: evaluator đọc `stats.topPairs` in-doc (vẫn còn ở
> thời điểm đó) — nhưng đã quyết định làm p0-03 trước nên KHÔNG đi đường này.

### 2.4. Dọn `sync-betting-stats.ts`

XOÁ: `evaluateDrawAlerts`, import `evaluateMax3dAlerts`/`computeMax3dExposure`/`OpsAlertRepository`/`OpsAlertsConfig`
(giữ cái nào còn dùng — kiểm bằng check-types), field `alertRepo`, đối số `alerts` xuyên `runTick`/`syncDraw`.
`buildPrizeContext` GIỮ `largeBetAmount` (accumulator cần cho `largeBetCount`, KHÔNG phải phần alert). Cập nhật
JSDoc class: bỏ bước 4 "Evaluator alert", thêm câu trỏ `EvaluateOpsAlertsUseCase`.

### 2.5. Handler + yml + barrel

| File | Nội dung |
|---|---|
| `apps/worker-max3d/src/handlers/stats/ops-alerts.ts` | MỚI — theo mẫu `stats-sync.ts` |
| `apps/worker-max3d/src/functions/stats.yml` | thêm function `ops-alerts` (`timeout:120`, cron `* * * * ? *`) — y block `stats-sync` |
| `packages/game-max3d-application/src/use-cases/operations/index.ts` | export `EvaluateOpsAlertsUseCase` |

## 3. Đánh giá & verify

1. `pnpm --filter @megawin/game-max3d-application check-types && --filter @megawin/worker-max3d check-types`.
2. Grep dead code: `rg "evaluateDrawAlerts|evaluateMax3dAlerts|computeMax3dExposure" packages/game-max3d-application` → chỉ còn trong `evaluate-ops-alerts.ts`.
3. Test cursor (staging): invocation đầu cursor rỗng quét doc cũ không crash; đặt cược → ~60s alert xuất hiện; kỳ không cược → `findChangedSince` trả 0; kỳ settle → 1 lần chốt; kill+restart → không alert trùng (dedupe).
4. Explain Atlas `{updatedAt:{$gt:...}}` sort `updatedAt` → IXSCAN.
5. So 24h sau deploy: số alert/ngày tương đương trước tách.

## 4. Ngoại lệ & rủi ro khi review

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Deploy trước khi tạo `idx_updatedAt` → COLLSCAN mỗi tick | 🟠 | Index TRƯỚC, worker SAU. Explain xác nhận IXSCAN |
| 2 | Cursor tiến TRƯỚC upsert (at-most-once) → crash mất alert | 🟠 | `runTick`: upsert → gán `cursor` → `setCursor` (at-least-once) |
| 3 | Dọn sync worker sót nhánh alert / quá tay (xoá `largeBetAmount`) | 🟠 | Grep §3.2 + `buildPrizeContext` giữ nguyên 5 field |
| 4 | 2 doc cùng ms + limit cắt giữa → `$gt` bỏ qua | 🟡 | Chấp nhận (hội tụ ở bump sau / `stampFinal`). JSDoc ghi |
| 5 | 1 kỳ data bẩn chặn cursor GLOBAL | 🟡 | `logError` kèm drawId + `recordStalledItem` (worker-core). KHÔNG bắn `worker_stuck` |
| 6 | Container reuse: `cursor`/counters không reset `beforeLoop` | 🔴 | Reset đủ; cursor đọc lại từ lock doc |
| 7 | **Evaluator đọc `stats.topPairs` sau khi p0-03 xoá field** | 🔴 | Sau p0-03 `stats.topPairs` KHÔNG tồn tại → `undefined.accounts` crash. PHẢI đổi nguồn sang `pairStatsRepo.getTopPairs` + sửa `EvaluateAlertsInput` nhận `topPairs` tham số. Đây là lý do p0-03 merge trước |
| 8 | `catch` gọi `recordStalledItem` throw vọt qua `break` → mất `setCursor` | 🟠 | (Defect Keno tìm được) `recordStalledItem` không I/O nên không throw; nếu thêm I/O phải bọc try/catch. Xem Keno §7.1 defect |

## 5. Định nghĩa Done (p0-02)

- Worker `max3d:ops-alerts` chạy độc lập; alert xuất hiện ≤ ~60s sau cược; lỗi evaluator không ảnh hưởng nhịp sync.
- `sync-betting-stats.ts` không còn bất kỳ dòng alert nào; `check-types` xanh; grep dead code 0.
- `evaluateMax3dAlerts` nhận `topPairs` qua tham số (nguồn `pair_stats`), KHÔNG đọc `stats.topPairs`.
- `idx_updatedAt` tạo trên Atlas trước deploy.

## 6. Rollback

Revert code + disable function `ops-alerts` (yml hoặc `isEnabled:false` lock `max3d:ops-alerts`). Index
`updatedAt` giữ lại vô hại.
