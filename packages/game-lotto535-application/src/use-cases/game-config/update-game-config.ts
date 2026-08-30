import { UseCase } from "@megawin/app-core/use-cases";
import type { Lotto535OpsConfig, PlayRules, VietlottPeriodAnchor } from "@megawin/game-lotto535/entities";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import { AppException } from "@megawin/shared/errors";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Jackpot settings (seed, threshold, split ratios, rounding unit)
 * - Financial rates (commission, company rate)
 * - Prize amounts (tier1-5, consolation)
 * - Play rules (unit price, draw times, etc.)
 * - Vận hành & kiểm soát rủi ro (ngưỡng alert + nhịp/top-K stats — analysis §3.8)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends UseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      jackpot: input.jackpot
        ? {
            ...(existing?.jackpot ?? DEFAULT_LOTTO535_CONFIG.jackpot),
            ...input.jackpot,
          }
        : undefined,
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_LOTTO535_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ?? DEFAULT_LOTTO535_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play ? { ...(existing?.play ?? DEFAULT_LOTTO535_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
      vietlott: input.vietlott ? { ...existing?.vietlott, ...input.vietlott } : undefined,
    };

    if (merged.vietlott) {
      this.validateVietlottAnchor(merged.vietlott, merged.play ?? existing?.play ?? DEFAULT_LOTTO535_CONFIG.play);
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
  private mergeOps(existing: Lotto535OpsConfig | undefined, input: UpdateOpsInput): Lotto535OpsConfig {
    const base = existing ?? DEFAULT_LOTTO535_CONFIG.ops;

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
   * Kiểm neo Vietlott trước khi lưu:
   * 1. Đủ cả 3 field (`anchorDrawDate`/`anchorDrawTime`/`anchorPeriod`) — DB lưu neo dạng
   *    toàn vẹn (`VietlottPeriodAnchor`), không cho phép neo thiếu field.
   * 2. `anchorDrawTime` phải nằm trong `play.drawTimes` ĐANG ÁP DỤNG (đọc từ `play` vừa
   *    merge — ưu tiên giá trị mới nếu staff đổi cùng lúc — không phải `DEFAULT_LOTTO535_CONFIG`).
   *
   * Khác Keno (lưới đều `firstDrawTime`→`lastDrawTime`/`drawIntervalMinutes`), Lotto 5/35
   * dùng schedule Type B — `drawTimes` là danh sách giờ quay cố định trong ngày, kiểm bằng
   * membership check thay vì phép chia hết.
   */
  private validateVietlottAnchor(vietlott: Partial<VietlottPeriodAnchor>, play: PlayRules): void {
    if (!vietlott.anchorDrawDate || !vietlott.anchorDrawTime || !vietlott.anchorPeriod) {
      throw AppException.badRequest("Mã kỳ Vietlott phải nhập đủ 3 trường: ngày quay, giờ quay, mã kỳ.");
    }

    if (!play.drawTimes.includes(vietlott.anchorDrawTime)) {
      throw AppException.badRequest(
        `Giờ quay neo (${vietlott.anchorDrawTime}) không nằm trong lịch quay hiện tại (${play.drawTimes.join(", ")}).`,
      );
    }
  }
}
