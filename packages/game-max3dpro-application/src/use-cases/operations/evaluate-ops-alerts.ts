/**
 * Max 3D Pro – Ops Alerts Worker
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI — tách khỏi đường ghi stats-sync (analysis §5.1):
 * lỗi rule không làm chậm sync, backlog sync không làm trễ alert kỳ khác. Extends
 * {@link TickLoopWorker}, lock riêng `max3dpro:ops-alerts`.
 *
 * ## Cursor
 *
 * Cursor = `updatedAt` LỚN NHẤT đã đánh giá, persist qua `setCursor` (ISO string) của
 * `SingleRunWorker`. At-least-once: upsert alert TRƯỚC, tiến cursor SAU — crash giữa 2 bước
 * chỉ gây đánh giá lại (vô hại: evaluate pure + upsert theo dedupeKey). Cursor rỗng (lần đầu)
 * → đánh giá từ epoch: mọi doc chưa final + doc final còn trong limit sẽ được quét dần — chấp
 * nhận, hội tụ sau vài tick.
 *
 * `$gt` (không `$gte`) trong `findChangedSince`: mất tối đa các doc trùng-ms-với-cursor trong
 * CÙNG lần đọc đã xử lý; kỳ luôn có lần bump cuối (`stampFinal`) → không sót vĩnh viễn.
 *
 * Lỗi 1 kỳ → DỪNG tick, KHÔNG tiến cursor qua (khác sync worker — sync skip kỳ lỗi được vì
 * watermark per-draw; alert cursor là GLOBAL nên nhảy qua = mất đánh giá kỳ đó vĩnh viễn cho
 * tới lần update sau). Trade-off: 1 kỳ data bẩn chặn alert các kỳ sau nó — chấp nhận ở P0.
 * Streak lỗi do `worker-core` giữ trên lock doc (`stalledItems` — xem
 * `SingleRunWorker.recordStalledItem`), hiển thị ở trang Workers health.
 *
 * ## ⚠️ Ordered pair
 *
 * `getTopPairs` giữ `pairKey = "first>second"` NGUYÊN — (A,B) và (B,A) là 2 key khác nhau
 * (ĐB vs phụ ĐB). Worker KHÔNG sort/normalize; exposure/evaluate cộng cả 2 chiều ở tầng rule.
 */

import type {
  Max3dproDrawBettingStatsEntity,
  Max3dproTopPair,
  OpsAlertsConfig,
  OpsStatsConfig,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproPrizeSet } from "@megawin/game-max3dpro/rules";
import { computeMax3dproExposure, DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { TickLoopWorker } from "@megawin/worker-core/workers";

import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { PairStatsRepository } from "../../infras/repos/pair-stats-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { evaluateMax3dproAlerts } from "./evaluate-alerts";

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

/** Ngữ cảnh đánh giá alert — ngưỡng động + bảng giải cho exposure, đọc 1 lần/invocation. */
interface AlertContext {
  /** Ngưỡng động `ops.alerts` từ GlobalConfig. */
  alerts: OpsAlertsConfig;
  /** Bảng giải (`defaultPrizes.standard`) — input `computeMax3dproExposure`. */
  prizes: Max3dproPrizeSet;
  /** `ops.stats` — `topCombosK` cho `getTopPairs`. */
  stats: OpsStatsConfig;
}

export class EvaluateOpsAlertsUseCase extends TickLoopWorker<void, EvaluateOpsAlertsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout ops-alerts trong stats.yml
  protected override readonly description =
    "Max 3D Pro — đánh giá cảnh báo vận hành (cược lớn/exposure/pair liability/tập trung cặp)";

  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly pairStatsRepo = new PairStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  // Field instance — reset trong beforeLoop vì Lambda container reuse giữ instance sống qua
  // nhiều invocation (cùng giả định với sync worker).
  private alertCtx!: AlertContext;
  private tickMs!: number;
  private cursor = new Date(0);
  private counters = { evaluated: 0, alertsUpserted: 0 };

  protected resolveLockKey(): string {
    return "max3dpro:ops-alerts";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    // Doc cũ chưa có section ops → fallback default để worker không crash (plan p0-03 §3).
    const ops = config.ops ?? DEFAULT_MAX3D_PRO_CONFIG.ops;
    this.alertCtx = {
      alerts: ops.alerts,
      prizes: config.defaultPrizes.standard,
      stats: ops.stats,
    };

    this.tickMs = ops.stats.tickSeconds * 1000; // dùng CHUNG nhịp với sync (analysis §5.1)
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
      // 1 kỳ lỗi không làm chết cả tick — nhưng KHÔNG tiến cursor qua kỳ lỗi: dừng tick tại
      // đó để tick sau thử lại (cursor global, nhảy qua = mất đánh giá kỳ đó).
      try {
        await this.evaluateDoc(stats);
      } catch (error) {
        logError("max3dpro:ops-alerts", error, { drawId: stats.drawId });
        this.recordStalledItem(stats.drawId, error);
        break; // KHÔNG tiến cursor qua doc lỗi
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
   * Đánh giá 1 doc đã đọc sẵn (KHÔNG đọc lại `getByDrawId` — `findChangedSince` trả full
   * entity, tiết kiệm 1 query so với bản cũ gọi trong sync worker).
   *
   * Đọc `pair_stats` ORDERED cho exposure + rule combo_concentration; kỳ chưa có cặp → `[]`
   * → exposure = 0, KHÔNG crash.
   */
  private async evaluateDoc(stats: Max3dproDrawBettingStatsEntity): Promise<void> {
    const pairEntities = await this.pairStatsRepo.getTopPairs(stats.drawId, this.alertCtx.stats.topCombosK);
    const topPairs: Max3dproTopPair[] = pairEntities.map((p) => ({
      pairKey: p.pairKey,
      first: p.first,
      second: p.second,
      units: p.units,
      accounts: p.accountCount,
      amount: p.amount,
    }));

    const totalUnits = stats.byPlayType.multiNumber.units + stats.byPlayType.multiDigit.units;
    const exposure = computeMax3dproExposure(topPairs, totalUnits, this.alertCtx.prizes);

    const newAlerts = evaluateMax3dproAlerts({
      drawId: stats.drawId,
      stats,
      topPairs,
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
