# p0-02 — Tách worker `keno:ops-alerts` khỏi `keno:stats-sync`

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` §4.2 (vì sao coupling đã chết),
> §5.1 (thiết kế 2 worker) · **Phase:** P0 · **Phụ thuộc:** p0-01 (`TickLoopWorker`).
> **Blocks:** p1-01 (Q1 rà JSDoc sau tách; ~~Q4 bắn alert worker_stuck từ evaluator mới~~ — Q4
> SUPERSEDED 03/08, xem `.cursor/plans/system-worker-health/`).

## Mục tiêu

Sau p2-01, alert evaluator KHÔNG còn hưởng lợi "data sẵn trong RAM" (accumulator delta-only → evaluator
phải đọc lại stats doc từ DB — `sync-betting-stats.ts:311-329`). Nó là consumer ĐỌC nằm nhầm chỗ trong
đường GHI: ăn chung budget 55s, lỗi rule alert bị đếm vào `failed` của sync, backlog sync làm alert trễ.

Tách thành worker riêng `keno:ops-alerts`:

- **Vai duy nhất:** đọc stats docs ĐÃ ĐỔI kể từ cursor → `evaluateAlerts` (pure, giữ nguyên) → upsert.
- **Trigger:** `updatedAt > cursor` trên `keno_draw_betting_stats` — kỳ không có cược mới thì `updatedAt`
  đứng yên → 0 lần đánh giá lại. `stampFinal` cũng bump `updatedAt` → mỗi kỳ được đánh giá 1 lần chốt.
- **Idempotent tự nhiên:** evaluate là hàm thuần + upsert theo dedupeKey → cursor lùi/trùng vô hại.

Độ trễ alert mới = tick sync + tick alert ≈ ~20s worst-case — chấp nhận có chủ đích (chu kỳ 6–8 phút).

## Pattern tham chiếu

- `sync-betting-stats.ts` (sau p0-01) — subclass `TickLoopWorker` mẫu.
- `lock/single-run-worker.ts` JSDoc "Dùng cursor trong subclass" — cursor persist qua `setCursor`/
  `lockRepo.findByKey`, **at-least-once** (commit alert trước, tiến cursor sau).
- `ops-alert-repo.ts:bulkUpsertByDedupe` — đích ghi, dùng nguyên.
- `apps/worker-keno/src/functions/stats.yml` + `handlers/stats/stats-sync.ts` — mẫu yml/handler.

## 1. Repo: method mới `findChangedSince` (betting-stats-repo.ts)

```typescript
/**
 * Kỳ có stats doc ĐỔI kể từ `since` — hàng đợi của worker ops-alerts.
 *
 * Trigger theo `updatedAt` (bump bởi applyDelta/stampFinal): kỳ không có cược mới
 * thì đứng yên → 0 lần đánh giá lại. Trả FULL entity (evaluator cần totals + exposure
 * + byPlayType + topPotential — gần cả doc) — chi phí này trước đây nằm trong sync
 * worker (`getByDrawId` mỗi kỳ có delta), giờ chỉ trả cho doc thật sự đổi.
 *
 * Sort `updatedAt` ASC để cursor tiến tuần tự; `limit` chặn tick bận đột biến.
 * Index: { updatedAt: 1 } (idx_updatedAt — thêm ở plan này).
 *
 * Dùng `$gt`: 2 doc trùng ms với cursor có thể bị đánh giá lại ở lần sau — VÔ HẠI
 * (evaluate idempotent, analysis §8). KHÔNG cần dedupe phức tạp hơn.
 */
