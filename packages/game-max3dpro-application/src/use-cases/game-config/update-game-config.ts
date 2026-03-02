import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Financial rates (commission, company rate)
 * - Prize amounts (standard)
 * - Play rules (unit price, draw times, drawDaysOfWeek, etc.)
 *
 * Max 3D Pro không có Jackpot tích lũy.
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends NextApiUseCase<
  UpdateGameConfigInput,
  UpdateGameConfigOutput
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(
    input: UpdateGameConfigInput
  ): Promise<UpdateGameConfigOutput> {
    this.validateInput(input);
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_MAX3D_PRO_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ??
              DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play
        ? {
            ...(existing?.play ?? DEFAULT_MAX3D_PRO_CONFIG.play),
            ...input.play,
          }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.defaultPrizes) cleanMerged.defaultPrizes = merged.defaultPrizes;
    if (merged.play) cleanMerged.play = merged.play;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật GameConfig thất bại.");
    }

    return {
      config: updated,
      version: updated.version,
    };
  }

  private validateInput(input: UpdateGameConfigInput): void {
    if (input.rates) {
      const { defaultCommissionRate, companyRate } = input.rates;

      if (
        defaultCommissionRate !== undefined &&
        (defaultCommissionRate < 0 || defaultCommissionRate > 1)
      ) {
        throw AppException.badRequest(
          "defaultCommissionRate phải trong range [0, 1]."
        );
      }

      if (companyRate !== undefined && (companyRate < 0 || companyRate > 1)) {
        throw AppException.badRequest("companyRate phải trong range [0, 1].");
      }
    }

    if (input.defaultPrizes) {
      const { standard } = input.defaultPrizes;

      if (standard) {
        for (const [key, value] of Object.entries(standard)) {
          if (value !== undefined && (typeof value !== "number" || value < 0)) {
            throw AppException.badRequest(
              `Giải thưởng standard.${key} phải là số dương.`
            );
          }
        }
      }
    }

    if (input.play?.drawDaysOfWeek) {
      for (const day of input.play.drawDaysOfWeek) {
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          throw AppException.badRequest(
            "drawDaysOfWeek phải là mảng số nguyên [0-6] (0=CN, 1=T2, ..., 6=T7)."
          );
        }
      }
    }
  }
}
