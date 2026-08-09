/**
 * Bingo 18 – Ops Alerts Worker
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI — tách khỏi đường ghi stats-sync (p0-01 đã bỏ
 * caller inline `evaluateDrawAlerts`): lỗi rule không làm chậm sync, backlog sync không
 * làm trễ alert kỳ khác. Extends {@link TickLoopWorker}, lock riêng `bingo18:ops-alerts`.
 *
 * GỌN hơn Keno: Bingo 18 KHÔNG có combo space (38 bucket đóng, không topCombos) → worker
 * này CHỈ đọc stats doc (1 repo), tính exposure CHÍNH XÁC (216 outcome) từ bucket rồi gọi
 * `evaluateBingo18Alerts` (pure) — KHÔNG có nhánh comboRepo/findConcentrated.
 *
 * ## Cursor
 *
 * Cursor = `updatedAt` LỚN NHẤT đã đánh giá, persist qua `setCursor` (ISO string) của
 * `SingleRunWorker`. At-least-once: upsert alert TRƯỚC, tiến cursor SAU — crash giữa
 * 2 bước chỉ gây đánh giá lại (vô hại: evaluate pure + upsert theo dedupeKey).
 * Cursor rỗng (lần đầu) → đánh giá từ epoch: mọi doc chưa final + doc final còn trong
 * limit sẽ được quét dần — chấp nhận, hội tụ sau vài tick.
 *
 * `$gt` (không `$gte`) trong `findChangedSince`: mất tối đa các doc trùng-ms-với-cursor
 * trong CÙNG lần đọc đã xử lý; doc mới trùng ms đến SAU sẽ có `updatedAt` mới hơn khi
 * `applyDelta` chạy tiếp → tự được quét. Trường hợp sót lý thuyết (doc đổi đúng ms =
 * cursor giữa 2 lần đọc) cực hiếm và chỉ trễ đến lần đổi kế tiếp của doc đó; kỳ luôn có
 * lần bump cuối (`stampFinal`) → không sót vĩnh viễn.
 *
 * Lỗi 1 kỳ → DỪNG tick, KHÔNG tiến cursor qua (khác sync worker — sync skip kỳ lỗi được
 * vì watermark per-draw; alert cursor là GLOBAL nên nhảy qua = mất đánh giá kỳ đó vĩnh
 * viễn cho tới lần update sau). Trade-off: 1 kỳ data bẩn chặn alert các kỳ sau nó — chấp
 * nhận ở P0. Streak lỗi liên tiếp của kỳ chặn cursor do `worker-core` giữ trên lock doc
 * (`stalledItems` — xem `SingleRunWorker.recordStalledItem`), hiển thị ở trang Workers
 * health — worker này KHÔNG tự bắn alert vận hành nữa.
 */