async findChangedSince(since: Date, limit: number): Promise<KenoDrawBettingStatsEntity[]> {
  return await this.findMany(
    { updatedAt: { $gt: since } },
    { sort: { updatedAt: 1 }, limit },
  );
}
```

Lưu ý implement:

- `updatedAt` là field cấp 1 → không cần `docPath`, nhưng entity phải chắc chắn CÓ field này (đang có —
  `ensureDocs`/`applyDelta`/`stampFinal` đều set).
- Return qua mapper như `getByDrawId` (KHÔNG `findManyAsDocuments`) — evaluator cần full shape.
  Sau p0-03, mapper normalize sẽ bảo đảm shape này kể cả doc thiếu field.

## 2. Index mới: `packages/game-keno/src/indexes/index.ts`

Thêm vào block `kenoDrawBettingStats`:

```typescript
{
  collection: KenoCollections.BettingStats,
  key: { updatedAt: 1 },
  options: { name: "idx_updatedAt" },
  purpose:
    "Worker ops-alerts: findChangedSince({updatedAt:{$gt:cursor}}) — hàng đợi đánh giá alert " +
    "theo doc ĐÃ ĐỔI. Doc final không update lại → phần index 'nóng' luôn nhỏ. " +
    "(analysis keno-stats-worker-simplification §5.1)",
},
```

**Vận hành:** index tạo THỦ CÔNG trên Atlas (theo quy trình `KENO_INDEXES` — repo không có runner)
**TRƯỚC khi** deploy worker mới. Ghi vào checklist deploy §6.

## 3. Use case mới: `evaluate-ops-alerts.ts`

File: `packages/game-keno-application/src/use-cases/operations/evaluate-ops-alerts.ts`

```typescript
/**
 * Keno – Ops Alerts Worker
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI — tách khỏi đường ghi stats-sync (analysis
 * keno-stats-worker-simplification §5.1): lỗi rule không làm chậm sync, backlog sync
 * không làm trễ alert kỳ khác. Extends TickLoopWorker, lock riêng `keno:ops-alerts`.
 *
 * ## Cursor
 *
 * Cursor = `updatedAt` LỚN NHẤT đã đánh giá, persist qua `setCursor` (ISO string) của
 * SingleRunWorker. At-least-once: upsert alert TRƯỚC, tiến cursor SAU — crash giữa
 * 2 bước chỉ gây đánh giá lại (vô hại: evaluate pure + upsert theo dedupeKey).
 * Cursor rỗng (lần đầu) → đánh giá từ epoch: mọi doc chưa final + doc final còn trong
 * limit sẽ được quét dần — chấp nhận, hội tụ sau vài tick.
 */
export interface EvaluateOpsAlertsResult {
  ticks: number;
  /** Số stats doc đã đánh giá qua tất cả tick. */
  evaluated: number;
  /** Số alert đã upsert. */
  alertsUpserted: number;
}

/** Trần doc đánh giá 1 tick — tick bận đột biến không hút hết budget. */
const MAX_DOCS_PER_TICK = 50;
/** Trần combo tập trung xét alert 1 kỳ — CHUYỂN từ sync-betting-stats.ts sang. */
const MAX_CONCENTRATED_COMBOS = 50;

