import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Power 6/55 toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Jackpot settings (JP1/JP2 seed, contribution ratios, overflow threshold, split)
 * - Financial rates (commission, company rate)
 * - Prize amounts (tier1-3)
 * - Play rules (unit price, draw times, draw days, etc.)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends NextApiUseCase<
  UpdateGameConfigInput,
  UpdateGameConfigOutput
> {
  private readonly repo = new GameConfigRepository();

  /** @inheritdoc */
  protected async execute(
    input: UpdateGameConfigInput
  ): Promise<UpdateGameConfigOutput> {
    this.validateInput(input);
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
            ...(existing?.defaultPrizes ??
              DEFAULT_POWER655_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play
        ? { ...(existing?.play ?? DEFAULT_POWER655_CONFIG.play), ...input.play }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.jackpot) cleanMerged.jackpot = merged.jackpot;
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

  /**
   * Validate input fields trước khi merge.
   * Kiểm tra ranges cho rates, prizes, jackpot config.
   */
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
      for (const [key, value] of Object.entries(input.defaultPrizes)) {
        if (value !== undefined && (typeof value !== "number" || value < 0)) {
          throw AppException.badRequest(`Giải thưởng ${key} phải là số dương.`);
        }
      }
    }

    if (input.jackpot) {
      if (input.jackpot.jackpot1?.seedAmount !== undefined && input.jackpot.jackpot1.seedAmount < 0) {
        throw AppException.badRequest("JP1 seedAmount phải >= 0.");
      }
      if (input.jackpot.jackpot2?.seedAmount !== undefined && input.jackpot.jackpot2.seedAmount < 0) {
        throw AppException.badRequest("JP2 seedAmount phải >= 0.");
      }
      if (
        input.jackpot.jp1OverflowThreshold !== undefined &&
        input.jackpot.jp1OverflowThreshold < 0
      ) {
        throw AppException.badRequest("jp1OverflowThreshold phải >= 0.");
      }
      if (
        input.jackpot.splitThreshold !== undefined &&
        input.jackpot.splitThreshold < 0
      ) {
        throw AppException.badRequest("splitThreshold phải >= 0.");
      }
      if (
        input.jackpot.jp1ContributionRatio !== undefined &&
        (input.jackpot.jp1ContributionRatio < 0 || input.jackpot.jp1ContributionRatio > 1)
      ) {
        throw AppException.badRequest("jp1ContributionRatio phải trong range [0, 1].");
      }
      if (
        input.jackpot.jp2ContributionRatio !== undefined &&
        (input.jackpot.jp2ContributionRatio < 0 || input.jackpot.jp2ContributionRatio > 1)
      ) {
        throw AppException.badRequest("jp2ContributionRatio phải trong range [0, 1].");
      }
    }
  }
}
