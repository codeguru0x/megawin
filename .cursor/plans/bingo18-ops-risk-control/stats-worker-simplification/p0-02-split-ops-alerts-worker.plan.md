# p0-02 — Tách worker `bingo18:ops-alerts`

> **Feature:** bingo18-ops-risk-control / stats-worker-simplification
> **Phase:** P0 · **Phụ thuộc:** p0-01 (worker sync đã bump `updatedAt` qua `applyDelta`/`stampFinal`; index `{updatedAt:1}` đã khai F7)
> **Nguồn:** analysis §5.1 · **Bản chuẩn Keno:** `evaluate-ops-alerts.ts` + `keno-.../p0-02`
> **Trạng thái:** Code ⏳ · Review & rủi ro ⏳

## 1. Mục tiêu 1 câu

Gỡ đánh giá alert khỏi đường ghi stats (`evaluateDrawAlerts` inline trong `syncOpenDraws` — đã bỏ ở p0-01) sang worker RIÊNG `bingo18:ops-alerts`, cursor `updatedAt`, lock độc lập — lỗi rule alert không làm chậm sync, backlog sync không trễ alert kỳ khác.

## 2. Bingo 18 GỌN hơn Keno ở bước này

Keno alert worker đọc thêm `combo-stats-repo.findConcentrated` (combo_concentration). **Bingo 18 KHÔNG có combo** → alert worker CHỈ đọc stats doc (1 repo), gọi `evaluateBingo18Alerts` (pure, đã có), upsert. Bỏ toàn bộ nhánh combo của mẫu Keno (dòng 39, 55-56, 71-73, 141-147).

`evaluateBingo18Alerts` (`evaluate-alerts.ts`) là PURE — p0-01 đã bỏ caller cũ (`evaluateDrawAlerts` trong sync worker). p0-02 chỉ THÊM caller mới trong worker alert. KHÔNG sửa logic evaluator.

## 3. File đụng tới (5 file)

| # | File | Loại | Tóm tắt |
|---|---|---|---|
| G1 | `packages/game-bingo18-application/src/infras/repos/betting-stats-repo.ts` | sửa | Thêm `findChangedSince(since, limit)` (mẫu Keno dòng 218-220) |
| G2 | `packages/game-bingo18-application/src/use-cases/operations/evaluate-ops-alerts.ts` | **mới** | `EvaluateOpsAlertsUseCase extends TickLoopWorker`, lock `bingo18:ops-alerts` |
| G3 | `packages/game-bingo18-application/src/use-cases/operations/index.ts` | sửa | Export use case mới |
| G4 | `apps/worker-bingo18/src/handlers/stats/ops-alerts.ts` | **mới** | Handler Lambda (mẫu Keno `ops-alerts.ts`) |
| G5 | `apps/worker-bingo18/src/functions/stats.yml` | sửa | Thêm function `ops-alerts` (cron 1 phút, timeout 120) |

> Index `{updatedAt:1}` đã khai ở p0-01 F7 — p0-02 KHÔNG khai lại, chỉ dựa vào nó (và nợ vận hành: tạo trên Atlas trước deploy).

## 4. Chi tiết

### G1 — `findChangedSince`

```ts
async findChangedSince(since: Date, limit: number): Promise<Bingo18DrawBettingStatsEntity[]> {
  return await this.findMany({ updatedAt: { $gt: since } }, { sort: { updatedAt: 1 }, limit });
}
```

Trả FULL entity (evaluator cần `totals`+`byPlayType`+`topPotential`). `$gt` (KHÔNG `$gte`) — mẫu Keno JSDoc dòng 209-213.

### G2 — `EvaluateOpsAlertsUseCase` (mẫu Keno, bỏ combo)

- `extends TickLoopWorker<void, EvaluateOpsAlertsResult>`; `ttlSeconds=120`; `description="Bingo 18 — đánh giá cảnh báo vận hành (ngưỡng exposure/skew/bucket) cho kỳ đang mở"`.
- Repos: `getGlobalConfig`, `statsRepo`, `alertRepo`. **KHÔNG comboRepo.**
- Field instance reset `beforeLoop`: `alertCtx` (chỉ `alerts` — Bingo 18 KHÔNG có `caps`), `tickMs`, `cursor=new Date(0)`, `counters`.
- `resolveLockKey() → "bingo18:ops-alerts"`.
- `beforeLoop()`: đọc config, set `alertCtx.alerts = config.ops.alerts`, `tickMs = ops.stats.tickSeconds*1000`, đọc cursor cũ từ `lockRepo.findByKey` (parse ISO → epoch nếu rỗng) — mẫu Keno dòng 87-101.
- `runTick()`: `findChangedSince(cursor, MAX_DOCS_PER_TICK=50)` → for mỗi doc: try `evaluateDoc` → tiến cursor + `clearStalledItem`; catch → `recordStalledItem` + **`break`** (KHÔNG tiến cursor qua kỳ lỗi). Cuối tick `setCursor(cursor.toISOString())`; lock takeover → `{shouldStop:true}` (mẫu Keno dòng 111-137).
- `evaluateDoc(stats)`: tính exposure từ bucket (`computeBingo18Exposure(stats.byPlayType, prizes)`) → `evaluateBingo18Alerts({drawId, stats, exposure, alerts})` → `bulkUpsertByDedupe`. **CẦN prize** để tính exposure → `beforeLoop` build luôn `prizes` từ config (như get-ops-snapshot dòng 57-63).

