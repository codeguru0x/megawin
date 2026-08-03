# p0-01 — `TickLoopWorker` trong worker-core + refactor Keno sync worker

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` §5.2 (+ §5.6 hook enroll).
> **Phase:** P0 · **Phụ thuộc:** — · **Blocks:** p0-02 (alert worker dùng base này), p0-03 (enroll 1 lần/invocation).
> **Tính chất:** hạ tầng thuần — KHÔNG chạm nghiệp vụ. Body của `runTick` Keno GIỮ NGUYÊN từng dòng.
> **Đã cập nhật tên class 03/08/2026** (theo `.cursor/plans/worker-core-usecase-restructure/`): plan này
> dùng tên canonical mới. Ánh xạ nếu đọc code/commit cũ: `TickLoopWorkerUseCase → TickLoopWorker`,
> `LockedWorkerUseCase → SingleRunWorker`; file `tick-loop-worker-use-case.ts` → `lock/tick-loop-worker.ts`,
> `locked-worker-use-case.ts` → `lock/single-run-worker.ts`; import base qua `@megawin/worker-core/workers`.

## Mục tiêu

Đoạn `while (Date.now() < deadline) { runTick(); sleep(remaining); }` + budget + giữ nhịp đang bị copy
**4 lần** (keno/bingo18/max3d/max3dpro `sync-betting-stats.ts`), sau p0-02 sẽ thành 8 bản (2 worker × 4 game).
Nâng lên base class `TickLoopWorker` trong `packages/worker-core` — subclass chỉ còn khai báo
`runTick` + nhịp tick, phần hạ tầng biến mất khỏi tầm mắt người đọc nghiệp vụ.

**Nguyên tắc chống over-engineering (analysis §5.2 + §8 rủi ro):** base CHỈ lo (1) vòng lặp deadline,
(2) giữ nhịp đều tick, (3) hook chạy-1-lần đầu invocation. KHÔNG đưa hàng đợi/watermark/counter-reducer
generic vào base — đó là nghiệp vụ per-game. Chọn phương án "base trả `ticks`, subclass tự giữ counters"
(analysis §5.2 đã cho phép chọn phương án đơn giản nhất).

## Pattern tham chiếu

- `packages/worker-core/src/use-cases/lock/single-run-worker.ts` — base hiện hữu, style JSDoc + abstract members.
- `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts:118-157` — vòng lặp cần nâng lên
  (đây là "spec" hành vi: budget 55s, `tickMs - elapsed`, `Math.min(..., deadline - now)`).
- `packages/worker-core/src/use-cases/index.ts` + `types.ts` — chỗ export barrel + đặt type mới.

## 1. File mới: `packages/worker-core/src/use-cases/lock/tick-loop-worker.ts`

### 1.1. Thiết kế

```typescript
import { sleep } from "@megawin/shared/utils";
import { SingleRunWorker } from "./single-run-worker";

/** Kết quả 1 tick — subclass trả để base biết có nên dừng sớm. */
export interface TickOutcome {
  /** true → thoát vòng lặp ngay (VD: lock bị takeover, kill-switch). Optional, default false. */
  shouldStop?: boolean;
}

/** Kết quả cả invocation từ phía base — subclass thường bọc thêm counters riêng. */
export interface TickLoopResult {
  /** Số tick đã chạy trong invocation. */
  ticks: number;
}

/**
 * Worker chạy LOOP nhiều tick trong 1 invocation Lambda (cadence < 1 phút).
 *
 * EventBridge min schedule = 1 phút; game quay nhanh (Keno 6–8 phút/kỳ) cần cập nhật dày hơn
 * → mỗi invocation loop `runTick()` + `sleep` tới nhịp `resolveTickMs`, thoát trước deadline
 * (`budgetMs`, default 55s < Lambda timeout) để invocation kế tiếp takeover qua lock TTL.
 *
 * Base CHỈ lo: deadline, giữ nhịp đều tick (trừ thời gian xử lý), hook `beforeLoop` 1 lần
 * đầu invocation. KHÔNG lo hàng đợi việc / watermark / counters — nghiệp vụ per-game nằm
 * trọn trong subclass (analysis keno-stats-worker-simplification §5.2).
 */
export abstract class TickLoopWorker<I, O> extends SingleRunWorker<I, O> {
  /** Budget 1 invocation (ms) — thoát trước Lambda timeout để invocation sau takeover. */
  protected readonly budgetMs: number = 55_000;

