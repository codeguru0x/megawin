import { UseCase } from "@megawin/app-core/use-cases";
import type { PlayRules, Power655OpsConfig, VietlottPeriodAnchor } from "@megawin/game-power655/entities";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { AppException } from "@megawin/shared/errors";
import { dayOfWeek } from "@megawin/shared/utils";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Power 6/55 toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Jackpot settings (JP1/JP2 seed, contribution ratios, overflow threshold)
 * - Financial rates (commission, company rate)
 * - Prize amounts (tier1-3)
 * - Play rules (unit price, draw times, draw days, etc.)
 * - Vận hành & kiểm soát rủi ro (ngưỡng alert + nhịp/top-K stats — analysis §3.8)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends UseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  /** @inheritdoc */
  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      jackpot: input.jackpot
        ? {
            ...(existing?.jackpot ?? DEFAULT_POWER655_CONFIG.jackpot),
            ...input.jackpot,
          }
        : undefined,
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_POWER655_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ?? DEFAULT_POWER655_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play ? { ...(existing?.play ?? DEFAULT_POWER655_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
      vietlott: input.vietlott ? { ...existing?.vietlott, ...input.vietlott } : undefined,
    };

    if (merged.vietlott) {
      this.validateVietlottAnchor(merged.vietlott, merged.play ?? existing?.play ?? DEFAULT_POWER655_CONFIG.play);
    }

    const cleanMerged: Record<string, unknown> = {};
    if (merged.jackpot) cleanMerged.jackpot = merged.jackpot;
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.defaultPrizes) cleanMerged.defaultPrizes = merged.defaultPrizes;
    if (merged.play) cleanMerged.play = merged.play;
    if (merged.ops) cleanMerged.ops = merged.ops;
    if (merged.vietlott) cleanMerged.vietlott = merged.vietlott;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật GameConfig thất bại.");
    }

    // Config đã đổi → xoá cache để process này đọc bản mới ngay.
    await globalConfigCache.invalidate();

    // Audit sau khi upsert thành công. Chỉ ghi giá trị MỚI của các nhóm đã đổi
    // (`changed`) — muốn biết giá trị cũ thì trace ngược record version trước.
    // Fire-and-forget: không chặn response.
    auditUpdateGameConfig({
      actor: input.actor,
      version: updated.version,
      changed: cleanMerged,
    });

    return {
      config: updated,
      version: updated.version,
    };
  }

  /**
   * Merge section `ops` per sub-section (alerts/stats) — chỉ set field gửi lên, giữ
   * phần còn lại từ existing (fallback default). `enabled` merge shallow để đổi 1
   * khoá alert type mà không phải gửi cả object.
   */
  private mergeOps(existing: Power655OpsConfig | undefined, input: UpdateOpsInput): Power655OpsConfig {
    const base = existing ?? DEFAULT_POWER655_CONFIG.ops;

    const alerts = input.alerts
      ? {
          ...base.alerts,
          ...input.alerts,
          enabled: {
            ...base.alerts.enabled,
            ...input.alerts.enabled,
          },
        }
      : base.alerts;

    const stats = input.stats ? { ...base.stats, ...input.stats } : base.stats;

    return { alerts, stats };
  }

  /**
   * Validate neo Vietlott khớp lịch quay hiện tại (Type C — weekly, nhiều giờ quay/tuần).
   * `anchorDrawTime` phải nằm trong `play.drawTimes`, `anchorDrawDate` phải rơi vào 1 trong
   * các `play.drawDaysOfWeek` — nếu không, suy mã kỳ sau này sẽ SAI mà không ai biết.
   */
  private validateVietlottAnchor(vietlott: Partial<VietlottPeriodAnchor>, play: PlayRules): void {
    if (!vietlott.anchorDrawDate || !vietlott.anchorDrawTime || !vietlott.anchorPeriod) {
      throw AppException.badRequest("Mã kỳ Vietlott phải nhập đủ 3 trường: ngày quay, giờ quay, mã kỳ.");
    }

    if (!play.drawTimes.includes(vietlott.anchorDrawTime)) {
      throw AppException.badRequest(
        `Giờ quay neo (${vietlott.anchorDrawTime}) không khớp các giờ quay hiện tại (${play.drawTimes.join(", ")}).`,
      );
    }

    if (!play.drawDaysOfWeek.includes(dayOfWeek(vietlott.anchorDrawDate))) {
      throw AppException.badRequest(
        `Ngày neo (${vietlott.anchorDrawDate}) không phải ngày quay theo lịch hiện tại (thứ: ${play.drawDaysOfWeek.join(", ")}).`,
      );
    }
  }
}