> **Ngoại lệ review #G2-a — exposure tính ở worker alert (không lưu doc):** stats doc chỉ có bucket RAW; exposure là biến đổi phi tuyến max-over-216 tính lúc đọc (bài học Keno Risk #4). `evaluateDoc` gọi `computeBingo18Exposure` trên `stats.byPlayType` — KHÔNG đọc field exposure từ doc (không có). Reviewer kiểm evaluator nhận exposure vừa tính, không phải từ DB.

> **Ngoại lệ review #G2-b — lỗi 1 kỳ → `break`, KHÔNG tiến cursor qua:** cursor GLOBAL (khác sync watermark per-draw). Nhảy qua kỳ lỗi = mất đánh giá vĩnh viễn tới lần bump sau. `break` để tick sau thử lại (mẫu Keno JSDoc dòng 23-28 + dòng 118-126). Reviewer kiểm dùng `break` (không `continue`).

> **Ngoại lệ review #G2-c — `$gt` chấp nhận khe hở lý thuyết:** doc khác đổi đúng ms = cursor giữa 2 lần đọc bị sót tới lần bump kế. Mọi kỳ có `stampFinal` bump cuối → không sót vĩnh viễn (mẫu Keno JSDoc dòng 16-21). ĐỪNG đổi thành `$gte` (sẽ đánh giá lại doc cursor mỗi tick — lãng phí).

> **Ngoại lệ review #G2-d — dùng CHUNG `tickSeconds` với sync:** alert nhịp = sync nhịp (analysis §5.1). Bingo 18 giữ 10s (overview — user chốt). Alert trễ ≤2 tick ≈20s, thừa cho kỳ 6 phút.

> **Ngoại lệ review #G2-e — `alertCtx` KHÔNG có `caps`:** Keno có `payoutCaps` làm mẫu số exposure. Bingo 18 KHÔNG có cap kỳ (evaluate-alerts.ts dòng 86-87: mẫu số = revenue). ĐỪNG port field `caps`.

### G3 — export

Thêm `export * from "./evaluate-ops-alerts"` (hoặc named) vào `operations/index.ts`, khớp cách file export hiện có.

### G4 — handler (mẫu Keno `ops-alerts.ts`)

```ts
import { EvaluateOpsAlertsUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
const useCase = new EvaluateOpsAlertsUseCase();
export async function handler() { return useCase.run(); }
```

JSDoc mô tả tách khỏi sync + lock riêng `bingo18:ops-alerts`.

### G5 — `stats.yml`

Thêm block `ops-alerts` (copy mẫu Keno `stats.yml` dòng 10-17):

```yaml
ops-alerts:
  handler: src/handlers/stats/ops-alerts.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true
```

## 5. Đánh giá & verify

1. `pnpm --filter @megawin/game-bingo18-application check-types` + `pnpm --filter @megawin/worker-bingo18 check-types` — 0 lỗi.
2. Grep `evaluateDrawAlerts` trong sync worker → 0 (đã bỏ ở p0-01). Grep `evaluateBingo18Alerts` → chỉ còn caller trong G2.
3. Xác nhận `lockRepo`/`setCursor`/`recordStalledItem`/`clearStalledItem` tồn tại trên `TickLoopWorker` base (worker-core đã có — mẫu Keno dùng).
4. Đọc 5 "Ngoại lệ review G2".

## 6. Review code & rủi ro

- [ ] **#1 — COLLSCAN nếu thiếu index:** `findChangedSince` cần `{updatedAt:1}` (idx_updatedAt). Đã tạo trên Atlas TRƯỚC deploy? (nợ vận hành overview). Deploy trước index = mỗi tick full scan.
- [ ] **#2 — cursor persist:** `setCursor` SAU upsert (at-least-once)? crash giữa = đánh giá lại (vô hại: pure + dedupe upsert).
- [ ] **#3 — lock độc lập:** `bingo18:ops-alerts` ≠ `bingo18:stats-sync`? 2 worker chạy song song không tranh lock.
- [ ] **#4 — kỳ lỗi chặn cursor:** `break` không `continue`? Streak lỗi ghi `stalledItems` (worker-core)? KHÔNG bắn alert `worker_stuck` (overview §4).
- [ ] **#5 — exposure:** tính từ `stats.byPlayType` runtime, KHÔNG đọc field doc?
- [ ] **#6 — container reuse:** cursor/alertCtx/counters reset `beforeLoop`?
- [ ] **#7 — combo:** KHÔNG port nhánh combo/comboRepo/findConcentrated (Bingo 18 không có)?

## 7. Sau khi hoàn thành

- Cập nhật bảng trạng thái `00-overview.md`.
- Nhắc nợ vận hành: tạo `idx_updatedAt` trên Atlas rồi mới deploy `ops-alerts`.
- p1-01 Q1 rà JSDoc CẢ 2 use case (sync + alert) sau khi tách.