  /** Nhịp tick (ms) — đọc từ config động (VD `ops.stats.tickSeconds`), gọi 1 lần đầu invocation. */
  protected abstract resolveTickMs(input: I): Promise<number>;

  /** Hook chạy 1 LẦN đầu invocation (sau khi đã giữ lock, trước vòng lặp). Default no-op. */
  protected async beforeLoop(_input: I): Promise<void> {}

  /** 1 tick nghiệp vụ. Trả `shouldStop: true` để thoát vòng lặp sớm. */
  protected abstract runTick(input: I): Promise<TickOutcome>;

  /** Build output cuối từ số tick đã chạy — subclass gắn counters riêng đã tự tích luỹ. */
  protected abstract buildResult(loop: TickLoopResult): O;

  protected async runLocked(input: I): Promise<O> {
    await this.beforeLoop(input);
    const tickMs = await this.resolveTickMs(input);
    const deadline = Date.now() + this.budgetMs;
    let ticks = 0;

    while (Date.now() < deadline) {
      const tickStart = Date.now();
      const outcome = await this.runTick(input);
      ticks += 1;

      if (outcome.shouldStop) {
        break;
      }

      // Giữ nhịp đều tickMs: trừ thời gian đã xử lý tick này; không ngủ quá deadline.
      const elapsed = Date.now() - tickStart;
      const remaining = Math.min(tickMs - elapsed, deadline - Date.now());
      if (remaining > 0) {
        await sleep(remaining);
      }
    }

    return this.buildResult({ ticks });
  }
}
```

Ghi chú thiết kế (đã cân nhắc, chốt):

- **`runLocked` là `final` về mặt quy ước** — subclass KHÔNG override (ghi rõ trong JSDoc). Nếu cần logic
  trước vòng lặp → `beforeLoop`.
- **Counters ở subclass**: subclass giữ field private (VD `entriesApplied`) và cộng trong `runTick`, rồi
  `buildResult` gắn vào output. Đơn giản hơn generic reducer — đúng chỉ đạo "KHÔNG generic hoá quá tay".
- **`shouldStop`** thay cho cách hiện tại throw từ `syncDraw` khi mất lock: giữ nguyên hành vi throw hiện có
  cũng được (throw xuyên qua base → SingleRunWorker ghi lastError) — `shouldStop` dành cho dừng ÊM
  (không phải lỗi), p0-02 dùng khi cursor persist fail.
- **KHÔNG kiểm tra `worker-core` phụ thuộc `@megawin/shared` chưa** — kiểm `package.json` trước; `sleep`
  đang được keno import từ `@megawin/shared/utils`. Nếu worker-core chưa có dependency này, thêm vào
  `dependencies` (không devDependencies).

### 1.2. Types & barrel

- `TickOutcome`, `TickLoopResult` khai ngay trong file use-case (không phải repo file — không vi phạm
  mongodb.mdc §2; theo tiền lệ `WorkerRunResult` nằm ở `types.ts` thì CÂN NHẮC đặt cả 2 vào
  `packages/worker-core/src/use-cases/types.ts` cho đồng nhất — implementer đọc `types.ts` hiện tại và
  theo đúng tiền lệ file đó).
- `packages/worker-core/src/use-cases/index.ts`: export `TickLoopWorker` + 2 type.

## 2. Refactor `SyncBettingStatsUseCase` (Keno) dùng base mới

File: `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts`

| Trước | Sau |
|---|---|
| `extends SingleRunWorker<void, SyncBettingStatsResult>` | `extends TickLoopWorker<void, SyncBettingStatsResult>` |
| `BUDGET_MS = 55_000` const + vòng `while` trong `runLocked` | XOÁ — base lo (default 55s đúng bằng giá trị cũ) |
| `runLocked` đọc config + build `PrizeContext` + loop | Chuyển phần đọc config sang field instance set trong `beforeLoop` / `resolveTickMs` |
| `private runTick(prize, stats, alertCtx)` | `protected runTick(): Promise<TickOutcome>` — đọc `prize`/`stats` từ field instance |
| counters cộng trong `runLocked` | field private `entriesApplied/finalized/failed`, cộng trong `runTick`, gắn ở `buildResult` |

Cách chuyển config an toàn (mỗi invocation đọc GlobalConfig đúng 1 lần như hiện tại):

```typescript
// Field instance — Lambda single-threaded, mỗi invocation 1 instance state riêng
// (cùng giả định với SingleRunWorker._lockKey). PHẢI reset trong beforeLoop
// vì Lambda container reuse giữ instance sống qua nhiều invocation.
private prize!: PrizeContext;
private statsConfig!: OpsStatsConfig;
private counters = { entriesApplied: 0, finalized: 0, failed: 0 };

