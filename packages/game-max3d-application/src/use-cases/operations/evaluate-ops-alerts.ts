/**
 * Max 3D – Ops Alerts Worker
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI — tách khỏi đường ghi stats-sync (analysis
 * max3d-stats-worker-simplification §5.1): lỗi rule không làm chậm sync, backlog sync
 * không làm trễ alert kỳ khác. Extends {@link TickLoopWorker}, lock riêng
 * `max3d:ops-alerts`.
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
 *
 * ## Nguồn `topPairs` (p0-03)
 *
 * `evaluateMax3dAlerts` (ComboConcentration) + `computeMax3dExposure` (PairLiability qua
 * `topPairLiabilities`) đều cần danh sách top cặp plus. Sau p0-03, `stats.topPairs` KHÔNG
 * còn tồn tại trên doc — nguồn DUY NHẤT là `PairStatsRepository.getTopPairs`, đọc mỗi
 * doc đánh giá (K = `ops.stats.topCombosK`, đủ lớn để cặp ngoài top-K có units nhỏ,
 * khó là syndicate đáng kể).
 */

import type { Max3dDrawBettingStatsEntity, Max3dTopPair, OpsAlertsConfig } from "@megawin/game-max3d/entities";
import type { Max3dPrizeSet } from "@megawin/game-max3d/rules";
import { computeMax3dExposure, DEFAULT_MAX3D_CONFIG } from "@megawin/game-max3d/rules";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { TickLoopWorker } from "@megawin/worker-core/workers";

import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { PairStatsRepository } from "../../infras/repos/pair-stats-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { evaluateMax3dAlerts } from "./evaluate-alerts";

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

/** Ngữ cảnh đánh giá alert — ngưỡng động + prize + K top-K, đọc 1 lần/invocation. */
interface AlertContext {
  /** Ngưỡng động `ops.alerts` từ GlobalConfig. */
  alerts: OpsAlertsConfig;
  /** Bảng giải — input `computeMax3dExposure`. */
  prizes: Max3dPrizeSet;
  /** `ops.stats.topCombosK` — K cho `pairStatsRepo.getTopPairs`. */
  topCombosK: number;
}

export class EvaluateOpsAlertsUseCase extends TickLoopWorker<void, EvaluateOpsAlertsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout ops-alerts trong stats.yml
  protected override readonly description =
    "Max 3D — đánh giá cảnh báo vận hành (ngưỡng exposure/pair liability/combo) cho kỳ đang mở";

  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly pairStatsRepo = new PairStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  // Field instance — reset trong beforeLoop vì Lambda container reuse giữ instance
  // sống qua nhiều invocation (cùng giả định với p0-01 sync worker).
  private alertCtx!: AlertContext;
  private tickMs!: number;
  private cursor = new Date(0);
  private counters = { evaluated: 0, alertsUpserted: 0 };

  protected resolveLockKey(): string {
    return "max3d:ops-alerts";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    // Doc cũ (trước khi thêm section ops) chưa có field → fallback default để worker
    // không crash trước lần staff save config đầu tiên.
    const ops = config.ops ?? DEFAULT_MAX3D_CONFIG.ops;

    this.alertCtx = {
      alerts: ops.alerts,
      prizes: {
        basic: config.defaultPrizes.basic,
        combo: config.defaultPrizes.combo,
        plus: config.defaultPrizes.plus,
      },
      topCombosK: ops.stats.topCombosK,
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
      // 1 kỳ lỗi không làm chết cả tick — nhưng KHÔNG tiến cursor qua kỳ lỗi:
      // dừng tick tại đó để tick sau thử lại (đơn giản, alert không được phép "trôi mất").
      try {
        await this.evaluateDoc(stats);
      } catch (error) {
        logError("max3d:ops-alerts", error, { drawId: stats.drawId });
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

  /** Đánh giá 1 doc đã đọc sẵn (KHÔNG đọc lại — `findChangedSince` đã trả full entity). */
  private async evaluateDoc(stats: Max3dDrawBettingStatsEntity): Promise<void> {
    const topPairEntities = await this.pairStatsRepo.getTopPairs(stats.drawId, this.alertCtx.topCombosK);
    const topPairs: Max3dTopPair[] = topPairEntities.map((p) => ({
      pairKey: p.pairKey,
      triplet1: p.triplet1,
      triplet2: p.triplet2,
      units: p.units,
      accounts: p.accountCount,
      amount: p.amount,
    }));

    const exposure = computeMax3dExposure(
      stats.tripletStakes,
      topPairs,
      stats.byPlayType.plus.units,
      this.alertCtx.prizes,
    );

    const newAlerts = evaluateMax3dAlerts({
      drawId: stats.drawId,
      stats,
      exposure,
      topPairs,
      alerts: this.alertCtx.alerts,
    });

    if (newAlerts.length > 0) {
      await this.alertRepo.bulkUpsertByDedupe(newAlerts);
      this.counters.alertsUpserted += newAlerts.length;
    }
    this.counters.evaluated += 1;
  }
}
