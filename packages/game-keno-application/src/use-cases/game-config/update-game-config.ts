import { UseCase } from "@megawin/app-core/use-cases";
import { computeDrawsPerDay } from "@megawin/game-core/utils";
import type { OpsConfig, PlayRules, VietlottPeriodAnchor } from "@megawin/game-keno/entities";
import { DEFAULT_KENO_CONFIG } from "@megawin/game-keno/rules";
import { AppException } from "@megawin/shared/errors";
import { parseHHMMToMinutes } from "@megawin/shared/utils";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Keno toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Financial rates (commission, company rate)
 * - Basic prize table (pick1-10)
 * - Side bet prizes (big/small, even/odd)
 * - Payout caps (pick8/9/10)
 * - Play rules (unit price, draw interval, etc.)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends UseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      rates: input.rates ? { ...(existing?.rates ?? DEFAULT_KENO_CONFIG.rates), ...input.rates } : undefined,
      basicPrizes: input.basicPrizes ? input.basicPrizes : undefined,
      bigSmallPrizes: input.bigSmallPrizes
        ? {
            ...(existing?.bigSmallPrizes ?? DEFAULT_KENO_CONFIG.bigSmallPrizes),
            ...input.bigSmallPrizes,
          }
        : undefined,
      evenOddPrizes: input.evenOddPrizes
        ? {
            ...(existing?.evenOddPrizes ?? DEFAULT_KENO_CONFIG.evenOddPrizes),
            ...input.evenOddPrizes,
          }
        : undefined,
      payoutCaps: input.payoutCaps
        ? {
            ...(existing?.payoutCaps ?? DEFAULT_KENO_CONFIG.payoutCaps),
            ...input.payoutCaps,
          }
        : undefined,
      play: input.play ? { ...(existing?.play ?? DEFAULT_KENO_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
      vietlott: input.vietlott ? { ...existing?.vietlott, ...input.vietlott } : undefined,
    };

    if (merged.vietlott) {
      this.validateVietlottAnchor(merged.vietlott, merged.play ?? existing?.play ?? DEFAULT_KENO_CONFIG.play);
    }

    const cleanMerged: Record<string, unknown> = {};
    if (merged.rates) {
      cleanMerged.rates = merged.rates;
    }
    if (merged.basicPrizes) {
      cleanMerged.basicPrizes = merged.basicPrizes;
    }
    if (merged.bigSmallPrizes) {
      cleanMerged.bigSmallPrizes = merged.bigSmallPrizes;
    }
    if (merged.evenOddPrizes) {
      cleanMerged.evenOddPrizes = merged.evenOddPrizes;
    }
    if (merged.payoutCaps) {
      cleanMerged.payoutCaps = merged.payoutCaps;
    }
    if (merged.play) {
      cleanMerged.play = merged.play;
    }
    if (merged.ops) {
      cleanMerged.ops = merged.ops;
    }
    if (merged.vietlott) {
      cleanMerged.vietlott = merged.vietlott;
    }

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật Keno GameConfig thất bại.");
    }

    // Invalidate cache read-through của globalConfigCache —
    // process này thấy config mới ngay; container khác trễ tối đa TTL cache.
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
   * phần còn lại từ existing (fallback default). `comboSetsWarn`/`enabled` merge shallow
   * để đổi 1 khoá mà không phải gửi cả object.
   */
  private mergeOps(existing: OpsConfig | undefined, input: UpdateOpsInput): OpsConfig {
    const base = existing ?? DEFAULT_KENO_CONFIG.ops;

    const alerts = input.alerts
      ? {
          ...base.alerts,
          ...input.alerts,
          comboSetsWarn: {
            ...base.alerts.comboSetsWarn,
            ...input.alerts.comboSetsWarn,
          },
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
   * 2. `anchorDrawTime` khớp lưới quay ĐANG ÁP DỤNG (đọc từ `play` vừa merge — ưu tiên giá
   *    trị mới nếu staff đổi cùng lúc — không phải `DEFAULT_KENO_CONFIG`, xem P0.0.1).
   *
   * Không dùng helper `calcSlotIndex` ở đây vì helper đó nhận `VietlottDrawSchedule`
   * (interface trung gian) — validate tại đây chỉ cần kiểm chia hết, không cần build
   * schedule object cho một phép chia hết đơn giản.
   */
  private validateVietlottAnchor(vietlott: Partial<VietlottPeriodAnchor>, play: PlayRules): void {
    if (!vietlott.anchorDrawDate || !vietlott.anchorDrawTime || !vietlott.anchorPeriod) {
      throw AppException.badRequest("Mã kỳ Vietlott phải nhập đủ 3 trường: ngày quay, giờ quay, mã kỳ.");
    }

    const anchorMinutes = parseHHMMToMinutes(vietlott.anchorDrawTime);
    const firstMinutes = parseHHMMToMinutes(play.firstDrawTime);
    const lastMinutes = parseHHMMToMinutes(play.lastDrawTime);

    if (anchorMinutes === null || firstMinutes === null || lastMinutes === null) {
      throw AppException.badRequest("Giờ quay neo hoặc lịch quay hiện tại không hợp lệ.");
    }

    const drawsPerDay = computeDrawsPerDay(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
    const onGrid =
      drawsPerDay !== null &&
      anchorMinutes >= firstMinutes &&
      anchorMinutes <= lastMinutes &&
      (anchorMinutes - firstMinutes) % play.drawIntervalMinutes === 0;

    if (!onGrid) {
      throw AppException.badRequest(
        `Giờ quay neo (${vietlott.anchorDrawTime}) không nằm trên lưới quay hiện tại (${play.firstDrawTime} → ${play.lastDrawTime}, mỗi ${play.drawIntervalMinutes} phút).`,
      );
    }
  }
}
