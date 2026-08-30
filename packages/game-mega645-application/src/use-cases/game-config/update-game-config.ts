import { UseCase } from "@megawin/app-core/use-cases";
import type { Mega645OpsConfig, PlayRules, VietlottPeriodAnchor } from "@megawin/game-mega645/entities";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
import { AppException } from "@megawin/shared/errors";
import { dayOfWeek } from "@megawin/shared/utils";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

export class UpdateGameConfigUseCase extends UseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      jackpot: input.jackpot
        ? {
            ...(existing?.jackpot ?? DEFAULT_MEGA645_CONFIG.jackpot),
            ...input.jackpot,
          }
        : undefined,
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_MEGA645_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ?? DEFAULT_MEGA645_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play ? { ...(existing?.play ?? DEFAULT_MEGA645_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
      vietlott: input.vietlott ? { ...existing?.vietlott, ...input.vietlott } : undefined,
    };

    if (merged.vietlott) {
      this.validateVietlottAnchor(merged.vietlott, merged.play ?? existing?.play ?? DEFAULT_MEGA645_CONFIG.play);
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
  private mergeOps(existing: Mega645OpsConfig | undefined, input: UpdateOpsInput): Mega645OpsConfig {
    const base = existing ?? DEFAULT_MEGA645_CONFIG.ops;

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
   * Kiểm neo Vietlott khớp lịch quay HIỆN TẠI (từ DB, không phải default) — kiểu C:
   * `anchorDrawDate` phải là ngày quay (∈ `drawDaysOfWeek`) VÀ `anchorDrawTime` phải
   * bằng đúng `drawTime` (scalar, Mega645 chỉ có 1 giờ quay/ngày).
   */
  private validateVietlottAnchor(vietlott: Partial<VietlottPeriodAnchor>, play: PlayRules): void {
    if (!vietlott.anchorDrawDate || !vietlott.anchorDrawTime || !vietlott.anchorPeriod) {
      throw AppException.badRequest("Mã kỳ Vietlott phải nhập đủ 3 trường: ngày quay, giờ quay, mã kỳ.");
    }

    if (vietlott.anchorDrawTime !== play.drawTime) {
      throw AppException.badRequest(
        `Giờ quay neo (${vietlott.anchorDrawTime}) không khớp giờ quay hiện tại (${play.drawTime}).`,
      );
    }

    if (!play.drawDaysOfWeek.includes(dayOfWeek(vietlott.anchorDrawDate))) {
      throw AppException.badRequest(
        `Ngày neo (${vietlott.anchorDrawDate}) không phải ngày quay theo lịch hiện tại (thứ: ${play.drawDaysOfWeek.join(", ")}).`,
      );
    }
  }
}