import type { Bingo18DrawBettingStatsEntity, OpsAlertsConfig } from "@megawin/game-bingo18/entities";
import type { Bingo18PrizeSet } from "@megawin/game-bingo18/rules";
import { computeBingo18Exposure, DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { TickLoopWorker } from "@megawin/worker-core/workers";

import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { evaluateBingo18Alerts } from "./evaluate-alerts";

/** Kết quả 1 lần chạy worker (thống kê để log/monitor). */
export interface EvaluateOpsAlertsResult {
  /** Số tick đã chạy trong invocation. */
  ticks: number;
  /** Số stats doc đã đánh giá qua tất cả tick. */
  evaluated: number;
  /** Số alert đã upsert. */
  alertsUpserted: number;
}

/** Trần doc đánh giá 1 tick — tick bận đột biến không hút hết budget. */
const MAX_DOCS_PER_TICK = 50;

/**
 * Ngữ cảnh đánh giá alert — ngưỡng động, đọc 1 lần/invocation.
 *
 * KHÔNG có `caps` (khác Keno `PayoutCaps`) — Bingo 18 không có cap kỳ, mẫu số exposure
 * là `revenue` (evaluate-alerts.ts) — G2-e.
 */
interface AlertContext {
  /** Ngưỡng động `ops.alerts` từ GlobalConfig. */
  alerts: OpsAlertsConfig;
  /** Bảng giải — input `computeBingo18Exposure` để tính exposure CHÍNH XÁC lúc đọc. */
  prizes: Bingo18PrizeSet;
}

export class EvaluateOpsAlertsUseCase extends TickLoopWorker<void, EvaluateOpsAlertsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout ops-alerts trong stats.yml
  protected override readonly description =
    "Bingo 18 — đánh giá cảnh báo vận hành (ngưỡng exposure/skew/bucket) cho kỳ đang mở";

  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  // Field instance — reset trong beforeLoop vì Lambda container reuse giữ instance
  // sống qua nhiều invocation (cùng giả định với p0-01 sync worker).
  private alertCtx!: AlertContext;
  private tickMs!: number;
  private cursor = new Date(0);
  private counters = { evaluated: 0, alertsUpserted: 0 };

  protected resolveLockKey(): string {
    return "bingo18:ops-alerts";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    // Doc cũ (trước khi thêm section ops) chưa có field → fallback default.
    const ops = config.ops ?? DEFAULT_BINGO18_CONFIG.ops;
    this.alertCtx = {
      alerts: ops.alerts,
      prizes: {
        singleNum: config.singleNumPrizes,
        doubleMatch: config.doubleMatchPrizes,
        tripleMatch: config.tripleMatchPrizes,
        sumTotal: config.sumTotalPrizes,
        bigSmallDraw: config.bigSmallDrawPrizes,
      },
    };

    this.tickMs = ops.stats.tickSeconds * 1000; // dùng CHUNG nhịp với sync (G2-d)
    this.counters = { evaluated: 0, alertsUpserted: 0 }; // reset — container reuse

    // Đọc cursor cũ từ lock doc — rỗng/không parse được → epoch (quét từ đầu).
    const lock = await this.lockRepo.findByKey(this.resolveLockKey());
    const parsed = lock?.cursor ? new Date(lock.cursor) : undefined;
    this.cursor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);
  }

  protected async resolveTickMs(): Promise<number> {
    return this.tickMs;
  }

  protected buildResult(loop: TickLoopResult): EvaluateOpsAlertsResult {
    return { ticks: loop.ticks, ...this.counters };
  }

  protected async runTick(): Promise<TickOutcome> {
    const docs = await this.statsRepo.findChangedSince(this.cursor, MAX_DOCS_PER_TICK);
    if (docs.length === 0) {
      return {};
    }

    for (const stats of docs) {
      // 1 kỳ lỗi không làm chết cả tick — nhưng KHÔNG tiến cursor qua kỳ lỗi:
      // dừng tick tại đó để tick sau thử lại (đơn giản, alert không được phép "trôi mất").
      try {
        await this.evaluateDoc(stats);
      } catch (error) {
        logError("bingo18:ops-alerts", error, { drawId: stats.drawId });
        this.recordStalledItem(stats.drawId, error);
        break; // KHÔNG tiến cursor qua doc lỗi — cursor global, nhảy qua = mất đánh giá kỳ đó
      }
      this.cursor = stats.updatedAt;
      this.clearStalledItem(stats.drawId);
    }

    // Persist cursor SAU khi upsert (at-least-once). ISO string cho field cursor sẵn có.
    const ok = await this.setCursor(this.cursor.toISOString());
    if (!ok) {
      return { shouldStop: true }; // lock takeover — dừng êm
    }
    return {};
  }

  /**
   * Đánh giá 1 doc đã đọc sẵn (KHÔNG đọc lại — `findChangedSince` đã trả full entity).
   *
   * Exposure tính CHÍNH XÁC (216 outcome) từ `stats.byPlayType` (bucket RAW) — KHÔNG đọc
   * field exposure từ doc (không có, bài học Keno Risk #4 — G2-a).
   */
  private async evaluateDoc(stats: Bingo18DrawBettingStatsEntity): Promise<void> {
    const exposure = computeBingo18Exposure(stats.byPlayType, this.alertCtx.prizes);
    const newAlerts = evaluateBingo18Alerts({
      drawId: stats.drawId,
      stats,
      exposure,
      alerts: this.alertCtx.alerts,
    });
    if (newAlerts.length > 0) {
      await this.alertRepo.bulkUpsertByDedupe(newAlerts);
      this.counters.alertsUpserted += newAlerts.length;
    }
    this.counters.evaluated += 1;
  }
}