export class EvaluateOpsAlertsUseCase extends TickLoopWorker<void, EvaluateOpsAlertsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout ops-alerts trong stats.yml

  protected resolveLockKey(): string {
    return "keno:ops-alerts";
  }

  // beforeLoop: đọc GlobalConfig 1 lần (alerts + caps — như AlertContext cũ),
  //             đọc cursor cũ: this.lockRepo.findByKey("keno:ops-alerts")?.cursor → Date.
  // resolveTickMs: config.ops.stats.tickSeconds * 1000 (dùng CHUNG nhịp với sync — analysis §5.1).

  protected async runTick(): Promise<TickOutcome> {
    const docs = await this.statsRepo.findChangedSince(this.cursor, MAX_DOCS_PER_TICK);
    if (docs.length === 0) {
      return {};
    }

    for (const stats of docs) {
      // 1 kỳ lỗi không làm chết cả tick — nhưng KHÔNG tiến cursor qua kỳ lỗi:
      // dừng tick tại đó để tick sau thử lại (đơn giản, alert không được phép "trôi mất").
      try {
        await this.evaluateDoc(stats); // evaluateAlerts + findConcentrated + bulkUpsertByDedupe
      } catch (error) {
        logError("keno:ops-alerts", error, { drawId: stats.drawId });
        break;
      }
      this.cursor = stats.updatedAt;
    }

    // Persist cursor SAU khi upsert (at-least-once). ISO string cho field cursor sẵn có.
    const ok = await this.setCursor(this.cursor.toISOString());
    if (!ok) {
      return { shouldStop: true }; // lock takeover — dừng êm
    }
    return {};
  }
}
```

`evaluateDoc` = di chuyển nguyên `evaluateDrawAlerts` từ sync worker (đổi input: nhận entity đã đọc thay
vì `getByDrawId` lại — tiết kiệm 1 query so với code cũ):

```typescript
private async evaluateDoc(stats: KenoDrawBettingStatsEntity): Promise<void> {
  const combos = this.alertsConfig.enabled[KenoOpsAlertType.ComboConcentration]
    ? await this.comboRepo.findConcentrated(
        stats.drawId, this.alertsConfig.comboAccountsWarn, MAX_CONCENTRATED_COMBOS)
    : [];
  const newAlerts = evaluateAlerts({
    drawId: stats.drawId, stats, combos, alerts: this.alertsConfig, caps: this.caps,
  });
  if (newAlerts.length > 0) {
    await this.alertRepo.bulkUpsertByDedupe(newAlerts);
    this.alertsUpserted += newAlerts.length;
  }
  this.evaluated += 1;
}
```

Quyết định chi tiết đã chốt khi viết plan (KHÔNG mở lại lúc implement trừ khi phát hiện sai):

1. **Cursor kiểu `Date` từ ISO string** — field `cursor` của lock doc là string sẵn có, parse
   `new Date(cursor)` ở `beforeLoop`; cursor rỗng/không parse được → `new Date(0)`.
2. **`$gt` chứ không `$gte`** — mất tối đa các doc trùng-ms-với-cursor trong CÙNG lần đọc đã xử lý;
   doc mới trùng ms đến SAU sẽ có `updatedAt` mới hơn khi applyDelta chạy tiếp → tự được quét. Trường hợp
   sót lý thuyết (doc đổi đúng ms = cursor giữa 2 lần đọc) cực hiếm và chỉ trễ đến lần đổi kế tiếp của
   doc đó; kỳ luôn có lần bump cuối (`stampFinal`) → không sót vĩnh viễn. Ghi JSDoc rõ.
3. **Lỗi 1 kỳ → dừng tick, không tiến cursor qua** (khác sync: sync skip kỳ lỗi được vì watermark
   per-draw; alert cursor là GLOBAL — nhảy qua = mất đánh giá kỳ đó vĩnh viễn cho tới lần update sau).
   Trade-off: 1 kỳ data bẩn chặn alert các kỳ sau nó — chấp nhận ở P0. Tín hiệu "kỳ nào đang chặn" do
   `worker-core` lo (`recordItemFailure` → `worker_locks.stalledItems`, xem
   `.cursor/plans/system-worker-health/`); ~~Q4 bắn `worker_stuck`~~ đã hoàn nguyên 03/08. Nếu thực tế
   xảy ra thường xuyên mới nâng cấp (per-draw retry count).
4. **KHÔNG đọc lại doc trong `evaluateDoc`** — `findChangedSince` đã trả full entity.

## 4. Dọn `sync-betting-stats.ts` (đường ghi)

Xoá khỏi file (analysis §5.1 "Điểm chuyển đi kèm"):

- method `evaluateDrawAlerts`, interface `AlertContext`, const `MAX_CONCENTRATED_COMBOS`;
- import `evaluateAlerts`, `OpsAlertRepository`, `KenoOpsAlertType`, `OpsAlertsConfig`, `PayoutCaps`
  (giữ import nào còn dùng — `PayoutCaps` chỉ dùng cho alert ctx → xoá; kiểm bằng check-types);
- field `alertRepo`; đối số `alertCtx` xuyên `runTick`; block `if (applied.entriesApplied > 0) { await
  this.evaluateDrawAlerts(...) }`;
- `buildPrizeContext` giữ nguyên (vẫn cần `largeBetAmount` cho accumulator — KHÔNG phải phần alert).

Cập nhật JSDoc class: bỏ bước 5 "Đánh giá alert...", thêm 1 câu trỏ sang `EvaluateOpsAlertsUseCase`.
`ComboStatsRepository` GIỮ — vẫn dùng cho `writeBatch` (`bulkUpsertDelta`/`syncAccountCounts`);
`findConcentrated` từ đây chỉ còn caller là worker alert.

## 5. Handler + yml + barrel

| File | Nội dung |
|---|---|
| `apps/worker-keno/src/handlers/stats/ops-alerts.ts` | **MỚI** — 3 dòng theo mẫu `stats-sync.ts` (JSDoc mô tả vai + lock + cursor) |
| `apps/worker-keno/src/functions/stats.yml` | thêm function `ops-alerts`: `handler: src/handlers/stats/ops-alerts.handler`, `timeout: 120`, `schedule cron(* * * * ? *)` — y hệt block `stats-sync` |
| `packages/game-keno-application/src/use-cases/operations/index.ts` | export `EvaluateOpsAlertsUseCase` |

Kiểm tra thêm: `apps/worker-keno/serverless.yml` (hoặc nơi include `functions/*.yml`) có tự pick file —
stats.yml đã được include nên thêm block trong cùng file là đủ.

## 6. Đánh giá & verify

1. `pnpm --filter @megawin/game-keno-application check-types && pnpm --filter @megawin/worker-keno check-types`
   (+ `@megawin/game-keno` nếu chạm entities/indexes types).
2. **Grep dead code sau dọn §4** (bài học 00-overview keno-ops #9 — compiler không bắt):
   `rg "evaluateDrawAlerts|AlertContext|MAX_CONCENTRATED_COMBOS" packages/game-keno-application` →
   chỉ còn ở file worker alert mới.
3. **Test hành vi cursor (dev/staging):**
   - [ ] Invocation đầu (cursor rỗng): quét được doc cũ, không crash, cursor tiến tới max `updatedAt`.
   - [ ] Đặt cược 1 kỳ → trong ~20s alert xuất hiện (nếu vượt ngưỡng; hạ ngưỡng config để test).
   - [ ] Kỳ không cược mới → tick sau `findChangedSince` trả 0 doc (xem log `evaluated: 0`).
   - [ ] Kỳ settle → `stampFinal` bump `updatedAt` → được đánh giá 1 lần chốt.
   - [ ] Kill worker giữa chừng (disable lock isEnabled rồi bật lại) → không alert trùng (dedupeKey),
     không mất alert.
4. **Kiểm index trên Atlas trước deploy:** `explain` query `{updatedAt: {$gt: ...}}` sort `updatedAt` → IXSCAN.
5. So sánh production 24h sau deploy: số alert/ngày tương đương trước tách (không tụt hẳn = mất trigger,
   không tăng vọt = đánh giá trùng bất thường); log `failed` của sync worker giảm phần lỗi evaluator.

## 7. Review code & rủi ro — từng bước

| # | Rủi ro | Mức | Kiểm khi review |
|---|---|---|---|
| 1 | Deploy worker trước khi tạo index `{updatedAt:1}` → COLLSCAN mỗi tick trên collection stats (120+ doc/ngày, tăng dần tới TTL nếu có) | 🟠 | Checklist deploy: index TRƯỚC, worker SAU. Confirm bằng explain |
| 2 | Cursor tiến TRƯỚC khi upsert (at-most-once nhầm) → crash giữa chừng mất alert | 🟠 | Đọc thứ tự trong `runTick`: upsert → gán `this.cursor` → `setCursor`. So với JSDoc SingleRunWorker "At-least-once" |
| 3 | Sync worker sau dọn vẫn còn nhánh gọi alert (dọn sót) hoặc dọn quá tay (xoá `largeBetAmount` khỏi PrizeContext) | 🟠 | Grep §6.2 + đối chiếu `buildPrizeContext` trước/sau: PHẢI giống hệt |
| 4 | 2 doc cùng ms + limit cắt giữa → doc sau bị `$gt` bỏ qua | 🟡 | Chấp nhận theo quyết định #2 §3 (tự hội tụ ở lần bump sau / stampFinal). JSDoc phải ghi. Người review xác nhận hiểu và đồng ý |
| 5 | 1 kỳ data bẩn chặn cursor vĩnh viễn (quyết định #3) | 🟡 | Có `logError` với drawId; p1-01 Q4 bắn worker_stuck (**hoàn nguyên 03/08** → `worker_locks.stalledItems`, xem `system-worker-health/`). Review xác nhận trade-off đã ghi trong code comment |
| 6 | Container reuse: `evaluated`/`alertsUpserted`/`cursor` không reset ở `beforeLoop` | 🔴 | Cùng checklist p0-01 §5.1 — mọi mutable field reset |
| 7 | 2 worker cùng đọc GlobalConfig → ngưỡng đổi giữa invocation: sync dùng bản cũ, alert bản mới | 🟢 | Vô hại: mỗi worker tự đọc đầu invocation (≤60s lệch), như hành vi cũ |
| 8 | Alert trễ hơn hiện tại ~1 tick | 🟢 | Chấp nhận có chủ đích (analysis §8) — không "sửa" bằng cách giảm tick |

Quy trình review: (a) đọc worker mới với JSDoc contract cursor; (b) đọc diff sync worker — CHỈ được xoá,
không sửa logic ghi; (c) verify §6; (d) sau deploy theo dõi 24h theo §6.5.

### 7.1. Kết quả review (02/08) — ✅ PASS sau 1 fix 🟠

| # | Rủi ro | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Deploy trước khi tạo index `{updatedAt:1}` | ⚠️ **còn nợ vận hành** | Index đã khai trong `packages/game-keno/src/indexes/index.ts:249-257` (`idx_updatedAt`) nhưng repo KHÔNG có runner → **phải tạo tay trên Atlas TRƯỚC deploy**. Xem checklist §6.4 — chưa thực hiện được ở bước review code |
| 2 | Cursor tiến TRƯỚC upsert (at-most-once nhầm) | ✅ | `runTick`: `await this.evaluateDoc(stats)` (upsert alert) → `this.cursor = stats.updatedAt` → sau vòng lặp `setCursor(...)`. Đúng at-least-once theo JSDoc `SingleRunWorker` §"At-least-once" |
| 3 | Sync worker dọn sót / dọn quá tay | ✅ | `rg "evaluateDrawAlerts\|AlertContext\|MAX_CONCENTRATED_COMBOS" game-keno-application` → chỉ còn trong `evaluate-ops-alerts.ts`. `buildPrizeContext` GIỮ nguyên 5 field kể cả `largeBetAmount` (`sync-betting-stats.ts:338-351`) — accumulator vẫn dùng cho `largeBetCount` |
| 4 | 2 doc cùng ms + limit cắt giữa → `$gt` bỏ qua | ✅ đã ghi rõ | JSDoc `findChangedSince` (`betting-stats-repo.ts:209-213`) mô tả chính xác khe hở + căn cứ "mọi kỳ còn 1 lần bump cuối (`stampFinal`) nên không sót vĩnh viễn". Trade-off được xác nhận |
| 5 | 1 kỳ data bẩn chặn cursor | ✅ | `logError` kèm `drawId` + alert `worker_stuck` (p1-01 Q4) sau 3 tick liên tiếp; trade-off ghi trong JSDoc class dòng 23-27. **HẬU KIỂM 03/08:** alert bị hoàn nguyên — tín hiệu chuyển sang `worker_locks.stalledItems` (`system-worker-health/p0-02`), bảo đảm còn TỐT HƠN (streak persist qua invocation, tự tắt khi hồi phục) |
| 6 | Container reuse không reset | ✅ | `beforeLoop` reset `counters`, `stuckDrawId`, `stuckStreak`, và `cursor` (đọc lại từ lock doc, không tin state cũ) |
| 7 | 2 worker đọc GlobalConfig lệch nhau | ✅ | Mỗi worker đọc riêng ở `beforeLoop`; lệch ≤ 1 invocation như hành vi cũ |
| 8 | Alert trễ thêm ~1 tick | ✅ | Chấp nhận có chủ đích, không "sửa" bằng giảm tick |

**Defect tìm được & đã sửa (🟠):** trong `catch` của vòng lặp doc, `recordStuckAndMaybeAlert` chạy TRƯỚC
`break` nhưng KHÔNG có `try/catch` riêng → nó throw sẽ vọt qua `break`, thoát cả `runTick` và **bỏ luôn
`setCursor`** ⇒ mất tiến độ của các doc đã đánh giá xong trong tick đó (phải đánh giá lại — vô hại về dữ
liệu nhưng lãng phí và làm cursor đứng yên nếu lỗi lặp). Đã bọc `try/catch` riêng, chỉ `logError`.

**Đã kiểm thêm (ngoài bảng):**

- `findChangedSince` đi qua `findMany` (có mapper) — KHÔNG dùng `findManyAsDocuments` → doc tối giản p0-03
  vẫn ra entity đủ shape trước khi vào `evaluateAlerts`. Khớp rủi ro #2 của p0-03.
- Handler + `stats.yml`: block `ops-alerts` tồn tại, `timeout: 120` = `ttlSeconds` của use-case, cron
  `* * * * ? *` — khớp `stats-sync`.
- `setCursor` trả `false` → `shouldStop: true` (dừng ÊM, không throw) là ĐÚNG cho worker này: khác sync
  worker, ở đây cursor chưa persist nghĩa là owner mới sẽ đọc lại từ cursor cũ → chỉ đánh giá lại, không
  ghi sai.

Verify đã chạy: `check-types` PASS `game-keno-application` + `worker-keno`; grep dead code §6.2 sạch.
Chưa chạy: §6.3 test hành vi cursor trên dev, §6.4 explain trên Atlas, §6.5 so sánh 24h sau deploy.

## 8. Rollback

Revert code + disable function `ops-alerts` trong yml (hoặc `isEnabled: false` trên lock doc
`keno:ops-alerts`). Sync worker bản cũ vẫn còn nhánh alert (trước dọn §4) → rollback = revert cả 2 phần
cùng commit. Index `updatedAt` giữ lại vô hại.
