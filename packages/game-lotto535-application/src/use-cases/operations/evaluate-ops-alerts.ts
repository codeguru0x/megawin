/**
 * Lotto 5/35 – Ops Alerts Worker
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI — tách khỏi đường ghi stats-sync (analysis
 * §5.1, port nguyên lý Power 6/55/Keno §5.1): lỗi rule không làm chậm sync, backlog sync
 * không làm trễ alert kỳ khác. Extends {@link TickLoopWorker}, lock riêng
 * `lotto535:ops-alerts`.
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

import { TickLoopWorker, LockTakenOverError } from "@megawin/worker-core/workers";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { logError } from "@megawin/shared/utils";
import { Lotto535NumberKind, Lotto535OpsAlertType } from "@megawin/game-lotto535/entities";
import type {
  Lotto535DrawBettingStatsEntity,
  Lotto535OpsAlertsConfig,
} from "@megawin/game-lotto535/entities";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { NumberStatsRepository } from "../../infras/repos/number-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { evaluateAlerts } from "./evaluate-alerts";

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
/** Trần combo tập trung xét alert 1 kỳ. */
const MAX_CONCENTRATED_COMBOS = 50;

/** Ngữ cảnh đánh giá alert — ngưỡng động + giá 1 lần tham gia, đọc 1 lần/invocation. */
interface AlertContext {
  /** Ngưỡng động `ops.alerts` từ GlobalConfig. */
  alerts: Lotto535OpsAlertsConfig;
  /** Giá 1 lần tham gia dự thưởng hiện hành — mẫu tính giá board chuẩn cho `cover_high_stake`. */
  unitPrice: number;
}

export class EvaluateOpsAlertsUseCase extends TickLoopWorker<void, EvaluateOpsAlertsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout ops-alerts trong stats.yml
  protected readonly description =
    "Lotto 5/35 — đánh giá cảnh báo vận hành (ngưỡng exposure/combo/cover/special) cho kỳ đang mở";

  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly numberStatsRepo = new NumberStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  // Field instance — reset trong beforeLoop vì Lambda container reuse giữ instance
  // sống qua nhiều invocation (cùng giả định với p0-02 sync worker).
  private alertCtx!: AlertContext;
  private tickMs!: number;
  private cursor = new Date(0);
  private counters = { evaluated: 0, alertsUpserted: 0 };

  protected resolveLockKey(): string {
    return "lotto535:ops-alerts";
  }

  protected async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    this.alertCtx = {
      // Cùng lý do merge-default ở sync worker — doc GlobalConfig cũ (trước p0-01) có thể
      // chưa có field `ops`; worker này là consumer THỨ 2 đọc `config.ops`, cùng tự vệ.
      alerts: config.ops?.alerts ?? DEFAULT_LOTTO535_CONFIG.ops.alerts,
      unitPrice: config.play.unitPrice,
    };

    this.tickMs =
      (config.ops?.stats.tickSeconds ?? DEFAULT_LOTTO535_CONFIG.ops.stats.tickSeconds) * 1000; // dùng CHUNG nhịp với sync (analysis §5.1/§5.2)
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
        if (error instanceof LockTakenOverError) {
          throw error;
        }
        logError("lotto535:ops-alerts", error, { drawId: stats.drawId });
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
  private async evaluateDoc(stats: Lotto535DrawBettingStatsEntity): Promise<void> {
    const combos = this.alertCtx.alerts.enabled[Lotto535OpsAlertType.ComboConcentration]
      ? await this.comboRepo.findConcentrated(
          stats.drawId,
          this.alertCtx.alerts.comboAccountsWarn,
          MAX_CONCENTRATED_COMBOS,
        )
      : [];

    // ≤12 doc/kỳ (không gian ĐB cố định) — an toàn đọc trọn, không cần trần riêng.
    const specialNumberStats = this.alertCtx.alerts.enabled[Lotto535OpsAlertType.SpecialSkew]
      ? (await this.numberStatsRepo.findByDrawId(stats.drawId)).filter(
          (n) => n.kind === Lotto535NumberKind.Special,
        )
      : [];

    const newAlerts = evaluateAlerts({
      drawId: stats.drawId,
      stats,
      combos,
      specialNumberStats,
      alerts: this.alertCtx.alerts,
      unitPrice: this.alertCtx.unitPrice,
    });
    if (newAlerts.length > 0) {
      await this.alertRepo.bulkUpsertByDedupe(newAlerts);
      this.counters.alertsUpserted += newAlerts.length;
    }
    this.counters.evaluated += 1;
  }
}