protected async beforeLoop(): Promise<void> {
  const config = await this.getGlobalConfig.run();
  this.prize = this.buildPrizeContext(config);
  this.statsConfig = config.ops.stats;
  this.counters = { entriesApplied: 0, finalized: 0, failed: 0 }; // reset — container reuse
}

protected async resolveTickMs(): Promise<number> {
  return this.statsConfig.tickSeconds * 1000; // beforeLoop chạy trước — đã có config
}
```

**QUAN TRỌNG — 2 điều KHÔNG đổi trong plan này:**

1. Body của `runTick` (4 bước: ensureDocs → findNotFinal → syncDraw per-draw → stampFinal) + `syncDraw` +
   `writeBatch` + `evaluateDrawAlerts` **giữ nguyên từng dòng** (kể cả phần alert — p0-02 mới gỡ). Diff của
   plan này trên file Keno chỉ được phép là: đổi extends, di chuyển code loop/config, đổi chữ ký method.
2. `beforeLoop` CHƯA di chuyển `ensureDocs` ra khỏi tick — đó là việc của p0-03 (tách diff để review được).

Cập nhật JSDoc class: mô tả cadence loop chuyển về base, class chỉ còn nói câu chuyện nghiệp vụ.
Comment nào mô tả vòng lặp/budget → chuyển theo code sang base class (rule code-quality §4: không xoá,
di chuyển cùng code).

## 3. Danh sách file

| File | Việc |
|---|---|
| `packages/worker-core/src/use-cases/lock/tick-loop-worker.ts` | **MỚI** — base class (§1) |
| `packages/worker-core/src/use-cases/types.ts` | +`TickOutcome`, `TickLoopResult` (nếu theo tiền lệ types.ts) |
| `packages/worker-core/src/use-cases/index.ts` | export mới |
| `packages/worker-core/package.json` | +dep `@megawin/shared` nếu chưa có |
| `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts` | refactor §2 |

KHÔNG chạm: handler `stats-sync.ts`, `stats.yml`, mọi repo, accumulator, evaluate-alerts, 3 game còn lại
(port sau theo p2-01 guide).

## 4. Đánh giá & verify

1. `pnpm --filter @megawin/worker-core check-types && pnpm --filter @megawin/game-keno-application check-types`.
2. Lint (nếu package có cấu hình) cho 2 package trên.
3. **Diff review bắt buộc:** mở diff `sync-betting-stats.ts`, xác nhận `syncDraw`/`writeBatch`/
   `evaluateDrawAlerts`/`runTick` body KHÔNG có dòng logic nào đổi — chỉ có code bị DI CHUYỂN. Cách kiểm
   nhanh: copy body 4 method trước/sau vào diff tool.
4. **Hành vi tương đương** (checklist thủ công, so với code cũ):
   - [ ] Budget vẫn 55s (default base = giá trị cũ).
   - [ ] `remaining` vẫn `Math.min(tickMs - elapsed, deadline - now)` — tick cuối không ngủ quá deadline.
   - [ ] Config + PrizeContext vẫn đọc đúng 1 lần/invocation (không đọc mỗi tick).
   - [ ] Counters reset mỗi invocation (container reuse!) — đây là bug dễ nhất của refactor này.
   - [ ] Throw từ `syncDraw` (lock takeover) vẫn nổi lên `SingleRunWorker` ghi `lastError` như cũ.
5. Smoke test dev (nếu môi trường có): chạy handler local / dev stage 1 invocation, so sánh log
   `{ticks, entriesApplied, finalized, failed}` shape với production hiện tại.

## 5. Review code & rủi ro — từng bước

| # | Rủi ro | Mức | Kiểm khi review |
|---|---|---|---|
| 1 | **Container reuse giữ state cũ** — field instance (`counters`, `prize`) không reset → số liệu cộng dồn qua invocation, config cũ dùng lại | 🔴 | `beforeLoop` reset TOÀN BỘ mutable field. Grep mọi field instance của subclass, hỏi "reset ở đâu?" |
| 2 | Base generic hoá quá tay (reducer, queue, watermark chui vào base) | 🟠 | Base ≤ ~120 dòng kể cả JSDoc. Không import gì từ game-* |
| 3 | Đổi hành vi sleep/deadline tinh vi (VD quên trừ `elapsed`) → tick dày hơn/thưa hơn cũ | 🟠 | So sánh cạnh nhau đoạn loop cũ (dòng 138-154 file cũ) với base — từng biểu thức |
| 4 | `resolveTickMs` gọi trước `beforeLoop` → đọc config chưa có | 🟠 | Thứ tự trong `runLocked` của base: `beforeLoop` → `resolveTickMs` → loop. Viết JSDoc ghi rõ contract này |
| 5 | Quên rằng `SingleRunWorker.execute` bọc ngoài (kill-switch, acquire, finalize) — subclass mới vô tình override `execute` | 🟡 | Grep `protected async execute` trong subclass — không được có |
| 6 | 3 game kia vẫn dùng SingleRunWorker trực tiếp — ai đó "tiện tay" refactor luôn | 🟡 | Diff chỉ được chạm 2 package trong §3 |

Quy trình review đề xuất: (a) đọc base class trước, đối chiếu JSDoc contract với implementation;
(b) đọc diff Keno với checklist §4.4; (c) chạy verify §4.1; (d) người review thứ 2 chỉ cần đọc base class
(vì Keno chỉ là di chuyển code).

### 5.1. Kết quả review (02/08) — ✅ PASS sau 1 fix 🔴

| # | Rủi ro | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Container reuse giữ state cũ | ✅ | `sync-betting-stats.ts` `beforeLoop` reset `counters` + `consecutiveFails`; `prize`/`statsConfig` ghi lại mỗi invocation. Alert worker (p0-02) reset `counters`/`stuckDrawId`/`stuckStreak`/`cursor`/`alertCtx`/`tickMs`. Không còn mutable field nào ngoài danh sách này (grep `private ` trong 2 class) |
| 2 | Base generic hoá quá tay | ✅ | `lock/tick-loop-worker.ts` = **62 dòng** (kể cả JSDoc), import duy nhất `sleep` + `SingleRunWorker`; 0 import `game-*` |
| 3 | Đổi hành vi sleep/deadline | ✅ | `remaining = Math.min(tickMs - elapsed, deadline - Date.now())`, `if (remaining > 0) sleep`, `budgetMs = 55_000` — khớp từng biểu thức với spec §1.1 |
| 4 | `resolveTickMs` gọi trước `beforeLoop` | ✅ | `runLocked`: `beforeLoop` → `resolveTickMs` → loop; contract ghi trong JSDoc class. Cả 2 subclass phụ thuộc thứ tự này (`statsConfig`/`tickMs` set ở `beforeLoop`) và chạy đúng |
| 5 | Subclass override `execute` | ✅ | `rg "protected async execute" use-cases/operations` → chỉ các use-case đọc (get-*/list-*/ack-*), KHÔNG có ở 2 worker class |
| 6 | 3 game kia bị refactor "tiện tay" | ✅ | `rg -l TickLoopWorker` → chỉ `worker-core` + 2 file Keno |

**Defect tìm được & đã sửa (🔴 — không có trong bảng rủi ro gốc, phát sinh từ tương tác §4.4 checklist cuối):**

`runTick` bọc mỗi kỳ trong `try/catch` (giữ nguyên từ bản trước để 1 kỳ data bẩn không chết cả tick) đã
**ăn luôn** error mất-lock do `syncDraw` throw khi `extendLock()` trả `false` → worker tiếp tục chạy các kỳ
còn lại **song song với owner mới** = đúng cái lock sinh ra để chặn. Vi phạm trực tiếp checklist §4.4 dòng
cuối ("throw từ `syncDraw` vẫn nổi lên `SingleRunWorker`").

Fix: thêm class `LockTakenOverError` (`sync-betting-stats.ts:106`), `catch` kiểm `instanceof` và **re-throw**
trước khi đếm `failed`. Lỗi nghiệp vụ per-draw vẫn bị nuốt như thiết kế.

**Findings phụ (đã sửa):** `recordFailAndMaybeAlert` (alert vận hành — việc PHỤ) chạy trong cùng `catch` với
đường xử lý chính; nó throw (collection alert nghẽn) sẽ kéo chết luôn các kỳ chưa xử lý → đã bọc `try/catch`
riêng, chỉ `logError`.

Verify đã chạy: `check-types` PASS cho `worker-core`, `game-keno`, `game-keno-application`, `worker-keno`,
`backoffice`. Chưa chạy: smoke test dev §4.5 (cần môi trường).

## 6. Rollback

Base class mới không có consumer nào ngoài Keno sync → revert 1 commit là về nguyên trạng. Không đổi
schema/index/config nên không có bước dọn dữ liệu.
